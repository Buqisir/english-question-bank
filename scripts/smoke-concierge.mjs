#!/usr/bin/env node
/**
 * DEPRECATED — kept as a thin redirect.
 *
 * The original Concierge Desk V1 smoke (this file) drove the legacy desk UI:
 *   - .concierge-result-list rows
 *   - "你找什么题" headline
 *   - per-row 「预览」 button
 *
 * That UI is no longer the main path. The current flow is the V1.1 paper-bucket
 * IA, which is covered end-to-end by:
 *
 *     scripts/smoke-concierge-stream.mjs
 *
 * Asserting the old selectors here would only ever be a false negative on a
 * green release, so the body of this script has been retired. Anyone (or any
 * runbook / muscle memory) still invoking `node scripts/smoke-concierge.mjs`
 * gets a friendly pointer and a clean exit-0 — release smoke is _not_ broken
 * by this entry point anymore.
 *
 * If you actually want to exercise the concierge stack, run:
 *
 *     APP_URL=http://localhost:5173 node scripts/smoke-concierge-stream.mjs
 *
 * This file is intentionally minimal: no Playwright import, no network calls,
 * no artifacts written. It is safe to invoke in any environment.
 */

const REPLACEMENT = 'scripts/smoke-concierge-stream.mjs'

console.log('=== smoke-concierge.mjs (deprecated) ===')
console.log('')
console.log('This smoke targeted the legacy Concierge Desk V1 UI and has been retired.')
console.log(`Use ${REPLACEMENT} instead — it covers the current paper-bucket IA.`)
console.log('')
console.log('Example:')
console.log(`    APP_URL=http://localhost:5173 node ${REPLACEMENT}`)
console.log('')
console.log('Exiting 0 so release pipelines that still reference this script do not falsely fail.')

process.exit(0)
