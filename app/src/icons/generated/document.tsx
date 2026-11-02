// Generated file — do not edit. Run `pnpm -C app icons:generate` instead.
import { EqbIcon, eqbDisplayStrokeScale, type EqbIconProps } from '../EqbIcon'

export function Document({ size = 24, variant = 'line', ...props }: EqbIconProps) {
  const numericSize = typeof size === 'number' ? size : Number.parseFloat(size)
  const isSmall = Number.isFinite(numericSize) && numericSize < 24
  const displayScale = eqbDisplayStrokeScale(size)
  return (
    <EqbIcon size={size} {...props}>
      {variant === 'fill' && null}
      {variant === 'fill' ? <><path d="M6.75 2.75 H17.25 Q20.5 2.75 20.5 6 V18 Q20.5 21.25 17.25 21.25 H6.75 Q3.5 21.25 3.5 18 V6 Q3.5 2.75 6.75 2.75 Z" /><path strokeWidth={isSmall ? 2.05 : 2.4 * displayScale} d="M8.16 9.5H15.84 M8.16 14.5H12.16" /></> : <><path d="M6.75 2.75 H17.25 Q20.5 2.75 20.5 6 V18 Q20.5 21.25 17.25 21.25 H6.75 Q3.5 21.25 3.5 18 V6 Q3.5 2.75 6.75 2.75 Z" /><path strokeWidth={isSmall ? 2.05 : 2.4 * displayScale} d="M8.16 9.5H15.84 M8.16 14.5H12.16" /></>}
    </EqbIcon>
  )
}
