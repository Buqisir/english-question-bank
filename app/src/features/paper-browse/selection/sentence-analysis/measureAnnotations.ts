import { packAnnotations } from './annotationLayout'
import type { AnnotationRow, LayoutMinimum } from './annotationLayout'

export function placeDecorations(root: HTMLElement, wrap: HTMLElement, reserve: HTMLElement | null, minimum: LayoutMinimum) {
  root.style.setProperty('--sa-label-max-width', `${root.offsetWidth}px`)
  const nodes = [...root.querySelectorAll<HTMLElement>('.sa-label-group, .sa-flag, .sa-restore-controls')]
  const markers = [...root.querySelectorAll<HTMLElement>('.sa-ink-connector')]
  for (const node of [...nodes, ...root.querySelectorAll<HTMLElement>('.sa-under')]) {
    node.hidden = false
    node.style.transform = ''
    delete node.dataset.flip
  }
  const fontSize = Number.parseFloat(getComputedStyle(root).fontSize)
  // Measure from a stable baseline, never from the previous collision result.
  root.style.lineHeight = `${Math.max(minimum.line, fontSize * 3.15)}px`
  for (const region of root.querySelectorAll<HTMLElement>('.sa-local-restore')) {
    delete region.dataset.wrap
    // white-space is inherited: nowrap here keeps the region whole; only a
    // region longer than a full line may break inside.
    if (region.getBoundingClientRect().width > root.getBoundingClientRect().width) region.dataset.wrap = ''
  }
  const origin = root.getBoundingClientRect()
  const scale = origin.width / root.offsetWidth || 1
  const width = root.offsetWidth
  const bindings = new Map<number, { node: HTMLElement; anchor: HTMLElement }>()
  const rows: AnnotationRow[] = []
  for (const token of root.querySelectorAll<HTMLElement>('[data-sa-token], [data-sa-inserted]')) {
    for (const rect of token.getClientRects()) {
      const top = (rect.top - origin.top) / scale
      let row = rows.find(item => Math.abs(item.top - top) < 3)
      if (!row) { row = { top, textBottom: 0, boxes: [], markers: [], entries: [] }; rows.push(row) }
      // Selecting a structure draws a range line under words that had none;
      // keep room for it always so the selection never reopens the leading.
      const bottom = (rect.bottom - origin.top) / scale - row.top + 6
      row.textBottom = Math.max(row.textBottom, bottom)
      row.boxes.push({ left: (rect.left - origin.left) / scale, right: (rect.right - origin.left) / scale,
        top: top - row.top, bottom })
    }
  }
  rows.sort((a, b) => a.top - b.top)
  // Connector markers stay pinned to their words. Reserve their full hit area
  // before packing movable difficulty labels, including labels on nearby words.
  for (const marker of markers) {
    const anchor = marker.closest<HTMLElement>('[data-sa-token]')
    if (!anchor) continue
    const anchorTop = (anchor.getBoundingClientRect().top - origin.top) / scale
    const row = rows.find(item => Math.abs(item.top - anchorTop) < 3)
    if (!row) continue
    const rect = marker.getBoundingClientRect()
    const box = { left: (rect.left - origin.left) / scale, right: (rect.right - origin.left) / scale,
      top: (rect.top - origin.top) / scale - row.top, bottom: (rect.bottom - origin.top) / scale - row.top }
    row.markers.push(box)
    row.boxes.push(box)
  }
  for (const node of nodes) {
    const anchor = node.closest<HTMLElement>('[data-sa-token]')
      || node.closest('.sa-local-restore')?.querySelector<HTMLElement>('[data-sa-token], [data-sa-inserted]')
    if (!anchor) continue
    const rect = node.getBoundingClientRect()
    const token = anchor.getBoundingClientRect()
    const row = rows.find(item => Math.abs(item.top - (token.top - origin.top) / scale) < 3)
    if (!row) continue
    const groupWidth = rect.width / scale
    let natural = Math.max(0, Math.min((rect.left - origin.left) / scale, width - groupWidth))
    // Keep a capsule on its first word. When its action buttons do not fit
    // after it, they flip to the capsule's other side instead of dragging the
    // capsule away from the words it names.
    const capsule = node.classList.contains('sa-label-group') && node.children.length === 1
      ? node.querySelector<HTMLElement>('.sa-label') : null
    if (capsule && groupWidth > capsule.getBoundingClientRect().width / scale + 1) {
      const capsuleWidth = capsule.getBoundingClientRect().width / scale
      const capsuleX = Math.max(0, Math.min((rect.left - origin.left) / scale, width - capsuleWidth))
      const flippedX = capsuleX - (groupWidth - capsuleWidth)
      if (capsuleX + groupWidth > width && flippedX >= 0) {
        node.dataset.flip = ''
        natural = flippedX
      }
    }
    const id = bindings.size
    bindings.set(id, { node, anchor })
    row.entries.push({ id, hidden: false, actionFor: node.dataset.saActionFor,
      labelIds: [...node.querySelectorAll<HTMLElement>('[data-sa-label]')].map(label => label.dataset.saLabel || ''), x: natural, natural, y: 0, width: groupWidth, height: rect.height / scale,
      above: node.classList.contains('sa-label-group') || node.classList.contains('sa-restore-controls'),
      current: Boolean(node.querySelector('[data-current="true"]')),
      persistent: !node.classList.contains('sa-label-group') || node.dataset.persistent !== undefined })
  }
  const plan = packAnnotations(rows, width, fontSize, minimum)
  root.style.lineHeight = `${plan.lineHeight}px`
  wrap.style.paddingTop = `${plan.paddingTop}px`
  const fresh = root.getBoundingClientRect()
  // Read all final coordinates before writing transforms. Transforms do not
  // participate in inline layout, so this preserves the existing placements.
  const placements = plan.entries.map(entry => {
    const { node, anchor } = bindings.get(entry.id)!
    if (entry.hidden) return { node, hidden: true, transform: '' }
    const anchorRect = anchor.getBoundingClientRect()
    const rect = node.getBoundingClientRect()
    return { node, hidden: false, transform: `translate(${(fresh.left - rect.left) / scale + entry.x}px, ${(anchorRect.top - rect.top) / scale + entry.y}px)` }
  })
  for (const { node, hidden, transform } of placements) { node.hidden = hidden; node.style.transform = transform }
  if (reserve) {
    const lastBottom = Math.max(fresh.bottom, ...[...nodes, ...markers].map(node => node.getBoundingClientRect().bottom))
    // The last line's lower half-leading already holds its underlines; only
    // flags that hang past the line box need extra room before the detail row.
    const overflow = (lastBottom - fresh.bottom) / scale
    reserve.style.marginTop = `${overflow > 0 ? overflow + 6 : 0}px`
  }
  return plan.crowded
}
