#!/usr/bin/env node
// verify-resource: browser-render
import { mkdirSync } from 'node:fs'
import { createServer as createNetServer } from 'node:net'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from '../app/node_modules/vite/dist/node/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const requireFromApp = createRequire(new URL('../app/package.json', import.meta.url))
const { chromium } = requireFromApp('playwright')
const shotDir = path.join(rootDir, '.scratch/sentence-analysis-494')
mkdirSync(shotDir, { recursive: true })

let passed = 0
let failed = 0
function check(name, condition, details = '') {
  if (condition) {
    passed += 1
    console.log(`PASS ${name}`)
  } else {
    failed += 1
    console.error(`FAIL ${name}${details ? `\n  ${details}` : ''}`)
  }
}

function fsUrl(file) {
  return `/@fs${file}`
}

function cardHarness() {
  const card = fsUrl(path.join(rootDir, 'app/src/features/paper-browse/selection/sentence-analysis/SentenceAnalysisCard.tsx'))
  const sample = fsUrl(path.join(rootDir, 'shared/sentence-analysis/fixtures/core-samples.mjs'))
  const compiler = fsUrl(path.join(rootDir, 'shared/sentence-analysis/compileFixture.mjs'))
  const derive = fsUrl(path.join(rootDir, 'shared/sentence-analysis/derive.mjs'))
  const overlayCss = fsUrl(path.join(rootDir, 'app/src/features/paper-browse/selection/selectionOverlay.css'))
  return `
import React from 'react'
import { createRoot } from 'react-dom/client'
import { SentenceAnalysisCard } from ${JSON.stringify(card)}
import { coreFixtures } from ${JSON.stringify(sample)}
import { compileFixture } from ${JSON.stringify(compiler)}
import { restoreLayout } from ${JSON.stringify(derive)}
import ${JSON.stringify(overlayCss)}

const escapeRef = { current: null }
const root = createRoot(document.getElementById('sa-root'))
let analysis = null
function render(status, sampleId = 'core-main', textSize = null) {
  analysis = compileFixture(coreFixtures.find((item) => item.id === sampleId), { id: sampleId })
  window.__announced = []
  root.render(React.createElement(SentenceAnalysisCard, {
    key: sampleId + ':' + status + ':' + textSize,
    status,
    textSize,
    analysis: status === 'loading' || status === 'rejected' || status === 'error' ? null : analysis,
    sentenceText: analysis.source.sentenceText,
    expanded: false,
    rejectReason: 'cross-sentence',
    errorMessage: '分析失败：模拟数据加载出错。点重试再试一次',
    onRetry() {},
    onClose() { window.__closed = true },
    onAnnounce(message) { window.__announced.push(message) },
    bindEscapeRef: escapeRef,
  }))
}
window.__saCard = {
  render,
  escape() { return Boolean(escapeRef.current && escapeRef.current()) },
  // The words the restore should show, in order, as the card prints them.
  expected(restoreId) {
    const items = restoreLayout(analysis, restoreId)
    return items.map((item) => {
      let text = item.kind === 'insert' ? item.text : analysis.tokens[item.index].text
      if (item.kind === 'token' && item.lowercase) text = text[0].toLowerCase() + text.slice(1)
      if (item.capitalize) text = text[0].toUpperCase() + text.slice(1)
      return text
    })
  },
}
render('ok')
`
}

const passage = 'Reading every day improves fluency. She enjoys reading novels. Tomorrow never hurries.'
function hookHarness() {
  const hook = fsUrl(path.join(rootDir, 'app/src/features/paper-browse/selection/usePaperSelectionTranslation.tsx'))
  return `
import React, { useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { usePaperSelectionTranslation } from ${JSON.stringify(hook)}

const originalFetch = window.fetch
window.fetch = (url, init) => {
  const target = String(url)
  if (target === '/api/paper-translation/status') {
    return Promise.resolve(new Response(JSON.stringify({
      enabled: false, keyAvailable: false, canRequestNew: false, reason: 'disabled',
      promptVersion: 'selection-prompt-v3', contextPolicy: 'adjacent-v1',
      sourceProjectionVersion: 'paper-selection-source-v2', limits: {},
    }), { status: 200 }))
  }
  if (target === '/api/paper-dictionary/status') {
    return Promise.resolve(new Response(JSON.stringify({
      available: true, dictionaryVersion: 'fixture', sensePick: { enabled: false },
    }), { status: 200 }))
  }
  if (target === '/api/vocabulary-notebook/selection-state') {
    return Promise.resolve(new Response(JSON.stringify({state: 'not-added', contextId: null, entryId: null}), {status: 200}))
  }
  if (target.startsWith('/api/paper-dictionary/')) {
    return new Promise(() => {})
  }
  return originalFetch(url, init)
}
const source = {
  paperId: 'fixture-paper',
  sourceRevision: 'fixture-revision',
  streams: [{
    streamId: 'g/body',
    text: ${JSON.stringify(passage)},
    role: 'passage-body',
    groupId: 'g',
    leaves: [{ kind: 'paragraph', id: 'p1', start: 0, end: ${passage.length} }],
  }],
}
function Fixture() {
  const hostRef = useRef(null)
  const selection = usePaperSelectionTranslation({
    paperId: 'fixture-paper',
    consumption: {
      disposition: 'ready',
      paperId: 'fixture-paper',
      publicationDigest: 'fixture-revision',
      selections: [{ familyContractId: 'reading', groupIds: ['g'], mode: 'canonical' }],
      selectionSource: source,
    },
    hostRef,
  })
  return React.createElement(React.Fragment, null,
    React.createElement('div', { ref: hostRef, id: 'sa-host' },
      React.createElement('p', { id: 'sa-p1', 'data-paper-paragraph-id': 'p1' }, ${JSON.stringify(passage)})),
    React.createElement('button', { id: 'sa-outside', type: 'button' }, 'Outside'),
    selection.overlay)
}
createRoot(document.getElementById('sa-hook-root')).render(React.createElement(Fixture))
window.__saSelect = (start, end) => {
  const node = document.getElementById('sa-p1').firstChild
  const selection = window.getSelection()
  selection.removeAllRanges()
  selection.setBaseAndExtent(node, start, node, end)
}
`
}

function plugin() {
  return {
    name: 'sentence-analysis-harness',
    enforce: 'pre',
    resolveId(id, importer) {
      if (id === '/__sa-card.js') return '\0sa-card'
      if (id === '/__sa-hook.js') return '\0sa-hook'
      if (id.endsWith('/sourceProjection.mjs') && importer?.endsWith('/selection/usePaperSelectionTranslation.tsx')) {
        return '\0sa-source'
      }
    },
    load(id) {
      if (id === '\0sa-card') return cardHarness()
      if (id === '\0sa-hook') return hookHarness()
      if (id === '\0sa-source') {
        return `export function buildSelectionSourceFromConsumption(consumption) {
          if (!consumption?.selectionSource) throw new Error('missing selection source')
          return consumption.selectionSource
        }`
      }
    },
    configureServer(server) {
      const pages = {
        '/__sa-card': '<!doctype html><html><head><meta charset="utf-8"><link rel="icon" href="data:,"><style>body{margin:24px;background:#fff}</style></head><body><div id="sa-root"></div><script type="module" src="/__sa-card.js"></script></body></html>',
        '/__sa-hook': '<!doctype html><html><head><meta charset="utf-8"><link rel="icon" href="data:,"><style>body{margin:40px;font:16px/1.7 sans-serif}#sa-host{width:640px}</style></head><body><div id="sa-hook-root"></div><script type="module" src="/__sa-hook.js"></script></body></html>',
      }
      server.middlewares.use((request, response, next) => {
        const html = pages[request.url]
        if (!html) return next()
        void server.transformIndexHtml(request.url, html).then((transformed) => {
          response.setHeader('content-type', 'text/html; charset=utf-8')
          response.end(transformed)
        }, next)
      })
    },
  }
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createNetServer()
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(() => resolve(address.port))
    })
    server.on('error', reject)
  })
}

function oklabToRgb(l, a, b) {
  const l1 = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m1 = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s1 = (l - 0.0894841775 * a - 1.291485548 * b) ** 3
  const linear = [
    4.0767416621 * l1 - 3.3077115913 * m1 + 0.2309699292 * s1,
    -1.2684380046 * l1 + 2.6097574011 * m1 - 0.3413193965 * s1,
    -0.0041960863 * l1 - 0.7034186147 * m1 + 1.707614701 * s1,
  ]
  return linear.map((value) => {
    const clamped = Math.min(1, Math.max(0, value))
    return Math.round(255 * (clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055))
  })
}

function parseColor(color) {
  const oklab = color.match(/oklab\(\s*([-0-9.]+)\s+([-0-9.]+)\s+([-0-9.]+)(?:\s*\/\s*([0-9.]+))?\)/)
  if (oklab) return [...oklabToRgb(Number(oklab[1]), Number(oklab[2]), Number(oklab[3])), oklab[4] == null ? 1 : Number(oklab[4])]
  const modern = color.match(/color\(srgb\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)(?:\s*\/\s*([0-9.]+))?\)/)
  if (modern) {
    return [
      Math.round(Number(modern[1]) * 255),
      Math.round(Number(modern[2]) * 255),
      Math.round(Number(modern[3]) * 255),
      modern[4] == null ? 1 : Number(modern[4]),
    ]
  }
  const legacy = color.match(/rgba?\(([^)]+)\)/)
  if (!legacy) return null
  const parts = legacy[1].split(',').map((part) => Number.parseFloat(part.trim()))
  return [parts[0], parts[1], parts[2], parts[3] == null ? 1 : parts[3]]
}

function composite(foreground, background) {
  const alpha = foreground[3]
  return [0, 1, 2].map((index) => Math.round(foreground[index] * alpha + background[index] * (1 - alpha)))
}

function contrast(fg, bg) {
  const channel = (value) => {
    const scaled = value / 255
    return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4
  }
  const lum = (parts) => 0.2126 * channel(parts[0]) + 0.7152 * channel(parts[1]) + 0.0722 * channel(parts[2])
  const foreground = parseColor(fg)
  const background = parseColor(bg)
  if (!foreground || !background) return 0
  const paper = composite(background, [255, 255, 255, 1])
  const ink = composite(foreground, paper)
  const left = lum(ink)
  const right = lum(paper)
  const lighter = Math.max(left, right)
  const darker = Math.min(left, right)
  return (lighter + 0.05) / (darker + 0.05)
}

process.env.VITE_EQB_SENTENCE_ANALYSIS = 'fixture'
const vite = await createServer({
  root: path.join(rootDir, 'app'),
  logLevel: 'error',
  server: { host: '127.0.0.1', fs: { allow: [rootDir] } },
  appType: 'custom',
  plugins: [plugin()],
})
const port = await freePort()
await vite.listen(port)
const browser = await chromium.launch({ headless: true, channel: 'chromium' })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
const browserErrors = []
page.on('pageerror', (error) => { browserErrors.push(error.message); console.error('PAGE', error.message) })
page.on('response', response => { if (response.status() >= 400) console.error('HTTP', response.status(), response.url()) })
page.on('console', (message) => {
  if (message.type() === 'error') { browserErrors.push(message.text()); console.error('CONSOLE', message.text()) }
})
const base = `http://127.0.0.1:${port}`

try {
  await page.goto(`${base}/__sa-card`)
  await page.waitForSelector('.sa-sentence [data-sa-token]')
  const layoutOf = () => page.evaluate(() => {
    const card = document.querySelector('.paper-sentence-analysis')
    return {
      blocks: [...card.children].map((node) => node.className),
      detail: [...card.querySelector('.sa-detail-row').children].map((node) => node.className),
      panels: document.querySelectorAll('.sa-explanation, .sa-panel, .sa-measure, .sa-panel-skeleton').length,
    }
  })
  const shape = await layoutOf()
  check('the card shares one detail row between the explanation slot and the legend', shape.panels === 0 && shape.blocks.join('|') === 'sa-head|sa-analysis-scroll|sa-detail-row|sa-translation' && shape.detail.join('|') === 'sa-detail-slot|sa-legend', JSON.stringify(shape))
  check('the card has no structure summary line', await page.locator('.sa-summary').count() === 0)
  check('the card has no trunk-only or slash mode', await page.getByRole('button', { name: '只看主干' }).count() === 0 && await page.getByRole('button', { name: '断句' }).count() === 0)
  await page.waitForFunction(() => document.querySelectorAll('.sa-underline').length > 0)
  const quiet = await page.evaluate(() => ({
    focused: document.querySelectorAll('.sa-token[data-sa-state]').length,
    fills: document.querySelectorAll('.sa-underlay .sa-fill').length,
    pressed: document.querySelector('.sa-main-btn')?.getAttribute('aria-pressed'),
    bubble: document.querySelectorAll('.sa-bubble').length,
  }))
  check('the card opens quiet: no highlight, no bubble, 定位主句 unpressed', quiet.focused === 0 && quiet.fills === 0 && quiet.pressed === 'false' && quiet.bubble === 0, JSON.stringify(quiet))
  await page.locator('.sa-main-btn').click()
  await page.waitForFunction(() => document.querySelectorAll('.sa-underlay .sa-fill[data-state="focused"]').length > 0)
  const main = await page.evaluate(() => {
    const focused = [...document.querySelectorAll('.sa-token[data-sa-state="focused"]')]
    return {
      text: focused.map((node) => node.firstChild.textContent).join(' '),
      blocks: new Set(focused.map((node) => node.dataset.saBlock)).size,
      relations: document.querySelectorAll('[data-sa-relation]').length,
      fills: document.querySelectorAll('.sa-underlay .sa-fill[data-state="focused"]').length,
      bubble: document.querySelectorAll('.sa-bubble').length,
      legend: document.querySelectorAll('.sa-legend').length,
      pressed: document.querySelector('.sa-main-btn')?.getAttribute('aria-pressed'),
      hit: [...document.querySelectorAll('.sa-zh-hit')].map((node) => node.textContent),
      stepper: document.querySelectorAll('.sa-stepper, .sa-single-difficulty').length,
    }
  })
  check('定位主句 tints only the three trunk blocks', main.text === 'The committee has postponed the decision' && main.blocks === 3, JSON.stringify(main))
  check('the trunk blocks sit on rounded underlay fills', main.fills === 3, String(main.fills))
  check('main focus uses word strokes and highlights without relationship wires or a bubble', main.relations === 0 && main.bubble === 0, JSON.stringify(main))
  check('the card has a compact role legend', main.legend === 1, String(main.legend))
  check('定位主句 is pressed on the main clause', main.pressed === 'true', JSON.stringify(main))
  check('main focus highlights the trunk in the translation', main.hit.join('') === '委员会推迟了决定', JSON.stringify(main.hit))
  check('a sentence without reading obstacles shows no difficulty stepper', main.stepper === 0, String(main.stepper))
  const lines = await page.evaluate(() => {
    const kind = (name) => [...document.querySelectorAll(`.sa-relations .sa-underline[data-kind="${name}"]`)]
    return {
      subject: kind('subject').length,
      predicate: kind('predicate').length,
      object: kind('object').length,
      caps: getComputedStyle(kind('predicate')[0]).strokeLinecap,
      decorated: [...document.querySelectorAll('[data-sa-token]')].filter((node) => getComputedStyle(node).textDecorationLine !== 'none').length,
    }
  })
  check('subject, predicate and object are SVG strokes with round caps, never text decoration', lines.subject >= 2 && lines.subject % 2 === 0 && lines.predicate >= 1 && lines.object >= 1 && lines.caps === 'round' && lines.decorated === 0, JSON.stringify(lines))

  const decorations = () => page.evaluate(() => {
    const box = (node) => {
      const rect = node.getBoundingClientRect()
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }
    }
    const tokens = [...document.querySelectorAll('[data-sa-token]')].map((node) => ({ ...box(node), text: node.firstChild.textContent }))
    const visible = (node) => !node.hidden && node.dataset.yield === undefined && !node.closest('[hidden]') && getComputedStyle(node).visibility !== 'hidden'
    const labels = [...document.querySelectorAll('.sa-label')].filter(visible).map((node) => ({ ...box(node), text: node.textContent, token: box(node.closest('[data-sa-token]')) }))
    const flags = [...document.querySelectorAll('.sa-flag')].filter((node) => visible(node.closest('.sa-under') || node)).map((node) => ({ ...box(node), text: node.textContent, token: box(node.closest('[data-sa-token]')) }))
    return { tokens, labels, flags }
  })
  const overlap = (a, b) => a.left < b.right - 0.5 && a.right > b.left + 0.5 && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5
  const collisions = (shown) => {
    const clash = [...shown.labels, ...shown.flags].flatMap((a, index, all) => all.slice(index + 1).filter((b) => overlap(a, b)).map((b) => `${a.text}/${b.text}`))
    const onText = [...shown.labels, ...shown.flags].filter((item) => shown.tokens.some((token) => overlap(item, token))).map((item) => item.text)
    return { clash, onText }
  }
  const shown = await decorations()
  check('outlined labels sit above their words', shown.labels.length >= 3 && shown.labels.every((label) => label.bottom <= label.token.top + 1), JSON.stringify(shown.labels))
  const mainClash = collisions(shown)
  check('labels never sit on each other or on the words', mainClash.clash.length === 0 && mainClash.onText.length === 0, JSON.stringify(mainClash))
  await page.waitForTimeout(400)
  await page.locator('.paper-sentence-analysis').screenshot({ path: path.join(shotDir, 'card-main.png') })
  const font = await page.locator('.sa-sentence').evaluate((node) => {
    const style = getComputedStyle(node)
    return { size: style.fontSize, weight: style.fontWeight, lineHeight: Number.parseFloat(style.lineHeight) / Number.parseFloat(style.fontSize) }
  })
  check('without a paper size the sentence uses the 14px regular serif on roomy lines', font.size === '14px' && (font.weight === '400' || font.weight === 'normal') && font.lineHeight > 3, JSON.stringify(font))
  const fonts = await page.evaluate(() => new Set([...document.querySelectorAll('[data-sa-token]')].map((node) => getComputedStyle(node).fontWeight)).size)
  check('no token changes weight', fonts === 1)

  const metrics = () => page.evaluate(() => {
    const card = document.querySelector('.paper-sentence-analysis').getBoundingClientRect()
    const tokens = [...document.querySelectorAll('[data-sa-token]')].map((node) => {
      const rect = node.getBoundingClientRect()
      return { text: node.firstChild.textContent, left: rect.left, top: rect.top }
    })
    return { card: { left: card.left, top: card.top, height: card.height }, tokens }
  })
  const bubbleState = () => page.evaluate(() => {
    const bubble = document.querySelector('.sa-bubble[data-placed]')
    if (!bubble) return null
    const rect = bubble.getBoundingClientRect()
    const card = document.querySelector('.paper-sentence-analysis').getBoundingClientRect()
    const glyphs = [...document.querySelectorAll('[data-sa-token], [data-sa-inserted]')].flatMap((node) => [...node.getClientRects()])
      .map((item) => ({ left: item.left, right: item.right, top: (item.top + item.bottom) / 2 - 8, bottom: (item.top + item.bottom) / 2 + 8 }))
    const action = bubble.querySelector('.sa-bubble-docked .sa-bubble-action:not(.sa-layer-btn)')
    return {
      body: bubble.querySelector('.sa-bubble-body')?.textContent || '',
      text: bubble.textContent,
      height: rect.height,
      inDetailRow: Boolean(bubble.closest('.sa-detail-row')),
      inside: rect.left >= card.left - 0.5 && rect.right <= card.right + 0.5,
      covers: glyphs.filter((item) => rect.left < item.right && rect.right > item.left && rect.top < item.bottom && rect.bottom > item.top).length,
      action: action ? { text: action.textContent, pressed: action.getAttribute('aria-pressed') } : null,
      focus: document.querySelector('.sa-sentence')?.dataset.saFocus,
      count: document.querySelector('.sa-stepper-count')?.textContent,
    }
  })
  // Explanations have no title any more; the body text identifies them.
  const waitBubble = (text) => page.waitForFunction((expected) => {
    const bubble = document.querySelector('.sa-bubble[data-placed]')
    return bubble && (bubble.querySelector('.sa-bubble-body')?.textContent || '').includes(expected)
  }, text, { timeout: 3000 })
  const before = await metrics()

  await page.locator('[data-sa-label="c1"]').click()
  await page.waitForFunction(() => document.querySelector('.sa-sentence')?.dataset.saFocus === 'c1')
  await waitBubble('which 在从句中作主语')
  const focused = await page.evaluate(() => ({
    decision: [...document.querySelectorAll('[data-sa-token]')].find((node) => node.firstChild.textContent === 'decision')?.dataset.saState,
    hit: [...document.querySelectorAll('.sa-zh-hit')].map((node) => node.textContent).join(''),
    guides: [...document.querySelectorAll('.sa-guides')].map((node) => getComputedStyle(node).animationName),
    drawn: document.querySelectorAll('.sa-relations [pathLength]').length,
    current: [...document.querySelectorAll('.sa-label[data-current]')].map((node) => node.textContent),
    opacity: [...document.querySelectorAll('.sa-token, .sa-label:not([data-yield])')].map((node) => Number(getComputedStyle(node).opacity)),
  }))
  const clauseBubble = await bubbleState()
  check('clicking a clause label explains it in the detail row', clauseBubble && clauseBubble.inDetailRow && clauseBubble.body === 'which 在从句中作主语', JSON.stringify(clauseBubble))
  check('the explanation never covers the words and stays inside the card', clauseBubble && clauseBubble.covers === 0 && clauseBubble.inside, JSON.stringify(clauseBubble))
  check('the clause is focused, its head is related and its label is current', focused.decision === 'related' && focused.current.join() === '定语从句', JSON.stringify(focused))
  check('the translation highlights the clause', focused.hit === '原定于上周做出的', focused.hit)
  check('new guide lines fade in instead of being drawn', focused.guides.length > 0 && focused.guides.every((name) => name === 'sa-fade') && focused.drawn === 0, JSON.stringify(focused))
  check('unfocused text is never faded', focused.opacity.every((value) => value === 1), JSON.stringify(focused.opacity.filter((value) => value !== 1).slice(0, 3)))
  check('the explanation is announced politely', (await page.evaluate(() => window.__announced.at(-1))) === '定语从句：which 在从句中作主语', await page.evaluate(() => window.__announced.at(-1)))
  await page.mouse.move(0, 0)
  await page.waitForTimeout(400)
  await page.locator('.paper-sentence-analysis').screenshot({ path: path.join(shotDir, 'card-focus.png') })

  const guides = await page.evaluate(() => {
    const tokens = [...document.querySelectorAll('[data-sa-token]')].map((node) => node.getBoundingClientRect())
    const paths = [...document.querySelectorAll('[data-sa-relation] .sa-guide:not(.sa-arrow)')]
    let hits = 0
    for (const path of paths) {
      if (!path.getTotalLength) continue
      const length = path.getTotalLength()
      const start = path.getPointAtLength(0)
      const end = path.getPointAtLength(length)
      const matrix = path.getScreenCTM()
      if (!matrix) continue
      for (let distance = 0; distance <= length; distance += 4) {
        const point = path.getPointAtLength(distance)
        const nearEnd = Math.hypot(point.x - start.x, point.y - start.y) < 4 || Math.hypot(point.x - end.x, point.y - end.y) < 4
        if (nearEnd) continue
        const screen = new DOMPoint(point.x, point.y).matrixTransform(matrix)
        if (tokens.some((rect) => screen.x >= rect.left && screen.x <= rect.right && screen.y >= rect.top && screen.y <= rect.bottom)) hits += 1
      }
    }
    return { paths: paths.length, hits }
  })
  check('guide lines do not cut through words', guides.paths > 0 && guides.hits === 0, JSON.stringify(guides))

  await page.locator('[data-sa-token]').filter({ hasText: /^which/ }).click()
  await waitBubble('which 引导定语从句')
  check('clicking a word inside the selected clause enters it and selects that word', await page.locator('.sa-sentence').getAttribute('data-sa-focus') === 'which' && (await page.locator('.sa-reading-nav').textContent()).includes('原句 › 定语从句'))
  await page.locator('[data-sa-token]').filter({ hasText: /^which/ }).click()
  check('clicking the selected word again returns to the entered clause', await page.locator('.sa-sentence').getAttribute('data-sa-focus') === 'main' && await page.locator('.sa-reading-nav').count() === 1)
  for (let index = 0; index < 3 && await page.locator('.sa-reading-nav').count() > 0; index += 1) await page.evaluate(() => window.__saCard.escape())
  check('escape leaves the entered clause for the whole sentence', await page.locator('.sa-reading-nav').count() === 0)
  await page.getByRole('button', { name: 'which：定语从句', exact: true }).click()
  await waitBubble('which 在从句中作主语')
  check('the connector marker selects the clause and keeps its explanation', await page.getByRole('button', { name: 'which：定语从句', exact: true }).getAttribute('aria-pressed') === 'true')
  check('connector words never carry a second role underline', await page.locator('[data-sa-connector][data-sa-line]').count() === 0)
  await page.locator('[data-sa-token]').filter({ hasText: /^proposal$/ }).click()
  await page.getByRole('button', { name: 'if：条件状从', exact: true }).click()
  await waitBubble('省略了上文已有或能推知的词')
  const after = await metrics()
  const shifted = before.tokens.find((token, index) => !after.tokens[index] || Math.abs(token.left - after.tokens[index].left) > 0.5 || Math.abs(token.top - after.tokens[index].top) > 0.5)
  check('explanations and focus changes do not move the sentence or the card', !shifted && before.card.left === after.card.left && before.card.top === after.card.top && before.card.height === after.card.height, JSON.stringify({ card: [before.card, after.card], shifted }))
  check('focus changes keep the sentence size', await page.locator('.sa-sentence').evaluate((node) => getComputedStyle(node).fontSize) === '14px')

  await page.locator('.sa-sentence').focus()
  await page.keyboard.press('ArrowUp')
  check('arrow up from the condition clause returns toward its parent', await page.locator('.sa-sentence').getAttribute('data-sa-focus') === 'c2')
  const handledEscape = await page.evaluate(() => window.__saCard.escape())
  await page.waitForFunction(() => document.querySelector('.sa-sentence')?.dataset.saFocus === 'main')
  check('escape from a unit returns to the main clause and closes the explanation', handledEscape === true && await page.locator('.sa-bubble').count() === 0)

  for (const [label, kind, dash] of [['状语', 'adverbial', '4 4'], ['定语', 'attributive', '0.1 4']]) {
    await page.getByRole('button', { name: `查看${label}`, exact: true }).click()
    await page.waitForFunction(expected => {
      const active = [...document.querySelectorAll('.sa-underline[data-active]')]
      return active.length > 0 && active.every(node => node.dataset.kind === expected)
    }, kind)
    const roleLines = await page.locator(`.sa-underline[data-active][data-kind="${kind}"]`).count()
    check(`the ${label} legend highlights its category using the matching stroke`, roleLines > 0 && await page.locator(`.sa-underline[data-active][data-kind="${kind}"]`).first().getAttribute('stroke-dasharray') === dash && await page.locator('.sa-token[data-sa-state="focused"]').count() > 0)
    check(`the ${label} filter leaves connectors with only their markers`, await page.locator('[data-sa-connector][data-sa-line]').count() === 0)
  }
  await page.getByRole('button', { name: '查看定语', exact: true }).click()
  check('clicking a selected legend resets the role filter', await page.locator('.sa-legend-item[aria-pressed="true"]').count() === 0)
  await page.getByRole('button', { name: '查看主语和谓语', exact: true }).click()
  await page.waitForFunction(() => {
    const lines = [...document.querySelectorAll('.sa-underline[data-active]')]
    return lines.length > 0 && lines.every(node => ['subject', 'predicate'].includes(node.dataset.kind))
  })
  check('the subject-predicate legend selects both roles together without an arc',
    await page.locator('[data-sa-line="subject"]').count() > 0
    && await page.locator('[data-sa-line="predicate"]').count() > 0
    && await page.getByRole('button', { name: '查看主语和谓语', exact: true }).getAttribute('aria-pressed') === 'true'
    && await page.locator('[data-sa-relation], .sa-legend-link').count() === 0)
  await page.getByRole('button', { name: 'which：定语从句', exact: true }).click()
  check('a clause selection clears the previous legend filter', await page.locator('.sa-legend-item[aria-pressed="true"]').count() === 0)
  await page.getByRole('button', { name: '定位主句', exact: true }).click()

  const reading = () => page.evaluate(() => [...document.querySelectorAll('[data-sa-token], [data-sa-inserted]')]
    .filter((node) => !node.closest('[data-sa-decoration]'))
    .map((node) => node.firstChild.textContent))
  const expected = await page.evaluate(() => window.__saCard.expected('s1'))
  const original = await reading()
  await page.locator('[data-sa-label="c3"]').click()
  await waitBubble('省略了上文已有或能推知的词')
  const ellipsis = await bubbleState()
  check('the elliptical clause offers its restore on demand', ellipsis.action?.text === '补全省略' && ellipsis.action.pressed === 'false', JSON.stringify(ellipsis))
  await page.locator('.sa-bubble-docked .sa-bubble-action:not(.sa-layer-btn)').click()
  await page.waitForSelector('.sa-inserted')
  await page.waitForFunction(() => document.querySelector('.sa-bubble[data-placed]'), null, { timeout: 3000 })
  const restored = await reading()
  const restoredBubble = await bubbleState()
  check('补全省略 fills the omitted words in place, in the restore order', restored.join(' ') === expected.join(' ') && restored.join(' ').includes('if the proposal is implemented'), JSON.stringify({ restored, expected }))
  const insertedWash = await page.locator('.sa-inserted').first().evaluate((node) => getComputedStyle(node).backgroundColor)
  check('the added words sit on a wash and the button now says 看原句', !['rgba(0, 0, 0, 0)', 'transparent'].includes(insertedWash) && restoredBubble.action?.text === '看原句' && restoredBubble.action.pressed === 'true', JSON.stringify({ insertedWash, restoredBubble }))
  check('the restored explanation still clears the words', restoredBubble.covers === 0, JSON.stringify(restoredBubble))
  check('the restore is announced', (await page.evaluate(() => window.__announced.at(-1))).startsWith('已还原'), await page.evaluate(() => window.__announced.at(-1)))
  await page.waitForTimeout(300)
  await page.locator('.paper-sentence-analysis').screenshot({ path: path.join(shotDir, 'card-restored.png') })
  await page.locator('.sa-bubble-docked .sa-bubble-action:not(.sa-layer-btn)').click()
  await page.waitForFunction(() => document.querySelectorAll('.sa-inserted').length === 0)
  check('看原句 returns to the original sentence', (await reading()).join(' ') === original.join(' '))
  await page.locator('.sa-bubble-docked .sa-bubble-action:not(.sa-layer-btn)').click()
  await page.waitForSelector('.sa-inserted')
  await page.evaluate(() => window.__saCard.escape())
  await page.waitForFunction(() => document.querySelectorAll('.sa-inserted').length === 0 && document.querySelectorAll('.sa-bubble').length === 0)
  check('escape closes the explanation and leaves the restore', (await reading()).join(' ') === original.join(' '))

  await page.locator('.sa-sentence').focus()
  await page.keyboard.press('Tab')
  const tabbed = await page.evaluate(() => document.activeElement?.className || '')
  check('Tab reaches a visible label or connector marker', /sa-(label|flag|ink-connector)/.test(tabbed), tabbed)
  await page.locator('[data-sa-label="c3"]').focus()
  await page.keyboard.press('Enter')
  await waitBubble('省略了上文已有或能推知的词')
  let reached = false
  for (let index = 0; index < 16 && !reached; index += 1) {
    await page.keyboard.press('Tab')
    reached = await page.evaluate(() => document.activeElement?.matches('.sa-bubble-docked .sa-bubble-action:not(.sa-layer-btn)'))
  }
  check('Tab reaches the explanation button', reached)
  await page.keyboard.press('Enter')
  await page.waitForSelector('.sa-inserted')
  check('Enter on the explanation button restores', await page.locator('.sa-bubble-docked .sa-bubble-action:not(.sa-layer-btn)').getAttribute('aria-pressed') === 'true')
  await page.evaluate(() => window.__saCard.escape())

  await page.locator('.sa-head button[aria-label="复制"]').click()
  const clip = await page.evaluate(() => navigator.clipboard.readText())
  check('复制 includes the sentence, translation, each difficulty rule and restore', clip.includes('The committee has postponed') && clip.includes('委员会推迟了') && clip.includes('省略：省略了上文已有或能推知的词') && clip.includes('补全省略：if the proposal is implemented hastily'), clip)

  const copied = await page.evaluate(() => {
    const sentence = document.querySelector('.sa-sentence')
    const range = document.createRange()
    range.selectNodeContents(sentence)
    const selection = window.getSelection()
    selection.removeAllRanges()
    selection.addRange(range)
    let text = ''
    document.addEventListener('copy', (event) => {
      text = event.clipboardData.getData('text/plain')
    })
    document.execCommand('copy')
    return text
  })
  check('copying the sentence omits labels and brackets', copied.includes('The committee has postponed') && !copied.includes('定语从句') && !copied.includes('条件状从') && !copied.includes('['), copied)

  await page.evaluate(() => window.getSelection().removeAllRanges())
  await page.locator('[data-sa-label="c1"]').click()
  await page.locator('.sa-main-btn').click()
  check('定位主句 returns to the main clause', await page.locator('.sa-sentence').getAttribute('data-sa-focus') === 'main' && await page.locator('.sa-bubble').count() === 0)
  await page.locator('.sa-main-btn').click()
  const located = await page.evaluate(() => ({
    background: getComputedStyle(document.querySelector('.sa-main-btn')).backgroundColor,
    pulse: [...document.querySelectorAll('.sa-guides[data-locate] .sa-fill[data-state="focused"]')].map((node) => getComputedStyle(node).animationName),
  }))
  check('定位主句 shows pressed and pulses the trunk when already on the main clause', located.background !== 'rgba(0, 0, 0, 0)' && located.pulse.length === 3 && located.pulse.every((name) => name === 'sa-locate'), JSON.stringify(located))

  await page.locator('[data-sa-label="c1"]').click()
  await waitBubble('which 在从句中作主语')
  const ratios = await page.evaluate(() => {
    const paint = (node) => {
      const style = getComputedStyle(node)
      let background = style.backgroundColor
      let current = node
      while ((!background || background === 'rgba(0, 0, 0, 0)' || background === 'transparent') && current.parentElement) {
        current = current.parentElement
        background = getComputedStyle(current).backgroundColor
      }
      return { color: style.color, background, size: style.fontSize }
    }
    return {
      label: paint(document.querySelector('.sa-label:not([data-current])')),
      current: paint(document.querySelector('.sa-label[data-current]')),
      body: paint(document.querySelector('.sa-bubble-body')),
    }
  })
  check('12px label text clears 4.5:1', ratios.label.size === '12px' && contrast(ratios.label.color, ratios.label.background) >= 4.5, JSON.stringify(ratios.label))
  check('the filled current label clears 4.5:1', contrast(ratios.current.color, ratios.current.background) >= 4.5, JSON.stringify(ratios.current))
  check('explanation text clears 4.5:1', contrast(ratios.body.color, ratios.body.background) >= 4.5, JSON.stringify(ratios.body))

  const bars = await page.evaluate(() => [...document.querySelectorAll('.paper-sentence-analysis *')].filter((node) => {
    const style = getComputedStyle(node)
    const wide = Number.parseFloat(style.borderLeftWidth) > 1 || Number.parseFloat(style.borderRightWidth) > 1
    const colored = style.borderLeftColor !== 'rgba(0, 0, 0, 0)' || style.borderRightColor !== 'rgba(0, 0, 0, 0)'
    return wide && colored
  }).length)
  check('the card has no colored side bar', bars === 0)

  await page.evaluate(() => window.__saCard.render('ok', 'core-main', 17))
  await page.waitForSelector('.sa-sentence [data-sa-token]')
  check('the sentence follows the paper text size it was picked from', await page.locator('.sa-sentence').evaluate((node) => getComputedStyle(node).fontSize) === '17px')

  await page.evaluate(() => window.__saCard.render('ok', 'object-complement'))
  await page.getByRole('button', { name: '查看补语', exact: true }).click()
  await page.waitForSelector('.sa-underline[data-kind="complement"]')
  check('complements use the support stroke on their own words', await page.locator('[data-sa-line="complement"]').count() === 4)
  const complementBefore = await metrics()
  await page.getByRole('button', { name: '宾语补足语', exact: true }).click()
  await waitBubble('')
  const complementBubble = await bubbleState()
  check('the nonfinite complement offers its logical subject as an action', complementBubble.action?.text === '逻辑主语：him', JSON.stringify(complementBubble))
  check('the logical subject is announced to a screen reader', (await page.evaluate(() => window.__announced.at(-1))).includes('逻辑主语是 him'), await page.evaluate(() => window.__announced.at(-1)))
  await page.locator('.sa-bubble-docked .sa-bubble-action:not(.sa-layer-btn)').click()
  await page.waitForFunction(() => [...document.querySelectorAll('[data-sa-token]')].some((node) => node.firstChild.textContent === 'him' && node.dataset.saState === 'subject'))
  const complementAfter = await metrics()
  check('the logical-subject action lights him in place', await page.locator('.sa-bubble-docked .sa-bubble-action:not(.sa-layer-btn)').getAttribute('aria-pressed') === 'true')
  check('opening the logical subject leaves word positions unchanged', complementBefore.tokens.every((token, index) => token.top === complementAfter.tokens[index].top && token.left === complementAfter.tokens[index].left))
  await page.evaluate(() => {
    const range = document.createRange()
    range.selectNodeContents(document.querySelector('.sa-sentence'))
    const selection = window.getSelection()
    selection.removeAllRanges()
    selection.addRange(range)
  })
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+c' : 'Control+c')
  const copiedAnnotated = await page.evaluate(() => navigator.clipboard.readText())
  check('copying the whole annotated sentence omits SVG text and labels', copiedAnnotated.trim() === 'We heard him singing in the hall.', copiedAnnotated)
  await page.evaluate(() => window.getSelection().removeAllRanges())

  await page.evaluate(() => window.__saCard.render('ok', 'split-predicate'))
  await page.waitForSelector('.sa-flag')
  const flagged = await decorations()
  check('solid difficulty labels sit below their words', flagged.flags.map((flag) => flag.text).join(' ') === '部分倒装 拆分' && flagged.flags.every((flag) => flag.top >= flag.token.bottom - 1), JSON.stringify(flagged.flags))
  const flagClash = collisions(flagged)
  check('difficulty labels never sit on other labels or words', flagClash.clash.length === 0 && flagClash.onText.length === 0, JSON.stringify(flagClash))
  check('the stepper starts with no difficulty open', await page.locator('.sa-stepper-count').textContent() === '–/2')
  await page.locator('.sa-stepper button[aria-label="下一个难点"]').click()
  await waitBubble('只把助动词提到主语前')
  const first = await bubbleState()
  check('the stepper opens the first difficulty in reading order with its restore', first.count === '1/2' && first.action?.text === '还原' && first.action.pressed === 'false', JSON.stringify(first))
  check('a difficulty explanation clears the words', first.covers === 0 && first.inside, JSON.stringify(first))
  await page.locator('.sa-stepper button[aria-label="下一个难点"]').click()
  await waitBubble('谓语被隔开')
  check('the stepper moves to the next difficulty', (await bubbleState()).count === '2/2')
  await page.locator('.sa-stepper button[aria-label="上一个难点"]').click()
  await waitBubble('只把助动词提到主语前')
  await page.locator('.sa-stepper button[aria-label="上一个难点"]').click()
  await waitBubble('谓语被隔开')
  check('the stepper wraps around to the last difficulty', (await bubbleState()).count === '2/2')
  await page.evaluate(() => window.__saCard.escape())
  await page.locator('.sa-flag', { hasText: '部分倒装' }).click()
  await waitBubble('只把助动词提到主语前')
  check('clicking a difficulty label opens its explanation', (await bubbleState()).count === '1/2')
  await page.locator('.paper-sentence-analysis').screenshot({ path: path.join(shotDir, 'card-difficulty.png') })
  const flagInk = await page.evaluate(() => {
    const node = document.querySelector('.sa-flag')
    const style = getComputedStyle(node)
    let background = style.backgroundColor
    let current = node
    while ((!background || background === 'rgba(0, 0, 0, 0)') && current.parentElement) {
      current = current.parentElement
      background = getComputedStyle(current).backgroundColor
    }
    return { color: style.color, background }
  })
  check('difficulty label text clears 4.5:1', contrast(flagInk.color, flagInk.background) >= 4.5, JSON.stringify(flagInk))
  const splitExpected = await page.evaluate(() => window.__saCard.expected('s1'))
  await page.locator('.sa-bubble-docked .sa-bubble-action:not(.sa-layer-btn)').click()
  const moving = await page.waitForFunction(() => document.querySelector('.sa-sentence[data-sa-moving]'), null, { timeout: 1500 }).then(() => true, () => false)
  await page.waitForFunction(() => !document.querySelector('.sa-sentence[data-sa-moving]') && document.querySelector('.sa-bubble[data-placed]'), null, { timeout: 3000 })
  const splitRestored = await reading()
  check('还原 glides the kept words into the normal order', moving && splitRestored.join(' ') === splitExpected.join(' ') && splitRestored[0] === 'She', JSON.stringify({ splitRestored, splitExpected, moving }))
  await page.waitForFunction(() => document.querySelectorAll('.sa-underline[data-kind="predicate"]').length > 0)
  const splitLines = await page.evaluate(() => {
    const words = [...document.querySelectorAll('[data-sa-token]')].map((node) => node.getBoundingClientRect())
    const underlines = [...document.querySelectorAll('.sa-underline')].map((node) => node.getBBox())
    const width = Math.max(...words.map((rect) => rect.right)) - Math.min(...words.map((rect) => rect.left))
    return { count: underlines.length, widest: Math.max(...underlines.map((box) => box.width)), width }
  })
  check('underlines are redrawn on the new order, never spanning the moved words', splitLines.count > 0 && splitLines.widest < splitLines.width * 0.6, JSON.stringify(splitLines))
  await page.locator('.paper-sentence-analysis').screenshot({ path: path.join(shotDir, 'card-split-restored.png') })

  await page.evaluate(() => window.__saCard.render('ok', 'cleft'))
  await page.waitForSelector('.sa-flag')
  const cleft = await page.evaluate(() => {
    const color = (text) => getComputedStyle([...document.querySelectorAll('[data-sa-token]')].find((node) => node.firstChild.textContent === text)).color
    return { it: color('It'), that: color('that'), she: color('she'), frame: document.querySelectorAll('[data-sa-frame]').length }
  })
  check('the cleft frame reads fainter than the rest of the sentence', cleft.frame === 3 && cleft.it !== cleft.she && cleft.that === cleft.it, JSON.stringify(cleft))
  check('a single difficulty gets one direct button instead of a stepper', await page.locator('.sa-single-difficulty').getAttribute('aria-label') === '查看难点：强调句' && await page.locator('.sa-stepper').count() === 0)
  await page.locator('.sa-flag', { hasText: '强调句' }).click()
  await waitBubble('去掉 It is/was')
  await page.locator('.sa-bubble-docked .sa-bubble-action:not(.sa-layer-btn)').click()
  await page.waitForFunction(() => document.querySelectorAll('[data-sa-frame]').length === 0 && document.querySelector('.sa-bubble[data-placed]'), null, { timeout: 3000 })
  check('还原 of a cleft takes the frame away', (await reading()).join(' ') === 'She moved to London in 1998 .', JSON.stringify(await reading()))

  await page.evaluate(() => window.__saCard.render('ok'))
  await page.waitForSelector('.sa-sentence [data-sa-token]')
  await page.screenshot({ path: path.join(shotDir, 'main-1280.png') })
  await page.setViewportSize({ width: 420, height: 800 })
  await page.waitForTimeout(200)
  const narrow = collisions(await decorations())
  check('labels do not collide on a narrow card', narrow.clash.length === 0, JSON.stringify(narrow.clash))
  await page.screenshot({ path: path.join(shotDir, 'main-420.png') })
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%' })
  check('a 200% root font does not resize the sentence', await page.locator('.sa-sentence').evaluate((node) => getComputedStyle(node).fontSize) === '14px')
  await page.screenshot({ path: path.join(shotDir, 'main-200.png') })
  await page.evaluate(() => { document.documentElement.style.fontSize = '' })

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.locator('[data-sa-label="c1"]').click()
  await waitBubble('which 在从句中作主语')
  const motion = await page.evaluate(() => [...document.querySelectorAll('.sa-relations, .sa-guides, .sa-label, .sa-bubble')].map((node) => getComputedStyle(node).animationName))
  check('reduced motion removes the arrival and guide fades', motion.length > 0 && motion.every((name) => name === 'none'), JSON.stringify(motion.slice(0, 4)))
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.evaluate(() => window.__saCard.render('ok', 'split-predicate'))
  await page.waitForSelector('.sa-flag')
  await page.locator('.sa-flag', { hasText: '部分倒装' }).click()
  await waitBubble('只把助动词提到主语前')
  await page.locator('.sa-bubble-docked .sa-bubble-action:not(.sa-layer-btn)').click()
  const instant = await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve({
    first: document.querySelector('[data-sa-token]')?.firstChild.textContent,
    moving: document.querySelectorAll('.sa-sentence[data-sa-moving]').length,
  }))))
  check('reduced motion restores at once, without gliding words', instant.first === 'She' && instant.moving === 0, JSON.stringify(instant))
  await page.emulateMedia({ reducedMotion: 'no-preference' })

  await page.goto(`${base}/__sa-hook`)
  await page.waitForSelector('#sa-p1')
  const firstEnd = passage.indexOf('.') + 1
  const secondStart = passage.indexOf('She')
  const secondEnd = passage.indexOf('novels.') + 'novels.'.length
  const thirdStart = passage.indexOf('Tomorrow')
  await page.evaluate(({ start, end }) => window.__saSelect(start, end), { start: 0, end: firstEnd })
  await page.waitForSelector('.paper-selection-analyze')
  const analyzeText = (await page.locator('.paper-selection-analyze').innerText()).trim()
  const translateCount = await page.locator('.paper-selection-translate').count()
  check('a non-word selection offers 分析此句 without a translate button', analyzeText === '分析此句' && translateCount === 0, JSON.stringify({ analyzeText, translateCount }))
  await page.locator('.paper-selection-analyze').click()
  await page.waitForSelector('[data-sa-status="loading"]')
  await page.evaluate(({ start, end }) => window.__saSelect(start, end), { start: secondStart, end: secondEnd })
  await page.waitForSelector('.paper-selection-analyze')
  await page.locator('.paper-selection-analyze').click()
  const plainSentence = () => page.evaluate(() => {
    const node = document.querySelector('.sa-sentence')?.cloneNode(true)
    if (!node) return ''
    node.querySelectorAll('[data-sa-decoration], svg').forEach((item) => item.remove())
    return node.textContent
  })
  await page.waitForFunction(() => {
    const node = document.querySelector('.sa-sentence')?.cloneNode(true)
    node?.querySelectorAll('[data-sa-decoration]').forEach((item) => item.remove())
    return node && node.textContent.includes('She enjoys reading novels.')
  }, null, { timeout: 4000 })
  await page.waitForTimeout(900)
  const late = await plainSentence()
  check('a late analysis for the previous sentence does not replace the current one', late.includes('She enjoys reading novels.') && !late.includes('Reading every day'))

  await page.locator('.sa-sentence').focus()
  await page.locator('[data-sa-token]').first().click()
  await page.keyboard.press('Escape')
  check('escape returns from a unit to the sentence card', await page.locator('.paper-sentence-analysis').count() === 1)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(40)
  check('a second escape closes the card', await page.locator('.paper-selection-overlay').count() === 0)

  await page.evaluate(({ start, end }) => window.__saSelect(start, end), { start: thirdStart, end: passage.length })
  await page.locator('.paper-selection-analyze').click()
  await page.waitForSelector('[data-sa-status="unavailable"]', { timeout: 4000 })
  check('a sentence without a fixture says the demo data is missing', (await page.locator('.sa-status').innerText()).includes('该句暂无分析数据'))

  const wordStart = passage.indexOf('Reading')
  await page.evaluate(({ start, end }) => window.__saSelect(start, end), { start: wordStart, end: wordStart + 'Reading'.length })
  await page.waitForSelector('.paper-selection-lookup')
  await page.locator('.paper-selection-lookup').click()
  await page.waitForSelector('.paper-dictionary-analyze')
  check('the word card offers 分析所在句', (await page.locator('.paper-dictionary-analyze').innerText()).includes('分析所在句'))
  await page.locator('.paper-dictionary-analyze').click()
  await page.waitForFunction(() => document.querySelector('.sa-sentence')?.textContent?.includes('Reading every day improves fluency.'), null, { timeout: 4000 })
  check('分析所在句 opens the whole sentence around the word', true)
  const clickBoundary = await page.evaluate(() => ({
    overlay: document.querySelector('.paper-selection-overlay').getBoundingClientRect().width,
    card: document.querySelector('.paper-sentence-analysis').getBoundingClientRect().width,
  }))
  check('the visible card and outside-click boundary have the same width', Math.abs(clickBoundary.overlay - clickBoundary.card) < 1, JSON.stringify(clickBoundary))
  check('the card and selection flow produce no browser errors', browserErrors.length === 0, browserErrors.join(' | '))
} finally {
  await browser.close()
  await vite.close()
}

if (failed > 0) {
  console.error(`FAILED ${failed}  passed ${passed}`)
  process.exit(1)
}
console.log(`OK ${passed}`)
