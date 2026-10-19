import { createHash, randomUUID } from 'node:crypto'
import {
  chmodSync,
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

export const AMP_ORB_DEPLOY_REPOSITORY = 'Buqisir/english-question-bank'
export const AMP_ORB_DEPLOY_GITHUB_HOST = 'github.com'
export const AMP_ORB_DEPLOY_GITHUB_ACTIONS_APP_ID = 15368
export const AMP_ORB_DEPLOY_GITHUB_API_MAX_BUFFER_BYTES = 8 * 1024 * 1024
export const AMP_ORB_DEPLOY_WORKFLOW_PATH = '.github/workflows/verify.yml'
export const AMP_ORB_DEPLOY_WORKFLOW_NAME = 'Verify'
// v4 ships with this reader; deployment always resolves latest main.
// Reject historical v1/v2/v3 sets so missing workers cannot downgrade authority.
export const AMP_ORB_DEPLOY_REQUIRED_JOBS = Object.freeze(['e2e', 'e2e-render-1', 'e2e-render-2', 'e2e-seams-1', 'e2e-seams-2', 'verify', 'verify-1', 'verify-2'])
// Retained only for backward-compatible verifier coverage. Deployment wiring
// below uses GitHub Actions workflow evidence, never this legacy Check seam.
export const AMP_ORB_DEPLOY_AMP_CHECK_NAME = 'Amp Orb Verify'
export const AMP_ORB_DEPLOY_AMP_EXTERNAL_ID_VERSIONS = Object.freeze(['v4'])
export const AMP_ORB_DEPLOY_RECEIPT_SCHEMA_VERSION = 'amp-orb-deployment-receipt-v1'
export const EQB_LEGACY_BASELINE_RECEIPT_SCHEMA_VERSION = 'eqb-legacy-baseline-receipt-v1'
export const EQB_RELEASE_BOOTSTRAP_FAILURE_SCHEMA_VERSION = 'eqb-deployment-bootstrap-failure-v1'
export const EQB_BOOTSTRAP_KEY_RETIREMENT_SCHEMA_VERSION = 'eqb-bootstrap-key-retirement-v1'
export const EQB_RELEASE_BOOTSTRAP_RECOVERY_SCHEMA_VERSION = 'eqb-release-bootstrap-recovery-v1'
export const EQB_RELEASE_BOOTSTRAP_COMPLETION_SCHEMA_VERSION = 'eqb-release-bootstrap-completion-v1'
export const EQB_RELEASE_BOOTSTRAP_ABANDONMENT_SCHEMA_VERSION = 'eqb-release-bootstrap-abandonment-v2'
export const EQB_RELEASE_BOOTSTRAP_CANCELLATION_SCHEMA_VERSION = 'eqb-release-bootstrap-cancellation-v1'
export const EQB_MAINTENANCE_INSTALL_READINESS_SCHEMA_VERSION = 'eqb-maintenance-install-readiness-v1'
export const EQB_PERSISTENCE_AUTHORITY_PATHS = Object.freeze([
  'data/sql',
  'server/api.mjs',
  'server/auth/auth.mjs',
  'server/draft-paper/draftPaperStore.mjs',
  'server/import-review/importReviewStore.mjs',
  'server/my-space/mySpace.mjs',
  'server/paper-import/publisher.mjs',
  'server/paper-import/storage.mjs',
  'server/source-intake/sourceIntakeStore.mjs',
  'server/user-data',
  'server/vocabulary/vocabularyStore.mjs',
])
export const EQB_HOST_CONFIGURATION_PATHS = Object.freeze([
  'deploy/Caddyfile.release',
  'deploy/eqb-release.service',
  'deploy/eqb-deploy-controller.mjs',
])
export const EQB_STABLE_LAUNCHER_PATHS = Object.freeze([
  'deploy/eqb-deploy-transport',
  'deploy/eqb-deploy-controller',
])

const SHA = /^[a-f0-9]{40}$/u
const DELIVERY_ID = /^[A-Za-z0-9][A-Za-z0-9-]{0,127}$/u
const SSH_TARGET = /^(?:[A-Za-z0-9._-]+@)?(?:\[[A-Fa-f0-9:]+\]|[A-Za-z0-9.-]+)$/u
const SSH_REMOTE_TOKEN = /^[A-Za-z0-9_@%+=:,./-]+$/u
const SSH_PUBLIC_KEY_BODY = /^[A-Za-z0-9+/]+={0,3}$/u
const PROJECT_ID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u
const BOOTSTRAP_UNIT = /^eqb-release-bootstrap-[a-f0-9]{32}$/u
const PRE_MUTATION_BOOTSTRAP_FAILURE_STAGES = new Set([
  'preflight',
  'verify-established-baseline',
  'initial-health',
])

function assertSha(sha, label = 'deployment SHA') {
  if (!SHA.test(sha || '')) throw new Error(`Invalid ${label}`)
  return sha
}

function assertPositiveInteger(value, label) {
  const number = typeof value === 'string' && /^\d+$/u.test(value) ? Number(value) : value
  if (!Number.isSafeInteger(number) || number < 1) throw new Error(`Invalid ${label}`)
  return number
}

export function deploymentAuthorityFromEnvironment(environment = {}) {
  if (Object.hasOwn(environment, 'QUESTION_BANK_DEPLOY_CI_AUTHORITY_MODE')) {
    throw new Error('Legacy deployment CI authority mode setting is not permitted')
  }
  if (Object.hasOwn(environment, 'QUESTION_BANK_DEPLOY_AMP_CHECK_APP_ID')) {
    throw new Error('Legacy deployment Amp Check App ID setting is not permitted')
  }
  return Object.freeze({
    githubActionsAppId: AMP_ORB_DEPLOY_GITHUB_ACTIONS_APP_ID,
  })
}

export function parseOpenSshEd25519PublicKeyBody(value) {
  const line = String(value || '').trim()
  const fields = line.split(/[\t ]+/u)
  if (
    !line
    || line.includes('\n')
    || line.includes('\r')
    || fields.length < 2
    || fields[0] !== 'ssh-ed25519'
    || !SSH_PUBLIC_KEY_BODY.test(fields[1] || '')
  ) {
    throw new Error('Deployment SSH identity is not a valid private key')
  }
  return fields[1]
}

export function isSshPublicKeyAuthenticationDenied({ status, stdout, stderr } = {}) {
  if (status !== 255 || String(stdout || '') !== '') return false
  const denied = String(stderr || '').trim().match(
    /^[^\r\n]+: Permission denied \(([A-Za-z0-9-]+(?:,[A-Za-z0-9-]+)*)\)\.$/u,
  )
  return denied?.[1].split(',').includes('publickey') === true
}

function ensurePrivateDirectory(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  chmodSync(directory, 0o700)
}

function writePrivateFile(filePath, value) {
  const descriptor = openSync(filePath, 'wx', 0o600)
  try {
    writeFileSync(descriptor, value, 'utf8')
    fsyncSync(descriptor)
  } finally {
    closeSync(descriptor)
  }
  chmodSync(filePath, 0o600)
}

export function syncDirectory(directory) {
  const descriptor = openSync(directory, constants.O_RDONLY | constants.O_DIRECTORY)
  try {
    fsyncSync(descriptor)
  } finally {
    closeSync(descriptor)
  }
}

function writePrivateFileAtomic(filePath, value) {
  const temporaryPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}-${randomUUID()}`,
  )
  try {
    writePrivateFile(temporaryPath, value)
    renameSync(temporaryPath, filePath)
    syncDirectory(path.dirname(filePath))
  } finally {
    rmSync(temporaryPath, { force: true })
  }
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

export function deploymentChangedPathDigest(paths) {
  if (
    !Array.isArray(paths)
    || paths.length === 0
    || paths.some((filePath) => typeof filePath !== 'string' || !filePath || filePath.includes('\n'))
  ) throw new Error('Deployment changed-path evidence is invalid')
  const normalized = [...new Set(paths)].sort()
  if (normalized.length !== paths.length) {
    throw new Error('Deployment changed-path evidence contains duplicates')
  }
  return sha256(`${normalized.join('\n')}\n`)
}

function assertPrivateRecoveryNode(nodePath, type, mode) {
  const metadata = lstatSync(nodePath)
  const expectedType = type === 'directory' ? metadata.isDirectory() : metadata.isFile()
  if (
    !expectedType
    || metadata.isSymbolicLink()
    || metadata.uid !== process.getuid()
    || (metadata.mode & 0o7777) !== mode
    || (type === 'file' && metadata.nlink !== 1)
  ) {
    throw new Error(`Bootstrap recovery ${type} metadata is unsafe`)
  }
  return metadata
}

function readPrivateRecoveryFile(filePath) {
  const before = assertPrivateRecoveryNode(filePath, 'file', 0o600)
  if (before.size < 1 || before.size > 64 * 1024) {
    throw new Error('Bootstrap recovery file size is invalid')
  }
  const descriptor = openSync(filePath, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const opened = fstatSync(descriptor)
    if (opened.dev !== before.dev || opened.ino !== before.ino || opened.size !== before.size) {
      throw new Error('Bootstrap recovery file changed while opening')
    }
    return readFileSync(descriptor, 'utf8')
  } finally {
    closeSync(descriptor)
  }
}

function assertRecoveryRoot(stateRoot, { create = false } = {}) {
  if (!path.isAbsolute(stateRoot || '')) {
    throw new Error('Bootstrap recovery root must be absolute')
  }
  if (create) {
    if (existsSync(stateRoot)) {
      const existing = lstatSync(stateRoot)
      if (existing.isSymbolicLink() || !existing.isDirectory() || existing.uid !== process.getuid()) {
        throw new Error('Bootstrap recovery root metadata is unsafe')
      }
    } else {
      mkdirSync(stateRoot, { recursive: true, mode: 0o700 })
    }
    chmodSync(stateRoot, 0o700)
  }
  return assertPrivateRecoveryNode(stateRoot, 'directory', 0o700)
}

function isIsoTimestamp(value) {
  if (typeof value !== 'string') return false
  try {
    return new Date(value).toISOString() === value
  } catch {
    return false
  }
}

function parseReleaseBootstrapRecoveryRecord(directory, expectedTarget, directoryPrefix) {
  const recoveryPath = path.join(directory, 'recovery.json')
  let record
  try {
    record = JSON.parse(readPrivateRecoveryFile(recoveryPath))
  } catch {
    throw new Error('Bootstrap recovery record is not valid JSON')
  }
  const expectedKeys = [
    'bootstrapPublicKeyDigest',
    'controllerPublicKeyDigest',
    'createdAt',
    'projectId',
    'schemaVersion',
    'targetSha',
    'transportTargetDigest',
    'unit',
  ]
  if (
    !record
    || typeof record !== 'object'
    || Array.isArray(record)
    || Object.keys(record).sort().join('\n') !== expectedKeys.join('\n')
    || record.schemaVersion !== EQB_RELEASE_BOOTSTRAP_RECOVERY_SCHEMA_VERSION
    || !SHA.test(record.targetSha || '')
    || path.basename(directory) !== `${directoryPrefix}${record.targetSha}`
    || (expectedTarget !== null && record.targetSha !== expectedTarget)
    || !PROJECT_ID.test(record.projectId || '')
    || !BOOTSTRAP_UNIT.test(record.unit || '')
    || ![record.transportTargetDigest, record.controllerPublicKeyDigest, record.bootstrapPublicKeyDigest]
      .every((digest) => /^[a-f0-9]{64}$/u.test(digest || ''))
    || !isIsoTimestamp(record.createdAt)
  ) {
    throw new Error('Bootstrap recovery record values are invalid')
  }
  return { ...record, recoveryPath }
}

function parseReleaseBootstrapCompletionReceipt(directory, targetSha) {
  const completionPath = path.join(directory, 'completion.json')
  let completion
  try {
    completion = JSON.parse(readPrivateRecoveryFile(completionPath))
  } catch {
    throw new Error('Bootstrap completion receipt is not valid JSON')
  }
  if (
    !completion
    || typeof completion !== 'object'
    || Array.isArray(completion)
    || Object.keys(completion).sort().join('\n') !== [
      'completedAt',
      'controllerSecretRotated',
      'schemaVersion',
      'targetSha',
    ].join('\n')
    || completion.schemaVersion !== EQB_RELEASE_BOOTSTRAP_COMPLETION_SCHEMA_VERSION
    || completion.targetSha !== targetSha
    || completion.controllerSecretRotated !== true
    || !isIsoTimestamp(completion.completedAt)
  ) {
    throw new Error('Bootstrap completion receipt values are invalid')
  }
  return { ...completion, completionPath }
}

export function createReleaseBootstrapRecovery({
  stateRoot,
  candidateSha,
  projectId,
  transportTarget,
  unit,
  controllerPrivateKey,
  controllerPublicKeyBody,
  bootstrapPrivateKey,
  bootstrapPublicKeyBody,
  now = () => new Date(),
} = {}) {
  const targetSha = assertSha(candidateSha)
  if (!PROJECT_ID.test(projectId || '')) {
    throw new Error('Bootstrap recovery project identity is invalid')
  }
  deploymentSSHTransportUser(transportTarget)
  if (!BOOTSTRAP_UNIT.test(unit || '')) {
    throw new Error('Bootstrap recovery systemd unit identity is invalid')
  }
  for (const [label, value] of [
    ['controller private key', controllerPrivateKey],
    ['bootstrap private key', bootstrapPrivateKey],
  ]) {
    if (typeof value !== 'string' || !value.trim() || value.includes('\0')) {
      throw new Error(`Bootstrap recovery ${label} is invalid`)
    }
  }
  for (const [label, value] of [
    ['controller public key', controllerPublicKeyBody],
    ['bootstrap public key', bootstrapPublicKeyBody],
  ]) {
    if (!/^[A-Za-z0-9+/]+={0,3}$/u.test(value || '')) {
      throw new Error(`Bootstrap recovery ${label} is invalid`)
    }
  }
  if (controllerPublicKeyBody === bootstrapPublicKeyBody) {
    throw new Error('Bootstrap recovery identities must be distinct')
  }
  const createdAt = now().toISOString()
  assertRecoveryRoot(stateRoot, { create: true })
  const directory = path.join(stateRoot, `bootstrap-${targetSha}`)
  if (existsSync(directory)) {
    throw new Error(`Private bootstrap recovery already exists for ${targetSha}; resume it instead`)
  }
  const preparedDirectory = mkdtempSync(path.join(stateRoot, `.bootstrap-${targetSha}-`))
  chmodSync(preparedDirectory, 0o700)
  try {
    writePrivateFile(path.join(preparedDirectory, 'controller-identity'), controllerPrivateKey)
    writePrivateFile(path.join(preparedDirectory, 'bootstrap-identity'), bootstrapPrivateKey)
    writePrivateFile(path.join(preparedDirectory, 'recovery.json'), `${JSON.stringify({
      schemaVersion: EQB_RELEASE_BOOTSTRAP_RECOVERY_SCHEMA_VERSION,
      targetSha,
      projectId,
      transportTargetDigest: sha256(transportTarget),
      unit,
      controllerPublicKeyDigest: sha256(controllerPublicKeyBody),
      bootstrapPublicKeyDigest: sha256(bootstrapPublicKeyBody),
      createdAt,
    }, null, 2)}\n`)
    syncDirectory(preparedDirectory)
    renameSync(preparedDirectory, directory)
    syncDirectory(stateRoot)
  } catch (error) {
    rmSync(preparedDirectory, { recursive: true, force: true })
    syncDirectory(stateRoot)
    throw error
  }
  return readReleaseBootstrapRecovery({ stateRoot, targetSha })
}

export function readReleaseBootstrapRecovery({ stateRoot, targetSha } = {}) {
  assertRecoveryRoot(stateRoot)
  const expectedTarget = targetSha === undefined ? null : assertSha(targetSha)
  const candidates = readdirSync(stateRoot, { withFileTypes: true })
    .filter((entry) => entry.name.startsWith('bootstrap-') && !entry.name.startsWith('.bootstrap-'))
    .filter((entry) => expectedTarget === null || entry.name === `bootstrap-${expectedTarget}`)
  if (candidates.length !== 1 || !candidates[0].isDirectory() || candidates[0].isSymbolicLink()) {
    throw new Error('Exactly one private bootstrap recovery record is required')
  }
  const directory = path.join(stateRoot, candidates[0].name)
  assertPrivateRecoveryNode(directory, 'directory', 0o700)
  const record = parseReleaseBootstrapRecoveryRecord(directory, expectedTarget, 'bootstrap-')
  const controllerPrivateKeyPath = path.join(directory, 'controller-identity')
  const bootstrapPrivateKeyPath = path.join(directory, 'bootstrap-identity')
  return {
    ...record,
    directory,
    controllerPrivateKeyPath,
    controllerPrivateKey: readPrivateRecoveryFile(controllerPrivateKeyPath),
    bootstrapPrivateKeyPath,
    bootstrapPrivateKey: readPrivateRecoveryFile(bootstrapPrivateKeyPath),
  }
}

export function completeReleaseBootstrapRecovery(recovery, {
  now = () => new Date(),
  removeIdentity = unlinkSync,
} = {}) {
  if (
    !recovery
    || !path.isAbsolute(recovery.directory || '')
    || path.basename(recovery.directory) !== `bootstrap-${assertSha(recovery.targetSha)}`
  ) {
    throw new Error('Bootstrap recovery completion target is invalid')
  }
  assertPrivateRecoveryNode(recovery.directory, 'directory', 0o700)
  const completionPath = path.join(recovery.directory, 'completion.json')
  if (!existsSync(completionPath)) {
    writePrivateFileAtomic(completionPath, `${JSON.stringify({
      schemaVersion: EQB_RELEASE_BOOTSTRAP_COMPLETION_SCHEMA_VERSION,
      targetSha: recovery.targetSha,
      controllerSecretRotated: true,
      completedAt: now().toISOString(),
    }, null, 2)}\n`)
  }
  parseReleaseBootstrapCompletionReceipt(recovery.directory, recovery.targetSha)
  const completedDirectory = path.join(
    path.dirname(recovery.directory),
    `completed-bootstrap-${recovery.targetSha}`,
  )
  if (existsSync(completedDirectory)) {
    throw new Error('Bootstrap terminal recovery receipt already exists')
  }
  renameSync(recovery.directory, completedDirectory)
  syncDirectory(path.dirname(completedDirectory))
  return clearCompletedReleaseBootstrapRecovery({
    stateRoot: path.dirname(completedDirectory),
    targetSha: recovery.targetSha,
    removeIdentity,
  })
}

export function readCompletedReleaseBootstrapRecovery({
  stateRoot,
  targetSha,
  optional = false,
} = {}) {
  assertRecoveryRoot(stateRoot)
  const expectedTarget = targetSha === undefined ? null : assertSha(targetSha)
  const candidates = readdirSync(stateRoot, { withFileTypes: true })
    .filter((entry) => entry.name.startsWith('completed-bootstrap-'))
    .filter((entry) => expectedTarget === null || entry.name === `completed-bootstrap-${expectedTarget}`)
  if (optional && candidates.length === 0) return null
  if (candidates.length !== 1 || !candidates[0].isDirectory() || candidates[0].isSymbolicLink()) {
    throw new Error('Exactly one completed bootstrap recovery receipt is required')
  }
  const directory = path.join(stateRoot, candidates[0].name)
  assertPrivateRecoveryNode(directory, 'directory', 0o700)
  const record = parseReleaseBootstrapRecoveryRecord(directory, expectedTarget, 'completed-bootstrap-')
  const completion = parseReleaseBootstrapCompletionReceipt(directory, record.targetSha)
  return { ...record, ...completion, directory }
}

export function clearCompletedReleaseBootstrapRecovery({
  stateRoot,
  targetSha,
  removeIdentity = unlinkSync,
} = {}) {
  if (typeof removeIdentity !== 'function') {
    throw new Error('Bootstrap recovery identity cleanup dependency is missing')
  }
  const completed = readCompletedReleaseBootstrapRecovery({ stateRoot, targetSha })
  for (const name of ['controller-identity', 'bootstrap-identity']) {
    const identityPath = path.join(completed.directory, name)
    if (existsSync(identityPath)) {
      assertPrivateRecoveryNode(identityPath, 'file', 0o600)
      removeIdentity(identityPath)
      syncDirectory(completed.directory)
    }
  }
  return completed
}

export function abandonReleaseBootstrapRecovery(recovery, {
  failure,
  cancellation,
  previousSha,
  controllerIdentityRejected,
  legacyHealthy,
  now = () => new Date(),
  removeIdentity = unlinkSync,
} = {}) {
  const preMutationFailure = failure?.rollbackHealthy === false
    && PRE_MUTATION_BOOTSTRAP_FAILURE_STAGES.has(failure?.failedStage)
  const cancellationValid = cancellation?.schemaVersion
      === EQB_RELEASE_BOOTSTRAP_CANCELLATION_SCHEMA_VERSION
    && Object.keys(cancellation).sort().join('\n') === [
      'cancellationInstalled',
      'conclusion',
      'hostAttemptStarted',
      'schemaVersion',
      'state',
      'targetSha',
      'unit',
    ].join('\n')
    && cancellation?.state === 'reported'
    && cancellation?.conclusion === 'cancelled'
    && cancellation?.targetSha === recovery?.targetSha
    && cancellation?.unit === recovery?.unit
    && cancellation?.cancellationInstalled === true
    && typeof cancellation?.hostAttemptStarted === 'boolean'
  const hostFailureValid = failure?.targetSha === recovery?.targetSha
    && failure?.schemaVersion === EQB_RELEASE_BOOTSTRAP_FAILURE_SCHEMA_VERSION
    && failure?.state === 'reported'
    && failure?.conclusion === 'failure'
    && Object.keys(failure).sort().join('\n') === [
      'conclusion',
      'evidenceRetained',
      'exitCode',
      'failedStage',
      'rollbackHealthy',
      'schemaVersion',
      'state',
      'targetSha',
    ].join('\n')
    && (failure?.rollbackHealthy === true || preMutationFailure)
    && failure?.evidenceRetained === true
    && /^[a-z0-9-]+$/u.test(failure?.failedStage || '')
    && Number.isInteger(failure?.exitCode)
    && failure?.exitCode >= 1
    && failure?.exitCode <= 255
  const cancellationOnly = failure === undefined
  if (
    !recovery
    || !path.isAbsolute(recovery.directory || '')
    || path.basename(recovery.directory) !== `bootstrap-${assertSha(recovery.targetSha)}`
    || !cancellationValid
    || (!cancellationOnly && !hostFailureValid)
    || (cancellationOnly && cancellation.hostAttemptStarted)
    || !SHA.test(previousSha || '')
    || controllerIdentityRejected !== true
    || legacyHealthy !== true
    || typeof removeIdentity !== 'function'
  ) {
    throw new Error('Bootstrap recovery abandonment proof is invalid')
  }
  const abandonedAt = now().toISOString()
  if (!isIsoTimestamp(abandonedAt)) {
    throw new Error('Bootstrap recovery abandonment timestamp is invalid')
  }
  assertPrivateRecoveryNode(recovery.directory, 'directory', 0o700)
  const abandonedDirectory = path.join(
    path.dirname(recovery.directory),
    `abandoned-bootstrap-${recovery.targetSha}`,
  )
  if (existsSync(abandonedDirectory)) {
    throw new Error('Bootstrap abandonment receipt already exists')
  }
  const abandonmentPath = path.join(recovery.directory, 'abandonment.json')
  writePrivateFileAtomic(abandonmentPath, `${JSON.stringify({
    schemaVersion: EQB_RELEASE_BOOTSTRAP_ABANDONMENT_SCHEMA_VERSION,
    targetSha: recovery.targetSha,
    previousSha,
    evidenceKind: cancellationOnly ? 'host-cancellation' : 'host-failure',
    failedStage: cancellationOnly ? 'dispatch-unknown' : failure.failedStage,
    hostExitCode: cancellationOnly ? null : failure.exitCode,
    rollbackHealthy: cancellationOnly ? false : failure.rollbackHealthy,
    preMutationFailure: cancellationOnly || preMutationFailure,
    cancellationInstalled: true,
    hostAttemptStarted: cancellation.hostAttemptStarted,
    controllerIdentityRejected,
    legacyHealthy,
    abandonedAt,
  }, null, 2)}\n`)
  renameSync(recovery.directory, abandonedDirectory)
  syncDirectory(path.dirname(abandonedDirectory))
  return clearAbandonedReleaseBootstrapRecovery({
    stateRoot: path.dirname(abandonedDirectory),
    targetSha: recovery.targetSha,
    removeIdentity,
  })
}

export function clearAbandonedReleaseBootstrapRecovery({
  stateRoot,
  targetSha,
  removeIdentity = unlinkSync,
} = {}) {
  if (typeof removeIdentity !== 'function') {
    throw new Error('Bootstrap abandonment identity cleanup dependency is missing')
  }
  const abandoned = readAbandonedReleaseBootstrapRecovery({ stateRoot, targetSha })
  for (const name of ['controller-identity', 'bootstrap-identity']) {
    const identityPath = path.join(abandoned.directory, name)
    if (existsSync(identityPath)) {
      assertPrivateRecoveryNode(identityPath, 'file', 0o600)
      removeIdentity(identityPath)
      syncDirectory(abandoned.directory)
    }
  }
  if (['controller-identity', 'bootstrap-identity']
    .some((name) => existsSync(path.join(abandoned.directory, name)))) {
    throw new Error('Bootstrap abandonment identity cleanup is incomplete')
  }
  return readAbandonedReleaseBootstrapRecovery({ stateRoot, targetSha })
}

export function readAbandonedReleaseBootstrapRecovery({
  stateRoot,
  targetSha,
  optional = false,
} = {}) {
  assertRecoveryRoot(stateRoot)
  const expectedTarget = assertSha(targetSha)
  const directory = path.join(stateRoot, `abandoned-bootstrap-${expectedTarget}`)
  if (optional && !existsSync(directory)) return null
  assertPrivateRecoveryNode(directory, 'directory', 0o700)
  const abandonmentPath = path.join(directory, 'abandonment.json')
  let receipt
  try {
    receipt = JSON.parse(readPrivateRecoveryFile(abandonmentPath))
  } catch {
    throw new Error('Bootstrap abandonment receipt is not valid JSON')
  }
  const expectedKeys = [
    'abandonedAt',
    'cancellationInstalled',
    'controllerIdentityRejected',
    'evidenceKind',
    'failedStage',
    'hostAttemptStarted',
    'hostExitCode',
    'legacyHealthy',
    'preMutationFailure',
    'previousSha',
    'rollbackHealthy',
    'schemaVersion',
    'targetSha',
  ]
  if (
    !receipt
    || typeof receipt !== 'object'
    || Array.isArray(receipt)
    || Object.keys(receipt).sort().join('\n') !== expectedKeys.join('\n')
    || receipt.schemaVersion !== EQB_RELEASE_BOOTSTRAP_ABANDONMENT_SCHEMA_VERSION
    || receipt.targetSha !== expectedTarget
    || !SHA.test(receipt.previousSha || '')
    || !['host-failure', 'host-cancellation'].includes(receipt.evidenceKind)
    || !/^[a-z0-9-]+$/u.test(receipt.failedStage || '')
    || (receipt.hostExitCode !== null && (
      !Number.isInteger(receipt.hostExitCode)
      || receipt.hostExitCode < 1
      || receipt.hostExitCode > 255
    ))
    || typeof receipt.rollbackHealthy !== 'boolean'
    || typeof receipt.preMutationFailure !== 'boolean'
    || receipt.rollbackHealthy === receipt.preMutationFailure
    || (receipt.evidenceKind === 'host-failure' && (
      receipt.hostExitCode === null
      || (receipt.preMutationFailure
        && !PRE_MUTATION_BOOTSTRAP_FAILURE_STAGES.has(receipt.failedStage))
    ))
    || (receipt.evidenceKind === 'host-cancellation' && (
      receipt.failedStage !== 'dispatch-unknown'
      || receipt.hostExitCode !== null
      || receipt.rollbackHealthy
      || !receipt.preMutationFailure
    ))
    || receipt.cancellationInstalled !== true
    || typeof receipt.hostAttemptStarted !== 'boolean'
    || (receipt.evidenceKind === 'host-cancellation' && receipt.hostAttemptStarted)
    || receipt.controllerIdentityRejected !== true
    || receipt.legacyHealthy !== true
    || !isIsoTimestamp(receipt.abandonedAt)
  ) {
    throw new Error('Bootstrap abandonment receipt values are invalid')
  }
  return { ...receipt, directory, abandonmentPath }
}

export function removeReleaseBootstrapRecovery(recovery) {
  if (
    !recovery
    || !path.isAbsolute(recovery.directory || '')
    || path.basename(recovery.directory) !== `bootstrap-${assertSha(recovery.targetSha)}`
  ) {
    throw new Error('Bootstrap recovery cleanup target is invalid')
  }
  assertPrivateRecoveryNode(recovery.directory, 'directory', 0o700)
  const stateRoot = path.dirname(recovery.directory)
  rmSync(recovery.directory, { recursive: true })
  syncDirectory(stateRoot)
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

export function requireReviewedPersistenceDeployAuthorization(argv) {
  if (!Array.isArray(argv) || !argv.includes('--owner-said-reviewed-persistence-deploy')) {
    throw new Error('Current Owner authorization for reviewed-persistence deployment is required')
  }
  if (argv.includes('--sha')) {
    throw new Error('Reviewed-persistence target SHA is resolved automatically; do not supply --sha')
  }
}

export function requireUpdateHostConfigurationAuthorization(argv) {
  if (!Array.isArray(argv) || !argv.includes('--owner-said-update-host-config')) {
    throw new Error('Current Owner authorization for host configuration update is required')
  }
  if (argv.includes('--sha')) {
    throw new Error('Host configuration target SHA is resolved automatically; do not supply --sha')
  }
}

export function requireMaintenanceInstallReadinessAuthorization(argv) {
  if (!Array.isArray(argv) || !argv.includes('--owner-said-maintenance-install-readiness')) {
    throw new Error('Current Owner authorization for Tencent maintenance-install readiness is required')
  }
  if (argv.includes('--sha')) {
    throw new Error('Maintenance-install readiness target SHA is resolved automatically; do not supply --sha')
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

export function requireReleaseLayoutBootstrapResumeAuthorization(argv) {
  if (!Array.isArray(argv) || !argv.includes('--owner-said-release-bootstrap-resume')) {
    throw new Error('Current Owner authorization to resume release-layout bootstrap finalization is required')
  }
  if (argv.includes('--sha')) {
    throw new Error('Bootstrap recovery target SHA comes from private durable state; do not supply --sha')
  }
}

export function requireReleaseLayoutBootstrapAbandonAuthorization(argv) {
  if (!Array.isArray(argv) || !argv.includes('--owner-said-release-bootstrap-abandon')) {
    throw new Error('Current Owner authorization to abandon a failed bootstrap recovery is required')
  }
  if (argv.includes('--sha')) {
    throw new Error('Bootstrap recovery target SHA comes from private durable state; do not supply --sha')
  }
}

export function deploymentGitHubApiArgs(endpoint) {
  const prefix = `repos/${AMP_ORB_DEPLOY_REPOSITORY}/`
  const encodedWorkflowPath = encodeURIComponent(AMP_ORB_DEPLOY_WORKFLOW_PATH)
  const encodedWorkflowPathPattern = encodedWorkflowPath.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  const allowed = endpoint === `${prefix}git/ref/heads/main`
    || new RegExp(
      `^${prefix}actions/workflows/${encodedWorkflowPathPattern}/runs\\?branch=main&event=push&head_sha=[a-f0-9]{40}&exclude_pull_requests=true&per_page=100(?:&page=(?:[2-9]|[1-9][0-9]+))?$`,
      'u',
    ).test(endpoint || '')
    || new RegExp(
      `^${prefix}actions/runs/[1-9][0-9]*/attempts/[1-9][0-9]*$`,
      'u',
    ).test(endpoint || '')
    || new RegExp(
      `^${prefix}actions/runs/[1-9][0-9]*/attempts/[1-9][0-9]*/jobs\\?per_page=100(?:&page=(?:[2-9]|[1-9][0-9]+))?$`,
      'u',
    ).test(endpoint || '')
    || new RegExp(
      `^${prefix}check-suites/[1-9][0-9]*$`,
      'u',
    ).test(endpoint || '')
  if (!allowed) throw new Error('Deployment GitHub API endpoint is invalid')
  return ['api', '--hostname', AMP_ORB_DEPLOY_GITHUB_HOST, endpoint]
}

function deploymentWorkflowRunsEndpoint(sha, page = 1) {
  const expectedSha = assertSha(sha)
  const pageQuery = page === 1 ? '' : `&page=${page}`
  return `repos/${AMP_ORB_DEPLOY_REPOSITORY}/actions/workflows/${encodeURIComponent(AMP_ORB_DEPLOY_WORKFLOW_PATH)}/runs?branch=main&event=push&head_sha=${expectedSha}&exclude_pull_requests=true&per_page=100${pageQuery}`
}

function isDeploymentWorkflowRun(run, sha) {
  return run?.path === AMP_ORB_DEPLOY_WORKFLOW_PATH
    && run?.name === AMP_ORB_DEPLOY_WORKFLOW_NAME
    && run?.event === 'push'
    && run?.head_branch === 'main'
    && run?.head_sha === sha
    && run?.repository?.full_name === AMP_ORB_DEPLOY_REPOSITORY
    && run?.head_repository?.full_name === AMP_ORB_DEPLOY_REPOSITORY
}

function latestDeploymentWorkflowRun(workflowRuns, sha) {
  if (!Array.isArray(workflowRuns)) {
    throw new Error('GitHub deployment workflow runs response is invalid')
  }
  const candidates = workflowRuns.filter((run) => isDeploymentWorkflowRun(run, sha))
  const ids = candidates.map((run) => assertPositiveInteger(
    run?.id,
    'deployment workflow run ID',
  ))
  if (new Set(ids).size !== ids.length) {
    throw new Error('Deployment workflow run IDs are ambiguous')
  }
  return candidates.reduce(
    (selected, run) => (!selected || run.id > selected.id ? run : selected),
    null,
  )
}

async function readPaginatedGitHubCollection({ readJson, endpoint, key, label }) {
  const values = []
  for (let page = 1; page <= 100; page += 1) {
    const payload = await readJson(endpoint(page))
    if (!Array.isArray(payload?.[key])) {
      throw new Error(`GitHub deployment ${label} response is invalid`)
    }
    values.push(...payload[key])
    if (payload[key].length < 100) return values
  }
  throw new Error(`GitHub deployment ${label} pagination is excessive`)
}

export async function readDeploymentWorkflowEvidence({
  sha,
  readJson,
} = {}) {
  const expectedSha = assertSha(sha)
  if (typeof readJson !== 'function') {
    throw new Error('Deployment workflow reader dependency is missing')
  }
  const readSnapshot = async () => {
    const workflowRuns = await readPaginatedGitHubCollection({
      readJson,
      endpoint: (page) => deploymentWorkflowRunsEndpoint(expectedSha, page),
      key: 'workflow_runs',
      label: 'workflow runs',
    })
    const run = latestDeploymentWorkflowRun(workflowRuns, expectedSha)
    if (!run) {
      return { workflow_runs: workflowRuns, run_attempt: null, check_suite: null, jobs: [] }
    }
    const runId = assertPositiveInteger(run.id, 'deployment workflow run ID')
    const attempt = assertPositiveInteger(run.run_attempt, 'deployment workflow run attempt')
    const checkSuiteId = assertPositiveInteger(
      run.check_suite_id,
      'deployment workflow check suite ID',
    )
    const runAttempt = await readJson(
      `repos/${AMP_ORB_DEPLOY_REPOSITORY}/actions/runs/${runId}/attempts/${attempt}`,
    )
    const checkSuite = await readJson(
      `repos/${AMP_ORB_DEPLOY_REPOSITORY}/check-suites/${checkSuiteId}`,
    )
    const jobs = await readPaginatedGitHubCollection({
      readJson,
      endpoint: (page) => {
        const pageQuery = page === 1 ? '' : `&page=${page}`
        return `repos/${AMP_ORB_DEPLOY_REPOSITORY}/actions/runs/${runId}/attempts/${attempt}/jobs?per_page=100${pageQuery}`
      },
      key: 'jobs',
      label: 'workflow jobs',
    })
    return { workflow_runs: workflowRuns, run_attempt: runAttempt, check_suite: checkSuite, jobs }
  }
  const fingerprint = (evidence) => JSON.stringify(evidence)
  let previousFingerprint = null
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const evidence = await readSnapshot()
    const currentFingerprint = fingerprint(evidence)
    if (previousFingerprint === currentFingerprint) {
      return evidence
    }
    previousFingerprint = currentFingerprint
  }
  throw new Error('GitHub deployment workflow evidence changed during pagination')
}

export function assertGitHubActionsDeploymentRun(evidence, expectedSha, trustedAppId) {
  const sha = assertSha(expectedSha)
  const appId = assertPositiveInteger(trustedAppId, 'deployment GitHub Actions App ID')
  if (
    !Array.isArray(evidence?.workflow_runs)
    || !Array.isArray(evidence?.jobs)
  ) {
    throw new Error('GitHub Actions deployment evidence is invalid')
  }
  const run = latestDeploymentWorkflowRun(evidence.workflow_runs, sha)
  if (!run) throw new Error('Required GitHub Actions deployment workflow run is missing')
  const runId = assertPositiveInteger(run.id, 'deployment workflow run ID')
  const attempt = assertPositiveInteger(run.run_attempt, 'deployment workflow run attempt')
  const checkSuiteId = assertPositiveInteger(
    run.check_suite_id,
    'deployment workflow check suite ID',
  )
  if (run.status !== 'completed' || run.conclusion !== 'success') {
    throw new Error(
      `Required GitHub Actions deployment workflow is ${run.conclusion || run.status || 'unknown'}`,
    )
  }
  const runAttempt = evidence.run_attempt
  if (
    !isDeploymentWorkflowRun(runAttempt, sha)
    || runAttempt.id !== runId
    || runAttempt.run_attempt !== attempt
    || runAttempt.check_suite_id !== checkSuiteId
    || runAttempt.status !== 'completed'
    || runAttempt.conclusion !== 'success'
  ) {
    throw new Error('Current GitHub Actions deployment workflow attempt is invalid')
  }
  const checkSuite = evidence.check_suite
  if (
    checkSuite?.id !== checkSuiteId
    || checkSuite?.app?.id !== appId
    || checkSuite?.head_branch !== 'main'
    || checkSuite?.head_sha !== sha
    || checkSuite?.status !== 'completed'
    || checkSuite?.conclusion !== 'success'
  ) {
    throw new Error('GitHub Actions deployment check suite is invalid')
  }
  const jobIds = evidence.jobs.map((job) => assertPositiveInteger(
    job?.id,
    'deployment workflow job ID',
  ))
  const jobNames = evidence.jobs.map((job) => job?.name).sort()
  if (
    new Set(jobIds).size !== jobIds.length
    || jobNames.length !== AMP_ORB_DEPLOY_REQUIRED_JOBS.length
    || jobNames.some((name, index) => name !== AMP_ORB_DEPLOY_REQUIRED_JOBS[index])
    || evidence.jobs.some((job) => (
      job?.run_id !== runId
      || job?.run_attempt !== attempt
      || job?.head_sha !== sha
      || job?.status !== 'completed'
      || job?.conclusion !== 'success'
    ))
  ) {
    throw new Error('Required GitHub Actions deployment jobs are incomplete or unsuccessful')
  }
  return {
    provider: AMP_ORB_DEPLOY_WORKFLOW_NAME,
    workflowPath: AMP_ORB_DEPLOY_WORKFLOW_PATH,
    appId,
    runId,
    attempt,
    checkSuiteId,
    jobs: evidence.jobs.map(({ id, name }) => ({ id, name })).sort((left, right) =>
      left.name.localeCompare(right.name)),
    state: 'success',
  }
}

export async function verifyDeploymentAuthority({
  expectedSha,
  readWorkflowEvidence,
  githubActionsAppId = AMP_ORB_DEPLOY_GITHUB_ACTIONS_APP_ID,
} = {}) {
  const sha = assertSha(expectedSha)
  if (typeof readWorkflowEvidence !== 'function') {
    throw new Error('GitHub Actions deployment verification dependency is missing')
  }
  return assertGitHubActionsDeploymentRun(
    await readWorkflowEvidence(sha),
    sha,
    githubActionsAppId,
  )
}

// Compatibility-only readers retained while the deployment verifier still
// exercises rejection of the retired App Check receipt shape. The deployment
// CLI does not call either export.
export async function readDeploymentCheckRuns({
  sha,
  checkName = AMP_ORB_DEPLOY_AMP_CHECK_NAME,
  readJson,
} = {}) {
  const expectedSha = assertSha(sha)
  if (checkName !== AMP_ORB_DEPLOY_AMP_CHECK_NAME) {
    throw new Error('Deployment Check reader name is invalid')
  }
  if (typeof readJson !== 'function') {
    throw new Error('Deployment Check reader dependency is missing')
  }
  const readSnapshot = async () => {
    const checkRuns = []
    for (let page = 1; page <= 100; page += 1) {
      const pageQuery = page === 1 ? '' : `&page=${page}`
      const filter = `check_name=${encodeURIComponent(checkName)}&filter=all&per_page=100`
      const payload = await readJson(
        `repos/${AMP_ORB_DEPLOY_REPOSITORY}/commits/${expectedSha}/check-runs?${filter}${pageQuery}`,
      )
      if (!Array.isArray(payload?.check_runs)) {
        throw new Error('GitHub deployment checks response is invalid')
      }
      checkRuns.push(...payload.check_runs)
      if (payload.check_runs.length < 100) return checkRuns
    }
    throw new Error('GitHub deployment checks pagination is excessive')
  }
  const fingerprint = (checkRuns) => checkRuns.map((check) => JSON.stringify({
    id: check?.id ?? null,
    name: check?.name ?? null,
    headSha: check?.head_sha ?? null,
    status: check?.status ?? null,
    conclusion: check?.conclusion ?? null,
    externalId: check?.external_id ?? null,
    appId: check?.app?.id ?? null,
    appSlug: check?.app?.slug ?? null,
    checkSuiteId: check?.check_suite?.id ?? null,
    detailsUrl: check?.details_url ?? null,
  })).sort().join('\n')
  let previousFingerprint = null
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const checkRuns = await readSnapshot()
    const currentFingerprint = fingerprint(checkRuns)
    if (previousFingerprint === currentFingerprint) {
      return { total_count: checkRuns.length, check_runs: checkRuns }
    }
    previousFingerprint = currentFingerprint
  }
  throw new Error('GitHub deployment checks changed during pagination')
}

function parseAmpCheckExternalId(value) {
  const parts = String(value || '').split(':')
  if (
    parts.length !== 3
    || !AMP_ORB_DEPLOY_AMP_EXTERNAL_ID_VERSIONS.includes(parts[0])
    || !SHA.test(parts[1] || '')
    || !DELIVERY_ID.test(parts[2] || '')
  ) throw new Error('Amp Orb deployment Check external identity is invalid')
  return { version: parts[0], testedSha: parts[1], deliveryId: parts[2] }
}

export function assertAmpOrbDeploymentCheck(payload, expectedSha, trustedAppId) {
  const sha = assertSha(expectedSha)
  const appId = assertPositiveInteger(trustedAppId, 'deployment Amp Check App ID')
  if (!Array.isArray(payload?.check_runs)) {
    throw new Error('GitHub Amp Check response is invalid')
  }
  const candidates = payload.check_runs.filter((check) => (
    check?.name === AMP_ORB_DEPLOY_AMP_CHECK_NAME && check?.app?.id === appId
  ))
  const ids = candidates.map((check) => assertPositiveInteger(
    check?.id,
    'Amp Orb deployment Check Run ID',
  ))
  if (new Set(ids).size !== ids.length) {
    throw new Error('Amp Orb deployment Check Run IDs are ambiguous')
  }
  const latest = candidates.reduce(
    (selected, check) => (!selected || check.id > selected.id ? check : selected),
    null,
  )
  if (!latest) throw new Error('Required Amp Orb deployment Check is missing')
  const identity = parseAmpCheckExternalId(latest.external_id)
  if (candidates.filter((check) => check.external_id === latest.external_id).length !== 1) {
    throw new Error('Amp Orb deployment Check external identity is ambiguous')
  }
  if (latest.head_sha !== sha || identity.testedSha !== sha) {
    throw new Error('Required Amp Orb deployment Check SHA is invalid')
  }
  if (latest.status !== 'completed' || latest.conclusion !== 'success') {
    throw new Error(
      `Required Amp Orb deployment Check is ${latest.conclusion || latest.status || 'unknown'}`,
    )
  }
  return {
    provider: AMP_ORB_DEPLOY_AMP_CHECK_NAME,
    appId,
    checkRunId: latest.id,
    externalId: latest.external_id,
    externalIdVersion: identity.version,
    deliveryId: identity.deliveryId,
    state: 'success',
  }
}

export async function resolveLatestDeploymentCandidate({
  runGit,
  readMainSha,
  readDeploymentVerification,
}) {
  if (
    typeof runGit !== 'function'
    || typeof readMainSha !== 'function'
    || typeof readDeploymentVerification !== 'function'
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
  const verification = await readDeploymentVerification(remoteSha)
  return {
    repository: AMP_ORB_DEPLOY_REPOSITORY,
    sha: remoteSha,
    branch: 'main',
    verification,
  }
}

export async function assertDeploymentCandidateStillCurrent({
  readLocalSha,
  readLocalStatus,
  readMainSha,
  readDeploymentVerification,
  sha,
}) {
  if (
    typeof readLocalSha !== 'function'
    || typeof readLocalStatus !== 'function'
    || typeof readMainSha !== 'function'
    || typeof readDeploymentVerification !== 'function'
  ) {
    throw new Error('Deployment current-candidate dependencies are missing')
  }
  const expectedSha = assertSha(sha)
  const localSha = assertSha(await readLocalSha(), 'local deployment SHA')
  if (localSha !== expectedSha || String(await readLocalStatus()).trim()) {
    throw new Error('Local deployment candidate changed before the external action')
  }
  const currentSha = assertSha(await readMainSha(), 'GitHub main SHA')
  if (currentSha !== expectedSha) {
    throw new Error('GitHub main changed during deployment; repeat “部署最新版”')
  }
  const verification = await readDeploymentVerification(currentSha)
  // Authority reads may await multiple remote requests. Close that window
  // before handing off to an external action; the host MAIN_CHANGED guard
  // still independently protects the later activation boundary.
  const finalLocalSha = assertSha(await readLocalSha(), 'local deployment SHA')
  if (finalLocalSha !== expectedSha || String(await readLocalStatus()).trim()) {
    throw new Error('Local deployment candidate changed before the external action')
  }
  const finalMainSha = assertSha(await readMainSha(), 'GitHub main SHA')
  if (finalMainSha !== expectedSha) {
    throw new Error('GitHub main changed during deployment; repeat “部署最新版”')
  }
  return {
    sha: finalMainSha,
    verification,
  }
}

export function parseDeploymentControllerOutput(output, expectedSha) {
  const sha = assertSha(expectedSha)
  const prefix = 'EQB_DEPLOY_RECEIPT '
  const markers = String(output || '').split('\n')
    .filter((line) => line.startsWith(prefix))
  if (markers.length !== 1) {
    throw new Error('Deployment controller receipt marker is missing or ambiguous')
  }
  let receipt
  try {
    receipt = JSON.parse(markers[0].slice(prefix.length))
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

function parseMarkedControllerReceipt(output, prefix, label) {
  const markers = String(output || '').split('\n').filter((line) => line.startsWith(prefix))
  if (markers.length !== 1) throw new Error(`${label} receipt marker is missing or ambiguous`)
  try {
    return JSON.parse(markers[0].slice(prefix.length))
  } catch {
    throw new Error(`${label} response is not valid JSON`)
  }
}

function validReceiptPath(value) {
  return /^\/opt\/eqb\/deployments\/receipts\/[A-Za-z0-9.-]+\.json$/u.test(value || '')
}

function validDigestMap(value) {
  return value
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.keys(value).sort().join('\n')
      === ['import-ops.sqlite', 'question-bank.sqlite', 'user-data.sqlite'].join('\n')
    && Object.values(value).every((digest) => /^[a-f0-9]{64}$/u.test(digest || ''))
}

export function parseReviewedPersistenceControllerOutput(output, expectedSha, expectedDigest) {
  const sha = assertSha(expectedSha)
  if (!/^[a-f0-9]{64}$/u.test(expectedDigest || '')) throw new Error('Reviewed diff digest is invalid')
  const receipt = parseMarkedControllerReceipt(
    output,
    'EQB_REVIEWED_PERSISTENCE_RECEIPT ',
    'Reviewed-persistence controller',
  )
  const keys = [
    'changedPersistencePaths',
    'changedPersistencePathsDigest',
    'conclusion',
    'controllerVersion',
    'databaseSnapshots',
    'databasesRestored',
    'failureCode',
    'finishedAt',
    'previousSha',
    'receiptPath',
    'recovered',
    'rollbackHealthy',
    'rolledBack',
    'schemaVersion',
    'staged',
    'startedAt',
    'state',
    'targetSha',
    'trafficReopened',
  ]
  if (
    !receipt
    || typeof receipt !== 'object'
    || Array.isArray(receipt)
    || Object.keys(receipt).sort().join('\n') !== keys.join('\n')
    || receipt.schemaVersion !== 'eqb-reviewed-persistence-receipt-v1'
    || receipt.controllerVersion !== 'eqb-deploy-controller-v1'
    || receipt.state !== 'reported'
    || !['success', 'failure'].includes(receipt.conclusion)
    || receipt.targetSha !== sha
    || !SHA.test(receipt.previousSha || '')
    || !Array.isArray(receipt.changedPersistencePaths)
    || receipt.changedPersistencePathsDigest !== expectedDigest
    || (receipt.changedPersistencePaths.length > 0
      && deploymentChangedPathDigest(receipt.changedPersistencePaths) !== expectedDigest)
    || (receipt.changedPersistencePaths.length === 0 && receipt.conclusion !== 'failure')
    || (!validDigestMap(receipt.databaseSnapshots)
      && !(receipt.conclusion === 'failure'
        && Object.keys(receipt.databaseSnapshots || {}).length === 0))
    || !['boolean'].includes(typeof receipt.staged)
    || !['boolean'].includes(typeof receipt.trafficReopened)
    || !['boolean'].includes(typeof receipt.rolledBack)
    || !['boolean'].includes(typeof receipt.databasesRestored)
    || !['boolean'].includes(typeof receipt.recovered)
    || ![null, true, false].includes(receipt.rollbackHealthy)
    || (receipt.failureCode !== null && typeof receipt.failureCode !== 'string')
    || typeof receipt.startedAt !== 'string'
    || typeof receipt.finishedAt !== 'string'
    || !validReceiptPath(receipt.receiptPath)
    || (receipt.conclusion === 'success') !== (receipt.failureCode === null)
    || (receipt.databasesRestored && receipt.trafficReopened)
    || (receipt.databasesRestored && !receipt.rolledBack)
    || (receipt.rolledBack && receipt.trafficReopened)
    || (receipt.conclusion === 'success' && (
      !receipt.trafficReopened
      || receipt.rolledBack
      || receipt.databasesRestored
      || receipt.rollbackHealthy !== null
      || !validDigestMap(receipt.databaseSnapshots)
    ))
  ) throw new Error('Reviewed-persistence controller response is invalid')
  return receipt
}

export function parseHostConfigurationControllerOutput(output, expectedSha, expectedDigest) {
  const sha = assertSha(expectedSha)
  if (!/^[a-f0-9]{64}$/u.test(expectedDigest || '')) throw new Error('Host configuration diff digest is invalid')
  const receipt = parseMarkedControllerReceipt(
    output,
    'EQB_HOST_CONFIGURATION_RECEIPT ',
    'Host-configuration controller',
  )
  const keys = [
    'changedHostConfigurationPaths',
    'changedHostConfigurationPathsDigest',
    'conclusion',
    'controllerVersion',
    'failureCode',
    'finishedAt',
    'installed',
    'noOp',
    'previousHostConfigurationSha',
    'receiptPath',
    'recovered',
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
    || Object.keys(receipt).sort().join('\n') !== keys.join('\n')
    || receipt.schemaVersion !== 'eqb-host-configuration-receipt-v1'
    || receipt.controllerVersion !== 'eqb-deploy-controller-v1'
    || receipt.state !== 'reported'
    || !['success', 'failure'].includes(receipt.conclusion)
    || receipt.targetSha !== sha
    || !SHA.test(receipt.previousHostConfigurationSha || '')
    || !Array.isArray(receipt.changedHostConfigurationPaths)
    || receipt.changedHostConfigurationPathsDigest !== expectedDigest
    || (!receipt.noOp && receipt.changedHostConfigurationPaths.length > 0
      && deploymentChangedPathDigest(receipt.changedHostConfigurationPaths) !== expectedDigest)
    || (!receipt.noOp
      && receipt.changedHostConfigurationPaths.length === 0
      && receipt.conclusion !== 'failure')
    || !['boolean'].includes(typeof receipt.staged)
    || !['boolean'].includes(typeof receipt.installed)
    || !['boolean'].includes(typeof receipt.noOp)
    || !['boolean'].includes(typeof receipt.rolledBack)
    || !['boolean'].includes(typeof receipt.recovered)
    || ![null, true, false].includes(receipt.rollbackHealthy)
    || (receipt.failureCode !== null && typeof receipt.failureCode !== 'string')
    || typeof receipt.startedAt !== 'string'
    || typeof receipt.finishedAt !== 'string'
    || !validReceiptPath(receipt.receiptPath)
    || (receipt.conclusion === 'success') !== (receipt.failureCode === null)
    || (receipt.noOp && (
      receipt.conclusion !== 'success'
      || !receipt.installed
      || receipt.staged
      || receipt.changedHostConfigurationPaths.length !== 0
    ))
    || (receipt.conclusion === 'success' && (
      !receipt.installed
      || receipt.rolledBack
      || receipt.rollbackHealthy !== null
    ))
  ) throw new Error('Host-configuration controller response is invalid')
  return receipt
}

export function parseControlledTransaction(output, expected, exitCode) {
  const prefix = 'EQB_CONTROLLED_TRANSACTION '
  const line = String(output || '')
  if (!line.startsWith(prefix) || !line.endsWith('\n')
    || line.slice(0, -1).includes('\n')) throw new Error('Controlled response is polluted')
  let record
  try { record = JSON.parse(line.slice(prefix.length)) }
  catch { throw new Error('Controlled response is not JSON') }
  const keys = ['changedPathsDigest', 'command', 'failureCode', 'previousSha', 'receipt',
    'retryAllowed', 'schemaVersion', 'state', 'targetSha', 'transactionId'].sort()
  if (!record || Array.isArray(record)
    || Object.keys(record).sort().join('\n') !== keys.join('\n')
    || record.schemaVersion !== 'eqb-controlled-transaction-v1'
    || record.transactionId !== expected.transactionId
    || typeof record.transactionId !== 'string'
    || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(record.transactionId)
    || !['deploy', 'deploy-reviewed-persistence', 'update-host-config', 'install-entry'].includes(record.command)
    || (expected.command && record.command !== expected.command)
    || typeof record.targetSha !== 'string' || !SHA.test(record.targetSha)
    || typeof record.previousSha !== 'string' || !SHA.test(record.previousSha)
    || (expected.sha && record.targetSha !== expected.sha)
    || (expected.digest !== undefined && record.changedPathsDigest !== expected.digest)
    || (record.command === 'deploy' ? record.changedPathsDigest !== null
      : typeof record.changedPathsDigest !== 'string' || !/^[a-f0-9]{64}$/u.test(record.changedPathsDigest))
    || record.retryAllowed !== false
    || !['success', 'failure', 'unknown'].includes(record.state)
    || ![null, 'OPERATION_FAILED', 'OPERATION_UNKNOWN'].includes(record.failureCode)
    || (record.state === 'success') !== (record.failureCode === null)
    || exitCode !== (record.state === 'success' ? 0 : 70)) {
    throw new Error('Controlled response binding/exit is invalid; no retry')
  }
  if (record.command === 'install-entry') {
    const receipt = record.receipt
    if (!receipt || Object.keys(receipt).sort().join(',') !== 'conclusion,historical,previousHostConfigurationSha,priorTerminalDigest,priorTransactionId,rollbackHealthy,schemaVersion'
      || receipt.schemaVersion !== 'eqb-controlled-entry-receipt-v1' || receipt.historical !== 'unknown'
      || typeof receipt.previousHostConfigurationSha !== 'string' || !SHA.test(receipt.previousHostConfigurationSha)
      || typeof receipt.priorTerminalDigest !== 'string' || !/^[a-f0-9]{64}$/u.test(receipt.priorTerminalDigest)
      || typeof receipt.priorTransactionId !== 'string'
      || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(receipt.priorTransactionId)
      || receipt.priorTransactionId === record.transactionId
      || !['success', 'failure'].includes(receipt.conclusion)
      || ![true, false, null].includes(receipt.rollbackHealthy)) throw new Error('Entry receipt is invalid')
  } else if (record.receipt !== null) {
    const parsers = {
      deploy: [parseDeploymentControllerOutput, 'EQB_DEPLOY_RECEIPT '],
      'deploy-reviewed-persistence': [parseReviewedPersistenceControllerOutput, 'EQB_REVIEWED_PERSISTENCE_RECEIPT '],
      'update-host-config': [parseHostConfigurationControllerOutput, 'EQB_HOST_CONFIGURATION_RECEIPT '],
    }
    const [parse, marker] = parsers[record.command]
    parse(`${marker}${JSON.stringify(record.receipt)}\n`, record.targetSha, record.changedPathsDigest)
  }
  if (record.state === 'success' && record.receipt?.conclusion !== 'success') {
    throw new Error('Controlled success lacks a successful engine receipt')
  }
  if (record.state === 'failure' && (record.receipt?.conclusion !== 'failure'
    || record.receipt.rollbackHealthy === false)) throw new Error('Controlled failure is unsafe')
  return record
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
      ...(preflight.protocol === 'eqb-controlled-ssh-v1' ? ['protocol', 'hostConfigurationSha'] : []),
    ].sort().join('\n')
    || (preflight.protocol !== undefined && (preflight.protocol !== 'eqb-controlled-ssh-v1'
      || typeof preflight.hostConfigurationSha !== 'string' || !SHA.test(preflight.hostConfigurationSha)))
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

export function parseMaintenanceInstallReadiness(
  output,
  expectedSha,
  expectedDigest,
  expectedTransportUser,
) {
  const targetSha = assertSha(expectedSha)
  if (!/^[a-f0-9]{64}$/u.test(expectedDigest || '')) {
    throw new Error('Maintenance install payload digest is invalid')
  }
  if (!/^[a-z_][a-z0-9_-]*$/u.test(expectedTransportUser || '')) {
    throw new Error('Maintenance install transport user is invalid')
  }
  const report = parseMarkedControllerReceipt(
    output,
    'EQB_MAINTENANCE_INSTALL_READINESS ',
    'Maintenance install readiness',
  )
  const keys = [
    'availableBytes',
    'caddyfileSha256',
    'controllerModuleSha256',
    'deploymentLockMode',
    'failureCode',
    'layout',
    'payloadDigest',
    'productionSha',
    'rootWrapperSha256',
    'schemaVersion',
    'state',
    'targetSha',
    'transportUid',
    'transportUser',
    'transportWrapperSha256',
    'unitSha256',
  ]
  const digest = /^[a-f0-9]{64}$/u
  const ready = report?.state === 'ready'
  if (
    !report
    || typeof report !== 'object'
    || Array.isArray(report)
    || Object.keys(report).sort().join('\n') !== keys.join('\n')
    || report.schemaVersion !== EQB_MAINTENANCE_INSTALL_READINESS_SCHEMA_VERSION
    || !['ready', 'failed'].includes(report.state)
    || report.targetSha !== targetSha
    || report.payloadDigest !== expectedDigest
    || report.transportUser !== expectedTransportUser
    || (ready && (
      report.failureCode !== null
      || !['0600', '0644'].includes(report.deploymentLockMode)
      || report.layout !== 'release'
      || !SHA.test(report.productionSha || '')
      || !Number.isSafeInteger(report.transportUid)
      || report.transportUid <= 0
      || !Number.isSafeInteger(report.availableBytes)
      || report.availableBytes < 5 * 1024 * 1024 * 1024
      || !digest.test(report.controllerModuleSha256 || '')
      || !digest.test(report.rootWrapperSha256 || '')
      || !digest.test(report.transportWrapperSha256 || '')
      || !digest.test(report.unitSha256 || '')
      || !digest.test(report.caddyfileSha256 || '')
    ))
    || (!ready && (
      !/^[A-Z0-9_]+$/u.test(report.failureCode || '')
      || report.deploymentLockMode !== null
      || report.layout !== null
      || report.productionSha !== null
      || report.transportUid !== null
      || report.availableBytes !== null
      || report.controllerModuleSha256 !== null
      || report.rootWrapperSha256 !== null
      || report.transportWrapperSha256 !== null
      || report.unitSha256 !== null
      || report.caddyfileSha256 !== null
    ))
  ) throw new Error('Maintenance install readiness response is invalid')
  return report
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

export function parseReleaseBootstrapFailure(output, expectedSha, expectedExitCode) {
  const sha = assertSha(expectedSha)
  if (
    expectedExitCode !== undefined
    && (!Number.isInteger(expectedExitCode) || expectedExitCode < 1 || expectedExitCode > 255)
  ) {
    throw new Error('Release-layout bootstrap exit code is invalid')
  }
  const prefix = 'EQB_BOOTSTRAP_FAILURE '
  const markers = String(output || '').split('\n')
    .filter((line) => line.startsWith(prefix))
  if (markers.length !== 1) {
    throw new Error('Release-layout bootstrap failure marker is missing or ambiguous')
  }
  let receipt
  try {
    receipt = JSON.parse(markers[0].slice(prefix.length))
  } catch {
    throw new Error('Release-layout bootstrap failure marker is not valid JSON')
  }
  const expectedKeys = [
    'conclusion',
    'evidenceRetained',
    'exitCode',
    'failedStage',
    'rollbackHealthy',
    'schemaVersion',
    'state',
    'targetSha',
  ]
  if (
    !receipt
    || typeof receipt !== 'object'
    || Array.isArray(receipt)
    || Object.keys(receipt).sort().join('\n') !== expectedKeys.join('\n')
    || receipt.schemaVersion !== EQB_RELEASE_BOOTSTRAP_FAILURE_SCHEMA_VERSION
    || receipt.state !== 'reported'
    || receipt.conclusion !== 'failure'
    || receipt.targetSha !== sha
    || !/^[a-z0-9-]+$/u.test(receipt.failedStage || '')
    || !Number.isInteger(receipt.exitCode)
    || receipt.exitCode < 1
    || receipt.exitCode > 255
    || (expectedExitCode !== undefined && receipt.exitCode !== expectedExitCode)
    || typeof receipt.rollbackHealthy !== 'boolean'
    || typeof receipt.evidenceRetained !== 'boolean'
  ) {
    throw new Error('Release-layout bootstrap failure marker is invalid')
  }
  return receipt
}

export function classifyReleaseBootstrapJournal(output, expectedSha) {
  const sha = assertSha(expectedSha)
  const text = String(output || '')
  const failurePrefix = 'EQB_BOOTSTRAP_FAILURE '
  const failures = text.split('\n').filter((line) => line.startsWith(failurePrefix))
  const completion = `EQB deployment bootstrap complete: ${sha}`
  const completions = text.split('\n').filter((line) => line === completion)
  if (failures.length === 0 && completions.length === 0) return { state: 'unknown' }
  if (failures.length === 1 && completions.length === 0) {
    return {
      state: 'failure',
      failure: parseReleaseBootstrapFailure(text, sha),
    }
  }
  if (failures.length === 0 && completions.length === 1) return { state: 'success' }
  throw new Error('Release-layout bootstrap journal evidence is ambiguous')
}

export function classifyReleaseBootstrapOutcome(output, expectedSha, remoteStatus) {
  const evidence = classifyReleaseBootstrapJournal(output, expectedSha)
  if (evidence.state === 'failure') {
    if (
      Number.isInteger(remoteStatus)
      && remoteStatus !== 255
      && remoteStatus !== evidence.failure.exitCode
    ) throw new Error('Release-layout bootstrap status does not match its failure marker')
    return evidence
  }
  if (
    evidence.state === 'success'
    && Number.isInteger(remoteStatus)
    && ![0, 255].includes(remoteStatus)
  ) throw new Error('Release-layout bootstrap status does not match its completion marker')
  if (evidence.state === 'unknown' && remoteStatus === 75) return { state: 'lock' }
  return evidence
}

export function bootstrapPayloadStageInput(sourceValue, digestValue) {
  const source = String(sourceValue || '')
  const digest = String(digestValue || '')
  if (!/^[a-f0-9]{64}$/u.test(digest)) {
    throw new Error('Release bootstrap payload digest is invalid')
  }
  const delimiter = `EQB_BOOTSTRAP_PAYLOAD_${digest.toUpperCase()}`
  if (!source.endsWith('\n') || source.split('\n').includes(delimiter)) {
    throw new Error('Release bootstrap payload cannot be staged safely')
  }
  return `set -Eeuo pipefail
PATH=/usr/sbin:/usr/bin:/sbin:/bin
umask 077
target_sha=$1
expected_digest=$2
[[ "$target_sha" =~ ^[a-f0-9]{40}$ ]] || exit 91
[[ "$expected_digest" =~ ^[a-f0-9]{64}$ ]] || exit 92
backup_root=/var/backups/eqb
[[ -d "$backup_root" && ! -L "$backup_root" ]] || exit 93
[[ "$(/usr/bin/stat -c '%u:%g:%a' -- "$backup_root")" == '0:0:700' ]] || exit 94
exec 9<"$backup_root"
/usr/bin/flock --exclusive --nonblock --conflict-exit-code 75 9
digest_prefix=$(/usr/bin/printf '%s' "$expected_digest" | /usr/bin/cut -c 1-16)
destination="$backup_root/bootstrap-payload-$target_sha-$digest_prefix.sh"
temporary=
cleanup_stage() {
  if [[ -n "$temporary" ]]; then
    /usr/bin/rm -f -- "$temporary"
  fi
}
trap cleanup_stage EXIT
if [[ -e "$destination" || -L "$destination" ]]; then
  [[ -f "$destination" && ! -L "$destination" ]] || exit 96
  [[ "$(/usr/bin/stat -c '%u:%g:%a:%h' -- "$destination")" == '0:0:600:1' ]] || exit 97
  installed_digest=$(/usr/bin/sha256sum -- "$destination" | /usr/bin/cut -d ' ' -f 1)
  [[ "$installed_digest" == "$expected_digest" ]] || exit 98
else
  temporary=$(/usr/bin/mktemp "$backup_root/.bootstrap-payload-XXXXXXXX")
  /usr/bin/cat >"$temporary" <<'${delimiter}'
${source}${delimiter}
  incoming_digest=$(/usr/bin/sha256sum -- "$temporary" | /usr/bin/cut -d ' ' -f 1)
  [[ "$incoming_digest" == "$expected_digest" ]] || exit 99
  /usr/bin/chown 0:0 -- "$temporary"
  /usr/bin/chmod 0600 -- "$temporary"
  [[ "$(/usr/bin/stat -c '%u:%g:%a:%h' -- "$temporary")" == '0:0:600:1' ]] || exit 100
  /usr/bin/sync -d -- "$temporary"
  /usr/bin/mv -- "$temporary" "$destination"
  temporary=
  /usr/bin/sync -d -- "$backup_root"
fi
printf 'EQB bootstrap payload staged: %s\n' "$target_sha"
`
}

export function parseReleaseBootstrapCancellation(output, expectedSha, expectedUnit) {
  const sha = assertSha(expectedSha)
  if (!BOOTSTRAP_UNIT.test(expectedUnit || '')) {
    throw new Error('Release-layout bootstrap cancellation unit is invalid')
  }
  const prefix = 'EQB_BOOTSTRAP_CANCELLATION '
  const markers = String(output || '').split('\n')
    .filter((line) => line.startsWith(prefix))
  if (markers.length !== 1) {
    throw new Error('Release-layout bootstrap cancellation marker is missing or ambiguous')
  }
  let receipt
  try {
    receipt = JSON.parse(markers[0].slice(prefix.length))
  } catch {
    throw new Error('Release-layout bootstrap cancellation marker is not valid JSON')
  }
  const expectedKeys = [
    'cancellationInstalled',
    'conclusion',
    'hostAttemptStarted',
    'schemaVersion',
    'state',
    'targetSha',
    'unit',
  ]
  if (
    !receipt
    || typeof receipt !== 'object'
    || Array.isArray(receipt)
    || Object.keys(receipt).sort().join('\n') !== expectedKeys.join('\n')
    || receipt.schemaVersion !== EQB_RELEASE_BOOTSTRAP_CANCELLATION_SCHEMA_VERSION
    || receipt.state !== 'reported'
    || receipt.conclusion !== 'cancelled'
    || receipt.targetSha !== sha
    || receipt.unit !== expectedUnit
    || receipt.cancellationInstalled !== true
    || typeof receipt.hostAttemptStarted !== 'boolean'
  ) {
    throw new Error('Release-layout bootstrap cancellation marker is invalid')
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
  revalidateCandidate,
  readLegacyPreflight,
  invokeOperator,
} = {}) {
  requireLegacyBaselineAuthorization(argv)
  if (
    typeof resolveCandidate !== 'function'
    || typeof revalidateCandidate !== 'function'
    || typeof readLegacyPreflight !== 'function'
    || typeof invokeOperator !== 'function'
  ) {
    throw new Error('Legacy baseline dependencies are missing')
  }
  const candidate = await resolveCandidate()
  await revalidateCandidate(candidate)
  const preflight = await readLegacyPreflight(candidate)
  if (preflight?.baselineState === 'established') {
    throw new Error('BASELINE_ALREADY_ESTABLISHED')
  }
  if (
    preflight?.layout !== 'legacy'
    || preflight?.baselineState !== 'absent'
    || preflight?.productionSha === candidate.sha
    || preflight?.trackedDirtyPaths !== 0
    || preflight?.eqb !== 'active'
    || preflight?.caddy !== 'active'
    || preflight?.strictHealth !== 'ok'
  ) {
    throw new Error('Legacy production is not eligible for baseline migration')
  }
  await revalidateCandidate(candidate)
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

export async function completeReleaseLayoutBootstrap({
  candidate,
  readControllerPreflight,
  classifyBootstrapIdentity,
  retireBootstrapIdentity,
  rotateControllerSecret,
  cleanupRecovery,
} = {}) {
  const sha = assertSha(candidate?.sha)
  if (
    typeof readControllerPreflight !== 'function'
    || typeof classifyBootstrapIdentity !== 'function'
    || typeof retireBootstrapIdentity !== 'function'
    || typeof rotateControllerSecret !== 'function'
    || typeof cleanupRecovery !== 'function'
  ) {
    throw new Error('Release-layout bootstrap finalization dependencies are missing')
  }
  function assertHealthyController(preflight) {
    if (
      preflight?.layout !== 'release'
      || preflight?.productionSha !== sha
      || preflight?.eqb !== 'active'
      || preflight?.caddy !== 'active'
    ) {
      throw new Error('New deployment controller did not prove a healthy release layout')
    }
    return preflight
  }

  assertHealthyController(await readControllerPreflight(candidate))
  const initialIdentityState = await classifyBootstrapIdentity(candidate)
  if (!['active', 'retired'].includes(initialIdentityState)) {
    throw new Error('Privileged bootstrap identity state is unknown')
  }
  await rotateControllerSecret(candidate)
  const keyRetirement = initialIdentityState === 'active'
    ? await retireBootstrapIdentity(candidate)
    : null
  const controllerPreflight = assertHealthyController(await readControllerPreflight(candidate))
  if (await classifyBootstrapIdentity(candidate) !== 'retired') {
    throw new Error('Privileged bootstrap identity remains usable or its state is unknown')
  }
  await cleanupRecovery(candidate)
  return {
    controllerPreflight,
    initialIdentityState,
    keyRetirement,
  }
}

export async function bootstrapReleaseLayout({
  argv,
  resolveCandidate,
  revalidateCandidate,
  readLegacyPreflight,
  invokeBootstrap,
  readControllerPreflight,
  retireBootstrapIdentity,
  classifyBootstrapIdentity,
  rotateControllerSecret,
  cleanupRecovery,
  isAncestor,
  readProtectedDiff,
} = {}) {
  requireReleaseLayoutBootstrapAuthorization(argv)
  if (
    typeof resolveCandidate !== 'function'
    || typeof revalidateCandidate !== 'function'
    || typeof readLegacyPreflight !== 'function'
    || typeof invokeBootstrap !== 'function'
    || typeof readControllerPreflight !== 'function'
    || typeof retireBootstrapIdentity !== 'function'
    || typeof classifyBootstrapIdentity !== 'function'
    || typeof rotateControllerSecret !== 'function'
    || typeof cleanupRecovery !== 'function'
    || typeof isAncestor !== 'function'
    || typeof readProtectedDiff !== 'function'
  ) {
    throw new Error('Release-layout bootstrap dependencies are missing')
  }
  const candidate = await resolveCandidate()
  await revalidateCandidate(candidate)
  const legacyPreflight = await readLegacyPreflight(candidate)
  if (
    legacyPreflight?.layout !== 'legacy'
    || legacyPreflight?.baselineState !== 'established'
    || legacyPreflight?.baselineReceipts !== 1
    || legacyPreflight?.quarantineChildren !== 1
    || legacyPreflight?.liveReleaseLayout !== 'absent'
    || legacyPreflight?.defaultIdentity !== 'ok'
    || legacyPreflight?.controllerSudo !== 'ok'
    || legacyPreflight?.trackedDirtyPaths !== 0
    || legacyPreflight?.eqb !== 'active'
    || legacyPreflight?.caddy !== 'active'
    || legacyPreflight?.strictHealth !== 'ok'
  ) {
    throw new Error('Production is not an eligible migrated baseline')
  }
  let ancestor
  try {
    ancestor = await isAncestor(legacyPreflight.productionSha, candidate.sha)
  } catch {
    throw new Error('BASELINE_ANCESTRY_UNKNOWN')
  }
  if (ancestor !== true) throw new Error('BASELINE_ANCESTRY_UNKNOWN')
  let protectedDiff
  try {
    protectedDiff = await readProtectedDiff(
      legacyPreflight.productionSha,
      candidate.sha,
      EQB_PERSISTENCE_AUTHORITY_PATHS,
    )
  } catch {
    throw new Error('BASELINE_ANCESTRY_UNKNOWN')
  }
  if (
    !Array.isArray(protectedDiff)
    || protectedDiff.some((filePath) => typeof filePath !== 'string' || !filePath)
  ) throw new Error('BASELINE_ANCESTRY_UNKNOWN')
  if (protectedDiff.length !== 0) throw new Error('PERSISTENCE_AUTHORITY_CHANGED')
  await revalidateCandidate(candidate)
  await invokeBootstrap({ candidate, legacyPreflight })
  const finalized = await completeReleaseLayoutBootstrap({
    candidate,
    readControllerPreflight,
    classifyBootstrapIdentity,
    retireBootstrapIdentity,
    rotateControllerSecret,
    cleanupRecovery,
  })
  return { candidate, legacyPreflight, ...finalized }
}

export async function resumeReleaseLayoutBootstrap({
  argv,
  candidate,
  readControllerPreflight,
  classifyBootstrapIdentity,
  retireBootstrapIdentity,
  rotateControllerSecret,
  cleanupRecovery,
} = {}) {
  requireReleaseLayoutBootstrapResumeAuthorization(argv)
  const finalized = await completeReleaseLayoutBootstrap({
    candidate,
    readControllerPreflight,
    classifyBootstrapIdentity,
    retireBootstrapIdentity,
    rotateControllerSecret,
    cleanupRecovery,
  })
  return { candidate, resumed: true, ...finalized }
}

export async function deployLatestRelease({
  argv,
  resolveCandidate,
  revalidateCandidate,
  invokeController,
} = {}) {
  requireDeployLatestAuthorization(argv)
  if (
    typeof resolveCandidate !== 'function'
    || typeof revalidateCandidate !== 'function'
    || typeof invokeController !== 'function'
  ) {
    throw new Error('Deployment execution dependencies are missing')
  }
  const classificationFlags = argv.filter(value => [
    '--reviewed-code-only-digest', '--reviewed-migration-digest',
  ].includes(value))
  if (classificationFlags.length > 1) throw new Error('Choose one reviewed deployment classification')
  const classificationFlag = classificationFlags[0]
  const digest = classificationFlag ? argv[argv.indexOf(classificationFlag) + 1] : undefined
  if (classificationFlag && !/^[a-f0-9]{64}$/u.test(digest || '')) {
    throw new Error('Reviewed deployment classification requires an exact protected-path digest')
  }
  const classification = classificationFlag
    ? (classificationFlag === '--reviewed-code-only-digest' ? 'code-only' : 'migrate') : undefined
  const candidate = await resolveCandidate()
  await revalidateCandidate(candidate)
  const parseReceipt = classification === 'migrate'
    ? parseReviewedPersistenceControllerOutput : parseDeploymentControllerOutput
  const receipt = parseReceipt(
    await invokeController(candidate.sha, classification, digest),
    candidate.sha,
    digest,
  )
  if (receipt.conclusion !== 'success') {
    throw new Error(`Production controller reported ${receipt.failureCode || 'failure'}`)
  }
  return { candidate, receipt }
}

async function runReviewedDeploymentMaintenance({
  argv,
  authorize,
  resolveCandidate,
  revalidateCandidate,
  readProductionSha,
  readChangedPaths,
  protectedPaths,
  invokeController,
  parseReceipt,
} = {}) {
  authorize(argv)
  if (
    typeof resolveCandidate !== 'function'
    || typeof revalidateCandidate !== 'function'
    || typeof readProductionSha !== 'function'
    || typeof readChangedPaths !== 'function'
    || typeof invokeController !== 'function'
  ) throw new Error('Deployment maintenance dependencies are missing')
  const candidate = await resolveCandidate()
  await revalidateCandidate(candidate)
  const productionSha = assertSha(await readProductionSha(), 'production SHA')
  const changedPaths = await readChangedPaths(productionSha, candidate.sha, protectedPaths)
  if (
    !Array.isArray(changedPaths)
    || changedPaths.length === 0
    || changedPaths.some((filePath) => !protectedPaths.some((protectedPath) => (
      filePath === protectedPath || filePath.startsWith(`${protectedPath}/`)
    )))
  ) throw new Error('The separately reviewed protected diff is empty or invalid')
  const changedPathsDigest = deploymentChangedPathDigest(changedPaths)
  await revalidateCandidate(candidate)
  const receipt = parseReceipt(
    await invokeController(candidate.sha, changedPathsDigest),
    candidate.sha,
    changedPathsDigest,
  )
  if (receipt.conclusion !== 'success') {
    throw new Error(`Production controller reported ${receipt.failureCode || 'failure'}`)
  }
  return { candidate, productionSha, changedPaths, changedPathsDigest, receipt }
}

export async function deployReviewedPersistenceLatest(options = {}) {
  return runReviewedDeploymentMaintenance({
    ...options,
    authorize: requireReviewedPersistenceDeployAuthorization,
    protectedPaths: EQB_PERSISTENCE_AUTHORITY_PATHS,
    parseReceipt: parseReviewedPersistenceControllerOutput,
  })
}

export async function updateLatestHostConfiguration(options = {}) {
  return runReviewedDeploymentMaintenance({
    ...options,
    authorize: requireUpdateHostConfigurationAuthorization,
    protectedPaths: EQB_HOST_CONFIGURATION_PATHS,
    parseReceipt: parseHostConfigurationControllerOutput,
  })
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
  deploymentSSHTransportUser(host)
  if (!path.isAbsolute(keyPath || '') || !path.isAbsolute(knownHostsPath || '')) {
    throw new Error('Deployment SSH credential paths must be absolute')
  }
  if (
    !Array.isArray(remoteArgs)
    || remoteArgs.some((value) => typeof value !== 'string' || !SSH_REMOTE_TOKEN.test(value))
  ) {
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
      '-o', 'ServerAliveInterval=15',
      '-o', 'ServerAliveCountMax=4',
      host,
      ...remoteArgs,
    ],
  }
}

export function deploymentSSHTransportUser(host) {
  if (!SSH_TARGET.test(host || '') || String(host).startsWith('-')) {
    throw new Error('Deployment SSH target is invalid')
  }
  const separator = String(host).indexOf('@')
  if (separator < 1) {
    throw new Error('Deployment SSH target must name its transport account explicitly')
  }
  const user = String(host).slice(0, separator)
  if (!/^[a-z_][a-z0-9_-]*$/u.test(user) || user === 'root') {
    throw new Error('Deployment SSH transport account is invalid')
  }
  return user
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
  const expectedKeys = [
    'baselineFailedReceipts',
    'baselineReceipts',
    'baselineState',
    'caddy',
    'controllerSudo',
    'defaultIdentity',
    'eqb',
    'layout',
    'liveReleaseLayout',
    'productionSha',
    'quarantineChildren',
    'strictHealth',
    'trackedDirtyPaths',
  ]
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
  const baselineReceipts = values.get('baselineReceipts')
  const baselineFailedReceipts = values.get('baselineFailedReceipts')
  const quarantineChildren = values.get('quarantineChildren')
  const countValues = [dirtyValue, baselineReceipts, baselineFailedReceipts, quarantineChildren]
  if (!countValues.every((value) => /^\d+$/u.test(value) && Number.isSafeInteger(Number(value)))) {
    throw new Error('Deployment preflight dirty count is invalid')
  }
  const serviceState = /^[a-z-]+$/u
  if (!serviceState.test(values.get('eqb')) || !serviceState.test(values.get('caddy'))) {
    throw new Error('Deployment preflight service state is invalid')
  }
  if (!['legacy', 'release'].includes(values.get('layout'))) {
    throw new Error('Deployment preflight layout is invalid')
  }
  if (
    !['absent', 'established', 'invalid'].includes(values.get('baselineState'))
    || !['absent', 'partial', 'present'].includes(values.get('liveReleaseLayout'))
    || !['invalid', 'missing', 'ok'].includes(values.get('defaultIdentity'))
    || !['invalid', 'ok'].includes(values.get('controllerSudo'))
    || !['invalid', 'ok'].includes(values.get('strictHealth'))
  ) {
    throw new Error('Deployment preflight baseline evidence is invalid')
  }
  return {
    productionSha,
    trackedDirtyPaths: Number(dirtyValue),
    eqb: values.get('eqb'),
    caddy: values.get('caddy'),
    layout: values.get('layout'),
    baselineState: values.get('baselineState'),
    baselineReceipts: Number(baselineReceipts),
    baselineFailedReceipts: Number(baselineFailedReceipts),
    quarantineChildren: Number(quarantineChildren),
    liveReleaseLayout: values.get('liveReleaseLayout'),
    defaultIdentity: values.get('defaultIdentity'),
    controllerSudo: values.get('controllerSudo'),
    strictHealth: values.get('strictHealth'),
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
