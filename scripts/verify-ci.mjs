#!/usr/bin/env node
import { setMaxListeners } from 'node:events'
import {
  closeSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeSync,
} from 'node:fs'
import { availableParallelism, tmpdir } from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'
import {
  changedFiles,
  touchesAny,
} from './lib/verifyScope.mjs'
import {
  runVerificationCommand,
} from './lib/verificationCommandRunner.mjs'
import {
  createOrderedResultFlusher,
  runVerificationSchedule,
  verificationSchedulingPolicy,
} from './lib/verificationScheduler.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

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
  'scripts/verify-import-pagination-qa.mjs',
  'scripts/verify-import-pagination-ui.mjs',
  'scripts/verify-universal-nck1-publish.mjs',
  'scripts/verify-listening-audio-intake.mjs',
  'scripts/verify-listening-audio-serving.mjs',
  'scripts/verify-nck1-docx-materialization-producer.mjs',
  'scripts/verify-nck1-pdf-materialization-producer.mjs',
  'scripts/verify-nck1-answer-source-shapes.mjs',
  'scripts/verify-nck1-reading-figure-options.mjs',
  'scripts/verify-nck1-ocr-source-evidence.mjs',
  'scripts/verify-universal-nck1-image-source-bundle.mjs',
  'scripts/verify-universal-nck1-source-only-intake.mjs',
  'scripts/verify-universal-nck1-source-only-boundaries.mjs',
  'scripts/verify-import-review-ocr-confirmation.mjs',
  'scripts/verify-import-environment-preflight.mjs',
  'scripts/verify-nck1-source-materialization.mjs',
  'scripts/verify-nck1-pdf-crop-recipe-replay.mjs',
  'scripts/verify-paper-canonical-nck1-materialization-candidate.mjs',
  'scripts/verify-import-paper-routing.mjs',
  'scripts/verify-production-canonical-publication-backfill.mjs',
  'scripts/verify-paper-canonical-import-pilot-fixes.mjs',
  'scripts/verify-paper-canonical-docx-source-adapter.mjs',
  'scripts/verify-paper-canonical-trusted-docx-request.mjs',
  'scripts/verify-paper-canonical-docx-pair-request.mjs',
  'scripts/verify-paper-canonical-legacy-source-capture-adapter.mjs',
  'scripts/verify-paper-canonical-legacy-opaque-application.mjs',
  'scripts/verify-paper-canonical-legacy-opaque-continuation.mjs',
  'scripts/verify-paper-canonical-legacy-opaque-writing-rendered-behavior.mjs',
  'scripts/verify-paper-canonical-cloze-grammar-publication.mjs',
  'scripts/verify-paper-canonical-seven-choices-publication.mjs',
  'scripts/verify-paper-canonical-reading-publication.mjs',
  'scripts/verify-paper-canonical-framed-columns.mjs',
  'scripts/verify-paper-canonical-framed-columns-rendered.mjs',
  'scripts/verify-paper-canonical-application-writing-publication.mjs',
  'scripts/verify-paper-canonical-continuation-writing-publication.mjs',
  'scripts/verify-paper-canonical-listening-inactive-closure.mjs',
  'scripts/verify-paper-canonical-listening-zero-occurrence.mjs',
  'scripts/verify-paper-canonical-listening-first-section-playback-slot-gating.mjs',
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
  'scripts/verify-source-intake.mjs',
  'scripts/verify-source-intake-frontend.mjs',
  'scripts/verify-source-intake-webhook.mjs',
  'scripts/verify-nck1-analysis-agent-plugin.mjs',
  'scripts/verify-ship-check-watcher.mjs',
  'scripts/verify-amp-orb-ci.mjs',
  'scripts/verify-amp-orb-deploy.mjs',
  'scripts/verify-import-review-source-pairing.mjs',
  'scripts/verify-import-review-media-derivation.mjs',
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
  'scripts/verify-print-pdf-error-classification.mjs',
  'scripts/verify-c8-print-ready-gate.mjs',
  'scripts/verify-print-form.mjs',
  'scripts/verify-print-renderer.mjs',
  'scripts/verify-companion-analysis-export.mjs',
  'scripts/verify-figure-render.mjs',
  'scripts/verify-verification-command-runner.mjs',
  'scripts/verify-verification-scheduler.mjs',
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
  'scripts/verify-teaching-analysis-style.mjs',
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
  'scripts/verify-import-pagination-qa.mjs',
  'scripts/verify-paper-canonical-import-pilot-fixes.mjs',
]
const securityScripts = [
  'scripts/verify-ai-server-key-fallback.mjs',
  'scripts/verify-auth-gate.mjs',
  'scripts/verify-source-intake.mjs',
  'scripts/verify-source-intake-webhook.mjs',
  'scripts/verify-amp-orb-ci.mjs',
  'scripts/verify-amp-orb-deploy.mjs',
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
  [
    ...registry.scripts.filter((script) => paperScriptPattern.test(script)),
    'scripts/verify-nck1-pdf-crop-recipe-replay.mjs',
    'scripts/verify-universal-nck1-publish.mjs',
    'scripts/verify-listening-audio-intake.mjs',
    'scripts/verify-listening-audio-serving.mjs',
    'scripts/verify-universal-nck1-image-source-bundle.mjs',
    'scripts/verify-universal-nck1-source-only-intake.mjs',
    'scripts/verify-universal-nck1-source-only-boundaries.mjs',
    'scripts/verify-import-review-ocr-confirmation.mjs',
    'scripts/verify-import-review-source-pairing.mjs',
    'scripts/verify-import-review-media-derivation.mjs',
  ],
)
const featureScripts = uniqueRegistered(registry.scripts.filter(
  (script) => !paperScripts.includes(script) && !securityScripts.includes(script),
))
const importPaperScripts = uniqueRegistered([
  'scripts/verify-import-pagination-qa.mjs',
  'scripts/verify-import-pagination-ui.mjs',
  'scripts/verify-nck1-docx-materialization-producer.mjs',
  'scripts/verify-nck1-pdf-materialization-producer.mjs',
  'scripts/verify-nck1-answer-source-shapes.mjs',
  'scripts/verify-nck1-ocr-source-evidence.mjs',
  'scripts/verify-universal-nck1-image-source-bundle.mjs',
  'scripts/verify-universal-nck1-source-only-intake.mjs',
  'scripts/verify-universal-nck1-source-only-boundaries.mjs',
  'scripts/verify-import-review-ocr-confirmation.mjs',
  'scripts/verify-import-environment-preflight.mjs',
  'scripts/verify-nck1-source-materialization.mjs',
  'scripts/verify-nck1-pdf-crop-recipe-replay.mjs',
  'scripts/verify-paper-canonical-docx-source-adapter.mjs',
  'scripts/verify-paper-canonical-nck1-materialization-candidate.mjs',
  'scripts/verify-paper-canonical-import-admission.mjs',
  'scripts/verify-paper-canonical-registered-confirmation-admission.mjs',
  'scripts/verify-paper-canonical-publication.mjs',
  'scripts/verify-paper-canonical-import-recovery.mjs',
  'scripts/verify-paper-canonical-listening-first-section-playback-slot-gating.mjs',
  'scripts/verify-universal-nck1-publish.mjs',
  'scripts/verify-import-review-source-pairing.mjs',
  'scripts/verify-import-review-media-derivation.mjs',
  'scripts/verify-paper-canonical-detail-screen-consumption.mjs',
  'scripts/verify-print-renderer.mjs',
  'scripts/verify-figure-render.mjs',
  'scripts/verify-import-paper-routing.mjs',
])
const packs = Object.freeze({
  ui: uniqueRegistered(uiScripts),
  'paper-data': uniqueRegistered(paperDataScripts),
  'import-paper': importPaperScripts,
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

function verificationConcurrency() {
  const raw = argumentValues('--jobs').at(-1) || process.env.VERIFY_CONCURRENCY
  if (raw === undefined) {
    return Math.min(8, Math.max(1, Math.ceil(availableParallelism() / 2)))
  }
  if (!/^\d+$/u.test(raw)) throw new Error(`Invalid verify concurrency: ${raw}`)
  const concurrency = Number(raw)
  if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 64) {
    throw new Error(`Invalid verify concurrency: ${raw}`)
  }
  return concurrency
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
    '.agents/setup',
    '.amp/plugins/github-ci-wakeup.js',
    '.amp/plugins/source-intake-wakeup.js',
    'data/sql/',
    'deploy/',
    'scripts/amp-orb-ci-sandbox.mjs',
    'scripts/amp-orb-ci.mjs',
    'scripts/amp-orb-deploy.mjs',
    'scripts/lib/ampOrbCI.mjs',
    'scripts/lib/ampOrbDeploy.mjs',
    'scripts/lib/tencentTat.mjs',
    'scripts/verify-amp-orb-ci.mjs',
    'scripts/verify-amp-orb-deploy.mjs',
    'server/auth/',
    'server/import-ops/',
    'server/source-intake/',
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
    if (/^scripts\/import-pipeline\/papers\/[^/]+\//u.test(file)) {
      return ['import-paper']
    }
    if ([
      'scripts/import-pipeline/universal-nck1.mjs',
      'scripts/import-pipeline/nck1-source-only.mjs',
      'scripts/import-pipeline/nck1-docx-materialize.mjs',
      'scripts/import-pipeline/import-environment-preflight.mjs',
      'server/paper-import/nck1DocxMaterializationProducer.mjs',
      'server/paper-import/nck1PdfMaterializationProducer.mjs',
      'server/paper-import/nck1PdfTextSourceAdapter.mjs',
      'server/paper-import/nck1OcrMaterializationProducer.mjs',
      'server/paper-import/nck1OcrSourceEvidence.mjs',
      'server/paper-import/nck1ImageSourceBundle.mjs',
    ].includes(file)) return ['unknown']
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
  if (domains.has('import-paper') && domains.size > 1) {
    return { risk: 'mixed-high-risk-fallback', pack: 'all' }
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
  if (domains.has('import-paper')) {
    return { risk: 'single-paper-import', pack: 'import-paper' }
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
let concurrency
try {
  plan = verificationPlan()
  concurrency = verificationConcurrency()
} catch (error) {
  console.error(error.message)
  process.exit(1)
}

if (process.argv.includes('--list-json')) {
  console.log(JSON.stringify({
    ...registry,
    packs,
    scheduling: {
      availableParallelism: availableParallelism(),
      concurrency,
      resources: ['browser-render', 'port:<number>'],
    },
  }, null, 2))
  process.exit(0)
}

if (process.argv.includes('--plan-json')) {
  console.log(JSON.stringify({ ...plan, concurrency }, null, 2))
  process.exit(0)
}

// A verify script exits with this code to signal "skipped" (its off-repo
// fixture is absent, e.g. on a clean CI checkout). Skipped != passed: it is
// counted and listed separately so a missing-data gap stays visible.
const SKIP_EXIT_CODE = 2
const suiteStartedAt = performance.now()
const abortController = new AbortController()
setMaxListeners(concurrency + 2, abortController.signal)
let interruptedSignal = null
const interrupt = (signal) => {
  if (interruptedSignal) return
  interruptedSignal = signal
  abortController.abort(signal)
}
const onSigint = () => interrupt('SIGINT')
const onSigterm = () => interrupt('SIGTERM')
process.once('SIGINT', onSigint)
process.once('SIGTERM', onSigterm)

async function run(command, args, label, options = {}) {
  console.log(`\n==> ${label}`)
  return runVerificationCommand(command, args, {
    abortSignal: abortController.signal,
    cwd: options.cwd || rootDir,
  })
}

// Preflight stays hard-fail: a broken build makes the script results meaningless.
for (const step of plan.preflight) {
  const status = await run(step.command, step.args, step.label)
  if (status !== 0) {
    console.error(`\nPreflight failed: ${step.label} (exit ${status})`)
    process.exit(status)
  }
}

// Scripts run in collect mode: run every script, never exit early, so one
// failure cannot hide the status of the scripts after it.
const scheduledScripts = plan.scripts.map((script) => verificationSchedulingPolicy(
  script,
  readFileSync(path.join(rootDir, script), 'utf8'),
))
const renderScriptCount = scheduledScripts.filter(
  (script) => script.resourceKeys.includes('browser-render'),
).length
const fixedPortScriptCount = scheduledScripts.filter(
  (script) => script.resourceKeys.some((resource) => resource.startsWith('port:')),
).length
const exclusiveScriptCount = scheduledScripts.filter((script) => script.exclusive).length
console.log(
  `\nVERIFY SCHEDULER jobs=${concurrency} cores=${availableParallelism()} scripts=${scheduledScripts.length}`
    + ` render-lane=${renderScriptCount} fixed-port=${fixedPortScriptCount}`
    + ` exclusive=${exclusiveScriptCount}`,
)

const logRoot = mkdtempSync(path.join(tmpdir(), 'eqb-verify-ci-'))
const flushResult = createOrderedResultFlusher((_index, result) => {
  console.log(`\n==> ${result.script}`)
  const output = readFileSync(result.logPath)
  if (output.length > 0) {
    process.stdout.write(output)
    if (output.at(-1) !== 10) process.stdout.write('\n')
  }
  rmSync(result.logPath, { force: true })
})
let results = []
let scheduleFailure = null
try {
  results = await runVerificationSchedule(scheduledScripts, {
    concurrency,
    signal: abortController.signal,
    async run(item, index) {
      const logPath = path.join(logRoot, `${String(index).padStart(3, '0')}.log`)
      const logFd = openSync(logPath, 'wx', 0o600)
      let status
      try {
        const writeLog = (chunk) => writeSync(logFd, chunk)
        status = await runVerificationCommand(process.execPath, [item.script], {
          abortSignal: abortController.signal,
          cwd: rootDir,
          stdout: writeLog,
          stderr: writeLog,
        })
      } finally {
        closeSync(logFd)
      }
      return { script: item.script, status, logPath }
    },
    onSettled: flushResult,
  })
} catch (error) {
  scheduleFailure = error
} finally {
  rmSync(logRoot, { force: true, recursive: true })
}
if (scheduleFailure) {
  if (interruptedSignal) {
    process.exit(interruptedSignal === 'SIGINT' ? 130 : 143)
  }
  console.error(`\nVerification scheduler failed: ${scheduleFailure.message}`)
  process.exit(1)
}

const passed = results.filter((r) => r.status === 0)
const skipped = results.filter((r) => r.status === SKIP_EXIT_CODE)
const failed = results.filter((r) => r.status !== 0 && r.status !== SKIP_EXIT_CODE)

console.log('\n===== verify summary =====')
console.log(`MODE ${plan.mode} / RISK ${plan.risk} / PACK ${plan.pack}`)
console.log(
  `JOBS ${concurrency} / CORES ${availableParallelism()}`
    + ` / WALL ${((performance.now() - suiteStartedAt) / 1_000).toFixed(1)}s`,
)
console.log(`PASS ${passed.length} / SKIP ${skipped.length} / FAIL ${failed.length}`)
if (skipped.length > 0) {
  console.log('SKIPPED (declared limitation — not actually tested):')
  for (const r of skipped) console.log(`  - ${r.script}`)
}
if (failed.length > 0) {
  console.log('FAILED:')
  for (const r of failed) console.log(`  - ${r.script} (exit ${r.status})`)
}

process.removeListener('SIGINT', onSigint)
process.removeListener('SIGTERM', onSigterm)
process.exit(failed.length > 0 ? 1 : 0)
