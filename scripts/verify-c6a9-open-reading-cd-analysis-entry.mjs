#!/usr/bin/env node
/**
 * C6a-9 verification: expose reviewed Reading C/D through the existing
 * concierge -> PaperSurface entry path.
 *
 * This cut opens route/card/seed metadata only after C6a-7 and C6a-8
 * reviewed analyses exist. It must not modify PaperSurface, the analysis
 * panel, shared renderers, or paper-asset source/analysis content.
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

console.log('=== C6a-9: open Reading C/D reviewed-analysis entries ===\n')

console.log('-- 1. Scope --')

const allowedFiles = new Set([
  'app/src/data/sampleQuestionGroups.ts',
  'app/src/features/paper-intelligence/paperIntelligenceRoute.ts',
  'data/sql/seed-v0.sql',
  'scripts/verify-c6a4-paper-asset-analysis-loader.mjs',
  'scripts/verify-c6a5-search-entry-e2e.mjs',
  'scripts/verify-c6a6a-reading-b-analysis.mjs',
  'scripts/verify-c6a6b-open-reading-b-analysis-entry.mjs',
  'scripts/verify-c6a7-reading-c-analysis.mjs',
  'scripts/verify-c6a8-reading-d-analysis.mjs',
  'scripts/verify-c6a9-open-reading-cd-analysis-entry.mjs',
])

for (const file of changedFiles) {
  assert(`changed file allowed: ${file}`, allowedFiles.has(file), 'unexpected C6a-9 file')
}

assert('analysis JSON unchanged in this cut', !changedFiles.includes('app/public/paper-assets/paper-2024-jslk-english/analyses/reading-choice-analysis-v1.json'))
assert('paper-asset source unchanged', !changedFiles.includes('app/public/paper-assets/paper-2024-jslk-english/paper-asset.json'))
assert('PaperSurface renderer unchanged', !changedFiles.some((file) => file.startsWith('app/src/shared-ui/papersurface/')))
assert('shared/papersurface unchanged', !changedFiles.some((file) => file.startsWith('shared/papersurface/')))
assert('server unchanged', !changedFiles.some((file) => file.startsWith('server/')))
assert('package and lockfiles unchanged', !changedFiles.some((file) => /(^|\/)(package(-lock)?\.json|pnpm-lock\.yaml)$/.test(file)))

console.log('\n-- 2. Reviewed data prerequisites --')

const asset = readJson('app/public/paper-assets/paper-2024-jslk-english/paper-asset.json')
const analysis = readJson('app/public/paper-assets/paper-2024-jslk-english/analyses/reading-choice-analysis-v1.json')

const targets = [
  {
    label: 'Reading C',
    section: 'C',
    groupId: 'group-2024-jslk-reading-c',
    questionIds: ['q-2024-jslk-028', 'q-2024-jslk-029', 'q-2024-jslk-030', 'q-2024-jslk-031'],
    defaultQuestionId: 'q-2024-jslk-028',
    title: '2024九省联考 阅读 C 重新理解争论',
    source: '2024 九省联考 阅读 C',
    previewStem: "What is the author's attitude toward Carnegie's understanding of argument?",
    answerPreview: 'A. Critical.',
    sourceId: 'src-2024-jslk-reading-c',
    passageId: 'passage-2024-jslk-reading-c',
  },
  {
    label: 'Reading D',
    section: 'D',
    groupId: 'group-2024-jslk-reading-d',
    questionIds: ['q-2024-jslk-032', 'q-2024-jslk-033', 'q-2024-jslk-034', 'q-2024-jslk-035'],
    defaultQuestionId: 'q-2024-jslk-032',
    title: '2024九省联考 阅读 D 幼儿友谊与社交规则',
    source: '2024 九省联考 阅读 D',
    previewStem: "What does it indicate when toddlers copy their playmates' behavior?",
    answerPreview: 'C. They are fond of their playmates.',
    sourceId: 'src-2024-jslk-reading-d',
    passageId: 'passage-2024-jslk-reading-d',
  },
]

for (const target of targets) {
  assert(`paper asset has ${target.label} group`, !!asset.content.groups[target.groupId])
  assert(`reviewed analysis targets ${target.label}`, analysis.targetGroups.includes(target.groupId))
  assert(`reviewed analysis has ${target.label} group analysis`, !!analysis.groups[target.groupId])
  assertEqual(
    `${target.label} question ids match paper asset`,
    JSON.stringify(asset.content.groups[target.groupId]?.questionIds),
    JSON.stringify(target.questionIds),
  )
  for (const questionId of target.questionIds) {
    assert(`reviewed analysis has ${questionId}`, !!analysis.questions[questionId])
  }
}

console.log('\n-- 3. Route targets --')

const {
  buildPaperSurfaceAnalysisHrefForGroupId,
  parsePaperIntelligenceRoute,
} = await import(path.join(root, 'app/src/features/paper-intelligence/paperIntelligenceRoute.ts'))

for (const target of targets) {
  const href = buildPaperSurfaceAnalysisHrefForGroupId(target.groupId)
  assert(`${target.label} group now has PaperSurface href`, typeof href === 'string')
  const params = new URLSearchParams((href || '').slice(1))
  assertEqual(`${target.label} href source`, params.get('source'), 'paper-asset')
  assertEqual(`${target.label} href paperId`, params.get('paperId'), 'paper-2024-jslk-english')
  assertEqual(`${target.label} href surface`, params.get('surface'), 'paper')
  assertEqual(`${target.label} href groupId`, params.get('groupId'), target.groupId)
  assertEqual(`${target.label} href default questionId`, params.get('questionId'), target.defaultQuestionId)

  const parsed = parsePaperIntelligenceRoute({ search: href || '' })
  assertEqual(`${target.label} parsed route kind`, parsed.kind, 'paper-intelligence')
  if (parsed.kind === 'paper-intelligence') {
    assertEqual(`${target.label} parsed source`, parsed.source, 'paper-asset')
    assertEqual(`${target.label} parsed groupId`, parsed.groupId, target.groupId)
    assertEqual(`${target.label} parsed questionId`, parsed.questionId, target.defaultQuestionId)
  }
}

assert('unsupported XKB1 Reading B remains closed', buildPaperSurfaceAnalysisHrefForGroupId('g-2024-xkb1-b') === null)
assert('unsupported XKB1 Reading C remains closed', buildPaperSurfaceAnalysisHrefForGroupId('g-2024-xkb1-c') === null)
assert('unsupported arbitrary reading group remains closed', buildPaperSurfaceAnalysisHrefForGroupId('g-unmapped-reading') === null)

console.log('\n-- 4. Search card and seed data --')

const sample = read('app/src/data/sampleQuestionGroups.ts')
const seed = read('data/sql/seed-v0.sql')

for (const target of targets) {
  assert(`sample data contains ${target.label} group id`, sample.includes(`id: '${target.groupId}'`))
  assert(`sample data names ${target.label} source`, sample.includes(`source: '${target.source}'`))
  assert(`sample data keeps ${target.label} questionCount 4`, new RegExp(`id: '${target.groupId}'[\\s\\S]*questionCount: 4`).test(sample))
  assert(`sample data previews ${target.defaultQuestionId}`, sample.includes(target.previewStem))
  assert(`sample data answer preview for ${target.label}`, sample.includes(target.answerPreview))

  assert(`seed has ${target.label} source`, seed.includes(`'${target.sourceId}'`))
  assert(`seed has ${target.label} passage metadata`, seed.includes(`'${target.passageId}'`))
  assert(`seed has ${target.label} group metadata`, seed.includes(`'${target.groupId}'`))
  for (const questionId of target.questionIds) {
    assert(`seed has ${questionId}`, seed.includes(`'${questionId}'`))
  }
  assert(`seed references reviewed analysis JSON for ${target.label}`, seed.includes('C6a-9：正式解析见 paper-asset reviewed analysis JSON。'))
}

console.log('\n-- 5. Adapter compatibility --')

const { buildPaperAssetSurfaceModel } = await import(
  path.join(root, 'app/src/features/paper-intelligence/paperAssetSurfaceAdapter.ts')
)

for (const target of targets) {
  const model = buildPaperAssetSurfaceModel({
    asset,
    analysis,
    groupId: target.groupId,
  })
  assertEqual(`${target.label} model default question`, model.defaultQuestionId, target.defaultQuestionId)
  assertEqual(`${target.label} model renders one passage`, model.report.passages.length, 1)
  assertEqual(`${target.label} model paper section`, model.report.passages[0]?.paperSection, target.section)
  assertEqual(
    `${target.label} model renders expected questions`,
    JSON.stringify(model.surfaceData.questions.map((question) => question.id)),
    JSON.stringify(target.questionIds),
  )
  assert(`${target.label} model has reviewed analysis rows`, target.questionIds.every((questionId) => !!model.analysisByQuestionId[questionId]))
  assert(`${target.label} model evidence belongs to target questions`, model.surfaceData.evidence.every((item) => target.questionIds.includes(item.questionId)))
}

console.log(`\nC6a-9 verify: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
