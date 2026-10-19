import { createHash } from 'node:crypto'

// Balance overrides measured from main run 39213815569 at 9eb492a1.
// Registry-order replay at jobs=2 with existing locks: 435.052s / 434.170s.
// Unlisted lane paths use SHA-256 modulo 2; retired overrides are errors.
export const verificationShardOverrides = Object.freeze({
  '1': Object.freeze([
    'scripts/verify-paper-canonical-import-admission.mjs',
    'scripts/verify-student-product-pdf.mjs',
    'scripts/verify-scoped-publication.mjs',
    'scripts/verify-listening-signal.mjs',
    'scripts/verify-nck1-docx-materialization-producer.mjs',
    'scripts/verify-nck1-ocr-source-evidence.mjs',
    'scripts/verify-universal-nck1-source-only-boundaries.mjs',
    'scripts/verify-import-review-ocr-confirmation.mjs',
    'scripts/verify-import-review-target.mjs',
    'scripts/verify-nck1-source-materialization.mjs',
    'scripts/verify-nck1-writing-notice-numbering.mjs',
    'scripts/verify-nck1-pdf-crop-recipe-replay.mjs',
    'scripts/verify-paper-canonical-nck1-materialization-candidate.mjs',
    'scripts/verify-production-canonical-publication-backfill.mjs',
    'scripts/verify-paper-canonical-trusted-docx-request.mjs',
    'scripts/verify-paper-canonical-docx-pair-request.mjs',
    'scripts/verify-paper-canonical-legacy-opaque-application.mjs',
    'scripts/verify-paper-canonical-legacy-opaque-continuation.mjs',
    'scripts/verify-paper-canonical-cloze-grammar-publication.mjs',
    'scripts/verify-paper-canonical-seven-choices-publication.mjs',
    'scripts/verify-paper-canonical-reading-publication.mjs',
    'scripts/verify-paper-canonical-framed-columns.mjs',
    'scripts/verify-paper-canonical-framed-columns-rendered.mjs',
    'scripts/verify-paper-canonical-application-writing-publication.mjs',
    'scripts/verify-paper-canonical-continuation-writing-publication.mjs',
    'scripts/verify-paper-canonical-listening-inactive-closure.mjs',
    'scripts/verify-paper-canonical-abcd-layout.mjs',
    'scripts/verify-paper-normalization-cloze-surface.mjs',
    'scripts/verify-paper-normalization-cloze-analysis.mjs',
    'scripts/verify-paper-normalization-grammar-fill-surface.mjs',
    'scripts/verify-source-intake-frontend.mjs',
    'scripts/verify-ci-pr-plan.mjs',
    'scripts/verify-amp-orb-deploy.mjs',
    'scripts/verify-import-review-source-pairing.mjs',
    'scripts/verify-docx-source-media-input.mjs',
    'scripts/verify-c7-paper-import-publish.mjs',
    'scripts/verify-c8-draft-paper-render-model.mjs',
    'scripts/verify-verification-scheduler.mjs',
    'scripts/verify-i1-paper-import-analysis.mjs',
    'scripts/verify-i2-seven-choices-ai-import.mjs',
    'scripts/verify-grammar-facets-v2.mjs',
    'scripts/verify-auth-gate.mjs',
    'scripts/verify-ai-daily-limit.mjs',
    'scripts/verify-launch-deploy.mjs',
    'scripts/verify-paper-browse.mjs',
    'scripts/verify-paper-translation-routes.mjs',
    'scripts/verify-sentence-analysis-server.mjs',
    'scripts/verify-sentence-analysis-interaction.mjs',
    'scripts/verify-sentence-analysis-browser.mjs',
    'scripts/verify-vocabulary-notebook.mjs',
    'scripts/verify-generated-docx-output-deleted.mjs',
    'scripts/verify-file-save-as.mjs',
  ]),
  '2': Object.freeze([
    'scripts/verify-nck1-answer-source-shapes.mjs',
    'scripts/verify-nck1-reading-figure-options.mjs',
    'scripts/verify-paper-canonical-foundation.mjs',
    'scripts/verify-paper-canonical-import-pilot-fixes.mjs',
    'scripts/verify-print-renderer.mjs',
    'scripts/verify-published-products-storage.mjs',
    'scripts/verify-paper-asset-v1.mjs',
    'scripts/verify-paper-canonical-publication.mjs',
    'scripts/verify-paper-canonical-registered-confirmation-admission.mjs',
    'scripts/verify-paper-canonical-import-recovery.mjs',
    'scripts/verify-import-pagination-qa.mjs',
    'scripts/verify-import-pagination-ui.mjs',
    'scripts/verify-listening-audio-intake.mjs',
    'scripts/verify-listening-audio-serving.mjs',
    'scripts/verify-nck1-pdf-materialization-producer.mjs',
    'scripts/verify-universal-nck1-source-only-intake.mjs',
    'scripts/verify-import-environment-preflight.mjs',
    'scripts/verify-import-paper-routing.mjs',
    'scripts/verify-paper-canonical-docx-source-adapter.mjs',
    'scripts/verify-paper-canonical-legacy-source-capture-adapter.mjs',
    'scripts/verify-paper-canonical-listening-zero-occurrence.mjs',
    'scripts/verify-paper-canonical-listening-first-section-playback-slot-gating.mjs',
    'scripts/verify-paper-canonical-continuation-writing-rendered-behavior.mjs',
    'scripts/verify-paper-canonical-reading-rendered-behavior.mjs',
    'scripts/verify-paper-canonical-cloze-grammar-consumption.mjs',
    'scripts/verify-paper-normalization-cloze.mjs',
    'scripts/verify-paper-normalization-grammar-fill.mjs',
    'scripts/verify-paper-normalization-import-gate.mjs',
    'scripts/import-pipeline/verify-source-doc-types.mjs',
    'scripts/verify-import-ops.mjs',
    'scripts/verify-source-intake.mjs',
    'scripts/verify-source-intake-webhook.mjs',
    'scripts/verify-nck1-analysis-agent-plugin.mjs',
    'scripts/verify-ship-check-watcher.mjs',
    'scripts/verify-amp-orb-ci.mjs',
    'scripts/verify-import-review-media-derivation.mjs',
    'scripts/verify-canonical-paper-group-surface-adapter-declaration-parity.mjs',
    'scripts/verify-paper-surface-mjs-declaration-parity.mjs',
    'scripts/verify-c7-paper-import-contracts.mjs',
    'scripts/verify-paper-draft.mjs',
    'scripts/verify-basket-persistence.mjs',
    'scripts/verify-concierge-desk.mjs',
    'scripts/verify-c8-draft-paper-contracts.mjs',
    'scripts/verify-draft-pagination-cache-trigger.mjs',
    'scripts/verify-draft-chromium-pool-lifecycle.mjs',
    'scripts/verify-print-pdf-error-classification.mjs',
    'scripts/verify-c8-print-ready-gate.mjs',
    'scripts/verify-print-form.mjs',
    'scripts/verify-companion-analysis-export.mjs',
    'scripts/verify-verification-command-runner.mjs',
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
    'scripts/verify-i3-cloze-ai-import.mjs',
    'scripts/verify-i4-grammar-fill-ai-import.mjs',
    'scripts/verify-i5-writing-ai-import.mjs',
    'scripts/verify-application-model-answer-prompt.mjs',
    'scripts/verify-paragraph-summaries-v1.mjs',
    'scripts/verify-public-search-metadata-v1.mjs',
    'scripts/verify-public-paper-review-consumer.mjs',
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
    'scripts/verify-ops-mcp.mjs',
    'scripts/verify-owner-gate.mjs',
    'scripts/verify-user-scope.mjs',
    'scripts/verify-classic-retire-2.mjs',
    'scripts/verify-classic-retire-3.mjs',
    'scripts/verify-paper-assets-consistency.mjs',
    'scripts/verify-paper-selection-source.mjs',
    'scripts/verify-paper-translation-cache.mjs',
    'scripts/verify-paper-selection-browser.mjs',
    'scripts/verify-sentence-analysis-contract.mjs',
    'scripts/verify-paper-dictionary.mjs',
    'scripts/verify-list-groups-perf.mjs',
    'scripts/verify-add-to-draft-feel.mjs',
    'scripts/verify-draft-workbench-visual-unify.mjs',
    'scripts/verify-my-space-shelf.mjs',
    'scripts/verify-draft-student-field.mjs',
    'scripts/verify-genre-truth.mjs',
    'scripts/verify-generated-docx-disconnected.mjs',
    'scripts/verify-detail-redesign.mjs',
    'scripts/verify-paper-canonical-detail-screen-consumption.mjs',
    'scripts/verify-reading-analysis-retire.mjs',
    'scripts/verify-r2-trap-audit.mjs',
  ]),
})

// Keep the longest render script on its own runner; preserve the lane registry.
export const e2eRenderShardOverrides = Object.freeze({
  '1': Object.freeze(['scripts/verify-universal-nck1-publish.mjs']),
  '2': Object.freeze([
    'scripts/verify-universal-nck1-image-source-bundle.mjs',
    'scripts/verify-paper-canonical-legacy-opaque-writing-rendered-behavior.mjs',
    'scripts/verify-paper-canonical-seven-choices-rendered-behavior.mjs',
    'scripts/verify-paper-canonical-application-writing-rendered-behavior.mjs',
    'scripts/verify-figure-render.mjs',
  ]),
})

function assertShardKeys(shards) {
  const keys = Reflect.ownKeys(shards)
  if (keys.length !== 2 || !keys.includes('1') || !keys.includes('2')) {
    throw new Error('Invalid verify shard keys: expected exactly 1 and 2')
  }
  if (!Array.isArray(shards['1']) || !Array.isArray(shards['2'])) {
    throw new Error('Invalid verify shard allocation: expected script arrays')
  }
}

export function createVerificationShards(scripts, overrides = verificationShardOverrides) {
  assertShardKeys(overrides)
  const registered = new Set(scripts)
  const destinations = new Map()
  for (const [shard, entries] of Object.entries(overrides)) {
    for (const script of entries) {
      if (!registered.has(script)) throw new Error(`Invalid verify shard allocation: stale override ${script}`)
      if (destinations.has(script)) throw new Error(`Invalid verify shard allocation: duplicate override ${script}`)
      destinations.set(script, shard)
    }
  }
  const shards = { '1': [], '2': [] }
  for (const script of scripts) {
    // Registry paths are stable identities; use the entire SHA-256 integer.
    const shard = destinations.get(script)
      ?? String(Number(BigInt(`0x${createHash('sha256').update(script).digest('hex')}`) % 2n) + 1)
    shards[shard].push(script)
  }
  assertVerificationShardCoverage(scripts, shards)
  return Object.freeze({ '1': Object.freeze(shards['1']), '2': Object.freeze(shards['2']) })
}

export function assertVerificationShardCoverage(scripts, shards) {
  assertShardKeys(shards)
  const assigned = Object.values(shards).flat()
  const registered = new Set(scripts)
  const duplicates = assigned.filter((script, index) => assigned.indexOf(script) !== index)
  const missing = scripts.filter(script => !assigned.includes(script))
  const stale = assigned.filter(script => !registered.has(script))
  if (registered.size !== scripts.length || duplicates.length || missing.length || stale.length) {
    throw new Error(`Invalid verify shard allocation: ${JSON.stringify({ duplicates, missing, stale })}`)
  }
}

export function verificationShardScripts(scripts, shard = 'all', shards) {
  if (shard === 'all') return scripts
  if (!Object.hasOwn(shards, shard)) throw new Error(`Unknown verification shard: ${shard}`)
  const assigned = new Set(shards[shard])
  return scripts.filter(script => assigned.has(script))
}
