import { readFileSync } from 'node:fs'

import { sha256 } from '../../shared/paper-canonical/stable.mjs'
import { makeReadyCanonicalFixture } from './foundationFixture.mjs'

const references = Object.freeze({
  'paper-zj-2020-jan': Object.freeze({
    source: 'sha256:d752ee191e73f37445d72b6a626bfa395b9dd74f72d576a2a692b8c7693c9c6a',
    capture: 'sha256:828e28e229153c84e9a85949625f33655b65d34b9ce07f9b0dccb6c14a059ec9',
    importMeta: 'sha256:2d8af84e387c806813798da60be4bab314b83d6d5de1478f7a86925a1427d81d',
    captureFile: 'application-writing-paper-zj-2020-jan.json',
    sourceFile: null,
  }),
  'paper-2026-i': Object.freeze({
    source: 'sha256:31a87069e6d530afba9123eec0487adf45e52e0b98530af80b62476f169e4d0f',
    capture: 'sha256:7552c761d9c213e52d59b0333baabe094a31b8340d1e4c3d2cef7c2e828bd609',
    importMeta: 'sha256:dda79f448a049d9ce6293049b4e1dec51fba35cb683e4e7860f5390ab3d3e900',
    captureFile: 'application-writing-paper-2026-i.json',
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
  const importMeta = readHashBoundBytes(new URL('import-meta.json', assetBaseUrl), hashes.importMeta)
  const meta = JSON.parse(new TextDecoder().decode(importMeta))
  if (`sha256:${meta.sourceFileSha256}` !== hashes.source) throw new Error(`Application source provenance drifted for ${paperId}`)
  const sourceBytes = hashes.sourceFile ? readHashBoundBytes(hashes.sourceFile, hashes.source) : null
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
            inputKey: 'source_provenance',
            roles: ['source_provenance'],
            bytes: importMeta,
            declared: { mediaType: 'application/json', originalName: 'import-meta.json' },
          },
          ...(sourceBytes
            ? [{
                inputKey: 'original_question_source',
                roles: ['question_source', 'source_provenance'],
                bytes: sourceBytes,
                declared: { mediaType: 'application/pdf', originalName: 'paper.pdf' },
              }]
            : []),
        ],
      },
    },
  }
}
