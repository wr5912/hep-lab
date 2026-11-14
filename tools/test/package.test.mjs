import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { assertLocked, main, repositorySnapshot } from '../package.mts'
import { loadSources, repositoryPaths } from '../hep-lab-space.mts'

const git = (path, ...args) => execFileSync('git', ['-C', path, ...args], { encoding: 'utf8', stdio: 'pipe' }).trim()
const write = (path, value) => { mkdirSync(join(path, '..'), { recursive: true }); writeFileSync(path, value) }
const json = path => JSON.parse(readFileSync(path, 'utf8'))

test('统一入口锁定五仓，委托平台打包；漂移拒绝、失败留证，发布不回写资产仓', async t => {
  const root = mkdtempSync(join(tmpdir(), 'hep-release-test-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const repositories = {}
  for (const [key, path] of Object.entries({ workspace: '.', ...repositoryPaths })) {
    const dir = join(root, path)
    mkdirSync(dir, { recursive: true })
    git(dir, 'init', '-b', 'main')
    git(dir, 'config', 'user.name', 'Release Test')
    git(dir, 'config', 'user.email', 'test@example.invalid')
    git(dir, 'remote', 'add', 'origin', dir)
    write(join(dir, 'README.md'), key)
    if (key !== 'workspace') repositories[key] = { url: dir, ref: 'main' }
  }
  write(join(root, '.gitignore'), Object.values(repositoryPaths).map(path => '/' + path + '/').join('\n') + '\n/.hep-lab/releases/\n')
  write(join(root, '.hep-lab/sources.json'), JSON.stringify({ schema_version: 1, mode: 'symlink', skills: [], repositories }))
  const plan = { environment: 'lab', arch: 'arm64', image: { id: 'sha256:fixture' }, runtime: { sha256: 'runtime' }, config: { sha256: 'config' }, platform: { assetsDir: '/prepared', imageArchive: '/image.tar' }, agent: { resourcesDir: '/prepared-agent', mode: 'online' } }
  const program = join(root, repositoryPaths.platform)
  write(join(program, 'plan.json'), JSON.stringify(plan))
  // 单元替身只检查进程边界，不代表真实 ARM 部署验收。
  const cli = join(program, 'platform/dsh-deploy')
  write(cli, '#!' + process.execPath + '\n' + `
const fs = require('node:fs'), path = require('node:path');
const args = process.argv.slice(2), at = key => args[args.indexOf(key) + 1];
if (args[0] === 'release-plan') { console.log(fs.readFileSync(path.join(__dirname, '../plan.json'), 'utf8')); process.exit(0); }
if (fs.existsSync(path.join(__dirname, '../fail'))) process.exit(7);
const out = at('--out'); fs.mkdirSync(out, {recursive:true});
fs.writeFileSync(path.join(out, 'fixture.tar.gz'), 'fixture');
fs.writeFileSync(path.join(out, 'fixture.tar.gz.sha256'), 'digest  fixture.tar.gz\\n');
if (args.includes('--evidence-dir')) { const dir=at('--evidence-dir'); fs.mkdirSync(dir,{recursive:true}); fs.writeFileSync(path.join(dir,'export.json'), '{}'); }
fs.writeFileSync(path.join(out, 'arguments.json'), JSON.stringify(args));
`)
  chmodSync(cli, 0o755)
  for (const path of Object.values(repositoryPaths)) { git(join(root, path), 'add', '.'); git(join(root, path), 'commit', '-qm', 'source'); }
  git(root, 'add', '.'); git(root, 'commit', '-qm', 'control')
  await main(['lock', '--root', root, '--environment', 'lab'])
  const lock = json(join(root, '.hep-lab/workspace.lock.yaml'))
  assert.equal(Object.keys(lock.repositories).length, 5)
  assert.equal(loadSources(root).repositories.platform.commit, lock.repositories.platform.commit)
  git(root, 'add', '.'); git(root, 'commit', '-qm', 'lock')
  assert.doesNotThrow(() => assertLocked(root, lock, plan))
  write(join(program, 'dirty'), 'change')
  assert.throws(() => assertLocked(root, lock, plan), /未提交[\s\S]*\?\? dirty/)
  rmSync(join(program, 'dirty'))
  assert.throws(() => assertLocked(root, lock, { ...plan, config: { sha256: 'changed' } }), /config 与工作区锁不符：期望 \{"sha256":"config"\}，实际 \{"sha256":"changed"\}/)
  await assert.rejects(main(['package', '--root', root, '--environment', 'lab', '--output', '../outside']), /输出/)
  const out = join(root, '.hep-lab/releases/test')
  await main(['package', '--root', root, '--environment', 'lab', '--kind', 'all', '--agent', 'alpha', '--output', out, '--dry-run'])
  assert.equal(existsSync(out), false)
  const before = repositorySnapshot(root)
  await main(['package', '--root', root, '--environment', 'lab', '--kind', 'all', '--agent', 'alpha', '--output', out])
  assert.deepEqual(repositorySnapshot(root), before)
  assert.equal(json(join(out, 'release.manifest.yaml')).status, 'completed')
  assert.equal(json(join(out, 'workspace.lock.yaml')).repositories.workspace.commit, git(root, 'rev-parse', 'HEAD'))
  assert.equal(json(join(out, 'release.manifest.yaml')).artifacts.length, 2)
  assert.ok(json(join(out, 'agent-bundles/arguments.json')).includes('business:alpha'))
  assert.equal(existsSync(join(root, repositoryPaths.data, '.local')), false)
  assert.equal(existsSync(join(out, 'evidence/export.json')), true)
  await assert.rejects(main(['package', '--root', root, '--environment', 'lab', '--output', out]), /已存在/)
  write(join(program, 'fail'), 'fixture')
  git(program, 'add', '.'); git(program, 'commit', '-qm', 'fail fixture')
  await assert.rejects(main(['package', '--root', root, '--environment', 'lab']), /锁不符/)
  await main(['lock', '--root', root, '--environment', 'lab'])
  git(root, 'add', '.'); git(root, 'commit', '-qm', 'new lock')
  const failed = join(root, '.hep-lab/releases/failed')
  await assert.rejects(main(['package', '--root', root, '--environment', 'lab', '--output', failed]), /平台打包失败/)
  assert.equal(json(join(failed, 'release.manifest.yaml')).status, 'failed')
  assert.equal(existsSync(join(failed, 'logs/platform.log')), true)
})
