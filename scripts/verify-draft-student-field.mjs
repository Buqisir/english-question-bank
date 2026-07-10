#!/usr/bin/env node
// draft-student-field (E4, docs/cuts/draft-student-field/plan.md): verifies the
// plan's acceptance criterion 1 — "创建草稿卷带 student_label -> get/list 回读一致；
// 不带 -> null 且各面零展示；旧库（无列）启动迁移幂等" — and a source-level backstop
// for the hard boundary "该字段绝不渲染到卷面".
//
// The shared schema-evolution mechanism for the user database
// (server/api.mjs's ensureUserDatabaseShape) never adds draft_papers.student_label
// — this cut's Forbidden list (mounting boundary shared with a parallel cut
// touching server/api.mjs + server/search/**) rules out editing that file, so
// draftPaperStore.mjs carries its own idempotent, PRAGMA-guarded ALTER
// (ensureStudentLabelColumn). Every fresh OR pre-existing user-data.sqlite
// therefore starts without the column; this script proves the store adds it
// lazily, exactly once, without disturbing existing rows, and that repeated
// store calls against an already-migrated db never throw
// "duplicate column name".
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
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

console.log('draft-student-field verify: additive student_label column + round-trip + idempotent migration')

// --- source backstop: the print/export path must never read student_label ---
const storeSrc = readFileSync(path.join(rootDir, 'server/draft-paper/draftPaperStore.mjs'), 'utf8')
const exportInputStart = storeSrc.indexOf('function buildDraftPaperExportInput(')
const exportInputEnd = storeSrc.indexOf('\n  function addDraftFooterCss(', exportInputStart)
const blocksStart = storeSrc.indexOf('function buildDraftPaperBlocks(')
const blocksEnd = storeSrc.indexOf('\n  function buildDraftPaperExportInput(', blocksStart)
assert('buildDraftPaperExportInput found in draftPaperStore.mjs', exportInputStart !== -1 && exportInputEnd > exportInputStart)
assert('buildDraftPaperBlocks found in draftPaperStore.mjs', blocksStart !== -1 && blocksEnd > blocksStart)
assert(
  'buildDraftPaperExportInput never reads studentLabel/student_label (paper-face hard boundary)',
  !/student_?[Ll]abel/.test(storeSrc.slice(exportInputStart, exportInputEnd)),
)
assert(
  'buildDraftPaperBlocks never reads studentLabel/student_label (paper-face hard boundary)',
  !/student_?[Ll]abel/.test(storeSrc.slice(blocksStart, blocksEnd)),
)
const printRendererSrc = readFileSync(path.join(rootDir, 'server/print-renderer.mjs'), 'utf8')
assert(
  'print-renderer.mjs (untouched by this cut) has no studentLabel/student_label reference',
  !/student_?[Ll]abel/.test(printRendererSrc),
)
// CR SW: cover the actual print entry point too, not just its two helpers —
// a future edit injecting the name directly into buildDraftPrintHtml must trip CI.
const printHtmlStart = storeSrc.indexOf('function buildDraftPrintHtml(')
const printHtmlEnd = storeSrc.indexOf('\n  function ', printHtmlStart + 1)
assert(
  'buildDraftPrintHtml found in draftPaperStore.mjs',
  printHtmlStart !== -1 && printHtmlEnd > printHtmlStart,
)
assert(
  'buildDraftPrintHtml never reads studentLabel/student_label (paper-face hard boundary)',
  !/student_?[Ll]abel/.test(storeSrc.slice(printHtmlStart, printHtmlEnd)),
)

// --- behavioral: real ensureUserDatabaseShape user DB + real store ---
const { createDraftPaperStore } = await import(path.join(rootDir, 'server/draft-paper/draftPaperStore.mjs'))
const { ensureUserDatabaseShape } = await import(path.join(rootDir, 'server/api.mjs'))

const tempRoot = mkdtempSync(path.join(tmpdir(), 'eqb-verify-draft-student-field-'))
const userDbPath = path.join(tempRoot, 'user-data.sqlite')

try {
  // Fresh install shape, exactly as production boots it — proves student_label
  // is not baked into the shared migration (it would be present here otherwise).
  const bootstrapDb = new DatabaseSync(userDbPath)
  ensureUserDatabaseShape(bootstrapDb)
  const hasColumnBeforeStore = bootstrapDb
    .prepare('PRAGMA table_info(draft_papers)')
    .all()
    .some((row) => row.name === 'student_label')
  assert(
    'ensureUserDatabaseShape (the shared migration) does NOT add student_label — additive column is store-owned',
    hasColumnBeforeStore === false,
  )

  // Simulate a real pre-existing row from before this cut shipped (no
  // student_label column exists yet at all when this INSERT runs).
  const now = new Date().toISOString()
  bootstrapDb
    .prepare(
      `INSERT INTO draft_papers (id, user_id, title, subject, status, current_marker, created_at, updated_at)
       VALUES ('draft-legacy', 'local', 'Legacy Draft', 'english', 'active', 0, ?, ?)`,
    )
    .run(now, now)
  bootstrapDb.close()

  const openUserDatabase = ({ readOnly = false } = {}) => new DatabaseSync(userDbPath, { readOnly })
  const openDatabase = () => ({ close() {} })

  const store = createDraftPaperStore({
    exportDir: tempRoot,
    getPrintReadyByGroupId: () => new Map(),
    getQuestionGroupDetail: () => null,
    groupTypeLabels: {},
    isGroupPrintReady: () => ({ ok: false, reason: '题组不存在' }),
    openDatabase,
    openUserDatabase,
    paperAssetsDir: tempRoot,
    rootDir: tempRoot,
    selectQuestionGroupCards: () => [],
  })

  // Reading the legacy row (readOnly self-open path, exercising the guard's
  // readonly-connection fallback branch) must succeed and add the column
  // without corrupting the existing row.
  const legacyList = store.listDraftPapers('local')
  assert('listDraftPapers succeeds against a pre-existing column-less row', legacyList.length === 1, JSON.stringify(legacyList))
  assert('legacy row studentLabel reads as null (no column existed at insert time)', legacyList[0]?.studentLabel === null, JSON.stringify(legacyList[0]))
  assert('legacy row title is untouched by the migration', legacyList[0]?.title === 'Legacy Draft', JSON.stringify(legacyList[0]))

  const afterMigrationDb = new DatabaseSync(userDbPath, { readOnly: true })
  const hasColumnAfterStore = afterMigrationDb
    .prepare('PRAGMA table_info(draft_papers)')
    .all()
    .some((row) => row.name === 'student_label')
  afterMigrationDb.close()
  assert('draft_papers.student_label column exists after the first store read (lazy ALTER fired)', hasColumnAfterStore === true)

  // Idempotency: repeated store calls (create/get/update/list) against an
  // already-migrated db must never throw "duplicate column name". Creation
  // never takes a student_label param in production (matching the workbench:
  // the "学生" field is set via updateDraftPaper after the draft exists,
  // exactly like the title field's own auto-save) — so exercise that same
  // create-then-update path here via the real public API.
  const withoutLabel = store.getOrCreateCurrentDraftPaper('local-b', { createIfMissing: true })
  assert('create without student_label -> studentLabel is null', withoutLabel.studentLabel === null, JSON.stringify(withoutLabel))

  const created = store.getOrCreateCurrentDraftPaper('local-c', { createIfMissing: true })
  const withLabel = store.updateDraftPaper('local-c', created.id, { studentLabel: '张三' })
  assert('update sets student_label on a freshly-created draft', withLabel.studentLabel === '张三', JSON.stringify(withLabel))

  const reGet = store.getDraftPaper({ userDb: openUserDatabase(), bankDb: openDatabase() }, 'local-c', withLabel.id, { includePrintHtml: false })
  assert('get round-trips the same student_label the update call set', reGet?.studentLabel === '张三', JSON.stringify(reGet))

  const updated = store.updateDraftPaper('local-c', withLabel.id, { studentLabel: '李四' })
  assert('update round-trips a changed student_label', updated.studentLabel === '李四', JSON.stringify(updated))

  const clearedByWhitespace = store.updateDraftPaper('local-c', withLabel.id, { studentLabel: '   ' })
  assert('update with whitespace-only student_label normalizes to null (no stray chip)', clearedByWhitespace.studentLabel === null, JSON.stringify(clearedByWhitespace))

  const finalListLocal = store.listDraftPapers('local')
  assert('list includes the legacy draft', finalListLocal.length === 1, JSON.stringify(finalListLocal.map((d) => d.id)))
  assert('list round-trips the legacy row as null', finalListLocal[0]?.studentLabel === null)

  const finalListLocalB = store.listDraftPapers('local-b')
  assert('list round-trips the no-label create as null', finalListLocalB[0]?.studentLabel === null, JSON.stringify(finalListLocalB))

  const finalListLocalC = store.listDraftPapers('local-c')
  assert('list round-trips the cleared-by-whitespace draft as null', finalListLocalC[0]?.studentLabel === null, JSON.stringify(finalListLocalC))

  // Re-running ensureUserDatabaseShape (the shared migration, unaffected by
  // this cut) against the now-migrated db must stay a no-op for this column.
  const reopenedForShape = new DatabaseSync(userDbPath)
  ensureUserDatabaseShape(reopenedForShape)
  reopenedForShape.close()
  const finalListAfterSharedMigrationRerun = store.listDraftPapers('local-c')
  assert(
    'listDraftPapers still succeeds after re-running the shared ensureUserDatabaseShape migration (idempotent, no duplicate-column crash)',
    finalListAfterSharedMigrationRerun.length === 1,
  )
} finally {
  rmSync(tempRoot, { recursive: true, force: true })
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
