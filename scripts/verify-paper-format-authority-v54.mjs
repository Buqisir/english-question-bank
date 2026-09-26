import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

import manifestV52 from '../standards/paper-canonical/manifest-v52.json' with { type: 'json' }
import manifestV53 from '../standards/paper-canonical/manifest-v53.json' with { type: 'json' }
import manifestV54 from '../standards/paper-canonical/manifest-v54.json' with { type: 'json' }
import screenV40 from '../standards/paper-canonical/consumers/screen-v40.json' with { type: 'json' }
import printPdfV41 from '../standards/paper-canonical/consumers/print-pdf-v41.json' with { type: 'json' }
import screenV41 from '../standards/paper-canonical/consumers/screen-v41.json' with { type: 'json' }
import printPdfV42 from '../standards/paper-canonical/consumers/print-pdf-v42.json' with { type: 'json' }
import screenV42 from '../standards/paper-canonical/consumers/screen-v42.json' with { type: 'json' }
import printPdfV43 from '../standards/paper-canonical/consumers/print-pdf-v43.json' with { type: 'json' }
import presentationV2 from '../standards/paper-canonical/rendering/paper-presentation-v2.json' with { type: 'json' }
import presentationV2Schema from '../schemas/paper-canonical/paper-presentation-v2.schema.json' with { type: 'json' }

import {
  canonicalAuthorityRef,
  nck1MaterializationHistoricalAuthorityRef54,
  resolveCanonicalAuthority,
  validateJsonSchema,
} from '../shared/paper-canonical/authority.mjs'
import {
  resolveConsumerContract,
  resolveConsumerPresentation,
} from '../shared/paper-canonical/consumers.mjs'
import { writingNoticeGroup, writingWordCount } from '../shared/paper-canonical/applicationWritingDisplay.mjs'
import { FIXED_PAGE_COVER_GAPS_PT } from '../server/draft-paper/fixedPagePdfPlanner.mjs'
import { digestJson } from '../shared/paper-canonical/stable.mjs'

const byteDigests = new Map([
  ['standards/paper-canonical/manifest-v52.json', '06579bab61dcc0243b10857db06a4970c286d5e0a58b19c12df62a44ff8de33d'],
  ['standards/paper-canonical/manifest-v53.json', '1e9fe48e88638db31ca7162abe0b77c348390ea1525b50deca9d4ab0e81dd74f'],
  ['standards/paper-canonical/rendering/paper-presentation-v1.json', '070991dd7df0b725289bf49395a0a61f5bec3b1ba54b0b510512399abfaef512'],
  ['standards/paper-canonical/adapters/source-adapters-v15.json', '99f3d3fc131179b59b8b33d6509a4f81b44b5d85a0dd49661e6b7308ab124889'],
  ['standards/paper-canonical/consumers/screen-v40.json', '93240468de7e513c49e27978ddb3d76b73fee979cdc22c0a7e88092abbfd3f31'],
  ['standards/paper-canonical/consumers/print-pdf-v41.json', '2147f03d00962fc0fe0787de72356bc6f7f26eef642e9a65439d904a71b790af'],
  ['standards/paper-canonical/consumers/screen-v41.json', '225c23dda28e9c0109e4871067a09c69adb5a9c1e09a5ef8389867a5456a68a8'],
  ['standards/paper-canonical/consumers/print-pdf-v42.json', '2439192544f234fc1962699bf0193d9ea51c64eab49f57b5cf9edf4a244d9912'],
])
for (const [path, expected] of byteDigests) {
  assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'), expected, `${path} bytes changed`)
}

const ref = contract => ({ id: contract.consumerId, version: contract.version, digest: contract.contractDigest })
for (const contract of [screenV40, printPdfV41, screenV41, printPdfV42, screenV42, printPdfV43]) {
  assert.equal(resolveConsumerContract(ref(contract)).ok, true, `${contract.consumerId} v${contract.version} must resolve`)
}
assert.equal(resolveConsumerPresentation(ref(screenV40)), null, 'v52 has no presentation policy')
assert.equal(resolveConsumerPresentation(ref(printPdfV41)), null, 'v52 Print/PDF has no presentation policy')
assert.equal(resolveConsumerPresentation(ref(screenV41)).policy.version, '1', 'v53 Screen retains presentation v1')
assert.equal(resolveConsumerPresentation(ref(printPdfV42)).policy.version, '1', 'v53 Print/PDF retains presentation v1')
assert.equal(resolveConsumerPresentation(ref(screenV42)).policy.version, '2', 'v54 Screen selects presentation v2')
assert.equal(resolveConsumerPresentation(ref(printPdfV43)).policy.version, '2', 'v54 Print/PDF selects presentation v2')

assert.equal(canonicalAuthorityRef.manifestVersion, '36', 'global accepted authority must not advance')
assert.equal(nck1MaterializationHistoricalAuthorityRef54.manifestVersion, '54')
assert.equal(resolveCanonicalAuthority({ manifestId: manifestV52.manifestId, manifestVersion: '52', manifestDigest: digestJson(manifestV52) }).ok, true)
assert.equal(resolveCanonicalAuthority({ manifestId: manifestV53.manifestId, manifestVersion: '53', manifestDigest: digestJson(manifestV53) }).ok, true)
assert.equal(resolveCanonicalAuthority({ manifestId: manifestV54.manifestId, manifestVersion: '54', manifestDigest: digestJson(manifestV54) }).ok, true)
assert.deepEqual(validateJsonSchema(presentationV2, presentationV2Schema), [])
assert.deepEqual(presentationV2.fixedPagePlanning.coverGapCandidatesPt, FIXED_PAGE_COVER_GAPS_PT)

const splitNotice = writingNoticeGroup(['Prompt', '注意事项：', '1. 写作词数应为80个左右；', '2. 请按格式作答。', 'Dear Alex,'])
assert.deepEqual(splitNotice && { startIndex: splitNotice.startIndex, blockCount: splitNotice.blockCount }, { startIndex: 1, blockCount: 3 })
assert.equal(writingWordCount(splitNotice.lines.map(line => line.text).join(' ')), 80)
assert.equal(writingNoticeGroup(['Prompt', '注意：', '1.5 meters away']).blockCount, 1, 'decimal-leading prose is not consumed as a numbered notice line')

console.log('verify-paper-format-authority-v54: PASS')
