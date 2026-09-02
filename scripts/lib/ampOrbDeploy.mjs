import { randomUUID } from 'node:crypto'
import {
  chmodSync,
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readlinkSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

export const AMP_ORB_DEPLOY_REPOSITORY = 'Buqisir/english-question-bank'
export const AMP_ORB_DEPLOY_GITHUB_HOST = 'github.com'
export const AMP_ORB_DEPLOY_STATUS_CONTEXT = 'Amp Orb Verify'
export const AMP_ORB_DEPLOY_STATUS_TARGET = 'https://ampcode.com/threads/T-01a0570a-57a0-77ea-b243-54843baca65d'
export const AMP_ORB_DEPLOY_RECEIPT_SCHEMA_VERSION = 'amp-orb-deployment-receipt-v1'

const SHA = /^[a-f0-9]{40}$/u
const SSH_TARGET = /^(?:[A-Za-z0-9._-]+@)?(?:\[[A-Fa-f0-9:]+\]|[A-Za-z0-9.-]+)$/u

function assertSha(sha, label = 'deployment SHA') {
  if (!SHA.test(sha || '')) throw new Error(`Invalid ${label}`)
  return sha
}

function ensurePrivateDirectory(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  chmodSync(directory, 0o700)
}

function writePrivateFile(filePath, value) {
  const descriptor = openSync(filePath, 'wx', 0o600)
  try {
    writeFileSync(descriptor, value, 'utf8')
  } finally {
    closeSync(descriptor)
  }
  chmodSync(filePath, 0o600)
}

function normalizePrivateKey(value) {
  const normalized = String(value || '').replaceAll('\r\n', '\n').trim()
  const match = /^-----BEGIN ([A-Z0-9 ]*PRIVATE KEY)-----(.*?)-----END \1-----$/su.exec(normalized)
  if (!match) throw new Error('Deployment SSH private key has an unsupported encoding')
  const body = match[2].replaceAll(/\s/gu, '')
  if (!body || !/^[A-Za-z0-9+/=]+$/u.test(body)) {
    throw new Error('Deployment SSH private key body is invalid')
  }
  const lines = body.match(/.{1,70}/gu) || []
  return `-----BEGIN ${match[1]}-----\n${lines.join('\n')}\n-----END ${match[1]}-----\n`
}

function normalizeKnownHosts(value) {
  const normalized = String(value || '').replaceAll('\r\n', '\n').trim()
  if (!normalized || normalized.includes('\0')) {
    throw new Error('Deployment known_hosts is missing or invalid')
  }
  const entries = normalized
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
  if (!entries.some((line) => line.split(/\s+/u).length >= 3)) {
    throw new Error('Deployment known_hosts has no host key entry')
  }
  return `${normalized}\n`
}

export function requireDeployLatestAuthorization(argv) {
  if (!Array.isArray(argv) || !argv.includes('--owner-said-deploy-latest')) {
    throw new Error('Current Owner authorization “部署最新版” is required')
  }
  if (argv.includes('--sha')) {
    throw new Error('Deployment target SHA is resolved automatically; do not supply --sha')
  }
}

export function deploymentGitHubApiArgs(endpoint) {
  const prefix = `repos/${AMP_ORB_DEPLOY_REPOSITORY}/`
  const allowed = endpoint === `${prefix}git/ref/heads/main`
    || new RegExp(`^${prefix}commits/[a-f0-9]{40}/status$`, 'u').test(endpoint || '')
  if (!allowed) throw new Error('Deployment GitHub API endpoint is invalid')
  return ['api', '--hostname', AMP_ORB_DEPLOY_GITHUB_HOST, endpoint]
}

export function assertAuthoritativeDeploymentStatus(payload, expectedSha) {
  const sha = assertSha(expectedSha)
  if (payload?.sha !== sha || !Array.isArray(payload?.statuses)) {
    throw new Error('GitHub deployment status identity is invalid')
  }
  const matching = payload.statuses.filter(
    (candidate) => candidate?.context === AMP_ORB_DEPLOY_STATUS_CONTEXT,
  )
  const status = matching.reduce((latest, candidate) => {
    if (!latest) return candidate
    if (Number.isSafeInteger(candidate?.id) && Number.isSafeInteger(latest?.id)) {
      return candidate.id > latest.id ? candidate : latest
    }
    const candidateTime = Date.parse(candidate?.updated_at || candidate?.created_at || '')
    const latestTime = Date.parse(latest?.updated_at || latest?.created_at || '')
    if (Number.isFinite(candidateTime) && Number.isFinite(latestTime)) {
      return candidateTime > latestTime ? candidate : latest
    }
    throw new Error(`Required ${AMP_ORB_DEPLOY_STATUS_CONTEXT} status ordering is ambiguous`)
  }, null)
  if (!status) throw new Error(`Required ${AMP_ORB_DEPLOY_STATUS_CONTEXT} status is missing`)
  if (status.sha !== sha) {
    throw new Error(`Required ${AMP_ORB_DEPLOY_STATUS_CONTEXT} status SHA is invalid`)
  }
  if (status.state !== 'success') {
    throw new Error(`Required ${AMP_ORB_DEPLOY_STATUS_CONTEXT} status is ${status.state || 'unknown'}`)
  }
  if (status.target_url !== AMP_ORB_DEPLOY_STATUS_TARGET) {
    throw new Error(`Required ${AMP_ORB_DEPLOY_STATUS_CONTEXT} status source is invalid`)
  }
  return {
    context: AMP_ORB_DEPLOY_STATUS_CONTEXT,
    state: 'success',
    description: typeof status.description === 'string' ? status.description : '',
    targetUrl: AMP_ORB_DEPLOY_STATUS_TARGET,
  }
}

export async function resolveLatestDeploymentCandidate({ runGit, readMainSha, readCommitStatus }) {
  if (
    typeof runGit !== 'function'
    || typeof readMainSha !== 'function'
    || typeof readCommitStatus !== 'function'
  ) {
    throw new Error('Deployment candidate dependencies are missing')
  }
  const branch = String(await runGit(['branch', '--show-current'])).trim()
  if (branch !== 'main') throw new Error('Deployment checkout must be on main')
  const dirty = String(await runGit(['status', '--porcelain'])).trim()
  if (dirty) throw new Error('Deployment checkout must be tracked-clean')
  await runGit(['fetch', 'origin', 'main', '--quiet'])
  await runGit(['merge', '--ff-only', 'origin/main'])
  const localSha = assertSha(
    String(await runGit(['rev-parse', 'HEAD'])).trim(),
    'local deployment SHA',
  )
  const remoteSha = assertSha(await readMainSha(), 'GitHub main SHA')
  if (localSha !== remoteSha) {
    throw new Error('Deployment checkout is not the current GitHub main')
  }
  const status = assertAuthoritativeDeploymentStatus(
    await readCommitStatus(remoteSha),
    remoteSha,
  )
  return {
    repository: AMP_ORB_DEPLOY_REPOSITORY,
    sha: remoteSha,
    branch: 'main',
    status,
  }
}

export async function assertDeploymentCandidateStillCurrent({ readMainSha, sha }) {
  if (typeof readMainSha !== 'function') {
    throw new Error('Deployment GitHub main dependency is missing')
  }
  const expectedSha = assertSha(sha)
  const currentSha = assertSha(await readMainSha(), 'GitHub main SHA')
  if (currentSha !== expectedSha) {
    throw new Error('GitHub main changed during deployment; repeat “部署最新版”')
  }
  return currentSha
}

export function materializeDeploymentCredentials({
  privateKey,
  knownHosts,
  parent = tmpdir(),
} = {}) {
  const directory = mkdtempSync(path.join(parent, 'eqb-amp-deploy-'))
  chmodSync(directory, 0o700)
  const keyPath = path.join(directory, 'deploy-key')
  const knownHostsPath = path.join(directory, 'known_hosts')
  try {
    writePrivateFile(keyPath, normalizePrivateKey(privateKey))
    writePrivateFile(knownHostsPath, normalizeKnownHosts(knownHosts))
  } catch (error) {
    rmSync(directory, { recursive: true, force: true })
    throw error
  }
  return {
    directory,
    keyPath,
    knownHostsPath,
    cleanup() {
      rmSync(directory, { recursive: true, force: true })
    },
  }
}

export function deploymentSSHInvocation({
  host,
  keyPath,
  knownHostsPath,
  remoteArgs = ['bash', '-s'],
} = {}) {
  if (!SSH_TARGET.test(host || '') || String(host).startsWith('-')) {
    throw new Error('Deployment SSH target is invalid')
  }
  if (!path.isAbsolute(keyPath || '') || !path.isAbsolute(knownHostsPath || '')) {
    throw new Error('Deployment SSH credential paths must be absolute')
  }
  if (!Array.isArray(remoteArgs) || remoteArgs.some((value) => typeof value !== 'string')) {
    throw new Error('Deployment SSH remote command is invalid')
  }
  return {
    command: 'ssh',
    args: [
      '-F', '/dev/null',
      '-i', keyPath,
      '-o', 'BatchMode=yes',
      '-o', 'PasswordAuthentication=no',
      '-o', 'KbdInteractiveAuthentication=no',
      '-o', 'IdentitiesOnly=yes',
      '-o', 'StrictHostKeyChecking=yes',
      '-o', `UserKnownHostsFile=${knownHostsPath}`,
      '-o', 'GlobalKnownHostsFile=/dev/null',
      '-o', 'ConnectTimeout=15',
      host,
      ...remoteArgs,
    ],
  }
}

export function deploymentLockInvocation({ root, executable, args = [] } = {}) {
  if (!path.isAbsolute(root || '') || !path.isAbsolute(executable || '')) {
    throw new Error('Deployment lock root and executable must be absolute')
  }
  if (!Array.isArray(args) || args.some((value) => typeof value !== 'string')) {
    throw new Error('Deployment lock command is invalid')
  }
  return {
    command: 'flock',
    args: [
      '--exclusive',
      '--nonblock',
      '--conflict-exit-code', '75',
      path.join(root, 'deployments', 'deploy.lock'),
      executable,
      ...args,
    ],
  }
}

export function parseDeploymentPreflightOutput(output) {
  const expectedKeys = ['productionSha', 'trackedDirtyPaths', 'eqb', 'caddy', 'layout']
  const values = new Map()
  for (const line of String(output || '').trim().split('\n').filter(Boolean)) {
    const separator = line.indexOf('=')
    const key = line.slice(0, separator)
    const value = line.slice(separator + 1)
    if (separator < 1 || !expectedKeys.includes(key) || values.has(key)) {
      throw new Error('Deployment preflight response shape is invalid')
    }
    values.set(key, value)
  }
  if (expectedKeys.some((key) => !values.has(key))) {
    throw new Error('Deployment preflight response is incomplete')
  }
  const productionSha = assertSha(values.get('productionSha'), 'production SHA')
  const dirtyValue = values.get('trackedDirtyPaths')
  if (!/^\d+$/u.test(dirtyValue)) {
    throw new Error('Deployment preflight dirty count is invalid')
  }
  const serviceState = /^[a-z-]+$/u
  if (!serviceState.test(values.get('eqb')) || !serviceState.test(values.get('caddy'))) {
    throw new Error('Deployment preflight service state is invalid')
  }
  if (!['legacy', 'release'].includes(values.get('layout'))) {
    throw new Error('Deployment preflight layout is invalid')
  }
  return {
    productionSha,
    trackedDirtyPaths: Number(dirtyValue),
    eqb: values.get('eqb'),
    caddy: values.get('caddy'),
    layout: values.get('layout'),
  }
}

function releasePath(root, sha) {
  return path.join(root, 'releases', assertSha(sha))
}

function assertReleaseDirectory(root, sha) {
  const directory = releasePath(root, sha)
  if (!existsSync(directory) || !lstatSync(directory).isDirectory()) {
    throw new Error(`Prepared release ${sha} is missing`)
  }
  return directory
}

export function currentReleaseSha(root) {
  const currentPath = path.join(root, 'current')
  if (!existsSync(currentPath) || !lstatSync(currentPath).isSymbolicLink()) {
    throw new Error('Deployment current pointer is missing or not a symlink')
  }
  const releasesDir = path.join(root, 'releases')
  const target = path.resolve(path.dirname(currentPath), readlinkSync(currentPath))
  const relative = path.relative(releasesDir, target)
  if (!relative || relative.includes(path.sep) || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Deployment current pointer escapes the releases directory')
  }
  assertReleaseDirectory(root, relative)
  return assertSha(relative, 'current release SHA')
}

function switchCurrent(root, sha) {
  assertReleaseDirectory(root, sha)
  const currentPath = path.join(root, 'current')
  const temporary = path.join(root, `.current-${process.pid}-${randomUUID()}`)
  symlinkSync(path.join('releases', sha), temporary)
  try {
    renameSync(temporary, currentPath)
  } finally {
    rmSync(temporary, { force: true })
  }
}

function writeDeploymentReceipt(root, receipt) {
  const deploymentsDir = path.join(root, 'deployments')
  ensurePrivateDirectory(deploymentsDir)
  const receiptsDir = path.join(deploymentsDir, 'receipts')
  ensurePrivateDirectory(receiptsDir)
  const timestamp = receipt.finishedAt.replaceAll(/[^0-9]/gu, '')
  const receiptPath = path.join(
    receiptsDir,
    `${timestamp}-${receipt.targetSha}-${randomUUID()}.json`,
  )
  const temporary = `${receiptPath}.tmp`
  writePrivateFile(temporary, `${JSON.stringify(receipt, null, 2)}\n`)
  renameSync(temporary, receiptPath)
  chmodSync(receiptPath, 0o600)
  return receiptPath
}

export async function activatePreparedRelease({
  root,
  sha,
  restart,
  healthCheck,
  now = () => new Date().toISOString(),
} = {}) {
  if (!path.isAbsolute(root || '')) throw new Error('Deployment root must be absolute')
  if (typeof restart !== 'function' || typeof healthCheck !== 'function') {
    throw new Error('Deployment restart and health checks are required')
  }
  const targetSha = assertSha(sha)
  assertReleaseDirectory(root, targetSha)
  const previousSha = currentReleaseSha(root)
  const startedAt = now()

  if (previousSha === targetSha) {
    const healthy = await healthCheck({ sha: targetSha, phase: 'idempotent' })
    const receipt = {
      schemaVersion: AMP_ORB_DEPLOY_RECEIPT_SCHEMA_VERSION,
      state: 'reported',
      conclusion: healthy ? 'success' : 'failure',
      targetSha,
      previousSha,
      noOp: true,
      rolledBack: false,
      rollbackHealthy: null,
      failureCode: healthy ? null : 'CURRENT_RELEASE_UNHEALTHY',
      startedAt,
      finishedAt: now(),
    }
    return { receipt, receiptPath: writeDeploymentReceipt(root, receipt) }
  }

  let failureCode = null
  let switched = false
  let rolledBack = false
  let rollbackHealthy = null
  try {
    switchCurrent(root, targetSha)
    switched = true
    await restart({ sha: targetSha, phase: 'activate' })
    const healthy = await healthCheck({ sha: targetSha, phase: 'activate' })
    if (!healthy) failureCode = 'HEALTH_CHECK_FAILED'
  } catch {
    failureCode = 'ACTIVATION_FAILED'
  }

  if (failureCode && switched) {
    try {
      switchCurrent(root, previousSha)
      rolledBack = true
      await restart({ sha: previousSha, phase: 'rollback' })
      rollbackHealthy = await healthCheck({ sha: previousSha, phase: 'rollback' })
    } catch {
      rollbackHealthy = false
    }
  }

  const receipt = {
    schemaVersion: AMP_ORB_DEPLOY_RECEIPT_SCHEMA_VERSION,
    state: 'reported',
    conclusion: failureCode ? 'failure' : 'success',
    targetSha,
    previousSha,
    noOp: false,
    rolledBack,
    rollbackHealthy,
    failureCode,
    startedAt,
    finishedAt: now(),
  }
  return { receipt, receiptPath: writeDeploymentReceipt(root, receipt) }
}
