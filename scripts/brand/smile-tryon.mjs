#!/usr/bin/env node
// 獭獭「开心一点」F 腮帮 × 三档眼睛 · 放进真实页面试穿（design/brand-2026-10-13/image-review-2026-11-14/smile-F-tryon/）。对比稿 · 提案 · 单一来源。
//
// 做什么：起本地网站（照 scripts/component-inventory/rig.mjs），打开真实页面，只在截图前把 img 的地址换成对比稿，
// 拍顶栏、登录页、个人空间空态，再拼一张手机上能看的总图。不改 app/、mascot/、logo/ 下任何文件；
// 换图只发生在无头浏览器里，网站源码和母版一个字节都不动。
// 四个版本：改之前的母版（从提交 9a4766de9 读）、F 眼睛 1.00、F 眼睛 1.10、F 眼睛 1.20（对比稿在 ../smile-F-with-eyes/svg/）。
//
// 用法：node scripts/brand/smile-tryon.mjs
// 端口：端口偏移默认 45（网页 5344、接口 9957）；结束时只删自己的临时数据 .scratch/component-inventory/rigdata-45。
// 输出：<OUT>/topbar-*.png、login-*.png、empty-*.png、large-*.png、compare-in-pages.png、shots.json
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const B = 'design/brand-2026-10-13'
const DRAFTS = `${B}/image-review-2026-11-14/smile-F-with-eyes/svg`
const OUT = path.join(ROOT, B, 'image-review-2026-11-14/smile-F-tryon')
mkdirSync(OUT, { recursive: true })

if (!process.env.INVENTORY_PORT_OFFSET) process.env.INVENTORY_PORT_OFFSET = '45'
const { requireFromApp, RAW } = await import('../component-inventory/lib.mjs')
const { startRig, OWNER } = await import('../component-inventory/rig.mjs')
const { chromium } = requireFromApp('playwright')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const rd = (p) => readFileSync(path.join(ROOT, p), 'utf8')
const svgUrl = (s) => 'data:image/svg+xml;base64,' + Buffer.from(s).toString('base64')
const pngUrl = (buf) => 'data:image/png;base64,' + Buffer.from(buf).toString('base64')
const save = (name, buf) => writeFileSync(path.join(OUT, name), buf)

// 基准列「改之前的母版」：Owner 已批准把母版改成 F，工作区里的母版会变，所以基准从提交 BASE_COMMIT 里读，
// 而且基准列也换图（不用网站正在发的 /brand/mark.svg），四列走同一条路。
const BASE_COMMIT = '9a4766de9'
const fromGit = (p) => execFileSync('git', ['show', `${BASE_COMMIT}:${p}`], { cwd: ROOT, encoding: 'utf8' })
const VERSIONS = [
  { key: 'before', label: '改之前的母版', mark: `${B}/logo/mint/mark.svg`, head: `${B}/mascot/otter-head.svg`, git: true },
  ...['1.00', '1.10', '1.20'].map((e) => ({ key: `F-eyes${e}`, label: `F · 眼睛 ${e}`, mark: `${DRAFTS}/mark-F-eyes${e}.svg`, head: `${DRAFTS}/head-F-eyes${e}.svg` })),
]
for (const v of VERSIONS) { const get = v.git ? fromGit : rd; v.markUrl = svgUrl(get(v.mark)); v.headUrl = svgUrl(get(v.head)) }

const browser = await chromium.launch({ channel: 'chromium' })
const DESK_FALLBACK = '#F1F5F7'
async function sheet(html, file, width) {
  const c = await browser.newContext({ viewport: { width, height: 800 }, deviceScaleFactor: 1 })
  const p = await c.newPage()
  await p.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;padding:16px;background:#fff;font:14px/1.5 "WenQuanYi Zen Hei",sans-serif;color:#29424D}
    h1{font-size:18px;font-weight:600;margin:0 0 6px} p.n{margin:0 0 12px;color:#5A6C75}
    .row{margin:0 0 18px} .lab{font-size:15px;font-weight:600;margin:0 0 4px}
    img{display:block} .z{image-rendering:pixelated} .flex{display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap}
    .cap{font-size:12px;color:#5A6C75;margin:2px 0 0} .box{outline:1px solid #DCE6EB}
  </style></head><body>${html}</body></html>`)
  await p.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {}))))
  await p.screenshot({ path: path.join(OUT, file), fullPage: true })
  await c.close()
}
// 截图是物理像素；在 1x 的图板上用 natural 宽高摆就是原尺寸，乘 z 就是逐像素放大
const sz = async (buf) => { const p = await lab.evaluate(async (u) => { const i = new Image(); i.src = u; await i.decode(); return [i.naturalWidth, i.naturalHeight] }, pngUrl(buf)); return p }
const lab = await (await browser.newContext()).newPage()
const imgTag = async (buf, z = 1, cls = '') => { const [w, h] = await sz(buf); return `<img class="${z > 1 ? 'z' : ''} ${cls}" src="${pngUrl(buf)}" width="${w * z}" height="${h * z}">` }

const log = { note: '本地网站（rig.mjs，端口偏移 ' + process.env.INVENTORY_PORT_OFFSET + '），owner 账号，测试数据，减少动态效果。换图只在无头浏览器里改 img 的 src，源码和母版不动。', shots: {} }
const shots = {} // key -> {topbarStrip, topbarMark, loginPage, loginCrop, empty, large}
const rig = await startRig({ quiet: true })
const base = rig.base
try {
  const login = async (p) => {
    await p.goto(base + '/'); await p.locator('#login-username').waitFor({ timeout: 30000 })
    await p.locator('#login-username').fill(OWNER.username); await p.locator('#login-password').fill(OWNER.password)
    await p.locator('.login-submit').click(); await p.locator('.login-card').waitFor({ state: 'detached', timeout: 30000 })
    await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {}); await sleep(800)
  }
  const ctxOpts = (dpr) => ({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: dpr, locale: 'zh-CN', reducedMotion: 'reduce' })

  // ---- 1x 现状（只拍一次）：1x 屏顶栏用的是逐格画的 mark-32.png，对比稿不管这张
  {
    const c = await browser.newContext(ctxOpts(1)); const p = await c.newPage()
    await login(p); await p.goto(base + '/'); await p.waitForLoadState('networkidle').catch(() => {}); await sleep(1000)
    const tb = await p.locator('header.topbar').boundingBox()
    const im = p.locator('img.topbar-brand-mark'); const r = await im.boundingBox()
    shots.cur1x = {
      strip: await p.screenshot({ clip: { x: tb.x, y: tb.y, width: tb.width, height: tb.height } }),
      mark: await p.screenshot({ clip: { x: r.x - 8, y: r.y - 8, width: r.width + 16, height: r.height + 16 } }),
      src: (await im.evaluate((e) => e.currentSrc)).replace(base, ''),
    }
    save('topbar-1x-current-strip.png', shots.cur1x.strip); save('topbar-1x-current-mark.png', shots.cur1x.mark)
    log.shots['topbar-1x-current'] = { currentSrc: shots.cur1x.src, topbarCss: tb, markCss: r }
    await c.close()
  }

  // ---- 2x：顶栏、登录页、个人空间空态、大尺寸
  const c = await browser.newContext(ctxOpts(2)); const p = await c.newPage()
  // 登录页（未登录）：左上角 .login-brand img，24×24 框里 contain
  await p.goto(base + '/'); await p.locator('.login-card').waitFor({ timeout: 30000 }); await sleep(1500)
  for (const v of VERSIONS) {
    const s = (shots[v.key] ||= {})
    const img = p.locator('.login-brand img')
    await img.evaluate((e, u) => { e.src = u }, v.markUrl); await sleep(200)
    const src = (await img.evaluate((e) => e.currentSrc)).slice(0, 60).replace(base, '')
    s.loginPage = await p.screenshot({ fullPage: false })
    // .login-brand 是撑满一行的 flex，按里面内容（标志加字）的实际范围裁
    const r = await p.locator('.login-brand').evaluate((e) => { const g = document.createRange(); g.selectNodeContents(e); const b = g.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height } })
    s.loginCrop = await p.screenshot({ clip: { x: r.x - 8, y: r.y - 8, width: r.width + 16, height: r.height + 16 } })
    save(`login-page-${v.key}-2x.png`, s.loginPage); save(`login-crop-${v.key}-2x.png`, s.loginCrop)
    ;(log.shots[v.key] ||= {}).login = { imgSrc: src, brandCss: r, imgCss: await img.boundingBox() }
  }
  // 顶栏（登录后首页）：2x 屏现网走 srcset 里的 mark.svg
  await login(p); await p.goto(base + '/'); await p.waitForLoadState('networkidle').catch(() => {}); await sleep(1200)
  {
    const tbImg = p.locator('img.topbar-brand-mark')
    log.topbar2xRealSrc = (await tbImg.evaluate((e) => e.currentSrc)).replace(base, '')
    for (const v of VERSIONS) {
      const s = shots[v.key]
      await tbImg.evaluate((e, u) => { e.removeAttribute('srcset'); e.src = u }, v.markUrl); await sleep(200)
      const tb = await p.locator('header.topbar').boundingBox(); const r = await tbImg.boundingBox()
      s.topbarStrip = await p.screenshot({ clip: { x: tb.x, y: tb.y, width: tb.width, height: tb.height } })
      s.topbarMark = await p.screenshot({ clip: { x: r.x - 8, y: r.y - 8, width: r.width + 16, height: r.height + 16 } })
      const t = await p.locator('.topbar-brand-title').boundingBox()
      s.topbarCrop = await p.screenshot({ clip: { x: r.x - 8, y: tb.y + 12, width: t.x + t.width + 8 - (r.x - 8), height: tb.height - 24 } })
      save(`topbar-strip-${v.key}-2x.png`, s.topbarStrip); save(`topbar-mark-${v.key}-2x.png`, s.topbarMark)
      log.shots[v.key].topbar = { imgSrc: (await tbImg.evaluate((e) => e.currentSrc)).slice(0, 60).replace(base, ''), topbarCss: tb, markCss: r }
    }
  }
  // 个人空间空态：现网是 88px 的平涂图标插图，没有獭獭；临时换成头像试穿
  await p.goto(base + '/?view=my-space'); await p.waitForLoadState('networkidle').catch(() => {}); await sleep(1500)
  if (await p.locator('.eqb-empty-ill').count()) {
    await p.locator('.eqb-empty-ill').first().evaluate((e) => { const i = document.createElement('img'); i.id = 'smile-try'; i.width = 88; i.height = 88; i.style.display = 'block'; e.replaceWith(i) })
    // 大尺寸：页面标题「个人空间 / 已保存的 PDF」左边插一个 160px 头像，底色就是页面本来的底色
    await p.locator('.my-space-heading').evaluate((h) => {
      const row = document.createElement('div'); row.id = 'smile-large-row'; row.style.cssText = 'display:flex;align-items:center;gap:24px'
      const i = document.createElement('img'); i.id = 'smile-large'; i.width = 160; i.height = 160; i.style.display = 'block'
      h.parentNode.insertBefore(row, h); row.appendChild(i); row.appendChild(h)
    })
    log.deskBg = await p.evaluate(() => { for (let e = document.querySelector('#smile-large-row'); e; e = e.parentElement) { const b = getComputedStyle(e).backgroundColor; if (b && b !== 'rgba(0, 0, 0, 0)') return { el: e.className || e.tagName, bg: b } } return null })
    for (const v of VERSIONS) {
      const s = shots[v.key]
      await p.locator('#smile-try').evaluate((e, u) => { e.src = u }, v.headUrl)
      await p.locator('#smile-large').evaluate((e, u) => { e.src = u }, v.headUrl); await sleep(250)
      const card = await p.locator('#smile-try').evaluate((e) => { const b = e.parentElement.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height } })
      s.empty = await p.screenshot({ clip: { x: card.x + card.width / 2 - 170, y: card.y - 8, width: 340, height: Math.min(card.height + 16, 240) } })
      const row = await p.locator('#smile-large-row').boundingBox()
      s.large = await p.screenshot({ clip: { x: row.x - 16, y: row.y - 16, width: 400, height: row.height + 32 } })
      save(`empty-88-${v.key}-2x.png`, s.empty); save(`large-160-${v.key}-2x.png`, s.large)
      log.shots[v.key].empty = { cardCss: card }; log.shots[v.key].large = { rowCss: row }
    }
  } else log.emptyNote = '没拍到：个人空间没有出现空态'
  await c.close()
} finally {
  await rig.stop()
  rmSync(path.join(RAW, `rigdata-${process.env.INVENTORY_PORT_OFFSET}`), { recursive: true, force: true })
}
writeFileSync(path.join(OUT, 'shots.json'), JSON.stringify(log, null, 1) + '\n')

// ---- 图板
const L = (v) => `<div class="lab">${v.label}</div>`
{ // 顶栏
  let h = `<h1>顶栏 · 2x 屏（现网 2x 用 mark.svg）· 四个版本</h1><p class="n">每版：整条顶栏原尺寸（物理像素）；下面是标志的 4 倍逐像素放大。对比稿 · 提案 · 单一来源。</p>`
  for (const v of VERSIONS) h += `<div class="row">${L(v)}${await imgTag(shots[v.key].topbarStrip, 1, 'box')}<div style="height:6px"></div>${await imgTag(shots[v.key].topbarMark, 4)}</div>`
  h += `<h1 style="margin-top:28px">1x 屏现状（只放一次）</h1><p class="n">1x 屏顶栏用的是逐格画的 ${shots.cur1x.src}，F 对比稿没改它；下面是整条顶栏原尺寸和标志 8 倍放大。</p>`
  h += `<div class="row">${await imgTag(shots.cur1x.strip, 1, 'box')}<div style="height:6px"></div>${await imgTag(shots.cur1x.mark, 8)}</div>`
  await sheet(h, 'topbar-compare.png', 2920)
}
{ // 登录页
  let h = `<h1>登录页左上角标志 · 2x 屏 · 四个版本</h1><p class="n">每版：标志和字的原尺寸截图（物理像素），右边 4 倍逐像素放大。整页截图另存 login-page-*-2x.png。</p>`
  for (const v of VERSIONS) h += `<div class="row">${L(v)}<div class="flex">${await imgTag(shots[v.key].loginCrop)}${await imgTag(shots[v.key].loginCrop, 4)}</div></div>`
  await sheet(h, 'login-compare.png', 1500)
}
{ // 空态和大尺寸
  let h = `<h1>个人空间 · 试穿（2x 屏，原尺寸）</h1><p class="n">现网空态没有獭獭，是平涂图标插图；这里临时把它换成 88px 头像，另在页面标题左边临时插一个 160px 头像，底色是页面本来的底色。只为看表情，不是改版方案。</p>`
  for (const v of VERSIONS) h += `<div class="row">${L(v)}<div class="flex">${shots[v.key].empty ? await imgTag(shots[v.key].empty) : ''}${shots[v.key].large ? await imgTag(shots[v.key].large) : ''}</div></div>`
  await sheet(h, 'empty-large-compare.png', 1700)
}
{ // 手机总图：一版一块，字放大；顶栏左段放大 2 倍、登录页左上角放大 3 倍（都是 2x 屏截图），160px 头像原尺寸
  let h = `<style>body{font-size:24px} h1{font-size:34px} p.n{font-size:22px} .lab{font-size:32px;margin:0 0 8px} .cap{font-size:20px} .row{padding:0 0 22px;margin:0 0 22px;border-bottom:2px solid #DCE6EB}</style>`
  h += `<h1>F 腮帮 × 三档眼睛 · 放进真实页面</h1><p class="n">2x 屏截图。每版三张：顶栏左段（放大 2 倍）、登录页左上角（放大 3 倍）、个人空间标题旁的 160px 头像（原尺寸，临时试穿，现网没有）。对比稿 · 提案 · 单一来源。</p>`
  for (const v of VERSIONS) {
    const s = shots[v.key]
    h += `<div class="row">${L(v)}<div class="flex" style="align-items:flex-end"><div>${await imgTag(s.topbarCrop, 2, 'box')}<div class="cap">顶栏 ×2</div></div><div>${await imgTag(s.loginCrop, 3, 'box')}<div class="cap">登录页 ×3</div></div></div><div style="height:10px"></div>${s.large ? `${await imgTag(s.large, 1, 'box')}<div class="cap">160px 头像 · 原尺寸</div>` : ''}</div>`
  }
  await sheet(h, 'compare-in-pages.png', 1000)
}
await browser.close()
console.log('写到', path.relative(ROOT, OUT))
process.exit(0)
