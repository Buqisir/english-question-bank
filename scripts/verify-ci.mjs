#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

const scripts = [
  'scripts/verify-paper-asset-v1.mjs',
  'scripts/verify-paper-surface-mjs-declaration-parity.mjs',
  'scripts/verify-c7-paper-import-contracts.mjs',
  'scripts/verify-c7-paper-import-publish.mjs',
  'scripts/verify-paper-draft.mjs',
  'scripts/verify-basket-persistence.mjs',
  'scripts/verify-concierge-desk.mjs',
  'scripts/verify-c8-draft-paper-render-model.mjs',
  'scripts/verify-c8-print-ready-gate.mjs',
  'scripts/verify-architecture-housekeeping.mjs',
]

function run(command, args, label, options = {}) {
  console.log(`\n==> ${label}`)
  const result = spawnSync(command, args, {
    cwd: options.cwd || rootDir,
    stdio: 'inherit',
    shell: false,
  })
  if (result.status !== 0) {
    process.exit(result.status || 1)
  }
}

run('git', ['diff', '--check'], 'git diff --check')

for (const script of scripts) {
  run(process.execPath, [script], script)
}

console.log('\nCI verify passed')
