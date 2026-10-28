// Additive successor: preserve all historical artifacts and schemas.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { digestJson, stableStringify } from '../shared/paper-canonical/stable.mjs'
const read = file => JSON.parse(readFileSync(file, 'utf8'))
const adapters = read('standards/paper-canonical/adapters/source-adapters-v32.json')
adapters.version = '33'
adapters.adapters.push({ ...adapters.adapters.find(item => item.adapterId === 'nck1-source-materialization'), version: '18' })
const manifest = read('standards/paper-canonical/manifest-v79.json')
manifest.version = '80'
Object.assign(manifest.artifacts.find(item => item.id === 'adapter'), {
  path: 'adapters/source-adapters-v33.json', sha256: digestJson(adapters),
})
for (const [file, value] of [
  ['standards/paper-canonical/adapters/source-adapters-v33.json', adapters],
  ['standards/paper-canonical/manifest-v80.json', manifest],
]) {
  const bytes = `${stableStringify(value)}\n`
  if (process.argv.includes('--check')) assert.equal(readFileSync(file, 'utf8'), bytes, file)
  else writeFileSync(file, bytes, { flag: 'wx' })
}
console.log('PASS v80 multiple writing notices; historical artifacts unchanged')
