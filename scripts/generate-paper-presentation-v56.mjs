// Renderer-only successor; never rewrite a historical authority or publication.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { digestJson, stableStringify, withoutKey } from '../shared/paper-canonical/stable.mjs'

const read = path => JSON.parse(readFileSync(path, 'utf8'))
const root = 'standards/paper-canonical/'
const policy = read(`${root}rendering/paper-presentation-v2.json`)
policy.schemaVersion = 'paper-presentation-v3'
policy.version = '3'
policy.inlineBlankSpacing = 'source_text_boundaries'
policy.continuationMaterialAlignment = 'justify_except_last_line'
// Role-based gold-reference layout; old consumer bindings retain old flow.
policy.roleLayout = 'golden_reference_v1'
policy.coverTypography = {
  bodySizePt: 10.5, lineHeightPt: 18, titleSizePt: 20,
  noticeLabelWeight: 700, noticeBodyWeight: 400, sectionHeadingWeight: 400,
  noticeFirstLineIndentEm: 2, noticeContinuationIndentEm: 0,
  transferNoticeFirstLineIndentEm: 2,
  defaultCoverGapsPt: [0, 72],
  screenProofWidthPx: 794,
}
const schema = read('schemas/paper-canonical/paper-presentation-v2.schema.json')
schema.$id = 'paper-presentation-v3'
schema.properties.schemaVersion.const = policy.schemaVersion
schema.properties.version.const = policy.version
schema.properties.coverTypography = { const: policy.coverTypography }
schema.properties.inlineBlankSpacing = { const: policy.inlineBlankSpacing }
schema.properties.continuationMaterialAlignment = { const: policy.continuationMaterialAlignment }
schema.properties.roleLayout = { const: policy.roleLayout }
schema.required.push('coverTypography', 'inlineBlankSpacing', 'continuationMaterialAlignment', 'roleLayout')
const policyPath = 'rendering/paper-presentation-v3.json'
const schemaPath = '../../schemas/paper-canonical/paper-presentation-v3.schema.json'
const manifest = read(`${root}manifest-v55.json`)
manifest.version = '56'
manifest.artifacts = manifest.artifacts.map(entry => entry.id === 'renderer-paper-presentation'
  ? { ...entry, path: policyPath, schemaId: schema.$id, sha256: digestJson(policy) } : entry)
manifest.schemas = manifest.schemas.map(entry => entry.id === 'paper-presentation-v2'
  ? { id: schema.$id, path: schemaPath, sha256: digestJson(schema) } : entry)
const outputs = new Map([
  [root + policyPath, policy], [root + schemaPath, schema],
  [root + 'manifest-v56.json', manifest],
])
for (const [name, previous, version] of [['screen', 43, 44], ['print-pdf', 44, 45]]) {
  const contract = read(`${root}consumers/${name}-v${previous}.json`)
  contract.version = String(version)
  contract.authorityManifestDigest = digestJson(manifest)
  contract.contractDigest = digestJson(withoutKey(contract, 'contractDigest'))
  outputs.set(`${root}consumers/${name}-v${version}.json`, contract)
}
for (const [path, value] of outputs) {
  const bytes = stableStringify(value) + '\n'
  if (process.argv.includes('--check')) assert.equal(readFileSync(path, 'utf8'), bytes, path)
  else writeFileSync(path, bytes)
}
console.log('PASS v56 presentation successor reproduces; historical files untouched')
