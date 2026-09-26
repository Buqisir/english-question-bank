import { randomUUID } from 'node:crypto'
import { defineRoute, readJsonRouteBody } from '../router/index.mjs'
import { MAX_DICTIONARY_BODY_BYTES } from '../../shared/paper-dictionary/constants.mjs'
import { assertJsonContentType, assertSameOrigin } from '../paper-translation/csrf.mjs'
import { createPaperDictionaryRuntime } from './runtime.mjs'

function sendPrivateJson(response, status, body) {
  if (response.destroyed || response.writableEnded) return
  response.writeHead(status, {
    'cache-control': 'private, no-store',
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': 'http://127.0.0.1:5173',
    'access-control-allow-credentials': 'true',
  })
  response.end(JSON.stringify(body))
}

function userMessage(code) {
  switch (code) {
    case 'not_authenticated':
      return '请先登录后再查词'
    case 'DICTIONARY_UNAVAILABLE':
      return '词典暂不可用'
    case 'DICTIONARY_RATE_LIMITED':
      return '查词正忙，请稍后再试'
    case 'SELECTION_SOURCE_MISMATCH':
    case 'SELECTION_SOURCE_UNAVAILABLE':
      return '试卷来源已更新，请重新选择'
    case 'SENSE_UNAVAILABLE':
      return '本文义暂不可用'
    case 'SENSE_BUDGET_EXHAUSTED':
      return '本月本文义额度已用完，已缓存的结果仍可查看'
    case 'SENSE_RATE_LIMITED':
    case 'TRANSLATION_USER_RATE_LIMIT':
    case 'TRANSLATION_GLOBAL_RATE_LIMIT':
    case 'TRANSLATION_QUEUE_TIMEOUT':
    case 'TRANSLATION_INFLIGHT_LIMIT':
      return '本文义正忙，请稍后再试'
    case 'SENSE_TIMEOUT':
      return '本文义超时，请重试'
    case 'SENSE_BAD_REPLY':
    case 'SENSE_BAD_PAYLOAD':
    case 'SENSE_EMPTY':
    case 'SENSE_TRUNCATED':
    case 'SENSE_INCOMPLETE':
    case 'SENSE_MODEL_MISMATCH':
    case 'SENSE_USAGE_MISSING':
    case 'SENSE_UPSTREAM_ERROR':
    case 'SENSE_UPSTREAM_UNREACHABLE':
    case 'SENSE_PROVIDER_AUTH':
      return '本文义暂时没有得到'
    default:
      return '这个选择暂时不能查词'
  }
}

// 翻译/本文义路由同一套中断接线：客户端断开就取消上行调用。
function abortOnDisconnect(request, response) {
  const controller = new AbortController()
  const onAborted = () => controller.abort()
  const onClose = () => {
    if (!response.writableEnded) controller.abort()
  }
  request.once?.('aborted', onAborted)
  response.once?.('close', onClose)
  if (request.aborted || response.destroyed) controller.abort()
  return {
    signal: controller.signal,
    dispose() {
      request.off?.('aborted', onAborted)
      response.off?.('close', onClose)
    },
  }
}

export function createPaperDictionaryRoutes() {
  return [
    defineRoute('GET', /^\/api\/paper-dictionary\/status$/, ({ response, context }) => {
      const runtime = context.paperDictionary
      sendPrivateJson(response, 200, runtime.status())
    }),
    defineRoute('POST', /^\/api\/paper-dictionary\/lookup$/, async ({ request, response, context }) => {
      const runtime = context.paperDictionary
      const requestId = randomUUID()
      try {
        assertSameOrigin(request, { publicOrigin: runtime.config.publicOrigin })
        assertJsonContentType(request)
        let body
        try {
          body = await readJsonRouteBody(request, { maxBytes: MAX_DICTIONARY_BODY_BYTES })
        } catch (error) {
          const tooLarge = error?.message === 'Request body too large'
          sendPrivateJson(response, tooLarge ? 413 : 400, {
            error: tooLarge ? 'Request body too large' : 'Invalid JSON body',
            code: tooLarge ? 'DICTIONARY_LIMIT' : 'DICTIONARY_REQUEST_INVALID',
            requestId,
          })
          return
        }
        const userId = context.resolveDataUserId(context)
        const result = runtime.lookup({ body, context, requestId, userId })
        sendPrivateJson(response, 200, result)
      } catch (error) {
        if (error?.code === 'TRANSLATION_CSRF' || error?.code === 'TRANSLATION_CONTENT_TYPE') {
          const contentType = error.code === 'TRANSLATION_CONTENT_TYPE'
          sendPrivateJson(response, error.status || 403, {
            error: contentType
              ? 'Content-Type must be application/json'
              : 'Cross-origin dictionary requests are not allowed',
            code: contentType ? 'DICTIONARY_CONTENT_TYPE' : 'DICTIONARY_CSRF',
            requestId,
          })
          return
        }
        const status = Number.isInteger(error.status) ? error.status : 500
        sendPrivateJson(response, status, {
          error: userMessage(error.code),
          code: error.code || 'DICTIONARY_FAILED',
          requestId,
        })
      }
    }),
    defineRoute('POST', /^\/api\/paper-dictionary\/sense$/, async ({ request, response, context }) => {
      const runtime = context.paperDictionary
      const requestId = randomUUID()
      const link = abortOnDisconnect(request, response)
      try {
        assertSameOrigin(request, { publicOrigin: runtime.config.publicOrigin })
        assertJsonContentType(request)
        let body
        try {
          body = await readJsonRouteBody(request, { maxBytes: MAX_DICTIONARY_BODY_BYTES })
        } catch (error) {
          const tooLarge = error?.message === 'Request body too large'
          sendPrivateJson(response, tooLarge ? 413 : 400, {
            error: tooLarge ? 'Request body too large' : 'Invalid JSON body',
            code: tooLarge ? 'DICTIONARY_LIMIT' : 'DICTIONARY_REQUEST_INVALID',
            requestId,
          })
          return
        }
        const userId = context.resolveDataUserId(context)
        const result = await runtime.sense({
          body, context, requestId, userId, signal: link.signal,
        })
        sendPrivateJson(response, 200, result)
      } catch (error) {
        if (error?.code === 'TRANSLATION_CSRF' || error?.code === 'TRANSLATION_CONTENT_TYPE') {
          const contentType = error.code === 'TRANSLATION_CONTENT_TYPE'
          sendPrivateJson(response, error.status || 403, {
            error: contentType
              ? 'Content-Type must be application/json'
              : 'Cross-origin dictionary requests are not allowed',
            code: contentType ? 'DICTIONARY_CONTENT_TYPE' : 'DICTIONARY_CSRF',
            requestId,
          })
          return
        }
        const status = Number.isInteger(error.status) ? error.status : 500
        sendPrivateJson(response, status, {
          error: userMessage(error.code),
          code: error.code || 'DICTIONARY_FAILED',
          requestId,
        })
      } finally {
        link.dispose()
      }
    }),
  ]
}

export { createPaperDictionaryRuntime }
