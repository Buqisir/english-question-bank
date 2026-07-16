// [DEBUG-pgnd] diagnosis loop: is renderPaginatedPaper deterministic for a
// fixed HTML string? Renders the real qa-local-owner A3 draft N times in one
// process (run 1 = cold Chromium, rest warm) and diffs pageCount + content.
import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

const rootDir = new URL('../../../..', import.meta.url).pathname.replace(/\/$/, '')
const api = await import(path.join(rootDir, 'server/api.mjs'))
const { createDraftPaperStore } = await import(path.join(rootDir, 'server/draft-paper/draftPaperStore.mjs'))
const { renderPaginatedPaper } = await import(path.join(rootDir, 'server/draft-paper/paginationRenderer.mjs'))
const { closeChromiumPool } = await import(path.join(rootDir, 'server/draft-paper/chromiumPool.mjs'))

const DRAFT_ID = 'draft-paper-493d950b-b19e-4119-ae65-342d61ebdbe7'
const USER_ID = 'user-acda3df3-ad7f-4ee2-be22-dc6732889704'
const N = Number(process.env.N || 8)

const groupTypeLabels = {
  reading: '阅读理解', cloze: '完形填空', seven_choices: '七选五',
  grammar_cloze: '语法填空', writing: '写作', continuation: '读后续写',
  listening: '听力', other: '其他',
}

const store = createDraftPaperStore({
  getPrintReadyByGroupId: api.getPrintReadyByGroupId,
  getQuestionGroupDetail: api.getQuestionGroupDetail,
  groupTypeLabels,
  isGroupPrintReady: api.isGroupPrintReady,
  openDatabase: ({ readOnly = true } = {}) =>
    new DatabaseSync(path.join(rootDir, 'data/question-bank.sqlite'), { readOnly }),
  openUserDatabase: api.openUserDatabase,
  paperAssetsDir: path.join(rootDir, 'app/public/paper-assets'),
  selectQuestionGroupCards: (db, whereClause = '', params = []) => {
    const rows = db.prepare(`SELECT id, group_type, title FROM question_groups ${whereClause}`).all(...params)
    return rows.map((r) => ({
      id: r.id,
      groupType: r.group_type,
      title: r.title || '',
      questionCount: Number(db.prepare('SELECT COUNT(*) c FROM questions WHERE group_id = ?').get(r.id).c),
    }))
  },
})

const userDb = api.openUserDatabase({ readOnly: false })
const bankDb = new DatabaseSync(path.join(rootDir, 'data/question-bank.sqlite'), { readOnly: true })
const draftPaper = store.getDraftPaper({ userDb, bankDb }, USER_ID, DRAFT_ID, { includePrintHtml: false })
if (!draftPaper) throw new Error('draft not found')
console.log(`[DEBUG-pgnd] draft "${draftPaper.title}" printForm=${draftPaper.printForm} items=${draftPaper.items.length}`)

const html = store.buildDraftPrintHtml(draftPaper, { versionType: 'student' })
userDb.close(); bankDb.close()
if (!html) throw new Error('empty html')
const htmlHash = createHash('md5').update(html).digest('hex').slice(0, 10)
console.log(`[DEBUG-pgnd] input html bytes=${html.length} md5=${htmlHash} (fixed string reused for every render)`)

const { applyPaginationDomContract } = await import(path.join(rootDir, 'server/draft-paper/paginationDomContract.mjs'))
const { derivePageBreakSuggestions } = await import(path.join(rootDir, 'server/draft-paper/draftPaperStore.mjs'))
const groupIds = draftPaper.items.filter((it) => !it.groupMissing).map((it) => it.groupId)
const itemsByGroupId = new Map(draftPaper.items.filter((it) => !it.groupMissing).map((it) => [it.groupId, it.id]))

function breakSignal(rawPaginatedHtml) {
  const pages = (rawPaginatedHtml.match(/class="[^"]*\bpagedjs_page\b[^"]*"/g) || []).length
  const contracted = applyPaginationDomContract(rawPaginatedHtml, { groupIds, pageCount: pages })
  const suggestions = derivePageBreakSuggestions(contracted, { itemsByGroupId, printForm: draftPaper.printForm })
  // normalize paged.js's per-run random UUIDs out before hashing — data-ref
  // plus the data-split-to/from attrs that reference the same UUID namespace
  const normalized = rawPaginatedHtml.replace(/data-(ref|split-to|split-from)="[0-9a-f-]+"/g, 'data-$1=""')
  const md5 = createHash('md5').update(normalized).digest('hex').slice(0, 10)
  return { md5, breaks: JSON.stringify(suggestions) }
}

const runs = []
for (let i = 1; i <= N; i++) {
  const t0 = Date.now()
  const { paginatedHtml, pageCount } = await renderPaginatedPaper(html)
  const sig = breakSignal(paginatedHtml)
  runs.push({ i, pageCount, ...sig, ms: Date.now() - t0 })
  console.log(`[DEBUG-pgnd] run ${i}: pageCount=${pageCount} normMd5=${sig.md5} breaks=${sig.breaks} ${Date.now() - t0}ms`)
  if (i === 1 || sig.md5 !== runs[0].md5) {
    writeFileSync(`/tmp/pgnd-run-${i}.html`, paginatedHtml)
  }
}
await closeChromiumPool()

const counts = new Set(runs.map((r) => r.pageCount))
const hashes = new Set(runs.map((r) => r.md5))
const breakSets = new Set(runs.map((r) => r.breaks))
console.log(`\n[DEBUG-pgnd] verdict: pageCounts=${[...counts].join(',')} distinctNormHtml=${hashes.size}/${runs.length} distinctBreakSets=${breakSets.size}/${runs.length}`)
process.exit(counts.size === 1 && hashes.size === 1 && breakSets.size === 1 ? 0 : 3)
