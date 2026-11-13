# hep-lab

四仓开发工作区。仓库职责和协作入口见 [AGENTS.md](AGENTS.md)。需要 Node.js 24.3 或更新版本和 Git，无平台依赖安装要求。

```sh
git clone https://github.com/wr5912/hep-lab.git
cd hep-lab
tools/hep-lab-space init
tools/hep-lab-space diff
tools/hep-lab-space verify --fast
```

`init` 按 [.hep-lab/sources.json](.hep-lab/sources.json) 的提交准备缺失的四仓，复用现有仓库但不切换、清理或覆盖工作树。已有提交与配置不同会给出提示并保留当前版本；需要更新时由开发者在对应仓执行 Git 操作。`sync` 在当前四仓版本上更新上下文投影，记录实际提交及 dirty 状态，不拉取代码。源地址兼容 GitHub SSH/HTTPS 表示。

```sh
tools/hep-lab-space sync                 # 首次默认相对符号链接，之后沿用当前模式
tools/hep-lab-space sync --mode copy     # 完整复制，适合容器与交付目录
tools/hep-lab-space sync --mode symlink  # 切回开发链接
tools/hep-lab-space doctor
tools/hep-lab-space status               # 聚合控制仓与四仓的分支、提交、dirty 状态
node --test tools/test/*.test.mjs
```

只投影清单显式列出的 Skill；整个包连同 references、scripts、assets 一起处理。目标被手工修改时停止覆盖并显示路径，先保存改动或移到唯一来源。删除清单项会移除未经修改的旧投影；新增未管理文件保持原样并提示。两种模式都不复制运行时凭据、HOME 或会话。

`.hep-lab/manifest.json` 记录来源提交、工作树状态、包摘要和物化方式。`hep-lab.yaml` 保持平台运行入口兼容；这些本地结果均不提交。重复同步无变化时不改写文件。`--root <目录>` 可指定已包含本仓上下文源码与配置的工作区；命令从任意 cwd 启动都默认使用脚本所属工作区。

根仓只管理工作区入口、来源清单和共享开发 Skill。四个子目录是独立克隆，均由根仓 `.gitignore` 排除；根仓不记录子仓文件、gitlink 或 `.gitmodules`。根仓 `git status` 只显示控制文件，聚合状态使用 `status`。`verify` 只检查固定四仓的忽略项和索引边界，不扫描子仓内容。

开发 Skill 使用 Codex 的 [AGENTS.md 发现规则](https://learn.chatgpt.com/docs/agent-configuration/agents-md)和[原生 Skill 发现规则](https://learn.chatgpt.com/docs/build-skills)。管理助手的运行技能由 DSH HOME 原生发现，不投影到开发工作区。完整平台运行检查和业务效果验收见程序仓 [README.md](harness-engineering-platform/README.md) 与项目验收矩阵。

工作区工具、原生上下文和技能发现的当前验证范围见[工作区验收](.hep-lab/VALIDATION.md)。
