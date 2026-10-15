// New raw-source closure; never rewrite historical manifests or their members.
import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { digestJson, stableStringify } from '../shared/paper-canonical/stable.mjs'

const root = 'standards/paper-canonical/'
const read = path => JSON.parse(readFileSync(path, 'utf8'))
const outputs = new Map()
const adapter = read(`${root}adapters/source-adapters-v19.json`)
adapter.version = '20'
adapter.adapters.push({ ...adapter.adapters.find(a => a.adapterId === 'nck1-source-materialization'), version: '5' })
outputs.set(`${root}adapters/source-adapters-v20.json`, adapter)
const core = read(`${root}core/core-invariants-v2.json`)
core.schemaVersion = 'core-invariants-v3'
core.version = '3'
core.groupSchemaId = 'canonical-question-group-v3'
outputs.set(`${root}core/core-invariants-v3.json`, core)
const coreSchema = read('schemas/paper-canonical/core-invariants-v2.schema.json')
coreSchema.$id = core.schemaVersion
coreSchema.const = core
outputs.set('schemas/paper-canonical/core-invariants-v3.schema.json', coreSchema)
const group = read('schemas/paper-canonical/canonical-question-group-v2.schema.json')
group.$id = 'canonical-question-group-v3'
group.properties.schemaVersion.const = group.$id
group.properties.sourcePresentation = { type: 'object' }
outputs.set('schemas/paper-canonical/canonical-question-group-v3.schema.json', group)
const materialization = read('schemas/paper-canonical/nck1-source-materialization-v3.schema.json')
materialization.$id = 'nck1-source-materialization-v4'
materialization.properties.schemaVersion.const = materialization.$id
materialization.required.push('sourcePresentation')
materialization.properties.sourcePresentation = { type: 'object', additionalProperties: false,
  required: ['instructions', 'listeningExample'], properties: {
    instructions: { type: 'array', minItems: 4, maxItems: 6, items: {
      type: 'object', additionalProperties: false, required: ['slotId', 'text', 'source'],
      properties: { slotId: { enum: ['listening.short-dialogue', 'listening.long-form', 'reading.a', 'seven-choices', 'cloze', 'grammar-fill'] },
        text: { type: 'string', minLength: 1 }, source: { $ref: '#/$defs/locator' } },
    } }, listeningExample: { type: ['object', 'null'] },
  } }
outputs.set('schemas/paper-canonical/nck1-source-materialization-v4.schema.json', materialization)
for (const name of ['normalization-report', 'canonical-paper-publication']) {
  const schema = read(`schemas/paper-canonical/${name}-v61.schema.json`)
  schema.$id = `${name}-v62`
  schema.properties.schemaVersion.const = schema.$id
  if (name === 'canonical-paper-publication') schema.properties.members.properties.normalizationReport.properties.schemaVersion.const = 'normalization-report-v62'
  outputs.set(`schemas/paper-canonical/${name}-v62.schema.json`, schema)
}
const manifest = read(`${root}manifest-v61.json`)
manifest.version = '62'
for (const artifact of manifest.artifacts) {
  if (artifact.id === 'adapter') { artifact.path = 'adapters/source-adapters-v20.json'; artifact.sha256 = digestJson(adapter) }
  if (artifact.id === 'core') { artifact.path = 'core/core-invariants-v3.json'; artifact.schemaId = core.schemaVersion; artifact.sha256 = digestJson(core) }
}
manifest.schemas = manifest.schemas.filter(s => !['normalization-report-v61', 'canonical-paper-publication-v61'].includes(s.id))
for (const [path, schema] of outputs) {
  if (!path.startsWith('schemas/')) continue
  manifest.schemas.push({ id: schema.$id, path: `../../${path}`, sha256: digestJson(schema) })
}
outputs.set(`${root}manifest-v62.json`, manifest)
for (const [name, previousVersion] of [['screen', 45], ['print-pdf', 46]]) {
  const contract = read(`${root}consumers/${name}-v${previousVersion}.json`)
  contract.version = String(previousVersion + 1)
  contract.authorityManifestDigest = digestJson(manifest)
  delete contract.contractDigest
  contract.contractDigest = digestJson(contract)
  outputs.set(`${root}consumers/${name}-v${contract.version}.json`, contract)
}
for (const [path, value] of outputs) {
  const bytes = `${stableStringify(value)}\n`
  if (process.argv.includes('--check') || existsSync(path)) assert.equal(readFileSync(path, 'utf8'), bytes, path)
  else writeFileSync(path, bytes, { flag: 'wx' })
}
console.log('PASS v62 source-presentation closure preserves historical artifacts')
