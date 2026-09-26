// New reading-option placement authority; v58 and earlier remain byte-for-byte fixed.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { digestJson, stableStringify } from '../shared/paper-canonical/stable.mjs'

const read = path => JSON.parse(readFileSync(path, 'utf8'))
const root = 'standards/paper-canonical/'
const outputs = new Map()
const typography = read(`${root}rendering/paper-typography-v10.json`)
typography.version = '11'
typography.schemaVersion = 'renderer-typography-v11'
typography.provenance.producer = 'paper-canonical-renderer-typography-v11'
typography.rules = typography.rules.map(rule => rule === 'reading_option_modes_share_one_mid_column_anchor'
  ? 'reading_two_column_questions_share_passage_safe_anchor' : rule)
typography.rules.push('reading_four_column_C_shares_passage_anchor_when_safe')
typography.optionAnchorFramework.reading.twoColumnAnchorStrategy = 'passage_maximum_safe_left_with_right_fit'
typography.optionAnchorFramework.reading.fourColumnCAnchorStrategy = 'passage_two_column_anchor_with_minimum_safe_D_shift_or_mode_fallback'
outputs.set(`${root}rendering/paper-typography-v11.json`, typography)
const typographySchema = read('schemas/paper-canonical/renderer-typography-v10.schema.json')
typographySchema.$id = typography.schemaVersion
typographySchema.const = typography
outputs.set('schemas/paper-canonical/renderer-typography-v11.schema.json', typographySchema)
for (const name of ['normalization-report', 'canonical-paper-publication']) {
  const schema = read(`schemas/paper-canonical/${name}-v58.schema.json`)
  schema.$id = `${name}-v59`
  schema.properties.schemaVersion.const = `${name}-v59`
  if (name === 'canonical-paper-publication') {
    schema.properties.members.properties.normalizationReport.properties.schemaVersion.const = 'normalization-report-v59'
  }
  outputs.set(`schemas/paper-canonical/${name}-v59.schema.json`, schema)
}
const manifest = read(`${root}manifest-v58.json`)
manifest.version = '59'
const renderer = manifest.artifacts.find(({ id }) => id === 'renderer-typography')
renderer.path = 'rendering/paper-typography-v11.json'
renderer.schemaId = typography.schemaVersion
renderer.sha256 = digestJson(typography)
manifest.schemas = manifest.schemas.filter(({ id }) => ![
  'renderer-typography-v10', 'normalization-report-v58', 'canonical-paper-publication-v58',
].includes(id))
for (const id of ['renderer-typography-v11', 'normalization-report-v59', 'canonical-paper-publication-v59']) {
  const path = `schemas/paper-canonical/${id}.schema.json`
  manifest.schemas.push({ id, path: `../../${path}`, sha256: digestJson(outputs.get(path)) })
}
outputs.set(`${root}manifest-v59.json`, manifest)
for (const [path, value] of outputs) {
  const bytes = `${stableStringify(value)}\n`
  if (process.argv.includes('--check')) assert.equal(readFileSync(path, 'utf8'), bytes, path)
  else writeFileSync(path, bytes)
}
console.log('PASS adaptive A-D v59 authority artifacts reproduce without historical rewrites')
