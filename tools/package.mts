import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { listRepositories } from './hep-lab-repos.mts'
import { readWorkspaceLock } from './workspace-lock.mts'

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const save = (path: string, value: unknown) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 })
const git = (root: string, args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim()

export function repositorySnapshot(root: string) {
  return Object.fromEntries(listRepositories(root).map(repo => {
    if (repo.error || !repo.commit) throw Error(repo.error ?? `${repo.name} 缺少提交`)
    return [repo.key, { path: relative(root, repo.path) || '.', url: repo.url, ref: repo.ref, commit: repo.commit }]
  }))
}

function platformPlan(root: string, environment: string) {
  const program = join(root, 'harness-engineering-platform'), data = join(root, 'manager-workspace/harness-engineering-platform-data')
  return JSON.parse(execFileSync(join(program, 'platform/dsh-deploy'), ['release-plan', '--program-root', program, '--data-root', data, '--environment', environment], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }))
}

export function assertLocked(root: string, lock: any, plan: any) {
  if (lock?.schemaVersion !== 1) throw Error('先执行 hep-lab lock --environment <环境> 并提交锁文件')
  for (const repo of listRepositories(root)) {
    if (repo.error || repo.dirty) throw Error(`${repo.name} 尚有未提交改动或无法读取；先提交后打包`)
    const pinned = lock.repositories?.[repo.key]?.commit
    if (repo.key === 'workspace' && pinned) {
      // 入库锁记录控制仓基线；发布快照另记实际 HEAD，避免自引用提交哈希。
      git(root, ['merge-base', '--is-ancestor', pinned, 'HEAD'])
    } else if (pinned !== repo.commit) throw Error(`${repo.name} 与工作区锁不符；重新 lock 并提交`)
  }
  for (const key of ['environment', 'arch', 'image', 'runtime', 'config']) {
    if (JSON.stringify(lock[key]) !== JSON.stringify(plan[key])) throw Error(`${key} 与工作区锁不符；重新 lock 并提交`)
  }
}

function commands(root: string, plan: any, out: string, kind: string, agent?: string) {
  const program = join(root, 'harness-engineering-platform'), data = join(root, 'manager-workspace/harness-engineering-platform-data')
  const common = ['--program-root', program, '--data-root', data, '--arch', plan.arch]
  const result: Array<{ name: string; args: string[] }> = []
  if (kind === 'platform' || kind === 'all') result.push({ name: 'platform', args: ['pack', ...common, '--assets-dir', plan.platform.assetsDir, '--image-archive', plan.platform.imageArchive, '--image-id', plan.image.id, '--out', join(out, 'platform-bundle')] })
  if (kind === 'agent' || kind === 'all') {
    if (!agent) throw Error('独立包需要 --agent <智能体ID>')
    result.push({ name: 'agent', args: ['agent-pack', ...common, '--agent-id', agent, '--source', `business:${agent}`, '--mode', plan.agent.mode, '--resources-dir', plan.agent.resourcesDir, '--out', join(out, 'agent-bundles'), '--evidence-dir', join(out, 'evidence')] })
  }
  return result
}

async function invoke(root: string, args: string[], log: string) {
  const fd = openSync(log, 'wx', 0o600)
  try {
    await new Promise<void>((done, fail) => {
      const child = spawn(join(root, 'harness-engineering-platform/platform/dsh-deploy'), args, { stdio: ['ignore', fd, fd] })
      const interrupt = () => child.kill('SIGTERM')
      process.once('SIGINT', interrupt); process.once('SIGTERM', interrupt)
      child.once('error', fail)
      child.once('exit', (code, signal) => {
        process.off('SIGINT', interrupt); process.off('SIGTERM', interrupt)
        code === 0 ? done() : fail(Error(`平台打包失败（${code ?? signal}），详见 ${log}`))
      })
    })
  } finally { closeSync(fd) }
}

export async function main(argv = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, options: {
    root: { type: 'string' }, environment: { type: 'string' }, agent: { type: 'string' }, kind: { type: 'string' }, output: { type: 'string' }, 'dry-run': { type: 'boolean' }, help: { type: 'boolean' },
  } })
  if (values.help || !positionals.length) {
    console.log('hep-lab lock|package --environment <环境> [--agent <ID>] [--kind platform|agent|all] [--output .hep-lab/releases/<ID>] [--dry-run]\n部署配置：manager-workspace/harness-engineering-platform-data/config/deployment.yaml；实际打包：平台 dsh-deploy。')
    return
  }
  const [command] = positionals
  if (positionals.length !== 1 || !['lock', 'package'].includes(command) || !values.environment) throw Error('使用 lock|package --environment <环境>')
  const root = resolve(values.root ?? defaultRoot), plan = platformPlan(root, values.environment)
  if (command === 'lock') {
    const lock = { schemaVersion: 1, repositories: repositorySnapshot(root), controlCommit: 'base; release snapshot records exact HEAD', ...plan }
    // 绝对资源路径属于本地计划，不写进可移植的来源锁。
    delete lock.platform; delete lock.agent
    if (values['dry-run']) console.log(JSON.stringify(lock, null, 2))
    else { save(join(root, '.hep-lab/workspace.lock.yaml'), lock); console.log('.hep-lab/workspace.lock.yaml') }
    return
  }
  const kind = values.kind ?? (values.agent ? 'agent' : 'platform')
  if (!['platform', 'agent', 'all'].includes(kind)) throw Error('--kind 只能是 platform、agent 或 all')
  assertLocked(root, readWorkspaceLock(root), plan)
  const releases = join(root, '.hep-lab/releases'), out = resolve(root, values.output ?? join(releases, new Date().toISOString().replace(/[:.]/g, '-')))
  const rel = relative(releases, out)
  if (!rel || rel.startsWith('..') || resolve(releases, rel) !== out) throw Error('输出须为 .hep-lab/releases/<release-id> 子目录')
  const steps = commands(root, plan, out, kind, values.agent)
  if (values['dry-run']) { console.log(JSON.stringify({ out, steps }, null, 2)); return }
  if (existsSync(out)) throw Error(`发布目录已存在，请使用新的 release-id：${out}`)
  mkdirSync(join(out, 'logs'), { recursive: true, mode: 0o700 })
  mkdirSync(join(out, 'evidence'), { mode: 0o700 })
  const repositories = repositorySnapshot(root)
  const snapshot = { schemaVersion: 1, environment: plan.environment, arch: plan.arch, config: plan.config, image: plan.image, runtime: plan.runtime }
  save(join(out, 'workspace.lock.yaml'), { ...readWorkspaceLock(root), repositories, controlCommit: 'exact' })
  save(join(out, 'config.snapshot.json'), snapshot)
  const manifest: any = { schemaVersion: 1, id: basename(out), status: 'building', createdAt: new Date().toISOString(), kind, agent: values.agent, repositories, configSnapshotSha256: createHash('sha256').update(readFileSync(join(out, 'config.snapshot.json'))).digest('hex'), image: plan.image, artifacts: [] }
  const manifestPath = join(out, 'release.manifest.yaml')
  save(manifestPath, manifest)
  try {
    for (const step of steps) {
      console.log(`正在打包 ${step.name}；日志 ${relative(root, join(out, 'logs', step.name + '.log'))}`)
      await invoke(root, step.args, join(out, 'logs', step.name + '.log'))
      const folder = join(out, step.name === 'platform' ? 'platform-bundle' : 'agent-bundles')
      for (const name of readdirSync(folder).filter(name => name.endsWith('.tar.gz'))) {
        const sha256 = readFileSync(join(folder, name + '.sha256'), 'utf8').split(/\s+/)[0]
        manifest.artifacts.push({ path: relative(out, join(folder, name)), size: statSync(join(folder, name)).size, sha256 })
      }
    }
    assertLocked(root, readWorkspaceLock(root), platformPlan(root, values.environment))
    if (JSON.stringify(repositorySnapshot(root)) !== JSON.stringify(repositories)) throw Error('打包期间仓库提交变化，请重新打包')
    manifest.status = 'completed'
    console.log(relative(root, manifestPath))
  } catch (error) {
    manifest.status = 'failed'; manifest.error = (error as Error).message
    throw error
  } finally { manifest.finishedAt = new Date().toISOString(); save(manifestPath, manifest) }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(`hep-lab: ${error.message}`); process.exitCode = 1 })
}
