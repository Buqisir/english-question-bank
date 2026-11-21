#!/usr/bin/env node
// verify-resource: browser-render
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { createServer } from '../app/node_modules/vite/dist/node/index.js'

const app = fileURLToPath(new URL('../app/', import.meta.url))
const { chromium } = createRequire(new URL('../app/package.json', import.meta.url))('playwright')
const vite = await createServer({
  root: app, configFile: `${app}vite.config.ts`, logLevel: 'error',
  server: { host: '127.0.0.1', port: 0, hmr: false },
})
let browser
try {
  await vite.listen()
  const { port } = vite.httpServer.address()
  browser = await chromium.launch({ channel: 'chromium' })
  const page = await browser.newPage()
  for (const returnedScope of [undefined, ['read'], ['drafts:write', 'report:append']]) {
    const requested = ['report:append', 'drafts:write']
    const revoked = []
    let issuedScope
    await page.route('**/api/**', async route => {
      const request = route.request()
      const { pathname } = new URL(request.url())
      if (pathname === '/api/auth/me') return route.fulfill({ json: {
        authRequired: true, user: { id: 'owner', username: 'Owner', role: 'owner' },
      } })
      if (pathname === '/api/admin/agent-tokens' && request.method() === 'POST') {
        issuedScope = request.postDataJSON().scope
        return route.fulfill({ status: 201, json: {
          id: 'fixture', name: '权限测试', token: 'fixture-secret', createdAt: new Date().toISOString(),
          scope: returnedScope,
        } })
      }
      if (pathname === '/api/admin/agent-tokens/fixture/revoke' && request.method() === 'POST') {
        revoked.push(pathname)
        return route.fulfill({ json: { revoked: true } })
      }
      if (pathname === '/api/admin/agent-tokens') return route.fulfill({ json: { tokens: [] } })
      if (pathname === '/api/admin/agent-reports') return route.fulfill({ json: { reports: [] } })
      return route.fulfill({ status: 404, json: {} })
    })
    await page.goto(`http://127.0.0.1:${port}/?view=admin`)
    await page.getByLabel('名称', { exact: true }).fill('权限测试')
    await page.getByLabel('读取试卷').uncheck()
    await page.getByLabel('上报问题').check()
    await page.getByLabel('写入草稿').check()
    await page.getByRole('button', { name: '新建口令' }).click()
    const secret = page.locator('.agent-token-secret code')
    const error = page.locator('.agent-tokens [role="alert"]')
    await secret.or(error).waitFor({ timeout: 5000 })
    assert.deepEqual(issuedScope, requested)
    if (returnedScope?.length === requested.length) {
      assert.equal(await secret.textContent(), 'fixture-secret')
      assert.equal(revoked.length, 0)
    } else {
      assert.equal(await secret.count(), 0, 'Forbidden: shown secret from an incompatible server')
      assert.equal(revoked.length, 1)
      assert.match(await error.textContent(), /权限.*已作废/)
    }
    await page.unroute('**/api/**')
  }
  console.log('PASS agent token UI revokes missing or mismatched scopes and accepts equivalent scopes')
} finally {
  await browser?.close()
  await vite.close()
}
