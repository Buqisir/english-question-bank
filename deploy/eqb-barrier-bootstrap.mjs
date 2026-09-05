#!/usr/bin/env node
// One root bootstrap, not an application deployment or a general transaction engine.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  FILES, ROOT, INSTALLED, hash, safeNode, safeAncestors, readBarrier, parseBarrier,
  createBarrier, proveBinding, strictProof, withDeploymentLock, privateWrite, syncDirectory,
  readonlyCommand,
} from './eqb-deploy-barrier.mjs'

const SHA = /^[a-f0-9]{40}$/u
const DIGEST = /^[a-f0-9]{64}$/u
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u
const MANAGER = 'deploy/eqb-deploy-barrier.mjs'
const WRAPPER = 'deploy/eqb-deploy-controller'
export const PAYLOAD_PATHS = Object.freeze([...Object.keys(FILES), MANAGER].sort())
const modes = Object.fromEntries(PAYLOAD_PATHS.map((name) => [name,
  [WRAPPER, 'deploy/eqb-deploy-transport'].includes(name) ? 0o755 : 0o644]))
const check = (value, message) => { if (!value) throw new Error(message) }
const keys = (value, names) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('\n') === [...names].sort().join('\n')
const iso = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value))
  && new Date(value).toISOString() === value
export function canonical(value) {
  const sort = (entry) => Array.isArray(entry) ? entry.map(sort)
    : entry && typeof entry === 'object'
      ? Object.fromEntries(Object.keys(entry).sort().map((key) => [key, sort(entry[key])])) : entry
  return `${JSON.stringify(sort(value))}\n`
}
function decode(text) {
  const value = JSON.parse(text)
  check(canonical(value) === text, 'Noncanonical bootstrap bytes')
  return value
}
const STAGES = ['transport-load', 'dispatch-stage', 'manager-launch', 'journal-sync', 'journal-read',
  'remote-output', 'root-entry', 'deploy-lock', 'install-mutation', 'selected-preflight',
  'list-units', 'list-jobs', 'live-main', ...Array.from({ length: 6 }, (_, i) => `health-${i}`)]
export function failureResult(transactionId, stage, error = {}) {
  const d = error.diagnostic || {}
  return { conclusion: 'unknown', diagnostic: {
    code: ['ENOENT', 'EACCES', 'ETIMEDOUT', 'ENOBUFS'].includes(d.code) ? d.code : null,
    exitCode: Number.isInteger(d.exitCode) ? d.exitCode : null,
    stage: STAGES.includes(d.stage) ? d.stage : stage,
    stderrBytes: Number.isSafeInteger(d.stderrBytes) && d.stderrBytes >= 0 ? d.stderrBytes : 0,
    stdoutBytes: Number.isSafeInteger(d.stdoutBytes) && d.stdoutBytes >= 0 ? d.stdoutBytes : 0,
  }, retryAllowed: false, schemaVersion: 'eqb-barrier-failure-v1',
  transactionId: typeof transactionId === 'string' && UUID.test(transactionId) ? transactionId : null }
}
export function parseFailure(text, transactionId) {
  const value = decode(text)
  check(keys(value, ['conclusion', 'diagnostic', 'retryAllowed', 'schemaVersion', 'transactionId'])
    && value.schemaVersion === 'eqb-barrier-failure-v1' && value.conclusion === 'unknown'
    && value.retryAllowed === false && value.transactionId === transactionId
    && (transactionId === null || (typeof transactionId === 'string' && UUID.test(transactionId)))
    && keys(value.diagnostic, ['code', 'exitCode', 'stage', 'stderrBytes', 'stdoutBytes'])
    && STAGES.includes(value.diagnostic.stage)
    && canonical(failureResult(transactionId, value.diagnostic.stage, { diagnostic: value.diagnostic })) === text,
  'Invalid bootstrap failure')
  return value
}
export function parseInstallExecution(execution, expected) {
  try {
    const value = decode(execution.output)
    if (value.schemaVersion === 'eqb-barrier-failure-v1') return parseFailure(execution.output, expected.transactionId)
    const receipt = parseReceipt(execution.output, expected)
    check(execution.exitCode === (receipt.conclusion === 'success' ? 0 : 70), 'Exit/receipt mismatch')
    return receipt
  } catch {
    return failureResult(expected.transactionId, 'remote-output', { diagnostic: {
      exitCode: execution.exitCode, stdoutBytes: Buffer.byteLength(execution.output || ''),
    } })
  }
}
export function buildPayload(targetSha, read) {
  return canonical({ schemaVersion: 'eqb-barrier-payload-v1', targetSha,
    files: Object.fromEntries(PAYLOAD_PATHS.map((name) => {
      const bytes = Buffer.from(read(name))
      return [name, { mode: modes[name], sha256: hash(bytes), base64: bytes.toString('base64') }]
    })) })
}
export function parsePayload(text) {
  const value = decode(text)
  check(keys(value, ['schemaVersion', 'targetSha', 'files'])
    && value.schemaVersion === 'eqb-barrier-payload-v1' && typeof value.targetSha === 'string' && SHA.test(value.targetSha)
    && keys(value.files, PAYLOAD_PATHS), 'Invalid bootstrap payload')
  for (const [name, file] of Object.entries(value.files)) {
    check(keys(file, ['mode', 'sha256', 'base64']) && file.mode === modes[name]
      && typeof file.sha256 === 'string' && DIGEST.test(file.sha256) && typeof file.base64 === 'string', 'Invalid payload file')
    const bytes = Buffer.from(file.base64, 'base64')
    check(bytes.length > 0 && bytes.length < 1024 * 1024
      && bytes.toString('base64') === file.base64 && hash(bytes) === file.sha256, 'Payload hash mismatch')
  }
  return value
}
function exists(file) {
  try { fs.lstatSync(file); return true } catch (error) {
    if (error.code === 'ENOENT') return false
    throw error
  }
}
function metadata(file) {
  if (!exists(file)) return null
  const s = fs.lstatSync(file)
  return { uid: s.uid, gid: s.gid, mode: s.mode & 0o7777, dev: s.dev, ino: s.ino,
    nlink: s.nlink, kind: s.isSymbolicLink() ? 'link' : s.isFile() ? 'file' : s.isDirectory() ? 'directory' : 'other',
    sha256: s.isFile() ? hash(fs.readFileSync(file)) : null,
    target: s.isSymbolicLink() ? fs.readlinkSync(file) : null }
}
export function diagnostics(run = readonlyCommand) {
  // Diagnostic only: neither /proc nor systemd snapshots drain in-flight IPC.
  const processes = []
  for (const pid of fs.readdirSync('/proc').filter((name) => /^\d+$/u.test(name))) {
    let argv
    try { argv = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').filter(Boolean) }
    catch (error) { if (error.code === 'ENOENT' || error.code === 'ESRCH') continue; throw error }
    if (argv.some((arg) => arg === '/usr/local/libexec/eqb-deploy-controller-v1'
      || arg.startsWith('--unit=eqb-deploy-'))) processes.push(Number(pid))
  }
  return { processes: processes.sort((a, b) => a - b),
    units: run('list-units', '/usr/bin/systemctl', ['list-units', '--all', '--no-legend', '--no-pager', 'eqb-deploy-*'], { timeout: 15_000 }),
    jobs: run('list-jobs', '/usr/bin/systemctl', ['list-jobs', '--no-legend', '--no-pager'], { timeout: 15_000 }) }
}
export function currentMain(targetSha, run = readonlyCommand) {
  const text = run('live-main', '/usr/bin/curl', ['--fail', '--silent', '--show-error', '--max-time', '10',
    'https://api.github.com/repos/Buqisir/english-question-bank/git/ref/heads/main'], { timeout: 15_000 })
  try {
    const ref = JSON.parse(text)
    check(ref.ref === 'refs/heads/main' && ref.object?.type === 'commit' && ref.object.sha === targetSha,
      'Live main changed or unknown')
  } catch {
    const error = new Error('Live main output invalid or changed')
    error.diagnostic = { stage: 'live-main', exitCode: 0, stdoutBytes: Buffer.byteLength(text) }
    throw error
  }
}
function configuration(options = {}) {
  return { root: ROOT, uid: 0, gid: 0, installed: FILES, manager: INSTALLED,
    proof: strictProof, diagnostics, ancestors: safeAncestors, currentMain, ...options }
}
function hostPaths(config, previousSha, targetSha) {
  const base = path.join(config.root, 'deployments')
  const version = path.join(base, 'host-configuration/versions', previousSha)
  return {
    lock: path.join(base, 'deploy.lock'),
    pointer: path.join(base, 'host-configuration/current'),
    production: path.join(config.root, 'current'),
    marker: path.join(version, '.eqb-host-configuration.json'),
    previous: version,
    target: path.join(base, 'host-configuration/versions', targetSha),
    barrier: path.join(base, 'root-dispatch-barrier.json'),
    hostActive: path.join(base, 'host-configuration-update/active.json'),
    recoveryModule: path.join(base, 'host-configuration-update/recovery-controller.mjs'),
    persistenceActive: path.join(base, 'reviewed-persistence/active.json'),
    manager: config.manager,
    ...Object.fromEntries(Object.keys(FILES).map((name) => [name,
      config.installed[name] || path.join(version, name)])),
  }
}
export function inspectHost(payloadText, options = {}) {
  const config = configuration(options)
  const payload = parsePayload(payloadText)
  safeNode(path.join(config.root, 'deployments'), 'directory', config.uid, config.gid)
  const pointer = metadata(path.join(config.root, 'deployments/host-configuration/current'))
  const production = metadata(path.join(config.root, 'current'))
  check(pointer?.kind === 'link' && /^versions\/[a-f0-9]{40}$/u.test(pointer.target), 'Invalid host pointer')
  check(production?.kind === 'link' && /^releases\/[a-f0-9]{40}$/u.test(production.target), 'Invalid production pointer')
  const previousSha = pointer.target.slice(9)
  const productionSha = production.target.slice(9)
  const paths = hostPaths(config, previousSha, payload.targetSha)
  for (const name of ['lock', 'marker', 'manager', ...Object.keys(FILES)]) {
    config.ancestors(paths[name], config.uid, config.gid)
  }
  const nodes = Object.fromEntries(Object.entries(paths).map(([key, file]) => [key, metadata(file)]))
  let barrier = { state: 'absent', value: null }
  if (nodes.barrier) {
    try { barrier = { state: 'valid', value: readBarrier(config.root, config.uid, config.gid) } }
    catch { barrier = { state: 'invalid', value: null } }
  }
  const binding = { productionSha }
  const module = proveBinding(binding, previousSha, config)
  safeNode(paths.lock, 'file', config.uid, config.gid, 0o600)
  config.proof(module, productionSha)
  const report = { schemaVersion: 'eqb-barrier-readiness-v1', targetSha: payload.targetSha,
    payloadDigest: hash(payloadText), previousSha, productionSha,
    inspectedAt: new Date().toISOString(), nodes, barrier,
    diagnostics: config.diagnostics(), health: 'passed' }
  return parseReadiness(canonical(report), payloadText)
}
export function parseReadiness(text, payloadText) {
  const payload = parsePayload(payloadText)
  const value = decode(text)
  check(keys(value, ['schemaVersion', 'targetSha', 'payloadDigest', 'previousSha', 'productionSha',
    'inspectedAt', 'nodes', 'barrier', 'diagnostics', 'health'])
    && value.schemaVersion === 'eqb-barrier-readiness-v1' && value.targetSha === payload.targetSha
    && value.payloadDigest === hash(payloadText) && typeof value.previousSha === 'string' && SHA.test(value.previousSha)
    && typeof value.productionSha === 'string' && SHA.test(value.productionSha) && iso(value.inspectedAt)
    && keys(value.barrier, ['state', 'value'])
    && ['absent', 'valid', 'invalid'].includes(value.barrier.state) && value.health === 'passed'
    && keys(value.diagnostics, ['processes', 'units', 'jobs'])
    && Array.isArray(value.diagnostics.processes)
    && value.diagnostics.processes.every((pid) => Number.isSafeInteger(pid) && pid > 0)
    && typeof value.diagnostics.units === 'string' && typeof value.diagnostics.jobs === 'string', 'Invalid readiness')
  check(keys(value.nodes, Object.keys(hostPaths(configuration(), value.previousSha, value.targetSha))), 'Invalid readiness nodes')
  if (value.barrier.state === 'valid') parseBarrier(`${JSON.stringify(value.barrier.value)}\n`)
  else check(value.barrier.value === null, 'Invalid barrier observation')
  check((value.barrier.state === 'absent') === (value.nodes.barrier === null), 'Barrier observation mismatch')
  for (const node of Object.values(value.nodes)) {
    if (node === null) continue
    check(keys(node, ['uid', 'gid', 'mode', 'dev', 'ino', 'nlink', 'kind', 'sha256', 'target'])
      && ['uid', 'gid', 'mode', 'dev', 'ino', 'nlink'].every((key) => Number.isSafeInteger(node[key]) && node[key] >= 0)
      && ['file', 'directory', 'link', 'other'].includes(node.kind)
      && (node.kind === 'file' ? typeof node.sha256 === 'string' && DIGEST.test(node.sha256) : node.sha256 === null)
      && (node.kind === 'link' ? typeof node.target === 'string' : node.target === null), 'Invalid node metadata')
  }
  return value
}
function requireReady(report, payload) {
  check(report.previousSha !== report.targetSha && report.barrier.state === 'absent', 'Already installed or barrier present')
  for (const name of ['target', 'manager', 'hostActive', 'persistenceActive', 'recoveryModule']) {
    check(report.nodes[name] === null, `Bootstrap entry exists: ${name}; inspect, do not retry`)
  }
  for (const name of ['deploy/Caddyfile.release', 'deploy/eqb-release.service', 'deploy/eqb-deploy-transport']) {
    check(report.nodes[name]?.sha256 === payload.files[name].sha256, `Frozen file differs: ${name}`)
  }
  for (const name of Object.keys(FILES)) check(report.nodes[name]?.mode === modes[name], `Installed mode differs: ${name}`)
}
export function parseReceipt(text, expected) {
  const value = decode(text)
  check(keys(value, ['schemaVersion', 'transactionId', 'payloadDigest', 'readinessDigest', 'previousSha',
    'targetSha', 'productionSha', 'conclusion', 'phase', 'startedAt', 'finishedAt', 'failure', 'barrierRetained'])
    && value.schemaVersion === 'eqb-barrier-install-v1' && typeof value.transactionId === 'string' && UUID.test(value.transactionId)
    && ['payloadDigest', 'readinessDigest'].every((key) => typeof value[key] === 'string' && DIGEST.test(value[key]))
    && ['previousSha', 'targetSha', 'productionSha'].every((key) => typeof value[key] === 'string' && SHA.test(value[key]))
    && ['success', 'known-failure', 'unknown'].includes(value.conclusion)
    && ['prepared', 'wrapper', 'barrier', 'pointer', 'proved', 'rolled-back'].includes(value.phase)
    && iso(value.startedAt) && iso(value.finishedAt) && value.finishedAt >= value.startedAt
    && typeof value.barrierRetained === 'boolean'
    && (value.failure === null || typeof value.failure === 'string')
    && (value.conclusion !== 'success' || (value.phase === 'proved' && value.barrierRetained && value.failure === null))
    && (value.conclusion !== 'known-failure' || value.phase === 'rolled-back'), 'Invalid install receipt')
  for (const [key, wanted] of Object.entries(expected)) check(value[key] === wanted, `Receipt binding mismatch: ${key}`)
  if (value.failure !== null) parseFailure(value.failure, value.transactionId)
  return value
}

export function parseRouteProof(text, expected) {
  const value = decode(text)
  check(keys(value, ['schemaVersion', 'install', 'forced', 'observedAt'])
    && value.schemaVersion === 'eqb-barrier-route-proof-v1'
    && ['passed', 'unknown'].includes(value.forced) && iso(value.observedAt), 'Invalid independent route proof')
  parseReceipt(canonical(value.install), expected)
  check(value.install.conclusion === 'success', 'Route proof requires completed locked installation')
  return value
}

// Caller owns the existing deploy.lock for this entire function. Production CLI
// below is the sole mutation entrypoint; injected paths/proofs are fake-host seams.
export function installLocked(payloadText, readinessText, transactionId, options = {}) {
  const config = configuration(options)
  const payload = parsePayload(payloadText)
  const previous = parseReadiness(readinessText, payloadText)
  check(typeof transactionId === 'string' && UUID.test(transactionId), 'Invalid transaction')
  const age = Date.now() - Date.parse(previous.inspectedAt)
  check(age >= 0 && age <= 120_000, 'Readiness stale or clock regressed')
  requireReady(previous, payload)
  const fresh = inspectHost(payloadText, config)
  check(canonical(fresh.nodes) === canonical(previous.nodes)
    && fresh.productionSha === previous.productionSha, 'Host identity changed since readiness')
  requireReady(fresh, payload)
  // CI authority is verified by the trusted Deployment adapter immediately
  // before dispatch; recheck live-main identity here, under the host lock.
  config.currentMain(payload.targetSha)
  const paths = hostPaths(config, previous.previousSha, payload.targetSha)
  const directory = path.join(config.root, 'deployments', `barrier-install-${transactionId}`)
  check(!exists(directory), 'Attempt exists; inspect, do not retry')
  fs.mkdirSync(directory, { mode: 0o700 })
  syncDirectory(path.dirname(directory))
  privateWrite(path.join(directory, 'payload.json'), payloadText)
  privateWrite(path.join(directory, 'readiness.json'), readinessText)
  const oldWrapper = fs.readFileSync(paths[WRAPPER])
  privateWrite(path.join(directory, 'previous-wrapper'), oldWrapper)
  const identity = { transactionId, previousSha: previous.previousSha, targetSha: payload.targetSha,
    productionSha: previous.productionSha, payloadDigest: hash(payloadText) }
  const receipt = { schemaVersion: 'eqb-barrier-install-v1', ...identity,
    readinessDigest: hash(readinessText), conclusion: 'unknown', phase: 'prepared',
    startedAt: new Date().toISOString(), finishedAt: null, failure: null, barrierRetained: false }
  const atomic = (file, bytes, mode) => {
    const temporary = `${file}.${transactionId}`
    privateWrite(temporary, bytes)
    fs.chmodSync(temporary, mode)
    const fd = fs.openSync(temporary, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW)
    try { fs.fsyncSync(fd) } finally { fs.closeSync(fd) }
    fs.renameSync(temporary, file)
    syncDirectory(path.dirname(file))
  }
  const select = (sha) => {
    const temporary = `${paths.pointer}.${transactionId}`
    fs.symlinkSync(`versions/${sha}`, temporary)
    fs.renameSync(temporary, paths.pointer)
    syncDirectory(path.dirname(paths.pointer))
  }
  try {
    atomic(config.manager, Buffer.from(payload.files[MANAGER].base64, 'base64'), 0o644)
    atomic(paths[WRAPPER], Buffer.from(payload.files[WRAPPER].base64, 'base64'), 0o755)
    receipt.phase = 'wrapper'
    config.diagnostics() // Record/inspection failure stops; snapshots grant no isolation.
    createBarrier(identity, config.root, config.uid, config.gid)
    receipt.phase = 'barrier'
    fs.mkdirSync(paths.target, { mode: 0o755 })
    fs.mkdirSync(path.join(paths.target, 'deploy'), { mode: 0o755 })
    for (const name of Object.keys(FILES).slice(0, 3)) {
      atomic(path.join(paths.target, name), Buffer.from(payload.files[name].base64, 'base64'), 0o644)
    }
    const files = Object.fromEntries(Object.keys(FILES).slice(0, 3).map((name) => [name, payload.files[name].sha256]))
    const stableLaunchers = Object.fromEntries(Object.keys(FILES).slice(3).map((name) => [name, payload.files[name].sha256]))
    atomic(path.join(paths.target, '.eqb-host-configuration.json'), JSON.stringify({
      schemaVersion: 'eqb-host-configuration-v1', sha: payload.targetSha, files, stableLaunchers,
      preparedAt: new Date().toISOString(),
    }), 0o644)
    syncDirectory(paths.target)
    syncDirectory(path.dirname(paths.target))
    select(payload.targetSha)
    receipt.phase = 'pointer'
    const module = proveBinding(identity, payload.targetSha, config)
    safeNode(config.manager, 'file', config.uid, config.gid, 0o644)
    check(hash(fs.readFileSync(config.manager)) === payload.files[MANAGER].sha256, 'Installed manager mismatch')
    config.proof(module, identity.productionSha)
    receipt.phase = 'proved'
    receipt.conclusion = 'success'
  } catch (error) {
    receipt.failure = canonical(failureResult(transactionId, 'install-mutation', error))
    // Only handled synchronous failures can attempt rollback while still locked.
    // A killed manager has no receipt: outcome unknown, never replay.
    try {
      select(identity.previousSha)
      atomic(paths[WRAPPER], oldWrapper, 0o755)
      const module = proveBinding(identity, identity.previousSha, config)
      config.proof(module, identity.productionSha)
      receipt.phase = 'rolled-back'
      receipt.conclusion = 'known-failure'
    } catch {
      // Best effort re-establish the gated target. Failure is still UNKNOWN;
      // no receipt or runbook may claim a partial rollback is isolated.
      try {
        atomic(paths[WRAPPER], Buffer.from(payload.files[WRAPPER].base64, 'base64'), 0o755)
        if (!exists(paths.barrier)) createBarrier(identity, config.root, config.uid, config.gid)
        if (receipt.phase === 'pointer') select(identity.targetSha)
      } catch { /* Preserve all files and report unknown; no automatic replay. */ }
      receipt.conclusion = 'unknown'
    }
  }
  receipt.barrierRetained = exists(paths.barrier)
  receipt.finishedAt = new Date().toISOString()
  const text = canonical(receipt)
  parseReceipt(text, identity)
  privateWrite(path.join(directory, 'receipt.json'), text)
  return receipt
}

function main() {
  check(process.getuid() === 0 && process.getgid() === 0, 'Root only')
  const [action, payloadPath, readinessPath, transactionId] = process.argv.slice(2)
  check(action === 'install' && process.argv.length === 6, 'Invalid root bootstrap invocation')
  for (const file of [fileURLToPath(import.meta.url), payloadPath, readinessPath,
    path.join(ROOT, 'deployments/deploy.lock'), INSTALLED, ...Object.values(FILES).filter(Boolean)]) safeAncestors(file)
  for (const file of [payloadPath, readinessPath]) safeNode(file, 'file', 0, 0, 0o600)
  safeNode(fileURLToPath(import.meta.url), 'file', 0, 0, 0o600)
  const payloadText = fs.readFileSync(payloadPath, 'utf8')
  check(hash(fs.readFileSync(new URL('./eqb-deploy-barrier.mjs', import.meta.url)))
    === parsePayload(payloadText).files[MANAGER].sha256, 'Manager source differs from payload')
  const receipt = withDeploymentLock(ROOT, () => installLocked(fs.readFileSync(payloadPath, 'utf8'),
    fs.readFileSync(readinessPath, 'utf8'), transactionId))
  process.stdout.write(canonical(receipt))
  process.exitCode = receipt.conclusion === 'success' ? 0 : 70
}
if (import.meta.url.startsWith('file:') && process.argv[1] === fileURLToPath(import.meta.url)) {
  try { main() } catch (error) {
    process.stdout.write(canonical(failureResult(process.argv[5], 'root-entry', error)))
    process.exitCode = 70
  }
}
