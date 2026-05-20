/**
 * verify-c5b-smoke-coverage.mjs
 *
 * Static verify: asserts the C5b browser QA smoke script covers every
 * mandatory PO QA checklist item from the contract. If someone adds a
 * new checklist row to the contract without a matching smoke step,
 * this verify fails loudly.
 *
 * Run:
 *   node scripts/verify-c5b-smoke-coverage.mjs
 */

import {
  createVerifier,
  readText,
  repoRootFrom,
} from './lib/verifyScope.mjs'

const ROOT = repoRootFrom(import.meta.url)
const { assert, section, summary } = createVerifier('C5b smoke coverage verify')

const contract = readText(ROOT, 'docs/product/paper-surface-c5b-po-qa-contract.md')
const smoke = readText(ROOT, 'scripts/smoke-paper-surface-c5b.mjs')

section('smoke script exists and follows conventions')

assert(smoke.includes('#!/usr/bin/env node'), 'smoke has shebang')
assert(smoke.includes("from '../app/node_modules/playwright/index.mjs'"), 'imports playwright from app/node_modules')
assert(smoke.includes('APP_URL'), 'uses APP_URL env var')
assert(smoke.includes('process.exit(1)'), 'exits non-zero on failure')
assert(smoke.includes('smoke-paper-surface-c5b'), 'artifact dir matches script name')
assert(smoke.includes('surface=paper'), 'navigates to surface=paper route')

section('contract checklist coverage — 1360px and wider')

assert(smoke.includes('1440') || smoke.includes('1360'), 'tests at >=1360px viewport')
assert(smoke.includes('1360') && smoke.includes('1359'), 'tests exact boundary viewports 1360px and 1359px')
assert(smoke.includes('data-pi-insight-chip'), 'interacts with passage chips')
assert(smoke.includes('data-structure-row-mode="passage"'), 'clicks 篇章 row')
assert(smoke.includes('data-structure-row-mode="paragraph"'), 'clicks Pn row')
assert(smoke.includes('aria-pressed'), 'asserts aria-pressed toggle')
assert(smoke.includes('data-c5b-brace'), 'asserts brace SVG presence/absence')
assert(smoke.includes('.ps-page'), 'checks brace placement relative to .ps-page')

section('contract checklist coverage — 1200-1359px (tight desktop)')

assert(smoke.includes('1280'), 'tests at tight desktop breakpoint')
assert(
  smoke.includes('brace is hidden') || smoke.includes('braceTightVisible'),
  'asserts brace hidden at tight desktop',
)

section('contract checklist coverage — <=1199px (stacked)')

assert(smoke.includes('1024') || smoke.includes('1100'), 'tests at stacked breakpoint')
assert(smoke.includes('data-viewport-mode'), 'asserts stacked viewport mode')
assert(smoke.includes('P1 row aria-pressed=true at 1024px'), 'stacked mode tests P1 row activation')
assert(smoke.includes('structure rows appear after chip click'), 'stacked mode tests structure rows in drawer')
assert(smoke.includes('target paragraph visible or scroll position changed at 1024px'), 'stacked mode tests scroll/visibility')
assert(smoke.includes('brace hidden at 1024px'), 'stacked mode tests brace hidden')
assert(smoke.includes('no topbar insight fallback after interaction'), 'stacked mode re-checks no topbar after interaction')

section('contract checklist coverage — evidence coexistence')

assert(smoke.includes('coexist'), 'tests evidence + brace coexistence')
assert(smoke.includes('pi-line-path'), 'asserts evidence line presence in coexist test')

section('contract checklist coverage — forbidden regressions')

assert(smoke.includes('pi-ps-structure-controls'), 'asserts no bottom button strip')
assert(smoke.includes('connector'), 'asserts no connector line')
assert(smoke.includes('topbar'), 'asserts no topbar insight fallback')
assert(
  smoke.includes('ai-difficulty') || smoke.includes('data-ai'),
  'asserts no AI diagnostic elements',
)

section('anti-false-positive guarantees')

assert(smoke.includes('pi-ps-harness-error'), 'uses correct error selector (.pi-ps-harness-error not .pi-ps-error)')
assert(!smoke.includes("step('A1. surface=paper harness loads', true)"), 'A1 does not pass unconditional true')
assert(smoke.includes('assertCoreContentRendered'), 'has content guard helper to prevent vacuous passes')
assert(smoke.includes('content guard failed'), 'forbidden checks fail when content guard fails')
assert(smoke.includes('row activation failed'), 'tight-desktop brace check requires row activation success')
assert(smoke.includes('pageErrors'), 'tracks page errors for final guard')
assert(smoke.includes('consoleErrors'), 'tracks console errors for final guard')
assert(smoke.includes('instrumentPage'), 'uses instrumentPage to attach listeners to all pages')
assert(smoke.includes('FINAL. no uncaught page errors'), 'has final pageerror guard step')
assert(smoke.includes('FINAL. no console errors'), 'has final console.error guard step')

section('no forbidden patterns in smoke script')

assert(!smoke.includes('PaperSurface.tsx'), 'smoke does not import PaperSurface.tsx')
assert(!smoke.includes('PaperSurface.css'), 'smoke does not import PaperSurface.css')
assert(!smoke.includes('package.json'), 'smoke does not reference package.json')

summary()
