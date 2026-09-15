// Generated file — do not edit. Run `pnpm -C app icons:generate` instead.
import { EqbIcon, type EqbIconProps } from '../EqbIcon'

export function Grid2X2({ variant = 'line', ...props }: EqbIconProps) {
  return (
    <EqbIcon {...props}>
      {variant === 'fill' && <g fill="currentColor" fillOpacity={0.16} stroke="none"><rect x="3.5" y="3.5" width="17" height="17" rx="4" /></g>}
      {variant === 'fill' ? <><rect x="3.5" y="3.5" width="17" height="17" rx="4" /><path d="M12 3.5v17M3.5 12h17" /></> : <><rect x="3.5" y="3.5" width="17" height="17" rx="4" /><path d="M12 3.5v17M3.5 12h17" /></>}
    </EqbIcon>
  )
}
