import type { ReactNode, SVGProps } from 'react'

export type EqbIconVariant = 'line' | 'fill'

export type EqbIconProps = Omit<SVGProps<SVGSVGElement>, 'color'> & {
  size?: number | string
  strokeWidth?: number
  color?: string
  variant?: EqbIconVariant
}

type EqbIconBaseProps = Omit<EqbIconProps, 'variant'> & { children: ReactNode }

// Inline tiers (< 24) keep 2.25 units so icons match adjacent text.
// Display tiers thin out sub-linearly: 24 -> 2px, 32 -> 2.5px rendered
// (Owner 2026-11-02, design/icon-system-v2-2026-11-02/spec.md §4.3).
const LEGACY_DISPLAY_STROKE = 2.75

function derivedStrokeWidth(size: number | string): number {
  const numericSize = typeof size === 'number' ? size : Number.parseFloat(size)
  if (!Number.isFinite(numericSize) || numericSize < 24) return 2.25
  return numericSize < 32 ? 2 : 1.875
}

// Local part strokes were authored against the old 2.75 display stroke; scale them with the main stroke.
export function eqbDisplayStrokeScale(size: number | string): number {
  const numericSize = typeof size === 'number' ? size : Number.parseFloat(size)
  if (!Number.isFinite(numericSize) || numericSize < 24) return 1
  return derivedStrokeWidth(numericSize) / LEGACY_DISPLAY_STROKE
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
