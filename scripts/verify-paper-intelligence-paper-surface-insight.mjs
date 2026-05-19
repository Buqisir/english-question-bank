#!/usr/bin/env node
/**
 * verify-paper-intelligence-paper-surface-insight.mjs
 *
 * Issue #21-C4 PaperSurface Insight Parity — static verify script.
 *
 * Updated for PR #52 PA must-fix (replaces top horizontal sticky
 * chip strip with a left insight rail and a warm full-bleed right
 * analysis surface; see
 * `docs/product/mockups/paper-surface-c4-insight-layout/`).
 *
 * What this script asserts (in order):
 *
 *   1. PaperSurface boundary — PaperSurface.tsx, PaperSurface.css, and
 *      shared/papersurface/** are NOT changed by C4. PaperSurface emits
 *      no `data-pi-*`. The neutral anchorKeys module is unchanged.
 *
 *   2. Harness wiring — harness queries `[data-paper-section]`, owns
 *      `activeInsightSection` state, clears it inside the
 *      `request-lecture-focus` branch, imports `AnchoredPopover` from
 *      `preview/AnchoredPopover`, uses `closeOnEscape`, does NOT pass
 *      `closeOnOutsidePointerDown={true}`, still hardcodes
 *      `mode="lecture"`, and renders chips that carry
 *      `data-pi-insight-chip` but no `data-paper-*`.
 *
 *      Plus PR #52 PA must-fix:
 *        - 2h: rail toggle is a real <button> with aria-expanded /
 *          aria-controls / aria-label. Rail aside emits
 *          `data-rail-locked` and `data-rail-detail-open`. Esc
 *          inside the rail closes inline detail first, then clears
 *          the lock.
 *        - 2i: matchMedia('(min-width: 1536px)') + isWideDesktop
 *          state conditionally renders wide-desktop rail XOR topbar
 *          chip row (Q1 invariant: chips never double-rendered). The
 *          harness also tracks `(max-width:1199px)` for stacked shell
 *          CSS. The change handler clears activeInsightSection AND
 *          railLocked so anchors cannot resolve to an unmounting node
 *          on breakpoint cross.
 *
 *   3. AnchoredPopover file is unchanged.
 *
 *   4. Insight modules are presentational / pure — no fetch, no
 *      storage (localStorage / sessionStorage / indexedDB / cookie),
 *      no router imports, no PaperSurface imports.
 *
 *   5. Default PI route files are unchanged — PaperIntelligencePreview.tsx,
 *      paperIntelligence.css, preview/paperIntelligencePreviewModel.ts,
 *      preview/paperIntelligenceEvidenceLine*, evidence/**, adapter/**,
 *      paperIntelligenceRoute.ts, App.tsx.
 *
 *   6. Harness CSS:
 *        - 6a: 3-column no-right-gutter grid, 24px column-gap, 1199px stacked
 *          fallback, pi-line-overlay rule, C3.6 support/trap palette
 *          rules, chip + popover existence, popover z-index above
 *          line.
 *        - 6b: PR #52 PA must-fix — left rail rule exists, is left-
 *          pinned, collapsed 48px, soft-expanded 160-180px on :hover
 *          and :focus-within, detail-open 260-320px, z-index ordered
 *          between line and popover,
 *          and the legacy `.pi-ps-insight-chip-strip` is gone from
 *          BOTH the CSS rules AND the TSX className references.
 *        - 6c: PR #52 PA must-fix — right-panel ::before bleed
 *          reaches viewport edge via `100vw` / `calc(...)`, content
 *          inner wrapper max-width is 380-420px, the right-panel
 *          inner wrapper is rendered by TSX, warm cream tokens
 *          (#f7f4ee / #f6f3ec) are declared, and stacked mode
 *          disables both the bleed and the rail.
 *        - 6d: PR #52 PA must-fix — rail/chip palette discipline.
 *          No support green, no trap amber, no red, no bright blue,
 *          no brand purple, no gradient inside rail / chip rules.
 *
 *   7. Forbidden scopes untouched — server/, package files / lockfiles,
 *      reading-analysis/, basket / paperAssembly, App.tsx, route parser.
 *
 * What this script does NOT assert:
 *   - The C3 / C3.6 evidence-line wiring. That lives in
 *     `verify-paper-intelligence-paper-surface-evidence.mjs`.
 *   - The C1 / C2 harness boundary. That lives in
 *     `verify-paper-intelligence-paper-surface-harness.mjs`.
 *
 * Run: node scripts/verify-paper-intelligence-paper-surface-insight.mjs
 */

import { readFileSync, existsSync, statSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { resolve, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const APP = join(ROOT, 'app', 'src')

const HARNESS_PATH = join(
  APP,
  'features',
  'paper-intelligence',
  'PaperIntelligencePaperSurfaceHarness.tsx',
)
const HARNESS_CSS_PATH = join(
  APP,
  'features',
  'paper-intelligence',
  'paperIntelligencePaperSurfaceHarness.css',
)
const PAPER_SURFACE_TSX = join(APP, 'shared-ui', 'papersurface', 'PaperSurface.tsx')
const PAPER_SURFACE_CSS = join(APP, 'shared-ui', 'papersurface', 'PaperSurface.css')
const SHARED_PS_ANCHOR_KEYS_MJS = join(ROOT, 'shared', 'papersurface', 'anchorKeys.mjs')
const ANCHORED_POPOVER_PATH = join(
  APP,
  'features',
  'paper-intelligence',
  'preview',
  'AnchoredPopover.tsx',
)
const INSIGHT_DIR = join(APP, 'features', 'paper-intelligence', 'insight')
const INSIGHT_LABEL_PATH = join(INSIGHT_DIR, 'insightChipLabel.ts')
const INSIGHT_PANEL_PATH = join(INSIGHT_DIR, 'HarnessInsightPanelContent.tsx')

let passes = 0
let failures = 0

function assert(condition, message) {
  if (condition) {
    passes++
    console.log(`  PASS  ${message}`)
  } else {
    failures++
    console.error(`  FAIL  ${message}`)
  }
}

function readFile(path) {
  return readFileSync(path, 'utf-8')
}

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

/* ─── Diff helpers (github/main → origin/main → main fallback) ─── */

function safeGitDiffNames(args) {
  try {
    return execSync(`git diff --name-only ${args}`, {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
      .toString()
      .trim()
      .split('\n')
      .filter(Boolean)
  } catch {
    return []
  }
}

const baseRef = (() => {
  /*
   * The candidate order is intentional:
   *
   *   1. `github/main` / `origin/main` — the normal post-merge scope.
   *      Once Issue #21-C3.6 (PR #50) and this C4 PR have both
   *      landed on main, every ancestor #50 file lives on main and
   *      drops out of the diff naturally.
   *
   *   2. `origin/c3-6-papersurface-evidence-kind-color-semantics` —
   *      the temporary "feature-stack" base. C4 is built on top of
   *      the C3.6 branch (PR #50) before #50 has merged, so when
   *      this script runs locally on the C4 branch the script
   *      should diff against the C3.6 tip rather than main; otherwise
   *      every #50 file (PaperSurface.css, paperIntelligenceEvidenceLine.tsx,
   *      etc.) is mis-flagged as a C4 offender. This candidate sits
   *      AFTER the main candidates so that once #50 merges and main
   *      catches up, the script naturally re-targets main; if the
   *      stale C3.6 branch is later deleted on the remote the loop
   *      simply skips this candidate.
   *
   *   3. `main` — local fallback.
   */
  const candidates = [
    'github/main',
    'origin/main',
    'main',
    'origin/c3-6-papersurface-evidence-kind-color-semantics',
  ]
  // Pick the candidate whose merge-base with HEAD is latest (the
  // shortest diff window). This makes "feature stack" bases win over
  // main when the stack hasn't merged yet, and main win once it has.
  let bestBase = null
  let bestTimestamp = -Infinity
  for (const ref of candidates) {
    try {
      const out = execSync(`git merge-base HEAD ${ref}`, {
        cwd: ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
        .toString()
        .trim()
      if (!out) continue
      const ts = parseInt(
        execSync(`git show -s --format=%ct ${out}`, {
          cwd: ROOT,
          stdio: ['ignore', 'pipe', 'pipe'],
        })
          .toString()
          .trim(),
        10,
      )
      if (Number.isFinite(ts) && ts > bestTimestamp) {
        bestTimestamp = ts
        bestBase = out
      }
    } catch {
      // try the next candidate
    }
  }
  return bestBase || 'HEAD'
})()

const changed = new Set()
for (const f of safeGitDiffNames(`${baseRef}...HEAD`)) changed.add(f)
for (const f of safeGitDiffNames('HEAD')) changed.add(f)
try {
  const untracked = execSync('git ls-files --others --exclude-standard', {
    cwd: ROOT,
    encoding: 'utf-8',
  })
    .split('\n')
    .filter(Boolean)
  for (const f of untracked) changed.add(f)
} catch {
  /* ignore */
}
const changedFiles = [...changed]

function isUnchanged(relPath) {
  return !changedFiles.some((f) => f === relPath)
}

function isAnyUnderUnchanged(prefix) {
  return !changedFiles.some((f) => f.startsWith(prefix))
}

/* ─── 1. PaperSurface boundary ───────────────────────────────────── */

console.log('\n=== 1. PaperSurface boundary ===')

assert(
  isUnchanged('app/src/shared-ui/papersurface/PaperSurface.tsx'),
  "PaperSurface.tsx is NOT changed by C4",
)
assert(
  isUnchanged('app/src/shared-ui/papersurface/PaperSurface.css'),
  "PaperSurface.css is NOT changed by C4",
)
assert(
  isAnyUnderUnchanged('shared/papersurface/'),
  "shared/papersurface/** is NOT changed by C4",
)
assert(
  isUnchanged('shared/papersurface/anchorKeys.mjs'),
  "shared/papersurface/anchorKeys.mjs is NOT changed by C4",
)

// PaperSurface still emits no data-pi-*.
{
  const paperSurfaceSrc = readFile(PAPER_SURFACE_TSX)
  const paperSurfaceNoComments = stripComments(paperSurfaceSrc)
  assert(
    !/data-pi-/.test(paperSurfaceNoComments),
    "PaperSurface.tsx emits no data-pi-* (PaperSurface stays dumb in C4)",
  )
}

/* ─── 2. Harness wiring ──────────────────────────────────────────── */

console.log('\n=== 2. Harness wiring ===')

const harnessSrc = readFile(HARNESS_PATH)
const harnessNoComments = stripComments(harnessSrc)

// 2a. Harness queries the PaperSurface section anchor.
assert(
  /querySelector(?:All)?\s*<[^>]*>\s*\(\s*[`'"]\s*\[data-paper-section/.test(
    harnessNoComments,
  ) ||
    /querySelector(?:All)?\s*\(\s*[`'"]\s*\[data-paper-section/.test(harnessNoComments),
  "harness queries `[data-paper-section]` (uses the existing PaperSurface section anchor)",
)
// And does NOT introduce a new `data-paper-*` attribute (only the
// existing `[data-paper-section]` and `[data-paper-evidence-id]` are
// allowed). We grep for any `data-paper-X = / data-paper-X="` shape
// that isn't one of those two.
{
  const knownPaperAttrs = new Set([
    'data-paper-section',
    'data-paper-evidence-id',
    'data-paper-evidence-kind',
    'data-paper-question-id',
    'data-paper-quote-text-only',
  ])
  const matches = [
    ...harnessNoComments.matchAll(/\bdata-paper-[a-z][a-z0-9-]*/g),
  ].map((m) => m[0])
  const offenders = matches.filter((m) => !knownPaperAttrs.has(m))
  assert(
    offenders.length === 0,
    `harness does NOT introduce a new data-paper-* attribute (offenders: ${
      offenders.join(', ') || 'none'
    })`,
  )
}

// 2b. activeInsightSection state is owned by the harness.
assert(
  /\[\s*activeInsightSection\s*,\s*setActiveInsightSection\s*\]\s*=\s*useState\s*<\s*string\s*\|\s*null\s*>\s*\(\s*null\s*\)/.test(
    harnessSrc,
  ),
  "harness owns `activeInsightSection: string | null` state via useState",
)

// 2c. request-lecture-focus clears activeInsightSection.
//
// We require the `setActiveInsightSection(null)` call to live inside
// the same handler block as the `intent.kind === 'request-lecture-
// focus'` guard so a future regression that moves the clear out of
// that branch (e.g. into a different intent) fails this script.
{
  const focusBlockMatch = harnessNoComments.match(
    /intent\.kind\s*===\s*['"]request-lecture-focus['"][\s\S]*?(?:\n\s*\}\s*\n\s*\/\/\s*Other intents|return\s|^\s*\}\s*$)/m,
  )
  // Fall back: at least scan inside the handleFocusIntent body.
  const handlerMatch =
    focusBlockMatch ||
    harnessNoComments.match(
      /handleFocusIntent\s*=\s*useCallback\s*\(\s*\([\s\S]*?\)\s*=>\s*\{([\s\S]*?)\n\s*\}\s*,\s*\[/,
    )
  const handlerBody = handlerMatch ? handlerMatch[0] : ''
  assert(
    /setActiveInsightSection\s*\(\s*null\s*\)/.test(handlerBody),
    "harness clears activeInsightSection inside the request-lecture-focus handler block",
  )
}

// 2c-bis. Right-panel evidence/distractor click does NOT clear
// activeInsightSection. We check that handleSelectEvidence does not
// call setActiveInsightSection at all.
{
  const handleSelectMatch = harnessNoComments.match(
    /handleSelectEvidence\s*=\s*useCallback\s*\(\s*\([\s\S]*?\)\s*=>\s*\{([\s\S]*?)\}\s*,\s*\[/,
  )
  const handleSelectBody = handleSelectMatch ? handleSelectMatch[1] : ''
  assert(
    !!handleSelectMatch,
    "handleSelectEvidence callback is locatable",
  )
  assert(
    !/setActiveInsightSection\b/.test(handleSelectBody),
    "handleSelectEvidence does NOT clear activeInsightSection (insight stays open across right-panel evidence/distractor clicks)",
  )
}

// 2d. AnchoredPopover is no longer used for the left structure rail.
assert(
  !/import\s*\{\s*AnchoredPopover\s*\}\s*from\s*['"]\.\/preview\/AnchoredPopover['"]/.test(
    harnessSrc,
  ) && !/<AnchoredPopover\b/.test(harnessNoComments),
  "harness does NOT import/render AnchoredPopover for the left structure rail",
)

// 2e. Esc-to-close behavior is handled by handleRailKeyDown; closeOnOutsidePointerDown={true} NOT used.
assert(
  /handleRailKeyDown/.test(harnessNoComments) && /Escape/.test(harnessNoComments),
  "harness uses Escape key handling via handleRailKeyDown (closeOnEscape equivalent behavior)",
)
assert(
  !/closeOnOutsidePointerDown\s*=\s*\{\s*true\s*\}/.test(harnessNoComments) &&
    !/closeOnOutsidePointerDown(?!\s*=)/.test(harnessNoComments) &&
    // Also reject the bare boolean attribute form: `closeOnOutsidePointerDown` (truthy by default).
    !/<AnchoredPopover\b[^>]*\bcloseOnOutsidePointerDown\b(?!\s*=\s*\{\s*false\s*\})/.test(
      harnessNoComments,
    ),
  "harness does NOT pass closeOnOutsidePointerDown={true} (matches default PI insight intentional behavior)",
)

// 2f. Chip carries data-pi-insight-chip and not data-paper-*.
{
  /*
   * Extract the JSX `<button … data-pi-insight-chip=…>` opening tag
   * by:
   *   1. Locating the `data-pi-insight-chip` attribute in source.
   *   2. Walking backward to the nearest `<button` token.
   *   3. Walking forward from the attribute, balancing `{` and `}`
   *      so we don't trip on a `>` inside a JSX expression like
   *      `as RefObject<HTMLButtonElement>`.
   *
   * The brace-balanced walk is necessary because `<button>` opening
   * tags in this file legitimately contain `>` characters inside JSX
   * `{…}` expressions (TypeScript generics, comparison operators,
   * etc.), and a naive `<button[^>]*>` regex stops at the first such
   * `>` and misses the rest of the tag.
   */
  function extractChipOpeningTag(src) {
    const attrIdx = src.indexOf('data-pi-insight-chip')
    if (attrIdx < 0) return null
    const buttonStart = src.lastIndexOf('<button', attrIdx)
    if (buttonStart < 0) return null
    let i = attrIdx
    let depth = 0
    while (i < src.length) {
      const ch = src[i]
      if (ch === '{') depth++
      else if (ch === '}') depth = Math.max(0, depth - 1)
      else if (ch === '>' && depth === 0) {
        return src.slice(buttonStart, i + 1)
      }
      i++
    }
    return null
  }

  const chipTag = extractChipOpeningTag(harnessNoComments)
  assert(
    chipTag !== null && /^<button\b/.test(chipTag),
    "harness renders a `<button data-pi-insight-chip=...>` (host-owned chip identity)",
  )
  const tag = chipTag || ''
  assert(
    !/\bdata-paper-/.test(tag),
    "chip `<button>` does NOT carry any `data-paper-*` attribute",
  )
  // Real <button> + a11y plumbing.
  assert(
    /\baria-expanded\s*=\s*\{/.test(tag),
    "chip `<button>` has aria-expanded",
  )
  assert(
    /\baria-controls\s*=\s*\{/.test(tag),
    "chip `<button>` has aria-controls",
  )
  assert(
    /\baria-label\s*=\s*\{/.test(tag),
    "chip `<button>` has an aria-label (readable label binding)",
  )
}

// 2g. Harness still hardcodes mode="lecture".
assert(
  /\bmode\s*=\s*['"]lecture['"]/.test(harnessSrc),
  "harness still hardcodes `mode=\"lecture\"` on PaperSurface (no reading-mode flip in C4)",
)

/*
 * 2h. PR #52 PA must-fix — left rail wiring.
 *
 * The rail's leading toggle button must be a real <button> with
 * aria-expanded / aria-controls / aria-label. Each chip's a11y
 * plumbing is asserted in 2f above; this block focuses on the
 * NEW toggle that drives the lock state.
 */
console.log('\n=== 2h. PR #52 PA must-fix — rail wiring ===')

assert(
  /className\s*=\s*['"]pi-ps-insight-rail-toggle['"]/.test(harnessNoComments),
  "harness renders a `.pi-ps-insight-rail-toggle` element",
)
{
  // Extract the rail toggle <button> opening tag with the same
  // brace-balanced walk used for the chip in 2f.
  function extractRailToggleTag(src) {
    const attrIdx = src.indexOf('pi-ps-insight-rail-toggle')
    if (attrIdx < 0) return null
    const buttonStart = src.lastIndexOf('<button', attrIdx)
    if (buttonStart < 0) return null
    let i = attrIdx
    let depth = 0
    while (i < src.length) {
      const ch = src[i]
      if (ch === '{') depth++
      else if (ch === '}') depth = Math.max(0, depth - 1)
      else if (ch === '>' && depth === 0) {
        return src.slice(buttonStart, i + 1)
      }
      i++
    }
    return null
  }
  const toggleTag = extractRailToggleTag(harnessNoComments)
  assert(
    toggleTag !== null && /^<button\b/.test(toggleTag),
    "rail toggle is a real `<button>` (not a div / role hack)",
  )
  const tag = toggleTag || ''
  assert(
    /\baria-expanded\s*=\s*\{/.test(tag),
    "rail toggle has aria-expanded",
  )
  assert(
    /\baria-controls\s*=\s*['"][^'"]+['"]/.test(tag),
    "rail toggle has aria-controls (references the rail list region)",
  )
  assert(
    /\baria-label\s*=\s*\{/.test(tag),
    "rail toggle has an aria-label",
  )
}

// 2h-bis. The rail aside carries the lock + detail-open hooks the
// CSS reads to keep the rail expanded across hover / focus loss.
assert(
  /data-rail-locked\s*=\s*\{/.test(harnessNoComments),
  "rail aside emits `data-rail-locked` so CSS can keep the rail expanded after toggle click",
)
assert(
  /data-rail-detail-open\s*=\s*\{/.test(harnessNoComments),
  "rail aside emits `data-rail-detail-open` so the rail expands to detail width while inline detail is open (PR #52 retune)",
)

// 2h-ter. Esc inside the rail clears the lock and closes the popover.
{
  const onKeyDownMatch = harnessNoComments.match(
    /handleRailKeyDown\s*=\s*useCallback\s*\(\s*\([\s\S]*?\)[^{]*\{([\s\S]*?)\}\s*,\s*\[/,
  )
  const body = onKeyDownMatch ? onKeyDownMatch[1] : ''
  assert(
    /e\.key\s*(?:===|!==)\s*['"]Escape['"]/.test(body),
    "handleRailKeyDown handles the Escape key",
  )
  assert(
    /setRailLocked\s*\(\s*false\s*\)/.test(body),
    "handleRailKeyDown clears the rail lock on Escape",
  )
  assert(
    /setActiveInsightSection\s*\(\s*null\s*\)/.test(body),
    "handleRailKeyDown closes the open insight popover on Escape",
  )
}

/*
 * 2i. PR #52 PA must-fix — matchMedia responsive detection.
 *
 * The harness uses `matchMedia('(min-width: 1536px)')` + state to
 * gate inline detail (wide desktop only). It also tracks
 * `(max-width:1199px)` for stacked-mode drawer styling.
 * PA-approved rule: the rail is always in the DOM; matchMedia
 * only controls detail-surface selection, NOT rail mount.
 * The change handler clears `activeInsightSection`
 * AND `railLocked` so AnchoredPopover's anchorRef cannot resolve to
 * a stale position on breakpoint cross.
 */
console.log('\n=== 2i. PR #52 PA must-fix — matchMedia responsive switch ===')

assert(
  /matchMedia\s*\(\s*['"]\s*\(\s*max-width\s*:\s*1199px\s*\)\s*['"]/.test(
    harnessSrc,
  ),
  "harness wires matchMedia(`(max-width: 1199px)`) for stacked-mode detection",
)
assert(
  /\b(?:setIsStackedMode|isStackedMode)\b/.test(harnessSrc),
  "harness owns an `isStackedMode` state used for responsive detail-surface selection",
)
assert(
  /matchMedia\s*\(\s*['"]\s*\(\s*min-width\s*:\s*1536px\s*\)\s*['"]/.test(
    harnessSrc,
  ),
  "harness wires matchMedia(`(min-width: 1536px)`) for wide-desktop inline-detail gating",
)
assert(
  /\b(?:setIsWideDesktop|isWideDesktop)\b/.test(harnessSrc),
  "harness owns an `isWideDesktop` state used for inline-detail vs popover detail selection",
)

// matchMedia onChange handler clears the popover and the rail lock.
{
  /*
   * Find the matchMedia effect block. We accept either of two
   * shapes the harness might use:
   *   1. A named handler (`onChange`) inside the effect.
   *   2. An inline arrow listener passed to addEventListener.
   * Both must call `setActiveInsightSection(null)` and
   * `setRailLocked(false)` somewhere in the effect body so the
   * popover / lock are cleared on breakpoint cross.
   */
  const mqlEffectMatch = harnessNoComments.match(
    /matchMedia\s*\([\s\S]*?addEventListener[\s\S]*?\}/,
  )
  const effectBody = mqlEffectMatch ? mqlEffectMatch[0] : ''
  // Fall back to a wider search if the regex didn't catch it.
  const haystack =
    /setActiveInsightSection\s*\(\s*null\s*\)/.test(effectBody) &&
    /setRailLocked\s*\(\s*false\s*\)/.test(effectBody)
      ? effectBody
      : harnessNoComments

  assert(
    /matchMedia[\s\S]{0,2000}?setActiveInsightSection\s*\(\s*null\s*\)/.test(
      haystack,
    ),
    "matchMedia change handler clears activeInsightSection (Q1 invariant: avoid stale popover anchor on breakpoint cross)",
  )
  assert(
    /matchMedia[\s\S]{0,2000}?setRailLocked\s*\(\s*false\s*\)/.test(haystack),
    "matchMedia change handler clears railLocked (Q1 invariant: rail lock does not survive breakpoint cross)",
  )
}

// 2i-bis. PA-approved: no topbar chip row; rail always in DOM.
assert(
  !/pi-ps-insight-topbar-row/.test(harnessNoComments),
  "harness does NOT render any `.pi-ps-insight-topbar-row` (PA-approved: insight always on the left)",
)
assert(
  !/!\s*isWideDesktop\s*&&\s*\([\s\S]*?pi-ps-insight-topbar-row/.test(
    harnessNoComments,
  ),
  "no topbar fallback conditional for insight chips (PA-approved: insight always left)",
)
// Rail is NOT gated by isWideDesktop — it renders unconditionally.
assert(
  /className\s*=\s*['"]pi-ps-insight-rail['"]/.test(harnessNoComments),
  ".pi-ps-insight-rail exists in TSX (always rendered)",
)
assert(
  !/isWideDesktop\s*&&\s*\([\s\S]{0,80}?pi-ps-insight-rail\b/.test(harnessNoComments),
  "desktop left rail is NOT gated by `isWideDesktop &&` (rail always in DOM at every viewport)",
)

/* ─── 3. AnchoredPopover unchanged ───────────────────────────────── */

console.log('\n=== 3. AnchoredPopover unchanged ===')

assert(
  isUnchanged(
    'app/src/features/paper-intelligence/preview/AnchoredPopover.tsx',
  ),
  "preview/AnchoredPopover.tsx file itself is NOT changed by C4",
)

/* ─── 4. Insight modules — presentational / pure ─────────────────── */

console.log('\n=== 4. Insight modules pure ===')

assert(
  existsSync(INSIGHT_LABEL_PATH),
  "insight/insightChipLabel.ts exists",
)
assert(
  existsSync(INSIGHT_PANEL_PATH),
  "insight/HarnessInsightPanelContent.tsx exists",
)

const insightFiles = []
if (existsSync(INSIGHT_LABEL_PATH)) insightFiles.push(INSIGHT_LABEL_PATH)
if (existsSync(INSIGHT_PANEL_PATH)) insightFiles.push(INSIGHT_PANEL_PATH)

for (const path of insightFiles) {
  const src = readFile(path)
  const noComments = stripComments(src)
  const rel = path.replace(`${ROOT}/`, '')
  // No fetch.
  assert(
    !/\bfetch\s*\(/.test(noComments),
    `${rel}: no fetch()`,
  )
  // No storage.
  assert(
    !/\b(localStorage|sessionStorage)\b/.test(noComments) &&
      !/\bindexedDB\b/.test(noComments) &&
      !/\bdocument\.cookie\b/.test(noComments),
    `${rel}: no localStorage / sessionStorage / indexedDB / document.cookie`,
  )
  // No router imports.
  assert(
    !/from\s+['"]react-router/.test(noComments) &&
      !/from\s+['"][^'"]*\/router(?:['"/])/.test(noComments) &&
      !/\buseRouter\b/.test(noComments) &&
      !/\buseNavigate\b/.test(noComments) &&
      !/\buseLocation\b/.test(noComments) &&
      !/\buseSearchParams\b/.test(noComments),
    `${rel}: no router imports / hooks`,
  )
  // No PaperSurface imports.
  assert(
    !/from\s+['"][^'"]*shared-ui\/papersurface/.test(noComments) &&
      !/from\s+['"][^'"]*shared\/papersurface/.test(noComments),
    `${rel}: no PaperSurface imports (harness stays one-way)`,
  )
}

// HarnessInsightPanelContent has no useState / useEffect / useRef
// (pure presentational guard).
{
  const panelSrc = readFile(INSIGHT_PANEL_PATH)
  const panelNoComments = stripComments(panelSrc)
  assert(
    !/\buseState\s*\(/.test(panelNoComments) &&
      !/\buseEffect\s*\(/.test(panelNoComments) &&
      !/\buseRef\s*\(/.test(panelNoComments) &&
      !/\buseMemo\s*\(/.test(panelNoComments) &&
      !/\buseCallback\s*\(/.test(panelNoComments),
    "HarnessInsightPanelContent.tsx is pure presentational (no useState/useEffect/useRef/useMemo/useCallback)",
  )
  assert(
    !/reportPassage\.loads\b|reportPassage\.keyChunks\b|pi-ps-insight-loads|pi-ps-insight-chunks/.test(
      panelNoComments,
    ),
    "HarnessInsightPanelContent renders only passage structure (no load bars / chunk summary)",
  )
}

{
  const labelSrc = readFile(INSIGHT_LABEL_PATH)
  const labelNoComments = stripComments(labelSrc)
  assert(
    !/\bloads\b|\bkeyChunks\b|负荷|证据|词块/.test(labelNoComments),
    "insightChipLabel uses only passage-structure language (no load/evidence/chunk signals)",
  )

  const shortLabelSrc = readFile(
    'app/src/features/paper-intelligence/insight/insightChipShortLabel.ts',
  )
  const shortLabelNoComments = stripComments(shortLabelSrc)
  assert(
    !/\bloads\b|\bkeyChunks\b|负荷|证据|词块/.test(shortLabelNoComments),
    "insightChipShortLabel uses only passage-structure language (no load/evidence/chunk signals)",
  )
}

/* ─── 5. Default PI route files unchanged ────────────────────────── */

console.log('\n=== 5. Default PI route unchanged ===')

const forbiddenDefaultRouteFiles = [
  'app/src/features/paper-intelligence/PaperIntelligencePreview.tsx',
  'app/src/features/paper-intelligence/paperIntelligence.css',
  'app/src/features/paper-intelligence/preview/AnchoredPopover.tsx',
  'app/src/features/paper-intelligence/preview/paperIntelligencePreviewModel.ts',
  'app/src/features/paper-intelligence/paperIntelligenceRoute.ts',
  'app/src/App.tsx',
]
for (const f of forbiddenDefaultRouteFiles) {
  assert(isUnchanged(f), `${f} is NOT changed by C4`)
}

// preview/paperIntelligenceEvidenceLine* (component + geometry).
{
  const evidenceLineFiles = changedFiles.filter((f) =>
    /^app\/src\/features\/paper-intelligence\/preview\/paperIntelligenceEvidenceLine/.test(
      f,
    ),
  )
  assert(
    evidenceLineFiles.length === 0,
    `no preview/paperIntelligenceEvidenceLine* files changed (offenders: ${
      evidenceLineFiles.join(', ') || 'none'
    })`,
  )
}

assert(
  isAnyUnderUnchanged('app/src/features/paper-intelligence/evidence/'),
  "evidence/** is NOT changed by C4",
)
assert(
  isAnyUnderUnchanged('app/src/features/paper-intelligence/adapter/'),
  "adapter/** is NOT changed by C4",
)

/* ─── 6. Harness CSS preserved ───────────────────────────────────── */

console.log('\n=== 6. Harness CSS preserved ===')

const harnessCss = readFile(HARNESS_CSS_PATH)
const harnessCssNoComments = stripComments(harnessCss)

/*
 * Several PR #52 PA must-fix rules also have stacked-mode overrides
 * inside `@media (max-width: 1199px) { ... }` blocks. The override
 * for `.pi-ps-insight-rail` literally is `{ display: none }`, and
 * it appears earlier in the file than the desktop rule — so a naive
 * `\.pi-ps-insight-rail\s*\{([\s\S]*?)\}` regex captures the
 * override's body and fails the assertions about `position`,
 * `left`, `width`, `z-index`, etc.
 *
 * `harnessCssDesktopOnly` is the source with every
 * `@media (...)` block (and its body) removed via brace-balanced
 * walk. All "desktop rule body" extractions below run against this
 * stripped string. The original `harnessCssNoComments` stays
 * available for the stacked-mode assertions (which use
 * `extractAllStackedBodies` further down).
 */
function stripAllMediaBlocks(src) {
  let out = ''
  let cursor = 0
  while (cursor < src.length) {
    const at = src.indexOf('@media', cursor)
    if (at < 0) {
      out += src.slice(cursor)
      break
    }
    out += src.slice(cursor, at)
    const open = src.indexOf('{', at)
    if (open < 0) break
    let depth = 1
    let i = open + 1
    while (i < src.length && depth > 0) {
      if (src[i] === '{') depth++
      else if (src[i] === '}') depth--
      i++
    }
    cursor = i
  }
  return out
}
const harnessCssDesktopOnly = stripAllMediaBlocks(harnessCssNoComments)

assert(
  /grid-template-columns:\s*[\s\S]*?minmax\(\s*0\s*,\s*1fr\s*\)\s*[\s\S]*?minmax\(\s*0\s*,\s*858px\s*\)\s*[\s\S]*?minmax\(\s*0\s*,\s*380px\s*\)/.test(
    harnessCssNoComments,
  ),
  "harness CSS still declares the workspace grid (1fr / 858px paper / 380px rail — right gutter eliminated by PR #52 retune)",
)
assert(
  /column-gap:\s*24px/.test(harnessCssNoComments),
  "harness CSS still uses column-gap: 24px",
)
assert(
  /@media\s*\(\s*max-width:\s*1199px\s*\)/.test(harnessCssNoComments),
  "harness CSS still has the 1199px stacked fallback",
)
assert(
  /\.pi-ps-harness-shell\s+\.pi-line-overlay\s*\{/.test(harnessCssNoComments),
  "harness CSS still scopes the .pi-line-overlay rule under .pi-ps-harness-shell (C3 evidence-line overlay preserved)",
)
// C3.6 support / trap palette rules — keep both kind selectors.
assert(
  /\.pi-line-path--support\b|\.pi-line-path\[data-pi-evidence-kind="support"\]/.test(
    harnessCssNoComments,
  ),
  "harness CSS still has the C3.6 support line rule",
)
assert(
  /\.pi-line-path--trap\b|\.pi-line-path\[data-pi-evidence-kind="trap"\]/.test(
    harnessCssNoComments,
  ),
  "harness CSS still has the C3.6 trap line rule",
)

// Insight-specific CSS additions are present (chip + popover).
assert(
  /\.pi-ps-insight-chip\b/.test(harnessCssNoComments),
  "harness CSS declares the .pi-ps-insight-chip rule (C4 chip)",
)
assert(
  /\.pi-ps-insight-panel\b/.test(harnessCssNoComments),
  "harness CSS declares the .pi-ps-insight-panel rule (C4 popover)",
)
// Popover paints above the line overlay.
const panelMatch = harnessCssNoComments.match(
  /\.pi-ps-insight-panel\s*\{([\s\S]*?)\}/,
)
const panelBody = panelMatch ? panelMatch[1] : ''
{
  const z = (panelBody.match(/z-index:\s*(\d+)/) || [])[1]
  assert(
    !!z && parseInt(z, 10) > 5,
    `.pi-ps-insight-panel z-index (${z ?? 'missing'}) sits strictly above .pi-line-overlay (z-index 5)`,
  )
}

/*
 * C4 PR #52 PA must-fix — left insight rail (replaces top strip).
 *
 * The sticky horizontal `.pi-ps-insight-chip-strip` was rejected by
 * PA review for PR #52: it competed with the paper reading area and
 * the right side still read as cool admin off-white. The fix moved
 * insight to a compact left rail living `position: absolute` inside
 * `.pi-ps-harness-shell`, with the right panel painting a warm
 * full-bleed background to the viewport edge.
 *
 * Asserts (in order):
 *
 *   1. The rail rule exists and is left-pinned (absolute / fixed,
 *      `left: 0`).
 *   2. Collapsed width is 48px.
 *   3. Soft-expanded width is 160-180px, via `:hover`,
 *      `:focus-within`, and a locked-state hook the rail toggle
 *      can drive; inline-detail width is 260-320px.
 *   4. Rail z-index ordering: rail sits below the popover, above
 *      the line overlay (popover always paints above; line draws
 *      under the rail).
 *   5. Top sticky horizontal chip strip is GONE — neither the CSS
 *      rule nor the TSX className remain in the harness.
 *   6. Right analysis aside paints a `::before` full-bleed reaching
 *      the viewport edge with `50vw` / `calc(...)`. Stacked mode
 *      disables the bleed.
 *   7. Right analysis content stays readable (`.pi-ps-harness-right-inner`
 *      max-width 380-420px).
 *   8. Stacked fallback hides the absolute rail (`display: none`)
 *      so the topbar chip row owns insight entry without competing
 *      DOM.
 *   9. Rail / chip palette discipline: no support green, no trap
 *      amber, no red, no bright blue, no brand purple, no gradient
 *      anywhere inside rail / chip-scoped rules. Reserved palettes
 *      stay reserved for evidence semantics.
 */

console.log('\n=== 6b. PR #52 PA must-fix — left rail ===')

// 6b.1 Rail rule exists and is left-pinned.
const railMatch = harnessCssDesktopOnly.match(
  /\.pi-ps-insight-rail\s*\{([\s\S]*?)\}/,
)
assert(!!railMatch, ".pi-ps-insight-rail rule exists in harness CSS")
const railBody = railMatch ? railMatch[1] : ''
assert(
  /\bposition\s*:\s*(?:absolute|fixed|sticky)\b/.test(railBody),
  ".pi-ps-insight-rail uses absolute / fixed / sticky positioning (left-pinned, not in flow)",
)
assert(
  /\bleft\s*:\s*0(?:px|\.0+)?\b/.test(railBody),
  ".pi-ps-insight-rail anchors to the left edge (left: 0)",
)

// 6b.2 Collapsed width is 48px.
assert(
  /\bwidth\s*:\s*48px\b/.test(railBody),
  ".pi-ps-insight-rail collapsed width is 48px",
)

// 6b.3 Expanded width 160-180px via :hover AND :focus-within.
assert(
  /\.pi-ps-insight-rail:hover\b/.test(harnessCssNoComments),
  ".pi-ps-insight-rail expands on :hover (mouse soft expand)",
)
assert(
  /\.pi-ps-insight-rail:focus-within\b/.test(harnessCssNoComments),
  ".pi-ps-insight-rail expands on :focus-within (keyboard soft expand)",
)
{
  // Find the combined :hover / :focus-within / lock selector body
  // and check the width inside it (State 2: 160-180px).
  const expandedBlockRe =
    /\.pi-ps-insight-rail:(?:hover|focus-within|\[data-rail-(?:locked|detail-open)='true'\])(?:\s*,\s*\.pi-ps-insight-rail(?::hover|:focus-within|\[data-rail-(?:locked|detail-open)='true'\]))*\s*\{([\s\S]*?)\}/
  const expandedMatch = harnessCssNoComments.match(expandedBlockRe)
  const expandedBody = expandedMatch ? expandedMatch[1] : ''
  const expandedW = (expandedBody.match(/\bwidth\s*:\s*(\d+)px\b/) || [])[1]
  const expandedNum = expandedW ? parseInt(expandedW, 10) : NaN
  assert(
    Number.isFinite(expandedNum) && expandedNum >= 160 && expandedNum <= 180,
    `.pi-ps-insight-rail hover/focus width is 160-180px (got ${expandedW ?? 'missing'}px)`,
  )
}

// 6b.3-bis. Detail-open width is viewport-clamped for 100% zoom.
{
  const detailOpenRe =
    /\.pi-ps-insight-rail\[data-rail-detail-open='true'\]\s*\{([\s\S]*?)\}/
  const detailOpenMatch = harnessCssNoComments.match(detailOpenRe)
  const detailOpenBody = detailOpenMatch ? detailOpenMatch[1] : ''
  assert(
    /width\s*:\s*clamp\(\s*200px\s*,\s*calc\(\s*100vw\s*-\s*1230px\s*\)\s*,\s*300px\s*\)/.test(
      detailOpenBody,
    ),
    ".pi-ps-insight-rail detail-open width is clamp(200px, calc(100vw - 1230px), 300px)",
  )
}

// 6b.4 Rail z-index ordering.
const railZ = (railBody.match(/z-index:\s*(\d+)/) || [])[1]
assert(
  !!railZ,
  `.pi-ps-insight-rail declares an explicit z-index (got ${railZ ?? 'missing'})`,
)
{
  const panelZ = (panelBody.match(/z-index:\s*(\d+)/) || [])[1]
  assert(
    !!railZ &&
      !!panelZ &&
      parseInt(railZ, 10) < parseInt(panelZ, 10),
    `.pi-ps-insight-rail z-index (${railZ ?? 'missing'}) sits strictly below .pi-ps-insight-panel z-index (${panelZ ?? 'missing'})`,
  )
  assert(
    !!railZ && parseInt(railZ, 10) > 5,
    `.pi-ps-insight-rail z-index (${railZ ?? 'missing'}) sits above .pi-line-overlay (z-index 5) so the cross-column line draws under the rail`,
  )
}

// 6b.5 No top sticky horizontal chip strip remains, AND no topbar row.
assert(
  !/\.pi-ps-insight-chip-strip\b/.test(harnessCssNoComments),
  "harness CSS does NOT declare a `.pi-ps-insight-chip-strip` rule (PR #52 PA must-fix: top horizontal strip removed)",
)
assert(
  !/pi-ps-insight-chip-strip/.test(harnessNoComments),
  "harness TSX does NOT render any `pi-ps-insight-chip-strip` element (PR #52 PA must-fix: top horizontal strip removed)",
)
// PA-approved: no topbar insight row in CSS or TSX.
assert(
  !/\.pi-ps-insight-topbar-row\s*\{/.test(harnessCssNoComments),
  "harness CSS does NOT declare a `.pi-ps-insight-topbar-row` rule (PA-approved: insight always left)",
)
assert(
  !/pi-ps-insight-topbar-row/.test(harnessNoComments),
  "harness TSX does NOT render any `pi-ps-insight-topbar-row` element (PA-approved: insight always left)",
)
// PA-approved: .pi-ps-insight-rail is NOT display:none at any breakpoint.
assert(
  !/\.pi-ps-insight-rail\s*\{[^}]*display\s*:\s*none/.test(harnessCssNoComments),
  ".pi-ps-insight-rail is NOT `display:none` at any breakpoint (PA-approved: always visible)",
)

console.log('\n=== 6c. PR #52 PA must-fix — right-panel full-bleed ===')

// 6c.1 Right-panel ::before pseudo exists.
const rightBleedMatch = harnessCssDesktopOnly.match(
  /\.pi-ps-harness-right::before\s*\{([\s\S]*?)\}/,
)
assert(
  !!rightBleedMatch,
  ".pi-ps-harness-right::before pseudo-element rule exists (warm full-bleed background)",
)
const rightBleedBody = rightBleedMatch ? rightBleedMatch[1] : ''

// 6c.2 Bleed reaches viewport edge via `100vw` / `50vw` / `calc(...)`.
assert(
  /100vw\b/.test(rightBleedBody) || /50vw\b/.test(rightBleedBody),
  "right-panel bleed reaches the viewport edge (uses 100vw / 50vw)",
)
assert(
  /\bcalc\s*\(/.test(rightBleedBody),
  "right-panel bleed uses `calc(...)` so the painted width adapts to viewport",
)

// 6c.3 Inner content max-width 380-420px (analysis text stays readable).
const rightInnerMatch = harnessCssDesktopOnly.match(
  /\.pi-ps-harness-right-inner\s*\{([\s\S]*?)\}/,
)
assert(
  !!rightInnerMatch,
  ".pi-ps-harness-right-inner rule exists (constrains analysis content width)",
)
{
  const innerBody = rightInnerMatch ? rightInnerMatch[1] : ''
  const innerMaxW = (innerBody.match(/\bmax-width\s*:\s*(\d+)px\b/) || [])[1]
  const innerNum = innerMaxW ? parseInt(innerMaxW, 10) : NaN
  assert(
    Number.isFinite(innerNum) && innerNum >= 380 && innerNum <= 420,
    `.pi-ps-harness-right-inner max-width is 380-420px (got ${innerMaxW ?? 'missing'}px)`,
  )
}

// 6c.4 Right-panel inner wrapper is rendered by the harness TSX.
assert(
  /pi-ps-harness-right-inner/.test(harnessSrc),
  "harness TSX renders the .pi-ps-harness-right-inner wrapper around AnalysisPanel",
)

// 6c.5 Bleed uses warm cream / paper tone (not cool SaaS off-white).
{
  // Pull the warm cream tokens out of the .pi-ps-harness root rule.
  // The palette is exposed as CSS custom properties so callers can
  // see a single source of truth for "the warm tone is X".
  const rootMatch = harnessCssDesktopOnly.match(
    /\.pi-ps-harness\s*\{([\s\S]*?)\}/,
  )
  const rootBody = rootMatch ? rootMatch[1] : ''
  // PR #52 retune: --pi-ps-assistant-bg is the unified token.
  // The bleed start/end tokens now reference it via var().
  assert(
    /--pi-ps-assistant-bg\s*:\s*#f8f6f1\b/i.test(rootBody) ||
      /--pi-ps-assistant-bg\s*:\s*#f7f4ee\b/i.test(rootBody),
    "unified assistant-layer token (--pi-ps-assistant-bg) is warm white (#f8f6f1 or #f7f4ee)",
  )
  assert(
    /--pi-ps-paper-bleed-start\s*:/.test(rootBody),
    "warm bleed start token (--pi-ps-paper-bleed-start) is declared",
  )
  assert(
    /--pi-ps-paper-bleed-end\s*:/.test(rootBody),
    "warm bleed end token (--pi-ps-paper-bleed-end) is declared",
  )
  // Negative: cool SaaS off-white must NOT be the right-panel
  // background.
  const rightMainMatch = harnessCssDesktopOnly.match(
    /\.pi-ps-harness-right\s*\{([\s\S]*?)\}/,
  )
  const rightMainBody = rightMainMatch ? rightMainMatch[1] : ''
  const cool = /#fafbfc\b|#f8f9fa\b|#f5f6f7\b|#eef0f2\b/i
  assert(
    !cool.test(rightMainBody) && !cool.test(rightBleedBody),
    "right-panel does NOT use cool SaaS off-white (#fafbfc / #f8f9fa / #f5f6f7 / #eef0f2)",
  )
}

// 6c.6 Stacked fallback (≤1199px) disables the bleed and the rail.
{
  /*
   * The CSS legitimately has more than one `@media (max-width: 1199px)`
   * block (one for the original shell column collapse, one for
   * `.pi-line-overlay { display: none }`, plus the new PR #52 block
   * for rail + bleed). We extract every body that matches and
   * concat them so the assertion finds rules across all of them.
   */
  function extractAllStackedBodies(src) {
    const out = []
    let cursor = 0
    while (cursor < src.length) {
      const at = src.indexOf('@media', cursor)
      if (at < 0) break
      const close = src.indexOf(')', at)
      if (close < 0) break
      const header = src.slice(at, close + 1)
      if (!/max-width\s*:\s*1199px/.test(header)) {
        cursor = close + 1
        continue
      }
      const open = src.indexOf('{', close)
      if (open < 0) break
      let depth = 1
      let i = open + 1
      while (i < src.length && depth > 0) {
        if (src[i] === '{') depth++
        else if (src[i] === '}') depth--
        i++
      }
      out.push(src.slice(open + 1, i - 1))
      cursor = i
    }
    return out.join('\n')
  }
  const stackedBody = extractAllStackedBodies(harnessCssNoComments)
  assert(
    /\.pi-ps-harness-right::before\s*\{[^}]*display\s*:\s*none/.test(
      stackedBody,
    ),
    "stacked mode (max-width: 1199px) disables the .pi-ps-harness-right::before bleed",
  )
  // PA-approved: rail is NOT display:none at any breakpoint.
  assert(
    !/\.pi-ps-insight-rail\s*\{[^}]*display\s*:\s*none/.test(stackedBody),
    "stacked mode does NOT hide .pi-ps-insight-rail (PA-approved: rail always visible on the left)",
  )
  // Instead, rail uses position:fixed in stacked mode.
  assert(
    /\.pi-ps-insight-rail\s*\{[^}]*position\s*:\s*fixed/.test(stackedBody),
    "stacked mode makes .pi-ps-insight-rail position:fixed (left handle/drawer)",
  )
}

console.log('\n=== 6d. PR #52 PA must-fix — palette discipline ===')

/*
 * Palette discipline applies to rail + chip CSS rules ONLY. The
 * line overlay (`.pi-line-path[--support|--trap]`) legitimately uses
 * mint green and trap amber and lives in the same file; we skip
 * those selectors.
 *
 * Strategy: walk every top-level rule in the harness CSS, keep the
 * rules whose selector matches `.pi-ps-insight-rail` or
 * `.pi-ps-insight-chip` (excluding `.pi-ps-insight-chip-strip`,
 * which is asserted gone above), concat the bodies, and run grep
 * negatives over the concat.
 */
{
  const railScopedSrc = (() => {
    const parts = []
    const ruleRe = /([^{}]+?)\{([^{}]*)\}/g
    let m
    while ((m = ruleRe.exec(harnessCssNoComments)) !== null) {
      const sel = m[1].trim()
      // We accept both standalone and combined-selector forms
      // (e.g. `.pi-ps-insight-rail:hover, .pi-ps-insight-rail:focus-within`).
      if (
        /\.pi-ps-insight-rail\b/.test(sel) ||
        /\.pi-ps-insight-rail-/.test(sel) ||
        // chip selector but NOT the (now-forbidden) chip-strip
        (/\.pi-ps-insight-chip\b/.test(sel) &&
          !/\.pi-ps-insight-chip-strip\b/.test(sel))
      ) {
        parts.push(m[2])
      }
    }
    return parts.join('\n')
  })()

  // Reserved palette negatives.
  assert(
    !/#10b981\b/i.test(railScopedSrc) &&
      !/rgba\s*\(\s*16\s*,\s*185\s*,\s*129\s*,/i.test(railScopedSrc) &&
      !/#2a7c4f\b/i.test(railScopedSrc),
    "rail/chip CSS does NOT use mint / support green (reserved for answer evidence)",
  )
  assert(
    !/#f59e0b\b/i.test(railScopedSrc) &&
      !/rgba\s*\(\s*245\s*,\s*158\s*,\s*11\s*,/i.test(railScopedSrc) &&
      !/#d97706\b/i.test(railScopedSrc),
    "rail/chip CSS does NOT use trap amber (reserved for distractor source)",
  )
  // Red shades (Tailwind reds + common pure red) — reserved for
  // future "student got the question wrong" semantics.
  assert(
    !/#dc2626\b/i.test(railScopedSrc) &&
      !/#ef4444\b/i.test(railScopedSrc) &&
      !/#f87171\b/i.test(railScopedSrc) &&
      !/#b91c1c\b/i.test(railScopedSrc) &&
      !/#ff0000\b/i.test(railScopedSrc) &&
      !/(?<![\w-])(?:red|crimson|tomato|firebrick)\b/i.test(railScopedSrc),
    "rail/chip CSS does NOT use red (reserved for future student-wrong semantics)",
  )
  // Bright / cool blues — admin-dashboard tone the PA review
  // explicitly rejected.
  assert(
    !/#3b82f6\b/i.test(railScopedSrc) &&
      !/#2563eb\b/i.test(railScopedSrc) &&
      !/#1d4ed8\b/i.test(railScopedSrc) &&
      !/#60a5fa\b/i.test(railScopedSrc) &&
      !/#0ea5e9\b/i.test(railScopedSrc),
    "rail/chip CSS does NOT use bright / cool blue (PA review rejected blue admin tone)",
  )
  // Brand purples.
  assert(
    !/#8b5cf6\b/i.test(railScopedSrc) &&
      !/#7c3aed\b/i.test(railScopedSrc) &&
      !/#a855f7\b/i.test(railScopedSrc) &&
      !/#6d28d9\b/i.test(railScopedSrc),
    "rail/chip CSS does NOT use brand purple",
  )
  // Gradients are explicitly disallowed by PA review (rail must
  // read as quiet pencil, not AI-toy fill).
  assert(
    !/\blinear-gradient\s*\(/i.test(railScopedSrc) &&
      !/\bradial-gradient\s*\(/i.test(railScopedSrc) &&
      !/\bconic-gradient\s*\(/i.test(railScopedSrc),
    "rail/chip CSS does NOT use any gradient",
  )
}

/* ─── 7. Forbidden scopes untouched ──────────────────────────────── */

console.log('\n=== 7. Forbidden scopes untouched ===')

assert(
  isAnyUnderUnchanged('server/'),
  "no server/ changes",
)
assert(
  !changedFiles.some(
    (f) =>
      f === 'package.json' ||
      f === 'pnpm-lock.yaml' ||
      f === 'package-lock.json' ||
      f === 'app/package.json' ||
      f === 'app/pnpm-lock.yaml',
  ),
  "no package.json / lockfile changes",
)
assert(
  isAnyUnderUnchanged('app/src/features/reading-analysis/'),
  "no reading-analysis/ changes",
)
assert(
  !changedFiles.some(
    (f) =>
      f.includes('paperAssembly') ||
      (f.includes('basket') && !f.includes('BasketPreviewItem')),
  ),
  "no basket / paperAssembly changes",
)
assert(
  isUnchanged('app/src/App.tsx'),
  "App.tsx is NOT changed by C4 (route default unchanged)",
)
assert(
  isUnchanged(
    'app/src/features/paper-intelligence/paperIntelligenceRoute.ts',
  ),
  "paperIntelligenceRoute.ts is NOT changed by C4",
)
assert(
  isAnyUnderUnchanged('app/src/concierge/'),
  "no concierge/ changes",
)

// Sanity: every changed file is in the C4 allow-list.
const allowedC4 = new Set([
  'app/src/features/paper-intelligence/PaperIntelligencePaperSurfaceHarness.tsx',
  'app/src/features/paper-intelligence/paperIntelligencePaperSurfaceHarness.css',
  'app/src/features/paper-intelligence/insight/insightChipLabel.ts',
  'app/src/features/paper-intelligence/insight/insightChipShortLabel.ts',
  'app/src/features/paper-intelligence/insight/HarnessInsightPanelContent.tsx',
  'scripts/verify-paper-intelligence-paper-surface-harness.mjs',
  'scripts/verify-paper-intelligence-paper-surface-insight.mjs',
  'scripts/verify-paper-intelligence-paper-surface-evidence.mjs',
  'scripts/verify-paper-surface-module-v1.mjs',
  'docs/paper-surface-watch-ledger.md',
  'docs/product/mockups/paper-surface-c4-insight-layout/01-current-problem.png',
  'docs/product/mockups/paper-surface-c4-insight-layout/02-target-default.png',
  'docs/product/mockups/paper-surface-c4-insight-layout/03-left-rail-expanded.png',
  'docs/product/mockups/paper-surface-c4-insight-layout/04-before-after.png',
  'docs/product/mockups/paper-surface-c4-insight-layout/README.md',
])
const unexpected = changedFiles.filter((f) => !allowedC4.has(f))
assert(
  unexpected.length === 0,
  `no files changed outside the C4 allow-list (unexpected: ${
    unexpected.join(', ') || 'none'
  })`,
)

/* ─── R-checks: PR #52 UX Retune product guards ─────────────────── */

console.log('\n=== R-checks: PR #52 UX Retune product guards ===')

/*
 * R-1. Inline detail renders whenever a passage is active. The 100%
 *      zoom bug was caused by gating detail out of the medium desktop
 *      band, so this guard rejects that old shape.
 */
assert(
  /data-rail-detail-open\s*=\s*\{\s*activeInsightSection\s*\?\s*['"]true['"]\s*:\s*undefined\s*\}/.test(
    harnessNoComments,
  ) && !/!isMediumDesktop\s*&&\s*activeInsightSection/.test(harnessNoComments),
  "R-1: data-rail-detail-open follows activeInsightSection directly (no medium-desktop no-detail gate)",
)

/*
 * R-2. `.pi-ps-insight-detail` inline block exists in TSX.
 */
assert(
  /pi-ps-insight-detail/.test(harnessNoComments),
  "R-2: `.pi-ps-insight-detail` inline block exists in TSX",
)

/*
 * R-3. Hover/focus rail width is 160–180px.
 * (Already validated in 6b.3 above — re-confirm here for product guard.)
 */
{
  const expandedBlockRe =
    /\.pi-ps-insight-rail:(?:hover|focus-within)(?:\s*,\s*\.pi-ps-insight-rail(?::hover|:focus-within|\[data-rail-locked='true'\]))*\s*\{([\s\S]*?)\}/
  const expandedMatch = harnessCssNoComments.match(expandedBlockRe)
  const expandedBody = expandedMatch ? expandedMatch[1] : ''
  const expandedW = (expandedBody.match(/\bwidth\s*:\s*(\d+)px\b/) || [])[1]
  const expandedNum = expandedW ? parseInt(expandedW, 10) : NaN
  assert(
    Number.isFinite(expandedNum) && expandedNum >= 160 && expandedNum <= 180,
    `R-3: hover/focus rail width is 160–180px (got ${expandedW ?? 'missing'}px)`,
  )
}

/*
 * R-4. Detail-open rail width is viewport-clamped.
 */
{
  const detailOpenRe =
    /\.pi-ps-insight-rail\[data-rail-detail-open='true'\]\s*\{([\s\S]*?)\}/
  const detailOpenMatch = harnessCssNoComments.match(detailOpenRe)
  const detailOpenBody = detailOpenMatch ? detailOpenMatch[1] : ''
  assert(
    /width\s*:\s*clamp\(\s*200px\s*,\s*calc\(\s*100vw\s*-\s*1230px\s*\)\s*,\s*300px\s*\)/.test(
      detailOpenBody,
    ),
    "R-4: detail-open rail width uses clamp(200px, calc(100vw - 1230px), 300px)",
  )
}

/*
 * R-5. Rail has overflow-y:auto so inline detail scrolls within rail.
 */
assert(
  /overflow-y\s*:\s*auto/.test(railBody),
  "R-5: .pi-ps-insight-rail has overflow-y:auto",
)

/*
 * R-6. Esc behavior is two-phase: detail first, lock second.
 * Verify handleRailKeyDown checks activeInsightSection before railLocked.
 */
{
  const onKeyDownMatch = harnessNoComments.match(
    /handleRailKeyDown\s*=\s*useCallback\s*\(\s*\([\s\S]*?\)[^{]*\{([\s\S]*?)\}\s*,\s*\[/,
  )
  const body = onKeyDownMatch ? onKeyDownMatch[1] : ''
  const detailIdx = body.indexOf('activeInsightSection')
  const lockIdx = body.indexOf('setRailLocked')
  assert(
    detailIdx >= 0 && lockIdx >= 0 && detailIdx < lockIdx,
    "R-6: Esc handles activeInsightSection (detail) before railLocked (two-phase)",
  )
}

/*
 * R-7. `buildInsightChipShortLabel` is NOT used (chips are icon-only).
 */
assert(
  !/buildInsightChipShortLabel/.test(harnessNoComments),
  "R-7: `buildInsightChipShortLabel` is NOT imported (chips show only A/B/C/D)",
)

/*
 * R-8. `.pi-ps-insight-detail` border-radius <= 8px.
 */
{
  const detailRuleMatch = harnessCssDesktopOnly.match(
    /\.pi-ps-insight-detail\s*\{([\s\S]*?)\}/,
  )
  const detailRuleBody = detailRuleMatch ? detailRuleMatch[1] : ''
  const radiusMatch = detailRuleBody.match(/\bborder-radius\s*:\s*(\d+)px\b/)
  const radiusVal = radiusMatch ? parseInt(radiusMatch[1], 10) : NaN
  assert(
    Number.isFinite(radiusVal) && radiusVal <= 8,
    `R-8: .pi-ps-insight-detail border-radius <= 8px (got ${radiusVal}px)`,
  )
}

/*
 * R-9. Desktop rail labels/details do NOT rely on ellipsis/text-overflow
 *      to hide meaningful insight text.
 */
{
  // Check that no rule scoped to the rail or chip uses text-overflow: ellipsis.
  const railScopedAll = (() => {
    const parts = []
    const ruleRe = /([^{}]+?)\{([^{}]*)\}/g
    let m
    while ((m = ruleRe.exec(harnessCssNoComments)) !== null) {
      const sel = m[1].trim()
      if (
        /\.pi-ps-insight-rail\b/.test(sel) ||
        /\.pi-ps-insight-chip\b/.test(sel) ||
        /\.pi-ps-insight-detail\b/.test(sel)
      ) {
        parts.push(m[2])
      }
    }
    return parts.join('\n')
  })()
  assert(
    !/text-overflow\s*:\s*ellipsis/.test(railScopedAll),
    "R-9: rail/chip/detail CSS does NOT use text-overflow:ellipsis",
  )
}

/*
 * R-10. Detail-open state keeps all A/B/C/D controls in the DOM and
 *       visibly represented in TSX/CSS; no detail state that replaces
 *       the entire list.
 *
 * Strategy: the renderInsightChip function is called for every
 * passage regardless of which one is active (the map iterates all
 * passages and each chip stays in the DOM).
 */
assert(
  /report\.passages\.map\s*\(/.test(harnessNoComments),
  "R-10: all passages are mapped (A/B/C/D controls stay in DOM during detail-open)",
)
// The detail block appears INSIDE the map iteration, not as a replacement.
assert(
  /report\.passages\.map[\s\S]*?pi-ps-insight-detail/.test(harnessNoComments),
  "R-10: inline detail is rendered inside the passages map (not replacing the list)",
)

/*
 * R-11. Structure detail block is rendered inside
 *       `.pi-ps-insight-rail`, not portalled and not positioned as a
 *       fixed overlay.
 */
{
  assert(
    /className\s*=\s*["']pi-ps-insight-rail["'][\s\S]*?pi-ps-insight-detail/.test(
      harnessNoComments,
    ) &&
      /activeInsightSection\s*===\s*p\.paperSection[\s\S]*?pi-ps-insight-detail/.test(
        harnessNoComments,
      ),
    "R-11: .pi-ps-insight-detail renders inside the rail for the active passage",
  )
  // Detail CSS does NOT use position: fixed.
  const detailRuleMatch = harnessCssDesktopOnly.match(
    /\.pi-ps-insight-detail\s*\{([\s\S]*?)\}/,
  )
  const detailRuleBody = detailRuleMatch ? detailRuleMatch[1] : ''
  assert(
    !/position\s*:\s*fixed/.test(detailRuleBody),
    "R-11: .pi-ps-insight-detail is NOT position:fixed (inline, not overlay)",
  )
}

/*
 * R-12. `.pi-ps-insight-panel` / AnchoredPopover is not used for
 *       passage structure; detail is inline inside the left rail.
 */
assert(
  !/<AnchoredPopover\b/.test(harnessNoComments) &&
    !/className\s*=\s*["']pi-ps-insight-panel["']/.test(harnessNoComments),
  "R-12: AnchoredPopover / .pi-ps-insight-panel is not rendered for passage structure",
)

/*
 * R-13. Insight rail and right analysis full-bleed background share the
 *       same assistant-layer color variable/token.
 */
{
  const rootMatch = harnessCssDesktopOnly.match(
    /\.pi-ps-harness\s*\{([\s\S]*?)\}/,
  )
  const rootBody = rootMatch ? rootMatch[1] : ''
  // Rail bg references the assistant token.
  assert(
    /--pi-ps-insight-rail-bg\s*:\s*var\(\s*--pi-ps-assistant-bg\s*\)/.test(rootBody),
    "R-13: --pi-ps-insight-rail-bg references --pi-ps-assistant-bg (shared token)",
  )
  // Bleed start/end reference the assistant token.
  assert(
    /--pi-ps-paper-bleed-start\s*:\s*var\(\s*--pi-ps-assistant-bg\s*\)/.test(rootBody) ||
      /--pi-ps-paper-bleed-end\s*:\s*var\(\s*--pi-ps-assistant-bg\s*\)/.test(rootBody),
    "R-13: bleed tokens reference --pi-ps-assistant-bg (unified warm layer)",
  )
}

/*
 * R-14. The assistant-layer color is warm white / soft paper, not cool
 *       slate and not saturated yellow/brown.
 */
{
  const rootMatch = harnessCssDesktopOnly.match(
    /\.pi-ps-harness\s*\{([\s\S]*?)\}/,
  )
  const rootBody = rootMatch ? rootMatch[1] : ''
  const assistantBgMatch = rootBody.match(
    /--pi-ps-assistant-bg\s*:\s*(#[0-9a-fA-F]{6})\b/,
  )
  const hex = assistantBgMatch ? assistantBgMatch[1].toLowerCase() : ''
  // Parse to RGB and ensure it's warm white (high lightness, slight warm tint).
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const isWarmWhite =
    r >= 240 && g >= 240 && b >= 230 && r >= b && (r - b) <= 15
  assert(
    isWarmWhite,
    `R-14: --pi-ps-assistant-bg (${hex}) is warm white / soft paper (RGB: ${r},${g},${b})`,
  )
}

/*
 * R-15. Rail CSS does not use support green, trap amber, red, bright
 *       blue, purple, neon, or gradients.
 * (Re-validates 6d palette discipline — explicit product guard label.)
 */
{
  const railScopedSrc = (() => {
    const parts = []
    const ruleRe = /([^{}]+?)\{([^{}]*)\}/g
    let m
    while ((m = ruleRe.exec(harnessCssNoComments)) !== null) {
      const sel = m[1].trim()
      if (
        /\.pi-ps-insight-rail\b/.test(sel) ||
        /\.pi-ps-insight-rail-/.test(sel) ||
        /\.pi-ps-insight-detail\b/.test(sel) ||
        (/\.pi-ps-insight-chip\b/.test(sel) &&
          !/\.pi-ps-insight-chip-strip\b/.test(sel))
      ) {
        parts.push(m[2])
      }
    }
    return parts.join('\n')
  })()
  const forbidden =
    /#10b981\b|#2a7c4f\b|#f59e0b\b|#d97706\b|#dc2626\b|#ef4444\b|#3b82f6\b|#2563eb\b|#8b5cf6\b|#7c3aed\b/i
  assert(
    !forbidden.test(railScopedSrc),
    "R-15: rail/detail CSS does not use reserved semantic colors",
  )
  assert(
    !/\blinear-gradient\s*\(/i.test(railScopedSrc) &&
      !/\bradial-gradient\s*\(/i.test(railScopedSrc),
    "R-15: rail/detail CSS does not use gradients",
  )
}

/*
 * R-16. Right analysis content width remains bounded (max-width ~400px);
 *       full-bleed affects background only, not text measure.
 */
{
  const rightInnerMatch = harnessCssDesktopOnly.match(
    /\.pi-ps-harness-right-inner\s*\{([\s\S]*?)\}/,
  )
  const innerBody = rightInnerMatch ? rightInnerMatch[1] : ''
  const innerMaxW = (innerBody.match(/\bmax-width\s*:\s*(\d+)px\b/) || [])[1]
  const innerNum = innerMaxW ? parseInt(innerMaxW, 10) : NaN
  assert(
    Number.isFinite(innerNum) && innerNum >= 380 && innerNum <= 420,
    `R-16: .pi-ps-harness-right-inner max-width is 380-420px (got ${innerMaxW ?? 'missing'}px)`,
  )
}

/*
 * R-17. Workspace shell no longer leaves a right gray gutter at desktop
 *       width: verify the right background bleed reaches viewport edge
 *       via CSS (`right: calc(...)`, `100vw`, or equivalent).
 *
 * Strategy: the grid no longer has a 4th 1fr column (right gutter removed),
 * AND the right ::before bleed uses 100vw or calc to reach the edge.
 */
{
  // Grid must NOT have a 4th `1fr` track after the 380px track.
  const gridRule = harnessCssDesktopOnly.match(
    /\.pi-ps-harness-shell\s*\{([\s\S]*?)\}/,
  )
  const gridBody = gridRule ? gridRule[1] : ''
  // Count 1fr occurrences in grid-template-columns.
  const gridColsMatch = gridBody.match(
    /grid-template-columns\s*:([\s\S]*?);/,
  )
  const gridColsValue = gridColsMatch ? gridColsMatch[1] : ''
  const frCount = (gridColsValue.match(/1fr/g) || []).length
  assert(
    frCount === 1,
    `R-17: grid has only 1 flexible (1fr) track — no right gutter (found ${frCount} 1fr tracks)`,
  )
  // Right bleed reaches viewport edge.
  assert(
    /100vw\b/.test(rightBleedBody) || /50vw\b/.test(rightBleedBody),
    "R-17: right ::before bleed uses 100vw/50vw to reach viewport edge",
  )
}

/* ─── PA-approved: insight-always-left verify guards ─────────────── */

console.log('\n=== PA: insight always lives on the left ===')

/*
 * PA-1. No `.pi-ps-insight-topbar-row` in TSX (active code).
 */
assert(
  !/pi-ps-insight-topbar-row/.test(harnessNoComments),
  "PA-1: no .pi-ps-insight-topbar-row in TSX active code",
)

/*
 * PA-2. No `.pi-ps-insight-topbar-row` CSS rule.
 */
assert(
  !/\.pi-ps-insight-topbar-row\s*[\{,]/.test(harnessCssNoComments),
  "PA-2: no .pi-ps-insight-topbar-row CSS rule",
)

/*
 * PA-3. No topbar fallback conditional for insight chips.
 */
assert(
  !/!\s*isWideDesktop[\s\S]{0,200}?topbar/.test(harnessNoComments),
  "PA-3: no topbar fallback conditional for insight chips",
)

/*
 * PA-4. `.pi-ps-insight-rail` exists in TSX and is not gated by
 *       `isWideDesktop`.
 */
assert(
  /className\s*=\s*['"]pi-ps-insight-rail['"]/.test(harnessNoComments),
  "PA-4: .pi-ps-insight-rail exists in TSX",
)
assert(
  !/isWideDesktop\s*&&\s*\([\s\S]{0,80}?className\s*=\s*['"]pi-ps-insight-rail['"]/.test(
    harnessNoComments,
  ),
  "PA-4: .pi-ps-insight-rail is NOT gated by isWideDesktop",
)

/*
 * PA-5. `.pi-ps-insight-rail` is not `display:none` at any breakpoint.
 */
assert(
  !/\.pi-ps-insight-rail\s*\{[^}]*display\s*:\s*none/.test(harnessCssNoComments),
  "PA-5: .pi-ps-insight-rail is not display:none at any breakpoint",
)

/*
 * PA-6. Inline detail expansion is available in the side-by-side
 *       desktop layout and uses the viewport-clamped structure width.
 */
{
  const desktopMediaRe = /@media\s*\(\s*min-width\s*:\s*1200px\s*\)\s*\{([\s\S]*?)\n\}/
  const desktopMediaMatch = harnessCssNoComments.match(desktopMediaRe)
  const desktopMediaBody = desktopMediaMatch ? desktopMediaMatch[1] : ''
  assert(
    /\.pi-ps-insight-rail\[data-rail-detail-open='true'\]\s*\{[^}]*width\s*:\s*clamp\(\s*200px\s*,\s*calc\(\s*100vw\s*-\s*1230px\s*\)\s*,\s*300px\s*\)/.test(
      desktopMediaBody,
    ),
    "PA-6: inline detail expansion is available at @media (min-width: 1200px) with viewport-clamped width",
  )
}

/*
 * PA-7. 1200–1535px: no chip-text rules needed (chips are icon-only).
 */
assert(
  !/\.pi-ps-insight-chip-text/.test(harnessCssNoComments),
  "PA-7: 1200-1535px has no chip-text rules (chips are icon-only at all breakpoints)",
)

/*
 * PA-8. 1200–1535px DOES render structure detail when a chip is active.
 *       This is the PO QA correction for the 100% zoom bug.
 */
assert(
  /activeInsightSection\s*===\s*p\.paperSection[\s\S]*?pi-ps-insight-detail/.test(
    harnessNoComments,
  ) && !/!isMediumDesktop\s*&&\s*activeInsightSection/.test(harnessNoComments),
  "PA-8: inline detail is not gated out of the 1200-1535px desktop band",
)

/*
 * PA-9. <=1199px has left-side handle/drawer path (rail position:fixed, not topbar).
 */
{
  function extractAllStackedBodiesPA(src) {
    const out = []
    let cursor = 0
    while (cursor < src.length) {
      const at = src.indexOf('@media', cursor)
      if (at < 0) break
      const close = src.indexOf(')', at)
      if (close < 0) break
      const header = src.slice(at, close + 1)
      if (!/max-width\s*:\s*1199px/.test(header)) {
        cursor = close + 1
        continue
      }
      const open = src.indexOf('{', close)
      if (open < 0) break
      let depth = 1
      let i = open + 1
      while (i < src.length && depth > 0) {
        if (src[i] === '{') depth++
        else if (src[i] === '}') depth--
        i++
      }
      out.push(src.slice(open + 1, i - 1))
      cursor = i
    }
    return out.join('\n')
  }
  const stackedBodyPA = extractAllStackedBodiesPA(harnessCssNoComments)
  assert(
    /\.pi-ps-insight-rail\s*\{[^}]*position\s*:\s*fixed/.test(stackedBodyPA),
    "PA-9: <=1199px has left-side handle/drawer (rail position:fixed)",
  )
  assert(
    !/pi-ps-insight-topbar-row/.test(stackedBodyPA),
    "PA-9: <=1199px does NOT use topbar row",
  )
}

/* ─── B-checks: PR #52 breakpoint guard after browser QA ───────── */

console.log('\n=== B-checks: PR #52 100%-zoom structure detail guard ===')

/*
 * B-1. The harness may still annotate wide desktop for diagnostics,
 *      but the detail render path is not gated by this flag.
 */
assert(
  /matchMedia\s*\(\s*['"]\s*\(\s*min-width\s*:\s*1536px\s*\)\s*['"]/.test(
    harnessSrc,
  ),
  "B-1: harness still annotates min-width:1536px as wide desktop",
)

/*
 * B-2. Inline rail detail renders from activeInsightSection directly,
 *      including the 1200-1535 side-by-side band that failed browser QA.
 */
assert(
  /data-rail-detail-open\s*=\s*\{\s*activeInsightSection\s*\?\s*['"]true['"]\s*:\s*undefined\s*\}/.test(
    harnessNoComments,
  ) &&
    /activeInsightSection\s*===\s*p\.paperSection[\s\S]*?pi-ps-insight-detail/.test(
      harnessNoComments,
    ),
  "B-2: active passage state opens the rail and renders inline detail",
)
assert(
  !/<AnchoredPopover\b/.test(harnessNoComments),
  "B-2: AnchoredPopover is NOT used for passage structure detail",
)

/*
 * B-3. No chip-text rules needed at any breakpoint (chips are icon-only).
 *      The rail is always visible with square A/B/C/D buttons.
 */
assert(
  !/\.pi-ps-insight-chip-text/.test(harnessCssNoComments),
  "B-3: no chip-text CSS rules exist at any breakpoint (icon-only chips)",
)
assert(
  !/\.pi-ps-insight-rail[^{]*\{[^}]*display\s*:\s*none/.test(harnessCssNoComments),
  "B-3: .pi-ps-insight-rail is NOT hidden at any breakpoint",
)

/*
 * B-4. The 1200-1535 band keeps insight reachable through the LEFT
 *      rail — no topbar chip row at any breakpoint.
 */
assert(
  !/pi-ps-insight-topbar-row/.test(harnessNoComments),
  "B-4: no topbar chip row at any width — insight always lives on the left rail",
)

/*
 * B-5/B-6. The shell geometry is the approved right-shifted 3-column
 *          model, not the older centered 4-column model.
 */
{
  const gridRule = harnessCssDesktopOnly.match(
    /\.pi-ps-harness-shell\s*\{([\s\S]*?)\}/,
  )
  const gridBody = gridRule ? gridRule[1] : ''
  const gridColsMatch = gridBody.match(/grid-template-columns\s*:([\s\S]*?);/)
  const gridColsValue = gridColsMatch ? gridColsMatch[1] : ''
  assert(
    /minmax\(\s*0\s*,\s*1fr\s*\)[\s\S]*minmax\(\s*0\s*,\s*858px\s*\)[\s\S]*minmax\(\s*0\s*,\s*380px\s*\)/.test(
      gridColsValue,
    ),
    "B-6: desktop grid is 1fr / 858px / 380px",
  )
  assert(
    !/minmax\(\s*0\s*,\s*380px\s*\)[\s\S]*minmax\(\s*0\s*,\s*1fr\s*\)/.test(
      gridColsValue,
    ),
    "B-5: desktop grid does NOT retain the old right 1fr gutter",
  )
}

/*
 * B-7/B-8. Right side still bleeds to the viewport edge, while the
 *          stable geometry values remain pinned.
 */
assert(
  /right\s*:\s*calc\(\s*-1\s*\*\s*\(\s*100vw\s*-\s*100%\s*\)\s*\)/.test(
    rightBleedBody,
  ),
  "B-7: right analysis bleed reaches viewport edge with calc(-1 * (100vw - 100%))",
)
assert(
  /column-gap\s*:\s*24px/.test(harnessCssDesktopOnly),
  "B-8: paper-analysis seam remains 24px",
)
assert(
  /minmax\(\s*0\s*,\s*858px\s*\)/.test(harnessCssDesktopOnly) &&
    /minmax\(\s*0\s*,\s*380px\s*\)/.test(harnessCssDesktopOnly),
  "B-8: paper track remains 858px and analysis track remains 380px",
)

/*
 * B-9/B-10. Product boundary stays clean.
 */
assert(
  isUnchanged('app/src/shared-ui/papersurface/PaperSurface.tsx') &&
    isUnchanged('app/src/shared-ui/papersurface/PaperSurface.css'),
  "B-9: PaperSurface.tsx and PaperSurface.css are unchanged by the breakpoint fix",
)
assert(
  isUnchanged('app/src/features/paper-intelligence/PaperIntelligencePreview.tsx') &&
    isUnchanged('app/src/features/paper-intelligence/paperIntelligence.css') &&
    isUnchanged('app/src/features/paper-intelligence/paperIntelligenceRoute.ts'),
  "B-10: default PI route files remain unchanged",
)

/* ─── MF-checks: C4 PO QA — 100% zoom must show structure detail ─ */

console.log('\n=== MF-checks: C4 PO QA — 100% zoom must show structure detail ===')

/*
 * MF-1. At 1200–1535px, the rail remains on the left with icon-only
 *       chips. No chip-text rules are needed (fully removed).
 */
assert(
  !/\.pi-ps-insight-chip-text/.test(harnessCssNoComments),
  "MF-1: no chip-text rules at any breakpoint (icon-only chips)",
)
assert(
  !/\.pi-ps-insight-rail[^{]*\{[^}]*display\s*:\s*none/.test(harnessCssNoComments),
  "MF-1: 1200-1535px rail is not hidden",
)

/*
 * MF-2. Detail panel renders from activeInsightSection directly.
 */
assert(
  /activeInsightSection\s*===\s*p\.paperSection[\s\S]*?pi-ps-insight-detail/.test(
    harnessNoComments,
  ),
  "MF-2: inline detail renders for the active passage",
)
assert(
  !/!isMediumDesktop\s*&&\s*activeInsightSection/.test(harnessNoComments),
  "MF-2: inline detail is not gated out of medium desktop",
)

/*
 * MF-3. .pi-ps-insight-rail still renders at 1200/1280/1440 and must
 *       not display:none.
 */
assert(
  /className\s*=\s*['"]pi-ps-insight-rail['"]/.test(harnessNoComments),
  "MF-3: .pi-ps-insight-rail renders unconditionally in TSX",
)
assert(
  !/\.pi-ps-insight-rail[^{]*\{[^}]*display\s*:\s*none/.test(harnessCssNoComments),
  "MF-3: .pi-ps-insight-rail is never display:none at any breakpoint",
)

/*
 * MF-4. No .pi-ps-insight-topbar-row in TSX or CSS.
 */
assert(
  !/pi-ps-insight-topbar-row/.test(harnessNoComments),
  "MF-4: topbar remains absent from TSX",
)
assert(
  !/\.pi-ps-insight-topbar-row\s*[\{,]/.test(harnessCssNoComments),
  "MF-4: topbar remains absent from CSS",
)

/*
 * MF-5. Side-by-side inline detail is available at >=1200 with the
 *       structure-only clamped width.
 */
assert(
  /data-rail-detail-open\s*=\s*\{\s*activeInsightSection\s*\?\s*['"]true['"]\s*:\s*undefined\s*\}/.test(
    harnessNoComments,
  ),
  "MF-5: data-rail-detail-open follows activeInsightSection directly",
)
{
  const desktopMediaRe = /@media\s*\(\s*min-width\s*:\s*1200px\s*\)\s*\{([\s\S]*?)\n\}/
  const desktopMediaMatch = harnessCssNoComments.match(desktopMediaRe)
  const desktopMediaBody = desktopMediaMatch ? desktopMediaMatch[1] : ''
  assert(
    /\.pi-ps-insight-rail\[data-rail-detail-open='true'\]\s*\{[^}]*width\s*:\s*clamp\(\s*200px\s*,\s*calc\(\s*100vw\s*-\s*1230px\s*\)\s*,\s*300px\s*\)/.test(
      desktopMediaBody,
    ),
    "MF-5: CSS detail-open expansion is inside @media (min-width: 1200px) with clamp width",
  )
}

/*
 * MF-6. PaperSurface / default PI route / AnchoredPopover.tsx remain
 *       untouched.
 */
assert(
  isUnchanged('app/src/shared-ui/papersurface/PaperSurface.tsx'),
  "MF-6: PaperSurface.tsx is unchanged",
)
assert(
  isUnchanged('app/src/features/paper-intelligence/preview/AnchoredPopover.tsx'),
  "MF-6: AnchoredPopover.tsx is unchanged",
)
assert(
  isUnchanged('app/src/features/paper-intelligence/paperIntelligenceRoute.ts'),
  "MF-6: paperIntelligenceRoute.ts is unchanged",
)

/*
 * MF-7. The old isMediumDesktop no-detail gate is gone.
 */
assert(
  !/\bisMediumDesktop\b/.test(harnessNoComments),
  "MF-7: no isMediumDesktop no-detail branch remains",
)

/* ─── TXT-checks: PR #52 C4 PO QA Must Fix — no partial text leak ─ */

console.log('\n=== TXT-checks: PR #52 C4 小修 — chips are icon-only square buttons ===')

/*
 * TXT-1. No .pi-ps-insight-chip-text element exists in TSX.
 */
assert(
  !/pi-ps-insight-chip-text/.test(harnessNoComments),
  "TXT-1: no .pi-ps-insight-chip-text element in TSX (chips are icon-only)",
)

/*
 * TXT-2. No .pi-ps-insight-chip-text CSS rule exists.
 */
assert(
  !/\.pi-ps-insight-chip-text/.test(harnessCssNoComments),
  "TXT-2: no .pi-ps-insight-chip-text CSS rule (text element fully removed)",
)

/*
 * TXT-3. Chip is a fixed-size square button (width == height).
 */
{
  const chipMatch = harnessCssDesktopOnly.match(
    /\.pi-ps-insight-chip\s*\{([\s\S]*?)\}/,
  )
  const chipBody = chipMatch ? chipMatch[1] : ''
  const widthMatch = chipBody.match(/\bwidth\s*:\s*(\d+)px/)
  const heightMatch = chipBody.match(/\bheight\s*:\s*(\d+)px/)
  const w = widthMatch ? parseInt(widthMatch[1], 10) : 0
  const h = heightMatch ? parseInt(heightMatch[1], 10) : 0
  assert(
    w > 0 && w === h,
    `TXT-3: chip is a square button (width: ${w}px, height: ${h}px)`,
  )
}

/*
 * TXT-4. Chip uses justify-content:center.
 */
{
  const chipMatch = harnessCssDesktopOnly.match(
    /\.pi-ps-insight-chip\s*\{([\s\S]*?)\}/,
  )
  const chipBody = chipMatch ? chipMatch[1] : ''
  assert(
    /justify-content\s*:\s*center/.test(chipBody),
    "TXT-4: chip uses justify-content:center (letter is centered in square)",
  )
}

/*
 * TXT-5. No text-overflow:ellipsis anywhere on rail/chip.
 */
{
  const railScopedAll = (() => {
    const parts = []
    const ruleRe = /([^{}]+?)\{([^{}]*)\}/g
    let m
    while ((m = ruleRe.exec(harnessCssNoComments)) !== null) {
      const sel = m[1].trim()
      if (
        /\.pi-ps-insight-rail\b/.test(sel) ||
        /\.pi-ps-insight-rail-/.test(sel) ||
        (/\.pi-ps-insight-chip\b/.test(sel) &&
          !/\.pi-ps-insight-chip-strip\b/.test(sel))
      ) {
        parts.push(m[2])
      }
    }
    return parts.join('\n')
  })()
  assert(
    !/text-overflow\s*:\s*ellipsis/.test(railScopedAll),
    "TXT-5: no text-overflow:ellipsis on rail/chip (no partial text possible)",
  )
}

/*
 * TXT-6. Accessible labels preserved.
 */
assert(
  /pi-ps-insight-rail-toggle[\s\S]*?aria-label\s*=\s*\{/.test(harnessNoComments),
  "TXT-6: rail toggle preserves aria-label",
)
assert(
  /pi-ps-insight-chip[\s\S]*?aria-label\s*=\s*\{/.test(harnessNoComments),
  "TXT-6: insight chip preserves aria-label",
)

/*
 * TXT-7. buildInsightChipShortLabel is NOT imported.
 */
assert(
  !/buildInsightChipShortLabel/.test(harnessNoComments),
  "TXT-7: buildInsightChipShortLabel is NOT imported (no short label in chips)",
)

/*
 * TXT-8. Detail content still renders when chip is active.
 */
assert(
  /pi-ps-insight-detail/.test(harnessNoComments),
  "TXT-8: .pi-ps-insight-detail still renders (detail content visible when active)",
)

/* ─── Summary ────────────────────────────────────────────────────── */

console.log(`\n${'─'.repeat(50)}`)
console.log(`Results: ${passes} passed, ${failures} failed`)

if (failures > 0) {
  console.error('\nVerification FAILED.')
  process.exit(1)
} else {
  console.log('\nVerification PASSED.')
}
