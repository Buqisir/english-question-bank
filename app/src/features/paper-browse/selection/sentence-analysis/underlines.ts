export type LineKind = 'subject' | 'predicate' | 'object' | 'adverbial' | 'attributive' | 'complement'
export type GrammarFilter = LineKind | 'trunk'
export type UnderlineRun = { first: number; last: number; left: number; right: number }
export type UnderlinePath = { kind: LineKind; d: string; dash?: string; unitId?: string; active?: boolean; run?: UnderlineRun }

// Hover is paint only and never repaints the stroke layer, so the hovered
// unit's stroke is marked in place. Both the sentence and the stroke layer
// call this after they render, so neither can leave a stale mark.
export function syncHoveredLines(root: HTMLElement) {
  const hovered = new Set([...root.querySelectorAll<HTMLElement>('[data-sa-token][data-sa-state="hover"][data-sa-line-unit]')]
    .map(token => token.dataset.saLineUnit))
  root.querySelectorAll<SVGPathElement>('.sa-underline').forEach(path => {
    if (path.dataset.unit && hovered.has(path.dataset.unit)) path.dataset.hover = ''
    else delete path.dataset.hover
  })
}

// Stable strokes: deliberate curvature, no random jitter between renders.
function stroke(left: number, right: number, y: number, lower = false) {
  const width = right - left
  const bow = Math.min(1.1, width / 100)
  return `M ${left} ${y} C ${left + width * .25} ${y + bow} ${left + width * .72} ${y + (lower ? -.35 : -.65)} ${right} ${y + .2}`
}

export function underlinePaths(kind: LineKind, x1: number, x2: number, y: number): UnderlinePath[] {
  // Under ~12px a bowed curve collapses into a squiggle; a subject's two lines
  // still read as a pair when they are straight and slightly apart.
  const short = x2 - x1 < 12
  const left = x1 + 1
  const right = Math.max(left + 1, x2 - 1)
  if (short) {
    if (kind === 'subject') return [
      { kind, d: `M ${left} ${y + 0.8} L ${right} ${y + 0.8}` },
      { kind, d: `M ${left} ${y + 3.8} L ${right} ${y + 3.8}` },
    ]
    if (kind === 'predicate') return [{ kind, d: `M ${left} ${y + 1} L ${right} ${y + 1}` }]
    if (kind === 'adverbial') return [{ kind, d: `M ${left} ${y + 1} L ${right} ${y + 1}`, dash: '4 4' }]
    if (kind === 'attributive') return [{ kind, d: `M ${left} ${y + 1} L ${right} ${y + 1}`, dash: '0.1 4' }]
  }
  if (kind === 'adverbial' || kind === 'attributive') return [{ kind, d: stroke(left, right, y + 1), dash: kind === 'adverbial' ? '4 4' : '0.1 4' }]
  if (kind === 'complement') return [{ kind, d: `M ${left} ${y - 1} L ${left + .2} ${y + 2} Q ${left + .4} ${y + 3.5} ${left + 2} ${y + 3.5} H ${right - 2} Q ${right} ${y + 3.5} ${right} ${y + 2} L ${right + .2} ${y - 1}` }]
  if (kind === 'subject') return [
    { kind, d: stroke(left, right, y) },
    { kind, d: stroke(left + 1.5, Math.max(left + 2, right - 1.5), y + 3.4, true) },
  ]
  if (kind === 'predicate') return [{ kind, d: stroke(left, right, y + 1) }]
  const count = Math.max(2, Math.round((right - left) / 9))
  const step = (right - left) / count
  let d = `M ${left} ${y + 1.5}`
  for (let i = 0; i < count; i++) {
    const from = left + i * step
    const direction = i % 2 ? 1 : -1
    const lift = direction * (i % 3 === 0 ? 2.05 : 1.8)
    d += ` C ${from + step * .3} ${y + 1.5 + lift} ${from + step * .7} ${y + 1.5 + lift} ${from + step} ${y + 1.5}`
  }
  return [{ kind, d }]
}
