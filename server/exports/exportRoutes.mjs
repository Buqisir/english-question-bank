import { defineRoute } from '../router/index.mjs'
import { PAPER_PDF_PRODUCTS, requirePaperPdfEdition } from '../../shared/paperPdfProducts.mjs'

function routeError(error) {
  return error instanceof Error ? error.message : String(error)
}

function sendHtml(response, { body, fileName }, headOnly = false) {
  response.writeHead(200, {
    'access-control-allow-origin': 'http://127.0.0.1:5173',
    'content-type': 'text/html; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'x-file-name': encodeURIComponent(fileName),
  })
  response.end(headOnly ? undefined : body)
}

export function createExportRoutes(exportImplementation) {
  const { sendPdf } = exportImplementation

  return [
    // Retain the address with an explicit retirement response, never silently
    // relabel teacher analyses or modelAnswer as a source-reference booklet.
    defineRoute('POST', /^\/api\/exports\/companion-analysis-(?:html|pdf)$/, ({ response, context }) => {
      context.sendJson(response, 410, { error: '配套解析导出已退役，请选择四款 PDF 产品；历史文件保持原样' })
    }),

    defineRoute('POST', /^\/api\/exports\/print-(html|pdf)$/, async ({ request, response, match, context }) => {
      try {
        const input = await context.readJsonBody(request)
        const edition = requirePaperPdfEdition(input.edition)
        const result = await context.draftPaperStore.getAssemblyPaperProduct(input)
        const name = `${result.draftPaper.title.replace(/[\\/:*?"<>|]/g, '-')}-${PAPER_PDF_PRODUCTS[edition]}`
        if (match[1] === 'html') sendHtml(response, { body: result.paginatedHtml, fileName: `${name}.html` })
        else sendPdf(response, result.pdfBytes, `${name}.pdf`, '')
      } catch (error) {
        context.sendJson(response, error?.code === 'RENDERER_MISSING' ? 503 : 400, { error: routeError(error) })
      }
    }),

    ...['GET', 'HEAD'].map(method => defineRoute(method, /^\/api\/exports\/papers\/([^/]+)\/(pdf|print)$/, async ({ request, response, url, match, context }) => {
      try {
        if (url.searchParams.has('versionType') || url.searchParams.has('pageLayout')) throw new Error('当前产品只使用 edition')
        const edition = requirePaperPdfEdition(url.searchParams.get('edition'))
        const result = await context.draftPaperStore.getPublishedPaperProduct(decodeURIComponent(match[1]), edition,
          url.searchParams.get('publicationDigest'))
        const name = `${result.draftPaper.title.replace(/[\\/:*?"<>|]/g, '-')}-${PAPER_PDF_PRODUCTS[edition]}`
        response.setHeader('cache-control', 'private, no-store')
        if (match[2] === 'print') sendHtml(response, { body: result.paginatedHtml, fileName: `${name}.html` }, request.method === 'HEAD')
        else {
          response.writeHead(200, { 'content-type': 'application/pdf',
            'content-length': result.pdfBytes.length,
            'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(`${name}.pdf`)}`,
            'x-file-name': encodeURIComponent(`${name}.pdf`) })
          response.end(request.method === 'HEAD' ? undefined : result.pdfBytes)
        }
      } catch (error) {
        context.sendJson(response, error?.code === 'RENDERER_MISSING' ? 503 : 400, { error: routeError(error) })
      }
    })),
  ]
}
