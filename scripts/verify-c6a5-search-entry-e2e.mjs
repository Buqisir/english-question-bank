#!/usr/bin/env node
/**
 * Verification: C6a-5 — search entry end-to-end guard.
 *
 * Locks the teacher-facing entry path:
 * - Concierge search must not stay stuck when an external steward call hangs.
 * - The formal 九省联考 Reading A card must still route to PaperSurface.
 */

import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
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
  assert(name, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}

const here = path.dirname(new URL(import.meta.url).pathname)
const root = path.resolve(here, '..')

function read(relPath) {
  return readFileSync(path.join(root, relPath), 'utf8')
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

console.log('=== C6a-5: search entry E2E guard ===\n')

console.log('-- 1. Scope guard --')
const allowed = new Set([
  'app/src/concierge/conciergeSearch.ts',
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
  'app/public/paper-assets/paper-2024-jslk-english/analyses/reading-choice-analysis-v1.json',
])
for (const file of changedFiles) {
  assert(`changed file allowed: ${file}`, allowed.has(file), 'unexpected C6a-5 file')
}
assert('PaperSurface unchanged', !changedFiles.some((file) => file.startsWith('app/src/shared-ui/papersurface/')))
assert('paper-asset source fixture unchanged', !changedFiles.includes('app/public/paper-assets/paper-2024-jslk-english/paper-asset.json'))
assert('reports unchanged', !changedFiles.some((file) => file.startsWith('app/public/reports/')))
assert('server unchanged', !changedFiles.some((file) => file.startsWith('server/')))
assert('package and lockfiles unchanged', !changedFiles.some((file) => /(^|\/)(package(-lock)?\.json|pnpm-lock\.yaml)$/.test(file)))

console.log('\n-- 2. Timeout fallback contract --')
const conciergeSearch = read('app/src/concierge/conciergeSearch.ts')
assert('runConciergeSearch exposes stewardTimeoutMs test hook', conciergeSearch.includes('stewardTimeoutMs?: number'))
assert('default steward timeout is explicit', conciergeSearch.includes('DEFAULT_STEWARD_TIMEOUT_MS'))
assert('steward call is wrapped in withTimeout', conciergeSearch.includes('withTimeout('))
assert('timeout path falls through existing catch fallback', conciergeSearch.includes('steward call failed; using keyword fallback'))

console.log('\n-- 3. Runtime fallback behavior --')
const { runConciergeSearch } = await import(path.join(root, 'app/src/concierge/conciergeSearch.ts'))

const fixtureGroups = [
  {
    id: 'group-2024-jslk-reading-a',
    title: '2024九省联考 阅读 A 黄石公园海报展',
    source: '2024 九省联考 高考综合改革适应性测试',
    sourceType: 'real_exam',
    year: 2024,
    region: '九省联考',
    paperName: '高考综合改革适应性测试',
    section: '阅读理解 A',
    passageTitle: 'Yellowstone Poster Exhibition to Be on View at UW’s Coe Library',
    summary: '介绍怀俄明大学 Coe Library 举办黄石国家公园海报展。',
    groupType: 'reading',
    questionCount: 3,
    difficulty: 'medium',
    tags: ['九省联考', '黄石', '阅读理解'],
    topicLabels: [],
    hit: 'How long will the exhibition "Wonderland Illustrated" last?',
    answerPreview: 'C. Four months.',
    defaultScore: 2.5,
  },
]

const outcome = await runConciergeSearch({
  intent: '九省联考 Reading A 黄石',
  questionGroups: fixtureGroups,
  apiKey: 'sk-stale-key',
  stewardTimeoutMs: 5,
  doStewardCall: () => new Promise(() => {}),
})

assertEqual('stale steward falls back to local results', outcome.kind, 'results')
if (outcome.kind === 'results') {
  assertEqual('fallback source is local keyword fallback', outcome.source, 'fallback')
  assertEqual('fallback reason is api-error', outcome.fallbackReason, 'api-error')
  assertEqual('fallback returns the JSLK Reading A group', outcome.hits[0]?.group.id, 'group-2024-jslk-reading-a')
  assert('fallback message is teacher-friendly', outcome.assistantMessage.includes('本地题库'))
}

console.log('\n-- 4. PaperSurface entry contract still covered --')
const { buildPaperSurfaceAnalysisHrefForGroupId } = await import(
  path.join(root, 'app/src/features/paper-intelligence/paperIntelligenceRoute.ts')
)
const href = buildPaperSurfaceAnalysisHrefForGroupId('group-2024-jslk-reading-a')
assert('JSLK Reading A has Reading Analysis href', typeof href === 'string')
if (href) {
  const params = new URLSearchParams(href.slice(1))
  assertEqual('href uses paper-asset source', params.get('source'), 'paper-asset')
  assertEqual('href uses JSLK paper id', params.get('paperId'), 'paper-2024-jslk-english')
  assertEqual('href uses Reading A group id', params.get('groupId'), 'group-2024-jslk-reading-a')
  assertEqual('href defaults to Q21', params.get('questionId'), 'q-2024-jslk-021')
}

console.log(`\nC6a-5 verify: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
