/**
 * aiStatus — reads GET /api/ai/status, a read-only probe for whether the server holds
 * its own DeepSeek key (cut ai-key-server-fallback) and whether today's AI daily quota
 * is exhausted (cut m0-5-ai-daily-limit). Never returns the key itself.
 *
 * Fails soft: any network/parse error resolves to
 * `{ serverKeyAvailable: false, dailyLimitExceeded: false }`, matching pre-cut behavior
 * (local fallback whenever no user-supplied key is present).
 */

import { apiPath } from './httpClient.ts'

type AiStatusResponse = {
  serverKeyAvailable: boolean
  dailyLimit?: { limit: number; used: number; exceeded: boolean }
}

export type AiStatus = {
  serverKeyAvailable: boolean
  dailyLimitExceeded: boolean
}

const FAIL_SOFT_STATUS: AiStatus = { serverKeyAvailable: false, dailyLimitExceeded: false }

export async function fetchAiStatus(): Promise<AiStatus> {
  try {
    const response = await fetch(apiPath('/api/ai/status'))
    if (!response.ok) {
      return FAIL_SOFT_STATUS
    }
    const data = (await response.json()) as AiStatusResponse
    return {
      serverKeyAvailable: data.serverKeyAvailable === true,
      dailyLimitExceeded: data.dailyLimit?.exceeded === true,
    }
  } catch {
    return FAIL_SOFT_STATUS
  }
}
