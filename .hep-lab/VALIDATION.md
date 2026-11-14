# 工作区当前验证

时间：2026-11-14

本记录只描述 `/home/admin/work/hep-lab` 当前工作区和已实际执行的检查。

| 仓库 | 当前提交 | 结果 |
|---|---|---|
| hep-lab | 本次根仓提交 | 五仓来源锁与工作区工具 |
| harness-engineering-platform | `2c88cf5a5e3c90dd277e0adafcd4b1b7eca7697f` | business source 严格来源合同 |
| harness-engineering-platform-data | `af8d94cdb73bcdcb22a4895b87d1db292cba0de9` | 运行配置、来源登记和新评测目录 |
| platform-manager-dsh-home | `af85592af47e382facbb3fe9349ec1949215ecd8` | MiMo provider 与管理助手默认路由 |
| business-agents | `a107bb0c4989b69541c825d2111681bdc1ad6c61` | 23 个 Agent，9 个 active 发布清单 |

## 已通过

- `node --test tools/test/*.test.mjs`：24/24。
- `python3 tools/check_agents.py`：23/23 Agent、560 个可装载文件；Python 单元测试 5/5。
- `python3 mcp/validate_sources.py --business-root ../business-agents`：23 个来源全部固定到 business commit，无旧 `experiment:` 来源和旧资产目录。
- `python3 mcp/validate_catalog.py`：catalog 校验通过。
- 平台 TypeScript 检查、Python 编译、strict source 测试 3/3、business source 测试 1/1；评测运行 smoke 已用固定 business source 创建并回读 `evolution/runs/<run-id>`。
- 平台定向 Node 测试：211 项中 208 通过、1 跳过、2 项失败。失败均为仍使用已删除 `evolution/experiments` fixture 的旧测试，已记录为迁移工作；没有恢复旧运行时兼容。
- 平台服务真实状态：PID `1648211`，`http://10.0.160.32:18120/hep/`，入口 HTTP 303 到登录页。
- 已登录的真实管理助手 Session 成功创建、发送一次 prompt 并完成回复；`session/projections` 返回 `MiMo E2E OK`，模型事实为 `xiaomi-token-plan-cn/mimo-v2.6-flash`，turn 1、`llmMs=7076`。
- 无 AI 助手的控制面 API 已直接核验：登录、`session/list`、`session/create`、`session/modelCatalog`；默认模型和可路由 provider 与配置一致。
- MiMo `/v1/models` 和 `/v1/chat/completions` 真实探针均 HTTP 200。凭据只存在数据仓 `.local/credentials/models.llm-api-key`，权限 0600，未进入 Git。
- data 清理后只保留 `evolution/runs`、`evolution/evidence`、`evolution/decisions` 作为新的评测运行数据边界；当前证据写入对应 `runs/<run-id>/evidence`。`evolution/experiments`、重复 Agent 资产、旧 deliverables、旧 visual-validation 和旧评测生成物已删除。

## 尚未完成的真实验收

- 业务 Agent 容器尚未用当前 business commit 重建，因此未宣称真实业务 MCP、外部系统写入、完整业务评测效果通过。
- 平台全量历史测试仍包含旧路径 fixture；当前两项失败需要迁移到新评测目录后再收敛。
- business 仓 Node 构建未执行，本机没有其 `node_modules`；checker 与 Python 测试已通过。
- 真实浏览器图片路径、外部业务 MCP 和生产模型长链路没有在本轮重复执行。
