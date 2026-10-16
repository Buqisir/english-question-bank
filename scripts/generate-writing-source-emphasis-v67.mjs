// Add writing source emphasis without changing retained raw authorities.
import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { digestJson, stableStringify } from '../shared/paper-canonical/stable.mjs'

const root = 'standards/paper-canonical/'
const read = path => JSON.parse(readFileSync(path, 'utf8'))
const rich = read(`${root}core/rich-content-v3.json`)
rich.schemaVersion = 'rich-content-v4'
rich.version = '4'
rich.ocrSourceEmphasis.scope = 'Reading paragraphs and question stems, Application Writing and Continuation Writing paragraphs; no options or table cells'
rich.ocrSourceEmphasis.answerSource = 'Retain exact answer-document text, ranges and locators as private source observations; never attach answer emphasis to same-text question content'
const richSchema = { $schema: 'https://json-schema.org/draft/2020-12/schema', $id: rich.schemaVersion, const: rich }
const adapter = read(`${root}adapters/source-adapters-v21.json`)
adapter.version = '22'
adapter.adapters.push({ ...adapter.adapters.find(item => item.adapterId === 'nck1-source-materialization'), version: '7' })
const outputs = new Map([
  [`${root}core/rich-content-v4.json`, rich],
  [`schemas/paper-canonical/${rich.schemaVersion}.schema.json`, richSchema],
  [`${root}adapters/source-adapters-v22.json`, adapter],
])
for (const name of ['normalization-report', 'canonical-paper-publication']) {
  const schema = read(`schemas/paper-canonical/${name}-v66.schema.json`)
  schema.$id = `${name}-v67`
  schema.properties.schemaVersion.const = schema.$id
  if (name === 'canonical-paper-publication') schema.properties.members.properties.normalizationReport.properties.schemaVersion.const = 'normalization-report-v67'
  outputs.set(`schemas/paper-canonical/${schema.$id}.schema.json`, schema)
}
const manifest = read(`${root}manifest-v66.json`)
manifest.version = '67'
manifest.artifacts = manifest.artifacts.map(entry => entry.id === 'adapter'
  ? { ...entry, path: 'adapters/source-adapters-v22.json', sha256: digestJson(adapter) }
  : entry.id === 'rich-content'
    ? { ...entry, path: 'core/rich-content-v4.json', schemaId: rich.schemaVersion, sha256: digestJson(rich) } : entry)
manifest.schemas = manifest.schemas.map(entry => {
  const id = entry.id === 'rich-content-v3' ? rich.schemaVersion
    : entry.id === 'normalization-report-v66' ? 'normalization-report-v67'
      : entry.id === 'canonical-paper-publication-v66' ? 'canonical-paper-publication-v67' : null
  return id ? { id, path: `../../schemas/paper-canonical/${id}.schema.json`,
    sha256: digestJson(outputs.get(`schemas/paper-canonical/${id}.schema.json`)) } : entry
})
outputs.set(`${root}manifest-v67.json`, manifest)
for (const [path, value] of outputs) {
  const bytes = `${stableStringify(value)}\n`
  if (process.argv.includes('--check') || existsSync(path)) assert.equal(readFileSync(path, 'utf8'), bytes, path)
  else writeFileSync(path, bytes, { flag: 'wx' })
}
console.log('PASS v67 writing-source emphasis closure preserves historical artifacts')
