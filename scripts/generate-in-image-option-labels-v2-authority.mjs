// Additive v2 image-bank authority. Historical bytes are never overwritten.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { digestJson, stableStringify } from '../shared/paper-canonical/stable.mjs'
const read = file => JSON.parse(readFileSync(file, 'utf8'))
const closed = properties => ({ type: 'object', additionalProperties: false, properties, required: Object.keys(properties) })
const string = { type: 'string', minLength: 1 }
const measurement = read('schemas/paper-canonical/reading-source-layout-measurement-v1.schema.json')
measurement.$id = 'reading-source-layout-measurement-v2'
measurement.properties.schemaVersion.const = measurement.$id
measurement.properties.labelEvidence = closed({
  kind: { const: 'confirmed_in_image_option_labels_v2' },
  decisionDigest: { type: 'string', pattern: '^sha256:[a-f0-9]{64}$' },
  pageRasterDigest: { type: 'string', pattern: '^sha256:[a-f0-9]{64}$' },
})
measurement.required.push('labelEvidence')
const schema = read('schemas/paper-canonical/nck1-source-materialization-v12.schema.json')
schema.$id = 'nck1-source-materialization-v13'
schema.properties.schemaVersion.const = schema.$id
schema.required = schema.required.filter(key => !['paragraphJoins', 'inImageOptionLabels'].includes(key)).concat('inImageOptionLabels')
const v1 = read('schemas/paper-canonical/nck1-source-materialization-v9.schema.json').properties.inImageOptionLabels.items
const v2 = structuredClone(v1)
v2.properties.schemaVersion.const = 'reading-in-image-option-labels-v2'
Object.assign(v2.properties, {
  layout: { const: 'grid_2x2_row_major' },
  itemOwnership: { type: 'array', items: closed({
    itemId: string, text: { type: 'string', minLength: 1 },
    fragments: { type: 'array', minItems: 1, items: closed({
      start: { type: 'integer', minimum: 0 }, end: { type: 'integer', minimum: 1 },
      observationIds: { type: 'array', minItems: 1, uniqueItems: true, items: string },
      target: { oneOf: [closed({ kind: { const: 'option' }, label: { enum: ['A', 'B', 'C', 'D'] } }),
        closed({ kind: { const: 'shared' }, mediaId: string })] },
    }) },
  }) },
  sharedFigure: { oneOf: [{ type: 'null' }, closed({
    role: { enum: ['legend', 'stem_image'] }, mediaId: string, sha256: { $ref: '#/$defs/digest' },
    region: { $ref: '#/$defs/region' }, blockId: string,
  })] },
})
v2.required.push('layout', 'itemOwnership', 'sharedFigure')
Object.assign(v2.properties.sourceReview.properties, {
  allParentContentRetained: { const: true }, noOrdinaryProseConsumed: { const: true }, sharedContextForAllOptions: { const: true },
})
v2.properties.sourceReview.properties.reviewedPageRasterDigest = { $ref: '#/$defs/digest' }
v2.properties.sourceReview.required.push('allParentContentRetained', 'noOrdinaryProseConsumed', 'reviewedPageRasterDigest')
const embedded = structuredClone(measurement)
delete embedded.$id
schema.$defs.question.properties.figureLayout.properties.measurementEvidenceBody = {
  oneOf: [schema.$defs.question.properties.figureLayout.properties.measurementEvidenceBody, embedded],
}
v2.allOf = [{
  if: { properties: { sharedFigure: { type: 'null' } } },
  then: { properties: { sourceReview: { not: { required: ['sharedContextForAllOptions'] } } } },
  else: { properties: { sourceReview: { required: ['sharedContextForAllOptions'] } } },
}]
schema.properties.inImageOptionLabels = {
  type: 'array', minItems: 1, items: { oneOf: [v1, v2] },
  contains: { type: 'object', required: ['schemaVersion'], properties: { schemaVersion: { const: 'reading-in-image-option-labels-v2' } } },
}
const adapters = read('standards/paper-canonical/adapters/source-adapters-v33.json')
adapters.version = '34'
adapters.adapters.push({ ...adapters.adapters.find(item => item.adapterId === 'nck1-source-materialization'), version: '19', capabilities: ['reading_in_image_label_measurement_v2'] })
const manifest = read('standards/paper-canonical/manifest-v80.json')
manifest.version = '81'
Object.assign(manifest.artifacts.find(item => item.id === 'adapter'), {
  path: 'adapters/source-adapters-v34.json', sha256: digestJson(adapters),
})
manifest.schemas.push({ id: measurement.$id, path: `../../schemas/paper-canonical/${measurement.$id}.schema.json`, sha256: digestJson(measurement) })
manifest.schemas.push({ id: schema.$id, path: `../../schemas/paper-canonical/${schema.$id}.schema.json`, sha256: digestJson(schema) })
for (const [file, value] of [
  [`schemas/paper-canonical/${measurement.$id}.schema.json`, measurement],
  [`schemas/paper-canonical/${schema.$id}.schema.json`, schema],
  ['standards/paper-canonical/adapters/source-adapters-v34.json', adapters],
  ['standards/paper-canonical/manifest-v81.json', manifest],
]) {
  const bytes = `${stableStringify(value)}\n`
  if (process.argv.includes('--check')) assert.equal(readFileSync(file, 'utf8'), bytes, file)
  else writeFileSync(file, bytes)
}
console.log('PASS v81 Reading image options v2; historical artifacts unchanged')
