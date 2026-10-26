// Opt-in source-reader extension; Canonical families and consumers are unchanged.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { digestJson, stableStringify } from '../shared/paper-canonical/stable.mjs'

const read = file => JSON.parse(readFileSync(file, 'utf8'))
const schema = read('schemas/paper-canonical/nck1-source-materialization-v6.schema.json')
schema.$id = 'nck1-source-materialization-v7'
schema.properties.schemaVersion.const = schema.$id
// Native DOCX inputs need not manufacture source-presentation evidence.
schema.required = schema.required.filter(key => key !== 'sourcePresentation')
schema.$defs.writingTask.properties.givenBlockRefs = {
  type: 'array', minItems: 1, uniqueItems: true,
  items: { type: 'string', minLength: 1 },
}
schema.$defs.writingTask.allOf.push({
  if: { required: ['givenBlockRefs'] },
  then: { properties: { taskType: { const: 'application' } } },
})
const adapters = read('standards/paper-canonical/adapters/source-adapters-v25.json')
adapters.version = '26'
adapters.adapters.push({
  ...adapters.adapters.find(item => item.adapterId === 'nck1-source-materialization'),
  version: '11',
})
const manifest = read('standards/paper-canonical/manifest-v71.json')
manifest.version = '73'
Object.assign(manifest.artifacts.find(item => item.id === 'adapter'), {
  path: 'adapters/source-adapters-v26.json', sha256: digestJson(adapters),
})
manifest.schemas.push({
  id: schema.$id, path: `../../schemas/paper-canonical/${schema.$id}.schema.json`,
  sha256: digestJson(schema),
})
for (const [file, value] of [
  [`schemas/paper-canonical/${schema.$id}.schema.json`, schema],
  ['standards/paper-canonical/adapters/source-adapters-v26.json', adapters],
  ['standards/paper-canonical/manifest-v73.json', manifest],
]) {
  const bytes = `${stableStringify(value)}\n`
  if (process.argv.includes('--check')) assert.equal(readFileSync(file, 'utf8'), bytes, file)
  else writeFileSync(file, bytes, { flag: 'wx' })
}
console.log('PASS opt-in v73 writing given refs; historical authority and consumers unchanged')
