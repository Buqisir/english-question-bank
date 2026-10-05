import type { KeyboardEvent, MouseEvent, PointerEvent } from 'react'
// Attach to the containing control (or a shared playback surface). Capture runs
// before the business handler, including when its result arrives asynchronously.
export const iconMotionInput = {
  onPointerDownCapture(event: PointerEvent<HTMLElement>) {
    event.currentTarget.dataset.iconMotion = 'pointer'
  },
  onKeyDownCapture(event: KeyboardEvent<HTMLElement>) {
    event.currentTarget.dataset.iconMotion = 'instant'
  },
  onClickCapture(event: MouseEvent<HTMLElement>) {
    event.currentTarget.dataset.iconMotion = event.detail === 0 ? 'instant' : 'pointer'
  },
}
