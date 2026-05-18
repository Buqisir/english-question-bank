#!/usr/bin/env node
/**
 * verify-paper-intelligence-paper-surface-evidence.mjs
 *
 * Issue #21-C3 / C3.6 static verify script.
 *
 * C3 introduces lecture-mode evidence parity on `surface=paper`:
 *
 *   - The harness owns `activeEvidenceId`, reseeds it from the active
 *     question's support evidence (mirrors PaperIntelligencePreview),
 *     and threads it through `lectureFocus`.
 *   - PaperSurface paints the active evidence inline as a `<mark>`
 *     carrying the existing neutral `data-paper-*` anchor protocol.
 *   - The cross-column dotted line connects the LEFT
 *     `[data-paper-evidence-id]` anchor (PaperSurface's neutral
 *     namespace) to the RIGHT `[data-pi-evidence-id]` anchor (host-
 *     owned PI namespace) via a parameterized geometry preset.
 *   - The default PI route is unchanged.
 *
 * C3.6 layers evidence-kind color semantics on top of C3:
 *
 *   - The harness explicitly derives
 *     `activeEvidenceKind: 'support' | 'trap' | null`
 *     from its own `analysisView` (Approach B — not DOM-read) and
 *     threads it down to `<PaperIntelligenceEvidenceLine />`. The
 *     line component renders the kind on its <path> via both a
 *     `data-pi-evidence-kind` attribute and a `pi-line-path--*`
 *     class modifier so CSS can switch the stroke palette.
 *   - PaperSurface keeps its dumb / data-driven contract: it already
 *     emits `data-paper-evidence-kind` on the active evidence
 *     `<mark>`, and PaperSurface.css uses an attribute selector to
 *     paint the inline left highlight in mint green for support and
 *     amber for trap. PaperSurface does not import PI types and does
 *     not emit `data-pi-*`.
 *   - Trap is amber, NOT red. The source text on the page is a
 *     misleading / confusable fragment, not a wrong answer; red is
 *     reserved for a future cut that explicitly marks a student's
 *     answer as incorrect.
 *
 * What this script asserts (in order):
 *
 *   1. Route / surface invariants — default PI route still mounts
 *      PaperIntelligencePreview, surface=paper still mounts the
 *      harness, no surface=paper-v2 sneaked in.
 *
 *   2. PaperSurface module discipline — PaperSurface does not import
 *      PI types, does not emit `data-pi-*`, uses
 *      `data-paper-evidence-id` for left anchors, exposes the active
 *      evidence highlight class.
 *
 *   3. Geometry preset — the geometry module exports an
 *      EvidenceLineLeftSelectorPreset union supporting both
 *      'pi-preview' and 'paper-surface', the helper covers both
 *      `mark[data-pi-evidence-id]` and `[data-paper-evidence-id]`
 *      shapes, and the right-side helper (`findEvidenceSource`)
 *      still uses `data-pi-evidence-id`.
 *
 *   4. Harness wiring — owns activeEvidenceId, reseeds from
 *      analysisView.supportEvidenceId, threads activeEvidenceId
 *      through lectureFocus, mounts PaperIntelligenceEvidenceLine
 *      with leftSelectorPreset='paper-surface', auto-scrolls on
 *      activeEvidenceId change honoring prefers-reduced-motion.
 *
 *   5. Diff scope — no server, no package/lockfile, no reading-
 *      analysis, no basket / paperAssembly, no route default switch.
 *
 *   6. (C3.6) Evidence kind color semantics — harness derives
 *      `activeEvidenceKind`, line component accepts and renders it,
 *      both line palette (support / trap) and active-anchor palette
 *      exist, the trap palette is amber (NOT red/rose), and the
 *      default PI route call site stays valid without
 *      `activeEvidenceKind`.
 *
 * What this script does NOT assert:
 *
 *   - The PaperSurface module v1 contract (anchor protocol, no
 *     hooks, no fetch, no PI imports). Those live in
 *     `verify-paper-surface-module-v1.mjs`. C3 explicitly extends the
 *     PI feature directory and PaperSurface, so that older script's
 *     scope guard against PI feature edits is a known mismatch.
 *
 *   - The C1/C2 harness boundary (typography, harness CSS grid,
 *     adapter purity, file boundary). Those live in
 *     `verify-paper-intelligence-paper-surface-harness.mjs`.
 *
 * Run: node scripts/verify-paper-intelligence-paper-surface-evidence.mjs
 */

import { readFileSync, existsSync } from 'node:fs'
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
const APP_TSX = join(APP, 'App.tsx')
const ROUTE_PATH = join(
  APP,
  'features',
  'paper-intelligence',
  'paperIntelligenceRoute.ts',
)
const PAPER_SURFACE_TSX = join(APP, 'shared-ui', 'papersurface', 'PaperSurface.tsx')
const PAPER_SURFACE_CSS = join(APP, 'shared-ui', 'papersurface', 'PaperSurface.css')
const GEOMETRY_PATH = join(
  APP,
  'features',
  'paper-intelligence',
  'preview',
  'paperIntelligenceEvidenceLineGeometry.ts',
)
const LINE_TSX_PATH = join(
  APP,
  'features',
  'paper-intelligence',
  'preview',
  'paperIntelligenceEvidenceLine.tsx',
)
const PREVIEW_TSX_PATH = join(
  APP,
  'features',
  'paper-intelligence',
  'PaperIntelligencePreview.tsx',
)

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

/* ─── 1. Route / surface ─────────────────────────────────────────── */

console.log('\n=== 1. Route / surface ===')

const routeContent = readFile(ROUTE_PATH)
const appContent = readFile(APP_TSX)

assert(routeContent.includes("'paper'"), "surface=paper still exists in route parser")
assert(!routeContent.includes("'paper-v2'"), "no surface=paper-v2 in route parser")
assert(
  appContent.includes('PaperIntelligencePreview') &&
    appContent.includes("'paper-intelligence'"),
  "default PI route still mounts PaperIntelligencePreview",
)
assert(
  appContent.includes('PaperIntelligencePaperSurfaceHarness'),
  "surface=paper still mounts PaperIntelligencePaperSurfaceHarness",
)
assert(
  !appContent.includes("surface=paper-v2") && !appContent.includes("'paper-v2'"),
  "no route default switch / paper-v2 surface introduced",
)

/* ─── 2. PaperSurface module discipline ───────────────────────────── */

console.log('\n=== 2. PaperSurface module discipline ===')

const paperSurfaceTsx = readFile(PAPER_SURFACE_TSX)
const paperSurfaceTsxNoComments = stripComments(paperSurfaceTsx)
const paperSurfaceCss = readFile(PAPER_SURFACE_CSS)
const paperSurfaceCssNoComments = stripComments(paperSurfaceCss)

assert(
  !paperSurfaceTsx.includes('paperIntelligenceTypes') &&
    !paperSurfaceTsx.includes('PaperIntelligenceReport') &&
    !/from\s+['"][^'"]*features\/paper-intelligence/.test(paperSurfaceTsx),
  "PaperSurface does NOT import PI types or PI feature modules",
)

assert(
  !/data-pi-/.test(paperSurfaceTsxNoComments),
  "PaperSurface does NOT emit data-pi-* anywhere",
)

assert(
  !/data-pi-/.test(paperSurfaceCssNoComments),
  "PaperSurface.css does NOT mention data-pi-*",
)

// The neutral anchor protocol uses `paperSurfaceAnchorAttrs.evidenceId`
// which resolves to `data-paper-evidence-id`. PaperSurface must use
// the computed property form (no raw JSX attribute literal).
assert(
  /paperSurfaceAnchorAttrs\.evidenceId/.test(paperSurfaceTsx),
  "PaperSurface uses paperSurfaceAnchorAttrs.evidenceId for left anchors",
)
assert(
  !/\bdata-paper-evidence-id\s*=/.test(paperSurfaceTsxNoComments),
  "PaperSurface does NOT emit a raw `data-paper-evidence-id=` JSX literal (must use computed property)",
)

// Active highlight class declared in CSS.
assert(
  /\.ps-evidence-anchor--active\s*\{/.test(paperSurfaceCssNoComments),
  "PaperSurface.css declares the .ps-evidence-anchor--active rule",
)
// Active highlight class applied in JSX.
assert(
  /ps-evidence-anchor--active/.test(paperSurfaceTsxNoComments),
  "PaperSurface.tsx applies the .ps-evidence-anchor--active class on the active evidence mark",
)

// PaperSurface derives activeEvidenceId from props.lectureFocus, not
// from local state. The B3 module-v1 verify already bans state hooks
// in this file; we add a focused C3 invariant here.
assert(
  /lectureFocus\s*&&\s*lectureFocus\.kind\s*===\s*['"]question['"]\s*\?\s*lectureFocus\.activeEvidenceId/.test(
    paperSurfaceTsxNoComments,
  ),
  "PaperSurface derives activeEvidenceId from lectureFocus.activeEvidenceId (no local state)",
)

/* ─── 3. Geometry preset ─────────────────────────────────────────── */

console.log('\n=== 3. Geometry preset ===')

const geometrySrc = readFile(GEOMETRY_PATH)
const geometryNoComments = stripComments(geometrySrc)
const lineTsxSrc = readFile(LINE_TSX_PATH)
const lineTsxNoComments = stripComments(lineTsxSrc)

// Both selector shapes must appear somewhere in the geometry module.
assert(
  /mark\[data-pi-evidence-id=/.test(geometryNoComments),
  "geometry helper covers `mark[data-pi-evidence-id]` (default PI preview preset)",
)
assert(
  /\[data-paper-evidence-id=/.test(geometryNoComments),
  "geometry helper covers `[data-paper-evidence-id]` (PaperSurface harness preset)",
)

// The exported preset union must mention both names so consumers
// can't smuggle in a third selector silently.
assert(
  /export\s+type\s+EvidenceLineLeftSelectorPreset\s*=\s*['"]pi-preview['"]\s*\|\s*['"]paper-surface['"]/.test(
    geometryNoComments,
  ),
  "geometry exports EvidenceLineLeftSelectorPreset = 'pi-preview' | 'paper-surface'",
)

// Right-side selector remains data-pi-evidence-id (right Question
// Analysis is host-owned and unchanged).
{
  const findSourceMatch = geometrySrc.match(
    /export\s+function\s+findEvidenceSource\s*\([\s\S]*?\}\s*\n/,
  )
  const body = findSourceMatch ? findSourceMatch[0] : ''
  assert(
    /\[data-pi-evidence-id=/.test(body),
    "geometry findEvidenceSource (right-side) still uses `data-pi-evidence-id`",
  )
  assert(
    !/\[data-paper-evidence-id=/.test(body),
    "geometry findEvidenceSource (right-side) does NOT use `data-paper-evidence-id`",
  )
}

// findFirstDomOccurrence must accept a preset parameter and default
// to 'pi-preview' so existing call sites keep working.
assert(
  /export\s+function\s+findFirstDomOccurrence\s*\([\s\S]*?leftSelectorPreset\s*:\s*EvidenceLineLeftSelectorPreset\s*=\s*['"]pi-preview['"]/.test(
    geometrySrc,
  ),
  "findFirstDomOccurrence accepts a leftSelectorPreset arg defaulting to 'pi-preview'",
)

// Hook + component plumb the preset through.
assert(
  /leftSelectorPreset\s*\?\s*:\s*EvidenceLineLeftSelectorPreset/.test(lineTsxSrc),
  "usePaperIntelligenceEvidenceLine accepts leftSelectorPreset?: EvidenceLineLeftSelectorPreset",
)
assert(
  /findFirstDomOccurrence\(\s*leftScroller\s*,\s*activeEvidenceId\s*,\s*leftSelectorPreset\s*,?\s*\)/s.test(
    lineTsxNoComments,
  ),
  "evidence-line hook passes leftSelectorPreset into findFirstDomOccurrence",
)

/* ─── 4. Harness wiring ──────────────────────────────────────────── */

console.log('\n=== 4. Harness wiring ===')

const harnessSrc = readFile(HARNESS_PATH)
const harnessNoComments = stripComments(harnessSrc)
const harnessCss = readFile(HARNESS_CSS_PATH)

// Owns the activeEvidenceId state.
assert(
  /useState<\s*string\s*\|\s*null\s*>\s*\(\s*null\s*\)/.test(harnessSrc) &&
    /\[\s*activeEvidenceId\s*,\s*setActiveEvidenceId\s*\]/.test(harnessSrc),
  "harness owns the activeEvidenceId state",
)

// Reseed from analysisView.supportEvidenceId on activeQuestionId change.
assert(
  /analysisView\?\.supportEvidenceId/.test(harnessNoComments) &&
    /setActiveEvidenceId\s*\(\s*supportId\s*\)/.test(harnessNoComments),
  "harness reseeds activeEvidenceId from analysisView.supportEvidenceId",
)
assert(
  /if\s*\(\s*!activeQuestionId\s*\)\s*\{\s*setActiveEvidenceId\s*\(\s*null\s*\)/.test(
    harnessNoComments,
  ),
  "harness clears activeEvidenceId when activeQuestionId clears",
)

// Threads activeEvidenceId through lectureFocus.
assert(
  /kind:\s*['"]question['"]\s*,\s*questionId:\s*activeQuestionId\s*,\s*activeEvidenceId\s*\}/.test(
    harnessNoComments,
  ),
  "harness threads activeEvidenceId through lectureFocus",
)

// Right-side click handler updates activeEvidenceId.
assert(
  /handleSelectEvidence\s*=\s*useCallback/.test(harnessNoComments) &&
    /setActiveEvidenceId\s*\(\s*evidenceId\s*\)/.test(harnessNoComments),
  "harness exposes a host-owned handleSelectEvidence handler",
)

// Mounts PaperIntelligenceEvidenceLine with the paper-surface preset.
assert(
  /<PaperIntelligenceEvidenceLine\b[\s\S]*?leftSelectorPreset\s*=\s*['"]paper-surface['"]/.test(
    harnessSrc,
  ),
  "harness mounts PaperIntelligenceEvidenceLine with leftSelectorPreset='paper-surface'",
)
assert(
  /containerRef\s*=\s*\{\s*shellRef\s*\}/.test(harnessSrc) &&
    /leftScrollerRef\s*=\s*\{\s*leftScrollerRef\s*\}/.test(harnessSrc) &&
    /rightPanelRef\s*=\s*\{\s*rightPanelRef\s*\}/.test(harnessSrc),
  "harness scopes line refs to shell / left scroller / right panel",
)

// Auto-scroll on activeEvidenceId change, honoring prefers-reduced-motion.
assert(
  /querySelector[\s\S]*?\[data-paper-evidence-id="\$\{cssAttr\(activeEvidenceId\)\}"\]/.test(
    harnessSrc,
  ),
  "harness auto-scroll resolves the matching [data-paper-evidence-id] anchor in the left scroller",
)
assert(
  /matchMedia\(['"]\(prefers-reduced-motion: reduce\)['"]\)\.matches/.test(harnessSrc) &&
    /behavior:\s*reduced\s*\?\s*['"]auto['"]\s*:\s*['"]smooth['"]/.test(harnessSrc),
  "harness auto-scroll honors prefers-reduced-motion",
)

// Right-panel rows emit data-pi-evidence-id (host namespace, line geometry source).
assert(
  /data-pi-evidence-id\s*=\s*\{\s*evidenceId\s*\}/.test(harnessSrc),
  "harness right-panel support row emits data-pi-evidence-id",
)
assert(
  /data-pi-evidence-id\s*=\s*\{\s*row\.evidenceId\s*\}/.test(harnessSrc),
  "harness right-panel distractor row emits data-pi-evidence-id",
)
assert(
  /data-pi-evidence-kind\s*=\s*['"]support['"]/.test(harnessSrc) &&
    /data-pi-evidence-kind\s*=\s*['"]trap['"]/.test(harnessSrc),
  "harness right-panel rows carry data-pi-evidence-kind for support and trap",
)

// Harness CSS gives the shell a positioning context for the absolute SVG.
assert(
  /\.pi-ps-harness-shell\s*\{[\s\S]*?position:\s*relative\s*;[\s\S]*?\}/.test(
    harnessCss,
  ),
  "harness CSS .pi-ps-harness-shell sets position: relative (line overlay containing block)",
)
assert(
  /\.pi-ps-harness-shell\s+\.pi-line-overlay\s*\{/.test(harnessCss) &&
    /\.pi-ps-harness-shell\s+\.pi-line-path\s*\{/.test(harnessCss),
  "harness CSS scopes pi-line-overlay / pi-line-path styles inside .pi-ps-harness-shell",
)

/* ─── 5. Diff scope ──────────────────────────────────────────────── */

console.log('\n=== 5. Diff scope ===')

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

assert(
  !changedFiles.some((f) => f.startsWith('server/')),
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
  !changedFiles.some((f) => f.includes('features/reading-analysis')),
  "no reading-analysis changes",
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
  !changedFiles.some((f) => f === 'app/src/App.tsx'),
  "no App.tsx changes (default PI route untouched)",
)
assert(
  !changedFiles.some((f) =>
    f.endsWith('app/src/features/paper-intelligence/paperIntelligenceRoute.ts'),
  ),
  "no paperIntelligenceRoute.ts changes (route parser untouched)",
)
assert(
  !changedFiles.some((f) =>
    f.includes('app/src/features/paper-intelligence/adapter/'),
  ),
  "no adapter/ changes",
)

// Sanity: the files we DID change are exactly the C3 surface.
const allowedC3 = new Set([
  'app/src/shared-ui/papersurface/PaperSurface.tsx',
  'app/src/shared-ui/papersurface/PaperSurface.css',
  'app/src/features/paper-intelligence/PaperIntelligencePaperSurfaceHarness.tsx',
  'app/src/features/paper-intelligence/paperIntelligencePaperSurfaceHarness.css',
  'app/src/features/paper-intelligence/preview/paperIntelligenceEvidenceLineGeometry.ts',
  'app/src/features/paper-intelligence/preview/paperIntelligenceEvidenceLine.tsx',
  'scripts/verify-paper-intelligence-paper-surface-harness.mjs',
  'scripts/verify-paper-intelligence-paper-surface-evidence.mjs',
])
const unexpected = changedFiles.filter((f) => !allowedC3.has(f))
assert(
  unexpected.length === 0,
  `no files changed outside the C3 scope (unexpected: ${unexpected.join(', ') || 'none'})`,
)

/* ─── 6. C3.6 evidence kind color semantics ─────────────────────── */

console.log('\n=== 6. C3.6 evidence kind color semantics ===')

// We strip CSS comments before running rule-body regexes so a doc
// comment mentioning `.pi-line-path--trap` (or `data-paper-evidence-
// kind="trap"`) cannot be the first match position and grab a
// neighboring rule's body.
const harnessCssNoComments = stripComments(harnessCss)
const paperSurfaceCssNoCommentsForKind = stripComments(paperSurfaceCss)

// 6a. Harness derives `activeEvidenceKind` explicitly (Approach B).
//     The verify pins the type union AND the resolution against the
//     harness's own analysisView so a future regression that infers
//     kind by reading the DOM (Approach A) fails this script.
assert(
  /activeEvidenceKind/.test(harnessSrc),
  "harness names an `activeEvidenceKind` value (Approach B — explicit derivation)",
)
assert(
  /useMemo<\s*['"]support['"]\s*\|\s*['"]trap['"]\s*\|\s*null\s*>/.test(
    harnessSrc,
  ),
  "harness types activeEvidenceKind as 'support' | 'trap' | null via useMemo",
)
assert(
  /analysisView\??\.supportEvidenceId\s*===\s*activeEvidenceId/.test(
    harnessNoComments,
  ) ||
    /activeEvidenceId\s*===\s*analysisView\??\.supportEvidenceId/.test(
      harnessNoComments,
    ),
  "harness resolves 'support' kind via analysisView.supportEvidenceId === activeEvidenceId",
)
assert(
  /analysisView[\s\S]{0,40}\.distractors\.some\([\s\S]*?\bevidenceId\b[\s\S]*?activeEvidenceId/.test(
    harnessNoComments,
  ) ||
    /analysisView[\s\S]{0,40}\.distractors\.some\([\s\S]*?activeEvidenceId[\s\S]*?\bevidenceId\b/.test(
      harnessNoComments,
    ),
  "harness resolves 'trap' kind via analysisView.distractors.some(...evidenceId === activeEvidenceId)",
)
// Approach B guard: kind must NOT come from a DOM read.
assert(
  !/getAttribute\s*\(\s*['"]data-pi-evidence-kind['"]/.test(harnessSrc) &&
    !/getAttribute\s*\(\s*['"]data-paper-evidence-kind['"]/.test(harnessSrc),
  "harness does NOT infer activeEvidenceKind by reading data-*-evidence-kind via getAttribute",
)
// And the harness threads it into the line component.
assert(
  /<PaperIntelligenceEvidenceLine\b[\s\S]*?activeEvidenceKind\s*=\s*\{\s*activeEvidenceKind\s*\}/.test(
    harnessSrc,
  ),
  "harness passes activeEvidenceKind into <PaperIntelligenceEvidenceLine />",
)

// 6b. Line component accepts an optional activeEvidenceKind prop and
//     renders it. We accept either the data attribute on the path or
//     the class modifier (or both) so the visual identity is
//     reachable by CSS authors picking either selector form.
assert(
  /activeEvidenceKind\s*\?\s*:\s*['"]support['"]\s*\|\s*['"]trap['"]\s*\|\s*null/.test(
    lineTsxSrc,
  ),
  "line component declares optional `activeEvidenceKind?: 'support' | 'trap' | null`",
)
assert(
  /data-pi-evidence-kind\s*=\s*\{\s*activeEvidenceKind/.test(lineTsxNoComments) ||
    /pi-line-path--trap/.test(lineTsxNoComments),
  "line component renders the kind on the path (data-pi-evidence-kind attr or pi-line-path--trap class)",
)

// 6c. Harness CSS has support and trap line palettes.
assert(
  /\.pi-line-path--support\b|\.pi-line-path\[data-pi-evidence-kind="support"\]/.test(
    harnessCssNoComments,
  ),
  "harness CSS declares a support line rule (.pi-line-path--support or matching attribute selector)",
)
assert(
  /\.pi-line-path--trap\b|\.pi-line-path\[data-pi-evidence-kind="trap"\]/.test(
    harnessCssNoComments,
  ),
  "harness CSS declares a trap line rule (.pi-line-path--trap or matching attribute selector)",
)
// 6c-bis. Support stays mint green, trap is amber, and trap is NOT red.
{
  const trapMatch = harnessCssNoComments.match(
    /(?:\.pi-line-path--trap|\.pi-line-path\[data-pi-evidence-kind="trap"\])[^{]*\{([\s\S]*?)\}/,
  )
  const trapBody = trapMatch ? trapMatch[1] : ''
  assert(
    !!trapMatch,
    "trap line rule body is locatable",
  )
  assert(
    /\b245\s*,\s*158\s*,\s*11\b/.test(trapBody) ||
      /#f59e0b\b/i.test(trapBody) ||
      /#fbbf24\b/i.test(trapBody) ||
      /#d97706\b/i.test(trapBody),
    "trap line stroke uses amber (rgb(245,158,11) / #f59e0b family)",
  )
  assert(
    !/\b239\s*,\s*68\s*,\s*68\b/.test(trapBody) &&
      !/#ef4444\b/i.test(trapBody) &&
      !/#dc2626\b/i.test(trapBody) &&
      !/#f43f5e\b/i.test(trapBody),
    "trap line stroke does NOT use a red/rose palette",
  )
}

// 6d. Harness CSS — selected-row palette tracks the line palette.
//     Support row keeps green, trap row uses amber (NOT red).
{
  const supportSelectedMatch = harnessCssNoComments.match(
    /\.pi-ps-analysis-evidence--selected[\s\S]*?\{([\s\S]*?)\}/,
  )
  const supportBody = supportSelectedMatch ? supportSelectedMatch[1] : ''
  assert(
    /\b16\s*,\s*185\s*,\s*129\b/.test(supportBody) || /#10b981\b/i.test(supportBody),
    "support selected row uses mint green accent",
  )
}
{
  const distractorMatch = harnessCssNoComments.match(
    /\.pi-ps-analysis-distractor--selected\s*\{([\s\S]*?)\}/,
  )
  const distractorBody = distractorMatch ? distractorMatch[1] : ''
  assert(
    !!distractorMatch,
    "trap selected distractor row rule is locatable",
  )
  assert(
    /\b245\s*,\s*158\s*,\s*11\b/.test(distractorBody) ||
      /#f59e0b\b/i.test(distractorBody) ||
      /#fbbf24\b/i.test(distractorBody),
    "trap selected distractor row uses amber accent",
  )
  assert(
    !/\b239\s*,\s*68\s*,\s*68\b/.test(distractorBody) &&
      !/#ef4444\b/i.test(distractorBody) &&
      !/#dc2626\b/i.test(distractorBody),
    "trap selected distractor row does NOT use a red/rose palette",
  )
}

// 6e. PaperSurface.css declares kind-specific active-anchor rules.
//     The base class keeps shape resets only; the support/trap
//     palettes live in attribute-selector children.
assert(
  /\.ps-evidence-anchor--active\[data-paper-evidence-kind="support"\]/.test(
    paperSurfaceCssNoCommentsForKind,
  ),
  "PaperSurface.css declares `.ps-evidence-anchor--active[data-paper-evidence-kind=\"support\"]`",
)
assert(
  /\.ps-evidence-anchor--active\[data-paper-evidence-kind="trap"\]/.test(
    paperSurfaceCssNoCommentsForKind,
  ),
  "PaperSurface.css declares `.ps-evidence-anchor--active[data-paper-evidence-kind=\"trap\"]`",
)
{
  const supportMatch = paperSurfaceCssNoCommentsForKind.match(
    /\.ps-evidence-anchor--active\[data-paper-evidence-kind="support"\]\s*\{([\s\S]*?)\}/,
  )
  const supportBody = supportMatch ? supportMatch[1] : ''
  assert(
    /\b16\s*,\s*185\s*,\s*129\b/.test(supportBody) || /#10b981\b/i.test(supportBody),
    "support inline highlight uses mint green (rgb(16,185,129) / #10b981 family)",
  )
  assert(
    /border-bottom\s*:[^;]*\bsolid\b/.test(supportBody),
    "support inline highlight uses a solid underline",
  )
}
{
  const trapMatch = paperSurfaceCssNoCommentsForKind.match(
    /\.ps-evidence-anchor--active\[data-paper-evidence-kind="trap"\]\s*\{([\s\S]*?)\}/,
  )
  const trapBody = trapMatch ? trapMatch[1] : ''
  assert(
    /\b245\s*,\s*158\s*,\s*11\b/.test(trapBody) || /#f59e0b\b/i.test(trapBody),
    "trap inline highlight uses amber (rgb(245,158,11) / #f59e0b family)",
  )
  assert(
    !/\b239\s*,\s*68\s*,\s*68\b/.test(trapBody) &&
      !/#ef4444\b/i.test(trapBody) &&
      !/#dc2626\b/i.test(trapBody),
    "trap inline highlight does NOT use a red/rose palette",
  )
  assert(
    /border-bottom\s*:[^;]*\bdotted\b/.test(trapBody),
    "trap inline highlight uses a dotted underline",
  )
}

// 6f. Default PI route call site stays valid without
//     `activeEvidenceKind` (the prop is optional). The script reads
//     PaperIntelligencePreview.tsx without modifying it; the file is
//     out of the C3.6 scope and must remain unchanged. We only assert
//     its existing call site shape.
{
  assert(
    existsSync(PREVIEW_TSX_PATH),
    "PaperIntelligencePreview.tsx exists (default PI route file)",
  )
  const previewSrc = readFile(PREVIEW_TSX_PATH)
  const lineUsage = previewSrc.match(
    /<PaperIntelligenceEvidenceLine\b[\s\S]*?\/>/,
  )
  assert(
    !!lineUsage,
    "default PI route still mounts <PaperIntelligenceEvidenceLine />",
  )
  assert(
    !!lineUsage && !/activeEvidenceKind\s*=/.test(lineUsage[0]),
    "default PI route call site does NOT pass activeEvidenceKind (optional prop preserved)",
  )
}

// 6g. PaperSurface stays dumb / data-driven — no PI imports, no
//     `data-pi-*`, no red/rose trap palette tied to
//     `data-paper-evidence-kind="trap"`.
assert(
  !/from\s+['"][^'"]*features\/paper-intelligence/.test(paperSurfaceTsx),
  "(C3.6 re-check) PaperSurface does NOT import PI feature modules",
)
assert(
  !/data-pi-/.test(paperSurfaceTsxNoComments),
  "(C3.6 re-check) PaperSurface emits no data-pi-* anywhere",
)
{
  const trapBlocks = paperSurfaceCssNoComments.match(
    /\[data-paper-evidence-kind="trap"\][^{]*\{([\s\S]*?)\}/g,
  )
  for (const block of trapBlocks || []) {
    assert(
      !/\b239\s*,\s*68\s*,\s*68\b/.test(block) &&
        !/#ef4444\b/i.test(block) &&
        !/#dc2626\b/i.test(block) &&
        !/#f43f5e\b/i.test(block),
      `no red/rose palette inside data-paper-evidence-kind="trap" block`,
    )
  }
}

/* ─── Summary ────────────────────────────────────────────────────── */

console.log(`\n${'─'.repeat(50)}`)
console.log(`Results: ${passes} passed, ${failures} failed`)

if (failures > 0) {
  console.error('\nVerification FAILED.')
  process.exit(1)
} else {
  console.log('\nVerification PASSED.')
}
