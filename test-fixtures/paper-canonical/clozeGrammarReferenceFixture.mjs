import { readFileSync } from 'node:fs'

import { sha256 } from '../../shared/paper-canonical/stable.mjs'
import { makeReadyCanonicalFixture } from './foundationFixture.mjs'

const paperAssetUrl = new URL('../../app/public/paper-assets/paper-2026-i/latest/paper-asset.json', import.meta.url)
const answerKeyUrl = new URL('../../app/public/paper-assets/paper-2026-i/latest/answer-key.json', import.meta.url)

export const clozeGrammarReferenceHashes = Object.freeze({
  paperAsset: 'sha256:fe7feb2cc9554b00bbab96a7d4fe5e499513c564c28e6c314e0373e29b2ca7bf',
  answerKey: 'sha256:17502bb7685b83afc8847f3a44f8ac3c68defcb941ae75ba1ff14945c07daaf0',
})

function readHashBoundJson(url, expectedDigest) {
  const bytes = readFileSync(url)
  const actualDigest = sha256(bytes)
  if (actualDigest !== expectedDigest) throw new Error(`Reference fixture drifted: expected ${expectedDigest}, received ${actualDigest}`)
  return { bytes, value: JSON.parse(bytes.toString('utf8')) }
}

function option(questionId, value) {
  return {
    optionId: `option:${questionId}:${value.label}`,
    label: value.label,
    content: [{ kind: 'text', nodeId: `text:${questionId}:${value.label}`, text: value.text }],
  }
}

function canonicalParagraphs(group) {
  const blankIdByNumber = new Map(group.blankIds.map((blankId) => [Number(blankId.match(/(\d+)$/)?.[1]), blankId]))
  return group.passage.paragraphs.map((paragraph) => {
    const inlines = []
    let cursor = 0
    let textIndex = 0
    for (const marker of paragraph.text.matchAll(/__(\d+)__/g)) {
      if (marker.index > cursor) {
        inlines.push({
          kind: 'text',
          nodeId: `text:${paragraph.paragraphId}:${textIndex++}`,
          text: paragraph.text.slice(cursor, marker.index),
        })
      }
      inlines.push({
        kind: 'blank_ref',
        nodeId: `blank-ref:${paragraph.paragraphId}:${marker[1]}`,
        blankId: blankIdByNumber.get(Number(marker[1])),
      })
      cursor = marker.index + marker[0].length
    }
    if (cursor < paragraph.text.length) {
      inlines.push({
        kind: 'text',
        nodeId: `text:${paragraph.paragraphId}:${textIndex}`,
        text: paragraph.text.slice(cursor),
      })
    }
    return { kind: 'paragraph', nodeId: paragraph.paragraphId, inlines }
  })
}

function replaceReferenceFamily(source, paperAsset, answerKey, family, slotId, legacyGroupId) {
  const legacyGroup = paperAsset.content.groups[legacyGroupId]
  const existingIndex = source.groups.findIndex((group) => group.slotId === slotId)
  const replacedQuestionIds = source.groups[existingIndex].questionIds
  const observationId = `observation:reference:${family}`
  const answerObservationId = `observation:reference:${family}:answers`
  const sourceSpanId = `source-span:${observationId}`
  const answerSpanId = `source-span:${answerObservationId}`
  const questionIds = [...legacyGroup.questionIds]
  const choiceOwnership = family === 'cloze'
    ? {
        ownership: 'per_question',
        sets: questionIds.map((questionId) => ({
          questionId,
          options: paperAsset.content.questions[questionId].options.map((value) => option(questionId, value)),
        })),
      }
    : { ownership: 'none' }

  source.groups[existingIndex] = {
    groupId: legacyGroup.groupId,
    slotId,
    family,
    questionIds,
    blankIds: [...legacyGroup.blankIds],
    sourceSpanId,
    content: { blocks: canonicalParagraphs(legacyGroup) },
    media: [],
    variant: { family, choiceOwnership },
  }
  source.observations = source.observations.filter((observation) => observation.observationId !== `observation:${slotId}`)
  source.observations.push(
    {
      observationId,
      kind: 'reference_question_group',
      documentInputKey: 'paper_asset',
      value: legacyGroup.groupId,
      span: { start: 0, end: 1 },
    },
    {
      observationId: answerObservationId,
      kind: 'official_answer_set',
      documentInputKey: 'official_answers',
      value: questionIds,
      span: { start: 0, end: 1 },
    },
  )
  source.assertions = source.assertions.filter((assertion) => !replacedQuestionIds.includes(assertion.questionId))
  for (const questionId of questionIds) {
    source.assertions.push({
      assertionId: `answer:${questionId}`,
      questionId,
      answer: answerKey.answers[questionId].answer,
      authority: 'official',
      sourceSpanId: answerSpanId,
    })
  }
  return { observationId, answerObservationId }
}

export function makeClozeGrammarCanonicalReferenceFixture() {
  const paper = readHashBoundJson(paperAssetUrl, clozeGrammarReferenceHashes.paperAsset)
  const answers = readHashBoundJson(answerKeyUrl, clozeGrammarReferenceHashes.answerKey)
  const fixture = makeReadyCanonicalFixture()
  const source = fixture.source
  source.paperId = 'paper-2026-i-canonical-reference'
  for (const observation of source.observations) observation.documentInputKey = 'canonical_mapping'

  const references = [
    replaceReferenceFamily(source, paper.value, answers.value, 'cloze', 'language.cloze', 'group-2026-i-cloze'),
    replaceReferenceFamily(source, paper.value, answers.value, 'grammar-fill', 'language.grammar-fill', 'group-2026-i-grammar-fill'),
  ]
  for (let pass = 0; pass < 3; pass++) {
    const mappingLength = new TextEncoder().encode(JSON.stringify(source)).byteLength
    for (const observation of source.observations) {
      if (observation.documentInputKey === 'canonical_mapping') observation.span.end = mappingLength
      if (observation.documentInputKey === 'paper_asset') observation.span.end = paper.bytes.byteLength
      if (observation.documentInputKey === 'official_answers') observation.span.end = answers.bytes.byteLength
    }
  }
  const mappingBytes = new TextEncoder().encode(JSON.stringify(source))
  return {
    source,
    sourceAsset: new Uint8Array(paper.bytes),
    hashes: clozeGrammarReferenceHashes,
    referenceObservationIds: references,
    request: {
      authority: fixture.request.authority,
      evidence: {
        documents: [
          {
            inputKey: 'canonical_mapping',
            roles: ['canonical_mapping'],
            bytes: mappingBytes,
            declared: { mediaType: 'application/vnd.eqb.canonical-fixture+json' },
          },
          {
            inputKey: 'paper_asset',
            roles: ['question_source'],
            bytes: new Uint8Array(paper.bytes),
            declared: { mediaType: 'application/json', originalName: 'paper-asset.json' },
          },
          {
            inputKey: 'official_answers',
            roles: ['official_answer_source'],
            bytes: new Uint8Array(answers.bytes),
            declared: { mediaType: 'application/json', originalName: 'answer-key.json' },
          },
        ],
      },
    },
  }
}
