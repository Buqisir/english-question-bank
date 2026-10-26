import assert from 'node:assert/strict'
import { test, after } from 'node:test'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { compileOcrDrafts } from './ocr-proofread.mjs'
import { nck1OcrProducerVersion } from '../../server/paper-import/nck1OcrMaterializationProducer.mjs'

const work = mkdtempSync(path.join(tmpdir(), 'page-top-'))
after(() => rmSync(work, { recursive: true, force: true }))
// Explicit crops only read PNG dimensions, no image decoder or OCR is needed.
const imagePath = path.join(work, 'dimensions.png')
const bytes = Buffer.alloc(24)
bytes.writeUInt32BE(1000, 16)
bytes.writeUInt32BE(1000, 20)
writeFileSync(imagePath, bytes)

function fixture(imageOnly = false) {
  const key = 'question-p01'
  const figure = { figure: 'tokens', figureRegion: { x: 100, y: 100, width: 800, height: 300 },
    ...(imageOnly ? { imageOnly: true, reason: 'Source image has no OCR words' } : { words: 'w2', text: 'WIN!' }) }
  const words = [
    { number: 1, text: 'Header', line: 0, box: { left: 100, top: 10, width: 100, height: 20 } },
    ...(!imageOnly ? [{ number: 2, text: 'WIN!', line: 1, box: { left: 200, top: 200, width: 100, height: 50 } }] : []),
    { number: imageOnly ? 2 : 3, text: 'Question', line: 2, box: { left: 100, top: 600, width: 300, height: 50 } },
  ]
  return { paperId: 'paper-page-top', documents: [{ documentId: 'question', role: 'question_source' }],
    trace: { schemaVersion: 'ocr-proofread-trace-v2', sourceSetDigest: 'bound-source',
      pages: [{ key, documentId: 'question', page: 1, imagePath, words }] },
    drafts: { [key]: { documentId: 'question', page: 1, furniture: ['w1'],
      items: [figure, { words: `w${imageOnly ? 2 : 3}`, text: 'Question' }] } } }
}

for (const imageOnly of [false, true]) {
  test(`compile emits explicit page-top boundary (${imageOnly ? 'imageOnly' : 'OCR text'})`, () => {
    const input = fixture(imageOnly)
    const before = structuredClone(input)
    const result = compileOcrDrafts(input)
    const page = result.confirmation.documents[0].pages[0]
    assert.deepEqual(page.visualClassifications, [{ regionId: 'question:page-1:figure-1',
      classification: 'content_media', itemIds: imageOnly ? [] : ['question:item-1'], afterItemId: null }])
    assert.equal(page.orderedItems.length, imageOnly ? 1 : 2, 'no invented text anchor')
    assert.deepEqual(result.figures[0].pixels, { x: 100, y: 100, width: 800, height: 300 })
    assert.deepEqual(input, before)
    const v3 = { ...result.confirmation, schemaVersion: 'nck1-ocr-source-confirmation-v3' }
    assert.equal(nck1OcrProducerVersion(v3), 'nck1-ocr-materialization-producer-v32')
    page.visualClassifications[0].afterItemId = 'ordinary-anchor'
    assert.equal(nck1OcrProducerVersion(v3), 'nck1-ocr-materialization-producer-v31')
    assert.equal(nck1OcrProducerVersion(result.confirmation), 'nck1-ocr-materialization-producer-v30')
  })
}

function rejected(input, pattern) {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e',
    `import { compileOcrDrafts } from ${JSON.stringify(new URL('./ocr-proofread.mjs', import.meta.url).href)};
     compileOcrDrafts(${JSON.stringify(input)});`], { encoding: 'utf8' })
  assert.equal(result.status, 1, result.stderr)
  assert.match(result.stderr, pattern)
}

test('compile keeps imageOnly range, uniqueness, word overlap and answer-source restrictions', () => {
  let input = fixture(true)
  input.drafts['question-p01'].items[0].figureRegion.width = 1001
  rejected(input, /valid figureRegion/)
  input = fixture(true)
  input.drafts['question-p01'].items.push({ ...input.drafts['question-p01'].items[0] })
  rejected(input, /only item with that figure name/)
  input = fixture(true)
  input.drafts['question-p01'].items[0].figureRegion.height = 700
  rejected(input, /overlaps OCR words/)
  for (const imageOnly of [false, true]) {
    input = fixture(imageOnly)
    input.documents[0].role = 'official_answers'
    rejected(input, /preceding (ordinary )?item/)
  }
})

test('compile keeps nonempty anchor and item numbering', () => {
  const input = fixture()
  input.drafts['question-p01'].furniture = []
  input.drafts['question-p01'].items.unshift({ words: 'w1', text: 'Header' })
  const result = compileOcrDrafts(input)
  assert.deepEqual(result.confirmation.documents[0].pages[0].visualClassifications[0],
    { regionId: 'question:page-1:figure-1', classification: 'content_media',
      itemIds: ['question:item-2'], afterItemId: 'question:item-1' })
})
