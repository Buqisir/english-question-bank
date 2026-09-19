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
 *   4. submit() no longer clears intent after firing (P1 same-face fix — the
 *      query stays editable after a search). triggerSimilar is retired
 *      (similar-entrypoints E3 — 配相似 is now a plain deep-link).
 *
 * Source-level checks (regex over the .ts/.tsx source), consistent with the
 * existing concierge verify suite's style — no React runtime needed for the
 * component-contract assertions; buildDefaultFeed itself IS executed for
 * real since it's a pure function.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { buildDefaultFeed, buildRecentFeed, collectionDate } from '../app/src/concierge/defaultFeed.ts'

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

console.log('\nHome additions: date eligibility, ordering, cap and catalog preservation')
{
  const dated = Array.from({ length: 6 }, (_, i) => makeGroup({
    id: `dated-${i}`, paperName: `测试卷${i}`, canonicalPaperId: `paper-${i}`,
    canonicalPublishedAt: `2026-08-${20 + i} 12:00:00`, importedAt: '2099-01-01',
  }))
  const unavailable = [
    makeGroup({ id: 'undated', paperName: '无日期卷', importedAt: '' }),
    makeGroup({ id: 'invalid', paperName: '错误日期卷', importedAt: '2026-02-30' }),
    makeGroup({ id: 'fallback', paperName: '', importedAt: '2099-01-01' }),
  ]
  const corpus = [...unavailable, ...dated]
  const recent = buildRecentFeed(corpus)
  assert('default cap is four eligible papers in newest-first order', recent.map(paper => paper.paperName).join(',') === '测试卷5,测试卷4,测试卷3,测试卷2')
  assert('eligibility is applied before limiting and no fallback paper leaks', buildRecentFeed(corpus, 10).length === 6 && recent.every(paper => !paper.isFallback))
  assert('full catalog keeps undated, invalid-date and fallback materials', buildDefaultFeed(corpus).length === 9)
  assert('undated-only corpus has no new additions', buildRecentFeed(unavailable).length === 0)
  assert('empty corpus remains empty', buildRecentFeed([]).length === 0)
  assert('analysis and printable legacy data alone never advertise a complete new paper', buildRecentFeed([
    makeGroup({ importedAt: '2099-01-01', hasPaperSurfaceAnalysis: true, paperSurfaceHref: '?paperId=partial', canAddToDraftPaper: true }),
  ]).length === 0)
  assert('canonical identity keeps unknown-region and same-name distinct papers out of fallback/merged buckets', buildDefaultFeed([
    makeGroup({ id: 'a', canonicalPaperId: 'paper-a', region: '未标地区' }),
    makeGroup({ id: 'b', canonicalPaperId: 'paper-b', region: '未标地区' }),
  ]).every(paper => !paper.isFallback) && buildDefaultFeed([
    makeGroup({ id: 'a', canonicalPaperId: 'paper-a' }), makeGroup({ id: 'b', canonicalPaperId: 'paper-b' }),
  ]).length === 2)
  assert('valid leap day accepted; impossible day and malformed date rejected', collectionDate('2024-02-29')?.iso === '2024-02-29' && collectionDate('2026-02-29') === null && collectionDate('bad-date') === null)
  assert('collection label says 收录 and keeps source calendar day', collectionDate('2024-02-29T23:00:00-08:00')?.label === '2024年2月29日收录')
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
console.log('\nTest 5: ConciergeDesk renders the feed only on the browse surface (empty kind) / true-vacuum states')
{
  const desk = readSrc('app/src/concierge/ConciergeDesk.tsx')
  assert('imports buildDefaultFeed', /import\s*\{\s*buildDefaultFeed,\s*buildRecentFeed\s*\}\s*from\s*['"]\.\/defaultFeed\.ts['"]/.test(desk), '')
  const showFeedMatch = desk.match(/const showFeed\s*=\s*[\s\S]{0,200}/)?.[0] || ''
  assert('showFeed guards on !dataLoading', /!dataLoading/.test(showFeedMatch), showFeedMatch)
  assert(
    "showFeed empty-kind branch is state.kind === 'empty' (home date-stream + browse archive)",
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
console.log('\nTest 6: 4-paper home additions cap + full catalog entry')
{
  const desk = readSrc('app/src/concierge/ConciergeDesk.tsx')
  assert('home additions cap is 4', /const DEFAULT_FEED_PAGE_SIZE\s*=\s*4/.test(desk), '')
  // CR round-2 M1 rewrite: the collapsed feed no longer slices raw papers —
  // it takes whole year groups until the cumulative count reaches the page
  // size (see Test 24), so the old slice assertion is retired.
  // 首页是归来 (2026-09-15): the catalog count folds into the single browse
  // entry under the search; no second 「查看全部」 action beside the heading.
  assert('browse entry carries the catalog count', /浏览题库与筛选\s*·\s*\{catalogPaperCount\}\s*套卷/.test(desk), '')
  assert('no duplicate see-all action on home', !/查看全部\s*\{catalogPaperCount\}/.test(desk), '')
  assert('home recent feed is capped at DEFAULT_FEED_PAGE_SIZE via buildRecentFeed', /buildRecentFeed\(questionGroups,\s*DEFAULT_FEED_PAGE_SIZE\)/.test(desk), '')
}

// ------------------------------------------------------------------ Test 7
console.log('\nTest 7: home search has no redundant inventory/prompt line')
{
  const desk = readSrc('app/src/concierge/ConciergeDesk.tsx')
  assert(
    'redundant inventory line and its count-only derivation are removed',
    !/concierge-meta|catalogGroupCount|一句话描述你要的题/.test(desk),
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
  // similar-entrypoints (E3): 找类似/onSimilar/triggerSimilar retired — feed
  // rows no longer wire a similar-trigger callback at all (配相似 is a plain
  // deep-link owned by ConciergeGroupCard, see verify-paper-browse.mjs
  // items 47-48).
  assert(
    'feed block does not wire onSimilar (retired flow)',
    !/onSimilar=/.test(feedBlockMatch),
    '',
  )
  // 浏览态不是搜索结果——feed 行禁用「命中」措辞（QA 抓出的搜索腔）。
  assert('feed rows pass variant="feed"', /variant="feed"/.test(feedBlockMatch), '')
  const paperRow = readSrc('app/src/concierge/ConciergePaperRow.tsx')
  assert(
    'ConciergePaperRow renders the 全卷 badge for the feed variant (single count, no double-reporting)',
    /variant === 'feed'[\s\S]{0,80}\$\{paper\.hitCount\} 篇章/.test(paperRow),
    '',
  )
  assert(
    'retired grouptypes span stays retired (no second count element)',
    !/concierge-paper-grouptypes/.test(paperRow),
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
console.log('\nTest 11: submit keeps the query after firing (P1 same-face fix); triggerSimilar retired (similar-entrypoints E3)')
{
  const hook = readSrc('app/src/concierge/useConciergeDesk.ts')
  const submitMatch = hook.match(/const submit = useCallback[\s\S]*?\n  \)/)?.[0] || ''
  assert('submit() does not clear intent to empty string after firing', !/setIntent\(''\)/.test(submitMatch), submitMatch)
  assert('submit() sets intent to the resolved value (kept, not cleared)', /setIntent\(value\)/.test(submitMatch), submitMatch)

  // similar-entrypoints (E3): triggerSimilar's whole "fill intent with a
  // generated query" flow is retired — 配相似 is now a plain deep-link, no
  // search round-trip through this hook.
  assert('hook does not declare triggerSimilar (retired)', !/triggerSimilar/.test(hook), '')
}

// ------------------------------------------------------------------ Test 12
console.log('\nTest 12: eyebrow re-scoped off slate inside AI mode only (P3 same-face fix)')
{
  const css = readSrc('app/src/App.css')
  assert(
    '.app-shell.home-mode-ai .eyebrow rule exists',
    /\.app-shell\.home-mode-ai \.eyebrow\s*\{[^}]*color:\s*#6B6E68/.test(css),
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

// ------------------------------------------------------------------ Test 21
console.log('\nTest 21: home-editorial — row-first year column + retired groupType strip')
{
  const paperRow = readSrc('app/src/concierge/ConciergePaperRow.tsx')
  assert('ConciergePaperRow renders a concierge-paper-year column', /concierge-paper-year/.test(paperRow), '')
  assert(
    'groupType strip replaced by fixed "全卷 · N 篇章" (N = paper.hitCount)',
    /\$\{paper\.hitCount\} 篇章/.test(paperRow),
    '',
  )
  assert(
    '卷种标注 uses the Songti serif token (owner 2026-07-09 拍板)',
    /\.concierge-paper-sourcetype[\s\S]{0,200}background:\s*#E9ECE6/.test(readSrc('app/src/App.css')),
    '',
  )
}

// ------------------------------------------------------------------ Test 23
console.log('\nTest 23: home-editorial round 2 (方向 C) — feed rows drop the per-row year column (year group head carries it), search rows keep it')
{
  const paperRow = readSrc('app/src/concierge/ConciergePaperRow.tsx')
  assert(
    'year column conditionally rendered only for variant !== feed',
    /variant !== ['"]feed['"] && \([\s\S]{0,120}concierge-paper-year/.test(paperRow),
    '',
  )
  assert('article carries data-variant={variant} for CSS gating', /data-variant=\{variant\}/.test(paperRow), '')

  const css = readSrc('app/src/App.css')
  assert(
    "feed-variant row overrides grid-template-columns (year track dropped)",
    /\.concierge-paper-row\[data-variant='feed'\]\s+\.concierge-paper-row-head\s*\{[^}]*grid-template-columns/.test(css),
    '',
  )
}

// ------------------------------------------------------------------ Test 24
console.log('\nTest 24: home-editorial round 2 — year-grouped feed archive (组头「2026」+「N 套」, null-year → 其他 tail)')
{
  const desk = readSrc('app/src/concierge/ConciergeDesk.tsx')
  assert('groupFeedByYear helper defined', /function groupFeedByYear/.test(desk), '')
  assert(
    'null-year papers labelled 其他',
    /label:\s*year !== null \? String\(year\) : ['"]其他['"]/.test(desk),
    '',
  )
  // CR round-2 M1: year groups must be built from the FULL defaultFeed and
  // paginated by whole year groups — slicing papers before grouping made the
  // collapsed view lie about a year's 套数.
  assert(
    'year groups built from the full defaultFeed (not a sliced visibleFeed)',
    /useMemo\(\(\) => groupFeedByYear\(defaultFeed\), \[defaultFeed\]\)/.test(desk),
    '',
  )
  assert(
    'browse archive uses full year groups (no mid-year slice)',
    /feedByYear\.map\(\(yearGroup\)/.test(desk),
    '',
  )
  assert('sliced visibleFeed grouping is retired', !/groupFeedByYear\(visibleFeed\)/.test(desk), '')
  assert('home additions use a flat paper list, not date-group headings', /homeRecentFeed\.map\(\(paper\)/.test(desk) && !/groupFeedByDate/.test(desk), '')
  const row = readSrc('app/src/concierge/ConciergePaperRow.tsx')
  assert('home additions use real collection dates and a keyboard-operable title', /<time className="concierge-recent-date" dateTime=\{collected\.iso\}/.test(row) && /className="concierge-recent-title"[\s\S]{0,150}aria-expanded=\{expanded\}/.test(row), '')
  assert('feed renders concierge-feed-year-head with the group label', /concierge-feed-year-label[\s\S]{0,40}\{yearGroup\.label\}/.test(desk), '')
  assert('feed renders the "N 套" true count next to the year head', /concierge-feed-year-count[\s\S]{0,60}\{yearGroup\.papers\.length\}\s*套/.test(desk), '')
}

// ------------------------------------------------------------------ Test 25
console.log('\nTest 25: home-editorial round 2 — 命令行一行 (search + thinking toggle + filter toggle + inventory count) + 筛选默认收起')
{
  const desk = readSrc('app/src/concierge/ConciergeDesk.tsx')
  assert('concierge-command-bar wraps the intent bar', /concierge-command-bar/.test(desk), '')
  assert('browse chips include 全部 / 真题 / 模拟', /全部[\s\S]{0,400}真题[\s\S]{0,400}模拟/.test(desk), '')
  assert('browse year chips render the four most recent years', /browseRecentYears\.map\(\(year\)/.test(desk) && /browseYears\.slice\(0, 4\)/.test(desk), '')
  assert('browse older years collapse to a 更早 chip', /更早/.test(desk) && /selectBrowseOlder/.test(desk), '')
  assert('browse rows do not render a hover + add control', !/showHoverAdd|concierge-row-add/.test(desk), '')
  assert('full catalog count remains available for browse and recovery', /const catalogPaperCount = catalogFeed.length/.test(desk), '')
}

// ------------------------------------------------------------------ Test 22
console.log('\nTest 22: home-editorial — 卷面目录 replaces the 9-card grid, no green-tint/side-stripe hit highlight')
{
  const css = readSrc('app/src/App.css')
  assert(
    '.concierge-group-index is a style-less list (no inner card)',
    /\.concierge-group-index\s*\{/.test(css) &&
      !/\.concierge-group-index\s*\{[^}]*border:\s*1px solid/.test(css) &&
      !/\.concierge-group-index\s*\{[^}]*border-radius:\s*8px/.test(css) &&
      !/\.concierge-group-index\s*\{[^}]*box-shadow/.test(css),
    '',
  )
  assert(
    'section labels are eyebrows (12px muted, no bar)',
    /\.concierge-group-section-head\s*\{[^}]*padding:\s*12px 14px 4px 28px/.test(css) &&
      /\.concierge-group-section-head\s*\{[^}]*color:\s*#6B6E68/.test(css) &&
      !/\.concierge-group-section-head\s*\{[^}]*border-bottom/.test(css),
    '',
  )
  assert(
    'retired concierge-group-card-li.is-hit gradient/side-stripe rule is gone',
    !/concierge-group-card-li\.is-hit/.test(css),
    '',
  )
  const groupCard = readSrc('app/src/concierge/ConciergeGroupCard.tsx')
  assert('ConciergeGroupCard accepts a dimmed prop for non-hit rows (is-dim, no side-stripe)', /dimmed\?\s*:\s*boolean/.test(groupCard), '')
  assert('retired hover-reveal .concierge-group-row-actions cluster is gone', !/\.concierge-group-row-actions/.test(css), '')
  assert('passage row uses always-visible .concierge-group-row-trail', /\.concierge-group-row-trail\s*\{/.test(css), '')
}

// ------------------------------------------------------------------ Test 26
console.log('\nTest 26: home-blank — showListSurface invariant (硬契约: browseActive || anyFilterActive || state.kind !== \'empty\')')
{
  const desk = readSrc('app/src/concierge/ConciergeDesk.tsx')
  assert(
    'browseSurfaceActive = browseActive || hasActiveFilters',
    /const browseSurfaceActive = Boolean\(browseActive\) \|\| hasActiveFilters/.test(desk),
    '',
  )
  assert(
    "showListSurface = browseSurfaceActive || state.kind !== 'empty'",
    /const showListSurface = browseSurfaceActive \|\| state\.kind !== ['"]empty['"]/.test(desk),
    '',
  )
  assert(
    'section root carries data-surface reflecting showListSurface (blank vs list)',
    /data-surface=\{isBrowseScreen \? ['"]browse['"] : state\.kind === ['"]empty['"] \? ['"]home['"] : ['"]list['"]\}/.test(desk),
    '',
  )
}

// ------------------------------------------------------------------ Test 27
console.log('\nTest 27: home-blank — feed gate moves from bare state.kind===\'empty\' to browseSurfaceActive-gated (真空态 unaffected)')
{
  const desk = readSrc('app/src/concierge/ConciergeDesk.tsx')
  const showFeedMatch = desk.match(/const showFeed =\s*[\s\S]{0,220}/)?.[0] || ''
  assert(
    "showFeed's empty-state branch is state.kind === 'empty' (home always shows the date stream)",
    /state\.kind === ['"]empty['"]/.test(showFeedMatch) && !/browseSurfaceActive && state\.kind === ['"]empty['"]/.test(showFeedMatch),
    showFeedMatch,
  )
  assert(
    'true-vacuum branch (isVacuumResultsState) still shows the feed regardless of browse/filter state',
    /isVacuumResultsState\(state\)/.test(showFeedMatch),
    showFeedMatch,
  )
}

// ------------------------------------------------------------------ Test 28
console.log('\nTest 28: home-blank — pure-blank stage markup: no feed/chip DOM at all when !showListSurface (list surface is a whole conditionally-mounted block, not a CSS hide)')
{
  const desk = readSrc('app/src/concierge/ConciergeDesk.tsx')
  assert('search keeps its accessible name without the inventory caption', /自然语言搜索/.test(desk), '')
  // 首页是归来 (2026-09-15): the home region is the whole 备课桌; 最近上新 is one
  // of its sections and mounts only when a ready paper exists.
  assert('home desk has a named region', /role="region" aria-label=\{isBrowseScreen \? '题库浏览' : '备课桌'\}/.test(desk), '')
  assert('最近上新 section is gated and labelled without redundant sorting copy', /homeRecentFeed\.length > 0 && \(\s*<section className="home-section" aria-label="最近上新">\s*<h2 className="concierge-feed-label home-section-label">最近上新<\/h2>/.test(desk) && !/按入库时间排列/.test(desk), '')
  assert('home has a dedicated full-catalog browse/filter entry before browse chips', /isHomeScreen && onEnterBrowse[\s\S]{0,200}className="concierge-browse-entry"[\s\S]{0,180}onClick=\{handleEnterBrowse\}[\s\S]{0,220}浏览题库与筛选/.test(desk), '')
  assert('home sections: 接着做 / 最近上新 / 今天翻到 render from ConciergeHomeSections', /<HomeContinueSection[\s\S]{0,2400}<HomeDailyPassage/.test(desk), '')
  assert('list surface mounts for home feed or search', /\{\(showListSurface \|\| showFeed\) && \(\s*<div className="concierge-list-surface">/.test(desk), '')
  assert('browse chips live in concierge-browse-chips', /concierge-browse-chips/.test(desk), '')
}

// ------------------------------------------------------------------ Test 29
console.log('\nTest 29: home-blank — browseActive/onEnterBrowse/onExitBrowse prop threading')
{
  const desk = readSrc('app/src/concierge/ConciergeDesk.tsx')
  assert('ConciergeDeskProps declares browseActive?: boolean', /browseActive\?:\s*boolean/.test(desk), '')
  assert('ConciergeDeskProps declares onEnterBrowse?: () => void', /onEnterBrowse\?:\s*\(\) => void/.test(desk), '')
  assert('ConciergeDeskProps declares onExitBrowse?: () => void', /onExitBrowse\?:\s*\(\) => void/.test(desk), '')

  const app = readSrc('app/src/App.tsx')
  assert('App.tsx boot-reads view=browse into browseRouteActive (same pattern as its sibling routes)', /new URLSearchParams\(window\.location\.search\)\.get\(['"]view['"]\) === ['"]browse['"]/.test(app), '')
  assert('App.tsx popstate handler syncs browseRouteActive', /setBrowseRouteActive\(view === ['"]browse['"]\)/.test(app), '')
  assert('ConciergeDesk receives browseActive={browseRouteActive}', /browseActive=\{browseRouteActive\}/.test(app), '')
  assert('ConciergeDesk receives onEnterBrowse={enterBrowse}', /onEnterBrowse=\{enterBrowse\}/.test(app), '')
  assert('ConciergeDesk receives onExitBrowse={exitBrowse}', /onExitBrowse=\{exitBrowse\}/.test(app), '')
}

// ------------------------------------------------------------------ Test 30
console.log('\nTest 30: home-blank — AppTopbar hides the left brand block for the home list view only (detail/sub pages untouched)')
{
  const topbar = readSrc('app/src/components/AppTopbar.tsx')
  assert('AppTopbarProps declares hideBrand?: boolean', /hideBrand\?:\s*boolean/.test(topbar), '')
  assert('home-variant brand block is gated on !props.hideBrand', /variant === ['"]home['"] \? \(\s*!props\.hideBrand &&/.test(topbar), '')

  const app = readSrc('app/src/App.tsx')
  assert(
    "App.tsx passes hideBrand only for the list view (not detail, not admin)",
    /hideBrand=\{false\}/.test(app),
    '',
  )
}

// ------------------------------------------------------------------ Test 31
console.log('\nTest 31: home-blank — rotating placeholder examples all carry the "比如：" prefix, gated to the static blank stage only')
{
  const desk = readSrc('app/src/concierge/ConciergeDesk.tsx')
  const arrayMatch = desk.match(/const ROTATING_PLACEHOLDERS = \[([\s\S]*?)\] as const/)?.[1] || ''
  const entries = [...arrayMatch.matchAll(/'([^']*)'/g)].map((m) => m[1])
  assert('at least 2 rotating placeholder examples defined', entries.length >= 2, JSON.stringify(entries))
  assert(
    'every rotating placeholder starts with 比如：',
    entries.length > 0 && entries.every((line) => line.startsWith('比如：')),
    JSON.stringify(entries),
  )
  assert(
    'rotation effect gated on !showListSurface && !dataLoading && !inputFocused',
    /if \(showListSurface \|\| dataLoading \|\| inputFocused\) return/.test(desk),
    '',
  )
  assert(
    'rotation stops under prefers-reduced-motion',
    /window\.matchMedia\(['"]\(prefers-reduced-motion: reduce\)['"]\)\.matches\) return/.test(desk),
    '',
  )
  assert('dataLoading placeholder text "正在连接本地题库…" preserved', /if \(dataLoading\) return ['"]正在连接本地题库…['"]/.test(desk), '')
}

// ------------------------------------------------------------------ Test 32
console.log('\nTest 32: Detail #362 — full-route open/back handlers reset the home sub-mode flags')
{
  const app = readSrc('app/src/App.tsx')
  // The MySpace / DraftPaper / PaperBrowse open+return family used to leave
  // `adminRouteActive`/`browseRouteActive` stale: browse → 个人空间 → 返回找题
  // re-rendered the browse feed on a plain-home URL. The exhaustive siblings
  // (openVocabularyReview / openVocabularyDictationWorkbench) already reset
  // both flags; these six handlers must do the same so the URL stays the
  // source of truth for the home sub-mode.
  const handlerBody = (name) =>
    app.match(new RegExp(`const ${name} = useCallback\\([\\s\\S]*?\\n  \\}, \\[[^\\]]*\\]\\)`))?.[0] || ''
  for (const name of [
    'openMySpace',
    'openDraftPaperWorkbench',
    'openPaperBrowse',
    'mySpaceOnBackToWorkbench',
    'draftPaperOnBackToWorkbench',
    'paperBrowseOnBackToWorkbench',
  ]) {
    const body = handlerBody(name)
    assert(`${name} is found in App.tsx`, body.length > 0, '')
    assert(`${name} clears adminRouteActive`, /setAdminRouteActive\(false\)/.test(body), '')
    assert(`${name} clears browseRouteActive`, /setBrowseRouteActive\(false\)/.test(body), '')
  }
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`)
process.exit(failed > 0 ? 1 : 0)
