#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

const registry = {
  preflight: [
    { command: 'git', args: ['diff', '--check'], label: 'git diff --check' },
    { command: 'npm', args: ['run', 'build', '--prefix', 'app'], label: 'app build/typecheck' },
  ],
  scripts: [
  'scripts/verify-paper-asset-v1.mjs',
  'scripts/verify-paper-surface-mjs-declaration-parity.mjs',
  'scripts/verify-c7-paper-import-contracts.mjs',
  'scripts/verify-c7-paper-import-publish.mjs',
  'scripts/verify-paper-draft.mjs',
  'scripts/verify-basket-persistence.mjs',
  'scripts/verify-concierge-desk.mjs',
  'scripts/verify-c8-draft-paper-contracts.mjs',
  'scripts/verify-c8-draft-paper-render-model.mjs',
  'scripts/verify-c8-print-ready-gate.mjs',
  'scripts/verify-architecture-housekeeping.mjs',
  'scripts/verify-h1-router-skeleton.mjs',
  'scripts/verify-h1c-paper-import-routes.mjs',
  'scripts/verify-h1d-analysis-availability.mjs',
  'scripts/verify-i0e-seven-choices-entry.mjs',
  'scripts/verify-h1e-export-routes.mjs',
  'scripts/verify-h5a-export-implementation.mjs',
  'scripts/verify-h1f-legacy-import-routes.mjs',
  'scripts/verify-h1g-question-group-routes.mjs',
  'scripts/verify-i1-paper-import-route.mjs',
  'scripts/verify-i1-paper-import-analysis.mjs',
  'scripts/verify-i2-seven-choices-ai-import.mjs',
  'scripts/verify-i3-cloze-ai-import.mjs',
  'scripts/verify-i4-grammar-fill-ai-import.mjs',
  'scripts/verify-i5-writing-ai-import.mjs',
  'scripts/verify-i6-writing-render.mjs',
  'scripts/verify-i7-application-given.mjs',
  'scripts/verify-i8-cloze-analysis.mjs',
  'scripts/verify-i9-cloze-analysis-surface.mjs',
  'scripts/verify-i10-blank-rendering.mjs',
  'scripts/verify-relay-json-format.mjs',
  'scripts/verify-i11-symbol-normalization.mjs',
  ],
}

if (process.argv.includes('--list-json')) {
  console.log(JSON.stringify(registry, null, 2))
  process.exit(0)
}

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

for (const step of registry.preflight) {
  run(step.command, step.args, step.label)
}

for (const script of registry.scripts) {
  run(process.execPath, [script], script)
}

console.log('\nCI verify passed')
