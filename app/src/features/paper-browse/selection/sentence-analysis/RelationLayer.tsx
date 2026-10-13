import { glyphOf, mergeLine, rounded, draw } from './relationGeometry'
import type { Box, Measure, Drawn, MissingRelation, StrokeBand } from './relationGeometry'
import { useLayoutEffect, useState } from 'react'
import type { RefObject } from 'react'
import { coverage } from '../../../../../../shared/sentence-analysis/derive.mjs'
import type { FocusState, SentenceAnalysisV1 } from '../../../../../../shared/sentence-analysis/types.d.mts'
import { underlinePaths, syncHoveredLines } from './underlines'
import type { GrammarFilter, LineKind, UnderlinePath, UnderlineRun } from './underlines'

// The card may still be scaling in when this runs; transforms do not fire ResizeObserver.
function localizer(root: HTMLElement) {
  const origin = root.getBoundingClientRect()
  const scale = root.offsetWidth && origin.width ? origin.width / root.offsetWidth : 1
  return (rect: DOMRect): Box => ({
    left: (rect.left - origin.left) / scale,
    right: (rect.right - origin.left) / scale,
    top: (rect.top - origin.top) / scale,
    bottom: (rect.bottom - origin.top) / scale,
  })
}

function measure(root: HTMLElement, analysis: SentenceAnalysisV1): Measure {
  const local = localizer(root)
  const glyphs: Box[] = []
  root.querySelectorAll<HTMLElement>('[data-sa-token]').forEach((node) => {
    const index = Number(node.dataset.saToken)
    for (const rect of node.getClientRects()) {
      const box = glyphOf(local(rect))
      box.top = glyphs[index] ? box.top : box.top
      glyphs[index] = glyphs[index]
        ? {
          left: Math.min(glyphs[index].left, box.left),
          right: Math.max(glyphs[index].right, box.right),
          top: Math.min(glyphs[index].top, box.top),
          bottom: Math.max(glyphs[index].bottom, box.bottom),
        }
        : box
    }
  })
  const unitLines = new Map<string, Box[]>()
  for (const unit of analysis.units) {
    const rects: Box[] = []
    for (const index of coverage(analysis, unit.id)) {
      const token = root.querySelector<HTMLElement>(`[data-sa-token="${index}"]`)
      if (!token) continue
      for (const rect of token.getClientRects()) rects.push(local(rect))
    }
    unitLines.set(unit.id, mergeLine(rects))
  }
  root.querySelectorAll<HTMLElement>('[data-sa-inserted]').forEach((node) => {
    for (const rect of node.getClientRects()) glyphs.push(glyphOf(local(rect)))
  })
  const labels = new Map<string, Box>()
  root.querySelectorAll<HTMLElement>('[data-sa-label]').forEach((node) => {
    const id = node.dataset.saLabel
    if (!id || node.hidden || node.dataset.yield !== undefined) return
    const rect = node.getBoundingClientRect()
    labels.set(id, local(rect))
  })
  const notes: Box[] = []
  root.querySelectorAll<HTMLElement>('.sa-local-action, .sa-shared-label, .sa-ink-connector').forEach(node => {
    notes.push(local(node.getBoundingClientRect()))
  })
  root.querySelectorAll<HTMLElement>('.sa-under').forEach((node) => {
    if (node.hidden || node.dataset.yield !== undefined) return
    for (const child of node.children) {
      if ((child as HTMLElement).hidden) continue
      for (const rect of child.getClientRects()) notes.push(local(rect))
    }
  })
  const room = root.parentElement ? Number.parseFloat(getComputedStyle(root.parentElement).paddingTop) || 0 : 0
  return { width: root.offsetWidth, height: root.offsetHeight, glyphs: glyphs.filter(Boolean), notes, unitLines, labels, room }
}

// A gliding word carries a relative offset; strokes are drawn where it will
// rest and travel there with it (see the glide effect below).
function atRest(node: HTMLElement, box: Box): Box {
  if (node.dataset.saMove === undefined) return box
  const style = getComputedStyle(node)
  const x = Number.parseFloat(style.left) || 0
  const y = Number.parseFloat(style.top) || 0
  return { left: box.left - x, right: box.right - x, top: box.top - y, bottom: box.bottom - y }
}

// Which word glide each run is following, so a repaint mid-move keeps it and a
// new move replaces it.
const following = new WeakMap<SVGPathElement, { clock: Animation; glide: Animation }>()

function glideOf(node: Element | null) {
  return node?.getAnimations().find(animation => (animation.effect as KeyframeEffect | null)?.getKeyframes()[0]?.left !== undefined)
}

function startOffset(animation: Animation | undefined) {
  const frame = (animation?.effect as KeyframeEffect | undefined)?.getKeyframes()[0]
  return { x: Number.parseFloat(String(frame?.left ?? 0)) || 0, y: Number.parseFloat(String(frame?.top ?? 0)) || 0 }
}

// The vertical distance a gliding word still has to travel. Words in one run
// that started on different lines cannot move as one piece, so mid-move a run
// breaks wherever this changes and joins again once the words have settled.
function rise(node: HTMLElement) {
  return node.dataset.saMove === undefined ? 0 : startOffset(glideOf(node)).y
}

function underlines(root: HTMLElement): { paths: UnderlinePath[]; bands: StrokeBand[] } {
  const local = localizer(root)
  const runs: Array<{ key: string; kind: LineKind; unitId: string; active: boolean; first: number; last: number; box: Box; rise: number }> = []
  // Reading order on screen, which a restore may have changed; runs join only
  // words that are neighbours both in the sentence and on screen.
  const tokens = [...root.querySelectorAll<HTMLElement>('[data-sa-token][data-sa-line]')]
  const printed: Box[] = []
  for (const node of tokens) {
    const index = Number(node.dataset.saToken)
    const kind = node.dataset.saLine as LineKind
    const unitId = node.dataset.saLineUnit || ''
    const active = node.dataset.saLineActive !== undefined
    const key = `${kind}:${unitId}:${active}`
    const box = atRest(node, glyphOf(local(node.getBoundingClientRect())))
    const lift = rise(node)
    printed[index] = box
    const run = runs[runs.length - 1]
    // A complement bracket has end caps, so it bridges the punctuation and
    // connectors inside its own unit instead of breaking into one cup per word.
    const next = run && (run.last === index - 1 || (kind === 'complement' && index > run.last))
    if (run && run.key === key && next && Math.abs(run.box.top - box.top) < 8 && Math.abs(run.rise - lift) < 0.5) {
      run.last = index
      run.box.right = Math.max(run.box.right, box.right)
      run.box.bottom = Math.max(run.box.bottom, box.bottom)
    } else {
      runs.push({ key, kind, unitId, active, first: index, last: index, box: { ...box }, rise: lift })
    }
  }
  // A one-letter word ("I") leaves too little room for a curved stroke to read
  // as itself, so a run narrower than the hand's minimum widens toward its
  // neighbours' gaps symmetrically — never closer than a hairline to a stroke
  // that already sits there (e.g. a dashed adverbial ending one word earlier).
  const MIN_RUN = 10
  const GAP = 1.5
  for (const run of runs) {
    const width = run.box.right - run.box.left
    if (width >= MIN_RUN) continue
    const before = printed.slice(0, run.first).reverse().find(box => box && Math.abs(box.top - run.box.top) < 8)
    const after = printed.slice(run.last + 1).find(box => box && Math.abs(box.top - run.box.top) < 8)
    const room = Math.min(
      before ? Math.max(0, run.box.left - before.right - GAP) : MIN_RUN,
      after ? Math.max(0, after.left - run.box.right - GAP) : MIN_RUN,
      (MIN_RUN - width) / 2,
    )
    run.box.left -= room
    run.box.right += room
  }
  return {
    paths: runs.flatMap((run) => underlinePaths(run.kind, run.box.left, run.box.right, run.box.bottom + 2)
      .map(path => ({
        ...path,
        unitId: run.unitId,
        active: run.active,
        run: { first: run.first, last: run.last, left: run.box.left, right: run.box.right },
      }))),
    // Strokes sit 2px under the glyphs and swing about 4px either way.
    bands: runs.map(run => ({ unitId: run.unitId, box: { left: run.box.left, right: run.box.right, top: run.box.bottom, bottom: run.box.bottom + 7 } })),
  }
}

type Fill = { state: string; d: string; run: UnderlineRun }

function stateFills(root: HTMLElement): Fill[] {
  const local = localizer(root)
  const owners = new Map<number, string>()
  const boxes = new Map<number, Box>()
  const lifts = new Map<number, number>()
  const order: number[] = []
  // Every printed piece in reading order, so a run can see its true neighbours.
  const printed: Box[] = []
  const place = new Map<number, number>()
  root.querySelectorAll<HTMLElement>('[data-sa-token], [data-sa-inserted]').forEach((node) => {
    const box = atRest(node, glyphOf(local(node.getBoundingClientRect())))
    printed.push(box)
    const state = node.dataset.saState
    if (node.dataset.saToken === undefined || (state !== 'focused' && state !== 'related' && state !== 'subject')) return
    // Clause focus uses the same word-run wash as other selections.
    const index = Number(node.dataset.saToken)
    place.set(index, printed.length - 1)
    owners.set(index, `${state}:${node.dataset.saBlock || ''}`)
    boxes.set(index, box)
    lifts.set(index, rise(node))
    order.push(index)
  })
  // A word space is only ~0.25em: each edge takes under half of it, so a frame
  // hugs its own words and two neighbouring runs keep a hairline apart.
  const reach = (box: Box, neighbour: Box | undefined, gap: (other: Box) => number) => {
    if (!neighbour || Math.abs(neighbour.top - box.top) >= 8) return 4
    return Math.min(4, Math.max(1, gap(neighbour) * 0.4))
  }
  const runs: Array<{ key: string; first: number; last: number; box: Box }> = []
  for (const index of order) {
    const key = owners.get(index) as string
    const box = boxes.get(index) as Box
    const run = runs[runs.length - 1]
    if (run && run.key === key && run.last === index - 1 && Math.abs(run.box.top - box.top) < 8
      && Math.abs((lifts.get(run.last) ?? 0) - (lifts.get(index) ?? 0)) < 0.5) {
      run.last = index
      run.box = { left: Math.min(run.box.left, box.left), right: Math.max(run.box.right, box.right), top: Math.min(run.box.top, box.top), bottom: Math.max(run.box.bottom, box.bottom) }
    } else {
      runs.push({ key, first: index, last: index, box: { ...box } })
    }
  }
  return runs.map((run) => {
    const first = place.get(run.first) as number
    const last = place.get(run.last) as number
    const box = {
      ...run.box,
      left: run.box.left - reach(run.box, printed[first - 1], other => run.box.left - other.right),
      right: run.box.right + reach(run.box, printed[last + 1], other => other.left - run.box.right),
    }
    return { state: run.key.split(':')[0], d: rounded(box, 0, 3, 3), run: { first: run.first, last: run.last, left: box.left, right: box.right } }
  })
}

type Scene = { paths: Drawn[]; fills: Fill[]; lines: UnderlinePath[] }

export function RelationLayer({
  sentenceRef,
  analysis,
  focus,
  selectedRole,
  locate = 0,
  repaint = '',
  showRelations = true,
  onMissingRelations,
}: {
  sentenceRef: RefObject<HTMLElement | null>
  analysis: SentenceAnalysisV1
  focus: FocusState
  selectedRole: GrammarFilter | null
  locate?: number
  repaint?: string
  showRelations?: boolean
  onMissingRelations: (unitId: string, lines: MissingRelation[]) => void
}) {
  const [scene, setScene] = useState<Scene>({ paths: [], fills: [], lines: [] })
  const focusKey = focus.kind === 'main' ? 'main' : focus.unitId

  useLayoutEffect(() => {
    let frame = 0
    let live = true
    const paint = () => {
      frame = 0
      const root = sentenceRef.current
      if (!live || !root) return
      const strokes = underlines(root)
      const drawn = showRelations ? draw(analysis, focus, { ...measure(root, analysis), strokes: strokes.bands }) : { paths: [], missing: [] }
      setScene({
        paths: drawn.paths,
        fills: stateFills(root),
        lines: strokes.paths,
      })
      onMissingRelations(focus.kind === 'unit' ? focus.unitId : '', drawn.missing)
    }
    const schedule = () => {
      if (frame) return
      frame = window.requestAnimationFrame(paint)
    }
    const observer = new ResizeObserver(schedule)
    queueMicrotask(() => {
      if (!live || !sentenceRef.current) return
      observer.observe(sentenceRef.current)
      paint()
    })
    window.addEventListener('resize', schedule)
    void document.fonts?.ready.then(paint)
    document.fonts?.addEventListener('loadingdone', schedule)
    return () => {
      live = false
      observer.disconnect()
      window.removeEventListener('resize', schedule)
      document.fonts?.removeEventListener('loadingdone', schedule)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [analysis, focus, selectedRole, sentenceRef, repaint, showRelations, onMissingRelations])

  useLayoutEffect(() => {
    if (sentenceRef.current) syncHoveredLines(sentenceRef.current)
  }, [scene, sentenceRef])

  // Washes and strokes stay on screen through a reorder and ride with their
  // words: each run moves (and stretches, if a restored piece opened inside
  // it) on the clock of the words it covers.
  useLayoutEffect(() => {
    const root = sentenceRef.current
    if (!root || root.dataset.saMoving === undefined) return
    const fills = root.querySelectorAll<SVGPathElement>('.sa-underlay .sa-fill')
    const lines = root.querySelectorAll<SVGPathElement>('.sa-underlines > .sa-underline')
    const pairs: Array<[SVGPathElement | undefined, UnderlineRun | undefined]> = [
      ...scene.fills.map((fill, index): [SVGPathElement | undefined, UnderlineRun] => [fills[index], fill.run]),
      ...scene.lines.map((line, index): [SVGPathElement | undefined, UnderlineRun | undefined] => [lines[index], line.run]),
    ]
    for (const [path, run] of pairs) {
      if (!path || !run || typeof path.animate !== 'function') continue
      const firstGlide = glideOf(root.querySelector(`[data-sa-token="${run.first}"]`))
      const lastGlide = glideOf(root.querySelector(`[data-sa-token="${run.last}"]`))
      const clock = firstGlide ?? lastGlide
      const current = following.get(path)
      if (current && current.clock === clock && current.glide.playState === 'running') continue
      current?.glide.cancel()
      if (!clock) continue
      const from = startOffset(firstGlide)
      const to = startOffset(lastGlide)
      const timing = clock.effect?.getTiming() ?? {}
      let glide: Animation
      if (Math.abs(from.y - to.y) > 0.5) {
        // The run was split across lines before; it cannot travel as one piece.
        glide = path.animate([{ opacity: 0 }, { opacity: 0, offset: 0.85 }, { opacity: 1 }], timing)
      } else {
        const width = run.right - run.left
        const stretch = width > 0 ? (width + to.x - from.x) / width : 1
        path.style.transformOrigin = `${run.left}px 0px`
        glide = path.animate([
          { transform: `translate(${from.x}px, ${from.y}px) scaleX(${stretch})` },
          { transform: 'translate(0px, 0px) scaleX(1)' },
        ], timing)
      }
      if (clock.currentTime !== null) glide.currentTime = clock.currentTime
      following.set(path, { clock, glide })
    }
  }, [scene, sentenceRef])

  return (
    <>
      <svg className="sa-underlay" width="100%" height="100%" aria-hidden="true" data-sa-decoration="">
        <g key={`fill-${focusKey}-${locate}`} className="sa-guides" data-locate={locate > 0 ? '' : undefined}>
          {scene.fills.map((fill, index) => <path key={`state-${index}`} className="sa-fill" data-state={fill.state} d={fill.d} />)}
        </g>
      </svg>
      <svg className="sa-relations" width="100%" height="100%" aria-hidden="true" data-sa-decoration="">
        <g className="sa-underlines">
          {scene.lines.map((line, index) => <path key={`line-${index}`} className="sa-underline" data-kind={line.kind}
            data-unit={line.unitId} data-active={line.active ? '' : undefined} d={line.d} strokeDasharray={line.dash} />)}
        </g>
        <g key={`focus-${focusKey}`} className="sa-guides">
          {scene.paths.map((path) => (
            <g key={path.id} data-sa-relation={path.id} style={{ color: path.color }}>
              {path.caption ? <text className="sa-relation-caption" data-logical-subject-caption="" x={path.caption.x} y={path.caption.y} textAnchor="middle">{path.caption.text}</text> : null}
              <path className="sa-guide" d={path.d} />
              <path className="sa-guide sa-arrow" d={`M ${path.arrow[0].x} ${path.arrow[0].y} L ${path.arrow[1].x} ${path.arrow[1].y} L ${path.arrow[2].x} ${path.arrow[2].y}`} />
            </g>
          ))}
        </g>
      </svg>
    </>
  )
}
