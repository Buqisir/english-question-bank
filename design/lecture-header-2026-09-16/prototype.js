// Isolated visual prototype. The baseline is rendered DOM captured from the
// local app (three questions × four options), not re-authored exam content.
// No API mutations, storage, download, or production renderer changes.
const root = document.querySelector('#prototype')
const status = document.querySelector('#review-status')
const questionSelect = document.querySelector('#question-select')
let mode = 'compare'
let question = 21
let option = 'B'
let overviewOpen = false
let snapshots

function fromHTML(html) {
  const template = document.createElement('template')
  template.innerHTML = html
  return template.content.firstElementChild
}

// Exact paths from the existing EQB ArrowRight / ChevronDown glyphs.
function icon(name) {
  const paths = name === 'arrow'
    ? '<path d="M4 12h16"/><path d="m14 6 6 6-6 6"/>'
    : '<path d="m5.5 9 6.5 6.5L18.5 9"/>'
  return fromHTML(`<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`)
}

function freezeOutsideScope(container) {
  for (const button of container.querySelectorAll('button')) {
    button.setAttribute('aria-disabled', 'true')
    button.dataset.prototypeInert = ''
    button.tabIndex = -1
    button.title = '本原型只演示阅读 A 的切题、选项和文章简介'
  }
}

function titleCrop(after) {
  const crop = document.createElement('div')
  crop.className = 'review-title-crop'
  crop.append(fromHTML(snapshots.meta.topbar).querySelector('.topbar-identity'))
  if (after) crop.querySelector('.topbar-page-title').textContent = snapshots.meta.displayTitle
  return crop
}

function setQuestion(number) {
  question = number
  option = snapshots.meta.answers.find(item => item.number === number).answer
  render()
  status.textContent = `已切换到第 ${number} 题，答案 ${option}`
}

// A small non-React preview of the app's one-highlight hover behavior. Native
// focus and actual selection remain separate; pointer entry never flies in.
function wireHover(container, selector) {
  const items = [...container.querySelectorAll(selector)]
  let shown = false
  container.addEventListener('pointermove', event => {
    if (event.pointerType === 'touch') return
    let target = items.find(item => item.contains(event.target))
    // Keep the highlight in small gaps, but don't light an option while the
    // pointer is reading its expanded analysis content.
    if (!target && event.target === container) {
      let nearestDistance = Infinity
      for (const item of items) {
        const box = item.getBoundingClientRect()
        const dx = Math.max(box.left - event.clientX, 0, event.clientX - box.right)
        const dy = Math.max(box.top - event.clientY, 0, event.clientY - box.bottom)
        const distance = dx * dx + dy * dy
        if (distance < nearestDistance) {
          nearestDistance = distance
          target = item
        }
      }
    }
    if (!target) {
      container.style.setProperty('--fh-o', '0')
      shown = false
      return
    }
    const box = target.getBoundingClientRect()
    const origin = container.getBoundingClientRect()
    if (!shown) container.dataset.protoFresh = ''
    container.style.setProperty('--fh-x', `${box.left - origin.left}px`)
    container.style.setProperty('--fh-y', `${box.top - origin.top}px`)
    container.style.setProperty('--fh-w', `${box.width}px`)
    container.style.setProperty('--fh-h', `${box.height}px`)
    container.style.setProperty('--fh-o', '1')
    if (!shown) void getComputedStyle(container, '::before').transform
    delete container.dataset.protoFresh
    shown = true
  })
  container.addEventListener('pointerleave', () => {
    container.style.setProperty('--fh-o', '0')
    shown = false
  })
}

function createPanel(after) {
  const panel = fromHTML(snapshots.states[`${question}-${option}`].panel)
  if (after) {
    panel.classList.add('proposal')
    const title = panel.querySelector('.paper-browse-lecture-title')
    const overview = panel.querySelector('.pi-reading-group-overview')
    const groupHeader = document.createElement('div')
    groupHeader.className = 'prototype-group-header'
    title.textContent = '阅读 A'
    title.before(groupHeader)
    groupHeader.append(title)
    if (overview) {
      const toggle = document.createElement('button')
      toggle.className = 'prototype-overview-toggle'
      toggle.type = 'button'
      toggle.append('文章简介', icon('chevron'))
      toggle.setAttribute('aria-expanded', String(overviewOpen))
      toggle.setAttribute('aria-controls', 'proposal-overview')
      const text = overview.querySelector('.pi-reading-group-overview-text')
      text.className = 'prototype-overview-text'
      text.id = 'proposal-overview'
      text.hidden = !overviewOpen
      groupHeader.append(toggle, text)
      overview.remove()
      toggle.addEventListener('click', () => {
        overviewOpen = !overviewOpen
        toggle.setAttribute('aria-expanded', String(overviewOpen))
        text.hidden = !overviewOpen
        const original = root.querySelector('.review-before .pi-reading-group-overview')
        if (original) original.open = overviewOpen
        requestAnimationFrame(drawLine)
      })
    }
    panel.querySelector('.paper-browse-answer-row')?.remove()
    const nav = document.createElement('nav')
    nav.className = 'prototype-question-nav fluid-hover-list'
    nav.setAttribute('aria-label', '阅读 A 题目与答案')
    for (const item of snapshots.meta.answers) {
      const button = document.createElement('button')
      button.type = 'button'
      button.dataset.question = item.number
      button.setAttribute('aria-pressed', String(item.number === question))
      button.setAttribute('aria-label', `第 ${item.number} 题，答案 ${item.answer}`)
      const answer = document.createElement('span')
      answer.className = 'prototype-answer'
      answer.textContent = item.answer
      button.append(String(item.number), answer)
      button.addEventListener('click', () => {
        setQuestion(item.number)
        root.querySelector(`[data-question="${item.number}"]`)?.focus({ preventScroll: true })
      })
      nav.append(button)
    }
    groupHeader.after(nav)
    wireHover(nav, 'button')

    for (const item of panel.querySelectorAll('.pi-ps-analysis-paraphrases > li')) {
      const source = item.querySelector('span')
      const target = item.querySelector('strong')
      const note = item.querySelector('p')
      if (!source || !target) continue
      const sourceLine = document.createElement('span')
      sourceLine.className = 'prototype-pair-source'
      sourceLine.textContent = source.textContent
      const targetLine = document.createElement('span')
      targetLine.className = 'prototype-pair-target'
      const expression = document.createElement('span')
      expression.textContent = target.textContent
      targetLine.append(icon('arrow'), expression)
      item.replaceChildren(sourceLine, targetLine, ...(note ? [note] : []))
    }
  } else {
    const overview = panel.querySelector('.pi-reading-group-overview')
    if (overview) {
      overview.open = overviewOpen
      overview.addEventListener('toggle', () => {
        overviewOpen = overview.open
        const toggle = root.querySelector('.prototype-overview-toggle')
        const text = root.querySelector('.prototype-overview-text')
        toggle?.setAttribute('aria-expanded', String(overviewOpen))
        if (text) text.hidden = !overviewOpen
        requestAnimationFrame(drawLine)
      })
    }
  }

  for (const section of panel.querySelectorAll('.pi-ps-analysis-option-section')) {
    section.querySelector('.pi-ps-analysis-option-row').addEventListener('click', () => {
      const previousScroll = panel.scrollTop
      option = section.dataset.piOptionLabel
      render()
      const nextPanel = root.querySelector(after ? '.proposal' : '.paper-browse-lecture-panel')
      nextPanel.scrollTop = previousScroll
      nextPanel.querySelector(`[data-pi-option-label="${option}"] .pi-ps-analysis-option-row`)?.focus({ preventScroll: true })
    })
  }
  freezeOutsideScope(panel.querySelector('.similar-cta'))
  for (const button of panel.querySelectorAll('[data-pi-evidence-id]')) {
    button.addEventListener('click', () => {
      panel.querySelectorAll('[data-pi-evidence-id]').forEach(evidence => {
        const active = evidence === button
        evidence.setAttribute('aria-pressed', String(active))
        evidence.classList.toggle('pi-ps-analysis-evidence--selected', active && evidence.dataset.piEvidenceKind === 'support')
        evidence.classList.toggle('pi-ps-analysis-distractor--selected', active && evidence.dataset.piEvidenceKind === 'trap')
      })
      requestAnimationFrame(drawLine)
    })
  }
  wireHover(panel.querySelector('.pi-ps-analysis-options'), '.pi-ps-analysis-option-row')
  panel.addEventListener('scroll', drawLine, { passive: true })
  return panel
}

function compareColumn(after) {
  const column = document.createElement('section')
  column.className = `review-column ${after ? 'review-after' : 'review-before'}`
  const title = document.createElement('h2')
  title.textContent = after ? '调整后' : '现在'
  column.append(title, titleCrop(after), createPanel(after))
  return column
}

function fullPage(after) {
  const page = document.createElement('div')
  page.className = 'paper-browse-page review-preview'
  const topbar = fromHTML(snapshots.meta.topbar)
  if (after) topbar.querySelector('.topbar-page-title').textContent = snapshots.meta.displayTitle
  freezeOutsideScope(topbar)
  const shell = document.createElement('div')
  shell.className = 'paper-browse-shell paper-browse-shell--lecture-open'
  const rail = fromHTML(snapshots.meta.rail)
  freezeOutsideScope(rail)
  const paper = document.createElement('div')
  paper.className = 'paper-browse-content'
  paper.setAttribute('style', snapshots.meta.contentStyle)
  const zoom = document.createElement('div')
  zoom.className = 'paper-browse-zoom'
  zoom.append(fromHTML(snapshots.states[`${question}-${option}`].paper))
  paper.append(zoom)
  paper.querySelectorAll('.ps-question').forEach(element => {
    const number = Number(element.querySelector('.ps-question-no').textContent.replace('.', ''))
    element.addEventListener('click', () => setQuestion(number))
  })
  const line = fromHTML('<svg class="pi-line-overlay" aria-hidden="true" data-empty="true"><path class="pi-line-path"/></svg>')
  shell.append(rail, paper, createPanel(after), line)
  page.append(topbar, shell)
  return page
}

function drawLine() {
  const shell = root.querySelector('.review-preview .paper-browse-shell')
  if (!shell) return
  const overlay = shell.querySelector('.pi-line-overlay')
  const evidence = shell.querySelector('[data-pi-evidence-id][aria-pressed="true"]')
  const mark = shell.querySelector('.ps-evidence-anchor--active')
  if (!evidence || !mark || evidence.dataset.piEvidenceId !== mark.dataset.paperEvidenceId) {
    overlay.dataset.empty = 'true'
    return
  }
  const panelBox = shell.querySelector('.paper-browse-lecture-panel').getBoundingClientRect()
  const target = evidence.getBoundingClientRect()
  if (target.top < panelBox.top || target.top > panelBox.bottom) {
    overlay.dataset.empty = 'true'
    return
  }
  const rects = mark.getClientRects()
  const source = rects[rects.length - 1]
  const origin = shell.getBoundingClientRect()
  const x1 = source.right - origin.left
  const y1 = source.bottom - origin.top
  const x2 = target.left - origin.left
  const y2 = target.top + target.height / 2 - origin.top
  const bend = Math.max(24, (x2 - x1) / 2)
  const path = overlay.querySelector('path')
  path.dataset.piEvidenceKind = evidence.dataset.piEvidenceKind
  path.setAttribute('d', `M${x1},${y1} C${x1 + bend},${y1} ${x2 - bend},${y2} ${x2},${y2}`)
  overlay.dataset.empty = 'false'
}

function render() {
  questionSelect.value = String(question)
  document.querySelectorAll('[data-mode]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.mode === mode))
  })
  if (mode === 'compare') {
    const comparison = document.createElement('div')
    comparison.className = 'review-compare'
    comparison.append(compareColumn(false), compareColumn(true))
    root.replaceChildren(comparison)
  } else {
    root.replaceChildren(fullPage(mode === 'after'))
  }
  requestAnimationFrame(drawLine)
}

document.querySelectorAll('[data-mode]').forEach(button => {
  button.addEventListener('click', () => {
    mode = button.dataset.mode
    render()
  })
})
questionSelect.addEventListener('change', () => setQuestion(Number(questionSelect.value)))
window.addEventListener('resize', drawLine)
window.addEventListener('scroll', drawLine, { passive: true })

try {
  const response = await fetch('./snapshots.json')
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  snapshots = await response.json()
  render()
  root.setAttribute('aria-busy', 'false')
  await document.fonts.ready
  drawLine()
} catch (error) {
  root.setAttribute('aria-busy', 'false')
  root.textContent = `原型载入失败：${error.message}。刷新页面后重试。`
}
