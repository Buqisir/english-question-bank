#!/usr/bin/env node
// draft-desk-b step1 (MF-6, plan.md "步1 — 服务器分页渲染器 + 实例池"):
// perf verify for server/draft-paper/paginationRenderer.mjs + chromiumPool.mjs.
//
// Two assertions:
//   (1) warm-instance single render latency <= 1000ms (plan.md budget;
//       measured on this machine, `channel: 'chromium'` build, ~700-800ms —
//       see paginationRenderer.mjs's latency note for why this is slower
//       than spike-gate-dp1.md's ~490ms figure, and why that's expected)
//   (2) the render does not block the Node event loop — a `setInterval`
//       probe keeps ticking at roughly its configured cadence while a
//       render is in flight (`await`ed, not synchronous)
//
// NOT registered in verify-ci.mjs (see scripts/README.md "Runs in CI?" =
// no), and — draft-desk-b step5 (SW-B) — deliberately kept OUT of the `e2e`
// job too, even though that job now installs server's playwright-core
// Chromium (step4) and does run this script's two siblings
// (verify-draft-pagination-renderer.mjs / verify-draft-pagination-dom-contract.mjs).
// The reason is specific to this script, not an environment gap:
//   - an absolute-latency assertion against a real headless-Chromium render
//     on a shared, unpredictably-loaded CI runner is exactly the kind of
//     check plan.md's own Verify 要求 flags as "易抖动可标非 CI" — a fixed
//     1000ms ceiling would either be loose enough to stop meaning anything
//     or tight enough to flake on a noisy runner. This script is local-only
//     by design: the source of truth for the LOCAL number to watch, not a
//     merge gate.

import { buildPrintHtml } from '../server/print-renderer.mjs'
import { renderPaginatedPaper } from '../server/draft-paper/paginationRenderer.mjs'
import { closeChromiumPool } from '../server/draft-paper/chromiumPool.mjs'

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

function addDraftFooterCss(html, title) {
  const safeTitle = String(title || '英语练习卷').replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  const footerCss = `
@page {
  @bottom-center {
    content: "${safeTitle} · " counter(page);
    font-size: 9pt;
    color: #666;
  }
}
`
  return html.replace('</style>', `${footerCss}\n</style>`)
}

function makeLongPassage(paragraphCount) {
  const paras = []
  for (let i = 0; i < paragraphCount; i++) {
    paras.push(`Paragraph ${i + 1}. ${'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(12)}`)
  }
  return paras.join('\n\n')
}

function makeGroup(id, questionCount, paragraphCount) {
  const questions = []
  for (let i = 0; i < questionCount; i++) {
    questions.push({
      id: `${id}-q${i + 1}`,
      questionNo: i + 1,
      stem: `Question ${i + 1} for ${id}?`,
      answer: 'A',
      explanation: `Explanation ${i + 1}.`,
      note: '',
      options: [
        { label: 'A', content: 'First option' },
        { label: 'B', content: 'Second option' },
        { label: 'C', content: 'Third option' },
        { label: 'D', content: 'Fourth option' },
      ],
    })
  }
  return {
    id,
    title: `${id} title`,
    groupType: 'reading',
    defaultScore: 2,
    passage: { title: `${id} passage`, materialText: makeLongPassage(paragraphCount), summary: '' },
    questions,
  }
}

// Same shape as one full exam section — realistic single-paper-worth of
// content (one long passage + two shorter ones), not a toy fixture.
function buildFixtureHtml() {
  const groups = [
    makeGroup('reading-a', 5, 20),
    makeGroup('reading-b', 5, 4),
    makeGroup('reading-c', 5, 4),
  ]
  const items = groups.map((detail) => ({ detail, score: 2, sectionTitle: '', note: '' }))
  const blocks = [
    { type: 'section_header', title: '第一部分 阅读理解' },
    ...groups.map((g) => ({ type: 'question_group', questionGroupId: g.id, score: 2 })),
  ]
  const html = buildPrintHtml({
    title: 'Perf Fixture Paper',
    versionType: 'student',
    printStyle: 'exam',
    items,
    blocks,
    questionNumberStart: 1,
  })
  return addDraftFooterCss(html, 'Perf Fixture Paper')
}

const WARM_LATENCY_BUDGET_MS = 1000

console.log('Draft-paper pagination renderer perf verify')

async function main() {
  const html = buildFixtureHtml()

  // Warm-up render: pays chromium.launch() + first-page overhead, NOT
  // counted toward the warm-instance budget (plan.md distinguishes cold
  // first-render <=3s from warm <=1s; this script only asserts the warm
  // number, since that is the steady-state case every render after the
  // first hits).
  await renderPaginatedPaper(html)

  const warmStart = Date.now()
  const warmResult = await renderPaginatedPaper(html)
  const warmElapsedMs = Date.now() - warmStart

  assert(
    `warm-instance single render completes within ${WARM_LATENCY_BUDGET_MS}ms budget`,
    warmElapsedMs <= WARM_LATENCY_BUDGET_MS,
    `measured ${warmElapsedMs}ms`,
  )
  console.log(`  (measured warm latency: ${warmElapsedMs}ms; pageCount=${warmResult.pageCount})`)

  // Event-loop-not-blocked probe: a 10ms setInterval should keep firing at
  // roughly its configured cadence while a render is in flight. If the
  // render synchronously blocked the event loop (e.g. a stray execFileSync
  // somewhere in the render path), tick count would collapse toward 0
  // regardless of how long the render actually took.
  let ticks = 0
  const probeIntervalMs = 10
  const interval = setInterval(() => {
    ticks += 1
  }, probeIntervalMs)
  const probeStart = Date.now()
  await renderPaginatedPaper(html)
  const probeElapsedMs = Date.now() - probeStart
  clearInterval(interval)

  const expectedTicks = probeElapsedMs / probeIntervalMs
  // Generous floor (30% of the naive expectation) — timer scheduling is
  // never exact even on an unblocked event loop, and this only needs to
  // distinguish "ticking roughly on schedule" from "collapsed to ~0", not
  // measure precise timer jitter.
  const minAcceptableTicks = Math.max(3, Math.floor(expectedTicks * 0.3))
  assert(
    'event loop keeps ticking during an in-flight render (not synchronously blocked)',
    ticks >= minAcceptableTicks,
    `ticks=${ticks}, elapsed=${probeElapsedMs}ms, expected~${Math.round(expectedTicks)}, floor=${minAcceptableTicks}`,
  )
  console.log(`  (probe: ${ticks} ticks over ${probeElapsedMs}ms render)`)

  await closeChromiumPool()

  if (failed > 0) {
    console.error(`\nDraft-paper pagination renderer perf verify FAILED: ${passed} passed, ${failed} failed`)
    process.exit(1)
  }
  console.log(`\nDraft-paper pagination renderer perf verify passed: ${passed} passed, 0 failed`)
}

main().catch(async (error) => {
  console.error('Draft-paper pagination renderer perf verify CRASHED:', error)
  await closeChromiumPool().catch(() => {})
  process.exit(1)
})
