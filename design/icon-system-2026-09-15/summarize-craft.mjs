// 把 measure-craft.mjs 的结果汇总成规则草案要用的数字表（Markdown）。
//   node design/icon-system-2026-09-15/summarize-craft.mjs [craft-measurements.json]
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const data = JSON.parse(await readFile(process.argv[2] ?? join(here, 'craft-measurements.json'), 'utf8'))
const icons = data.icons

const q = (values, p) => {
  const v = values.filter((x) => x != null && Number.isFinite(x)).sort((a, b) => a - b)
  if (!v.length) return null
  return v[Math.min(v.length - 1, Math.max(0, Math.round((v.length - 1) * p)))]
}
const f = (x, digits = 2) => (x == null ? '—' : Number(x.toFixed(digits)).toString())
const span = (values) => `${f(q(values, 0.1))} / ${f(q(values, 0.5))} / ${f(q(values, 0.9))}`

const centerline = (icon) => (icon.ink ? Math.max(icon.ink.w, icon.ink.h) - icon.stroke : null)
const gapRatio = (icon) => (icon.gap == null ? null : icon.gap / icon.stroke)
const smallestHole = (icon) => {
  const holes = icon.holes.filter((h) => h.area > 1)
  return holes.length ? Math.min(...holes.map((h) => h.width)) : null
}

const mapped = new Set(Object.values(data.map ?? {}).map((m) => m.solar))
const groups = {
  'Solar Linear 全部': icons.filter((i) => i.set === 'solar'),
  'Solar 对应站内 62 个': icons.filter((i) => i.set === 'solar' && mapped.has(i.name)),
  'v3 通用层': icons.filter((i) => i.set === 'v3' && i.group === 'generic'),
  'v3 领域层 + 题型': icons.filter((i) => i.set === 'v3' && i.group !== 'generic'),
}

const lines = []
lines.push('| 组 | 数量 | 中心线最大边 p10/p50/p90 | 离画布边 p10/p50/p90 | 最小净空 ÷ 描边 p10/p50/p90 | 最小洞宽 ÷ 描边 p10/p50/p90 | 子路径数 p50/p90 | 描边总长 p50/p90 |')
lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |')
for (const [name, list] of Object.entries(groups)) {
  lines.push(`| ${name} | ${list.length} | ${span(list.map(centerline))} | ${span(list.map((i) => i.ink?.margin))} | ${span(list.map(gapRatio))} | ${span(list.map((i) => { const h = smallestHole(i); return h == null ? null : h / i.stroke }))} | ${f(q(list.map((i) => i.parts), 0.5), 0)} / ${f(q(list.map((i) => i.parts), 0.9), 0)} | ${f(q(list.map((i) => i.length), 0.5), 0)} / ${f(q(list.map((i) => i.length), 0.9), 0)} |`)
}

// 基准形（keyline）：只看 Solar 里单独成立的大圆、大方、竖长方。
const shapes = { circle: [], square: [], portrait: [], landscape: [] }
for (const icon of groups['Solar Linear 全部']) {
  for (const c of icon.corners) {
    const r = c.radii.slice().sort((a, b) => a - b)[1]
    const half = Math.min(c.w, c.h) / 2
    if (Math.abs(c.w - c.h) < 0.6 && r > half * 0.92) shapes.circle.push({ d: c.w })
    else if (Math.abs(c.w - c.h) < 0.6) shapes.square.push({ s: c.w, r })
    else if (c.h > c.w) shapes.portrait.push({ w: c.w, h: c.h, r })
    else shapes.landscape.push({ w: c.w, h: c.h, r })
  }
}
const mode = (values) => {
  const counts = new Map()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([v, n]) => `${v}（${n}）`).join('、')
}
const round = (x) => Math.round(x * 2) / 2
lines.push('')
lines.push('| 基准形（Solar，中心线） | 数量 | 尺寸最常见值（次数） | 圆角 p10/p50/p90 |')
lines.push('| --- | --- | --- | --- |')
lines.push(`| 圆 | ${shapes.circle.length} | 直径 ${mode(shapes.circle.map((s) => round(s.d)))} | — |`)
lines.push(`| 方 | ${shapes.square.length} | 边长 ${mode(shapes.square.map((s) => round(s.s)))} | ${span(shapes.square.map((s) => s.r))} |`)
lines.push(`| 竖长方 | ${shapes.portrait.length} | 宽×高 ${mode(shapes.portrait.map((s) => `${round(s.w)}×${round(s.h)}`))} | ${span(shapes.portrait.map((s) => s.r))} |`)
lines.push(`| 横长方 | ${shapes.landscape.length} | 宽×高 ${mode(shapes.landscape.map((s) => `${round(s.w)}×${round(s.h)}`))} | ${span(shapes.landscape.map((s) => s.r))} |`)

lines.push('')
lines.push(`| 实心点半径 | 数量 | p10/p50/p90 |`)
lines.push('| --- | --- | --- |')
for (const [name, list] of Object.entries(groups)) {
  const dots = list.flatMap((i) => i.dots)
  lines.push(`| ${name} | ${dots.length} | ${span(dots)} |`)
}

// 一对一：站内 62 个 v3 与映射到的 Solar。
lines.push('')
lines.push('| 站内图标 | Solar | 中心线最大边 v3 / Solar | 离画布边 v3 / Solar | 最小净空÷描边 v3 / Solar | 最小洞宽÷描边 v3 / Solar | 子路径 v3 / Solar |')
lines.push('| --- | --- | --- | --- | --- | --- | --- |')
for (const [key, { solar }] of Object.entries(data.map ?? {})) {
  const a = icons.find((i) => i.set === 'v3' && i.name === key)
  const b = icons.find((i) => i.set === 'solar' && i.name === solar)
  if (!a || !b) continue
  const hr = (i) => { const h = smallestHole(i); return h == null ? null : h / i.stroke }
  lines.push(`| ${key} | ${solar} | ${f(centerline(a))} / ${f(centerline(b))} | ${f(a.ink?.margin)} / ${f(b.ink?.margin)} | ${f(gapRatio(a))} / ${f(gapRatio(b))} | ${f(hr(a))} / ${f(hr(b))} | ${a.parts} / ${b.parts} |`)
}

console.log(lines.join('\n'))
