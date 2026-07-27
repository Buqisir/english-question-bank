import { readFileSync } from 'node:fs'

import { sha256 } from '../../shared/paper-canonical/stable.mjs'
import { makeReadyCanonicalFixture } from './foundationFixture.mjs'

const references = Object.freeze({
  'paper-zj-2020-jan': Object.freeze({
    source: 'sha256:d752ee191e73f37445d72b6a626bfa395b9dd74f72d576a2a692b8c7693c9c6a',
    capture: 'sha256:475455f5d2b23c79c2125182ac65b4863cebc23abde3ceeb01232b5b102702fd',
    transcription: 'sha256:6db4f0f7f5b940fc4b08992644b658216f27356c3c1459cb26c21e516ebf45bf',
    importMeta: 'sha256:2d8af84e387c806813798da60be4bab314b83d6d5de1478f7a86925a1427d81d',
    captureFile: 'application-writing-paper-zj-2020-jan.json',
    transcriptionFile: 'application-writing-transcription-paper-zj-2020-jan.json',
    sourceFile: new URL('evidence/original-paper-zj-2020-jan.docx', import.meta.url),
  }),
  'paper-2026-i': Object.freeze({
    source: 'sha256:31a87069e6d530afba9123eec0487adf45e52e0b98530af80b62476f169e4d0f',
    capture: 'sha256:bca92da56ff9c9d96a2a5979be136a140ae0cf238aaf5dfbad7e6e54d0d79a31',
    transcription: 'sha256:2e83dc57ec6462ac5f59c94ef2868e98cf8bef67627e2b804be840a13b1ada28',
    importMeta: 'sha256:dda79f448a049d9ce6293049b4e1dec51fba35cb683e4e7860f5390ab3d3e900',
    captureFile: 'application-writing-paper-2026-i.json',
    transcriptionFile: 'application-writing-transcription-paper-2026-i.json',
    sourceFile: new URL('../../scripts/import-pipeline/papers/paper-2026-i/source/paper.pdf', import.meta.url),
  }),
})

function readHashBoundBytes(url, expectedDigest) {
  const bytes = new Uint8Array(readFileSync(url))
  const actualDigest = sha256(bytes)
  if (actualDigest !== expectedDigest) throw new Error(`Application Writing reference drifted: expected ${expectedDigest}, received ${actualDigest}`)
  return bytes
}

function removeFoundationApplication(source) {
  source.groups = source.groups.filter((group) => group.slotId !== 'writing.application')
  source.observations = source.observations.filter((observation) => (
    observation.observationId !== 'observation:writing.application'
    && !observation.observationId.startsWith('observation:group:writing.application:')
  ))
}

export const applicationWritingReferenceHashes = references

export function makeApplicationWritingReferenceFixture(paperId) {
  const hashes = references[paperId]
  if (!hashes) throw new Error(`Unknown Application Writing reference paper ${paperId}`)
  const assetBaseUrl = new URL(`../../app/public/paper-assets/${paperId}/latest/`, import.meta.url)
  const captureBytes = readHashBoundBytes(new URL(`evidence/${hashes.captureFile}`, import.meta.url), hashes.capture)
  const transcriptionBytes = readHashBoundBytes(new URL(`evidence/${hashes.transcriptionFile}`, import.meta.url), hashes.transcription)
  const importMeta = readHashBoundBytes(new URL('import-meta.json', assetBaseUrl), hashes.importMeta)
  const meta = JSON.parse(new TextDecoder().decode(importMeta))
  if (`sha256:${meta.sourceFileSha256}` !== hashes.source) throw new Error(`Application source provenance drifted for ${paperId}`)
  const sourceBytes = readHashBoundBytes(hashes.sourceFile, hashes.source)
  const fixture = makeReadyCanonicalFixture()
  const source = fixture.source
  source.paperId = paperId
  source.sourceAssetVersion = 1
  removeFoundationApplication(source)
  for (const observation of source.observations) observation.documentInputKey = 'canonical_mapping'
  for (let pass = 0; pass < 3; pass++) {
    const mappingLength = new TextEncoder().encode(JSON.stringify(source)).byteLength
    for (const observation of source.observations) observation.span.end = mappingLength
  }
  const mappingBytes = new TextEncoder().encode(JSON.stringify(source))
  return {
    paperId,
    source,
    sourceAsset: captureBytes,
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
            inputKey: 'application_writing_capture',
            roles: ['structured_source', 'source_provenance'],
            bytes: captureBytes,
            declared: {
              mediaType: 'application/vnd.eqb.application-writing-source-capture+json',
              originalName: hashes.captureFile,
            },
          },
          {
            inputKey: 'application_writing_transcription',
            roles: ['structured_source', 'source_provenance'],
            bytes: transcriptionBytes,
            declared: {
              mediaType: 'application/vnd.eqb.application-writing-source-transcription+json',
              originalName: hashes.transcriptionFile,
            },
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
            declared: {
              mediaType: paperId === 'paper-2026-i'
                ? 'application/pdf'
                : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              originalName: paperId === 'paper-2026-i' ? 'paper.pdf' : 'source.docx',
            },
          },
        ],
      },
    },
  }
}
