// Source-native Reading emphasis successor; historical artifacts are inputs only.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { digestJson, stableStringify } from '../shared/paper-canonical/stable.mjs'

const root = 'standards/paper-canonical/'
const read = (path) => JSON.parse(readFileSync(path, 'utf8'))
const outputs = new Map()
const adapter = read(`${root}adapters/source-adapters-v16.json`)
adapter.version = '18'
// Retain v2 for unchanged source observations; lexical-mark observations use v3.
adapter.adapters.push({ ...adapter.adapters.find((a) => a.adapterId === 'nck1-source-materialization'), version: '3' })
outputs.set(`${root}adapters/source-adapters-v18.json`, adapter)
const rich = read(`${root}core/rich-content-v1.json`)
rich.version = '2'
rich.schemaVersion = 'rich-content-v2'
rich.readingParagraphEmphasis = {
  marks: ['bold', 'underline'],
  source: 'direct DOCX run properties at the exact paragraph locator; no inferred or inherited styling',
  scope: 'Reading paragraph text only; omit whole-paragraph decoration independently per property',
  mapping: 'original UTF-16 coordinates through validated editorial edits; reject mixed-boundary edits and typography drift',
}
outputs.set(`${root}core/rich-content-v2.json`, rich)
const richSchema = read('schemas/paper-canonical/rich-content-v1.schema.json')
richSchema.$id = 'rich-content-v2'
richSchema.properties.schemaVersion.const = 'rich-content-v2'
richSchema.properties.version.const = '2'
richSchema.required.push('readingParagraphEmphasis')
richSchema.properties.readingParagraphEmphasis = { const: rich.readingParagraphEmphasis }
outputs.set('schemas/paper-canonical/rich-content-v2.schema.json', richSchema)
for (const name of ['normalization-report', 'canonical-paper-publication']) {
  const schema = read(`schemas/paper-canonical/${name}-v57.schema.json`)
  schema.$id = `${name}-v58`
  schema.properties.schemaVersion.const = `${name}-v58`
  if (name === 'canonical-paper-publication') schema.properties.members.properties.normalizationReport.properties.schemaVersion.const = 'normalization-report-v58'
  outputs.set(`schemas/paper-canonical/${name}-v58.schema.json`, schema)
}
const manifest = read(`${root}manifest-v57.json`)
manifest.version = '58'
for (const artifact of manifest.artifacts) {
  if (artifact.id === 'adapter') { artifact.path = 'adapters/source-adapters-v18.json'; artifact.sha256 = digestJson(adapter) }
  if (artifact.id === 'rich-content') { artifact.path = 'core/rich-content-v2.json'; artifact.schemaId = 'rich-content-v2'; artifact.sha256 = digestJson(rich) }
}
manifest.schemas = manifest.schemas.filter((s) => !['normalization-report-v57', 'canonical-paper-publication-v57', 'rich-content-v1'].includes(s.id))
for (const name of ['normalization-report-v58', 'canonical-paper-publication-v58', 'rich-content-v2']) {
  const path = `schemas/paper-canonical/${name}.schema.json`
  manifest.schemas.push({ id: name, path: `../../${path}`, sha256: digestJson(outputs.get(path)) })
}
outputs.set(`${root}manifest-v58.json`, manifest)
for (const [path, value] of outputs) {
  const bytes = stableStringify(value) + '\n'
  if (process.argv.includes('--check')) assert.equal(readFileSync(path, 'utf8'), bytes, path)
  else writeFileSync(path, bytes)
}
console.log('PASS source-emphasis v58 authority artifacts reproduce without historical rewrites')
