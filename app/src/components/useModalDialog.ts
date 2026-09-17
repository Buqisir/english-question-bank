import { useLayoutEffect, useRef } from 'react'

/** Native background inertness, with an explicit in-dialog Tab loop and
 * restoration after React unmounts the dialog (including delayed exits). */
export function useModalDialog(open: boolean) {
  const ref = useRef<HTMLDialogElement>(null)
  useLayoutEffect(() => {
    const dialog = ref.current
    if (!open || !dialog) return
    const trigger = document.activeElement as HTMLElement | null
    dialog.showModal()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const controls = [...dialog.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex]')]
        .filter((el) => el.tabIndex >= 0 && !el.matches(':disabled') && el.getClientRects().length > 0)
      const first = controls[0]
      const last = controls.at(-1)
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
    dialog.addEventListener('keydown', onKeyDown)
    return () => {
      dialog.removeEventListener('keydown', onKeyDown)
      dialog.close()
      trigger?.focus({ preventScroll: true })
    }
  }, [open])
  return ref
}
