// Standalone directory study using captured local-app DOM. No API, persistence,
// export, or lecture-selection changes. The paper contains all nine real groups.
const root = document.querySelector('#prototype')
const status = document.querySelector('#prototype-status')
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
const easing = 'cubic-bezier(0.23, 1, 0.32, 1)'

function fromHTML(html) {
  const template = document.createElement('template')
  template.innerHTML = html
  return template.content.firstElementChild
}

function freeze(container) {
  for (const element of container.querySelectorAll('button, a, input, select, textarea')) {
    element.setAttribute('aria-disabled', 'true')
    element.tabIndex = -1
    element.dataset.prototypeInert = ''
    element.title = '目录交互原型：此操作未开放'
    element.addEventListener('click', event => event.preventDefault())
  }
}

try {
  const response = await fetch('./snapshot.json')
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const sample = await response.json()
  const page = fromHTML('<div class="paper-browse-page"></div>')
  const shell = fromHTML('<div class="paper-browse-shell paper-browse-shell--lecture-open"></div>')
  const rail = fromHTML(sample.rail)
  const panel = rail.querySelector('.paper-browse-rail-panel')
  const paper = fromHTML(sample.content)
  const lecture = fromHTML(sample.panel)
  const topbar = fromHTML(sample.topbar)
  const rows = [...rail.querySelectorAll('[data-paper-browse-rail-anchor]')]
  const groups = rows.map(row => paper.querySelector(`[data-paper-browse-anchor="${row.dataset.paperBrowseRailAnchor}"]`))
  const current = fromHTML('<span class="rail-current" aria-hidden="true"></span>')
  const hover = fromHTML('<span class="rail-hover" aria-hidden="true"></span>')
  // Use the SVG captured from PointingHand.tsx, not a redrawn approximation.
  const oldHand = rail.querySelector('.paper-browse-rail-hand')
  const hand = oldHand.querySelector('svg')
  oldHand.remove()
  panel.prepend(hover, current)
  for (const section of rail.querySelectorAll('.paper-browse-rail-part-head')) {
    section.replaceWith(fromHTML(`<div class="paper-browse-rail-part-head">${section.innerHTML}</div>`))
  }
  for (const container of [paper, lecture, topbar]) freeze(container)
  shell.append(rail, paper, lecture)
  page.append(topbar, shell)
  root.replaceChildren(page)
  await document.fonts.ready

  let active = 0
  let hovered = null
  let selectedAnimation
  let hoverAnimation
  let scrollTarget = null
  let scrollTimer
  let scrollFrame
  const baseTitles = rows.map(row => row.querySelector('.paper-browse-rail-group-title').textContent)

  function rectFor(index, handOnly = false) {
    const row = rows[index]
    const origin = panel.getBoundingClientRect()
    const box = row.getBoundingClientRect()
    if (handOnly) {
      const label = row.querySelector('.paper-browse-rail-group-title').getBoundingClientRect()
      return { x: label.left - origin.left - 18.22, y: box.top - origin.top + (box.height - 16) / 2, width: 14.22, height: 16 }
    }
    return { x: box.left - origin.left, y: box.top - origin.top, width: box.width, height: box.height }
  }

  function position(element, box) {
    element.style.transform = `translate(${box.x}px, ${box.y}px)`
    element.style.width = `${box.width}px`
    element.style.height = `${box.height}px`
  }

  function moveCurrent(index, animate = true) {
    const before = getComputedStyle(current).transform
    selectedAnimation?.cancel()
    const previous = active
    active = index
    rows.forEach((row, i) => {
      row.classList.toggle('paper-browse-rail-group--active', i === active)
      if (i === active) row.setAttribute('aria-current', 'location')
      else row.removeAttribute('aria-current')
    })
    position(current, rectFor(active, document.body.dataset.mode === 'before'))
    if (animate && !reducedMotion.matches && previous !== active) {
      const after = current.style.transform
      // Adjacent: move the single hand/plate together. Far: relocate and fade
      // in at the destination, never fly a white shadow across intervening rows.
      const adjacent = Math.abs(previous - active) === 1
      selectedAnimation = current.animate(adjacent
        ? [{ transform: before }, { transform: after }]
        : [{ opacity: 0 }, { opacity: 1 }], {
        duration: adjacent ? 160 : 120, easing,
      })
    }
    status.textContent = `当前阅读：${rows[active].textContent.trim()}`
    // If the pointer is on the new current row, show only the white plate.
    if (hovered !== null) showHover(hovered, false)
  }

  function hideHover() {
    hoverAnimation?.cancel()
    hovered = null
    hover.style.opacity = '0'
  }

  function showHover(index, animate = true) {
    const wasVisible = hovered !== null && hover.style.opacity === '1'
    const before = getComputedStyle(hover).transform
    hoverAnimation?.cancel()
    hovered = index
    position(hover, rectFor(index))
    hover.style.opacity = index === active ? '0' : '1'
    if (animate && wasVisible && index !== active && !reducedMotion.matches) {
      hoverAnimation = hover.animate([{ transform: before }, { transform: hover.style.transform }], {
        duration: 120, easing,
      })
    }
  }

  function targetY(index) {
    return Math.max(0, groups[index].getBoundingClientRect().top + scrollY
      - document.querySelector('.prototype-toolbar').offsetHeight - 24)
  }

  function goTo(index, animate = true) {
    scrollTarget = index
    clearTimeout(scrollTimer)
    moveCurrent(index, animate)
    // Keep the existing semantics: move through the paper; do not switch the
    // lecture's explicit question selection. Long jumps do not sweep the sheet.
    const nearby = Math.abs(targetY(index) - scrollY) < innerHeight * 1.5
    window.scrollTo({ top: targetY(index), behavior: animate && nearby && !reducedMotion.matches ? 'smooth' : 'instant' })
    scrollTimer = setTimeout(() => { scrollTarget = null }, 1000)
  }

  rows.forEach((row, index) => {
    row.addEventListener('click', () => goTo(index))
    row.addEventListener('focus', hideHover)
    row.addEventListener('keydown', event => {
      const next = event.key === 'ArrowDown' ? Math.min(rows.length - 1, index + 1)
        : event.key === 'ArrowUp' ? Math.max(0, index - 1)
          : event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1 : null
      if (next === null) return
      event.preventDefault()
      rows[next].focus({ preventScroll: true })
    })
  })

  panel.addEventListener('pointermove', event => {
    if (event.pointerType === 'touch') return
    const box = panel.getBoundingClientRect()
    const y = event.clientY - box.top
    // Keep one shared highlight continuous over the small inter-row gaps.
    // Section titles are a reading pause, not another selectable item.
    if (event.target.closest('.paper-browse-rail-part-head')) { hideHover(); return }
    let best = 0
    let distance = Infinity
    rows.forEach((row, index) => {
      const rect = rectFor(index)
      const delta = Math.max(rect.y - y, 0, y - rect.y - rect.height)
      if (delta < distance) { distance = delta; best = index }
    })
    if (distance > 8) { hideHover(); return }
    if (best !== hovered) showHover(best)
  })
  panel.addEventListener('pointerleave', hideHover)

  function applyMode(mode) {
    hideHover()
    document.body.dataset.mode = mode
    current.replaceChildren(...(mode === 'no-hand' ? [] : [hand]))
    rows.forEach((row, index) => {
      row.querySelector('.paper-browse-rail-group-title').textContent = mode !== 'before' && index < 4
        ? `${baseTitles[index]}篇` : baseTitles[index]
    })
    document.querySelectorAll('.prototype-modes button').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.mode === mode))
    })
    moveCurrent(active, false)
  }
  document.querySelectorAll('.prototype-modes button').forEach(button => {
    button.addEventListener('click', () => applyMode(button.dataset.mode))
  })

  window.addEventListener('scroll', () => {
    cancelAnimationFrame(scrollFrame)
    scrollFrame = requestAnimationFrame(() => {
      if (scrollTarget !== null) return
      const threshold = document.querySelector('.prototype-toolbar').offsetHeight + 96
      let index = 0
      groups.forEach((group, i) => { if (group.getBoundingClientRect().top <= threshold) index = i })
      if (index !== active) moveCurrent(index)
    })
  }, { passive: true })
  window.addEventListener('scrollend', () => { scrollTarget = null; clearTimeout(scrollTimer) })
  // Explicit manual input interrupts a pending programmatic scroll lock.
  for (const event of ['wheel', 'touchstart']) window.addEventListener(event, () => { scrollTarget = null }, { passive: true })
  new ResizeObserver(() => { hideHover(); moveCurrent(active, false) }).observe(panel)
  reducedMotion.addEventListener('change', () => { hideHover(); moveCurrent(active, false) })
  applyMode('no-hand')
  goTo(0, false)
  root.setAttribute('aria-busy', 'false')
} catch (error) {
  root.setAttribute('aria-busy', 'false')
  root.textContent = `原型载入失败：${error.message}。请刷新重试。`
}
