export type PaperSelectionStream = {
  streamId: string
  text: string
  role: string
  groupId: string | null
  flow?: boolean
  leaves: Array<{ kind: string; id: string; start: number; end: number }>
  length?: number
}

export type PaperSelectionSource = {
  paperId: string
  sourceRevision: string
  sourceProjectionVersion: string
  streams: readonly PaperSelectionStream[]
}

export function computeSourceRevision(consumption: { paperId: string; [key: string]: unknown }): string
export function buildSelectionSourceFromConsumption(consumption: unknown): PaperSelectionSource
export function findStream(source: PaperSelectionSource, streamId: string): PaperSelectionStream | null
export function readSelection(
  source: PaperSelectionSource,
  input: { streamId: string; start: number; end: number; selectedText: string },
): { stream: PaperSelectionStream; selectedText: string }
export function validateTranslateSegments(
  source: PaperSelectionSource,
  segments: Array<{ streamId: string; start: number; end: number; selectedText: string }>,
): unknown[]
export function streamsFromProjectedGroup(group: unknown): PaperSelectionStream[]
