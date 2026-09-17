// Local display prototype only. All fetches are static files in this folder;
// controls never call app APIs, download files, navigate, or delete data.
const root = document.querySelector('#root')
const params = new URLSearchParams(location.search)
const [snapshot, emptyMarkup, dialogMarkup, fixture] = await Promise.all([
  fetch('./snapshot.html').then(r => r.text()),
  fetch('./empty.html').then(r => r.text()),
  fetch('./dialog.html').then(r => r.text()),
  fetch('./fixture.json').then(r => r.json()),
])
root.innerHTML = snapshot
root.setAttribute('aria-busy', 'false')
const main = root.querySelector('.my-space-main')
const filesMarkup = main.innerHTML
let folderId = null
let state = params.get('state') === 'empty' ? 'empty' : 'files'
let noticeTimer

function notice(message) {
  clearTimeout(noticeTimer)
  const node = document.querySelector('#prototype-notice')
  node.textContent = message
  node.hidden = false
  noticeTimer = setTimeout(() => { node.hidden = true }, 2800)
}

function setMode(mode) {
  document.body.dataset.mode = mode
  document.querySelectorAll('.prototype-switch button').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.mode === mode))
  })
  root.querySelectorAll('.fluid-hover-list').forEach(node => node.style.setProperty('--fh-o', '0'))
  const url = new URL(location.href)
  url.searchParams.set('mode', mode)
  history.replaceState(null, '', url)
}

// A bounded visual facsimile of the app's shared hover, used only on the same
// filter/topbar groups. Fresh entry paints in place; gaps target nearest item.
function wireHover(container) {
  let active = null
  let distance = Infinity
  const buttons = [...container.querySelectorAll('button')]
  const clear = () => {
    buttons.forEach(button => button.removeAttribute('data-fluid-hover-active'))
    container.style.setProperty('--fh-o', '0')
    active = null
  }
  container.addEventListener('pointerenter', () => {
    container.setAttribute('data-fluid-hover-fresh', '')
    requestAnimationFrame(() => requestAnimationFrame(() => container.removeAttribute('data-fluid-hover-fresh')))
  })
  container.addEventListener('pointermove', event => {
    if (event.pointerType === 'touch') return
    distance = Infinity
    for (const button of buttons) {
      const r = button.getBoundingClientRect()
      const d = Math.hypot(Math.max(r.left - event.clientX, 0, event.clientX - r.right), Math.max(r.top - event.clientY, 0, event.clientY - r.bottom))
      if (d < distance) { distance = d; active = button }
    }
    if (!active) return
    const r = active.getBoundingClientRect(), base = container.getBoundingClientRect()
    buttons.forEach(button => button.toggleAttribute('data-fluid-hover-active', button === active))
    for (const [key, value] of Object.entries({ x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height })) {
      container.style.setProperty(`--fh-${key}`, `${value}px`)
    }
    container.style.setProperty('--fh-o', '1')
  })
  container.addEventListener('pointerleave', clear)
  container.addEventListener('click', event => {
    if (event.target === container && active && distance <= 6) active.click()
  })
}

function openConfirm(artifact, trigger) {
  const template = document.createElement('template')
  template.innerHTML = dialogMarkup
  const backdrop = template.content.firstElementChild
  const dialog = backdrop.querySelector('[role="alertdialog"]')
  dialog.querySelector('p').textContent = `删除「${artifact.title}」？PDF 文件会一并删除，此操作不可恢复。原草稿不受影响。`
  const [cancel, confirm] = dialog.querySelectorAll('button')
  function close() {
    backdrop.remove()
    document.removeEventListener('keydown', onKey)
    trigger.focus()
  }
  function onKey(event) {
    if (event.key === 'Escape') close()
    if (event.key === 'Tab') {
      event.preventDefault()
      ;(document.activeElement === cancel ? confirm : cancel).focus()
    }
  }
  cancel.addEventListener('click', close)
  confirm.addEventListener('click', () => {
    close()
    notice('仅演示确认样式，没有删除任何文件。')
  })
  root.querySelector('.my-space-page').append(backdrop)
  document.addEventListener('keydown', onKey)
  cancel.focus()
}

function renderState() {
  document.querySelector('#prototype-state').value = state
  main.innerHTML = filesMarkup
  if (state === 'empty') {
    main.querySelector('.my-space-section-head span').remove()
    main.querySelectorAll('.my-space-folders, .my-space-month-group').forEach(node => node.remove())
    main.insertAdjacentHTML('beforeend', emptyMarkup)
    main.querySelector('.my-space-empty-cta').onclick = () => notice('原型不跳转；正式页面仍返回找题。')
    return
  }
  const chips = [...main.querySelectorAll('.my-space-chip')]
  chips.forEach((chip, index) => {
    const id = index === 0 ? null : fixture.folders[index - 1].id
    chip.classList.toggle('is-selected', id === folderId)
    chip.setAttribute('aria-pressed', String(id === folderId))
    chip.onclick = () => { folderId = id; renderState() }
  })
  main.querySelectorAll('.my-space-card').forEach((card, index) => {
    const artifact = fixture.artifacts[index]
    card.dataset.artifactId = artifact.id
    card.hidden = folderId !== null && artifact.folderId !== folderId
    const [download, save, open, remove] = card.querySelectorAll('.my-space-card-actions button')
    download.onclick = () => notice('原型不下载文件；正式页面仍下载已保存的 PDF。')
    save.onclick = () => notice('原型不调用文件选择器；正式页面仍执行“另存为”。')
    open.onclick = () => notice(artifact.sourceDraftExists ? '原型不跳转；正式页面仍打开对应原草稿。' : '原草稿卷已删除，PDF 仍可下载')
    remove.onclick = () => openConfirm(artifact, remove)
  })
  main.querySelectorAll('.my-space-month-group').forEach(group => {
    const count = group.querySelectorAll('.my-space-card:not([hidden])').length
    group.hidden = count === 0
    group.querySelector('.my-space-month-count').textContent = `${count} 份`
  })
  main.querySelector('.my-space-section-head span').textContent = `${main.querySelectorAll('.my-space-card:not([hidden])').length} 份`
  wireHover(main.querySelector('.my-space-folders'))
}

document.querySelectorAll('.prototype-switch button').forEach(button => {
  button.onclick = () => setMode(button.dataset.mode)
})
document.querySelector('#prototype-state').onchange = event => {
  state = event.target.value
  const url = new URL(location.href)
  url.searchParams.set('state', state)
  history.replaceState(null, '', url)
  renderState()
}
root.querySelector('.topbar-back').onclick = () => notice('原型不跳转；正式页面仍返回找题。')
root.querySelector('.topbar .ghost-button').onclick = () => notice('原型不跳转；正式页面仍进入过生词。')
wireHover(root.querySelector('.topbar-actions'))
setMode(params.get('mode') === 'before' ? 'before' : 'after')
renderState()
