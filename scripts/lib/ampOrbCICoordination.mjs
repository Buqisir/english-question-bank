import { createHash, randomUUID } from 'node:crypto'
import {
  chmodSync,
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'

const REPOSITORY = 'Buqisir/english-question-bank'
const SHA = /^[a-f0-9]{40}$/u
const DIGEST = /^[a-f0-9]{64}$/u
const ACTIVATION_BYTES = 'amp-orb-ci-coordination-activated-v1\n'
const OWNER_SCOPE_SCHEMA = 'amp-orb-ci-owner-scope-v1'
const STATE_SCHEMA = 'amp-orb-ci-coordination-state-v1'

function ensurePrivateDirectory(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  chmodSync(directory, 0o700)
}

function syncDirectory(directory) {
  const descriptor = openSync(directory, 'r')
  try {
    fsyncSync(descriptor)
  } finally {
    closeSync(descriptor)
  }
}

function durableAtomicWrite(filePath, contents) {
  const directory = path.dirname(filePath)
  ensurePrivateDirectory(directory)
  const temporary = `${filePath}.tmp-${process.pid}-${randomUUID()}`
  const descriptor = openSync(temporary, 'wx', 0o600)
  try {
    writeFileSync(descriptor, contents, 'utf8')
    fsyncSync(descriptor)
  } finally {
    closeSync(descriptor)
  }
  renameSync(temporary, filePath)
  chmodSync(filePath, 0o600)
  syncDirectory(directory)
}

function durableAtomicWriteJson(filePath, value) {
  durableAtomicWrite(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

export function ampOrbCICoordinationPaths(stateDir) {
  const directory = path.join(stateDir, 'coordination')
  return Object.freeze({
    directory,
    activation: path.join(directory, 'activated'),
    ownerScope: path.join(directory, 'owner-scope.json'),
    state: path.join(directory, 'state.json'),
  })
}

function normalizePullRequests(values) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error('Amp Orb CI Owner scope requires at least one pull request')
  }
  const pullRequests = [...new Set(values.map((value) => {
    const number = typeof value === 'string' && /^\d+$/u.test(value) ? Number(value) : value
    if (!Number.isSafeInteger(number) || number < 1) {
      throw new Error('Amp Orb CI Owner scope pull request is invalid')
    }
    return number
  }))].sort((left, right) => left - right)
  return pullRequests
}

function normalizeOwnerScope(value) {
  if (value?.schemaVersion !== OWNER_SCOPE_SCHEMA || value.repository !== REPOSITORY) {
    throw new Error('Amp Orb CI Owner scope is invalid')
  }
  const pullRequests = normalizePullRequests(value.pullRequests)
  if (pullRequests.length !== value.pullRequests.length) {
    throw new Error('Amp Orb CI Owner scope contains duplicate pull requests')
  }
  return Object.freeze({ schemaVersion: OWNER_SCOPE_SCHEMA, repository: REPOSITORY, pullRequests })
}

function ownerScopeDigest(ownerScope) {
  return createHash('sha256').update(JSON.stringify(ownerScope)).digest('hex')
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

function normalizeSelected(value) {
  if (!Number.isSafeInteger(value?.pullRequestNumber) || value.pullRequestNumber < 1
    || !SHA.test(value?.sha || '') || !SHA.test(value?.baseSha || '')) {
    throw new Error('Amp Orb CI selected pull request identity is invalid')
  }
  return Object.freeze({
    pullRequestNumber: value.pullRequestNumber,
    sha: value.sha,
    baseSha: value.baseSha,
  })
}

function normalizeState(value, expectedScopeDigest) {
  if (value?.schemaVersion !== STATE_SCHEMA
    || !Number.isSafeInteger(value.generation) || value.generation < 1
    || !['paused', 'selected'].includes(value.mode)
    || !DIGEST.test(value.ownerScopeDigest || '')
    || value.ownerScopeDigest !== expectedScopeDigest) {
    throw new Error('Amp Orb CI coordination state is invalid')
  }
  const selected = value.mode === 'selected' ? normalizeSelected(value.selected) : null
  const wakePendingGeneration = value.wakePendingGeneration === null
    ? null
    : value.wakePendingGeneration
  if ((wakePendingGeneration !== null
      && (!Number.isSafeInteger(wakePendingGeneration) || wakePendingGeneration !== value.generation))
    || (value.mode === 'paused' && (selected !== null || wakePendingGeneration !== null))) {
    throw new Error('Amp Orb CI coordination wake state is invalid')
  }
  return Object.freeze({
    schemaVersion: STATE_SCHEMA,
    generation: value.generation,
    mode: value.mode,
    ownerScopeDigest: value.ownerScopeDigest,
    selected,
    wakePendingGeneration,
  })
}

export function readAmpOrbCICoordination(stateDir) {
  const paths = ampOrbCICoordinationPaths(stateDir)
  let activation
  try {
    activation = readFileSync(paths.activation, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') return Object.freeze({ active: false, mode: 'legacy' })
    return Object.freeze({ active: true, mode: 'paused', reason: 'activation-marker-unreadable' })
  }
  if (activation !== ACTIVATION_BYTES) {
    return Object.freeze({ active: true, mode: 'paused', reason: 'activation-marker-invalid' })
  }
  try {
    const ownerScope = normalizeOwnerScope(readJson(paths.ownerScope))
    const scopeDigest = ownerScopeDigest(ownerScope)
    const state = normalizeState(readJson(paths.state), scopeDigest)
    if (state.selected && !ownerScope.pullRequests.includes(state.selected.pullRequestNumber)) {
      throw new Error('Amp Orb CI selected pull request is outside the Owner scope')
    }
    return Object.freeze({ active: true, ...state, ownerScope })
  } catch {
    return Object.freeze({ active: true, mode: 'paused', reason: 'coordination-state-invalid' })
  }
}

export function activateAmpOrbCICoordination({ stateDir, pullRequestNumbers, afterStateWrite } = {}) {
  const current = readAmpOrbCICoordination(stateDir)
  if (current.active) throw new Error('Amp Orb CI coordination is already activated')
  const paths = ampOrbCICoordinationPaths(stateDir)
  ensurePrivateDirectory(paths.directory)
  // The files below fsync this directory. Establish its parent entry first so
  // an acknowledged activation cannot lose the entire opt-in directory.
  syncDirectory(stateDir)
  const ownerScope = normalizeOwnerScope({
    schemaVersion: OWNER_SCOPE_SCHEMA,
    repository: REPOSITORY,
    pullRequests: normalizePullRequests(pullRequestNumbers),
  })
  const digest = ownerScopeDigest(ownerScope)
  const state = {
    schemaVersion: STATE_SCHEMA,
    generation: 1,
    mode: 'paused',
    ownerScopeDigest: digest,
    selected: null,
    wakePendingGeneration: null,
  }
  durableAtomicWriteJson(paths.ownerScope, ownerScope)
  durableAtomicWriteJson(paths.state, state)
  afterStateWrite?.()
  durableAtomicWrite(paths.activation, ACTIVATION_BYTES)
  return readAmpOrbCICoordination(stateDir)
}

export function selectAmpOrbCIPullRequest({
  stateDir,
  expectedGeneration,
  pullRequestNumber,
  sha,
  baseSha,
} = {}) {
  const current = readAmpOrbCICoordination(stateDir)
  if (!current.active || current.reason || !Number.isSafeInteger(expectedGeneration)
    || current.generation !== expectedGeneration) {
    throw new Error('Amp Orb CI coordination generation is stale or unavailable')
  }
  const selected = normalizeSelected({ pullRequestNumber, sha, baseSha })
  if (!current.ownerScope.pullRequests.includes(selected.pullRequestNumber)) {
    throw new Error('Amp Orb CI selected pull request is outside the Owner scope')
  }
  const generation = current.generation + 1
  const state = {
    schemaVersion: STATE_SCHEMA,
    generation,
    mode: 'selected',
    ownerScopeDigest: current.ownerScopeDigest,
    selected,
    wakePendingGeneration: generation,
  }
  durableAtomicWriteJson(ampOrbCICoordinationPaths(stateDir).state, state)
  return readAmpOrbCICoordination(stateDir)
}

export function pauseAmpOrbCICoordination({ stateDir, expectedGeneration } = {}) {
  const current = readAmpOrbCICoordination(stateDir)
  if (!current.active || current.reason || current.generation !== expectedGeneration) {
    throw new Error('Amp Orb CI coordination generation is stale or unavailable')
  }
  durableAtomicWriteJson(ampOrbCICoordinationPaths(stateDir).state, {
    schemaVersion: STATE_SCHEMA,
    generation: current.generation + 1,
    mode: 'paused',
    ownerScopeDigest: current.ownerScopeDigest,
    selected: null,
    wakePendingGeneration: null,
  })
  return readAmpOrbCICoordination(stateDir)
}

function sameSelection(input, selected) {
  return input?.event === 'pull_request'
    && input.pullRequestNumber === selected.pullRequestNumber
    && input.sha === selected.sha
    && input.baseSha === selected.baseSha
}

export function ampOrbCIPullRequestEligibility(input, { stateDir } = {}) {
  if (input?.event !== 'pull_request') return Object.freeze({ eligible: true, mode: 'main-unchanged' })
  const coordination = readAmpOrbCICoordination(stateDir)
  if (!coordination.active) return Object.freeze({ eligible: true, mode: 'legacy' })
  if (coordination.mode === 'selected' && sameSelection(input, coordination.selected)) {
    return Object.freeze({ eligible: true, mode: 'selected', generation: coordination.generation })
  }
  return Object.freeze({
    eligible: false,
    mode: 'waiting',
    reason: coordination.reason || (coordination.mode === 'paused' ? 'paused' : 'not-selected'),
    generation: coordination.generation ?? null,
  })
}

export function assertAmpOrbCIPullRequestEligibility(input, { stateDir } = {}) {
  const eligibility = ampOrbCIPullRequestEligibility(input, { stateDir })
  if (!eligibility.eligible) throw new Error(`Amp Orb CI pull request is not selected (${eligibility.reason})`)
  return eligibility
}

export function acknowledgeAmpOrbCICoordinationWake({ stateDir, generation, dispositions } = {}) {
  const current = readAmpOrbCICoordination(stateDir)
  if (!current.active || current.mode !== 'selected'
    || current.generation !== generation || current.wakePendingGeneration !== generation) {
    return current
  }
  const matching = (dispositions || []).filter(({ input }) => sameSelection(input, current.selected))
  const terminal = new Set(['cached', 'reported', 'stale', 'superseded'])
  if (matching.length > 0 && !matching.every(({ outcome }) => terminal.has(outcome))) return current
  durableAtomicWriteJson(ampOrbCICoordinationPaths(stateDir).state, {
    schemaVersion: STATE_SCHEMA,
    generation: current.generation,
    mode: 'selected',
    ownerScopeDigest: current.ownerScopeDigest,
    selected: current.selected,
    wakePendingGeneration: null,
  })
  return readAmpOrbCICoordination(stateDir)
}
