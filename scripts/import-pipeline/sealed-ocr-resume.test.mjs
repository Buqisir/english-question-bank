import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { ocrReviewBundleDigest } from '../../server/import-review/importReviewStore.mjs'
import { reuseSealedOcrConfirmation } from './lib-sealed-ocr-resume.mjs'

test('sealed OCR resumes an interrupted fast step using only exact approved remote and installed digests', async t => {
  const scratch = path.resolve(import.meta.dirname, '../../.scratch')
  mkdirSync(scratch, { recursive: true })
  const paperDir = mkdtempSync(path.join(scratch, 'sealed-ocr-'))
  const paperId = 'paper-synthetic-resume'
  const proofreadInputPath = path.join(paperDir, 'proofread-input.json')
  const projection = { sourceSetDigest: `sha256:${'a'.repeat(64)}`, evidenceDigest: `sha256:${'b'.repeat(64)}` }
  const confirmation = { paperId, ...projection, confirmed: true, documents: [{ text: 'Synthetic OCR.' }] }
  const manifest = { paperId, ...projection, files: [] }
  const receipt = { schemaVersion: 'web-import-ocr-review-confirmation-v1', paperId,
    revisionId: 'rev-synthetic', confirmationId: 'ocr-confirmation-synthetic', reviewerKind: 'import_agent',
    ...projection, bundleDigest: ocrReviewBundleDigest(manifest), confirmation }
  const revision = { id: receipt.revisionId, paperId, reviewKind: 'ocr', state: 'approved',
    finalizedAt: '2026-10-24T00:00:00Z', bundleDigest: receipt.bundleDigest, manifest }
  const files = {
    'signals/agent-proofreading-receipt.json': receipt,
    'materialization/nck1-ocr-source-confirmation-v1.json': confirmation,
    'proofread-input.json': { confirmation },
  }
  const install = () => Object.entries(files).forEach(([file, value]) => {
    const target = path.join(paperDir, file)
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, JSON.stringify(value))
  })
  let remote = { receipt, confirmation }, status = { revisions: [revision] }, gets = []
  const run = () => reuseSealedOcrConfirmation({ paperId, paperDir, proofreadInputPath,
    loadProjection: () => projection, readRemote: async url => {
      gets.push(url)
      return url.endsWith('/ocr-confirmation') ? remote : status
    } })
  try {
    status = { paperId, revisions: [], latest: null, latestRevisionId: null }
    assert.deepEqual(await run(), { reused: false }, 'fresh OCR retains the existing upload path')
    assert.equal(gets.length, 1, 'first upload requires an authoritative remote absence check')
    status = { revisions: [revision] }
    gets = []
    install()
    assert.deepEqual(await run(), { reused: true, revisionId: receipt.revisionId, confirmationId: receipt.confirmationId })
    assert.equal(gets.length, 2, 'sealed reuse needs only two read-only requests')
    await t.test('superseded OCR requires a later finalized candidate of the same paper', async () => {
      const superseded = { ...revision, state: 'superseded', revisionNumber: 1 }
      const candidate = { id: 'rev-candidate', paperId, reviewKind: 'candidate',
        revisionNumber: 2, state: 'changes_requested', finalizedAt: '2026-10-25T00:00:00Z' }
      for (const later of [[], [{ ...candidate, revisionNumber: 0 }],
        [{ ...candidate, paperId: 'other' }], [{ ...candidate, reviewKind: 'ocr' }],
        [{ ...candidate, state: 'uploading', finalizedAt: null }]]) {
        status = { revisions: [superseded, ...later] }
        await assert.rejects(run, /Sealed OCR differs/)
      }
      status = { revisions: [candidate, superseded] }
      assert.deepEqual(await run(), { reused: true, revisionId: receipt.revisionId, confirmationId: receipt.confirmationId })
      status = { revisions: [candidate, { ...superseded, finalizedAt: null }] }
      await assert.rejects(run, /Sealed OCR differs/)
      for (const state of ['awaiting_review', 'changes_requested', 'uploading']) {
        status = { revisions: [candidate, { ...superseded, state }] }
        await assert.rejects(run, /Sealed OCR differs/)
      }
      status = { revisions: [candidate, { ...superseded, manifest: { ...manifest, evidenceDigest: 'sha256:drift' } }] }
      await assert.rejects(run, /Sealed OCR differs/)
      status = { revisions: [revision] }
    })
    await t.test('a newer finalized OCR followed by a candidate prevents reuse of the older OCR', async () => {
      const firstOcr = { ...revision, state: 'superseded', revisionNumber: 1 }
      const secondOcr = { ...firstOcr, id: 'ocr-generation-2', revisionNumber: 2,
        finalizedAt: '2026-10-25T00:00:00Z' }
      const candidate = { id: 'rev-candidate', paperId, reviewKind: 'candidate',
        revisionNumber: 3, state: 'changes_requested', finalizedAt: '2026-10-26T00:00:00Z' }
      status = { revisions: [candidate, secondOcr, firstOcr] }
      await assert.rejects(run, /Sealed OCR differs/)
      status = { revisions: [revision] }
    })
    for (const key of ['sourceSetDigest', 'evidenceDigest']) {
      const original = projection[key]
      projection[key] = `sha256:${'c'.repeat(64)}`
      await assert.rejects(run, /Sealed OCR differs/)
      projection[key] = original
    }
    for (const state of ['awaiting_review', 'superseded', 'uploading']) {
      status = { revisions: [{ ...revision, state }] }
      await assert.rejects(run, /Sealed OCR differs/)
    }
    status = { revisions: [revision] }
    status = { revisions: [{ ...revision, manifest: { ...manifest, evidenceDigest: 'sha256:drift' } }] }
    await assert.rejects(run, /Sealed OCR differs/, 'a changed remote bundle cannot authorize reuse')
    status = { revisions: [revision] }
    await assert.rejects(() => reuseSealedOcrConfirmation({ paperId, paperDir, proofreadInputPath,
      loadProjection: () => projection, readRemote: async () => { throw new Error('read-only network failure') },
    }), /read-only network failure/, 'unknown remote status must stop instead of uploading')
    remote = { receipt, confirmation: { ...confirmation, documents: [{ text: 'Drift.' }] } }
    await assert.rejects(run, /Sealed OCR differs/)
    remote = { receipt: { ...receipt, confirmationId: 'other' }, confirmation }
    await assert.rejects(run, /Sealed OCR differs/)
    remote = { receipt, confirmation }
    writeFileSync(proofreadInputPath, JSON.stringify({ confirmation: { ...confirmation, documents: [] } }))
    await assert.rejects(run, /Sealed OCR differs/, 'changed authoring input cannot reuse an old approval')
    install()
    rmSync(path.join(paperDir, 'signals/agent-proofreading-receipt.json'))
    await assert.rejects(run, /Sealed OCR differs/, 'partial installation must never authorize another push')
  } finally { rmSync(paperDir, { recursive: true, force: true }) }
})

async function withoutLocalConfirmation(run) {
  const scratch = path.resolve(import.meta.dirname, '../../.scratch')
  mkdirSync(scratch, { recursive: true })
  const paperDir = mkdtempSync(path.join(scratch, 'unpulled-ocr-'))
  const paperId = 'paper-unpulled-ocr'
  let reads = 0, posts = 0
  try {
    await run({
      paperId,
      attemptUpload: async readRemote => {
        const result = await reuseSealedOcrConfirmation({
          paperId, paperDir, proofreadInputPath: path.join(paperDir, 'proofread-input.json'),
          loadProjection: () => { throw new Error('must not project before reconciliation') },
          readRemote: async (...args) => { reads++; return readRemote(...args) },
        })
        if (!result.reused) posts++
      },
      counts: () => ({ reads, posts }),
    })
  } finally { rmSync(paperDir, { recursive: true, force: true }) }
}

for (const state of ['approved', 'awaiting_review', 'uploading', 'changes_requested', 'superseded', 'future_state']) {
  test(`missing local receipt and confirmation never upload over remote OCR ${state}`, async () => {
    await withoutLocalConfirmation(async ({ paperId, attemptUpload, counts }) => {
      const revision = { id: 'rev-unpulled', paperId, reviewKind: 'ocr', state }
      await assert.rejects(() => attemptUpload(async () => ({
        paperId, revisions: [revision], latest: revision, latestRevisionId: revision.id,
      })), error => {
        assert.equal(error.code, state === 'approved' ? 'SEALED_OCR_PULL_REQUIRED' : 'SEALED_OCR_RECONCILIATION_REQUIRED')
        assert.match(error.message, state === 'approved' ? /pull-ocr-confirmation.*rev-unpulled/ : /对账/)
        return true
      })
      assert.deepEqual(counts(), { reads: 1, posts: 0 })
    })
  })
}

test('remote read failure with no local OCR files never reaches upload', async () => {
  await withoutLocalConfirmation(async ({ attemptUpload, counts }) => {
    await assert.rejects(() => attemptUpload(async () => { throw new Error('EOF') }), error => {
      assert.equal(error.code, 'SEALED_OCR_REMOTE_UNKNOWN')
      assert.match(error.message, /只读.*对账/)
      return true
    })
    assert.deepEqual(counts(), { reads: 1, posts: 0 })
  })
})

for (const response of [undefined, null, {}, { paperId: 'other', revisions: [], latest: null, latestRevisionId: null },
  { paperId: 'paper-unpulled-ocr', revisions: [], latest: { id: 'hidden' }, latestRevisionId: 'hidden' },
  { paperId: 'paper-unpulled-ocr', revisions: [{ id: 'unknown' }], latest: null, latestRevisionId: null }]) {
  test(`ambiguous remote status ${JSON.stringify(response)} never reaches upload`, async () => {
    await withoutLocalConfirmation(async ({ attemptUpload, counts }) => {
      await assert.rejects(() => attemptUpload(async () => response), { code: 'SEALED_OCR_REMOTE_UNKNOWN' })
      assert.deepEqual(counts(), { reads: 1, posts: 0 })
    })
  })
}

for (const absentPaper of [true, false]) {
  test(`explicit remote absence (${absentPaper ? 'typed paper-not-found' : 'empty revision list'}) permits initial upload`, async () => {
    await withoutLocalConfirmation(async ({ paperId, attemptUpload, counts }) => {
      await attemptUpload(async (url, options) => {
        assert.equal(url, `/api/import-agent-reviews/papers/${paperId}`)
        assert.equal(options.allowNotFound, true)
        return absentPaper ? options.notFoundValue : { paperId, revisions: [], latest: null, latestRevisionId: null }
      })
      assert.deepEqual(counts(), { reads: 1, posts: 1 })
    })
  })
}
