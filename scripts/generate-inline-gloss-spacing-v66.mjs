// Raw-only successor: preserve source whitespace at text-inline boundaries.
// Historical v64 and presentation v65 remain byte-for-byte unchanged.
import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { digestJson, stableStringify } from '../shared/paper-canonical/stable.mjs'

const root = 'standards/paper-canonical/'
const read = path => JSON.parse(readFileSync(path, 'utf8'))
const rules = read(`${root}normalization/normalization-rules-v6.json`)
rules.schemaVersion = 'normalization-rules-v7'
rules.version = '7'
rules.rules.find(rule => rule.ruleId === 'canonical-visible-typography').version = '4'
const schema = read('schemas/paper-canonical/normalization-rules-v6.schema.json')
schema.$id = rules.schemaVersion
schema.properties.schemaVersion.const = rules.schemaVersion
schema.properties.version.const = rules.version
const outputs = new Map([
  [`${root}normalization/normalization-rules-v7.json`, rules],
  ['schemas/paper-canonical/normalization-rules-v7.schema.json', schema],
])
for (const name of ['normalization-report', 'canonical-paper-publication']) {
  const successor = read(`schemas/paper-canonical/${name}-v64.schema.json`)
  successor.$id = `${name}-v66`
  successor.properties.schemaVersion.const = successor.$id
  if (name === 'canonical-paper-publication') successor.properties.members.properties.normalizationReport.properties.schemaVersion.const = 'normalization-report-v66'
  outputs.set(`schemas/paper-canonical/${name}-v66.schema.json`, successor)
}
const manifest = read(`${root}manifest-v64.json`)
manifest.version = '66'
manifest.artifacts = manifest.artifacts.map(entry => entry.id === 'normalization'
  ? { ...entry, path: 'normalization/normalization-rules-v7.json', schemaId: schema.$id, sha256: digestJson(rules) } : entry)
manifest.schemas = manifest.schemas.map(entry => {
  const id = entry.id === 'normalization-rules-v6' ? schema.$id
    : entry.id === 'normalization-report-v64' ? 'normalization-report-v66'
      : entry.id === 'canonical-paper-publication-v64' ? 'canonical-paper-publication-v66' : null
  return id ? { id, path: `../../schemas/paper-canonical/${id}.schema.json`,
    sha256: digestJson(outputs.get(`schemas/paper-canonical/${id}.schema.json`)) } : entry
})
outputs.set(`${root}manifest-v66.json`, manifest)
for (const [path, value] of outputs) {
  const bytes = `${stableStringify(value)}\n`
  if (process.argv.includes('--check') || existsSync(path)) assert.equal(readFileSync(path, 'utf8'), bytes, path)
  else writeFileSync(path, bytes, { flag: 'wx' })
}
console.log('PASS v66 inline-gloss spacing closure preserves historical artifacts')
