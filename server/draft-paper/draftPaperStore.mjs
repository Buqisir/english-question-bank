import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { buildPrintHtml } from '../print-renderer.mjs'
import { loadGroupAnalysisTexts } from './analysisText.mjs'
import { renderPaginatedPaper } from './paginationRenderer.mjs'
import { applyPaginationDomContract } from './paginationDomContract.mjs'

// draft-desk-b step2 (SW-A, cr-step1-lite.md — "步2/4 必验"): confirmed empirically
// (this cut's dev probe against a real figure-bearing paper-asset group, not checked
// in) that renderPaginatedPaper's page.setContent() loads printHtml against an inert
// `about:blank` document — a root-relative <img src="/paper-assets/..."> (the
// imageMode:'web' default every OTHER buildDraftPrintHtml caller uses) never even
// generates a network request under that base (zero Playwright 'request' events
// fire; the <img> reports naturalWidth/naturalHeight 0 despite `complete: true`) —
// there is nothing for a path-absolute reference to resolve against. The existing
// Vivliostyle export line below (exportDraftPaperPdf) sidesteps the identical
// problem with imageMode:'file' (bare relative filename src) PLUS copying the real
// PNG into the SAME directory as a temp HTML FILE it then feeds to Vivliostyle via a
// real file:// load — that trick only works for an on-disk HTML file, not an
// in-memory string handed to page.setContent(). inlineFigureImages takes the SAME
// imageMode:'file' output (bare filename src + collected
// {relativeName, absoluteSourcePath} entries) and inlines each image as a base64
// data: URI directly into the HTML string instead — data: URIs resolve under ANY
// base (including about:blank), so the resulting HTML is fully self-contained and
// safe to hand to page.setContent() with no dependency on a live static file route
// or a temp directory on disk.
const FIGURE_IMAGE_MIME_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
}

function inlineFigureImages(html, images) {
  let result = html
  for (const image of images) {
    const ext = path.extname(image.relativeName).toLowerCase()
    const mime = FIGURE_IMAGE_MIME_TYPES[ext] || 'application/octet-stream'
    const dataUri = `data:${mime};base64,${readFileSync(image.absoluteSourcePath).toString('base64')}`
    // `images` entries come from figureImageSrc's sequential `fig-${n}${ext}` naming
    // (print-renderer.mjs) — unique per buildDraftPrintHtml call, so a plain
    // split/join (not a regex) is safe and avoids escaping the filename as a pattern.
    result = result.split(`src="${image.relativeName}"`).join(`src="${dataUri}"`)
  }
  return result
}

// draft-desk-b step2 (MF-4, plan.md "步2 — DOM 契约 + 缓存解耦"): a DECOUPLED
// signature for the new paged.js pagination cache (getDraftPaperPagination below) —
// deliberately NOT the same function as draftPaperPrintSignature further down,
// which stays exactly as-is for exportDraftPaperPdf's existing 30s Vivliostyle-line
// cache (step4/SW-5 migrates that caller, untouched here).
//
// Fields included are exactly the ones plan.md step2 calls "布局编辑": item
// identity/order/page-break-before. `title` is DELIBERATELY EXCLUDED — plan.md's
// step2 Must-Do text and its own Verify line ("改标题不触发 render") both say a
// title edit must not invalidate this cache.
//
// KNOWN CONFLICT — flagged, not resolved here (plan.md step2 explicitly reserves
// this as a decision point, "停下来...不要自作主张选一边"): draftPaperStore.mjs's
// addDraftFooterCss() unconditionally bakes `title` into the CSS `@page
// @bottom-center` footer text of EVERY page (confirmed: DP-1 acceptance check (b)
// already required this exact footer to render correctly). That means excluding
// `title` here is a REAL, confirmed parity gap, not a hypothetical one: after a
// title-only edit, a cache hit will keep serving pagination/PDF output with the OLD
// footer text until the next LAYOUT edit invalidates it — teacher sees new title in
// the title field, but the printed/paginated footer still says the old one. See this
// cut's completion report for the two-option writeup + recommendation; this is
// shipped per the literal plan.md acceptance text, not because it is judged correct.
export function draftPaperPaginationSignature(draftPaper, versionType) {
  return JSON.stringify({
    id: draftPaper.id,
    versionType,
    items: draftPaper.items.map((item) => ({
      id: item.id,
      groupId: item.groupId,
      orderIndex: item.orderIndex,
      pageBreakBefore: item.pageBreakBefore,
    })),
  })
}

// M0-1 user-data split: draft_papers / draft_paper_items now live in the user database
// (userDb), while question groups / print-readiness live in the shared bank database
// (bankDb). Methods that touch both sides receive `{ userDb, bankDb }` from their caller
// (route layer for db-param methods; self-opened for the self-open methods below) — see
// docs/cuts/m0-1-user-db-split/plan.md "store 连接改造清单" for the per-method contract.
// No SQL statement may cross sides; cross-side assembly always happens in application code.
//
// M0-4 user data isolation (docs/cuts/m0-4-user-scope/plan.md decision 3): every method
// that touches draft_papers (directly, or draft_paper_items via the parent draft) now takes
// a required `userId` parameter — no default value, so a caller that forgets to pass it
// throws instead of silently falling back to LOCAL_USER_ID. draft_paper_items itself is NOT
// given a user_id column (ADR-0014 decision 3): any operation entering through a
// draftPaperId must first hit draft_papers on `(id, user_id)` — an unmatched row is treated
// exactly like "draft not found" (404 upstream), never a separate 403.
function requireUserId(userId) {
  if (typeof userId !== 'string' || !userId) {
    throw new Error('draftPaperStore: userId is required')
  }
  return userId
}

// Perf cut (docs/cuts/add-to-draft-feel/plan.md): getPrintReadyByGroupId is
// the batch counterpart of isGroupPrintReady used by getDraftPaperItems below
// so a draft with N items does one paper-asset scan instead of N. Optional —
// callers/tests that never exercise getDraftPaperItems may omit it.
export function createDraftPaperStore({
  exportDir,
  getPrintReadyByGroupId,
  getQuestionGroupDetail,
  groupTypeLabels,
  isGroupPrintReady,
  openDatabase,
  openUserDatabase,
  paperAssetsDir,
  rootDir,
  selectQuestionGroupCards,
}) {
  const recentDraftPdfExports = new Map()

  // draft-desk-b step2 (MF-4): separate from recentDraftPdfExports above — that one
  // is exportDraftPaperPdf's existing 30s Vivliostyle-line cache (untouched by this
  // step; step4/SW-5 migrates it). This cache holds the NEW paged.js pipeline's
  // render products (renderPaginatedPaper output, DOM-contract applied), keyed by
  // draftPaperId, no TTL — a signature mismatch (draftPaperPaginationSignature) is
  // the only invalidation trigger, not elapsed time (unlike recentDraftPdfExports,
  // which additionally re-renders after 30s even with an unchanged signature — this
  // cache never does that: pagedjs render output for the same layout signature never
  // becomes stale on its own).
  const draftPaginationCache = new Map()

  // draft-student-field (E4): draft_papers.student_label is additive, nullable,
  // free-text metadata (one-on-one owner attribution — no student entity, no FK).
  // The shared schema-evolution mechanism for the user database lives in
  // server/api.mjs's ensureUserDatabaseShape, which this cut's Forbidden list
  // (mounting boundary shared with a parallel cut) does not permit touching, so
  // this store carries its own idempotent, PRAGMA-guarded ALTER instead — same
  // pattern (existence check before ALTER), just scoped to this one column and
  // this one store. Guarded by a module-level flag so the PRAGMA check only runs
  // once per process after the column is confirmed present.
  let studentLabelColumnReady = false
  function ensureStudentLabelColumn(userDb) {
    if (studentLabelColumnReady) return
    const hasStudentLabelColumn = (db) =>
      db.prepare('PRAGMA table_info(draft_papers)').all().some((row) => row.name === 'student_label')
    if (hasStudentLabelColumn(userDb)) {
      studentLabelColumnReady = true
      return
    }
    try {
      userDb.exec('ALTER TABLE draft_papers ADD COLUMN student_label TEXT')
    } catch (error) {
      // userDb may be a read-only connection (routes/list open readOnly for GET
      // paths) — ALTER requires a writable one. Fall back to a short-lived
      // writable connection just for the migration; the read-only caller's own
      // SELECT (which runs right after this call returns) sees the new column
      // because it is the same underlying sqlite file.
      if (!/readonly|read-only/i.test(String(error?.message || error))) throw error
      const migrationDb = openUserDatabase({ readOnly: false })
      try {
        if (!hasStudentLabelColumn(migrationDb)) {
          migrationDb.exec('ALTER TABLE draft_papers ADD COLUMN student_label TEXT')
        }
      } finally {
        migrationDb.close()
      }
    }
    studentLabelColumnReady = true
  }

  function getCurrentDraftPaperRow(userDb, userId) {
    requireUserId(userId)
    return userDb
      .prepare(
        `
        SELECT id, user_id, title, subject, status, current_marker, last_printed_at, created_at, updated_at
        FROM draft_papers
        WHERE status = 'active' AND current_marker = 1 AND user_id = ?
        ORDER BY updated_at DESC
        LIMIT 1
        `,
      )
      .get(userId) || null
  }

  function makeDraftPaperTitle() {
    const now = new Date()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    return `${month}${day} 英语草稿卷`
  }

  // student_label is deliberately not a create-time parameter here (production
  // never sets it at creation — the workbench's optional "学生" field is set via
  // updateDraftPaper after the draft already exists, same as the title field's
  // own auto-save). New rows leave it column-default NULL.
  function createDraftPaper({ userDb, bankDb }, userId, title = makeDraftPaperTitle()) {
    requireUserId(userId)
    ensureStudentLabelColumn(userDb)
    const id = `draft-paper-${randomUUID()}`
    userDb.prepare('UPDATE draft_papers SET current_marker = 0 WHERE current_marker = 1 AND user_id = ?').run(userId)
    userDb.prepare(
      `
      INSERT INTO draft_papers (id, user_id, title, subject, status, current_marker)
      VALUES (?, ?, ?, 'english', 'active', 1)
      `,
    ).run(id, userId, String(title || '').trim() || makeDraftPaperTitle())
    return getDraftPaper({ userDb, bankDb }, userId, id)
  }

  function touchDraftPaper(userDb, userId, draftPaperId) {
    requireUserId(userId)
    userDb.prepare('UPDATE draft_papers SET updated_at = datetime(\'now\') WHERE id = ? AND user_id = ?').run(draftPaperId, userId)
  }

  function markCurrentDraftPaper(userDb, userId, draftPaperId) {
    requireUserId(userId)
    userDb.prepare('UPDATE draft_papers SET current_marker = 0 WHERE current_marker = 1 AND user_id = ? AND id <> ?').run(userId, draftPaperId)
    userDb.prepare('UPDATE draft_papers SET current_marker = 1, updated_at = datetime(\'now\') WHERE id = ? AND user_id = ?').run(draftPaperId, userId)
  }

  function cnSectionNumber(index) {
    const numerals = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十']
    if (index <= 10) return numerals[index]
    if (index < 20) return `十${numerals[index - 10]}`
    return String(index)
  }

  function buildDraftPaperBlocks(items) {
    const blocks = []
    let previousType = ''
    let sectionIndex = 0
    for (const [index, item] of items.entries()) {
      if (item.groupMissing) continue
      const groupType = item.questionGroup?.groupType || item.groupType || ''
      if (index > 0 && item.pageBreakBefore) blocks.push({ type: 'page_break' })
      if (groupType !== previousType) {
        sectionIndex += 1
        blocks.push({
          type: 'section_header',
          title: `第${cnSectionNumber(sectionIndex)}部分 ${groupTypeLabels[groupType] || '综合练习'}`,
        })
        previousType = groupType
      }
      blocks.push({
        type: 'question_group',
        questionGroupId: item.groupId,
        score: Number(item.questionGroup?.defaultScore || item.defaultScore || 0),
      })
    }
    return blocks
  }

  function buildDraftPaperExportInput(draftPaper, { versionType = 'student', printStyle = 'exam', questionNumberStart = 1 } = {}) {
    return {
      title: draftPaper.title || '未命名英语练习卷',
      versionType: versionType === 'teacher' ? 'teacher' : 'student',
      printStyle: printStyle === 'handout' ? 'handout' : 'exam',
      questionNumberStart: Number.isInteger(Number(questionNumberStart)) && Number(questionNumberStart) >= 1 ? Number(questionNumberStart) : 1,
      items: draftPaper.items
        .filter((item) => !item.groupMissing)
        .map((item) => ({
          questionGroupId: item.groupId,
          score: Number(item.questionGroup?.defaultScore || 0),
          sectionTitle: '',
          note: '',
        })),
      blocks: buildDraftPaperBlocks(draftPaper.items),
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

  // figure-render cut (fig-token P0): `imageMode` defaults to 'web' — the
  // A4 preview + print-preview route are both browser-rendered, served
  // through the app's own origin (`/paper-assets/**` static route), so a
  // root-relative <img> src resolves correctly. `exportDraftPaperPdf`
  // below is the ONE caller that overrides to 'file' AND passes
  // `exportOptions.images` (an array it owns) — buildPrintHtml populates
  // it with `{ relativeName, absoluteSourcePath }` entries so the PDF
  // caller can copy the real PNGs into its scratch tempdir before
  // invoking Vivliostyle (same-directory file:// resource loading works
  // with headless Chromium; cross-directory does not — see
  // print-renderer.mjs's `figureImageSrc` doc comment for the browser-QA
  // finding that drove this design). Callers that don't pass
  // `exportOptions.images` (the other two call sites) get it collected
  // into a throwaway array internally — harmless, they never read it.
  function buildDraftPrintHtml(draftPaper, exportOptions = {}) {
    if (!draftPaper.items.length) return ''
    const input = buildDraftPaperExportInput(draftPaper, exportOptions)
    if (!input.items.length) return ''
    const exportItems = input.items.map((item) => {
      // 依赖 getQuestionGroupDetail 每次返回全新对象：下方教师版分支会就地
      // 写入 detail.questions[].explanation。若它将来加缓存（LRU 等），教师版
      // 解析会泄漏进后续学生版导出——加缓存前必须先改这里为深拷贝。
      // groupMissing items are filtered out of input.items above, so this
      // getQuestionGroupDetail lookup must never see an orphaned groupId here.
      const detail = getQuestionGroupDetail(item.questionGroupId)
      if (!detail) throw new Error(`questionGroupId not found: ${item.questionGroupId}`)
      return {
        detail,
        note: '',
        score: Math.max(0, Number.isFinite(Number(item.score)) ? Number(item.score) : detail.defaultScore),
        sectionTitle: '',
      }
    })
    if (input.versionType === 'teacher' && paperAssetsDir) {
      // Restart cut ③ — join teacher-version explanations from paper-assets
      // analysis files. Display-layer only: never writes questions.explanation.
      const analysisTextByQuestionId = loadGroupAnalysisTexts(exportItems, { paperAssetsDir })
      for (const item of exportItems) {
        for (const question of item.detail.questions) {
          if (question.explanation) continue
          const analysisText = analysisTextByQuestionId.get(question.id)
          if (analysisText) question.explanation = analysisText
        }
      }
    }
    return addDraftFooterCss(
      buildPrintHtml({
        title: input.title,
        versionType: input.versionType,
        printStyle: input.printStyle,
        items: exportItems,
        blocks: input.blocks,
        questionNumberStart: input.questionNumberStart,
        paperAssetsDir,
        imageMode: exportOptions.imageMode === 'file' ? 'file' : 'web',
        images: exportOptions.images ?? [],
      }),
      input.title,
    )
  }

  // draft-desk-b step2 (SW-A fix): same buildDraftPrintHtml output as the
  // Vivliostyle export line below, but self-contained (data: URI images) instead of
  // "copy real files into a tempdir" — see inlineFigureImages' doc comment above for
  // why renderPaginatedPaper's page.setContent() needs this. Callers of
  // getDraftPaperPagination below always go through this, never buildDraftPrintHtml
  // directly.
  function buildDraftPaginationPrintHtml(draftPaper, exportOptions = {}) {
    const images = []
    const html = buildDraftPrintHtml(draftPaper, { ...exportOptions, imageMode: 'file', images })
    if (!html || images.length === 0) return html
    return inlineFigureImages(html, images)
  }

  function clearRecentDraftPdfExport(draftPaperId, outputPath) {
    const cached = recentDraftPdfExports.get(draftPaperId)
    if (!outputPath || cached?.outputPath === outputPath) recentDraftPdfExports.delete(draftPaperId)
    if (!outputPath) return

    const resolvedOutputPath = path.resolve(outputPath)
    const resolvedExportDir = path.resolve(exportDir)
    if (resolvedOutputPath === resolvedExportDir || !resolvedOutputPath.startsWith(`${resolvedExportDir}${path.sep}`)) return
    try {
      rmSync(resolvedOutputPath, { force: true })
    } catch {
      // Best-effort cleanup for staging PDFs; the My Space copy is already persisted.
    }
  }

  function draftPaperPrintSignature(draftPaper, versionType) {
    return JSON.stringify({
      id: draftPaper.id,
      title: draftPaper.title,
      versionType,
      items: draftPaper.items.map((item) => ({
        id: item.id,
        groupId: item.groupId,
        orderIndex: item.orderIndex,
        pageBreakBefore: item.pageBreakBefore,
        updatedAt: item.updatedAt,
      })),
    })
  }

  function estimateEnglishWords(text) {
    return String(text || '').match(/[A-Za-z]+(?:['-][A-Za-z]+)?/g)?.length || 0
  }

  function buildPageBreakSuggestions(items) {
    const suggestions = []
    let previousEstimate = 0
    for (const [index, item] of items.entries()) {
      if (item.groupMissing) continue
      const detail = getQuestionGroupDetail(item.groupId)
      if (!detail) continue
      const materialWords = estimateEnglishWords(`${detail.passage.materialText || ''}\n${detail.passage.summary || ''}`)
      const optionCount = detail.questions.reduce((sum, question) => sum + question.options.length, 0)
      const estimate = materialWords * 1.2 + detail.questions.length * 80 + optionCount * 12
      let reason = ''
      if ((detail.groupType === 'reading' || detail.groupType === 'seven_choices') && materialWords > 600) {
        reason = '长篇材料超过 600 词'
      } else if (detail.questions.length > 4 && optionCount > 16) {
        reason = '题量和选项较多'
      } else if (previousEstimate > 0 && estimate > 700 && previousEstimate + estimate > 1000) {
        reason = '预计会超过当前 A4 页面 70%'
      }
      if (index > 0 && reason && !item.pageBreakBefore) {
        suggestions.push({ itemId: item.id, groupId: item.groupId, reason })
      }
      previousEstimate = estimate
    }
    return suggestions
  }

  function rowToDraftPaperSummary(row, itemRows = []) {
    return {
      id: row.id,
      title: row.title,
      subject: row.subject,
      status: row.status,
      isCurrent: Number(row.current_marker || 0) === 1,
      itemCount: itemRows.length,
      totalQuestions: itemRows.reduce((sum, item) => sum + Number(item.questionGroup?.questionCount || 0), 0),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastPrintedAt: row.last_printed_at || null,
      // draft-student-field (E4): owner-facing "whose one-on-one session is this
      // draft for" metadata. Free text, nullable, never joins into print/export
      // (buildDraftPaperExportInput below never reads it) — see plan.md's hard
      // boundary: this field must never render onto the paper face.
      studentLabel: row.student_label || null,
    }
  }

  // Orphan tolerance (ADR-0011 / plan.md decision 4): a draft item whose question group
  // has disappeared from the bank (e.g. a bank-file replacement dropped it) is returned
  // with groupMissing: true and a null questionGroup, instead of crashing. This is the
  // single point where orphaned items are detected; print/export filtering downstream
  // (buildDraftPaperExportInput / buildDraftPaperBlocks) relies on this flag.
  // Perf cut (docs/cuts/add-to-draft-feel/plan.md): this used to call
  // selectQuestionGroupCards(...WHERE id = ?...) + isGroupPrintReady(...) once
  // PER ROW — each call re-scans the full paper-asset directory (34 dirs,
  // ~11MB JSON) from scratch, so an N-item draft did 2N full scans. Batched to
  // one selectQuestionGroupCards(...WHERE id IN (...)...) call + one
  // getPrintReadyByGroupId call for the whole draft (2 scans total, regardless
  // of N). Per-row judgment semantics are unchanged — only the fetch shape
  // changed from N+1 to batch.
  function getDraftPaperItems({ userDb, bankDb }, draftPaperId) {
    const rows = userDb
      .prepare(
        `
        SELECT id, draft_paper_id, group_id, source_paper_id, order_index, page_break_before, created_at, updated_at
        FROM draft_paper_items
        WHERE draft_paper_id = ?
        ORDER BY order_index ASC, created_at ASC
        `,
      )
      .all(draftPaperId)

    if (rows.length === 0) return []

    const groupIds = Array.from(new Set(rows.map((row) => row.group_id)))
    const placeholders = groupIds.map(() => '?').join(', ')
    const cardByGroupId = new Map(
      selectQuestionGroupCards(bankDb, `WHERE id IN (${placeholders})`, groupIds).map((card) => [card.id, card]),
    )
    const printReadyByGroupId = getPrintReadyByGroupId
      ? getPrintReadyByGroupId(bankDb, groupIds)
      : new Map(groupIds.map((groupId) => [groupId, isGroupPrintReady(bankDb, groupId)]))

    return rows.map((row) => {
      const questionGroup = cardByGroupId.get(row.group_id) || null
      const groupMissing = !questionGroup
      const printReady = groupMissing
        ? { ok: false, reason: '题组不存在' }
        : printReadyByGroupId.get(row.group_id) || { ok: false, reason: '题组不存在' }
      return {
        id: row.id,
        draftPaperId: row.draft_paper_id,
        groupId: row.group_id,
        sourcePaperId: row.source_paper_id || '',
        orderIndex: Number(row.order_index || 0),
        pageBreakBefore: Number(row.page_break_before || 0) === 1,
        printReady: printReady.ok,
        printUnavailableReason: printReady.reason,
        questionGroup,
        groupMissing,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }
    })
  }

  function getDraftPaper({ userDb, bankDb }, userId, draftPaperId, { includePrintHtml = true, versionType = 'student' } = {}) {
    requireUserId(userId)
    ensureStudentLabelColumn(userDb)
    const row = userDb
      .prepare(
        `
        SELECT id, title, subject, status, current_marker, last_printed_at, created_at, updated_at, student_label
        FROM draft_papers
        WHERE id = ? AND user_id = ? AND status = 'active'
        `,
      )
      .get(draftPaperId, userId)
    if (!row) return null
    // draft_paper_items has no user_id column (ADR-0014 decision 3): the SELECT above
    // already proved this draftPaperId belongs to userId, so the child-table query
    // below is safe to run unscoped (PA SW-2 — do not add user_id here, there is no
    // such column and it would be a no-op-shaped bug).
    const items = getDraftPaperItems({ userDb, bankDb }, draftPaperId)
    const draftPaper = {
      ...rowToDraftPaperSummary(row, items),
      items,
      pageBreakSuggestions: buildPageBreakSuggestions(items),
    }
    return {
      ...draftPaper,
      printHtml: includePrintHtml && items.length > 0 ? buildDraftPrintHtml(draftPaper, { versionType }) : '',
    }
  }

  function listDraftPapers(userId) {
    requireUserId(userId)
    const userDb = openUserDatabase({ readOnly: true })
    const bankDb = openDatabase()
    try {
      ensureStudentLabelColumn(userDb)
      const rows = userDb
        .prepare(
          `
          SELECT id, title, subject, status, current_marker, last_printed_at, created_at, updated_at, student_label
          FROM draft_papers
          WHERE status = 'active' AND user_id = ?
          ORDER BY updated_at DESC, created_at DESC
          LIMIT 12
          `,
        )
        .all(userId)
      return rows.map((row) => rowToDraftPaperSummary(row, getDraftPaperItems({ userDb, bankDb }, row.id)))
    } finally {
      userDb.close()
      bankDb.close()
    }
  }

  function getOrCreateCurrentDraftPaper(userId, { createIfMissing = true } = {}) {
    requireUserId(userId)
    const userDb = openUserDatabase({ readOnly: false })
    const bankDb = openDatabase()
    try {
      let current = getCurrentDraftPaperRow(userDb, userId)
      if (!current && createIfMissing) {
        userDb.exec('BEGIN')
        try {
          const draft = createDraftPaper({ userDb, bankDb }, userId)
          userDb.exec('COMMIT')
          return draft
        } catch (error) {
          userDb.exec('ROLLBACK')
          throw error
        }
      }
      return current ? getDraftPaper({ userDb, bankDb }, userId, current.id) : null
    } finally {
      userDb.close()
      bankDb.close()
    }
  }

  function sourcePaperIdFromCard(card) {
    return [card?.year, card?.region, card?.paperName].filter(Boolean).join('__')
  }

  function normalizeDraftItemOrder(userDb, draftPaperId) {
    const rows = userDb
      .prepare('SELECT id FROM draft_paper_items WHERE draft_paper_id = ? ORDER BY order_index ASC, created_at ASC')
      .all(draftPaperId)
    const update = userDb.prepare('UPDATE draft_paper_items SET order_index = ?, updated_at = datetime(\'now\') WHERE id = ?')
    rows.forEach((row, index) => update.run(index + 1, row.id))
  }

  // Write-side guard preserved (plan.md decision 8): adding a group that no longer
  // exists in the bank still throws. Orphan tolerance only applies to the read side
  // (a group already in a draft that later disappears from the bank).
  //
  // M0-4 (plan.md decision 3, "子表规则"): draft_paper_items has no user_id column, so
  // this is the entry point that must hit draft_papers on (id, user_id) BEFORE touching
  // draft_paper_items — previously this function trusted draftPaperId with no ownership
  // check at all. An unmatched (id, user_id) is treated the same as "draft not found".
  function addGroupToDraftPaper({ userDb, bankDb }, userId, draftPaperId, groupId, { insertIndex = null, pageBreakBefore = false } = {}) {
    requireUserId(userId)
    const ownedDraft = userDb
      .prepare("SELECT id FROM draft_papers WHERE id = ? AND user_id = ? AND status = 'active'")
      .get(draftPaperId, userId)
    if (!ownedDraft) throw new Error('Draft paper not found')
    const [card] = selectQuestionGroupCards(bankDb, 'WHERE id = ?', [groupId])
    if (!card) throw new Error(`questionGroupId not found: ${groupId}`)
    const ready = isGroupPrintReady(bankDb, groupId)
    if (!ready.ok) throw new Error(ready.reason || '题组暂不可打印')
    const existing = userDb
      .prepare('SELECT id FROM draft_paper_items WHERE draft_paper_id = ? AND group_id = ?')
      .get(draftPaperId, groupId)
    if (existing) return existing.id
    const count = userDb
      .prepare('SELECT COUNT(*) AS count FROM draft_paper_items WHERE draft_paper_id = ?')
      .get(draftPaperId)?.count || 0
    const targetIndex = Number.isInteger(Number(insertIndex)) && Number(insertIndex) >= 0
      ? Math.min(Number(insertIndex), Number(count))
      : Number(count)
    userDb.prepare(
      `
      UPDATE draft_paper_items
      SET order_index = order_index + 1, updated_at = datetime('now')
      WHERE draft_paper_id = ? AND order_index > ?
      `,
    ).run(draftPaperId, targetIndex)
    const itemId = `draft-item-${randomUUID()}`
    userDb.prepare(
      `
      INSERT INTO draft_paper_items (id, draft_paper_id, group_id, source_paper_id, order_index, page_break_before)
      VALUES (?, ?, ?, ?, ?, ?)
      `,
    ).run(itemId, draftPaperId, groupId, sourcePaperIdFromCard(card), targetIndex + 1, pageBreakBefore ? 1 : 0)
    touchDraftPaper(userDb, userId, draftPaperId)
    normalizeDraftItemOrder(userDb, draftPaperId)
    return itemId
  }

  // ROLLBACK-after-COMMIT fix (draft-numbering-style QA finding): the
  // post-COMMIT getDraftPaper(...) call below (which re-renders print HTML)
  // must sit OUTSIDE the BEGIN/COMMIT try-block. Before this fix it lived
  // INSIDE that try-block, so a render failure there (e.g. a print-renderer
  // consistency assertion) was caught by the surrounding `catch` and turned
  // into a second `userDb.exec('ROLLBACK')` call — but the transaction was
  // already committed, so sqlite throws "cannot rollback - no transaction is
  // active", masking the real render error AND leaving the already-committed
  // mutation in place with no accurate error surfaced to the caller. Moving
  // the read/render call after the try-block means: the mutation still
  // commits (correct — it succeeded), and if the subsequent render throws,
  // that real error propagates as-is to the route layer (existing error
  // convention: caught there and mapped to 4xx, or — for routes with no
  // local catch — the router's top-level handler at the bottom of
  // server/api.mjs turns it into a 500 with the real message). No rollback
  // is attempted after a commit, and no error is swallowed.
  function addGroupToCurrentDraftPaper(userId, groupId) {
    requireUserId(userId)
    const userDb = openUserDatabase({ readOnly: false })
    const bankDb = openDatabase()
    try {
      let current
      userDb.exec('BEGIN')
      try {
        current = getCurrentDraftPaperRow(userDb, userId)
        if (!current) {
          createDraftPaper({ userDb, bankDb }, userId)
          current = getCurrentDraftPaperRow(userDb, userId)
        }
        addGroupToDraftPaper({ userDb, bankDb }, userId, current.id, groupId)
        markCurrentDraftPaper(userDb, userId, current.id)
        userDb.exec('COMMIT')
      } catch (error) {
        userDb.exec('ROLLBACK')
        throw error
      }
      return getDraftPaper({ userDb, bankDb }, userId, current.id)
    } finally {
      userDb.close()
      bankDb.close()
    }
  }

  function updateDraftPaper(userId, draftPaperId, input) {
    requireUserId(userId)
    const userDb = openUserDatabase({ readOnly: false })
    const bankDb = openDatabase()
    try {
      userDb.exec('BEGIN')
      try {
        const existing = getDraftPaper({ userDb, bankDb }, userId, draftPaperId, { includePrintHtml: false })
        if (!existing) throw new Error('Draft paper not found')
        if (Object.prototype.hasOwnProperty.call(input, 'title')) {
          const title = String(input.title || '').trim() || makeDraftPaperTitle()
          userDb.prepare('UPDATE draft_papers SET title = ?, updated_at = datetime(\'now\') WHERE id = ? AND user_id = ?').run(title, draftPaperId, userId)
        }
        // draft-student-field (E4): optional, free text, blur-save from the
        // workbench — empty string normalizes to NULL (space-only names must not
        // stick around and stringify as a chip).
        if (Object.prototype.hasOwnProperty.call(input, 'studentLabel')) {
          const studentLabel = String(input.studentLabel || '').trim() || null
          userDb.prepare('UPDATE draft_papers SET student_label = ?, updated_at = datetime(\'now\') WHERE id = ? AND user_id = ?').run(studentLabel, draftPaperId, userId)
        }
        if (Array.isArray(input.items)) {
          const knownItems = new Set(
            userDb.prepare('SELECT id FROM draft_paper_items WHERE draft_paper_id = ?').all(draftPaperId).map((row) => row.id),
          )
          const updateItem = userDb.prepare(
            `
            UPDATE draft_paper_items
            SET order_index = ?, page_break_before = ?, updated_at = datetime('now')
            WHERE id = ? AND draft_paper_id = ?
            `,
          )
          input.items.forEach((item, index) => {
            if (!knownItems.has(item.id)) return
            updateItem.run(index + 1, item.pageBreakBefore ? 1 : 0, item.id, draftPaperId)
          })
          normalizeDraftItemOrder(userDb, draftPaperId)
          touchDraftPaper(userDb, userId, draftPaperId)
        }
        markCurrentDraftPaper(userDb, userId, draftPaperId)
        userDb.exec('COMMIT')
      } catch (error) {
        userDb.exec('ROLLBACK')
        throw error
      }
      // Post-COMMIT render call moved outside the try/catch above — see the
      // doc comment on addGroupToCurrentDraftPaper for why (no rollback
      // attempted after a successful commit, no swallowed render error).
      return getDraftPaper({ userDb, bankDb }, userId, draftPaperId)
    } finally {
      userDb.close()
      bankDb.close()
    }
  }

  // M0-4 (plan.md decision 3, "子表规则"): draft_paper_items has no user_id column, so
  // the parent draft_papers row must be hit on (id, user_id) BEFORE the item lookup —
  // previously this trusted draftPaperId with no ownership check at all.
  function patchDraftPaperItem(userId, draftPaperId, itemId, input) {
    requireUserId(userId)
    const userDb = openUserDatabase({ readOnly: false })
    const bankDb = openDatabase()
    try {
      userDb.exec('BEGIN')
      try {
        const ownedDraft = userDb
          .prepare("SELECT id FROM draft_papers WHERE id = ? AND user_id = ? AND status = 'active'")
          .get(draftPaperId, userId)
        if (!ownedDraft) throw new Error('Draft paper not found')
        const existing = userDb
          .prepare('SELECT id FROM draft_paper_items WHERE id = ? AND draft_paper_id = ?')
          .get(itemId, draftPaperId)
        if (!existing) throw new Error('Draft item not found')
        if (Object.prototype.hasOwnProperty.call(input, 'pageBreakBefore')) {
          userDb.prepare(
            'UPDATE draft_paper_items SET page_break_before = ?, updated_at = datetime(\'now\') WHERE id = ? AND draft_paper_id = ?',
          ).run(input.pageBreakBefore ? 1 : 0, itemId, draftPaperId)
        }
        touchDraftPaper(userDb, userId, draftPaperId)
        markCurrentDraftPaper(userDb, userId, draftPaperId)
        userDb.exec('COMMIT')
      } catch (error) {
        userDb.exec('ROLLBACK')
        throw error
      }
      // Post-COMMIT render call moved outside the try/catch above — see the
      // doc comment on addGroupToCurrentDraftPaper for why (no rollback
      // attempted after a successful commit, no swallowed render error).
      return getDraftPaper({ userDb, bankDb }, userId, draftPaperId)
    } finally {
      userDb.close()
      bankDb.close()
    }
  }

  // JOIN rewritten to a single-table lookup (plan.md decision 5): the original JOIN
  // against question_groups was only an existence check on the item itself, and whether
  // the referenced group still exists in the bank is irrelevant to delete semantics
  // (orphaned items must remain deletable). userDb-only — no bank touch here at all.
  //
  // M0-4 (plan.md decision 3, "子表规则"): parent ownership must be checked on
  // (id, user_id) before the item lookup — previously this trusted draftPaperId with
  // no ownership check at all.
  function deleteDraftPaperItem(userId, draftPaperId, itemId) {
    requireUserId(userId)
    const userDb = openUserDatabase({ readOnly: false })
    const bankDb = openDatabase()
    let row
    try {
      userDb.exec('BEGIN')
      try {
        const ownedDraft = userDb
          .prepare("SELECT id FROM draft_papers WHERE id = ? AND user_id = ? AND status = 'active'")
          .get(draftPaperId, userId)
        if (!ownedDraft) throw new Error('Draft paper not found')
        row = userDb
          .prepare(
            `
            SELECT *
            FROM draft_paper_items
            WHERE id = ? AND draft_paper_id = ?
            `,
          )
          .get(itemId, draftPaperId)
        if (!row) throw new Error('Draft item not found')
        userDb.prepare('DELETE FROM draft_paper_items WHERE id = ? AND draft_paper_id = ?').run(itemId, draftPaperId)
        normalizeDraftItemOrder(userDb, draftPaperId)
        touchDraftPaper(userDb, userId, draftPaperId)
        markCurrentDraftPaper(userDb, userId, draftPaperId)
        userDb.exec('COMMIT')
      } catch (error) {
        userDb.exec('ROLLBACK')
        throw error
      }
      // Post-COMMIT render call moved outside the try/catch above — see the
      // doc comment on addGroupToCurrentDraftPaper for why (no rollback
      // attempted after a successful commit, no swallowed render error).
      return {
        draftPaper: getDraftPaper({ userDb, bankDb }, userId, draftPaperId),
        removed: {
          itemId: row.id,
          groupId: row.group_id,
          orderIndex: Number(row.order_index || 1),
          pageBreakBefore: Number(row.page_break_before || 0) === 1,
        },
      }
    } finally {
      userDb.close()
      bankDb.close()
    }
  }

  function restoreDraftPaperItem(userId, draftPaperId, input) {
    requireUserId(userId)
    const userDb = openUserDatabase({ readOnly: false })
    const bankDb = openDatabase()
    try {
      userDb.exec('BEGIN')
      try {
        const groupId = String(input.groupId || '').trim()
        if (!groupId) throw new Error('groupId is required')
        const insertIndex = Number.isInteger(Number(input.orderIndex)) ? Number(input.orderIndex) - 1 : null
        addGroupToDraftPaper({ userDb, bankDb }, userId, draftPaperId, groupId, {
          insertIndex,
          pageBreakBefore: input.pageBreakBefore === true,
        })
        markCurrentDraftPaper(userDb, userId, draftPaperId)
        userDb.exec('COMMIT')
      } catch (error) {
        userDb.exec('ROLLBACK')
        throw error
      }
      // Post-COMMIT render call moved outside the try/catch above — see the
      // doc comment on addGroupToCurrentDraftPaper for why (no rollback
      // attempted after a successful commit, no swallowed render error).
      return getDraftPaper({ userDb, bankDb }, userId, draftPaperId)
    } finally {
      userDb.close()
      bankDb.close()
    }
  }

  function migrateAssemblyBasketToDraftPaper(userId, input) {
    requireUserId(userId)
    const groupIds = Array.isArray(input?.groupIds) ? input.groupIds.map((id) => String(id || '').trim()).filter(Boolean) : []
    const userDb = openUserDatabase({ readOnly: false })
    const bankDb = openDatabase()
    try {
      // ROLLBACK-after-COMMIT fix (draft-numbering-style, same pattern as
      // d51eab2's fix to this file's five sibling functions): both
      // post-COMMIT getDraftPaper calls below (which re-render print HTML,
      // and can throw — e.g. the print-renderer consistency assertion) must
      // sit OUTSIDE the BEGIN/COMMIT try-block, or a render failure there
      // would be caught by this try-block's own catch and attempt a SECOND
      // ROLLBACK on an already-committed transaction ("cannot rollback - no
      // transaction is active"), masking the real error. `outcome` captures
      // which branch committed so the deferred getDraftPaper call can run
      // against the right draft id with the right counts.
      let outcome
      userDb.exec('BEGIN')
      try {
        let current = getCurrentDraftPaperRow(userDb, userId)
        if (current) {
          userDb.exec('COMMIT')
          outcome = { draftPaperId: current.id, migratedCount: 0, skippedCount: groupIds.length }
        } else {
          const draft = createDraftPaper({ userDb, bankDb }, userId)
          let migratedCount = 0
          let skippedCount = 0
          for (const groupId of groupIds) {
            try {
              addGroupToDraftPaper({ userDb, bankDb }, userId, draft.id, groupId)
              migratedCount += 1
            } catch {
              skippedCount += 1
            }
          }
          userDb.exec('COMMIT')
          outcome = { draftPaperId: draft.id, migratedCount, skippedCount }
        }
      } catch (error) {
        userDb.exec('ROLLBACK')
        throw error
      }
      return {
        draftPaper: getDraftPaper({ userDb, bankDb }, userId, outcome.draftPaperId),
        migratedCount: outcome.migratedCount,
        skippedCount: outcome.skippedCount,
      }
    } finally {
      userDb.close()
      bankDb.close()
    }
  }

  // M0-4 (plan.md decision 3 + PA MF-3): getDraftPaper below already gates on
  // (id, user_id) and returns null for an unowned draft — this is the entry point
  // that keeps "B borrows A's draftId through the export route" from being an
  // exfiltration vector (server/my-space/mySpaceRoutes.mjs POST /api/my-space/artifacts
  // calls this before saveMySpaceArtifact). recentDraftPdfExports cache keys stay
  // unscoped (plan.md decision 9 — upstream ownership check already runs before any
  // cache read/write here, so there is no leak path through the cache).
  function exportDraftPaperPdf(userId, draftPaperId, { preferRecent = false, versionType = 'student' } = {}) {
    requireUserId(userId)
    const normalizedVersionType = versionType === 'teacher' ? 'teacher' : 'student'
    const userDb = openUserDatabase({ readOnly: false })
    const bankDb = openDatabase()
    try {
      const draftPaper = getDraftPaper({ userDb, bankDb }, userId, draftPaperId, { includePrintHtml: false })
      if (!draftPaper) throw new Error('Draft paper not found')
      if (!draftPaper.items.length) throw new Error('请先添加题组')
      const signature = draftPaperPrintSignature(draftPaper, normalizedVersionType)
      const recent = recentDraftPdfExports.get(draftPaperId)
      if (
        preferRecent &&
        recent &&
        recent.signature === signature &&
        Date.now() - recent.createdAt <= 30_000 &&
        existsSync(recent.outputPath)
      ) {
        userDb.prepare('UPDATE draft_papers SET last_printed_at = datetime(\'now\'), updated_at = datetime(\'now\') WHERE id = ? AND user_id = ?').run(draftPaperId, userId)
        return { body: readFileSync(recent.outputPath), fileName: recent.fileName, outputPath: recent.outputPath, draftPaper, reusedRecent: true }
      }
      // figure-render cut: this is the ONE buildDraftPrintHtml call whose
      // output gets written to a scratch tempdir and converted OFFLINE via
      // Vivliostyle CLI below — imageMode: 'file' so any figure <img> src
      // is a relative filename (not the web-relative /paper-assets/...
      // default the other two callers need), and `images` collects which
      // real PNGs to copy into that SAME tempdir before Vivliostyle runs
      // (see print-renderer.mjs's figureImageSrc doc comment).
      const printImages = []
      const html = buildDraftPrintHtml(draftPaper, { versionType: normalizedVersionType, imageMode: 'file', images: printImages })
      if (!html) throw new Error('请先添加题组')
      const vivliostylePaths = [
        path.join(rootDir, 'node_modules', '.bin', 'vivliostyle'),
        path.join(rootDir, 'server', 'node_modules', '.bin', 'vivliostyle'),
        path.join(rootDir, 'app', 'node_modules', '.bin', 'vivliostyle'),
      ]
      let vivliostyleBin = null
      for (const p of vivliostylePaths) {
        if (existsSync(p)) { vivliostyleBin = p; break }
      }
      if (!vivliostyleBin) {
        throw new Error('vivliostyle CLI not found. Install with: npm install @vivliostyle/cli')
      }

      mkdirSync(exportDir, { recursive: true })
      const tempDir = mkdtempSync(path.join(tmpdir(), 'draft-paper-print-'))
      const htmlPath = path.join(tempDir, 'draft-paper.html')
      const pdfPath = path.join(tempDir, 'draft-paper.pdf')
      try {
        writeFileSync(htmlPath, html)
        for (const image of printImages) {
          copyFileSync(image.absoluteSourcePath, path.join(tempDir, image.relativeName))
        }
        execFileSync(vivliostyleBin, ['build', htmlPath, '-o', pdfPath], { timeout: 60000 })
        const safeTitle = String(draftPaper.title || '英语草稿卷').replace(/[\\/:*?"<>|]/g, '-')
        const versionLabel = normalizedVersionType === 'teacher' ? '教师卷' : '学生卷'
        const fileName = `${safeTitle}-${versionLabel}.pdf`
        const outputPath = path.join(exportDir, `${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}-${fileName}`)
        copyFileSync(pdfPath, outputPath)
        userDb.prepare('UPDATE draft_papers SET last_printed_at = datetime(\'now\'), updated_at = datetime(\'now\') WHERE id = ? AND user_id = ?').run(draftPaperId, userId)
        recentDraftPdfExports.set(draftPaperId, { signature, fileName, outputPath, createdAt: Date.now() })
        return { body: readFileSync(outputPath), fileName, outputPath, draftPaper, reusedRecent: false }
      } finally {
        rmSync(tempDir, { recursive: true, force: true })
      }
    } finally {
      userDb.close()
      bankDb.close()
    }
  }

  // draft-desk-b step2 (MF-3/MF-4, plan.md "步2 — DOM 契约 + 缓存解耦"): renders (or
  // reuses a cached render of) draftPaper through the new paged.js pipeline
  // (paginationRenderer.mjs) and applies the DOM contract
  // (paginationDomContract.mjs) before returning. NOT wired to a route yet — step3
  // (front-end iframe consumption) and step4 (PDF export cutover) do that; this
  // function only needs to exist and be correct for this step.
  //
  // No dedup lock across concurrent calls for the SAME draftPaperId: two
  // overlapping cache-miss calls will both render (chromiumPool.mjs's own internal
  // queue still serializes the actual Chromium work, so this is wasteful, not
  // unsafe — the second render simply overwrites the cache entry with an
  // identical-signature result). A single-flight lock is out of this step's scope;
  // revisit only if it shows up as a real problem once step3 wires concurrent
  // requests.
  async function getDraftPaperPagination(userId, draftPaperId, { versionType = 'student' } = {}) {
    requireUserId(userId)
    const normalizedVersionType = versionType === 'teacher' ? 'teacher' : 'student'
    const userDb = openUserDatabase({ readOnly: false })
    const bankDb = openDatabase()
    try {
      const draftPaper = getDraftPaper({ userDb, bankDb }, userId, draftPaperId, { includePrintHtml: false })
      if (!draftPaper) throw new Error('Draft paper not found')
      if (!draftPaper.items.length) throw new Error('请先添加题组')

      const signature = draftPaperPaginationSignature(draftPaper, normalizedVersionType)
      const cached = draftPaginationCache.get(draftPaperId)
      if (cached && cached.signature === signature) {
        return { paginatedHtml: cached.paginatedHtml, pdfBytes: cached.pdfBytes, pageCount: cached.pageCount, draftPaper, reused: true }
      }

      const html = buildDraftPaginationPrintHtml(draftPaper, { versionType: normalizedVersionType })
      if (!html) throw new Error('请先添加题组')
      const rendered = await renderPaginatedPaper(html)
      // Same non-groupMissing, item-order group id list buildDraftPaperBlocks derives
      // its question_group blocks from (see buildDraftPaperBlocks above) — this is the
      // positional contract applyPaginationDomContract's header comment documents.
      const groupIds = draftPaper.items.filter((item) => !item.groupMissing).map((item) => item.groupId)
      const paginatedHtml = applyPaginationDomContract(rendered.paginatedHtml, { groupIds, pageCount: rendered.pageCount })

      draftPaginationCache.set(draftPaperId, { signature, paginatedHtml, pdfBytes: rendered.pdfBytes, pageCount: rendered.pageCount })
      return { paginatedHtml, pdfBytes: rendered.pdfBytes, pageCount: rendered.pageCount, draftPaper, reused: false }
    } finally {
      userDb.close()
      bankDb.close()
    }
  }

  return {
    addGroupToCurrentDraftPaper,
    addGroupToDraftPaper,
    buildDraftPrintHtml,
    clearRecentDraftPdfExport,
    deleteDraftPaperItem,
    exportDraftPaperPdf,
    getCurrentDraftPaperRow,
    getDraftPaper,
    getDraftPaperPagination,
    getOrCreateCurrentDraftPaper,
    listDraftPapers,
    markCurrentDraftPaper,
    migrateAssemblyBasketToDraftPaper,
    patchDraftPaperItem,
    restoreDraftPaperItem,
    updateDraftPaper,
  }
}
