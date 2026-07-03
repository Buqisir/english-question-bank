/**
 * aiStatus — reads GET /api/ai/status, a read-only probe for whether the server holds
 * its own DeepSeek key (cut ai-key-server-fallback). Never returns the key itself.
 *
 * Fails soft: any network/parse error resolves to `false`, matching pre-cut behavior
 * (local fallback whenever no user-supplied key is present).
 */

import { apiPath } from './httpClient.ts'

type AiStatusResponse = {
  serverKeyAvailable: boolean
}

export async function fetchAiStatus(): Promise<boolean> {
  try {
    const response = await fetch(apiPath('/api/ai/status'))
    if (!response.ok) {
      return false
    }
    const data = (await response.json()) as AiStatusResponse
    return data.serverKeyAvailable === true
  } catch {
    return false
  }
}
