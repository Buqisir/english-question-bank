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
import { createServer as createViteServer } from '../app/node_modules/vite/dist/node/index.js'

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

const webFaces = JSON.parse(readFileSync(new URL('../app/src/shared-ui/papersurface/paperWebFonts.json', import.meta.url)))
for (const face of webFaces) {
  assert.equal(createHash('sha256').update(readFileSync(new URL(face.sourcePath, root))).digest('hex'), face.sourceSha256)
  const seen = new Set()
  for (const shard of face.shards) {
    const bytes = readFileSync(new URL(shard.path, root))
    assert.equal(bytes.length, shard.byteLength)
    assert.equal(createHash('sha256').update(bytes).digest('hex'), shard.sha256)
    for (const [from, to] of shard.ranges) for (let code = from; code <= to; code++) {
      assert(!seen.has(code), 'shards must not change ownership after late loading')
      seen.add(code)
    }
  }
  assert.equal(seen.size, 30930, 'complete original Chinese font character coverage')
}

const vite = await createViteServer({
  root: fileURLToPath(new URL('../app', import.meta.url)),
  appType: 'custom',
  server: { host: '127.0.0.1', port: 0 },
})
vite.middlewares.use('/__font-gate', async (_request, response) => {
  response.setHeader('Content-Type', 'text/html')
  response.end(await vite.transformIndexHtml('/__font-gate', `<!doctype html><meta charset="utf-8"><style>
    body{margin:24px;background:white;color:black}
    #sample{font-family:'EQB Termes','EQB Source Han Serif';font-size:24px;line-height:1.6;
      font-synthesis:none;font-kerning:none;font-variant-ligatures:none;width:720px}
    p{margin:0}
  </style><div id="root"></div><script type="module">
    import React from '/node_modules/.vite/deps/react.js';
    import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
    import {PaperFontGate} from '/src/shared-ui/papersurface/PaperFontGate.tsx';
    const root=ReactDOM.createRoot(document.querySelector('#root'));
    window.mounts=[];
    function Sample({text}) {
      React.useLayoutEffect(()=>{window.mounts.push({text,width:document.querySelector('#sample').getBoundingClientRect().width})},[text]);
      return React.createElement('div',{id:'sample'}, ...['normal','bold','italic'].map((style,index)=>
        React.createElement('p',{key:style,style:{fontWeight:index===1?700:400,fontStyle:index===2?'italic':'normal'}},text)));
    }
    window.renderText=text=>root.render(React.createElement(PaperFontGate,null,React.createElement(Sample,{text})));
    window.renderText('阅读下列短文，选出最佳选项。 English Il1 O0 0123456789.');
  </script>`))
})
await vite.listen()
const gateOrigin = `http://127.0.0.1:${vite.httpServer.address().port}`
let webBrowser
try {
  webBrowser = await chromium.launch({ headless: true, channel: 'chromium' })
  const page = await webBrowser.newPage({ viewport: { width: 850, height: 400 } })
  let delay = true
  let corrupt = false
  let downloaded = 0
  await page.route('**/fonts/paper/**', async route => {
    const url = new URL(route.request().url())
    const relative = url.pathname.replace('/fonts/paper/', '')
    const bytes = readFileSync(new URL(relative, root))
    downloaded += bytes.length
    if (delay) await new Promise(resolve => setTimeout(resolve, 300))
    await route.fulfill({ contentType: relative.endsWith('.woff2') ? 'font/woff2' : 'font/otf',
      body: corrupt && relative.endsWith('.woff2') ? Buffer.from('corrupt') : bytes })
  })
  await page.goto(`${gateOrigin}/__font-gate`)
  await page.getByRole('status').waitFor()
  assert.equal(await page.locator('#sample').count(), 0, 'no measured content before fonts are verified')
  await page.locator('#sample').waitFor()
  assert(downloaded < 2_000_000, `ordinary cold paper must not download full CJK fonts: ${downloaded}`)
  console.log(`PASS: cold browser mounts after verified shards; ${downloaded} font bytes instead of 24 MB`)

  // A newly introduced supplementary character must not get one fallback-font
  // render using the previous content's ready state. Supersede it while loading.
  const rare = String.fromCodePoint(webFaces[0].shards.at(-1).ranges.at(-1)[1])
  await page.evaluate(text => window.renderText(text), `罕见字 ${rare}`)
  await page.getByRole('status').waitFor()
  assert.equal(await page.locator('#sample').count(), 0)
  await page.evaluate(() => window.renderText('阅读新内容'))
  await page.locator('#sample').waitFor()
  await page.waitForTimeout(400)
  assert.equal(await page.locator('#sample p').first().textContent(), '阅读新内容')
  assert(!(await page.evaluate(() => window.mounts)).some(mount => mount.text.includes('罕见字')),
    'cancelled content must never mount after its delayed font request')
  delay = false
  const specimen = `阅读下列短文。龘 ${rare} English Il1 O0 0123456789.`
  await page.evaluate(text => window.renderText(text), specimen)
  await page.waitForFunction(text => document.querySelector('#sample p')?.textContent === text, specimen)
  const subsetImage = await page.locator('#sample').screenshot()
  const subsetRects = await page.locator('#sample p').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().height))
  await page.evaluate(async faces => {
    for (const face of faces) {
      const response = await fetch(`/fonts/paper/${face.path}`)
      const family = face.family === 'EQB Termes' ? 'Original Termes' : 'Original Han'
      document.fonts.add(await new FontFace(family, await response.arrayBuffer(), {style:face.style,weight:face.weight}).load())
    }
    document.querySelector('#sample').style.fontFamily = '"Original Termes", "Original Han"'
  }, (await import('../shared/papersurface/paperFonts.mjs')).paperFontFaces)
  assert.deepEqual(await page.locator('#sample p').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().height)), subsetRects)
  assert.deepEqual(await page.locator('#sample').screenshot(), subsetImage, 'original OTF and sharded WOFF2 must produce identical pixels')
  if (process.argv.includes('--actual-artifacts')) {
    writeFileSync(new URL('../.amp/in/artifacts/paper-web-fonts.png', import.meta.url), subsetImage)
  }
  console.log('PASS: regular/bold/italic mixed text, rare and supplementary glyph pixels match original OTF')

  corrupt = true
  await page.reload()
  await page.getByRole('alert').waitFor()
  assert.equal(await page.locator('#sample').count(), 0)
  console.log('PASS: corrupt web shard fails closed without a fallback-font content mount')
} finally {
  await webBrowser?.close()
  await vite.close()
}
