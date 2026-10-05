// Generated file — do not edit. Run `pnpm -C app icons:generate` instead.
import { EqbIcon, type EqbIconProps } from '../EqbIcon'

export function Papers({ size = 24, variant = 'line', ...props }: EqbIconProps) {
  const numericSize = typeof size === 'number' ? size : Number.parseFloat(size)
  const isSmall = Number.isFinite(numericSize) && numericSize < 24
  return (
    <EqbIcon size={size} {...props}>
      {variant === 'fill' && <g fill="currentColor" fillOpacity={0.16} stroke="none"><path d="M7.25 2.75 H16.75 Q20 2.75 20 6 V14.9 H16.65 Q13.5 14.9 13.5 18.05 V21.25 H7.25 Q4 21.25 4 18 V6 Q4 2.75 7.25 2.75 Z" /></g>}
      {variant === 'fill' ? <><path d="M7.25 2.75 H16.75 Q20 2.75 20 6 V14.9 C20 18.6 17.1 21.25 13.5 21.25 H7.25 Q4 21.25 4 18 V6 Q4 2.75 7.25 2.75 Z" /><path strokeWidth={isSmall ? 2.05 : 2.4} d="M20 14.9 H16.65 Q13.5 14.9 13.5 18.05 V21.25" /><path strokeWidth={isSmall ? 2.05 : 2.4} d="M8.25 7.5 C9.45 6.3 10.7 7 12 7.5 C13.3 8 14.55 8.7 15.75 7.5 M8.25 11.5 C9.45 10.3 10.7 11 12 11.5 C13.3 12 14.55 12.7 15.75 11.5" /></> : <><path d="M7.25 2.75 H16.75 Q20 2.75 20 6 V14.9 C20 18.6 17.1 21.25 13.5 21.25 H7.25 Q4 21.25 4 18 V6 Q4 2.75 7.25 2.75 Z" /><path strokeWidth={isSmall ? 2.05 : 2.4} d="M20 14.9 H16.65 Q13.5 14.9 13.5 18.05 V21.25" /><path strokeWidth={isSmall ? 2.05 : 2.4} d="M8.25 7.5 C9.45 6.3 10.7 7 12 7.5 C13.3 8 14.55 8.7 15.75 7.5 M8.25 11.5 C9.45 10.3 10.7 11 12 11.5 C13.3 12 14.55 12.7 15.75 11.5" /></>}
    </EqbIcon>
  )
}
