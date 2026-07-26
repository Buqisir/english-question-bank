import { readFileSync } from 'node:fs'

import { sha256 } from '../../shared/paper-canonical/stable.mjs'
import { makeReadyCanonicalFixture } from './foundationFixture.mjs'

const paperAssetUrl = new URL('../../app/public/paper-assets/paper-2026-i/latest/paper-asset.json', import.meta.url)
const answerKeyUrl = new URL('../../app/public/paper-assets/paper-2026-i/latest/answer-key.json', import.meta.url)

export const clozeGrammarReferenceHashes = Object.freeze({
  paperAsset: 'sha256:fe7feb2cc9554b00bbab96a7d4fe5e499513c564c28e6c314e0373e29b2ca7bf',
  answerKey: 'sha256:17502bb7685b83afc8847f3a44f8ac3c68defcb941ae75ba1ff14945c07daaf0',
})

function readHashBoundBytes(url, expectedDigest) {
  const bytes = new Uint8Array(readFileSync(url))
  const actualDigest = sha256(bytes)
  if (actualDigest !== expectedDigest) throw new Error(`Reference fixture drifted: expected ${expectedDigest}, received ${actualDigest}`)
  return bytes
}

export function makeClozeGrammarCanonicalReferenceFixture() {
  const paperAsset = readHashBoundBytes(paperAssetUrl, clozeGrammarReferenceHashes.paperAsset)
  const answerKey = readHashBoundBytes(answerKeyUrl, clozeGrammarReferenceHashes.answerKey)
  const fixture = makeReadyCanonicalFixture()
  const source = fixture.source
  const referenceFamilies = new Set(['cloze', 'grammar-fill'])
  const removedGroups = source.groups.filter((group) => referenceFamilies.has(group.family))
  const removedQuestionIds = new Set(removedGroups.flatMap((group) => group.questionIds))
  const removedObservationIds = new Set(removedGroups.map((group) => `observation:${group.slotId}`))
  source.paperId = 'paper-2026-i'
  source.sourceAssetVersion = 1
  source.groups = source.groups.filter((group) => !referenceFamilies.has(group.family))
  source.observations = source.observations.filter((observation) => !removedObservationIds.has(observation.observationId))
  source.assertions = source.assertions.filter((assertion) => !removedQuestionIds.has(assertion.questionId))
  for (const observation of source.observations) observation.documentInputKey = 'canonical_mapping'
  for (let pass = 0; pass < 3; pass++) {
    const mappingLength = new TextEncoder().encode(JSON.stringify(source)).byteLength
    for (const observation of source.observations) observation.span.end = mappingLength
  }
  const mappingBytes = new TextEncoder().encode(JSON.stringify(source))
  return {
    source,
    sourceAsset: paperAsset,
    hashes: clozeGrammarReferenceHashes,
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
        ],
      },
    },
  }
}
