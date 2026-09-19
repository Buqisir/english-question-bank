#!/usr/bin/env node

import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  createSourceIntakeDispatcher,
  IMPORT_PROJECT_ID,
  IMPORT_PROJECT_REF,
} from './import-pipeline/source-intake-dispatch.mjs'

const submissionId = 'submission-11111111-1111-4111-8111-111111111111'
const digest = `sha256:${'a'.repeat(64)}`
const controller = 'T-01a057c0-ecc9-745c-aaa7-a51dddb22306'
const candidate = 'T-22222222-2222-4222-8222-222222222222'
const secret = 'orb-reservation-super-secret'
const future = '2026-09-18T01:00:00.000Z'
const metadata = (overrides = {}) => ({ id: candidate, meta: {
  projectID: IMPORT_PROJECT_ID, agentMode: 'low',
  features: [], visibility: 'private', ...overrides,
} })

function fixture(apiImpl, options = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'eqb-dispatch-'))
  const calls = []
  const api = async (...args) => { calls.push(args); return apiImpl(...args) }
  const dispatcher = createSourceIntakeDispatcher({ root, controllerThreadId: controller,
    controllerProjectId: IMPORT_PROJECT_ID, now: () => new Date('2026-09-18T00:00:00.000Z'),
    api, exportThread: options.exportThread || (() => metadata()) })
  return { root, calls, dispatcher }
}

const roots = []
try {
  const happy = fixture(async (action) => action === 'reserve' ? { worker: {
    action: 'create', state: 'reserved', submissionId, submissionDigest: digest,
    reservationToken: secret, reservationExpiresAt: future,
  } } : action === 'bind' ? { worker: {
    state: 'bound', submissionId, submissionDigest: digest, ampThreadId: candidate,
  } } : { worker: { state: 'bound', submissionId, submissionDigest: digest, ampThreadId: candidate,
    reservationExpiresAt: null } })
  roots.push(happy.root)
  assert.equal((await happy.dispatcher.prepare(submissionId, digest, 'event-1')).state, 'reserved')
  assert.equal((await happy.dispatcher.prepare(submissionId, digest, 'event-1')).state, 'reserved')
  assert.equal(happy.calls.filter(([action]) => action === 'reserve').length, 1, 'duplicate prepare never replays reserve')
  const create = await happy.dispatcher.beginCreate(submissionId)
  assert.deepEqual(create.request.arguments, {
    agent_mode: 'low', features: [], executor: 'orb', intent: 'delegation', project: IMPORT_PROJECT_REF,
    prompt: create.request.arguments.prompt,
  })
  assert.match(create.request.arguments.prompt, /Perform no source-intake or source operations/)
  assert.doesNotMatch(JSON.stringify(create), new RegExp(submissionId))
  assert.equal((await happy.dispatcher.beginCreate(submissionId)).state, 'blocked')
  const journalPath = path.join(happy.root, submissionId, 'dispatch.json')
  assert.equal(statSync(path.dirname(journalPath)).mode & 0o777, 0o700)
  assert.equal(statSync(journalPath).mode & 0o777, 0o600)
  assert.match(readFileSync(journalPath, 'utf8'), new RegExp(secret))
  assert.doesNotMatch(JSON.stringify(create), new RegExp(secret))
  assert.equal((await happy.dispatcher.bind(submissionId, candidate)).state, 'bound')
  const ready = await happy.dispatcher.status(submissionId)
  assert.equal(ready.startable, true)
  assert.deepEqual(ready.boundIdentity, { submissionId, submissionDigest: digest, ampThreadId: candidate })
  const assignment = await happy.dispatcher.takeAssignment(submissionId)
  assert.match(assignment.assignment, new RegExp(submissionId))
  assert.equal((await happy.dispatcher.status(submissionId)).startable, false)
  assert.equal((await happy.dispatcher.takeAssignment(submissionId)).state, 'blocked')
  await assert.rejects(happy.dispatcher.prepare(submissionId, `sha256:${'b'.repeat(64)}`, 'changed'), /digest/)

  const concurrent = fixture(async () => ({ worker: { action: 'create', submissionId,
    submissionDigest: digest, reservationToken: secret, reservationExpiresAt: future } }))
  roots.push(concurrent.root)
  await concurrent.dispatcher.prepare(submissionId, digest, 'event-concurrent')
  const beginnings = await Promise.allSettled([
    concurrent.dispatcher.beginCreate(submissionId), concurrent.dispatcher.beginCreate(submissionId),
  ])
  assert.equal(beginnings.filter((result) => result.status === 'fulfilled'
    && result.value.state === 'creating').length, 1, 'concurrent callers receive exactly one create request')

  const lostReserve = fixture(async () => { throw Object.assign(new Error(`leak ${secret}`), { code: 'TIMEOUT' }) })
  roots.push(lostReserve.root)
  await assert.rejects(lostReserve.dispatcher.prepare(submissionId, digest, 'event-lost'), (error) => {
    assert.doesNotMatch(error.message, new RegExp(secret)); return /reconcile read-only/.test(error.message)
  })
  assert.equal((await lostReserve.dispatcher.prepare(submissionId, digest, 'event-lost')).state, 'blocked')
  assert.equal(lostReserve.calls.length, 1)

  const unknownCreate = fixture(async (action) => action === 'reserve' ? { worker: {
    action: 'create', submissionId, submissionDigest: digest, reservationToken: secret,
    reservationExpiresAt: future,
  } } : { worker: { state: 'reserved', submissionId, submissionDigest: digest, reservationExpiresAt: future } })
  roots.push(unknownCreate.root)
  await unknownCreate.dispatcher.prepare(submissionId, digest, 'event-create')
  await unknownCreate.dispatcher.beginCreate(submissionId)
  assert.equal((await unknownCreate.dispatcher.status(submissionId)).startable, false)

  const wrongProject = fixture(async (action) => action === 'reserve' ? { worker: {
    action: 'create', submissionId, submissionDigest: digest, reservationToken: secret,
    reservationExpiresAt: future,
  } } : assert.fail('bind must not be called'), { exportThread: () => metadata({ projectID: 'wrong' }) })
  roots.push(wrongProject.root)
  await wrongProject.dispatcher.prepare(submissionId, digest, 'event-wrong-project')
  await wrongProject.dispatcher.beginCreate(submissionId)
  await assert.rejects(wrongProject.dispatcher.bind(submissionId, candidate), /fixed Import project/)
  assert.equal(wrongProject.calls.filter(([action]) => action === 'bind').length, 0)

  let bindLost = true
  const reconciliation = fixture(async (action) => {
    if (action === 'reserve') return { worker: { action: 'create', submissionId, submissionDigest: digest,
      reservationToken: secret, reservationExpiresAt: future } }
    if (action === 'bind' && bindLost) { bindLost = false; throw Object.assign(new Error(secret), { code: 'TIMEOUT' }) }
    return { worker: { state: 'bound', submissionId, submissionDigest: digest, ampThreadId: candidate } }
  })
  roots.push(reconciliation.root)
  await reconciliation.dispatcher.prepare(submissionId, digest, 'event-reconcile')
  await reconciliation.dispatcher.beginCreate(submissionId)
  await assert.rejects(reconciliation.dispatcher.bind(submissionId, candidate), /reconcile read-only/)
  assert.equal((await reconciliation.dispatcher.status(submissionId)).startable, true)
  assert.equal((await reconciliation.dispatcher.bind(submissionId, candidate)).state, 'blocked')
  assert.equal(reconciliation.calls.filter(([action]) => action === 'bind').length, 1)
  assert.equal((await reconciliation.dispatcher.bind(submissionId,
    'T-33333333-3333-4333-8333-333333333333')).state, 'blocked')

  const expired = fixture(async () => ({ worker: { action: 'create', submissionId,
    submissionDigest: digest, reservationToken: secret, reservationExpiresAt: '2026-09-17T00:00:00.000Z' } }))
  roots.push(expired.root)
  await expired.dispatcher.prepare(submissionId, digest, 'event-expired')
  assert.equal((await expired.dispatcher.beginCreate(submissionId)).state, 'blocked')

  const badOwnerRoot = mkdtempSync(path.join(tmpdir(), 'eqb-owner-'))
  roots.push(badOwnerRoot)
  const badOwner = createSourceIntakeDispatcher({ root: badOwnerRoot,
    controllerThreadId: controller, controllerProjectId: 'wrong', api: async () => assert.fail() })
  await assert.rejects(badOwner.prepare(submissionId, digest, 'event'), /fixed Import project/)

  for (const overrides of [{ agent: { extends: 'low' } }, { features: ['fast'] },
    { visibility: 'public' }, { agentMode: 'medium' }]) {
    const rejected = fixture(async () => ({ worker: { action: 'create', submissionId,
      submissionDigest: digest, reservationToken: secret, reservationExpiresAt: future } }),
    { exportThread: () => metadata(overrides) })
    roots.push(rejected.root)
    await rejected.dispatcher.prepare(submissionId, digest, 'bad-definition')
    await rejected.dispatcher.beginCreate(submissionId)
    await assert.rejects(rejected.dispatcher.bind(submissionId, candidate))
    assert.equal(rejected.calls.length, 1, 'bad metadata cannot reach bind')
  }
  const existing = fixture(async (action) => ({ worker: { action: action === 'reserve' ? 'resume' : undefined,
    state: 'bound', submissionId, submissionDigest: digest, ampThreadId: candidate } }))
  roots.push(existing.root)
  await existing.dispatcher.prepare(submissionId, digest, 'existing')
  assert.equal((await existing.dispatcher.status(submissionId)).startable, false, 'never automatically resume old bindings')
  assert.equal((await existing.dispatcher.takeAssignment(submissionId)).state, 'blocked')

  writeFileSync(journalPath, `{"reservationToken":${secret}}`)
  await assert.rejects(happy.dispatcher.status(submissionId), (error) => {
    assert.doesNotMatch(error.message, new RegExp(secret))
    return /private dispatch journal/.test(error.message)
  })

  console.log('PASS source-intake dispatch is private, one-shot, explicit-project, and fail-closed')
} finally {
  for (const root of roots) rmSync(root, { recursive: true, force: true })
}
