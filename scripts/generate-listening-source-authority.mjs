// Explicit source interpretation only; no new Canonical listening shape.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { digestJson, stableStringify } from '../shared/paper-canonical/stable.mjs'
const read = file => JSON.parse(readFileSync(file, 'utf8'))
const closed = properties => ({ type: 'object', additionalProperties: false, properties, required: Object.keys(properties) })
const string = { type: 'string', minLength: 1 }
const address = closed({ itemId: string, text: string })
const nullableAddress = { anyOf: [address, { type: 'null' }] }
const schema = read('schemas/paper-canonical/nck1-source-materialization-v9.schema.json')
schema.$id = 'nck1-source-materialization-v10'
schema.properties.schemaVersion.const = schema.$id
schema.required = schema.required.filter(key => !['paragraphJoins', 'inImageOptionLabels'].includes(key))
schema.required.push('listeningSourceDecision')
schema.properties.listeningSourceDecision = closed({
  schemaVersion: { const: 'listening-source-decision-v1' }, documentId: string,
  sourceSetDigest: { $ref: '#/$defs/digest' }, evidenceDigest: { $ref: '#/$defs/digest' },
  confirmationSha256: { $ref: '#/$defs/digest' }, heading: nullableAddress, start: address, end: nullableAddress,
  sourceReview: closed({ reviewedBy: { const: 'import_agent' }, originalPagesReviewed: { const: true },
    allSpeechRetained: { const: true }, reason: string }),
  roles: { type: 'array', maxItems: 256, items: closed({
    role: { enum: ['example', 'cue', 'speech'] },
    nextTextNumber: { anyOf: [{ type: 'integer', minimum: 1, maximum: 10 }, { type: 'null' }] },
    questionNumbers: { type: 'array', uniqueItems: true, items: { type: 'integer', minimum: 1, maximum: 20 } },
    fragments: { type: 'array', minItems: 1, maxItems: 256, items: closed({
      itemId: string, start: { type: 'integer', minimum: 0 }, end: { type: 'integer', minimum: 1 },
      text: { type: 'string', minLength: 1 },
    }) },
  }) },
})
const adapters = read('standards/paper-canonical/adapters/source-adapters-v28.json')
adapters.version = '29'
adapters.adapters.push({ ...adapters.adapters.find(item => item.adapterId === 'nck1-source-materialization'), version: '14' })
const manifest = read('standards/paper-canonical/manifest-v75.json')
manifest.version = '76'
Object.assign(manifest.artifacts.find(item => item.id === 'adapter'), {
  path: 'adapters/source-adapters-v29.json', sha256: digestJson(adapters),
})
manifest.schemas.push({ id: schema.$id, path: `../../schemas/paper-canonical/${schema.$id}.schema.json`, sha256: digestJson(schema) })
for (const [file, value] of [
  [`schemas/paper-canonical/${schema.$id}.schema.json`, schema],
  ['standards/paper-canonical/adapters/source-adapters-v29.json', adapters],
  ['standards/paper-canonical/manifest-v76.json', manifest],
]) {
  const bytes = `${stableStringify(value)}\n`
  if (process.argv.includes('--check')) assert.equal(readFileSync(file, 'utf8'), bytes, file)
  else writeFileSync(file, bytes, { flag: 'wx' })
}
console.log('PASS opt-in v76 listening source decisions; historical authorities unchanged')
