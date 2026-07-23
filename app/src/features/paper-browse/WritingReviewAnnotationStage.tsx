import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { ApplicationWritingAnalysis } from '../../domain/paperAsset.ts'
import { reviewMarkLabel, type LectureExpression } from './WritingAnswerBoxReview'

type Rect = { left: number; right: number; top: number; bottom: number }
type Point = { x: number; y: number }
type Item = { id: string; label: string; note: string; transfer?: string; anchor: string }
type Route = { start: Point; control: Point; end: Point; samples: Point[]; d: string }
type PlacedNote = Item & { left: number; top: number; width: number; rect: Rect; route: Route }
type Candidate = { rect: Rect; width: number; route: Route; score: number }

const NOTE_GAP = 8

function overlaps(a: Rect, b: Rect, gap = 0) {
  return !(a.right + gap <= b.left || a.left >= b.right + gap || a.bottom + gap <= b.top || a.top >= b.bottom + gap)
}

function pointInRect(point: Point, rect: Rect, gap = 0) {
  return point.x >= rect.left - gap && point.x <= rect.right + gap && point.y >= rect.top - gap && point.y <= rect.bottom + gap
}

function relativeRect(rect: DOMRect, root: DOMRect): Rect {
  return { left: rect.left - root.left, right: rect.right - root.left, top: rect.top - root.top, bottom: rect.bottom - root.top }
}

function center(rect: Rect): Point {
  return { x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2 }
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function segmentCrosses(a: Point, b: Point, c: Point, d: Point) {
  const direction = (first: Point, second: Point, third: Point) =>
    (third.x - first.x) * (second.y - first.y) - (third.y - first.y) * (second.x - first.x)
  const abC = direction(a, b, c)
  const abD = direction(a, b, d)
  const cdA = direction(c, d, a)
  const cdB = direction(c, d, b)
  return ((abC > 0 && abD < 0) || (abC < 0 && abD > 0)) && ((cdA > 0 && cdB < 0) || (cdA < 0 && cdB > 0))
}

function routesCross(a: Route, b: Route) {
  const aPoints = [a.start, ...a.samples, a.end]
  const bPoints = [b.start, ...b.samples, b.end]
  return aPoints.some(
    (point, index) =>
      index < aPoints.length - 1 &&
      bPoints.some(
        (other, otherIndex) => otherIndex < bPoints.length - 1 && segmentCrosses(point, aPoints[index + 1], other, bPoints[otherIndex + 1]),
      ),
  )
}

function routeFrom(anchor: Rect, note: Rect, seed: number): Route {
  const anchorCenter = center(anchor)
  const targetCenter = center(note)
  const horizontal = Math.abs(targetCenter.x - anchorCenter.x) >= Math.abs(targetCenter.y - anchorCenter.y)
  const source = horizontal
    ? {
        x: targetCenter.x < anchorCenter.x ? anchor.left - 2 : anchor.right + 2,
        y: clamp(targetCenter.y, anchor.top + 2, anchor.bottom - 2),
      }
    : {
        x: clamp(targetCenter.x, anchor.left + 3, anchor.right - 3),
        y: targetCenter.y < anchorCenter.y ? anchor.top - 2 : anchor.bottom + 2,
      }
  const end = horizontal
    ? { x: targetCenter.x < source.x ? note.right + 2 : note.left - 2, y: clamp(source.y, note.top + 7, note.bottom - 7) }
    : { x: clamp(source.x, note.left + 9, note.right - 9), y: targetCenter.y < source.y ? note.bottom + 2 : note.top - 2 }
  const dx = end.x - source.x
  const dy = end.y - source.y
  const length = Math.max(1, Math.hypot(dx, dy))
  const normal = { x: -dy / length, y: dx / length }
  const bow = (seed % 2 ? 1 : -1) * Math.min(7, Math.max(2, length * 0.045))
  const control = { x: (source.x + end.x) / 2 + normal.x * bow, y: (source.y + end.y) / 2 + normal.y * bow }
  const samples = Array.from({ length: 12 }, (_, index) => {
    const t = (index + 1) / 13
    const mt = 1 - t
    return {
      x: mt * mt * source.x + 2 * mt * t * control.x + t * t * end.x,
      y: mt * mt * source.y + 2 * mt * t * control.y + t * t * end.y,
    }
  })
  return { start: source, control, end, samples, d: `M ${source.x} ${source.y} Q ${control.x} ${control.y}, ${end.x} ${end.y}` }
}

function splitAnchors(line: string, anchors: string[]) {
  const matches = anchors
    .map((anchor) => ({ anchor, start: line.indexOf(anchor) }))
    .filter((match) => match.start >= 0)
    .sort((a, b) => a.start - b.start || b.anchor.length - a.anchor.length)
  if (!matches.length) return line
  const parts: ReactNode[] = []
  let cursor = 0
  matches.forEach(({ anchor, start }) => {
    if (start < cursor) return
    parts.push(
      line.slice(cursor, start),
      <mark data-awl-anchor={anchor} key={`${anchor}-${start}`}>
        {anchor}
      </mark>,
    )
    cursor = start + anchor.length
  })
  parts.push(line.slice(cursor))
  return parts
}

function textObstacles(essay: HTMLElement, rootRect: DOMRect) {
  const obstacles: Rect[] = []
  const walker = document.createTreeWalker(essay, NodeFilter.SHOW_TEXT)
  let node: Node | null
  while ((node = walker.nextNode())) {
    if (!node.textContent?.trim()) continue
    const range = document.createRange()
    range.selectNodeContents(node)
    for (const rect of range.getClientRects()) {
      if (rect.width > 1 && rect.height > 1) {
        const relative = relativeRect(rect, rootRect)
        obstacles.push({ left: relative.left - 4, right: relative.right + 4, top: relative.top - 4, bottom: relative.bottom + 4 })
      }
    }
  }
  return obstacles
}

function candidatesFor(
  noteElement: HTMLElement,
  anchor: Rect,
  root: HTMLElement,
  frame: Rect,
  obstacles: Rect[],
  seed: number,
): Candidate[] {
  const baseWidth = Math.round(noteElement.getBoundingClientRect().width)
  const widths = [...new Set([baseWidth, Math.round(baseWidth * 0.82), Math.round(baseWidth * 0.66), 80])].sort((a, b) => b - a)
  const rootWidth = root.clientWidth
  const rootHeight = root.clientHeight
  const anchorCenter = center(anchor)
  const all: (Candidate & { lane: 'left' | 'right' | 'inner' })[] = []

  for (const width of widths) {
    noteElement.style.width = `${width}px`
    const height = noteElement.getBoundingClientRect().height
    for (let top = 6; top <= rootHeight - height - 6; top += 8) {
      for (let left = 6; left <= rootWidth - width - 6; left += 8) {
        const rect = { left, right: left + width, top, bottom: top + height }
        if (obstacles.some((obstacle) => overlaps(rect, obstacle, 1))) continue
        const route = routeFrom(anchor, rect, seed)
        const lane = rect.right <= frame.left ? 'left' : rect.left >= frame.right ? 'right' : 'inner'
        const distance = Math.hypot((center(rect).x - anchorCenter.x) * 0.74, (center(rect).y - anchorCenter.y) * 1.18)
        const shrink = (baseWidth - width) * 0.4
        const laneBonus = lane === 'inner' ? 0 : -22
        all.push({
          rect,
          width,
          route,
          lane,
          score: distance + shrink + laneBonus + ((Math.round(left) + Math.round(top) + seed * 17) % 11) * 0.1,
        })
      }
    }
  }
  noteElement.style.width = `${baseWidth}px`
  const baseLanes = new Set(all.filter((candidate) => candidate.width === baseWidth).map((candidate) => candidate.lane))
  return all
    .filter(
      (candidate) =>
        candidate.width === baseWidth || ((candidate.lane === 'left' || candidate.lane === 'right') && !baseLanes.has(candidate.lane)),
    )
    .sort((a, b) => a.score - b.score)
    .filter(
      (candidate, index, values) =>
        index < 48 &&
        !values
          .slice(0, index)
          .some(
            (other) =>
              Math.abs(other.rect.left - candidate.rect.left) < 12 &&
              Math.abs(other.rect.top - candidate.rect.top) < 12 &&
              other.width === candidate.width,
          ),
    )
}

function solve(items: Item[], root: HTMLElement, frame: Rect, obstacles: Rect[], seed: number): PlacedNote[] {
  const rootRect = root.getBoundingClientRect()
  const entries = items
    .map((item) => {
      const element = root.querySelector<HTMLElement>(`[data-awl-note="${CSS.escape(item.id)}"]`)
      const anchorElement = root.querySelector<HTMLElement>(`[data-awl-anchor="${CSS.escape(item.anchor)}"]`)
      const anchorClient = anchorElement?.getBoundingClientRect()
      if (!element || !anchorClient) return null
      const anchor = relativeRect(anchorClient, rootRect)
      return { item, anchor, candidates: candidatesFor(element, anchor, root, frame, obstacles, seed) }
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((a, b) => a.candidates.length - b.candidates.length)

  const sideFallback = (): PlacedNote[] => {
    const laneTop = { left: 6, right: 6 }
    return [...entries]
      .sort((a, b) => a.anchor.top - b.anchor.top)
      .map((entry, index) => {
        const element = root.querySelector<HTMLElement>(`[data-awl-note="${CSS.escape(entry.item.id)}"]`)
        const width = 80
        if (!element) return null
        element.style.width = `${width}px`
        const height = element.getBoundingClientRect().height
        const lane = index % 2 === 0 ? 'left' : 'right'
        const top = laneTop[lane]
        laneTop[lane] += height + NOTE_GAP
        if (top + height > root.clientHeight - 6) return null
        const left = lane === 'left' ? 6 : root.clientWidth - width - 6
        const rect = { left, right: left + width, top, bottom: top + height }
        return { ...entry.item, left, top, width, rect, route: routeFrom(entry.anchor, rect, seed) }
      })
      .filter((note): note is PlacedNote => note !== null)
  }

  let states: { placed: { item: Item; candidate: Candidate }[]; score: number }[] = [{ placed: [], score: 0 }]
  for (const entry of entries) {
    const next: { placed: { item: Item; candidate: Candidate }[]; score: number }[] = []
    for (const state of states) {
      for (const candidate of entry.candidates) {
        if (
          state.placed.some(
            ({ candidate: prior }) => overlaps(candidate.rect, prior.rect, NOTE_GAP) || routesCross(candidate.route, prior.route),
          )
        )
          continue
        if (
          state.placed.some(
            ({ candidate: prior }) =>
              candidate.route.samples.some((point) => pointInRect(point, prior.rect, 4)) ||
              prior.route.samples.some((point) => pointInRect(point, candidate.rect, 4)),
          )
        )
          continue
        next.push({ placed: [...state.placed, { item: entry.item, candidate }], score: state.score + candidate.score })
      }
    }
    states = next.sort((a, b) => a.score - b.score).slice(0, 96)
    if (!states.length) {
      const fallback: { item: Item; candidate: Candidate }[] = []
      for (const remaining of [...entries].sort((a, b) => a.anchor.top - b.anchor.top)) {
        const candidate = remaining.candidates.find(({ rect }) => !fallback.some(({ candidate: placed }) => overlaps(rect, placed.rect, NOTE_GAP)))
        if (!candidate) return sideFallback()
        fallback.push({ item: remaining.item, candidate })
      }
      return fallback.map(({ item, candidate }) => ({
        ...item,
        left: candidate.rect.left,
        top: candidate.rect.top,
        width: candidate.width,
        rect: candidate.rect,
        route: candidate.route,
      }))
    }
  }
  return (states[0]?.placed ?? []).map(({ item, candidate }) => ({
    ...item,
    left: candidate.rect.left,
    top: candidate.rect.top,
    width: candidate.width,
    rect: candidate.rect,
    route: candidate.route,
  }))
}

export function WritingReviewAnnotationStage({ analysis }: { analysis: ApplicationWritingAnalysis }) {
  const [tab, setTab] = useState<0 | 1>(0)
  const [seed, setSeed] = useState(0)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [notes, setNotes] = useState<PlacedNote[]>([])
  const items = useMemo<Item[]>(() => {
    const reviewItems = analysis.reviewMarks!.map((mark, index) => ({
      id: `review-${index}`,
      label: reviewMarkLabel(mark, index, analysis),
      note: mark.note,
      anchor: mark.text,
    }))
    const highlightItems = analysis.highlightExpressions
      .filter((item): item is LectureExpression => Boolean(item.lectureAnnotation))
      .map((item, index) => ({
        id: `highlight-${index}`,
        label: item.lectureAnnotation.label,
        note: item.lectureAnnotation.note,
        transfer: item.lectureAnnotation.transferExample,
        anchor: item.text,
      }))
    return tab === 0 ? reviewItems : highlightItems
  }, [analysis, tab])
  const anchors = useMemo(() => items.map((item) => item.anchor), [items])

  useLayoutEffect(() => {
    const root = rootRef.current
    const essay = root?.querySelector<HTMLElement>('.awl-essay')
    const frameElement = root?.querySelector<HTMLElement>('.awl-stage-frame')
    if (!root || !essay || !frameElement) return
    const layout = () => {
      const rootRect = root.getBoundingClientRect()
      const frame = relativeRect(frameElement.getBoundingClientRect(), rootRect)
      const placed = solve(items, root, frame, textObstacles(essay, rootRect), seed)
      setNotes(placed)
    }
    layout()
    const observer = new ResizeObserver(layout)
    observer.observe(root)
    void document.fonts?.ready.then(layout)
    return () => observer.disconnect()
  }, [items, seed])

  return (
    <section className="awl-stage" data-awl-stage="" ref={rootRef}>
      <div className="awl-stage-frame">
        <header className="awl-stage-header">
          <strong>范文讲评</strong>
          <span>原文阅读流</span>
        </header>
        <div className="awl-stage-tabs" role="tablist" aria-label="范文讲评视图">
          {(['审题要点', '亮点句式'] as const).map((label, index) => (
            <button key={label} type="button" role="tab" aria-selected={tab === index} onClick={() => setTab(index as 0 | 1)}>
              {label}
            </button>
          ))}
          <button type="button" className="awl-reseed" onClick={() => setSeed((value) => value + 1)}>
            重新寻位
          </button>
        </div>
        <article className="awl-essay">
          {analysis.modelAnswer
            .split(/\r?\n/)
            .filter(Boolean)
            .map((line, index) => (
              <p key={index}>{splitAnchors(line, anchors)}</p>
            ))}
        </article>
      </div>
      <svg className="awl-leaders" aria-hidden="true" viewBox="0 0 794 472" preserveAspectRatio="none">
        <defs>
          <marker id="awl-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6" />
          </marker>
        </defs>
        {notes.map((note) => (
          <path key={note.id} d={note.route.d} markerEnd="url(#awl-arrow)" />
        ))}
      </svg>
      <div className="awl-note-layer" aria-live="polite">
        {items.map((item) => {
          const note = notes.find((placed) => placed.id === item.id)
          return (
            <div
              className="awl-note"
              data-awl-note={item.id}
              key={item.id}
              style={note ? { left: note.left, top: note.top, width: note.width } : { left: 0, top: 0, visibility: 'hidden' }}
            >
              <b>{item.label}</b>
              <span>{item.note}</span>
              {item.transfer && <em>{item.transfer}</em>}
            </div>
          )
        })}
      </div>
    </section>
  )
}
