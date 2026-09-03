import type { ReactNode } from 'react'

type PointingHandProps = {
  size?: number
  className?: string
  /**
   * `right` is the owner-praised 2026-09-04 outline (thumb on the viewer's
   * left — a right hand, palm toward us). Do not rewrite that path.
   * `left` is the same path mirrored across x = 8, then rotated 10°
   * clockwise so it leans toward the label it is marking.
   */
  side?: 'left' | 'right'
}

/**
 * One continuous cubic outline. Starts at the wrist, goes up the near
 * palm, around the thumb, then four finger loops (tip then web), and
 * back down the far palm. The stroke is left open at y = 18 so the
 * wrist reads as coming onto the page.
 *
 * RIGHT_HAND_OUTLINE is the directory version the owner kept. Never
 * replace it with a regenerated path.
 */
export const RIGHT_HAND_OUTLINE =
  'M5.1 18 C4.6 15.2 4.5 13.4 4.3 12 C3.2 11.6 2.1 10.4 1.7 9.2 C1.4 8.3 2 7.5 2.8 7.6 C3.6 7.7 4.3 8.6 4.6 9.6 C4.7 8.2 4.5 6.6 4.6 5.5 C4.7 4.7 5.5 4.3 6.1 4.8 C6.5 5.1 6.6 6.2 6.6 7.2 C6.8 6 6.9 4.8 7.2 4.1 C7.5 3.4 8.4 3.4 8.7 4.2 C8.9 4.8 8.9 6.2 8.8 7.3 C9.1 6.4 9.4 5.4 9.8 4.9 C10.3 4.3 11.1 4.7 11.2 5.5 C11.3 6.2 11.1 7.4 10.9 8.2 C11.3 7.6 11.8 7.2 12.3 7.4 C12.9 7.7 12.9 8.6 12.5 9.2 C12 10 11.4 10.8 11.3 12 C11.2 14 11.4 16 11 18'

/** Same outline, flipped across the viewBox midline. */
export const LEFT_HAND_OUTLINE =
  'M10.9 18 C11.4 15.2 11.5 13.4 11.7 12 C12.8 11.6 13.9 10.4 14.3 9.2 C14.6 8.3 14 7.5 13.2 7.6 C12.4 7.7 11.7 8.6 11.4 9.6 C11.3 8.2 11.5 6.6 11.4 5.5 C11.3 4.7 10.5 4.3 9.9 4.8 C9.5 5.1 9.4 6.2 9.4 7.2 C9.2 6 9.1 4.8 8.8 4.1 C8.5 3.4 7.6 3.4 7.3 4.2 C7.1 4.8 7.1 6.2 7.2 7.3 C6.9 6.4 6.6 5.4 6.2 4.9 C5.7 4.3 4.9 4.7 4.8 5.5 C4.7 6.2 4.9 7.4 5.1 8.2 C4.7 7.6 4.2 7.2 3.7 7.4 C3.1 7.7 3.1 8.6 3.5 9.2 C4 10 4.6 10.8 4.7 12 C4.8 14 4.6 16 5 18'

export function PointingHand({
  size = 16,
  className,
  side = 'left',
}: PointingHandProps): ReactNode {
  const width = (size * 16) / 18
  return (
    <svg
      width={width}
      height={size}
      viewBox="0 0 16 18"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.05}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {side === 'right' ? (
        <path d={RIGHT_HAND_OUTLINE} />
      ) : (
        <g transform="rotate(10 8 10)">
          <path d={LEFT_HAND_OUTLINE} />
        </g>
      )}
    </svg>
  )
}
