// Generated file — do not edit. Run `pnpm -C app icons:generate` instead.
import { EqbIcon, eqbDisplayStrokeScale, type EqbIconProps } from '../EqbIcon'

export function PaperDownload({ size = 24, variant = 'line', ...props }: EqbIconProps) {
  const numericSize = typeof size === 'number' ? size : Number.parseFloat(size)
  const isSmall = Number.isFinite(numericSize) && numericSize < 24
  const displayScale = eqbDisplayStrokeScale(size)
  return (
    <EqbIcon size={size} {...props}>
      {variant === 'fill' && <g fill="currentColor" fillOpacity={0.16} stroke="none"><path d="M7.25 2.75 H16.75 Q20 2.75 20 6 V14.9 H16.65 Q13.5 14.9 13.5 18.05 V21.25 H7.25 Q4 21.25 4 18 V6 Q4 2.75 7.25 2.75 Z" /></g>}
      {variant === 'fill' ? <><path d="M7.25 2.75 H16.75 Q20 2.75 20 6 V14.9 C20 18.6 17.1 21.25 13.5 21.25 H7.25 Q4 21.25 4 18 V6 Q4 2.75 7.25 2.75 Z" /><path strokeWidth={isSmall ? 2.05 : 2.4 * displayScale} d="M20 14.9 H16.65 Q13.5 14.9 13.5 18.05 V21.25" /><path strokeWidth={isSmall ? 2.05 : 2.4 * displayScale} d="M12 7 V12.25 M9 9.25 L12 12.25 L15 9.25" /></> : <><path d="M7.25 2.75 H16.75 Q20 2.75 20 6 V14.9 C20 18.6 17.1 21.25 13.5 21.25 H7.25 Q4 21.25 4 18 V6 Q4 2.75 7.25 2.75 Z" /><path strokeWidth={isSmall ? 2.05 : 2.4 * displayScale} d="M20 14.9 H16.65 Q13.5 14.9 13.5 18.05 V21.25" /><path strokeWidth={isSmall ? 2.05 : 2.4 * displayScale} d="M12 7 V12.25 M9 9.25 L12 12.25 L15 9.25" /></>}
    </EqbIcon>
  )
}
