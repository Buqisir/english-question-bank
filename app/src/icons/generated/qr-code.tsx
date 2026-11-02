// Generated file — do not edit. Run `pnpm -C app icons:generate` instead.
import { EqbIcon, eqbDisplayStrokeScale, type EqbIconProps } from '../EqbIcon'

export function QrCode({ size = 24, variant = 'line', ...props }: EqbIconProps) {
  const numericSize = typeof size === 'number' ? size : Number.parseFloat(size)
  const isSmall = Number.isFinite(numericSize) && numericSize < 24
  const displayScale = eqbDisplayStrokeScale(size)
  return (
    <EqbIcon size={size} {...props}>
      {variant === 'fill' && null}
      {variant === 'fill' ? <><path strokeWidth={isSmall ? 2.05 : 2.4 * displayScale} d="M3.825 2.375 H8.425 Q9.875 2.375 9.875 3.825 V6.775 Q9.875 9.875 6.775 9.875 H3.825 Q2.375 9.875 2.375 8.425 V3.825 Q2.375 2.375 3.825 2.375 Z" /><path strokeWidth={isSmall ? 2.05 : 2.4 * displayScale} d="M15.575 2.375 H20.175 Q21.625 2.375 21.625 3.825 V8.425 Q21.625 9.875 20.175 9.875 H17.225 Q14.125 9.875 14.125 6.775 V3.825 Q14.125 2.375 15.575 2.375 Z" /><path strokeWidth={isSmall ? 2.05 : 2.4 * displayScale} d="M3.825 14.125 H6.775 Q9.875 14.125 9.875 17.225 V20.175 Q9.875 21.625 8.425 21.625 H3.825 Q2.375 21.625 2.375 20.175 V15.575 Q2.375 14.125 3.825 14.125 Z" /><circle cx="6.125" cy="6.125" r="0.9" fill="currentColor" stroke="none" /><circle cx="17.875" cy="6.125" r="0.9" fill="currentColor" stroke="none" /><circle cx="6.125" cy="17.875" r="0.9" fill="currentColor" stroke="none" /><path d="M15.25 15.25 H16.45 M20.5 15.25 h0.01 M15.25 20.5 h0.01 M19.3 20.5 H20.5" /></> : <><path strokeWidth={isSmall ? 2.05 : 2.4 * displayScale} d="M3.825 2.375 H8.425 Q9.875 2.375 9.875 3.825 V6.775 Q9.875 9.875 6.775 9.875 H3.825 Q2.375 9.875 2.375 8.425 V3.825 Q2.375 2.375 3.825 2.375 Z" /><path strokeWidth={isSmall ? 2.05 : 2.4 * displayScale} d="M15.575 2.375 H20.175 Q21.625 2.375 21.625 3.825 V8.425 Q21.625 9.875 20.175 9.875 H17.225 Q14.125 9.875 14.125 6.775 V3.825 Q14.125 2.375 15.575 2.375 Z" /><path strokeWidth={isSmall ? 2.05 : 2.4 * displayScale} d="M3.825 14.125 H6.775 Q9.875 14.125 9.875 17.225 V20.175 Q9.875 21.625 8.425 21.625 H3.825 Q2.375 21.625 2.375 20.175 V15.575 Q2.375 14.125 3.825 14.125 Z" /><circle cx="6.125" cy="6.125" r="0.9" fill="currentColor" stroke="none" /><circle cx="17.875" cy="6.125" r="0.9" fill="currentColor" stroke="none" /><circle cx="6.125" cy="17.875" r="0.9" fill="currentColor" stroke="none" /><path d="M15.25 15.25 H16.45 M20.5 15.25 h0.01 M15.25 20.5 h0.01 M19.3 20.5 H20.5" /></>}
    </EqbIcon>
  )
}
