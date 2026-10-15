# pi-extensions

个人 pi coding agent 扩展集，整仓即一个 [pi package](https://pi.dev/packages)。

## 安装

```bash
pi install git:github.com/civaapple-alt/pi-extensions
```

> 注意：若 `~/.pi/agent/extensions/` 下已存在同名扩展文件，请先移除，避免命令重复注册。

### 只想要其中某一个？

`pi install` 的单位是整个包（三个扩展一起装），但有三种做法：

1. **`pi config` 逐个禁用**（推荐）：装完运行 `pi config`，找到 pi-extensions 段，空格取消不想要的扩展
2. **默认都不扰民**：observe 需 `/observe` 开启、probe 需 `PI_PROBE=1` 启动、router 是不选就不生效的虚拟模型——全装也零影响，除非主动启用
3. **本地单文件安装**：`pi install ./pi-extensions/extensions/observe.ts`（文件路径=只装这一个）

## pi 的扩展加载渠道与目录结构

### 三种加载渠道（`pi config` 按此分组）

| 渠道 | 位置/声明 | `pi config` 组名 |
|---|---|---|
| 散装文件 | `~/.pi/agent/extensions/` 下的 .ts/.js，自动发现 | `User (~/.pi/agent/)` |
| 包 | settings.json 的 `packages` 数组（npm/git/本地） | `npm:xxx` / `git:xxx` |
| 显式配置 | settings.json 的 `extensions` 数组 | 按来源标注 |

散装与包可能同时存在；同名资源会 collision 警告，装包前应清理散装文件。

### git 源安装后的目录结构

以本包为例，`pi install git:github.com/civaapple-alt/pi-extensions` 后：

```
~/.pi/agent/
├── git/github.com/civaapple-alt/pi-extensions/     # git 克隆缓存（带 remote，用于 fetch 更新）
├── tmp/extensions/git-github.com/0c514c46/         # 实际加载的副本，目录名 = 锁定的 commit 短哈希
│   └── civaapple-alt/pi-extensions/
├── extensions/                                      # 散装扩展目录（渠道 1）
└── settings.json                                    # packages 声明: ["git:github.com/civaapple-alt/pi-extensions"]
```

**pi 永远加载 `tmp/<hash>/` 下的副本**，且 git 源会 pinned 到安装时的 commit——远程 main 推了新提交，不执行 `pi update` 就仍跑旧版本（可复现特性）。

### 更新流程

```
改本地工作副本 → commit → push 远程
→ pi update --extensions
   ├─ git/ 目录 fetch 拿到新 commit
   └─ tmp/ 出现新哈希目录，加载切换到新版本（旧目录由 pi 清理）
```

开发期想立即试本地改动、不走 push：

```bash
pi -e ./pi-extensions    # 一次性从本地路径加载，不写入 settings
```

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
