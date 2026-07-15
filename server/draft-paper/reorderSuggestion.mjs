// reorder-suggest (docs/cuts/reorder-suggest/plan.md "施工契约 1"): the
// evaluator behind the workbench's quiet 排序建议 card — "把 X 和 Y 调换顺序
// 即可消除" — that only ever fires once a candidate order has been dry-run
// through the REAL server pagination pipeline and confirmed to zero out
// every 跨页断篇 (Super Teacher Boundary: an unverified suggestion is worse
// than no suggestion at all).
//
// Deliberately its own file, not grown onto draftPaperStore.mjs (plan.md:
// "避免 store 再长胖") — every function here is pure or takes its Chromium/
// render dependencies as parameters instead of closing over
// createDraftPaperStore's internals. The store (draftPaperStore.mjs) is the
// only caller: it owns the LRU cache, the userId/db plumbing, and passes in
// its own `buildDraftPaginationPrintHtml` / `renderPaginatedPaper` /
// `applyPaginationDomContract` / `derivePageBreakSuggestions` closures as
// `deps`.

// Runs ONE candidate order through the exact same real pipeline
// getDraftPaperPagination uses (buildDraftPaginationPrintHtml ->
// renderPaginatedPaper -> applyPaginationDomContract ->
// derivePageBreakSuggestions), but entirely in memory: `draftPaper` is never
// mutated, nothing is written to the pagination cache
// (`draftPaginationCacheSet` is never called from here), and no database
// write happens anywhere in this call chain — buildDraftPaginationPrintHtml
// only ever reads the in-memory `draftPaper` object handed to it (plan.md
// "现状锚": 吃内存对象不读库). Returns the candidate order's own
// pageBreakSuggestions array (empty = this candidate order breaks nothing).
export async function evaluateCandidateOrder(draftPaper, candidateItems, printForm, deps) {
  const { buildDraftPaginationPrintHtml, renderPaginatedPaper, applyPaginationDomContract, derivePageBreakSuggestions, versionType } = deps
  const candidateDraftPaper = { ...draftPaper, items: candidateItems }
  const html = buildDraftPaginationPrintHtml(candidateDraftPaper, { versionType })
  if (!html) return []
  const rendered = await renderPaginatedPaper(html)
  const groupIds = candidateItems.filter((item) => !item.groupMissing).map((item) => item.groupId)
  const paginatedHtml = applyPaginationDomContract(rendered.paginatedHtml, { groupIds, pageCount: rendered.pageCount })
  const itemsByGroupId = new Map(candidateItems.filter((item) => !item.groupMissing).map((item) => [item.groupId, item.id]))
  return derivePageBreakSuggestions(paginatedHtml, { itemsByGroupId, printForm })
}

// Confirmed, deterministic candidate set (plan.md 施工契约 1): for each
// broken group B (取前 2 个, ordered by the draft's OWN current item
// position — not suggestion order, which may differ) generates four moves —
// swap with the item immediately before it, swap with the item immediately
// after it, move to the front of the draft, move to the end. Candidates
// identical to the current order, or identical to an already-generated
// candidate, are dropped (a Map/Set over the item-id sequence, not a
// deep-equality check — item identity is preserved by the splice moves
// below, so id-sequence equality is exact). Hard-capped at 6 total —
// exceeding that is a bug, not a "more candidates is better" situation
// (plan.md: "宁缺勿假", keep the dry-run cost bounded).
//
// `pageBreakBefore` never moves independently of its item (plan.md: "标志
// 随 item 走,不清除不挪移") — every move below relocates whole item objects
// via splice, never rebuilding or stripping fields.
export function buildReorderCandidates(items, brokenGroupIds) {
  const groupIdToIndex = new Map()
  items.forEach((item, index) => {
    if (!groupIdToIndex.has(item.groupId)) groupIdToIndex.set(item.groupId, index)
  })
  const orderedBrokenGroupIds = brokenGroupIds
    .filter((groupId) => groupIdToIndex.has(groupId))
    .sort((a, b) => groupIdToIndex.get(a) - groupIdToIndex.get(b))
    .slice(0, 2)

  const currentKey = items.map((item) => item.id).join('|')
  const seenKeys = new Set([currentKey])
  const candidates = []

  function tryAdd(nextItems, move, brokenGroupId) {
    if (candidates.length >= 6) return
    const key = nextItems.map((item) => item.id).join('|')
    if (seenKeys.has(key)) return
    seenKeys.add(key)
    candidates.push({ items: nextItems, move, brokenGroupId })
  }

  function swapAt(index, otherIndex) {
    if (otherIndex < 0 || otherIndex >= items.length) return null
    const next = [...items]
    const temp = next[index]
    next[index] = next[otherIndex]
    next[otherIndex] = temp
    return next
  }

  function moveTo(index, targetIndex) {
    const next = [...items]
    const [item] = next.splice(index, 1)
    next.splice(targetIndex, 0, item)
    return next
  }

  for (const groupId of orderedBrokenGroupIds) {
    if (candidates.length >= 6) break
    const index = groupIdToIndex.get(groupId)
    const item = items[index]

    const prevItem = items[index - 1]
    const swappedWithPrev = swapAt(index, index - 1)
    if (swappedWithPrev) tryAdd(swappedWithPrev, { kind: 'swap', itemId: item.id, otherItemId: prevItem.id }, groupId)

    const nextItem = items[index + 1]
    const swappedWithNext = swapAt(index, index + 1)
    if (swappedWithNext) tryAdd(swappedWithNext, { kind: 'swap', itemId: item.id, otherItemId: nextItem.id }, groupId)

    tryAdd(moveTo(index, 0), { kind: 'front', itemId: item.id }, groupId)
    tryAdd(moveTo(index, items.length - 1), { kind: 'end', itemId: item.id }, groupId)
  }

  return candidates.slice(0, 6)
}

// Orchestration (plan.md 施工契约 1 "proposeReorder(...) 编排"): `currentSuggestions`
// is the ALREADY-COMPUTED pageBreakSuggestions for the draft's real current
// order (getDraftPaperPagination's existing cached path — this function
// never re-derives that itself, "当前分页(走现有缓存路径)"). Zero suggestions
// -> null (nothing to fix). Otherwise dry-runs each deterministic candidate
// in turn and returns the FIRST one whose own suggestions come back empty
// (early-exit — plan.md "首个断篇归零的候选即早退"). No candidate reaches
// zero -> null (v1 收紧档: partial improvement never surfaces, plan.md
// Forbidden).
export async function proposeReorder(draftPaper, currentSuggestions, printForm, deps) {
  if (!currentSuggestions || currentSuggestions.length === 0) return null
  const brokenGroupIds = [...new Set(currentSuggestions.map((suggestion) => suggestion.groupId))]
  const candidates = buildReorderCandidates(draftPaper.items, brokenGroupIds)
  for (const candidate of candidates) {
    const suggestions = await evaluateCandidateOrder(draftPaper, candidate.items, printForm, deps)
    if (suggestions.length === 0) {
      return {
        order: candidate.items.map((item) => item.id),
        move: candidate.move,
        brokenGroupId: candidate.brokenGroupId,
      }
    }
  }
  return null
}
