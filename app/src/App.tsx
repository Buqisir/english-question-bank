import {
  Archive,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  FileText,
  LogOut,
  RefreshCw,
  Tag,
  Trash2,
  X,
} from 'lucide-react'
import type { FormEvent } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { questionGroups as sampleQuestionGroups } from './data/sampleQuestionGroups'
import {
  type ApplyAnswerAlignmentResult,
  groupTypeLabel,
  type CreateQuestionGroupInput,
  type GroupType,
  type ImportAnswerAlignmentDraft,
  type ImportBatch,
  type ImportBundle,
  type ImportBundleDraft,
  type ImportDraftGroup,
  type ImportContentRole,
  type ImportFileParseResult,
  type ImportFileRecord,
  type PaperSetSummary,
  type PaperWorkflow,
  type QuestionGroupCard,
  type QuestionGroupDetail,
  type VerifyQuestionGroupResult,
  type ReadingParseQuestionGroupResult,
  type ClozeParseQuestionGroupResult,
  type SevenChoicesParseQuestionGroupResult,
  type GrammarParseQuestionGroupResult,
  type VerifyResult,
} from './domain/questionBank'
import { usePaperDraft } from './paperAssembly/usePaperDraft'
import type { PaperDraftEditReason } from './paperAssembly/paperDraftModel'
import { createBasketItem } from './paperAssembly/paperDraftModel'
import { ConciergeDesk } from './concierge/ConciergeDesk'
import { useConciergeDesk } from './concierge/useConciergeDesk'
import { usePaperExports } from './paperAssembly/usePaperExports'
import {
  applyImportAnswerAlignment,
  createQuestionGroup,
  deleteImportFile as deleteImportFileRequest,
  fetchImportBatches,
  fetchImportBundles,
  fetchImportFiles,
  fetchImportFileParse,
  fetchPaperSets,
  fetchPaperWorkflows,
  deleteQuestionGroup as deleteQuestionGroupRequest,
  fetchQuestionGroupDetail,
  fetchQuestionGroups,
  generateImportAnswerAlignment,
  generateImportBundleDraft,
  runImportBatch,
  savePaperSet,
  updatePaperSet as updatePaperSetRequest,
  scanImportDirectory,
  uploadImportFile,
  parseImportFile as parseImportFileRequest,
  backfillTopicLabels,
  type BackfillTopicLabelsResult,
} from './services/questionGroups'
import { PaperIntelligencePreview } from './features/paper-intelligence/PaperIntelligencePreview'
import type { PaperIntelligenceRouteMatch } from './features/paper-intelligence/paperIntelligenceRoute'
// Issue #21-C1: PaperSurface harness replaces the old prototype on
// `?view=paper-intelligence&surface=paper`. Default PI route is
// unchanged when the surface field is absent. There is no compat
// branch for the legacy `surface=print` value — it falls back to
// default like any other unknown surface.
import { PaperIntelligencePaperSurfaceHarness } from './features/paper-intelligence/PaperIntelligencePaperSurfaceHarness'
import { PaperImportAiWorkbench } from './features/paper-import-ai/PaperImportAiWorkbench'
import { DraftPaperWorkbench } from './features/draft-paper/DraftPaperWorkbench'
import { MySpacePage } from './features/my-space/MySpacePage'
import { AdminWorkbench } from './features/admin/AdminWorkbench'
import { addGroupToCurrentDraftPaper as addGroupToCurrentDraftPaperRequest } from './services/draftPapers'
import { useCurrentUser, useIsOwnerView } from './auth/AuthGate.tsx'
import { logout } from './auth/session.ts'
import { EntryModal } from './workbench/EntryModal'
import { QuestionGroupDetailView } from './features/question-detail/QuestionGroupDetailView'
import { compactPreview } from './features/question-detail/detailHelpers'

function readFileAsBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      resolve(result.includes(',') ? result.split(',')[1] : result)
    }
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

const importContentRoleLabel: Record<ImportContentRole, string> = {
  question: '题目文件',
  answer_analysis: '答案解析文件',
  question_with_analysis: '题目+解析同文件',
  other: '其他资料',
}

const importBundleReadinessLabel: Record<ImportBundle['readiness'], string> = {
  single_file_ready: '题解同文件',
  paired_files_ready: '题解已配对',
  missing_analysis: '缺解析',
  missing_question: '缺题目',
  reference_only: '参考资料',
}

/**
 * Lifecycle stage of an import bundle, derived from existing fields only.
 * No new backend or schema. Used to group the bundle list into
 * 需要你处理 / 处理中 / 已完成 sections.
 *
 * Rules:
 *   - 'processing'  : bundle still has files awaiting parse (parsedCount < fileCount)
 *                     OR per-bundle async work (draft generation / answer alignment) is running.
 *   - 'actionable'  : parsed but the next teacher action is needed:
 *                     · readiness in missing_analysis / missing_question (补解析)
 *                     · OR draft has not been generated yet (草稿确认)
 *                     · OR draft generation just errored
 *   - 'done'        : everything parsed AND readiness is single_file_ready / paired_files_ready
 *                     AND no per-bundle async work in flight.
 *   - reference_only stays in 'done' (it's a reference, no further action expected).
 */
type ImportBundleStage = 'actionable' | 'processing' | 'done'

type BundleNextStep = {
  /** Stage bucket for grouping. */
  stage: ImportBundleStage
  /** Human-language status message shown on the row. */
  statusLabel: string
  /** Suggested primary action's button label, or null when no primary action applies. */
  primaryActionLabel: string | null
  /**
   * Which existing handler should the primary action invoke?
   *   - 'generate-draft'  → handleGenerateImportDraft
   *   - 'add-analysis'    → prepareAnswerAnalysisImport
   *   - 'align-answers'   → handleGenerateAnswerAlignment
   *   - null              → no primary action (stage = processing or done)
   */
  primaryAction: 'generate-draft' | 'add-analysis' | 'align-answers' | null
}

function deriveBundleNextStep(
  bundle: ImportBundle,
  perBundleDraftStatus: 'idle' | 'generating' | 'generated' | 'error' | undefined,
  perBundleAlignmentStatus: 'idle' | 'generating' | 'generated' | 'error' | undefined,
): BundleNextStep {
  const isDraftRunning = perBundleDraftStatus === 'generating'
  const isAlignRunning = perBundleAlignmentStatus === 'generating'

  if (bundle.fileCount === 0) {
    return { stage: 'processing', statusLabel: '等待文件上传', primaryActionLabel: null, primaryAction: null }
  }

  if (bundle.parsedCount < bundle.fileCount) {
    return {
      stage: 'processing',
      statusLabel: `AI 解析中（${bundle.parsedCount}/${bundle.fileCount}）`,
      primaryActionLabel: null,
      primaryAction: null,
    }
  }

  if (isDraftRunning) {
    return { stage: 'processing', statusLabel: '正在生成草稿…', primaryActionLabel: null, primaryAction: null }
  }
  if (isAlignRunning) {
    return { stage: 'processing', statusLabel: '正在对齐答案…', primaryActionLabel: null, primaryAction: null }
  }

  if (bundle.readiness === 'missing_analysis') {
    return { stage: 'actionable', statusLabel: '这份资料还需要补解析', primaryActionLabel: '补解析', primaryAction: 'add-analysis' }
  }
  if (bundle.readiness === 'missing_question') {
    return { stage: 'actionable', statusLabel: '缺题目文件，先补题目', primaryActionLabel: '补题目', primaryAction: 'add-analysis' }
  }

  // Parsed and either single_file_ready / paired_files_ready / reference_only.
  // Heuristic: if no draft has been generated yet, prompt 草稿确认.
  if (perBundleDraftStatus === 'idle' || perBundleDraftStatus === undefined) {
    if (bundle.readiness === 'reference_only') {
      return { stage: 'done', statusLabel: '已收作参考资料', primaryActionLabel: null, primaryAction: null }
    }
    return {
      stage: 'actionable',
      statusLabel: '草稿待生成，等你确认',
      primaryActionLabel:
        bundle.roleCounts.answerAnalysis > 0 || bundle.roleCounts.questionWithAnalysis > 0
          ? '生成带答案草稿'
          : '生成拆题草稿',
      primaryAction: 'generate-draft',
    }
  }
  if (perBundleDraftStatus === 'error') {
    return { stage: 'actionable', statusLabel: '草稿生成出错，可以再试', primaryActionLabel: '重试生成草稿', primaryAction: 'generate-draft' }
  }
  if (perBundleAlignmentStatus === 'error') {
    return { stage: 'actionable', statusLabel: '答案对齐出错，可以再试', primaryActionLabel: '重试答案对齐', primaryAction: 'align-answers' }
  }

  return { stage: 'done', statusLabel: '草稿已生成，等你确认', primaryActionLabel: null, primaryAction: null }
}

const importBatchStatusLabel: Record<ImportBatch['status'], string> = {
  scanned: '已扫描',
  importing: '导入中',
  imported: '已导入',
  partial: '部分完成',
  failed: '失败',
}

const DEEPSEEK_MODELS = [
  { value: 'deepseek-v4-flash', label: 'deepseek-v4-flash（推荐）' },
  { value: 'deepseek-v4-pro', label: 'deepseek-v4-pro（高性能）' },
] as const

const DEEPSEEK_MODEL_ALIASES: Record<string, string> = {
  'deepseek-v4-pro': 'deepseek-v4-pro',
  'deepseek-v4-flash': 'deepseek-v4-flash',
}

function normalizeAiModel(value: string) {
  const rawModel = String(value || '').trim()
  if (!rawModel) return DEEPSEEK_MODELS[0].value
  const normalized = rawModel.toLowerCase().replace(/\s+/g, '').replace(/_/g, '-')
  return DEEPSEEK_MODEL_ALIASES[normalized] || DEEPSEEK_MODELS[0].value
}

function mergeQuestionGroupsWithSamples(groups: QuestionGroupCard[]): QuestionGroupCard[] {
  const seen = new Set(groups.map((group) => group.id))
  const missingSamples = sampleQuestionGroups.filter((group) => !seen.has(group.id))
  return [...groups, ...missingSamples]
}

const DEFAULT_AI_MODEL = DEEPSEEK_MODELS[0].value

const importBatchItemStatusLabel: Record<ImportBatch['items'][number]['status'], string> = {
  queued: '待导入',
  unsupported: '不支持',
  imported: '已导入',
  parsed: '已解析',
  skipped: '已跳过',
  failed: '失败',
}

const objectiveImportGroupTypes = new Set<GroupType>(['reading', 'seven_choices', 'cloze', 'grammar_cloze'])
const objectivePaperOrder = ['阅读理解 A', '阅读理解 B', '阅读理解 C', '阅读理解 D', '七选五', '完形填空', '语法填空']
const paperWorkflowStatusHint: Record<PaperWorkflow['status'], string> = {
  not_started: '未开始',
  needs_parse: '待解析',
  ready_to_commit: '可拆题',
  needs_review: '需核对',
  ready_to_paper: '待组卷',
  ready_to_export: '待导出',
  closed_loop: '已闭环',
}

function formatFileSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function compactSummary(text: string, fallback: string) {
  const summary = text.replace(/\s+/g, ' ').trim()
  if (!summary) return fallback
  return summary.length > 120 ? `${summary.slice(0, 120)}...` : summary
}

function isObjectiveImportDraftGroup(group: ImportDraftGroup) {
  return objectiveImportGroupTypes.has(group.groupType) && group.questionCount > 0
}

function getObjectivePaperGroups(groups: QuestionGroupCard[], paperTitle: string) {
  const groupsByTitle = new Map(groups.map((group) => [group.title, group]))

  return objectivePaperOrder
    .map((sectionTitle) => groupsByTitle.get(`${paperTitle} ${sectionTitle}`))
    .filter((group): group is QuestionGroupCard => Boolean(group))
}

function formatWorkflowExport(file: PaperWorkflow['exports']['studentDocx']) {
  if (!file.exists) return '未生成'
  return file.verified ? '已验收' : '已导出'
}

function workflowSectionLabel(groupTitle: string, paperTitle: string) {
  const prefix = `${paperTitle} `
  return groupTitle.startsWith(prefix) ? groupTitle.slice(prefix.length) : groupTitle
}

function sortedWorkflowBankGroups(workflow: PaperWorkflow) {
  return [...workflow.bank.groups].sort((a, b) => {
    const aLabel = workflowSectionLabel(a.title, workflow.title)
    const bLabel = workflowSectionLabel(b.title, workflow.title)
    const aIndex = objectivePaperOrder.indexOf(aLabel)
    const bIndex = objectivePaperOrder.indexOf(bLabel)
    return (aIndex < 0 ? 999 : aIndex) - (bIndex < 0 ? 999 : bIndex) || aLabel.localeCompare(bLabel, 'zh-CN')
  })
}

function workflowProgress(workflow: PaperWorkflow) {
  const importDone = workflow.importFiles.fileCount > 0 && workflow.importFiles.parsedCount >= workflow.importFiles.fileCount
  const bankDone =
    workflow.bank.objectiveGroupCount >= workflow.bank.expectedObjectiveGroupCount &&
    workflow.bank.missingAnswerCount === 0 &&
    workflow.bank.missingOptionGroupCount === 0
  const paperDone = Boolean(workflow.paperSet)
  const exportDone = workflow.exports.studentDocx.exists && workflow.exports.teacherDocx.exists

  return [importDone, bankDone, paperDone, exportDone].filter(Boolean).length
}

function buildDraftQualitySummary(draft: ImportBundleDraft) {
  const objectiveGroups = draft.groups.filter(isObjectiveImportDraftGroup)
  const writingGroups = draft.groups.filter((group) => !objectiveImportGroupTypes.has(group.groupType))
  const zeroQuestionGroups = draft.groups.filter((group) => group.questionCount === 0)
  const lowConfidenceGroups = objectiveGroups.filter((group) => group.confidence < 0.7)
  const groupWarningCount = draft.groups.reduce((sum, group) => sum + group.warnings.length, 0)
  const missingAnswerCount = objectiveGroups.reduce(
    (sum, group) => sum + group.questions.filter((question) => !question.answer).length,
    0,
  )
  const missingOptionsGroupCount = objectiveGroups.filter((group) => {
    if (group.groupType === 'grammar_cloze') return false
    if (group.groupType === 'seven_choices') return group.questions.some((question) => question.options.length < 5)
    return group.questions.some((question) => question.options.length === 0)
  }).length
  const sourceWarningCount = draft.warnings.filter(
    (warning) => warning.includes('来源口径提示') || warning.includes('题名需核对'),
  ).length
  const structuralWarningCount = draft.warnings.length - sourceWarningCount + groupWarningCount
  const readyForBatchCommit =
    objectiveGroups.length > 0 &&
    structuralWarningCount === 0 &&
    zeroQuestionGroups.length === 0 &&
    lowConfidenceGroups.length === 0 &&
    missingAnswerCount === 0 &&
    missingOptionsGroupCount === 0

  return {
    objectiveGroupCount: objectiveGroups.length,
    objectiveQuestionCount: objectiveGroups.reduce((sum, group) => sum + group.questionCount, 0),
    writingGroupCount: writingGroups.length,
    sourceWarningCount,
    structuralWarningCount,
    missingAnswerCount,
    missingOptionsGroupCount,
    lowConfidenceGroupCount: lowConfidenceGroups.length,
    zeroQuestionGroupCount: zeroQuestionGroups.length,
    readyForBatchCommit,
  }
}

function createQuestionGroupInputFromDraft(
  draft: ImportBundleDraft,
  group: ImportDraftGroup,
): CreateQuestionGroupInput {
  const defaultScore = group.questionCount > 0 ? Math.max(0, group.totalScore / group.questionCount) : 0
  const firstQuestion = group.questions[0]
  const materialText = group.materialText || firstQuestion?.rawText || firstQuestion?.stem || ''

  return {
    sourceType: draft.source.sourceType,
    year: draft.source.year,
    region: draft.source.region || '未标地区',
    paperName: draft.source.paperName || draft.title,
    section: group.instruction || groupTypeLabel[group.groupType],
    passageTitle: group.title,
    materialText,
    summary: compactSummary(materialText, group.title),
    theme: '',
    discourseType: '',
    groupTitle: group.title,
    groupType: group.groupType,
    instruction: group.instruction,
    difficulty: 'medium',
    defaultScore,
    questionCount: group.questionCount,
    questionType: firstQuestion?.questionType || groupTypeLabel[group.groupType],
    questionStem: firstQuestion?.stem || group.title,
    answer: firstQuestion?.answer || '',
    explanation: firstQuestion?.explanation || '',
    questions: group.questions.map((question) => ({
      questionNo: question.questionNo,
      questionType: question.questionType || groupTypeLabel[group.groupType],
      stem: question.stem,
      answer: question.answer,
      explanation: question.explanation,
      difficulty: 'medium',
      score: question.score || defaultScore,
      note: `来自导入草稿 ${draft.title} / ${group.sourceItemNo}，置信度 ${Math.round(question.confidence * 100)}%。`,
      options: question.options.map((option) => ({
        label: option.label,
        content: option.content,
      })),
    })),
    tags: ['导入草稿', '待审阅', groupTypeLabel[group.groupType]],
  }
}

function buildGrammarVerifyResult(
  detail: QuestionGroupDetail,
  parseResult: GrammarParseQuestionGroupResult,
): VerifyQuestionGroupResult {
  const results: VerifyResult[] = detail.questions.map((question) => {
    const aiQuestion = parseResult.questions.find((item) => String(item.questionNo).trim() === String(question.questionNo).trim())
    const aiAnswer = String(aiQuestion?.answer || '').trim().toLowerCase()
    const storedAnswer = String(question.answer || '').trim().toLowerCase()

    if (!aiQuestion) {
      return {
        questionId: question.id,
        questionNo: question.questionNo,
        verdict: 'skipped',
        reason: 'AI 未返回该题解析',
      }
    }

    return {
      questionId: question.id,
      questionNo: question.questionNo,
      verdict: aiAnswer && aiAnswer === storedAnswer ? 'correct' : 'answer_wrong',
      reason: aiAnswer && aiAnswer === storedAnswer
        ? 'AI 答案与录入一致'
        : `AI 答案: ${aiQuestion.answer || '未返回'}，录入答案: ${question.answer || '待补'}`,
      correctAnswer: aiQuestion.answer,
    }
  })

  return {
    questionGroupId: detail.id,
    title: detail.title,
    questionCount: detail.questions.length,
    verifiedCount: results.filter((item) => item.verdict !== 'skipped').length,
    results,
    model: parseResult.model,
    thinkingMode: parseResult.thinkingMode,
    keySource: parseResult.keySource,
    keyFingerprint: parseResult.keyFingerprint,
    keyMask: parseResult.keyMask,
    requestId: parseResult.requestId,
    provider: parseResult.provider,
    totalLatencyMs: parseResult.totalLatencyMs,
    calledCount: parseResult.parsedCount,
  }
}

function buildClozeVerifyResult(
  detail: QuestionGroupDetail,
  parseResult: ClozeParseQuestionGroupResult,
): VerifyQuestionGroupResult {
  const results: VerifyResult[] = detail.questions.map((question) => {
    const aiQuestion = parseResult.questions.find((item) => String(item.questionNo).trim() === String(question.questionNo).trim())
    const aiAnswer = String(aiQuestion?.answer || '').trim().toUpperCase()
    const storedAnswer = String(question.answer || '').trim().toUpperCase()

    if (!aiQuestion) {
      return {
        questionId: question.id,
        questionNo: question.questionNo,
        verdict: 'skipped',
        reason: 'AI 未返回该题解析',
      }
    }

    return {
      questionId: question.id,
      questionNo: question.questionNo,
      verdict: aiAnswer && aiAnswer === storedAnswer ? 'correct' : 'answer_wrong',
      reason: aiAnswer && aiAnswer === storedAnswer
        ? 'AI 答案与录入一致'
        : `AI 答案: ${aiQuestion.answer || '未返回'}，录入答案: ${question.answer || '待补'}`,
      correctAnswer: aiQuestion.answer,
    }
  })

  return {
    questionGroupId: detail.id,
    title: detail.title,
    questionCount: detail.questions.length,
    verifiedCount: results.filter((item) => item.verdict !== 'skipped').length,
    results,
    model: parseResult.model,
    thinkingMode: parseResult.thinkingMode,
    keySource: parseResult.keySource,
    keyFingerprint: parseResult.keyFingerprint,
    keyMask: parseResult.keyMask,
    requestId: parseResult.requestId,
    provider: parseResult.provider,
    totalLatencyMs: parseResult.totalLatencyMs,
    calledCount: parseResult.parsedCount,
  }
}

function buildSevenChoicesVerifyResult(
  detail: QuestionGroupDetail,
  parseResult: SevenChoicesParseQuestionGroupResult,
): VerifyQuestionGroupResult {
  const results: VerifyResult[] = detail.questions.map((question) => {
    const aiQuestion = parseResult.questions.find((item) => String(item.questionNo).trim() === String(question.questionNo).trim())
    const aiAnswer = String(aiQuestion?.answer || '').trim().toUpperCase()
    const storedAnswer = String(question.answer || '').trim().toUpperCase()

    if (!aiQuestion) {
      return {
        questionId: question.id,
        questionNo: question.questionNo,
        verdict: 'skipped',
        reason: 'AI 未返回该题解析',
      }
    }

    return {
      questionId: question.id,
      questionNo: question.questionNo,
      verdict: aiAnswer && aiAnswer === storedAnswer ? 'correct' : 'answer_wrong',
      reason: aiAnswer && aiAnswer === storedAnswer
        ? 'AI 答案与录入一致'
        : `AI 答案: ${aiQuestion.answer || '未返回'}，录入答案: ${question.answer || '待补'}`,
      correctAnswer: aiQuestion.answer,
    }
  })

  return {
    questionGroupId: detail.id,
    title: detail.title,
    questionCount: detail.questions.length,
    verifiedCount: results.filter((item) => item.verdict !== 'skipped').length,
    results,
    model: parseResult.model,
    thinkingMode: parseResult.thinkingMode,
    keySource: parseResult.keySource,
    keyFingerprint: parseResult.keyFingerprint,
    keyMask: parseResult.keyMask,
    requestId: parseResult.requestId,
    provider: parseResult.provider,
    totalLatencyMs: parseResult.totalLatencyMs,
    calledCount: parseResult.parsedCount,
  }
}

function App({ piRoute }: { piRoute: PaperIntelligenceRouteMatch }) {
  // ─── Cut C: in-app PI ↔ workbench navigation ───
  // main.tsx parses the URL once at boot and passes the result in via the
  // `piRoute` prop. That snapshot can never change after mount on its own,
  // so we keep an internal `currentPiRoute` mirror that the App actually
  // reads. `onBackToWorkbench` (below) flips this mirror to `{ kind: 'none' }`
  // and rewrites the URL via `history.replaceState` — no full page reload,
  // no `window.location.href` assignment, no `window.location.reload`.
  // Workbench fetch effects depend on `currentPiRoute.kind` so they fire
  // exactly once when the user returns from PI.
  const currentUser = useCurrentUser()
  // M0-3 (docs/cuts/m0-3-role-gate/plan.md 2b): AuthGate is the only place that
  // translates open-mode/owner/member into this boolean — consume it directly,
  // never re-derive from `currentUser`.
  const isOwnerView = useIsOwnerView()
  const [currentPiRoute, setCurrentPiRoute] = useState<PaperIntelligenceRouteMatch>(piRoute)
  const [paperImportAiRouteActive, setPaperImportAiRouteActive] = useState(() => {
    if (!isOwnerView) return false
    if (typeof window === 'undefined') return false
    return new URLSearchParams(window.location.search).get('view') === 'paper-import-ai'
  })
  const [adminRouteActive, setAdminRouteActive] = useState(() => {
    if (!isOwnerView) return false
    if (typeof window === 'undefined') return false
    return new URLSearchParams(window.location.search).get('view') === 'admin'
  })
  const [mySpaceRouteActive, setMySpaceRouteActive] = useState(() => {
    if (typeof window === 'undefined') return false
    return new URLSearchParams(window.location.search).get('view') === 'my-space'
  })
  const [draftPaperRoute, setDraftPaperRoute] = useState(() => {
    if (typeof window === 'undefined') {
      return { active: false, draftPaperId: null as string | null, focusGroupId: null as string | null }
    }
    const params = new URLSearchParams(window.location.search)
    return {
      active: params.get('view') === 'draft-paper',
      draftPaperId: params.get('draftPaperId'),
      focusGroupId: params.get('focusGroupId'),
    }
  })
  const [questionGroups, setQuestionGroups] = useState<QuestionGroupCard[]>(sampleQuestionGroups)
  const [dataStatus, setDataStatus] = useState<'loading' | 'sqlite' | 'sample'>('loading')
  // Edit-status orchestration is forwarded into usePaperDraft via a ref so the
  // hook can be created BEFORE paperExports / saveStatus / previewStatus
  // setters exist in this scope. The ref is wired up below as soon as the
  // dependent state is in place.
  const draftEditedHandlerRef = useRef<(reason: PaperDraftEditReason) => void>(() => {})
  const paperDraft = usePaperDraft({
    onDraftEdited: (reason) => draftEditedHandlerRef.current(reason),
  })
  const {
    basket,
    paperBlocks,
    openInsertionIndex,
    paperTitle,
    questionNumberStart,
    paperExportStyle,
    versionType,
  } = paperDraft
  const [isEntryOpen, setEntryOpen] = useState(false)
  const [isImportOpen, setImportOpen] = useState(false)
  const [entryInitialDetail, setEntryInitialDetail] = useState<QuestionGroupDetail | null>(null)
  const [viewMode, setViewMode] = useState<'list' | 'detail'>('list')
  const [selectedDetail, setSelectedDetail] = useState<QuestionGroupDetail | null>(null)
  const [detailStatus, setDetailStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle')
  const [detailError, setDetailError] = useState('')
  const [verifyResult, setVerifyResult] = useState<VerifyQuestionGroupResult | null>(null)
  const [verifyStatus, setVerifyStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle')
  const [verifyError, setVerifyError] = useState('')
  const [clozeParseResult, setClozeParseResult] = useState<ClozeParseQuestionGroupResult | null>(null)
  const [clozeParseStatus, setClozeParseStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle')
  const [clozeParseError, setClozeParseError] = useState('')
  const [clozeParseSaveStatus, setClozeParseSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [clozeParseSaveError, setClozeParseSaveError] = useState('')
  const [sevenChoicesParseResult, setSevenChoicesParseResult] = useState<SevenChoicesParseQuestionGroupResult | null>(null)
  const [sevenChoicesParseStatus, setSevenChoicesParseStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle')
  const [sevenChoicesParseError, setSevenChoicesParseError] = useState('')
  const [sevenChoicesParseSaveStatus, setSevenChoicesParseSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [sevenChoicesParseSaveError, setSevenChoicesParseSaveError] = useState('')
  const [grammarParseResult, setGrammarParseResult] = useState<GrammarParseQuestionGroupResult | null>(null)
  const [grammarParseStatus, setGrammarParseStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle')
  const [grammarParseError, setGrammarParseError] = useState('')
  const [grammarParseSaveStatus, setGrammarParseSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [grammarParseSaveError, setGrammarParseSaveError] = useState('')
  const [readingParseResult, setReadingParseResult] = useState<ReadingParseQuestionGroupResult | null>(null)
  const [readingParseStatus, setReadingParseStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle')
  const [readingParseError, setReadingParseError] = useState('')
  const [readingParseSaveStatus, setReadingParseSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [readingParseSaveError, setReadingParseSaveError] = useState('')
  const [aiApiKey] = useState(() => localStorage.getItem('ai-api-key') || '')
  const [aiModel] = useState(() => normalizeAiModel(localStorage.getItem('ai-model') || DEFAULT_AI_MODEL))
  const [backfillStatus, setBackfillStatus] = useState<'idle' | 'loading'>('idle')
  const [backfillResult, setBackfillResult] = useState<BackfillTopicLabelsResult | null>(null)
  const [backfillError, setBackfillError] = useState('')
  const [aiThinkingMode, setAiThinkingMode] = useState(() => localStorage.getItem('ai-thinking-mode') === 'on')
  const conciergeDesk = useConciergeDesk({
    questionGroups,
    apiKey: aiApiKey,
    thinkingMode: aiThinkingMode,
  })
  const aiRunIdRef = useRef(0)
  const refreshQuestionGroups = useCallback(async (ignore?: () => boolean) => {
    try {
      const groups = await fetchQuestionGroups()
      if (ignore?.()) return
      setQuestionGroups(mergeQuestionGroupsWithSamples(groups))
      setDataStatus('sqlite')
    } catch {
      if (ignore?.()) return
      setDataStatus((status) => (status === 'sqlite' ? status : 'sample'))
    }
  }, [])
  const [savedPapers, setSavedPapers] = useState<PaperSetSummary[]>([])
  const [paperWorkflows, setPaperWorkflows] = useState<PaperWorkflow[]>([])
  const [paperWorkflowsStatus, setPaperWorkflowsStatus] = useState<'loading' | 'loaded' | 'error'>('loading')
  const [paperWorkflowsError, setPaperWorkflowsError] = useState('')
  const [importBundles, setImportBundles] = useState<ImportBundle[]>([])
  const [importBundlesStatus, setImportBundlesStatus] = useState<'loading' | 'loaded' | 'error'>('loading')
  const [importBundlesError, setImportBundlesError] = useState('')
  const [importBatches, setImportBatches] = useState<ImportBatch[]>([])
  const [importBatchesStatus, setImportBatchesStatus] = useState<'loading' | 'loaded' | 'error'>('loading')
  const [importBatchesError, setImportBatchesError] = useState('')
  const [batchDirectoryPath, setBatchDirectoryPath] = useState('/Users/huangxuewei/Desktop/10_日常工作/真题答案版')
  const [batchTitle, setBatchTitle] = useState('')
  const [batchRecursive, setBatchRecursive] = useState(true)
  const [batchContentRole, setBatchContentRole] = useState<ImportContentRole>('question_with_analysis')
  const [batchImportLimit, setBatchImportLimit] = useState('10')
  const [batchScanStatus, setBatchScanStatus] = useState<'idle' | 'scanning' | 'scanned' | 'error'>('idle')
  const [batchScanError, setBatchScanError] = useState('')
  const [batchRunStatusById, setBatchRunStatusById] = useState<Record<string, 'idle' | 'importing' | 'imported' | 'error'>>({})
  const [batchRunErrorById, setBatchRunErrorById] = useState<Record<string, string>>({})
  const [importFiles, setImportFiles] = useState<ImportFileRecord[]>([])
  const [importFilesStatus, setImportFilesStatus] = useState<'loading' | 'loaded' | 'error'>('loading')
  const [importFilesError, setImportFilesError] = useState('')
  const [selectedImportFiles, setSelectedImportFiles] = useState<File[]>([])
  const [importContentRole, setImportContentRole] = useState<ImportContentRole>('question_with_analysis')
  const [importBundleId, setImportBundleId] = useState('')
  const [importBundleTitle, setImportBundleTitle] = useState('')
  const [importNote, setImportNote] = useState('')
  const [importStatus, setImportStatus] = useState<'idle' | 'importing' | 'imported' | 'error'>('idle')
  const [importError, setImportError] = useState('')
  const [parseStatusByFileId, setParseStatusByFileId] = useState<Record<string, 'idle' | 'parsing' | 'parsed' | 'error'>>({})
  const [parseErrorByFileId, setParseErrorByFileId] = useState<Record<string, string>>({})
  const [activeImportParse, setActiveImportParse] = useState<ImportFileParseResult | null>(null)
  const [draftStatusByBundleId, setDraftStatusByBundleId] = useState<
    Record<string, 'idle' | 'generating' | 'generated' | 'error'>
  >({})
  const [draftErrorByBundleId, setDraftErrorByBundleId] = useState<Record<string, string>>({})
  const [activeImportDraft, setActiveImportDraft] = useState<ImportBundleDraft | null>(null)
  const [draftReviewConfirmed, setDraftReviewConfirmed] = useState(false)
  const [commitStatusByDraftGroupId, setCommitStatusByDraftGroupId] = useState<
    Record<string, 'idle' | 'saving' | 'saved' | 'error'>
  >({})
  const [commitErrorByDraftGroupId, setCommitErrorByDraftGroupId] = useState<Record<string, string>>({})
  const [batchCommitStatus, setBatchCommitStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [batchCommitError, setBatchCommitError] = useState('')
  const [batchCommitResult, setBatchCommitResult] = useState<{ saved: number; skipped: number } | null>(null)
  const [paperBuildStatus, setPaperBuildStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [paperBuildError, setPaperBuildError] = useState('')
  const [paperBuildResult, setPaperBuildResult] = useState<PaperSetSummary | null>(null)
  const existingQuestionGroupTitles = useMemo(() => new Set(questionGroups.map((group) => group.title)), [questionGroups])
  const isDraftGroupAlreadyInQuestionBank = (group: ImportDraftGroup) =>
    existingQuestionGroupTitles.has(group.title) ||
    Boolean(group.sourceItemNo && existingQuestionGroupTitles.has(`${group.title} ${group.sourceItemNo}`))
  const [answerAlignmentStatusByBundleId, setAnswerAlignmentStatusByBundleId] = useState<
    Record<string, 'idle' | 'generating' | 'generated' | 'error'>
  >({})
  const [answerAlignmentErrorByBundleId, setAnswerAlignmentErrorByBundleId] = useState<Record<string, string>>({})
  const [activeAnswerAlignment, setActiveAnswerAlignment] = useState<ImportAnswerAlignmentDraft | null>(null)
  const [answerWritebackStatusByGroupId, setAnswerWritebackStatusByGroupId] = useState<
    Record<string, 'idle' | 'saving' | 'saved' | 'error'>
  >({})
  const [answerWritebackErrorByGroupId, setAnswerWritebackErrorByGroupId] = useState<Record<string, string>>({})
  const [answerWritebackResultByGroupId, setAnswerWritebackResultByGroupId] = useState<
    Record<string, ApplyAnswerAlignmentResult>
  >({})

  // Paper export flow hook — manages DOCX/PDF/PrintHTML/PrintPDF state and actions
  const paperExports = usePaperExports({
    basket,
    paperBlocks,
    questionNumberStart,
    paperExportStyle,
    paperTitle,
    versionType,
    onDocxOrPdfExported: () => { refreshPaperWorkflows() },
  })

  // Wire the Paper Set Draft edit-event router. usePaperDraft is created above
  // before paperExports exists; this effect binds the actual handler in once
  // the dependent setters are reachable. saveStatus/previewStatus tracking
  // was classic-basket-panel-only display state, retired in classic-retire-3;
  // the draft-edit hook only needs to keep the export cache fresh now.
  useEffect(() => {
    draftEditedHandlerRef.current = () => {
      paperExports.resetExportStatuses()
    }
  }, [paperExports])

  // ─── PI-route guard: skip workbench-only fetches while the App shell is
  // rendering Paper Intelligence ───
  // When the Paper Intelligence route is active, the App shell does NOT show
  // any of the workbench panels (question bank list, imports, paper sets,
  // workflows). The corresponding effects below would fire useless GETs
  // against /api/* on PI-only sessions; reviewers flagged this as a P0 watch
  // on Cut A. We early-return inside each effect callback so hooks remain
  // unconditionally called (React's rules-of-hooks) but no fetch fires while
  // currentPiRoute.kind === 'paper-intelligence'. Each effect's dependency
  // list includes currentPiRoute.kind so Cut C return-to-workbench (which
  // flips the in-app currentPiRoute to { kind: 'none' }) retriggers the
  // normal load WITHOUT a full-page reload.
  useEffect(() => {
    if (currentPiRoute.kind === 'paper-intelligence') return
    let ignore = false

    refreshQuestionGroups(() => ignore)
      .catch(() => {
        if (ignore) return
        setQuestionGroups(sampleQuestionGroups)
        setDataStatus('sample')
      })

    return () => {
      ignore = true
    }
  }, [currentPiRoute.kind, refreshQuestionGroups])

  useEffect(() => {
    if (currentPiRoute.kind === 'paper-intelligence') return
    let ignore = false

    fetchImportFiles()
      .then((files) => {
        if (ignore) return
        setImportFiles(files)
        setImportFilesStatus('loaded')
      })
      .catch((error) => {
        if (ignore) return
        setImportFilesStatus('error')
        setImportFilesError(error instanceof Error ? error.message : String(error))
      })

    fetchImportBundles()
      .then((bundles) => {
        if (ignore) return
        setImportBundles(bundles)
        setImportBundlesStatus('loaded')
      })
      .catch((error) => {
        if (ignore) return
        setImportBundlesStatus('error')
        setImportBundlesError(error instanceof Error ? error.message : String(error))
      })

    fetchImportBatches()
      .then((batches) => {
        if (ignore) return
        setImportBatches(batches)
        setImportBatchesStatus('loaded')
      })
      .catch((error) => {
        if (ignore) return
        setImportBatchesStatus('error')
        setImportBatchesError(error instanceof Error ? error.message : String(error))
      })

    return () => {
      ignore = true
    }
  }, [currentPiRoute.kind])

  useEffect(() => {
    if (currentPiRoute.kind === 'paper-intelligence') return
    let ignore = false

    fetchPaperSets()
      .then((paperSets) => {
        if (ignore) return
        setSavedPapers(paperSets)
      })
      .catch(() => {
        // savedPapersStatus/Error display died with the classic basket panel
        // (classic-retire-3); savedPapers itself still feeds
        // handleBuildObjectivePaperSet, so keep this fetch but drop the
        // now-orphaned status/error tracking.
      })

    return () => {
      ignore = true
    }
  }, [currentPiRoute.kind])

  useEffect(() => {
    if (currentPiRoute.kind === 'paper-intelligence') return
    let ignore = false

    fetchPaperWorkflows()
      .then((workflows) => {
        if (ignore) return
        setPaperWorkflows(workflows)
        setPaperWorkflowsStatus('loaded')
      })
      .catch((error) => {
        if (ignore) return
        setPaperWorkflowsStatus('error')
        setPaperWorkflowsError(error instanceof Error ? error.message : String(error))
      })

    return () => {
      ignore = true
    }
  }, [currentPiRoute.kind])

  // Close insertion menu on outside click or Escape
  const closeInsertionMenu = paperDraft.setOpenInsertionIndex
  useEffect(() => {
    if (openInsertionIndex === null) return
    function handleClick(e: MouseEvent) {
      const target = e.target as HTMLElement
      if (!target.closest('.paper-insertion-seam')) {
        closeInsertionMenu(null)
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') closeInsertionMenu(null)
    }
    document.addEventListener('pointerdown', handleClick)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handleClick)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [openInsertionIndex, closeInsertionMenu])

  const questionGroupById = useMemo(() => new Map(questionGroups.map((group) => [group.id, group])), [questionGroups])
  // readingParseByQuestionNo / clozeParseByQuestionNo / sevenChoicesParseByQuestionNo /
  // grammarParseByQuestionNo / verifyByQuestionNo / answerCompareStats moved into
  // QuestionGroupDetailView (classic-retire-2-detail-view, PA MF-2) — recomputed
  // there from the same parse/verify results instead of being passed as props.

  async function addGroupsToBasket(groups: QuestionGroupCard[]) {
    const addableGroups = groups.filter((group) => group.draftPaperButtonState === 'add' && group.canAddToDraftPaper)
    if (addableGroups.length === 0) {
      const existing = groups.find((group) => group.draftPaperButtonState === 'in_current_draft')
      if (existing) {
        openDraftPaperWorkbench(existing.currentDraftPaperId, existing.id)
        return
      }
      const blocked = groups.find((group) => group.printUnavailableReason)
      if (blocked) {
        window.alert(blocked.printUnavailableReason || '该题组暂不可加入草稿卷。')
      }
      return
    }
    try {
      for (const group of addableGroups) {
        await addGroupToCurrentDraftPaperRequest(group.id)
      }
      await refreshQuestionGroups()
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error))
    }
  }

  function addToBasket(group: QuestionGroupCard) {
    if (group.draftPaperButtonState === 'in_current_draft') {
      openDraftPaperWorkbench(group.currentDraftPaperId, group.id)
      return
    }
    void addGroupsToBasket([group])
  }

  function addWorkflowGroupsToBasket(workflow: PaperWorkflow) {
    const groups = sortedWorkflowBankGroups(workflow)
      .map((group) => questionGroupById.get(group.id))
      .filter((group): group is QuestionGroupCard => Boolean(group))
    void addGroupsToBasket(groups)
  }

  async function handleBuildWorkflowPaperSet(workflow: PaperWorkflow) {
    const groups = sortedWorkflowBankGroups(workflow)
      .map((group) => questionGroupById.get(group.id))
      .filter((group): group is QuestionGroupCard => Boolean(group))

    if (groups.length === 0) return

    const title = `${workflow.title} 客观题`
    const nextBasket = groups.map((group) => createBasketItem(group))

    setPaperBuildStatus('saving')
    setPaperBuildError('')
    paperExports.resetExportStatuses()

    try {
      const paperSetInput = {
        title,
        description: `${workflow.title} 的客观题整卷，按原卷顺序自动生成。`,
        items: nextBasket.map((item) => ({
          questionGroupId: item.id,
          score: item.score,
          sectionTitle: item.sectionTitle,
          note: item.note,
        })),
      }

      const existingPaperSet = savedPapers.find((ps) => ps.title === title)
      const paperSet = existingPaperSet
        ? await updatePaperSetRequest(existingPaperSet.id, paperSetInput)
        : await savePaperSet(paperSetInput)

      paperDraft.replaceDraft({ basket: nextBasket })
      paperDraft.setPaperTitle(title)
      paperDraft.setVersionType('student')
      setSavedPapers((paperSets) => [paperSet, ...paperSets.filter((item) => item.id !== paperSet.id)])
      setPaperBuildResult(paperSet)
      setPaperBuildStatus('saved')
      await refreshPaperWorkflows()
    } catch (error) {
      setPaperBuildStatus('error')
      setPaperBuildError(error instanceof Error ? error.message : String(error))
    }
  }

  async function openDetail(id: string) {
    aiRunIdRef.current += 1
    setViewMode('detail')
    setDetailStatus('loading')
    setDetailError('')
    setVerifyResult(null)
    setVerifyStatus('idle')
    setVerifyError('')
    setClozeParseResult(null)
    setClozeParseStatus('idle')
    setClozeParseError('')
    setClozeParseSaveStatus('idle')
    setClozeParseSaveError('')
    setSevenChoicesParseResult(null)
    setSevenChoicesParseStatus('idle')
    setSevenChoicesParseError('')
    setSevenChoicesParseSaveStatus('idle')
    setSevenChoicesParseSaveError('')
    setReadingParseResult(null)
    setReadingParseStatus('idle')
    setReadingParseError('')
    setReadingParseSaveStatus('idle')
    setReadingParseSaveError('')
    setGrammarParseResult(null)
    setGrammarParseStatus('idle')
    setGrammarParseError('')
    setGrammarParseSaveStatus('idle')
    setGrammarParseSaveError('')

    try {
      const detail = await fetchQuestionGroupDetail(id)
      setSelectedDetail(detail)
      if (detail.readingParseResult) {
        setReadingParseResult(detail.readingParseResult)
        setReadingParseStatus('loaded')
        setReadingParseSaveStatus('saved')
      }
      if (detail.readingVerifyResult) {
        setVerifyResult(detail.readingVerifyResult)
        setVerifyStatus('loaded')
      }
      if (detail.clozeParseResult) {
        setClozeParseResult(detail.clozeParseResult)
        setClozeParseStatus('loaded')
        setClozeParseSaveStatus('saved')
        setVerifyResult(buildClozeVerifyResult(detail, detail.clozeParseResult))
        setVerifyStatus('loaded')
      }
      if (detail.sevenChoicesParseResult) {
        setSevenChoicesParseResult(detail.sevenChoicesParseResult)
        setSevenChoicesParseStatus('loaded')
        setSevenChoicesParseSaveStatus('saved')
        setVerifyResult(buildSevenChoicesVerifyResult(detail, detail.sevenChoicesParseResult))
        setVerifyStatus('loaded')
      }
      if (detail.grammarParseResult) {
        setGrammarParseResult(detail.grammarParseResult)
        setGrammarParseStatus('loaded')
        setGrammarParseSaveStatus('saved')
        setVerifyResult(buildGrammarVerifyResult(detail, detail.grammarParseResult))
        setVerifyStatus('loaded')
      }
      setDetailStatus('loaded')
    } catch (error) {
      setDetailStatus('error')
      setDetailError(error instanceof Error ? error.message : String(error))
    }
  }

  function backToList() {
    setViewMode('list')
  }

  async function handleDeleteQuestionGroup(detail: QuestionGroupDetail) {
    if (!window.confirm(`删除「${detail.title}」？题组会从题库和草稿卷里移除，不可恢复。`)) return
    try {
      await deleteQuestionGroupRequest(detail.id)
      setQuestionGroups((groups) => groups.filter((group) => group.id !== detail.id))
      paperDraft.externalRemoveByGroupId(detail.id)
      setSelectedDetail(null)
      backToList()
      await refreshPaperWorkflows()
    } catch (error) {
      window.alert(`删除失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  function openImportPanel() {
    setImportStatus('idle')
    setImportError('')
    setImportOpen(true)
  }

  function openEditEntry(detail: QuestionGroupDetail) {
    setEntryInitialDetail(detail)
    setEntryOpen(true)
  }

  async function handleEntrySaved(saved: QuestionGroupCard, context: { mode: 'create' | 'edit' }) {
    setQuestionGroups((groups) =>
      context.mode === 'edit'
        ? groups.map((group) => (group.id === saved.id ? saved : group))
        : [saved, ...groups.filter((group) => group.id !== saved.id)],
    )
    paperDraft.patchBasketItemFromSavedGroup(saved)
    if (context.mode === 'edit') {
      const detail = await fetchQuestionGroupDetail(saved.id)
      setSelectedDetail(detail)
      setDetailStatus('loaded')
    }
    setDataStatus('sqlite')
    setEntryOpen(false)
    setEntryInitialDetail(null)
    await refreshPaperWorkflows()
  }

  async function refreshImportBundles() {
    try {
      const bundles = await fetchImportBundles()
      setImportBundles(bundles)
      setImportBundlesStatus('loaded')
      setImportBundlesError('')
    } catch (error) {
      setImportBundlesStatus('error')
      setImportBundlesError(error instanceof Error ? error.message : String(error))
    }
  }

  async function refreshImportFiles() {
    try {
      const files = await fetchImportFiles()
      setImportFiles(files)
      setImportFilesStatus('loaded')
      setImportFilesError('')
    } catch (error) {
      setImportFilesStatus('error')
      setImportFilesError(error instanceof Error ? error.message : String(error))
    }
  }

  async function handleScanImportDirectory() {
    setBatchScanStatus('scanning')
    setBatchScanError('')

    try {
      const batch = await scanImportDirectory({
        directoryPath: batchDirectoryPath,
        title: batchTitle.trim() || undefined,
        recursive: batchRecursive,
        contentRole: batchContentRole,
      })
      setImportBatches((batches) => [batch, ...batches.filter((item) => item.id !== batch.id)])
      setImportBatchesStatus('loaded')
      setBatchTitle('')
      setBatchScanStatus('scanned')
    } catch (error) {
      setBatchScanStatus('error')
      setBatchScanError(error instanceof Error ? error.message : String(error))
    }
  }

  async function handleRunImportBatch(batch: ImportBatch) {
    setBatchRunStatusById((status) => ({ ...status, [batch.id]: 'importing' }))
    setBatchRunErrorById((errors) => ({ ...errors, [batch.id]: '' }))

    try {
      const limit = batchImportLimit === 'all' ? undefined : Number(batchImportLimit)
      const importedBatch = await runImportBatch(batch.id, { parseDocx: true, limit })
      setImportBatches((batches) => [importedBatch, ...batches.filter((item) => item.id !== importedBatch.id)])
      await Promise.all([refreshImportFiles(), refreshImportBundles()])
      await refreshPaperWorkflows()
      setBatchRunStatusById((status) => ({ ...status, [batch.id]: 'imported' }))
    } catch (error) {
      setBatchRunStatusById((status) => ({ ...status, [batch.id]: 'error' }))
      setBatchRunErrorById((errors) => ({
        ...errors,
        [batch.id]: error instanceof Error ? error.message : String(error),
      }))
    }
  }

  async function handleImportSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setImportStatus('importing')
    setImportError('')

    if (selectedImportFiles.length === 0) {
      setImportStatus('error')
      setImportError('请至少选择一个 DOCX 或 PDF 文件。')
      return
    }

    try {
      for (const file of selectedImportFiles) {
        const imported = await uploadImportFile({
          fileName: file.name,
          mimeType: file.type,
          dataBase64: await readFileAsBase64(file),
          contentRole: importContentRole,
          bundleId: importBundleId || undefined,
          bundleTitle: importBundleTitle.trim() || file.name.replace(/\.[^.]+$/, ''),
          note: importNote,
        })
        setImportFiles((files) => [imported, ...files.filter((f) => f.id !== imported.id)])
      }
      setImportFilesStatus('loaded')
      await refreshImportBundles()
      setSelectedImportFiles([])
      setImportBundleId('')
      setImportNote('')
      setImportStatus('imported')
      await refreshPaperWorkflows()
    } catch (error) {
      setImportStatus('error')
      setImportError(error instanceof Error ? error.message : String(error))
    }
  }

  function prepareAnswerAnalysisImport(bundle: ImportBundle) {
    setImportOpen(true)
    setImportBundleId(bundle.id)
    setImportBundleTitle(bundle.title)
    setImportContentRole('answer_analysis')
    setImportNote(`补充 ${bundle.title} 的答案解析文件。`)
    setSelectedImportFiles([])
    setImportStatus('idle')
    setImportError('')
  }

  async function handleParseImportFile(file: ImportFileRecord) {
    setParseStatusByFileId((status) => ({ ...status, [file.id]: 'parsing' }))
    setParseErrorByFileId((errors) => ({ ...errors, [file.id]: '' }))

    try {
      const parse = await parseImportFileRequest(file.id)
      setActiveImportParse(parse)
      setImportFiles((files) =>
        files.map((item) =>
          item.id === file.id
            ? {
                ...item,
                status: 'parsed',
                parse: {
                  id: parse.id,
                  status: parse.status,
                  parser: parse.parser,
                  lineCount: parse.lineCount,
                  charCount: parse.charCount,
                  preview: parse.extractedText.slice(0, 220).replace(/\s+/g, ' '),
                  errorMessage: parse.errorMessage,
                  updatedAt: parse.updatedAt,
                },
              }
            : item,
        ),
      )
      setParseStatusByFileId((status) => ({ ...status, [file.id]: 'parsed' }))
      await refreshImportBundles()
      await refreshPaperWorkflows()
    } catch (error) {
      setParseStatusByFileId((status) => ({ ...status, [file.id]: 'error' }))
      setParseErrorByFileId((errors) => ({
        ...errors,
        [file.id]: error instanceof Error ? error.message : String(error),
      }))
    }
  }

  async function handleShowImportParse(file: ImportFileRecord) {
    setParseStatusByFileId((status) => ({ ...status, [file.id]: 'parsing' }))
    setParseErrorByFileId((errors) => ({ ...errors, [file.id]: '' }))

    try {
      const parse = await fetchImportFileParse(file.id)
      setActiveImportParse(parse)
      setParseStatusByFileId((status) => ({ ...status, [file.id]: 'parsed' }))
    } catch (error) {
      setParseStatusByFileId((status) => ({ ...status, [file.id]: 'error' }))
      setParseErrorByFileId((errors) => ({
        ...errors,
        [file.id]: error instanceof Error ? error.message : String(error),
      }))
    }
  }

  async function handleDeleteImportFile(file: ImportFileRecord) {
    try {
      await deleteImportFileRequest(file.id)
      setImportFiles((files) => files.filter((f) => f.id !== file.id))
      await refreshImportBundles()
    } catch (error) {
      setImportFilesError(error instanceof Error ? error.message : String(error))
    }
  }

  async function handleGenerateImportDraft(bundle: ImportBundle) {
    setDraftStatusByBundleId((status) => ({ ...status, [bundle.id]: 'generating' }))
    setDraftErrorByBundleId((errors) => ({ ...errors, [bundle.id]: '' }))
    setDraftReviewConfirmed(false)
    setBatchCommitStatus('idle')
    setBatchCommitResult(null)
    setBatchCommitError('')

    try {
      const draft = await generateImportBundleDraft(bundle.id)
      setActiveImportDraft(draft)
      setDraftStatusByBundleId((status) => ({ ...status, [bundle.id]: 'generated' }))
    } catch (error) {
      setDraftStatusByBundleId((status) => ({ ...status, [bundle.id]: 'error' }))
      setDraftErrorByBundleId((errors) => ({
        ...errors,
        [bundle.id]: error instanceof Error ? error.message : String(error),
      }))
    }
  }

  async function handleGenerateAnswerAlignment(bundle: ImportBundle) {
    setAnswerAlignmentStatusByBundleId((status) => ({ ...status, [bundle.id]: 'generating' }))
    setAnswerAlignmentErrorByBundleId((errors) => ({ ...errors, [bundle.id]: '' }))

    try {
      const alignment = await generateImportAnswerAlignment(bundle.id)
      setActiveAnswerAlignment(alignment)
      setAnswerAlignmentStatusByBundleId((status) => ({ ...status, [bundle.id]: 'generated' }))
    } catch (error) {
      setAnswerAlignmentStatusByBundleId((status) => ({ ...status, [bundle.id]: 'error' }))
      setAnswerAlignmentErrorByBundleId((errors) => ({
        ...errors,
        [bundle.id]: error instanceof Error ? error.message : String(error),
      }))
    }
  }

  async function handleBackfillTopicLabels() {
    const key = aiApiKey.trim()
    localStorage.setItem('ai-api-key', key)
    setBackfillStatus('loading')
    setBackfillResult(null)
    setBackfillError('')
    try {
      const result = await backfillTopicLabels({ apiKey: key, model: aiModel })
      setBackfillResult(result)
      setBackfillStatus('idle')
      await refreshQuestionGroups()
    } catch (error) {
      setBackfillError(error instanceof Error ? error.message : String(error))
      setBackfillStatus('idle')
    }
  }

  async function refreshPaperWorkflows() {
    setPaperWorkflowsStatus('loading')
    setPaperWorkflowsError('')

    try {
      const workflows = await fetchPaperWorkflows()
      setPaperWorkflows(workflows)
      setPaperWorkflowsStatus('loaded')
    } catch (error) {
      setPaperWorkflowsStatus('error')
      setPaperWorkflowsError(error instanceof Error ? error.message : String(error))
    }
  }

  async function handleApplyAnswerAlignmentGroup(group: ImportAnswerAlignmentDraft['groups'][number]) {
    if (!activeAnswerAlignment) return
    setAnswerWritebackStatusByGroupId((status) => ({ ...status, [group.id]: 'saving' }))
    setAnswerWritebackErrorByGroupId((errors) => ({ ...errors, [group.id]: '' }))

    try {
      const result = await applyImportAnswerAlignment(activeAnswerAlignment.bundleId, {
        questionGroupId: group.questionGroupId,
      })
      const refreshed = await generateImportAnswerAlignment(activeAnswerAlignment.bundleId)
      setActiveAnswerAlignment(refreshed)
      await refreshQuestionGroups()
      await refreshPaperWorkflows()
      setAnswerWritebackResultByGroupId((results) => ({ ...results, [group.id]: result }))
      setAnswerWritebackStatusByGroupId((status) => ({ ...status, [group.id]: 'saved' }))
    } catch (error) {
      setAnswerWritebackStatusByGroupId((status) => ({ ...status, [group.id]: 'error' }))
      setAnswerWritebackErrorByGroupId((errors) => ({
        ...errors,
        [group.id]: error instanceof Error ? error.message : String(error),
      }))
    }
  }

  async function handleCommitDraftGroup(group: ImportDraftGroup) {
    if (!activeImportDraft) return
    if (isDraftGroupAlreadyInQuestionBank(group)) {
      setCommitStatusByDraftGroupId((status) => ({ ...status, [group.id]: 'saved' }))
      return
    }

    setCommitStatusByDraftGroupId((status) => ({ ...status, [group.id]: 'saving' }))
    setCommitErrorByDraftGroupId((errors) => ({ ...errors, [group.id]: '' }))

    try {
      const saved = await createQuestionGroup(createQuestionGroupInputFromDraft(activeImportDraft, group))
      setQuestionGroups((groups) => [saved, ...groups.filter((item) => item.id !== saved.id)])
      setDataStatus('sqlite')
      setCommitStatusByDraftGroupId((status) => ({ ...status, [group.id]: 'saved' }))
      await refreshPaperWorkflows()
    } catch (error) {
      setCommitStatusByDraftGroupId((status) => ({ ...status, [group.id]: 'error' }))
      setCommitErrorByDraftGroupId((errors) => ({
        ...errors,
        [group.id]: error instanceof Error ? error.message : String(error),
      }))
    }
  }

  async function handleBatchCommitObjectiveDraftGroups() {
    if (!activeImportDraft) return

    const objectiveGroups = activeImportDraft.groups.filter(isObjectiveImportDraftGroup)
    const importableGroups = objectiveGroups.filter((group) => !isDraftGroupAlreadyInQuestionBank(group))

    setBatchCommitResult(null)
    setBatchCommitError('')

    if (importableGroups.length === 0) {
      setBatchCommitStatus('saved')
      setBatchCommitResult({ saved: 0, skipped: objectiveGroups.length })
      return
    }

    setBatchCommitStatus('saving')

    try {
      const savedGroups: QuestionGroupCard[] = []
      const seenTitles = new Set(existingQuestionGroupTitles)
      let skipped = objectiveGroups.length - importableGroups.length

      for (const group of importableGroups) {
        if (seenTitles.has(group.title)) {
          skipped += 1
          setCommitStatusByDraftGroupId((status) => ({ ...status, [group.id]: 'saved' }))
          continue
        }

        setCommitStatusByDraftGroupId((status) => ({ ...status, [group.id]: 'saving' }))
        setCommitErrorByDraftGroupId((errors) => ({ ...errors, [group.id]: '' }))
        try {
          const saved = await createQuestionGroup(createQuestionGroupInputFromDraft(activeImportDraft, group))
          savedGroups.push(saved)
          seenTitles.add(group.title)
          setCommitStatusByDraftGroupId((status) => ({ ...status, [group.id]: 'saved' }))
        } catch (error) {
          setCommitStatusByDraftGroupId((status) => ({ ...status, [group.id]: 'error' }))
          setCommitErrorByDraftGroupId((errors) => ({
            ...errors,
            [group.id]: error instanceof Error ? error.message : String(error),
          }))
          throw error
        }
      }

      setQuestionGroups((groups) => [
        ...savedGroups,
        ...groups.filter((group) => !savedGroups.some((saved) => saved.id === group.id)),
      ])
      setDataStatus('sqlite')
      await refreshQuestionGroups()
      await refreshPaperWorkflows()
      setBatchCommitResult({ saved: savedGroups.length, skipped })
      setBatchCommitStatus('saved')
    } catch (error) {
      setBatchCommitStatus('error')
      setBatchCommitError(error instanceof Error ? error.message : String(error))
    }
  }

  async function handleBuildObjectivePaperSet() {
    if (!activeImportDraft) return

    const paperGroups = getObjectivePaperGroups(questionGroups, activeImportDraft.title)
    const title = `${activeImportDraft.title} 客观题`
    const nextBasket = paperGroups.map((group) => createBasketItem(group))

    setPaperBuildStatus('saving')
    setPaperBuildError('')
    setPaperBuildResult(null)
    paperExports.resetExportStatuses()

    if (nextBasket.length === 0) {
      setPaperBuildStatus('error')
      setPaperBuildError('还没有可组卷的客观题组，请先完成客观题入库。')
      return
    }

    try {
      const existingPaperSet = savedPapers.find((paperSet) => paperSet.title === title)
      const paperSetInput = {
        title,
        description: `${activeImportDraft.title} 的客观题整卷，按原卷顺序自动生成。`,
        items: nextBasket.map((item) => ({
          questionGroupId: item.id,
          score: item.score,
          sectionTitle: item.sectionTitle,
          note: item.note,
        })),
      }

      const paperSet = existingPaperSet
        ? await updatePaperSetRequest(existingPaperSet.id, paperSetInput)
        : await savePaperSet(paperSetInput)

      paperDraft.replaceDraft({ basket: nextBasket })
      paperDraft.setPaperTitle(title)
      paperDraft.setVersionType('student')
      setSavedPapers((paperSets) => [paperSet, ...paperSets.filter((item) => item.id !== paperSet.id)])
      setPaperBuildResult(paperSet)
      setPaperBuildStatus('saved')
      setImportOpen(false)
      await refreshPaperWorkflows()
    } catch (error) {
      setPaperBuildStatus('error')
      setPaperBuildError(error instanceof Error ? error.message : String(error))
    }
  }

  async function openWorkflowDraft(workflow: PaperWorkflow) {
    if (!workflow.bundleId) return

    let bundle = importBundles.find((item) => item.id === workflow.bundleId)

    if (!bundle) {
      try {
        const freshBundles = await fetchImportBundles()
        setImportBundles(freshBundles)
        setImportBundlesStatus('loaded')
        bundle = freshBundles.find((item) => item.id === workflow.bundleId)
      } catch (error) {
        setPaperWorkflowsStatus('error')
        setPaperWorkflowsError(error instanceof Error ? error.message : String(error))
        return
      }
    }

    if (!bundle) {
      setPaperWorkflowsStatus('error')
      setPaperWorkflowsError(`没有找到资料组：${workflow.title}`)
      return
    }

    setImportOpen(true)
    await handleGenerateImportDraft(bundle)
  }

  const objectiveDraftGroups = activeImportDraft?.groups.filter(isObjectiveImportDraftGroup) ?? []
  const importableObjectiveDraftGroups = objectiveDraftGroups.filter((group) => !isDraftGroupAlreadyInQuestionBank(group))
  const draftGroupsWithQuestions = activeImportDraft?.groups.filter((group) => group.questionCount > 0) ?? []
  const committedDraftGroupCount = draftGroupsWithQuestions.filter(isDraftGroupAlreadyInQuestionBank).length
  const objectivePaperGroups = activeImportDraft ? getObjectivePaperGroups(questionGroups, activeImportDraft.title) : []
  const objectivePaperTitle = activeImportDraft ? `${activeImportDraft.title} 客观题` : ''
  const draftQuality = activeImportDraft ? buildDraftQualitySummary(activeImportDraft) : null
  const canBatchCommitObjectiveDraft =
    importableObjectiveDraftGroups.length > 0 && Boolean(draftQuality?.readyForBatchCommit || draftReviewConfirmed)
  const existingObjectivePaperSet = objectivePaperTitle
    ? savedPapers.find((paperSet) => paperSet.title === objectivePaperTitle)
    : null
  const singleIntakeSteps = activeImportDraft
    ? [
        {
          label: '草稿',
          value: `${activeImportDraft.groupCount} 组`,
          status: 'done',
        },
        {
          label: '逐组入库',
          value: `${committedDraftGroupCount}/${draftGroupsWithQuestions.length}`,
          status:
            draftGroupsWithQuestions.length > 0 && committedDraftGroupCount >= draftGroupsWithQuestions.length
              ? 'done'
              : 'active',
        },
        {
          label: '题集',
          value: existingObjectivePaperSet || paperBuildResult ? '已生成' : `${objectivePaperGroups.length} 组`,
          status: existingObjectivePaperSet || paperBuildResult ? 'done' : 'pending',
        },
        {
          label: '导出',
          value: existingObjectivePaperSet || paperBuildResult ? '可进入预览' : '待题集',
          status: existingObjectivePaperSet || paperBuildResult ? 'active' : 'pending',
        },
      ]
    : []
  const workflowSummary = {
    total: paperWorkflows.length,
    closed: paperWorkflows.filter((workflow) => workflow.status === 'closed_loop').length,
    ready: paperWorkflows.filter((workflow) =>
      ['ready_to_commit', 'ready_to_paper', 'ready_to_export'].includes(workflow.status),
    ).length,
    review: paperWorkflows.filter((workflow) => workflow.status === 'needs_review').length,
  }

  // ─── Paper Intelligence bridge props (Cut B) ───
  const piBasketIds = useMemo(
    () => new Set(basket.map((item) => item.id)),
    [basket],
  )
  const piAvailableQuestionGroupIds = useMemo(
    () => new Set(questionGroups.map((group) => group.id)),
    [questionGroups],
  )
  // Real basket bridge: PaperIntelligencePreview only knows a questionGroupId
  // (it does NOT know about QuestionGroupCard or paperDraft). Resolution from
  // id → card → paperDraft.addGroups happens here. PI preview enforces button
  // state guards (basketIds / availableQuestionGroupIds) so this handler will
  // only ever be invoked for ids that actually resolve.
  //
  // Cut C P0 watch: the deps list intentionally pins the SPECIFIC handler
  // (`addGroups`) instead of the whole `paperDraft` object — `paperDraft`
  // is rebuilt every render and would force this useCallback to invalidate
  // on every render, defeating the point of memoization. `addGroups` is
  // stabilized via `useCallback` inside `usePaperDraft`, so identity stays
  // constant across renders.
  const { addGroups: paperDraftAddGroups } = paperDraft
  const piOnAddQuestionGroup = useCallback(
    (questionGroupId: string) => {
      const card = questionGroupById.get(questionGroupId)
      if (!card) return
      paperDraftAddGroups([card])
    },
    [questionGroupById, paperDraftAddGroups],
  )
  const piOnBackToWorkbench = useCallback(() => {
    // Cut C: in-app return-to-workbench. Three contracts:
    //   1. Strip Paper Intelligence route params from the URL WITHOUT a full
    //      page reload — never use window.location.href / reload.
    //   2. Flip currentPiRoute → { kind: 'none' } so App re-renders the
    //      default workbench; the previously-guarded fetch effects retrigger.
    //   3. Do NOT open the basket drawer, do NOT auto-save the Paper Set.
    //      Assembly Basket and localStorage are preserved automatically because
    //      we never touch usePaperDraft state here.
    if (typeof window !== 'undefined' && window.history && typeof window.history.replaceState === 'function') {
      try {
        const url = new URL(window.location.href)
        for (const param of ['view', 'source', 'paperId', 'surface', 'groupId', 'questionId', 'version']) {
          url.searchParams.delete(param)
        }
        const nextSearch = url.searchParams.toString()
        const nextUrl = `${url.pathname}${nextSearch ? `?${nextSearch}` : ''}${url.hash || ''}`
        window.history.replaceState(window.history.state, '', nextUrl)
      } catch {
        /* swallow — URL rewrite is best-effort; state flip below is what
         * actually unmounts PI. */
      }
    }
    setCurrentPiRoute({ kind: 'none' })
  }, [])
  const piBasketCount = basket.length

  /*
   * Issue #20: PI top bar now exposes a "草稿卷 N" button that opens a
   * read-only popover listing what's in the Assembly Basket. PI must
   * stay decoupled from BasketItem / QuestionGroupCard / usePaperDraft
   * (Cut B / Cut C boundary), so we project a pure `BasketPreviewItem`
   * array here. Total score is pre-computed (basket items store a
   * per-question `score`; teachers expect the panel total).
   *
   * Order is preserved from `basket`, which is the authoritative
   * insertion order owned by paperDraft. No sorting / filtering is
   * applied — the popover should match exactly what the workbench
   * basket would show.
   */
  const piBasketPreviewItems = useMemo(
    () =>
      basket.map((item) => ({
        id: item.id,
        paperSection: item.section,
        passageTitle: item.passageTitle,
        groupTypeLabel: groupTypeLabel[item.groupType],
        questionCount: item.questionCount,
        totalScore: item.score * item.questionCount,
        sourcePaperName: item.paperName,
      })),
    [basket],
  )

  const currentDraftPaperId = useMemo(
    () => questionGroups.find((group) => group.currentDraftPaperId)?.currentDraftPaperId || null,
    [questionGroups],
  )
  const currentDraftGroupCount = useMemo(
    () => questionGroups.filter((group) => group.draftPaperButtonState === 'in_current_draft').length,
    [questionGroups],
  )

  const openDraftPaperWorkbench = useCallback((draftPaperId?: string | null, focusGroupId?: string | null) => {
    if (typeof window !== 'undefined' && window.history && typeof window.history.pushState === 'function') {
      const url = new URL(window.location.href)
      url.searchParams.set('view', 'draft-paper')
      if (draftPaperId) {
        url.searchParams.set('draftPaperId', draftPaperId)
      } else {
        url.searchParams.delete('draftPaperId')
      }
      if (focusGroupId) {
        url.searchParams.set('focusGroupId', focusGroupId)
      } else {
        url.searchParams.delete('focusGroupId')
      }
      window.history.pushState(window.history.state, '', `${url.pathname}?${url.searchParams.toString()}${url.hash || ''}`)
    }
    setPaperImportAiRouteActive(false)
    setMySpaceRouteActive(false)
    setCurrentPiRoute({ kind: 'none' })
    setDraftPaperRoute({
      active: true,
      draftPaperId: draftPaperId || null,
      focusGroupId: focusGroupId || null,
    })
  }, [])

  const draftPaperOnBackToWorkbench = useCallback(() => {
    if (typeof window !== 'undefined' && window.history && typeof window.history.replaceState === 'function') {
      try {
        const url = new URL(window.location.href)
        for (const param of ['view', 'draftPaperId', 'focusGroupId']) {
          url.searchParams.delete(param)
        }
        const nextSearch = url.searchParams.toString()
        const nextUrl = `${url.pathname}${nextSearch ? `?${nextSearch}` : ''}${url.hash || ''}`
        window.history.replaceState(window.history.state, '', nextUrl)
      } catch {
        // State flip below is the authoritative UI change.
      }
    }
    setDraftPaperRoute({ active: false, draftPaperId: null, focusGroupId: null })
    void refreshQuestionGroups()
  }, [refreshQuestionGroups])

  const openMySpace = useCallback(() => {
    if (typeof window !== 'undefined' && window.history && typeof window.history.pushState === 'function') {
      const url = new URL(window.location.href)
      url.searchParams.set('view', 'my-space')
      url.searchParams.delete('draftPaperId')
      url.searchParams.delete('focusGroupId')
      window.history.pushState(window.history.state, '', `${url.pathname}?${url.searchParams.toString()}${url.hash || ''}`)
    }
    setDraftPaperRoute({ active: false, draftPaperId: null, focusGroupId: null })
    setPaperImportAiRouteActive(false)
    setMySpaceRouteActive(true)
    setCurrentPiRoute({ kind: 'none' })
  }, [])

  const mySpaceOnBackToWorkbench = useCallback(() => {
    if (typeof window !== 'undefined' && window.history && typeof window.history.replaceState === 'function') {
      try {
        const url = new URL(window.location.href)
        url.searchParams.delete('view')
        const nextSearch = url.searchParams.toString()
        const nextUrl = `${url.pathname}${nextSearch ? `?${nextSearch}` : ''}${url.hash || ''}`
        window.history.replaceState(window.history.state, '', nextUrl)
      } catch {
        // State flip below is the authoritative UI change.
      }
    }
    setMySpaceRouteActive(false)
    void refreshQuestionGroups()
  }, [refreshQuestionGroups])

  const paperImportAiOnBackToWorkbench = useCallback(() => {
    if (typeof window !== 'undefined' && window.history && typeof window.history.replaceState === 'function') {
      try {
        const url = new URL(window.location.href)
        url.searchParams.delete('view')
        const nextSearch = url.searchParams.toString()
        const nextUrl = `${url.pathname}${nextSearch ? `?${nextSearch}` : ''}${url.hash || ''}`
        window.history.replaceState(window.history.state, '', nextUrl)
      } catch {
        // State flip below is the authoritative UI change.
      }
    }
    setPaperImportAiRouteActive(false)
    setMySpaceRouteActive(false)
  }, [])

  const openPaperImportAiWorkbench = useCallback(() => {
    if (typeof window !== 'undefined' && window.history && typeof window.history.pushState === 'function') {
      const url = new URL(window.location.href)
      url.searchParams.set('view', 'paper-import-ai')
      window.history.pushState(window.history.state, '', `${url.pathname}?${url.searchParams.toString()}${url.hash || ''}`)
    }
    setPaperImportAiRouteActive(true)
    setMySpaceRouteActive(false)
    setCurrentPiRoute({ kind: 'none' })
  }, [])

  const toggleAdminRoute = useCallback(() => {
    setAdminRouteActive((current) => {
      const next = !current
      if (typeof window !== 'undefined' && window.history) {
        try {
          const url = new URL(window.location.href)
          if (next) {
            url.searchParams.set('view', 'admin')
          } else {
            url.searchParams.delete('view')
          }
          const nextSearch = url.searchParams.toString()
          const nextUrl = `${url.pathname}${nextSearch ? `?${nextSearch}` : ''}${url.hash || ''}`
          if (next && typeof window.history.pushState === 'function') {
            window.history.pushState(window.history.state, '', nextUrl)
          } else if (!next && typeof window.history.replaceState === 'function') {
            window.history.replaceState(window.history.state, '', nextUrl)
          }
        } catch {
          // State flip below is the authoritative UI change.
        }
      }
      return next
    })
  }, [])

  // ─── Paper Intelligence route rendering ───
  if (draftPaperRoute.active) {
    return (
      <DraftPaperWorkbench
        draftPaperId={draftPaperRoute.draftPaperId}
        focusGroupId={draftPaperRoute.focusGroupId}
        onBackToWorkbench={draftPaperOnBackToWorkbench}
        onDraftChanged={() => void refreshQuestionGroups()}
        onOpenMySpace={openMySpace}
      />
    )
  }

  if (mySpaceRouteActive) {
    return (
      <MySpacePage
        onBackToWorkbench={mySpaceOnBackToWorkbench}
        onOpenDraft={(draftPaperId) => openDraftPaperWorkbench(draftPaperId)}
      />
    )
  }

  if (paperImportAiRouteActive) {
    return <PaperImportAiWorkbench onBackToWorkbench={paperImportAiOnBackToWorkbench} />
  }

  if (currentPiRoute.kind === 'paper-intelligence') {
    // Issue #21-C1: when the URL carries `&surface=paper`, render the
    // PaperSurface harness (production PaperSurface module + PI adapter).
    // Default surface (no `surface=` param, or any unknown value including
    // the retired `surface=print`) keeps the existing render path untouched.
    // The route parser normalizes unknown values to `'default'`, so this
    // branch is the only place the harness is reachable from.
    if (currentPiRoute.surface === 'paper') {
      return (
        <PaperIntelligencePaperSurfaceHarness
          paperId={currentPiRoute.paperId}
          source={currentPiRoute.source}
          groupId={currentPiRoute.groupId}
          questionId={currentPiRoute.questionId}
          version={currentPiRoute.version}
          onBackToWorkbench={piOnBackToWorkbench}
        />
      )
    }
    return (
      <PaperIntelligencePreview
        paperId={currentPiRoute.paperId}
        basketIds={piBasketIds}
        availableQuestionGroupIds={piAvailableQuestionGroupIds}
        onAddQuestionGroup={piOnAddQuestionGroup}
        basketCount={piBasketCount}
        basketPreviewItems={piBasketPreviewItems}
        onBackToWorkbench={piOnBackToWorkbench}
      />
    )
  }

  return (
    <div className="app-shell home-mode-ai">
      <header className="topbar">
        <div>
          <p className="eyebrow">English Question Bank</p>
          <h1>英语题库工作台</h1>
        </div>
        <div className="topbar-actions">
          <button className="ghost-button" type="button" onClick={openMySpace}>
            <Archive size={16} />
            个人空间
          </button>
          {isOwnerView && (
            <button
              className="ghost-button"
              type="button"
              onClick={toggleAdminRoute}
              aria-pressed={adminRouteActive}
            >
              <Tag size={16} />
              {adminRouteActive ? '退出管理' : '管理'}
            </button>
          )}
          {currentUser && (
            <span className="topbar-user-group">
              <span className="topbar-username">{currentUser.username}</span>
              <button
                className="ghost-button"
                type="button"
                onClick={() => {
                  void logout().finally(() => window.location.reload())
                }}
              >
                <LogOut size={16} />
                退出
              </button>
            </span>
          )}
        </div>
      </header>

      {adminRouteActive && (
        <AdminWorkbench
          onOpenImportPanel={openImportPanel}
          onOpenPaperImportAiWorkbench={openPaperImportAiWorkbench}
          backfillStatus={backfillStatus}
          backfillResult={backfillResult}
          backfillError={backfillError}
          onBackfillTopicLabels={() => void handleBackfillTopicLabels()}
          paperWorkflows={paperWorkflows}
          paperWorkflowsStatus={paperWorkflowsStatus}
          paperWorkflowsError={paperWorkflowsError}
          paperWorkflowStatusHint={paperWorkflowStatusHint}
          workflowSummary={workflowSummary}
          workflowProgress={workflowProgress}
          sortedWorkflowBankGroups={sortedWorkflowBankGroups}
          workflowSectionLabel={workflowSectionLabel}
          formatWorkflowExport={formatWorkflowExport}
          onRefreshPaperWorkflows={() => void refreshPaperWorkflows()}
          basket={basket}
          questionGroupById={questionGroupById}
          onAddWorkflowGroupsToBasket={addWorkflowGroupsToBasket}
          onAddToBasket={addToBasket}
          paperBuildStatus={paperBuildStatus}
          paperBuildResult={paperBuildResult}
          onBuildWorkflowPaperSet={(workflow) => void handleBuildWorkflowPaperSet(workflow)}
          draftStatusByBundleId={draftStatusByBundleId}
          onOpenWorkflowDraft={(workflow) => void openWorkflowDraft(workflow)}
        />
      )}

      {!adminRouteActive && (
      <main className="workbench" aria-label="英语题库工作台">
        <section className="library-panel" aria-label="题库">
          <div className="library-header">
            <div>
              <p className="eyebrow">Question Groups</p>
              <h2>
                {viewMode === 'detail' ? '题组详情' : '题组列表'}
              </h2>
            </div>
            <div className="library-header-actions">
              <div className="filter-bar-summary">
                <BookOpen size={17} />
                <strong>{questionGroups.length}</strong>
                <span>个题组</span>
              </div>
            </div>
          </div>

          {viewMode === 'list' ? (
              <ConciergeDesk
                retrieval={conciergeDesk.retrieval}
                actions={conciergeDesk.actions}
                basketIds={new Set(basket.map((item) => item.id))}
                onAdd={(group) => addToBasket(group)}
                onOpenDetail={(group) => openDetail(group.id)}
                questionGroups={questionGroups}
                dataStatus={dataStatus}
                thinkingMode={aiThinkingMode}
                onThinkingModeChange={(value) => {
                  setAiThinkingMode(value)
                  localStorage.setItem('ai-thinking-mode', value ? 'on' : 'off')
                }}
              />
          ) : viewMode === 'detail' ? (
            <QuestionGroupDetailView
              isOwnerView={isOwnerView}
              defaultAiModel={DEFAULT_AI_MODEL}
              detail={{ selectedDetail, detailStatus, detailError }}
              verify={{ verifyResult, verifyStatus, verifyError }}
              clozeParse={{
                result: clozeParseResult,
                status: clozeParseStatus,
                error: clozeParseError,
                saveStatus: clozeParseSaveStatus,
                saveError: clozeParseSaveError,
              }}
              sevenChoicesParse={{
                result: sevenChoicesParseResult,
                status: sevenChoicesParseStatus,
                error: sevenChoicesParseError,
                saveStatus: sevenChoicesParseSaveStatus,
                saveError: sevenChoicesParseSaveError,
              }}
              grammarParse={{
                result: grammarParseResult,
                status: grammarParseStatus,
                error: grammarParseError,
                saveStatus: grammarParseSaveStatus,
                saveError: grammarParseSaveError,
              }}
              readingParse={{
                result: readingParseResult,
                status: readingParseStatus,
                error: readingParseError,
                saveStatus: readingParseSaveStatus,
                saveError: readingParseSaveError,
              }}
              onBack={backToList}
              onEdit={openEditEntry}
              onDelete={handleDeleteQuestionGroup}
              onAddToBasket={addToBasket}
            />
          ) : null}
        </section>
      </main>
      )}

      <button
        type="button"
        className="basket-chip"
        onClick={() => openDraftPaperWorkbench(currentDraftPaperId)}
        aria-label={`打开草稿卷，已选 ${currentDraftGroupCount} 个题组`}
        disabled={!currentDraftPaperId || currentDraftGroupCount === 0}
      >
        <ClipboardList size={15} />
        <span>草稿卷 · {currentDraftGroupCount} 题组</span>
      </button>

      {isEntryOpen && (
        <EntryModal
          open={isEntryOpen}
          mode="edit"
          initialDetail={entryInitialDetail}
          onClose={() => setEntryOpen(false)}
          onSaved={handleEntrySaved}
        />
      )}

      {isImportOpen && (
        <div className="entry-backdrop" role="presentation">
          <section className="entry-panel import-panel intake-panel" aria-label="导入资料" role="dialog" aria-modal="true">
            <div className="entry-header intake-header">
              <div>
                <p className="eyebrow">Import</p>
                <h2>导入资料</h2>
                <span className="entry-header-hint">把资料丢进来，我会判断类型，再交给你确认。</span>
              </div>
              <div className="entry-header-actions">
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => { refreshImportFiles(); refreshImportBundles() }}
                  aria-label="刷新资料组"
                  title="刷新"
                >
                  <RefreshCw size={16} />
                </button>
                <button
                  className="icon-button"
                  type="button"
                  onClick={() => setImportOpen(false)}
                  aria-label="关闭导入面板"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <form className="entry-form import-form intake-form" onSubmit={handleImportSubmit}>
              {/* ── Intake hero: single drop-zone-style file input + primary action ── */}
              <label className="intake-dropzone" htmlFor="import-file-input">
                <div className="intake-dropzone-icon" aria-hidden="true">
                  <FileText size={28} />
                </div>
                <div className="intake-dropzone-copy">
                  <strong>选择答案卷、题解同文件，或整组资料</strong>
                  <span>我会识别资料类型，生成草稿后再交给你确认。</span>
                  <span className="intake-dropzone-hint">点击选择文件，后续会支持拖拽导入。</span>
                </div>
                <input
                  id="import-file-input"
                  className="intake-file-input"
                  accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  multiple
                  type="file"
                  onChange={(event) => {
                    const files = Array.from(event.target.files || [])
                    setSelectedImportFiles(files)
                    if (files.length > 0 && !importBundleTitle.trim()) {
                      setImportBundleTitle(files[0].name.replace(/\.[^.]+$/, ''))
                    }
                    setImportStatus('idle')
                    setImportError('')
                  }}
                />
              </label>

              {selectedImportFiles.length > 0 && (
                <div className="intake-file-preview" aria-label="已选择文件">
                  <span className="intake-file-preview-count">{selectedImportFiles.length} 个文件</span>
                  <ul>
                    {selectedImportFiles.map((file) => (
                      <li key={file.name}>
                        <span>{file.name}</span>
                        <span className="intake-muted">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="intake-action-row">
                <button
                  className="intake-primary-button"
                  type="submit"
                  disabled={importStatus === 'importing' || selectedImportFiles.length === 0}
                >
                  {importStatus === 'importing' ? '导入中…' : '开始导入'}
                </button>
                {importStatus === 'imported' && <span className="intake-action-note success">资料已收到，等待解析。</span>}
                {importStatus === 'error' && <span className="intake-action-note error">{importError || '导入失败，可以再试一次。'}</span>}
                {importBundleId && (
                  <span className="intake-action-note">将导入到资料组：{importBundleTitle || '未命名'}</span>
                )}
              </div>

              {/* ── Advanced: bundle name + content role demoted under <details> ── */}
              <details className="intake-advanced">
                <summary>更多设置（资料类型、资料组归属）</summary>
                <div className="intake-advanced-grid">
                  <label className="intake-field">
                    <span>资料类型</span>
                    <select
                      value={importContentRole}
                      onChange={(event) => {
                        setImportContentRole(event.target.value as ImportContentRole)
                        setImportStatus('idle')
                        setImportError('')
                      }}
                    >
                      <option value="question_with_analysis">题目+解析同文件</option>
                      <option value="question">题目文件</option>
                      <option value="answer_analysis">答案解析文件</option>
                      <option value="other">其他资料</option>
                    </select>
                  </label>
                  <label className="intake-field">
                    <span>资料组名称</span>
                    <input
                      placeholder="双文件时保持同一个名称"
                      value={importBundleTitle}
                      onChange={(event) => {
                        setImportBundleTitle(event.target.value)
                        setImportBundleId('')
                      }}
                    />
                  </label>
                </div>
              </details>

              <details className="batch-import-panel batch-import-secondary intake-batch-panel">
                <summary>
                  <span>文件夹批量导入</span>
                  <strong className="intake-batch-pill">{importBatches.length} 批次</strong>
                </summary>

                <div className="batch-import-grid intake-batch-grid">
                  <label className="field wide intake-field">
                    <span>本地文件夹路径</span>
                    <input
                      value={batchDirectoryPath}
                      onChange={(event) => {
                        setBatchDirectoryPath(event.target.value)
                        setBatchScanStatus('idle')
                        setBatchScanError('')
                      }}
                    />
                  </label>
                  <label className="field intake-field">
                    <span>批次名称</span>
                    <input
                      placeholder="默认使用文件夹名"
                      value={batchTitle}
                      onChange={(event) => setBatchTitle(event.target.value)}
                    />
                  </label>
                  <label className="field intake-field">
                    <span>默认资料类型</span>
                    <select
                      value={batchContentRole}
                      onChange={(event) => setBatchContentRole(event.target.value as ImportContentRole)}
                    >
                      <option value="question_with_analysis">题目+解析同文件</option>
                      <option value="question">题目文件</option>
                      <option value="answer_analysis">答案解析文件</option>
                      <option value="other">其他资料</option>
                    </select>
                  </label>
                  <label className="checkbox-field intake-checkbox-field">
                    <input
                      checked={batchRecursive}
                      type="checkbox"
                      onChange={(event) => setBatchRecursive(event.target.checked)}
                    />
                    <span>递归扫描子文件夹</span>
                  </label>
                  <label className="field intake-field">
                    <span>单次导入</span>
                    <select value={batchImportLimit} onChange={(event) => setBatchImportLimit(event.target.value)}>
                      <option value="5">5 个文件</option>
                      <option value="10">10 个文件</option>
                      <option value="20">20 个文件</option>
                      <option value="all">全部文件</option>
                    </select>
                  </label>
                </div>

                <div className="batch-import-actions intake-batch-actions">
                  <button
                    className="intake-secondary-button"
                    disabled={batchScanStatus === 'scanning' || !batchDirectoryPath.trim()}
                    type="button"
                    onClick={handleScanImportDirectory}
                  >
                    {batchScanStatus === 'scanning' ? '扫描中…' : '扫描文件夹'}
                  </button>
                  {batchScanStatus === 'scanned' && <span className="intake-action-note success">已生成批量导入队列。</span>}
                  {batchScanStatus === 'error' && <span className="intake-action-note error">{batchScanError}</span>}
                </div>

                {importBatchesStatus === 'loading' && <p className="intake-batch-note">读取批次中…</p>}
                {importBatchesStatus === 'error' && <p className="intake-action-note error">{importBatchesError}</p>}
                {importBatchesStatus === 'loaded' && importBatches.length === 0 && (
                  <p className="intake-batch-note">扫描文件夹后，这里会显示每个 DOCX/PDF 的队列状态。</p>
                )}

                {importBatches.length > 0 && (
                  <div className="batch-list">
                    {importBatches.slice(0, 4).map((batch) => {
                      const queuedCount = batch.items.filter((item) => item.status === 'queued').length
                      const runStatus = batchRunStatusById[batch.id] || 'idle'
                      const batchRunLimit =
                        batchImportLimit === 'all' ? queuedCount : Math.min(queuedCount, Number(batchImportLimit))

                      return (
                        <article className="batch-card" key={batch.id}>
                          <div className="batch-card-head">
                            <div>
                              <strong>{batch.title}</strong>
                              <span>{batch.directoryPath}</span>
                            </div>
                            <span className={`batch-status ${batch.status}`}>{importBatchStatusLabel[batch.status]}</span>
                          </div>

                          <div className="batch-stats">
                            <span>{batch.fileCount} 文件</span>
                            <span>{batch.importedCount} 已导入</span>
                            <span>{batch.parsedCount} 已解析</span>
                            <span>{batch.failedCount} 失败</span>
                          </div>

                          <div className="batch-actions">
                            <button
                              className="add-button"
                              disabled={queuedCount === 0 || runStatus === 'importing'}
                              type="button"
                              onClick={() => handleRunImportBatch(batch)}
                            >
                              {runStatus === 'importing'
                                ? '导入解析中'
                                : queuedCount === 0
                                  ? '队列已完成'
                                  : batchImportLimit === 'all'
                                    ? `导入并解析 ${queuedCount} 个`
                                    : `导入并解析 ${batchRunLimit}/${queuedCount} 个`}
                            </button>
                            {runStatus === 'imported' && <span className="writeback-result">批次已处理。</span>}
                            {runStatus === 'error' && (
                              <span className="form-error compact">{batchRunErrorById[batch.id]}</span>
                            )}
                          </div>

                          <div className="batch-item-list">
                            {batch.items.slice(0, 8).map((item) => (
                              <div className="batch-item" key={item.id}>
                                <div>
                                  <strong>{item.fileName}</strong>
                                  <span>
                                    {importContentRoleLabel[item.contentRole]} · {item.fileType.toUpperCase()} ·{' '}
                                    {formatFileSize(item.fileSize)}
                                  </span>
                                  <span>资料组：{item.bundleTitle}</span>
                                  {item.errorMessage && <span className="batch-item-error">{item.errorMessage}</span>}
                                </div>
                                <span className={`batch-item-status ${item.status}`}>
                                  {importBatchItemStatusLabel[item.status]}
                                </span>
                              </div>
                            ))}
                          </div>
                        </article>
                      )
                    })}
                  </div>
                )}
              </details>

              <section className="import-bundles intake-bundles" aria-label="资料组工作台">
                <div className="intake-bundles-heading">
                  <span>资料组</span>
                  <strong>{importBundles.length}</strong>
                </div>

                {importBundlesStatus === 'loading' && <p className="saved-paper-note">读取中...</p>}
                {importBundlesStatus === 'error' && <p className="form-error">{importBundlesError}</p>}
                {importBundlesStatus === 'loaded' && importBundles.length === 0 && (
                  <p className="saved-paper-note">导入资料后，这里会按下一步该做什么自动归类。</p>
                )}

                {importBundles.length > 0 && (() => {
                  const stages = importBundles.map((bundle) => ({
                    bundle,
                    next: deriveBundleNextStep(
                      bundle,
                      draftStatusByBundleId[bundle.id],
                      answerAlignmentStatusByBundleId[bundle.id],
                    ),
                  }))

                  const renderRow = (bundle: ImportBundle, next: BundleNextStep) => {
                    const isDraftRunning = draftStatusByBundleId[bundle.id] === 'generating'
                    const isAlignRunning = answerAlignmentStatusByBundleId[bundle.id] === 'generating'
                    const draftError = draftStatusByBundleId[bundle.id] === 'error' ? draftErrorByBundleId[bundle.id] : ''
                    const alignError = answerAlignmentStatusByBundleId[bundle.id] === 'error'
                      ? answerAlignmentErrorByBundleId[bundle.id]
                      : ''

                    function runPrimary() {
                      if (next.primaryAction === 'generate-draft') handleGenerateImportDraft(bundle)
                      else if (next.primaryAction === 'add-analysis') prepareAnswerAnalysisImport(bundle)
                      else if (next.primaryAction === 'align-answers') handleGenerateAnswerAlignment(bundle)
                    }

                    return (
                      <li className="intake-row" key={bundle.id}>
                        <div className="intake-row-anchor">
                          <strong title={bundle.title}>{bundle.title}</strong>
                          <span className="intake-muted">
                            {bundle.latestCreatedAt} · {importBundleReadinessLabel[bundle.readiness]}
                          </span>
                        </div>

                        <div className="intake-row-body">
                          <p className="intake-row-status">{next.statusLabel}</p>
                          <p className="intake-row-metrics">
                            <span>题目 {bundle.roleCounts.question}</span>
                            <span>解析 {bundle.roleCounts.answerAnalysis}</span>
                            <span>题解同文件 {bundle.roleCounts.questionWithAnalysis}</span>
                            <span>{bundle.parsedCount}/{bundle.fileCount} 已解析</span>
                          </p>
                          {(draftError || alignError) && (
                            <p className="intake-row-error">{draftError || alignError}</p>
                          )}
                        </div>

                        <div className="intake-row-actions" aria-label="资料组操作">
                          {next.primaryAction && (
                            <button
                              className="intake-row-primary"
                              type="button"
                              onClick={runPrimary}
                              disabled={isDraftRunning || isAlignRunning}
                              aria-label={next.primaryActionLabel || '继续'}
                              title={next.primaryActionLabel || '继续'}
                            >
                              {isDraftRunning || isAlignRunning ? '…' : '→'}
                            </button>
                          )}
                          <details className="intake-row-more">
                            <summary aria-label="更多操作">⋯</summary>
                            <div className="intake-row-more-menu">
                              <button
                                type="button"
                                disabled={bundle.parsedCount === 0 || isDraftRunning}
                                onClick={() => handleGenerateImportDraft(bundle)}
                              >
                                {bundle.roleCounts.answerAnalysis > 0 || bundle.roleCounts.questionWithAnalysis > 0
                                  ? '生成带答案草稿'
                                  : '生成拆题草稿'}
                              </button>
                              <button type="button" onClick={() => prepareAnswerAnalysisImport(bundle)}>
                                补解析文件
                              </button>
                              <button
                                type="button"
                                disabled={bundle.parsedCount === 0 || isAlignRunning}
                                onClick={() => handleGenerateAnswerAlignment(bundle)}
                              >
                                正式库答案对齐
                              </button>
                            </div>
                          </details>
                        </div>
                      </li>
                    )
                  }

                  const actionable = stages.filter((s) => s.next.stage === 'actionable')
                  const processing = stages.filter((s) => s.next.stage === 'processing')
                  const done = stages.filter((s) => s.next.stage === 'done')

                  return (
                    <>
                      {actionable.length > 0 && (
                        <div className="intake-stage-group">
                          <h3 className="intake-stage-title">需要你处理 <span>{actionable.length}</span></h3>
                          <ul className="intake-row-list">
                            {actionable.slice(0, 12).map((s) => renderRow(s.bundle, s.next))}
                          </ul>
                          {actionable.length > 12 && (
                            <p className="intake-stage-overflow">还有 {actionable.length - 12} 份资料未显示</p>
                          )}
                        </div>
                      )}
                      {processing.length > 0 && (
                        <div className="intake-stage-group">
                          <h3 className="intake-stage-title">处理中 <span>{processing.length}</span></h3>
                          <ul className="intake-row-list">
                            {processing.slice(0, 12).map((s) => renderRow(s.bundle, s.next))}
                          </ul>
                          {processing.length > 12 && (
                            <p className="intake-stage-overflow">还有 {processing.length - 12} 份资料未显示</p>
                          )}
                        </div>
                      )}
                      {done.length > 0 && (
                        <details className="intake-stage-group intake-stage-done">
                          <summary>
                            <h3 className="intake-stage-title">草稿待确认 <span>{done.length}</span></h3>
                          </summary>
                          <ul className="intake-row-list">
                            {done.slice(0, 12).map((s) => renderRow(s.bundle, s.next))}
                          </ul>
                          {done.length > 12 && (
                            <p className="intake-stage-overflow">还有 {done.length - 12} 份资料未显示</p>
                          )}
                        </details>
                      )}
                    </>
                  )
                })()}
              </section>

              {activeImportDraft && (
                <section className="import-draft-preview" aria-label="拆题草稿预览">
                  <div className="saved-paper-heading">
                    <span>拆题草稿</span>
                    <strong>{activeImportDraft.groupCount} 组</strong>
                  </div>
                  <div className="draft-summary">
                    <span>
                      {activeImportDraft.source.year} · {activeImportDraft.source.region || '未标地区'} ·{' '}
                      {activeImportDraft.questionCount} 小题
                    </span>
                    <span>
                      来源：{activeImportDraft.sourceFiles.map((file) => file.originalName).join('、')}
                    </span>
                    {(activeImportDraft.answerFiles?.length ?? 0) > 0 && (
                      <span>
                        解析：{activeImportDraft.answerFiles?.map((file) => file.originalName).join('、')} · 已并入答案{' '}
                        {activeImportDraft.answerMatchedQuestionCount ?? 0} 题
                      </span>
                    )}
                  </div>

                  {activeImportDraft.warnings.length > 0 && (
                    <div className="draft-warnings">
                      {activeImportDraft.warnings.map((warning) => (
                        <span key={warning}>{warning}</span>
                      ))}
                    </div>
                  )}

                  <div className="single-intake-flow" aria-label="单份资料处理进度">
                    {singleIntakeSteps.map((step) => (
                      <span className={`single-intake-step ${step.status}`} key={step.label}>
                        {step.status === 'done' && <CheckCircle2 size={14} />}
                        <strong>{step.label}</strong>
                        {step.value}
                      </span>
                    ))}
                  </div>

                  {draftQuality && (
                    <div
                      className={`draft-quality-panel ${
                        draftQuality.readyForBatchCommit ? 'ready' : 'needs-review'
                      }`}
                    >
                      <div>
                        <strong>{draftQuality.readyForBatchCommit ? '草稿可试入库' : '入库前需要核对'}</strong>
                        <span>
                          客观题 {draftQuality.objectiveGroupCount} 组 / {draftQuality.objectiveQuestionCount} 小题 ·
                          写作类 {draftQuality.writingGroupCount} 组留在草稿
                        </span>
                      </div>
                      <div className="draft-quality-metrics">
                        <span className={draftQuality.sourceWarningCount === 0 ? 'ok' : 'warning'}>
                          来源口径 {draftQuality.sourceWarningCount}
                        </span>
                        <span className={draftQuality.missingAnswerCount === 0 ? 'ok' : 'warning'}>
                          缺答案 {draftQuality.missingAnswerCount}
                        </span>
                        <span className={draftQuality.missingOptionsGroupCount === 0 ? 'ok' : 'warning'}>
                          缺选项组 {draftQuality.missingOptionsGroupCount}
                        </span>
                        <span className={draftQuality.lowConfidenceGroupCount === 0 ? 'ok' : 'warning'}>
                          低置信组 {draftQuality.lowConfidenceGroupCount}
                        </span>
                        <span className={draftQuality.structuralWarningCount === 0 ? 'ok' : 'warning'}>
                          结构提醒 {draftQuality.structuralWarningCount}
                        </span>
                      </div>
                      {!draftQuality.readyForBatchCommit && (
                        <label className="review-confirmation">
                          <input
                            checked={draftReviewConfirmed}
                            type="checkbox"
                            onChange={(event) => setDraftReviewConfirmed(event.target.checked)}
                          />
                          <span>已核对来源题名、题数、选项和答案，允许本草稿批量入库。</span>
                        </label>
                      )}
                    </div>
                  )}

                  <div className="draft-group-list">
                    {activeImportDraft.groups.slice(0, 12).map((group) => {
                      return (
                        <article className="draft-group-card" key={group.id}>
                          <div className="draft-group-header">
                            <div>
                              <strong>{group.title}</strong>
                              <span>
                                {groupTypeLabel[group.groupType]} · {group.questionCount} 小题 · 置信度{' '}
                                {Math.round(group.confidence * 100)}%
                              </span>
                            </div>
                            <span>{group.totalScore} 分</span>
                          </div>
                          <div className="draft-group-actions">
                            <button
                              className="add-button"
                              disabled={
                                commitStatusByDraftGroupId[group.id] === 'saving' ||
                                commitStatusByDraftGroupId[group.id] === 'saved' ||
                                isDraftGroupAlreadyInQuestionBank(group)
                              }
                              type="button"
                              onClick={() => handleCommitDraftGroup(group)}
                            >
                              {commitStatusByDraftGroupId[group.id] === 'saved' || isDraftGroupAlreadyInQuestionBank(group)
                                ? '已在题库'
                                : commitStatusByDraftGroupId[group.id] === 'saving'
                                  ? '入库中'
                                  : '入库此题组'}
                            </button>
                            {commitStatusByDraftGroupId[group.id] === 'error' && (
                              <span className="form-error compact">{commitErrorByDraftGroupId[group.id]}</span>
                            )}
                          </div>
                          {group.warnings.length > 0 && (
                            <div className="draft-warnings compact">
                              {group.warnings.map((warning) => (
                                <span key={warning}>{warning}</span>
                              ))}
                            </div>
                          )}
                          <p>{group.materialText.slice(0, 220) || group.questions[0]?.stem || '暂无材料预览。'}</p>
                          <div className="draft-question-list">
                            {group.questions.slice(0, 4).map((question) => (
                              <div className="draft-question-item" key={`${group.id}-${question.questionNo}`}>
                                <strong>{question.questionNo}</strong>
                                <span className="draft-question-stem">{compactPreview(question.stem)}</span>
                                <span className={`draft-answer-badge ${question.answer ? '' : 'missing'}`.trim()}>
                                  答案：{question.answer || '待补'}
                                </span>
                                {question.options.length > 0 && (
                                  <span className="draft-option-count">{question.options.length} 项</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </article>
                      )
                    })}
                  </div>

                  {objectiveDraftGroups.length > 0 && (
                    <div className="draft-batch-panel auxiliary-batch-panel">
                      <div>
                        <strong>辅助：客观题批量入库</strong>
                        <span>
                          可入库 {importableObjectiveDraftGroups.length} 组 · 已跳过{' '}
                          {objectiveDraftGroups.length - importableObjectiveDraftGroups.length} 组 · 写作类继续留在草稿
                        </span>
                      </div>
                      <button
                        className="add-button"
                        disabled={batchCommitStatus === 'saving' || !canBatchCommitObjectiveDraft}
                        type="button"
                        onClick={handleBatchCommitObjectiveDraftGroups}
                      >
                        {batchCommitStatus === 'saving'
                          ? '批量入库中'
                          : importableObjectiveDraftGroups.length === 0
                            ? '客观题已入库'
                            : !canBatchCommitObjectiveDraft
                              ? '待核对后入库'
                            : `批量入库客观题 ${importableObjectiveDraftGroups.length} 组`}
                      </button>
                      {batchCommitResult && (
                        <span className="writeback-result">
                          已入库 {batchCommitResult.saved} 组，跳过 {batchCommitResult.skipped} 组
                        </span>
                      )}
                      {batchCommitStatus === 'error' && <span className="form-error compact">{batchCommitError}</span>}
                    </div>
                  )}

                  {objectiveDraftGroups.length > 0 && (
                    <div className="draft-batch-panel paper-build-panel">
                      <div>
                        <strong>生成整卷题集</strong>
                        <span>
                          已入库 {objectivePaperGroups.length}/{objectiveDraftGroups.length} 组 · 默认卷名：
                          {objectivePaperTitle}
                        </span>
                      </div>
                      <button
                        className="save-button"
                        disabled={
                          paperBuildStatus === 'saving' || objectivePaperGroups.length < objectiveDraftGroups.length
                        }
                        type="button"
                        onClick={handleBuildObjectivePaperSet}
                      >
                        {paperBuildStatus === 'saving'
                          ? '更新中'
                          : existingObjectivePaperSet || paperBuildResult
                            ? '更新整卷题集'
                            : '生成整卷题集'}
                      </button>
                      {(paperBuildResult || existingObjectivePaperSet) && paperBuildStatus !== 'error' && (
                        <span className="writeback-result">
                          题集：{(paperBuildResult || existingObjectivePaperSet)?.title} ·{' '}
                          {(paperBuildResult || existingObjectivePaperSet)?.itemCount} 题组
                        </span>
                      )}
                      {objectivePaperGroups.length < objectiveDraftGroups.length && (
                        <span className="draft-panel-note">先完成客观题入库，再生成整卷题集。</span>
                      )}
                      {paperBuildStatus === 'error' && <span className="form-error compact">{paperBuildError}</span>}
                    </div>
                  )}
                </section>
              )}

              {activeAnswerAlignment && (
                <section className="import-draft-preview answer-alignment-preview" aria-label="答案对齐草稿预览">
                  <div className="saved-paper-heading">
                    <span>答案对齐草稿</span>
                    <strong>{activeAnswerAlignment.matchedQuestionCount} 题</strong>
                  </div>
                  <div className="draft-summary">
                    <span>
                      {activeAnswerAlignment.targetGroupCount} 个题库题组 · {activeAnswerAlignment.matchedGroupCount}{' '}
                      个已有匹配
                    </span>
                    <span>
                      解析来源：
                      {activeAnswerAlignment.sourceFiles.length > 0
                        ? activeAnswerAlignment.sourceFiles.map((file) => file.originalName).join('、')
                        : '暂无已解析的答案解析文件'}
                    </span>
                  </div>

                  {activeAnswerAlignment.warnings.length > 0 && (
                    <div className="draft-warnings">
                      {activeAnswerAlignment.warnings.map((warning) => (
                        <span key={warning}>{warning}</span>
                      ))}
                    </div>
                  )}

                  {activeAnswerAlignment.groups.length > 0 && (
                    <div className="draft-group-list">
                      {activeAnswerAlignment.groups.slice(0, 8).map((group) => (
                        <article className="draft-group-card" key={group.id}>
                          <div className="draft-group-header">
                            <div>
                              <strong>{group.title}</strong>
                              <span>
                                {groupTypeLabel[group.groupType]} · {group.matchedCount}/{group.questionCount} 已匹配
                              </span>
                            </div>
                            <span>{Math.round(group.confidence * 100)}%</span>
                          </div>
                          <div className="draft-group-actions">
                            <button
                              className="detail-button"
                              disabled={
                                group.matchedCount === 0 ||
                                answerWritebackStatusByGroupId[group.id] === 'saving' ||
                                answerWritebackStatusByGroupId[group.id] === 'saved'
                              }
                              type="button"
                              onClick={() => handleApplyAnswerAlignmentGroup(group)}
                            >
                              {answerWritebackStatusByGroupId[group.id] === 'saved' ? (
                                <>
                                  <CheckCircle2 size={14} />
                                  已写回
                                </>
                              ) : answerWritebackStatusByGroupId[group.id] === 'saving' ? (
                                '写回中'
                              ) : (
                                '写回答案解析'
                              )}
                            </button>
                            {answerWritebackResultByGroupId[group.id] && (
                              <span className="writeback-result">
                                写回 {answerWritebackResultByGroupId[group.id].updatedQuestionCount} 题
                              </span>
                            )}
                            {answerWritebackStatusByGroupId[group.id] === 'error' && (
                              <span className="form-error compact">{answerWritebackErrorByGroupId[group.id]}</span>
                            )}
                          </div>
                          {group.warnings.length > 0 && (
                            <div className="draft-warnings compact">
                              {group.warnings.map((warning) => (
                                <span key={warning}>{warning}</span>
                              ))}
                            </div>
                          )}
                          <div className="answer-match-list">
                            {group.matches.slice(0, 10).map((match) => (
                              <span className={match.status} key={match.questionId}>
                                {match.questionNo}. {match.proposedAnswer || '待匹配'}
                                {match.proposedExplanation ? ` · ${match.proposedExplanation.slice(0, 36)}` : ''}
                              </span>
                            ))}
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              )}

              <section className="import-history" aria-label="导入记录">
                <div className="saved-paper-heading">
                  <span>最近导入</span>
                  <strong>{importFiles.length}</strong>
                </div>

                {importFilesStatus === 'loading' && <p className="saved-paper-note">读取中...</p>}
                {importFilesStatus === 'error' && <p className="form-error">{importFilesError}</p>}
                {importFilesStatus === 'loaded' && importFiles.length === 0 && (
                  <p className="saved-paper-note">导入的 DOCX/PDF 会显示在这里。</p>
                )}

                {importFiles.length > 0 && (
                  <div className="import-file-list">
                    {importFiles.slice(0, 8).map((file) => (
                      <article className="import-file-item" key={file.id}>
                        <div>
                          <strong>{file.originalName}</strong>
                          <span>
                            {importContentRoleLabel[file.contentRole]} · {file.fileType.toUpperCase()} · {file.status} · {file.createdAt}
                            {file.parse ? ` · ${file.parse.lineCount} 行 / ${file.parse.charCount} 字符` : ''}
                          </span>
                          {file.bundleTitle && <span>资料组：{file.bundleTitle}</span>}
                          {file.note && <p>{file.note}</p>}
                        </div>
                        <div className="import-file-actions">
                          {file.parse ? (
                            <button className="detail-button" type="button" onClick={() => handleShowImportParse(file)}>
                              查看文本
                            </button>
                          ) : (
                            <button
                              className="detail-button"
                              disabled={file.fileType !== 'docx' || parseStatusByFileId[file.id] === 'parsing'}
                              type="button"
                              onClick={() => handleParseImportFile(file)}
                            >
                              {file.fileType === 'docx'
                                ? parseStatusByFileId[file.id] === 'parsing'
                                  ? '解析中'
                                  : '解析 DOCX'
                                : 'PDF 待解析'}
                            </button>
                          )}
                          <button
                            className="icon-button"
                            type="button"
                            onClick={() => handleDeleteImportFile(file)}
                            aria-label="删除导入文件"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                        {parseStatusByFileId[file.id] === 'error' && (
                          <p className="form-error compact">{parseErrorByFileId[file.id]}</p>
                        )}
                      </article>
                    ))}
                  </div>
                )}
              </section>

              {activeImportParse && (
                <section className="import-parse-preview" aria-label="解析文本预览">
                  <div className="saved-paper-heading">
                    <span>解析预览</span>
                    <strong>{activeImportParse.lineCount} 行</strong>
                  </div>
                  <p>
                    {activeImportParse.parser} · {activeImportParse.charCount} 字符
                  </p>
                  <pre>{activeImportParse.extractedText || '暂无可预览文本。'}</pre>
                </section>
              )}

            </form>
          </section>
        </div>
      )}
    </div>
  )
}

export default App
