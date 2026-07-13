import { defineRoute } from '../router/index.mjs'

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
function sendDraftMutationError(response, context, error) {
  const message = routeError(error)
  if (NOT_FOUND_MESSAGES.has(message)) {
    context.sendJson(response, 404, { error: message })
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
  return requiredEnum(raw, ['student', 'teacher'], 'versionType')
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
        const result = await context.draftPaperStore.getDraftPaperPagination(userId, draftPaperId, { versionType })
        context.sendJson(response, 200, {
          paginatedHtml: result.paginatedHtml,
          pageCount: result.pageCount,
          reused: result.reused,
        })
      } catch (error) {
        sendDraftMutationError(response, context, error)
      }
    }),

    defineRoute('GET', /^\/api\/draft-papers\/([^/]+)\/print-html$/, ({ response, url, match, context }) => {
      const userId = context.resolveDataUserId(context)
      const userDb = context.openUserDatabase({ readOnly: true })
      const bankDb = context.openDatabase({ readOnly: true })
      try {
        const draftPaperId = decodeURIComponent(match[1])
        let versionType
        try {
          versionType = versionTypeFromQuery(url)
        } catch (error) {
          context.sendJson(response, 400, { error: routeError(error) })
          return
        }
        const draftPaper = context.draftPaperStore.getDraftPaper({ userDb, bankDb }, userId, draftPaperId, { includePrintHtml: false })
        if (!draftPaper) {
          context.sendJson(response, 404, { error: 'Draft paper not found' })
          return
        }
        if (!draftPaper.items.length) {
          context.sendJson(response, 400, { error: '请先添加题组' })
          return
        }
        const versionLabel = versionType === 'teacher' ? '教师卷' : '学生卷'
        const html = context.draftPaperStore.buildDraftPrintHtml(draftPaper, { versionType })
        if (!html) {
          context.sendJson(response, 400, { error: '请先添加题组' })
          return
        }
        response.writeHead(200, {
          'access-control-allow-origin': 'http://127.0.0.1:5173',
          'content-type': 'text/html; charset=utf-8',
          'x-file-name': encodeURIComponent(`${draftPaper.title}-${versionLabel}.html`),
        })
        response.end(html)
      } finally {
        userDb.close()
        bankDb.close()
      }
    }),

    defineRoute('POST', /^\/api\/draft-papers\/([^/]+)\/print-pdf$/, async ({ request, response, match, context }) => {
      const userId = context.resolveDataUserId(context)
      try {
        const input = await context.readJsonBody(request)
        const versionType = input.versionType === undefined
          ? 'student'
          : requiredEnum(input.versionType, ['student', 'teacher'], 'versionType')
        const result = context.draftPaperStore.exportDraftPaperPdf(userId, decodeURIComponent(match[1]), { versionType })
        context.sendPdf(response, result.body, result.fileName, result.outputPath)
      } catch (error) {
        const message = routeError(error)
        // M0-4: check the draft-not-found/not-owned message BEFORE the generic
        // 'not found' substring match below — otherwise a cross-user draftId would
        // incorrectly report 503 "精排 PDF 不可用" (vivliostyle CLI missing) instead
        // of 404, and would leak that the id exists-but-is-inaccessible differently
        // from a genuinely unknown id.
        if (NOT_FOUND_MESSAGES.has(message)) {
          context.sendJson(response, 404, { error: message })
        } else if (message.includes('vivliostyle') || message.includes('not found') || message.includes('ENOENT')) {
          context.sendJson(response, 503, { error: `精排 PDF 不可用: ${message}` })
        } else {
          context.sendJson(response, 400, { error: message })
        }
      }
    }),
  ]
}
