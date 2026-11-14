// 獭獭定稿状态图放进真实页面拍图（BRAND.md 第 117 条之后；Owner 2026-11-14 定界面里只留两处：个人空间空态、「没找到」）。
// 只拍图，不改网站代码：起本地测试站，截图时把图注入到页面上对应的位置再拍（§4.6 的老办法）。
// 每处拍两张：-without 是页面原样，-with 是注入獭獭后；再拼一张 -pair 并排，带标题。
// 另出 mascot/states/overview.png：五张新图 400 / 96 / 48 宽，白底和 #F1F5F7 底各一行。
//
// 用法：
//   先起站：INVENTORY_PORT_OFFSET=56 INVENTORY_SEED=full node scripts/component-inventory/rig.mjs
//   再拍：  node scripts/brand/states-in-pages.mjs [overview|pages|all]   （默认 all）
// 环境变量：STATES_BASE（默认 http://127.0.0.1:5355）、INVENTORY_CHROMIUM（chromium 路径）。
// 导出完成那一处会真的出一次 PDF，本地约一分钟多。
import { mkdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const BRAND = path.join(ROOT, 'design/brand-2026-10-13')
const MASCOT = path.join(BRAND, 'mascot')
const OUT = path.join(BRAND, 'evidence/states-2026-11-14')
const BASE = process.env.STATES_BASE || 'http://127.0.0.1:5355'
const OWNER = { username: 'owner', password: 'inventory-owner-pw-1' }
const MODE = process.argv[2] || 'all'

const { chromium } = createRequire(path.join(ROOT, 'app/package.json'))('playwright')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const svg = (rel) => readFileSync(path.join(MASCOT, rel), 'utf8')
const uri = (s) => `data:image/svg+xml;base64,${Buffer.from(s).toString('base64')}`
const pngUri = (buf) => `data:image/png;base64,${buf.toString('base64')}`

const FILES = [
  ['states/half-searching.svg', '找题中'],
  ['states/half-offer.svg', '递出结果'],
  ['states/half-not-found.svg', '没找到'],
  ['states/half-login.svg', '登录页探头'],
  ['otter-float.svg', '完成（仰躺抱石，眯眼）'],
]

// 半身图的水面：viewBox 从 y=12 起；水面条上沿 y=670（登录页 y=231）。
// 卡片边就是水面（第 31 条），所以只露水面条以上那一截，水面条和身体下沿的平切口藏在卡片边后面。
const HALF_ABOVE = (670 - 12) / 715 // ≈ 0.920
const LOGIN_ABOVE = (231 - 12) / 276 // ≈ 0.793

const browser = await chromium.launch({ executablePath: process.env.INVENTORY_CHROMIUM || '/opt/pw-browsers/chromium' })

async function overview() {
  const page = await browser.newPage({ viewport: { width: 2240, height: 600 }, deviceScaleFactor: 2 })
  const row = (bg, label) => `
    <section style="background:${bg};padding:24px 28px 20px;border-radius:8px;margin-bottom:16px">
      <div class="lab">${label}</div>
      <div class="r">${FILES.map(([f]) => `<figure><img src="${uri(svg(f))}" width="400"></figure>`).join('')}</div>
      <div class="r">${FILES.map(([f]) => `<figure><img src="${uri(svg(f))}" width="96"></figure>`).join('')}</div>
      <div class="r">${FILES.map(([f]) => `<figure><img src="${uri(svg(f))}" width="48"></figure>`).join('')}</div>
      <div class="r cap">${FILES.map(([f, n]) => `<figure>${f.replace('states/', 'states/')}<br><span>${n}</span></figure>`).join('')}</div>
    </section>`
  await page.setContent(`<style>
    body{margin:0;padding:28px;background:#fff;font:14px/1.5 system-ui,sans-serif;color:#191D18}
    h1{font-size:20px;margin:0 0 4px}p{margin:0 0 16px;color:#5A6C75}
    .lab{font-size:13px;color:#5A6C75;margin-bottom:12px}
    .r{display:grid;grid-template-columns:repeat(5,400px);gap:28px;align-items:end;margin-bottom:16px}
    figure{margin:0}.cap{align-items:start;font-size:13px}.cap span{color:#5A6C75}
    </style>
    <h1>獭獭 · 五张定稿新图（Owner 2026-11-14，BRAND.md 第 115–117 条）</h1>
    <p>每列一张：上 400 宽，中 96 宽，下 48 宽。文件都在 design/brand-2026-10-13/mascot/。</p>
    ${row('#FFFFFF;border:1px solid #E1E7EA', '白底 #FFFFFF')}${row('#F1F5F7', '页面底 #F1F5F7')}`)
  await page.screenshot({ path: path.join(MASCOT, 'states/overview.png'), fullPage: true })
  await page.close()
}

// ---------- 页面里注入 ----------

// 在页面坐标 (x, y) 放一张图，宽 w、高 h；clipH 给了就只露上面 clipH 那一截（下面藏在卡片边后面）。
async function overlay(page, { src, x, y, w, h, clipH }) {
  await page.evaluate(({ src, x, y, w, h, clipH }) => {
    const box = document.createElement('div')
    box.dataset.brandInject = 'otter'
    Object.assign(box.style, { position: 'absolute', left: `${x + scrollX}px`, top: `${y + scrollY}px`, width: `${w}px`, height: `${clipH ?? h}px`, overflow: 'hidden', zIndex: 5, pointerEvents: 'none' })
    const img = new Image(); img.src = src; img.width = w; img.height = h; img.alt = ''
    img.style.display = 'block'
    box.appendChild(img); document.body.appendChild(box)
    return img.decode()
  }, { src, x, y, w, h, clipH })
}

const rect = (page, sel) => page.locator(sel).first().evaluate((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, b: r.bottom, r: r.right } })

async function newPage({ ai = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'zh-CN', reducedMotion: 'reduce', acceptDownloads: true })
  if (ai) {
    // 找题加载中只在走 AI 时出现：假装服务器有 AI 密钥，AI 找题的请求一直不回，页面就停在「正在为…找题…」。
    await ctx.route('**/api/ai/status', (r) => r.fulfill({ json: { serverKeyAvailable: true } }))
    await ctx.route('**/api/ai/question-bank-steward', () => {})
  }
  const page = await ctx.newPage()
  return { ctx, page }
}

async function login(page) {
  await page.goto(BASE + '/'); await page.locator('#login-username').waitFor({ timeout: 30000 })
  await page.fill('#login-username', OWNER.username); await page.fill('#login-password', OWNER.password)
  await page.click('.login-submit'); await page.locator('.login-card').waitFor({ state: 'detached', timeout: 30000 })
}

async function search(page, q) {
  const input = page.locator('.concierge-intent-input:not([disabled])')
  await input.waitFor({ timeout: 60000 }); await sleep(300)
  await input.fill(q); await input.press('Enter')
}

const settle = async (page, ms = 800) => { await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {}); await sleep(ms) }

const shots = []
async function pair(page, name, title, note, injectFn) {
  await settle(page)
  const without = await page.screenshot()
  await injectFn()
  await sleep(300)
  const withShot = await page.screenshot()
  const { writeFileSync } = await import('node:fs')
  writeFileSync(path.join(OUT, `${name}-without.png`), without)
  writeFileSync(path.join(OUT, `${name}-with.png`), withShot)
  shots.push({ name, title, note, without, withShot })
}

async function pairSheet({ name, title, note, without, withShot }) {
  const page = await browser.newPage({ viewport: { width: 1520, height: 600 }, deviceScaleFactor: 2 })
  await page.setContent(`<style>body{margin:0;padding:24px;background:#fff;font:14px/1.5 system-ui,sans-serif;color:#191D18}
    h1{font-size:18px;margin:0 0 2px}p{margin:0 0 14px;color:#5A6C75}.g{display:grid;grid-template-columns:1fr 1fr;gap:16px}
    figure{margin:0}img{width:100%;display:block;border:1px solid #E1E7EA;border-radius:4px}figcaption{font-size:13px;color:#5A6C75;padding-top:6px}</style>
    <h1>${title}</h1><p>${note}</p>
    <div class="g"><figure><img src="${pngUri(withShot)}"><figcaption>放獭獭（${name}-with.png）</figcaption></figure>
    <figure><img src="${pngUri(without)}"><figcaption>不放獭獭（${name}-without.png）</figcaption></figure></div>`)
  await page.screenshot({ path: path.join(OUT, `${name}-pair.png`), fullPage: true })
  await page.close()
}

async function pages() {
  mkdirSync(OUT, { recursive: true })

  // 1 找题加载中 · half-searching · 不用（对照留档）
  {
    const { ctx, page } = await newPage({ ai: true })
    await login(page)
    await search(page, '适合高二的环保主题阅读')
    await page.locator('.concierge-loading').waitFor({ timeout: 15000 })
    await pair(page, '1-loading', '找题加载中 · half-searching · 不用 · 对照留档',
      '真页面状态：AI 找题等待中（AI 状态和找题接口在截图脚本里截住，请求一直不回）。獭獭 120 高（含水面条），居中放在「正在为…找题…」上面，在结果区里占位、把下面往下推。',
      async () => {
        await page.evaluate((src) => {
          const host = document.querySelector('.concierge-results')
          const wrap = document.createElement('div'); wrap.dataset.brandInject = 'otter'
          Object.assign(wrap.style, { display: 'flex', justifyContent: 'center', margin: '8px 0 12px' })
          const img = new Image(); img.src = src; img.height = 120; img.width = Math.round(120 * 494 / 715); img.alt = ''
          wrap.appendChild(img); host.prepend(wrap); return img.decode()
        }, uri(svg('states/half-searching.svg')))
      })
    await ctx.close()
  }

  // 2 结果卡上沿探头 · half-offer · 不用（对照留档）
  {
    const { ctx, page } = await newPage()
    await login(page)
    await search(page, '2024 新课标Ⅰ卷')
    await page.locator('.concierge-paper-list').first().waitFor({ timeout: 15000 })
    await pair(page, '2-offer', '结果卡上沿探头 · half-offer · 不用 · 对照留档',
      '真页面状态：搜「2024 新课标Ⅰ卷」，本地题库精确匹配出整卷结果卡。獭獭 150 高（第 30、31 条），靠右，离卡片右边 40px；只露水面以上约 138px，下沿压在卡片上边线上（卡片边就是水面）。页面没改间距。',
      async () => {
        const card = await rect(page, '.concierge-paper-list')
        const h = 150, w = Math.round(h * 494 / 715)
        const above = Math.round(h * HALF_ABOVE)
        await overlay(page, { src: uri(svg('states/half-offer.svg')), x: card.r - 40 - w, y: card.y - above, w, h, clipH: above })
      })
    await ctx.close()
  }

  // 3 没找到匹配 · half-not-found · 已定留
  {
    const { ctx, page } = await newPage()
    await login(page)
    await search(page, 'zzqx qqwv 呃呃呃 xkcd')
    await page.locator('.concierge-empty').waitFor({ timeout: 15000 })
    await pair(page, '3-not-found', '「没找到匹配」 · half-not-found · 已定留',
      '真页面状态：搜一串乱码，本地题库没有匹配（测试站没填 AI 密钥，所以上面一行是「没填 AI 密钥…」）。-without 是页面原样（一行灰字）；-with 照第 31 条把这行灰字做成卡片（卡片样式是注入的，页面里现在没有），獭獭 150 高居中探头，只露水面以上约 138px，卡片上沿就是水面。',
      async () => {
        await page.evaluate(() => {
          const p = document.querySelector('.concierge-empty')
          // 卡片样子照下面「最近上新」列表的白卡：白底、发丝边、12px 圆角。
          const list = document.querySelector('.concierge-paper-list') || p
          const cs = getComputedStyle(list)
          Object.assign(p.style, {
            background: cs.backgroundColor === 'rgba(0, 0, 0, 0)' ? '#fff' : cs.backgroundColor,
            border: cs.borderTopWidth !== '0px' ? `${cs.borderTopWidth} solid ${cs.borderTopColor}` : '1px solid #E1E7EA',
            borderRadius: cs.borderTopLeftRadius !== '0px' ? cs.borderTopLeftRadius : '12px',
            padding: '22px 24px', textAlign: 'center', marginTop: '150px', position: 'relative',
          })
        })
        await sleep(200)
        const card = await rect(page, '.concierge-empty')
        const h = 150, w = Math.round(h * 494 / 715)
        const above = Math.round(h * HALF_ABOVE)
        await overlay(page, { src: uri(svg('states/half-not-found.svg')), x: Math.round(card.x + card.w / 2 - w / 2), y: card.y - above, w, h, clipH: above })
      })
    await ctx.close()
  }

  // 4 导出完成 · otter-float · 不用（对照留档）
  {
    const { ctx, page } = await newPage()
    await login(page)
    await page.evaluate(async () => {
      const d = await (await fetch('/api/draft-papers/current?create=1')).json()
      if ((d.draftPaper?.items || []).length < 3) {
        for (const g of ['group-2026-i-reading-a', 'group-2026-i-reading-b', 'group-2026-i-reading-c']) {
          await fetch('/api/draft-papers/current/items', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ groupId: g }) })
        }
      }
    })
    await page.goto(BASE + '/?view=draft-paper'); await settle(page, 2500)
    await page.locator('header.topbar').getByRole('button', { name: '导出', exact: true }).click(); await sleep(400)
    await page.getByText(/^下载 PDF/).first().click()
    await page.locator('.draft-success').waitFor({ timeout: 240000 })
    await pair(page, '4-export-done', '导出完成 · otter-float · 不用 · 对照留档',
      '真页面状态：草稿卷真的出了一次 PDF，卷头下面出现「已下载：…pdf」。獭獭 112 宽、约 63 高，放在这行提示的右边，竖向和提示居中；卷面上不放。',
      async () => {
        const n = await page.locator('.draft-success').first().evaluate((e) => {
          const range = document.createRange(); range.selectNodeContents(e)
          const r = range.getBoundingClientRect(); const b = e.getBoundingClientRect()
          return { right: r.right, cy: b.y + b.height / 2 }
        })
        const w = 112, h = Math.round(w * 603 / 1071)
        await overlay(page, { src: uri(svg('otter-float.svg')), x: Math.round(n.right + 16), y: Math.round(n.cy - h / 2), w, h })
      })
    await ctx.close()
  }

  // 5 个人空间空态 · otter-sit · 已定留
  {
    const { ctx, page } = await newPage()
    // 测试站的个人空间本来就是空的；为了不受导出那一处影响，列表接口固定回空。
    await ctx.route(/\/api\/my-space(\?[^/]*)?$/, (r) => r.request().method() === 'GET' ? r.fulfill({ json: { folders: [], artifacts: [] } }) : r.fallback())
    await login(page)
    await page.goto(BASE + '/?view=my-space')
    await page.locator('.my-space-empty-state').waitFor({ timeout: 20000 })
    await pair(page, '5-my-space-empty', '个人空间空态 · otter-sit（坐石全身像，「空闲」） · 已定留',
      '真页面状态：个人空间没有文件。-with 把空态里原来的平涂插图换成坐石全身像，150×150（文件是方形 viewBox，画出来的部分约 144 高、112 宽），居中放在文案上面；图框下面加 10px，石头下沿到文案约 24px（原来插图到文案的空白目测相当）；其余不动。',
      async () => {
        await page.evaluate((src) => {
          const ill = document.querySelector('.my-space-empty-state .eqb-empty-ill')
          const img = new Image(); img.src = src; img.width = 150; img.height = 150; img.alt = ''; img.dataset.brandInject = 'otter'
          // 画出来的石头下沿离图框底约 2px；再加 10px，石头到文案的空白约 24px，和原来插图到文案的空白目测相当。
          img.style.display = 'block'; img.style.marginBottom = '10px'
          ill.replaceWith(img); return img.decode()
        }, uri(svg('otter-sit.svg')))
      })
    await ctx.close()
  }

  // 6 登录页 · half-login · 比较用，不用（对照留档）
  {
    const { ctx, page } = await newPage()
    await page.goto(BASE + '/'); await page.locator('.login-card').waitFor({ timeout: 30000 })
    // 现在的登录页雾海里有一只 v11 海獭；一屏一只，两张都把它藏起来，只比「放不放半身探头」。
    await page.addStyleTag({ content: '.login-otter-sway{visibility:hidden}' })
    await pair(page, '6-login', '登录页探头 · half-login · 比较用 · 不用 · 对照留档',
      '比较用，不是定了的：现在的登录页用 08 雾海，雾里有一只 v11 海獭（两张都藏掉了它）。登录卡片没有底色和边，上沿就是大标题；獭獭 128 高（含水面条），左边和标题对齐，水面条下沿离标题 16px，露出自己的水面条当水面。',
      async () => {
        const h1 = await rect(page, '.login-card h1')
        const h = 128, w = Math.round(h * 494 / 276)
        await overlay(page, { src: uri(svg('states/half-login.svg')), x: Math.round(h1.x - w * (308 - 294) / 494), y: Math.round(h1.y - 16 - h), w, h })
      })
    await ctx.close()
  }

  for (const s of shots) await pairSheet(s)
}

try {
  if (MODE === 'overview' || MODE === 'all') await overview()
  if (MODE === 'pages' || MODE === 'all') await pages()
} finally {
  await browser.close()
}
