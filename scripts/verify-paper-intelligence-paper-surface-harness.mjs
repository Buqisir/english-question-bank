/**
 * verify-paper-intelligence-paper-surface-harness.mjs
 *
 * Issue #21-C1 / Issue #41-C2 static verify script.
 *
 * The C1 cut introduced PaperIntelligencePaperSurfaceHarness and forbade
 * any edit to the PaperSurface module / shared papersurface module. C2
 * is a bounded polish cut on top of C1: it intentionally edits a small,
 * well-defined slice of PaperSurface.css and the harness CSS, and
 * nothing else.
 *
 * C2 follow-up (browser QA): restore harness grid to 1fr 380px (the
 * earlier 1fr 360px shrunk the right column in a way that visually
 * widened the gray gap because freed pixels flowed back into the 1fr
 * left column) and bump the paper body baseline to 16px (小四 ≈ 12pt
 * ≈ 16px) so the A4 paper feel is realistic. .ps-option is also
 * bumped to 16px so options share the body baseline.
 *
 * This script rewrites the C1 PaperSurface-untouched guard into C2
 * polish-boundary assertions: it pins the exact CSS values C2 is
 * allowed to change, pins the structural invariants C2 is NOT allowed
 * to change (sheet width, sheet padding, no border-radius, no gradient,
 * outer-only sheet shadow), and keeps the C1 surface / route / scope /
 * adapter / behavior contract assertions unchanged.
 *
 * 刀⑤ render-fidelity retirement (2026-07-08): standard v2 authorized
 * the screen body baseline to regress 16px → 14px and the page margin
 * to move from a fixed --ps-page-padding literal to margin tokens
 * (Chunk A), and authorized server/print-renderer.mjs +
 * server/exports/docxRenderer.mjs to consume shared/papersurface/
 * tokens.mjs (Chunk B/C). The pinned-16px / pinned-56px / server-
 * untouched / tokens.mjs-untouched / prototype-still-exists assertions
 * below were updated or retired accordingly — see inline comments at
 * each site. The structural invariants untouched by this cut (grid
 * layout, no border-radius, gradient scoping, box-shadow, adapter
 * boundaries, behavior contract, H3 panel locality) are unchanged.
 *
 * Asserts:
 *   Route / surface:
 *     - surface=paper still exists
 *     - default/unknown surface still mounts PaperIntelligencePreview
 *     - surface=paper mounts PaperIntelligencePaperSurfaceHarness
 *     - no surface=paper-v2
 *
 *   C2 polish boundary — PaperSurface.css polish slice:
 *     - declares --ps-page-width: 794px
 *     - declares --ps-page-padding: 56px
 *     - .ps-surface padding: 16px 32px (Issue #43 final tune
 *       symmetric matte; browser QA progression 24px → 28px → 32px)
 *     - .ps-passage-body font-size: 16px
 *     - .ps-question-no font-size: 16px
 *     - .ps-question-stem font-size: 16px
 *     - .ps-option font-size: 16px
 *     - no border-radius anywhere in PaperSurface.css
 *     - gradient is allowed ONLY on the .ps-surface matte (Issue #43
 *       final visual micro-tune: horizontal matte fade + vertical
 *       top/bottom mask layered on the same .ps-surface background;
 *       gradient remains forbidden inside the .ps-page sheet and
 *       elsewhere in the file)
 *     - matte gray is #e8e8e8 (subtler than the prior #e4e4e4 while
 *       still slightly darker than the outer desk gray #ececec); the
 *       prior matte gray #e4e4e4 must NOT remain in the file
 *     - .ps-page selector group does NOT add inner box-shadow beyond the
 *       single existing outer-sheet box-shadow (pattern: at most one
 *       box-shadow declaration in the whole file, and it must live on
 *       .ps-page)
 *
 *   C2/#43/C4 polish boundary — harness CSS polish slice (Issue #43
 *   redesign, final tune: 32px symmetric matte, plus C4 right-shift):
 *     - .pi-ps-harness-shell uses the C4 no-right-gutter grid:
 *         minmax(0, 1fr) minmax(0, 858px) minmax(0, 380px)
 *       (858px = 794px white sheet + 32px × 2 symmetric matte;
 *       browser QA progression from 842px / 24px matte and
 *       850px / 28px matte; C4 removes the final right 1fr gutter so
 *       the analysis background can reach the viewport edge)
 *     - .pi-ps-harness-shell has column-gap: 24px
 *     - .pi-ps-harness-shell paints desk tone (#ececec)
 *     - .pi-ps-harness-left is on grid-column: 2 with overflow-y: auto
 *       and no border-right divider
 *     - .pi-ps-harness-right is on grid-column: 3 with overflow-y: auto
 *       and no explicit width override
 *     - @media (max-width: 1199px) stacked fallback collapses the
 *       shell to a single minmax(0, 1fr) column with column-gap: 0
 *       and pins both left/right to grid-column: 1
 *
 *   C2 polish boundary — files that MUST remain untouched by this cut:
 *     - app/src/shared-ui/papersurface/PaperSurface.tsx
 *     - shared/papersurface/tokens.mjs
 *     - shared/papersurface/segmentPaperText.mjs
 *     - shared/papersurface/anchorKeys.mjs
 *     - server/
 *     - app/src/features/reading-analysis/
 *     - basket / paperAssembly
 *     - adapter files under features/paper-intelligence/adapter/
 *     - package.json, app/package.json, lockfiles
 *
 *   Adapter boundaries (carried from C1):
 *     - adapter files import no React
 *     - adapter files contain no hooks
 *     - adapter files contain no DOM APIs
 *     - adapter files contain no fetch/localStorage/router reads
 *     - adapter files live under features/paper-intelligence/adapter
 *     - PaperSurface does not import PI types
 *
 *   Behavior contract (carried from C1):
 *     - PaperQuestion id uses ${paperSection}-${questionNo} convention
 *     - PaperQuestion does not include answer/explanation/distractorAnalysis/synonymSummary
 *     - annotations are [] in C1
 *     - mode is hardcoded lecture
 *     - readingFocusBySection is empty object
 *     - onFocusIntent handles request-lecture-focus
 *
 * Run: node scripts/verify-paper-intelligence-paper-surface-harness.mjs
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { resolve, join } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const APP = join(ROOT, 'app', 'src')
const ADAPTER_DIR = join(APP, 'features', 'paper-intelligence', 'adapter')
const HARNESS_PATH = join(APP, 'features', 'paper-intelligence', 'PaperIntelligencePaperSurfaceHarness.tsx')
const PAPER_ASSET_ANALYSIS_PANEL_PATH = join(APP, 'features', 'paper-intelligence', 'PaperAssetAnalysisPanel.tsx')
const LEGACY_ANALYSIS_PANEL_PATH = join(APP, 'features', 'paper-intelligence', 'LegacyAnalysisPanel.tsx')
const HARNESS_CSS_PATH = join(APP, 'features', 'paper-intelligence', 'paperIntelligencePaperSurfaceHarness.css')
const APP_TSX = join(APP, 'App.tsx')
const ROUTE_PATH = join(APP, 'features', 'paper-intelligence', 'paperIntelligenceRoute.ts')
const PAPER_SURFACE_DIR = join(APP, 'shared-ui', 'papersurface')
const PAPER_SURFACE_CSS = join(PAPER_SURFACE_DIR, 'PaperSurface.css')
const PAPER_SURFACE_TSX = join(PAPER_SURFACE_DIR, 'PaperSurface.tsx')
const SHARED_PAPER_SURFACE = join(ROOT, 'shared', 'papersurface')

let failures = 0
let passes = 0

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

function fileExists(path) {
  return existsSync(path)
}

function stripCssComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '')
}

// ─── Route / surface ───

console.log('\n=== Route / surface ===')

const routeContent = readFile(ROUTE_PATH)
assert(routeContent.includes("'paper'"), "surface=paper still exists in route parser")
assert(!routeContent.includes("'paper-v2'"), "no surface=paper-v2 in route parser")

const appContent = readFile(APP_TSX)
assert(
  appContent.includes('PaperIntelligencePreview') && appContent.includes("'paper-intelligence'"),
  "default/unknown surface still mounts PaperIntelligencePreview"
)
assert(
  appContent.includes('PaperIntelligencePaperSurfaceHarness'),
  "surface=paper mounts PaperIntelligencePaperSurfaceHarness"
)
assert(
  !appContent.includes("surface=paper-v2") && !appContent.includes("'paper-v2'"),
  "no surface=paper-v2 in App.tsx"
)

// ─── C2 polish boundary — PaperSurface.css polish slice ───

console.log('\n=== C2 polish boundary: PaperSurface.css ===')

const paperSurfaceCssRaw = readFile(PAPER_SURFACE_CSS)
const paperSurfaceCss = stripCssComments(paperSurfaceCssRaw)

assert(
  /--ps-page-width\s*:\s*794px\b/.test(paperSurfaceCss),
  "PaperSurface.css declares --ps-page-width: 794px"
)
// 刀⑤ Chunk A (2026-07-08, authorized): the fixed --ps-page-padding:
// 56px custom property was retired in favor of the standard v2 margin
// tokens (--ps-page-margin-x / --ps-page-margin-top, injected from
// shared/papersurface/tokens.mjs). Assert the .ps-page rule now
// consumes those margin tokens instead of pinning the retired literal.
{
  const match = paperSurfaceCss.match(/\.ps-page\s*\{([\s\S]*?)\}/)
  const body = match ? match[1] : ''
  assert(
    /padding\s*:\s*var\(\s*--ps-page-margin-top\s*\)\s+var\(\s*--ps-page-margin-x\s*\)\s*;/.test(body),
    ".ps-page consumes var(--ps-page-margin-top) / var(--ps-page-margin-x) (retired --ps-page-padding: 56px, 刀⑤ Chunk A)"
  )
}

// .ps-surface padding: 16px 32px (Issue #43 final tune — symmetric
// matte: vertical matte 16px stays, horizontal matte is 32px so the
// gray frame around the white A4 sheet visibly and symmetrically
// wraps the paper. Browser QA progression 24px → 28px → 32px).
{
  const match = paperSurfaceCss.match(/\.ps-surface\s*\{([\s\S]*?)\}/)
  assert(
    !!match && /(^|\s|;)padding\s*:\s*16px\s+32px\s*;/.test(match ? match[1] : ''),
    ".ps-surface declares padding: 16px 32px (symmetric matte)"
  )
}

// 刀⑤ Chunk A (2026-07-08, authorized): the body baseline hardcoded at
// 16px was retired — standard v2 fixes body copy at 10.5pt/14px, and
// PaperSurface.css now consumes that value via var(--ps-font-size)
// instead of duplicating the literal per-selector. Body font sizes:
// var(--ps-font-size) on .ps-passage-body / .ps-question-no /
// .ps-question-stem.
for (const selector of ['.ps-passage-body', '.ps-question-no', '.ps-question-stem']) {
  const escaped = selector.replace(/\./g, '\\.')
  const re = new RegExp(`${escaped}\\s*\\{[^}]*?font-size\\s*:\\s*var\\(\\s*--ps-font-size\\s*\\)`, 's')
  assert(
    re.test(paperSurfaceCss),
    `${selector} declares font-size: var(--ps-font-size) (retired hardcoded 16px, 刀⑤ Chunk A)`
  )
}

// Option font size: var(--ps-font-size) (matched to the body baseline,
// same token consumption as above; retired hardcoded 16px).
{
  const re = /\.ps-option\s*\{[^}]*?font-size\s*:\s*var\(\s*--ps-font-size\s*\)/s
  assert(
    re.test(paperSurfaceCss),
    ".ps-option declares font-size: var(--ps-font-size) (retired hardcoded 16px, 刀⑤ Chunk A)"
  )
}

// No border-radius anywhere.
assert(
  !/border-radius/.test(paperSurfaceCss),
  "PaperSurface.css does NOT introduce border-radius"
)

// Gradient is allowed ONLY on the .ps-surface matte (Issue #43 final
// visual micro-tune layers two gradients on .ps-surface: a horizontal
// fade from outer desk gray to matte gray at the left/right edges,
// and a vertical mask that softly fades the desk color back in over
// the 16px top/bottom matte so the matte transitions softly into the
// outer desk gray on all four edges of the paper).
// Gradient is still forbidden inside the .ps-page sheet (the page
// must remain a clean white surface) and forbidden elsewhere in the
// file.
{
  const psSurfaceMatch = paperSurfaceCss.match(/\.ps-surface\s*\{([\s\S]*?)\}/)
  const psPageMatch = paperSurfaceCss.match(/\.ps-page\s*\{([\s\S]*?)\}/)
  const psSurfaceBody = psSurfaceMatch ? psSurfaceMatch[1] : ''
  const psPageBody = psPageMatch ? psPageMatch[1] : ''

  // .ps-page must NOT contain gradient.
  assert(
    !/gradient/.test(psPageBody),
    ".ps-page sheet does NOT introduce gradient (paper stays a clean white surface)"
  )

  // Outside .ps-surface and .ps-page: no gradient allowed. We strip
  // those two rule bodies and check the remainder is gradient-free.
  const remainder = paperSurfaceCss
    .replace(/\.ps-surface\s*\{[\s\S]*?\}/, '')
    .replace(/\.ps-page\s*\{[\s\S]*?\}/, '')
  assert(
    !/gradient/.test(remainder),
    "PaperSurface.css does NOT introduce gradient outside the .ps-surface matte"
  )

  // Matte gray invariant: subtler #e8e8e8 must appear in .ps-surface
  // background; the previous #e4e4e4 matte gray must not remain in
  // the file (case-insensitive, since CSS hex colors are
  // case-insensitive).
  assert(
    /#e8e8e8/i.test(psSurfaceBody),
    ".ps-surface matte uses subtler matte gray #e8e8e8"
  )
  assert(
    !/#e4e4e4/i.test(paperSurfaceCss),
    "PaperSurface.css no longer references prior matte gray #e4e4e4"
  )
}

// box-shadow: at most ONE declaration in the file, and it must be in
// the .ps-page selector. This pins the "outer sheet shadow only" rule
// from the visual QA checklist and forbids inner sheet / question /
// option shadows from creeping in.
{
  const boxShadowMatches = paperSurfaceCss.match(/box-shadow\s*:/g) || []
  const psPageBlock = paperSurfaceCss.match(/\.ps-page\s*\{([\s\S]*?)\}/)
  const boxShadowOnPsPage = !!psPageBlock && /box-shadow\s*:/.test(psPageBlock[1])

  assert(
    boxShadowMatches.length <= 1,
    `PaperSurface.css has at most one box-shadow declaration (found ${boxShadowMatches.length})`
  )
  assert(
    boxShadowMatches.length === 0 || boxShadowOnPsPage,
    ".ps-page selector group does NOT add inner box-shadow beyond the existing allowed outer sheet shadow"
  )
}

// ─── Harness CSS boundary (C4 retune: no-right-gutter workspace) ───

console.log('\n=== C4 retune: harness CSS no-right-gutter workspace shell ===')

const harnessCssRaw = readFile(HARNESS_CSS_PATH)
const harnessCss = stripCssComments(harnessCssRaw)

// Base-shell (non-media-query) block. We extract by stripping any
// @media block first so 1.x assertions only inspect the base rules.
const harnessCssBase = harnessCss.replace(/@media[^{]*\{[\s\S]*?\n\}/g, '')

{
  const shellMatch = harnessCssBase.match(/\.pi-ps-harness-shell\s*\{([\s\S]*?)\}/)
  const shellBody = shellMatch ? shellMatch[1] : ''

  // C4 retune model: outer-left desk, paper track (858px = 794px
  // sheet + 32px × 2 symmetric matte), analysis track (380px), and
  // no outer-right 1fr gutter. The right analysis background bleeds
  // to the viewport edge; the text column remains bounded.
  assert(
    !!shellMatch &&
      /grid-template-columns\s*:\s*minmax\(\s*0\s*,\s*1fr\s*\)\s+minmax\(\s*0\s*,\s*858px\s*\)\s+minmax\(\s*0\s*,\s*380px\s*\)\s*;/.test(
        shellBody,
      ),
    "harness CSS .pi-ps-harness-shell uses C4 no-right-gutter grid (1fr / 858px / 380px)"
  )
  assert(
    !/grid-template-columns\s*:\s*minmax\(\s*0\s*,\s*1fr\s*\)\s+minmax\(\s*0\s*,\s*858px\s*\)\s+minmax\(\s*0\s*,\s*380px\s*\)\s+minmax\(\s*0\s*,\s*1fr\s*\)\s*;/.test(
      shellBody,
    ),
    "harness CSS .pi-ps-harness-shell no longer uses the old 4-column right-gutter grid"
  )
  assert(
    /minmax\(\s*0\s*,\s*858px\s*\)/.test(shellBody),
    "harness CSS .pi-ps-harness-shell paper track is minmax(0, 858px) (794px sheet + 32px × 2 matte)"
  )
  assert(
    !/minmax\(\s*0\s*,\s*794px\s*\)/.test(shellBody),
    "harness CSS .pi-ps-harness-shell paper track no longer uses minmax(0, 794px)"
  )
  assert(
    !/minmax\(\s*0\s*,\s*842px\s*\)/.test(shellBody),
    "harness CSS .pi-ps-harness-shell paper track no longer uses minmax(0, 842px)"
  )
  assert(
    !/minmax\(\s*0\s*,\s*850px\s*\)/.test(shellBody),
    "harness CSS .pi-ps-harness-shell paper track no longer uses minmax(0, 850px)"
  )
  assert(
    /minmax\(\s*0\s*,\s*380px\s*\)/.test(shellBody),
    "harness CSS .pi-ps-harness-shell analysis track is minmax(0, 380px)"
  )
  assert(
    /column-gap\s*:\s*24px\s*;/.test(shellBody),
    "harness CSS .pi-ps-harness-shell has column-gap: 24px"
  )

  // Legacy 2-column model is gone in the base shell.
  assert(
    !/grid-template-columns\s*:\s*1fr\s+380px\s*;/.test(shellBody),
    "harness CSS .pi-ps-harness-shell no longer uses legacy `1fr 380px` 2-column model"
  )
  assert(
    !/grid-template-columns\s*:\s*1fr\s+360px\s*;/.test(shellBody),
    "harness CSS .pi-ps-harness-shell does NOT use `1fr 360px`"
  )
}

{
  const leftMatch = harnessCssBase.match(/\.pi-ps-harness-left\s*\{([\s\S]*?)\}/)
  const leftBody = leftMatch ? leftMatch[1] : ''
  assert(
    !!leftMatch && /grid-column\s*:\s*2\s*;/.test(leftBody),
    "harness CSS .pi-ps-harness-left is on grid-column: 2 (paper track)"
  )
  assert(
    /overflow-y\s*:\s*auto\s*;/.test(leftBody),
    "harness CSS .pi-ps-harness-left keeps overflow-y: auto"
  )
  assert(
    !/border-right\s*:/.test(leftBody),
    "harness CSS .pi-ps-harness-left no longer paints a border-right divider"
  )
}

{
  const rightMatch = harnessCssBase.match(/\.pi-ps-harness-right\s*\{([\s\S]*?)\}/)
  const rightBody = rightMatch ? rightMatch[1] : ''
  assert(
    !!rightMatch && /grid-column\s*:\s*3\s*;/.test(rightBody),
    "harness CSS .pi-ps-harness-right is on grid-column: 3 (rail track)"
  )
  assert(
    /overflow-y\s*:\s*auto\s*;/.test(rightBody),
    "harness CSS .pi-ps-harness-right keeps overflow-y: auto"
  )
  // Width is implicit from the 380px rail track; no explicit width override.
  assert(
    !/(^|\s|;)width\s*:/.test(rightBody),
    "harness CSS .pi-ps-harness-right does not add an explicit width override"
  )
}

// Stacked fallback at max-width: 1199px.
{
  const mediaMatch = harnessCss.match(/@media\s*\(\s*max-width\s*:\s*1199px\s*\)\s*\{([\s\S]*?)\n\}/)
  assert(
    !!mediaMatch,
    "harness CSS has @media (max-width: 1199px) stacked fallback"
  )
  const mediaBody = mediaMatch ? mediaMatch[1] : ''
  assert(
    /\.pi-ps-harness-shell\s*\{[^}]*grid-template-columns\s*:\s*minmax\(\s*0\s*,\s*1fr\s*\)\s*;/s.test(
      mediaBody,
    ),
    "stacked fallback collapses .pi-ps-harness-shell to a single minmax(0, 1fr) column"
  )
  assert(
    /\.pi-ps-harness-shell\s*\{[^}]*column-gap\s*:\s*0\s*;/s.test(mediaBody),
    "stacked fallback sets column-gap: 0 on the shell"
  )
  assert(
    /\.pi-ps-harness-left\s*\{[^}]*grid-column\s*:\s*1\s*;/s.test(mediaBody),
    "stacked fallback sets .pi-ps-harness-left to grid-column: 1"
  )
  assert(
    /\.pi-ps-harness-right\s*\{[^}]*grid-column\s*:\s*1\s*;/s.test(mediaBody),
    "stacked fallback sets .pi-ps-harness-right to grid-column: 1"
  )
}

// Shell paints the desk tone so outer gutters read as desk.
{
  const shellMatch = harnessCssBase.match(/\.pi-ps-harness-shell\s*\{([\s\S]*?)\}/)
  const shellBody = shellMatch ? shellMatch[1] : ''
  assert(
    /(^|\s|;)background\s*:\s*#ececec\s*;/.test(shellBody),
    "harness CSS .pi-ps-harness-shell paints desk tone (#ececec) so outer gutters read as desk"
  )
}

// ─── C2 polish boundary — diff scope ───

console.log('\n=== C2 polish boundary: diff scope ===')

// Get git diff to check modified files. Prefer the shared GitHub remote used
// by this repo, then fall back to older local names.
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
  for (const candidate of ['github/main', 'origin/main', 'main']) {
    try {
      return execSync(`git merge-base HEAD ${candidate}`, {
        cwd: ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
        .toString()
        .trim()
    } catch {
      // try the next candidate
    }
  }
  return 'HEAD'
})()

let changedFiles = safeGitDiffNames(`${baseRef}...HEAD`)
// Also include uncommitted working-tree changes so a half-finished
// edit doesn't slip past the boundary.
const workingTreeChanges = safeGitDiffNames('HEAD')
for (const f of workingTreeChanges) {
  if (!changedFiles.includes(f)) changedFiles.push(f)
}
try {
  const untrackedOutput = execSync('git ls-files --others --exclude-standard', { cwd: ROOT, encoding: 'utf-8' })
  for (const f of untrackedOutput.split('\n').filter(Boolean)) {
    if (!changedFiles.includes(f)) changedFiles.push(f)
  }
} catch {
  // ignore
}

// server/ blanket freeze retired 2026-07-08 by 刀⑤ render-fidelity
// Chunk B/C (authorized): `server/print-renderer.mjs` and
// `server/exports/docxRenderer.mjs` now consume
// `shared/papersurface/tokens.mjs` for PDF/DOCX typography. That
// consumption's behavioral contract lives in
// `verify-paper-surface-tokens.mjs`; this harness script's job is the
// PI-surface harness UI/adapter boundary, not a repo-wide server/
// freeze that a later authorized cut would inevitably break.
assert(
  !changedFiles.some(f =>
    f === 'package.json' ||
    f === 'pnpm-lock.yaml' ||
    f === 'package-lock.json' ||
    f === 'app/package.json' ||
    f === 'app/pnpm-lock.yaml'
  ),
  "package.json and lockfiles remain untouched"
)
assert(
  !changedFiles.some(f => f.includes('features/reading-analysis')),
  "reading-analysis remains untouched"
)
assert(
  !changedFiles.some(f =>
    f.includes('paperAssembly') ||
    (f.includes('basket') && !f.includes('BasketPreviewItem'))
  ),
  "basket / paperAssembly remains untouched"
)

// Adapter files under features/paper-intelligence/adapter/ must not
// be modified by the original C2 cut. C5a is the first approved
// downstream exception: it changes the PI adapter to feed confirmed
// paragraph structure into the already-dumb PaperSurface contract.
const allowedC5aAdapterFiles = new Set([
  'app/src/features/paper-intelligence/adapter/index.ts',
  'app/src/features/paper-intelligence/adapter/piToPaperTextMap.ts',
])
assert(
  !changedFiles.some(f =>
    f.includes('features/paper-intelligence/adapter/') &&
    !allowedC5aAdapterFiles.has(f)
  ),
  "adapter files remain untouched except approved C5a paragraph-structure adapter files"
)

// PaperSurface.tsx is intentionally allowed to change in C3 (Issue
// #21-C3): C3 introduces the visible active-evidence highlight and
// derives `activeEvidenceId` from the controlled `lectureFocus`
// prop. The C1/C2 invariants this script otherwise enforces (anchor
// protocol, no PI imports, no data-pi-* in PaperSurface, no state
// hooks, etc.) live in `verify-paper-surface-module-v1.mjs`; the
// C3-specific edge of the contract is asserted by
// `verify-paper-intelligence-paper-surface-evidence.mjs`.

// Shared papersurface primitives must remain untouched.
//
// tokens.mjs untouched-freeze retired 2026-07-08 by 刀⑤ render-fidelity
// Chunk A (authorized): the typography primitives required by standard
// v2 (font size / line height / margins / EN-ZH-heading font stacks)
// were added to this same module, with `.d.ts`/`.d.mts` parity. The
// live contract for tokens.mjs's shape now lives in
// `verify-paper-surface-tokens.mjs`.
assert(
  !changedFiles.some(f => f === 'shared/papersurface/segmentPaperText.mjs' || f === 'shared/papersurface/segmentPaperText.d.ts'),
  "shared/papersurface/segmentPaperText.mjs remains untouched"
)
assert(
  !changedFiles.some(f => f === 'shared/papersurface/anchorKeys.mjs' || f === 'shared/papersurface/anchorKeys.d.ts'),
  "shared/papersurface/anchorKeys.mjs remains untouched"
)

// Prototype-must-still-exist assertions retired 2026-07-08 by 刀⑤
// render-fidelity Chunk E (authorized): `paperSurfacePrototype/`
// (854-line TSX + 462-line CSS, unreachable dead code — no route ever
// mounted it, only self-referencing) was deleted per the render-
// fidelity plan, along with its own now-defunct
// `scripts/verify-paper-surface-prototype.mjs`. A "must still exist"
// assertion for deleted-on-purpose dead code can never pass again;
// retiring it here rather than asserting a falsehood as a permanent
// regression guard.

// ─── Adapter boundaries ───

console.log('\n=== Adapter boundaries ===')

assert(fileExists(ADAPTER_DIR), "adapter files live under features/paper-intelligence/adapter")

const adapterFiles = readdirSync(ADAPTER_DIR).filter(f => f.endsWith('.ts'))
assert(adapterFiles.length >= 4, `adapter directory has at least 4 .ts files (found ${adapterFiles.length})`)

for (const file of adapterFiles) {
  const filePath = join(ADAPTER_DIR, file)
  const content = readFile(filePath)

  // Strip comment lines for behavioral checks (single-line // and block /* */)
  const codeLines = content
    .split('\n')
    .filter(line => {
      const trimmed = line.trim()
      return !trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('/*')
    })
    .join('\n')

  assert(
    !content.includes("from 'react'") && !content.includes('from "react"') && !content.includes("import React"),
    `${file}: imports no React`
  )
  assert(
    !codeLines.includes('useState') && !codeLines.includes('useEffect') &&
    !codeLines.includes('useCallback') && !codeLines.includes('useMemo') &&
    !codeLines.includes('useRef'),
    `${file}: contains no hooks`
  )
  assert(
    !codeLines.includes('document.') && !codeLines.includes('window.') &&
    !codeLines.includes('HTMLElement') && !codeLines.includes('querySelector'),
    `${file}: contains no DOM APIs`
  )
  assert(
    !codeLines.includes('fetch(') && !codeLines.includes('localStorage') &&
    !codeLines.includes('useLocation') && !codeLines.includes('useSearchParams') &&
    !codeLines.includes('useNavigate'),
    `${file}: contains no fetch/localStorage/router reads`
  )
}

// PaperSurface does not import PI types
const paperSurfaceComponent = readFile(PAPER_SURFACE_TSX)
assert(
  !paperSurfaceComponent.includes('paperIntelligenceTypes') &&
  !paperSurfaceComponent.includes('PaperIntelligenceReport'),
  "PaperSurface does not import PI types"
)

// ─── Behavior contract ───

console.log('\n=== Behavior contract ===')

const questionsAdapter = readFile(join(ADAPTER_DIR, 'piToPaperQuestions.ts'))
assert(
  questionsAdapter.includes('`${section}-${questionNo}`') || questionsAdapter.includes('`${section}-${questionNo}`'),
  "PaperQuestion id uses ${paperSection}-${questionNo} convention"
)
// Check that PaperQuestion adapter does NOT include answer/explanation/distractorAnalysis/synonymSummary
assert(
  !questionsAdapter.includes("answer:") || questionsAdapter.includes("// PaperQuestion does NOT include answer"),
  "PaperQuestion adapter does not set answer field on output"
)
// More precise: check the push/return object does not include forbidden fields
assert(
  !questionsAdapter.includes("explanation:") && !questionsAdapter.includes("distractorAnalysis:") && !questionsAdapter.includes("synonymSummary:"),
  "PaperQuestion does not include explanation/distractorAnalysis/synonymSummary"
)

const harnessContent = readFile(HARNESS_PATH)
assert(
  harnessContent.includes('annotations={[]}'),
  "annotations are [] in C1"
)
assert(
  harnessContent.includes('mode="lecture"'),
  "mode is hardcoded lecture"
)
assert(
  harnessContent.includes('readingFocusBySection={{}}'),
  "readingFocusBySection is empty object"
)
assert(
  harnessContent.includes("'request-lecture-focus'") || harnessContent.includes('"request-lecture-focus"'),
  "onFocusIntent handles request-lecture-focus"
)

// ─── H3 panel locality ───

console.log('\n=== H3 panel locality ===')

const paperAssetAnalysisPanelContent = readFile(PAPER_ASSET_ANALYSIS_PANEL_PATH)
const legacyAnalysisPanelContent = readFile(LEGACY_ANALYSIS_PANEL_PATH)

assert(
  fileExists(PAPER_ASSET_ANALYSIS_PANEL_PATH),
  "PaperAssetAnalysisPanel component file exists"
)
assert(
  fileExists(LEGACY_ANALYSIS_PANEL_PATH),
  "LegacyAnalysisPanel component file exists"
)
assert(
  harnessContent.includes("from './PaperAssetAnalysisPanel'") &&
    harnessContent.includes("from './LegacyAnalysisPanel'"),
  "harness imports extracted right-panel components"
)
assert(
  harnessContent.includes('<PaperAssetAnalysisPanel') &&
    harnessContent.includes('<LegacyAnalysisPanel'),
  "harness renders extracted right-panel components"
)
assert(
  !harnessContent.includes('function PaperAssetAnalysisPanel') &&
    !harnessContent.includes('function AnalysisPanel') &&
    !harnessContent.includes('function SupportEvidenceRow') &&
    !harnessContent.includes('function DistractorRow'),
  "harness no longer owns right-panel rendering internals"
)
assert(
  paperAssetAnalysisPanelContent.includes('export function PaperAssetAnalysisPanel') &&
    paperAssetAnalysisPanelContent.includes('pi-ps-analysis-options--accordion') &&
    paperAssetAnalysisPanelContent.includes('pi-ps-analysis-empty--unpublished'),
  "PaperAssetAnalysisPanel owns reviewed paper-asset analysis UI"
)
assert(
  legacyAnalysisPanelContent.includes('export function LegacyAnalysisPanel') &&
    legacyAnalysisPanelContent.includes('function SupportEvidenceRow') &&
    legacyAnalysisPanelContent.includes('function DistractorRow'),
  "LegacyAnalysisPanel owns legacy support and distractor row rendering"
)
assert(
  legacyAnalysisPanelContent.includes('data-pi-quote-text-only="true"'),
  "LegacyAnalysisPanel preserves text-only distractor non-button marker"
)

// ─── Summary ───

console.log(`\n${'─'.repeat(50)}`)
console.log(`Results: ${passes} passed, ${failures} failed`)

if (failures > 0) {
  console.error('\nVerification FAILED.')
  process.exit(1)
} else {
  console.log('\nVerification PASSED.')
}
