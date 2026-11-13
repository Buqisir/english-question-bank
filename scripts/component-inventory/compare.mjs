#!/usr/bin/env node
// 构件清点 · 复核对比：把复核方（只看原始数据、不看我的结论）的分组和 analyze.mjs 的分组逐条对。
// 复核方的结果放在 design/components-2026-11-13/data/reviewer-grouping.json，格式：
//   { records: { "<scenario>|<n>": { kind: "button"|…|null, look: "<复核方自己的样子编号>", job: "<老师在干什么>" } } }
// 指标：类别一致率和 Cohen κ；同类里「是不是同一种样子」的成对一致（精确率、召回率、F1）和调整兰德指数；
//      「是不是同一件事」同样算成对一致。输出 data/review-compare.json。
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { DATA, RAW, KINDS } from './lib.mjs'

// 复核方拿到的是 .scratch/component-inventory/reviewed/render.json（交给复核方那一刻的实拍数据），对比也只用这一份上的分析
// 这份数据压缩后存在 data/reviewed-render.json.gz；本地没有 .scratch 时先解出来、在它上面跑一遍 analyze
const REVIEWED = path.join(RAW, 'reviewed')
if (!existsSync(path.join(REVIEWED, 'analysis.json'))) {
  mkdirSync(REVIEWED, { recursive: true })
  writeFileSync(path.join(REVIEWED, 'render.json'), gunzipSync(readFileSync(path.join(DATA, 'reviewed-render.json.gz'))))
  const r = spawnSync('node', [fileURLToPath(new URL('./analyze.mjs', import.meta.url))], { env: { ...process.env, INVENTORY_RENDER_DIR: 'reviewed' }, stdio: 'inherit' })
  if (r.status !== 0) throw new Error('analyze on reviewed data failed')
}
const mine = JSON.parse(readFileSync(path.join(REVIEWED, 'analysis.json'), 'utf8')).assign
const theirs = JSON.parse(readFileSync(path.join(DATA, 'reviewer-grouping.json'), 'utf8')).records
const keys = Object.keys(mine).filter((k) => k in theirs)
const missing = Object.keys(mine).filter((k) => !(k in theirs)).length
const K = [...KINDS.map(([k]) => k), 'none']
const kOf = (x) => (x && x.kind ? x.kind : 'none')

// 类别：一致率、κ、混淆表
const conf = Object.fromEntries(K.map((a) => [a, Object.fromEntries(K.map((b) => [b, 0]))]))
for (const k of keys) conf[kOf(mine[k])][kOf(theirs[k])] = (conf[kOf(mine[k])][kOf(theirs[k])] ?? 0) + 1
const n = keys.length
const agree = K.reduce((s, a) => s + conf[a][a], 0)
const pe = K.reduce((s, a) => s + (K.reduce((x, b) => x + conf[a][b], 0) / n) * (K.reduce((x, b) => x + conf[b][a], 0) / n), 0)
const kappa = (agree / n - pe) / (1 - pe)

// 成对一致：在两边都归到同一类的记录里，比较「同一组」关系
function pairStats(field) {
  const out = {}
  for (const kind of K.slice(0, -1)) {
    const ks = keys.filter((k) => kOf(mine[k]) === kind && kOf(theirs[k]) === kind && mine[k][field] && theirs[k][field] && mine[k][field] !== 'state')
    let tp = 0, fp = 0, fn = 0, tn = 0
    for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) {
      const a = mine[ks[i]][field] === mine[ks[j]][field], b = theirs[ks[i]][field] === theirs[ks[j]][field]
      if (a && b) tp++; else if (!a && b) fp++; else if (a && !b) fn++; else tn++
    }
    const P = tp / (tp + fp || 1), R = tp / (tp + fn || 1)
    // 调整兰德指数
    const tot = tp + fp + fn + tn, sa = tp + fn, sb = tp + fp, exp = tot ? (sa * sb) / tot : 0, mx = (sa + sb) / 2
    const ari = mx - exp ? (tp - exp) / (mx - exp) : 1
    const groupsMine = new Set(ks.map((k) => mine[k][field])).size, groupsTheirs = new Set(ks.map((k) => theirs[k][field])).size
    out[kind] = { records: ks.length, groupsMine, groupsTheirs, precision: +P.toFixed(3), recall: +R.toFixed(3), f1: +((2 * P * R) / (P + R || 1)).toFixed(3), ari: +ari.toFixed(3) }
  }
  return out
}
// 分歧最大的几处：我放一组、对方拆开（或反过来）
function splits(field) {
  const res = []
  for (const kind of K.slice(0, -1)) {
    const ks = keys.filter((k) => kOf(mine[k]) === kind && kOf(theirs[k]) === kind && mine[k][field] && mine[k][field] !== 'state')
    const byMine = {}; for (const k of ks) (byMine[mine[k][field]] ||= {})[theirs[k][field]] = ((byMine[mine[k][field]] ||= {})[theirs[k][field]] || 0) + 1
    for (const [m, t] of Object.entries(byMine)) if (Object.keys(t).length > 1) res.push({ kind, mine: m, theirsSplit: t })
    const byTheirs = {}; for (const k of ks) (byTheirs[theirs[k][field]] ||= {})[mine[k][field]] = ((byTheirs[theirs[k][field]] ||= {})[mine[k][field]] || 0) + 1
    for (const [t, m] of Object.entries(byTheirs)) if (Object.keys(m).length > 1) res.push({ kind, theirs: t, mineSplit: m })
  }
  return res
}
// 我这边叫 variant，复核方叫 look：统一成同一字段名再算
for (const k of keys) theirs[k].variant = theirs[k].look
// 嵌套：我分出的每一种，是不是完整落在对方的某一种里（是 = 我只是分得更细，不是分错）
const nesting = {}
for (const kind of K.slice(0, -1)) {
  const ks = keys.filter((k) => kOf(mine[k]) === kind && kOf(theirs[k]) === kind && mine[k].variant && mine[k].variant !== 'state')
  const m = {}, t = {}
  for (const k of ks) { (m[mine[k].variant] ||= new Set()).add(theirs[k].variant); (t[theirs[k].variant] ||= new Set()).add(mine[k].variant) }
  if (!ks.length) continue
  nesting[kind] = { mine: Object.keys(m).length, mineInsideOneOfTheirs: Object.values(m).filter((x) => x.size === 1).length, theirs: Object.keys(t).length,
    theirsInsideOneOfMine: Object.values(t).filter((x) => x.size === 1).length, mineSpanningSeveral: Object.entries(m).filter(([, x]) => x.size > 1).map(([id, x]) => ({ id, theirs: [...x] })) }
}
const result = { records: n, notReviewed: missing, kind: { agreement: +(agree / n).toFixed(3), kappa: +kappa.toFixed(3), confusion: conf },
  look: pairStats('variant'), job: pairStats('job'), lookSplits: splits('variant'), nesting }
writeFileSync(path.join(DATA, 'review-compare.json'), JSON.stringify(result, null, 1) + '\n')
console.log(`记录 ${n}（复核方没给的 ${missing}）· 类别一致 ${(agree / n * 100).toFixed(1)}% · κ ${kappa.toFixed(3)}`)
for (const [k, v] of Object.entries(nesting)) console.log(k, `我的 ${v.mine} 种里 ${v.mineInsideOneOfTheirs} 种完整落在对方一种里；对方 ${v.theirs} 种里 ${v.theirsInsideOneOfMine} 种完整落在我一种里`)
for (const [k, v] of Object.entries(result.look)) console.log(k, '样子', JSON.stringify(v), '工作', JSON.stringify(result.job[k]))
