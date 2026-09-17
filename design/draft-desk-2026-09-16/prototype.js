// Frozen local draft content. Only DOM state changes; no app APIs are called.
const root = document.querySelector('#prototype')
const note = document.querySelector('#prototype-note')
const reduced = matchMedia('(prefers-reduced-motion: reduce)')
const sample = await fetch('./snapshot.json').then(response => {
  if (!response.ok) throw new Error(`Snapshot HTTP ${response.status}`)
  return response.json()
})
root.innerHTML = sample.topbar + sample.shell

const frame = root.querySelector('iframe')
const rail = root.querySelector('.draft-paper-rail')
const panel = rail.querySelector('.draft-paper-rail-panel')
const rows = [...panel.querySelectorAll('.draft-paper-rail-item')]
const tools = [...root.querySelectorAll('.draft-group-actions')]
const exportTrigger = root.querySelector('.draft-export-menu-trigger')
const exportMenu = root.querySelector('.draft-export-menu-panel')
const exportRows = [...exportMenu.querySelectorAll('button')]
const menuTemplate = root.querySelector('.draft-group-actions-menu-panel').cloneNode(true)
let selected = 0
let scrollFrame
let navigationTarget = null

function unavailable(event) {
  event.preventDefault()
  note.textContent = '仅展示界面；此操作不修改或导出草稿。'
}

// All original controls are explicitly inert until wired below.
root.querySelectorAll('button, a, [role="button"]').forEach(element => {
  element.addEventListener('click', unavailable)
  element.setAttribute('title', '视觉原型：不写入草稿')
})
root.querySelectorAll('.fluid-hover-list').forEach(element => {
  element.style.setProperty('--fh-o', '0')
  element.removeAttribute('data-fluid-hover-fresh')
})
root.querySelectorAll('[data-fluid-hover-active]').forEach(element => element.removeAttribute('data-fluid-hover-active'))

rows.forEach(row => {
  row.draggable = false
  row.setAttribute('title', '跳转到这篇；原型不演示拖拽排序')
})

function closeMenus(except) {
  for (const menu of root.querySelectorAll('.draft-export-menu-panel, .draft-group-actions-menu-panel')) {
    if (menu !== except) menu.hidden = true
  }
  root.querySelectorAll('[aria-expanded="true"]').forEach(button => {
    if (button !== except?.previousElementSibling) button.setAttribute('aria-expanded', 'false')
  })
}

function wireMenu(trigger, menu) {
  menu.hidden = true
  trigger.setAttribute('aria-expanded', 'false')
  trigger.addEventListener('click', event => {
    event.stopPropagation()
    const opening = menu.hidden
    closeMenus()
    menu.hidden = !opening
    trigger.setAttribute('aria-expanded', String(opening))
    menu.dataset.visible = 'true'
  })
  menu.addEventListener('click', event => event.stopPropagation())
}

wireMenu(exportTrigger, exportMenu)
for (const index of [1, 3]) {
  const divider = document.createElement('span')
  divider.className = 'prototype-menu-divider'
  divider.setAttribute('role', 'separator')
  exportRows[index].before(divider)
}

tools.forEach((tool, index) => {
  const swap = tool.querySelector('button[aria-label="换一篇相似篇章"]')
  if (swap) {
    const text = document.createElement('span')
    text.className = 'prototype-tool-label'
    text.textContent = '换篇'
    swap.append(text)
  }
  const wrapper = tool.querySelector('.draft-group-actions-menu')
  wrapper.querySelector('.draft-group-actions-menu-panel')?.remove()
  const menu = menuTemplate.cloneNode(true)
  menu.id = `prototype-group-menu-${index}`
  const trigger = wrapper.querySelector('button')
  trigger.setAttribute('aria-controls', menu.id)
  wrapper.append(menu)
  const buttons = [...menu.querySelectorAll('button')]
  buttons[0].disabled = index === 0
  buttons[1].disabled = index === tools.length - 1
  if (index === 0) buttons[2].remove()
  menu.querySelectorAll('button').forEach(button => button.addEventListener('click', unavailable))
  wireMenu(trigger, menu)
})

function updateSelection(index) {
  selected = index
  rows.forEach((row, i) => {
    row.classList.toggle('active', i === index)
    if (i === index) row.setAttribute('aria-current', 'location')
    else row.removeAttribute('aria-current')
  })
  panel.style.setProperty('--current-y', `${rows[index].offsetTop}px`)
  const hand = rail.querySelector('.draft-paper-rail-hand')
  hand.style.top = `${rows[index].offsetTop + (rows[index].offsetHeight - 16) / 2}px`
}

function anchor(index) {
  return frame.contentDocument.querySelector(`.preview-page [data-group-id="${sample.groups[index].id}"]`)
}

function jump(index) {
  closeMenus()
  const target = anchor(index)
  if (!target) return
  navigationTarget = index
  window.scrollTo({ top: scrollY + frame.getBoundingClientRect().top + target.getBoundingClientRect().top - 120, behavior: reduced.matches ? 'instant' : 'smooth' })
  updateSelection(index)
}
rows.forEach((row, index) => {
  row.addEventListener('click', () => jump(index))
  row.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); jump(index) }
  })
})

function fluid(container, items, axis = 'y', suppressCurrent = false) {
  function show(item) {
    const origin = container.getBoundingClientRect()
    const box = item.getBoundingClientRect()
    container.style.setProperty('--fh-x', `${box.x - origin.x}px`)
    container.style.setProperty('--fh-y', `${box.y - origin.y}px`)
    container.style.setProperty('--fh-w', `${box.width}px`)
    container.style.setProperty('--fh-h', `${box.height}px`)
    container.style.setProperty('--fh-o', suppressCurrent && item.classList.contains('active') ? '0' : '1')
    items.forEach(row => row.toggleAttribute('data-fluid-hover-active', row === item))
  }
  container.addEventListener('pointermove', event => {
    if (event.pointerType === 'touch') return
    const visible = items.filter(item => !item.disabled && item.getBoundingClientRect().height)
    const coord = axis === 'y' ? event.clientY : event.clientX
    const distance = item => {
      const r = item.getBoundingClientRect()
      return Math.abs(coord - (axis === 'y' ? r.top + r.height / 2 : r.left + r.width / 2))
    }
    if (visible.length) show(visible.reduce((a, b) => distance(a) < distance(b) ? a : b))
  })
  container.addEventListener('pointerleave', () => {
    container.style.setProperty('--fh-o', '0')
    items.forEach(item => item.removeAttribute('data-fluid-hover-active'))
  })
  items.forEach(item => item.addEventListener('focus', () => show(item)))
  container.addEventListener('focusout', event => {
    if (!container.contains(event.relatedTarget)) container.style.setProperty('--fh-o', '0')
  })
}
fluid(panel, rows, 'y', true)
fluid(exportMenu, exportRows)
root.querySelectorAll('.draft-version-toggle').forEach(container => fluid(container, [...container.querySelectorAll('button')], 'x', true))

document.querySelectorAll('.prototype-controls [data-mode]').forEach(button => {
  button.addEventListener('click', event => {
    // Keep the same open menu, question and scroll position for a direct A/B.
    event.stopPropagation()
    document.body.dataset.mode = button.dataset.mode
    document.querySelectorAll('.prototype-controls [data-mode]').forEach(other => other.setAttribute('aria-pressed', String(other === button)))
    root.querySelectorAll('.fluid-hover-list').forEach(container => {
      container.style.setProperty('--fh-o', '0')
    })
    note.textContent = '纯 UI 对比 · 不修改草稿'
    requestAnimationFrame(() => updateSelection(selected))
  })
})
document.addEventListener('click', () => closeMenus())
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    const open = root.querySelector('[aria-expanded="true"]')
    closeMenus()
    open?.focus()
  }
})

const loaded = new Promise(resolve => frame.addEventListener('load', resolve, { once: true }))
frame.srcdoc = sample.paper
await loaded
await Promise.all([document.fonts.ready, frame.contentDocument.fonts.ready])
updateSelection(0)
root.setAttribute('aria-busy', 'false')
document.body.dataset.ready = 'true'
window.addEventListener('resize', () => updateSelection(selected))
for (const event of ['wheel', 'touchstart', 'pointerdown']) {
  window.addEventListener(event, () => { navigationTarget = null }, { passive: true })
}
window.addEventListener('scroll', () => {
  cancelAnimationFrame(scrollFrame)
  scrollFrame = requestAnimationFrame(() => {
    if (navigationTarget !== null) {
      const targetTop = anchor(navigationTarget).getBoundingClientRect().top + frame.getBoundingClientRect().top
      if (Math.abs(targetTop - 120) > 2) return
      navigationTarget = null
    }
    let index = 0
    sample.groups.forEach((_, i) => {
      if (anchor(i).getBoundingClientRect().top + frame.getBoundingClientRect().top <= 160) index = i
    })
    if (index !== selected) updateSelection(index)
  })
}, { passive: true })
