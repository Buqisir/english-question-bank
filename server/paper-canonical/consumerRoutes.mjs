import { defineRoute } from '../router/index.mjs'

export function createPaperCanonicalConsumerRoutes() {
  return [
    defineRoute(
      'GET',
      /^\/api\/paper-canonical\/consumption$/,
      async ({ response, url, context }) => {
        const paperId = url.searchParams.get('paperId')?.trim()
        if (!paperId) {
          context.sendJson(response, 400, { error: 'paperId is required' })
          return
        }
        try {
          const consumption = context.loadCanonicalConsumption({
            paperId,
            consumerId: 'screen',
          })
          context.sendJson(response, 200, consumption)
        } catch (error) {
          context.sendJson(response, 409, {
            error: error instanceof Error ? error.message : String(error),
            code: error?.code || 'CANONICAL_CONSUMPTION_REJECTED',
            diagnostics: error?.diagnostics || [],
          })
        }
      },
    ),
  ]
}
