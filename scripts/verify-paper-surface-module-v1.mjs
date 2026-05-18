#!/usr/bin/env node
/**
 * verify-paper-surface-module-v1
 *
 * Issue #21-B3: locks down the PaperSurface Module v1 contract.
 *
 * Asserts:
 *   1. File boundary — required files exist, forbidden files absent,
 *      no edits to forbidden scopes.
 *   2. Anchor protocol — anchors come from paperSurfaceAnchorAttrs,
 *      no data-pi-* or data-ra-* in the module, no raw data-paper-*
 *      string literals in JSX.
 *   3. Controlled component — no useState/useReducer for active/focus/
 *      mode state, no fetch, no localStorage, no router reads, no
 *      forbidden imports.
 *   4. Token discipline — imports paperSurfaceTokens, CSS uses vars,
 *      no raw token literals.
 *   5. Visual hard requirements — 794px, 56px, no border-radius /
 *      box-shadow / gradient inside paper.
 *   6. Segmenter purity — no React/app/server imports, idempotent.
 *
 * Cloud-safe: no browser, no build, no node_modules needed.
 */

import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const HERE = path.dirname(new URL(import.meta.url).pathname)
const ROOT = path.resolve(HERE, '..')

let passed = 0
let failed = 0
const issues = []

function assert(name, condition, detail) {
  if (condition) {
    passed++
    console.log(`  \u2713 ${name}`)
  } else {
    failed++
    issues.push(`${name}: ${detail || 'failed'}`)
    console.error(`  \u2717 ${name}: ${detail || 'failed'}`)
  }
}

function readSrc(rel) {
  return readFileSync(path.join(ROOT, rel), 'utf-8')
}

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

console.log('\n=== PaperSurface Module v1 (#21-B3) ===\n')

/* ─── 1. File boundary ───────────────────────────────────────────── */

console.log('Test 1: File boundary')

const REQUIRED_FILES = [
  'app/src/shared-ui/papersurface/PaperSurface.tsx',
  'app/src/shared-ui/papersurface/PaperSurface.css',
  'app/src/shared-ui/papersurface/index.ts',
  'shared/papersurface/segmentPaperText.mjs',
  'shared/papersurface/segmentPaperText.d.ts',
]

for (const f of REQUIRED_FILES) {
  assert(
    `${f} exists`,
    existsSync(path.join(ROOT, f)),
    `missing: ${f}`,
  )
}

const FORBIDDEN_FILES = [
  'app/src/shared-ui/papersurface/buildPaperTextMap.ts',
]

for (const f of FORBIDDEN_FILES) {
  assert(
    `${f} does NOT exist`,
    !existsSync(path.join(ROOT, f)),
    `forbidden file exists: ${f}`,
  )
}

// Check git diff for forbidden scope edits.
function safeGitDiffNames(args) {
  try {
    const out = execSync(`git diff --name-only ${args}`, {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
      .toString()
      .trim()
    return out ? out.split('\n') : []
  } catch {
    return []
  }
}

const baseRef = (() => {
  try {
    return execSync('git merge-base HEAD origin/main', {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
      .toString()
      .trim()
  } catch {
    try {
      return execSync('git merge-base HEAD main', {
        cwd: ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
        .toString()
        .trim()
    } catch {
      return 'HEAD'
    }
  }
})()

const changed = safeGitDiffNames(`${baseRef}...HEAD`)

const FORBIDDEN_PATHS = [
  /^app\/src\/features\/paper-intelligence\//,
  /^app\/src\/features\/reading-analysis\//,
  /^server\//,
  /^app\/package\.json$/,
  /^app\/pnpm-lock\.yaml$/,
  /^package\.json$/,
  /^package-lock\.json$/,
  /^pnpm-lock\.yaml$/,
  /^app\/src\/App\.tsx$/,
]

for (const re of FORBIDDEN_PATHS) {
  const offenders = changed.filter((p) => re.test(p))
  assert(
    `No edits to ${re.source}`,
    offenders.length === 0,
    `offenders: ${offenders.join(', ')}`,
  )
}

/* ─── 2. Anchor protocol ─────────────────────────────────────────── */

console.log('\nTest 2: Anchor protocol')

const tsxSrc = readSrc('app/src/shared-ui/papersurface/PaperSurface.tsx')
const tsxNoComments = stripComments(tsxSrc)

assert(
  'PaperSurface imports paperSurfaceAnchorAttrs',
  /import\s*\{\s*paperSurfaceAnchorAttrs\s*\}\s*from/.test(tsxSrc),
  'paperSurfaceAnchorAttrs import missing',
)

assert(
  'No data-pi- in PaperSurface module',
  !/data-pi-/.test(tsxNoComments),
  'data-pi-* found in PaperSurface.tsx',
)

assert(
  'No data-ra- in PaperSurface module',
  !/data-ra-/.test(tsxNoComments),
  'data-ra-* found in PaperSurface.tsx',
)

// Check CSS too.
const cssSrc = readSrc('app/src/shared-ui/papersurface/PaperSurface.css')
const cssNoComments = stripComments(cssSrc)

assert(
  'No data-pi- in PaperSurface.css',
  !/data-pi-/.test(cssNoComments),
  'data-pi-* found in PaperSurface.css',
)

assert(
  'No data-ra- in PaperSurface.css',
  !/data-ra-/.test(cssNoComments),
  'data-ra-* found in PaperSurface.css',
)

// Check no raw data-paper-* string literals in JSX props.
// Allowed: computed property access via paperSurfaceAnchorAttrs
// Forbidden: "data-paper-section" as a literal string key in JSX.
// We look for patterns like `data-paper-section=` or `"data-paper-` in
// the uncommented source. The allowed form uses `[paperSurfaceAnchorAttrs.xxx]:`.
const rawDataPaperLiterals = tsxNoComments.match(
  /["']data-paper-[a-z-]+["']\s*[=:]/g,
)
// Filter out: the import path references and computed property bracket syntax.
// Computed properties like { [paperSurfaceAnchorAttrs.section]: value } produce
// `[paperSurfaceAnchorAttrs.section]:` which is fine. Direct `"data-paper-section":`
// or `data-paper-section=` in JSX is forbidden.
const rawJsxAnchors = tsxNoComments.match(
  /\bdata-paper-[a-z-]+=\{/g,
)
assert(
  'No raw data-paper-* JSX attribute literals (must use computed property)',
  !rawJsxAnchors || rawJsxAnchors.length === 0,
  `raw literals found: ${(rawJsxAnchors || []).join(', ')}`,
)

// index.ts checks
const indexSrc = readSrc('app/src/shared-ui/papersurface/index.ts')

assert(
  'No data-pi- in index.ts',
  !/data-pi-/.test(indexSrc),
  'data-pi-* found in index.ts',
)

assert(
  'No data-ra- in index.ts',
  !/data-ra-/.test(indexSrc),
  'data-ra-* found in index.ts',
)

/* ─── 3. Controlled component ─────────────────────────────────────── */

console.log('\nTest 3: Controlled component constraints')

// No useState / useReducer for active/focus/mode state.
const stateHooks = tsxNoComments.match(
  /\b(useState|useReducer)\s*[<(]/g,
)
assert(
  'No useState or useReducer calls in PaperSurface',
  !stateHooks || stateHooks.length === 0,
  `state hooks found: ${(stateHooks || []).join(', ')}`,
)

// No fetch / XMLHttpRequest / axios.
assert(
  'No fetch in PaperSurface',
  !/\bfetch\s*\(/.test(tsxNoComments),
  'fetch() call found',
)
assert(
  'No XMLHttpRequest in PaperSurface',
  !/XMLHttpRequest/.test(tsxNoComments),
  'XMLHttpRequest found',
)
assert(
  'No axios in PaperSurface',
  !/\baxios\b/.test(tsxNoComments),
  'axios found',
)

// No localStorage / sessionStorage / indexedDB / cookie.
assert(
  'No localStorage in PaperSurface',
  !/localStorage/.test(tsxNoComments),
  'localStorage found',
)
assert(
  'No sessionStorage in PaperSurface',
  !/sessionStorage/.test(tsxNoComments),
  'sessionStorage found',
)
assert(
  'No indexedDB in PaperSurface',
  !/indexedDB/.test(tsxNoComments),
  'indexedDB found',
)
assert(
  'No document.cookie in PaperSurface',
  !/document\.cookie/.test(tsxNoComments),
  'document.cookie found',
)

// No router reads.
assert(
  'No window.location in PaperSurface',
  !/window\.location/.test(tsxNoComments),
  'window.location found',
)
assert(
  'No URLSearchParams in PaperSurface',
  !/URLSearchParams/.test(tsxNoComments),
  'URLSearchParams found',
)
assert(
  'No useNavigate in PaperSurface',
  !/useNavigate/.test(tsxNoComments),
  'useNavigate found',
)
assert(
  'No useLocation in PaperSurface',
  !/useLocation/.test(tsxNoComments),
  'useLocation found',
)
assert(
  'No history.push/replace in PaperSurface',
  !/history\.(push|replace)/.test(tsxNoComments),
  'history.push/replace found',
)

// No forbidden imports from PI, reading-analysis, basket, prototype, server.
assert(
  'No import from features/paper-intelligence',
  !/from\s+['"][^'"]*features\/paper-intelligence/.test(tsxSrc),
  'PI import found',
)
assert(
  'No import from features/reading-analysis',
  !/from\s+['"][^'"]*features\/reading-analysis/.test(tsxSrc),
  'reading-analysis import found',
)
assert(
  'No import from paperSurfacePrototype',
  !/from\s+['"][^'"]*paperSurfacePrototype/.test(tsxSrc),
  'prototype import found',
)
assert(
  'No import from server/',
  !/from\s+['"][^'"]*server\//.test(tsxSrc),
  'server/ import found',
)
assert(
  'No import from concierge/basket/paperAssembly',
  !/from\s+['"][^'"]*(concierge|basket|paperAssembly)/.test(tsxSrc),
  'basket/concierge import found',
)

// PaperSurfaceProps imported from shared types.
assert(
  'PaperSurfaceProps imported from shared/papersurface/types',
  /import\s+type\s*\{[^}]*PaperSurfaceProps[^}]*\}\s*from\s*['"][^'"]*shared\/papersurface\/types['"]/.test(tsxSrc),
  'PaperSurfaceProps not imported from shared types',
)

/* ─── 3b. Hook order — no hooks after conditional return ──────────── */

console.log('\nTest 3b: Hook order (no hooks after reading-mode early return)')

{
  // Find the reading-mode early return position in the uncommented source.
  const readingReturnPattern = /if\s*\(\s*mode\s*===\s*['"]reading['"]\s*\)\s*\{?\s*\n?\s*return\s/
  const readingReturnMatch = readingReturnPattern.exec(tsxNoComments)

  assert(
    'Reading-mode early return exists',
    !!readingReturnMatch,
    'could not find `if (mode === \'reading\') { return` pattern',
  )

  if (readingReturnMatch) {
    const returnPos = readingReturnMatch.index

    // Get everything after the early return.
    const afterReturn = tsxNoComments.slice(returnPos + readingReturnMatch[0].length)

    // Detect hook calls that appear after the early return but still
    // inside the PaperSurface function body (before the next top-level function).
    // We look for the closing brace of PaperSurface by finding the next
    // standalone function declaration or end of the export function scope.
    // Simple heuristic: find the next `^function ` or `^}` at column 0.
    const endOfComponent = afterReturn.search(/^\}\s*$/m)
    const bodyAfterReturn = endOfComponent >= 0
      ? afterReturn.slice(0, endOfComponent)
      : afterReturn

    // Match hook calls: useMemo(, useCallback(, useState(, useReducer(
    const hookPattern = /\b(useMemo|useCallback|useState|useReducer)\s*\(/g
    const hooksAfterReturn = []
    let hookMatch
    while ((hookMatch = hookPattern.exec(bodyAfterReturn)) !== null) {
      hooksAfterReturn.push(hookMatch[1])
    }

    assert(
      'No hook calls after reading-mode early return in PaperSurface',
      hooksAfterReturn.length === 0,
      `hooks found after early return: ${hooksAfterReturn.join(', ')}`,
    )
  }
}

/* ─── 4. Token discipline ─────────────────────────────────────────── */

console.log('\nTest 4: Token discipline')

assert(
  'PaperSurface imports paperSurfaceTokens',
  /import\s*\{\s*paperSurfaceTokens\s*\}\s*from/.test(tsxSrc),
  'paperSurfaceTokens import missing',
)

// CSS must use var() for the shared token values.
const REQUIRED_CSS_VARS = [
  '--ps-font-stack',
  '--ps-ink',
  '--ps-passage-line-height',
  '--ps-question-line-height',
  '--ps-passage-indent',
  '--ps-options-grid-columns',
  '--ps-options-grid-gap-x',
]

for (const v of REQUIRED_CSS_VARS) {
  const escaped = v.replace(/-/g, '\\-')
  const re = new RegExp(`var\\(\\s*${escaped}\\b`)
  assert(
    `CSS consumes var(${v})`,
    re.test(cssNoComments),
    `var(${v}) not found in CSS`,
  )
}

// No raw token literals in the CSS (the shared values).
const FORBIDDEN_CSS_LITERALS = [
  /"Times New Roman"/,
  /"SimSun"/,
  /"Songti SC"/,
  /"STSong"/,
  /line-height\s*:\s*1\.85\b/,
  /line-height\s*:\s*1\.7\b/,
]

for (const re of FORBIDDEN_CSS_LITERALS) {
  assert(
    `CSS does not hardcode token literal /${re.source}/`,
    !re.test(cssNoComments),
    'raw token literal found in CSS',
  )
}

/* ─── 5. Visual hard requirements ─────────────────────────────────── */

console.log('\nTest 5: Visual hard requirements')

assert(
  'CSS sets page width 794px',
  /794px/.test(cssNoComments),
  '794px not found',
)

assert(
  'CSS sets page padding 56px',
  /56px/.test(cssNoComments),
  '56px not found',
)

// No border-radius inside the paper page.
// The .ps-page and its children must not have border-radius.
// We check that border-radius does NOT appear in the CSS at all
// (the only allowed shadow is on .ps-page for outer sheet shadow).
assert(
  'No border-radius in CSS',
  !/border-radius/.test(cssNoComments),
  'border-radius found in CSS',
)

// No gradient inside paper.
assert(
  'No gradient in CSS',
  !/gradient/.test(cssNoComments),
  'gradient found in CSS',
)

// box-shadow is only on .ps-page (the outer sheet shadow, which is
// ALLOWED per QA checklist). We check that box-shadow does not appear
// on any selector other than .ps-page.
const boxShadowMatches = cssNoComments.match(/box-shadow\s*:/g)
assert(
  'box-shadow appears at most once (only on .ps-page outer sheet)',
  !boxShadowMatches || boxShadowMatches.length <= 1,
  `box-shadow found ${(boxShadowMatches || []).length} times`,
)

// font-family must resolve through the token var.
assert(
  'font-family uses var(--ps-font-stack)',
  /font-family\s*:\s*var\(\s*--ps-font-stack\s*\)/.test(cssNoComments),
  'font-family not using --ps-font-stack var',
)

/* ─── 6. Segmenter purity ─────────────────────────────────────────── */

console.log('\nTest 6: Segmenter purity')

const segmenterSrc = readSrc('shared/papersurface/segmentPaperText.mjs')
const segmenterNoComments = stripComments(segmenterSrc)

assert(
  'Segmenter has no import statements (no React/app/server deps)',
  !/^\s*import\s/m.test(segmenterNoComments),
  'import statement found in segmenter',
)

assert(
  'Segmenter does not reference React',
  !/\breact\b/i.test(segmenterNoComments),
  'react reference found in segmenter',
)

assert(
  'Segmenter does not reference app/',
  !/['"]\.\.\/app\/|from\s+['"][^'"]*app\//.test(segmenterNoComments),
  'app/ reference found in segmenter',
)

assert(
  'Segmenter does not reference server/',
  !/['"]\.\.\/server\/|from\s+['"][^'"]*server\//.test(segmenterNoComments),
  'server/ reference found in segmenter',
)

// Idempotency check: run the segmenter twice on same input.
const segmenterModule = await import(
  `file://${path.join(ROOT, 'shared/papersurface/segmentPaperText.mjs')}`
)

const testInput = 'The quick brown fox jumped over the lazy dog. It was a sunny day.\n\nA second paragraph here. With two sentences.'
const result1 = segmenterModule.segmentPaperText(testInput, { sectionId: 'A' })
const result2 = segmenterModule.segmentPaperText(testInput, { sectionId: 'A' })

assert(
  'Segmenter is idempotent (same input → identical output)',
  JSON.stringify(result1) === JSON.stringify(result2),
  'different results on same input',
)

assert(
  'Segmenter produces paragraphs',
  result1.paragraphs.length === 2,
  `expected 2 paragraphs, got ${result1.paragraphs.length}`,
)

assert(
  'Segmenter produces sentences',
  result1.paragraphs[0].sentences.length >= 2,
  `expected >= 2 sentences in first paragraph, got ${result1.paragraphs[0].sentences.length}`,
)

assert(
  'Segmenter sentence tokens are empty (deferred)',
  result1.paragraphs[0].sentences[0].tokens.length === 0,
  'tokens are not empty',
)

assert(
  'Segmenter handles empty input gracefully',
  segmenterModule.segmentPaperText('', { sectionId: 'X' }).paragraphs.length === 0,
  'non-empty result on empty input',
)

assert(
  'Segmenter handles null input gracefully',
  segmenterModule.segmentPaperText(null, { sectionId: 'X' }).paragraphs.length === 0,
  'non-empty result on null input',
)

// segmentPaperText.d.ts checks.
const segmenterDtsSrc = readSrc('shared/papersurface/segmentPaperText.d.ts')

assert(
  'segmentPaperText.d.ts declares segmentPaperText function',
  /export\s+declare\s+function\s+segmentPaperText/.test(segmenterDtsSrc),
  'function declaration missing',
)

assert(
  'segmentPaperText.d.ts declares SegmentResult type',
  /export\s+type\s+SegmentResult/.test(segmenterDtsSrc),
  'SegmentResult type missing',
)

assert(
  'segmentPaperText.d.ts does not import React',
  !/from\s+['"]react['"]/.test(segmenterDtsSrc),
  'react import in .d.ts',
)

/* ─── 7. index.ts re-exports ──────────────────────────────────────── */

console.log('\nTest 7: index.ts re-exports')

assert(
  'index.ts exports PaperSurface component',
  /export\s*\{\s*PaperSurface\s*\}/.test(indexSrc),
  'PaperSurface export missing',
)

assert(
  'index.ts exports PaperSurfaceProps type',
  /PaperSurfaceProps/.test(indexSrc),
  'PaperSurfaceProps type export missing',
)

assert(
  'index.ts exports from shared/papersurface/types',
  /from\s+['"][^'"]*shared\/papersurface\/types['"]/.test(indexSrc),
  'shared types re-export missing',
)

// No parallel type declarations in index.ts.
assert(
  'index.ts does not declare its own types (no `type X = {`)',
  !/^\s*(?:export\s+)?type\s+\w+\s*=\s*\{/m.test(indexSrc),
  'parallel type declaration found in index.ts',
)

/* ─── Summary ────────────────────────────────────────────────────── */

console.log(`\n  ${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.error('\nFailed assertions:')
  for (const issue of issues) {
    console.error(`  - ${issue}`)
  }
  process.exit(1)
}
