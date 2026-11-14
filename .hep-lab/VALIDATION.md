# 工作区当前验证

时间：2026-11-14

本记录只描述当前五仓工作区及已实际执行的检查；未通过或受环境阻断的路径明确保留为未验收。

| 仓库 | 当前提交 |
|---|---|
| hep-lab | `7196c7290a47b42c3f0edaeb2a1775b49bab3c0d` |
| harness-engineering-platform | `252941b2dda3f0d6ec814acc04a8094dc17b33cc` |
| harness-engineering-platform-data | `6d92d1b80006f2d2decad0ec5887236f9f774f9c` |
| platform-manager-dsh-home | `d3dcf01b79e6406359df8f36f6ab6a2a1e71a1db` |
| business-agents | `cfe0e3b151c2e2843db0df79ffe2932c0af599ca` |

## 已通过

- 根仓 `node --test tools/test/*.test.mjs`：24/24。
- business-agents checker：23/23 Agent、562 个可装载文件；业务来源 Python 测试按仓库指引执行。
- data `validate_sources.py`：23 个来源全部固定到业务提交 `cfe0e3b151c2e2843db0df79ffe2932c0af599ca`；`validate_catalog.py` 通过；旧 `experiment:` 与 `evolution/experiments` 输入不再被接受。
- 平台 TypeScript 检查、Python 编译、strict source 测试 3/3、模型投影测试 14/14。
- 无助手原生 RPC：登录、会话、平台/业务 Agent 目录、实例列表、来源、模型、MCP、评测/Run 读取、事件和错误边界均完成直接核验；当前 inventory 为 23 个 Agent、实验 0、实例 0、MCP 8 连接/4 工具。
- AI 助手真实 MiMo 调用：普通问答和平台/业务只读路径已完成；最新实测 `session-caa212cf-3ad9-4a6b-847b-a8d2d9dbec9f`，`turns=1`、`llmMs=2685`、`ttftMs=1822`，模型为 `xiaomi-token-plan-cn/mimo-v2.6-flash`，回复 `ASSISTANT_MIMO_LIVE_OK`。
- 模型目录已包含 `xiaomi-token-plan-cn/mimo-v2.6-flash`，业务 readiness 为 `ready`；凭据只在本机 0600 文件中，未进入 Git。
- 旧 `experiment:` 来源在助手和原生实例入口均拒绝且不产生写入；业务来源合同已固定为 `business:<agent-id>[@<commit>]`。
- `evolution/` 仅保留 `runs`、`evidence`、`decisions` 作为运行评测数据边界；历史实验、重复 Agent、旧报告和旧可视化生成物已清除。

## 未验收或环境阻断

- 业务实例预览已通过来源身份和模型目录校验，当前唯一阻断是业务 Harness 的 Node 依赖尚无与锁定 Runtime 指纹匹配的标准依赖回执；本机标准镜像构建受上游 Git/APT 网络阻断，未放宽校验、未创建容器。
- 因此业务 Agent 容器、真实业务 MCP、外部系统写入、完整业务 Run/summary/effect 不能宣称通过；当前 Docker 无业务实例容器。
- 全量历史平台套件仍含已删除旧路径 fixture，不能把旧 fixture 失败解释为恢复旧兼容；业务仓 Node 构建和真实业务外部系统写入仍需具备标准 Runtime/依赖回执后复验。
- 远端 `root@47.109.184.146` 曾核对可 SSH、Docker 和既有 standalone 进程，但该环境没有五仓业务工作区；尝试构建时因远端资源/SSH banner 超时中止，随后 SSH 持续超时且 `:18680/assistant/` 返回 502。未修改其未提交工作树，也未宣称远端部署生效。
