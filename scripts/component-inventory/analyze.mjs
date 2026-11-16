#!/usr/bin/env node
// 构件清点 · 归类和分析：把页面实拍（render.json）和源码（static.json）对起来。
//   1 分九类、按「老师在这里要干什么」分工作组（规则写在下面，可读可改；结果是提案 · 单一来源）
//   2 每类按样式签名聚类；差一点点的（容差内）并成一种，并标成走样
//   3 每种写法：状态（悬停/焦点/按下/禁用/选中/窄屏）、次数、主线、DESIGN.md 对照、对比度、点击区域、读屏名字、焦点可见
//   4 来历：git log -S 第一次出现的提交、提到它的文档
//   5 抽成构件的难易：类名是否随状态拼、出现条件、组件文件大小、有没有检查脚本锁着
//   6 对账（源码 vs 页面）、覆盖率、验漏（种子）
// 输出：design/components-2026-11-13/data/inventory.json（提交）和 .scratch/component-inventory/analysis.json（全量）
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { ROOT, SRC, DATA, RAW, KINDS, KIND_LABEL } from './lib.mjs'

const S = JSON.parse(readFileSync(path.join(RAW, 'static.json'), 'utf8'))
// INVENTORY_RENDER_DIR=run2：分析第二次实拍（重跑核对用），结果只写进那个目录，不动提交的数据
const RUN = process.env.INVENTORY_RENDER_DIR ? path.join(RAW, process.env.INVENTORY_RENDER_DIR) : RAW
const R = JSON.parse(readFileSync(path.join(RUN, 'render.json'), 'utf8'))
const SEEDS = existsSync(path.join(RAW, 'seeds.json')) ? JSON.parse(readFileSync(path.join(RAW, 'seeds.json'), 'utf8')) : { planted: null, records: [] }
const { SCENARIOS } = await import('./scenarios.mjs')
const MAINLINE = new Set(SCENARIOS.filter((s) => s.mainline).map((s) => s.id))
// 已下线的页面（scenarios.mjs 里的 skip）：老数据里拍到了也剔掉，免得重复计首页
const SKIP = new Set(SCENARIOS.filter((s) => s.skip).map((s) => s.id))
for (const w of ['wide', 'narrow']) { R[w].records = R[w].records.filter((r) => !SKIP.has(r.scenario)); R[w].log = R[w].log.filter((l) => !SKIP.has(l.scenario)); if (R[w].states) R[w].states = R[w].states.filter?.((x) => !SKIP.has(x.scenario)) ?? R[w].states; if (R[w].axe) R[w].axe = R[w].axe.filter?.((x) => !SKIP.has(x.scenario)) ?? R[w].axe }
// 源码里写了 :focus-within 的类（焦点画在外框上），和每个文件里出现过的类
const FOCUS_WITHIN = [...new Set(S.cssRules.flatMap((r) => r.selectors).flatMap((sel) => [...sel.matchAll(/\.([\w-]+):focus-within/g)].map((m) => m[1])))]
const SITE_CLASSES_BY_FILE = new Map()
for (const j of S.jsx) { if (!SITE_CLASSES_BY_FILE.has(j.file)) SITE_CLASSES_BY_FILE.set(j.file, new Set()); for (const c of j.classes) SITE_CLASSES_BY_FILE.get(j.file).add(c.replace(/\*$/, '')) }
const site = Object.fromEntries(S.jsx.map((j) => [j.id, j]))

// ---------- 颜色 ----------
const rgba = (c) => { const m = String(c).match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1] }
const lab = ([r, g, b]) => {
  const f = (v) => { v /= 255; return v > 0.04045 ? ((v + 0.055) / 1.055) ** 2.4 : v / 12.92 }
  const [R1, G1, B1] = [f(r), f(g), f(b)]
  const X = (R1 * 0.4124 + G1 * 0.3576 + B1 * 0.1805) / 0.95047, Y = R1 * 0.2126 + G1 * 0.7152 + B1 * 0.0722, Z = (R1 * 0.0193 + G1 * 0.1192 + B1 * 0.9505) / 1.08883
  const g3 = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  return [116 * g3(Y) - 16, 500 * (g3(X) - g3(Y)), 200 * (g3(Y) - g3(Z))]
}
const dE = (a, b) => { if (!a || !b) return a === b ? 0 : 99; if ((a[3] < 0.02) !== (b[3] < 0.02)) return 99; if (a[3] < 0.02) return 0; const [l1, a1, b1] = lab(a), [l2, a2, b2] = lab(b); return Math.hypot(l1 - l2, a1 - a2, b1 - b2) + Math.abs(a[3] - b[3]) * 100 }
const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
const contrast = (fg, bg) => { if (!fg || !bg) return null; const a = fg[3] ?? 1; const c = [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a)); const L1 = lum(c), L2 = lum(bg); return Math.round(((Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)) * 100) / 100 }
const hex = (c) => { const v = rgba(c); if (!v) return c; if (v[3] < 0.02) return 'transparent'; const h = '#' + v.slice(0, 3).map((x) => Math.round(x).toString(16).padStart(2, '0')).join('').toUpperCase(); return v[3] < 1 ? `${h}/${Math.round(v[3] * 100)}%` : h }
const px = (v) => parseFloat(v) || 0

// ---------- 分类：九类 ----------
const PART = /^(icon|title|text|head|header|body|label|meta|count|caption|hint-text|desc|description|copy|inner|content|wrap|wrapper|list|actions|footer|lead|sub|glyph|art|illustration|media|img|image|svg|mark|dot|arrow|chevron|line|title-row)$/
const tokensOf = (cls) => cls.split(/\s+/).filter((t) => t && !/^(is|has)-/.test(t) && !/^visually-hidden$/.test(t))
// 一个类名的「主体词」：最后一段；如果最后一段是部件词，就不是主体
const heads = (cls) => tokensOf(cls).map((t) => { const seg = t.split(/[-_]+/); const last = seg.at(-1); const prev = seg.at(-2); return { last, prev, part: PART.test(last) } })
const hasHead = (cls, re) => heads(cls).some((h) => !h.part && (re.test(h.last) || (/^(state|wrap|box|card|panel|bar|area|root|block|container)$/.test(h.last) && re.test(h.prev || ''))))
const isPaperSheet = (r) => /(^|\s)(draft-a4-sheet|draft-a3-sheet|paper-browse-sheet|paper-sheet)(\s|$)/.test(r.cls) || /0px 12px 32px/.test(r.st.shadow)

export function classify(r) {
  const s = site[r.inv] || {}
  const role = r.role || ''
  if (isPaperSheet(r)) return { kind: null, why: '卷面（纸张本身，不算）' }
  if (['input', 'textarea', 'select'].includes(r.tag) || /^(searchbox|combobox|textbox|slider|spinbutton|checkbox|radio|switch)$/.test(role)) return { kind: 'field' }
  // 遮罩层（有的就是原生 <dialog> 外壳，如 draft-modal-backdrop）和里面的面板只算一个对话框：算面板
  if (hasHead(r.cls, /^(backdrop|scrim|overlay)$/) && !/^(dialog|alertdialog)$/.test(role)) return { kind: null, why: '对话框遮罩 / 外壳（算在里面的面板上）' }
  if (r.tag === 'dialog' || /^(dialog|alertdialog)$/.test(role) || s.ariaModal) return { kind: 'dialog' }
  if (/^(menu|listbox)$/.test(role) || (!r.interactive && hasHead(r.cls, /^(menu|dropdown|popover|drawer|modal|dialog|overlay|popup)$/) && (r.fixed || r.st.position === 'absolute' || r.shadowPainted))) return { kind: 'dialog' }
  if (r.interactive) {
    if (hasHead(r.cls, /^(chip|pill|tag|badge|seg|segment)$/) || role === 'tab') return { kind: 'chip' }
    if (r.rect.w >= 300 && r.rect.h >= 36 && (hasHead(r.cls, /^(row|item|entry|result|card)$/) || role === 'option')) return { kind: 'row' }
    return { kind: 'button' }
  }
  if (hasHead(r.cls, /^(toast|undo|snackbar)$/)) return { kind: 'toast' }
  if (hasHead(r.cls, /^(empty|blank)$/)) return { kind: 'empty' }
  if (hasHead(r.cls, /^(notice|banner|alert|hint|error|warning|callout|tip|status)$/) || /^(alert|status)$/.test(role)) return { kind: 'notice' }
  if (hasHead(r.cls, /^(chip|pill|tag|badge)$/)) return { kind: 'chip' }
  if (hasHead(r.cls, /^(row|item|entry|result)$/) && r.rect.w >= 200 && r.rect.h >= 28) return { kind: 'row' }
  if (hasHead(r.cls, /^(card|panel|board|surface|sheet|tile|suggestion|skeleton|section|pane|rail|sidebar|desk|drawer)$/) && r.painted) return { kind: 'surface' }
  if (r.painted && r.rect.w >= 120 && r.rect.h >= 40 && (r.bgPainted || r.shadowPainted || r.st.border.filter((b) => b !== 'none').length >= 3)) return { kind: 'surface' }
  if (r.painted && r.bgPainted && r.rect.h <= 30 && r.rect.w <= 220 && r.text) return { kind: 'chip' }
  return { kind: null, why: r.painted ? '只画了分隔线或装饰' : '没画东西，只是容器' }
}

// ---------- 工作组：老师在这里要干什么 ----------
// 先看老师看得到的字（读屏名字 / 文字），认不出再看点击处理函数；顺序即优先级
const BUTTON_JOBS = [
  ['展开 / 收起 / 更多', /^更多|^展开|^收起|更多信息/],
  ['撤销 / 撤回', /撤销|撤回|取消分页/],
  ['采用建议', /采用|建议前置/],
  ['加入草稿卷', /加入|已在草稿卷/],
  ['移出 / 删除', /移除|移出|删除|作废|清空/],
  ['导出 / 存 PDF', /导出|下载|打印|另存|PDF/],
  ['切换版式 / 版本', /A4|A3|散页|对折|版$/],
  ['保存', /^保存|存到/],
  ['清除搜索 / 筛选', /清除|返回浏览全部/],
  ['搜索', /^搜索|查找/],
  ['登录 / 退出', /^登录$|^退出$/],
  ['重试', /重试|重新加载/],
  ['关闭 / 不做了', /关闭|取消|保留|隐藏|知道了/],
  ['换篇', /换篇|换一篇/],
  ['调整顺序', /上移|下移/],
  ['新建', /新建|添加/],
  ['复制', /复制/],
  ['改名', /编辑|重命名/],
  ['运行维护任务', /打主题标签|回填/],
  ['去别的页（导航）', /返回|去找题|浏览全部|^生词本$|^过生词$|^个人空间$|^管理$|退出管理|查看个人空间|打开原草稿/],
  ['筛选 / 分页签', /筛选|真题|模拟|年份|听写|待复习|认词|记录|词组/],
  ['打开 / 查看', /查看|详情|讲解|看卷|预览|相似/],
  ['跳到某个题组', /^[A-Z]篇$|^第.+[题篇]$/],
  ['播放 / 发音', /播放|朗读|发音/],
  ['选择 / 判断', /认识|不认识|上一个|下一个|选择/],
]
const HANDLER_JOBS = [
  ['改名', /startTitleEdit|rename/i], ['跳到某个题组', /onItemClick|scrollTo|jump/i], ['展开 / 收起 / 更多', /toggle|Expanded|setOpen|Open\(\(/],
  ['去别的页（导航）', /onBack|onOpen|navigate|setView/], ['移出 / 删除', /delete|remove|revoke/i], ['导出 / 存 PDF', /export|download|print/i],
]
export function jobOf(kind, r) {
  const s = site[r.inv] || {}
  const hay = `${r.name} ${r.text} ${s.onClick || ''} ${s.ariaLabel || ''} ${r.tag === 'a' ? 'href' : ''}`
  const cls = r.cls
  if (kind === 'button') {
    const label = (r.name || r.text || '').trim()
    for (const [job, re] of BUTTON_JOBS) if (re.test(label)) return job
    for (const [job, re] of HANDLER_JOBS) if (re.test(s.onClick || '')) return job
    if (r.state.expanded !== undefined) return '展开 / 收起 / 更多'
    if (r.state.pressed !== undefined || r.state.selected !== undefined || r.state.current !== undefined) return '筛选 / 分页签'
    return '其他（看不出）'
  }
  if (kind === 'chip') {
    if (/建议|suggestion/i.test(hay + cls)) return '采用建议'
    if (/^打开草稿卷|basket/.test(`${r.name} ${cls}`)) return '去草稿卷（带数量）'
    if (r.interactive) return '筛选 / 切换'
    return '状态标记（不可点）'
  }
  if (kind === 'row') return r.interactive || r.st.cursor === 'pointer' ? '打开一项（整行可点）' : '列表里的一项（不可点）'
  if (kind === 'surface') {
    if (/suggestion/.test(cls)) return '建议卡'
    if (/skeleton|loading|placeholder/.test(cls)) return '加载占位'
    if (r.fixed === 'fixed') return '一直在屏上的浮件'
    if (r.shadowPainted) return '放在桌上的一张纸'
    if (r.borderPainted) return '装一组东西的板'
    return '底色分区'
  }
  if (kind === 'notice') {
    if (/错|失败|连不上|无法|不能|error|danger/i.test(hay + cls)) return '报错'
    if (/warning|注意|警告/i.test(hay + cls)) return '提醒'
    return '说明'
  }
  if (kind === 'toast') return /撤销|撤回|undo/i.test(hay + cls) ? '带撤销的反馈' : '操作反馈'
  if (kind === 'empty' && /正在|加载中|生成中|loading/i.test(hay + cls)) return '加载中（占位文字）'
  if (kind === 'empty') return /没找到|没有找到|没有匹配|无结果|清除|筛选|搜了/i.test(hay) ? '搜了没结果' : '还没东西'
  if (kind === 'dialog') {
    if (/^(menu|listbox)$/.test(r.role || '') || /menu/.test(cls)) return '菜单'
    if (r.role === 'alertdialog' || /删除|撤销|确认/.test(hay)) return '确认危险操作'
    if (/selection|dictionary|translate/.test(cls)) return '选词浮层'
    return '对话框'
  }
  if (kind === 'field') {
    if (r.tag === 'select') return '下拉选择'
    if (/checkbox|radio|switch|range/.test(r.type || r.role || '')) return '勾选 / 开关'
    if (/search|intent|搜索/i.test(cls + hay + (r.state.placeholder || '')) || r.type === 'search') return '搜索'
    if (r.tag === 'textarea') return '多行文字'
    return '文字输入'
  }
  return ''
}

// ---------- 签名和容差聚类 ----------
const CONTROL = new Set(['button', 'chip', 'field'])
function features(kind, r) {
  const st = r.st
  const border = st.border.every((b) => b === st.border[0]) ? [st.border[0]] : st.border
  const radius = st.radius.every((x) => x === st.radius[0]) ? [st.radius[0]] : st.radius
  return {
    bg: st.bg, bgImage: st.bgImage, border, radius, shadow: st.shadow, color: st.color, fontSize: st.fontSize, fontWeight: st.fontWeight, deco: st.deco,
    height: CONTROL.has(kind) ? Math.round(r.rect.h) : null, padX: CONTROL.has(kind) ? [st.padding[1], st.padding[3]] : null,
  }
}
const sigOf = (f) => JSON.stringify(f)
const parseBorder = (b) => (b === 'none' ? null : { w: px(b), c: rgba(b.slice(b.indexOf('rgb'))) })
const shadowLayers = (s) => (s === 'none' ? [] : s.split(/,(?![^(]*\))/).map((l) => { const c = rgba(l); const nums = l.replace(/rgba?\([^)]*\)/, '').trim().split(/\s+/).map(px); return { c, nums } }))
export function near(a, b) {
  const diffs = []
  if (a.bgImage !== b.bgImage || a.deco !== b.deco || a.fontWeight !== b.fontWeight) return null
  const d1 = dE(rgba(a.bg), rgba(b.bg)); if (d1 > 3) return null; if (d1 > 0.01) diffs.push(`底色差 ΔE ${d1.toFixed(1)}`)
  const d2 = dE(rgba(a.color), rgba(b.color)); if (d2 > 3) return null; if (d2 > 0.01) diffs.push(`字色差 ΔE ${d2.toFixed(1)}`)
  if (a.border.length !== b.border.length) return null
  for (let i = 0; i < a.border.length; i++) { const x = parseBorder(a.border[i]), y = parseBorder(b.border[i]); if (!x !== !y) return null; if (x) { if (Math.abs(x.w - y.w) > 0.5) return null; const d = dE(x.c, y.c); if (d > 3) return null; if (d > 0.01) diffs.push(`边色差 ΔE ${d.toFixed(1)}`) } }
  if (a.radius.length !== b.radius.length) return null
  for (let i = 0; i < a.radius.length; i++) { const dr = Math.abs(px(a.radius[i]) - px(b.radius[i])); if (/%/.test(a.radius[i]) !== /%/.test(b.radius[i])) return null; if (dr > 1) return null; if (dr > 0) diffs.push(`圆角差 ${dr}px`) }
  const la = shadowLayers(a.shadow), lb = shadowLayers(b.shadow); if (la.length !== lb.length) return null
  for (let i = 0; i < la.length; i++) { if (la[i].nums.some((v, j) => Math.abs(v - (lb[i].nums[j] ?? 0)) > 1)) return null; const d = dE(la[i].c, lb[i].c); if (d > 3) return null; if (d > 0.01 || la[i].nums.some((v, j) => v !== lb[i].nums[j])) diffs.push('影子差一点') }
  const fs = Math.abs(px(a.fontSize) - px(b.fontSize)); if (fs > 0.5) return null; if (fs > 0) diffs.push(`字号差 ${fs}px`)
  if ((a.height === null) !== (b.height === null)) return null
  if (a.height !== null) { const dh = Math.abs(a.height - b.height); if (dh > 2) return null; if (dh > 0) diffs.push(`高度差 ${dh}px`); const dp = Math.max(...a.padX.map((v, i) => Math.abs(px(v) - px(b.padX[i])))); if (dp > 2) return null; if (dp > 0) diffs.push(`左右内边距差 ${dp}px`) }
  return diffs
}

// ---------- 实例 ----------
const STATEFUL = (r) => r.hovered || r.focused || r.focusVisible || r.state.disabled || r.state.ariaDisabled === 'true' || r.state.pressed === 'true' || r.state.selected === 'true' || (r.state.current && r.state.current !== 'false') || r.state.checked || r.state.busy === 'true' || r.state.invalid === 'true' || /(^|\s)(is-active|is-selected|is-current|active|selected)(\s|$)/.test(r.cls)
const wide = R.wide.records.filter((r) => !r.inv.startsWith('__seed__'))
const seeds = SEEDS.records.filter((r) => r.inv.startsWith('__seed__'))
const unclassified = {}
const inst = []
for (const r of [...wide, ...seeds]) {
  const c = classify(r)
  if (!c.kind) { const k = c.why; unclassified[k] = (unclassified[k] || 0) + 1; continue }
  inst.push({ ...r, kind: c.kind, job: jobOf(c.kind, r), stateful: STATEFUL(r), mainline: MAINLINE.has(r.scenario), seed: r.inv.startsWith('__seed__') })
}

// 聚类：每类先按精确签名分，再把容差内的签名并成一种（并查集）
function cluster(pool) {
const variants = []
for (const [kind] of KINDS) {
  const rest = pool.filter((i) => i.kind === kind && !i.stateful)
  const bySig = new Map()
  for (const i of rest) { const f = features(kind, i); const s = sigOf(f); if (!bySig.has(s)) bySig.set(s, { f, items: [] }); bySig.get(s).items.push(i) }
  const sigs = [...bySig.entries()].sort((a, b) => b[1].items.length - a[1].items.length)
  const parent = sigs.map((_, i) => i); const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  const nearDiffs = []
  for (let i = 0; i < sigs.length; i++) for (let j = i + 1; j < sigs.length; j++) { const d = near(sigs[i][1].f, sigs[j][1].f); if (d && d.length) { parent[find(j)] = find(i); nearDiffs.push([i, j, d]) } }
  const groups = new Map()
  sigs.forEach((s, i) => { const g = find(i); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(i) })
  let k = 0
  for (const [g, members] of [...groups.entries()].sort((a, b) => sum(b[1]) - sum(a[1]))) {
    const items = members.flatMap((m) => sigs[m][1].items)
    const v = { id: `${kind}-${String(++k).padStart(2, '0')}`, kind, f: sigs[g][1].f, items, exactSigs: members.length, seed: items.every((x) => x.seed),
      drift: nearDiffs.filter(([a, b]) => members.includes(a) && members.includes(b)).map(([a, b, d]) => ({ count: sigs[b][1].items.length, sites: [...new Set(sigs[b][1].items.map((x) => x.inv))].slice(0, 6), diffs: d })) }
    variants.push(v)
  }
  function sum(ms) { return ms.reduce((n, m) => n + sigs[m][1].items.length, 0) }
}
return variants
}
// 报出来的清单不含种子；种子只在验漏那一遍里参加聚类
const variants = cluster(inst.filter((i) => !i.seed))
const seedVariants = cluster(inst)
const variantOfInst = new Map(); for (const v of variants) for (const i of v.items) variantOfInst.set(i, v)
// 每条记录归到哪：给复核对比用（scenario|n → 类 / 种 / 工作）
const assign = {}
for (const r of wide) assign[`${r.scenario}|${r.n}`] = { kind: null }
for (const i of inst.filter((x) => !x.seed)) assign[`${i.scenario}|${i.n}`] = { kind: i.kind, job: i.job, variant: variantOfInst.get(i)?.id || (i.stateful ? 'state' : null) }
const variantsBySite = new Map(); for (const v of variants) for (const i of v.items) { if (!variantsBySite.has(i.inv)) variantsBySite.set(i.inv, new Set()); variantsBySite.get(i.inv).add(v) }

// ---------- 状态 ----------
const statesByScenarioN = new Map(R.wide.states.map((s) => [`${s.scenario}|${s.n}`, s]))
const diffState = (a, b) => (a && b ? Object.keys(a).filter((k) => a[k] !== b[k]) : null)
const narrowBySite = new Map(); for (const r of R.narrow.records) { if (!narrowBySite.has(r.inv)) narrowBySite.set(r.inv, []); narrowBySite.get(r.inv).push(r) }
const tokens = R.wide.tokens || { colors: {}, shadows: {} }
const tokenColors = Object.entries(tokens.colors).map(([n, c]) => [n, rgba(c)])
const nearestToken = (c) => { const v = rgba(c); if (!v || v[3] < 0.02) return 'transparent'; let best = null; for (const [n, t] of tokenColors) { const d = dE(v, t); if (!best || d < best[1]) best = [n, d] } return best && best[1] <= 1 ? best[0] : null }
const elevNames = Object.entries(tokens.shadows).filter(([n]) => /elev|focus|ring/.test(n))
const shadowToken = (s) => { if (s === 'none') return 'none'; const hit = elevNames.find(([, v]) => v === s); return hit ? hit[0] : null }
const RADII = new Set([0, 4, 8, 12, 16]); const radiusOk = (r) => r.every((x) => /%$/.test(x) ? x === '50%' : (RADII.has(px(x)) || px(x) >= 999))

// ---------- 无障碍 ----------
const axeBySite = new Map()
for (const sc of R.wide.axe) for (const v of sc.violations) for (const n of v.nodes) { const k = n.inv || '(卷面或未标记)'; if (!axeBySite.has(k)) axeBySite.set(k, []); axeBySite.get(k).push({ rule: v.id, impact: v.impact, scenario: sc.scenario }) }

// ---------- 来历 ----------
const git = (args) => spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 }).stdout.trim()
const provCache = new Map()
function provenance(cls) {
  if (provCache.has(cls)) return provCache.get(cls)
  const first = git(['log', `-S${cls}`, '--reverse', '--format=%h|%ad|%s', '--date=short', '--', 'app/src']).split('\n')[0] || ''
  const [hash, date, subject] = first.split('|')
  const docs = git(['grep', '-l', '-F', cls, '--', 'DESIGN.md', 'BRAND.md', 'PRODUCT.md', 'docs', 'design', ':!design/components-2026-11-13']).split('\n').filter(Boolean)
  // 文档里同一段提到 Owner 才算有 Owner 决定；只看 DESIGN.md / docs / design
  const owner = []
  for (const d of docs) {
    const lines = readFileSync(path.join(ROOT, d), 'utf8').split('\n')
    lines.forEach((l, i) => { if (l.includes(cls)) { const win = lines.slice(Math.max(0, i - 3), i + 4).join(' '); if (/Owner|拍板|小川/.test(win)) owner.push(`${d}:${i + 1}`) } })
  }
  const lockedBy = git(['grep', '-l', '-F', cls, '--', 'scripts/verify-*.mjs', 'scripts/*.test.mjs']).split('\n').filter(Boolean)
  const out = { first: hash ? { hash, date, subject } : null, docs, owner: owner.slice(0, 6), lockedBy }
  provCache.set(cls, out); return out
}
const primaryClass = (v) => {
  const counts = {}
  for (const i of v.items) for (const t of tokensOf(i.cls)) counts[t] = (counts[t] || 0) + 1
  return Object.entries(counts).sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0]?.[0] || null
}

// ---------- 抽成构件的难易 ----------
const fileLines = new Map()
const linesOf = (f) => { if (!fileLines.has(f)) fileLines.set(f, readFileSync(path.join(SRC, f), 'utf8').split('\n').length); return fileLines.get(f) }
function difficulty(v) {
  const sites = [...new Set(v.items.map((i) => i.inv))].map((id) => site[id]).filter(Boolean)
  const dyn = sites.filter((s) => s.classDynamic).length
  const condSites = sites.filter((s) => s.conditions.length).length
  const bigFiles = [...new Set(sites.map((s) => s.file))].filter((f) => linesOf(f) > 800)
  const handlerInline = sites.filter((s) => s.onClick && /=>|\{/.test(s.onClick)).length
  const score = (dyn ? 1 : 0) + (bigFiles.length ? 1 : 0) + (handlerInline > sites.length / 2 ? 1 : 0)
  return { level: score >= 2 ? '难（和页面状态缠在一起）' : score === 1 ? '中' : '易（只管样子）', dynamicClassSites: dyn, conditionalSites: condSites, bigFiles, inlineHandlers: handlerInline, sites: sites.length }
}

// ---------- 汇总每种写法 ----------
const out = []
for (const v of variants) {
  const rep = v.items.find((i) => i.crop) || v.items[0]
  const sites = [...new Set(v.items.map((i) => i.inv))]
  const files = [...new Set(sites.map((s) => s.split(':')[0]))]
  const jobs = Object.entries(v.items.reduce((m, i) => ((m[i.job] = (m[i.job] || 0) + 1), m), {})).sort((a, b) => b[1] - a[1])
  // 状态：悬停/焦点/按下（强制出来的）
  const st = v.items.map((i) => statesByScenarioN.get(`${i.scenario}|${i.n}`)).find(Boolean)
  const states = st ? { hover: diffState(st.rest, st.hover), focus: diffState(st.rest, st.focus), active: diffState(st.rest, st.active), crops: { hover: st.hoverCrop, focus: st.focusCrop, active: st.activeCrop } } : null
  // 禁用、选中：同一处源码在别的时刻的样子
  const siblings = inst.filter((i) => sites.includes(i.inv) && i.stateful)
  const disabled = siblings.find((i) => i.state.disabled || i.state.ariaDisabled === 'true')
  const selected = siblings.find((i) => !(i.state.disabled || i.state.ariaDisabled === 'true'))
  // 窄屏
  const narrowDiff = new Set()
  for (const s of sites) for (const n of narrowBySite.get(s) || []) { const w = v.items.find((i) => i.inv === s); const a = features(v.kind, w), b = features(v.kind, n); for (const k of Object.keys(a)) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) narrowDiff.add(k) }
  const narrowSeen = sites.filter((s) => narrowBySite.has(s)).length
  // 对照 DESIGN.md
  const checks = []
  const sh = shadowToken(rep.st.shadow); if (sh === null) checks.push({ rule: 'DESIGN.md §4 四档高度', ok: false, note: `影子不是四档之一：${rep.st.shadow.slice(0, 80)}` })
  if (!radiusOk(rep.st.radius)) checks.push({ rule: 'DESIGN.md §5 圆角单一家族', ok: false, note: `圆角 ${[...new Set(rep.st.radius)].join(' / ')}` })
  const colorNames = { color: nearestToken(rep.st.color), bg: nearestToken(rep.st.bg) }
  for (const [k, n] of Object.entries(colorNames)) if (n === null) checks.push({ rule: 'DESIGN.md §2 桌面色阶', ok: false, note: `${k === 'color' ? '字色' : '底色'} ${hex(k === 'color' ? rep.st.color : rep.st.bg)} 不在色阶变量里` })
  const fg = rgba(rep.st.color), bg = rep.effBg
  const ratio = rep.text || rep.hasText ? contrast(fg, bg) : null
  const large = px(rep.st.fontSize) >= 24 || (px(rep.st.fontSize) >= 18.66 && Number(rep.st.fontWeight) >= 700)
  const contrastOk = ratio === null ? null : ratio >= (large ? 3 : 4.5)
  const target = rep.interactive ? { w: rep.rect.w, h: rep.rect.h, ok: rep.inline || (rep.rect.w >= 24 && rep.rect.h >= 24) } : null
  const focusVisible = states ? (states.focus && states.focus.some((k) => ['outline', 'shadow', 'border', 'bg'].includes(k))) : null
  // 元素自身没变时，焦点可能画在外框上（.外框:focus-within）：同一文件里包着它的元素有这样的规则就记下，标「外框」
  let focusOnWrapper = null
  if (focusVisible === false) {
    const fw = FOCUS_WITHIN.filter((c) => v.items.some((i) => (site[i.inv]?.file) && SITE_CLASSES_BY_FILE.get(site[i.inv].file)?.has(c)))
    if (fw.length) focusOnWrapper = fw.map((c) => `.${c}:focus-within`)
  }
  const noName = v.items.filter((i) => i.interactive && !i.name).length
  const axe = sites.flatMap((s) => axeBySite.get(s) || [])
  const axeRules = Object.entries(axe.reduce((m, a) => ((m[a.rule] = (m[a.rule] || 0) + 1), m), {}))
  const pc = primaryClass(v)
  const prov = pc ? provenance(pc) : null
  const intent = v.seed ? 'seed' : prov?.owner.length ? '有意（文档里查得到 Owner 决定）' : '没查到 Owner 决定'
  out.push({
    id: v.id, kind: v.kind, label: KIND_LABEL[v.kind], count: v.items.length, sites: sites.length, files, scenarios: [...new Set(v.items.map((i) => i.scenario))],
    mainline: v.items.some((i) => i.mainline), mainlineCount: v.items.filter((i) => i.mainline).length, jobs,
    look: { bg: hex(rep.st.bg), border: [...new Set(rep.st.border)].map((b) => (b === 'none' ? 'none' : b.replace(/rgba?\([^)]*\)/, (m) => hex(m)))), radius: [...new Set(rep.st.radius)], shadow: sh ?? 'custom', color: hex(rep.st.color), font: `${px(rep.st.fontSize)}/${rep.st.fontWeight}`, height: v.f.height, padX: v.f.padX, deco: rep.st.deco, icon: rep.icon, tokens: colorNames },
    exactSigs: v.exactSigs, drift: v.drift, states, disabled: disabled ? { crop: disabled.crop, opacity: disabled.opacity, color: hex(disabled.st.color), bg: hex(disabled.st.bg) } : null,
    selected: selected ? { crop: selected.crop, color: hex(selected.st.color), bg: hex(selected.st.bg), weight: selected.st.fontWeight } : null,
    narrow: { seenSites: narrowSeen, changes: [...narrowDiff] }, checks, contrast: ratio, contrastOk, target, focusVisible: focusVisible === false && focusOnWrapper ? 'wrapper' : focusVisible, focusOnWrapper, noName, axe: axeRules,
    primaryClass: pc, provenance: prov, intent, difficulty: difficulty(v), crop: rep.crop || null, sample: { text: rep.text || rep.name, at: rep.inv, scenario: rep.scenario }, seed: !!v.seed,
  })
}

// ---------- 工作组视角 ----------
const jobView = []
for (const [kind] of KINDS) {
  const byJob = new Map()
  for (const v of out.filter((x) => x.kind === kind && !x.seed)) for (const [job, n] of v.jobs) { if (!byJob.has(job)) byJob.set(job, []); byJob.get(job).push({ id: v.id, n, mainline: v.mainline }) }
  for (const [job, vs] of byJob) jobView.push({ kind, job, variants: vs.length, ids: vs.sort((a, b) => b.n - a.n).map((x) => x.id), count: vs.reduce((n, x) => n + x.n, 0), mainline: vs.some((x) => x.mainline) })
}
const sameLookManyJobs = out.filter((v) => !v.seed && v.jobs.length > 1).map((v) => ({ id: v.id, jobs: v.jobs }))

// ---------- 验漏 ----------
const seedVariantOf = new Map(); for (const v of seedVariants) for (const i of v.items) seedVariantOf.set(i, v)
const seedVariant = (tag) => { const i = inst.find((x) => x.seed && x.inv.includes(tag)); return i ? seedVariantOf.get(i) : null }
const sigKey = (i) => sigOf(features(i.kind, i))
const vA = seedVariant('novel'), vB = seedVariant('near'), vC = seedVariant('exact')
const refInst = inst.find((i) => !i.seed && i.inv === SEEDS.planted?.ref && !i.stateful && i.scenario === 'browse')
const vRef = refInst ? seedVariantOf.get(refInst) : null
const cInst = inst.find((x) => x.seed && x.inv.includes('exact'))
const aInst = inst.find((x) => x.seed && x.inv.includes('novel'))
const seedCheck = {
  planted: SEEDS.planted,
  A_novel: { variant: vA?.id || null, ownVariant: !!vA && vA.items.length === 1, kind: vA?.kind || null, flagged: aInst ? [radiusOk(aInst.st.radius) ? null : `圆角 ${aInst.st.radius[0]} 不在家族`, nearestToken(aInst.st.bg) ? null : `底色 ${hex(aInst.st.bg)} 不在色阶`].filter(Boolean) : [] },
  B_near: { variant: vB?.id || null, refVariant: vRef?.id || null, mergedWithRef: !!vB && vB === vRef,
    flaggedAsDrift: !!vB && vB.drift.some((d) => d.sites.some((s) => s.includes('__seed__:near'))), diffs: vB?.drift.find((d) => d.sites.some((s) => s.includes('__seed__:near')))?.diffs || null },
  C_exact: { variant: vC?.id || null, mergedWithRef: !!vC && vC === vRef, sameExactSignature: !!cInst && !!refInst && sigKey(cInst) === sigKey(refInst),
    flaggedAsDrift: !!vC && vC.drift.some((d) => d.sites.some((s) => s.includes('__seed__:exact'))) },
}
seedCheck.pass = seedCheck.A_novel.ownVariant && seedCheck.B_near.mergedWithRef && seedCheck.B_near.flaggedAsDrift && seedCheck.C_exact.mergedWithRef && !seedCheck.C_exact.flaggedAsDrift

// ---------- 对账：源码 vs 页面 ----------
function staticKind(j) {
  const cls = j.classes.join(' ')
  if (['input', 'textarea', 'select'].includes(j.tag)) return 'field'
  if (j.tag === 'dialog' || /dialog/.test(j.role || '') || j.ariaModal) return 'dialog'
  if (/^(menu|listbox)$/.test(j.role || '')) return 'dialog'
  if (j.tag === 'button' || j.role === 'button' || (j.tag === 'a' && (j.href || j.onClick))) return hasHead(cls, /^(chip|pill|tag|badge|seg|segment)$/) ? 'chip' : 'button'
  if (hasHead(cls, /^(toast|undo|snackbar)$/)) return 'toast'
  if (hasHead(cls, /^(empty|blank)$/)) return 'empty'
  if (hasHead(cls, /^(notice|banner|alert|hint|error|warning|callout|tip|status)$/) || /^(alert|status)$/.test(j.role || '')) return 'notice'
  if (hasHead(cls, /^(chip|pill|tag|badge)$/)) return 'chip'
  if (hasHead(cls, /^(row|item|entry|result)$/)) return 'row'
  if (hasHead(cls, /^(card|panel|board|surface|sheet|tile|suggestion|skeleton|pane|drawer)$/)) return 'surface'
  if (hasHead(cls, /^(menu|dropdown|popover|modal|dialog|overlay|popup)$/)) return 'dialog'
  return null
}
const renderedSites = new Map(); for (const i of inst.filter((x) => !x.seed)) { if (!renderedSites.has(i.kind)) renderedSites.set(i.kind, new Set()); renderedSites.get(i.kind).add(i.inv) }
const allRenderedInv = new Set(wide.map((r) => r.inv))
// 没拍到的原因：从最里层的出现条件往外找第一条认得出的；取反的条件（!loading）不算「加载时才出现」
const REASONS = [
  ['出错时才出现', /error|Error|失败|failed|Failed|loadFailed/],
  ['加载或进行中才出现', /loading|Loading|busy|pending|Pending|saving|exporting|'(loading|saving|exporting|pending)'/],
  ['操作之后才出现', /toast|Toast|undo|Undo|removed|Removed|saved|Saved|secret|notice|message/],
  ['展开或打开之后才出现', /[Oo]pen|expanded|Expanded|visible|presence|Presence|revoking|confirm|rendered/],
  ['空 / 非空某一种情况才出现', /length === 0|\.length > 0|!items|isEmpty|empty|Empty|=== 0/],
  ['只在窄屏', /narrow|Narrow|mobile|isCompact/],
  ['A3 拼版时才出现', /a3|A3|imposition/],
  ['某种模式下才出现', /mode|Mode|view|View|tab|Tab|edition|version|kind ===|groupType|reviewRevision/],
]
function reason(j) {
  const f = j.file
  if (/vocabulary/.test(f)) return '需要生词或学生数据（本地测试数据里没有）'
  if (/admin/.test(f)) return '管理页的这个状态没走到'
  for (const c of j.conditions) {
    const pos = c.replace(/!\(?[\w.?]+\)?/g, '') // 取反的不算
    for (const [why, re] of REASONS) if (re.test(pos)) return `${why}（${c.slice(0, 60)}）`
  }
  if (/reading-analysis|paper-intelligence|lecture|selection|similar/.test(f)) return `本地四组测试题跑不出这一块（${j.component || f}）`
  if (j.conditions.length) return `条件没满足（${j.conditions[0].slice(0, 60)}）`
  return `这个组件这次没渲染（${j.component || f}）`
}
const reconcile = []; const uncaptured = []
for (const [kind, label] of KINDS) {
  const st = S.jsx.filter((j) => staticKind(j) === kind)
  const stIds = new Set(st.map((j) => j.id))
  const rd = renderedSites.get(kind) || new Set()
  const both = [...rd].filter((id) => stIds.has(id))
  const onlyRendered = [...rd].filter((id) => !stIds.has(id))
  const notRendered = st.filter((j) => !allRenderedInv.has(j.id))
  const renderedOtherKind = st.filter((j) => allRenderedInv.has(j.id) && !rd.has(j.id))
  reconcile.push({ kind, label, staticSites: st.length, renderedSites: rd.size, matched: both.length,
    onlyRenderedSites: onlyRendered.length, onlyRenderedWhy: summarizeWhy(onlyRendered, kind),
    staticNotRendered: notRendered.length, staticRenderedAsOtherKind: renderedOtherKind.length,
    otherKindWhy: summarizeOther(renderedOtherKind),
    coverage: st.length ? Math.round((st.length - notRendered.length) / st.length * 1000) / 10 : null })
  for (const j of notRendered) uncaptured.push({ kind, at: j.id, tag: j.tag, classes: j.classes.slice(0, 3).join(' '), text: j.text.slice(0, 40), reason: reason(j), conditions: j.conditions })
}
function summarizeWhy(ids, kind) {
  const m = {}
  for (const id of ids) { const j = site[id]; const k = !j ? '源码里找不到（非 TSX）' : `源码按标签和类名归成「${KIND_LABEL[staticKind(j)] || '不在九类'}」，页面按画出来的样子归成「${KIND_LABEL[kind]}」`; m[k] = (m[k] || 0) + 1 }
  return m
}
function summarizeOther(js) { const m = {}; for (const j of js) { const ks = [...new Set(inst.filter((i) => i.inv === j.id).map((i) => KIND_LABEL[i.kind]))]; const k = ks.length ? `页面里归成「${ks.join('、')}」` : '页面里拍到了，但没画东西（不算构件）'; m[k] = (m[k] || 0) + 1 } return m }
// 没用到的 CSS 类（源码静态）
const usedTokens = new Set(S.jsx.flatMap((j) => j.classes)); const prefixes = [...usedTokens].filter((t) => t.endsWith('*')).map((t) => t.slice(0, -1))
const cssClasses = new Set(S.cssRules.flatMap((r) => r.selectors.flatMap((s) => (s.match(/\.[A-Za-z_][\w-]*/g) || []).map((x) => x.slice(1)))))
const tsxText = S.jsx.length // 占位
const allTsx = (() => { const t = []; for (const f of new Set(S.jsx.map((j) => j.file))) t.push(readFileSync(path.join(SRC, f), 'utf8')); return t.join('\n') })()
const unusedCss = [...cssClasses].filter((c) => !usedTokens.has(c) && !prefixes.some((p) => c.startsWith(p)) && !allTsx.includes(c)).sort()

// ---------- 行为 ----------
const B = S.behaviors
const byComp = (kind) => { const m = {}; for (const b of B.filter((x) => x.kind === kind)) { const k = b.component || b.at.split(':')[0]; (m[k] ||= []).push(b) } return m }
const behavior = {
  undo: Object.entries(byComp('undo-fn')).map(([c, bs]) => ({ component: c, fns: bs.map((b) => b.name), at: bs[0].at })),
  timers: B.filter((b) => b.kind === 'timer').map((b) => ({ at: b.at, component: b.component, fn: b.fn, ms: b.ms })),
  escape: Object.entries(byComp('escape')).map(([c, bs]) => ({ component: c, count: bs.length, at: bs.map((b) => b.at) })),
  focus: Object.entries(byComp('focus')).map(([c, bs]) => ({ component: c, count: bs.length, targets: [...new Set(bs.map((b) => b.target))].slice(0, 4) })),
  modalHook: B.filter((b) => b.kind === 'modal-hook').map((b) => ({ at: b.at, component: b.component })),
  toastPresence: B.filter((b) => b.kind === 'useToastPresence').map((b) => ({ at: b.at, component: b.component, args: b.args })),
  ariaLive: S.jsx.filter((j) => j.ariaLive || /^(status|alert)$/.test(j.role || '')).map((j) => ({ at: j.id, live: j.ariaLive || j.role, classes: j.classes.slice(0, 2).join(' ') })),
  loading: S.jsx.filter((j) => j.classes.some((c) => /skeleton|loading|spinner|placeholder/.test(c)) || (typeof j.ariaBusy === 'string')).map((j) => ({ at: j.id, classes: j.classes.slice(0, 2).join(' '), busy: j.ariaBusy })),
}

// ---------- 主键每页一处（§2 Accent） ----------
const mint = tokens.colors['--eqb-color-accent'] || tokens.colors['--accent'] || null
const accentPerScenario = {}
for (const r of wide) { const b = rgba(r.st.bg); if (b && b[3] > 0.5 && Math.abs(b[0] - 114) < 4 && Math.abs(b[1] - 191) < 4 && Math.abs(b[2] - 164) < 4) accentPerScenario[r.scenario] = (accentPerScenario[r.scenario] || 0) + 1 }

const analysis = { generatedFrom: { render: 'render.json', static: 'static.json' }, scenarios: [...R.wide.log, ...R.narrow.log], baseline: S.baseline,
  totals: { candidatesWide: R.wide.records.length, classified: inst.filter((i) => !i.seed).length, unclassified }, variants: out, jobView, sameLookManyJobs,
  seedCheck, reconcile, uncaptured, unusedCss, behavior, accentPerScenario, tokens, assign }
writeFileSync(path.join(RUN, 'analysis.json'), JSON.stringify(analysis))
if (RUN !== RAW) { console.log('只写了', path.join(RUN, 'analysis.json')); process.exit(0) }
// 提交的那份去掉大块
const slim = { ...analysis, assign: undefined, uncaptured: undefined, unusedCssCount: unusedCss.length, unusedCss: undefined, tokens: undefined,
  variants: out.map((v) => ({ ...v, provenance: v.provenance ? { first: v.provenance.first, owner: v.provenance.owner, lockedBy: v.provenance.lockedBy, docs: v.provenance.docs.length } : null })) }
writeFileSync(path.join(DATA, 'inventory.json'), JSON.stringify(slim, null, 1) + '\n')
writeFileSync(path.join(DATA, 'uncaptured.json'), JSON.stringify(uncaptured, null, 1) + '\n')
const sumKind = KINDS.map(([k, l]) => { const vs = out.filter((v) => v.kind === k && !v.seed); return `${l}: ${vs.length} 种（走样合并 ${vs.filter((v) => v.drift.length).length}），${vs.reduce((n, v) => n + v.count, 0)} 处` })
console.log(sumKind.join('\n'))
console.log('seed', JSON.stringify(seedCheck))
console.log('reconcile', reconcile.map((r) => `${r.label} 源码${r.staticSites}/页面${r.renderedSites}/覆盖${r.coverage}%`).join(' · '))
