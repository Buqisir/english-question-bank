// Successor closures for source-backed figures in Application Writing prompts.
// Never rewrites historical manifests, consumer contracts, or their members.
import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { digestJson, stableStringify } from '../shared/paper-canonical/stable.mjs'

const root = 'standards/paper-canonical/'
const read = path => JSON.parse(readFileSync(path, 'utf8'))
const outputs = new Map()

// Raw import branch: v62 + materialization adapter behavior v6.
const adapter = read(`${root}adapters/source-adapters-v20.json`)
adapter.version = '21'
adapter.adapters.push({ ...adapter.adapters.find(a => a.adapterId === 'nck1-source-materialization'), version: '6' })
outputs.set(`${root}adapters/source-adapters-v21.json`, adapter)
for (const name of ['normalization-report', 'canonical-paper-publication']) {
  const schema = read(`schemas/paper-canonical/${name}-v62.schema.json`)
  schema.$id = `${name}-v64`
  schema.properties.schemaVersion.const = schema.$id
  if (name === 'canonical-paper-publication') schema.properties.members.properties.normalizationReport.properties.schemaVersion.const = 'normalization-report-v64'
  outputs.set(`schemas/paper-canonical/${name}-v64.schema.json`, schema)
}
const raw = read(`${root}manifest-v62.json`)
raw.version = '64'
for (const artifact of raw.artifacts) {
  if (artifact.id === 'adapter') { artifact.path = 'adapters/source-adapters-v21.json'; artifact.sha256 = digestJson(adapter) }
}
raw.schemas = raw.schemas.filter(s => !['normalization-report-v62', 'canonical-paper-publication-v62'].includes(s.id))
for (const name of ['normalization-report', 'canonical-paper-publication']) {
  const schema = outputs.get(`schemas/paper-canonical/${name}-v64.schema.json`)
  raw.schemas.push({ id: schema.$id, path: `../../schemas/paper-canonical/${schema.$id}.schema.json`, sha256: digestJson(schema) })
}
outputs.set(`${root}manifest-v64.json`, raw)

// Presentation branch: v63 + one renderer-owned capability artifact.
const capability = {
  schemaVersion: 'application-writing-prompt-figures-v1',
  id: 'application-writing-prompt-figures',
  version: '1',
  owner: 'renderer_typography',
  promptBlockKinds: ['paragraph', 'figure'],
  figureSource: 'captured_group_media_exactly_once_in_source_order',
  figurePresentation: 'shared_source_figure_with_media_presentation_intent',
  semanticRefs: 'paragraph_inlines_only',
  givenSkeleton: 'paragraph_only',
  noticeGrouping: 'contiguous_paragraph_runs_only',
  answerOnlyProducts: 'exclude_question_prompt',
}
outputs.set(`${root}rendering/application-writing-prompt-figures-v1.json`, capability)
const capabilitySchema = {
  $id: capability.schemaVersion,
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  const: capability,
}
outputs.set(`schemas/paper-canonical/${capability.schemaVersion}.schema.json`, capabilitySchema)
const presentation = read(`${root}manifest-v63.json`)
presentation.version = '65'
presentation.artifacts.push({
  id: 'renderer-application-writing-prompt-figures',
  owner: capability.owner,
  path: 'rendering/application-writing-prompt-figures-v1.json',
  schemaId: capability.schemaVersion,
  sha256: digestJson(capability),
})
presentation.schemas.push({ id: capabilitySchema.$id, path: `../../schemas/paper-canonical/${capabilitySchema.$id}.schema.json`, sha256: digestJson(capabilitySchema) })
outputs.set(`${root}manifest-v65.json`, presentation)
for (const [name, previousVersion] of [['screen', 46], ['print-pdf', 47]]) {
  const contract = read(`${root}consumers/${name}-v${previousVersion}.json`)
  contract.version = String(previousVersion + 1)
  contract.authorityManifestDigest = digestJson(presentation)
  delete contract.contractDigest
  contract.contractDigest = digestJson(contract)
  outputs.set(`${root}consumers/${name}-v${contract.version}.json`, contract)
}
for (const [path, value] of outputs) {
  const bytes = `${stableStringify(value)}\n`
  if (process.argv.includes('--check') || existsSync(path)) assert.equal(readFileSync(path, 'utf8'), bytes, path)
  else writeFileSync(path, bytes, { flag: 'wx' })
}
console.log('PASS v64/v65 application prompt figure closures preserve historical artifacts')
