import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { autoRegister, codexSkillPath, installApp, registerCodexSkill, removeCodexSkill } from '../src/register.mjs'

const REPO = path.resolve(import.meta.dirname, '..')

function sandbox(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dshb-skill-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const home = path.join(dir, 'home')
  const root = path.join(dir, 'pkg')
  fs.mkdirSync(home)
  installApp(REPO, root)
  return { dir, home, root, file: codexSkillPath(home) }
}

test('registration installs a discoverable skill, is idempotent, and follows package updates', (t) => {
  const s = sandbox(t)
  assert.equal(registerCodexSkill(s.root, s.home).state, 'installed')
  const skill = path.join(s.file, 'SKILL.md')
  assert.match(fs.readFileSync(skill, 'utf8'), /name: dsh-baton/)
  assert.equal(registerCodexSkill(s.root, s.home).state, 'unchanged')
  fs.appendFileSync(path.join(s.root, 'skills', 'dsh-baton', 'SKILL.md'), '\nUpdated workflow.\n')
  assert.match(fs.readFileSync(skill, 'utf8'), /Updated workflow/)
  assert.equal(removeCodexSkill([s.root], s.home).state, 'removed')
  assert.equal(fs.existsSync(s.file), false)
  assert.ok(fs.existsSync(path.join(s.root, 'skills', 'dsh-baton', 'SKILL.md')))
  assert.equal(removeCodexSkill([s.root], s.home).state, 'absent')
})

test('registration and removal preserve a user-owned directory', (t) => {
  const s = sandbox(t)
  fs.mkdirSync(s.file, { recursive: true })
  fs.writeFileSync(path.join(s.file, 'SKILL.md'), 'My workflow')
  assert.throws(() => registerCodexSkill(s.root, s.home), /already exists; preserved/)
  assert.equal(removeCodexSkill([s.root], s.home).state, 'kept')
  assert.equal(fs.readFileSync(path.join(s.file, 'SKILL.md'), 'utf8'), 'My workflow')
})

test('registration preserves a user-owned file and a link to another skill, including a dangling link', (t) => {
  const s = sandbox(t)
  fs.mkdirSync(path.dirname(s.file), { recursive: true })
  fs.writeFileSync(s.file, 'mine')
  assert.throws(() => registerCodexSkill(s.root, s.home), /already exists; preserved/)
  assert.equal(removeCodexSkill([s.root], s.home).state, 'kept')
  assert.equal(fs.readFileSync(s.file, 'utf8'), 'mine')
  fs.unlinkSync(s.file)
  const other = path.join(s.dir, 'other')
  fs.mkdirSync(other)
  fs.symlinkSync(other, s.file, process.platform === 'win32' ? 'junction' : 'dir')
  assert.throws(() => registerCodexSkill(s.root, s.home), /already exists; preserved/)
  assert.equal(removeCodexSkill([s.root], s.home).state, 'kept')
  fs.rmdirSync(other)
  assert.throws(() => registerCodexSkill(s.root, s.home), /already exists; preserved/)
  assert.equal(removeCodexSkill([s.root], s.home).state, 'kept')
  assert.ok(fs.lstatSync(s.file).isSymbolicLink())
})

test('removal only removes links to the specified package roots', (t) => {
  const s = sandbox(t)
  registerCodexSkill(s.root, s.home)
  assert.equal(removeCodexSkill([path.join(s.dir, 'elsewhere')], s.home).state, 'kept')
  // A package already removed still leaves an identifiable link to clean up.
  fs.rmSync(s.root, { recursive: true })
  assert.equal(removeCodexSkill([s.root], s.home).state, 'removed')
})

test('Harness registration installs and updates the bundled skill, and reports conflicts', (t) => {
  const s = sandbox(t)
  fs.mkdirSync(path.join(s.home, '.codex'))
  const app = path.join(s.home, '.dsh-baton', 'app')
  const run = () => autoRegister({ root: s.root, home: s.home, env: { PATH: '' }, app, find: () => process.execPath })
  const first = run()
  assert.equal(first.ok, true)
  assert.equal(first.codexSkill.state, 'installed')
  assert.equal(run().codexSkill.state, 'unchanged')
  const source = path.join(s.root, 'skills', 'dsh-baton', 'SKILL.md')
  fs.appendFileSync(source, '\nNew package workflow.\n')
  assert.equal(run().ok, true)
  assert.match(fs.readFileSync(path.join(s.file, 'SKILL.md'), 'utf8'), /New package workflow/)
  removeCodexSkill([app], s.home)
  fs.mkdirSync(s.file)
  fs.writeFileSync(path.join(s.file, 'SKILL.md'), 'My workflow')
  const conflict = run()
  assert.equal(conflict.ok, false)
  assert.equal(conflict.clients.find((c) => c.id === 'codex').state, 'failed')
  assert.match(conflict.codexSkill.error, /already exists; preserved/)
  assert.equal(fs.readFileSync(path.join(s.file, 'SKILL.md'), 'utf8'), 'My workflow')
})

test('a Claude-only installation leaves the Codex skill directory untouched', (t) => {
  const s = sandbox(t)
  fs.mkdirSync(path.join(s.home, '.claude'))
  const result = autoRegister({ root: s.root, home: s.home, env: { PATH: '' }, app: path.join(s.home, '.dsh-baton', 'app'), find: () => process.execPath })
  assert.equal(result.ok, true)
  assert.equal(result.codexSkill, undefined)
  assert.equal(fs.existsSync(path.join(s.home, '.agents')), false)
})

test('CLI setup installs, upgrades and removes the skill with the stable app copy', (t) => {
  const s = sandbox(t)
  fs.mkdirSync(path.join(s.home, '.codex'))
  const cached = path.join(s.dir, '_npx', 'pkg')
  installApp(REPO, cached)
  const baton = path.join(s.home, '.dsh-baton')
  const env = { ...process.env, HOME: s.home, USERPROFILE: s.home, CODEX_HOME: path.join(s.home, '.codex'), CLAUDE_CONFIG_DIR: s.home, DSH_HOME: path.join(s.home, '.dsh'), DSH_BATON_HOME: baton, DSH_BATON_SOCKET: path.join(s.dir, 'absent.sock') }
  const setup = (...args) => {
    const result = spawnSync(process.execPath, [path.join(cached, 'src', 'cli.mjs'), 'setup', ...args], { env, encoding: 'utf8', timeout: 15000 })
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
    return result.stdout
  }
  assert.match(setup(), /Codex skill: installed/)
  assert.equal(fs.realpathSync(s.file), path.join(baton, 'app', 'skills', 'dsh-baton'))
  assert.match(setup(), /Codex skill: unchanged/)
  const pkg = path.join(cached, 'package.json')
  const metadata = JSON.parse(fs.readFileSync(pkg, 'utf8'))
  fs.writeFileSync(pkg, JSON.stringify({ ...metadata, version: '0.6.8' }))
  fs.appendFileSync(path.join(cached, 'skills', 'dsh-baton', 'SKILL.md'), '\nUpgraded workflow.\n')
  setup()
  assert.match(fs.readFileSync(path.join(s.file, 'SKILL.md'), 'utf8'), /Upgraded workflow/)
  assert.match(setup('--remove'), /Codex skill: removed/)
  assert.equal(fs.existsSync(s.file), false)
  assert.equal(fs.existsSync(path.join(baton, 'app')), false)
  assert.ok(fs.existsSync(path.join(cached, 'skills', 'dsh-baton', 'SKILL.md')))
})
