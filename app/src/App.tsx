import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  FileDown,
  FileText,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  Tag,
  Trash2,
  X,
} from 'lucide-react'
import type { FormEvent } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { questionGroups as sampleQuestionGroups } from './data/sampleQuestionGroups'
import {
  type ApplyAnswerAlignmentResult,
  difficultyLabel,
  groupTypeLabel,
  sourceTypeLabel,
  type BasketItem,
  type CreateQuestionGroupInput,
  type Difficulty,
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
  type SourceType,
  type TopicLabel,
  type VersionType,
  type VerifyQuestionGroupResult,
  type ReadingParseQuestionGroupResult,
  type ClozeParseQuestionGroupResult,
  type SevenChoicesParseQuestionGroupResult,
  type GrammarParseQuestionGroupResult,
  type VerifyResult,
  verdictLabel,
} from './domain/questionBank'
import {
  computeQuestionNumbers,
} from './domain/paperLayout'
import { buildSavePayload } from './paperAssembly/paperExportPayload'
import { usePaperDraft } from './paperAssembly/usePaperDraft'
import type { PaperDraftEditReason } from './paperAssembly/paperDraftModel'
import { createBasketItem } from './paperAssembly/paperDraftModel'
import { PaperBlockCanvas } from './paperAssembly/PaperBlockCanvas'
import { ConciergeDesk } from './concierge/ConciergeDesk'
import { useConciergeDesk } from './concierge/useConciergeDesk'
import { usePaperExports } from './paperAssembly/usePaperExports'
import { computeCalibrationPreview, getReasonLabel, type CalibrationInput } from './services/difficultyCalibration'
import {
  applyImportAnswerAlignment,
  createQuestionGroup,
  deleteImportFile as deleteImportFileRequest,
  deleteQuestionGroup as deleteQuestionGroupRequest,
  fetchImportBatches,
  fetchImportBundles,
  fetchImportFiles,
  fetchImportFileParse,
  fetchPaperSetDetail,
  fetchPaperSets,
  fetchPaperWorkflows,
  fetchQuestionGroupDetail,
  fetchQuestionGroups,
  generateImportAnswerAlignment,
  generateImportBundleDraft,
  generateQuestionGroupSummary as generateQuestionGroupSummaryRequest,
  generateTopicLabels as generateTopicLabelsRequest,
  type GenerateTopicLabelsResult,
  askQuestionBankSteward as askQuestionBankStewardRequest,
  type QuestionBankStewardResult,
  bindTopicLabels as bindTopicLabelsRequest,
  type SemanticSearchResult,
  runImportBatch,
  savePaperSet,
  saveClozeParseResultRequest,
  saveSevenChoicesParseResultRequest,
  saveGrammarParseResultRequest,
  saveQuestionDifficultyRating as saveQuestionDifficultyRatingRequest,
  saveReadingParseResult as saveReadingParseResultRequest,
  updatePaperSet as updatePaperSetRequest,
  scanImportDirectory,
  updateQuestionGroup,
  uploadImportFile,
  parseReadingQuestionGroup as parseReadingQuestionGroupRequest,
  verifyQuestionGroup as verifyQuestionGroupRequest,
  parseClozeGroup as parseClozeGroupRequest,
  parseSevenChoicesGroup as parseSevenChoicesGroupRequest,
  parseGrammarGroup as parseGrammarGroupRequest,
  parseImportFile as parseImportFileRequest,
} from './services/questionGroups'

type EntryForm = {
  sourceType: SourceType
  year: string
  region: string
  paperName: string
  section: string
  passageTitle: string
  materialText: string
  summary: string
  theme: string
  discourseType: string
  groupTitle: string
  groupType: GroupType
  instruction: string
  difficulty: Difficulty
  defaultScore: string
  questions: EntryQuestionForm[]
  tags: string
}

type EntryQuestionForm = {
  questionNo: string
  questionType: string
  stem: string
  optionsText: string
  answer: string
  explanation: string
}

type StewardChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
}

type AiEnhancementTask = 'summary' | 'topicLabels' | 'answerParse'

type AiEnhancementTaskState = {
  status: 'idle' | 'running' | 'done' | 'skipped' | 'error'
  message: string
}

type DifficultyRatingDraft = {
  teacherDifficulty: string
  reason: string
  note: string
}

function createEntryQuestion(questionNo: string): EntryQuestionForm {
  return {
    questionNo,
    questionType: '待分类',
    stem: '',
    optionsText: '',
    answer: '',
    explanation: '',
  }
}

const defaultEntryForm: EntryForm = {
  sourceType: 'self_made',
  year: '2026',
  region: '校本',
  paperName: '课堂训练',
  section: '阅读理解 B',
  passageTitle: '',
  materialText: '',
  summary: '',
  theme: '',
  discourseType: '',
  groupTitle: '',
  groupType: 'reading',
  instruction: 'Read the passage and answer the questions.',
  difficulty: 'medium',
  defaultScore: '2.5',
  questions: [createEntryQuestion('1')],
  tags: '',
}

function parseOptionText(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const match = line.match(/^([A-Ha-h])[\s.．、)）:：-]+(.+)$/)

      return {
        label: match ? match[1].toUpperCase() : String.fromCharCode(65 + index),
        content: match ? match[2].trim() : line,
      }
    })
    .filter((option) => option.content)
}

function formatOptionsText(question: QuestionGroupDetail['questions'][number]) {
  return question.options.map((option) => `${option.label}. ${option.content}`).join('\n')
}

function createEntryFormFromDetail(detail: QuestionGroupDetail): EntryForm {
  return {
    sourceType: detail.sourceType,
    year: String(detail.year),
    region: detail.region,
    paperName: detail.paperName,
    section: detail.section,
    passageTitle: detail.passage.title,
    materialText: detail.passage.materialText,
    summary: detail.summary,
    theme: detail.passage.theme,
    discourseType: detail.passage.discourseType,
    groupTitle: detail.title,
    groupType: detail.groupType,
    instruction: detail.instruction,
    difficulty: detail.difficulty,
    defaultScore: String(detail.defaultScore),
    questions:
      detail.questions.length > 0
        ? detail.questions.map((question) => ({
            questionNo: question.questionNo,
            questionType: question.questionType,
            stem: question.stem,
            optionsText: formatOptionsText(question),
            answer: question.answer,
            explanation: question.explanation,
          }))
        : [createEntryQuestion('1')],
    tags: detail.tags.join(', '),
  }
}

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
const aiEnhancementTasks: Array<{ key: AiEnhancementTask; label: string; description: string }> = [
  { key: 'summary', label: '简介生成', description: '用 DeepSeek Flash 非思考生成并写回题组摘要' },
  { key: 'topicLabels', label: '主题划分', description: '用 DeepSeek Flash 非思考推荐话题标签' },
  { key: 'answerParse', label: 'AI答案解析', description: '生成解析并保存到本地题库' },
]
const aiEnhancementTaskLabel: Record<AiEnhancementTask, string> = {
  summary: '简介生成',
  topicLabels: '主题划分',
  answerParse: 'AI答案解析',
}
const aiEnhancementTaskStatusLabel: Record<AiEnhancementTaskState['status'], string> = {
  idle: '待处理',
  running: '处理中',
  done: '已完成',
  skipped: '已跳过',
  error: '失败',
}
const surfaceQuestionTypeLabel: Record<string, string> = {
  single_detail_normal: '单细节普通题',
  multi_detail_learn_from: '多细节 / learn from',
  why_did: '原因题',
  word_meaning: '猜词 / 指代',
  paragraph_main_idea: '段落主旨',
  passage_main_idea: '文章主旨',
  writing_technique: '写作手法',
  paragraph_function: '段落功能',
  author_purpose: '写作目的',
  attitude_tone: '态度语气',
  inference_general: '普通推断',
  example_function: '例子功能',
  adjective_summary: '形容词压缩',
  abstract_phrase_summary: '抽象短语压缩',
}
const answeringMoveLabel: Record<string, string> = {
  direct_locating: '直接定位',
  option_backtracking: '选项回文验证',
  context_guessing: '上下文猜测',
  coverage_test: '覆盖度检验',
  function_to_argument: '功能服务论点',
  rhetorical_method_identification: '识别写作手法',
  minimal_inference: '最小推断',
  description_to_adjective: '描述压缩成形容词',
  multi_point_matching: '多点细节整合',
  elimination: '逐项排除',
}
const surfaceScopeLabel: Record<string, string> = {
  word_or_phrase: '词 / 短语',
  sentence: '单句',
  paragraph: '段落',
  passage: '全文',
  example: '例子 / 引用',
}
const difficultyProfileLevelLabel: Record<string, string> = {
  low: '低',
  medium: '中',
  high: '高',
  very_high: '极高',
}
const teacherDifficultyLabel: Record<number, string> = {
  1: '很低',
  2: '偏低',
  3: '中等',
  4: '偏高',
  5: '很高',
}
const difficultyOverrideReasonLabel: Record<string, string> = {
  vocab: '高难词汇',
  syntax: '长难句',
  location: '定位难',
  abstractness: '抽象度',
  distractor: '干扰项',
  topic: '话题负荷',
  other: '其他',
}
const infoSpanLabel: Record<string, string> = {
  single_point: '单点',
  multi_point: '多点',
  cross_paragraph: '跨段',
}
const mainBlockerLabel: Record<string, string> = {
  vocab: '词汇',
  syntax: '语法',
  distractor: '干扰项',
  abstraction: '抽象',
  info_span: '信息跨度',
  topic: '话题',
}
const blockerRoleLabel: Record<string, string> = {
  semantic_bridge: '同义桥梁',
  distractor_trap: '干扰陷阱',
  answer_key: '答案核心词',
  context_clue: '可猜线索',
}
const blockerPositionLabel: Record<string, string> = {
  answer_path: '答案路径',
  correct_option: '正确选项',
  distractor: '干扰项',
  question_stem: '题干',
  passage_background: '背景信息',
}
const readingDistractorTypeLabel: Record<string, string> = {
  '0': '正确项',
  '1': '细节词误导',
  '2': '无中生有',
  '3': '常识干扰',
}
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

function labelOf(labels: Record<string, string>, value?: string) {
  if (!value) return '待判'
  return labels[value] || value
}

function mapAiDifficultyScoreToFive(score?: number | null) {
  if (typeof score !== 'number' || !Number.isInteger(score) || score < 1 || score > 10) return null
  if (score <= 2) return 1
  if (score <= 3) return 2
  if (score <= 6) return 3
  if (score <= 8) return 4
  return 5
}

function getDisplayDifficulty(question: QuestionGroupDetail['questions'][number], aiDifficultyScore = question.aiDifficultyScore) {
  return question.teacherDifficulty ?? mapAiDifficultyScoreToFive(aiDifficultyScore)
}

function getDifficultyDraftForQuestion(question: QuestionGroupDetail['questions'][number]): DifficultyRatingDraft {
  return {
    teacherDifficulty: question.teacherDifficulty ? String(question.teacherDifficulty) : '',
    reason: question.difficultyOverrideReason || '',
    note: question.difficultyOverrideNote || '',
  }
}

function requiresDifficultyReason(
  question: QuestionGroupDetail['questions'][number],
  draft: DifficultyRatingDraft,
  aiDifficultyScore = question.aiDifficultyScore,
) {
  const teacherDifficulty = Number(draft.teacherDifficulty)
  if (!Number.isInteger(teacherDifficulty)) return false
  const aiBucket = mapAiDifficultyScoreToFive(aiDifficultyScore)
  return aiBucket !== null && aiBucket !== teacherDifficulty
}

function applyReadingAiDifficultyScores(
  questions: QuestionGroupDetail['questions'],
  parseResult: ReadingParseQuestionGroupResult,
) {
  const parseByNo = new Map(
    (parseResult.questions || []).map((item) => [String(item.questionNo || '').trim(), item]),
  )

  return questions.map((question, index) => {
    const parseItem = parseByNo.get(String(question.questionNo).trim()) || parseResult.questions?.[index]
    const score = Number(parseItem?.difficultyProfile?.finalScore || 0)
    return Number.isInteger(score) && score >= 1 && score <= 10
      ? { ...question, aiDifficultyScore: score }
      : question
  })
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

function compactPreview(text: string, maxLength = 88) {
  const preview = text.replace(/\s+/g, ' ').trim()
  if (!preview) return '待补题干'
  return preview.length > maxLength ? `${preview.slice(0, maxLength)}...` : preview
}

function compactGroupMeta(groupType: GroupType, questionCount: number) {
  return `${groupTypeLabel[groupType]} · ${questionCount} 题`
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

function createEmptyAiEnhancementTaskState(): AiEnhancementTaskState {
  return {
    status: 'idle',
    message: '',
  }
}

function createAiEnhancementStatus(groups: QuestionGroupCard[]) {
  return Object.fromEntries(
    groups.map((group) => [
      group.id,
      Object.fromEntries(aiEnhancementTasks.map((task) => [task.key, createEmptyAiEnhancementTaskState()])),
    ]),
  ) as Record<string, Record<AiEnhancementTask, AiEnhancementTaskState>>
}

function mergeQuestionGroupCardsById(groups: QuestionGroupCard[]) {
  const seen = new Set<string>()
  const merged: QuestionGroupCard[] = []

  groups.forEach((group) => {
    if (seen.has(group.id)) return
    seen.add(group.id)
    merged.push(group)
  })

  return merged
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

function formatSavedAt(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', { hour12: false })
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

function getParseSavedAt(
  groupType: GroupType,
  readingParseResult: ReadingParseQuestionGroupResult | null,
  clozeParseResult: ClozeParseQuestionGroupResult | null,
  sevenChoicesParseResult: SevenChoicesParseQuestionGroupResult | null,
  grammarParseResult: GrammarParseQuestionGroupResult | null,
) {
  if (groupType === 'reading') return readingParseResult?.savedAt
  if (groupType === 'cloze') return clozeParseResult?.savedAt
  if (groupType === 'seven_choices') return sevenChoicesParseResult?.savedAt
  if (groupType === 'grammar_cloze') return grammarParseResult?.savedAt
  return null
}

function App() {
  const [questionGroups, setQuestionGroups] = useState<QuestionGroupCard[]>(sampleQuestionGroups)
  const [dataStatus, setDataStatus] = useState<'loading' | 'sqlite' | 'sample'>('loading')
  const [query, setQuery] = useState('')
  const [semanticSearchEnabled, setSemanticSearchEnabled] = useState(false)
  const [semanticSearchResult, setSemanticSearchResult] = useState<SemanticSearchResult | null>(null)
  const [questionBankStewardStatus, setQuestionBankStewardStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle')
  const [questionBankStewardError, setQuestionBankStewardError] = useState('')
  const [questionBankStewardResult, setQuestionBankStewardResult] = useState<QuestionBankStewardResult | null>(null)
  const [questionBankStewardPendingQuery, setQuestionBankStewardPendingQuery] = useState('')
  const [stewardChatInput, setStewardChatInput] = useState('')
  const [stewardChatMessages, setStewardChatMessages] = useState<StewardChatMessage[]>([
    {
      id: 'steward-welcome',
      role: 'assistant',
      content: '你可以直接说：找和城市交通那题做法像的，或者找同样要抽象概括的题。',
    },
  ])
  const [difficulty, setDifficulty] = useState<'all' | Difficulty>('all')
  const [sourceType, setSourceType] = useState<'all' | SourceType>('all')
  const [groupType, setGroupType] = useState<'all' | GroupType>('all')
  const [selectedTag, setSelectedTag] = useState('全部')
  const [versionType, setVersionType] = useState<VersionType>('student')
  const [paperExportStyle, setPaperExportStyle] = useState<'exam' | 'handout'>('exam')
  const [homeMode, setHomeMode] = useState<'ai' | 'classic'>(() =>
    localStorage.getItem('home-mode') === 'classic' ? 'classic' : 'ai',
  )
  const [aiBasketDrawerOpen, setAiBasketDrawerOpen] = useState(false)
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
    selectedPaperBlockId,
    openInsertionIndex,
  } = paperDraft
  const [questionNumberStart, setQuestionNumberStart] = useState(1)
  const [isEntryOpen, setEntryOpen] = useState(false)
  const [isImportOpen, setImportOpen] = useState(false)
  const [entryMode, setEntryMode] = useState<'create' | 'edit'>('create')
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [entryForm, setEntryForm] = useState<EntryForm>(defaultEntryForm)
  const [entryStatus, setEntryStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [entryError, setEntryError] = useState('')
  const [viewMode, setViewMode] = useState<'list' | 'detail' | 'preview' | 'workflow'>('list')
  const [selectedDetail, setSelectedDetail] = useState<QuestionGroupDetail | null>(null)
  const [detailStatus, setDetailStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle')
  const [detailError, setDetailError] = useState('')
  const [difficultyDrafts, setDifficultyDrafts] = useState<Record<string, DifficultyRatingDraft>>({})
  const [difficultySaveStatus, setDifficultySaveStatus] = useState<Record<string, 'idle' | 'saving' | 'saved' | 'error'>>({})
  const [difficultySaveErrors, setDifficultySaveErrors] = useState<Record<string, string>>({})
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
  const [topicLabelStatus, setTopicLabelStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle')
  const [topicLabelError, setTopicLabelError] = useState('')
  const [topicLabelTrace, setTopicLabelTrace] = useState<GenerateTopicLabelsResult | null>(null)
  const [topicLabelRecommendations, setTopicLabelRecommendations] = useState<TopicLabel[]>([])
  const [selectedTopicLabelValues, setSelectedTopicLabelValues] = useState<string[]>([])
  const [topicLabelBindStatus, setTopicLabelBindStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [topicLabelBindError, setTopicLabelBindError] = useState('')
  const [aiApiKey, setAiApiKey] = useState(() => localStorage.getItem('ai-api-key') || '')
  const [aiModel, setAiModel] = useState(() => normalizeAiModel(localStorage.getItem('ai-model') || DEFAULT_AI_MODEL))
  const [aiThinkingMode, setAiThinkingMode] = useState(() => localStorage.getItem('ai-thinking-mode') === 'on')
  const conciergeDesk = useConciergeDesk({
    questionGroups,
    apiKey: aiApiKey,
  })
  const aiRunIdRef = useRef(0)
  const [previewDetails, setPreviewDetails] = useState<Record<string, QuestionGroupDetail>>({})
  const [previewStatus, setPreviewStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle')
  const [previewError, setPreviewError] = useState('')
  const [paperTitle, setPaperTitle] = useState('高考阅读 B 主题训练')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [saveError, setSaveError] = useState('')
  const [lastSavedPaper, setLastSavedPaper] = useState<PaperSetSummary | null>(null)
  const [savedPapers, setSavedPapers] = useState<PaperSetSummary[]>([])
  const [savedPapersStatus, setSavedPapersStatus] = useState<'loading' | 'loaded' | 'error'>('loading')
  const [savedPapersError, setSavedPapersError] = useState('')
  const [paperWorkflows, setPaperWorkflows] = useState<PaperWorkflow[]>([])
  const [paperWorkflowsStatus, setPaperWorkflowsStatus] = useState<'loading' | 'loaded' | 'error'>('loading')
  const [paperWorkflowsError, setPaperWorkflowsError] = useState('')
  const [loadPaperStatus, setLoadPaperStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle')
  const [loadPaperError, setLoadPaperError] = useState('')
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
  const [aiEnhancementTargets, setAiEnhancementTargets] = useState<QuestionGroupCard[]>([])
  const [aiEnhancementSelection, setAiEnhancementSelection] = useState<Record<AiEnhancementTask, boolean>>({
    summary: true,
    topicLabels: true,
    answerParse: true,
  })
  const [aiEnhancementStatus, setAiEnhancementStatus] = useState<
    Record<string, Record<AiEnhancementTask, AiEnhancementTaskState>>
  >({})
  const [aiEnhancementRunStatus, setAiEnhancementRunStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [aiEnhancementError, setAiEnhancementError] = useState('')
  const [aiEnhancementTopicCandidates, setAiEnhancementTopicCandidates] = useState<Record<string, TopicLabel[]>>({})
  const [aiEnhancementSelectedTopicValues, setAiEnhancementSelectedTopicValues] = useState<Record<string, string[]>>({})
  const [aiEnhancementTopicBindStatus, setAiEnhancementTopicBindStatus] = useState<
    Record<string, 'idle' | 'saving' | 'saved' | 'error'>
  >({})
  const [aiEnhancementTopicBindError, setAiEnhancementTopicBindError] = useState<Record<string, string>>({})
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
  // the dependent setters are reachable. Behavior preserved per legacy:
  //   add / remove / clear : saveStatus idle + previewStatus idle + reset exports
  //   reorder / score      : saveStatus idle + reset exports
  //   meta                 : saveStatus idle + reset exports (legacy did the same)
  useEffect(() => {
    draftEditedHandlerRef.current = (reason) => {
      setSaveStatus('idle')
      paperExports.resetExportStatuses()
      if (reason === 'add' || reason === 'remove' || reason === 'clear') {
        setPreviewStatus('idle')
      }
    }
  }, [paperExports])

  useEffect(() => {
    let ignore = false

    fetchQuestionGroups()
      .then((groups) => {
        if (ignore) return
        setQuestionGroups(groups)
        setDataStatus('sqlite')
      })
      .catch(() => {
        if (ignore) return
        setQuestionGroups(sampleQuestionGroups)
        setDataStatus('sample')
      })

    return () => {
      ignore = true
    }
  }, [])

  useEffect(() => {
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
  }, [])

  useEffect(() => {
    let ignore = false

    fetchPaperSets()
      .then((paperSets) => {
        if (ignore) return
        setSavedPapers(paperSets)
        setSavedPapersStatus('loaded')
      })
      .catch((error) => {
        if (ignore) return
        setSavedPapersStatus('error')
        setSavedPapersError(error instanceof Error ? error.message : String(error))
      })

    return () => {
      ignore = true
    }
  }, [])

  useEffect(() => {
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
  }, [])

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

  useEffect(() => {
    setAiEnhancementStatus((currentStatus) => {
      if (aiEnhancementTargets.length === 0) return {}
      const nextStatus = createAiEnhancementStatus(aiEnhancementTargets)
      aiEnhancementTargets.forEach((target) => {
        if (currentStatus[target.id]) {
          nextStatus[target.id] = currentStatus[target.id]
        }
      })
      return nextStatus
    })
  }, [aiEnhancementTargets])

  useEffect(() => {
    if (!selectedDetail) {
      setDifficultyDrafts({})
      setDifficultySaveStatus({})
      setDifficultySaveErrors({})
      return
    }

    setDifficultyDrafts(
      Object.fromEntries(
        selectedDetail.questions.map((question) => [question.id, getDifficultyDraftForQuestion(question)]),
      ),
    )
    setDifficultySaveStatus({})
    setDifficultySaveErrors({})
  }, [selectedDetail?.id])

  const allTags = useMemo(
    () =>
      Array.from(
        new Set(
          questionGroups.flatMap((group) => [
            ...group.tags,
            ...(group.topicLabels || []).map((topicLabel) => topicLabel.label),
          ]),
        ),
      ).sort((a, b) => a.localeCompare(b, 'zh-CN')),
    [questionGroups],
  )

  const filteredGroups = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const semanticGroups =
      semanticSearchEnabled && semanticSearchResult
        ? semanticSearchResult.matches
            .map((match) => questionGroups.find((group) => group.id === match.questionGroupId) || match.questionGroup)
            .filter((group): group is QuestionGroupCard => Boolean(group))
        : questionGroups
    const useSemanticResult = semanticSearchEnabled && Boolean(semanticSearchResult)

    return semanticGroups.filter((group) => {
      const searchable = [
        group.title,
        group.source,
        group.region,
        group.paperName,
        group.section,
        group.passageTitle,
        group.summary,
        group.hit,
        group.answerPreview,
        ...group.tags,
        ...(group.topicLabels || []).map((topicLabel) => topicLabel.label),
      ]
        .join(' ')
        .toLowerCase()

      return (
        (useSemanticResult || !normalizedQuery || searchable.includes(normalizedQuery)) &&
        (difficulty === 'all' || group.difficulty === difficulty) &&
        (sourceType === 'all' || group.sourceType === sourceType) &&
        (groupType === 'all' || group.groupType === groupType) &&
        (selectedTag === '全部' ||
          group.tags.includes(selectedTag) ||
          (group.topicLabels || []).some((topicLabel) => topicLabel.label === selectedTag))
      )
    })
  }, [difficulty, groupType, query, questionGroups, selectedTag, semanticSearchEnabled, semanticSearchResult, sourceType])
  const semanticMatchByGroupId = useMemo(() => {
    const map = new Map<string, SemanticSearchResult['matches'][number]>()
    semanticSearchResult?.matches.forEach((match) => {
      map.set(match.questionGroupId, match)
    })
    return map
  }, [semanticSearchResult])
  const questionGroupById = useMemo(() => new Map(questionGroups.map((group) => [group.id, group])), [questionGroups])
  const readingParseByQuestionNo = useMemo(() => {
    const map = new Map<string, ReadingParseQuestionGroupResult['questions'][number]>()

    readingParseResult?.questions.forEach((item) => {
      map.set(String(item.questionNo).trim(), item)
    })

    return map
  }, [readingParseResult])
  const clozeParseByQuestionNo = useMemo(() => {
    const byNo = new Map<string, ClozeParseQuestionGroupResult['questions'][number]>()
    clozeParseResult?.questions.forEach((item) => {
      byNo.set(String(item.questionNo).trim(), item)
    })
    return byNo
  }, [clozeParseResult])
  const sevenChoicesParseByQuestionNo = useMemo(() => {
    const byNo = new Map<string, SevenChoicesParseQuestionGroupResult['questions'][number]>()
    sevenChoicesParseResult?.questions.forEach((item) => {
      byNo.set(String(item.questionNo).trim(), item)
    })
    return byNo
  }, [sevenChoicesParseResult])
  const grammarParseByQuestionNo = useMemo(() => {
    const map = new Map<string, GrammarParseQuestionGroupResult['questions'][number]>()

    grammarParseResult?.questions.forEach((item) => {
      map.set(String(item.questionNo).trim(), item)
    })

    return map
  }, [grammarParseResult])
  const verifyByQuestionNo = useMemo(() => {
    const map = new Map<string, VerifyQuestionGroupResult['results'][number]>()

    verifyResult?.results.forEach((result) => {
      map.set(String(result.questionNo).trim(), result)
    })

    return map
  }, [verifyResult])
  const answerCompareStats = useMemo(() => {
    if (!verifyResult?.results.length) return null
    const comparedResults = verifyResult.results.filter((result) => result.verdict !== 'skipped')
    return {
      correct: comparedResults.filter((result) => result.verdict === 'correct').length,
      incorrect: comparedResults.filter((result) => result.verdict !== 'correct').length,
      total: comparedResults.length,
    }
  }, [verifyResult])

  const totalQuestions = basket.reduce((sum, item) => sum + item.questionCount, 0)
  const totalScore = basket.reduce((sum, item) => sum + item.score * item.questionCount, 0)

  function handleQueryChange(value: string) {
    setQuery(value)
    setSemanticSearchEnabled(false)
    setSemanticSearchResult(null)
  }

  async function handleQuestionBankSteward(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault()
    const normalizedMessage = stewardChatInput.trim()
    if (!normalizedMessage) {
      setQuestionBankStewardStatus('error')
      setQuestionBankStewardError('先输入你想找什么题。')
      return
    }
    const stewardMessage =
      questionBankStewardPendingQuery && normalizedMessage !== questionBankStewardPendingQuery
        ? `${questionBankStewardPendingQuery}；补充说明：${normalizedMessage}`
        : normalizedMessage
    const userMessage: StewardChatMessage = {
      id: `steward-user-${Date.now()}`,
      role: 'user',
      content: normalizedMessage,
    }

    localStorage.setItem('ai-api-key', aiApiKey.trim())
    localStorage.setItem('ai-model', aiModel)
    setQuestionBankStewardStatus('loading')
    setQuestionBankStewardError('')
    setQuestionBankStewardResult(null)
    setSemanticSearchEnabled(false)
    setSemanticSearchResult(null)
    setStewardChatInput('')
    setStewardChatMessages((messages) => [...messages, userMessage])

    try {
      const result = await askQuestionBankStewardRequest(stewardMessage, aiApiKey.trim())
      setQuestionBankStewardResult(result)
      setQuestionBankStewardStatus('loaded')
      setStewardChatMessages((messages) => [
        ...messages,
        {
          id: `steward-assistant-${Date.now()}`,
          role: 'assistant',
          content: result.assistantMessage,
        },
      ])
      if (!result.needsClarification && result.search) {
        setQuestionBankStewardPendingQuery('')
        setSemanticSearchEnabled(true)
        setSemanticSearchResult(result.search)
      } else {
        setQuestionBankStewardPendingQuery(questionBankStewardPendingQuery || normalizedMessage)
        setSemanticSearchEnabled(false)
        setSemanticSearchResult(null)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      setQuestionBankStewardStatus('error')
      setQuestionBankStewardError(errorMessage)
      setStewardChatMessages((messages) => [
        ...messages,
        {
          id: `steward-error-${Date.now()}`,
          role: 'assistant',
          content: `出错了：${errorMessage}`,
        },
      ])
    }
  }

  function addGroupsToBasket(groups: QuestionGroupCard[]) {
    paperDraft.addGroups(groups)
  }

  function addToBasket(group: QuestionGroupCard) {
    addGroupsToBasket([group])
  }

  function addFilteredGroupsToBasket() {
    addGroupsToBasket(filteredGroups)
  }

  function addWorkflowGroupsToBasket(workflow: PaperWorkflow) {
    const groups = sortedWorkflowBankGroups(workflow)
      .map((group) => questionGroupById.get(group.id))
      .filter((group): group is QuestionGroupCard => Boolean(group))
    addGroupsToBasket(groups)
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
    setSaveError('')
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
      setPaperTitle(title)
      setVersionType('student')
      setLastSavedPaper(paperSet)
      setSavedPapers((paperSets) => [paperSet, ...paperSets.filter((item) => item.id !== paperSet.id)])
      setSavedPapersStatus('loaded')
      setSaveStatus('saved')
      setPaperBuildResult(paperSet)
      setPaperBuildStatus('saved')
      await refreshPaperWorkflows()

      setViewMode('preview')
      await loadPreviewForBasketItems(nextBasket)
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
    setTopicLabelStatus('idle')
    setTopicLabelError('')
    setTopicLabelTrace(null)
    setTopicLabelRecommendations([])
    setSelectedTopicLabelValues([])
    setTopicLabelBindStatus('idle')
    setTopicLabelBindError('')

    try {
      const detail = await fetchQuestionGroupDetail(id)
      setSelectedDetail(detail)
      if (detail.topicLabels?.length) {
        setTopicLabelStatus('loaded')
      }
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

  async function loadPreviewForBasketItems(items: BasketItem[]) {
    setPreviewError('')

    if (items.length === 0) {
      setPreviewStatus('idle')
      return
    }

    const missingItems = items.filter((item) => !previewDetails[item.id])

    if (missingItems.length === 0) {
      setPreviewStatus('loaded')
      return
    }

    setPreviewStatus('loading')

    try {
      const details = await Promise.all(missingItems.map((item) => fetchQuestionGroupDetail(item.id)))
      setPreviewDetails((current) => {
        const next = { ...current }
        details.forEach((detail) => {
          next[detail.id] = detail
        })
        return next
      })
      setPreviewStatus('loaded')
    } catch (error) {
      setPreviewStatus('error')
      setPreviewError(error instanceof Error ? error.message : String(error))
    }
  }

  function updateDifficultyDraft(questionId: string, patch: Partial<DifficultyRatingDraft>) {
    setDifficultyDrafts((drafts) => {
      const previous =
        drafts[questionId] ||
        ({
        teacherDifficulty: '',
        reason: '',
        note: '',
        } satisfies DifficultyRatingDraft)
      return {
        ...drafts,
        [questionId]: {
          ...previous,
          ...patch,
        },
      }
    })
    setDifficultySaveStatus((status) => ({ ...status, [questionId]: 'idle' }))
    setDifficultySaveErrors((errors) => ({ ...errors, [questionId]: '' }))
  }

  async function handleSaveQuestionDifficulty(
    question: QuestionGroupDetail['questions'][number],
    aiDifficultyScore = question.aiDifficultyScore,
  ) {
    const draft = difficultyDrafts[question.id] || getDifficultyDraftForQuestion(question)
    const teacherDifficulty = draft.teacherDifficulty ? Number(draft.teacherDifficulty) : null
    setDifficultySaveStatus((status) => ({ ...status, [question.id]: 'saving' }))
    setDifficultySaveErrors((errors) => ({ ...errors, [question.id]: '' }))

    try {
      const result = await saveQuestionDifficultyRatingRequest(question.id, {
        teacherDifficulty,
        aiDifficultyScore,
        difficultyOverrideReason: draft.reason,
        difficultyOverrideNote: draft.note,
      })
      setSelectedDetail((detail) =>
        detail
          ? {
              ...detail,
              questions: detail.questions.map((item) => (item.id === question.id ? result.question : item)),
            }
          : detail,
      )
      setDifficultySaveStatus((status) => ({ ...status, [question.id]: 'saved' }))
    } catch (error) {
      setDifficultySaveStatus((status) => ({ ...status, [question.id]: 'error' }))
      setDifficultySaveErrors((errors) => ({
        ...errors,
        [question.id]: error instanceof Error ? error.message : String(error),
      }))
    }
  }

  async function openPreview() {
    setViewMode('preview')
    await loadPreviewForBasketItems(basket)
  }

  function backToList() {
    setViewMode('list')
  }

  function removeFromBasket(id: string) {
    paperDraft.removeGroup(id)
  }

  function clearBasket() {
    setLastSavedPaper(null)
    paperDraft.clear()
  }

  function removePaperBlock(blockId: string) {
    paperDraft.removeBlock(blockId)
  }

  function movePaperBlock(blockId: string, direction: -1 | 1) {
    paperDraft.moveBlock(blockId, direction)
  }

  function updatePaperBlockTitle(blockId: string, title: string) {
    paperDraft.updateSectionHeaderTitle(blockId, title)
  }

  function insertSectionHeaderBefore(blockId: string) {
    paperDraft.insertSectionHeaderBefore(blockId)
  }

  function insertPageBreakAfter(blockId: string) {
    paperDraft.insertPageBreakAfter(blockId)
  }

  function insertBlockAt(index: number, type: 'section_header' | 'page_break') {
    paperDraft.insertBlockAt(index, type)
  }

  function moveBasketItem(id: string, direction: -1 | 1) {
    paperDraft.moveGroup(id, direction)
  }

  function updateScore(id: string, score: number) {
    paperDraft.updateGroupScore(id, score)
  }

  function updateBasketItem<K extends 'sectionTitle' | 'note'>(id: string, field: K, value: BasketItem[K]) {
    paperDraft.updateGroupMeta(id, { [field]: value })
  }

  function openImportPanel() {
    setImportStatus('idle')
    setImportError('')
    setImportOpen(true)
  }

  function openEditEntry(detail: QuestionGroupDetail) {
    setEntryMode('edit')
    setEditingGroupId(detail.id)
    setEntryForm(createEntryFormFromDetail(detail))
    setEntryStatus('idle')
    setEntryError('')
    setEntryOpen(true)
  }

  function updateEntryField<K extends keyof EntryForm>(field: K, value: EntryForm[K]) {
    setEntryForm((form) => ({ ...form, [field]: value }))
  }

  function updateEntryQuestion<K extends keyof EntryQuestionForm>(index: number, field: K, value: EntryQuestionForm[K]) {
    setEntryForm((form) => ({
      ...form,
      questions: form.questions.map((question, questionIndex) =>
        questionIndex === index ? { ...question, [field]: value } : question,
      ),
    }))
  }

  function addEntryQuestion() {
    setEntryForm((form) => {
      const lastQuestion = form.questions[form.questions.length - 1]
      const nextQuestion = createEntryQuestion(String(form.questions.length + 1))

      return {
        ...form,
        questions: [
          ...form.questions,
          {
            ...nextQuestion,
            questionType: lastQuestion?.questionType || nextQuestion.questionType,
          },
        ],
      }
    })
  }

  function removeEntryQuestion(index: number) {
    setEntryForm((form) => {
      if (form.questions.length <= 1) return form
      return {
        ...form,
        questions: form.questions.filter((_, questionIndex) => questionIndex !== index),
      }
    })
  }

  async function handleEntrySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setEntryStatus('saving')
    setEntryError('')

    const questions = entryForm.questions
      .map((question) => ({
        questionNo: question.questionNo.trim(),
        questionType: question.questionType.trim() || '待分类',
        stem: question.stem.trim(),
        answer: question.answer.trim(),
        explanation: question.explanation.trim(),
        options: parseOptionText(question.optionsText),
      }))
      .filter((question) => question.stem)
    const firstQuestion = questions[0]

    if (!firstQuestion) {
      setEntryStatus('error')
      setEntryError('至少需要录入一道小题。')
      return
    }

    const input: CreateQuestionGroupInput = {
      ...entryForm,
      defaultScore: Number(entryForm.defaultScore),
      questionCount: questions.length,
      questionType: firstQuestion.questionType,
      questionStem: firstQuestion.stem,
      answer: firstQuestion.answer,
      explanation: firstQuestion.explanation,
      questions,
      tags: entryForm.tags
        .split(/[,，、\n]/)
        .map((tag) => tag.trim())
        .filter(Boolean),
      year: Number(entryForm.year),
    }

    try {
      const saved =
        entryMode === 'edit' && editingGroupId
          ? await updateQuestionGroup(editingGroupId, input)
          : await createQuestionGroup(input)
      setQuestionGroups((groups) =>
        entryMode === 'edit'
          ? groups.map((group) => (group.id === saved.id ? saved : group))
          : [saved, ...groups.filter((group) => group.id !== saved.id)],
      )
      paperDraft.patchBasketItemFromSavedGroup(saved)
      setPreviewDetails((current) => {
        const next = { ...current }
        delete next[saved.id]
        return next
      })
      if (entryMode === 'edit') {
        const detail = await fetchQuestionGroupDetail(saved.id)
        setSelectedDetail(detail)
        setDetailStatus('loaded')
      }
      setDataStatus('sqlite')
      setEntryStatus('saved')
      setEntryOpen(false)
      setEntryForm(defaultEntryForm)
      setEntryMode('create')
      setEditingGroupId(null)
      await refreshPaperWorkflows()
    } catch (error) {
      setEntryStatus('error')
      setEntryError(error instanceof Error ? error.message : String(error))
    }
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

  function showAiEnhancementPanel(groups: QuestionGroupCard[], mode: 'replace' | 'append' = 'replace') {
    const targets = groups.filter((group) => objectiveImportGroupTypes.has(group.groupType))
    if (targets.length === 0) return

    setAiEnhancementTargets((currentTargets) => {
      return mergeQuestionGroupCardsById(mode === 'append' ? [...targets, ...currentTargets] : targets)
    })
    setAiEnhancementRunStatus('idle')
    setAiEnhancementError('')
    if (mode === 'replace') {
      setAiEnhancementTopicCandidates({})
      setAiEnhancementSelectedTopicValues({})
      setAiEnhancementTopicBindStatus({})
      setAiEnhancementTopicBindError({})
    }
  }

  function updateAiEnhancementTaskStatus(
    questionGroupId: string,
    task: AiEnhancementTask,
    nextState: Partial<AiEnhancementTaskState>,
  ) {
    setAiEnhancementStatus((currentStatus) => {
      const emptyGroupStatus = Object.fromEntries(
        aiEnhancementTasks.map((item) => [item.key, createEmptyAiEnhancementTaskState()]),
      ) as Record<AiEnhancementTask, AiEnhancementTaskState>
      const currentGroupStatus = currentStatus[questionGroupId] || emptyGroupStatus
      return {
        ...currentStatus,
        [questionGroupId]: {
          ...currentGroupStatus,
          [task]: {
            ...createEmptyAiEnhancementTaskState(),
            ...currentGroupStatus[task],
            ...nextState,
          },
        },
      }
    })
  }

  function updateAiEnhancedQuestionGroup(card: QuestionGroupCard) {
    setQuestionGroups((groups) => groups.map((group) => (group.id === card.id ? { ...group, ...card } : group)))
    setAiEnhancementTargets((targets) => targets.map((target) => (target.id === card.id ? { ...target, ...card } : target)))
    setSelectedDetail((detail) =>
      detail && detail.id === card.id
        ? {
            ...detail,
            ...card,
            passage: {
              ...detail.passage,
              summary: card.summary,
            },
          }
        : detail,
    )
  }

  function toggleAiEnhancementTask(task: AiEnhancementTask) {
    setAiEnhancementSelection((selection) => ({ ...selection, [task]: !selection[task] }))
    setAiEnhancementRunStatus('idle')
    setAiEnhancementError('')
  }

  function toggleAiEnhancementTopicLabelSelection(questionGroupId: string, label: string) {
    setAiEnhancementTopicBindStatus((status) => ({ ...status, [questionGroupId]: 'idle' }))
    setAiEnhancementTopicBindError((errors) => ({ ...errors, [questionGroupId]: '' }))
    setAiEnhancementSelectedTopicValues((currentValues) => {
      const values = currentValues[questionGroupId] || []
      return {
        ...currentValues,
        [questionGroupId]: values.includes(label) ? values.filter((value) => value !== label) : [...values, label],
      }
    })
  }

  async function runAiEnhancementAnswerParse(detail: QuestionGroupDetail, key: string) {
    if (detail.groupType === 'reading') {
      const parseResult = await parseReadingQuestionGroupRequest(detail.id, key, aiModel, aiThinkingMode)
      const nextVerifyResult = await verifyQuestionGroupRequest(detail.id, key, aiModel, aiThinkingMode)
      const saved = await saveReadingParseResultRequest(detail.id, parseResult, nextVerifyResult)
      if (saved.questionGroup) {
        updateAiEnhancedQuestionGroup(saved.questionGroup)
      }
      if (selectedDetail?.id === detail.id) {
        setReadingParseResult(saved.readingParseResult)
        setReadingParseStatus('loaded')
        setReadingParseSaveStatus('saved')
        if (saved.verifyResult) {
          setVerifyResult(saved.verifyResult)
          setVerifyStatus('loaded')
        }
        setSelectedDetail((currentDetail) =>
          currentDetail && currentDetail.id === detail.id
            ? {
                ...currentDetail,
                ...(saved.questionGroup ?? {}),
                readingParseResult: saved.readingParseResult,
                readingVerifyResult: saved.verifyResult,
                passage: {
                  ...currentDetail.passage,
                  summary: saved.questionGroup?.summary ?? currentDetail.passage.summary,
                },
              }
            : currentDetail,
        )
      }
      return `${saved.readingParseResult.parsedCount} / ${saved.readingParseResult.questionCount} 题已保存`
    }

    if (detail.groupType === 'cloze') {
      const parseResult = await parseClozeGroupRequest(detail.id, key, aiModel, aiThinkingMode)
      const saved = await saveClozeParseResultRequest(detail.id, parseResult)
      if (selectedDetail?.id === detail.id) {
        setClozeParseResult(saved.clozeParseResult)
        setClozeParseStatus('loaded')
        setClozeParseSaveStatus('saved')
        setVerifyResult(buildClozeVerifyResult(detail, saved.clozeParseResult))
        setVerifyStatus('loaded')
        setSelectedDetail((currentDetail) =>
          currentDetail && currentDetail.id === detail.id
            ? {
                ...currentDetail,
                clozeParseResult: saved.clozeParseResult,
              }
            : currentDetail,
        )
      }
      return `${saved.clozeParseResult.parsedCount} / ${saved.clozeParseResult.questionCount} 题已保存`
    }

    if (detail.groupType === 'seven_choices') {
      const parseResult = await parseSevenChoicesGroupRequest(detail.id, key, aiModel, aiThinkingMode)
      const saved = await saveSevenChoicesParseResultRequest(detail.id, parseResult)
      if (selectedDetail?.id === detail.id) {
        setSevenChoicesParseResult(saved.sevenChoicesParseResult)
        setSevenChoicesParseStatus('loaded')
        setSevenChoicesParseSaveStatus('saved')
        setVerifyResult(buildSevenChoicesVerifyResult(detail, saved.sevenChoicesParseResult))
        setVerifyStatus('loaded')
        setSelectedDetail((currentDetail) =>
          currentDetail && currentDetail.id === detail.id
            ? {
                ...currentDetail,
                sevenChoicesParseResult: saved.sevenChoicesParseResult,
              }
            : currentDetail,
        )
      }
      return `${saved.sevenChoicesParseResult.parsedCount} / ${saved.sevenChoicesParseResult.questionCount} 题已保存`
    }

    if (detail.groupType === 'grammar_cloze') {
      const parseResult = await parseGrammarGroupRequest(detail.id, key, aiModel, aiThinkingMode)
      const saved = await saveGrammarParseResultRequest(detail.id, parseResult)
      if (selectedDetail?.id === detail.id) {
        setGrammarParseResult(saved.grammarParseResult)
        setGrammarParseStatus('loaded')
        setGrammarParseSaveStatus('saved')
        setVerifyResult(buildGrammarVerifyResult(detail, saved.grammarParseResult))
        setVerifyStatus('loaded')
        setSelectedDetail((currentDetail) =>
          currentDetail && currentDetail.id === detail.id
            ? {
                ...currentDetail,
                grammarParseResult: saved.grammarParseResult,
              }
            : currentDetail,
        )
      }
      return `${saved.grammarParseResult.parsedCount} / ${saved.grammarParseResult.questionCount} 空已保存`
    }

    return ''
  }

  async function handleRunAiEnhancement() {
    const selectedTasks = aiEnhancementTasks.filter((task) => aiEnhancementSelection[task.key]).map((task) => task.key)
    if (aiEnhancementTargets.length === 0) {
      setAiEnhancementRunStatus('error')
      setAiEnhancementError('请先把题组入库，再进行 AI增强。')
      return
    }
    if (selectedTasks.length === 0) {
      setAiEnhancementRunStatus('error')
      setAiEnhancementError('请至少选择一个 AI增强项目。')
      return
    }

    const key = aiApiKey.trim()
    localStorage.setItem('ai-api-key', key)
    localStorage.setItem('ai-model', aiModel)
    localStorage.setItem('ai-thinking-mode', aiThinkingMode ? 'on' : 'off')
    setAiEnhancementRunStatus('running')
    setAiEnhancementError('')

    for (const target of aiEnhancementTargets) {
      let detail: QuestionGroupDetail
      try {
        detail = await fetchQuestionGroupDetail(target.id)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        selectedTasks.forEach((task) =>
          updateAiEnhancementTaskStatus(target.id, task, {
            status: 'error',
            message,
          }),
        )
        continue
      }

      if (selectedTasks.includes('summary')) {
        updateAiEnhancementTaskStatus(target.id, 'summary', { status: 'running', message: '正在生成简介' })
        try {
          const result = await generateQuestionGroupSummaryRequest(detail.id, key, DEFAULT_AI_MODEL, false)
          updateAiEnhancedQuestionGroup(result.questionGroup)
          updateAiEnhancementTaskStatus(target.id, 'summary', {
            status: 'done',
            message: result.summary,
          })
        } catch (error) {
          updateAiEnhancementTaskStatus(target.id, 'summary', {
            status: 'error',
            message: error instanceof Error ? error.message : String(error),
          })
        }
      }

      if (selectedTasks.includes('topicLabels')) {
        updateAiEnhancementTaskStatus(target.id, 'topicLabels', { status: 'running', message: '正在划分主题' })
        try {
          const result = await generateTopicLabelsRequest(detail.id, key, DEFAULT_AI_MODEL, false)
          setAiEnhancementTopicCandidates((candidates) => ({
            ...candidates,
            [target.id]: result.topicLabels,
          }))
          setAiEnhancementSelectedTopicValues((values) => ({
            ...values,
            [target.id]: result.topicLabels.map((topicLabel) => topicLabel.label),
          }))
          setAiEnhancementTopicBindStatus((status) => ({ ...status, [target.id]: 'idle' }))
          setAiEnhancementTopicBindError((errors) => ({ ...errors, [target.id]: '' }))
          updateAiEnhancementTaskStatus(target.id, 'topicLabels', {
            status: 'done',
            message: `${result.topicLabels.length} 个候选，待选择绑定`,
          })
        } catch (error) {
          updateAiEnhancementTaskStatus(target.id, 'topicLabels', {
            status: 'error',
            message: error instanceof Error ? error.message : String(error),
          })
        }
      }

      if (selectedTasks.includes('answerParse')) {
        updateAiEnhancementTaskStatus(target.id, 'answerParse', { status: 'running', message: '正在生成并保存解析' })
        try {
          const message = await runAiEnhancementAnswerParse(detail, key)
          updateAiEnhancementTaskStatus(target.id, 'answerParse', {
            status: message ? 'done' : 'skipped',
            message: message || '该题型暂不支持 AI答案解析',
          })
        } catch (error) {
          updateAiEnhancementTaskStatus(target.id, 'answerParse', {
            status: 'error',
            message: error instanceof Error ? error.message : String(error),
          })
        }
      }
    }

    await refreshQuestionGroups()
    await refreshPaperWorkflows()
    setAiEnhancementRunStatus('done')
  }

  async function handleBindAiEnhancementTopicLabels(questionGroupId: string) {
    const candidates = aiEnhancementTopicCandidates[questionGroupId] || []
    const selectedValues = aiEnhancementSelectedTopicValues[questionGroupId] || []
    const selectedLabels = candidates.filter((topicLabel) => selectedValues.includes(topicLabel.label))

    if (selectedLabels.length === 0) {
      setAiEnhancementTopicBindStatus((status) => ({ ...status, [questionGroupId]: 'error' }))
      setAiEnhancementTopicBindError((errors) => ({ ...errors, [questionGroupId]: '请先选择至少一个话题标签。' }))
      return
    }

    setAiEnhancementTopicBindStatus((status) => ({ ...status, [questionGroupId]: 'saving' }))
    setAiEnhancementTopicBindError((errors) => ({ ...errors, [questionGroupId]: '' }))

    try {
      const result = await bindTopicLabelsRequest(questionGroupId, selectedLabels)
      setQuestionGroups((groups) =>
        groups.map((group) =>
          group.id === questionGroupId
            ? {
                ...group,
                topicLabels: result.topicLabels,
              }
            : group,
        ),
      )
      setAiEnhancementTargets((targets) =>
        targets.map((target) =>
          target.id === questionGroupId
            ? {
                ...target,
                topicLabels: result.topicLabels,
              }
            : target,
        ),
      )
      setSelectedDetail((detail) =>
        detail && detail.id === questionGroupId
          ? {
              ...detail,
              topicLabels: result.topicLabels,
            }
          : detail,
      )
      setAiEnhancementTopicBindStatus((status) => ({ ...status, [questionGroupId]: 'saved' }))
      updateAiEnhancementTaskStatus(questionGroupId, 'topicLabels', {
        status: 'done',
        message: `已绑定 ${result.topicLabels.length} 个标签，可用于检索`,
      })
    } catch (error) {
      setAiEnhancementTopicBindStatus((status) => ({ ...status, [questionGroupId]: 'error' }))
      setAiEnhancementTopicBindError((errors) => ({
        ...errors,
        [questionGroupId]: error instanceof Error ? error.message : String(error),
      }))
    }
  }

  async function refreshQuestionGroups() {
    try {
      const groups = await fetchQuestionGroups()
      setQuestionGroups(groups)
      setDataStatus('sqlite')
    } catch {
      setDataStatus((status) => (status === 'sqlite' ? status : 'sample'))
    }
  }

  async function handleDeleteQuestionGroup(id: string) {
    try {
      await deleteQuestionGroupRequest(id)
      setQuestionGroups((groups) => groups.filter((g) => g.id !== id))
      paperDraft.externalRemoveByGroupId(id)
      await refreshPaperWorkflows()
    } catch {
      // silently ignore
    }
  }

  async function handleVerifyQuestionGroup() {
    const runId = ++aiRunIdRef.current
    const key = aiApiKey.trim()
    if (!selectedDetail) {
      setVerifyStatus('error')
      setVerifyError('请先打开一个题组，再点击 AI 解析。')
      setVerifyResult(null)
      return
    }
    localStorage.setItem('ai-api-key', aiApiKey.trim())
    localStorage.setItem('ai-model', aiModel)
    localStorage.setItem('ai-thinking-mode', aiThinkingMode ? 'on' : 'off')

    if (selectedDetail.groupType === 'cloze') {
      setClozeParseStatus('loading')
      setClozeParseError('')
      setClozeParseResult(null)
      setClozeParseSaveStatus('idle')
      setClozeParseSaveError('')
      setVerifyStatus('loading')
      setVerifyError('')
      setVerifyResult(null)
      try {
        const result = await parseClozeGroupRequest(selectedDetail.id, key, aiModel, aiThinkingMode)
        if (aiRunIdRef.current !== runId) return
        setClozeParseResult(result)
        setClozeParseStatus('loaded')
        setVerifyResult(buildClozeVerifyResult(selectedDetail, result))
        setVerifyStatus('loaded')
      } catch (error) {
        if (aiRunIdRef.current !== runId) return
        setClozeParseStatus('error')
        setClozeParseError(error instanceof Error ? error.message : String(error))
        setVerifyStatus('error')
        setVerifyError(error instanceof Error ? error.message : String(error))
      }
      return
    }

    if (selectedDetail.groupType === 'seven_choices') {
      setSevenChoicesParseStatus('loading')
      setSevenChoicesParseError('')
      setSevenChoicesParseResult(null)
      setSevenChoicesParseSaveStatus('idle')
      setSevenChoicesParseSaveError('')
      setVerifyStatus('loading')
      setVerifyError('')
      setVerifyResult(null)
      try {
        const result = await parseSevenChoicesGroupRequest(selectedDetail.id, key, aiModel, aiThinkingMode)
        if (aiRunIdRef.current !== runId) return
        setSevenChoicesParseResult(result)
        setSevenChoicesParseStatus('loaded')
        setVerifyResult(buildSevenChoicesVerifyResult(selectedDetail, result))
        setVerifyStatus('loaded')
      } catch (error) {
        if (aiRunIdRef.current !== runId) return
        setSevenChoicesParseStatus('error')
        setSevenChoicesParseError(error instanceof Error ? error.message : String(error))
        setVerifyStatus('error')
        setVerifyError(error instanceof Error ? error.message : String(error))
      }
      return
    }

    if (selectedDetail.groupType === 'grammar_cloze') {
      setGrammarParseStatus('loading')
      setGrammarParseError('')
      setGrammarParseResult(null)
      setGrammarParseSaveStatus('idle')
      setGrammarParseSaveError('')
      setVerifyStatus('loading')
      setVerifyError('')
      setVerifyResult(null)
      try {
        const result = await parseGrammarGroupRequest(selectedDetail.id, key, aiModel, aiThinkingMode)
        if (aiRunIdRef.current !== runId) return
        setGrammarParseResult(result)
        setGrammarParseStatus('loaded')
        setVerifyResult(buildGrammarVerifyResult(selectedDetail, result))
        setVerifyStatus('loaded')
      } catch (error) {
        if (aiRunIdRef.current !== runId) return
        setGrammarParseStatus('error')
        setGrammarParseError(error instanceof Error ? error.message : String(error))
        setVerifyStatus('error')
        setVerifyError(error instanceof Error ? error.message : String(error))
      }
      return
    }

    setVerifyStatus('loading')
    setVerifyError('')
    setVerifyResult(null)

    try {
      const result = await verifyQuestionGroupRequest(selectedDetail.id, key, aiModel, aiThinkingMode)
      if (aiRunIdRef.current !== runId) return
      setVerifyResult(result)
      setVerifyStatus('loaded')
    } catch (error) {
      if (aiRunIdRef.current !== runId) return
      setVerifyStatus('error')
      setVerifyError(error instanceof Error ? error.message : String(error))
    }
  }

  async function handleAnalyzeReadingQuestionGroup() {
    const runId = ++aiRunIdRef.current
    const key = aiApiKey.trim()
    if (!selectedDetail) {
      setReadingParseStatus('error')
      setReadingParseError('请先打开一个阅读题组，再点击 AI解析。')
      setVerifyStatus('error')
      setVerifyError('请先打开一个阅读题组，再点击 AI解析。')
      setReadingParseResult(null)
      setVerifyResult(null)
      setReadingParseSaveStatus('idle')
      setReadingParseSaveError('')
      return
    }
    localStorage.setItem('ai-api-key', aiApiKey.trim())
    localStorage.setItem('ai-model', aiModel)
    localStorage.setItem('ai-thinking-mode', aiThinkingMode ? 'on' : 'off')
    setReadingParseStatus('loading')
    setReadingParseError('')
    setReadingParseResult(null)
    setReadingParseSaveStatus('idle')
    setReadingParseSaveError('')
    setVerifyStatus('loading')
    setVerifyError('')
    setVerifyResult(null)

    try {
      const parseResult = await parseReadingQuestionGroupRequest(selectedDetail.id, key, aiModel, aiThinkingMode)
      if (aiRunIdRef.current !== runId) return
      setReadingParseResult(parseResult)
      setReadingParseStatus('loaded')
    } catch (error) {
      if (aiRunIdRef.current !== runId) return
      const message = error instanceof Error ? error.message : String(error)
      setReadingParseStatus('error')
      setReadingParseError(message)
      setVerifyStatus('idle')
      setVerifyError('')
      return
    }

    try {
      const verifyResult = await verifyQuestionGroupRequest(selectedDetail.id, key, aiModel, aiThinkingMode)
      if (aiRunIdRef.current !== runId) return
      setVerifyResult(verifyResult)
      setVerifyStatus('loaded')
    } catch (error) {
      if (aiRunIdRef.current !== runId) return
      setVerifyStatus('error')
      setVerifyError(error instanceof Error ? error.message : String(error))
    }
  }

  async function handleSaveReadingParseResult() {
    if (!selectedDetail || !readingParseResult) return

    setReadingParseSaveStatus('saving')
    setReadingParseSaveError('')

    try {
      const saved = await saveReadingParseResultRequest(selectedDetail.id, readingParseResult, verifyResult)
      setReadingParseResult(saved.readingParseResult)
      if (saved.questionGroup) {
        updateAiEnhancedQuestionGroup(saved.questionGroup)
      }
      if (saved.verifyResult) {
        setVerifyResult(saved.verifyResult)
        setVerifyStatus('loaded')
      }
      setSelectedDetail((detail) =>
        detail && detail.id === selectedDetail.id
          ? {
              ...detail,
              ...(saved.questionGroup ?? {}),
              readingParseResult: saved.readingParseResult,
              readingVerifyResult: saved.verifyResult,
              questions: applyReadingAiDifficultyScores(detail.questions, saved.readingParseResult),
              passage: {
                ...detail.passage,
                summary: saved.questionGroup?.summary ?? detail.passage.summary,
              },
            }
          : detail,
      )
      setReadingParseSaveStatus('saved')
    } catch (error) {
      setReadingParseSaveStatus('error')
      setReadingParseSaveError(error instanceof Error ? error.message : String(error))
    }
  }

  async function handleSaveClozeParseResult() {
    if (!selectedDetail || !clozeParseResult) return

    setClozeParseSaveStatus('saving')
    setClozeParseSaveError('')

    try {
      const saved = await saveClozeParseResultRequest(selectedDetail.id, clozeParseResult)
      setClozeParseResult(saved.clozeParseResult)
      setVerifyResult(buildClozeVerifyResult(selectedDetail, saved.clozeParseResult))
      setVerifyStatus('loaded')
      setSelectedDetail((detail) =>
        detail && detail.id === selectedDetail.id
          ? {
              ...detail,
              clozeParseResult: saved.clozeParseResult,
            }
          : detail,
      )
      setClozeParseSaveStatus('saved')
    } catch (error) {
      setClozeParseSaveStatus('error')
      setClozeParseSaveError(error instanceof Error ? error.message : String(error))
    }
  }

  async function handleSaveSevenChoicesParseResult() {
    if (!selectedDetail || !sevenChoicesParseResult) return

    setSevenChoicesParseSaveStatus('saving')
    setSevenChoicesParseSaveError('')

    try {
      const saved = await saveSevenChoicesParseResultRequest(selectedDetail.id, sevenChoicesParseResult)
      setSevenChoicesParseResult(saved.sevenChoicesParseResult)
      setVerifyResult(buildSevenChoicesVerifyResult(selectedDetail, saved.sevenChoicesParseResult))
      setVerifyStatus('loaded')
      setSelectedDetail((detail) =>
        detail && detail.id === selectedDetail.id
          ? {
              ...detail,
              sevenChoicesParseResult: saved.sevenChoicesParseResult,
            }
          : detail,
      )
      setSevenChoicesParseSaveStatus('saved')
    } catch (error) {
      setSevenChoicesParseSaveStatus('error')
      setSevenChoicesParseSaveError(error instanceof Error ? error.message : String(error))
    }
  }

  async function handleSaveGrammarParseResult() {
    if (!selectedDetail || !grammarParseResult) return

    setGrammarParseSaveStatus('saving')
    setGrammarParseSaveError('')

    try {
      const saved = await saveGrammarParseResultRequest(selectedDetail.id, grammarParseResult)
      setGrammarParseResult(saved.grammarParseResult)
      setSelectedDetail((detail) =>
        detail && detail.id === selectedDetail.id
          ? {
              ...detail,
              grammarParseResult: saved.grammarParseResult,
            }
          : detail,
      )
      setVerifyResult(buildGrammarVerifyResult(selectedDetail, saved.grammarParseResult))
      setVerifyStatus('loaded')
      setGrammarParseSaveStatus('saved')
    } catch (error) {
      setGrammarParseSaveStatus('error')
      setGrammarParseSaveError(error instanceof Error ? error.message : String(error))
    }
  }

  async function handleGenerateTopicLabels() {
    if (!selectedDetail) {
      setTopicLabelStatus('error')
      setTopicLabelError('请先打开一个题组，再做主题划分。')
      setTopicLabelTrace(null)
      return
    }

    const key = aiApiKey.trim()
    localStorage.setItem('ai-api-key', key)
    localStorage.setItem('ai-model', aiModel)
    localStorage.setItem('ai-thinking-mode', aiThinkingMode ? 'on' : 'off')
    setTopicLabelStatus('loading')
    setTopicLabelError('')
    setTopicLabelTrace(null)
    setTopicLabelRecommendations([])
    setSelectedTopicLabelValues([])
    setTopicLabelBindStatus('idle')
    setTopicLabelBindError('')

    try {
      const result = await generateTopicLabelsRequest(selectedDetail.id, key, DEFAULT_AI_MODEL, false)
      setTopicLabelTrace(result)
      setTopicLabelRecommendations(result.topicLabels)
      setSelectedTopicLabelValues(result.topicLabels.map((topicLabel) => topicLabel.label))
      setTopicLabelStatus('loaded')
    } catch (error) {
      setTopicLabelStatus('error')
      setTopicLabelError(error instanceof Error ? error.message : String(error))
    }
  }

  function toggleTopicLabelSelection(label: string) {
    setTopicLabelBindStatus('idle')
    setTopicLabelBindError('')
    setSelectedTopicLabelValues((values) =>
      values.includes(label) ? values.filter((value) => value !== label) : [...values, label],
    )
  }

  async function handleBindTopicLabels() {
    if (!selectedDetail) return
    const selectedLabels = topicLabelRecommendations.filter((topicLabel) =>
      selectedTopicLabelValues.includes(topicLabel.label),
    )
    if (selectedLabels.length === 0) {
      setTopicLabelBindStatus('error')
      setTopicLabelBindError('请先选择至少一个话题标签。')
      return
    }

    setTopicLabelBindStatus('saving')
    setTopicLabelBindError('')

    try {
      const result = await bindTopicLabelsRequest(selectedDetail.id, selectedLabels)
      setSelectedDetail((detail) =>
        detail && detail.id === selectedDetail.id
          ? {
              ...detail,
              topicLabels: result.topicLabels,
            }
          : detail,
      )
      setQuestionGroups((groups) =>
        groups.map((group) =>
          group.id === selectedDetail.id
            ? {
                ...group,
                topicLabels: result.topicLabels,
              }
            : group,
        ),
      )
      setTopicLabelRecommendations([])
      setSelectedTopicLabelValues([])
      setTopicLabelBindStatus('saved')
    } catch (error) {
      setTopicLabelBindStatus('error')
      setTopicLabelBindError(error instanceof Error ? error.message : String(error))
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
      showAiEnhancementPanel([saved], 'append')
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
      showAiEnhancementPanel(savedGroups, 'replace')
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
    setSaveError('')
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
      setPaperTitle(title)
      setVersionType('student')
      setLastSavedPaper(paperSet)
      setSavedPapers((paperSets) => [paperSet, ...paperSets.filter((item) => item.id !== paperSet.id)])
      setSavedPapersStatus('loaded')
      setSaveStatus('saved')
      setPaperBuildResult(paperSet)
      setPaperBuildStatus('saved')
      setImportOpen(false)
      setViewMode('preview')
      await loadPreviewForBasketItems(nextBasket)
      await refreshPaperWorkflows()
    } catch (error) {
      setPaperBuildStatus('error')
      setPaperBuildError(error instanceof Error ? error.message : String(error))
    }
  }

  async function handleSavePaperSet() {
    if (basket.length === 0) return

    setSaveStatus('saving')
    setSaveError('')

    try {
      const paperSetInput = buildSavePayload({ basket, paperBlocks, questionNumberStart, paperExportStyle, paperTitle, versionType })

      const paperSet = lastSavedPaper
        ? await updatePaperSetRequest(lastSavedPaper.id, paperSetInput)
        : await savePaperSet(paperSetInput)

      setLastSavedPaper(paperSet)
      setSavedPapers((paperSets) => [paperSet, ...paperSets.filter((item) => item.id !== paperSet.id)])
      setSavedPapersStatus('loaded')
      setSaveStatus('saved')
      await refreshPaperWorkflows()
    } catch (error) {
      setSaveStatus('error')
      setSaveError(error instanceof Error ? error.message : String(error))
    }
  }

  async function handleLoadPaperSet(id: string) {
    setLoadPaperStatus('loading')
    setLoadPaperError('')

    try {
      const paperSet = await fetchPaperSetDetail(id)
      const loadedBasket = paperSet.items
        .filter((item) => item.questionGroup)
        .map((item) =>
          createBasketItem(item.questionGroup!, {
            score: item.score,
            sectionTitle: item.sectionTitle || groupTypeLabel[item.questionGroup!.groupType],
            note: item.note,
          }),
        )

      paperDraft.replaceDraft({ basket: loadedBasket, layout: paperSet.layout })
      if (paperSet.layout) {
        setQuestionNumberStart(paperSet.layout.questionNumberStart || 1)
        setPaperExportStyle(paperSet.layout.printStyle || 'exam')
      }
      if (paperSet.layoutWarnings && paperSet.layoutWarnings.length > 0) {
        setLoadPaperError(`布局提示：${paperSet.layoutWarnings.join('；')}`)
      }
      setPaperTitle(paperSet.title)
      setLastSavedPaper(paperSet)
      setSaveStatus('saved')
      paperExports.resetExportStatuses()
      setPreviewStatus('idle')
      setViewMode('list')
      setLoadPaperStatus('loaded')
    } catch (error) {
      setLoadPaperStatus('error')
      setLoadPaperError(error instanceof Error ? error.message : String(error))
    }
  }

  function showWorkflowQuestionGroups(workflow: PaperWorkflow) {
    setQuery(workflow.title)
    setDifficulty('all')
    setSourceType('all')
    setGroupType('all')
    setSelectedTag('全部')
    setViewMode('list')
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

  return (
    <div className={`app-shell home-mode-${homeMode}`}>
      <header className="topbar">
        <div>
          <p className="eyebrow">Local-first English Question Bank</p>
          <h1>英语题库工作台</h1>
        </div>
        <div className="topbar-actions">
          {homeMode === 'classic' && (
            <span className={`data-status ${dataStatus}`}>
              {dataStatus === 'loading' ? '连接本地库' : dataStatus === 'sqlite' ? 'SQLite 已连接' : '样例数据'}
            </span>
          )}
          {homeMode === 'classic' && (
            <span className="topbar-ai-group">
              <Sparkles size={16} />
              <input
                className="ai-key-input"
                type="password"
                value={aiApiKey}
                placeholder="DeepSeek Key"
                onChange={(event) => setAiApiKey(event.target.value)}
              />
              <select
                className="ai-model-select"
                value={aiModel}
                onChange={(event) => setAiModel(normalizeAiModel(event.target.value))}
              >
                {!DEEPSEEK_MODELS.some((option) => option.value === aiModel) && <option value={aiModel}>{aiModel}</option>}
                {DEEPSEEK_MODELS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <label className="topbar-thinking-toggle">
                <input
                  type="checkbox"
                  checked={aiThinkingMode}
                  onChange={(event) => setAiThinkingMode(event.target.checked)}
                />
                <span>推理模式</span>
              </label>
            </span>
          )}
          {homeMode === 'classic' && (
            <button className="ghost-button" type="button" onClick={() => setViewMode('workflow')}>
              <ClipboardList size={18} />
              闭环面板
            </button>
          )}
          <button className="ghost-button" type="button" onClick={openImportPanel}>
            <FileText size={18} />
            导入资料
          </button>
          <button
            className="home-mode-toggle"
            type="button"
            onClick={() => {
              const next = homeMode === 'ai' ? 'classic' : 'ai'
              setHomeMode(next)
              localStorage.setItem('home-mode', next)
              setViewMode('list')
            }}
            aria-label={homeMode === 'ai' ? '切换到经典模式' : '切换到 AI 模式'}
            title={homeMode === 'ai' ? '切到经典模式（关键词 + 筛选）' : '切到 AI 模式（自然语言取题台）'}
          >
            {homeMode === 'ai' ? '经典模式' : 'AI 模式'}
          </button>
        </div>
      </header>

      {homeMode === 'classic' && (
      <section className="filter-bar" aria-label="筛选">
        <div className="filter-bar-row">
          <label className="filter-bar-field">
            <span>关键词</span>
            <div className="search-field">
              <Search size={17} />
              <input
                value={query}
                onChange={(event) => handleQueryChange(event.target.value)}
                placeholder="搜篇章、题干、标签"
              />
            </div>
          </label>

          <label className="filter-bar-field">
            <span>来源</span>
            <select value={sourceType} onChange={(event) => setSourceType(event.target.value as 'all' | SourceType)}>
              <option value="all">全部来源</option>
              <option value="real_exam">真题</option>
              <option value="mock_exam">模拟题</option>
              <option value="self_made">自建</option>
            </select>
          </label>

          <label className="filter-bar-field">
            <span>题型</span>
            <select value={groupType} onChange={(event) => setGroupType(event.target.value as 'all' | GroupType)}>
              <option value="all">全部题型</option>
              <option value="reading">阅读理解</option>
              <option value="cloze">完形填空</option>
              <option value="seven_choices">七选五</option>
              <option value="grammar_cloze">语法填空</option>
            </select>
          </label>

          <label className="filter-bar-field">
            <span>难度</span>
            <select value={difficulty} onChange={(event) => setDifficulty(event.target.value as 'all' | Difficulty)}>
              <option value="all">全部难度</option>
              <option value="low">低</option>
              <option value="medium">中</option>
              <option value="high">高</option>
            </select>
          </label>

          <label className="filter-bar-field">
            <span>标签</span>
            <select value={selectedTag} onChange={(event) => setSelectedTag(event.target.value)}>
              <option value="全部">全部标签</option>
              {allTags.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          </label>

        </div>
      </section>
      )}

      <main className="workbench" aria-label="英语题库工作台">
        <section className="library-panel" aria-label="题库">
          <div className="library-header">
            <div>
              <p className="eyebrow">Question Groups</p>
              <h2>
                {viewMode === 'detail'
                  ? '题组详情'
                  : viewMode === 'preview'
                    ? '排版预览'
                    : viewMode === 'workflow'
                      ? '闭环面板'
                      : '题组列表'}
              </h2>
            </div>
            <div className="library-header-actions">
              <div className="filter-bar-summary">
                <BookOpen size={17} />
                <strong>{filteredGroups.length}</strong>
                <span>个题组</span>
              </div>
              <div className="view-tabs" aria-label="结果视图">
                <button
                  className={viewMode === 'workflow' ? 'active' : ''}
                  type="button"
                  onClick={() => setViewMode('workflow')}
                >
                  试卷
                </button>
                <button
                  className={viewMode === 'list' ? 'active' : ''}
                  type="button"
                  onClick={() => setViewMode('list')}
                >
                  题组
                </button>
                <button
                  className={viewMode === 'detail' ? 'active' : ''}
                  disabled={!selectedDetail && detailStatus !== 'loading'}
                  type="button"
                  onClick={() => setViewMode('detail')}
                >
                  详情
                </button>
                <button
                  className={viewMode === 'preview' ? 'active' : ''}
                  disabled={basket.length === 0}
                  type="button"
                  onClick={openPreview}
                >
                  预览
                </button>
              </div>
            </div>
          </div>

          {viewMode === 'workflow' ? (
            <div className="workflow-view">
              <section className="workflow-overview" aria-label="试卷闭环总览">
                <div>
                  <p className="eyebrow">Paper Pipeline</p>
                  <h3>多卷闭环状态</h3>
                </div>
                <div className="workflow-summary-grid">
                  <div>
                    <strong>{workflowSummary.total}</strong>
                    <span>试卷</span>
                  </div>
                  <div>
                    <strong>{workflowSummary.ready}</strong>
                    <span>可推进</span>
                  </div>
                  <div>
                    <strong>{workflowSummary.review}</strong>
                    <span>需核对</span>
                  </div>
                  <div>
                    <strong>{workflowSummary.closed}</strong>
                    <span>已闭环</span>
                  </div>
                </div>
                <button
                  className="detail-button"
                  disabled={paperWorkflowsStatus === 'loading'}
                  type="button"
                  onClick={refreshPaperWorkflows}
                >
                  <RefreshCw size={16} />
                  {paperWorkflowsStatus === 'loading' ? '刷新中' : '刷新状态'}
                </button>
              </section>

              {paperWorkflowsStatus === 'loading' && <p className="detail-message">正在读取试卷闭环状态...</p>}
              {paperWorkflowsStatus === 'error' && <p className="detail-message error">{paperWorkflowsError}</p>}
              {paperWorkflowsStatus === 'loaded' && paperWorkflows.length === 0 && (
                <p className="empty-state">导入试卷后，这里会按资料组和题集自动汇总闭环状态。</p>
              )}

              {paperWorkflows.length > 0 && (
                <div className="workflow-list">
                  {paperWorkflows.map((workflow) => {
                    const progress = workflowProgress(workflow)
                    const canGenerateDraft = Boolean(workflow.bundleId && workflow.importFiles.parsedCount > 0)
                    const canViewBankGroups = workflow.bank.objectiveGroupCount > 0
                    const canLoadPaper = Boolean(workflow.paperSet)

                    return (
                      <article className={`workflow-card ${workflow.status}`} key={workflow.id}>
                        <div className="workflow-card-head">
                          <div>
                            <div className="source-line">
                              <span>{workflow.importFiles.fileCount} 文件</span>
                              <span>{workflow.bank.objectiveGroupCount}/{workflow.bank.expectedObjectiveGroupCount} 客观题组</span>
                              <span>{workflow.bank.objectiveQuestionCount} 小题</span>
                            </div>
                            <h3>{workflow.title}</h3>
                          </div>
                          <span className={`workflow-status ${workflow.status}`}>
                            {paperWorkflowStatusHint[workflow.status] || workflow.statusLabel}
                          </span>
                        </div>

                        <div className="workflow-progress" aria-label="闭环进度">
                          {['导入', '入库', '题集', '导出'].map((label, index) => (
                            <span className={index < progress ? 'done' : ''} key={label}>
                              {label}
                            </span>
                          ))}
                        </div>

                        <div className="workflow-stage-grid">
                          <div>
                            <span>资料</span>
                            <strong>
                              {workflow.importFiles.parsedCount}/{workflow.importFiles.fileCount}
                            </strong>
                            <p>
                              题目 {workflow.importFiles.roleCounts.question} · 解析{' '}
                              {workflow.importFiles.roleCounts.answerAnalysis} · 同文件{' '}
                              {workflow.importFiles.roleCounts.questionWithAnalysis}
                            </p>
                          </div>
                          <div>
                            <span>入库</span>
                            <strong>
                              {workflow.bank.objectiveGroupCount}/{workflow.bank.expectedObjectiveGroupCount}
                            </strong>
                            <p>
                              缺答案 {workflow.bank.missingAnswerCount} · 缺选项组{' '}
                              {workflow.bank.missingOptionGroupCount}
                            </p>
                          </div>
                          <div>
                            <span>题集</span>
                            <strong>{workflow.paperSet ? workflow.paperSet.itemCount : 0}</strong>
                            <p>
                              {workflow.paperSet
                                ? `${workflow.paperSet.totalQuestions} 题 · ${Number(workflow.paperSet.totalScore).toFixed(1)} 分`
                                : '尚未保存整卷题集'}
                            </p>
                          </div>
                          <div>
                            <span>成品</span>
                            <strong>
                              {[workflow.exports.studentDocx.exists, workflow.exports.teacherDocx.exists].filter(Boolean).length}/2
                            </strong>
                            <p>
                              学生 {formatWorkflowExport(workflow.exports.studentDocx)} · 教师{' '}
                              {formatWorkflowExport(workflow.exports.teacherDocx)}
                            </p>
                          </div>
                        </div>

                        {workflow.bank.missingSections.length > 0 && (
                          <div className="workflow-missing">
                            <strong>缺板块</strong>
                            {workflow.bank.missingSections.map((section) => (
                              <span key={section}>{section}</span>
                            ))}
                          </div>
                        )}

                        {workflow.bank.groups.length > 0 && (
                          <section className="workflow-question-panel" aria-label={`${workflow.title} 篇章题`}>
                            <div className="workflow-question-head">
                              <div>
                                <strong>篇章题</strong>
                                <span>{workflow.bank.groups.length} 题，可逐题加入草稿卷</span>
                              </div>
                              <button
                                className="detail-button"
                                disabled={sortedWorkflowBankGroups(workflow).every((group) => basket.some((item) => item.id === group.id))}
                                type="button"
                                onClick={() => addWorkflowGroupsToBasket(workflow)}
                              >
                                <Plus size={15} />
                                全部加入
                              </button>
                              <button
                                className="add-button"
                                disabled={workflow.bank.objectiveGroupCount === 0 || paperBuildStatus === 'saving'}
                                style={{ marginLeft: 8 }}
                                type="button"
                                onClick={() => handleBuildWorkflowPaperSet(workflow)}
                              >
                                {paperBuildStatus === 'saving'
                                  ? '更新中'
                                  : workflow.paperSet
                                    ? '更新整卷题集'
                                    : '生成整卷题集'}
                              </button>
                            </div>
                            <div className="workflow-question-list">
                              {sortedWorkflowBankGroups(workflow).map((group) => {
                                const card = questionGroupById.get(group.id)
                                const inBasket = basket.some((item) => item.id === group.id)
                                const missingCount = group.missingAnswerCount + group.missingOptionQuestionCount

                                return (
                                  <article className="workflow-question-item" key={group.id}>
                                    <div>
                                      <strong>{workflowSectionLabel(group.title, workflow.title)}</strong>
                                      <span>
                                        {groupTypeLabel[group.groupType]} · {group.questionCount} 小题 · 每题{' '}
                                        {group.defaultScore} 分
                                      </span>
                                      {missingCount > 0 && (
                                        <p>
                                          缺答案 {group.missingAnswerCount} · 缺选项小题{' '}
                                          {group.missingOptionQuestionCount}
                                        </p>
                                      )}
                                    </div>
                                    <button
                                      className="add-button"
                                      disabled={!card || inBasket}
                                      type="button"
                                      onClick={() => card && addToBasket(card)}
                                    >
                                      {inBasket ? '已加入' : '加入'}
                                    </button>
                                  </article>
                                )
                              })}
                            </div>
                          </section>
                        )}

                        {workflow.importFiles.qualityWarnings.length > 0 && (
                          <div className="bundle-quality-warnings">
                            {workflow.importFiles.qualityWarnings.map((warning) => (
                              <span key={warning}>{warning}</span>
                            ))}
                          </div>
                        )}

                        <p className="workflow-next">{workflow.nextAction}</p>

                        <div className="workflow-actions">
                          <button
                            className="detail-button"
                            disabled={!canViewBankGroups && !canGenerateDraft}
                            type="button"
                            onClick={() => (canViewBankGroups ? showWorkflowQuestionGroups(workflow) : openWorkflowDraft(workflow))}
                          >
                            {canViewBankGroups ? '查看正式题组' : '查看草稿题组'}
                          </button>
                          <button
                            className="detail-button"
                            disabled={!canGenerateDraft || draftStatusByBundleId[workflow.bundleId] === 'generating'}
                            type="button"
                            onClick={() => openWorkflowDraft(workflow)}
                          >
                            {draftStatusByBundleId[workflow.bundleId] === 'generating' ? '生成中' : '生成草稿'}
                          </button>
                          <button
                            className="add-button"
                            disabled={!canLoadPaper || loadPaperStatus === 'loading'}
                            type="button"
                            onClick={() => workflow.paperSet && handleLoadPaperSet(workflow.paperSet.id)}
                          >
                            载入题集
                          </button>
                        </div>
                      </article>
                    )
                  })}
                </div>
              )}
            </div>
          ) : viewMode === 'list' ? (
            homeMode === 'ai' ? (
              <ConciergeDesk
                intent={conciergeDesk.intent}
                onIntentChange={conciergeDesk.setIntent}
                onSubmit={() => { void conciergeDesk.submit() }}
                state={conciergeDesk.state}
                basketIds={new Set(basket.map((item) => item.id))}
                onAdd={(group) => addToBasket(group)}
                onSimilar={(group) => { void conciergeDesk.triggerSimilar(group) }}
                paperResults={conciergeDesk.paperResults}
                expandedPaperKey={conciergeDesk.expandedPaperKey}
                onTogglePaper={(key) => conciergeDesk.togglePaper(key)}
                dataStatus={dataStatus}
              />
            ) : (
                <div className="group-list">
                  {filteredGroups.map((group) => (
                    <article className="group-card" key={group.id}>
                      <div className="card-main">
                        <div className="source-line">
                          <span>{compactGroupMeta(group.groupType, group.questionCount)}</span>
                        </div>
                        <h3>{group.title}</h3>
                        <p className="summary">{group.summary}</p>
                    <p className="hit">
                      <strong>命中：</strong>
                      {group.hit}
                    </p>
                    {semanticSearchEnabled && semanticMatchByGroupId.has(group.id) ? (
                      <p className="semantic-match-reason">
                        <strong>题库管家：</strong>
                        {semanticMatchByGroupId.get(group.id)?.reason || '匹配当前检索意图。'}
                        {semanticMatchByGroupId.get(group.id)?.score
                          ? ` · ${Math.round((semanticMatchByGroupId.get(group.id)?.score || 0) * 100)}%`
                          : ''}
                      </p>
                    ) : null}
                    <div className="tag-row">
                      {group.tags.map((tag) => (
                        <span className="tag" key={tag}>
                          <Tag size={13} />
                          {tag}
                        </span>
                      ))}
                    </div>
                    {group.topicLabels?.length ? (
                      <div className="topic-tag-row" aria-label="已绑定话题标签">
                        <span className="topic-tag-row-title">话题标签</span>
                        {group.topicLabels.map((topicLabel) => (
                          <span className="topic-tag" key={topicLabel.label}>
                            {topicLabel.label}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="card-side">
                    <span className={`difficulty ${group.difficulty}`}>难度 {difficultyLabel[group.difficulty]}</span>
                    <span className="source-type">{sourceTypeLabel[group.sourceType]}</span>
                    <button className="detail-button" type="button" onClick={() => openDetail(group.id)}>
                      详情
                    </button>
                    <button
                      className="add-button"
                      type="button"
                      onClick={() => addToBasket(group)}
                      disabled={basket.some((item) => item.id === group.id)}
                    >
                      <Plus size={16} />
                      {basket.some((item) => item.id === group.id) ? '已加入' : '加入'}
                    </button>
                    <button
                      className="icon-button"
                      type="button"
                      onClick={() => handleDeleteQuestionGroup(group.id)}
                      aria-label="删除题组"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
            )
          ) : viewMode === 'detail' ? (
            <div className="detail-view">
              <button className="back-button" type="button" onClick={backToList}>
                <ArrowLeft size={16} />
                返回列表
              </button>

              {detailStatus === 'loading' && <p className="detail-message">正在读取题组详情...</p>}
              {detailStatus === 'error' && <p className="detail-message error">{detailError}</p>}

              {selectedDetail && detailStatus === 'loaded' && (
                <>
                  <article className="detail-hero">
                    <div>
                      <div className="source-line">
                        <span>{compactGroupMeta(selectedDetail.groupType, selectedDetail.questionCount)}</span>
                      </div>
                      <h3>{selectedDetail.title}</h3>
                      <p>{selectedDetail.summary}</p>
                    </div>
                    <div className="detail-actions">
                      <span className={`difficulty ${selectedDetail.difficulty}`}>
                        难度 {difficultyLabel[selectedDetail.difficulty]}
                      </span>
                      <span className="source-type">{sourceTypeLabel[selectedDetail.sourceType]}</span>
                      <button className="detail-button" type="button" onClick={() => openEditEntry(selectedDetail)}>
                        <Pencil size={16} />
                        编辑
                      </button>
                      <button
                        className="add-button"
                        type="button"
                        onClick={() => addToBasket(selectedDetail)}
                        disabled={basket.some((item) => item.id === selectedDetail.id)}
                      >
                        <Plus size={16} />
                        {basket.some((item) => item.id === selectedDetail.id) ? '已加入' : '加入草稿卷'}
                      </button>
                      {selectedDetail.groupType === 'reading' ? (
                        <>
                          <button
                            className="detail-button"
                            type="button"
                            onClick={handleAnalyzeReadingQuestionGroup}
                          >
                            <Sparkles size={16} />
                            {readingParseStatus === 'loading' || verifyStatus === 'loading'
                              ? 'AI解析中'
                              : 'AI解析'}
                          </button>
                        </>
                      ) : (
                        <button
                          className="detail-button"
                          type="button"
                          onClick={handleVerifyQuestionGroup}
                        >
                          <Sparkles size={16} />
                          {verifyStatus === 'loading' ||
                          clozeParseStatus === 'loading' ||
                          sevenChoicesParseStatus === 'loading' ||
                          grammarParseStatus === 'loading'
                            ? 'AI解析中'
                            : 'AI解析'}
                        </button>
                      )}
                    </div>
                  </article>

                  <section className="detail-section" aria-label="篇章信息">
                    <div className="detail-section-title">
                      <span>Passage</span>
                      <h3>{selectedDetail.passage.title}</h3>
                    </div>
                    <div className="detail-facts">
                      {selectedDetail.passage.theme && <span>主题：{selectedDetail.passage.theme}</span>}
                      {selectedDetail.passage.discourseType && <span>语篇：{selectedDetail.passage.discourseType}</span>}
                      {selectedDetail.passage.wordCount ? <span>词数：{selectedDetail.passage.wordCount}</span> : null}
                    </div>
                    <pre className="passage-text">
                      {selectedDetail.passage.materialText || '暂无完整原文。后续导入 DOCX/PDF/OCR 时会补到这里。'}
                    </pre>
                  </section>

                  <section className="detail-section" aria-label="题组说明">
                    <div className="detail-section-title">
                      <span>Instruction</span>
                      <h3>题组说明</h3>
                    </div>
                    <div className="instruction-summary">
                      <p className="detail-copy">{selectedDetail.instruction || '暂无题组说明。'}</p>
                      {answerCompareStats && (
                        <div className="answer-compare-summary" aria-label="答案对比统计">
                          <span>答案对比</span>
                          <div>
                            <strong>{answerCompareStats.correct}</strong>
                            <em>正确</em>
                          </div>
                          <div>
                            <strong>{answerCompareStats.incorrect}</strong>
                            <em>不正确</em>
                          </div>
                          <small>共 {answerCompareStats.total} 题</small>
                        </div>
                      )}
                    </div>
                    <div className="tag-row">
                      {selectedDetail.tags.map((tag) => (
                        <span className="tag" key={tag}>
                          <Tag size={13} />
                          {tag}
                        </span>
                      ))}
                    </div>
                  </section>

                  <section className="detail-section" aria-label="话题标签">
                    <div className="topic-label-header">
                      <div className="detail-section-title">
                        <span>Topic Labels</span>
                        <h3>话题标签</h3>
                      </div>
                      <button
                        className="detail-button"
                        type="button"
                        onClick={handleGenerateTopicLabels}
                        disabled={topicLabelStatus === 'loading'}
                      >
                        <Sparkles size={16} />
                        {topicLabelStatus === 'loading' ? '主题划分中' : '主题划分'}
                      </button>
                    </div>
                    {topicLabelStatus === 'loading' && <p className="detail-message">正在划分主题...</p>}
                    {topicLabelStatus === 'error' && <p className="form-error">{topicLabelError}</p>}
                    {selectedDetail.topicLabels?.length ? (
                      <div className="topic-label-list" aria-label="已绑定话题标签">
                        {selectedDetail.topicLabels.map((topicLabel) => (
                          <div className="topic-label-item" key={topicLabel.label}>
                            <div>
                              <span>{topicLabel.label}</span>
                              {topicLabel.reason ? <small>{topicLabel.reason}</small> : null}
                            </div>
                            {topicLabel.confidence !== undefined && topicLabel.confidence > 0 ? (
                              <em>{Math.round(topicLabel.confidence * 100)}%</em>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : topicLabelStatus !== 'loading' ? (
                      <p className="detail-copy">暂无话题标签。</p>
                    ) : null}
                    {topicLabelRecommendations.length > 0 && (
                      <div className="topic-label-candidates" aria-label="主题划分候选">
                        {topicLabelRecommendations.map((topicLabel) => (
                          <label className="topic-label-option" key={topicLabel.label}>
                            <input
                              type="checkbox"
                              checked={selectedTopicLabelValues.includes(topicLabel.label)}
                              onChange={() => toggleTopicLabelSelection(topicLabel.label)}
                            />
                            <span>{topicLabel.label}</span>
                            {topicLabel.confidence !== undefined && topicLabel.confidence > 0 ? (
                              <em>{Math.round(topicLabel.confidence * 100)}%</em>
                            ) : null}
                            {topicLabel.reason ? <small>{topicLabel.reason}</small> : null}
                          </label>
                        ))}
                        <button
                          className="save-button"
                          type="button"
                          onClick={handleBindTopicLabels}
                          disabled={topicLabelBindStatus === 'saving' || selectedTopicLabelValues.length === 0}
                        >
                          <Save size={16} />
                          {topicLabelBindStatus === 'saving' ? '绑定中' : '绑定选中标签'}
                        </button>
                      </div>
                    )}
                    {topicLabelBindStatus === 'saved' && <p className="detail-copy">已绑定，当前题组可按话题标签检索。</p>}
                    {topicLabelBindStatus === 'error' && <p className="form-error">{topicLabelBindError}</p>}
                    {topicLabelTrace && (
                      <p className="ai-meta">
                        Provider: {topicLabelTrace.provider ?? 'deepseek'} · 模型: {topicLabelTrace.model || DEFAULT_AI_MODEL} ·
                        推理模式: {topicLabelTrace.thinkingMode ? '开启' : '关闭'} · key 来源:{' '}
                        {topicLabelTrace.keySource === 'local'
                          ? '本地模型'
                          : topicLabelTrace.keySource === 'env'
                            ? '环境变量 DEEPSEEK_API_KEY'
                            : '右上角输入框'}{' '}
                        · call trace:{' '}
                        {topicLabelTrace.requestId || '（未返回）'}
                        {(topicLabelTrace.keyFingerprint || topicLabelTrace.keyMask)
                          ? ` · key 口令: ${topicLabelTrace.keyFingerprint || topicLabelTrace.keyMask}`
                          : ''}
                        {topicLabelTrace.totalLatencyMs !== undefined ? ` · 全量耗时: ${topicLabelTrace.totalLatencyMs} ms` : ''}
                      </p>
                    )}
	                  </section>

	                  {selectedDetail.groupType === 'reading' &&
	                    (readingParseStatus === 'loading' ||
                      readingParseStatus === 'error' ||
                      verifyStatus === 'loading' ||
                      verifyStatus === 'error' ||
                      readingParseResult ||
                      verifyResult) && (
                    <section className="detail-section" aria-label="AI 阅读解析与对比">
                      <div className="detail-section-title">
                        <span>Reading AI</span>
                        <h3>AI 阅读解析与答案对比</h3>
                      </div>
                      {(readingParseStatus === 'loading' || verifyStatus === 'loading') && (
                        <p className="detail-message">AI解析中...</p>
                      )}

                      {readingParseResult && (
                        <>
                          <div className="reading-ai-actions">
                            <p className="detail-message">
                              {readingParseSaveStatus === 'saved'
                                ? `已保存到本地题库${readingParseResult.savedAt ? ` · ${formatSavedAt(readingParseResult.savedAt)}` : ''}`
                                : '当前 AI 阅读解析尚未保存，刷新后会丢失。'}
                            </p>
                            <button
                              className="save-button"
                              type="button"
                              disabled={
                                readingParseSaveStatus === 'saving' ||
                                readingParseSaveStatus === 'saved' ||
                                verifyStatus === 'loading'
                              }
                              onClick={handleSaveReadingParseResult}
                            >
                              <Save size={16} />
                              {verifyStatus === 'loading'
                                ? '等待对比'
                                : readingParseSaveStatus === 'saving'
                                ? '保存中'
                                : readingParseSaveStatus === 'saved'
                                  ? '已保存'
                                  : '保存 AI 解析'}
                            </button>
                          </div>
                          <p className="detail-message" style={{ marginBottom: 12 }}>
                            {readingParseResult.parsedCount} / {readingParseResult.questionCount} 题已解析
                            {readingParseResult.unmatchedQuestionNos.length > 0
                              ? ` · 未匹配题号：${readingParseResult.unmatchedQuestionNos.join('、')}`
                              : ''}
                          </p>
                          {readingParseResult.articleAnalysis && (
                            <p className="detail-message" style={{ marginBottom: 12 }}>
                              脉络：{readingParseResult.articleAnalysis.framework || '待补'} ·{' '}
                              {readingParseResult.articleAnalysis.summary || '待补'}
                            </p>
                          )}
                          {readingParseResult.articleAnalysis?.keyChunks && readingParseResult.articleAnalysis.keyChunks.length > 0 && (
                            <div className="parse-mapping" style={{ marginBottom: 12 }}>
                              <strong>重要词块</strong>
                              <ul>
                                {readingParseResult.articleAnalysis.keyChunks.map((chunk) => (
                                  <li key={`${chunk.chunk}-${chunk.pos || ''}`}>
                                    {chunk.chunk}
                                    {chunk.phonetic ? ` (${chunk.phonetic})` : ''}
                                    {chunk.pos ? `·${chunk.pos}` : ''}
                                    {chunk.reason ? `：${chunk.reason}` : ''}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </>
                      )}

                      {readingParseSaveStatus === 'error' && <p className="form-error">{readingParseSaveError}</p>}
                      {verifyResult && (
                        <p className="detail-message">
                          {verifyResult.verifiedCount} / {verifyResult.questionCount} 题完成对比，{verifyResult.results.filter((r) => r.verdict === 'correct').length}
                          题建议正确；{verifyResult.results.filter((r) => r.verdict !== 'correct').length} 题建议复核。
                          {verifyResult.calledCount !== undefined ? ` 已调 DeepSeek：${verifyResult.calledCount} 题` : ''}
                        </p>
                      )}

                      {verifyStatus === 'error' && <p className="form-error">{verifyError}</p>}
                      {readingParseStatus === 'error' && !readingParseResult && <p className="form-error">{readingParseError}</p>}
                      {readingParseResult && (
                        <p className="detail-message" style={{ marginTop: 12 }}>
                          Provider: {readingParseResult.provider ?? 'deepseek'} · 模型: {readingParseResult.model || DEFAULT_AI_MODEL} ·
                          推理模式: {readingParseResult.thinkingMode ? '开启' : '关闭'} ·
                          key 来源: {readingParseResult.keySource === 'env' ? '环境变量 DEEPSEEK_API_KEY' : '右上角输入框'} ·
                          call trace: {readingParseResult.requestId || '（未返回）'}
                          {(readingParseResult.keyFingerprint || readingParseResult.keyMask)
                            ? ` · key 口令: ${readingParseResult.keyFingerprint || readingParseResult.keyMask}`
                            : ''}
                          {readingParseResult.totalLatencyMs ? ` · 全量耗时: ${readingParseResult.totalLatencyMs} ms` : ''}
                        </p>
                      )}
                    </section>
                  )}

                  {selectedDetail.groupType === 'cloze' && (clozeParseResult || clozeParseStatus === 'loading' || clozeParseStatus === 'error') && (
                    <section className="detail-section" aria-label="AI 完形填空解析">
                      <div className="detail-section-title">
                        <span>Cloze AI</span>
                        <h3>AI 完形填空解析</h3>
                      </div>
                      {clozeParseStatus === 'loading' && (
                        <p className="detail-message">AI解析中...</p>
                      )}

                      {clozeParseResult && (
                        <>
                          <div className="reading-ai-actions">
                            <p className="detail-message">
                              {clozeParseSaveStatus === 'saved'
                                ? `已保存到本地题库${clozeParseResult.savedAt ? ` · ${formatSavedAt(clozeParseResult.savedAt)}` : ''}`
                                : '当前 AI 完形填空解析尚未保存，刷新后会丢失。'}
                            </p>
                            <button
                              className="save-button"
                              type="button"
                              disabled={
                                clozeParseSaveStatus === 'saving' ||
                                clozeParseSaveStatus === 'saved' ||
                                clozeParseStatus === 'loading'
                              }
                              onClick={handleSaveClozeParseResult}
                            >
                              <Save size={16} />
                              {clozeParseSaveStatus === 'saving'
                                ? '保存中'
                                : clozeParseSaveStatus === 'saved'
                                  ? '已保存'
                                  : '保存 AI 解析'}
                            </button>
                          </div>
                          <p className="detail-message" style={{ marginBottom: 12 }}>
                            {clozeParseResult.parsedCount} / {clozeParseResult.questionCount} 题已解析
                            {clozeParseResult.answerLine ? ` · ${clozeParseResult.answerLine}` : ''}
                          </p>
                          {clozeParseResult.storySummary && (
                            <p className="detail-message" style={{ marginBottom: 12 }}>
                              故事大意：{clozeParseResult.storySummary}
                            </p>
                          )}
                          {clozeParseResult.condensedStory && (
                            <div className="parse-mapping" style={{ marginBottom: 12 }}>
                              <strong>串词成篇</strong>
                              <p>{clozeParseResult.condensedStory}</p>
                            </div>
                          )}
                        </>
                      )}

                      {clozeParseSaveStatus === 'error' && <p className="form-error">{clozeParseSaveError}</p>}
                      {clozeParseStatus === 'error' && !clozeParseResult && <p className="form-error">{clozeParseError}</p>}
                    </section>
                  )}

                  {selectedDetail.groupType === 'seven_choices' &&
                    (sevenChoicesParseResult || sevenChoicesParseStatus === 'loading' || sevenChoicesParseStatus === 'error') && (
                    <section className="detail-section" aria-label="AI 七选五解析">
                      <div className="detail-section-title">
                        <span>Seven AI</span>
                        <h3>AI 七选五解析</h3>
                      </div>
                      {sevenChoicesParseStatus === 'loading' && (
                        <p className="detail-message">AI解析中...</p>
                      )}

                      {sevenChoicesParseResult && (
                        <>
                          <div className="reading-ai-actions">
                            <p className="detail-message">
                              {sevenChoicesParseSaveStatus === 'saved'
                                ? `已保存到本地题库${sevenChoicesParseResult.savedAt ? ` · ${formatSavedAt(sevenChoicesParseResult.savedAt)}` : ''}`
                                : '当前 AI 七选五解析尚未保存，刷新后会丢失。'}
                            </p>
                            <button
                              className="save-button"
                              type="button"
                              disabled={
                                sevenChoicesParseSaveStatus === 'saving' ||
                                sevenChoicesParseSaveStatus === 'saved' ||
                                sevenChoicesParseStatus === 'loading'
                              }
                              onClick={handleSaveSevenChoicesParseResult}
                            >
                              <Save size={16} />
                              {sevenChoicesParseSaveStatus === 'saving'
                                ? '保存中'
                                : sevenChoicesParseSaveStatus === 'saved'
                                  ? '已保存'
                                  : '保存 AI 解析'}
                            </button>
                          </div>
                          <p className="detail-message" style={{ marginBottom: 12 }}>
                            {sevenChoicesParseResult.parsedCount} / {sevenChoicesParseResult.questionCount} 题已解析
                            {sevenChoicesParseResult.answerLine ? ` · ${sevenChoicesParseResult.answerLine}` : ''}
                          </p>
                          {sevenChoicesParseResult.articleSummary && (
                            <p className="detail-message" style={{ marginBottom: 12 }}>
                              文章主旨：{sevenChoicesParseResult.articleSummary}
                            </p>
                          )}
                        </>
                      )}

                      {sevenChoicesParseSaveStatus === 'error' && <p className="form-error">{sevenChoicesParseSaveError}</p>}
                      {sevenChoicesParseStatus === 'error' && !sevenChoicesParseResult && <p className="form-error">{sevenChoicesParseError}</p>}
                      {sevenChoicesParseResult && (
                        <p className="detail-message" style={{ marginTop: 12 }}>
                          Provider: {sevenChoicesParseResult.provider ?? 'deepseek'} · 模型: {sevenChoicesParseResult.model || DEFAULT_AI_MODEL} ·
                          推理模式: {sevenChoicesParseResult.thinkingMode ? '开启' : '关闭'} ·
                          key 来源: {sevenChoicesParseResult.keySource === 'env' ? '环境变量 DEEPSEEK_API_KEY' : '右上角输入框'} ·
                          call trace: {sevenChoicesParseResult.requestId || '（未返回）'}
                          {(sevenChoicesParseResult.keyFingerprint || sevenChoicesParseResult.keyMask)
                            ? ` · key 口令: ${sevenChoicesParseResult.keyFingerprint || sevenChoicesParseResult.keyMask}`
                            : ''}
                          {sevenChoicesParseResult.totalLatencyMs ? ` · 全量耗时: ${sevenChoicesParseResult.totalLatencyMs} ms` : ''}
                        </p>
                      )}
                    </section>
                  )}

                  <section className="detail-section" aria-label="小题列表">
                    <div className="detail-section-title">
                      <span>Questions</span>
                      <h3>小题与答案对比</h3>
                    </div>

                    {/* Difficulty Review Queue + Stats */}
                    {(() => {
                      const reviewItems = selectedDetail.questions.map((q) => {
                        const qNo = String(q.questionNo).trim()
                        const rpi = readingParseByQuestionNo.get(qNo)
                        const sp = rpi?.surfaceQuestion
                        const sd = rpi?.synonymDifficulty
                        const dp = rpi?.difficultyProfile
                        const mBlockers = dp?.mainBlockers ?? []
                        const effAiScore = q.aiDifficultyScore ?? dp?.finalScore ?? null
                        const bucket = mapAiDifficultyScoreToFive(effAiScore)
                        const calInput: CalibrationInput = {
                          aiDifficultyScore: effAiScore,
                          deepseekMappedDifficulty: bucket,
                          surfaceType: sp?.type,
                          answeringMove: sp?.answeringMove,
                          tCardId: sd?.cardId,
                          mainBlockers: mBlockers.length > 0 ? mBlockers : undefined,
                          stem: q.stem,
                        }
                        const preview = computeCalibrationPreview(calInput)
                        return { question: q, preview, bucket }
                      })

                      const totalQuestions = reviewItems.length
                      const confirmedCount = reviewItems.filter((r) => r.question.teacherDifficulty != null).length
                      const calibrationChangedCount = reviewItems.filter((r) => r.preview && r.preview.calibratedScore !== r.preview.rawScore).length
                      const highCeilingCount = reviewItems.filter((r) => r.preview?.watchFlags.some((f) => f.code === 'high_ceiling_watch')).length
                      const t10LowCount = reviewItems.filter((r) => r.preview?.watchFlags.some((f) => f.code === 't10_possible_overestimate')).length

                      // Most common reason
                      const reasonCounts = new Map<string, number>()
                      for (const r of reviewItems) {
                        for (const code of r.preview?.reasons ?? []) {
                          reasonCounts.set(code, (reasonCounts.get(code) || 0) + 1)
                        }
                      }
                      let topReason = ''
                      let topReasonCount = 0
                      for (const [code, count] of reasonCounts) {
                        if (count > topReasonCount) { topReason = code; topReasonCount = count }
                      }

                      // Queue: questions needing review
                      const needsReview = reviewItems.filter((r) => {
                        if (r.question.teacherDifficulty == null) return true
                        if (r.preview && r.preview.calibratedScore !== r.preview.rawScore) return true
                        if (r.preview?.watchFlags.some((f) => f.code === 'high_ceiling_watch')) return true
                        if (r.preview?.watchFlags.some((f) => f.code === 't10_possible_overestimate')) return true
                        return false
                      })
                      const pendingCount = needsReview.length

                      return (
                        <div className="difficulty-review-panel">
                          <div className="difficulty-review-stats">
                            <span><strong>{totalQuestions}</strong> 总题</span>
                            <span><strong>{confirmedCount}</strong> 已确认</span>
                            <span><strong>{pendingCount}</strong> 待复核</span>
                            <span><strong>{calibrationChangedCount}</strong> 校正调整</span>
                            {highCeilingCount > 0 && <span className="watch"><strong>{highCeilingCount}</strong> 高天花板</span>}
                            {t10LowCount > 0 && <span className="watch"><strong>{t10LowCount}</strong> T10低置信</span>}
                            {topReason && <span className="reason">常见: {getReasonLabel(topReason as any)} ({topReasonCount})</span>}
                          </div>
                          {needsReview.length > 0 && (
                            <details className="difficulty-review-queue">
                              <summary>难度复核队列 ({needsReview.length} 题待处理)</summary>
                              <div className="difficulty-review-queue-list">
                                {needsReview.map((item) => {
                                  const isHighCeiling = item.preview?.watchFlags.some((f) => f.code === 'high_ceiling_watch')
                                  const isT10 = item.preview?.watchFlags.some((f) => f.code === 't10_possible_overestimate')
                                  return (
                                    <a
                                      className={`difficulty-review-queue-item${isHighCeiling ? ' high-ceiling' : ''}${isT10 ? ' t10-low' : ''}`}
                                      href={`#question-${item.question.id}`}
                                      key={`review-q-${item.question.id}`}
                                    >
                                      <span className="review-q-no">Q{item.question.questionNo}</span>
                                      <span className="review-q-stem">{compactPreview(item.question.stem, 48)}</span>
                                      <span className="review-q-scores">
                                        AI {item.bucket ?? '?'}
                                        {item.preview && item.preview.calibratedScore !== item.preview.rawScore
                                          ? ` → 校正 ${item.preview.calibratedScore}`
                                          : ''}
                                        {item.question.teacherDifficulty ? ` · 教师 ${item.question.teacherDifficulty}` : ''}
                                      </span>
                                      {item.preview && item.preview.reasons.length > 0 && (
                                        <span className="review-q-reasons">
                                          {item.preview.reasons.slice(0, 3).map((c) => getReasonLabel(c as any)).join('、')}
                                        </span>
                                      )}
                                      {isHighCeiling && <span className="review-q-flag high-ceiling">高天花板</span>}
                                      {isT10 && <span className="review-q-flag t10">T10低置信</span>}
                                    </a>
                                  )
                                })}
                              </div>
                            </details>
                          )}
                        </div>
                      )
                    })()}

                    {/* Difficulty Calibration Report */}
                    {(() => {
                      const reportItems = selectedDetail.questions.map((q) => {
                        const qNo = String(q.questionNo).trim()
                        const rpi = readingParseByQuestionNo.get(qNo)
                        const sp = rpi?.surfaceQuestion
                        const sd = rpi?.synonymDifficulty
                        const dp = rpi?.difficultyProfile
                        const mBlockers = dp?.mainBlockers ?? []
                        const effAiScore = q.aiDifficultyScore ?? dp?.finalScore ?? null
                        const bucket = mapAiDifficultyScoreToFive(effAiScore)
                        const preview = computeCalibrationPreview({
                          aiDifficultyScore: effAiScore,
                          deepseekMappedDifficulty: bucket,
                          surfaceType: sp?.type,
                          answeringMove: sp?.answeringMove,
                          tCardId: sd?.cardId,
                          mainBlockers: mBlockers.length > 0 ? mBlockers : undefined,
                          stem: q.stem,
                        })
                        return { question: q, bucket, preview, blockers: mBlockers }
                      })

                      const total = reportItems.length
                      // Distributions
                      const aiBucketDist = [1, 2, 3, 4, 5].map((s) => ({ score: s, count: reportItems.filter((r) => r.bucket === s).length }))
                      const teacherDist = [1, 2, 3, 4, 5].map((s) => ({ score: s, count: reportItems.filter((r) => r.question.teacherDifficulty === s).length }))
                      const calDist = [1, 2, 3, 4, 5].map((s) => ({ score: s, count: reportItems.filter((r) => r.preview?.calibratedScore === s).length }))
                      const teacherConfirmedCount = reportItems.filter((r) => r.question.teacherDifficulty != null).length

                      // AI vs teacher comparison
                      const compared = reportItems.filter((r) => r.question.teacherDifficulty != null && r.bucket != null)
                      const exactCount = compared.filter((r) => r.bucket === r.question.teacherDifficulty).length
                      const aiLowerCount = compared.filter((r) => r.bucket! < r.question.teacherDifficulty!).length
                      const aiHigherCount = compared.filter((r) => r.bucket! > r.question.teacherDifficulty!).length
                      const gapTwoCount = compared.filter((r) => Math.abs(r.bucket! - r.question.teacherDifficulty!) >= 2).length

                      // Top blockers/reasons
                      const reasonCounts = new Map<string, number>()
                      const blockerCounts = new Map<string, number>()
                      for (const r of reportItems) {
                        for (const code of r.preview?.reasons ?? []) reasonCounts.set(code, (reasonCounts.get(code) || 0) + 1)
                        for (const b of r.blockers) blockerCounts.set(b, (blockerCounts.get(b) || 0) + 1)
                      }
                      const topReasons = [...reasonCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
                      const topBlockers = [...blockerCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)

                      // Watch list
                      const watchList = reportItems.filter((r) => {
                        if (r.preview && r.preview.calibratedScore !== r.preview.rawScore) return true
                        if (r.preview?.watchFlags.some((f) => f.code === 'high_ceiling_watch')) return true
                        if (r.preview?.watchFlags.some((f) => f.code === 't10_possible_overestimate')) return true
                        if (r.question.teacherDifficulty != null && r.bucket != null && Math.abs(r.bucket - r.question.teacherDifficulty) >= 2) return true
                        return false
                      })

                      return (
                        <details className="calibration-report">
                          <summary>难度校正报告 · {total} 题 · 已确认 {teacherConfirmedCount}</summary>
                          <div className="calibration-report-body">
                            {/* Distributions */}
                            <div className="calibration-report-section">
                              <span className="calibration-report-label">分数分布</span>
                              <table className="calibration-report-table">
                                <thead>
                                  <tr><th>档位</th><th>1</th><th>2</th><th>3</th><th>4</th><th>5</th></tr>
                                </thead>
                                <tbody>
                                  <tr><td>AI</td>{aiBucketDist.map((d) => <td key={`ai-${d.score}`}>{d.count || '-'}</td>)}</tr>
                                  <tr><td>校正</td>{calDist.map((d) => <td key={`cal-${d.score}`}>{d.count || '-'}</td>)}</tr>
                                  <tr><td>教师</td>{teacherConfirmedCount > 0 ? teacherDist.map((d) => <td key={`t-${d.score}`}>{d.count || '-'}</td>) : <td colSpan={5}>暂无老师确认样本</td>}</tr>
                                </tbody>
                              </table>
                            </div>

                            {/* AI vs Teacher */}
                            {compared.length > 0 && (
                              <div className="calibration-report-section">
                                <span className="calibration-report-label">AI vs 教师 ({compared.length} 题已对比)</span>
                                <div className="calibration-report-chips">
                                  <span>一致 <strong>{exactCount}</strong></span>
                                  <span>AI偏低 <strong>{aiLowerCount}</strong></span>
                                  <span>AI偏高 <strong>{aiHigherCount}</strong></span>
                                  <span className={gapTwoCount > 0 ? 'warn' : ''}>差≥2 <strong>{gapTwoCount}</strong></span>
                                </div>
                              </div>
                            )}
                            {compared.length === 0 && (
                              <div className="calibration-report-section">
                                <span className="calibration-report-label">AI vs 教师</span>
                                <span className="calibration-report-muted">暂无老师确认样本</span>
                              </div>
                            )}

                            {/* Top reasons/blockers */}
                            {(topReasons.length > 0 || topBlockers.length > 0) && (
                              <div className="calibration-report-section">
                                <span className="calibration-report-label">常见原因 / 阻断</span>
                                <div className="calibration-report-chips">
                                  {topReasons.map(([code, count]) => (
                                    <span key={`r-${code}`}>{getReasonLabel(code as any)} <strong>{count}</strong></span>
                                  ))}
                                  {topBlockers.map(([b, count]) => (
                                    <span key={`b-${b}`} className="blocker">{labelOf(mainBlockerLabel, b)} <strong>{count}</strong></span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Watch list */}
                            {watchList.length > 0 && (
                              <div className="calibration-report-section">
                                <span className="calibration-report-label">关注列表 ({watchList.length})</span>
                                <div className="calibration-report-watchlist">
                                  {watchList.slice(0, 12).map((item) => (
                                    <a className="calibration-report-watch-item" href={`#question-${item.question.id}`} key={`rw-${item.question.id}`}>
                                      <strong>Q{item.question.questionNo}</strong>
                                      <span>
                                        AI {item.bucket ?? '?'}
                                        {item.preview && item.preview.calibratedScore !== item.preview.rawScore ? ` → ${item.preview.calibratedScore}` : ''}
                                        {item.question.teacherDifficulty != null ? ` · 教师 ${item.question.teacherDifficulty}` : ''}
                                      </span>
                                      {item.preview?.watchFlags.map((f) => (
                                        <em key={`${item.question.id}-${f.code}`}>{f.code === 'high_ceiling_watch' ? '高天花板' : 'T10低置信'}</em>
                                      ))}
                                      {item.question.teacherDifficulty != null && item.bucket != null && Math.abs(item.bucket - item.question.teacherDifficulty) >= 2 && (
                                        <em>差≥2</em>
                                      )}
                                    </a>
                                  ))}
                                  {watchList.length > 12 && <span className="calibration-report-muted">…还有 {watchList.length - 12} 题</span>}
                                </div>
                              </div>
                            )}
                          </div>
                        </details>
                      )
                    })()}

                    <div className="question-list">
                        {selectedDetail.questions.map((question) => {
                        const questionNo = String(question.questionNo).trim()
                        const readingParseItem = readingParseByQuestionNo.get(questionNo)
                        const surfaceQuestionItem = readingParseItem?.surfaceQuestion
                        const synonymDifficultyItem = readingParseItem?.synonymDifficulty
                        const difficultyProfileItem = readingParseItem?.difficultyProfile
                        const clozeParseItem = clozeParseByQuestionNo.get(questionNo)
                        const sevenChoicesParseItem = sevenChoicesParseByQuestionNo.get(questionNo)
                        const grammarParseItem = grammarParseByQuestionNo.get(questionNo)
                        const verifyItem = verifyByQuestionNo.get(questionNo)
                        const showAi = selectedDetail.groupType === 'reading'
                        const showClozeAi = selectedDetail.groupType === 'cloze'
                        const showSevenChoicesAi = selectedDetail.groupType === 'seven_choices'
                        const showGrammarAi = selectedDetail.groupType === 'grammar_cloze'
                        const savedParseAt = getParseSavedAt(
                          selectedDetail.groupType,
                          readingParseResult,
                          clozeParseResult,
                          sevenChoicesParseResult,
                          grammarParseResult,
                        )
                        const hasSavedParse = Boolean(savedParseAt)
                        const hasSavedParseWithoutVerify = hasSavedParse && !verifyItem && verifyStatus !== 'loading'
                        const showCompareBox = Boolean(verifyItem) || verifyStatus === 'loading' || !hasSavedParse || hasSavedParseWithoutVerify
                        const compareStatus =
                          verifyItem?.verdict ||
                          (verifyStatus === 'loading'
                            ? 'pending'
                            : hasSavedParseWithoutVerify
                              ? 'uncertain'
                              : question.answer
                                ? 'pending'
                                : 'skipped')
                        const compareLabel = verifyItem
                          ? verifyItem.verdict === 'correct'
                            ? '录入答案正确'
                            : verdictLabel[verifyItem.verdict]
                          : verifyStatus === 'loading'
                            ? '对比中'
                            : hasSavedParseWithoutVerify
                              ? '状态未保存'
                            : question.answer
                              ? '待对比'
                              : '缺答案'
                        const compareReason = verifyItem
                          ? verifyItem.reason || '未返回对比说明。'
                          : verifyStatus === 'loading'
                            ? '正在调用 AI 对比当前答案。'
                            : hasSavedParseWithoutVerify
                              ? '这份 AI 解析已保存，但旧记录里没有保存对比状态；重新运行 AI解析并保存后会保留原状态。'
                            : question.answer
                                ? '点击 AI解析后显示校验结论。'
                              : '当前小题还没有答案，暂不能对比。'
                        const vocabBlockerWords = difficultyProfileItem?.vocabLoad?.blockerWords?.slice(0, 4) ?? []
                        const mainBlockers = difficultyProfileItem?.mainBlockers ?? []
                        const effectiveAiDifficultyScore =
                          question.aiDifficultyScore ?? difficultyProfileItem?.finalScore ?? null
                        const difficultyDraft = difficultyDrafts[question.id] || getDifficultyDraftForQuestion(question)
                        const displayDifficulty = getDisplayDifficulty(question, effectiveAiDifficultyScore)
                        const aiDifficultyBucket = mapAiDifficultyScoreToFive(effectiveAiDifficultyScore)
                        const difficultySource = question.teacherDifficulty
                          ? '老师确认'
                          : displayDifficulty
                            ? 'AI建议'
                            : ''
                        const difficultyReasonRequired = requiresDifficultyReason(
                          question,
                          difficultyDraft,
                          effectiveAiDifficultyScore,
                        )
                        const difficultyStatus = difficultySaveStatus[question.id] || 'idle'
                        const questionCalibrationPreview = computeCalibrationPreview({
                          aiDifficultyScore: effectiveAiDifficultyScore,
                          deepseekMappedDifficulty: aiDifficultyBucket,
                          surfaceType: surfaceQuestionItem?.type,
                          answeringMove: surfaceQuestionItem?.answeringMove,
                          tCardId: synonymDifficultyItem?.cardId,
                          mainBlockers: mainBlockers.length > 0 ? mainBlockers : undefined,
                          stem: question.stem,
                        })

                        return (
                          <article className="question-item" id={`question-${question.id}`} key={question.id}>
                            <div className="question-topline">
                              <span>第 {question.questionNo} 题</span>
                              <span>{question.questionType}</span>
                              <span>{question.score} 分</span>
                            </div>
                            <p className="question-stem">{question.stem}</p>
                            {question.options.length > 0 && (
                              <div className="option-list">
                                {question.options.map((option) => (
                                  <div className="option-item" key={option.id}>
                                    <strong>{option.label}</strong>
                                    <span>{option.content}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            <div className={`answer-grid${showCompareBox ? '' : ' answer-grid-single'}`}>
                              <div className="answer-box">
                                <p>答案：{question.answer || '待补'}</p>
                              </div>
                              {showCompareBox && (
                                <div
                                  className={`answer-box answer-compare-box answer-compare-compact ${compareStatus}`}
                                  title={compareReason}
                                >
                                  <span className={`verify-badge ${compareStatus}`}>{compareLabel}</span>
                                </div>
                              )}
	                            </div>

                              <div className="teacher-difficulty-card">
                                <div className="teacher-difficulty-head">
                                  <span>小题难度</span>
                                  <strong>
                                    {displayDifficulty
                                      ? `${difficultySource} ${displayDifficulty} · ${teacherDifficultyLabel[displayDifficulty]}`
                                      : '未评估'}
                                  </strong>
                                  <em>
                                    AI {effectiveAiDifficultyScore ? `${effectiveAiDifficultyScore}/10` : '未评估'}
                                    {aiDifficultyBucket ? ` → ${aiDifficultyBucket}档` : ''}
                                  </em>
                                </div>
                                <div className="teacher-difficulty-controls" aria-label="老师确认难度">
                                  {[1, 2, 3, 4, 5].map((level) => (
                                    <button
                                      className={difficultyDraft.teacherDifficulty === String(level) ? 'active' : ''}
                                      key={`${question.id}-difficulty-${level}`}
                                      type="button"
                                      onClick={() => updateDifficultyDraft(question.id, { teacherDifficulty: String(level) })}
                                    >
                                      {level}
                                    </button>
                                  ))}
                                  <button
                                    className="ghost"
                                    type="button"
                                    onClick={() =>
                                      updateDifficultyDraft(question.id, {
                                        teacherDifficulty: '',
                                        reason: '',
                                        note: '',
                                      })
                                    }
                                  >
                                    清空
                                  </button>
                                  {aiDifficultyBucket && (
                                    <button
                                      className={`ghost${difficultyDraft.teacherDifficulty === String(aiDifficultyBucket) ? ' active' : ''}`}
                                      type="button"
                                      title={`设为AI建议 ${aiDifficultyBucket} 档`}
                                      onClick={() => updateDifficultyDraft(question.id, { teacherDifficulty: String(aiDifficultyBucket) })}
                                    >
                                      同意AI
                                    </button>
                                  )}
                                  {questionCalibrationPreview && questionCalibrationPreview.calibratedScore !== questionCalibrationPreview.rawScore && (
                                    <button
                                      className={`ghost${difficultyDraft.teacherDifficulty === String(questionCalibrationPreview.calibratedScore) ? ' active' : ''}`}
                                      type="button"
                                      title={`设为校正建议 ${questionCalibrationPreview.calibratedScore} 档`}
                                      onClick={() => updateDifficultyDraft(question.id, { teacherDifficulty: String(questionCalibrationPreview.calibratedScore) })}
                                    >
                                      同意校正
                                    </button>
                                  )}
                                </div>
                                <div className="teacher-difficulty-meta">
                                  <select
                                    aria-label="难度偏差原因"
                                    value={difficultyDraft.reason}
                                    onChange={(event) => updateDifficultyDraft(question.id, { reason: event.target.value })}
                                  >
                                    <option value="">{difficultyReasonRequired ? '选择偏差原因' : '原因可选'}</option>
                                    {Object.entries(difficultyOverrideReasonLabel).map(([value, label]) => (
                                      <option key={value} value={value}>
                                        {label}
                                      </option>
                                    ))}
                                  </select>
                                  <input
                                    aria-label="难度备注"
                                    placeholder="老师备注"
                                    value={difficultyDraft.note}
                                    onChange={(event) => updateDifficultyDraft(question.id, { note: event.target.value })}
                                  />
                                  <button
                                    className="save-button"
                                    disabled={difficultyStatus === 'saving'}
                                    type="button"
                                    onClick={() => handleSaveQuestionDifficulty(question, effectiveAiDifficultyScore)}
                                  >
                                    <Save size={16} />
                                    {difficultyStatus === 'saving' ? '保存中' : '保存'}
                                  </button>
                                </div>
                                {(difficultySaveErrors[question.id] || difficultyStatus === 'saved' || question.difficultyTaggedAt) && (
                                  <p className={`teacher-difficulty-status ${difficultySaveErrors[question.id] ? 'error' : ''}`}>
                                    {difficultySaveErrors[question.id] ||
                                      (difficultyStatus === 'saved'
                                        ? '已保存'
                                        : question.difficultyTaggedAt
                                          ? `已确认 · ${question.difficultyTaggedAt}`
                                          : '')}
                                  </p>
                                )}
                              </div>

                              {(() => {
                                const preview = questionCalibrationPreview
                                if (!preview) return null
                                const isT10Low = preview.watchFlags.some((f) => f.code === 't10_possible_overestimate')
                                const isHighCeiling = preview.watchFlags.some((f) => f.code === 'high_ceiling_watch')
                                return (
                                  <div className={`calibration-preview-card${isT10Low ? ' low-confidence' : ''}`}>
                                    <div className="calibration-preview-head">
                                      <span>校正建议</span>
                                      <strong>{preview.displayLabel}</strong>
                                    </div>
                                    {isHighCeiling && (
                                      <p className="calibration-watch-flag high-ceiling">可能高天花板，需教师复核</p>
                                    )}
                                    {isT10Low && (
                                      <p className="calibration-watch-flag t10-warning">抽象压缩样本不足，可能高估</p>
                                    )}
                                    {preview.reasons.length > 0 && (
                                      <div className="calibration-reasons">
                                        {preview.reasons.map((code) => (
                                          <span key={`${question.id}-cal-${code}`}>{getReasonLabel(code)}</span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )
                              })()}

                              {showAi && (surfaceQuestionItem || difficultyProfileItem) && (
                                <div className="reading-profile-card">
                                  {surfaceQuestionItem && (
                                    <div className="reading-profile-head">
                                      <span>题型画像</span>
                                      <strong>{labelOf(surfaceQuestionTypeLabel, surfaceQuestionItem.type)}</strong>
                                      <em>{labelOf(answeringMoveLabel, surfaceQuestionItem.answeringMove)}</em>
                                      {surfaceQuestionItem.scope && <em>{labelOf(surfaceScopeLabel, surfaceQuestionItem.scope)}</em>}
                                    </div>
                                  )}
                                  {surfaceQuestionItem?.reason && <p>{surfaceQuestionItem.reason}</p>}
                                  {difficultyProfileItem && (
                                    <>
                                      <div className="difficulty-profile-grid" aria-label="六维难度画像">
                                        <span>
                                          <strong>词汇</strong>
                                          {labelOf(difficultyProfileLevelLabel, difficultyProfileItem.vocabLoad?.level)}
                                        </span>
                                        <span>
                                          <strong>语法</strong>
                                          {labelOf(difficultyProfileLevelLabel, difficultyProfileItem.syntaxLoad?.level)}
                                        </span>
                                        <span>
                                          <strong>跨度</strong>
                                          {labelOf(infoSpanLabel, difficultyProfileItem.infoSpan?.level)}
                                        </span>
                                        <span>
                                          <strong>抽象</strong>
                                          {labelOf(difficultyProfileLevelLabel, difficultyProfileItem.reasoningAbstraction)}
                                        </span>
                                        <span>
                                          <strong>干扰</strong>
                                          {labelOf(difficultyProfileLevelLabel, difficultyProfileItem.distractorStrength)}
                                        </span>
                                        <span>
                                          <strong>话题</strong>
                                          {labelOf(difficultyProfileLevelLabel, difficultyProfileItem.topicAbstractness)}
                                        </span>
                                      </div>
                                      <div className="difficulty-profile-score">
                                        <strong>难度 {difficultyProfileItem.finalScore || '待判'}/10</strong>
                                        <span>{labelOf(difficultyProfileLevelLabel, difficultyProfileItem.finalLabel)}</span>
                                        {mainBlockers.map((blocker) => (
                                          <em key={`${question.id}-${blocker}`}>{labelOf(mainBlockerLabel, blocker)}</em>
                                        ))}
                                      </div>
                                      {difficultyProfileItem.reason && <p>{difficultyProfileItem.reason}</p>}
                                      {vocabBlockerWords.length > 0 && (
                                        <div className="vocab-blocker-list">
                                          {vocabBlockerWords.map((word, index) => (
                                            <span key={`${question.id}-${word.word}-${index}`}>
                                              {word.word} · {labelOf(blockerRoleLabel, word.role)} ·{' '}
                                              {labelOf(blockerPositionLabel, word.position)}
                                            </span>
                                          ))}
                                        </div>
                                      )}
                                    </>
                                  )}
                                </div>
                              )}

	                            {showAi && synonymDifficultyItem && (
	                              <div className={`synonym-difficulty-card${synonymDifficultyItem.reviewNeeded ? ' needs-review' : ''}`}>
	                                <div className="synonym-difficulty-head">
	                                  <span>同义替换难度</span>
	                                  <strong>
	                                    {synonymDifficultyItem.cardId} · {synonymDifficultyItem.name}
	                                  </strong>
	                                  <em>
	                                    SOLO {synonymDifficultyItem.soloLevel} · 难度 {synonymDifficultyItem.difficultyDefault} ·{' '}
	                                    {Math.round(synonymDifficultyItem.confidence * 100)}%
	                                  </em>
	                                </div>
	                                <p>{synonymDifficultyItem.reason}</p>
	                                <div className="synonym-difficulty-evidence">
	                                  {synonymDifficultyItem.evidenceSource && (
	                                    <span>证据来源：{synonymDifficultyItem.evidenceSource}</span>
	                                  )}
	                                  <span>原文：{synonymDifficultyItem.sourceExpression || '待补'}</span>
	                                  <span>选项：{synonymDifficultyItem.optionExpression || '待补'}</span>
	                                  {synonymDifficultyItem.boundaryCheck && (
	                                    <span>边界判断：{synonymDifficultyItem.boundaryCheck}</span>
	                                  )}
	                                  {synonymDifficultyItem.studentBlocker && (
	                                    <span>学生卡点：{synonymDifficultyItem.studentBlocker}</span>
	                                  )}
	                                  {synonymDifficultyItem.teachingMove && (
	                                    <span>讲评动作：{synonymDifficultyItem.teachingMove}</span>
	                                  )}
	                                </div>
	                                {((synonymDifficultyItem.boundaryFlags?.length ?? 0) > 0 ||
	                                  synonymDifficultyItem.reviewNeeded) && (
	                                  <div className="synonym-difficulty-flags">
	                                    {synonymDifficultyItem.boundaryFlags.map((flag) => (
	                                      <span key={`${question.id}-${flag}`}>{flag}</span>
	                                    ))}
	                                    {synonymDifficultyItem.reviewNeeded && <strong>需人工复核</strong>}
	                                  </div>
	                                )}
	                              </div>
	                            )}

	                            {showAi && readingParseItem && (
	                              <div className="question-ai-block">
                                <div className="question-ai-parse">
                                  <div className="question-ai-section-title">
                                    <span>AI 阅读解析</span>
                                  </div>
                                  <p>
                                    <strong>题目翻译：</strong>
                                    {readingParseItem.questionTranslation || '未返回'}
                                  </p>
                                  <p>
                                    <strong>题型策略：</strong>
                                    {readingParseItem.strategy || '待返回'}
                                  </p>
                                  {readingParseItem.locationSentence && (
                                    <p>
                                      <strong>定位句：</strong>
                                      {readingParseItem.locationSentence}
                                      {readingParseItem.locationSentenceTranslation
                                        ? ` / ${readingParseItem.locationSentenceTranslation}`
                                        : ''}
                                    </p>
                                  )}
                                  {readingParseItem.answerSentence && (
                                    <p>
                                      <strong>答案句：</strong>
                                      {readingParseItem.answerSentence}
                                    </p>
                                  )}
                                  <p>
                                    <strong>AI 解析：</strong>
                                    {readingParseItem.explanation || '未返回'}
                                  </p>
                                  {readingParseItem.languageFeatures && (
                                    <p>
                                      <strong>语言特征：</strong>
                                      {readingParseItem.languageFeatures}
                                    </p>
                                  )}
                                  {readingParseItem.answer && (
                                    <p>
                                      <strong>AI 推荐答案：</strong>
                                      {readingParseItem.answer}
                                    </p>
                                  )}
                                        {readingParseItem.synonymMappings && readingParseItem.synonymMappings.length > 0 && (
                                          <div className="parse-mapping">
                                            <strong>同义替换</strong>
                                            <ul>
                                              {readingParseItem.synonymMappings.map((mapping) => (
                                          <li key={`${question.questionNo}-${mapping.text}`}>
                                            <span>{mapping.text}</span>
                                            <b>=</b>
                                            <span>{mapping.replacement}</span>
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                  {readingParseItem.distractorAnalysis && readingParseItem.distractorAnalysis.length > 0 && (
                                    <div className="parse-mapping">
                                      <strong>干扰项分析</strong>
                                      <ul>
                                        {readingParseItem.distractorAnalysis.map((item) => (
                                          <li key={`${question.questionNo}-${item.option}`}>
                                            {item.option}（{labelOf(readingDistractorTypeLabel, item.type)}）：{item.reason}
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                  </div>
                              </div>
                            )}
                            {showClozeAi && clozeParseItem && (
                              <div className="question-ai-block">
                                <div className="question-ai-parse">
                                  <div className="question-ai-section-title">
                                    <span>AI 完形填空解析</span>
                                  </div>
                                  <p>
                                    <strong>AI 推荐答案：</strong>
                                    {clozeParseItem.answer || '未返回'}
                                    {clozeParseItem.answerText ? ` · ${clozeParseItem.answerText}` : ''}
                                    {clozeParseItem.answerMeaning ? `（${clozeParseItem.answerMeaning}）` : ''}
                                  </p>
                                  <p>
                                    <strong>AI 解析：</strong>
                                    {clozeParseItem.analysis || '未返回'}
                                  </p>
                                  {clozeParseItem.distractorAnalysis && clozeParseItem.distractorAnalysis.length > 0 && (
                                    <div className="parse-mapping">
                                      <strong>干扰项分析</strong>
                                      <ul>
                                        {clozeParseItem.distractorAnalysis.map((item) => (
                                          <li key={`${question.questionNo}-${item.option || item.text}`}>
                                            {item.option ? `${item.option}. ` : ''}
                                            {item.text ? `${item.text}：` : ''}
                                            {item.reason}
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                            {showSevenChoicesAi && sevenChoicesParseItem && (
                              <div className="question-ai-block">
                                <div className="question-ai-parse">
                                  <div className="question-ai-section-title">
                                    <span>AI 七选五解析</span>
                                  </div>
                                  <p>
                                    <strong>AI 推荐答案：</strong>
                                    {sevenChoicesParseItem.answer || '未返回'}
                                    {sevenChoicesParseItem.optionText ? ` · ${sevenChoicesParseItem.optionText}` : ''}
                                  </p>
                                  {sevenChoicesParseItem.optionTranslation && (
                                    <p>
                                      <strong>选项翻译：</strong>
                                      {sevenChoicesParseItem.optionTranslation}
                                    </p>
                                  )}
                                  {sevenChoicesParseItem.positionContext && (
                                    <p>
                                      <strong>位置与上下文：</strong>
                                      {sevenChoicesParseItem.positionContext}
                                    </p>
                                  )}
                                  <p>
                                    <strong>AI 解析：</strong>
                                    {sevenChoicesParseItem.analysis || '未返回'}
                                  </p>
                                </div>
                              </div>
                            )}
                            {showGrammarAi && grammarParseItem && (
                              <div className="question-ai-block">
                                <div className="question-ai-parse">
                                  <div className="question-ai-section-title">
                                    <span>AI 语法填空解析</span>
                                  </div>
                                  <p>
                                    <strong>AI 推荐答案：</strong>
                                    {grammarParseItem.answer || '未返回'}
                                  </p>
                                  {grammarParseItem.hintMeaning && (
                                    <p>
                                      <strong>提示词意思：</strong>
                                      {grammarParseItem.hintMeaning}
                                    </p>
                                  )}
                                  <p>
                                    <strong>AI 解析：</strong>
                                    {grammarParseItem.analysis || '未返回'}
                                  </p>
                                  {grammarParseItem.sentenceTranslation && (
                                    <p>
                                      <strong>挖空句翻译：</strong>
                                      {grammarParseItem.sentenceTranslation}
                                    </p>
                                  )}
                                </div>
                              </div>
                            )}
                          </article>
                        )
                      })}
                    </div>
                  </section>

                  {selectedDetail.groupType !== 'reading' ? (
                    verifyResult ? (
                      <section className="detail-section" aria-label="AI 验证结果">
                        <div className="detail-section-title">
                          <span>AI Verification</span>
                          <h3>AI 答案验证</h3>
                        </div>
                        <p className="detail-message" style={{ marginBottom: 12 }}>
                            {verifyResult.verifiedCount} 题已验证，{verifyResult.results.filter((r) => r.verdict === 'correct').length} 题正确
                          {verifyStatus === 'loading' && ' · 验证中...'}
                        </p>
                        <p className="detail-message" style={{ marginBottom: 12 }}>
                          Provider: {verifyResult.provider ?? 'deepseek'} · 模型: {verifyResult.model || DEFAULT_AI_MODEL} ·
                          推理模式: {verifyResult.thinkingMode ? '开启' : '关闭'} ·
                          key 来源: {verifyResult.keySource === 'env' ? '环境变量 DEEPSEEK_API_KEY' : '右上角输入框'} ·
                          call trace: {verifyResult.requestId || '（未返回）'}
                          {(verifyResult.keyFingerprint || verifyResult.keyMask)
                            ? ` · key 口令: ${verifyResult.keyFingerprint || verifyResult.keyMask}`
                            : ''}
                          {verifyResult.calledCount !== undefined ? ` · 已调 DeepSeek: ${verifyResult.calledCount} 题` : ''}
                        </p>
                        {verifyResult.allApiCalled !== undefined && verifyResult.totalLatencyMs !== undefined && (
                          <p className="detail-message" style={{ marginBottom: 12 }}>
                            全量耗时: {verifyResult.totalLatencyMs} ms · 全量调度完成
                          </p>
                        )}
                        {verifyStatus === 'error' && <p className="form-error">{verifyError}</p>}
                        <div className="verify-list">
                          {verifyResult.results.map((r) => {
                            return (
                              <div className={`verify-item ${r.verdict}`} key={r.questionNo}>
                                <div className="verify-item-head">
                                  <strong>第 {r.questionNo} 题</strong>
                                  <span className={`verify-badge ${r.verdict}`}>
                                    {verdictLabel[r.verdict]}
                                  </span>
                                </div>
                                <p>{r.reason}</p>
                                {r.correctAnswer && <p className="verify-correct">建议答案：{r.correctAnswer}</p>}
                              </div>
                            )
                          })}
                        </div>
                      </section>
                    ) : null
                  ) : null}

                  {selectedDetail.groupType === 'grammar_cloze' && (grammarParseResult || grammarParseStatus === 'loading') && (
                    <section className="detail-section" aria-label="AI 语法填空解析">
                      <div className="detail-section-title">
                        <span>Grammar AI</span>
                        <h3>AI 语法填空解析</h3>
                      </div>
                      {grammarParseStatus === 'loading' && (
                        <p className="detail-message">AI 语法填空解析中...</p>
                      )}

                      {grammarParseResult && (
                        <>
                          <div className="reading-ai-actions">
                            <p className="detail-message">
                              {grammarParseSaveStatus === 'saved'
                                ? `已保存到本地题库${grammarParseResult.savedAt ? ` · ${formatSavedAt(grammarParseResult.savedAt)}` : ''}`
                                : '当前 AI 语法填空解析尚未保存，刷新后会丢失。'}
                            </p>
                            <button
                              className="save-button"
                              type="button"
                              disabled={
                                grammarParseSaveStatus === 'saving' ||
                                grammarParseSaveStatus === 'saved' ||
                                grammarParseStatus === 'loading'
                              }
                              onClick={handleSaveGrammarParseResult}
                            >
                              <Save size={16} />
                              {grammarParseSaveStatus === 'saving'
                                ? '保存中'
                                : grammarParseSaveStatus === 'saved'
                                  ? '已保存'
                                  : '保存 AI 解析'}
                            </button>
                          </div>
                          <p className="detail-message" style={{ marginBottom: 12 }}>
                            {grammarParseResult.parsedCount} / {grammarParseResult.questionCount} 空已解析
                          </p>
                          <p className="detail-message" style={{ marginBottom: 12 }}>
                            Provider: {grammarParseResult.provider ?? 'deepseek'} · 模型: {grammarParseResult.model || DEFAULT_AI_MODEL} ·
                            推理模式: {grammarParseResult.thinkingMode ? '开启' : '关闭'} ·
                            key 来源: {grammarParseResult.keySource === 'env' ? '环境变量 DEEPSEEK_API_KEY' : '右上角输入框'} ·
                            call trace: {grammarParseResult.requestId || '（未返回）'}
                            {(grammarParseResult.keyFingerprint || grammarParseResult.keyMask)
                              ? ` · key 口令: ${grammarParseResult.keyFingerprint || grammarParseResult.keyMask}`
                              : ''}
                            {grammarParseResult.totalLatencyMs ? ` · 全量耗时: ${grammarParseResult.totalLatencyMs} ms` : ''}
                          </p>
                          {grammarParseResult.fullTranslation && (
                            <div className="parse-mapping" style={{ marginBottom: 12 }}>
                              <strong>全文翻译</strong>
                              <p>{grammarParseResult.fullTranslation}</p>
                            </div>
                          )}
                        </>
                      )}

                      {grammarParseSaveStatus === 'error' && <p className="form-error">{grammarParseSaveError}</p>}
                      {grammarParseStatus === 'error' && !grammarParseResult && <p className="form-error">{grammarParseError}</p>}
                    </section>
                  )}

                </>
              )}
            </div>
          ) : (
            <div className="paper-preview">
              <div className="paper-preview-toolbar">
                <button className="back-button" type="button" onClick={backToList}>
                  <ArrowLeft size={16} />
                  返回题组
                </button>
                <span>{versionType === 'student' ? '学生版' : '教师版'}</span>
              </div>

              {previewStatus === 'idle' && basket.length > 0 && (
                <p className="detail-message">点击“预览”读取题组完整内容，生成当前题集版式。</p>
              )}
              {previewStatus === 'loading' && <p className="detail-message">正在生成排版预览...</p>}
              {previewStatus === 'error' && <p className="detail-message error">{previewError}</p>}
              {basket.length === 0 && <p className="empty-state">先把题组加入右侧草稿卷，再生成排版预览。</p>}

              {basket.length > 0 && previewStatus === 'loaded' && (
                <article className="paper-page" aria-label="试卷排版预览">
                  <header className="paper-page-header">
                    <p>English Question Set</p>
                    <h3>{paperTitle.trim() || '未命名题集'}</h3>
                    <div className="paper-meta">
                      <span>{versionType === 'student' ? '学生版' : '教师版'}</span>
                      <span>{basket.length} 题组</span>
                      <span>{totalQuestions} 小题</span>
                      <span>{totalScore.toFixed(1)} 分</span>
                    </div>
                  </header>

                  <PaperBlockCanvas
                    paperBlocks={paperBlocks}
                    basket={basket}
                    previewDetails={previewDetails}
                    versionType={versionType}
                    questionNumberStart={questionNumberStart}
                    selectedPaperBlockId={selectedPaperBlockId}
                    openInsertionIndex={openInsertionIndex}
                    onSelectBlock={paperDraft.setSelectedPaperBlockId}
                    onToggleInsertionSeam={paperDraft.setOpenInsertionIndex}
                    onMoveBlock={movePaperBlock}
                    onRemoveBlock={removePaperBlock}
                    onInsertBlockAt={insertBlockAt}
                    onInsertSectionHeaderBefore={insertSectionHeaderBefore}
                    onInsertPageBreakAfter={insertPageBreakAfter}
                  />
                </article>
              )}
            </div>
          )}
        </section>

        <aside
          className={`basket-panel${homeMode === 'ai' ? ' basket-panel-drawer' : ''}${homeMode === 'ai' && aiBasketDrawerOpen ? ' open' : ''}`}
          aria-label="草稿卷"
          aria-hidden={homeMode === 'ai' && !aiBasketDrawerOpen ? true : undefined}
        >
          {homeMode === 'ai' && (
            <button
              type="button"
              className="basket-drawer-close"
              onClick={() => setAiBasketDrawerOpen(false)}
              aria-label="收起草稿卷"
            >
              ×
            </button>
          )}
          {homeMode === 'classic' && (
          <section className="steward-chat-panel" aria-label="题库管家">
            <div className="panel-heading steward-heading">
              <Sparkles size={18} />
              <div>
                <h2>题库管家</h2>
                <span>DeepSeek Flash 非思考</span>
              </div>
            </div>

            <div className="steward-chat-messages" aria-live="polite">
              {stewardChatMessages.slice(-6).map((message) => (
                <div className={`steward-message ${message.role}`} key={message.id}>
                  {message.content}
                </div>
              ))}
              {questionBankStewardStatus === 'loading' && (
                <div className="steward-message assistant">正在找题...</div>
              )}
            </div>

            {questionBankStewardResult && !questionBankStewardResult.needsClarification && (
              <div className="steward-result-summary">
                <span>已同步左侧列表</span>
                <strong>{questionBankStewardResult.matches.length}</strong>
                <em>个候选</em>
              </div>
            )}
            {questionBankStewardStatus === 'error' && <p className="save-state error">{questionBankStewardError}</p>}

            <form className="steward-chat-form" onSubmit={handleQuestionBankSteward}>
              <input
                value={stewardChatInput}
                onChange={(event) => setStewardChatInput(event.target.value)}
                placeholder="比如：找同样要抽象概括的题"
              />
              <button
                className="steward-submit-button"
                type="submit"
                disabled={questionBankStewardStatus === 'loading' || !stewardChatInput.trim()}
              >
                <Sparkles size={13} />
                发送
              </button>
            </form>
          </section>
          )}

          <div className="panel-heading">
            <ClipboardList size={18} />
            <h2>草稿卷</h2>
          </div>

          <div className="basket-toolbar" aria-label="草稿卷快捷操作">
            <button
              className="detail-button"
              disabled={filteredGroups.length === 0 || filteredGroups.every((group) => basket.some((item) => item.id === group.id))}
              type="button"
              onClick={addFilteredGroupsToBasket}
            >
              <Plus size={15} />
              加入当前筛选
            </button>
            <button className="detail-button" disabled={basket.length === 0} type="button" onClick={clearBasket}>
              <Trash2 size={15} />
              清空
            </button>
          </div>

          <label className="paper-title">
            <span>题集标题</span>
            <input
              value={paperTitle}
              onChange={(event) => {
                setPaperTitle(event.target.value)
                setSaveStatus('idle')
                paperExports.resetExportStatuses()
              }}
            />
          </label>

          <div className="version-toggle" aria-label="版本切换">
            <button
              className={versionType === 'student' ? 'active' : ''}
              type="button"
              onClick={() => {
                setVersionType('student')
                paperExports.resetExportStatuses()
              }}
            >
              学生版
            </button>
            <button
              className={versionType === 'teacher' ? 'active' : ''}
              type="button"
              onClick={() => {
                setVersionType('teacher')
                paperExports.resetExportStatuses()
              }}
            >
              教师版
            </button>
          </div>

          <div className="version-toggle" aria-label="导出样式">
            <button
              className={paperExportStyle === 'exam' ? 'active' : ''}
              type="button"
              onClick={() => setPaperExportStyle('exam')}
            >
              试卷版
            </button>
            <button
              className={paperExportStyle === 'handout' ? 'active' : ''}
              type="button"
              onClick={() => setPaperExportStyle('handout')}
            >
              讲义版
            </button>
          </div>

          <div className="basket-stats">
            <div>
              <strong>{basket.length}</strong>
              <span>题组</span>
            </div>
            <div>
              <strong>{totalQuestions}</strong>
              <span>小题</span>
            </div>
            <div>
              <strong>{totalScore.toFixed(1)}</strong>
              <span>分</span>
            </div>
          </div>

          <div className="basket-list">
            {basket.length === 0 ? (
              <p className="empty-state">从左侧题组列表加入内容，右侧会生成试卷结构。</p>
            ) : (
              basket.map((item, index) => (
                <div className="basket-item" key={item.id}>
                  <div className="basket-index">{index + 1}</div>
                  <div className="basket-content">
                    <strong>{item.title}</strong>
                    <span>{compactGroupMeta(item.groupType, item.questionCount)}</span>
                    <div className="basket-fields">
                      <label>
                        板块
                        <input
                          value={item.sectionTitle}
                          onChange={(event) => updateBasketItem(item.id, 'sectionTitle', event.target.value)}
                        />
                      </label>
                      <label>
                        分值
                        <input
                          min="0.5"
                          step="0.5"
                          type="number"
                          value={item.score}
                          onChange={(event) => updateScore(item.id, Number(event.target.value))}
                        />
                      </label>
                    </div>
                    <label className="basket-note">
                      讲评备注
                      <input
                        value={item.note}
                        placeholder="可选"
                        onChange={(event) => updateBasketItem(item.id, 'note', event.target.value)}
                      />
                    </label>
                  </div>
                  <div className="basket-actions">
                    <button type="button" onClick={() => moveBasketItem(item.id, -1)} aria-label="上移">
                      <ArrowUp size={15} />
                    </button>
                    <button type="button" onClick={() => moveBasketItem(item.id, 1)} aria-label="下移">
                      <ArrowDown size={15} />
                    </button>
                    <button type="button" onClick={() => removeFromBasket(item.id)} aria-label="删除">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Paper Blocks Outline */}
          <details className="paper-blocks-outline" open={paperBlocks.length > 0}>
            <summary>题集大纲 ({paperBlocks.length} 块)</summary>
            <div className="paper-blocks-toolbar">
              <label className="paper-blocks-start-num">
                起始题号
                <input type="number" min="1" value={questionNumberStart} onChange={(e) => setQuestionNumberStart(Math.max(1, Number(e.target.value) || 1))} />
              </label>
              <button className="ghost-button" type="button" onClick={() => insertBlockAt(paperBlocks.length, 'section_header')}>+ 大题标题</button>
              <button className="ghost-button" type="button" onClick={() => insertBlockAt(paperBlocks.length, 'page_break')}>+ 分页</button>
            </div>
            <div className="paper-blocks-list">
              {(() => {
                const numberRanges = computeQuestionNumbers(paperBlocks, questionNumberStart, (gid) => {
                  const detail = previewDetails[gid]
                  const item = basket.find((i) => i.id === gid)
                  return detail?.questions.length ?? item?.questionCount ?? 0
                })
                return paperBlocks.map((block, blockIdx) => {
                  const range = numberRanges[blockIdx]
                  if (block.type === 'section_header') {
                    return (
                      <div className={`paper-block-item section_header`} key={block.id}>
                        <input
                          className="paper-block-title-input"
                          value={block.title}
                          onChange={(e) => updatePaperBlockTitle(block.id, e.target.value)}
                          placeholder="大题标题"
                        />
                        <div className="paper-block-actions">
                          <button type="button" onClick={() => movePaperBlock(block.id, -1)} aria-label="上移"><ArrowUp size={13} /></button>
                          <button type="button" onClick={() => movePaperBlock(block.id, 1)} aria-label="下移"><ArrowDown size={13} /></button>
                          <button type="button" onClick={() => removePaperBlock(block.id)} aria-label="删除"><Trash2 size={13} /></button>
                        </div>
                      </div>
                    )
                  }
                  if (block.type === 'page_break') {
                    return (
                      <div className={`paper-block-item page_break`} key={block.id}>
                        <span className="paper-block-label">分页</span>
                        <div className="paper-block-actions">
                          <button type="button" onClick={() => movePaperBlock(block.id, -1)} aria-label="上移"><ArrowUp size={13} /></button>
                          <button type="button" onClick={() => movePaperBlock(block.id, 1)} aria-label="下移"><ArrowDown size={13} /></button>
                          <button type="button" onClick={() => removePaperBlock(block.id)} aria-label="删除"><Trash2 size={13} /></button>
                        </div>
                      </div>
                    )
                  }
                  // question_group
                  const item = basket.find((i) => i.id === block.questionGroupId)
                  const numLabel = range.startNum != null && range.endNum != null
                    ? (range.startNum === range.endNum ? `${range.startNum}` : `${range.startNum}–${range.endNum}`)
                    : '?'
                  return (
                    <div className={`paper-block-item question_group`} key={block.id}>
                      {item ? (
                        <div className="paper-block-group-info">
                          <strong><span className="paper-block-num">{numLabel}</span> {item.sectionTitle || item.title}</strong>
                          <span>{compactGroupMeta(item.groupType, item.questionCount)} · {block.score} 分/题</span>
                        </div>
                      ) : <span className="paper-block-label">题组未找到</span>}
                      <div className="paper-block-actions">
                        <button type="button" onClick={() => movePaperBlock(block.id, -1)} aria-label="上移"><ArrowUp size={13} /></button>
                        <button type="button" onClick={() => movePaperBlock(block.id, 1)} aria-label="下移"><ArrowDown size={13} /></button>
                        <button type="button" onClick={() => removePaperBlock(block.id)} aria-label="删除"><Trash2 size={13} /></button>
                      </div>
                    </div>
                  )
                })
              })()}
              {paperBlocks.length === 0 && <p className="empty-state">加入题组后自动生成大纲块。</p>}
            </div>
          </details>

          {/* Block Settings Panel */}
          {selectedPaperBlockId && (() => {
            const selBlock = paperBlocks.find((b) => b.id === selectedPaperBlockId)
            if (!selBlock) return null
            if (selBlock.type === 'section_header') {
              return (
                <div className="block-settings-panel">
                  <span className="block-settings-label">大题标题设置</span>
                  <input
                    className="block-settings-input"
                    value={selBlock.title}
                    onChange={(e) => updatePaperBlockTitle(selBlock.id, e.target.value)}
                    placeholder="标题"
                  />
                  <div className="block-settings-actions">
                    <button className="ghost-button" type="button" onClick={() => movePaperBlock(selBlock.id, -1)}>上移</button>
                    <button className="ghost-button" type="button" onClick={() => movePaperBlock(selBlock.id, 1)}>下移</button>
                    <button className="ghost-button" type="button" onClick={() => removePaperBlock(selBlock.id)}>删除</button>
                  </div>
                </div>
              )
            }
            if (selBlock.type === 'page_break') {
              return (
                <div className="block-settings-panel">
                  <span className="block-settings-label">分页设置</span>
                  <div className="block-settings-actions">
                    <button className="ghost-button" type="button" onClick={() => movePaperBlock(selBlock.id, -1)}>上移</button>
                    <button className="ghost-button" type="button" onClick={() => movePaperBlock(selBlock.id, 1)}>下移</button>
                    <button className="ghost-button" type="button" onClick={() => removePaperBlock(selBlock.id)}>删除</button>
                  </div>
                </div>
              )
            }
            // question_group
            const bItem = basket.find((i) => i.id === selBlock.questionGroupId)
            const bDetail = previewDetails[selBlock.questionGroupId]
            const qCount = bDetail?.questions.length ?? bItem?.questionCount ?? 0
            const selectedRanges = computeQuestionNumbers(paperBlocks, questionNumberStart, (gid) => {
              const detail = previewDetails[gid]
              const item = basket.find((i) => i.id === gid)
              return detail?.questions.length ?? item?.questionCount ?? 0
            })
            const selectedRange = selectedRanges.find((range) => range.blockId === selBlock.id)
            const rangeStart = selectedRange?.startNum ?? questionNumberStart
            const rangeEnd = selectedRange?.endNum ?? rangeStart + qCount - 1
            return (
              <div className="block-settings-panel">
                <span className="block-settings-label">题组设置</span>
                <div className="block-settings-meta">
                  <strong>{bItem?.sectionTitle || bItem?.title || '题组'}</strong>
                  <span>题号 {rangeStart}–{rangeEnd} · {qCount} 题</span>
                </div>
                <label className="block-settings-score">
                  每题分值
                  <input
                    type="number"
                    min="0.5"
                    step="0.5"
                    value={selBlock.score}
                    onChange={(e) => updateScore(selBlock.questionGroupId, Number(e.target.value))}
                  />
                </label>
                <div className="block-settings-actions">
                  <button className="ghost-button" type="button" onClick={() => insertSectionHeaderBefore(selBlock.id)}>+标题↑</button>
                  <button className="ghost-button" type="button" onClick={() => movePaperBlock(selBlock.id, -1)}>上移</button>
                  <button className="ghost-button" type="button" onClick={() => movePaperBlock(selBlock.id, 1)}>下移</button>
                  <button className="ghost-button" type="button" onClick={() => insertPageBreakAfter(selBlock.id)}>+分页↓</button>
                  <button className="ghost-button" type="button" onClick={() => removePaperBlock(selBlock.id)}>删除</button>
                </div>
              </div>
            )
          })()}

          <button className="save-button" type="button" disabled={basket.length === 0 || saveStatus === 'saving'} onClick={handleSavePaperSet}>
            <Save size={17} />
            {saveStatus === 'saving' ? '保存中' : lastSavedPaper ? '覆盖保存' : '保存题集'}
          </button>

          {lastSavedPaper && (
            <button
              className="detail-button"
              disabled={basket.length === 0 || saveStatus === 'saving'}
              style={{ marginBottom: 8, width: '100%' }}
              type="button"
              onClick={() => {
                setLastSavedPaper(null)
                setSaveStatus('idle')
              }}
            >
              另存为新题集
            </button>
          )}

          {saveStatus === 'saved' && lastSavedPaper && (
            <p className="save-state success">
              已保存：{lastSavedPaper.title} · {lastSavedPaper.itemCount} 题组 · {lastSavedPaper.totalQuestions} 小题
            </p>
          )}

          {saveStatus === 'error' && <p className="save-state error">{saveError}</p>}

          <section className="saved-paper-panel" aria-label="已保存题集">
            <div className="saved-paper-heading">
              <span>已保存题集</span>
              <strong>{savedPapers.length}</strong>
            </div>

            {savedPapersStatus === 'loading' && <p className="saved-paper-note">读取中...</p>}
            {savedPapersStatus === 'error' && <p className="save-state error">{savedPapersError}</p>}
            {loadPaperStatus === 'error' && <p className="save-state error">{loadPaperError}</p>}
            {loadPaperStatus === 'loaded' && <p className="save-state success">已载入题集到草稿卷。</p>}

            {savedPapersStatus === 'loaded' && savedPapers.length === 0 && (
              <p className="saved-paper-note">保存后的题集会显示在这里。</p>
            )}

            {savedPapers.length > 0 && (
              <div className="saved-paper-list">
                {savedPapers.slice(0, 4).map((paper) => (
                  <button
                    className="saved-paper-item"
                    disabled={loadPaperStatus === 'loading'}
                    key={paper.id}
                    type="button"
                    onClick={() => handleLoadPaperSet(paper.id)}
                  >
                    <strong>{paper.title}</strong>
                    <span>
                      {paper.itemCount} 题组 · {paper.totalQuestions} 小题 · {Number(paper.totalScore).toFixed(1)} 分
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>

          <div className="preview-box">
            <span>预览模式</span>
            <p>
              {versionType === 'student'
                ? '导出时隐藏答案与解析，保留材料、题干、选项和答题区域。'
                : '导出时显示答案与解析，适合课堂讲评和教师备课。'}
            </p>
          </div>

          <button className="preview-button" type="button" disabled={basket.length === 0} onClick={openPreview}>
            排版预览
          </button>

          <button
            className="export-button"
            type="button"
            disabled={basket.length === 0 || paperExports.statuses.docx === 'exporting'}
            onClick={paperExports.exportDocx}
          >
            <FileDown size={18} />
            {paperExports.statuses.docx === 'exporting' ? '导出中' : '导出 DOCX'}
          </button>

          {paperExports.statuses.docx === 'exported' && <p className="save-state success">DOCX 已生成并下载。</p>}
          {paperExports.statuses.docx === 'error' && <p className="save-state error">{paperExports.statuses.docxError}</p>}

          <button
            className="export-button"
            type="button"
            disabled={basket.length === 0 || paperExports.statuses.printPdf === 'exporting'}
            onClick={paperExports.exportPrintPdf}
          >
            <FileDown size={18} />
            {paperExports.statuses.printPdf === 'exporting'
              ? '生成中…'
              : `导出精排 PDF（${versionType === 'student' ? '学生版' : '教师版'}）`}
          </button>
          {paperExports.statuses.printPdf === 'exported' && <p className="save-state success">精排 PDF 已生成并下载。</p>}
          {paperExports.statuses.printPdf === 'error' && <p className="save-state error">{paperExports.statuses.printPdfError}</p>}

          <details className="export-secondary">
            <summary>更多导出格式</summary>
            <button
              className="export-button pdf"
              type="button"
              disabled={basket.length === 0 || paperExports.statuses.pdf === 'exporting'}
              onClick={paperExports.exportPdf}
            >
              <FileDown size={18} />
              {paperExports.statuses.pdf === 'exporting' ? '导出中' : '导出 PDF（LibreOffice 转换）'}
            </button>
            {paperExports.statuses.pdf === 'exported' && <p className="save-state success">PDF 已生成并下载。</p>}
            {paperExports.statuses.pdf === 'error' && <p className="save-state error">{paperExports.statuses.pdfError}</p>}

            <button
              className="export-button"
              type="button"
              disabled={basket.length === 0 || paperExports.statuses.printHtml === 'exporting'}
              onClick={paperExports.exportPrintHtml}
            >
              <FileDown size={18} />
              {paperExports.statuses.printHtml === 'exporting' ? '生成中' : '精排 HTML（用于浏览器打印预览）'}
            </button>
            {paperExports.statuses.printHtml === 'exported' && <p className="save-state success">精排 HTML 已下载。</p>}
            {paperExports.statuses.printHtml === 'error' && <p className="save-state error">{paperExports.statuses.printHtmlError}</p>}
          </details>
        </aside>
      </main>

      {homeMode === 'ai' && !aiBasketDrawerOpen && (
        <button
          type="button"
          className="basket-chip"
          onClick={() => setAiBasketDrawerOpen(true)}
          aria-label={`展开草稿卷，已选 ${basket.length} 个题组`}
        >
          <ClipboardList size={15} />
          <span>已选 {basket.length} 题组</span>
        </button>
      )}
      {homeMode === 'ai' && aiBasketDrawerOpen && (
        <button
          type="button"
          className="basket-drawer-backdrop"
          onClick={() => setAiBasketDrawerOpen(false)}
          aria-label="收起草稿卷"
        />
      )}

      {isEntryOpen && (
        <div className="entry-backdrop" role="presentation">
          <section className="entry-panel" aria-label="录题" role="dialog" aria-modal="true">
            <div className="entry-header">
              <div>
                <p className="eyebrow">Manual Entry</p>
                <h2>{entryMode === 'edit' ? '编辑题组' : '录入题组'}</h2>
              </div>
              <button className="icon-button" type="button" onClick={() => setEntryOpen(false)} aria-label="关闭录题面板">
                <X size={18} />
              </button>
            </div>

            <form className="entry-form" onSubmit={handleEntrySubmit}>
              <fieldset>
                <legend>来源</legend>
                <label className="field">
                  <span>来源类型</span>
                  <select
                    value={entryForm.sourceType}
                    onChange={(event) => updateEntryField('sourceType', event.target.value as SourceType)}
                  >
                    <option value="real_exam">真题</option>
                    <option value="mock_exam">模拟题</option>
                    <option value="self_made">自建</option>
                    <option value="other">其他</option>
                  </select>
                </label>
                <label className="field">
                  <span>年份</span>
                  <input
                    required
                    type="number"
                    value={entryForm.year}
                    onChange={(event) => updateEntryField('year', event.target.value)}
                  />
                </label>
                <label className="field">
                  <span>地区</span>
                  <input required value={entryForm.region} onChange={(event) => updateEntryField('region', event.target.value)} />
                </label>
                <label className="field">
                  <span>卷别/资料名</span>
                  <input
                    required
                    value={entryForm.paperName}
                    onChange={(event) => updateEntryField('paperName', event.target.value)}
                  />
                </label>
                <label className="field">
                  <span>板块</span>
                  <input required value={entryForm.section} onChange={(event) => updateEntryField('section', event.target.value)} />
                </label>
              </fieldset>

              <fieldset>
                <legend>篇章</legend>
                <label className="field wide">
                  <span>篇章标题</span>
                  <input
                    required
                    value={entryForm.passageTitle}
                    onChange={(event) => updateEntryField('passageTitle', event.target.value)}
                  />
                </label>
                <label className="field wide">
                  <span>摘要</span>
                  <textarea
                    required
                    rows={3}
                    value={entryForm.summary}
                    onChange={(event) => updateEntryField('summary', event.target.value)}
                  />
                </label>
                <label className="field">
                  <span>主题</span>
                  <input value={entryForm.theme} onChange={(event) => updateEntryField('theme', event.target.value)} />
                </label>
                <label className="field">
                  <span>语篇类型</span>
                  <input
                    value={entryForm.discourseType}
                    onChange={(event) => updateEntryField('discourseType', event.target.value)}
                  />
                </label>
                <label className="field wide">
                  <span>原文/材料</span>
                  <textarea
                    rows={5}
                    value={entryForm.materialText}
                    onChange={(event) => updateEntryField('materialText', event.target.value)}
                  />
                </label>
              </fieldset>

              <fieldset>
                <legend>题组</legend>
                <label className="field wide">
                  <span>题组标题</span>
                  <input
                    required
                    value={entryForm.groupTitle}
                    onChange={(event) => updateEntryField('groupTitle', event.target.value)}
                  />
                </label>
                <label className="field">
                  <span>题组类型</span>
                  <select
                    value={entryForm.groupType}
                    onChange={(event) => updateEntryField('groupType', event.target.value as GroupType)}
                  >
                    <option value="reading">阅读理解</option>
                    <option value="cloze">完形填空</option>
                    <option value="seven_choices">七选五</option>
                    <option value="grammar_cloze">语法填空</option>
                    <option value="writing">写作</option>
                    <option value="continuation">读后续写</option>
                    <option value="listening">听力</option>
                    <option value="other">其他</option>
                  </select>
                </label>
                <label className="field">
                  <span>难度</span>
                  <select
                    value={entryForm.difficulty}
                    onChange={(event) => updateEntryField('difficulty', event.target.value as Difficulty)}
                  >
                    <option value="low">低</option>
                    <option value="medium">中</option>
                    <option value="high">高</option>
                  </select>
                </label>
                <label className="field">
                  <span>小题数量</span>
                  <input
                    readOnly
                    value={String(entryForm.questions.length)}
                  />
                </label>
                <label className="field">
                  <span>默认分值</span>
                  <input
                    min="0"
                    step="0.5"
                    required
                    type="number"
                    value={entryForm.defaultScore}
                    onChange={(event) => updateEntryField('defaultScore', event.target.value)}
                  />
                </label>
                <label className="field wide">
                  <span>题组说明</span>
                  <input
                    value={entryForm.instruction}
                    onChange={(event) => updateEntryField('instruction', event.target.value)}
                  />
                </label>
              </fieldset>

              <fieldset>
                <legend>小题</legend>
                <div className="question-entry-toolbar wide">
                  <div>
                    <strong>{entryForm.questions.length} 道小题</strong>
                    <span>选项按行录入，如 A. ... / B. ...；非选择题可留空。</span>
                  </div>
                  <button className="detail-button" type="button" onClick={addEntryQuestion}>
                    <Plus size={16} />
                    添加小题
                  </button>
                </div>

                {entryForm.questions.map((question, index) => (
                  <section className="entry-question-card wide" key={index} aria-label={`小题 ${index + 1}`}>
                    <div className="entry-question-title">
                      <strong>小题 {index + 1}</strong>
                      <button
                        className="icon-button"
                        disabled={entryForm.questions.length <= 1}
                        type="button"
                        onClick={() => removeEntryQuestion(index)}
                        aria-label={`删除小题 ${index + 1}`}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>

                    <div className="entry-question-grid">
                      <label className="field">
                        <span>题号</span>
                        <input
                          required
                          value={question.questionNo}
                          onChange={(event) => updateEntryQuestion(index, 'questionNo', event.target.value)}
                        />
                      </label>
                      <label className="field">
                        <span>小题题型</span>
                        <input
                          value={question.questionType}
                          onChange={(event) => updateEntryQuestion(index, 'questionType', event.target.value)}
                        />
                      </label>
                      <label className="field">
                        <span>答案</span>
                        <input
                          value={question.answer}
                          onChange={(event) => updateEntryQuestion(index, 'answer', event.target.value)}
                        />
                      </label>
                      <label className="field wide">
                        <span>题干</span>
                        <textarea
                          required
                          rows={3}
                          value={question.stem}
                          onChange={(event) => updateEntryQuestion(index, 'stem', event.target.value)}
                        />
                      </label>
                      <label className="field wide">
                        <span>选项</span>
                        <textarea
                          rows={4}
                          placeholder={'A. ...\\nB. ...\\nC. ...\\nD. ...'}
                          value={question.optionsText}
                          onChange={(event) => updateEntryQuestion(index, 'optionsText', event.target.value)}
                        />
                      </label>
                      <label className="field wide">
                        <span>解析</span>
                        <textarea
                          rows={3}
                          value={question.explanation}
                          onChange={(event) => updateEntryQuestion(index, 'explanation', event.target.value)}
                        />
                      </label>
                    </div>
                  </section>
                ))}
              </fieldset>

              <fieldset>
                <legend>标签</legend>
                <label className="field wide">
                  <span>标签</span>
                  <input
                    placeholder="用逗号分隔，如 真实生活，兴趣驱动"
                    value={entryForm.tags}
                    onChange={(event) => updateEntryField('tags', event.target.value)}
                  />
                </label>
              </fieldset>

              {entryStatus === 'error' && <p className="form-error">{entryError}</p>}

              <div className="entry-footer">
                <button className="ghost-button" type="button" onClick={() => setEntryOpen(false)}>
                  取消
                </button>
                <button className="primary-button" type="submit" disabled={entryStatus === 'saving'}>
                  {entryStatus === 'saving' ? '保存中' : entryMode === 'edit' ? '保存修改' : '保存题组'}
                </button>
              </div>
            </form>
          </section>
        </div>
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

                  {aiEnhancementTargets.length > 0 && (
                    <div className="ai-enhancement-panel" aria-label="AI 增强面板">
                      <div className="ai-enhancement-head">
                        <div>
                          <strong>AI增强</strong>
                          <span>
                            已入库 {aiEnhancementTargets.length} 组 · 模型 {aiModel} · 推理
                            {aiThinkingMode ? '开启' : '关闭'}
                          </span>
                        </div>
                        <button
                          className="add-button"
                          type="button"
                          disabled={aiEnhancementRunStatus === 'running'}
                          onClick={handleRunAiEnhancement}
                        >
                          <Sparkles size={16} />
                          {aiEnhancementRunStatus === 'running' ? 'AI增强中' : '开始 AI增强'}
                        </button>
                      </div>

                      <div className="ai-enhancement-options" aria-label="AI 增强项目">
                        {aiEnhancementTasks.map((task) => (
                          <label className="checkbox-field compact" key={task.key}>
                            <input
                              checked={aiEnhancementSelection[task.key]}
                              disabled={aiEnhancementRunStatus === 'running'}
                              type="checkbox"
                              onChange={() => toggleAiEnhancementTask(task.key)}
                            />
                            <span>{task.label}</span>
                            <em>{task.description}</em>
                          </label>
                        ))}
                      </div>

                      {aiEnhancementRunStatus === 'done' && (
                        <span className="writeback-result">AI增强已处理完成。</span>
                      )}
                      {aiEnhancementRunStatus === 'error' && <span className="form-error compact">{aiEnhancementError}</span>}

                      <div className="ai-enhancement-target-list">
                        {aiEnhancementTargets.map((target) => (
                          <article className="ai-enhancement-target" key={target.id}>
                            <div className="ai-enhancement-target-head">
                              <div>
                                <strong>{target.title}</strong>
                                <span>
                                  {groupTypeLabel[target.groupType]} · {target.questionCount} 小题
                                </span>
                              </div>
                              <button className="detail-button" type="button" onClick={() => openDetail(target.id)}>
                                查看
                              </button>
                            </div>
                            <div className="ai-enhancement-task-list">
                              {aiEnhancementTasks.map((task) => {
                                const taskState =
                                  aiEnhancementStatus[target.id]?.[task.key] || createEmptyAiEnhancementTaskState()
                                return (
                                  <div className={`ai-enhancement-task ${taskState.status}`} key={task.key}>
                                    <span>{aiEnhancementTaskLabel[task.key]}</span>
                                    <strong>{aiEnhancementTaskStatusLabel[taskState.status]}</strong>
                                    {taskState.message ? <small>{taskState.message}</small> : null}
                                  </div>
                                )
                              })}
                            </div>

                            {(aiEnhancementTopicCandidates[target.id] || []).length > 0 && (
                              <div className="topic-label-candidates ai-enhancement-topic-candidates">
                                {(aiEnhancementTopicCandidates[target.id] || []).map((topicLabel) => (
                                  <label className="topic-label-option" key={topicLabel.label}>
                                    <input
                                      type="checkbox"
                                      checked={(aiEnhancementSelectedTopicValues[target.id] || []).includes(topicLabel.label)}
                                      onChange={() => toggleAiEnhancementTopicLabelSelection(target.id, topicLabel.label)}
                                    />
                                    <span>{topicLabel.label}</span>
                                    {topicLabel.confidence !== undefined && topicLabel.confidence > 0 ? (
                                      <em>{Math.round(topicLabel.confidence * 100)}%</em>
                                    ) : null}
                                    {topicLabel.reason ? <small>{topicLabel.reason}</small> : null}
                                  </label>
                                ))}
                                <button
                                  className="save-button"
                                  type="button"
                                  disabled={
                                    aiEnhancementTopicBindStatus[target.id] === 'saving' ||
                                    (aiEnhancementSelectedTopicValues[target.id] || []).length === 0
                                  }
                                  onClick={() => handleBindAiEnhancementTopicLabels(target.id)}
                                >
                                  <Save size={16} />
                                  {aiEnhancementTopicBindStatus[target.id] === 'saving'
                                    ? '绑定中'
                                    : aiEnhancementTopicBindStatus[target.id] === 'saved'
                                      ? '已绑定'
                                      : '绑定选中标签'}
                                </button>
                                {aiEnhancementTopicBindStatus[target.id] === 'error' && (
                                  <span className="form-error compact">{aiEnhancementTopicBindError[target.id]}</span>
                                )}
                              </div>
                            )}
                          </article>
                        ))}
                      </div>
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
