#!/usr/bin/env node
/**
 * Verification: Paper Intelligence → App Shell route integration (Cut A).
 *
 * Static checks (no browser needed):
 *   1. main.tsx does NOT directly render PaperIntelligencePreview.
 *   2. App.tsx renders PaperIntelligencePreview when piRoute is active.
 *   3. PaperIntelligencePreview props type includes basket bridge fields.
 *   4. report.json passages all have questionGroupId.
 *   5. All questionGroupIds resolve to sampleQuestionGroups entries.
 *   6. reading-analysis route still exists in main.tsx.
 *   7. No fuzzy matching logic (passageTitle / section guess).
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'

const HERE = path.dirname(new URL(import.meta.url).pathname)
const ROOT = path.resolve(HERE, '..')

let passed = 0
let failed = 0
const issues = []

function assert(name, condition, detail) {
  if (condition) {
    passed++
    console.log(`  \u2713 ${name}`)
  } else {
    failed++
    issues.push(`${name}: ${detail || 'failed'}`)
    console.error(`  \u2717 ${name}: ${detail || 'failed'}`)
  }
}

// ─── Load sources ───

const mainSrc = readFileSync(path.join(ROOT, 'app/src/main.tsx'), 'utf-8')
const appSrc = readFileSync(path.join(ROOT, 'app/src/App.tsx'), 'utf-8')
const piPreviewSrc = readFileSync(
  path.join(ROOT, 'app/src/features/paper-intelligence/PaperIntelligencePreview.tsx'),
  'utf-8',
)
const piTypesSrc = readFileSync(
  path.join(ROOT, 'app/src/features/paper-intelligence/paperIntelligenceTypes.ts'),
  'utf-8',
)
const reportJson = JSON.parse(
  readFileSync(
    path.join(ROOT, 'app/public/reports/paper-intelligence/paper-2024-xkb1-reading/report.json'),
    'utf-8',
  ),
)
const sampleGroupsSrc = readFileSync(
  path.join(ROOT, 'app/src/data/sampleQuestionGroups.ts'),
  'utf-8',
)

console.log('\n=== Paper Intelligence Route Integration (Cut A) ===\n')

// ─── Test 1: main.tsx does NOT directly render PaperIntelligencePreview ───

console.log('Test 1: main.tsx no longer directly renders PaperIntelligencePreview')

assert(
  'main.tsx does not contain <PaperIntelligencePreview',
  !mainSrc.includes('<PaperIntelligencePreview'),
  'main.tsx still renders PaperIntelligencePreview directly',
)

assert(
  'main.tsx does not import PaperIntelligencePreview component',
  !mainSrc.includes("import { PaperIntelligencePreview }"),
  'main.tsx still imports PaperIntelligencePreview',
)

assert(
  'main.tsx passes piRoute prop to App',
  mainSrc.includes('piRoute={piRoute}') || mainSrc.includes('piRoute='),
  'main.tsx does not pass piRoute to App',
)

// ─── Test 2: App.tsx renders PaperIntelligencePreview ───

console.log('\nTest 2: App.tsx handles Paper Intelligence route rendering')

assert(
  'App.tsx imports PaperIntelligencePreview',
  appSrc.includes("import { PaperIntelligencePreview }") ||
    appSrc.includes("import {PaperIntelligencePreview}"),
  'App.tsx does not import PaperIntelligencePreview',
)

assert(
  'App.tsx imports PaperIntelligenceRouteMatch type',
  appSrc.includes('PaperIntelligenceRouteMatch'),
  'App.tsx does not reference PaperIntelligenceRouteMatch',
)

assert(
  'App.tsx renders PaperIntelligencePreview when piRoute active',
  appSrc.includes('<PaperIntelligencePreview'),
  'App.tsx does not contain <PaperIntelligencePreview',
)

assert(
  'App.tsx checks piRoute.kind === paper-intelligence',
  appSrc.includes("piRoute.kind === 'paper-intelligence'"),
  'App.tsx does not check piRoute.kind',
)

assert(
  'App.tsx passes paperId prop to PaperIntelligencePreview',
  appSrc.includes('paperId={piRoute.paperId}'),
  'Missing paperId prop pass-through',
)

assert(
  'App.tsx passes basketIds prop',
  appSrc.includes('basketIds={'),
  'Missing basketIds prop',
)

assert(
  'App.tsx passes availableQuestionGroupIds prop',
  appSrc.includes('availableQuestionGroupIds={'),
  'Missing availableQuestionGroupIds prop',
)

assert(
  'App.tsx passes onAddQuestionGroup prop',
  appSrc.includes('onAddQuestionGroup={'),
  'Missing onAddQuestionGroup prop',
)

assert(
  'App.tsx passes basketCount prop',
  appSrc.includes('basketCount={'),
  'Missing basketCount prop',
)

assert(
  'App.tsx passes onBackToWorkbench prop',
  appSrc.includes('onBackToWorkbench={'),
  'Missing onBackToWorkbench prop',
)

// ─── Test 3: PaperIntelligencePreview props include basket bridge fields ───

console.log('\nTest 3: PaperIntelligencePreview props type includes basket bridge')

assert(
  'Props type has basketIds',
  piPreviewSrc.includes('basketIds'),
  'Missing basketIds in props',
)

assert(
  'Props type has availableQuestionGroupIds',
  piPreviewSrc.includes('availableQuestionGroupIds'),
  'Missing availableQuestionGroupIds in props',
)

assert(
  'Props type has onAddQuestionGroup',
  piPreviewSrc.includes('onAddQuestionGroup'),
  'Missing onAddQuestionGroup in props',
)

assert(
  'Props type has basketCount',
  piPreviewSrc.includes('basketCount'),
  'Missing basketCount in props',
)

assert(
  'Props type has onBackToWorkbench',
  piPreviewSrc.includes('onBackToWorkbench'),
  'Missing onBackToWorkbench in props',
)

// ─── Test 4: report.json passages all have questionGroupId ───

console.log('\nTest 4: report.json passages all have questionGroupId')

const passages = reportJson.passages || []
assert(
  'Report has 4 passages',
  passages.length === 4,
  `Got ${passages.length} passages`,
)

const expectedSections = ['A', 'B', 'C', 'D']
for (const section of expectedSections) {
  const passage = passages.find((p) => p.paperSection === section)
  assert(
    `Passage ${section} exists`,
    Boolean(passage),
    `Missing passage ${section}`,
  )
  assert(
    `Passage ${section} has questionGroupId`,
    Boolean(passage && passage.questionGroupId),
    `Passage ${section} missing questionGroupId`,
  )
  assert(
    `Passage ${section} questionGroupId is a stable id (g-2024-xkb1-${section.toLowerCase()})`,
    passage && passage.questionGroupId === `g-2024-xkb1-${section.toLowerCase()}`,
    `Got: ${passage?.questionGroupId}`,
  )
}

// ─── Test 5: All questionGroupIds resolve to sampleQuestionGroups ───

console.log('\nTest 5: questionGroupIds resolve to sampleQuestionGroups')

const expectedIds = ['g-2024-xkb1-a', 'g-2024-xkb1-b', 'g-2024-xkb1-c', 'g-2024-xkb1-d']
for (const id of expectedIds) {
  assert(
    `sampleQuestionGroups contains ${id}`,
    sampleGroupsSrc.includes(`'${id}'`) || sampleGroupsSrc.includes(`"${id}"`),
    `${id} not found in sampleQuestionGroups.ts`,
  )
}

// ─── Test 6: reading-analysis route still exists ───

console.log('\nTest 6: reading-analysis route intact')

assert(
  'main.tsx imports ReadingAnalysisDemoRoute',
  mainSrc.includes('ReadingAnalysisDemoRoute'),
  'Missing ReadingAnalysisDemoRoute import',
)

assert(
  'main.tsx imports parseReadingAnalysisRoute',
  mainSrc.includes('parseReadingAnalysisRoute'),
  'Missing parseReadingAnalysisRoute import',
)

assert(
  'main.tsx renders ReadingAnalysisDemoRoute on reading-analysis route',
  mainSrc.includes('<ReadingAnalysisDemoRoute'),
  'Missing <ReadingAnalysisDemoRoute rendering',
)

// ─── Test 7: No fuzzy matching logic ───

console.log('\nTest 7: No fuzzy matching (no passageTitle/section guess)')

assert(
  'PaperIntelligencePreview does not fuzzy-match by passageTitle',
  !piPreviewSrc.includes('passageTitle') ||
    (piPreviewSrc.includes('passageTitle') && !piPreviewSrc.includes('passageTitle ===')),
  'Contains passageTitle equality check (fuzzy match)',
)

// Check that App.tsx does not do fuzzy matching between PI passages and question groups
assert(
  'App.tsx does not contain passageTitle-to-group matching',
  !appSrc.includes('passageTitle ===') && !appSrc.includes('section ==='),
  'App.tsx contains fuzzy matching logic',
)

assert(
  'paperIntelligenceTypes includes questionGroupId field',
  piTypesSrc.includes('questionGroupId'),
  'PassageReport missing questionGroupId',
)

// ─── Summary ───

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`)
if (issues.length > 0) {
  console.log('\nIssues:')
  issues.forEach((i) => console.log(`  - ${i}`))
}
process.exit(failed > 0 ? 1 : 0)
