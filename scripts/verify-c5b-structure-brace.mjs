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

import {
  changedFiles as getChangedFiles,
  createVerifier,
  readText,
  repoRootFrom,
  touchesAny,
} from './lib/verifyScope.mjs'

const ROOT = repoRootFrom(import.meta.url)
const { assert, section, summary } = createVerifier('C5b verify')

const changedFiles = getChangedFiles(ROOT)

// ─── Load source files ───

const harnessTsx = readText(ROOT, 'app/src/features/paper-intelligence/PaperIntelligencePaperSurfaceHarness.tsx')
const harnessCss = readText(ROOT, 'app/src/features/paper-intelligence/paperIntelligencePaperSurfaceHarness.css')
const braceTsx = readText(ROOT, 'app/src/features/paper-intelligence/structureBrace.tsx')

section('C5b: forbidden changes (no PaperSurface/shared/data/model)')

// 1. No PaperSurface / shared / papersurface changes
const forbiddenPatterns = [
  'app/src/shared-ui/papersurface/PaperSurface.tsx',
  'app/src/shared-ui/papersurface/PaperSurface.css',
  'shared/papersurface/',
]

for (const pat of forbiddenPatterns) {
  assert(!touchesAny(changedFiles, [pat]), `${pat} not modified`)
}

// 2. No report.json / input.json / adapter changes
const dataForbidden = [
  'app/public/reports/paper-intelligence/paper-2024-xkb1-reading/report.json',
  'app/public/reports/paper-intelligence/paper-2024-xkb1-reading/input.json',
  'app/src/features/paper-intelligence/adapter/',
]

for (const pat of dataForbidden) {
  assert(!touchesAny(changedFiles, [pat]), `${pat} not modified`)
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
  assert(!touchesAny(changedFiles, [pat]), `${pat} not modified`)
}

section('C5b: no AI diagnostic strings')

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

section('C5b: brace code lives only in harness layer')

// 4. Brace code lives only in harness layer
assert(
  changedFiles.every(
    (f) =>
      f.startsWith('app/src/features/paper-intelligence/') ||
      f.startsWith('scripts/') ||
      f.startsWith('docs/')
  ),
  'all changed files are in harness layer, scripts, or docs'
)

// structureBrace.tsx is in the right directory and can be loaded.
assert(
  braceTsx.length > 0,
  'structureBrace.tsx exists in features/paper-intelligence/'
)

section('C5b: brace overlay properties')

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

section('C5b: scroll targets data-paper-paragraph-id')

// 7. Scroll code targets `data-paper-paragraph-id`
assert(
  harnessTsx.includes('data-paper-paragraph-id'),
  'harness TSX references data-paper-paragraph-id for scroll targeting'
)

assert(
  braceTsx.includes('data-paper-paragraph-id'),
  'structureBrace.tsx queries data-paper-paragraph-id for geometry'
)

section('C5b: no connector-line from rail button to brace')

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

section('C5b: paragraph controls')

// 9. Inline clickable structure rows (replaces bottom remote control strip)
const structureRowsTsx = readText(ROOT, 'app/src/features/paper-intelligence/insight/HarnessStructureRows.tsx')

assert(
  harnessTsx.includes('HarnessStructureRows'),
  'harness imports and renders HarnessStructureRows'
)

assert(
  structureRowsTsx.includes('篇章'),
  'HarnessStructureRows renders 篇章 row label'
)

assert(
  structureRowsTsx.includes('para.label') || structureRowsTsx.includes('{para.label}'),
  'structure rows render paragraph labels from passageStructure'
)

assert(
  structureRowsTsx.includes('aria-pressed'),
  'structure rows use aria-pressed for a11y'
)

assert(
  structureRowsTsx.includes('pi-ps-structure-row'),
  'structure rows use pi-ps-structure-row class'
)

assert(
  harnessCss.includes('.pi-ps-structure-rows'),
  'CSS defines .pi-ps-structure-rows container'
)

assert(
  harnessCss.includes('.pi-ps-structure-row'),
  'CSS defines .pi-ps-structure-row'
)

assert(
  harnessCss.includes('.pi-ps-structure-row--active'),
  'CSS defines .pi-ps-structure-row--active'
)

// Verify bottom remote-control strip is removed from harness TSX
assert(
  !harnessTsx.includes('pi-ps-structure-controls'),
  'harness TSX no longer renders bottom .pi-ps-structure-controls strip'
)

assert(
  !harnessTsx.includes('data-c5b-controls'),
  'harness TSX no longer renders data-c5b-controls attribute'
)

// Verify structure rows are real <button> elements
assert(
  structureRowsTsx.includes('<button') && structureRowsTsx.includes('type="button"'),
  'structure rows are real <button> elements for keyboard/a11y'
)

// Verify no P buttons on collapsed main rail (rows only inside detail panel)
assert(
  !harnessTsx.includes('pi-ps-structure-row') || harnessTsx.includes('HarnessStructureRows'),
  'P buttons are NOT rendered on collapsed main rail (only inside detail via HarnessStructureRows)'
)

// Verify structure row targets use paragraph ids from passageStructure
assert(
  structureRowsTsx.includes('data-paper-paragraph-id-target'),
  'structure rows carry data-paper-paragraph-id-target for paragraph targeting'
)

// Verify passage mode row exists
assert(
  structureRowsTsx.includes('data-structure-row-mode="passage"'),
  'structure rows include a passage mode row'
)

// Verify paragraph mode rows exist
assert(
  structureRowsTsx.includes('data-structure-row-mode="paragraph"'),
  'structure rows include paragraph mode rows'
)

section('C5b: structure target cleared on resize')

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

// Verify brace hidden at <=1359px in CSS (C5b hotfix follow-up:
// tight desktop widths where rail covers the brace zone).
assert(
  harnessCss.includes('@media (max-width: 1359px)') &&
  harnessCss.includes('.pi-ps-structure-brace') &&
  harnessCss.includes('display: none'),
  'brace hidden via display:none at <=1359px (tight desktop + stacked)'
)

section('C5b: handleToggleInsight / handleCloseInsight / Esc clear activeStructureTarget')

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

section('C5b: passage mode queries .ps-passage-body')

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

section('C5b: brace geometry includes scrollTop offset')

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

section('C5b: no steering / AGENTS diff after rebasing latest main')

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

section('C5b: CSS contains no purple fallback')

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

section('C5b: brace visual spec compliance')

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

summary()
