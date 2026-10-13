import type { SentenceAnalysisV1 } from './types.d.mts'

export function compileFixture(input: {
  id?: string
  sentenceText: string
  bind?: { paperId: string; sourceRevision?: string; streamId: string; start: number; end: number } | null
  translationZh?: string
  roots?: string[]
  units?: Array<Record<string, unknown>>
  relations?: Array<Record<string, unknown>>
  restores?: Array<Record<string, unknown>>
  status?: 'ok' | 'partial' | 'unavailable'
  unavailableReason?: string
  gaps?: string[]
}, options?: { id?: string }): SentenceAnalysisV1
