/**
 * paperIntelligenceEvidenceLineGeometry — pure (no React, no JSX, no
 * DOM-only types) helpers for the V2 cross-column evidence dotted line.
 *
 * Splitting these out of the `.tsx` companion lets the verify script
 * import and exercise them through Node's strip-types ESM loader,
 * which doesn't grok JSX in `.tsx` files.
 *
 * Owns:
 *   - `findFirstDomOccurrence` — first-DOM-occurrence multi-occurrence
 *     anchor policy.
 *   - `findEvidenceSource` — find the right-panel source button.
 *   - `computeOverlayGeometry` — pure rect math, returns SVG geometry.
 *   - `detectReducedMotion` — single-shot media-query lookup.
 *
 * Does NOT own:
 *   - The React hook (`usePaperIntelligenceEvidenceLine`).
 *   - The React component (`PaperIntelligenceEvidenceLine`).
 *   Those live in `./paperIntelligenceEvidenceLine.tsx`.
 */

/* ─────────────────────────── geometry types ─────────────────────────── */

/** Result of `computeOverlayGeometry`. The SVG is always sized to the
 *  full container (so we don't have to worry about translate offsets);
 *  `d` is the Bezier path inside that local coordinate space. */
export type LineGeometry = {
  width: number
  height: number
  d: string
}

/** Minimal subset of DOMRect used by `computeOverlayGeometry`. Tests
 *  can hand-roll plain objects without instantiating real rects. */
export type DOMRectLike = {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

/* ─────────────────────────── DOM lookup ─────────────────────────────── */

/**
 * Find the first DOM occurrence of an evidence id inside `container`.
 *
 * Multi-occurrence quote policy (locked):
 *   - The preview model highlights EVERY non-overlapping occurrence of
 *     an evidence quote (see `buildPassageSegments`'s JSDoc), so a
 *     single `evidenceId` can have multiple `<mark>` elements in the
 *     DOM.
 *   - The dotted line connects to the FIRST DOM occurrence — i.e. the
 *     one that appears earliest in document order.
 *   - This deliberately matches `findFirst*`-style stability: the
 *     teacher gets a predictable visual anchor, and the line doesn't
 *     dance between occurrences when scroll changes which one is
 *     visible.
 *
 * The selector is restricted to `mark[data-pi-evidence-id="..."]`
 * because only `<mark>` highlights inside the passage body carry the
 * `data-pi-evidence-kind` attribute we render in
 * `PaperIntelligencePreview`. Right-panel rows ALSO carry
 * `data-pi-evidence-id`; this function lives behind a `containerEl`
 * scoped to the LEFT column, so right-panel matches are out of scope
 * by construction.
 *
 * The argument types are intentionally loose (`unknown` for the
 * container) so this function can be exercised by Node's strip-types
 * loader without dragging in DOM lib types.
 */
export function findFirstDomOccurrence(
  containerEl: ContainerLike | null,
  evidenceId: string | null,
): HTMLElementLike | null {
  if (!containerEl || !evidenceId) return null
  const escaped =
    typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
      ? CSS.escape(evidenceId)
      : evidenceId.replace(/[^a-zA-Z0-9_-]/g, '\\$&')
  return containerEl.querySelector(
    `mark[data-pi-evidence-id="${escaped}"]`,
  ) as HTMLElementLike | null
}

/**
 * Find the source anchor for a given evidence id inside the right
 * panel. Source elements are buttons rendered by
 * `PaperIntelligencePreview`'s Analysis Panel (one for the support
 * row, one per quoted distractor). They carry `data-pi-evidence-id`.
 */
export function findEvidenceSource(
  containerEl: ContainerLike | null,
  evidenceId: string | null,
): HTMLElementLike | null {
  if (!containerEl || !evidenceId) return null
  const escaped =
    typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
      ? CSS.escape(evidenceId)
      : evidenceId.replace(/[^a-zA-Z0-9_-]/g, '\\$&')
  return containerEl.querySelector(
    `[data-pi-evidence-id="${escaped}"]`,
  ) as HTMLElementLike | null
}

/** Minimal duck types so we don't depend on DOM lib in this `.ts`. */
export type HTMLElementLike = {
  getBoundingClientRect: () => DOMRectLike
}
export type ContainerLike = {
  querySelector: (selector: string) => unknown
}

/* ─────────────────────────── geometry math ──────────────────────────── */

/**
 * Compute the overlay geometry from three rects (all in viewport
 * coordinates).
 *
 *   - Source rect = right-panel button. We anchor the line to the
 *     LEFT edge of this rect, vertically centered.
 *   - Target rect = left passage `<mark>`. We anchor to the RIGHT
 *     edge of this rect, vertically centered.
 *   - Container rect = the `<svg>`'s parent (the `.pi-shell` element).
 *     The path coordinates are emitted in container-local space so the
 *     SVG can be `position:absolute; inset:0` without an extra
 *     translate.
 *
 * The control points are pulled horizontally toward the midpoint of
 * the gap between the two columns, producing a gentle "S" curve that
 * arcs ABOVE the column gap rather than slicing through passage text.
 *
 * If either rect has zero size (rare, but possible during the first
 * paint before fonts settle), we still emit a valid `d` — the path
 * would just be a tiny segment that the CSS keeps invisible.
 */
export function computeOverlayGeometry(
  containerRect: DOMRectLike,
  sourceRect: DOMRectLike,
  targetRect: DOMRectLike,
): LineGeometry {
  const width = Math.max(0, containerRect.width)
  const height = Math.max(0, containerRect.height)

  // anchor points in container-local coordinates
  const sx = sourceRect.left - containerRect.left
  const sy = sourceRect.top + sourceRect.height / 2 - containerRect.top
  const tx = targetRect.right - containerRect.left
  const ty = targetRect.top + targetRect.height / 2 - containerRect.top

  // control points: pull each handle horizontally toward the mid-gap.
  // Using a fraction of the horizontal distance produces a smoother
  // curve than fixed offsets, and stays sane when the columns are
  // pushed close together.
  const dx = sx - tx
  const handle = Math.max(40, Math.min(160, Math.abs(dx) * 0.4))
  const c1x = tx + handle // pull from target toward the gap
  const c1y = ty
  const c2x = sx - handle // pull from source toward the gap
  const c2y = sy

  const d = `M ${tx.toFixed(2)} ${ty.toFixed(2)} C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${sx.toFixed(2)} ${sy.toFixed(2)}`
  return { width, height, d }
}

/* ─────────────────────────── reduced motion ─────────────────────────── */

/**
 * Read `prefers-reduced-motion` lazily at the moment we need it. We
 * never cache the result so the overlay tracks OS-level changes
 * without needing `matchMedia.addEventListener`.
 *
 * Returns false in non-browser environments (the verify-script unit
 * tests don't have `window`).
 */
export function detectReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  if (typeof window.matchMedia !== 'function') return false
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}
