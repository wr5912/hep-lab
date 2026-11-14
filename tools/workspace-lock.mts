import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// 生成文件采用 JSON 兼容 YAML，工作区引导不需要先安装 YAML 依赖。
export function readWorkspaceLock(root: string) {
  const path = join(root, '.hep-lab/workspace.lock.yaml')
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : undefined
}

export function applyWorkspaceLock<T extends { repositories: Record<string, { commit?: string }> }>(root: string, config: T): T {
  const lock = readWorkspaceLock(root)
  if (lock) for (const [key, repository] of Object.entries(config.repositories)) {
    if (lock.repositories?.[key]?.commit) repository.commit = lock.repositories[key].commit
  }
  return config
}
