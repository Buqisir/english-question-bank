/*
 * Stable appendix ordering (#489 §8). Entries with a computable spot sort by
 * page, then vertical, then horizontal position; entries without one (anchor
 * not on the paper, foreign layout) keep a deterministic id order at the end.
 * The appendix number is the result's array index + 1 — the paper markers and
 * the appendix preview must render from the same call so their numbers agree.
 * Pure and DOM-free; the stage-5 PDF export reuses it.
 */
export function orderAppendixEntries(entries) {
  const positioned = []
  const unpositioned = []
  for (const entry of entries) {
    if (entry.pageIndex != null && entry.yMm != null && entry.xMm != null) positioned.push(entry)
    else unpositioned.push(entry)
  }
  const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  positioned.sort((a, b) => a.pageIndex - b.pageIndex || a.yMm - b.yMm || a.xMm - b.xMm || byId(a, b))
  unpositioned.sort(byId)
  return [...positioned, ...unpositioned].map((entry) => entry.id)
}
