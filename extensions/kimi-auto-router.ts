/**
 * Kimi auto-router - a virtual model that plans on the session's model and
 * implements on kimi-for-coding/k3-256k.
 *
 * Registers `router/auto`:
 *
 * - Planning: stays on the physical model the session already used (no cache
 *   miss when switching to router/auto). Fallback: PI_AUTO_PLAN_MODEL
 *   ("provider/id" env var).
 * - On each user message, the Jev classifier judges whether the conversation
 *   moved from planning to implementation. Once it says yes, the session
 *   switches to kimi-coding/k3-256k for good (router state, survives
 *   compaction and forks) and the UI shows a notification.
 * - Without Jev credentials, the router falls back to a transcript signal:
 *   the first successful `edit`/`write` tool call of the turn marks the move
 *   to implementation.
 *
 * Continuations and retries stay on the model that handled the turn to keep
 * prompt caches valid; direct requests (compaction summaries, etc.) go to the
 * implementation model.
 *
 * Usage: pi -e ./kimi-auto-router.ts --model router/auto
 */

import type { Message } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext, ModelInfo, ModelRoute, ModelRouteRequest } from "@earendil-works/pi-coding-agent";

const TARGET_PROVIDER = "kimi-coding";
const TARGET_ID = "k3-256k";

/** Tools whose successful result means implementation has started. */
const EDIT_TOOLS = new Set(["edit", "write"]);

interface RouterState {
	phase: "planning" | "implementation";
}

type RouterRequest = ModelRouteRequest<RouterState>;

function targetModel(ctx: ExtensionContext): ModelInfo {
	const model = ctx.modelRegistry.find(TARGET_PROVIDER, TARGET_ID);
	if (!model) throw new Error(`${TARGET_PROVIDER}/${TARGET_ID} is not in the catalog`);
	return model;
}

/** Planning model: the physical model the session already used, or PI_AUTO_PLAN_MODEL. */
function planModel(request: RouterRequest, ctx: ExtensionContext): ModelInfo {
	if (request.previous) return request.previous.model;
	const env = process.env.PI_AUTO_PLAN_MODEL;
	if (env?.includes("/")) {
		const [provider, id] = env.split("/", 2);
		const model = ctx.modelRegistry.find(provider, id);
		if (model) return model;
	}
	throw new Error(
		"router/auto: no planning model. Select a model first, or set PI_AUTO_PLAN_MODEL=provider/id.",
	);
}

function textOf(message: Message | undefined): string {
	if (!message) return "";
	const content = message.content;
	if (typeof content === "string") return content;
	return content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("\n");
}

function lastTextByRole(messages: readonly Message[], role: "user" | "assistant"): string {
	return textOf(messages.filter((message) => message.role === role).at(-1)).slice(0, 16_000);
}

/** Whether a tool call since the last user message edited a file successfully. */
function editedThisTurn(messages: readonly Message[]): boolean {
	const lastUser = messages.findLastIndex((message) => message.role === "user");
	return messages
		.slice(lastUser + 1)
		.some((message) => message.role === "toolResult" && EDIT_TOOLS.has(message.toolName) && !message.isError);
}

/** Ask Jev whether the conversation moved from planning to implementation. */
async function movedToImplementation(request: RouterRequest, ctx: ExtensionContext): Promise<boolean> {
	const jev = ctx.modelRegistry.findOfType("classifier", "typesafe", "jev-latest");
	if (!jev) return editedThisTurn(request.messages);
	const result = await ctx.modelRegistry.classify(
		jev,
		{
			state: {
				lastUserMessage: lastTextByRole(request.messages, "user"),
				lastAssistantMessage: lastTextByRole(request.messages, "assistant"),
			},
			questions: {
				moved: {
					type: "bool",
					instructions:
						"Has the conversation moved from planning/design/discussion into implementation? " +
						"True when the work is now writing or editing code, running builds/tests, or executing " +
						"concrete steps. False while still deciding what to do.",
					criteria: {
						true: "Implementation has started or the latest request asks to start it",
						false: "Still planning, designing, or discussing",
					},
				},
			},
		},
		{ signal: request.signal },
	);
	if (result.stopReason !== "stop") return false;
	const answer = result.answers.moved;
	return answer?.type === "bool" && answer.probability >= 0.5;
}

export default function (pi: ExtensionAPI) {
	pi.registerVirtualModel<RouterState>({
		provider: "router",
		id: "auto",
		name: "Auto (plan → kimi)",
		thinkingLevels: ["low", "medium", "high"],
		async route(request, ctx) {
			if (request.reason === "direct") {
				return { model: targetModel(ctx), thinkingLevel: request.thinkingLevel };
			}

			const state = request.state ?? { phase: "planning" };
			if (state.phase === "implementation") {
				return { model: targetModel(ctx), thinkingLevel: request.thinkingLevel, state };
			}

			// Continuations and retries stay on the model that handled the turn.
			if (request.reason !== "user") {
				const sticky = request.failed ?? request.previous;
				if (sticky) {
					return {
						model: sticky.model,
						thinkingLevel: sticky.thinkingLevel ?? request.thinkingLevel,
						state,
					};
				}
			}

			if (await movedToImplementation(request, ctx)) {
				if (ctx.hasUI) {
					try {
						ctx.ui.notify(
							`Auto router: implementation detected — switching to ${TARGET_PROVIDER}/${TARGET_ID} for the rest of the session`,
							"info",
						);
					} catch {
						// Never let a notification break routing.
					}
				}
				return {
					model: targetModel(ctx),
					thinkingLevel: request.thinkingLevel,
					state: { phase: "implementation" },
				};
			}

			return { model: planModel(request, ctx), thinkingLevel: request.thinkingLevel, state };
		},
	});
}
