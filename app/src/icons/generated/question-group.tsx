// Generated file — do not edit. Run `pnpm -C app icons:generate` instead.
import { EqbIcon, type EqbIconProps } from '../EqbIcon'

export function QuestionGroup({ size = 24, variant = 'line', ...props }: EqbIconProps) {
  const numericSize = typeof size === 'number' ? size : Number.parseFloat(size)
  const isSmall = Number.isFinite(numericSize) && numericSize < 24
  return (
    <EqbIcon size={size} {...props}>
      {variant === 'fill' && <g fill="currentColor" fillOpacity={0.16} stroke="none"><path d="M6.75 2.75 H17.25 Q20.5 2.75 20.5 6 V18 Q20.5 21.25 17.25 21.25 H6.75 Q3.5 21.25 3.5 18 V6 Q3.5 2.75 6.75 2.75 Z" /></g>}
      {variant === 'fill' ? <><path d="M6.75 2.75 H17.25 Q20.5 2.75 20.5 6 V18 Q20.5 21.25 17.25 21.25 H6.75 Q3.5 21.25 3.5 18 V6 Q3.5 2.75 6.75 2.75 Z" /><path d="M7 7.4 L8.4 6.4 H9.65 V11.25 H8.4 V7.95 L7.65 8.42 Z M7 15 C7 13.9 7.6 13.3 8.8 13.3 C9.9 13.3 10.55 13.9 10.55 14.9 C10.55 15.65 10.1 16.13 9.4 16.7 L8.63 17.32 H10.6 V18.3 H7 V17.4 L8.76 15.87 C9.19 15.5 9.36 15.24 9.36 14.94 C9.36 14.6 9.13 14.37 8.78 14.37 C8.4 14.37 8.17 14.61 8.17 15 Z" fill="currentColor" stroke="none" /><path strokeWidth={isSmall ? 2.05 : 2.4} d="M14.5 8.8 H16.5 M14.5 15.9 H16.5" /></> : <><path d="M6.75 2.75 H17.25 Q20.5 2.75 20.5 6 V18 Q20.5 21.25 17.25 21.25 H6.75 Q3.5 21.25 3.5 18 V6 Q3.5 2.75 6.75 2.75 Z" /><path d="M7 7.4 L8.4 6.4 H9.65 V11.25 H8.4 V7.95 L7.65 8.42 Z M7 15 C7 13.9 7.6 13.3 8.8 13.3 C9.9 13.3 10.55 13.9 10.55 14.9 C10.55 15.65 10.1 16.13 9.4 16.7 L8.63 17.32 H10.6 V18.3 H7 V17.4 L8.76 15.87 C9.19 15.5 9.36 15.24 9.36 14.94 C9.36 14.6 9.13 14.37 8.78 14.37 C8.4 14.37 8.17 14.61 8.17 15 Z" fill="currentColor" stroke="none" /><path strokeWidth={isSmall ? 2.05 : 2.4} d="M14.5 8.8 H16.5 M14.5 15.9 H16.5" /></>}
    </EqbIcon>
  )
}
