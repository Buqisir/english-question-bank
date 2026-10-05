// Generated file — do not edit. Run `pnpm -C app icons:generate` instead.
import { EqbIcon, type EqbIconProps } from '../EqbIcon'

export function Clipboard({ size = 24, variant = 'line', ...props }: EqbIconProps) {
  const numericSize = typeof size === 'number' ? size : Number.parseFloat(size)
  const isSmall = Number.isFinite(numericSize) && numericSize < 24
  return (
    <EqbIcon size={size} {...props}>
      {variant === 'fill' && null}
      {variant === 'fill' ? <><path d="M12.8 5H17.5Q20.5 5 20.5 8V17.5Q20.5 20.5 17.5 20.5H9Q6 20.5 6 17.5V9.75" /><path strokeWidth={isSmall ? 2.1 : 2.5} transform="matrix(0.54299796 -0.3135 0.3135 0.54299796 3.492 4.601)" d="M0 8V3.75C0 -1.25 7.5 -1.25 7.5 3.75V9.5C7.5 12 3.75 12 3.75 9.5V3.7" /><path d="M13.5 12H16.25M11.5 16H16.25" /></> : <><path d="M12.8 5H17.5Q20.5 5 20.5 8V17.5Q20.5 20.5 17.5 20.5H9Q6 20.5 6 17.5V9.75" /><path strokeWidth={isSmall ? 2.1 : 2.5} transform="matrix(0.54299796 -0.3135 0.3135 0.54299796 3.492 4.601)" d="M0 8V3.75C0 -1.25 7.5 -1.25 7.5 3.75V9.5C7.5 12 3.75 12 3.75 9.5V3.7" /><path d="M13.5 12H16.25M11.5 16H16.25" /></>}
    </EqbIcon>
  )
}
