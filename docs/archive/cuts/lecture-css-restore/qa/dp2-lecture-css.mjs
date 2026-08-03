// DP-2 行为断言 — lecture-css-restore（讲评面板样式失踪案复原）。
// 前提：dev 起在 5173/8787，QA 账号 qa-local-owner。
// 跑法：node docs/cuts/lecture-css-restore/qa/dp2-lecture-css.mjs
// 断言（computed style 级——直击事故形态「浏览器默认样式顶上」）：
//   ① 讲评态阅读面板挂载且选项 ul list-style=none（事故态=disc 圆点）
//   ② 选项行 button 文本非居中（事故态=user-agent 居中）
//   ③ 四个选项 li 全渲染
//   ④ CSSOM 已实际加载五族规则（.pi-cloze-panel 等在 styleSheets 里，
//      证明 @import 链活着，不只是文件存在）
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
const require = createRequire(import.meta.url)
const { chromium } = require(require.resolve('playwright', { paths: [path.join(rootDir, 'app')] }))

const BASE = process.env.QA_BASE_URL || 'http://127.0.0.1:5173'
const USER = process.env.QA_USER || 'qa-local-owner'
const PASS = process.env.QA_PASS || 'qa-review-2026'

let failures = 0
function check(name, cond, detail = '') {
  if (!cond) failures++
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const browser = await chromium.launch()
const page = await browser.newPage()
await page.goto(BASE + '/')
if (await page.locator('#login-username').count()) {
  await page.fill('#login-username', USER)
  await page.fill('#login-password', PASS)
  await page.click('button.login-submit')
  await page.locator('button', { hasText: '退出' }).first().waitFor({ timeout: 15000 })
}

await page.goto(BASE + '/?view=paper-browse&paperId=paper-2026-i&lecture=1')
// 纸面无 data-question 锚，题干文本是唯一可点锚；vite dev 冷编译下纸面
// 渲染可能 >30s，先长等 attached 再点。
const q21 = page.getByText('Which team will play the most games', { exact: false }).first()
await q21.waitFor({ state: 'attached', timeout: 60000 })
await q21.click()
await page.waitForSelector('.pi-ps-analysis', { timeout: 10000 })

const styles = await page.evaluate(() => {
  const ul = document.querySelector('.pi-ps-analysis-options')
  const row = document.querySelector('.pi-ps-analysis-option-row')
  const lis = document.querySelectorAll('.pi-ps-analysis-option-section')
  const familiesInCssom = ['.pi-cloze-panel', '.pi-gf-panel', '.pi-seven-panel', '.pi-ps-analysis-option-row'].map(
    (sel) => {
      for (const sheet of document.styleSheets) {
        let rules
        try {
          rules = sheet.cssRules
        } catch {
          continue
        }
        for (const rule of rules) {
          if (rule.selectorText && rule.selectorText.includes(sel)) return true
          if (rule.cssRules) {
            for (const inner of rule.cssRules) {
              if (inner.selectorText && inner.selectorText.includes(sel)) return true
            }
          }
        }
      }
      return false
    },
  )
  return {
    listStyle: ul ? getComputedStyle(ul).listStyleType : null,
    rowTextAlign: row ? getComputedStyle(row).textAlign : null,
    optionCount: lis.length,
    familiesInCssom,
  }
})

check('① 选项 ul list-style=none（非事故态圆点）', styles.listStyle === 'none', `实测 ${styles.listStyle}`)
check('② 选项行非 user-agent 居中', styles.rowTextAlign !== 'center', `实测 ${styles.rowTextAlign}`)
check('③ 四个选项全渲染', styles.optionCount === 4, `实测 ${styles.optionCount}`)
check('④ 五族规则已进 CSSOM（@import 链活）', styles.familiesInCssom.every(Boolean), JSON.stringify(styles.familiesInCssom))

await browser.close()
console.log(failures === 0 ? '\nDP-2 all green' : `\nDP-2 FAILURES: ${failures}`)
process.exit(failures === 0 ? 0 : 1)
