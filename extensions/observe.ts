/**
 * Observe Mode — 观察模式（M3，提案见 docs/proposals/observe-mode.md）
 *
 * /observe            切换观察模式（默认关）
 *
 * 开启后，每个含工具调用的 turn 边界暂停：
 * - 上方 widget 展示批次摘要（报幕叙述 + 工具清单 + codemode 嵌套展开）
 * - 对话框三选：继续（步进）/ 放行到结束 / 终止 run
 * - 对话框按 Esc 视为"继续"
 *
 * 无审批能力：不 block、不改参数（提案非目标）。
 * 机制依据 M2 验证：turn_end 每 turn 触发；其中 await ctx.ui.select 可阻塞下一请求。
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const WIDGET_KEY = "observe-summary";

let enabled = false;
let releaseRun = false;

function summarize(value: unknown, max = 90): string {
	try {
		const s = JSON.stringify(value) ?? "";
		return s.length > max ? s.slice(0, max - 1) + "…" : s;
	} catch {
		return "";
	}
}

interface ToolItem {
	name: string;
	args: string;
	nested?: string[];
}

/** 单行压缩（参数展示用） */
function oneLine(s: string, max = 100): string {
	const t = s.replace(/\s+/g, " ").trim();
	return t.length > max ? t.slice(0, max - 1) + "…" : t;
}

/** 按工具类型取最有信息量的参数字段，其余回退 JSON 摘要 */
function formatArgs(tool: string, input: unknown): string {
	const obj = input as Record<string, unknown> | undefined;
	switch (tool) {
		case "bash":
		case "powershell":
			return typeof obj?.command === "string" ? oneLine(obj.command) : summarize(input);
		case "read":
		case "edit":
		case "write":
			return typeof obj?.path === "string" ? String(obj.path) : summarize(input);
		default:
			return summarize(input);
	}
}

function extractBatch(message: unknown): { narration: string; tools: ToolItem[] } {
	const narrationParts: string[] = [];
	const tools: ToolItem[] = [];
	const content = (message as { content?: unknown } | undefined)?.content;
	if (Array.isArray(content)) {
		for (const part of content as Array<Record<string, unknown>>) {
			if (part.type === "text" && typeof part.text === "string") {
				narrationParts.push(part.text);
			} else if (part.type === "toolCall") {
				tools.push({
					name: String(part.name ?? "?"),
					args: formatArgs(String(part.name ?? ""), part.arguments),
					id: String(part.id ?? ""),
				} as ToolItem);
			}
		}
	}
	return { narration: narrationParts.join(" ").trim(), tools };
}

/** 从 toolResults 里提取 codemode 的嵌套调用名 */
function attachNested(event: unknown, tools: ToolItem[]) {
	const results = (event as { toolResults?: unknown }).toolResults;
	if (!Array.isArray(results)) return;
	for (const r of results as Array<Record<string, unknown>>) {
		const nested = (r as { nestedCalls?: { calls?: Array<{ name?: string }> } }).nestedCalls?.calls;
		if (!Array.isArray(nested)) continue;
		const owner = tools.find((t) => (r as { toolCallId?: string }).toolCallId === (t as { id?: string }).id);
		if (owner) {
			owner.nested = nested.map((c) => String(c.name ?? "?"));
		}
	}
}

function buildLines(turnIndex: number, narration: string, tools: ToolItem[]): string[] {
	const step = turnIndex + 1; // 事件零索引，界面从一计
	const lines: string[] = [`── Observe · step ${step} ──`];
	if (narration) {
		lines.push(narration);
		lines.push("");
	}
	lines.push(`工具 ${tools.length} 个:`);
	for (const t of tools.slice(0, 8)) {
		lines.push(`  • ${t.name}  ${t.args}`);
		if (t.nested && t.nested.length > 0) {
			const names = t.nested.slice(0, 8).join(", ") + (t.nested.length > 8 ? ` …共${t.nested.length}个` : "");
			lines.push(`    └─ 内部: ${names}`);
		}
	}
	if (tools.length > 8) lines.push(`  …还有 ${tools.length - 8} 个`);
	lines.push("");
	lines.push("继续=步进 · 放行=到 run 结束 · Esc=继续");
	return lines;
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("observe", {
		description: "Toggle observe mode (pause at each tool-turn boundary)",
		handler: async (_args, ctx) => {
			enabled = !enabled;
			releaseRun = false;
			ctx.ui.notify(`observe: ${enabled ? "开 · 每个含工具的 turn 边界暂停" : "关"}`, "info");
		},
	});

	pi.on("before_agent_start", async () => {
		releaseRun = false; // 新 run 重新步进
	});

	pi.on("turn_end", async (event, ctx) => {
		if (!enabled || !ctx.hasUI || ctx.mode !== "tui") return;
		if (releaseRun) return;

		const { narration, tools } = extractBatch((event as { message?: unknown }).message);
		if (tools.length === 0) return; // 纯文字 turn：run 即将自然结束，无需暂停

		attachNested(event, tools);

		const turnIndex = (event as { turnIndex?: number }).turnIndex ?? 0;
		ctx.ui.setWidget(WIDGET_KEY, buildLines(turnIndex, narration, tools), { placement: "aboveEditor" });
		try {
			const choice = await ctx.ui.select(`Observe · step ${turnIndex + 1} · ${tools.length} 个工具`, ["继续", "放行到结束", "终止"]);
			if (choice === "放行到结束") releaseRun = true;
			else if (choice === "终止") ctx.abort();
			// 继续 / undefined(Esc) → 单步放行
		} finally {
			ctx.ui.setWidget(WIDGET_KEY, undefined);
		}
	});
}
