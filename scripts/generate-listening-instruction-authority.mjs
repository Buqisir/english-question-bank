// Opt-in raw-source successor for audited recording-count corrections.
// Uncorrected imports and all historical closures keep their original identity.
import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { digestJson, stableStringify } from '../shared/paper-canonical/stable.mjs'

const root = 'standards/paper-canonical/'
const read = file => JSON.parse(readFileSync(file, 'utf8'))
const outputs = new Map()
const string = { type: 'string', minLength: 1 }
const hash = { type: 'string', pattern: '^sha256:[a-f0-9]{64}$' }
const object = properties => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties })
const list = items => ({ type: 'array', minItems: 1, items })
const range = { startSeconds: { type: 'number', minimum: 0 }, endSeconds: { type: 'number', exclusiveMinimum: 0 } }
const correction = {
  $id: 'listening-instruction-correction-v1',
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  ...object({
    schemaVersion: { const: 'listening-instruction-correction-v1' },
    policy: { const: 'verified-recording-count-v1' }, paperId: string,
    materializationSha256: hash, transcriptDigest: hash, originalAudioSha256: hash, playbackAudioSha256: hash,
    durationSeconds: { type: 'number', exclusiveMinimum: 0 }, reviewedBy: { const: 'import_agent' }, reviewedAt: string,
    method: { enum: ['asr_source_comparison', 'audio_source_comparison'] }, untrustedContentHandledAsData: { const: true },
    evidence: list(object({ evidenceId: string, content: string, sha256: hash,
      byteLength: { type: 'integer', minimum: 1 }, window: object(range),
      settings: object({ engine: string, model: string, language: string, vad: { type: 'boolean' }, computeType: string }),
    })),
    instructions: list(object({ slotId: { enum: ['listening.short-dialogue', 'listening.long-form'] },
      source: { type: 'object' }, before: string, after: string, playCount: { enum: [1, 2] }, reason: string,
      groups: list(object({ segmentId: string,
        occurrences: list(object({ ...range, evidenceIds: { ...list(string), uniqueItems: true } })),
      })),
    })),
  }),
}
outputs.set(`schemas/paper-canonical/${correction.$id}.schema.json`, correction)
const adapter = read(`${root}adapters/source-adapters-v22.json`)
adapter.version = '23'
adapter.adapters.push({ ...adapter.adapters.find(item => item.adapterId === 'nck1-source-materialization'), version: '8' })
outputs.set(`${root}adapters/source-adapters-v23.json`, adapter)
for (const name of ['normalization-report', 'canonical-paper-publication']) {
  const schema = read(`schemas/paper-canonical/${name}-v67.schema.json`)
  schema.$id = `${name}-v68`
  schema.properties.schemaVersion.const = schema.$id
  if (name === 'canonical-paper-publication') schema.properties.members.properties.normalizationReport.properties.schemaVersion.const = 'normalization-report-v68'
  outputs.set(`schemas/paper-canonical/${schema.$id}.schema.json`, schema)
}
const manifest = read(`${root}manifest-v67.json`)
manifest.version = '68'
manifest.artifacts = manifest.artifacts.map(item => item.id === 'adapter'
  ? { ...item, path: 'adapters/source-adapters-v23.json', sha256: digestJson(adapter) } : item)
manifest.schemas = manifest.schemas.filter(item => !['normalization-report-v67', 'canonical-paper-publication-v67'].includes(item.id))
for (const [file, schema] of outputs) {
  if (!file.startsWith('schemas/')) continue
  manifest.schemas.push({ id: schema.$id, path: `../../${file}`, sha256: digestJson(schema) })
}
outputs.set(`${root}manifest-v68.json`, manifest)
for (const [file, value] of outputs) {
  const bytes = `${stableStringify(value)}\n`
  if (process.argv.includes('--check') || existsSync(file)) assert.equal(readFileSync(file, 'utf8'), bytes, file)
  else writeFileSync(file, bytes, { flag: 'wx' })
}
console.log('Generated opt-in v68 listening instruction correction closure; historical files unchanged')
