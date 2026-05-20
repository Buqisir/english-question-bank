/**
 * verify-c5b-structure-brace.mjs
 *
 * C5b verify script — Structure Brace / 结构钩.
 *
 * Asserts:
 *   1. No PaperSurface / shared / papersurface changes.
 *   2. No report.json / input.json / adapter changes.
 *   3. No AI diagnostic strings (load bars, vocabulary, grammar).
 *   4. Brace code lives only in harness layer.
 *   5. Brace overlay has `pointer-events: none`.
 *   6. Brace z-index is below evidence line (< 5).
 *   7. Scroll code targets `data-paper-paragraph-id`.
 *   8. No connector-line implementation from rail button to brace.
 *   9. Paragraph controls render P labels from passageStructure.
 *  10. Structure target cleared on resize.
 */

import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

let passed = 0
let failed = 0

function assert(condition, label) {
  if (condition) {
    passed++
    console.log(`  ✓ ${label}`)
  } else {
    failed++
    console.error(`  ✗ FAIL: ${label}`)
  }
}

function readFile(relPath) {
  return readFileSync(resolve(ROOT, relPath), 'utf8')
}

function gitDiffFiles() {
  try {
    // Include both staged and unstaged changes vs main
    const tracked = execSync('git diff --name-only main', { cwd: ROOT, encoding: 'utf8' }).trim()
    const staged = execSync('git diff --name-only --cached main', { cwd: ROOT, encoding: 'utf8' }).trim()
    const all = new Set([...tracked.split('\n'), ...staged.split('\n')].filter(Boolean))
    return [...all]
  } catch {
    return []
  }
}

const changedFiles = gitDiffFiles()

// ─── Load source files ───

const harnessTsx = readFile('app/src/features/paper-intelligence/PaperIntelligencePaperSurfaceHarness.tsx')
const harnessCss = readFile('app/src/features/paper-intelligence/paperIntelligencePaperSurfaceHarness.css')
const braceTsx = readFile('app/src/features/paper-intelligence/structureBrace.tsx')

console.log('\n─── C5b: forbidden changes (no PaperSurface/shared/data/model) ───\n')

// 1. No PaperSurface / shared / papersurface changes
const forbiddenPatterns = [
  'app/src/shared-ui/papersurface/PaperSurface.tsx',
  'app/src/shared-ui/papersurface/PaperSurface.css',
  'shared/papersurface/',
]

for (const pat of forbiddenPatterns) {
  const touched = changedFiles.some((f) => f.includes(pat) || f.startsWith(pat))
  assert(!touched, `${pat} not modified`)
}

// 2. No report.json / input.json / adapter changes
const dataForbidden = [
  'app/public/reports/paper-intelligence/paper-2024-xkb1-reading/report.json',
  'app/public/reports/paper-intelligence/paper-2024-xkb1-reading/input.json',
  'app/src/features/paper-intelligence/adapter/',
]

for (const pat of dataForbidden) {
  const touched = changedFiles.some((f) => f === pat || f.startsWith(pat))
  assert(!touched, `${pat} not modified`)
}

// No route/server/package/lockfile changes
const infraForbidden = [
  'server/',
  'package.json',
  'pnpm-lock.yaml',
  'app/package.json',
  'app/pnpm-lock.yaml',
]

for (const pat of infraForbidden) {
  const touched = changedFiles.some((f) => f === pat || f.startsWith(pat))
  assert(!touched, `${pat} not modified`)
}

console.log('\n─── C5b: no AI diagnostic strings ───\n')

// 3. No AI diagnostic strings in new/modified harness code
const braceAllSrc = harnessTsx + harnessCss + braceTsx
const aiDiagPatterns = [
  /vocabularyChunkLoad/i,
  /grammarLoad/i,
  /discourseStructureLoad/i,
  /topicBackgroundLoad/i,
  /evidenceFindingLoad/i,
  /aiInitialBand/i,
  /keyChunks/i,
]

for (const pat of aiDiagPatterns) {
  // Only check within the C5b-specific new code (structureBrace.tsx)
  assert(!pat.test(braceTsx), `structureBrace.tsx does not contain AI diagnostic: ${pat.source}`)
}

console.log('\n─── C5b: brace code lives only in harness layer ───\n')

// 4. Brace code lives only in harness layer
assert(
  changedFiles.every(
    (f) =>
      f.startsWith('app/src/features/paper-intelligence/') ||
      f.startsWith('scripts/')
  ),
  'all changed files are in harness layer or scripts'
)

// structureBrace.tsx is in the right directory
assert(
  changedFiles.includes('app/src/features/paper-intelligence/structureBrace.tsx'),
  'structureBrace.tsx is a changed file in features/paper-intelligence/'
)

console.log('\n─── C5b: brace overlay properties ───\n')

// 5. Brace overlay has `pointer-events: none`
assert(
  braceTsx.includes('pointerEvents: \'none\'') || braceTsx.includes('pointer-events: none') || braceTsx.includes('pointerEvents: "none"'),
  'structureBrace.tsx sets pointer-events: none'
)

assert(
  harnessCss.includes('pointer-events: none'),
  'harness CSS declares pointer-events: none for brace'
)

// 6. Brace z-index is below evidence line (< 5)
// Evidence line is z-index: 5, brace should be z-index: 3
assert(
  braceTsx.includes('zIndex: 3'),
  'structureBrace.tsx uses zIndex: 3 (below evidence line z-index: 5)'
)

assert(
  harnessCss.includes('z-index: 3'),
  'harness CSS declares z-index: 3 for brace'
)

// Check that evidence line is still z-index: 5
assert(
  harnessCss.includes('z-index: 5'),
  'evidence line still at z-index: 5'
)

console.log('\n─── C5b: scroll targets data-paper-paragraph-id ───\n')

// 7. Scroll code targets `data-paper-paragraph-id`
assert(
  harnessTsx.includes('data-paper-paragraph-id'),
  'harness TSX references data-paper-paragraph-id for scroll targeting'
)

assert(
  braceTsx.includes('data-paper-paragraph-id'),
  'structureBrace.tsx queries data-paper-paragraph-id for geometry'
)

console.log('\n─── C5b: no connector-line from rail button to brace ───\n')

// 8. No connector-line implementation
// A connector would draw a horizontal line from rail to brace
// Check for absence of connector patterns
const connectorPatterns = [
  /connector[-_]line/i,
  /horizontal[-_]line/i,
  /rail[-_]to[-_]brace/i,
  /rail[-_]connector/i,
]

for (const pat of connectorPatterns) {
  assert(!pat.test(braceAllSrc), `no connector pattern: ${pat.source}`)
}

// The brace SVG path should only have vertical + cap geometry, no long horizontal
// Check that the brace path doesn't draw a line longer than the cap
assert(
  !braceTsx.includes('M 0') || !braceTsx.includes('L 200'),
  'brace does not draw a long horizontal connector'
)

console.log('\n─── C5b: paragraph controls ───\n')

// 9. Paragraph controls render P labels
assert(
  harnessTsx.includes('篇章'),
  'harness renders 篇章 button label'
)

assert(
  harnessTsx.includes('para.label'),
  'harness renders paragraph labels from passageStructure'
)

assert(
  harnessTsx.includes('pi-ps-structure-controls'),
  'harness uses pi-ps-structure-controls class'
)

assert(
  harnessTsx.includes('pi-ps-structure-btn'),
  'harness uses pi-ps-structure-btn class'
)

assert(
  harnessCss.includes('.pi-ps-structure-controls'),
  'CSS defines .pi-ps-structure-controls'
)

assert(
  harnessCss.includes('.pi-ps-structure-btn'),
  'CSS defines .pi-ps-structure-btn'
)

assert(
  harnessCss.includes('.pi-ps-structure-btn--active'),
  'CSS defines .pi-ps-structure-btn--active'
)

console.log('\n─── C5b: structure target cleared on resize ───\n')

// 10. Structure target cleared on resize/breakpoint cross
assert(
  harnessTsx.includes('setActiveStructureTarget(null)'),
  'harness clears activeStructureTarget on resize'
)

// Verify harness owns a dedicated window resize handler that clears brace
assert(
  harnessTsx.includes("window.addEventListener('resize'") || harnessTsx.includes('window.addEventListener("resize"'),
  'harness registers window resize handler'
)

// Verify the StructureBraceOverlay does NOT register window resize remeasurement
assert(
  !braceTsx.includes("window.addEventListener('resize'") && !braceTsx.includes('window.addEventListener("resize"'),
  'StructureBraceOverlay does NOT register window resize remeasurement'
)

// Verify it's inside the onChange handler (near the onChange's setIsStackedMode)
// The onChange handler is the second occurrence of setIsStackedMode(stackedMql.matches)
const firstIdx = harnessTsx.indexOf('setIsStackedMode(stackedMql.matches)')
const onChangeIdx = harnessTsx.indexOf('setIsStackedMode(stackedMql.matches)', firstIdx + 1)
const structureClearIdx = harnessTsx.indexOf('setActiveStructureTarget(null)')
assert(
  onChangeIdx > 0 && structureClearIdx > onChangeIdx && structureClearIdx - onChangeIdx < 200,
  'activeStructureTarget cleared near viewport onChange handler'
)

// Verify brace hidden at <=1199px in CSS
assert(
  harnessCss.includes('@media (max-width: 1199px)') &&
  harnessCss.includes('.pi-ps-structure-brace') &&
  harnessCss.includes('display: none'),
  'brace hidden via display:none at <=1199px'
)

console.log('\n─── C5b: handleToggleInsight / handleCloseInsight / Esc clear activeStructureTarget ───\n')

// Verify handleToggleInsight clears activeStructureTarget
{
  const toggleIdx = harnessTsx.indexOf('const handleToggleInsight')
  const closeIdx = harnessTsx.indexOf('const handleCloseInsight')
  const toggleBody = harnessTsx.slice(toggleIdx, closeIdx)
  assert(
    toggleBody.includes('setActiveStructureTarget(null)'),
    'handleToggleInsight clears activeStructureTarget'
  )
}

// Verify handleCloseInsight clears activeStructureTarget
{
  const closeIdx = harnessTsx.indexOf('const handleCloseInsight')
  const nextHandler = harnessTsx.indexOf('const handle', closeIdx + 30)
  const closeBody = harnessTsx.slice(closeIdx, nextHandler)
  assert(
    closeBody.includes('setActiveStructureTarget(null)'),
    'handleCloseInsight clears activeStructureTarget'
  )
}

// Verify Esc path (handleRailKeyDown) clears activeStructureTarget
{
  const escIdx = harnessTsx.indexOf('const handleRailKeyDown')
  const nextHandler = harnessTsx.indexOf('const handle', escIdx + 30)
  const escBody = harnessTsx.slice(escIdx, nextHandler > 0 ? nextHandler : escIdx + 800)
  assert(
    escBody.includes('setActiveStructureTarget(null)'),
    'Esc path (handleRailKeyDown) clears activeStructureTarget'
  )
}

console.log('\n─── C5b: passage mode queries .ps-passage-body ───\n')

// Verify passage mode targets .ps-passage-body, not section root
assert(
  braceTsx.includes('.ps-passage-body'),
  'structureBrace.tsx queries .ps-passage-body for passage mode measurement'
)

// Verify it queries data-paper-section first (to find the section), then .ps-passage-body inside
assert(
  braceTsx.includes('data-paper-section') && braceTsx.includes('.ps-passage-body'),
  'passage mode: queries section via data-paper-section then measures .ps-passage-body inside'
)

// Verify the section root is NOT directly assigned as el for passage mode
// The pattern should be: find section, then querySelector .ps-passage-body
{
  const passageModeBlock = braceTsx.slice(
    braceTsx.indexOf('// Passage mode'),
    braceTsx.indexOf('if (!el)')
  )
  assert(
    passageModeBlock.includes("querySelector<HTMLElement>('.ps-passage-body')") ||
    passageModeBlock.includes('querySelector<HTMLElement>(\'.ps-passage-body\')'),
    'passage mode measures .ps-passage-body element (not section root)'
  )
}

console.log('\n─── C5b: brace geometry includes scrollTop offset ───\n')

// Verify the brace top calculation includes scroller.scrollTop so the
// absolute-positioned SVG aligns with content coordinates, not viewport
// coordinates. Without this the brace drifts ~scrollTop px above the target
// at 1536/1440/1280 when the scroller is scrolled.
assert(
  braceTsx.includes('scroller.scrollTop'),
  'brace top calculation includes scroller.scrollTop for content-relative positioning'
)

// Verify the full expression pattern: elRect.top - scrollerRect.top + scroller.scrollTop
assert(
  braceTsx.includes('elRect.top - scrollerRect.top + scroller.scrollTop'),
  'brace top = elRect.top - scrollerRect.top + scroller.scrollTop (content-relative)'
)

console.log('\n─── C5b: no steering / AGENTS diff after rebasing latest main ───\n')

// Verify no steering or AGENTS changes in diff
{
  const steeringFiles = changedFiles.filter(
    (f) => f.startsWith('.kiro/steering/') || f === 'AGENTS.md' || f === 'CLAUDE.md'
  )
  assert(
    steeringFiles.length === 0,
    'no steering / AGENTS / CLAUDE diff exists after rebasing latest main'
  )
}

console.log('\n─── C5b: CSS contains no purple fallback ───\n')

// Verify no purple fallback (#a78bfa or similar brand purple) in C5b CSS
assert(
  !harnessCss.includes('#a78bfa'),
  'CSS does not contain #a78bfa purple fallback'
)

// Also check for other purple shades that shouldn't appear
const purplePatterns = ['#7c3aed', '#8b5cf6', '#a78bfa', '#c084fc', '#6d28d9']
for (const hex of purplePatterns) {
  assert(
    !harnessCss.includes(hex),
    `CSS does not contain purple hex ${hex}`
  )
}

console.log('\n─── C5b: brace visual spec compliance ───\n')

// Warm charcoal pencil tone
assert(
  braceTsx.includes('rgba(47, 41, 35, 0.45)'),
  'brace uses warm charcoal pencil tone rgba(47, 41, 35, 0.45)'
)

// Stroke width ~1.5px
assert(
  braceTsx.includes('1.5'),
  'brace uses stroke width ~1.5px'
)

// Round caps
assert(
  braceTsx.includes('strokeLinecap="round"') || braceTsx.includes('strokeLinecap={"round"}'),
  'brace uses round stroke line caps'
)

// No gradient/shadow/glow
assert(
  !braceTsx.includes('linearGradient') && !braceTsx.includes('radialGradient'),
  'brace has no gradient'
)
assert(
  !braceTsx.includes('filter') && !braceTsx.includes('drop-shadow'),
  'brace has no shadow/glow/filter'
)

// No semantic colors
const semanticColors = ['green', 'amber', 'red', 'blue', 'purple', '#10b981', '#f59e0b']
for (const c of semanticColors) {
  assert(
    !braceTsx.toLowerCase().includes(c.toLowerCase()),
    `brace does not use semantic color: ${c}`
  )
}

// ─── Summary ───

console.log(`\n${'═'.repeat(50)}`)
console.log(`  C5b verify: ${passed} passed, ${failed} failed`)
console.log(`${'═'.repeat(50)}\n`)

if (failed > 0) {
  process.exit(1)
}
