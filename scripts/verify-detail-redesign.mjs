#!/usr/bin/env node
/**
 * Verification: detail-page-redesign (docs/cuts/detail-page-redesign/plan.md
 * §7, spec docs/specs/2026-07-15-detail-page-redesign-design.md).
 *
 * QuestionGroupDetailView.tsx was fully rewritten off the old「详情长页」
 * (hero + passage + 逐题题干答案 + AnalysisDisclosure 折叠解析) into
 * 速览头 + 一张纸露一角. Covers:
 *
 *   1. Static — AnalysisDisclosure is fully retired from the detail page
 *      (spec 负空间①: 零挂载, zero import). The component itself has been
 *      deleted as dead code (no production consumers remained after this
 *      retirement); verify-analysis-layering.mjs's former AnalysisDisclosure
 *      shape-check section was removed alongside.
 *   2. Static — the one PaperSurface mount is pinned to read-only lecture
 *      props: `lectureFocus={null}` + a no-op `onFocusIntent` (spec
 *      Verify §「PaperSurface 挂载 props 钉死只读形态」).
 *   3. Static — the three prototype artifacts (DetailPaperPeekPrototype.tsx,
 *      detailPaperPeek.css, the `?detailVariant=` wiring) are fully gone —
 *      zero residue anywhere under app/src.
 *   4. Real-fixture — 语法填空 facetKey→registry 全命中: every blank in
 *      paper-960d0f8d's grammar-fill-analysis-v1.json (schemaVersion
 *      grammar-fill-analysis-v2, D1) resolves against
 *      `FACET_FRAMEWORKS` (reuses D1's registry-completeness guarantee,
 *      confirmed against this cut's own real fixture).
 *   5. Static — 阅读 chips 走 questionType 覆盖率核数（真值计数 + 缺失
 *      「未标注」分支）, not a fabricated placeholder.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

let passed = 0
let failed = 0
function assert(name, condition, detail) {
  if (condition) {
    passed += 1
    console.log(`  PASS ${name}`)
  } else {
    failed += 1
    console.error(`  FAIL ${name}${detail ? `\n    ${detail}` : ''}`)
  }
}

function read(relPath) {
  return readFileSync(path.join(rootDir, relPath), 'utf8')
}

// Strips /* ... */ block comments and // line comments so residue checks
// below assert on actual CODE, not on this cut's own historical-rationale
// prose (which legitimately mentions "AnalysisDisclosure"/"detailVariant"
// by name when explaining what got retired and why).
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

console.log('detail-page-redesign verify: 速览头 + 一张纸露一角')

// ------------------------------------------------------------------ 1. AnalysisDisclosure fully retired

const detailView = read('app/src/features/question-detail/QuestionGroupDetailView.tsx')

assert(
  'QuestionGroupDetailView.tsx does not import/mount AnalysisDisclosure (code, not comments)',
  !/AnalysisDisclosure/.test(stripComments(detailView)),
  'AnalysisDisclosure reference still present in code',
)

// ------------------------------------------------------------------ 2. PaperSurface read-only mount

assert('QuestionGroupDetailView.tsx mounts <PaperSurface', /<PaperSurface\b/.test(detailView))
assert(
  'PaperSurface mount pins lectureFocus={null}',
  /<PaperSurface[\s\S]{0,400}lectureFocus=\{null\}/.test(detailView),
)
assert(
  'PaperSurface mount pins a no-op onFocusIntent',
  /<PaperSurface[\s\S]{0,400}onFocusIntent=\{\(\)\s*=>\s*\{\}\}/.test(detailView),
)
assert(
  'PaperSurface mount is mode="lecture" (read-only lecture surface, not an editable/author mode)',
  /<PaperSurface[\s\S]{0,400}mode="lecture"/.test(detailView),
)

// ------------------------------------------------------------------ 3. prototype three-piece fully retired

import { existsSync, readdirSync } from 'node:fs'
assert(
  'DetailPaperPeekPrototype.tsx deleted',
  !existsSync(path.join(rootDir, 'app/src/features/question-detail/DetailPaperPeekPrototype.tsx')),
)
assert(
  'detailPaperPeek.css deleted',
  !existsSync(path.join(rootDir, 'app/src/features/question-detail/detailPaperPeek.css')),
)

function walkAppSrc(dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walkAppSrc(full, out)
    else if (/\.(ts|tsx|css)$/.test(entry.name)) out.push(full)
  }
}
const appSrcFiles = []
walkAppSrc(path.join(rootDir, 'app/src'), appSrcFiles)
const detailVariantOffenders = appSrcFiles.filter((file) =>
  /detailVariant/.test(stripComments(readFileSync(file, 'utf8'))),
)
assert(
  'zero `detailVariant` residue in code anywhere under app/src (prototype variant param + DEV switcher fully removed; historical-rationale comments naming it are fine)',
  detailVariantOffenders.length === 0,
  detailVariantOffenders.join('\n'),
)

// ------------------------------------------------------------------ 4. grammar-fill facetKey → registry 全命中 (real fixture)

const { FACET_FRAMEWORKS } = await import('../app/src/features/paper-intelligence/grammarFillFacetRegistry.ts')

const grammarAnalysisPath = path.join(
  rootDir,
  'app/public/paper-assets/paper-960d0f8d/latest/analyses/grammar-fill-analysis-v1.json',
)
const grammarAnalysis = JSON.parse(readFileSync(grammarAnalysisPath, 'utf8'))
assert(
  'fixture grammar-fill-analysis file schemaVersion is grammar-fill-analysis-v2 (D1)',
  grammarAnalysis.schemaVersion === 'grammar-fill-analysis-v2',
  `got ${grammarAnalysis.schemaVersion}`,
)
const blankEntries = Object.entries(grammarAnalysis.blanks || {})
assert('fixture has at least one grammar-fill blank', blankEntries.length > 0)
const unmapped = blankEntries.filter(([, blank]) => !blank.facetKey || !FACET_FRAMEWORKS[blank.facetKey])
assert(
  `all ${blankEntries.length} blanks' facetKey resolve in FACET_FRAMEWORKS (D1 registry completeness, confirmed against this cut's own fixture)`,
  unmapped.length === 0,
  unmapped.map(([qid, blank]) => `${qid}: ${blank.facetKey}`).join('\n'),
)

// ------------------------------------------------------------------ 5. reading chips: questionType 覆盖率核数 (source-level, matches this repo's .tsx verify convention — no jsdom harness)

assert(
  'reading chips read readingParse.result.questions[].questionType (real per-question field, not fabricated)',
  /q\.questionType/.test(detailView),
)
assert(
  'reading chips fall back to 未标注 (not silently dropping unlabeled questions, not inventing a fake label)',
  /'未标注'/.test(detailView),
)
assert(
  'reading chips render 0 chips when readingParse has no result yet (no fabricated placeholder chip)',
  /if \(!readingParse\?\.questions\?\.length\) return \[\]/.test(detailView),
)
assert(
  'cloze/seven_choices chips show 题数 only (一期范围, no fabricated distribution)',
  /\{ label: `\$\{detail\.questionCount\} 题` \}/.test(detailView),
)

// ------------------------------------------------------------------

console.log(`\ndetail-page-redesign verify: ${passed} passed, ${failed} failed`)
if (failed > 0) {
  process.exit(1)
}
