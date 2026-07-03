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
 *
 * M0-3 (docs/cuts/m0-3-role-gate/plan.md 1b / ADR-0013 decision 4): owner-only.
 * The sidecar JSON it writes under paper-assets is a derived asset of the shared
 * question bank (ships alongside the sqlite on deploy), so writing it is treated
 * the same as writing question-bank.sqlite directly.
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
      { ownerOnly: true },
    ),
  ]
}
