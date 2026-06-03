import { defineRoute } from '../router/index.mjs'
import { backfillTopicLabels } from './backfillTopicLabels.mjs'

function parseRequestArgs(input) {
  return [input.apiKey, input.model]
}

export function createTopicLabelBackfillRoutes() {
  return [
    defineRoute('POST', /^\/api\/topic-labels\/backfill$/, async ({ request, response, context }) => {
      const input = await context.readJsonBody(request)
      const [apiKey, model] = parseRequestArgs(input)
      const summary = await backfillTopicLabels({
        listUnlabeledGroupIds: context.listUnlabeledGroupIds,
        classify: context.generateTopicLabelsByQuestionGroup,
        bind: context.bindTopicLabelsToQuestionGroup,
        apiKey,
        model,
        limit: input.limit,
      })
      context.sendJson(response, 200, summary)
    }),
  ]
}
