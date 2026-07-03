#!/usr/bin/env node
/**
 * Restart cut ① verification: local-first concierge search understands
 * natural-language Chinese queries.
 *
 * Bug guarded here (docs/cuts/restart-2026-07-mainline/audit.md P0-1):
 *   `tokenize` only split on whitespace/punctuation, so a connected CJK
 *   phrase like "生态主题" became ONE coarse token that could only match an
 *   *exact* substring of the haystack — it could never land on "生态环境"
 *   inside a topic-label path. Combined with equal-weight counting across
 *   every field, an incidental "c"/"篇" hit could outrank a real topic
 *   match. This script pins:
 *     1. tokenize() emits CJK bigrams + stopword filtering.
 *     2. parseLocalIntent() extracts year / section letters / group type /
 *        region from a natural-language query.
 *     3. Weighted ranking favors topic-label hits over section/place hits
 *        over generic-field hits, with year DESC as the final tiebreak.
 *
 * Hermetic: imports the TS source directly (Node's built-in TS stripping),
 * no `git show main:`, no dependency on a local `main` ref.
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

const {
  tokenize,
  parseLocalIntent,
  rankByKeywords,
  runConciergeSearch,
} = await import(path.join(root, 'app/src/concierge/conciergeSearch.ts'))
const { questionGroups: sampleQuestionGroups } = await import(
  path.join(root, 'app/src/data/sampleQuestionGroups.ts')
)

console.log('=== Restart cut ① — local search understands Chinese intent ===\n')

// ------------------------------------------------------------------------
console.log('-- 1. tokenize() CJK bigram production --')

assertEqual(
  'connected CJK run yields whole run + bigrams',
  JSON.stringify(tokenize('生态主题').sort()),
  JSON.stringify(['主题', '态主', '生态', '生态主题'].sort()),
)
assertEqual(
  'spaced CJK segments stay independent',
  JSON.stringify(tokenize('生态 主题')),
  JSON.stringify(['生态', '主题']),
)
assert(
  'stopwords are dropped even inside a longer run (篇/的/找/一道 do not survive)',
  !tokenize('找一篇讲生态的题').includes('篇') &&
    !tokenize('找一篇讲生态的题').includes('的') &&
    !tokenize('找一篇讲生态的题').includes('找'),
)
assert('a bare two-char run is not duplicated as its own bigram', tokenize('完形').filter((t) => t === '完形').length === 1)
assertEqual('single Latin letters survive tokenize unchanged', JSON.stringify(tokenize('Reading C')), JSON.stringify(['Reading', 'C']))
assert('tokenize output has no duplicate tokens', (() => {
  const tokens = tokenize('2024 九省联考 阅读 C D 阅读')
  return new Set(tokens).size === tokens.length
})())

// ------------------------------------------------------------------------
console.log('\n-- 2. parseLocalIntent() structured dimensions --')

assertEqual('bare year extraction', parseLocalIntent('2025 浙江卷').year, 2025)
assertEqual('no year -> null', parseLocalIntent('七选五').year, null)

assertEqual(
  'single reading-section letter ("Reading C")',
  JSON.stringify(parseLocalIntent('Reading C').sectionLetters),
  JSON.stringify(['c']),
)
assertEqual(
  'Chinese reading-section letter ("阅读理解C")',
  JSON.stringify(parseLocalIntent('阅读理解C').sectionLetters),
  JSON.stringify(['c']),
)
assertEqual(
  'bare "C 篇" phrasing',
  JSON.stringify(parseLocalIntent('生态主题 C 篇').sectionLetters),
  JSON.stringify(['c']),
)
assertEqual(
  'multi-letter run ("阅读 C D") extracts both letters',
  JSON.stringify(parseLocalIntent('2024 九省联考 阅读 C D').sectionLetters.sort()),
  JSON.stringify(['c', 'd']),
)

assertEqual('groupType: 七选五 -> seven_choices', parseLocalIntent('七选五').groupType, 'seven_choices')
assertEqual('groupType: 完形 -> cloze', parseLocalIntent('全国甲卷 完形').groupType, 'cloze')
assertEqual('groupType: 语法填空 -> grammar_cloze', parseLocalIntent('语法填空真题').groupType, 'grammar_cloze')
assertEqual('groupType: 阅读 -> reading', parseLocalIntent('找一道讲写作教学反思的阅读').groupType, 'reading')
assertEqual('no group-type phrase -> null', parseLocalIntent('2025 浙江卷').groupType, null)

assertEqual('region: 浙江', parseLocalIntent('2025 浙江卷').region, '浙江')
assertEqual('region: 全国甲卷 (not just 全国)', parseLocalIntent('全国甲卷 完形').region, '全国甲卷')
assertEqual('no region phrase -> null', parseLocalIntent('七选五').region, null)

// ------------------------------------------------------------------------
console.log('\n-- 3. Weighted ranking: topic label > section/place > generic fields --')

function makeGroup(overrides) {
  return {
    ...sampleQuestionGroups[0],
    tags: [],
    topicLabels: [],
    ...overrides,
  }
}

{
  // A group whose ONLY signal is a topic-label hit should outrank a group
  // that only has an incidental generic-field hit, even though the generic
  // group also "contains" a matching word somewhere.
  const ecoGroup = makeGroup({
    id: 'restart1-eco',
    title: '2026 浙江卷 阅读 C 生态修复',
    section: '阅读理解 C',
    year: 2026,
    region: '浙江',
    groupType: 'reading',
    topicLabels: [
      { label: '人与自然-自然生态-生态环境', theme: '人与自然', themeGroup: '自然生态', subtopic: '生态环境' },
    ],
  })
  const distractor = makeGroup({
    id: 'restart1-distractor',
    title: '2024 讲 fake reviews 的阅读 C',
    section: '阅读理解 C',
    year: 2024,
    region: '其他',
    groupType: 'reading',
    summary: '讲网络虚假评论识别，主题与生态无关。',
  })
  const hits = rankByKeywords([distractor, ecoGroup], '生态主题 C 篇')
  assertEqual('topic-label group ranks first for "生态主题 C 篇"', hits[0]?.group.id, 'restart1-eco')
  assert(
    'reason is human-language, not a raw keyword dump',
    /生态环境/.test(hits[0]?.reason || '') && !/匹配关键词/.test(hits[0]?.reason || ''),
    `got: ${hits[0]?.reason}`,
  )
}

{
  // Same-score tiebreak: two groups with identical topic label, different
  // year -> the more recent year sorts first.
  const older = makeGroup({
    id: 'restart1-old',
    year: 2022,
    region: '浙江',
    groupType: 'reading',
    section: '阅读理解 C',
    topicLabels: [
      { label: '人与自然-自然生态-生态环境', theme: '人与自然', themeGroup: '自然生态', subtopic: '生态环境' },
    ],
  })
  const newer = makeGroup({
    id: 'restart1-new',
    year: 2026,
    region: '浙江',
    groupType: 'reading',
    section: '阅读理解 C',
    topicLabels: [
      { label: '人与自然-自然生态-生态环境', theme: '人与自然', themeGroup: '自然生态', subtopic: '生态环境' },
    ],
  })
  const hits = rankByKeywords([older, newer], '生态环境')
  assertEqual('equal-score topic hits tiebreak by year DESC', hits[0]?.group.id, 'restart1-new')
}

// ------------------------------------------------------------------------
console.log('\n-- 4. Hard-filter dimensions (section / group type / region) --')

{
  const zjCloze2025 = makeGroup({ id: 'restart1-zj-cloze-2025', groupType: 'cloze', region: '浙江', year: 2025, section: '完形填空' })
  const nkCloze2023 = makeGroup({ id: 'restart1-nk-cloze-2023', groupType: 'cloze', region: '全国甲卷', year: 2023, section: '完形填空' })
  const zjReading2025 = makeGroup({ id: 'restart1-zj-reading-2025', groupType: 'reading', region: '浙江', year: 2025, section: '阅读理解 B' })
  const pool = [zjCloze2025, nkCloze2023, zjReading2025]

  const yearRegion = await runConciergeSearch({ intent: '2025 浙江卷', apiKey: '', questionGroups: pool })
  assertEqual('"2025 浙江卷" outcome kind', yearRegion.kind, 'results')
  assert(
    '"2025 浙江卷" only returns 2025 浙江 groups (region+year hard signal)',
    yearRegion.kind === 'results' && yearRegion.hits.every((h) => h.group.region === '浙江' && h.group.year === 2025),
    yearRegion.kind === 'results' ? JSON.stringify(yearRegion.hits.map((h) => h.group.id)) : '',
  )

  const clozeOnly = await runConciergeSearch({ intent: '全国甲卷 完形', apiKey: '', questionGroups: pool })
  assertEqual('"全国甲卷 完形" outcome kind', clozeOnly.kind, 'results')
  assertEqual(
    '"全国甲卷 完形" resolves to the one matching group',
    clozeOnly.kind === 'results' ? clozeOnly.hits.map((h) => h.group.id).join(',') : '',
    'restart1-nk-cloze-2023',
  )
}

{
  const scGroup = makeGroup({ id: 'restart1-sc', groupType: 'seven_choices', region: '浙江', year: 2025, section: '七选五' })
  const readingGroup = makeGroup({ id: 'restart1-reading-noise', groupType: 'reading', region: '浙江', year: 2025, section: '阅读理解 A' })
  const out = await runConciergeSearch({ intent: '七选五', apiKey: '', questionGroups: [scGroup, readingGroup] })
  assertEqual('"七选五" outcome kind', out.kind, 'results')
  assertEqual(
    '"七选五" hard-filters out non-seven_choices groups',
    out.kind === 'results' ? out.hits.every((h) => h.group.groupType === 'seven_choices') : false,
    true,
  )
}

// ------------------------------------------------------------------------
console.log('\n-- 5. Non-regression: plain English / empty query / no-label groups --')

{
  const readingCHits = rankByKeywords(sampleQuestionGroups, 'reading C')
  assert('plain lowercase "reading C" still returns results', readingCHits.length > 0)
}
{
  const empty = rankByKeywords(sampleQuestionGroups, '')
  assert('empty query returns a non-crashing top-N list', empty.length > 0)
}
{
  // A query that matches nothing recognizable in a no-topic-label dataset
  // must NOT hard-filter itself into a false "confident" local match — it
  // should still be eligible to reach the (mocked) steward.
  let stewardCalled = false
  const stub = async () => {
    stewardCalled = true
    return { needsClarification: false, assistantMessage: 'x', matches: [] }
  }
  await runConciergeSearch({
    intent: '生态主题 C 篇',
    apiKey: 'fake-key',
    questionGroups: sampleQuestionGroups,
    doStewardCall: stub,
  })
  assert(
    'weak query without any real topic/section signal still reaches steward (no false local lock-in)',
    stewardCalled,
  )
}

// ------------------------------------------------------------------------
console.log('\n-- 6. Display layer shows topic-label leaf, not the full path --')

const groupCardSource = read('app/src/concierge/ConciergeGroupCard.tsx')
assert('ConciergeGroupCard derives a topic leaf label (not the raw full path)', groupCardSource.includes('topicLeafLabel'))
const paperRowSource = read('app/src/concierge/ConciergePaperRow.tsx')
assert('ConciergePaperRow builds topic chips from matched groups', paperRowSource.includes('buildTopicChips'))

console.log(`\nRestart cut ① local-search-intent verify: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
