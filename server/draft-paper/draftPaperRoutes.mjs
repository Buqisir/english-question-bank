import { defineRoute } from '../router/index.mjs'

function routeError(error) {
  return error instanceof Error ? error.message : String(error)
}

export function createDraftPaperRoutes() {
  return [
    defineRoute('GET', /^\/api\/draft-papers$/, ({ response, context }) => {
      context.sendJson(response, 200, { draftPapers: context.draftPaperStore.listDraftPapers() })
    }),

    defineRoute('GET', /^\/api\/draft-papers\/current$/, ({ response, url, context }) => {
      const createIfMissing = url.searchParams.get('create') === '1'
      const draftPaper = context.draftPaperStore.getOrCreateCurrentDraftPaper({ createIfMissing })
      if (!draftPaper) {
        context.sendJson(response, 404, { error: 'Current draft paper not found' })
        return
      }
      context.sendJson(response, 200, { draftPaper })
    }),

    defineRoute('POST', /^\/api\/draft-papers\/current\/items$/, async ({ request, response, context }) => {
      const input = await context.readJsonBody(request)
      try {
        const draftPaper = context.draftPaperStore.addGroupToCurrentDraftPaper(String(input.groupId || ''))
        context.sendJson(response, 201, { draftPaper })
      } catch (error) {
        context.sendJson(response, 400, { error: routeError(error) })
      }
    }),

    defineRoute('POST', /^\/api\/draft-papers\/migrate-assembly-basket$/, async ({ request, response, context }) => {
      const input = await context.readJsonBody(request, { maxBytes: 1_000_000 })
      try {
        const result = context.draftPaperStore.migrateAssemblyBasketToDraftPaper(input)
        context.sendJson(response, 201, result)
      } catch (error) {
        context.sendJson(response, 400, { error: routeError(error) })
      }
    }),

    defineRoute('GET', /^\/api\/draft-papers\/([^/]+)$/, ({ response, match, context }) => {
      const db = context.openDatabase({ readOnly: true })
      try {
        const id = decodeURIComponent(match[1])
        const draftPaper = context.draftPaperStore.getDraftPaper(db, id)
        if (!draftPaper) {
          context.sendJson(response, 404, { error: 'Draft paper not found' })
          return
        }
        context.sendJson(response, 200, { draftPaper })
      } finally {
        db.close()
      }
    }),

    defineRoute('PATCH', /^\/api\/draft-papers\/([^/]+)$/, async ({ request, response, match, context }) => {
      const input = await context.readJsonBody(request, { maxBytes: 1_000_000 })
      try {
        const draftPaper = context.draftPaperStore.updateDraftPaper(decodeURIComponent(match[1]), input)
        context.sendJson(response, 200, { draftPaper })
      } catch (error) {
        context.sendJson(response, 400, { error: routeError(error) })
      }
    }),

    defineRoute('POST', /^\/api\/draft-papers\/([^/]+)\/items$/, async ({ request, response, match, context }) => {
      const input = await context.readJsonBody(request)
      const db = context.openDatabase({ readOnly: false })
      try {
        const draftPaperId = decodeURIComponent(match[1])
        db.exec('BEGIN')
        try {
          context.draftPaperStore.addGroupToDraftPaper(db, draftPaperId, String(input.groupId || ''), {
            insertIndex: input.insertIndex,
            pageBreakBefore: input.pageBreakBefore === true,
          })
          context.draftPaperStore.markCurrentDraftPaper(db, draftPaperId)
          db.exec('COMMIT')
          context.sendJson(response, 201, { draftPaper: context.draftPaperStore.getDraftPaper(db, draftPaperId) })
        } catch (error) {
          db.exec('ROLLBACK')
          context.sendJson(response, 400, { error: routeError(error) })
        }
      } finally {
        db.close()
      }
    }),

    defineRoute('POST', /^\/api\/draft-papers\/([^/]+)\/items\/restore$/, async ({ request, response, match, context }) => {
      const input = await context.readJsonBody(request)
      try {
        const draftPaper = context.draftPaperStore.restoreDraftPaperItem(decodeURIComponent(match[1]), input)
        context.sendJson(response, 200, { draftPaper })
      } catch (error) {
        context.sendJson(response, 400, { error: routeError(error) })
      }
    }),

    defineRoute('PATCH', /^\/api\/draft-papers\/([^/]+)\/items\/([^/]+)$/, async ({ request, response, match, context }) => {
      const input = await context.readJsonBody(request)
      try {
        const draftPaper = context.draftPaperStore.patchDraftPaperItem(
          decodeURIComponent(match[1]),
          decodeURIComponent(match[2]),
          input,
        )
        context.sendJson(response, 200, { draftPaper })
      } catch (error) {
        context.sendJson(response, 400, { error: routeError(error) })
      }
    }),

    defineRoute('DELETE', /^\/api\/draft-papers\/([^/]+)\/items\/([^/]+)$/, ({ response, match, context }) => {
      try {
        const result = context.draftPaperStore.deleteDraftPaperItem(
          decodeURIComponent(match[1]),
          decodeURIComponent(match[2]),
        )
        context.sendJson(response, 200, result)
      } catch (error) {
        context.sendJson(response, 400, { error: routeError(error) })
      }
    }),

    defineRoute('GET', /^\/api\/draft-papers\/([^/]+)\/print-html$/, ({ response, match, context }) => {
      const db = context.openDatabase({ readOnly: false })
      try {
        const draftPaperId = decodeURIComponent(match[1])
        const draftPaper = context.draftPaperStore.getDraftPaper(db, draftPaperId)
        if (!draftPaper) {
          context.sendJson(response, 404, { error: 'Draft paper not found' })
          return
        }
        if (!draftPaper.items.length) {
          context.sendJson(response, 400, { error: '请先添加题组' })
          return
        }
        const html = context.draftPaperStore.buildDraftPrintHtml(draftPaper)
        response.writeHead(200, {
          'access-control-allow-origin': 'http://127.0.0.1:5173',
          'content-type': 'text/html; charset=utf-8',
          'x-file-name': encodeURIComponent(`${draftPaper.title}-学生卷.html`),
        })
        response.end(html)
      } finally {
        db.close()
      }
    }),

    defineRoute('POST', /^\/api\/draft-papers\/([^/]+)\/print-pdf$/, ({ response, match, context }) => {
      try {
        const result = context.draftPaperStore.exportDraftPaperPdf(decodeURIComponent(match[1]))
        context.sendPdf(response, result.body, result.fileName, result.outputPath)
      } catch (error) {
        const message = routeError(error)
        if (message.includes('vivliostyle') || message.includes('not found') || message.includes('ENOENT')) {
          context.sendJson(response, 503, { error: `精排 PDF 不可用: ${message}` })
        } else {
          context.sendJson(response, 400, { error: message })
        }
      }
    }),
  ]
}
