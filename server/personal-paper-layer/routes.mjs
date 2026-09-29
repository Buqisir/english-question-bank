import { randomUUID } from 'node:crypto'
import { defineRoute, readJsonRouteBody } from '../router/index.mjs'
import { assertJsonContentType, assertSameOrigin } from '../paper-translation/csrf.mjs'
import { resolveDataUserId } from '../auth/auth.mjs'
import { sendUserSpacePdf } from '../my-space/mySpace.mjs'
import { PERSONAL_LAYER_MAX_REQUEST_BYTES } from '../../shared/personal-paper-layer/index.mjs'

function send(response, status, body, headers = {}) {
  if (response.destroyed || response.writableEnded) return
  response.writeHead(status, {
    'cache-control': 'private, no-store',
    'content-type': 'application/json; charset=utf-8',
    ...headers,
  })
  response.end(JSON.stringify(body))
}

function sendError(response, error, requestId) {
  const tooLarge = error?.message === 'Request body too large'
  const badJson = error?.message === 'Invalid JSON body'
  const status = tooLarge ? 413 : badJson ? 400 : (error?.status || 500)
  // Unexpected failures never echo internals or personal text back to the client.
  const message = status >= 500
    ? (error?.code === 'PERSONAL_LAYOUT_RENDER_FAILED' ? error.message : '批注服务暂时出错')
    : (tooLarge ? '这批修改太大' : error.message)
  send(response, status, {
    error: message,
    code: tooLarge ? 'PERSONAL_LAYER_LIMIT' : badJson ? 'PERSONAL_LAYER_REQUEST_INVALID' : (error?.code || 'PERSONAL_LAYER_FAILED'),
    details: status < 500 && error?.details !== undefined && !Array.isArray(error.details) ? error.details : undefined,
    // Per-object export refusals (422) list ids and codes only; the array
    // shape is deliberate so bulk details never leak through `details`.
    diagnostics: status < 500 && Array.isArray(error?.diagnostics) ? error.diagnostics : undefined,
    requestId,
  })
}

function publicOrigin(context) {
  return context.paperTranslation?.config?.publicOrigin || ''
}

function paperIdFrom(match) {
  try {
    return decodeURIComponent(match[1])
  } catch {
    return ''
  }
}

function fileIdFrom(match) {
  try {
    return decodeURIComponent(match[2])
  } catch {
    return ''
  }
}

// Every route here needs a signed-in member: none is in AUTH_PUBLIC_ROUTES, and
// the owner is resolved only from the session, never from the request.
export function createPersonalPaperLayerRoutes() {
  return [
    defineRoute('GET', /^\/api\/personal-paper-layers\/([^/]+)$/, ({ response, context, url, match }) => {
      const requestId = randomUUID()
      try {
        const sourceRevision = url.searchParams.get('sourceRevision') || undefined
        send(response, 200, context.personalPaperLayer.read(resolveDataUserId(context), {
          paperId: paperIdFrom(match),
          sourceRevision,
        }))
      } catch (error) {
        sendError(response, error, requestId)
      }
    }),
    defineRoute('GET', /^\/api\/personal-paper-layers\/([^/]+)\/layout$/, async ({ request, response, context, url, match }) => {
      const requestId = randomUUID()
      try {
        // A cross-site page must not be able to spend server renders on a member's session.
        if (request.headers['sec-fetch-site'] === 'cross-site' || request.headers.origin) {
          assertSameOrigin(request, { publicOrigin: publicOrigin(context) })
        }
        const { body, cache } = await context.personalPaperLayout.getLayout(resolveDataUserId(context), {
          paperId: paperIdFrom(match),
          sourceRevision: url.searchParams.get('sourceRevision') || undefined,
        })
        send(response, 200, body, { 'x-personal-layout-cache': cache })
      } catch (error) {
        sendError(response, error, requestId)
      }
    }),
    defineRoute('POST', /^\/api\/personal-paper-layers\/([^/]+)\/operations$/, async ({ request, response, context, match }) => {
      const requestId = randomUUID()
      try {
        assertSameOrigin(request, { publicOrigin: publicOrigin(context) })
        assertJsonContentType(request)
        const body = await readJsonRouteBody(request, { maxBytes: PERSONAL_LAYER_MAX_REQUEST_BYTES })
        send(response, 200, context.personalPaperLayer.commit(resolveDataUserId(context), paperIdFrom(match), body))
      } catch (error) {
        sendError(response, error, requestId)
      }
    }),
    defineRoute('POST', /^\/api\/personal-paper-layers\/([^/]+)\/exports$/, async ({ request, response, context, match }) => {
      const requestId = randomUUID()
      try {
        // Same CSRF and auth seams as the layer routes above: the owner comes
        // from the session, never from the body.
        assertSameOrigin(request, { publicOrigin: publicOrigin(context) })
        assertJsonContentType(request)
        const body = await readJsonRouteBody(request, { maxBytes: PERSONAL_LAYER_MAX_REQUEST_BYTES })
        send(response, 200, await context.personalPaperExport.create(resolveDataUserId(context), paperIdFrom(match), body))
      } catch (error) {
        sendError(response, error, requestId)
      }
    }),
    defineRoute('GET', /^\/api\/personal-paper-layers\/([^/]+)\/exports\/([^/]+)\.pdf$/, async ({ response, context, match }) => {
      const requestId = randomUUID()
      try {
        // Same auth seam as the POST above: the file is looked up by the
        // session's user id, the paperId in the path AND the file id — any
        // other combination is the same 404 (no existence leak).
        const file = context.personalPaperExport.resolveDownload(
          resolveDataUserId(context),
          paperIdFrom(match),
          fileIdFrom(match),
        )
        if (!file) {
          send(response, 404, { error: 'PDF file not found', code: 'PERSONAL_EXPORT_FILE_NOT_FOUND', requestId })
          return
        }
        sendUserSpacePdf(response, file.body, file.fileName, { disposition: 'attachment' })
      } catch (error) {
        sendError(response, error, requestId)
      }
    }),
  ]
}
