#!/usr/bin/env node
// draft-desk-b step1 (MF-2, plan.md "步1 — 服务器分页渲染器 + 实例池"):
// determinism verify for server/draft-paper/paginationRenderer.mjs.
//
// Renders the SAME synthetic print HTML 3 times through renderPaginatedPaper()
// and asserts: (1) pageCount is identical every run; (2) paginatedHtml is
// byte-identical every run, modulo pagedjs's own per-render-random UUIDs; and
// (3) every question group lands on the same page(s) every run.
//
// NOT registered in verify-ci.mjs (see scripts/README.md "Runs in CI?" = no):
// this script launches a real headless Chromium instance (playwright-core,
// `channel: 'chromium'`, see chromiumPool.mjs). The main `verify` CI job
// (`docs/ci/verify-workflow-template.yml` / `.github/workflows/verify.yml`)
// only runs `npm ci` in server/ — it does NOT install a Chromium binary
// (only the separate `e2e` job's "Install Playwright Chromium" step does,
// and only for app/'s `playwright`, not server's `playwright-core`).
// `npm ci` alone never downloads a browser for `playwright-core` (unlike the
// full `playwright` package, it ships no postinstall browser download) — a
// clean CI checkout of the `verify` job has no Chromium to launch, so this
// script would fail there for an environment reason, not a code reason.
// Wiring a Chromium install step into the main verify job (or moving this
// check into the e2e job) is a CI-infra decision out of this self-contained
// step's scope — flagged as a Should-Watch for whoever wires step1 into the
// rest of draft-desk-b's CI story.
//
// KNOWN, EXPECTED non-determinism (confirmed locally, not a defect): pagedjs
// assigns a fresh random UUID to `data-ref` (and `data-split-to` /
// `data-split-from` on split fragments) on every render pass, purely to
// correlate fragments WITHIN that one render — spike-gate-dp1.md finding #4
// already relies on this (step2's group-id mapping reads `data-ref` inside a
// single render, never across renders). Comparing raw paginatedHtml strings
// across 3 independent renders is therefore never byte-identical; this
// script normalizes UUID-shaped tokens before the byte-identity comparison
// and separately proves per-group page-landing is stable, which is the
// property that actually matters for preview/export parity.

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

// Mirrors draftPaperStore.mjs's addDraftFooterCss cascade (SW-4) — the real
// input contract this module is fed ("buildPrintHtml 产出 + addDraftFooterCss
// 之后的那种", per this cut's task spec) always has this second @page rule
// layered on top.
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

function makeLongPassage(paragraphCount, marker) {
  const paras = [`MARKER_${marker}_START`]
  for (let i = 0; i < paragraphCount; i++) {
    paras.push(`Paragraph ${i + 1}. ${'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(12)}`)
  }
  paras.push(`MARKER_${marker}_END`)
  return paras.join('\n\n')
}

function makeGroup(id, marker, questionCount, paragraphCount) {
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
    passage: { title: `${id} passage`, materialText: makeLongPassage(paragraphCount, marker), summary: '' },
    questions,
  }
}

// Three groups, one with a long passage — forces a multi-page render (the
// long-passage-splits-across-pages scenario is DP-1 acceptance check (a))
// so the determinism assertion below is proving something non-trivial, not
// just "a 1-page render is stable".
const GROUP_SPECS = [
  { id: 'reading-a', marker: 'ALPHA', questionCount: 5, paragraphCount: 20 },
  { id: 'reading-b', marker: 'BRAVO', questionCount: 5, paragraphCount: 4 },
  { id: 'reading-c', marker: 'CHARLIE', questionCount: 5, paragraphCount: 4 },
]

function buildFixtureHtml() {
  const groups = GROUP_SPECS.map((spec) => makeGroup(spec.id, spec.marker, spec.questionCount, spec.paragraphCount))
  const items = groups.map((detail) => ({ detail, score: 2, sectionTitle: '', note: '' }))
  const blocks = [
    { type: 'section_header', title: '第一部分 阅读理解' },
    ...groups.map((g) => ({ type: 'question_group', questionGroupId: g.id, score: 2 })),
  ]
  const html = buildPrintHtml({
    title: 'Determinism Fixture Paper',
    versionType: 'student',
    printStyle: 'exam',
    items,
    blocks,
    questionNumberStart: 1,
  })
  return addDraftFooterCss(html, 'Determinism Fixture Paper')
}

// paged.js's per-render-random tokens (see module header) always take this
// canonical UUID shape (8-4-4-4-12 hex).
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g
function normalizeRandomRefs(html) {
  return html.replace(UUID_RE, 'UUID')
}

// A real `.pagedjs_page` container's opening tag, excluding the plural
// `.pagedjs_pages` wrapper and `.pagedjs_pagebox` (both share the
// "pagedjs_page" prefix as a substring, so a naive substring match
// over-counts — `\b` word-boundary excludes them since there is no
// character boundary between "page" and the "s"/"box" that follows).
const PAGE_OPEN_RE = /<div class="[^"]*\bpagedjs_page\b[^"]*"/g

// paged.js keeps the ENTIRE original (un-split) source inside a hidden
// `<template data-ref="pagedjs-content">…</template>` ahead of the actual
// per-page render — every marker's FIRST occurrence in the serialized HTML
// is inside that inert template, not on a real page. Page-landing lookups
// must search only after it.
function findLandingPage(html, marker) {
  const templateEnd = html.indexOf('</template>')
  const idx = html.indexOf(`MARKER_${marker}`, templateEnd === -1 ? 0 : templateEnd)
  if (idx === -1) return null
  return [...html.slice(0, idx).matchAll(PAGE_OPEN_RE)].length // 1-based landing page index
}

console.log('Draft-paper pagination renderer determinism verify')

async function main() {
  const html = buildFixtureHtml()

  const runs = []
  for (let i = 0; i < 3; i++) {
    // eslint-disable-next-line no-await-in-loop -- determinism requires sequential renders of the SAME input
    const result = await renderPaginatedPaper(html)
    runs.push(result)
  }

  assert('renders return exactly 3 results', runs.length === 3)

  assert(
    'pageCount is identical across 3 renders',
    runs.every((r) => r.pageCount === runs[0].pageCount),
    `pageCounts: ${runs.map((r) => r.pageCount).join(', ')}`,
  )
  assert('pageCount is greater than 1 (fixture actually spans pages)', runs[0].pageCount > 1, `pageCount=${runs[0].pageCount}`)

  for (const r of runs) {
    assert('paginatedHtml contains no <script> tag (contract: scripts stripped)', !/<script/i.test(r.paginatedHtml))
  }

  const normalized = runs.map((r) => normalizeRandomRefs(r.paginatedHtml))
  assert(
    'paginatedHtml is byte-identical across 3 renders (after normalizing pagedjs\'s per-render-random data-ref/data-split-* UUIDs)',
    normalized.every((h) => h === normalized[0]),
    normalized.every((h) => h === normalized[0])
      ? ''
      : `lengths: ${normalized.map((h) => h.length).join(', ')}`,
  )

  for (const spec of GROUP_SPECS) {
    for (const suffix of ['START', 'END']) {
      const marker = `${spec.marker}_${suffix}`
      const landings = runs.map((r) => findLandingPage(r.paginatedHtml, marker))
      assert(`marker ${marker} is found on a real page in every render`, landings.every((p) => p !== null && p > 0), `landings: ${landings.join(', ')}`)
      assert(
        `question group ${spec.id} (marker ${marker}) lands on the same page across 3 renders`,
        landings.every((p) => p === landings[0]),
        `landings: ${landings.join(', ')}`,
      )
    }
  }

  for (const r of runs) {
    assert('pdfBytes is non-empty', r.pdfBytes.length > 0, `length=${r.pdfBytes.length}`)
    assert('pdfBytes starts with the PDF magic header', Buffer.from(r.pdfBytes.slice(0, 5)).toString('latin1') === '%PDF-')
  }

  await closeChromiumPool()

  if (failed > 0) {
    console.error(`\nDraft-paper pagination renderer determinism verify FAILED: ${passed} passed, ${failed} failed`)
    process.exit(1)
  }
  console.log(`\nDraft-paper pagination renderer determinism verify passed: ${passed} passed, 0 failed`)
}

main().catch(async (error) => {
  console.error('Draft-paper pagination renderer determinism verify CRASHED:', error)
  await closeChromiumPool().catch(() => {})
  process.exit(1)
})
