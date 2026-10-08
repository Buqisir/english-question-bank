// Renderer-only cloze proportional successor. Never rewrite v4 or presentation 56.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { digestJson, stableStringify, withoutKey } from '../shared/paper-canonical/stable.mjs'

const read = path => JSON.parse(readFileSync(path, 'utf8'))
const root = 'standards/paper-canonical/'
const labelWidthPt = 17.3
const shares = [110.5, 104.1, 104.65, 101.65]
const rhythm = read(`${root}rendering/cloze-rhythm-v4.json`)
rhythm.schemaVersion = 'cloze-rhythm-v5'
rhythm.version = '5'
rhythm.rules = rhythm.rules.map(rule => rule === 'source_cloze_rows_use_one_gold_normalized_four_column_plan'
  ? 'source_cloze_rows_use_one_proportional_four_column_plan' : rule)
const strategy = rhythm.horizontalChoiceGeometry.strategy
strategy.optionColumns = 'four_proportional_remaining_width_tracks'
strategy.trailingCapacity = 'shares_only_no_fixed_origins'
strategy.distribution = 'proportional_remaining_width_not_space_between'
const mapping = rhythm.horizontalChoiceGeometry.rendererMapping
delete mapping.rowWidthPt
delete mapping.columnStartsPt
delete mapping.columnWidthsPt
mapping.columnWidthSharesPt = shares
mapping.proportional = true
for (const edge of rhythm.adjacencyGraph) {
  if (edge.horizontalRelation === 'four_gold_normalized_fixed_origin_tracks') {
    edge.horizontalRelation = 'four_proportional_remaining_width_tracks'
  }
}
const schema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'cloze-rhythm-v5',
  const: rhythm,
}
const manifest = read(`${root}manifest-v56.json`)
manifest.version = '60'
manifest.artifacts = manifest.artifacts.map(entry => entry.id === 'renderer-cloze-rhythm'
  ? { ...entry, path: 'rendering/cloze-rhythm-v5.json', schemaId: schema.$id, sha256: digestJson(rhythm) }
  : entry)
manifest.schemas = manifest.schemas.map(entry => entry.id === 'cloze-rhythm-v4'
  ? { id: schema.$id, path: '../../schemas/paper-canonical/cloze-rhythm-v5.schema.json', sha256: digestJson(schema) }
  : entry)
const outputs = new Map([
  [`${root}rendering/cloze-rhythm-v5.json`, rhythm],
  ['schemas/paper-canonical/cloze-rhythm-v5.schema.json', schema],
  [`${root}manifest-v60.json`, manifest],
])
for (const [name, previous, version] of [['screen', 44, 45], ['print-pdf', 45, 46]]) {
  const contract = read(`${root}consumers/${name}-v${previous}.json`)
  contract.version = String(version)
  contract.authorityManifestDigest = digestJson(manifest)
  contract.contractDigest = digestJson(withoutKey(contract, 'contractDigest'))
  outputs.set(`${root}consumers/${name}-v${version}.json`, contract)
}
const conformance = read('test-fixtures/paper-canonical/cloze-rhythm-v4-conformance.json')
conformance.schemaVersion = 'cloze-rhythm-v5-conformance-v1'
conformance.authority = { schemaVersion: 'cloze-rhythm-v5', id: 'cloze-rhythm', version: '5' }
for (const attack of conformance.semanticAttacks) {
  if (attack.caseId === 'cloze-column-anchor-drift') {
    attack.path = ['horizontalChoiceGeometry', 'rendererMapping', 'columnWidthSharesPt', 2]
  }
}
outputs.set('test-fixtures/paper-canonical/cloze-rhythm-v5-conformance.json', conformance)
const migration = `# Cloze Rhythm v5 migration

Cloze Rhythm v5 succeeds immutable v4. v4 keeps its fixed column origins and must not be reinterpreted as proportional tracks. v5 keeps the v4 question label at 17.3pt and allocates the remaining row width by the frozen shares 110.5:104.1:104.65:101.65. \`rendererMapping.proportional\` is true only on this successor. Manifest v60, Screen v45 and Print/PDF v46 select it. Presentation policy, Candidate 59 and global accepted 36 stay unchanged. Historical consumer 44/45 keep the v4 fixed mapping.

Reproduce: \`node scripts/generate-cloze-proportional-v60.mjs --check\`.
`
const migrationPath = `${root}rendering/cloze-rhythm-v5-migration.md`
if (process.argv.includes('--check')) assert.equal(readFileSync(migrationPath, 'utf8'), migration, migrationPath)
else writeFileSync(migrationPath, migration)
for (const [path, value] of outputs) {
  const bytes = stableStringify(value) + '\n'
  if (process.argv.includes('--check')) assert.equal(readFileSync(path, 'utf8'), bytes, path)
  else writeFileSync(path, bytes)
}
assert.equal(labelWidthPt, rhythm.horizontalChoiceGeometry.rendererMapping.questionLabelWidthPt)
console.log('PASS v60 cloze proportional successor reproduces; v4 untouched')
