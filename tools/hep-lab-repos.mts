import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { names, originIdentity } from './hep-lab-space.mts'

type RepoConfig = { url: string, ref?: string, commit?: string }
type Config = { repositories: Record<string, RepoConfig> }
type Repository = { key: string, name: string, path: string, url: string, ref: string | null, remote?: string, configuredCommit?: string }
type RepositoryState = Repository & { branch: string | null, commit: string | null, dirty: boolean, error?: string }

const commandGit = (path: string, args: string[]) => execFileSync(
  'git',
  ['-c', 'core.hooksPath=/dev/null', '-C', path, ...args],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } },
).trim()

function readConfig(root: string): Config {
  const path = join(root, '.hep-lab/sources.json')
  if (!existsSync(path)) throw Error(`缺少来源清单：${path}`)
  const config = JSON.parse(readFileSync(path, 'utf8')) as Config
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
    return { key, name, path: join(root, name), url: item.url, ref: item.ref ?? 'main', configuredCommit: item.commit }
  })
}

function repositories(root: string): Repository[] {
  const config = readConfig(root)
  return [rootRepository(root), ...childRepositories(root, config)]
}

function matchingRemote(path: string, source: string) {
  for (const remote of commandGit(path, ['remote']).split('\n').filter(Boolean)) {
    const url = commandGit(path, ['remote', 'get-url', remote])
    if (originIdentity(url) === originIdentity(source)) return { remote, url }
  }
  throw Error(`没有匹配来源的远端：${source}`)
}

function inspect(repository: Repository): RepositoryState {
  try {
    const source = repository.remote ? { remote: repository.remote, url: commandGit(repository.path, ['remote', 'get-url', repository.remote]) } : matchingRemote(repository.path, repository.url)
    let branch: string | null = null
    try { branch = commandGit(repository.path, ['symbolic-ref', '--quiet', '--short', 'HEAD']) || null } catch {}
    return { ...repository, ...source, branch, commit: commandGit(repository.path, ['rev-parse', 'HEAD']), dirty: Boolean(commandGit(repository.path, ['status', '--porcelain'])) }
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
  if (dryRun) return { ...state, action: 'would-pull', message: `将快进到 origin/${repository.ref}`, ok: true }
  try {
    commandGit(repository.path, ['fetch', '--prune', state.remote!, repository.ref])
    commandGit(repository.path, ['merge', '--ff-only', `${state.remote}/${repository.ref}`])
    const next = inspect(repository)
    return { ...next, action: 'pulled', message: `已快进到 ${next.commit}`, ok: true }
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
  console.log(`  dirty: ${state.dirty ? 'yes' : 'no'}`)
  if (state.configuredCommit && state.configuredCommit !== state.commit) console.log(`  configured_commit: ${state.configuredCommit}`)
  if (state.error) console.log(`  error: ${state.error}`)
}

function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { root: { type: 'string' }, json: { type: 'boolean' }, 'dry-run': { type: 'boolean' }, help: { type: 'boolean' } },
  })
  const command = positionals[0] ?? 'show'
  if (values.help || command === 'help') {
    console.log('hep-lab-repos show|pull [--root PATH] [--json] [--dry-run]')
    return
  }
  if (positionals.length > 1 || !['show', 'pull'].includes(command)) throw Error('未知命令，使用 show 或 pull')
  const root = resolve(values.root ?? join(dirname(fileURLToPath(import.meta.url)), '..'))
  if (command === 'show') {
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
