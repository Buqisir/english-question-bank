#!/usr/bin/env node
/**
 * C6a-10 verification: local-first concierge search for reviewed
 * PaperSurface reading entries.
 *
 * Bug guarded here:
 *   With an API key present, the steward can return an over-broad or wrong
 *   semantic match. For already-imported paper-asset readings, exact local
 *   card metadata must win so teachers can find Reading C/D by title, label,
 *   or English "Reading C/D" wording.
 */

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

function ids(outcome) {
  return outcome.kind === 'results' ? outcome.hits.map((hit) => hit.group.id) : []
}

const { questionGroups } = await import(path.join(root, 'app/src/data/sampleQuestionGroups.ts'))
const {
  rankByKeywords,
  runConciergeSearch,
} = await import(path.join(root, 'app/src/concierge/conciergeSearch.ts'))
const { aggregatePaperResults } = await import(
  path.join(root, 'app/src/concierge/aggregatePaperResults.ts')
)

console.log('=== C6a-10: local-first concierge search ===\n')

console.log('-- 1. Search metadata prerequisites --')
const sample = read('app/src/data/sampleQuestionGroups.ts')
for (const groupId of [
  'group-2024-jslk-reading-a',
  'group-2024-jslk-reading-b',
  'group-2024-jslk-reading-c',
  'group-2024-jslk-reading-d',
]) {
  assert(`sample contains ${groupId}`, sample.includes(`id: '${groupId}'`))
}
assert('Reading C sample carries Chinese title cue', sample.includes('重新理解争论'))
assert('Reading D sample carries Chinese title cue', sample.includes('幼儿友谊与社交规则'))
assert('Reading C sample carries English answer cue', sample.includes('A. Critical.'))
assert('Reading D sample carries English passage title cue', sample.includes('How Your Baby Learns to Love'))

console.log('\n-- 2. Local keyword rank handles section labels precisely --')

const localCases = [
  {
    query: '2024 九省联考 阅读 C D',
    expectedPrefix: ['group-2024-jslk-reading-c', 'group-2024-jslk-reading-d'],
  },
  {
    query: 'Reading C',
    expectedPrefix: ['group-2024-jslk-reading-c'],
  },
  {
    query: 'Reading D',
    expectedPrefix: ['group-2024-jslk-reading-d'],
  },
  {
    query: '重新理解争论 Carnegie argument',
    expectedPrefix: ['group-2024-jslk-reading-c'],
  },
  {
    query: '幼儿友谊 社交规则 toddlers friendship',
    expectedPrefix: ['group-2024-jslk-reading-d'],
  },
]

for (const testCase of localCases) {
  const rankedIds = rankByKeywords(questionGroups, testCase.query).map((hit) => hit.group.id)
  assertEqual(
    `local rank prefix for "${testCase.query}"`,
    JSON.stringify(rankedIds.slice(0, testCase.expectedPrefix.length)),
    JSON.stringify(testCase.expectedPrefix),
  )
}

const readingCHits = rankByKeywords(questionGroups, 'Reading C').map((hit) => hit.group.id)
assert('single-letter C does not rank Reading A first', readingCHits[0] !== 'group-2024-jslk-reading-a')
const readingDHits = rankByKeywords(questionGroups, 'Reading D').map((hit) => hit.group.id)
assert('single-letter D does not rank Reading A first', readingDHits[0] !== 'group-2024-jslk-reading-a')

console.log('\n-- 3. Local direct match beats wrong steward output --')

let stewardCalls = 0
async function wrongSteward() {
  stewardCalls++
  return {
    needsClarification: false,
    assistantMessage: 'wrong steward result',
    search: {
      matches: [
        {
          questionGroupId: 'group-2024-jslk-reading-a',
          reason: 'wrong over-broad match',
        },
      ],
    },
  }
}

for (const testCase of localCases) {
  const before = stewardCalls
  const outcome = await runConciergeSearch({
    intent: testCase.query,
    apiKey: 'fake-key-present',
    questionGroups,
    doStewardCall: wrongSteward,
  })
  assertEqual(`"${testCase.query}" returns results`, outcome.kind, 'results')
  assertEqual(
    `"${testCase.query}" local-direct ids`,
    JSON.stringify(ids(outcome).slice(0, testCase.expectedPrefix.length)),
    JSON.stringify(testCase.expectedPrefix),
  )
  assertEqual(`"${testCase.query}" does not call steward`, stewardCalls, before)
  if (outcome.kind === 'results') {
    assertEqual(`"${testCase.query}" source is fallback/local`, outcome.source, 'fallback')
    assertEqual(
      `"${testCase.query}" reason is local-direct-match`,
      outcome.fallbackReason,
      'local-direct-match',
    )
  }
}

console.log('\n-- 4. Weak semantic query still reaches steward --')

const weakOutcome = await runConciergeSearch({
  intent: '生态主题 C 篇',
  apiKey: 'fake-key-present',
  questionGroups,
  doStewardCall: wrongSteward,
})
assert('weak semantic query calls steward', stewardCalls > 0)
assertEqual('weak semantic query keeps steward result shape', weakOutcome.kind, 'results')
assertEqual('weak semantic query can still use steward hit', ids(weakOutcome)[0], 'group-2024-jslk-reading-a')

console.log('\n-- 5. Source keeps local-first contract readable --')
const source = read('app/src/concierge/conciergeSearch.ts')
assert('local-direct fallback reason is encoded', source.includes("fallbackReason: 'local-direct-match'"))
assert('single-letter Latin token comment explains C/D labels', source.includes('Single-letter Latin tokens'))
assert('Reading C/D aliases are explicit', source.includes('`reading ${readingSection}`'))

console.log('\n-- 6. Runtime API data is merged with repo samples --')
const appSource = read('app/src/App.tsx')
assert('App defines sample/API merge helper', appSource.includes('function mergeQuestionGroupsWithSamples'))
// 大重构后初始加载与所有刷新路径收敛进单一的 refreshQuestionGroups——
// 不再数文本 call-site（旧断言在 main 上长红），改钉真不变量：
// 合并调用必须住在 refreshQuestionGroups 内，且该函数被 ≥2 处调用
// （挂载 effect + 各刷新点），保证初始与刷新都走 sample 合并。
assert(
  'API loads merge samples inside the single refreshQuestionGroups choke point',
  /const refreshQuestionGroups = useCallback[\s\S]{0,400}setQuestionGroups\(mergeQuestionGroupsWithSamples\(groups\)\)/.test(appSource),
)
assert(
  'initial mount and refresh paths both route through refreshQuestionGroups',
  (appSource.match(/refreshQuestionGroups\(/g) || []).length >= 3, // 定义 1 处 + 调用 ≥2 处
)

console.log('\n-- 7. Same paper stays one row when C/D both match --')
const cdOutcome = await runConciergeSearch({
  intent: '2024 九省联考 阅读 C D',
  apiKey: '',
  questionGroups,
})
const cdPaperRows = aggregatePaperResults(cdOutcome.kind === 'results' ? cdOutcome.hits : [])
const jslkRows = cdPaperRows.filter((paper) => paper.paperName === '高考综合改革适应性测试')
assertEqual('C/D search aggregates to one JSLK paper row', jslkRows.length, 1)
assertEqual('C/D paper row has two matched groups', jslkRows[0]?.groups.length, 2)
assert(
  'C/D paper row contains Reading C',
  !!jslkRows[0]?.groups.some(({ group }) => group.id === 'group-2024-jslk-reading-c'),
)
assert(
  'C/D paper row contains Reading D',
  !!jslkRows[0]?.groups.some(({ group }) => group.id === 'group-2024-jslk-reading-d'),
)
const aggregateSource = read('app/src/concierge/aggregatePaperResults.ts')
assert('aggregator drops passage-level Chinese source labels', aggregateSource.includes('阅读(?:理解)?\\s*[A-G]'))
assert('aggregator drops passage-level English source labels', aggregateSource.includes('reading\\s*[A-G]'))

console.log(`\nC6a-10 concierge local-search verify: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
