#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { upgradeHostConfigurationOnce } from '../deploy/upgrade-eqb-host-configuration-once.mjs'
import * as controllerEngine from '../deploy/eqb-deploy-controller.mjs'

const repository = fileURLToPath(new URL('..', import.meta.url))
const oldSha = '1'.repeat(40), targetSha = '2'.repeat(40), appSha = '3'.repeat(40)
const host = ['deploy/Caddyfile.release', 'deploy/eqb-release.service', 'deploy/eqb-deploy-controller.mjs']
const stable = ['deploy/eqb-deploy-transport', 'deploy/eqb-deploy-controller']
const payload = ['deploy/upgrade-eqb-host-configuration-once', 'deploy/upgrade-eqb-host-configuration-once.mjs']
const hash = value => createHash('sha256').update(value).digest('hex')

function fixture({ engineMode = 'success', preflightFailure = false } = {}) {
  const root = fs.mkdtempSync(path.join(tmpdir(), 'eqb-host-upgrade-'))
  const identity = fs.statSync(root)
  const config = { root, source: path.join(root, 'english-question-bank'), uid: identity.uid, gid: identity.gid,
    ancestorBoundary: root, unit: path.join(root, 'unit'), caddy: path.join(root, 'caddy'),
    controller: path.join(root, 'controller'), transport: path.join(root, 'transport') }
  const write = (file, bytes, mode = 0o600) => {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
    fs.writeFileSync(file, bytes, { mode })
  }
  const versions = path.join(root, 'deployments/host-configuration/versions')
  const pointer = path.join(root, 'deployments/host-configuration/current')
  const active = path.join(root, 'deployments/controlled-ssh/active.json')
  const operation = path.join(root, 'deployments/host-configuration-upgrade-v1', targetSha)
  const controllerSource = fs.readFileSync(path.join(repository, 'deploy/eqb-deploy-controller.mjs'))
  const oldFiles = Object.fromEntries([...host, ...stable].map(file =>
    [file, file === host[2] ? Buffer.concat([controllerSource, Buffer.from('\n// old module\n')]) : Buffer.from(`installed ${file}\n`)]))
  const targetFiles = { ...oldFiles, [host[2]]: Buffer.concat([controllerSource, Buffer.from('\n// new module\n')]) }
  const gitFiles = { [oldSha]: oldFiles, [targetSha]: targetFiles }
  for (const file of payload) {
    targetFiles[file] = fs.readFileSync(path.join(repository, file))
    write(path.join(root, `deployments/host-upgrade-payload-${targetSha}`, file), targetFiles[file])
  }
  const createVersion = sha => {
    const files = gitFiles[sha]
    for (const file of host) write(path.join(versions, sha, file), files[file], 0o444)
    write(path.join(versions, sha, '.eqb-host-configuration.json'), JSON.stringify({
      schemaVersion: 'eqb-host-configuration-v1', sha,
      files: Object.fromEntries(host.map(file => [file, hash(files[file])])),
      stableLaunchers: Object.fromEntries(stable.map(file => [file, hash(files[file])])),
    }))
  }
  createVersion(oldSha)
  fs.symlinkSync(path.join('versions', oldSha), pointer)
  write(config.unit, oldFiles[host[1]], 0o644)
  write(config.caddy, oldFiles[host[0]], 0o644)
  write(config.controller, oldFiles[stable[1]], 0o755)
  write(config.transport, oldFiles[stable[0]], 0o755)
  write(path.join(root, 'releases', appSha, '.eqb-release.json'), JSON.stringify({
    schemaVersion: 'eqb-release-v1', sha: appSha,
  }))
  fs.symlinkSync(path.join('releases', appSha), path.join(root, 'current'))
  write(path.join(root, 'shared/sentinel'), 'never touch database or R2')
  for (const name of ['data', 'paper-assets', 'exports', 'server-logs']) {
    fs.mkdirSync(path.join(root, 'shared', name), { mode: 0o700 })
  }
  fs.mkdirSync(config.source)
  write(path.join(root, 'shared/.env'), 'FIXTURE_ONLY=1\n')
  const lock = path.join(root, 'deployments/deploy.lock')
  write(lock, '', 0o600)
  const lockFd = fs.openSync(lock, 'r')
  const state = { calls: 0, loads: [], commands: [], engineMode, preflightFailure, reloads: 0 }
  const deps = {
    run(command, args) {
      state.commands.push([command, ...args])
      if (command === '/usr/sbin/runuser') {
        if (args.at(-1) === 'origin' && args.includes('get-url')) return Buffer.from('https://github.com/Buqisir/english-question-bank\n')
        if (args.includes('fetch')) return Buffer.from('')
        if (args.at(-1) === 'FETCH_HEAD') return Buffer.from(`${targetSha}\n`)
      }
      if (command === '/usr/bin/git') {
        const arguments_ = args.slice(args.indexOf(config.source) + 1)
        if (arguments_[0] === 'show') {
          const [sha, file] = arguments_[1].split(':')
          assert.ok(gitFiles[sha]?.[file], `fixture has Git blob ${sha}:${file}`)
          return gitFiles[sha][file]
        }
        if (arguments_[0] === 'diff') return Buffer.from(`${host[2]}\n`)
        if (arguments_[0] === 'rev-parse') return Buffer.from(`${appSha}\n`)
      }
      if (command === '/usr/bin/systemctl') return Buffer.from(args[0] === 'is-active' ? 'active\n' : '')
      if (command === '/usr/bin/curl') return Buffer.from('')
      if (command === '/usr/bin/caddy') { state.reloads++; return Buffer.from('') }
      throw Error(`Unexpected fixture command: ${command}`)
    },
    async load(file) {
      state.loads.push(file)
      if (state.engineMode === 'real-engine') {
        const runtime = {
          uid: () => config.uid,
          seal: directory => fs.chmodSync(directory, 0o755),
          sleep: async () => {},
          runSource(command, args) {
            if (args.includes('get-url')) return 'https://github.com/Buqisir/english-question-bank\n'
            if (args.includes('fetch')) return ''
            if (args.at(-1) === 'FETCH_HEAD') return `${targetSha}\n`
            throw Error('Unexpected real-engine source command')
          },
          runSystem(command, args, options = {}) {
            if (command === '/usr/bin/git' && args.includes('archive')) {
              fs.writeFileSync(options.stdio[1], 'fixture archive')
              return ''
            }
            if (command === '/usr/bin/git' && args.includes('diff')) {
              return args.includes(host[0]) ? `${host[2]}\n` : ''
            }
            if (command === '/usr/bin/tar') {
              const destination = args[args.indexOf('-C') + 1]
              for (const name of host) write(path.join(destination, name), targetFiles[name])
              return ''
            }
            if (['/usr/bin/node', '/usr/bin/systemd-analyze'].includes(command)) return ''
            return deps.run(command, args, options).toString()
          },
        }
        return {
          ...controllerEngine,
          runController(input) {
            if (input.originalCommand !== 'preflight') {
              state.calls++
              assert.ok(fs.existsSync(active))
            }
            return controllerEngine.runController({ ...input, dependencies: runtime, config: {
              root, source: config.source, controllerUid: config.uid, controllerGid: config.gid,
              runtimeUser: 'runtime', buildUser: 'build', sourceUser: 'source',
              systemdUnitPath: config.unit, caddyConfigPath: config.caddy,
              rootWrapperPath: config.controller, transportWrapperPath: config.transport,
              repositoryUrls: ['https://github.com/Buqisir/english-question-bank'],
              service: 'eqb', caddyService: 'caddy',
            } })
          },
        }
      }
      if (file.startsWith(path.join(versions, targetSha))) {
        return { async runController() {
          if (state.preflightFailure) throw Object.assign(Error('private health detail'), { code: 'PREFLIGHT_FAILED' })
          return { exitCode: 0, output: { productionSha: appSha, eqb: 'active', caddy: 'active', layout: 'release' } }
        } }
      }
      assert.equal(file, path.join(versions, oldSha, host[2]))
      return {
        HOST_CONFIGURATION_PATHS: host, STABLE_LAUNCHER_PATHS: stable,
        async runController({ originalCommand }) {
          state.calls++
          assert.equal(originalCommand, `update-host-config ${targetSha} ${hash(`${host[2]}\n`)}`)
          assert.ok(fs.existsSync(active), 'daily blockade exists before engine entry')
          const admission = JSON.parse(fs.readFileSync(path.join(operation, 'operation.json')))
          assert.equal(admission.phase, 'engine-running')
          for (const name of ['unit', 'caddy', 'module', 'marker']) {
            assert.equal(hash(fs.readFileSync(path.join(operation, name))), admission[`${name}BackupSha256`])
          }
          createVersion(targetSha)
          fs.unlinkSync(pointer)
          fs.symlinkSync(path.join('versions', targetSha), pointer)
          // Controller-only updates still copy unit/Caddy and reload.
          fs.writeFileSync(config.unit, targetFiles[host[1]])
          fs.writeFileSync(config.caddy, targetFiles[host[0]])
          if (state.engineMode === 'timeout') throw Object.assign(Error('private timeout detail'), { code: 'ETIMEDOUT' })
          if (state.engineMode === 'missing-receipt') return { exitCode: 0, output: null }
          if (state.engineMode === 'corrupt-unit') fs.writeFileSync(config.unit, 'interrupted host file')
          if (state.engineMode === 'bad-backup') {
            fs.writeFileSync(config.unit, 'interrupted host file')
            fs.writeFileSync(path.join(operation, 'unit'), 'bad backup')
          }
          const receipt = {
            schemaVersion: 'eqb-host-configuration-receipt-v1', targetSha,
            controllerVersion: 'eqb-deploy-controller-v1', state: 'reported',
            previousHostConfigurationSha: oldSha, changedHostConfigurationPaths: [host[2]],
            changedHostConfigurationPathsDigest: hash(`${host[2]}\n`), conclusion: 'success',
            recovered: false, installed: true, rolledBack: false, failureCode: null,
            staged: true, noOp: false, rollbackHealthy: null, startedAt: new Date().toISOString(),
            finishedAt: new Date().toISOString(),
          }
          const receiptPath = path.join(root, 'deployments/receipts/engine.json')
          if (state.engineMode === 'incomplete-receipt') delete receipt.staged
          write(receiptPath, JSON.stringify(state.engineMode === 'mismatched-receipt' ? { ...receipt, targetSha: oldSha } : receipt))
          return { exitCode: 0, output: { ...receipt, receiptPath } }
        },
      }
    },
  }
  return { root, config, state, deps, gitFiles, lock, lockFd, active, operation, pointer,
    run: () => upgradeHostConfigurationOnce({ targetSha, config, lockFd, dependencies: deps }),
    close: () => { fs.closeSync(lockFd); fs.rmSync(root, { recursive: true, force: true }) } }
}

export async function verifyHostConfigurationUpgrade() {
  let cases = 0
  const integration = fixture({ engineMode: 'real-engine' })
  try {
    const result = await integration.run()
    assert.equal(result.state, 'success', JSON.stringify(result))
    assert.equal(result.engineReceipt.recovered, false)
    assert.equal(result.engineReceipt.installed, true)
    assert.equal(integration.state.calls, 1)
    assert.equal(fs.existsSync(integration.active), false)
    cases++
  } finally { integration.close() }
  const success = fixture()
  try {
    const result = await success.run()
    assert.equal(result.state, 'success')
    assert.equal(result.previousApp, appSha)
    assert.equal(result.previousHostSha, oldSha)
    assert.equal(fs.readlinkSync(success.pointer), path.join('versions', targetSha))
    assert.equal(fs.readlinkSync(path.join(success.root, 'current')), path.join('releases', appSha))
    assert.equal(fs.existsSync(success.active), false)
    assert.equal(JSON.parse(fs.readFileSync(path.join(success.operation, 'operation.json'))).state, 'success')
    assert.ok(fs.existsSync(path.join(success.root, 'deployments/host-configuration/versions', oldSha)))
    await assert.rejects(success.run(), { code: 'OPERATION_CONSUMED' })
    assert.equal(success.state.calls, 1)
    cases++
  } finally { success.close() }

  for (const [name, mutate, code] of [
    ['installed digest', f => fs.writeFileSync(f.config.controller, 'bad launcher'), 'INSTALLED_FILE_DIGEST_MISMATCH'],
    ['payload digest', f => fs.writeFileSync(path.join(f.root, `deployments/host-upgrade-payload-${targetSha}`, payload[1]), 'bad payload'), 'PAYLOAD_DIGEST_MISMATCH'],
    ['target content digest', f => { f.gitFiles[targetSha][host[0]] = Buffer.from('changed caddy despite path advice') }, 'FROZEN_HOST_BYTES_CHANGED'],
    ['lock permissions', f => fs.chmodSync(f.lock, 0o644), 'UNSAFE_FILE'],
    ['lock hardlink', f => fs.linkSync(f.lock, path.join(f.root, 'second-lock-link')), 'UNSAFE_FILE'],
    ['lock inode', f => { fs.unlinkSync(f.lock); fs.writeFileSync(f.lock, '', { mode: 0o600 }) }, 'LOCK_IDENTITY_MISMATCH'],
  ]) {
    const f = fixture()
    try {
      mutate(f)
      await assert.rejects(f.run(), { code }, name)
      assert.equal(f.state.calls, 0)
      assert.equal(f.state.loads.length, 0)
      assert.equal(fs.existsSync(f.operation), false)
      cases++
    } finally { f.close() }
  }
  for (const file of ['root-dispatch-barrier.json', 'reviewed-persistence/active.json',
    'host-configuration-update/active.json', 'host-configuration-update/recovery-controller.mjs',
    'controlled-ssh/active.json']) {
    const f = fixture()
    try {
      const pending = path.join(f.root, 'deployments', file)
      fs.mkdirSync(path.dirname(pending), { recursive: true, mode: 0o700 })
      fs.writeFileSync(pending, 'retained unresolved evidence', { mode: 0o600 })
      await assert.rejects(f.run(), { code: 'UNRESOLVED_MAINTENANCE' })
      assert.equal(fs.readFileSync(pending, 'utf8'), 'retained unresolved evidence')
      assert.equal(f.state.calls, 0)
      cases++
    } finally { f.close() }
  }
  for (const mode of ['corrupt-unit', 'preflight-failure']) {
    const f = fixture({ engineMode: mode, preflightFailure: mode === 'preflight-failure' })
    try {
      const result = await f.run()
      assert.equal(result.state, 'failure')
      assert.equal(result.rollbackHealthy, true)
      assert.equal(fs.readlinkSync(f.pointer), path.join('versions', oldSha))
      assert.equal(fs.readFileSync(f.config.unit, 'utf8'), f.gitFiles[oldSha][host[1]].toString())
      assert.equal(fs.readFileSync(f.config.caddy, 'utf8'), f.gitFiles[oldSha][host[0]].toString())
      assert.equal(fs.existsSync(f.active), true)
      assert.equal(f.state.reloads, 1)
      assert.equal(fs.readFileSync(path.join(f.root, 'shared/sentinel'), 'utf8'), 'never touch database or R2')
      await assert.rejects(f.run(), { code: 'UNRESOLVED_MAINTENANCE' })
      cases++
    } finally { f.close() }
  }
  for (const mode of ['timeout', 'missing-receipt', 'incomplete-receipt', 'mismatched-receipt', 'bad-backup']) {
    const f = fixture({ engineMode: mode })
    try {
      const result = await f.run()
      assert.equal(result.state, 'unknown')
      assert.equal(result.retryAllowed, false)
      assert.equal(fs.existsSync(f.active), true)
      assert.equal(fs.readlinkSync(f.pointer), path.join('versions', targetSha))
      assert.equal(f.state.reloads, 0)
      assert.equal(JSON.stringify(result).includes('private timeout detail'), false)
      await assert.rejects(f.run(), { code: 'UNRESOLVED_MAINTENANCE' })
      // Even loss of the blockade cannot turn the consumed operation into replay.
      fs.unlinkSync(f.active)
      await assert.rejects(f.run(), { code: 'OPERATION_CONSUMED' })
      await assert.rejects(upgradeHostConfigurationOnce({ targetSha: '4'.repeat(40),
        config: f.config, lockFd: f.lockFd, dependencies: f.deps }), { code: 'UNRESOLVED_UPGRADE_HISTORY' })
      assert.equal(f.state.calls, 1)
      cases++
    } finally { f.close() }
  }
  const shell = fs.readFileSync(path.join(repository, payload[0]), 'utf8')
  assert.ok(shell.includes('/usr/bin/flock --exclusive --nonblock --conflict-exit-code 75 9'))
  assert.ok(shell.indexOf('/usr/bin/flock') < shell.indexOf('/usr/bin/node --no-addons'))
  assert.ok(shell.includes("stat -Lc '%d:%i' /proc/self/fd/9"))
  console.log(`PASS host-configuration upgrade: ${cases} fixture scenarios; lock identity, content binding, blockade, rollback, UNKNOWN/no replay`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await verifyHostConfigurationUpgrade()
}
