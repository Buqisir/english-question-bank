#!/usr/bin/env node
/**
 * Cut ⑥ (home-default-feed) verification: AI 取题台 default browse feed +
 * two same-face behavior fixes.
 *
 * Covers:
 *   1. buildDefaultFeed: sorts year DESC (ties by paperName), groups by the
 *      same paper-bucket rules as search results, handles an empty corpus,
 *      and does not filter by sourceType (real_exam + mock_exam both show).
 *   2. ConciergeDesk source contract: feed renders only for state 'empty'
 *      and the true vacuum ('results' with zero hits); loading / results /
 *      clarification / error never render it. 8-paper default cap + "显示
 *      全部 N 套卷" expander. Empty-corpus guidance text.
 *   3. STARTER_CHIPS retired (cut ai-mode-filter-chips, C7) — the structured
 *      filter row replaces the three hardcoded example chips; submit()'s
 *      intentOverride parameter stays available in the code path.
 *   4. submit() / triggerSimilar() no longer clear intent after firing
 *      (P1 same-face fix — the query stays editable after a search).
 *
 * Source-level checks (regex over the .ts/.tsx source), consistent with the
 * existing concierge verify suite's style — no React runtime needed for the
 * component-contract assertions; buildDefaultFeed itself IS executed for
 * real since it's a pure function.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { buildDefaultFeed } from '../app/src/concierge/defaultFeed.ts'

const here = path.dirname(new URL(import.meta.url).pathname)
const root = path.resolve(here, '..')

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

function readSrc(relPath) {
  return readFileSync(path.join(root, relPath), 'utf8')
}

function makeGroup(overrides) {
  return {
    id: 'g-default',
    title: '默认题组',
    source: '样例',
    sourceType: 'real_exam',
    year: 2024,
    region: '全国',
    paperName: '样例卷',
    section: '阅读理解 B',
    passageTitle: '样例文章',
    summary: '摘要',
    groupType: 'reading',
    questionCount: 4,
    difficulty: 'medium',
    tags: [],
    topicLabels: [],
    hit: '',
    answerPreview: '',
    defaultScore: 2.5,
    ...overrides,
  }
}

// ------------------------------------------------------------------ Test 1
console.log('\nTest 1: buildDefaultFeed — sort order (year DESC, paperName tiebreak)')
{
  const groups = [
    makeGroup({ id: 'g-2023', year: 2023, paperName: '早卷', region: '浙江' }),
    makeGroup({ id: 'g-2025-b', year: 2025, paperName: 'B 卷', region: '浙江' }),
    makeGroup({ id: 'g-2025-a', year: 2025, paperName: 'A 卷', region: '浙江' }),
    makeGroup({ id: 'g-2024', year: 2024, paperName: '中卷', region: '浙江' }),
  ]
  const feed = buildDefaultFeed(groups)
  assert('4 distinct papers produced', feed.length === 4, `got ${feed.length}`)
  assert('most recent year first', feed[0].year === 2025, `got ${feed[0].year}`)
  assert(
    'same-year ties broken by paperName (A before B)',
    feed[0].paperName === 'A 卷' && feed[1].paperName === 'B 卷',
    `got ${feed[0].paperName}, ${feed[1].paperName}`,
  )
  assert('years descend overall', feed.map((p) => p.year).join(',') === '2025,2025,2024,2023', feed.map((p) => p.year).join(','))
}

// ------------------------------------------------------------------ Test 2
console.log('\nTest 2: buildDefaultFeed — groups by same paper-bucket rules as search (reuse, no reinvention)')
{
  const groups = [
    makeGroup({ id: 'g-c', year: 2026, paperName: '联考', region: '浙江', section: '阅读理解 C', groupType: 'reading' }),
    makeGroup({ id: 'g-d', year: 2026, paperName: '联考', region: '浙江', section: '阅读理解 D', groupType: 'reading' }),
  ]
  const feed = buildDefaultFeed(groups)
  assert('two groups of the same paper collapse into one row', feed.length === 1, `got ${feed.length}`)
  assert('bucketed row carries both groups', feed[0].groups.length === 2, `got ${feed[0].groups.length}`)
  assert('hitCount reflects bucket size', feed[0].hitCount === 2, `got ${feed[0].hitCount}`)
}

// ------------------------------------------------------------------ Test 3
console.log('\nTest 3: buildDefaultFeed — empty corpus produces empty feed (no throw)')
{
  const feed = buildDefaultFeed([])
  assert('empty groups -> empty feed array', Array.isArray(feed) && feed.length === 0, `got ${JSON.stringify(feed)}`)
}

// ------------------------------------------------------------------ Test 4
console.log('\nTest 4: buildDefaultFeed — real_exam and mock_exam both included, no sourceType filter')
{
  const groups = [
    makeGroup({ id: 'g-real', year: 2025, paperName: '真题卷', sourceType: 'real_exam' }),
    makeGroup({ id: 'g-mock', year: 2025, paperName: '模拟卷', sourceType: 'mock_exam' }),
  ]
  const feed = buildDefaultFeed(groups)
  const sourceTypes = feed.map((p) => p.sourceType).sort()
  assert(
    'both real_exam and mock_exam papers present',
    sourceTypes.includes('real_exam') && sourceTypes.includes('mock_exam'),
    JSON.stringify(sourceTypes),
  )
}

// ------------------------------------------------------------------ Test 5
console.log('\nTest 5: ConciergeDesk renders the feed only for empty / true-vacuum states')
{
  const desk = readSrc('app/src/concierge/ConciergeDesk.tsx')
  assert('imports buildDefaultFeed', /import\s*\{\s*buildDefaultFeed\s*\}\s*from\s*['"]\.\/defaultFeed\.ts['"]/.test(desk), '')
  const showFeedMatch = desk.match(/const showFeed\s*=\s*[\s\S]{0,200}/)?.[0] || ''
  assert('showFeed guards on !dataLoading', /!dataLoading/.test(showFeedMatch), showFeedMatch)
  assert(
    "showFeed is true for state.kind === 'empty'",
    /state\.kind === ['"]empty['"]/.test(showFeedMatch),
    showFeedMatch,
  )
  assert(
    'showFeed reuses isVacuumResultsState (true vacuum: results + zero hits)',
    /isVacuumResultsState\(state\)/.test(showFeedMatch),
    showFeedMatch,
  )
  // The feed block itself must be gated on showFeed, not on a broader condition.
  assert('feed block gated on {showFeed &&', /\{showFeed\s*&&/.test(desk), '')
}

// ------------------------------------------------------------------ Test 6
console.log('\nTest 6: 8-paper default cap + "显示全部 N 套卷" expander')
{
  const desk = readSrc('app/src/concierge/ConciergeDesk.tsx')
  assert('DEFAULT_FEED_PAGE_SIZE constant is 8', /const DEFAULT_FEED_PAGE_SIZE\s*=\s*8/.test(desk), '')
  assert(
    'visibleFeed slices to the page size unless expanded',
    /feedExpanded\s*\?\s*defaultFeed\s*:\s*defaultFeed\.slice\(0,\s*DEFAULT_FEED_PAGE_SIZE\)/.test(desk),
    '',
  )
  assert('expander button text renders 显示全部 {feedPaperCount} 套卷', /显示全部\s*\{feedPaperCount\}\s*套卷/.test(desk), '')
  assert(
    'expander only shown when not already expanded and paper count exceeds the page size',
    /!feedExpanded\s*&&\s*feedPaperCount\s*>\s*DEFAULT_FEED_PAGE_SIZE/.test(desk),
    '',
  )
  assert('clicking expander sets feedExpanded true', /onClick=\{\(\)\s*=>\s*setFeedExpanded\(true\)\}/.test(desk), '')
}

// ------------------------------------------------------------------ Test 7
console.log('\nTest 7: feed intro line — AI-toned, states paper/group counts')
{
  const desk = readSrc('app/src/concierge/ConciergeDesk.tsx')
  assert(
    'intro line includes paper count, group count, and the browse-or-describe framing',
    /题库里现有\s*\{feedPaperCount\}\s*套卷\s*·\s*\{feedGroupCount\}\s*个篇章。可以直接翻，或用一句话描述你要的题。/.test(desk),
    '',
  )
}

// ------------------------------------------------------------------ Test 8
console.log('\nTest 8: real-empty-corpus guidance text (0 question groups, no new UI)')
{
  const desk = readSrc('app/src/concierge/ConciergeDesk.tsx')
  assert(
    'renders import-guidance copy when questionGroups.length === 0',
    /questionGroups\.length === 0[\s\S]{0,200}题库还没有题目/.test(desk),
    '',
  )
}

// ------------------------------------------------------------------ Test 9
console.log('\nTest 9: feed rows reuse ConciergePaperRow with the same wiring as search results (zero-change contract)')
{
  const desk = readSrc('app/src/concierge/ConciergeDesk.tsx')
  const feedBlockMatch = desk.match(/\{showFeed &&[\s\S]*$/)?.[0] || ''
  assert('feed block renders <ConciergePaperRow', /<ConciergePaperRow/.test(feedBlockMatch), '')
  assert('feed rows wire onTogglePaper={togglePaper}', /onTogglePaper=\{togglePaper\}/.test(feedBlockMatch), '')
  assert('feed rows wire onAdd={onAdd}', /onAdd=\{onAdd\}/.test(feedBlockMatch), '')
  assert(
    'feed rows wire onSimilar to triggerSimilar (same as search results)',
    /onSimilar=\{\(group\)\s*=>\s*\{\s*void triggerSimilar\(group\)\s*\}\}/.test(feedBlockMatch),
    '',
  )
  // 浏览态不是搜索结果——feed 行禁用「命中」措辞（QA 抓出的搜索腔）。
  assert('feed rows pass variant="feed"', /variant="feed"/.test(feedBlockMatch), '')
  const paperRow = readSrc('app/src/concierge/ConciergePaperRow.tsx')
  assert(
    'ConciergePaperRow renders a hit-free badge for the feed variant',
    /variant === 'feed'\s*\?\s*`\$\{paper\.hitCount\} 个篇章`/.test(paperRow),
    '',
  )
  assert(
    'search variant keeps 命中 badge wording (default unchanged)',
    /badgePrefix\(paper\.hitContext\.scope\)/.test(paperRow),
    '',
  )
}

// ------------------------------------------------------------------ Test 10
console.log('\nTest 10: STARTER_CHIPS retired (cut ai-mode-filter-chips, C7) — submit(intentOverride) path preserved for future callers')
{
  const desk = readSrc('app/src/concierge/ConciergeDesk.tsx')
  // Cut ai-mode-filter-chips C7: the three hardcoded example STARTER_CHIPS
  // (and their "fill + submit immediately" click handler) are removed — the
  // structured filter row (see verify-concierge-filters.mjs /
  // verify-concierge-desk.mjs Test 12) replaces them. `submit`'s
  // intentOverride parameter itself must still exist in the code path
  // (plan C7: "不许顺手拆 submit 的 intentOverride 参数") even though the
  // filter row does not call it.
  assert('STARTER_CHIPS constant declaration removed', !/const STARTER_CHIPS/.test(desk), '')
  assert('no concierge-starter-chip button wired to void submit(chip)', !/void submit\(chip\)/.test(desk), '')
  const hook = readSrc('app/src/concierge/useConciergeDesk.ts')
  assert(
    'submit(intentOverride?: string) signature preserved on the hook',
    /submit:\s*\(intentOverride\?:\s*string\)\s*=>\s*Promise<void>/.test(hook),
    '',
  )
}

// ------------------------------------------------------------------ Test 11
console.log('\nTest 11: submit / triggerSimilar keep the query after firing (P1 same-face fix)')
{
  const hook = readSrc('app/src/concierge/useConciergeDesk.ts')
  const submitMatch = hook.match(/const submit = useCallback[\s\S]*?\n  \)/)?.[0] || ''
  assert('submit() does not clear intent to empty string after firing', !/setIntent\(''\)/.test(submitMatch), submitMatch)
  assert('submit() sets intent to the resolved value (kept, not cleared)', /setIntent\(value\)/.test(submitMatch), submitMatch)

  const triggerMatch = hook.match(/const triggerSimilar = useCallback[\s\S]*?\n  \)/)?.[0] || ''
  assert(
    'triggerSimilar() fills intent with the generated similar-intent query (not empty)',
    /setIntent\(similarIntent\)/.test(triggerMatch) && !/setIntent\(''\)/.test(triggerMatch),
    triggerMatch,
  )
}

// ------------------------------------------------------------------ Test 12
console.log('\nTest 12: eyebrow re-scoped off slate inside AI mode only (P3 same-face fix)')
{
  const css = readSrc('app/src/App.css')
  assert(
    '.app-shell.home-mode-ai .eyebrow rule exists',
    /\.app-shell\.home-mode-ai \.eyebrow\s*\{[^}]*color:\s*#6B645C/.test(css),
    '',
  )
  // :root itself must stay untouched — the base .eyebrow rule still reads
  // the slate --muted token; only the AI-mode-scoped override changes.
  const baseEyebrowRule = css.match(/(?<!\.app-shell\.home-mode-ai )\.eyebrow\s*\{[^}]*\}/)?.[0] || ''
  assert('base .eyebrow rule (classic mode) still reads var(--muted)', /color:\s*var\(--muted\)/.test(baseEyebrowRule), baseEyebrowRule)
}

// ------------------------------------------------------------------ Test 13
console.log('\nTest 13: forbidden-scope guard — conciergeSearch.ts / aggregatePaperResults.ts untouched by this cut')
{
  const aggregate = readSrc('app/src/concierge/aggregatePaperResults.ts')
  // aggregatePaperResults must still accept ConciergeSearchHit[] and know
  // nothing about "default feed" — buildDefaultFeed calls it, not the other
  // way around. This guards against the temptation to special-case feed
  // logic inside the shared aggregator.
  assert(
    'aggregatePaperResults has no feed-specific branching',
    !/defaultFeed|DEFAULT_FEED/.test(aggregate),
    '',
  )
  assert(
    'aggregatePaperResults still takes ConciergeSearchHit[] as its only input',
    /export function aggregatePaperResults\(hits: ConciergeSearchHit\[\]\)/.test(aggregate),
    '',
  )
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`)
process.exit(failed > 0 ? 1 : 0)
