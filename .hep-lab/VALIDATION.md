# 工作区验收

## 本次整改核验

2026-11-13，在 `/home/admin/work/hep-lab` 的真实控制仓及四个既有独立子仓执行。根仓此前没有 `.git`，本次已恢复为 `git@github.com:wr5912/hep-lab.git` 的 `main` 工作树；没有切换、重置或清理任何子仓。

| 范围 | 执行与结果 |
| --- | --- |
| 上下文与投影修复 | `tools/hep-lab-space` 不再把管理 HOME 的本地 `AGENTS.override.md` 当作全新检出的硬依赖；文件存在时优先使用，缺失时回退到版本化 `README.md`。 |
| 工作区单测 | `node --test tools/test/*.test.mjs tools/test/repositories.test.mjs`：16 项通过，覆盖管理 HOME 冷启动和仓库更新工具的展示、快进、dirty 与 detached 保护；`git diff --check` 通过。 |
| 仓库更新工具 | `tools/hep-lab-repos show --json` 正确展示五个仓库的 remote、分支、提交和 dirty 状态；`pull` 使用 `fetch --prune` 与 `merge --ff-only`，不切换或重置工作树。 |
| 真实工作区初始化 | `tools/hep-lab-space init` 完成；3 个已有子仓提交与 `.hep-lab/sources.json` 锁定提交不同，工具保留现有工作树并给出警告，没有覆盖或切换。 |
| 真实上下文与边界 | `tools/hep-lab-space verify --fast`、`tools/hep-lab-space doctor` 均通过；四个子仓均 clean，根仓没有 gitlink、`.gitmodules` 或子仓文件入索引。 |
| 业务与平台效果 | 本次没有重新启动平台、执行真实业务 Run、浏览器验收或外部服务测试；这些层次仍以对应程序仓验收矩阵为准。 |

当前实际子仓提交为：platform `c87b5d47906953cfdaaac199e5274d546a45ba02`，data `34e0250ce621fde03777b70d9c852b2bf8e7efd7`，platform-manager-dsh-home `bde8e558fb54d48adbcb6e66554d0da8d4b0b895`，business-agents `3fe1f553b4e08162e12ed77b3faa09a7b0e1e53f`。data、platform-manager-dsh-home 和 business-agents 的本地提交没有写回来源锁定；如需升级锁定版本，应先在各子仓确认可从远端干净检出，再单独更新 `.hep-lab/sources.json`。

以下为此前在其他工作树完成的历史验收记录，保留作为历史证据，不替代本次现场结果。

2026-11-13 UTC，在 `/home/luopeng/hep-lab` 的真实控制仓及四个独立子仓执行。

| 范围 | 执行与结果 |
|---|---|
| 工作区工具 | `node --test tools/test/*.test.mjs`：13 项通过。覆盖固定提交克隆、失败恢复、完整包及执行权限、两种物化模式、幂等、来源漂移、人工修改保留、删除和恢复、任意 cwd、Git 边界及五仓状态。 |
| 远端重建 | 从已推送的控制仓全新克隆，按四仓固定提交完成初始化；重复 `init` 无变化。链接模式、完整复制、重复复制和切回链接均验证通过。 |
| 版本兼容 | 各仓统一要求 Node.js 24.9+、Python 3.10+。Node.js 24.9 实跑工作区工具 13 项及初始化服务 7 项测试；Python 3.10 实跑程序与管理 HOME 的 Skill 检查器 10 项、47 项测试，业务资产工具 3 项测试；业务插件构建检查通过。 |
| 平台初始化器 | `node --test platform/lab/test/*.test.mjs`：19 项通过，包括控制仓上下文与运行清单共存。 |
| 平台插件 | 全量 1868 项通过、1 项条件跳过；构建与类型检查通过。跳过项依赖独立容器浏览器环境，本轮不计为通过。 |
| 启动与部署 | Python 启动器 46 项通过；安装与增量更新 44 项、生命周期 8 项通过。Skill 路径断言使用管理 HOME，迁移恢复后继续从对应 HOME 发现技能。 |
| 管理助手工具 | `python3 -m unittest discover -s .agents/skills/kev-training/scripts/tests`：74 项通过。迁移的 44 个上游文件与迁移前逐字节一致，三份来源清单的文件摘要和许可证一致。 |
| 业务资产 | `python3 tools/check_agents.py`：22 个智能体、22 份 Harness、377 个文件，零错误。保持扁平目录及原生文件配置。 |
| 原生技能发现 | Codex app-server 的 `skills/list`：控制仓 3、程序仓 7、数据仓 0、管理 HOME 24、业务仓 0，无发现错误。上游参考中的技能不重复注册。DSH 仍装载 HOME 的 24 个技能及 5 个系统技能。 |
| Codex 实际任务 | 两个显式技能调用、两个隐式触发、一个计算负例、一个跨仓 MCP 路由、四个子仓独立上下文，共十项完成。隐式治理审查初次超时，明确两仓审查入口范围后，以当前文件重新执行通过；不据单次样例推断触发率。 |
| 管理助手实际效果 | 原生 DSH 新会话使用 deepseek-flash，读取 HOME 身份、训练及 MCP 组合方法和迁移后的上游资源；正确说明程序、数据、业务 Harness 和管理方法的四仓归属，工具执行成功且任务队列结束。 |
| 管理页面 | 真实 Chrome 访问首页、管理对话、智能体管理、评测中心、实例管理、统一网关和 MCP 管理，七个入口无页面异常。 |

控制仓只跟踪上下文、共享开发技能、来源清单和工具，四个子仓由根 `.gitignore` 排除，不使用 gitlink 或 `.gitmodules`。管理 HOME 用 `AGENTS.override.md` 提供 Codex 开发身份，DSH 继续使用 `AGENTS.md` 的运行身份。运行配置与研究记录归数据仓；管理及业务 Harness 均保持文件形式。

来源配置使用 JSON，工具仅依赖 Node.js 与 Git。本地 manifest 记录实际提交、dirty、包摘要及物化模式，路径和运行清单不提交；上下文正文由各仓维护，初始化不改写子仓指令。共享开发技能只保留三个，按实际职责划分，不按建议数量增加空壳技能。

本轮围绕工作区与技能治理验收，没有重新执行所有历史业务评测、SOC 写入、训练算力及语音任务。上一轮 Qwen3.8-27B 业务对话、容器重启与上下文保留，以及外部巡检接口不可达的结果，仍以[平台项目验收矩阵](https://github.com/wr5912/harness-engineering-platform/blob/main/docs/ai-agent-harness项目验收矩阵.md)为准；不据本轮结果提升业务效果结论。

原始命令输出、Codex 事件、DSH 会话回执和浏览器结果保存在本机忽略目录 `.hep-lab/evidence/` 与程序仓 `.local/acceptance/`，不随源码发布。
