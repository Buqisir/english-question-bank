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

export type VocabularyProgramDto = {
  id: string
  version: string
  title: string
  subtitle: string
  sourceTitle: string
  sourceEdition: string
  totalPlannedEntries: number
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
    examFrequency: number
    pronunciationMode: 'syllables' | 'forms'
    syllables: Array<string | VocabularyPronunciationPart>
    pronunciationParts?: VocabularyPronunciationParts
    example: {
      english: string
      chinese: string
      highlight: string
      reviewStatus: 'approved'
    }
    visual: VocabularyVisualAsset
    audio: VocabularyAudioAsset
    source: {
      title: string
      edition: string
      stage: VocabularyStage
      day: number
      sourceOrder: number
      printedPage: number
      verification: 'page-checked'
    }
  }>
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

export async function getVocabularyProgram(): Promise<VocabularyProgramDto> {
  const body = await requestJson('/api/vocabulary/programs/wanwei-round-one-v1')
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

export async function getVocabularyProgress(studentId: string): Promise<{ cursor: number; lastTarget: number }> {
  const body = await requestJson(`/api/vocabulary/progress/wanwei-round-one-v1?studentId=${encodeURIComponent(studentId)}`)
  return body.progress as { cursor: number; lastTarget: number }
}

export async function setVocabularyProgressStart(
  studentId: string,
  entryId: string,
  replaceActiveRun: boolean,
): Promise<{
  progress: { cursor: number; lastTarget: number }
  startEntry: { id: string; headword: string; sourceOrder: number }
  discardedRunId: string | null
}> {
  const body = await requestJson('/api/vocabulary/progress/wanwei-round-one-v1', {
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
  studentId: string,
  targetUnfamiliarCount: number,
  scope: { mode?: 'main' | 'temporary'; stage?: VocabularyStage; day?: number } = {},
): Promise<VocabularyReviewRunDto> {
  const body = await requestJson('/api/vocabulary/review-runs', {
    method: 'POST',
    body: JSON.stringify({
      studentId,
      programId: 'wanwei-round-one-v1',
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

export async function getCurrentVocabularyReviewRun(studentId: string): Promise<VocabularyReviewRunDto | null> {
  const query = new URLSearchParams({
    studentId,
    programId: 'wanwei-round-one-v1',
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

export async function listVocabularySets(studentId: string): Promise<VocabularySetDto[]> {
  const body = await requestJson(`/api/vocabulary/sets?studentId=${encodeURIComponent(studentId)}`)
  return body.vocabularySets as VocabularySetDto[]
}

export async function getVocabularySet(setId: string): Promise<VocabularySetDto> {
  const body = await requestJson(`/api/vocabulary/sets/${encodeURIComponent(setId)}`)
  return body.vocabularySet as VocabularySetDto
}

export async function createVocabularySetFromEntries(
  studentId: string,
  entryIds: string[],
  title?: string,
): Promise<VocabularySetDto> {
  const body = await requestJson('/api/vocabulary/sets', {
    method: 'POST',
    body: JSON.stringify({
      studentId,
      programId: 'wanwei-round-one-v1',
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

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
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
  kind: 'cards' | 'dictation' | 'answer' = 'cards',
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
  downloadBlob(blob, fileName)
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
