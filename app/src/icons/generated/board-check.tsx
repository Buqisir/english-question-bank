// Generated file — do not edit. Run `pnpm -C app icons:generate` instead.
import { EqbIcon, type EqbIconProps } from '../EqbIcon'

export function BoardCheck({ variant = 'line', ...props }: EqbIconProps) {
  return (
    <EqbIcon {...props}>
      {variant === 'fill' && <g fill="currentColor" fillOpacity={0.16} stroke="none"><rect x="4.5" y="4.5" width="15" height="17" rx="3.5" /></g>}
      {variant === 'fill' ? <><rect x="4.5" y="4.5" width="15" height="17" rx="3.5" /><rect x="9" y="2.5" width="6" height="4" rx="2" /><path d="m8.75 13.75 2.25 2.25 4.5-4.5" /></> : <><rect x="4.5" y="4.5" width="15" height="17" rx="3.5" /><rect x="9" y="2.5" width="6" height="4" rx="2" /><path d="m8.75 13.75 2.25 2.25 4.5-4.5" /></>}
    </EqbIcon>
  )
}
