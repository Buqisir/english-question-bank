// Generated file — do not edit. Run `pnpm -C app icons:generate` instead.
import { EqbIcon, type EqbIconProps } from '../EqbIcon'

export function PaperCheck({ size = 24, variant = 'line', ...props }: EqbIconProps) {
  const numericSize = typeof size === 'number' ? size : Number.parseFloat(size)
  const isSmall = Number.isFinite(numericSize) && numericSize < 24
  return (
    <EqbIcon size={size} {...props}>
      {variant === 'fill' && <g fill="currentColor" fillOpacity={0.16} stroke="none"><path d="M7.25 2.75 H16.75 Q20 2.75 20 6 V14.9 H16.65 Q13.5 14.9 13.5 18.05 V21.25 H7.25 Q4 21.25 4 18 V6 Q4 2.75 7.25 2.75 Z" /></g>}
      {variant === 'fill' ? <><path d="M7.25 2.75 H16.75 Q20 2.75 20 6 V14.9 C20 18.6 17.1 21.25 13.5 21.25 H7.25 Q4 21.25 4 18 V6 Q4 2.75 7.25 2.75 Z" /><path strokeWidth={isSmall ? 2.05 : 2.4} d="M20 14.9 H16.65 Q13.5 14.9 13.5 18.05 V21.25" /><path strokeWidth={isSmall ? 2.05 : 2.4} d="M8.5 9.5 L10.25 11.45 Q10.6 11.85 11 11.35 C12.3 9.7 13.8 8.1 15.5 7.25" /></> : <><path d="M7.25 2.75 H16.75 Q20 2.75 20 6 V14.9 C20 18.6 17.1 21.25 13.5 21.25 H7.25 Q4 21.25 4 18 V6 Q4 2.75 7.25 2.75 Z" /><path strokeWidth={isSmall ? 2.05 : 2.4} d="M20 14.9 H16.65 Q13.5 14.9 13.5 18.05 V21.25" /><path strokeWidth={isSmall ? 2.05 : 2.4} d="M8.5 9.5 L10.25 11.45 Q10.6 11.85 11 11.35 C12.3 9.7 13.8 8.1 15.5 7.25" /></>}
    </EqbIcon>
  )
}
