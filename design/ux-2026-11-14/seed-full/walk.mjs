#!/usr/bin/env node
// 全量种子实测：找题 → 看题组 → 看整卷 → 加 3 个题组进草稿卷 → 导出菜单 → 下载题卷 PDF → 试答案 PDF。
// 前提：另开一个终端先起站（只用偏移 55）：
//   INVENTORY_PORT_OFFSET=55 INVENTORY_SEED=full node scripts/component-inventory/rig.mjs
// 再跑：node design/ux-2026-11-14/seed-full/walk.mjs
// 输出：本目录 shots/*.png（DPR 1）和 walk.json；下载的 PDF 只放临时目录（WALK_DOWNLOADS，默认系统临时目录），不进仓库。
import { createRequire } from 'node:module'
import { mkdirSync, rmSync, writeFileSync, readFileSync, statSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '../../..')
const { chromium } = createRequire(path.join(ROOT, 'app/package.json'))('playwright')
const BASE = process.env.WALK_BASE || 'http://127.0.0.1:5354'
const SHOTS = path.join(HERE, 'shots')
const DL = process.env.WALK_DOWNLOADS || path.join(os.tmpdir(), 'eqb-seed-full-downloads')
const QUERY = process.env.WALK_QUERY || '2024 阅读'
const PAPER = process.env.WALK_PAPER || '2024年新课标Ⅰ卷'
rmSync(SHOTS, { recursive: true, force: true }); mkdirSync(SHOTS, { recursive: true }); mkdirSync(DL, { recursive: true })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await chromium.launch({ executablePath: process.env.INVENTORY_CHROMIUM || '/opt/pw-browsers/chromium' })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, acceptDownloads: true })
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)))
const steps = []
let n = 0
async function step(name, fn) {
  const rec = { n: ++n, name }
  try { await fn(rec) } catch (e) { rec.failure = String(e).split('\n')[0].slice(0, 300) }
  rec.shot = `shots/${String(rec.n).padStart(2, '0')}-${name}.png`
  await page.screenshot({ path: path.join(HERE, rec.shot) }).catch(() => {})
  rec.url = page.url().replace(BASE, '')
  steps.push(rec)
  console.log(rec.n, name, rec.failure ? 'FAIL ' + rec.failure : 'ok', JSON.stringify(rec.facts || {}))
}
const text = async (loc) => (await loc.innerText().catch(() => '')).trim().replace(/\s+/g, ' ')
async function waitDraftReady() {
  for (let i = 0; i < 240; i++) {
    const busy = await page.getByText(/正在生成分页预览|正在打开草稿卷/).count().catch(() => 0)
    const ready = await page.locator('[aria-label="更多题组操作"]').first().isVisible().catch(() => false)
    if (ready && !busy) return i / 2
    await sleep(500)
  }
  return -1
}
const draftId = () => page.evaluate(async () => (await (await fetch('/api/draft-papers/current')).json()).draftPaper?.id)

await step('登录后首页', async (rec) => {
  await page.goto(BASE + '/'); await page.locator('#login-username').waitFor({ timeout: 30000 })
  await page.fill('#login-username', 'owner'); await page.fill('#login-password', 'inventory-owner-pw-1')
  await page.click('.login-submit'); await page.locator('.login-card').waitFor({ state: 'detached', timeout: 30000 })
  await page.evaluate(async () => { // 清空草稿卷，保证从头走
    const d = await (await fetch('/api/draft-papers/current')).json()
    for (const item of d.draftPaper?.items || []) await fetch(`/api/draft-papers/${d.draftPaper.id}/items/${item.id}`, { method: 'DELETE' })
  }).catch(() => {})
  await page.goto(BASE + '/'); await page.locator('.concierge-intent-input').waitFor({ timeout: 30000 }); await sleep(1500)
  rec.facts = { 看整卷: await page.getByRole('button', { name: '看整卷' }).count(), 整卷未上线: await page.getByText('整卷未上线').count() }
})

await step('搜索结果', async (rec) => {
  const input = page.locator('.concierge-intent-input'); await input.fill(QUERY); await input.press('Enter')
  await page.locator('.concierge-paper-row').first().waitFor({ timeout: 20000 }); await sleep(1500)
  rec.facts = { query: QUERY, 行数: await page.locator('.concierge-paper-row').count(),
    看整卷: await page.getByRole('button', { name: '看整卷' }).count(), 整卷未上线: await page.getByText('整卷未上线').count() }
})

const row = () => page.locator('.concierge-paper-row').filter({ hasText: PAPER }).first()
await step('展开题组', async (rec) => {
  await row().getByText(PAPER, { exact: true }).first().click()
  await page.locator('.concierge-group-row').first().waitFor({ timeout: 10000 }); await sleep(800)
  rec.facts = { 题组: await page.locator('.concierge-group-row').count() }
})

await step('题组详情', async (rec) => {
  await page.locator('.concierge-group-row').first().locator('.concierge-group-row-title').click()
  await sleep(4000)
  rec.facts = { 这份卷还没上线: await page.getByText('这份卷还没上线').count(), 看整卷: await page.getByRole('button', { name: '看整卷' }).count(),
    加入草稿卷: await page.getByRole('button', { name: '加入草稿卷' }).count() }
})

await step('从题组详情看整卷', async (rec) => {
  await page.getByRole('button', { name: '看整卷' }).first().click()
  await page.locator('.paper-browse-group-actions').first().waitFor({ timeout: 30000 }); await sleep(2500)
  rec.facts = { 加入键: await page.locator('.paper-browse-group-actions').count(), 占位: await text(page.locator('.paper-browse-placeholder').first()) }
})

await step('回结果行点看整卷', async (rec) => {
  await page.goBack(); await sleep(1500)
  if (!(await row().isVisible().catch(() => false))) {
    await page.goto(BASE + '/'); const input = page.locator('.concierge-intent-input'); await input.fill(QUERY); await input.press('Enter')
    await page.locator('.concierge-paper-row').first().waitFor({ timeout: 20000 }); await sleep(1200)
  }
  await row().getByRole('button', { name: '看整卷' }).click()
  await page.locator('.paper-browse-group-actions').first().waitFor({ timeout: 30000 }); await sleep(2500)
  rec.facts = { 加入键: await page.locator('.paper-browse-group-actions').count() }
})

await step('整卷里加3个题组', async (rec) => {
  const added = []
  for (let i = 0; i < 3; i++) {
    // 加入键平时藏着，鼠标移到题组卡片上才出现（paperBrowsePage.css .paper-browse-group-actions），老师也是先移过去再点。
    const card = page.locator('.paper-browse-group-card').filter({ has: page.locator('.paper-browse-group-actions') }).nth(i)
    await card.scrollIntoViewIfNeeded(); await card.hover(); await sleep(300)
    await card.locator('.paper-browse-group-actions').getByRole('button', { name: '加入草稿卷' }).click()
    await card.locator('.paper-browse-group-actions').getByText('已加入').first().waitFor({ timeout: 20000 })
    added.push(await card.getAttribute('aria-label').catch(() => null))
  }
  await page.evaluate(() => window.scrollTo(0, 0)); await sleep(500)
  rec.facts = { added, 草稿丸: await text(page.locator('.basket-chip')) }
})

await step('打开草稿卷', async (rec) => {
  await page.locator('.basket-chip').click()
  rec.facts = { 等待秒: await waitDraftReady(), 题组: await page.locator('.draft-paper-rail-item').count() }
})

let verdicts = []
await step('PDF版本菜单', async (rec) => {
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.getByRole('button', { name: /PDF 版本/ }).first().click(); await sleep(600)
  const items = page.locator('.draft-product-menu [role=menuitemcheckbox], .draft-product-menu [role=menuitemradio], .draft-product-menu [role=menuitem]')
  for (let i = 0; i < await items.count(); i++) {
    const it = items.nth(i)
    verdicts.push({ text: await text(it), disabled: (await it.getAttribute('aria-disabled')) === 'true' || await it.isDisabled().catch(() => false) })
  }
  const id = await draftId()
  rec.facts = { 菜单: verdicts, 服务器判定: await page.evaluate(async (id) => (await (await fetch(`/api/draft-papers/${id}/pdf-editions`)).json()), id) }
})

// 省纸版要恰好 8 页（studentProductPolicy atMost=false），三篇阅读排不满，实测搜 351 秒后报错，所以下载用大字无听力版。
await step('选大字无听力版', async (rec) => {
  await page.getByRole('menuitemcheckbox', { name: /大字无听力版/ }).first().click().catch(async () => page.getByText('大字无听力版').first().click())
  rec.facts = { 等待秒: await waitDraftReady() }
})

await step('导出菜单', async (rec) => {
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.locator('header.topbar').getByRole('button', { name: '导出', exact: true }).click(); await sleep(600)
  const items = page.locator('.draft-export-menu-panel [role=menuitem]')
  const list = []
  for (let i = 0; i < await items.count(); i++) list.push({ text: await text(items.nth(i)), disabled: (await items.nth(i).getAttribute('aria-disabled')) === 'true' })
  rec.facts = { 菜单: list }
})

await step('下载题卷PDF', async (rec) => {
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 240000 }),
    page.getByRole('menuitem', { name: /^下载 PDF/ }).click(),
  ])
  const file = path.join(DL, 'paper-largeNoListening.pdf')
  await download.saveAs(file)
  const bytes = readFileSync(file)
  rec.facts = { 文件: path.basename(file), 字节: statSync(file).size, 头: bytes.subarray(0, 5).toString('latin1'),
    页数: (bytes.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length }
  await sleep(1000)
})

await step('试答案PDF', async (rec) => {
  const id = await draftId()
  // 菜单里「纯答案版」若置灰点不了，就照导出键同一个接口直接请求一次，记下服务器原话。
  rec.facts = await page.evaluate(async (id) => {
    const r = await fetch(`/api/draft-papers/${id}/print-pdf`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ edition: 'answerOnly' }) })
    const type = r.headers.get('content-type') || ''
    return { status: r.status, type, body: type.includes('pdf') ? `PDF ${(await r.arrayBuffer()).byteLength} 字节` : (await r.text()).slice(0, 400) }
  }, id)
  await page.getByRole('button', { name: /PDF 版本/ }).first().click(); await sleep(600)
})

writeFileSync(path.join(HERE, 'walk.json'), JSON.stringify({ base: BASE, query: QUERY, paper: PAPER, steps, pageErrors: errors }, null, 2) + '\n')
await browser.close()
