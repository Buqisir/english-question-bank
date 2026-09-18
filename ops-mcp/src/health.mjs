import { HEALTH_TIMEOUT_MS } from './config.mjs'
import { pickHealthFields } from './redact.mjs'

export async function probeHealth(healthUrl, { fetchImpl = fetch, timeoutMs = HEALTH_TIMEOUT_MS } = {}) {
  const started = Date.now()
  try {
    const response = await fetchImpl(healthUrl, {
      method: 'GET',
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: 'application/json' },
    })
    const latencyMs = Date.now() - started
    let payload = null
    try {
      payload = await response.json()
    } catch {
      payload = null
    }
    return {
      ...pickHealthFields(payload, response.status, latencyMs),
      reachable: true,
    }
  } catch (error) {
    return {
      ok: false,
      statusCode: 0,
      latencyMs: Date.now() - started,
      reachable: false,
      error: error.message,
    }
  }
}
