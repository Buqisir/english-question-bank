import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { invalidateParagraphJoinDownstream } from './fast-import.mjs'
import { sha256 } from '../../shared/paper-canonical/stable.mjs'

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
