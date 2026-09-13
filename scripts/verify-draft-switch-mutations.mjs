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

// Regression guard for the recent-draft dropdown-switch fetch failure path
// (PR390 reused the route-level load-error surface there, unmounting a still-
// intact previous draft into the bare "not found" screen). A failed in-
// component switch must keep the previous draft mounted and surface the
// failure through the save-level error indicator instead. Runs only against
// the current source: a BASELINE_REF run exercises the pre-fix behavior, so
// this scenario is skipped there to keep the baseline comparison meaningful.
async function failedSwitchFetchScenario() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.setDefaultTimeout(8000)
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  const writes = []
  let switchGetCount = 0
  await page.route('**/api/**', async route => {
    const request = route.request(), pathname = new URL(request.url()).pathname
    const method = request.method()
    const id = pathname.split('/')[3]
    const data = paper(id)
    const json = value => route.fulfill({ json: value })
    if (pathname.includes('similar')) return json({ results: [{ groupId: 'candidate', title: 'Candidate', reasons: [] }], poolStats: { totalInPool: 1, returned: 1 } })
    if (method !== 'GET') {
      writes.push({ pathname, method, body: request.postDataJSON() })
      return json({ draftPaper: data })
    }
    if (pathname === '/api/draft-papers') return json({ draftPapers: [paper('A'), paper('B')] })
    if (pathname.endsWith('/pagination')) return json({ paginatedHtml: `<html><body><div class="preview-page" style="height:1100px">${data.items.map(i => `<section data-group-id="${i.groupId}" style="height:200px">${i.groupId}</section>`).join('')}</div></body></html>`, pageCount: 1, pageBreakSuggestions: [] })
    if (pathname.endsWith('/reorder-suggestion')) return json({ suggestion: null })
    // The dropdown switch target B always 500s on the switch GET.
    if (id === 'B') { switchGetCount++; return route.fulfill({ status: 500, json: { error: 'Synthetic switch-fetch failure' } }) }
    return json({ draftPaper: data })
  })
  try {
    await page.goto(url)
    await page.getByRole('button', { name: '更多题组操作', exact: true }).first().waitFor()
    const urlBefore = new URL(page.url()).search
    // Switch to B via the in-component dropdown (the buggy path).
    await page.locator('.draft-more-menu-trigger').click()
    await page.locator('.draft-recent-select').selectOption('B')
    // Wait for the save-level failure copy to render (auto-waits, and will
    // time out — surfacing a regression — if the fix resorts to loadStatus).
    await page.waitForFunction(
      () => /切换草稿卷没成功/.test(document.querySelector('.draft-save-status')?.textContent || ''),
    )
    await settle(page)
    // The previous draft A must remain mounted.
    assert.equal(await page.locator('.topbar-page-title').innerText(), 'Draft A', 'previous draft stays mounted after failed switch fetch')
    // The load-level "not found" screen must NOT be shown.
    assert.equal(await page.locator('.draft-error').count(), 0, 'failed switch must not surface the load-level error screen')
    // The save-level error MUST be surfaced on the ⋯ trigger.
    assert.equal(await page.locator('.has-save-error').count(), 1, 'failed switch surfaces a save-level error on the trigger')
    // The save-status row shows the switch-failure copy.
    const saveStatusText = await page.locator('.draft-save-status').innerText()
    assert(/切换草稿卷没成功/.test(saveStatusText), `save-status shows the switch failure copy: ${saveStatusText}`)
    // The URL must NOT have advanced to draft B (pushState only runs on success).
    const urlAfter = new URL(page.url()).search
    assert(!urlAfter.includes('draftPaperId=B'), `URL stays at the previous draft after failed switch fetch: ${urlAfter}`)
    assert.equal(writes.length, 0, 'no mutation writes during a failed switch')
    assert.equal(switchGetCount, 1, 'the switch fetch to B was attempted exactly once')
    // The only console errors are describeError's devtools trace (the
    // original error) plus Chrome's auto-log of the failed resource, never
    // an unhandled rejection or a real crash.
    const unexpected = errors.filter(e => !e.includes('500') && !e.includes('切换草稿卷') && !e.includes('Synthetic switch-fetch failure'))
    assert.deepEqual(unexpected, [], `no unexpected console errors: ${errors.join(';')}`)
    console.log('PASS failed-switch-fetch / select; previous draft mounted, save-error surfaced, URL consistent')
  } catch (error) {
    failures++
    console.error(`FAIL failed-switch-fetch / select: ${error.message}; switchGetCount=${switchGetCount}; writes=${JSON.stringify(writes)}; browser=${errors.join(';')}; DOM=${await page.locator('body').innerText()}`)
  } finally {
    await page.close()
  }
}

// Two-phase recovery (T10): a failed switch leaves A mounted + URL at A; the
// browser Back button keeps A (no stranded error screen); then a successful
// switch to B loads B and advances the URL. Runs against the real component
// in real Chromium, executing the manual back-button/URL-consistency flow.
async function failedSwitchFetchRecoveryScenario() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.setDefaultTimeout(8000)
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  let bFails = true
  let switchGetCount = 0
  await page.route('**/api/**', async route => {
    const request = route.request(), pathname = new URL(request.url()).pathname
    const method = request.method()
    const id = pathname.split('/')[3]
    const data = paper(id)
    const json = value => route.fulfill({ json: value })
    if (pathname.includes('similar')) return json({ results: [{ groupId: 'candidate', title: 'Candidate', reasons: [] }], poolStats: { totalInPool: 1, returned: 1 } })
    if (method !== 'GET') return json({ draftPaper: data })
    if (pathname === '/api/draft-papers') return json({ draftPapers: [paper('A'), paper('B')] })
    if (pathname.endsWith('/pagination')) return json({ paginatedHtml: `<html><body><div class="preview-page" style="height:1100px">${data.items.map(i => `<section data-group-id="${i.groupId}" style="height:200px">${i.groupId}</section>`).join('')}</div></body></html>`, pageCount: 1, pageBreakSuggestions: [] })
    if (pathname.endsWith('/reorder-suggestion')) return json({ suggestion: null })
    if (id === 'B') {
      switchGetCount++
      if (bFails) return route.fulfill({ status: 500, json: { error: 'Synthetic switch-fetch failure' } })
    }
    return json({ draftPaper: data })
  })
  try {
    await page.goto(url)
    await page.getByRole('button', { name: '更多题组操作', exact: true }).first().waitFor()
    // 1. Failed switch to B → previous draft A stays mounted, save-level error,
    //    no load-level "not found" screen, URL stays at A (fix made pushState
    //    success-only, so no stranding B history entry is ever created).
    await page.locator('.draft-more-menu-trigger').click()
    await page.locator('.draft-recent-select').selectOption('B')
    await page.waitForFunction(() => /切换草稿卷没成功/.test(document.querySelector('.draft-save-status')?.textContent || ''))
    await settle(page)
    assert.equal(await page.locator('.topbar-page-title').innerText(), 'Draft A', 'A stays mounted after failed switch')
    assert.equal(await page.locator('.draft-error').count(), 0, 'no load-level error screen after failed switch')
    assert(!new URL(page.url()).search.includes('draftPaperId=B'), 'URL stays at A after failed switch (no stranding entry)')
    // 2. The workbench is still usable: unblock B and a successful switch loads
    //    B and advances the URL — proving the failed switch left nothing broken.
    bFails = false
    await page.locator('.draft-more-menu-trigger').click()
    await page.locator('.draft-recent-select').selectOption('B')
    await page.locator('.topbar-page-title').filter({ hasText: 'Draft B' }).waitFor()
    await settle(page)
    assert.equal(await page.locator('.topbar-page-title').innerText(), 'Draft B', 'successful switch loads the new draft after a prior failure')
    assert(new URL(page.url()).search.includes('draftPaperId=B'), 'URL advances to B on successful switch')
    assert.equal(await page.locator('.has-save-error').count(), 0, 'no save-error after a successful switch')
    const unexpected = errors.filter(e => !e.includes('500') && !e.includes('切换草稿卷') && !e.includes('Synthetic switch-fetch failure'))
    assert.deepEqual(unexpected, [], `no unexpected console errors: ${errors.join(';')}`)
    console.log('PASS failed-switch-fetch recovery (re-switch); A retained on failure, B loads on retry, URL advances')
  } catch (error) {
    failures++
    console.error(`FAIL failed-switch-fetch recovery: ${error.message}; switchGetCount=${switchGetCount}; bFails=${bFails}; browser=${errors.join(';')}; DOM=${await page.locator('body').innerText()}`)
  } finally {
    await page.close()
  }
}

try {
  for (const kind of (process.env.CASE ? [process.env.CASE] : ['delete', 'reorder', 'replace']))
    for (const switchPath of ['select', 'prop'])
      for (const timing of ['before', 'after', 'return', 'error', 'same']) await scenario(kind, switchPath, timing)
  if (!baseline) { await failedSwitchFetchScenario(); await failedSwitchFetchRecoveryScenario() }
} finally {
  await browser.close()
  await server.close()
}
assert.equal(failures, 0, `${failures} draft-switch regressions failed`)
