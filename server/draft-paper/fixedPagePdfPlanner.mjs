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

export function fixedPageLayoutPolicy(pageLayout, listeningGroupCount, sourceHasListening = listeningGroupCount === 2) {
  if (pageLayout === 'friendly8') return { targetPages: 8, includeListening: false, omitCover: sourceHasListening }
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
// Eight-page papers start compact to give Reading A more of page one. Ten-page
// papers try title-up before reducing the lower gap. These are sample bounds,
// not measured golden margins. Natural Screen/Print and body geometry are untouched.
export async function planFixedPagePdf(html, { targetPages, omitCover = false, render }) {
  if (omitCover && targetPages !== 8) throw new Error('Only the eight-page listening-excluded edition may omit its cover')
  if (omitCover) html = html.replace('</head>', '<style data-pdf-omit-cover>.canonical-paper-opening{display:none}</style></head>')
  const coverGaps = html.includes('data-canonical-paper-opening')
    && !omitCover ? (targetPages === 8 ? [[0, 18]] : [[72, 72], [54, 72], [54, 54]]) : [null]
  let searchedCandidates = 0
  let lastFailure
  let bestFit
  const attempts = [true, ...(targetPages === 10 ? [false] : [])]
    .flatMap((keepOptionBank) => coverGaps.map((gaps) => ({ gaps, keepOptionBank })))
  for (const [attemptIndex, { gaps, keepOptionBank }] of attempts.entries()) {
    // Exact pages outrank whole-bank preference, but never split an individual
    // question/option to recover space. Do not relax a successful protected plan.
    if (!keepOptionBank && bestFit) return { ...bestFit, searchedCandidates }
    let candidate = gaps && (gaps[0] !== 72 || gaps[1] !== 72)
      ? html.replace('</head>', `<style data-pdf-cover-adjustment>.canonical-paper-opening{--canonical-cover-page-top-to-title:${gaps[0]}pt;--canonical-cover-title-to-notices:${gaps[1]}pt}</style></head>`)
      : html
    if (!keepOptionBank) candidate = candidate.replace('</head>', '<style data-pdf-option-bank-fallback></style></head>')
    try {
      const result = await searchFixedPagePdf(candidate, {
        // Let the natural-flow search reach multi-break solutions; reserve at
        // least one render for each remaining cover/bank profile.
        targetPages, render, renderLimit: 24 - searchedCandidates - (attempts.length - attemptIndex - 1),
      })
      searchedCandidates += result.searchedCandidates
      const fit = { ...result, coverGapsPt: gaps }
      if (!bestFit || fit.layoutPenalty < bestFit.layoutPenalty) bestFit = fit
      if (!fit.layoutPenalty) return { ...fit, searchedCandidates }
    } catch (error) {
      if (error.code !== 'PAPER_FIXED_PAGE_IMPOSSIBLE' || !Number.isInteger(error.searchedCandidates)) throw error
      searchedCandidates += error.searchedCandidates
      lastFailure = error
    }
  }
  if (bestFit) return { ...bestFit, searchedCandidates }
  if (coverGaps.length === 1) throw Object.assign(lastFailure, { searchedCandidates })
  throw impossible(`在 ${searchedCandidates} 个候选及允许的卷首留白范围内，有界搜索未找到 ${targetPages} 页的排版`, {
    actualPages: lastFailure.actualPages, targetPages, searchedCandidates,
  })
}

async function searchFixedPagePdf(html, { targetPages, render, renderLimit }) {
  if (![8, 10].includes(targetPages)) throw new Error('targetPages must be 8 or 10')
  const renderPlan = (breaks) => render(applyPlannedGroupBreaks(html, breaks), { inspect: inspectGroups })
  const natural = await renderPlan([])
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
    let sharedPages = 0
    for (let index = 1; index < result.inspection.length; index += 1) {
      const previous = result.inspection[index - 1]
      const group = result.inspection[index]
      if (previous.type === 'grammarFill' && group.type === 'writing') continue
      if (substantialPages(previous).some((page) => substantialPages(group).includes(page))) sharedPages += 1
    }
    const layoutPenalty = failures.length + (targetPages === 8 ? splitIds.length * 10 + sharedPages : 0)
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
  // If A overruns, search local break removals without discarding later starts.
  const idealBreaks = targetPages === 8 ? natural.inspection.slice(1).filter((group, index) =>
    !(group.type === 'writing' && natural.inspection[index].type === 'grammarFill'))
    .map(({ id }) => id) : []
  if (idealBreaks.length) {
    const result = await renderPlan(idealBreaks)
    const summary = summarize(result)
    seen.add(idealBreaks.join('\u0000'))
    retain(result, idealBreaks, summary)
    if (bestFit?.layoutPenalty === 0) {
      return { ...bestFit, searchedCandidates: seen.size }
    }
    queue.push({ breaks: idealBreaks, summary })
    // An overlong A can make the ideal plan nine pages. Try local merges from
    // that plan before exact-count natural-flow siblings consume the budget.
    if (targetPages === 8 && result.pageCount > targetPages) {
      for (const id of idealBreaks) {
        if (seen.size >= maxRenders) break
        const breaks = idealBreaks.filter((candidate) => candidate !== id)
        const key = breaks.join('\u0000')
        if (seen.has(key)) continue
        seen.add(key)
        const merged = await renderPlan(breaks)
        const mergedSummary = summarize(merged)
        retain(merged, breaks, mergedSummary)
        if (bestFit?.layoutPenalty === 0) return { ...bestFit, searchedCandidates: seen.size }
        queue.push({ breaks, summary: mergedSummary })
      }
    }
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
