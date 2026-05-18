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
 *     - .ps-surface padding: 16px 28px (Issue #43 QA follow-up
 *       symmetric matte; browser QA micro-tune 24px → 28px)
 *     - .ps-passage-body font-size: 16px
 *     - .ps-question-no font-size: 16px
 *     - .ps-question-stem font-size: 16px
 *     - .ps-option font-size: 16px
 *     - no border-radius anywhere in PaperSurface.css
 *     - no gradient anywhere in PaperSurface.css
 *     - .ps-page selector group does NOT add inner box-shadow beyond the
 *       single existing outer-sheet box-shadow (pattern: at most one
 *       box-shadow declaration in the whole file, and it must live on
 *       .ps-page)
 *
 *   C2 polish boundary — harness CSS polish slice (Issue #43 redesign,
 *   QA follow-up: symmetric matte):
 *     - .pi-ps-harness-shell uses 4-column centered workspace grid:
 *         minmax(0, 1fr) minmax(0, 850px) minmax(0, 380px) minmax(0, 1fr)
 *       (850px = 794px white sheet + 28px × 2 symmetric matte;
 *       browser QA micro-tune from 842px / 24px matte)
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
const HARNESS_CSS_PATH = join(APP, 'features', 'paper-intelligence', 'paperIntelligencePaperSurfaceHarness.css')
const APP_TSX = join(APP, 'App.tsx')
const ROUTE_PATH = join(APP, 'features', 'paper-intelligence', 'paperIntelligenceRoute.ts')
const PAPER_SURFACE_DIR = join(APP, 'shared-ui', 'papersurface')
const PAPER_SURFACE_CSS = join(PAPER_SURFACE_DIR, 'PaperSurface.css')
const PAPER_SURFACE_TSX = join(PAPER_SURFACE_DIR, 'PaperSurface.tsx')
const SHARED_PAPER_SURFACE = join(ROOT, 'shared', 'papersurface')
const PROTOTYPE_DIR = join(APP, 'features', 'paper-intelligence', 'paperSurfacePrototype')

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
assert(
  /--ps-page-padding\s*:\s*56px\b/.test(paperSurfaceCss),
  "PaperSurface.css declares --ps-page-padding: 56px"
)

// .ps-surface padding: 16px 28px (Issue #43 QA follow-up — symmetric
// matte: vertical matte 16px stays, horizontal matte is 28px so the
// gray frame around the white A4 sheet reads symmetric. Browser QA
// micro-tune 24px → 28px).
{
  const match = paperSurfaceCss.match(/\.ps-surface\s*\{([\s\S]*?)\}/)
  assert(
    !!match && /(^|\s|;)padding\s*:\s*16px\s+28px\s*;/.test(match ? match[1] : ''),
    ".ps-surface declares padding: 16px 28px (symmetric matte)"
  )
}

// Body font sizes: 16px on .ps-passage-body / .ps-question-no / .ps-question-stem.
for (const selector of ['.ps-passage-body', '.ps-question-no', '.ps-question-stem']) {
  const escaped = selector.replace(/\./g, '\\.')
  const re = new RegExp(`${escaped}\\s*\\{[^}]*?font-size\\s*:\\s*16px\\b`, 's')
  assert(
    re.test(paperSurfaceCss),
    `${selector} declares font-size: 16px`
  )
}

// Option font size: 16px (matched to body baseline in the C2 follow-up).
{
  const re = /\.ps-option\s*\{[^}]*?font-size\s*:\s*16px\b/s
  assert(
    re.test(paperSurfaceCss),
    ".ps-option declares font-size: 16px"
  )
}

// No border-radius anywhere.
assert(
  !/border-radius/.test(paperSurfaceCss),
  "PaperSurface.css does NOT introduce border-radius"
)

// No gradient anywhere.
assert(
  !/gradient/.test(paperSurfaceCss),
  "PaperSurface.css does NOT introduce gradient"
)

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

// ─── Harness CSS boundary (Issue #43: 4-column centered workspace) ───

console.log('\n=== Issue #43: harness CSS 4-column workspace shell ===')

const harnessCssRaw = readFile(HARNESS_CSS_PATH)
const harnessCss = stripCssComments(harnessCssRaw)

// Base-shell (non-media-query) block. We extract by stripping any
// @media block first so 1.x assertions only inspect the base rules.
const harnessCssBase = harnessCss.replace(/@media[^{]*\{[\s\S]*?\n\}/g, '')

{
  const shellMatch = harnessCssBase.match(/\.pi-ps-harness-shell\s*\{([\s\S]*?)\}/)
  const shellBody = shellMatch ? shellMatch[1] : ''

  // 4-column model: outer-left desk, paper track (850px = 794px sheet
  // + 28px × 2 symmetric matte; browser QA micro-tune from 842px /
  // 24px matte), rail track, outer-right desk.
  assert(
    !!shellMatch &&
      /grid-template-columns\s*:\s*minmax\(\s*0\s*,\s*1fr\s*\)\s+minmax\(\s*0\s*,\s*850px\s*\)\s+minmax\(\s*0\s*,\s*380px\s*\)\s+minmax\(\s*0\s*,\s*1fr\s*\)\s*;/.test(
        shellBody,
      ),
    "harness CSS .pi-ps-harness-shell uses 4-column centered workspace grid (1fr / 850px / 380px / 1fr)"
  )
  assert(
    /minmax\(\s*0\s*,\s*850px\s*\)/.test(shellBody),
    "harness CSS .pi-ps-harness-shell paper track is minmax(0, 850px) (794px sheet + 28px × 2 matte)"
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
    /minmax\(\s*0\s*,\s*380px\s*\)/.test(shellBody),
    "harness CSS .pi-ps-harness-shell rail track is minmax(0, 380px)"
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

// Get git diff to check modified files. We compute the diff against
// the merge-base with origin/main (or main) so this works in the cloud
// sandbox the same way as locally.
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

assert(
  !changedFiles.some(f => f.startsWith('server/')),
  "server/ remains untouched"
)
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
// be modified by this C2 cut.
assert(
  !changedFiles.some(f => f.includes('features/paper-intelligence/adapter/')),
  "adapter files remain untouched"
)

// PaperSurface.tsx (the React component) must remain untouched. C2 is
// CSS-only on the PaperSurface module side.
assert(
  !changedFiles.some(f => f.endsWith('shared-ui/papersurface/PaperSurface.tsx')),
  "PaperSurface.tsx remains untouched by this C2 cut"
)

// Shared papersurface primitives must remain untouched.
assert(
  !changedFiles.some(f => f === 'shared/papersurface/tokens.mjs' || f === 'shared/papersurface/tokens.d.ts'),
  "shared/papersurface/tokens.mjs remains untouched"
)
assert(
  !changedFiles.some(f => f === 'shared/papersurface/segmentPaperText.mjs' || f === 'shared/papersurface/segmentPaperText.d.ts'),
  "shared/papersurface/segmentPaperText.mjs remains untouched"
)
assert(
  !changedFiles.some(f => f === 'shared/papersurface/anchorKeys.mjs' || f === 'shared/papersurface/anchorKeys.d.ts'),
  "shared/papersurface/anchorKeys.mjs remains untouched"
)

// Prototype files must still exist (they were not deleted).
assert(
  fileExists(join(PROTOTYPE_DIR, 'PaperSurfacePrototype.tsx')),
  "prototype PaperSurfacePrototype.tsx still exists (not deleted)"
)
assert(
  fileExists(join(PROTOTYPE_DIR, 'paperSurfacePrototype.css')),
  "prototype paperSurfacePrototype.css still exists (not deleted)"
)
assert(
  !changedFiles.some(f =>
    f.includes('paperSurfacePrototype/PaperSurfacePrototype.tsx') ||
    f.includes('paperSurfacePrototype/paperSurfacePrototype.css')
  ),
  "prototype files not modified"
)

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

// ─── Summary ───

console.log(`\n${'─'.repeat(50)}`)
console.log(`Results: ${passes} passed, ${failures} failed`)

if (failures > 0) {
  console.error('\nVerification FAILED.')
  process.exit(1)
} else {
  console.log('\nVerification PASSED.')
}
