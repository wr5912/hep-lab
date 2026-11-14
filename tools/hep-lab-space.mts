import { createHash, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, lstatSync, readFileSync, readdirSync, readlinkSync, realpathSync, mkdirSync, writeFileSync, renameSync, rmSync, cpSync, symlinkSync } from 'node:fs'
import { dirname, join, relative, resolve, isAbsolute } from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

export const names = { platform: 'harness-engineering-platform', data: 'harness-engineering-platform-data', platform_manager_dsh_home: 'platform-manager-dsh-home', business_agents: 'business-agents' }
const managerWorkspaceName = 'manager-workspace'
const managerWorkspaceMarker = '.manager-workspace'
const managerWorkspaceMarkerContent = '平台管理助手业务工作区：harness-engineering-platform-data 与 business-agents。\n'
export const repositoryPaths = { ...names, data: `${managerWorkspaceName}/${names.data}`, business_agents: `${managerWorkspaceName}/${names.business_agents}` }
const version = '1.0.0'
export type Repo = { url: string, internal_url?: string, ref?: string, commit?: string }
type Skill = { name: string, repository: string, path: string, scope: string }
type Config = { schema_version: number, mode: 'symlink' | 'copy', repositories: Record<string, Repo>, skills: Skill[] }
const exists = (path: string) => { try { lstatSync(path); return true } catch { return false } }
const json = (path: string) => JSON.parse(readFileSync(path, 'utf8'))
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
function git(path: string | undefined, args: string[]) {
  return execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...(path ? ['-C', path] : []), ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }).trim()
}
export function originIdentity(url: string) {
  return url.replace(/^git@([^:]+):/, 'https://$1/').replace(/^ssh:\/\/git@/, 'https://').replace(/\.git\/?$/, '').replace(/\/$/, '')
}
export function isInternalNetwork(interfaces = os.networkInterfaces()) {
  return Object.entries(interfaces).some(([name, addresses]) =>
    !/^(?:lo\d*$|docker|veth|br-|cni|virbr|lxcbr|lxdbr|podman|flannel|cali|kube)/i.test(name)
    && (addresses ?? []).some(item => item && !item.internal && (item.family === 'IPv4' || item.family === 4) && item.address.startsWith('172.16.')))
}
export function configureCommitIdentity(path: string) {
  if (isInternalNetwork() && exists(join(path, '.git'))) git(path, ['config', '--local', 'user.email', 'luopeng@123.com'])
}
export function sourceUrls(repo: Pick<Repo, 'url' | 'internal_url'>, interfaces = os.networkInterfaces()): string[] {
  if (!repo.internal_url) return [repo.url]
  return [...new Set(isInternalNetwork(interfaces) ? [repo.internal_url, repo.url] : [repo.url, repo.internal_url])]
}
export function sourceRemotes(path: string, repo: Pick<Repo, 'url' | 'internal_url'>) {
  const remotes = git(path, ['remote']).split('\n').filter(Boolean).map(remote => ({ remote, url: git(path, ['remote', 'get-url', remote]) }))
  return sourceUrls(repo).map(url => remotes.find(item => originIdentity(item.url) === originIdentity(url)) ?? { remote: null, url })
}
function registerMirrors(path: string, repo: Repo) {
  if (!repo.internal_url) return
  for (const source of sourceRemotes(path, repo)) {
    if (source.remote) continue
    const base = source.url === repo.internal_url ? 'gitlab' : 'github'
    const remotes = git(path, ['remote']).split('\n')
    let name = base
    for (let suffix = 2; remotes.includes(name); suffix++) name = `${base}-${suffix}`
    git(path, ['remote', 'add', name, source.url])
  }
}
function sourceRemote(path: string, repo: Repo) {
  for (const source of sourceRemotes(path, repo)) {
    if (source.remote) return source
  }
  throw Error(`仓库来源不同，保持原样：${path}`)
}
function inside(root: string, path: string) {
  const result = resolve(root, path), rel = relative(root, result)
  if (isAbsolute(path) || rel === '..' || rel.startsWith('../')) throw Error(`路径超出来源仓库：${path}`)
  return result
}
export function hashPackage(path: string): string {
  const hash = createHash('sha256')
  function visit(current: string, name: string) {
    const stat = lstatSync(current)
    if (stat.isSymbolicLink()) throw Error(`Skill 包内不支持符号链接，请将资源放入包内：${current}`)
    if (stat.isDirectory()) {
      hash.update(JSON.stringify(['directory', name]))
      for (const item of readdirSync(current).sort()) visit(join(current, item), `${name}/${item}`)
    } else if (stat.isFile()) {
      hash.update(JSON.stringify(['file', name, stat.mode & 0o111, stat.size])); hash.update(readFileSync(current))
    } else throw Error(`不支持的包资源：${current}`)
  }
  visit(path, '')
  return hash.digest('hex')
}
function targetHash(path: string) {
  if (!exists(path)) return null
  if (lstatSync(path).isSymbolicLink()) return `link:${readlinkSync(path)}`
  return hashPackage(path)
}
function writeJson(path: string, value: unknown, mode = 0o644) {
  const content = JSON.stringify(value, null, 2) + '\n'
  if (existsSync(path) && readFileSync(path, 'utf8') === content) return false
  mkdirSync(dirname(path), { recursive: true })
  const temporary = `${path}.${randomUUID()}.tmp`
  writeFileSync(temporary, content, { mode }); renameSync(temporary, path)
  return true
}
function load(root: string): Config {
  const config = json(join(root, '.hep-lab/sources.json')) as Config
  if (config.schema_version !== 1 || !['symlink', 'copy'].includes(config.mode) || !Array.isArray(config.skills)) throw Error('工作区来源清单版本或格式无效')
  for (const key of Object.keys(names)) if (!config.repositories[key]?.url) throw Error(`缺少仓库来源：${key}`)
  const seen = new Set<string>()
  for (const skill of config.skills) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(skill.name) || seen.has(skill.name)) throw Error(`Skill 名称无效或重复：${skill.name}`)
    if (skill.repository !== 'workspace' && !(skill.repository in names)) throw Error(`Skill 来源仓库无效：${skill.repository}`)
    if (!skill.scope) throw Error(`Skill 缺少触发范围：${skill.name}`)
    seen.add(skill.name)
  }
  return config
}
function repositoryStates(root: string, config: Config) {
  return Object.fromEntries(Object.entries(repositoryPaths).map(([key, name]) => {
    const path = join(root, name)
    if (!exists(join(path, '.git'))) throw Error(`仓库尚未准备：${path}，先运行 init`)
    if (lstatSync(path).isSymbolicLink() || !lstatSync(path).isDirectory() || realpathSync(path) !== path || resolve(git(path, ['rev-parse', '--show-toplevel'])) !== path) throw Error(`目录不是独立仓库：${path}`)
    const source = sourceRemote(path, config.repositories[key])
    return [key, { path: name, ...source, ref: config.repositories[key].ref ?? null, configured_commit: config.repositories[key].commit ?? null, commit: git(path, ['rev-parse', 'HEAD']), dirty: Boolean(git(path, ['status', '--porcelain'])) }]
  }))
}
function contextIssues(root: string) {
  const entries = [
    { label: 'AGENTS.md', candidates: ['AGENTS.md'] },
    ...Object.entries(repositoryPaths).map(([key, name]) => key === 'platform_manager_dsh_home'
      ? { label: `${name}/AGENTS.override.md`, candidates: [`${name}/AGENTS.override.md`, `${name}/README.md`] }
      : { label: `${name}/AGENTS.md`, candidates: [`${name}/AGENTS.md`] }),
  ]
  return entries.filter(({ candidates }) => !candidates.some(path => existsSync(join(root, path)))).map(({ label }) => `缺少研发上下文：${label}`)
}
function managerWorkspaceIssues(root: string) {
  const workspace = join(root, managerWorkspaceName), issues: string[] = []
  if (!exists(workspace)) return [`缺少管理助手默认工作区：${managerWorkspaceName}/`]
  if (lstatSync(workspace).isSymbolicLink() || !lstatSync(workspace).isDirectory() || realpathSync(workspace) !== workspace) return [`管理助手默认工作区必须是真实目录：${workspace}`]
  const marker = join(workspace, managerWorkspaceMarker)
  if (!exists(marker) || !lstatSync(marker).isFile() || lstatSync(marker).isSymbolicLink() || !readFileSync(marker, 'utf8').trim()) issues.push(`管理助手工作区标记缺失或无效：${marker}`)
  for (const key of ['data', 'business_agents'] as const) {
    const path = join(root, repositoryPaths[key])
    if (!exists(path)) { issues.push(`缺少管理助手业务仓库：${path}`); continue }
    if (lstatSync(path).isSymbolicLink() || !lstatSync(path).isDirectory() || realpathSync(path) !== path) issues.push(`管理助手业务仓库必须是真实目录：${path}`)
    if (exists(join(root, names[key]))) issues.push(`旧根级业务仓库仍存在，请迁移后再初始化：${join(root, names[key])}`)
  }
  return issues
}
function ensureManagerWorkspaceMarker(root: string) {
  const workspace = join(root, managerWorkspaceName)
  if (!exists(workspace) || lstatSync(workspace).isSymbolicLink() || !lstatSync(workspace).isDirectory() || realpathSync(workspace) !== workspace) throw Error(`管理助手默认工作区必须是真实目录：${workspace}`)
  const marker = join(workspace, managerWorkspaceMarker)
  if (exists(marker)) {
    if (!lstatSync(marker).isFile() || lstatSync(marker).isSymbolicLink() || !readFileSync(marker, 'utf8').trim()) throw Error(`管理助手工作区标记无效，保持原样：${marker}`)
    return
  }
  writeFileSync(marker, managerWorkspaceMarkerContent, { flag: 'wx', mode: 0o644 })
}
export function boundaryIssues(root: string) {
  if (!exists(join(root, '.git'))) return []
  const issues: string[] = []
  // 固定四仓的归属检查，只读取根仓索引，不扫描子仓内容。
  const ignored = existsSync(join(root, '.gitignore')) ? readFileSync(join(root, '.gitignore'), 'utf8').split(/\r?\n/) : []
  for (const name of Object.values(repositoryPaths)) if (!ignored.includes(`/${name}/`)) issues.push(`根仓 .gitignore 缺少 /${name}/`)
  const indexed = git(root, ['ls-files', '--stage', '--', ...Object.values(repositoryPaths)])
  if (indexed) issues.push(`根仓索引包含子仓文件或 gitlink，请在根仓移出索引并保留子仓工作树：\n${indexed}`)
  if (existsSync(join(root, '.gitmodules'))) issues.push('四仓使用独立克隆，不需要根仓 .gitmodules')
  return issues
}
export function status(root: string) {
  const repositories = Object.fromEntries([['workspace', '.'], ...Object.entries(repositoryPaths)].map(([key, name]) => {
    const path = resolve(root, name)
    if (!exists(join(path, '.git'))) return [key, { path, missing: true }]
    try {
      let commit: string | null = null
      try { commit = git(path, ['rev-parse', '--verify', 'HEAD']) } catch {}
      return [key, { path, branch: git(path, ['symbolic-ref', '--quiet', '--short', 'HEAD']).trim() || null, commit, dirty: Boolean(git(path, ['status', '--porcelain'])) }]
    } catch (error) {
      // 固定提交初始化的子仓处于 detached HEAD，仍然正常显示版本和状态。
      try { return [key, { path, branch: null, commit: git(path, ['rev-parse', 'HEAD']), dirty: Boolean(git(path, ['status', '--porcelain'])) }] }
      catch { return [key, { path, error: (error as Error).message }] }
    }
  }))
  return { command: 'status', repositories, boundary_issues: boundaryIssues(root) }
}
export function plan(root: string, mode?: 'symlink' | 'copy') {
  const config = load(root)
  const repositories = repositoryStates(root, config)
  const previous = existsSync(join(root, '.hep-lab/manifest.json')) ? json(join(root, '.hep-lab/manifest.json')) : null
  const previousModes = [...new Set((previous?.skills ?? []).map((item: any) => item.mode))]
  const selectedMode = mode ?? (previousModes.length === 1 ? previousModes[0] as 'copy' | 'symlink' : config.mode)
  let workspace = { commit: null as string | null, dirty: true }
  try { workspace = { commit: git(root, ['rev-parse', 'HEAD']), dirty: Boolean(git(root, ['status', '--porcelain'])) } } catch {}
  const skills = config.skills.map(skill => {
    const sourceRoot = skill.repository === 'workspace' ? root : join(root, repositoryPaths[skill.repository as keyof typeof repositoryPaths])
    const source = inside(sourceRoot, skill.path), target = join(root, '.agents/skills', skill.name)
    if (!existsSync(join(source, 'SKILL.md'))) throw Error(`Skill 源包缺失：${source}`)
    if (lstatSync(source).isSymbolicLink()) throw Error(`Skill 来源必须是唯一源目录：${source}`)
    const text = readFileSync(join(source, 'SKILL.md'), 'utf8')
    if (!new RegExp(`^name: ${skill.name}\\s*$`, 'm').test(text) || !/^description: .+/m.test(text)) throw Error(`Skill 元数据不匹配：${source}`)
    const source_hash = hashPackage(source), link_target = relative(dirname(target), source)
    const owner = skill.repository === 'workspace' ? workspace : repositories[skill.repository]
    return { ...skill, source: relative(root, source), source_commit: owner.commit, source_dirty: owner.dirty, source_hash, target: relative(root, target), mode: selectedMode, target_hash: selectedMode === 'symlink' ? `link:${link_target}` : source_hash, link_target: selectedMode === 'symlink' ? link_target : null }
  })
  const conflicts: string[] = [], changes: any[] = []
  // 先检查所有目标归属和改动，再执行任何覆盖。
  for (const old of previous?.skills ?? []) {
    const path = inside(root, old.target), actual = targetHash(path)
    if (actual !== null && actual !== old.target_hash) conflicts.push(`投影已被手工修改：${old.target}`)
    if (!skills.some(item => item.name === old.name)) changes.push({ name: old.name, action: 'remove', old })
  }
  for (const item of skills) {
    const old = previous?.skills?.find((entry: any) => entry.name === item.name), actual = targetHash(join(root, item.target))
    if (!old && actual !== null) conflicts.push(`目标不属于同步器，保留现有文件：${item.target}`)
    if (!equal(old, item) || actual !== item.target_hash || (item.mode === 'symlink' && !existsSync(join(root, item.target)))) changes.push({ name: item.name, action: old ? 'update' : 'add', old: old ?? null, next: item })
  }
  const known = new Set((previous?.skills ?? []).map((item: any) => item.name))
  const targetDir = join(root, '.agents/skills')
  if (existsSync(targetDir)) for (const name of readdirSync(targetDir)) if (!known.has(name)) {
    const message = `未管理的 Skill 目标：.agents/skills/${name}`
    if (!conflicts.some(item => item.includes(`.agents/skills/${name}`))) conflicts.push(message)
  }
  const desired = { schema_version: 1, generator: `hep-lab-space/${version}`, workspace, repositories, skills }
  const { generated_at: _time, ...previousContent } = previous ?? {}
  return { desired, previous, changes, conflicts, context_issues: [...contextIssues(root), ...boundaryIssues(root), ...managerWorkspaceIssues(root)], manifest_changed: !equal(desired, previousContent) }
}
export function sync(root: string, mode?: 'symlink' | 'copy') {
  ensureManagerWorkspaceMarker(root)
  const state = plan(root, mode)
  if (state.conflicts.length) throw Error(state.conflicts.join('\n'))
  if (state.context_issues.length) throw Error(state.context_issues.join('\n'))
  for (const change of state.changes) {
    if (change.action === 'remove') { rmSync(inside(root, change.old.target), { recursive: true, force: true }); continue }
    const item = change.next, target = join(root, item.target), temporary = `${target}.${randomUUID()}.tmp`
    // 来源变化但链接目标相同，无需重建链接。
    if (targetHash(target) === item.target_hash) continue
    mkdirSync(dirname(target), { recursive: true })
    if (item.mode === 'symlink') symlinkSync(item.link_target, temporary, 'dir')
    else cpSync(join(root, item.source), temporary, { recursive: true, preserveTimestamps: true })
    rmSync(target, { recursive: true, force: true }); renameSync(temporary, target)
  }
  if (state.manifest_changed) writeJson(join(root, '.hep-lab/manifest.json'), { ...state.desired, generated_at: new Date().toISOString() })
  const repositories = Object.fromEntries(Object.entries(state.desired.repositories).map(([key, value]) => [key, { url: value.url, ...(value.ref ? { ref: value.ref } : {}), commit: value.commit, path: join(root, value.path) }]))
  const runtimePath = join(root, 'hep-lab.yaml')
  let previousRuntime: any
  try { previousRuntime = json(runtimePath) } catch { previousRuntime = null }
  const runtime = { schema_version: 1, initializer_version: 2, created_at: previousRuntime?.created_at ?? new Date().toISOString(), repositories, paths: { dsh_home: join(root, names.platform_manager_dsh_home), business_agents_root: join(root, repositoryPaths.business_agents), manager_workspace_root: join(root, managerWorkspaceName) } }
  const runtime_changed = writeJson(runtimePath, runtime, 0o600)
  return { command: 'sync', changed: state.manifest_changed || runtime_changed || state.changes.length > 0, changes: state.changes, manager_workspace_root: join(root, managerWorkspaceName), repositories: state.desired.repositories }
}
export function initialize(root: string, allowFloating = false, mode?: 'symlink' | 'copy') {
  const config = load(root)
  const boundaries = boundaryIssues(root)
  if (boundaries.length) throw Error(boundaries.join('\n'))
  for (const key of ['data', 'business_agents'] as const) if (exists(join(root, names[key]))) throw Error(`旧根级业务仓库仍存在，请迁移后再初始化：${join(root, names[key])}`)
  const workspace = join(root, managerWorkspaceName)
  if (exists(workspace) && (lstatSync(workspace).isSymbolicLink() || !lstatSync(workspace).isDirectory() || realpathSync(workspace) !== workspace)) throw Error(`管理助手默认工作区必须是真实目录：${workspace}`)
  // 预检已有目录，禁止把其他目录或用户的工作树当成可重建目标。
  for (const [key, name] of Object.entries(repositoryPaths)) {
    const repo = config.repositories[key], path = join(root, name)
    if ((!repo.commit || !/^[0-9a-f]{40}$/.test(repo.commit)) && !allowFloating) throw Error(`${key} 需要固定的 40 位提交；开发时可使用 --allow-floating-ref`)
    if (exists(path)) {
      if (lstatSync(path).isSymbolicLink() || !lstatSync(path).isDirectory() || realpathSync(path) !== path || !exists(join(path, '.git')) || resolve(git(path, ['rev-parse', '--show-toplevel'])) !== path) throw Error(`已有目录不是对应的独立仓库，保持原样：${path}`)
      sourceRemote(path, repo)
    }
  }
  configureCommitIdentity(root)
  for (const [key, name] of Object.entries(repositoryPaths)) {
    const repo = config.repositories[key], path = join(root, name)
    if (exists(path)) { registerMirrors(path, repo); configureCommitIdentity(path); continue }
    const temporary = join(root, `.hep-lab/clone-${key}-${randomUUID()}.tmp`)
    let lastError: unknown
    for (const url of sourceUrls(repo)) {
      try {
        git(undefined, ['clone', '--no-checkout', '--', url, temporary])
        const target = repo.commit ?? `origin/${repo.ref ?? 'main'}`
        try { git(temporary, ['cat-file', '-e', `${target}^{commit}`]) } catch { git(temporary, ['fetch', '--no-tags', 'origin', target]) }
        git(temporary, ['checkout', '--detach', target])
        registerMirrors(temporary, repo)
        configureCommitIdentity(temporary)
        mkdirSync(dirname(path), { recursive: true })
        renameSync(temporary, path)
        lastError = undefined
        break
      } catch (error) { lastError = error }
      finally { rmSync(temporary, { recursive: true, force: true }) }
    }
    if (lastError) throw lastError
  }
  const result = sync(root, mode)
  return { ...result, command: 'init', warnings: Object.entries(result.repositories).filter(([, repo]) => repo.configured_commit && repo.commit !== repo.configured_commit).map(([key]) => `${key} 保留已有版本，与来源锁定不同；未切换工作树`) }
}
export function verify(root: string) {
  const state = plan(root)
  const issues = [...state.conflicts, ...state.context_issues, ...state.changes.map(item => `Skill 投影需要同步：${item.name}`)]
  if (state.manifest_changed) issues.push('来源记录需要同步')
  return { command: 'verify', valid: issues.length === 0, issues, manager_workspace_root: join(root, managerWorkspaceName), repositories: state.desired.repositories, skills: state.desired.skills.map(item => item.name) }
}
async function main() {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { root: { type: 'string' }, mode: { type: 'string' }, fast: { type: 'boolean' }, 'allow-floating-ref': { type: 'boolean' }, help: { type: 'boolean' } } })
  const command = positionals[0]
  if (values.help || !command) { console.log('hep-lab-space init|sync|diff|status|verify --fast|doctor [--root PATH] [--mode symlink|copy]\n配置：.hep-lab/sources.json；init 可选 --allow-floating-ref'); return }
  if (positionals.length !== 1 || !['init', 'sync', 'diff', 'status', 'verify', 'doctor'].includes(command)) throw Error('未知命令，使用 --help')
  if (values.mode && !['symlink', 'copy'].includes(values.mode)) throw Error('--mode 只能是 symlink 或 copy')
  if (values.mode && !['init', 'sync', 'diff'].includes(command)) throw Error('当前命令不支持 --mode')
  const root = resolve(values.root ?? join(dirname(fileURLToPath(import.meta.url)), '..')), mode = values.mode as 'symlink' | 'copy' | undefined
  const result = command === 'status' ? status(root) : command === 'init' ? initialize(root, values['allow-floating-ref'], mode) : command === 'sync' ? sync(root, mode) : command === 'diff' ? plan(root, mode) : { ...verify(root), command }
  console.log(JSON.stringify(result, null, 2))
  if ('valid' in result && !result.valid) process.exitCode = 1
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(`hep-lab-space: ${error.message}`); process.exitCode = 1 })
