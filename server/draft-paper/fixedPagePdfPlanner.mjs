// Fixed-page export owns pagination hints, including old source/author breaks.
// Explicitly clear both break properties: Paged.js still reads them on hidden nodes.
const PLANNED_BREAK_STYLE = `<style data-pdf-planned-break>
.page-break{break-before:auto!important;page-break-before:auto!important}
.canonical-listening-chrome{break-inside:avoid;page-break-inside:avoid}
.canonical-option-bank-item{break-inside:avoid;page-break-inside:avoid}
.canonical-listening-chrome,.canonical-listening-segment-cue,.reading-meta-instruction{break-after:avoid}
.question[data-canonical-reading-last-question-for]{break-after:auto}
[data-pdf-planned-break]{break-before:page!important;page-break-before:always!important}
</style>`

// Shared by automatic planning and the import QA plan validator. These are
// bounded product choices, not physical measurements inferred from cropped goldens.
// A negative first value moves only the opening into the 21mm top margin:
// -25.5pt leaves approximately 12mm to the paper edge, without shrinking body text.
export const FIXED_PAGE_COVER_GAPS_PT = [[72, 72], [54, 72], [54, 54], [18, 36], [0, 18], [-25.5, 18]]

export function fixedPageLayoutPolicy(pageLayout, listeningGroupCount) {
  if (pageLayout === 'friendly8') return { targetPages: 8, includeListening: false, omitCover: false }
  if (pageLayout === 'friendly10') {
    if (listeningGroupCount !== 2) throw new Error('10 页友好版需要完整的两个听力题组；请选择 8 页无听力版')
    return { targetPages: 10, includeListening: true, omitCover: false }
  }
  throw new Error('pageLayout is invalid')
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function applyPlannedGroupBreaks(html, groupIds) {
  const bankBreak = html.includes('data-pdf-option-bank-fallback') ? 'auto' : 'avoid'
  const bankStyle = `<style>.canonical-option-bank-region{break-inside:${bankBreak};page-break-inside:${bankBreak}}</style>`
  let planned = html.replace('</head>', `${PLANNED_BREAK_STYLE}${bankStyle}</head>`)
  for (const groupId of groupIds) {
    const pattern = new RegExp(`(<section\\b[^>]*data-canonical-group-id="${escapeRegExp(groupId)}"[^>]*)(>)`)
    if (!pattern.test(planned)) {
      throw Object.assign(new Error(`无法定位题组 ${groupId} 的 PDF 分页锚点`), { code: 'PAPER_FIXED_PAGE_IMPOSSIBLE' })
    }
    planned = planned.replace(pattern, '$1 data-pdf-planned-break$2')
  }
  return planned
}

function applyFixedCover(html, { targetPages, omitCover, coverGapsPt }) {
  if (omitCover && targetPages !== 8) throw new Error('Only the eight-page listening-excluded edition may omit its cover')
  if (omitCover) return html.replace('</head>', '<style data-pdf-omit-cover>.canonical-paper-opening{display:none}</style></head>')
  if (coverGapsPt && (coverGapsPt[0] !== 72 || coverGapsPt[1] !== 72)) {
    const lift = coverGapsPt[0] < 0 ? `margin-top:${coverGapsPt[0]}pt;` : ''
    return html.replace('</head>', `<style data-pdf-cover-adjustment>.canonical-paper-opening{${lift}--canonical-cover-page-top-to-title:${Math.max(0, coverGapsPt[0])}pt;--canonical-cover-title-to-notices:${coverGapsPt[1]}pt}</style></head>`)
  }
  return html
}

function inspectGroups(page) {
  return page.evaluate(() => {
    const groups = new Map()
    for (const element of document.querySelectorAll('.pagedjs_page [data-canonical-group-id]')) {
      const id = element.getAttribute('data-canonical-group-id')
      const pageElement = element.closest('.pagedjs_page')
      const pageNumber = [...pageElement.parentElement.children].indexOf(pageElement) + 1
      const rect = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      const lineHeight = Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.2 || 16
      const entry = groups.get(id) || {
        id, type: element.getAttribute('data-canonical-group-type'), pages: [], fragments: [], optionBankPages: [],
      }
      if (!entry.pages.includes(pageNumber)) entry.pages.push(pageNumber)
      if (element.querySelector('.canonical-option-bank-region') && !entry.optionBankPages.includes(pageNumber)) entry.optionBankPages.push(pageNumber)
      entry.fragments.push({ page: pageNumber, height: rect.height, lineHeight })
      groups.set(id, entry)
    }
    return [...groups.values()]
  })
}

function faceBoundaryFailures(groups) {
  return groups.filter(({ type, pages, fragments = [] }) => type !== 'listening' && pages.some((page, index) => {
    if (!(index < pages.length - 1 && page % 2 === 0 && pages[index + 1] === page + 1)) return false
    const opening = fragments.find((fragment) => fragment.page === page)
    // A heading or one/two lines at the bottom of a face is not a meaningful
    // cross-face split. Measurements are from the actual Paged DOM, rather
    // than inferred source rows.
    return !opening || opening.height > opening.lineHeight * 2.5
  }))
}

function impossible(message, details = {}) {
  return Object.assign(new Error(`无法生成指定页数的友好 PDF：${message}。正文版式未压缩；请使用普通 PDF 查看具体分页，不必删改试题或打乱原顺序。`), {
    code: 'PAPER_FIXED_PAGE_IMPOSSIBLE',
    ...details,
  })
}

// Fixed-page export is deliberately a separate render path. It never reads or
// writes the natural preview cache. Typography and answer geometry remain the
// print renderer's fixed values; this planner only tries semantic group starts.
// Compare natural flow at every cover profile before spending the remaining
// budget on group breaks. Natural Screen/Print and body geometry are untouched.
export async function planFixedPagePdf(html, { targetPages, omitCover = false, render }) {
  if (omitCover && targetPages !== 8) throw new Error('Only the eight-page listening-excluded edition may omit its cover')
  if (omitCover) html = html.replace('</head>', '<style data-pdf-omit-cover>.canonical-paper-opening{display:none}</style></head>')
  const coverGaps = html.includes('data-canonical-paper-opening')
    && !omitCover ? FIXED_PAGE_COVER_GAPS_PT : [null]
  let searchedCandidates = 0
  let lastFailure
  let bestFit
  for (const keepOptionBank of [true, false]) {
    // Whole-bank preservation outranks a prettier boundary; relax only when
    // no exact-count protected plan exists. Cache just these bounded baselines.
    if (!keepOptionBank && bestFit) break
    const baselines = []
    for (const gaps of coverGaps) {
      let candidate = applyFixedCover(html, { targetPages, omitCover: false, coverGapsPt: gaps })
      if (!keepOptionBank) candidate = candidate.replace('</head>', '<style data-pdf-option-bank-fallback></style></head>')
      const natural = await render(applyPlannedGroupBreaks(candidate, []), { inspect: inspectGroups })
      searchedCandidates += 1
      const result = await searchFixedPagePdf(candidate, { targetPages, render, renderLimit: 1, natural })
        .catch((error) => { if (error.code !== 'PAPER_FIXED_PAGE_IMPOSSIBLE') throw error; lastFailure = error; return null })
      if (result) {
        const fit = { ...result, coverGapsPt: gaps, allowSplitOptionBank: !keepOptionBank }
        if (!bestFit || fit.layoutPenalty < bestFit.layoutPenalty) bestFit = fit
        if (!fit.layoutPenalty) return { ...fit, searchedCandidates }
      }
      baselines.push({ gaps, candidate, natural, penalty: result?.layoutPenalty ?? 0 })
    }
    baselines.sort((a, b) => Math.abs(a.natural.pageCount - targetPages) - Math.abs(b.natural.pageCount - targetPages)
      || a.penalty - b.penalty)
    for (const [index, { gaps, candidate, natural }] of baselines.entries()) {
      // Once an exact-count fit exists the fallback cannot run; spend its
      // unused reservation on improving that fit instead of stopping early.
      const reserved = keepOptionBank && !bestFit ? coverGaps.length : 0
      const remainingProfiles = baselines.length - index - 1
      const renderLimit = 1 + Math.max(0, 24 - searchedCandidates - reserved - remainingProfiles)
      if (renderLimit === 1) continue
      try {
        const result = await searchFixedPagePdf(candidate, { targetPages, render, renderLimit, natural })
        searchedCandidates += result.searchedCandidates - 1
        const fit = { ...result, coverGapsPt: gaps, allowSplitOptionBank: !keepOptionBank }
        if (!bestFit || fit.layoutPenalty < bestFit.layoutPenalty
          || (fit.layoutPenalty === bestFit.layoutPenalty && fit.plannedBreakGroupIds.length < bestFit.plannedBreakGroupIds.length)) bestFit = fit
        if (!fit.layoutPenalty) return { ...bestFit, searchedCandidates }
      } catch (error) {
        if (error.code !== 'PAPER_FIXED_PAGE_IMPOSSIBLE' || !Number.isInteger(error.searchedCandidates)) throw error
        searchedCandidates += error.searchedCandidates - 1
        lastFailure = error
      }
    }
  }
  if (bestFit) return { ...bestFit, searchedCandidates }
  if (coverGaps.length === 1) throw Object.assign(lastFailure, { searchedCandidates })
  throw impossible(`在 ${searchedCandidates} 个候选及允许的卷首留白范围内，有界搜索未找到 ${targetPages} 页的排版`, {
    actualPages: lastFailure.actualPages, targetPages, searchedCandidates,
  })
}

export async function renderExplicitFixedPagePdf(html, {
  targetPages,
  omitCover = false,
  coverGapsPt = null,
  allowSplitOptionBank = false,
  plannedBreakGroupIds,
  render,
}) {
  if (typeof allowSplitOptionBank !== 'boolean') throw new Error('allowSplitOptionBank must be boolean')
  let candidate = applyFixedCover(html, { targetPages, omitCover, coverGapsPt })
  if (allowSplitOptionBank) {
    candidate = candidate.replace('</head>', '<style data-pdf-option-bank-fallback></style></head>')
  }
  candidate = applyPlannedGroupBreaks(candidate, plannedBreakGroupIds)
  const result = await render(candidate, { inspect: inspectGroups })
  if (result.pageCount !== targetPages) {
    throw impossible(`已审核分页方案实际生成 ${result.pageCount} 页，而不是 ${targetPages} 页`, {
      actualPages: result.pageCount,
      targetPages,
      searchedCandidates: 1,
    })
  }
  const failures = faceBoundaryFailures(result.inspection)
  return {
    ...result,
    plannedBreakGroupIds: [...plannedBreakGroupIds],
    coverGapsPt,
    allowSplitOptionBank,
    crossingGroupIds: failures.map(({ id }) => id),
    splitGroupIds: result.inspection.filter(({ pages }) => pages.length > 1).map(({ id }) => id),
    splitOptionBankCount: result.inspection.filter((group) => group.optionBankPages?.length > 1).length,
    searchedCandidates: 1,
    explicitPlan: true,
  }
}

export async function renderDiagnosticFixedPagePdf(html, {
  targetPages,
  omitCover = false,
  coverGapsPt = null,
  render,
}) {
  const candidate = applyPlannedGroupBreaks(
    applyFixedCover(html, { targetPages, omitCover, coverGapsPt }),
    [],
  )
  return render(candidate, { inspect: inspectGroups })
}

async function searchFixedPagePdf(html, { targetPages, render, renderLimit, natural }) {
  if (![8, 10].includes(targetPages)) throw new Error('targetPages must be 8 or 10')
  const renderPlan = (breaks) => render(applyPlannedGroupBreaks(html, breaks), { inspect: inspectGroups })
  const candidates = natural.inspection.slice(1).map(({ id }) => id)
  // A real render creates both a complete paginated HTML document and PDF.
  // Keep the search small, and retain neither artifact for unsuccessful
  // candidates. Twenty-four serial renders is an explicit worst-case bound,
  // rather than the former 256-render powerset walk.
  const maxRenders = Math.min(renderLimit, 1 + candidates.length * 2)
  const queue = [{ breaks: [], summary: summarize(natural) }]
  const seen = new Set([''])
  let bestFit

  function summarize(result) {
    const failures = faceBoundaryFailures(result.inspection)
    // Whole-group page rhythm is an eight-page objective, not a hard ban on
    // long A passages. A tiny opening at the foot of a page remains acceptable.
    const substantialPages = (group) => group.pages.filter((page, index) => {
      const fragment = group.fragments?.find((entry) => entry.page === page)
      return index > 0 || !fragment || fragment.height > fragment.lineHeight * 2.5
    })
    const splitIds = result.inspection.filter((group) => substantialPages(group).length > 1).map(({ id }) => id)
    // Measure content outside the group's main page in line-height units.
    // A 29+6 split costs less than 20+15, without another render or text parsing.
    // Listening follows its existing natural-flow/segment protection rules.
    const scatteredLines = result.inspection.reduce((total, group) => {
      const pages = substantialPages(group)
      if (group.type === 'listening' || pages.length < 2) return total
      const fragments = pages.map(page => group.fragments?.find(entry => entry.page === page))
      // Retain the former split cost for callers without complete measurements.
      if (fragments.some(fragment => !fragment)) return total + 10
      const lines = fragments.map(fragment => fragment.height / fragment.lineHeight)
      return total + lines.reduce((sum, height) => sum + height, 0) - Math.max(...lines)
    }, 0)
    let sharedPages = 0
    for (let index = 1; index < result.inspection.length; index += 1) {
      const previous = result.inspection[index - 1]
      const group = result.inspection[index]
      if (previous.type === 'grammarFill' && group.type === 'writing') continue
      if (substantialPages(previous).some((page) => substantialPages(group).includes(page))) sharedPages += 1
    }
    const layoutPenalty = failures.length + scatteredLines + (targetPages === 8 ? sharedPages : 0)
    return {
      pageCount: result.pageCount,
      failureIds: failures.map(({ id }) => id),
      splitIds,
      separateStartIds: result.inspection.slice(1).filter((group, index) =>
        result.inspection[index].pages.at(-1) !== group.pages[0]).map(({ id }) => id),
      layoutPenalty,
      score: Math.abs(targetPages - result.pageCount) * 1000 + layoutPenalty,
    }
  }

  function retain(result, breaks, summary) {
    if (result.pageCount === targetPages && (!bestFit || summary.layoutPenalty < bestFit.layoutPenalty
      || (summary.layoutPenalty === bestFit.layoutPenalty && breaks.length < bestFit.plannedBreakGroupIds.length))) {
      bestFit = { ...result, plannedBreakGroupIds: breaks, crossingGroupIds: summary.failureIds,
        splitGroupIds: summary.splitIds, layoutPenalty: summary.layoutPenalty,
        splitOptionBankCount: result.inspection.filter((group) => group.optionBankPages?.length > 1).length }
    }
  }
  retain(natural, [], queue[0].summary)
  if (bestFit?.layoutPenalty === 0) {
    return { ...bestFit, searchedCandidates: 1 }
  }

  // Nine groups / eight pages: grammar and application share by default.
  // Queue this seed too; the common search can remove breaks if A overruns.
  const idealBreaks = targetPages === 8 ? natural.inspection.slice(1).filter((group, index) =>
    !(group.type === 'writing' && natural.inspection[index].type === 'grammarFill'))
    .map(({ id }) => id) : []
  if (idealBreaks.length && seen.size < maxRenders) {
    const result = await renderPlan(idealBreaks)
    const summary = summarize(result)
    seen.add(idealBreaks.join('\u0000'))
    retain(result, idealBreaks, summary)
    if (bestFit?.layoutPenalty === 0) {
      return { ...bestFit, searchedCandidates: seen.size }
    }
    queue.push({ breaks: idealBreaks, summary })
  }

  // Best-first semantic search. A candidate which fixes a cross-face split is
  // tried first; page-distance then chooses which compact state to expand.
  // Same-count redistributions remain searchable. Only summaries are queued.
  while (queue.length && seen.size < maxRenders) {
    queue.sort((a, b) => a.summary.score - b.summary.score || a.breaks.length - b.breaks.length)
    const state = queue.shift()
    const crossing = new Set(targetPages === 8 ? state.summary.splitIds : state.summary.failureIds)
    // A group already beginning after the previous group's last page gains
    // nothing from another break. Avoid spending the bounded search on these
    // no-op starts; existing breaks remain removable for compacting a plan.
    const remaining = candidates.filter((id) => state.breaks.includes(id)
      || !state.summary.separateStartIds.includes(id)).sort((a, b) =>
      Number(crossing.has(b)) - Number(crossing.has(a)) || candidates.indexOf(a) - candidates.indexOf(b))
    // Follow a measured improvement immediately instead of spending the entire
    // budget on siblings; retained alternatives still cover a later dead end.
    for (const id of remaining) {
      if (seen.size >= maxRenders) break
      const breaks = (state.breaks.includes(id)
        ? state.breaks.filter((existing) => existing !== id)
        : [...state.breaks, id]).sort((a, b) => candidates.indexOf(a) - candidates.indexOf(b))
      const key = breaks.join('\u0000')
      if (seen.has(key)) continue
      seen.add(key)
      // eslint-disable-next-line no-await-in-loop -- resident Chromium serializes these measured candidates
      const result = await renderPlan(breaks)
      const summary = summarize(result)
      retain(result, breaks, summary)
      if (bestFit?.layoutPenalty === 0) {
        return { ...bestFit, searchedCandidates: seen.size }
      }
      queue.push({ breaks, summary })
      if (summary.score < state.summary.score) break
    }
  }
  if (bestFit) return { ...bestFit, searchedCandidates: seen.size }
  throw impossible(`在 ${seen.size} 个确定性候选内的有界搜索未找到 ${targetPages} 页的排版`, {
    actualPages: natural.pageCount,
    targetPages,
    searchedCandidates: seen.size,
  })
}
