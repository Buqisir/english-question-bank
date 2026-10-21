// Opt-in complete v6 reader; historical closures and default no-figure imports
// retain their identities. This generator never overwrites historical files.
import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { digestJson, stableStringify, withoutKey } from '../shared/paper-canonical/stable.mjs'

const root = 'standards/paper-canonical/'
const read = file => JSON.parse(readFileSync(file, 'utf8'))
const outputs = new Map()
const materialization = read('schemas/paper-canonical/nck1-source-materialization-v5.schema.json')
materialization.$id = 'nck1-source-materialization-v6'
materialization.properties.schemaVersion.const = materialization.$id
materialization.$defs.stemFigure = {
  type: 'object', additionalProperties: false,
  required: ['kind', 'blockId', 'mediaId', 'caption', 'source'],
  properties: {
    kind: { const: 'figure' }, blockId: { type: 'string', minLength: 1 },
    mediaId: { type: 'string', minLength: 1 }, caption: { const: '' },
    source: structuredClone(materialization.$defs.locator.oneOf[0]),
  },
}
materialization.$defs.question.properties.stemFigures = {
  type: 'array', minItems: 1, items: { $ref: '#/$defs/stemFigure' },
}
outputs.set(`schemas/paper-canonical/${materialization.$id}.schema.json`, materialization)
const reading = read(`${root}families/reading-v2.json`)
reading.schemaVersion = 'canonical-family-contract-v13'
reading.version = '3'
reading.stemFigures = 'ordered_question_owned_source_figures'
reading.stemFigureCaption = 'empty'
reading.mediaReferencePolicy = 'Passage, table, question stem and option figures share one exact-once same-group immutable media bank'
outputs.set(`${root}families/reading-v3.json`, reading)
const familySchema = read('schemas/paper-canonical/canonical-family-contract-v11.schema.json')
familySchema.$id = reading.schemaVersion
for (const [key, value] of Object.entries(reading)) familySchema.properties[key] = { const: value }
familySchema.required = Object.keys(reading)
outputs.set(`schemas/paper-canonical/${familySchema.$id}.schema.json`, familySchema)
const adapter = read(`${root}adapters/source-adapters-v24.json`)
adapter.version = '25'
adapter.adapters.push({ ...adapter.adapters.find(item => item.adapterId === 'nck1-source-materialization'), version: '10' })
outputs.set(`${root}adapters/source-adapters-v25.json`, adapter)
for (const name of ['normalization-report', 'canonical-paper-publication']) {
  const schema = read(`schemas/paper-canonical/${name}-v69.schema.json`)
  schema.$id = `${name}-v70`
  schema.properties.schemaVersion.const = schema.$id
  if (name === 'canonical-paper-publication') schema.properties.members.properties.normalizationReport.properties.schemaVersion.const = 'normalization-report-v70'
  outputs.set(`schemas/paper-canonical/${schema.$id}.schema.json`, schema)
}
const manifest = read(`${root}manifest-v69.json`)
manifest.version = '71'
const profiles = new Map()
for (const item of manifest.artifacts.filter(item => item.owner === 'profile')) {
  const profile = read(`${root}${item.path}`)
  profile.version = String(Number(profile.version) + 1)
  for (const part of profile.parts) for (const section of part.sections) for (const slot of section.slots) {
    if (slot.familyContractRef?.id === 'reading') slot.familyContractRef.version = reading.version
  }
  const path = `profiles/${profile.profileId}-v${profile.version}.json`
  outputs.set(`${root}${path}`, profile)
  profiles.set(item.id, { ...item, path, sha256: digestJson(profile) })
}
manifest.artifacts = manifest.artifacts.map(item => item.id === 'adapter'
  ? { ...item, path: 'adapters/source-adapters-v25.json', sha256: digestJson(adapter) }
  : item.id === 'family-reading'
    ? { ...item, path: 'families/reading-v3.json', schemaId: reading.schemaVersion, sha256: digestJson(reading) }
    : profiles.get(item.id) || item)
manifest.schemas = manifest.schemas.filter(item => !['normalization-report-v69', 'canonical-paper-publication-v69'].includes(item.id))
for (const [file, schema] of outputs) {
  if (file.startsWith('schemas/')) manifest.schemas.push({ id: schema.$id, path: `../../${file}`, sha256: digestJson(schema) })
}
outputs.set(`${root}manifest-v71.json`, manifest)
// Keep the Drawing Area presentation policy and all historical layout artifacts.
const presentation = read(`${root}manifest-v70.json`)
presentation.version = '72'
for (const id of ['adapter', 'family-reading', ...profiles.keys()]) {
  Object.assign(presentation.artifacts.find(item => item.id === id), manifest.artifacts.find(item => item.id === id))
}
for (const schema of [materialization, familySchema]) {
  presentation.schemas.push({ id: schema.$id, path: `../../schemas/paper-canonical/${schema.$id}.schema.json`, sha256: digestJson(schema) })
}
outputs.set(`${root}manifest-v72.json`, presentation)
for (const [name, previous, next] of [['screen', 48, 49], ['print-pdf', 49, 50]]) {
  const contract = read(`${root}consumers/${name}-v${previous}.json`)
  contract.version = String(next)
  contract.authorityManifestDigest = digestJson(presentation)
  contract.families = contract.families.map(item => item.familyContractId === 'reading'
    ? { ...item, version: reading.version, digest: digestJson(reading) } : item)
  contract.contractDigest = digestJson(withoutKey(contract, 'contractDigest'))
  outputs.set(`${root}consumers/${name}-v${next}.json`, contract)
}
for (const [file, value] of outputs) {
  const bytes = `${stableStringify(value)}\n`
  if (process.argv.includes('--refresh')) writeFileSync(file, bytes)
  else if (process.argv.includes('--check') || existsSync(file)) assert.equal(readFileSync(file, 'utf8'), bytes, file)
  else writeFileSync(file, bytes, { flag: 'wx' })
}
console.log('Generated opt-in v71/v72 Reading stem figure authority and consumers; historical files unchanged')
