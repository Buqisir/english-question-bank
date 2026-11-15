#!/usr/bin/env node
// 卡片 / 板构件（Surface）换上前后对照（构件厂，2026-11-15）。
// 拍清点「卡片 / 板 / 纸」一节里用得上的几处，宽屏 1440 和窄屏 390 各一遍：
// - 首页：默认（「接着做」「今天翻到」两块列表板）、出结果（卷行列表板）、展开第一行（surface-03 行头底色）、
//   没找到（EmptyState 的「没找到」卡片，这一轮不改，拿来核对没有打架）；
// - 浏览页：按年份分组的卷行列表板；
// - 草稿卷：空（左栏目录只有一句话）、有三组（左栏目录），390 宽时左栏本来就藏起来，只拍整页；
// - 个人空间：文件列表板（和 space-shots.mjs 同一份假数据）；
// - 管理页：新建 Agent 口令后的「只显示这一次」那一块（口令接口拦下来给固定值，免得每次口令不同）。
// 每个状态拍整页和那一块的裁图，再记下那一块的实算样式（底、边、圆角、影子、内边距、位置）。
//
// 用法：node scripts/component-inventory/surface-shots.mjs <标签>
// 输出：.scratch/component-inventory/surface/<标签>/（不进仓库，surface-compare.mjs 挑要留的抄进 design/）
// 端口：INVENTORY_PORT_OFFSET（这一轮用 65）；默认测试数据（paper-2026-i 四篇阅读）。
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { RAW, requireFromApp } from './lib.mjs'
import { startRig } from './rig.mjs'
import { addDraftItems, login, settle, sleep } from './scenarios.mjs'

const label = process.argv[2]
if (!label || !/^[\w-]+$/.test(label)) { console.error('用法：surface-shots.mjs <标签>'); process.exit(2) }
const OUT = path.join(RAW, 'surface', label)
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true })

// 这几处卡片 / 板（换之前的类名换之后都还在，构件只是多加了 eqb-surface）。
const SURFACES = [
  '.concierge-paper-list', '.home-row-list', '.my-space-file-list', '.agent-token-secret', '.draft-paper-rail',
  '.concierge-paper-row.is-expanded .concierge-paper-row-head', '.eqb-empty-state[data-art="not-found"]',
]

function measureSurfaces(selectors) {
  const out = {}
  for (const sel of selectors) {
    out[sel] = [...document.querySelectorAll(sel)].filter((e) => e.getClientRects().length).map((e) => {
      const cs = getComputedStyle(e), r = e.getBoundingClientRect()
      return {
        tag: e.tagName.toLowerCase(),
        cls: typeof e.className === 'string' ? e.className : '',
        rect: [r.x, r.y, r.width, r.height].map((n) => Math.round(n * 100) / 100),
        bg: cs.backgroundColor,
        border: `${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor}`,
        radius: cs.borderRadius, shadow: cs.boxShadow,
        padding: `${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft}`,
        overflow: cs.overflow, labelledby: e.getAttribute('aria-labelledby'), label: e.getAttribute('aria-label'),
      }
    })
  }
  return out
}

// 和 space-shots.mjs 同一份假数据（本地网站的个人空间是空的）。
const T = '2026-11-12T08:30:00.000Z'
const SNAPSHOT = {
  folders: [{ id: 'folder-a', name: '高三一班', artifactCount: 1, createdAt: T, updatedAt: T }],
  artifacts: [
    { id: 'artifact-a', folderId: 'folder-a', title: '2026 一卷阅读 A 篇练习', fileName: '2026-一卷阅读A.pdf', fileUrl: '/api/my-space/artifacts/artifact-a/file', artifactType: 'student-paper', sourceDraftPaperId: 'draft-x', sourceDraftTitle: '阅读练习', sourceDraftStudentLabel: '张同学', sourceDraftExists: true, pageCount: 3, generatedAt: T, createdAt: T, updatedAt: T },
    { id: 'artifact-b', folderId: null, title: '期中复习卷', fileName: '期中复习卷.pdf', fileUrl: '/api/my-space/artifacts/artifact-b/file', artifactType: 'student-paper', sourceDraftPaperId: 'draft-y', sourceDraftTitle: '期中复习', sourceDraftStudentLabel: '', sourceDraftExists: true, pageCount: 2, generatedAt: '2026-11-10T08:30:00.000Z', createdAt: T, updatedAt: T },
  ],
}
// 管理页口令：固定的一条，口令字也固定。
const TOKEN = { id: 'token-fixed', name: '清点用口令', createdAt: T, lastUsedAt: null, revokedAt: null }
const SECRET = 'eqb_agent_FIXEDFORSCREENSHOTS_0123456789abcdef'

const { chromium } = requireFromApp('playwright')
const rig = await startRig({ quiet: true })
const browser = await chromium.launch({ executablePath: process.env.INVENTORY_CHROMIUM || '/opt/pw-browsers/chromium' })
const measures = {}
const missing = []
try {
  for (const [width, height, suffix] of [[1440, 900, ''], [390, 844, '-390']]) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, locale: 'zh-CN', reducedMotion: 'reduce' })
    await context.route(/\/api\/my-space(\?[^/]*)?$/, (route) => {
      if (route.request().method() !== 'GET') return route.fallback()
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SNAPSHOT) })
    })
    let tokens = []
    await context.route(/\/api\/admin\/agent-tokens(\?.*)?$/, (route) => {
      if (route.request().method() === 'POST') { tokens = [TOKEN]; return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...TOKEN, token: SECRET }) }) }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ tokens }) })
    })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(String(e)))
    const park = async () => { await page.mouse.move(2, height - 2); await sleep(250) }
    const blur = async () => { await page.evaluate(() => document.activeElement?.blur()); await sleep(150) }
    const step = async (name, fn) => { try { await fn() } catch (e) { missing.push(`w${width} ${name}: ${String(e).split('\n')[0].slice(0, 200)}`) } }
    const full = async (name) => { await page.screenshot({ path: path.join(OUT, `${name}${suffix}.png`) }) }
    const crop = async (name, locator, pad = 16) => {
      await locator.scrollIntoViewIfNeeded(); await sleep(200)
      const b = await locator.boundingBox()
      if (!b) throw new Error('看不见：' + name)
      const vp = page.viewportSize()
      const x0 = Math.max(0, b.x - pad), y0 = Math.max(0, b.y - pad)
      await page.screenshot({ path: path.join(OUT, `${name}${suffix}.png`), clip: { x: x0, y: y0, width: Math.min(vp.width, b.x + b.width + pad) - x0, height: Math.min(vp.height, b.y + b.height + pad) - y0 } })
    }
    const record = async (name) => { measures[`${name}${suffix}`] = await page.evaluate(measureSurfaces, SURFACES) }
    await login(page, rig.base)

    // ── 草稿卷空：先清空当前草稿卷 ──
    await step('draft-empty', async () => {
      await page.evaluate(async () => { const d = await (await fetch('/api/draft-papers/current?create=1')).json(); for (const it of d.draftPaper?.items || []) await fetch(`/api/draft-papers/${encodeURIComponent(d.draftPaper.id)}/items/${encodeURIComponent(it.id)}`, { method: 'DELETE' }) })
      await page.goto(rig.base + '/?view=draft-paper'); await page.locator('.draft-workbench-shell').waitFor({ timeout: 30000 }); await settle(page, 3000); await blur(); await park()
      await full('draft-empty-page')
      if (!suffix) await crop('draft-empty-rail', page.locator('.draft-paper-rail'))
      await record('draft-empty')
    })

    // ── 首页默认（草稿卷空：只有「今天翻到」）──
    await step('home', async () => {
      await page.goto(rig.base + '/'); await settle(page, 2000); await blur(); await park()
      await full('home-page')
      // 默认测试数据里「今天翻到」可能不出（挑不到篇），有才拍
      if (await page.locator('.home-row-list').count()) await crop('home-daily', page.locator('.home-row-list').last())
      await record('home')
    })

    await addDraftItems(page)

    // ── 首页默认（草稿卷有题：多出「接着做」）──
    await step('home-continue', async () => {
      await page.goto(rig.base + '/'); await settle(page, 2000); await blur(); await park()
      await full('home-continue-page')
      await crop('home-continue', page.locator('.home-row-list').first())
      await record('home-continue')
      // 悬停一行：列表板里的行铺悬停底（FluidHoverList），板本身不变
      await page.locator('.home-row').first().hover(); await sleep(400)
      await crop('home-continue-hover', page.locator('.home-row-list').first())
      await park()
    })

    // ── 首页出结果 ──
    await step('home-results', async () => {
      const input = page.locator('.concierge-intent-input')
      await input.fill('2026 阅读'); await input.press('Enter'); await settle(page, 3000); await blur(); await park()
      await full('home-results-page')
      await crop('home-results-list', page.locator('.concierge-paper-list').first())
      await record('home-results')
      await page.locator('.concierge-paper-row-head').first().hover(); await sleep(400)
      await crop('home-results-hover', page.locator('.concierge-paper-list').first())
      await park()
      // 展开第一行（surface-03：展开后的行头垫悬停底）
      await page.locator('.concierge-paper-row-head').first().click(); await settle(page, 1500); await blur(); await park()
      await full('home-results-expanded-page')
      await crop('home-results-expanded', page.locator('.concierge-paper-list > li').first())
      await record('home-results-expanded')
    })

    // ── 首页没找到（EmptyState，不改，核对） ──
    await step('home-noresult', async () => {
      await page.goto(rig.base + '/'); await settle(page, 1500)
      const input = page.locator('.concierge-intent-input')
      await input.fill('zzqqxx 不存在的题'); await input.press('Enter'); await settle(page, 3000); await blur(); await park()
      await full('home-noresult-page')
      await crop('home-noresult', page.locator('.eqb-empty-state[data-art="not-found"]'), 140)
      await record('home-noresult')
    })

    // ── 浏览页 ──
    await step('browse', async () => {
      await page.goto(rig.base + '/?view=browse'); await settle(page, 2500); await blur(); await park()
      await full('browse-page')
      await crop('browse-list', page.locator('.concierge-paper-list').first())
      await record('browse')
    })

    // ── 草稿卷（三组）──
    await step('draft', async () => {
      await page.goto(rig.base + '/?view=draft-paper'); await page.locator('.draft-paper-col').first().waitFor({ timeout: 120000 })
      await settle(page, 4000); await blur(); await park()
      await full('draft-page')
      if (!suffix) {
        await crop('draft-rail', page.locator('.draft-paper-rail'))
        await page.locator('.draft-paper-rail-item').nth(1).hover(); await sleep(400)
        await crop('draft-rail-hover', page.locator('.draft-paper-rail'))
        await park()
      }
      await record('draft')
    })

    // ── 个人空间 ──
    await step('my-space', async () => {
      await page.goto(rig.base + '/?view=my-space'); await settle(page, 2000); await blur(); await park()
      await full('my-space-page')
      await crop('my-space-list', page.locator('.my-space-file-list').first())
      await record('my-space')
      await page.locator('.my-space-file-row h3').first().hover(); await sleep(400)
      await crop('my-space-list-hover', page.locator('.my-space-file-list').first())
      await park()
    })

    // ── 管理页 Agent 口令 ──
    await step('admin-token', async () => {
      await page.goto(rig.base + '/?view=admin'); await settle(page, 2000)
      await page.locator('.agent-tokens form input').first().fill('清点用口令')
      await page.locator('.agent-token-submit').click(); await page.locator('.agent-token-secret').waitFor({ timeout: 8000 }); await sleep(600)
      await blur(); await park()
      await crop('admin-token-secret', page.locator('.agent-token-secret'))
      await crop('admin-tokens', page.locator('.agent-tokens'))
      await record('admin-token')
    })

    if (errors.length) missing.push(`w${width} 页面报错 ${errors.length} 条：${errors[0].slice(0, 200)}`)
    await context.close()
  }
} finally {
  await browser.close()
  await rig.stop()
}
writeFileSync(path.join(OUT, 'measure.json'), JSON.stringify(measures, null, 1) + '\n')
writeFileSync(path.join(OUT, 'missing.json'), JSON.stringify(missing, null, 1) + '\n')
console.log('missing', missing)
console.log('写到', OUT)
process.exit(0)
