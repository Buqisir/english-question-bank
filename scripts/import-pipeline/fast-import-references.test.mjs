import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { assertReferenceProductsReady, finish, requestedRedo, submit } from './fast-import.mjs'
import { OCR_SOURCE_REFERENCES_PRODUCER_VERSION as version } from './ocr-source-references-version.mjs'
import { OCR_SOURCE_REFERENCES_PRODUCER_VERSION as producerVersion } from './ocr-proofread.mjs'
import { PAPER_PAGINATION_PLAN_FILE_NAME } from '../../server/paper-import/paginationPlan.mjs'
import { uploadReviewBundle } from './lib-review-upload.mjs'

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
      json(path.join(ctx.paperDir, 'source-references-v1.json'), { regenerated: version })
      return { producerVersion: version, outline: [] }
    }
    if (name === 'pagination-plan') json(path.join(ctx.paperDir, PAPER_PAGINATION_PLAN_FILE_NAME), { regenerated: true })
    if (name === 'freeze') json(path.join(ctx.paperDir, 'products/answerOnly.pdf'), { regenerated: true })
    return name === 'pdf-qa' ? { dir: 'new-qa' } : { regenerated: true }
  }]))
  return { dir, ctx, calls, options: { referenceStages } }
}

test('producer and driver import the same pure version constant; current results remain cache hits', async t => {
  assert.equal(version, 'ocr-source-references-producer-v21')
  assert.equal(producerVersion, version)
  const { dir, ctx, calls, options } = fixture(t)
  const before = snapshot(dir)
  await finish(ctx, [], options)
  assert.deepEqual(calls, [])
  assert.deepEqual(snapshot(dir), before)
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

for (const old of ['ocr-source-references-producer-v1', 'ocr-source-references-producer-v16', 'ocr-source-references-producer-v17', 'ocr-source-references-producer-v18', undefined]) {
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
