# hep-lab 工作区

本仓库维护五仓工作区（控制仓 + 四个子仓）的初始化、研发上下文和共享开发 Skill，不包含子仓源码。默认中文；在真实工作树中完成修改、验证和提交。

| 仓库 | 当前事实源 |
| --- | --- |
| harness-engineering-platform | 平台程序、MCP 框架与执行器、通用 CLI、Runtime 适配器及平台测试 |
| harness-engineering-platform-data | Agent 来源登记、当前评测运行数据、实例状态、用户配置的 MCP 服务与组合编排 |
| platform-manager-dsh-home | 管理助手原生 DSH HOME：身份、Skill、Preset、Profile 及 MCP 使用与开发方法 |
| business-agents | 业务智能体策划设计、需求、验收标准与原生 Harness 文件，含各自 DSH MCP 配置 |

进入子仓先读其研发指引；Git 仓库边界会影响 Codex 的上下文发现，不能假设从子仓启动时自动继承本文件。管理助手 HOME 若提供 `AGENTS.override.md`，它用于研发协作；全新检出没有该本地覆盖文件时，以该仓库的 `README.md` 和本文件的工作区边界为准。阅读业务指令不代表切换开发身份。

先定位唯一事实源，再修改实现和直接消费者。业务设计、需求、验收标准和当前 Harness 统一位于 `manager-workspace/business-agents/agents/<id>/`；数据仓只保存来源登记、当前评测运行数据、实例状态和运行配置。旧 Experiment/Candidate 资产不作为当前输入。所有资产保持文件形式，不存数据库；不添加多余包装层或逐智能体研发说明。复用 DSH 原生装载与执行能力。
平台管理助手只绑定 `manager-workspace/` 一个原生工作区，普通新建管理会话的初始 cwd 使用该目录；其中 `harness-engineering-platform-data/` 和 `business-agents/` 是真实、独立的 Git 工作树，不使用目录链接。业务范围由数据仓 `config/assistant-workspace.json` 定义；harness-engineering-platform 仅作工具实现来源，platform-manager-dsh-home 仅作运行身份与 Skill/Profile 来源。`manager-workspace/.manager-workspace` 用于 DSH 原生项目根发现，管理身份仍从 HOME 装载。

工作区入口为 `tools/hep-lab-space`：`init` 准备四个子仓，`sync` 物化允许的共享 Skill，`diff` 查看漂移，`verify --fast` 核对五仓锁和上下文，`doctor` 定位环境问题。共享 Skill 源码位于 `skills/`，清单位于 `.hep-lab/sources.json`；生成的 `.agents/skills/` 不直接编辑。平台完整运行检查仍用程序仓的 `platform/hep-lab doctor`。

`./tools/hep-lab-repos status` 一次查看控制仓和四个子仓的本地 Git 状态；`--json` 输出结构化结果。`pull` 更新五仓，`pull --dry-run` 预览更新。

五仓提交、镜像和配置摘要统一锁在 `.hep-lab/workspace.lock.yaml`；来源地址与 Skill 清单仍在 `sources.json`。统一打包使用 `tools/hep-lab package`，只委托程序仓 `platform/dsh-deploy`；环境配置唯一来源为数据仓 `config/deployment.yaml`，发布产物写入忽略的 `.hep-lab/releases/<id>/`。

已授权的工作连续完成。验证受影响的实际路径，区分静态检查、模拟、真实模型和外部系统结果；不把临时测试副本称为真实仓库修复。只在当前功能需要时增加检查，不引入审批或生产治理框架。提交前核对各仓 diff；推送按用户授权执行。

五仓提交说明遵循同一合同：标题写明动作和对象，正文简要说明新增特性或修复的问题表现、根因、影响范围及关键验证结果；跨仓变更还要注明各仓职责、提交依赖和未验证边界。禁止只写“更新代码”“修复问题”等无法说明内容的泛化备注。提交前逐仓检查暂存 diff，推送后核对各仓 `main` 的远端 SHA。
