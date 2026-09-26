import { randomUUID } from 'node:crypto'
import { defineRoute, readJsonRouteBody } from '../router/index.mjs'
import { assertJsonContentType, assertSameOrigin } from '../paper-translation/csrf.mjs'
import { resolveDataUserId } from '../auth/auth.mjs'
import { NOTEBOOK_BODY_LIMIT } from '../../shared/vocabulary-notebook/constants.mjs'

function send(response, status, body) {
  if (response.destroyed || response.writableEnded) return
  response.writeHead(status, {
    'cache-control': 'private, no-store',
    'content-type': 'application/json; charset=utf-8',
  })
  response.end(JSON.stringify(body))
}

function userIdFrom(context) {
  return resolveDataUserId(context)
}

export function createVocabularyNotebookRoutes() {
  return [
    defineRoute('GET', /^\/api\/vocabulary-notebook\/status$/, ({ response, context }) => {
      send(response, 200, context.vocabularyNotebook.capability())
    }),
    defineRoute('GET', /^\/api\/vocabulary-notebook\/papers$/, ({ response, context }) => {
      send(response, 200, context.vocabularyNotebook.listPapers(userIdFrom(context)))
    }),
    defineRoute('GET', /^\/api\/vocabulary-notebook\/papers\/([^/]+)$/, ({ response, context, match }) => {
      send(response, 200, context.vocabularyNotebook.listPaper(userIdFrom(context), decodeURIComponent(match[1])))
    }),
    defineRoute('POST', /^\/api\/vocabulary-notebook\/selection-state$/, async ({ request, response, context }) => {
      await post(request, response, context, (runtime, userId, body) => runtime.selectionState(userId, body))
    }),
    defineRoute('POST', /^\/api\/vocabulary-notebook\/contexts$/, async ({ request, response, context }) => {
      await post(request, response, context, (runtime, userId, body) => runtime.add(userId, body))
    }),
    defineRoute('POST', /^\/api\/vocabulary-notebook\/contexts\/([^/]+)\/enrich$/, async ({ request, response, context, match }) => {
      const runtime = context.vocabularyNotebook
      const requestId = randomUUID()
      const controller = new AbortController()
      response.once?.('close', () => {
        if (!response.writableEnded) controller.abort()
      })
      try {
        assertSameOrigin(request, { publicOrigin: runtimePublicOrigin(context) })
        const result = await runtime.enrich(userIdFrom(context), decodeURIComponent(match[1]), {
          context,
          signal: controller.signal,
          requestId,
        })
        send(response, 200, result)
      } catch (error) {
        send(response, error.status || 500, { error: error.message, code: error.code || 'NOTEBOOK_FAILED', requestId })
      }
    }),
    defineRoute('DELETE', /^\/api\/vocabulary-notebook\/contexts\/([^/]+)$/, ({ response, context, match }) => {
      try {
        send(response, 200, context.vocabularyNotebook.deleteContext(userIdFrom(context), decodeURIComponent(match[1])))
      } catch (error) {
        send(response, error.status || 500, { error: error.message, code: error.code || 'NOTEBOOK_FAILED' })
      }
    }),
    defineRoute('DELETE', /^\/api\/vocabulary-notebook\/entries\/([^/]+)$/, ({ response, context, match }) => {
      try {
        send(response, 200, context.vocabularyNotebook.deleteEntry(userIdFrom(context), decodeURIComponent(match[1])))
      } catch (error) {
        send(response, error.status || 500, { error: error.message, code: error.code || 'NOTEBOOK_FAILED' })
      }
    }),
  ]
}

function runtimePublicOrigin(context) {
  return context.paperTranslation?.config?.publicOrigin || ''
}

async function post(request, response, context, run) {
  const requestId = randomUUID()
  try {
    assertSameOrigin(request, { publicOrigin: runtimePublicOrigin(context) })
    assertJsonContentType(request)
    const body = await readJsonRouteBody(request, { maxBytes: NOTEBOOK_BODY_LIMIT })
    send(response, 200, await run(context.vocabularyNotebook, userIdFrom(context), body))
  } catch (error) {
    const tooLarge = error?.message === 'Request body too large'
    send(response, tooLarge ? 413 : (error.status || 400), {
      error: tooLarge ? '请求太大' : (error.message || '加入生词本失败'),
      code: tooLarge ? 'NOTEBOOK_LIMIT' : (error.code || 'NOTEBOOK_REQUEST_INVALID'),
      requestId,
    })
  }
}
