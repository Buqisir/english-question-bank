import { readFileSync } from 'node:fs'

import { sha256 } from '../../shared/paper-canonical/stable.mjs'
import { makeReadyCanonicalFixture } from './foundationFixture.mjs'

const references = Object.freeze({
  'paper-2026-i': Object.freeze({
    profileId: 'nck1',
    source: 'sha256:31a87069e6d530afba9123eec0487adf45e52e0b98530af80b62476f169e4d0f',
    asset: 'sha256:fe7feb2cc9554b00bbab96a7d4fe5e499513c564c28e6c314e0373e29b2ca7bf',
    importMeta: 'sha256:dda79f448a049d9ce6293049b4e1dec51fba35cb683e4e7860f5390ab3d3e900',
    capture: 'sha256:93869d8ce85ecf365ee0226345ec6acfbc21e58074214f773e1203269990c6cd',
    transcription: 'sha256:5e76ee0f0b157cac6d619199a08fe5e7f819a16964eb56231701e8de7053c8a3',
    captureFile: 'continuation-writing-paper-2026-i.json',
    transcriptionFile: 'continuation-writing-transcription-paper-2026-i.json',
    sourceFile: new URL('../../scripts/import-pipeline/papers/paper-2026-i/source/paper.pdf', import.meta.url),
    mediaType: 'application/pdf',
  }),
  'paper-zj-2020-jul': Object.freeze({
    profileId: 'zhejiang-legacy',
    source: 'sha256:1a447b5dc7bdba349347d61080304eab55815e41db055b5c2ff9b43545b79cdc',
    asset: 'sha256:3698679f6e261a111696b8122ed34f66b4e7a29d65379629fb5a2f93fd6d1eb6',
    importMeta: 'sha256:f9856f3cc97440e770887e73ef08e08d2f72e941797c5cfd9e83ea8518128719',
    capture: 'sha256:c6e95970bea20b599cca505e81502bd6f8246cc73f6aa81f2b8ac5dc4d12b9f9',
    transcription: 'sha256:c960ddd50da5d27503f54942075d3520761b27fc1cb5ff279f08e3253456e8fb',
    captureFile: 'continuation-writing-paper-zj-2020-jul.json',
    transcriptionFile: 'continuation-writing-transcription-paper-zj-2020-jul.json',
    sourceFile: new URL('evidence/original-paper-zj-2020-jul.docx', import.meta.url),
    mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  }),
})

function readHashBoundBytes(url, expectedDigest, label) {
  const bytes = new Uint8Array(readFileSync(url))
  const actualDigest = sha256(bytes)
  if (expectedDigest && actualDigest !== expectedDigest) throw new Error(`${label} drifted: expected ${expectedDigest}, received ${actualDigest}`)
  return bytes
}

function removeFoundationContinuation(source) {
  source.groups = source.groups.filter((group) => group.slotId !== 'writing.continuation')
  source.observations = source.observations.filter((observation) => observation.observationId !== 'observation:writing.continuation')
}

function adaptFoundationToProfile(source, profileId) {
  source.profileId = profileId
  if (profileId !== 'zhejiang-legacy') return
  const removedGroup = source.groups.find((group) => group.slotId === 'reading.d')
  const readingB = source.groups.find((group) => group.slotId === 'reading.b')
  const cloze = source.groups.find((group) => group.slotId === 'language.cloze')
  const removedQuestionIds = new Set([
    ...(removedGroup?.questionIds || []),
    ...(readingB?.questionIds.slice(3) || []),
  ])
  source.groups = source.groups.filter((group) => group.slotId !== 'reading.d')
  readingB.questionIds = readingB.questionIds.slice(0, 3)
  readingB.variant.questions = readingB.variant.questions.slice(0, 3)
  readingB.variant.choiceOwnership.sets = readingB.variant.choiceOwnership.sets.slice(0, 3)
  const clozeSourceSpanId = 'source-span:observation:language.cloze'
  for (let index = cloze.questionIds.length + 1; index <= 20; index++) {
    const questionId = `question:language.cloze:${index}`
    const blankId = `blank:language.cloze:${index}`
    cloze.questionIds.push(questionId)
    cloze.blankIds.push(blankId)
    cloze.content.blocks[0].inlines.push({
      kind: 'blank_ref',
      nodeId: `blank-ref:cloze:${index}`,
      blankId,
    })
    cloze.variant.choiceOwnership.sets.push({
      questionId,
      options: 'ABCD'.split('').map((label) => ({
        optionId: `option:${label}`,
        label,
        content: [{ kind: 'text', nodeId: `text:${label}`, text: label }],
      })),
    })
    source.assertions.push({
      assertionId: `answer:${questionId}`,
      questionId,
      answer: 'A',
      authority: 'official',
      sourceSpanId: clozeSourceSpanId,
    })
  }
  source.observations = source.observations.filter((observation) => observation.observationId !== 'observation:reading.d')
  source.assertions = source.assertions.filter((assertion) => !removedQuestionIds.has(assertion.questionId))
}

export const continuationWritingReferenceHashes = references

export function makeContinuationWritingReferenceFixture(paperId) {
  const reference = references[paperId]
  if (!reference?.source) throw new Error(`Unknown ready Continuation Writing reference paper ${paperId}`)
  const assetBaseUrl = new URL(`../../app/public/paper-assets/${paperId}/latest/`, import.meta.url)
  readHashBoundBytes(new URL('paper-asset.json', assetBaseUrl), reference.asset, `${paperId} paper asset`)
  const importMeta = readHashBoundBytes(new URL('import-meta.json', assetBaseUrl), reference.importMeta, `${paperId} import meta`)
  const meta = JSON.parse(new TextDecoder().decode(importMeta))
  if (`sha256:${meta.sourceFileSha256}` !== reference.source) throw new Error(`Continuation source provenance drifted for ${paperId}`)
  const sourceBytes = readHashBoundBytes(reference.sourceFile, reference.source, `${paperId} source`)
  const captureBytes = readHashBoundBytes(new URL(`evidence/${reference.captureFile}`, import.meta.url), reference.capture, `${paperId} reviewed capture`)
  const transcriptionBytes = readHashBoundBytes(new URL(`evidence/${reference.transcriptionFile}`, import.meta.url), reference.transcription, `${paperId} reviewed transcription`)
  const capture = JSON.parse(new TextDecoder().decode(captureBytes))
  const transcription = JSON.parse(new TextDecoder().decode(transcriptionBytes))
  const fixture = makeReadyCanonicalFixture()
  fixture.source.paperId = paperId
  adaptFoundationToProfile(fixture.source, reference.profileId)
  removeFoundationContinuation(fixture.source)
  for (const observation of fixture.source.observations) observation.documentInputKey = 'canonical_mapping'
  for (let pass = 0; pass < 3; pass++) {
    const mappingLength = new TextEncoder().encode(JSON.stringify(fixture.source)).byteLength
    for (const observation of fixture.source.observations) observation.span.end = mappingLength
  }
  const mappingBytes = new TextEncoder().encode(JSON.stringify(fixture.source))
  return {
    paperId,
    source: fixture.source,
    sourceAsset: captureBytes,
    reference,
    capture,
    captureBytes,
    transcription,
    transcriptionBytes,
    request: {
      authority: fixture.request.authority,
      evidence: {
        documents: [
          {
            inputKey: 'canonical_mapping',
            roles: ['operator_assertions'],
            bytes: mappingBytes,
            declared: { mediaType: 'application/vnd.eqb.canonical-fixture+json' },
          },
          {
            inputKey: 'continuation_writing_capture',
            roles: ['structured_source', 'source_provenance'],
            bytes: captureBytes,
            declared: { mediaType: 'application/vnd.eqb.continuation-writing-source-capture+json' },
          },
          {
            inputKey: 'continuation_writing_transcription',
            roles: ['structured_source', 'source_provenance'],
            bytes: transcriptionBytes,
            declared: { mediaType: 'application/vnd.eqb.continuation-writing-source-transcription+json' },
          },
          {
            inputKey: 'source_provenance',
            roles: ['source_provenance'],
            bytes: importMeta,
            declared: { mediaType: 'application/json', originalName: 'import-meta.json' },
          },
          {
            inputKey: 'original_question_source',
            roles: ['question_source', 'source_provenance'],
            bytes: sourceBytes,
            declared: { mediaType: reference.mediaType },
          },
        ],
      },
    },
  }
}

export function makePollutedContinuationCapture() {
  const reference = references['paper-2026-i']
  const captureBytes = readHashBoundBytes(
    new URL(`evidence/${reference.captureFile}`, import.meta.url),
    reference.capture,
    'pollution baseline reviewed capture',
  )
  const capture = JSON.parse(new TextDecoder().decode(captureBytes))
  const starter = structuredClone(capture.group.variant.starterProvision.starters[1])
  starter.starterId = `${starter.starterId}:pollution`
  starter.contentRef = `${starter.contentRef}:pollution`
  starter.authorityObservationRef = `${starter.authorityObservationRef}:pollution`
  capture.group.variant.starterProvision.starters.push(starter)
  capture.group.content.blocks.push({
    kind: 'paragraph',
    nodeId: starter.contentRef,
    inlines: [{ kind: 'text', nodeId: `text:${starter.contentRef}`, text: 'Response-like pollution.' }],
  })
  capture.group.observations.push({
    observationId: starter.authorityObservationRef,
    kind: 'continuation_source_starter',
    value: { groupId: capture.group.groupId, starterId: starter.starterId, contentRef: starter.contentRef },
  })
  return capture
}
