import type { ReactNode, SVGProps } from 'react'

export type EqbIconVariant = 'line' | 'fill'

export type EqbIconProps = Omit<SVGProps<SVGSVGElement>, 'color'> & {
  size?: number | string
  strokeWidth?: number
  color?: string
  variant?: EqbIconVariant
}

type EqbIconBaseProps = Omit<EqbIconProps, 'variant'> & { children: ReactNode }

function derivedStrokeWidth(size: number | string): number {
  const numericSize = typeof size === 'number' ? size : Number.parseFloat(size)
  return Number.isFinite(numericSize) && numericSize < 24 ? 2.25 : 2.75
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
