import { readFileSync } from 'node:fs'

import { sha256 } from '../../shared/paper-canonical/stable.mjs'
import {
  makeNck1ProfileInstructionEvidenceDocuments,
  makeReadyCanonicalFixture,
} from './foundationFixture.mjs'

const references = Object.freeze({
  'paper-2026-i': Object.freeze({
    source: 'sha256:31a87069e6d530afba9123eec0487adf45e52e0b98530af80b62476f169e4d0f',
    paperAsset: 'sha256:fe7feb2cc9554b00bbab96a7d4fe5e499513c564c28e6c314e0373e29b2ca7bf',
    answerKey: 'sha256:17502bb7685b83afc8847f3a44f8ac3c68defcb941ae75ba1ff14945c07daaf0',
    importMeta: 'sha256:dda79f448a049d9ce6293049b4e1dec51fba35cb683e4e7860f5390ab3d3e900',
    promptCapture: 'sha256:c20392a1ab530b6a327aa5a3b81b29682f85f7f6e5be48824c3398d814c477e8',
  }),
  'paper-960d0f8d': Object.freeze({
    source: 'sha256:960d0f8d6fddc3e6ccff22a15c9044170cb58f59a8b62f9870cf522df8cde25b',
    paperAsset: 'sha256:2578eb70e069c6d39a6d92bbc5254a8c23ed08b152287c2c80167d2121df2a14',
    answerKey: 'sha256:86b085d93a418f8112f6c777c8a354b097bb5f7cc9849634c7690e36c730a77d',
    importMeta: 'sha256:91fb2a6d85746c9194108a0e59fd0efc9f222ae7ccb73a55153eb7557b1954e4',
  }),
})

function readHashBoundBytes(url, expectedDigest) {
  const bytes = new Uint8Array(readFileSync(url))
  const actualDigest = sha256(bytes)
  if (actualDigest !== expectedDigest) throw new Error(`Reference fixture drifted: expected ${expectedDigest}, received ${actualDigest}`)
  return bytes
}

function removeReferenceFamilies(source) {
  const referenceFamilies = new Set(['seven-choices'])
  const removedGroups = source.groups.filter((group) => referenceFamilies.has(group.family))
  const removedQuestionIds = new Set(removedGroups.flatMap((group) => group.questionIds))
  const removedObservationIds = new Set(removedGroups.map((group) => `observation:${group.slotId}`))
  source.groups = source.groups.filter((group) => !referenceFamilies.has(group.family))
  source.observations = source.observations.filter((observation) => !removedObservationIds.has(observation.observationId))
  source.assertions = source.assertions.filter((assertion) => !removedQuestionIds.has(assertion.questionId))
}

export const sevenChoicesReferenceHashes = references

export function makeSevenChoicesCanonicalReferenceFixture(paperId) {
  const hashes = references[paperId]
  if (!hashes) throw new Error(`Unknown Seven Choices reference paper ${paperId}`)
  const baseUrl = new URL(`../../app/public/paper-assets/${paperId}/latest/`, import.meta.url)
  const paperAsset = readHashBoundBytes(new URL('paper-asset.json', baseUrl), hashes.paperAsset)
  const answerKey = readHashBoundBytes(new URL('answer-key.json', baseUrl), hashes.answerKey)
  const importMeta = readHashBoundBytes(new URL('import-meta.json', baseUrl), hashes.importMeta)
  const promptDocuments = paperId === 'paper-2026-i'
    ? [
        {
          inputKey: 'original_question_source',
          roles: ['question_source', 'source_provenance'],
          bytes: readHashBoundBytes(
            new URL(
              '../paper-import/paper-2026-i-canonical-pilot/paper.pdf',
              import.meta.url,
            ),
            hashes.source,
          ),
          declared: {
            mediaType: 'application/pdf',
            originalName: 'paper.pdf',
          },
        },
        {
          inputKey: 'grammar_fill_prompt_source_capture',
          roles: ['structured_source', 'source_provenance'],
          bytes: readHashBoundBytes(
            new URL(
              '../paper-import/paper-2026-i-canonical-pilot/reviewed-evidence/grammar-fill-prompt-source-capture.json',
              import.meta.url,
            ),
            hashes.promptCapture,
          ),
          declared: {
            mediaType:
              'application/vnd.eqb.grammar-fill-prompt-source-capture+json',
            originalName: 'grammar-fill-prompt-source-capture.json',
          },
        },
      ]
    : []
  const meta = JSON.parse(new TextDecoder().decode(importMeta))
  if (`sha256:${meta.sourceFileSha256}` !== hashes.source) throw new Error(`Reference source digest drifted for ${paperId}`)
  const fixture = makeReadyCanonicalFixture()
  const source = fixture.source
  source.paperId = paperId
  source.sourceAssetVersion = 1
  removeReferenceFamilies(source)
  for (const observation of source.observations) observation.documentInputKey = 'canonical_mapping'
  for (let pass = 0; pass < 3; pass++) {
    const mappingLength = new TextEncoder().encode(JSON.stringify(source)).byteLength
    for (const observation of source.observations) observation.span.end = mappingLength
  }
  const mappingBytes = new TextEncoder().encode(JSON.stringify(source))
  return {
    paperId,
    source,
    sourceAsset: paperAsset,
    hashes,
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
            inputKey: 'paper_asset',
            roles: ['question_source'],
            bytes: paperAsset,
            declared: { mediaType: 'application/json', originalName: 'paper-asset.json' },
          },
          {
            inputKey: 'official_answers',
            roles: ['official_answer_source'],
            bytes: answerKey,
            declared: { mediaType: 'application/json', originalName: 'answer-key.json' },
          },
          {
            inputKey: 'source_provenance',
            roles: ['source_provenance'],
            bytes: importMeta,
            declared: { mediaType: 'application/json', originalName: 'import-meta.json' },
          },
          ...promptDocuments,
          ...makeNck1ProfileInstructionEvidenceDocuments(source.paperId),
        ],
      },
    },
  }
}
