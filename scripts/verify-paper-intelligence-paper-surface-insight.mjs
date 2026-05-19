#!/usr/bin/env node
/**
 * verify-paper-intelligence-paper-surface-insight.mjs
 *
 * Issue #21-C4 PaperSurface Insight Parity — static verify script.
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
 *   6. Harness CSS still has its 4-column grid, 24px column-gap, 1199px
 *      stacked fallback, pi-line-overlay rule, and C3.6 support/trap
 *      palette rules.
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

// 2d. AnchoredPopover import shape.
assert(
  /import\s*\{\s*AnchoredPopover\s*\}\s*from\s*['"]\.\/preview\/AnchoredPopover['"]/.test(
    harnessSrc,
  ),
  "harness imports AnchoredPopover from `./preview/AnchoredPopover`",
)

// 2e. closeOnEscape used; closeOnOutsidePointerDown={true} NOT used.
assert(
  /\bcloseOnEscape\b/.test(harnessNoComments),
  "harness uses closeOnEscape (matches default PI insight behavior)",
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

assert(
  /grid-template-columns:\s*[\s\S]*?minmax\(\s*0\s*,\s*1fr\s*\)\s*[\s\S]*?minmax\(\s*0\s*,\s*858px\s*\)\s*[\s\S]*?minmax\(\s*0\s*,\s*380px\s*\)\s*[\s\S]*?minmax\(\s*0\s*,\s*1fr\s*\)/.test(
    harnessCssNoComments,
  ),
  "harness CSS still declares the 4-column grid (1fr / 858px paper / 380px rail / 1fr)",
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
{
  const panelMatch = harnessCssNoComments.match(
    /\.pi-ps-insight-panel\s*\{([\s\S]*?)\}/,
  )
  const body = panelMatch ? panelMatch[1] : ''
  const z = (body.match(/z-index:\s*(\d+)/) || [])[1]
  assert(
    !!z && parseInt(z, 10) > 5,
    `.pi-ps-insight-panel z-index (${z ?? 'missing'}) sits strictly above .pi-line-overlay (z-index 5)`,
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
  'app/src/features/paper-intelligence/insight/HarnessInsightPanelContent.tsx',
  'scripts/verify-paper-intelligence-paper-surface-insight.mjs',
  'docs/paper-surface-watch-ledger.md',
])
const unexpected = changedFiles.filter((f) => !allowedC4.has(f))
assert(
  unexpected.length === 0,
  `no files changed outside the C4 allow-list (unexpected: ${
    unexpected.join(', ') || 'none'
  })`,
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
