#!/usr/bin/env node
// 行构件（Row）换上前后对照（构件厂，2026-11-15）。
// 拍清点「行」一节里换上构件的几处，宽屏 1440 和窄屏 390 各一遍，静止和悬停都拍：
// - 首页默认：「最近上新」卷行（整行可点，展开题组）、「今天翻到」；加题以后「接着做」（整行可点，打开一页）；
// - 首页出结果：卷行列表（悬停一行）、展开第一行（里面的题组行，悬停一行题组）；
// - 浏览页：按年份分组的卷行列表（悬停一行）、展开第一行（题组行，悬停一行题组）；
// - 个人空间：文件行（不可点，行里三个键；和 space-shots.mjs 同一份假数据）；
// - 草稿卷：整页（左栏目录这一轮不换，拿来核对没被带动）。
// 每个状态拍整页和那一块的裁图，再记下每一行的实算样式（高、内边距、底、分隔线、指针）。
//
// 用法：node scripts/component-inventory/row-shots.mjs <标签>
// 输出：.scratch/component-inventory/row/<标签>/（不进仓库，row-compare.mjs 挑要留的抄进 design/）
// 端口：INVENTORY_PORT_OFFSET（这一轮用 66）；INVENTORY_SEED=full 时首页、浏览页多拍几十套卷（草稿卷、个人空间照拍）。
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { RAW, requireFromApp } from './lib.mjs'
import { startRig } from './rig.mjs'
import { addDraftItems, login, settle, sleep } from './scenarios.mjs'

const label = process.argv[2]
if (!label || !/^[\w-]+$/.test(label)) { console.error('用法：row-shots.mjs <标签>'); process.exit(2) }
const FULL = process.env.INVENTORY_SEED === 'full'
const OUT = path.join(RAW, 'row', FULL ? `${label}-full` : label)
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true })

// 每一行（换之前、换之后类名都在，构件只是多加了 eqb-row）。
const ROWS = ['.home-row', '.concierge-paper-row-head', '.concierge-group-row-line', '.my-space-file-row']
const LISTS = ['.home-row-list', '.concierge-paper-list', '.concierge-group-index-rows', '.my-space-file-list']

function measureRows([rows, lists]) {
  const pick = (e) => {
    const cs = getComputedStyle(e), r = e.getBoundingClientRect()
    return {
      tag: e.tagName.toLowerCase(),
      rect: [r.x, r.y, r.width, r.height].map((n) => Math.round(n * 100) / 100),
      bg: cs.backgroundColor,
      borderTop: `${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor}`,
      borderBottom: `${cs.borderBottomWidth} ${cs.borderBottomStyle} ${cs.borderBottomColor}`,
      padding: `${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft}`,
      minHeight: cs.minHeight,
    }
  }
  const out = {}
  for (const sel of rows) out[sel] = [...document.querySelectorAll(sel)].filter((e) => e.getClientRects().length).slice(0, 12).map(pick)
  for (const sel of lists) {
    out[`${sel} > li`] = [...document.querySelectorAll(`${sel} > li`)].filter((e) => e.getClientRects().length).slice(0, 12).map(pick)
  }
  return out
}

const T = '2026-11-12T08:30:00.000Z'
const SNAPSHOT = {
  folders: [{ id: 'folder-a', name: '高三一班', artifactCount: 1, createdAt: T, updatedAt: T }],
  artifacts: [
    { id: 'artifact-a', folderId: 'folder-a', title: '2026 一卷阅读 A 篇练习', fileName: '2026-一卷阅读A.pdf', fileUrl: '/api/my-space/artifacts/artifact-a/file', artifactType: 'student-paper', sourceDraftPaperId: 'draft-x', sourceDraftTitle: '阅读练习', sourceDraftStudentLabel: '张同学', sourceDraftExists: true, pageCount: 3, generatedAt: T, createdAt: T, updatedAt: T },
    { id: 'artifact-b', folderId: null, title: '期中复习卷', fileName: '期中复习卷.pdf', fileUrl: '/api/my-space/artifacts/artifact-b/file', artifactType: 'student-paper', sourceDraftPaperId: 'draft-y', sourceDraftTitle: '期中复习', sourceDraftStudentLabel: '', sourceDraftExists: true, pageCount: 2, generatedAt: '2026-11-10T08:30:00.000Z', createdAt: T, updatedAt: T },
  ],
}

const { chromium } = requireFromApp('playwright')
const rig = await startRig({ quiet: true })
const browser = await chromium.launch({ channel: 'chromium' })
const measures = {}
const missing = []
try {
  for (const [width, height, suffix] of [[1440, 900, ''], [390, 844, '-390']]) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, locale: 'zh-CN', reducedMotion: 'reduce' })
    await context.route(/\/api\/my-space(\?[^/]*)?$/, (route) => {
      if (route.request().method() !== 'GET') return route.fallback()
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SNAPSHOT) })
    })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(String(e)))
    const park = async () => { await page.mouse.move(2, height - 2); await sleep(300) }
    const blur = async () => { await page.evaluate(() => document.activeElement?.blur()); await sleep(150) }
    const step = async (name, fn) => { try { await fn() } catch (e) { missing.push(`w${width} ${name}: ${String(e).split('\n')[0].slice(0, 200)}`) } }
    const full = async (name) => { await page.screenshot({ path: path.join(OUT, `${name}${suffix}.png`) }) }
    const crop = async (name, locator, pad = 16) => {
      await locator.scrollIntoViewIfNeeded(); await sleep(200)
      const b = await locator.boundingBox()
      if (!b) throw new Error('看不见：' + name)
      const vp = page.viewportSize()
      const x0 = Math.max(0, b.x - pad), y0 = Math.max(0, b.y - pad)
      await page.screenshot({ path: path.join(OUT, `${name}${suffix}.png`), clip: { x: x0, y: y0, width: Math.min(vp.width, b.x + b.width + pad) - x0, height: Math.min(vp.height, Math.max(b.y + 1, b.y + Math.min(b.height, vp.height)) + pad) - y0 } })
    }
    // 悬停一行：指针停在行里没有键、没有字的一点（行左边内衬里），不碰行里的键。
    const hoverRow = async (locator) => {
      await locator.scrollIntoViewIfNeeded(); await sleep(150)
      const b = await locator.boundingBox()
      await page.mouse.move(b.x + 6, b.y + b.height / 2); await sleep(450)
    }
    const record = async (name) => { measures[`${name}${suffix}`] = await page.evaluate(measureRows, [ROWS, LISTS]) }
    await login(page, rig.base)

    // 先清空草稿卷，首页没有「接着做」
    await page.evaluate(async () => { const d = await (await fetch('/api/draft-papers/current?create=1')).json(); for (const it of d.draftPaper?.items || []) await fetch(`/api/draft-papers/${encodeURIComponent(d.draftPaper.id)}/items/${encodeURIComponent(it.id)}`, { method: 'DELETE' }) })

    await step('home', async () => {
      await page.goto(rig.base + '/'); await page.locator('.concierge-paper-list, .home-row-list').first().waitFor({ timeout: 20000 }).catch(() => {})
      await settle(page, 2000); await blur(); await park()
      await full('home-page')
      await record('home')
      if (await page.locator('.concierge-paper-list').count()) {
        await crop('home-recent', page.locator('.concierge-paper-list').first())
        await hoverRow(page.locator('.concierge-paper-row-head').first())
        await crop('home-recent-hover', page.locator('.concierge-paper-list').first())
        await park()
      }
      if (await page.locator('.home-row-list').count()) await crop('home-daily', page.locator('.home-row-list').last())
    })

    await step('add-draft', async () => { await addDraftItems(page) })

    await step('home-continue', async () => {
      await page.goto(rig.base + '/'); await page.locator('.home-row-list').first().waitFor({ timeout: 20000 })
      await settle(page, 2000); await blur(); await park()
      await full('home-continue-page')
      await crop('home-continue', page.locator('.home-row-list').first())
      await record('home-continue')
      await hoverRow(page.locator('.home-row').first())
      await crop('home-continue-hover', page.locator('.home-row-list').first())
      await park()
    })

    await step('home-results', async () => {
      const input = page.locator('.concierge-intent-input')
      await input.fill('2026 阅读'); await input.press('Enter'); await settle(page, 3000); await blur(); await park()
      await full('home-results-page')
      await crop('home-results-list', page.locator('.concierge-paper-list').first())
      await record('home-results')
      await hoverRow(page.locator('.concierge-paper-row-head').first())
      await crop('home-results-hover', page.locator('.concierge-paper-list').first())
      await park()
      await page.locator('.concierge-paper-row-head').first().click({ position: { x: 6, y: 20 } })
      await page.locator('.concierge-paper-row.is-expanded').first().waitFor({ timeout: 8000 }); await settle(page, 1500); await blur(); await park()
      await full('home-results-expanded-page')
      await crop('home-results-expanded', page.locator('.concierge-paper-list > li').first())
      await record('home-results-expanded')
      await hoverRow(page.locator('.concierge-group-row-line').last())
      await crop('home-results-expanded-hover', page.locator('.concierge-paper-list > li').first())
      await park()
    })

    await step('browse', async () => {
      await page.goto(rig.base + '/?view=browse'); await page.locator('.concierge-paper-row-head').first().waitFor({ timeout: 20000 })
      await settle(page, 2500); await blur(); await park()
      await full('browse-page')
      await crop('browse-list', page.locator('.concierge-paper-list').first())
      await record('browse')
      await hoverRow(page.locator('.concierge-paper-row-head').first())
      await crop('browse-hover', page.locator('.concierge-paper-list').first())
      await park()
      await page.locator('.concierge-paper-row-head').first().click({ position: { x: 6, y: 20 } })
      await page.locator('.concierge-paper-row.is-expanded').first().waitFor({ timeout: 8000 }); await settle(page, 1500); await blur(); await park()
      await crop('browse-expanded', page.locator('.concierge-paper-list > li').first())
      await record('browse-expanded')
      await hoverRow(page.locator('.concierge-group-row-line').first())
      await crop('browse-expanded-hover', page.locator('.concierge-paper-list > li').first())
      await park()
    })

    if (!FULL) {
      await step('my-space', async () => {
        await page.goto(rig.base + '/?view=my-space'); await settle(page, 2000); await blur(); await park()
        await full('my-space-page')
        await crop('my-space-list', page.locator('.my-space-file-list').first())
        await record('my-space')
        await page.locator('.my-space-file-row h3').first().hover(); await sleep(450)
        await crop('my-space-list-hover', page.locator('.my-space-file-list').first())
        await park()
      })

      await step('draft', async () => {
        await page.goto(rig.base + '/?view=draft-paper'); await page.locator('.draft-paper-col').first().waitFor({ timeout: 120000 })
        await settle(page, 4000); await blur(); await park()
        await full('draft-page')
      })
    }

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
