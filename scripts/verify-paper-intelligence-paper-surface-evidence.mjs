#!/usr/bin/env node
/**
 * verify-paper-intelligence-paper-surface-evidence.mjs
 *
 * Issue #21-C3 static verify script.
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

/* ─── Summary ────────────────────────────────────────────────────── */

console.log(`\n${'─'.repeat(50)}`)
console.log(`Results: ${passes} passed, ${failures} failed`)

if (failures > 0) {
  console.error('\nVerification FAILED.')
  process.exit(1)
} else {
  console.log('\nVerification PASSED.')
}
