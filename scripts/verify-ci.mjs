#!/usr/bin/env node
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  changedFiles,
  touchesAny,
} from './lib/verifyScope.mjs'
import {
  assertCanonicalImportPilotEvidenceRoot,
  assertCanonicalImportPilotTransientEvidenceRunsClean,
  inspectOfficialCanonicalImportPilotEvidenceRoot,
} from './lib/canonicalImportPilotEvidenceRoot.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const expectedHead = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: rootDir,
  encoding: 'utf8',
}).trim()
const officialEvidenceBefore = inspectOfficialCanonicalImportPilotEvidenceRoot({
  repositoryRoot: rootDir,
  expectedHead,
})

const registry = {
  preflight: [
    { command: 'git', args: ['diff', '--check'], label: 'git diff --check' },
    { command: 'npm', args: ['run', 'build', '--prefix', 'app'], label: 'app build/typecheck' },
  ],
  scripts: [
  'scripts/verify-paper-asset-v1.mjs',
  'scripts/verify-paper-canonical-foundation.mjs',
  'scripts/verify-paper-canonical-publication.mjs',
  'scripts/verify-paper-canonical-import-admission.mjs',
  'scripts/verify-paper-canonical-registered-confirmation-admission.mjs',
  'scripts/verify-paper-canonical-import-recovery.mjs',
  'scripts/verify-production-canonical-publication-backfill.mjs',
  'scripts/verify-paper-canonical-import-pilot-fixes.mjs',
  'scripts/verify-paper-canonical-docx-source-adapter.mjs',
  'scripts/verify-paper-canonical-visual-candidate.mjs',
  'scripts/verify-format2-import-job.mjs',
  'scripts/verify-paper-canonical-trusted-docx-request.mjs',
  'scripts/verify-paper-canonical-docx-pair-request.mjs',
  'scripts/verify-paper-canonical-legacy-source-capture-adapter.mjs',
  'scripts/verify-paper-canonical-legacy-opaque-application.mjs',
  'scripts/verify-paper-canonical-legacy-opaque-continuation.mjs',
  'scripts/verify-paper-canonical-legacy-opaque-writing-rendered-behavior.mjs',
  'scripts/verify-paper-canonical-import-pilot-qa-server.mjs',
  'scripts/verify-paper-canonical-cloze-grammar-publication.mjs',
  'scripts/verify-paper-canonical-seven-choices-publication.mjs',
  'scripts/verify-paper-canonical-reading-publication.mjs',
  'scripts/verify-paper-canonical-reading-option-figure.mjs',
  'scripts/verify-paper-canonical-reading-option-figure-rendered-behavior.mjs',
  'scripts/verify-paper-mock-sz-2026-m1-q33-option-figure-canary.mjs',
  'scripts/verify-paper-canonical-framed-columns.mjs',
  'scripts/verify-paper-canonical-framed-columns-rendered.mjs',
  'scripts/verify-paper-canonical-application-writing-publication.mjs',
  'scripts/verify-paper-canonical-continuation-writing-publication.mjs',
  'scripts/verify-paper-canonical-listening-inactive-closure.mjs',
  'scripts/verify-paper-canonical-listening-zero-occurrence.mjs',
  'scripts/verify-paper-canonical-continuation-writing-rendered-behavior.mjs',
  'scripts/verify-paper-canonical-seven-choices-rendered-behavior.mjs',
  'scripts/verify-paper-canonical-reading-rendered-behavior.mjs',
  'scripts/verify-paper-canonical-application-writing-rendered-behavior.mjs',
  'scripts/verify-paper-canonical-cloze-grammar-consumption.mjs',
  'scripts/verify-paper-canonical-abcd-layout.mjs',
  'scripts/verify-paper-normalization-cloze.mjs',
  'scripts/verify-paper-normalization-grammar-fill.mjs',
  'scripts/verify-paper-normalization-cloze-surface.mjs',
  'scripts/verify-paper-normalization-cloze-analysis.mjs',
  'scripts/verify-paper-normalization-grammar-fill-surface.mjs',
  'scripts/verify-paper-normalization-import-gate.mjs',
  'scripts/import-pipeline/verify-source-doc-types.mjs',
  'scripts/verify-import-ops.mjs',
  'scripts/verify-docx-source-media-input.mjs',
  'scripts/verify-canonical-paper-group-surface-adapter-declaration-parity.mjs',
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
  'scripts/verify-lecture-panel-css.mjs',
  'scripts/verify-radius-family.mjs',
  'scripts/verify-no-ui-emoji.mjs',
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
  'scripts/verify-h1g-question-group-routes.mjs',
  'scripts/verify-h10a-paper-set-routes.mjs',
  'scripts/verify-h10b-ai-proxy-routes.mjs',
  'scripts/verify-i1-paper-import-analysis.mjs',
  'scripts/verify-i2-seven-choices-ai-import.mjs',
  'scripts/verify-i3-cloze-ai-import.mjs',
  'scripts/verify-i4-grammar-fill-ai-import.mjs',
  'scripts/verify-i5-writing-ai-import.mjs',
  'scripts/verify-application-model-answer-prompt.mjs',
  'scripts/verify-continuation-analysis-v1.mjs',
  'scripts/verify-nck1-new-paper-locks.mjs',
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
  'scripts/verify-grammar-facets-v2.mjs',
  'scripts/verify-similar-v2.mjs',
  'scripts/verify-similar-workbench-swap.mjs',
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
  'scripts/verify-generated-docx-disconnected.mjs',
  'scripts/verify-generated-docx-output-deleted.mjs',
  'scripts/verify-file-save-as.mjs',
  'scripts/verify-detail-redesign.mjs',
  'scripts/verify-vocabulary-closed-loop.mjs',
  'scripts/verify-vocabulary-dictation-review.mjs',
  'scripts/verify-vocabulary-meaning-recall.mjs',
  'scripts/verify-gaokao-vocabulary-source.mjs',
  'scripts/verify-gaokao-vocabulary-golden-content.mjs',
  'scripts/verify-gaokao-vocabulary-golden-visuals.mjs',
  'scripts/verify-gaokao-vocabulary-golden-audio.mjs',
  'scripts/verify-gaokao-vocabulary-full-audio.mjs',
  'scripts/verify-gaokao-vocabulary-full-audio-qa.mjs',
  'scripts/verify-gaokao-vocabulary-golden-import.mjs',
  'scripts/verify-vocabulary-migration.mjs',
  'scripts/verify-vocabulary-match-game.mjs',
  'scripts/verify-vocabulary-rendered-behavior.mjs',
  'scripts/verify-paper-canonical-detail-screen-consumption.mjs',
  'scripts/verify-reading-analysis-retire.mjs',
  'scripts/verify-r2-trap-audit.mjs',
  ],
}

const uiScripts = [
  'scripts/verify-architecture-housekeeping.mjs',
  'scripts/verify-motion-tokens.mjs',
  'scripts/verify-lecture-panel-css.mjs',
  'scripts/verify-radius-family.mjs',
  'scripts/verify-no-ui-emoji.mjs',
]
const paperDataScripts = [
  'scripts/verify-paper-asset-v1.mjs',
  'scripts/verify-paper-canonical-foundation.mjs',
  'scripts/verify-paper-canonical-publication.mjs',
  'scripts/verify-paper-canonical-import-admission.mjs',
  'scripts/verify-paper-canonical-registered-confirmation-admission.mjs',
  'scripts/verify-paper-canonical-import-recovery.mjs',
  'scripts/verify-paper-canonical-import-pilot-fixes.mjs',
]
const securityScripts = [
  'scripts/verify-ai-server-key-fallback.mjs',
  'scripts/verify-auth-gate.mjs',
  'scripts/verify-owner-gate.mjs',
  'scripts/verify-user-scope.mjs',
  'scripts/verify-ai-daily-limit.mjs',
  'scripts/verify-launch-deploy.mjs',
]
const paperScriptPattern = /(?:paper|canonical|print|draft|export|docx|figure|cloze|grammar|seven-choices|writing|genre)/u
const uniqueRegistered = (scripts) => [...new Set(scripts)].filter(
  (script) => registry.scripts.includes(script),
)
const paperScripts = uniqueRegistered(
  registry.scripts.filter((script) => paperScriptPattern.test(script)),
)
const featureScripts = uniqueRegistered(registry.scripts.filter(
  (script) => !paperScripts.includes(script) && !securityScripts.includes(script),
))
const packs = Object.freeze({
  ui: uniqueRegistered(uiScripts),
  'paper-data': uniqueRegistered(paperDataScripts),
  feature: featureScripts,
  paper: paperScripts,
  security: uniqueRegistered(securityScripts),
  all: [...registry.scripts],
})

function argumentValues(flag) {
  const values = []
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === flag && process.argv[index + 1]) {
      values.push(process.argv[index + 1])
    }
  }
  return values
}

function changedPlan(files) {
  if (files.length === 0) {
    return { risk: 'no-changes', pack: 'ui', scripts: [] }
  }
  const paperDataPatterns = [
    'app/public/paper-assets/',
    'test-fixtures/paper-canonical/publications/',
    'test-fixtures/paper-import/',
  ]
  const paperPatterns = [
    'shared/paper-canonical/',
    'shared/paper-normalization/',
    'shared/papersurface/',
    'server/paper-canonical/',
    'server/paper-import/format2ImportJob.mjs',
    'schemas/paper-import/format2-transcription-v1.schema.json',
    'server/print-renderer.mjs',
    'server/vocabulary/vocabularyPdfRenderer.mjs',
    'server/draft-paper/',
    'app/src/shared-ui/papersurface/',
    'app/src/features/draft-paper/DraftPaperWorkbench.css',
    'app/src/features/paper-browse/',
    'app/src/features/paper-intelligence/',
    'standards/paper-canonical/',
  ]
  const uiMicroPatterns = [
    'app/src/shared-ui/tokens.css',
  ]
  const securityPatterns = [
    'data/sql/',
    'server/auth/',
    'server/user-data/',
    'server/ai-daily-limit.mjs',
    'server/vocabulary/vocabularyStore.mjs',
    'server/vocabulary/vocabularyRoutes.mjs',
    'server/vocabulary/vocabularyPrintJobs.mjs',
  ]
  if (files.every((file) => touchesAny([file], paperDataPatterns))) {
    return { risk: 'known-shape-paper-data', pack: 'paper-data' }
  }

  const domains = new Set(files.flatMap((file) => {
    if (file.endsWith('.md')) return []
    if (file === 'server/api.mjs') return ['unknown']
    if (file.startsWith('import-ops/')) return ['feature']
    if (file.startsWith('scripts/import-pipeline/')) {
      return [/\/verify-/.test(file) ? 'paper' : 'feature']
    }
    if (touchesAny([file], securityPatterns)) return ['security']
    if (touchesAny([file], paperPatterns)) return ['paper']
    if (touchesAny([file], paperDataPatterns)) return ['paper-data']
    if (touchesAny([file], uiMicroPatterns)) return ['ui']
    if ([
      'app/src/',
      'server/',
      'shared/',
    ].some((prefix) => file.startsWith(prefix))) return ['feature']
    return ['unknown']
  }))
  if (domains.size === 0) {
    return { risk: 'no-changes', pack: 'ui', scripts: [] }
  }

  if (domains.has('unknown')) {
    return { risk: 'unknown-fallback', pack: 'all' }
  }
  if (domains.has('paper-data')) {
    return { risk: 'mixed-high-risk-fallback', pack: 'all' }
  }
  if (domains.has('security') && domains.size > 1) {
    return { risk: 'mixed-high-risk-fallback', pack: 'all' }
  }
  if (domains.has('paper') && domains.size > 1) {
    return { risk: 'mixed-high-risk-fallback', pack: 'all' }
  }
  if (domains.has('security')) {
    return { risk: 'auth-persistence-migration', pack: 'security' }
  }
  if (domains.has('paper')) {
    return { risk: 'shared-renderer-contract', pack: 'paper' }
  }
  if (domains.has('feature')) {
    return { risk: 'ordinary-local-feature', pack: 'feature' }
  }
  return { risk: 'ui-micro', pack: 'ui' }
}

function verificationPlan() {
  const explicitPack = argumentValues('--pack').at(-1)
  const explicitFiles = argumentValues('--changed-file')
  if (explicitPack) {
    if (!Object.hasOwn(packs, explicitPack)) {
      throw new Error(`Unknown verify pack: ${explicitPack}`)
    }
    return {
      mode: explicitPack,
      risk: explicitPack === 'paper' ? 'shared-renderer-contract' : explicitPack,
      files: [],
      pack: explicitPack,
      preflight: registry.preflight,
      scripts: packs[explicitPack],
    }
  }
  if (process.argv.includes('--changed') || explicitFiles.length > 0) {
    const baseRef = argumentValues('--base-ref').at(-1) || 'main'
    if (!/^[A-Za-z0-9_./-]+$/u.test(baseRef)) {
      throw new Error(`Invalid verify base ref: ${baseRef}`)
    }
    let files
    let detectionError = null
    if (explicitFiles.length > 0) {
      files = [...new Set(explicitFiles)].sort()
    } else {
      try {
        files = changedFiles(rootDir, { baseRef })
      } catch (error) {
        files = []
        detectionError = error instanceof Error ? error.message : String(error)
      }
    }
    if (detectionError) {
      return {
        mode: 'changed',
        risk: 'git-diff-fallback',
        files: [],
        pack: 'all',
        detectionError,
        preflight: registry.preflight,
        scripts: packs.all,
      }
    }
    const selected = changedPlan(files)
    return {
      mode: 'changed',
      risk: selected.risk,
      files,
      pack: selected.pack,
      preflight: selected.pack === 'paper-data'
        ? registry.preflight.filter((step) => step.label === 'git diff --check')
        : registry.preflight,
      scripts: selected.scripts ?? packs[selected.pack],
    }
  }
  return {
    mode: 'all',
    risk: 'release-or-fallback',
    files: [],
    pack: 'all',
    preflight: registry.preflight,
    scripts: packs.all,
  }
}

let plan
try {
  plan = verificationPlan()
} catch (error) {
  console.error(error.message)
  process.exit(1)
}

if (process.argv.includes('--list-json')) {
  console.log(JSON.stringify({ ...registry, packs }, null, 2))
  process.exit(0)
}

if (process.argv.includes('--plan-json')) {
  console.log(JSON.stringify(plan, null, 2))
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
for (const step of plan.preflight) {
  const status = run(step.command, step.args, step.label)
  if (status !== 0) {
    console.error(`\nPreflight failed: ${step.label} (exit ${status})`)
    process.exit(status)
  }
}

// Scripts run in collect mode: run every script, never exit early, so one
// failure cannot hide the status of the scripts after it.
const results = []
for (const script of plan.scripts) {
  const status = run(process.execPath, [script], script)
  results.push({ script, status })
}

let fullSuiteEvidenceRegressionFailure = null
if (plan.scripts.some((script) => script.startsWith('scripts/verify-paper-canonical-'))) {
  try {
    if (officialEvidenceBefore) {
      const officialEvidenceAfter = assertCanonicalImportPilotEvidenceRoot({
        repositoryRoot: rootDir,
        rootDir: officialEvidenceBefore.rootDir,
        expectedHead,
      })
      assert.deepEqual(
        officialEvidenceAfter.snapshot,
        officialEvidenceBefore.snapshot,
        'verification leaves every sealed official evidence byte unchanged',
      )
    }
    assertCanonicalImportPilotTransientEvidenceRunsClean({
      repositoryRoot: rootDir,
      expectedHead,
    })
  } catch (error) {
    fullSuiteEvidenceRegressionFailure = error
  }
}

const passed = results.filter((r) => r.status === 0)
const skipped = results.filter((r) => r.status === SKIP_EXIT_CODE)
const failed = results.filter((r) => r.status !== 0 && r.status !== SKIP_EXIT_CODE)

console.log('\n===== verify summary =====')
console.log(`MODE ${plan.mode} / RISK ${plan.risk} / PACK ${plan.pack}`)
console.log(`PASS ${passed.length} / SKIP ${skipped.length} / FAIL ${failed.length}`)
if (skipped.length > 0) {
  console.log('SKIPPED (declared limitation — not actually tested):')
  for (const r of skipped) console.log(`  - ${r.script}`)
}
if (failed.length > 0) {
  console.log('FAILED:')
  for (const r of failed) console.log(`  - ${r.script} (exit ${r.status})`)
}
if (fullSuiteEvidenceRegressionFailure) {
  console.log('FAILED:')
  console.log(
    `  - sealed official evidence/full-suite regression (${fullSuiteEvidenceRegressionFailure.message})`,
  )
}

process.exit(failed.length > 0 || fullSuiteEvidenceRegressionFailure ? 1 : 0)
