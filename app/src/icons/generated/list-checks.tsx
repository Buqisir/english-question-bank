// Generated file — do not edit. Run `pnpm -C app icons:generate` instead.
import { EqbIcon, type EqbIconProps } from '../EqbIcon'

export function ListChecks({ size = 24, variant = 'line', ...props }: EqbIconProps) {
  const numericSize = typeof size === 'number' ? size : Number.parseFloat(size)
  const isSmall = Number.isFinite(numericSize) && numericSize < 24
  return (
    <EqbIcon size={size} {...props}>
      {variant === 'fill' && null}
      {variant === 'fill' ? <><rect strokeWidth={isSmall ? 2.1 : 2.5} x="3.25" y="4.25" width="5.5" height="5.5" rx="1.4" /><rect strokeWidth={isSmall ? 2.1 : 2.5} x="3.25" y="14.25" width="5.5" height="5.5" rx="1.4" /><path d="M13.25 7 H20.75 M13.25 17 H18.75" /></> : <><rect strokeWidth={isSmall ? 2.1 : 2.5} x="3.25" y="4.25" width="5.5" height="5.5" rx="1.4" /><rect strokeWidth={isSmall ? 2.1 : 2.5} x="3.25" y="14.25" width="5.5" height="5.5" rx="1.4" /><path d="M13.25 7 H20.75 M13.25 17 H18.75" /></>}
    </EqbIcon>
  )
}
