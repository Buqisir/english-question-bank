import type { ReactNode } from 'react'

type PointingHandProps = {
  size?: number
  className?: string
}

/**
 * 小手 — a child's left hand seen from above, palm pressed flat on the page,
 * fingers spread a little, thumb splayed right, wrist running off the bottom
 * edge. It marks the question group the teacher is reading in the Paper
 * Browse TOC ("我读到这儿"). Owner-approved 2026-09-04 after the travelling
 * ink bar was rejected as generic side-stripe chrome. Portrait viewBox 16×18:
 * `size` is the rendered height; width follows the aspect.
 */
export function PointingHand({ size = 15, className }: PointingHandProps): ReactNode {
  const width = (size * 16) / 18
  return (
    <svg
      width={width}
      height={size}
      viewBox="0 0 16 18"
      fill="none"
      stroke="currentColor"
      strokeWidth={0.95}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M2.98 10.6 C2.4 12.2 2.9 15.2 3.8 18 M10.38 10.6 C11.2 11.2 11.3 12 10.9 12.6" />
      <path d="M2.99 10.43 L2.17 5.99 a0.575 0.575 0 0 1 1.12 0.25 L4.51 10.77 M4.75 10.53 L4.5 4.37 a0.625 0.625 0 0 1 1.25 0.1 L6.45 10.67 M6.73 10.65 L7.38 3.85 a0.65 0.65 0 0 1 1.3 -0.08 L8.47 10.55 M8.74 10.77 L10.21 4.86 a0.6 0.6 0 0 1 1.17 -0.25 L10.36 10.43" />
      <path d="M10.9 12.6 L14.2 14.5 a0.8 0.8 0 0 1 -0.9 1.35 L10.5 15 C10.7 16.2 10.3 18 9.5 18" />
    </svg>
  )
}
