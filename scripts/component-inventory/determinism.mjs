#!/usr/bin/env node
// 构件清点 · 重跑一致性：同样的脚本在全新的本地网站上再拍一轮（INVENTORY_RENDER_DIR=run2），两轮的分析结果逐项对。
// 用法：
//   INVENTORY_RENDER_DIR=run2 INVENTORY_PORT_OFFSET=2 node scripts/component-inventory/render.mjs
//   INVENTORY_RENDER_DIR=run2 node scripts/component-inventory/analyze.mjs
//   node scripts/component-inventory/determinism.mjs
// 出 data/determinism.json：每类种数、处数、每种的样子签名和次数，两轮有差的逐条列出。
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { DATA, RAW, KINDS } from './lib.mjs'

const a = JSON.parse(readFileSync(path.join(RAW, 'analysis.json'), 'utf8'))
const b = JSON.parse(readFileSync(path.join(RAW, 'run2', 'analysis.json'), 'utf8'))
// 变体编号按次数排，次数一样时顺序可能换；所以按「样子」比，不按编号比
const sig = (v) => JSON.stringify([v.kind, v.look.bg, v.look.border, v.look.radius, v.look.shadow, v.look.color, v.look.font, v.look.height, v.look.icon])
const pack = (A) => { const m = new Map(); for (const v of A.variants.filter((x) => !x.seed)) m.set(sig(v), { id: v.id, count: v.count, sites: v.sites, drift: v.drift.length }); return m }
const ma = pack(a), mb = pack(b)
const perKind = KINDS.map(([k, lab]) => {
  const va = a.variants.filter((v) => v.kind === k && !v.seed), vb = b.variants.filter((v) => v.kind === k && !v.seed)
  return { kind: k, label: lab, variants: [va.length, vb.length], count: [va.reduce((n, v) => n + v.count, 0), vb.reduce((n, v) => n + v.count, 0)] }
})
const onlyA = [...ma].filter(([s]) => !mb.has(s)).map(([s, v]) => ({ look: JSON.parse(s), ...v }))
const onlyB = [...mb].filter(([s]) => !ma.has(s)).map(([s, v]) => ({ look: JSON.parse(s), ...v }))
const countDiff = [...ma].filter(([s, v]) => mb.has(s) && (mb.get(s).count !== v.count || mb.get(s).sites !== v.sites)).map(([s, v]) => ({ look: JSON.parse(s), first: [v.id, v.count, v.sites], second: [mb.get(s).id, mb.get(s).count, mb.get(s).sites] }))
const failed = (A) => A.scenarios.filter((s) => !s.ok).map((s) => `${s.scenario}@${s.width}`)
const out = {
  identical: !onlyA.length && !onlyB.length && !countDiff.length && perKind.every((k) => k.variants[0] === k.variants[1] && k.count[0] === k.count[1]),
  scenariosFailed: [failed(a), failed(b)], candidates: [a.totals.candidatesWide, b.totals.candidatesWide], classified: [a.totals.classified, b.totals.classified],
  seedPass: [a.seedCheck?.pass, b.seedCheck?.pass], perKind, onlyFirst: onlyA, onlySecond: onlyB, countDiff,
}
writeFileSync(path.join(DATA, 'determinism.json'), JSON.stringify(out, null, 1) + '\n')
console.log(out.identical ? '两轮完全一致' : `两轮有差：只在第一轮 ${onlyA.length} 种，只在第二轮 ${onlyB.length} 种，次数不同 ${countDiff.length} 种`)
for (const k of perKind) if (k.variants[0] !== k.variants[1] || k.count[0] !== k.count[1]) console.log(k.label, k.variants, k.count)
