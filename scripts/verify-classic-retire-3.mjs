#!/usr/bin/env node
/**
 * Verification: classic-retire-3-cleanup cut.
 *
 * Cut 3 of the "经典模式退役" series (cut 1: admin corners #246; cut 2:
 * detail view extraction #247) deletes the remaining classic-mode dead
 * code from App.tsx/App.css — homeMode state machine, classic list view,
 * filter bar, classic sidebar (basket-panel incl. steward-chat-panel),
 * and the print-preview viewMode branch. ConciergeDesk becomes the only
 * home view; admin no longer jumps to print preview after building an
 * objective paper set; member view is unaffected.
 *
 * Source-regex assertions only (no server spawn needed — this cut touches
 * no API/data-contract surface, only App.tsx/App.css UI structure).
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

let passed = 0
let failed = 0
function assert(name, condition, detail) {
  if (condition) {
    passed += 1
    console.log(`  PASS ${name}`)
  } else {
    failed += 1
    console.error(`  FAIL ${name}${detail ? `\n    ${detail}` : ''}`)
  }
}

function read(relPath) {
  return readFileSync(path.join(rootDir, relPath), 'utf8')
}

const appTsx = read('app/src/App.tsx')
const appCss = read('app/src/App.css')

// ------------------------------------------------------------------ 1. dead symbols gone from App.tsx

assert('App.tsx contains no `homeMode`', !/homeMode/.test(appTsx))
assert('App.tsx contains no `steward-chat-panel`', !appTsx.includes('steward-chat-panel'))
assert(
  // A code comment legitimately mentions the retired feature by name
  // ("was classic-basket-panel-only display state, retired in
  // classic-retire-3") — match the actual JSX class attribute, not any
  // substring, so that explanatory comment doesn't false-positive this gate.
  'App.tsx contains no className="basket-panel" (JSX usage, not comment mentions)',
  !/className="basket-panel"/.test(appTsx),
)
assert(
  "App.tsx viewMode type no longer includes a 'preview' value",
  !/useState<'list' \| 'detail' \| 'preview'>/.test(appTsx) && !/setViewMode\('preview'\)/.test(appTsx),
)
assert('App.tsx contains no `openPreview`', !/\bopenPreview\b/.test(appTsx))

// ------------------------------------------------------------------ 2. ConciergeDesk renders unconditionally

// Locate the ConciergeDesk render block and confirm the line(s) immediately
// preceding its opening tag are the `viewMode === 'list' ? (` ternary guard
// only — no `homeMode === 'ai' ? (` (or any other mode) conditional wraps it.
const conciergeRenderIndex = appTsx.indexOf('<ConciergeDesk')
assert('App.tsx renders <ConciergeDesk', conciergeRenderIndex !== -1)
if (conciergeRenderIndex !== -1) {
  const precedingWindow = appTsx.slice(Math.max(0, conciergeRenderIndex - 400), conciergeRenderIndex)
  assert(
    'ConciergeDesk render is gated only by viewMode, not by any mode-conditional wrapper',
    /viewMode === 'list' \? \(\s*$/.test(precedingWindow.trimEnd()) && !/homeMode/.test(precedingWindow),
    `preceding window:\n${precedingWindow}`,
  )
}

// ------------------------------------------------------------------ 3. app-shell className is the fixed AI literal

assert(
  'App.tsx app-shell className is the literal "app-shell home-mode-ai" (no template/homeMode interpolation)',
  /<div className="app-shell home-mode-ai">/.test(appTsx),
)

// ------------------------------------------------------------------ 4. App.css negative-deletion sentinels
// These classes have live users outside App.tsx's deleted classic UI
// (DraftPaperWorkbench / PaperSurfacePrototype / ConciergePaperRow /
// PaperIntelligencePreview) and must survive this cut's CSS cleanup.

assert('App.css still has a `.version-toggle` rule', /^\.version-toggle\b/m.test(appCss))
assert('App.css still has a `.paper-page` rule', /^\.paper-page\b/m.test(appCss))
assert('App.css still has a `.paper-meta` rule', /^\.paper-meta\b/m.test(appCss))
assert('App.css still has a `.basket-item` rule', /^\.basket-item\b/m.test(appCss))
assert(
  'App.css still has a base `.eyebrow` rule reading var(--muted) (not just the .app-shell.home-mode-ai override)',
  (() => {
    const baseEyebrowRule = appCss.match(/(?<!\.app-shell\.home-mode-ai )\.eyebrow\s*\{[^}]*\}/)?.[0] || ''
    return /color:\s*var\(--muted\)/.test(baseEyebrowRule)
  })(),
)
assert(
  'App.css still has the .app-shell.home-mode-ai rule family untouched',
  /\.app-shell\.home-mode-ai\s*\{/.test(appCss),
)

// ------------------------------------------------------------------ 5. admin objective-paper-set build no longer jumps to print preview

const buildHandlerMatch = appTsx.match(/async function handleBuildObjectivePaperSet\(([\s\S]*?)\n {2}\}/)
assert('App.tsx defines handleBuildObjectivePaperSet', buildHandlerMatch !== null)
if (buildHandlerMatch) {
  const body = buildHandlerMatch[0]
  assert(
    "handleBuildObjectivePaperSet no longer contains setViewMode('preview')",
    !/setViewMode\('preview'\)/.test(body),
  )
  assert(
    'handleBuildObjectivePaperSet no longer calls loadPreviewForBasketItems (deleted with the preview branch)',
    !/loadPreviewForBasketItems/.test(body),
  )
}

console.log(`\nclassic-retire-3 verify: ${passed} passed, ${failed} failed`)
if (failed > 0) {
  process.exit(1)
}
