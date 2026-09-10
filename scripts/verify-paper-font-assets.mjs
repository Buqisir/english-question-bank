#!/usr/bin/env node
// Font-bundle canary, not a claim that legacy production consumers migrated.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { chromium } from '../app/node_modules/playwright/index.mjs'
import { renderPaginatedPaper } from '../server/draft-paper/paginationRenderer.mjs'
import { closeChromiumPool } from '../server/draft-paper/chromiumPool.mjs'

const root = new URL('../app/public/fonts/paper/', import.meta.url)
const files = new Map()
for (const line of readFileSync(new URL('SHA256SUMS', root), 'utf8').trim().split('\n')) {
  const [, expected, name] = line.match(/^([a-f0-9]{64})  (.+)$/) || []
  assert.ok(expected && name, 'invalid checksum entry')
  const bytes = readFileSync(new URL(name, root))
  assert.equal(createHash('sha256').update(bytes).digest('hex'), expected, name)
  files.set(`/${name}`, bytes)
}
assert.equal([...files.keys()].filter(name => name.endsWith('.otf')).length, 6)
assert.doesNotMatch(files.get('/fonts.css').toString().replace(/\/\*[\s\S]*?\*\//g, ''), /local\s*\(/)
console.log('PASS: six original font files and license/CSS checksums match')

const specimens = [
  ['en', 'normal', 400, 'Reading a garden: Il1 O0 0123456789.', 'TeXGyreTermes-Regular'],
  ['en', 'normal', 700, 'Reading a garden: Il1 O0 0123456789.', 'TeXGyreTermes-Bold'],
  ['en', 'italic', 400, 'Reading a garden: Il1 O0 0123456789.', 'TeXGyreTermes-Italic'],
  ['en', 'italic', 700, 'Reading a garden: Il1 O0 0123456789.', 'TeXGyreTermes-BoldItalic'],
  ['zh', 'normal', 400, '阅读下列短文，选出最佳选项。（共两节）', 'SourceHanSerifCN-Regular'],
  ['zh', 'normal', 700, '阅读下列短文，选出最佳选项。（共两节）', 'SourceHanSerifCN-Bold'],
]
const server = createServer((req, res) => {
  const bytes = files.get(req.url)
  if (!bytes) { res.writeHead(404).end(); return }
  res.setHeader('Content-Type', req.url.endsWith('.otf') ? 'font/otf' : 'text/css')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.end(bytes)
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}`
const html = `<!doctype html><meta charset="utf-8"><title>Selected paper font verification</title>
<link rel="stylesheet" href="${origin}/fonts.css">
<style>
@page { size: A4; margin: 20mm; }
body { color: #111; margin: 28px; font-family: 'EQB Termes', 'EQB Source Han Serif'; font-synthesis: none; }
h1 { font-size: 22px; font-weight: 700; }
p { margin: 12px 0; line-height: 1.6; font-size: 24px; }
.en { font-family: 'EQB Termes'; } .zh { font-family: 'EQB Source Han Serif'; }
.caption { font-size: 14px; }
@media print { body { margin: 0; } }
</style><h1>Termes ＋ 思源宋体 · 已选定字体</h1>
${specimens.map(([lang, style, weight, text], i) => `<p id="sample-${i}" class="${lang}" style="font-style:${style};font-weight:${weight}">${text}</p>`).join('')}
<p class="caption">英文：常规、粗体、斜体、粗斜体；中文：常规、粗体。</p>
<p class="caption">字体资产验证样张，不是完整生产试卷验收。</p>`

async function inspectFonts(page, prefix = '') {
  await page.evaluate(() => document.fonts.ready)
  const faces = await page.evaluate(() => [...document.fonts].map(f => f.status))
  assert.equal(faces.length, 6)
  assert.ok(faces.every(status => status === 'loaded'), JSON.stringify(faces))
  const cdp = await page.context().newCDPSession(page)
  try {
    await cdp.send('DOM.enable')
    await cdp.send('CSS.enable')
    const { root } = await cdp.send('DOM.getDocument')
    for (const [i, [, , , , expected]] of specimens.entries()) {
      const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: `${prefix}#sample-${i}` })
      const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId })
      assert.ok(fonts.length && fonts.every(f => f.isCustomFont && f.postScriptName === expected), JSON.stringify(fonts))
    }
  } finally { await cdp.detach() }
}

let browser
try {
  browser = await chromium.launch({ headless: true, channel: 'chromium' })
  const page = await browser.newPage({ viewport: { width: 900, height: 650 }, deviceScaleFactor: 2 })
  await page.setContent(html, { waitUntil: 'load' })
  await inspectFonts(page)
  console.log('PASS: Screen uses all six pinned faces without OS fallback')
  await page.emulateMedia({ media: 'print' })
  await inspectFonts(page)
  console.log('PASS: Print HTML uses the same six faces')
  const artifacts = process.argv.includes('--actual-artifacts')
  const out = new URL('../.amp/in/artifacts/', import.meta.url)
  if (artifacts) {
    mkdirSync(out, { recursive: true })
    await page.emulateMedia({ media: 'screen' })
    await page.screenshot({ path: fileURLToPath(new URL('selected-paper-fonts.png', out)), fullPage: true })
  }
  const result = await renderPaginatedPaper(html, { inspect: page => inspectFonts(page, '.pagedjs_pages ') })
  assert.equal(result.pageCount, 1)
  assert.ok(result.pdfBytes.length > 1000)
  if (artifacts) writeFileSync(new URL('selected-paper-fonts.pdf', out), result.pdfBytes)
  console.log('PASS: production Paged.js/PDF pipeline preserves all six faces on one A4 page')
  let inspectedBrokenDocument = false
  await assert.rejects(renderPaginatedPaper(`${html}<style>@font-face {
    font-family: 'Broken Face'; src: url("data:font/otf;base64,AA==");
  }</style>`, { inspect: () => { inspectedBrokenDocument = true } }), /font|network/i)
  assert.equal(inspectedBrokenDocument, false)
  console.log('PASS: a broken declared font rejects before paginated inspection/PDF output')
} finally {
  await browser?.close()
  await closeChromiumPool()
  await new Promise(resolve => server.close(resolve))
}
