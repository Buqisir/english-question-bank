import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

import manifestV54 from '../standards/paper-canonical/manifest-v54.json' with { type: 'json' }
import manifestV55 from '../standards/paper-canonical/manifest-v55.json' with { type: 'json' }
import screenV43 from '../standards/paper-canonical/consumers/screen-v43.json' with { type: 'json' }
import printPdfV44 from '../standards/paper-canonical/consumers/print-pdf-v44.json' with { type: 'json' }
import {
  canonicalAuthorityRef,
  nck1AnalyzedPackageCandidateAuthorityRef55,
  nck1MaterializationCandidateAuthorityRef,
  paperPresentationAuthorityRef,
  resolveCanonicalAuthority,
} from '../shared/paper-canonical/authority.mjs'
import { resolveConsumerContract, resolveConsumerPresentation } from '../shared/paper-canonical/consumers.mjs'
import { digestJson } from '../shared/paper-canonical/stable.mjs'

const historicalBytes = new Map([
  ['standards/paper-canonical/manifest-v54.json', '1d289d021b13a836845ae670c11e14e0ab136d73a1cd00dc61223445fc74fdcc'],
  ['standards/paper-canonical/adapters/source-adapters-v16.json', '4666ff9e7814200aa7449fc0152a6729bd792963f2edafaa630a45486ee57549'],
  ['schemas/paper-canonical/normalization-report-v54.schema.json', 'e9c1b05a69259e32d006d077fd81c1f91f1bd20ec6245eedb4b627dacbb29f36'],
  ['schemas/paper-canonical/canonical-paper-publication-v54.schema.json', '9fda95c0f074efe8fe2205aceb55887aa2172d82e0107cf200c121d01f3bc50a'],
  ['standards/paper-canonical/consumers/screen-v42.json', '0a50efd6563d6e43efa557f98750d7195bdf28dfb10ec66df7b478893c7d566c'],
  ['standards/paper-canonical/consumers/print-pdf-v43.json', 'c7accff70ea2f148503ce6209128d07071be76871ec9cc4a5623ebe7f81a6730'],
])
for (const [path, expected] of historicalBytes) {
  assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'), expected, `${path} bytes changed`)
}

assert.equal(canonicalAuthorityRef.manifestVersion, '36')
assert.equal(nck1MaterializationCandidateAuthorityRef.manifestVersion, '54')
assert.equal(paperPresentationAuthorityRef.manifestVersion, '54')
assert.equal(nck1AnalyzedPackageCandidateAuthorityRef55.manifestVersion, '55')
assert.equal(nck1MaterializationCandidateAuthorityRef.manifestDigest, digestJson(manifestV54))
assert.equal(nck1AnalyzedPackageCandidateAuthorityRef55.manifestDigest, digestJson(manifestV55))
const closure = resolveCanonicalAuthority(nck1AnalyzedPackageCandidateAuthorityRef55).closure
for (const schemaId of [
  'nck1-analyzed-package-v1',
  'nck1-analyzed-package-input-v1',
  'package-json-pointer-evidence-v1',
  'normalization-report-v55',
  'canonical-paper-publication-v55',
]) assert(closure.schemas[schemaId], `${schemaId} must be in v55 closure`)
const adapter = closure.artifacts.adapter.adapters.find((entry) =>
  entry.adapterId === 'nck1-analyzed-package')
assert.deepEqual(adapter, {
  adapterId: 'nck1-analyzed-package',
  capabilities: ['immutable_package_json_pointer_evidence', 'direct_continuation_instruction_agreement'],
  mediaType: 'application/vnd.eqb.nck1-analyzed-package+json',
  version: '1',
})
for (const contract of [screenV43, printPdfV44]) {
  const ref = { id: contract.consumerId, version: contract.version, digest: contract.contractDigest }
  assert.equal(resolveConsumerContract(ref).ok, true)
  assert.equal(resolveConsumerPresentation(ref).policy.version, '2')
}

console.log('verify-paper-format-authority-v55: PASS')
