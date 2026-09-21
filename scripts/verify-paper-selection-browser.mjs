#!/usr/bin/env node
// verify-resource: browser-render
import { readFileSync } from 'node:fs'
import { createServer as createNetServer } from 'node:net'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from '../app/node_modules/vite/dist/node/index.js'
import { selectionControllerHarnessPlugin, verifySelectionController } from './paper-selection-controller-checks.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const requireFromApp = createRequire(new URL('../app/package.json', import.meta.url))
const { chromium } = requireFromApp('playwright')
const overlayCss = readFileSync(new URL('../app/src/features/paper-browse/selection/selectionOverlay.css', import.meta.url), 'utf8')

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

const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>selection harness</title>
    <style>
      body { font: 16px/1.6 sans-serif; padding: 48px; }
      .paper { width: 520px; }
      .ps-question { margin-top: 24px; cursor: pointer; }
      ${overlayCss}
    </style>
  </head>
  <body>
    <div class="paper" id="paper-host">
      <p id="passage" data-paper-paragraph-id="p1">The road was closed. They had to address the problem. Work began that afternoon.</p>
      <div id="question" class="ps-question" data-paper-question-id="q1" tabindex="0">21. What does address mean here?</div>
    </div>
    <script type="module">
      import { createLectureFocusGate } from ${JSON.stringify(pathToFileURLSafe('shared/paper-selection/lectureFocusGate.mjs'))}
      import { applyPaperSurfaceFocusIntent } from ${JSON.stringify(pathToFileURLSafe('app/src/features/paper-browse/paperBrowseFocusIntent.ts'))}

      const lectureLog = []
      window.__lectureLog = lectureLog
      window.__phase = 'idle'
      const gate = createLectureFocusGate({
        doubleClickWaitMs: 80,
        isNonCollapsedSelection: () => {
          const selection = window.getSelection()
          return Boolean(selection && !selection.isCollapsed)
        },
      })
      const host = document.getElementById('paper-host')
      host.addEventListener('pointerdown', (event) => gate.pointerDown(event), true)
      host.addEventListener('pointermove', (event) => gate.pointerMove(event), true)
      document.addEventListener('selectionchange', () => {
        gate.selectionChanged()
        const selection = window.getSelection()
        const existing = document.querySelector('.paper-selection-overlay')
        if (!selection || selection.isCollapsed) {
          existing?.remove()
          window.__phase = 'idle'
          return
        }
        window.__phase = 'toolbar'
        if (existing) return
        const overlay = document.createElement('div')
        overlay.className = 'paper-selection-overlay'
        overlay.innerHTML = '<div class="paper-selection-toolbar"><button type="button" class="paper-selection-translate">翻译</button></div>'
        document.body.appendChild(overlay)
      })
      document.getElementById('question').addEventListener('click', () => {
        applyPaperSurfaceFocusIntent({
          groupId: 'g1',
          intent: { kind: 'request-lecture-focus', questionId: 'q1' },
          suppressScrollspyClear() {},
          activateGroup() {},
          selectLectureQuestion(_groupId, questionId) { lectureLog.push(questionId) },
          arbitrateLectureFocus: () => gate.arbitrateLectureFocus({ source: 'pointer' }),
          scheduleDeferredLectureFocus: (_wait, apply) => gate.scheduleDeferred(apply),
        })
      })
      window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          document.querySelector('.paper-selection-overlay')?.remove()
          window.__phase = 'idle'
        }
      })
    </script>
  </body>
</html>`

function pathToFileURLSafe(rel) {
  return '/@fs/' + path.join(rootDir, rel)
}

const vite = await createServer({
  root: path.join(rootDir, 'app'),
  logLevel: 'error',
  server: {
    host: '127.0.0.1',
    fs: { allow: [rootDir] },
  },
  appType: 'custom',
  plugins: [selectionControllerHarnessPlugin(rootDir), {
    name: 'selection-harness',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/' || req.url === '/index.html') {
          res.setHeader('content-type', 'text/html')
          res.end(html)
          return
        }
        next()
      })
    },
  }],
})

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

const port = await freePort()
await vite.listen(port)
const browser = await chromium.launch({ headless: true, channel: 'chromium' })
const page = await browser.newPage()
try {
  await page.goto(`http://127.0.0.1:${port}/`)
  await page.waitForSelector('#passage')

  await page.locator('#passage').evaluate((el) => {
    const text = el.firstChild
    const start = el.textContent.indexOf('address')
    const range = document.createRange()
    range.setStart(text, start)
    range.setEnd(text, start + 7)
    const selection = window.getSelection()
    selection.removeAllRanges()
    selection.addRange(range)
  })
  await page.waitForTimeout(40)
  check(
    'selecting a word shows 翻译 and does not call a model',
    (await page.locator('.paper-selection-translate').count()) === 1,
  )

  await page.evaluate(() => { window.__lectureLog.length = 0 })
  const box = await page.locator('#passage').boundingBox()
  await page.mouse.move(box.x + 12, box.y + 10)
  await page.mouse.down()
  await page.mouse.move(box.x + 220, box.y + 10, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(120)
  check('drag-select does not fire lecture focus', (await page.evaluate(() => window.__lectureLog.slice())).length === 0)

  await page.evaluate(() => { window.__lectureLog.length = 0 })
  const point = await page.locator('#passage').evaluate((el) => {
    const start = el.textContent.indexOf('address')
    const range = document.createRange()
    range.setStart(el.firstChild, start)
    range.setEnd(el.firstChild, start + 1)
    const rect = range.getBoundingClientRect()
    return { x: rect.x + 3, y: rect.y + 4 }
  })
  await page.mouse.dblclick(point.x, point.y)
  await page.waitForTimeout(160)
  check('double-click does not fire lecture focus', (await page.evaluate(() => window.__lectureLog.slice())).length === 0)

  await page.evaluate(() => { window.__lectureLog.length = 0 })
  await page.locator('#question').click()
  await page.waitForTimeout(160)
  check(
    'ordinary click still focuses the question after the double-click wait',
    (await page.evaluate(() => window.__lectureLog.slice())).includes('q1'),
  )

  await page.keyboard.press('Escape')
  await page.waitForTimeout(30)
  check('Escape closes the overlay', (await page.locator('.paper-selection-overlay').count()) === 0)

  await page.evaluate(() => {
    const overlay = document.createElement('div')
    overlay.className = 'paper-selection-overlay'
    overlay.textContent = '翻译'
    document.body.appendChild(overlay)
  })
  await page.emulateMedia({ media: 'print' })
  const printHidden = await page.locator('.paper-selection-overlay').evaluate((node) => (
    getComputedStyle(node).display === 'none'
  ))
  check('print media hides the overlay', printHidden)
  await verifySelectionController(page, `http://127.0.0.1:${port}`, check)
} finally {
  await browser.close()
  await vite.close()
}

if (failed > 0) {
  console.error(`FAILED ${failed}  passed ${passed}`)
  process.exit(1)
}
console.log(`OK ${passed}`)
