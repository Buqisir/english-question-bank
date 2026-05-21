#!/usr/bin/env node
/**
 * Verification: C6a-4 — paper-asset Reading A PaperSurface loader.
 *
 * Locks the product cut:
 * - legacy report route remains intact
 * - source=paper-asset is explicit
 * - 九省联考 Reading A card appears in both sample and seed data
 * - PaperSurface consumes paper-asset + reviewed analysis JSON
 * - no fallback to old reading-analysis sidecar / legacy report / fake answerKey explanation
 * - PaperSurface renderer/shared files stay untouched
 */

import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

let passed = 0
let failed = 0

function assert(name, condition, detail = '') {
  if (condition) {
    passed++
    console.log(`  ✓ ${name}`)
  } else {
    failed++
    console.error(`  ✗ ${name}${detail ? `: ${detail}` : ''}`)
  }
}

function assertEqual(name, actual, expected) {
  assert(
    name,
    actual === expected,
    `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  )
}

const here = path.dirname(new URL(import.meta.url).pathname)
const root = path.resolve(here, '..')

function read(relPath) {
  return readFileSync(path.join(root, relPath), 'utf8')
}

function readJson(relPath) {
  return JSON.parse(read(relPath))
}

function gitLines(command) {
  try {
    return execSync(command, { cwd: root, encoding: 'utf8' })
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
    ...gitLines('git diff --cached --name-only'),
    ...gitLines('git diff --name-only'),
  ]),
)

console.log('=== C6a-4: paper-asset Reading A analysis loader ===\n')

/* ───────────────────── 1. Scope guard ───────────────────── */

console.log('-- 1. Scope guard --')

const allowed = new Set([
  'app/src/App.tsx',
  'app/src/concierge/ConciergeGroupCard.tsx',
  'app/src/concierge/conciergeSearch.ts',
  'app/src/data/sampleQuestionGroups.ts',
  'app/src/features/paper-intelligence/PaperIntelligencePaperSurfaceHarness.tsx',
  'app/src/features/paper-intelligence/paperAssetSurfaceAdapter.ts',
  'app/src/features/paper-intelligence/paperIntelligencePaperSurfaceHarness.css',
  'app/src/features/paper-intelligence/paperIntelligenceRoute.ts',
  'data/sql/seed-v0.sql',
  'scripts/verify-c6a3-reading-analysis-bridge.mjs',
  'scripts/verify-c6a-2-reading-a-analysis.mjs',
  'scripts/verify-c6a4-paper-asset-analysis-loader.mjs',
  'scripts/verify-c6a5-search-entry-e2e.mjs',
  'scripts/verify-c6a6a-reading-b-analysis.mjs',
  'scripts/verify-c6a6b-open-reading-b-analysis-entry.mjs',
  'scripts/verify-c6a7-reading-c-analysis.mjs',
  'app/public/paper-assets/paper-2024-jslk-english/analyses/reading-choice-analysis-v1.json',
])

for (const file of changedFiles) {
  assert(`changed file allowed: ${file}`, allowed.has(file), 'unexpected C6a-4 file')
}

assert(
  'PaperSurface.tsx unchanged',
  !changedFiles.includes('app/src/shared-ui/papersurface/PaperSurface.tsx'),
)
assert(
  'PaperSurface.css unchanged',
  !changedFiles.includes('app/src/shared-ui/papersurface/PaperSurface.css'),
)
assert(
  'shared/papersurface unchanged',
  !changedFiles.some((file) => file.startsWith('shared/papersurface/')),
)
assert(
  'paper-asset source fixture unchanged',
  !changedFiles.includes('app/public/paper-assets/paper-2024-jslk-english/paper-asset.json'),
)
assert(
  'legacy PI report fixture unchanged',
  !changedFiles.some((file) => file.startsWith('app/public/reports/')),
)
assert(
  'server runtime unchanged',
  !changedFiles.some((file) => file.startsWith('server/')),
)

/* ───────────────────── 2. Data entry exists ───────────────────── */

console.log('\n-- 2. Concierge/search entry data exists --')

const sample = read('app/src/data/sampleQuestionGroups.ts')
const seed = read('data/sql/seed-v0.sql')

assert(
  'sampleQuestionGroups contains paper-asset Reading A group',
  sample.includes("id: 'group-2024-jslk-reading-a'"),
)
assert(
  'sampleQuestionGroups names the paper asset paper',
  sample.includes("2024九省联考 阅读 A 黄石公园海报展"),
)
assert(
  'seed-v0 contains paper-asset Reading A group',
  seed.includes("'group-2024-jslk-reading-a'"),
)
assert(
  'seed-v0 contains q-2024-jslk-021',
  seed.includes("'q-2024-jslk-021'"),
)
assert(
  'seed-v0 stores only entrance metadata note, not full paper rewrite',
  seed.includes('PaperSurface 从 paper-asset 读取正式题面'),
)

/* ───────────────────── 3. Route contract ───────────────────── */

console.log('\n-- 3. Route contract --')

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

const legacyHref = buildPaperSurfaceAnalysisHrefForGroupId('g-2024-xkb1-a')
const assetHref = buildPaperSurfaceAnalysisHrefForGroupId('group-2024-jslk-reading-a')

assert('legacy XKB1 group still has href', typeof legacyHref === 'string')
assert('paper-asset Reading A group has href', typeof assetHref === 'string')

const legacyParams = new URLSearchParams((legacyHref || '').slice(1))
const assetParams = new URLSearchParams((assetHref || '').slice(1))

assertEqual('legacy href keeps paperId', legacyParams.get('paperId'), 'paper-2024-xkb1-reading')
assertEqual('legacy href omits source param', legacyParams.get('source'), null)
assertEqual('asset href uses source=paper-asset', assetParams.get('source'), 'paper-asset')
assertEqual('asset href paperId', assetParams.get('paperId'), 'paper-2024-jslk-english')
assertEqual('asset href groupId', assetParams.get('groupId'), 'group-2024-jslk-reading-a')
assertEqual('asset href default questionId', assetParams.get('questionId'), 'q-2024-jslk-021')
assertEqual('asset href surface', assetParams.get('surface'), 'paper')

const parsedAsset = parsePaperIntelligenceRoute({ search: assetHref || '' })
assertEqual('parsed asset route kind', parsedAsset.kind, 'paper-intelligence')
if (parsedAsset.kind === 'paper-intelligence') {
  assertEqual('parsed asset route source', parsedAsset.source, 'paper-asset')
  assertEqual('parsed asset route groupId', parsedAsset.groupId, 'group-2024-jslk-reading-a')
  assertEqual('parsed asset route questionId', parsedAsset.questionId, 'q-2024-jslk-021')
}

const parsedLegacy = parsePaperIntelligenceRoute({ search: legacyHref || '' })
if (parsedLegacy.kind === 'paper-intelligence') {
  assertEqual('parsed legacy route defaults source', parsedLegacy.source, 'legacy-report')
}

assert(
  'unsupported reading group still produces null',
  buildPaperSurfaceAnalysisHrefForGroupId('g-2024-xkb1-b') === null,
)

/* ───────────────────── 4. Loader contract ───────────────────── */

console.log('\n-- 4. Loader contract --')

const harness = read('app/src/features/paper-intelligence/PaperIntelligencePaperSurfaceHarness.tsx')
const adapter = read('app/src/features/paper-intelligence/paperAssetSurfaceAdapter.ts')
const app = read('app/src/App.tsx')

assert('App passes currentPiRoute.source into harness', app.includes('source={currentPiRoute.source}'))
assert('harness has source prop', harness.includes('source?: PaperIntelligenceSource'))
assert('harness fetches paper-asset.json', harness.includes('/paper-assets/${paperId}/paper-asset.json'))
assert(
  'harness fetches reviewed reading-choice analysis JSON',
  harness.includes('/paper-assets/${paperId}/analyses/reading-choice-analysis-v1.json'),
)
assert('harness renders paper-asset analysis panel', harness.includes('PaperAssetAnalysisPanel'))
assert('harness has 解析未发布 empty state', harness.includes('解析未发布'))
assert('harness defaults paper-asset route to first question when groupId present', harness.includes('paperAssetModel.defaultQuestionId'))
assert('back-to-workbench strips source route param', app.includes("'source'"))
assert('back-to-workbench strips groupId route param', app.includes("'groupId'"))
assert('back-to-workbench strips questionId route param', app.includes("'questionId'"))

assert('adapter exports buildPaperAssetSurfaceModel', adapter.includes('buildPaperAssetSurfaceModel'))
assert('adapter accepts groupId and reads asset.content.groups[groupId]', adapter.includes('asset.content.groups[groupId]'))
assert('adapter builds neutral PaperSurface textMap', adapter.includes('PaperTextMap'))
assert('adapter builds neutral PaperSurface questions', adapter.includes('PaperQuestion[]'))
assert('adapter builds neutral PaperSurface evidence', adapter.includes('PaperEvidence[]'))
assert('adapter uses reviewed optionAnalysis', adapter.includes('optionAnalysis'))
assert('adapter maps trap labels for display', adapter.includes('原文词钩干扰') && adapter.includes('黑白颠倒'))
assert(
  'adapter has exhaustive trap diagnosis guard',
  adapter.includes('function assertNever') && adapter.includes('return assertNever(trap)'),
)
assert(
  'adapter has no fetch/router/DOM side effects',
  !/\bfetch\s*\(|window\.|document\.|localStorage|location\./.test(adapter),
)
assert(
  'adapter does not import old reading-analysis sidecar',
  !/reading-analysis|sidecar|ReadingAnalysisDemoRoute/.test(adapter),
)
assert(
  'adapter does not touch legacy report fixture path',
  !/reports\/paper-intelligence/.test(adapter),
)

/* ───────────────────── 5. Fixture compatibility ───────────────────── */

console.log('\n-- 5. Fixture compatibility --')

const asset = readJson('app/public/paper-assets/paper-2024-jslk-english/paper-asset.json')
const analysis = readJson(
  'app/public/paper-assets/paper-2024-jslk-english/analyses/reading-choice-analysis-v1.json',
)
const group = asset.content.groups['group-2024-jslk-reading-a']

assert('paper asset has Reading A group', !!group)
assert('Reading A has Q21-Q23', JSON.stringify(group.questionIds) === JSON.stringify([
  'q-2024-jslk-021',
  'q-2024-jslk-022',
  'q-2024-jslk-023',
]))
assert('analysis has reviewed Q21', !!analysis.questions['q-2024-jslk-021'])
assert('analysis has reviewed Q22', !!analysis.questions['q-2024-jslk-022'])
assert('analysis has reviewed Q23', !!analysis.questions['q-2024-jslk-023'])

const { buildPaperAssetSurfaceModel } = await import(
  path.join(root, 'app', 'src', 'features', 'paper-intelligence', 'paperAssetSurfaceAdapter.ts')
)
const model = buildPaperAssetSurfaceModel({
  asset,
  analysis,
  groupId: 'group-2024-jslk-reading-a',
})

assertEqual('model default question is Q21', model.defaultQuestionId, 'q-2024-jslk-021')
assertEqual('model renders one passage section', model.report.passages.length, 1)
assertEqual('model passage section is A', model.report.passages[0]?.paperSection, 'A')
assertEqual('model renders exactly Q21-Q23', model.surfaceData.questions.length, 3)
assert(
  'PaperSurface question ids are stable q-* ids',
  model.surfaceData.questions.every((question) => /^q-2024-jslk-0(21|22|23)$/.test(question.id)),
)
assert(
  'right-panel analysis ids are stable q-* ids',
  Object.keys(model.analysisByQuestionId).every((questionId) => /^q-2024-jslk-0(21|22|23)$/.test(questionId)),
)
assert(
  'evidence belongs only to stable q-* ids',
  model.surfaceData.evidence.every((item) => /^q-2024-jslk-0(21|22|23)$/.test(item.questionId)),
)

console.log(`\nC6a-4 verify: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
