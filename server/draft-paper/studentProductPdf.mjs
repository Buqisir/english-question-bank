import { applicationDrawingAreaPolicy } from '../../shared/paper-canonical/applicationDrawingArea.mjs'
import { applyPlannedGroupBreaks, inspectGroups, searchFixedPagePdf } from './fixedPagePdfPlanner.mjs'
import { finishPaginationTiming, timedCandidateRender } from './paginationTiming.mjs'

// Separate edition IDs preserve the meaning and digests of saved v1–v3 plans.
export const STUDENT_PRODUCT_EDITIONS = ['largeComplete', 'largeNoListening', 'economy8']
export const STUDENT_PRODUCT_PROFILE = 'student-friendly-v1'
const economyProfile = 'student-friendly-economy-v2'
const normalHeights = { application: 65, continuation: 57 }

export function studentProductPolicy(edition, listeningCount, { economyPageLimit = 8 } = {}) {
  if (!STUDENT_PRODUCT_EDITIONS.includes(edition)) throw new Error('Unknown student product')
  if (![8, 9].includes(economyPageLimit)) throw new Error('省纸版只支持默认八页或显式九页上限')
  if (edition === 'largeComplete' && listeningCount !== 2) {
    throw new Error('大字完整版需要完整的两个听力题组')
  }
  return { targetPages: edition === 'economy8' ? economyPageLimit : edition === 'largeComplete' ? 12 : 10,
    includeListening: edition === 'largeComplete', omitCover: false,
    atMost: edition !== 'economy8' || economyPageLimit === 9 }
}

export function validateStudentProductLayout(layout, edition) {
  const keys = ['profile', 'fontSizePt', 'figureLayout', 'answerBoxHeightsMm']
  if (!layout || Object.keys(layout).sort().join() !== keys.sort().join()
    || !(edition === 'economy8' ? [STUDENT_PRODUCT_PROFILE, economyProfile] : [STUDENT_PRODUCT_PROFILE]).includes(layout.profile)
    || !STUDENT_PRODUCT_EDITIONS.includes(edition)
    || !(edition === 'economy8' ? [12, 10.5] : [12]).includes(layout.fontSizePt)
    || !['natural', 'float80'].includes(layout.figureLayout)
    || !layout.answerBoxHeightsMm
    || Object.keys(layout.answerBoxHeightsMm).sort().join() !== 'application,continuation') {
    throw new Error('Invalid student product layout')
  }
  for (const [family, height] of Object.entries(layout.answerBoxHeightsMm)) {
    const minimum = family === 'application' ? 24 : layout.fontSizePt === 12 ? 27 : 24
    if (!Number.isInteger(height) || height < minimum || height > normalHeights[family]) {
      throw new Error('Student product answer height is outside its bounds')
    }
  }
}

export function applyStudentProductLayout(html, layout, edition) {
  validateStudentProductLayout(layout, edition)
  if (html.includes('data-canonical-drawing-area-id=')
    && layout.answerBoxHeightsMm.application < applicationDrawingAreaPolicy.minimumApplicationHeightMm) {
    throw Object.assign(new Error('带作图区的应用文必须保留标准答题框高度'), { code: 'PAPER_LAYOUT_OVERFLOW' })
  }
  const { fontSizePt, figureLayout, answerBoxHeightsMm } = layout
  const lineHeightPt = fontSizePt === 12 ? 19.5 : 18
  const margin = 'margin: 21mm 24mm 24mm 24mm;'
  if (html.split(margin).length !== 2 || html.split('</head>').length !== 2) {
    throw new Error('Student product requires the canonical A4 print geometry')
  }
  const css = `
.canonical-paper-cover-notices{display:none!important}
.canonical-paper-cover-title{margin-bottom:0!important}
body{--paper-seven-baseline:${lineHeightPt}pt;--paper-cloze-baseline:${lineHeightPt}pt;
--paper-grammar-fill-baseline:${lineHeightPt}pt;--paper-heading-size:${fontSizePt}pt;
--paper-heading-line-height:${lineHeightPt}pt;font-size:${fontSizePt}pt!important;line-height:${lineHeightPt}pt!important}
.section-header,.canonical-reading-body,.canonical-reading-title,
.canonical-reading-subtitle,.canonical-reading-passage-letter,
.canonical-reading-column-heading,.reading-meta-instruction,
.canonical-reading-figure figcaption,.canonical-reading-table td,.canonical-reading-table th,
.canonical-option-bank-region[data-canonical-bank-heading-state],
[data-canonical-writing-chrome-role],
.question-group .passage p,.question-group .stem,
.question-group .canonical-options,.question-group .canonical-options > span,
.question-group .options-inline,.question-group .question,
.canonical-option-bank-item,.canonical-option-bank-heading,
.canonical-application-prompt,.canonical-application-prompt > p,
.canonical-continuation-material,.canonical-continuation-material > p,
.canonical-application-given,.canonical-application-given p,.writing-starter-line,
.canonical-listening-chrome,.canonical-listening-chrome :is(h2,h3,p,span,div),
.canonical-listening-segment-cue,.options-grid--listening,.options-grid--listening > span
{font-size:${fontSizePt}pt!important;line-height:${lineHeightPt}pt!important}
.canonical-application-writing{break-inside:avoid;page-break-inside:avoid}
.canonical-application-response{height:${answerBoxHeightsMm.application}mm!important}
.canonical-continuation-response{height:${answerBoxHeightsMm.continuation}mm!important}
${answerBoxHeightsMm.continuation < 57 ? `
.canonical-continuation-response{display:grid!important;grid-template-rows:1fr 1fr!important;padding:3mm 0!important}
.canonical-continuation-response .writing-continuation-row{padding-top:0!important}
` : ''}
${figureLayout === 'float80' ? `
.canonical-application-prompt figure.canonical-reading-figure{float:right!important;width:min(100%,calc(var(--canonical-media-width-ratio) * 80cqw))!important;margin-left:8pt!important}
.canonical-application-prompt figure.canonical-reading-figure img{width:100%!important}
` : ''}
.canonical-options[data-pdf-single-column],.options-grid--listening[data-pdf-single-column]
{display:grid!important;grid-template-columns:minmax(0,1fr)!important;white-space:normal!important}
[data-pdf-single-column]>span{white-space:normal!important}
`
  return html.replace(margin, 'margin: 21mm 20mm 24mm 20mm;')
    .replace('</head>', `<style data-pdf-student-product="${layout.profile}"${layout.profile === economyProfile ? ' data-pdf-economy-balance="v1"' : ''}>${css}</style></head>`)
}

function acceptableWriting(result, html) {
  const application = result.inspection.filter(group => group.applicationPresent)
  const continuation = result.inspection.filter(group => group.continuationAnswerPages)
  const count = role => [...html.matchAll(new RegExp(`<div\\b[^>]*class="[^"]*\\b${role}\\b[^"]*"`, 'g'))].length
  if (application.length !== count('canonical-application-response')) return false
  if (continuation.length !== count('canonical-continuation-response')) return false
  return !result.inspection.some(group => (group.optionBankPages?.length ?? 0) > 1)
    && application.every(group => group.applicationPromptPages?.length === 1
      && group.applicationAnswerPages?.length === 1
      && group.applicationPromptPage === group.applicationAnswerPage)
    && continuation.every(group => group.continuationAnswerPages.length === 1
      && group.continuationMaterialPages?.at(-1) === group.continuationAnswerPages[0])
}

function impossible(edition, searchedCandidates, economyPageLimit = 8) {
  const economy = economyPageLimit === 9 ? '九页上限省纸版（五号）' : '八页省纸版（小四及五号）'
  return Object.assign(new Error(`未在有界搜索内找到合格的${edition === 'economy8' ? economy : '大字版'}；未删改正文或裁切答题框`), {
    code: 'PAPER_FIXED_PAGE_IMPOSSIBLE', searchedCandidates,
  })
}

async function restoreAnswerSpace(fit, layout, { measure, accept, canMeasure }) {
  // Restore the final box first; earlier compression must not leave a roomy
  // last page with minimal answer space. Measure every proposed height.
  for (const family of ['continuation', 'application']) {
    let low = layout.answerBoxHeightsMm[family] + 1
    let high = normalHeights[family]
    let tryNormal = true
    while (low <= high && canMeasure()) {
      const height = tryNormal ? high : Math.ceil((low + high) / 2)
      tryNormal = false
      const selected = { ...layout, answerBoxHeightsMm: { ...layout.answerBoxHeightsMm, [family]: height } }
      let measured
      try { measured = await measure(selected, fit.plannedBreakGroupIds) } catch (error) {
        if (error.code !== 'PAPER_LAYOUT_OVERFLOW') throw error
      }
      if (measured && accept(measured)) {
        fit = { ...fit, ...measured }
        layout = selected
        low = height + 1
      } else high = height - 1
    }
  }
  return { fit, layout }
}

export async function planStudentProductPdf(html, { edition, render, economyPageLimit = 8 }) {
  const policy = studentProductPolicy(edition, edition === 'largeComplete' ? 2 : 0, { economyPageLimit })
  const accept = result => acceptableWriting(result, html)
  const withinPages = result => policy.atMost ? result.pageCount <= policy.targetPages : result.pageCount === policy.targetPages
  const timed = timedCandidateRender(render, { edition, accepts: result => withinPages(result) && accept(result) })
  const fontSizes = edition === 'economy8' ? economyPageLimit === 9 ? [10.5] : [12, 10.5] : [12]
  const layoutFor = (fontSizePt, figureLayout, application, continuation) => ({
    profile: edition === 'economy8' ? economyProfile : STUDENT_PRODUCT_PROFILE, fontSizePt, figureLayout,
    answerBoxHeightsMm: { application, continuation } })
  let searchedCandidates = 0
  const measure = async (selected, breaks = []) => {
    searchedCandidates += 1
    return timed.measure(applyPlannedGroupBreaks(applyStudentProductLayout(html, selected, edition), breaks), { inspect: inspectGroups }, selected)
  }
  const fitProfile = async (layout, tierStart) => {
    let natural
    try { natural = await measure(layout) } catch (error) {
      if (error.code === 'PAPER_LAYOUT_OVERFLOW') return null
      throw error
    }
    // Semantic breaks can redistribute an overfull paper, but cannot justify
    // unbounded trial renders. Reserve room to restore both response boxes.
    let fit
    try {
      fit = await searchFixedPagePdf(applyStudentProductLayout(html, layout, edition), {
        ...policy, natural, accept, renderLimit: withinPages(natural) && accept(natural) ? 13 : 5,
        balanceWhitespace: policy.atMost,
        rejectOverflowCandidates: true,
        render: async (...args) => { searchedCandidates += 1; return timed.measure(...args, layout) },
      })
    } catch (error) {
      if (error.code === 'PAPER_FIXED_PAGE_IMPOSSIBLE' || error.code === 'PAPER_LAYOUT_OVERFLOW') return null
      throw error
    }
    ;({ fit, layout } = await restoreAnswerSpace(fit, layout, {
      measure, accept: result => withinPages(result) && accept(result),
      canMeasure: () => searchedCandidates - tierStart < 48,
    }))
    // Height restoration can change group fragments. Re-score its measured
    // result without another render, retaining the exact chosen breaks.
    const rescored = await searchFixedPagePdf(applyStudentProductLayout(html, layout, edition), {
      ...policy, natural: fit, accept, renderLimit: 1, render, balanceWhitespace: policy.atMost,
    })
    return { ...rescored, plannedBreakGroupIds: fit.plannedBreakGroupIds,
      edition, layout, fontSizePt: layout.fontSizePt, lineHeightPt: layout.fontSizePt === 12 ? 19.5 : 18,
      searchedCandidates, explicitPlan: false, timing: finishPaginationTiming(timed.timing) }
  }
  const triedHeights = new Map()
  for (const fontSizePt of fontSizes) {
    const tierStart = searchedCandidates
    const minimumContinuation = fontSizePt === 12 ? 27 : 24
    // Prefer full-size source media and normal answer space. Compact geometry
    // is a measured fallback, never the default carried over from a sample.
    const profiles = [
      ['natural', 65, 57], ['float80', 65, 57], ['natural', 65, minimumContinuation],
      ['float80', 65, minimumContinuation], ['float80', 24, minimumContinuation],
    ]
    triedHeights.set(fontSizePt, new Set(profiles.map(([, application, continuation]) => `${application}/${continuation}`)))
    for (const [figureLayout, application, continuation] of profiles) {
      if (html.includes('data-canonical-drawing-area-id=') && application < applicationDrawingAreaPolicy.minimumApplicationHeightMm) continue
      const planned = await fitProfile(layoutFor(fontSizePt, figureLayout, application, continuation), tierStart)
      if (planned) return planned
    }
  }
  // The compact profiles assume each box renders at its contract minimum. A box
  // whose own content needs more room (e.g. a two-line starter or a printed
  // salutation) overflows there, so every compact profile was skipped and no
  // intermediate height was ever measured. Only papers that would otherwise fail
  // reach this pass; it restarts from the smallest heights that actually render.
  for (const fontSizePt of fontSizes) {
    const tierStart = searchedCandidates
    const heights = {}
    for (const family of ['application', 'continuation']) {
      let low = family === 'application' ? 24 : fontSizePt === 12 ? 27 : 24
      let high = normalHeights[family]
      while (low < high) {
        const height = Math.floor((low + high) / 2)
        try {
          await measure(layoutFor(fontSizePt, 'natural', ...['application', 'continuation'].map(entry =>
            entry === family ? height : normalHeights[entry])))
          high = height
        } catch (error) {
          if (error.code !== 'PAPER_LAYOUT_OVERFLOW') throw error
          low = height + 1
        }
      }
      heights[family] = high
    }
    if (triedHeights.get(fontSizePt).has(`${heights.application}/${heights.continuation}`)) continue
    for (const figureLayout of ['natural', 'float80']) {
      const planned = await fitProfile(layoutFor(fontSizePt, figureLayout, heights.application, heights.continuation), tierStart)
      if (planned) return planned
    }
  }
  throw Object.assign(impossible(edition, searchedCandidates, economyPageLimit), { timing: finishPaginationTiming(timed.timing) })
}

export async function renderExplicitStudentProductPdf(html, {
  edition, layout, plannedBreakGroupIds, render, economyPageLimit = 8, restoreAnswerBoxes = false,
}) {
  const policy = studentProductPolicy(edition, edition === 'largeComplete' ? 2 : 0, { economyPageLimit })
  if (edition === 'economy8' && economyPageLimit === 9 && layout.fontSizePt !== 10.5) {
    throw new Error('九页上限省纸版须保持10.5pt正文及18pt行距')
  }
  let searchedCandidates = 0
  const timed = timedCandidateRender(render, { edition, accepts: result => accept(result) })
  const measure = (selected, breaks) => {
    searchedCandidates += 1
    return timed.measure(applyPlannedGroupBreaks(applyStudentProductLayout(html, selected, edition), breaks), { inspect: inspectGroups }, selected)
  }
  const accept = result => (policy.atMost ? result.pageCount <= policy.targetPages : result.pageCount === policy.targetPages)
    && acceptableWriting(result, html)
  let result = await measure(layout, plannedBreakGroupIds)
  if (!accept(result)) throw impossible(edition, searchedCandidates, economyPageLimit)
  if (restoreAnswerBoxes) {
    const restored = await restoreAnswerSpace({ ...result, plannedBreakGroupIds }, layout, {
      measure, accept, canMeasure: () => searchedCandidates < 16,
    })
    result = restored.fit
    layout = restored.layout
  }
  const summarized = await searchFixedPagePdf(applyStudentProductLayout(html, layout, edition), {
    ...policy, natural: result, renderLimit: 1, render, balanceWhitespace: policy.atMost,
  })
  return { ...summarized, edition, layout: structuredClone(layout), plannedBreakGroupIds,
    fontSizePt: layout.fontSizePt, lineHeightPt: layout.fontSizePt === 12 ? 19.5 : 18,
    searchedCandidates, explicitPlan: true, timing: finishPaginationTiming(timed.timing) }
}
