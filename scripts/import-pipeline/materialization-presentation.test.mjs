import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { restoreOcrSourcePresentation } from './materialization-presentation.mjs'
import { inspectNck1Materialization, runNck1MaterializationJob } from './nck1-docx-materialize.mjs'
import { nck1OcrProducerVersion, nck1OcrProducerSourceDigest } from '../../server/paper-import/nck1OcrMaterializationProducer.mjs'
import { digestJson, sha256 } from '../../shared/paper-canonical/stable.mjs'

function fixture() {
  const texts = [
    '听下面5段对话。每段录音读两遍。',
    '听下面5段对话或独白。每段录音读两遍。',
    '阅读下列短文，从每题所给的选项中选出最佳选项。',
    '选项中有两项为多余选项。',
    '选出可以填入空白处的最佳选项。',
    '括号内单词的正确形式。',
  ]
  const observations = texts.map((text, i) => ({
    observationId: `o${i}`, text,
    region: { x: 0.1, y: 0.1 + i * 0.1, width: 0.8, height: 0.05 },
  }))
  const items = texts.map((text, i) => ({ itemId: `i${i}`, observationIds: [`o${i}`], text }))
  const materialization = {
    schemaVersion: 'nck1-source-materialization-v1', paperId: 'paper-test',
    documents: [{ documentId: 'renamed-question', role: 'question_source' }],
    listening: { state: 'captured', groups: [{ groupId: 'listening-text-1' }] },
    groups: [{ id: 'unchanged' }], answers: [], media: [], issues: [],
  }
  const evidence = {
    paperId: 'paper-test', sourceSetDigest: 'source', evidenceDigest: 'evidence',
    documents: [{ documentId: 'renamed-question', pages: [
      { page: 2, observations: [] }, { page: 1, observations },
    ] }],
  }
  const confirmation = {
    paperId: 'paper-test', confirmed: true, sourceSetDigest: 'source', evidenceDigest: 'evidence',
    documents: [{ documentId: 'renamed-question', pages: [{ page: 1, orderedItems: items }] }],
  }
  return { materialization, evidence, confirmation }
}

test('legacy materialization restores both listening sections from confirmed text and page regions', () => {
  const input = fixture()
  const original = structuredClone(input)
  const result = restoreOcrSourcePresentation(input)
  assert.equal(result.schemaVersion, 'nck1-source-materialization-v4')
  assert.deepEqual(result.sourcePresentation.instructions.slice(0, 2).map(({ slotId, text }) => ({ slotId, text })), [
    { slotId: 'listening.short-dialogue', text: '听下面5段对话。每段录音读两遍。' },
    { slotId: 'listening.long-form', text: '听下面5段对话或独白。每段录音读两遍。' },
  ])
  assert.deepEqual(result.sourcePresentation.instructions[1].source, {
    kind: 'page_region', documentId: 'renamed-question', page: 1,
    region: { x: 0.1, y: 0.2, width: 0.8, height: 0.05 },
  })
  const { sourcePresentation, schemaVersion, ...rest } = result
  const { schemaVersion: oldSchema, ...before } = input.materialization
  assert.deepEqual(rest, before)
  assert.deepEqual(input, original)
})

test('existing presentation keeps manual fields, fills missing sections and is idempotent', () => {
  const input = fixture()
  const complete = restoreOcrSourcePresentation(input)
  const manual = structuredClone(complete.sourcePresentation)
  manual.instructions = manual.instructions.filter(item => !item.slotId.startsWith('listening.'))
  manual.instructions[0].text = '人工校对的阅读说明'
  manual.listeningExample = { state: 'provided', stem: 'manual example', source: { page: 1 } }
  input.materialization = { ...complete, sourcePresentation: manual }
  const result = restoreOcrSourcePresentation(input)
  assert.equal(result.sourcePresentation.instructions.length, 6)
  assert.deepEqual(result.sourcePresentation.instructions.slice(0, 4), manual.instructions)
  assert.deepEqual(result.sourcePresentation.listeningExample, manual.listeningExample)
  assert.deepEqual(restoreOcrSourcePresentation({ ...input, materialization: result }), result)
})

for (const version of [5, 6]) {
  function currentPresentationFixture() {
    const input = fixture()
    input.materialization = restoreOcrSourcePresentation(input)
    input.materialization.schemaVersion = `nck1-source-materialization-v${version}`
    const source = input.materialization.sourcePresentation.instructions[0].source
    input.materialization.groups = [{
      groupId: 'writing', family: 'application-writing',
      writingTask: { drawingArea: { placement: 'top_right', labelBlockRef: 'drawing-label', source } },
    }]
    if (version === 6) input.materialization.groups.push({
      groupId: 'reading', family: 'reading',
      questions: [{ questionId: 'q21', stemFigures: [{
        kind: 'figure', blockId: 'stem-map', mediaId: 'map', caption: '', source,
      }] }],
    })
    return input
  }

  test(`v${version} presentation recovery preserves drawing/stem fields, schema and identity`, () => {
    const input = currentPresentationFixture()
    const before = structuredClone(input.materialization)
    const result = restoreOcrSourcePresentation(input)
    assert.deepEqual(result, before)
    assert.equal(digestJson(result), digestJson(before))
    assert.deepEqual(input.materialization, before)
  })

  test(`v${version} cache hit preserves materialization bytes and producer identity`, t => {
    const job = cachedJob(t, currentPresentationFixture())
    const file = job.file('nck1-source-materialization-v1.json')
    const before = readFileSync(file)
    const receipt = readFileSync(job.file('nck1-ocr-materialization-producer-receipt-v1.json'))
    assert.equal(inspectNck1Materialization(job).outputState, 'producer_output_unchanged')
    const result = runNck1MaterializationJob(job)
    assert.equal(result.cached, true)
    assert.deepEqual(readFileSync(file), before)
    assert.equal(result.outputState, 'producer_output_unchanged')
    assert.deepEqual(readFileSync(job.file('nck1-ocr-materialization-producer-receipt-v1.json')), receipt)
  })
}

test('v2/v3 presentation recovery upgrades only legacy schemas to v4', () => {
  for (const version of [2, 3]) {
    const input = fixture()
    input.materialization.schemaVersion = `nck1-source-materialization-v${version}`
    assert.equal(restoreOcrSourcePresentation(input).schemaVersion, 'nck1-source-materialization-v4')
  }
})

test('presentation recovery rejects unknown schemas without rewriting the input', () => {
  const input = fixture()
  input.materialization.schemaVersion = 'nck1-source-materialization-v7'
  const before = structuredClone(input)
  assert.throws(() => restoreOcrSourcePresentation(input), /Unsupported materialization schema/u)
  assert.deepEqual(input, before)
})

test('answer-source directions cannot supply or conflict with question-source directions', () => {
  const input = fixture()
  const answer = structuredClone(input.confirmation.documents[0])
  answer.documentId = 'official-answers-2'
  answer.pages[0].orderedItems[0].text = '听下面5段对话。每段录音读一遍。'
  input.confirmation.documents.unshift(answer)
  input.materialization.documents.push({ documentId: answer.documentId, role: 'official_answers' })
  assert.match(restoreOcrSourcePresentation(input).sourcePresentation.instructions[0].text, /两遍/u)
})

test('conflicting confirmed directions do not silently choose the first', () => {
  const input = fixture()
  input.confirmation.documents[0].pages[0].orderedItems.push({
    itemId: 'conflict', observationIds: ['o0'], text: '听下面5段对话。每段录音读一遍。',
  })
  assert.throws(() => restoreOcrSourcePresentation(input), /Conflicting.*listening.short-dialogue/u)
})

test('missing listening source text cannot be inferred from transcript or audio', () => {
  const input = fixture()
  input.confirmation.documents[0].pages[0].orderedItems.shift()
  assert.throws(() => restoreOcrSourcePresentation(input), /No confirmed direction.*listening.short-dialogue/u)
})

test('missing or invalid observation geometry prevents a fabricated source locator', () => {
  for (const damage of ['missing', 'invalid']) {
    const input = fixture()
    if (damage === 'missing') input.confirmation.documents[0].pages[0].orderedItems[0].observationIds = ['missing']
    else input.evidence.documents[0].pages[1].observations[0].region.width = 0
    assert.throws(() => restoreOcrSourcePresentation(input), /observation.*locator/u)
  }
})

test('stale or unconfirmed OCR cannot restore materialization instructions', () => {
  for (const patch of [{ confirmed: false }, { evidenceDigest: 'stale' }, { paperId: 'paper-other' }]) {
    const input = fixture()
    Object.assign(input.confirmation, patch)
    assert.throws(() => restoreOcrSourcePresentation(input), /confirmed.*evidence/u)
  }
})

test('listening example requires manual source-backed capture rather than automatic absence', () => {
  const input = fixture()
  input.confirmation.documents[0].pages[0].orderedItems.push({ text: '例：What is the man doing?' })
  assert.throws(() => restoreOcrSourcePresentation(input), /Listening example/u)
})

test('no-listening paper neither adds listening directions nor an example', () => {
  const input = fixture()
  input.materialization.listening.state = 'not_supplied'
  input.confirmation.documents[0].pages[0].orderedItems.splice(0, 2)
  const result = restoreOcrSourcePresentation(input)
  assert.equal(result.sourcePresentation.instructions.length, 4)
  assert.equal(result.sourcePresentation.listeningExample, null)
})

// A retained current-producer cache isolates the real materialization job and receipt boundary
// without running OCR, rendering PDF or manufacturing another producer's output.
function cachedJob(t, input = fixture()) {
  const scratch = path.resolve(import.meta.dirname, '../../.scratch')
  mkdirSync(scratch, { recursive: true })
  const paperDir = mkdtempSync(path.join(scratch, 'presentation-job-test-'))
  t.after(() => rmSync(paperDir, { recursive: true, force: true }))
  mkdirSync(path.join(paperDir, 'materialization'))
  const bytes = Buffer.from('captured-source-fixture')
  const document = { documentId: 'renamed-question', role: 'question_source', mediaType: 'application/pdf',
    sha256: sha256(bytes), byteLength: bytes.length, pageCount: 2, path: 'question.pdf' }
  writeFileSync(path.join(paperDir, document.path), bytes)
  const manifest = { schemaVersion: 'universal-nck1-source-manifest-v1', paperId: 'paper-test',
    documents: [document], materializationPath: 'materialization/nck1-source-materialization-v1.json',
    mediaDirectory: 'materialization/media' }
  const producerVersion = nck1OcrProducerVersion(input.confirmation)
  const sourceDigest = nck1OcrProducerSourceDigest([{ ...document, bytes }], input)
  const output = `${JSON.stringify(input.materialization, null, 2)}\n`
  const outputDigest = sha256(Buffer.from(output))
  const listeningSourcePartition = { schemaVersion: 'nck1-listening-source-partition-v1',
    paperId: 'paper-test', producerVersion, producerSourceDigest: sourceDigest,
    originalMaterializationOutputDigest: outputDigest }
  const review = { schemaVersion: 'nck1-ocr-materialization-review-v1', paperId: 'paper-test',
    producerVersion, sourceDigest, required: [], listeningSourcePartition }
  const receipt = { schemaVersion: 'nck1-ocr-materialization-producer-receipt-v1', paperId: 'paper-test',
    producerVersion, sourceDigest, outputDigest, disposition: 'ready_for_verification',
    listeningSourcePartitionDigest: digestJson(listeningSourcePartition), mediaFiles: [] }
  const files = {
    'nck1-source-materialization-v1.json': input.materialization,
    'nck1-ocr-source-evidence-v1.json': input.evidence,
    'nck1-ocr-source-confirmation-v1.json': input.confirmation,
    'nck1-ocr-materialization-review-v1.json': review,
    'nck1-ocr-materialization-producer-receipt-v1.json': receipt,
  }
  for (const [name, value] of Object.entries(files)) {
    writeFileSync(path.join(paperDir, 'materialization', name), `${JSON.stringify(value, null, 2)}\n`)
  }
  return { paperDir, manifest, file: name => path.join(paperDir, 'materialization', name) }
}

test('materialization job closes missing listening directions on cache hits without rewriting producer evidence', t => {
  const job = cachedJob(t)
  const evidenceFiles = ['nck1-ocr-materialization-review-v1.json', 'nck1-ocr-materialization-producer-receipt-v1.json']
  const before = evidenceFiles.map(name => readFileSync(job.file(name)))
  assert.equal(inspectNck1Materialization(job).outputState, 'producer_output_unchanged')
  const result = runNck1MaterializationJob(job)
  assert.equal(result.cached, true)
  assert.equal(result.outputState, 'agent_modified')
  const restored = JSON.parse(readFileSync(result.outputPath))
  assert.equal(restored.sourcePresentation.instructions.length, 6)
  assert.equal(inspectNck1Materialization(job).outputState, 'agent_modified')
  evidenceFiles.forEach((name, i) => assert.deepEqual(readFileSync(job.file(name)), before[i]))
  const once = readFileSync(result.outputPath)
  runNck1MaterializationJob(job)
  assert.deepEqual(readFileSync(result.outputPath), once)
})

test('materialization job leaves retained output untouched when direction recovery is incomplete', t => {
  const input = fixture()
  input.confirmation.documents[0].pages[0].orderedItems.shift()
  const job = cachedJob(t, input)
  const original = readFileSync(job.file('nck1-source-materialization-v1.json'))
  assert.throws(() => runNck1MaterializationJob(job), /No confirmed direction/u)
  assert.deepEqual(readFileSync(job.file('nck1-source-materialization-v1.json')), original)
  assert.equal(inspectNck1Materialization(job).outputState, 'producer_output_unchanged')
})
