import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { makeFixture } from '../../scripts/verify-nck1-source-materialization.mjs'
import { sha256 } from '../../shared/paper-canonical/stable.mjs'
import { createImportReviewRoutes } from '../import-review/importReviewRoutes.mjs'
import { runRoutes } from '../router/index.mjs'
import { createSearchSidecarStore, ensureSearchSidecarDatabaseShape, searchSidecarGenerationInput } from './searchSidecars.mjs'

const text = value => ({ kind: 'text', text: value })
const revision = {
  id: 'rev-search', reviewKind: 'candidate', paperId: 'paper-search',
  sourceDigest: 'sha256:' + 'a'.repeat(64), candidateDigest: 'sha256:' + 'b'.repeat(64),
}
const projection = {
  compilation: { artifacts: { canonicalPaper: { questionGroups: [
    { identity: { groupId: 'reading' }, variant: { family: 'reading-choice' },
      content: { blocks: [{ kind: 'paragraph', inlines: [text('Original '), text('passage.')] }] } },
    { identity: { groupId: 'listening' }, variant: { family: 'listening', transcriptSegments: [
      { segmentId: 'segment-1', questionIds: ['q1', 'q2'], content: [text('Original transcript.')] },
    ] }, content: { blocks: [] } },
  ] } } },
}
const input = searchSidecarGenerationInput({ revision, projection })
const payload = {
  groups: [{ groupId: 'reading', overview: '原文概览' }],
  segments: [{ groupId: 'listening', segmentId: 'segment-1', questionIds: ['q1', 'q2'],
    topic: { theme: '人与社会', themeGroup: '社会交往', subtopic: '活动安排' }, summaryZh: '商量活动安排' }],
}

function temporaryStore(t) {
  const directory = mkdtempSync(path.join(tmpdir(), 'eqb-search-sidecars-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const dbPath = path.join(directory, 'question-bank.sqlite')
  const db = new DatabaseSync(dbPath)
  ensureSearchSidecarDatabaseShape(db)
  ensureSearchSidecarDatabaseShape(db)
  db.close()
  return createSearchSidecarStore({
    openDatabase: ({ readOnly }) => new DatabaseSync(dbPath, { readOnly }),
  })
}

test('sidecar store replaces one exact binding, retains other revisions, and rejects foreign ownership', t => {
  const store = temporaryStore(t)
  assert.equal(store.get(input), null)
  store.upsert(input, payload)
  const updated = structuredClone(payload)
  updated.groups[0].overview = '更新后的概览'
  store.upsert(input, updated)
  assert.deepEqual(store.get(input).payload, updated)
  const other = { ...input, candidateDigest: 'sha256:' + 'c'.repeat(64) }
  store.upsert(other, payload)
  assert.equal(store.list(input.paperId).length, 2)
  assert.deepEqual(store.get(other).payload, payload)
  assert.equal(store.get({ ...input, sourceDigest: 'other-source' }), null)
  assert.deepEqual(store.list('another-paper'), [])
  for (const mutate of [
    value => { value.groups[0].groupId = 'foreign' },
    value => { value.groups[0].overview = ' ' },
    value => { value.segments[0].groupId = 'reading' },
    value => { value.segments[0].segmentId = 'foreign' },
    value => { value.segments[0].questionIds = ['q2', 'q3'] },
    value => { value.segments[0].questionIds = ['q1', 'q1', 'q2'] },
    value => { value.segments[0].topic.subtopic = '' },
    value => { value.segments[0].summaryZh = '' },
  ]) {
    const invalid = structuredClone(payload)
    mutate(invalid)
    assert.throws(() => store.upsert(input, invalid), { code: 'SEARCH_SIDECAR_INVALID' })
  }
  assert.deepEqual(store.get(input).payload, updated)
})

function routeHarness(t, materialization = null) {
  const sidecars = temporaryStore(t)
  const directory = mkdtempSync(path.join(tmpdir(), 'eqb-search-input-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const file = { path: materialization ? 'materialization.json' : 'compilation.json',
    role: materialization ? 'materialization' : 'compilation' }
  const bytes = Buffer.from(JSON.stringify(materialization || projection.compilation))
  Object.assign(file, { sha256: sha256(bytes), byteLength: bytes.length })
  const filePath = path.join(directory, file.path)
  writeFileSync(filePath, bytes)
  const sealedRevision = { ...revision, state: 'awaiting_review', rendererBuildId: 'old-renderer',
    manifest: { files: [file] } }
  let reads = 0
  const routes = createImportReviewRoutes({
    agentToken: 'agent-test-token', searchSidecars: sidecars,
    getStore: () => ({
      getRevision(id) {
        reads++
        assert.equal(id, revision.id)
        return sealedRevision
      },
      verifiedFileForRead(id, relativePath) {
        assert.equal(id, revision.id)
        assert.equal(relativePath, file.path)
        const current = readFileSync(filePath)
        if (sha256(current) !== file.sha256 || current.length !== file.byteLength) {
          throw Object.assign(new Error('Sealed digest mismatch'), { status: 409, code: 'IMPORT_REVIEW_FILE_DIGEST_MISMATCH' })
        }
        return { revision: sealedRevision, file, filePath }
      },
      projectionForRevision() {
        throw Object.assign(new Error('Renderer is stale'), { status: 409, code: 'IMPORT_REVIEW_RENDERER_STALE' })
      },
    }),
  })
  return {
    sidecars, filePath, get reads() { return reads },
    async invoke(method, suffix, { body, headers = {}, session = null } = {}) {
      let captured
      const url = new URL(`/api/import-agent-reviews/revisions/${revision.id}/${suffix}`, 'http://test')
      const handled = await runRoutes(routes, {
        request: { method, headers }, response: {}, url,
        context: { session, readJsonBody: async () => body,
          sendJson(_response, status, result) { captured = { status, body: result } } },
      })
      assert.equal(handled, true)
      return captured
    },
  }
}

test('GET generation input authenticates before reading and exposes exact revision text and segment identities', async t => {
  const harness = routeHarness(t)
  assert.equal((await harness.invoke('GET', 'search-sidecar-input')).status, 401)
  assert.equal(harness.reads, 0)
  const result = await harness.invoke('GET', 'search-sidecar-input', {
    headers: { authorization: 'Bearer agent-test-token' },
  })
  assert.equal(result.status, 200)
  assert.deepEqual(result.body, {
    paperId: revision.paperId, sourceDigest: revision.sourceDigest, candidateDigest: revision.candidateDigest,
    groups: [{ groupId: 'reading', text: 'Original passage.' }],
    segments: [{ groupId: 'listening', segmentId: 'segment-1',
      questionIds: ['q1', 'q2'], transcript: 'Original transcript.' }],
  })
})

test('PUT requires agent authentication, exact binding and transcript ownership before persisting', async t => {
  const harness = routeHarness(t)
  const body = { paperId: revision.paperId, sourceDigest: revision.sourceDigest,
    candidateDigest: revision.candidateDigest, ...payload }
  assert.equal((await harness.invoke('PUT', 'search-sidecar', { body })).status, 401)
  assert.equal(harness.reads, 0)
  const session = { accountKind: 'import_agent', username: 'agent' }
  for (const key of ['paperId', 'sourceDigest', 'candidateDigest']) {
    const result = await harness.invoke('PUT', 'search-sidecar', { session, body: { ...body, [key]: 'foreign' } })
    assert.equal(result.status, 409)
  }
  assert.equal(harness.sidecars.get(input), null)
  const foreign = structuredClone(body)
  foreign.segments[0].questionIds = ['foreign']
  assert.equal((await harness.invoke('PUT', 'search-sidecar', { session, body: foreign })).status, 400)
  const result = await harness.invoke('PUT', 'search-sidecar', { session, body })
  assert.equal(result.status, 200)
  assert.deepEqual(harness.sidecars.get(input).payload, payload)
})

test('stale renderer uses sealed materialization text and canonical listening ownership for PUT and readback', async t => {
  const raw = makeFixture({ listening: true })
  raw.paperId = revision.paperId
  const harness = routeHarness(t, raw)
  const session = { accountKind: 'import_agent', username: 'agent' }
  const result = await harness.invoke('GET', 'search-sidecar-input', { session })
  assert.equal(result.status, 200)
  assert.equal(result.body.groups.length, raw.groups.length)
  assert.equal(result.body.groups[0].groupId, raw.groups[0].groupId)
  assert.ok(result.body.groups[0].text.includes(raw.groups[0].blocks[0].content[0].text))
  assert.equal(result.body.segments.length, 10)
  assert.deepEqual(result.body.segments[0], {
    groupId: `group:${revision.paperId}:listening.short-dialogue`, segmentId: 'text:1',
    questionIds: ['question:listening:1'], transcript: 'Short listening transcript 1.',
  })
  assert.deepEqual(result.body.segments[5], {
    groupId: `group:${revision.paperId}:listening.long-form`, segmentId: 'text:6',
    questionIds: [6, 7, 8].map(number => `question:listening:${number}`),
    transcript: 'Long listening transcript 6.',
  })
  assert.equal((await harness.invoke('GET', 'search-sidecar')).status, 401)
  assert.equal((await harness.invoke('GET', 'search-sidecar', { session })).status, 404)
  const body = { ...result.body, groups: [], segments: [{
    ...payload.segments[0], ...result.body.segments[5],
  }] }
  assert.equal((await harness.invoke('PUT', 'search-sidecar', { session, body })).status, 200)
  const readback = await harness.invoke('GET', 'search-sidecar', { session })
  assert.equal(readback.status, 200)
  assert.deepEqual(readback.body.payload, { groups: body.groups, segments: body.segments })
  writeFileSync(harness.filePath, '{}')
  const changed = await harness.invoke('GET', 'search-sidecar-input', { session })
  assert.equal(changed.status, 409)
  assert.equal(changed.body.code, 'IMPORT_REVIEW_FILE_DIGEST_MISMATCH')
})
