#!/usr/bin/env node
/**
 * C6a-6b verification: expose reviewed Reading B through the existing
 * concierge -> PaperSurface entry path.
 *
 * This cut opens the route/card/seed metadata only after C6a-6a reviewed
 * Reading B analysis exists. It must not modify PaperSurface, the analysis
 * panel, shared renderers, or paper-asset source content.
 */

import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')

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
  assert(name, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}

function read(relPath) {
  const fullPath = path.join(root, relPath)
  assert(`${relPath} exists`, existsSync(fullPath))
  return readFileSync(fullPath, 'utf8')
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

console.log('=== C6a-6b: open Reading B reviewed-analysis entry ===\n')

console.log('-- 1. Scope --')

const allowedFiles = new Set([
  'app/src/data/sampleQuestionGroups.ts',
  'app/src/features/paper-intelligence/paperIntelligenceRoute.ts',
  'data/sql/seed-v0.sql',
  'scripts/verify-c6a5-search-entry-e2e.mjs',
  'scripts/verify-c6a4-paper-asset-analysis-loader.mjs',
  'scripts/verify-c6a6a-reading-b-analysis.mjs',
  'scripts/verify-c6a6b-open-reading-b-analysis-entry.mjs',
])

for (const file of changedFiles) {
  assert(`changed file allowed: ${file}`, allowedFiles.has(file), 'unexpected C6a-6b file')
}

assert('analysis JSON unchanged in this cut', !changedFiles.includes('app/public/paper-assets/paper-2024-jslk-english/analyses/reading-choice-analysis-v1.json'))
assert('paper-asset source unchanged', !changedFiles.includes('app/public/paper-assets/paper-2024-jslk-english/paper-asset.json'))
assert('PaperSurface renderer unchanged', !changedFiles.some((file) => file.startsWith('app/src/shared-ui/papersurface/')))
assert('shared/papersurface unchanged', !changedFiles.some((file) => file.startsWith('shared/papersurface/')))
assert('server unchanged', !changedFiles.some((file) => file.startsWith('server/')))
assert('package and lockfiles unchanged', !changedFiles.some((file) => /(^|\/)(package(-lock)?\.json|pnpm-lock\.yaml)$/.test(file)))

console.log('\n-- 2. Reviewed data prerequisite --')

const asset = readJson('app/public/paper-assets/paper-2024-jslk-english/paper-asset.json')
const analysis = readJson('app/public/paper-assets/paper-2024-jslk-english/analyses/reading-choice-analysis-v1.json')
const readingBQuestionIds = ['q-2024-jslk-024', 'q-2024-jslk-025', 'q-2024-jslk-026', 'q-2024-jslk-027']

assert('paper asset has Reading B group', !!asset.content.groups['group-2024-jslk-reading-b'])
assert('reviewed analysis targets Reading B', analysis.targetGroups.includes('group-2024-jslk-reading-b'))
assert('reviewed analysis has Reading B group analysis', !!analysis.groups['group-2024-jslk-reading-b'])
for (const questionId of readingBQuestionIds) {
  assert(`reviewed analysis has ${questionId}`, !!analysis.questions[questionId])
}

console.log('\n-- 3. Route target --')

const {
  buildPaperSurfaceAnalysisHrefForGroupId,
  parsePaperIntelligenceRoute,
} = await import(path.join(root, 'app/src/features/paper-intelligence/paperIntelligenceRoute.ts'))

const href = buildPaperSurfaceAnalysisHrefForGroupId('group-2024-jslk-reading-b')
assert('Reading B group now has PaperSurface href', typeof href === 'string')
const params = new URLSearchParams((href || '').slice(1))
assertEqual('Reading B href source', params.get('source'), 'paper-asset')
assertEqual('Reading B href paperId', params.get('paperId'), 'paper-2024-jslk-english')
assertEqual('Reading B href surface', params.get('surface'), 'paper')
assertEqual('Reading B href groupId', params.get('groupId'), 'group-2024-jslk-reading-b')
assertEqual('Reading B href default questionId', params.get('questionId'), 'q-2024-jslk-024')

const parsed = parsePaperIntelligenceRoute({ search: href || '' })
assertEqual('Reading B parsed route kind', parsed.kind, 'paper-intelligence')
if (parsed.kind === 'paper-intelligence') {
  assertEqual('Reading B parsed source', parsed.source, 'paper-asset')
  assertEqual('Reading B parsed groupId', parsed.groupId, 'group-2024-jslk-reading-b')
  assertEqual('Reading B parsed questionId', parsed.questionId, 'q-2024-jslk-024')
}

assert('unsupported XKB1 Reading B remains closed', buildPaperSurfaceAnalysisHrefForGroupId('g-2024-xkb1-b') === null)
assert('unsupported arbitrary reading group remains closed', buildPaperSurfaceAnalysisHrefForGroupId('g-unmapped-reading') === null)

console.log('\n-- 4. Search card data --')

const sample = read('app/src/data/sampleQuestionGroups.ts')
assert('sample data contains Reading B group id', sample.includes("id: 'group-2024-jslk-reading-b'"))
assert('sample data names Reading B source', sample.includes("source: '2024 九省联考 阅读 B'"))
assert('sample data keeps Reading B questionCount 4', /id: 'group-2024-jslk-reading-b'[\s\S]*questionCount: 4/.test(sample))
assert('sample data previews Q24', sample.includes('What is important for parrots to better survive from attacks in the wild?'))
assert('sample data answer preview is A', sample.includes('A. Living in a group.'))

const seed = read('data/sql/seed-v0.sql')
assert('seed has Reading B source', seed.includes("'src-2024-jslk-reading-b'"))
assert('seed has Reading B passage metadata', seed.includes("'passage-2024-jslk-reading-b'"))
assert('seed has Reading B group metadata', seed.includes("'group-2024-jslk-reading-b'"))
for (const questionId of readingBQuestionIds) {
  assert(`seed has ${questionId}`, seed.includes(`'${questionId}'`))
}
assert('seed references reviewed analysis JSON for Reading B', seed.includes('C6a-6b：正式解析见 paper-asset reviewed analysis JSON。'))

console.log('\n-- 5. Adapter compatibility --')

const { buildPaperAssetSurfaceModel } = await import(
  path.join(root, 'app/src/features/paper-intelligence/paperAssetSurfaceAdapter.ts')
)
const model = buildPaperAssetSurfaceModel({
  asset,
  analysis,
  groupId: 'group-2024-jslk-reading-b',
})
assertEqual('model default question is Q24', model.defaultQuestionId, 'q-2024-jslk-024')
assertEqual('model renders one passage', model.report.passages.length, 1)
assertEqual('model paper section is B', model.report.passages[0]?.paperSection, 'B')
assertEqual('model renders Q24-Q27', JSON.stringify(model.surfaceData.questions.map((question) => question.id)), JSON.stringify(readingBQuestionIds))
assert('model has reviewed analysis rows for Q24-Q27', readingBQuestionIds.every((questionId) => !!model.analysisByQuestionId[questionId]))
assert('model evidence belongs to Q24-Q27', model.surfaceData.evidence.every((item) => readingBQuestionIds.includes(item.questionId)))

console.log(`\nC6a-6b verify: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
