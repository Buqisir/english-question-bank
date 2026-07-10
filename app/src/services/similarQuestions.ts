import type { SimilarQuestionsResponse } from '../domain/questionBank'
import { apiPath, errorMessageFromResponse as readError } from './httpClient.ts'

/**
 * similar-rail (E2) — thin fetch wrapper around
 * `POST /api/similar-questions` (server/search/similarQuestions.mjs, E1,
 * plan-frozen contract). Convention mirrors draftPapers.ts: plain fetch +
 * cookie auth (same login-gated session as every other API route), no
 * client-side caching/dedup — the plan's "请求纪律" requires the request to
 * fire only on the explicit CTA click, never a prefetch.
 */
export async function fetchSimilarQuestions(
  seedQuestionId: string,
  limit?: number,
): Promise<SimilarQuestionsResponse> {
  const response = await fetch(apiPath('/api/similar-questions'), {
    body: JSON.stringify({
      seeds: [{ questionId: seedQuestionId }],
      ...(limit != null ? { limit } : {}),
    }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
  if (!response.ok) {
    throw new Error(await readError(response, `Failed to load similar questions: ${response.status}`))
  }
  return (await response.json()) as SimilarQuestionsResponse
}
