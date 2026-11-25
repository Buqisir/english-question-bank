import { errorFromResponse } from './httpClient'

export type PaperDictionaryStatus = {
  schemaVersion: string
  enabled: boolean
  available: boolean
  phrasesAvailable?: boolean
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
  otter?: OtterEntry | null
  otterSenseId?: string | null
  phrases?: OtterPhraseHit[]
}

type OtterEntryLink = { entryId: string; headword: string }
export type OtterPhraseHit = OtterEntryLink & { senseId: string; glossZh: string }

type WordCounts = { gaokao: number; mock: number }
type Accents = { uk: string | null; us: string | null }

export type OtterExample = {
  exampleId: string
  text: string
  highlightRanges?: [start: number, end: number][]
  zh?: string
  source: {
    paperId: string
    label: string
    groupId: string
    locator: { paragraphId?: string; questionId?: string }
  }
}

export type OtterSense = {
  senseId: string
  pos: string
  glossZh: string
  pronunciationId: string
  origin: 'gaokao' | 'mock' | 'dictionary'
  counts: WordCounts
  folded: boolean
  examples: OtterExample[]
}

export type OtterEntry = {
  entryId: string
  version: number
  headword: string
  lists: string[]
  variants: string[]
  forms: { form: string }[]
  pronunciations: { pronunciationId: string; ipa: Accents; audio: Accents; label?: string }[]
  counts: WordCounts
  senses: OtterSense[]
  kind?: 'word' | 'phrase'
  relatedPhraseLinks?: OtterEntryLink[]
}

export async function fetchOtterEntry(word: string, signal: AbortSignal): Promise<OtterEntry | null> {
  const params = new URLSearchParams({ [word.startsWith('w:') ? 'id' : 'w']: word })
  const response = await fetch(`/api/paper-dictionary/entry?${params}`, { signal })
  if (response.status === 404) return null
  if (!response.ok) throw await errorFromResponse(response, '词条加载失败')
  return response.json()
}

export async function searchOtterEntry(query: string, signal: AbortSignal): Promise<string | null> {
  const response = await fetch(`/api/paper-dictionary/search?${new URLSearchParams({ w: query })}`, { signal })
  if (response.status === 404) return null
  if (!response.ok) throw await errorFromResponse(response, '词典搜索失败')
  const { entryId } = await response.json() as { entryId: string }
  return entryId
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
  otterSenseId?: string | null
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
