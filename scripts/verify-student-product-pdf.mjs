import assert from 'node:assert/strict'
import { verifyDrawingAreaProductPolicy } from './verify-application-drawing-area.mjs'
await verifyDrawingAreaProductPolicy()
import { readFileSync } from 'node:fs'
import { applyStudentProductLayout, planStudentProductPdf, renderExplicitStudentProductPdf, studentProductPolicy } from '../server/draft-paper/studentProductPdf.mjs'
import { validatePaperPaginationPlan, paginationPlanEdition } from '../server/paper-import/paginationPlan.mjs'
import { renderPaginatedPaper } from '../server/draft-paper/paginationRenderer.mjs'
import { closeChromiumPool } from '../server/draft-paper/chromiumPool.mjs'
import { searchFixedPagePdf, inspectGroups } from '../server/draft-paper/fixedPagePdfPlanner.mjs'
import { embeddedPaperFontCss } from '../server/paper-fonts.mjs'

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
  assert.equal(result.layout.profile, 'student-friendly-economy-v2')
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

// Nine pages are an explicit new-plan ceiling, never a reinterpretation of v4.
const nineLayout = { ...layout, profile: 'student-friendly-economy-v2', fontSizePt: 10.5,
  figureLayout: 'float80', answerBoxHeightsMm: { application: 24, continuation: 24 } }
const ninePlan = { ...plan, schemaVersion: 'paper-pagination-plan-v5', editions: {
  ...plan.editions,
  economy8: { ...plan.editions.largeNoListening, targetPages: 9, layout: nineLayout },
} }
assert.deepEqual(validatePaperPaginationPlan(ninePlan, identity), ninePlan)
assert.throws(() => validatePaperPaginationPlan({ ...ninePlan, schemaVersion: 'paper-pagination-plan-v4' }, identity), /policy/)
assert.throws(() => validatePaperPaginationPlan({ ...plan, schemaVersion: 'paper-pagination-plan-v5' }, identity), /explicit economy8/)
for (const change of [{ targetPages: 8 }, { targetPages: 10 },
  { layout: { ...nineLayout, fontSizePt: 12 } }, { allowSplitOptionBank: true }]) {
  assert.throws(() => validatePaperPaginationPlan({ ...ninePlan, editions: {
    ...ninePlan.editions, economy8: { ...ninePlan.editions.economy8, ...change },
  } }, identity))
}
assert.throws(() => validatePaperPaginationPlan(ninePlan, { ...identity, candidateDigest: 'another-candidate' }), /stale/)
for (const pages of [8, 9, 10]) {
  const render = async () => ({ pageCount: pages, inspection })
  const replay = () => renderExplicitStudentProductPdf(html, { edition: 'economy8', economyPageLimit: 9,
    layout: nineLayout, plannedBreakGroupIds: ['continuation'], render })
  if (pages <= 9) assert.equal((await replay()).pageCount, pages, 'ceilings never pad short papers')
  else await assert.rejects(replay, error => error.code === 'PAPER_FIXED_PAGE_IMPOSSIBLE')
  if (pages === 9) await assert.rejects(() => renderExplicitStudentProductPdf(html, {
    edition: 'economy8', layout: nineLayout, plannedBreakGroupIds: ['continuation'], render,
  }), error => error.code === 'PAPER_FIXED_PAGE_IMPOSSIBLE', 'absent opt-in remains exactly eight pages')
}
const initialized = await renderExplicitStudentProductPdf(html, {
  edition: 'economy8', economyPageLimit: 9, layout: nineLayout, plannedBreakGroupIds: ['continuation'],
  restoreAnswerBoxes: true, render: async source => {
    const sizes = geometry(source)
    assert.equal(sizes.font, 10.5)
    assert.match(source, /Both supplied starters/)
    return { pageCount: sizes.application <= 43 ? 9 : 10, inspection }
  },
})
assert.deepEqual(initialized.layout.answerBoxHeightsMm, { application: 43, continuation: 57 },
  'new explicit initialization restores answer space without changing its font or breaks')
assert.deepEqual(initialized.plannedBreakGroupIds, ['continuation'])
assert.ok(initialized.searchedCandidates <= 16)

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
const coverLiftProfile = 'student-friendly-cover-lift-v2'
const drawingHtml = html.replace('class="canonical-application-response"',
  'class="canonical-application-response" data-canonical-drawing-area-id="fixture-drawing"')
for (const edition of ['largeComplete', 'largeNoListening', 'economy8']) {
  const limit = studentProductPolicy(edition, edition === 'largeComplete' ? 2 : 0).targetPages
  for (const regularFits of [false, true]) {
    const seen = []
    const result = await planStudentProductPdf(html, { edition, render: async source => {
      const lifted = source.includes(`data-pdf-student-product="${coverLiftProfile}"`)
      const sizes = geometry(source)
      seen.push({ lifted, ...sizes })
      return { pageCount: regularFits || (lifted && sizes.application <= 42) ? limit : limit + 1,
        inspection, pdfBytes: Buffer.from(source) }
    } })
    assert.equal(result.layout.profile, regularFits ? edition === 'economy8'
      ? 'student-friendly-economy-v2' : 'student-friendly-v1' : coverLiftProfile)
    assert.equal(seen.some(entry => entry.lifted), !regularFits)
    if (!regularFits) {
      const firstLift = seen.findIndex(entry => entry.lifted)
      const regular = seen.slice(0, firstLift)
      assert.ok(regular.length >= (edition === 'economy8' ? 10 : 5))
      assert.ok(regular.some(entry => entry.application === 24 && entry.continuation === 27))
      if (edition === 'economy8') assert.ok(regular.some(entry => entry.font === 10.5),
        'all ordinary font tiers precede even the large-font cover lift')
      assert.ok(seen.slice(firstLift).every(entry => entry.lifted))
      assert.deepEqual(result.layout.answerBoxHeightsMm, { application: 42, continuation: 57 })
      assert.equal(result.fontSizePt, 12)
      assert.equal(result.lineHeightPt, 19.5)
      assert.ok(seen.length - firstLift <= 27, 'fallback has its own bounded render reserve')
      const replay = await renderExplicitStudentProductPdf(html, { edition, layout: result.layout,
        plannedBreakGroupIds: result.plannedBreakGroupIds,
        render: async source => ({ pageCount: limit, inspection, pdfBytes: Buffer.from(source) }) })
      assert.deepEqual(replay.pdfBytes, result.pdfBytes, 'new saved profile replays exact HTML')
    }
    assert.equal(result.searchedCandidates, seen.length)
  }
  const failed = []
  await assert.rejects(() => planStudentProductPdf(html, { edition, render: async source => {
    failed.push(source)
    return { pageCount: limit + 1, inspection }
  } }), error => error.code === 'PAPER_FIXED_PAGE_IMPOSSIBLE')
  assert.ok(failed.some(source => source.includes(coverLiftProfile)), 'try fallback before failing closed')
  assert.ok(failed.length <= (edition === 'economy8' ? 60 : 30))
  for (const drawing of [false, true]) for (const failureMode of ['all-overflow', 'natural-overflow', 'break-overflow']) {
    let overflowCount = 0
    let measuredCount = 0
    let liftedCount = 0
    await assert.rejects(() => planStudentProductPdf(drawing ? drawingHtml : html, { edition, render: async source => {
      if (source.includes(coverLiftProfile)) {
        liftedCount += 1
        return { pageCount: limit, inspection }
      }
      const broken = /data-canonical-group-id="[^"]+" data-pdf-planned-break/.test(source)
      const overflow = failureMode === 'all-overflow'
        || (failureMode === 'natural-overflow' && !broken
          && geometry(source).application === (drawing ? 65 : 24)
          && (!drawing || source.includes('float:right!important')))
        || (failureMode === 'break-overflow' && broken)
      if (overflow) {
        overflowCount += 1
        throw Object.assign(new Error('atomic block or content overflows'), { code: 'PAPER_LAYOUT_OVERFLOW' })
      }
      measuredCount += 1
      // A shared starting page makes a semantic break a real search trial.
      return { pageCount: limit + 1, inspection: [inspection[0], {
        ...inspection[1], pages: [7, 8], continuationMaterialPages: [7, 8],
      }] }
    } }), error => error.code === 'PAPER_FIXED_PAGE_IMPOSSIBLE', `${edition}: drawing=${drawing}, ${failureMode}`)
    assert.ok(overflowCount > 0, `${failureMode} really exercises an unknown page count`)
    assert.equal(measuredCount > 0, failureMode !== 'all-overflow')
    assert.equal(liftedCount, 0, 'unknown ordinary results never authorize the cover lift')
  }
  for (const coverFits of [true, false]) {
    let lifted = 0
    const attempt = () => planStudentProductPdf(drawingHtml, { edition, render: async source => {
      assert.equal(geometry(source).application, 65, 'drawing-area boxes never enter a compressed trial')
      const cover = source.includes(coverLiftProfile)
      if (cover) lifted += 1
      return { pageCount: cover && coverFits ? limit : limit + 1, inspection }
    } })
    if (coverFits) {
      const selected = await attempt()
      assert.equal(selected.layout.profile, coverLiftProfile)
      assert.deepEqual(selected.layout.answerBoxHeightsMm, { application: 65, continuation: 57 })
    } else await assert.rejects(attempt, error => error.code === 'PAPER_FIXED_PAGE_IMPOSSIBLE')
    assert.ok(lifted > 0, 'a 65mm cover-lift seed remains reachable after all ordinary trials exceed the limit')
  }
  let invalidReplayRenders = 0
  await assert.rejects(() => renderExplicitStudentProductPdf(drawingHtml, {
    edition, layout: { ...layout, profile: coverLiftProfile, answerBoxHeightsMm: { application: 24, continuation: 27 } },
    plannedBreakGroupIds: [], render: async () => {
      invalidReplayRenders += 1
      return { pageCount: limit, inspection }
    },
  }), error => error.code === 'PAPER_LAYOUT_OVERFLOW')
  assert.equal(invalidReplayRenders, 0, 'undersized drawing-area replay fails before rendering')
}
// A content-integrity failure within the ceiling does not authorize moving the cover.
await assert.rejects(() => planStudentProductPdf(html, { edition: 'largeNoListening',
  render: async source => {
    assert.ok(!source.includes(coverLiftProfile))
    return { pageCount: 10, inspection: [inspection[0]] }
  },
}), error => error.code === 'PAPER_FIXED_PAGE_IMPOSSIBLE')
assert.deepEqual(validatePaperPaginationPlan({ ...plan, editions: { largeNoListening: {
  ...plan.editions.largeNoListening, layout: { ...layout, profile: coverLiftProfile },
} } }, identity).editions.largeNoListening.layout.profile, coverLiftProfile)
assert.throws(() => applyStudentProductLayout(html, {
  ...layout, profile: coverLiftProfile, figureLayout: 'float80',
}, 'largeNoListening'), /Invalid/)
try {
  const coverFixture = `<html><head><style>@page{size:A4;margin: 21mm 24mm 24mm 24mm;}
    body,p{margin:0}.canonical-paper-opening{margin-top:0}</style></head><body>
    <header class="canonical-paper-opening"><p>Source paper title</p><p>English</p></header>
    <section data-canonical-group-id="reading"><p class="canonical-reading-body">Unchanged body text.</p>
    <img alt="Source illustration" style="width:120px;height:60px" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='60'%3E%3Crect width='120' height='60' fill='black'/%3E%3C/svg%3E"></section></body></html>`
  const coverGeometry = async profile => (await renderPaginatedPaper(
    applyStudentProductLayout(coverFixture, { ...layout, profile }, 'largeNoListening'), {
      inspect: page => page.evaluate(() => {
        const root = document.querySelector('.pagedjs_page_content')
        const opening = root.querySelector('.canonical-paper-opening')
        const text = root.querySelector('.canonical-reading-body')
        const image = root.querySelector('img').getBoundingClientRect()
        const type = getComputedStyle(text)
        return { openingTop: opening.getBoundingClientRect().top - root.getBoundingClientRect().top,
          openingHeight: opening.getBoundingClientRect().height,
          font: type.fontSize, lineHeight: type.lineHeight, image: [image.width, image.height] }
      }),
    })).inspection
  const ordinaryGeometry = await coverGeometry(layout.profile)
  const liftedGeometry = await coverGeometry(coverLiftProfile)
  assert.ok(Math.abs(ordinaryGeometry.openingTop - liftedGeometry.openingTop - 34) < 0.05,
    '25.5pt moves only the opening into the first-page margin')
  assert.deepEqual({ ...liftedGeometry, openingTop: ordinaryGeometry.openingTop }, ordinaryGeometry,
    'body typography, source image and cover height stay unchanged')
  // Legacy source markers must be measured, never inferred from answer pages
  // or another writing family's opaque source. A forced split stays rejected.
  for (const split of [false, true]) {
    const source = `<html><head><style>@page{size:A4;margin: 21mm 24mm 24mm 24mm;}
      body{margin:0}.new-page{break-before:page}</style></head><body>
      <section data-canonical-group-id="application" data-canonical-group-type="writing">
        <div class="canonical-application-writing" data-canonical-writing-mode="legacy_opaque">
          <div class="canonical-application-prompt canonical-legacy-opaque-source">Application source is not continuation material.</div>
          <div class="canonical-application-response">Application answer space</div>
        </div></section>
      <section data-canonical-group-id="continuation" data-canonical-group-type="continuation">
        <div class="canonical-continuation-writing" data-canonical-writing-mode="legacy_opaque">
          <div class="canonical-legacy-opaque-source">Exact retained continuation material.</div>
          <div class="canonical-continuation-response${split ? ' new-page' : ''}">Supplied starters</div>
        </div></section></body></html>`
    const actual = await renderPaginatedPaper(applyStudentProductLayout(source, layout, 'largeNoListening'), { inspect: inspectGroups })
    const continuation = actual.inspection.find(group => group.id === 'continuation')
    assert.deepEqual(continuation.continuationMaterialPages, [1])
    assert.deepEqual(continuation.continuationAnswerPages, [split ? 2 : 1])
    assert.equal(actual.inspection.find(group => group.id === 'application').continuationMaterialPages, undefined)
    const replay = () => renderExplicitStudentProductPdf(source, { edition: 'largeNoListening', layout,
      plannedBreakGroupIds: [], render: async () => actual })
    if (split) await assert.rejects(replay, error => error.code === 'PAPER_FIXED_PAGE_IMPOSSIBLE')
    else assert.equal((await replay()).pageCount, 1)
  }
  const economyLayout = { ...layout, profile: 'student-friendly-economy-v2', fontSizePt: 10.5 }
  assert.throws(() => applyStudentProductLayout(html, { ...economyLayout, fontSizePt: 12 }, 'largeNoListening'), /Invalid/)
  const balanceHtml = body => `<html><head><style>@page{size:A4;margin: 21mm 24mm 24mm 24mm;}
    body{margin:0}p,.section-header,.question-group{margin:0}
    .question-group{break-inside:avoid}
    .forced-start{break-before:page}
    </style></head><body>${body}</body></html>`
  const inspectBalance = page => page.evaluate(() => {
    const pages = [...document.querySelectorAll('.pagedjs_page')]
    return [...document.querySelectorAll('.pagedjs_pages .section-header,.pagedjs_pages .reading-meta-instruction,.pagedjs_pages section[data-canonical-group-id]')].map(node => {
      const page = node.closest('.pagedjs_page')
      const rect = node.getBoundingClientRect()
      const area = page.querySelector('.pagedjs_area').getBoundingClientRect()
      return { id: node.getAttribute('data-canonical-group-id') || node.textContent.trim(),
        page: pages.indexOf(page) + 1, top: rect.top - area.top, bottomSpace: area.bottom - rect.bottom,
        offsetPt: Number(node.getAttribute('data-pdf-vertical-offset-pt') || 0),
        height: rect.height, lineHeight: parseFloat(getComputedStyle(node).lineHeight) }
    })
  })
  const orphanFixture = height => balanceHtml(`<section class="question-group" data-canonical-group-id="previous" style="height:240mm">Previous question</section>
    <h2 class="section-header">Section two</h2><p class="reading-meta-instruction">Instruction</p>
    <section class="question-group" data-canonical-group-id="target" style="height:${height}mm">Complete question and options</section>`)
  for (const height of [100, 230]) {
    const old = await renderPaginatedPaper(applyStudentProductLayout(orphanFixture(height), { ...layout, fontSizePt: 10.5 }, 'economy8'), { inspect: inspectBalance })
    const actual = await renderPaginatedPaper(applyStudentProductLayout(orphanFixture(height), economyLayout, 'economy8'), { inspect: inspectBalance })
    const byId = result => Object.fromEntries(result.inspection.map(entry => [entry.id, entry]))
    const before = byId(old)
    const after = byId(actual)
    assert.equal(before['Section two'].page, 1, 'fixture must really orphan the heading')
    assert.equal(before.target.page, 2)
    assert.equal(actual.pageCount, old.pageCount, 'never add pages to keep chrome together')
    assert.equal(after['Section two'].page, height === 100 ? 2 : 1, 'only the loose page takes its heading back')
    assert.equal(after.target.offsetPt, height === 100 ? 18 : 0)
    assert.equal(after.target.height, before.target.height, 'no internal stretching or compression')
    if (height === 100) {
      assert.equal(after['Section two'].offsetPt, after.target.offsetPt)
      assert.equal(after.Instruction.offsetPt, after.target.offsetPt)
      assert.ok(after.target.bottomSpace > 48)
    } else assert.deepEqual(actual.inspection, old.inspection, 'dense-page trial rolls back exactly')
  }
  // Independent A4 calculation, with a non-capped case and both sides of the
  // two-line threshold. Centering or a constant inset would fail these inputs.
  for (const height of [226, 239, 240]) {
    const actual = await renderPaginatedPaper(applyStudentProductLayout(balanceHtml(
      `<section class="question-group" data-canonical-group-id="target" style="height:${height}mm">Question</section>`,
    ), economyLayout, 'economy8'), { inspect: inspectBalance })
    const expectedPt = Math.max(0, Math.min(18, ((252 - height) * 72 / 25.4 - 36) / 4))
    assert.ok(Math.abs(actual.inspection[0].offsetPt - expectedPt) < 0.05)
    assert.equal(actual.pageCount, 1)
    assert.equal(actual.inspection[0].lineHeight, 24)
  }
  for (const body of [
    '<section class="question-group" data-canonical-group-id="a" style="height:100mm">First</section><section class="question-group" data-canonical-group-id="b" style="height:50mm">Second</section>',
    '<section class="question-group" data-canonical-group-id="a" style="height:100mm">Question</section><div class="writing-answer-box" style="height:100mm"></div>',
    `<section class="question-group" data-canonical-group-id="a">${'<p>Long question line</p>'.repeat(70)}</section>`,
    '<header>Paper opening</header><section class="question-group" data-canonical-group-id="a" style="height:100mm">Question</section>',
  ]) {
    const actual = await renderPaginatedPaper(applyStudentProductLayout(balanceHtml(body), economyLayout, 'economy8'), { inspect: inspectBalance })
    assert.ok(actual.inspection.every(entry => entry.offsetPt === 0), 'shared, occupied, split and opening pages stay put')
  }
  const blankPageFixture = balanceHtml('<h2 class="section-header">Only content on first page</h2><p class="reading-meta-instruction forced-start">Instruction</p><section class="question-group" data-canonical-group-id="a" style="height:100mm">Question</section>')
  const blankPage = await renderPaginatedPaper(applyStudentProductLayout(blankPageFixture, economyLayout, 'economy8'), { inspect: inspectBalance })
  assert.equal(blankPage.pageCount, 2)
  assert.equal(blankPage.inspection[0].page, 1, 'never leave a blank page by moving its only heading')
  assert.equal(blankPage.inspection.at(-1).page, 2)
  assert.ok(blankPage.inspection.every(entry => entry.offsetPt === 0))
  const measured = await renderPaginatedPaper(`<html><head><style>@page{size:A4;margin:20mm}body{margin:0;line-height:20px}</style></head><body>
    <section data-canonical-group-id="box" data-canonical-group-type="writing"><div class="canonical-continuation-response" style="height:180mm;border:1px solid">Starter</div></section></body></html>`, { inspect: inspectGroups })
  // 257mm usable height minus 180mm box and borders, not minus one ink line.
  assert.ok(measured.inspection[0].fragments[0].pageTailLines > 13)
  assert.ok(measured.inspection[0].fragments[0].pageTailLines < 16, 'empty response space must count as occupied')
  const paperLayoutCss = readFileSync(new URL('../shared/papersurface/paperLayout.css', import.meta.url), 'utf8')
  const readingLayoutCss = readFileSync(new URL('../shared/papersurface/readingLayout.css', import.meta.url), 'utf8')
  const fontRenderingCss = readFileSync(new URL('../shared/papersurface/fontRendering.css', import.meta.url), 'utf8')
  const fixture = `<html><head><style>${embeddedPaperFontCss()}</style><style>${paperLayoutCss}${readingLayoutCss}${fontRenderingCss}
    @page{size:A4;margin: 21mm 24mm 24mm 24mm;}
    body{font-family:'EQB Termes',serif}.canonical-reading-figure figcaption{font-size:9pt}
    .canonical-reading-table td{line-height:16pt}
    .canonical-options{display:grid;grid-template-columns:80px 180px;width:260px}
    .canonical-options>span{white-space:nowrap}
    </style></head><body class="paper-print"><p class="canonical-paper-mock-name">2026 Joint Examination</p>
    <div class="canonical-paper-cover-title">English</div>
    <div class="canonical-paper-cover-notices">Administrative notices</div>
    <section class="question-group" data-canonical-group-type="reading"><figure class="canonical-reading-figure"><figcaption>Source caption</figcaption></figure>
    <table class="canonical-reading-table" style="width:400px"><tr><td><span data-canonical-content-node-id="table-title">Festival title
</span><span data-canonical-content-node-id="table-body">Separate body paragraph.</span></td></tr></table>
    <div class="canonical-options"><span>A. This option does not fit its narrow cell</span><span>B. Short</span></div>
    <div class="canonical-options" data-gutter-regression style="width:438.2pt;grid-template-columns:208pt 230.2pt"><span>A. Short</span><span>B. Short</span><span>C. To compare different publishing houses.</span><span>D. Short</span></div>
    <div class="canonical-options" data-twip-rounding-regression style="width:438.2pt;grid-template-columns:218.55pt 219.65pt"><span><span>A.</span> <span>It mainly helps the tech-skilled.</span></span><span><span>B.</span> <span>Its negatives may outweigh positives.</span></span><span><span>C.</span> <span>It can hurt or improve work and well-being.</span></span><span><span>D.</span> <span>It often lowers productivity and satisfaction.</span></span></div>
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
          mockName: type('.canonical-paper-mock-name'), subject: type('.canonical-paper-cover-title'),
          single: root.querySelector('.canonical-options').hasAttribute('data-pdf-single-column'),
          gutterSingle: root.querySelector('[data-gutter-regression]').hasAttribute('data-pdf-single-column'),
          roundingSingle: root.querySelector('[data-twip-rounding-regression]').hasAttribute('data-pdf-single-column'),
          tableParagraphOffset: root.querySelector('td span:last-child').getBoundingClientRect().top
            - root.querySelector('td span:first-child').getBoundingClientRect().top,
          notices: getComputedStyle(root.querySelector('.canonical-paper-cover-notices')).display }
      }),
    })
    const expected = fontSizePt === 12 ? [16, 26] : [14, 24]
    assert.deepEqual(actual.inspection.caption, expected)
    assert.deepEqual(actual.inspection.table, expected)
    assert.deepEqual(actual.inspection.mockName, [24, 36], '18pt/27pt name stays independent of both body tiers')
    assert.ok(Math.abs(actual.inspection.subject[0] - 80 / 3) < 0.001, 'subject stays 20pt')
    assert.equal(actual.inspection.single, true)
    assert.equal(actual.inspection.gutterSingle, fontSizePt === 12,
      'a fitting cell still needs the inter-option gutter; the smaller tier retains its valid columns')
    assert.equal(actual.inspection.roundingSingle, fontSizePt === 12,
      'sub-twip browser rounding must not reject a safe source-authority column layout')
    assert.ok(actual.inspection.tableParagraphOffset > 20,
      'an explicit source table paragraph break must survive rendering, not become titlebody')
    assert.equal(actual.inspection.notices, 'none')
    assert.equal(actual.pageCount, 1)
  }
  await assert.rejects(() => renderPaginatedPaper(applyStudentProductLayout(
    fixture.replace('This option does not fit its narrow cell', 'W'.repeat(100)), layout, 'economy8',
  )), error => error.code === 'PAPER_LAYOUT_OVERFLOW', 'unbreakable text must fail, not be arbitrarily split or clipped')
} finally { await closeChromiumPool() }
console.log('PASS student products: large-first fallback, height restoration, ceilings, historical replay, loose-page-only balance and fail-closed content')
