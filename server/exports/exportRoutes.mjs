import { defineRoute } from '../router/index.mjs'

function routeError(error) {
  return error instanceof Error ? error.message : String(error)
}

function sendHtml(response, { body, fileName }) {
  response.writeHead(200, {
    'access-control-allow-origin': 'http://127.0.0.1:5173',
    'content-type': 'text/html; charset=utf-8',
    'x-file-name': encodeURIComponent(fileName),
  })
  response.end(body)
}

export function createExportRoutes() {
  return [
    defineRoute('POST', /^\/api\/exports\/docx$/, async ({ request, response, context }) => {
      const input = await context.readJsonBody(request)
      const result = context.exportDocx(input)
      context.sendDocx(response, result.body, result.fileName, result.outputPath)
    }),

    defineRoute('POST', /^\/api\/exports\/pdf$/, async ({ request, response, context }) => {
      const input = await context.readJsonBody(request)
      const result = context.exportPdf(input)
      context.sendPdf(response, result.body, result.fileName, result.outputPath)
    }),

    defineRoute('POST', /^\/api\/exports\/print-html$/, async ({ request, response, context }) => {
      const input = await context.readJsonBody(request)
      const result = context.exportPrintHtml(input)
      sendHtml(response, result)
    }),

    defineRoute('POST', /^\/api\/exports\/print-pdf$/, async ({ request, response, context }) => {
      try {
        const input = await context.readJsonBody(request)
        const result = context.exportPrintPdf(input)
        context.sendPdf(response, result.body, result.fileName, result.outputPath)
      } catch (error) {
        const message = routeError(error)
        if (message.includes('vivliostyle') || message.includes('not found') || message.includes('ENOENT')) {
          context.sendJson(response, 503, { error: `精排 PDF 不可用: ${message}` })
        } else {
          context.sendJson(response, 500, { error: message })
        }
      }
    }),
  ]
}
