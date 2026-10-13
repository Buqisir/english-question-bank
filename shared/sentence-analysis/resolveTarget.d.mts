import type { SentenceTarget } from './types.d.mts'

export function analysisSentences(text: string): Array<{ start: number; end: number; text: string }>

export function resolveTargetFromStream(input: {
  source: {
    paperId: string
    sourceRevision: string
    streams: ReadonlyArray<{ streamId: string; text: string; role: string }>
  }
  segment: { streamId: string; start: number; end: number } | null
  familyContractId: string | null
}): { ok: false; reason: 'cross-stream' | 'not-reading' | 'cross-sentence' | 'too-long' } | {
  ok: true
  expanded: boolean
  target: SentenceTarget
}
