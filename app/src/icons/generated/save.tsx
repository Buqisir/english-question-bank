// Generated file — do not edit. Run `pnpm -C app icons:generate` instead.
import { EqbIcon, eqbDisplayStrokeScale, type EqbIconProps } from '../EqbIcon'

export function Save({ size = 24, variant = 'line', ...props }: EqbIconProps) {
  const numericSize = typeof size === 'number' ? size : Number.parseFloat(size)
  const isSmall = Number.isFinite(numericSize) && numericSize < 24
  const displayScale = eqbDisplayStrokeScale(size)
  return (
    <EqbIcon size={size} {...props}>
      {variant === 'fill' && <g fill="currentColor" fillOpacity={0.16} stroke="none"><path d="M6.915 2.395 h9.887 l4.802 4.802 V17.085 a4.52 4.52 0 0 1 -4.52 4.52 h-10.17 a4.52 4.52 0 0 1 -4.52 -4.52 v-10.17 a4.52 4.52 0 0 1 4.52 -4.52 z" /></g>}
      {variant === 'fill' ? <><path d="M6.915 2.395 h9.887 l4.802 4.802 V17.085 a4.52 4.52 0 0 1 -4.52 4.52 h-10.17 a4.52 4.52 0 0 1 -4.52 -4.52 v-10.17 a4.52 4.52 0 0 1 4.52 -4.52 z" /><path strokeWidth={isSmall ? 2.05 : 2.4 * displayScale} d="M8.61 6.915 h6.78" /><path strokeWidth={isSmall ? 2.05 : 2.4 * displayScale} d="M6.915 21.605 v-5.270 a1.412 1.412 0 0 1 1.412 -1.412 h7.345 a1.412 1.412 0 0 1 1.412 1.412 v5.270" /></> : <><path d="M6.915 2.395 h9.887 l4.802 4.802 V17.085 a4.52 4.52 0 0 1 -4.52 4.52 h-10.17 a4.52 4.52 0 0 1 -4.52 -4.52 v-10.17 a4.52 4.52 0 0 1 4.52 -4.52 z" /><path strokeWidth={isSmall ? 2.05 : 2.4 * displayScale} d="M8.61 6.915 h6.78" /><path strokeWidth={isSmall ? 2.05 : 2.4 * displayScale} d="M6.915 21.605 v-5.270 a1.412 1.412 0 0 1 1.412 -1.412 h7.345 a1.412 1.412 0 0 1 1.412 1.412 v5.270" /></>}
    </EqbIcon>
  )
}
