// Generated file — do not edit. Run `pnpm -C app icons:generate` instead.
import { EqbIcon, eqbDisplayStrokeScale, type EqbIconProps } from '../EqbIcon'

export function Grid2X2({ size = 24, variant = 'line', ...props }: EqbIconProps) {
  const numericSize = typeof size === 'number' ? size : Number.parseFloat(size)
  const isSmall = Number.isFinite(numericSize) && numericSize < 24
  const displayScale = eqbDisplayStrokeScale(size)
  return (
    <EqbIcon size={size} {...props}>
      {variant === 'fill' && <g fill="currentColor" fillOpacity={0.16} stroke="none"><rect x="3.25" y="3.25" width="6.5" height="6.5" rx="1.6" /><g transform="rotate(7 17.5 6.5)"><rect x="14.25" y="3.25" width="6.5" height="6.5" rx="1.6" /></g><rect x="3.25" y="14.25" width="6.5" height="6.5" rx="1.6" /><rect x="14.25" y="14.25" width="6.5" height="6.5" rx="1.6" /></g>}
      {variant === 'fill' ? <><rect strokeWidth={isSmall ? 2.1 : 2.5 * displayScale} x="3.25" y="3.25" width="6.5" height="6.5" rx="1.6" /><g transform="rotate(7 17.5 6.5)"><rect strokeWidth={isSmall ? 2.1 : 2.5 * displayScale} x="14.25" y="3.25" width="6.5" height="6.5" rx="1.6" /></g><rect strokeWidth={isSmall ? 2.1 : 2.5 * displayScale} x="3.25" y="14.25" width="6.5" height="6.5" rx="1.6" /><rect strokeWidth={isSmall ? 2.1 : 2.5 * displayScale} x="14.25" y="14.25" width="6.5" height="6.5" rx="1.6" /></> : <><rect strokeWidth={isSmall ? 2.1 : 2.5 * displayScale} x="3.25" y="3.25" width="6.5" height="6.5" rx="1.6" /><g transform="rotate(7 17.5 6.5)"><rect strokeWidth={isSmall ? 2.1 : 2.5 * displayScale} x="14.25" y="3.25" width="6.5" height="6.5" rx="1.6" /></g><rect strokeWidth={isSmall ? 2.1 : 2.5 * displayScale} x="3.25" y="14.25" width="6.5" height="6.5" rx="1.6" /><rect strokeWidth={isSmall ? 2.1 : 2.5 * displayScale} x="14.25" y="14.25" width="6.5" height="6.5" rx="1.6" /></>}
    </EqbIcon>
  )
}
