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
  'scripts/verify-draft-pagination-cache-trigger.mjs',
  'scripts/verify-c8-print-ready-gate.mjs',
  'scripts/verify-print-form.mjs',
  'scripts/verify-print-renderer.mjs',
  'scripts/verify-figure-render.mjs',
  'scripts/verify-architecture-housekeeping.mjs',
  'scripts/verify-motion-tokens.mjs',
  'scripts/verify-h1-router-skeleton.mjs',
  'scripts/verify-h1d-analysis-availability.mjs',
  'scripts/verify-i0e-seven-choices-entry.mjs',
  'scripts/verify-h1e-export-routes.mjs',
  'scripts/verify-h5a-export-implementation.mjs',
  'scripts/verify-h5c-json-extraction.mjs',
  'scripts/verify-h5d-completion-runner.mjs',
  'scripts/verify-h5e-verify-question-group.mjs',
  'scripts/verify-h5j-reading-difficulty.mjs',
  'scripts/verify-h5h-semantic-search.mjs',
  'scripts/verify-h5i-steward-service.mjs',
  'scripts/verify-h5k-synonym-difficulty.mjs',
  'scripts/verify-h5l-question-group-parse.mjs',
  'scripts/verify-h5g-docx-renderer.mjs',
  'scripts/verify-h1g-question-group-routes.mjs',
  'scripts/verify-h10a-paper-set-routes.mjs',
  'scripts/verify-h10b-ai-proxy-routes.mjs',
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
  'scripts/verify-i13-grammar-fill-analysis.mjs',
  'scripts/verify-i14-grammar-fill-analysis-surface.mjs',
  'scripts/verify-i15-grammar-fill-blank-focus.mjs',
  'scripts/verify-i16a-teaching-dimension-search.mjs',
  'scripts/verify-i16b-theme-labels-backfill.mjs',
  'scripts/verify-i16c-grammar-verb-axes.mjs',
  'scripts/verify-similar-questions.mjs',
  'scripts/verify-search-thinking-toggle.mjs',
  'scripts/verify-h11a-http-client.mjs',
  'scripts/verify-h12a-entry-modal.mjs',
  'scripts/verify-restart1-local-search-intent.mjs',
  'scripts/verify-restart3-teacher-analysis.mjs',
  'scripts/verify-home-default-feed.mjs',
  'scripts/verify-concierge-filters.mjs',
  'scripts/verify-error-copy-mainline.mjs',
  'scripts/verify-ai-server-key-fallback.mjs',
  'scripts/verify-auth-gate.mjs',
  'scripts/verify-owner-gate.mjs',
  'scripts/verify-user-scope.mjs',
  'scripts/verify-ai-daily-limit.mjs',
  'scripts/verify-classic-retire-2.mjs',
  'scripts/verify-classic-retire-3.mjs',
  'scripts/verify-analysis-layering.mjs',
  'scripts/verify-launch-deploy.mjs',
  'scripts/verify-paper-assets-consistency.mjs',
  'scripts/verify-paper-browse.mjs',
  'scripts/verify-list-groups-perf.mjs',
  'scripts/verify-add-to-draft-feel.mjs',
  'scripts/verify-section-chrome-on-solo-surface.mjs',
  'scripts/verify-draft-workbench-visual-unify.mjs',
  'scripts/verify-my-space-shelf.mjs',
  'scripts/verify-draft-student-field.mjs',
  'scripts/verify-genre-truth.mjs',
  'scripts/verify-draft-paper-docx.mjs',
  ],
}

if (process.argv.includes('--list-json')) {
  console.log(JSON.stringify(registry, null, 2))
  process.exit(0)
}

// A verify script exits with this code to signal "skipped" (its off-repo
// fixture is absent, e.g. on a clean CI checkout). Skipped != passed: it is
// counted and listed separately so a missing-data gap stays visible.
const SKIP_EXIT_CODE = 2

function run(command, args, label, options = {}) {
  console.log(`\n==> ${label}`)
  const result = spawnSync(command, args, {
    cwd: options.cwd || rootDir,
    stdio: 'inherit',
    shell: false,
  })
  return result.status ?? 1
}

// Preflight stays hard-fail: a broken build makes the script results meaningless.
for (const step of registry.preflight) {
  const status = run(step.command, step.args, step.label)
  if (status !== 0) {
    console.error(`\nPreflight failed: ${step.label} (exit ${status})`)
    process.exit(status)
  }
}

// Scripts run in collect mode: run every script, never exit early, so one
// failure cannot hide the status of the scripts after it.
const results = []
for (const script of registry.scripts) {
  const status = run(process.execPath, [script], script)
  results.push({ script, status })
}

const passed = results.filter((r) => r.status === 0)
const skipped = results.filter((r) => r.status === SKIP_EXIT_CODE)
const failed = results.filter((r) => r.status !== 0 && r.status !== SKIP_EXIT_CODE)

console.log('\n===== verify summary =====')
console.log(`PASS ${passed.length} / SKIP ${skipped.length} / FAIL ${failed.length}`)
if (skipped.length > 0) {
  console.log('SKIPPED (off-repo fixture absent — not actually tested):')
  for (const r of skipped) console.log(`  - ${r.script}`)
}
if (failed.length > 0) {
  console.log('FAILED:')
  for (const r of failed) console.log(`  - ${r.script} (exit ${r.status})`)
}

process.exit(failed.length > 0 ? 1 : 0)
