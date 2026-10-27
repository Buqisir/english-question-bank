// Additive reader capability; historical manifests/schemas remain immutable.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { digestJson, stableStringify } from '../shared/paper-canonical/stable.mjs'
const read = file => JSON.parse(readFileSync(file, 'utf8'))
const schema = read('schemas/paper-canonical/nck1-source-materialization-v11.schema.json')
schema.$id = 'nck1-source-materialization-v12'
schema.properties.schemaVersion.const = schema.$id
schema.required.push('paragraphJoins')
const legacyRelation = schema.properties.paragraphJoins.items
const relation = structuredClone(legacyRelation)
relation.properties.schemaVersion.const = 'cross-page-paragraph-join-v2'
schema.properties.paragraphJoins.items = { oneOf: [legacyRelation, relation] }
const adapters = read('standards/paper-canonical/adapters/source-adapters-v30.json')
adapters.version = '31'
adapters.adapters.push({ ...adapters.adapters.find(item => item.adapterId === 'nck1-source-materialization'), version: '16' })
const manifest = read('standards/paper-canonical/manifest-v77.json')
manifest.version = '78'
Object.assign(manifest.artifacts.find(item => item.id === 'adapter'), {
  path: 'adapters/source-adapters-v31.json', sha256: digestJson(adapters),
})
manifest.schemas.push({ id: schema.$id, path: `../../schemas/paper-canonical/${schema.$id}.schema.json`, sha256: digestJson(schema) })
for (const [file, value] of [
  [`schemas/paper-canonical/${schema.$id}.schema.json`, schema],
  ['standards/paper-canonical/adapters/source-adapters-v31.json', adapters],
  ['standards/paper-canonical/manifest-v78.json', manifest],
]) {
  const bytes = `${stableStringify(value)}\n`
  if (process.argv.includes('--check')) assert.equal(readFileSync(file, 'utf8'), bytes, file)
  else writeFileSync(file, bytes, { flag: 'wx' })
}
console.log('PASS v78 sealed v2/v3 cross-page text/blank joins; historical artifacts unchanged')
