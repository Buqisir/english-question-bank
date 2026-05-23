export type Difficulty = 'low' | 'medium' | 'high'

export type SourceType = 'real_exam' | 'mock_exam' | 'self_made' | 'other'

export type GroupType =
  | 'reading'
  | 'cloze'
  | 'seven_choices'
  | 'grammar_cloze'
  | 'writing'
  | 'continuation'
  | 'listening'
  | 'other'

export type VersionType = 'student' | 'teacher'

export type ImportFileType = 'docx' | 'pdf' | 'image' | 'other'

export type ImportFileStatus = 'imported' | 'parsed' | 'reviewed' | 'archived'

export type ImportContentRole = 'question' | 'answer_analysis' | 'question_with_analysis' | 'other'

export type ImportBundleReadiness =
  | 'single_file_ready'
  | 'paired_files_ready'
  | 'missing_analysis'
  | 'missing_question'
  | 'reference_only'

export type QuestionGroupCard = {
  id: string
  title: string
  source: string
  sourceType: SourceType
  year: number
  region: string
  paperName: string
  section: string
  passageTitle: string
  summary: string
  groupType: GroupType
  questionCount: number
  difficulty: Difficulty
  tags: string[]
  topicLabels: TopicLabel[]
  hit: string
  answerPreview: string
  defaultScore: number
  hasPaperSurfaceAnalysis?: boolean
  paperSurfaceHref?: string | null
  canAddToDraftPaper: boolean
  draftPaperButtonState: 'add' | 'in_current_draft' | 'disabled'
  currentDraftPaperId: string | null
  printUnavailableReason: string | null
}

export type TopicLabel = {
  id?: string
  label: string
  theme: string
  themeGroup: string
  subtopic: string
  source?: string
  reason?: string
  confidence?: number
  createdAt?: string
  updatedAt?: string
}

export type QuestionOption = {
  id: string
  label: string
  content: string
  displayOrder: number
}

export type QuestionDetail = {
  id: string
  questionNo: string
  questionType: string
  stem: string
  answer: string
  explanation: string
  difficulty: Difficulty
  aiDifficultyScore?: number | null
  teacherDifficulty?: number | null
  difficultyOverrideReason?: string
  difficultyOverrideNote?: string
  difficultyTaggedAt?: string
  score: number
  displayOrder: number
  note: string
  options: QuestionOption[]
}

export type QuestionGroupDetail = QuestionGroupCard & {
  instruction: string
  note: string
  sourceDetail: {
    id: string
    publisher: string
    originalUrl: string
    fileRef: string
    note: string
  }
  passage: {
    id: string
    title: string
    materialText: string
    summary: string
    theme: string
    discourseType: string
    wordCount: number | null
    note: string
  }
  questions: QuestionDetail[]
  readingParseResult?: ReadingParseQuestionGroupResult | null
  readingVerifyResult?: VerifyQuestionGroupResult | null
  clozeParseResult?: ClozeParseQuestionGroupResult | null
  sevenChoicesParseResult?: SevenChoicesParseQuestionGroupResult | null
  grammarParseResult?: GrammarParseQuestionGroupResult | null
}

export type BasketItem = QuestionGroupCard & {
  score: number
  sectionTitle: string
  note: string
}

export type DraftPaperSummary = {
  id: string
  title: string
  subject: string
  status: 'active' | 'deleted'
  isCurrent: boolean
  itemCount: number
  totalQuestions: number
  createdAt: string
  updatedAt: string
  lastPrintedAt: string | null
}

export type DraftPaperItem = {
  id: string
  draftPaperId: string
  groupId: string
  sourcePaperId: string
  orderIndex: number
  pageBreakBefore: boolean
  printReady: boolean
  printUnavailableReason: string | null
  questionGroup: QuestionGroupCard | null
  createdAt: string
  updatedAt: string
}

export type DraftPaper = DraftPaperSummary & {
  items: DraftPaperItem[]
  pageBreakSuggestions: Array<{
    itemId: string
    groupId: string
    reason: string
  }>
  printHtml: string
}

export type MySpaceFolder = {
  id: string
  name: string
  artifactCount: number
  createdAt: string
  updatedAt: string
}

export type MySpaceArtifact = {
  id: string
  folderId: string | null
  title: string
  fileName: string
  fileUrl: string
  artifactType: 'student-paper'
  sourceDraftPaperId: string
  sourceDraftTitle: string
  sourceDraftExists: boolean
  pageCount: number
  generatedAt: string
  createdAt: string
  updatedAt: string
}

export type CreateQuestionGroupInput = {
  sourceType: SourceType
  year: number
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
  defaultScore: number
  questionCount: number
  questionType: string
  questionStem: string
  answer: string
  explanation: string
  questions: Array<{
    questionNo: string
    questionType: string
    stem: string
    answer: string
    explanation: string
    difficulty?: Difficulty
    score?: number
    note?: string
    options: Array<{
      label: string
      content: string
    }>
  }>
  tags: string[]
}

export type UpdateQuestionGroupInput = CreateQuestionGroupInput

export type ImportFileRecord = {
  id: string
  originalName: string
  storedPath: string
  fileType: ImportFileType
  contentRole: ImportContentRole
  bundleId: string
  bundleTitle: string
  status: ImportFileStatus
  sourceId: string
  note: string
  createdAt: string
  parse: ImportFileParseSummary | null
}

export type CreateImportFileInput = {
  fileName: string
  mimeType: string
  dataBase64: string
  contentRole: ImportContentRole
  bundleId?: string
  bundleTitle?: string
  note?: string
}

export type ImportFileParseSummary = {
  id: string
  status: 'succeeded' | 'failed'
  parser: string
  lineCount: number
  charCount: number
  preview: string
  errorMessage: string
  updatedAt: string
}

export type ImportFileParseResult = ImportFileParseSummary & {
  importFileId: string
  extractedText: string
  createdAt: string
}

export type ImportBundle = {
  id: string
  title: string
  fileCount: number
  parsedCount: number
  failedParseCount: number
  totalLineCount: number
  totalCharCount: number
  latestCreatedAt: string
  readiness: ImportBundleReadiness
  qualityWarnings: string[]
  roleCounts: {
    question: number
    answerAnalysis: number
    questionWithAnalysis: number
    other: number
  }
  files: ImportFileRecord[]
}

export type ImportBatchStatus = 'scanned' | 'importing' | 'imported' | 'partial' | 'failed'

export type ImportBatchItemStatus = 'queued' | 'unsupported' | 'imported' | 'parsed' | 'skipped' | 'failed'

export type ImportBatchItem = {
  id: string
  batchId: string
  fileName: string
  filePath: string
  fileType: ImportFileType
  fileSize: number
  contentRole: ImportContentRole
  bundleId: string
  bundleTitle: string
  importFileId: string
  status: ImportBatchItemStatus
  errorMessage: string
  createdAt: string
  updatedAt: string
}

export type ImportBatch = {
  id: string
  title: string
  directoryPath: string
  recursive: boolean
  contentRole: ImportContentRole
  status: ImportBatchStatus
  fileCount: number
  supportedCount: number
  importedCount: number
  parsedCount: number
  failedCount: number
  errorMessage: string
  createdAt: string
  updatedAt: string
  items: ImportBatchItem[]
}

export type CreateImportBatchInput = {
  directoryPath: string
  title?: string
  recursive?: boolean
  contentRole: ImportContentRole
}

export type RunImportBatchInput = {
  parseDocx?: boolean
  limit?: number
}

export type ImportDraftOption = {
  label: string
  content: string
}

export type ImportDraftQuestion = {
  questionNo: string
  questionType: string
  stem: string
  answer: string
  explanation: string
  score: number
  options: ImportDraftOption[]
  rawText: string
  confidence: number
}

export type ImportDraftGroup = {
  id: string
  sourceItemNo: string
  sectionTitle: string
  groupType: GroupType
  title: string
  instruction: string
  materialText: string
  questionCount: number
  totalScore: number
  confidence: number
  warnings: string[]
  questions: ImportDraftQuestion[]
}

export type ImportBundleDraft = {
  id: string
  bundleId: string
  title: string
  source: {
    sourceType: SourceType
    year: number
    region: string
    paperName: string
  }
  generatedAt: string
  sourceFiles: Array<{
    id: string
    originalName: string
    contentRole: ImportContentRole
    parser: string
    lineCount: number
    charCount: number
  }>
  answerFiles?: Array<{
    id: string
    originalName: string
    contentRole: ImportContentRole
    parser: string
    lineCount: number
    charCount: number
  }>
  answerMatchedQuestionCount?: number
  groupCount: number
  questionCount: number
  warnings: string[]
  groups: ImportDraftGroup[]
}

export type ImportAnswerAlignmentMatch = {
  questionId: string
  questionNo: string
  stem: string
  currentAnswer: string
  currentExplanation: string
  proposedAnswer: string
  proposedExplanation: string
  rawText: string
  confidence: number
  answerDiffers: boolean
  status: 'matched' | 'missing'
}

export type ImportAnswerAlignmentGroup = {
  id: string
  questionGroupId: string
  title: string
  sourceItemNo: string
  groupType: GroupType
  questionCount: number
  matchedCount: number
  confidence: number
  warnings: string[]
  matches: ImportAnswerAlignmentMatch[]
}

export type ImportAnswerAlignmentDraft = {
  id: string
  bundleId: string
  title: string
  generatedAt: string
  sourceFiles: Array<{
    id: string
    originalName: string
    contentRole: ImportContentRole
    parser: string
    lineCount: number
    charCount: number
  }>
  targetGroupCount: number
  matchedGroupCount: number
  matchedQuestionCount: number
  warnings: string[]
  groups: ImportAnswerAlignmentGroup[]
}

export type ApplyAnswerAlignmentResult = {
  bundleId: string
  questionGroupId: string
  overwrite: boolean
  targetGroupCount: number
  matchedQuestionCount: number
  updatedQuestionCount: number
  updatedAnswerCount: number
  updatedExplanationCount: number
  skippedExistingCount: number
  missingQuestionCount: number
}

export type CreatePaperSetInput = {
  id?: string
  title: string
  description?: string
  items: Array<{
    questionGroupId: string
    score: number
    sectionTitle?: string
    note?: string
  }>
  layout?: PaperSetLayout | null
}

export type PaperSetLayout = {
  blocks: PaperBlock[]
  questionNumberStart: number
  printStyle: 'exam' | 'handout'
}

export type ExportDocxInput = {
  title: string
  versionType: VersionType
  printStyle?: 'exam' | 'handout'
  items: Array<{
    questionGroupId: string
    score: number
    sectionTitle?: string
    note?: string
  }>
  questionNumberStart?: number
  blocks?: PaperExportBlock[]
}

export type PaperExportBlock =
  | { type: 'section_header'; title: string }
  | { type: 'page_break' }
  | { type: 'question_group'; questionGroupId: string; score: number; sectionTitle?: string; note?: string }

export type PaperBlock =
  | { id: string; type: 'section_header'; title: string }
  | { id: string; type: 'page_break' }
  | { id: string; type: 'question_group'; questionGroupId: string; score: number }

export type ExportDocxResult = {
  blob: Blob
  fileName: string
}

export type ExportPdfInput = ExportDocxInput

export type ExportPdfResult = ExportDocxResult

export type PaperSetSummary = {
  id: string
  title: string
  itemCount: number
  totalQuestions: number
  totalScore: number
  createdAt?: string
  updatedAt?: string
}

export type PaperSetItem = {
  id: string
  itemType: 'question_group' | 'question'
  itemId: string
  displayOrder: number
  score: number
  sectionTitle: string
  note: string
  questionGroup?: QuestionGroupCard
}

export type PaperSetDetail = PaperSetSummary & {
  items: PaperSetItem[]
  layout?: PaperSetLayout | null
  layoutWarnings?: string[]
}

export type PaperWorkflowStatus =
  | 'not_started'
  | 'needs_parse'
  | 'ready_to_commit'
  | 'needs_review'
  | 'ready_to_paper'
  | 'ready_to_export'
  | 'closed_loop'

export type PaperWorkflowExportFile = {
  exists: boolean
  fileName: string
  outputPath: string
  verified: boolean
}

export type PaperWorkflow = {
  id: string
  title: string
  objectivePaperTitle: string
  bundleId: string
  updatedAt: string
  status: PaperWorkflowStatus
  statusLabel: string
  nextAction: string
  importFiles: {
    fileCount: number
    parsedCount: number
    failedParseCount: number
    readiness: ImportBundleReadiness
    roleCounts: ImportBundle['roleCounts']
    qualityWarnings: string[]
  }
  bank: {
    objectiveGroupCount: number
    expectedObjectiveGroupCount: number
    objectiveQuestionCount: number
    missingAnswerCount: number
    missingOptionGroupCount: number
    completedSections: string[]
    missingSections: string[]
    groups: Array<{
      id: string
      title: string
      groupType: GroupType
      defaultScore: number
      questionCount: number
      missingAnswerCount: number
      missingOptionQuestionCount: number
    }>
  }
  paperSet: PaperSetSummary | null
  exports: {
    studentDocx: PaperWorkflowExportFile
    teacherDocx: PaperWorkflowExportFile
  }
}

export const difficultyLabel: Record<Difficulty, string> = {
  low: '低',
  medium: '中',
  high: '高',
}

export const sourceTypeLabel: Record<SourceType, string> = {
  real_exam: '真题',
  mock_exam: '模拟题',
  self_made: '自建',
  other: '其他',
}

export const groupTypeLabel: Record<GroupType, string> = {
  reading: '阅读理解',
  cloze: '完形填空',
  seven_choices: '七选五',
  grammar_cloze: '语法填空',
  writing: '写作',
  continuation: '读后续写',
  listening: '听力',
  other: '其他',
}

export type VerifyVerdict = 'correct' | 'answer_wrong' | 'explanation_wrong' | 'both_wrong' | 'uncertain' | 'skipped'

export type VerifyResult = {
  questionId: string
  questionNo: string
  verdict: VerifyVerdict
  reason: string
  correctAnswer?: string
  apiCall?: boolean
  apiLatencyMs?: number
}

export type VerifyQuestionGroupResult = {
  questionGroupId: string
  title: string
  questionCount: number
  verifiedCount: number
  results: VerifyResult[]
  allApiCalled?: number
  totalLatencyMs?: number
  calledCount?: number
  keyFingerprint?: string
  keyMask?: string
  model?: string
  thinkingMode?: boolean
  keySource?: string
  requestId?: string
  requestMs?: number
  provider?: string
}

export type ReadingParseArticleAnalysis = {
  framework?: string
  summary?: string
  keyChunks?: Array<{ chunk: string; pos: string; phonetic: string; reason: string }>
}

export type ReadingParseSynonymDifficulty = {
  cardId: string
  name: string
  soloLevel: string
  higherOrderThinking: string
  difficultyDefault: number
  confidence: number
  sourceExpression: string
  optionExpression: string
  reason: string
  boundaryCheck?: string
  studentBlocker: string
  teachingMove: string
  reviewNeeded: boolean
  boundaryFlags: string[]
  evidenceSource?: string
}

export type ReadingParseSurfaceQuestion = {
  type: string
  scope?: string
  answeringMove: string
  reason?: string
}

export type ReadingParseDifficultyProfile = {
  vocabLoad?: {
    starWordDensity?: {
      passage?: string
      answerPath?: string
      options?: string
    }
    blockerWords?: Array<{
      word: string
      position?: string
      role?: string
      reason?: string
    }>
    level?: string
  }
  syntaxLoad?: {
    level?: string
    evidenceSentence?: string
    reason?: string
  }
  infoSpan?: {
    level?: string
    source?: string
    evidence?: string
  }
  reasoningAbstraction?: string
  distractorStrength?: string
  topicAbstractness?: string
  mainBlockers?: string[]
  finalScore?: number
  finalLabel?: string
  reason?: string
}

export type ReadingParseQuestionGroupResult = {
  questionGroupId: string
  title: string
  passageSummary?: string
  questionCount: number
  parsedCount: number
  matchedCount: number
  unmatchedQuestionNos: string[]
  articleAnalysis?: ReadingParseArticleAnalysis | null
  questions: Array<{
    questionNo: string
    questionType?: string
    surfaceQuestion?: ReadingParseSurfaceQuestion | null
    questionTranslation?: string
    strategy?: string
    locationSentence?: string
    locationSentenceTranslation?: string
    answerSentence?: string
    answer?: string
    explanation?: string
	    distractorAnalysis?: Array<{ option: string; type: string; reason: string }>
	    synonymMappings?: Array<{ text: string; replacement: string }>
	    synonymDifficulty?: ReadingParseSynonymDifficulty | null
	    difficultyProfile?: ReadingParseDifficultyProfile | null
	    languageFeatures?: string
	  }>
  keySource?: string
  keyFingerprint?: string
  keyMask?: string
  requestId?: string
  requestMs?: number
  model?: string
  thinkingMode?: boolean
  provider?: string
  totalLatencyMs?: number
  savedAt?: string
  savedResultId?: string
  allApiCalled?: number
  calledCount?: number
}

export type SynonymDifficultyCardId =
  | 'T1'
  | 'T2'
  | 'T3'
  | 'T4'
  | 'T5'
  | 'T6'
  | 'T7'
  | 'T8'
  | 'T9'
  | 'T10'

export type SynonymDifficultyQuestionResult = {
  questionId: string
  questionNo: string
  cardId: SynonymDifficultyCardId
  name: string
  soloLevel: string
  higherOrderThinking: string
  difficultyDefault: number
  confidence: number
  reviewNeeded: boolean
  boundaryFlags: string[]
  deepSeekRecommended: boolean
  deepSeekTriggers: string[]
  candidateCards: SynonymDifficultyCardId[]
  routeReasons: string[]
  reason: string
  sourceExpression: string
  optionExpression: string
  evidenceSource?: string
  provider: string
  model: string
  latencyMs?: number
  retryCount?: number
  rawCardId?: string
  invalidCardId?: boolean
}

export type SynonymDifficultyQuestionGroupResult = {
  questionGroupId: string
  title: string
  questionCount: number
  classifiedCount: number
  reviewNeededCount: number
  deepSeekRecommendedCount: number
  provider: string
  model: string
  keySource: 'local' | string
  requestId: string
  knowledgeVersion: string
  totalLatencyMs?: number
  results: SynonymDifficultyQuestionResult[]
}

export type GrammarParseQuestion = {
  questionNo: string
  answer: string
  hintMeaning: string
  analysis: string
  sentenceTranslation: string
}

export type ClozeParseQuestion = {
  questionNo: string
  answer: string
  answerText: string
  answerMeaning: string
  analysis: string
  distractorAnalysis: Array<{ option: string; text: string; reason: string }>
}

export type ClozeParseQuestionGroupResult = {
  questionGroupId: string
  title: string
  questionCount: number
  parsedCount: number
  answerLine: string
  storyTitle: string
  storySummary: string
  condensedStory: string
  questions: ClozeParseQuestion[]
  keySource?: string
  keyFingerprint?: string
  keyMask?: string
  requestId?: string
  model?: string
  thinkingMode?: boolean
  provider?: string
  totalLatencyMs?: number
  savedAt?: string
}

export type SevenChoicesParseQuestion = {
  questionNo: string
  answer: string
  optionText: string
  optionTranslation: string
  positionContext: string
  analysis: string
}

export type SevenChoicesParseQuestionGroupResult = {
  questionGroupId: string
  title: string
  questionCount: number
  parsedCount: number
  answerLine: string
  articleSummary: string
  questions: SevenChoicesParseQuestion[]
  keySource?: string
  keyFingerprint?: string
  keyMask?: string
  requestId?: string
  model?: string
  thinkingMode?: boolean
  provider?: string
  totalLatencyMs?: number
  savedAt?: string
}

export type GrammarParseQuestionGroupResult = {
  questionGroupId: string
  title: string
  questionCount: number
  parsedCount: number
  fullTranslation: string
  questions: GrammarParseQuestion[]
  keySource?: string
  keyFingerprint?: string
  keyMask?: string
  requestId?: string
  model?: string
  thinkingMode?: boolean
  provider?: string
  totalLatencyMs?: number
  savedAt?: string
}

export const verdictLabel: Record<VerifyVerdict, string> = {
  correct: '正确',
  answer_wrong: '答案错误',
  explanation_wrong: '解析有误',
  both_wrong: '答案和解析均误',
  uncertain: '不确定',
  skipped: '已跳过',
}
