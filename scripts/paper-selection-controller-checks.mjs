// The real hook, DOM mapper, service client, page cache and overlay are mounted.
// Only canonical-source loading and HTTP responses are fixture-controlled here.
export const selectionProjectionFixture = `export function buildSelectionSourceFromConsumption(consumption) {
  if (!consumption?.selectionSource) throw new Error('Missing selection test source')
  return consumption.selectionSource
}`

export function selectionControllerHarnessSource(rootDir) {
  return `
import React, { useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { usePaperSelectionTranslation } from '/@fs/${rootDir}/app/src/features/paper-browse/selection/usePaperSelectionTranslation.tsx'
import { mapDomRangeToSegments } from '/@fs/${rootDir}/app/src/features/paper-browse/selection/mapDomSelection.ts'

const requests = []
const originalFetch = window.fetch
window.fetch = (url, init) => {
  if (url === '/api/paper-translation/status') {
    return Promise.resolve(new Response(JSON.stringify({
      enabled: true, keyAvailable: true, canRequestNew: true, reason: 'ok',
      promptVersion: 'selection-prompt-v3', contextPolicy: 'adjacent-v1',
      sourceProjectionVersion: 'paper-selection-source-v2', limits: {},
    }), { status: 200 }))
  }
  if (url === '/api/paper-translation/translate') {
    const body = JSON.parse(init.body)
    return new Promise((resolve) => {
      // Deliberately allow late responses AFTER abort: generation guards must work.
      requests.push({ body, signal: init.signal, complete(results, partial = false) {
        resolve(new Response(JSON.stringify({
          schemaVersion: 'paper-selection-response-v2', requestId: 'fixture',
          sourceRevision: body.sourceRevision, promptVersion: 'selection-prompt-v3',
          results, partial,
        }), { status: results.some((item) => item.status === 'ok') ? 200 : 502 }))
      } })
    })
  }
  return originalFetch(url, init)
}
const p1 = 'Alpha is first.'
const p2 = 'Beta is second.'
const c1 = 'First cell.'
const c2 = 'Second cell.'
function source(paperId, revision) {
  return { paperId, sourceRevision: revision, streams: [
    { streamId: 'g/body/p1', text: p1 + '\\n' + p2, role: 'passage-body', groupId: 'g', leaves: [
      { kind: 'paragraph', id: 'p1', start: 0, end: p1.length },
      { kind: 'paragraph', id: 'p2', start: p1.length + 1, end: p1.length + 1 + p2.length },
    ] },
    ...[c1, c2].map((text, index) => ({
      streamId: 'g/c' + (index + 1), text, role: 'table-cell', groupId: 'g',
      leaves: [{ kind: 'table-cell', id: 'c' + (index + 1), start: 0, end: text.length }],
    })),
  ] }
}
function Fixture({ paperId, consumption }) {
  const hostRef = useRef(null)
  const selection = usePaperSelectionTranslation({ paperId, consumption, hostRef })
  return React.createElement(React.Fragment, null,
    React.createElement('div', { ref: hostRef, id: 'controller-host', className: 'paper-browse-group-card', 'data-paper-browse-anchor': 'g' },
      React.createElement('p', { id: 'controller-p1', 'data-paper-paragraph-id': 'p1' }, p1),
      React.createElement('p', { id: 'controller-p2', 'data-paper-paragraph-id': 'p2' }, p2),
      React.createElement('table', null, React.createElement('tbody', null, React.createElement('tr', null,
        React.createElement('td', { id: 'controller-c1', 'data-canonical-cell-id': 'c1' }, c1),
        React.createElement('td', { id: 'controller-c2', 'data-canonical-cell-id': 'c2' }, c2))))),
    React.createElement('button', { id: 'controller-outside' }, 'Outside'),
    selection.overlay)
}
let root = createRoot(document.getElementById('controller-root'))
let currentSource
function render(paperId = 'controller-paper', revision = 'revision-1') {
  currentSource = source(paperId, revision)
  root.render(React.createElement(Fixture, {
    paperId, consumption: { disposition: 'ready', paperId, publicationDigest: revision, selectionSource: currentSource },
  }))
}
window.__selectionController = {
  requests, render,
  unmount() { root.unmount() },
  remount() { root = createRoot(document.getElementById('controller-root')); render() },
  select(startId, start, endId = startId, end) {
    const a = document.getElementById(startId).firstChild
    const b = document.getElementById(endId).firstChild
    const selection = window.getSelection()
    selection.removeAllRanges()
    selection.setBaseAndExtent(a, start, b, end ?? b.textContent.length)
    return mapDomRangeToSegments(selection.getRangeAt(0), currentSource, document.getElementById('controller-host'))
  },
  map: mapDomRangeToSegments,
}
render()
`
}

export const selectionControllerHtml = `<!doctype html><html><head><meta charset="utf-8">
<style>body { font: 16px/1.6 sans-serif; padding: 40px; --eqb-color-paper: white; --eqb-color-text: black; --eqb-font-size-sm: 14px; } #controller-host { width: 450px; } td { padding: 12px; } #controller-outside { margin-top: 30px; }</style>
</head><body><div id="controller-root"></div><script type="module" src="/__selection-controller-harness.js"></script></body></html>`

export function selectionControllerHarnessPlugin(rootDir) {
  return {
    name: 'paper-selection-controller-fixture',
    enforce: 'pre',
    resolveId(id, importer) {
      if (id === '/__selection-controller-harness.js') return '\0selection-controller-harness'
      if (id.endsWith('/sourceProjection.mjs') && importer?.endsWith('/selection/usePaperSelectionTranslation.tsx')) {
        return '\0selection-controller-source'
      }
    },
    load(id) {
      if (id === '\0selection-controller-harness') return selectionControllerHarnessSource(rootDir)
      if (id === '\0selection-controller-source') return selectionProjectionFixture
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url !== '/__selection-controller') return next()
        void server.transformIndexHtml(request.url, selectionControllerHtml).then((html) => {
          response.setHeader('content-type', 'text/html; charset=utf-8')
          response.end(html)
        }, next)
      })
    },
  }
}

export async function verifySelectionController(page, baseUrl, check) {
  const ok = (translation, segmentIndex = 0) => ({ segmentIndex, status: 'ok', translation, taskMode: 'contextual-fragment' })
  const bad = (segmentIndex = 0) => ({ segmentIndex, status: 'error', message: 'fixture retryable error', retryable: true })
  const select = async (id, start = 0, endId = id, end) => {
    const mapped = await page.evaluate((args) => window.__selectionController.select(...args), [id, start, endId, end])
    await page.waitForSelector('.paper-selection-translate')
    return mapped
  }
  const count = () => page.evaluate(() => window.__selectionController.requests.length)
  const clickTranslate = async () => {
    const index = await count()
    await page.locator('.paper-selection-translate').click()
    await page.waitForFunction((n) => window.__selectionController.requests.length === n + 1, index)
    return index
  }
  const respond = async (index, results, partial = false) => {
    await page.evaluate(({ index, results, partial }) => window.__selectionController.requests[index].complete(results, partial), { index, results, partial })
    await page.waitForTimeout(40)
  }
  const close = async () => { await page.keyboard.press('Escape'); await page.waitForSelector('.paper-selection-overlay', { state: 'detached' }) }
  await page.emulateMedia({ media: 'screen' })
  await page.goto(baseUrl + '/__selection-controller')
  await page.waitForSelector('#controller-p1')

  const joined = await select('controller-p1', 0, 'controller-p2')
  check('actual mapper joins adjacent paragraph leaves with the canonical newline', joined?.length === 1 && joined[0].selectedText === 'Alpha is first.\nBeta is second.')
  await close()
  const reversed = await select('controller-p2', 15, 'controller-p1', 0)
  check('reverse paragraph selection maps to the same source range', reversed?.[0]?.selectedText === joined[0].selectedText)
  check('native selection alone makes no translation calls', await count() === 0)
  await close()

  await select('controller-p1', 0, 'controller-p1', 5)
  const a = await clickTranslate()
  await select('controller-p2', 0, 'controller-p2', 4)
  check('new selection cancels loading A and offers a toolbar for B', await page.evaluate((n) => window.__selectionController.requests[n].signal.aborted, a))
  await respond(a, [ok('LATE A')])
  check('late aborted A does not replace B toolbar', await page.locator('.paper-selection-translate').count() === 1 && !((await page.locator('body').innerText()).includes('LATE A')))
  const b = await clickTranslate()
  await respond(b, [ok('B result')])
  await select('controller-p1', 6, 'controller-p1', 8)
  check('new selection replaces a completed result', await page.locator('.paper-selection-translate').count() === 1)
  const c = await clickTranslate()
  await respond(c, [bad()])
  await select('controller-p1', 9, 'controller-p1', 14)
  check('new selection replaces an error', await page.locator('.paper-selection-translate').count() === 1)
  const d = await clickTranslate()
  await page.locator('#controller-outside').click()
  check('outside click closes loading and aborts its request', await page.locator('.paper-selection-overlay').count() === 0 && await page.evaluate((n) => window.__selectionController.requests[n].signal.aborted, d))
  await respond(d, [ok('discarded')])

  await select('controller-c1', 0, 'controller-c2')
  const partialIndex = await clickTranslate()
  await respond(partialIndex, [ok('first translated'), bad(1)], true)
  check('partial result visibly retains the failed segment and retry control', (await page.locator('.paper-selection-card').innerText()).includes('部分内容未完成') && await page.locator('.paper-selection-retry').count() === 1)
  await close()
  await select('controller-c1', 0, 'controller-c2')
  const retryIndex = await clickTranslate()
  const retryBody = await page.evaluate((n) => window.__selectionController.requests[n].body, retryIndex)
  check('reopening partial selection requests only its missing segment', retryBody.segments.length === 1 && retryBody.segments[0].streamId === 'g/c2')
  await respond(retryIndex, [bad()])
  const retryAgain = await count()
  await page.locator('.paper-selection-retry').click()
  await page.waitForFunction((n) => window.__selectionController.requests.length === n + 1, retryAgain)
  check('manual retry also excludes the already successful segment', await page.evaluate((n) => window.__selectionController.requests[n].body.segments.length === 1, retryAgain))
  await respond(retryAgain, [ok('second translated')])
  const ordered = await page.locator('[data-selection-segment-index] .paper-selection-card-body').allTextContents()
  check('retry-local segment index is remapped to original display order', ordered.length === 2 && ordered[0] === 'first translated' && ordered[1] === 'second translated')
  await close()
  await select('controller-c1', 0, 'controller-c2')
  const beforeCache = await count()
  await page.locator('.paper-selection-translate').click()
  await page.waitForSelector('.paper-selection-card-body')
  check('complete segments reopen without another HTTP translation request', await count() === beforeCache)
  await page.locator('#controller-outside').click()
  check('outside click closes a completed result', await page.locator('.paper-selection-overlay').count() === 0)

  await select('controller-p1', 0, 'controller-p1', 14)
  const versionPending = await clickTranslate()
  await page.evaluate(() => window.__selectionController.render('controller-paper', 'revision-2'))
  await page.waitForSelector('.paper-selection-overlay', { state: 'detached' })
  await respond(versionPending, [ok('OLD VERSION')])
  check('source revision change aborts and discards an old response', await page.locator('.paper-selection-overlay').count() === 0 && await page.evaluate((n) => window.__selectionController.requests[n].signal.aborted, versionPending))
  await select('controller-p2', 0, 'controller-p2', 14)
  const unmountPending = await clickTranslate()
  await page.evaluate(() => window.__selectionController.unmount())
  await respond(unmountPending, [ok('OLD MOUNT')])
  check('unmount aborts the subscriber and removes the portal', await page.locator('.paper-selection-overlay').count() === 0 && await page.evaluate((n) => window.__selectionController.requests[n].signal.aborted, unmountPending))
}
