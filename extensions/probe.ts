/**
 * M2 探针：观察模式可行性验证（临时扩展，验证完可删）
 *
 * 用法：
 *   PI_PROBE=1 pi ...            # 记录所有相关事件到 ~/.pi/agent/probe-events.jsonl
 *   /probe dialog                # 交互会话中开启 turn_end 阻塞对话框测试
 *   /probe status                # 查看探针状态
 *
 * 验证目标（见 docs/proposals/observe-mode.md M2）：
 *   1. turn_end / agent_before_settle 的触发时机（是否每个 API 请求间都触发）
 *   2. 运行中弹 ctx.ui.select 阻塞对话框是否可行
 *   3. codemode 嵌套调用的事件流形态（parentToolCallId、时序、payload）
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const LOG_FILE = path.join(os.homedir(), ".pi", "agent", "probe-events.jsonl");
const ENABLED = process.env.PI_PROBE === "1";

let dialogOn = false;

function log(event: string, data: Record<string, unknown>) {
	if (!ENABLED) return;
	writeLine(event, data);
}

/** 对话框测试结果不受 env 门控，保证交互会话也能记录 */
function dialogLog(event: string, data: Record<string, unknown>) {
	writeLine(event, data);
}

function writeLine(event: string, data: Record<string, unknown>) {
	const line = JSON.stringify({ ts: Date.now(), event, ...data });
	try {
		fs.appendFileSync(LOG_FILE, line + "\n");
	} catch {
		/* ignore */
	}
}

function summarize(input: unknown): string {
	const s = JSON.stringify(input);
	if (!s) return "";
	return s.length > 160 ? s.slice(0, 157) + "..." : s;
}

export default function (pi: ExtensionAPI) {
	if (ENABLED) {
		try {
			fs.appendFileSync(LOG_FILE, JSON.stringify({ ts: Date.now(), event: "probe_start", mode: "load" }) + "\n");
		} catch {
			/* ignore */
		}

		pi.on("before_agent_start", async (event, ctx) => {
			log("before_agent_start", { mode: ctx.mode, prompt: summarize((event as { prompt?: unknown }).prompt) });
		});

		pi.on("tool_call", async (event) => {
			log("tool_call", {
				tool: event.toolName,
				id: event.toolCallId,
				parent: event.parentToolCallId ?? null,
				input: summarize((event as { input?: unknown }).input),
			});
		});

		pi.on("tool_execution_start", async (event) => {
			log("tool_execution_start", {
				tool: event.toolName,
				id: event.toolCallId,
				parent: event.parentToolCallId ?? null,
			});
		});

		pi.on("tool_execution_end", async (event) => {
			log("tool_execution_end", {
				tool: event.toolName,
				id: event.toolCallId,
				parent: event.parentToolCallId ?? null,
				error: (event as { isError?: boolean }).isError ?? false,
			});
		});

		pi.on("tool_result", async (event) => {
			log("tool_result", {
				tool: event.toolName,
				id: event.toolCallId,
				parent: event.parentToolCallId ?? null,
			});
		});

		pi.on("turn_end", async (event, ctx) => {
			log("turn_end", { mode: ctx.mode, keys: Object.keys(event ?? {}) });
			if (dialogOn && ctx.hasUI) {
				dialogLog("dialog_attempt", { at: "turn_end" });
				try {
					const choice = await ctx.ui.select("探针: turn 边界暂停测试", ["继续", "终止观察"]);
					dialogLog("dialog_result", { choice: choice ?? "(cancelled)" });
				} catch (err) {
					dialogLog("dialog_error", { message: err instanceof Error ? err.message : String(err) });
				}
			}
		});

		pi.on("agent_before_settle", async (event, ctx) => {
			log("agent_before_settle", { mode: ctx.mode, keys: Object.keys(event ?? {}) });
		});
	}

	pi.registerCommand("probe", {
		description: "M2 probe: status / dialog toggle (see probe-events.jsonl)",
		handler: async (args, ctx) => {
			const a = args.trim();
			if (a === "dialog") {
				dialogOn = !dialogOn;
				ctx.ui.notify(`探针对话框测试: ${dialogOn ? "开" : "关"}（turn_end 处弹窗）`, "info");
			} else {
				ctx.ui.notify(
					`probe: args=<${args}> env日志=${ENABLED ? "开" : "关"}(需 PI_PROBE=1 启动) 对话框=${dialogOn ? "开" : "关"} 日志=~/.pi/agent/probe-events.jsonl`,
					"info",
				);
			}
		},
	});
}
