# 工作区当前验证

时间：2026-11-14

本记录只描述当前 `/home/admin/work/hep-lab` 工作区，不引用旧验收快照作为当前状态。

| 仓库 | 当前提交 | 状态 |
|---|---|---|
| hep-lab | 以本次提交后的 `main` 为准 | 控制工具与五仓锁 |
| harness-engineering-platform | `48b9eeaf11e8719416f9c2a7bc6ca5b7c2c61879` | 旧 Experiment/Candidate 来源已拒绝 |
| harness-engineering-platform-data | `2d734581cbf572cce7d866dcba10d0bec948a01a` | 旧 Harness/评测闭包已清理，保留新评测运行目录 |
| platform-manager-dsh-home | `4acb3d60bdf263a0341b4ecf84a3849fd80933eb` | Skill 链接与当前用户 patch |
| business-agents | `a107bb0c4989b69541c825d2111681bdc1ad6c61` | 23 个 Agent，9 个 active 发布清单 |

## 已验证

- 工作区工具测试：24/24 通过。
- business Agent checker：23/23 Agent、560 个可装载文件通过；Python 3.8 单元测试 5/5 通过。
- data 来源校验：23 个 registry Agent 均固定到 `business:<agent-id>@a107bb0c4989b69541c825d2111681bdc1ad6c61`；业务实例配置无旧 `experiment:` 来源。
- data MCP catalog 校验通过。
- 平台 strict source contract：3/3 通过；Python 编译检查通过；business source 测试 1/1 通过；TypeScript check 通过。
- data 清理后，旧 `evolution/experiments`、data `agents`、旧 deliverables、旧 visual-validation 和旧评测生成物已删除；当前 `evolution/runs`、`evidence`、`decisions` 仅作为新评测输出目录，运行中的 `ai-proposal-document-generator-dev2` 状态目录暂留。

## 当前边界

- 旧 Experiment/Candidate、旧评测报告和旧差距分析不再由当前系统读取；新评测定义唯一位于 `business-agents/agents/<agent-id>/evaluation.md`。
- 平台全量历史测试中仍有旧 Experiment fixture；这些 fixture 不能作为当前运行合同，后续测试应迁移到 business source 或删除。
- business 仓 Node 构建未在本轮执行，原因是本地缺少其 `node_modules`；静态 checker 和 Python 测试已通过。
- 当前运行实例尚未完成基于 business commit 的重建和新评测 Run；服务重启、浏览器、真实模型和外部 MCP 结果不能由本记录推定。
