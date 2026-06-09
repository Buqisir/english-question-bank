#!/usr/bin/env node
/**
 * Verification: search-thinking-toggle cut
 *
 * Source-structure assertions (no network calls):
 *   (a) askQuestionBankSteward signature takes thinkingMode param and uses it in
 *       the request body (no longer hardcodes false).
 *   (b) questionBankStewardSearch has a thinkingMode param and passes it to
 *       planQuestionBankStewardSearch AND semanticSearchQuestionGroups.
 *   (c) The steward route forwards input.thinkingMode to questionBankStewardSearch.
 *   (d) ConciergeDesk renders a thinking toggle (checkbox + label).
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

let passed = 0
let failed = 0

function assert(name, condition, detail = '') {
  if (condition) {
    passed++
    console.log(`PASS ${name}`)
  } else {
    failed++
    console.error(`FAIL ${name}${detail ? `\n  ${detail}` : ''}`)
  }
}

function readText(relPath) {
  return readFileSync(path.join(rootDir, relPath), 'utf8')
}

// ── (a) askQuestionBankSteward in services/questionGroups.ts ─────────────────
const qgTs = readText('app/src/services/questionGroups.ts')

// Signature: third param is thinkingMode (with default)
assert(
  '(a1) askQuestionBankSteward has thinkingMode param',
  /askQuestionBankSteward\s*\(\s*message\s*:\s*string\s*,\s*apiKey\s*:\s*string\s*,\s*thinkingMode\s*=\s*false\s*\)/.test(qgTs),
  'Expected signature: askQuestionBankSteward(message: string, apiKey: string, thinkingMode = false)',
)

// Request body uses the param (not the literal `false`)
// We check that `thinkingMode: thinkingMode` (or `thinkingMode,`) appears in the body, NOT `thinkingMode: false`
const stewardFnMatch = qgTs.match(/export async function askQuestionBankSteward[\s\S]*?^\}$/m)
assert(
  '(a2) askQuestionBankSteward request body uses thinkingMode param (not literal false)',
  stewardFnMatch !== null &&
    /thinkingMode:\s*thinkingMode/.test(stewardFnMatch[0]) &&
    !/thinkingMode:\s*false/.test(stewardFnMatch[0]),
  'Request body must use the thinkingMode param, not hardcode false',
)

// ── (b) questionBankStewardSearch ────────────────────────────────────────────
// questionBankStewardSearch + planQuestionBankStewardSearch were moved to
// server/search/questionBankStewardService.mjs (cut H5-I); api.mjs re-imports the entry point.
// The steward ROUTE moved to server/ai-proxy/routes.mjs (cut H10-B PR2; asserted by c1). Read the
// steward fn definitions from their new home — same assertions, pointer-updated home.
const stewardService = readText('server/search/questionBankStewardService.mjs')

// Function signature has thinkingMode param
assert(
  '(b1) questionBankStewardSearch has thinkingMode param',
  /async function questionBankStewardSearch\s*\([^)]*thinkingMode\s*=\s*false[^)]*\)/.test(stewardService),
  'Expected: questionBankStewardSearch(..., thinkingMode = false)',
)

// Passes thinkingMode to planQuestionBankStewardSearch
assert(
  '(b2) questionBankStewardSearch passes thinkingMode to planQuestionBankStewardSearch',
  /planQuestionBankStewardSearch\s*\([^)]*thinkingMode[^)]*\)/.test(stewardService),
  'planQuestionBankStewardSearch call must include thinkingMode argument',
)

// Passes thinkingMode to semanticSearchQuestionGroups
assert(
  '(b3) questionBankStewardSearch passes thinkingMode to semanticSearchQuestionGroups',
  /semanticSearchQuestionGroups\s*\([^)]*thinkingMode[^)]*\)/.test(stewardService),
  'semanticSearchQuestionGroups call must include thinkingMode argument',
)

// Both response branches use the thinkingMode variable (not false literal) for thinkingMode metadata
// Extract the questionBankStewardSearch function body
const stewardSearchMatch = stewardService.match(
  /async function questionBankStewardSearch[\s\S]*?^}/m,
)
assert(
  '(b4) questionBankStewardSearch response metadata uses thinkingMode variable (not literal false)',
  stewardSearchMatch !== null &&
    /thinkingMode:\s*thinkingMode/.test(stewardSearchMatch[0]) &&
    !/thinkingMode:\s*false/.test(stewardSearchMatch[0]),
  'Both clarification + normal branches must use thinkingMode variable in response',
)

// planQuestionBankStewardSearch also has thinkingMode param
assert(
  '(b5) planQuestionBankStewardSearch has thinkingMode param',
  /async function planQuestionBankStewardSearch\s*\([^)]*thinkingMode\s*=\s*false[^)]*\)/.test(stewardService),
  'Expected: planQuestionBankStewardSearch(..., thinkingMode = false)',
)

// semanticSearchQuestionGroups has thinkingMode param.
// Moved to server/search/semanticSearchService.mjs (cut H5-H); api.mjs re-imports the entry
// point and forwards thinkingMode (asserted by b3). Read the definition from its new home.
const semanticSearchService = readText('server/search/semanticSearchService.mjs')
assert(
  '(b6) semanticSearchQuestionGroups has thinkingMode param',
  /async function semanticSearchQuestionGroups\s*\([^)]*thinkingMode\s*=\s*false[^)]*\)/.test(semanticSearchService),
  'Expected: semanticSearchQuestionGroups(..., thinkingMode = false)',
)

// ── (c) Steward route forwards input.thinkingMode ────────────────────────────
// The steward ROUTE moved from the inline api.mjs handler to server/ai-proxy/routes.mjs
// (cut H10-B PR2). Same intent — the route forwards input.thinkingMode to questionBankStewardSearch —
// pointer-updated to its new home (now via context.questionBankStewardSearch).
const aiProxyRoutes = readText('server/ai-proxy/routes.mjs')
assert(
  '(c1) Steward route forwards input.thinkingMode to questionBankStewardSearch',
  /questionBankStewardSearch\s*\([^)]*input\.thinkingMode[^)]*\)/.test(aiProxyRoutes),
  'Route must pass input.thinkingMode === true (or equivalent) to questionBankStewardSearch',
)

// ── (d) ConciergeDesk renders a thinking toggle ──────────────────────────────
const conciergeDesk = readText('app/src/concierge/ConciergeDesk.tsx')

assert(
  '(d1) ConciergeDesk has thinkingMode prop in ConciergeDeskProps',
  /thinkingMode\s*\?:\s*boolean/.test(conciergeDesk),
  'ConciergeDeskProps must include thinkingMode?: boolean',
)

assert(
  '(d2) ConciergeDesk renders a checkbox for thinking toggle',
  /type=["']checkbox["']/.test(conciergeDesk),
  'ConciergeDesk must render an <input type="checkbox"> for the thinking toggle',
)

assert(
  '(d3) ConciergeDesk renders 思考模式 label',
  /思考模式/.test(conciergeDesk),
  'ConciergeDesk must render a label containing 思考模式',
)

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} checks: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
