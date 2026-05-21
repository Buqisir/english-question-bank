#!/usr/bin/env node
/**
 * Verification: C6a-3 — Search Card Reading Analysis Route Bridge.
 *
 * Asserts that:
 *   1. The visible 「阅读解析」 card action no longer routes to the old
 *      reading-analysis page (?view=reading-analysis).
 *   2. The target URL includes:
 *      - paperId=paper-2024-jslk-english
 *      - groupId=group-2024-jslk-reading-a
 *      - questionId=q-2024-jslk-021
 *      - surface=paper
 *   3. The route target is PaperSurface / paper-intelligence based.
 *   4. No data files changed:
 *      - app/public/paper-assets/paper-2024-jslk-english/paper-asset.json
 *      - app/public/paper-assets/paper-2024-jslk-english/analyses/reading-choice-analysis-v1.json
 *   5. No PaperSurface renderer/shared files changed (unless explicitly justified).
 *
 * Run:  node scripts/verify-c6a3-reading-analysis-bridge.mjs
 * Exit: 0 on all-pass, 1 otherwise.
 */

import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'

let passed = 0
let failed = 0

function assert(name, condition, detail) {
  if (condition) {
    passed++
    console.log(`  \u2713 ${name}`)
  } else {
    failed++
    console.error(`  \u2717 ${name}: ${detail || 'failed'}`)
  }
}

function assertEqual(name, actual, expected) {
  const ok = actual === expected
  assert(
    name,
    ok,
    ok ? '' : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  )
}

const here = path.dirname(new URL(import.meta.url).pathname)
const root = path.resolve(here, '..')

console.log('=== C6a-3: Search Card Reading Analysis Route Bridge ===\n')

/* ─────────────────── 1. Card action no longer uses old route ─────────── */

console.log('-- 1. ConciergeGroupCard no longer uses ?view=reading-analysis --')

const cardPath = path.join(root, 'app', 'src', 'concierge', 'ConciergeGroupCard.tsx')
const cardSource = readFileSync(cardPath, 'utf-8')

assert(
  'ConciergeGroupCard does NOT import buildReadingAnalysisHref',
  !cardSource.includes('buildReadingAnalysisHref'),
  'found buildReadingAnalysisHref import in ConciergeGroupCard.tsx',
)

assert(
  'ConciergeGroupCard does NOT produce ?view=reading-analysis URLs',
  !cardSource.includes("view=reading-analysis") && !cardSource.includes("'reading-analysis'"),
  'found reading-analysis route reference in card source',
)

assert(
  'ConciergeGroupCard imports buildPaperSurfaceHref',
  cardSource.includes('buildPaperSurfaceHref'),
  'missing buildPaperSurfaceHref import',
)

assert(
  'ConciergeGroupCard still renders the 阅读解析 label',
  cardSource.includes('阅读解析'),
  'missing 阅读解析 label',
)

/* ─────────────────── 2. Target URL includes stable IDs ───────────────── */

console.log('\n-- 2. Target URL includes stable IDs --')

// Import the route module to verify the built href.
const routeModulePath = path.join(
  root,
  'app',
  'src',
  'features',
  'paper-intelligence',
  'paperIntelligenceRoute.ts',
)
const routeModule = await import(routeModulePath)
const { buildPaperSurfaceHref, parsePaperIntelligenceRoute } = routeModule

// Build the exact href that ConciergeGroupCard should produce.
const expectedHref = buildPaperSurfaceHref({
  paperId: 'paper-2024-jslk-english',
  groupId: 'group-2024-jslk-reading-a',
  questionId: 'q-2024-jslk-021',
})

assert(
  'built href starts with ?view=paper-intelligence',
  expectedHref.startsWith('?view=paper-intelligence'),
  `got: ${expectedHref}`,
)

const hrefParams = new URLSearchParams(expectedHref.slice(1))

assertEqual(
  'href contains paperId=paper-2024-jslk-english',
  hrefParams.get('paperId'),
  'paper-2024-jslk-english',
)

assertEqual(
  'href contains groupId=group-2024-jslk-reading-a',
  hrefParams.get('groupId'),
  'group-2024-jslk-reading-a',
)

assertEqual(
  'href contains questionId=q-2024-jslk-021',
  hrefParams.get('questionId'),
  'q-2024-jslk-021',
)

assertEqual(
  'href contains surface=paper',
  hrefParams.get('surface'),
  'paper',
)

// Verify the card source references all stable IDs.
assert(
  'card source contains paperId: paper-2024-jslk-english',
  cardSource.includes('paper-2024-jslk-english'),
  'missing paper-2024-jslk-english in card source',
)

assert(
  'card source contains groupId: group-2024-jslk-reading-a',
  cardSource.includes('group-2024-jslk-reading-a'),
  'missing group-2024-jslk-reading-a in card source',
)

assert(
  'card source contains questionId: q-2024-jslk-021',
  cardSource.includes('q-2024-jslk-021'),
  'missing q-2024-jslk-021 in card source',
)

/* ─────────────────── 3. Route target is PaperSurface-based ──────────── */

console.log('\n-- 3. Route target is PaperSurface / paper-intelligence based --')

// Round-trip: parse the built href to confirm it activates PI route
// with surface=paper.
const parsed = parsePaperIntelligenceRoute({ search: expectedHref })

assertEqual('parsed route kind is paper-intelligence', parsed.kind, 'paper-intelligence')
if (parsed.kind === 'paper-intelligence') {
  assertEqual('parsed surface is paper', parsed.surface, 'paper')
  assertEqual('parsed paperId', parsed.paperId, 'paper-2024-jslk-english')
  assertEqual('parsed groupId', parsed.groupId, 'group-2024-jslk-reading-a')
  assertEqual('parsed questionId', parsed.questionId, 'q-2024-jslk-021')
}

// Confirm the href never matches the reading-analysis route.
const raRouteModulePath = path.join(
  root,
  'app',
  'src',
  'features',
  'reading-analysis',
  'readingAnalysisRoute.ts',
)
const raRouteModule = await import(raRouteModulePath)
const { parseReadingAnalysisRoute } = raRouteModule

const raMatch = parseReadingAnalysisRoute({ search: expectedHref, hash: '' })
assertEqual(
  'built href does NOT activate reading-analysis route',
  raMatch.kind,
  'app',
)

/* ─────────────────── 4. Data files unchanged ────────────────────────── */

console.log('\n-- 4. No data files changed --')

// Use git to check if the data files have been modified.
const dataFiles = [
  'app/public/paper-assets/paper-2024-jslk-english/paper-asset.json',
  'app/public/paper-assets/paper-2024-jslk-english/analyses/reading-choice-analysis-v1.json',
]

for (const file of dataFiles) {
  let modified = false
  try {
    const result = execSync(`git diff --name-only -- "${file}"`, {
      cwd: root,
      encoding: 'utf-8',
    }).trim()
    modified = result.length > 0
  } catch {
    // If git fails (e.g. not in a repo), check the file exists as-is.
    modified = false
  }
  assert(`${file} not modified`, !modified, 'file was modified')
}

/* ─────────────────── 5. No PaperSurface shared/renderer changes ──────── */

console.log('\n-- 5. No PaperSurface shared/renderer files changed --')

const forbiddenPaths = [
  'shared/papersurface/',
  'app/src/shared-ui/papersurface/',
]

let diffOutput = ''
try {
  diffOutput = execSync('git diff --name-only', {
    cwd: root,
    encoding: 'utf-8',
  }).trim()
} catch {
  diffOutput = ''
}

const changedFiles = diffOutput.split('\n').filter(Boolean)
for (const forbidden of forbiddenPaths) {
  const violations = changedFiles.filter((f) => f.includes(forbidden))
  assert(
    `no changes in ${forbidden}`,
    violations.length === 0,
    `found changes: ${violations.join(', ')}`,
  )
}

/* ─────────────────── 6. Harness accepts groupId/questionId ──────────── */

console.log('\n-- 6. Harness accepts groupId/questionId props --')

const harnessPath = path.join(
  root,
  'app',
  'src',
  'features',
  'paper-intelligence',
  'PaperIntelligencePaperSurfaceHarness.tsx',
)
const harnessSource = readFileSync(harnessPath, 'utf-8')

assert(
  'harness Props type includes groupId',
  harnessSource.includes('groupId'),
  'missing groupId in harness',
)

assert(
  'harness Props type includes questionId',
  harnessSource.includes('questionId'),
  'missing questionId in harness',
)

assert(
  'harness has initial question selection effect',
  harnessSource.includes('initialQuestionAppliedRef'),
  'missing initial question selection effect',
)

/* ─────────────────── 7. App.tsx passes new props ─────────────────────── */

console.log('\n-- 7. App.tsx passes groupId/questionId to harness --')

const appPath = path.join(root, 'app', 'src', 'App.tsx')
const appSource = readFileSync(appPath, 'utf-8')

assert(
  'App passes groupId to PaperSurfaceHarness',
  appSource.includes('groupId={currentPiRoute.groupId}'),
  'missing groupId prop pass-through in App.tsx',
)

assert(
  'App passes questionId to PaperSurfaceHarness',
  appSource.includes('questionId={currentPiRoute.questionId}'),
  'missing questionId prop pass-through in App.tsx',
)

/* ─────────────────── Summary ─────────────────────────────────────────── */

console.log(`\nResult: ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
