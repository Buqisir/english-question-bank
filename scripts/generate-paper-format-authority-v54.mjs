// Reproducible combined producer/presentation successor. Historical bytes stay immutable.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { digestJson, stableStringify, withoutKey } from '../shared/paper-canonical/stable.mjs'

const read = path => JSON.parse(readFileSync(path, 'utf8'))
const root = 'standards/paper-canonical/'
const manifest = read(`${root}manifest-v53.json`)
manifest.version = '54'

const replacements = {
  adapter: ['adapters/source-adapters-v16.json', 'source-adapters-v1'],
  'renderer-paper-presentation': ['rendering/paper-presentation-v2.json', 'paper-presentation-v2'],
}
manifest.artifacts = manifest.artifacts.map(descriptor => {
  const replacement = replacements[descriptor.id]
  if (!replacement) return descriptor
  const [path, schemaId] = replacement
  return { ...descriptor, path, schemaId, sha256: digestJson(read(root + path)) }
})
const schemaReplacements = {
  'normalization-report-v52': ['normalization-report-v54', '../../schemas/paper-canonical/normalization-report-v54.schema.json'],
  'canonical-paper-publication-v52': ['canonical-paper-publication-v54', '../../schemas/paper-canonical/canonical-paper-publication-v54.schema.json'],
  'paper-presentation-v1': ['paper-presentation-v2', '../../schemas/paper-canonical/paper-presentation-v2.schema.json'],
}
manifest.schemas = manifest.schemas.map(descriptor => {
  const replacement = schemaReplacements[descriptor.id]
  if (!replacement) return descriptor
  const [id, path] = replacement
  return { id, path, sha256: digestJson(read(`${root}${path}`)) }
})

const outputs = new Map([[`${root}manifest-v54.json`, manifest]])
for (const [name, previousVersion, version] of [['screen', '41', '42'], ['print-pdf', '42', '43']]) {
  const contract = read(`${root}consumers/${name}-v${previousVersion}.json`)
  contract.version = version
  contract.authorityManifestDigest = digestJson(manifest)
  contract.contractDigest = digestJson(withoutKey(contract, 'contractDigest'))
  outputs.set(`${root}consumers/${name}-v${version}.json`, contract)
}
for (const [path, value] of outputs) {
  const bytes = stableStringify(value) + '\n'
  if (process.argv.includes('--check')) assert.equal(readFileSync(path, 'utf8'), bytes, path)
  else writeFileSync(path, bytes)
}
console.log('PASS combined v54 authority artifacts reproduce from v53')
