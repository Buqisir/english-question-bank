#!/usr/bin/env node

import assert from 'node:assert/strict'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  ampOrbCIRunId,
  drainAmpOrbCIQueue,
  enqueueAmpOrbCIJob,
  planAmpOrbCIQueue,
  runAmpOrbCIJob,
} from './lib/ampOrbCI.mjs'
import {
  acknowledgeAmpOrbCICoordinationWake,
  activateAmpOrbCICoordination,
  ampOrbCICoordinationPaths,
  ampOrbCIPullRequestEligibility,
  pauseAmpOrbCICoordination,
  readAmpOrbCICoordination,
  selectAmpOrbCIPullRequest,
} from './lib/ampOrbCICoordination.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const controllerSource = readFileSync(path.join(root, 'scripts/amp-orb-ci.mjs'), 'utf8')
const roots = []
const tempState = () => {
  const stateDir = mkdtempSync(path.join(tmpdir(), 'eqb-ci-coordination-'))
  roots.push(stateDir)
  return stateDir
}
const head = 'a'.repeat(40)
const base = 'b'.repeat(40)
const tested = 'c'.repeat(40)
const otherHead = 'd'.repeat(40)
const delivery = (digit) => `${digit.repeat(8)}-${digit.repeat(4)}-4${digit.repeat(3)}-8${digit.repeat(3)}-${digit.repeat(12)}`
const unresolved = ({ number = 458, sha = head, baseSha = base, deliveryId = delivery('1') } = {}) => ({
  kind: 'resolve',
  event: 'pull_request',
  pullRequestNumber: number,
  sha,
  baseSha,
  deliveryId,
})
const resolved = (input) => ({ ...input, kind: 'run', testedSha: tested })
const push = ({ sha = 'e'.repeat(40), baseSha = 'f'.repeat(40), deliveryId = delivery('9') } = {}) => ({
  event: 'push',
  sha,
  testedSha: sha,
  baseSha,
  deliveryId,
  pullRequestNumber: null,
  forced: false,
})

async function drain(stateDir, { resolveJob = async input => resolved(input), runJob, dispositions = [] } = {}) {
  return drainAmpOrbCIQueue({
    stateDir,
    resolveJob,
    runJob: runJob || (async () => ({ outcome: 'reported', receipt: { state: 'reported' } })),
    onDisposition(disposition) { dispositions.push(disposition) },
  })
}

function activate(stateDir, pullRequestNumbers = [458, 459]) {
  return activateAmpOrbCICoordination({ stateDir, pullRequestNumbers })
}

function select(stateDir, { generation = 1, number = 458, sha = head, baseSha = base } = {}) {
  return selectAmpOrbCIPullRequest({
    stateDir,
    expectedGeneration: generation,
    pullRequestNumber: number,
    sha,
    baseSha,
  })
}

async function drainAndAcknowledge(stateDir, options = {}) {
  const before = readAmpOrbCICoordination(stateDir)
  const dispositions = []
  const results = await drain(stateDir, { ...options, dispositions })
  if (before.active && before.mode === 'selected' && before.wakePendingGeneration !== null) {
    acknowledgeAmpOrbCICoordinationWake({
      stateDir,
      generation: before.wakePendingGeneration,
      dispositions,
    })
  }
  return { results, dispositions }
}

async function syntheticExecution() {
  const fast = {
    kind: 'verified', lane: 'fast', e2eFailureCount: 0, commandCount: 6,
    verifyExitCode: 0, verificationCounts: { pass: 1, skip: 0, fail: 0 },
    clean: true, wallSeconds: 1, exitCode: 0,
  }
  const full = {
    kind: 'verified', lane: 'full', verifyExitCode: 0,
    verificationCounts: { pass: 1, skip: 0, fail: 0 },
    clean: true, wallSeconds: 2, exitCode: 0,
  }
  return {
    exitCode: 0,
    result: {
      kind: 'verified', fast, full, verifyExitCode: 0, e2eFailureCount: 0,
      clean: true, wallSeconds: 2, exitCode: 0,
    },
  }
}

try {
  // Installation compatibility: staged state is inert until the trusted marker exists.
  const legacy = tempState()
  const legacyPaths = ampOrbCICoordinationPaths(legacy)
  mkdirSync(legacyPaths.directory, { recursive: true })
  writeFileSync(legacyPaths.state, '{malformed staged state\n')
  enqueueAmpOrbCIJob(unresolved(), { stateDir: legacy })
  let legacyRuns = 0
  assert.deepEqual(await drain(legacy, { runJob: async () => {
    legacyRuns += 1
    return { outcome: 'reported', receipt: { state: 'reported' } }
  } }), [{ deliveryId: delivery('1'), outcome: 'reported' }])
  assert.equal(legacyRuns, 1, 'marker absence preserves exact legacy PR execution')
  assert.deepEqual(readAmpOrbCICoordination(legacy), { active: false, mode: 'legacy' })

  const interruptedActivation = tempState()
  assert.throws(() => activateAmpOrbCICoordination({
    stateDir: interruptedActivation,
    pullRequestNumbers: [458],
    afterStateWrite() { throw new Error('synthetic activation crash') },
  }), /activation crash/u)
  assert.equal(existsSync(ampOrbCICoordinationPaths(interruptedActivation).activation), false)
  assert.deepEqual(readAmpOrbCICoordination(interruptedActivation), { active: false, mode: 'legacy' })

  const invalidActivation = tempState()
  mkdirSync(ampOrbCICoordinationPaths(invalidActivation).directory, { recursive: true })
  writeFileSync(ampOrbCICoordinationPaths(invalidActivation).activation, 'invalid\n')
  assert.deepEqual(readAmpOrbCICoordination(invalidActivation), {
    active: true, mode: 'paused', reason: 'activation-marker-invalid',
  })
  enqueueAmpOrbCIJob(unresolved(), { stateDir: invalidActivation })
  enqueueAmpOrbCIJob(push({ sha: '7'.repeat(40), deliveryId: delivery('7') }), { stateDir: invalidActivation })
  enqueueAmpOrbCIJob(push({ sha: '8'.repeat(40), deliveryId: delivery('8') }), { stateDir: invalidActivation })
  const invalidMainRuns = []
  assert.deepEqual(await drain(invalidActivation, { runJob: async input => {
    if (input.event === 'push') invalidMainRuns.push(input.sha)
    return { outcome: 'reported', receipt: { state: 'reported' } }
  } }), [
    { deliveryId: delivery('1'), outcome: 'waiting', reason: 'activation-marker-invalid' },
    { deliveryId: delivery('7'), outcome: 'reported' },
    { deliveryId: delivery('8'), outcome: 'reported' },
  ])
  assert.deepEqual(invalidMainRuns, ['7'.repeat(40), '8'.repeat(40)],
    'invalid PR state cannot block, filter, or reorder main deliveries')

  for (const missingFile of ['ownerScope', 'state']) {
    const malformed = tempState()
    activate(malformed, [458])
    rmSync(ampOrbCICoordinationPaths(malformed)[missingFile])
    assert.deepEqual(readAmpOrbCICoordination(malformed), {
      active: true, mode: 'paused', reason: 'coordination-state-invalid',
    })
  }

  // Active pause is reconstructable from immutable queue bytes without rewriting them.
  const paused = tempState()
  const pausedState = activate(paused)
  assert.equal(pausedState.mode, 'paused')
  const queued = enqueueAmpOrbCIJob(unresolved(), { stateDir: paused })
  const beforeBytes = readFileSync(queued.queuePath)
  const beforeMtime = statSync(queued.queuePath).mtimeMs
  let pausedResolverCalls = 0
  let pausedRunCalls = 0
  assert.deepEqual(await drain(paused, {
    async resolveJob() { pausedResolverCalls += 1 },
    async runJob() { pausedRunCalls += 1 },
  }), [{ deliveryId: delivery('1'), outcome: 'waiting', reason: 'paused' }])
  assert.equal(pausedResolverCalls, 0)
  assert.equal(pausedRunCalls, 0)
  assert.deepEqual(readFileSync(queued.queuePath), beforeBytes)
  assert.equal(statSync(queued.queuePath).mtimeMs, beforeMtime)
  assert.deepEqual(planAmpOrbCIQueue({ stateDir: paused }), [{
    deliveryId: delivery('1'), event: 'pull_request', pullRequestNumber: 458,
    sha: head, baseSha: base, outcome: 'waiting', reason: 'paused',
  }])

  // Queue-before-selection: selection and drain share one controller invocation.
  const queueFirst = tempState()
  activate(queueFirst)
  enqueueAmpOrbCIJob(unresolved(), { stateDir: queueFirst })
  const selected = select(queueFirst)
  assert.equal(selected.wakePendingGeneration, 2)
  let selectedRuns = 0
  const selectedDrain = await drainAndAcknowledge(queueFirst, { runJob: async () => {
    selectedRuns += 1
    return { outcome: 'reported', receipt: { state: 'reported' } }
  } })
  assert.equal(selectedRuns, 1)
  assert.deepEqual(selectedDrain.results, [{ deliveryId: delivery('1'), outcome: 'reported' }])
  assert.equal(readAmpOrbCICoordination(queueFirst).wakePendingGeneration, null)

  // Selection-before-queue: no synthetic event; later natural enqueue is still eligible.
  const selectionFirst = tempState()
  activate(selectionFirst)
  select(selectionFirst)
  assert.deepEqual((await drainAndAcknowledge(selectionFirst)).results, [])
  assert.equal(readAmpOrbCICoordination(selectionFirst).wakePendingGeneration, null)
  enqueueAmpOrbCIJob(unresolved(), { stateDir: selectionFirst })
  let naturalRuns = 0
  await drainAndAcknowledge(selectionFirst, { runJob: async () => {
    naturalRuns += 1
    return { outcome: 'reported', receipt: { state: 'reported' } }
  } })
  assert.equal(naturalRuns, 1)

  // Crash after selection commit is visible and an idempotent resume drains it.
  const crashedSelection = tempState()
  activate(crashedSelection)
  enqueueAmpOrbCIJob(unresolved(), { stateDir: crashedSelection })
  select(crashedSelection)
  assert.equal(readAmpOrbCICoordination(crashedSelection).wakePendingGeneration, 2)
  let resumedRuns = 0
  await drainAndAcknowledge(crashedSelection, { runJob: async () => {
    resumedRuns += 1
    return { outcome: 'reported', receipt: { state: 'reported' } }
  } })
  assert.equal(resumedRuns, 1)
  assert.equal(readAmpOrbCICoordination(crashedSelection).wakePendingGeneration, null)
  assert.deepEqual((await drainAndAcknowledge(crashedSelection)).results, [], 'resume drains even after acknowledgement')

  // A selected defer retains only its own generation's wake; unrelated main work cannot clear it.
  const deferredSelection = tempState()
  activate(deferredSelection)
  select(deferredSelection)
  enqueueAmpOrbCIJob(unresolved({ deliveryId: delivery('2') }), { stateDir: deferredSelection })
  enqueueAmpOrbCIJob(push({ deliveryId: delivery('3') }), { stateDir: deferredSelection })
  let mainRuns = 0
  const deferred = await drainAndAcknowledge(deferredSelection, {
    async resolveJob() { throw new Error('synthetic merge-ref lag') },
    async runJob(input) {
      if (input.event === 'push') mainRuns += 1
      return { outcome: 'reported', receipt: { state: 'reported' } }
    },
  })
  assert.deepEqual(deferred.results, [
    { deliveryId: delivery('2'), outcome: 'deferred' },
    { deliveryId: delivery('3'), outcome: 'reported' },
  ])
  assert.equal(mainRuns, 1, 'main queue behavior is unchanged while coordination is active')
  assert.equal(readAmpOrbCICoordination(deferredSelection).wakePendingGeneration, 2)

  // Owner scope, exact identity and generation bind selection.
  assert.throws(() => selectAmpOrbCIPullRequest({
    stateDir: deferredSelection,
    expectedGeneration: 2,
    pullRequestNumber: 999,
    sha: head,
    baseSha: base,
  }), /outside the Owner scope/u)
  assert.throws(() => selectAmpOrbCIPullRequest({
    stateDir: deferredSelection,
    expectedGeneration: 1,
    pullRequestNumber: 458,
    sha: head,
    baseSha: base,
  }), /generation/u)
  assert.equal(ampOrbCIPullRequestEligibility(unresolved({ sha: otherHead }), {
    stateDir: deferredSelection,
  }).reason, 'not-selected')
  assert.equal(ampOrbCIPullRequestEligibility(unresolved({ baseSha: '6'.repeat(40) }), {
    stateDir: deferredSelection,
  }).reason, 'not-selected')

  const staleAcknowledgement = tempState()
  activate(staleAcknowledgement, [458, 459])
  select(staleAcknowledgement)
  acknowledgeAmpOrbCICoordinationWake({ stateDir: staleAcknowledgement, generation: 2, dispositions: [] })
  selectAmpOrbCIPullRequest({
    stateDir: staleAcknowledgement,
    expectedGeneration: 2,
    pullRequestNumber: 459,
    sha: otherHead,
    baseSha: base,
  })
  acknowledgeAmpOrbCICoordinationWake({
    stateDir: staleAcknowledgement,
    generation: 2,
    dispositions: [{ input: unresolved(), outcome: 'reported' }],
  })
  assert.equal(readAmpOrbCICoordination(staleAcknowledgement).wakePendingGeneration, 3,
    'an old drain cannot acknowledge a newer selection')

  const corruptedSelection = tempState()
  activate(corruptedSelection, [458])
  select(corruptedSelection)
  const corruptedPaths = ampOrbCICoordinationPaths(corruptedSelection)
  const corruptedState = JSON.parse(readFileSync(corruptedPaths.state, 'utf8'))
  corruptedState.selected.pullRequestNumber = 999
  writeFileSync(corruptedPaths.state, `${JSON.stringify(corruptedState)}\n`)
  assert.deepEqual(readAmpOrbCICoordination(corruptedSelection), {
    active: true, mode: 'paused', reason: 'coordination-state-invalid',
  })
  const corruptedQueue = enqueueAmpOrbCIJob(unresolved({ number: 999 }), { stateDir: corruptedSelection })
  const corruptedBytes = readFileSync(corruptedQueue.queuePath)
  let corruptedResolverCalls = 0
  assert.deepEqual(await drain(corruptedSelection, {
    async resolveJob() { corruptedResolverCalls += 1 },
  }), [{ deliveryId: delivery('1'), outcome: 'waiting', reason: 'coordination-state-invalid' }])
  assert.equal(corruptedResolverCalls, 0)
  assert.deepEqual(readFileSync(corruptedQueue.queuePath), corruptedBytes)

  const thrownDrain = tempState()
  activate(thrownDrain, [458])
  select(thrownDrain)
  enqueueAmpOrbCIJob(unresolved(), { stateDir: thrownDrain })
  await assert.rejects(drainAndAcknowledge(thrownDrain, {
    async runJob() { return { outcome: 'invalid', receipt: { state: 'running' } } },
  }), /did not reach a terminal receipt/u)
  assert.equal(readAmpOrbCICoordination(thrownDrain).wakePendingGeneration, 2,
    'a thrown drain retains the durable wake for explicit resume')
  await drainAndAcknowledge(thrownDrain)
  assert.equal(readAmpOrbCICoordination(thrownDrain).wakePendingGeneration, null)

  const activeRollback = tempState()
  activate(activeRollback, [458])
  select(activeRollback)
  const rollbackQueue = enqueueAmpOrbCIJob(unresolved(), { stateDir: activeRollback })
  const rollbackBytes = readFileSync(rollbackQueue.queuePath)
  const rollbackState = pauseAmpOrbCICoordination({ stateDir: activeRollback, expectedGeneration: 2 })
  assert.equal(rollbackState.mode, 'paused')
  assert.equal(rollbackState.generation, 3)
  assert.equal(rollbackState.wakePendingGeneration, null)
  let rollbackRuns = 0
  assert.deepEqual(await drain(activeRollback, { runJob: async () => {
    rollbackRuns += 1
  } }), [{ deliveryId: delivery('1'), outcome: 'waiting', reason: 'paused' }])
  assert.equal(rollbackRuns, 0)
  assert.deepEqual(readFileSync(rollbackQueue.queuePath), rollbackBytes,
    'explicit active rollback cancels selection without releasing or rewriting its queue entry')

  // Defense in depth blocks direct authoritative PR execution before any receipt or Check mutation.
  const direct = tempState()
  activate(direct, [458])
  const jobInput = resolved(unresolved())
  let checkStarts = 0
  await assert.rejects(runAmpOrbCIJob(jobInput, {
    stateDir: direct,
    publishCheck: {
      async start() { checkStarts += 1 },
      async complete() { assert.fail('ineligible PR cannot complete a Check') },
    },
    assertFresh: async () => true,
    execute: syntheticExecution,
  }), /not selected/u)
  assert.equal(checkStarts, 0)
  assert.equal(existsSync(path.join(direct, 'runs')), false, 'eligibility fails before receipt creation')

  select(direct)
  const completions = []
  const reported = await runAmpOrbCIJob(jobInput, {
    stateDir: direct,
    publishCheck: {
      async start() { return 458 },
      async complete(value) { completions.push(value) },
    },
    assertFresh: async () => true,
    execute: syntheticExecution,
  })
  assert.equal(reported.outcome, 'reported')
  assert.equal(completions.length, 1)
  acknowledgeAmpOrbCICoordinationWake({ stateDir: direct, generation: 2, dispositions: [] })
  pauseAmpOrbCICoordination({ stateDir: direct, expectedGeneration: 2 })
  await assert.rejects(runAmpOrbCIJob(jobInput, {
    stateDir: direct,
    publishCheck: {
      async start() { assert.fail('cached receipt cannot bypass a paused gate') },
      async complete() { assert.fail('cached receipt cannot bypass a paused gate') },
    },
    assertFresh: async () => true,
    execute: syntheticExecution,
  }), /not selected/u)
  assert.equal(existsSync(path.join(direct, 'runs', `${ampOrbCIRunId(jobInput)}.json`)), true)

  let forcedStarts = 0
  const forced = await runAmpOrbCIJob({ ...jobInput, forced: true }, {
    stateDir: tempState(),
    publishCheck: {
      async start() { forcedStarts += 1 },
      async complete() { assert.fail('forced diagnostics remain writerless') },
    },
    assertFresh: async () => true,
    execute: syntheticExecution,
  })
  assert.equal(forced.outcome, 'reported')
  assert.equal(forcedStarts, 0)
  assert.equal(forced.receipt.checkRunId, undefined)

  // CLI keeps all mutating/waking commands on runner.lock and never spawns a second drainer.
  assert.match(controllerSource, /const drainCommands = new Set\(\['drain', 'coord-select', 'coord-resume'\]\)/u)
  assert.match(controllerSource, /await drainQueue\(\)/u)
  assert.doesNotMatch(controllerSource, /launchGitHubCIDrain/u)
  for (const stateDir of [
    paused, queueFirst, selectionFirst, crashedSelection, deferredSelection,
    staleAcknowledgement, corruptedSelection, thrownDrain, activeRollback, direct,
  ]) {
    const paths = ampOrbCICoordinationPaths(stateDir)
    for (const file of [paths.activation, paths.ownerScope, paths.state]) {
      assert.equal(statSync(file).mode & 0o077, 0, `${file} is private`)
    }
  }

  console.log('PASS Amp Orb CI serialized eligibility, activation compatibility, and durable wake contract')
} finally {
  for (const stateDir of roots) rmSync(stateDir, { recursive: true, force: true })
}
