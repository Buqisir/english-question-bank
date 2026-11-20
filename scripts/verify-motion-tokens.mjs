#!/usr/bin/env node
// motion-pass P3 gate (docs/cuts/motion-pass/plan.md #9): scans app/src/**/*.css
// (excluding shared-ui/papersurface/PaperSurface.css, a contract file this cut
// does not touch) and asserts the motion token discipline landed by this cut
// holds: no `ease-in` direction bugs, no `transition: all` perf smell, and no
// bare hand-written duration literals outside documented `token-exempt`
// loading or signature moments.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const scanRoot = path.join(rootDir, 'app/src')
const excludePath = path.join(rootDir, 'app/src/shared-ui/papersurface/PaperSurface.css')

let passed = 0
let failed = 0

function assert(name, condition, details = '') {
  if (condition) {
    passed += 1
    console.log(`PASS ${name}`)
  } else {
    failed += 1
    console.error(`FAIL ${name}${details ? `\n  ${details}` : ''}`)
  }
}

function walkCssFiles(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) {
      out.push(...walkCssFiles(full))
    } else if (entry.endsWith('.css') && full !== excludePath) {
      out.push(full)
    }
  }
  return out
}

const cssFiles = walkCssFiles(scanRoot)
assert('found css files to scan', cssFiles.length > 0, `scanned root: ${scanRoot}`)

// Word-boundary ease-in check: flags bare `ease-in`, does not flag `ease-in-out`.
const EASE_IN_RE = /\bease-in\b(?!-out)/

// `transition: all` (with or without other transition-property tokens mixed
// into a shorthand list — this cut's contract is a fully explicit property
// list, never the `all` keyword).
const TRANSITION_ALL_RE = /transition(-property)?\s*:\s*(?:[^;]*,\s*)?all\b/

// Bare duration literal (`123ms` or `1.23s`) inside a transition/animation
// shorthand or a `*-duration` longhand. Token-exempt lines (signature moments)
// carry a trailing `token-exempt` comment.
const DURATION_RE = /\d+(?:\.\d+)?m?s\b/g

for (const file of cssFiles) {
  const rel = path.relative(rootDir, file)
  const src = readFileSync(file, 'utf8')
  const lines = src.split('\n')

  let fileHasEaseIn = false
  let fileHasTransitionAll = false
  let fileHasBareDuration = false

  lines.forEach((line, idx) => {
    const lineNo = idx + 1
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('/*') || trimmed.startsWith('*')) return

    if (EASE_IN_RE.test(line)) {
      fileHasEaseIn = true
      console.error(`  ease-in found: ${rel}:${lineNo}: ${trimmed}`)
    }

    if (TRANSITION_ALL_RE.test(line)) {
      fileHasTransitionAll = true
      console.error(`  transition: all found: ${rel}:${lineNo}: ${trimmed}`)
    }

    const isTransitionOrAnimation = /^(transition|animation)(-duration)?\s*:/.test(trimmed) ||
      /transition\s*:|animation\s*:|animation-duration\s*:/.test(trimmed)
    if (!isTransitionOrAnimation) return
    if (trimmed.includes('token-exempt')) return

    const matches = trimmed.match(DURATION_RE) || []
    for (const m of matches) {
      fileHasBareDuration = true
      console.error(`  bare duration "${m}" found: ${rel}:${lineNo}: ${trimmed}`)
    }
  })

  assert(`no ease-in in ${rel}`, !fileHasEaseIn)
  assert(`no transition: all in ${rel}`, !fileHasTransitionAll)
  assert(`no bare duration literals in ${rel}`, !fileHasBareDuration)
}

// ── 动效角色（DESIGN.md §5「Motion 动效」，app/src/shared-ui/motion.css，2026-11-20）──
// 写 transition / animation 时选角色，不选时长和曲线：每一项都得用 var(--motion-<角色>)，
// 或者写 none；签名时刻（獭獭、图标状态、配对成功这类）在同一条规则里注 `motion-signature` 说明为什么，
// 没人用、等删的死样式注 `motion-dead`。减少动态效果的 @media 块里不查（那里只做关掉）。
// 这几处整份文件是签名时刻或角色本身，不查：
const ROLE_EXEMPT_FILES = [
  'app/src/shared-ui/motion.css', // 角色定义本身
  'app/src/shared-ui/waiting.css', // 等待：灰块呼吸、所以点，走 --wait-*
  'app/src/index.css', // 启动壳的首屏淡入
  'app/src/auth/LoginPage.css', // 登录页獭獭（BRAND.md §4.6）
  'app/src/shared-ui/papersurface/', // 卷面契约文件，本轮不动
  'app/src/icons/', // 图标状态动效（design/icon-system-2026-09-15/motion-rules.md）
  'app/src/features/paper-browse/selection/sentence-analysis/', // 句子分析的签名动效（--sa-*）
]
const ROLES = ['state', 'press', 'glide', 'reveal', 'reveal-panel', 'reveal-drawer', 'dismiss', 'turn', 'travel']
const ROLE_RE = new RegExp(`var\\(--motion-(?:${ROLES.join('|')})\\)`)

// 小解析：按字符走一遍，记下每条声明所在的规则（含它外面的 @media）和这条规则里出现过的注释。
function scanDeclarations(src) {
  const out = []
  const stack = [] // { prelude, comments: [] }
  let buf = ''
  let i = 0
  let line = 1
  let bufLine = 1
  while (i < src.length) {
    const ch = src[i]
    if (ch === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2)
      const text = src.slice(i, end === -1 ? src.length : end + 2)
      if (stack.length) stack[stack.length - 1].comments.push(text)
      line += (text.match(/\n/g) || []).length
      i += text.length
      continue
    }
    if (ch === '\n') line += 1
    if (ch === '{') {
      stack.push({ prelude: buf.trim(), comments: [] })
      buf = ''
    } else if (ch === '}') {
      if (buf.trim()) out.push({ text: buf.trim(), line: bufLine, stack: stack.map((f) => ({ ...f, comments: [...f.comments] })) })
      const closed = stack.pop()
      // 规则结束时把它里面后出现的注释补给它的声明（注释写在声明后面也算这条规则的）。
      for (const d of out) {
        const frame = d.stack[stack.length]
        if (frame && d.stack.length === stack.length + 1 && frame.prelude === closed?.prelude && !d.closed) {
          frame.comments = closed.comments
          d.closed = true
        }
      }
      buf = ''
    } else if (ch === ';') {
      if (buf.trim()) out.push({ text: buf.trim(), line: bufLine, stack: stack.map((f) => ({ ...f, comments: [...f.comments] })) })
      buf = ''
    } else {
      if (!buf.trim() && !/\s/.test(ch)) bufLine = line
      buf += ch
    }
    i += 1
  }
  return out
}

let roleFiles = 0
for (const file of cssFiles) {
  const rel = path.relative(rootDir, file)
  if (ROLE_EXEMPT_FILES.some((p) => rel === p || (p.endsWith('/') && rel.startsWith(p)))) continue
  roleFiles += 1
  const bad = []
  for (const decl of scanDeclarations(readFileSync(file, 'utf8'))) {
    const m = decl.text.match(/^(transition|animation)(-[a-z-]+)?\s*:\s*([\s\S]*)$/)
    if (!m) continue
    const [, kind, longhand, value] = m
    if (decl.stack.some((f) => /prefers-reduced-motion\s*:\s*reduce/.test(f.prelude))) continue
    const rule = decl.stack[decl.stack.length - 1]
    if (rule && rule.comments.some((c) => /motion-(?:signature|dead)/.test(c))) continue
    if (longhand === '-delay' || longhand === '-property' || longhand === '-name' || longhand === '-fill-mode') continue
    if (longhand) {
      bad.push(`${rel}:${decl.line} ${kind}${longhand} 单独改时长或曲线：写成 ${kind}: <属性> var(--motion-<角色>)`)
      continue
    }
    if (/^none\s*(!important)?$/.test(value.trim())) continue
    const items = value.split(/,(?![^(]*\))/)
    for (const item of items) {
      if (!ROLE_RE.test(item)) bad.push(`${rel}:${decl.line} ${kind} 这一项没用角色：${item.trim().replace(/\s+/g, ' ')}`)
    }
  }
  for (const b of bad) console.error(`  ${b}`)
  assert(`motion roles in ${rel}`, bad.length === 0)
}
assert('motion role scan covered files', roleFiles > 20, `only ${roleFiles} files scanned`)

// 角色和减少动态效果的退化写在 motion.css 一处，index.css 要把它引进来（登录页在 App.css 之前挂载）。
const motionCss = readFileSync(path.join(rootDir, 'app/src/shared-ui/motion.css'), 'utf8')
const indexCss = readFileSync(path.join(rootDir, 'app/src/index.css'), 'utf8')
assert('index.css imports shared-ui/motion.css', /@import\s+["']\.\/shared-ui\/motion\.css["']/.test(indexCss))
for (const role of ROLES) {
  assert(`motion.css defines --motion-${role}`, new RegExp(`--motion-${role}:\\s*var\\(--motion-`).test(motionCss))
}
const reduceBlock = (motionCss.match(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*:root\s*\{([^}]*)\}/) || [])[1] || ''
assert(
  'reduced motion: press scales 1, reveal shift 0 / scale 1, glide/turn/travel 1ms (not 0s: transitionend must still fire)',
  /--motion-press-scale-icon:\s*1;/.test(reduceBlock) &&
    /--motion-press-scale:\s*1;/.test(reduceBlock) &&
    /--motion-press-scale-surface:\s*1;/.test(reduceBlock) &&
    /--motion-reveal-shift:\s*0px;/.test(reduceBlock) &&
    /--motion-reveal-scale:\s*1;/.test(reduceBlock) &&
    /--motion-glide:\s*1ms linear;/.test(reduceBlock) &&
    /--motion-turn:\s*1ms linear;/.test(reduceBlock) &&
    /--motion-travel:\s*1ms linear;/.test(reduceBlock),
  reduceBlock,
)
const appCss = readFileSync(path.join(rootDir, 'app/src/App.css'), 'utf8')
assert('motion durations/eases defined once (not copied back into App.css / index.css :root)',
  !/--motion-fast:\s*\d/.test(appCss) && !/--motion-fast:\s*\d/.test(indexCss) && /--motion-fast:\s*120ms/.test(motionCss))

if (failed > 0) {
  console.error(`\nMotion tokens verify FAILED: ${passed} passed, ${failed} failed`)
  process.exit(1)
}

console.log(`\nMotion tokens verify passed: ${passed} passed, 0 failed (${cssFiles.length} css files scanned)`)
