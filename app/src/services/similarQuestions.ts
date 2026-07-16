import type { SimilarPassagesResponse, SimilarQuestionsResponse } from '../domain/questionBank'
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

/**
 * similar-passages-entry (E6) — thin fetch wrapper around
 * `POST /api/similar-passages` (server/search/similarQuestions.mjs, E5,
 * plan-frozen contract). Same shape/discipline as fetchSimilarQuestions
 * above: no caching/dedup, fires only on explicit user action (CTA click /
 * panel expand).
 */
export async function fetchSimilarPassages(
  groupId: string,
  limit?: number,
): Promise<SimilarPassagesResponse> {
  const response = await fetch(apiPath('/api/similar-passages'), {
    body: JSON.stringify({
      groupId,
      ...(limit != null ? { limit } : {}),
    }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
  if (!response.ok) {
    throw new Error(await readError(response, `Failed to load similar passages: ${response.status}`))
  }
  return (await response.json()) as SimilarPassagesResponse
}
