// Opt-in complete v5 reader; historical closures and default no-figure imports
// retain their identities. This generator never overwrites historical files.
import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { digestJson, stableStringify, withoutKey } from '../shared/paper-canonical/stable.mjs'

const root = 'standards/paper-canonical/'
const read = file => JSON.parse(readFileSync(file, 'utf8'))
const outputs = new Map()
const reading = read(`${root}families/reading-v2.json`)
reading.schemaVersion = 'canonical-family-contract-v12'
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
const adapter = read(`${root}adapters/source-adapters-v23.json`)
adapter.version = '24'
adapter.adapters.push({ ...adapter.adapters.find(item => item.adapterId === 'nck1-source-materialization'), version: '9' })
outputs.set(`${root}adapters/source-adapters-v24.json`, adapter)
for (const name of ['normalization-report', 'canonical-paper-publication']) {
  const schema = read(`schemas/paper-canonical/${name}-v68.schema.json`)
  schema.$id = `${name}-v69`
  schema.properties.schemaVersion.const = schema.$id
  if (name === 'canonical-paper-publication') schema.properties.members.properties.normalizationReport.properties.schemaVersion.const = 'normalization-report-v69'
  outputs.set(`schemas/paper-canonical/${schema.$id}.schema.json`, schema)
}
const manifest = read(`${root}manifest-v68.json`)
manifest.version = '69'
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
  ? { ...item, path: 'adapters/source-adapters-v24.json', sha256: digestJson(adapter) }
  : item.id === 'family-reading'
    ? { ...item, path: 'families/reading-v3.json', schemaId: reading.schemaVersion, sha256: digestJson(reading) }
    : profiles.get(item.id) || item)
manifest.schemas = manifest.schemas.filter(item => !['normalization-report-v68', 'canonical-paper-publication-v68'].includes(item.id))
for (const [file, schema] of [
  ...outputs,
  ['schemas/paper-canonical/nck1-source-materialization-v5.schema.json', read('schemas/paper-canonical/nck1-source-materialization-v5.schema.json')],
]) {
  if (file.startsWith('schemas/')) manifest.schemas.push({ id: schema.$id, path: `../../${file}`, sha256: digestJson(schema) })
}
outputs.set(`${root}manifest-v69.json`, manifest)
for (const [name, previous, next] of [['screen', 47, 48], ['print-pdf', 48, 49]]) {
  const contract = read(`${root}consumers/${name}-v${previous}.json`)
  contract.version = String(next)
  contract.authorityManifestDigest = digestJson(manifest)
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
console.log('Generated opt-in v69 Reading stem figure authority and consumers; historical files unchanged')
