import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import {
  canonicalAuthorityRef,
  nck1MaterializationCandidateAuthorityRef,
  paperPresentationAuthorityRef,
  resolveCanonicalAuthority,
  validateAuthorityClosure,
} from '../shared/paper-canonical/authority.mjs'
import { digestJson } from '../shared/paper-canonical/stable.mjs'
import { consumerContractRefs, resolveConsumerContract } from '../shared/paper-canonical/consumers.mjs'
import { clozeRhythm, resolveConsumerClozeGeometry } from '../shared/paper-canonical/clozeRhythm.mjs'

const read = path => JSON.parse(readFileSync(path, 'utf8'))
const v4 = read('standards/paper-canonical/rendering/cloze-rhythm-v4.json')
const v5 = read('standards/paper-canonical/rendering/cloze-rhythm-v5.json')
assert.equal(v4.horizontalChoiceGeometry.strategy.optionColumns, 'four_gold_normalized_fixed_origin_tracks')
assert.equal(v4.horizontalChoiceGeometry.rendererMapping.proportional, undefined)
assert.deepEqual(v4.horizontalChoiceGeometry.rendererMapping.columnStartsPt, [17.3, 127.8, 231.9, 336.55])
assert.equal(v5.version, '5')
assert.equal(v5.horizontalChoiceGeometry.rendererMapping.questionLabelWidthPt, 17.3)
assert.deepEqual(v5.horizontalChoiceGeometry.rendererMapping.columnWidthSharesPt, [110.5, 104.1, 104.65, 101.65])
assert.equal(v5.horizontalChoiceGeometry.rendererMapping.proportional, true)
assert.equal(v5.horizontalChoiceGeometry.rendererMapping.columnStartsPt, undefined)
assert.equal(v5.horizontalChoiceGeometry.rendererMapping.columnWidthsPt, undefined)
assert.equal(canonicalAuthorityRef.manifestVersion, '36')
assert.equal(nck1MaterializationCandidateAuthorityRef.manifestVersion, '61')
assert.equal(paperPresentationAuthorityRef.manifestVersion, '60')
const closure = resolveCanonicalAuthority(paperPresentationAuthorityRef).closure
assert.equal(closure.artifacts['renderer-cloze-rhythm'].version, '5')
assert.equal(closure.artifacts['renderer-paper-presentation'].version, '3')
for (const attack of read('test-fixtures/paper-canonical/cloze-rhythm-v5-conformance.json').semanticAttacks) {
  const artifacts = structuredClone(closure.artifacts)
  let target = artifacts['renderer-cloze-rhythm']
  for (const key of attack.path.slice(0, attack.operation === 'duplicate-array-entry' ? undefined : -1)) target = target[key]
  if (attack.operation === 'delete') delete target[attack.path.at(-1)]
  else if (attack.operation === 'duplicate-array-entry') target.push(structuredClone(target[attack.sourceIndex]))
  else target[attack.path.at(-1)] = attack.invalidValue
  const manifest = structuredClone(closure.manifest)
  manifest.artifacts.find(entry => entry.id === 'renderer-cloze-rhythm').sha256 = digestJson(artifacts['renderer-cloze-rhythm'])
  const result = validateAuthorityClosure({ manifest, artifacts, schemas: closure.schemas })
  assert.equal(result.ok, false, attack.caseId)
  assert(result.issues.some(issue => issue.code === 'RENDERER_CLOZE_RHYTHM_INVALID'), attack.caseId)
}
assert.equal(consumerContractRefs.screen.version, '45')
assert.equal(consumerContractRefs.print_pdf.version, '46')
const absent = resolveConsumerClozeGeometry()
assert.equal(absent.proportional, false)
assert.deepEqual(absent.columnStartsPt, [17.3, 127.8, 231.9, 336.55])
assert.equal(absent.columnWidthSharesPt, undefined)
for (const [id, version] of [['screen', '44'], ['print_pdf', '45']]) {
  const fileId = id === 'print_pdf' ? 'print-pdf' : id
  const historical = resolveConsumerContract({ id, version, digest: read(`standards/paper-canonical/consumers/${fileId}-v${version}.json`).contractDigest })
  assert.equal(historical.ok, true)
  const geometry = resolveConsumerClozeGeometry({ id, version, digest: historical.contract.contractDigest })
  assert.equal(geometry.proportional, false)
  assert.deepEqual(geometry.columnWidthsPt, [110.5, 104.1, 104.65, 101.65])
}
for (const [id, version] of [['screen', '45'], ['print_pdf', '46']]) {
  const fileId = id === 'print_pdf' ? 'print-pdf' : id
  const current = resolveConsumerContract({ id, version, digest: read(`standards/paper-canonical/consumers/${fileId}-v${version}.json`).contractDigest })
  assert.equal(current.ok, true)
  const geometry = resolveConsumerClozeGeometry({ id, version, digest: current.contract.contractDigest })
  assert.equal(geometry.proportional, true)
  assert.equal(geometry.questionLabelWidthPt, 17.3)
  assert.deepEqual([...geometry.columnWidthSharesPt], [110.5, 104.1, 104.65, 101.65])
}
assert.throws(
  () => resolveConsumerClozeGeometry({ id: 'screen', version: '45', digest: 'sha256:not-a-contract' }),
  error => error.code === 'CANONICAL_CONSUMPTION_REJECTED',
)
assert.equal(clozeRhythm.horizontalChoiceGeometry.strategy.optionColumns, 'four_gold_normalized_fixed_origin_tracks')
const reproduced = spawnSync(process.execPath, ['scripts/generate-cloze-proportional-v60.mjs', '--check'], { encoding: 'utf8' })
assert.equal(reproduced.status, 0, reproduced.stderr)
console.log('PASS cloze v5 resolver keeps v4 fixed and selects proportional shares for v45/v46')
