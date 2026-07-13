#!/usr/bin/env node
// print-form (docs/cuts/print-form/plan.md, draft-desk 队列刀C): verifies
// the plan's Must Do 1/2/6 acceptance shape —
//   ① `draft_papers.print_form` lazy ALTER is additive + idempotent (same
//     pattern as verify-draft-student-field.mjs's student_label coverage);
//   ② the a4/a3 断篇 judgment function (evaluatePageBreakAcrossPages) is a
//     pure table: a4 breaks on every page boundary, a3 breaks only on an
//     even first-page (跨版翻面/换张 wording differs by mod-4 position),
//     odd never breaks;
//   ③ derivePageBreakSuggestions correctly turns a contract-shaped HTML
//     fixture (cross-page + non-cross-page groups mixed) into the right
//     suggestion set for both print forms, and a fixture with zero
//     cross-page groups yields zero suggestions;
//   ④ print_form is NOT part of draftPaperPaginationSignature (source
//     assertion — a print-form toggle alone must never invalidate the
//     pagination render cache, plan.md 裁点2);
//   ⑤ a freshly created draft inherits the creating user's most-recently-
//     updated draft's print_form ("记住上次", 裁点3), defaulting to 'a4'
//     for a user with no prior draft.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

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

console.log('print-form verify: A4/A3 print form + real pagination-derived suggestions')

const {
  createDraftPaperStore,
  draftPaperPaginationSignature,
  evaluatePageBreakAcrossPages,
  derivePageBreakSuggestions,
} = await import(path.join(rootDir, 'server/draft-paper/draftPaperStore.mjs'))
const { ensureUserDatabaseShape } = await import(path.join(rootDir, 'server/api.mjs'))

// --- ② pure judgment table ---
assert('a4 breaks on an odd first-page boundary (1/2)', evaluatePageBreakAcrossPages(1, 'a4').broken === true)
assert('a4 breaks on an even first-page boundary (2/3)', evaluatePageBreakAcrossPages(2, 'a4').broken === true)
assert('a4 reason wording uses 页, not 版', evaluatePageBreakAcrossPages(2, 'a4').reason === '跨页断篇（第2/3页）')
assert('a3 does NOT break on an odd first-page boundary (1/2, same face)', evaluatePageBreakAcrossPages(1, 'a3').broken === false)
assert('a3 does NOT break on an odd first-page boundary (3/4, same face)', evaluatePageBreakAcrossPages(3, 'a3').broken === false)
assert('a3 breaks on firstPage%4===2 (2/3, 翻面)', evaluatePageBreakAcrossPages(2, 'a3').broken === true)
assert('a3 翻面 reason wording', evaluatePageBreakAcrossPages(2, 'a3').reason === '跨页断篇（第2/3版，翻面）')
assert('a3 breaks on firstPage%4===0 (4/5, 换张)', evaluatePageBreakAcrossPages(4, 'a3').broken === true)
assert('a3 换张 reason wording', evaluatePageBreakAcrossPages(4, 'a3').reason === '跨页断篇（第4/5版，换张）')
assert('a3 tier never flips between adjacent boundaries (6/7 翻面, 8/9 换张)', evaluatePageBreakAcrossPages(6, 'a3').reason.includes('翻面') && evaluatePageBreakAcrossPages(8, 'a3').reason.includes('换张'))

// --- ③ derivePageBreakSuggestions against a contract-shaped fixture ---
// Fixture shape mirrors paginationDomContract.mjs's frozen output: every page
// container carries `preview-page` (alongside real paged.js classes), every
// question-group section carries `data-group-id`. A hidden <template> master
// copy (same doc comment as paginationDomContract.mjs) repeats one
// data-group-id to prove it is excluded from span derivation.
//
// Spans: g-odd [1,2] (same-face in a3, real break in a4);
//        g-first [1] (single page, no suggestion in either form);
//        g-cross [2,3] (真断 in both forms — 翻面 in a3);
//        g-solo [4] (single page, no suggestion).
const fixtureHtml = `<!doctype html><html><body>
<template data-ref="pagedjs-content"><section class="question-group" data-group-id="g-solo"><p>master copy, must be excluded</p></section></template>
<div class="pagedjs_page preview-page"><section class="question-group" data-group-id="g-odd"><p>p1 start</p></section><section class="question-group" data-group-id="g-first"><p>whole</p></section></div>
<div class="pagedjs_page preview-page"><section class="question-group" data-group-id="g-odd"><p>p2 continued</p></section><section class="question-group" data-group-id="g-cross"><p>p2 start</p></section></div>
<div class="pagedjs_page preview-page"><section class="question-group" data-group-id="g-cross"><p>p3 continued</p></section></div>
<div class="pagedjs_page preview-page"><section class="question-group" data-group-id="g-solo"><p>whole</p></section></div>
</body></html>`

const itemsByGroupId = new Map([
  ['g-odd', 'item-odd'],
  ['g-first', 'item-first'],
  ['g-cross', 'item-cross'],
  ['g-solo', 'item-solo'],
])

const a4Suggestions = derivePageBreakSuggestions(fixtureHtml, { itemsByGroupId, printForm: 'a4' })
assert('a4: two cross-page groups both get a suggestion', a4Suggestions.length === 2, JSON.stringify(a4Suggestions))
assert('a4: g-odd suggestion present with correct itemId/reason', a4Suggestions.some((s) => s.itemId === 'item-odd' && s.groupId === 'g-odd' && s.reason === '跨页断篇（第1/2页）'), JSON.stringify(a4Suggestions))
assert('a4: g-cross suggestion present', a4Suggestions.some((s) => s.itemId === 'item-cross' && s.groupId === 'g-cross' && s.reason === '跨页断篇（第2/3页）'), JSON.stringify(a4Suggestions))
assert('a4: single-page groups get zero suggestions (no false positives)', !a4Suggestions.some((s) => s.groupId === 'g-first' || s.groupId === 'g-solo'))
assert('a4: template master copy never leaks a phantom suggestion for g-solo', !a4Suggestions.some((s) => s.groupId === 'g-solo'))

const a3Suggestions = derivePageBreakSuggestions(fixtureHtml, { itemsByGroupId, printForm: 'a3' })
assert('a3: only the real (even-boundary) cross-page group gets a suggestion', a3Suggestions.length === 1, JSON.stringify(a3Suggestions))
assert('a3: g-odd (odd boundary, same face) produces NO suggestion', !a3Suggestions.some((s) => s.groupId === 'g-odd'), JSON.stringify(a3Suggestions))
assert('a3: g-cross (even boundary, 翻面) produces a suggestion', a3Suggestions.some((s) => s.itemId === 'item-cross' && s.reason === '跨页断篇（第2/3版，翻面）'), JSON.stringify(a3Suggestions))

const noBreakFixture = `<!doctype html><html><body>
<div class="pagedjs_page preview-page"><section class="question-group" data-group-id="g-only"><p>whole</p></section></div>
</body></html>`
const noBreakSuggestions = derivePageBreakSuggestions(noBreakFixture, { itemsByGroupId: new Map([['g-only', 'item-only']]), printForm: 'a4' })
assert('a fixture with no cross-page groups yields zero suggestions', noBreakSuggestions.length === 0, JSON.stringify(noBreakSuggestions))

// --- ④ print_form excluded from the pagination render signature ---
const signatureSrc = draftPaperPaginationSignature.toString()
assert('draftPaperPaginationSignature source has no printForm/print_form reference (裁点2: 不进签名)', !/print[Ff]orm/.test(signatureSrc))
const baseline = draftPaperPaginationSignature({ id: 'd1', title: 't', items: [] }, 'student')
const withPrintFormField = draftPaperPaginationSignature({ id: 'd1', title: 't', items: [], printForm: 'a3' }, 'student')
assert('adding a printForm field to the draftPaper object does not change the computed signature', baseline === withPrintFormField)

// --- ①⑤ behavioral: real ensureUserDatabaseShape user DB + real store ---
const tempRoot = mkdtempSync(path.join(tmpdir(), 'eqb-verify-print-form-'))
const userDbPath = path.join(tempRoot, 'user-data.sqlite')

try {
  const bootstrapDb = new DatabaseSync(userDbPath)
  ensureUserDatabaseShape(bootstrapDb)
  const hasColumnBefore = bootstrapDb.prepare('PRAGMA table_info(draft_papers)').all().some((row) => row.name === 'print_form')
  assert('ensureUserDatabaseShape (shared migration) does NOT add print_form — additive column is store-owned', hasColumnBefore === false)

  // Legacy pre-cut row: no print_form column exists yet at insert time.
  const now = new Date().toISOString()
  bootstrapDb.prepare(
    `INSERT INTO draft_papers (id, user_id, title, subject, status, current_marker, created_at, updated_at)
     VALUES ('draft-legacy', 'local', 'Legacy Draft', 'english', 'active', 0, ?, ?)`,
  ).run(now, now)
  bootstrapDb.close()

  const openUserDatabase = ({ readOnly = false } = {}) => new DatabaseSync(userDbPath, { readOnly })
  const openDatabase = () => ({ close() {} })

  const store = createDraftPaperStore({
    getPrintReadyByGroupId: () => new Map(),
    getQuestionGroupDetail: () => null,
    groupTypeLabels: {},
    isGroupPrintReady: () => ({ ok: false, reason: '题组不存在' }),
    openDatabase,
    openUserDatabase,
    paperAssetsDir: tempRoot,
    selectQuestionGroupCards: () => [],
  })

  const legacyList = store.listDraftPapers('local')
  assert('legacy row (readOnly self-open path, no column at insert time) reads printForm as a4', legacyList[0]?.printForm === 'a4', JSON.stringify(legacyList[0]))

  const afterStoreDb = new DatabaseSync(userDbPath, { readOnly: true })
  const hasColumnAfter = afterStoreDb.prepare('PRAGMA table_info(draft_papers)').all().some((row) => row.name === 'print_form')
  afterStoreDb.close()
  assert('draft_papers.print_form column exists after the first store read (lazy ALTER fired)', hasColumnAfter === true)

  // 记住上次 (裁点3): a user with no prior draft gets 'a4'.
  const firstDraft = store.getOrCreateCurrentDraftPaper('user-a', { createIfMissing: true })
  assert('first-ever draft for a user defaults to a4', firstDraft.printForm === 'a4', JSON.stringify(firstDraft))

  // Switch it to a3, then create a brand-new draft for the same user — the
  // new draft must inherit a3 (newest-updated draft's print_form), not reset
  // to a4.
  const switched = store.updateDraftPaper('user-a', firstDraft.id, { printForm: 'a3' })
  assert('PATCH sets printForm to a3', switched.printForm === 'a3', JSON.stringify(switched))
  const reGet = store.getDraftPaper({ userDb: openUserDatabase(), bankDb: openDatabase() }, 'user-a', switched.id, { includePrintHtml: false })
  assert('GET round-trips the printForm the PATCH set', reGet?.printForm === 'a3', JSON.stringify(reGet))

  // createDraftPaper (private, closed over inside the store) only ever runs
  // via a public entry point's "no current draft" branch — e.g.
  // migrateAssemblyBasketToDraftPaper below. Simulating "no current draft" by
  // clearing current_marker directly (status stays 'active', so
  // mostRecentPrintForm's scan — which does not filter on current_marker —
  // still sees this row) is the narrowest way to reach that branch without
  // reaching into the store's closed-over internals; how a real user's
  // previous draft loses current_marker (an archive action) is out of this
  // cut's scope — only the inheritance query itself is under test here.
  const directDb = openUserDatabase({ readOnly: false })
  directDb.prepare('UPDATE draft_papers SET current_marker = 0 WHERE id = ?').run(firstDraft.id)
  directDb.close()
  const migrated = store.migrateAssemblyBasketToDraftPaper('user-a', { groupIds: [] })
  assert('a fresh draft created for a user with a prior (now non-current) a3 draft inherits a3 (记住上次)', migrated.draftPaper.id !== firstDraft.id && migrated.draftPaper.printForm === 'a3', JSON.stringify(migrated.draftPaper))

  // Invalid PATCH value fails loud rather than silently coercing.
  let threw = false
  try {
    store.updateDraftPaper('user-a', firstDraft.id, { printForm: 'a5' })
  } catch {
    threw = true
  }
  assert('PATCH with an invalid printForm value throws (fail loud, no silent coercion)', threw === true)

  // Idempotency: re-running the shared migration after the store's own ALTER
  // must never throw "duplicate column name".
  const reopened = new DatabaseSync(userDbPath)
  ensureUserDatabaseShape(reopened)
  reopened.close()
  const finalList = store.listDraftPapers('user-a')
  assert('listDraftPapers still succeeds after re-running the shared migration (idempotent)', finalList.length === 2, JSON.stringify(finalList.map((d) => d.id)))
} finally {
  rmSync(tempRoot, { recursive: true, force: true })
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
