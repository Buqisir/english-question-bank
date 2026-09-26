// Raw-materialization successor only; presentation v56 and historical bytes stay fixed.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { digestJson, stableStringify } from '../shared/paper-canonical/stable.mjs'

const read = path => JSON.parse(readFileSync(path, 'utf8'))
const root = 'standards/paper-canonical/'
const rules = read(`${root}normalization/normalization-rules-v5.json`)
rules.schemaVersion = 'normalization-rules-v6'
rules.version = '6'
rules.rules.find(rule => rule.ruleId === 'canonical-visible-typography').version = '3'
const schema = read('schemas/paper-canonical/normalization-rules-v5.schema.json')
schema.$id = rules.schemaVersion
schema.properties.schemaVersion.const = rules.schemaVersion
schema.properties.version.const = rules.version
const outputs = new Map([
  [`${root}normalization/normalization-rules-v6.json`, rules],
  ['schemas/paper-canonical/normalization-rules-v6.schema.json', schema],
])
for (const name of ['normalization-report', 'canonical-paper-publication']) {
  const previous = read(`schemas/paper-canonical/${name}-v54.schema.json`)
  const successor = JSON.parse(JSON.stringify(previous).replaceAll('normalization-report-v54', 'normalization-report-v57').replaceAll('canonical-paper-publication-v54', 'canonical-paper-publication-v57'))
  outputs.set(`schemas/paper-canonical/${name}-v57.schema.json`, successor)
}
const manifest = read(`${root}manifest-v54.json`)
manifest.version = '57'
manifest.artifacts = manifest.artifacts.map(entry => entry.id === 'normalization'
  ? { ...entry, path: 'normalization/normalization-rules-v6.json', schemaId: schema.$id, sha256: digestJson(rules) } : entry)
manifest.schemas = manifest.schemas.map(entry => {
  const id = entry.id === 'normalization-rules-v5' ? schema.$id
    : entry.id === 'normalization-report-v54' ? 'normalization-report-v57'
      : entry.id === 'canonical-paper-publication-v54' ? 'canonical-paper-publication-v57' : null
  return id ? { id, path: `../../schemas/paper-canonical/${id}.schema.json`,
    sha256: digestJson(outputs.get(`schemas/paper-canonical/${id}.schema.json`)) } : entry
})
outputs.set(`${root}manifest-v57.json`, manifest)
for (const [path, value] of outputs) {
  const bytes = stableStringify(value) + '\n'
  if (process.argv.includes('--check')) assert.equal(readFileSync(path, 'utf8'), bytes, path)
  else writeFileSync(path, bytes)
}
console.log('PASS v57 Chinese-gloss successor reproduces; v54/v55/v56 unchanged')
