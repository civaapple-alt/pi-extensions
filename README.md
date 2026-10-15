# pi-extensions

个人 pi coding agent 扩展集，整仓即一个 [pi package](https://pi.dev/packages)。

## 安装

```bash
pi install git:github.com/civaapple-alt/pi-extensions
```

> 注意：若 `~/.pi/agent/extensions/` 下已存在同名扩展文件，请先移除，避免命令重复注册。

## 扩展一览

### observe — 观察模式

在每个含工具调用的 turn 边界暂停，展示批次摘要（报幕叙述 + 工具清单 + codemode 嵌套展开），人工节奏步进跟随 agent 执行。

```
/observe            # 切换开关（默认关）
```

暂停时三选：**继续**（步进到下一 turn）/ **放行到结束**（本 run 不再暂停）/ **终止**（停止整个 run）。Esc 视同继续。

- 设计文档与开发历程见本地仓库的 `docs/proposals/observe-mode.md`（Observe Mode 提案）
- 依赖报幕约定：建议配合 `~/.pi/AGENTS.md` 的"执行报幕"指南使用（摘要的叙述行来自模型的报幕输出）

### kimi-auto-router — Kimi 模型自动路由

虚拟模型 `router/auto`：会话前期留在当前物理模型做规划（保持缓存命中），Jev 分类器判断进入实现阶段后自动切换到 `kimi-coding/k3-256k`，之后固定。

- 无 Jev 凭据时退化为 transcript 信号：本 turn 首次成功的 `edit`/`write` 调用即视为进入实现阶段

### probe — 事件探针（开发工具）

以 `PI_PROBE=1` 启动 pi 时，把 `before_agent_start / tool_call / tool_execution_* / tool_result / turn_end / agent_before_settle` 事件流写入 `~/.pi/agent/probe-events.jsonl`，用于扩展开发的时序调研。

```
/probe              # 查看状态（含 args 回显）
/probe dialog       # 开启 turn_end 阻塞对话框测试
```

平时零开销（env 门控）；交互会话中 `/probe dialog` 的测试结果不受 env 门控，始终写日志。

## 开发

```bash
pi -e ./pi-extensions    # 本地试装一次，不写入 settings
```

改完扩展后在 pi 中 `/reload` 生效。
