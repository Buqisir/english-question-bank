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

// Fixed PDF editions may trade blank writing space for page count. These are
// total box heights (the continuation box contains both starter rows).
export const FIXED_PAGE_ANSWER_HEIGHTS_MM = { application: [24, 65], continuation: [40, 57] }

export function validateAnswerBoxHeights(heights) {
  if (!heights || typeof heights !== 'object' || Array.isArray(heights)
    || !Object.keys(heights).length || Object.entries(heights).some(([family, height]) => {
      const range = FIXED_PAGE_ANSWER_HEIGHTS_MM[family]
      return !Object.hasOwn(FIXED_PAGE_ANSWER_HEIGHTS_MM, family)
        || !Number.isInteger(height) || height < range[0] || height > range[1]
    })) throw new Error('answerBoxHeightsMm is outside the fixed-edition bounds')
}

function applyAnswerBoxHeights(html, heights) {
  if (!heights) return html
  validateAnswerBoxHeights(heights)
  const css = Object.entries(heights).map(([family, height]) =>
    `.canonical-${family}-response{height:${height}mm!important}`).join('')
  return html.replace('</head>', `<style data-pdf-answer-box-heights>${css}</style></head>`)
}

function hasDetachedApplication(result) {
  return result.inspection.some(({ applicationPresent, applicationPromptPage, applicationAnswerPage }) =>
    (applicationPresent && (!Number.isInteger(applicationPromptPage) || !Number.isInteger(applicationAnswerPage)))
    || applicationAnswerPage !== applicationPromptPage)
}

function hasSplitApplication(result) {
  return result.inspection.some(({ applicationPromptPages, applicationAnswerPages }) =>
    (applicationPromptPages?.length ?? 0) > 1 || (applicationAnswerPages?.length ?? 0) > 1)
}

async function fitWritingSpace(html, { targetPages, natural, render, renderLimit }) {
  let result = natural
  let heights = {}
  let searchedCandidates = 0
  for (const [family, [minimum, maximum]] of Object.entries(FIXED_PAGE_ANSWER_HEIGHTS_MM)) {
    if (result.pageCount <= targetPages && !hasDetachedApplication(result)) break
    if (!new RegExp(`<[^>]+class="[^"]*\\bcanonical-${family}-response\\b`).test(html)) continue
    let low = minimum
    let high = maximum - 1
    let fit
    let smallestSafe
    // Largest whole-mm height that fits. Too-small content boxes are rejected
    // by the normal paginated overflow check, never clipped to meet the target.
    while (low <= high && searchedCandidates < renderLimit) {
      const height = Math.floor((low + high) / 2)
      const candidateHeights = { ...heights, [family]: height }
      let candidate
      searchedCandidates += 1
      try {
        candidate = await render(applyPlannedGroupBreaks(applyAnswerBoxHeights(html, candidateHeights), []), { inspect: inspectGroups })
      } catch (error) {
        if (error.code !== 'PAPER_LAYOUT_OVERFLOW') throw error
        low = height + 1
        continue
      }
      const measured = { result: candidate, heights: candidateHeights }
      if (!smallestSafe || height < smallestSafe.heights[family]) smallestSafe = measured
      if (candidate.pageCount <= targetPages && !hasDetachedApplication(candidate)) {
        fit = measured
        low = height + 1
      } else high = height - 1
    }
    const selected = fit || smallestSafe
    if (selected) ({ result, heights } = selected)
  }
  return { result, heights: Object.keys(heights).length ? heights : undefined, searchedCandidates }
}

export function fixedPageLayoutPolicy(pageLayout, listeningGroupCount) {
  if (pageLayout === 'friendly8') return { targetPages: 8, includeListening: false, omitCover: false }
  if (pageLayout === 'long10') return { targetPages: 10, includeListening: false, omitCover: false }
  if (pageLayout === 'friendly10') {
    if (listeningGroupCount !== 2) throw new Error('10 页友好版需要完整的两个听力题组；请选择 8 页无听力版')
    return { targetPages: 10, includeListening: true, omitCover: false }
  }
  if (pageLayout === 'long12') {
    if (listeningGroupCount !== 2) throw new Error('12 页长卷版需要完整的两个听力题组；请选择 10 页无听力长卷版')
    return { targetPages: 12, includeListening: true, omitCover: false }
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
  if (![8, 10, 12].includes(targetPages)) throw new Error('targetPages must be 8, 10 or 12')
  if (omitCover) return html.replace('</head>', '<style data-pdf-omit-cover>.canonical-paper-opening{display:none}</style></head>')
  if (coverGapsPt) {
    const lift = coverGapsPt[0] < 0 ? `margin-top:${coverGapsPt[0]}pt;` : ''
    return html.replace('</head>', `<style data-pdf-cover-adjustment>.canonical-paper-opening{${lift}--canonical-cover-page-top-to-title:${Math.max(0, coverGapsPt[0])}pt;--canonical-cover-title-to-notices:${coverGapsPt[1]}pt}</style></head>`)
  }
  return html
}

export function inspectGroups(page) {
  return page.evaluate(() => {
    const groups = new Map()
    const tails = new Map()
    for (const content of document.querySelectorAll('.pagedjs_page_content')) {
      const area = content.getBoundingClientRect()
      let bottom = area.top
      const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT)
      while (walker.nextNode()) {
        const node = walker.currentNode
        if (!node.textContent.trim() || node.parentElement.closest('style,script')) continue
        const range = document.createRange()
        range.selectNodeContents(node)
        for (const rect of range.getClientRects()) if (rect.width && rect.height) bottom = Math.max(bottom, rect.bottom)
      }
      // Writing space is occupied even when there is no ink inside the box.
      for (const node of content.querySelectorAll('img,svg,table,.canonical-application-response,.canonical-continuation-response')) {
        const rect = node.getBoundingClientRect()
        if (rect.width && rect.height) bottom = Math.max(bottom, rect.bottom)
      }
      tails.set(content.closest('.pagedjs_page'), Math.max(0, area.bottom - bottom))
    }
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
      if (element.querySelector('.canonical-application-writing')) entry.applicationPresent = true
      if (element.querySelector('.canonical-application-prompt')?.textContent.trim()) {
        entry.applicationPromptPages ||= []
        if (!entry.applicationPromptPages.includes(pageNumber)) entry.applicationPromptPages.push(pageNumber)
        entry.applicationPromptPage = pageNumber
      }
      if (element.querySelector('.canonical-application-response')) {
        entry.applicationAnswerPages ||= []
        if (!entry.applicationAnswerPages.includes(pageNumber)) entry.applicationAnswerPages.push(pageNumber)
        entry.applicationAnswerPage = pageNumber
      }
      if (element.querySelector('.canonical-continuation-material, .canonical-continuation-writing[data-canonical-writing-mode="legacy_opaque"] > .canonical-legacy-opaque-source')?.textContent.trim()) {
        entry.continuationMaterialPages ||= []
        if (!entry.continuationMaterialPages.includes(pageNumber)) entry.continuationMaterialPages.push(pageNumber)
      }
      if (element.querySelector('.canonical-continuation-response')) {
        entry.continuationAnswerPages ||= []
        if (!entry.continuationAnswerPages.includes(pageNumber)) entry.continuationAnswerPages.push(pageNumber)
      }
      entry.fragments.push({ page: pageNumber, height: rect.height, lineHeight,
        pageTailLines: (tails.get(pageElement) || 0) / lineHeight })
      groups.set(id, entry)
    }
    return [...groups.values()]
  })
}

function faceBoundaryFailures(groups) {
  return groups.filter(({ type, pages, fragments = [] }) => type !== 'listening' && pages.some((page, index) => {
    if (!(index < pages.length - 1 && page % 4 === 2 && pages[index + 1] === page + 1)) return false
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
// print renderer's values unless an overfull fixed edition needs less blank
// writing space; measured heights are returned for exact plan replay.
// Compare natural flow at every cover profile before spending the remaining
// budget on group breaks. Natural Screen/Print and body geometry are untouched.
export async function planFixedPagePdf(html, { targetPages, omitCover = false, render }) {
  if (![8, 10].includes(targetPages)) throw new Error('targetPages must be 8 or 10')
  if (omitCover) html = html.replace('</head>', '<style data-pdf-omit-cover>.canonical-paper-opening{display:none}</style></head>')
  // Eight pages prioritize usable first-page space. Try the tightest approved
  // cover before spending the bounded search on breaks or smaller answer boxes.
  // Ten pages and explicit saved plans retain their existing opening policy.
  const coverGaps = html.includes('data-canonical-paper-opening')
    && !omitCover ? (targetPages === 8 ? [...FIXED_PAGE_COVER_GAPS_PT].reverse() : FIXED_PAGE_COVER_GAPS_PT) : [null]
  let searchedCandidates = 0
  let lastFailure
  let bestFit
  let triedWritingSpace = false
  for (const keepOptionBank of [true, false]) {
    // Whole-bank preservation outranks a prettier boundary; relax only when
    // no exact-count protected plan exists. Cache just these bounded baselines.
    if (!keepOptionBank && bestFit) break
    const baselines = []
    const candidateForCover = (gaps, heights) => {
      let candidate = applyFixedCover(html, { targetPages, omitCover: false, coverGapsPt: gaps })
      if (!keepOptionBank) candidate = candidate.replace('</head>', '<style data-pdf-option-bank-fallback></style></head>')
      return applyAnswerBoxHeights(candidate, heights)
    }
    for (const gaps of coverGaps) {
      if (searchedCandidates >= 24) break
      const candidate = candidateForCover(gaps)
      searchedCandidates += 1
      let natural
      try {
        natural = await render(applyPlannedGroupBreaks(candidate, []), { inspect: inspectGroups })
      } catch (error) {
        if (bestFit && error.name === 'TimeoutError') return {
          ...bestFit, searchedCandidates, optimizationStopped: 'renderer_timeout_after_valid_fit',
        }
        throw error
      }
      const result = await searchFixedPagePdf(candidate, { targetPages, render, renderLimit: 1, natural })
        .catch((error) => { if (error.code !== 'PAPER_FIXED_PAGE_IMPOSSIBLE') throw error; lastFailure = error; return null })
      if (result) {
        const fit = { ...result, coverGapsPt: gaps, allowSplitOptionBank: !keepOptionBank }
        if (!bestFit || fit.layoutPenalty < bestFit.layoutPenalty) bestFit = fit
        if (!fit.layoutPenalty) return { ...fit, searchedCandidates }
      }
      // Embedded fonts can make each HTML tens of MB. Failed baselines need
      // only measurements, not their HTML/PDF; rebuild candidate input on use.
      baselines.push({ gaps,
        natural: result ? natural : { pageCount: natural.pageCount, inspection: natural.inspection },
        penalty: result?.layoutPenalty ?? 0 })
    }
    if (!baselines.length) break
    // Keep compact-first priority for eight-page writing-space fallback, even
    // when a roomier cover happens to be closer to the target page count.
    if (targetPages !== 8 || bestFit) baselines.sort((a, b) => Math.abs(a.natural.pageCount - targetPages) - Math.abs(b.natural.pageCount - targetPages)
      || a.penalty - b.penalty)
    if (!bestFit && !triedWritingSpace && baselines.some(({ natural }) => natural.pageCount > targetPages
      || (natural.pageCount === targetPages && hasDetachedApplication(natural)))) {
      triedWritingSpace = true
      const minimums = Object.fromEntries(Object.entries(FIXED_PAGE_ANSWER_HEIGHTS_MM)
        .filter(([family]) => new RegExp(`<[^>]+class="[^"]*\\bcanonical-${family}-response\\b`).test(html))
        .map(([family, [height]]) => [family, height]))
      // Probe feasibility across cover profiles before spending the budget on
      // size refinement. Also consider bank fallback + writing compression,
      // not merely fallback at the original box size. Protected banks win.
      if (Object.keys(minimums).length) for (const relaxed of [false, true]) {
        for (const baseline of baselines) {
          if (searchedCandidates >= 24 - (relaxed ? 0 : coverGaps.length)) break
          if (baseline.natural.pageCount < targetPages) continue
          let candidate = candidateForCover(baseline.gaps)
          if (relaxed) candidate = candidate.replace('</head>', '<style data-pdf-option-bank-fallback></style></head>')
          let natural = baseline.natural
          if (relaxed) {
            searchedCandidates += 1
            natural = await render(applyPlannedGroupBreaks(candidate, []), { inspect: inspectGroups })
            if (natural.pageCount === targetPages && !hasDetachedApplication(natural)) {
              const fit = await searchFixedPagePdf(candidate, { targetPages, render, renderLimit: 1, natural })
              return { ...fit, coverGapsPt: baseline.gaps, allowSplitOptionBank: true, searchedCandidates }
            }
            if (searchedCandidates >= 24) break
          }
          let minimum
          searchedCandidates += 1
          try {
            minimum = await render(applyPlannedGroupBreaks(applyAnswerBoxHeights(candidate, minimums), []), { inspect: inspectGroups })
          } catch (error) {
            if (error.code !== 'PAPER_LAYOUT_OVERFLOW') throw error
          }
          if (minimum && (minimum.pageCount > targetPages || hasDetachedApplication(minimum))) continue
          const fitted = await fitWritingSpace(candidate, {
            targetPages, natural, render,
            renderLimit: Math.max(0, 24 - searchedCandidates - (relaxed ? 0 : coverGaps.length)),
          })
          searchedCandidates += fitted.searchedCandidates
          const selected = fitted.result.pageCount === targetPages && !hasDetachedApplication(fitted.result) ? fitted
            : minimum?.pageCount === targetPages && !hasDetachedApplication(minimum) ? { result: minimum, heights: minimums } : null
          if (selected) {
            const fit = await searchFixedPagePdf(applyAnswerBoxHeights(candidate, selected.heights), {
              targetPages, render, renderLimit: 1 + Math.max(0, 24 - searchedCandidates), natural: selected.result,
            }).catch(error => {
              if (error.name !== 'TimeoutError' || !error.fixedPageFit) throw error
              return { ...error.fixedPageFit, searchedCandidates: error.searchedCandidates,
                optimizationStopped: 'renderer_timeout_after_valid_fit' }
            })
            searchedCandidates += fit.searchedCandidates - 1
            return { ...fit, coverGapsPt: baseline.gaps, allowSplitOptionBank: relaxed,
              answerBoxHeightsMm: selected.heights, searchedCandidates }
          }
          if (!relaxed && fitted.heights) {
            baseline.natural = fitted.result
            baseline.answerBoxHeightsMm = fitted.heights
          }
        }
      }
    }
    for (const [index, { gaps, natural, answerBoxHeightsMm }] of baselines.entries()) {
      // Once an exact-count fit exists the fallback cannot run; spend its
      // unused reservation on improving that fit instead of stopping early.
      const reserved = keepOptionBank && !bestFit ? coverGaps.length : 0
      const remainingProfiles = baselines.length - index - 1
      const renderLimit = 1 + Math.max(0, 24 - searchedCandidates - reserved - remainingProfiles)
      if (renderLimit === 1) continue
      try {
        const result = await searchFixedPagePdf(candidateForCover(gaps, answerBoxHeightsMm), { targetPages, render, renderLimit, natural })
        searchedCandidates += result.searchedCandidates - 1
        const fit = { ...result, coverGapsPt: gaps, allowSplitOptionBank: !keepOptionBank,
          ...(answerBoxHeightsMm ? { answerBoxHeightsMm } : {}) }
        if (!bestFit || fit.layoutPenalty < bestFit.layoutPenalty
          || (fit.layoutPenalty === bestFit.layoutPenalty && fit.plannedBreakGroupIds.length < bestFit.plannedBreakGroupIds.length)) bestFit = fit
        if (!fit.layoutPenalty) return { ...bestFit, searchedCandidates }
      } catch (error) {
        if (error.name === 'TimeoutError' && (bestFit || error.fixedPageFit)) {
          const fit = error.fixedPageFit ? { ...error.fixedPageFit, coverGapsPt: gaps,
            allowSplitOptionBank: !keepOptionBank,
            ...(answerBoxHeightsMm ? { answerBoxHeightsMm } : {}) } : bestFit
          return { ...fit, searchedCandidates: searchedCandidates + error.searchedCandidates - 1,
            optimizationStopped: 'renderer_timeout_after_valid_fit' }
        }
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

// A long-paper edition is a ceiling, not a request to pad a shorter paper.
// Keep normal writing space and try only approved cover profiles. If the
// application box detaches, start that whole group on the next page before
// tightening the opening; Screen and ordinary Print/PDF remain unchanged.
export async function planLongPaperPdf(html, { targetPages, omitCover = false, render }) {
  if (![10, 12].includes(targetPages)) throw new Error('long-paper targetPages must be 10 or 12')
  const coverGaps = omitCover || !html.includes('data-canonical-paper-opening')
    ? [null] : FIXED_PAGE_COVER_GAPS_PT
  let lastResult
  let searchedCandidates = 0
  const acceptable = result => result.pageCount <= targetPages && !hasDetachedApplication(result)
    && !hasSplitApplication(result)
    && !result.inspection.some(({ optionBankPages }) => optionBankPages?.length > 1)
  for (const gaps of coverGaps) {
    const candidate = applyFixedCover(html, {
      targetPages, omitCover, coverGapsPt: gaps,
    })
    // eslint-disable-next-line no-await-in-loop -- page measurements depend on the prior attempt
    const natural = await render(applyPlannedGroupBreaks(candidate, []), { inspect: inspectGroups })
    searchedCandidates += 1
    lastResult = natural
    let result = natural
    let plannedBreakGroupIds = []
    if (!acceptable(result) && result.pageCount <= targetPages
      && (hasDetachedApplication(result) || hasSplitApplication(result))) {
      const application = result.inspection.find(({ applicationPresent }) => applicationPresent)
      if (application) {
        plannedBreakGroupIds = [application.id]
        searchedCandidates += 1
        try {
          // eslint-disable-next-line no-await-in-loop -- this measured break depends on the natural layout
          result = await render(applyPlannedGroupBreaks(candidate, plannedBreakGroupIds), { inspect: inspectGroups })
          lastResult = result
        } catch (error) {
          if (error.code !== 'PAPER_LAYOUT_OVERFLOW') throw error
          continue
        }
      }
    }
    if (!acceptable(result)) continue
    const failures = faceBoundaryFailures(result.inspection)
    return {
      ...result, coverGapsPt: gaps, allowSplitOptionBank: false,
      plannedBreakGroupIds, crossingGroupIds: failures.map(({ id }) => id),
      splitGroupIds: result.inspection.filter(({ pages }) => pages.length > 1).map(({ id }) => id),
      splitOptionBankCount: result.inspection.filter(group => group.optionBankPages?.length > 1).length,
      searchedCandidates,
    }
  }
  throw Object.assign(new Error(`长卷版未找到不超过 ${targetPages} 页、应用文完整题面与作答框同页且选项库完整的排版；请使用普通 PDF 查看实际分页`), {
    code: 'PAPER_FIXED_PAGE_IMPOSSIBLE', actualPages: lastResult.pageCount,
    targetPages, searchedCandidates,
  })
}

export async function renderExplicitFixedPagePdf(html, {
  edition,
  targetPages,
  omitCover = false,
  coverGapsPt = null,
  allowSplitOptionBank = false,
  answerBoxHeightsMm,
  plannedBreakGroupIds,
  render,
}) {
  if (typeof allowSplitOptionBank !== 'boolean') throw new Error('allowSplitOptionBank must be boolean')
  const longPaper = edition === 'long10' || edition === 'long12'
  if (longPaper && (answerBoxHeightsMm || allowSplitOptionBank)) {
    throw new Error('长卷版不能压缩写作答题框或拆分选项库')
  }
  let candidate = applyFixedCover(html, { targetPages, omitCover, coverGapsPt })
  if (allowSplitOptionBank) {
    candidate = candidate.replace('</head>', '<style data-pdf-option-bank-fallback></style></head>')
  }
  candidate = applyPlannedGroupBreaks(applyAnswerBoxHeights(candidate, answerBoxHeightsMm), plannedBreakGroupIds)
  const result = await render(candidate, { inspect: inspectGroups })
  const wrongPageCount = longPaper ? result.pageCount > targetPages : result.pageCount !== targetPages
  const splitLongBank = longPaper && result.inspection.some(({ optionBankPages }) => optionBankPages?.length > 1)
  if (wrongPageCount || ((longPaper || answerBoxHeightsMm) && hasDetachedApplication(result))
    || (longPaper && hasSplitApplication(result)) || splitLongBank) {
    const reason = wrongPageCount
      ? longPaper ? `实际生成 ${result.pageCount} 页，超过 ${targetPages} 页上限`
        : `已审核分页方案实际生成 ${result.pageCount} 页，而不是 ${targetPages} 页`
      : splitLongBank ? '选项库跨页' : '分页方案的应用文完整题面与作答框未处于同一页'
    throw (longPaper ? Object.assign(new Error(`长卷版：${reason}`), {
      code: 'PAPER_FIXED_PAGE_IMPOSSIBLE',
      actualPages: result.pageCount,
      targetPages,
      searchedCandidates: 1,
    }) : impossible(reason, {
      actualPages: result.pageCount,
      targetPages,
      searchedCandidates: 1,
    }))
  }
  const failures = faceBoundaryFailures(result.inspection)
  return {
    ...result,
    plannedBreakGroupIds: [...plannedBreakGroupIds],
    coverGapsPt,
    allowSplitOptionBank,
    ...(answerBoxHeightsMm ? { answerBoxHeightsMm: { ...answerBoxHeightsMm } } : {}),
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

export async function searchFixedPagePdf(html, {
  targetPages, render, renderLimit, natural, atMost = false, accept = () => true,
  rejectOverflowCandidates = false, balanceWhitespace = false,
}) {
  if (![8, 10, 12].includes(targetPages) && !(targetPages === 9 && atMost === true)) {
    throw new Error('targetPages must be 8, 10 or 12, or an explicit nine-page ceiling')
  }
  const preferWholeGroups = targetPages === 8 || targetPages === 9 || html.includes('data-pdf-omit-cover')
  const renderPlan = async (breaks) => {
    try { return await render(applyPlannedGroupBreaks(html, breaks), { inspect: inspectGroups }) } catch (error) {
      if (rejectOverflowCandidates && error.code === 'PAPER_LAYOUT_OVERFLOW') return null
      if (error.name === 'TimeoutError') {
        error.searchedCandidates = seen.size
        error.fixedPageFit = bestFit
      }
      throw error
    }
  }
  // Large reading-friendly editions may move passages, not split the listening
  // sections just to improve downstream page parity. Natural cue/question
  // protection still applies; stored explicit plans are not rewritten.
  const candidates = natural.inspection.slice(1)
    .filter(group => !balanceWhitespace || group.type !== 'listening')
    .map(({ id }) => id)
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
      const totalLines = lines.reduce((sum, height) => sum + height, 0)
      let accessCost = 0
      let precedingLines = 0
      for (let index = 0; index < pages.length - 1; index += 1) {
        precedingLines += lines[index]
        // Sequential A3 duplex: 1→2 is visible together; 2→3 flips the
        // same sheet; 4→5 changes sheets which can be laid side by side.
        const extraWeight = pages[index] % 4 === 2 ? 3 : pages[index] % 4 === 0 ? 0.5 : 0
        accessCost += extraWeight * Math.min(precedingLines, totalLines - precedingLines)
      }
      return total + totalLines - Math.max(...lines) + accessCost
    }, 0)
    let sharedPages = 0
    for (let index = 1; index < result.inspection.length; index += 1) {
      const previous = result.inspection[index - 1]
      const group = result.inspection[index]
      if (previous.type === 'grammarFill' && group.type === 'writing') continue
      if (substantialPages(previous).some((page) => substantialPages(group).includes(page))) sharedPages += 1
    }
    // Only the new large products opt in. Three lines of raggedness are free;
    // larger non-final page tails have increasing cost, in line units, so a
    // half-empty page cannot be justified by a small improvement in A3 access.
    // The last page need not be filled. This is a ranking preference, not a
    // rejection threshold, and never counts the interior of a writing box.
    const tails = new Map()
    if (balanceWhitespace) for (const group of result.inspection) {
      for (const fragment of group.fragments || []) {
        if (fragment.page < result.pageCount && Number.isFinite(fragment.pageTailLines)) {
          tails.set(fragment.page, Math.max(tails.get(fragment.page) || 0, fragment.pageTailLines))
        }
      }
    }
    const whitespacePenalty = [...tails.values()].reduce((sum, lines) => sum + Math.max(0, lines - 3) ** 2, 0)
    const layoutPenalty = failures.length + scatteredLines + (preferWholeGroups ? sharedPages : 0) + whitespacePenalty
    return {
      pageCount: result.pageCount,
      failureIds: failures.map(({ id }) => id),
      splitIds,
      separateStartIds: result.inspection.slice(1).filter((group, index) =>
        result.inspection[index].pages.at(-1) !== group.pages[0]).map(({ id }) => id),
      layoutPenalty,
      score: (atMost ? Math.max(0, result.pageCount - targetPages)
        : Math.abs(targetPages - result.pageCount)) * 1000 + layoutPenalty,
    }
  }

  function retain(result, breaks, summary) {
    if ((atMost ? result.pageCount <= targetPages : result.pageCount === targetPages)
      && accept(result) && !hasDetachedApplication(result) && (!bestFit || summary.layoutPenalty < bestFit.layoutPenalty
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
  const idealBreaks = preferWholeGroups ? natural.inspection.slice(1).filter((group, index) =>
    !(group.type === 'writing' && natural.inspection[index].type === 'grammarFill'))
    .map(({ id }) => id) : []
  if (idealBreaks.length && seen.size < maxRenders) {
    seen.add(idealBreaks.join('\u0000'))
    const result = await renderPlan(idealBreaks)
    if (result) {
      const summary = summarize(result)
      retain(result, idealBreaks, summary)
      if (bestFit?.layoutPenalty === 0) {
        return { ...bestFit, searchedCandidates: seen.size }
      }
      queue.push({ breaks: idealBreaks, summary })
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
      if (!result) continue
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
