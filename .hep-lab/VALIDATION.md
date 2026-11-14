# 工作区验收

## /home/admin/work/hep-lab 验收记录

2026-11-13，在 `/home/admin/work/hep-lab` 的真实控制仓及四个独立子仓执行。控制仓来源为 `git@github.com:wr5912/hep-lab.git`，分支为 `main`。当前四仓程序提交以 `.hep-lab/sources.json` 为准。

| 范围 | 执行与结果 |
| --- | --- |
| 管理 HOME 上下文 | `tools/hep-lab-space` 优先使用本地 `AGENTS.override.md`；缺失时使用版本化 `README.md`。 |
| 工作区单测 | `node --test tools/test/*.test.mjs`：17 项通过，覆盖管理 HOME 冷启动、来源远端名称和仓库更新工具的展示、快进、dirty 与 detached 保护；`git diff --check` 通过。 |
| 仓库更新工具 | `tools/hep-lab-repos show --json` 展示五个仓库的 remote、分支、提交和 dirty 状态；本地 `business-agents` 保留 GitHub `origin`，补充匹配来源清单的 `gitlab` remote；`pull` 使用 `fetch --prune` 与 `merge --ff-only`，不切换或重置工作树。 |
| 真实工作区初始化 | `tools/hep-lab-space init` 完成；3 个已有子仓提交与 `.hep-lab/sources.json` 锁定提交不同，工具保留现有工作树并给出警告，没有覆盖或切换。 |
| 真实上下文与边界 | `tools/hep-lab-space verify --fast`、`doctor` 均通过；`manager-workspace/` 内含 data 与 business-agents 两个真实独立 Git 工作树，无仓库目录链接；根仓没有 gitlink、`.gitmodules` 或子仓文件入索引，四个子仓均 clean。 |
| 当前整改验证 | 平台 `platform/hep`、Agent CLI help、MCP catalog/show/validate 与 clean archive `dsh-deploy --help` 通过；业务 child guard 2/2、业务资产校验 22/22、MCP 当前清单 2/2；业务当前 `evaluation.md` 已迁入 business-agents，平台评测读取、固定来源物化和跨仓 Run provenance 定向回归通过；本地 Mock MCP 完成 discovery/tools/list/tool call，远端独立包完成 status、checksum、修改资产重启回读。平台完整启动受远端 Node/磁盘与数据初始化条件限制。 |

本轮整改提交为：platform `a7ada28293505f807eba655e1b262fb65451eeab`，data `55013f5249b45659b6cd551d965a600724644d25`，platform-manager-dsh-home `2b4d16a5d76f7e965c63c18c8a5da2611974a57b`，business-agents `1f7743aacd34b9f48d12583f8fe9ca99606ffd96`；四个提交均已推送各自 `origin/main`。新增 `config/assistant-workspace.json` 固定 data + business-agents 业务范围，使用真实 `manager-workspace/` 作为默认 cwd并由工作区工具自动创建/校验；平台 context/status 返回该范围并拒绝程序仓和管理 HOME 作为业务目标；工作区工具测试 19/19、平台初始化测试 23/23、助手与首页相关测试 148/148、启动器测试 48/48 通过，TypeScript 检查与实际构建通过。

2026-11-14，平台在真实新目录完成离线 prepare 与启动。已认证 HTTP/RPC 新建的原生会话 cwd 为 `/home/admin/work/hep-lab/manager-workspace`；真实模型调用 `platform_agents context`、Skill 和原生 `bash`，确认两个仓库各自的 `.git` 并正常结束。旧会话激活后通过原生 `working-directory/change` 使用新数据根，原始 header cwd 保留。锁定 DSH 的指令发现只返回管理 HOME 的 AGENTS.md。原始执行证据保存在程序仓忽略目录 `.local/acceptance/physical-manager-workspace/`。

## /home/luopeng/hep-lab 验收记录

2026-11-13 UTC，在 `/home/luopeng/hep-lab` 的真实控制仓及四个独立子仓执行。

| 范围 | 执行与结果 |
|---|---|
| 工作区工具 | `node --test tools/test/*.test.mjs`：15 项通过。覆盖管理 HOME 冷启动、固定提交克隆、失败恢复、完整包及执行权限、两种物化模式、幂等、来源漂移、人工修改保留、删除和恢复、任意 cwd、Git 边界、五仓状态及 `gitlab` 远端的来源识别。 |
| 远端重建 | 从已推送的控制仓全新克隆，按四仓固定提交完成初始化；重复 `init` 无变化。链接模式、完整复制、重复复制和切回链接均验证通过。 |
| 版本兼容 | 各仓统一要求 Node.js 24.9+、Python 3.10+。Node.js 24.9 实跑工作区工具 13 项及初始化服务 7 项测试；Python 3.10 实跑程序与管理 HOME 的 Skill 检查器 10 项、47 项测试，业务资产工具 3 项测试；业务插件构建检查通过。 |
| 平台初始化器 | `node --test platform/lab/test/*.test.mjs`：20 项通过，包括控制仓上下文与运行清单共存、HTTP 来源及任意远端名称的复用。独立入口的固定版本下载与 SHA256 摘要核对通过。 |
| 平台插件 | 全量 1861 项通过、1 项条件跳过；构建与类型检查通过。容器浏览器套件另行实测 3 项通过、无跳过。 |
| 启动与部署 | 部署套件 184 项、升级 30 项、原生工具准入 6 项通过；真实 amd64 在线包完成安装、资产更新、运行时更新和重启，HOME 为 `/var/lib/dsh`，会话保留。 |
| 管理助手工具 | `python3 -m unittest discover -s .agents/skills/kev-training/scripts/tests`：74 项通过。迁移的 44 个上游文件与迁移前逐字节一致，三份来源清单的文件摘要和许可证一致。 |
| 业务资产 | `python3 tools/check_agents.py`：22 个智能体、22 份 Harness、486 个文件，零错误。保持扁平目录及原生文件配置。 |
| 业务回归 | `npm run check:build` 通过；设置 `HARNESS_PROGRAM_ROOT` 后，88 项 Node 测试全部通过、无跳过，两组 UI 检查及 17 项 Python 测试通过。 |
| 通知交互 | 业务仓 `3ad3448` 的 UI 类型检查、构建及专项测试通过。真实 Chrome 与独立实例的原生 DSH 输入框验证追加草稿、保留原文、重复展开去重、清空后三秒重填及最新完成状态抑制旧通知；仅通知接口使用受控数据，未向 SOC 发起研判。 |
| 原生技能发现 | Codex app-server 的 `skills/list`：控制仓 3、程序仓 7、数据仓 0、管理 HOME 24、业务仓 0，无发现错误。上游参考中的技能不重复注册。DSH 仍装载 HOME 的 24 个技能及 5 个系统技能。 |
| Codex 实际任务 | 两个显式技能调用、两个隐式触发、一个计算负例、一个跨仓 MCP 路由、四个子仓独立上下文，共十项完成。隐式治理审查初次超时，明确两仓审查入口范围后，以当前文件重新执行通过；不据单次样例推断触发率。 |
| 管理助手实际效果 | 原生 DSH 新会话使用 deepseek-flash，读取 HOME 身份、训练及 MCP 组合方法和迁移后的上游资源；正确说明程序、数据、业务 Harness 和管理方法的四仓归属，工具执行成功且任务队列结束。 |
| 管理页面 | 真实 Chrome 访问首页、管理对话、智能体管理、评测中心、实例管理、统一网关和 MCP 管理，七个入口无页面异常。 |

控制仓只跟踪上下文、共享开发技能、来源清单和工具，四个子仓由根 `.gitignore` 排除，不使用 gitlink 或 `.gitmodules`。管理 HOME 用 `AGENTS.override.md` 提供 Codex 开发身份，DSH 继续使用 `AGENTS.md` 的运行身份。运行配置与研究记录归数据仓；管理及业务 Harness 均保持文件形式。

来源配置使用 JSON，工具仅依赖 Node.js 与 Git。本地 manifest 记录实际提交、dirty、包摘要及物化模式，路径和运行清单不提交；上下文正文由各仓维护，初始化不改写子仓指令。共享开发技能只保留三个，按实际职责划分，不按建议数量增加空壳技能。

原生 MCP 部署链路另已实测：平台 LFX 1.13.1 上传返回 201、执行返回 200；Qwen3.8-27B 通过原生 MCP 发起基线巡检、读取进度与报告，平台不可达时普通对话仍可用。平台 SDK 读取四类报告产物成功，独立部署页面可查看报告卡片。巡检结果为 `NO_DATA`，表示 SOC 缺少基线采集数据，不能据此认定业务检查通过。实测范围与限制见[部署验收证据](../manager-workspace/harness-engineering-platform-data/evolution/experiments/EXP-security-operations-expert-027-f-re15213a3c7d9/evaluation/evidence/native-mcp-boundary-20261113.json)。

未对生产环境执行应急动作、策略修改或设备写入，也未覆盖离线安装、其他 CPU 架构及每个业务流程。冷启动异步发现曾短暂出现 `UNKNOWN_TOOL`，发现完成后同一原生会话走通巡检；本轮模型长会话约八分钟，不代表延迟达标。

原始命令输出、Codex 事件、DSH 会话回执和浏览器结果保存在本机忽略目录 `.hep-lab/evidence/` 与程序仓 `.local/acceptance/`，不随源码发布。
