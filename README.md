# hep-lab

五仓开发工作区（控制仓 + 四个子仓）。仓库职责和协作入口见 [AGENTS.md](AGENTS.md)。各仓统一使用 Node.js 24.9+、Python 3.10+。工作区工具只需要 Node.js 和 Git；完整平台的环境要求见[程序仓说明](https://github.com/wr5912/harness-engineering-platform/blob/main/README.md#快速启动)。

```sh
git clone https://github.com/wr5912/hep-lab.git
cd hep-lab
tools/hep-lab-space init
tools/hep-lab-space diff
tools/hep-lab-space verify --fast
```

`init` 按 [.hep-lab/sources.json](.hep-lab/sources.json) 的提交准备缺失的四个子仓，复用现有仓库但不切换、清理或覆盖工作树。已有提交与配置不同会给出提示并保留当前版本；需要更新时由开发者在对应仓执行 Git 操作。`sync` 在当前五仓版本上更新上下文投影，记录实际提交及 dirty 状态，不拉取代码。已有仓库按来源地址匹配远端，支持 `gitlab` 等名称；GitHub SSH/HTTPS 表示视为同一来源。

`business-agents` 同时登记 GitHub `url` 和 GitLab `internal_url`。本机存在非回环的 `172.16.*.*` IPv4 地址时，初始化和拉取优先使用 GitLab；其他环境优先使用 GitHub。优先来源连接失败时尝试另一端，保留现有远端名称。两端使用同一份 Harness 和固定提交，合并后的内容保持同步。

在 `172.16.*.*` 环境中，`init` 和实际 `pull` 会将仓库的 Git 提交邮箱设为 `luopeng@123.com`，保留提交者姓名。其他环境沿用原有 Git 身份，`show` 和 `--dry-run` 不改配置。

目录布局如下，四个仓库分别独立维护 Git：

```text
hep-lab/
├── harness-engineering-platform/
├── platform-manager-dsh-home/
└── manager-workspace/
    ├── harness-engineering-platform-data/
    └── business-agents/
```

管理助手从 `manager-workspace/` 开始工作；`HARNESS_ASSET_ROOT` 指向其中的数据仓库，业务仓库通过来源登记解析。管理 HOME 的研发覆盖文件是可选的；没有该本地文件时使用其版本化 `README.md` 作为仓库上下文。

```sh
tools/hep-lab-space sync                 # 首次默认相对符号链接，之后沿用当前模式
tools/hep-lab-space sync --mode copy     # 完整复制，适合容器与交付目录
tools/hep-lab-space sync --mode symlink  # 切回开发链接
tools/hep-lab-space doctor
tools/hep-lab-space status               # 聚合控制仓与四个子仓的分支、提交、dirty 状态
node --test tools/test/*.test.mjs
```

一次查看工作区控制仓及四个子仓（共五仓）的 Git 状态，包括路径、远端、分支、当前提交及是否有未提交改动：

```sh
./tools/hep-lab-repos status
./tools/hep-lab-repos status --json
```

不指定子命令时默认执行 `status`；`show` 保留为兼容别名。状态查询只读取本地 Git 信息，不拉取远端。

拉取五个仓库的最新 `main` 代码时，工具先尝试安全更新控制仓，再逐一对 clean 且已位于目标分支的工作树执行快进更新；控制仓或子仓存在未提交改动、detached HEAD 或其他分支时会保留工作树并报告未更新对象：

```sh
tools/hep-lab-repos pull
tools/hep-lab-repos pull --dry-run
```

只投影清单显式列出的 Skill；整个包连同 references、scripts、assets 一起处理。目标被手工修改时停止覆盖并显示路径，先保存改动或移到唯一来源。删除清单项会移除未经修改的旧投影；新增未管理文件保持原样并提示。两种模式都不复制运行时凭据、HOME 或会话。

`.hep-lab/manifest.json` 记录来源提交、工作树状态、包摘要和物化方式。`hep-lab.yaml` 保持平台运行入口兼容；这些本地结果均不提交。重复同步无变化时不改写文件。`--root <目录>` 可指定已包含本仓上下文源码与配置的工作区；命令从任意 cwd 启动都默认使用脚本所属工作区。

根仓只管理工作区入口、来源清单和共享开发 Skill。四个子仓目录是独立克隆，均由根仓 `.gitignore` 排除；根仓不记录子仓文件、gitlink 或 `.gitmodules`。根仓 `git status` 只显示控制文件，聚合状态使用 `status`。`verify` 校验五仓来源锁、工作树和索引边界，不读取业务运行数据。

开发 Skill 使用 Codex 的 [AGENTS.md 发现规则](https://learn.chatgpt.com/docs/agent-configuration/agents-md)和[原生 Skill 发现规则](https://learn.chatgpt.com/docs/build-skills)。管理助手的运行技能由 DSH HOME 原生发现，不投影到开发工作区。完整平台运行检查和业务效果验收见程序仓 [README.md](https://github.com/wr5912/harness-engineering-platform/blob/main/README.md) 与项目验收矩阵。

工作区工具、原生上下文和技能发现的当前验证范围见[工作区验收](.hep-lab/VALIDATION.md)。
