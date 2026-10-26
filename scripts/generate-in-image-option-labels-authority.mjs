import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { digestJson, stableStringify } from '../shared/paper-canonical/stable.mjs'
const read = file => JSON.parse(readFileSync(file, 'utf8'))
const closed = properties => ({ type: 'object', additionalProperties: false, properties, required: Object.keys(properties) })
const string = { type: 'string', minLength: 1 }, digest = { $ref: '#/$defs/digest' }
const locator = { $ref: '#/$defs/locator' }, region = { $ref: '#/$defs/region' }
const schema = read('schemas/paper-canonical/nck1-source-materialization-v8.schema.json')
schema.$id = 'nck1-source-materialization-v9'
schema.properties.schemaVersion.const = schema.$id
schema.required = schema.required.filter(key => key !== 'paragraphJoins').concat('inImageOptionLabels')
schema.properties.inImageOptionLabels = { type: 'array', minItems: 1, items: closed({
  schemaVersion: { const: 'reading-in-image-option-labels-v1' }, groupId: string, questionId: string,
  questionSource: locator, anchorItemId: string, parentMediaId: string, parentRegionId: string,
  parentSource: locator, sourceDocumentSha256: digest, sourceSetDigest: digest, evidenceDigest: digest, confirmationDigest: digest,
  sourceReview: closed({ reviewedBy: { const: 'import_agent' }, labelsInParentPixels: { const: true }, reason: string }),
  labels: { type: 'array', minItems: 4, maxItems: 4, items: closed({
    label: { enum: ['A', 'B', 'C', 'D'] }, childMediaId: string, childSha256: digest, childRegion: region, labelRegion: region,
  }) },
}) }
const adapters = read('standards/paper-canonical/adapters/source-adapters-v27.json')
adapters.version = '28'
adapters.adapters.push({ ...adapters.adapters.find(item => item.adapterId === 'nck1-source-materialization'), version: '13' })
const manifest = read('standards/paper-canonical/manifest-v74.json')
manifest.version = '75'
Object.assign(manifest.artifacts.find(item => item.id === 'adapter'), {
  path: 'adapters/source-adapters-v28.json', sha256: digestJson(adapters),
})
manifest.schemas.push({ id: schema.$id, path: `../../schemas/paper-canonical/${schema.$id}.schema.json`, sha256: digestJson(schema) })
for (const [file, value] of [
  [`schemas/paper-canonical/${schema.$id}.schema.json`, schema],
  ['standards/paper-canonical/adapters/source-adapters-v28.json', adapters],
  ['standards/paper-canonical/manifest-v75.json', manifest],
]) {
  const bytes = `${stableStringify(value)}\n`
  if (process.argv.includes('--check')) assert.equal(readFileSync(file, 'utf8'), bytes, file)
  else writeFileSync(file, bytes, { flag: 'wx' })
}
console.log('PASS opt-in v75 Reading in-image A-D label evidence; historical authorities unchanged')
