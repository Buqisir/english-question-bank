#!/usr/bin/env node
// 生态物件 · 出对比图（对比稿，提案 · 单一来源，2026-11-14）。第一、二、三轮共用这一个脚本。
//
// 做什么：读 ecosystem-<轮次>/svg/ 下手写的物件 SVG（viewBox 0 0 240 240，240 = 獭獭头宽 1.0），
// 出三张图：
//   sheet.png      全套总图：浅雾底 #F1F5F7 和白底各一排；每样三个格子：160px 原框、48px 原框、48px 贴边裁
//   with-otter.png 全套按相对大小和獭獭头像（mascot/otter-head.svg）摆在同一条底线上
//   mono.png       全套转成墨色剪影，只看轮廓认不认得出
//   compare.png    （只有第二轮）石头三档颜色并排比、气泡两版并排比
//   redo-compare.png          （只有第三轮）敲开的蛤、海胆：第二轮和本轮候选并排，160px、48px、48px 剪影
//   stone-recolor/compare.png （只有第三轮）獭獭插画里墨色石子改石色的副本，改前改后并排
// 第三轮的 svg/ 只放重画的物件，总图里其余物件从 ecosystem-round2/svg/ 原样带上。
// 物件 SVG 和母版都只读，不改。
//
// 用法：node scripts/brand/ecosystem-sheet.mjs [round1|round2|round3]   不写参数就是 round1
// 输出：design/brand-2026-10-13/image-review-2026-11-14/ecosystem-<轮次>/ 下的 PNG
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const ROUND = process.argv[2] || 'round1'
if (!['round1', 'round2', 'round3'].includes(ROUND)) throw new Error(`不认识的轮次：${ROUND}（只有 round1、round2、round3）`)
const ROUND_NAME = { round1: '第一轮', round2: '第二轮', round3: '第三轮' }[ROUND]
const OUT = path.join(ROOT, `design/brand-2026-10-13/image-review-2026-11-14/ecosystem-${ROUND}`)
const SVG_DIR = path.join(OUT, 'svg')
const REVIEW = path.join(ROOT, 'design/brand-2026-10-13/image-review-2026-11-14')
const R2_SVG = path.join(REVIEW, 'ecosystem-round2/svg')
// 第三轮：本轮重画过的从本轮 svg/ 读，没重画的从第二轮 svg/ 读
const svgPath = (file) => (ROUND === 'round3' && !existsSync(path.join(SVG_DIR, `${file}.svg`)) ? path.join(R2_SVG, `${file}.svg`) : path.join(SVG_DIR, `${file}.svg`))
const OTTER_PATH = path.join(ROOT, 'design/brand-2026-10-13/mascot/otter-head.svg')
const requireFromApp = createRequire(path.join(ROOT, 'app/package.json'))
const { chromium } = requireFromApp('playwright')

// 顺序就是总图里的顺序：先石头（最要紧），再贝类，再别的
const ITEMS = [
  ['stone-otter', '獭獭的石头'],
  ['stone-long', '石头 · 扁长卵'],
  ['stone-round', '石头 · 圆墩'],
  ['stone-flat', '石头 · 小扁片'],
  ['clam', '蛤'],
  ['clam-open-on-stone', '敲开的蛤'],
  ['scallop', '扇贝'],
  ['urchin', '海胆'],
  ['kelp-blade', ROUND === 'round1' ? '巨藻叶带气囊' : '巨藻一段'],
  ['starfish', '海星'],
  ['bubbles', '一串气泡'],
].map(([file, label]) => ({ file, label, svg: readFileSync(svgPath(file), 'utf8'), redo: ROUND === 'round3' && svgPath(file).startsWith(SVG_DIR) }))

const INK = '#191D18'
const uri = (s) => `data:image/svg+xml;base64,${Buffer.from(s).toString('base64')}`
const withViewBox = (svg, vb) => svg.replace(/viewBox="[^"]+"/, `viewBox="${vb}"`)
const toMono = (svg) => svg.replace(/fill="#[0-9A-Fa-f]{6}"/g, `fill="${INK}"`)
const css = 'body{margin:0;padding:28px;font:14px/1.5 system-ui,"Noto Sans CJK SC",sans-serif;color:#191D18;background:#fff}h1{font-size:20px;margin:0 0 4px}p.sub{margin:0 0 18px;color:#29424D}'

const browser = await chromium.launch({ executablePath: process.env.INVENTORY_CHROMIUM || '/opt/pw-browsers/chromium' })
try {
  const page = await browser.newPage({ viewport: { width: 1800, height: 900 }, deviceScaleFactor: 1 })

  // 先量每样东西画出来的边（getBBox），用于贴边裁和摆底线
  const otterSvg = readFileSync(OTTER_PATH, 'utf8')
  await page.setContent(`<div id="w">${ITEMS.map((it) => it.svg).join('')}${otterSvg}</div>`)
  const boxes = await page.evaluate(() =>
    [...document.querySelectorAll('#w > svg')].map((s) => {
      const b = s.getBBox()
      // 头像只量头那一条路径（含耳朵），作为「头宽 1.0」
      const head = s.querySelector('#_L9S-0__ziti071')
      const h = head ? head.getBBox() : null
      return { x: b.x, y: b.y, w: b.width, h: b.height, head: h && { x: h.x, w: h.width } }
    }),
  )
  const otterBox = boxes.pop()
  ITEMS.forEach((it, i) => {
    const b = boxes[i]
    const side = Math.max(b.w, b.h) + 8
    it.box = b
    it.tight = `${(b.x + b.w / 2 - side / 2).toFixed(1)} ${(b.y + b.h / 2 - side / 2).toFixed(1)} ${side.toFixed(1)} ${side.toFixed(1)}`
  })

  // ---- sheet.png ----
  const cell = (it, svg) => `<figure><div class="r"><img src="${uri(svg)}" width="160" height="160"><div class="s"><img src="${uri(svg)}" width="48" height="48"><img src="${uri(withViewBox(svg, it.tight))}" width="48" height="48"></div></div><figcaption>${it.label}${it.redo ? '（本轮重画）' : ''}<br><small>相对宽 ${(it.box.w / 240).toFixed(2)}</small></figcaption></figure>`
  const band = (bg, name) => `<section style="background:${bg}"><h2>${name}</h2><div class="g">${ITEMS.map((it) => cell(it, it.svg)).join('')}</div></section>`
  const sheetHtml = `<style>${css}section{padding:16px 16px 8px;margin-bottom:16px;border-radius:8px;outline:1px solid #E3E9EC}h2{font-size:14px;margin:0 0 8px;color:#29424D}.g{display:grid;grid-template-columns:repeat(6,226px);gap:12px 16px}figure{margin:0}.r{display:flex;gap:6px;align-items:flex-end}.s{display:flex;flex-direction:column;gap:6px}figcaption{padding-top:4px;font-size:13px}small{color:#29424D}</style>
<h1>生态物件 · ${ROUND_NAME}矢量（对比稿 · 提案）</h1><p class="sub">每样三格：160px 原框（240 = 獭獭头宽，物件按相对大小留白）、48px 原框、48px 贴边裁（当图标用时的大小）。${{ round1: '只用品牌色', round2: '石头、海胆和石砧用提案的新石色，其余只用品牌色', round3: '石色、石面已进色板；敲开的蛤、海胆是本轮重画，其余从第二轮原样带上' }[ROUND]}，无描边、无渐变、无阴影。</p>
${band('#F1F5F7', '浅雾底 #F1F5F7（网站桌面）')}${band('#FFFFFF', '白底')}`
  await page.setViewportSize({ width: 1500, height: 900 })
  await page.setContent(sheetHtml)
  await page.screenshot({ path: path.join(OUT, 'sheet.png'), fullPage: true })

  // ---- with-otter.png ----
  const HEAD_PX = 200 // 獭獭头宽 1.0 = 200px
  const unit = HEAD_PX / 240 // 物件 SVG 每单位多少像素
  const otterScale = HEAD_PX / otterBox.head.w // 头像 SVG 每单位多少像素
  const BASE = 360 // 底线 y
  const GAP = 28
  let x = 40
  const placed = []
  // 头像：画到底边就是底线
  {
    const vb = otterSvg.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number)
    const w = vb[2] * otterScale
    const h = vb[3] * otterScale
    const left = x - (otterBox.head.x - vb[0]) * otterScale
    placed.push(`<img src="${uri(otterSvg)}" style="left:${left}px;top:${BASE - h}px;width:${w}px;height:${h}px">`)
    placed.push(`<div class="lab" style="left:${x}px;width:${HEAD_PX}px">獭獭头像<br><small>头宽 1.0</small></div>`)
    placed.push(`<div class="ruler" style="left:${x}px;width:${HEAD_PX}px"></div>`)
    x += HEAD_PX + GAP + 12
  }
  for (const it of ITEMS) {
    const b = it.box
    const left = x - b.x * unit
    const top = BASE - (b.y + b.h) * unit
    placed.push(`<img src="${uri(it.svg)}" style="left:${left}px;top:${top}px;width:${240 * unit}px;height:${240 * unit}px">`)
    const w = b.w * unit
    placed.push(`<div class="lab" style="left:${x - 20}px;width:${w + 40}px">${it.label}<br><small>${(b.w / 240).toFixed(2)}</small></div>`)
    x += w + GAP
  }
  const W = Math.ceil(x + 20)
  const otterHtml = `<style>${css}.stage{position:relative;height:440px;width:${W}px}.stage img{position:absolute}.lab{position:absolute;top:${BASE + 14}px;text-align:center;font-size:13px}.lab small{color:#29424D}.ruler{position:absolute;top:${BASE + 4}px;height:4px;background:#29424D;border-radius:2px}.line{position:absolute;left:0;right:0;top:${BASE}px;height:1px;background:#C9D3D8}</style>
<h1>和獭獭摆在一起 · 按相对大小（${ROUND_NAME}）</h1><p class="sub">獭獭头宽（含耳朵）= 200px，物件按 README 里的相对宽度画；都落在同一条底线上。对比稿 · 提案。</p>
<div class="stage"><div class="line"></div>${placed.join('')}</div>`
  await page.setViewportSize({ width: W + 56, height: 600 })
  await page.setContent(otterHtml)
  await page.screenshot({ path: path.join(OUT, 'with-otter.png'), fullPage: true })

  // ---- mono.png ----
  const monoCell = (it) => {
    const m = toMono(it.svg)
    return `<figure><div class="r"><img src="${uri(withViewBox(m, it.tight))}" width="120" height="120"><img src="${uri(withViewBox(m, it.tight))}" width="48" height="48"><img src="${uri(withViewBox(m, it.tight))}" width="24" height="24"></div><figcaption>${it.label}</figcaption></figure>`
  }
  const monoHtml = `<style>${css}.g{display:grid;grid-template-columns:repeat(6,1fr);gap:20px 16px}figure{margin:0}.r{display:flex;gap:10px;align-items:flex-end}figcaption{padding-top:4px;font-size:13px}</style>
<h1>单色剪影 · 只看轮廓（${ROUND_NAME}）</h1><p class="sub">所有颜色换成墨 ${INK}，里面的浅色细节全部消失。贴边裁，120 / 48 / 24px。对比稿 · 提案。</p><div class="g">${ITEMS.map(monoCell).join('')}</div>`
  await page.setViewportSize({ width: 1500, height: 600 })
  await page.setContent(monoHtml)
  await page.screenshot({ path: path.join(OUT, 'mono.png'), fullPage: true })

  // ---- compare.png（只有第二轮）：石头三档颜色、气泡两版 ----
  if (ROUND === 'round2') {
    // SVG 里写的是推荐档（石色）；另两档在出图时整串替换，主体和顶面各换一个色
    const TIERS = [
      { name: '墨', main: '#191D18', face: '#333B35', note: '主体墨（色板已有）；顶面 #333B35 是为了比较临时调的，不在色板里' },
      { name: '石板墨', main: '#29424D', face: '#3E5A66', note: '主体石板墨（色板已有）；顶面 #3E5A66 临时调的，不在色板里' },
      { name: '石色（推荐）', main: '#6E828C', face: '#8FA3AC', note: '主体石色、顶面石面，两个都是新色，提案，要 Owner 定才进色板' },
    ]
    const STONE_ITEMS = ITEMS.filter((it) => /^(stone-|urchin|clam-open)/.test(it.file))
    const NEIGHBOURS = ITEMS.filter((it) => ['clam', 'scallop'].includes(it.file))
    const recolor = (svg, t) => svg.replaceAll('#6E828C', t.main).replaceAll('#8FA3AC', t.face)
    const tierRow = (t) => `<section><h2>${t.name}　<small>${t.main} / ${t.face}　${t.note}</small></h2><div class="row">${[...STONE_ITEMS, ...NEIGHBOURS]
      .map((it) => { const svg = recolor(it.svg, t); return `<figure><div class="r"><img src="${uri(withViewBox(svg, it.tight))}" width="120" height="120"><img src="${uri(withViewBox(svg, it.tight))}" width="48" height="48"></div><figcaption>${it.label}</figcaption></figure>` })
      .join('')}</div></section>`
    const ring = readFileSync(path.join(SVG_DIR, 'alt/bubbles-ring.svg'), 'utf8')
    const bub = ITEMS.find((it) => it.file === 'bubbles')
    const bubCell = (svg, label) => `<figure><div class="r"><img src="${uri(svg)}" width="160" height="160"><img src="${uri(withViewBox(svg, bub.tight))}" width="48" height="48"><img src="${uri(withViewBox(svg, bub.tight))}" width="24" height="24"></div><figcaption>${label}</figcaption></figure>`
    const compareHtml = `<style>${css}body{background:#F1F5F7}section{background:#F1F5F7;margin-bottom:10px}h2{font-size:15px;margin:0 0 6px}h2 small{font-weight:400;color:#29424D;font-size:12px}.row{display:flex;gap:14px;flex-wrap:nowrap}figure{margin:0}.r{display:flex;gap:8px;align-items:flex-end}figcaption{font-size:12px;padding-top:2px}</style>
<h1>石头三档颜色 · 第二轮（底色 #F1F5F7）</h1><p class="sub">同一组形状，只换主体和顶面两个颜色；最右两样是薄荷色的蛤和扇贝，看放在一起压不压。贴边裁 120 / 48px。对比稿 · 提案。</p>
${TIERS.map(tierRow).join('')}
<h1 style="margin-top:22px">气泡两版</h1><p class="sub">左：实心加浅色透光点（进套的这版）；右：加厚圆环（备选，不进套）。160px 原框、48、24px 贴边裁。</p><div class="row">${bubCell(bub.svg, '实心 + 透光点')}${bubCell(ring, '加厚圆环')}</div>`
    await page.setViewportSize({ width: 1720, height: 600 })
    await page.setContent(compareHtml)
    await page.screenshot({ path: path.join(OUT, 'compare.png'), fullPage: true })
  }
  // ---- 第三轮：redo-compare.png 和 stone-recolor/compare.png ----
  if (ROUND === 'round3') {
    // 量一组 SVG 画出来的边，给贴边裁用
    const measure = async (svgs) => {
      await page.setContent(`<div id="w">${svgs.join('')}</div>`)
      return page.evaluate(() => [...document.querySelectorAll('#w > svg')].map((s) => { const b = s.getBBox(); return { x: b.x, y: b.y, w: b.width, h: b.height } }))
    }
    const tightOf = (b) => { const side = Math.max(b.w, b.h) + 8; return `${(b.x + b.w / 2 - side / 2).toFixed(1)} ${(b.y + b.h / 2 - side / 2).toFixed(1)} ${side.toFixed(1)} ${side.toFixed(1)}` }
    const C = path.join(SVG_DIR, 'candidates')
    const GROUPS = [
      { name: '敲开的蛤', rows: [
        ['第二轮（退回）', path.join(R2_SVG, 'clam-open-on-stone.svg')],
        ['候选 A · 蝴蝶形 + 生长纹（推荐）', path.join(C, 'clam-open-A-butterfly.svg')],
        ['候选 A2 · 蝴蝶形，里面不画纹', path.join(C, 'clam-open-A2-butterfly-plain.svg')],
        ['候选 B · 侧看，一平一翻起', path.join(C, 'clam-open-B-side.svg')],
        ['对照：合着的蛤', path.join(R2_SVG, 'clam.svg')],
      ] },
      { name: '海胆', rows: [
        ['第二轮（退回）', path.join(R2_SVG, 'urchin.svg')],
        ['候选 L · 长刺（推荐）', path.join(C, 'urchin-L-long.svg')],
        ['候选 S · 短刺', path.join(C, 'urchin-S-short.svg')],
      ] },
    ]
    const all = GROUPS.flatMap((g) => g.rows.map(([label, f]) => ({ label, svg: readFileSync(f, 'utf8') })))
    const bs = await measure(all.map((r) => r.svg))
    all.forEach((r, i) => { r.tight = tightOf(bs[i]) })
    let k = 0
    const redoCell = (r) => `<figure><div class="r"><img src="${uri(r.svg)}" width="160" height="160"><div class="s"><img src="${uri(withViewBox(r.svg, r.tight))}" width="48" height="48"><img src="${uri(withViewBox(toMono(r.svg), r.tight))}" width="48" height="48"></div></div><figcaption>${r.label}</figcaption></figure>`
    const redoHtml = `<style>${css}body{background:#F1F5F7}h2{font-size:15px;margin:14px 0 6px}.row{display:flex;gap:18px;flex-wrap:nowrap}figure{margin:0;background:#fff;padding:8px;border-radius:6px}.r{display:flex;gap:6px;align-items:flex-end}.s{display:flex;flex-direction:column;gap:6px}figcaption{font-size:12px;padding-top:4px}</style>
<h1>重画对比 · 第三轮（底色 #F1F5F7，卡片白底）</h1><p class="sub">每格：160px 原框（240 = 獭獭头宽）、48px 贴边裁、48px 贴边裁墨色剪影。第一格是被退回的第二轮。对比稿 · 提案 · 单一来源。</p>
${GROUPS.map((g) => `<h2>${g.name}</h2><div class="row">${g.rows.map(() => redoCell(all[k++])).join('')}</div>`).join('')}`
    await page.setViewportSize({ width: 1300, height: 600 })
    await page.setContent(redoHtml)
    await page.screenshot({ path: path.join(OUT, 'redo-compare.png'), fullPage: true })

    // 石子改色：母版（只读）和副本并排；再各放一张石子附近的放大
    const MASCOT = path.join(ROOT, 'design/brand-2026-10-13/mascot')
    const RC = path.join(OUT, 'stone-recolor')
    const PAIRS = [
      ['states/state-01-idle.svg', '状态 01 空闲 · 胸口抱石'],
      ['upright/upright-08-gift-stone.svg', '直立 U8 · 递石头'],
    ].map(([rel, label]) => ({ label, rel, before: readFileSync(path.join(MASCOT, rel), 'utf8'), after: readFileSync(path.join(RC, 'svg', path.basename(rel)), 'utf8') }))
    // 石子的边：副本里石色那条路径
    await page.setContent(`<div id="w">${PAIRS.map((p) => p.after).join('')}</div>`)
    const stoneBoxes = await page.evaluate(() => [...document.querySelectorAll('#w > svg')].map((s) => { const b = s.querySelector('path[fill="#6E828C"]').getBBox(); return { x: b.x, y: b.y, w: b.width, h: b.height } }))
    const pairHtml = PAIRS.map((p, i) => {
      const b = stoneBoxes[i]
      const pad = Math.max(b.w, b.h) * 0.45
      const side = Math.max(b.w, b.h) + pad * 2
      const zoom = `${(b.x + b.w / 2 - side / 2).toFixed(1)} ${(b.y + b.h / 2 - side / 2).toFixed(1)} ${side.toFixed(1)} ${side.toFixed(1)}`
      const fig = (svg, cap) => `<figure><img src="${uri(svg)}" style="height:300px"><img src="${uri(withViewBox(svg, zoom))}" width="220" height="220"><figcaption>${cap}</figcaption></figure>`
      return `<h2>${p.label}　<small>mascot/${p.rel}</small></h2><div class="row">${fig(p.before, '改前（母版，墨 #191D18）')}${fig(p.after, '改后（副本，石色 #6E828C + 石面 #8FA3AC 顶面）')}</div>`
    }).join('')
    const rcHtml = `<style>${css}body{background:#F1F5F7}h2{font-size:15px;margin:14px 0 6px}h2 small{font-weight:400;color:#29424D;font-size:12px}.row{display:flex;gap:24px;flex-wrap:nowrap}figure{margin:0;background:#fff;padding:10px;border-radius:6px;display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;width:680px}figcaption{width:100%;font-size:12px}</style>
<h1>石子改色 · 改前改后（第三轮）</h1><p class="sub">只换石子一条路径的颜色，石子宽过头宽 1/4 的加一块石面顶面。左边整张，右边石子附近放大。副本，母版没动。对比稿 · 提案 · 单一来源。</p>${pairHtml}`
    await page.setViewportSize({ width: 1480, height: 600 })
    await page.setContent(rcHtml)
    await page.screenshot({ path: path.join(RC, 'compare.png'), fullPage: true })
  }
} finally {
  await browser.close()
}
console.log(`出了 sheet.png、with-otter.png、mono.png${{ round1: '', round2: '、compare.png', round3: '、redo-compare.png、stone-recolor/compare.png' }[ROUND]}：${path.relative(ROOT, OUT)}`)
