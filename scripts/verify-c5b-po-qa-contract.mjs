/**
 * Verifies the C5b PO QA contract stays explicit.
 *
 * This is intentionally documentation-focused. C5b had several
 * expensive visual reversions during development, so the acceptance
 * contract should fail loudly if the core decisions disappear.
 */

import {
  createVerifier,
  readText,
  repoRootFrom,
} from './lib/verifyScope.mjs'

const ROOT = repoRootFrom(import.meta.url)
const { assert, section, summary } = createVerifier('C5b PO QA contract verify')

const contract = readText(
  ROOT,
  'docs/product/paper-surface-c5b-po-qa-contract.md',
)
const decisions = readText(
  ROOT,
  'docs/product/paper-intelligence-interaction-decisions.md',
)
const ledger = readText(ROOT, 'docs/paper-surface-watch-ledger.md')

section('contract source of truth')

assert(contract.includes('PaperSurface C5b PO QA Contract'), 'contract document exists')
assert(contract.includes('Status: accepted after PO QA'), 'contract records accepted PO QA status')
assert(
  decisions.includes('docs/product/paper-surface-c5b-po-qa-contract.md'),
  'product decisions link to C5b PO QA contract',
)
assert(
  ledger.includes('docs/product/paper-surface-c5b-po-qa-contract.md'),
  'watch ledger links to C5b PO QA contract',
)

section('locked display rules')

assert(contract.includes('>=1360px'), 'contract locks visible breakpoint >=1360px')
assert(contract.includes('<=1359px'), 'contract locks hidden breakpoint <=1359px')
assert(contract.includes('1200px To 1359px'), 'contract has tight desktop QA band')
assert(contract.includes('1199px And Below'), 'contract has stacked QA band')
assert(contract.includes('brace is hidden'), 'contract states hidden brace behavior')
assert(contract.includes('paper scrolls'), 'contract preserves scroll behavior when brace is hidden')

section('placement and z-index guardrails')

assert(contract.includes('white `.ps-page` left padding'), 'contract locks .ps-page left padding placement')
assert(contract.includes('must not move back to the gray matte'), 'contract forbids gray matte placement')
assert(contract.includes('must not overlap passage text'), 'contract forbids text overlap')
assert(contract.includes('Do not make the tight-desktop brace visible by raising z-index'), 'contract forbids z-index fix')
assert(contract.includes('Do not start with z-index'), 'reopen section repeats z-index warning')

section('interaction acceptance')

assert(contract.includes('Click `篇章`'), 'contract tests passage mode')
assert(contract.includes('Click `P1`'), 'contract tests paragraph mode')
assert(contract.includes('Click the active row again'), 'contract tests toggle-off behavior')
assert(contract.includes('Evidence line and Structure Brace may coexist'), 'contract locks evidence coexistence')
assert(contract.includes('No topbar insight fallback'), 'contract protects left-only insight entry')

section('forbidden regressions')

const forbiddenRegressionTerms = [
  'collapsed main rail',
  'bottom button strip',
  'gray matte',
  '1280px',
  'connector line',
  'AI difficulty',
  'PaperSurface.tsx',
  'PaperSurface.css',
]

for (const term of forbiddenRegressionTerms) {
  assert(contract.includes(term), `contract forbids/guards ${term}`)
}

summary()
