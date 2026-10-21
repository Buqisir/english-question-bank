/**
 * verify-lecture-panel-css.mjs — 讲评解析面板「样式失踪案」防回归网
 * (lecture-css-restore, 2026-07-17)。
 *
 * 事故：reading-analysis-retire 删 paperIntelligencePaperSurfaceHarness.css
 * (2343 行) 时，五个活着的讲评面板 (阅读 pi-ps-analysis / 完形 pi-cloze /
 * 语法填空 pi-gf / 七选五 pi-seven / 写作 pi-writing) 的样式随之陪葬——
 * 组件存活、CSS 失踪，浏览器默认样式顶上，无任何 gate 报警 (类名不进
 * 类型系统)。本 verify 是那次事故的可执行形态：
 *
 *   1. 活 TSX 里五族每个被使用的类，必须在 app/src 或其 CSS 引用中有定义，
 *      或在 HOOK_ONLY 白名单里 (有意无样式的变体/钩子类，逐条注明)。
 *   2. lectureAnalysisPanels.css 必须仍被 paperBrowsePage.css @import
 *      (加载链是当年断掉的另一半)。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = path.join(rootDir, 'app/src')

// 有意无样式的类 (2026-07-17 逐个经 git 全史核实「生前也从未有过 CSS」)：
const HOOK_ONLY = new Set([
  // 变体类：基类有样式，变体作语义钩子 (aria/QA 选择器面)，无独立规则。
  'pi-cloze-tag--pos',
  'pi-gf-tag--type',
  'pi-ps-analysis-empty--unpublished',
  // 'pi-ps-analysis-option-content' 于 2026-09-15 讲评「色留量减」获得样式
  // (正确项正文加粗)，已从白名单移除。
  'pi-ps-analysis-option-section--wrong',
  // 写作面板从未有过 CSS (写作解析资产未生产、面板未露面)——R3 写作双
  // facet 刀落地写作解析时应一并做样式并从此白名单移除。
  'pi-writing-continuation-paragraph-item',
  'pi-writing-continuation-paragraph-label',
  'pi-writing-continuation-paragraph-text',
  'pi-writing-continuation-paragraphs',
  'pi-writing-continuation-theme',
  'pi-writing-highlight-item',
  'pi-writing-highlight-note',
  'pi-writing-highlight-text',
  'pi-writing-highlights',
  'pi-writing-model-answer',
  'pi-writing-model-answer-line',
  'pi-writing-panel',
  'pi-writing-section-title',
  // 作图区几何由 shared/paper-canonical/applicationDrawingArea.mjs 的版本化
  // 渲染策略以内联样式提供（Screen/Print 共用同一份数值），类名只作 QA 钩子。
  'pi-writing-drawing-area',
])

const FAMILY = /^pi-(ps-analysis|cloze|gf|seven|writing)(-|$)/

function walk(dir, ext, acc = []) {
  for (const entry of readdirSync(dir)) {
    const p = path.join(dir, entry)
    if (statSync(p).isDirectory()) walk(p, ext, acc)
    else if (p.endsWith(ext)) acc.push(p)
  }
  return acc
}

let failures = 0
function assert(name, cond, detail = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!cond) failures += 1
}

// 1. collect family classes used in live TSX (quoted-string tokens only —
//    避开 data-pi-* 属性名的误报)
const usedClasses = new Set()
for (const file of walk(srcDir, '.tsx')) {
  const src = readFileSync(file, 'utf8')
  for (const m of src.matchAll(/['"`]([^'"`]*)['"`]/g)) {
    for (const token of m[1].split(/\s+/)) {
      if (FAMILY.test(token)) usedClasses.add(token)
    }
  }
}
assert('live TSX uses a non-trivial number of family classes (sweep not broken)', usedClasses.size >= 100, `found ${usedClasses.size}`)

// 2. every used class is styled somewhere or explicitly hook-only
// Follow actual relative imports, including shared paper rules outside app/src.
// An unreferenced stylesheet in shared/ must not satisfy the loading contract.
const cssFiles = new Set(walk(srcDir, '.css'))
for (const file of cssFiles) {
  for (const match of readFileSync(file, 'utf8').matchAll(/@import\s+['"]([^'"]+)['"]/g)) {
    if (match[1].startsWith('.')) cssFiles.add(path.resolve(path.dirname(file), match[1]))
  }
}
const cssText = [...cssFiles]
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n')
const orphans = [...usedClasses].filter((cls) => !HOOK_ONLY.has(cls) && !cssText.includes(`.${cls}`))
assert('every used lecture-panel class is styled or allowlisted', orphans.length === 0, orphans.slice(0, 8).join(', '))

// 3. stale allowlist guard — a HOOK_ONLY entry that gained styles or lost
//    its consumer should be removed from the list
const stale = [...HOOK_ONLY].filter((cls) => cssText.includes(`.${cls}`) || !usedClasses.has(cls))
assert('HOOK_ONLY allowlist is not stale', stale.length === 0, stale.slice(0, 8).join(', '))

// 4. the loading chain holds
const browseCss = readFileSync(path.join(srcDir, 'features/paper-browse/paperBrowsePage.css'), 'utf8')
assert(
  'paperBrowsePage.css imports lectureAnalysisPanels.css (加载链)',
  /@import\s+"\.\.\/paper-intelligence\/lectureAnalysisPanels\.css"/.test(browseCss),
)
const panelCss = readFileSync(path.join(srcDir, 'features/paper-intelligence/lectureAnalysisPanels.css'), 'utf8')
assert('lectureAnalysisPanels.css carries the restored families', ['pi-ps-analysis-option-row', 'pi-cloze-panel', 'pi-gf-panel', 'pi-seven-panel'].every((c) => panelCss.includes(`.${c}`)))

console.log(failures === 0 ? 'all checks passed' : `${failures} check(s) FAILED`)
process.exit(failures === 0 ? 0 : 1)
