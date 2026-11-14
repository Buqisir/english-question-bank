// 半身像收尾：把定稿候选收进 half-final/。
// 四张来源：找题中、递出结果、登录页、底稿，原样拷第四轮（half-round4/）。
// 没找到 = 第四轮的空手底稿：路径、水面、viewBox 都不动，只把 <title> 换成「没找到」，注释说明来源。
// 出 states.png：四张各 400 宽，下面 96、64 像素小样，排法同第四轮。截图 deviceScaleFactor 2。
// 用法：node scripts/brand/half-final.mjs。可选环境变量：INVENTORY_CHROMIUM（chromium 路径）、HALF_OUT（输出目录）。
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const REV = path.join(ROOT, 'design/brand-2026-10-13/image-review-2026-11-14')
const R4 = path.join(REV, 'half-round4')
const OUT = process.env.HALF_OUT ? path.resolve(process.env.HALF_OUT) : path.join(REV, 'half-final')
mkdirSync(OUT, { recursive: true })
for (const f of ['otter-half.svg', 'state-searching.svg', 'state-offer.svg', 'state-login.svg']) copyFileSync(path.join(R4, f), path.join(OUT, f))
const base = readFileSync(path.join(R4, 'otter-half.svg'), 'utf8')
const oldTitle = '<title>獭獭 · 半身像（底稿，手里空着）</title>'
if (!base.includes(oldTitle)) throw new Error('第四轮底稿的标题变了')
const notFound = base
  .replace(oldTitle, '<title>獭獭 · 半身像 · 没找到（空着手，两爪合在胸前）</title>')
  .replace(/<!--[\s\S]*?-->/, '<!-- 对比稿，不是母版：半身像定稿候选 · 没找到。就是第四轮的空手底稿 half-round4/otter-half.svg，路径、水面、viewBox 原样，只换了标题（scripts/brand/half-final.mjs）。提案 · 单一来源。 -->')
writeFileSync(path.join(OUT, 'state-not-found.svg'), notFound)

const { chromium } = createRequire(path.join(ROOT, 'app/package.json'))('playwright')
const browser = await chromium.launch({ executablePath: process.env.INVENTORY_CHROMIUM || '/opt/pw-browsers/chromium' })
const uri = (s) => `data:image/svg+xml;base64,${Buffer.from(s).toString('base64')}`
const read = (f) => readFileSync(path.join(OUT, f), 'utf8')
const CSS = 'body{margin:0;padding:28px;background:#F2F5F8;font:15px/1.5 system-ui,sans-serif;color:#1B2B33}h1{font-size:20px;margin:0 0 6px}p{margin:0 0 16px;color:#5A6C75}.g{display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap}figure{margin:0;background:#fff;border-radius:8px;padding:14px}figcaption{padding-top:10px}'
const cell = (sv, label) => `<figure style="width:400px"><img src="${uri(sv)}" width="400"><div class="g" style="gap:20px;margin-top:14px;align-items:flex-end"><img src="${uri(sv)}" width="96"><img src="${uri(sv)}" width="64"></div><figcaption>${label} · 400 / 96 / 64 像素宽</figcaption></figure>`
const page = await browser.newPage({ viewport: { width: 1760, height: 400 }, deviceScaleFactor: 2 })
await page.setContent(`<style>${CSS}</style><h1>半身像 · 四种状态 · 定稿候选（Owner 还没看）</h1><p>对比稿 · 提案。身体是定稿坐姿裁出来的同一份。找题中、递出结果、登录页来自第四轮；没找到空着手，就是第四轮的底稿。</p><div class="g">${cell(read('state-searching.svg'), '找题中 · 圆墩石头')}${cell(read('state-offer.svg'), '递出结果 · 扇贝')}${cell(read('state-not-found.svg'), '没找到 · 空着手')}${cell(read('state-login.svg'), '登录页探头 · 不露爪尖')}</div>`)
await page.screenshot({ path: path.join(OUT, 'states.png'), fullPage: true })
await browser.close()
