import type {
  ApplyAnswerAlignmentResult,
  CreateImportBatchInput,
  CreateImportFileInput,
  CreatePaperSetInput,
  CreateQuestionGroupInput,
  ExportDocxInput,
  ExportDocxResult,
  ExportPdfInput,
  ExportPdfResult,
  ImportAnswerAlignmentDraft,
  ImportBatch,
  ImportBundle,
  ImportBundleDraft,
  ImportFileParseResult,
  ImportFileRecord,
  PaperWorkflow,
  PaperSetDetail,
  PaperSetSummary,
  QuestionGroupCard,
  QuestionGroupDetail,
  RunImportBatchInput,
  TopicLabel,
  UpdateQuestionGroupInput,
} from '../domain/questionBank'

import { apiPath, decodeHeaderValue, errorMessageFromResponse as readErrorMessage } from './httpClient.ts'

type QuestionGroupsResponse = {
  questionGroups: QuestionGroupCard[]
}

export async function fetchQuestionGroups() {
  const response = await fetch(apiPath('/api/question-groups'))

  if (!response.ok) {
    throw new Error(`Failed to load question groups: ${response.status}`)
  }

  const data = (await response.json()) as QuestionGroupsResponse
  return data.questionGroups
}

type QuestionGroupDetailResponse = {
  questionGroup: QuestionGroupDetail
}

export async function fetchQuestionGroupDetail(id: string) {
  const response = await fetch(apiPath(`/api/question-groups/${encodeURIComponent(id)}`))

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `Failed to load question group detail: ${response.status}`))
  }

  const data = (await response.json()) as QuestionGroupDetailResponse
  return data.questionGroup
}

type PaperSetsResponse = {
  paperSets: PaperSetSummary[]
}

type PaperWorkflowsResponse = {
  paperWorkflows: PaperWorkflow[]
}

type ImportFilesResponse = {
  importFiles: ImportFileRecord[]
}

type ImportBundlesResponse = {
  importBundles: ImportBundle[]
}

type ImportBatchesResponse = {
  importBatches: ImportBatch[]
}

type ImportBatchResponse = {
  importBatch: ImportBatch
}

type ImportBundleDraftResponse = {
  draft: ImportBundleDraft
}

type ImportAnswerAlignmentResponse = {
  alignment: ImportAnswerAlignmentDraft
}

type ApplyAnswerAlignmentResponse = {
  result: ApplyAnswerAlignmentResult
}

type ImportFileParseResponse = {
  parse: ImportFileParseResult
}

export async function fetchPaperSets() {
  const response = await fetch(apiPath('/api/paper-sets'))

  if (!response.ok) {
    throw new Error(`Failed to load paper sets: ${response.status}`)
  }

  const data = (await response.json()) as PaperSetsResponse
  return data.paperSets
}

export async function fetchPaperWorkflows() {
  const response = await fetch(apiPath('/api/paper-workflows'))

  if (!response.ok) {
    throw new Error(`Failed to load paper workflows: ${response.status}`)
  }

  const data = (await response.json()) as PaperWorkflowsResponse
  return data.paperWorkflows
}

export async function fetchImportFiles() {
  const response = await fetch(apiPath('/api/import-files'))

  if (!response.ok) {
    throw new Error(`Failed to load import files: ${response.status}`)
  }

  const data = (await response.json()) as ImportFilesResponse
  return data.importFiles
}

export async function fetchImportBundles() {
  const response = await fetch(apiPath('/api/import-bundles'))

  if (!response.ok) {
    throw new Error(`Failed to load import bundles: ${response.status}`)
  }

  const data = (await response.json()) as ImportBundlesResponse
  return data.importBundles
}

export async function fetchImportBatches() {
  const response = await fetch(apiPath('/api/import-batches'))

  if (!response.ok) {
    throw new Error(`Failed to load import batches: ${response.status}`)
  }

  const data = (await response.json()) as ImportBatchesResponse
  return data.importBatches
}

export async function scanImportDirectory(input: CreateImportBatchInput) {
  const response = await fetch(apiPath('/api/import-batches/scan'), {
    body: JSON.stringify(input),
    headers: {
      'content-type': 'application/json',
    },
    method: 'POST',
  })

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `Failed to scan import directory: ${response.status}`))
  }

  const data = (await response.json()) as ImportBatchResponse
  return data.importBatch
}

export async function runImportBatch(id: string, input: RunImportBatchInput = {}) {
  const response = await fetch(apiPath(`/api/import-batches/${encodeURIComponent(id)}/import`), {
    body: JSON.stringify(input),
    headers: {
      'content-type': 'application/json',
    },
    method: 'POST',
  })

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `Failed to run import batch: ${response.status}`))
  }

  const data = (await response.json()) as ImportBatchResponse
  return data.importBatch
}

async function postImportBundleDraft(id: string) {
  const response = await fetch(apiPath(`/api/import-bundles/${encodeURIComponent(id)}/draft`), {
    method: 'POST',
  })

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `Failed to generate import draft: ${response.status}`))
  }

  const data = (await response.json()) as ImportBundleDraftResponse
  return data.draft
}

export async function generateImportBundleDraft(id: string) {
  return postImportBundleDraft(id)
}

export async function generateImportAnswerAlignment(id: string) {
  const response = await fetch(apiPath(`/api/import-bundles/${encodeURIComponent(id)}/answer-alignment`), {
    method: 'POST',
  })

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `Failed to generate answer alignment: ${response.status}`))
  }

  const data = (await response.json()) as ImportAnswerAlignmentResponse
  return data.alignment
}

export async function applyImportAnswerAlignment(
  id: string,
  input: {
    questionGroupId: string
    overwrite?: boolean
  },
) {
  const response = await fetch(apiPath(`/api/import-bundles/${encodeURIComponent(id)}/answer-alignment/apply`), {
    body: JSON.stringify(input),
    headers: {
      'content-type': 'application/json',
    },
    method: 'POST',
  })

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `Failed to apply answer alignment: ${response.status}`))
  }

  const data = (await response.json()) as ApplyAnswerAlignmentResponse
  return data.result
}

export async function fetchImportFileParse(id: string) {
  const response = await fetch(apiPath(`/api/import-files/${encodeURIComponent(id)}/parse`))

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `Failed to load import parse: ${response.status}`))
  }

  const data = (await response.json()) as ImportFileParseResponse
  return data.parse
}

type PaperSetDetailResponse = {
  paperSet: PaperSetDetail
}

export async function fetchPaperSetDetail(id: string) {
  const response = await fetch(apiPath(`/api/paper-sets/${encodeURIComponent(id)}`))

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `Failed to load paper set: ${response.status}`))
  }

  const data = (await response.json()) as PaperSetDetailResponse
  return data.paperSet
}

type CreateQuestionGroupResponse = {
  questionGroup: QuestionGroupCard
}

export async function createQuestionGroup(input: CreateQuestionGroupInput) {
  const response = await fetch(apiPath('/api/question-groups'), {
    body: JSON.stringify(input),
    headers: {
      'content-type': 'application/json',
    },
    method: 'POST',
  })

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `Failed to create question group: ${response.status}`))
  }

  const data = (await response.json()) as CreateQuestionGroupResponse
  return data.questionGroup
}

export async function updateQuestionGroup(id: string, input: UpdateQuestionGroupInput) {
  const response = await fetch(apiPath(`/api/question-groups/${encodeURIComponent(id)}`), {
    body: JSON.stringify(input),
    headers: {
      'content-type': 'application/json',
    },
    method: 'PUT',
  })

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `Failed to update question group: ${response.status}`))
  }

  const data = (await response.json()) as CreateQuestionGroupResponse
  return data.questionGroup
}

export async function deleteQuestionGroup(id: string) {
  const response = await fetch(apiPath(`/api/question-groups/${encodeURIComponent(id)}`), {
    method: 'DELETE',
  })

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `Failed to delete question group: ${response.status}`))
  }
}

type CreateImportFileResponse = {
  importFile: ImportFileRecord
}

export async function uploadImportFile(input: CreateImportFileInput) {
  const response = await fetch(apiPath('/api/import-files'), {
    body: JSON.stringify(input),
    headers: {
      'content-type': 'application/json',
    },
    method: 'POST',
  })

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `Failed to import file: ${response.status}`))
  }

  const data = (await response.json()) as CreateImportFileResponse
  return data.importFile
}

export async function parseImportFile(id: string) {
  const response = await fetch(apiPath(`/api/import-files/${encodeURIComponent(id)}/parse`), {
    method: 'POST',
  })

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `Failed to parse import file: ${response.status}`))
  }

  const data = (await response.json()) as ImportFileParseResponse
  return data.parse
}

export async function deleteImportFile(id: string) {
  const response = await fetch(apiPath(`/api/import-files/${encodeURIComponent(id)}`), {
    method: 'DELETE',
  })

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `Failed to delete import file: ${response.status}`))
  }
}

type CreatePaperSetResponse = {
  paperSet: PaperSetSummary
}

export async function savePaperSet(input: CreatePaperSetInput) {
  const response = await fetch(apiPath('/api/paper-sets'), {
    body: JSON.stringify(input),
    headers: {
      'content-type': 'application/json',
    },
    method: 'POST',
  })

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `Failed to save paper set: ${response.status}`))
  }

  const data = (await response.json()) as CreatePaperSetResponse
  return data.paperSet
}

export async function updatePaperSet(id: string, input: CreatePaperSetInput) {
  const response = await fetch(apiPath(`/api/paper-sets/${encodeURIComponent(id)}`), {
    body: JSON.stringify(input),
    headers: {
      'content-type': 'application/json',
    },
    method: 'PUT',
  })

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `Failed to update paper set: ${response.status}`))
  }

  const data = (await response.json()) as CreatePaperSetResponse
  return data.paperSet
}

export async function exportDocx(input: ExportDocxInput): Promise<ExportDocxResult> {
  const response = await fetch(apiPath('/api/exports/docx'), {
    body: JSON.stringify(input),
    headers: {
      'content-type': 'application/json',
    },
    method: 'POST',
  })

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `Failed to export DOCX: ${response.status}`))
  }

  return {
    blob: await response.blob(),
    fileName: decodeHeaderValue(response.headers.get('x-file-name')) || `${input.title}-${input.versionType}.docx`,
  }
}

export async function exportPdf(input: ExportPdfInput): Promise<ExportPdfResult> {
  const response = await fetch(apiPath('/api/exports/pdf'), {
    body: JSON.stringify(input),
    headers: {
      'content-type': 'application/json',
    },
    method: 'POST',
  })

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `Failed to export PDF: ${response.status}`))
  }

  return {
    blob: await response.blob(),
    fileName: decodeHeaderValue(response.headers.get('x-file-name')) || `${input.title}-${input.versionType}.pdf`,
  }
}

// cut m0-5-ai-daily-limit (C6): verify-question-group has no local fallback, so the
// UI needs to distinguish "AI daily quota exhausted" from any other failure. The
// server returns 429 + { error, code: 'ai-daily-limit-exceeded' } (server/ai-proxy/
// routes.mjs). Kept local to this function rather than folded into the shared
// errorMessageFromResponse/readErrorMessage helper (httpClient.ts), which many other
// services reuse and whose signature stays untouched by this cut.
export const AI_DAILY_LIMIT_EXCEEDED_CODE = 'ai-daily-limit-exceeded'

export class AiDailyLimitExceededError extends Error {
  code = AI_DAILY_LIMIT_EXCEEDED_CODE
  constructor(message: string) {
    super(message)
    this.name = 'AiDailyLimitExceededError'
  }
}

export async function verifyQuestionGroup(questionGroupId: string, apiKey: string, model: string, thinkingMode = false): Promise<import('../domain/questionBank').VerifyQuestionGroupResult> {
  const response = await fetch(apiPath('/api/ai/verify-question-group'), {
    body: JSON.stringify({ questionGroupId, apiKey, model, thinkingMode }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
  if (!response.ok) {
    const fallbackMessage = `Failed to verify: ${response.status}`
    if (response.status === 429) {
      const data = (await response.clone().json().catch(() => null)) as { error?: string; code?: string } | null
      if (data?.code === AI_DAILY_LIMIT_EXCEEDED_CODE) {
        throw new AiDailyLimitExceededError(data.error || fallbackMessage)
      }
    }
    throw new Error(await readErrorMessage(response, fallbackMessage))
  }
  return (await response.json()) as import('../domain/questionBank').VerifyQuestionGroupResult
}

export async function parseGrammarGroup(questionGroupId: string, apiKey: string, model: string, thinkingMode = false): Promise<import('../domain/questionBank').GrammarParseQuestionGroupResult> {
  const response = await fetch(apiPath(`/api/question-groups/${encodeURIComponent(questionGroupId)}/grammar-parse`), {
    body: JSON.stringify({ apiKey, model, thinkingMode, requestId: crypto.randomUUID?.() || '' }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `Failed to parse grammar: ${response.status}`))
  }
  return (await response.json()) as import('../domain/questionBank').GrammarParseQuestionGroupResult
}

export async function parseClozeGroup(questionGroupId: string, apiKey: string, model: string, thinkingMode = false): Promise<import('../domain/questionBank').ClozeParseQuestionGroupResult> {
  const response = await fetch(apiPath(`/api/question-groups/${encodeURIComponent(questionGroupId)}/cloze-parse`), {
    body: JSON.stringify({ apiKey, model, thinkingMode, requestId: crypto.randomUUID?.() || '' }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `Failed to parse cloze: ${response.status}`))
  }
  return (await response.json()) as import('../domain/questionBank').ClozeParseQuestionGroupResult
}

export async function parseSevenChoicesGroup(questionGroupId: string, apiKey: string, model: string, thinkingMode = false): Promise<import('../domain/questionBank').SevenChoicesParseQuestionGroupResult> {
  const response = await fetch(apiPath(`/api/question-groups/${encodeURIComponent(questionGroupId)}/seven-choices-parse`), {
    body: JSON.stringify({ apiKey, model, thinkingMode, requestId: crypto.randomUUID?.() || '' }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `Failed to parse seven choices: ${response.status}`))
  }
  return (await response.json()) as import('../domain/questionBank').SevenChoicesParseQuestionGroupResult
}

export async function saveClozeParseResultRequest(questionGroupId: string, clozeParseResult: import('../domain/questionBank').ClozeParseQuestionGroupResult): Promise<{ clozeParseResult: import('../domain/questionBank').ClozeParseQuestionGroupResult }> {
  const response = await fetch(apiPath(`/api/question-groups/${encodeURIComponent(questionGroupId)}/cloze-parse`), {
    body: JSON.stringify({ clozeParseResult }),
    headers: { 'content-type': 'application/json' },
    method: 'PUT',
  })
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `Failed to save cloze parse: ${response.status}`))
  }
  return (await response.json()) as { clozeParseResult: import('../domain/questionBank').ClozeParseQuestionGroupResult }
}

export async function saveSevenChoicesParseResultRequest(questionGroupId: string, sevenChoicesParseResult: import('../domain/questionBank').SevenChoicesParseQuestionGroupResult): Promise<{ sevenChoicesParseResult: import('../domain/questionBank').SevenChoicesParseQuestionGroupResult }> {
  const response = await fetch(apiPath(`/api/question-groups/${encodeURIComponent(questionGroupId)}/seven-choices-parse`), {
    body: JSON.stringify({ sevenChoicesParseResult }),
    headers: { 'content-type': 'application/json' },
    method: 'PUT',
  })
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `Failed to save seven choices parse: ${response.status}`))
  }
  return (await response.json()) as { sevenChoicesParseResult: import('../domain/questionBank').SevenChoicesParseQuestionGroupResult }
}

export async function saveGrammarParseResultRequest(questionGroupId: string, grammarParseResult: import('../domain/questionBank').GrammarParseQuestionGroupResult): Promise<{ grammarParseResult: import('../domain/questionBank').GrammarParseQuestionGroupResult }> {
  const response = await fetch(apiPath(`/api/question-groups/${encodeURIComponent(questionGroupId)}/grammar-parse`), {
    body: JSON.stringify({ grammarParseResult }),
    headers: { 'content-type': 'application/json' },
    method: 'PUT',
  })
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `Failed to save grammar parse: ${response.status}`))
  }
  return (await response.json()) as { grammarParseResult: import('../domain/questionBank').GrammarParseQuestionGroupResult }
}

export async function saveReadingParseResult(
  questionGroupId: string,
  readingParseResult: import('../domain/questionBank').ReadingParseQuestionGroupResult,
  verifyResult: import('../domain/questionBank').VerifyQuestionGroupResult | null,
): Promise<{
  readingParseResult: import('../domain/questionBank').ReadingParseQuestionGroupResult
  verifyResult: import('../domain/questionBank').VerifyQuestionGroupResult | null
  questionGroup?: import('../domain/questionBank').QuestionGroupCard | null
  difficultySyncWarnings?: string[]
}> {
  const response = await fetch(apiPath(`/api/question-groups/${encodeURIComponent(questionGroupId)}/reading-parse`), {
    body: JSON.stringify({ readingParseResult, verifyResult }),
    headers: { 'content-type': 'application/json' },
    method: 'PUT',
  })
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `Failed to save reading parse: ${response.status}`))
  }
  return (await response.json()) as {
    readingParseResult: import('../domain/questionBank').ReadingParseQuestionGroupResult
    verifyResult: import('../domain/questionBank').VerifyQuestionGroupResult | null
    questionGroup?: import('../domain/questionBank').QuestionGroupCard | null
    difficultySyncWarnings?: string[]
  }
}

export async function parseReadingQuestionGroup(
  questionGroupId: string,
  apiKey: string,
  model: string,
  thinkingMode = false,
): Promise<import('../domain/questionBank').ReadingParseQuestionGroupResult> {
  const response = await fetch(apiPath(`/api/question-groups/${encodeURIComponent(questionGroupId)}/reading-parse`), {
    body: JSON.stringify({ apiKey, model, thinkingMode, requestId: crypto.randomUUID?.() || '' }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `Failed to parse reading: ${response.status}`))
  }
  return (await response.json()) as import('../domain/questionBank').ReadingParseQuestionGroupResult
}

export type GenerateQuestionGroupSummaryResult = {
  questionGroupId: string
  title: string
  summary: string
  questionGroup: QuestionGroupCard
  provider?: string
  model?: string
  thinkingMode?: boolean
  keySource?: string
  keyFingerprint?: string
  keyMask?: string
  requestId?: string
  totalLatencyMs?: number
  pipeline?: string
  fallbackUsed?: boolean
}

export async function generateQuestionGroupSummary(
  questionGroupId: string,
  apiKey: string,
  model: string,
  thinkingMode = false,
): Promise<GenerateQuestionGroupSummaryResult> {
  const response = await fetch(apiPath(`/api/question-groups/${encodeURIComponent(questionGroupId)}/summary`), {
    body: JSON.stringify({ apiKey, model, thinkingMode, requestId: crypto.randomUUID?.() || '' }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `Failed to generate summary: ${response.status}`))
  }
  return (await response.json()) as GenerateQuestionGroupSummaryResult
}

export type GenerateTopicLabelsResult = {
  questionGroupId: string
  title: string
  topicLabels: TopicLabel[]
  provider?: string
  model?: string
  thinkingMode?: boolean
  keySource?: string
  keyFingerprint?: string
  keyMask?: string
  requestId?: string
  totalLatencyMs?: number
  pipeline?: string
  fallbackUsed?: boolean
}

export async function generateTopicLabels(
  questionGroupId: string,
  apiKey: string,
  model: string,
  thinkingMode = false,
): Promise<GenerateTopicLabelsResult> {
  const response = await fetch(apiPath(`/api/question-groups/${encodeURIComponent(questionGroupId)}/topic-labels`), {
    body: JSON.stringify({ apiKey, model, thinkingMode, requestId: crypto.randomUUID?.() || '' }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `Failed to generate topic labels: ${response.status}`))
  }
  return (await response.json()) as GenerateTopicLabelsResult
}

export async function bindTopicLabels(
  questionGroupId: string,
  topicLabels: TopicLabel[],
): Promise<{ questionGroupId: string; topicLabels: TopicLabel[] }> {
  const response = await fetch(apiPath(`/api/question-groups/${encodeURIComponent(questionGroupId)}/topic-labels`), {
    body: JSON.stringify({ topicLabels }),
    headers: { 'content-type': 'application/json' },
    method: 'PUT',
  })
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `Failed to bind topic labels: ${response.status}`))
  }
  return (await response.json()) as { questionGroupId: string; topicLabels: TopicLabel[] }
}

export type SemanticSearchMatch = {
  questionGroupId: string
  score: number
  reason: string
  questionGroup: QuestionGroupCard
}

export type SemanticSearchResult = {
  query: string
  matches: SemanticSearchMatch[]
  provider?: string
  model?: string
  thinkingMode?: boolean
  keySource?: string
  keyFingerprint?: string
  keyMask?: string
  requestId?: string
  totalLatencyMs?: number
  pipeline?: string
  fallbackUsed?: boolean
}

export type QuestionBankStewardResult = {
  query: string
  assistantMessage: string
  needsClarification: boolean
  clarificationQuestion?: string
  intent?: {
    intent?: string
    similarityDimension?: string
    rewrittenQuery?: string
    filters?: Record<string, unknown>
  }
  search?: SemanticSearchResult
  matches: SemanticSearchMatch[]
  provider?: string
  model?: string
  thinkingMode?: boolean
  keySource?: string
  keyFingerprint?: string
  keyMask?: string
  requestId?: string
  totalLatencyMs?: number
  pipeline?: string
}

export async function semanticSearchQuestionGroups(query: string, apiKey: string): Promise<SemanticSearchResult> {
  const response = await fetch(apiPath('/api/ai/semantic-search'), {
    body: JSON.stringify({
      query,
      apiKey,
      model: 'deepseek-v4-flash',
      thinkingMode: false,
      requestId: crypto.randomUUID?.() || '',
    }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `Failed to run semantic search: ${response.status}`))
  }
  return (await response.json()) as SemanticSearchResult
}

export async function askQuestionBankSteward(message: string, apiKey: string, thinkingMode = false): Promise<QuestionBankStewardResult> {
  const response = await fetch(apiPath('/api/ai/question-bank-steward'), {
    body: JSON.stringify({
      message,
      apiKey,
      model: 'deepseek-v4-flash',
      thinkingMode: thinkingMode,
      requestId: crypto.randomUUID?.() || '',
    }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `Failed to ask question-bank steward: ${response.status}`))
  }
  return (await response.json()) as QuestionBankStewardResult
}

export async function exportPrintHtml(input: ExportDocxInput): Promise<ExportDocxResult> {
  const response = await fetch(apiPath('/api/exports/print-html'), {
    body: JSON.stringify(input),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `Failed to export print HTML: ${response.status}`))
  }
  return {
    blob: await response.blob(),
    fileName: decodeHeaderValue(response.headers.get('x-file-name')) || `${input.title}-精排.html`,
  }
}

/**
 * Map a print-pdf failure (status + message) to a friendly Chinese error string.
 * Pure function for use by exportPrintPdf and verification scripts.
 *
 * Precedence:
 *   1. Vivliostyle / 503 (renderer not installed) — most specific.
 *   2. 404 / "not found" — route missing (likely stale backend process).
 *   3. Other 5xx — generic wrapper.
 */
export function mapPrintPdfError(status: number, rawMessage: string): string {
  if (status === 503 || /vivliostyle/i.test(rawMessage)) {
    return '精排 PDF 渲染器未就绪：请在 server 目录运行 npm install 以安装 @vivliostyle/cli'
  }
  if (status === 404 || /not\s*found/i.test(rawMessage)) {
    return '后端未加载精排 PDF 路由，请重启题库 API 服务（旧进程可能还在监听）'
  }
  return `精排 PDF 生成失败：${rawMessage}`
}

export async function exportPrintPdf(input: ExportDocxInput): Promise<ExportPdfResult> {
  let response: Response
  try {
    response = await fetch(apiPath('/api/exports/print-pdf'), {
      body: JSON.stringify(input),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
  } catch (networkError) {
    throw new Error('题库 API 服务无法连接：请确认后端进程已启动')
  }
  if (!response.ok) {
    const rawMessage = await readErrorMessage(response, `导出精排 PDF 失败：${response.status}`)
    throw new Error(mapPrintPdfError(response.status, rawMessage))
  }
  return {
    blob: await response.blob(),
    fileName: decodeHeaderValue(response.headers.get('x-file-name')) || `${input.title}-精排.pdf`,
  }
}

export type BackfillTopicLabelsResult = {
  processed: number
  labeled: number
  skipped: number
  failed: Array<{ id: string; error: string }>
}

export async function backfillTopicLabels(input: {
  apiKey: string
  model?: string
}): Promise<BackfillTopicLabelsResult> {
  const response = await fetch(apiPath('/api/topic-labels/backfill'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `批量打主题标签失败：${response.status}`))
  }
  return response.json() as Promise<BackfillTopicLabelsResult>
}
