/**
 * evidenceLinking — pure rules behind the LinkOverlay SVG path.
 *
 * Everything here is browserless and side-effect free except for the explicit
 * DOM-resolution helpers (`resolveSource` / `resolveTarget`), which are still
 * pure functions of (container, args) — no listeners, no state.
 *
 * What lives here:
 *   - `findActiveLink`              — selection + links → current link or null
 *   - `resolveSource` / `resolveTarget` — anchor priority lookups
 *   - `rectsToEndpoints`            — DOM rects → SVG-space (sx, sy, tx, ty)
 *   - `buildCubicPath`              — endpoints → SVG `d` string
 *   - `computeOverlayGeometry`      — full container/source/target rects → Geometry
 *   - `advanceAnimationInstance`    — pure animation-id reducer
 *   - `detectReducedMotion`         — wraps matchMedia (DOM-touching, but
 *                                     trivially mockable: see test fakes)
 *
 * Source priority (matches the original LinkOverlay; do not change without
 * also updating anchorKeys + QuestionPanel):
 *
 *   stem   → [data-ra-link-source="q:<qid>"]
 *   option → [data-ra-option-anchor="q:<qid>:<KEY>"]            (preferred)
 *          → [data-ra-link-source="q:<qid>:<KEY>"]              (fallback)
 *
 * Target priority:
 *
 *   1. [data-ra-quote-anchor="<annotation.id>"]                 (preferred)
 *   2. [data-ra-sentence-id="<annotation.target.sentenceId>"]   (fallback)
 */

import {
  optionBadgeSourceSelector,
  optionLegacySourceSelector,
  quoteTargetSelector,
  sentenceTargetSelector,
  stemSourceSelector,
} from './anchorKeys.ts'
import type {
  ActiveSelection,
  EvidenceLink,
  ReadingAnnotation,
} from '../readingAnalysisTypes.ts'

/* ─────────────────────────── Geometry types ─────────────────────────────── */

export type Geometry = {
  d: string
  width: number
  height: number
}

export type LinkEndpoints = {
  sx: number
  sy: number
  tx: number
  ty: number
}

/** Plain rectangle shape — matches `DOMRect` for the fields we read. */
export type RectLike = {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

export type ResolvedTarget = {
  el: HTMLElement
  kind: 'quote' | 'sentence'
}

/* ───────────────────────── Active link selection ────────────────────────── */

/**
 * Pick the link the overlay should currently render for a given selection.
 * Stem selection matches a stem-only link (no `optionKey`); option selection
 * matches the link with the same `optionKey`. Returns null when nothing is
 * selected or no link matches.
 */
export function findActiveLink(
  selection: ActiveSelection,
  links: readonly EvidenceLink[],
): EvidenceLink | null {
  if (selection.kind === 'none') return null
  if (selection.kind === 'stem') {
    return (
      links.find(
        (l) =>
          l.from.questionId === selection.questionId && !l.from.optionKey,
      ) ?? null
    )
  }
  return (
    links.find(
      (l) =>
        l.from.questionId === selection.questionId &&
        l.from.optionKey === selection.optionKey,
    ) ?? null
  )
}

/* ───────────────────────── Selector priority lists ──────────────────────── */

/**
 * Ordered selectors the overlay would try, in priority order, to resolve the
 * source element for `selection`. Empty array for `{kind:'none'}`. Exposed
 * so tests can verify priority without a real DOM.
 */
export function sourceSelectorsFor(
  selection: ActiveSelection,
): readonly string[] {
  if (selection.kind === 'stem') {
    return [stemSourceSelector(selection.questionId)]
  }
  if (selection.kind === 'option') {
    return [
      optionBadgeSourceSelector(selection.questionId, selection.optionKey),
      optionLegacySourceSelector(selection.questionId, selection.optionKey),
    ]
  }
  return []
}

/**
 * Ordered selectors for resolving the target element of `annotation`. The
 * returned tuple keeps the matched anchor "kind" alongside its selector so
 * `resolveTarget` can report back which anchor it landed on (overlay reads
 * this for diagnostic data attributes; tests read it to verify priority).
 */
export function targetSelectorsFor(
  annotation: ReadingAnnotation,
): ReadonlyArray<{ kind: ResolvedTarget['kind']; selector: string }> {
  return [
    { kind: 'quote', selector: quoteTargetSelector(annotation.id) },
    {
      kind: 'sentence',
      selector: sentenceTargetSelector(annotation.target.sentenceId),
    },
  ]
}

/* ───────────────────────── DOM resolution helpers ───────────────────────── */

/**
 * Walk `sourceSelectorsFor(selection)` against `container` and return the
 * first match, or null. Pure with respect to its inputs — no listeners.
 */
export function resolveSource(
  container: ParentNode,
  selection: ActiveSelection,
): HTMLElement | null {
  for (const selector of sourceSelectorsFor(selection)) {
    const el = container.querySelector<HTMLElement>(selector)
    if (el) return el
  }
  return null
}

/**
 * Walk `targetSelectorsFor(annotation)` against `container` and return the
 * first match plus the kind of anchor it represents.
 */
export function resolveTarget(
  container: ParentNode,
  annotation: ReadingAnnotation,
): ResolvedTarget | null {
  for (const { kind, selector } of targetSelectorsFor(annotation)) {
    const el = container.querySelector<HTMLElement>(selector)
    if (el) return { el, kind }
  }
  return null
}

/* ─────────────────────────── Geometry math ──────────────────────────────── */

/**
 * Project the source and target rects into the container's local coordinate
 * space. Source anchor: left-middle (the side closer to the passage for the
 * tiny option-letter badge; same expression for the stem button). Target
 * anchor: right-middle of the quote mark or sentence span.
 */
export function rectsToEndpoints(
  containerRect: RectLike,
  sourceRect: RectLike,
  targetRect: RectLike,
): LinkEndpoints {
  return {
    sx: sourceRect.left - containerRect.left,
    sy: sourceRect.top + sourceRect.height / 2 - containerRect.top,
    tx: targetRect.right - containerRect.left,
    ty: targetRect.top + targetRect.height / 2 - containerRect.top,
  }
}

/**
 * Build the SVG path `d` for an endpoint pair. Horizontal cubic bezier with
 * control points pulled toward the midpoint by `max(60, |dx| * 0.45)`.
 *
 * The output is rounded to one decimal so the SVG diff stays stable under
 * sub-pixel scroll/resize jitter.
 */
export function buildCubicPath(endpoints: LinkEndpoints): string {
  const { sx, sy, tx, ty } = endpoints
  const dx = Math.max(60, Math.abs(tx - sx) * 0.45)
  const c1x = sx - dx
  const c1y = sy
  const c2x = tx + dx
  const c2y = ty
  return `M ${sx.toFixed(1)} ${sy.toFixed(1)} C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${tx.toFixed(1)} ${ty.toFixed(1)}`
}

/**
 * One-shot geometry computation given the three rects. Returned object
 * matches the shape the overlay renders directly.
 */
export function computeOverlayGeometry(
  containerRect: RectLike,
  sourceRect: RectLike,
  targetRect: RectLike,
): Geometry {
  const endpoints = rectsToEndpoints(containerRect, sourceRect, targetRect)
  return {
    d: buildCubicPath(endpoints),
    width: containerRect.width,
    height: containerRect.height,
  }
}

/* ─────────────────────── Animation instance policy ──────────────────────── */

export type AnimationInstanceState = {
  /** Last activeLink id we reacted to (null when nothing is active). */
  lastLinkId: string | null
  /** Monotonic counter; the rendered `data-link-instance` value. */
  counter: number
}

export function createAnimationInstanceState(): AnimationInstanceState {
  return { lastLinkId: null, counter: 0 }
}

/**
 * Pure reducer for the link-draw animation marker.
 *
 * Required behavior (matches the original LinkOverlay useMemo + ref pair,
 * extracted so it can be tested without React):
 *
 *   - When `nextLinkId` differs from `state.lastLinkId`:
 *       • update `lastLinkId` to `nextLinkId`
 *       • bump `counter` ONLY when the new id is non-null
 *   - When `nextLinkId` equals `state.lastLinkId`:
 *       • leave both fields unchanged (geometry-only recomputes must not
 *         bump the counter)
 *
 * The function returns a fresh state object; the caller is responsible for
 * persisting it (e.g. `useRef` in React, plain reassignment in tests).
 */
export function advanceAnimationInstance(
  state: AnimationInstanceState,
  nextLinkId: string | null,
): AnimationInstanceState {
  if (nextLinkId === state.lastLinkId) {
    return state
  }
  const counter = nextLinkId !== null ? state.counter + 1 : state.counter
  return { lastLinkId: nextLinkId, counter }
}

/* ───────────────────────────── Reduced motion ───────────────────────────── */

/**
 * Wrap `window.matchMedia('(prefers-reduced-motion: reduce)')` with safe
 * defaults for SSR / non-DOM environments. Tests that need to toggle the
 * value should stub `window.matchMedia` or pass a local `MatchMediaLike`.
 */
export type MatchMediaLike = (query: string) => { matches: boolean }

export function detectReducedMotion(
  matchMedia?: MatchMediaLike | undefined,
): boolean {
  const mm =
    matchMedia ??
    (typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? (q: string) => window.matchMedia(q)
      : undefined)
  if (!mm) return false
  return mm('(prefers-reduced-motion: reduce)').matches
}
