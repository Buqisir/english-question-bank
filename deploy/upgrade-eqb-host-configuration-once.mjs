#!/usr/bin/env node
// Version 1: a root-console-only, controller-only host upgrade. No replay or
// recovery command is exposed. Production paths and privileges are fixed.
import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const SHA = /^[a-f0-9]{40}$/u
const HOST = ['deploy/Caddyfile.release', 'deploy/eqb-release.service', 'deploy/eqb-deploy-controller.mjs']
const STABLE = ['deploy/eqb-deploy-transport', 'deploy/eqb-deploy-controller']
const PAYLOAD = ['deploy/upgrade-eqb-host-configuration-once', 'deploy/upgrade-eqb-host-configuration-once.mjs']
export const HOST_UPGRADE_CONFIG = Object.freeze({
  root: '/opt/eqb', source: '/opt/eqb/english-question-bank',
  uid: 0, gid: 0, ancestorBoundary: '/',
  unit: '/etc/systemd/system/eqb.service', caddy: '/etc/caddy/Caddyfile',
  controller: '/usr/local/libexec/eqb-deploy-controller-v1',
  transport: '/usr/local/libexec/eqb-deploy-transport-v1',
})
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const fail = code => { throw Object.assign(new Error(code), { code }) }
const check = (condition, code) => { if (!condition) fail(code) }
function exists(file) {
  try { fs.lstatSync(file); return true } catch (error) { if (error.code === 'ENOENT') return false; throw error }
}
function sync(directory) {
  const fd = fs.openSync(directory, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW)
  try { fs.fsyncSync(fd) } finally { fs.closeSync(fd) }
}
function directory(file, config) {
  const state = fs.lstatSync(file)
  check(state.isDirectory() && !state.isSymbolicLink() && state.uid === config.uid
    && state.gid === config.gid && !(state.mode & 0o022), 'UNSAFE_DIRECTORY')
}
function ancestors(file, config) {
  const relative = path.relative(config.ancestorBoundary, file)
  check(!relative.startsWith('..') && !path.isAbsolute(relative), 'UNSAFE_PATH')
  for (let parent = path.dirname(file); ; parent = path.dirname(parent)) {
    directory(parent, config)
    if (parent === config.ancestorBoundary) break
    check(parent !== path.dirname(parent), 'UNSAFE_PATH')
  }
}
function read(file, config, mode = null) {
  ancestors(file, config)
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW)
  try {
    const state = fs.fstatSync(fd)
    check(state.isFile() && state.uid === config.uid && state.gid === config.gid
      && state.nlink === 1 && !(state.mode & 0o022)
      && (mode === null || (state.mode & 0o7777) === mode), 'UNSAFE_FILE')
    return fs.readFileSync(fd)
  } finally { fs.closeSync(fd) }
}
function mkdir(file, config) {
  ancestors(file, config)
  fs.mkdirSync(file, { mode: 0o700 })
  sync(path.dirname(file))
  directory(file, config)
}
function publish(file, bytes, mode = 0o600) {
  const temporary = path.join(path.dirname(file), `.upgrade-${randomUUID()}`)
  const fd = fs.openSync(temporary, 'wx', mode)
  try {
    fs.writeFileSync(fd, bytes)
    fs.fsyncSync(fd)
  } finally { fs.closeSync(fd) }
  fs.renameSync(temporary, file)
  sync(path.dirname(file))
}
function point(pointer, destination) {
  const temporary = path.join(path.dirname(pointer), `.upgrade-${randomUUID()}`)
  fs.symlinkSync(destination, temporary)
  fs.renameSync(temporary, pointer)
  sync(path.dirname(pointer))
}
function selected(pointer, versions, config) {
  ancestors(pointer, config)
  const state = fs.lstatSync(pointer)
  check(state.isSymbolicLink() && state.uid === config.uid && state.gid === config.gid, 'UNSAFE_POINTER')
  const directory = path.resolve(path.dirname(pointer), fs.readlinkSync(pointer))
  const sha = path.relative(versions, directory)
  check(SHA.test(sha) && !sha.includes(path.sep), 'INVALID_POINTER')
  return sha
}
function assertLock(config, fd) {
  const file = path.join(config.root, 'deployments/deploy.lock')
  read(file, config, 0o600)
  const state = fs.lstatSync(file, { bigint: true }), held = fs.fstatSync(fd, { bigint: true })
  check(state.dev === held.dev && state.ino === held.ino && held.isFile(), 'LOCK_IDENTITY_MISMATCH')
}
function unresolved(config) {
  return ['root-dispatch-barrier.json', 'reviewed-persistence/active.json',
    'host-configuration-update/active.json', 'host-configuration-update/recovery-controller.mjs',
    'controlled-ssh/active.json'].some(file => exists(path.join(config.root, 'deployments', file)))
}
function productionRun(command, args, options = {}) {
  return execFileSync(command, args, { timeout: 120_000, maxBuffer: 4 * 1024 * 1024,
    env: { PATH: '/usr/local/bin:/usr/bin:/bin', GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: '/dev/null', GIT_NO_REPLACE_OBJECTS: '1' },
    ...options })
}
function git(config, dependencies, args) {
  return dependencies.run('/usr/bin/git', ['--no-replace-objects', '-c', `safe.directory=${config.source}`, '-C', config.source, ...args])
}
function blob(config, dependencies, sha, file) {
  return Buffer.from(git(config, dependencies, ['show', `${sha}:${file}`]))
}
function fetchMain(config, dependencies) {
  const source = args => dependencies.run('/usr/sbin/runuser', ['-u', 'eqb', '--',
    '/usr/bin/env', '-i', 'HOME=/home/eqb', 'PATH=/usr/local/bin:/usr/bin:/bin',
    'GIT_TERMINAL_PROMPT=0', 'GCM_INTERACTIVE=never',
    'GIT_SSH_COMMAND=/usr/bin/ssh -F /dev/null -o BatchMode=yes -o PasswordAuthentication=no',
    '/usr/bin/git', '-C', config.source, ...args])
  check(['https://github.com/Buqisir/english-question-bank', 'https://github.com/Buqisir/english-question-bank.git',
    'git@github.com:Buqisir/english-question-bank', 'git@github.com:Buqisir/english-question-bank.git',
    'ssh://git@github.com/Buqisir/english-question-bank.git']
    .includes(String(source(['remote', 'get-url', 'origin'])).trim()), 'ORIGIN_MISMATCH')
  source(['fetch', '--quiet', '--no-tags', 'origin', 'main'])
  return String(source(['rev-parse', 'FETCH_HEAD'])).trim()
}
function appSha(config, dependencies) {
  const sha = selected(path.join(config.root, 'current'), path.join(config.root, 'releases'), config)
  const marker = JSON.parse(read(path.join(config.root, 'releases', sha, '.eqb-release.json'), config))
  check(marker.schemaVersion === 'eqb-release-v1' && marker.sha === sha, 'APPLICATION_MARKER_INVALID')
  check(String(git(config, dependencies, ['rev-parse', `${sha}^{commit}`])).trim() === sha, 'APPLICATION_COMMIT_INVALID')
  return sha
}
function hostIdentity(config, dependencies) {
  const root = path.join(config.root, 'deployments/host-configuration')
  const sha = selected(path.join(root, 'current'), path.join(root, 'versions'), config)
  const version = path.join(root, 'versions', sha)
  const marker = JSON.parse(read(path.join(version, '.eqb-host-configuration.json'), config))
  check(marker.schemaVersion === 'eqb-host-configuration-v1' && marker.sha === sha
    && Object.keys(marker.files || {}).sort().join('\n') === [...HOST].sort().join('\n')
    && Object.keys(marker.stableLaunchers || {}).sort().join('\n') === [...STABLE].sort().join('\n'),
  'HOST_MARKER_INVALID')
  const locations = { 'deploy/eqb-release.service': config.unit, 'deploy/Caddyfile.release': config.caddy,
    'deploy/eqb-deploy-controller': config.controller, 'deploy/eqb-deploy-transport': config.transport }
  const digests = { ...marker.files, ...marker.stableLaunchers }
  for (const name of [...HOST, ...STABLE]) {
    const expected = hash(blob(config, dependencies, sha, name))
    check(digests[name] === expected, 'INSTALLED_GIT_DIGEST_MISMATCH')
    if (HOST.includes(name)) check(hash(read(path.join(version, name), config)) === expected, 'INSTALLED_MODULE_DIGEST_MISMATCH')
    if (locations[name]) check(hash(read(locations[name], config)) === expected, 'INSTALLED_FILE_DIGEST_MISMATCH')
  }
  return { sha, version, digests }
}
function healthy(config, dependencies) {
  for (const service of ['eqb', 'caddy']) {
    check(String(dependencies.run('/usr/bin/systemctl', ['is-active', service])).trim() === 'active', 'SERVICE_UNHEALTHY')
  }
  for (const [url, extra] of [
    ['http://127.0.0.1:8787/api/health', []],
    ['https://eqbank.cc/api/health', ['--resolve', 'eqbank.cc:443:127.0.0.1']],
    ['https://eqbank.cc/', ['--resolve', 'eqbank.cc:443:127.0.0.1']],
    ['https://eqbank.cc/api/health', []], ['https://eqbank.cc/', []],
    ['https://eqbank.cc/ops/', []], ['https://eqbank.cc/ops/?view=review', []],
  ]) dependencies.run('/usr/bin/curl', ['--fail', '--silent', '--show-error', '--max-time', '10',
    '--output', '/dev/null', ...extra, url])
}
function reload(config, dependencies) {
  dependencies.run('/usr/bin/systemctl', ['daemon-reload'])
  dependencies.run('/usr/bin/caddy', ['reload', '--config', config.caddy], { timeout: 30_000 })
}

export async function upgradeHostConfigurationOnce({ targetSha, config = HOST_UPGRADE_CONFIG,
  lockFd = 9, dependencies = {} } = {}) {
  const deps = { run: productionRun, load: file => import(pathToFileURL(file).href), ...dependencies }
  check(SHA.test(targetSha || ''), 'INVALID_TARGET')
  assertLock(config, lockFd)
  check(!unresolved(config), 'UNRESOLVED_MAINTENANCE')
  const base = path.join(config.root, 'deployments')
  const operations = path.join(base, 'host-configuration-upgrade-v1')
  const operation = path.join(operations, targetSha)
  check(!exists(operation), 'OPERATION_CONSUMED')
  if (exists(operations)) {
    directory(operations, config)
    for (const name of fs.readdirSync(operations)) {
      check(SHA.test(name), 'UNRESOLVED_UPGRADE_HISTORY')
      const prior = JSON.parse(read(path.join(operations, name, 'operation.json'), config, 0o600))
      check(prior.schemaVersion === 'eqb-host-configuration-upgrade-v1' && prior.targetSha === name
        && prior.state === 'success' && prior.phase === 'verified'
        && Number.isFinite(Date.parse(prior.finishedAt)), 'UNRESOLVED_UPGRADE_HISTORY')
    }
  }
  check(fetchMain(config, deps) === targetSha, 'MAIN_MISMATCH')
  const previousApp = appSha(config, deps), previous = hostIdentity(config, deps)
  check(previous.sha !== targetSha, 'ALREADY_INSTALLED')
  check(!exists(path.join(base, 'host-configuration/versions', targetSha)), 'TARGET_VERSION_ALREADY_PRESENT')
  const payload = path.join(base, `host-upgrade-payload-${targetSha}`)
  const payloadDigests = {}
  for (const name of PAYLOAD) {
    const bytes = read(path.join(payload, name), config)
    payloadDigests[name] = hash(bytes)
    check(hash(blob(config, deps, targetSha, name)) === payloadDigests[name], 'PAYLOAD_DIGEST_MISMATCH')
  }
  const changed = String(git(config, deps, ['diff', '--name-only', '--no-renames', '--no-ext-diff',
    '--no-textconv', previous.sha, targetSha, '--', ...HOST, ...STABLE])).trim().split('\n').filter(Boolean).sort()
  check(changed.join('\n') === 'deploy/eqb-deploy-controller.mjs', 'CONTROLLER_ONLY_UPGRADE_REQUIRED')
  const changedPathsDigest = hash(`${changed.join('\n')}\n`)
  const targetDigests = Object.fromEntries([...HOST, ...STABLE].map(name =>
    [name, hash(blob(config, deps, targetSha, name))]))
  for (const name of [...HOST, ...STABLE].filter(name => name !== changed[0])) {
    check(targetDigests[name] === previous.digests[name], 'FROZEN_HOST_BYTES_CHANGED')
  }
  check(targetDigests[changed[0]] !== previous.digests[changed[0]], 'CONTROLLER_BYTES_UNCHANGED')
  // This maintenance entry supports the repaired daily entrypoint only. Both
  // reviewed Git modules must retain its blockade check; older layouts stop.
  const dailyGuard = "pathEntryExists(path.join(PRODUCTION_CONFIG.root, 'deployments/controlled-ssh/active.json'))"
  for (const sha of [previous.sha, targetSha]) {
    check(blob(config, deps, sha, 'deploy/eqb-deploy-controller.mjs').toString().includes(dailyGuard),
      'UNSUPPORTED_DAILY_ADMISSION')
  }
  healthy(config, deps)
  // Import only the verified installed immutable version, after lock acquisition.
  const engine = await deps.load(path.join(previous.version, 'deploy/eqb-deploy-controller.mjs'))
  check(typeof engine.runController === 'function'
    && [...engine.HOST_CONFIGURATION_PATHS].sort().join('\n') === [...HOST].sort().join('\n')
    && [...engine.STABLE_LAUNCHER_PATHS].sort().join('\n') === [...STABLE].sort().join('\n'), 'ENGINE_CONTRACT_INVALID')
  assertLock(config, lockFd)
  check(!unresolved(config) && appSha(config, deps) === previousApp
    && hostIdentity(config, deps).sha === previous.sha, 'PRECONDITION_CHANGED')
  if (!exists(operations)) mkdir(operations, config)
  else directory(operations, config)
  mkdir(operation, config) // Permanent per-target tombstone, including interrupted admission.
  const activeRoot = path.join(base, 'controlled-ssh')
  if (!exists(activeRoot)) mkdir(activeRoot, config)
  else directory(activeRoot, config)
  const active = path.join(activeRoot, 'active.json')
  const record = path.join(operation, 'operation.json')
  const heldLock = fs.fstatSync(lockFd, { bigint: true })
  const state = { schemaVersion: 'eqb-host-configuration-upgrade-v1', targetSha, pid: process.pid,
    lockDevice: String(heldLock.dev), lockInode: String(heldLock.ino),
    previousApp, previousHostSha: previous.sha, previousDigests: previous.digests, targetDigests,
    payloadDigests, changedPaths: changed, changedPathsDigest, state: 'unknown', phase: 'admission',
    retryAllowed: false, startedAt: new Date().toISOString(), engineReceipt: null }
  const save = () => publish(record, `${JSON.stringify(state, null, 2)}\n`)
  const blockBytes = Buffer.from(`${JSON.stringify({ schemaVersion: state.schemaVersion,
    targetSha, recordPath: record, retryAllowed: false })}\n`)
  // Disk record first, then daily-entry-recognized blockade, before any engine
  // call. Crash here leaves a consumed operation and/or blockade, never a replay.
  save()
  check(!exists(active), 'UNRESOLVED_MAINTENANCE')
  const blockFd = fs.openSync(active, 'wx', 0o600)
  try { fs.writeFileSync(blockFd, blockBytes); fs.fsyncSync(blockFd) } finally { fs.closeSync(blockFd) }
  sync(activeRoot)
  let knownEngineResult = false
  try {
    state.phase = 'backup'
    save()
    for (const [name, installed] of [['unit', config.unit], ['caddy', config.caddy]]) {
      const bytes = read(installed, config)
      publish(path.join(operation, name), bytes)
      state[`${name}BackupSha256`] = hash(bytes)
    }
    // Also retain old immutable module/marker bytes and hashes independently
    // of the engine's own durable backups. Never delete either old version.
    for (const [name, file] of [['module', 'deploy/eqb-deploy-controller.mjs'], ['marker', '.eqb-host-configuration.json']]) {
      const bytes = read(path.join(previous.version, file), config)
      publish(path.join(operation, name), bytes)
      state[`${name}BackupSha256`] = hash(bytes)
    }
    check(!['root-dispatch-barrier.json', 'reviewed-persistence/active.json',
      'host-configuration-update/active.json', 'host-configuration-update/recovery-controller.mjs']
      .some(file => exists(path.join(base, file)))
      && read(active, config, 0o600).equals(blockBytes), 'UNRESOLVED_MAINTENANCE')
    check(fetchMain(config, deps) === targetSha, 'MAIN_MISMATCH')
    state.phase = 'engine-running'
    save()
    const result = await engine.runController({ originalCommand: `update-host-config ${targetSha} ${changedPathsDigest}` })
    state.phase = 'engine-receipt'
    const receipt = result?.output
    const receiptKeys = ['schemaVersion', 'controllerVersion', 'state', 'conclusion', 'targetSha',
      'previousHostConfigurationSha', 'changedHostConfigurationPaths', 'changedHostConfigurationPathsDigest',
      'staged', 'installed', 'noOp', 'rolledBack', 'rollbackHealthy', 'recovered', 'failureCode',
      'startedAt', 'finishedAt', 'receiptPath']
    check(receipt?.schemaVersion === 'eqb-host-configuration-receipt-v1'
      && Object.keys(receipt).sort().join('\n') === receiptKeys.sort().join('\n')
      && receipt.controllerVersion === 'eqb-deploy-controller-v1' && receipt.state === 'reported'
      && receipt.targetSha === targetSha && receipt.previousHostConfigurationSha === previous.sha
      && receipt.changedHostConfigurationPathsDigest === changedPathsDigest
      && JSON.stringify(receipt.changedHostConfigurationPaths) === JSON.stringify(changed)
      && ['success', 'failure'].includes(receipt.conclusion)
      && result.exitCode === (receipt.conclusion === 'success' ? 0 : 1)
      && ['staged', 'installed', 'rolledBack'].every(key => typeof receipt[key] === 'boolean')
      && [null, true, false].includes(receipt.rollbackHealthy)
      && (receipt.failureCode === null || typeof receipt.failureCode === 'string')
      && receipt.recovered === false && receipt.noOp === false
      && typeof receipt.startedAt === 'string' && Number.isFinite(Date.parse(receipt.startedAt))
      && typeof receipt.finishedAt === 'string' && Number.isFinite(Date.parse(receipt.finishedAt)), 'ENGINE_RECEIPT_INVALID')
    check(typeof receipt.receiptPath === 'string'
      && path.dirname(receipt.receiptPath) === path.join(base, 'receipts'), 'ENGINE_RECEIPT_PATH_INVALID')
    const diskReceipt = JSON.parse(read(receipt.receiptPath, config, 0o600))
    const { receiptPath, ...wireReceipt } = receipt
    check(JSON.stringify(diskReceipt) === JSON.stringify(wireReceipt), 'ENGINE_RECEIPT_DISK_MISMATCH')
    knownEngineResult = true
    state.engineReceipt = receipt
    state.phase = 'postcheck'
    save()
    if (receipt.conclusion !== 'success') fail('ENGINE_REPORTED_FAILURE')
    check(receipt.installed === true && receipt.rolledBack === false && receipt.failureCode === null, 'ENGINE_SUCCESS_INVALID')
    const installed = hostIdentity(config, deps)
    check(installed.sha === targetSha && [...HOST, ...STABLE].every(name => installed.digests[name] === targetDigests[name]),
      'TARGET_INSTALLATION_MISMATCH')
    const next = await deps.load(path.join(installed.version, 'deploy/eqb-deploy-controller.mjs'))
    const preflight = await next.runController({ originalCommand: 'preflight' })
    check(preflight.exitCode === 0 && preflight.output.productionSha === previousApp
      && preflight.output.layout === 'release' && preflight.output.eqb === 'active'
      && preflight.output.caddy === 'active', 'NEW_MODULE_PREFLIGHT_FAILED')
    check(appSha(config, deps) === previousApp, 'APPLICATION_POINTER_CHANGED')
    check(!exists(path.join(base, 'host-configuration-update/active.json'))
      && !exists(path.join(base, 'host-configuration-update/recovery-controller.mjs')), 'ENGINE_MAINTENANCE_UNRESOLVED')
    healthy(config, deps)
    assertLock(config, lockFd)
    check(read(active, config, 0o600).equals(blockBytes), 'BLOCKADE_CHANGED')
    state.state = 'success'
    state.phase = 'verified'
    state.finishedAt = new Date().toISOString()
    save() // A crash after this but before unlink still requires reconciliation.
    fs.unlinkSync(active)
    sync(activeRoot)
  } catch (error) {
    state.state = 'unknown'
    state.errorCode = /^[A-Z][A-Z0-9_]{0,63}$/u.test(error.code || '') ? error.code : 'UPGRADE_ERROR'
    // Missing/ambiguous engine completion is UNKNOWN, even if disk looks old or
    // healthy. Do not call the engine again or enter its implicit recovery path.
    if (knownEngineResult && state.phase === 'postcheck') {
      state.phase = 'host-rollback'
      save()
      try {
        check(appSha(config, deps) === previousApp, 'APPLICATION_POINTER_CHANGED')
        for (const [name, destination] of [['unit', config.unit], ['caddy', config.caddy]]) {
          const bytes = read(path.join(operation, name), config, 0o600)
          check(hash(bytes) === state[`${name}BackupSha256`], 'BACKUP_DIGEST_MISMATCH')
          publish(destination, bytes, 0o644)
        }
        point(path.join(base, 'host-configuration/current'), path.join('versions', previous.sha))
        reload(config, deps)
        check(hostIdentity(config, deps).sha === previous.sha && appSha(config, deps) === previousApp, 'ROLLBACK_IDENTITY_MISMATCH')
        healthy(config, deps)
        state.state = 'failure'
        state.rollbackHealthy = true
      } catch {
        state.state = 'unknown'
        state.rollbackHealthy = false
      }
    }
    state.finishedAt = new Date().toISOString()
    // Even an unlink-directory fsync failure must fail closed for daily entry.
    if (!exists(active)) publish(active, blockBytes)
    save() // All failures retain the daily blockade, even healthy host rollback.
  }
  return state
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    check(process.getuid() === 0 && process.getgid() === 0 && process.argv.length === 3, 'ROOT_ONLY')
    const targetSha = process.argv[2]
    check(SHA.test(targetSha || '') && fileURLToPath(import.meta.url)
      === `/opt/eqb/deployments/host-upgrade-payload-${targetSha}/deploy/upgrade-eqb-host-configuration-once.mjs`, 'PAYLOAD_PATH_INVALID')
    // The shell owns this inherited open file description. Reject direct Node
    // calls that merely open the right inode without acquiring its flock.
    check(/^lock:\s+\d+:\s+FLOCK\s+ADVISORY\s+WRITE\s/um.test(
      fs.readFileSync('/proc/self/fdinfo/9', 'utf8')), 'LOCK_NOT_HELD')
    const result = await upgradeHostConfigurationOnce({ targetSha })
    process.stdout.write(`EQB_HOST_UPGRADE ${JSON.stringify(result)}\n`)
    process.exitCode = result.state === 'success' ? 0 : result.state === 'failure' ? 1 : 70
  } catch {
    process.stderr.write('EQB_HOST_UPGRADE_REJECTED_OR_UNKNOWN; inspect retained evidence; do not retry\n')
    process.exitCode = 70
  }
}
