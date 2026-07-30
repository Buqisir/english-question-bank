// draft-desk-b step4 (SW-5 retirement, plan.md "步4"): the Vivliostyle CLI
// export line that used to live in exportDraftPaperPdf below (execFileSync +
// mkdtempSync + copyFileSync + a scratch tempdir under `exportDir`) is gone —
// exportDraftPaperPdf now consumes getDraftPaperPagination's in-memory
// pdfBytes directly (see that function's own doc comment). readFileSync
// stays; it is still used by inlineFigureImages below.
import { existsSync, readFileSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import path from 'node:path'
import { buildPrintHtml } from '../print-renderer.mjs'
import {
  loadCanonicalGrammarFillPrintChrome,
} from '../paper-canonical/grammarFillPrintSourceBinding.mjs'
import { loadGroupAnalysisTexts } from './analysisText.mjs'
import { renderPaginatedPaper } from './paginationRenderer.mjs'
import { applyPaginationDomContract } from './paginationDomContract.mjs'
import { proposeReorder } from './reorderSuggestion.mjs'

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
// signature for the new paged.js pagination cache (getDraftPaperPagination below).
// step2/3 deliberately kept this separate from `draftPaperPrintSignature` (the old
// Vivliostyle-line signature) rather than unifying them, because the two caches'
// invalidation rules briefly disagreed on `title` (DP-title, see below) — step4
// retired `draftPaperPrintSignature` and the 30s-TTL cache it served entirely
// (SW-5, owner ruling 2026-07-12: 退役不迁移) once exportDraftPaperPdf itself
// switched to consuming this cache via getDraftPaperPagination, so there is now
// only ONE pagination cache and ONE signature function in this module.
//
// Fields included are the plan.md step2 "布局编辑" set (item identity/order/
// page-break-before) PLUS `title` (draft-desk-b step3, DP-title owner ruling
// 2026-07-12, Option B — see cr-step2-lite.md "DP-title" and plan.md's step2 Must-Do
// revision note). Step2 originally shipped with `title` EXCLUDED per plan.md's then-
// literal Must-Do text ("改标题不触发 render") — but draftPaperStore.mjs's own
// addDraftFooterCss() unconditionally bakes `title` into the CSS `@page
// @bottom-center` footer text of EVERY page (DP-1 acceptance check (b) required this
// exact footer to render correctly), so excluding it left a confirmed parity gap: a
// title-only edit would keep serving a cache hit with the OLD footer text until the
// next layout edit. The owner ratified Option B (title IN the signature, a title edit
// triggers a real re-render) precisely because parity is this whole cut's reason to
// exist and PO-2's "重新排版中…" loading state already absorbs the extra ~700-800ms
// render this adds on a title edit. studentLabel and the item list view stay excluded
// — neither ever reaches the printed page.
export function draftPaperPaginationSignature(
  draftPaper,
  versionType,
  canonicalConsumptionSignature = null,
) {
  return JSON.stringify({
    id: draftPaper.id,
    title: draftPaper.title,
    versionType,
    canonicalConsumptionSignature,
    items: draftPaper.items.map((item) => ({
      id: item.id,
      groupId: item.groupId,
      orderIndex: item.orderIndex,
      pageBreakBefore: item.pageBreakBefore,
    })),
  })
}

// print-form (plan.md Must Do 2, owner 必答题拍板 2026-07-12: 魔法数字整套删除
// — the word-count heuristic that used to live in this module
// (buildPageBreakSuggestions/estimateEnglishWords, retired) is replaced by a
// judgment derived from the ACTUAL rendered page layout instead of guessing
// ahead of time. Two pure, independently-testable pieces:
//
//   1. evaluatePageBreakAcrossPages(firstPage, printForm) — the judgment
//      function itself (owner-ratified semantics, 议题2 六裁点 +
//      prototype-print-form-v2.html): given the earlier of two pages a
//      question-group spans (`firstPage`), decide whether that specific
//      page boundary is a REAL break for the given print form.
//        - a4 (single-sided loose sheets): every page boundary is a break.
//        - a3 (folded, double-sided, 2-up — 面对 = 版(1,2)/(3,4)/…, i.e. every
//          physical A3 sheet holds 4 logical pages: 版(4k+1,4k+2) on its front
//          face, 版(4k+3,4k+4) on its back face): a boundary is a break only
//          when `firstPage` is even — odd->even (版1→版2, 版3→版4, …) is the
//          SAME face, side by side, never a break. firstPage%4===2 (版2→版3,
//          版6→版7, …) flips the same physical sheet over ("翻面");
//          firstPage%4===0 (版4→版5, 版8→版9, …) moves to a new physical
//          sheet ("换张").
//   2. derivePageBreakSuggestions(paginatedHtml, {...}) — parses the ALREADY
//      server-rendered, DOM-contract-tagged HTML (paginationDomContract.mjs's
//      frozen `.preview-page` / `data-group-id` output — this function only
//      ever consumes that finished contract, it never re-implements or
//      second-guesses it) to find which question-groups actually span a page
//      boundary, then applies (1) to each boundary.
//
// print_form deliberately never enters draftPaperPaginationSignature (plan.md
// 裁点2: "A4/A3 不改排版，只改判据与计数") — suggestions are cheaply re-derived
// from the cached paginatedHtml on every call, so a print-form toggle alone
// never invalidates the render cache.
export function evaluatePageBreakAcrossPages(firstPage, printForm) {
  if (printForm === 'a3') {
    if (firstPage % 4 === 2) {
      return { broken: true, reason: `跨页断篇（第${firstPage}/${firstPage + 1}版，翻面）` }
    }
    if (firstPage % 4 === 0) {
      return { broken: true, reason: `跨页断篇（第${firstPage}/${firstPage + 1}版，换张）` }
    }
    return { broken: false, reason: '' }
  }
  return { broken: true, reason: `跨页断篇（第${firstPage}/${firstPage + 1}页）` }
}

// Maps each `data-group-id` found in `paginatedHtml` to the ordered, unique
// list of 1-based page numbers it appears on. Page boundaries are found the
// same way paginationDomContract.mjs's own sanity check does (a plain
// `.preview-page` container match, not a full DOM parse — this module never
// re-parses the contract, only scans its already-frozen output), and content
// is chunked between consecutive container matches (page N's chunk runs from
// its own container's start to the next container's start, or end-of-string
// for the last page) — page containers are top-level siblings in document
// order, so this chunking is exact regardless of nested markup depth.
// `<template>` blocks (paged.js's own inert "master copy" of every group,
// tagged with the same data-group-id per paginationDomContract.mjs's own doc
// comment) are stripped first so they can never be mistaken for a real page.
function extractGroupPageSpans(paginatedHtml) {
  const withoutTemplates = paginatedHtml.replace(/<template[^>]*>[\s\S]*?<\/template>/gi, '')
  const pageStarts = []
  const pageContainerRegex = /<div class="[^"]*\bpreview-page\b[^"]*"/g
  let containerMatch
  while ((containerMatch = pageContainerRegex.exec(withoutTemplates))) {
    pageStarts.push(containerMatch.index)
  }
  const spans = new Map()
  pageStarts.forEach((start, index) => {
    const end = index + 1 < pageStarts.length ? pageStarts[index + 1] : withoutTemplates.length
    const chunk = withoutTemplates.slice(start, end)
    const pageNumber = index + 1
    const groupIdsOnPage = new Set()
    const groupIdRegex = /data-group-id="([^"]+)"/g
    let groupMatch
    while ((groupMatch = groupIdRegex.exec(chunk))) {
      groupIdsOnPage.add(groupMatch[1])
    }
    for (const groupId of groupIdsOnPage) {
      if (!spans.has(groupId)) spans.set(groupId, [])
      spans.get(groupId).push(pageNumber)
    }
  })
  return spans
}

// `itemsByGroupId` must be a Map<groupId, itemId> (non-groupMissing draft
// items — the same filtered set the contract HTML's `data-group-id`s are
// drawn from). Returns at most one suggestion per group (the first real
// break it spans), matching the retired heuristic's one-suggestion-per-item
// shape.
export function derivePageBreakSuggestions(paginatedHtml, { itemsByGroupId, printForm } = {}) {
  if (typeof paginatedHtml !== 'string' || !paginatedHtml) return []
  const spans = extractGroupPageSpans(paginatedHtml)
  const suggestions = []
  for (const [groupId, pages] of spans) {
    for (let i = 0; i < pages.length - 1; i += 1) {
      if (pages[i + 1] !== pages[i] + 1) continue
      const judged = evaluatePageBreakAcrossPages(pages[i], printForm)
      if (judged.broken) {
        const itemId = itemsByGroupId?.get(groupId)
        if (itemId) suggestions.push({ itemId, groupId, reason: judged.reason })
        break
      }
    }
  }
  return suggestions
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
  getPrintReadyByGroupId,
  getQuestionGroupDetail,
  groupTypeLabels,
  isGroupPrintReady,
  openDatabase,
  openUserDatabase,
  paperAssetsDir,
  resolveCanonicalConsumption = null,
  selectQuestionGroupCards,
}) {
  // draft-desk-b step4 (SW-5 retirement): `exportDir` and `rootDir` used to be
  // required here — the old exportDraftPaperPdf wrote a Vivliostyle-built PDF to a
  // scratch tempdir and copied it into `exportDir`, and located the vivliostyle CLI
  // binary under `rootDir`'s node_modules. Neither is needed anymore (pdfBytes now
  // come straight out of Playwright's page.pdf() as an in-memory Buffer — see
  // exportDraftPaperPdf below). Dropped from this destructure rather than left as
  // unused bindings; server/api.mjs and the verify scripts that construct this store
  // may keep passing them in their options object harmlessly (plain JS object
  // destructuring ignores extra properties) — no caller update required.
  //
  // draft-desk-b step3 SW-F (cr-step2-lite.md): entries hold pdfBytes + paginatedHtml
  // (~1MB+/draft) with no cap — a multi-draft, long-running server process would grow
  // this unbounded. Bounded to a simple LRU of DRAFT_PAGINATION_CACHE_MAX_ENTRIES
  // (8 — "保 8 卷即可" per plan.md, not a tuned figure) via Map's insertion-order
  // iteration: a hit re-inserts its key (moves it to most-recently-used), and a set
  // that pushes size past the cap evicts the map's first (least-recently-used) key.
  //
  // draft-desk-b step3 SW-G (cr-step2-lite.md): keyed by `${draftPaperId}::
  // ${versionType}`, not draftPaperId alone — the workbench's 学生版/教师版 preview
  // toggle (DraftPaperWorkbench.tsx) drives this cache, and step4 (SW-5) means
  // exportDraftPaperPdf now drives it too (see below) — draftPaperPaginationSignature
  // already includes versionType, so a single-keyed cache would have the two
  // versions evict each other on every toggle (wasteful re-render, never wrong —
  // same class of bug as SW-G originally described).
  const DRAFT_PAGINATION_CACHE_MAX_ENTRIES = 8
  const draftPaginationCache = new Map()
  function draftPaginationCacheKey(draftPaperId, versionType) {
    return `${draftPaperId}::${versionType}`
  }
  function draftPaginationCacheGet(key) {
    const entry = draftPaginationCache.get(key)
    if (!entry) return undefined
    // Touch: re-insert so this key becomes the most-recently-used for eviction
    // ordering purposes (Map preserves insertion order; delete+set moves it to the
    // end without changing the stored value).
    draftPaginationCache.delete(key)
    draftPaginationCache.set(key, entry)
    return entry
  }
  function draftPaginationCacheSet(key, entry) {
    draftPaginationCache.delete(key)
    draftPaginationCache.set(key, entry)
    while (draftPaginationCache.size > DRAFT_PAGINATION_CACHE_MAX_ENTRIES) {
      const oldestKey = draftPaginationCache.keys().next().value
      draftPaginationCache.delete(oldestKey)
    }
  }

  // reorder-suggest (plan.md 施工契约 1 "proposeReorder(...) 编排"): a SEPARATE
  // LRU from draftPaginationCache above — different value shape (a
  // `{ order, move, brokenGroupId } | null` verdict, not paginatedHtml/pdfBytes)
  // and a different key (includes printForm — draftPaginationCache deliberately
  // excludes it, plan.md 裁点2, because printForm never changes the render;
  // this cache's verdict DOES depend on printForm, since evaluateCandidateOrder
  // dry-runs derivePageBreakSuggestions under the current print form). Keyed by
  // `${draftPaperId}::${printForm}::${分页签名}` (plan.md) so any layout edit
  // (which already changes draftPaperPaginationSignature) or a print-form
  // toggle invalidates it — same bounded-to-8 LRU shape as draftPaginationCache.
  const REORDER_SUGGESTION_CACHE_MAX_ENTRIES = 8
  const reorderSuggestionCache = new Map()
  // pagination-determinism-diag (2026-07-16): the layout signature covers every
  // live-editable field that reaches the printed page, and renderPaginatedPaper
  // was measured byte-deterministic (8× identical, cold+warm) — but the key
  // additionally pins the ACTUAL break set the verdict was computed against, so
  // if a same-signature render ever yields different breaks (engine bump, font
  // environment change), the stale verdict self-heals by recompute instead of
  // being served forever.
  function reorderSuggestionCacheKey(draftPaperId, printForm, signature, pageBreakSuggestions) {
    const breaksHash = createHash('md5').update(JSON.stringify(pageBreakSuggestions)).digest('hex').slice(0, 12)
    return `${draftPaperId}::${printForm}::${signature}::${breaksHash}`
  }
  function reorderSuggestionCacheGet(key) {
    // has() 判存在性：null 是合法裁决（无候选可消断），必须命中缓存，
    // 否则 A4 常见路径每次调用都重跑最多 6 次 Chromium dry-run（CR MF-1）。
    if (!reorderSuggestionCache.has(key)) return undefined
    const entry = reorderSuggestionCache.get(key)
    reorderSuggestionCache.delete(key)
    reorderSuggestionCache.set(key, entry)
    return entry
  }
  function reorderSuggestionCacheSet(key, entry) {
    reorderSuggestionCache.delete(key)
    reorderSuggestionCache.set(key, entry)
    while (reorderSuggestionCache.size > REORDER_SUGGESTION_CACHE_MAX_ENTRIES) {
      const oldestKey = reorderSuggestionCache.keys().next().value
      reorderSuggestionCache.delete(oldestKey)
    }
  }

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

  // print-form (plan.md "Must Do 1"): same additive, lazy-ALTER pattern as
  // student_label above — NULL reads as 'a4' (rowToDraftPaperSummary below is
  // the single place that applies that default), and a new draft inherits the
  // creating user's most-recently-updated draft's print_form (mostRecentPrintForm
  // below), falling back to 'a4' when the user has no prior draft.
  let printFormColumnReady = false
  function ensurePrintFormColumn(userDb) {
    if (printFormColumnReady) return
    const hasPrintFormColumn = (db) =>
      db.prepare('PRAGMA table_info(draft_papers)').all().some((row) => row.name === 'print_form')
    if (hasPrintFormColumn(userDb)) {
      printFormColumnReady = true
      return
    }
    try {
      userDb.exec('ALTER TABLE draft_papers ADD COLUMN print_form TEXT')
    } catch (error) {
      if (!/readonly|read-only/i.test(String(error?.message || error))) throw error
      const migrationDb = openUserDatabase({ readOnly: false })
      try {
        if (!hasPrintFormColumn(migrationDb)) {
          migrationDb.exec('ALTER TABLE draft_papers ADD COLUMN print_form TEXT')
        }
      } finally {
        migrationDb.close()
      }
    }
    printFormColumnReady = true
  }

  function normalizePrintForm(value) {
    return value === 'a3' ? 'a3' : 'a4'
  }

  // "记住上次" (plan.md 裁点3): the newest-updated active draft belonging to
  // this user, if any, donates its print_form to a freshly created draft.
  function mostRecentPrintForm(userDb, userId) {
    const row = userDb
      .prepare(
        `SELECT print_form FROM draft_papers WHERE user_id = ? AND status = 'active' ORDER BY updated_at DESC LIMIT 1`,
      )
      .get(userId)
    return row ? normalizePrintForm(row.print_form) : 'a4'
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
    ensurePrintFormColumn(userDb)
    const id = `draft-paper-${randomUUID()}`
    const printForm = mostRecentPrintForm(userDb, userId)
    userDb.prepare('UPDATE draft_papers SET current_marker = 0 WHERE current_marker = 1 AND user_id = ?').run(userId)
    userDb.prepare(
      `
      INSERT INTO draft_papers (id, user_id, title, subject, status, current_marker, print_form)
      VALUES (?, ?, ?, 'english', 'active', 1, ?)
      `,
    ).run(id, userId, String(title || '').trim() || makeDraftPaperTitle(), printForm)
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
          sourcePaperId: item.sourcePaperId,
          score: Number(item.questionGroup?.defaultScore || 0),
          sectionTitle: '',
          note: '',
        })),
      blocks: buildDraftPaperBlocks(draftPaper.items),
    }
  }

  function loadCanonicalClozeChrome(exportItems, canonicalConsumption) {
    const selection = canonicalConsumption?.selections?.find(
      (candidate) =>
        candidate.familyContractId === 'cloze'
        && candidate.mode === 'canonical',
    )
    if (!selection) return null
    const reject = (message) => {
      const error = new Error(message)
      error.code = 'CANONICAL_CONSUMPTION_REJECTED'
      throw error
    }
    if (selection.groupIds.length !== 1 || !paperAssetsDir) {
      reject('Canonical Cloze chrome source identity is unavailable')
    }
    const groupId = selection.groupIds[0]
    const item = exportItems.find((candidate) => candidate.detail.id === groupId)
    const sourcePaperId = item?.detail.paperId
    if (typeof sourcePaperId !== 'string' || sourcePaperId.length === 0) {
      reject('Canonical Cloze chrome paper identity is unavailable')
    }
    const sourceAssetVersion = canonicalConsumption?.sourceAssetVersion
    const sourceAssetDigest = canonicalConsumption?.sourceAssetDigest
    if (
      !Number.isInteger(sourceAssetVersion)
      || typeof sourceAssetDigest !== 'string'
    ) {
      reject('Canonical Cloze chrome source binding is unavailable')
    }
    const assetPath = path.join(
      paperAssetsDir,
      sourcePaperId,
      'versions',
      `v${sourceAssetVersion}`,
      'paper-asset.json',
    )
    if (!existsSync(assetPath)) {
      reject('Canonical Cloze chrome immutable source asset is unavailable')
    }
    const assetBytes = readFileSync(assetPath)
    const observedDigest =
      `sha256:${createHash('sha256').update(assetBytes).digest('hex')}`
    if (observedDigest !== sourceAssetDigest) {
      reject('Canonical Cloze chrome immutable source digest disagrees')
    }
    let asset
    try {
      asset = JSON.parse(assetBytes)
    } catch {
      reject('Canonical Cloze chrome immutable source asset is invalid')
    }
    const blocks = asset?.content?.blocks
    if (!Array.isArray(blocks)) {
      reject('Canonical Cloze chrome immutable source blocks are invalid')
    }
    const groupIndex = blocks.findIndex(
      (block) => block.type === 'group' && block.groupId === groupId,
    )
    if (groupIndex < 0) {
      reject('Canonical Cloze chrome Group identity is unavailable')
    }
    const preceding = []
    for (let index = groupIndex - 1; index >= 0; index -= 1) {
      const block = blocks[index]
      if (block.type === 'pageBreakHint') continue
      if (
        block.type === 'partHeading'
        || block.type === 'sectionHeading'
        || block.type === 'instruction'
      ) {
        preceding.unshift(block)
        continue
      }
      break
    }
    const [part, section, instruction] = preceding
    const followingSection = blocks.slice(groupIndex + 1).find(
      (block) => block.type === 'sectionHeading',
    )
    if (
      part?.type !== 'partHeading'
      || section?.type !== 'sectionHeading'
      || instruction?.type !== 'instruction'
      || followingSection?.type !== 'sectionHeading'
      || [part.text, section.text, instruction.text, followingSection.text]
        .some((text) => typeof text !== 'string' || text.length === 0)
    ) {
      reject('Canonical Cloze chrome source adjacency is incomplete')
    }
    return {
      groupId,
      part: { partId: part.partId, text: part.text },
      section: { sectionId: section.sectionId, text: section.text },
      instruction: { text: instruction.text },
      followingSection: {
        sectionId: followingSection.sectionId,
        text: followingSection.text,
      },
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
  function resolveDraftExportItems(input) {
    return input.items.map((item) => {
      // getQuestionGroupDetail currently returns a fresh object. Teacher
      // Analysis below mutates its question explanations, so a future cache
      // must add a clone at this boundary.
      const detail = getQuestionGroupDetail(item.questionGroupId)
      if (!detail) throw new Error(`questionGroupId not found: ${item.questionGroupId}`)
      return {
        detail,
        sourcePaperId: item.sourcePaperId,
        note: '',
        score: Math.max(
          0,
          Number.isFinite(Number(item.score))
            ? Number(item.score)
            : detail.defaultScore,
        ),
        sectionTitle: '',
      }
    })
  }

  function buildDraftPrintHtml(draftPaper, exportOptions = {}) {
    if (!draftPaper.items.length) return ''
    const input = buildDraftPaperExportInput(draftPaper, exportOptions)
    if (!input.items.length) return ''
    const exportItems = resolveDraftExportItems(input)
    const canonicalConsumption =
      Object.prototype.hasOwnProperty.call(exportOptions, 'canonicalConsumption')
        ? exportOptions.canonicalConsumption
        : resolveCanonicalConsumption
          ? resolveCanonicalConsumption({
              consumerId: 'print_pdf',
              items: exportItems,
            })
          : null
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
    const clozeChrome = loadCanonicalClozeChrome(
      exportItems,
      canonicalConsumption,
    )
    const grammarFillChrome = loadCanonicalGrammarFillPrintChrome({
      exportItems,
      canonicalConsumption,
      paperAssetsDir,
      versionType: input.versionType,
    })
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
        canonicalConsumption,
        clozeChrome,
        grammarFillChrome,
      }),
      input.title,
    )
  }

  function resolveDraftCanonicalConsumption(draftPaper) {
    if (!resolveCanonicalConsumption) return null
    const input = buildDraftPaperExportInput(draftPaper)
    const exportItems = resolveDraftExportItems(input)
    return resolveCanonicalConsumption({
      consumerId: 'print_pdf',
      items: exportItems,
    })
  }

  function consumptionSignature(consumption) {
    if (!consumption) return null
    return createHash('sha256')
      .update(JSON.stringify(consumption))
      .digest('hex')
  }

  // draft-desk-b step2 (SW-A fix): same buildDraftPrintHtml output the old
  // Vivliostyle export line used to build directly, but self-contained (data: URI
  // images) instead of "copy real files into a tempdir" — see inlineFigureImages'
  // doc comment above for why renderPaginatedPaper's page.setContent() needs this.
  // Callers of getDraftPaperPagination below (which, as of step4, now includes
  // exportDraftPaperPdf) always go through this, never buildDraftPrintHtml directly.
  function buildDraftPaginationPrintHtml(draftPaper, exportOptions = {}) {
    const images = []
    const html = buildDraftPrintHtml(draftPaper, { ...exportOptions, imageMode: 'file', images })
    if (!html || images.length === 0) return html
    return inlineFigureImages(html, images)
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
      // print-form (plan.md Must Do 1): 'a4' | 'a3', NULL (pre-migration rows,
      // or a row inserted before this cut's default logic ever ran) reads as 'a4'.
      printForm: normalizePrintForm(row.print_form),
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
    ensurePrintFormColumn(userDb)
    const row = userDb
      .prepare(
        `
        SELECT id, title, subject, status, current_marker, last_printed_at, created_at, updated_at, student_label, print_form
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
    // print-form (plan.md Must Do 2): the word-count heuristic that used to live
    // here (buildPageBreakSuggestions) is retired — pageBreakSuggestions is no
    // longer part of the draft GET response (it had zero front-end consumers;
    // see plan.md 侦察事实). The real, pagination-derived replacement is computed
    // in getDraftPaperPagination below, from the actual rendered page layout.
    const draftPaper = {
      ...rowToDraftPaperSummary(row, items),
      items,
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
      ensurePrintFormColumn(userDb)
      const rows = userDb
        .prepare(
          `
          SELECT id, title, subject, status, current_marker, last_printed_at, created_at, updated_at, student_label, print_form
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
        // print-form (plan.md Must Do 1): 卷级 PATCH 白名单. Workbench header
        // toggle only ever sends 'a4'/'a3' — anything else is a caller bug, fail
        // loud rather than silently coercing (matches this store's other input
        // validation style, e.g. addGroupToDraftPaper's ready.ok check).
        if (Object.prototype.hasOwnProperty.call(input, 'printForm')) {
          if (input.printForm !== 'a4' && input.printForm !== 'a3') throw new Error('printForm is invalid')
          userDb.prepare('UPDATE draft_papers SET print_form = ?, updated_at = datetime(\'now\') WHERE id = ? AND user_id = ?').run(input.printForm, draftPaperId, userId)
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

  // M0-4 (plan.md decision 3 + PA MF-3): getDraftPaper (called inside
  // getDraftPaperPagination below, via that function's own ownership-gated lookup)
  // already gates on (id, user_id) and throws before this function — or the
  // draftPaginationCache it shares with the preview route — ever gets touched. That
  // keeps "B borrows A's draftId through the export route" from being an
  // exfiltration vector (server/my-space/mySpaceRoutes.mjs POST /api/my-space/artifacts
  // calls this before saveMySpaceArtifact); draftPaginationCache keys stay unscoped
  // by user (plan.md decision 9 — upstream ownership check already runs before any
  // cache read/write, so there is no leak path through the shared cache).
  //
  // draft-desk-b step4 (MF-2/MF-7, plan.md "步4 — PDF 换引擎收口 + Vivliostyle
  // 草稿卷退役"): PDF export now consumes getDraftPaperPagination's pdfBytes
  // directly — the SAME paged.js render (renderPaginatedPaper, one Chromium page,
  // one page.pdf() call — see paginationRenderer.mjs's module-header contract) that
  // produced the on-screen paginated HTML, so preview/PDF parity is a construction
  // guarantee here, not something this function has to separately verify. This
  // retires the old Vivliostyle CLI pipeline that used to live in this function body
  // (execFileSync + a scratch tempdir + a real `vivliostyle build` subprocess — see
  // git history for that shape) and, with it, `recentDraftPdfExports` (the 30s-TTL
  // cache that line kept) and `draftPaperPrintSignature` (its signature function) —
  // WITHOUT migrating either (owner ruling 2026-07-12, "SW-5 由「迁移」改「退役」"):
  // draftPaginationCache (getDraftPaperPagination's own signature cache, no TTL)
  // already satisfies the real concern behind that old cache ("导出不重渲": a preview
  // fetched moments ago, or a just-completed export, hits this cache with zero
  // re-render) strictly better than a 30s TTL ever did — a TTL forces a re-render
  // after 30s even when nothing about the draft changed; a signature mismatch is the
  // only invalidation this cache needs. Running two independently-invalidated caches
  // side by side was flagged (SW-5, cr-step1-lite.md) as exactly the kind of silent-
  // staleness risk DP-title's cache-miss bug (cr-step2-lite.md) already proved this
  // cut needs to guard against — not repeated here.
  //
  // `preferRecent` is dropped from the option bag: it only ever governed
  // recentDraftPdfExports' 30s window (mySpaceRoutes.mjs's POST /api/my-space/
  // artifacts call site is updated in lockstep to stop passing it). `outputPath` on
  // the returned object is now always '' — the old value only ever pointed at a
  // scratch file THIS function wrote to `exportDir` (the Vivliostyle CLI needs a
  // real file to convert); pdfBytes now come straight out of Playwright's
  // page.pdf() as an in-memory Buffer, so there is no file for it to point at.
  // sendPdf's 'x-output-path' response header (outputPath's only consumer) has
  // always been purely informational — nothing in this repo's client code reads it
  // (confirmed by source search; see this cut's completion report) — and
  // saveMySpaceArtifact (server/my-space/mySpace.mjs) already prefers a Buffer
  // `pdfBody` over reading `sourcePdfPath` from disk, so it is unaffected by
  // outputPath going empty. `reusedRecent` on the return value now reflects
  // getDraftPaperPagination's own `reused` flag (a draftPaginationCache hit) instead
  // of a recentDraftPdfExports hit — same external meaning ("we didn't have to
  // re-render"), different (better) source.
  //
  // Async now (getDraftPaperPagination is async — it renders through Chromium) where
  // the old Vivliostyle line was synchronous (execFileSync). Both call sites
  // (draftPaperRoutes.mjs's POST .../print-pdf, mySpaceRoutes.mjs's POST
  // /api/my-space/artifacts) are updated in lockstep to await this.
  async function exportDraftPaperPdf(userId, draftPaperId, { versionType = 'student' } = {}) {
    requireUserId(userId)
    const normalizedVersionType = versionType === 'teacher' ? 'teacher' : 'student'
    const pagination = await getDraftPaperPagination(userId, draftPaperId, { versionType: normalizedVersionType })
    const draftPaper = pagination.draftPaper
    const safeTitle = String(draftPaper.title || '英语草稿卷').replace(/[\\/:*?"<>|]/g, '-')
    const versionLabel = normalizedVersionType === 'teacher' ? '教师卷' : '学生卷'
    const fileName = `${safeTitle}-${versionLabel}.pdf`
    // last_printed_at only ever bumps on an actual export (never on a bare preview
    // fetch) — kept as its own short-lived userDb connection here rather than folded
    // into getDraftPaperPagination, which the preview route also calls and which
    // must NOT bump this column.
    const userDb = openUserDatabase({ readOnly: false })
    try {
      userDb.prepare('UPDATE draft_papers SET last_printed_at = datetime(\'now\'), updated_at = datetime(\'now\') WHERE id = ? AND user_id = ?').run(draftPaperId, userId)
    } finally {
      userDb.close()
    }
    return { body: pagination.pdfBytes, fileName, outputPath: '', draftPaper, reusedRecent: pagination.reused === true }
  }

  // draft-desk-b step2/3 (MF-3/MF-4/MF-3-step3, plan.md "步2 — DOM 契约 + 缓存解耦" /
  // "步3 — 前端吃分页 HTML + 常驻叠按钮"): renders (or reuses a cached render of)
  // draftPaper through the new paged.js pipeline (paginationRenderer.mjs) and applies
  // the DOM contract (paginationDomContract.mjs) before returning. Wired to
  // GET /api/draft-papers/:id/pagination (draftPaperRoutes.mjs) as of step3.
  //
  // No dedup lock across concurrent calls for the SAME draftPaperId+versionType: two
  // overlapping cache-miss calls will both render (chromiumPool.mjs's own internal
  // queue still serializes the actual Chromium work, so this is wasteful, not
  // unsafe — the second render simply overwrites the cache entry with an
  // identical-signature result). SW-H (cr-step2-lite.md): a single-flight lock is
  // still out of scope — revisit only if it shows up as a real cost now that step3
  // actually wires concurrent requests through the route.
  async function getDraftPaperPagination(userId, draftPaperId, { versionType = 'student' } = {}) {
    requireUserId(userId)
    const normalizedVersionType = versionType === 'teacher' ? 'teacher' : 'student'
    const cacheKey = draftPaginationCacheKey(draftPaperId, normalizedVersionType)
    const userDb = openUserDatabase({ readOnly: false })
    const bankDb = openDatabase()
    try {
      const draftPaper = getDraftPaper({ userDb, bankDb }, userId, draftPaperId, { includePrintHtml: false })
      if (!draftPaper) throw new Error('Draft paper not found')
      if (!draftPaper.items.length) throw new Error('请先添加题组')

      // print-form (plan.md 裁点2): itemsByGroupId is built fresh from this call's
      // own draftPaper read regardless of cache hit/miss — printForm never enters
      // the signature below, so a print-form toggle alone must never invalidate
      // (or need to invalidate) the render cache; suggestions are cheaply
      // re-derived from whatever paginatedHtml this call ends up using.
      const itemsByGroupId = new Map(
        draftPaper.items.filter((item) => !item.groupMissing).map((item) => [item.groupId, item.id]),
      )

      const canonicalConsumption = resolveDraftCanonicalConsumption(draftPaper)
      const resolvedConsumptionSignature =
        consumptionSignature(canonicalConsumption)
      const signature = draftPaperPaginationSignature(
        draftPaper,
        normalizedVersionType,
        resolvedConsumptionSignature,
      )
      const cached = draftPaginationCacheGet(cacheKey)
      if (cached && cached.signature === signature) {
        const pageBreakSuggestions = derivePageBreakSuggestions(cached.paginatedHtml, { itemsByGroupId, printForm: draftPaper.printForm })
        return { paginatedHtml: cached.paginatedHtml, pdfBytes: cached.pdfBytes, pageCount: cached.pageCount, draftPaper, pageBreakSuggestions, reused: true, consumptionSignature: resolvedConsumptionSignature }
      }

      const html = buildDraftPaginationPrintHtml(draftPaper, {
        versionType: normalizedVersionType,
        canonicalConsumption,
      })
      if (!html) throw new Error('请先添加题组')
      const rendered = await renderPaginatedPaper(html)
      // Same non-groupMissing, item-order group id list buildDraftPaperBlocks derives
      // its question_group blocks from (see buildDraftPaperBlocks above) — this is the
      // positional contract applyPaginationDomContract's header comment documents.
      const groupIds = draftPaper.items.filter((item) => !item.groupMissing).map((item) => item.groupId)
      const paginatedHtml = applyPaginationDomContract(rendered.paginatedHtml, { groupIds, pageCount: rendered.pageCount })

      draftPaginationCacheSet(cacheKey, { signature, paginatedHtml, pdfBytes: rendered.pdfBytes, pageCount: rendered.pageCount })
      const pageBreakSuggestions = derivePageBreakSuggestions(paginatedHtml, { itemsByGroupId, printForm: draftPaper.printForm })
      return { paginatedHtml, pdfBytes: rendered.pdfBytes, pageCount: rendered.pageCount, draftPaper, pageBreakSuggestions, reused: false, consumptionSignature: resolvedConsumptionSignature }
    } finally {
      userDb.close()
      bankDb.close()
    }
  }

  // reorder-suggest (plan.md 施工契约 1/2): `GET /:id/reorder-suggestion`'s
  // store entry point. Deliberately reuses getDraftPaperPagination's own
  // cached pageBreakSuggestions for "当前分页(走现有缓存路径)" instead of
  // re-deriving them here — this call never triggers a second real render for
  // the CURRENT order, only (on a cache miss) for the bounded candidate set a
  // broken current order produces. Zero-breakage or a cache hit both return
  // fast with no dry-run at all.
  async function getReorderSuggestion(userId, draftPaperId, { versionType = 'student' } = {}) {
    requireUserId(userId)
    const normalizedVersionType = versionType === 'teacher' ? 'teacher' : 'student'
    const pagination = await getDraftPaperPagination(userId, draftPaperId, { versionType: normalizedVersionType })
    if (!pagination.pageBreakSuggestions || pagination.pageBreakSuggestions.length === 0) {
      return { suggestion: null, reused: false }
    }
    const { draftPaper } = pagination
    const signature = draftPaperPaginationSignature(
      draftPaper,
      normalizedVersionType,
      pagination.consumptionSignature,
    )
    const cacheKey = reorderSuggestionCacheKey(draftPaperId, draftPaper.printForm, signature, pagination.pageBreakSuggestions)
    // reused 与分页端点同款语义（CR MF-1 的可断言面）：null 裁决同样必须命中。
    const cached = reorderSuggestionCacheGet(cacheKey)
    if (cached !== undefined) return { suggestion: cached, reused: true }

    const suggestion = await proposeReorder(draftPaper, pagination.pageBreakSuggestions, draftPaper.printForm, {
      buildDraftPaginationPrintHtml,
      renderPaginatedPaper,
      applyPaginationDomContract,
      derivePageBreakSuggestions,
      versionType: normalizedVersionType,
    })
    reorderSuggestionCacheSet(cacheKey, suggestion)
    return { suggestion, reused: false }
  }

  return {
    addGroupToCurrentDraftPaper,
    addGroupToDraftPaper,
    buildDraftPrintHtml,
    deleteDraftPaperItem,
    exportDraftPaperPdf,
    getCurrentDraftPaperRow,
    getDraftPaper,
    getDraftPaperPagination,
    getOrCreateCurrentDraftPaper,
    getReorderSuggestion,
    listDraftPapers,
    markCurrentDraftPaper,
    migrateAssemblyBasketToDraftPaper,
    patchDraftPaperItem,
    restoreDraftPaperItem,
    updateDraftPaper,
  }
}
