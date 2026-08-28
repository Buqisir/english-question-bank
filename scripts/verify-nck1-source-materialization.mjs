import assert from 'node:assert/strict'

import {
  digestNck1SourceMaterialization,
  validateNck1SourceMaterialization,
} from '../shared/paper-canonical/nck1SourceMaterialization.mjs'

const hash = `sha256:${'a'.repeat(64)}`
const locator = (documentId = 'paper') => ({
  kind: 'page_region',
  documentId,
  page: 1,
  region: { x: 0, y: 0, width: 1, height: 1 },
})
const options = (labels) => labels.map((label) => ({ label, text: `${label} option` }))
const slots = [
  ['reading.a', 'reading', 21, 23],
  ['reading.b', 'reading', 24, 27],
  ['reading.c', 'reading', 28, 31],
  ['reading.d', 'reading', 32, 35],
  ['seven-choices', 'seven-choices', 36, 40],
  ['cloze', 'cloze', 41, 55],
  ['grammar-fill', 'grammar-fill', 56, 65],
  ['writing.application', 'application-writing', null, null],
  ['writing.continuation', 'continuation-writing', null, null],
]

export function makeFixture({ listening = false, mixedTable = false } = {}) {
  const groups = slots.map(([slotId, family, from, to]) => {
    const tail = slotId.replaceAll('.', '-').replaceAll(' ', '-')
    const blankNumbers = from === null || family === 'reading'
      ? []
      : Array.from({ length: to - from + 1 }, (_, index) => from + index)
    const blocks = [{
      kind: 'paragraph',
      blockId: `block:${tail}`,
      role: 'body',
      content: [
        { kind: 'text', text: `${slotId} source text` },
        ...blankNumbers.flatMap((number) => [
          { kind: 'blank_ref', blankId: `blank:${number}` },
          {
            kind: 'text',
            text: family === 'grammar-fill' && number % 2 === 0
              ? ' (word) after'
              : ` after ${number}`,
          },
        ]),
      ],
      source: locator(),
    }]
    if (family === 'seven-choices') {
      blocks.unshift({
        kind: 'paragraph',
        blockId: 'block:seven-choices:title',
        role: 'title',
        content: [{ kind: 'text', text: 'A source-bound passage title' }],
        source: locator(),
      })
    }
    if (slotId === 'reading.a') {
      blocks.push({
        kind: 'paragraph',
        blockId: 'block:reading-a:second-paragraph',
        role: 'body',
        content: [{ kind: 'text', text: 'reading.a second source paragraph' }],
        source: locator(),
      })
    }
    if (mixedTable && slotId === 'reading.a') {
      blocks.push({
        kind: 'table',
        blockId: 'block:product-label',
        columnCount: 2,
        rows: [{
          rowId: 'row:product-label:1',
          cells: [
            {
              cellId: 'cell:product-label:text',
              columnStart: 0,
              columnSpan: 1,
              rowSpan: 1,
              role: 'data',
              content: [{ kind: 'text', text: 'WARNING' }],
            },
            {
              cellId: 'cell:product-label:icon',
              columnStart: 1,
              columnSpan: 1,
              rowSpan: 1,
              role: 'data',
              content: [{
                kind: 'media_ref',
                mediaId: 'media:warning-icon',
                alt: 'Warning icon',
              }],
            },
          ],
        }],
        source: locator(),
      })
    }
    const writing = from === null
    if (family === 'application-writing') {
      blocks[0].content[0].text = 'application-writing prompt Write about the topic in about 80 words.'
      blocks.push(
        {
          kind: 'paragraph',
          blockId: 'block:application-notice',
          role: 'body',
          content: [{ kind: 'text', text: '注意：' }],
          source: locator(),
        },
        {
          kind: 'paragraph',
          blockId: 'block:application-word-count',
          role: 'body',
          content: [{ kind: 'text', text: '1. Write about 80 words.' }],
          source: locator(),
        },
        {
          kind: 'paragraph',
          blockId: 'block:application-format',
          role: 'body',
          content: [{ kind: 'text', text: '2. Use the following format.' }],
          source: locator(),
        },
        {
          kind: 'paragraph',
          blockId: 'block:application-salutation',
          role: 'body',
          content: [{ kind: 'text', text: 'Dear Chris,' }],
          source: locator(),
        },
      )
    }
    if (family === 'continuation-writing') {
      blocks[0].content[0].text = 'continuation-writing prompt'
      blocks.push(
        {
          kind: 'paragraph',
          blockId: 'block:continuation-material',
          role: 'body',
          content: [{ kind: 'text', text: 'Story material' }],
          source: locator(),
        },
        {
          kind: 'paragraph',
          blockId: 'block:continuation-notice',
          role: 'body',
          content: [{ kind: 'text', text: '注意：' }],
          source: locator(),
        },
        {
          kind: 'paragraph',
          blockId: 'block:continuation-word-count',
          role: 'body',
          content: [{ kind: 'text', text: '(1) Write about 150 words.' }],
          source: locator(),
        },
        {
          kind: 'paragraph',
          blockId: 'block:continuation-format',
          role: 'body',
          content: [{ kind: 'text', text: '(2) Write in the answer sheet following the given starters.' }],
          source: locator(),
        },
        {
          kind: 'paragraph',
          blockId: 'block:continuation-starter:1',
          role: 'body',
          content: [{ kind: 'text', text: 'Paragraph one starter.' }],
          source: locator(),
        },
        {
          kind: 'paragraph',
          blockId: 'block:continuation-starter:2',
          role: 'body',
          content: [{ kind: 'text', text: 'Paragraph two starter.' }],
          source: locator(),
        },
      )
    }
    return {
      slotId,
      groupId: `group:${tail}`,
      family,
      blocks,
      questions: writing
        ? []
        : Array.from({ length: to - from + 1 }, (_, index) => {
          const number = from + index
          return {
            questionId: `question:${number}`,
            sourceNumber: number,
            canonicalNumber: number,
            stem: family === 'reading' ? `Question ${number}?` : String(number),
            options: ['reading', 'cloze'].includes(family)
              ? options(['A', 'B', 'C', 'D'])
              : [],
            blankId: ['seven-choices', 'cloze', 'grammar-fill'].includes(family)
              ? `blank:${number}`
              : null,
            prompt: family === 'grammar-fill' && number % 2 === 0 ? 'word' : null,
            source: locator(),
          }
        }),
      optionBank: family === 'seven-choices'
        ? options(['A', 'B', 'C', 'D', 'E', 'F', 'G'])
        : [],
      writingTask: writing
        ? {
            taskType: family === 'application-writing' ? 'application' : 'continuation',
            prompt: family === 'application-writing'
              ? 'application-writing prompt Write about the topic in about 80 words.'
              : 'continuation-writing prompt',
            material: family === 'continuation-writing' ? ['Story material'] : [],
            starters: family === 'continuation-writing'
              ? ['Paragraph one starter.', 'Paragraph two starter.']
              : [],
            givenSkeleton: family === 'application-writing'
              ? [{ text: 'Dear Chris,', role: 'salutation' }]
              : [],
            wordCountTarget: family === 'application-writing' ? 80 : 150,
            officialModelAnswer: null,
            source: locator(),
          }
        : null,
    }
  })
  return {
    schemaVersion: 'nck1-source-materialization-v1',
    paperId: 'paper-mock-contract-2026-m1',
    profileId: 'nck1',
    documents: [
      {
        documentId: 'paper',
        role: 'question_source',
        mediaType: 'application/pdf',
        sha256: hash,
        byteLength: 100,
        pageCount: 10,
      },
      {
        documentId: 'answers',
        role: 'official_answers',
        mediaType: 'application/pdf',
        sha256: `sha256:${'b'.repeat(64)}`,
        byteLength: 100,
        pageCount: 2,
      },
    ],
    groups,
    answers: Array.from({ length: 45 }, (_, index) => {
      const number = 21 + index
      return {
        questionId: `question:${number}`,
        canonicalNumber: number,
        value: number < 56 ? 'A' : 'answer',
        authority: locator('answers'),
      }
    }),
    media: mixedTable
      ? [{
          mediaId: 'media:warning-icon',
          usage: 'content',
          kind: 'icon',
          mimeType: 'image/png',
          sha256: `sha256:${'c'.repeat(64)}`,
          pixelWidth: 32,
          pixelHeight: 32,
          extraction: {
            kind: 'pdf_crop',
            documentId: 'paper',
            page: 3,
            region: { x: 0.7, y: 0.4, width: 0.1, height: 0.1 },
            density: 300,
          },
        }]
      : [],
    sourceCoverage: {
      documentId: 'paper',
      reviewedPages: Array.from({ length: 10 }, (_, index) => index + 1),
      visuals: mixedTable
        ? [
            {
              visualId: 'visual:product-label',
              page: 1,
              disposition: 'semantic_table',
              targetId: 'block:product-label',
            },
            {
              visualId: 'visual:warning-icon',
              page: 1,
              disposition: 'content_media',
              targetId: 'media:warning-icon',
            },
          ]
        : [],
    },
    listening: listening
      ? {
          state: 'captured',
          questions: Array.from({ length: 20 }, (_, index) => ({
            canonicalNumber: index + 1,
            stem: `Listening ${index + 1}?`,
            options: options(['A', 'B', 'C']),
            source: locator(),
          })),
          answers: Array.from({ length: 20 }, (_, index) => ({
            canonicalNumber: index + 1,
            value: 'A',
            authority: locator('answers'),
          })),
          transcript: [
            ...Array.from({ length: 5 }, (_, index) => ({
              segmentId: `text:${index + 1}`,
              text: `Short listening transcript ${index + 1}.`,
              questionNumbers: [index + 1],
              source: locator('answers'),
            })),
            ...Array.from({ length: 5 }, (_, index) => ({
              segmentId: `text:${index + 6}`,
              text: `Long listening transcript ${index + 6}.`,
              questionNumbers: index < 4
                ? [6 + index * 3, 7 + index * 3, 8 + index * 3]
                : [18, 19, 20],
              source: locator('answers'),
            })),
          ],
          timing: [],
        }
      : {
          state: 'not_supplied',
          evidence: {
            kind: 'question_source_reviewed_no_listening_content',
            documentId: 'paper',
          },
        },
    issues: [],
  }
}

const plain = makeFixture()
assert.deepEqual(validateNck1SourceMaterialization(plain), [])
const reordered = Object.fromEntries(Object.entries(plain).reverse())
assert.equal(
  digestNck1SourceMaterialization(plain),
  digestNck1SourceMaterialization(reordered),
  'digest must ignore object key order',
)

const withListening = makeFixture({ listening: true })
assert.deepEqual(validateNck1SourceMaterialization(withListening), [])

const withMixedTable = makeFixture({ mixedTable: true })
assert.deepEqual(validateNck1SourceMaterialization(withMixedTable), [])

const withCombinedQuestionAndAnswers = makeFixture()
withCombinedQuestionAndAnswers.documents.find((document) =>
  document.documentId === 'paper').role = 'question_and_answers'
assert.deepEqual(validateNck1SourceMaterialization(withCombinedQuestionAndAnswers), [])

const withCombinedWritingNotice = makeFixture()
const combinedApplication = withCombinedWritingNotice.groups.find((group) =>
  group.slotId === 'writing.application')
combinedApplication.blocks.splice(1, 3, {
  kind: 'paragraph',
  blockId: 'block:application-notice-combined',
  role: 'body',
  content: [{
    kind: 'text',
    text: '注意：1. Write about 80 words. 2. Use the following format.',
  }],
  source: locator(),
})
assert.deepEqual(validateNck1SourceMaterialization(withCombinedWritingNotice), [])

const withSingleNumberedNoticeParagraph = makeFixture()
const singleParagraphApplication = withSingleNumberedNoticeParagraph.groups.find((group) =>
  group.slotId === 'writing.application')
singleParagraphApplication.blocks.splice(2, 2, {
  kind: 'paragraph',
  blockId: 'block:application-instructions-combined',
  role: 'body',
  content: [{
    kind: 'text',
    text: '1. Write about 80 words. 2. Add details where appropriate.',
  }],
  source: locator(),
})
assert.deepEqual(validateNck1SourceMaterialization(withSingleNumberedNoticeParagraph), [])

const missingAnswer = structuredClone(plain)
missingAnswer.answers.pop()
assert(validateNck1SourceMaterialization(missingAnswer).some((item) =>
  item.code === 'MATERIALIZATION_ANSWERS_INCOMPLETE'))

const unresolvedMedia = structuredClone(withMixedTable)
unresolvedMedia.media = []
assert(validateNck1SourceMaterialization(unresolvedMedia).some((item) =>
  item.code === 'MATERIALIZATION_MEDIA_UNRESOLVED'))

const duplicateMediaPlacement = structuredClone(withMixedTable)
duplicateMediaPlacement.groups[0].blocks.push({
  kind: 'figure',
  blockId: 'block:duplicate-warning-icon',
  mediaId: 'media:warning-icon',
  caption: '',
  source: locator(),
})
assert(validateNck1SourceMaterialization(duplicateMediaPlacement).some((item) =>
  item.code === 'MATERIALIZATION_MEDIA_PLACEMENT_INVALID'))

const invalidChoiceAnswer = structuredClone(plain)
invalidChoiceAnswer.answers[0].value = 'E'
assert(validateNck1SourceMaterialization(invalidChoiceAnswer).some((item) =>
  item.code === 'MATERIALIZATION_ANSWER_INVALID'))

const crossedOptionBoundary = structuredClone(plain)
crossedOptionBoundary.groups[0].questions[0].options[3].text = 'D option. 24. What comes next?'
assert(validateNck1SourceMaterialization(crossedOptionBoundary).some((item) =>
  item.code === 'MATERIALIZATION_OPTION_TEXT_SUSPICIOUS'))

const crossedListeningStemBoundary = structuredClone(withListening)
crossedListeningStemBoundary.listening.questions[0].stem = 'Question preface '.repeat(11)
assert(validateNck1SourceMaterialization(crossedListeningStemBoundary).some((item) =>
  item.code === 'MATERIALIZATION_LISTENING_QUESTION_INVALID'))

const invalidCrop = structuredClone(withMixedTable)
invalidCrop.media[0].extraction.region.x = 0.95
assert(validateNck1SourceMaterialization(invalidCrop).some((item) =>
  item.code === 'MATERIALIZATION_REGION_INVALID'))

const unresolvedIssue = structuredClone(plain)
unresolvedIssue.issues.push({ code: 'SOURCE_AMBIGUOUS' })
assert(validateNck1SourceMaterialization(unresolvedIssue).some((item) =>
  item.code === 'MATERIALIZATION_UNRESOLVED_ISSUES'))

const missingReviewedPage = structuredClone(plain)
missingReviewedPage.sourceCoverage.reviewedPages.pop()
assert(validateNck1SourceMaterialization(missingReviewedPage).some((item) =>
  item.code === 'MATERIALIZATION_SOURCE_PAGE_COVERAGE_INCOMPLETE'))

const missingVisual = structuredClone(withMixedTable)
missingVisual.sourceCoverage.visuals.pop()
assert(validateNck1SourceMaterialization(missingVisual).some((item) =>
  item.code === 'MATERIALIZATION_SOURCE_VISUAL_TARGET_MISSING'))

const duplicateVisualTarget = structuredClone(withMixedTable)
duplicateVisualTarget.sourceCoverage.visuals.push({
  visualId: 'visual:warning-icon-duplicate',
  page: 1,
  disposition: 'content_media',
  targetId: 'media:warning-icon',
})
assert(validateNck1SourceMaterialization(duplicateVisualTarget).some((item) =>
  item.code === 'MATERIALIZATION_SOURCE_VISUAL_TARGET_DUPLICATE'))

const missingListeningAbsenceEvidence = structuredClone(plain)
delete missingListeningAbsenceEvidence.listening.evidence
assert(validateNck1SourceMaterialization(missingListeningAbsenceEvidence).some((item) =>
  item.code === 'MATERIALIZATION_LISTENING_ABSENCE_EVIDENCE_INVALID'))

const missingBlankPlacement = structuredClone(plain)
missingBlankPlacement.groups.find((group) => group.slotId === 'cloze')
  .blocks[0].content = [{ kind: 'text', text: 'Flattened cloze without blanks.' }]
assert(validateNck1SourceMaterialization(missingBlankPlacement).some((item) =>
  item.code === 'MATERIALIZATION_BLANK_PLACEMENT_INVALID'))

const missingWritingNotice = structuredClone(plain)
missingWritingNotice.groups.find((group) => group.slotId === 'writing.application')
  .blocks.splice(1, 3)
assert(validateNck1SourceMaterialization(missingWritingNotice).some((item) =>
  item.code === 'MATERIALIZATION_WRITING_NOTICE_INVALID'))

const conflictingWritingWordCount = structuredClone(plain)
conflictingWritingWordCount.groups.find((group) => group.slotId === 'writing.continuation')
  .blocks.find((block) => block.blockId === 'block:continuation-word-count')
  .content[0].text = '(1) Write about 120 words.'
assert(validateNck1SourceMaterialization(conflictingWritingWordCount).some((item) =>
  item.code === 'MATERIALIZATION_WRITING_WORD_COUNT_CONFLICT'))

const flattenedContinuationMaterial = structuredClone(plain)
const flattenedContinuation = flattenedContinuationMaterial.groups.find((group) =>
  group.slotId === 'writing.continuation')
flattenedContinuation.blocks.find((block) => block.blockId === 'block:continuation-material')
  .content[0].text = 'Story material Another source paragraph'
assert(validateNck1SourceMaterialization(flattenedContinuationMaterial).some((item) =>
  item.code === 'MATERIALIZATION_CONTINUATION_MATERIAL_BOUNDARY_INVALID'))

const misplacedContinuationStarters = structuredClone(plain)
const continuationBlocks = misplacedContinuationStarters.groups.find((group) =>
  group.slotId === 'writing.continuation').blocks
const starter = continuationBlocks.pop()
continuationBlocks.splice(2, 0, starter)
assert(validateNck1SourceMaterialization(misplacedContinuationStarters).some((item) =>
  item.code === 'MATERIALIZATION_WRITING_GIVENS_PLACEMENT_INVALID'))

console.log('verify-nck1-source-materialization: PASS')
