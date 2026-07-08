#!/usr/bin/env node
// add-to-draft-feel (docs/cuts/add-to-draft-feel/plan.md): owner reported a 1-2s
// delay between clicking "加入草稿卷" and the button reflecting it. Two causes,
// two fixes, both pinned down here:
//
//   1. Client: App.tsx's addGroupsToBasket() used to `await refreshQuestionGroups()`
//      (a full /api/question-groups refetch, ~504KB) before the button state ever
//      changed. Fixed to patch draftPaperButtonState/currentDraftPaperId
//      optimistically first, and run refreshQuestionGroups as an unawaited
//      background reconciliation.
//   2. Server: draftPaperStore.mjs's getDraftPaperItems() called
//      selectQuestionGroupCards(...WHERE id = ?...) + isGroupPrintReady(...) once
//      PER draft item — each call re-scans the whole paper-asset directory from
//      scratch, so an N-item draft did 2N full scans. Fixed to one batched
//      selectQuestionGroupCards(...WHERE id IN (...)...) + one
//      getPrintReadyByGroupId(...) call for the whole draft.
//
// This verify proves both fixes behaviorally (not just by source regex):
//   A. source: addGroupsToBasket no longer contains a blocking
//      `await refreshQuestionGroups()` call, and does call it unawaited.
//   B. behavioral: building a real draft with 5 items and calling the real
//      store.getDraftPaper() invokes the injected selectQuestionGroupCards /
//      getPrintReadyByGroupId mocks exactly ONCE each (not once per item), and
//      returns the same per-item printReady/questionGroup shape as before.
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
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

console.log('add-to-draft-feel verify: client optimistic feedback + server batch print-ready')

// --- A. source assertion: addGroupsToBasket no longer blocks on refreshQuestionGroups ---
const appSrc = readFileSync(path.join(rootDir, 'app/src/App.tsx'), 'utf8')
const fnStart = appSrc.indexOf('async function addGroupsToBasket(')
const fnEnd = appSrc.indexOf('\n  function addToBasket(', fnStart)
assert('addGroupsToBasket found in App.tsx', fnStart !== -1 && fnEnd !== -1 && fnEnd > fnStart)
const fnBody = appSrc.slice(fnStart, fnEnd)
assert(
  'addGroupsToBasket no longer awaits refreshQuestionGroups (blocking fetch removed)',
  !/await refreshQuestionGroups\(/.test(fnBody),
  fnBody,
)
assert(
  'addGroupsToBasket fires refreshQuestionGroups unawaited (background reconciliation)',
  /void refreshQuestionGroups\(/.test(fnBody),
)
assert(
  'addGroupsToBasket patches draftPaperButtonState optimistically before the add request resolves',
  /patchDraftButtonState\(/.test(fnBody) && fnBody.indexOf('patchDraftButtonState(') < fnBody.indexOf('await Promise.all('),
)

// --- B. behavioral: getDraftPaper -> getDraftPaperItems batches print-ready lookups ---
const { createDraftPaperStore } = await import(path.join(rootDir, 'server/draft-paper/draftPaperStore.mjs'))

const tempRoot = mkdtempSync(path.join(tmpdir(), 'eqb-verify-add-to-draft-feel-'))
try {
  const { ensureUserDatabaseShape } = await import(path.join(rootDir, 'server/api.mjs'))
  const userDbPath = path.join(tempRoot, 'user-data.sqlite')
  const userDb = new DatabaseSync(userDbPath)
  ensureUserDatabaseShape(userDb)

  const draftPaperId = 'draft-1'
  const userId = 'local'
  const now = new Date().toISOString()
  userDb
    .prepare(
      `INSERT INTO draft_papers (id, user_id, title, subject, status, current_marker, created_at, updated_at)
       VALUES (?, ?, 'Test Draft', 'english', 'active', 1, ?, ?)`,
    )
    .run(draftPaperId, userId, now, now)

  const groupIds = ['group-1', 'group-2', 'group-3', 'group-4', 'group-5']
  const insertItem = userDb.prepare(
    `INSERT INTO draft_paper_items (id, draft_paper_id, group_id, source_paper_id, order_index, page_break_before, created_at, updated_at)
     VALUES (?, ?, ?, '', ?, 0, ?, ?)`,
  )
  groupIds.forEach((groupId, index) => {
    insertItem.run(`item-${index + 1}`, draftPaperId, groupId, index + 1, now, now)
  })

  let selectQuestionGroupCardsCalls = 0
  let getPrintReadyByGroupIdCalls = 0
  const cardsByGroupId = new Map(
    groupIds.map((groupId) => [
      groupId,
      { id: groupId, groupType: 'reading', questionCount: 4, title: `Group ${groupId}` },
    ]),
  )
  const printReadyByGroupId = new Map(groupIds.map((groupId) => [groupId, { ok: true, reason: null }]))

  const store = createDraftPaperStore({
    exportDir: tempRoot,
    getPrintReadyByGroupId: (_db, ids) => {
      getPrintReadyByGroupIdCalls += 1
      const result = new Map()
      for (const id of ids) result.set(id, printReadyByGroupId.get(id) || { ok: false, reason: '题组不存在' })
      return result
    },
    getQuestionGroupDetail: () => null,
    groupTypeLabels: { reading: '阅读' },
    isGroupPrintReady: () => {
      throw new Error('isGroupPrintReady must not be called on the batched getDraftPaperItems path when getPrintReadyByGroupId is injected')
    },
    openDatabase: () => {
      throw new Error('openDatabase should not be called — bankDb is passed explicitly in this fixture')
    },
    openUserDatabase: () => userDb,
    paperAssetsDir: tempRoot,
    rootDir: tempRoot,
    selectQuestionGroupCards: (_db, whereClause, params) => {
      selectQuestionGroupCardsCalls += 1
      assert('selectQuestionGroupCards called with a WHERE id IN (...) batch clause', /WHERE id IN \(/.test(whereClause), whereClause)
      assert('selectQuestionGroupCards batch call receives all 5 group ids', params.length === groupIds.length, JSON.stringify(params))
      return params.map((id) => cardsByGroupId.get(id)).filter(Boolean)
    },
  })

  const dummyBankDb = {}
  const draftPaper = store.getDraftPaper({ userDb, bankDb: dummyBankDb }, userId, draftPaperId, { includePrintHtml: false })

  assert('getDraftPaper returned a draft paper', Boolean(draftPaper), JSON.stringify(draftPaper))
  assert('getDraftPaper returned all 5 items', draftPaper?.items?.length === 5, JSON.stringify(draftPaper?.items?.length))
  assert(
    'every item resolved its questionGroup from the batch card fetch',
    draftPaper.items.every((item) => item.questionGroup && item.questionGroup.id === item.groupId),
  )
  assert(
    'every item resolved printReady: true from the batch print-ready map',
    draftPaper.items.every((item) => item.printReady === true && item.printUnavailableReason === null),
  )
  assert(
    'selectQuestionGroupCards called exactly ONCE for a 5-item draft (was once per item)',
    selectQuestionGroupCardsCalls === 1,
    `called ${selectQuestionGroupCardsCalls} times`,
  )
  assert(
    'getPrintReadyByGroupId called exactly ONCE for a 5-item draft (was once per item via isGroupPrintReady)',
    getPrintReadyByGroupIdCalls === 1,
    `called ${getPrintReadyByGroupIdCalls} times`,
  )

  userDb.close()
} finally {
  rmSync(tempRoot, { recursive: true, force: true })
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
