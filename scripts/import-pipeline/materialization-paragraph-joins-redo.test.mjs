import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { finish, invalidateParagraphJoinDownstream, requestedRedo, splitSummaries } from './fast-import.mjs'
import { sha256 } from '../../shared/paper-canonical/stable.mjs'
import { makeFixture } from '../verify-nck1-source-materialization.mjs'
import { enumerateParagraphSummaryTargets, validateParagraphSummaries } from '../../server/paper-import-ai/paragraphSummaries.mjs'

test('paragraph join redo archives downstream while retaining sealed OCR; stale and Candidate guards write nothing', async t => {
  const root = path.resolve(import.meta.dirname, '../..')
  const paperId = `paper-synthetic-paragraph-join-${process.pid}`
  const paper = path.join(root, 'scripts/import-pipeline/papers', paperId)
  const work = path.join(root, 'imports/ocr-proofread', paperId)
  assert(!existsSync(paper) && !existsSync(work))
  t.after(() => { rmSync(paper, { recursive: true, force: true }); rmSync(work, { recursive: true, force: true }) })
  const json = (file, value) => { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify(value)) }
  const stateFile = path.join(work, 'fast/state.json')
  const names = ['compile', 'ocr-review', 'materialize', 'presentation', 'spelling', 'verify', 'build',
    'summaries', 'search-metadata', 'listening-review', 'ocr-correction-report', 'source-references', 'pagination-plan', 'freeze', 'pdf-qa']
  const state = { paperId, steps: Object.fromEntries(names.map(name => [name, { finishedAt: '2026-01-01', result: { retained: name } }])),
    data: {}, background: {} }
  json(stateFile, state)
  const materialization = path.join(paper, 'materialization/nck1-source-materialization-v1.json')
  json(materialization, { retained: 'original source blocks' })
  const digest = sha256(readFileSync(materialization))
  const sealed = ['nck1-ocr-source-evidence-v1.json', 'nck1-ocr-source-confirmation-v1.json',
    'nck1-ocr-materialization-producer-receipt-v1.json']
  sealed.forEach(file => json(path.join(paper, 'materialization', file), { retained: file }))
  json(path.join(paper, 'signals/agent-proofreading-receipt.json'), { revisionId: 'sealed-ocr' })
  const staleFiles = ['spelling-review-v1.json', 'source-references-v1.json', 'agent-ocr-correction-report-v2.json',
    'canonical-evidence/canonical-import-request.json', 'products/economy8.pdf']
  staleFiles.forEach(file => json(path.join(paper, file), { old: file }))
  const snapshot = dir => Object.fromEntries(readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? Object.entries(snapshot(path.join(dir, entry.name))).map(([name, bytes]) => [`${entry.name}/${name}`, bytes])
    : [[entry.name, sha256(readFileSync(path.join(dir, entry.name)))]]))
  const before = { paper: snapshot(paper), work: snapshot(work) }
  await assert.rejects(invalidateParagraphJoinDownstream(paperId, 'stale'), /changed/)
  assert.deepEqual({ paper: snapshot(paper), work: snapshot(work) }, before)
  json(stateFile, { ...state, data: { candidateRevisionId: 'already-submitted' } })
  const guarded = { paper: snapshot(paper), work: snapshot(work) }
  await assert.rejects(invalidateParagraphJoinDownstream(paperId, digest), /RECONCILIATION_REQUIRED/)
  assert.deepEqual({ paper: snapshot(paper), work: snapshot(work) }, guarded)
  json(stateFile, state)
  await invalidateParagraphJoinDownstream(paperId, digest)
  const retained = JSON.parse(readFileSync(stateFile))
  assert.deepEqual(Object.keys(retained.steps), names.slice(0, 4))
  assert.equal(sha256(readFileSync(materialization)), digest)
  for (const file of sealed) assert.equal(snapshot(paper)[`materialization/${file}`], before.paper[`materialization/${file}`])
  assert.equal(snapshot(paper)['signals/agent-proofreading-receipt.json'], before.paper['signals/agent-proofreading-receipt.json'])
  for (const file of staleFiles) assert(!existsSync(path.join(paper, file)))
  const archive = snapshot(path.join(work, 'superseded'))
  for (const file of staleFiles) assert(Object.entries(archive).some(([name, bytes]) =>
    name.endsWith(file) && bytes === before.paper[file]), file)
  assert(Object.values(archive).includes(digest))
})

test('paragraph join requires newly authored summaries after request/split; ordinary redo still reuses matching IDs', async t => {
  const root = path.resolve(import.meta.dirname, '../..')
  const paperId = `paper-synthetic-paragraph-authored-${process.pid}`
  const paperDir = path.join(root, 'scripts/import-pipeline/papers', paperId)
  const work = path.join(root, 'imports/ocr-proofread', paperId), fast = path.join(work, 'fast')
  assert(!existsSync(paperDir) && !existsSync(work))
  t.after(() => { rmSync(paperDir, { recursive: true, force: true }); rmSync(work, { recursive: true, force: true }) })
  const json = (file, value) => { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify(value)) }
  const ctx = { paperId, paperDir, work, fast, statePath: path.join(fast, 'state.json'),
    state: { paperId, steps: {}, data: {}, background: {} } }
  const materialization = { ...makeFixture(), paperId }
  const materializationFile = path.join(paperDir, 'materialization/nck1-source-materialization-v1.json')
  json(materializationFile, materialization)
  const targets = enumerateParagraphSummaryTargets(materialization)
  const request = { schemaVersion: 'paragraph-summaries-request-v1', paperId,
    sourceDigest: sha256('old-source'), candidateDigest: sha256('old-candidate'), outputFile: 'paragraph-summaries-v1.json',
    groups: materialization.groups.filter(group => targets.some(target => target.groupId === group.groupId))
      .map(group => ({ groupId: group.groupId, sourceGroup: group, authoritativeAnswers: materialization.answers,
        targets: targets.filter(target => target.groupId === group.groupId) })) }
  const requestFile = path.join(fast, 'summaries-request.json')
  json(requestFile, request)
  ctx.state.data.summaryParts = splitSummaries(ctx, 3)
  const authoredGroup = group => ({ groupId: group.groupId,
    paragraphs: group.targets.map(target => ({ paragraphId: target.paragraphId, summary: 'OLD_AUTHORED_SUMMARY' })) })
  const authoredFiles = ctx.state.data.summaryParts.map(part => {
    const file = part.file.replace(/request-(\d+)\.json$/u, 'part-$1.json')
    json(file, { groups: JSON.parse(readFileSync(part.file)).groups.map(authoredGroup) })
    return { file, bytes: readFileSync(file) }
  })
  const oldSidecar = { schemaVersion: 'paragraph-summaries-v1', paperId,
    sourceDigest: request.sourceDigest, candidateDigest: request.candidateDigest, groups: request.groups.map(authoredGroup) }
  assert.deepEqual(validateParagraphSummaries({ sidecar: oldSidecar, materialization, ...request }), [])
  const installed = path.join(paperDir, request.outputFile)
  json(installed, oldSidecar)
  const metadata = path.join(fast, 'search-metadata-authored.json'), prompts = path.join(fast, 'round2.json')
  json(metadata, { groups: [{ groupId: request.groups[0].groupId, summary: 'OLD_AUTHORED_METADATA' }] })
  json(prompts, [{ outputs: authoredFiles.map(({ file }) => file), prompt: 'old authoring request' }])
  const metadataBytes = readFileSync(metadata), promptBytes = readFileSync(prompts)
  await requestedRedo(ctx, 'spelling')
  ctx.state.data.summaryParts = splitSummaries(ctx, 3)
  for (const { file, bytes } of authoredFiles) assert.deepEqual(readFileSync(file), bytes, 'ordinary redo retains authored parts')
  assert.deepEqual(readFileSync(metadata), metadataBytes)
  json(installed, oldSidecar)
  await invalidateParagraphJoinDownstream(paperId, sha256(readFileSync(materializationFile)))
  ctx.state = JSON.parse(readFileSync(ctx.statePath))
  const nextRequest = { ...request, sourceDigest: sha256('new-source'), candidateDigest: sha256('new-candidate') }
  json(requestFile, nextRequest)
  ctx.state.data.summaryParts = splitSummaries(ctx, 3)
  // A paragraph join preserves source IDs: even the real summary validator cannot detect reused prose.
  assert.deepEqual(validateParagraphSummaries({ sidecar: { ...oldSidecar,
    sourceDigest: nextRequest.sourceDigest, candidateDigest: nextRequest.candidateDigest }, materialization, ...nextRequest }), [])
  for (const { file } of authoredFiles) assert(!existsSync(file), 'old authored summary must not survive a paragraph join')
  assert(!existsSync(metadata), 'old authored metadata must not survive a paragraph join')
  assert(!existsSync(prompts), 'old authoring instructions must move aside')
  const archived = readdirSync(path.join(work, 'superseded'))
  const partsArchive = archived.find(name => name.endsWith('-summaries-parts'))
  assert(partsArchive)
  for (const { file, bytes } of authoredFiles) assert.deepEqual(
    readFileSync(path.join(work, 'superseded', partsArchive, path.basename(file))), bytes)
  for (const [file, bytes] of [[metadata, metadataBytes], [prompts, promptBytes]]) assert.deepEqual(
    readFileSync(path.join(work, 'superseded', archived.find(name => name.endsWith(`-${path.basename(file)}`)))), bytes)
  await assert.rejects(finish(ctx, []), /缺少摘要分片/)
  assert(!existsSync(installed), 'finish must not install old summaries with new digests')
  assert(!ctx.state.steps.summaries.finishedAt)
  assert(!ctx.state.steps['search-metadata'])
})
