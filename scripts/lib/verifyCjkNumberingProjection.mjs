import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { chineseContextNumbering } from '../../shared/chineseContextNumbering.mjs'
import { addOcrNumberingProjections, computeOcrNumberingProjection,
  OCR_NUMBERING_REPORT_VERSION } from '../../shared/ocrNumberingProjection.mjs'
import { sha256 } from '../../shared/paper-canonical/stable.mjs'
import { nck1OcrSourceSetDigest } from '../../server/paper-import/nck1OcrSourceEvidence.mjs'
import { validateAgentOcrCorrectionSidecar } from '../../server/import-review/revisionProjection.mjs'
import { validateAgentOcrCorrectionReceipt } from '../../server/import-review/importReviewStore.mjs'
import { importSubmissionIssues } from '../import-pipeline/lib-import-submit-gate.mjs'

export function verifyCjkNumberingProjection() {
  const original = [
    '内容包括：(1)家务劳动的意义；', '(2)你的具体倡议。',
    '(1)写作词数应为80左右；', '(2)可适当增加细节，以使行文连贯。',
    '(1)续写词数应为150左右；', '(2)请按如下格式在答题卡的相应位置作答。',
  ]
  const projected = [
    '内容包括：（1）家务劳动的意义；', '（2）你的具体倡议。',
    '（1）写作词数应为80左右；', '（2）可适当增加细节，以使行文连贯。',
    '（1）续写词数应为150左右；', '（2）请按如下格式在答题卡的相应位置作答。',
  ]
  const source = { documentId: 'question-source-1', page: 9 }
  const materialization = { groups: [{ blocks: original.map(text => ({
    kind: 'paragraph', source, content: [{ kind: 'text', text }],
  })) }] }
  const bytes = Buffer.from('synthetic immutable source bytes')
  const documents = [{ ...source, role: 'question', mediaType: 'application/pdf',
    sha256: sha256(bytes), byteLength: bytes.length, pageCount: 10 }]
  const orderedItems = original.map((text, index) => ({ itemId: `item-${index}`, text }))
  const entries = [0, 2, 4].map(index => ({
    ocrItemId: `item-${index}`, category: 'ocr_misrecognition',
    before: `raw OCR ${index}\n`, after: original[index], reason: '按原图恢复完整条目',
    sourceLocator: source,
    materializationTarget: { jsonPointer: `/groups/0/blocks/${index}/content/0/text` },
  }))
  const receipt = {
    paperId: 'paper-synthetic-cjk-numbering', revisionId: 'ocr-revision',
    confirmationId: 'ocr-confirmation', reviewerKind: 'import_agent',
    sourceSetDigest: nck1OcrSourceSetDigest(documents), evidenceDigest: sha256(Buffer.from('evidence')),
    confirmation: { documents: [{ documentId: source.documentId,
      pages: [{ page: 9, orderedItems }] }] },
    correctionReport: { sourceSetDigest: nck1OcrSourceSetDigest(documents),
      entries: entries.map(entry => ({ itemId: entry.ocrItemId, ...source,
        ocrText: entry.before, correctedText: entry.after })) },
  }
  const oldReport = {
    schemaVersion: 'agent-ocr-correction-report-v2', paperId: receipt.paperId,
    ocrRevisionId: receipt.revisionId, ocrConfirmationId: receipt.confirmationId,
    originalSourceSetDigest: receipt.sourceSetDigest, ocrEvidenceDigest: receipt.evidenceDigest,
    sourceDigest: sha256(Buffer.from('source')), candidateDigest: sha256(Buffer.from('candidate')), entries,
  }
  const context = { materialization, paperId: receipt.paperId, documents,
    sourceDocuments: [{ documentId: source.documentId, bytes }],
    sourceDigest: oldReport.sourceDigest, candidateDigest: oldReport.candidateDigest }
  const check = (report, mat = materialization, rec = receipt) => {
    validateAgentOcrCorrectionSidecar(report, { ...context, materialization: mat })
    validateAgentOcrCorrectionReceipt(report, rec, mat)
  }
  const receiptBytes = JSON.stringify(receipt), oldBytes = JSON.stringify(oldReport)
  check(oldReport)
  const next = structuredClone(materialization)
  next.groups[0].blocks.forEach((block, index) => { block.content[0].text = projected[index] })
  const authored = { ...structuredClone(oldReport), entries: entries.map((entry, index) => ({
    ...structuredClone(entry), after: projected[index * 2],
  })) }
  assert.throws(() => check(authored, next), /historical OCR item/)
  const report = addOcrNumberingProjections(authored, receipt, next)
  assert.equal(report.schemaVersion, OCR_NUMBERING_REPORT_VERSION)
  assert.equal(report.entries.filter(entry => entry.standardizationProjection).length, 3)
  check(report, next)
  assert.deepEqual(importSubmissionIssues({ materialization: next }), [])
  for (const [index, entry] of report.entries.entries()) {
    assert.equal(entry.before, entries[index].before)
    assert.equal(entry.category, entries[index].category)
    assert.equal(entry.standardizationProjection.historicalConfirmedText, original[index * 2])
  }
  assert.equal(JSON.stringify(receipt), receiptBytes)
  assert.equal(JSON.stringify(oldReport), oldBytes)
  check(oldReport) // Exact historical replay still succeeds.
  assert.deepEqual(addOcrNumberingProjections(report, receipt, next), report)
  assert.equal(computeOcrNumberingProjection(report, report.entries[0], next, projected[0]), null)
  assert.throws(() => check({ ...report, schemaVersion: oldReport.schemaVersion }, next),
    /invalid standardization projection/)
  assert.throws(() => check({ ...report, entries: authored.entries }, next), /historical OCR item/)

  // English syntax, quotations and pure Chinese word glosses are not projected.
  for (const text of ['Include (1) a title.', '请翻译 “Include (1) a title.”。',
    '(1) Receive a badge(徽章) after class.', '(20) Receive a badge （徽章） after class.']) {
    assert.equal(chineseContextNumbering(text).length, 0)
    const mat = structuredClone(next), entry = structuredClone(report.entries[0])
    entry.after = text.replace('(', '（').replace(')', '）')
    mat.groups[0].blocks[0].content[0].text = entry.after
    assert.equal(computeOcrNumberingProjection(report, entry, mat, text), null)
  }
  // A real Chinese mixed/nested gloss remains eligible, just as in #570.
  for (const text of ['(1) Receive a badge(gloss(徽章)) after class.',
    '(1) Receive a badge(徽章 “badge”) after class.']) {
    assert.equal(chineseContextNumbering(text).length, 1)
  }
  assert.equal(chineseContextNumbering('要点：(1) DIY 活动；').length, 1)
  assert.equal(chineseContextNumbering('要点：Include (1) a title.', ['要点：', 'Include (1) a title.']).length, 0)

  // Identity, exact target, historical text and byte ranges cannot be substituted.
  const tamper = [
    r => { r.paperId = 'paper-wrong' },
    r => { r.ocrRevisionId = 'other' },
    r => { r.ocrConfirmationId = 'other' },
    r => { r.originalSourceSetDigest = sha256(Buffer.from('wrong')) },
    r => { r.ocrEvidenceDigest = sha256(Buffer.from('wrong')) },
    r => { r.entries[0].ocrItemId = 'other' },
    r => { r.entries[0].sourceLocator.documentId = 'other' },
    r => { r.entries[0].sourceLocator.page = 10 },
    r => { r.entries[0].materializationTarget.jsonPointer = '/groups/0/blocks/1/content/0/text' },
    r => { r.entries[0].before += ' ' },
    r => { r.entries[0].category = 'source_layout_error' },
    r => { r.entries[0].standardizationProjection.ruleVersion = 'other' },
    r => { r.entries[0].standardizationProjection.historicalConfirmedText += ' ' },
    r => { r.entries[0].standardizationProjection.targetPointer = '/wrong' },
    r => { r.entries[0].standardizationProjection.changes[0].start++ },
    r => { r.entries[0].standardizationProjection.changes.pop() },
    r => { r.entries[0].standardizationProjection.extra = true },
  ]
  for (const mutate of tamper) {
    const changed = structuredClone(report)
    mutate(changed)
    assert.throws(() => check(changed, next))
  }
  for (const mutate of [
    r => { r.paperId = 'paper-other' }, r => { r.evidenceDigest = 'wrong' },
    r => { r.correctionReport.entries[0].correctedText += ' ' },
    r => { r.correctionReport.entries[0].documentId = 'other' },
    r => { r.confirmation.documents[0].pages[0].orderedItems[0].text += ' ' },
  ]) {
    const changed = structuredClone(receipt)
    mutate(changed)
    assert.throws(() => check(report, next, changed))
  }
  // Recompute even when both Materialization and author-supplied ranges agree.
  for (const after of ['内容包括：（2）家务劳动的意义；', '内容包括：（1）劳动的意义；',
    '内容包括：（1）家务劳动的意义。']) {
    const mat = structuredClone(next), changed = structuredClone(report)
    mat.groups[0].blocks[0].content[0].text = after
    changed.entries[0].after = after
    assert.throws(() => check(changed, mat))
  }
  const spaced = '要点：( 1 )  保留空格；'
  const spacedAfter = '要点：（ 1 ）  保留空格；'
  const spacedMat = structuredClone(next), spacedEntry = structuredClone(report.entries[0])
  spacedMat.groups[0].blocks[0].content[0].text = spacedEntry.after = spacedAfter
  const projection = computeOcrNumberingProjection(report, spacedEntry, spacedMat, spaced)
  assert.ok(projection)
  assert.equal(projection.changes.length, 2)
  spacedMat.groups[0].blocks[0].content[0].text = spacedEntry.after = spacedAfter.replace('  ', ' ')
  assert.equal(computeOcrNumberingProjection(report, spacedEntry, spacedMat, spaced), null)

  // Full-item mapping cannot be invented for an OCR item split across runs.
  const split = structuredClone(next), splitEntry = structuredClone(report.entries[0])
  split.groups[0].blocks[0].content = [{ kind: 'text', text: '内容包括：（' },
    { kind: 'text', text: '1）家务劳动的意义；' }]
  splitEntry.after = '内容包括：（'
  assert.equal(computeOcrNumberingProjection(report, splitEntry, split, original[0]), null)
  // Do not borrow Chinese from a neighboring, already-normalized numbered item.
  split.groups[0].blocks[0].content = [{ kind: 'text', text: '（1） DIY only' },
    { kind: 'text', text: '（2）中文活动' }]
  splitEntry.after = '（1） DIY only'
  assert.equal(computeOcrNumberingProjection(report, splitEntry, split, '(1) DIY only'), null)
  const wrongSource = structuredClone(next)
  wrongSource.groups[0].blocks[0].source.page = 10
  assert.throws(() => check(report, wrongSource))
  console.log('verify-cjk-numbering-projection: PASS')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) verifyCjkNumberingProjection()
