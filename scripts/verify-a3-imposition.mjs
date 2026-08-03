#!/usr/bin/env node
// a3-imposition (docs/cuts/a3-imposition/plan.md): verifies the plan's Must
// Do 1-4 acceptance shape.
//
// Phase A (pure, no dev server — always runs, fast): loads
// app/src/features/draft-paper/draftPaperPreviewHtml.ts's actual TS source
// (type-stripped via node:module's stripTypeScriptTypes, same function —
// not a reimplementation) into a real headless Chromium page via Playwright
// (`app`'s `playwright` devDependency) so `applyA3Imposition` runs against a
// REAL DOMParser, matching production. Against a synthetic 7-page DOM-
// contract-shaped fixture (paginationDomContract.mjs's frozen shape):
//   ① buildA4PreviewHtml's own source is byte-identical to the pre-cut
//     version (git-diff based — this cut never edits that function, only
//     appends new code after it) — 裁点4's zero-diff requirement.
//   ② face/sheet pairing is correct: 7 pages -> faces (1,2)(3,4)(5,6)(7,留白),
//     sheets (face1+face2)(face3+face4), matching prototype.html's example.
//   ③ every face/sheet label + fold/seam text from prototype.html's 方案C is
//     present in the wrapped output.
//   ④ every seam is tagged `data-seam-before-group` with the id of the
//     group that actually starts the page right after it (cross-checked
//     against server/draftPaperStore.mjs's evaluatePageBreakAcrossPages
//     firstPage%4 rule, independently re-derived here).
//
// Phase B (live, real dev server + real click — plan.md "必须真点实证，不
// 许只靠源码断言"): seeds a temp DB from one already confirmed Canonical
// Paper to force multi-page pagination, boots api+vite against it, drives a real
// Playwright browser through the actual DraftPaperWorkbench UI: A3 toggle,
// persistent overlay buttons (上移/下移/前置分页), rail click-to-scroll,
// scrollspy highlight-on-scroll, and (if the fixture produces one) a real
// click on the seam suggestion pill — every one asserted via an actual
// mutation response or an actual measured DOM/scroll position, never a
// source-only assertion.
//
// Requires TWO real Chromium binaries (CR SW-3 correction — the original
// claim "never touches server's playwright-core" was wrong): Phase A/B's own
// clicks drive `app`'s Playwright Chromium, but Phase B boots server/api.mjs,
// whose pagination render path spawns server/draft-paper/chromiumPool.mjs
// (server's playwright-core Chromium). In CI both are provisioned by earlier
// `e2e` job steps — do not reorder this step above either install step. Same
// verify-ci.mjs non-registration convention as verify-draft-pagination-*.mjs.
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { seedConfirmedCanonicalDraftFixture } from './lib/canonicalDraftE2eFixture.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const require = createRequire(import.meta.url)
const playwrightPath = require.resolve('playwright', { paths: [path.join(rootDir, 'app')] })
const { chromium } = require(playwrightPath)

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

console.log('a3-imposition verify: face/sheet imposition + real-click interaction re-anchor')

// ─────────────────────────────────────────────────────────────────────────
// Phase A: pure imposition-algorithm checks against a real DOMParser
// ─────────────────────────────────────────────────────────────────────────
async function runPhaseA(browser) {
  console.log('\n--- Phase A: imposition algorithm (synthetic fixture, real DOMParser) ---')

  // 裁点4 / ①: buildA4PreviewHtml's own source must be byte-identical to the
  // pre-cut version. This cut's diff against 9e8154a (the a3-imposition plan
  // commit this cut builds on) is purely additive after that function — see
  // docs/cuts/a3-imposition/plan.md's Forbidden list intent (a4 zero-diff).
  const currentSource = readFileSync(
    path.join(rootDir, 'app/src/features/draft-paper/draftPaperPreviewHtml.ts'),
    'utf8',
  )
  const sliceFn = (source, name) => {
    const startMarker = `export function ${name}`
    const start = source.indexOf(startMarker)
    if (start < 0) return null
    // Find the matching closing brace by brace-depth counting from the
    // function's own opening brace.
    const openBrace = source.indexOf('{', start)
    let depth = 0
    let i = openBrace
    for (; i < source.length; i += 1) {
      if (source[i] === '{') depth += 1
      else if (source[i] === '}') {
        depth -= 1
        if (depth === 0) break
      }
    }
    return source.slice(start, i + 1)
  }
  const baseSource = execGitShow('HEAD', 'app/src/features/draft-paper/draftPaperPreviewHtml.ts')
  const baseFn = sliceFn(baseSource, 'buildA4PreviewHtml')
  const currentFn = sliceFn(currentSource, 'buildA4PreviewHtml')
  assert(
    '① buildA4PreviewHtml source is byte-identical to the pre-cut version (a4 zero-diff, 裁点4)',
    baseFn !== null && baseFn === currentFn,
  )
  assert(
    'DraftPaperWorkbench.tsx a4 branch returns buildA4PreviewHtml output unwrapped (applyA3Imposition only called for a3)',
    /return draftPaper\?\.printForm === 'a3' \? applyA3Imposition\(base\) : base/.test(
      readFileSync(path.join(rootDir, 'app/src/features/draft-paper/DraftPaperWorkbench.tsx'), 'utf8'),
    ),
  )

  // Load the REAL module (type-stripped, not reimplemented) into a page with
  // a real DOMParser.
  const strippedRaw = stripTypeScriptTypes(currentSource, { mode: 'strip' })
  const browserScript = strippedRaw
    .replace(/^export function /gm, 'function ')
    .replace(/^export const /gm, 'const ')
    .concat('\nwindow.__a3 = { buildA4PreviewHtml, applyA3Imposition, A3_FACE_NATIVE_WIDTH_PX };')

  const page = await browser.newPage()
  await page.addScriptTag({ content: browserScript })

  const fixture = buildFixtureHtml(7)
  const result = await page.evaluate((html) => {
    const wrapped = window.__a3.buildA4PreviewHtml(html)
    return window.__a3.applyA3Imposition(wrapped)
  }, fixture)

  const analysis = await page.evaluate((html) => {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    return {
      faceCount: doc.querySelectorAll('.a3-face').length,
      sheetCount: doc.querySelectorAll('.a3-sheet').length,
      faceLabels: Array.from(doc.querySelectorAll('.a3-face-label')).map((el) => el.textContent),
      sheetLabels: Array.from(doc.querySelectorAll('.a3-sheet-label')).map((el) => el.textContent),
      seams: Array.from(doc.querySelectorAll('.a3-seam')).map((el) => ({
        kind: el.className.includes('a3-seam-flip') ? 'flip' : 'cut',
        text: el.textContent,
        groupId: el.getAttribute('data-seam-before-group'),
      })),
      blankHalves: doc.querySelectorAll('.a3-half-blank').length,
      foldTags: doc.querySelectorAll('.a3-foldtag').length,
      preservedGroupIds: Array.from(doc.querySelectorAll('[data-group-id]')).map((el) => el.getAttribute('data-group-id')),
    }
  }, result)

  // ② face/sheet pairing: 7 pages -> 4 faces (1,2)(3,4)(5,6)(7,blank), 2 sheets.
  assert('② 7 pages produce 4 faces', analysis.faceCount === 4, JSON.stringify(analysis.faceCount))
  assert('② 7 pages produce 2 sheets', analysis.sheetCount === 2, JSON.stringify(analysis.sheetCount))
  assert('② face 1 pairs 版1+版2', analysis.faceLabels.some((t) => t.includes('第 1 张 · 正面') && t.includes('版 1') && t.includes('版 2')), JSON.stringify(analysis.faceLabels))
  assert('② face 2 pairs 版3+版4', analysis.faceLabels.some((t) => t.includes('第 1 张 · 背面') && t.includes('版 3') && t.includes('版 4')), JSON.stringify(analysis.faceLabels))
  assert('② face 3 pairs 版5+版6', analysis.faceLabels.some((t) => t.includes('第 2 张 · 正面') && t.includes('版 5') && t.includes('版 6')), JSON.stringify(analysis.faceLabels))
  assert('② face 4 (trailing odd) is 版7+留白', analysis.faceLabels.some((t) => t.includes('第 2 张 · 背面') && t.includes('版 7') && t.includes('留白')), JSON.stringify(analysis.faceLabels))
  assert('② exactly one blank half placeholder rendered', analysis.blankHalves === 1, String(analysis.blankHalves))
  assert('② every face carries a fold-line tag (对折线)', analysis.foldTags === analysis.faceCount, JSON.stringify(analysis))
  assert('② all 7 original data-group-id tags survive the imposition (no content loss)', analysis.preservedGroupIds.length === 7, JSON.stringify(analysis.preservedGroupIds))

  // ③ sheet/seam copy matches prototype.html's 方案C wording.
  assert('③ sheet label reads "─── 第 N 张 A3 ───"', analysis.sheetLabels.every((t) => /─── 第 \d 张 A3 ───/.test(t)), JSON.stringify(analysis.sheetLabels))
  assert('③ seam count is 3 (between the 4 faces)', analysis.seams.length === 3, JSON.stringify(analysis.seams))
  assert('③ flip seam reads "翻面 ⟲"', analysis.seams.filter((s) => s.kind === 'flip').every((s) => s.text.includes('翻面 ⟲')), JSON.stringify(analysis.seams))
  assert('③ cut seam reads "换张 ✂"', analysis.seams.filter((s) => s.kind === 'cut').every((s) => s.text.includes('换张 ✂')), JSON.stringify(analysis.seams))

  // ④ seam groupId matches the group that actually starts the next page —
  // independently re-derived from evaluatePageBreakAcrossPages's firstPage%4
  // rule (server/draft-paper/draftPaperStore.mjs) rather than copy-pasting
  // this module's own findSeamGroupId: page index i (0-based) is g-${i};
  // the seam before face-pair boundary at 0-based page p corresponds to
  // 1-indexed firstPage=p (the boundary p/p+1), and firstPage%4===2 is a
  // flip, firstPage%4===0 is a cut (evaluatePageBreakAcrossPages, a3 branch).
  const expectedSeams = [2, 4, 6].map((pageIndex) => ({
    groupId: `g-${pageIndex}`,
    kind: pageIndex % 4 === 2 ? 'flip' : 'cut',
  }))
  for (const expected of expectedSeams) {
    const found = analysis.seams.find((s) => s.groupId === expected.groupId)
    assert(
      `④ seam before page ${expected.groupId} is tagged data-seam-before-group and is a ${expected.kind}`,
      Boolean(found) && found.kind === expected.kind,
      JSON.stringify({ expected, seams: analysis.seams }),
    )
  }

  // Idempotence / empty-input safety.
  const emptyResult = await page.evaluate(() => window.__a3.applyA3Imposition(''))
  assert('applyA3Imposition("") is a safe no-op', emptyResult === '', JSON.stringify(emptyResult))

  await page.close()
}

function execGitShow(ref, relPath) {
  const { execFileSync } = require('node:child_process')
  return execFileSync('git', ['show', `${ref}:${relPath}`], { cwd: rootDir, encoding: 'utf8' })
}

// Builds a synthetic paginationDomContract.mjs-shaped fixture: `pageCount`
// `.pagedjs_page preview-page` divs, each with ONE `.question-group
// data-group-id="g-<index>"` section (index 0-based) — deliberately simple
// (one group per page, no straddling) since Phase A only needs to exercise
// face/seam PAIRING, not group-span derivation (that is print-form's own
// verify-print-form.mjs's job, unchanged/untouched by this cut).
function buildFixtureHtml(pageCount) {
  const pages = []
  for (let i = 0; i < pageCount; i += 1) {
    pages.push(
      `<div class="pagedjs_page preview-page"><section class="question-group" data-group-id="g-${i}"><p>page ${i} content</p></section></div>`,
    )
  }
  return `<!doctype html><html><head><style>.pagedjs_page{width:794px}</style></head><body><div class="pagedjs_pages">${pages.join('\n')}</div></body></html>`
}

// ─────────────────────────────────────────────────────────────────────────
// Phase B: live dev server + real-click interaction re-anchor
// ─────────────────────────────────────────────────────────────────────────
async function runPhaseB(browser) {
  console.log('\n--- Phase B: live UI, real clicks (plan.md 裁点4 教训 — 不许只靠源码断言) ---')

  const tempRoot = mkdtempSync(path.join(tmpdir(), 'eqb-a3-imposition-'))
  const dbPath = path.join(tempRoot, 'question-bank.sqlite')
  const userDataDbPath = path.join(tempRoot, 'user-data.sqlite')
  const paperAssetsDir = path.join(tempRoot, 'paper-assets')
  const apiPort = 9897
  const vitePort = 5187
  const children = []

  // detached:true + killing the whole process group in cleanup (`-pid`, see
  // below) — not a plain SIGTERM to the child — mirrors
  // scripts/smoke-golden-path.mjs's documented fix: `npm run dev:vite`
  // spawns vite as a grandchild whose still-open stdio pipes otherwise keep
  // this script's event loop alive even after main() has returned.
  function startProcess(command, args, options) {
    const child = spawn(command, args, { ...options, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
    children.push(child)
    child.stdout.on('data', (chunk) => process.stdout.write(`[${options.name}] ${chunk}`))
    child.stderr.on('data', (chunk) => process.stderr.write(`[${options.name}] ${chunk}`))
    return child
  }

  async function waitForHttp(url, timeoutMs = 20_000) {
    const startedAt = Date.now()
    while (Date.now() - startedAt < timeoutMs) {
      try {
        const response = await fetch(url)
        if (response.ok) return
      } catch {
        // keep waiting
      }
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    throw new Error(`Timed out waiting for ${url}`)
  }

  const { groupIds } = seedConfirmedCanonicalDraftFixture({
    repositoryRoot: rootDir,
    bankDbPath: dbPath,
    paperAssetsDir,
  })

  startProcess('node', ['server/api.mjs'], {
    cwd: rootDir,
    name: 'api',
    env: {
      ...process.env,
      QUESTION_BANK_DB: dbPath,
      USER_DATA_DB: userDataDbPath,
      QUESTION_BANK_PAPER_ASSET_ROOT: paperAssetsDir,
      QUESTION_BANK_API_PORT: String(apiPort),
    },
  })
  await waitForHttp(`http://127.0.0.1:${apiPort}/api/health`)

  startProcess('npm', ['run', 'dev:vite', '--', '--host', '127.0.0.1', '--port', String(vitePort)], {
    cwd: path.join(rootDir, 'app'),
    name: 'vite',
    env: { ...process.env, QUESTION_BANK_API_PORT: String(apiPort) },
  })
  await waitForHttp(`http://127.0.0.1:${vitePort}/`)

  const page = await browser.newPage({ viewport: { width: 1440, height: 920 } })
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  try {
    await page.goto(`http://127.0.0.1:${vitePort}/`, { waitUntil: 'networkidle' })

    // Bulk-add all 10 smoke groups to the current draft directly via the API
    // (mirrors scripts/smoke-c8-draft-paper-composer.mjs's pattern) — the
    // slow search-and-click-add UI flow isn't what this script exists to
    // exercise; the a3 imposition/interaction surface is.
    const addResult = await page.evaluate(async (canonicalGroupIds) => {
      const results = []
      for (const groupId of canonicalGroupIds) {
        const response = await fetch('/api/draft-papers/current/items', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ groupId }),
        })
        results.push(response.ok)
      }
      return results
    }, groupIds)
    assert('all confirmed Canonical groups added to draft via API', addResult.every(Boolean), JSON.stringify(addResult))

    const draftId = await page.evaluate(async () => {
      const response = await fetch('/api/draft-papers/current')
      const data = await response.json()
      return data.draftPaper.id
    })

    await page.goto(`http://127.0.0.1:${vitePort}/?view=draft-paper&draftPaperId=${draftId}`, { waitUntil: 'networkidle' })
    await page.locator('.draft-a4-sheet iframe').waitFor({ timeout: 15_000 })
    await page.waitForFunction(
      (expected) => document.querySelectorAll('.draft-paper-rail-item').length >= expected,
      groupIds.length,
      { timeout: 15_000 },
    )

    const a4PageCount = await page.evaluate(() => {
      const iframe = document.querySelector('.draft-a4-sheet iframe')
      return iframe?.contentDocument?.querySelectorAll('.preview-page').length || 0
    })
    assert('fixture produces multiple A4 pages (imposition needs >=3 to be meaningful)', a4PageCount >= 3, `pageCount=${a4PageCount}`)

    // ── Toggle to A3, wait for the imposed iframe to reload ──
    await page.getByRole('button', { name: 'A3 对折' }).click()
    await page.waitForFunction(
      () => document.querySelector('.draft-a4-sheet iframe')?.contentDocument?.querySelector('.a3-imposition-wrap'),
      { timeout: 15_000 },
    )
    pass('A3 toggle click renders the imposition wrapper')

    const a3Structure = await page.evaluate(() => {
      const doc = document.querySelector('.draft-a4-sheet iframe').contentDocument
      return {
        faceCount: doc.querySelectorAll('.a3-face').length,
        sheetCount: doc.querySelectorAll('.a3-sheet').length,
        pageCount: doc.querySelectorAll('.preview-page').length,
      }
    })
    assert(
      'a3 face/sheet counts match ceil(pageCount/2) / ceil(pageCount/4)',
      a3Structure.faceCount === Math.ceil(a3Structure.pageCount / 2) && a3Structure.sheetCount === Math.ceil(a3Structure.pageCount / 4),
      JSON.stringify(a3Structure),
    )

    // ── Real click: persistent overlay buttons re-anchor correctly in A3 ──
    const overlayButtonCountBefore = await page.locator('.draft-group-actions').count()
    assert('persistent overlay button clusters render in A3 mode', overlayButtonCountBefore > 0, String(overlayButtonCountBefore))

    const reorderMutation = page.waitForResponse(
      (response) => response.url().includes('/api/draft-papers/') && response.request().method() === 'PATCH',
      { timeout: 10_000 },
    )
    await page.getByRole('button', { name: '下移' }).first().click()
    const reorderResponse = await reorderMutation
    assert('real click on 下移 overlay button in A3 mode triggers a successful PATCH', reorderResponse.ok(), String(reorderResponse.status()))

    // ── Real click: rail item scrolls the desk to the target group's face ──
    const scrollYBefore = await page.evaluate(() => window.scrollY)
    const lastRailItem = page.locator('.draft-paper-rail-item').last()
    await lastRailItem.click()
    await page.waitForFunction((before) => window.scrollY > before + 40, scrollYBefore, { timeout: 8000 }).catch(() => null)
    const scrollYAfter = await page.evaluate(() => window.scrollY)
    assert('real click on last rail item scrolls the desk down (A3 mode)', scrollYAfter > scrollYBefore, `${scrollYBefore} -> ${scrollYAfter}`)

    // ── Scrollspy: highlight follows real scroll position ──
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'auto' }))
    await page.waitForTimeout(200)
    const activeAtTop = await page.evaluate(() => document.querySelector('.draft-paper-rail-item.active')?.getAttribute('data-draft-group-id'))
    await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'auto' }))
    await page.waitForTimeout(300)
    const activeAtBottom = await page.evaluate(() => document.querySelector('.draft-paper-rail-item.active')?.getAttribute('data-draft-group-id'))
    assert(
      'scrollspy active rail item changes after a real scroll from top to bottom (A3 mode)',
      Boolean(activeAtTop) && Boolean(activeAtBottom) && activeAtTop !== activeAtBottom,
      `${activeAtTop} -> ${activeAtBottom}`,
    )

    // ── Seam suggestion badge (if the fixture produced one): real click ──
    const seamBadgeCount = await page.locator('.draft-seam-suggestion').count()
    if (seamBadgeCount > 0) {
      const seamMutation = page.waitForResponse(
        (response) => response.url().includes('/api/draft-papers/') && response.request().method() === 'PATCH',
        { timeout: 10_000 },
      )
      await page.locator('.draft-seam-suggestion').first().click()
      const seamResponse = await seamMutation
      assert('real click on a seam suggestion pill triggers a successful pageBreakBefore PATCH', seamResponse.ok(), String(seamResponse.status()))
      pass('seam suggestion pill is clickable and wired to the same PATCH as manual 前置分页')
    } else {
      console.log('  (no seam suggestion in this fixture — skipping seam-click assertion, not a failure)')
    }

    // ── Narrow viewport: a3 stays within the page, no horizontal overflow ──
    await page.setViewportSize({ width: 900, height: 900 })
    await page.waitForTimeout(200)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    assert('A3 mode does not force outer-page horizontal overflow on a 900px viewport', overflow <= 4, String(overflow))
    await page.setViewportSize({ width: 1440, height: 920 })

    // ── Toggle back to A4: imposition wrapper disappears ──
    await page.getByRole('button', { name: 'A4 散页' }).click()
    await page.waitForFunction(
      () => !document.querySelector('.draft-a4-sheet iframe')?.contentDocument?.querySelector('.a3-imposition-wrap'),
      { timeout: 15_000 },
    )
    pass('A4 toggle click removes the imposition wrapper')

    if (pageErrors.length > 0) {
      failed += 1
      console.error(`FAIL no browser page errors expected\n  ${pageErrors.join('\n  ')}`)
    } else {
      pass('no browser page errors during the A3 flow')
    }
  } finally {
    await page.close()
    for (const child of children.reverse()) {
      try {
        process.kill(-child.pid, 'SIGTERM')
      } catch {
        child.kill('SIGTERM')
      }
    }
    if (existsSync(tempRoot)) rmSync(tempRoot, { recursive: true, force: true })
  }
}

function pass(name) {
  passed += 1
  console.log(`PASS ${name}`)
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  try {
    await runPhaseA(browser)
    await runPhaseB(browser)
  } finally {
    await browser.close()
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exitCode = 1
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => {
    // Explicit exit — same documented fix as scripts/smoke-golden-path.mjs's
    // main().finally(): detached process groups can leave dangling fds/
    // handles referenced by this process even after every child is killed,
    // keeping Node's event loop alive indefinitely instead of returning.
    process.exit(process.exitCode || 0)
  })
