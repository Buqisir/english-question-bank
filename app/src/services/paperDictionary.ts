import { errorFromResponse } from './httpClient'

export type PaperDictionaryStatus = {
  schemaVersion: string
  enabled: boolean
  available: boolean
  dictionaryVersion: string | null
  reason: string
  sensePick?: {
    enabled: boolean
    reason?: string
  }
  limits: {
    maxWordUtf16: number
    maxBodyBytes: number
    maxResponseBytes: number
  }
}

export type PaperDictionaryAudio = {
  url: string
  source: string | null
  author: string | null
  license: string | null
  licenseUrl: string | null
  sourceUrl?: string | null
  synthetic?: boolean
  fallbackUrl?: string
}

export type PaperDictionaryPronunciation = {
  pronunciationId: string
  ipa: string | null
  dialect: string
  dialectLabel: string
  spokenForm: string
  audio: PaperDictionaryAudio | null
}

export type PaperDictionarySense = {
  senseId: string
  priority: 'core' | 'common' | 'rare' | string
  shortGloss: string | null
  learnerExplanation: string | null
}

export type PaperDictionaryPosGroup = {
  posGroupIndex: number
  pos: string
  posLabel: string
  etymologyId: string | null
  morphologyLabels: string[]
  matchedForm: string
  senses: PaperDictionarySense[]
  pronunciations: PaperDictionaryPronunciation[]
}

export type PaperDictionaryEntry = {
  entryId: string
  headword: string
  posGroups: PaperDictionaryPosGroup[]
  gaokao?: {
    frequencyStage: 'high' | 'mid' | 'low'
    frequencyRank: number
  }
}

export type PaperDictionaryResponse = {
  schemaVersion: string
  requestId: string
  sourceRevision: string
  dictionaryVersion: string
  selectedText: string
  status: 'found' | 'ambiguous' | 'not-found'
  entries: PaperDictionaryEntry[]
  truncated: boolean
  omittedSenseCount?: number
  attribution: string
}

export async function fetchPaperDictionaryStatus(
  fetchImpl: typeof fetch = fetch,
): Promise<PaperDictionaryStatus> {
  const response = await fetchImpl('/api/paper-dictionary/status')
  if (!response.ok) {
    throw await errorFromResponse(response, '无法读取词典状态')
  }
  return await response.json() as PaperDictionaryStatus
}

export type PaperDictionarySenseMatch = {
  entryId: string
  posGroupIndex: number
  senseId: string
  gloss: string
}

export type PaperDictionarySenseResponse = {
  schemaVersion: string
  requestId: string
  sourceRevision: string
  selectedText: string
  status: 'ok' | 'none'
  match: PaperDictionarySenseMatch | null
  phrase: { text: string; gloss: string } | null
}

export async function requestPaperDictionaryLookup(
  input: {
    paperId: string
    sourceRevision: string
    segments: Array<{ streamId: string; start: number; end: number; selectedText: string }>
  },
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<PaperDictionaryResponse> {
  const response = await fetchImpl('/api/paper-dictionary/lookup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      schemaVersion: 'paper-dictionary-request-v1',
      paperId: input.paperId,
      sourceRevision: input.sourceRevision,
      segments: input.segments,
    }),
    signal,
  })
  const data = await response.json().catch(() => null) as
    | (PaperDictionaryResponse & { error?: string; code?: string })
    | null
  if (!response.ok || !data || !data.status) {
    throw new Error(data?.error || '词典暂时无法查询')
  }
  return data
}

export async function requestPaperDictionarySense(
  input: {
    paperId: string
    sourceRevision: string
    segments: Array<{ streamId: string; start: number; end: number; selectedText: string }>
  },
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<PaperDictionarySenseResponse> {
  const response = await fetchImpl('/api/paper-dictionary/sense', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      schemaVersion: 'paper-dictionary-sense-request-v1',
      paperId: input.paperId,
      sourceRevision: input.sourceRevision,
      segments: input.segments,
    }),
    signal,
  })
  const data = await response.json().catch(() => null) as
    | (PaperDictionarySenseResponse & { error?: string; code?: string })
    | null
  if (!response.ok || !data || !data.status) {
    const error = new Error(data?.error || '本文义暂时没有得到') as Error & { code?: string }
    if (data?.code) error.code = data.code
    throw error
  }
  return data
}
