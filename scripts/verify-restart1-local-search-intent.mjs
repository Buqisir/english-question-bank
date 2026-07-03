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
 * Rework (2026-07, real-DB browser QA found 3 defects the sample-fixture
 * verify above did not catch):
 *   4. Real imported data stores the passage letter as bare English
 *      "Reading C" in `title`; `group.section` is a generic paper-outline
 *      string with no letter at all. `extractReadingSectionLabel` needed an
 *      English fallback pattern, and hard-filtering needed to apply by
 *      default in `rankKeywordCandidates` (not only inside the
 *      high-confidence gate) so the no-API-key fallback path — the one
 *      teachers hit most often in practice — also respects an explicit
 *      "C 篇" / "全国甲卷" / "七选五" dimension instead of silently falling
 *      through to the fully unfiltered candidate pool.
 *   5. Topic-label matching used plain substring, so a query token "生态"
 *      matched inside "人生态度" (人-生-态-度) purely by character
 *      coincidence, even though the label has nothing to do with ecology.
 *      Topic-tier matching is now prefix-or-equal per segment.
 *   6. Dimension-shaped tags (bare years "2025", 题型 tags "完形填空",
 *      provenance tags "浙江卷") were being picked up by the reason
 *      builder's tag fallback and rendered as fake topic content
 *      ("讲2025的 完形填空"). The reason builder now recognizes and skips
 *      dimension-shaped tags, falling back to a plain "地区 年份 · 题型/
 *      篇位" line when no real content signal exists.
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
const { pickResultsNoticeLine } = await import(path.join(root, 'app/src/concierge/clarificationCopy.ts'))
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
console.log('\n-- 7. Regression: real-DB section format ("Reading C" in title, no 阅读理解C pattern) --')

{
  // Real imported data stores the passage letter as bare English "Reading C"
  // in `title`; `section` is a generic paper-outline string with NO letter
  // at all ("第二部分 阅读 / 第一节 阅读理解"). Mirrors the shape found via
  // browser QA against the live DB (2026-07 restart cut ① rework).
  function realShapeReading(id, letter, overrides = {}) {
    return makeGroup({
      id,
      title: `Reading ${letter.toUpperCase()}`,
      section: '第二部分 阅读 / 第一节 阅读理解',
      source: `2024 全国新课标Ⅰ 2024年新课标Ⅰ卷`,
      groupType: 'reading',
      year: 2024,
      region: '全国新课标Ⅰ',
      ...overrides,
    })
  }
  const realC = realShapeReading('restart1-real-c', 'c')
  const realD = realShapeReading('restart1-real-d', 'd')
  const realWriting = makeGroup({
    id: 'restart1-real-writing',
    title: '读后续写',
    section: '第四部分 写作 / 第二节 读后续写',
    groupType: 'continuation',
    year: 2024,
    region: '全国新课标Ⅰ',
    tags: ['真题', '2024', '新课标Ⅰ卷'],
    topicLabels: [
      { label: '人与自我-做人与做事-正确的人生态度', theme: '人与自我', themeGroup: '做人与做事', subtopic: '正确的人生态度' },
    ],
  })
  const realCloze = makeGroup({
    id: 'restart1-real-cloze',
    title: '完形填空',
    section: '第三部分 语言运用 / 第一节 完形填空',
    groupType: 'cloze',
    year: 2024,
    region: '全国新课标Ⅰ',
    tags: ['真题', '2024', '新课标Ⅰ卷'],
    topicLabels: [
      { label: '人与自我-做人与做事-正确的人生态度', theme: '人与自我', themeGroup: '做人与做事', subtopic: '正确的人生态度' },
    ],
  })
  const pool = [realC, realD, realWriting, realCloze]

  const cOnly = await runConciergeSearch({ intent: '生态主题 C 篇', apiKey: '', questionGroups: pool })
  assertEqual('"生态主题 C 篇" against real-shape data returns results', cOnly.kind, 'results')
  assert(
    '"生态主题 C 篇" hard-filters to reading-C only (real "Reading C" title format resolves the letter)',
    cOnly.kind === 'results' &&
      cOnly.hits.length > 0 &&
      cOnly.hits.every((h) => h.group.id === 'restart1-real-c'),
    cOnly.kind === 'results' ? JSON.stringify(cOnly.hits.map((h) => h.group.id)) : '',
  )
  assert(
    '"生态主题 C 篇" excludes writing/cloze groups even though they carry a 人生态度-adjacent topic label',
    cOnly.kind === 'results' &&
      !cOnly.hits.some((h) => h.group.id === 'restart1-real-writing' || h.group.id === 'restart1-real-cloze'),
  )
}

{
  // "一篇" / "这篇" must never be misread as a section-letter reference —
  // neither "一" nor "这" is an A-D letter, so parseLocalIntent must find
  // no section letters here. This exact query is also the audit's
  // known-good non-regression case: it must still resolve via groupType
  // hard-filter (阅读), not get zero'd out by an over-eager letter regex.
  const intent1 = parseLocalIntent('找一篇讲环境保护的阅读，中等难度，最好是近三年的')
  assertEqual('"一篇" does not produce a false section letter', JSON.stringify(intent1.sectionLetters), JSON.stringify([]))
  assertEqual('"找一篇讲环境保护的阅读" still resolves groupType: reading', intent1.groupType, 'reading')

  const intent2 = parseLocalIntent('这篇讲生态的阅读怎么样')
  assertEqual('"这篇" does not produce a false section letter', JSON.stringify(intent2.sectionLetters), JSON.stringify([]))
}

// ------------------------------------------------------------------------
console.log('\n-- 8. Regression: topic-label matching is prefix/equal, not substring --')

{
  // "生态" is a literal substring of "人生态度" (人-生-态-度) even though the
  // label is about life attitude, not ecology. Topic-tier matching must
  // require the token to be a PREFIX of the segment (or equal to it), not
  // just embedded anywhere inside it. Title/summary here mirror the real
  // polluting group found via browser QA (generic "读后续写", no "生态"
  // substring anywhere outside the topic label) so this test isolates the
  // topic-tier bug and does not accidentally ride on an unrelated
  // general-tier title coincidence.
  const lifeAttitudeGroup = makeGroup({
    id: 'restart1-life-attitude',
    groupType: 'writing',
    title: '读后续写',
    summary: '读后续写',
    tags: ['AI导题', '读后续写'],
    topicLabels: [
      { label: '人与自我-做人与做事-正确的人生态度', theme: '人与自我', themeGroup: '做人与做事', subtopic: '正确的人生态度' },
    ],
  })
  const ecoGroup = makeGroup({
    id: 'restart1-ecology',
    groupType: 'reading',
    title: 'Reading D',
    section: '第二部分 阅读 / 第一节 阅读理解',
    tags: [],
    topicLabels: [
      { label: '人与自然-自然生态-生态环境', theme: '人与自然', themeGroup: '自然生态', subtopic: '生态环境' },
    ],
  })

  const soloLifeAttitude = rankByKeywords([lifeAttitudeGroup], '生态')
  assertEqual(
    '"生态" alone does NOT match a group whose only label is 人生态度 (embedded, not a prefix)',
    soloLifeAttitude.length,
    0,
  )

  const both = rankByKeywords([lifeAttitudeGroup, ecoGroup], '生态')
  assertEqual('"生态" with both groups present only surfaces the real ecology label', both.length, 1)
  assertEqual('"生态" surfaces the ecology group, not 人生态度', both[0]?.group.id, 'restart1-ecology')
  assert(
    '"生态" match reason mentions 生态环境, not 人生态度',
    /生态环境/.test(both[0]?.reason || '') && !/人生态度/.test(both[0]?.reason || ''),
    `got: ${both[0]?.reason}`,
  )

  // A token equal to the whole segment must still match (prefix rule
  // includes exact equality).
  const exact = rankByKeywords([ecoGroup], '生态环境')
  assertEqual('exact segment text ("生态环境") still matches', exact.length, 1)
}

// ------------------------------------------------------------------------
console.log('\n-- 9. Regression: dimension words are not rendered as topic content --')

{
  // Real imports tag groups with provenance metadata ("2025", "浙江卷",
  // "完形填空", ...) that happens to substring-match the query's own
  // dimension words. Those must never populate the "讲X的" clause — the
  // reason should state the dimensions plainly instead.
  const clozeGroup = makeGroup({
    id: 'restart1-dim-cloze',
    groupType: 'cloze',
    title: '完形填空',
    section: '第三部分 语言运用 / 第一节 完形填空',
    year: 2025,
    region: '浙江',
    tags: ['真题', '2025', '浙江卷', '1月', '完形填空'],
    topicLabels: [],
  })
  const out1 = await runConciergeSearch({ intent: '2025 浙江卷', apiKey: '', questionGroups: [clozeGroup] })
  assertEqual('"2025 浙江卷" outcome kind (dimension-only match)', out1.kind, 'results')
  assert(
    '"2025 浙江卷" reason does not use 讲X的 phrasing for a pure dimension match',
    out1.kind === 'results' && !/讲2025的|讲完形填空的|讲浙江卷的/.test(out1.hits[0]?.reason || ''),
    out1.kind === 'results' ? out1.hits[0]?.reason : '',
  )
  assert(
    '"2025 浙江卷" reason still states the dimensions plainly',
    out1.kind === 'results' && /2025/.test(out1.hits[0]?.reason || '') && /浙江/.test(out1.hits[0]?.reason || ''),
    out1.kind === 'results' ? out1.hits[0]?.reason : '',
  )

  const scGroup = makeGroup({
    id: 'restart1-dim-sc',
    groupType: 'seven_choices',
    title: '七选五',
    section: '第二部分 阅读 / 第三节 七选五',
    year: 2026,
    region: '浙江',
    tags: ['真题', '2026', '浙江卷', '七选五'],
    topicLabels: [],
  })
  const out2 = await runConciergeSearch({ intent: '七选五', apiKey: '', questionGroups: [scGroup] })
  assertEqual('"七选五" outcome kind (dimension-only match)', out2.kind, 'results')
  assert(
    '"七选五" reason does not render "讲七选五的 七选五"',
    out2.kind === 'results' && !/讲七选五的/.test(out2.hits[0]?.reason || ''),
    out2.kind === 'results' ? out2.hits[0]?.reason : '',
  )

  // Real content should still get the "讲X的" phrasing — this proves the
  // fix did not silence topic phrasing globally, only for dimension tags.
  const contentGroup = makeGroup({
    id: 'restart1-dim-content',
    groupType: 'reading',
    title: 'Reading D',
    section: '第二部分 阅读 / 第一节 阅读理解',
    year: 2020,
    region: '全国新课标Ⅱ',
    tags: [],
    topicLabels: [
      { label: '人与自然-自然生态-生态环境', theme: '人与自然', themeGroup: '自然生态', subtopic: '生态环境' },
    ],
  })
  const out3 = await runConciergeSearch({ intent: '生态环境', apiKey: '', questionGroups: [contentGroup] })
  assertEqual('"生态环境" outcome kind (real content match)', out3.kind, 'results')
  assert(
    '"生态环境" reason still uses 讲X的 phrasing for genuine topic-label content',
    out3.kind === 'results' && /讲生态环境的/.test(out3.hits[0]?.reason || ''),
    out3.kind === 'results' ? out3.hits[0]?.reason : '',
  )
}

// ------------------------------------------------------------------------
console.log('\n-- 10. Display layer shows topic-label leaf, not the full path --')

const groupCardSource = read('app/src/concierge/ConciergeGroupCard.tsx')
assert('ConciergeGroupCard derives a topic leaf label (not the raw full path)', groupCardSource.includes('topicLeafLabel'))
const paperRowSource = read('app/src/concierge/ConciergePaperRow.tsx')
assert('ConciergePaperRow builds topic chips from matched groups', paperRowSource.includes('buildTopicChips'))

// ------------------------------------------------------------------------
console.log('\n-- 11. Restart cut ⑤ — honest degrade: weak/noise floor, three-state notice --')

// A real bank is large enough that a garbled query's isolated 2-char CJK
// bigrams will coincidentally substring-match SOME field of SOME group —
// this pool mirrors that shape (real-DB browser QA found 3 false "hits" for
// "zzxqwqxyz 不存在的题目 12345" before this cut). Each noise group matches
// on exactly one incidental bigram, nothing else — the shape that must be
// dropped as noise, not surfaced as "可能相关".
function noiseGroup(id, summary, overrides = {}) {
  return {
    ...sampleQuestionGroups[0],
    id,
    tags: [],
    topicLabels: [],
    title: 'Reading A',
    summary,
    groupType: 'reading',
    ...overrides,
  }
}
const gibberishNoisePool = [
  noiseGroup('restart5-noise-1', '文章讨论了某项技术是否真实存在的问题。'),
  noiseGroup('restart5-noise-2', '介绍了一道有趣的数学题目和解法。'),
  noiseGroup('restart5-noise-3', '短文围绕作者童年一件小事展开，与其余关键词均无关。'),
]

{
  const gibberishHits = rankByKeywords(gibberishNoisePool, 'zzxqwqxyz 不存在的题目 12345')
  assertEqual(
    'gibberish query against realistic noise pool drops isolated-bigram coincidences (rankByKeywords)',
    gibberishHits.length,
    0,
  )

  const gibberishOutcome = await runConciergeSearch({
    intent: 'zzxqwqxyz 不存在的题目 12345',
    apiKey: '',
    questionGroups: gibberishNoisePool,
  })
  assertEqual('gibberish query outcome kind (empty results, not error)', gibberishOutcome.kind, 'results')
  // This is the exact shape ConciergeDesk.tsx's isVacuumResultsState checks
  // (kind === 'results' && hits.length === 0) to decide whether to render
  // starter chips (CR-5 SW-1: verify-concierge-desk.mjs Test 12 pins that
  // predicate's source text directly) — asserting it here ties the search
  // layer's contract to what the UI actually keys off, so this assertion
  // cannot silently drift back to fake-green if the desk's gate changes.
  assertEqual(
    'gibberish query reaches the true vacuum state (kind=results, hits=[]) — the exact shape isVacuumResultsState renders chips for',
    gibberishOutcome.kind === 'results' ? gibberishOutcome.hits.length : -1,
    0,
  )
}

{
  // A vague-but-real Chinese query ("随便 教学反思") is NOT gibberish — one
  // of its runs ("教学", a real 2-character word) is common enough in this
  // pool (DF >= DF_NOISE_THRESHOLD, see the pool below) to read as a real
  // content word, so the hit must still surface — but honestly labelled
  // weak (no topic/section/place signal backs it, only a general-field
  // word match) rather than silently treated as a confident match. This is
  // the acceptance-bullet "「随便找找看」类泛词→弱语气标识" case: distinct
  // from the pure-gibberish case above because "教学" is corpus-common, not
  // an isolated single-occurrence bigram coincidence.
  function dfPoolGroup(id, summary) {
    return {
      ...sampleQuestionGroups[0],
      id,
      tags: [],
      topicLabels: [],
      title: 'Reading',
      summary,
      groupType: 'reading',
    }
  }
  const dfRealisticPool = [
    dfPoolGroup('restart5-df-target', '本文围绕一位教师调整教学方式后学生反馈变化展开，随笔记录了教学反思。'),
    dfPoolGroup('restart5-df-1', '一篇关于课堂教学评价改革的说明文。'),
    dfPoolGroup('restart5-df-2', '介绍某校教学楼改造项目的应用文通知。'),
    dfPoolGroup('restart5-df-3', '记叙一名支教老师的教学经历与感悟。'),
  ]
  const vagueHits = rankByKeywords(dfRealisticPool, '随便 教学反思')
  // "教学" is DF-common across this whole pool (every group mentions
  // teaching), so a real teacher's vague query surfaces every group that
  // shares the word — the specific target (which also matches 反思/学反)
  // ranks first, but a broad common word legitimately fanning out to
  // several weak cards is the intended honest-degrade behavior, not a bug.
  assert(
    'vague generic query still surfaces its phrase-match hit, ranked first',
    vagueHits.length >= 1 && vagueHits[0]?.group.id === 'restart5-df-target',
    JSON.stringify(vagueHits.map((h) => h.group.id)),
  )
  assert(
    'every surfaced hit for the vague generic query is flagged weak (no topic/section/place signal anywhere in this pool)',
    vagueHits.every((h) => h.weak === true),
    JSON.stringify(vagueHits.map((h) => [h.group.id, h.weak])),
  )
  assert(
    'weak hit reason uses "可能相关" phrasing, never "命中"/"匹配关键词"',
    /可能相关/.test(vagueHits[0]?.reason || '') && !/匹配关键词|命中/.test(vagueHits[0]?.reason || ''),
    vagueHits[0]?.reason,
  )

  const vagueOutcome = await runConciergeSearch({
    intent: '随便 教学反思',
    apiKey: '',
    questionGroups: dfRealisticPool,
  })
  assertEqual('vague query outcome kind', vagueOutcome.kind, 'results')
  assert(
    'vague query outcome is marked allWeak',
    vagueOutcome.kind === 'results' && vagueOutcome.source === 'fallback' && vagueOutcome.allWeak === true,
    JSON.stringify(vagueOutcome),
  )
  assertEqual(
    'pickResultsNoticeLine renders the honest "主题相近" notice for an allWeak outcome',
    vagueOutcome.kind === 'results' && vagueOutcome.source === 'fallback'
      ? pickResultsNoticeLine(vagueOutcome.allWeak, vagueOutcome.assistantMessage)
      : '',
    '没有精确匹配，以下是主题相近的题组。',
  )
}

// ------------------------------------------------------------------------
console.log('\n-- 11b. Restart cut ⑤ CR-5 MF-1 fix: unspaced Chinese content-word queries are NOT noise --')

{
  // CR-5 measured real bug: "找篇科技文" / "讲科技的文章" / "科技文章"
  // (unspaced — the most natural real teacher input shape) all dropped to
  // ZERO hits under the V1 "whole-run token" noise floor, because "科技"
  // carved out of an unbroken run is structurally identical to a
  // coincidental bigram carved out of gibberish — neither is ever a
  // "whole-run" token. DF (measured against a pool where "科技" is
  // corpus-common) fixes this: unlike the earlier "随便 教学反思" test
  // (single matched word, DF-driven), this pool exercises the exact
  // CR-5-cited real-world query shapes end to end, including the
  // `runConciergeSearch` no-API-key path.
  function techPoolGroup(id, overrides = {}) {
    return {
      ...sampleQuestionGroups[0],
      id,
      tags: [],
      topicLabels: [],
      groupType: 'reading',
      ...overrides,
    }
  }
  const techPool = [
    techPoolGroup('restart5-tech-target', {
      title: '2024 · B 篇',
      summary: '本文是一篇科技说明文，介绍人工智能在教育领域的最新科技应用与文章讨论的伦理争议。',
    }),
    techPoolGroup('restart5-tech-2', { title: 'Reading', summary: '一家科技公司发布新的智能设备，科技媒体广泛报道。' }),
    techPoolGroup('restart5-tech-3', { title: 'Reading', summary: '科技发展如何改变了人们的日常科技生活方式。' }),
    techPoolGroup('restart5-tech-noise', { title: 'Reading', summary: '本文围绕一次家庭旅行展开，与科技话题完全无关，但意外存在一个巧合词。' }),
  ]
  for (const q of ['找篇科技文', '讲科技的文章', '科技文章']) {
    const out = await runConciergeSearch({ intent: q, apiKey: '', questionGroups: techPool })
    assertEqual(`"${q}" outcome kind`, out.kind, 'results')
    assert(
      `"${q}" (unspaced Chinese content word) resolves to >= 1 hit, not a false vacuum state`,
      out.kind === 'results' && out.hits.length >= 1,
      out.kind === 'results' ? JSON.stringify(out.hits.map((h) => h.group.id)) : '',
    )
    assert(
      `"${q}" surfaces the real 科技 target group specifically`,
      out.kind === 'results' && out.hits.some((h) => h.group.id === 'restart5-tech-target'),
      out.kind === 'results' ? JSON.stringify(out.hits.map((h) => h.group.id)) : '',
    )
  }
}

{
  // Gate ②: the exact CR-5 gibberish redline query must STILL resolve to
  // the true vacuum state against a DF-realistic pool that also contains a
  // legitimate low-DF real word ("科技") elsewhere — proving the fix did not
  // just raise DF's absolute bar so high that gibberish sneaks through a
  // multiplicity loophole. "不存在的题目" only ever contributes ONE run's
  // worth of matched tokens to any single candidate (see run-id grouping in
  // `rankKeywordCandidates`), so it cannot manufacture multiplicity either.
  function techPoolGroup(id, overrides = {}) {
    return {
      ...sampleQuestionGroups[0],
      id,
      tags: [],
      topicLabels: [],
      groupType: 'reading',
      ...overrides,
    }
  }
  const techPool = [
    techPoolGroup('restart5-tech-target', { title: '2024 · B 篇', summary: '本文是一篇科技说明文，介绍人工智能在教育领域的科技应用。' }),
    techPoolGroup('restart5-gibberish-noise-1', { title: 'Reading', summary: '文章讨论了某项技术是否真实存在的问题。' }),
    techPoolGroup('restart5-gibberish-noise-2', { title: 'Reading', summary: '介绍了一道有趣的数学题目和解法。' }),
  ]
  const out = await runConciergeSearch({
    intent: 'zzxqwqxyz 不存在的题目 12345',
    apiKey: '',
    questionGroups: techPool,
  })
  assertEqual('CR-5 gibberish redline outcome kind', out.kind, 'results')
  assertEqual(
    'CR-5 gibberish redline still resolves to the true vacuum state even alongside a DF-legitimate 科技 group',
    out.kind === 'results' ? out.hits.length : -1,
    0,
  )
}

{
  // pickResultsNoticeLine non-regression: a confident (non-weak) fallback
  // result must keep showing its ordinary assistantMessage, not the weak
  // notice.
  assertEqual(
    'pickResultsNoticeLine passes through the ordinary message when allWeak is false',
    pickResultsNoticeLine(false, '已按本地题库精确信息匹配。'),
    '已按本地题库精确信息匹配。',
  )
}

// ------------------------------------------------------------------------
console.log('\n-- 12. Restart cut ⑤ redline: cut ① acceptance queries must stay non-weak --')

{
  // Every query cut ① locked down as a confident local match must still
  // resolve non-weak after the noise-floor/weak-tagging change — these all
  // carry real topic-label / 篇位 / 地区+年份 signal, not incidental
  // general-tier noise.
  const ecoGroup = {
    ...sampleQuestionGroups[0],
    id: 'restart5-redline-eco',
    tags: [],
    title: '2026 浙江卷 阅读 C 生态修复',
    section: '阅读理解 C',
    year: 2026,
    region: '浙江',
    groupType: 'reading',
    topicLabels: [
      { label: '人与自然-自然生态-生态环境', theme: '人与自然', themeGroup: '自然生态', subtopic: '生态环境' },
    ],
  }
  const ecoHits = rankByKeywords([ecoGroup], '生态主题 C 篇')
  assert('redline "生态主题 C 篇" (topic-label hit) is not weak', ecoHits[0]?.weak !== true, JSON.stringify(ecoHits[0]))

  // Topic label leaf is "环境保护" (a real gaokao topic label, and a PREFIX
  // match for the query's "环境保护" token — unlike "生态环境", which is a
  // suffix match and correctly does not clear the topic-tier prefix rule;
  // see cut ①'s topicSegmentMatchesToken doc comment).
  const envGroup = {
    ...sampleQuestionGroups[0],
    id: 'restart5-redline-env',
    tags: [],
    title: 'Reading D',
    section: '第二部分 阅读 / 第一节 阅读理解',
    groupType: 'reading',
    topicLabels: [
      { label: '人与自然-环境问题-环境保护', theme: '人与自然', themeGroup: '环境问题', subtopic: '环境保护' },
    ],
  }
  const envOutcome = await runConciergeSearch({
    intent: '找一篇讲环境保护的阅读，中等难度，最好是近三年的',
    apiKey: '',
    questionGroups: [envGroup],
  })
  assert(
    'redline natural-language 环保阅读 query resolves non-weak',
    envOutcome.kind === 'results' &&
      envOutcome.hits.length > 0 &&
      envOutcome.hits.every((h) => h.weak !== true),
    JSON.stringify(envOutcome),
  )

  const zjGroup = {
    ...sampleQuestionGroups[0],
    id: 'restart5-redline-zj',
    tags: [],
    groupType: 'cloze',
    region: '浙江',
    year: 2025,
    section: '完形填空',
  }
  const zjOutcome = await runConciergeSearch({ intent: '2025 浙江卷', apiKey: '', questionGroups: [zjGroup] })
  assert(
    'redline "2025 浙江卷" (region+year dimension hit) resolves non-weak',
    zjOutcome.kind === 'results' && zjOutcome.hits.every((h) => h.weak !== true),
    JSON.stringify(zjOutcome),
  )

  const scGroup = {
    ...sampleQuestionGroups[0],
    id: 'restart5-redline-sc',
    tags: [],
    groupType: 'seven_choices',
    region: '浙江',
    year: 2025,
    section: '七选五',
  }
  const scOutcome = await runConciergeSearch({ intent: '七选五', apiKey: '', questionGroups: [scGroup] })
  assert(
    'redline "七选五" (groupType dimension hit) resolves non-weak',
    scOutcome.kind === 'results' && scOutcome.hits.every((h) => h.weak !== true),
    JSON.stringify(scOutcome),
  )

  const readingCHits = rankByKeywords(sampleQuestionGroups, 'reading C')
  assert(
    'redline plain "reading C" (section-letter hit) resolves non-weak',
    readingCHits.length > 0 && readingCHits.every((h) => h.weak !== true),
    JSON.stringify(readingCHits.map((h) => h.weak)),
  )
}

// ------------------------------------------------------------------------
console.log('\n-- 13. CR-5 SW-2: weak reasons never expose meaningless carve fragments --')

{
  // "议论文" is made DF-common across this small pool (3 groups all mention
  // it — a real, generic essay-type word) so the target candidate clears
  // the noise floor via DF, not via multiplicity. Its summary ALSO contains
  // "存在的问题", which the query's second run ("不存在的问题") carves into
  // overlapping bigram fragments ("存在"/"在的"/"的问"/"问题") that
  // independently match — but the run-grouping in `pickDisplayTokens`
  // collapses those to their run's single longest token, so a fragment like
  // "在的"/"的问" must never leak into the visible reason (CR-5's repro:
  // "可能相关：的完、完形" / "可能相关：议论、论文、阅读"). The overall
  // score must stay below the confidence floor so this exercises the WEAK
  // path specifically, not the confident path.
  function essayPoolGroup(id, summary) {
    return { ...sampleQuestionGroups[0], id, tags: [], topicLabels: [], title: 'Reading', summary, groupType: 'reading' }
  }
  const essayPool = [
    essayPoolGroup('restart5-sw2-target', '这是一篇议论文，某处提到政策存在的疑虑，未展开更多细节。'),
    essayPoolGroup('restart5-sw2-df-1', '一篇关于教育改革的议论文写作范例。'),
    essayPoolGroup('restart5-sw2-df-2', '这篇议论文分析了城市化进程的利弊。'),
  ]
  const hits = rankByKeywords(essayPool, '议论文 不存在的问题')
  const target = hits.find((h) => h.group.id === 'restart5-sw2-target')
  assert('SW-2 fragment-pollution fixture surfaces the target hit', !!target, JSON.stringify(hits.map((h) => h.group.id)))
  assert('SW-2 target hit is weak (below confidence floor)', target?.weak === true, JSON.stringify(target))
  const reason = target?.reason || ''
  assert(
    'weak reason does not contain the meaningless overlapping-bigram fragment "在的"',
    !reason.includes('在的'),
    reason,
  )
  assert(
    'weak reason does not contain the meaningless overlapping-bigram fragment "的问"',
    !reason.includes('的问'),
    reason,
  )
  assert('weak reason still reads as honest "可能相关" phrasing', reason.startsWith('可能相关'), reason)
}

console.log(`\nRestart cut ① local-search-intent verify: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
