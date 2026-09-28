#!/usr/bin/env node
// Server checks for #489 personal paper layers: per-user isolation, optimistic
// concurrency, idempotent replay, atomic batches, source revision binding, and
// the HTTP seam (same-origin, JSON content type, size limit, hidden 5xx).
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { runRoutes } from '../server/router/index.mjs'
import { createPersonalPaperLayerRoutes } from '../server/personal-paper-layer/routes.mjs'
import { PERSONAL_LAYER_API_SCHEMA, createPersonalPaperLayerRuntime } from '../server/personal-paper-layer/runtime.mjs'
import { PERSONAL_LAYER_MUTATION_RETENTION_MS, createPersonalPaperLayerStore } from '../server/personal-paper-layer/store.mjs'
import { createPersonalTextDocumentFromPlainText } from '../shared/personal-text/index.mjs'

let failed = 0
function check(name, ok, detail = '') {
  if (ok) console.log(`PASS ${name}`)
  else {
    failed += 1
    console.log(`FAIL ${name}${detail ? ` ${detail}` : ''}`)
  }
}
function errorOf(fn) {
  try {
    fn()
    return null
  } catch (error) {
    return error
  }
}

const dir = mkdtempSync(path.join(tmpdir(), 'eqb-personal-layer-'))
const dbPath = path.join(dir, 'user-data.sqlite')
function openUserDatabase({ readOnly = false } = {}) {
  return new DatabaseSync(dbPath, { readOnly: readOnly && existsSync(dbPath) })
}

const body = 'The plan worked. The plan failed later.'
function makeSource(revision, text = body) {
  return {
    paperId: 'paper-a',
    sourceRevision: revision,
    sourceProjectionVersion: 'paper-selection-source-v2',
    streams: [
      {
        streamId: 'g1/passage/body/p1', text, role: 'passage-body', groupId: 'g1', flow: true,
        leaves: [{ kind: 'paragraph', id: 'p1', start: 0, end: text.length }],
      },
      {
        streamId: 'g1/question/q1/stem', text: 'What happened?', role: 'question-stem', groupId: 'g1', flow: false,
        leaves: [{ kind: 'question-stem', id: 'q1', start: 0, end: 14 }],
      },
    ],
  }
}
let currentSource = makeSource('rev-1')
let clock = Date.parse('2026-09-28T10:00:00.000Z')
function makeRuntime() {
  return createPersonalPaperLayerRuntime({
    openUserDatabase,
    loadSource: (paperId) => {
      if (paperId !== 'paper-a') throw new Error('missing paper')
      return currentSource
    },
    now: () => new Date(clock),
  })
}
const runtime = makeRuntime()

const note = createPersonalTextDocumentFromPlainText('private note for alice')
const layout = { kind: 'page-position', layoutId: 'layout-a4-v1', pageId: 'page-1', xMm: 20, yMm: 30, widthMm: 40 }
const anchorFor = (source, start, end) => ({
  paperId: 'paper-a',
  sourceRevision: source.sourceRevision,
  sourceProjectionVersion: source.sourceProjectionVersion,
  segments: [{ streamId: 'g1/passage/body/p1', start, end, exactText: source.streams[0].text.slice(start, end) }],
})
let mutationSeq = 0
function request(expectedVersion, operations, overrides = {}) {
  mutationSeq += 1
  return {
    schemaVersion: PERSONAL_LAYER_API_SCHEMA,
    paperId: 'paper-a',
    sourceRevision: currentSource.sourceRevision,
    expectedVersion,
    clientMutationId: `mut_${String(mutationSeq).padStart(8, '0')}`,
    operations,
    ...overrides,
  }
}

try {
  // ---- read before any write ------------------------------------------------
  const firstRead = runtime.read('alice', { paperId: 'paper-a' })
  check('reading before any write returns an empty version-0 layer without creating tables',
    firstRead.layer.version === 0 && firstRead.layer.objects.length === 0 && firstRead.revisions.length === 0
    && firstRead.stale === false)

  // ---- create + idempotency -------------------------------------------------
  const createBody = request(0, [
    { op: 'create', object: { id: 'hl_00000001', type: 'highlight', textAnchor: anchorFor(currentSource, 4, 8), style: { color: 'yellow' } } },
    { op: 'create', object: { id: 'tb_00000001', type: 'text-box', document: note, placement: layout } },
  ])
  const created = runtime.commit('alice', 'paper-a', createBody)
  check('a first commit creates the layer at version 1', created.layerVersion === 1 && created.replayed === false
    && created.objects.length === 2 && created.acceptedMutationId === createBody.clientMutationId)
  const replay = runtime.commit('alice', 'paper-a', structuredClone(createBody))
  check('resending the same mutation replays the stored result without a second write',
    replay.replayed === true && replay.layerVersion === 1
    && runtime.read('alice', { paperId: 'paper-a' }).layer.version === 1)
  const reusedId = errorOf(() => runtime.commit('alice', 'paper-a', {
    ...createBody, operations: [{ op: 'delete', objectId: 'hl_00000001' }],
  }))
  check('reusing a mutation id for different operations is a 409 conflict',
    reusedId?.status === 409 && reusedId.code === 'PERSONAL_LAYER_MUTATION_CONFLICT')

  // ---- optimistic concurrency ------------------------------------------------
  const tabA = makeRuntime()
  const tabB = makeRuntime()
  const tabAResult = tabA.commit('alice', 'paper-a', request(1, [
    { op: 'update', objectId: 'hl_00000001', patch: { style: { color: 'green' } } },
  ]))
  const stale = errorOf(() => tabB.commit('alice', 'paper-a', request(1, [
    { op: 'update', objectId: 'hl_00000001', patch: { style: { color: 'blue' } } },
  ])))
  check('a second writer with an old expectedVersion gets 409 and the current version',
    tabAResult.layerVersion === 2 && stale?.status === 409 && stale.code === 'PERSONAL_LAYER_VERSION_CONFLICT'
    && stale.details?.currentVersion === 2)
  check('the losing write changed nothing', runtime.read('alice', { paperId: 'paper-a' })
    .layer.objects.find((object) => object.id === 'hl_00000001').style.color === 'green')

  // ---- atomic batch ----------------------------------------------------------
  const partial = errorOf(() => runtime.commit('alice', 'paper-a', request(2, [
    { op: 'update', objectId: 'hl_00000001', patch: { style: { color: 'pink' } } },
    { op: 'create', object: { id: 'tb_00000002', type: 'text-box', document: note, placement: { ...layout, xMm: -5 } } },
  ])))
  const afterPartial = runtime.read('alice', { paperId: 'paper-a' }).layer
  check('a batch with one invalid operation is rejected as a 400 and writes nothing',
    partial?.status === 400 && afterPartial.version === 2 && afterPartial.objects.length === 2
    && afterPartial.objects.find((object) => object.id === 'hl_00000001').style.color === 'green')

  // ---- user isolation --------------------------------------------------------
  const bobRead = runtime.read('bob', { paperId: 'paper-a' })
  check('each account gets a distinct opaque owner key that does not reveal its id',
    /^[0-9a-f]{32}$/u.test(bobRead.ownerKey) && bobRead.ownerKey !== firstRead.ownerKey
    && !bobRead.ownerKey.includes('bob') && runtime.read('alice', { paperId: 'paper-a' }).ownerKey === firstRead.ownerKey)
  check('another user sees an empty layer for the same paper', bobRead.layer.version === 0
    && bobRead.layer.objects.length === 0 && !JSON.stringify(bobRead).includes('private note for alice'))
  const bobTouch = errorOf(() => runtime.commit('bob', 'paper-a', request(0, [
    { op: 'delete', objectId: 'tb_00000001' },
  ])))
  check('another user cannot delete an object by guessing its id', bobTouch?.code === 'PERSONAL_LAYER_OBJECT_MISSING'
    && runtime.read('alice', { paperId: 'paper-a' }).layer.objects.length === 2)
  const bobReplay = runtime.commit('bob', 'paper-a', structuredClone(createBody))
  check('mutation ids are scoped per user: bob reusing alice\'s id is a fresh write, not alice\'s receipt',
    bobReplay.replayed === false && bobReplay.layerVersion === 1
    && runtime.read('alice', { paperId: 'paper-a' }).layer.version === 2)

  // ---- order survives delete + create ---------------------------------------
  runtime.commit('carol', 'paper-a', request(0, ['a', 'b', 'c'].map((suffix, index) => ({
    op: 'create', object: { id: `tb_order_${suffix}`, type: 'text-box', document: note, placement: { ...layout, yMm: 10 + index } },
  }))))
  runtime.commit('carol', 'paper-a', request(1, [{ op: 'delete', objectId: 'tb_order_a' }]))
  runtime.commit('carol', 'paper-a', request(2, [
    { op: 'create', object: { id: 'tb_order_0', type: 'text-box', document: note, placement: layout } },
  ]))
  const carolOrder = runtime.read('carol', { paperId: 'paper-a' }).layer.objects.map((object) => object.id).join(',')
  check('object order survives a delete followed by a create', carolOrder === 'tb_order_b,tb_order_c,tb_order_0', carolOrder)
  check('a deleted id stays tombstoned after reload', errorOf(() => runtime.commit('carol', 'paper-a', request(3, [
    { op: 'create', object: { id: 'tb_order_a', type: 'text-box', document: note, placement: layout } },
  ])))?.code === 'PERSONAL_LAYER_OBJECT_EXISTS')

  // ---- request shape -------------------------------------------------------
  for (const [label, overrides] of [
    ['unknown body key', { userId: 'bob' }],
    ['wrong API schema', { schemaVersion: 'eqb-personal-paper-layer-api-v0' }],
    ['paper id mismatch', { paperId: 'paper-b' }],
    ['negative expectedVersion', { expectedVersion: -1 }],
    ['malformed mutation id', { clientMutationId: 'short' }],
  ]) {
    const error = errorOf(() => runtime.commit('alice', 'paper-a', request(2, [], overrides)))
    check(`commit rejects ${label}`, error?.status === 400 && error.code === 'PERSONAL_LAYER_REQUEST_INVALID', error?.code)
  }
  check('a path-like paper id is rejected before touching the source', errorOf(() => runtime.read('alice', { paperId: '../x' }))?.status === 400)
  check('an unknown paper is a 404 without the loader message', (() => {
    const error = errorOf(() => runtime.read('alice', { paperId: 'paper-z' }))
    return error?.status === 404 && !error.message.includes('missing paper')
  })())

  // ---- source revision binding ---------------------------------------------
  const oldSource = currentSource
  currentSource = makeSource('rev-2', body.replace('The plan failed', 'The idea failed'))
  const wrongRevision = errorOf(() => runtime.commit('alice', 'paper-a', request(2, [], { sourceRevision: 'rev-1' })))
  check('writes against an old source revision are a 409 naming the current revision',
    wrongRevision?.status === 409 && wrongRevision.code === 'PERSONAL_LAYER_SOURCE_MISMATCH'
    && wrongRevision.details?.currentSourceRevision === 'rev-2')
  const freshRead = runtime.read('alice', { paperId: 'paper-a' })
  check('the new revision starts empty and lists the old layer as recoverable', freshRead.layer.version === 0
    && freshRead.stale === false && freshRead.revisions.some((entry) => entry.sourceRevision === 'rev-1' && entry.objectCount === 2))
  const oldRead = runtime.read('alice', { paperId: 'paper-a', sourceRevision: 'rev-1' })
  check('the old revision is still readable, marked stale, with objects intact', oldRead.stale === true
    && oldRead.layer.version === 2 && oldRead.layer.objects.length === 2 && oldRead.diagnostics.length === 0)
  currentSource = { ...oldSource, streams: [{ ...oldSource.streams[0], text: body.replace('plan', 'idea') }, oldSource.streams[1]] }
  const drifted = runtime.read('alice', { paperId: 'paper-a' })
  check('an anchor whose text no longer matches is reported needs-reanchor, not moved',
    drifted.diagnostics.length === 1 && drifted.diagnostics[0].objectId === 'hl_00000001'
    && drifted.diagnostics[0].code === 'needs-reanchor'
    && drifted.layer.objects.find((object) => object.id === 'hl_00000001').textAnchor.segments[0].start === 4)
  currentSource = oldSource

  // ---- throttle and retention -----------------------------------------------
  const throttled = makeRuntime()
  let rateError = null
  for (let index = 0; index < 121 && !rateError; index += 1) {
    rateError = errorOf(() => throttled.commit('dave', 'paper-a', request(99, [])))
    if (rateError?.status === 409) rateError = null
  }
  check('more than 120 writes per minute from one user are throttled with 429', rateError?.status === 429)
  clock += 61_000
  check('the throttle window slides', errorOf(() => throttled.commit('dave', 'paper-a', request(99, [])))?.status === 409)

  const pruneDb = openUserDatabase()
  const receiptsBefore = Number(pruneDb.prepare('SELECT COUNT(*) AS n FROM personal_paper_mutations').get().n)
  const pruned = createPersonalPaperLayerStore(pruneDb).pruneMutations(clock + PERSONAL_LAYER_MUTATION_RETENTION_MS + 1000)
  pruneDb.close()
  check('mutation receipts past retention are pruned', receiptsBefore > 0 && pruned === receiptsBefore)
  const lateResend = errorOf(() => runtime.commit('alice', 'paper-a', structuredClone(createBody)))
  check('a resend after its receipt was pruned fails the version check instead of applying twice',
    lateResend?.status === 409 && lateResend.code === 'PERSONAL_LAYER_VERSION_CONFLICT')

  // ---- HTTP seam -------------------------------------------------------------
  const routes = createPersonalPaperLayerRoutes()
  const explodingRuntime = {
    read() { throw new Error('SQLITE_CORRUPT at /srv/private/user-data.sqlite') },
    commit() { throw new Error('boom') },
  }
  let activeRuntime = runtime
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1')
    const handled = await runRoutes(routes, {
      request: req,
      response: res,
      url,
      context: { authMode: 'enforced', session: { userId: 'alice' }, personalPaperLayer: activeRuntime, paperTranslation: { config: { publicOrigin: '' } } },
    })
    if (!handled) {
      res.writeHead(404)
      res.end()
    }
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  async function call(pathname, { method = 'GET', headers = {}, payload } = {}) {
    try {
      const response = await fetch(`${origin}${pathname}`, { method, headers, body: payload })
      const text = await response.text()
      let json = null
      try { json = JSON.parse(text) } catch { /* non-JSON */ }
      return { status: response.status, json, text, cache: response.headers.get('cache-control') }
    } catch (error) {
      return { status: 0, error }
    }
  }
  try {
    const httpRead = await call('/api/personal-paper-layers/paper-a')
    check('GET returns the signed-in user\'s layer with private no-store caching', httpRead.status === 200
      && httpRead.json?.layer?.objects?.length === 2 && httpRead.cache === 'private, no-store')
    const writeHeaders = { origin, 'content-type': 'application/json' }
    const httpWrite = await call('/api/personal-paper-layers/paper-a/operations', {
      method: 'POST', headers: writeHeaders,
      payload: JSON.stringify(request(2, [{ op: 'update', objectId: 'hl_00000001', patch: { style: { color: 'blue' } } }])),
    })
    check('same-origin JSON POST commits', httpWrite.status === 200 && httpWrite.json?.layerVersion === 3)
    const crossOrigin = await call('/api/personal-paper-layers/paper-a/operations', {
      method: 'POST', headers: { ...writeHeaders, origin: 'https://evil.example' }, payload: JSON.stringify(request(3, [])),
    })
    check('cross-origin POST is refused with 403', crossOrigin.status === 403)
    const noOrigin = await call('/api/personal-paper-layers/paper-a/operations', {
      method: 'POST', headers: { 'content-type': 'application/json' }, payload: JSON.stringify(request(3, [])),
    })
    check('POST without Origin or Referer is refused with 403', noOrigin.status === 403)
    const formPost = await call('/api/personal-paper-layers/paper-a/operations', {
      method: 'POST', headers: { origin, 'content-type': 'text/plain' }, payload: JSON.stringify(request(3, [])),
    })
    check('non-JSON content type is refused with 415', formPost.status === 415)
    const badJson = await call('/api/personal-paper-layers/paper-a/operations', { method: 'POST', headers: writeHeaders, payload: '{' })
    check('malformed JSON is a 400', badJson.status === 400 && badJson.json?.code === 'PERSONAL_LAYER_REQUEST_INVALID')
    const oversized = await call('/api/personal-paper-layers/paper-a/operations', {
      method: 'POST', headers: writeHeaders, payload: JSON.stringify({ padding: 'x'.repeat(600 * 1024) }),
    })
    check('an oversized request is cut off before it is parsed', oversized.status === 413 || oversized.status === 0,
      `status=${oversized.status}`)
    check('after the refused requests the layer version is unchanged',
      runtime.read('alice', { paperId: 'paper-a' }).layer.version === 3)
    activeRuntime = explodingRuntime
    const hidden = await call('/api/personal-paper-layers/paper-a')
    check('an unexpected failure is a 500 that hides internals', hidden.status === 500
      && !hidden.text.includes('SQLITE') && !hidden.text.includes('/srv/') && typeof hidden.json?.requestId === 'string')
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
} finally {
  rmSync(dir, { recursive: true, force: true })
}

if (failed) {
  console.error(`\nPersonal paper layer server verify failed: ${failed} failed`)
  process.exit(1)
}
console.log('\nPersonal paper layer server verify passed')
