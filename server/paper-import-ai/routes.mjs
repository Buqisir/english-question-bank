import { parsePaperImportMultipart } from '../paper-import/multipart.mjs'
import { defineRoute } from '../router/index.mjs'
import { parseReadingDocxBuffer } from './docxSplitter.mjs'

const I1_PARSE_LIMITS = {
  maxFiles: 1,
  maxFileBytes: 8_000_000,
  maxTotalBytes: 8_000_000,
}

function routeError(error) {
  return error instanceof Error ? error.message : String(error)
}

function isDocxFile(file) {
  return /\.docx$/i.test(file?.fileName || '')
}

export function createPaperImportAiRoutes() {
  return [
    defineRoute('POST', /^\/api\/paper-import-ai\/parse$/, async ({ request, response, context }) => {
      let files = []
      try {
        ;({ files } = await parsePaperImportMultipart(request, { limits: I1_PARSE_LIMITS }))
      } catch (error) {
        context.sendJson(response, 400, { error: routeError(error) })
        return
      }

      const docxFiles = files.filter(isDocxFile)
      if (docxFiles.length !== 1) {
        context.sendJson(response, 400, { error: '请上传一个 .docx 试卷文件。' })
        return
      }

      try {
        const result = await parseReadingDocxBuffer(docxFiles[0].buffer, {
          sourceFilename: docxFiles[0].fileName,
        })
        context.sendJson(response, 200, result)
      } catch (error) {
        context.sendJson(response, 422, { error: routeError(error) })
      }
    }),
  ]
}
