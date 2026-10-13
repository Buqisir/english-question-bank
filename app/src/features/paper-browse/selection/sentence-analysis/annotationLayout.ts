// Measured geometry in, positions out. No DOM, React state, or grammar decisions.
// Clearance between the card head and whatever sits highest above the first row.
export const LABEL_TOP_SPACE = 8
export type Box = { left: number; right: number; top: number; bottom: number }
export type AnnotationEntry = {
  id: number; labelIds: string[]; actionFor: string | undefined; hidden: boolean;
  x: number; natural: number; y: number; width: number; height: number;
  above: boolean; current: boolean; persistent: boolean
}
export type AnnotationRow = { top: number; textBottom: number; boxes: Box[]; markers: Box[]; entries: AnnotationEntry[] }
export type LayoutMinimum = { top: number; line: number; locked: boolean }

/** Keep reading order while sharing a little movement between neighbours. */
function fitPersistentLane(entries: AnnotationEntry[], width: number) {
  const shift = 48
  const ordered = [...entries].sort((a, b) => a.natural - b.natural)
  const earliest: number[] = []
  let edge = 0
  for (const entry of ordered) {
    const left = Math.max(edge, entry.natural - shift)
    if (left > Math.min(width - entry.width, entry.natural + shift)) return null
    earliest.push(left)
    edge = left + entry.width + 4
  }
  // Work back toward the words, reserving the feasible space to the left.
  // Compute everything before applying it: a failed fit leaves the lane alone.
  const positions = new Map<AnnotationEntry, number>()
  edge = width
  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    const entry = ordered[index]
    const left = Math.max(earliest[index], Math.min(entry.natural, edge - entry.width))
    positions.set(entry, left)
    edge = left - 4
  }
  return positions
}

const ROW_CLEARANCE = 3
const closeAcross = (upper: Box, lower: Box) => upper.left < lower.right + 4 && upper.right > lower.left - 4

/**
 * One crowded spot used to open the leading of every line. Before that, a
 * persistent capsule and the difficulty label on the line above it step
 * sideways within the usual coordination allowance. Only text, markers and
 * persistent entries are considered, so the result is identical at rest and
 * while a selection adds temporary items.
 */
function easeAcrossRows(rows: AnnotationRow[], placed: Map<AnnotationEntry, Box>, width: number, base: number) {
  const LIMIT = 48
  const transient = new Set([...placed].filter(([entry]) => !entry.persistent || entry.actionFor).map(([, box]) => box))
  const solid = (row: AnnotationRow) => row.boxes.filter(box => !transient.has(box))
  const entryOf = new Map([...placed].filter(([entry]) => entry.persistent && !entry.actionFor).map(([entry, box]) => [box, entry]))
  const movable = new Set(entryOf.keys())
  const need = (upper: Box, lower: Box) => closeAcross(upper, lower) ? upper.bottom - lower.top + ROW_CLEARANCE : 0
  for (let index = 1; index < rows.length; index += 1) {
    const upperRow = rows[index - 1]
    const lowerRow = rows[index]
    // Words fill the whole line, so the leading they require against anything
    // is unavoidable; sideways steps only resolve label-against-label clashes.
    const words = (row: AnnotationRow) => new Set(solid(row).filter(box => !movable.has(box) && !row.markers.includes(box)))
    const upperWords = words(upperRow)
    const lowerWords = words(lowerRow)
    let line = base
    for (const upper of solid(upperRow)) for (const lower of solid(lowerRow)) {
      if (upperWords.has(upper) || lowerWords.has(lower)) line = Math.max(line, need(upper, lower))
    }
    const conflicts = (entry: AnnotationEntry, box: Box) => solid(entry.above ? upperRow : lowerRow)
      .filter(other => other !== box && (entry.above ? need(other, box) : need(box, other)) > line)
    const free = (entry: AnnotationEntry, box: Box) => solid(entry.above ? lowerRow : upperRow).every(other => other === placed.get(entry)
      || !(box.left < other.right + 4 && other.left < box.right + 4 && box.top < other.bottom + 2 && other.top < box.bottom + 2))
    const fits = (entry: AnnotationEntry, x: number) => x >= 0 && x + entry.width <= width && Math.abs(x - entry.natural) <= LIMIT
    const move = (entry: AnnotationEntry, x: number) => {
      const own = placed.get(entry)!
      entry.x = x
      own.left = x
      own.right = x + entry.width
    }
    const candidates = [...entryOf].filter(([box, entry]) => movable.has(box)
      && (entry.above ? lowerRow.entries.includes(entry) : upperRow.entries.includes(entry)))
    for (const [own, entry] of candidates) {
      const current = conflicts(entry, own)
      if (!current.length) continue
      const x = current.flatMap(other => [other.right + 4, other.left - 4 - entry.width])
        .sort((a, b) => Math.abs(a - entry.natural) - Math.abs(b - entry.natural))
        .find(value => fits(entry, value) && free(entry, { ...own, left: value, right: value + entry.width })
          && !conflicts(entry, { ...own, left: value, right: value + entry.width }).length)
      if (x !== undefined) { move(entry, x); continue }
      // A capsule and a difficulty label that clash may each give half.
      const partner = current.length === 1 ? entryOf.get(current[0]) : undefined
      if (!partner) continue
      const other = current[0]
      const start = { mine: entry.x, theirs: partner.x }
      const totals = [other.right + 4 - own.left, other.left - 4 - own.right].sort((a, b) => Math.abs(a) - Math.abs(b))
      totals.some(total => {
        const mine = start.mine + total / 2
        const theirs = start.theirs - total / 2
        if (!fits(entry, mine) || !fits(partner, theirs)) return false
        move(entry, mine)
        move(partner, theirs)
        if (free(entry, own) && free(partner, other) && !conflicts(entry, own).length && !conflicts(partner, other).length) return true
        move(entry, start.mine)
        move(partner, start.theirs)
        return false
      })
    }
  }
}

export function packAnnotations(input: AnnotationRow[], width: number, fontSize: number, minimum: LayoutMinimum) {
  const rows = input.map(row => ({ ...row, boxes: row.boxes.map(box => ({ ...box })),
    markers: row.markers.map(box => ({ ...box })), entries: row.entries.map(entry => ({ ...entry })) }))
  const entries = rows.flatMap(row => row.entries)
  const SHIFT = 32
  // A capsule that only appears on selection is new on screen, so it may
  // travel further than a capsule the reader has already seen.
  const TEMPORARY_SHIFT = 64
  const crowded: string[] = []
  const placed = new Map<AnnotationEntry, Box>()
  const clear = (x: number, w: number, others: AnnotationEntry[]) => others.every(other => x + w + 4 <= other.x || x >= other.x + other.width + 4)
  for (const row of rows) {
    for (const above of [true, false]) {
      const lanes: AnnotationEntry[][] = []
      // Capsules already on screen are placed first, in reading order, and
      // ignore selection so they land in the same spot in every state; a
      // temporary capsule gives way instead of lifting them into a new lane.
      const actionOf = (item: AnnotationEntry) => item.actionFor
      for (const entry of row.entries.filter(item => item.above === above)
        .sort((a, b) => Number(Boolean(actionOf(a))) - Number(Boolean(actionOf(b)))
          || Number(b.persistent) - Number(a.persistent)
          || (a.persistent ? 0 : Number(b.current) - Number(a.current)))) {
        const actionFor = actionOf(entry)
        if (actionFor) {
          // 看内部 / 返回 sit right beside their capsule, in its lane, or on its
          // other side. Without room they leave the row rather than add a lane.
          const owner = row.entries.find(item => item.above === above && item.labelIds.includes(actionFor))
          const lane = owner ? lanes.find(item => item.includes(owner)) : undefined
          const x = owner && lane ? [owner.x + owner.width + 4, owner.x - entry.width - 4]
            .find(value => value >= 0 && value + entry.width <= width && clear(value, entry.width, lane)) : undefined
          if (lane && x !== undefined) { entry.x = x; lane.push(entry); continue }
          entry.hidden = true
          row.entries.splice(row.entries.indexOf(entry), 1)
          crowded.push(`action:${actionFor}`)
          continue
        }
        const natural = entry.natural
        const allowance = entry.persistent ? SHIFT : TEMPORARY_SHIFT
        let assigned = false
        for (const lane of lanes) {
          const candidates = [natural, ...lane.flatMap(other => [other.x + other.width + 4, other.x - entry.width - 4])]
            .sort((a, b) => Math.abs(a - natural) - Math.abs(b - natural))
          const x = candidates.find(value => value >= 0 && value + entry.width <= width && Math.abs(value - natural) <= allowance
            && clear(value, entry.width, lane))
          if (x !== undefined) { entry.x = x; lane.push(entry); assigned = true; break }
          // Persistent neighbours may share a bounded adjustment before using
          // another lane. Selection-only labels/actions never move this frame.
          if (above && entry.persistent && lane.every(item => item.persistent && !item.actionFor)) {
            const positions = fitPersistentLane([...lane, entry], width)
            if (positions) {
              for (const [item, left] of positions) item.x = left
              lane.push(entry); assigned = true; break
            }
          }
          // Before opening a new lane (which pushes the text), let one placed,
          // neighbour step aside within its own allowance. A temporary capsule
          // never moves one already on screen, nor the one being selected.
          const blockers = lane.filter(other => !clear(natural, entry.width, [other]))
          const other = blockers.length === 1
            && (entry.persistent ? blockers[0].persistent : !blockers[0].persistent && !blockers[0].current) ? blockers[0] : null
          if (!other || natural < 0 || natural + entry.width > width) continue
          const rest = lane.filter(item => item !== other)
          if (!clear(natural, entry.width, rest)) continue
          const moved = [natural - other.width - 4, natural + entry.width + 4].find(value => value >= 0
            && value + other.width <= width && Math.abs(value - other.natural) <= SHIFT && clear(value, other.width, rest))
          if (moved === undefined) continue
          other.x = moved; entry.x = natural; lane.push(entry); assigned = true; break
        }
        if (!assigned && above && !entry.persistent && lanes.length > 0) {
          // A crowded row has no room for a selection capsule. Stacking a lane
          // would push the sentence, so the explanation line names it instead.
          entry.hidden = true
          row.entries.splice(row.entries.indexOf(entry), 1)
          crowded.push(...entry.labelIds)
          continue
        }
        if (!assigned) { entry.x = natural; lanes.push([entry]) }
      }
      let offset = above ? 4 : row.textBottom + 4
      for (const lane of lanes) {
        const height = Math.max(...lane.map(entry => entry.height))
        if (!above) {
          for (const entry of lane) for (const marker of row.markers) {
            if (entry.x - 2 < marker.right + 4 && entry.x + entry.width + 2 > marker.left - 4) {
              // Flags have a 4px expanded hit area: keep that clear as well.
              offset = Math.max(offset, marker.bottom + 8)
            }
          }
        }
        for (const entry of lane) {
          entry.y = above ? -offset - entry.height : offset
          const box = { left: entry.x, right: entry.x + entry.width, top: entry.y, bottom: entry.y + entry.height }
          placed.set(entry, box)
          row.boxes.push(box)
        }
        offset += height + 4
      }
    }
  }
  easeAcrossRows(rows, placed, width, fontSize * 3.15)
  if (minimum.locked) {
    // The resting layout is the frame: a selection never opens the leading or
    // the top margin. What only the selection adds must fit the space between
    // rows; 看内部 / 返回 may try the capsule's other side, anything else gives
    // way to the explanation line or the title bar.
    const hits = (a: Box, b: Box) => a.left < b.right + 2 && b.left < a.right + 2 && a.top < b.bottom + 2 && b.top < a.bottom + 2
    const blocked = (row: AnnotationRow, own: Box, box: Box) => row.top + box.top < -minimum.top + 2
      || rows.some(other => other.boxes.some(item => item !== own && hits(
        { left: box.left, right: box.right, top: row.top + box.top, bottom: row.top + box.bottom },
        { left: item.left, right: item.right, top: other.top + item.top, bottom: other.top + item.bottom })))
    for (const row of rows) for (const entry of [...row.entries]) {
      const own = placed.get(entry)
      if (entry.persistent || !own || !blocked(row, own, own)) continue
      const actionFor = entry.actionFor
      const owner = actionFor ? row.entries.find(item => item.labelIds.includes(actionFor)) : undefined
      const side = owner ? [owner.x + owner.width + 4, owner.x - entry.width - 4]
        .find(x => x >= 0 && x + entry.width <= width && !blocked(row, own, { ...own, left: x, right: x + entry.width })) : undefined
      if (side !== undefined) {
        entry.x = side
        own.left = side
        own.right = side + entry.width
        continue
      }
      entry.hidden = true
      row.entries.splice(row.entries.indexOf(entry), 1)
      row.boxes.splice(row.boxes.indexOf(own), 1)
      if (actionFor) crowded.push(`action:${actionFor}`)
      else crowded.push(...entry.labelIds)
    }
  }
  let lineHeight = Math.max(minimum.line, fontSize * 3.15)
  if (!minimum.locked) {
    for (let index = 1; index < rows.length; index += 1) {
      for (const before of rows[index - 1].boxes) for (const after of rows[index].boxes) {
        if (closeAcross(before, after)) lineHeight = Math.max(lineHeight, before.bottom - after.top + ROW_CLEARANCE)
      }
    }
  }
  // Rows are measured from the line box, whose upper half-leading already holds
  // the first capsule lane; only what rises beyond it needs top padding. They
  // were measured at the baseline leading, so add what the wider leading adds.
  const grown = (lineHeight - Math.max(minimum.line, fontSize * 3.15)) / 2
  const topExtent = rows[0] ? Math.min(0, ...rows[0].entries.map(entry => rows[0].top + grown + entry.y)) : 0
  const paddingTop = minimum.locked ? minimum.top : Math.max(minimum.top, LABEL_TOP_SPACE, -topExtent + LABEL_TOP_SPACE)
  return { entries, crowded, lineHeight, paddingTop }
}
