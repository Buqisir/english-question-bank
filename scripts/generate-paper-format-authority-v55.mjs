// Reproducible analyzed-package authority successor. Historical bytes stay immutable.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { digestJson, stableStringify, withoutKey } from '../shared/paper-canonical/stable.mjs'

const read = path => JSON.parse(readFileSync(path, 'utf8'))
const root = 'standards/paper-canonical/'
const manifest = read(`${root}manifest-v54.json`)
manifest.version = '55'
manifest.artifacts = manifest.artifacts.map(descriptor => descriptor.id === 'adapter'
  ? { ...descriptor, path: 'adapters/source-adapters-v17.json', sha256: digestJson(read(`${root}adapters/source-adapters-v17.json`)) }
  : descriptor)
const removed = new Set(['normalization-report-v54', 'canonical-paper-publication-v54'])
manifest.schemas = manifest.schemas.filter(descriptor => !removed.has(descriptor.id))
for (const [id, path] of [
  ['normalization-report-v55', '../../schemas/paper-canonical/normalization-report-v55.schema.json'],
  ['canonical-paper-publication-v55', '../../schemas/paper-canonical/canonical-paper-publication-v55.schema.json'],
  ['nck1-analyzed-package-v1', '../../schemas/paper-canonical/nck1-analyzed-package-v1.schema.json'],
  ['nck1-analyzed-package-input-v1', '../../schemas/paper-canonical/nck1-analyzed-package-input-v1.schema.json'],
  ['package-json-pointer-evidence-v1', '../../schemas/paper-canonical/package-json-pointer-evidence-v1.schema.json'],
]) manifest.schemas.push({ id, path, sha256: digestJson(read(`${root}${path}`)) })

const outputs = new Map([[`${root}manifest-v55.json`, manifest]])
for (const [name, previousVersion, version] of [['screen', '42', '43'], ['print-pdf', '43', '44']]) {
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
console.log('PASS analyzed-package v55 authority artifacts reproduce from v54')
