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
  paperSurfaceLabel?: string | null
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
  // draft-student-field (E4): optional owner-facing "whose one-on-one session"
  // metadata. Free text, nullable, never renders onto the paper face (print/DOCX
  // never read this field — see docs/cuts/draft-student-field/plan.md).
  studentLabel: string | null
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
  // True when the referenced question group no longer exists in the shared bank
  // database (e.g. dropped by a bank-file replacement). The item is still listed and
  // deletable, but is excluded from print/export — see ADR-0011 orphan tolerance.
  groupMissing: boolean
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
  // draft-student-field (E4): live-joined from the source draft's studentLabel;
  // empty string once the source draft is gone or was never labeled.
  sourceDraftStudentLabel: string
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

// ─── similar-rail (E2) — response types for POST /api/similar-questions,
// consumed read-only by app/src/services/similarQuestions.ts. Shape mirrors
// server/search/similarQuestions.mjs's findSimilar() return value verbatim
// (see docs/cuts/similar-engine/qa/*-seed-response.json for real examples).

/** Every `reason.kind` the engine currently emits (similarQuestions.mjs
 * RECIPES). Not all kinds are rendered as chips — see SimilarQuestionsRailView
 * for the SW-1 constant-discourse suppression. */
export type SimilarQuestionReasonKind =
  | 'facet-density'
  | 'topic-match'
  | 'pos-density'
  | 'secondary'
  | 'position-proxy'
  | 'topic-diff'

export type SimilarQuestionReason = {
  kind: SimilarQuestionReasonKind
  label: string
}

export type SimilarQuestionResult = {
  groupId: string
  paperId: string | null
  title: string
  sourceLabel: string
  score: number
  reasons: SimilarQuestionReason[]
  /** SW-2 (E1 CR): may be empty even for a highly-ranked candidate — never
   * assume non-empty. */
  matchedQuestionIds: string[]
}

export type SimilarQuestionsSeedProfile = {
  groupType: string
  facets: Array<{ key: string; values: Array<string | number> }>
  topicLabels: string[]
}

export type SimilarQuestionsResponse = {
  seedProfile: SimilarQuestionsSeedProfile
  results: SimilarQuestionResult[]
  poolStats: { totalInPool: number; returned: number }
}
