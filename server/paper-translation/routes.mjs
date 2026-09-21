import { randomUUID } from 'node:crypto'
import { defineRoute, readJsonRouteBody } from '../router/index.mjs'
import { MAX_BODY_BYTES } from '../../shared/paper-selection/constants.mjs'
import { assertJsonContentType, assertSameOrigin } from './csrf.mjs'
import { createPaperTranslationRuntime, userMessageFor } from './translateService.mjs'

function sendPrivateJson(response, status, body) {
  response.writeHead(status, {
    'cache-control': 'private, no-store',
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': 'http://127.0.0.1:5173',
    'access-control-allow-credentials': 'true',
  })
  response.end(JSON.stringify(body))
}

export function createPaperTranslationRoutes() {
  return [
    defineRoute('GET', /^\/api\/paper-translation\/status$/, ({ response, context }) => {
      const runtime = context.paperTranslation
      const status = runtime.capability(context)
      sendPrivateJson(response, 200, status)
    }),
    defineRoute('POST', /^\/api\/paper-translation\/translate$/, async ({ request, response, context }) => {
      const runtime = context.paperTranslation
      const requestId = randomUUID()
      try {
        assertSameOrigin(request, { publicOrigin: runtime.config.publicOrigin })
        assertJsonContentType(request)
        let body
        try {
          body = await readJsonRouteBody(request, { maxBytes: MAX_BODY_BYTES })
        } catch (error) {
          const tooLarge = error?.message === 'Request body too large'
          sendPrivateJson(response, tooLarge ? 413 : 400, {
            error: tooLarge ? 'Request body too large' : 'Invalid JSON body',
            code: tooLarge ? 'SELECTION_LIMIT' : 'SELECTION_REQUEST_INVALID',
            requestId,
          })
          return
        }
        const userId = context.resolveDataUserId(context)
        const result = await runtime.translate({
          body,
          context,
          requestId,
          userId,
        })
        sendPrivateJson(response, 200, result)
      } catch (error) {
        const status = Number.isInteger(error.status) ? error.status : 500
        sendPrivateJson(response, status, error.body || {
          error: userMessageFor(error.code),
          code: error.code || 'TRANSLATION_FAILED',
          requestId,
          retryable: Boolean(error.retryable),
        })
      }
    }),
  ]
}

export { createPaperTranslationRuntime }
