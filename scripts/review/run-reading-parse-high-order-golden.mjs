#!/usr/bin/env node
import { spawnSync } from 'node:child_process'

const args = [
  'scripts/review/run-reading-parse-golden-check.mjs',
  '--golden',
  'knowledge/reading-parse/golden-high-order-reading-cases.jsonl',
  '--verbose',
  ...process.argv.slice(2),
]

const result = spawnSync(process.execPath, args, { stdio: 'inherit' })
process.exit(result.status ?? 1)
