import { randomUUID } from 'node:crypto'

import { defineRoute } from '../router/index.mjs'

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
    defineRoute('POST', /^\/api\/ai\/semantic-search$/, async ({ request, response, context }) => {
      const input = await context.readJsonBody(request)
      const result = await context.semanticSearchQuestionGroups(input.query, input.apiKey, input.requestId)
      context.sendJson(response, 200, result)
    }),

    defineRoute('POST', /^\/api\/ai\/question-bank-steward$/, async ({ request, response, context }) => {
      const input = await context.readJsonBody(request)
      const result = await context.questionBankStewardSearch(input.message || input.query, input.apiKey, input.requestId, input.thinkingMode === true)
      context.sendJson(response, 200, result)
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
        context.sendJson(response, 500, {
          error: error instanceof Error ? error.message : String(error),
          requestId: verifyRequestId,
        })
      }
    }),
  ]
}
