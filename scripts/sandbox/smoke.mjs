#!/usr/bin/env node
// Real offline capability probes; not a replacement for product verifiers or CI.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const output = path.resolve(process.argv[2] || `.scratch/sandbox-smoke-${Date.now()}`)
assert(output.startsWith(`${root}${path.sep}`), 'smoke output must stay in the current workspace')
mkdirSync(path.dirname(output), { recursive: true })
mkdirSync(output, { recursive: false })
const serverRequire = createRequire(path.join(root, 'server/package.json'))
const appRequire = createRequire(path.join(root, 'app/package.json'))
const results = []
function command(name, args, options = {}) {
  return execFileSync(name, args, { encoding: 'utf8', timeout: 90_000, maxBuffer: 16 * 1024 * 1024, ...options })
}
async function check(name, fn) {
  try {
    const evidence = await fn()
    results.push({ name, status: 'PASS', evidence: evidence ?? null })
    console.log(`PASS ${name}${evidence ? `: ${evidence}` : ''}`)
  } catch (error) {
    results.push({ name, status: 'FAIL', error: String(error) })
    console.error(`FAIL ${name}: ${error}`)
  }
}
await check('bound paths support statx and realpath', () => {
  assert(appRequire.resolve('./package.json').startsWith(root))
  assert(command('stat', ['/workspace/app/package.json']).includes('package.json'))
  assert(readFileSync('/opt/eqb-tooling/smoke.mjs', 'utf8').includes('bound paths support statx'))
})
await check('pinned Node and pnpm', () => {
  assert.equal(process.version, 'v24.21.0')
  assert.equal(command('pnpm', ['--version']).trim(), '10.28.1')
  return `${process.version}; pnpm 10.28.1`
})
await check('native argon2 addon', async () => {
  const argon2 = serverRequire('argon2')
  const hash = await argon2.hash('sandbox-synthetic-probe')
  assert.equal(await argon2.verify(hash, 'sandbox-synthetic-probe'), true)
  assert.equal(await argon2.verify(hash, 'wrong'), false)
})
await check('SQLite executable and in-memory transaction', () => {
  assert.equal(command('sqlite3', [':memory:', "BEGIN; CREATE TABLE t(x TEXT); INSERT INTO t VALUES('bridge-ok'); COMMIT; SELECT x FROM t;"]).trim(), 'bridge-ok')
  return command('sqlite3', ['--version']).trim()
})
await check('Noto CJK font resolver', () => {
  const family = command('fc-match', ['-f', '%{family}', 'Noto Serif CJK SC'])
  assert.match(family, /Noto Serif CJK/)
  return family
})
const pdf = path.join(output, 'browser.pdf')
await check('exact Playwright Chromium, click, screenshot and PDF', async () => {
  const { chromium } = appRequire('playwright')
  const metadata = JSON.parse(readFileSync(path.join(path.dirname(serverRequire.resolve('playwright-core/package.json')), 'browsers.json'), 'utf8'))
  const expected = metadata.browsers.find(x => x.name === 'chromium').browserVersion
  const browser = await chromium.launch({ headless: true, channel: 'chromium' })
  try {
    assert.equal(browser.version(), expected)
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } })
    await page.setContent('<!doctype html><meta charset="utf-8"><style>body{font:22px "Noto Serif CJK SC",serif;padding:30px}button{font:inherit}</style><h1>EQB_SANDBOX_RENDER</h1><p>英语题库 · 离线渲染验证</p><button onclick="this.textContent=\'已验证\'">点击验证</button>')
    await page.getByRole('button', { name: '点击验证' }).click()
    assert.equal(await page.getByRole('button').textContent(), '已验证')
    await page.screenshot({ path: path.join(output, 'browser.png') })
    await page.pdf({ path: pdf, format: 'A4', printBackground: true })
    assert(readFileSync(pdf).subarray(0, 5).equals(Buffer.from('%PDF-')))
    return browser.version()
  } finally {
    await browser.close()
  }
})
await check('Poppler text extraction and rasterization', () => {
  assert.match(command('pdftotext', [pdf, '-']), /EQB_SANDBOX_RENDER/)
  command('pdftoppm', ['-f', '1', '-singlefile', '-scale-to', '800', '-png', pdf, path.join(output, 'poppler')])
  assert(readFileSync(path.join(output, 'poppler.png')).length > 1000)
})
await check('ImageMagick PDF policy and pixel conversion', () => {
  const image = path.join(output, 'magick.png')
  command('magick', ['-density', '72', pdf + '[0]', '-resize', '50%', image])
  assert.match(command('magick', ['identify', '-format', '%m', image]), /PNG/)
  return command('magick', ['-version']).split('\n')[0]
})
await check('Ghostscript PDF interpretation', () => {
  command('gs', ['-q', '-dNOPAUSE', '-dBATCH', '-sDEVICE=nullpage', pdf])
})
await check('FFmpeg encode and ffprobe decode metadata', () => {
  const audio = path.join(output, 'synthetic.wav')
  command('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.2', '-y', audio])
  const duration = Number(command('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', audio]))
  assert(duration >= 0.19 && duration <= 0.21)
})
await check('DOCX ZIP and LibreOffice headless PDF', () => {
  const docx = path.join(output, 'fixture.docx')
  command('python3', ['-c', `import sys,zipfile
with zipfile.ZipFile(sys.argv[1], 'w') as z:
 z.writestr('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
 z.writestr('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
 z.writestr('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>EQB_SANDBOX_DOCX</w:t></w:r></w:p></w:body></w:document>')`, docx])
  assert.match(command('unzip', ['-p', docx, 'word/document.xml']), /EQB_SANDBOX_DOCX/)
  command('libreoffice', ['-env:UserInstallation=file://' + path.join(output, 'lo-profile'), '--headless', '--convert-to', 'pdf', '--outdir', output, docx])
  assert.match(command('pdftotext', [path.join(output, 'fixture.pdf'), '-']), /EQB_SANDBOX_DOCX/)
  return command('libreoffice', ['--version']).trim()
})
writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2) + '\n')
console.log(`RESULT ${results.filter(x => x.status === 'PASS').length} PASS / ${results.filter(x => x.status === 'FAIL').length} FAIL`)
process.exitCode = results.some(x => x.status === 'FAIL') ? 1 : 0
