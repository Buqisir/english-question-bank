#!/usr/bin/env node
/**
 * verify-reading-analysis-retire.mjs
 *
 * reading-analysis-retire (2026-07-16) new verify: proves the orphan-branch
 * retirement (docs/cuts/reading-analysis-retire/plan.md) is complete and the
 * live surfaces it must not touch are byte-level intact.
 *
 * Three groups of assertions:
 *   1. Retirement — every file/directory this cut deleted is gone, and
 *      App.tsx/main.tsx source carries zero `view === 'paper-intelligence'`
 *      mount branch.
 *   2. Survival — the reachability.md §2 keep-list is still consumed by the
 *      live surfaces (PaperBrowsePage.tsx's paperIntelligence.css + evidence
 *      line imports; the 7 live *Adapter.ts files import PaperSurfaceData
 *      from its new home, paperIntelligenceTypes.ts — tsc itself proves this
 *      resolves, via the pipeline's full build/typecheck step).
 *   3. Self-heal — main.tsx's boot-time replaceState rewrite for both
 *      retired URL families is present in source (static assertion; the
 *      behavioral proof that it actually redirects lives in DP-2,
 *      docs/cuts/reading-analysis-retire/qa/dp2-reading-analysis-retire.mjs).
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

let passed = 0
let failed = 0

function assert(name, condition, details = '') {
  if (condition) {
    passed += 1
    console.log(`PASS ${name}`)
  } else {
    failed += 1
    console.error(`FAIL ${name}${details ? `\n  ${details}` : ''}`)
  }
}

function read(relPath) {
  return readFileSync(path.join(rootDir, relPath), 'utf8')
}

function gone(relPath) {
  return !existsSync(path.join(rootDir, relPath))
}

console.log('reading-analysis-retire verify')

// ============================================================
// 1. Retirement — files/directories gone
// ============================================================

assert('features/reading-analysis/ directory does not exist', gone('app/src/features/reading-analysis'))

const orphanFiles = [
  'app/src/features/paper-intelligence/PaperIntelligencePreview.tsx',
  'app/src/features/paper-intelligence/PaperIntelligencePaperSurfaceHarness.tsx',
  'app/src/features/paper-intelligence/LegacyAnalysisPanel.tsx',
  'app/src/features/paper-intelligence/distractorLabels.ts',
  'app/src/features/paper-intelligence/structureBrace.tsx',
  'app/src/features/paper-intelligence/paperSurfaceHostInteraction.ts',
  'app/src/features/paper-intelligence/groupChromeBlocks.ts',
  'app/src/features/paper-intelligence/paperIntelligencePaperSurfaceHarness.css',
  'app/src/features/paper-intelligence/insight/insightChipLabel.ts',
  'app/src/features/paper-intelligence/insight/insightChipShortLabel.ts',
  'app/src/features/paper-intelligence/insight/HarnessInsightPanelContent.tsx',
  'app/src/features/paper-intelligence/insight/HarnessStructureRows.tsx',
  'app/src/features/paper-intelligence/preview/paperIntelligencePreviewModel.ts',
  'app/src/features/paper-intelligence/preview/AnchoredPopover.tsx',
]
for (const relPath of orphanFiles) {
  assert(`orphan file gone: ${relPath}`, gone(relPath))
}

// Former solo-surface verifier's independent boundary: the retired harness
// helper must not return through the shared, live PaperSurface.
assert(
  'PaperSurface.tsx does not reference groupChrome / groupChromeBlocks',
  !/groupChrome/i.test(read('app/src/shared-ui/papersurface/PaperSurface.tsx')),
)

assert('adapter/ directory does not exist', gone('app/src/features/paper-intelligence/adapter'))
assert('evidence/ directory does not exist', gone('app/src/features/paper-intelligence/evidence'))
assert('readingAnalysisRoute.ts does not exist', gone('app/src/features/paper-intelligence/paperIntelligenceRoute.ts'))
assert(
  'app/src/features/reading-analysis/readingAnalysisRoute.ts does not exist (covered by whole-directory check above too)',
  gone('app/src/features/reading-analysis/readingAnalysisRoute.ts'),
)
assert(
  'static reports mirror gone: app/public/reports/paper-intelligence/',
  gone('app/public/reports/paper-intelligence'),
)

const appSrc = read('app/src/App.tsx')
const mainSrc = read('app/src/main.tsx')
assert(
  "App.tsx has zero `view === 'paper-intelligence'` mount branch",
  // Code-context match (`if (` / `=== 'paper-intelligence') {`), not a bare
  // substring search — this cut's own rationale comments legitimately name
  // the retired literal in prose (documenting what used to be here), which
  // a naive substring check would misfire on.
  !/if\s*\(\s*(currentPiRoute\.kind|view)\s*===\s*['"]paper-intelligence['"]/.test(appSrc) &&
    !appSrc.includes('const [currentPiRoute') &&
    !appSrc.includes('setCurrentPiRoute('),
  'App.tsx still mounts a branch on the retired paper-intelligence route state',
)
assert(
  "main.tsx no longer imports the retired ReadingAnalysisDemoRoute / route parsers",
  !mainSrc.includes('ReadingAnalysisDemoRoute') &&
    !mainSrc.includes('parseReadingAnalysisRoute') &&
    !mainSrc.includes('parsePaperIntelligenceRoute'),
  'main.tsx still imports a retired route module',
)
assert(
  'App.tsx no longer imports PaperIntelligencePreview / PaperIntelligencePaperSurfaceHarness',
  !appSrc.includes('PaperIntelligencePreview') && !appSrc.includes('PaperIntelligencePaperSurfaceHarness'),
)

// ============================================================
// 2. Survival — reachability.md §2 keep-list still wired to live surfaces
// ============================================================

const paperBrowseSrc = read('app/src/features/paper-browse/PaperBrowsePage.tsx')
assert(
  'PaperBrowsePage.tsx still imports paperIntelligence.css (shared style source)',
  /import\s*['"]\.\.\/paper-intelligence\/paperIntelligence\.css['"]/.test(paperBrowseSrc),
)
assert(
  'PaperBrowsePage.tsx still imports the evidence-line component (paperIntelligenceEvidenceLine)',
  /from ['"]\.\.\/paper-intelligence\/preview\/paperIntelligenceEvidenceLine['"]/.test(paperBrowseSrc),
)
assert(
  'evidence-line geometry helper survives on disk',
  existsSync(path.join(rootDir, 'app/src/features/paper-intelligence/preview/paperIntelligenceEvidenceLineGeometry.ts')),
)

const typesSrc = read('app/src/features/paper-intelligence/paperIntelligenceTypes.ts')
assert(
  'PaperSurfaceData type lives in paperIntelligenceTypes.ts (migrated off the retired adapter/index.ts barrel)',
  /export type PaperSurfaceData\s*=\s*\{/.test(typesSrc),
)

const liveAdapters = [
  'app/src/features/paper-intelligence/paperAssetSurfaceAdapter.ts',
  'app/src/features/paper-intelligence/sevenChoicesSurfaceAdapter.ts',
  'app/src/features/paper-intelligence/clozePaperViewAdapter.ts',
  'app/src/features/paper-intelligence/grammarFillPaperViewAdapter.ts',
  'app/src/features/paper-intelligence/writingPaperViewAdapter.ts',
  'app/src/features/paper-intelligence/clozeAnalysisSurfaceAdapter.ts',
  'app/src/features/paper-intelligence/grammarFillAnalysisSurfaceAdapter.ts',
]
for (const relPath of liveAdapters) {
  const src = read(relPath)
  assert(
    `${path.basename(relPath)} imports PaperSurfaceData from ./paperIntelligenceTypes.ts (not the retired adapter/ barrel)`,
    /PaperSurfaceData[\s\S]{0,200}from ['"]\.\/paperIntelligenceTypes\.ts['"]/.test(src) ||
      (src.includes('PaperSurfaceData') && !src.includes("from './adapter/index.ts'")),
    'still imports from the retired ./adapter/index.ts barrel, or PaperSurfaceData missing entirely',
  )
  assert(
    `${path.basename(relPath)} does not import from the retired ./adapter/ barrel`,
    !src.includes("from './adapter/index.ts'") && !src.includes("from './adapter/"),
  )
}
// The claim that these imports actually RESOLVE (i.e. paperIntelligenceTypes.ts
// really exports PaperSurfaceData with the right shape, and there's no deeper
// coupling reachability.md's Explore pass missed) is proven exhaustively by
// `pnpm -C app exec tsc --noEmit` in the same pipeline step as this script —
// re-deriving that proof here would just be a weaker reimplementation of tsc.

// ============================================================
// 3. Self-heal — static source assertion (behavioral proof lives in DP-2)
// ============================================================

assert(
  "main.tsx self-heals ?view=paper-intelligence&paperId=<id> to paper-browse lecture view via replaceState",
  mainSrc.includes("'paper-intelligence'") &&
    mainSrc.includes("'paper-browse'") &&
    mainSrc.includes('lecture') &&
    mainSrc.includes('history.replaceState'),
  'main.tsx does not appear to self-heal the retired paper-intelligence URL',
)
assert(
  "main.tsx self-heals ?view=reading-analysis / ?demo=reading-analysis / #reading-analysis to the home URL",
  mainSrc.includes("'reading-analysis'") &&
    mainSrc.includes("'#reading-analysis'") &&
    mainSrc.includes('history.replaceState'),
  'main.tsx does not appear to self-heal the retired reading-analysis URL aliases',
)
assert(
  'behavioral self-heal + regression-anchor proof lives in DP-2 (docs/cuts/reading-analysis-retire/qa/dp2-reading-analysis-retire.mjs)',
  existsSync(path.join(rootDir, 'docs/cuts/reading-analysis-retire/qa/dp2-reading-analysis-retire.mjs')),
)

console.log(`\n${passed} passed, ${failed} failed.`)
if (failed > 0) process.exit(1)
console.log('reading-analysis-retire verify passed.')
