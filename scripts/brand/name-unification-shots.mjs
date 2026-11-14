#!/usr/bin/env node
// 界面产品名换成「獭石」的改前改后对照（清点清单 design/brand-2026-10-13/name-unification-2026-11-14.md 的 U1、U3–U10）。
// 拍：登录页整页、登录页左上角品牌字特写、首页顶栏、子页（整卷浏览）顶栏、两个学生扫码页（听生词、默写）顶部；
// 每页记下 document.title、品牌字的原文和实算样式、相关读屏文字。宽屏 1440 和窄屏 390，DPR 2，减弱动效。
//
// 做法照 scripts/component-inventory/decisions-d-shots.mjs 和 scripts/brand/name-fitting-shots.mjs：
// 用 rig.mjs 起临时数据库加 Vite 的本地网站，用 owner 账号登录。不改 DOM 里的文字，拍的就是源码现在的样子。
// 扫码页的数据：清点用的本地网站没有词汇课程，照 vocab-review-shots.mjs 的办法，用仓库自带的
// scripts/vocabulary/import-calibration-program.mjs 把校准课程导进这次临时的数据库（rigdata-42/qb.sqlite），
// 再走正常接口：建学生（没有时）、过两个词都记「不认识」、生成固定生词组、公开分享（听生词页），
// 用这个生词组建听写任务并分享（默写页）。不碰仓库里的数据库。
//
// 用法：node scripts/brand/name-unification-shots.mjs before|after
//   INVENTORY_PORT_OFFSET=42（默认 42，网页 5341、接口 9954），和别的清点网站错开
// 输出：design/brand-2026-10-13/name-unification-2026-11-14/<before|after>/*.png 和 shots.json；
//       after 时另在 compare/ 下生成每张图的左右并排对比图（左改前、右改后）。
if (!process.env.INVENTORY_PORT_OFFSET) process.env.INVENTORY_PORT_OFFSET = '42'
const { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } = await import('node:fs')
const { spawnSync } = await import('node:child_process')
const path = (await import('node:path')).default
const { RAW, ROOT, requireFromApp } = await import('../component-inventory/lib.mjs')
const { startRig } = await import('../component-inventory/rig.mjs')
const { login, settle, sleep } = await import('../component-inventory/scenarios.mjs')

const label = process.argv[2]
if (!['before', 'after'].includes(label)) { console.error('用法：node scripts/brand/name-unification-shots.mjs before|after'); process.exit(2) }
const OFF = Number(process.env.INVENTORY_PORT_OFFSET || 0)
const RIGDATA = path.join(RAW, OFF ? `rigdata-${OFF}` : 'rigdata')
const BASE_OUT = path.join(ROOT, 'design/brand-2026-10-13/name-unification-2026-11-14')
const OUT = path.join(BASE_OUT, label)
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true })

const SUB_PAGE = '/?view=paper-browse&paperId=paper-2026-i'
const WIDTHS = [[1440, 900], [390, 844]]

// 找一个元素：原文、实算样式、框；没找到就记下没找到。
function inspect(sel) {
  const els = [...document.querySelectorAll(sel)]
  const vis = els.filter((e) => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden')
  const e = vis[0] || els[0]
  if (!e) return { selector: sel, found: false }
  const cs = getComputedStyle(e), r = e.getBoundingClientRect()
  return {
    selector: sel, found: true, visible: vis.length > 0, text: e.textContent.trim(),
    ariaLabel: e.getAttribute('aria-label'),
    font: `${cs.fontSize}/${cs.fontWeight}`, letterSpacing: cs.letterSpacing,
    box: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
  }
}
const mainLabel = () => document.querySelector('main.workbench')?.getAttribute('aria-label') ?? null

async function clip(page, locator, file, { padX = 0, padY = 0, fullWidth = false, maxW = null } = {}) {
  const b = await locator.boundingBox().catch(() => null)
  if (!b) return false
  const vp = page.viewportSize()
  const x0 = fullWidth ? 0 : Math.max(0, b.x - padX), y0 = Math.max(0, b.y - padY)
  let x1 = fullWidth ? vp.width : Math.min(vp.width, b.x + b.width + padX)
  if (maxW) x1 = Math.min(x1, x0 + maxW)
  const y1 = Math.min(vp.height, b.y + b.height + padY)
  await page.screenshot({ path: path.join(OUT, file), clip: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } })
  return true
}

// 造扫码页要的数据：在已登录的页面里走正常接口。返回两个分享号。
async function seedShares(page) {
  return page.evaluate(async () => {
    const j = async (url, init = {}) => {
      const r = await fetch(url, { ...init, headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}) } })
      const b = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(`${init.method || 'GET'} ${url} ${r.status} ${JSON.stringify(b).slice(0, 200)}`)
      return b
    }
    const programs = (await j('/api/vocabulary/programs')).programs || []
    if (!programs.length) throw new Error('没有词汇课程')
    const programId = programs[0].id
    let student = ((await j('/api/vocabulary/students')).students || [])[0]
    if (!student) student = (await j('/api/vocabulary/students', { method: 'POST', body: JSON.stringify({ displayName: '截图用学生' }) })).student
    const program = (await j(`/api/vocabulary/programs/${encodeURIComponent(programId)}`)).program
    let run = (await j('/api/vocabulary/review-runs', { method: 'POST', body: JSON.stringify({ studentId: student.id, programId, mode: 'main', targetUnfamiliarCount: 2 }) })).reviewRun
    for (let i = 0; i < 10 && run.status === 'active'; i++) {
      const entry = program.entries[run.cursor]
      run = (await j(`/api/vocabulary/review-runs/${encodeURIComponent(run.id)}/decision`, { method: 'PATCH', body: JSON.stringify({ entryId: entry.id, verdict: 'unfamiliar' }) })).reviewRun
    }
    const set = (await j(`/api/vocabulary/review-runs/${encodeURIComponent(run.id)}/freeze`, { method: 'POST', body: '{}' })).vocabularySet
    const share = (await j(`/api/vocabulary/sets/${encodeURIComponent(set.id)}/share`, { method: 'POST' })).share
    const task = (await j('/api/vocabulary/dictation-tasks', { method: 'POST', body: JSON.stringify({ studentId: student.id, programId, sourceSetIds: [set.id], title: '截图用听写', accent: 'american', share: true }) })).task
    let dictationShare = task.share?.shareId
    if (!dictationShare) dictationShare = (await j(`/api/vocabulary/dictation-tasks/${encodeURIComponent(task.id)}/share`, { method: 'POST' })).share.shareId
    return { listen: share.shareId, dictation: dictationShare, words: set.entries.map((e) => e.headword) }
  })
}

const { chromium } = requireFromApp('playwright')
const rig = await startRig({ quiet: true })
const record = { label, date: new Date().toISOString(), site: rig.base, pages: {}, shots: [], missing: [], errors: [] }
const imported = spawnSync('node', ['scripts/vocabulary/import-calibration-program.mjs', '--publish'],
  { cwd: ROOT, env: { ...process.env, QUESTION_BANK_DB: path.join(RIGDATA, 'qb.sqlite') }, encoding: 'utf8' })
if (imported.status !== 0) record.missing.push(`导入校准课程失败：${(imported.stderr || '').slice(-300)}`)
const browser = await chromium.launch({ executablePath: process.env.INVENTORY_CHROMIUM || '/opt/pw-browsers/chromium' })
let shares = null
try {
  for (const [width, height] of WIDTHS) {
    const w = `w${width}`
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, locale: 'zh-CN', reducedMotion: 'reduce' })
    const page = await context.newPage()
    page.on('pageerror', (e) => record.errors.push(`${w}: ${String(e).slice(0, 200)}`))
    const park = async () => { await page.mouse.move(2, height - 2); await sleep(200) }
    const step = async (name, fn) => {
      try { await fn() } catch (e) {
        record.missing.push(`${name}-${width}: ${String(e).split('\n')[0].slice(0, 200)}`)
        await page.screenshot({ path: path.join(OUT, `missing-${name}-${width}.png`) }).catch(() => {})
      }
    }
    const shot = async (file, ok) => { if (ok) record.shots.push(file); else record.missing.push(`${file}: 没找到要拍的元素`) }

    // 1. 登录页（不登录）
    await step('login', async () => {
      await page.goto(rig.base + '/'); await page.locator('.login-card').waitFor({ timeout: 30000 }); await settle(page, 1500); await park()
      record.pages[`login-${w}`] = { title: await page.title(), brand: await page.evaluate(inspect, '.login-brand > span') }
      await page.screenshot({ path: path.join(OUT, `login-full-${width}.png`), fullPage: true }); record.shots.push(`login-full-${width}.png`)
      await shot(`login-brand-${width}.png`, await clip(page, page.locator('.login-brand').first(), `login-brand-${width}.png`, { padX: 24, padY: 16, maxW: 320 }))
    })

    // 2. 首页顶栏
    await step('home', async () => {
      await login(page, rig.base)
      await page.goto(rig.base + '/'); await page.locator('header.topbar').waitFor({ timeout: 30000 }); await settle(page, 1500); await park()
      record.pages[`home-${w}`] = { title: await page.title(), brand: await page.evaluate(inspect, 'header.topbar .topbar-brand-title'), mainAriaLabel: await page.evaluate(mainLabel) }
      await shot(`home-topbar-${width}.png`, await clip(page, page.locator('header.topbar').first(), `home-topbar-${width}.png`, { fullWidth: true }))
    })

    // 3. 子页顶栏（整卷浏览，品牌字后面接「· 卷名」）
    await step('sub', async () => {
      await page.goto(rig.base + SUB_PAGE); await page.locator('header.topbar-sub').waitFor({ timeout: 30000 }); await settle(page, 2500); await park()
      record.pages[`sub-${w}`] = {
        page: SUB_PAGE, title: await page.title(), brand: await page.evaluate(inspect, 'header.topbar .topbar-brand-title'),
        identity: await page.evaluate(inspect, 'header.topbar .topbar-identity'), mainAriaLabel: await page.evaluate(mainLabel),
      }
      await shot(`sub-topbar-${width}.png`, await clip(page, page.locator('header.topbar').first(), `sub-topbar-${width}.png`, { fullWidth: true }))
    })

    // 4. 造数据（只造一次，两种宽度共用）
    if (!shares && !record.missing.some((m) => m.startsWith('导入校准课程失败'))) {
      await step('seed', async () => { shares = await seedShares(page); record.shares = shares })
    }

    // 5. 两个学生扫码页（公开页，不用登录）
    for (const [name, url, header] of [
      ['listen', shares && `/vocabulary/listen/${encodeURIComponent(shares.listen)}`, '.vocabulary-listen-header'],
      ['dictation', shares && `/vocabulary/dictation/${encodeURIComponent(shares.dictation)}`, '.vocabulary-dictation-header'],
    ]) {
      if (!url) { record.missing.push(`${name}-top-${width}.png: 没有分享号（造数据失败，见上）`); continue }
      await step(name, async () => {
        await page.goto(rig.base + url); await page.locator(header).waitFor({ timeout: 30000 }); await settle(page, 1500); await park()
        record.pages[`${name}-${w}`] = { page: url, title: await page.title(), link: await page.evaluate(inspect, `${header} > a`) }
        await shot(`${name}-top-${width}.png`, await clip(page, page.locator(header).first(), `${name}-top-${width}.png`, { fullWidth: true, padY: 12 }))
      })
    }
    await context.close()
  }

  // after：左右并排对比图
  if (label === 'after') {
    const CMP = path.join(BASE_OUT, 'compare')
    rmSync(CMP, { recursive: true, force: true }); mkdirSync(CMP, { recursive: true })
    const beforeDir = path.join(BASE_OUT, 'before')
    const uri = (f) => 'data:image/png;base64,' + readFileSync(f).toString('base64')
    const names = record.shots.filter((f) => existsSync(path.join(beforeDir, f)))
    record.compare = []
    for (const f of names) {
      const full = f.startsWith('login-full-')
      const is390 = f.endsWith('-390.png')
      // 整页图按一半显示（原图是 2 倍），特写按原大（CSS 像素）显示。
      const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>
body{margin:0;background:#f4f1ea;color:#1f1d1a;font:14px/1.5 Inter,"PingFang SC",sans-serif}
.wrap{display:flex;gap:24px;padding:16px;align-items:flex-start;width:max-content}
.col{display:flex;flex-direction:column;gap:6px}
.h{font-size:12px;color:#6b665e}
img{display:block;border:1px solid #d8d2c6;background:#fff}
</style></head><body><div class="wrap">
<div class="col"><div class="h">改前 · ${f}</div><img id="a" src="${uri(path.join(beforeDir, f))}"></div>
<div class="col"><div class="h">改后 · ${f}</div><img id="b" src="${uri(path.join(OUT, f))}"></div>
</div><script>for (const i of document.images) i.onload = () => { i.style.width = (i.naturalWidth / 2 * ${full ? (is390 ? 0.8 : 0.6) : 1}) + 'px' }</script></body></html>`
      const ctx = await browser.newContext({ viewport: { width: 1200, height: 200 }, deviceScaleFactor: 2, reducedMotion: 'reduce' })
      const page = await ctx.newPage()
      await page.setContent(html, { waitUntil: 'load' })
      await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode()))); await sleep(100)
      const out = f.replace(/\.png$/, '-compare.png')
      await page.locator('.wrap').screenshot({ path: path.join(CMP, out) })
      record.compare.push(out)
      await ctx.close()
    }
    const lack = record.shots.filter((f) => !names.includes(f))
    if (lack.length) record.missing.push(`改前没有对应图，没出对比：${lack.join('、')}`)
  }
} finally {
  await browser.close()
  await rig.stop()
}
writeFileSync(path.join(OUT, 'shots.json'), JSON.stringify(record, null, 1) + '\n')
console.log(`${label}：拍了 ${record.shots.length} 张，没拍到 ${record.missing.length} 项，页面报错 ${record.errors.length} 条`)
for (const m of record.missing) console.log('  没拍到', m)
for (const [k, v] of Object.entries(record.pages)) console.log(' ', k, 'title=', JSON.stringify(v.title), 'brand=', JSON.stringify(v.brand?.text ?? v.link?.text ?? null))
process.exit(0)
