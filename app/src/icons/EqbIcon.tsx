import type { ReactNode, SVGProps } from 'react'

export type EqbIconVariant = 'line' | 'fill'

export type EqbIconProps = Omit<SVGProps<SVGSVGElement>, 'color'> & {
  size?: number | string
  strokeWidth?: number
  color?: string
  variant?: EqbIconVariant
}

type EqbIconBaseProps = Omit<EqbIconProps, 'variant'> & { children: ReactNode }

// Stroke tiers (Owner 2026-11-03, stroke trial B, design/icon-system-v2-2026-11-02/spec.md §4.3):
// < 20 keeps 2.25 units so icons match adjacent text; 20 -> 2 so a 24px icon is never heavier than a 20px one;
// display tiers 24 -> 1.75 and 32+ -> 1.5 for open counters at large sizes.
const LEGACY_DISPLAY_STROKE = 2.75
const INLINE_STROKE = 2.25

function derivedStrokeWidth(size: number | string): number {
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

export function EqbIcon({
  size = 24,
  strokeWidth,
  color,
  children,
  className,
  ...svgProps
}: EqbIconBaseProps) {
  return (
    <svg
      {...svgProps}
      className={className ? `eqb-icon ${className}` : 'eqb-icon'}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth ?? derivedStrokeWidth(size)}
      color={color}
      xmlns="http://www.w3.org/2000/svg"
    >
      {children}
    </svg>
  )
}
