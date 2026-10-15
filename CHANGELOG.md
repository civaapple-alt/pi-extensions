# Changelog

遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 格式，版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [0.4.0] - 2026-10-15

### Changed (observe)

- 信息流模式重构：`message_end` 暂存摘要、首个 `tool_call` 时落账——摘要现在位于**报幕/工具调用与工具执行结果之间**（原先在 turn_end 落账，出现在工具块下方）；不进入模型上下文（custom entry + renderer）
- 新增 `PI_OBSERVE=off|pause|stream` 环境变量，可指定初始模式（调试/固定偏好）

## [0.3.0] - 2026-10-15

### Added (observe)

- 信息流模式：`/observe` 改为三态循环（关 → 步进 → 信息流 → 关）；信息流模式不暂停不弹窗，将批次摘要作为消息条目写入对话流，供事后翻阅

## [0.2.1] - 2026-10-15

### Docs

- 添加 CHANGELOG（Keep a Changelog 格式）

## [0.2.0] - 2026-10-15

### Changed (observe)

- 批次摘要的参数展示按工具类型格式化：bash/powershell 显示 `command` 单行摘要，read/edit/write 显示 `path`，其余工具回退 JSON 摘要
- 界面计数从 `turn 0` 改为 `step N`（从 1 开始，更友好）

## [0.1.0] - 2026-10-14

### Added

- **observe**：观察模式。每个含工具调用的 turn 边界暂停，展示批次摘要（报幕叙述 + 工具清单 + codemode 嵌套展开），三选交互（继续 / 放行到结束 / 终止）。详见 [Observe Mode 提案](https://github.com/civaapple-alt/pi-custom)（设计文档在 pi-custom 仓库 `docs/proposals/observe-mode.md`）
- **kimi-auto-router**：虚拟模型 `router/auto`，规划阶段留在当前模型保持缓存命中，Jev 分类器判定进入实现后自动切换到 `kimi-coding/k3-256k`
- **probe**：事件探针（开发工具）。`PI_PROBE=1` 启动时把 agent 事件流写入日志，`/probe dialog` 可测试 turn 边界阻塞对话框

[0.4.0]: https://github.com/civaapple-alt/pi-extensions/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/civaapple-alt/pi-extensions/compare/v0.2.1...v0.3.0
[0.2.0]: https://github.com/civaapple-alt/pi-extensions/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/civaapple-alt/pi-extensions/releases/tag/v0.1.0
