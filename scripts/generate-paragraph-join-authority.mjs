// Explicit source-reader capability; existing Canonical families/consumers stay unchanged.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { digestJson, stableStringify } from '../shared/paper-canonical/stable.mjs'
const read = file => JSON.parse(readFileSync(file, 'utf8'))
const closed = properties => ({ type: 'object', additionalProperties: false, properties, required: Object.keys(properties) })
const string = { type: 'string', minLength: 1 }
const schema = read('schemas/paper-canonical/nck1-source-materialization-v7.schema.json')
schema.$id = 'nck1-source-materialization-v8'
schema.properties.schemaVersion.const = schema.$id
schema.required.push('paragraphJoins')
schema.properties.paragraphJoins = { type: 'array', minItems: 1, items: closed({
  schemaVersion: { const: 'cross-page-paragraph-join-v1' }, joinId: string, groupId: string,
  sourceSetDigest: { $ref: '#/$defs/digest' }, evidenceDigest: { $ref: '#/$defs/digest' },
  confirmationSha256: { $ref: '#/$defs/digest' }, separator: { const: ' ' },
  sourceReview: closed({ reviewedBy: { const: 'import_agent' }, sameNaturalParagraph: { const: true },
    continuationLineUnindented: { const: true }, reason: string }),
  fragments: { type: 'array', minItems: 2, maxItems: 2, items: closed({
    blockId: string, itemId: string, observationIds: { type: 'array', minItems: 1, uniqueItems: true, items: string },
    source: { $ref: '#/$defs/locator' },
  }) },
}) }
const adapters = read('standards/paper-canonical/adapters/source-adapters-v26.json')
adapters.version = '27'
adapters.adapters.push({ ...adapters.adapters.find(item => item.adapterId === 'nck1-source-materialization'), version: '12' })
const manifest = read('standards/paper-canonical/manifest-v73.json')
manifest.version = '74'
Object.assign(manifest.artifacts.find(item => item.id === 'adapter'), {
  path: 'adapters/source-adapters-v27.json', sha256: digestJson(adapters),
})
manifest.schemas.push({ id: schema.$id, path: `../../schemas/paper-canonical/${schema.$id}.schema.json`, sha256: digestJson(schema) })
for (const [file, value] of [
  [`schemas/paper-canonical/${schema.$id}.schema.json`, schema],
  ['standards/paper-canonical/adapters/source-adapters-v27.json', adapters],
  ['standards/paper-canonical/manifest-v74.json', manifest],
]) {
  const bytes = `${stableStringify(value)}\n`
  if (process.argv.includes('--check')) assert.equal(readFileSync(file, 'utf8'), bytes, file)
  else writeFileSync(file, bytes, { flag: 'wx' })
}
console.log('PASS opt-in v74 cross-page paragraph joins; historical output unchanged')
