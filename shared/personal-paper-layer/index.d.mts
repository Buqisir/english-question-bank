import type { PaperSelectionSource } from '../paper-selection/sourceProjection.d.mts'
import type { PersonalTextDocumentV1 } from '../personal-text/index.d.mts'

export type PersonalObjectType = 'highlight' | 'underline' | 'anchored-note' | 'text-box' | 'commentary'
export type PersonalHighlightColor = 'yellow' | 'green' | 'blue' | 'pink'
export type PersonalUnderlineInk = 'ink' | 'red'

export type PersonalAnchorSegmentInput = {
  streamId: string
  start: number
  end: number
  exactText: string
}
export type PersonalTextAnchorInput = {
  paperId: string
  sourceRevision: string
  sourceProjectionVersion: string
  segments: PersonalAnchorSegmentInput[]
}
export type PersonalTextAnchor = {
  anchorVersion: string
  paperId: string
  sourceRevision: string
  sourceProjectionVersion: string
  groupId: string | null
  segments: Array<PersonalAnchorSegmentInput & { prefix: string; suffix: string; leafIds: string[] }>
}

export type PersonalPagePosition = {
  kind: 'page-position'
  layoutId: string
  pageId: string
  xMm: number
  yMm: number
  widthMm: number
}
export type PersonalPlacement =
  | { kind: 'auto-near-anchor' }
  | PersonalPagePosition
  | { kind: 'appendix'; origin: PersonalPagePosition | null }
export type AppendixEntry = {
  id: string
  pageIndex: number | null
  yMm: number | null
  xMm: number | null
}
export function orderAppendixEntries(entries: AppendixEntry[]): string[]

export type PersonalCommentaryTarget =
  | { kind: 'question'; groupId: string; questionId: string }
  | { kind: 'writing-task'; groupId: string }

type ObjectMeta = { id: string; revision: number; createdAt: string; updatedAt: string }
export type PersonalObject = ObjectMeta & (
  | { type: 'highlight'; textAnchor: PersonalTextAnchor; style: { color: PersonalHighlightColor } }
  | { type: 'underline'; textAnchor: PersonalTextAnchor; style: { ink: PersonalUnderlineInk } }
  | { type: 'anchored-note'; textAnchor: PersonalTextAnchor; document: PersonalTextDocumentV1; placement: PersonalPlacement }
  | { type: 'text-box'; document: PersonalTextDocumentV1; placement: PersonalPlacement }
  | { type: 'commentary'; target: PersonalCommentaryTarget; document: PersonalTextDocumentV1 }
)

export type PersonalObjectInput =
  | { id: string; type: 'highlight'; textAnchor: PersonalTextAnchorInput; style: { color: PersonalHighlightColor } }
  | { id: string; type: 'underline'; textAnchor: PersonalTextAnchorInput; style: { ink: PersonalUnderlineInk } }
  | { id: string; type: 'anchored-note'; textAnchor: PersonalTextAnchorInput; document: PersonalTextDocumentV1; placement: PersonalPlacement }
  | { id: string; type: 'text-box'; document: PersonalTextDocumentV1; placement: PersonalPlacement }
  | { id: string; type: 'commentary'; target: PersonalCommentaryTarget; document: PersonalTextDocumentV1 }

export type PersonalOperation =
  | { op: 'create'; object: PersonalObjectInput }
  | { op: 'update'; objectId: string; patch: Record<string, unknown> }
  | { op: 'delete'; objectId: string }

export type PersonalLayerState = {
  schemaVersion: string
  paperId: string
  sourceRevision: string
  sourceProjectionVersion: string
  version: number
  objects: PersonalObject[]
  deletedObjectIds: string[]
}

export const PERSONAL_LAYER_SCHEMA_VERSION: string
export const PERSONAL_LAYER_SNAPSHOT_VERSION: string
export const PERSONAL_TEXT_ANCHOR_VERSION: string
export const PERSONAL_OBJECT_TYPES: readonly PersonalObjectType[]
export const PERSONAL_MARK_TYPES: readonly PersonalObjectType[]
export const PERSONAL_HIGHLIGHT_COLORS: readonly PersonalHighlightColor[]
export const PERSONAL_DEFAULT_HIGHLIGHT_COLOR: PersonalHighlightColor
export const PERSONAL_UNDERLINE_INKS: readonly PersonalUnderlineInk[]
export const PERSONAL_DEFAULT_UNDERLINE_INK: PersonalUnderlineInk
export const PERSONAL_ID_PATTERN: RegExp
export const PERSONAL_LAYER_MAX_OBJECTS: number
export const PERSONAL_LAYER_MAX_CONTENT_BYTES: number
export const PERSONAL_LAYER_MAX_OPERATIONS: number
export const PERSONAL_LAYER_MAX_REQUEST_BYTES: number
export const PERSONAL_ANCHOR_MAX_SEGMENTS: number
export const PERSONAL_ANCHOR_MAX_SELECTED_UTF16: number
export const PERSONAL_ANCHOR_CONTEXT_UTF16: number
export const PERSONAL_PLACEMENT_MAX_MM: number
export const PERSONAL_PLACEMENT_MIN_WIDTH_MM: number
export const PERSONAL_PLACEMENT_MAX_WIDTH_MM: number

export function personalLayerError(code: string, message: string, details?: unknown): Error & { code: string; details?: unknown }
export function normalizeTextAnchor(source: PaperSelectionSource, input: PersonalTextAnchorInput): PersonalTextAnchor
export function resolveTextAnchor(source: PaperSelectionSource, anchor: PersonalTextAnchor): {
  status: 'ok' | 'needs-reanchor'
  reasons: string[]
}
export function textAnchorsCoverSameRange(left: PersonalTextAnchor, right: PersonalTextAnchor): boolean
export function isPersonalId(value: unknown): value is string
export function normalizePersonalObjectInput(source: PaperSelectionSource, input: unknown): Omit<PersonalObject, 'revision' | 'createdAt' | 'updatedAt'>
export function createEmptyPersonalLayerState(source: PaperSelectionSource): PersonalLayerState
export function personalLayerContentBytes(objects: PersonalObject[]): number
export function validatePersonalOperations(operations: unknown): void
export function applyPersonalLayerOperations(
  state: PersonalLayerState,
  operations: PersonalOperation[],
  context: { source: PaperSelectionSource; now: string },
): { state: PersonalLayerState; affectedObjectIds: string[] }
export function createPersonalLayerSnapshot(state: PersonalLayerState): Readonly<{
  snapshotVersion: string
  schemaVersion: string
  paperId: string
  sourceRevision: string
  sourceProjectionVersion: string
  layerVersion: number
  objects: PersonalObject[]
  objectsDigest: string
}>

export const PERSONAL_LAYER_API_SCHEMA: 'eqb-personal-paper-layer-api-v1'
export const PERSONAL_LAYER_DRAFT_VERSION: 'eqb-personal-layer-draft-v1'

export type PersonalLayerSaveStatus =
  | 'loading'
  | 'unavailable'
  | 'saved'
  | 'dirty'
  | 'saving'
  | 'offline'
  | 'failed'
  | 'conflict'
  | 'auth-paused'
  | 'stale-source'
  | 'rejected'
export type PersonalLayerLocalDraftStatus = 'none' | 'protected' | 'failed' | 'unavailable'

export type PersonalLayerDiagnostic = { objectId: string; code: 'needs-reanchor'; reasons: string[] }
export type PersonalLayerRevisionSummary = { sourceRevision: string; version: number; updatedAt: string; objectCount: number }

export type PersonalLayerReadResponse = {
  schemaVersion: 'eqb-personal-paper-layer-api-v1'
  paperId: string
  ownerKey: string
  currentSourceRevision: string
  sourceProjectionVersion: string
  sourceRevision: string
  stale: boolean
  layer: PersonalLayerState | null
  diagnostics: PersonalLayerDiagnostic[]
  revisions: PersonalLayerRevisionSummary[]
}
export type PersonalLayerCommitRequest = {
  schemaVersion: 'eqb-personal-paper-layer-api-v1'
  paperId: string
  sourceRevision: string
  expectedVersion: number
  clientMutationId: string
  operations: PersonalOperation[]
}
export type PersonalLayerCommitResponse = {
  schemaVersion: 'eqb-personal-paper-layer-api-v1'
  paperId: string
  sourceRevision: string
  layerVersion: number
  acceptedMutationId: string
  objects: PersonalObject[]
  deletedObjectIds: string[]
  replayed: boolean
}
// Thrown by transports: `kind: 'network'` when no HTTP response arrived.
export type PersonalLayerTransportError = Error & {
  kind?: 'network' | 'http'
  status?: number
  code?: string
  details?: unknown
}
export type PersonalLayerTransport = {
  read(input: { paperId: string; sourceRevision?: string }): Promise<PersonalLayerReadResponse>
  commit(body: PersonalLayerCommitRequest): Promise<PersonalLayerCommitResponse>
}
export type PersonalLayerDraftRecord = {
  draftVersion: 'eqb-personal-layer-draft-v1'
  key: string
  ownerKey: string
  paperId: string
  sourceRevision: string
  baseVersion: number
  inflight: { clientMutationId: string; expectedVersion: number; operations: PersonalOperation[] } | null
  pending: PersonalOperation[]
  updatedAt: string
}
export type PersonalLayerLocalStore = {
  load(key: string): Promise<PersonalLayerDraftRecord | null>
  save(key: string, record: PersonalLayerDraftRecord): Promise<void>
  clear(key: string): Promise<void>
}
export type PersonalLayerConflict = {
  reason: 'server-changed' | 'local-draft-diverged'
  serverLayer: PersonalLayerState | null
  localOperations: PersonalOperation[]
  refreshError: { status: number; code: string; message: string } | null
}
export type PersonalLayerSessionSnapshot = Readonly<{
  status: PersonalLayerSaveStatus
  layer: PersonalLayerState | null
  confirmedVersion: number | null
  unsentCount: number
  localDraft: PersonalLayerLocalDraftStatus
  conflict: PersonalLayerConflict | null
  lastError: { status: number; code: string; message: string } | null
  diagnostics: PersonalLayerDiagnostic[]
  revisions: PersonalLayerRevisionSummary[]
  readOnly: boolean
}>
export type PersonalLayerApplyResult = { ok: true } | { ok: false; code: string; message?: string }
export type PersonalLayerSession = {
  load(): Promise<void>
  apply(operations: PersonalOperation[]): PersonalLayerApplyResult
  flush(): Promise<void>
  settle(): Promise<number>
  retryNow(): void
  resumeAfterAuth(ownerKey: string): boolean
  resolveConflict(choice: 'keep-server' | 'reapply-local'): PersonalLayerApplyResult
  refreshConflict(): Promise<void>
  discardUnsaved(): PersonalLayerApplyResult
  dispose(): void
  getSnapshot(): PersonalLayerSessionSnapshot
  subscribe(listener: (snapshot: PersonalLayerSessionSnapshot) => void): () => void
  whenLocalWritten(): Promise<void>
}
type TimerHost = {
  setTimeout(callback: () => void, delay: number): unknown
  clearTimeout(handle: unknown): void
}

export function personalLayerDraftKey(input: { ownerKey: string; paperId: string; sourceRevision: string }): string
export function createPersonalMutationId(): string
export function classifyPersonalLayerFailure(error: unknown): 'offline' | 'auth-paused' | 'stale-source' | 'conflict' | 'failed' | 'rejected'
export function coalescePersonalOperations(pending: PersonalOperation[], operations: PersonalOperation[]): PersonalOperation[]
export function takePersonalOperationBatch(pending: PersonalOperation[]): { batch: PersonalOperation[]; rest: PersonalOperation[] }
export function mergePersonalCommitResult(base: PersonalLayerState, result: PersonalLayerCommitResponse): PersonalLayerState
export function createPersonalLayerSession(options: {
  paperId: string
  source: PaperSelectionSource
  transport: PersonalLayerTransport
  localStore?: PersonalLayerLocalStore | null
  createId?: () => string
  now?: () => string
  debounceMs?: number
  retryDelaysMs?: number[]
  timers?: TimerHost
}): PersonalLayerSession

export type PersonalLayerHistoryStep =
  | { ok: true; operations: PersonalOperation[]; commit(): void }
  | { ok: false; code: 'HISTORY_EMPTY' | 'HISTORY_STALE' }
export type PersonalLayerHistory = {
  record(objects: PersonalObject[], operations: PersonalOperation[], options?: { mergeKey?: string | null }): void
  seal(): void
  undo(objects: PersonalObject[]): PersonalLayerHistoryStep
  redo(objects: PersonalObject[]): PersonalLayerHistoryStep
  currentId(id: string): string
  clear(): void
  readonly canUndo: boolean
  readonly canRedo: boolean
}
export function personalTextAnchorToInput(anchor: PersonalTextAnchor): PersonalTextAnchorInput
export function personalObjectToCreateInput(object: PersonalObject, id?: string): PersonalObjectInput
export function createPersonalLayerHistory(options?: { createId?: () => string; limit?: number }): PersonalLayerHistory

export type PersonalCommentaryTargets = {
  questions: ReadonlyArray<{ groupId: string; questionId: string }>
  writingTasks: readonly string[]
}
export type PersonalLayerSource = PaperSelectionSource & { commentaryTargets?: PersonalCommentaryTargets }
export function buildPersonalLayerSource(consumption: unknown): PersonalLayerSource & { commentaryTargets: PersonalCommentaryTargets }
export function personalCommentaryTargetExists(source: PersonalLayerSource, target: PersonalCommentaryTarget | null | undefined): boolean

export function printSegmentToDomRanges(
  doc: Document,
  source: PaperSelectionSource,
  segment: { streamId: string; start: number; end: number },
): Range[] | null
