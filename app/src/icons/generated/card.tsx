// Generated file — do not edit. Run `pnpm -C app icons:generate` instead.
import { EqbIcon, type EqbIconProps } from '../EqbIcon'

export function Card({ variant = 'line', ...props }: EqbIconProps) {
  return (
    <EqbIcon {...props}>
      {variant === 'fill' && <g fill="currentColor" fillOpacity={0.16} stroke="none"><rect x="2.75" y="5" width="18.5" height="14" rx="4" /></g>}
      {variant === 'fill' ? <><rect x="2.75" y="5" width="18.5" height="14" rx="4" /><path d="M7.5 10.25h9M7.5 14.25h4.5" /></> : <><rect x="2.75" y="5" width="18.5" height="14" rx="4" /><path d="M7.5 10.25h9M7.5 14.25h4.5" /></>}
    </EqbIcon>
  )
}
