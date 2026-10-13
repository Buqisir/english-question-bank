import { randomUUID } from 'node:crypto'
import { defineRoute, readJsonRouteBody } from '../router/index.mjs'
import { assertJsonContentType, assertSameOrigin } from '../paper-translation/csrf.mjs'
import { createPaperSentenceAnalysisRuntime } from './runtime.mjs'

const MAX_BODY_BYTES = 16 * 1024

function sendPrivateJson(response, status, body) {
  if (response.destroyed || response.writableEnded) return
  response.writeHead(status, {
    'cache-control': 'private, no-store',
    'content-type': 'application/json; charset=utf-8',
  })
  response.end(JSON.stringify(body))
}

function userMessage(code) {
  switch (code) {
    case 'not_authenticated':
      return '请先登录后再分析'
    case 'SENTENCE_ANALYSIS_UNAVAILABLE':
      return '句子分析暂不可用'
    case 'SENTENCE_ANALYSIS_RATE_LIMITED':
      return '分析请求太频繁，请稍后再试'
    case 'SENTENCE_ANALYSIS_BUDGET_EXHAUSTED':
      return '今日 AI 额度已用完'
    case 'SELECTION_SOURCE_MISMATCH':
    case 'SELECTION_SOURCE_UNAVAILABLE':
      return '试卷来源已更新，请重新选择'
    case 'SENTENCE_ANALYSIS_NOT_A_SENTENCE':
      return '请只选一句'
    case 'SENTENCE_ANALYSIS_TIMEOUT':
      return '分析超时，请重试'
    case 'SENTENCE_ANALYSIS_INVALID':
      return '这句暂时没有分析出可靠的结构，请重试'
    default:
      return '分析失败，请重试'
  }
}

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

export function createPaperSentenceAnalysisRoutes() {
  return [
    defineRoute('POST', /^\/api\/paper-sentence-analysis\/analyze$/, async ({ request, response, context }) => {
      const runtime = context.paperSentenceAnalysis
      const requestId = randomUUID()
      const link = abortOnDisconnect(request, response)
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
            code: 'SENTENCE_ANALYSIS_REQUEST_INVALID',
            requestId,
          })
          return
        }
        const userId = context.resolveDataUserId(context)
        const result = await runtime.analyze({ body, context, requestId, userId, signal: link.signal })
        sendPrivateJson(response, 200, result)
      } catch (error) {
        if (error?.code === 'TRANSLATION_CSRF' || error?.code === 'TRANSLATION_CONTENT_TYPE') {
          sendPrivateJson(response, error.status || 403, {
            error: error.code === 'TRANSLATION_CONTENT_TYPE'
              ? 'Content-Type must be application/json'
              : 'Cross-origin sentence analysis requests are not allowed',
            code: 'SENTENCE_ANALYSIS_CSRF',
            requestId,
          })
          return
        }
        if (error?.name === 'AbortError' || error?.code === 'TRANSLATION_CANCELLED') return
        const status = Number.isInteger(error.status) ? error.status : 500
        if (status >= 500) console.warn(`[paper-sentence-analysis] ${requestId} ${error.code || 'ERROR'}: ${error.message}`)
        sendPrivateJson(response, status, {
          error: userMessage(error.code),
          code: error.code || 'SENTENCE_ANALYSIS_FAILED',
          requestId,
        })
      } finally {
        link.dispose()
      }
    }),
  ]
}

export { createPaperSentenceAnalysisRuntime }
