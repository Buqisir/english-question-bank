import { useLayoutEffect, useRef } from 'react'

export type UseModalDialogOptions = {
  /** 关上以后焦点回到哪里。不给就回到打开那一刻的焦点（document.activeElement）。
   *  打开它的键在打开时已经不在了（比如菜单项、下拉列表里的项）时用它指定一个还在的键。 */
  returnFocus?: () => HTMLElement | null | undefined
}

/** Native background inertness, with an explicit in-dialog Tab loop and
 * restoration after React unmounts the dialog (including delayed exits). */
export function useModalDialog(open: boolean, options: UseModalDialogOptions = {}) {
  const ref = useRef<HTMLDialogElement>(null)
  // 每次提交后记下最新的 returnFocus；下面的 effect 只跟着 open 走，关的时候读这里。
  const returnFocusRef = useRef(options.returnFocus)
  useLayoutEffect(() => {
    returnFocusRef.current = options.returnFocus
  })
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
      const target = returnFocusRef.current?.() || trigger
      target?.focus({ preventScroll: true })
    }
  }, [open])
  return ref
}
