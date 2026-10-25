import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { assertReferenceProductsReady, finish, requestedRedo, submit } from './fast-import.mjs'
import { OCR_SOURCE_REFERENCES_PRODUCER_VERSION as version } from './ocr-source-references-version.mjs'
import { OCR_SOURCE_REFERENCES_PRODUCER_VERSION as producerVersion } from './ocr-proofread.mjs'
import { PAPER_PAGINATION_PLAN_FILE_NAME } from '../../server/paper-import/paginationPlan.mjs'

const downstream = ['source-references', 'pagination-run', 'pagination-plan', 'freeze', 'pdf-qa']
const oldTime = '2026-01-01T00:00:00.000Z'
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
    json(path.join(ctx.paperDir, file), { old: file })
  }
  json(path.join(ctx.fast, 'pagination/economy8/report.json'), { old: true })
  json(ctx.statePath, ctx.state)
  const ocr = { id: 'rev-sealed-ocr', paperId: ctx.paperId, reviewKind: 'ocr', state: 'approved' }
  const remote = { paperId: ctx.paperId, revisions: [ocr], latestRevisionId: ocr.id, latest: ocr }
  const calls = []
  const referenceStages = Object.fromEntries(downstream.map(name => [name, async () => {
    calls.push(name)
    if (name === 'source-references') {
      json(path.join(ctx.paperDir, 'source-references-v1.json'), { regenerated: version })
      return { producerVersion: version, outline: [] }
    }
    if (name === 'pagination-plan') json(path.join(ctx.paperDir, PAPER_PAGINATION_PLAN_FILE_NAME), { regenerated: true })
    if (name === 'freeze') json(path.join(ctx.paperDir, 'products/answerOnly.pdf'), { regenerated: true })
    return name === 'pdf-qa' ? { dir: 'new-qa' } : { regenerated: true }
  }]))
  return { dir, ctx, remote, calls, options: { readStatus: async () => remote, referenceStages } }
}

test('producer and driver import the same pure version constant; current results remain cache hits', async t => {
  assert.equal(producerVersion, version)
  const { dir, ctx, calls, options } = fixture(t)
  options.readStatus = () => { throw new Error('cache hit must not read remote state') }
  const before = snapshot(dir)
  await finish(ctx, [], options)
  assert.deepEqual(calls, [])
  assert.deepEqual(snapshot(dir), before)
  assertReferenceProductsReady(ctx)
})

for (const old of ['ocr-source-references-producer-v1', undefined]) {
  test(`stale/missing version (${old}) rebuilds downstream once and preserves sealed OCR bytes`, async t => {
    const { ctx, calls, options } = fixture(t, old)
    // Explicit undefined removes the field instead of using fixture's default.
    if (old === undefined) delete ctx.state.steps['source-references'].result.producerVersion
    const before = snapshot(path.join(ctx.paperDir, 'materialization'))
    const input = readFileSync(path.join(ctx.work, 'proofread-input.json'))
    await finish(ctx, [], options)
    assert.deepEqual(calls, downstream)
    assert.deepEqual(snapshot(path.join(ctx.paperDir, 'materialization')), before)
    assert.deepEqual(readFileSync(path.join(ctx.work, 'proofread-input.json')), input)
    assert.equal(ctx.state.steps['ocr-review'].result.revisionId, 'rev-sealed-ocr')
    const archived = snapshot(path.join(ctx.work, 'superseded'))
    for (const name of ['source-references-v1.json', PAPER_PAGINATION_PLAN_FILE_NAME, 'products/answerOnly.pdf',
      'pagination/economy8/report.json']) assert(Object.keys(archived).some(file => file.endsWith(name)), name)
    assertReferenceProductsReady(ctx)
    const completedState = readFileSync(ctx.statePath)
    await finish(ctx, [], options)
    assert.deepEqual(calls, downstream, 'second run must reuse every rebuilt step')
    assert.deepEqual(readFileSync(ctx.statePath), completedState)
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
  test(`${marker} evidence blocks stale invalidation before page-limit changes or any writes`, async t => {
    const { dir, ctx, options } = fixture(t, 'old-version')
    ctx.state.steps[marker] = { startedAt: oldTime }
    json(ctx.statePath, ctx.state)
    options.readStatus = () => { throw new Error('local evidence already requires reconciliation') }
    const before = snapshot(dir), state = structuredClone(ctx.state)
    await assert.rejects(() => finish(ctx, ['--economy-page-limit', '9'], options),
      { code: 'SOURCE_REFERENCES_RECONCILIATION_REQUIRED' })
    assert.deepEqual(snapshot(dir), before)
    assert.deepEqual(ctx.state, state)
  })
}

for (const name of ['source-references', 'pagination-run', 'pdf-qa']) {
  for (const current of [true, false]) test(`explicit redo from ${name} (${current ? 'current' : 'old'} references) cannot erase submission evidence`, async t => {
    const { dir, ctx, options } = fixture(t, current ? version : 'old-version')
    ctx.state.steps.push = { startedAt: oldTime }
    json(ctx.statePath, ctx.state)
    const before = snapshot(dir)
    await assert.rejects(() => requestedRedo(ctx, name, options),
      { code: 'SOURCE_REFERENCES_RECONCILIATION_REQUIRED' })
    assert.deepEqual(snapshot(dir), before)
  })
}

test('active pagination retains all state and artifacts until the job exits', async t => {
  const { dir, ctx, options } = fixture(t, 'old-version')
  ctx.state.background['pagination-economy8'] = { pid: process.pid }
  json(ctx.statePath, ctx.state)
  const before = snapshot(dir)
  await assert.rejects(() => finish(ctx, [], options), /分页仍在运行/)
  assert.deepEqual(snapshot(dir), before)
})

for (const file of ['signals/review-restore.json', 'canonical-evidence/web-review-approval-v1.json', 'signals/qa-accepted.json',
  'signals/source-intake-initialization.json', '../work/fast/upload-timeline.jsonl', '../work/handoff/evidence.json']) {
  test(`retained ${file} blocks stale invalidation without a push marker`, async t => {
    const { dir, ctx, options } = fixture(t, 'old-version')
    json(path.join(ctx.paperDir, file), { baseRevisionId: 'rev-candidate' })
    const before = snapshot(dir)
    await assert.rejects(() => finish(ctx, [], options), { code: 'SOURCE_REFERENCES_RECONCILIATION_REQUIRED' })
    assert.deepEqual(snapshot(dir), before)
  })
}

for (const state of ['uploading', 'awaiting_review', 'approved', 'superseded', 'UNKNOWN']) {
  test(`remote Candidate ${state} is retained without local push evidence`, async t => {
    const { dir, ctx, remote, options } = fixture(t, 'old-version')
    // OCR may remain latest while an interrupted Candidate registration exists in revisions.
    remote.revisions.push({ id: 'rev-candidate', paperId: ctx.paperId, reviewKind: 'candidate', state })
    const before = snapshot(dir)
    await assert.rejects(() => finish(ctx, [], options), { code: 'SOURCE_REFERENCES_RECONCILIATION_REQUIRED' })
    assert.deepEqual(snapshot(dir), before)
  })
}

for (const response of [null, {}, { paperId: 'wrong', revisions: [] }, 'network-failure', 'hidden-latest', 'unknown-kind']) {
  test(`UNKNOWN remote (${JSON.stringify(response)}) never writes or invalidates state`, async t => {
    const { dir, ctx, remote, options } = fixture(t, 'old-version')
    options.readStatus = async () => {
      if (response === 'network-failure') throw new Error('EOF')
      if (response === 'hidden-latest') return { ...remote, latestRevisionId: 'hidden' }
      if (response === 'unknown-kind') return { ...remote, revisions: [{ ...remote.latest, reviewKind: null }] }
      return response
    }
    const before = snapshot(dir), state = structuredClone(ctx.state)
    await assert.rejects(() => finish(ctx, [], options), { code: 'SOURCE_REFERENCES_REMOTE_UNKNOWN' })
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
