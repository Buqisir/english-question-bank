#!/usr/bin/env node
// Regression test for the domPageCount false-positive in
// server/draft-paper/paginationRenderer.mjs (introduced in b0d9f34b).
//
// The renderer's step-5 sanity check used a tag-agnostic regex
// /class="[^"]*\bpagedjs_page\b[^"]*"/g, which matches the literal substring
// `class="pagedjs_page"` even when it sits inside inert TEXT CONTENT
// (paged.js preserves a verbatim copy of the source body inside a hidden
// `<template data-ref="pagedjs-content">`, and Chromium's `outerHTML`
// serializer does not re-escape `"` inside text content — so a passage/stem
// /explanation carrying the literal substring renders back as
// `class="pagedjs_page"` text). That made the guard over-count "pages"
// (real containers + inert text occurrences) and throw a false
// `pagination bookkeeping is inconsistent` error, aborting a perfectly
// valid render.
//
// The fix mirrors paginationDomContract.mjs's stricter `<div`-prefixed
// regex so only actual page-container `<div>` elements are counted. This
// script feeds several production-shaped inputs whose text fields carry
// the trigger substring and asserts the renderer now accepts every one
// of them and that the stricter regex remains correct on real multi-page
// output.
//
// Run: node scripts/verify-draft-pagination-renderer-falsepositive.mjs

import { buildPrintHtml } from '../server/print-renderer.mjs'
import { renderPaginatedPaper } from '../server/draft-paper/paginationRenderer.mjs'
import { applyPaginationDomContract } from '../server/draft-paper/paginationDomContract.mjs'
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

// The exact 18-character trigger that buildPrintHtml's escapeHtml HTML-escapes
// (`"` -> `"`) but that round-trips back to `"` through Chromium's
// text-node serializer, leaving the bare `class="pagedjs_page"` substring in
// the serialized paginated HTML.
const TRIGGER = 'Note: paged.js wraps each printed sheet in a <div class="pagedjs_page"> container.'

function makeQuestion(overrides = {}) {
  return {
    id: 'q1',
    questionNo: 1,
    stem: 'What is paged.js?',
    answer: 'A',
    explanation: '',
    note: '',
    options: [
      { label: 'A', content: 'A paginator' },
      { label: 'B', content: 'x' },
      { label: 'C', content: 'y' },
      { label: 'D', content: 'z' },
    ],
    ...overrides,
  }
}

function buildHtml(detail, versionType = 'student') {
  const items = [{ detail, score: 2, sectionTitle: '', note: '' }]
  const blocks = [
    { type: 'section_header', title: 'Part 1' },
    { type: 'question_group', questionGroupId: detail.id, score: 2 },
  ]
  return buildPrintHtml({
    title: 'Probe Paper',
    versionType,
    printStyle: 'exam',
    items,
    blocks,
    questionNumberStart: 1,
  })
}

async function renderWithoutThrow(label, detail, { groupIds = [detail.id], versionType = 'student' } = {}) {
  const html = buildHtml(detail, versionType)
  let threw = null
  let result = null
  try {
    result = await renderPaginatedPaper(html)
  } catch (e) {
    threw = e instanceof Error ? e.message : String(e)
  }
  assert(`${label}: renderPaginatedPaper does not throw`, threw === null, threw ? `threw: ${threw}` : '')
  if (!result) return null
  assert(`${label}: pageCount is a positive integer`, Number.isInteger(result.pageCount) && result.pageCount > 0, `pageCount=${result.pageCount}`)
  assert(`${label}: paginatedHtml is non-empty`, typeof result.paginatedHtml === 'string' && result.paginatedHtml.length > 0)
  assert(`${label}: pdfBytes starts with %PDF-`, Buffer.from(result.pdfBytes.slice(0, 5)).toString('latin1') === '%PDF-')
  assert(`${label}: paginatedHtml has no <script> tag (scripts stripped)`, !/<script/i.test(result.paginatedHtml))

  // The trigger substring must actually be present at least once in the
  // serialized DOM as inert text — otherwise the test is not exercising the
  // bug. escapeHtml HTML-escapes the `"` but Chromium's text serializer
  // round-trips `"` back to `"` inside text content, so the bare
  // `class="pagedjs_page"` substring re-appears in `page.content()`.
  assert(
    `${label}: trigger substring class="pagedjs_page" is present in serialized HTML (the bug's preconditions are exercised)`,
    result.paginatedHtml.includes('class="pagedjs_page"'),
  )

  // The stricter `<div`-prefixed count must equal paged.js's reported
  // pageCount — proof the guard now agrees with paged.js on a render where
  // the permissive regex would have over-counted and thrown.
  const divPageContainers = (result.paginatedHtml.match(/<div class="[^"]*\bpagedjs_page\b[^"]*"/g) || []).length
  const permissiveCount = (result.paginatedHtml.match(/class="[^"]*\bpagedjs_page\b[^"]*"/g) || []).length
  assert(
    `${label}: stricter <div regex count (${divPageContainers}) equals paged.js pageCount (${result.pageCount})`,
    divPageContainers === result.pageCount,
    `div=${divPageContainers} pageCount=${result.pageCount}`,
  )
  assert(
    `${label}: permissive regex would have over-counted (>${result.pageCount}) — the false positive is actually being exercised, not a no-op`,
    permissiveCount > result.pageCount,
    `permissive=${permissiveCount} pageCount=${result.pageCount} (if equal, the trigger text was not preserved as text content)`,
  )

  // End-to-end: the downstream DOM-contract module (the production chain in
  // draftPaperStore.mjs's getDraftPaperPagination) must also accept this render.
  let contractThrew = null
  let contractHtml = null
  try {
    contractHtml = applyPaginationDomContract(result.paginatedHtml, { groupIds, pageCount: result.pageCount })
  } catch (e) {
    contractThrew = e instanceof Error ? e.message : String(e)
  }
  assert(`${label}: applyPaginationDomContract accepts the same render (end-to-end pipeline OK)`, contractThrew === null, contractThrew ? `threw: ${contractThrew}` : '')
  if (contractHtml) {
    const previewPageCount = (contractHtml.match(/class="[^"]*\bpreview-page\b[^"]*"/g) || []).length
    assert(`${label}: contract .preview-page count equals pageCount`, previewPageCount === result.pageCount, `preview=${previewPageCount} pageCount=${result.pageCount}`)
  }
  return result
}

console.log('Draft-paper pagination renderer false-positive regression verify')

async function main() {
  // ─── 1. Original bug scenario: trigger substring inside passage materialText ───
  // Exactly the fixture from the bug report.
  await renderWithoutThrow('passage.materialText carries trigger', {
    id: 'grp-1',
    title: 'paged.js notes',
    groupType: 'reading',
    defaultScore: 2,
    passage: { title: 'paged.js notes', materialText: TRIGGER, summary: '' },
    questions: [makeQuestion()],
  })

  // ─── 2. Trigger substring inside the question stem ───
  await renderWithoutThrow('question.stem carries trigger', {
    id: 'grp-2',
    title: 'paged.js notes — stem',
    groupType: 'reading',
    defaultScore: 2,
    passage: { title: 'paged.js notes — stem', materialText: 'A short passage.', summary: '' },
    questions: [makeQuestion({ stem: TRIGGER })],
  })

  // ─── 3. Trigger substring inside the explanation (teacher version — only
  // teacher renders explanations; see print-renderer.mjs `isTeacher` guards) ───
  await renderWithoutThrow('question.explanation carries trigger', {
    id: 'grp-3',
    title: 'paged.js notes — explanation',
    groupType: 'reading',
    defaultScore: 2,
    passage: { title: 'paged.js notes — explanation', materialText: 'A short passage.', summary: '' },
    questions: [makeQuestion({ explanation: TRIGGER })],
  }, { versionType: 'teacher' })

  // ─── 4. Trigger substring inside an option's content ───
  await renderWithoutThrow('option.content carries trigger', {
    id: 'grp-4',
    title: 'paged.js notes — option',
    groupType: 'reading',
    defaultScore: 2,
    passage: { title: 'paged.js notes — option', materialText: 'A short passage.', summary: '' },
    questions: [makeQuestion({ options: [{ label: 'A', content: TRIGGER }, { label: 'B', content: 'x' }, { label: 'C', content: 'y' }, { label: 'D', content: 'z' }] })],
  })

  // ─── 5. Trigger substring inside passage.summary as the materialText
  // fallback (print-renderer.mjs: `passage = materialText || summary`). ───
  await renderWithoutThrow('passage.summary (as materialText fallback) carries trigger', {
    id: 'grp-5',
    title: 'paged.js notes — summary',
    groupType: 'reading',
    defaultScore: 2,
    passage: { title: 'paged.js notes — summary', materialText: '', summary: TRIGGER },
    questions: [makeQuestion()],
  })

  // ─── 6. Trigger substring inside question.note (teacher version — note is
  // the explanation fallback: `rawExplanation = explanation || note`) ───
  await renderWithoutThrow('question.note carries trigger', {
    id: 'grp-6',
    title: 'paged.js notes — note',
    groupType: 'reading',
    defaultScore: 2,
    passage: { title: 'paged.js notes — note', materialText: 'A short passage.', summary: '' },
    questions: [makeQuestion({ explanation: '', note: TRIGGER })],
  }, { versionType: 'teacher' })

  // ─── 7. Trigger substring inside question.answer (teacher version — only
  // teacher renders the answer line) ───
  await renderWithoutThrow('question.answer carries trigger', {
    id: 'grp-7',
    title: 'paged.js notes — answer',
    groupType: 'reading',
    defaultScore: 2,
    passage: { title: 'paged.js notes — answer', materialText: 'A short passage.', summary: '' },
    questions: [makeQuestion({ answer: TRIGGER })],
  }, { versionType: 'teacher' })

  // ─── 8. Multi-page render with the trigger substring: a long passage
  // containing TRIGGER that must split across pages. The permissive regex
  // would over-count once per rendered page that shows the trigger text
  // (plus once in the preserved template copy), so a multi-page scenario is
  // the strongest exercise. ───
  const longMaterial = [
    TRIGGER,
    ...Array.from({ length: 24 }, (_, i) => `Paragraph ${i + 1}. ${'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(12)}`),
  ].join('\n\n')
  const multiResult = await renderWithoutThrow('multi-page passage carries trigger', {
    id: 'grp-8',
    title: 'paged.js notes — multi-page',
    groupType: 'reading',
    defaultScore: 2,
    passage: { title: 'paged.js notes — multi-page', materialText: longMaterial, summary: '' },
    questions: [makeQuestion()],
  })
  if (multiResult) {
    assert('multi-page scenario actually spans more than 1 page (exercise is non-trivial)', multiResult.pageCount > 1, `pageCount=${multiResult.pageCount}`)
  }

  // ─── 9. Multiple distinct inputs share the resident pool — confirms the
  // fix does not leave the renderer in a wedged state after a previously-
  // failing render. (Before the fix the throw happened after pagination
  // finished but before the page got closed by withChromiumPage's finally;
  // the pool itself survives that via the failure-swallowing queue chain,
  // but verify it explicitly to guard against regressions in pool reuse.) ───
  const reuseResult = await renderPaginatedPaper(buildHtml({
    id: 'grp-reuse',
    title: 'reuse check',
    groupType: 'reading',
    defaultScore: 2,
    passage: { title: 'reuse', materialText: 'A plain passage with no trigger substring.', summary: '' },
    questions: [makeQuestion()],
  }))
  assert('renderer still works on a subsequent (no-trigger) render after the trigger renders', Number.isInteger(reuseResult.pageCount) && reuseResult.pageCount > 0)

  // ─── 10. Regression guard: the stricter regex still THROWS on a REAL
  // mismatch and is NOT silently lenient — i.e. the fix did not weaken the
  // guard, only stopped false positives. We build a crafted string that
  // mirrors what Chromium's `outerHTML` serializer actually emits for a
  // text node that originally held `<div class="pagedjs_page">`: the
  // serializer escapes `<` and `>` to their HTML entities but leaves
  // `"` UNescaped inside text content (quotes are only escaped inside
  // attribute values). So the re-serialized text node still contains the
  // bare `class="pagedjs_page"` substring (permissive regex matches it) but
  // NOT a literal `<div ` prefix — the leading `<` is now an entity
  // sequence, not a raw angle bracket, so the strict regex correctly skips
  // it. The crafted string contains exactly ONE real page container plus
  // that inert text occurrence: strict must find 1, permissive must find 2.
  // The entities are built via `String.fromCharCode(38)` (the `&` char) so
  // the serialization is constructed exactly as Chromium applies it,
  // keeping the source unambiguous. ───
  const rawText = 'Note: paged.js wraps each printed sheet in a <div class="pagedjs_page"> container.'
  const AMP = String.fromCharCode(38)
  const serializedTextTrigger = rawText.replace(/</g, AMP + 'lt;').replace(/>/g, AMP + 'gt;')
  const crafted = `<div class="pagedjs_pages"><template data-ref="pagedjs-content">${serializedTextTrigger}</template><div class="pagedjs_page pagedjs_first_page pagedjs_right_page">page content</div></div>`
  const strictOnCrafted = (crafted.match(/<div class="[^"]*\bpagedjs_page\b[^"]*"/g) || []).length
  const permissiveOnCrafted = (crafted.match(/class="[^"]*\bpagedjs_page\b[^"]*"/g) || []).length
  assert('strict regex counts exactly 1 real page container when a text-content trigger is present (mirrors the fixed guard)', strictOnCrafted === 1, `got ${strictOnCrafted}`)
  assert('permissive regex over-counts to 2 on the same input (1 real + 1 inert text), proving the false positive is real', permissiveOnCrafted === 2, `got ${permissiveOnCrafted}`)
  assert('strict regex matches the real paged.js page container shape (class order independent)', /<div class="[^"]*\bpagedjs_page\b[^"]*"/.test('<div class="pagedjs_page pagedjs_first_page pagedjs_right_page">'))
  // The SINGULAR `\bpagedjs_page\b` must NOT match inside the PLURAL
  // `pagedjs_pages` (the per-page wrapper) or `pagedjs_pagebox` (the inner
  // box): after `pagedjs_page` comes `s`/`b` (word chars), so there is no
  // `\b` boundary there. This is the exclusion both regexes rely on. (Testing
  // `pagedjs_pages\b` would be wrong — that plural pattern DOES match the
  // wrapper, because `s` followed by the closing quote `"` is a boundary.)
  assert('singular \\bpagedjs_page\\b does not match the plural .pagedjs_pages wrapper', !/<div class="[^"]*\bpagedjs_page\b[^"]*"/.test('<div class="pagedjs_pages">'))
  assert('singular \\bpagedjs_page\\b does not match .pagedjs_pagebox', !/<div class="[^"]*\bpagedjs_page\b[^"]*"/.test('<div class="pagedjs_pagebox">'))

  // And the strict regex must still throw on a GENUINE page-count mismatch:
  // feed an HTML that has exactly one real page container plus a valid
  // question-group section (so applyPaginationDomContract's groupIds check
  // passes), but a WRONG pageCount. Its identical strict check must reject
  // it — proof the fix did not silently weaken the fail-loud invariant.
  const mismatchHtml = '<section class="question-group" data-ref="r1"><div class="pagedjs_page pagedjs_first_page">page content</div></section>'
  let strictMismatchedThrew = null
  try {
    applyPaginationDomContract(mismatchHtml, { groupIds: ['g'], pageCount: 5 })
  } catch (e) {
    strictMismatchedThrew = e instanceof Error ? e.message : String(e)
  }
  assert('strict check still throws on a genuine page-count mismatch (not silently lenient)', strictMismatchedThrew !== null && /pagedjs_page container\(s\)/.test(strictMismatchedThrew), `threw: ${strictMismatchedThrew}`)

  await closeChromiumPool()

  if (failed > 0) {
    console.error(`\nDraft-paper pagination renderer false-positive regression verify FAILED: ${passed} passed, ${failed} failed`)
    process.exit(1)
  }
  console.log(`\nDraft-paper pagination renderer false-positive regression verify passed: ${passed} passed, 0 failed`)
}

main().catch(async (error) => {
  console.error('Draft-paper pagination renderer false-positive regression verify CRASHED:', error)
  await closeChromiumPool().catch(() => {})
  process.exit(1)
})
