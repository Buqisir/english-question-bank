// Additive successors only: never rewrite a historical authority member.
import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { digestJson, stableStringify } from '../shared/paper-canonical/stable.mjs'

const root = 'standards/paper-canonical/'
const read = path => JSON.parse(readFileSync(path, 'utf8'))
const outputs = new Map()
const schemaPath = id => `schemas/paper-canonical/${id}.schema.json`
const addSchema = (manifest, schema) => {
  outputs.set(schemaPath(schema.$id), schema)
  manifest.schemas.push({ id: schema.$id, path: `../../${schemaPath(schema.$id)}`, sha256: digestJson(schema) })
}
const replaceArtifact = (manifest, id, path, artifact, schemaId) => {
  const descriptor = manifest.artifacts.find(item => item.id === id)
  Object.assign(descriptor, { path, sha256: digestJson(artifact), ...(schemaId ? { schemaId } : {}) })
  outputs.set(root + path, artifact)
}

const raw = read(`${root}manifest-v68.json`)
raw.version = '69'
const materialization = read(schemaPath('nck1-source-materialization-v4'))
materialization.$id = 'nck1-source-materialization-v5'
materialization.properties.schemaVersion.const = materialization.$id
materialization.$defs.writingTask.properties.drawingArea = {
  type: 'object', additionalProperties: false,
  required: ['placement', 'labelBlockRef', 'source'],
  properties: { placement: { const: 'top_right' }, labelBlockRef: { type: 'string', minLength: 1 }, source: { $ref: '#/$defs/locator' } },
}
materialization.$defs.writingTask.allOf = [{
  if: { required: ['drawingArea'] }, then: { properties: { taskType: { const: 'application' } } },
}]
addSchema(raw, materialization)
const variant = read(schemaPath('canonical-application-writing-variant-v1'))
variant.$id = 'canonical-application-writing-variant-v3'
variant.properties.response.properties.drawingArea = {
  type: 'object', additionalProperties: false,
  required: ['drawingAreaId', 'placement', 'labelBlockRef', 'authorityObservationRef'],
  properties: {
    drawingAreaId: { type: 'string', minLength: 1 }, placement: { const: 'top_right' },
    labelBlockRef: { type: 'string', minLength: 1 }, authorityObservationRef: { type: 'string', minLength: 1 },
  },
}
addSchema(raw, variant)
const family = read(`${root}families/application-writing-v3.json`)
family.version = '5'
family.schemaVersion = 'canonical-family-contract-v12'
family.variantSchemaId = variant.$id
const familySchema = read(schemaPath('canonical-family-contract-v3'))
familySchema.$id = family.schemaVersion
for (const key of ['schemaVersion', 'version', 'variantSchemaId']) familySchema.properties[key].const = family[key]
addSchema(raw, familySchema)
replaceArtifact(raw, 'family-application-writing', 'families/application-writing-v5.json', family, familySchema.$id)
const adapters = read(`${root}adapters/source-adapters-v23.json`)
adapters.version = '24'
adapters.adapters.push({ ...adapters.adapters.find(item => item.adapterId === 'nck1-source-materialization'), version: '9' })
replaceArtifact(raw, 'adapter', 'adapters/source-adapters-v24.json', adapters)
for (const [id, previousVersion] of [['nck1', 16], ['zhejiang-legacy', 13]]) {
  const profile = read(`${root}profiles/${id}-v${previousVersion}.json`)
  profile.version = String(previousVersion + 1)
  for (const part of profile.parts) for (const section of part.sections) for (const slot of section.slots) {
    if (slot.familyContractRef?.id === 'application-writing') slot.familyContractRef.version = family.version
  }
  replaceArtifact(raw, `profile-${id}`, `profiles/${id}-v${profile.version}.json`, profile)
}
raw.schemas = raw.schemas.filter(item => !['normalization-report-v68', 'canonical-paper-publication-v68'].includes(item.id))
for (const name of ['normalization-report', 'canonical-paper-publication']) {
  const schema = read(schemaPath(`${name}-v68`))
  schema.$id = `${name}-v69`
  schema.properties.schemaVersion.const = schema.$id
  if (name === 'canonical-paper-publication') schema.properties.members.properties.normalizationReport.properties.schemaVersion.const = 'normalization-report-v69'
  addSchema(raw, schema)
}
outputs.set(`${root}manifest-v69.json`, raw)

const presentation = read(`${root}manifest-v65.json`)
presentation.version = '70'
// Consumer families and profiles declare the new semantic contract; raw source
// evidence and historical presentation artifacts remain separately bound.
for (const id of ['family-application-writing', 'profile-nck1', 'profile-zhejiang-legacy']) {
  Object.assign(presentation.artifacts.find(item => item.id === id), raw.artifacts.find(item => item.id === id))
}
for (const schema of [variant, familySchema]) addSchema(presentation, schema)
const policy = {
  schemaVersion: 'application-writing-drawing-area-v1',
  id: 'application-writing-drawing-area', version: '1', owner: 'renderer_typography',
  placement: 'top_right', widthRatio: 0.25, aspectRatio: 1,
  labelPlacement: 'inside_top_left', labelPaddingPx: 4, border: 'same_as_response_box',
  topLayout: 'given_left_drawing_right', bottomLayout: 'full_width_writing_then_signature',
  answerOnly: 'omit', minimumApplicationHeightMm: 65,
}
const policySchema = { $id: policy.schemaVersion, $schema: 'https://json-schema.org/draft/2020-12/schema', const: policy }
addSchema(presentation, policySchema)
outputs.set(`${root}rendering/application-writing-drawing-area-v1.json`, policy)
presentation.artifacts.push({
  id: 'renderer-application-writing-drawing-area', owner: policy.owner,
  path: 'rendering/application-writing-drawing-area-v1.json', schemaId: policySchema.$id, sha256: digestJson(policy),
})
outputs.set(`${root}manifest-v70.json`, presentation)
for (const [name, previousVersion] of [['screen', 47], ['print-pdf', 48]]) {
  const consumer = read(`${root}consumers/${name}-v${previousVersion}.json`)
  consumer.version = String(previousVersion + 1)
  consumer.authorityManifestDigest = digestJson(presentation)
  const application = consumer.families.find(item => item.familyContractId === family.familyContractId)
  application.version = family.version
  application.digest = digestJson(family)
  delete consumer.contractDigest
  consumer.contractDigest = digestJson(consumer)
  outputs.set(`${root}consumers/${name}-v${consumer.version}.json`, consumer)
}
for (const [path, value] of outputs) {
  const bytes = `${stableStringify(value)}\n`
  // Explicit refresh applies only to this branch's unpublished successor outputs.
  if (process.argv.includes('--write-candidate') && !process.argv.includes('--check')) writeFileSync(path, bytes)
  else if (process.argv.includes('--check') || existsSync(path)) assert.equal(readFileSync(path, 'utf8'), bytes, path)
  else writeFileSync(path, bytes, { flag: 'wx' })
}
console.log('PASS drawing-area v69/v70 successors preserve historical authority members')
