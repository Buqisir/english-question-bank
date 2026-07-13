#!/usr/bin/env node
// draft-desk-b step2 (MF-4, plan.md "步2 — DOM 契约 + 缓存解耦"): trigger-timing
// verify for the new pagination cache — "仅布局编辑(增删/reorder/toggle
// page_break)使签名变化触发重渲;非布局编辑(标题/studentLabel/列表这类)绝不触发".
// Behavioral, no browser (plan.md step2's own parenthetical: "行为断言,不用
// 浏览器") — the cache-hit/miss decision inside getDraftPaperPagination
// (draftPaperStore.mjs) is a single equality check
// `cached.signature === draftPaperPaginationSignature(draftPaper, versionType)`,
// so proving draftPaperPaginationSignature's field sensitivity IS proving the
// trigger timing; no Chromium render is needed to observe that decision.
//
// KNOWN, DISCLOSED CONFLICT (see draftPaperPaginationSignature's doc comment in
// draftPaperStore.mjs and this cut's completion report): `title` is excluded from
// this signature per plan.md step2's literal Must-Do text and Verify line
// ("改标题不触发 render"), even though title demonstrably feeds every page's
// footer via addDraftFooterCss — a title-only edit is confirmed to leave a STALE
// cache hit. This script asserts the SHIPPED behavior (title excluded), not a
// judgment that it is correct; it exists so a future change to this trade-off
// shows up as a diff here, not a silent regression either way.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { draftPaperPaginationSignature } from '../server/draft-paper/draftPaperStore.mjs'

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

console.log('Draft-paper pagination cache trigger-timing verify')

function baseDraftPaper() {
  return {
    id: 'draft-1',
    title: 'Original Title',
    studentLabel: '张三',
    items: [
      { id: 'item-1', groupId: 'group-a', orderIndex: 1, pageBreakBefore: false, updatedAt: '2026-01-01T00:00:00Z' },
      { id: 'item-2', groupId: 'group-b', orderIndex: 2, pageBreakBefore: false, updatedAt: '2026-01-01T00:00:00Z' },
    ],
  }
}

const base = baseDraftPaper()
const baseSig = draftPaperPaginationSignature(base, 'student')

// --- layout edits: MUST change the signature ---
{
  const reordered = baseDraftPaper()
  reordered.items[0].orderIndex = 2
  reordered.items[1].orderIndex = 1
  assert('reorder (orderIndex swap) changes the signature', draftPaperPaginationSignature(reordered, 'student') !== baseSig)
}
{
  const toggled = baseDraftPaper()
  toggled.items[1].pageBreakBefore = true
  assert('toggling pageBreakBefore changes the signature', draftPaperPaginationSignature(toggled, 'student') !== baseSig)
}
{
  const added = baseDraftPaper()
  added.items.push({ id: 'item-3', groupId: 'group-c', orderIndex: 3, pageBreakBefore: false, updatedAt: '2026-01-01T00:00:00Z' })
  assert('adding an item changes the signature', draftPaperPaginationSignature(added, 'student') !== baseSig)
}
{
  const removed = baseDraftPaper()
  removed.items.pop()
  assert('removing an item changes the signature', draftPaperPaginationSignature(removed, 'student') !== baseSig)
}
{
  const swappedGroup = baseDraftPaper()
  swappedGroup.items[0].groupId = 'group-z'
  assert('swapping a group id changes the signature', draftPaperPaginationSignature(swappedGroup, 'student') !== baseSig)
}
assert(
  'versionType change (student -> teacher) changes the signature',
  draftPaperPaginationSignature(base, 'teacher') !== draftPaperPaginationSignature(base, 'student'),
)

// --- non-layout edits: MUST NOT change the signature ---
{
  const relabeled = baseDraftPaper()
  relabeled.studentLabel = '李四'
  assert('changing studentLabel does NOT change the signature', draftPaperPaginationSignature(relabeled, 'student') === baseSig)
}
{
  const untouchedTimestamp = baseDraftPaper()
  untouchedTimestamp.items[0].updatedAt = '2099-01-01T00:00:00Z'
  assert(
    'an item updatedAt-only change (e.g. a bump from an unrelated write) does NOT change the signature',
    draftPaperPaginationSignature(untouchedTimestamp, 'student') === baseSig,
  )
}
{
  const retitled = baseDraftPaper()
  retitled.title = 'A Completely Different Title'
  assert(
    'changing title does NOT change the signature (shipped per plan.md step2 literal Must-Do/Verify text — ' +
      'see this script\'s header + the completion report for the disclosed parity conflict)',
    draftPaperPaginationSignature(retitled, 'student') === baseSig,
  )
}
{
  const untouched = baseDraftPaper()
  assert('an unchanged draft paper produces the identical signature (no false-positive drift)', draftPaperPaginationSignature(untouched, 'student') === baseSig)
}

// --- wiring backstop: getDraftPaperPagination must actually consult this exact
// function (not draftPaperPrintSignature, which stays reserved for
// exportDraftPaperPdf's separate 30s cache) for its cache-hit decision. Source
// assertion is a deliberate belt-and-suspenders supplement here, not the primary
// proof (draftPaperPaginationSignature's behavior above is) — see AGENTS.md
// "Verify convention".
{
  const storeSrc = readFileSync(path.join(rootDir, 'server/draft-paper/draftPaperStore.mjs'), 'utf8')
  const fnStart = storeSrc.indexOf('async function getDraftPaperPagination(')
  const fnEnd = storeSrc.indexOf('\n  return {', fnStart)
  assert('getDraftPaperPagination found in draftPaperStore.mjs', fnStart !== -1 && fnEnd > fnStart)
  const fnSrc = storeSrc.slice(fnStart, fnEnd)
  assert('getDraftPaperPagination computes its signature via draftPaperPaginationSignature', /const signature = draftPaperPaginationSignature\(/.test(fnSrc))
  assert('getDraftPaperPagination compares against a cached signature before re-rendering', /cached\.signature === signature/.test(fnSrc))
  assert('getDraftPaperPagination does NOT use draftPaperPrintSignature (that stays exportDraftPaperPdf-only)', !/draftPaperPrintSignature\(/.test(fnSrc))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.error('\nDraft-paper pagination cache trigger-timing verify FAILED')
  process.exit(1)
}
console.log('\nDraft-paper pagination cache trigger-timing verify passed')
