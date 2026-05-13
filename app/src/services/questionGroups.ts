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
  SynonymDifficultyQuestionGroupResult,
  TopicLabel,
  UpdateQuestionGroupInput,
} from '../domain/questionBank'

type QuestionGroupsResponse = {
  questionGroups: QuestionGroupCard[]
}

export async function fetchQuestionGroups() {
  const response = await fetch('/api/question-groups')

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
  const response = await fetch(`/api/question-groups/${encodeURIComponent(id)}`)

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(data?.error || `Failed to load question group detail: ${response.status}`)
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
  const response = await fetch('/api/paper-sets')

  if (!response.ok) {
    throw new Error(`Failed to load paper sets: ${response.status}`)
  }

  const data = (await response.json()) as PaperSetsResponse
  return data.paperSets
}

export async function fetchPaperWorkflows() {
  const response = await fetch('/api/paper-workflows')

  if (!response.ok) {
    throw new Error(`Failed to load paper workflows: ${response.status}`)
  }

  const data = (await response.json()) as PaperWorkflowsResponse
  return data.paperWorkflows
}

export async function fetchImportFiles() {
  const response = await fetch('/api/import-files')

  if (!response.ok) {
    throw new Error(`Failed to load import files: ${response.status}`)
  }

  const data = (await response.json()) as ImportFilesResponse
  return data.importFiles
}

export async function fetchImportBundles() {
  const response = await fetch('/api/import-bundles')

  if (!response.ok) {
    throw new Error(`Failed to load import bundles: ${response.status}`)
  }

  const data = (await response.json()) as ImportBundlesResponse
  return data.importBundles
}

export async function fetchImportBatches() {
  const response = await fetch('/api/import-batches')

  if (!response.ok) {
    throw new Error(`Failed to load import batches: ${response.status}`)
  }

  const data = (await response.json()) as ImportBatchesResponse
  return data.importBatches
}

export async function scanImportDirectory(input: CreateImportBatchInput) {
  const response = await fetch('/api/import-batches/scan', {
    body: JSON.stringify(input),
    headers: {
      'content-type': 'application/json',
    },
    method: 'POST',
  })

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(data?.error || `Failed to scan import directory: ${response.status}`)
  }

  const data = (await response.json()) as ImportBatchResponse
  return data.importBatch
}

export async function runImportBatch(id: string, input: RunImportBatchInput = {}) {
  const response = await fetch(`/api/import-batches/${encodeURIComponent(id)}/import`, {
    body: JSON.stringify(input),
    headers: {
      'content-type': 'application/json',
    },
    method: 'POST',
  })

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(data?.error || `Failed to run import batch: ${response.status}`)
  }

  const data = (await response.json()) as ImportBatchResponse
  return data.importBatch
}

async function postImportBundleDraft(id: string) {
  const response = await fetch(`/api/import-bundles/${encodeURIComponent(id)}/draft`, {
    method: 'POST',
  })

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(data?.error || `Failed to generate import draft: ${response.status}`)
  }

  const data = (await response.json()) as ImportBundleDraftResponse
  return data.draft
}

export async function generateImportBundleDraft(id: string) {
  return postImportBundleDraft(id)
}

export async function generateImportAnswerAlignment(id: string) {
  const response = await fetch(`/api/import-bundles/${encodeURIComponent(id)}/answer-alignment`, {
    method: 'POST',
  })

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(data?.error || `Failed to generate answer alignment: ${response.status}`)
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
  const response = await fetch(`/api/import-bundles/${encodeURIComponent(id)}/answer-alignment/apply`, {
    body: JSON.stringify(input),
    headers: {
      'content-type': 'application/json',
    },
    method: 'POST',
  })

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(data?.error || `Failed to apply answer alignment: ${response.status}`)
  }

  const data = (await response.json()) as ApplyAnswerAlignmentResponse
  return data.result
}

export async function fetchImportFileParse(id: string) {
  const response = await fetch(`/api/import-files/${encodeURIComponent(id)}/parse`)

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(data?.error || `Failed to load import parse: ${response.status}`)
  }

  const data = (await response.json()) as ImportFileParseResponse
  return data.parse
}

type PaperSetDetailResponse = {
  paperSet: PaperSetDetail
}

export async function fetchPaperSetDetail(id: string) {
  const response = await fetch(`/api/paper-sets/${encodeURIComponent(id)}`)

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(data?.error || `Failed to load paper set: ${response.status}`)
  }

  const data = (await response.json()) as PaperSetDetailResponse
  return data.paperSet
}

type CreateQuestionGroupResponse = {
  questionGroup: QuestionGroupCard
}

export async function createQuestionGroup(input: CreateQuestionGroupInput) {
  const response = await fetch('/api/question-groups', {
    body: JSON.stringify(input),
    headers: {
      'content-type': 'application/json',
    },
    method: 'POST',
  })

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(data?.error || `Failed to create question group: ${response.status}`)
  }

  const data = (await response.json()) as CreateQuestionGroupResponse
  return data.questionGroup
}

export async function updateQuestionGroup(id: string, input: UpdateQuestionGroupInput) {
  const response = await fetch(`/api/question-groups/${encodeURIComponent(id)}`, {
    body: JSON.stringify(input),
    headers: {
      'content-type': 'application/json',
    },
    method: 'PUT',
  })

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(data?.error || `Failed to update question group: ${response.status}`)
  }

  const data = (await response.json()) as CreateQuestionGroupResponse
  return data.questionGroup
}

export async function deleteQuestionGroup(id: string) {
  const response = await fetch(`/api/question-groups/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(data?.error || `Failed to delete question group: ${response.status}`)
  }
}

type CreateImportFileResponse = {
  importFile: ImportFileRecord
}

export async function uploadImportFile(input: CreateImportFileInput) {
  const response = await fetch('/api/import-files', {
    body: JSON.stringify(input),
    headers: {
      'content-type': 'application/json',
    },
    method: 'POST',
  })

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(data?.error || `Failed to import file: ${response.status}`)
  }

  const data = (await response.json()) as CreateImportFileResponse
  return data.importFile
}

export async function parseImportFile(id: string) {
  const response = await fetch(`/api/import-files/${encodeURIComponent(id)}/parse`, {
    method: 'POST',
  })

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(data?.error || `Failed to parse import file: ${response.status}`)
  }

  const data = (await response.json()) as ImportFileParseResponse
  return data.parse
}

export async function deleteImportFile(id: string) {
  const response = await fetch(`/api/import-files/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(data?.error || `Failed to delete import file: ${response.status}`)
  }
}

type CreatePaperSetResponse = {
  paperSet: PaperSetSummary
}

export async function savePaperSet(input: CreatePaperSetInput) {
  const response = await fetch('/api/paper-sets', {
    body: JSON.stringify(input),
    headers: {
      'content-type': 'application/json',
    },
    method: 'POST',
  })

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(data?.error || `Failed to save paper set: ${response.status}`)
  }

  const data = (await response.json()) as CreatePaperSetResponse
  return data.paperSet
}

export async function updatePaperSet(id: string, input: CreatePaperSetInput) {
  const response = await fetch(`/api/paper-sets/${encodeURIComponent(id)}`, {
    body: JSON.stringify(input),
    headers: {
      'content-type': 'application/json',
    },
    method: 'PUT',
  })

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(data?.error || `Failed to update paper set: ${response.status}`)
  }

  const data = (await response.json()) as CreatePaperSetResponse
  return data.paperSet
}

function decodeHeaderValue(value: string | null) {
  if (!value) return ''

  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export async function exportDocx(input: ExportDocxInput): Promise<ExportDocxResult> {
  const response = await fetch('/api/exports/docx', {
    body: JSON.stringify(input),
    headers: {
      'content-type': 'application/json',
    },
    method: 'POST',
  })

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(data?.error || `Failed to export DOCX: ${response.status}`)
  }

  return {
    blob: await response.blob(),
    fileName: decodeHeaderValue(response.headers.get('x-file-name')) || `${input.title}-${input.versionType}.docx`,
  }
}

export async function exportPdf(input: ExportPdfInput): Promise<ExportPdfResult> {
  const response = await fetch('/api/exports/pdf', {
    body: JSON.stringify(input),
    headers: {
      'content-type': 'application/json',
    },
    method: 'POST',
  })

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(data?.error || `Failed to export PDF: ${response.status}`)
  }

  return {
    blob: await response.blob(),
    fileName: decodeHeaderValue(response.headers.get('x-file-name')) || `${input.title}-${input.versionType}.pdf`,
  }
}

export async function verifyQuestionGroup(questionGroupId: string, apiKey: string, model: string, thinkingMode = false): Promise<import('../domain/questionBank').VerifyQuestionGroupResult> {
  const response = await fetch('/api/ai/verify-question-group', {
    body: JSON.stringify({ questionGroupId, apiKey, model, thinkingMode }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(data?.error || `Failed to verify: ${response.status}`)
  }
  return (await response.json()) as import('../domain/questionBank').VerifyQuestionGroupResult
}

export async function parseGrammarGroup(questionGroupId: string, apiKey: string, model: string, thinkingMode = false): Promise<import('../domain/questionBank').GrammarParseQuestionGroupResult> {
  const response = await fetch(`/api/question-groups/${encodeURIComponent(questionGroupId)}/grammar-parse`, {
    body: JSON.stringify({ apiKey, model, thinkingMode, requestId: crypto.randomUUID?.() || '' }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(data?.error || `Failed to parse grammar: ${response.status}`)
  }
  return (await response.json()) as import('../domain/questionBank').GrammarParseQuestionGroupResult
}

export async function parseClozeGroup(questionGroupId: string, apiKey: string, model: string, thinkingMode = false): Promise<import('../domain/questionBank').ClozeParseQuestionGroupResult> {
  const response = await fetch(`/api/question-groups/${encodeURIComponent(questionGroupId)}/cloze-parse`, {
    body: JSON.stringify({ apiKey, model, thinkingMode, requestId: crypto.randomUUID?.() || '' }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(data?.error || `Failed to parse cloze: ${response.status}`)
  }
  return (await response.json()) as import('../domain/questionBank').ClozeParseQuestionGroupResult
}

export async function parseSevenChoicesGroup(questionGroupId: string, apiKey: string, model: string, thinkingMode = false): Promise<import('../domain/questionBank').SevenChoicesParseQuestionGroupResult> {
  const response = await fetch(`/api/question-groups/${encodeURIComponent(questionGroupId)}/seven-choices-parse`, {
    body: JSON.stringify({ apiKey, model, thinkingMode, requestId: crypto.randomUUID?.() || '' }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(data?.error || `Failed to parse seven choices: ${response.status}`)
  }
  return (await response.json()) as import('../domain/questionBank').SevenChoicesParseQuestionGroupResult
}

export async function saveClozeParseResultRequest(questionGroupId: string, clozeParseResult: import('../domain/questionBank').ClozeParseQuestionGroupResult): Promise<{ clozeParseResult: import('../domain/questionBank').ClozeParseQuestionGroupResult }> {
  const response = await fetch(`/api/question-groups/${encodeURIComponent(questionGroupId)}/cloze-parse`, {
    body: JSON.stringify({ clozeParseResult }),
    headers: { 'content-type': 'application/json' },
    method: 'PUT',
  })
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(data?.error || `Failed to save cloze parse: ${response.status}`)
  }
  return (await response.json()) as { clozeParseResult: import('../domain/questionBank').ClozeParseQuestionGroupResult }
}

export async function saveSevenChoicesParseResultRequest(questionGroupId: string, sevenChoicesParseResult: import('../domain/questionBank').SevenChoicesParseQuestionGroupResult): Promise<{ sevenChoicesParseResult: import('../domain/questionBank').SevenChoicesParseQuestionGroupResult }> {
  const response = await fetch(`/api/question-groups/${encodeURIComponent(questionGroupId)}/seven-choices-parse`, {
    body: JSON.stringify({ sevenChoicesParseResult }),
    headers: { 'content-type': 'application/json' },
    method: 'PUT',
  })
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(data?.error || `Failed to save seven choices parse: ${response.status}`)
  }
  return (await response.json()) as { sevenChoicesParseResult: import('../domain/questionBank').SevenChoicesParseQuestionGroupResult }
}

export async function saveGrammarParseResultRequest(questionGroupId: string, grammarParseResult: import('../domain/questionBank').GrammarParseQuestionGroupResult): Promise<{ grammarParseResult: import('../domain/questionBank').GrammarParseQuestionGroupResult }> {
  const response = await fetch(`/api/question-groups/${encodeURIComponent(questionGroupId)}/grammar-parse`, {
    body: JSON.stringify({ grammarParseResult }),
    headers: { 'content-type': 'application/json' },
    method: 'PUT',
  })
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(data?.error || `Failed to save grammar parse: ${response.status}`)
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
}> {
  const response = await fetch(`/api/question-groups/${encodeURIComponent(questionGroupId)}/reading-parse`, {
    body: JSON.stringify({ readingParseResult, verifyResult }),
    headers: { 'content-type': 'application/json' },
    method: 'PUT',
  })
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(data?.error || `Failed to save reading parse: ${response.status}`)
  }
  return (await response.json()) as {
    readingParseResult: import('../domain/questionBank').ReadingParseQuestionGroupResult
    verifyResult: import('../domain/questionBank').VerifyQuestionGroupResult | null
    questionGroup?: import('../domain/questionBank').QuestionGroupCard | null
  }
}

export async function parseReadingQuestionGroup(
  questionGroupId: string,
  apiKey: string,
  model: string,
  thinkingMode = false,
): Promise<import('../domain/questionBank').ReadingParseQuestionGroupResult> {
  const response = await fetch(`/api/question-groups/${encodeURIComponent(questionGroupId)}/reading-parse`, {
    body: JSON.stringify({ apiKey, model, thinkingMode, requestId: crypto.randomUUID?.() || '' }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(data?.error || `Failed to parse reading: ${response.status}`)
  }
  return (await response.json()) as import('../domain/questionBank').ReadingParseQuestionGroupResult
}

export async function generateSynonymDifficulty(
  questionGroupId: string,
  readingParseResult?: import('../domain/questionBank').ReadingParseQuestionGroupResult | null,
): Promise<SynonymDifficultyQuestionGroupResult> {
  const response = await fetch(`/api/question-groups/${encodeURIComponent(questionGroupId)}/synonym-difficulty`, {
    body: JSON.stringify({ readingParseResult, requestId: crypto.randomUUID?.() || '' }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(data?.error || `Failed to generate synonym difficulty: ${response.status}`)
  }
  return (await response.json()) as SynonymDifficultyQuestionGroupResult
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
  const response = await fetch(`/api/question-groups/${encodeURIComponent(questionGroupId)}/summary`, {
    body: JSON.stringify({ apiKey, model, thinkingMode, requestId: crypto.randomUUID?.() || '' }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(data?.error || `Failed to generate summary: ${response.status}`)
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
  const response = await fetch(`/api/question-groups/${encodeURIComponent(questionGroupId)}/topic-labels`, {
    body: JSON.stringify({ apiKey, model, thinkingMode, requestId: crypto.randomUUID?.() || '' }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(data?.error || `Failed to generate topic labels: ${response.status}`)
  }
  return (await response.json()) as GenerateTopicLabelsResult
}

export async function bindTopicLabels(
  questionGroupId: string,
  topicLabels: TopicLabel[],
): Promise<{ questionGroupId: string; topicLabels: TopicLabel[] }> {
  const response = await fetch(`/api/question-groups/${encodeURIComponent(questionGroupId)}/topic-labels`, {
    body: JSON.stringify({ topicLabels }),
    headers: { 'content-type': 'application/json' },
    method: 'PUT',
  })
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(data?.error || `Failed to bind topic labels: ${response.status}`)
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
  const response = await fetch('/api/ai/semantic-search', {
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
    const data = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(data?.error || `Failed to run semantic search: ${response.status}`)
  }
  return (await response.json()) as SemanticSearchResult
}

export async function askQuestionBankSteward(message: string, apiKey: string): Promise<QuestionBankStewardResult> {
  const response = await fetch('/api/ai/question-bank-steward', {
    body: JSON.stringify({
      message,
      apiKey,
      model: 'deepseek-v4-flash',
      thinkingMode: false,
      requestId: crypto.randomUUID?.() || '',
    }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(data?.error || `Failed to ask question-bank steward: ${response.status}`)
  }
  return (await response.json()) as QuestionBankStewardResult
}
