import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { createServer } from '../app/node_modules/vite/dist/node/index.js'
import { chromium } from '../app/node_modules/playwright/index.mjs'
import { createDraftPaperRoutes } from '../server/draft-paper/draftPaperRoutes.mjs'

const route = createDraftPaperRoutes().find((entry) => entry.method === 'POST' && entry.pattern.test('/api/draft-papers/qa/print-pdf'))
const headers = {}
await route.handle({ request: {}, response: { setHeader: (name, value) => { headers[name] = value } },
  match: ['', 'qa'], context: {
    resolveDataUserId: () => 'qa-user', readJsonBody: async () => ({ versionType: 'student', pageLayout: 'economy8' }),
    draftPaperStore: { exportDraftPaperPdf: async (userId, id, options) => {
      assert.equal(userId, 'qa-user'); assert.equal(id, 'qa'); assert.equal(options.pageLayout, 'economy8')
      return { body: Buffer.from('%PDF-fixture'), fileName: 'qa.pdf', fontSizePt: 10.5, crossingGroupCount: 2, splitOptionBankCount: 1 }
    } },
    sendPdf: () => {}, sendJson: () => assert.fail('unexpected route error'),
  } })
assert.equal(headers['x-paper-crossing-group-count'], '2')
assert.equal(headers['x-paper-split-option-bank-count'], '1')
assert.equal(headers['x-paper-font-size-pt'], '10.5')

const server = await createServer({ root: new URL('../app', import.meta.url).pathname, server: { host: '127.0.0.1', port: 5198, strictPort: true } })
await server.listen()
const origin = `http://127.0.0.1:${server.httpServer.address().port}`
const browser = await chromium.launch({ headless: true, channel: 'chromium', args: ['--disable-features=LocalNetworkAccessChecks'] })
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 })
  page.on('pageerror', (error) => console.error(error.message))
  page.on('console', (message) => { if (message.type() === 'error') console.error(message.text()) })
  const draft = { id: 'qa', title: '分页提示测试', subject: 'english', status: 'active', isCurrent: true, printForm: 'a4', itemCount: 1,
    totalQuestions: 3, printHtml: '', items: [{ id: 'item', groupId: 'group', sourcePaperId: 'paper', groupMissing: false, printReady: true,
      questionGroup: { id: 'group', title: '测试题组', groupType: 'reading', questionCount: 3, wordCount: 320, tags: [] } }] }
  let requestedLayout = 'economy8'
  await page.route('**/api/**', async (request) => {
    const url = request.request().url()
    if (url.includes('/print-pdf')) {
      assert.equal(request.request().postDataJSON().pageLayout, requestedLayout)
      return request.fulfill({ contentType: 'application/pdf', headers, body: Buffer.from('%PDF-fixture') })
    }
    const body = url.includes('/pagination') ? { paginatedHtml: '<html><body>测试预览</body></html>', pageCount: 1, pageBreakSuggestions: [] }
      : /\/api\/draft-papers$/.test(url) ? { draftPapers: [draft] } : { draftPaper: draft }
    return request.fulfill({ json: body })
  })
  await page.route('**/__friendly_export_qa', (request) => request.fulfill({ contentType: 'text/html', body: `<!doctype html><html><body><div id="root"></div>
    <script type="module" src="/@vite/client"></script>
    <script type="module">
      import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$=()=>{}; window.$RefreshSig$=()=>type=>type; window.__vite_plugin_react_preamble_installed__=true;
      const {default:React}=await import('/node_modules/.vite/deps/react.js');
      const {default:{createRoot}}=await import('/node_modules/.vite/deps/react-dom_client.js');
      const {DraftPaperWorkbench}=await import('/src/features/draft-paper/DraftPaperWorkbench.tsx');
      await import('/src/App.css');
      createRoot(document.getElementById('root')).render(React.createElement(DraftPaperWorkbench,{draftPaperId:'qa',onBackToWorkbench:()=>{},shellNav:{user:{username:'QA'},onLogout:()=>{}},questionGroupById:new Map()}));
    </script></body></html>` }))
  await page.goto(`${origin}/__friendly_export_qa`)
  await page.getByRole('button', { name: '导出', exact: true }).click()
  await page.getByRole('menuitem', { name: '省纸版（无听力 8 页，小四优先）', exact: true }).click()
  await page.getByText('仍有 2 个题组跨 A3 正反面', { exact: false }).waitFor()
  assert.match(await page.locator('.draft-success').textContent(), /已保持指定页数和正文版式/)
  assert.match(await page.locator('.draft-success').textContent(), /有 1 个选项组跨页，单条选项保持完整/)
  assert.match(await page.locator('.draft-success').textContent(), /五号（10.5pt）/)
  requestedLayout = 'largeComplete'
  headers['x-paper-font-size-pt'] = '12'
  await page.getByRole('button', { name: '导出', exact: true }).click()
  assert.equal(await page.getByRole('menuitem', { name: '大字无听力版（最多 10 页）' }).count(), 1)
  assert.equal(await page.getByRole('menuitem', { name: '大字完整版（含听力，最多 12 页）' }).count(), 1)
  const screenshot = path.resolve('.amp/in/artifacts/draft-long-export-menu.png')
  mkdirSync(path.dirname(screenshot), { recursive: true })
  await page.screenshot({ path: screenshot })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: '导出', exact: true }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: path.resolve('.amp/in/artifacts/draft-long-export-menu-narrow.png') })
  const menu = await page.locator('.draft-export-menu-panel').boundingBox()
  assert(menu && menu.x >= 0 && menu.x + menu.width <= 390, 'narrow export menu stays inside the viewport')
  await page.getByRole('menuitem', { name: '大字完整版（含听力，最多 12 页）' }).click()
  await page.getByText('已满足长卷页数上限和正文版式', { exact: false }).waitFor()
  assert.doesNotMatch(await page.locator('.draft-success').textContent(), /已保持指定页数/)
  assert.match(await page.locator('.draft-success').textContent(), /小四（12pt）/)
  console.log('PASS fixed-export route → client → old exact and new capped labels/warnings (fixture-controlled download)')
} finally {
  await browser.close()
  await server.close()
}
