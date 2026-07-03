import { randomUUID } from 'node:crypto'

import { defineRoute } from '../router/index.mjs'
import { AI_DAILY_LIMIT_EXCEEDED_CODE } from '../ai-providers/dailyLimitCounter.mjs'

// cut m0-5-ai-daily-limit (C3): triggered-limit errors thrown by completionRunner.mjs
// carry `.code === AI_DAILY_LIMIT_EXCEEDED_CODE`. This must translate to 429 everywhere
// an AI POST route can surface it — never fold into the generic 500 path (C3 hard rule).
const AI_DAILY_LIMIT_MESSAGE = '今天的 AI 额度用完了，明天自动恢复。'

function isAiDailyLimitError(error) {
  return Boolean(error) && error.code === AI_DAILY_LIMIT_EXCEEDED_CODE
}

function sendAiDailyLimitExceeded(context, response, extra = {}) {
  context.sendJson(response, 429, {
    error: AI_DAILY_LIMIT_MESSAGE,
    code: AI_DAILY_LIMIT_EXCEEDED_CODE,
    ...extra,
  })
}

// AI-proxy route owners (cut H10-B PR2): the 3 LIVE inline /api/ai/* POST blocks moved out of the
// server/api.mjs request handler into defineRoute entries. Each calls exactly one serverContext fn
// (semanticSearchQuestionGroups / questionBankStewardSearch / verifyQuestionGroup) — added to
// serverContext by api.mjs. The verify-question-group block keeps its bespoke requestId mint +
// x-verify-request-id header (on success via result.requestId AND on 500 via the minted id) +
// {error, requestId} envelope verbatim. randomUUID is imported directly (node:crypto, no cycle);
// DEFAULT_DEEPSEEK_MODEL comes from context (kept identical to api.mjs). The GET /api/ai/verify-trace
// reader stays inline in api.mjs (it reads the verify-audit JSONL from disk).
export function createAiProxyRoutes() {
  return [
    // cut ai-key-server-fallback: read-only status probe so the frontend can default to the
    // server-held DeepSeek key without the teacher pasting one. Returns a boolean only — never
    // the key or any fragment of it, and never logs it (see plan.md MF-3).
    defineRoute('GET', /^\/api\/ai\/status$/, async ({ response, context }) => {
      // cut m0-5-ai-daily-limit (C4): dailyLimit is additive — pre-cut consumers reading
      // only serverKeyAvailable are unaffected. getAiDailyLimitStatus is optional so this
      // route degrades gracefully in any harness that doesn't wire it (dailyLimit omitted).
      const dailyLimit =
        typeof context.getAiDailyLimitStatus === 'function' ? context.getAiDailyLimitStatus() : undefined
      const body = { serverKeyAvailable: Boolean(context.serverKeyAvailable) }
      if (dailyLimit) {
        body.dailyLimit = {
          limit: dailyLimit.limit,
          used: dailyLimit.used,
          exceeded: Boolean(dailyLimit.exceeded),
        }
      }
      context.sendJson(response, 200, body)
    }),

    defineRoute('POST', /^\/api\/ai\/semantic-search$/, async ({ request, response, context }) => {
      // M0-4 (docs/cuts/m0-4-user-scope/plan.md decision 7 / PA MF-1): this route is
      // member-reachable (not ownerOnly) and its results carry per-user
      // in_current_draft button state via getDraftSearchContext — userId must be
      // resolved here and threaded through, or two members' searches leak each
      // other's current-draft button state (the AI-mode analogue of the M0-1 bug).
      const userId = context.resolveDataUserId(context)
      const input = await context.readJsonBody(request)
      try {
        const result = await context.semanticSearchQuestionGroups(input.query, input.apiKey, input.requestId, undefined, userId)
        context.sendJson(response, 200, result)
      } catch (error) {
        // cut m0-5-ai-daily-limit (C3): 429 must never fold into the generic 500 the
        // top-level api.mjs catch would otherwise produce — intercept here.
        if (isAiDailyLimitError(error)) {
          sendAiDailyLimitExceeded(context, response)
          return
        }
        throw error
      }
    }),

    defineRoute('POST', /^\/api\/ai\/question-bank-steward$/, async ({ request, response, context }) => {
      const userId = context.resolveDataUserId(context)
      const input = await context.readJsonBody(request)
      try {
        const result = await context.questionBankStewardSearch(input.message || input.query, input.apiKey, input.requestId, input.thinkingMode === true, userId)
        context.sendJson(response, 200, result)
      } catch (error) {
        if (isAiDailyLimitError(error)) {
          sendAiDailyLimitExceeded(context, response)
          return
        }
        throw error
      }
    }),

    defineRoute('POST', /^\/api\/ai\/verify-question-group$/, async ({ request, response, context }) => {
      const verifyRequestId = randomUUID()
      try {
        const input = await context.readJsonBody(request)
        const thinkingMode = input?.thinkingMode === true
        console.log(
          `AI verify: trace=${verifyRequestId} group=${input.questionGroupId} model=${input.model || context.DEFAULT_DEEPSEEK_MODEL} thinking=${thinkingMode ? 'on' : 'off'}`,
        )
        const result = await context.verifyQuestionGroup(
          input.questionGroupId,
          input.apiKey,
          input.model,
          verifyRequestId,
          thinkingMode,
        )
        if (result.requestId) {
          response.setHeader('x-verify-request-id', result.requestId)
        }
        context.sendJson(response, 200, result)
      } catch (error) {
        response.setHeader('x-verify-request-id', verifyRequestId)
        // cut m0-5-ai-daily-limit (C3/C6): 429 + code, distinct from the generic 500
        // envelope below, so the frontend can show a dedicated verify-button message.
        if (isAiDailyLimitError(error)) {
          sendAiDailyLimitExceeded(context, response, { requestId: verifyRequestId })
          return
        }
        context.sendJson(response, 500, {
          error: error instanceof Error ? error.message : String(error),
          requestId: verifyRequestId,
        })
      }
    }),
  ]
}
