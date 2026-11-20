import { createHash } from 'node:crypto'

// Balance from main run 39294229572 at 90a69085, retaining jobs=2 and locks.
// OCR projection: 973.702s * local 373.02/554.59 = 654.917s.
// Registry-order replay: 662.736s / 589.482s (script wall, before runner setup).
// Unlisted lane paths use SHA-256 modulo 2; retired overrides are errors.
export const verificationShardOverrides = Object.freeze({
  '1': Object.freeze([
    'scripts/verify-universal-nck1-source-only-boundaries.mjs',
    'scripts/verify-import-review-target.mjs',
    'scripts/verify-nck1-pdf-crop-recipe-replay.mjs',
    'scripts/verify-paper-canonical-legacy-opaque-continuation.mjs',
    'scripts/verify-paper-canonical-cloze-grammar-publication.mjs',
    'scripts/verify-paper-canonical-listening-inactive-closure.mjs',
    'scripts/verify-paper-canonical-abcd-layout.mjs',
    'scripts/verify-paper-normalization-cloze-analysis.mjs',
    'scripts/verify-paper-normalization-grammar-fill-surface.mjs',
    'scripts/verify-ci-pr-plan.mjs',
    'scripts/verify-c7-paper-import-publish.mjs',
    'scripts/verify-c8-draft-paper-render-model.mjs',
    'scripts/verify-grammar-facets-v2.mjs',
    'scripts/verify-auth-gate.mjs',
    'scripts/verify-launch-deploy.mjs',
    'scripts/verify-sentence-analysis-server.mjs',
    'scripts/verify-sentence-analysis-interaction.mjs',
    'scripts/verify-generated-docx-output-deleted.mjs',
  ]),
  '2': Object.freeze([
    'scripts/verify-review-subject-backfill.mjs',
    'scripts/verify-docx-source-media-input.mjs',
    'scripts/verify-listening-signal.mjs',
    'scripts/verify-scoped-publication.mjs',
    'scripts/verify-nck1-analyzed-package-candidate.mjs',
    'scripts/verify-paper-browse.mjs',
    'scripts/verify-file-save-as.mjs',
    'scripts/verify-production-canonical-publication-backfill.mjs',
    'scripts/verify-nck1-reading-figure-options.mjs',
    'scripts/verify-paper-canonical-foundation.mjs',
    'scripts/verify-listening-audio-intake.mjs',
    'scripts/verify-listening-audio-serving.mjs',
    'scripts/verify-paper-canonical-listening-zero-occurrence.mjs',
    'scripts/verify-paper-canonical-reading-rendered-behavior.mjs',
    'scripts/verify-paper-normalization-cloze.mjs',
    'scripts/verify-source-intake-webhook.mjs',
    'scripts/verify-nck1-analysis-agent-plugin.mjs',
    'scripts/verify-ship-check-watcher.mjs',
    'scripts/verify-canonical-paper-group-surface-adapter-declaration-parity.mjs',
    'scripts/verify-paper-draft.mjs',
    'scripts/verify-basket-persistence.mjs',
    'scripts/verify-concierge-desk.mjs',
    'scripts/verify-draft-chromium-pool-lifecycle.mjs',
    'scripts/verify-c8-print-ready-gate.mjs',
    'scripts/verify-companion-analysis-export.mjs',
    'scripts/verify-verification-command-runner.mjs',
    'scripts/verify-lecture-panel-css.mjs',
    'scripts/verify-i0e-seven-choices-entry.mjs',
    'scripts/verify-h1e-export-routes.mjs',
    'scripts/verify-h5a-export-implementation.mjs',
    'scripts/verify-h5d-completion-runner.mjs',
    'scripts/verify-h5e-verify-question-group.mjs',
    'scripts/verify-h5l-question-group-parse.mjs',
    'scripts/verify-h10a-paper-set-routes.mjs',
    'scripts/verify-h10b-ai-proxy-routes.mjs',
    'scripts/verify-i3-cloze-ai-import.mjs',
    'scripts/verify-i4-grammar-fill-ai-import.mjs',
    'scripts/verify-i7-application-given.mjs',
    'scripts/verify-i8-cloze-analysis.mjs',
    'scripts/verify-i10-blank-rendering.mjs',
    'scripts/verify-i11-symbol-normalization.mjs',
    'scripts/verify-i13-grammar-fill-analysis.mjs',
    'scripts/verify-similar-workbench-swap.mjs',
    'scripts/verify-h11a-http-client.mjs',
    'scripts/verify-restart1-local-search-intent.mjs',
    'scripts/verify-restart3-teacher-analysis.mjs',
    'scripts/verify-ai-server-key-fallback.mjs',
    'scripts/verify-ops-mcp.mjs',
    'scripts/verify-owner-gate.mjs',
    'scripts/verify-user-scope.mjs',
    'scripts/verify-classic-retire-2.mjs',
    'scripts/verify-paper-assets-consistency.mjs',
    'scripts/verify-paper-selection-browser.mjs',
    'scripts/verify-sentence-analysis-contract.mjs',
    'scripts/verify-paper-dictionary.mjs',
    'scripts/verify-reading-analysis-retire.mjs',
    'scripts/verify-r2-trap-audit.mjs',
  ]),
})

// Keep the longest render script on its own runner; preserve the lane registry.
export const e2eRenderShardOverrides = Object.freeze({
  '1': Object.freeze([]),
  '2': Object.freeze([
    'scripts/verify-paper-canonical-legacy-opaque-writing-rendered-behavior.mjs',
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
