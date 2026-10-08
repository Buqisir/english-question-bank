import { defineRoute } from '../router/index.mjs'
import { PAPER_PDF_PRODUCTS, requirePaperPdfEdition } from '../../shared/paperPdfProducts.mjs'

function routeError(error) {
  return error instanceof Error ? error.message : String(error)
}

// M0-4 (docs/cuts/m0-4-user-scope/plan.md verification 2): "B uses A's draftId/itemId"
// must 404, not 400 — the store now throws the same "not found" message for both
// "genuinely does not exist" and "exists but belongs to someone else" (never leaking
// which case it is). Routes that touch an existing draft/item via mutation
// (PATCH/DELETE/restore) previously funneled every store error into a flat 400;
// this helper carves out the not-found messages into 404 while everything else
// (validation errors like "groupId is required") still maps to 400.
const NOT_FOUND_MESSAGES = new Set(['Draft paper not found', 'Draft item not found'])

// Renderer/deploy-broken signal. resolvePagedjsPolyfillPath (paginationRenderer.mjs)
// and the chromium.launch wrapper (chromiumPool.mjs) set this code on the errors they
// throw so routes can classify "renderer unavailable" (503) by a typed code instead
// of substring-matching "not found" — which would also match the per-item data error
// "questionGroupId not found: <id>" thrown on the same export path by
// resolveDraftExportItems (draftPaperStore.mjs). ENOENT is kept as a fallback for
// unwrapped filesystem errors from the renderer toolchain (e.g. a polyfill file
// that existed at resolve time but vanished before page.addScriptTag read it),
// matched by `error.code === 'ENOENT'` (Node's native fs error code) and NEVER by
// substring — a substring test would also match that data error when the echoed
// user-supplied `groupId` happens to contain the literal "ENOENT".
const RENDERER_MISSING_CODE = 'RENDERER_MISSING'

// Shared classifier for every draft route that can throw on the export/render path
// (POST /:id/print-pdf, GET /:id/pagination, PATCH /:id, item mutations). Guarantees
// one throw yields one status across the route family:
//   404 — draft/item does not exist or is not owned by the caller (NOT_FOUND_MESSAGES)
//   503 — the paged.js/Chromium renderer is unavailable (error.code RENDERER_MISSING or
//         ENOENT), enveloped as "精排 PDF 不可用: <message>"
//   400 — everything else, incl. per-item data errors ("questionGroupId not found:
//         <id>") and validation errors ("请先添加题组", "groupId is required")
// Both 503 classifiers key off `error.code` (a typed property), never a message
// substring — `questionGroupId not found: <id>` is a plain Error with no `code`
// (thrown by addGroupToDraftPaper with a user-supplied `groupId` echoed verbatim),
// so it falls through to 400 even when `<id>` happens to contain the substring
// "ENOENT". The print-pdf route previously had its own inline
// `message.includes('not found')` 503 carve-out that over-matched "questionGroupId
// not found" (a data error) and diverged from this helper's 400 on the sibling
// pagination route for the same throw.
function sendDraftMutationError(response, context, error) {
  const message = routeError(error)
  if (NOT_FOUND_MESSAGES.has(message)) {
    context.sendJson(response, 404, { error: message })
    return
  }
  if (error?.code === RENDERER_MISSING_CODE || error?.code === 'ENOENT') {
    context.sendJson(response, 503, { error: `精排 PDF 不可用: ${message}` })
    return
  }
  context.sendJson(response, 400, { error: message })
}

function requiredEnum(value, allowed, label) {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new Error(`${label} is invalid`)
  }

  return value
}

function versionTypeFromQuery(url) {
  const raw = url.searchParams.get('versionType')
  if (raw === null) return 'student'
  if (raw === 'teacher') throw new Error('当前教师卷生成入口已退役，请选择四款 PDF 产品')
  return requiredEnum(raw, ['student'], 'versionType')
}

export function createDraftPaperRoutes() {
  return [
    defineRoute('GET', /^\/api\/draft-papers$/, ({ response, context }) => {
      const userId = context.resolveDataUserId(context)
      context.sendJson(response, 200, { draftPapers: context.draftPaperStore.listDraftPapers(userId) })
    }),

    defineRoute('GET', /^\/api\/draft-papers\/current$/, ({ response, url, context }) => {
      const userId = context.resolveDataUserId(context)
      const createIfMissing = url.searchParams.get('create') === '1'
      const draftPaper = context.draftPaperStore.getOrCreateCurrentDraftPaper(userId, { createIfMissing })
      if (!draftPaper) {
        context.sendJson(response, 404, { error: 'Current draft paper not found' })
        return
      }
      context.sendJson(response, 200, { draftPaper })
    }),

    defineRoute('POST', /^\/api\/draft-papers\/current\/items$/, async ({ request, response, context }) => {
      const userId = context.resolveDataUserId(context)
      const input = await context.readJsonBody(request)
      try {
        const draftPaper = context.draftPaperStore.addGroupToCurrentDraftPaper(userId, String(input.groupId || ''))
        context.sendJson(response, 201, { draftPaper })
      } catch (error) {
        context.sendJson(response, 400, { error: routeError(error) })
      }
    }),

    defineRoute('POST', /^\/api\/draft-papers\/migrate-assembly-basket$/, async ({ request, response, context }) => {
      const userId = context.resolveDataUserId(context)
      const input = await context.readJsonBody(request, { maxBytes: 1_000_000 })
      try {
        const result = context.draftPaperStore.migrateAssemblyBasketToDraftPaper(userId, input)
        context.sendJson(response, 201, result)
      } catch (error) {
        context.sendJson(response, 400, { error: routeError(error) })
      }
    }),

    defineRoute('GET', /^\/api\/draft-papers\/([^/]+)$/, ({ response, url, match, context }) => {
      const userId = context.resolveDataUserId(context)
      const userDb = context.openUserDatabase({ readOnly: true })
      const bankDb = context.openDatabase({ readOnly: true })
      try {
        const id = decodeURIComponent(match[1])
        let versionType
        try {
          versionType = versionTypeFromQuery(url)
        } catch (error) {
          context.sendJson(response, 400, { error: routeError(error) })
          return
        }
        const draftPaper = context.draftPaperStore.getDraftPaper({ userDb, bankDb }, userId, id, { versionType })
        if (!draftPaper) {
          context.sendJson(response, 404, { error: 'Draft paper not found' })
          return
        }
        context.sendJson(response, 200, { draftPaper })
      } finally {
        userDb.close()
        bankDb.close()
      }
    }),

    defineRoute('PATCH', /^\/api\/draft-papers\/([^/]+)$/, async ({ request, response, match, context }) => {
      const userId = context.resolveDataUserId(context)
      const input = await context.readJsonBody(request, { maxBytes: 1_000_000 })
      try {
        const draftPaper = context.draftPaperStore.updateDraftPaper(userId, decodeURIComponent(match[1]), input)
        context.sendJson(response, 200, { draftPaper })
      } catch (error) {
        sendDraftMutationError(response, context, error)
      }
    }),

    defineRoute('POST', /^\/api\/draft-papers\/([^/]+)\/items$/, async ({ request, response, match, context }) => {
      const userId = context.resolveDataUserId(context)
      const input = await context.readJsonBody(request)
      const userDb = context.openUserDatabase({ readOnly: false })
      const bankDb = context.openDatabase({ readOnly: true })
      try {
        const draftPaperId = decodeURIComponent(match[1])
        userDb.exec('BEGIN')
        try {
          try {
            context.draftPaperStore.addGroupToDraftPaper({ userDb, bankDb }, userId, draftPaperId, String(input.groupId || ''), {
              insertIndex: input.insertIndex,
              pageBreakBefore: input.pageBreakBefore === true,
            })
            context.draftPaperStore.markCurrentDraftPaper(userDb, userId, draftPaperId)
            userDb.exec('COMMIT')
          } catch (error) {
            userDb.exec('ROLLBACK')
            throw error
          }
          // ROLLBACK-after-COMMIT fix (draft-numbering-style, same pattern as
          // d51eab2's fix to draftPaperStore.mjs's five sibling functions):
          // this post-COMMIT getDraftPaper call re-renders print HTML and can
          // throw (e.g. the print-renderer consistency assertion) — it must
          // sit OUTSIDE the BEGIN/COMMIT try-block above, or a render failure
          // here would hit the outer catch below and attempt a SECOND
          // ROLLBACK on an already-committed transaction ("cannot rollback -
          // no transaction is active"), masking the real error.
          context.sendJson(response, 201, { draftPaper: context.draftPaperStore.getDraftPaper({ userDb, bankDb }, userId, draftPaperId) })
        } catch (error) {
          sendDraftMutationError(response, context, error)
        }
      } finally {
        userDb.close()
        bankDb.close()
      }
    }),

    defineRoute('POST', /^\/api\/draft-papers\/([^/]+)\/items\/restore$/, async ({ request, response, match, context }) => {
      const userId = context.resolveDataUserId(context)
      const input = await context.readJsonBody(request)
      try {
        const draftPaper = context.draftPaperStore.restoreDraftPaperItem(userId, decodeURIComponent(match[1]), input)
        context.sendJson(response, 200, { draftPaper })
      } catch (error) {
        sendDraftMutationError(response, context, error)
      }
    }),

    defineRoute('PATCH', /^\/api\/draft-papers\/([^/]+)\/items\/([^/]+)$/, async ({ request, response, match, context }) => {
      const userId = context.resolveDataUserId(context)
      const input = await context.readJsonBody(request)
      try {
        const draftPaper = context.draftPaperStore.patchDraftPaperItem(
          userId,
          decodeURIComponent(match[1]),
          decodeURIComponent(match[2]),
          input,
        )
        context.sendJson(response, 200, { draftPaper })
      } catch (error) {
        sendDraftMutationError(response, context, error)
      }
    }),

    defineRoute('DELETE', /^\/api\/draft-papers\/([^/]+)\/items\/([^/]+)$/, ({ response, match, context }) => {
      const userId = context.resolveDataUserId(context)
      try {
        const result = context.draftPaperStore.deleteDraftPaperItem(
          userId,
          decodeURIComponent(match[1]),
          decodeURIComponent(match[2]),
        )
        context.sendJson(response, 200, result)
      } catch (error) {
        sendDraftMutationError(response, context, error)
      }
    }),

    // draft-desk-b step3 (MF-3, plan.md "步3 — 前端吃分页 HTML + 常驻叠按钮"):
    // exposes draftPaperStore.getDraftPaperPagination (added step2, unwired until
    // now) so the workbench's A4 preview iframe can consume server-rendered,
    // DOM-contract-tagged (`.preview-page` + `data-group-id`) paginated HTML instead
    // of building its own client-side pagination. Same read-then-render shape as the
    // print-html route below, but async (getDraftPaperPagination self-opens/closes
    // its own db connections — see draftPaperStore.mjs) and never returns pdfBytes
    // (that stays PDF-export-only, step4 scope) — only what the iframe needs.
    defineRoute('GET', /^\/api\/draft-papers\/([^/]+)\/pagination$/, async ({ response, url, match, context }) => {
      const userId = context.resolveDataUserId(context)
      const draftPaperId = decodeURIComponent(match[1])
      let versionType
      try {
        versionType = versionTypeFromQuery(url)
      } catch (error) {
        context.sendJson(response, 400, { error: routeError(error) })
        return
      }
      try {
        if (url.searchParams.has('edition') && url.searchParams.has('versionType')) throw new Error('edition 不与 versionType 混用')
        const result = url.searchParams.has('edition')
          ? await context.draftPaperStore.getDraftPaperProductPagination(userId, draftPaperId,
            requirePaperPdfEdition(url.searchParams.get('edition')))
          : await context.draftPaperStore.getDraftPaperPagination(userId, draftPaperId, { versionType })
        context.sendJson(response, 200, {
          paginatedHtml: result.paginatedHtml,
          pageCount: result.pageCount,
          reused: result.reused,
          // print-form (plan.md Must Do 2): additive — real, pagination-derived
          // replacement for the retired draftPaper.pageBreakSuggestions heuristic.
          pageBreakSuggestions: result.pageBreakSuggestions,
        })
      } catch (error) {
        sendDraftMutationError(response, context, error)
      }
    }),

    // reorder-suggest (docs/cuts/reorder-suggest/plan.md 施工契约 2): same
    // auth / user-isolation / versionType shape as the pagination route right
    // above — a bare read-only GET, no request body, versionType optional
    // (defaults 'student'). Never mutates anything (getReorderSuggestion's own
    // dry-run path is zero-write, see draftPaperStore.mjs's doc comment).
    defineRoute('GET', /^\/api\/draft-papers\/([^/]+)\/reorder-suggestion$/, async ({ response, url, match, context }) => {
      const userId = context.resolveDataUserId(context)
      const draftPaperId = decodeURIComponent(match[1])
      let versionType
      try {
        versionType = versionTypeFromQuery(url)
      } catch (error) {
        context.sendJson(response, 400, { error: routeError(error) })
        return
      }
      try {
        if (url.searchParams.has('edition') && url.searchParams.has('versionType')) throw new Error('edition 不与 versionType 混用')
        const options = url.searchParams.has('edition')
          ? { edition: requirePaperPdfEdition(url.searchParams.get('edition')) } : { versionType }
        const result = await context.draftPaperStore.getReorderSuggestion(userId, draftPaperId, options)
        context.sendJson(response, 200, { suggestion: result.suggestion, reused: result.reused === true })
      } catch (error) {
        sendDraftMutationError(response, context, error)
      }
    }),

    defineRoute('GET', /^\/api\/draft-papers\/([^/]+)\/print-html$/, async ({ response, url, match, context }) => {
      const userId = context.resolveDataUserId(context)
      try {
        if (url.searchParams.has('versionType') || url.searchParams.has('pageLayout')) throw new Error('当前产品只使用 edition')
        const edition = requirePaperPdfEdition(url.searchParams.get('edition'))
        const result = await context.draftPaperStore.getDraftPaperProductPagination(userId, decodeURIComponent(match[1]), edition)
        response.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'private, no-store',
          'x-file-name': encodeURIComponent(`${result.draftPaper.title}-${PAPER_PDF_PRODUCTS[edition]}.html`),
        })
        response.end(result.paginatedHtml)
      } catch (error) {
        sendDraftMutationError(response, context, error)
      }
    }),

    defineRoute('POST', /^\/api\/draft-papers\/([^/]+)\/print-pdf$/, async ({ request, response, match, context }) => {
      const userId = context.resolveDataUserId(context)
      try {
        const input = await context.readJsonBody(request)
        if (input.versionType !== undefined || input.pageLayout !== undefined) {
          throw new Error('当前 PDF 使用 edition；旧学生／教师卷生成入口已退役')
        }
        const edition = requirePaperPdfEdition(input.edition)
        // draft-desk-b step4 (MF-2/MF-7): exportDraftPaperPdf is now async (it
        // renders through the same Chromium/paged.js pipeline as the pagination
        // route, via getDraftPaperPagination — see draftPaperStore.mjs) where the
        // old Vivliostyle CLI line was synchronous (execFileSync).
        const result = await context.draftPaperStore.exportDraftPaperPdf(userId, decodeURIComponent(match[1]), { edition })
        if (edition !== 'answerOnly') {
          response.setHeader('x-paper-crossing-group-count', String(result.crossingGroupCount ?? 0))
          response.setHeader('x-paper-split-option-bank-count', String(result.splitOptionBankCount ?? 0))
          if (result.fontSizePt) response.setHeader('x-paper-font-size-pt', String(result.fontSizePt))
        }
        context.sendPdf(response, result.body, result.fileName, result.outputPath)
      } catch (error) {
        // Shared with the sibling pagination route (GET /:id/pagination) and every
        // item-mutation route: NOT_FOUND_MESSAGES → 404, RENDERER_MISSING/ENOENT →
        // 503 "精排 PDF 不可用", everything else (incl. the per-item data error
        // "questionGroupId not found: <id>") → 400. The previous inline classifier
        // used `message.includes('not found')` for the 503 lane, which over-matched
        // that data error and diverged from the sibling route's 400 for the same
        // throw — see sendDraftMutationError's doc comment.
        sendDraftMutationError(response, context, error)
      }
    }),

  ]
}
