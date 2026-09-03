import type { ReactNode } from 'react'

type ScissorsMarkProps = {
  size?: number
  className?: string
}

export function ScissorsMark({ size = 10, className }: ScissorsMarkProps): ReactNode {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth={1}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <g transform="rotate(-35 6 6)">
        <circle cx="2.9" cy="9.1" r="2.1" />
        <circle cx="8.9" cy="8.6" r="1.5" />
        <path d="M4.3 7.6 9.8 1.2M7.7 7.4 2.4 1.2" />
      </g>
    </svg>
  )
}
