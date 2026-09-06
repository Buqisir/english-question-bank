#!/usr/bin/env node
// reorder-suggest (docs/cuts/reorder-suggest/plan.md): verifies the plan's
// 施工契约 1-4 acceptance shape.
//
// NOT registered in verify-ci.mjs (scripts/README.md "Runs in CI?" = no) —
// same reason as scripts/verify-draft-pagination-dom-contract.mjs /
// scripts/verify-a3-imposition.mjs: Phase B below drives
// getDraftPaperPagination (via getReorderSuggestion, which reuses it) —
// that launches the shared full Chromium. Plan.md's own verify section says
// to reuse "verify-a3-imposition e2e 段模式" for the
// e2e portion — that mode IS the Fast-lane-only, Chromium-requiring pattern,
// so this script follows the SAME registration precedent those scripts set
// (runs as its own step in the CI sandbox Fast lane, after the Chromium
// install) rather than joining verify-ci.mjs.
//
// Phase A (pure, no Chromium, no dev server — always runs, fast):
//   ① buildReorderCandidates: determinism, hard cap 6, candidates identical
//     to the current order or to each other are dropped, pageBreakBefore
//     travels with its item (never cleared/reset by a move), only the
//     first 2 broken groups BY CURRENT POSITION are used.
//   ② proposeReorder/evaluateCandidateOrder against a REAL derivePageBreakSuggestions/
//     evaluatePageBreakAcrossPages (imported for real, not reimplemented) fed
//     synthetic contract-shaped fixtures via stub buildDraftPaginationPrintHtml/
//     renderPaginatedPaper/applyPaginationDomContract deps (same "real judgment
//     fn + synthetic contract HTML" style as scripts/verify-print-form.mjs's own
//     ③ section — no Chromium needed to prove the THRESHOLD logic itself):
//     an a3 fixture where a swap zeroes out the real break (真值验证 — the
//     RETURNED candidate is independently re-dry-run and reconfirmed empty,
//     not just trusted), and an a4 fixture where the break is intrinsic to
//     one group's own content (unfixable by reordering) so every candidate
//     still breaks and proposeReorder correctly returns null (宁缺勿假).
//
// Phase B (live, real Chromium + dev server, real click — plan.md "沿用
// verify-a3-imposition e2e 段模式"): seeds one confirmed Canonical Paper
// (same fixture seam as verify-a3-imposition.mjs, force multi-page) into a real
// draft, then:
//   ③ zero-DB-write: draft_papers/draft_paper_items row snapshots taken
//     immediately before/after a real GET .../reorder-suggestion call are
//     byte-identical.
//   ④ zero-pagination-cache-pollution: a GET .../pagination call before and
//     after the reorder-suggestion call returns byte-identical paginatedHtml
//     with `reused: true` on the second call — proves the candidate dry-run
//     renders never overwrote the real cache entry the current order owns.
//   ⑤ endpoint shape: `{ suggestion: null }` or `{ suggestion: { order,
//     move, brokenGroupId } }` with `order` a true permutation of the
//     draft's own non-missing item ids.
//   ⑥ not-found parity: an unknown draftPaperId 404s with the same
//     "Draft paper not found" message the pagination route uses (same
//     sendDraftMutationError wiring — M0-4's "unmatched (id,user_id) reads
//     as not-found" convention this route inherits verbatim).
//   ⑦ real click (if this fixture produced a card — same "if present, else
//     log and move on" escape hatch verify-a3-imposition.mjs's own seam-
//     suggestion assertion uses, plan.md never guarantees THIS fixture
//     produces one): click "调整顺序 →", assert the resulting PATCH
//     succeeds and item order actually changed; click 撤销 in the undo
//     toast, assert a second PATCH restores the original order.
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

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
function pass(name) {
  passed += 1
  console.log(`PASS ${name}`)
}

console.log('reorder-suggest verify: candidate evaluator + real dry-run threshold + live click')

// ─────────────────────────────────────────────────────────────────────────
// Phase A: pure candidate generation + threshold logic (no Chromium)
// ─────────────────────────────────────────────────────────────────────────
async function runPhaseA() {
  console.log('\n--- Phase A: buildReorderCandidates + proposeReorder threshold (no Chromium) ---')

  const { buildReorderCandidates, evaluateCandidateOrder, proposeReorder } = await import(
    path.join(rootDir, 'server/draft-paper/reorderSuggestion.mjs')
  )
  const { derivePageBreakSuggestions } = await import(path.join(rootDir, 'server/draft-paper/draftPaperStore.mjs'))

  // --- ① buildReorderCandidates ---
  function item(id, groupId, pageBreakBefore = false) {
    return { id, groupId, pageBreakBefore }
  }
  const items = [item('i1', 'g1'), item('i2', 'g2'), item('i3', 'g3'), item('i4', 'g4'), item('i5', 'g5')]
  const currentKey = items.map((i) => i.id).join('|')

  const candidates = buildReorderCandidates(items, ['g4', 'g1', 'g2'])
  assert('candidate count is <= 6 (hard cap)', candidates.length <= 6, String(candidates.length))
  assert(
    'no candidate is identical to the current order',
    !candidates.some((c) => c.items.map((i) => i.id).join('|') === currentKey),
  )
  const keys = candidates.map((c) => c.items.map((i) => i.id).join('|'))
  assert('all generated candidates are pairwise distinct (dedup)', new Set(keys).size === keys.length, JSON.stringify(keys))
  assert(
    'only the first 2 broken groups BY POSITION are used (g1@0, g2@1) — g4@3 ignored even though listed first in input',
    candidates.every((c) => c.brokenGroupId === 'g1' || c.brokenGroupId === 'g2'),
    JSON.stringify(candidates.map((c) => c.brokenGroupId)),
  )
  const candidatesAgain = buildReorderCandidates(items, ['g4', 'g1', 'g2'])
  assert(
    'buildReorderCandidates is deterministic (same input -> same output, same order)',
    JSON.stringify(candidates.map((c) => c.items.map((i) => i.id))) === JSON.stringify(candidatesAgain.map((c) => c.items.map((i) => i.id))),
  )

  // 4 items so the broken one (i3, index 2) has a distinct predecessor two
  // slots away from the front — swap-prev([i2,i3] swap) and front (move to
  // index 0) are then genuinely different sequences, unlike a 3-item list
  // where a mid item's front-move collapses onto its own swap-prev.
  const itemsWithFlag = [item('i1', 'g1'), item('i2', 'g2'), item('i3', 'g3', true), item('i4', 'g4')]
  const flagCandidates = buildReorderCandidates(itemsWithFlag, ['g3'])
  const frontMove = flagCandidates.find((c) => c.move.kind === 'front')
  assert('a front-move candidate exists for a mid-list broken item', Boolean(frontMove), JSON.stringify(flagCandidates.map((c) => c.move)))
  if (frontMove) {
    assert(
      'pageBreakBefore travels WITH the moved item, never cleared (plan.md: "标志随 item 走,不清除不挪移")',
      frontMove.items.find((i) => i.id === 'i3')?.pageBreakBefore === true,
    )
  }

  const singleItemCandidates = buildReorderCandidates([item('only', 'g-only')], ['g-only'])
  assert('a single-item draft yields zero candidates (no prev/next/front/end move changes anything)', singleItemCandidates.length === 0)

  // --- ② threshold logic against REAL derivePageBreakSuggestions, synthetic contract HTML ---
  // Each item is assigned a page-unit count; buildContractHtmlForOrder lays
  // items out sequentially, one unit = one page, and serializes the exact
  // `.preview-page` / `data-group-id` contract shape derivePageBreakSuggestions
  // consumes (same shape scripts/verify-print-form.mjs's own fixtureHtml uses) —
  // so a group with >1 unit spans that many CONSECUTIVE real pages, and the
  // REAL judgment function decides whether that's a break for the given
  // printForm. No Chromium: buildDraftPaginationPrintHtml/renderPaginatedPaper/
  // applyPaginationDomContract are stubbed to marker-passthroughs (deps are
  // dependency-injected specifically so this is possible — reorderSuggestion.mjs
  // never imports Chromium/Playwright itself).
  function buildContractHtmlForOrder(order, unitsByGroupId) {
    const pages = []
    for (const groupId of order) {
      const units = unitsByGroupId[groupId] || 1
      for (let u = 0; u < units; u += 1) pages.push(groupId)
    }
    const html = `<!doctype html><html><body>${pages
      .map((groupId) => `<div class="pagedjs_page preview-page"><section class="question-group" data-group-id="${groupId}"><p>x</p></section></div>`)
      .join('')}</body></html>`
    return { html, pageCount: pages.length }
  }
  function makeDeps(unitsByGroupId) {
    return {
      versionType: 'student',
      buildDraftPaginationPrintHtml: (candidateDraftPaper) => JSON.stringify(candidateDraftPaper.items.map((i) => i.groupId)),
      renderPaginatedPaper: async (marker) => {
        const { html, pageCount } = buildContractHtmlForOrder(JSON.parse(marker), unitsByGroupId)
        return { paginatedHtml: html, pageCount }
      },
      applyPaginationDomContract: (paginatedHtml) => paginatedHtml,
      derivePageBreakSuggestions,
    }
  }

  // a3-fixable fixture: g-a (1 unit), g-b (2 units, real 翻面 break at its
  // current position), g-c (1 unit). A swap zeroes it out.
  {
    const a3Items = [item('item-a', 'g-a'), item('item-b', 'g-b'), item('item-c', 'g-c')]
    const draftPaper = { id: 'd-a3', title: 't', items: a3Items }
    const deps = makeDeps({ 'g-a': 1, 'g-b': 2, 'g-c': 1 })
    const currentSuggestions = await evaluateCandidateOrder(draftPaper, a3Items, 'a3', deps)
    assert(
      'a3 fixture: current order (g-a,g-b,g-c) has exactly one real break, on g-b (翻面, firstPage=2)',
      currentSuggestions.length === 1 && currentSuggestions[0].groupId === 'g-b' && currentSuggestions[0].reason.includes('翻面'),
      JSON.stringify(currentSuggestions),
    )
    const result = await proposeReorder(draftPaper, currentSuggestions, 'a3', deps)
    assert('a3 fixture: proposeReorder finds a fixing candidate (not null)', result !== null, JSON.stringify(result))
    if (result) {
      assert('a3 fixture: move.kind is swap', result.move.kind === 'swap', JSON.stringify(result.move))
      assert('a3 fixture: brokenGroupId is g-b', result.brokenGroupId === 'g-b')
      const orderedItems = result.order.map((id) => a3Items.find((i) => i.id === id))
      const reconfirm = await evaluateCandidateOrder(draftPaper, orderedItems, 'a3', deps)
      assert(
        '真值验证: independently re-dry-running the RETURNED order confirms zero breaks (真值验证过才亮, not just trusted)',
        reconfirm.length === 0,
        JSON.stringify(reconfirm),
      )
    }
  }

  // a4-unfixable fixture: g-x (2 units — its OWN content spans 2 pages no
  // matter where it sits), g-y (1 unit). a4 breaks every boundary
  // unconditionally, so no reorder ever fixes this — proposeReorder must
  // return null (宁缺勿假), not a false "fixed".
  {
    const a4Items = [item('item-x', 'g-x'), item('item-y', 'g-y')]
    const draftPaper = { id: 'd-a4', title: 't', items: a4Items }
    const deps = makeDeps({ 'g-x': 2, 'g-y': 1 })
    const currentSuggestions = await evaluateCandidateOrder(draftPaper, a4Items, 'a4', deps)
    assert('a4 fixture: current order has exactly one real break, on g-x', currentSuggestions.length === 1 && currentSuggestions[0].groupId === 'g-x', JSON.stringify(currentSuggestions))
    const result = await proposeReorder(draftPaper, currentSuggestions, 'a4', deps)
    assert(
      'a4 fixture: proposeReorder correctly returns null — an intrinsic (order-independent) break must never surface a false-fixed suggestion',
      result === null,
      JSON.stringify(result),
    )
  }

  // Zero-breakage input: proposeReorder must short-circuit to null without
  // ever calling the (deliberately absent) render deps.
  {
    const draftPaper = { id: 'd-clean', title: 't', items: [item('only', 'g-only')] }
    const result = await proposeReorder(draftPaper, [], 'a4', {})
    assert('zero current suggestions -> proposeReorder returns null with no dry-run attempted (deps never called)', result === null)
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Phase B: live dev server + real Chromium + real click
// ─────────────────────────────────────────────────────────────────────────
async function runPhaseB(browser) {
  console.log('\n--- Phase B: live UI, real Chromium dry-run, real click (plan.md "沿用 verify-a3-imposition e2e 段模式") ---')

  const tempRoot = mkdtempSync(path.join(tmpdir(), 'eqb-reorder-suggest-'))
  const dbPath = path.join(tempRoot, 'question-bank.sqlite')
  const userDataDbPath = path.join(tempRoot, 'user-data.sqlite')
  const paperAssetsDir = path.join(tempRoot, 'paper-assets')
  const apiPort = Number(process.env.AMP_ORB_CI_API_PORT || 9898)
  const vitePort = Number(process.env.AMP_ORB_CI_VITE_PORT || 5188)
  const children = []

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

    function snapshotRows() {
      const db = new DatabaseSync(userDataDbPath, { readOnly: true })
      try {
        const draftRows = db.prepare('SELECT id, updated_at FROM draft_papers ORDER BY id').all()
        const itemRows = db.prepare('SELECT id, order_index, page_break_before, updated_at FROM draft_paper_items ORDER BY id').all()
        return JSON.stringify({ draftRows, itemRows })
      } finally {
        db.close()
      }
    }

    // ─── ③④⑤ zero-DB-write + zero-cache-pollution + endpoint shape ───
    const paginationBefore = await page.evaluate(
      async (id) => (await fetch(`/api/draft-papers/${id}/pagination`)).json(),
      draftId,
    )
    const rowsBefore = snapshotRows()
    const reorderResponse = await page.evaluate(
      async (id) => {
        const response = await fetch(`/api/draft-papers/${id}/reorder-suggestion`)
        return { ok: response.ok, status: response.status, body: await response.json() }
      },
      draftId,
    )
    const rowsAfter = snapshotRows()
    assert('GET .../reorder-suggestion returns 200', reorderResponse.ok, String(reorderResponse.status))
    assert('GET .../reorder-suggestion is zero-write: draft_papers/draft_paper_items rows unchanged', rowsBefore === rowsAfter)

    const paginationAfter = await page.evaluate(
      async (id) => (await fetch(`/api/draft-papers/${id}/pagination`)).json(),
      draftId,
    )
    assert('a follow-up pagination GET still reuses the cache (reused: true)', paginationAfter.reused === true, JSON.stringify({ reused: paginationAfter.reused }))
    assert(
      'the reorder-suggestion dry-run never overwrote the real pagination cache entry (byte-identical paginatedHtml before/after)',
      paginationAfter.paginatedHtml === paginationBefore.paginatedHtml,
    )

    // CR MF-1 回归钉：第二次调用必须命中缓存（reused: true），null 裁决
    // 也一样——否则 A4 常见路径每次调用都重跑最多 6 次 Chromium dry-run。
    const reorderSecond = await page.evaluate(
      async (id) => (await fetch(`/api/draft-papers/${id}/reorder-suggestion`)).json(),
      draftId,
    )
    assert(
      'a second reorder-suggestion GET hits the LRU cache (reused: true) — null verdicts included (CR MF-1)',
      reorderSecond.reused === true,
      JSON.stringify({ reused: reorderSecond.reused, suggestionIsNull: reorderSecond.suggestion === null }),
    )
    assert(
      'the cached verdict is byte-identical to the first response',
      JSON.stringify(reorderSecond.suggestion) === JSON.stringify(reorderResponse.body.suggestion),
    )

    const suggestion = reorderResponse.body.suggestion
    if (suggestion !== null) {
      const nonMissingItemIds = await page.evaluate(async (id) => {
        const response = await fetch(`/api/draft-papers/${id}`)
        const data = await response.json()
        return data.draftPaper.items.filter((item) => !item.groupMissing).map((item) => item.id)
      }, draftId)
      assert(
        'suggestion.order is a true permutation of the draft\'s own non-missing item ids',
        suggestion.order.length === nonMissingItemIds.length &&
          new Set(suggestion.order).size === suggestion.order.length &&
          nonMissingItemIds.every((id) => suggestion.order.includes(id)),
        JSON.stringify({ order: suggestion.order, nonMissingItemIds }),
      )
      assert('suggestion.move has a valid kind', ['swap', 'front', 'end'].includes(suggestion.move?.kind), JSON.stringify(suggestion.move))
      pass(`this fixture produced a real reorder suggestion (brokenGroupId=${suggestion.brokenGroupId}, move=${suggestion.move?.kind})`)
    } else {
      console.log('  (fixture produced no reorder suggestion this run — endpoint-shape/zero-write assertions above still cover the null path)')
    }

    // ─── ⑥ not-found parity with the pagination route ───
    const notFoundResponse = await page.evaluate(async () => {
      const response = await fetch('/api/draft-papers/nonexistent-draft-id/reorder-suggestion')
      return { status: response.status, body: await response.json() }
    })
    assert(
      'an unknown draftPaperId 404s with the same message the pagination route uses (M0-4 not-found convention)',
      notFoundResponse.status === 404 && notFoundResponse.body.error === 'Draft paper not found',
      JSON.stringify(notFoundResponse),
    )

    // ─── ⑦ real click (only if this run's fixture produced a card) ───
    await page.goto(`http://127.0.0.1:${vitePort}/?view=draft-paper&draftPaperId=${draftId}`, { waitUntil: 'networkidle' })
    await page.locator('.draft-a4-sheet iframe').waitFor({ timeout: 15_000 })
    await page.waitForFunction(
      (expected) => document.querySelectorAll('.draft-paper-rail-item').length >= expected,
      groupIds.length,
      { timeout: 15_000 },
    )
    // The suggestion card is fetched only after pagination resolves with real
    // breakage — give it a moment, but don't fail if it never shows (plan.md
    // 拉取策略: null/cleared -> no card, a legitimate outcome).
    const cardAppeared = await page
      .waitForSelector('.draft-reorder-suggestion', { timeout: 6000 })
      .then(() => true)
      .catch(() => false)

    async function assertClickFlow(label) {
      const orderBeforeClick = await page.evaluate(async (id) => {
        const response = await fetch(`/api/draft-papers/${id}`)
        const data = await response.json()
        return data.draftPaper.items.map((item) => item.id)
      }, draftId)

      const applyMutation = page.waitForResponse(
        (response) => response.url().includes(`/api/draft-papers/${draftId}`) && response.request().method() === 'PATCH',
        { timeout: 10_000 },
      )
      await page.locator('.draft-reorder-suggestion-act').first().click()
      const applyResponse = await applyMutation
      assert(`real click on 调整顺序 → triggers a successful PATCH [${label}]`, applyResponse.ok(), String(applyResponse.status()))

      const orderAfterClick = await page.evaluate(async (id) => {
        const response = await fetch(`/api/draft-papers/${id}`)
        const data = await response.json()
        return data.draftPaper.items.map((item) => item.id)
      }, draftId)
      assert(`applying the suggestion actually changed the item order [${label}]`, JSON.stringify(orderAfterClick) !== JSON.stringify(orderBeforeClick))

      await page.locator('.draft-undo-toast').filter({ hasText: '顺序已调整' }).waitFor({ timeout: 5000 })
      const undoMutation = page.waitForResponse(
        (response) => response.url().includes(`/api/draft-papers/${draftId}`) && response.request().method() === 'PATCH',
        { timeout: 10_000 },
      )
      await page.locator('.draft-undo-toast').filter({ hasText: '顺序已调整' }).getByRole('button', { name: /撤销/ }).click()
      const undoResponse = await undoMutation
      assert(`real click on 撤销 triggers a successful PATCH [${label}]`, undoResponse.ok(), String(undoResponse.status()))

      const orderAfterUndo = await page.evaluate(async (id) => {
        const response = await fetch(`/api/draft-papers/${id}`)
        const data = await response.json()
        return data.draftPaper.items.map((item) => item.id)
      }, draftId)
      assert(`undo restores the exact original item order [${label}]`, JSON.stringify(orderAfterUndo) === JSON.stringify(orderBeforeClick), JSON.stringify({ orderAfterUndo, orderBeforeClick }))
    }

    if (cardAppeared) {
      await assertClickFlow('real-data')
    } else {
      console.log('  (real-data pass produced no card this run — the deterministic routed-mock pass below still proves the click flow)')
    }

    // ─── ⑦b deterministic click flow (routed mock — always runs; CR SW-1 收账) ───
    // Engine truth (调换顺序真的能消断) is pinned by Phase A with the real
    // derive/evaluate functions. Here only the suggestion RESPONSE is routed to
    // a fixed swap of the draft's real item ids — the card, the apply PATCH
    // payload, the toast, and the undo are all real FE behavior, every run.
    const realIds = await page.evaluate(async (id) => {
      const response = await fetch(`/api/draft-papers/${id}`)
      const data = await response.json()
      return data.draftPaper.items.filter((item) => !item.groupMissing).map((item) => item.id)
    }, draftId)
    const realSuggestions = await page.evaluate(async (id) => {
      const response = await fetch(`/api/draft-papers/${id}/pagination`)
      const data = await response.json()
      return data.pageBreakSuggestions || []
    }, draftId)
    const mockedOrder = [realIds[1], realIds[0], ...realIds.slice(2)]
    const mockedSuggestion = {
      order: mockedOrder,
      move: { kind: 'swap', itemId: realIds[0], otherItemId: realIds[1] },
      brokenGroupId: realSuggestions[0]?.groupId ?? null,
    }
    await page.route('**/reorder-suggestion*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ suggestion: mockedSuggestion, reused: false }) }),
    )
    await page.goto(`http://127.0.0.1:${vitePort}/?view=draft-paper&draftPaperId=${draftId}`, { waitUntil: 'networkidle' })
    await page.locator('.draft-a4-sheet iframe').waitFor({ timeout: 15_000 })
    const mockCard = await page
      .waitForSelector('.draft-reorder-suggestion', { timeout: 15_000 })
      .then(() => true)
      .catch(() => false)
    assert('routed-mock pass: the quiet reorder card renders (deterministic, no escape hatch)', mockCard)
    if (mockCard) await assertClickFlow('routed-mock')
    await page.unroute('**/reorder-suggestion*')

    if (pageErrors.length > 0) {
      failed += 1
      console.error(`FAIL no browser page errors expected\n  ${pageErrors.join('\n  ')}`)
    } else {
      pass('no browser page errors during the reorder-suggest flow')
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

async function main() {
  await runPhaseA()

  const browser = await chromium.launch({ headless: true, channel: 'chromium' })
  try {
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
    // Explicit exit — same documented fix as verify-a3-imposition.mjs's own
    // main().finally(): detached process groups can leave dangling fds/
    // handles alive even after every child is killed.
    process.exit(process.exitCode || 0)
  })
