// Stroke tiers (Owner 2026-11-03, stroke trial B, design/icon-system-v2-2026-11-02/spec.md §4.3):
// < 20 keeps 2.25 units so icons match adjacent text; 20 -> 2 so a 24px icon is never heavier than a 20px one;
// display tiers 24 -> 1.75 and 32+ -> 1.5 for open counters at large sizes.
const LEGACY_DISPLAY_STROKE = 2.75
const INLINE_STROKE = 2.25

export function derivedStrokeWidth(size: number | string): number {
  const numericSize = typeof size === 'number' ? size : Number.parseFloat(size)
  if (!Number.isFinite(numericSize) || numericSize < 20) return INLINE_STROKE
  if (numericSize < 24) return 2
  return numericSize < 32 ? 1.75 : 1.5
}

// Local part strokes were authored against the old 2.75 display stroke; scale them with the main stroke.
export function eqbDisplayStrokeScale(size: number | string): number {
  const numericSize = typeof size === 'number' ? size : Number.parseFloat(size)
  if (!Number.isFinite(numericSize) || numericSize < 24) return 1
  return derivedStrokeWidth(numericSize) / LEGACY_DISPLAY_STROKE
}

// Local part strokes for inline sizes were authored against 2.25; the 20px tier thins them with the main stroke.
export function eqbInlineStrokeScale(size: number | string): number {
  return derivedStrokeWidth(size) / INLINE_STROKE
}
