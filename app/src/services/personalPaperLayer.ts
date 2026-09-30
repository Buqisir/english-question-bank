import type {
  PersonalLayerCommitRequest,
  PersonalLayerCommitResponse,
  PersonalLayerReadResponse,
  PersonalLayerTransport,
  PersonalLayerTransportError,
} from '../../../shared/personal-paper-layer/index.mjs'
import { apiPath } from './httpClient.ts'

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(apiPath(input), { credentials: 'same-origin', ...init })
  } catch (cause) {
    // No response means the outcome is unknown; the session retries with the same mutation id.
    throw Object.assign(new Error('network unavailable', { cause }), { kind: 'network' }) as PersonalLayerTransportError
  }
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw Object.assign(new Error(typeof body.error === 'string' ? body.error : `HTTP ${response.status}`), {
      kind: 'http',
      status: response.status,
      code: typeof body.code === 'string' ? body.code : typeof body.error === 'string' ? body.error : undefined,
      details: body.details,
    }) as PersonalLayerTransportError
  }
  return body as T
}

export const personalPaperLayerTransport: PersonalLayerTransport = {
  read({ paperId, sourceRevision }) {
    const query = sourceRevision ? `?sourceRevision=${encodeURIComponent(sourceRevision)}` : ''
    return request<PersonalLayerReadResponse>(`/api/personal-paper-layers/${encodeURIComponent(paperId)}${query}`)
  },
  commit(body: PersonalLayerCommitRequest) {
    return request<PersonalLayerCommitResponse>(`/api/personal-paper-layers/${encodeURIComponent(body.paperId)}/operations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  },
}
