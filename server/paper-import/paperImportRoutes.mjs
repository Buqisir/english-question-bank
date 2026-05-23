import { parsePaperImportMultipart } from './multipart.mjs'
import { publishPaperImportPackage } from './publisher.mjs'
import { makePublicValidationReport, validatePaperImportPackage } from './validator.mjs'
import { defineRoute } from '../router/index.mjs'

function routeError(error) {
  return error instanceof Error ? error.message : String(error)
}

export function createPaperImportRoutes() {
  return [
    defineRoute('POST', /^\/api\/paper-import\/validate$/, async ({ request, response, context }) => {
      let files = []
      try {
        ;({ files } = await parsePaperImportMultipart(request))
      } catch (error) {
        context.sendJson(response, 400, { error: routeError(error) })
        return
      }
      const validation = validatePaperImportPackage(files)
      context.sendJson(response, validation.ok ? 200 : 422, { validation: makePublicValidationReport(validation) })
    }),

    defineRoute('POST', /^\/api\/paper-import\/publish$/, async ({ request, response, context }) => {
      let files = []
      try {
        ;({ files } = await parsePaperImportMultipart(request))
      } catch (error) {
        context.sendJson(response, 400, { error: routeError(error) })
        return
      }
      const db = context.openDatabase({ readOnly: false })
      try {
        const result = publishPaperImportPackage({ files, db, paperAssetsDir: context.paperAssetsDir })
        context.invalidatePaperSurfaceAnalysisAvailability()
        context.sendJson(response, result.ok ? 201 : 422, result)
      } finally {
        db.close()
      }
    }),

    defineRoute('POST', /^\/api\/paper-import\/revalidate-latest$/, ({ response, context }) => {
      context.invalidatePaperSurfaceAnalysisAvailability()
      context.sendJson(response, 200, {
        ok: true,
        analysisEntryCount: context.getPaperSurfaceAnalysisAvailabilityByGroupId().size,
      })
    }),
  ]
}
