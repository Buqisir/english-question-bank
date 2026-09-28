#!/usr/bin/env node
// Autosave checks for #489 personal paper layers. The session runs against
// the real server runtime and a temp SQLite database through a transport that
// can lose responses, fail, expire auth or go offline, so every save status is
// proven against real persistence rather than a mock.
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { createPersonalPaperLayerRuntime } from '../server/personal-paper-layer/runtime.mjs'
import {
  coalescePersonalOperations,
  createPersonalLayerSession,
  personalLayerDraftKey,
  takePersonalOperationBatch,
} from '../shared/personal-paper-layer/index.mjs'
import { createPersonalTextDocumentFromPlainText } from '../shared/personal-text/index.mjs'

let failed = 0
function check(name, ok, detail = '') {
  if (ok) console.log(`PASS ${name}`)
  else {
    failed += 1
    console.log(`FAIL ${name}${detail ? ` ${detail}` : ''}`)
  }
}

const dir = mkdtempSync(path.join(tmpdir(), 'eqb-personal-autosave-'))
const dbPath = path.join(dir, 'user-data.sqlite')
const openUserDatabase = ({ readOnly = false } = {}) => new DatabaseSync(dbPath, { readOnly: readOnly && existsSync(dbPath) })

const text = 'The plan worked. The plan failed later.'
const makeSource = (revision) => ({
  paperId: 'paper-a',
  sourceRevision: revision,
  sourceProjectionVersion: 'paper-selection-source-v2',
  streams: [{
    streamId: 'g1/passage/body/p1', text, role: 'passage-body', groupId: 'g1', flow: true,
    leaves: [{ kind: 'paragraph', id: 'p1', start: 0, end: text.length }],
  }],
})
let serverSource = makeSource('rev-1')
const clientSource = makeSource('rev-1')
const runtime = createPersonalPaperLayerRuntime({
  openUserDatabase,
  loadSource: () => serverSource,
})

// ---- controllable environment ---------------------------------------------

function createTimers() {
  let queue = []
  let seq = 0
  return {
    setTimeout(callback) {
      seq += 1
      queue.push({ id: seq, callback })
      return seq
    },
    clearTimeout(id) {
      queue = queue.filter((entry) => entry.id !== id)
    },
    takeAll() {
      const due = queue
      queue = []
      return due
    },
    get size() { return queue.length },
  }
}
const tick = () => new Promise((resolve) => setImmediate(resolve))
async function drain(timers, rounds = 50) {
  for (let round = 0; round < rounds; round += 1) {
    await tick()
    await tick()
    const due = timers.takeAll()
    if (due.length === 0) {
      await tick()
      if (timers.size === 0) return
      continue
    }
    for (const entry of due) entry.callback()
  }
}

function httpError(error) {
  return Object.assign(new Error(error.message), { kind: 'http', status: error.status || 500, code: error.code, details: error.details })
}
function createTransport(userId) {
  const faults = []
  const calls = { read: 0, commit: 0, commitBodies: [] }
  let gate = null
  const transport = {
    calls,
    faults,
    userId,
    hold() {
      let release
      gate = new Promise((resolve) => { release = resolve })
      return () => { const open = gate; gate = null; release(); return open }
    },
    async read({ paperId, sourceRevision }) {
      calls.read += 1
      const fault = faults[0]?.on === 'read' ? faults.shift() : null
      if (fault?.type === 'network') throw Object.assign(new Error('offline'), { kind: 'network' })
      if (fault?.type === 'status') throw Object.assign(new Error('fault'), { kind: 'http', status: fault.status, code: fault.code })
      try {
        return structuredClone(runtime.read(transport.userId, { paperId, sourceRevision }))
      } catch (error) {
        throw httpError(error)
      }
    },
    async commit(body) {
      calls.commit += 1
      calls.commitBodies.push(structuredClone(body))
      if (gate) await gate
      const fault = faults[0]?.on !== 'read' ? faults.shift() : null
      if (fault?.type === 'network') throw Object.assign(new Error('offline'), { kind: 'network' })
      if (fault?.type === 'status') throw Object.assign(new Error('fault'), { kind: 'http', status: fault.status, code: fault.code })
      let result
      try {
        result = structuredClone(runtime.commit(transport.userId, body.paperId, structuredClone(body)))
      } catch (error) {
        throw httpError(error)
      }
      if (fault?.type === 'drop-response') throw Object.assign(new Error('response lost'), { kind: 'network' })
      return result
    },
  }
  return transport
}
function createLocalStore() {
  const records = new Map()
  const store = {
    records,
    failWrites: false,
    async load(key) { return records.has(key) ? structuredClone(records.get(key)) : null },
    async save(key, record) {
      if (store.failWrites) throw new Error('QuotaExceededError')
      records.set(key, structuredClone(record))
    },
    async clear(key) {
      if (store.failWrites) throw new Error('QuotaExceededError')
      records.delete(key)
    },
  }
  return store
}

let idSeq = 0
function openSession({ userId = 'alice', transport = createTransport(userId), localStore = createLocalStore(), timers = createTimers(), source = clientSource } = {}) {
  const session = createPersonalLayerSession({
    paperId: 'paper-a',
    source,
    transport,
    localStore,
    timers,
    createId: () => `mut_${userId}_${String(++idSeq).padStart(6, '0')}`,
    now: () => '2026-09-28T10:00:00.000Z',
  })
  return { session, transport, localStore, timers }
}
const layout = (y = 30) => ({ kind: 'page-position', layoutId: 'layout-a4-v1', pageId: 'page-1', xMm: 20, yMm: y, widthMm: 40 })
const doc = (value) => createPersonalTextDocumentFromPlainText(value)
const createBox = (id, value = 'note', y = 30) => ({ op: 'create', object: { id, type: 'text-box', document: doc(value), placement: layout(y) } })
const editBox = (id, value) => ({ op: 'update', objectId: id, patch: { document: doc(value) } })
const serverLayer = (userId) => runtime.read(userId, { paperId: 'paper-a' }).layer
const boxText = (object) => object.document.content.content.map((p) => (p.content ?? []).map((n) => n.text ?? '').join('')).join('\n')

try {
  // ---- pure helpers ----------------------------------------------------------
  const merged = coalescePersonalOperations([], [createBox('tb_coal_001', 'a'), editBox('tb_coal_001', 'b'), editBox('tb_coal_001', 'c')])
  check('create followed by edits collapses into one create with the latest text',
    merged.length === 1 && merged[0].op === 'create' && boxText(merged[0].object) === 'c')
  check('create followed by delete before sending leaves nothing to send',
    coalescePersonalOperations([createBox('tb_coal_002')], [{ op: 'delete', objectId: 'tb_coal_002' }]).length === 0)
  const updateThenDelete = coalescePersonalOperations([editBox('tb_coal_003', 'x')], [{ op: 'delete', objectId: 'tb_coal_003' }])
  check('an unsent update followed by delete becomes just the delete',
    updateThenDelete.length === 1 && updateThenDelete[0].op === 'delete')
  const separate = coalescePersonalOperations([editBox('tb_coal_004', 'x')], [editBox('tb_coal_005', 'y')])
  check('edits to different objects stay separate', separate.length === 2)
  const many = Array.from({ length: 120 }, (_, index) => createBox(`tb_batch_${String(index).padStart(4, '0')}`))
  const firstBatch = takePersonalOperationBatch(many)
  check('batches never exceed 50 operations', firstBatch.batch.length === 50 && firstBatch.rest.length === 70)

  // ---- normal save -----------------------------------------------------------
  const a = openSession()
  const statuses = []
  a.session.subscribe((snapshot) => statuses.push(snapshot.status))
  await a.session.load()
  check('loading an empty layer ends saved and editable', a.session.getSnapshot().status === 'saved'
    && a.session.getSnapshot().readOnly === false && a.session.getSnapshot().confirmedVersion === 0)
  const invalid = a.session.apply([{ op: 'create', object: { id: 'tb_bad_0001', type: 'text-box', document: doc('x'), placement: { ...layout(), xMm: Number.NaN } } }])
  check('an invalid edit is refused locally and queues nothing', invalid.ok === false
    && invalid.code === 'PERSONAL_PLACEMENT_INVALID' && a.session.getSnapshot().unsentCount === 0)
  a.session.apply([createBox('tb_alice_001', 'first')])
  for (const value of ['fi', 'fir', 'firs', 'first draft']) a.session.apply([editBox('tb_alice_001', value)])
  await a.session.whenLocalWritten()
  const draftKey = personalLayerDraftKey({ ownerKey: runtime.read('alice', { paperId: 'paper-a' }).ownerKey, paperId: 'paper-a', sourceRevision: 'rev-1' })
  check('unsaved edits are dirty, visible and protected locally before any request',
    a.session.getSnapshot().status === 'dirty' && a.session.getSnapshot().layer.objects.length === 1
    && a.session.getSnapshot().localDraft === 'protected' && a.localStore.records.get(draftKey)?.pending.length === 1
    && a.transport.calls.commit === 0)
  await drain(a.timers)
  check('a typing burst becomes one write and ends saved at version 1', a.transport.calls.commit === 1
    && a.session.getSnapshot().status === 'saved' && a.session.getSnapshot().confirmedVersion === 1
    && boxText(serverLayer('alice').objects[0]) === 'first draft')
  check('saved status appears only after the server confirmed', statuses.indexOf('saving') < statuses.lastIndexOf('saved')
    && statuses.includes('dirty'))
  check('confirmed work clears the local draft', !a.localStore.records.has(draftKey) && a.session.getSnapshot().localDraft === 'none')

  // ---- serial writes and late responses --------------------------------------
  const release = a.transport.hold()
  a.session.apply([editBox('tb_alice_001', 'second')])
  await drain(a.timers)
  a.session.apply([createBox('tb_alice_002', 'while saving')])
  await drain(a.timers)
  check('a second edit waits while one write is in flight', a.transport.calls.commit === 2
    && a.session.getSnapshot().status === 'saving' && a.session.getSnapshot().unsentCount === 2)
  release()
  await tick()
  await tick()
  check('the first response does not mark the newer edit as saved',
    a.session.getSnapshot().status === 'saving' && a.session.getSnapshot().unsentCount === 1
    && a.session.getSnapshot().confirmedVersion === 2)
  await drain(a.timers)
  const bodies = a.transport.calls.commitBodies
  check('writes are serial: the next request expects the version the previous one produced',
    bodies[1].expectedVersion === 1 && bodies[2].expectedVersion === 2
    && a.session.getSnapshot().status === 'saved' && a.session.getSnapshot().confirmedVersion === 3)

  // ---- lost response, 500, retry -------------------------------------------
  a.transport.faults.push({ type: 'drop-response' })
  a.session.apply([createBox('tb_alice_003', 'lost response')])
  await tick()
  a.timers.takeAll().forEach((entry) => entry.callback())
  await tick(); await tick(); await tick()
  check('a lost response is offline, not saved and not failed', a.session.getSnapshot().status === 'offline'
    && a.session.getSnapshot().unsentCount === 1)
  await drain(a.timers)
  const afterLost = serverLayer('alice')
  check('the retry replays the same mutation: saved, and the text box exists exactly once',
    a.session.getSnapshot().status === 'saved' && afterLost.objects.filter((o) => o.id === 'tb_alice_003').length === 1
    && afterLost.version === 4 && a.transport.calls.commitBodies.at(-1).clientMutationId === a.transport.calls.commitBodies.at(-2).clientMutationId)
  a.transport.faults.push({ type: 'status', status: 500, code: 'PERSONAL_LAYER_FAILED' })
  a.session.apply([editBox('tb_alice_003', 'after 500')])
  await tick()
  a.timers.takeAll().forEach((entry) => entry.callback())
  await tick(); await tick(); await tick()
  check('a 500 is shown as failed-and-retrying, never saved', a.session.getSnapshot().status === 'failed'
    && a.session.getSnapshot().lastError?.status === 500)
  await drain(a.timers)
  check('the automatic retry then saves', a.session.getSnapshot().status === 'saved' && serverLayer('alice').version === 5)
  const settledVersion = await a.session.settle()
  check('settle resolves with the confirmed version when nothing is unsent', settledVersion === 5)

  // ---- crash with a request in flight ----------------------------------------
  a.transport.faults.push({ type: 'drop-response' })
  a.session.apply([createBox('tb_alice_004', 'crash mid-send')])
  await tick()
  a.timers.takeAll().forEach((entry) => entry.callback())
  await tick(); await tick(); await tick()
  a.session.dispose()
  const crashRecord = a.localStore.records.get(draftKey)
  check('the in-flight mutation id is on disk when the tab dies', crashRecord?.inflight?.clientMutationId?.startsWith('mut_alice_'))
  const b = openSession({ localStore: a.localStore })
  await b.session.load()
  await drain(b.timers)
  const afterCrash = serverLayer('alice')
  check('reopening resends the same id: the box exists once, the layer is saved, the draft is cleared',
    b.session.getSnapshot().status === 'saved' && afterCrash.objects.filter((o) => o.id === 'tb_alice_004').length === 1
    && b.transport.calls.commitBodies[0].clientMutationId === crashRecord.inflight.clientMutationId
    && !b.localStore.records.has(draftKey))

  // ---- offline edits survive a reload ---------------------------------------
  b.transport.faults.push({ type: 'network' }, { type: 'network' }, { type: 'network' })
  b.session.apply([editBox('tb_alice_004', 'typed offline')])
  await tick()
  b.timers.takeAll().forEach((entry) => entry.callback())
  await tick(); await tick(); await tick()
  b.session.apply([createBox('tb_alice_005', 'also offline')])
  await b.session.whenLocalWritten()
  check('edits keep queueing locally while offline', b.session.getSnapshot().status === 'offline'
    && b.session.getSnapshot().unsentCount === 2 && b.session.getSnapshot().localDraft === 'protected')
  await b.session.settle().then(() => check('settle must not resolve while offline', false), (error) => check('settle refuses while offline, so export cannot use stale content', error.code === 'PERSONAL_LAYER_NOT_SAVED'))
  b.session.dispose()
  b.transport.faults.length = 0
  const c = openSession({ localStore: b.localStore })
  await c.session.load()
  await drain(c.timers)
  const afterOffline = serverLayer('alice')
  check('after reload the offline edits are sent once and saved', c.session.getSnapshot().status === 'saved'
    && boxText(afterOffline.objects.find((o) => o.id === 'tb_alice_004')) === 'typed offline'
    && afterOffline.objects.some((o) => o.id === 'tb_alice_005'))

  // ---- two tabs --------------------------------------------------------------
  const tab1 = openSession()
  const tab2 = openSession()
  await tab1.session.load()
  await tab2.session.load()
  tab1.session.apply([editBox('tb_alice_001', 'tab one wins the race')])
  await drain(tab1.timers)
  tab2.session.apply([createBox('tb_alice_006', 'tab two')])
  await drain(tab2.timers)
  const conflictSnapshot = tab2.session.getSnapshot()
  check('the second tab gets a conflict instead of overwriting', conflictSnapshot.status === 'conflict'
    && conflictSnapshot.conflict.reason === 'server-changed' && conflictSnapshot.readOnly === true
    && boxText(conflictSnapshot.conflict.serverLayer.objects.find((o) => o.id === 'tb_alice_001')) === 'tab one wins the race'
    && conflictSnapshot.conflict.localOperations.length === 1)
  check('conflicted local work stays protected on disk', tab2.localStore.records.values().next().value?.pending?.length === 1)
  check('edits are refused while a conflict waits for a decision', tab2.session.apply([createBox('tb_alice_007')]).ok === false)
  check('reapplying local work on top of the server copy succeeds and saves both',
    tab2.session.resolveConflict('reapply-local').ok === true)
  await drain(tab2.timers)
  const both = serverLayer('alice')
  check('after reapply the server has both tabs\' changes', tab2.session.getSnapshot().status === 'saved'
    && both.objects.some((o) => o.id === 'tb_alice_006')
    && boxText(both.objects.find((o) => o.id === 'tb_alice_001')) === 'tab one wins the race')

  await tab1.session.load()
  tab1.session.apply([{ op: 'delete', objectId: 'tb_alice_006' }])
  await drain(tab1.timers)
  tab2.session.apply([editBox('tb_alice_006', 'edit a box the other tab deleted')])
  await drain(tab2.timers)
  const impossible = tab2.session.resolveConflict('reapply-local')
  check('reapply is refused when the object was deleted elsewhere', impossible.ok === false
    && impossible.code === 'PERSONAL_LAYER_OBJECT_MISSING' && tab2.session.getSnapshot().status === 'conflict')
  const keepServer = tab2.session.resolveConflict('keep-server')
  await tab2.session.whenLocalWritten()
  check('keeping the server copy is an explicit choice that clears the local draft',
    keepServer.ok === true && tab2.session.getSnapshot().status === 'saved'
    && tab2.localStore.records.size === 0 && !tab2.session.getSnapshot().layer.objects.some((o) => o.id === 'tb_alice_006'))

  // ---- local draft diverged after reload ------------------------------------
  const stale = openSession()
  await stale.session.load()
  stale.transport.faults.push({ type: 'network' })
  stale.session.apply([createBox('tb_alice_008', 'written before the other device')])
  await tick()
  stale.timers.takeAll().forEach((entry) => entry.callback())
  await tick(); await tick(); await tick()
  stale.session.dispose()
  const staleRecord = [...stale.localStore.records.values()][0]
  // Simulate an unsent-only record (network failed before the server saw it).
  staleRecord.pending = [...staleRecord.inflight.operations, ...staleRecord.pending]
  staleRecord.inflight = null
  stale.localStore.records.set(staleRecord.key, staleRecord)
  const other = openSession()
  await other.session.load()
  other.session.apply([editBox('tb_alice_001', 'other device')])
  await drain(other.timers)
  const reopened = openSession({ localStore: stale.localStore })
  await reopened.session.load()
  await drain(reopened.timers)
  check('a local draft based on an older version is shown as a conflict, not auto-applied',
    reopened.session.getSnapshot().status === 'conflict'
    && reopened.session.getSnapshot().conflict.reason === 'local-draft-diverged'
    && !serverLayer('alice').objects.some((o) => o.id === 'tb_alice_008'))
  reopened.session.resolveConflict('reapply-local')
  await drain(reopened.timers)
  check('the person can then reapply it deliberately', reopened.session.getSnapshot().status === 'saved'
    && serverLayer('alice').objects.some((o) => o.id === 'tb_alice_008'))

  // ---- auth expiry and account isolation ------------------------------------
  const auth = openSession()
  await auth.session.load()
  auth.transport.faults.push({ type: 'status', status: 401, code: 'not_authenticated' })
  auth.session.apply([editBox('tb_alice_001', 'typed as session expired')])
  await drain(auth.timers)
  check('an expired session pauses saving and keeps the edit', auth.session.getSnapshot().status === 'auth-paused'
    && auth.session.getSnapshot().unsentCount === 1 && auth.transport.calls.commit === 1)
  auth.session.apply([createBox('tb_alice_009', 'still typing')])
  await drain(auth.timers)
  check('editing continues locally while paused without sending', auth.transport.calls.commit === 1
    && auth.session.getSnapshot().unsentCount === 2)
  check('signing back in as a different account does not resume this session',
    auth.session.resumeAfterAuth(runtime.read('bob', { paperId: 'paper-a' }).ownerKey) === false
    && auth.session.getSnapshot().status === 'auth-paused')
  const bobOnSameBrowser = openSession({ userId: 'bob', localStore: auth.localStore })
  await bobOnSameBrowser.session.load()
  check('another account on the same browser sees none of the paused drafts',
    bobOnSameBrowser.session.getSnapshot().status === 'saved' && bobOnSameBrowser.session.getSnapshot().layer.objects.length === 0
    && bobOnSameBrowser.session.getSnapshot().unsentCount === 0)
  check('signing back in as the same account resumes and saves',
    auth.session.resumeAfterAuth(runtime.read('alice', { paperId: 'paper-a' }).ownerKey) === true)
  await drain(auth.timers)
  check('the paused edits are saved to alice only', auth.session.getSnapshot().status === 'saved'
    && serverLayer('alice').objects.some((o) => o.id === 'tb_alice_009') && serverLayer('bob').objects.length === 0)

  // ---- load failures, local storage failures, rejection --------------------
  const broken = openSession()
  broken.transport.faults.push({ on: 'read', type: 'status', status: 500 })
  await broken.session.load()
  check('a failed load is unavailable and read-only, never an empty saved layer',
    broken.session.getSnapshot().status === 'unavailable' && broken.session.getSnapshot().layer === null
    && broken.session.apply([createBox('tb_alice_010')]).ok === false && broken.localStore.records.size === 0)
  const noLocal = openSession({ localStore: null })
  await noLocal.session.load()
  check('without local storage the session says drafts are unprotected', noLocal.session.getSnapshot().localDraft === 'unavailable')
  const quota = openSession()
  await quota.session.load()
  quota.localStore.failWrites = true
  quota.session.apply([createBox('tb_alice_011')])
  await quota.session.whenLocalWritten()
  check('a failed local write is reported as a protection risk', quota.session.getSnapshot().localDraft === 'failed')
  await drain(quota.timers)
  check('saving to the account still works when local protection failed', quota.session.getSnapshot().status === 'saved')
  quota.transport.faults.push({ type: 'status', status: 400, code: 'PERSONAL_LAYER_REQUEST_INVALID' })
  quota.localStore.failWrites = false
  quota.session.apply([editBox('tb_alice_011', 'server refuses')])
  await drain(quota.timers)
  check('a server rejection stops and keeps the edit until the person discards it',
    quota.session.getSnapshot().status === 'rejected' && quota.session.getSnapshot().unsentCount === 1
    && quota.session.discardUnsaved().ok === true && quota.session.getSnapshot().status === 'saved')

  // ---- source revision changes ---------------------------------------------
  const revision = openSession()
  await revision.session.load()
  serverSource = makeSource('rev-2')
  revision.session.apply([createBox('tb_alice_012', 'written against rev-1')])
  await drain(revision.timers)
  check('a write after the paper was revised stops as stale-source and keeps the draft',
    revision.session.getSnapshot().status === 'stale-source' && revision.session.getSnapshot().readOnly === true
    && revision.localStore.records.size === 1)
  const oldPage = openSession()
  await oldPage.session.load()
  check('opening the old revision shows its saved layer read-only',
    oldPage.session.getSnapshot().status === 'stale-source' && oldPage.session.getSnapshot().layer.version > 0)
  serverSource = makeSource('rev-1')

  // ---- batching and disposal ----------------------------------------------
  const bulk = openSession({ userId: 'erin' })
  await bulk.session.load()
  bulk.session.apply(many.slice(0, 50))
  bulk.session.apply(many.slice(50, 100))
  bulk.session.apply(many.slice(100))
  await drain(bulk.timers)
  check('a large paste is sent in sequential batches of at most 50', bulk.transport.calls.commit === 3
    && bulk.transport.calls.commitBodies.every((body) => body.operations.length <= 50)
    && serverLayer('erin').objects.length === 120)

  const late = openSession({ userId: 'frank' })
  await late.session.load()
  let lateEvents = 0
  late.session.subscribe(() => { lateEvents += 1 })
  const releaseLate = late.transport.hold()
  late.session.apply([createBox('tb_frank_001')])
  await drain(late.timers)
  const eventsBeforeDispose = lateEvents
  late.session.dispose()
  releaseLate()
  await drain(late.timers)
  check('a response arriving after the session was disposed changes nothing visible', lateEvents === eventsBeforeDispose)
} finally {
  rmSync(dir, { recursive: true, force: true })
}

console.log(failed === 0 ? '\nverify-personal-paper-layer-autosave: all checks passed' : `\nverify-personal-paper-layer-autosave: ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
