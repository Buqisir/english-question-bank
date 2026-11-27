import { deepStrictEqual, throws } from 'node:assert/strict'
import { test } from 'node:test'
import { ANALYSIS_PDF_EDITION, productFiles } from '../../server/paper-import/pdfProductSet.mjs'
import { PAPER_PDF_EDITIONS } from '../../shared/paperPdfProducts.mjs'
import { assertMarkPdfProducts, assertMarkPushReceipt, markParagraph, moveUnderline } from './mark-redo.mjs'

const item = { text: 'its it', sourceEmphasis: [{ start: 0, end: 2, marks: ['bold', 'underline'] }] }

test('moves an underline out of a word and preserves its marks', () => {
  // Zhejiang Jan 2024, source p. 3: “its” is plain and “make it seem” marks “it” in bold and underline.
  deepStrictEqual(moveUnderline(item, '0,2', '4,6', 'it'),
    [{ start: 4, end: 6, marks: ['bold', 'underline'] }])
})

test('push requires the merged edit to match the current mark receipt', () => {
  const edit = { baseRevisionId: 'rev-test', block: 'reading-b:1', from: '0,2', to: '4,6', text: 'it' }
  assertMarkPushReceipt({ edit: { ...edit } }, edit)
  throws(() => assertMarkPushReceipt({}, edit), /缺少画线修订回执/)
  throws(() => assertMarkPushReceipt({ edit }, { ...edit, to: '7,9' }), /与当前回执不符/)
})

test('adds a missing underline', () => {
  deepStrictEqual(moveUnderline({ text: 'its it' }, 'none', '4,6', 'it'),
    [{ start: 4, end: 6, marks: ['underline'] }])
  deepStrictEqual(moveUnderline({ text: 'it' }, 'none', '0,2', 'it', true),
    [{ start: 0, end: 2, marks: ['bold', 'underline'] }])
})

test('maps an explicit OCR item to its paragraph offset and preserves observations and marks', () => {
  const first = { itemId: 'a', observationIds: ['oa'], text: 'See it',
    sourceEmphasis: [{ start: 0, end: 3, marks: ['bold'] }] }
  const last = { itemId: 'b', observationIds: ['ob'], text: 'before it moves.' }
  const items = [first, last]
  const edit = { from: 'none', to: '7,9', text: 'it', bold: true }
  const paragraph = 'See it before it moves.'
  throws(() => markParagraph(items, paragraph, edit), /须指定 --item/)
  throws(() => markParagraph(items, paragraph, { ...edit, item: 'c' }), /不属于/)
  throws(() => markParagraph([...items, ...items], paragraph, { ...edit, item: 'b' }), /唯一对应/)
  deepStrictEqual(markParagraph(items, paragraph, { ...edit, item: 'b' }), 'b')
  deepStrictEqual(items, [{ ...first, text: paragraph, observationIds: ['oa', 'ob'],
    sourceEmphasis: [...first.sourceEmphasis, { start: 14, end: 16, marks: ['bold', 'underline'] }] }])
})

test('rejects mismatched slices and destinations inside a word', () => {
  throws(() => moveUnderline(item, '1,3', '4,6', 'it'), /坐标文本/)
  throws(() => moveUnderline(item, '0,2', '3,5', 'it'), /坐标文本/)
  throws(() => moveUnderline(item, 'none', '0,2', 'it'), /整词/)
})

test('mark merge preserves standard PDFs and requires a companion only for full teaching analysis', () => {
  const standard = productFiles(PAPER_PDF_EDITIONS)
  const withCompanion = productFiles([...PAPER_PDF_EDITIONS, ANALYSIS_PDF_EDITION])
  const listeningOnly = { importProfile: 'public-paper-v1', analysisDigest: `sha256:${'a'.repeat(64)}`,
    analysisSidecars: { 'listening-analysis-v1.json': {} } }
  const full = { ...listeningOnly,
    analysisSidecars: { ...listeningOnly.analysisSidecars, 'reading-choice-analysis-v1.json': {} } }

  assertMarkPdfProducts(standard, standard, listeningOnly)
  assertMarkPdfProducts(withCompanion, standard, listeningOnly)
  throws(() => assertMarkPdfProducts(standard, standard.slice(1), listeningOnly), { name: 'AssertionError' })
  throws(() => assertMarkPdfProducts(standard, standard, full), { name: 'AssertionError' })
  assertMarkPdfProducts(standard, withCompanion, full)
})
