---
name: hep-lab-space
description: 初始化或诊断 hep-lab 四仓工作区、同步共享开发 Skill、处理链接与复制漂移或核对工作区来源版本时使用。平台启动故障和业务 MCP 配置不属于本技能。
---

在工作区根目录使用 `tools/hep-lab-space`；若从子仓开始，先定位包含该工具与 `.hep-lab/sources.json` 的父工作区。工具源码及配置是操作合同，不依赖当前 cwd。

- 首次准备运行 `init`；已有四仓不会被切换、清理或覆盖。来源版本差异先看回执，需要更新时单独操作对应 Git 仓库。
- 日常先 `diff`，再 `sync`；开发默认相对 symlink，独立复制交付使用 `sync --mode copy`。复制整个包，不只复制 SKILL.md。
- `status` 聚合控制仓与四仓的分支、提交和 dirty 状态；`verify --fast` 与 `doctor` 检查上下文、投影和根仓索引边界。手工目标改动先保存到源包或另行保留，再恢复同步，不以强制覆盖绕过冲突。
- 核对 `.hep-lab/manifest.json` 的实际提交、dirty 状态、来源和摘要；重复同步应无变化。该清单及 `hep-lab.yaml` 是本地生成结果。

平台运行检查使用程序仓 `platform/hep-lab doctor --lab <工作区>`。工作区同步不执行构建、业务调用、提交推送或全仓安全扫描。只报告实际执行的层次。
