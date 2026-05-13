#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { buildReviewCandidatePayload } from './reading-parse-review-queue.mjs'

function parseArgs(argv) {
  const args = {
    input: '',
    output: '',
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = argv[index + 1]
    if (arg === '--input') {
      args.input = next || ''
      index += 1
    } else if (arg === '--output') {
      args.output = next || ''
      index += 1
    }
  }

  if (!args.input) throw new Error('Usage: node scripts/review/build-reading-parse-review-candidates.mjs --input <eval-report.json> [--output <path>]')
  return args
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

function defaultOutputPath(report, inputPath) {
  const runId = report.runId || path.basename(inputPath).replace(/^reading-parse-eval-/, '').replace(/\.json$/i, '')
  return path.join(process.cwd(), 'reports', `reading-parse-review-candidates-${runId}.json`)
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const inputPath = path.resolve(args.input)
  const report = readJson(inputPath)
  const outputPath = path.resolve(args.output || defaultOutputPath(report, inputPath))
  const payload = buildReviewCandidatePayload({ ...report, sourceReport: inputPath })

  mkdirSync(path.dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`)

  console.log(`[review-candidates] ${outputPath}`)
  console.log(`[summary] ${JSON.stringify(payload.summary)}`)
}

main()
