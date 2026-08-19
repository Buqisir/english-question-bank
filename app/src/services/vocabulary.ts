import type {
  PublicVocabularyDictationSet,
  PublicVocabularySet,
  VocabularyAudioAsset,
  VocabularyPhonetics,
  VocabularyPronunciationPart,
  VocabularyPronunciationParts,
  VocabularySetEntry,
  VocabularyStage,
  VocabularyVisualAsset,
} from '../domain/vocabulary'
import { directDownloadTarget, saveBlobToTarget, type FileSaveTarget } from './fileDownload.ts'

export type VocabularyProgramDto = {
  id: string
  version: string
  title: string
  subtitle: string
  sourceTitle: string
  sourceEdition: string
  totalPlannedEntries: number
  structure: VocabularyProgramStructure
  availability: 'available' | 'hidden'
  groups: Array<{
    id: string
    stage: VocabularyStage
    week: number
    group: number
    sourceLabel: string
    startOrder: number
    endOrder: number
  }>
  entries: Array<{
    id: string
    headword: string
    phonetic: string
    phonetics?: VocabularyPhonetics
    partOfSpeech: string
    sourceMeanings: string[]
    teachingSense: string
    teachingSenses?: string[]
    examFrequency: number
    pronunciationMode: 'syllables' | 'forms'
    syllables: Array<string | VocabularyPronunciationPart>
    pronunciationParts?: VocabularyPronunciationParts
    example: {
      candidateId?: 'a' | 'b' | 'c'
      version?: string
      english: string
      chinese: string
      highlight: string
      reviewStatus: 'approved'
    }
    visual: VocabularyVisualAsset
    audio: VocabularyAudioAsset
    audioVariants?: {
      american: VocabularyAudioAsset
      british: VocabularyAudioAsset
    }
    source: {
      title: string
      edition: string
      stage: VocabularyStage
      day: number
      sourceOrder: number
      printedPage: number
      verification: 'page-checked'
      metadata?: {
        frequencyRank?: number
        frequencyStage?: VocabularyStage
        sourceGroup?: number
        curriculumTag?: 'initial' | 'required' | 'elective'
      }
    }
  }>
}

export type VocabularyProgramStructure = {
  dayCount?: number
  daysPerWeek?: number
  stages?: Array<{
    key: VocabularyStage
    label: string
    entryCount: number
    dayStart: number
    dayEnd: number
  }>
}

export type VocabularyProgramSummaryDto = Omit<VocabularyProgramDto, 'groups' | 'entries'> & {
  progress?: {
    studentId: string
    programId: string
    cursor: number
    lastTarget: number
    updatedAt: string | null
  }
}

export type VocabularyReviewRunDto = {
  id: string
  studentId: string
  programId: string
  mode: 'main' | 'temporary'
  targetUnfamiliarCount: number
  cursor: number
  status: 'active' | 'target_reached' | 'program_exhausted' | 'frozen'
  decisions: Record<string, 'known' | 'unfamiliar'>
  decisionOrder: string[]
}

export type VocabularySetDto = Omit<PublicVocabularySet, 'entries'> & {
  id: string
  studentId: string
  programId: string
  reviewRunId: string | null
  entries: VocabularySetEntry[]
  share: null | {
    shareId: string
    status: 'active' | 'revoked'
  }
}

export type VocabularyStudentDto = {
  id: string
  displayName: string
  isDefault: boolean
  createdAt: string
  updatedAt: string
}

export type VocabularySetLibraryItemDto = VocabularySetDto & {
  dictationSummary: {
    recordCount: number
    latestWrongCount: number
    latestDate: string | null
    pendingCount: number
    meaningRecall: {
      latestDate: string | null
      pendingCount: number
      repeatedCount: number
    }
  }
}

export type VocabularySetLibraryDto = {
  items: VocabularySetLibraryItemDto[]
  page: number
  pageSize: number
  total: number
  hasMore: boolean
}

export type VocabularyDictationTaskDto = {
  id: string
  studentId: string
  programId: string
  taskDate: string
  title: string
  accent: 'american' | 'british'
  materialLayout: 'merged' | 'grouped'
  entryCount: number
  entries: Array<VocabularySetEntry & { sourceSetIds: string[] }>
  sourceSets: Array<{
    setId: string
    title: string
    entryCount: number
    createdAt: string
  }>
  share: null | {
    shareId: string
    status: 'active' | 'revoked'
    createdAt: string
    revokedAt: string | null
  }
  meaningRecallSource: null | {
    recordId: string
    title: string
    recallDate: string
  }
  createdAt: string
}

export type VocabularyDictationResult = 'correct' | 'wrong' | 'untested'

export type VocabularyDictationRecordDto = {
  id: string
  studentId: string
  taskId: string
  taskTitle: string
  mode: 'all' | 'partial'
  status: 'draft' | 'completed' | 'void'
  dictationDate: string
  note: string
  entries: Array<VocabularySetEntry & {
    sourceSetIds: string[]
    result: VocabularyDictationResult
    wrongSpelling: string
  }>
  createdAt: string
  updatedAt: string
  completedAt: string | null
  voidedAt: string | null
}

export type VocabularyMeaningRecallRecordDto = {
  id: string
  studentId: string
  programId: string
  title: string
  orderMode: 'random' | 'source'
  status: 'draft' | 'completed' | 'void'
  recallDate: string
  entryCount: number
  entries: Array<VocabularySetEntry & {
    sourceSetIds: string[]
    result: VocabularyDictationResult
  }>
  sourceSets: VocabularyDictationTaskDto['sourceSets']
  dictationTasks: Array<{
    taskId: string
    title: string
    createdAt: string
  }>
  createdAt: string
  updatedAt: string
  completedAt: string | null
  voidedAt: string | null
}

export type StudentVocabularyMeaningStateDto = VocabularySetEntry & {
  status: 'pending' | 'repeated' | 'improved'
  attempts: number
  meaningAttempts: number
  totalWrong: number
  currentWrongDateCount: number
  currentCorrectDateCount: number
  lastForgottenDate: string | null
  lastCheckedDate: string | null
  latestEvidenceDate: string
  latestResult: 'correct' | 'wrong'
  latestSource: 'meaning_recall' | 'dictation'
  pinned: boolean
  paused: boolean
  sourceSetIds: string[]
}

export type VocabularyMeaningSuggestionDto = VocabularySetEntry & {
  sourceSetIds: string[]
  meaningStatus: 'pending' | 'repeated' | 'improved' | 'remembered' | 'unchecked'
  dictationStatus: 'pending' | 'stubborn' | 'improved' | 'none'
  doublePending: boolean
  lastCheckedDate: string | null
  lastForgottenDate: string | null
  pinned: boolean
  paused: boolean
  reason: string
}

export type StudentVocabularyReviewStateDto = VocabularySetEntry & {
  attempts: number
  totalWrong: number
  currentConsecutiveWrong: number
  currentConsecutiveCorrect: number
  recentAttempts: number
  recentWrong: number
  recentWrongRate: number
  wrongDateCount: number
  lastWrongDate: string | null
  lastWrongSpelling: string
  latestResult: 'correct' | 'wrong'
  status: 'pending' | 'stubborn' | 'improved'
  pinned: boolean
  paused: boolean
  sourceSetIds: string[]
  reason?: string
}

export type VocabularyPrintJobDto = {
  vocabularySet: VocabularySetDto
  sections: Array<{ startIndex: number; title: string }>
  shareKind: 'listen' | 'dictation' | null
  accent: 'american' | 'british'
  kind: 'cards' | 'dictation' | 'answer' | 'word-search'
}

export class VocabularyApiError extends Error {
  status: number
  code: string

  constructor(message: string, status: number, code = 'vocabulary_api_error') {
    super(message)
    this.name = 'VocabularyApiError'
    this.status = status
    this.code = code
  }
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    return await response.json() as Record<string, unknown>
  } catch {
    return {}
  }
}

async function requestJson(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const response = await fetch(path, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  })
  const body = await readJson(response)
  if (!response.ok) {
    throw new VocabularyApiError(
      typeof body.message === 'string' ? body.message : '词汇服务暂时不可用。',
      response.status,
      typeof body.error === 'string' ? body.error : undefined,
    )
  }
  return body
}

export async function listVocabularyPrograms(studentId?: string): Promise<VocabularyProgramSummaryDto[]> {
  const query = studentId ? `?studentId=${encodeURIComponent(studentId)}` : ''
  const body = await requestJson(`/api/vocabulary/programs${query}`)
  return body.programs as VocabularyProgramSummaryDto[]
}

export async function getVocabularyProgram(programId: string): Promise<VocabularyProgramDto> {
  const body = await requestJson(`/api/vocabulary/programs/${encodeURIComponent(programId)}`)
  return body.program as VocabularyProgramDto
}

export async function listVocabularyStudents(): Promise<VocabularyStudentDto[]> {
  const body = await requestJson('/api/vocabulary/students')
  return body.students as VocabularyStudentDto[]
}

export async function createVocabularyStudent(displayName: string): Promise<VocabularyStudentDto> {
  const body = await requestJson('/api/vocabulary/students', {
    method: 'POST',
    body: JSON.stringify({ displayName }),
  })
  return body.student as VocabularyStudentDto
}

export async function getVocabularyProgress(programId: string, studentId: string): Promise<{ cursor: number; lastTarget: number }> {
  const body = await requestJson(`/api/vocabulary/progress/${encodeURIComponent(programId)}?studentId=${encodeURIComponent(studentId)}`)
  return body.progress as { cursor: number; lastTarget: number }
}

export async function setVocabularyProgressStart(
  programId: string,
  studentId: string,
  entryId: string,
  replaceActiveRun: boolean,
): Promise<{
  progress: { cursor: number; lastTarget: number }
  startEntry: { id: string; headword: string; sourceOrder: number }
  discardedRunId: string | null
}> {
  const body = await requestJson(`/api/vocabulary/progress/${encodeURIComponent(programId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ studentId, entryId, replaceActiveRun }),
  })
  return body as {
    progress: { cursor: number; lastTarget: number }
    startEntry: { id: string; headword: string; sourceOrder: number }
    discardedRunId: string | null
  }
}

export async function createVocabularyReviewRun(
  programId: string,
  studentId: string,
  targetUnfamiliarCount: number,
  scope: { mode?: 'main' | 'temporary'; stage?: VocabularyStage; day?: number } = {},
): Promise<VocabularyReviewRunDto> {
  const body = await requestJson('/api/vocabulary/review-runs', {
    method: 'POST',
    body: JSON.stringify({
      studentId,
      programId,
      mode: scope.mode ?? 'main',
      targetUnfamiliarCount,
      ...(scope.stage ? { temporaryStage: scope.stage } : {}),
      ...(scope.day ? { temporaryDay: scope.day } : {}),
    }),
  })
  return body.reviewRun as VocabularyReviewRunDto
}

export async function getVocabularyReviewRun(runId: string): Promise<{
  reviewRun: VocabularyReviewRunDto
  vocabularySet: VocabularySetDto | null
}> {
  const body = await requestJson(`/api/vocabulary/review-runs/${encodeURIComponent(runId)}`)
  return {
    reviewRun: body.reviewRun as VocabularyReviewRunDto,
    vocabularySet: (body.vocabularySet ?? null) as VocabularySetDto | null,
  }
}

export async function getCurrentVocabularyReviewRun(programId: string, studentId: string): Promise<VocabularyReviewRunDto | null> {
  const query = new URLSearchParams({
    studentId,
    programId,
  })
  const body = await requestJson(`/api/vocabulary/review-runs/current?${query.toString()}`)
  return (body.reviewRun ?? null) as VocabularyReviewRunDto | null
}

export async function discardVocabularyReviewRun(runId: string): Promise<void> {
  await requestJson(`/api/vocabulary/review-runs/${encodeURIComponent(runId)}`, { method: 'DELETE' })
}

export async function decideVocabularyReviewRun(
  runId: string,
  entryId: string,
  verdict: 'known' | 'unfamiliar',
): Promise<VocabularyReviewRunDto> {
  const body = await requestJson(`/api/vocabulary/review-runs/${encodeURIComponent(runId)}/decision`, {
    method: 'PATCH',
    body: JSON.stringify({ entryId, verdict }),
  })
  return body.reviewRun as VocabularyReviewRunDto
}

export async function undoVocabularyReviewRun(runId: string): Promise<VocabularyReviewRunDto> {
  const body = await requestJson(`/api/vocabulary/review-runs/${encodeURIComponent(runId)}/undo`, {
    method: 'POST',
  })
  return body.reviewRun as VocabularyReviewRunDto
}

export async function freezeVocabularyReviewRun(runId: string, title?: string): Promise<VocabularySetDto> {
  const body = await requestJson(`/api/vocabulary/review-runs/${encodeURIComponent(runId)}/freeze`, {
    method: 'POST',
    body: JSON.stringify(title ? { title } : {}),
  })
  return body.vocabularySet as VocabularySetDto
}

export async function shareVocabularySet(setId: string): Promise<{ shareId: string; status: 'active' }> {
  const body = await requestJson(`/api/vocabulary/sets/${encodeURIComponent(setId)}/share`, {
    method: 'POST',
  })
  return body.share as { shareId: string; status: 'active' }
}

export async function listVocabularySets(programId: string, studentId: string): Promise<VocabularySetDto[]> {
  const query = new URLSearchParams({ studentId, programId })
  const body = await requestJson(`/api/vocabulary/sets?${query.toString()}`)
  return body.vocabularySets as VocabularySetDto[]
}

export async function getVocabularySetLibrary(input: {
  studentId: string
  page?: number
  pageSize?: number
  query?: string
  from?: string
  to?: string
}): Promise<VocabularySetLibraryDto> {
  const query = new URLSearchParams({
    studentId: input.studentId,
    programId: 'wanwei-round-one-v1',
    page: String(input.page ?? 1),
    pageSize: String(input.pageSize ?? 20),
  })
  if (input.query?.trim()) query.set('query', input.query.trim())
  if (input.from) query.set('from', input.from)
  if (input.to) query.set('to', input.to)
  const body = await requestJson(`/api/vocabulary/set-library?${query.toString()}`)
  return body.library as VocabularySetLibraryDto
}

export async function createVocabularyDictationTask(input: {
  studentId: string
  sourceSetIds?: string[]
  sourceTaskIds?: string[]
  entryIds?: string[]
  taskDate?: string
  title: string
  accent: 'american' | 'british'
  materialLayout?: 'merged' | 'grouped'
  meaningRecallRecordId?: string
  share?: boolean
}): Promise<VocabularyDictationTaskDto> {
  const body = await requestJson('/api/vocabulary/dictation-tasks', {
    method: 'POST',
    body: JSON.stringify({ ...input, programId: 'wanwei-round-one-v1' }),
  })
  return body.task as VocabularyDictationTaskDto
}

export async function createVocabularySetErrorTasks(input: {
  studentId: string
  sourceSetIds: string[]
  taskDate: string
  accent: 'american' | 'british'
  materialLayout: 'merged' | 'grouped'
}): Promise<VocabularyDictationTaskDto[]> {
  const body = await requestJson('/api/vocabulary/dictation-tasks/from-set-errors', {
    method: 'POST',
    body: JSON.stringify({ ...input, programId: 'wanwei-round-one-v1' }),
  })
  return body.tasks as VocabularyDictationTaskDto[]
}

export async function createVocabularyMeaningRecallRecord(input: {
  studentId: string
  sourceSetIds: string[]
  entryIds?: string[]
  title?: string
  orderMode?: 'random' | 'source'
  recallDate?: string
  status?: 'draft' | 'completed'
  results?: Array<{ entryId: string; result: VocabularyDictationResult }>
}): Promise<VocabularyMeaningRecallRecordDto> {
  const body = await requestJson('/api/vocabulary/meaning-recall-records', {
    method: 'POST',
    body: JSON.stringify({ ...input, programId: 'wanwei-round-one-v1' }),
  })
  return body.record as VocabularyMeaningRecallRecordDto
}

export async function listVocabularyMeaningRecallRecords(studentId: string): Promise<VocabularyMeaningRecallRecordDto[]> {
  const query = new URLSearchParams({ studentId })
  const body = await requestJson(`/api/vocabulary/meaning-recall-records?${query.toString()}`)
  return body.records as VocabularyMeaningRecallRecordDto[]
}

export async function getVocabularyMeaningRecallRecord(recordId: string): Promise<VocabularyMeaningRecallRecordDto> {
  const body = await requestJson(`/api/vocabulary/meaning-recall-records/${encodeURIComponent(recordId)}`)
  return body.record as VocabularyMeaningRecallRecordDto
}

export async function updateVocabularyMeaningRecallRecord(
  recordId: string,
  input: Partial<{
    title: string
    status: 'draft' | 'completed'
    recallDate: string
    results: Array<{ entryId: string; result: VocabularyDictationResult }>
  }>,
): Promise<VocabularyMeaningRecallRecordDto> {
  const body = await requestJson(`/api/vocabulary/meaning-recall-records/${encodeURIComponent(recordId)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
  return body.record as VocabularyMeaningRecallRecordDto
}

export async function voidVocabularyMeaningRecallRecord(recordId: string): Promise<VocabularyMeaningRecallRecordDto> {
  const body = await requestJson(`/api/vocabulary/meaning-recall-records/${encodeURIComponent(recordId)}/void`, {
    method: 'POST',
  })
  return body.record as VocabularyMeaningRecallRecordDto
}

export async function restoreVocabularyMeaningRecallRecord(recordId: string): Promise<VocabularyMeaningRecallRecordDto> {
  const body = await requestJson(`/api/vocabulary/meaning-recall-records/${encodeURIComponent(recordId)}/restore`, {
    method: 'POST',
  })
  return body.record as VocabularyMeaningRecallRecordDto
}

export async function getStudentVocabularyMeaningStates(studentId: string): Promise<StudentVocabularyMeaningStateDto[]> {
  const query = new URLSearchParams({ studentId, programId: 'wanwei-round-one-v1' })
  const body = await requestJson(`/api/vocabulary/meaning-review-states?${query.toString()}`)
  return body.states as StudentVocabularyMeaningStateDto[]
}

export async function getSuggestedVocabularyMeaningRecall(
  studentId: string,
  target: number,
): Promise<VocabularyMeaningSuggestionDto[]> {
  const query = new URLSearchParams({
    studentId,
    programId: 'wanwei-round-one-v1',
    target: String(target),
  })
  const body = await requestJson(`/api/vocabulary/meaning-review-suggestion?${query.toString()}`)
  return body.entries as VocabularyMeaningSuggestionDto[]
}

export async function listVocabularyDictationTasks(studentId: string): Promise<VocabularyDictationTaskDto[]> {
  const query = new URLSearchParams({ studentId })
  const body = await requestJson(`/api/vocabulary/dictation-tasks?${query.toString()}`)
  return body.tasks as VocabularyDictationTaskDto[]
}

export async function getVocabularyDictationTask(taskId: string): Promise<VocabularyDictationTaskDto> {
  const body = await requestJson(`/api/vocabulary/dictation-tasks/${encodeURIComponent(taskId)}`)
  return body.task as VocabularyDictationTaskDto
}

export async function shareVocabularyDictationTask(taskId: string): Promise<{ shareId: string; status: 'active' }> {
  const body = await requestJson(`/api/vocabulary/dictation-tasks/${encodeURIComponent(taskId)}/share`, { method: 'POST' })
  return body.share as { shareId: string; status: 'active' }
}

export async function revokeVocabularyDictationTaskShare(taskId: string): Promise<{ status: 'revoked' }> {
  const body = await requestJson(`/api/vocabulary/dictation-tasks/${encodeURIComponent(taskId)}/share`, { method: 'DELETE' })
  return body.share as { status: 'revoked' }
}

export async function createVocabularyDictationRecord(
  taskId: string,
  input: {
    mode: 'all' | 'partial'
    status: 'draft' | 'completed'
    dictationDate: string
    note?: string
    results?: Array<{ entryId: string; result: VocabularyDictationResult; wrongSpelling?: string }>
  },
): Promise<VocabularyDictationRecordDto> {
  const body = await requestJson(`/api/vocabulary/dictation-tasks/${encodeURIComponent(taskId)}/records`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return body.record as VocabularyDictationRecordDto
}

export async function listVocabularyDictationRecords(studentId: string): Promise<VocabularyDictationRecordDto[]> {
  const body = await requestJson(`/api/vocabulary/dictation-records?studentId=${encodeURIComponent(studentId)}`)
  return body.records as VocabularyDictationRecordDto[]
}

export async function updateVocabularyDictationRecord(
  recordId: string,
  input: Partial<{
    mode: 'all' | 'partial'
    status: 'draft' | 'completed'
    dictationDate: string
    note: string
    results: Array<{ entryId: string; result: VocabularyDictationResult; wrongSpelling?: string }>
  }>,
): Promise<VocabularyDictationRecordDto> {
  const body = await requestJson(`/api/vocabulary/dictation-records/${encodeURIComponent(recordId)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
  return body.record as VocabularyDictationRecordDto
}

export async function voidVocabularyDictationRecord(recordId: string): Promise<VocabularyDictationRecordDto> {
  const body = await requestJson(`/api/vocabulary/dictation-records/${encodeURIComponent(recordId)}/void`, { method: 'POST' })
  return body.record as VocabularyDictationRecordDto
}

export async function restoreVocabularyDictationRecord(recordId: string): Promise<VocabularyDictationRecordDto> {
  const body = await requestJson(`/api/vocabulary/dictation-records/${encodeURIComponent(recordId)}/restore`, { method: 'POST' })
  return body.record as VocabularyDictationRecordDto
}

export async function getStudentVocabularyReviewStates(studentId: string): Promise<StudentVocabularyReviewStateDto[]> {
  const query = new URLSearchParams({ studentId, programId: 'wanwei-round-one-v1' })
  const body = await requestJson(`/api/vocabulary/review-states?${query.toString()}`)
  return body.states as StudentVocabularyReviewStateDto[]
}

export async function getSuggestedVocabularyReview(studentId: string, target: number): Promise<StudentVocabularyReviewStateDto[]> {
  const query = new URLSearchParams({
    studentId,
    programId: 'wanwei-round-one-v1',
    target: String(target),
  })
  const body = await requestJson(`/api/vocabulary/review-suggestion?${query.toString()}`)
  return body.entries as StudentVocabularyReviewStateDto[]
}

export async function updateStudentVocabularyWordFlag(
  studentId: string,
  entryId: string,
  input: { pinned: boolean; paused: boolean },
): Promise<void> {
  await requestJson(`/api/vocabulary/review-states/${encodeURIComponent(entryId)}/flag`, {
    method: 'PATCH',
    body: JSON.stringify({
      studentId,
      programId: 'wanwei-round-one-v1',
      ...input,
    }),
  })
}

export async function getVocabularySet(setId: string): Promise<VocabularySetDto> {
  const body = await requestJson(`/api/vocabulary/sets/${encodeURIComponent(setId)}`)
  return body.vocabularySet as VocabularySetDto
}

export async function getVocabularyPrintJob(printJobId: string): Promise<VocabularyPrintJobDto> {
  const body = await requestJson(`/api/vocabulary/print-jobs/${encodeURIComponent(printJobId)}`)
  return body.printJob as VocabularyPrintJobDto
}

export async function createVocabularySetFromEntries(
  programId: string,
  studentId: string,
  entryIds: string[],
  title?: string,
): Promise<VocabularySetDto> {
  const body = await requestJson('/api/vocabulary/sets', {
    method: 'POST',
    body: JSON.stringify({
      studentId,
      programId,
      entryIds,
      ...(title ? { title } : {}),
    }),
  })
  return body.vocabularySet as VocabularySetDto
}

export async function renameVocabularySet(setId: string, title: string): Promise<VocabularySetDto> {
  const body = await requestJson(`/api/vocabulary/sets/${encodeURIComponent(setId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ title }),
  })
  return body.vocabularySet as VocabularySetDto
}

export async function revokeVocabularySetShare(setId: string): Promise<{ status: 'revoked' }> {
  const body = await requestJson(`/api/vocabulary/sets/${encodeURIComponent(setId)}/share`, {
    method: 'DELETE',
  })
  return body.share as { status: 'revoked' }
}

function decodeHeaderValue(value: string | null): string {
  if (!value) return ''
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export async function downloadVocabularySetPdf(
  setId: string,
  accent: 'american' | 'british',
  kind: 'cards' | 'dictation' | 'answer' | 'word-search' = 'cards',
  target: FileSaveTarget = directDownloadTarget(),
): Promise<void> {
  const response = await fetch(
    `/api/vocabulary/sets/${encodeURIComponent(setId)}/pdf?accent=${encodeURIComponent(accent)}&kind=${encodeURIComponent(kind)}`,
    { method: 'POST' },
  )
  if (!response.ok) {
    const body = await readJson(response)
    throw new VocabularyApiError(
      typeof body.message === 'string' ? body.message : '单词纸暂时无法下载，请重试。',
      response.status,
      typeof body.error === 'string' ? body.error : undefined,
    )
  }
  const blob = await response.blob()
  const fileName = decodeHeaderValue(response.headers.get('x-file-name')) || '生词记忆纸.pdf'
  await saveBlobToTarget(blob, fileName, target)
}

export async function downloadCombinedVocabularyPdf(input: {
  studentId: string
  title: string
  sourceSetIds?: string[]
  entryIds?: string[]
  mode?: 'dedupe' | 'grouped'
  accent: 'american' | 'british'
  kind: 'cards' | 'dictation' | 'answer' | 'word-search'
}, target: FileSaveTarget = directDownloadTarget()): Promise<void> {
  const response = await fetch('/api/vocabulary/combined-pdf', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...input, programId: 'wanwei-round-one-v1' }),
  })
  if (!response.ok) {
    const body = await readJson(response)
    throw new VocabularyApiError(
      typeof body.message === 'string' ? body.message : '合并打印暂时无法生成，请重试。',
      response.status,
      typeof body.error === 'string' ? body.error : undefined,
    )
  }
  const blob = await response.blob()
  const fileName = decodeHeaderValue(response.headers.get('x-file-name')) || '生词合集.pdf'
  await saveBlobToTarget(blob, fileName, target)
}

export async function downloadVocabularyDictationTaskPdf(
  taskId: string,
  kind: 'cards' | 'dictation' | 'answer' | 'word-search',
  target: FileSaveTarget = directDownloadTarget(),
): Promise<void> {
  const response = await fetch(
    `/api/vocabulary/dictation-tasks/${encodeURIComponent(taskId)}/pdf?kind=${encodeURIComponent(kind)}`,
    { method: 'POST' },
  )
  if (!response.ok) {
    const body = await readJson(response)
    throw new VocabularyApiError(
      typeof body.message === 'string' ? body.message : '听写任务打印暂时无法生成，请重试。',
      response.status,
      typeof body.error === 'string' ? body.error : undefined,
    )
  }
  const blob = await response.blob()
  const fileName = decodeHeaderValue(response.headers.get('x-file-name')) || '综合听写.pdf'
  await saveBlobToTarget(blob, fileName, target)
}

export async function downloadVocabularyDictationTaskMaterialsZip(
  taskIds: string[],
  kinds: Array<'cards' | 'dictation' | 'answer'>,
  target: FileSaveTarget = directDownloadTarget(),
): Promise<void> {
  const response = await fetch('/api/vocabulary/dictation-task-materials.zip', {
    method: 'POST',
    headers: { Accept: 'application/zip', 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskIds, kinds }),
  })
  if (!response.ok) {
    const body = await readJson(response)
    throw new VocabularyApiError(
      typeof body.message === 'string' ? body.message : '错词资料包暂时无法生成，请重试。',
      response.status,
      typeof body.error === 'string' ? body.error : undefined,
    )
  }
  const blob = await response.blob()
  const fileName = decodeHeaderValue(response.headers.get('x-file-name')) || '错词复听写-资料.zip'
  await saveBlobToTarget(blob, fileName, target)
}

export async function getPublicVocabularyDictationSet(
  shareId: string,
  signal?: AbortSignal,
): Promise<PublicVocabularyDictationSet> {
  const response = await fetch(`/api/public/vocabulary/dictation/${encodeURIComponent(shareId)}`, {
    headers: { Accept: 'application/json' },
    signal,
  })
  const body = await readJson(response)
  if (!response.ok) {
    const fallback = response.status === 410
      ? '这份听写练习已停止分享。'
      : response.status === 404
        ? '没有找到这份听写练习。'
        : '听写练习暂时无法打开，请稍后重试。'
    throw new VocabularyApiError(
      typeof body.message === 'string' ? body.message : fallback,
      response.status,
      typeof body.error === 'string' ? body.error : undefined,
    )
  }
  return body.vocabularySet as PublicVocabularyDictationSet
}

export async function getPublicVocabularySet(
  shareId: string,
  signal?: AbortSignal,
): Promise<PublicVocabularySet> {
  const response = await fetch(`/api/public/vocabulary/listen/${encodeURIComponent(shareId)}`, {
    headers: { Accept: 'application/json' },
    signal,
  })
  const body = await readJson(response)
  if (!response.ok) {
    const fallback = response.status === 410
      ? '这份听写单已停止分享。'
      : response.status === 404
        ? '没有找到这份听写单。'
        : '听写单暂时无法打开，请稍后重试。'
    throw new VocabularyApiError(
      typeof body.message === 'string' ? body.message : fallback,
      response.status,
      typeof body.error === 'string' ? body.error : undefined,
    )
  }
  return body.vocabularySet as PublicVocabularySet
}
