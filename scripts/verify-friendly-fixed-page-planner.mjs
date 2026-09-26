import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { applyPlannedGroupBreaks, fixedPageLayoutPolicy, planFixedPagePdf, planLongPaperPdf, renderExplicitFixedPagePdf } from '../server/draft-paper/fixedPagePdfPlanner.mjs'
import { ownsCompletePaperOpening } from '../shared/paper-canonical/listeningPresentation.mjs'

assert.deepEqual(fixedPageLayoutPolicy('friendly8', 0), { targetPages: 8, includeListening: false, omitCover: false })
assert.deepEqual(fixedPageLayoutPolicy('friendly8', 2), { targetPages: 8, includeListening: false, omitCover: false })
assert.equal(fixedPageLayoutPolicy('friendly8', 0, true).omitCover, false, 'excluding listening retains the formal opening')
assert.deepEqual(fixedPageLayoutPolicy('friendly10', 2), { targetPages: 10, includeListening: true, omitCover: false })
assert.throws(() => fixedPageLayoutPolicy('friendly10', 0), /完整的两个听力题组/)
assert.deepEqual(fixedPageLayoutPolicy('long10', 2), { targetPages: 10, includeListening: false, omitCover: false })
assert.deepEqual(fixedPageLayoutPolicy('long12', 2), { targetPages: 12, includeListening: true, omitCover: false })
assert.throws(() => fixedPageLayoutPolicy('long12', 0), /完整的两个听力题组/)

const source = '<html><head></head><body><section data-canonical-group-id="reading.long-multimodal-a"></section><section data-canonical-group-id="writing"></section></body></html>'
const planned = applyPlannedGroupBreaks(source, ['writing'])
assert.match(planned, /style data-pdf-planned-break/)
assert.match(planned, /data-canonical-group-id="writing" data-pdf-planned-break/)

let renders = 0
const render = async (html) => {
  renders += 1
  const broken = html.includes('data-canonical-group-id="writing" data-pdf-planned-break')
  return {
    pageCount: broken ? 8 : 7,
    pdfBytes: Buffer.from('%PDF-friendly'),
    paginatedHtml: '<html></html>',
    inspection: broken
      ? [{ id: 'reading.long-multimodal-a', pages: [1, 2] }, { id: 'writing', pages: [3, 4] }]
      : [{ id: 'reading.long-multimodal-a', pages: [1, 2] }, { id: 'writing', pages: [2, 3], fragments: [{ page: 2, height: 100, lineHeight: 16 }] }],
  }
}
const result = await planFixedPagePdf(source, { targetPages: 8, render })
assert.equal(result.pageCount, 8)
assert.deepEqual(result.plannedBreakGroupIds, ['writing'])
assert.equal(renders, 2)

await assert.rejects(
  () => planFixedPagePdf(source, { targetPages: 8, render: async () => ({ pageCount: 9, inspection: [] }) }),
  (error) => error.code === 'PAPER_FIXED_PAGE_IMPOSSIBLE' && /有界搜索未找到/.test(error.message),
)

const longPaper = await planLongPaperPdf(source, {
  targetPages: 12,
  render: async () => ({ pageCount: 11, inspection: [], pdfBytes: Buffer.from('%PDF-long') }),
})
assert.equal(longPaper.pageCount, 11, 'a long edition reports its real count, without padding to twelve')
assert.equal(longPaper.answerBoxHeightsMm, undefined, 'a fitting long paper retains normal writing space')
const longCover = '<html><head></head><body><header data-canonical-paper-opening></header><section data-canonical-group-id="application"></section></body></html>'
let longRenders = 0
const attachedLongPaper = await planLongPaperPdf(longCover, {
  targetPages: 12,
  render: async (candidate) => ({
    pageCount: candidate.includes('data-canonical-group-id="application" data-pdf-planned-break')
      ? 13 : ++longRenders === 1 ? 12 : 11,
    inspection: [{ id: 'application', applicationPresent: true,
      applicationPromptPage: 10, applicationAnswerPage: longRenders === 1 ? 11 : 10,
      pages: [10, 11] }],
  }),
})
assert.equal(attachedLongPaper.pageCount, 11)
assert.deepEqual(attachedLongPaper.coverGapsPt, [54, 72])
assert.equal(attachedLongPaper.searchedCandidates, 3, 'a failed same-group break advances to the next approved cover')
const movedApplication = await planLongPaperPdf(longCover, {
  targetPages: 12,
  render: async candidate => {
    const breakApplication = candidate.includes('data-canonical-group-id="application" data-pdf-planned-break')
    const tight = candidate.includes('margin-top:-25.5pt')
    return { pageCount: breakApplication && !tight ? 13 : 12,
      inspection: [{ id: 'application', applicationPresent: true,
        applicationPromptPage: breakApplication ? 11 : 10,
        applicationAnswerPage: 11, pages: [10, 11] }],
    }
  },
})
assert.equal(movedApplication.pageCount, 12)
assert.deepEqual(movedApplication.coverGapsPt, [-25.5, 18])
assert.deepEqual(movedApplication.plannedBreakGroupIds, ['application'])
assert.equal(movedApplication.searchedCandidates, 12, 'six natural covers and their bounded application breaks')
const completePrompt = await planLongPaperPdf(longCover, {
  targetPages: 10, omitCover: true,
  render: async candidate => {
    const broken = candidate.includes('data-canonical-group-id="application" data-pdf-planned-break')
    return { pageCount: 9, inspection: [{ id: 'application', applicationPresent: true,
      pages: broken ? [8] : [7, 8],
      applicationPromptPage: 8, applicationPromptPages: broken ? [8] : [7, 8],
      applicationAnswerPage: 8, applicationAnswerPages: [8],
    }] }
  },
})
assert.equal(completePrompt.searchedCandidates, 2, 'a last-fragment-only match is not a whole-prompt match')
assert.deepEqual(completePrompt.plannedBreakGroupIds, ['application'])
let bankRenders = 0
const intactLongBank = await planLongPaperPdf(longCover, {
  targetPages: 12,
  render: async () => ({ pageCount: 11, inspection: [
    { id: 'seven', pages: [5, 6], optionBankPages: ++bankRenders === 1 ? [5, 6] : [6] },
  ] }),
})
assert.equal(intactLongBank.searchedCandidates, 2, 'a split bank is not a long-paper fit despite a valid page count')
assert.deepEqual(intactLongBank.coverGapsPt, [54, 72])

// A same-count redistribution must remain searchable: the first break fixes a
// substantial face split without increasing pages; the second reaches target.
const threeGroups = '<html><head></head><body><section data-canonical-group-id="a"></section><section data-canonical-group-id="b"></section><section data-canonical-group-id="c"></section></body></html>'
const redistributed = await planFixedPagePdf(threeGroups, {
  targetPages: 8,
  render: async (html) => {
    const b = /data-canonical-group-id="b" data-pdf-planned-break/.test(html)
    const c = /data-canonical-group-id="c" data-pdf-planned-break/.test(html)
    return {
      pageCount: b && c ? 8 : 7,
      inspection: [
        { id: 'a', pages: [1] },
        { id: 'b', pages: b ? [3] : [2, 3], fragments: b ? [] : [{ page: 2, height: 90, lineHeight: 16 }] },
        { id: 'c', pages: [5] },
      ],
    }
  },
})
assert.deepEqual(redistributed.plannedBreakGroupIds, ['b', 'c'])

// A one-line opening fragment across a face is acceptable.
const tiny = await planFixedPagePdf(source, {
  targetPages: 8,
  render: async () => ({ pageCount: 8, inspection: [
    { id: 'reading.long-multimodal-a', pages: [2, 3], fragments: [{ page: 2, height: 24, lineHeight: 16 }] },
    { id: 'writing', pages: [5] },
  ] }),
})
assert.deepEqual(tiny.plannedBreakGroupIds, [])

// Exact page count wins over ideal face boundaries; retain a useful warning.
const soft = await planFixedPagePdf(source, {
  targetPages: 8,
  render: async () => ({ pageCount: 8, inspection: [
    { id: 'reading.long-multimodal-a', pages: [2, 3], fragments: [{ page: 2, height: 180, lineHeight: 16 }] },
    { id: 'writing', pages: [5] },
  ] }),
})
assert.deepEqual(soft.crossingGroupIds, ['reading.long-multimodal-a'])
assert.equal(soft.pageCount, 8)

// The planner's operational bound is part of this verifier: a complete render
// can carry a large PDF and serialized Paged DOM, so an impossible 30-group
// paper must stop at 24 renders rather than walking a powerset.
let boundedRenders = 0
const manyGroups = `<html><head></head><body>${Array.from({ length: 30 }, (_, index) =>
  `<section data-canonical-group-id="g${index}"></section>`).join('')}</body></html>`
await assert.rejects(
  () => planFixedPagePdf(manyGroups, {
    targetPages: 8,
    render: async () => {
      boundedRenders += 1
      return {
        pageCount: 12,
        pdfBytes: Buffer.alloc(256 * 1024),
        paginatedHtml: 'x'.repeat(256 * 1024),
        inspection: Array.from({ length: 30 }, (_, index) => ({ id: `g${index}`, pages: [index + 1] })),
      }
    },
  }),
  (error) => error.code === 'PAPER_FIXED_PAGE_IMPOSSIBLE' && error.searchedCandidates === 24,
)
assert.equal(boundedRenders, 24)

// Ten-page cover adjustment is ordered: normal, title-up, then lower gap.
const coverSource = '<html><head></head><body><header data-canonical-paper-opening></header></body></html>'
// Equal split counts must distinguish dispersed content, while accounting for
// damage to later groups. Neither render count nor declaration order is a score.
for (const targetPages of [8, 10]) for (const laterCost of [0, 12]) {
  const measuredSource = coverSource.replace('</body>', '<section data-canonical-group-id="b"></section><section data-canonical-group-id="grammar"></section></body>')
  const scored = await planFixedPagePdf(measuredSource, {
    targetPages,
    render: async candidate => {
      const tight = candidate.includes('margin-top:-25.5pt')
      const fragments = (pages, lines) => pages.map((page, index) => ({ page, height: lines[index] * 24, lineHeight: 24 }))
      const bPages = [2, 3]
      const gPages = [6, 7]
      return { pageCount: targetPages, inspection: [
        { id: 'b', type: 'reading', pages: bPages, fragments: fragments(bPages, tight ? [29, 6] : [20, 15]) },
        { id: 'grammar', type: 'grammarFill', pages: gPages, fragments: fragments(gPages, tight ? [3 + laterCost, 20] : [3, 20]) },
      ] }
    },
  })
  assert.deepEqual(scored.coverGapsPt, laterCost === 0 ? [-25.5, 18] : targetPages === 8 ? [0, 18] : [72, 72],
    'prefer less scattered content unless the later split costs more than the improvement')
  assert.ok(scored.searchedCandidates <= 24)
}

for (const successAt of [0, 1, 2]) {
  const tried = []
  const result = await planFixedPagePdf(coverSource, {
    targetPages: 10,
    render: async (candidate) => {
      const gaps = candidate.includes('title-to-notices:54pt') ? [54, 54]
        : candidate.includes('page-top-to-title:54pt') ? [54, 72] : [72, 72]
      tried.push(gaps)
      return { pageCount: tried.length > successAt ? 10 : 11, inspection: [] }
    },
  })
  assert.deepEqual(tried, [[72, 72], [54, 72], [54, 54]].slice(0, successAt + 1))
  assert.deepEqual(result.coverGapsPt, tried.at(-1))
  assert.equal(result.searchedCandidates, successAt + 1)
  assert.doesNotMatch(coverSource, /data-pdf-cover-adjustment/, 'input for Screen/Print remains untouched')
}

// Eight-page papers spend first-page space on reading, not a roomy cover.
const compact = await planFixedPagePdf(coverSource, {
  targetPages: 8,
  render: async (candidate) => {
    assert.doesNotMatch(candidate, /data-pdf-omit-cover/)
    return { pageCount: candidate.includes('title-to-notices:18pt') ? 8 : 9, inspection: [] }
  },
})
assert.deepEqual(compact.coverGapsPt, [-25.5, 18])
assert.equal(compact.searchedCandidates, 1, 'compact cover gets the first render, not the last budget slot')
assert.doesNotMatch(coverSource, /data-pdf-cover-adjustment/)

// Zero padding alone cannot use the first page's top margin. The final profile
// changes real flow occupancy, and the reviewed plan must replay it exactly.
for (const targetPages of [8, 10]) {
  let selectedHtml
  const lifted = await planFixedPagePdf(coverSource, {
    targetPages,
    render: async candidate => {
      selectedHtml = candidate
      assert.doesNotMatch(candidate, /transform|page-top-to-title:-/)
      return { pageCount: candidate.includes('margin-top:-25.5pt') ? targetPages : targetPages + 1, inspection: [] }
    },
  })
  assert.deepEqual(lifted.coverGapsPt, [-25.5, 18])
  assert.equal(lifted.searchedCandidates, targetPages === 8 ? 1 : 6)
  await renderExplicitFixedPagePdf(coverSource, {
    ...lifted, targetPages,
    render: async candidate => {
      assert.equal(candidate, selectedHtml)
      return { pageCount: targetPages, inspection: [] }
    },
  })
}

// Do not spend the search on a normal-cover break when compact natural flow
// already fixes D. This fails the previous cover-at-a-time search order.
let openingFirstRenders = 0
const openingFirst = await planFixedPagePdf(threeGroups.replace('<body>', '<body><header data-canonical-paper-opening></header>'), {
  targetPages: 10,
  render: async (candidate) => {
    openingFirstRenders += 1
    assert.doesNotMatch(candidate, /<section[^>]* data-pdf-planned-break/)
    const compact = candidate.includes('title-to-notices:36pt')
    return { pageCount: 10, inspection: [
      { id: 'a', pages: [3] },
      { id: 'b', pages: compact ? [5] : [4, 5], fragments: [{ page: 4, height: 100, lineHeight: 16 }] },
      { id: 'c', pages: [7] },
    ] }
  },
})
assert.deepEqual(openingFirst.coverGapsPt, [18, 36])
assert.deepEqual(openingFirst.crossingGroupIds, [])
assert.deepEqual(openingFirst.plannedBreakGroupIds, [])
assert.equal(openingFirstRenders, 4)

let coveredBudget = 0
await assert.rejects(() => planFixedPagePdf(manyGroups.replace('<body>', '<body><header data-canonical-paper-opening></header>'), {
  targetPages: 10,
  render: async () => {
    coveredBudget += 1
    return { pageCount: 12, inspection: Array.from({ length: 30 }, (_, index) => ({ id: `g${index}`, pages: [1] })) }
  },
}), (error) => error.code === 'PAPER_FIXED_PAGE_IMPOSSIBLE' && error.searchedCandidates === coveredBudget)
assert.ok(coveredBudget <= 24, 'all opening and option-bank attempts share one render budget')

// Ablation exposed that declaration-order search can spend the budget on an
// overlong cover while the compact exact-count baseline still needs one break.
const rankedCover = await planFixedPagePdf(threeGroups.replace('<body>', '<body><header data-canonical-paper-opening></header>'), {
  targetPages: 8,
  render: async (candidate) => {
    const compact = candidate.includes('title-to-notices:18pt')
    const broken = /<section[^>]* data-pdf-planned-break/.test(candidate)
    if (broken) assert.ok(compact, 'spend break-search budget on the closest page-count profile first')
    return {
      pageCount: compact ? 8 : 9,
      inspection: [
        { id: 'a', pages: [1] },
        { id: 'b', pages: broken ? [2] : [1, 2] },
        { id: 'c', pages: [3] },
      ],
    }
  },
})
assert.deepEqual(rankedCover.coverGapsPt, [-25.5, 18])
assert.equal(rankedCover.layoutPenalty, 0)

const special = await planFixedPagePdf(coverSource, {
  targetPages: 8, omitCover: true,
  render: async (candidate) => {
    assert.match(candidate, /data-pdf-omit-cover/)
    assert.doesNotMatch(candidate, /data-pdf-cover-adjustment/)
    return { pageCount: 8, inspection: [] }
  },
})
assert.equal(special.coverGapsPt, null)
assert.doesNotMatch(coverSource, /data-pdf-omit-cover/)

// Equal spill amounts have different reading costs on sequential duplex A3.
// These expected costs are independent policy examples: six lines spill,
// plus 0 / half / three times that spill, plus one genuine flip warning.
for (const [pages, expected] of [[[1, 2], 6], [[4, 5], 9], [[2, 3], 25]]) {
  const scored = await planFixedPagePdf('<html><head></head><body><section data-canonical-group-id="a"></section></body></html>', {
    targetPages: 8,
    render: async () => ({ pageCount: 8, inspection: [{ id: 'a', type: 'reading', pages,
      fragments: pages.map((page, index) => ({ page, height: (index ? 6 : 20) * 24, lineHeight: 24 })),
    }] }),
  })
  assert.equal(scored.layoutPenalty, expected)
  assert.equal(scored.crossingGroupIds.length, pages[0] === 2 ? 1 : 0)
}

// Same-face splits used to look perfect to the planner. Both eight-page
// editions must prefer complete groups, with grammar + application sharing.
const types = ['reading', 'reading', 'reading', 'reading', 'sevenChoices', 'cloze', 'grammarFill', 'writing', 'continuation']
const fullSource = `<html><head></head><body>${types.map((type, index) => `<section data-canonical-group-id="g${index}" data-canonical-group-type="${type}"></section>`).join('')}</body></html>`
const ideal = ['g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g8']
const uncoveredTen = await planFixedPagePdf(fullSource, {
  targetPages: 10, omitCover: true,
  render: async html => {
    assert.match(html, /data-pdf-omit-cover/)
    const breaks = [...html.matchAll(/data-canonical-group-id="(g\d+)"[^>]* data-pdf-planned-break/g)].map(match => match[1])
    const arranged = JSON.stringify(breaks) === JSON.stringify(ideal)
    return { pageCount: 10, inspection: types.map((type, index) => ({ id: `g${index}`, type,
      pages: [arranged ? [1, 2, 3, 4, 5, 6, 7, 7, 8][index] : 1] })) }
  },
})
assert.deepEqual(uncoveredTen.plannedBreakGroupIds, ideal, 'uncovered ten-page variant tries whole groups too')
assert.equal(uncoveredTen.layoutPenalty, 0)
await renderExplicitFixedPagePdf(fullSource, { targetPages: 10, omitCover: true,
  plannedBreakGroupIds: uncoveredTen.plannedBreakGroupIds,
  render: async html => {
    assert.match(html, /data-pdf-omit-cover/)
    return { pageCount: 10, inspection: [] }
  },
})
let improvementRenders = 0
const improvedWithinBudget = await planFixedPagePdf(fullSource.replace('<body>', '<body><header data-canonical-paper-opening></header>'), {
  targetPages: 8,
  render: async candidate => {
    assert.doesNotMatch(candidate, /data-pdf-option-bank-fallback/)
    improvementRenders++
    const pages = improvementRenders >= 19 ? [1, 2, 3, 4, 5, 6, 7, 7, 8] : types.map(() => 1)
    return { pageCount: 8, inspection: types.map((type, index) => ({ id: `g${index}`, type, pages: [pages[index]] })) }
  },
})
assert.equal(improvedWithinBudget.layoutPenalty, 0, 'an exact-count fit must not reserve budget for an unreachable option-bank fallback')
assert.equal(improvedWithinBudget.searchedCandidates, 19)

for (const longA of [false, true]) {
  const arranged = await planFixedPagePdf(fullSource, {
    targetPages: 8,
    render: async (candidate) => {
      const breaks = [...candidate.matchAll(/data-canonical-group-id="(g\d+)"[^>]* data-pdf-planned-break/g)].map((match) => match[1])
      const idealState = JSON.stringify(breaks) === JSON.stringify(ideal)
      const recovered = JSON.stringify(breaks) === JSON.stringify(ideal.slice(1))
      const good = idealState || (longA && recovered)
      const pages = !good ? [[1, 2], [1, 2], [1, 2], [1, 2], [5], [6], [7], [7], [8]]
        : !longA ? [[1], [2], [3], [4], [5], [6], [7], [7], [8]]
          : idealState ? [[1, 2], [3], [4], [5], [6], [7], [8], [8], [9]]
            : [[1, 2], [2], [3], [4], [5], [6], [7], [7], [8]]
      return {
        pageCount: good ? (longA && idealState ? 9 : 8) : 8,
        inspection: types.map((type, index) => ({
          id: `g${index}`, type, pages: pages[index],
        })),
      }
    },
  })
  assert.deepEqual(arranged.plannedBreakGroupIds, longA ? ideal.slice(1) : ideal)
  assert.deepEqual(arranged.splitGroupIds, longA ? ['g0'] : [])
}

// Ten pages must not accept an all-group-break seed before trying one break.
const gentleTen = await planFixedPagePdf(threeGroups, {
  targetPages: 10,
  render: async (candidate) => ({
    pageCount: /<section[^>]* data-pdf-planned-break/.test(candidate) ? 10 : 9,
    inspection: [{ id: 'a', pages: [1] }, { id: 'b', pages: [1] }, { id: 'c', pages: [1] }],
  }),
})
assert.equal(gentleTen.plannedBreakGroupIds.length, 1)

const fourBreakTen = await planFixedPagePdf(fullSource.replace('<body>', '<body><header data-canonical-paper-opening></header>'), {
  targetPages: 10,
  render: async (candidate) => ({
    pageCount: 6 + [...candidate.matchAll(/<section[^>]* data-pdf-planned-break/g)].length,
    inspection: types.map((type, index) => ({ id: `g${index}`, type, pages: [1] })),
  }),
})
assert.equal(fourBreakTen.plannedBreakGroupIds.length, 4, 'cover alternatives must not starve a multi-break natural plan')
assert.ok(fourBreakTen.searchedCandidates <= 24)

const skipNoOp = await planFixedPagePdf(threeGroups, {
  targetPages: 10,
  render: async (candidate) => {
    assert.doesNotMatch(candidate, /data-canonical-group-id="b" data-pdf-planned-break/,
      'B already starts on the next page; spend the candidate on C instead')
    const moved = candidate.includes('data-canonical-group-id="c" data-pdf-planned-break')
    return { pageCount: moved ? 10 : 9,
      inspection: [{ id: 'a', pages: [1] }, { id: 'b', pages: [2] }, { id: 'c', pages: [moved ? 3 : 2] }] }
  },
})
assert.deepEqual(skipNoOp.plannedBreakGroupIds, ['c'])

for (const targetPages of [8, 10]) for (const needsFallback of [false, true]) {
  const attempts = []
  const bankResult = await planFixedPagePdf(coverSource, {
    targetPages,
    render: async (candidate) => {
      const relaxed = candidate.includes('data-pdf-option-bank-fallback')
      attempts.push(relaxed)
      assert.match(candidate, /canonical-option-bank-item\{break-inside:avoid;page-break-inside:avoid\}/)
      return { pageCount: needsFallback && !relaxed ? targetPages + 1 : targetPages,
        inspection: [{ id: 'seven', pages: relaxed ? [7, 8] : [8], optionBankPages: relaxed ? [7, 8] : [8] }] }
    },
  })
  assert.deepEqual(attempts, needsFallback
    ? [...Array(6).fill(false), ...Array(6).fill(true)]
    : [false])
  assert.equal(bankResult.splitOptionBankCount, Number(needsFallback))
}

// Adaptive writing space is a fixed-edition choice, never a content rewrite.
const writingSource = '<html><head></head><body><section data-canonical-group-id="application"><div class="canonical-application-response" style="height:65mm"></div></section><section data-canonical-group-id="continuation"><div class="canonical-continuation-response" style="height:57mm">Starter remains intact</div></section></body></html>'
const heightsIn = html => ({
  application: Number(html.match(/\.canonical-application-response\{height:(\d+)mm!important\}/)?.[1] || 65),
  continuation: Number(html.match(/\.canonical-continuation-response\{height:(\d+)mm!important\}/)?.[1] || 57),
})
// A roomier cover may be closer to eight pages, yet sacrifice more writing
// space. Compact-first fallback must not be undone by page-distance sorting.
const compactWriting = await planFixedPagePdf(writingSource.replace('<body>', '<body><header data-canonical-paper-opening></header>'), {
  targetPages: 8,
  render: async html => {
    const tight = html.includes('margin-top:-25.5pt')
    const fits = heightsIn(html).application <= (tight ? 60 : 29)
    return { pageCount: fits ? 8 : tight ? 10 : 9, inspection: [] }
  },
})
assert.deepEqual(compactWriting.coverGapsPt, [-25.5, 18])
assert.deepEqual(compactWriting.answerBoxHeightsMm, { application: 60 })
assert.ok(compactWriting.searchedCandidates <= 24)

for (const timeout of [false, true]) {
  const improvedWriting = await planFixedPagePdf(writingSource, { targetPages: 8, render: async html => {
    const broken = html.includes('data-canonical-group-id="continuation" data-pdf-planned-break')
    if (broken) {
      assert.equal(heightsIn(html).application, 39, 'break refinement must retain the selected writing height')
      if (timeout) throw Object.assign(new Error('optimization timeout'), { name: 'TimeoutError' })
    }
    return { pageCount: heightsIn(html).application <= 39 ? 8 : 9, inspection: [
      { id: 'application', type: 'writing', pages: [7] },
      { id: 'continuation', type: 'continuation', pages: [broken ? 8 : 7] },
    ] }
  } })
  assert.deepEqual(improvedWriting.answerBoxHeightsMm, { application: 39 })
  assert.deepEqual(improvedWriting.plannedBreakGroupIds, timeout ? [] : ['continuation'])
  assert.ok(improvedWriting.searchedCandidates <= 24)
  if (timeout) assert.equal(improvedWriting.optimizationStopped, 'renderer_timeout_after_valid_fit')
}

for (const targetPages of [8, 10]) for (const needsContinuation of [false, true]) {
  let count = 0
  const adaptive = await planFixedPagePdf(writingSource, { targetPages, render: async html => {
    count += 1
    const heights = heightsIn(html)
    assert.match(html, /Starter remains intact/)
    assert.ok(heights.application >= 24 && heights.continuation >= 40)
    const fits = needsContinuation
      ? heights.application === 24 && heights.continuation <= 46
      : heights.application <= 39
    return { pageCount: fits ? targetPages : targetPages + 1,
      inspection: [{ id: 'application', pages: [targetPages - 1] }, { id: 'continuation', pages: [targetPages] }],
      paginatedHtml: html }
  } })
  assert.deepEqual(adaptive.answerBoxHeightsMm, needsContinuation
    ? { application: 24, continuation: 46 } : { application: 39 })
  assert.ok(count <= 24)
  const replay = await renderExplicitFixedPagePdf(writingSource, {
    targetPages, plannedBreakGroupIds: [], answerBoxHeightsMm: adaptive.answerBoxHeightsMm,
    render: async html => {
      assert.deepEqual(heightsIn(html), { application: adaptive.answerBoxHeightsMm.application,
        continuation: adaptive.answerBoxHeightsMm.continuation || 57 })
      return { pageCount: targetPages, inspection: [] }
    },
  })
  assert.deepEqual(replay.answerBoxHeightsMm, adaptive.answerBoxHeightsMm)
}

const alreadyFits = await planFixedPagePdf(writingSource, { targetPages: 10, render: async html => {
  assert.doesNotMatch(html, /data-pdf-answer-box-heights/)
  return { pageCount: 10, inspection: [] }
} })
assert.equal(alreadyFits.answerBoxHeightsMm, undefined)
const detached = { id: 'application', pages: [9, 10], applicationPromptPage: 9, applicationAnswerPage: 10 }
const attachedFit = await planFixedPagePdf(writingSource.replace('<body>', '<body><header data-canonical-paper-opening></header>'), {
  targetPages: 10, render: async html => {
    const attached = html.includes('--canonical-cover-page-top-to-title:54pt;--canonical-cover-title-to-notices:54pt')
      && heightsIn(html).application <= 39
    return { pageCount: 10, inspection: [attached
      ? { ...detached, pages: [9], applicationAnswerPage: 9 } : detached] }
  },
})
assert.deepEqual(attachedFit.coverGapsPt, [54, 54], 'exact page count alone must not accept a detached application box')
assert.deepEqual(attachedFit.answerBoxHeightsMm, { application: 39 })
const underfullFit = await planFixedPagePdf(writingSource.replace('<body>', '<body><section data-canonical-group-id="reading"></section>'), {
  targetPages: 10, render: async html => {
    assert.doesNotMatch(html, /data-pdf-answer-box-heights/, 'underfull paper needs a semantic break, not smaller boxes')
    const separated = /<section[^>]*data-canonical-group-id="application"[^>]*data-pdf-planned-break>/.test(html)
    return { pageCount: separated ? 10 : 9, inspection: [
      { id: 'reading', pages: [7] },
      { id: 'application', pages: separated ? [8] : [7, 8], applicationPromptPage: separated ? 8 : 7, applicationAnswerPage: 8 },
      { id: 'continuation', pages: [9] },
    ] }
  },
})
assert.equal(underfullFit.pageCount, 10)
assert.equal(underfullFit.answerBoxHeightsMm, undefined)
for (const missing of [
  { id: 'application', pages: [9], applicationPresent: true },
  { ...detached, applicationAnswerPage: undefined },
  { ...detached, applicationPromptPage: undefined },
]) {
  await assert.rejects(() => renderExplicitFixedPagePdf(writingSource, {
    targetPages: 10, plannedBreakGroupIds: [], answerBoxHeightsMm: { application: 24 },
    render: async () => ({ pageCount: 10, inspection: [missing] }),
  }), error => error.code === 'PAPER_FIXED_PAGE_IMPOSSIBLE')
}
await assert.rejects(() => renderExplicitFixedPagePdf(writingSource, {
  targetPages: 10, plannedBreakGroupIds: [], answerBoxHeightsMm: { application: 24 },
  render: async () => ({ pageCount: 10, inspection: [detached] }),
}), error => error.code === 'PAPER_FIXED_PAGE_IMPOSSIBLE')
const safeFit = await planFixedPagePdf(writingSource, { targetPages: 10, render: async html => {
  const { application } = heightsIn(html)
  if (application < 34) throw Object.assign(new Error('long given text does not fit'), { code: 'PAPER_LAYOUT_OVERFLOW' })
  return { pageCount: application <= 39 ? 10 : 11, inspection: [] }
} })
assert.deepEqual(safeFit.answerBoxHeightsMm, { application: 39 }, 'skip overflowing sizes instead of clipping given text')

for (const fallback of [false, true]) {
  let attempts = 0
  const multiCover = writingSource.replace('<body>', '<body><header data-canonical-paper-opening></header>')
  const fit = await planFixedPagePdf(multiCover, { targetPages: 10, render: async html => {
    attempts += 1
    const profileMatches = fallback ? html.includes('data-pdf-option-bank-fallback')
      : html.includes('--canonical-cover-page-top-to-title:54pt;--canonical-cover-title-to-notices:54pt')
    return { pageCount: profileMatches && heightsIn(html).application <= 39 ? 10 : 11, inspection: [] }
  } })
  assert.equal(fit.pageCount, 10)
  assert.deepEqual(fit.answerBoxHeightsMm, { application: 39 })
  assert.equal(fit.allowSplitOptionBank, fallback)
  if (!fallback) assert.deepEqual(fit.coverGapsPt, [54, 54])
  assert.ok(attempts <= 24)
  assert.equal(fit.searchedCandidates, attempts)
}
let impossibleWritingAttempts = 0
await assert.rejects(() => planFixedPagePdf(writingSource.replace('<body>', '<body><header data-canonical-paper-opening></header>'), {
  targetPages: 10, render: async () => { impossibleWritingAttempts += 1; return { pageCount: 12, inspection: [] } },
}), error => error.code === 'PAPER_FIXED_PAGE_IMPOSSIBLE' && error.searchedCandidates === impossibleWritingAttempts)
assert.ok(impossibleWritingAttempts <= 24, 'height/cover/bank combinations share the original render budget')

for (const failAt of [2, 7]) {
  let attempts = 0
  const verifiedPdf = Buffer.from('%PDF-already-verified')
  const timeoutSource = coverSource.replace('</body>', '<section data-canonical-group-id="a"></section><section data-canonical-group-id="b"></section></body>')
  const retained = await planFixedPagePdf(timeoutSource, { targetPages: 8, render: async () => {
    if (++attempts === failAt) throw Object.assign(new Error('setContent timed out'), { name: 'TimeoutError' })
    return { pageCount: 8, pdfBytes: verifiedPdf,
      inspection: [{ id: 'a', pages: [2, 3] }, { id: 'b', pages: [3] }] }
  } })
  assert.equal(retained.pdfBytes, verifiedPdf, 'an optimization timeout must not discard an already verified PDF')
  assert.equal(retained.optimizationStopped, 'renderer_timeout_after_valid_fit')
  assert.equal(retained.searchedCandidates, attempts)
}
await assert.rejects(() => planFixedPagePdf(coverSource, { targetPages: 8, render: async () => {
  throw Object.assign(new Error('first render timed out'), { name: 'TimeoutError' })
} }), error => error.name === 'TimeoutError', 'without a verified fit timeout must still fail')

const slots = ['listening.short-dialogue', 'listening.long-form', 'reading.a', 'reading.b', 'reading.c', 'reading.d',
  'reading.seven-choices', 'language.cloze', 'language.grammar-fill', 'writing.application', 'writing.continuation']
const wholeSource = { paperId: 'source', selections: [{ mode: 'canonical', projectedOccurrences:
  slots.map((slotId, index) => ({ slotId, groupId: `s${index}` })) }] }
const selectedIds = slots.map((_, index) => `s${index}`)
assert.equal(ownsCompletePaperOpening(wholeSource, selectedIds), true)
assert.equal(ownsCompletePaperOpening(wholeSource, selectedIds.slice(2)), true)
assert.equal(ownsCompletePaperOpening(wholeSource, selectedIds.slice(1)), false, 'one listening group plus nine groups is incomplete')

const store = readFileSync(new URL('../server/draft-paper/draftPaperStore.mjs', import.meta.url), 'utf8')
assert.match(store, /pageLayout === 'natural'[\s\S]*getDraftPaperPagination/)
assert.match(store, /pageLayout === 'long10' \|\| pageLayout === 'long12' \? planLongPaperPdf : planFixedPagePdf\)\(html, \{/)
assert.match(store, /targetPages, omitCover, edition: pageLayout, render: renderPaginatedPaper/)
const fixedBranch = store.match(/if \(pageLayout === 'natural'\)[\s\S]*?} else \{([\s\S]*?)\n    }\n    const draftPaper = pagination\.draftPaper/)[1]
assert.doesNotMatch(fixedBranch, /draftPaginationCache(?:Get|Set)/)
assert.match(store, /includeListening !== false \|\| item\.detail\.groupType !== 'listening'/)
assert.match(store, /studentProductPolicy : fixedPageLayoutPolicy\)\(pageLayout, listeningCount, sourceHasListening\)/)
assert.match(store, /ownsCompletePaperOpening\(canonicalConsumption, draftPaper.items.map\(\(item\) => item.groupId\)\)/)

console.log('PASS friendly fixed-page planner: semantic break, exact target, actionable overflow, listening modes, cache isolation')
