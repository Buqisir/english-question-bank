#!/usr/bin/env node
// Fixed root entrypoint. No application code, credentials, or configurable CLI paths.
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export const SCHEMA = 'eqb-root-dispatch-barrier-v1'
export const ROOT = '/opt/eqb'
export const INSTALLED = '/usr/local/libexec/eqb-deploy-barrier-v1.mjs'
export const FILES = Object.freeze({
  'deploy/Caddyfile.release': '/etc/caddy/Caddyfile',
  'deploy/eqb-release.service': '/etc/systemd/system/eqb.service',
  'deploy/eqb-deploy-controller.mjs': null,
  'deploy/eqb-deploy-controller': '/usr/local/libexec/eqb-deploy-controller-v1',
  'deploy/eqb-deploy-transport': '/usr/local/libexec/eqb-deploy-transport-v1',
})
const SHA = /^[a-f0-9]{40}$/u
const DIGEST = /^[a-f0-9]{64}$/u
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u
const MARKER = '.eqb-host-configuration.json'
const STATE = 'root-dispatch-barrier.json'
const keys = ['schemaVersion', 'transactionId', 'previousSha', 'targetSha', 'productionSha',
  'payloadDigest', 'phase', 'createdAt', 'finishedAt']
export const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
const check = (ok, message) => { if (!ok) throw new Error(message) }
const exactKeys = (value, expected) => value && !Array.isArray(value)
  && Object.keys(value).sort().join('\n') === [...expected].sort().join('\n')
const timestamp = (value) => typeof value === 'string'
  && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value

export function parseBarrier(text) {
  const value = JSON.parse(text)
  check(exactKeys(value, keys) && value.schemaVersion === SCHEMA
    && keys.filter((key) => key !== 'finishedAt').every((key) => typeof value[key] === 'string')
    && UUID.test(value.transactionId) && SHA.test(value.previousSha)
    && SHA.test(value.targetSha) && value.previousSha !== value.targetSha
    && SHA.test(value.productionSha) && DIGEST.test(value.payloadDigest)
    && ['active', 'finalized', 'recovered'].includes(value.phase)
    && timestamp(value.createdAt)
    && (value.phase === 'active' ? value.finishedAt === null
      : timestamp(value.finishedAt) && value.finishedAt >= value.createdAt), 'Invalid barrier')
  // The wire/state format is canonical: rejects duplicate keys and ambiguous JSON.
  check(text === `${JSON.stringify(value)}\n`, 'Noncanonical barrier')
  return value
}

export function safeNode(file, kind, uid = 0, mode = null) {
  const state = fs.lstatSync(file)
  check(state.uid === uid && state.gid === uid && !state.isSymbolicLink()
    && (kind === 'directory' ? state.isDirectory() : state.isFile() && state.nlink === 1)
    && (state.mode & 0o022) === 0
    && (mode === null || (state.mode & 0o7777) === mode), `Unsafe ${kind}: ${file}`)
  return state
}

export function safeAncestors(file, uid = 0) {
  for (let parent = path.dirname(file); ; parent = path.dirname(parent)) {
    safeNode(parent, 'directory', uid)
    if (parent === path.dirname(parent)) break
  }
}

export function syncDirectory(directory) {
  const fd = fs.openSync(directory, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW)
  try { fs.fsyncSync(fd) } finally { fs.closeSync(fd) }
}

export function privateWrite(file, text) {
  const fd = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_CREAT
    | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600)
  try { fs.writeFileSync(fd, text); fs.fsyncSync(fd) } finally { fs.closeSync(fd) }
  syncDirectory(path.dirname(file))
}

export function readBarrier(root = ROOT, uid = 0) {
  const directory = path.join(root, 'deployments')
  safeNode(directory, 'directory', uid)
  const file = path.join(directory, STATE)
  try { fs.lstatSync(file) } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
  safeNode(file, 'file', uid, 0o600)
  return parseBarrier(fs.readFileSync(file, 'utf8'))
}

export function assertDispatch(command, root = ROOT, uid = 0) {
  // Readonly remains available even when the barrier is corrupt. Inspection
  // reports corruption; preflight proves the existing controller/health route.
  if (command === 'preflight') return
  check(/^(deploy [a-f0-9]{40}|(?:deploy-reviewed-persistence|update-host-config) [a-f0-9]{40} [a-f0-9]{64})$/u.test(command || ''), 'Invalid dispatch')
  check(readBarrier(root, uid) === null, 'ROOT_DISPATCH_BARRIER_PRESENT')
}

export function bindBarrier(value, expected) {
  for (const name of ['transactionId', 'previousSha', 'targetSha', 'productionSha', 'payloadDigest']) {
    check(value[name] === expected[name], `Barrier identity mismatch: ${name}`)
  }
}

function entryExists(file) {
  try { fs.lstatSync(file); return true } catch (error) {
    if (error.code === 'ENOENT') return false
    throw error
  }
}

function noMaintenance(root, uid) {
  for (const kind of ['host-configuration-update', 'reviewed-persistence']) {
    const directory = path.join(root, 'deployments', kind)
    if (!entryExists(directory)) continue
    safeNode(directory, 'directory', uid)
    check(!entryExists(path.join(directory, 'active.json')), 'Existing maintenance state; inspect first')
  }
}

export function createBarrier(expected, root = ROOT, uid = 0) {
  check(readBarrier(root, uid) === null, 'Barrier already exists; inspect, do not retry')
  noMaintenance(root, uid)
  const value = { schemaVersion: SCHEMA, ...expected, phase: 'active', createdAt: new Date().toISOString(), finishedAt: null }
  const text = `${JSON.stringify(value)}\n`
  parseBarrier(text)
  check(!entryExists(path.join(root, 'deployments', `root-dispatch-${value.transactionId}.json`)), 'Transaction already consumed')
  privateWrite(path.join(root, 'deployments', STATE), text)
  return value
}

function pointer(root, relative, expected, uid) {
  const file = path.join(root, relative)
  const state = fs.lstatSync(file)
  check(state.isSymbolicLink() && state.uid === uid && state.gid === uid
    && fs.readlinkSync(file) === expected, `Pointer mismatch: ${relative}`)
}

export function proveBinding(value, sha, { root = ROOT, uid = 0, installed = FILES } = {}) {
  const base = path.join(root, 'deployments/host-configuration')
  safeNode(base, 'directory', uid)
  safeNode(path.join(base, 'versions'), 'directory', uid)
  pointer(root, 'current', `releases/${value.productionSha}`, uid)
  const release = path.join(root, 'releases', value.productionSha)
  safeNode(path.join(root, 'releases'), 'directory', uid)
  safeNode(release, 'directory', uid)
  safeNode(path.join(release, '.eqb-release.json'), 'file', uid)
  const releaseMarker = JSON.parse(fs.readFileSync(path.join(release, '.eqb-release.json'), 'utf8'))
  check(releaseMarker.schemaVersion === 'eqb-release-v1' && releaseMarker.sha === value.productionSha,
    'Production marker mismatch')
  pointer(root, 'deployments/host-configuration/current', `versions/${sha}`, uid)
  const version = path.join(base, 'versions', sha)
  safeNode(version, 'directory', uid)
  safeNode(path.join(version, 'deploy'), 'directory', uid)
  safeNode(path.join(version, MARKER), 'file', uid)
  const marker = JSON.parse(fs.readFileSync(path.join(version, MARKER), 'utf8'))
  const hosts = Object.keys(FILES).slice(0, 3)
  const launchers = Object.keys(FILES).slice(3)
  check(exactKeys(marker, ['schemaVersion', 'sha', 'files', 'stableLaunchers', 'preparedAt'])
    && marker.schemaVersion === 'eqb-host-configuration-v1' && marker.sha === sha
    && exactKeys(marker.files, hosts) && exactKeys(marker.stableLaunchers, launchers)
    && timestamp(marker.preparedAt), 'Host marker mismatch')
  for (const name of Object.keys(FILES)) {
    const digest = marker.files[name] ?? marker.stableLaunchers[name]
    check(DIGEST.test(digest), 'Invalid installed hash')
    const files = hosts.includes(name) ? [path.join(version, name)] : []
    if (installed[name]) files.push(installed[name])
    for (const file of files) {
      safeNode(file, 'file', uid)
      check(hash(fs.readFileSync(file)) === digest, `Installed hash mismatch: ${name}`)
    }
  }
  return path.join(version, 'deploy/eqb-deploy-controller.mjs')
}

const environment = { PATH: '/usr/local/bin:/usr/bin:/bin:/usr/sbin' }
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { env: environment, encoding: 'utf8', timeout: 60_000, ...options })
  check(!result.error && result.status === 0, 'Readonly proof failed; retain barrier')
  return result.stdout
}

export function strictProof(module, productionSha) {
  const report = JSON.parse(run('/usr/bin/node', ['--no-addons', module], {
    env: { ...environment, SSH_ORIGINAL_COMMAND: 'preflight' },
  }))
  check(exactKeys(report, ['schemaVersion', 'controllerVersion', 'productionSha', 'eqb', 'caddy', 'layout'])
    && report.schemaVersion === 'eqb-deployment-preflight-v2'
    && report.controllerVersion === 'eqb-deploy-controller-v1'
    && report.productionSha === productionSha && report.layout === 'release'
    && report.eqb === 'active' && report.caddy === 'active', 'Readonly preflight mismatch')
  for (const args of [
    ['http://127.0.0.1:8787/api/health'],
    ['--resolve', 'eqbank.cc:443:127.0.0.1', 'https://eqbank.cc/api/health'],
    ['https://eqbank.cc/api/health'], ['https://eqbank.cc/'],
    ['https://eqbank.cc/ops/'], ['https://eqbank.cc/ops/?view=review'],
  ]) run('/usr/bin/curl', ['--fail', '--silent', '--show-error', '--max-time', '10', '--output', '/dev/null', ...args])
}

export function finishBarrier(action, expected, { root = ROOT, uid = 0, proof = strictProof, installed = FILES } = {}) {
  check(['finalize', 'recover'].includes(action), 'Invalid finish action')
  const value = readBarrier(root, uid)
  check(value, 'No barrier; inspect terminal receipts, do not retry')
  bindBarrier(value, expected)
  noMaintenance(root, uid)
  const phase = action === 'finalize' ? 'finalized' : 'recovered'
  check(value.phase === 'active' || value.phase === phase, 'Conflicting terminal phase')
  // Recovery acknowledges an independently restored previous version. It does
  // not roll back files, restart services, or replay an interrupted operation.
  const module = proveBinding(value, action === 'finalize' ? value.targetSha : value.previousSha, { root, uid, installed })
  proof(module, value.productionSha)
  const directory = path.join(root, 'deployments')
  const active = path.join(directory, STATE)
  const receipt = path.join(directory, `root-dispatch-${value.transactionId}.json`)
  check(!entryExists(receipt), 'Terminal receipt exists; inspect ambiguity')
  const temporary = `${active}.${value.transactionId}`
  if (value.phase === 'active') {
    privateWrite(temporary, `${JSON.stringify({ ...value, phase, finishedAt: new Date().toISOString() })}\n`)
    fs.renameSync(temporary, active)
    syncDirectory(directory)
  }
  // Atomic removal from the admission path retains the exact durable evidence.
  fs.renameSync(active, receipt)
  syncDirectory(directory)
  return parseBarrier(fs.readFileSync(receipt, 'utf8'))
}

function identity(args) {
  check(args.length === 5, 'Expected transaction previous target production payload-digest')
  const [transactionId, previousSha, targetSha, productionSha, payloadDigest] = args
  return { transactionId, previousSha, targetSha, productionSha, payloadDigest }
}

export function withDeploymentLock(root, callback, uid = 0) {
  const lock = path.join(root, 'deployments/deploy.lock')
  safeNode(lock, 'file', uid, 0o600)
  const fd = fs.openSync(lock, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW)
  try {
    // flock(2) belongs to this inherited open-file description. The parent
    // retains it until finally; no environment flag can bypass acquisition.
    const result = spawnSync('/usr/bin/flock', ['--exclusive', '--nonblock', '--conflict-exit-code', '75', '3'], {
      env: environment, stdio: ['ignore', 'ignore', 'ignore', fd],
    })
    check(!result.error && result.status === 0, 'Deployment lock busy or unknown')
    const current = safeNode(lock, 'file', uid, 0o600)
    const opened = fs.fstatSync(fd)
    check(current.dev === opened.dev && current.ino === opened.ino, 'Deployment lock replaced')
    return callback()
  } finally { fs.closeSync(fd) }
}

function main() {
  check(process.getuid() === 0 && process.getgid() === 0, 'Root only')
  safeAncestors(INSTALLED)
  safeNode(INSTALLED, 'file', 0, 0o644)
  check(fileURLToPath(import.meta.url) === INSTALLED, 'Run the fixed installed module')
  safeAncestors(path.join(ROOT, 'deployments/deploy.lock'))
  safeNode(path.join(ROOT, 'deployments/deploy.lock'), 'file', 0, 0o600)
  const [action, ...args] = process.argv.slice(2)
  check(['inspect', 'create', 'finalize', 'recover'].includes(action), 'Invalid barrier action')
  withDeploymentLock(ROOT, () => {
    if (action === 'inspect') {
      check(args.length === 0, 'Inspect accepts no arguments')
      process.stdout.write(`${JSON.stringify({ schemaVersion: SCHEMA, barrier: readBarrier() })}\n`)
      return
    }
    for (const file of Object.values(FILES).filter(Boolean)) safeAncestors(file)
    const expected = identity(args)
    const value = action === 'create' ? createBarrier(expected) : finishBarrier(action, expected)
    process.stdout.write(`${JSON.stringify(value)}\n`)
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { main() } catch (error) {
    process.stderr.write(`Root dispatch barrier failed closed: ${error.message}\n`)
    process.exitCode = 70
  }
}
