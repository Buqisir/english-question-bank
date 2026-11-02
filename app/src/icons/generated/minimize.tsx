// Generated file — do not edit. Run `pnpm -C app icons:generate` instead.
import { EqbIcon, eqbDisplayStrokeScale, type EqbIconProps } from '../EqbIcon'

export function Minimize({ size = 24, variant = 'line', ...props }: EqbIconProps) {
  const numericSize = typeof size === 'number' ? size : Number.parseFloat(size)
  const isSmall = Number.isFinite(numericSize) && numericSize < 24
  const displayScale = eqbDisplayStrokeScale(size)
  return (
    <EqbIcon size={size} {...props}>
      {variant === 'fill' && null}
      {variant === 'fill' ? <><path d="M2.4 12 C2.4 7.475 2.4 5.212 3.806 3.806 C5.212 2.4 7.475 2.4 12 2.4 C16.525 2.4 18.788 2.4 20.194 3.806 C21.6 5.212 21.6 7.475 21.6 12 C21.6 16.525 21.6 18.788 20.194 20.194 C18.788 21.6 16.525 21.6 12 21.6 C7.475 21.6 5.212 21.6 3.806 20.194 C2.4 18.788 2.4 16.525 2.4 12 Z" /><path strokeWidth={isSmall ? 2 : 2.25 * displayScale} d="M16.35 10.6 H13.4 V7.65 M13.4 10.6 L17.3 6.7" /><path strokeWidth={isSmall ? 2 : 2.25 * displayScale} d="M7.65 13.4 H10.6 V16.35 M10.6 13.4 L6.7 17.3" /></> : <><path d="M2.4 12 C2.4 7.475 2.4 5.212 3.806 3.806 C5.212 2.4 7.475 2.4 12 2.4 C16.525 2.4 18.788 2.4 20.194 3.806 C21.6 5.212 21.6 7.475 21.6 12 C21.6 16.525 21.6 18.788 20.194 20.194 C18.788 21.6 16.525 21.6 12 21.6 C7.475 21.6 5.212 21.6 3.806 20.194 C2.4 18.788 2.4 16.525 2.4 12 Z" /><path strokeWidth={isSmall ? 2 : 2.25 * displayScale} d="M16.35 10.6 H13.4 V7.65 M13.4 10.6 L17.3 6.7" /><path strokeWidth={isSmall ? 2 : 2.25 * displayScale} d="M7.65 13.4 H10.6 V16.35 M10.6 13.4 L6.7 17.3" /></>}
    </EqbIcon>
  )
}
