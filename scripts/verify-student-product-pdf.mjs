import assert from 'node:assert/strict'
import { applyStudentProductLayout, planStudentProductPdf, renderExplicitStudentProductPdf, studentProductPolicy } from '../server/draft-paper/studentProductPdf.mjs'
import { validatePaperPaginationPlan, paginationPlanEdition } from '../server/paper-import/paginationPlan.mjs'
import { renderPaginatedPaper } from '../server/draft-paper/paginationRenderer.mjs'
import { closeChromiumPool } from '../server/draft-paper/chromiumPool.mjs'
import { searchFixedPagePdf, inspectGroups } from '../server/draft-paper/fixedPagePdfPlanner.mjs'

const html = '<html><head><style>@page{size:A4;margin: 21mm 24mm 24mm 24mm;}</style></head><body><section data-canonical-group-id="application"><div class="canonical-application-response"></div></section><section data-canonical-group-id="continuation"><div class="canonical-continuation-response">Both supplied starters</div></section></body></html>'
const inspection = [
  { id: 'application', type: 'writing', pages: [7], applicationPresent: true,
    applicationPromptPages: [7], applicationAnswerPages: [7], applicationPromptPage: 7, applicationAnswerPage: 7 },
  { id: 'continuation', type: 'continuation', pages: [8], continuationMaterialPages: [8], continuationAnswerPages: [8] },
]
const geometry = source => ({
  font: source.includes('font-size:12pt!important') ? 12 : 10.5,
  application: Number(source.match(/canonical-application-response\{height:(\d+)mm/)?.[1]),
  continuation: Number(source.match(/canonical-continuation-response\{height:(\d+)mm/)?.[1]),
})

// A modest tail is worth a whole reading group; half a blank page is not.
// Old/economy callers must retain exactly their prior selection policy.
for (const balanceWhitespace of [false, true]) for (const tail of [5, 12, 30]) {
  const fragment = (page, height, pageTailLines) => ({ page, height, lineHeight: 20, pageTailLines })
  const natural = { pageCount: 8, inspection: [
    { id: 'a', type: 'reading', pages: [1], fragments: [fragment(1, 300, 1)] },
    { id: 'b', type: 'reading', pages: [1, 2], fragments: [fragment(1, 600, 1), fragment(2, 600, 1)] },
  ] }
  const selected = await searchFixedPagePdf('<head></head><section data-canonical-group-id="b"></section>', {
    targetPages: 10, atMost: true, balanceWhitespace, natural, renderLimit: 2,
    render: async () => ({ pageCount: 8, inspection: [
      { id: 'a', type: 'reading', pages: [1], fragments: [fragment(1, 300, tail)] },
      { id: 'b', type: 'reading', pages: [2], fragments: [fragment(2, 400, 1)] },
      { id: 'last', type: 'reading', pages: [8], fragments: [fragment(8, 100, 35)] },
    ] }),
  })
  assert.deepEqual(selected.plannedBreakGroupIds, balanceWhitespace && tail >= 12 ? [] : ['b'])
}

assert.throws(() => studentProductPolicy('largeComplete', 1), /两个听力/)
assert.deepEqual(studentProductPolicy('largeNoListening', 2), { targetPages: 10, includeListening: false, omitCover: false, atMost: true })

for (const balanceWhitespace of [false, true]) {
  const attempted = []
  await searchFixedPagePdf('<head></head><section data-canonical-group-id="listen"></section><section data-canonical-group-id="reading"></section>', {
    targetPages: 12, atMost: true, balanceWhitespace, renderLimit: 3,
    natural: { pageCount: 11, inspection: [
      { id: 'first', type: 'listening', pages: [1] },
      { id: 'listen', type: 'listening', pages: [1, 2] },
      { id: 'reading', type: 'reading', pages: [2, 3] },
    ] },
    render: async source => {
      attempted.push(source)
      return { pageCount: 11, inspection: [{ id: 'reading', type: 'reading', pages: [2, 3] }] }
    },
  })
  assert.equal(attempted.some(source => source.includes('data-canonical-group-id="listen" data-pdf-planned-break')), !balanceWhitespace)
  assert.ok(attempted.length, 'passage improvements remain searchable')
}

for (const smallOnly of [false, true]) {
  const seen = []
  const render = async source => {
    const sizes = geometry(source)
    seen.push(sizes)
    assert.match(source, /Both supplied starters/)
    const fits = (!smallOnly || sizes.font === 10.5) && sizes.application <= 44
    return { pageCount: fits ? 8 : 9, inspection, pdfBytes: Buffer.from(JSON.stringify(sizes)) }
  }
  const result = await planStudentProductPdf(html, { edition: 'economy8', render })
  assert.equal(result.fontSizePt, smallOnly ? 10.5 : 12)
  assert.deepEqual(result.layout.answerBoxHeightsMm, { application: 44, continuation: 57 },
    'last-page space restores continuation independently of application compression')
  assert.ok(seen.some(sizes => sizes.application === 45), 'probe the failing side of the exact height boundary')
  assert.equal(result.searchedCandidates, seen.length)
  assert.ok(seen.length <= 96)
  if (smallOnly) assert.equal(seen[0].font, 12)
  else assert.ok(seen.every(sizes => sizes.font === 12), 'never prefer roomy small text over a valid large tier')
  const replay = await renderExplicitStudentProductPdf(html, {
    edition: 'economy8', layout: result.layout, plannedBreakGroupIds: result.plannedBreakGroupIds, render,
  })
  assert.deepEqual(replay.pdfBytes, result.pdfBytes)
  for (const field of ['crossingGroupIds', 'splitGroupIds', 'splitOptionBankCount', 'layoutPenalty']) {
    assert.deepEqual(replay[field], result[field], `replay preserves measured ${field}`)
  }
}

for (const [edition, pages] of [['largeComplete', 11], ['largeNoListening', 9]]) {
  const result = await planStudentProductPdf(html, { edition, render: async source => {
    assert.equal(geometry(source).font, 12)
    return { pageCount: pages, inspection }
  } })
  assert.equal(result.pageCount, pages, 'ceilings do not pad to a fixed page count')
  assert.deepEqual(result.layout.answerBoxHeightsMm, { application: 65, continuation: 57 })
}

// A compressed natural layout must not win before trying normal boxes with
// the supported media wrap. Explicit historical layouts are unchanged.
const mediaRestored = await planStudentProductPdf(html, { edition: 'economy8', render: async source => {
  const sizes = geometry(source)
  const fits = source.includes('float:right!important') || sizes.continuation <= 27
  return { pageCount: fits ? 8 : 9, inspection }
} })
assert.equal(mediaRestored.layout.figureLayout, 'float80')
assert.deepEqual(mediaRestored.layout.answerBoxHeightsMm, { application: 65, continuation: 57 })

const layout = { profile: 'student-friendly-v1', fontSizePt: 12, figureLayout: 'natural', answerBoxHeightsMm: { application: 65, continuation: 57 } }
const identity = { paperId: 'fixture', sourceDigest: 'source', candidateDigest: 'candidate',
  slotBindings: [{ slotId: 'writing.application', groupId: 'application', familyContractId: 'application-writing' },
    { slotId: 'writing.continuation', groupId: 'continuation', familyContractId: 'continuation-writing' }] }
const plan = { schemaVersion: 'paper-pagination-plan-v4', paperId: 'fixture', sourceDigest: 'source', candidateDigest: 'candidate',
  editions: { largeNoListening: { targetPages: 10, includeListening: false, omitCover: false, coverGapsPt: null,
    allowSplitOptionBank: false, breakSlotIds: ['writing.continuation'], layout } } }
assert.deepEqual(validatePaperPaginationPlan(plan, identity), plan)
assert.deepEqual(paginationPlanEdition(plan, 'largeNoListening', identity.slotBindings).plannedBreakGroupIds, ['continuation'])
for (const change of [
  { layout: { ...layout, fontSizePt: 10.5 } }, { includeListening: true }, { omitCover: true },
  { allowSplitOptionBank: true }, { coverGapsPt: [0, 18] }, { breakSlotIds: ['unknown'] },
]) assert.throws(() => validatePaperPaginationPlan({ ...plan, editions: { largeNoListening: { ...plan.editions.largeNoListening, ...change } } }, identity))
assert.throws(() => validatePaperPaginationPlan({ ...plan, schemaVersion: 'paper-pagination-plan-v2' }, identity), /requires/)

for (const edition of ['largeComplete', 'largeNoListening']) {
  const friendlier = await planStudentProductPdf(html, { edition, render: async source => {
    const moved = source.includes('data-canonical-group-id="continuation" data-pdf-planned-break')
    return { pageCount: moved ? 9 : 8, inspection: [inspection[0], { ...inspection[1],
      pages: moved ? [9] : [7, 8], continuationMaterialPages: moved ? [9] : [7, 8], continuationAnswerPages: moved ? [9] : [8] }] }
  } })
  assert.deepEqual(friendlier.plannedBreakGroupIds, ['continuation'], 'both ceiling products improve page turns after a valid fit')
}
assert.throws(() => applyStudentProductLayout(html, { ...layout, fontSizePt: 10.5 }, 'largeNoListening'), /Invalid/)
for (const bad of [
  { pageCount: 13, inspection },
  { pageCount: 12, inspection: [inspection[0], { ...inspection[1], continuationAnswerPages: [9] }] },
  { pageCount: 12, inspection: [...inspection, { id: 'bank', pages: [5, 6], optionBankPages: [5, 6] }] },
]) await assert.rejects(() => renderExplicitStudentProductPdf(html, {
  edition: 'largeComplete', layout, plannedBreakGroupIds: [], render: async () => bad,
}), error => error.code === 'PAPER_FIXED_PAGE_IMPOSSIBLE')
await assert.rejects(() => planStudentProductPdf(html, { edition: 'economy8', render: async () => {
  throw new Error('font download failed')
} }), /font download failed/, 'infrastructure errors must not trigger a smaller font fallback')

for (const edition of ['economy8', 'largeNoListening']) {
  const retained = await planStudentProductPdf(html, { edition, render: async source => {
    if (source.includes('data-canonical-group-id="continuation" data-pdf-planned-break')) {
      throw Object.assign(new Error('candidate overflows'), { code: 'PAPER_LAYOUT_OVERFLOW' })
    }
    return { pageCount: 8, inspection: [inspection[0], { ...inspection[1], pages: [7, 8], continuationMaterialPages: [7, 8] }] }
  } })
  assert.equal(retained.fontSizePt, 12, 'overflowing optimization never discards an acceptable large-font seed')
  assert.deepEqual(retained.layout.answerBoxHeightsMm, { application: 65, continuation: 57 })
}

// Actual Chromium measurement: inherited body type is insufficient for source
// captions/table cells, and a too-wide option must change the whole grid.
try {
  const measured = await renderPaginatedPaper(`<html><head><style>@page{size:A4;margin:20mm}body{margin:0;line-height:20px}</style></head><body>
    <section data-canonical-group-id="box" data-canonical-group-type="writing"><div class="canonical-continuation-response" style="height:180mm;border:1px solid">Starter</div></section></body></html>`, { inspect: inspectGroups })
  // 257mm usable height minus 180mm box and borders, not minus one ink line.
  assert.ok(measured.inspection[0].fragments[0].pageTailLines > 13)
  assert.ok(measured.inspection[0].fragments[0].pageTailLines < 16, 'empty response space must count as occupied')
  const fixture = `<html><head><style>@page{size:A4;margin: 21mm 24mm 24mm 24mm;}
    body{font-family:serif}.canonical-reading-figure figcaption{font-size:9pt}
    .canonical-reading-table td{line-height:16pt}
    .canonical-options{display:grid;grid-template-columns:80px 180px;width:260px}
    .canonical-options>span{white-space:nowrap}
    </style></head><body><div class="canonical-paper-cover-title">English</div>
    <div class="canonical-paper-cover-notices">Administrative notices</div>
    <section class="question-group"><figure class="canonical-reading-figure"><figcaption>Source caption</figcaption></figure>
    <table class="canonical-reading-table" style="width:160px"><tr><td>Wrapped source table text for reading.</td></tr></table>
    <div class="canonical-options"><span>A. This option does not fit its narrow cell</span><span>B. Short</span></div>
    </section></body></html>`
  for (const fontSizePt of [12, 10.5]) {
    const actual = await renderPaginatedPaper(applyStudentProductLayout(fixture, { ...layout, fontSizePt }, 'economy8'), {
      inspect: page => page.evaluate(() => {
        const root = document.querySelector('.pagedjs_pages')
        const type = selector => {
          const style = getComputedStyle(root.querySelector(selector))
          return [parseFloat(style.fontSize), parseFloat(style.lineHeight)]
        }
        return { caption: type('figcaption'), table: type('td'),
          single: root.querySelector('.canonical-options').hasAttribute('data-pdf-single-column'),
          notices: getComputedStyle(root.querySelector('.canonical-paper-cover-notices')).display }
      }),
    })
    const expected = fontSizePt === 12 ? [16, 26] : [14, 24]
    assert.deepEqual(actual.inspection.caption, expected)
    assert.deepEqual(actual.inspection.table, expected)
    assert.equal(actual.inspection.single, true)
    assert.equal(actual.inspection.notices, 'none')
    assert.equal(actual.pageCount, 1)
  }
  await assert.rejects(() => renderPaginatedPaper(applyStudentProductLayout(
    fixture.replace('This option does not fit its narrow cell', 'W'.repeat(100)), layout, 'economy8',
  )), error => error.code === 'PAPER_LAYOUT_OVERFLOW', 'unbreakable text must fail, not be arbitrarily split or clipped')
} finally { await closeChromiumPool() }
console.log('PASS student products: large-first fallback, 44/45mm boundary, independent 57mm restoration, ceilings, replay and fail-closed content')
