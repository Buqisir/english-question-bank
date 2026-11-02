// Generated file — do not edit. Run `pnpm -C app icons:generate` instead.
import { EqbIcon, eqbDisplayStrokeScale, type EqbIconProps } from '../EqbIcon'

export function FileSearch({ size = 24, variant = 'line', ...props }: EqbIconProps) {
  const numericSize = typeof size === 'number' ? size : Number.parseFloat(size)
  const isSmall = Number.isFinite(numericSize) && numericSize < 24
  const displayScale = eqbDisplayStrokeScale(size)
  return (
    <EqbIcon size={size} {...props}>
      {variant === 'fill' && null}
      {variant === 'fill' ? <><path d="M6.75 2.75 H17.25 Q20.5 2.75 20.5 6 V18 Q20.5 21.25 17.25 21.25 H6.75 Q3.5 21.25 3.5 18 V6 Q3.5 2.75 6.75 2.75 Z" /><circle strokeWidth={isSmall ? 2.05 : 2.4 * displayScale} cx="11.6" cy="11.8" r="3" /><path strokeWidth={isSmall ? 2.05 : 2.4 * displayScale} d="M13.8 14L16.1 16.3" /></> : <><path d="M6.75 2.75 H17.25 Q20.5 2.75 20.5 6 V18 Q20.5 21.25 17.25 21.25 H6.75 Q3.5 21.25 3.5 18 V6 Q3.5 2.75 6.75 2.75 Z" /><circle strokeWidth={isSmall ? 2.05 : 2.4 * displayScale} cx="11.6" cy="11.8" r="3" /><path strokeWidth={isSmall ? 2.05 : 2.4 * displayScale} d="M13.8 14L16.1 16.3" /></>}
    </EqbIcon>
  )
}
