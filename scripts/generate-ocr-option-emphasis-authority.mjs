// Explicit successor: keep every historical schema/registry/manifest immutable.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { digestJson, stableStringify } from '../shared/paper-canonical/stable.mjs'
const read = file => JSON.parse(readFileSync(file, 'utf8'))
const schema = read('schemas/paper-canonical/nck1-source-materialization-v10.schema.json')
schema.$id = 'nck1-source-materialization-v11'
schema.properties.schemaVersion.const = schema.$id
schema.required = schema.required.filter(key => key !== 'listeningSourceDecision')
const rich = read('standards/paper-canonical/core/rich-content-v4.json')
rich.version = '5'
rich.schemaVersion = 'rich-content-v5'
rich.ocrSourceEmphasis.scope = 'Reading paragraphs, question stems and literal per-question options; Application Writing and Continuation Writing paragraphs; no table cells or inferred formatting'
rich.ocrSourceEmphasis.optionMapping = 'Unique question locator, contiguous confirmed source order, complete literal stem and ordered labels/text; each range wholly inside one stem/option, never across labels or options; original UTF-16 coordinates through validated editorial edits'
const richSchema = { $schema: 'https://json-schema.org/draft/2020-12/schema', $id: rich.schemaVersion, const: rich }
const adapters = read('standards/paper-canonical/adapters/source-adapters-v29.json')
adapters.version = '30'
adapters.adapters.push({ ...adapters.adapters.find(item => item.adapterId === 'nck1-source-materialization'), version: '15' })
const manifest = read('standards/paper-canonical/manifest-v76.json')
manifest.version = '77'
Object.assign(manifest.artifacts.find(item => item.id === 'adapter'), {
  path: 'adapters/source-adapters-v30.json', sha256: digestJson(adapters),
})
Object.assign(manifest.artifacts.find(item => item.id === 'rich-content'), {
  path: 'core/rich-content-v5.json', schemaId: rich.schemaVersion, sha256: digestJson(rich),
})
manifest.schemas = manifest.schemas.filter(item => item.id !== 'rich-content-v4')
for (const [id, value] of [[schema.$id, schema], [rich.schemaVersion, richSchema]]) {
  manifest.schemas.push({ id, path: `../../schemas/paper-canonical/${id}.schema.json`, sha256: digestJson(value) })
}
for (const [file, value] of [
  [`schemas/paper-canonical/${schema.$id}.schema.json`, schema],
  [`schemas/paper-canonical/${rich.schemaVersion}.schema.json`, richSchema],
  ['standards/paper-canonical/core/rich-content-v5.json', rich],
  ['standards/paper-canonical/adapters/source-adapters-v30.json', adapters],
  ['standards/paper-canonical/manifest-v77.json', manifest],
]) {
  const bytes = `${stableStringify(value)}\n`
  if (process.argv.includes('--check')) assert.equal(readFileSync(file, 'utf8'), bytes, file)
  else writeFileSync(file, bytes, { flag: 'wx' })
}
console.log('PASS v77 OCR option emphasis authority; historical artifacts unchanged')
