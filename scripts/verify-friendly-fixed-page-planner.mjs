import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { applyPlannedGroupBreaks, fixedPageLayoutPolicy, planFixedPagePdf } from '../server/draft-paper/fixedPagePdfPlanner.mjs'
import { ownsCompletePaperOpening } from '../shared/paper-canonical/listeningPresentation.mjs'

assert.deepEqual(fixedPageLayoutPolicy('friendly8', 0), { targetPages: 8, includeListening: false, omitCover: false })
assert.deepEqual(fixedPageLayoutPolicy('friendly8', 2), { targetPages: 8, includeListening: false, omitCover: true })
assert.equal(fixedPageLayoutPolicy('friendly8', 0, true).omitCover, true, 'already unselected listening still belongs to the source')
assert.deepEqual(fixedPageLayoutPolicy('friendly10', 2), { targetPages: 10, includeListening: true, omitCover: false })
assert.throws(() => fixedPageLayoutPolicy('friendly10', 0), /完整的两个听力题组/)

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

// Eight-page papers start compact even if the old cover could fit eight pages.
const compact = await planFixedPagePdf(coverSource, {
  targetPages: 8,
  render: async (candidate) => {
    assert.match(candidate, /page-top-to-title:0pt/)
    assert.match(candidate, /title-to-notices:18pt/)
    return { pageCount: 8, inspection: [] }
  },
})
assert.deepEqual(compact.coverGapsPt, [0, 18])
assert.doesNotMatch(coverSource, /data-pdf-cover-adjustment/)

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

// Same-face splits used to look perfect to the planner. Both eight-page
// editions must prefer complete groups, with grammar + application sharing.
const types = ['reading', 'reading', 'reading', 'reading', 'sevenChoices', 'cloze', 'grammarFill', 'writing', 'continuation']
const fullSource = `<html><head></head><body>${types.map((type, index) => `<section data-canonical-group-id="g${index}" data-canonical-group-type="${type}"></section>`).join('')}</body></html>`
const ideal = ['g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g8']
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

for (const needsFallback of [false, true]) {
  const attempts = []
  const bankResult = await planFixedPagePdf(coverSource, {
    targetPages: 10,
    render: async (candidate) => {
      const relaxed = candidate.includes('data-pdf-option-bank-fallback')
      attempts.push(relaxed)
      return { pageCount: needsFallback && !relaxed ? 11 : 10,
        inspection: [{ id: 'seven', pages: [7, 8], optionBankPages: relaxed ? [7, 8] : [8] }] }
    },
  })
  assert.deepEqual(attempts, needsFallback ? [false, false, false, true] : [false])
  assert.equal(bankResult.splitOptionBankCount, Number(needsFallback))
}

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
assert.match(store, /planFixedPagePdf\(html,[\s\S]*render: renderPaginatedPaper/)
const fixedBranch = store.match(/if \(pageLayout === 'natural'\)[\s\S]*?} else \{([\s\S]*?)\n    }\n    const draftPaper = pagination\.draftPaper/)[1]
assert.doesNotMatch(fixedBranch, /draftPaginationCache(?:Get|Set)/)
assert.match(store, /includeListening !== false \|\| item\.detail\.groupType !== 'listening'/)
assert.match(store, /fixedPageLayoutPolicy\(pageLayout, listeningCount, sourceHasListening\)/)
assert.match(store, /ownsCompletePaperOpening\(canonicalConsumption, draftPaper.items.map\(\(item\) => item.groupId\)\)/)

console.log('PASS friendly fixed-page planner: semantic break, exact target, actionable overflow, listening modes, cache isolation')
