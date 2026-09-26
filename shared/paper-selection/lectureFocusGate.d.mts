export function createLectureFocusGate(options?: {
  now?: () => number
  doubleClickWaitMs?: number
  dragThresholdPx?: number
  isNonCollapsedSelection?: () => boolean
}): {
  doubleClickWaitMs: number
  pointerDown: (event: { button?: number; clientX?: number; clientY?: number; pointerType?: string }) => void
  pointerMove: (event: { buttons?: number; clientX?: number; clientY?: number }) => void
  pointerUp: () => void
  selectionChanged: () => void
  cancelPending: () => void
  arbitrateLectureFocus: (input?: { source?: 'pointer' | 'keyboard' }) =>
    | { action: 'apply' }
    | { action: 'suppress' }
    | { action: 'defer'; waitMs: number }
  scheduleDeferred: (
    apply: () => void,
    schedule?: (fn: () => void, ms: number) => unknown,
    unschedule?: (id: unknown) => void,
  ) => void
}
