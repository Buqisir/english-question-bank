import { defineRoute } from '../router/index.mjs'

function decodeRouteId(match) {
  return decodeURIComponent(match[1])
}

export function createPaperSetRoutes() {
  return [
    defineRoute('GET', /^\/api\/paper-sets$/, ({ response, context }) => {
      context.sendJson(response, 200, { paperSets: context.listPaperSets() })
    }),

    defineRoute('GET', /^\/api\/paper-sets\/([^/]+)$/, ({ response, match, context }) => {
      const paperSet = context.getPaperSet(decodeRouteId(match))
      if (!paperSet) {
        context.sendJson(response, 404, { error: 'Paper set not found' })
        return
      }
      context.sendJson(response, 200, { paperSet })
    }),

    // M0-3 (docs/cuts/m0-3-role-gate/plan.md 1c): only the two writes are
    // owner-only. All three GETs stay open — AI mode may need to read the
    // paper-set list.
    defineRoute(
      'POST',
      /^\/api\/paper-sets$/,
      async ({ request, response, context }) => {
        const input = await context.readJsonBody(request)
        const paperSet = context.createPaperSet(input)
        context.sendJson(response, 201, { paperSet })
      },
      { ownerOnly: true },
    ),

    defineRoute(
      'PUT',
      /^\/api\/paper-sets\/([^/]+)$/,
      async ({ request, response, match, context }) => {
        const input = await context.readJsonBody(request)
        const updateInput = { ...input, id: decodeRouteId(match) }
        const paperSet = context.createPaperSet(updateInput)
        context.sendJson(response, 200, { paperSet })
      },
      { ownerOnly: true },
    ),
  ]
}
