import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import os from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { names, repositoryPaths } from '../hep-lab-space.mts'
import { listRepositories, pullRepositories } from '../hep-lab-repos.mts'

const git = (path, ...args) => execFileSync('git', ['-C', path, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const commit = path => git(path, 'rev-parse', 'HEAD')
const setupGit = path => {
  mkdirSync(path, { recursive: true })
  git(path, 'init', '-b', 'main')
  git(path, 'config', 'user.name', 'Repository Test')
  git(path, 'config', 'user.email', 'test@example.invalid')
}

function fixture(t) {
  const temp = mkdtempSync(join(tmpdir(), 'hep-repos-test-'))
  const sourceRoot = join(temp, 'sources'), rootSource = join(sourceRoot, 'hep-lab')
  mkdirSync(sourceRoot)
  t.after(() => rmSync(temp, { recursive: true, force: true }))

  const repositorySources = {}
  for (const [key, name] of Object.entries(names)) {
    const source = join(sourceRoot, name)
    setupGit(source)
    writeFileSync(join(source, 'README.md'), `${name}\n`)
    git(source, 'add', '.')
    git(source, 'commit', '-qm', 'initial')
    repositorySources[key] = { url: source, ref: 'main', commit: commit(source) }
  }

  setupGit(rootSource)
  mkdirSync(join(rootSource, '.hep-lab'), { recursive: true })
  writeFileSync(join(rootSource, '.gitignore'), `${Object.values(repositoryPaths).map(name => `/${name}/`).join('\n')}\n`)
  writeFileSync(join(rootSource, 'AGENTS.md'), 'test context\n')
  writeFileSync(join(rootSource, '.hep-lab/sources.json'), JSON.stringify({ schema_version: 1, mode: 'symlink', repositories: repositorySources, skills: [] }, null, 2) + '\n')
  git(rootSource, 'add', '.')
  git(rootSource, 'commit', '-qm', 'initial')

  const root = join(temp, 'lab')
  execFileSync('git', ['clone', '-q', rootSource, root])
  mkdirSync(join(root, 'manager-workspace'))
  for (const [key, path] of Object.entries(repositoryPaths)) execFileSync('git', ['clone', '-q', repositorySources[key].url, join(root, path)])
  git(join(root, repositoryPaths.business_agents), 'remote', 'rename', 'origin', 'gitlab')
  return { temp, root, sources: repositorySources }
}

test('show 暴露控制仓和四个子仓的远程地址与当前提交', t => {
  const f = fixture(t)
  const result = listRepositories(f.root)
  assert.equal(result.length, 5)
  assert.deepEqual(result.map(item => item.name), ['hep-lab', ...Object.values(names)])
  assert.deepEqual(result.map(item => item.path), [f.root, ...Object.values(repositoryPaths).map(path => join(f.root, path))])
  assert.ok(result.every(item => item.url && item.commit && item.branch === 'main' && !item.dirty && !item.error))
  const preview = pullRepositories(f.root, true)
  assert.equal(preview.results.find(item => item.name === names.business_agents).message, '将快进到 gitlab/main')
  const cli = spawnSync(process.execPath, [resolve('tools/hep-lab-repos.mts'), 'show', '--root', f.root, '--json'], { encoding: 'utf8' })
  assert.equal(cli.status, 0, cli.stderr)
  assert.equal(JSON.parse(cli.stdout).length, 5)
})

test('pull 只快进 clean 目标分支，并保留 dirty 工作树和 detached HEAD', t => {
  const f = fixture(t)
  const source = join(f.temp, 'sources', names.business_agents)
  writeFileSync(join(source, 'new.txt'), 'new\n')
  git(source, 'add', '.')
  git(source, 'commit', '-qm', 'advance')
  const first = pullRepositories(f.root)
  assert.equal(first.ok, true)
  assert.equal(commit(join(f.root, repositoryPaths.business_agents)), commit(source))

  const dirtyPath = join(f.root, repositoryPaths.data, 'local.txt')
  writeFileSync(dirtyPath, 'keep\n')
  writeFileSync(join(f.root, 'local-root.txt'), 'keep\n')
  const detached = join(f.root, repositoryPaths.platform)
  git(detached, 'checkout', '--detach', 'HEAD')
  writeFileSync(join(source, 'latest.txt'), 'latest\n')
  git(source, 'add', '.')
  git(source, 'commit', '-qm', 'latest')
  const second = pullRepositories(f.root)
  assert.equal(second.ok, false)
  assert.equal(second.results.find(item => item.name === names.data).action, 'skip')
  assert.equal(second.results.find(item => item.name === names.platform).action, 'skip')
  assert.equal(second.results.find(item => item.name === names.business_agents).action, 'pulled')
  assert.equal(existsSync(dirtyPath), true)
  assert.equal(commit(join(f.root, repositoryPaths.data)), f.sources.data.commit)
  assert.equal(commit(join(f.root, repositoryPaths.business_agents)), commit(source))
})
test('拉取按环境选择双端，优先端失败时回退，不覆盖非快进分歧', t => {
  const f = fixture(t)
  const source = f.sources.business_agents.url
  const mirror = join(f.temp, 'github-business')
  execFileSync('git', ['clone', '-q', source, mirror])
  git(mirror, 'config', 'user.name', 'Repository Test')
  git(mirror, 'config', 'user.email', 'test@example.invalid')
  const business = join(f.root, repositoryPaths.business_agents)
  git(business, 'remote', 'add', 'github', mirror)
  const repo = f.sources.business_agents
  repo.url = mirror
  repo.internal_url = source
  const configPath = join(f.root, '.hep-lab/sources.json')
  writeFileSync(configPath, JSON.stringify({ repositories: f.sources }))
  git(f.root, 'add', '.hep-lab/sources.json')
  git(f.root, 'commit', '-qm', 'configure mirrors')
  const interfaces = t.mock.method(os, 'networkInterfaces', () => ({}))
  git(business, 'config', 'user.email', 'outside@example.invalid')
  assert.equal(pullRepositories(f.root, true).results.at(-1).remote, 'github')
  interfaces.mock.mockImplementation(() => ({ eth0: [{ address: '172.16.1.10', family: 'IPv4', internal: false }] }))
  assert.equal(pullRepositories(f.root, true).results.at(-1).remote, 'gitlab')
  assert.equal(git(business, 'config', 'user.email'), 'outside@example.invalid')

  writeFileSync(join(source, 'internal.txt'), 'internal\n')
  git(source, 'add', '.')
  git(source, 'commit', '-qm', 'internal advance')
  const internal = pullRepositories(f.root).results.at(-1)
  assert.equal(internal.ok, true)
  assert.equal(internal.remote, 'gitlab')
  assert.equal(commit(business), commit(source))
  for (const path of [f.root, ...Object.values(repositoryPaths).map(name => join(f.root, name))]) assert.equal(git(path, 'config', '--local', 'user.email'), 'luopeng@123.com')

  // GitHub 可连通但历史分歧，不能静默改用 GitLab 把这次拉取报告为成功。
  writeFileSync(join(mirror, 'outside.txt'), 'outside\n')
  git(mirror, 'add', '.')
  git(mirror, 'commit', '-qm', 'outside advance')
  interfaces.mock.mockImplementation(() => ({}))
  const divergent = pullRepositories(f.root).results.at(-1)
  assert.equal(divergent.ok, false)
  assert.equal(commit(business), commit(source))

  git(business, 'remote', 'set-url', 'github', join(f.temp, 'unavailable'))
  repo.url = join(f.temp, 'unavailable')
  writeFileSync(configPath, JSON.stringify({ repositories: f.sources }))
  const fallback = pullRepositories(f.root).results.at(-1)
  assert.equal(fallback.ok, true)
  assert.equal(fallback.remote, 'gitlab')
  assert.equal(commit(business), commit(source))
})
