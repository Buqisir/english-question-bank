/*
 * Scroll-to-center helpers for the paper view. Everything here scrolls the
 * vertical axis ONLY: Element.scrollIntoView also moves the horizontal axis,
 * and a sideways-drifting paper view is exactly the bug this guards against.
 */

// First scrollable ancestor of the element (the paper view scrolls inside the
// app shell, not the window); null falls back to window scrolling.
export function scrollContainerOf(element: Element): HTMLElement | null {
  let node: HTMLElement | null = element.parentElement
  while (node) {
    const overflowY = getComputedStyle(node).overflowY
    if ((overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') && node.scrollHeight > node.clientHeight) return node
    node = node.parentElement
  }
  return null
}

// Bring the element's box to the vertical center of its scroll container
// (or the window) without touching scrollLeft.
export function scrollElementToVerticalCenter(element: Element, behavior: ScrollBehavior): void {
  const rect = element.getBoundingClientRect()
  const container = scrollContainerOf(element)
  if (container) {
    const box = container.getBoundingClientRect()
    container.scrollTo({
      top: container.scrollTop + rect.top - box.top - (container.clientHeight - rect.height) / 2,
      behavior,
    })
    return
  }
  window.scrollTo({ top: window.scrollY + rect.top - (window.innerHeight - rect.height) / 2, behavior })
}
