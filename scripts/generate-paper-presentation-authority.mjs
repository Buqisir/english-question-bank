// Reproducible renderer-only successor. Never regenerates a historical artifact.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { digestJson, stableStringify, withoutKey } from '../shared/paper-canonical/stable.mjs'

const read = path => JSON.parse(readFileSync(path, 'utf8'))
const root = 'standards/paper-canonical/'
const policyPath = 'rendering/paper-presentation-v1.json'
const schemaPath = '../../schemas/paper-canonical/paper-presentation-v1.schema.json'
const manifest = read(`${root}manifest-v52.json`)
manifest.version = '53'
manifest.artifacts.push({ id: 'renderer-paper-presentation', owner: 'renderer_typography',
  path: policyPath, schemaId: 'paper-presentation-v1', sha256: digestJson(read(root + policyPath)) })
manifest.schemas.push({ id: 'paper-presentation-v1', path: schemaPath, sha256: digestJson(read(root + schemaPath)) })
const outputs = new Map([[`${root}manifest-v53.json`, manifest]])
for (const [name, previousVersion, version] of [['screen', '40', '41'], ['print-pdf', '41', '42']]) {
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
console.log('PASS renderer-only authority artifacts reproduce from v52 and presentation v1')
