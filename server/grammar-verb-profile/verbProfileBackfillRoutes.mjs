import { defineRoute } from '../router/index.mjs'
import { backfillVerbProfiles } from './backfillVerbProfiles.mjs'
import {
  classifyVerbProfileGroup,
  listGrammarFillVerbWork,
  makeDeepSeekProviderCaller,
  persistVerbProfileGroup,
} from './verbProfileBackfillService.mjs'

/**
 * I16·C — POST /api/grammar-fill/verb-profiles/backfill
 *
 * Profiles unprofiled finite-verb blanks (tense/voice/agreement) across all
 * grammar-fill groups, writes sidecars, and invalidates the teaching-facet cache
 * so the new axes become queryable immediately.
 */
export function createVerbProfileBackfillRoutes() {
  return [
    defineRoute(
      'POST',
      /^\/api\/grammar-fill\/verb-profiles\/backfill$/,
      async ({ request, response, context }) => {
        const input = await context.readJsonBody(request)
        const providerCaller = makeDeepSeekProviderCaller({ apiKey: input.apiKey, model: input.model })
        const summary = await backfillVerbProfiles({
          listGroups: () => listGrammarFillVerbWork({ paperAssetsDir: context.paperAssetsDir }),
          classify: (group) => classifyVerbProfileGroup(group, { providerCaller, model: input.model }),
          persist: (group, profiles) =>
            persistVerbProfileGroup({ paperAssetsDir: context.paperAssetsDir }, group, profiles),
          limit: input.limit,
        })
        context.invalidateTeachingFacetIndex()
        context.sendJson(response, 200, summary)
      },
    ),
  ]
}
