// Generated file — do not edit. Run `pnpm -C app icons:generate` instead.
import { EqbIcon, type EqbIconProps } from '../EqbIcon'

export function ZoomOut({ size = 24, variant = 'line', ...props }: EqbIconProps) {
  const numericSize = typeof size === 'number' ? size : Number.parseFloat(size)
  const isSmall = Number.isFinite(numericSize) && numericSize < 24
  return (
    <EqbIcon size={size} {...props}>
      {variant === 'fill' && null}
      {variant === 'fill' ? <><circle cx="11.08" cy="11.08" r="8.7" /><path d="M17.232 17.232L21.62 21.62" /><path strokeWidth={isSmall ? 2.05 : 2.4} d="M8.08 11.08H14.08" /></> : <><circle cx="11.08" cy="11.08" r="8.7" /><path d="M17.232 17.232L21.62 21.62" /><path strokeWidth={isSmall ? 2.05 : 2.4} d="M8.08 11.08H14.08" /></>}
    </EqbIcon>
  )
}
