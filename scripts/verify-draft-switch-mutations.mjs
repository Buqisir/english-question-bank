#!/usr/bin/env node
// Real React DOM, real service fetches, synthetic API only. No database/server.
// BASELINE_REF=46c212ce... runs the same regressions against the prior PR source.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from '../app/node_modules/vite/dist/node/index.js'
import { chromium } from '../app/node_modules/playwright/index.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const component = 'app/src/features/draft-paper/DraftPaperWorkbench.tsx'
const baseline = process.env.BASELINE_REF
const baselineSource = baseline ? execFileSync('git', ['show', `${baseline}:${component}`], { cwd: root, encoding: 'utf8' }) : null
const server = await createServer({
  root: path.join(root, 'app'),
  server: { port: 0, host: '127.0.0.1' },
  plugins: [{
    name: 'draft-switch-regression', enforce: 'pre',
    load(id) { if (baselineSource && id === path.join(root, component)) return baselineSource },
    configureServer(vite) {
      vite.middlewares.use('/draft-switch-test', async (req, res, next) => {
        if (req.url.includes('?')) return next()
        res.setHeader('content-type', 'text/html')
        res.end(await vite.transformIndexHtml('/draft-switch-test', `<div id="root"></div><script type="module">
          import React from 'react';
          import { createRoot } from 'react-dom/client';
          import { DraftPaperWorkbench } from '/src/features/draft-paper/DraftPaperWorkbench.tsx';
          const root = createRoot(document.getElementById('root'));
          window.renderDraft = id => root.render(React.createElement(DraftPaperWorkbench, {
            draftPaperId: id, onBackToWorkbench() {}, shellNav: {user: null, onLogout() {}},
            questionGroupById: new Map([['candidate', {id:'candidate'}]])
          }));
          window.renderDraft('A');
        </script>`))
      })
    },
  }],
})
await server.listen()
const browser = await chromium.launch({ headless: true, channel: 'chromium' })
const url = `http://127.0.0.1:${server.httpServer.address().port}/draft-switch-test`
const item = (id, n) => ({ id: `${id}-${n}`, draftPaperId: id, groupId: `group-${id}-${n}`, orderIndex: n,
  pageBreakBefore: false, printReady: true, questionGroup: { id: `group-${id}-${n}`, title: `Group ${id} ${n}`, groupType: 'reading', questionCount: 1 } })
const paper = id => ({ id, title: `Draft ${id}`, items: [item(id, 1), item(id, 2)], itemCount: 2,
  totalQuestions: 2, printForm: 'a4', printHtml: '', studentLabel: null })
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
const settle = page => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))
let failures = 0

async function scenario(kind, switchPath, timing) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.setDefaultTimeout(8000)
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  const mutationStarted = deferred(), mutationRelease = deferred(), mutationDone = deferred()
  const bStarted = deferred(), bRelease = deferred()
  const writes = []
  let gated = false
  await page.route('**/api/**', async route => {
    const request = route.request(), pathname = new URL(request.url()).pathname
    const method = request.method()
    const id = pathname.split('/')[3]
    const data = paper(id)
    const json = value => route.fulfill({ json: value })
    if (pathname.includes('similar')) return json({ results: [{ groupId: 'candidate', title: 'Candidate', reasons: [] }], poolStats: { totalInPool: 1, returned: 1 } })
    if (method !== 'GET') {
      writes.push({ pathname, method, body: request.postDataJSON() })
      if (!gated && (kind === 'replace' ? method === 'POST' : kind === 'delete' ? method === 'DELETE' : method === 'PATCH')) {
        gated = true
        mutationStarted.resolve()
        await mutationRelease.promise
        if (timing === 'error') {
          await route.fulfill({ status: 500, json: { error: 'Synthetic delayed failure' } })
          mutationDone.resolve()
          return
        }
      }
      if (method === 'DELETE') {
        const removed = data.items.find(i => i.id === pathname.split('/').at(-1)) || data.items[0]
        data.items = data.items.filter(i => i.id !== removed.id)
        await json({ draftPaper: data, removed })
      } else if (pathname.endsWith('/items')) {
        data.items.push({ ...item(id, 3), groupId: 'candidate' })
        await json({ draftPaper: data })
      } else {
        const body = request.postDataJSON()
        if (body.items) data.items = body.items.map(i => data.items.find(entry => entry.id === i.id)).filter(Boolean)
        await json({ draftPaper: data })
      }
      if (kind !== 'replace' || method === 'DELETE') mutationDone.resolve()
      return
    }
    if (pathname === '/api/draft-papers') return json({ draftPapers: [paper('A'), paper('B')] })
    if (pathname.endsWith('/pagination')) return json({ paginatedHtml: `<html><body><div class="preview-page" style="height:1100px">${data.items.map(i => `<section data-group-id="${i.groupId}" style="height:200px">${i.groupId}</section>`).join('')}</div></body></html>`, pageCount: 1,
      pageBreakSuggestions: id === 'A' ? [{ groupId: 'group-A-1', itemId: 'A-1', reason: 'Synthetic break.' }] : [] })
    if (pathname.endsWith('/reorder-suggestion')) return json({ suggestion: id === 'A' ? { order: ['A-2', 'A-1'], move: { kind: 'front', itemId: 'A-2' }, brokenGroupId: 'group-A-1' } : null })
    if (id === 'B') { bStarted.resolve(); await bRelease.promise }
    return json({ draftPaper: data })
  })
  try {
    await page.goto(url)
    await page.getByRole('button', { name: '更多题组操作', exact: true }).first().waitFor()
    if (kind === 'delete') {
      await page.getByRole('button', { name: '更多题组操作', exact: true }).first().click()
      await page.getByRole('button', { name: '移除', exact: true }).click()
    }
    if (kind === 'reorder') await page.locator('.draft-reorder-suggestion-act').click()
    if (kind === 'replace') {
      await page.getByRole('button', { name: '换一篇相似篇章', exact: true }).first().click()
      await page.getByRole('button', { name: '⇄ 替换这篇', exact: true }).click()
    }
    await mutationStarted.promise
    if (timing !== 'same') {
      if (switchPath === 'prop') await page.evaluate(() => window.renderDraft('B'))
      else {
        await page.locator('.draft-more-menu-trigger').click()
        await page.locator('.draft-recent-select').selectOption('B')
      }
      await bStarted.promise
      if (timing !== 'before') {
        bRelease.resolve()
        await page.locator('.topbar-page-title').filter({ hasText: 'Draft B' }).waitFor()
      }
      if (timing === 'return') {
        if (switchPath === 'prop') await page.evaluate(() => window.renderDraft('A'))
        else await page.locator('.draft-recent-select').selectOption('A')
        await page.locator('.topbar-page-title').filter({ hasText: 'Draft A' }).waitFor()
      }
    }
    mutationRelease.resolve()
    await mutationDone.promise
    await settle(page)
    if (timing === 'before') { bRelease.resolve(); await page.locator('.topbar-page-title').filter({ hasText: 'Draft B' }).waitFor() }
    await settle(page)
    // Exercise any stale undo that reappears, then inspect its actual API target.
    const undo = page.locator('.draft-undo-toast[data-visible="true"] button').filter({ hasText: '撤销' })
    const staleUndo = await undo.count()
    if (staleUndo) { await undo.first().click(); await settle(page) }
    assert.equal(writes.filter(w => w.pathname.startsWith('/api/draft-papers/B')).length, 0, 'A undo must never write B')
    assert.equal(staleUndo, timing === 'same' ? 1 : 0, 'only the original draft generation may offer undo')
    if (timing === 'same') {
      const last = writes.at(-1)
      assert.equal(last.pathname, kind === 'reorder' ? '/api/draft-papers/A' : '/api/draft-papers/A/items/restore')
      if (kind === 'reorder') assert.deepEqual(last.body.items.map(i => i.id), ['A-1', 'A-2'])
      else assert.deepEqual(last.body, { groupId: 'group-A-1', orderIndex: 1, pageBreakBefore: false })
    }
    assert.equal(await page.locator('.topbar-page-title').innerText(), ['same', 'return'].includes(timing) ? 'Draft A' : 'Draft B', 'late response must not replace the selected draft')
    assert.equal(await page.locator('.has-save-error').count(), 0)
    assert.deepEqual(errors.filter(e => timing !== 'error' || !e.includes('500')), [])
    console.log(`PASS ${kind} / ${switchPath} / ${timing}; correct draft, undo ownership and API targets`)
  } catch (error) {
    failures++
    console.error(`FAIL ${kind} / ${switchPath} / ${timing}: ${error.message}; writes=${JSON.stringify(writes)}; browser=${errors.join(';')}; DOM=${await page.locator('body').innerText()}`)
  } finally {
    mutationRelease.resolve(); bRelease.resolve()
    await page.close()
  }
}
try {
  for (const kind of (process.env.CASE ? [process.env.CASE] : ['delete', 'reorder', 'replace']))
    for (const switchPath of ['select', 'prop'])
      for (const timing of ['before', 'after', 'return', 'error', 'same']) await scenario(kind, switchPath, timing)
} finally {
  await browser.close()
  await server.close()
}
assert.equal(failures, 0, `${failures} draft-switch regressions failed`)
