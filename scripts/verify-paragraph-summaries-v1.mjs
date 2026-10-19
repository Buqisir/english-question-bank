#!/usr/bin/env node

import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import Ajv from '../server/node_modules/ajv/dist/2020.js'

import {
  enumerateParagraphSummaryTargets,
  validateParagraphSummaries,
} from '../server/paper-import-ai/paragraphSummaries.mjs'
import { invalidateParagraphSummariesForListeningSupplement } from './import-pipeline/paragraph-summary-rebinding.mjs'

const digestA = `sha256:${'a'.repeat(64)}`
const digestB = `sha256:${'b'.repeat(64)}`
const source = { kind: 'docx_part', documentId: 'questions', part: 'word/document.xml', selector: 'p[1]' }
const paragraph = (blockId, role, text) => ({ kind: 'paragraph', blockId, role, content: [{ kind: 'text', text }], source })
const group = (groupId, family, blocks, writingTask = null) => ({ groupId, family, blocks, writingTask })
const materialization = {
  paperId: 'paper-summary-test',
  groups: [
    group('reading-a', 'reading', [paragraph('read-title', 'title', 'Heading'), paragraph('read-body', 'body', 'Reading prose')]),
    group('seven', 'seven-choices', [paragraph('seven-body', 'body', 'Gapped prose'), paragraph('seven-subtitle', 'subtitle', 'Subheading')]),
    group('framed', 'reading', [{ kind: 'framed_columns', blockId: 'frame', source, columns: [
      { columnId: 'left', headingBlockId: 'left-heading', blocks: [paragraph('left-heading', 'body', 'Column heading'), paragraph('left-body', 'body', 'Column prose')] },
      { columnId: 'right', headingBlockId: null, blocks: [paragraph('right-body', 'body', 'More prose')] },
    ] }]),
    group('cloze', 'cloze', [paragraph('cloze-body', 'body', 'Cloze prose')]),
    group('grammar', 'grammar-fill', [paragraph('grammar-body', 'body', 'Grammar prose')]),
    group('continuation', 'continuation-writing', [
      paragraph('continuation-instruction', 'body', 'Continue the story.'),
      paragraph('continuation-title', 'title', 'An unexpected journey'),
      paragraph('continuation-subtitle', 'subtitle', 'The way home'),
      paragraph('continuation-body', 'body', 'The source story.'),
      paragraph('continuation-body-2', 'body', 'The journey continued.'),
      paragraph('continuation-notice', 'body', 'Write two paragraphs.'),
      paragraph('continuation-starter', 'body', 'The source story.'),
    ], {
      material: ['An unexpected journey', 'The way home', 'The source story.', 'The journey continued.'],
      starters: ['The source story.'],
    }),
    group('application', 'application-writing', [paragraph('application-prompt', 'body', 'Write a letter.')]),
  ],
}

const targets = enumerateParagraphSummaryTargets(materialization)
assert.deepEqual(targets.map(({ groupId, paragraphId }) => [groupId, paragraphId]), [
  ['reading-a', 'read-body'], ['seven', 'seven-body'], ['framed', 'left-body'],
  ['framed', 'right-body'], ['cloze', 'cloze-body'], ['grammar', 'grammar-body'],
  ['continuation', 'continuation-body'], ['continuation', 'continuation-body-2'],
])
assert.throws(
  () => enumerateParagraphSummaryTargets({ groups: [group(
    'ambiguous-continuation',
    'continuation-writing',
    [paragraph('prompt', 'body', 'Prompt'), paragraph('starter', 'body', 'Starter')],
    { material: ['Missing material'], starters: ['Starter'] },
  )] }),
  /SUMMARY_CONTINUATION_STRUCTURE_AMBIGUOUS/,
)

const continuation = materialization.groups.find(({ groupId }) => groupId === 'continuation')
for (const headingIndex of [1, 2]) {
  const mismatchedHeading = structuredClone(continuation)
  mismatchedHeading.blocks[headingIndex].content[0].text = 'A different heading'
  assert.throws(
    () => enumerateParagraphSummaryTargets({ groups: [mismatchedHeading] }),
    /SUMMARY_CONTINUATION_STRUCTURE_AMBIGUOUS/,
    'heading text must match its exact material position',
  )
}
const shiftedMaterial = structuredClone(continuation)
shiftedMaterial.blocks.splice(1, 0, paragraph('extra-prompt', 'body', 'Another instruction.'))
assert.throws(
  () => enumerateParagraphSummaryTargets({ groups: [shiftedMaterial] }),
  /SUMMARY_CONTINUATION_STRUCTURE_AMBIGUOUS/,
  'material shifted by an extra prompt must remain blocked',
)
const reorderedMaterial = structuredClone(continuation)
;[reorderedMaterial.blocks[3], reorderedMaterial.blocks[4]] = [reorderedMaterial.blocks[4], reorderedMaterial.blocks[3]]
assert.throws(
  () => enumerateParagraphSummaryTargets({ groups: [reorderedMaterial] }),
  /SUMMARY_CONTINUATION_STRUCTURE_AMBIGUOUS/,
  'reordered material must remain blocked',
)

const valid = {
  schemaVersion: 'paragraph-summaries-v1', paperId: materialization.paperId,
  sourceDigest: digestA, candidateDigest: digestB,
  groups: [...Map.groupBy(targets, (target) => target.groupId)].map(([groupId, values]) => ({
    groupId,
    paragraphs: values.map(({ paragraphId }) => ({ paragraphId, summary: '来源支持的摘要。' })),
  })),
}
const schema = JSON.parse(readFileSync(new URL('../schemas/paper-import/paragraph-summaries-v1.schema.json', import.meta.url)))
assert.equal(new Ajv({ strict: true }).compile(schema)(valid), true)
assert.deepEqual(validateParagraphSummaries({ sidecar: valid, materialization, sourceDigest: digestA, candidateDigest: digestB }), [])

const codes = (sidecar, binding = {}) => new Set(validateParagraphSummaries({
  sidecar, materialization, sourceDigest: binding.sourceDigest || digestA,
  candidateDigest: binding.candidateDigest || digestB,
}).map((entry) => entry.code))
assert.ok(codes(valid, { sourceDigest: `sha256:${'c'.repeat(64)}` }).has('SUMMARY_BINDING_STALE'))

const wrongGroup = structuredClone(valid)
wrongGroup.groups[0].paragraphs.push(wrongGroup.groups[1].paragraphs.pop())
assert.ok(codes(wrongGroup).has('SUMMARY_GROUP_MISMATCH'))

const omittedDuplicate = structuredClone(valid)
const removed = omittedDuplicate.groups[0].paragraphs.pop()
omittedDuplicate.groups[1].paragraphs.push(structuredClone(omittedDuplicate.groups[1].paragraphs[0]))
assert.ok(codes(omittedDuplicate).has('SUMMARY_PARAGRAPH_MISSING'))
assert.ok(codes(omittedDuplicate).has('SUMMARY_PARAGRAPH_DUPLICATE'))
assert.ok(!codes(omittedDuplicate).has('SUMMARY_PARAGRAPH_FOREIGN'))
assert.ok(removed)

const foreign = structuredClone(valid)
foreign.groups.push({ groupId: 'foreign-group', paragraphs: [{ paragraphId: 'foreign-paragraph', summary: '摘要。' }] })
assert.ok(codes(foreign).has('SUMMARY_GROUP_FOREIGN'))
assert.ok(codes(foreign).has('SUMMARY_PARAGRAPH_FOREIGN'))

const blank = structuredClone(valid)
blank.groups[0].paragraphs[0].summary = '   '
assert.ok(codes(blank).has('SUMMARY_TEXT_EMPTY'))

const supplementRoot = mkdtempSync(path.join(tmpdir(), 'eqb-summary-rebind-'))
try {
  mkdirSync(supplementRoot, { recursive: true })
  writeFileSync(path.join(supplementRoot, 'config.json'), JSON.stringify({
    paperId: materialization.paperId,
    importProfile: 'public-paper-v1',
    sources: [{ sourceId: 'question-source' }],
  }))
  writeFileSync(path.join(supplementRoot, 'paragraph-summaries-v1.json'), JSON.stringify(valid))
  assert.throws(
    () => invalidateParagraphSummariesForListeningSupplement(supplementRoot),
    /public-search-metadata-v1\.json/,
    'all sidecars are preflighted before either file is archived',
  )
  assert.equal(existsSync(path.join(supplementRoot, 'paragraph-summaries-v1.json')), true)
  writeFileSync(path.join(supplementRoot, 'public-search-metadata-v1.json'), '{}')
  const archived = invalidateParagraphSummariesForListeningSupplement(supplementRoot)
  assert.equal(existsSync(path.join(supplementRoot, 'paragraph-summaries-v1.json')), false)
  assert.equal(existsSync(path.join(supplementRoot, 'public-search-metadata-v1.json')), false)
  assert.equal(existsSync(path.join(supplementRoot, 'paragraph-summaries-v1.before-listening-supplement.json')), true)
  assert.equal(existsSync(path.join(supplementRoot, 'public-search-metadata-v1.before-listening-supplement.json')), true)
  assert.match(archived.staleSummaryPath, /paragraph-summaries-v1\.before-listening-supplement\.json$/)
  assert.match(archived.staleSearchMetadataPath, /public-search-metadata-v1\.before-listening-supplement\.json$/)
  const preservedConfig = JSON.parse(readFileSync(path.join(supplementRoot, 'config.json'), 'utf8'))
  assert.equal(preservedConfig.importProfile, 'public-paper-v1')
  assert.equal(preservedConfig.sources[0].sourceId, 'question-source')
  assert.ok(codes(valid, { sourceDigest: `sha256:${'d'.repeat(64)}` }).has('SUMMARY_BINDING_STALE'))
} finally {
  rmSync(supplementRoot, { recursive: true, force: true })
}

console.log('PASS paragraph-summaries-v1 enumeration, schema, binding, association and exact coverage')
