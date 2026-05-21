#!/usr/bin/env node
/**
 * Verification: C6a-3 — Search Card Reading Analysis Route Bridge.
 *
 * Asserts that:
 *   1. The visible 「阅读解析」 card action no longer routes to the old
 *      reading-analysis page (?view=reading-analysis).
 *   2. The target URL includes:
 *      - paperId=paper-2024-xkb1-reading
 *      - groupId=g-2024-xkb1-a
 *      - questionId=A-21
 *      - surface=paper
 *   3. The route target is PaperSurface / paper-intelligence based.
 *   4. No data files changed:
 *      - app/public/paper-assets/**
 *      - app/public/reports/paper-intelligence/**
 *   5. No PaperSurface renderer/shared files changed (unless explicitly justified).
 *
 * Run:  node scripts/verify-c6a3-reading-analysis-bridge.mjs
 * Exit: 0 on all-pass, 1 otherwise.
 */

import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
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

function gitLines(command) {
  try {
    return execSync(command, {
      cwd: root,
      encoding: 'utf-8',
    })
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

const changedFiles = Array.from(
  new Set([
    ...gitLines('git diff --name-only github/main...HEAD'),
    ...gitLines('git diff --name-only'),
  ]),
)

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
  'ConciergeGroupCard imports supported PaperSurface bridge helper',
  cardSource.includes('buildPaperSurfaceAnalysisHrefForGroupId'),
  'missing buildPaperSurfaceAnalysisHrefForGroupId import',
)

assert(
  'ConciergeGroupCard still renders the 阅读解析 label',
  cardSource.includes('阅读解析'),
  'missing 阅读解析 label',
)

assert(
  'ConciergeGroupCard does NOT hardcode paper-2024-jslk-english',
  !cardSource.includes('paper-2024-jslk-english'),
  'found paper-2024-jslk-english in card source',
)

assert(
  'ConciergeGroupCard does NOT hardcode group-2024-jslk-reading-a',
  !cardSource.includes('group-2024-jslk-reading-a'),
  'found group-2024-jslk-reading-a in card source',
)

assert(
  'ConciergeGroupCard does NOT hardcode q-2024-jslk-021',
  !cardSource.includes('q-2024-jslk-021'),
  'found q-2024-jslk-021 in card source',
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
const {
  buildPaperSurfaceAnalysisHrefForGroupId,
  parsePaperIntelligenceRoute,
} = routeModule

// Build the exact href that the supported ConciergeGroupCard should produce.
const expectedHref = buildPaperSurfaceAnalysisHrefForGroupId('g-2024-xkb1-a')

assert(
  'supported group g-2024-xkb1-a gets a PaperSurface href',
  typeof expectedHref === 'string',
  `got: ${expectedHref}`,
)

assert(
  'built href starts with ?view=paper-intelligence',
  expectedHref?.startsWith('?view=paper-intelligence'),
  `got: ${expectedHref}`,
)

const hrefParams = new URLSearchParams((expectedHref || '').slice(1))

assertEqual(
  'href contains paperId=paper-2024-xkb1-reading',
  hrefParams.get('paperId'),
  'paper-2024-xkb1-reading',
)

assertEqual(
  'href contains groupId=g-2024-xkb1-a',
  hrefParams.get('groupId'),
  'g-2024-xkb1-a',
)

assertEqual(
  'href contains questionId=A-21',
  hrefParams.get('questionId'),
  'A-21',
)

assertEqual(
  'href contains surface=paper',
  hrefParams.get('surface'),
  'paper',
)

assert(
  'unsupported reading group g-2024-xkb1-b gets no PaperSurface href',
  buildPaperSurfaceAnalysisHrefForGroupId('g-2024-xkb1-b') === null,
  'unsupported XKB1 Reading B produced a href',
)

const paperAssetHref = buildPaperSurfaceAnalysisHrefForGroupId('group-2024-jslk-reading-a')
assert(
  'paper-asset group group-2024-jslk-reading-a now gets a PaperSurface href (C6a-4)',
  typeof paperAssetHref === 'string' && paperAssetHref.includes('source=paper-asset'),
  `paper-asset Reading A href missing source=paper-asset: ${paperAssetHref}`,
)

assert(
  'generic unsupported reading group gets no PaperSurface href',
  buildPaperSurfaceAnalysisHrefForGroupId('g-unmapped-reading') === null,
  'generic unsupported reading group produced a href',
)

/* ─────────────────── 3. Route target is PaperSurface-based ──────────── */

console.log('\n-- 3. Route target is PaperSurface / paper-intelligence based --')

// Round-trip: parse the built href to confirm it activates PI route
// with surface=paper.
const parsed = parsePaperIntelligenceRoute({ search: expectedHref || '' })

assertEqual('parsed route kind is paper-intelligence', parsed.kind, 'paper-intelligence')
if (parsed.kind === 'paper-intelligence') {
  assertEqual('parsed surface is paper', parsed.surface, 'paper')
  assertEqual('parsed paperId', parsed.paperId, 'paper-2024-xkb1-reading')
  assertEqual('parsed groupId', parsed.groupId, 'g-2024-xkb1-a')
  assertEqual('parsed questionId', parsed.questionId, 'A-21')
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

const raMatch = parseReadingAnalysisRoute({ search: expectedHref || '', hash: '' })
assertEqual(
  'built href does NOT activate reading-analysis route',
  raMatch.kind,
  'app',
)

/* ─────────────────── 4. Data files unchanged ────────────────────────── */

console.log('\n-- 4. Target report exists and data files are unchanged --')

const targetReportPath =
  'app/public/reports/paper-intelligence/paper-2024-xkb1-reading/report.json'
const targetInputPath =
  'app/public/reports/paper-intelligence/paper-2024-xkb1-reading/input.json'

assert(
  'target PaperSurface report exists',
  existsSync(path.join(root, targetReportPath)),
  `missing ${targetReportPath}`,
)

assert(
  'target PaperSurface input exists',
  existsSync(path.join(root, targetInputPath)),
  `missing ${targetInputPath}`,
)

const dataFiles = [
  targetReportPath,
  targetInputPath,
  'app/public/paper-assets/paper-2024-jslk-english/paper-asset.json',
  'app/public/paper-assets/paper-2024-jslk-english/analyses/reading-choice-analysis-v1.json',
]

for (const file of dataFiles) {
  const modified = changedFiles.includes(file)
  assert(`${file} not modified`, !modified, 'file was modified')
}

assert(
  'no paper-asset data files changed',
  !changedFiles.some((file) => file.startsWith('app/public/paper-assets/')),
  `changed paper-asset files: ${changedFiles
    .filter((file) => file.startsWith('app/public/paper-assets/'))
    .join(', ')}`,
)

assert(
  'no Paper Intelligence report/input files changed',
  !changedFiles.some((file) => file.startsWith('app/public/reports/paper-intelligence/')),
  `changed report files: ${changedFiles
    .filter((file) => file.startsWith('app/public/reports/paper-intelligence/'))
    .join(', ')}`,
)

/* ─────────────────── 5. No PaperSurface shared/renderer changes ──────── */

console.log('\n-- 5. No PaperSurface shared/renderer files changed --')

const forbiddenPaths = [
  'shared/papersurface/',
  'app/src/shared-ui/papersurface/',
]

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

assert(
  'harness constrains initial question selection by groupId when provided',
  harnessSource.includes('p.questionGroupId !== initialGroupId'),
  'missing groupId guard in initial question selection',
)

assert(
  'harness initial selection effect depends on initialGroupId',
  harnessSource.includes('initialGroupId') && harnessSource.includes('initialQuestionId'),
  'missing initialGroupId in initial selection dependencies',
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

assert(
  'App passes source to PaperSurfaceHarness',
  appSource.includes('source={currentPiRoute.source}'),
  'missing source prop pass-through in App.tsx',
)

/* ─────────────────── Summary ─────────────────────────────────────────── */

console.log(`\nResult: ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
