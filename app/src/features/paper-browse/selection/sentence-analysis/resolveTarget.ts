import { selectedFamilyContractIdForGroup } from '../../../../../../shared/paper-canonical/consumerProjection.mjs'
import { resolveTargetFromStream } from '../../../../../../shared/sentence-analysis/resolveTarget.mjs'
import type { SentenceTarget } from '../../../../../../shared/sentence-analysis/types.d.mts'
import type { PaperSelectionSourceView } from '../mapDomSelection'

export type AnalysisSegment = { streamId: string; start: number; end: number; selectedText?: string }

export type ResolveResult =
  | { ok: true; target: SentenceTarget; expanded: boolean }
  | { ok: false; reason: 'cross-stream' | 'not-reading' | 'cross-sentence' | 'too-long' }

function familyOf(consumption: unknown, groupId: string | null) {
  if (!groupId) return null
  try {
    return selectedFamilyContractIdForGroup({ consumption, groupId })
  } catch {
    return null
  }
}

export function analysisButtonEligible(
  source: PaperSelectionSourceView,
  consumption: unknown,
  segments: readonly AnalysisSegment[],
) {
  if (segments.length !== 1) return false
  const stream = source.streams.find((item) => item.streamId === segments[0].streamId)
  if (!stream || stream.role !== 'passage-body') return false
  return familyOf(consumption, stream.groupId) === 'reading'
}

export function resolveTarget(
  source: PaperSelectionSourceView,
  consumption: unknown,
  segments: readonly AnalysisSegment[],
): ResolveResult {
  if (segments.length !== 1) return { ok: false, reason: 'cross-stream' }
  const stream = source.streams.find((item) => item.streamId === segments[0].streamId)
  return resolveTargetFromStream({
    source,
    segment: segments[0],
    familyContractId: familyOf(consumption, stream?.groupId || null),
  })
}
