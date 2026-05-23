import { defineRoute } from '../router/index.mjs'

function decodeRouteId(match) {
  return decodeURIComponent(match[1])
}

function routeError(error) {
  return error instanceof Error ? error.message : String(error)
}

function parseRequestArgs(input) {
  return [input.apiKey, input.model, input.requestId, input.thinkingMode]
}

export function createQuestionGroupRoutes() {
  return [
    defineRoute('GET', /^\/api\/question-groups$/, ({ response, context }) => {
      context.sendJson(response, 200, { questionGroups: context.listQuestionGroups() })
    }),

    defineRoute('POST', /^\/api\/question-groups$/, async ({ request, response, context }) => {
      const input = await context.readJsonBody(request)
      const questionGroup = context.createQuestionGroup(input)
      context.sendJson(response, 201, { questionGroup })
    }),

    defineRoute('GET', /^\/api\/question-groups\/([^/]+)$/, ({ response, match, context }) => {
      const questionGroup = context.getQuestionGroupDetail(decodeRouteId(match))
      if (!questionGroup) {
        context.sendJson(response, 404, { error: 'Question group not found' })
        return
      }
      context.sendJson(response, 200, { questionGroup })
    }),

    defineRoute('PUT', /^\/api\/question-groups\/([^/]+)$/, async ({ request, response, match, context }) => {
      const input = await context.readJsonBody(request)
      const questionGroup = context.updateQuestionGroup(decodeRouteId(match), input)
      if (!questionGroup) {
        context.sendJson(response, 404, { error: 'Question group not found' })
        return
      }
      context.sendJson(response, 200, { questionGroup })
    }),

    defineRoute('DELETE', /^\/api\/question-groups\/([^/]+)$/, ({ response, match, context }) => {
      const result = context.deleteQuestionGroup(decodeRouteId(match))
      if (!result) {
        context.sendJson(response, 404, { error: 'Question group not found' })
        return
      }
      context.sendJson(response, 200, { ok: true })
    }),

    defineRoute('PUT', /^\/api\/question-groups\/([^/]+)\/reading-parse$/, async ({ request, response, match, context }) => {
      const input = await context.readJsonBody(request, { maxBytes: 3_000_000 })
      const result = context.saveReadingParseResult(decodeRouteId(match), input)
      context.sendJson(response, 200, result)
    }),

    defineRoute('POST', /^\/api\/question-groups\/([^/]+)\/reading-parse$/, async ({ request, response, match, context }) => {
      const input = await context.readJsonBody(request)
      const result = await context.parseReadingByQuestionGroup(decodeRouteId(match), ...parseRequestArgs(input))
      context.sendJson(response, 200, result)
    }),

    defineRoute('POST', /^\/api\/question-groups\/([^/]+)\/cloze-parse$/, async ({ request, response, match, context }) => {
      const input = await context.readJsonBody(request)
      const result = await context.parseClozeByQuestionGroup(decodeRouteId(match), ...parseRequestArgs(input))
      context.sendJson(response, 200, result)
    }),

    defineRoute('PUT', /^\/api\/question-groups\/([^/]+)\/cloze-parse$/, async ({ request, response, match, context }) => {
      const input = await context.readJsonBody(request, { maxBytes: 3_000_000 })
      const result = context.saveClozeParseResult(decodeRouteId(match), input)
      context.sendJson(response, 200, result)
    }),

    defineRoute(
      'POST',
      /^\/api\/question-groups\/([^/]+)\/seven-choices-parse$/,
      async ({ request, response, match, context }) => {
        const input = await context.readJsonBody(request)
        const result = await context.parseSevenChoicesByQuestionGroup(decodeRouteId(match), ...parseRequestArgs(input))
        context.sendJson(response, 200, result)
      },
    ),

    defineRoute(
      'PUT',
      /^\/api\/question-groups\/([^/]+)\/seven-choices-parse$/,
      async ({ request, response, match, context }) => {
        const input = await context.readJsonBody(request, { maxBytes: 3_000_000 })
        const result = context.saveSevenChoicesParseResult(decodeRouteId(match), input)
        context.sendJson(response, 200, result)
      },
    ),

    defineRoute('POST', /^\/api\/question-groups\/([^/]+)\/grammar-parse$/, async ({ request, response, match, context }) => {
      const input = await context.readJsonBody(request)
      const result = await context.parseGrammarByQuestionGroup(decodeRouteId(match), ...parseRequestArgs(input))
      context.sendJson(response, 200, result)
    }),

    defineRoute('PUT', /^\/api\/question-groups\/([^/]+)\/grammar-parse$/, async ({ request, response, match, context }) => {
      const input = await context.readJsonBody(request, { maxBytes: 3_000_000 })
      const result = context.saveGrammarParseResult(decodeRouteId(match), input)
      context.sendJson(response, 200, result)
    }),

    defineRoute('POST', /^\/api\/question-groups\/([^/]+)\/summary$/, async ({ request, response, match, context }) => {
      const input = await context.readJsonBody(request)
      const result = await context.generateQuestionGroupSummary(decodeRouteId(match), ...parseRequestArgs(input))
      context.sendJson(response, 200, result)
    }),

    defineRoute('POST', /^\/api\/question-groups\/([^/]+)\/topic-labels$/, async ({ request, response, match, context }) => {
      const input = await context.readJsonBody(request)
      const result = await context.generateTopicLabelsByQuestionGroup(decodeRouteId(match), ...parseRequestArgs(input))
      context.sendJson(response, 200, result)
    }),

    defineRoute(
      'POST',
      /^\/api\/question-groups\/([^/]+)\/synonym-difficulty$/,
      async ({ request, response, match, context }) => {
        if (!context.localQwenEnabled) {
          context.sendJson(response, 410, {
            error: '题库本地 Qwen 初判已停用。请使用 DeepSeek 阅读解析内置的 synonymDifficulty。',
            replacement: 'POST /api/question-groups/:id/reading-parse',
          })
          return
        }
        const input = await context.readJsonBody(request, { maxBytes: 3_000_000 })
        const result = await context.generateSynonymDifficultyByQuestionGroup(decodeRouteId(match), input)
        context.sendJson(response, 200, result)
      },
    ),

    defineRoute('PUT', /^\/api\/question-groups\/([^/]+)\/topic-labels$/, async ({ request, response, match, context }) => {
      const input = await context.readJsonBody(request, { maxBytes: 1_000_000 })
      const result = context.bindTopicLabelsToQuestionGroup(decodeRouteId(match), input)
      context.sendJson(response, 200, result)
    }),

    defineRoute('PUT', /^\/api\/questions\/([^/]+)\/difficulty-rating$/, async ({ request, response, match, context }) => {
      const input = await context.readJsonBody(request, { maxBytes: 20_000 })
      let question = null
      try {
        question = context.saveQuestionDifficultyRating(decodeRouteId(match), input)
      } catch (error) {
        context.sendJson(response, 400, { error: routeError(error) })
        return
      }
      if (!question) {
        context.sendJson(response, 404, { error: 'Question not found' })
        return
      }
      context.sendJson(response, 200, { question })
    }),
  ]
}
