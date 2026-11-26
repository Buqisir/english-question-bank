import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { assertReferenceProductsReady, finish, listeningRedo, rebindRejectedIssue, reconcilePush, requestedRedo, submit } from './fast-import.mjs'
import { OCR_SOURCE_REFERENCES_PRODUCER_VERSION as version } from './ocr-source-references-version.mjs'
import { OCR_SOURCE_REFERENCES_PRODUCER_VERSION as producerVersion } from './ocr-proofread.mjs'
import { PAPER_PAGINATION_PLAN_FILE_NAME } from '../../server/paper-import/paginationPlan.mjs'
import { uploadReviewBundle } from './lib-review-upload.mjs'
import { finalizeProjection } from '../../server/import-review/finalizeComputation.mjs'
import { reviewBundleDigest } from '../../server/import-review/importReviewStore.mjs'
import { sha256, digestJson } from '../../shared/paper-canonical/stable.mjs'
import { listeningReviewSubject, readListeningReview } from '../../server/paper-import/listeningReview.mjs'
import { importCanonicalCandidate } from '../../shared/paper-canonical/compiler.mjs'
import { buildNck1SealedReviewProjection, loadNck1ReviewSource } from '../../server/import-review/revisionProjection.mjs'
import { productInputDigest } from '../../server/paper-import/frozenProducts.mjs'
import { expectedListeningReadings } from './lib-listening-segment-rule.mjs'
import { alignListeningSentences } from './listening-sentence-align.mjs'
import { buildLocalReviewProjection, reviewManifest } from './review.mjs'
import { prebindReviewFixtureReferences } from '../lib/syntheticReviewAnswerFixture.mjs'
import { SOURCE_INSTRUCTION_SLOTS } from '../../shared/paper-canonical/sourcePresentation.mjs'

const downstream = ['source-references', 'pagination-run', 'pagination-plan', 'freeze', 'pdf-qa']

test('an omitted repeated opening cannot claim the closing Right from the first reading', () => {
  const document = { listening: { transcript: [{
    segmentId: 's', text: 'Right. We can meet later. Right.', instruction: '读两遍', questionNumbers: [6],
  }] } }
  const review = { groups: [{ segmentId: 's', playback: { startSeconds: 0, endSeconds: 20 } }] }
  const word = (text, start, duration) => ({ text, start, end: start + duration })
  const segments = [word('Right.', 1, .4), word('We can meet later.', 3, 2), word('Right.', 8, .4),
    word('We can meet later.', 13, 2), word('Right.', 17, .4)]
  const align = segments => alignListeningSentences({ document, review,
    apple: { startSeconds: 0, endSeconds: 20, segments } }).segments[0]
  assert.equal(align(segments).degraded, true)
  segments.splice(3, 0, word('Right.', 11.004, .4))
  const complete = align(segments)
  assert.equal(complete.degraded, false)
  assert.deepEqual(complete.sentences[0].passes.map(({ start, end }) => [start, end]), [[1, 1.4], [11, 11.4]])
})

for (const mode of ['preserves all other bundle bytes', 'rejects a newer revision before writing',
  'rejects files inconsistent with the original manifest']) test(`hydrated listening-only redo ${mode}`, async t => {
  const stale = mode.includes('newer revision'), mismatch = mode.includes('original manifest')
  fakeReviewOrigin(t)
  const { dir, ctx } = fixture(t)
  ctx.state = { paperId: ctx.paperId, steps: {}, background: {}, data: {} }
  rmSync(ctx.statePath)
  const restore = { schemaVersion: 'review-restore-v1', paperId: ctx.paperId,
    origin: 'http://127.0.0.1:18890', revisionId: 'rev-hydrated', bundleDigest: `sha256:${'1'.repeat(64)}` }
  const bindingPath = path.resolve(import.meta.dirname, '../../.amp/import-review-origin')
  const binding = fs.existsSync(bindingPath) ? readFileSync(bindingPath, 'utf8').trim() : ''
  if (binding && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/u.test(binding)) restore.origin = new URL(binding).origin
  json(path.join(ctx.paperDir, 'paragraph-summaries-v1.json'), { retained: 'summaries' })
  json(path.join(ctx.paperDir, 'public-search-metadata-v1.json'), { retained: 'metadata' })
  json(path.join(ctx.paperDir, 'listening-review-v1.json'), { method: 'agent_asr_comparison', old: true })
  const stagedListening = path.join(ctx.paperDir, 'analysis-listening.json')
  const theirTeaching = { materials: { s: { segmentId: 's', summaryZh: '保留原讲解' } } }
  json(stagedListening, { materials: { s: { ...theirTeaching.materials.s, sentences: [{ id: 'old' }] } } })
  const descriptors = () => Object.entries(snapshot(ctx.paperDir)).filter(([name]) => !name.startsWith('signals/'))
    .map(([name, hex]) => ({ path: name, sha256: sha256(Buffer.from(hex, 'hex')),
      byteLength: hex.length / 2, mediaType: 'application/json', role: name === 'config.json' ? 'config' : 'evidence' }))
  const legacyDigest = productInputDigest(ctx.paperDir, descriptors(), null, { legacy: true })
  json(path.join(ctx.paperDir, 'products/manifest-v1.json'), { inputDigest: legacyDigest })
  const manifest = { schemaVersion: 'web-import-review-bundle-v3', paperId: ctx.paperId, files: descriptors() }
  const printDigest = productInputDigest(ctx.paperDir, manifest.files)
  assert.notEqual(legacyDigest, printDigest)
  restore.bundleDigest = reviewBundleDigest(manifest)
  json(path.join(ctx.paperDir, 'signals/review-restore.json'), restore)
  const status = { ...JSON.parse(fakeStatus(ctx, [{ id: stale ? 'rev-new' : restore.revisionId,
    state: 'changes_requested', bundleDigest: restore.bundleDigest, manifest }])),
    issues: [{ id: 'issue-listening', paperId: ctx.paperId, state: 'open' }] }
  const before = snapshot(dir), bundle = snapshot(ctx.paperDir)
  const calls = []
  const options = {
    readStatus: async () => JSON.stringify(status),
    inputs: () => Object.fromEntries(Object.entries(snapshot(ctx.paperDir)).filter(([name]) =>
      !['listening-review-v1.json', 'analysis-listening.json'].includes(name))),
    inputDigest: () => printDigest,
    ensureAsr: async () => 'apple-evidence',
    execute: async (_ctx, label) => {
      calls.push(label)
      if (label === 'freeze') assert.fail('print-neutral change must retain frozen PDF')
      return label === 'listening-segment-v2' ? { attempt: 'fresh', review: 'fresh-review' } : {}
    },
    install: async () => {
      assert(!fs.existsSync(path.join(ctx.paperDir, 'listening-review-v1.json')), 'old AI review must be removed')
      json(path.join(ctx.paperDir, 'listening-review-v1.json'), { fresh: true })
      return { groups: 10 }
    },
    qa: async () => ({ dir: 'actual-qa' }),
  }
  const run = () => listeningRedo(ctx, ['--feedback-fix', 'issue-listening'], options)
  if (stale) {
    await assert.rejects(run, /最新修订/)
    assert.deepEqual(snapshot(dir), before)
    assert.deepEqual(calls, [])
  } else if (mismatch) {
    const file = path.join(ctx.paperDir, 'public-search-metadata-v1.json')
    const original = readFileSync(file)
    json(file, { changed: true })
    await assert.rejects(run, /文件哈希不匹配：public-search-metadata-v1.json/)
    assert.deepEqual(calls, [])
    writeFileSync(file, original)
    json(path.join(ctx.paperDir, 'products/answerOnly.pdf'), { changed: true })
    await assert.rejects(run, /文件哈希不匹配：products\/answerOnly.pdf/)
  } else {
    const staleSentenceStep = ctx.state.steps['listening-sentences'] = completed({ stale: true })
    await run()
    assert.notEqual(ctx.state.steps['listening-sentences'], staleSentenceStep)
    delete bundle['listening-review-v1.json']
    const after = snapshot(ctx.paperDir)
    delete after['listening-review-v1.json']
    delete bundle['analysis-listening.json']
    delete after['analysis-listening.json']
    assert.deepEqual(after, bundle)
    assert.deepEqual(JSON.parse(readFileSync(stagedListening)), theirTeaching)
    assert.equal(ctx.state.steps['listening-redo-products'].result.refrozen, false)
    assert(!ctx.state.steps['source-references'], 'must not invent authoring history')
    assert(!ctx.state.steps.freeze, 'must not invent a freeze')
    await run()
    assert.deepEqual(calls, ['prepare-listening-review', 'listening-segment-v2'])
    json(stagedListening, { materials: { s: { segmentId: 's', summaryZh: '改过讲解' } } })
    await assert.rejects(run, /文件哈希不匹配：analysis-listening.json/)
  }
})

test('hydrated listening-only redo submit rejects invalid or unordered step times', async t => {
  const { dir, ctx } = fixture(t)
  const names = ['listening-redo-request', 'listening-redo-segment', 'listening-redo-install',
    'listening-redo-products', 'pdf-qa']
  ctx.state.data.listeningRedo = {}
  const before = snapshot(dir)
  for (const name of names) for (const invalid of [true, 'not-a-date', '2025-01-01T00:00:00Z']) {
    for (const step of names) ctx.state.steps[step] = completed({})
    ctx.state.steps[name].finishedAt = invalid
    await assert.rejects(() => submit(ctx, []), error => {
      assert.equal(error.code, 'SOURCE_REFERENCES_QA_REQUIRED')
      assert(error.message.includes(name))
      return true
    })
    assert.deepEqual(snapshot(dir), before)
    assert(!ctx.state.steps.push)
  }
})
const oldTime = '2026-01-01T00:00:00.000Z'

function fakeReviewOrigin(t) {
  const runtimeState = path.resolve(import.meta.dirname, '../../imports/local-review/state.json')
  const original = fs.readFileSync
  fs.readFileSync = (file, ...args) => String(file) === runtimeState
    ? JSON.stringify({ apiOrigin: 'http://127.0.0.1:18890' }) : original(file, ...args)
  syncBuiltinESMExports()
  t.after(() => { fs.readFileSync = original; syncBuiltinESMExports() })
}

function fakeStatus(ctx, candidates = []) {
  const revisions = candidates.map(revision => ({ paperId: ctx.paperId, reviewKind: 'candidate', ...revision }))
  return JSON.stringify({ paperId: ctx.paperId, latestRevisionId: revisions.at(-1)?.id ?? null,
    latest: revisions.at(-1) ?? null, revisions })
}

function failedPush(ctx, attemptId = '11111111-1111-4111-8111-111111111111', message = '500 SOURCE_REFERENCES_PRODUCER_VERSION_INVALID rejected') {
  ctx.state.steps.push = { startedAt: message.startsWith('500 SOURCE_') ? oldTime : new Date().toISOString(), attemptId }
  json(ctx.statePath, ctx.state)
  const file = path.join(ctx.logs, `push-${attemptId}.log`)
  mkdirSync(ctx.logs, { recursive: true })
  appendFileSync(path.join(ctx.fast, 'push-attempts.jsonl'), `${JSON.stringify({ paperId: ctx.paperId, ...ctx.state.steps.push })}\n`)
  writeFileSync(file, `${JSON.stringify({ type: 'fast-push-attempt-v1', paperId: ctx.paperId, ...ctx.state.steps.push })}\n$ review push\n--- stderr\n${message}\n${JSON.stringify({ type: 'fast-push-exit-v1', attemptId, code: 1, signal: null })}\n`)
  return file
}

function legacyPush(ctx, startedAt = oldTime) {
  ctx.state.steps.push = { startedAt }
  json(ctx.statePath, ctx.state)
  mkdirSync(ctx.logs, { recursive: true })
  const file = path.join(ctx.logs, 'push.log')
  writeFileSync(file, 'IMPORT_REVIEW_SIZE_INVALID\n')
  return file
}
const completed = result => ({ startedAt: oldTime, finishedAt: oldTime, seconds: 0, result })
const json = (file, value) => {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(value))
}
function snapshot(dir) {
  return Object.fromEntries(readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name)
    return entry.isDirectory()
      ? Object.entries(snapshot(file)).map(([name, bytes]) => [`${entry.name}/${name}`, bytes])
      : [[entry.name, readFileSync(file).toString('hex')]]
  }))
}
function fixture(t, referencesVersion = version) {
  const scratch = path.resolve(import.meta.dirname, '../../.scratch')
  mkdirSync(scratch, { recursive: true })
  const dir = mkdtempSync(path.join(scratch, 'fast-references-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const ctx = {
    paperId: 'paper-synthetic-references', paperDir: path.join(dir, 'paper'), work: path.join(dir, 'work'),
    fast: path.join(dir, 'work/fast'), logs: path.join(dir, 'work/fast/logs'),
    statePath: path.join(dir, 'work/fast/state.json'),
    state: { steps: {}, background: {}, data: {} },
  }
  ctx.state.paperId = ctx.paperId
  for (const name of ['summaries', 'search-metadata', 'ocr-correction-report', 'spelling', 'ocr-review']) {
    ctx.state.steps[name] = completed({ revisionId: name === 'ocr-review' ? 'rev-sealed-ocr' : undefined })
  }
  const results = {
    'source-references': { producerVersion: referencesVersion, outline: [] },
    'pagination-run': { candidateDigest: 'old-candidate' }, 'pagination-plan': { economy8: { pages: 8 } },
    freeze: { largeNoListening: 10, economy8: 8, answerOnly: 2 }, 'pdf-qa': { dir: 'old-qa' },
  }
  for (const name of downstream) ctx.state.steps[name] = completed(results[name])
  json(path.join(ctx.paperDir, 'config.json'), { listening: 'absent-by-exam-design' })
  const sealed = ['nck1-ocr-source-evidence-v1.json', 'nck1-ocr-source-confirmation-v1.json',
    'agent-proofreading-receipt.json', 'nck1-ocr-materialization-producer-receipt-v1.json',
    'nck1-source-materialization-v1.json']
  for (const name of sealed) json(path.join(ctx.paperDir, 'materialization', name), { retained: name, confirmed: true })
  json(path.join(ctx.paperDir, 'signals/agent-proofreading-receipt.json'), { revisionId: 'rev-sealed-ocr' })
  json(path.join(ctx.work, 'proofread-input.json'), { sealed: 'unchanged input' })
  for (const file of ['source-references-v1.json', PAPER_PAGINATION_PLAN_FILE_NAME, 'products/answerOnly.pdf']) {
    json(path.join(ctx.paperDir, file), { old: file, ...(file === 'source-references-v1.json'
      ? { groups: [], ...(typeof referencesVersion === 'string' ? { producerVersion: referencesVersion } : {}) } : {}) })
  }
  json(path.join(ctx.fast, 'pagination/economy8/report.json'), { old: true })
  // Real uploader timing shape: OCR push writes this same untyped timeline as Candidate push.
  json(path.join(ctx.fast, 'upload-timeline.jsonl'), { paperId: ctx.paperId, startedAt: oldTime,
    manifestFiles: 3, uploadedFiles: 3, uploadedBytes: 120, putSeconds: 0.1, putWallSeconds: 0.1,
    putAttempts: 3, putRetries: 0, finalizeSeconds: 0.1, putMode: 'parallel', putConcurrency: 4, completed: true })
  for (const product of ['largeComplete', 'largeNoListening', 'economy8', 'answerOnly']) {
    json(path.join(ctx.work, `handoff/qa/contact-${product}.png`), { retained: product })
    json(path.join(ctx.work, `handoff/qa/${product}.txt`), { retained: product })
  }
  json(path.join(ctx.work, 'handoff/qa/answer-key-comparison.json'), { upstream: true })
  json(path.join(ctx.work, 'handoff/qa/screen-tile-00.png'), { screen: true })
  json(ctx.statePath, ctx.state)
  const calls = []
  const referenceStages = Object.fromEntries(downstream.map(name => [name, async () => {
    calls.push(name)
    if (name === 'source-references') {
      json(path.join(ctx.work, 'source-references-draft.json'), { producerVersion: version, groups: [] })
      json(path.join(ctx.paperDir, 'source-references-v1.json'), { producerVersion: version, groups: [] })
      return { producerVersion: version, outline: [] }
    }
    if (name === 'pagination-plan') json(path.join(ctx.paperDir, PAPER_PAGINATION_PLAN_FILE_NAME), { regenerated: true })
    if (name === 'freeze') json(path.join(ctx.paperDir, 'products/answerOnly.pdf'), { regenerated: true })
    return name === 'pdf-qa' ? { dir: 'new-qa' } : { regenerated: true }
  }]))
  return { dir, ctx, calls, options: { referenceStages } }
}

test('local enrichment and finalize replay only byte-identical sealed source references', async t => {
  const { dir } = fixture(t)
  const previous = process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY
  process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY = '1'
  const { makeReviewRoot } = await import('../verify-universal-nck1-publish.mjs').finally(() => {
    if (previous === undefined) delete process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY
    else process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY = previous
  })
  const { reviewRoot, projection } = makeReviewRoot(dir)
  const manifest = reviewManifest(reviewRoot, projection, [], 'historical-references-fixture')
  const file = path.join(reviewRoot, 'source-references-v1.json')
  const references = JSON.parse(readFileSync(file))
  delete references.producerVersion
  json(file, references)
  const bytes = readFileSync(file)
  Object.assign(manifest.files.find(file => file.path === 'source-references-v1.json'),
    { sha256: sha256(bytes), byteLength: bytes.length })
  manifest.bundleDigest = reviewBundleDigest(manifest)
  const revision = { ...manifest, manifest, id: 'rev-historical-references', state: 'ready',
    reviewKind: 'candidate', finalizedAt: oldTime }
  const baseline = path.join(dir, 'baseline')
  fs.cpSync(reviewRoot, baseline, { recursive: true })
  const finalize = () => finalizeProjection(reviewRoot, {
    ...revision, id: 'rev-new-references', state: 'uploading', finalizedAt: null,
    manifest: { ...manifest, expectedBaseRevisionId: revision.id },
    evidenceBase: { revision, directory: baseline },
  })
  json(path.join(reviewRoot, 'signals/review-restore.json'), { schemaVersion: 'review-restore-v1',
    origin: process.env.QUESTION_BANK_IMPORT_OPS_ORIGIN || 'http://127.0.0.1:18890',
    paperId: revision.paperId, revisionId: revision.id, bundleDigest: revision.bundleDigest, sealedRevision: revision })
  const project = () => buildLocalReviewProjection(reviewRoot, { replayReferencesFromRevisionId: revision.id })
  assert.deepEqual(project().sourceReferencesBytes, bytes)
  await t.test('finalize accepts unchanged sealed reference bytes', () => {
    assert.deepEqual(finalize().sourceReferencesBytes, bytes)
  })
  appendFileSync(file, ' ')
  assert.throws(project, { code: 'SOURCE_REFERENCES_PRODUCER_VERSION_INVALID' })
  await t.test('finalize rejects changed reference bytes missing the producer version', () => {
    assert.throws(finalize, { code: 'SOURCE_REFERENCES_PRODUCER_VERSION_INVALID' })
  })
})

for (const [edit, expectation] of [
  ['stem', 'retains installed v2 listening evidence after a non-listening stem edit'],
  ['option', 'reruns the listening rule for an edited option using the original ASR'],
  ['legacy', 'reruns the listening rule when the old report has no rule summary'],
  ['reading', 'retains the listening rule after a reading instruction changes'],
]) test(`finish ${expectation}`, async t => {
  const editOption = edit === 'option', legacy = edit === 'legacy', rerun = editOption || legacy
  const { dir, ctx, options } = fixture(t)
  const { makeReviewRoot } = await (async () => {
    const previous = process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY
    process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY = '1'
    try { return await import('../verify-universal-nck1-publish.mjs') } finally {
      if (previous === undefined) delete process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY
      else process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY = previous
    }
  })()
  if (rerun) ctx.paperId = `paper-synthetic-listening-rule-${edit}-${process.pid}`
  let { reviewRoot, projection } = makeReviewRoot(path.join(dir, 'actual'), ctx.paperId, undefined, {
    listening: true, openingListeningText: editOption
      ? 'Blue dolphins travel beyond distant islands while young sailors carefully study maps beside the harbor and curious children quietly gather orange leaves around their peaceful village during bright summer holidays'
      : undefined,
  })
  ctx.paperDir = reviewRoot
  if (rerun) {
    const cliRoot = path.join(import.meta.dirname, 'papers', ctx.paperId)
    symlinkSync(reviewRoot, cliRoot, 'dir')
    t.after(() => rmSync(cliRoot))
  }
  const materializationFile = path.join(reviewRoot, 'materialization/nck1-source-materialization-v1.json')
  const materialization = JSON.parse(readFileSync(materializationFile))
  if (edit === 'reading') {
    const source = materialization.groups[0].blocks[0].source
    materialization.schemaVersion = 'nck1-source-materialization-v4'
    materialization.sourcePresentation = {
      instructions: Object.keys(SOURCE_INSTRUCTION_SLOTS).map(slotId => ({
        slotId, text: slotId.startsWith('listening.') ? '每段录音读一遍。' : 'Source instruction.', source,
      })),
      listeningExample: { state: 'not_supplied', source },
    }
    json(materializationFile, materialization)
    const loaded = loadNck1ReviewSource(reviewRoot)
    projection = { ...loaded, ...importCanonicalCandidate(loaded.sourceInput) }
    assert.deepEqual(projection.issues, [])
  }
  const transcript = projection.materialization.listening.transcript
  const subject = listeningReviewSubject(projection, projection.candidate)
  const asrPath = 'listening-review-evidence/original-apple.json'
  const notePath = 'listening-review-evidence/original-rule.json'
  const putEvidence = (relative, value, kind, window = null, settings = null) => {
    const file = path.join(reviewRoot, relative)
    json(file, value)
    const bytes = readFileSync(file)
    return { path: relative, sha256: sha256(bytes), byteLength: bytes.length, kind, window, settings }
  }
  const words = transcript[0].text.toLowerCase().match(/[a-z]+/gu).map(word => word === 'dolphins' ? 'porpoises' : word)
  const playbackEnd = edit === 'reading' ? 1 + words.length / 5 : 2
  const asr = putEvidence(asrPath, { audioSha256: subject.playbackAudioSha256, startSeconds: 0, endSeconds: subject.durationSeconds,
    result: { segments: [{ text: words.join(' '), start: 1, end: 1 + words.length / 5,
      words: words.map((word, index) => ({ word, start: 1 + index / 5, end: 1 + (index + 1) / 5 })) }] } },
    'asr_window', { startSeconds: 0, endSeconds: subject.durationSeconds },
    { engine: edit === 'reading' ? 'Apple fixture' : 'fixture', model: 'fixture', language: 'en', vad: false, computeType: 'fixture' })
  const groups = transcript.map(({ segmentId, questionNumbers }, index) => ({
    segmentId, questionNumbers, decision: index ? 'blocked' : 'usable', reason: 'fixture comparison',
    limits: [], playback: index ? null : { startSeconds: 1, endSeconds: playbackEnd },
    occurrences: index ? [] : [{ startSeconds: 1, endSeconds: playbackEnd, evidencePaths: [asrPath] }],
  }))
  const rule = { version: 'fixture', normalizationVersion: 'fixture', fuzzyAnchorsEnabled: editOption }
  const normalization = { fixture: true }
  const hash = digestJson(null)
  const note = putEvidence(notePath, { schemaVersion: 'listening-rule-evidence-v2', rule, normalization,
    input: { subject, rule, normalization, sourceTextSha256: sha256(JSON.stringify(transcript)),
      audioSha256: subject.playbackAudioSha256, materializationSha256: hash, silenceSha256: hash,
      ruleCodeSha256: hash, adapterSha256: hash,
      instructionsSha256: digestJson(projection.materialization.sourcePresentation?.instructions || []),
      questionsSha256: digestJson(projection.materialization.listening.questions) },
    rawEvidence: [asr], groups: groups.map(({ reason, limits, ...group }, index) => ({
      ...group, occurrences: group.occurrences.map(({ evidencePaths, ...playback }) => ({ playback, evidencePaths })),
      sourceText: transcript[index].text, issues: [], engineAttempts: [],
      sources: expectedListeningReadings(transcript[index], projection.materialization.sourcePresentation?.instructions).sources,
    })), diagnostic: { schemaVersion: 'listening-diagnostics-v1', path: 'diagnostics.json.gz', encoding: 'gzip',
      sha256: hash, byteLength: 1, decodedSha256: hash, decodedByteLength: 1 } }, 'review_notes')
  json(path.join(reviewRoot, 'listening-review-v1.json'), { schemaVersion: legacy ? 'listening-review-v1' : 'listening-review-v2',
    subject, reviewedBy: 'import_agent', reviewedAt: oldTime, method: 'asr_source_comparison',
    untrustedContentHandledAsData: true, scope: { purpose: 'teacher_navigation',
      verbatim: 'not_certified', wholeRecordingContent: 'not_certified' }, groups, evidence: legacy ? [asr] : [asr, note] })
  if (editOption) materialization.listening.questions[0].options[0].text = 'Porpoises.'
  if (edit === 'stem') materialization.groups[0].questions[0].stem = 'What is the purpose of the notice?'
  if (edit === 'reading') materialization.sourcePresentation.instructions.find(item => item.slotId === 'reading.a').text = 'Choose the best answer.'
  if (!legacy) json(materializationFile, materialization)
  const loaded = loadNck1ReviewSource(reviewRoot)
  const { candidate, issues } = importCanonicalCandidate(loaded.sourceInput)
  assert.deepEqual(issues, [])
  const current = listeningReviewSubject(loaded, candidate)
  if (!legacy) assert.notEqual(current.candidateDigest, subject.candidateDigest)
  const asrStage = ctx.state.steps['asr-apple-rule-v2'] = completed({ retained: true })
  const sentenceStage = ctx.state.steps['listening-sentences'] = completed({ stale: true })
  await finish(ctx, [], options)
  assert.notEqual(ctx.state.steps['listening-sentences'], sentenceStage)
  const { review } = readListeningReview(reviewRoot, current, transcript)
  if (rerun) {
    const attempt = ctx.state.data.listeningSegmentAttempt.attempt
    const ruleInput = JSON.parse(readFileSync(path.join(attempt, 'input.json')))
    assert.equal(ruleInput.inference, 'not_run')
    assert.equal(ruleInput.questionsSha256, digestJson(materialization.listening.questions))
    assert.equal(review.evidence[0].sha256, asr.sha256)
    assert.equal(review.groups[0].decision, 'review_required')
    if (editOption) assert.match(review.groups[0].reason, /FUZZY_ANCHOR_PROTECTED_WORD/u)
  } else {
    assert.deepEqual(review.groups, groups)
    assert.deepEqual(review.evidence[0], asr)
    assert.equal(ctx.state.steps['asr-apple-rule-v2'], asrStage)
  }
  assert.equal(sha256(readFileSync(path.join(reviewRoot, notePath))), note.sha256)
  if (edit === 'reading') {
    prebindReviewFixtureReferences(reviewRoot, { expectedCandidateDigest: candidate.candidateDigest })
    const projection = buildLocalReviewProjection(reviewRoot)
    const asset = projection.analysisSidecars['listening-analysis-v1.json']
    const firstPass = asset.materials[transcript[0].segmentId].sentences[0].passes[0]
    firstPass.start = Number((firstPass.start + .004).toFixed(3))
    const staged = path.join(reviewRoot, 'analysis-listening.json')
    json(staged, asset)
    assert.throws(() => buildLocalReviewProjection(reviewRoot), /sentences must match the program alignment/)

    // Recreate the receipt that the previous aligner would have sealed.
    const bytes = readFileSync(staged)
    const analysisDigest = digestJson(projection.analysisSidecars)
    const manifest = reviewManifest(reviewRoot, { ...projection, analysisDigest }, [], 'historical-sentence-fixture')
    const revision = { id: 'rev-historical-sentences', state: 'ready', reviewKind: 'candidate',
      finalizedAt: oldTime, ...manifest, manifest }
    const replayed = buildNck1SealedReviewProjection(reviewRoot, revision)
    assert.equal(replayed.analysisDigest, analysisDigest)
    assert.deepEqual(replayed.analysisSidecars['listening-analysis-v1.json'], asset)
    assert.deepEqual(readFileSync(staged), bytes)
  }
})

test('after-proofread forwards explicit body width to figure-sizes on resume', t => {
  const paperId = `paper-synthetic-fast-body-width-${process.pid}`
  const paperDir = path.join(import.meta.dirname, 'papers', paperId)
  const work = path.resolve(import.meta.dirname, '../../imports/ocr-proofread', paperId)
  assert(!fs.existsSync(paperDir) && !fs.existsSync(work))
  t.after(() => {
    rmSync(paperDir, { recursive: true, force: true })
    rmSync(work, { recursive: true, force: true })
  })
  json(path.join(paperDir, 'config.json'), { listening: 'absent-by-exam-design' })
  json(path.join(paperDir, 'universal-source-manifest.json'), { documents: [] })
  const materializationPath = path.join(paperDir, 'materialization/nck1-source-materialization-v1.json')
  json(materializationPath, { groups: [], media: [{
    mediaId: 'chart', usage: 'content', presentation: { widthRatio: 1 },
    extraction: { kind: 'pdf_crop', documentId: 'questions', page: 12, region: { width: .4 } },
  }] })
  json(path.join(paperDir, 'materialization/nck1-ocr-source-evidence-v1.json'), { documents: [] })
  const statePath = path.join(work, 'fast/state.json')
  const state = { paperId, steps: Object.fromEntries([
    'flags-present', 'compile', 'ocr-review', 'materialize', 'chinese-numbering', 'presentation',
    'subtitles-watermarks', 'spelling', 'verify', 'answer-check', 'build', 'round2-requests',
  ].map(name => [name, completed({})])), background: {}, data: { summaryParts: [] } }
  json(statePath, state)
  const run = args => spawnSync(process.execPath, [path.join(import.meta.dirname, 'fast-import.mjs'),
    'after-proofread', paperId, ...args], { encoding: 'utf8' })
  const missing = run([])
  assert.notEqual(missing.status, 0)
  assert.match(missing.stderr, /Too few text observations/u)
  const result = run(['--body-width-ratio', '0.785894'])
  assert.equal(result.status, 0, result.stderr)
  assert.equal(JSON.parse(readFileSync(materializationPath)).media[0].presentation.widthRatio, .509)
  assert(JSON.parse(readFileSync(statePath)).steps['figure-sizes'].finishedAt)
  assert.match(readFileSync(path.join(work, 'fast/logs/figure-sizes.log'), 'utf8'),
    /--body-width-ratio 0\.785894/u)
  assert.match(readFileSync(path.join(work, 'pending-declarations.md'), 'utf8'), /当前诊断未发现待声明项/u)
  const sourceFlags = path.join(work, 'source-flags')
  json(path.join(sourceFlags, 'answer-p01.json'), { answers: { 21: 'A' } })
  json(path.join(sourceFlags, 'answer-p02.json'), { answers: { 21: 'B' } })
  const signal = path.join(paperDir, 'signals/ai-answer-check.json')
  json(signal, { ok: true })
  const blocked = run([])
  assert.equal(blocked.status, 2, blocked.stderr)
  assert.match(blocked.stderr, /抄录冲突 21.*材料化漏题 21/u)
  assert.equal(fs.existsSync(signal), false)
  assert.equal(JSON.parse(readFileSync(statePath)).steps['answer-check'], undefined)
  json(materializationPath, { ...JSON.parse(readFileSync(materializationPath)),
    issues: [{ code: 'NCK1_OCR_SOURCE_NUMBER_MISMATCH', path: 'questions.21', source: { page: 4 } }] })
  assert.equal(run([]).status, 2)
  assert.match(readFileSync(path.join(work, 'pending-declarations.md'), 'utf8'), /题号映射[\s\S]*页码　4/u)
})

test('producer and driver import the same pure version constant; current results remain cache hits', async t => {
  assert.equal(version, 'ocr-source-references-producer-v27')
  assert.equal(producerVersion, version)
  const { dir, ctx, calls, options } = fixture(t)
  const before = snapshot(dir)
  await finish(ctx, [], options)
  assert.deepEqual(calls, [])
  assert.deepEqual(snapshot(dir), before)
  assertReferenceProductsReady(ctx)
})

test('essay errata changes invalidate finalized reference cache until declarations match', t => {
  const { ctx } = fixture(t)
  const file = path.join(ctx.work, 'source-reference-text-corrections.json')
  const finalized = path.join(ctx.paperDir, 'source-references-v1.json')
  const entries = [{ paragraphId: 'sample-p1', before: 'popcom', after: 'popcorn', reason: '流传版错字' }]
  json(file, { entries })
  assert.throws(() => assertReferenceProductsReady(ctx), { code: 'SOURCE_REFERENCES_FINISH_REQUIRED' })
  json(finalized, { ...JSON.parse(readFileSync(finalized)), essayTextCorrections: entries })
  assertReferenceProductsReady(ctx)
  json(file, { entries: [{ ...entries[0], reason: '补充原页依据' }] })
  assert.throws(() => assertReferenceProductsReady(ctx), { code: 'SOURCE_REFERENCES_FINISH_REQUIRED' })
  json(file, { entries: [] })
  assert.throws(() => assertReferenceProductsReady(ctx), { code: 'SOURCE_REFERENCES_FINISH_REQUIRED' })
})

for (const profileId of ['national-legacy', 'zhejiang-legacy']) for (const bindingIn of ['state', 'config']) {
  test(`${profileId} authored OCR report from ${bindingIn} requires exact projection before reuse`, async t => {
    const { ctx, calls, options } = fixture(t)
    delete ctx.state.steps['ocr-correction-report']
    if (bindingIn === 'state') ctx.state.data.formatProfileBinding = { profileId }
    else json(path.join(ctx.paperDir, 'config.json'), {
      listening: 'absent-by-exam-design', formatProfileBinding: { profileId },
    })
    const report = path.join(ctx.paperDir, 'agent-ocr-correction-report-v2.json')
    json(report, { entries: [{ category: 'source_layout_error', before: '24.', after: '25.' }] })
    const before = readFileSync(report)
    // The intentionally incomplete source must fail projection, preserving the authored report.
    await assert.rejects(() => finish(ctx, [], options), /universal-source-manifest\.json is missing/u)
    assert.deepEqual(readFileSync(report), before)
    assert.deepEqual(calls, [])
    assert.equal(ctx.state.steps['ocr-correction-report'].finishedAt, undefined)
  })
}

for (const artifact of ['draft', 'finalized']) for (const [shape, value] of [
  ['old group content', { groups: ['OLD_REFERENCE_CONTENT'] }],
  ['missing section', { groups: [{ essays: { entries: [] } }] }],
  ['missing groups', {}],
  ['invalid JSON', '{'],
]) test(`current marker cannot reuse ${artifact} with ${shape}; rebuild retains Candidate guards and sealed OCR`, async t => {
  const { dir, ctx, calls, options } = fixture(t)
  const file = artifact === 'draft' ? path.join(ctx.work, 'source-references-draft.json')
    : path.join(ctx.paperDir, 'source-references-v1.json')
  if (shape === 'invalid JSON') {
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, value)
  } else json(file, value)
  assert.throws(() => assertReferenceProductsReady(ctx), { code: 'SOURCE_REFERENCES_FINISH_REQUIRED' })
  ctx.state.data.candidateRevisionId = 'retained-candidate'
  const before = snapshot(dir)
  await assert.rejects(() => finish(ctx, [], options), { code: 'SOURCE_REFERENCES_RECONCILIATION_REQUIRED' })
  assert.deepEqual(snapshot(dir), before)
  assert.deepEqual(calls, [])
  delete ctx.state.data.candidateRevisionId
  const sealed = snapshot(path.join(ctx.paperDir, 'materialization'))
  await finish(ctx, [], options)
  assert.deepEqual(calls, downstream)
  assert.deepEqual(snapshot(path.join(ctx.paperDir, 'materialization')), sealed)
  assertReferenceProductsReady(ctx)
})

test('first finish after normal push-ocr accepts the shared upload timeline', async t => {
  const { ctx, calls, options } = fixture(t)
  for (const name of downstream) delete ctx.state.steps[name]
  json(ctx.statePath, ctx.state)
  await uploadReviewBundle({
    paperDir: ctx.paperDir,
    manifest: { schemaVersion: 'web-import-ocr-review-bundle-v1', paperId: ctx.paperId, files: [] },
    timelinePath: path.join(ctx.fast, 'upload-timeline.jsonl'),
    resolveReviewFile: () => { throw new Error('empty OCR fixture has no uploads') },
    api: async () => ({ revision: { id: 'rev-sealed-ocr', reviewKind: 'ocr' }, missingFiles: [] }),
  })
  const timeline = readFileSync(path.join(ctx.fast, 'upload-timeline.jsonl'))
  await finish(ctx, [], options)
  assert.deepEqual(calls, downstream)
  assert.deepEqual(readFileSync(path.join(ctx.fast, 'upload-timeline.jsonl')), timeline)
  assert.equal(ctx.state.steps['ocr-review'].result.revisionId, 'rev-sealed-ocr')
  assertReferenceProductsReady(ctx)
})

test('dead loopback binding never invokes a network client or local Review wrapper during finish/redo', t => {
  const { ctx } = fixture(t, 'old-version')
  const input = path.join(ctx.fast, 'test-context.json')
  json(input, ctx)
  const binding = path.resolve(import.meta.dirname, '../../.amp/import-review-origin')
  const moduleUrl = new URL('./fast-import.mjs', import.meta.url).href
  const child = spawnSync(process.execPath, ['--input-type=module', '--eval', `
    import assert from 'node:assert/strict'
    import fs from 'node:fs'
    import cp from 'node:child_process'
    import { syncBuiltinESMExports } from 'node:module'
    const read = fs.readFileSync, exists = fs.existsSync
    const binding = ${JSON.stringify(binding)}
    fs.existsSync = file => String(file) === binding || exists(file)
    fs.readFileSync = (file, ...args) => String(file) === binding
      ? 'http://127.0.0.1:19023' : read(file, ...args)
    let externalCalls = 0
    const external = () => { externalCalls++; throw new Error('unexpected network or Review wrapper') }
    cp.spawn = cp.spawnSync = cp.execFileSync = external
    globalThis.fetch = external
    syncBuiltinESMExports()
    const { finish, requestedRedo } = await import(${JSON.stringify(moduleUrl)})
    const ctx = JSON.parse(read(${JSON.stringify(input)}, 'utf8'))
    await requestedRedo(ctx, 'source-references')
    const referenceStages = Object.fromEntries(${JSON.stringify(downstream)}.map(name => [name, () =>
      name === 'source-references' ? { producerVersion: ${JSON.stringify(version)}, outline: [] }
        : name === 'pdf-qa' ? { dir: 'new-qa' } : {}
    ]))
    await finish(ctx, [], { referenceStages })
    assert.equal(externalCalls, 0)
  `], { encoding: 'utf8', timeout: 30000 })
  assert.equal(child.status, 0, child.stderr || child.stdout)
})

for (const old of ['ocr-source-references-producer-v1', 'ocr-source-references-producer-v16', 'ocr-source-references-producer-v999', undefined]) {
  test(`stale/missing version (${old}) rebuilds downstream once and preserves sealed OCR bytes`, async t => {
    const { ctx, calls, options } = fixture(t, old)
    // Explicit undefined removes the field instead of using fixture's default.
    if (old === undefined) delete ctx.state.steps['source-references'].result.producerVersion
    const before = snapshot(path.join(ctx.paperDir, 'materialization'))
    const input = readFileSync(path.join(ctx.work, 'proofread-input.json'))
    const qaBefore = snapshot(path.join(ctx.work, 'handoff/qa'))
    await finish(ctx, [], options)
    assert.deepEqual(calls, downstream)
    assert.deepEqual(snapshot(path.join(ctx.paperDir, 'materialization')), before)
    assert.deepEqual(readFileSync(path.join(ctx.work, 'proofread-input.json')), input)
    assert.equal(ctx.state.steps['ocr-review'].result.revisionId, 'rev-sealed-ocr')
    const archived = snapshot(path.join(ctx.work, 'superseded'))
    for (const name of ['source-references-v1.json', PAPER_PAGINATION_PLAN_FILE_NAME, 'products/answerOnly.pdf',
      'pagination/economy8/report.json']) assert(Object.keys(archived).some(file => file.endsWith(name)), name)
    for (const [name, bytes] of Object.entries(qaBefore)) {
      if (name === 'answer-key-comparison.json' || name === 'screen-tile-00.png') {
        assert.equal(snapshot(path.join(ctx.work, 'handoff/qa'))[name], bytes)
      } else {
        const retained = Object.keys(archived).find(file => file.endsWith(name))
        assert(retained, name)
        assert.equal(archived[retained], bytes)
      }
    }
    assertReferenceProductsReady(ctx)
    const completedState = readFileSync(ctx.statePath)
    await finish(ctx, [], options)
    assert.deepEqual(calls, downstream, 'second run must reuse every rebuilt step')
    assert.deepEqual(readFileSync(ctx.statePath), completedState)
  })
}

// A completed workspace produced under any supported historical version is a
// cache hit as generated; upgrading the producer never invalidates it.
for (const old of ['ocr-source-references-producer-v17', 'ocr-source-references-producer-v18',
  'ocr-source-references-producer-v21', 'ocr-source-references-producer-v23', 'ocr-source-references-producer-v24',
  'ocr-source-references-producer-v25', 'ocr-source-references-producer-v26']) {
  test(`supported historical version (${old}) stays a cache hit and is submission-ready`, async t => {
    const { dir, ctx, calls, options } = fixture(t, old)
    json(path.join(ctx.paperDir, 'source-references-v1.json'), { producerVersion: old, groups: [] })
    const before = snapshot(dir)
    await finish(ctx, [], options)
    assert.deepEqual(calls, [])
    assert.deepEqual(snapshot(dir), before)
    assertReferenceProductsReady(ctx)
  })
}

// Any declared-version mismatch across state, draft and finalized sidecar is
// stale and rebuilds, even when both versions are individually supported.
for (const [stateVersion, fileVersion] of [
  ['ocr-source-references-producer-v26', 'ocr-source-references-producer-v25'],
  ['ocr-source-references-producer-v25', 'ocr-source-references-producer-v26'],
]) test(`state/file version mismatch (${stateVersion} vs ${fileVersion}) rebuilds`, async t => {
  const { ctx, calls, options } = fixture(t, stateVersion)
  json(path.join(ctx.paperDir, 'source-references-v1.json'), { producerVersion: fileVersion, groups: [] })
  await finish(ctx, [], options)
  assert.deepEqual(calls, downstream)
  assert.equal(ctx.state.steps['source-references'].result.producerVersion, version)
  assertReferenceProductsReady(ctx)
})

test('redo from chinese-numbering retains materialization and immutable OCR, invalidates reports and digests', async t => {
  const { ctx } = fixture(t)
  const before = snapshot(path.join(ctx.paperDir, 'materialization'))
  json(path.join(ctx.paperDir, 'agent-ocr-correction-report-v2.json'), { finalized: true })
  ctx.state.steps['chinese-numbering'] = completed({ changes: [] })
  await requestedRedo(ctx, 'chinese-numbering')
  assert.deepEqual(snapshot(path.join(ctx.paperDir, 'materialization')), before)
  assert(ctx.state.steps['ocr-review'])
  for (const name of ['chinese-numbering', 'spelling', 'ocr-correction-report', ...downstream]) {
    assert(!ctx.state.steps[name], name)
  }
  assert(!Object.hasOwn(snapshot(ctx.paperDir), 'agent-ocr-correction-report-v2.json'))
})

test('redo after a title edit retains the installed listening review and its ASR attempt', async t => {
  const { ctx } = fixture(t)
  const config = path.join(ctx.paperDir, 'config.json')
  json(config, { provenance: { paperName: '新卷名' } })
  const listening = path.join(ctx.paperDir, 'listening-review-v1.json')
  json(listening, { review: 'retained' })
  const before = readFileSync(listening)
  ctx.state.data.listeningSegmentAttempt = { review: 'retained-attempt.json' }
  ctx.state.steps['asr-apple-rule-v2'] = completed({})
  ctx.state.steps['listening-review'] = completed({})
  await requestedRedo(ctx, 'build')
  assert.deepEqual(readFileSync(listening), before)
  assert.deepEqual(ctx.state.data.listeningSegmentAttempt, { review: 'retained-attempt.json' })
  assert(ctx.state.steps['asr-apple-rule-v2'])
  assert(ctx.state.steps['listening-review'])
  assert(!ctx.state.steps.freeze, 'printed title affects the PDFs')
})

for (const redo of ['search-metadata', 'asr-apple-rule-v2']) {
  test(`redo of ${redo} retains pagination and frozen PDFs`, async t => {
    const { ctx } = fixture(t)
    ctx.state.steps[redo] = completed({})
    const products = snapshot(path.join(ctx.paperDir, 'products'))
    const printSteps = Object.fromEntries(downstream.map(name => [name, ctx.state.steps[name]]))
    await requestedRedo(ctx, redo)
    assert(!ctx.state.steps[redo])
    assert.deepEqual(snapshot(path.join(ctx.paperDir, 'products')), products)
    assert.deepEqual(Object.fromEntries(downstream.map(name => [name, ctx.state.steps[name]])), printSteps)
  })
}

for (const interrupted of ['source-references', 'pagination-plan', 'freeze', 'pdf-qa']) {
  test(`finish resumes after interruption in ${interrupted}`, async t => {
    const { ctx, calls, options } = fixture(t, 'old-version')
    const before = snapshot(path.join(ctx.paperDir, 'materialization'))
    const original = options.referenceStages[interrupted]
    options.referenceStages[interrupted] = async () => { throw new Error('synthetic interrupted stage') }
    await assert.rejects(() => finish(ctx, [], options), /synthetic interrupted stage/)
    assert(!ctx.state.steps[interrupted].finishedAt)
    for (const name of downstream.slice(downstream.indexOf(interrupted) + 1)) assert(!ctx.state.steps[name], name)
    await assert.rejects(() => submit(ctx, []), { code: interrupted === 'source-references'
      ? 'SOURCE_REFERENCES_FINISH_REQUIRED' : 'SOURCE_REFERENCES_QA_REQUIRED' })
    options.referenceStages[interrupted] = original
    // Resume from disk as a fresh process would.
    ctx.state = JSON.parse(readFileSync(ctx.statePath, 'utf8'))
    await finish(ctx, [], options)
    assert.deepEqual(calls, downstream)
    assertReferenceProductsReady(ctx)
    assert.deepEqual(snapshot(path.join(ctx.paperDir, 'materialization')), before)
  })
}

for (const marker of ['push', 'local-preview', 'screen', 'local-screen']) {
  for (const finished of [false, true]) test(`${marker} ${finished ? 'completed' : 'started-only'} evidence blocks stale invalidation before any writes`, async t => {
    const { dir, ctx, options } = fixture(t, 'old-version')
    ctx.state.steps[marker] = finished ? completed({ revisionId: 'rev-candidate' }) : { startedAt: oldTime }
    json(ctx.statePath, ctx.state)
    const before = snapshot(dir), state = structuredClone(ctx.state)
    const stateBytes = readFileSync(ctx.statePath)
    await assert.rejects(() => finish(ctx, ['--economy-page-limit', '9'], options),
      { code: 'SOURCE_REFERENCES_RECONCILIATION_REQUIRED' })
    assert.deepEqual(snapshot(dir), before)
    assert.deepEqual(ctx.state, state)
    assert.deepEqual(readFileSync(ctx.statePath), stateBytes)
  })
}

for (const name of ['source-references', 'pagination-run', 'pdf-qa']) {
  for (const current of [true, false]) for (const marker of ['push', 'local-preview', 'screen', 'local-screen']) {
    for (const finished of [false, true]) test(`explicit redo from ${name} (${current ? 'current' : 'old'} references) retains ${marker} ${finished ? 'completed' : 'started-only'} evidence`, async t => {
      const { dir, ctx } = fixture(t, current ? version : 'old-version')
      ctx.state.steps[marker] = finished ? completed({ revisionId: 'rev-candidate' }) : { startedAt: oldTime }
      json(ctx.statePath, ctx.state)
      const before = snapshot(dir), state = structuredClone(ctx.state)
      const stateBytes = readFileSync(ctx.statePath)
      await assert.rejects(() => requestedRedo(ctx, name),
        { code: 'SOURCE_REFERENCES_RECONCILIATION_REQUIRED' })
      assert.deepEqual(snapshot(dir), before)
      assert.deepEqual(ctx.state, state)
      assert.deepEqual(readFileSync(ctx.statePath), stateBytes)
    })
  }
}

for (const redo of ['source-references', 'freeze']) test(`feedback fix from ${redo} retains staged lectures and archives submission evidence`, async t => {
  const { ctx, calls, options } = fixture(t)
  ctx.state.steps.push = completed({ revisionId: 'rev-returned' })
  ctx.state.steps.screen = completed({ url: 'old-screen' })
  Object.assign(ctx.state.data, { candidateRevisionId: 'rev-returned', revisionId: 'rev-returned', localReport: 'old', status: 'reported' })
  json(path.join(ctx.work, 'handoff/evidence.json'), { revisionId: 'rev-returned' })
  json(ctx.statePath, ctx.state)
  const before = readFileSync(ctx.statePath)
  const analysis = path.join(ctx.paperDir, 'analysis-reading-a.json')
  json(analysis, { retained: 'new staged lecture' })
  const status = { ...JSON.parse(fakeStatus(ctx, [{ id: 'rev-returned', state: 'changes_requested' }])),
    issues: [{ id: 'issue-1', paperId: ctx.paperId, state: 'open' }] }
  await finish(ctx, ['--feedback-fix', 'issue-1', '--redo-from', redo],
    { ...options, readStatus: async () => JSON.stringify(status) })
  assert.deepEqual(calls, downstream.slice(downstream.indexOf(redo)))
  assert.equal(JSON.parse(readFileSync(analysis)).retained, 'new staged lecture')
  assert.equal(ctx.state.data.feedbackFix.baseRevisionId, 'rev-returned')
  assert.deepEqual(ctx.state.data.feedbackFix.issues, ['issue-1'])
  for (const name of ['candidateRevisionId', 'revisionId', 'localReport', 'status']) assert(!ctx.state.data[name], name)
  assert(!ctx.state.steps.push && !ctx.state.steps.screen)
  const archived = snapshot(path.join(ctx.work, 'superseded'))
  assert(Object.entries(archived).some(([file, bytes]) => file.endsWith('state.json') && bytes === before.toString('hex')))
  for (const suffix of ['evidence.json', 'products/answerOnly.pdf', 'screen-tile-00.png']) {
    assert(Object.keys(archived).some(file => file.endsWith(suffix)), suffix)
  }
})

test('feedback fix restores an exact hydrated Candidate without fast state and fails closed on mismatches', async t => {
  fakeReviewOrigin(t)
  for (const invalid of [null, 'bundle', 'revision', 'paper', 'origin', 'schema', 'kind', 'state', 'issue', 'unknown', 'local-base', 'missing-digest']) {
    const { dir, ctx, calls, options } = fixture(t)
    ctx.state = { paperId: ctx.paperId, steps: {}, background: {}, data: {} }
    rmSync(ctx.statePath)
    const restore = { schemaVersion: 'review-restore-v1', paperId: ctx.paperId, origin: 'http://127.0.0.1:18890',
      revisionId: 'rev-returned', bundleDigest: `sha256:${'1'.repeat(64)}` }
    const status = { ...JSON.parse(fakeStatus(ctx, [{ id: 'rev-returned', state: 'changes_requested',
      bundleDigest: restore.bundleDigest }])), issues: [{ id: 'issue-1', paperId: ctx.paperId, state: 'open' }] }
    if (invalid === 'bundle') restore.bundleDigest = `sha256:${'2'.repeat(64)}`
    if (invalid === 'revision') restore.revisionId = 'rev-stale'
    if (invalid === 'paper') restore.paperId = 'paper-other'
    if (invalid === 'origin') restore.origin = 'https://other.example'
    if (invalid === 'schema') restore.schemaVersion = 'unknown'
    if (invalid === 'kind') status.latest.reviewKind = 'ocr'
    if (invalid === 'state') status.latest.state = 'awaiting_review'
    if (invalid === 'issue') status.issues[0].paperId = 'paper-other'
    if (invalid === 'unknown') ctx.state.steps.push = { startedAt: oldTime }
    if (invalid === 'local-base') ctx.state.data.candidateRevisionId = 'rev-other'
    if (invalid === 'missing-digest') delete restore.bundleDigest
    const restorePath = path.join(ctx.paperDir, 'signals/review-restore.json')
    json(restorePath, restore)
    const before = snapshot(dir), state = structuredClone(ctx.state)
    const run = () => finish(ctx, ['--feedback-fix', 'issue-1', '--redo-from', 'source-references'],
      { ...options, readStatus: async () => JSON.stringify(status) })
    if (invalid) {
      await assert.rejects(run, /feedback-fix|RECONCILIATION_REQUIRED/)
      assert.deepEqual(snapshot(dir), before)
      assert.deepEqual(ctx.state, state)
    } else {
      // No fast state also means no authored-summary cache; stop at the first rebuild input.
      await assert.rejects(run, { code: 'ENOENT', path: path.join(ctx.fast, 'summaries-request.json') })
      assert.deepEqual(calls, [])
      assert.equal(ctx.state.data.feedbackFix.baseRevisionId, restore.revisionId)
      assert.equal(ctx.state.data.feedbackFix.bundleDigest, restore.bundleDigest)
      assert.deepEqual(JSON.parse(readFileSync(restorePath)), restore)
      await requestedRedo(ctx, 'source-references')
      json(restorePath, { ...restore, bundleDigest: `sha256:${'3'.repeat(64)}` })
      await assert.rejects(() => requestedRedo(ctx, 'source-references'),
        { code: 'SOURCE_REFERENCES_RECONCILIATION_REQUIRED' })
    }
  }
})

test('feedback fix rejects wrong state, revision, issue or UNKNOWN push without local changes', async t => {
  for (const invalid of ['state', 'revision', 'issue', 'unknown', 'missing-redo']) {
    const { dir, ctx, options } = fixture(t)
    ctx.state.steps.push = invalid === 'unknown' ? { startedAt: oldTime } : completed({ revisionId: 'rev-returned' })
    json(ctx.statePath, ctx.state)
    const before = snapshot(dir), state = structuredClone(ctx.state)
    const status = { ...JSON.parse(fakeStatus(ctx, [{ id: invalid === 'revision' ? 'rev-other' : 'rev-returned',
      state: invalid === 'state' ? 'awaiting_review' : 'changes_requested' }])),
      issues: [{ id: 'issue-1', paperId: ctx.paperId, state: invalid === 'issue' ? 'closed' : 'open' }] }
    await assert.rejects(() => finish(ctx, ['--feedback-fix', 'issue-1',
      ...(invalid === 'missing-redo' ? [] : ['--redo-from', 'source-references'])],
    { ...options, readStatus: async () => JSON.stringify(status) }), /feedback-fix|RECONCILIATION_REQUIRED/)
    assert.deepEqual(snapshot(dir), before)
    assert.deepEqual(ctx.state, state)
  }
})

test('feedback fix submit requires the exact --resolves issue set before any writes', async t => {
  const { dir, ctx } = fixture(t)
  ctx.state.data.feedbackFix = { baseRevisionId: 'rev-returned', issues: ['issue-1', 'issue-2'], at: oldTime }
  const before = snapshot(dir)
  for (const args of [[], ['--resolves', 'issue-1'], ['--resolves', 'issue-1,issue-2,issue-other']]) {
    await assert.rejects(() => submit(ctx, args), /--resolves/)
    assert.deepEqual(snapshot(dir), before)
    assert(ctx.state.data.feedbackFix)
  }
})

test('rebind rejected issue requires exact rejection evidence and live base issue, retaining products and history', async t => {
  fakeReviewOrigin(t)
  for (const invalid of ['receipt', 'code', 'http', 'tampered', 'transaction', 'paper', 'base', 'state', 'issue-revision', 'issue-paper', 'closed', 'pending', 'empty', 'none']) {
    const { dir, ctx } = fixture(t)
    ctx.state.data.feedbackFix = { baseRevisionId: 'rev-returned', issues: ['issue-old'], at: oldTime }
    const message = invalid === 'code' ? '409 OTHER_ERROR rejected'
      : invalid === 'http' ? '500 IMPORT_REVIEW_ISSUE_RESOLUTION_INVALID rejected'
        : '409 IMPORT_REVIEW_ISSUE_RESOLUTION_INVALID rejected'
    const file = failedPush(ctx, undefined, message)
    const status = JSON.parse(fakeStatus(ctx, [
      { id: 'rev-returned', state: 'changes_requested', finalizedAt: oldTime },
      { id: 'rev-uploading', state: 'uploading', bundleDigest: `sha256:${'1'.repeat(64)}` },
    ]))
    status.latestRevisionId = 'rev-returned'
    status.latest = status.revisions[0]
    status.issues = [{ id: 'issue-new', paperId: ctx.paperId, revisionId: 'rev-returned', state: 'open' }]
    if (invalid !== 'receipt') await reconcilePush(ctx, file, { readStatus: async () => JSON.stringify(status) })
    if (invalid === 'tampered') appendFileSync(file, 'changed')
    if (invalid === 'transaction') delete ctx.state.data.feedbackFix
    if (invalid === 'paper') status.paperId = 'paper-other'
    if (invalid === 'base') { status.latestRevisionId = 'rev-other'; status.latest.id = 'rev-other' }
    if (invalid === 'state') status.latest.state = 'awaiting_review'
    if (invalid === 'issue-revision') status.issues[0].revisionId = 'rev-other'
    if (invalid === 'issue-paper') status.issues[0].paperId = 'paper-other'
    if (invalid === 'closed') status.issues[0].state = 'closed'
    if (invalid === 'pending') status.issues[0].state = 'fixed_pending_review'
    json(ctx.statePath, ctx.state)
    const before = snapshot(dir), state = structuredClone(ctx.state)
    const action = () => rebindRejectedIssue(ctx, invalid === 'empty' ? '' : 'issue-new',
      { readStatus: async () => JSON.stringify(status), getBundleDigest: () => `sha256:${'2'.repeat(64)}` })
    if (invalid !== 'none') {
      await assert.rejects(action)
      assert.deepEqual(snapshot(dir), before)
      assert.deepEqual(ctx.state, state)
      continue
    }
    await action()
    assert.deepEqual(ctx.state.data.feedbackFix.issues, ['issue-new'])
    assert.equal(ctx.state.data.feedbackFix.baseRevisionId, 'rev-returned')
    assert.deepEqual(ctx.state.steps, state.steps)
    const archived = snapshot(path.join(ctx.work, 'superseded'))
    assert(Object.entries(archived).some(([name, bytes]) => name.includes('rebind-rejected-issue-')
      && name.endsWith('state.json') && bytes === before['work/fast/state.json']))
    const after = snapshot(dir)
    for (const [name, bytes] of Object.entries(before).filter(([name]) => name !== 'work/fast/state.json')) {
      assert.equal(after[name], bytes, name)
    }
  }
})

test('rebind rejects unchanged bundle even with different resolves and accepts a new producer build', async t => {
  fakeReviewOrigin(t)
  const { dir, ctx } = fixture(t)
  ctx.state.data.feedbackFix = { baseRevisionId: 'rev-returned', issues: ['issue-old'], at: oldTime }
  const file = failedPush(ctx, undefined, '409 IMPORT_REVIEW_ISSUE_RESOLUTION_INVALID rejected')
  const manifest = { schemaVersion: 'web-import-review-bundle-v3', paperId: ctx.paperId,
    paperName: 'Synthetic', sourceDigest: 'source', candidateDigest: 'candidate',
    visibleStructureDigest: 'structure', producerBuildId: 'old-head', files: [], resolvesIssueIds: ['issue-old'] }
  const bundleDigest = reviewBundleDigest(manifest)
  const status = JSON.parse(fakeStatus(ctx, [
    { id: 'rev-returned', state: 'changes_requested', finalizedAt: oldTime },
    { id: 'rev-uploading', state: 'uploading', bundleDigest },
  ]))
  status.latest = status.revisions[0]
  status.latestRevisionId = status.latest.id
  status.issues = [{ id: 'issue-new', paperId: ctx.paperId, revisionId: 'rev-returned', state: 'open' }]
  await reconcilePush(ctx, file, { readStatus: async () => JSON.stringify(status) })
  const before = snapshot(dir), state = structuredClone(ctx.state)
  const options = { readStatus: async () => JSON.stringify(status),
    getBundleDigest: () => reviewBundleDigest({ ...manifest, resolvesIssueIds: ['issue-new'] }) }
  assert.equal(options.getBundleDigest(), bundleDigest)
  await assert.rejects(() => rebindRejectedIssue(ctx, 'issue-new', options), /同一 bundle.*旧 uploading revision.*finish .*--redo-from freeze.*rebind/)
  assert.deepEqual(snapshot(dir), before)
  assert.deepEqual(ctx.state, state)
  options.getBundleDigest = () => reviewBundleDigest({ ...manifest, producerBuildId: 'new-head', resolvesIssueIds: ['issue-new'] })
  assert.notEqual(options.getBundleDigest(), bundleDigest)
  await rebindRejectedIssue(ctx, 'issue-new', options)
  assert.deepEqual(ctx.state.data.feedbackFix.issues, ['issue-new'])
})

test('active pagination retains all state and artifacts until the job exits', async t => {
  const { dir, ctx, options } = fixture(t, 'old-version')
  ctx.state.background['pagination-economy8'] = { pid: process.pid }
  json(ctx.statePath, ctx.state)
  const before = snapshot(dir)
  await assert.rejects(() => finish(ctx, [], options), /分页仍在运行/)
  assert.deepEqual(snapshot(dir), before)
})

for (const file of ['signals/review-restore.json', 'canonical-evidence/web-review-approval-v1.json', 'signals/qa-accepted.json',
  'signals/locally-published.json', 'signals/source-intake-initialization.json', '../work/handoff/evidence.json']) {
  test(`retained ${file} blocks stale invalidation without a push marker`, async t => {
    const { dir, ctx, options } = fixture(t, 'old-version')
    json(path.join(ctx.paperDir, file), { baseRevisionId: 'rev-candidate' })
    const before = snapshot(dir)
    await assert.rejects(() => finish(ctx, [], options), { code: 'SOURCE_REFERENCES_RECONCILIATION_REQUIRED' })
    assert.deepEqual(snapshot(dir), before)
  })
}

for (const field of ['candidateRevisionId', 'revisionId', 'baseRevisionId', 'localReport', 'status']) {
  test(`local Candidate evidence in data.${field} never writes or invalidates state`, async t => {
    const { dir, ctx, options } = fixture(t, 'old-version')
    ctx.state.data[field] = field === 'status' ? 'local_ready' : 'retained-candidate'
    const before = snapshot(dir), state = structuredClone(ctx.state)
    await assert.rejects(() => finish(ctx, [], options), { code: 'SOURCE_REFERENCES_RECONCILIATION_REQUIRED' })
    assert.deepEqual(snapshot(dir), before)
    assert.deepEqual(ctx.state, state)
  })
}

for (const stale of [true, false]) test(`direct submit rejects ${stale ? 'old' : 'missing'} references despite old QA`, async t => {
  const { dir, ctx } = fixture(t, 'old-version')
  if (!stale) delete ctx.state.steps['source-references'].result.producerVersion
  const before = snapshot(dir)
  for (const args of [[], ['--local-preview']]) {
    await assert.rejects(() => submit(ctx, args), error => {
      assert.equal(error.code, 'SOURCE_REFERENCES_FINISH_REQUIRED')
      assert.match(error.message, /finish/)
      return true
    })
  }
  assert.deepEqual(snapshot(dir), before)
})

for (const name of downstream.slice(1)) {
  for (const unfinished of [true, false]) test(`submit rejects ${unfinished ? 'unfinished' : 'older'} ${name}`, async t => {
    const { dir, ctx } = fixture(t)
    if (unfinished) delete ctx.state.steps[name].finishedAt
    else ctx.state.steps[name].startedAt = ctx.state.steps[name].finishedAt = '2025-01-01T00:00:00Z'
    const before = snapshot(dir)
    await assert.rejects(() => submit(ctx, []), { code: 'SOURCE_REFERENCES_QA_REQUIRED' })
    assert.deepEqual(snapshot(dir), before)
  })
}

test('known HTTP failure and only uploading Candidate permit rebuild while preserving push evidence', async t => {
  fakeReviewOrigin(t)
  const { ctx, options, calls } = fixture(t, 'old-version')
  const file = failedPush(ctx), original = readFileSync(file), push = structuredClone(ctx.state.steps.push)
  const status = fakeStatus(ctx, [{ id: 'rev-uploading', state: 'uploading', finalizedAt: null }])
  const result = await reconcilePush(ctx, file, { readStatus: async () => status })
  assert.equal(result.failure.httpStatus, 500)
  assert.equal(result.observation.candidates[0].id, 'rev-uploading')
  const statusReceipt = JSON.parse(readFileSync(path.join(ctx.fast, 'push-reconciliation', result.statusReceipt)))
  assert.equal(statusReceipt.response, status)
  await finish(ctx, [], options)
  assert.deepEqual(calls, downstream)
  assert.deepEqual(ctx.state.steps.push, push)
  assert.deepEqual(readFileSync(file), original)
  await requestedRedo(ctx, 'source-references')
  assert.deepEqual(ctx.state.steps.push, push)
})

for (const failure of ['fetch failed: ECONNRESET', 'SOURCE_REFERENCES_PRODUCER_VERSION_INVALID', '500 without code']) {
  test(`UNKNOWN failure is rejected: ${failure}`, async t => {
    fakeReviewOrigin(t)
    const { ctx } = fixture(t, 'old-version')
    const file = failedPush(ctx, undefined, failure)
    let called = false
    await assert.rejects(() => reconcilePush(ctx, file, { readStatus: async () => { called = true; return fakeStatus(ctx) } }), /UNKNOWN/)
    assert.equal(called, false)
    await assert.rejects(() => requestedRedo(ctx, 'source-references'), { code: 'SOURCE_REFERENCES_RECONCILIATION_REQUIRED' })
  })
}

test('failed status and wrong paper status remain blocked', async t => {
  fakeReviewOrigin(t)
  const { ctx } = fixture(t, 'old-version'), file = failedPush(ctx)
  await assert.rejects(() => reconcilePush(ctx, file, { readStatus: async () => { throw new Error('status failed') } }), /status failed/)
  await assert.rejects(() => reconcilePush(ctx, file, { readStatus: async () => JSON.stringify({ paperId: 'paper-other', latest: null, latestRevisionId: null, revisions: [] }) }), /UNKNOWN/)
  await assert.rejects(() => requestedRedo(ctx, 'source-references'), { code: 'SOURCE_REFERENCES_RECONCILIATION_REQUIRED' })
})

for (const finalizedAt of [oldTime, '2026-01-01T00:01:00Z']) test(`Candidate finalized at ${finalizedAt} prevents reconciliation`, async t => {
  fakeReviewOrigin(t)
  const { ctx } = fixture(t, 'old-version'), file = failedPush(ctx)
  const status = fakeStatus(ctx, [{ id: 'rev-finalized', state: 'awaiting_review', finalizedAt }])
  await assert.rejects(() => reconcilePush(ctx, file, { readStatus: async () => status }), /RECONCILIATION_REQUIRED/)
  await assert.rejects(() => requestedRedo(ctx, 'source-references'), { code: 'SOURCE_REFERENCES_RECONCILIATION_REQUIRED' })
})

test('409 failure with a historical finalized Candidate and an uploading Candidate permits reconciliation', async t => {
  fakeReviewOrigin(t)
  const { ctx } = fixture(t, 'old-version'), file = failedPush(ctx, undefined, '409 REVIEW_CONFLICT rejected')
  const status = fakeStatus(ctx, [
    { id: 'rev-previous', state: 'changes_requested', finalizedAt: '2025-12-31T23:59:00Z' },
    { id: 'rev-uploading', state: 'uploading', finalizedAt: null },
  ])
  const result = await reconcilePush(ctx, file, { readStatus: async () => status })
  assert.equal(result.failure.httpStatus, 409)
  assert.deepEqual(result.observation.candidates, [{ id: 'rev-uploading', state: 'uploading', finalizedAt: null }])
  assert.deepEqual(JSON.parse(readFileSync(result.receipt)).observation, result.observation)
  await requestedRedo(ctx, 'source-references')
})

test('a prior HTTP 500 cannot reconcile a later network-failed attempt', async t => {
  fakeReviewOrigin(t)
  const { ctx } = fixture(t, 'old-version')
  const previous = failedPush(ctx)
  await reconcilePush(ctx, previous, { readStatus: async () => fakeStatus(ctx) })
  const next = failedPush(ctx, '22222222-2222-4222-8222-222222222222', 'fetch failed: ECONNRESET')
  await assert.rejects(() => reconcilePush(ctx, previous, { readStatus: async () => fakeStatus(ctx) }), /UNKNOWN/)
  await assert.rejects(() => reconcilePush(ctx, next, { readStatus: async () => fakeStatus(ctx) }), /UNKNOWN/)
  await assert.rejects(() => requestedRedo(ctx, 'source-references'), { code: 'SOURCE_REFERENCES_RECONCILIATION_REQUIRED' })
})

test('new attempt history invalidates old evidence even if old state remains in memory', async t => {
  fakeReviewOrigin(t)
  const { ctx } = fixture(t, 'old-version'), file = failedPush(ctx)
  await reconcilePush(ctx, file, { readStatus: async () => fakeStatus(ctx) })
  appendFileSync(path.join(ctx.fast, 'push-attempts.jsonl'), `${JSON.stringify({ paperId: ctx.paperId, startedAt: oldTime, attemptId: '22222222-2222-4222-8222-222222222222' })}\n`)
  await assert.rejects(() => reconcilePush(ctx, file, { readStatus: async () => fakeStatus(ctx) }), /UNKNOWN/)
  await assert.rejects(() => requestedRedo(ctx, 'source-references'), { code: 'SOURCE_REFERENCES_RECONCILIATION_REQUIRED' })
})

test('legacy push without attempt identity cannot be reconciled', async t => {
  fakeReviewOrigin(t)
  const { ctx } = fixture(t, 'old-version'), file = failedPush(ctx)
  delete ctx.state.steps.push.attemptId
  json(ctx.statePath, ctx.state)
  await assert.rejects(() => reconcilePush(ctx, file, { readStatus: async () => fakeStatus(ctx) }), /UNKNOWN/)
})

test('zero Candidate permits an old legacy push and retains its evidence', async t => {
  fakeReviewOrigin(t)
  const { ctx, options } = fixture(t, 'old-version'), file = legacyPush(ctx)
  const original = readFileSync(file)
  const ocr = { id: 'ocr-1', paperId: ctx.paperId, reviewKind: 'ocr', state: 'approved' }
  const raw = JSON.stringify({ paperId: ctx.paperId, latestRevisionId: ocr.id, latest: ocr, revisions: [ocr] })
  const receipt = await reconcilePush(ctx, file, { readStatus: async () => raw })
  assert.equal(receipt.method, 'zero-candidate')
  assert.equal(receipt.failurePath, file)
  assert.equal(JSON.parse(readFileSync(path.join(ctx.fast, 'push-reconciliation', receipt.statusReceipt))).response, raw)
  await finish(ctx, [], options)
  assert.deepEqual(readFileSync(file), original)
  // An appended attempt consumes the old receipt even before state is saved.
  appendFileSync(path.join(ctx.fast, 'push-attempts.jsonl'), `${JSON.stringify({ paperId: ctx.paperId, startedAt: new Date().toISOString(), attemptId: '22222222-2222-4222-8222-222222222222' })}\n`)
  await assert.rejects(() => requestedRedo(ctx, 'push'), { code: 'SOURCE_REFERENCES_RECONCILIATION_REQUIRED' })
})

test('zero Candidate also reconciles an old identified attempt without HTTP evidence', async t => {
  fakeReviewOrigin(t)
  const { ctx } = fixture(t, 'old-version')
  const file = failedPush(ctx)
  writeFileSync(file, readFileSync(file, 'utf8').replace('500 SOURCE_REFERENCES_PRODUCER_VERSION_INVALID rejected', 'network failure'))
  const receipt = await reconcilePush(ctx, file, { readStatus: async () => fakeStatus(ctx) })
  assert.equal(receipt.method, 'zero-candidate')
  await requestedRedo(ctx, 'source-references')
})

test('zero Candidate rejects a newer attempt recorded while status is read', async t => {
  fakeReviewOrigin(t)
  const { ctx } = fixture(t, 'old-version'), file = legacyPush(ctx)
  await assert.rejects(() => reconcilePush(ctx, file, { readStatus: async () => {
    appendFileSync(path.join(ctx.fast, 'push-attempts.jsonl'), `${JSON.stringify({ paperId: ctx.paperId, startedAt: new Date().toISOString(), attemptId: '22222222-2222-4222-8222-222222222222' })}\n`)
    return fakeStatus(ctx)
  } }), /UNKNOWN/)
})

for (const state of ['uploading', 'superseded', 'awaiting_review', 'finalized']) {
  test(`zero Candidate refuses ${state}`, async t => {
    fakeReviewOrigin(t)
    const { ctx } = fixture(t, 'old-version'), file = legacyPush(ctx)
    const status = fakeStatus(ctx, [{ id: 'candidate-1', state, finalizedAt: state === 'uploading' ? null : oldTime }])
    await assert.rejects(() => reconcilePush(ctx, file, { readStatus: async () => status }), /UNKNOWN/)
    await assert.rejects(() => requestedRedo(ctx, 'push'), { code: 'SOURCE_REFERENCES_RECONCILIATION_REQUIRED' })
  })
}

test('zero Candidate rejects a recent attempt, failed status and malformed status', async t => {
  fakeReviewOrigin(t)
  const { ctx } = fixture(t, 'old-version')
  let file = legacyPush(ctx, new Date().toISOString())
  await assert.rejects(() => reconcilePush(ctx, file, { readStatus: async () => fakeStatus(ctx) }), /UNKNOWN/)
  file = legacyPush(ctx)
  await assert.rejects(() => reconcilePush(ctx, file, { readStatus: async () => { throw new Error('status failed') } }), /status failed/)
  for (const raw of ['{', '{}', JSON.stringify({ paperId: ctx.paperId, latest: null, latestRevisionId: null, revisions: [{}] })]) {
    await assert.rejects(() => reconcilePush(ctx, file, { readStatus: async () => raw }), /UNKNOWN/)
  }
  await assert.rejects(() => requestedRedo(ctx, 'push'), { code: 'SOURCE_REFERENCES_RECONCILIATION_REQUIRED' })
})

for (const tamper of ['receipt', 'status', 'failure', 'startedAt', 'new-push']) {
  test(`tampered or stale ${tamper} evidence cannot unblock redo`, async t => {
    fakeReviewOrigin(t)
    const { ctx } = fixture(t, 'old-version'), file = failedPush(ctx)
    const result = await reconcilePush(ctx, file, { readStatus: async () => fakeStatus(ctx) })
    if (tamper === 'receipt') writeFileSync(result.receipt, '{}')
    if (tamper === 'status') writeFileSync(path.join(ctx.fast, 'push-reconciliation', result.statusReceipt), '{}')
    if (tamper === 'failure') writeFileSync(file, '500 OTHER_ERROR changed')
    if (tamper === 'startedAt') ctx.state.steps.push.startedAt = '2026-01-02T00:00:00Z'
    if (tamper === 'new-push') ctx.state.steps.push = { startedAt: '2026-01-03T00:00:00Z' }
    await assert.rejects(() => requestedRedo(ctx, 'source-references'), { code: 'SOURCE_REFERENCES_RECONCILIATION_REQUIRED' })
    await assert.rejects(() => requestedRedo(ctx, 'push'), { code: 'SOURCE_REFERENCES_RECONCILIATION_REQUIRED' })
  })
}
