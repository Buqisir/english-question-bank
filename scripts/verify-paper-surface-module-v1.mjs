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
 *      box-shadow / gradient inside the white paper sheet. The
 *      surrounding .ps-surface matte may use its Issue #43 desk
 *      gradient.
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

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function findCssRuleRange(src, selector) {
  const re = new RegExp(`(^|\\n)\\s*${escapeRegExp(selector)}\\s*\\{`)
  const match = re.exec(src)
  if (!match) return null

  const selectorStart = match.index + (match[1] ? match[1].length : 0)
  const openBrace = src.indexOf('{', selectorStart)
  if (openBrace < 0) return null

  let depth = 0
  for (let i = openBrace; i < src.length; i++) {
    const ch = src[i]
    if (ch === '{') depth++
    if (ch === '}') {
      depth--
      if (depth === 0) {
        return { start: selectorStart, openBrace, end: i + 1 }
      }
    }
  }
  return null
}

function readCssRuleBody(src, selector) {
  const range = findCssRuleRange(src, selector)
  if (!range) return ''
  return src.slice(range.openBrace + 1, range.end - 1)
}

function removeCssRule(src, selector) {
  const range = findCssRuleRange(src, selector)
  if (!range) return src
  return `${src.slice(0, range.start)}${src.slice(range.end)}`
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
  const candidates = ['github/main', 'origin/main', 'main']
  for (const ref of candidates) {
    try {
      const out = execSync(`git merge-base HEAD ${ref}`, {
        cwd: ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
        .toString()
        .trim()
      if (out) return out
    } catch {
      // Try the next remote/local candidate.
    }
  }
  return 'HEAD'
})()

const changed = safeGitDiffNames(`${baseRef}...HEAD`)

const ALLOWED_DOWNSTREAM_PAPER_INTELLIGENCE_FILES = new Set([
  'app/src/features/paper-intelligence/PaperIntelligencePaperSurfaceHarness.tsx',
  'app/src/features/paper-intelligence/adapter/index.ts',
  'app/src/features/paper-intelligence/adapter/piToPaperTextMap.ts',
  'app/src/features/paper-intelligence/insight/HarnessInsightPanelContent.tsx',
  'app/src/features/paper-intelligence/insight/insightChipLabel.ts',
  'app/src/features/paper-intelligence/insight/insightChipShortLabel.ts',
  'app/src/features/paper-intelligence/paperIntelligenceTypes.ts',
  'app/src/features/paper-intelligence/paperIntelligencePaperSurfaceHarness.css',
  // 刀⑤ render-fidelity Chunk A: the writing page mirrors PaperSurface's
  // own token-injection mechanism (it wraps PaperSurface as a child, so
  // it needs its own `--ps-*` CSS var injection — see tokens.mjs header).
  'app/src/features/paper-intelligence/WritingPaperPage.tsx',
  'app/src/features/paper-intelligence/writingPaperPage.css',
  // 刀⑤ render-fidelity Chunk E: dead-code removal (no route, self-only
  // referencing prototype folder + its stale verify script).
  'app/src/features/paper-intelligence/paperSurfacePrototype/PaperSurfacePrototype.tsx',
  'app/src/features/paper-intelligence/paperSurfacePrototype/paperSurfacePrototype.css',
])

// 刀⑤ render-fidelity Chunk B (PA-reviewed docs/cuts/render-fidelity/pa.md,
// F2 disposition): server/print-renderer.mjs is explicitly, plan-authorized
// to consume shared/papersurface/tokens.mjs + blankPattern.mjs and gain
// blank-marker / writing-box rendering. This is the FIRST authorized
// crossing of the historical "PaperSurface module never touches server/"
// boundary — narrowly scoped to this one file, not a blanket lift of the
// `^server\/` forbidden pattern.
const ALLOWED_DOWNSTREAM_SERVER_FILES = new Set([
  'server/print-renderer.mjs',
])

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
  const offenders = changed.filter((p) => {
    if (
      re.source === '^app\\/src\\/features\\/paper-intelligence\\/' &&
      ALLOWED_DOWNSTREAM_PAPER_INTELLIGENCE_FILES.has(p)
    ) {
      return false
    }
    if (re.source === '^server\\/' && ALLOWED_DOWNSTREAM_SERVER_FILES.has(p)) {
      return false
    }
    return re.test(p)
  })
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
// 刀⑤ render-fidelity Chunk A: --ps-passage-line-height / --ps-question-line-height
// are retired in favor of one unified --ps-line-height (standard v2 §3 fixed
// 18pt baseline, no passage/question split); --ps-font-size and the page
// margin vars are new consumers of the token migration.
const REQUIRED_CSS_VARS = [
  '--ps-font-stack',
  '--ps-ink',
  '--ps-font-size',
  '--ps-line-height',
  '--ps-passage-indent',
  '--ps-options-grid-columns',
  '--ps-options-grid-gap-x',
  '--ps-paper-blank-width',
  '--ps-page-margin-x',
  '--ps-page-margin-top',
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
  /line-height\s*:\s*1\.6\b/,
  /font-size\s*:\s*16px\b/,
  /padding\s*:\s*56px\b/,
]

for (const re of FORBIDDEN_CSS_LITERALS) {
  assert(
    `CSS does not hardcode token literal /${re.source}/`,
    !re.test(cssNoComments),
    'raw token literal found in CSS',
  )
}

const tokensSrc = readSrc('shared/papersurface/tokens.mjs')
const tokensDtsSrc = readSrc('shared/papersurface/tokens.d.ts')
const tokensDmtsSrc = readSrc('shared/papersurface/tokens.d.mts')
// 刀⑤ render-fidelity Chunk B: paperBlankPattern moved out of
// PaperSurface.tsx into shared/papersurface/blankPattern.mjs (server reuse,
// PA F2 / SW-3) — the literal now lives there, PaperSurface.tsx only imports it.
const blankPatternMjsSrc = readSrc('shared/papersurface/blankPattern.mjs')
const paperBlankRule = readCssRuleBody(cssSrc, '.ps-paper-blank')

assert(
  'PaperSurface tokens define paper blank width as 72px',
  /paperBlankWidth:\s*['"]72px['"]/.test(tokensSrc),
  'paperBlankWidth must stay at the 2024 JSLK calibrated 72px standard',
)
assert(
  'PaperSurface token declarations include paperBlankWidth',
  /readonly\s+paperBlankWidth:\s*string/.test(tokensDtsSrc) &&
    /readonly\s+paperBlankWidth:\s*string/.test(tokensDmtsSrc),
  'paperBlankWidth declaration missing from .d.ts or .d.mts',
)
assert(
  'PaperSurface injects paper blank width token',
  /--ps-paper-blank-width['"]?:\s*paperSurfaceTokens\.paperBlankWidth/.test(tsxSrc),
  'PaperSurface.tsx does not inject --ps-paper-blank-width',
)
assert(
  'PaperSurface.tsx imports paperBlankPattern from shared/papersurface/blankPattern.mjs (刀⑤ Chunk B)',
  /import\s*\{\s*paperBlankPattern\s*\}\s*from\s*['"][./]*shared\/papersurface\/blankPattern\.mjs['"]/.test(tsxSrc),
  'PaperSurface.tsx must import the shared paperBlankPattern, not redeclare it locally',
)
assert(
  'Paper blank renderer uses relaxed pattern (I10) — shared/papersurface/blankPattern.mjs',
  /export\s+const\s+paperBlankPattern\s*=\s*\/\(\?:_\{2,\}\|\[\\u0020\\u00A0\]\{2,\}\)\\s\*\(\\d\{1,3\}\)\\s\*\(\?:_\{2,\}\|\[\\u0020\\u00A0\]\{2,\}\)\/g/.test(blankPatternMjsSrc),
  'paperBlankPattern must match _{2,} or [\\u0020\\u00A0]{2,} around 1-3 digit number',
)
assert(
  'Paper blank consumes the width token',
  /width\s*:\s*var\(\s*--ps-paper-blank-width\s*\)/.test(paperBlankRule),
  '.ps-paper-blank must use var(--ps-paper-blank-width)',
)
assert(
  'Paper blank keeps centered tabular number on fixed line',
  /display\s*:\s*inline-flex/.test(paperBlankRule) &&
    /justify-content\s*:\s*center/.test(paperBlankRule) &&
    /font-variant-numeric\s*:\s*tabular-nums/.test(paperBlankRule) &&
    /text-indent\s*:\s*0/.test(paperBlankRule),
  '.ps-paper-blank must center the number without paragraph indent',
)
assert(
  'Paper blank does not use font-relative width',
  !/width\s*:\s*4\.5em/.test(paperBlankRule),
  'font-relative blank width would drift away from the 72px PaperSurface standard',
)

/* ─── 5. Visual hard requirements ─────────────────────────────────── */

console.log('\nTest 5: Visual hard requirements')

assert(
  'CSS sets page width 794px',
  /794px/.test(cssNoComments),
  '794px not found',
)

// 刀⑤ render-fidelity Chunk A: page padding is no longer a hardcoded 56px —
// it consumes the standard v2 §1 margin tokens (24mm/91px left-right,
// ≈21mm/79px top) via var(--ps-page-margin-x) / var(--ps-page-margin-top).
assert(
  'CSS sets page padding from the margin tokens (var(--ps-page-margin-top) var(--ps-page-margin-x))',
  /padding\s*:\s*var\(\s*--ps-page-margin-top\s*\)\s*var\(\s*--ps-page-margin-x\s*\)/.test(
    cssNoComments,
  ),
  'expected .ps-page padding to read var(--ps-page-margin-top) var(--ps-page-margin-x)',
)
assert(
  'tokens.mjs pins pageMarginX to 91px (24mm @ 794px/210mm)',
  /pageMarginX:\s*['"]91px['"]/.test(tokensSrc),
  'pageMarginX must be 91px per standard v2 §1',
)
assert(
  'tokens.mjs pins pageMarginTop to 79px (≈21mm @ 794px/210mm)',
  /pageMarginTop:\s*['"]79px['"]/.test(tokensSrc),
  'pageMarginTop must be 79px per standard v2 §1',
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

// Issue #43 intentionally added a subtle matte gradient on .ps-surface
// (the gray desk/paper-pad around the white page). The B3 invariant is
// narrower: the white .ps-page sheet itself must remain a clean paper
// surface, and no other PaperSurface selector may introduce gradients.
const psSurfaceRule = readCssRuleBody(cssNoComments, '.ps-surface')
const psPageRule = readCssRuleBody(cssNoComments, '.ps-page')
const cssWithoutPsSurface = removeCssRule(cssNoComments, '.ps-surface')

assert(
  '.ps-surface matte may own the only PaperSurface gradient',
  /gradient/.test(psSurfaceRule),
  '.ps-surface matte gradient missing',
)

assert(
  '.ps-page sheet does NOT introduce gradient',
  !/gradient/.test(psPageRule),
  'gradient found in .ps-page sheet',
)

assert(
  'No gradient outside the .ps-surface matte',
  !/gradient/.test(cssWithoutPsSurface),
  'gradient found outside .ps-surface matte',
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

/* ─── 5b. Question-block focus delegation (PR #39 QA fix) ────────── */

console.log('\nTest 5b: Question-block focus delegation (PR #39 QA fix)')

// Locate the PaperSurfaceQuestionItem function body so we can assert on
// the JSX that renders an individual question. The component is the
// single focus target for the whole question block (number + stem +
// options), implemented via event delegation on the outer <li>.
{
  const itemMatch = tsxNoComments.match(
    /function\s+PaperSurfaceQuestionItem\s*\([\s\S]*?\)\s*:\s*ReactNode\s*\{([\s\S]*?)\n\}\s*(?=\n|$)/,
  )

  assert(
    'PaperSurfaceQuestionItem function body is locatable',
    !!itemMatch,
    'could not find PaperSurfaceQuestionItem function body',
  )

  if (itemMatch) {
    const itemBody = itemMatch[1]

    // 1. Outer <li.ps-question> owns the focus click handler.
    //    The handler must call onQuestionClick(question.id) and live on
    //    the <li>, not on the inner <button>.
    //
    //    We can't use a naive `<li ...>` regex because the JSX attributes
    //    contain arrow functions (`() => onQuestionClick(...)`) whose
    //    `=>` sequence would terminate a non-greedy match too early.
    //    Instead, slice from `<li ` to the first un-nested `>` by
    //    tracking JSX expression brace depth.
    const liStart = itemBody.indexOf('<li')
    let liAttrs = ''
    if (liStart >= 0) {
      let depth = 0
      let i = liStart + 3
      while (i < itemBody.length) {
        const ch = itemBody[i]
        if (ch === '{') depth++
        else if (ch === '}') depth--
        else if (ch === '>' && depth === 0) break
        i++
      }
      liAttrs = itemBody.slice(liStart + 3, i)
    }
    assert(
      'PaperSurfaceQuestionItem renders an outer <li>',
      liStart >= 0 && liAttrs.length > 0,
      'no <li> opening tag inside PaperSurfaceQuestionItem',
    )
    assert(
      'Outer <li> uses className ps-question (with active modifier)',
      /ps-question/.test(liAttrs),
      'ps-question class missing on outer <li>',
    )
    assert(
      'Outer <li> owns onClick={() => onQuestionClick(question.id)}',
      /onClick\s*=\s*\{\s*\(\s*\)\s*=>\s*onQuestionClick\(\s*question\.id\s*\)\s*\}/.test(
        liAttrs,
      ),
      'outer <li> missing onClick={() => onQuestionClick(question.id)}',
    )

    // 2. <button.ps-question-stem-button> does NOT own a separate
    //    onClick. Without an own onClick, mouse + keyboard activations
    //    on the button still produce a click that bubbles to the <li>,
    //    and we avoid the double-toggle that an own + bubbled click
    //    would cause.
    //
    //    Use the same depth-tracking trick to slice the <button>
    //    opening tag's attributes safely.
    const buttonStart = itemBody.indexOf('<button')
    let buttonAttrs = ''
    if (buttonStart >= 0) {
      let depth = 0
      let i = buttonStart + 7
      while (i < itemBody.length) {
        const ch = itemBody[i]
        if (ch === '{') depth++
        else if (ch === '}') depth--
        else if (ch === '>' && depth === 0) break
        i++
      }
      buttonAttrs = itemBody.slice(buttonStart + 7, i)
    }
    assert(
      'PaperSurfaceQuestionItem renders the stem <button>',
      buttonStart >= 0 && buttonAttrs.length > 0,
      'no <button> inside PaperSurfaceQuestionItem',
    )
    assert(
      'Stem <button> uses className ps-question-stem-button',
      /ps-question-stem-button/.test(buttonAttrs),
      'ps-question-stem-button class missing',
    )
    assert(
      'Stem <button> does NOT own its own onClick (keyboard click bubbles to <li>)',
      !/onClick\s*=/.test(buttonAttrs),
      'stem button still owns an onClick handler — double toggle risk',
    )
    assert(
      'Stem <button> stays focusable / accessible (still aria-pressed + aria-label)',
      /aria-pressed/.test(buttonAttrs) && /aria-label/.test(buttonAttrs),
      'stem button accessibility attributes lost',
    )

    // 3. PaperSurfaceOptionList is rendered INSIDE the <li>, so option
    //    clicks bubble to the question item delegate.
    assert(
      'PaperSurfaceOptionList is rendered inside PaperSurfaceQuestionItem',
      /<PaperSurfaceOptionList\b/.test(itemBody),
      'PaperSurfaceOptionList not rendered inside PaperSurfaceQuestionItem',
    )

    // 4. No new state hook is introduced inside PaperSurfaceQuestionItem.
    //    (The whole module-wide useState/useReducer ban is already
    //    asserted above; this guard is targeted at the QA fix scope to
    //    catch a regression that adds local state to mediate the
    //    delegation.)
    assert(
      'PaperSurfaceQuestionItem introduces no new state hook',
      !/\b(useState|useReducer)\s*[<(]/.test(itemBody),
      'state hook found inside PaperSurfaceQuestionItem',
    )
  }

  // 5. PaperSurfaceOptionList renders options as plain <li> rows, not
  //    as <button>s. The whole question block is one focus delegate;
  //    options must NOT carry answer-selection semantics.
  const optionListMatch = tsxNoComments.match(
    /function\s+PaperSurfaceOptionList\s*\([\s\S]*?\)\s*:\s*ReactNode\s*\{([\s\S]*?)\n\}\s*(?=\n|$)/,
  )
  assert(
    'PaperSurfaceOptionList function body is locatable',
    !!optionListMatch,
    'could not find PaperSurfaceOptionList function body',
  )
  if (optionListMatch) {
    const optionBody = optionListMatch[1]
    assert(
      'Each option is rendered as a plain <li> (not a <button>)',
      /<li\b/.test(optionBody) && !/<button\b/.test(optionBody),
      'option rendered as <button> — answer-selection semantics leaked',
    )
    assert(
      'PaperSurfaceOptionList does not call onQuestionClick directly',
      !/onQuestionClick/.test(optionBody),
      'option list calls onQuestionClick — must rely on event bubbling',
    )
    assert(
      'PaperSurfaceOptionList does not attach its own onClick to options',
      !/onClick\s*=/.test(optionBody),
      'option list attaches its own onClick — must rely on bubbling',
    )
  }
}

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
