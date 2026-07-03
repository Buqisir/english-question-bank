import { defineRoute } from '../router/index.mjs'

function decodeRouteId(match) {
  return decodeURIComponent(match[1])
}

// M0-3 (docs/cuts/m0-3-role-gate/plan.md 1b): the whole legacy-import module is
// owner-only — it is the curatorial import back office, with no member-visible UI.
export function createLegacyImportRoutes() {
  return [
    defineRoute(
      'GET',
      /^\/api\/import-files$/,
      ({ response, context }) => {
        context.sendJson(response, 200, { importFiles: context.listImportFiles() })
      },
      { ownerOnly: true },
    ),

    defineRoute(
      'POST',
      /^\/api\/import-files$/,
      async ({ request, response, context }) => {
        const input = await context.readJsonBody(request, { maxBytes: 35_000_000 })
        const importFile = context.createImportFile(input)
        context.sendJson(response, 201, { importFile })
      },
      { ownerOnly: true },
    ),

    defineRoute(
      'GET',
      /^\/api\/import-bundles$/,
      ({ response, context }) => {
        context.sendJson(response, 200, { importBundles: context.listImportBundles() })
      },
      { ownerOnly: true },
    ),

    defineRoute(
      'POST',
      /^\/api\/import-bundles\/([^/]+)\/draft$/,
      async ({ request, response, match, context }) => {
        const input = await context.readJsonBody(request)
        const draft = await context.generateImportBundleDraft(decodeRouteId(match), input)
        if (!draft) {
          context.sendJson(response, 404, { error: 'Parsed import bundle not found' })
          return
        }
        context.sendJson(response, 200, { draft })
      },
      { ownerOnly: true },
    ),

    defineRoute(
      'POST',
      /^\/api\/import-bundles\/([^/]+)\/answer-alignment$/,
      ({ response, match, context }) => {
        const alignment = context.generateAnswerAlignmentDraft(decodeRouteId(match))
        if (!alignment) {
          context.sendJson(response, 404, { error: 'Import bundle not found' })
          return
        }
        context.sendJson(response, 200, { alignment })
      },
      { ownerOnly: true },
    ),

    defineRoute(
      'POST',
      /^\/api\/import-bundles\/([^/]+)\/answer-alignment\/apply$/,
      async ({ request, response, match, context }) => {
        const input = await context.readJsonBody(request)
        const result = context.applyAnswerAlignment(decodeRouteId(match), input)
        if (!result) {
          context.sendJson(response, 404, { error: 'Import bundle not found' })
          return
        }
        context.sendJson(response, 200, { result })
      },
      { ownerOnly: true },
    ),

    defineRoute(
      'GET',
      /^\/api\/import-batches$/,
      ({ response, context }) => {
        context.sendJson(response, 200, { importBatches: context.listImportBatches() })
      },
      { ownerOnly: true },
    ),

    defineRoute(
      'POST',
      /^\/api\/import-batches\/scan$/,
      async ({ request, response, context }) => {
        const input = await context.readJsonBody(request)
        const importBatch = context.scanImportDirectory(input)
        context.sendJson(response, 201, { importBatch })
      },
      { ownerOnly: true },
    ),

    defineRoute(
      'POST',
      /^\/api\/import-batches\/([^/]+)\/import$/,
      async ({ request, response, match, context }) => {
        const input = await context.readJsonBody(request)
        const importBatch = context.runImportBatch(decodeRouteId(match), input)
        if (!importBatch) {
          context.sendJson(response, 404, { error: 'Import batch not found' })
          return
        }
        context.sendJson(response, 200, { importBatch })
      },
      { ownerOnly: true },
    ),

    defineRoute(
      'GET',
      /^\/api\/import-files\/([^/]+)\/parse$/,
      ({ response, match, context }) => {
        const parse = context.getImportFileParse(decodeRouteId(match))
        if (!parse) {
          context.sendJson(response, 404, { error: 'Import parse not found' })
          return
        }
        context.sendJson(response, 200, { parse })
      },
      { ownerOnly: true },
    ),

    defineRoute(
      'POST',
      /^\/api\/import-files\/([^/]+)\/parse$/,
      ({ response, match, context }) => {
        const parse = context.parseImportFile(decodeRouteId(match))
        if (!parse) {
          context.sendJson(response, 404, { error: 'Import file not found' })
          return
        }
        context.sendJson(response, 200, { parse })
      },
      { ownerOnly: true },
    ),

    defineRoute(
      'DELETE',
      /^\/api\/import-files\/([^/]+)$/,
      ({ response, match, context }) => {
        const result = context.deleteImportFile(decodeRouteId(match))
        if (!result) {
          context.sendJson(response, 404, { error: 'Import file not found' })
          return
        }
        context.sendJson(response, 200, { ok: true })
      },
      { ownerOnly: true },
    ),
  ]
}
