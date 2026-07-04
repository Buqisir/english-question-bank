#!/usr/bin/env node
/**
 * Cut ai-mode-filter-chips verification: structured chip filters for the
 * AI 取题台 (app/src/concierge/filters.ts).
 *
 * Covers plan.md C8's four required assertions:
 *   1. buildFilterOptions: four-dimension option values, fixed business
 *      order for groupType/sourceType, year descending, region by count
 *      descending, each with correct counts.
 *   2. applyConciergeFilters: single-dimension filter, multi-dimension AND,
 *      empty filters returns the full corpus unchanged.
 *   3. Filtering to an empty set returns `[]` — no throw, no silent
 *      fallback to the full corpus (chips are a hard condition, unlike the
 *      search pipeline's own fallback semantics).
 *   4. Composition with buildDefaultFeed: filtered groups feed into
 *      buildDefaultFeed and only matching papers appear, sort order
 *      unchanged (year DESC + paperName tiebreak, per defaultFeed.ts).
 */

import {
  buildFilterOptions,
  applyConciergeFilters,
  buildFacetedFilterOptions,
} from '../app/src/concierge/filters.ts'
import { buildDefaultFeed } from '../app/src/concierge/defaultFeed.ts'

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

// Fixture roughly matching the real distribution named in the task brief:
// 5 groupTypes, years 2020-2026, 9 regions, 2 sourceTypes.
const fixture = [
  makeGroup({ id: 'g1', groupType: 'reading', year: 2026, region: '浙江', sourceType: 'real_exam' }),
  makeGroup({ id: 'g2', groupType: 'reading', year: 2025, region: '浙江', sourceType: 'real_exam' }),
  makeGroup({ id: 'g3', groupType: 'seven_choices', year: 2025, region: '全国新课标Ⅰ', sourceType: 'real_exam' }),
  makeGroup({ id: 'g4', groupType: 'cloze', year: 2024, region: '全国新课标Ⅱ', sourceType: 'mock_exam' }),
  makeGroup({ id: 'g5', groupType: 'grammar_cloze', year: 2023, region: '重庆市巴蜀中学', sourceType: 'mock_exam' }),
  makeGroup({ id: 'g6', groupType: 'writing', year: 2022, region: '浙江宁波十校', sourceType: 'mock_exam' }),
  makeGroup({ id: 'g7', groupType: 'reading', year: 2021, region: '浙江金丽衢十二校', sourceType: 'real_exam' }),
  makeGroup({ id: 'g8', groupType: 'reading', year: 2020, region: '全国甲卷', sourceType: 'real_exam' }),
  makeGroup({ id: 'g9', groupType: 'reading', year: 2020, region: '浙江', sourceType: 'real_exam' }),
]

// ------------------------------------------------------------------ Test 1
console.log('\nTest 1: buildFilterOptions — four dimensions, order, counts')
{
  const options = buildFilterOptions(fixture)

  assert(
    'groupType fixed business order: reading/seven_choices/cloze/grammar_cloze/writing',
    options.groupType.map((o) => o.value).join(',') ===
      'reading,seven_choices,cloze,grammar_cloze,writing',
    options.groupType.map((o) => o.value).join(','),
  )
  const readingOpt = options.groupType.find((o) => o.value === 'reading')
  assert('reading count is 5 (g1,g2,g7,g8,g9)', readingOpt?.count === 5, JSON.stringify(readingOpt))
  assert(
    'groupType labels use domain groupTypeLabel (阅读理解, not raw value)',
    readingOpt?.label === '阅读理解',
    JSON.stringify(readingOpt),
  )

  assert(
    'year sorted descending',
    options.year.map((o) => o.value).join(',') === '2026,2025,2024,2023,2022,2021,2020',
    options.year.map((o) => o.value).join(','),
  )
  const year2020 = options.year.find((o) => o.value === '2020')
  assert('year 2020 count is 2', year2020?.count === 2, JSON.stringify(year2020))

  assert(
    'region sorted by count descending (浙江=3 first)',
    options.region[0].value === '浙江' && options.region[0].count === 3,
    JSON.stringify(options.region[0]),
  )
  assert('region has 7 distinct values in this fixture', options.region.length === 7, String(options.region.length))

  assert(
    'sourceType fixed order: real_exam then mock_exam',
    options.sourceType.map((o) => o.value).join(',') === 'real_exam,mock_exam',
    options.sourceType.map((o) => o.value).join(','),
  )
  const realExamOpt = options.sourceType.find((o) => o.value === 'real_exam')
  assert('real_exam count is 6 (g1,g2,g3,g7,g8,g9)', realExamOpt?.count === 6, JSON.stringify(realExamOpt))
  assert('sourceType label uses domain sourceTypeLabel (真题)', realExamOpt?.label === '真题', JSON.stringify(realExamOpt))
}

// ------------------------------------------------------------------ Test 2
console.log('\nTest 2: applyConciergeFilters — single-dimension, multi-dimension AND, empty filters')
{
  const emptyFiltered = applyConciergeFilters(fixture, {})
  assert('empty filters returns full corpus (same length)', emptyFiltered.length === fixture.length, String(emptyFiltered.length))
  assert('empty filters returns a new array (not the same reference)', emptyFiltered !== fixture, '')

  const byGroupType = applyConciergeFilters(fixture, { groupType: 'reading' })
  assert('single-dimension groupType filter narrows to 5 reading groups', byGroupType.length === 5, String(byGroupType.length))

  const byRegion = applyConciergeFilters(fixture, { region: '浙江' })
  assert('single-dimension region filter narrows to 3 groups', byRegion.length === 3, String(byRegion.length))

  const andFiltered = applyConciergeFilters(fixture, { groupType: 'reading', region: '浙江' })
  assert(
    'multi-dimension AND narrows to reading AND 浙江 (3 groups: g1,g2,g9)',
    andFiltered.length === 3 && andFiltered.every((g) => g.groupType === 'reading' && g.region === '浙江'),
    JSON.stringify(andFiltered.map((g) => g.id)),
  )

  const fourDimAnd = applyConciergeFilters(fixture, {
    groupType: 'reading',
    year: 2020,
    region: '浙江',
    sourceType: 'real_exam',
  })
  assert(
    'all four dimensions AND together narrows to exactly g9',
    fourDimAnd.length === 1 && fourDimAnd[0].id === 'g9',
    JSON.stringify(fourDimAnd.map((g) => g.id)),
  )
}

// ------------------------------------------------------------------ Test 3
console.log('\nTest 3: filtering to an empty set returns [] — no throw, no fallback to full corpus')
{
  const nothingMatches = applyConciergeFilters(fixture, { groupType: 'reading', year: 1999 })
  assert(
    'impossible AND combination returns an empty array',
    Array.isArray(nothingMatches) && nothingMatches.length === 0,
    JSON.stringify(nothingMatches),
  )
  assert('does not fall back to the full corpus', nothingMatches.length !== fixture.length, '')

  let threw = false
  try {
    applyConciergeFilters([], { groupType: 'reading' })
  } catch {
    threw = true
  }
  assert('filtering an empty corpus does not throw', !threw, '')
}

// ------------------------------------------------------------------ Test 4
console.log('\nTest 4: composition with buildDefaultFeed — filtered feed only contains matching papers, sort order unchanged')
{
  const filtered = applyConciergeFilters(fixture, { groupType: 'reading' })
  const feed = buildDefaultFeed(filtered)
  assert(
    'every feed row is built only from reading groups',
    feed.every((paper) => paper.groupTypes.every((gt) => gt === 'reading')),
    JSON.stringify(feed.map((p) => p.groupTypes)),
  )
  const years = feed.map((p) => p.year)
  const sortedDesc = [...years].sort((a, b) => (b ?? -Infinity) - (a ?? -Infinity))
  assert('feed remains sorted year DESC after filtering', years.join(',') === sortedDesc.join(','), years.join(','))

  const emptyFeed = buildDefaultFeed(applyConciergeFilters(fixture, { groupType: 'writing', region: '浙江' }))
  assert(
    'filtering to zero groups produces an empty feed (not an error, not the full feed)',
    Array.isArray(emptyFeed) && emptyFeed.length === 0,
    JSON.stringify(emptyFeed),
  )
}

// ------------------------------------------------------------------ Test 5
console.log('\nTest 5: buildFacetedFilterOptions — counts narrow by OTHER dimensions, option universe stays full-corpus')
{
  const full = buildFilterOptions(fixture)
  const faceted = buildFacetedFilterOptions(fixture, { groupType: 'reading' })

  // Option universe never shrinks or reorders under an active filter.
  for (const dim of ['groupType', 'year', 'region', 'sourceType']) {
    assert(
      `${dim} option universe identical to full corpus (values + order)`,
      faceted[dim].map((o) => o.value).join(',') === full[dim].map((o) => o.value).join(','),
      faceted[dim].map((o) => o.value).join(','),
    )
  }

  // year counts narrow to the reading-only distribution (g1,g2,g7,g8,g9).
  const yearCounts = Object.fromEntries(faceted.year.map((o) => [o.value, o.count]))
  assert(
    'year counts narrow under groupType=reading (2026:1, 2025:1, 2021:1, 2020:2)',
    yearCounts['2026'] === 1 && yearCounts['2025'] === 1 && yearCounts['2021'] === 1 && yearCounts['2020'] === 2,
    JSON.stringify(yearCounts),
  )
  assert(
    'years with no reading groups stay listed with count 0 (2024, 2023, 2022)',
    yearCounts['2024'] === 0 && yearCounts['2023'] === 0 && yearCounts['2022'] === 0,
    JSON.stringify(yearCounts),
  )

  // A dimension is never narrowed by its OWN selection: groupType counts
  // stay full-corpus (no other filter is active), so reading=5 AND the
  // unselected writing=1 remain comparable.
  const gtCounts = Object.fromEntries(faceted.groupType.map((o) => [o.value, o.count]))
  assert(
    'own dimension keeps full counts under only its own filter (reading:5, writing:1)',
    gtCounts['reading'] === 5 && gtCounts['writing'] === 1,
    JSON.stringify(gtCounts),
  )

  // sourceType narrows: all 5 reading groups are real_exam; mock_exam drops
  // to 0 but is still present.
  const stCounts = Object.fromEntries(faceted.sourceType.map((o) => [o.value, o.count]))
  assert(
    'sourceType narrows to real_exam:5, mock_exam kept at 0',
    stCounts['real_exam'] === 5 && stCounts['mock_exam'] === 0,
    JSON.stringify(stCounts),
  )

  // Two active dimensions: each dimension uses the OTHER active filters.
  const twoDim = buildFacetedFilterOptions(fixture, { groupType: 'reading', region: '浙江' })
  const twoDimYear = Object.fromEntries(twoDim.year.map((o) => [o.value, o.count]))
  assert(
    'year counts under reading∧浙江 (g1,g2,g9 → 2026:1, 2025:1, 2020:1)',
    twoDimYear['2026'] === 1 && twoDimYear['2025'] === 1 && twoDimYear['2020'] === 1 && twoDimYear['2024'] === 0,
    JSON.stringify(twoDimYear),
  )
  const twoDimGt = Object.fromEntries(twoDim.groupType.map((o) => [o.value, o.count]))
  assert(
    'groupType counts under reading∧浙江 use only region (浙江 has 3 reading, 0 others)',
    twoDimGt['reading'] === 3 && twoDimGt['writing'] === 0,
    JSON.stringify(twoDimGt),
  )

  // No active filters → identical counts to buildFilterOptions.
  const noFilters = buildFacetedFilterOptions(fixture, {})
  assert(
    'empty filters produce identical options to buildFilterOptions',
    JSON.stringify(noFilters) === JSON.stringify(full),
    '',
  )
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`)
process.exit(failed > 0 ? 1 : 0)
