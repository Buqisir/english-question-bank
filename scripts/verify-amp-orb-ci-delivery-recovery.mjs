#!/usr/bin/env node
// verify-resource: no-browser-render

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  AmpOrbCIResolutionBlockedError,
  drainAmpOrbCIQueue,
  enqueueAmpOrbCIJob,
  recordAmpOrbCIDrainStatus,
  resolveAmpOrbCIPullRequest,
} from './lib/ampOrbCI.mjs'
import {
  ampOrbCIDeliveryRecoveryLockInvocation,
  createGitHubRepositoryWebhookDeliveryClient,
  recordAmpOrbCIDeliveryRecoveryFailure,
  recoverAmpOrbCIDeliveries,
} from './lib/ampOrbCIDeliveryRecovery.mjs'

const hour = 60 * 60 * 1_000
const started = Date.parse('2026-09-12T20:00:00.000Z')
const base = 'b'.repeat(40)
const main = 'c'.repeat(40)
const head = 'a'.repeat(40)
const tested = 'd'.repeat(40)
const repository = 'Buqisir/english-question-bank'
const guid = (digit) => `${digit.repeat(8)}-${digit.repeat(4)}-4${digit.repeat(3)}-8${digit.repeat(3)}-${digit.repeat(12)}`
const iso = (offset = 0) => new Date(started + offset).toISOString()
const summary = ({ id, deliveryGuid, status = 429, redelivery = false, offset = -hour, event = 'pull_request', action = 'opened' }) => ({
  id,
  guid: deliveryGuid,
  delivered_at: iso(offset),
  redelivery,
  status: status >= 200 && status <= 399 ? 'OK' : 'Failed to connect',
  status_code: status,
  event,
  action,
})
const detailed = (delivery, overrides = {}) => ({
  ...delivery,
  request: {
    payload: delivery.event === 'push'
      ? { repository: { full_name: repository }, ref: 'refs/heads/main', deleted: false, before: base, after: head }
      : {
          action: delivery.action,
          number: 445,
          repository: { full_name: repository },
          pull_request: {
            head: { sha: head, repo: { full_name: repository } },
            base: { sha: base, ref: 'main', repo: { full_name: repository } },
          },
        },
  },
  response: { headers: delivery.status_code === 429 ? { 'retry-after': '60' } : {} },
  ...overrides,
})
const unresolved = (deliveryId, sha = head, baseSha = base) => ({
  kind: 'resolve', event: 'pull_request', deliveryId, sha, baseSha, pullRequestNumber: 445,
})
const terminalRun = { outcome: 'reported', receipt: { state: 'reported' } }

const root = mkdtempSync(path.join(tmpdir(), 'eqb-ci-delivery-recovery-test-'))
try {
  // Durable ingress acknowledgment survives queue removal and is identity-bound.
  const acceptedRoot = path.join(root, 'accepted')
  const acceptedId = guid('1')
  const queued = enqueueAmpOrbCIJob(unresolved(acceptedId), { stateDir: acceptedRoot })
  assert.equal(JSON.parse(readFileSync(path.join(acceptedRoot, 'accepted-deliveries', `${acceptedId}.json`))).deliveryId, acceptedId)
  assert.equal(enqueueAmpOrbCIJob(unresolved(acceptedId), { stateDir: acceptedRoot }).outcome, 'duplicate')
  writeFileSync(queued.queuePath, JSON.stringify({ schemaVersion: 'amp-orb-ci-queue-v1', input: unresolved(acceptedId, main) }))
  assert.throws(() => enqueueAmpOrbCIJob(unresolved(acceptedId), { stateDir: acceptedRoot }), /identity mismatch/u)
  rmSync(queued.queuePath)
  assert.throws(() => enqueueAmpOrbCIJob(unresolved(acceptedId, main), { stateDir: acceptedRoot }), /accepted delivery identity mismatch/u)
  assert.equal(existsSync(path.join(acceptedRoot, 'queue', `${acceptedId}.json`)), false,
    'an accepted GUID mismatch cannot publish executable queue work')

  // Resolution blockers are durable, contain no raw error, back off, exhaust,
  // and a newer identity bypasses an action-required old item for supersession.
  const blockedRoot = path.join(root, 'blocked')
  const blockedId = guid('2')
  enqueueAmpOrbCIJob(unresolved(blockedId), { stateDir: blockedRoot })
  let resolveCalls = 0
  const blockedOnce = await drainAmpOrbCIQueue({
    stateDir: blockedRoot,
    now: () => started,
    resolveJob: async () => { resolveCalls += 1; throw new Error('sensitive upstream detail') },
    runJob: async () => terminalRun,
  })
  assert.equal(blockedOnce[0].outcome, 'blocked')
  assert.equal(blockedOnce[0].blocker.code, 'pull-request-resolution-unavailable')
  assert(!JSON.stringify(blockedOnce).includes('sensitive'))
  const blockedPath = path.join(blockedRoot, 'queue', `${blockedId}.json`)
  assert.equal(JSON.parse(readFileSync(blockedPath)).blocked.nextAttemptAt, iso(60_000))
  await drainAmpOrbCIQueue({ stateDir: blockedRoot, now: () => started + 59_999,
    resolveJob: async () => { resolveCalls += 1 }, runJob: async () => terminalRun })
  assert.equal(resolveCalls, 1, 'retry backoff must not call the resolver')
  for (const offset of [60_000, 6 * 60_000, 21 * 60_000]) {
    await drainAmpOrbCIQueue({ stateDir: blockedRoot, now: () => started + offset,
      resolveJob: async () => { resolveCalls += 1; throw new Error('unavailable') }, runJob: async () => terminalRun })
  }
  assert.equal(JSON.parse(readFileSync(blockedPath)).blocked.disposition, 'action-required')
  assert.equal(resolveCalls, 4)

  const alternatingRoot = path.join(root, 'alternating-blockers')
  enqueueAmpOrbCIJob(unresolved(guid('a')), { stateDir: alternatingRoot })
  let alternatingCalls = 0
  for (const [offset, code] of [[0, null], [60_000, 'merge-ref-not-ready'], [6 * 60_000, null], [21 * 60_000, 'merge-ref-not-ready']]) {
    await drainAmpOrbCIQueue({ stateDir: alternatingRoot, now: () => started + offset,
      resolveJob: async () => {
        alternatingCalls += 1
        if (code) throw new AmpOrbCIResolutionBlockedError(code)
        throw new Error('generic resolver outage')
      }, runJob: async () => terminalRun })
  }
  assert.equal(alternatingCalls, 4)
  await drainAmpOrbCIQueue({ stateDir: alternatingRoot, now: () => started + 2 * hour,
    resolveJob: async () => { alternatingCalls += 1 }, runJob: async () => terminalRun })
  assert.equal(alternatingCalls, 4, 'changing blocker codes cannot reset the queue retry budget')

  const pushRoot = path.join(root, 'push-blocked')
  const pushId = guid('c')
  enqueueAmpOrbCIJob({
    kind: 'run', event: 'push', action: 'main', deliveryId: pushId,
    sha: head, testedSha: head, baseSha: base, forced: false,
  }, { stateDir: pushRoot })
  let pushRuns = 0
  await drainAmpOrbCIQueue({ stateDir: pushRoot, now: () => started,
    runJob: async () => { pushRuns += 1; throw new Error('push API unavailable') } })
  await drainAmpOrbCIQueue({ stateDir: pushRoot, now: () => started + 59_999,
    runJob: async () => { pushRuns += 1; return terminalRun } })
  assert.equal(pushRuns, 1, 'push jobs honor the same durable retry backoff')

  const behindRoot = path.join(root, 'behind')
  const oldId = guid('f')
  enqueueAmpOrbCIJob(unresolved(oldId), { stateDir: behindRoot })
  await drainAmpOrbCIQueue({ stateDir: behindRoot, now: () => started,
    resolveJob: async () => { throw new AmpOrbCIResolutionBlockedError('pull-request-update-required', { actionRequired: true }) },
    runJob: async () => terminalRun })
  const behind = JSON.parse(readFileSync(path.join(behindRoot, 'queue', `${oldId}.json`))).blocked
  assert.deepEqual({ code: behind.code, disposition: behind.disposition, action: behind.action }, {
    code: 'pull-request-update-required', disposition: 'action-required', action: 'update-pull-request-branch',
  })
  const newId = guid('1')
  enqueueAmpOrbCIJob(unresolved(newId, main, main), { stateDir: behindRoot })
  let oldRechecked = false
  const replaced = await drainAmpOrbCIQueue({ stateDir: behindRoot, now: () => started + hour,
    resolveJob: async (input) => {
      if (input.deliveryId === oldId) { oldRechecked = true; return null }
      return { ...input, kind: 'run', testedSha: tested }
    },
    runJob: async () => ({ outcome: 'superseded', receipt: { state: 'superseded', runId: 'replacement' } }),
  })
  assert(oldRechecked)
  assert(replaced.some((result) => result.outcome === 'stale'))

  const terminalReplacementRoot = path.join(root, 'terminal-replacement')
  const terminalOld = guid('d')
  const terminalNew = guid('e')
  const terminalOldPath = enqueueAmpOrbCIJob(unresolved(terminalOld), { stateDir: terminalReplacementRoot }).queuePath
  await drainAmpOrbCIQueue({ stateDir: terminalReplacementRoot, now: () => started,
    resolveJob: async () => { throw new AmpOrbCIResolutionBlockedError('pull-request-update-required', { actionRequired: true }) },
    runJob: async () => terminalRun })
  const terminalNewPath = enqueueAmpOrbCIJob(unresolved(terminalNew, main), { stateDir: terminalReplacementRoot }).queuePath
  writeFileSync(terminalNewPath, JSON.stringify({ schemaVersion: 'amp-orb-ci-queue-v1',
    input: unresolved(terminalNew, main), terminal: { kind: 'superseded', at: iso() } }))
  let terminalOldCalls = 0
  const terminalIgnored = await drainAmpOrbCIQueue({ stateDir: terminalReplacementRoot, now: () => started + hour,
    resolveJob: async () => { terminalOldCalls += 1; return null }, runJob: async () => terminalRun })
  assert.equal(terminalOldCalls, 0, 'retained superseded evidence cannot bypass an action blocker')
  assert(terminalIgnored.some((result) => result.deliveryId === terminalOld && result.outcome === 'blocked'))
  assert.equal(existsSync(terminalOldPath), true)

  const mutualRoot = path.join(root, 'mutual-action-blockers')
  enqueueAmpOrbCIJob(unresolved(guid('6')), { stateDir: mutualRoot })
  enqueueAmpOrbCIJob(unresolved(guid('7'), main), { stateDir: mutualRoot })
  let mutualCalls = 0
  for (const offset of [0, 60_000, 6 * 60_000, 21 * 60_000]) {
    await drainAmpOrbCIQueue({ stateDir: mutualRoot, now: () => started + offset,
      resolveJob: async () => { mutualCalls += 1; throw new Error('shared API outage') },
      runJob: async () => terminalRun })
  }
  assert.equal(mutualCalls, 8)
  await drainAmpOrbCIQueue({ stateDir: mutualRoot, now: () => started + 2 * hour,
    resolveJob: async () => { mutualCalls += 1; throw new Error('must stay stopped') },
    runJob: async () => terminalRun })
  assert.equal(mutualCalls, 8, 'action-required identities cannot mutually unlock unbounded retries')
  const drainStatus = recordAmpOrbCIDrainStatus({ stateDir: behindRoot, results: blockedOnce, now: () => started })
  assert.deepEqual(drainStatus.blockers, { 'pull-request-resolution-unavailable': 1 })
  const controllerStatus = recordAmpOrbCIDrainStatus({ stateDir: behindRoot, state: 'controller-error',
    code: 'controller-initialization-unavailable', now: () => started })
  assert.equal(controllerStatus.code, 'controller-initialization-unavailable')
  assert.throws(() => recordAmpOrbCIDrainStatus({ stateDir: behindRoot, state: 'controller-error', now: () => started }),
    /Invalid Amp Orb CI drain status/u)

  // Parent mismatch requires separate live-main + ancestry evidence. A lagging
  // merge ref or unreadable evidence remains retryable/unknown.
  const resolverInput = unresolved(guid('5'))
  async function parentMismatch({ proveBehind, ancestryError = false }) {
    return resolveAmpOrbCIPullRequest(resolverInput, {
      repositoryRoot: '/trusted', retryDelaysMs: [0],
      getPullRequest: async () => ({ state: 'open', head: { sha: head, repo: { full_name: repository } },
        base: { sha: base, ref: 'main', repo: { full_name: repository } } }),
      trustedGitImpl(_root, args) {
        if (args[0] === 'fetch' || args[0] === 'update-ref') return ''
        if (args[1] === '--is-shallow-repository') return 'false'
        if (args[0] === 'rev-list') return `${tested} ${main} ${head}`
        if (args[0] === 'rev-parse' && args[1].endsWith('-main^{commit}')) {
          if (!proveBehind) throw new Error('main observation unavailable')
          return main
        }
        if (args[0] === 'rev-parse') return tested
        if (args[0] === 'merge-base' && args[2] === main && args[3] === head) {
          if (ancestryError) throw Object.assign(new Error('git unavailable'), { status: 128 })
          return false
        }
        if (args[0] === 'merge-base') return ''
        assert.fail(`unexpected resolver command ${args.join(' ')}`)
      },
    })
  }
  await assert.rejects(parentMismatch({ proveBehind: true }), (error) =>
    error.code === 'pull-request-update-required' && error.actionRequired)
  await assert.rejects(parentMismatch({ proveBehind: false }), (error) =>
    error.code === 'merge-ref-not-ready' && !error.actionRequired)
  await assert.rejects(parentMismatch({ proveBehind: true, ancestryError: true }), (error) =>
    error.code === 'merge-ref-not-ready' && !error.actionRequired)

  const remote = path.join(root, 'resolver-remote.git')
  const source = path.join(root, 'resolver-source')
  const checkout = path.join(root, 'resolver-checkout')
  const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8',
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
    stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  execFileSync('git', ['init', '--bare', remote], { stdio: 'ignore' })
  execFileSync('git', ['init', '--initial-branch=main', source], { stdio: 'ignore' })
  git(source, 'config', 'user.name', 'CI Recovery Test')
  git(source, 'config', 'user.email', 'ci-recovery@example.invalid')
  writeFileSync(path.join(source, 'fixture.txt'), 'base\n')
  git(source, 'add', 'fixture.txt')
  git(source, 'commit', '-m', 'base')
  const realBase = git(source, 'rev-parse', 'HEAD')
  git(source, 'checkout', '-b', 'feature')
  writeFileSync(path.join(source, 'fixture.txt'), 'head\n')
  git(source, 'commit', '-am', 'head')
  const realHead = git(source, 'rev-parse', 'HEAD')
  git(source, 'checkout', 'main')
  writeFileSync(path.join(source, 'main.txt'), 'main\n')
  git(source, 'add', 'main.txt')
  git(source, 'commit', '-m', 'main advances')
  const realMain = git(source, 'rev-parse', 'HEAD')
  const realMerge = git(source, 'commit-tree', `${realHead}^{tree}`, '-p', realMain, '-p', realHead, '-m', 'synthetic merge')
  git(source, 'remote', 'add', 'origin', remote)
  git(source, 'push', 'origin', `main:refs/heads/main`, `${realMerge}:refs/pull/445/merge`)
  execFileSync('git', ['clone', remote, checkout], { stdio: 'ignore' })
  await assert.rejects(resolveAmpOrbCIPullRequest(unresolved(guid('4'), realHead, realBase), {
    repositoryRoot: checkout,
    retryDelaysMs: [0],
    getPullRequest: async () => ({ state: 'open', head: { sha: realHead, repo: { full_name: repository } },
      base: { sha: realBase, ref: 'main', repo: { full_name: repository } } }),
    trustedPolicyImpl: () => assert.fail('behind merge must not reach policy'),
  }), (error) => error.code === 'pull-request-update-required' && error.actionRequired,
  'real Git refs prove the live-main sibling ref and three-way ancestry result')

  async function recoveryCase(name, listed, { at = started, get = (id) => detailed(listed.find((row) => row.id === id)),
    onRedeliver = async () => ({ status: 202 }), setup } = {}) {
    const stateDir = path.join(root, name)
    setup?.(stateDir)
    const calls = []
    const result = await recoverAmpOrbCIDeliveries({ stateDir, now: () => at,
      listDeliveries: async ({ maxPages }) => { assert.equal(maxPages, 3); return { deliveries: listed, complete: true } },
      getDelivery: async (id) => get(id, stateDir),
      redeliver: async (id) => { calls.push(id); return onRedeliver(id) },
    })
    return { stateDir, calls, ...result }
  }

  // Initial 429 creates intent before one request; HTTP202 remains UNKNOWN.
  const firstGuid = guid('6')
  const first = summary({ id: 61, deliveryGuid: firstGuid, offset: -hour })
  const initial = await recoveryCase('initial', [first])
  assert.deepEqual(initial.calls, [61])
  assert.equal(initial.results[0].outcome, 'redelivery-unknown')
  const initialLedger = JSON.parse(readFileSync(path.join(initial.stateDir, 'delivery-recovery', `${firstGuid}.json`)))
  assert.equal(initialLedger.requests[0].state, 'unknown')
  assert(!JSON.stringify(initialLedger).includes('retry-after'))
  const pending = await recoveryCase('initial', [first], { at: started + 9 * 60_000 })
  assert.equal(pending.results[0].outcome, 'pending-observation')
  assert.deepEqual(pending.calls, [])
  const unknown = await recoveryCase('initial', [first], { at: started + 11 * 60_000 })
  assert.equal(unknown.results[0].outcome, 'manual-required')
  assert.deepEqual(unknown.calls, [])

  const expiredGuid = guid('2')
  const expiredOriginal = summary({ id: 62, deliveryGuid: expiredGuid, offset: -hour })
  await recoveryCase('expired-history', [expiredOriginal])
  const expired = await recoveryCase('expired-history', [], { at: started + 11 * 60_000 })
  assert.equal(expired.results[0].outcome, 'manual-required',
    'UNKNOWN ledgers remain observable after bounded delivery history disappears')

  // Only a distinct redelivery attempt after this exact intent can authorize
  // another request. Historical attempts and 202-without-local-ack cannot.
  const retryGuid = guid('7')
  const original = summary({ id: 71, deliveryGuid: retryGuid, offset: -hour })
  const retryFirst = await recoveryCase('retry', [original])
  assert.deepEqual(retryFirst.calls, [71])
  const historical = summary({ id: 72, deliveryGuid: retryGuid, redelivery: true, offset: -2 * hour })
  const noHistoricalRetry = await recoveryCase('retry', [original, historical], { at: started + 60_000 })
  assert.equal(noHistoricalRetry.results[0].outcome, 'pending-observation')
  const failedAttempt = summary({ id: 73, deliveryGuid: retryGuid, redelivery: true, offset: 30_000 })
  const second = await recoveryCase('retry', [failedAttempt, original], { at: started + 2 * 60_000 })
  assert.deepEqual(second.calls, [73])
  const failedAgain = summary({ id: 74, deliveryGuid: retryGuid, redelivery: true, offset: 3 * 60_000 })
  const exhausted = await recoveryCase('retry', [failedAgain, failedAttempt, original], { at: started + 5 * 60_000 })
  assert.equal(exhausted.results[0].outcome, 'manual-required')
  assert.deepEqual(exhausted.calls, [])

  const intentGuid = guid('3')
  const intentOriginal = summary({ id: 75, deliveryGuid: intentGuid, offset: -hour })
  const intentRoot = path.join(root, 'intent-time')
  const clock = [started, started + 5_000]
  await recoverAmpOrbCIDeliveries({ stateDir: intentRoot, now: () => clock.shift() ?? started + 5_000,
    listDeliveries: async () => ({ deliveries: [intentOriginal], complete: true }),
    getDelivery: async () => detailed(intentOriginal),
    redeliver: async () => ({ status: 202 }) })
  const between = summary({ id: 76, deliveryGuid: intentGuid, redelivery: true, offset: 1_000 })
  const intentResult = await recoveryCase('intent-time', [between, intentOriginal], { at: started + 6_000 })
  assert.equal(intentResult.results[0].outcome, 'pending-observation',
    'an attempt after invocation start but before durable intent is not owned evidence')

  const ambiguousGuid = guid('4')
  const ambiguousOriginal = summary({ id: 77, deliveryGuid: ambiguousGuid, offset: -hour })
  await recoveryCase('ambiguous-attempts', [ambiguousOriginal])
  const ambiguousOne = summary({ id: 78, deliveryGuid: ambiguousGuid, redelivery: true, offset: 30_000 })
  const ambiguousTwo = summary({ id: 79, deliveryGuid: ambiguousGuid, redelivery: true, offset: 40_000 })
  const ambiguous = await recoveryCase('ambiguous-attempts', [ambiguousTwo, ambiguousOne, ambiguousOriginal], {
    at: started + 60_000,
  })
  assert.equal(ambiguous.results[0].outcome, 'manual-required')
  assert.deepEqual(ambiguous.calls, [], 'multiple post-intent attempts cannot authorize another POST')

  const contradictionGuid = guid('5')
  const contradictionOriginal = summary({ id: 80, deliveryGuid: contradictionGuid, offset: -hour })
  const contradiction = await recoveryCase('contradictory-detail', [contradictionOriginal], {
    get: () => detailed(contradictionOriginal, { redelivery: true }),
  })
  assert.equal(contradiction.results[0].outcome, 'manual-required')
  assert.deepEqual(contradiction.calls, [])

  const successGuid = guid('8')
  const successOriginal = summary({ id: 81, deliveryGuid: successGuid, offset: -hour })
  await recoveryCase('success-no-ack', [successOriginal])
  const successAttempt = summary({ id: 82, deliveryGuid: successGuid, status: 202, redelivery: true, offset: 30_000 })
  const successPending = await recoveryCase('success-no-ack', [successAttempt, successOriginal], { at: started + 60_000 })
  assert.equal(successPending.results[0].outcome, 'pending-local-acceptance')
  const successManual = await recoveryCase('success-no-ack', [successAttempt, successOriginal], { at: started + 3 * 60_000 })
  assert.equal(successManual.results[0].outcome, 'manual-required')

  // A late queue write between detailed read and POST is accepted; queue/run
  // GUID idempotence remains the final TOCTOU safety net.
  const lateGuid = guid('9')
  const late = summary({ id: 91, deliveryGuid: lateGuid, offset: -hour })
  const lateResult = await recoveryCase('late', [late], {
    get(id, stateDir) {
      enqueueAmpOrbCIJob(unresolved(lateGuid), { stateDir })
      return detailed(late)
    },
  })
  assert.equal(lateResult.results[0].outcome, 'accepted')
  assert.deepEqual(lateResult.calls, [])

  const ownedGuid = guid('a')
  const ownedOriginal = summary({ id: 101, deliveryGuid: ownedGuid, offset: -2 * hour })
  const unowned = summary({ id: 102, deliveryGuid: ownedGuid, redelivery: true, offset: -hour })
  const unownedResult = await recoveryCase('unowned', [unowned, ownedOriginal])
  assert.equal(unownedResult.results[0].outcome, 'manual-required')
  assert.deepEqual(unownedResult.calls, [])

  const recentGuid = guid('d')
  const recent429 = summary({ id: 111, deliveryGuid: recentGuid, offset: -30_000 })
  const retryAfter = await recoveryCase('retry-after', [recent429], {
    get: () => detailed(recent429, { response: { headers: { 'retry-after': '120' } } }),
  })
  assert.equal(retryAfter.results[0].outcome, 'backoff')
  assert.deepEqual(retryAfter.calls, [])

  const globallyBlockedRoot = path.join(root, 'global-backoff')
  recordAmpOrbCIDeliveryRecoveryFailure({ stateDir: globallyBlockedRoot, code: 'rate-limited', now: () => started })
  let blockedListCalls = 0
  const globallyBlocked = await recoverAmpOrbCIDeliveries({
    stateDir: globallyBlockedRoot,
    now: () => started + 60_000,
    listDeliveries: async () => { blockedListCalls += 1; return { deliveries: [], complete: true } },
    getDelivery: async () => assert.fail('global backoff must not read a delivery'),
    redeliver: async () => assert.fail('global backoff must not redeliver'),
  })
  assert.equal(globallyBlocked.summary.state, 'blocked')
  assert.equal(globallyBlocked.results[0].outcome, 'global-backoff')
  assert.equal(blockedListCalls, 0)

  const postFailureGuid = guid('e')
  const postFailure = summary({ id: 121, deliveryGuid: postFailureGuid, offset: -hour })
  const postFailureRoot = path.join(root, 'post-failure')
  await assert.rejects(recoverAmpOrbCIDeliveries({ stateDir: postFailureRoot, now: () => started,
    listDeliveries: async () => ({ deliveries: [postFailure], complete: true }),
    getDelivery: async () => detailed(postFailure),
    redeliver: async () => ({ status: 403 }) }), /redelivery failed \(403\)/u)
  const postFailureStatus = JSON.parse(readFileSync(path.join(postFailureRoot, 'delivery-recovery-status.json')))
  assert.equal(postFailureStatus.code, 'permission-denied')
  assert.equal(JSON.parse(readFileSync(path.join(postFailureRoot, 'delivery-recovery', `${postFailureGuid}.json`))).state,
    'redelivery-unknown', 'POST intent remains UNKNOWN despite a definitive API rejection')

  const malformedGuid = guid('b')
  const malformedDelivery = summary({ id: 131, deliveryGuid: malformedGuid, offset: -hour })
  const malformedRoot = path.join(root, 'malformed-ledger')
  mkdirSync(path.join(malformedRoot, 'delivery-recovery'), { recursive: true })
  writeFileSync(path.join(malformedRoot, 'delivery-recovery', `${malformedGuid}.json`), 'null\n')
  let malformedPosts = 0
  await assert.rejects(recoverAmpOrbCIDeliveries({ stateDir: malformedRoot, now: () => started,
    listDeliveries: async () => ({ deliveries: [malformedDelivery], complete: true }),
    getDelivery: async () => detailed(malformedDelivery),
    redeliver: async () => { malformedPosts += 1; return { status: 202 } } }), /ledger is invalid/u)
  assert.equal(malformedPosts, 0)

  // Fixed endpoint/auth interface, no response payload persistence, lock and
  // permission/rate-limit status remain controlled and secret-free.
  const requests = []
  const client = createGitHubRepositoryWebhookDeliveryClient({ hookId: 672661674,
    getAccessToken: async () => 'not-a-real-token',
    fetchImpl: async (url, options) => {
      requests.push({ url, options })
      return { status: 200, headers: new Headers(), json: async () => [] }
    } })
  assert.deepEqual(await client.listDeliveries({ since: iso(-hour), maxPages: 3 }), { deliveries: [], complete: true })
  assert.match(requests[0].url, /^https:\/\/api\.github\.com\/repos\/Buqisir\/english-question-bank\/hooks\/672661674\/deliveries\?/u)
  assert.equal(requests[0].options.headers.authorization, 'Bearer not-a-real-token')
  const pageRequests = []
  const pagedClient = createGitHubRepositoryWebhookDeliveryClient({ hookId: 672661674,
    getAccessToken: async () => 'not-a-real-token',
    fetchImpl: async (url) => {
      pageRequests.push(url)
      return { status: 200, headers: new Headers(pageRequests.length === 1
        ? { link: '<https://api.github.com/repositories/1/hooks/672661674/deliveries?per_page=100&cursor=next-cursor>; rel="next"' }
        : {}), json: async () =>
        pageRequests.length === 1 ? Array.from({ length: 100 }, (_, index) => ({ delivered_at: iso(-index) })) : [] }
    } })
  await pagedClient.listDeliveries({ since: iso(-hour), maxPages: 3 })
  assert(!/[?&]cursor=/u.test(pageRequests[0]))
  assert.match(pageRequests[1], /[?&]cursor=next-cursor(?:&|$)/u)

  let cappedPages = 0
  const cappedClient = createGitHubRepositoryWebhookDeliveryClient({ hookId: 672661674,
    getAccessToken: async () => 'not-a-real-token',
    fetchImpl: async () => {
      cappedPages += 1
      return { status: 200,
        headers: new Headers({ link: `<https://api.github.com/repositories/1/hooks/672661674/deliveries?cursor=cap-${cappedPages}>; rel="next"` }),
        json: async () => Array.from({ length: 100 }, () => ({ delivered_at: iso() })) }
    } })
  const cappedListing = await cappedClient.listDeliveries({ since: iso(-hour), maxPages: 3 })
  assert.equal(cappedPages, 3)
  assert.equal(cappedListing.complete, false, 'the bounded cursor scan exposes truncated history')

  const truncatedGuid = guid('c')
  const truncatedOriginal = summary({ id: 141, deliveryGuid: truncatedGuid, offset: -hour })
  const truncatedRoot = path.join(root, 'truncated-history')
  let truncatedPosts = 0
  const truncated = await recoverAmpOrbCIDeliveries({ stateDir: truncatedRoot, now: () => started,
    listDeliveries: async () => ({ deliveries: [truncatedOriginal], complete: false }),
    getDelivery: async () => assert.fail('truncated history cannot authorize detail lookup'),
    redeliver: async () => { truncatedPosts += 1; return { status: 202 } } })
  assert.equal(truncated.results[0].outcome, 'manual-required')
  assert.equal(truncatedPosts, 0, 'truncated history cannot prove a unique attempt or authorize POST')
  const lock = ampOrbCIDeliveryRecoveryLockInvocation({ stateDir: path.join(root, 'lock'), scriptPath: '/trusted/recover.mjs' })
  assert.deepEqual(lock.args.slice(0, 4), ['--no-fork', '--nonblock', '--conflict-exit-code', '75'])
  const denied = recordAmpOrbCIDeliveryRecoveryFailure({ stateDir: path.join(root, 'denied'), code: 'permission-denied', now: () => started })
  assert.equal(denied.nextAttemptAt, iso(6 * hour))

  console.log('PASS Amp Orb CI delivery recovery: durable blockers/ack, proven-behind action, bounded GUID redelivery, UNKNOWN/manual/TOCTOU/permission handling')
} finally {
  rmSync(root, { recursive: true, force: true })
}
