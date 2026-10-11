// Extend raw-source v59 only; historical authorities and presentation v60 stay fixed.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { digestJson, stableStringify } from '../shared/paper-canonical/stable.mjs'

const root = 'standards/paper-canonical/'
const read = path => JSON.parse(readFileSync(path, 'utf8'))
const outputs = new Map()
const adapter = read(`${root}adapters/source-adapters-v18.json`)
adapter.version = '19'
adapter.adapters.push({ ...adapter.adapters.find(a => a.adapterId === 'nck1-source-materialization'), version: '4' })
outputs.set(`${root}adapters/source-adapters-v19.json`, adapter)
const rich = read(`${root}core/rich-content-v2.json`)
rich.version = '3'
rich.schemaVersion = 'rich-content-v3'
rich.ocrSourceEmphasis = {
  marks: ['bold', 'underline'],
  source: 'Agent-confirmed exact text ranges bound to immutable OCR page pixels and original source documents; no inferred styling',
  scope: 'Reading paragraph text and Reading question stems only; no options, tables or writing',
  mapping: 'original UTF-16 coordinates through validated editorial edits; reject mixed-boundary edits, unmatched source ranges and typography drift',
}
outputs.set(`${root}core/rich-content-v3.json`, rich)
const richSchema = read('schemas/paper-canonical/rich-content-v2.schema.json')
richSchema.$id = rich.schemaVersion
richSchema.properties.schemaVersion.const = rich.schemaVersion
richSchema.properties.version.const = rich.version
richSchema.required.push('ocrSourceEmphasis')
richSchema.properties.ocrSourceEmphasis = { const: rich.ocrSourceEmphasis }
outputs.set('schemas/paper-canonical/rich-content-v3.schema.json', richSchema)
for (const name of ['normalization-report', 'canonical-paper-publication']) {
  const schema = read(`schemas/paper-canonical/${name}-v59.schema.json`)
  schema.$id = `${name}-v61`
  schema.properties.schemaVersion.const = `${name}-v61`
  if (name === 'canonical-paper-publication') schema.properties.members.properties.normalizationReport.properties.schemaVersion.const = 'normalization-report-v61'
  outputs.set(`schemas/paper-canonical/${name}-v61.schema.json`, schema)
}
const manifest = read(`${root}manifest-v59.json`)
manifest.version = '61'
for (const artifact of manifest.artifacts) {
  if (artifact.id === 'adapter') { artifact.path = 'adapters/source-adapters-v19.json'; artifact.sha256 = digestJson(adapter) }
  if (artifact.id === 'rich-content') { artifact.path = 'core/rich-content-v3.json'; artifact.schemaId = rich.schemaVersion; artifact.sha256 = digestJson(rich) }
}
manifest.schemas = manifest.schemas.filter(s => !['normalization-report-v59', 'canonical-paper-publication-v59', 'rich-content-v2'].includes(s.id))
for (const id of ['normalization-report-v61', 'canonical-paper-publication-v61', 'rich-content-v3']) {
  const path = `schemas/paper-canonical/${id}.schema.json`
  manifest.schemas.push({ id, path: `../../${path}`, sha256: digestJson(outputs.get(path)) })
}
outputs.set(`${root}manifest-v61.json`, manifest)
for (const [path, value] of outputs) {
  const bytes = `${stableStringify(value)}\n`
  if (process.argv.includes('--check')) assert.equal(readFileSync(path, 'utf8'), bytes, path)
  else writeFileSync(path, bytes, { flag: 'wx' })
}
console.log('PASS OCR source-emphasis v61 authority artifacts reproduce without historical rewrites')
