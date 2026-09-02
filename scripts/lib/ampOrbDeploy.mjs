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
export const AMP_ORB_DEPLOY_REQUIRED_CHECKS = Object.freeze(['verify', 'e2e'])
export const AMP_ORB_DEPLOY_CHECK_APP = 'github-actions'
export const AMP_ORB_DEPLOY_RECEIPT_SCHEMA_VERSION = 'amp-orb-deployment-receipt-v1'
export const EQB_LEGACY_BASELINE_RECEIPT_SCHEMA_VERSION = 'eqb-legacy-baseline-receipt-v1'
export const EQB_BOOTSTRAP_KEY_RETIREMENT_SCHEMA_VERSION = 'eqb-bootstrap-key-retirement-v1'

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

export function requireLegacyBaselineAuthorization(argv) {
  if (!Array.isArray(argv) || !argv.includes('--owner-said-baseline-migration')) {
    throw new Error('Current Owner authorization for the protected baseline migration is required')
  }
  if (argv.includes('--sha')) {
    throw new Error('Baseline target SHA is resolved automatically; do not supply --sha')
  }
}

export function requireReleaseLayoutBootstrapAuthorization(argv) {
  if (!Array.isArray(argv) || !argv.includes('--owner-said-release-bootstrap')) {
    throw new Error('Current Owner authorization for the one-time release-layout bootstrap is required')
  }
  if (argv.includes('--sha')) {
    throw new Error('Bootstrap target SHA is resolved automatically; do not supply --sha')
  }
}

export function deploymentGitHubApiArgs(endpoint) {
  const prefix = `repos/${AMP_ORB_DEPLOY_REPOSITORY}/`
  const allowed = endpoint === `${prefix}git/ref/heads/main`
    || new RegExp(`^${prefix}commits/[a-f0-9]{40}/check-runs\\?filter=latest&per_page=100$`, 'u')
      .test(endpoint || '')
  if (!allowed) throw new Error('Deployment GitHub API endpoint is invalid')
  return ['api', '--hostname', AMP_ORB_DEPLOY_GITHUB_HOST, endpoint]
}

export function assertAuthoritativeDeploymentChecks(payload, expectedSha) {
  const sha = assertSha(expectedSha)
  if (!Array.isArray(payload?.check_runs)) {
    throw new Error('GitHub deployment checks response is invalid')
  }

  const checks = AMP_ORB_DEPLOY_REQUIRED_CHECKS.map((name) => {
    const matching = payload.check_runs.filter((candidate) => candidate?.name === name)
    const check = matching.reduce((latest, candidate) => {
      if (!Number.isSafeInteger(candidate?.id)) {
        throw new Error(`Required ${name} check ordering is invalid`)
      }
      return !latest || candidate.id > latest.id ? candidate : latest
    }, null)
    if (!check) throw new Error(`Required ${name} check is missing`)
    if (check.head_sha !== sha) {
      throw new Error(`Required ${name} check SHA is invalid`)
    }
    if (check.app?.slug !== AMP_ORB_DEPLOY_CHECK_APP) {
      throw new Error(`Required ${name} check source is invalid`)
    }
    if (check.status !== 'completed' || check.conclusion !== 'success') {
      throw new Error(`Required ${name} check is ${check.conclusion || check.status || 'unknown'}`)
    }
    const expectedTarget = `https://${AMP_ORB_DEPLOY_GITHUB_HOST}/${AMP_ORB_DEPLOY_REPOSITORY}/actions/runs/`
    if (!String(check.details_url || '').startsWith(expectedTarget)) {
      throw new Error(`Required ${name} check target is invalid`)
    }
    if (!Number.isSafeInteger(check.check_suite?.id)) {
      throw new Error(`Required ${name} check suite identity is invalid`)
    }
    return {
      name,
      state: 'success',
      app: AMP_ORB_DEPLOY_CHECK_APP,
      checkRunId: check.id,
      checkSuiteId: check.check_suite.id,
      detailsUrl: check.details_url,
    }
  })
  if (new Set(checks.map(({ checkSuiteId }) => checkSuiteId)).size !== 1) {
    throw new Error('Required deployment checks are not from one workflow run')
  }
  return {
    provider: AMP_ORB_DEPLOY_CHECK_APP,
    checks,
  }
}

export async function resolveLatestDeploymentCandidate({ runGit, readMainSha, readCommitChecks }) {
  if (
    typeof runGit !== 'function'
    || typeof readMainSha !== 'function'
    || typeof readCommitChecks !== 'function'
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
  const verification = assertAuthoritativeDeploymentChecks(
    await readCommitChecks(remoteSha),
    remoteSha,
  )
  return {
    repository: AMP_ORB_DEPLOY_REPOSITORY,
    sha: remoteSha,
    branch: 'main',
    verification,
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

export function parseDeploymentControllerOutput(output, expectedSha) {
  const sha = assertSha(expectedSha)
  let receipt
  try {
    receipt = JSON.parse(String(output || '').trim())
  } catch {
    throw new Error('Deployment controller response is not valid JSON')
  }
  const expectedKeys = [
    'conclusion',
    'controllerVersion',
    'failureCode',
    'finishedAt',
    'noOp',
    'previousSha',
    'receiptPath',
    'rollbackHealthy',
    'rolledBack',
    'schemaVersion',
    'staged',
    'startedAt',
    'state',
    'targetSha',
  ]
  if (
    !receipt
    || typeof receipt !== 'object'
    || Array.isArray(receipt)
    || Object.keys(receipt).sort().join('\n') !== expectedKeys.join('\n')
  ) {
    throw new Error('Deployment controller response shape is invalid')
  }
  if (
    receipt.schemaVersion !== 'eqb-deployment-receipt-v2'
    || receipt.controllerVersion !== 'eqb-deploy-controller-v1'
    || receipt.state !== 'reported'
    || !['success', 'failure'].includes(receipt.conclusion)
    || receipt.targetSha !== sha
    || (receipt.previousSha !== null && !SHA.test(receipt.previousSha))
    || !['boolean'].includes(typeof receipt.staged)
    || !['boolean'].includes(typeof receipt.noOp)
    || !['boolean'].includes(typeof receipt.rolledBack)
    || ![null, true, false].includes(receipt.rollbackHealthy)
    || (receipt.failureCode !== null && typeof receipt.failureCode !== 'string')
    || typeof receipt.startedAt !== 'string'
    || typeof receipt.finishedAt !== 'string'
    || !/^\/opt\/eqb\/deployments\/receipts\/[A-Za-z0-9.-]+\.json$/u
      .test(receipt.receiptPath || '')
  ) {
    throw new Error('Deployment controller response values are invalid')
  }
  if ((receipt.conclusion === 'success') !== (receipt.failureCode === null)) {
    throw new Error('Deployment controller conclusion is inconsistent')
  }
  return receipt
}

export function parseDeploymentControllerPreflight(output) {
  let preflight
  try {
    preflight = JSON.parse(String(output || '').trim())
  } catch {
    throw new Error('Deployment controller preflight is not valid JSON')
  }
  if (
    !preflight
    || typeof preflight !== 'object'
    || Array.isArray(preflight)
    || Object.keys(preflight).sort().join('\n') !== [
      'caddy',
      'controllerVersion',
      'eqb',
      'layout',
      'productionSha',
      'schemaVersion',
    ].join('\n')
    || preflight.schemaVersion !== 'eqb-deployment-preflight-v2'
    || preflight.controllerVersion !== 'eqb-deploy-controller-v1'
    || !SHA.test(preflight.productionSha || '')
    || !/^[a-z-]+$/u.test(preflight.eqb || '')
    || !/^[a-z-]+$/u.test(preflight.caddy || '')
    || !['legacy', 'release'].includes(preflight.layout)
  ) {
    throw new Error('Deployment controller preflight response is invalid')
  }
  return preflight
}

export function parseLegacyBaselineReceipt(output, expectedSha) {
  const sha = assertSha(expectedSha)
  let receipt
  try {
    receipt = JSON.parse(String(output || '').trim())
  } catch {
    throw new Error('Legacy baseline response is not valid JSON')
  }
  const expectedKeys = [
    'backupsVerified',
    'bootstrapRun',
    'caddy',
    'conclusion',
    'distVerified',
    'eqb',
    'failureCode',
    'finishedAt',
    'identityInstalled',
    'layout',
    'migrationVerified',
    'previousSha',
    'productionSha',
    'quarantinePreserved',
    'rollbackHealthy',
    'rolledBack',
    'schemaVersion',
    'startedAt',
    'state',
    'targetSha',
  ]
  if (
    !receipt
    || typeof receipt !== 'object'
    || Array.isArray(receipt)
    || Object.keys(receipt).sort().join('\n') !== expectedKeys.join('\n')
    || receipt.schemaVersion !== EQB_LEGACY_BASELINE_RECEIPT_SCHEMA_VERSION
    || receipt.state !== 'reported'
    || !['success', 'failure'].includes(receipt.conclusion)
    || receipt.targetSha !== sha
    || !SHA.test(receipt.previousSha || '')
    || !SHA.test(receipt.productionSha || '')
    || !['active', 'inactive'].includes(receipt.eqb)
    || !['active', 'inactive'].includes(receipt.caddy)
    || receipt.layout !== 'legacy'
    || [
      'identityInstalled',
      'quarantinePreserved',
      'backupsVerified',
      'migrationVerified',
      'distVerified',
      'rolledBack',
      'bootstrapRun',
    ].some((key) => typeof receipt[key] !== 'boolean')
    || ![null, true, false].includes(receipt.rollbackHealthy)
    || typeof receipt.startedAt !== 'string'
    || typeof receipt.finishedAt !== 'string'
  ) {
    throw new Error('Legacy baseline response shape is invalid')
  }
  const success = receipt.conclusion === 'success'
  if (
    (success && (
      receipt.productionSha !== sha
      || receipt.eqb !== 'active'
      || receipt.caddy !== 'active'
      || !receipt.identityInstalled
      || !receipt.quarantinePreserved
      || !receipt.backupsVerified
      || !receipt.migrationVerified
      || !receipt.distVerified
      || receipt.rolledBack
      || receipt.rollbackHealthy !== null
      || receipt.failureCode !== null
      || receipt.bootstrapRun
    ))
    || (!success && (
      typeof receipt.rollbackHealthy !== 'boolean'
      || !/^[a-z0-9-]+:[a-z0-9-]+$/u.test(receipt.failureCode || '')
      || receipt.bootstrapRun
      || (receipt.rollbackHealthy && (
        !receipt.rolledBack
        || receipt.productionSha !== receipt.previousSha
        || receipt.eqb !== 'active'
        || receipt.caddy !== 'active'
        || receipt.identityInstalled
        || receipt.quarantinePreserved
      ))
    ))
  ) {
    throw new Error('Legacy baseline response values are invalid')
  }
  return receipt
}

export function parseBootstrapKeyRetirementReceipt(output) {
  let receipt
  try {
    receipt = JSON.parse(String(output || '').trim())
  } catch {
    throw new Error('Bootstrap key retirement response is not valid JSON')
  }
  const expectedKeys = [
    'conclusion',
    'forcedKeyPreserved',
    'installedDigest',
    'oldKeyRemoved',
    'originalDigest',
    'schemaVersion',
    'state',
  ]
  if (
    !receipt
    || typeof receipt !== 'object'
    || Array.isArray(receipt)
    || Object.keys(receipt).sort().join('\n') !== expectedKeys.join('\n')
    || receipt.schemaVersion !== EQB_BOOTSTRAP_KEY_RETIREMENT_SCHEMA_VERSION
    || receipt.state !== 'reported'
    || receipt.conclusion !== 'success'
    || receipt.oldKeyRemoved !== true
    || receipt.forcedKeyPreserved !== true
    || !/^[a-f0-9]{64}$/u.test(receipt.originalDigest || '')
    || !/^[a-f0-9]{64}$/u.test(receipt.installedDigest || '')
    || receipt.originalDigest === receipt.installedDigest
  ) {
    throw new Error('Bootstrap key retirement response is invalid')
  }
  return receipt
}

export async function migrateLegacyProductionBaseline({
  argv,
  resolveCandidate,
  readMainSha,
  readLegacyPreflight,
  invokeOperator,
} = {}) {
  requireLegacyBaselineAuthorization(argv)
  if (
    typeof resolveCandidate !== 'function'
    || typeof readMainSha !== 'function'
    || typeof readLegacyPreflight !== 'function'
    || typeof invokeOperator !== 'function'
  ) {
    throw new Error('Legacy baseline dependencies are missing')
  }
  const candidate = await resolveCandidate()
  await assertDeploymentCandidateStillCurrent({ readMainSha, sha: candidate.sha })
  const preflight = await readLegacyPreflight(candidate)
  if (
    preflight?.layout !== 'legacy'
    || preflight?.productionSha === candidate.sha
    || preflight?.trackedDirtyPaths !== 0
    || preflight?.eqb !== 'active'
    || preflight?.caddy !== 'active'
  ) {
    throw new Error('Legacy production is not eligible for baseline migration')
  }
  await assertDeploymentCandidateStillCurrent({ readMainSha, sha: candidate.sha })
  const operation = await invokeOperator({ candidate, preflight })
  if (
    !operation
    || typeof operation !== 'object'
    || Array.isArray(operation)
    || !Number.isInteger(operation.exitCode)
    || typeof operation.output !== 'string'
  ) {
    throw new Error('Legacy baseline operator result is invalid')
  }
  const receipt = parseLegacyBaselineReceipt(operation.output, candidate.sha)
  if ((receipt.conclusion === 'success') !== (operation.exitCode === 0)) {
    throw new Error('Legacy baseline process and receipt conclusions disagree')
  }
  if (receipt.conclusion !== 'success') {
    throw new Error(`Legacy baseline operator reported ${receipt.failureCode}`)
  }
  return { candidate, preflight, receipt }
}

export async function bootstrapReleaseLayout({
  argv,
  resolveCandidate,
  readMainSha,
  readLegacyPreflight,
  invokeBootstrap,
  readControllerPreflight,
  retireBootstrapIdentity,
  verifyBootstrapIdentityRetired,
  rotateControllerSecret,
} = {}) {
  requireReleaseLayoutBootstrapAuthorization(argv)
  if (
    typeof resolveCandidate !== 'function'
    || typeof readMainSha !== 'function'
    || typeof readLegacyPreflight !== 'function'
    || typeof invokeBootstrap !== 'function'
    || typeof readControllerPreflight !== 'function'
    || typeof retireBootstrapIdentity !== 'function'
    || typeof verifyBootstrapIdentityRetired !== 'function'
    || typeof rotateControllerSecret !== 'function'
  ) {
    throw new Error('Release-layout bootstrap dependencies are missing')
  }
  const candidate = await resolveCandidate()
  await assertDeploymentCandidateStillCurrent({ readMainSha, sha: candidate.sha })
  const legacyPreflight = await readLegacyPreflight(candidate)
  if (
    legacyPreflight?.layout !== 'legacy'
    || legacyPreflight?.productionSha !== candidate.sha
    || legacyPreflight?.trackedDirtyPaths !== 0
    || legacyPreflight?.eqb !== 'active'
    || legacyPreflight?.caddy !== 'active'
  ) {
    throw new Error('Production is not an eligible migrated baseline')
  }
  await assertDeploymentCandidateStillCurrent({ readMainSha, sha: candidate.sha })
  await invokeBootstrap({ candidate, legacyPreflight })
  function assertHealthyController(preflight) {
    if (
      preflight?.layout !== 'release'
      || preflight?.productionSha !== candidate.sha
      || preflight?.eqb !== 'active'
      || preflight?.caddy !== 'active'
    ) {
      throw new Error('New deployment controller did not prove a healthy release layout')
    }
    return preflight
  }
  assertHealthyController(await readControllerPreflight(candidate))
  const keyRetirement = await retireBootstrapIdentity(candidate)
  const controllerPreflight = assertHealthyController(await readControllerPreflight(candidate))
  if (await verifyBootstrapIdentityRetired(candidate) !== true) {
    throw new Error('Privileged bootstrap identity remains usable')
  }
  await rotateControllerSecret(candidate)
  return { candidate, legacyPreflight, controllerPreflight, keyRetirement }
}

export async function deployLatestRelease({
  argv,
  resolveCandidate,
  readMainSha,
  invokeController,
} = {}) {
  requireDeployLatestAuthorization(argv)
  if (
    typeof resolveCandidate !== 'function'
    || typeof readMainSha !== 'function'
    || typeof invokeController !== 'function'
  ) {
    throw new Error('Deployment execution dependencies are missing')
  }
  const candidate = await resolveCandidate()
  await assertDeploymentCandidateStillCurrent({ readMainSha, sha: candidate.sha })
  const receipt = parseDeploymentControllerOutput(
    await invokeController(candidate.sha),
    candidate.sha,
  )
  if (receipt.conclusion !== 'success') {
    throw new Error(`Production controller reported ${receipt.failureCode || 'failure'}`)
  }
  return { candidate, receipt }
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
      '-o', 'PreferredAuthentications=publickey',
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
