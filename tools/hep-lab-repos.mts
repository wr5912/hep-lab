import { execFileSync } from 'node:child_process'
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { names, repositoryPaths, sourceRemotes, configureCommitIdentity, type Repo } from './hep-lab-space.mts'
import { applyWorkspaceLock } from './workspace-lock.mts'

type RepoConfig = Repo
type Config = { repositories: Record<string, RepoConfig> }
type Repository = { key: string, name: string, path: string, url: string, internal_url?: string, ref: string | null, remote?: string, configuredCommit?: string }
type RepositoryState = Repository & { branch: string | null, commit: string | null, dirty: boolean, upstreamCommit?: string | null, error?: string }

const commandGit = (path: string, args: string[]) => execFileSync(
  'git',
  ['-c', 'core.hooksPath=/dev/null', '-C', path, ...args],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } },
).trim()

function readConfig(root: string): Config {
  const path = join(root, '.hep-lab/sources.json')
  if (!existsSync(path)) throw Error(`缺少来源清单：${path}`)
  const config = applyWorkspaceLock(root, JSON.parse(readFileSync(path, 'utf8')))
  for (const key of Object.keys(names)) if (!config.repositories?.[key]?.url) throw Error(`来源清单缺少仓库：${key}`)
  return config
}

function rootRepository(root: string): Repository {
  let ref: string | null = null
  try { ref = commandGit(root, ['symbolic-ref', '--quiet', '--short', 'HEAD']) || null } catch {}
  return { key: 'workspace', name: 'hep-lab', path: root, url: commandGit(root, ['remote', 'get-url', 'origin']), ref }
}

function childRepositories(root: string, config: Config): Repository[] {
  return Object.entries(names).map(([key, name]) => {
    const item = config.repositories[key]
    return { key, name, path: join(root, repositoryPaths[key as keyof typeof repositoryPaths]), url: item.url, internal_url: item.internal_url, ref: item.ref ?? 'main', configuredCommit: item.commit }
  })
}

function repositories(root: string): Repository[] {
  const config = readConfig(root)
  return [rootRepository(root), ...childRepositories(root, config)]
}

function matchingRemote(repository: Repository) {
  const source = sourceRemotes(repository.path, repository).find(item => item.remote)
  if (source?.remote) return { remote: source.remote, url: source.url }
  throw Error(`没有匹配来源的远端：${repository.url}`)
}

function inspect(repository: Repository): RepositoryState {
  try {
    if (!existsSync(join(repository.path, '.git')) || lstatSync(repository.path).isSymbolicLink() || realpathSync(repository.path) !== repository.path || commandGit(repository.path, ['rev-parse', '--show-toplevel']) !== repository.path) throw Error(`目录不是独立真实仓库：${repository.path}`)
    const source = repository.remote ? { remote: repository.remote, url: commandGit(repository.path, ['remote', 'get-url', repository.remote]) } : matchingRemote(repository)
    let branch: string | null = null
    try { branch = commandGit(repository.path, ['symbolic-ref', '--quiet', '--short', 'HEAD']) || null } catch {}
    let upstreamCommit: string | null = null
    try { upstreamCommit = commandGit(repository.path, ['rev-parse', '--verify', `${source.remote}/${repository.ref ?? branch ?? 'main'}`]) || null } catch {}
    return { ...repository, ...source, branch, commit: commandGit(repository.path, ['rev-parse', 'HEAD']), dirty: Boolean(commandGit(repository.path, ['status', '--porcelain'])), upstreamCommit }
  } catch (error) {
    return { ...repository, branch: null, commit: null, dirty: false, error: (error as Error).message }
  }
}

export function listRepositories(root: string): RepositoryState[] {
  return repositories(resolve(root)).map(inspect)
}

function pullOne(repository: Repository, dryRun: boolean) {
  const state = inspect(repository)
  if (state.error) return { ...state, action: 'error', message: state.error, ok: false }
  if (state.dirty) return { ...state, action: 'skip', message: '工作树有未提交改动，未拉取', ok: false }
  if (!state.branch || !repository.ref) return { ...state, action: 'skip', message: '当前为 detached HEAD，未切换分支', ok: false }
  if (state.branch !== repository.ref) return { ...state, action: 'skip', message: `当前分支为 ${state.branch}，目标为 ${repository.ref}，未切换分支`, ok: false }
  const sources = sourceRemotes(repository.path, repository)
  const preferred = sources[0]
  if (dryRun) return { ...state, url: preferred.url, remote: preferred.remote ?? undefined, action: 'would-pull', message: `将快进到 ${preferred.remote ?? preferred.url}/${repository.ref}`, ok: true }
  try {
    configureCommitIdentity(repository.path)
    let fetched: { remote: string | null, url: string } | undefined
    let lastError: unknown
    for (const source of sources) {
      try {
        commandGit(repository.path, ['fetch', '--prune', source.remote ?? source.url, repository.ref])
        fetched = source
        break
      } catch (error) { lastError = error }
    }
    if (!fetched) throw lastError
    // 已连通来源发生分歧时直接报告，不通过切换镜像掩盖非快进冲突。
    const fetchedCommit = commandGit(repository.path, ['rev-parse', '--verify', 'FETCH_HEAD'])
    commandGit(repository.path, ['merge', '--ff-only', 'FETCH_HEAD'])
    const next = inspect(repository)
    if (next.commit !== fetchedCommit) throw Error(`拉取后提交校验失败：期望 ${fetchedCommit}，实际 ${next.commit}`)
    return { ...next, url: fetched.url, remote: fetched.remote ?? undefined, action: 'pulled', target_commit: fetchedCommit, message: `已从 ${fetched.remote ?? fetched.url} 快进到 ${next.commit}`, ok: true }
  } catch (error) {
    const next = inspect(repository)
    return { ...next, action: 'error', message: (error as Error).message, ok: false }
  }
}

export function pullRepositories(root: string, dryRun = false) {
  const resolvedRoot = resolve(root)
  const first = repositories(resolvedRoot)
  const rootResult = pullOne(first[0], dryRun)
  // 根仓更新后重新读取清单，使子仓 URL/ref 跟随最新控制仓配置。
  let next = first
  if (rootResult.ok) next = repositories(resolvedRoot)
  const results = [rootResult, ...next.slice(1).map(repository => pullOne(repository, dryRun))]
  return { ok: results.every(result => result.ok), results }
}

function printState(state: RepositoryState) {
  console.log(`${state.name}`)
  console.log(`  path: ${state.path}`)
  console.log(`  remote: ${state.url}`)
  if (state.remote) console.log(`  remote_name: ${state.remote}`)
  console.log(`  branch: ${state.branch ?? 'detached/missing'}`)
  console.log(`  commit: ${state.commit ?? 'unknown'}`)
  if (state.upstreamCommit) console.log(`  upstream_commit: ${state.upstreamCommit}`)
  console.log(`  dirty: ${state.dirty ? 'yes' : 'no'}`)
  if (state.configuredCommit && state.configuredCommit !== state.commit) console.log(`  configured_commit: ${state.configuredCommit}`)
  if (state.error) console.log(`  error: ${state.error}`)
}

function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { root: { type: 'string' }, json: { type: 'boolean' }, 'dry-run': { type: 'boolean' }, help: { type: 'boolean' } },
  })
  const command = positionals[0] ?? 'status'
  if (values.help || command === 'help') {
    console.log('hep-lab-repos status|show|pull [--root PATH] [--json] [--dry-run]')
    return
  }
  if (positionals.length > 1 || !['status', 'show', 'pull'].includes(command)) throw Error('未知命令，使用 status、show 或 pull')
  const root = resolve(values.root ?? join(dirname(fileURLToPath(import.meta.url)), '..'))
  if (command === 'status' || command === 'show') {
    const result = listRepositories(root)
    if (values.json) console.log(JSON.stringify(result, null, 2))
    else result.forEach(printState)
    if (result.some(state => state.error)) process.exitCode = 1
    return
  }
  const result = pullRepositories(root, values['dry-run'])
  if (values.json) console.log(JSON.stringify(result, null, 2))
  else result.results.forEach(item => console.log(`${item.name}: ${item.message}`))
  if (!result.ok) process.exitCode = 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main() } catch (error) { console.error(`hep-lab-repos: ${(error as Error).message}`); process.exitCode = 1 }
}
