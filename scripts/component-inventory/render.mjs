#!/usr/bin/env node
// 构件清点 · 页面一侧：启动带标记的本地网站（rig.mjs），按固定顺序走一遍页面和状态，
// 记下每个候选元素的实算样式、位置、状态和读屏名字；给每种样子各截一张；
// 对可点的强制出悬停、焦点、按下三种状态；每页跑一次 axe-core；窄屏（390 宽）再走一遍。
// 输出：.scratch/component-inventory/render.json、crops/、pages/（验漏的种子在 seeds.mjs）
//
// 用法：node scripts/component-inventory/render.mjs   （会自己起停 rig；需要 npm ci --prefix scripts/component-inventory）
import { mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { RAW, requireFromApp } from './lib.mjs'
import { startRig } from './rig.mjs'
import { SCENARIOS, sleep, settle, login } from './scenarios.mjs'
import { collectInPage, styleOf, probeTokens } from './collect.mjs'

const { chromium } = requireFromApp('playwright')
const axeSource = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8')
// 重跑核对用：INVENTORY_RENDER_DIR=run2 时写到 .scratch/component-inventory/run2/，不覆盖第一次的结果
const BASE = process.env.INVENTORY_RENDER_DIR ? path.join(RAW, process.env.INVENTORY_RENDER_DIR) : RAW
const CROPS = path.join(BASE, 'crops'), PAGES = path.join(BASE, 'pages')
rmSync(CROPS, { recursive: true, force: true }); rmSync(PAGES, { recursive: true, force: true })
mkdirSync(CROPS, { recursive: true }); mkdirSync(PAGES, { recursive: true })

// ---------------- 主流程 ----------------
async function runPass({ browser, base, width, height, withCrops, withStates, withAxe }) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: withCrops ? 2 : 1, locale: 'zh-CN', reducedMotion: 'no-preference' })
  const page = await context.newPage()
  const records = [], states = [], axe = [], log = []
  const ctx = {}
  let loggedIn = false
  for (const sc of SCENARIOS) {
    if (sc.skip) continue // 已下线的页面，见 scenarios.mjs
    try {
      if (sc.auth !== false && !loggedIn) { await login(page, base); loggedIn = true }
      await sc.go(page, base, ctx)
    } catch (e) { log.push({ scenario: sc.id, width, ok: false, error: e.message.split('\n')[0].slice(0, 200) }); console.log(width, sc.id, 'FAILED', e.message.split('\n')[0]); continue }
    if (sc.id === 'home' && !ctx.tokens) ctx.tokens = await page.evaluate(probeTokens)
    const recs = await page.evaluate(collectInPage, { scenario: sc.id, width })
    await page.screenshot({ path: path.join(PAGES, `${sc.id}-${width}.png`), fullPage: false })
    // 同一页里，同样子的只截第一张
    if (withCrops) {
      const seen = new Set()
      for (const r of recs) {
        const key = JSON.stringify([r.tag, r.st.bg, r.st.border, r.st.radius, r.st.shadow, r.st.color, r.st.fontSize, r.st.fontWeight, r.st.padding, r.interactive ? r.st.height : ''])
        if (seen.has(key) || r.rect.w > 1400 || r.rect.h > 1200) continue
        seen.add(key)
        const file = `${sc.id}-${r.n}.png`
        try { await page.locator(`[data-inv-n="${r.n}"]`).screenshot({ path: path.join(CROPS, file), timeout: 3000, animations: 'disabled' }); r.crop = file } catch {}
      }
    }
    if (withStates) {
      const cdp = await context.newCDPSession(page)
      await cdp.send('DOM.enable'); await cdp.send('CSS.enable')
      const { root } = await cdp.send('DOM.getDocument', { depth: 0 })
      const tried = new Set()
      for (const r of recs) {
        if (!r.interactive || !r.crop) continue
        const key = r.inv + '|' + r.st.bg + r.st.color; if (tried.has(key)) continue; tried.add(key)
        const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: `[data-inv-n="${r.n}"]` }).catch(() => ({}))
        if (!nodeId) continue
        const rest = await page.evaluate(styleOf, r.n)
        const one = { scenario: sc.id, n: r.n, inv: r.inv, rest }
        for (const [label, pseudo] of [['hover', ['hover']], ['focus', ['focus', 'focus-visible']], ['active', ['active', 'hover']]]) {
          await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: pseudo })
          await sleep(260) // 等过渡（--motion-fast 120ms，最长 240ms）
          one[label] = await page.evaluate(styleOf, r.n)
          const file = `${sc.id}-${r.n}-${label}.png`
          try { await page.locator(`[data-inv-n="${r.n}"]`).screenshot({ path: path.join(CROPS, file), timeout: 3000 }); one[label + 'Crop'] = file } catch {}
          await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] })
        }
        states.push(one)
      }
      await cdp.detach()
    }
    if (withAxe) {
      await page.addScriptTag({ content: axeSource }).catch(() => {})
      const res = await page.evaluate(async () => {
        const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] }, resultTypes: ['violations'] })
        return r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.map((nd) => {
          const el = document.querySelector(nd.target[0]); const host = el?.closest('[data-inv]')
          return { inv: host?.getAttribute('data-inv') || null, n: el?.getAttribute('data-inv-n') ?? host?.getAttribute('data-inv-n') ?? null, summary: (nd.failureSummary || '').slice(0, 300), html: nd.html.slice(0, 160) }
        }) }))
      }).catch((e) => [{ id: 'axe-error', nodes: [], help: e.message }])
      axe.push({ scenario: sc.id, violations: res })
    }
    for (const r of recs) records.push(r)
    log.push({ scenario: sc.id, width, ok: true, candidates: recs.length })
    console.log(width, sc.id, 'ok', recs.length)
  }
  const seeds = null // 验漏在 seeds.mjs 里单独做，不动这份数据
  await context.close()
  return { records, states, axe, log, seeds, tokens: ctx.tokens }
}

const rig = await startRig({ quiet: true })
const browser = await chromium.launch({ executablePath: process.env.INVENTORY_CHROMIUM || '/opt/pw-browsers/chromium' })
try {
  const wide = await runPass({ browser, base: rig.base, width: 1440, height: 900, withCrops: true, withStates: true, withAxe: true })
  // 窄屏要重新起一份干净数据，顺序依赖（先空后满）才成立
  await rig.stop()
  const rig2 = await startRig({ quiet: true })
  const narrow = await runPass({ browser, base: rig2.base, width: 390, height: 844, withCrops: false, withStates: false, withAxe: false })
  await rig2.stop()
  writeFileSync(path.join(BASE, 'render.json'), JSON.stringify({ wide, narrow }))
  console.log('wide records', wide.records.length, 'states', wide.states.length, 'narrow records', narrow.records.length)
  console.log('failed:', [...wide.log, ...narrow.log].filter((l) => !l.ok).map((l) => `${l.width}:${l.scenario}`).join(', ') || 'none')
} finally { await browser.close(); process.exit(0) }
