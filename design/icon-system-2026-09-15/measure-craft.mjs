// 量工艺：把 Solar Linear 与 EQB v3 放到同一把尺子上，量出「成熟图标库」的可检验数字。
//   node design/icon-system-2026-09-15/measure-craft.mjs [--stroke 2.25|2.75] [--solar <icons.json>] [--map <solar map.mjs>] [--out craft-measurements.json]
// 在 Chromium 里用浏览器自己的几何（getBBox / getPointAtLength / Canvas Path2D）量，不自己解析曲线。
// 量法（24 网格单位，中心线几何 + 描边宽度）：
//   ink      墨迹外框（描边按半宽外扩）→ 宽、高、离画布边最小距离
//   gap      互不相连的墨块之间的最小净空（边到边）；墨迹重叠的笔（直接或经第三笔）并成一块，块内不算缝
//   hole     封闭的「洞」：栅格化后不与外部连通的底色区域，量最大内切圆直径
//   corner   较大封闭形（≥ 8×8）四角的等效圆角半径：角点到曲线的对角距离 / (√2 − 1)
//   dot      实心小点（外框 ≤ 3.5）的半径
//   parts    子路径数；length 描边总长（复杂度）
import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '../..')
const arg = (name) => {
  const index = process.argv.indexOf(name)
  return index === -1 ? undefined : process.argv[index + 1]
}
const solarPath = arg('--solar')
const outPath = arg('--out') ?? join(here, 'craft-measurements.json')
const mapPath = arg('--map')

const solar = solarPath ? JSON.parse(await readFile(solarPath, 'utf8')) : { icons: {} }
const v3 = await import(pathToFileURL(join(here, 'icons-v3.mjs')))
const { extended } = await import(pathToFileURL(join(here, 'extended.mjs')))
const solarMap = mapPath ? (await import(pathToFileURL(mapPath))).map : {}

const SOLAR_STROKE = 1.5
const EQB_STROKE = Number(arg('--stroke') ?? 2.25)
if (![2.25, 2.75].includes(EQB_STROKE)) throw new Error('--stroke must be 2.25 or 2.75 (EqbIcon size tiers)')

// v3 的 markup 靠根节点给描边；Solar 的 body 自带描边属性，只把 1.5 换成要量的宽度。
const v3Markup = (markup, stroke) => {
  const localTiers = markup.replace(/<(path|circle|rect)([^>]*)\/>/g, (element, tag, attrs) => {
    const small = attrs.match(/data-stroke-small="([^"]+)"/)?.[1]
    if (small === undefined) return element
    const resolved = attrs.replace(/\s*data-stroke-small="[^"]+"/, '')
    return `<${tag}${stroke < 2.75 ? resolved.replace(/stroke-width="[^"]+"/, `stroke-width="${small}"`) : resolved}/>`
  })
  return `<g fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${localTiers.replace(/class="dot"/g, 'fill="currentColor" stroke="none"').replace(/class="joint"/g, 'data-joint="1" fill="currentColor" stroke="none"')}</g>`
}

const jobs = []
for (const [name, icon] of Object.entries(solar.icons)) {
  if (name.endsWith('-linear')) jobs.push({ set: 'solar', name: name.slice(0, -7), markup: icon.body, stroke: SOLAR_STROKE })
}
// Same precedence and effective glyphs as the component generator, including extended overrides.
for (const [name, icon] of Object.entries({ ...v3.all, ...v3.passage })) {
  const group = Object.hasOwn(v3.passage, name) ? 'passage'
    : Object.hasOwn(extended, name) ? 'extended'
      : Object.hasOwn(v3.domain, name) ? 'domain' : 'generic'
  const stroke = icon.strokeWidth ?? EQB_STROKE
  jobs.push({ set: 'v3', group, name, markup: v3Markup(icon.line, stroke), stroke })
}

const require = createRequire(join(root, 'app/package.json'))
const { chromium } = require('playwright')
const browser = await chromium.launch({ channel: 'chromium', executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH })
const page = await browser.newPage()
await page.setContent('<!doctype html><body></body>')

const results = await page.evaluate((jobs) => {
  const NS = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(NS, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('width', '240')
  svg.setAttribute('height', '240')
  document.body.appendChild(svg)

  // 把 path d 转成绝对坐标并按子路径切开，才能分辨「同一笔」与「另一笔」。
  function splitSubpaths(d) {
    const tokens = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) ?? []
    const counts = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 }
    const out = []
    let current = ''
    let x = 0, y = 0, sx = 0, sy = 0, i = 0, cmd = ''
    const num = () => Number.parseFloat(tokens[i++])
    while (i < tokens.length) {
      if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++]
      const lower = cmd.toLowerCase()
      const rel = cmd !== cmd.toUpperCase()
      if (lower === 'z') {
        current += 'Z'
        x = sx; y = sy
        cmd = ''
        continue
      }
      const n = counts[lower]
      if (n === undefined) break
      const v = []
      for (let k = 0; k < n; k++) v.push(num())
      if (v.some(Number.isNaN)) break
      if (lower === 'm') {
        if (current) out.push(current)
        x = rel ? x + v[0] : v[0]; y = rel ? y + v[1] : v[1]
        sx = x; sy = y
        current = `M${x} ${y}`
        cmd = rel ? 'l' : 'L'
      } else if (lower === 'l' || lower === 't') {
        x = rel ? x + v[0] : v[0]; y = rel ? y + v[1] : v[1]
        current += `${lower === 'l' ? 'L' : 'T'}${x} ${y}`
      } else if (lower === 'h') {
        x = rel ? x + v[0] : v[0]
        current += `L${x} ${y}`
      } else if (lower === 'v') {
        y = rel ? y + v[0] : v[0]
        current += `L${x} ${y}`
      } else if (lower === 'c' || lower === 's' || lower === 'q') {
        const pts = []
        for (let k = 0; k < n; k += 2) pts.push(rel ? [x + v[k], y + v[k + 1]] : [v[k], v[k + 1]])
        current += lower.toUpperCase() + pts.map((p) => p.join(' ')).join(' ')
        ;[x, y] = pts[pts.length - 1]
      } else if (lower === 'a') {
        const ex = rel ? x + v[5] : v[5], ey = rel ? y + v[6] : v[6]
        current += `A${v[0]} ${v[1]} ${v[2]} ${v[3]} ${v[4]} ${ex} ${ey}`
        x = ex; y = ey
      }
    }
    if (current) out.push(current)
    return out
  }

  function shapeToPath(el) {
    const n = (a) => Number.parseFloat(el.getAttribute(a) ?? '0')
    const tag = el.tagName
    if (tag === 'path') return el.getAttribute('d') ?? ''
    if (tag === 'circle' || tag === 'ellipse') {
      const cx = n('cx'), cy = n('cy')
      const rx = tag === 'circle' ? n('r') : n('rx'), ry = tag === 'circle' ? n('r') : n('ry')
      return `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`
    }
    if (tag === 'rect') {
      const x = n('x'), y = n('y'), w = n('width'), h = n('height')
      const r = Math.min(n('rx') || n('ry'), w / 2, h / 2)
      if (!r) return `M${x} ${y}H${x + w}V${y + h}H${x}Z`
      return `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`
    }
    if (tag === 'line') return `M${n('x1')} ${n('y1')}L${n('x2')} ${n('y2')}`
    if (tag === 'polyline' || tag === 'polygon') {
      const pts = (el.getAttribute('points') ?? '').trim().split(/[\s,]+/).map(Number)
      let d = ''
      for (let k = 0; k < pts.length; k += 2) d += `${k ? 'L' : 'M'}${pts[k]} ${pts[k + 1]}`
      return tag === 'polygon' ? `${d}Z` : d
    }
    return ''
  }

  const probe = document.createElementNS(NS, 'path')
  svg.appendChild(probe)
  function sample(d, step) {
    probe.setAttribute('d', d)
    const length = probe.getTotalLength()
    const pts = []
    const count = Math.max(2, Math.ceil(length / step))
    for (let k = 0; k <= count; k++) {
      const p = probe.getPointAtLength((length * k) / count)
      pts.push([p.x, p.y])
    }
    const bbox = probe.getBBox()
    return { length, pts, bbox: { x: bbox.x, y: bbox.y, w: bbox.width, h: bbox.height } }
  }

  function holes(parts) {
    const scale = 10
    const size = 24 * scale
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    ctx.scale(scale, scale)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (const part of parts) {
      const path = new Path2D(part.d)
      if (part.filled) ctx.fill(path, part.evenodd ? 'evenodd' : 'nonzero')
      if (part.stroked) {
        ctx.lineWidth = part.stroke
        ctx.stroke(path)
      }
    }
    const data = ctx.getImageData(0, 0, size, size).data
    const ink = new Uint8Array(size * size)
    for (let k = 0; k < size * size; k++) ink[k] = data[k * 4 + 3] > 127 ? 1 : 0
    const label = new Int32Array(size * size)
    const queue = new Int32Array(size * size)
    const fill = (start, id) => {
      let head = 0, tail = 0
      queue[tail++] = start
      label[start] = id
      const cells = []
      while (head < tail) {
        const c = queue[head++]
        cells.push(c)
        const cx = c % size, cy = (c - cx) / size
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, ny = cy + dy
          if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue
          const nc = ny * size + nx
          if (ink[nc] || label[nc]) continue
          label[nc] = id
          queue[tail++] = nc
        }
      }
      return cells
    }
    fill(0, 1)
    const found = []
    let id = 2
    for (let k = 0; k < size * size; k++) {
      if (ink[k] || label[k]) continue
      const cells = fill(k, id++)
      if (cells.length < 4) continue
      // 最大内切圆：洞内每格到最近墨迹格的距离，取最大（只在洞外框附近找墨，够用）。
      let best = 0, bestAt = null
      const xs = cells.map((c) => c % size), ys = cells.map((c) => (c - (c % size)) / size)
      const minX = Math.max(0, Math.min(...xs) - 2), maxX = Math.min(size - 1, Math.max(...xs) + 2)
      const minY = Math.max(0, Math.min(...ys) - 2), maxY = Math.min(size - 1, Math.max(...ys) + 2)
      const border = []
      for (let yy = minY; yy <= maxY; yy++) for (let xx = minX; xx <= maxX; xx++) if (ink[yy * size + xx]) border.push([xx, yy])
      for (let c = 0; c < cells.length; c += Math.max(1, Math.floor(cells.length / 1500))) {
        const px = xs[c], py = ys[c]
        let nearest = Infinity
        for (const [bx, by] of border) {
          const dd = (bx - px) ** 2 + (by - py) ** 2
          if (dd < nearest) nearest = dd
        }
        if (nearest > best) { best = nearest; bestAt = [px / scale, py / scale] }
      }
      found.push({ area: cells.length / scale / scale, width: (2 * Math.sqrt(best)) / scale, at: bestAt })
    }
    return found
  }

  const out = []
  for (const job of jobs) {
    const g = document.createElementNS(NS, 'g')
    g.innerHTML = job.markup
    svg.appendChild(g)
    const elements = [...g.querySelectorAll('path,circle,rect,ellipse,line,polyline,polygon')]
    const parts = []
    let caps = new Set(), joins = new Set()
    for (const el of elements) {
      const style = getComputedStyle(el)
      const stroked = style.stroke !== 'none' && style.stroke !== ''
      const filled = style.fill !== 'none' && style.fill !== ''
      if (Number.parseFloat(style.opacity) === 0) continue
      if (stroked) {
        caps.add(style.strokeLinecap)
        joins.add(style.strokeLinejoin)
      }
      const d = shapeToPath(el)
      if (!d) continue
      // Filled compound contours are one shape: drawing their subpaths separately fills
      // the counter back in (e.g. Sliders B+'s reverse-winding inner contour).
      const subs = el.tagName === 'path' && !filled ? splitSubpaths(d) : [d]
      // v3 的 joint 是交接处补的圆角填充，本身就贴着两笔，不参与净空。
      const joint = el.hasAttribute('data-joint')
      const stroke = Number.parseFloat(style.strokeWidth)
      for (const sub of subs) parts.push({ d: sub, stroked, stroke, filled, joint, evenodd: style.fillRule === 'evenodd' })
    }
    g.remove()

    const stroke = job.stroke
    let ink = null
    let length = 0
    const sampled = []
    const dots = []
    const corners = []
    for (const [index, part] of parts.entries()) {
      const s = sample(part.d, 0.2)
      const grow = part.stroked ? part.stroke / 2 : 0
      const box = { x0: s.bbox.x - grow, y0: s.bbox.y - grow, x1: s.bbox.x + s.bbox.w + grow, y1: s.bbox.y + s.bbox.h + grow }
      ink = ink ? { x0: Math.min(ink.x0, box.x0), y0: Math.min(ink.y0, box.y0), x1: Math.max(ink.x1, box.x1), y1: Math.max(ink.y1, box.y1) } : box
      if (part.stroked) length += s.length
      if (part.filled && !part.stroked && s.bbox.w <= 3.5 && s.bbox.h <= 3.5) dots.push(Math.max(s.bbox.w, s.bbox.h) / 2)
      const closed = /Z\s*$/i.test(part.d) || Math.hypot(s.pts[0][0] - s.pts.at(-1)[0], s.pts[0][1] - s.pts.at(-1)[1]) < 0.05
      if (closed && s.bbox.w >= 8 && s.bbox.h >= 8) {
        const b = s.bbox
        const radii = []
        for (const [cx, cy] of [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]]) {
          let nearest = Infinity
          for (const [px, py] of s.pts) nearest = Math.min(nearest, Math.hypot(px - cx, py - cy))
          radii.push(nearest / (Math.SQRT2 - 1))
        }
        corners.push({ w: b.w, h: b.h, radii })
      }
      if (!part.joint) sampled.push({ index, pts: s.pts, half: part.stroked ? part.stroke / 2 : 0 })
    }

    // 互不相连的墨块之间的最小净空（边到边）。墨迹重叠的两笔并成一块；经第三笔连起来的两笔
    // （如讲台的支架顶点与屏幕底边）同属一块，不算缝——锐角交接会不会糊，看 hole。
    const pairMin = []
    const owner = sampled.map((_, k) => k)
    const findRoot = (k) => (owner[k] === k ? k : (owner[k] = findRoot(owner[k])))
    for (let a = 0; a < sampled.length; a++) {
      for (let b = a + 1; b < sampled.length; b++) {
        const A = sampled[a].pts, B = sampled[b].pts
        const edge = sampled[a].half + sampled[b].half
        let min = Infinity, at = null
        for (const p of A) for (const q of B) {
          const d = Math.hypot(p[0] - q[0], p[1] - q[1])
          if (d < min) { min = d; at = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2] }
        }
        if (min < Math.max(0.2, edge)) owner[findRoot(a)] = findRoot(b)
        else pairMin.push({ a, b, clear: min - edge, at })
      }
    }
    let gap = Infinity, gapAt = null
    for (const { a, b, clear, at } of pairMin) if (findRoot(a) !== findRoot(b) && clear < gap) { gap = clear; gapAt = at }

    const holeList = holes(parts)
    out.push({
      set: job.set,
      group: job.group,
      name: job.name,
      stroke,
      parts: parts.length,
      length: Number(length.toFixed(2)),
      ink: ink && {
        x: Number(ink.x0.toFixed(2)),
        y: Number(ink.y0.toFixed(2)),
        w: Number((ink.x1 - ink.x0).toFixed(2)),
        h: Number((ink.y1 - ink.y0).toFixed(2)),
        margin: Number(Math.min(ink.x0, ink.y0, 24 - ink.x1, 24 - ink.y1).toFixed(2)),
      },
      gap: Number.isFinite(gap) ? Number(gap.toFixed(2)) : null,
      gapAt: gapAt && gapAt.map((v) => Number(v.toFixed(1))),
      holes: holeList.map((h) => ({ area: Number(h.area.toFixed(2)), width: Number(h.width.toFixed(2)), at: h.at && h.at.map((v) => Number(v.toFixed(1))) })),
      corners: corners.map((c) => ({ w: Number(c.w.toFixed(2)), h: Number(c.h.toFixed(2)), radii: c.radii.map((r) => Number(r.toFixed(2))) })),
      dots: dots.map((r) => Number(r.toFixed(2))),
      caps: [...caps],
      joins: [...joins],
    })
  }
  return out
}, jobs)
await browser.close()

await writeFile(outPath, `${JSON.stringify({ solarSource: solarPath ? 'icons.json (@iconify-json/solar)' : null, solarStroke: SOLAR_STROKE, eqbStroke: EQB_STROKE, map: solarMap, icons: results })}\n`)
console.log(`Measured ${results.length} icons → ${outPath}`)
