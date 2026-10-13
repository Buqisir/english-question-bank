import { neatCurve, neatHead } from './neatArrow.ts'
import { outgoingRelations, relationDisplay, relationFallback } from './sentencePresentation.ts'
import type { FocusState, Relation, SentenceAnalysisV1 } from '../../../../../../shared/sentence-analysis/types.d.mts'

export type MissingRelation = { relationId: string; targetId: string; text: string }

export type Box = { left: number; right: number; top: number; bottom: number }
export type Point = { x: number; y: number }
export type Drawn = {
  id: string
  d: string
  color: string
  caption?: { x: number; y: number; text: string }
  arrow: Point[]
}

export type StrokeBand = { unitId: string; box: Box }

export type Measure = {
  width: number
  height: number
  glyphs: Box[]
  notes: Box[]
  unitLines: Map<string, Box[]>
  labels: Map<string, Box>
  strokes?: StrokeBand[]
  /** Space above the first text row that a curve may use. */
  room?: number
}

// The strokes under the two ends belong to the relation itself; every other
// underline is an obstacle like a word, so an arrow never runs along one.
function strokeObstacles(strokes: StrokeBand[], ends: Box[]) {
  return strokes.filter(({ box }) => !ends.some(line => Math.abs(box.top - line.bottom) < 8
    && box.left < line.right && line.left < box.right)).map(({ box }) => box)
}

export function glyphOf(rect: Box): Box {
  if (rect.bottom - rect.top >= 40) {
    const mid = (rect.top + rect.bottom) / 2
    return { left: rect.left, right: rect.right, top: mid - 13, bottom: mid + 13 }
  }
  return rect
}

export function mergeLine(rects: Box[]): Box[] {
  const sorted = rects.map(glyphOf).sort((a, b) => a.top - b.top || a.left - b.left)
  const lines: Box[] = []
  for (const rect of sorted) {
    const line = lines.find((item) => Math.abs(item.top - rect.top) < 8)
    if (!line) {
      lines.push({ ...rect })
      continue
    }
    line.left = Math.min(line.left, rect.left)
    line.right = Math.max(line.right, rect.right)
    line.top = Math.min(line.top, rect.top)
    line.bottom = Math.max(line.bottom, rect.bottom)
  }
  return lines
}

function relationsFor(analysis: SentenceAnalysisV1, focus: FocusState): Relation[] {
  // Legends use word strokes and focus washes only. A specific unit can show
  // its outgoing relation; clicking a predicate never pulls all modifiers in.
  if (focus.kind === 'main') return []
  return outgoingRelations(analysis, focus.unitId).filter(relation => relationDisplay(analysis, relation) !== 'hidden')
}

function hits(point: Point, boxes: Box[], ends: Point[]) {
  if (ends.some((end) => Math.hypot(point.x - end.x, point.y - end.y) < 4)) return false
  return boxes.some((box) => point.x >= box.left - 1 && point.x <= box.right + 1 && point.y >= box.top - 1 && point.y <= box.bottom + 1)
}

function polylineSamples(points: Point[], step = 4) {
  const samples: Point[] = []
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1]
    const to = points[index]
    const length = Math.hypot(to.x - from.x, to.y - from.y)
    const count = Math.max(1, Math.ceil(length / step))
    for (let stepIndex = 0; stepIndex <= count; stepIndex += 1) {
      const t = stepIndex / count
      samples.push({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t })
    }
  }
  return samples
}

function cubicSamples(start: Point, c1: Point, c2: Point, end: Point) {
  const points: Point[] = []
  for (let step = 0; step <= 16; step += 1) {
    const t = step / 16
    const u = 1 - t
    points.push({
      x: u * u * u * start.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * end.x,
      y: u * u * u * start.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * end.y,
    })
  }
  return points
}

function clearPath(points: Point[], measureBoxes: Box[]) {
  const [start, end] = [points[0], points[points.length - 1]]
  return !polylineSamples(points).some((point) => hits(point, measureBoxes, [start, end]))
}

const LANE_RISE = 7

function route(start: Point, end: Point, startLine: Box, endLine: Box, obstacles: Box[], lane = 0) {
  const sameLine = Math.abs(startLine.top - endLine.top) < 8
  if (sameLine) {
    const distance = Math.abs(end.x - start.x)
    const rise = Math.min(16, Math.max(9, distance * 0.22)) + lane * LANE_RISE
    const base = Math.min(start.y, end.y)
    const sky = Math.min(startLine.top, endLine.top) - 18 - lane * LANE_RISE
    if (base - rise >= sky) {
      const inset = Math.min(distance * 0.12, 10) * Math.sign(end.x - start.x)
      const c1 = { x: start.x + inset, y: base - rise / 0.75 }
      const c2 = { x: end.x - inset, y: base - rise / 0.75 }
      const points = cubicSamples(start, c1, c2, end)
      if (clearPath(points, obstacles)) {
        return { d: `M ${start.x} ${start.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${end.x} ${end.y}`, points }
      }
    }
    const rail = Math.min(startLine.top, endLine.top) - 7
    const bend = Math.sign(end.x - start.x) * 4
    const bracket = [start, { x: start.x, y: rail }, { x: end.x, y: rail }, end]
    if (clearPath(bracket, obstacles)) {
      return {
        d: `M ${start.x} ${start.y} V ${rail + 4} Q ${start.x} ${rail} ${start.x + bend} ${rail} H ${end.x - bend} Q ${end.x} ${rail} ${end.x} ${rail + 4} V ${end.y}`,
        points: bracket,
      }
    }
  }
  const lineGap = Math.abs(startLine.top - endLine.top)
  const adjacent = lineGap > 8 && lineGap < 90
  if (adjacent) {
    for (const bend of [1, -1] as const) {
      const neat = neatCurve(start, end, bend)
      const points = cubicSamples(start, neat.c1, neat.c2, end)
      if (clearPath(points, obstacles)) return { d: neat.d, points }
    }
    const mid = (start.y + end.y) / 2
    const c1 = { x: start.x, y: mid }
    const c2 = { x: end.x, y: mid }
    const points = cubicSamples(start, c1, c2, end)
    if (clearPath(points, obstacles)) {
      return { d: `M ${start.x} ${start.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${end.x} ${end.y}`, points }
    }
  }
  // No full-card gutter detour. Related words still share the focus wash
  // when no short, unobstructed route fits between them.
  return null
}

// A relative-clause capsule sits above its words. When buttons or neighbouring
// capsules close both sides, arch from the capsule top over to the antecedent,
// within the existing annotation space, before giving up.
function antecedentRoute(start: Point, end: Point, obstacles: Box[], room: number) {
  for (const lift of [8, 16, 24, 36, 48, 64]) {
    const rail = Math.min(start.y, end.y) - lift
    const c1 = { x: start.x, y: rail }
    const c2 = { x: end.x, y: rail }
    const points = cubicSamples(start, c1, c2, end)
    if (points.some(point => point.y < -room + 2) || !clearPath(points, obstacles)) continue
    return { d: `M ${start.x} ${start.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${end.x} ${end.y}`, points }
  }
  return null
}

function spread(count: number) {
  return count === 0 ? 0 : (count % 2 === 0 ? -1 : 1) * Math.ceil(count / 2) * 12
}

function within(box: Box, x: number) {
  return Math.min(box.right - 2, Math.max(box.left + 2, x))
}

// The middle of a target's top edge may sit under the target's own capsule; an
// arrow then lands on the nearest stretch of that edge the capsules leave free.
function landingX(line: Box, labels: Box[], prefer: number) {
  const covered = (x: number) => labels.some(box => box.left - 4 <= x && x <= box.right + 4
    && box.bottom >= line.top - 14 && box.top <= line.top)
  if (!covered(prefer)) return prefer
  let best: number | null = null
  for (let x = line.left + 4; x <= line.right - 4; x += 2) {
    if (!covered(x) && (best === null || Math.abs(x - prefer) < Math.abs(best - prefer))) best = x
  }
  return best ?? prefer
}

// Leave the capsule sideways, then turn gently toward the actual word edge.
// Crowded or more distant relations use the clickable textual fallback instead.
function capsuleRoute(label: Box | undefined, sourceLine: Box | undefined, target: { at: Point; line: Box }, obstacles: Box[], labels: Box[]) {
  if (!label || !sourceLine) return null
  // The capsule sits between its own text row and the row above, so a target
  // on that upper row is as close as one on the capsule's own row.
  const rowAbove = target.line.bottom <= label.top + 2 && sourceLine.top - target.line.bottom < 90
  if (Math.abs(sourceLine.top - target.line.top) >= 8 && !rowAbove) return null
  const toward = (target.line.left + target.line.right) / 2 < (label.left + label.right) / 2 ? -1 : 1
  // Action buttons beside a capsule can close one side; the far side still
  // gives a short local route. A target on the row above may also be reached
  // from the capsule's top corner, clear of a button sitting beside it.
  const exits = [
    { direction: toward, top: false },
    { direction: -toward, top: false },
    ...(rowAbove ? [{ direction: toward, top: true }] : []),
  ]
  for (const { direction, top } of exits) {
    const start = top
      ? { x: direction < 0 ? label.left + 8 : label.right - 8, y: label.top }
      : { x: direction < 0 ? label.left : label.right, y: (label.top + label.bottom) / 2 }
    const above = start.y < (target.line.top + target.line.bottom) / 2
    // Every arrow lands on the middle of the target's highlight edge (the box
    // reaches 3px past the glyphs), so it reads as pointing at those words.
    const middle = (target.line.left + target.line.right) / 2
    const end = { x: above ? landingX(target.line, labels, middle) : middle, y: above ? target.line.top - 3 : target.line.bottom + 4 }
    const reach = Math.min(12, Math.max(4, Math.abs(end.x - start.x) / 3))
    const c1 = { x: start.x + direction * reach, y: start.y - (top ? 8 : 0) }
    const c2 = { x: end.x, y: end.y + (above ? -1 : 1) * Math.min(10, Math.abs(end.y - start.y) / 2) }
    const points = cubicSamples(start, c1, c2, end)
    if (!clearPath(points, obstacles)) continue
    target.at = end
    return { d: `M ${start.x} ${start.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${end.x} ${end.y}`, points }
  }
  return null
}

function endpoint(lines: Box[], label: Box | undefined, role: 'from' | 'to', other: Point | null, shift = 0): { at: Point; line: Box } | null {
  if (role === 'from' && label) {
    return { at: { x: within(label, (label.left + label.right) / 2 + shift), y: label.top }, line: label }
  }
  if (lines.length === 0) return null
  const line = other
    ? lines.reduce((best, item) => Math.abs((item.top + item.bottom) / 2 - other.y) < Math.abs((best.top + best.bottom) / 2 - other.y) ? item : best)
    : lines[0]
  const targetIsAbove = Boolean(other && line.bottom < other.y - 8)
  return {
    at: {
      x: within(line, (line.left + line.right) / 2 + shift),
      y: targetIsAbove ? line.bottom + 7 : line.top - 3,
    },
    line,
  }
}

export function rounded(box: Box, padX: number, padY: number, radius: number) {
  const x = box.left - padX
  const y = box.top - padY
  const w = box.right - box.left + padX * 2
  const h = box.bottom - box.top + padY * 2
  const r = Math.min(radius, h / 2, w / 2)
  return `M ${x + r} ${y} H ${x + w - r} Q ${x + w} ${y} ${x + w} ${y + r} V ${y + h - r} Q ${x + w} ${y + h} ${x + w - r} ${y + h} H ${x + r} Q ${x} ${y + h} ${x} ${y + h - r} V ${y + r} Q ${x} ${y} ${x + r} ${y} Z`
}

export function draw(analysis: SentenceAnalysisV1, focus: FocusState, measured: Measure): { paths: Drawn[]; missing: MissingRelation[] } {
  const obstacles = [...measured.glyphs, ...measured.notes, ...measured.labels.values()]
  const incoming = new Map<string, number>()
  const outgoing = new Map<string, number>()
  const arcs: Array<{ top: number; left: number; right: number }> = []
  const pairs = new Set<string>()
  const paths: Drawn[] = []
  const missing: MissingRelation[] = []
  const relations = relationsFor(analysis, focus)
  for (const relation of relations) {
    const origin = analysis.units.find(unit => unit.id === relation.from)
    const owner = origin && (origin.connector || origin.role === 'nonfinite-verb')
      ? analysis.units.find(unit => unit.id === origin.parentId) : origin
    // Only attributives are drawn (relationDisplay): a relative clause or an
    // attributive nonfinite phrase always points at the noun it modifies, even
    // right beside it, and a relative word's reference shares that arrow.
    if (!owner) continue
    relation.to.forEach((targetId, index) => {
      const pair = `${owner.id}>${targetId}`
      if (pairs.has(pair)) return
      pairs.add(pair)
      const connector = analysis.units.find(unit => unit.parentId === relation.from && unit.connector)
      const fromLines = measured.unitLines.get(connector?.id || relation.from) || []
      const toLines = measured.unitLines.get(targetId) || []
      const label = measured.labels.get(owner.id)
      // Keep the source capsule as the endpoint instead of drawing behind it.
      const used = incoming.get(targetId) || 0
      incoming.set(targetId, used + 1)
      const sent = outgoing.get(relation.from) || 0
      outgoing.set(relation.from, sent + 1)
      const source = endpoint(fromLines, label, 'from', null, spread(sent))
      if (!source) return
      const target = endpoint(toLines, undefined, 'to', source.at, spread(used))
      if (!target) return
      const otherLabels = [...measured.labels.values()].filter(box => box !== label)
      if (target.at.y < target.line.top) target.at.x = landingX(target.line, otherLabels, target.at.x)
      const sameRow = fromLines.some(line => Math.abs(line.top - target.line.top) < 8)
      let lane = 0
      if (Math.abs(source.line.top - target.line.top) < 8) {
        const left = Math.min(source.at.x, target.at.x)
        const right = Math.max(source.at.x, target.at.x)
        lane = arcs.filter((arc) => Math.abs(arc.top - source.line.top) < 8 && arc.left < right && left < arc.right).length
        arcs.push({ top: source.line.top, left, right })
      }
      const strokes = strokeObstacles(measured.strokes || [], [...fromLines, ...toLines])
      const routeObstacles = [...obstacles.filter(box => box !== label), ...strokes]
      // A line may leave along its own capsule's edge but never cut across it.
      const ownCapsule = label
        ? [...routeObstacles, { left: label.left + 3, right: label.right - 3, top: label.top + 3, bottom: label.bottom - 3 }]
        : routeObstacles
      const routed = capsuleRoute(label, fromLines[0], target, ownCapsule, otherLabels)
        || antecedentRoute(source.at, target.at, ownCapsule, measured.room ?? 40)
        || route(source.at, target.at, source.line, target.line, ownCapsule, lane)
      if (!routed) {
        // On the same row the shared highlight already shows the target.
        const fallback = sameRow ? '' : relationFallback(analysis, relation.kind, targetId)
        if (fallback && !missing.some(item => item.text === fallback)) {
          missing.push({ relationId: relation.id, targetId, text: fallback })
        }
        return
      }
      const previous = routed.points[routed.points.length - 2] || source.at
      const [left, right] = neatHead(target.at, previous)
      paths.push({
        id: `${relation.id}-${index}`,
        d: routed.d,
        color: 'var(--sa-green)',
        arrow: [left, target.at, right],
      })
    })
  }
  return { paths, missing }
}
