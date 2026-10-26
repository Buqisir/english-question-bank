import { existsSync, realpathSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { loadNck1ReviewSource } from '../../server/import-review/revisionProjection.mjs'
import { deriveNck1MaterializationBundle } from '../../server/paper-canonical/nck1MaterializationAdapter.mjs'

// No new semantic decision: select the successor reader for already sealed
// OCR marks. Never edit the confirmation, invent a range or rebind a review.
export function upgradeOcrOptionEmphasis(input) {
  if (!input.ocrSourceBytes || input.spellingReviewBytes) throw new Error('Option emphasis upgrade requires confirmed OCR before spelling review')
  const materialization = JSON.parse(new TextDecoder().decode(input.materializationBytes))
  if (!/^nck1-source-materialization-v(?:[1-9]|10)$/u.test(materialization.schemaVersion)) throw new Error('Option emphasis upgrade requires a retained historical envelope')
  const upgraded = { ...materialization, schemaVersion: 'nck1-source-materialization-v11' }
  const materializationBytes = Buffer.from(`${JSON.stringify(upgraded, null, 2)}\n`)
  const derived = deriveNck1MaterializationBundle({ ...input, materializationBytes })
  if (derived.issues.length) throw new Error(`Option emphasis upgrade failed: ${JSON.stringify(derived.issues)}`)
  if (!derived.source.observations.some(observation => observation.observationId.startsWith('observation:source-option-emphasis:')
    && observation.observationId.includes(':option:'))) {
    throw new Error('Option emphasis upgrade requires a replayed confirmed option range')
  }
  return { materialization: upgraded, materializationBytes }
}

function main() {
  const option = name => { const index = process.argv.indexOf(name); return index < 0 ? null : process.argv[index + 1] }
  if (!option('--paper-dir') || !option('--output')) throw new Error('Use --paper-dir <read-only-paper-dir> --output <new-materialization.json>')
  const paperDir = realpathSync(path.resolve(option('--paper-dir'))), output = path.resolve(option('--output'))
  if (existsSync(output)) throw new Error('Output exists; retain it and select a new path')
  let ancestor = path.dirname(output)
  while (!existsSync(ancestor)) ancestor = path.dirname(ancestor)
  const resolvedOutput = path.resolve(realpathSync(ancestor), path.relative(ancestor, output))
  if (resolvedOutput === paperDir || resolvedOutput.startsWith(`${paperDir}${path.sep}`)) throw new Error('Output must be outside the read-only paper directory')
  const { sourceInput } = loadNck1ReviewSource(paperDir, { preparingSpelling: true })
  const result = upgradeOcrOptionEmphasis(sourceInput)
  writeFileSync(output, result.materializationBytes, { flag: 'wx' })
  console.log('PASS exact confirmed OCR emphasis replay; wrote separate v11 materialization; regenerate spelling request against these bytes')
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main()
