#!/usr/bin/env node
// 构件清点 · 清单：从 analysis.json（和 render.json）直接生成 inventory.md 里的表，文档里的数都能重跑出来。
// 出：design/components-2026-11-13/inventory.md
//   一、九类各有几种（走样几种、主线上几种、覆盖率）
//   二、优先级表（老师在干什么 × 出现次数 × 在不在主线）
//   三、变体 × 选项草表（每类哪些维度真的在变，推第一批构件的选项）
//   四、逐类变体明细
//   五、对得上对不上：源码与实拍、故意塞的变体、没拍到的原因、无障碍、行为
// 用法：node scripts/component-inventory/report.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { OUT, DATA, RAW, KINDS } from './lib.mjs'
import { SCENARIOS } from './scenarios.mjs'
const MAINLINE = new Set(SCENARIOS.filter((s) => s.mainline).map((s) => s.id))

const A = JSON.parse(readFileSync(path.join(RAW, 'analysis.json'), 'utf8'))
const R = JSON.parse(readFileSync(path.join(RAW, 'render.json'), 'utf8'))
const rec = new Map(R.wide.records.map((r) => [`${r.scenario}|${r.n}`, r]))
const label = Object.fromEntries(KINDS)
const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(1)}%` : '—')
const md = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')
const L = []
const p = (...x) => L.push(...x)

// 每条实拍记录：类、工作、变体、写法位置、场景
const inst = Object.entries(A.assign).filter(([, v]) => v.kind).map(([k, v]) => ({ ...v, key: k, scenario: k.split('|')[0], inv: rec.get(k)?.inv }))
const mainSet = MAINLINE
const wideLog = A.scenarios.filter((s) => s.width === 1440), narrowLog = A.scenarios.filter((s) => s.width !== 1440)
const variants = A.variants.filter((v) => !v.seed)

p('# 界面构件清点 · 清单（脚本生成）', '',
  `> 由 \`scripts/component-inventory/report.mjs\` 从 \`analysis.json\` 生成，别手改；重跑方法见 README。`,
  `> 本地测试数据（四个题组的一套卷 + 一个 owner 账号），1440 宽实拍 ${wideLog.filter((s) => s.ok).length}/${wideLog.length} 个页面状态（主线上 ${[...MAINLINE].length} 个），390 宽复拍 ${narrowLog.filter((s) => s.ok).length}/${narrowLog.length} 个。拍失败的：${A.scenarios.filter((s) => !s.ok).map((s) => `${s.scenario}@${s.width}`).join('、') || '无'}。`,
  `> 所有分组、「干什么」的归类、优先级和选项都是 **提案 · 单一来源**（只有清点脚本和我看过；复核方的独立分组对比见 README 第六节）。`, '')

// 一、总表
p('## 一、九类各有几种', '',
  '| 类 | 种数（容差合并后） | 其中并入了走样 | 精确签名种数 | 实拍处数 | 主线上的种数 | 一件事不止一种样子 | 源码写法位置 | 实拍到的位置 | 覆盖率 |',
  '|---|---|---|---|---|---|---|---|---|---|')
for (const [kind, lab] of KINDS) {
  const vs = variants.filter((v) => v.kind === kind)
  const rc = A.reconcile.find((r) => r.kind === kind) || {}
  const multi = A.jobView.filter((j) => j.kind === kind && j.variants > 1)
  p(`| ${lab} | ${vs.length} | ${vs.filter((v) => v.drift.length).length} | ${vs.reduce((n, v) => n + v.exactSigs, 0)} | ${vs.reduce((n, v) => n + v.count, 0)} | ${vs.filter((v) => v.mainline).length} | ${multi.length ? multi.map((j) => `${j.job}（${j.variants} 种）`).join('、') : '—'} | ${rc.staticSites ?? '—'} | ${rc.renderedSites ?? '—'} | ${rc.coverage ?? '—'}% |`)
}
p('', `实拍候选 ${A.totals.candidatesWide} 个元素，归进九类 ${A.totals.classified} 个；没归类的：${Object.entries(A.totals.unclassified).map(([k, n]) => `${k} ${n}`).join('，')}。`,
  '「种数」= 按实算样式签名分组、再把差一点点的（色差 ΔE76 ≤ 3、圆角 ±1px、字号 ±0.5px、高度 ±2px、内边距 ±2px、影子 ±1px）并成一种之后的数；「并入了走样」= 这一种里有差一点点的写法被并进来，明细在第四节。', '')

// 二、优先级表
p('## 二、优先级表（出现次数 × 在不在主线）', '',
  '一行 = 一类里的一件事（老师在这里要干什么）。「写法位置」= 源码里不同的写法位置数（同一处写法在每页都出现也只算 1）；「页面数」= 在几个页面状态里看得到；「次数」= 实拍到的总次数（顶栏这种每页都有的会很大，只作参考）。',
  `分档规则（机械规则，不是判断）：**P1** = 在 ≥ 3 个主线页面上出现（主线页面 = ${[...mainSet].join('、')}）；**P2** = 在主线页面上出现过，或写法位置 ≥ 5；**P3** = 其余。同档内先按样子种数（越多越该统一）、再按写法位置排。顶栏在每页都有，所以顶栏里的事都会进 P1。`, '',
  '| 档 | 类 | 老师在干什么 | 样子种数 | 写法位置 | 页面数 | 其中主线页面 | 次数 | 变体 |', '|---|---|---|---|---|---|---|---|---|')
const jobs = {}
for (const i of inst) {
  if (i.variant === 'state' || !i.job) continue
  const k = `${i.kind}\u0000${i.job}`
  const j = (jobs[k] ||= { kind: i.kind, job: i.job, sites: new Set(), pages: new Set(), mainPages: new Set(), n: 0, vars: new Set() })
  j.sites.add(i.inv); j.pages.add(i.scenario); j.n++; if (mainSet.has(i.scenario)) j.mainPages.add(i.scenario); if (i.variant) j.vars.add(i.variant)
}
const tier = (j) => (j.mainPages.size >= 3 ? 'P1' : j.mainPages.size || j.sites.size >= 5 ? 'P2' : 'P3')
const prio = Object.values(jobs).sort((a, b) => tier(a).localeCompare(tier(b)) || b.vars.size - a.vars.size || b.sites.size - a.sites.size || b.mainPages.size - a.mainPages.size)
for (const j of prio) p(`| ${tier(j)} | ${label[j.kind]} | ${md(j.job)} | ${j.vars.size} | ${j.sites.size} | ${j.pages.size} | ${j.mainPages.size} | ${j.n} | ${[...j.vars].join(' ')} |`)
writeFileSync(path.join(DATA, 'priority.json'), JSON.stringify(prio.map((j) => ({ tier: tier(j), kind: j.kind, job: j.job, sites: j.sites.size, pages: j.pages.size, count: j.n, mainlinePages: j.mainPages.size, variants: [...j.vars] })), null, 1) + '\n')
p('')

// 三、变体 × 选项
p('## 三、变体 × 选项草表（提案 · 单一来源）', '',
  '每类把实拍到的种按维度摊开：哪个维度真的有几种取值、每种取值覆盖多少处。',
  '推选项的机械规则：一个维度上覆盖 ≥ 10% 实拍处数的取值算「选项」；不到 10% 的算「待收敛」（要么并到最近的选项，要么查到 Owner 决定后升为选项）。只有一个取值的维度不需要做成选项。', '')
const tone = (v) => `${v.look.tokens?.bg && v.look.tokens.bg !== 'transparent' ? v.look.tokens.bg : v.look.bg} / ${v.look.tokens?.color || v.look.color}`
const hBucket = (h) => (!h ? '不定高' : h <= 24 ? '≤24' : h <= 30 ? '25–30' : h <= 36 ? '31–36' : h <= 44 ? '37–44' : '>44')
const DIMS = [
  ['底色 / 字色', tone], ['圆角', (v) => v.look.radius.join('/')], ['高度档', (v) => hBucket(v.look.height)], ['影子', (v) => (v.look.shadow === 'none' ? '无' : v.look.shadow)],
  ['边框', (v) => (v.look.border.every((b) => b === 'none') ? '无' : '有')], ['字号 / 字重', (v) => v.look.font], ['图标', (v) => v.look.icon || '—'],
]
const options = {}
for (const [kind, lab] of KINDS) {
  const vs = variants.filter((v) => v.kind === kind)
  if (!vs.length) continue
  const total = vs.reduce((n, v) => n + v.count, 0)
  p(`### ${lab}（${vs.length} 种，${total} 处）`, '', '| 维度 | 取值数 | 选项（≥10%） | 待收敛（<10%） |', '|---|---|---|---|')
  options[kind] = {}
  for (const [dim, f] of DIMS) {
    const m = {}; for (const v of vs) { const k = f(v); (m[k] ||= { n: 0, ids: [] }).n += v.count; m[k].ids.push(v.id) }
    const ent = Object.entries(m).sort((a, b) => b[1].n - a[1].n)
    if (ent.length < 2) { p(`| ${dim} | 1 | ${md(ent[0]?.[0])}（全部）| — |`); options[kind][dim] = { single: ent[0]?.[0] }; continue }
    const keep = ent.filter(([, x]) => x.n / total >= 0.1), rest = ent.filter(([, x]) => x.n / total < 0.1)
    options[kind][dim] = { options: keep.map(([k, x]) => ({ value: k, count: x.n, variants: x.ids })), toMerge: rest.map(([k, x]) => ({ value: k, count: x.n, variants: x.ids })) }
    p(`| ${dim} | ${ent.length} | ${keep.map(([k, x]) => `${md(k)}（${x.n}）`).join('；') || '—'} | ${rest.map(([k, x]) => `${md(k)}（${x.n}：${x.ids.join(' ')}）`).join('；') || '—'} |`)
  }
  p('')
}
writeFileSync(path.join(DATA, 'options.json'), JSON.stringify(options, null, 1) + '\n')

// 四、逐类明细
p('## 四、逐类变体明细', '', '对照图：同目录 `sheet-<类>.png`。「对不上」只列客观检查（DESIGN.md 四档影子与圆角家族、色阶、WCAG 对比度、24×24 点击区域、焦点可见、读屏名字、axe）；「有意」= 查得到 Owner 原话或拍板文档。', '')
for (const [kind, lab] of KINDS) {
  const vs = variants.filter((v) => v.kind === kind)
  p(`### ${lab}`, '', '| 编号 | 类名 | 处 / 位置 / 页面 | 主线 | 干什么 | 样子 | 走样并入 | 对不上 | 来历 | 有意？ | 抽构件 | 检查脚本锁 |', '|---|---|---|---|---|---|---|---|---|---|---|---|')
  for (const v of vs) {
    const bad = v.checks.filter((c) => !c.ok).map((c) => c.note)
    if (v.contrastOk === false) bad.push(`对比度 ${v.contrast}`)
    if (v.target && !v.target.ok) bad.push(`点击 ${v.target.w}×${v.target.h}`)
    if (v.focusVisible === false) bad.push('焦点看不出')
    if (v.noName) bad.push(`${v.noName} 处无读屏名字`)
    for (const [r, n] of v.axe) bad.push(`axe ${r}×${n}`)
    const look = `底 ${v.look.bg} 字 ${v.look.color} ${v.look.font} 圆角 ${v.look.radius.join('/')} 影 ${v.look.shadow}${v.look.height ? ` 高 ${v.look.height}` : ''}`
    p(`| ${v.id} | ${md(v.primaryClass || '（无）')} | ${v.count} / ${v.sites} / ${v.scenarios.length} | ${v.mainline ? '是' : ''} | ${md(v.jobs.map(([j, n]) => `${j} ${n}`).join('；'))} | ${md(look)} | ${md(v.drift.map((d) => `${d.count} 处：${d.diffs.join('，')}`).join('；') || '—')} | ${md(bad.join('；') || '—')} | ${v.provenance?.first ? `${v.provenance.first.date} ${v.provenance.first.hash}` : '—'} | ${md(v.intent)} | ${md(v.difficulty.level)} | ${v.provenance?.lockedBy?.length || 0} |`)
  }
  p('')
}

// 五、对得上对不上
p('## 五、证明', '', '### 1. 源码静态统计 vs 页面实拍', '', '| 类 | 源码写法位置 | 实拍到的位置 | 两边一致 | 只在页面（源码归了别的类） | 源码有、页面归成别的类 | 源码有、没拍到 | 覆盖率 |', '|---|---|---|---|---|---|---|---|')
for (const r of A.reconcile) p(`| ${r.label} | ${r.staticSites} | ${r.renderedSites} | ${r.matched} | ${r.onlyRenderedSites}${Object.keys(r.onlyRenderedWhy).length ? `（${md(Object.entries(r.onlyRenderedWhy).map(([k, n]) => `${k} ${n}`).join('；'))}）` : ''} | ${r.staticRenderedAsOtherKind}${Object.keys(r.otherKindWhy).length ? `（${md(Object.entries(r.otherKindWhy).map(([k, n]) => `${k} ${n}`).join('；'))}）` : ''} | ${r.staticNotRendered} | ${r.coverage}% |`)
p('', '### 2. 没拍到的写法位置，按原因', '', '原因由脚本从源码里包着这个元素的最内层条件推出来（逐条见 `data/uncaptured.json`）。', '', '| 类 | 原因 | 位置数 |', '|---|---|---|')
const why = {}; for (const u of A.uncaptured) { const k = `${u.kind}\u0000${u.reason.replace(/（.*$/, '')}`; why[k] = (why[k] || 0) + 1 }
for (const [k, n] of Object.entries(why).sort((a, b) => a[0].localeCompare(b[0]) || b[1] - a[1])) { const [kind, r] = k.split('\u0000'); p(`| ${label[kind]} | ${md(r)} | ${n} |`) }
const sc = A.seedCheck
p('', '### 3. 故意塞的变体（找不找得出来）', '',
  `在找题页上按一个真实按钮（${md(sc.planted.ref)}「${md(sc.planted.refText)}」）塞三个：`, '',
  `- A 全新样子（品红 #FF00AA、圆角 3px、字号 11px）→ ${sc.A_novel.ownVariant ? `单独成一种 ${sc.A_novel.variant}` : '没单独成一种'}；检查标出：${md(sc.A_novel.flagged.join('、') || '无')}`,
  `- B 差一点点（圆角 +0.5px、字色红通道 +2）→ ${sc.B_near.mergedWithRef ? `并进参照那一种 ${sc.B_near.variant}` : '没并进参照'}，${sc.B_near.flaggedAsDrift ? `记为走样：${md(sc.B_near.diffs.join('、'))}` : '没记为走样'}`,
  `- C 一模一样的复制 → ${sc.C_exact.mergedWithRef && sc.C_exact.sameExactSignature ? '同一个精确签名，不算走样' : '没对上'}`, '',
  `结论：${sc.pass ? '三个都按预期找出来了' : '**没全找出来**'}。塞的元素只用于这次检查，不计入上面任何数。`, '')
p('### 4. 行为（源码里怎么实现的）', '', '| 行为 | 实现处数 | 在哪些组件 |', '|---|---|---|')
const B = A.behavior
const comps = (xs) => [...new Set(xs.map((x) => x.component))].join('、')
p(`| 撤销 | ${B.undo.length} | ${md(comps(B.undo))} |`, `| 计时器（毫秒） | ${B.timers.length} | ${md([...new Set(B.timers.map((t) => `${t.component} ${t.ms}`))].join('、'))} |`,
  `| Esc 关闭 | ${B.escape.length} | ${md(comps(B.escape))} |`, `| 焦点去向（.focus()） | ${B.focus.length} | ${md(comps(B.focus))} |`,
  `| 弹层共用钩子 | ${B.modalHook.length} | ${md(comps(B.modalHook))} |`, `| 提示出现 / 消失共用钩子 | ${B.toastPresence.length} | ${md(B.toastPresence.map((t) => `${t.component}（${t.args}）`).join('、'))} |`,
  `| 读屏播报（aria-live / role=alert/status） | ${B.ariaLive.length} | ${md([...new Set(B.ariaLive.map((x) => x.live))].map((l) => `${l} ${B.ariaLive.filter((x) => x.live === l).length}`).join('、'))} |`,
  `| 加载占位（aria-busy / loading 类） | ${B.loading.length} | — |`, '')

writeFileSync(path.join(OUT, 'inventory.md'), L.join('\n').trimEnd() + '\n')
console.log('inventory.md', L.length, '行；priority', prio.length, '行')
