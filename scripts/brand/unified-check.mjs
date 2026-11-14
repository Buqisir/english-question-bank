#!/usr/bin/env node
// 形象 · 统一检查（对比稿 · 提案 · 单一来源，2026-11-14）。照 image-review-2026-11-14/house-rules.md 第四节第 4 步。
//
// 做什么：
//   check（默认）  出 unified-check/ 下的 sheet.png、mono.png、small-48.png，并把逐样量数写到 unified-check/measure.json
//   round5         出 ecosystem-round5/compare.png：第五轮修过的物件，修前修后并排（160px、48px 贴边裁、48px 墨色剪影），
//                  另有一排把修过的和没修的几样（海星、圆墩石、敲开的蛤 a）放在一起看
//   measure a.svg [b.svg …]  只量，打印量数（改图时用）
//
// 量法（和第四轮 README 说的一样，这里写成代码）：
//   - 每样贴边裁（边长 = 画出来的宽高取大 + 8，和 ecosystem-sheet.mjs 一样），按 48px 的 10 倍（480px）渲染，
//     根上加 shape-rendering="crispEdges"，不抗锯齿；每个像素要么是透明底，要么正好是颜色表里的一个色。认不出的像素单独计数。
//   - 最细处：每个颜色面和整个剪影各做一次开运算（圆盘半径 10px = 48px 下 1px），被抹掉的面积占比 = 窄于约 2px 的部分。
//     圆角和尖头本身也会被抹掉一点，6% 以下只当边角。
//   - 次色离外沿：除面积最大的主体色外，每个颜色的像素到最近透明底像素的最短距离，换成 48px 下的像素（0.1px = 贴边）。
// 物件 SVG、全身像和头像母版都只读，不改。
//
// 用法：node scripts/brand/unified-check.mjs [check|round5|measure <svg…>]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const MODE = process.argv[2] || 'check'
const REVIEW = path.join(ROOT, 'design/brand-2026-10-13/image-review-2026-11-14')
const R5 = path.join(REVIEW, 'ecosystem-round5')
const OUT = path.join(REVIEW, 'unified-check')
const ROUNDS = ['ecosystem-round5', 'ecosystem-round4', 'ecosystem-round3', 'ecosystem-round2'].map((r) => path.join(REVIEW, r, 'svg'))
const findSvg = (file) => ROUNDS.map((d) => path.join(d, `${file}.svg`)).find((f) => existsSync(f))
const HEAD_PATH = path.join(ROOT, 'design/brand-2026-10-13/mascot/otter-head.svg')
const BODY_PATH = path.join(REVIEW, 'body-f6-round3/body-f6.svg')
const requireFromApp = createRequire(path.join(ROOT, 'app/package.json'))
const { chromium } = requireFromApp('playwright')

// house-rules.md 第一节颜色表
const PALETTE = {
  '#72BFA4': '雾薄荷',
  '#2C6E56': '深薄荷',
  '#DDF1E8': '浅雾薄荷',
  '#F2FAF6': '雾白',
  '#191D18': '墨',
  '#6E828C': '石色',
  '#8FA3AC': '石面',
  '#29424D': '石板墨',
}
// 每类东西按颜色表「只用在」允许的颜色
const ALLOW = {
  otter: ['雾薄荷', '浅雾薄荷', '雾白', '墨', '石色'], // 全身像坐的石头只用石色（第 109 条）
  stone: ['石色', '石面'],
  urchin: ['石色', '石面'],
  shell: ['雾薄荷', '浅雾薄荷', '雾白'],
  mint: ['雾薄荷', '浅雾薄荷'],
  kelp: ['深薄荷'],
}
const ITEMS = [
  ['stone-otter', '獭獭的石头', 'stone'],
  ['stone-long', '石头 · 扁长卵', 'stone'],
  ['stone-round', '石头 · 圆墩', 'stone'],
  ['stone-flat', '石头 · 小扁片', 'stone'],
  ['clam', '合着的蛤', 'shell'],
  ['clam-open-on-stone', '敲开的蛤 a', 'shell'],
  ['scallop', '扇贝', 'shell'],
  ['urchin', '海胆 L', 'urchin'],
  ['kelp-blade', '巨藻一段', 'kelp'],
  ['starfish', '海星', 'mint'],
  ['bubbles', '一串气泡', 'mint'],
]
const INK = '#191D18'
const uri = (s) => `data:image/svg+xml;base64,${Buffer.from(s).toString('base64')}`
const withViewBox = (svg, vb) => svg.replace(/viewBox="[^"]+"/, `viewBox="${vb}"`)
const toMono = (svg) => svg.replace(/fill="#[0-9A-Fa-f]{6}"/g, `fill="${INK}"`)
const rel = (f) => path.relative(ROOT, f)
const roundOf = (f) => (f.match(/ecosystem-(round\d)/) || [])[1] || ''

// —— 浏览器里做的事：量 bbox、不抗锯齿渲染、认色、开运算、距离 ——
const PAGE_LIB = String.raw`
window.bboxOf = (svgText, sel) => {
  const w = document.createElement('div'); w.innerHTML = svgText; document.body.appendChild(w)
  const s = w.querySelector('svg'); const el = sel ? s.querySelector(sel) : s
  const b = el.getBBox(); w.remove(); return { x: b.x, y: b.y, w: b.width, h: b.height }
}
window.tightOf = (b) => { const side = Math.max(b.w, b.h) + 8; return { x: b.x + b.w / 2 - side / 2, y: b.y + b.h / 2 - side / 2, side } }
window.rasterCrisp = async (svgText, vb, px) => {
  let s = svgText.replace(/viewBox="[^"]+"/, 'viewBox="' + vb + '"').replace('<svg ', '<svg shape-rendering="crispEdges" width="' + px + '" height="' + px + '" ')
  const img = new Image(); img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(s))); await img.decode()
  const c = document.createElement('canvas'); c.width = px; c.height = px
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(img, 0, 0, px, px)
  return g.getImageData(0, 0, px, px).data
}
// Felzenszwalb 精确欧氏距离变换：feat[i]=1 的像素距离为 0，返回到最近 feat 像素的距离平方
window.edt = (feat, W, H) => {
  const INF = 1e12, f = new Float64Array(Math.max(W, H)), d = new Float64Array(W * H)
  const v = new Int32Array(Math.max(W, H)), z = new Float64Array(Math.max(W, H) + 1)
  const one = (n, get, set) => {
    for (let q = 0; q < n; q++) f[q] = get(q)
    let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF
    for (let q = 1; q < n; q++) {
      let s
      while (true) { const p = v[k]; s = ((f[q] + q * q) - (f[p] + p * p)) / (2 * q - 2 * p); if (s <= z[k]) { k--; if (k < 0) { k = 0; break } } else break }
      if (k === 0 && s <= z[0]) { v[0] = q; z[0] = -INF; z[1] = INF; continue }
      k++; v[k] = q; z[k] = s; z[k + 1] = INF
    }
    k = 0
    for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; const p = v[k]; set(q, (q - p) * (q - p) + f[p]) }
  }
  for (let i = 0; i < W * H; i++) d[i] = feat[i] ? 0 : INF
  for (let x = 0; x < W; x++) one(H, (q) => d[q * W + x], (q, val) => { d[q * W + x] = val })
  for (let y = 0; y < H; y++) one(W, (q) => d[y * W + q], (q, val) => { d[y * W + q] = val })
  return d
}
// 开运算被抹掉的占比（r 像素半径的圆盘）
window.openLoss = (mask, W, H, r) => {
  const n = W * H; let area = 0; const comp = new Uint8Array(n)
  for (let i = 0; i < n; i++) { comp[i] = mask[i] ? 0 : 1; area += mask[i] }
  if (!area) return { area: 0, loss: 0, lossMask: null }
  const dc = edt(comp, W, H); const er = new Uint8Array(n)
  for (let i = 0; i < n; i++) er[i] = mask[i] && dc[i] >= r * r ? 1 : 0
  const de = edt(er, W, H); let lost = 0; const lm = new Uint8Array(n)
  for (let i = 0; i < n; i++) if (mask[i] && !(de[i] <= r * r)) { lost++; lm[i] = 1 }
  return { area, loss: lost / area, lossMask: lm }
}
window.components = (mask, W, H) => {
  const seen = new Uint8Array(W * H); let k = 0; const st = []
  for (let i = 0; i < W * H; i++) if (mask[i] && !seen[i]) {
    k++; seen[i] = 1; st.push(i)
    while (st.length) { const j = st.pop(), x = j % W, y = (j / W) | 0
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const t = yy * W + xx; if (mask[t] && !seen[t]) { seen[t] = 1; st.push(t) } } }
  }
  return k
}
window.analyze = async (svgText, palette, opt = {}) => {
  const PX = 480, R = 10
  const b = bboxOf(svgText, opt.sel); const t = tightOf(b)
  const vb = opt.vb || (t.x + ' ' + t.y + ' ' + t.side + ' ' + t.side)
  const data = await rasterCrisp(svgText, vb, PX)
  const keys = Object.keys(palette), rgb = keys.map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)))
  const n = PX * PX, lab = new Int16Array(n); let unknown = 0, partial = 0
  for (let i = 0; i < n; i++) {
    const a = data[i * 4 + 3]
    if (a === 0) { lab[i] = -1; continue }
    if (a !== 255) partial++
    const r = data[i * 4], g = data[i * 4 + 1], bb = data[i * 4 + 2]
    const k = rgb.findIndex((c) => c[0] === r && c[1] === g && c[2] === bb)
    if (k < 0 || a !== 255) { unknown++; lab[i] = -2 } else lab[i] = k
  }
  const count = keys.map((_, k) => { let c = 0; for (let i = 0; i < n; i++) if (lab[i] === k) c++; return c })
  const total = count.reduce((a, c) => a + c, 0) + unknown
  const used = keys.map((h, k) => ({ hex: h, name: palette[h], px: count[k] })).filter((c) => c.px > 0).sort((a, c) => c.px - a.px)
  const sil = new Uint8Array(n); for (let i = 0; i < n; i++) sil[i] = lab[i] !== -1 ? 1 : 0
  const bg = new Uint8Array(n); for (let i = 0; i < n; i++) bg[i] = sil[i] ? 0 : 1
  const dbg = edt(bg, PX, PX)
  const main = used[0]
  const colors = used.map((c) => {
    const k = keys.indexOf(c.hex); const m = new Uint8Array(n); for (let i = 0; i < n; i++) m[i] = lab[i] === k ? 1 : 0
    const o = openLoss(m, PX, PX, R)
    let dmin = Infinity, at = -1; for (let i = 0; i < n; i++) if (m[i] && dbg[i] < dmin) { dmin = dbg[i]; at = i }
    const [vx, vy, vs] = vb.split(' ').map(Number)
    const where = at < 0 ? null : [+(vx + ((at % PX) + 0.5) * vs / PX).toFixed(1), +(vy + (((at / PX) | 0) + 0.5) * vs / PX).toFixed(1)]
    return { name: c.name, hex: c.hex, share: c.px / total, narrow: o.loss, edge: Math.sqrt(dmin) / R, edgeAt: where, pieces: components(m, PX, PX) }
  })
  const so = openLoss(sil, PX, PX, R)
  return { vb, w240: b.w / 240, bbox: b, used: used.map((c) => c.name), unknown, partial, colors, main: main && main.name, silNarrow: so.loss }
}
`

const fmtPct = (x) => `${Math.round(x * 100)}%`
const fmtPx = (x) => `${x.toFixed(1)}px`
const summary = (label, m) => {
  const sec = m.colors.slice(1).map((c) => `${c.name}离外沿 ${fmtPx(c.edge)}${process.env.DEBUG ? '@' + c.edgeAt : ''}（${c.pieces} 块，占 ${fmtPct(c.share)}）`).join('；')
  const narrow = m.colors.map((c) => `${c.name} ${fmtPct(c.narrow)}`).join('、')
  return `${label}：色 ${m.used.join('、')}；认不出的像素 ${m.unknown}；${sec || '无次色'}；窄于 2px：${narrow}，剪影 ${fmtPct(m.silNarrow)}`
}

const browser = await chromium.launch({ executablePath: process.env.INVENTORY_CHROMIUM || '/opt/pw-browsers/chromium' })
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 })
  await page.setContent('<body></body>')
  await page.addScriptTag({ content: PAGE_LIB })
  const analyze = (svg, opt) => page.evaluate(([s, p, o]) => window.analyze(s, p, o), [svg, PALETTE, opt || {}])
  const bbox = (svg, sel) => page.evaluate(([s, q]) => window.bboxOf(s, q), [svg, sel || null])
  const tight = (b) => { const side = Math.max(b.w, b.h) + 8; return `${(b.x + b.w / 2 - side / 2).toFixed(2)} ${(b.y + b.h / 2 - side / 2).toFixed(2)} ${side.toFixed(2)} ${side.toFixed(2)}` }

  if (MODE === 'measure') {
    for (const f of process.argv.slice(3)) console.log(summary(rel(path.resolve(f)), await analyze(readFileSync(f, 'utf8'))))
  }
  // 改图时看草稿：preview out.png a.svg b.svg …（160px 原框、48px 贴边裁、48px 剪影，一排）
  if (MODE === 'preview') {
    const [out, ...files] = process.argv.slice(3)
    const cells = []
    for (const f of files) {
      const svg = readFileSync(f, 'utf8'); const vb = tight(await bbox(svg))
      cells.push(`<figure><img src="${uri(process.env.BIG ? withViewBox(svg, vb) : svg)}" width="${process.env.BIG || 160}" height="${process.env.BIG || 160}"><img src="${uri(withViewBox(svg, vb))}" width="48" height="48"><img src="${uri(withViewBox(toMono(svg), vb))}" width="48" height="48"><figcaption>${path.basename(f)}</figcaption></figure>`)
    }
    await page.setViewportSize({ width: (+(process.env.BIG || 160) + 140) * Math.min(files.length, 5) + 40, height: 300 })
    await page.setContent(`<style>body{margin:0;padding:16px;background:#F1F5F7;font:12px system-ui;display:flex;flex-wrap:wrap;gap:12px}figure{margin:0;background:#fff;padding:8px;border-radius:6px;display:flex;gap:6px;align-items:flex-end;flex-wrap:wrap;width:${+(process.env.BIG || 160) + 110}px}figcaption{width:100%}</style>${cells.join('')}`)
    await page.screenshot({ path: out, fullPage: true })
  }

  // ———— 第五轮对比图 ————
  if (MODE === 'round5') {
    const FIXED = [
      ['clam', '合着的蛤'],
      ['scallop', '扇贝'],
      ['kelp-blade', '巨藻一段'],
      ['urchin', '海胆 L'],
      ['stone-flat', '石头 · 小扁片'],
      ['stone-long', '石头 · 扁长卵'],
    ]
    const prevOf = (file) => ROUNDS.slice(1).map((d) => path.join(d, `${file}.svg`)).find((f) => existsSync(f))
    const pairs = []
    for (const [file, label] of FIXED) {
      const before = prevOf(file), after = path.join(R5, 'svg', `${file}.svg`)
      const row = []
      for (const [f, tag] of [[before, `修前（${roundOf(before)}）`], [after, '修后（第五轮）']]) {
        const svg = readFileSync(f, 'utf8'); const m = await analyze(svg)
        row.push({ svg, tag, m, tight: m.vb })
      }
      pairs.push({ label, row })
    }
    const note = (m) => {
      const sec = m.colors.slice(1).map((c) => `${c.name}离外沿 ${fmtPx(c.edge)}`).join('，')
      const nar = m.colors.map((c) => `${c.name} ${fmtPct(c.narrow)}`).join('，')
      return `${sec ? sec + '<br>' : ''}窄于 2px：${nar}；剪影 ${fmtPct(m.silNarrow)}`
    }
    const cell = (r) => `<figure><div class="r"><img src="${uri(r.svg)}" width="160" height="160"><div class="s"><img src="${uri(withViewBox(r.svg, r.tight))}" width="48" height="48"><img src="${uri(withViewBox(toMono(r.svg), r.tight))}" width="48" height="48"></div></div><figcaption><b>${r.tag}</b><br>${note(r.m)}</figcaption></figure>`
    // 一家人：修过的和没修的几样，按同一比例放一排
    const FAMILY = ['stone-round', 'stone-flat', 'stone-long', 'urchin', 'clam', 'clam-open-on-stone', 'scallop', 'starfish', 'kelp-blade']
    const fam = FAMILY.map((f) => ({ f, svg: readFileSync(findSvg(f), 'utf8'), fixed: findSvg(f).includes('ecosystem-round5') }))
    for (const it of fam) it.tight = tight(await bbox(it.svg))
    const famRow = (size) => fam.map((it) => `<img src="${uri(size === 160 ? it.svg : withViewBox(it.svg, it.tight))}" width="${size}" height="${size}">`).join('')
    const html = `<style>body{margin:0;padding:28px;font:13px/1.5 system-ui,"Noto Sans CJK SC",sans-serif;color:#191D18;background:#F1F5F7}h1{font-size:20px;margin:0 0 4px}p.sub{margin:0 0 14px;color:#29424D}h2{font-size:15px;margin:16px 0 6px}.row{display:flex;gap:16px}figure{margin:0;background:#fff;padding:10px;border-radius:6px;width:300px}.r{display:flex;gap:6px;align-items:flex-end}.s{display:flex;flex-direction:column;gap:6px}figcaption{font-size:12px;padding-top:4px;color:#29424D}figcaption b{color:#191D18}.fam{background:#fff;padding:12px;border-radius:6px;display:flex;flex-wrap:wrap;gap:0;align-items:flex-end}.fam2{gap:14px}</style>
<h1>生态物件 · 第五轮：旧物件修合规（对比稿 · 提案 · 单一来源）</h1><p class="sub">底色 #F1F5F7，卡片白底。每格：160px 原框（240 = 獭獭头宽）、48px 贴边裁、48px 贴边裁墨色剪影。量数按 48px 贴边裁的 10 倍不抗锯齿渲染量的（scripts/brand/unified-check.mjs）。</p>
<div style="display:grid;grid-template-columns:repeat(3,auto);gap:4px 28px;justify-content:start">${pairs.map((p) => `<div><h2>${p.label}</h2><div class="row">${p.row.map(cell).join('')}</div></div>`).join('')}</div>
<h2>放在一起看：修过的和没修的（圆墩石、敲开的蛤 a、海星没修）</h2>
<div class="fam">${famRow(160)}</div>
<h2>同一排，48px 贴边裁</h2>
<div class="fam fam2">${famRow(48)}</div>`
    await page.setViewportSize({ width: 2120, height: 800 })
    await page.setContent(html)
    await page.screenshot({ path: path.join(R5, 'compare.png'), fullPage: true })
    for (const p of pairs) for (const r of p.row) console.log(summary(`${p.label} ${r.tag}`, r.m))
    console.log(`出了 ${rel(path.join(R5, 'compare.png'))}`)
  }

  // ———— 统一检查 ————
  if (MODE === 'check') {
    mkdirSync(OUT, { recursive: true })
    const headSvg = readFileSync(HEAD_PATH, 'utf8')
    const bodySvg = readFileSync(BODY_PATH, 'utf8')
    const HEAD_SEL = '#_L9S-0__ziti071'
    const headB = await bbox(headSvg, HEAD_SEL) // 头形（含耳朵）
    const BODY_HEAD = { tx: 392.9, ty: -7.8, s: 0.3261 } // body-f6.svg 里头像母版的 transform
    if (!bodySvg.includes(`translate(${BODY_HEAD.tx} ${BODY_HEAD.ty}) scale(${BODY_HEAD.s})`)) throw new Error('全身像里头的 transform 变了，先核对')
    const HEAD_PX = 160 // 獭獭头宽 = 160px
    const things = []
    things.push({ key: 'body', label: '全身像主姿势', src: rel(BODY_PATH), kind: 'otter', svg: bodySvg, unit: HEAD_PX / (headB.w * BODY_HEAD.s) })
    things.push({ key: 'head', label: '头像母版', src: rel(HEAD_PATH), kind: 'otter', svg: headSvg, unit: HEAD_PX / headB.w })
    for (const [file, label, kind] of ITEMS) {
      const f = findSvg(file)
      things.push({ key: file, label, src: rel(f), round: roundOf(f), kind, svg: readFileSync(f, 'utf8'), unit: HEAD_PX / 240 })
    }
    for (const t of things) {
      t.box = await bbox(t.svg)
      t.m = await analyze(t.svg)
      t.allowedOk = t.m.used.every((n) => ALLOW[t.kind].includes(n))
      console.log(summary(t.label, t.m))
    }
    // 脸是不是同一张：把全身像里头的那块和头像母版按同一框、同一像素尺寸不抗锯齿渲染，比墨和雾白（眼、鼻、胡须点、脸斑）
    const face = await page.evaluate(async ([head, body, hb, T, pal]) => {
      const PX = 600
      const vbH = `${hb.x} ${hb.y} ${hb.w} ${hb.w}`
      const vbB = `${T.tx + hb.x * T.s} ${T.ty + hb.y * T.s} ${hb.w * T.s} ${hb.w * T.s}`
      const a = await rasterCrisp(head, vbH, PX), b = await rasterCrisp(body, vbB, PX)
      const hex = (d, i) => '#' + [0, 1, 2].map((k) => d[i * 4 + k].toString(16).padStart(2, '0')).join('').toUpperCase()
      const res = {}
      for (const name of ['墨', '雾白', '浅雾薄荷', '雾薄荷']) {
        const h = Object.keys(pal).find((k) => pal[k] === name)
        let inA = 0, both = 0, inB = 0
        for (let i = 0; i < PX * PX; i++) {
          const ia = a[i * 4 + 3] === 255 && hex(a, i) === h, ib = b[i * 4 + 3] === 255 && hex(b, i) === h
          if (ia) inA++; if (ib) inB++; if (ia && ib) both++
        }
        res[name] = { head: inA, body: inB, same: both, iou: both / (inA + inB - both || 1) }
      }
      return res
    }, [headSvg, bodySvg, { x: headB.x, y: headB.y, w: headB.w }, BODY_HEAD, PALETTE])
    console.log('脸对比：', JSON.stringify(face))

    // —— sheet.png / mono.png：同一比例，按行排，每行底对齐 ——
    const layout = (mono) => {
      const card = (t) => {
        const vb = t.svg.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number)
        const pad = 6
        const w = t.box.w * t.unit, h = t.box.h * t.unit
        const left = pad - (t.box.x - vb[0]) * t.unit, top = pad - (t.box.y - vb[1]) * t.unit
        const svg = mono ? toMono(t.svg) : t.svg
        const src = t.round ? `${t.round}` : t.key === 'body' ? 'body-f6-round3' : 'mascot/'
        return `<figure><div class="art" style="width:${Math.ceil(w + pad * 2)}px;height:${Math.ceil(h + pad * 2)}px"><img src="${uri(svg)}" style="left:${left}px;top:${top}px;width:${vb[2] * t.unit}px;height:${vb[3] * t.unit}px"></div><figcaption>${t.label}<br><small>${src} · 宽 ${(t.box.w * t.unit / HEAD_PX).toFixed(2)} 头宽</small></figcaption></figure>`
      }
      const by = (keys) => keys.map((k) => things.find((t) => t.key === k))
      const rows = [
        by(['body', 'head']),
        by(['stone-otter', 'stone-long', 'stone-round', 'stone-flat', 'urchin']),
        by(['clam', 'clam-open-on-stone', 'scallop', 'starfish', 'bubbles', 'kelp-blade']),
      ]
      return `<style>body{margin:0;padding:28px;font:13px/1.5 system-ui,"Noto Sans CJK SC",sans-serif;color:#191D18;background:#F1F5F7;width:1240px}h1{font-size:20px;margin:0 0 4px}p.sub{margin:0 0 16px;color:#29424D}.row{display:flex;flex-wrap:wrap;gap:14px;align-items:flex-end;margin-bottom:14px}figure{margin:0;background:#fff;padding:12px;border-radius:8px}.art{position:relative;overflow:hidden}.art img{position:absolute}figcaption{padding-top:6px;font-size:12px}small{color:#29424D}</style>
<h1>统一检查 · ${mono ? '墨色剪影' : '全身像、头像、全套物件'}（对比稿 · 提案 · 单一来源）</h1><p class="sub">同一个比例：獭獭头宽（含耳朵）= ${HEAD_PX}px，物件按 240 = 1 头宽画（前几轮 README 的比例）。底色 #F1F5F7，卡片白底。${mono ? '所有颜色换成墨 #191D18，只看轮廓。' : '修过的物件用第五轮，没修的按 round4、round3、round2 往前找。'}</p>
${rows.map((r) => `<div class="row">${r.map(card).join('')}</div>`).join('')}`
    }
    await page.setViewportSize({ width: 1296, height: 900 })
    await page.setContent(layout(false))
    await page.screenshot({ path: path.join(OUT, 'sheet.png'), fullPage: true })
    await page.setContent(layout(true))
    await page.screenshot({ path: path.join(OUT, 'mono.png'), fullPage: true })

    // —— small-48.png：每样贴边裁到 48px（正常抗锯齿，就是用户看到的样子），下面放 4 倍不插值放大 ——
    const smallCell = (t) => {
      const vb = tight(t.box)
      const s = withViewBox(t.svg, vb)
      return `<figure><img class="a" src="${uri(s)}" width="48" height="48"><canvas data-src="${uri(s)}" width="192" height="192"></canvas><figcaption>${t.label}</figcaption></figure>`
    }
    const smallHtml = `<style>body{margin:0;padding:28px;font:13px/1.5 system-ui,"Noto Sans CJK SC",sans-serif;color:#191D18;background:#F1F5F7;width:1240px}h1{font-size:20px;margin:0 0 4px}p.sub{margin:0 0 16px;color:#29424D}.g{display:flex;flex-wrap:wrap;gap:14px}figure{margin:0;background:#fff;padding:10px;border-radius:8px;display:flex;flex-direction:column;align-items:center;gap:8px;width:200px}canvas{image-rendering:pixelated;width:192px;height:192px}figcaption{font-size:12px}</style>
<h1>统一检查 · 全部缩到 48 像素（对比稿 · 提案 · 单一来源）</h1><p class="sub">每样贴边裁（边长 = 宽高取大 + 8）到 48×48。上：48px 实际大小；下：同一张 48px 图放大 4 倍，不插值，看每个像素。底色 #F1F5F7，卡片白底。</p>
<div class="g">${things.map(smallCell).join('')}</div>
<script>window.done = Promise.all([...document.querySelectorAll('canvas')].map(async (c) => {
  const img = new Image(); img.src = c.dataset.src; await img.decode()
  const t = document.createElement('canvas'); t.width = 48; t.height = 48; const tg = t.getContext('2d'); tg.fillStyle = '#fff'; tg.fillRect(0, 0, 48, 48); tg.drawImage(img, 0, 0, 48, 48)
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(t, 0, 0, 192, 192)
}))</script>`
    await page.setContent(smallHtml)
    await page.evaluate(() => window.done)
    await page.screenshot({ path: path.join(OUT, 'small-48.png'), fullPage: true })

    const json = {
      note: '对比稿 · 提案 · 单一来源。scripts/brand/unified-check.mjs 量的；量法见脚本开头。edge 是 48px 下离外沿的像素，narrow 是窄于约 2px 的面积占比。',
      headPx: HEAD_PX,
      face,
      items: things.map((t) => ({ key: t.key, label: t.label, src: t.src, relWidth: +(t.box.w * t.unit / HEAD_PX).toFixed(2), allowedColorsOk: t.allowedOk, ...t.m, bbox: undefined })),
    }
    writeFileSync(path.join(OUT, 'measure.json'), JSON.stringify(json, null, 2) + '\n')
    console.log(`出了 sheet.png、mono.png、small-48.png、measure.json：${rel(OUT)}`)
  }
} finally {
  await browser.close()
}
