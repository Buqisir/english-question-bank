#!/usr/bin/env node
// 构件清点 · 源码一侧（不启动网站）。
//   CSS：用 postcss 读语法树，记每条规则的位置和关键声明，算基线数字（手写影子、圆角、色值、字号）。
//   TSX：用 TypeScript 语法树读每个原生 JSX 元素（button / input / div …）：位置、类名、角色、文字、
//        点击处理、出现条件；再记行为（计时、Esc、焦点、撤销、aria-live、加载占位）。
// 输出：.scratch/component-inventory/static.json（原始）和 design/components-2026-11-13/data/baseline.json（基线）。
// 确定性：同一份源码，同样的结果。
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { SRC, DATA, RAW, walk, rel, isExcluded, loadPostcss, requireFromApp, HOST_WRAPPERS } from './lib.mjs'

const postcss = loadPostcss()
const ts = requireFromApp('typescript')
const files = walk(SRC)

// ---------- CSS ----------
const KEY_PROPS = ['background', 'background-color', 'border', 'border-color', 'border-width', 'border-radius', 'box-shadow', 'outline',
  'font-size', 'font-weight', 'color', 'padding', 'height', 'min-height', 'text-decoration', 'position', 'z-index']
const COLOR_RE = /#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?)\(/g
const LENGTH_RE = /(^|[\s(,])-?\d*\.?\d+(px|rem|em|%)/
const cssFiles = files.filter((f) => f.endsWith('.css') && !isExcluded(rel(f)))
const cssRules = []
const baselineCss = { shadows: [], radii: [], colors: [], fontSizes: [] }
for (const file of cssFiles) {
  const r = rel(file)
  const root = postcss.parse(readFileSync(file, 'utf8'), { from: file })
  root.walkRules((rule) => {
    let p = rule.parent; let inPrint = false; const media = []
    while (p && p.type !== 'root') { if (p.type === 'atrule') { media.push(`@${p.name} ${p.params}`); if (/print/.test(p.params)) inPrint = true } p = p.parent }
    if (inPrint) return
    const isTokenBlock = (r === 'shared-ui/tokens.css') || (r === 'App.css' && rule.selector.trim() === ':root')
    const decls = {}
    rule.walkDecls((d) => {
      if (KEY_PROPS.includes(d.prop) || d.prop.startsWith('--')) decls[d.prop] = d.value
      if (isTokenBlock) return // 色值、影子的定义处，不算手写
      const at = `${r}:${d.source.start.line}`
      const v = d.value.trim()
      if (d.prop === 'box-shadow' && !/^(none|inherit|initial|unset)$/.test(v) && (COLOR_RE.test(v) || LENGTH_RE.test(v.replace(/var\([^)]*\)/g, '')))) baselineCss.shadows.push({ at, v })
      COLOR_RE.lastIndex = 0
      if (/^border(-(top|bottom)-(left|right))?-radius$/.test(d.prop) && LENGTH_RE.test(v.replace(/var\([^)]*\)/g, '')) && !/^0(px)?$/.test(v)) baselineCss.radii.push({ at, v })
      const colors = v.replace(/var\(--[^,)]+,\s*[^)]*\)/g, '').match(COLOR_RE) // var() 的兜底值不算
      COLOR_RE.lastIndex = 0
      if (colors) for (const c of colors) baselineCss.colors.push({ at, prop: d.prop, v: c })
      if (d.prop === 'font-size' && LENGTH_RE.test(v.replace(/var\([^)]*\)/g, ''))) baselineCss.fontSizes.push({ at, v })
    })
    cssRules.push({ file: r, line: rule.source.start.line, selectors: rule.selectors, media, decls })
  })
}

// ---------- TSX ----------
const tsxFiles = files.filter((f) => f.endsWith('.tsx') && !isExcluded(rel(f)))
const jsx = []
const behaviors = []
const textOf = (sf, n) => n.getText(sf).replace(/\s+/g, ' ').trim()
const clip = (s, n = 90) => (s.length > n ? s.slice(0, n - 1) + '…' : s)
function attrMap(sf, attrs) {
  const out = {}
  for (const a of attrs.properties) {
    if (ts.isJsxSpreadAttribute(a)) { out['{...}'] = textOf(sf, a.expression); continue }
    const name = a.name.getText(sf)
    if (!a.initializer) out[name] = true
    else if (ts.isStringLiteral(a.initializer)) out[name] = { lit: a.initializer.text }
    else out[name] = { expr: textOf(sf, a.initializer.expression ?? a.initializer) }
  }
  return out
}
function classTokens(sf, attr) {
  if (!attr) return { tokens: [], dynamic: false }
  if (attr.lit !== undefined) return { tokens: attr.lit.split(/\s+/).filter(Boolean), dynamic: false }
  // 表达式：收集里面所有字符串片段
  const tokens = new Set()
  const src = ts.createSourceFile('x.tsx', `(${attr.expr})`, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const visit = (n) => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) n.text.split(/\s+/).filter(Boolean).forEach((t) => tokens.add(t))
    if (ts.isTemplateExpression(n)) {
      const parts = [n.head.text, ...n.templateSpans.map((s) => s.literal.text)]
      parts.forEach((p, i) => p.split(/\s+/).forEach((t, j, arr) => {
        if (!t) return
        // 紧挨着 ${} 的半截类名（如 `foo-${x}`）记成 foo-*
        const touchesNext = j === arr.length - 1 && i < parts.length - 1 && !/\s$/.test(p)
        tokens.add(touchesNext ? t + '*' : t)
      }))
    }
    ts.forEachChild(n, visit)
  }
  visit(src)
  return { tokens: [...tokens].filter((t) => /^[A-Za-z_-][\w*-]*$/.test(t)), dynamic: true }
}
function enclosingFn(n) {
  for (let p = n.parent; p; p = p.parent) {
    if (ts.isFunctionDeclaration(p) && p.name) return p.name.text
    if ((ts.isArrowFunction(p) || ts.isFunctionExpression(p)) && p.parent && ts.isVariableDeclaration(p.parent)) return p.parent.name.getText()
    if (ts.isMethodDeclaration(p)) return p.name.getText()
  }
  return null
}
function topComponent(n) {
  let name = null
  for (let p = n.parent; p; p = p.parent) {
    if (ts.isFunctionDeclaration(p) && p.name && /^[A-Z]/.test(p.name.text)) name = p.name.text
    if ((ts.isArrowFunction(p) || ts.isFunctionExpression(p)) && p.parent && ts.isVariableDeclaration(p.parent) && /^[A-Z]/.test(p.parent.name.getText())) name = p.parent.name.getText()
  }
  return name
}
function conditionsOf(sf, el) {
  const conds = []
  let child = el
  for (let p = el.parent; p && conds.length < 4; child = p, p = p.parent) {
    if (ts.isFunctionDeclaration(p) || (ts.isArrowFunction(p) && /^[A-Z]/.test(p.parent?.name?.getText?.() ?? ''))) break
    if (ts.isBinaryExpression(p) && p.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && p.right === child) conds.push(clip(textOf(sf, p.left), 80))
    if (ts.isConditionalExpression(p) && (p.whenTrue === child || p.whenFalse === child)) conds.push(clip((p.whenTrue === child ? '' : '!(') + textOf(sf, p.condition) + (p.whenTrue === child ? '' : ')'), 80))
    if (ts.isCallExpression(p) && ts.isPropertyAccessExpression(p.expression) && p.expression.name.text === 'map') conds.push('[列表] ' + clip(textOf(sf, p.expression.expression), 50))
    if (ts.isIfStatement(p)) conds.push(clip((p.thenStatement.pos <= child.pos && child.end <= p.thenStatement.end ? '' : 'else of ') + textOf(sf, p.expression), 80))
  }
  return conds
}
function staticText(sf, el) {
  const kids = ts.isJsxElement(el) ? el.children : []
  const parts = []
  const visit = (k) => {
    if (ts.isJsxText(k)) { const t = k.text.replace(/\s+/g, ' ').trim(); if (t) parts.push(t) }
    else if (ts.isJsxExpression(k) && k.expression) {
      if (ts.isStringLiteral(k.expression)) parts.push(k.expression.text)
      else parts.push('{' + clip(textOf(sf, k.expression), 40) + '}')
    } else if (ts.isJsxElement(k)) k.children.forEach(visit)
    else if (ts.isJsxSelfClosingElement(k)) parts.push('<' + k.tagName.getText(sf) + '/>')
  }
  kids.forEach(visit)
  return clip(parts.join(' '), 120)
}
for (const file of tsxFiles) {
  const r = rel(file)
  const text = readFileSync(file, 'utf8')
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const lc = (pos) => { const { line, character } = sf.getLineAndCharacterOfPosition(pos); return [line + 1, character + 1] }
  const visit = (n) => {
    if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) {
      let tag = n.tagName.getText(sf)
      if (/^[a-z]/.test(tag) || tag in HOST_WRAPPERS) {
        const [line, col] = lc(n.getStart(sf))
        const a = attrMap(sf, n.attributes)
        if (tag in HOST_WRAPPERS) tag = a.as?.lit || HOST_WRAPPERS[tag]
        const cls = classTokens(sf, a.className)
        const el = ts.isJsxOpeningElement(n) ? n.parent : n
        const lit = (k) => (a[k] === true ? true : a[k]?.lit ?? (a[k]?.expr ? '{' + clip(a[k].expr, 60) + '}' : undefined))
        jsx.push({
          id: `${r}:${line}:${col}`, file: r, line, tag,
          classes: cls.tokens, classDynamic: cls.dynamic,
          role: lit('role'), type: lit('type'), ariaLabel: lit('aria-label'), title: lit('title'),
          ariaLive: lit('aria-live'), ariaPressed: lit('aria-pressed'), ariaSelected: lit('aria-selected'), ariaCurrent: lit('aria-current'), ariaBusy: lit('aria-busy'),
          ariaModal: lit('aria-modal'), disabled: lit('disabled') ?? lit('aria-disabled'), autoFocus: lit('autoFocus'),
          onClick: a.onClick ? clip(a.onClick.expr ?? '', 100) : undefined,
          onKeyDown: a.onKeyDown ? clip(a.onKeyDown.expr ?? '', 80) : undefined,
          href: lit('href'), placeholder: lit('placeholder'),
          text: staticText(sf, el), conditions: conditionsOf(sf, el), fn: enclosingFn(n), component: topComponent(n),
          spread: a['{...}'] ? clip(a['{...}'], 40) : undefined,
        })
      }
    }
    // 行为
    if (ts.isCallExpression(n)) {
      const callee = textOf(sf, n.expression)
      const [line] = lc(n.getStart(sf))
      const at = `${r}:${line}`
      if (/(^|\.)(setTimeout|setInterval)$/.test(callee)) behaviors.push({ kind: 'timer', at, fn: enclosingFn(n), component: topComponent(n), ms: n.arguments[1] ? clip(textOf(sf, n.arguments[1]), 40) : '0' })
      if (/\.focus$/.test(callee)) behaviors.push({ kind: 'focus', at, fn: enclosingFn(n), component: topComponent(n), target: clip(callee, 70) })
      if (/^useModalDialog$/.test(callee)) behaviors.push({ kind: 'modal-hook', at, component: topComponent(n), args: clip(n.arguments.map((x) => textOf(sf, x)).join(', '), 80) })
      if (/^(useToastPresence|useFluidHover)$/.test(callee)) behaviors.push({ kind: callee, at, component: topComponent(n), args: clip(n.arguments.map((x) => textOf(sf, x)).join(', '), 80) })
      if (/addEventListener$/.test(callee) && n.arguments[0] && /keydown|keyup/.test(textOf(sf, n.arguments[0]))) behaviors.push({ kind: 'key-listener', at, fn: enclosingFn(n), component: topComponent(n) })
    }
    if (ts.isStringLiteral(n) && /^(Escape|Esc)$/.test(n.text)) {
      const [line] = lc(n.getStart(sf))
      behaviors.push({ kind: 'escape', at: `${r}:${line}`, fn: enclosingFn(n), component: topComponent(n), context: clip(textOf(sf, n.parent.parent ?? n.parent), 90) })
    }
    if ((ts.isFunctionDeclaration(n) || ts.isVariableDeclaration(n)) && n.name && /undo|Undo|restore|Restore|revert|Revert/.test(n.name.getText(sf))) {
      const [line] = lc(n.getStart(sf))
      behaviors.push({ kind: 'undo-fn', at: `${r}:${line}`, name: n.name.getText(sf), component: topComponent(n) })
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
}

// ---------- 基线数字（只许减不许增） ----------
const count = (arr) => arr.length
const distinct = (arr, key = 'v') => new Set(arr.map((x) => String(x[key]).toLowerCase().replace(/\s+/g, ' '))).size
const rawButtons = jsx.filter((j) => j.tag === 'button')
const rawFields = jsx.filter((j) => ['input', 'textarea', 'select'].includes(j.tag))
const baseline = {
  scope: 'app/src 的 .css 和 .tsx；不含 shared-ui/papersurface 和 @media print；色值、影子的定义处（tokens.css、App.css :root）不算手写',
  rawButtonElements: count(rawButtons),
  rawFieldElements: count(rawFields),
  handWrittenShadows: count(baselineCss.shadows), distinctShadows: distinct(baselineCss.shadows),
  handWrittenRadii: count(baselineCss.radii), distinctRadii: distinct(baselineCss.radii),
  handWrittenColors: count(baselineCss.colors), distinctColors: distinct(baselineCss.colors),
  handWrittenFontSizes: count(baselineCss.fontSizes), distinctFontSizes: distinct(baselineCss.fontSizes),
  cssFiles: cssFiles.length, cssRules: cssRules.length, tsxFiles: tsxFiles.length, jsxHostElements: jsx.length,
}
// --check：只比对，不写文件。基线里的每个数只许减不许增（以后迁移时用）。
if (process.argv.includes('--check')) {
  const committed = JSON.parse(readFileSync(path.join(DATA, 'baseline.json'), 'utf8'))
  const worse = Object.entries(baseline).filter(([k, v]) => typeof v === 'number' && /^(raw|handWritten|distinct)/.test(k) && v > committed[k])
  for (const [k, v] of Object.entries(baseline)) if (typeof v === 'number' && /^(raw|handWritten|distinct)/.test(k)) console.log(`${v > committed[k] ? '✗' : v < committed[k] ? '↓' : '='} ${k}: ${committed[k]} → ${v}`)
  if (worse.length) { console.error(`基线变多了：${worse.map(([k]) => k).join('、')}。新写法请用共用构件，或在 README 里说明后更新基线。`); process.exit(1) }
  console.log('基线没有变多。'); process.exit(0)
}
writeFileSync(path.join(RAW, 'static.json'), JSON.stringify({ baseline, baselineDetail: baselineCss, cssRules, jsx, behaviors }))
writeFileSync(path.join(DATA, 'baseline.json'), JSON.stringify(baseline, null, 2) + '\n')
console.log(JSON.stringify(baseline, null, 2))
console.log('behaviors:', Object.entries(behaviors.reduce((m, b) => ((m[b.kind] = (m[b.kind] || 0) + 1), m), {})).map(([k, v]) => `${k} ${v}`).join(' · '))
