#!/usr/bin/env node
/**
 * Verification: Paper Intelligence readonly preview route.
 *
 * Static checks (no browser needed):
 *   1. Route parser exists and does not interfere with reading-analysis route.
 *   2. Report loader does not import server/api or SQLite.
 *   3. Page component includes five load keys.
 *   4. Page component includes "AI 初判，需教研复核" disclaimer.
 *   5. No "权威难度" / "最终难度" / "预计正确率" in component source.
 *   6. App default route still renders original App when no view param.
 *   7. Sample report JSON is valid and has 4 passages.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'

const HERE = path.dirname(new URL(import.meta.url).pathname)
const ROOT = path.resolve(HERE, '..')

let passed = 0
let failed = 0

function assert(name, condition, detail) {
  if (condition) {
    passed++
    console.log(`  ✓ ${name}`)
  } else {
    failed++
    console.error(`  ✗ ${name}: ${detail || 'failed'}`)
  }
}

// ─── 1. Route parser exists and parses correctly ───

const routeModule = path.join(
  ROOT,
  'app/src/features/paper-intelligence/paperIntelligenceRoute.ts',
)
const routeSrc = readFileSync(routeModule, 'utf-8')

assert(
  'Route parser file exists',
  routeSrc.length > 0,
  'File is empty',
)

assert(
  'Route parser exports parsePaperIntelligenceRoute',
  routeSrc.includes('export function parsePaperIntelligenceRoute'),
  'Missing export',
)

assert(
  'Route checks view=paper-intelligence',
  routeSrc.includes("'paper-intelligence'"),
  'Missing view param check',
)

// ─── 2. Does not import server/api or SQLite ───

const previewSrc = readFileSync(
  path.join(ROOT, 'app/src/features/paper-intelligence/PaperIntelligencePreview.tsx'),
  'utf-8',
)

assert(
  'Preview does not import server/api',
  !previewSrc.includes('server/api') && !previewSrc.includes('../../../server'),
  'Imports server module',
)

assert(
  'Preview does not reference SQLite',
  !previewSrc.toLowerCase().includes('sqlite'),
  'References SQLite',
)

assert(
  'Preview does not reference database',
  !previewSrc.includes('question-bank.sqlite') && !previewSrc.includes('better-sqlite'),
  'References database',
)

// ─── 3. Five load keys present ───

const loadKeys = [
  'vocabularyChunkLoad',
  'grammarLoad',
  'discourseStructureLoad',
  'topicBackgroundLoad',
  'evidenceFindingLoad',
]

for (const key of loadKeys) {
  assert(
    `Load key "${key}" in preview`,
    previewSrc.includes(key),
    `Missing ${key}`,
  )
}

// ─── 4. Disclaimer text ───

assert(
  'Contains "AI 初判，需教研复核"',
  previewSrc.includes('AI 初判，需教研复核'),
  'Missing disclaimer',
)

// ─── 5. No out-of-scope terms ───

const forbidden = ['权威难度', '最终难度', '预计正确率', 'empiricalDifficulty', 'finalDifficulty']
for (const term of forbidden) {
  assert(
    `Does not contain "${term}"`,
    !previewSrc.includes(term),
    `Found forbidden term: ${term}`,
  )
}

// ─── 6. main.tsx still renders App for default route ───

const mainSrc = readFileSync(path.join(ROOT, 'app/src/main.tsx'), 'utf-8')

assert(
  'main.tsx imports App',
  mainSrc.includes("import App from './App.tsx'"),
  'Missing App import',
)

assert(
  'main.tsx renders App as fallback',
  mainSrc.includes('<App />'),
  'Missing App render',
)

assert(
  'main.tsx still supports reading-analysis',
  mainSrc.includes('reading-analysis') && mainSrc.includes('ReadingAnalysisDemoRoute'),
  'Reading analysis route broken',
)

// Check dispatch order in the RootComponent function (not imports)
const dispatchSection = mainSrc.slice(mainSrc.indexOf('function RootComponent'))
assert(
  'main.tsx paper-intelligence checked before reading-analysis in dispatch',
  dispatchSection.indexOf('paper-intelligence') < dispatchSection.indexOf('reading-analysis'),
  'Order wrong in dispatch function',
)

// ─── 7. Sample report JSON valid ───

const reportPath = path.join(
  ROOT,
  'app/public/reports/paper-intelligence/paper-2024-xkb1-reading/report.json',
)
let reportData
try {
  reportData = JSON.parse(readFileSync(reportPath, 'utf-8'))
  assert('Report JSON is valid', true)
} catch (e) {
  assert('Report JSON is valid', false, e.message)
}

if (reportData) {
  assert(
    'Report has 4 passages',
    reportData.passages && reportData.passages.length === 4,
    `Got ${reportData.passages?.length || 0}`,
  )

  assert(
    'Report has sourcePaper.paperId',
    reportData.sourcePaper?.paperId === 'paper-2024-xkb1-reading',
    `Got ${reportData.sourcePaper?.paperId}`,
  )

  const sections = reportData.passages.map((p) => p.paperSection).sort()
  assert(
    'Report covers A/B/C/D',
    sections.join(',') === 'A,B,C,D',
    `Got ${sections.join(',')}`,
  )
}

// ─── Summary ───

console.log(`\n  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
