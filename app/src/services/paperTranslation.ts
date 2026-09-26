import { errorFromResponse } from './httpClient'

export type PaperTranslationStatus = {
  schemaVersion: string
  enabled: boolean
  keyAvailable: boolean
  canRequestNew: boolean
  reason: string
  promptVersion: string
  contextPolicy: string
  sourceProjectionVersion?: string
  limits: {
    maxSelectedUtf16: number
    maxContextUtf16: number
    maxSegments: number
    maxBodyBytes: number
  }
}

export type PaperTranslationSegment = {
  streamId: string
  start: number
  end: number
  selectedText: string
}

export type PaperTranslationResultItem = {
  segmentIndex: number
  status: 'ok' | 'error'
  taskMode?: 'contextual-fragment' | 'selected-text'
  resultKind?: 'selection-translation'
  selectedText?: string
  translation?: string
  contextCoverage?: string
  cacheDisposition?: string
  code?: string
  message?: string
  retryable?: boolean
}

export type PaperTranslationResponse = {
  schemaVersion: string
  requestId: string
  sourceRevision: string
  promptVersion: string
  results: PaperTranslationResultItem[]
  partial: boolean
}

export async function fetchPaperTranslationStatus(
  fetchImpl: typeof fetch = fetch,
): Promise<PaperTranslationStatus> {
  const response = await fetchImpl('/api/paper-translation/status')
  if (!response.ok) {
    throw await errorFromResponse(response, '无法读取翻译状态')
  }
  return await response.json() as PaperTranslationStatus
}

export async function requestPaperTranslation(
  input: {
    paperId: string
    sourceRevision: string
    segments: PaperTranslationSegment[]
  },
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<PaperTranslationResponse> {
  const response = await fetchImpl('/api/paper-translation/translate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      schemaVersion: 'paper-selection-request-v1',
      paperId: input.paperId,
      sourceRevision: input.sourceRevision,
      segments: input.segments,
    }),
    signal,
  })
  const data = await response.json().catch(() => null) as
    | (PaperTranslationResponse & { error?: string; code?: string })
    | null
  if (!response.ok) {
    if (data?.results) return data
    throw new Error(data?.error || '翻译失败，请重试')
  }
  return data as PaperTranslationResponse
}
