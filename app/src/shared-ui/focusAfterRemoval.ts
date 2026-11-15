/**
 * 删掉一项以后焦点落在哪（构件收尾，2026-11-15，Owner 当天定；设计记录
 * design/components-2026-11-13/migrate-finish/README.md「焦点落空」）。
 *
 * 问题：确认框确认以后，打开它的那个键跟着那一项一起没了（个人空间删文件、作废 Agent 口令、详情页删题组），
 * Dialog 把焦点还给一个已经不在页面上的键，焦点就掉到 <body>，键盘用户得从页面开头重新 Tab。
 *
 * 规则（照这个顺序，取第一个还在、能用的）：
 * 1. 列表里下一项的同一个键（键盘用户原来在哪一列，删完还在那一列，接着往下处理）；
 * 2. 没有下一项（删的是最后一项），上一项的同一个键；
 * 3. 列表空了、或者前后都没有这个键（比如别的口令都已作废，没有「作废口令」键了），落到列表的标题。
 *    标题要带 tabIndex={-1}，只让程序把焦点放上去，Tab 不停在它上面。
 * 「同一个键」由调用处给的 control 选择器认；「哪一项」由 item 选择器加一个放稳定 id 的属性（key）认，
 * 所以列表重画（甚至整块卸掉再挂上）以后也找得回来，不靠记住 DOM 节点。
 *
 * 用法：在删之前（键还在的时候）调用 planFocusAfterRemoval，拿回一个函数。
 * - 列表在确认框关上时还在：把这个函数直接交给 Dialog 的 returnFocus。
 * - 列表要等删完、重新取数以后才变：删完再调用一次，对返回的元素 .focus()。
 * 函数每次调用都重新查一遍页面，查不到就返回 null（Dialog 这时回到打开它的键）。
 */

export type FocusAfterRemovalOptions = {
  /** 列表里每一项的选择器，比如 '.my-space-file-row'。 */
  item: string
  /** 每一项上放稳定 id 的属性名，比如 'data-artifact-id'。 */
  key: string
  /** 项里要落焦点的那个键的选择器（和被删那一项上打开确认框的键是同一种）。 */
  control: string
  /** 前后都没有时落到哪里：一般是列表的标题（带 tabIndex={-1}）。 */
  fallback: () => HTMLElement | null | undefined
  /** 在哪个范围里找项，默认整页。 */
  scope?: ParentNode
}

function usable(element: HTMLElement | null | undefined): element is HTMLElement {
  if (!element || !element.isConnected) return false
  if (element.matches(':disabled') || element.getAttribute('aria-disabled') === 'true') return false
  return element.getClientRects().length > 0
}

/** 删之前调用。trigger 是被删那一项上打开确认框的键（或那一项里任何一个元素）。 */
export function planFocusAfterRemoval(trigger: HTMLElement, options: FocusAfterRemovalOptions): () => HTMLElement | null {
  const { item, key, control, fallback, scope = document } = options
  const removedItem = trigger.closest<HTMLElement>(item)
  const items = [...scope.querySelectorAll<HTMLElement>(item)]
  const index = removedItem ? items.indexOf(removedItem) : -1
  const keyOf = (element: HTMLElement | undefined) => element?.getAttribute(key) ?? null
  // 先后顺序：后面的项从近到远，再前面的项从近到远。只记 id，不记节点。
  const candidates = index < 0
    ? []
    : [...items.slice(index + 1), ...items.slice(0, index).reverse()].map(keyOf).filter((value): value is string => value !== null)

  return () => {
    for (const value of candidates) {
      const owner = [...scope.querySelectorAll<HTMLElement>(item)].find((element) => element.getAttribute(key) === value)
      const target = owner?.querySelector<HTMLElement>(control)
      if (usable(target)) return target
    }
    const last = fallback()
    return last && last.isConnected ? last : null
  }
}

/**
 * 让一个本来不能聚焦的元素（列表标题、整块区域）这一次能被程序放上焦点：没有 tabindex 就临时加 tabindex="-1"，
 * 焦点一离开就拿掉，不留在页面上（免得鼠标点到标题、区域里的空白处时焦点停在它上面）。
 * 规则第 3 条的「列表标题」、详情页删掉题组后回到的那一页，都用它。
 */
export function programmaticFocusTarget(element: HTMLElement | null | undefined): HTMLElement | null {
  if (!element || !element.isConnected) return null
  if (element.tabIndex >= 0 || element.hasAttribute('tabindex')) return element
  element.setAttribute('tabindex', '-1')
  element.addEventListener('blur', () => element.removeAttribute('tabindex'), { once: true })
  return element
}
