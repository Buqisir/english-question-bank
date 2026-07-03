import { defineRoute } from '../router/index.mjs'

function routeError(error) {
  return error instanceof Error ? error.message : String(error)
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

    defineRoute('GET', /^\/api\/draft-papers\/([^/]+)$/, ({ response, url, match, context }) => {
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
        const draftPaper = context.draftPaperStore.getDraftPaper({ userDb, bankDb }, id, { versionType })
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
      const userDb = context.openUserDatabase({ readOnly: false })
      const bankDb = context.openDatabase({ readOnly: true })
      try {
        const draftPaperId = decodeURIComponent(match[1])
        userDb.exec('BEGIN')
        try {
          context.draftPaperStore.addGroupToDraftPaper({ userDb, bankDb }, draftPaperId, String(input.groupId || ''), {
            insertIndex: input.insertIndex,
            pageBreakBefore: input.pageBreakBefore === true,
          })
          context.draftPaperStore.markCurrentDraftPaper(userDb, draftPaperId)
          userDb.exec('COMMIT')
          context.sendJson(response, 201, { draftPaper: context.draftPaperStore.getDraftPaper({ userDb, bankDb }, draftPaperId) })
        } catch (error) {
          userDb.exec('ROLLBACK')
          context.sendJson(response, 400, { error: routeError(error) })
        }
      } finally {
        userDb.close()
        bankDb.close()
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

    defineRoute('GET', /^\/api\/draft-papers\/([^/]+)\/print-html$/, ({ response, url, match, context }) => {
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
        const draftPaper = context.draftPaperStore.getDraftPaper({ userDb, bankDb }, draftPaperId, { includePrintHtml: false })
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
      try {
        const input = await context.readJsonBody(request)
        const versionType = input.versionType === undefined
          ? 'student'
          : requiredEnum(input.versionType, ['student', 'teacher'], 'versionType')
        const result = context.draftPaperStore.exportDraftPaperPdf(decodeURIComponent(match[1]), { versionType })
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
