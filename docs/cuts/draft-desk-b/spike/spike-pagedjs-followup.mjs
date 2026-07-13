#!/usr/bin/env node
/**
 * Follow-up evidence for the two open items from spike-pagedjs-gate.mjs:
 *
 * (b-fix) Footer: the main spike read .pagedjs_margin-content textContent — but
 *   paged.js emits margin-box text via CSS vars + ::after, invisible to
 *   textContent. Two corrected probes:
 *     1. pdftotext over ALL pages of run1.pdf — every page must end with
 *        "<title> · N" (the addDraftFooterCss cascade winning over the base rule).
 *     2. serialized DOM re-load: read getComputedStyle(el, '::after').content
 *        per page — the live-page preview must show the same footer.
 *
 * (d-fix) Replay contamination: the serialized HTML still contains the injected
 *   paged.js polyfill <script>, which re-runs pagination on load and appends
 *   duplicate pages (12 counted vs 9 real). Strip ALL <script> tags before
 *   replaying (production will serve paginated HTML script-free anyway), then:
 *     - .pagedjs_page count must equal PDF page count (9)
 *     - screenshot page 6 of the stripped replay for eyeball parity vs pdf-page-6.png
 *
 * Uses the artifacts dir from the latest gate run (passed as argv[2] or the
 * hardcoded most-recent one).
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'

const rootDir = '/Users/huangxuewei/Projects/english-question-bank'
const require = createRequire(import.meta.url)
const { chromium } = require(require.resolve('playwright', { paths: [path.join(rootDir, 'app')] }))

const artifactsDir = process.argv[2] || '/var/folders/x6/sssfzp3x1xdfbr7bz3p_v7s40000gn/T/spike-pagedjs-5ZevN7'
const pdfPath = path.join(artifactsDir, 'run1.pdf')
const serializedPath = path.join(artifactsDir, 'run1-serialized.html')

// --- (b-fix) probe 1: footer text on every PDF page via pdftotext ---
console.log('=== (b-fix) PDF footer per page (pdftotext, last line of each page) ===')
const EXPECT_PREFIX = '2026年广东省高三一模英语试卷 ·'
let pdfFooterAllOk = true
for (let p = 1; p <= 9; p++) {
  const txt = execFileSync('pdftotext', ['-layout', '-f', String(p), '-l', String(p), pdfPath, '-'], { encoding: 'utf8' })
  const lines = txt.split('\n').map(s => s.trim()).filter(Boolean)
  const last = lines[lines.length - 1] || '(empty page)'
  const ok = last.startsWith(EXPECT_PREFIX) && last.endsWith(String(p))
  if (!ok) pdfFooterAllOk = false
  console.log(`  page ${p}: "${last}" ${ok ? 'OK' : '<-- MISSING/WRONG'}`)
}
console.log(`  ALL 9 PDF pages footer "${EXPECT_PREFIX} <n>": ${pdfFooterAllOk ? 'PASS' : 'FAIL'}`)

// --- (d-fix) strip scripts from serialized HTML, replay, count pages ---
console.log('\n=== (d-fix) Script-stripped replay of serialized DOM ===')
const raw = readFileSync(serializedPath, 'utf8')
const stripped = raw.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
const strippedPath = path.join(artifactsDir, 'run1-serialized-stripped.html')
writeFileSync(strippedPath, stripped)
console.log(`  scripts removed: ${(raw.length - stripped.length)} bytes of <script> content`)

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
await page.goto('file://' + strippedPath, { waitUntil: 'load' })
// give any (should-be-absent) async work a beat, then count twice to prove stability
const count1 = await page.evaluate(() => document.querySelectorAll('.pagedjs_page').length)
await page.waitForTimeout(1500)
const count2 = await page.evaluate(() => document.querySelectorAll('.pagedjs_page').length)
console.log(`  .pagedjs_page count: ${count1} (immediately) / ${count2} (after 1.5s) — expect 9/9`)

// --- (b-fix) probe 2: footer via ::after computed content on the stripped replay ---
console.log('\n=== (b-fix) Live-DOM footer via getComputedStyle(::after) per page ===')
const domFooters = await page.evaluate(() => {
  const pages = Array.from(document.querySelectorAll('.pagedjs_page'))
  return pages.map((p, i) => {
    const el = p.querySelector('.pagedjs_margin-bottom-center')
    if (!el) return { index: i + 1, content: '(no margin box)' }
    const after = getComputedStyle(el, '::after').content
    const self = getComputedStyle(el).content
    const inner = p.querySelector('.pagedjs_margin-bottom-center .pagedjs_margin-content')
    const innerAfter = inner ? getComputedStyle(inner, '::after').content : null
    return { index: i + 1, boxAfter: after, boxContent: self, innerAfter }
  })
})
for (const f of domFooters) console.log(`  page ${f.index}: box::after=${f.boxAfter} box.content=${f.boxContent} inner::after=${f.innerAfter}`)

// --- eyeball artifacts: screenshot stripped-replay page 6 (footer visible page) ---
const els = await page.$$('.pagedjs_page')
if (els[5]) await els[5].screenshot({ path: path.join(artifactsDir, 'stripped-dom-page-06.png') })
if (els[0]) await els[0].screenshot({ path: path.join(artifactsDir, 'stripped-dom-page-01.png') })
console.log(`\n  screenshots: stripped-dom-page-01.png / stripped-dom-page-06.png (compare vs pdf-page-1/6.png)`)

await browser.close()
console.log(`\nArtifacts dir: ${artifactsDir}`)
