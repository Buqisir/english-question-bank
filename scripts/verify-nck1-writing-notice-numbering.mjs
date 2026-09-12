#!/usr/bin/env node

import assert from 'node:assert/strict'

import { importCanonicalCandidate } from '../shared/paper-canonical/compiler.mjs'
import { produceNck1DocxMaterialization } from '../server/paper-import/nck1DocxMaterializationProducer.mjs'
import { validateNck1SourceMaterialization } from '../shared/paper-canonical/nck1SourceMaterialization.mjs'
import { writingNoticeGroup, writingWordCount } from '../shared/paper-canonical/applicationWritingDisplay.mjs'
import {
  makeSyntheticNck1DocxFixture,
} from '../test-fixtures/paper-import/nck1-docx-materialization-v1/fixture.mjs'

function paragraphText(block) {
  if (block.kind !== 'paragraph') return ''
  return block.content.map((item) => item.kind === 'text' ? item.text : '').join('')
}

function produceAndImport(options) {
  const fixture = makeSyntheticNck1DocxFixture(options)
  const produced = produceNck1DocxMaterialization({
    paperId: fixture.paperId,
    documents: fixture.sourceDocuments,
  })
  const input = {
    kind: 'nck1-source-materialization',
    materializationBytes: new TextEncoder().encode(JSON.stringify(
      produced.materialization,
    )),
    documents: fixture.sourceDocuments.map((document) => ({
      documentId: document.documentId,
      bytes: document.bytes,
    })),
    media: [],
  }
  const imported = importCanonicalCandidate(input)
  return { fixture, produced, imported }
}

function writingGroup(produced, slotId) {
  return produced.materialization.groups.find((group) => group.slotId === slotId)
}

function adapterIssues(imported) {
  return imported.candidate ? imported.candidate.issues : []
}

// ---------------------------------------------------------------------------
// Control: ASCII digit notice (split-paragraph layout) — must still pass
// ---------------------------------------------------------------------------
{
  const { produced, imported } = produceAndImport({})
  assert.equal(produced.disposition, 'ready_for_verification')

  const appGroup = writingGroup(produced, 'writing.application')
  assert.equal(appGroup.writingTask.wordCountTarget, 80)

  const validationIssues = validateNck1SourceMaterialization(produced.materialization)
  assert.deepEqual(validationIssues, [], 'validator passes for ASCII digit split-paragraph notice')

  assert.deepEqual(adapterIssues(imported), [],
    'adapter derives candidate without issues for ASCII digit split-paragraph notice')
  assert.equal(imported.candidate?.interpretation.groups.length, 9)
  console.log('ASCII digit split-paragraph notice: PASS')
}

// ---------------------------------------------------------------------------
// Control: Chinese numeral notice (split-paragraph layout) — must still pass
// ---------------------------------------------------------------------------
{
  const { produced, imported } = produceAndImport({ chineseNoticeNumbering: true })
  assert.equal(produced.disposition, 'ready_for_verification')

  const appGroup = writingGroup(produced, 'writing.application')
  assert.equal(appGroup.writingTask.wordCountTarget, 80)

  const validationIssues = validateNck1SourceMaterialization(produced.materialization)
  assert.deepEqual(validationIssues, [],
    'validator passes for Chinese-numeral split-paragraph notice')

  assert.deepEqual(adapterIssues(imported), [],
    'adapter derives candidate without issues for Chinese-numeral split-paragraph notice')
  console.log('Chinese-numeral split-paragraph notice: PASS')
}

// ---------------------------------------------------------------------------
// Fix: full-width ASCII digit notice (split-paragraph layout) — must now pass
// ---------------------------------------------------------------------------
{
  const { produced, imported } = produceAndImport({ fullWidthNoticeNumbering: true })
  assert.equal(produced.disposition, 'ready_for_verification',
    'producer declares ready_for_verification for full-width digit notice')

  const appGroup = writingGroup(produced, 'writing.application')

  // The producer detects the word-count notice via NFKC normalization.
  assert.equal(appGroup.writingTask.wordCountTarget, 80,
    'producer identifies wordCountTarget 80 for full-width digit notice')

  // Verify the block text actually contains full-width digits (raw storage).
  const wordCountParagraph = appGroup.blocks.find((block) =>
    block.kind === 'paragraph' && paragraphText(block).includes('写作词数'))
  assert.ok(wordCountParagraph, 'word-count paragraph exists')
  assert.ok(/１/.test(paragraphText(wordCountParagraph)),
    'word-count paragraph stores raw full-width digit in block content')

  // The validator applies NFKC and must pass with zero issues.
  const validationIssues = validateNck1SourceMaterialization(produced.materialization)
  assert.deepEqual(validationIssues, [],
    'validator passes for full-width digit split-paragraph notice')

  // The adapter must agree with the validator — zero derivation issues.
  const issues = adapterIssues(imported)
  assert.deepEqual(issues, [],
    'adapter derives candidate without issues for full-width digit split-paragraph notice')

  // Verify the application-writing variant was fully derived (not null).
  assert.equal(imported.candidate?.interpretation.groups.length, 9)
  const appVariant = imported.candidate.interpretation.groups.find((group) =>
    group.variant?.family === 'application-writing')
  assert.ok(appVariant, 'application-writing variant is present in the candidate')
  assert.equal(appVariant.variant.wordCountRuling.target, 80,
    'wordCountRuling target is 80 in the derived candidate')

  console.log('Full-width digit split-paragraph notice: PASS')
}

// ---------------------------------------------------------------------------
// Fix: circled digit notice (split-paragraph layout) — must now pass
// ---------------------------------------------------------------------------
{
  const { produced, imported } = produceAndImport({ circledNoticeNumbering: true })
  assert.equal(produced.disposition, 'ready_for_verification',
    'producer declares ready_for_verification for circled digit notice')

  const appGroup = writingGroup(produced, 'writing.application')
  assert.equal(appGroup.writingTask.wordCountTarget, 80,
    'producer identifies wordCountTarget 80 for circled digit notice')

  // Verify the block text actually contains circled digits (raw storage).
  const wordCountParagraph = appGroup.blocks.find((block) =>
    block.kind === 'paragraph' && paragraphText(block).includes('写作词数'))
  assert.ok(/①/.test(paragraphText(wordCountParagraph)),
    'word-count paragraph stores raw circled digit in block content')

  // The validator applies NFKC and must pass with zero issues.
  const validationIssues = validateNck1SourceMaterialization(produced.materialization)
  assert.deepEqual(validationIssues, [],
    'validator passes for circled digit split-paragraph notice')

  // The adapter must agree with the validator — zero derivation issues.
  const issues = adapterIssues(imported)
  assert.deepEqual(issues, [],
    'adapter derives candidate without issues for circled digit split-paragraph notice')

  // Verify the application-writing variant was fully derived (not null).
  assert.equal(imported.candidate?.interpretation.groups.length, 9)
  const appVariant = imported.candidate.interpretation.groups.find((group) =>
    group.variant?.family === 'application-writing')
  assert.ok(appVariant, 'application-writing variant is present in the candidate')
  assert.equal(appVariant.variant.wordCountRuling.target, 80,
    'wordCountRuling target is 80 in the derived candidate')

  console.log('Circled digit split-paragraph notice: PASS')
}

// ---------------------------------------------------------------------------
// Regression guard: confirm that the raw-text detection path would have
// failed for full-width digits but NFKC-normalized detection succeeds.
// This ensures the fix targets the correct code path.
// ---------------------------------------------------------------------------
{
  const { produced } = produceAndImport({ fullWidthNoticeNumbering: true })
  const appGroup = writingGroup(produced, 'writing.application')
  const paragraphs = appGroup.blocks.filter((block) => block.kind === 'paragraph')

  // Raw text: writingNoticeGroup finds only the label (blockCount 1) and
  // cannot locate the word-count paragraph — this is the pre-fix bug.
  const rawTexts = paragraphs.map(paragraphText)
  const rawNotice = writingNoticeGroup(rawTexts)
  assert.ok(rawNotice, 'notice group is detected on raw text')
  assert.equal(rawNotice.blockCount, 1,
    'raw-text notice contains only the label paragraph (bug behavior)')

  const rawNoticeBlocks = paragraphs.slice(
    rawNotice.startIndex, rawNotice.startIndex + rawNotice.blockCount)
  const rawWordCountBlock = rawNoticeBlocks.find((block) =>
    writingWordCount(paragraphText(block)) === 80)
  assert.equal(rawWordCountBlock, undefined,
    'raw-text notice does not contain the word-count paragraph (bug)')

  // NFKC-normalized text: writingNoticeGroup finds the full 3-paragraph
  // notice, correctly identifying the word-count paragraph.
  const normalizedTexts = rawTexts.map((text) => text.normalize('NFKC'))
  const normalizedNotice = writingNoticeGroup(normalizedTexts)
  assert.ok(normalizedNotice, 'notice group is detected on NFKC-normalized text')
  assert.equal(normalizedNotice.blockCount, 3,
    'NFKC-normalized notice spans label + 2 continuation paragraphs (fix)')

  const normalizedNoticeBlocks = paragraphs.slice(
    normalizedNotice.startIndex,
    normalizedNotice.startIndex + normalizedNotice.blockCount)
  const normalizedWordCountBlock = normalizedNoticeBlocks.find((block) =>
    writingWordCount(paragraphText(block)) === 80)
  assert.ok(normalizedWordCountBlock,
    'NFKC-normalized notice contains the word-count paragraph (fix)')
  assert.ok(/１/.test(paragraphText(normalizedWordCountBlock)),
    'word-count paragraph retains raw full-width digit in block content')

  // Key invariant: NFKC normalization is per-element — startIndex/blockCount
  // map back to the raw paragraphs array.
  assert.equal(rawNotice.startIndex, normalizedNotice.startIndex,
    'startIndex is identical between raw and NFKC notice (index invariant)')

  console.log('Regression guard (raw vs NFKC detection): PASS')
}

console.log('verify-nck1-writing-notice-numbering: PASS')
