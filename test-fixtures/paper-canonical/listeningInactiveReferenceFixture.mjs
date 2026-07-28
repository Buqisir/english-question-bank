import { readFileSync } from 'node:fs'

import { sha256 } from '../../shared/paper-canonical/stable.mjs'
import { makeContinuationWritingReferenceFixture } from './continuationWritingReferenceFixture.mjs'

const reference = Object.freeze({
  paperId: 'paper-2026-i',
  questionSource: 'sha256:31a87069e6d530afba9123eec0487adf45e52e0b98530af80b62476f169e4d0f',
  answerSource: 'sha256:2e4982f8d33e8a8787f270b7cf4fd3cd432fb9dce8d5732876fae149a1c78fc6',
  questions: 'sha256:f845991e03fa494920d91eaae8340084f01154231ce36d9e4df06a67ea1b5610',
  answers: 'sha256:0a8e9a23c864d9d10db373f98fc0902e240fc3cc8386830588ee874826a958fd',
  transcript: 'sha256:28350328ff9aeb5701f41bb8627966a82889b9cc473e8c9cce6d7f0b30030edd',
  inventory: 'sha256:fefdd2c15985a4ee289944c85a346ab4661741c99fc55432bc2d00d5f6f21f89',
})

function readHashBoundBytes(url, expectedDigest, label) {
  const bytes = new Uint8Array(readFileSync(url))
  const actualDigest = sha256(bytes)
  if (actualDigest !== expectedDigest) {
    throw new Error(`${label} drifted: expected ${expectedDigest}, received ${actualDigest}`)
  }
  return bytes
}

function stabilizeCanonicalMapping(document) {
  const source = JSON.parse(new TextDecoder().decode(document.bytes))
  source.inactiveSlots = {}
  for (let pass = 0; pass < 3; pass++) {
    const byteLength = new TextEncoder().encode(JSON.stringify(source)).byteLength
    for (const observation of source.observations) {
      if (observation.span?.kind !== 'page_region') observation.span = { start: 0, end: byteLength }
    }
  }
  document.bytes = new TextEncoder().encode(JSON.stringify(source))
  return source
}

export const listeningInactiveReferenceHashes = reference

export function makeListeningInactiveReferenceFixture() {
  const base = makeContinuationWritingReferenceFixture(reference.paperId)
  const request = structuredClone(base.request)
  const canonicalMapping = request.evidence.documents.find(
    (document) => document.inputKey === 'canonical_mapping',
  )
  const source = stabilizeCanonicalMapping(canonicalMapping)
  const questionsBytes = readHashBoundBytes(
    new URL(
      '../../app/public/paper-assets/paper-2026-i/latest/listening/questions.json',
      import.meta.url,
    ),
    reference.questions,
    'paper-2026-i listening questions',
  )
  const answersBytes = readHashBoundBytes(
    new URL(
      '../../app/public/paper-assets/paper-2026-i/latest/listening/answers.json',
      import.meta.url,
    ),
    reference.answers,
    'paper-2026-i listening answers',
  )
  const transcriptBytes = readHashBoundBytes(
    new URL(
      '../../app/public/paper-assets/paper-2026-i/latest/listening/transcript.json',
      import.meta.url,
    ),
    reference.transcript,
    'paper-2026-i listening transcript',
  )
  const answerSourceBytes = readHashBoundBytes(
    new URL(
      '../../scripts/import-pipeline/papers/paper-2026-i/source/answers.pdf',
      import.meta.url,
    ),
    reference.answerSource,
    'paper-2026-i official answer and transcript source',
  )
  const inventoryBytes = readHashBoundBytes(
    new URL(
      'evidence/listening-source-inventory-paper-2026-i.json',
      import.meta.url,
    ),
    reference.inventory,
    'paper-2026-i listening source inventory',
  )
  const inventory = JSON.parse(new TextDecoder().decode(inventoryBytes))
  request.evidence.documents.push(
    {
      inputKey: 'listening_answer_source',
      roles: [
        'official_answer_source',
        'transcript_source',
        'source_provenance',
      ],
      bytes: answerSourceBytes,
      declared: {
        mediaType: 'application/pdf',
        originalName: 'answers.pdf',
      },
    },
    {
      inputKey: 'listening_questions',
      roles: ['structured_source', 'question_source'],
      bytes: questionsBytes,
      declared: {
        mediaType: 'application/vnd.eqb.listening-questions+json',
        originalName: 'questions.json',
      },
    },
    {
      inputKey: 'listening_answers',
      roles: ['structured_source', 'official_answer_source'],
      bytes: answersBytes,
      declared: {
        mediaType: 'application/vnd.eqb.listening-answers+json',
        originalName: 'answers.json',
      },
    },
    {
      inputKey: 'listening_transcript',
      roles: ['structured_source', 'transcript_source'],
      bytes: transcriptBytes,
      declared: {
        mediaType: 'application/vnd.eqb.listening-transcript+json',
        originalName: 'transcript.json',
      },
    },
    {
      inputKey: 'listening_inventory',
      roles: ['operator_assertions', 'source_provenance'],
      bytes: inventoryBytes,
      declared: {
        mediaType: 'application/vnd.eqb.listening-source-inventory+json',
        originalName: 'listening-source-inventory.json',
      },
    },
  )
  return {
    paperId: reference.paperId,
    source,
    sourceAsset: base.sourceAsset,
    inventory,
    request,
  }
}
