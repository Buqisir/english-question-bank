import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { buildPrintHtml } from './print-renderer.mjs'
import { createDraftPaperRoutes } from './draft-paper/draftPaperRoutes.mjs'
import { createDraftPaperStore } from './draft-paper/draftPaperStore.mjs'
import { createExportImplementation } from './exports/exportImplementation.mjs'
import { createDocxRenderer } from './exports/docxRenderer.mjs'
import { createExportRoutes } from './exports/exportRoutes.mjs'
import { createCanonicalConsumerRuntime } from './paper-canonical/consumerRuntime.mjs'
import { createPaperCanonicalConsumerRoutes } from './paper-canonical/consumerRoutes.mjs'
import { ensurePaperImportDatabaseShape } from './paper-import/publisher.mjs'
import { cleanupPaperImportTempArtifacts, listPaperAssetVersions, resolvePaperAssetReadPaths } from './paper-import/storage.mjs'
import { createQuestionGroupRoutes } from './question-bank/questionGroupRoutes.mjs'
import { createPaperSetRoutes } from './paper-sets/routes.mjs'
import { createAiProxyRoutes } from './ai-proxy/routes.mjs'
import { defineRoute, readJsonRouteBody, runRoutes } from './router/index.mjs'
import { ensureMySpaceDatabaseShape, ensureMySpaceFilesRoot } from './my-space/mySpace.mjs'
import { createMySpaceRoutes } from './my-space/mySpaceRoutes.mjs'
import { countUsers, ensureAuthDatabaseShape, readSession, readSessionTokenFromRequest, renewSession, resolveDataUserId, sessionNeedsRenewal } from './auth/auth.mjs'
import { createAuthRoutes } from './auth/authRoutes.mjs'
import { createPaperSurfaceAnalysisAvailability } from './search/paperSurfaceAvailability.mjs'
import { createTeachingFacetIndex, createTeachingFacetRoutes } from './search/teachingFacets.mjs'
import { createSimilarQuestionsStore, createSimilarQuestionsRoutes } from './search/similarQuestions.mjs'
import { createTopicLabelBackfillRoutes } from './topic-labels/topicLabelBackfillRoutes.mjs'
import { parseJsonFromString, getDeepSeekMessageText, collectDeepSeekMessageTexts, parseLooseVerifyResult, extractVerifyResultFromPayload, extractReadingParsePayloadFromPayload, extractFirstJson, safeTruncate } from './ai-providers/jsonExtraction.mjs'
import { createCompletionRunner } from './ai-providers/completionRunner.mjs'
import { createDailyLimitCounter, resolveDailyLimit } from './ai-providers/dailyLimitCounter.mjs'
import { createVerifyImplementation } from './ai-verify/verifyQuestionGroupService.mjs'
import { createReadingDifficultyNormalizer, isEntityPurposeMentionStem } from './reading-analysis/readingDifficultyNormalizer.mjs'
import { createSemanticSearchImplementation } from './search/semanticSearchService.mjs'
import { createQuestionBankStewardImplementation } from './search/questionBankStewardService.mjs'
import { createSynonymDifficultyImplementation, loadSynonymDifficultyKnowledge, normalizeSynonymCardId, normalizeSynonymConfidence, normalizeSynonymBoolean, uniqueSynonymFlags, formatSynonymDifficultyKnowledgeForReadingPrompt } from './ai-parse/synonymDifficultyService.mjs'
import { createQuestionGroupParseImplementation } from './ai-parse/questionGroupParseService.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const dbPath = process.env.QUESTION_BANK_DB || path.join(rootDir, 'data/question-bank.sqlite')
const userDataDbPath = process.env.USER_DATA_DB || path.join(rootDir, 'data/user-data.sqlite')
const exportDir = path.join(rootDir, 'exports')
const paperAssetsDir = process.env.QUESTION_BANK_PAPER_ASSET_ROOT || path.join(rootDir, 'app/public/paper-assets')
const userSpaceFilesDir = process.env.QUESTION_BANK_USER_SPACE_ROOT || path.join(rootDir, 'data/user-space/files')
const promptsDir = path.join(__dirname, 'prompts')
const verifyAuditLogPath = path.join(rootDir, 'server', 'logs', 'verify-audit.log')
const port = Number(process.env.QUESTION_BANK_API_PORT || 8787)
const paperSurfaceAnalysisAvailability = createPaperSurfaceAnalysisAvailability({ paperAssetsDir })
const teachingFacetIndex = createTeachingFacetIndex({ paperAssetsDir })
const similarQuestionsStore = createSimilarQuestionsStore({ getTeachingFacetIndex, paperAssetsDir })
const exportImplementation = createExportImplementation({
  rootDir,
  exportDir,
  getQuestionGroupDetail,
  buildDocumentXml,
  writeDocxPackage,
  buildPrintHtml,
  convertDocxToPdf,
  // figure-render cut: threaded through so exportDocx/exportPrintHtml/
  // exportPrintPdf can resolve each group's figures/manifest.json —
  // optional, defaults to null in createExportImplementation.
  paperAssetsDir,
  resolveCanonicalConsumption,
})
const serverContext = {
  rootDir,
  dbPath,
  exportDir,
  paperAssetsDir,
  userSpaceFilesDir,
  localQwenEnabled: process.env.QUESTION_BANK_ENABLE_LOCAL_QWEN === '1',
  openDatabase,
  openUserDatabase,
  readJsonBody,
  loadCanonicalConsumption,
  sendPdf: exportImplementation.sendPdf,
  sendJson,
  bindTopicLabelsToQuestionGroup,
  createPaperSet,
  createQuestionGroup,
  deleteQuestionGroup,
  generateQuestionGroupSummary,
  generateSynonymDifficultyByQuestionGroup,
  generateTopicLabelsByQuestionGroup,
  getPaperSet,
  getQuestionGroupDetail,
  getPaperSurfaceAnalysisAvailabilityByGroupId,
  getTeachingFacetIndex,
  invalidatePaperSurfaceAnalysisAvailability,
  invalidateTeachingFacetIndex,
  similarQuestionsStore,
  listPaperSets,
  listQuestionGroups,
  listUnlabeledGroupIds,
  parseClozeByQuestionGroup,
  parseGrammarByQuestionGroup,
  parseReadingByQuestionGroup,
  parseSevenChoicesByQuestionGroup,
  saveClozeParseResult,
  saveGrammarParseResult,
  saveQuestionDifficultyRating,
  saveReadingParseResult,
  saveSevenChoicesParseResult,
  updateQuestionGroup,
}
const h1Routes = [
  defineRoute('GET', /^\/api\/health$/, ({ response, context }) => {
    context.sendJson(response, 200, { ok: true, dbPath: context.dbPath })
  }),
]
const groupTypeLabels = {
  reading: '阅读理解',
  cloze: '完形填空',
  seven_choices: '七选五',
  grammar_cloze: '语法填空',
  writing: '写作',
  continuation: '读后续写',
  listening: '听力',
  other: '其他',
}
function makeTopicLabels(theme, themeGroup, subtopics) {
  return subtopics.map((subtopic) => ({
    theme,
    themeGroup,
    subtopic,
    label: `${theme}-${themeGroup}-${subtopic}`,
  }))
}

function compactTopicLabelText(value) {
  return String(value || '')
    .trim()
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, '')
}

const TOPIC_LABEL_TAXONOMY = [
  ...makeTopicLabels('人与自我', '生活与学习', [
    '个人生活',
    '家庭生活',
    '社区生活',
    '学校生活',
    '健康的生活方式',
    '积极的生活态度',
    '认识自我',
    '丰富自我',
    '完善自我',
    '乐于学习',
    '善于学习',
    '终身学习',
    '语言学习的规律',
    '语言学习的方法',
  ]),
  ...makeTopicLabels('人与自我', '做人与做事', [
    '劳动实践',
    '劳动价值',
    '工匠精神',
    '优秀品行',
    '正确的人生态度',
    '公民义务',
    '社会责任',
    '生命的意义',
    '生命的价值',
    '生命安全',
    '未来职业发展趋势',
    '个人职业倾向',
    '未来规划',
    '创新意识',
    '创业意识',
  ]),
  ...makeTopicLabels('人与社会', '社会服务与人际沟通', [
    '良好的人际关系',
    '社会交往',
    '公益事业',
    '志愿服务',
    '跨文化沟通',
    '包容',
    '合作',
  ]),
  ...makeTopicLabels('人与社会', '文学、艺术与体育', [
    '小说',
    '戏剧',
    '诗歌',
    '传记',
    '文学简史',
    '经典演讲',
    '文学名著',
    '绘画领域的代表性作品和人物',
    '建筑领域的代表性作品和人物',
    '影视领域的概况及其发展',
    '音乐领域的概况及其发展',
    '日常体育活动',
    '大型体育赛事',
    '体育与健康',
    '体育精神',
  ]),
  ...makeTopicLabels('人与社会', '历史、社会与文化', [
    '文化习俗',
    '传统节日',
    '对社会有突出贡献的人物',
    '重要国际组织',
    '社会公益机构',
    '法律常识',
    '法治意识',
    '物质文化遗产',
    '非物质文化遗产',
    '社会热点问题',
    '农业发展',
    '乡村振兴',
    '重大政治事件',
    '重大历史事件',
    '文化渊源',
    '国家安全',
    '社会进步',
    '人类文明发展',
  ]),
  ...makeTopicLabels('人与社会', '科学与技术', [
    '科技发展',
    '信息技术创新',
    '科学精神',
    '信息安全',
    '网络安全',
  ]),
  ...makeTopicLabels('人与自然', '自然生态', [
    '不同国家地理概况',
    '自然环境',
    '人与动植物',
    '生态环境',
    '自然科学研究成果',
  ]),
  ...makeTopicLabels('人与自然', '环境保护', [
    '自然遗产保护',
    '人与环境',
    '国土安全',
    '人类生存与环境的关系',
    '社会发展与环境的关系',
  ]),
  ...makeTopicLabels('人与自然', '灾害防范', [
    '自然灾害与防范',
    '安全常识',
    '自我保护',
  ]),
  ...makeTopicLabels('人与自然', '宇宙探索', [
    '地球奥秘探索',
    '宇宙奥秘探索',
  ]),
]
const TOPIC_LABEL_BY_LABEL = new Map(TOPIC_LABEL_TAXONOMY.map((entry) => [entry.label, entry]))
const TOPIC_LABEL_BY_COMPACT_LABEL = new Map(
  TOPIC_LABEL_TAXONOMY.map((entry) => [compactTopicLabelText(entry.label), entry]),
)

function readJsonFile(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

function getPaperSurfaceAnalysisAvailabilityByGroupId() {
  return paperSurfaceAnalysisAvailability.getByGroupId()
}

function invalidatePaperSurfaceAnalysisAvailability() {
  paperSurfaceAnalysisAvailability.invalidate()
}

function getTeachingFacetIndex() {
  return teachingFacetIndex.getIndex()
}

function invalidateTeachingFacetIndex() {
  teachingFacetIndex.invalidate()
}

const PRINT_READY_GROUP_TYPES = new Set([
  'reading',
  'cloze',
  'seven_choices',
  'grammar_cloze',
  'writing',
  'continuation',
])

const OBJECTIVE_PRINT_GROUP_TYPES = new Set([
  'reading',
  'cloze',
  'seven_choices',
  'grammar_cloze',
])

function normalizePaperAssetQuestions(asset) {
  const questions = asset?.content?.questions
  if (!questions || typeof questions !== 'object') return new Set()
  return new Set(Object.keys(questions).map(String))
}

function findPaperAssetGroup(groupId) {
  if (!existsSync(paperAssetsDir)) return null
  for (const entry of readdirSync(paperAssetsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const { assetPath } = resolvePaperAssetReadPaths(paperAssetsDir, entry.name)
    if (!existsSync(assetPath)) continue
    try {
      const asset = readJsonFile(assetPath)
      const group = asset?.content?.groups?.[groupId]
      if (group) return { asset, group, paperId: entry.name }
    } catch {
      // Ignore invalid paper-asset files; import validation owns that error.
    }
  }
  return null
}

function normalizePaperAssetGroupType(groupType) {
  const value = String(groupType || '')
  if (value === 'sevenChoices') return 'seven_choices'
  if (value === 'grammarFill') return 'grammar_cloze'
  return value
}

function paperAssetParagraphText(group) {
  const paragraphs = Array.isArray(group?.passage?.paragraphs) ? group.passage.paragraphs : []
  return paragraphs
    .map((paragraph) => String(paragraph?.text || '').trim())
    .filter(Boolean)
    .join('\n\n')
}

function getPaperAssetPrintReady(asset, group) {
  const groupType = normalizePaperAssetGroupType(group?.groupType)
  const questionIds = Array.isArray(group?.questionIds) ? group.questionIds.map(String) : []
  const questions = asset?.content?.questions && typeof asset.content.questions === 'object'
    ? asset.content.questions
    : {}
  if (questionIds.length === 0) return { ok: false, reason: '题组没有小题' }

  for (const questionId of questionIds) {
    const question = questions[questionId]
    if (!question) return { ok: false, reason: `paper-asset 引用了不存在的小题 ${questionId}` }
    const stem = String(question.stem ?? question.blankId ?? question.questionNo ?? '').trim()
    if (!stem) return { ok: false, reason: '存在空题干' }
    if ((groupType === 'reading' || groupType === 'cloze')) {
      const options = Array.isArray(question.options) ? question.options : []
      if (options.length === 0 || options.some((option) => !String(option?.label || '').trim() || !String(option?.text || '').trim())) {
        return { ok: false, reason: '存在空选项' }
      }
    }
  }

  if (groupType === 'seven_choices') {
    const optionBank = Array.isArray(group?.optionBank) ? group.optionBank : []
    if (optionBank.length === 0 || optionBank.some((option) => !String(option?.label || '').trim() || !String(option?.text || '').trim())) {
      return { ok: false, reason: '存在空选项' }
    }
  }

  if (groupType === 'writing' || groupType === 'continuation' || groupType === 'reading' || groupType === 'seven_choices' || groupType === 'cloze') {
    if (!paperAssetParagraphText(group)) return { ok: false, reason: '题组缺少材料或提示' }
  }

  return { ok: true, reason: null }
}

const PRINT_READY_AGGREGATE_SQL = `
  SELECT
    qg.id,
    qg.group_type,
    qg.instruction,
    p.material_text,
    p.summary,
    COUNT(q.id) AS question_count,
    SUM(CASE WHEN trim(q.stem) = '' THEN 1 ELSE 0 END) AS missing_stem_count,
    SUM(CASE WHEN option_counts.option_count IS NULL OR option_counts.option_count = 0 THEN 1 ELSE 0 END) AS missing_option_count
  FROM question_groups qg
  JOIN passages p ON p.id = qg.passage_id
  LEFT JOIN questions q ON q.group_id = qg.id
  LEFT JOIN (
    SELECT question_id, COUNT(*) AS option_count
    FROM options
    WHERE trim(content) <> ''
    GROUP BY question_id
  ) option_counts ON option_counts.question_id = q.id
`

// Perf cut (docs/cuts/list-groups-perf/plan.md): pure judgment shared by the
// single-row path (isGroupPrintReady) and the batch path (getPrintReadyByGroupId)
// so the two never drift. `group` is one row of PRINT_READY_AGGREGATE_SQL (or
// null/undefined when the group doesn't exist); `paperAssetMatch` is the
// { asset, group } pair from a paper-asset scan, or null/undefined when absent.
function computePrintReadyJudgment(group, paperAssetMatch) {
  if (!group) return { ok: false, reason: '题组不存在' }
  if (!PRINT_READY_GROUP_TYPES.has(group.group_type)) {
    if (group.group_type === 'listening') return { ok: false, reason: '听力题组暂不支持打印' }
    return { ok: false, reason: '题型暂不支持打印' }
  }
  if (paperAssetMatch) return getPaperAssetPrintReady(paperAssetMatch.asset, paperAssetMatch.group)

  if (Number(group.question_count || 0) <= 0) return { ok: false, reason: '题组没有小题' }
  if (Number(group.missing_stem_count || 0) > 0) return { ok: false, reason: '存在空题干' }
  if (OBJECTIVE_PRINT_GROUP_TYPES.has(group.group_type) && Number(group.missing_option_count || 0) > 0) {
    return { ok: false, reason: '存在空选项' }
  }
  if ((group.group_type === 'writing' || group.group_type === 'continuation')) {
    const material = String(group.material_text || group.summary || group.instruction || '').trim()
    if (!material) return { ok: false, reason: '写作题组缺少材料或提示' }
  }

  return { ok: true, reason: null }
}

export function isGroupPrintReady(db, groupId) {
  const group = db
    .prepare(
      `${PRINT_READY_AGGREGATE_SQL} WHERE qg.id = ? GROUP BY qg.id, qg.group_type, qg.instruction, p.material_text, p.summary`,
    )
    .get(groupId)
  const paperAssetMatch = findPaperAssetGroup(groupId)
  return computePrintReadyJudgment(group, paperAssetMatch)
}

// Batch counterpart of isGroupPrintReady (perf cut list-groups-perf): one SQL
// call for all groupIds' aggregate rows + one paper-asset directory scan,
// instead of N+1 SQL calls and N full paper-asset scans each. Returns
// Map<groupId, { ok, reason }> with judgments identical to calling
// isGroupPrintReady(db, id) for each id (parity proven by
// scripts/verify-list-groups-perf.mjs).
function selectPrintReadyAggregateRows(db, groupIds) {
  if (groupIds.length === 0) return new Map()
  const placeholders = groupIds.map(() => '?').join(', ')
  const rows = db
    .prepare(
      `${PRINT_READY_AGGREGATE_SQL} WHERE qg.id IN (${placeholders}) GROUP BY qg.id, qg.group_type, qg.instruction, p.material_text, p.summary`,
    )
    .all(...groupIds)
  return new Map(rows.map((row) => [row.id, row]))
}

function buildPaperAssetGroupIndex() {
  const index = new Map()
  if (!existsSync(paperAssetsDir)) return index
  for (const entry of readdirSync(paperAssetsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const { assetPath } = resolvePaperAssetReadPaths(paperAssetsDir, entry.name)
    if (!existsSync(assetPath)) continue
    try {
      const asset = readJsonFile(assetPath)
      const groups = asset?.content?.groups
      if (!groups || typeof groups !== 'object') continue
      for (const [groupId, group] of Object.entries(groups)) {
        if (group && !index.has(groupId)) index.set(groupId, { asset, group, paperId: entry.name })
      }
    } catch {
      // Ignore invalid paper-asset files; import validation owns that error.
    }
  }
  return index
}

export function getPrintReadyByGroupId(db, groupIds) {
  const ids = Array.from(new Set(groupIds))
  const aggregateById = selectPrintReadyAggregateRows(db, ids)
  const paperAssetIndex = buildPaperAssetGroupIndex()
  const result = new Map()
  for (const id of ids) {
    result.set(id, computePrintReadyJudgment(aggregateById.get(id), paperAssetIndex.get(id)))
  }
  return result
}

const draftPaperStore = createDraftPaperStore({
  exportDir,
  getPrintReadyByGroupId,
  getQuestionGroupDetail,
  groupTypeLabels,
  isGroupPrintReady,
  openDatabase,
  openUserDatabase,
  paperAssetsDir,
  resolveCanonicalConsumption,
  rootDir,
  selectQuestionGroupCards,
})
serverContext.draftPaperStore = draftPaperStore
// M0-4 (docs/cuts/m0-4-user-scope/plan.md decision 2): the single userId translation
// point, exposed on context so route handlers can call context.resolveDataUserId(context)
// without importing auth.mjs directly (same post-hoc pattern as draftPaperStore above,
// since resolveDataUserId is destructured/used before serverContext's later fields exist).
serverContext.resolveDataUserId = resolveDataUserId

const serverRoutes = [
  ...h1Routes,
  ...createAuthRoutes(),
  ...createMySpaceRoutes(),
  ...createDraftPaperRoutes(),
  ...createExportRoutes(exportImplementation),
  ...createPaperCanonicalConsumerRoutes(),
  ...createQuestionGroupRoutes(),
  ...createPaperSetRoutes(),
  ...createAiProxyRoutes(),
  ...createTeachingFacetRoutes(),
  ...createSimilarQuestionsRoutes(),
  ...createTopicLabelBackfillRoutes(),
  // D1 (grammar-facets-v2): I16·C verb-profile sidecar + its backfill route
  // retired — tense/voice/agreementSensitive now live on the grammar-fill-
  // analysis-v2 blank entry itself (server/search/teachingFacets.mjs).
]

const EMPTY_DRAFT_CONTEXT = { currentDraftPaperId: null, groupIds: new Set() }

// Real draftContext requires a userDb connection (draft_papers / draft_paper_items live
// there after the M0-1 user-data split). Only the find-questions card-list entry points
// (listQuestionGroups, semanticSearchQuestionGroups, questionBankStewardSearch) call this;
// every other selectQuestionGroupCards caller uses the EMPTY_DRAFT_CONTEXT default — see
// plan.md "store 连接改造清单" / decision 5.
//
// M0-4 (docs/cuts/m0-4-user-scope/plan.md decision 7 / PA MF-1): required userId — this is
// the button-state seam that leaked across users in the M0-1-era bug this plan cites; the
// inner draft_paper_items query below is intentionally NOT re-scoped by user_id (PA SW-2 —
// getCurrentDraftPaperRow already gated `current` on userId, so current.id is already
// owned by this user; draft_paper_items has no user_id column to add one to).
function getDraftSearchContext(userId) {
  if (typeof userId !== 'string' || !userId) {
    throw new Error('getDraftSearchContext: userId is required')
  }
  const userDb = openUserDatabase({ readOnly: true })
  try {
    const current = draftPaperStore.getCurrentDraftPaperRow(userDb, userId)
    if (!current) return EMPTY_DRAFT_CONTEXT
    const rows = userDb
      .prepare('SELECT group_id FROM draft_paper_items WHERE draft_paper_id = ?')
      .all(current.id)
    return {
      currentDraftPaperId: current.id,
      groupIds: new Set(rows.map((row) => row.group_id)),
    }
  } finally {
    userDb.close()
  }
}

function buildDraftButtonState(printReady, draftContext, groupId) {
  if (draftContext.groupIds.has(groupId)) return 'in_current_draft'
  if (!printReady.ok) return 'disabled'
  return 'add'
}

function topicSubtopicAliasKey(theme, subtopic) {
  return `${compactTopicLabelText(theme)}|${compactTopicLabelText(subtopic)}`
}

function makeTopicAliasTargets(theme, themeGroup, subtopics) {
  return subtopics
    .map((subtopic) => TOPIC_LABEL_BY_LABEL.get(`${theme}-${themeGroup}-${subtopic}`))
    .filter(Boolean)
}

const TOPIC_SUBTOPIC_ALIASES = new Map()
function addTopicSubtopicAlias(theme, oldSubtopic, themeGroup, subtopics) {
  TOPIC_SUBTOPIC_ALIASES.set(topicSubtopicAliasKey(theme, oldSubtopic), makeTopicAliasTargets(theme, themeGroup, subtopics))
}

addTopicSubtopicAlias('人与自我', '个人、家庭、社区及学校生活', '生活与学习', ['个人生活', '家庭生活', '社区生活', '学校生活'])
addTopicSubtopicAlias('人与自我', '健康的生活方式、积极的生活态度', '生活与学习', ['健康的生活方式', '积极的生活态度'])
addTopicSubtopicAlias('人与自我', '认识自我，丰富自我，完善自我', '生活与学习', ['认识自我', '丰富自我', '完善自我'])
addTopicSubtopicAlias('人与自我', '乐于学习，善于学习，终身学习', '生活与学习', ['乐于学习', '善于学习', '终身学习'])
addTopicSubtopicAlias('人与自我', '语言学习的规律、方法等', '生活与学习', ['语言学习的规律', '语言学习的方法'])
addTopicSubtopicAlias('人与自我', '劳动实践、劳动价值与工匠精神', '做人与做事', ['劳动实践', '劳动价值', '工匠精神'])
addTopicSubtopicAlias('人与自我', '优秀品行，正确的人生态度，公民义务与社会责任', '做人与做事', ['优秀品行', '正确的人生态度', '公民义务', '社会责任'])
addTopicSubtopicAlias('人与自我', '生命的意义与价值、生命安全', '做人与做事', ['生命的意义', '生命的价值', '生命安全'])
addTopicSubtopicAlias('人与自我', '未来职业发展趋势，个人职业倾向、未来规划等', '做人与做事', ['未来职业发展趋势', '个人职业倾向', '未来规划'])
addTopicSubtopicAlias('人与自我', '创新与创业意识', '做人与做事', ['创新意识', '创业意识'])
addTopicSubtopicAlias('人与社会', '良好的人际关系与社会交往', '社会服务与人际沟通', ['良好的人际关系', '社会交往'])
addTopicSubtopicAlias('人与社会', '公益事业与志愿服务', '社会服务与人际沟通', ['公益事业', '志愿服务'])
addTopicSubtopicAlias('人与社会', '跨文化沟通、包容与合作', '社会服务与人际沟通', ['跨文化沟通', '包容', '合作'])
addTopicSubtopicAlias('人与社会', '小说、戏剧、诗歌、传记、文学简史、经典演讲、文学名著等', '文学、艺术与体育', ['小说', '戏剧', '诗歌', '传记', '文学简史', '经典演讲', '文学名著'])
addTopicSubtopicAlias('人与社会', '绘画、建筑等领域的代表性作品和人物', '文学、艺术与体育', ['绘画领域的代表性作品和人物', '建筑领域的代表性作品和人物'])
addTopicSubtopicAlias('人与社会', '影视、音乐等领域的概况及其发展', '文学、艺术与体育', ['影视领域的概况及其发展', '音乐领域的概况及其发展'])
addTopicSubtopicAlias('人与社会', '日常体育活动、大型体育赛事、体育与健康、体育精神', '文学、艺术与体育', ['日常体育活动', '大型体育赛事', '体育与健康', '体育精神'])
addTopicSubtopicAlias('人与社会', '文化习俗与传统节日', '历史、社会与文化', ['文化习俗', '传统节日'])
addTopicSubtopicAlias('人与社会', '重要国际组织与社会公益机构', '历史、社会与文化', ['重要国际组织', '社会公益机构'])
addTopicSubtopicAlias('人与社会', '法律常识与法治意识等', '历史、社会与文化', ['法律常识', '法治意识'])
addTopicSubtopicAlias('人与社会', '物质与非物质文化遗产', '历史、社会与文化', ['物质文化遗产', '非物质文化遗产'])
addTopicSubtopicAlias('人与社会', '农业发展、乡村振兴', '历史、社会与文化', ['农业发展', '乡村振兴'])
addTopicSubtopicAlias('人与社会', '重大政治、历史事件，文化渊源', '历史、社会与文化', ['重大政治事件', '重大历史事件', '文化渊源'])
addTopicSubtopicAlias('人与社会', '社会进步与人类文明发展', '历史、社会与文化', ['社会进步', '人类文明发展'])
addTopicSubtopicAlias('人与社会', '科技发展与信息技术创新，科学精神', '科学与技术', ['科技发展', '信息技术创新', '科学精神'])
addTopicSubtopicAlias('人与社会', '信息安全、网络安全', '科学与技术', ['信息安全', '网络安全'])
TOPIC_SUBTOPIC_ALIASES.set(topicSubtopicAliasKey('人与自然', '自然环境、自然遗产保护'), [
  ...makeTopicAliasTargets('人与自然', '自然生态', ['自然环境']),
  ...makeTopicAliasTargets('人与自然', '环境保护', ['自然遗产保护']),
])
TOPIC_SUBTOPIC_ALIASES.set(topicSubtopicAliasKey('人与自然', '人与环境、人与动植物、生态环境、国土安全'), [
  ...makeTopicAliasTargets('人与自然', '自然生态', ['人与动植物', '生态环境']),
  ...makeTopicAliasTargets('人与自然', '环境保护', ['人与环境', '国土安全']),
])
addTopicSubtopicAlias('人与自然', '自然灾害与防范，安全常识与自我保护', '灾害防范', ['自然灾害与防范', '安全常识', '自我保护'])
addTopicSubtopicAlias('人与自然', '人类生存、社会发展与环境的关系', '环境保护', ['人类生存与环境的关系', '社会发展与环境的关系'])
addTopicSubtopicAlias('人与自然', '地球与宇宙奥秘探索', '宇宙探索', ['地球奥秘探索', '宇宙奥秘探索'])
addTopicSubtopicAlias('人与社会', '对社会有突出贡献的人物', '历史、社会与文化', ['对社会有突出贡献的人物'])
addTopicSubtopicAlias('人与社会', '社会热点问题', '历史、社会与文化', ['社会热点问题'])
addTopicSubtopicAlias('人与社会', '国家安全', '历史、社会与文化', ['国家安全'])
addTopicSubtopicAlias('人与自然', '不同国家地理概况', '自然生态', ['不同国家地理概况'])
addTopicSubtopicAlias('人与自然', '自然科学研究成果', '自然生态', ['自然科学研究成果'])

function sendJson(response, status, body) {
  response.writeHead(status, {
    'access-control-allow-origin': 'http://127.0.0.1:5173',
    'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-allow-credentials': 'true',
    'access-control-expose-headers': 'x-verify-request-id, x-parse-request-id',
    'content-type': 'application/json; charset=utf-8',
  })
  response.end(JSON.stringify(body))
}

function sendPaperAssetStatic(response, urlPath) {
  const relativePath = decodeURIComponent(urlPath.replace(/^\/paper-assets\/?/, ''))
  if (!relativePath || relativePath.includes('..') || path.isAbsolute(relativePath)) {
    sendJson(response, 400, { error: 'Invalid paper asset path' })
    return
  }
  const paperAssetRoot = path.resolve(paperAssetsDir)
  let filePath = path.resolve(paperAssetsDir, relativePath)
  const isInsideRoot = filePath === paperAssetRoot || filePath.startsWith(`${paperAssetRoot}${path.sep}`)
  if (!isInsideRoot) {
    sendJson(response, 400, { error: 'Invalid paper asset path' })
    return
  }
  if (!existsSync(filePath)) {
    const parts = relativePath.split('/')
    if (parts.length > 2 && parts[1] === 'latest') {
      const versions = listPaperAssetVersions(paperAssetsDir, parts[0])
      if (versions.length > 0) {
        filePath = path.resolve(paperAssetsDir, parts[0], 'versions', `v${versions[versions.length - 1]}`, ...parts.slice(2))
      }
    }
  }
  if (!filePath.startsWith(`${paperAssetRoot}${path.sep}`) || !existsSync(filePath) || statSync(filePath).isDirectory()) {
    sendJson(response, 404, { error: 'Paper asset file not found' })
    return
  }
  const ext = path.extname(filePath).toLowerCase()
  const contentType =
    ext === '.json'
      ? 'application/json; charset=utf-8'
      : ext === '.docx'
        ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        : 'application/octet-stream'
  response.writeHead(200, {
    'access-control-allow-origin': '*',
    'content-type': contentType,
  })
  response.end(readFileSync(filePath))
}

function openDatabase({ readOnly = true } = {}) {
  if (!existsSync(dbPath)) {
    throw new Error(`Database not found at ${dbPath}. Run scripts/init-db.sh first.`)
  }

  const db = new DatabaseSync(dbPath, { readOnly })
  db.exec('PRAGMA foreign_keys = ON')
  return db
}

function withCanonicalConsumerRuntime(callback) {
  const db = openDatabase({ readOnly: false })
  try {
    return callback(createCanonicalConsumerRuntime({
      rootDir: paperAssetsDir,
      db,
    }))
  } finally {
    db.close()
  }
}

function loadCanonicalConsumption(input) {
  return withCanonicalConsumerRuntime((runtime) => runtime.load(input))
}

function resolveCanonicalConsumption(input) {
  return withCanonicalConsumerRuntime((runtime) =>
    runtime.resolveForItems(input))
}

// User-data database (draft papers + My Space). Unlike the shared bank database,
// this one is self-healing: deploys never ship this file, so the shape must be
// created on demand rather than requiring scripts/init-db.sh to run first.
// Exported so scripts/create-user.mjs can open the same user database the
// server uses at runtime (plan.md decision 8 — reuse, do not duplicate the
// connection/ensure logic).
export function openUserDatabase({ readOnly = false } = {}) {
  mkdirSync(path.dirname(userDataDbPath), { recursive: true })
  const db = new DatabaseSync(userDataDbPath, { readOnly })
  db.exec('PRAGMA foreign_keys = ON')
  if (!readOnly) ensureUserDatabaseShape(db)
  return db
}

// Exported so scripts/migrate-user-data-split.mjs can build/ensure the user database
// shape without duplicating the schema (single source of truth — plan.md decision 2).
//
// M0-4 user data isolation (docs/cuts/m0-4-user-scope/plan.md decisions 4-6 /
// ADR-0014 decision 5): three-phase shape.
//   1. Main CREATE TABLE IF NOT EXISTS block — always new-form (user_id columns +
//      UNIQUE(user_id, name) on folders). The old global "keep only the latest
//      current marker" dedup UPDATE is NOT here anymore — it is destructive across
//      users and must run at most once, inside the migration branch below.
//   2. Migration branch (`user_version < 3`, never `=== 3` — ADR-0012 §5): column
//      existence guards via PRAGMA table_info because a FRESH database also has
//      user_version 0 before this function ever runs (the version pragma is only
//      written at the end), so version alone can't tell "old db, needs migrating"
//      from "brand new db, already new-form".
//   3. Unconditional post-migration block — (re)creates the per-user current-draft
//      index and the two new secondary indexes, then bumps user_version to 3.
export function ensureUserDatabaseShape(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS draft_papers (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT 'local',
      title TEXT NOT NULL,
      subject TEXT NOT NULL DEFAULT 'english',
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleted')),
      current_marker INTEGER NOT NULL DEFAULT 0 CHECK (current_marker IN (0, 1)),
      last_printed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS draft_paper_items (
      id TEXT PRIMARY KEY,
      draft_paper_id TEXT NOT NULL REFERENCES draft_papers(id) ON DELETE CASCADE,
      group_id TEXT NOT NULL,
      source_paper_id TEXT NOT NULL DEFAULT '',
      order_index INTEGER NOT NULL DEFAULT 0,
      page_break_before INTEGER NOT NULL DEFAULT 0 CHECK (page_break_before IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(draft_paper_id, group_id)
    );
    CREATE INDEX IF NOT EXISTS idx_draft_paper_items_draft ON draft_paper_items(draft_paper_id, order_index);
    CREATE INDEX IF NOT EXISTS idx_draft_paper_items_group ON draft_paper_items(group_id);
  `)
  ensureMySpaceDatabaseShape(db)
  ensureAuthDatabaseShape(db)

  const userVersionRow = db.prepare('PRAGMA user_version').get()
  const userVersion = Number(userVersionRow?.user_version || 0)

  if (userVersion < 3) {
    const hasColumn = (table, column) =>
      db.prepare(`PRAGMA table_info(${table})`).all().some((row) => row.name === column)

    // my_space_folders is handled separately below (full table rebuild, because its
    // UNIQUE constraint also needs to change from global to per-user) — captured
    // BEFORE any ALTER TABLE runs against it, and excluded from this simple
    // add-column loop so the rebuild-vs-already-new-form check stays accurate.
    const foldersHadUserIdBeforeRebuild = hasColumn('my_space_folders', 'user_id')

    for (const table of ['draft_papers', 'my_space_artifacts']) {
      if (!hasColumn(table, 'user_id')) {
        db.exec(`ALTER TABLE ${table} ADD COLUMN user_id TEXT NOT NULL DEFAULT 'local'`)
      }
    }

    // One-time global dedup: at this point in a real upgrade every row is still
    // 'local' (single-user history), so "keep only the latest current draft
    // globally" and "keep only the latest current draft per user" are the same
    // operation. This must never run again after the version bump below — doing
    // so on every boot (the pre-M0-4 behavior) would wipe other users' current
    // markers in a multi-user world.
    db.exec(`
      UPDATE draft_papers
      SET current_marker = 0
      WHERE current_marker = 1
        AND id NOT IN (
          SELECT id
          FROM draft_papers
          WHERE current_marker = 1
          ORDER BY updated_at DESC, created_at DESC
          LIMIT 1
        );
    `)

    db.exec('DROP INDEX IF EXISTS idx_draft_papers_current_one')

    // my_space_folders.name was an inline UNIQUE (global) column; SQLite cannot
    // ALTER an inline constraint, so a real pre-M0-4 table (no user_id column yet
    // at the top of this branch) must be rebuilt. PA MF-2 hard constraint (plan.md
    // decision 5): PRAGMA foreign_keys OFF/ON must run OUTSIDE any transaction —
    // node:sqlite silently no-ops that PRAGMA inside an active transaction, which
    // would leave the FK check disabled-in-appearance-only during the rebuild.
    // The rebuild body itself (create temp table -> copy -> drop -> rename) is
    // wrapped in exactly one BEGIN...COMMIT so a crash mid-rebuild can never leave
    // a half-migrated (old table dropped, new table not yet renamed) database on
    // disk — SQLite's CREATE TABLE IF NOT EXISTS on next boot would otherwise
    // silently recreate an empty new-form table and the old folder rows would be
    // gone for good.
    if (!foldersHadUserIdBeforeRebuild) {
      db.exec('PRAGMA foreign_keys = OFF')
      db.exec('BEGIN')
      try {
        db.exec(`
          CREATE TABLE my_space_folders__m04_new (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL DEFAULT 'local',
            name TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(user_id, name)
          );
        `)
        db.exec(`
          INSERT INTO my_space_folders__m04_new (id, user_id, name, created_at, updated_at)
          SELECT id, 'local', name, created_at, updated_at FROM my_space_folders;
        `)
        db.exec('DROP TABLE my_space_folders')
        db.exec('ALTER TABLE my_space_folders__m04_new RENAME TO my_space_folders')
        db.exec('COMMIT')
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      } finally {
        db.exec('PRAGMA foreign_keys = ON')
      }
      const fkViolations = db.prepare('PRAGMA foreign_key_check').all()
      if (fkViolations.length > 0) {
        throw new Error(`ensureUserDatabaseShape: foreign_key_check found ${fkViolations.length} violation(s) after my_space_folders rebuild`)
      }
    }
  }

  // Unconditional (idempotent): the per-user current-draft index and the two
  // user-scoped secondary indexes must exist regardless of whether the migration
  // branch above ran this boot.
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_draft_papers_current_one
    ON draft_papers(user_id, current_marker)
    WHERE current_marker = 1;
    CREATE INDEX IF NOT EXISTS idx_draft_papers_current ON draft_papers(current_marker, updated_at);
    CREATE INDEX IF NOT EXISTS idx_draft_papers_user_status ON draft_papers(user_id, status, updated_at);
    CREATE INDEX IF NOT EXISTS idx_my_space_artifacts_user ON my_space_artifacts(user_id, generated_at);
  `)

  if (userVersion < 3) {
    db.exec('PRAGMA user_version = 3')
  }
}

function warnIfSharedDatabaseStillHasUserTables() {
  if (!existsSync(dbPath)) return
  const db = new DatabaseSync(dbPath, { readOnly: true })
  try {
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'draft_papers'")
      .get()
    if (row) {
      console.warn(
        '[warn] question-bank.sqlite 仍带有用户数据表（draft_papers 等）。' +
          '请运行一次性迁移: node scripts/migrate-user-data-split.mjs',
      )
    }
  } finally {
    db.close()
  }
}

function ensureDatabaseShape() {
  if (!existsSync(dbPath)) return

  const db = new DatabaseSync(dbPath, { readOnly: false })
  try {
    db.exec('PRAGMA foreign_keys = ON')
    db.exec(`
      CREATE TABLE IF NOT EXISTS reading_parse_results (
        id TEXT PRIMARY KEY,
        question_group_id TEXT NOT NULL UNIQUE REFERENCES question_groups(id) ON DELETE CASCADE,
        payload_json TEXT NOT NULL DEFAULT '{}',
        verify_payload_json TEXT NOT NULL DEFAULT '{}',
        provider TEXT NOT NULL DEFAULT 'deepseek',
        model TEXT NOT NULL DEFAULT '',
        thinking_mode INTEGER NOT NULL DEFAULT 0 CHECK (thinking_mode IN (0, 1)),
        request_id TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_reading_parse_results_group ON reading_parse_results(question_group_id);
      CREATE TABLE IF NOT EXISTS question_group_topic_labels (
        id TEXT PRIMARY KEY,
        question_group_id TEXT NOT NULL REFERENCES question_groups(id) ON DELETE CASCADE,
        label TEXT NOT NULL,
        theme TEXT NOT NULL,
        theme_group TEXT NOT NULL,
        subtopic TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'ai',
        reason TEXT NOT NULL DEFAULT '',
        confidence REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(question_group_id, label)
      );
      CREATE INDEX IF NOT EXISTS idx_question_group_topic_labels_group
        ON question_group_topic_labels(question_group_id);
    `)
    const columns = db
      .prepare('PRAGMA table_info(reading_parse_results)')
      .all()
      .map((column) => column.name)
    if (!columns.includes('verify_payload_json')) {
      db.exec("ALTER TABLE reading_parse_results ADD COLUMN verify_payload_json TEXT NOT NULL DEFAULT '{}'")
    }
    if (!columns.includes('grammar_payload_json')) {
      db.exec("ALTER TABLE reading_parse_results ADD COLUMN grammar_payload_json TEXT NOT NULL DEFAULT '{}'")
    }
    if (!columns.includes('cloze_payload_json')) {
      db.exec("ALTER TABLE reading_parse_results ADD COLUMN cloze_payload_json TEXT NOT NULL DEFAULT '{}'")
    }
    if (!columns.includes('seven_choices_payload_json')) {
      db.exec("ALTER TABLE reading_parse_results ADD COLUMN seven_choices_payload_json TEXT NOT NULL DEFAULT '{}'")
    }
    const questionColumns = db
      .prepare('PRAGMA table_info(questions)')
      .all()
      .map((column) => column.name)
    if (questionColumns.length > 0) {
      if (!questionColumns.includes('ai_difficulty_score')) {
        db.exec('ALTER TABLE questions ADD COLUMN ai_difficulty_score INTEGER')
      }
      if (!questionColumns.includes('teacher_difficulty')) {
        db.exec('ALTER TABLE questions ADD COLUMN teacher_difficulty INTEGER')
      }
      if (!questionColumns.includes('difficulty_override_reason')) {
        db.exec("ALTER TABLE questions ADD COLUMN difficulty_override_reason TEXT NOT NULL DEFAULT ''")
      }
      if (!questionColumns.includes('difficulty_override_note')) {
        db.exec("ALTER TABLE questions ADD COLUMN difficulty_override_note TEXT NOT NULL DEFAULT ''")
      }
      if (!questionColumns.includes('difficulty_tagged_at')) {
        db.exec('ALTER TABLE questions ADD COLUMN difficulty_tagged_at TEXT')
      }
    }
    // paper_sets layout_json migration
    const paperSetColumns = db
      .prepare('PRAGMA table_info(paper_sets)')
      .all()
      .map((column) => column.name)
    if (paperSetColumns.length > 0 && !paperSetColumns.includes('layout_json')) {
      db.exec('ALTER TABLE paper_sets ADD COLUMN layout_json TEXT')
    }
    ensurePaperImportDatabaseShape(db)
  } finally {
    db.close()
  }
  warnIfSharedDatabaseStillHasUserTables()
}

function parseSavedJson(rawText) {
  try {
    return JSON.parse(String(rawText || '{}'))
  } catch {
    return null
  }
}

function readPromptFile(fileName, fallback) {
  try {
    const text = readFileSync(path.join(promptsDir, fileName), 'utf8').trim()
    return text || fallback
  } catch {
    return fallback
  }
}

function getSavedReadingParseResult(db, questionGroupId) {
  const row = db
    .prepare(
      `
      SELECT
        id,
        question_group_id,
        payload_json,
        provider,
        model,
        thinking_mode,
        request_id,
        created_at,
        updated_at
      FROM reading_parse_results
      WHERE question_group_id = ?
      `,
    )
    .get(questionGroupId)

  if (!row) return null

  const payload = parseSavedJson(row.payload_json)
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.questions) || payload.questions.length === 0) return null
  const keyFingerprint = optionalString(payload.keyFingerprint) || optionalString(payload.keyMask)
  const normalizedPayload = {
    ...payload,
    keyFingerprint: keyFingerprint || optionalString(payload.keyFingerprint),
  }

  return {
    ...normalizedPayload,
    questionGroupId: row.question_group_id,
    provider: row.provider || payload.provider || 'deepseek',
    model: row.model || payload.model || '',
    requestId: row.request_id || payload.requestId || '',
    thinkingMode: Boolean(row.thinking_mode),
    savedAt: row.updated_at,
    savedResultId: row.id,
  }
}

function getSavedReadingVerifyResult(db, questionGroupId) {
  const row = db
    .prepare(
      `
      SELECT
        question_group_id,
        verify_payload_json,
        updated_at
      FROM reading_parse_results
      WHERE question_group_id = ?
      `,
    )
    .get(questionGroupId)

  if (!row) return null

  const payload = parseSavedJson(row.verify_payload_json)
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.results)) return null
  const keyFingerprint = optionalString(payload.keyFingerprint) || optionalString(payload.keyMask)
  const normalizedPayload = {
    ...payload,
    keyFingerprint: keyFingerprint || optionalString(payload.keyFingerprint),
  }

  return {
    ...normalizedPayload,
    questionGroupId: row.question_group_id,
    savedAt: row.updated_at,
  }
}

function getSavedGrammarParseResult(db, questionGroupId) {
  const row = db
    .prepare('SELECT grammar_payload_json, updated_at FROM reading_parse_results WHERE question_group_id = ?')
    .get(questionGroupId)
  if (!row) return null
  const payload = parseSavedJson(row.grammar_payload_json)
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.questions) || payload.questions.length === 0) return null
  const keyFingerprint = optionalString(payload.keyFingerprint) || optionalString(payload.keyMask)
  return {
    ...payload,
    keyFingerprint: keyFingerprint || optionalString(payload.keyFingerprint),
    savedAt: row.updated_at,
  }
}

function getSavedClozeParseResult(db, questionGroupId) {
  const row = db
    .prepare('SELECT cloze_payload_json, updated_at FROM reading_parse_results WHERE question_group_id = ?')
    .get(questionGroupId)
  if (!row) return null
  const payload = parseSavedJson(row.cloze_payload_json)
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.questions) || payload.questions.length === 0) return null
  const keyFingerprint = optionalString(payload.keyFingerprint) || optionalString(payload.keyMask)
  return {
    ...payload,
    keyFingerprint: keyFingerprint || optionalString(payload.keyFingerprint),
    savedAt: row.updated_at,
  }
}

function getSavedSevenChoicesParseResult(db, questionGroupId) {
  const row = db
    .prepare('SELECT seven_choices_payload_json, updated_at FROM reading_parse_results WHERE question_group_id = ?')
    .get(questionGroupId)
  if (!row) return null
  const payload = parseSavedJson(row.seven_choices_payload_json)
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.questions) || payload.questions.length === 0) return null
  const keyFingerprint = optionalString(payload.keyFingerprint) || optionalString(payload.keyMask)
  return {
    ...payload,
    keyFingerprint: keyFingerprint || optionalString(payload.keyFingerprint),
    savedAt: row.updated_at,
  }
}

function getTopicLabelsForQuestionGroups(db, questionGroupIds) {
  const ids = Array.from(new Set((questionGroupIds || []).map((id) => optionalString(id)).filter(Boolean)))
  const labelsByGroupId = new Map(ids.map((id) => [id, []]))
  if (ids.length === 0) return labelsByGroupId

  const placeholders = ids.map(() => '?').join(', ')
  const rows = db
    .prepare(
      `
      SELECT
        id,
        question_group_id,
        label,
        theme,
        theme_group,
        subtopic,
        source,
        reason,
        confidence,
        created_at,
        updated_at
      FROM question_group_topic_labels
      WHERE question_group_id IN (${placeholders})
      ORDER BY theme, theme_group, subtopic, label
      `,
    )
    .all(...ids)

  const seenLabelsByGroupId = new Map(ids.map((id) => [id, new Set()]))
  rows.forEach((row) => {
    const labels = labelsByGroupId.get(row.question_group_id) || []
    const seenLabels = seenLabelsByGroupId.get(row.question_group_id) || new Set()
    const normalizedLabels = normalizeTopicLabelItem({
      label: row.label,
      theme: row.theme,
      themeGroup: row.theme_group,
      subtopic: row.subtopic,
      source: row.source,
      reason: row.reason,
      confidence: row.confidence,
    })
    normalizedLabels.forEach((label, index) => {
      if (seenLabels.has(label.label)) return
      seenLabels.add(label.label)
      labels.push({
        ...label,
        id: index === 0 ? row.id : `${row.id}-${index + 1}`,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })
    })
    labelsByGroupId.set(row.question_group_id, labels)
    seenLabelsByGroupId.set(row.question_group_id, seenLabels)
  })

  return labelsByGroupId
}

function getTopicLabelsForQuestionGroup(db, questionGroupId) {
  return getTopicLabelsForQuestionGroups(db, [questionGroupId]).get(questionGroupId) || []
}

function normalizeTopicLabelText(value) {
  return compactTopicLabelText(value)
}

function clampConfidence(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 0
  return Math.max(0, Math.min(1, number))
}

function normalizeTopicLabelItem(item) {
  if (!item) return []
  const isTextItem = typeof item === 'string'
  const rawLabel = isTextItem
    ? item
    : optionalString(item.label || item.topicLabel || item.value || item.name)
  const labelParts = rawLabel.split('-')
  const rawTheme = isTextItem ? optionalString(labelParts[0]) : optionalString(item.theme || item.主题 || labelParts[0])
  const rawThemeGroup = isTextItem
    ? optionalString(labelParts[1])
    : optionalString(item.themeGroup || item.theme_group || item.主题群 || labelParts[1])
  const rawSubtopic = isTextItem
    ? optionalString(labelParts.slice(2).join('-'))
    : optionalString(item.subtopic || item.subTopic || item.子主题 || labelParts.slice(2).join('-'))
  const assembledLabel = rawTheme && rawThemeGroup && rawSubtopic ? `${rawTheme}-${rawThemeGroup}-${rawSubtopic}` : ''
  const compactLabel = normalizeTopicLabelText(rawLabel || assembledLabel)
  const canonical = TOPIC_LABEL_BY_LABEL.get(rawLabel) || TOPIC_LABEL_BY_LABEL.get(assembledLabel) || TOPIC_LABEL_BY_COMPACT_LABEL.get(compactLabel)
  const source = isTextItem ? 'ai' : optionalString(item.source) || 'ai'
  const reason = isTextItem ? '' : optionalString(item.reason || item.理由 || item.explanation || item.analysis)
  const confidence = isTextItem ? 0 : clampConfidence(item.confidence ?? item.score ?? item.置信度)
  const decorate = (topicLabel) => ({
    ...topicLabel,
    source,
    reason,
    confidence,
  })

  if (canonical) return [decorate(canonical)]

  const aliasLabels = TOPIC_SUBTOPIC_ALIASES.get(topicSubtopicAliasKey(rawTheme, rawSubtopic)) || []
  return aliasLabels.map(decorate)
}

export function normalizeTopicLabelPayload(payload) {
  const rawLabels = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.topicLabels)
      ? payload.topicLabels
      : Array.isArray(payload?.labels)
        ? payload.labels
        : Array.isArray(payload?.results)
          ? payload.results
          : []
  const labels = []
  const seenLabels = new Set()

  rawLabels.forEach((item) => {
    normalizeTopicLabelItem(item).forEach((normalized) => {
      if (!normalized || seenLabels.has(normalized.label)) return
      seenLabels.add(normalized.label)
      labels.push(normalized)
    })
  })

  return labels
}

function replaceQuestionGroupTopicLabels(db, questionGroupId, labels) {
  db.exec('BEGIN')
  try {
    db.prepare('DELETE FROM question_group_topic_labels WHERE question_group_id = ?').run(questionGroupId)
    const insert = db.prepare(
      `
      INSERT INTO question_group_topic_labels (
        id,
        question_group_id,
        label,
        theme,
        theme_group,
        subtopic,
        source,
        reason,
        confidence,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `,
    )
    labels.forEach((label) => {
      insert.run(
        `qgtl-${randomUUID()}`,
        questionGroupId,
        label.label,
        label.theme,
        label.themeGroup,
        label.subtopic,
        label.source || 'ai',
        label.reason || '',
        clampConfidence(label.confidence),
      )
    })
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

function normalizeSevenChoicesParseQuestion(item) {
  if (!item || typeof item !== 'object') return null
  const questionNo = optionalString(item.questionNo)
  if (!questionNo) return null
  const answer = normalizeAnswerValue(item.answer)
  const optionText = optionalString(item.optionText || item.sentence || item.option)
  const optionTranslation = optionalString(item.optionTranslation || item.translation)
  const positionContext = optionalString(item.positionContext || item.context || item.locationContext)
  const analysis = optionalString(item.analysis || item.explanation)
  if (!answer && !optionText && !analysis) return null
  return {
    questionNo,
    answer,
    optionText,
    optionTranslation,
    positionContext,
    analysis,
  }
}

function normalizeClozeDistractor(item) {
  if (!item || typeof item !== 'object') return null
  const option = optionalString(item.option).toUpperCase()
  const text = optionalString(item.text)
  const reason = optionalString(item.reason)
  if (!option && !text && !reason) return null
  return { option, text, reason }
}

function normalizeClozeParseQuestion(item) {
  if (!item || typeof item !== 'object') return null
  const questionNo = optionalString(item.questionNo)
  if (!questionNo) return null
  const answer = normalizeAnswerValue(item.answer)
  const answerText = optionalString(item.answerText)
  const answerMeaning = optionalString(item.answerMeaning)
  const analysis = optionalString(item.analysis)
  if (!answer && !answerText && !analysis) return null
  const distractorAnalysis = Array.isArray(item.distractorAnalysis)
    ? item.distractorAnalysis.map(normalizeClozeDistractor).filter(Boolean)
    : []
  return {
    questionNo,
    answer,
    answerText,
    answerMeaning,
    analysis,
    distractorAnalysis,
  }
}

function saveClozeParseResult(questionGroupId, input) {
  const db = openDatabase({ readOnly: false })
  try {
    const payload = input?.clozeParseResult && typeof input.clozeParseResult === 'object'
      ? input.clozeParseResult
      : {}
    const questions = Array.isArray(payload?.questions)
      ? payload.questions.map((item) => normalizeClozeParseQuestion(item)).filter(Boolean)
      : []
    if (questions.length === 0) {
      throw new Error('AI 完形填空解析没有有效小题内容，无法保存。')
    }
    const normalizedPayload = {
      questionGroupId,
      title: optionalString(payload.title),
      questionCount: Number(payload.questionCount || questions.length),
      parsedCount: questions.length,
      answerLine: optionalString(payload.answerLine),
      storyTitle: optionalString(payload.storyTitle),
      storySummary: optionalString(payload.storySummary),
      condensedStory: optionalString(payload.condensedStory),
      questions,
      requestId: optionalString(payload.requestId),
      provider: optionalString(payload.provider) || 'deepseek',
      model: optionalString(payload.model),
      keySource: optionalString(payload.keySource),
      keyFingerprint: optionalString(payload.keyFingerprint) || optionalString(payload.keyMask),
      thinkingMode: payload.thinkingMode === true,
      totalLatencyMs: Number(payload.totalLatencyMs || 0) || undefined,
    }
    const json = JSON.stringify(normalizedPayload)
    const existing = db.prepare('SELECT id FROM reading_parse_results WHERE question_group_id = ?').get(questionGroupId)
    if (existing) {
      db.prepare('UPDATE reading_parse_results SET cloze_payload_json = ?, updated_at = datetime(\'now\') WHERE question_group_id = ?')
        .run(json, questionGroupId)
    } else {
      db.prepare('INSERT INTO reading_parse_results (id, question_group_id, cloze_payload_json, provider, model) VALUES (?, ?, ?, \'deepseek\', ?)')
        .run(`rpr-${randomUUID()}`, questionGroupId, json, normalizedPayload.model || '')
    }
    return {
      clozeParseResult: getSavedClozeParseResult(db, questionGroupId),
      questionGroupId,
    }
  } finally {
    db.close()
  }
}

function saveGrammarParseResult(questionGroupId, input) {
  const db = openDatabase({ readOnly: false })
  try {
    const payload = input?.grammarParseResult && typeof input.grammarParseResult === 'object'
      ? input.grammarParseResult
      : {}
    const json = JSON.stringify(payload)
    const existing = db.prepare('SELECT id FROM reading_parse_results WHERE question_group_id = ?').get(questionGroupId)
    if (existing) {
      db.prepare('UPDATE reading_parse_results SET grammar_payload_json = ?, updated_at = datetime(\'now\') WHERE question_group_id = ?')
        .run(json, questionGroupId)
    } else {
      db.prepare('INSERT INTO reading_parse_results (id, question_group_id, grammar_payload_json, provider, model) VALUES (?, ?, ?, \'deepseek\', ?)')
        .run(`rpr-${randomUUID()}`, questionGroupId, json, payload.model || '')
    }
    return {
      grammarParseResult: getSavedGrammarParseResult(db, questionGroupId),
      questionGroupId,
    }
  } finally {
    db.close()
  }
}

function saveSevenChoicesParseResult(questionGroupId, input) {
  const db = openDatabase({ readOnly: false })
  try {
    const payload = input?.sevenChoicesParseResult && typeof input.sevenChoicesParseResult === 'object'
      ? input.sevenChoicesParseResult
      : {}
    const questions = Array.isArray(payload?.questions)
      ? payload.questions.map((item) => normalizeSevenChoicesParseQuestion(item)).filter(Boolean)
      : []
    if (questions.length === 0) {
      throw new Error('AI 七选五解析没有有效小题内容，无法保存。')
    }
    const normalizedPayload = {
      questionGroupId,
      title: optionalString(payload.title),
      questionCount: Number(payload.questionCount || questions.length),
      parsedCount: questions.length,
      answerLine: optionalString(payload.answerLine),
      articleSummary: optionalString(payload.articleSummary),
      questions,
      requestId: optionalString(payload.requestId),
      provider: optionalString(payload.provider) || 'deepseek',
      model: optionalString(payload.model),
      keySource: optionalString(payload.keySource),
      keyFingerprint: optionalString(payload.keyFingerprint) || optionalString(payload.keyMask),
      thinkingMode: payload.thinkingMode === true,
      totalLatencyMs: Number(payload.totalLatencyMs || 0) || undefined,
    }
    const json = JSON.stringify(normalizedPayload)
    const existing = db.prepare('SELECT id FROM reading_parse_results WHERE question_group_id = ?').get(questionGroupId)
    if (existing) {
      db.prepare('UPDATE reading_parse_results SET seven_choices_payload_json = ?, updated_at = datetime(\'now\') WHERE question_group_id = ?')
        .run(json, questionGroupId)
    } else {
      db.prepare('INSERT INTO reading_parse_results (id, question_group_id, seven_choices_payload_json, provider, model) VALUES (?, ?, ?, \'deepseek\', ?)')
        .run(`rpr-${randomUUID()}`, questionGroupId, json, normalizedPayload.model || '')
    }
    return {
      sevenChoicesParseResult: getSavedSevenChoicesParseResult(db, questionGroupId),
      questionGroupId,
    }
  } finally {
    db.close()
  }
}

function rowToQuestionGroupCard(
  row,
  paperSurfaceAnalysisAvailabilityByGroupId = new Map(),
  draftContext = EMPTY_DRAFT_CONTEXT,
  printReadyOverride = null,
) {
  const paperSurfaceAnalysis = paperSurfaceAnalysisAvailabilityByGroupId.get(row.id)
  const printReady = printReadyOverride || { ok: false, reason: '未验证打印状态' }
  const draftPaperButtonState = buildDraftButtonState(printReady, draftContext, row.id)
  return {
    id: row.id,
    title: row.title,
    source: [row.year, row.region, row.paper_name].filter(Boolean).join(' '),
    sourceType: row.source_type,
    year: row.year,
    region: row.region,
    paperName: row.paper_name,
    section: row.section,
    passageTitle: row.passage_title,
    summary: row.summary,
    groupType: row.group_type,
    questionCount: row.question_count,
    difficulty: row.difficulty,
    tags: row.tags ? String(row.tags).split(',').filter(Boolean) : [],
    topicLabels: Array.isArray(row.topicLabels) ? row.topicLabels : [],
    hit: row.hit,
    answerPreview: row.answer_preview,
    defaultScore: row.default_score,
    hasPaperSurfaceAnalysis: Boolean(paperSurfaceAnalysis?.href),
    paperSurfaceHref: paperSurfaceAnalysis?.href || null,
    paperSurfaceLabel: paperSurfaceAnalysis?.label || null,
    canAddToDraftPaper: printReady.ok && draftPaperButtonState === 'add',
    draftPaperButtonState,
    currentDraftPaperId: draftContext.currentDraftPaperId,
    printUnavailableReason: printReady.ok ? null : printReady.reason,
  }
}

function paperAssetExamYear(asset) {
  const text = [asset?.paper?.paperId, asset?.paper?.title, asset?.paper?.source].join(' ')
  const match = text.match(/\b(20\d{2})\b/)
  return match ? Number(match[1]) : new Date().getFullYear()
}

function paperAssetRegion(asset) {
  const source = String(asset?.paper?.source || '')
  if (source.includes('九省')) return '九省联考'
  if (source.includes('新课标')) return '新课标'
  return '未标地区'
}

function paperAssetGroupSection(group) {
  const groupType = normalizePaperAssetGroupType(group?.groupType)
  const title = String(group?.title || '').trim()
  const readingMatch = title.match(/Reading\s*([A-G])/i)
  if (groupType === 'reading' && readingMatch) return `阅读理解 ${readingMatch[1].toUpperCase()}`
  if (groupType === 'seven_choices') return '七选五'
  return title || groupTypeLabels[groupType] || '题组'
}

function paperAssetPassageTitle(group) {
  const paragraphs = Array.isArray(group?.passage?.paragraphs) ? group.passage.paragraphs : []
  const first = String(paragraphs[0]?.text || '').trim()
  const title = String(group?.title || '').trim()
  return first || title || '篇章题组'
}

function paperAssetSummary(group) {
  const paragraphs = Array.isArray(group?.passage?.paragraphs) ? group.passage.paragraphs : []
  return paragraphs
    .slice(0, 2)
    .map((paragraph) => String(paragraph?.text || '').trim())
    .filter(Boolean)
    .join(' ')
    .slice(0, 180)
}

function paperAssetFirstQuestionHit(asset, group) {
  const questionId = Array.isArray(group?.questionIds) ? String(group.questionIds[0] || '') : ''
  const question = questionId ? asset?.content?.questions?.[questionId] : null
  return String(question?.stem ?? question?.blankId ?? question?.questionNo ?? '').trim()
}

function paperAssetAnswerPreview(asset, group) {
  const questionId = Array.isArray(group?.questionIds) ? String(group.questionIds[0] || '') : ''
  const answer = questionId ? asset?.answerKey?.answers?.[questionId] : null
  return String(answer?.answer || '').trim()
}

function buildPaperAssetQuestionGroupCard(asset, group, paperSurfaceAnalysis, draftContext) {
  const groupId = String(group?.groupId || '')
  const groupType = normalizePaperAssetGroupType(group?.groupType) || 'other'
  const printReady = getPaperAssetPrintReady(asset, group)
  const draftPaperButtonState = buildDraftButtonState(printReady, draftContext, groupId)
  const section = paperAssetGroupSection(group)
  const passageTitle = paperAssetPassageTitle(group)
  const paperTitle = String(asset?.paper?.title || 'paper-asset 试卷').trim()
  const source = String(asset?.paper?.source || '').trim()
  const questionIds = Array.isArray(group?.questionIds) ? group.questionIds.map(String) : []

  return {
    id: groupId,
    title: `${source || paperTitle} ${section}`.trim(),
    source: source || paperTitle,
    sourceType: 'real_exam',
    year: paperAssetExamYear(asset),
    region: paperAssetRegion(asset),
    paperName: paperTitle,
    section,
    passageTitle,
    summary: paperAssetSummary(group),
    groupType,
    questionCount: questionIds.length,
    difficulty: 'medium',
    tags: [paperAssetRegion(asset), groupTypeLabels[groupType]].filter(Boolean),
    topicLabels: [],
    hit: paperAssetFirstQuestionHit(asset, group),
    answerPreview: paperAssetAnswerPreview(asset, group),
    defaultScore: groupType === 'seven_choices' ? 2.5 : 2.5,
    hasPaperSurfaceAnalysis: Boolean(paperSurfaceAnalysis?.href),
    paperSurfaceHref: paperSurfaceAnalysis?.href || null,
    paperSurfaceLabel: paperSurfaceAnalysis?.label || null,
    canAddToDraftPaper: printReady.ok && draftPaperButtonState === 'add',
    draftPaperButtonState,
    currentDraftPaperId: draftContext.currentDraftPaperId,
    printUnavailableReason: printReady.ok ? null : printReady.reason,
  }
}

function listPaperAssetAnalysisGroupCards(paperSurfaceAnalysisAvailabilityByGroupId, draftContext, existingGroupIds = new Set()) {
  if (!existsSync(paperAssetsDir)) return []
  const cards = []
  for (const entry of readdirSync(paperAssetsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const { assetPath } = resolvePaperAssetReadPaths(paperAssetsDir, entry.name)
    if (!existsSync(assetPath)) continue
    try {
      const asset = readJsonFile(assetPath)
      const groups = asset?.content?.groups && typeof asset.content.groups === 'object'
        ? Object.values(asset.content.groups)
        : []
      for (const group of groups) {
        const groupId = String(group?.groupId || '')
        if (!groupId || existingGroupIds.has(groupId)) continue
        const paperSurfaceAnalysis = paperSurfaceAnalysisAvailabilityByGroupId.get(groupId)
        if (!paperSurfaceAnalysis?.href || !paperSurfaceAnalysis?.label) continue
        cards.push(buildPaperAssetQuestionGroupCard(asset, group, paperSurfaceAnalysis, draftContext))
      }
    } catch {
      // Invalid paper assets are ignored here; import validation owns data errors.
    }
  }
  return cards
}

function selectQuestionGroupCards(db, whereClause = '', params = [], draftContext = EMPTY_DRAFT_CONTEXT) {
  const rows = db
    .prepare(
      `
        SELECT
          id,
          title,
          source_type,
          year,
          region,
          paper_name,
          section,
          passage_title,
          summary,
          group_type,
          default_score,
          difficulty,
          question_count,
          hit,
          answer_preview,
          tags
        FROM v_question_group_cards
        ${whereClause}
        -- Within one paper, order groups by their true paper position
        -- (question_groups.display_order). The previous ORDER BY sorted the
        -- section TEXT, and Chinese numerals sort by codepoint (三 < 二), so
        -- 第三部分 came before 第二部分 in the find-page paper directory.
        ORDER BY
          year DESC,
          region,
          paper_name,
          (SELECT qg.display_order FROM question_groups qg WHERE qg.id = v_question_group_cards.id),
          title
      `,
    )
    .all(...params)

  const topicLabelsByGroupId = getTopicLabelsForQuestionGroups(
    db,
    rows.map((row) => row.id),
  )
  const paperSurfaceAnalysisAvailabilityByGroupId = getPaperSurfaceAnalysisAvailabilityByGroupId()
  const printReadyByGroupId = getPrintReadyByGroupId(
    db,
    rows.map((row) => row.id),
  )

  const cards = rows.map((row) => {
    const printReady = printReadyByGroupId.get(row.id)
    return rowToQuestionGroupCard({
      ...row,
      topicLabels: topicLabelsByGroupId.get(row.id) || [],
    }, paperSurfaceAnalysisAvailabilityByGroupId, draftContext, printReady)
  })
  if (!whereClause) {
    cards.push(...listPaperAssetAnalysisGroupCards(
      paperSurfaceAnalysisAvailabilityByGroupId,
      draftContext,
      new Set(cards.map((card) => card.id)),
    ))
  }
  return cards
}

function listQuestionGroups(userId) {
  const db = openDatabase()

  try {
    return selectQuestionGroupCards(db, '', [], getDraftSearchContext(userId))
  } finally {
    db.close()
  }
}

function buildQuestionDetailsFromPaperAsset(asset, group, dbQuestions) {
  const dbQuestionById = new Map(dbQuestions.map((question) => [question.id, question]))
  const answerById = asset?.answerKey?.answers && typeof asset.answerKey.answers === 'object'
    ? asset.answerKey.answers
    : {}
  const assetQuestions = asset?.content?.questions && typeof asset.content.questions === 'object'
    ? asset.content.questions
    : {}
  const sharedOptionBank = Array.isArray(group?.optionBank) ? group.optionBank : []
  const questionIds = Array.isArray(group?.questionIds) ? group.questionIds.map(String) : []

  return questionIds.map((questionId, index) => {
    const assetQuestion = assetQuestions[questionId] || {}
    const dbQuestion = dbQuestionById.get(questionId) || {}
    const answer = answerById[questionId] || {}
    const options = Array.isArray(assetQuestion.options) && assetQuestion.options.length > 0
      ? assetQuestion.options
      : sharedOptionBank

    return {
      id: questionId,
      questionNo: String(assetQuestion.questionNo ?? answer.questionNo ?? dbQuestion.question_no ?? index + 1),
      questionType: dbQuestion.question_type || '',
      stem: String(assetQuestion.stem ?? assetQuestion.blankId ?? dbQuestion.stem ?? '').trim(),
      answer: String(answer.answer ?? dbQuestion.answer ?? '').trim(),
      explanation: dbQuestion.explanation || '',
      difficulty: dbQuestion.difficulty || '',
      aiDifficultyScore: dbQuestion.ai_difficulty_score ?? null,
      teacherDifficulty: dbQuestion.teacher_difficulty ?? null,
      difficultyOverrideReason: dbQuestion.difficulty_override_reason || '',
      difficultyOverrideNote: dbQuestion.difficulty_override_note || '',
      difficultyTaggedAt: dbQuestion.difficulty_tagged_at || '',
      score: Number(answer.score ?? dbQuestion.score ?? 0),
      displayOrder: index + 1,
      note: dbQuestion.note || '',
      options: options.map((option, optionIndex) => ({
        id: `${questionId}-${String(option?.label || optionIndex + 1).toLowerCase()}`,
        label: String(option?.label || '').trim(),
        content: String(option?.text || option?.content || '').trim(),
        displayOrder: optionIndex + 1,
      })).filter((option) => option.label && option.content),
    }
  })
}

// writing-box-starters (owner 拍板 2026-07-16, Locked Decision 1): expose the
// group's own writing task (taskType + continuationStarters) as a read-only,
// additive `detail.writingTask` field — sourced from the asset's existing
// `content.writingTasks` map, no schema/DB change. Only attached when the
// group carries a `writingTaskId` AND that id resolves in the asset; every
// consumer keeps using optional chaining, so groups without a hit (e.g.
// non-writing groups, or an asset missing the task) are unaffected.
function applyPaperAssetToQuestionGroupDetail(baseDetail, asset, group, dbQuestions) {
  const materialText = paperAssetParagraphText(group)
  const groupType = normalizePaperAssetGroupType(group?.groupType) || baseDetail.groupType
  const writingTaskId = group?.writingTaskId
  const writingTask = writingTaskId ? asset?.content?.writingTasks?.[writingTaskId] : null
  return {
    ...baseDetail,
    paperId: String(asset?.paper?.paperId || '').trim() || null,
    groupType,
    passage: {
      ...baseDetail.passage,
      materialText: materialText || baseDetail.passage.materialText,
      title: String(group?.title || baseDetail.passage.title || '').trim(),
    },
    questions: buildQuestionDetailsFromPaperAsset(asset, group, dbQuestions),
    ...(writingTask
      ? { writingTask: { taskType: writingTask.taskType, continuationStarters: writingTask.continuationStarters } }
      : {}),
  }
}

export function getQuestionGroupDetail(id) {
  const db = openDatabase()

  try {
    const card = selectQuestionGroupCards(db, 'WHERE id = ?', [id])[0]
    if (!card) return null

    const detail = db
      .prepare(
        `
        SELECT
          qg.id AS group_id,
          qg.instruction,
          qg.note AS group_note,
          p.id AS passage_id,
          p.material_text,
          p.theme,
          p.discourse_type,
          p.word_count,
          p.note AS passage_note,
          s.id AS source_id,
          s.publisher,
          s.original_url,
          s.file_ref,
          s.note AS source_note
        FROM question_groups qg
        JOIN passages p ON p.id = qg.passage_id
        JOIN sources s ON s.id = p.source_id
        WHERE qg.id = ?
        `,
      )
      .get(id)

    const questions = db
      .prepare(
        `
        SELECT
          id,
          question_no,
          question_type,
          stem,
          answer,
          explanation,
          difficulty,
          ai_difficulty_score,
          teacher_difficulty,
          difficulty_override_reason,
          difficulty_override_note,
          difficulty_tagged_at,
          score,
          display_order,
          note
        FROM questions
        WHERE group_id = ?
        ORDER BY display_order, question_no
        `,
      )
      .all(id)

    const selectOptions = db.prepare(
      `
      SELECT id, label, content, display_order
      FROM options
      WHERE question_id = ?
      ORDER BY display_order, label
      `,
    )
    const readingParseResult = getSavedReadingParseResult(db, id)
    const readingVerifyResult = getSavedReadingVerifyResult(db, id)
    const grammarParseResult = getSavedGrammarParseResult(db, id)
    const clozeParseResult = getSavedClozeParseResult(db, id)
    const sevenChoicesParseResult = getSavedSevenChoicesParseResult(db, id)

    const baseDetail = {
      ...card,
      instruction: detail.instruction,
      note: detail.group_note || '',
      sourceDetail: {
        id: detail.source_id,
        publisher: detail.publisher || '',
        originalUrl: detail.original_url || '',
        fileRef: detail.file_ref || '',
        note: detail.source_note || '',
      },
      passage: {
        id: detail.passage_id,
        title: card.passageTitle,
        materialText: detail.material_text || '',
        summary: card.summary,
        theme: detail.theme || '',
        discourseType: detail.discourse_type || '',
        wordCount: detail.word_count || null,
        note: detail.passage_note || '',
      },
      questions: questions.map((question) => rowToQuestionDetail(question, selectOptions.all(question.id))),
      readingParseResult,
      readingVerifyResult,
      clozeParseResult,
      grammarParseResult,
      sevenChoicesParseResult,
    }
    const paperAssetMatch = findPaperAssetGroup(id)
    if (paperAssetMatch) {
      return applyPaperAssetToQuestionGroupDetail(baseDetail, paperAssetMatch.asset, paperAssetMatch.group, questions)
    }
    return baseDetail
  } finally {
    db.close()
  }
}

function rowToQuestionDetail(question, options = []) {
  return {
    id: question.id,
    questionNo: question.question_no,
    questionType: question.question_type,
    stem: question.stem,
    answer: question.answer,
    explanation: question.explanation,
    difficulty: question.difficulty,
    aiDifficultyScore: question.ai_difficulty_score ?? null,
    teacherDifficulty: question.teacher_difficulty ?? null,
    difficultyOverrideReason: question.difficulty_override_reason || '',
    difficultyOverrideNote: question.difficulty_override_note || '',
    difficultyTaggedAt: question.difficulty_tagged_at || '',
    score: question.score,
    displayOrder: question.display_order,
    note: question.note || '',
    options: options.map((option) => ({
      id: option.id,
      label: option.label,
      content: option.content,
      displayOrder: option.display_order,
    })),
  }
}

function getQuestionDetailById(db, questionId) {
  const question = db
    .prepare(
      `
      SELECT
        id,
        question_no,
        question_type,
        stem,
        answer,
        explanation,
        difficulty,
        ai_difficulty_score,
        teacher_difficulty,
        difficulty_override_reason,
        difficulty_override_note,
        difficulty_tagged_at,
        score,
        display_order,
        note
      FROM questions
      WHERE id = ?
      `,
    )
    .get(questionId)
  if (!question) return null

  const options = db
    .prepare(
      `
      SELECT id, label, content, display_order
      FROM options
      WHERE question_id = ?
      ORDER BY display_order, label
      `,
    )
    .all(questionId)

  return rowToQuestionDetail(question, options)
}

function saveQuestionDifficultyRating(questionId, input) {
  const db = openDatabase({ readOnly: false })
  try {
    const question = db
      .prepare(
        `
        SELECT id, ai_difficulty_score
        FROM questions
        WHERE id = ?
        `,
      )
      .get(questionId)
    if (!question) return null

    const inputAiDifficultyScore = normalizeAiDifficultyScore(input?.aiDifficultyScore || input?.ai_difficulty_score)
    const validationQuestion = {
      ...question,
      ai_difficulty_score: question.ai_difficulty_score ?? inputAiDifficultyScore,
    }
    const payload = normalizeTeacherDifficultyPayload(input, validationQuestion)
    db.prepare(
      `
      UPDATE questions
      SET
        ai_difficulty_score = COALESCE(ai_difficulty_score, ?),
        teacher_difficulty = ?,
        difficulty_override_reason = ?,
        difficulty_override_note = ?,
        difficulty_tagged_at = CASE WHEN ? IS NULL THEN NULL ELSE datetime('now') END
      WHERE id = ?
      `,
    ).run(
      inputAiDifficultyScore,
      payload.teacherDifficulty,
      payload.difficultyOverrideReason,
      payload.difficultyOverrideNote,
      payload.teacherDifficulty,
      questionId,
    )

    return getQuestionDetailById(db, questionId)
  } finally {
    db.close()
  }
}

function readJsonBody(request, { maxBytes = 1_000_000 } = {}) {
  return readJsonRouteBody(request, { maxBytes })
}

function requiredString(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} is required`)
  }

  return value.trim()
}

function optionalString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function requiredEnum(value, allowed, label) {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new Error(`${label} is invalid`)
  }

  return value
}

function nullableIntegerInRange(value, min, max, label) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new Error(`${label} is invalid`)
  }
  return number
}

function mapAiDifficultyScoreToFive(value) {
  const score = nullableIntegerInRange(value, 1, 10, 'AI difficulty score')
  if (score === null) return null
  if (score <= 2) return 1
  if (score <= 3) return 2
  if (score <= 6) return 3
  if (score <= 8) return 4
  return 5
}

function normalizeAiDifficultyScore(value) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  if (!Number.isInteger(number) || number < 1 || number > 10) return null
  return number
}

const TEACHER_DIFFICULTY_REASONS = new Set([
  'vocab',
  'syntax',
  'location',
  'abstractness',
  'distractor',
  'topic',
  'other',
])

function normalizeTeacherDifficultyPayload(input, question) {
  const teacherDifficulty = nullableIntegerInRange(input?.teacherDifficulty, 1, 5, 'teacherDifficulty')
  const rawReason = optionalString(input?.difficultyOverrideReason || input?.reason)
  const difficultyOverrideReason = rawReason && TEACHER_DIFFICULTY_REASONS.has(rawReason) ? rawReason : ''
  const difficultyOverrideNote = safeTruncate(optionalString(input?.difficultyOverrideNote || input?.note), 500)

  if (rawReason && !difficultyOverrideReason) {
    throw new Error('difficultyOverrideReason is invalid')
  }

  if (teacherDifficulty === null) {
    return {
      teacherDifficulty: null,
      difficultyOverrideReason: '',
      difficultyOverrideNote: '',
    }
  }

  const aiBucket = mapAiDifficultyScoreToFive(question?.ai_difficulty_score)
  if (aiBucket !== null && aiBucket !== teacherDifficulty && !difficultyOverrideReason) {
    throw new Error('老师确认难度偏离 AI 建议档位时，需要选择偏差原因。')
  }

  return {
    teacherDifficulty,
    difficultyOverrideReason,
    difficultyOverrideNote,
  }
}

function normalizeTags(value) {
  const rawTags = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[,，、\n]/)
      : []

  return Array.from(new Set(rawTags.map((tag) => String(tag).trim()).filter(Boolean))).slice(0, 12)
}

function normalizeDraftText(text) {
  return String(text || '')
    .replace(/\\n/g, '\n')
    .replace(/\r\n?/g, '\n')
    .replace(/<\/?w:[^>]*>/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/[\t]+/g, ' ')
    .replace(/[ ]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function cleanDraftText(text) {
  return normalizeDraftText(text).replace(/[^\S\u3000]+\n/g, '\n').replace(/\n[^\S\u3000]+/g, '\n').trim()
}

function normalizeAnswerValue(value) {
  return cleanDraftText(value)
    .replace(/^[：:，,。．.\s]+/, '')
    .replace(/[。．.\s]+$/, '')
    .trim()
}

function normalizeOptions(value) {
  const rawOptions = Array.isArray(value) ? value : []

  return rawOptions
    .map((option, index) => {
      const optionInput = option && typeof option === 'object' ? option : {}
      return {
        label: optionalString(optionInput.label) || String.fromCharCode(65 + index),
        content: optionalString(optionInput.content),
      }
    })
    .filter((option) => option.content)
    .slice(0, 12)
}

function normalizeQuestions(input, fallbackDifficulty, fallbackScore) {
  const rawQuestions = Array.isArray(input.questions) ? input.questions : []
  const questions = rawQuestions
    .map((question, index) => {
      const questionInput = question && typeof question === 'object' ? question : {}

      return {
        questionNo: optionalString(questionInput.questionNo) || String(index + 1),
        questionType: optionalString(questionInput.questionType) || optionalString(input.questionType) || '待分类',
        stem: optionalString(questionInput.stem),
        answer: optionalString(questionInput.answer),
        explanation: optionalString(questionInput.explanation),
        difficulty: requiredEnum(questionInput.difficulty || fallbackDifficulty, ['low', 'medium', 'high'], 'question difficulty'),
        score: Math.max(0, Number.isFinite(Number(questionInput.score)) ? Number(questionInput.score) : fallbackScore),
        note: optionalString(questionInput.note),
        options: normalizeOptions(questionInput.options),
      }
    })
    .filter((question) => question.stem)
    .slice(0, 99)

  if (questions.length > 0) return questions

  return [
    {
      questionNo: '1',
      questionType: optionalString(input.questionType) || '待分类',
      stem: requiredString(input.questionStem, 'questionStem'),
      answer: optionalString(input.answer),
      explanation: optionalString(input.explanation),
      difficulty: fallbackDifficulty,
      score: fallbackScore,
      note: '',
      options: normalizeOptions(input.options),
    },
  ]
}

function upsertQuestionGroupTags(db, groupId, tags, input = {}) {
  db.prepare("DELETE FROM tag_links WHERE target_type = 'question_group' AND target_id = ?").run(groupId)

  for (const tagName of tags) {
    let tag = db.prepare('SELECT id FROM tags WHERE name = ?').get(tagName)

    if (!tag) {
      const tagId = `tag-${randomUUID()}`
      db.prepare(
        `
        INSERT INTO tags (id, name, category, description, is_active)
        VALUES (?, ?, ?, ?, 1)
        `,
      ).run(tagId, tagName, optionalString(input.tagCategory) || '教师标签', '')
      tag = { id: tagId }
    }

    db.prepare(
      `
      INSERT OR IGNORE INTO tag_links (id, tag_id, target_type, target_id)
      VALUES (?, ?, 'question_group', ?)
      `,
    ).run(`tl-${randomUUID()}`, tag.id, groupId)
  }
}

function insertQuestionRows(db, groupId, questions, requestedQuestionCount, difficulty, defaultScore) {
  const insertQuestion = db.prepare(
    `
    INSERT INTO questions (id, group_id, question_no, question_type, stem, answer, explanation, difficulty, score, display_order, note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  )
  const insertOption = db.prepare(
    `
    INSERT INTO options (id, question_id, label, content, display_order)
    VALUES (?, ?, ?, ?, ?)
    `,
  )

  questions.forEach((question, index) => {
    const questionId = `q-${randomUUID()}`
    insertQuestion.run(
      questionId,
      groupId,
      question.questionNo,
      question.questionType,
      question.stem,
      question.answer,
      question.explanation,
      question.difficulty,
      question.score,
      index + 1,
      question.note,
    )

    question.options.forEach((option, optionIndex) => {
      insertOption.run(`opt-${randomUUID()}`, questionId, option.label, option.content, optionIndex + 1)
    })
  })

  for (let index = questions.length + 1; index <= requestedQuestionCount; index += 1) {
    insertQuestion.run(
      `q-${randomUUID()}`,
      groupId,
      String(index),
      '待录入',
      `待录入题干 ${index}`,
      '',
      '',
      difficulty,
      defaultScore,
      index,
      '录题页自动生成的占位小题。',
    )
  }
}

function normalizeQuestionGroupPayload(input) {
  const sourceType = requiredEnum(input.sourceType, ['real_exam', 'mock_exam', 'self_made', 'other'], 'sourceType')
  const groupType = requiredEnum(
    input.groupType,
    ['reading', 'cloze', 'seven_choices', 'grammar_cloze', 'writing', 'continuation', 'listening', 'other'],
    'groupType',
  )
  const difficulty = requiredEnum(input.difficulty, ['low', 'medium', 'high'], 'difficulty')
  const year = Number(input.year)

  if (!Number.isInteger(year) || year < 1900 || year > 2100) {
    throw new Error('year is invalid')
  }

  const defaultScore = Math.max(0, Number(input.defaultScore || 0))
  const questions = normalizeQuestions(input, difficulty, defaultScore)
  const parsedQuestionCount = Number(input.questionCount)
  const requestedQuestionCount = Math.max(
    questions.length,
    Number.isFinite(parsedQuestionCount) ? Math.max(1, Math.min(99, Math.trunc(parsedQuestionCount))) : questions.length,
  )

  return {
    sourceType,
    groupType,
    difficulty,
    year,
    defaultScore,
    questions,
    requestedQuestionCount,
    tags: normalizeTags(input.tags),
  }
}

function createQuestionGroup(input) {
  const { sourceType, groupType, difficulty, year, defaultScore, questions, requestedQuestionCount, tags } =
    normalizeQuestionGroupPayload(input)
  const sourceId = `src-${randomUUID()}`
  const passageId = `passage-${randomUUID()}`
  const groupId = `g-${randomUUID()}`
  const db = openDatabase({ readOnly: false })

  try {
    db.exec('BEGIN')

    db.prepare(
      `
      INSERT INTO sources (id, source_type, year, region, paper_name, section, note)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
    ).run(
      sourceId,
      sourceType,
      year,
      requiredString(input.region, 'region'),
      requiredString(input.paperName, 'paperName'),
      requiredString(input.section, 'section'),
      optionalString(input.sourceNote),
    )

    db.prepare(
      `
      INSERT INTO passages (id, source_id, title, material_text, summary, theme, discourse_type, difficulty, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    ).run(
      passageId,
      sourceId,
      requiredString(input.passageTitle, 'passageTitle'),
      optionalString(input.materialText),
      requiredString(input.summary, 'summary'),
      optionalString(input.theme),
      optionalString(input.discourseType),
      difficulty,
      optionalString(input.passageNote),
    )

    db.prepare(
      `
      INSERT INTO question_groups (id, passage_id, group_type, title, instruction, display_order, default_score, difficulty, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    ).run(
      groupId,
      passageId,
      groupType,
      requiredString(input.groupTitle, 'groupTitle'),
      optionalString(input.instruction),
      1,
      defaultScore,
      difficulty,
      optionalString(input.groupNote),
    )

    insertQuestionRows(db, groupId, questions, requestedQuestionCount, difficulty, defaultScore)
    upsertQuestionGroupTags(db, groupId, tags, input)

    const [created] = selectQuestionGroupCards(db, 'WHERE id = ?', [groupId])
    db.exec('COMMIT')
    return created
  } catch (error) {
    try {
      db.exec('ROLLBACK')
    } catch {
      // Ignore rollback failures so the original error can be reported.
    }
    throw error
  } finally {
    db.close()
  }
}

function updateQuestionGroup(id, input) {
  const { sourceType, groupType, difficulty, year, defaultScore, questions, requestedQuestionCount, tags } =
    normalizeQuestionGroupPayload(input)
  const db = openDatabase({ readOnly: false })

  try {
    const existing = db
      .prepare(
        `
        SELECT
          qg.id AS group_id,
          qg.passage_id,
          qg.note AS group_note,
          p.source_id,
          p.note AS passage_note,
          s.note AS source_note
        FROM question_groups qg
        JOIN passages p ON p.id = qg.passage_id
        JOIN sources s ON s.id = p.source_id
        WHERE qg.id = ?
        `,
      )
      .get(id)

    if (!existing) return null

    db.exec('BEGIN')

    db.prepare(
      `
      UPDATE sources
      SET source_type = ?, year = ?, region = ?, paper_name = ?, section = ?, note = ?, updated_at = datetime('now')
      WHERE id = ?
      `,
    ).run(
      sourceType,
      year,
      requiredString(input.region, 'region'),
      requiredString(input.paperName, 'paperName'),
      requiredString(input.section, 'section'),
      input.sourceNote === undefined ? existing.source_note || '' : optionalString(input.sourceNote),
      existing.source_id,
    )

    db.prepare(
      `
      UPDATE passages
      SET title = ?, material_text = ?, summary = ?, theme = ?, discourse_type = ?, difficulty = ?, note = ?, updated_at = datetime('now')
      WHERE id = ?
      `,
    ).run(
      requiredString(input.passageTitle, 'passageTitle'),
      optionalString(input.materialText),
      requiredString(input.summary, 'summary'),
      optionalString(input.theme),
      optionalString(input.discourseType),
      difficulty,
      input.passageNote === undefined ? existing.passage_note || '' : optionalString(input.passageNote),
      existing.passage_id,
    )

    db.prepare(
      `
      UPDATE question_groups
      SET group_type = ?, title = ?, instruction = ?, default_score = ?, difficulty = ?, note = ?, updated_at = datetime('now')
      WHERE id = ?
      `,
    ).run(
      groupType,
      requiredString(input.groupTitle, 'groupTitle'),
      optionalString(input.instruction),
      defaultScore,
      difficulty,
      input.groupNote === undefined ? existing.group_note || '' : optionalString(input.groupNote),
      id,
    )

    db.prepare('DELETE FROM questions WHERE group_id = ?').run(id)
    insertQuestionRows(db, id, questions, requestedQuestionCount, difficulty, defaultScore)
    upsertQuestionGroupTags(db, id, tags, input)

    const [updated] = selectQuestionGroupCards(db, 'WHERE id = ?', [id])
    db.exec('COMMIT')
    return updated
  } catch (error) {
    try {
      db.exec('ROLLBACK')
    } catch {
      // Ignore rollback failures so the original error can be reported.
    }
    throw error
  } finally {
    db.close()
  }
}

function deleteQuestionGroup(id) {
  const db = openDatabase({ readOnly: false })

  try {
    const [group] = db
      .prepare(
        `
        SELECT qg.id, p.source_id
        FROM question_groups qg
        JOIN passages p ON p.id = qg.passage_id
        WHERE qg.id = ?
        `,
      )
      .all(id)

    if (!group) return null

    db.exec('PRAGMA foreign_keys = ON')
    db.exec('BEGIN')
    db.prepare("DELETE FROM tag_links WHERE target_type = 'question_group' AND target_id = ?").run(id)
    db.prepare('DELETE FROM paper_items WHERE item_type = ? AND item_id = ?').run('question_group', id)
    db.prepare('DELETE FROM sources WHERE id = ?').run(group.source_id)
    db.exec('COMMIT')
    return { id }
  } catch (error) {
    try { db.exec('ROLLBACK') } catch { /* ignore */ }
    throw error
  } finally {
    db.close()
  }
}

function createPaperSet(input) {
  const title = requiredString(input.title, 'title')
  const items = Array.isArray(input.items) ? input.items : []
  const existingId = optionalString(input.id) || null

  if (items.length === 0) {
    throw new Error('items are required')
  }

  const db = openDatabase({ readOnly: false })
  const paperSetId = existingId || `paper-${randomUUID()}`
  let totalQuestions = 0
  let totalScore = 0

  try {
    db.exec('BEGIN')

    if (existingId) {
      const [existing] = db.prepare('SELECT id FROM paper_sets WHERE id = ?').all(existingId)
      if (!existing) {
        throw new Error(`Paper set not found: ${existingId}`)
      }

      db.prepare('DELETE FROM paper_items WHERE paper_set_id = ?').run(existingId)

      db.prepare(
        `
        UPDATE paper_sets
        SET title = ?, student_version_title = ?, teacher_version_title = ?, description = ?, updated_at = datetime('now')
        WHERE id = ?
        `,
      ).run(title, `${title}（学生版）`, `${title}（教师版）`, optionalString(input.description), existingId)
    } else {
      db.prepare(
        `
        INSERT INTO paper_sets (id, title, set_type, student_version_title, teacher_version_title, description)
        VALUES (?, ?, 'training', ?, ?, ?)
        `,
      ).run(paperSetId, title, `${title}（学生版）`, `${title}（教师版）`, optionalString(input.description))
    }

    const insertItem = db.prepare(
      `
      INSERT INTO paper_items (id, paper_set_id, item_type, item_id, display_order, score_override, section_title, note)
      VALUES (?, ?, 'question_group', ?, ?, ?, ?, ?)
      `,
    )

    items.forEach((item, index) => {
      const itemInput = item && typeof item === 'object' ? item : {}
      const questionGroupId = requiredString(itemInput.questionGroupId, 'questionGroupId')
      const [card] = selectQuestionGroupCards(db, 'WHERE id = ?', [questionGroupId])

      if (!card) {
        throw new Error(`questionGroupId not found: ${questionGroupId}`)
      }

      const score = Math.max(0, Number.isFinite(Number(itemInput.score)) ? Number(itemInput.score) : card.defaultScore)
      totalQuestions += card.questionCount
      totalScore += score * card.questionCount

      insertItem.run(
        `paper-item-${randomUUID()}`,
        paperSetId,
        questionGroupId,
        index + 1,
        score,
        optionalString(itemInput.sectionTitle),
        optionalString(itemInput.note),
      )
    })

    // Write layout_json only if explicitly provided in input
    if (Object.prototype.hasOwnProperty.call(input, 'layout')) {
      const layoutJson = input.layout ? JSON.stringify(input.layout) : null
      db.prepare('UPDATE paper_sets SET layout_json = ? WHERE id = ?').run(layoutJson, paperSetId)
    }

    db.exec('COMMIT')

    return {
      id: paperSetId,
      title,
      itemCount: items.length,
      totalQuestions,
      totalScore,
    }
  } catch (error) {
    try {
      db.exec('ROLLBACK')
    } catch {
      // Ignore rollback failures so the original error can be reported.
    }
    throw error
  } finally {
    db.close()
  }
}

function rowToPaperSetSummary(row) {
  return {
    id: row.id,
    title: row.title,
    itemCount: row.item_count,
    totalQuestions: row.total_questions,
    totalScore: row.total_score,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function selectPaperSetSummaries(db, whereClause = '', params = []) {
  return db
    .prepare(
      `
      SELECT
        ps.id,
        ps.title,
        ps.created_at,
        ps.updated_at,
        COUNT(pi.id) AS item_count,
        COALESCE(SUM(
          CASE
            WHEN pi.item_type = 'question_group' THEN card.question_count
            ELSE 1
          END
        ), 0) AS total_questions,
        COALESCE(SUM(
          CASE
            WHEN pi.item_type = 'question_group' THEN card.question_count * COALESCE(pi.score_override, card.default_score)
            ELSE COALESCE(pi.score_override, 0)
          END
        ), 0) AS total_score
      FROM paper_sets ps
      LEFT JOIN paper_items pi ON pi.paper_set_id = ps.id
      LEFT JOIN v_question_group_cards card ON card.id = pi.item_id AND pi.item_type = 'question_group'
      ${whereClause}
      GROUP BY ps.id, ps.title, ps.created_at, ps.updated_at
      ORDER BY ps.updated_at DESC, ps.created_at DESC
      `,
    )
    .all(...params)
    .map(rowToPaperSetSummary)
}

function listPaperSets() {
  const db = openDatabase()

  try {
    return selectPaperSetSummaries(db)
  } finally {
    db.close()
  }
}

function getPaperSet(id) {
  const db = openDatabase()

  try {
    const [summary] = selectPaperSetSummaries(db, 'WHERE ps.id = ?', [id])
    if (!summary) return null

    // Read layout_json
    const [psRow] = db.prepare('SELECT layout_json FROM paper_sets WHERE id = ?').all(id)
    const rawLayoutJson = psRow?.layout_json || null

    const rows = db
      .prepare(
        `
        SELECT
          id,
          item_type,
          item_id,
          display_order,
          score_override,
          section_title,
          note
        FROM paper_items
        WHERE paper_set_id = ?
        ORDER BY display_order
        `,
      )
      .all(id)

    const items = rows.map((item) => {
      const [questionGroup] = selectQuestionGroupCards(db, 'WHERE id = ?', [item.item_id])

      return {
        id: item.id,
        itemType: item.item_type,
        itemId: item.item_id,
        displayOrder: item.display_order,
        score: Number.isFinite(Number(item.score_override))
          ? Number(item.score_override)
          : questionGroup?.defaultScore || 0,
        sectionTitle: item.section_title || '',
        note: item.note || '',
        questionGroup,
      }
    })

    // Sanitize layout against paper_items
    const { layout, layoutWarnings } = sanitizePaperSetLayout(rawLayoutJson, items)

    return {
      ...summary,
      items,
      layout,
      layoutWarnings,
    }
  } finally {
    db.close()
  }
}

function sanitizePaperSetLayout(rawLayoutJson, items) {
  const warnings = []
  if (!rawLayoutJson) return { layout: null, layoutWarnings: [] }

  let parsed
  try {
    parsed = JSON.parse(rawLayoutJson)
  } catch {
    return { layout: null, layoutWarnings: ['布局数据解析失败，已忽略'] }
  }

  if (!parsed || !Array.isArray(parsed.blocks)) {
    return { layout: null, layoutWarnings: [] }
  }

  // paper_items is authoritative for valid groups and scores
  const itemByGroupId = new Map(
    items.filter((i) => i.questionGroup).map((i) => [i.itemId, i])
  )

  // Filter blocks: keep section_header/page_break, keep valid question_group (first occurrence only), remove invalid/duplicate
  const sanitizedBlocks = []
  const seenGroupIds = new Set()

  for (const block of parsed.blocks) {
    if (block.type === 'section_header' || block.type === 'page_break') {
      sanitizedBlocks.push({
        ...block,
        id: block.id || `layout-block-${sanitizedBlocks.length + 1}`,
      })
    } else if (block.type === 'question_group' && block.questionGroupId) {
      if (seenGroupIds.has(block.questionGroupId)) {
        warnings.push(`布局中题组 ${block.questionGroupId} 重复出现，已移除多余块`)
        continue
      }
      const item = itemByGroupId.get(block.questionGroupId)
      if (item) {
        // Use paper_items score as authority, not layout_json stale score
        sanitizedBlocks.push({ ...block, id: block.id || `block-${item.itemId}`, score: item.score })
        seenGroupIds.add(block.questionGroupId)
      } else {
        warnings.push(`布局中题组 ${block.questionGroupId} 已不存在，已移除`)
      }
    }
  }

  // Append missing groups from paper_items
  for (const item of items) {
    if (item.questionGroup && !seenGroupIds.has(item.itemId)) {
      sanitizedBlocks.push({
        id: `block-${item.itemId}`,
        type: 'question_group',
        questionGroupId: item.itemId,
        score: item.score,
      })
      warnings.push(`题组「${item.questionGroup.title || item.itemId}」不在布局中，已追加到末尾`)
    }
  }

  return {
    layout: {
      blocks: sanitizedBlocks,
      questionNumberStart: Number.isInteger(parsed.questionNumberStart) && parsed.questionNumberStart >= 1
        ? parsed.questionNumberStart
        : 1,
      printStyle: parsed.printStyle === 'handout' ? 'handout' : 'exam',
    },
    layoutWarnings: warnings,
  }
}

function timestampPrefix() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
}

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || ''
// cut m0-5-ai-daily-limit: override hook so verify scripts can spawn the real server
// and point its DeepSeek out-station at a local mock HTTP server instead of the real
// DeepSeek endpoint (mirrors the existing LOCAL_QWEN_CHAT_API_URL env-override
// convention below). Production always uses the real URL — no env var is set outside tests.
const DEEPSEEK_API_URL = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/chat/completions'
const DEFAULT_DEEPSEEK_MODEL = 'deepseek-v4-flash'
const DEEPSEEK_HTTP_RETRY_COUNT = Number(process.env.DEEPSEEK_HTTP_RETRY_COUNT || 1)
const DEEPSEEK_HTTP_RETRY_DELAY_MS = Number(process.env.DEEPSEEK_HTTP_RETRY_DELAY_MS || 800)
const LOCAL_QWEN_CHAT_API_URL = process.env.LOCAL_QWEN_CHAT_API_URL || 'http://127.0.0.1:8791/v1/chat/completions'
const LOCAL_QWEN_CHAT_MODEL = process.env.LOCAL_QWEN_CHAT_MODEL || 'qwen3-8b-local'
const LOCAL_QWEN_CHAT_TIMEOUT_MS = Number(process.env.LOCAL_QWEN_CHAT_TIMEOUT_MS || 90000)
const LOCAL_QWEN_PROVIDER = 'qwen-local'
const QUESTION_BANK_ENABLE_LOCAL_QWEN = process.env.QUESTION_BANK_ENABLE_LOCAL_QWEN === '1'
const SYNONYM_DIFFICULTY_KNOWLEDGE_PATH = path.join(
  rootDir,
  'knowledge',
  'synonym-difficulty',
  'synonym_difficulty_cards.v1.json',
)
const SEMANTIC_SEARCH_PREFILTER_TOP_K = Number(process.env.SEMANTIC_SEARCH_PREFILTER_TOP_K || 72)
const SEMANTIC_SEARCH_TOP_K = Number(process.env.SEMANTIC_SEARCH_TOP_K || 12)
const QUESTION_BANK_STEWARD_TOP_K = Number(process.env.QUESTION_BANK_STEWARD_TOP_K || 8)
const DEEPSEEK_MODEL_ALIASES = {
  'deepseek-v4-pro': 'deepseek-v4-pro',
  'deepseek-v4-flash': 'deepseek-v4-flash',
}

// cut m0-5-ai-daily-limit (C9): snapshot path is env-overridable so verify scripts can
// point it at a throwaway temp file (same hermeticity convention as QUESTION_BANK_DB /
// USER_DATA_DB above). Production always uses server/logs/ai-daily-usage.json.
const aiDailyUsageSnapshotPath =
  process.env.AI_DAILY_USAGE_SNAPSHOT_PATH || path.join(rootDir, 'server', 'logs', 'ai-daily-usage.json')
const aiDailyLimitCounter = createDailyLimitCounter({
  limit: resolveDailyLimit(process.env.AI_DAILY_REQUEST_LIMIT),
  snapshotPath: aiDailyUsageSnapshotPath,
})

const completionRunner = createCompletionRunner({
  elapsedMs,
  DEEPSEEK_API_URL,
  DEFAULT_DEEPSEEK_MODEL,
  DEEPSEEK_HTTP_RETRY_COUNT,
  DEEPSEEK_HTTP_RETRY_DELAY_MS,
  DEEPSEEK_MODEL_ALIASES,
  LOCAL_QWEN_CHAT_API_URL,
  LOCAL_QWEN_CHAT_MODEL,
  LOCAL_QWEN_CHAT_TIMEOUT_MS,
  LOCAL_QWEN_PROVIDER,
  DEEPSEEK_API_KEY,
  dailyLimitCounter: aiDailyLimitCounter,
})
const {
  normalizeDeepSeekModel,
  describeKeySource,
  callLocalQwenCompletion,
  callDeepSeekWithFallback,
} = completionRunner
const verifyImplementation = createVerifyImplementation({
  getQuestionGroupDetail,
  appendVerifyAudit,
  callDeepSeekWithFallback,
  normalizeDeepSeekModel,
  describeKeySource,
  maskApiKey,
  elapsedMs,
  groupTypeLabels,
  DEEPSEEK_API_KEY,
})
const { verifyQuestionGroup } = verifyImplementation
const semanticSearchImplementation = createSemanticSearchImplementation({
  openDatabase,
  selectQuestionGroupCards,
  getDraftSearchContext,
  callDeepSeekWithFallback,
  describeKeySource,
  optionalString,
  objectValue,
  parseSavedJson,
  normalizeSynonymCardId,
  maskApiKey,
  elapsedMs,
  groupTypeLabels,
  SEMANTIC_SEARCH_PREFILTER_TOP_K,
  SEMANTIC_SEARCH_TOP_K,
  DEFAULT_DEEPSEEK_MODEL,
  DEEPSEEK_API_KEY,
})
const { semanticSearchQuestionGroups } = semanticSearchImplementation
const questionBankStewardImplementation = createQuestionBankStewardImplementation({
  callDeepSeekWithFallback,
  semanticSearchQuestionGroups,
  describeKeySource,
  optionalString,
  objectValue,
  normalizeSynonymCardId,
  maskApiKey,
  elapsedMs,
  DEEPSEEK_API_KEY,
  DEFAULT_DEEPSEEK_MODEL,
  QUESTION_BANK_STEWARD_TOP_K,
})
const { questionBankStewardSearch } = questionBankStewardImplementation
// Expose the AI-proxy route owners on serverContext (consumed by createAiProxyRoutes / H10-B PR2).
// Post-hoc assignment (cf. serverContext.draftPaperStore) because these are destructured after the
// serverContext literal. DEFAULT_DEEPSEEK_MODEL is forwarded for the verify-question-group log line.
serverContext.semanticSearchQuestionGroups = semanticSearchQuestionGroups
serverContext.questionBankStewardSearch = questionBankStewardSearch
serverContext.verifyQuestionGroup = verifyQuestionGroup
serverContext.DEFAULT_DEEPSEEK_MODEL = DEFAULT_DEEPSEEK_MODEL
// cut ai-key-server-fallback (MF-1): boolean only, never the key itself or any substring of it.
// Post-hoc (same pattern as above) because DEEPSEEK_API_KEY is declared at :2833, after the
// serverContext literal at :93 and the createAiProxyRoutes() call at :482 — assigning in the
// literal would TDZ-crash module load. Route handler reads context.serverKeyAvailable at request time.
serverContext.serverKeyAvailable = Boolean(DEEPSEEK_API_KEY)
// cut m0-5-ai-daily-limit (C4): status route reads this to report { limit, used, exceeded }.
// Same post-hoc-assignment reasoning as serverKeyAvailable above (TDZ-safe, no key leak).
serverContext.getAiDailyLimitStatus = () => aiDailyLimitCounter.getStatus()
const synonymDifficultyImplementation = createSynonymDifficultyImplementation({
  optionalString,
  clamp01,
  normalizeAnswerValue,
  isEntityPurposeMentionStem,
  callLocalQwenCompletion,
  getQuestionGroupDetail,
  elapsedMs,
  knowledgePath: SYNONYM_DIFFICULTY_KNOWLEDGE_PATH,
  LOCAL_QWEN_CHAT_MODEL,
  LOCAL_QWEN_PROVIDER,
  QUESTION_BANK_ENABLE_LOCAL_QWEN,
})
const { generateSynonymDifficultyByQuestionGroup: generateSynonymDifficultyByQuestionGroupImpl } =
  synonymDifficultyImplementation
// Hoisted forwarding wrapper: serverContext (defined at module top, before this factory call)
// references generateSynonymDifficultyByQuestionGroup via property shorthand, and the sibling
// question-group handlers it lists are all hoisted `async function` declarations. Keeping this a
// hoisted wrapper (delegating to the H5-K factory impl) preserves that shape and avoids a TDZ on
// the serverContext literal, while the heavy classifier logic now lives in the extracted module.
async function generateSynonymDifficultyByQuestionGroup(questionGroupId, input = {}) {
  return generateSynonymDifficultyByQuestionGroupImpl(questionGroupId, input)
}
const DEEPSEEK_READING_PARSE_PROMPT = `你是英语阅读题教学与阅卷助理。按以下结构化流程输出，不要 markdown 代码块：

定义：
1. 同义替换：意思一样，形式和句式不一样的表述。
2. 关键词：题目与原文语义一致或形式一致的核心词。
3. 定位句：原文中含有“关键词最多”、最能回答题设的句子。
4. 答案句：直接可用于解答该题的原文句子。
5. 重要词块：有助于理解题目和对比选项的词汇/短语。
6. 大多数题为细节理解题。

1) 先判断每道题的三轴标签（优先）：
- surfaceQuestion：题面题型，说明题干在问什么。
  枚举只能从以下选择：
  single_detail_normal（单细节普通类）；
  multi_detail_learn_from（learn from / 多细节选项回文验证）；
  why_did（问人物/机构为什么做某事）；
  word_meaning（猜词/短语/指代含义）；
  paragraph_main_idea（段落主旨）；
  passage_main_idea（文章主旨/标题）；
  writing_technique（写作手法/作者如何展开）；
  paragraph_function（段落功能）；
  author_purpose（作者写作目的）；
  attitude_tone（态度语气）；
  inference_general（普通推断）；
  example_function（例子/引用/人物/地点/数字的功能）；
  adjective_summary（一个或两个形容词压缩一段描述）；
  abstract_phrase_summary（抽象名词短语概括具体描述，如 low barrier to entry）。
- answeringMove：学生实际做题动作，枚举只能从以下选择：
  direct_locating（直接定位）；
  option_backtracking（用选项回原文验证）；
  context_guessing（上下文猜词/指代）；
  coverage_test（段落/全文覆盖度检验）；
  function_to_argument（例子/段落服务哪个论点）；
  rhetorical_method_identification（识别举例、对比、类比、引用、数据等手法）；
  minimal_inference（从文本做最小逻辑推断）；
  description_to_adjective（把描述压缩为形容词）；
  multi_point_matching（多点细节整合匹配）；
  elimination（逐项排除）。
- synonymDifficulty：SOLO/T卡难点机制，说明这题真正难在哪里。

2) 逐题产出解析：
- 题号
- 题型
- 题目翻译
- 做题策略
- 定位句 + 定位句翻译
- 答案句（如与定位句不完全重合）
- 选项对比（需给出中英说明）
- 干扰项分类（每个选项都要标注）：
  0. 正确项：正确答案选项必须标0，不得标1/2/3
  1. 细节词误导：与关键词相关但偏离题意
  2. 无中生有：原文未提及
  3. 常识干扰：符合常识但与文本冲突
- 干扰项分析后给同义替换：原文表达 = 选项同义替换
- 同义替换难度评级：以 SOLO 层级为主轴，先判 SOLO，再在对应层级内选择 T1-T10，并给难度、学生卡点和讲评动作
- 六维难度画像：词汇负荷、语法负荷、信息跨度、推理/抽象跨度、干扰项迷惑性、话题抽象度
- 语言特征分析（1句）
- 答案

同义替换难度判断规则：
1. 必须先判 SOLO 层级，不要先按高阶思维分类；higherOrderThinking 只是副标签。
   - 单点类：一处原文证据即可支撑答案。
   - 多点类：两处及以上信息需要拼合，但不需要逻辑跳跃。
   - 关联类：需要判断信息之间的因果、功能、态度、主旨、论证关系。
   - 抽象拓展类：需要从具体事实或细节上升到抽象概念标签。
2. 在 SOLO 层级内选择 T1-T10：
   - 单点类：T1 直接词汇复现；T2 单句同义改写；T3 语境词义推断。
   - 多点类：T4 多点信息拼合。
   - 关联类：T5 主旨覆盖归纳；T6 隐含逻辑推断；T7 举例引用意图推断；T8 段落修辞功能判断；T9 态度立场判断。
   - 抽象拓展类：T10 抽象概念标签。
3. 高风险边界必须优先检查：
   - T2_T6：先问“原文说了没有？”原文已经说了这件事，只是换词/换句式，判 T2；原文没有直接说这件事，但给了足够信息让学生推出未说出的结论，判 T6。口诀：说了→T2；没说但能推→T6。
   - why difficult / why hard 边界：若题干问为什么困难/很难，而原文只是给出现象或例子，正确选项概括其底层原因（如 rooted in people's mind），必须判 T6，不得判纯 T2。
   - T5_T10：概括文章讲什么，T5；从具体内容上升到抽象概念标签，T10。
   - 标题题补充：surfaceQuestion 仍可为 passage_main_idea；但若正确标题是 “Why the Rush?” 这类省略式/反讽式疑问标题，把全文具体批评压缩成抽象标题，则 synonymDifficulty 判 T10，并标 T5_T10。
   - T3_T6：目标是重定义词义本身，T3；目标是推出词义之外的结论，T6。
   - word_meaning 强制口径：只要 surfaceQuestion.type=word_meaning，synonymDifficulty 默认必须判 T3 语境词义推断；不要因为目标词与选项可以同义替换就判 T2。只有选项与原文目标词完全原词复现时，才可判 T1。
   - writing_technique / paragraph_function 强制口径：只要题干问作者如何展开、如何呈现问题、段落如何组织或段落功能，synonymDifficulty 默认必须判 T8 段落修辞功能判断；不要因为正确选项是 "By giving examples"、"By comparison" 等短语就判 T2。
   - example_function 只用于题干问作者为什么提及/引用/举出某个例子、数字、人物、地点，或问该例子说明什么。若题干问某人/某群体 trying to do / intended to do / purpose / aim / goal，属于人物目的或行为目的，优先标 why_did 或 single_detail_normal，不得标 example_function。
   - coverage_test 强制口径：若 answeringMove=coverage_test，scope=paragraph/passage，则 surfaceQuestion.type 必须对应 paragraph_main_idea/passage_main_idea，不得标 single_detail_normal。
   - adjective_summary 强制口径：只要 surfaceQuestion.type=adjective_summary，不得判 T2/T3/T4。默认判 T10 抽象概念标签；只有当形容词为低抽象、客观性质，且证据集中在连续1-2句时，才可降为 T6，并必须加 T6_T10 与 reviewNeeded=true。
   - T4_T6：只是多处信息拼合，T4；拼合后还需建立逻辑关系，T6。
   - T7_T8：问具体例子/引用目的，T7；问整段展开方式或修辞功能，T8。
   - T6_T9：推断事实结论，T6；判断态度立场，T9。
   - T6_T10：从具体描述推出一个隐含事实结论，T6；把具体描述压缩成抽象类别、性质标签或概念短语，T10。若正确选项是 low barrier to entry 这类抽象名词短语，优先检查 T10。
   - T1_T2：原词复现，T1；同义改写，T2。
   - T2_T4：如果正确选项的两个并列概括词分别对应原文两句或两处信息，必须判 T4 多点信息拼合；不得因“无需推断”而判 T2。T2 只允许单句内同义改写。
4. 输出要求：
   - sourceExpression 必须完整照抄原文证据，不得缩写。
   - optionExpression 必须完整照抄正确选项，不得缩写。
   - reason 格式必须为：“{soloLevel} {cardId}：{证据说明}，因此是{name}。”
   - boundaryCheck 必须说明为什么不是最相近的另一个类型。
   - boundaryFlags 只能从以下枚举中选择：T1_T2, T2_T4, T2_T6, T3_T6, T4_T6, T5_T10, T6_T10, T7_T8, T6_T9。
   - reviewNeeded 规则：T9/T10 默认 true；T6/T8 且 confidence < 0.78 时 true；其他类型 confidence < 0.72 时 true。

六维难度画像规则：
1. finalScore 固定为 1-10 的整数；1-3=low，4-6=medium，7-10=high。
2. mainBlockers 只能从以下枚举中选择：vocab, syntax, distractor, abstraction, info_span, topic。
3. vocabLoad 关注“答案路径星词/高中词”，不是全文词频。高中星词越集中在答案证据、正确选项和同义替换桥梁，词汇负荷越高。
4. vocabLoad.blockerWords 的 role 只能从以下枚举选择：
   - semantic_bridge：连接原文和选项的同义替换桥梁词；
   - answer_key：正确选项核心词。只有抽象、低频且必须理解时才构成 high；
   - distractor_trap：干扰项中迷惑学生的词；
   - context_clue：看似难但上下文可猜，降低实际阻断。
5. vocabLoad.blockerWords 的 position 只能从以下枚举选择：answer_path, correct_option, distractor, question_stem, passage_background。
6. vocabLoad.level 判断：
   - high：有 semantic_bridge，或 answer_key 是抽象/低频且必须理解；
   - medium：只有普通 answer_key、distractor_trap 或 context_clue；
   - low：无 blockerWords。
   如果 passage 星词密度高，但 answerPath 和 options 都低，则 vocabLoad.level 不得高于 medium。
   若 vocabLoad.level=low，mainBlockers 不得包含 vocab。
   若 blockerWords 中有 semantic_bridge，vocabLoad.level 不得为 low。
   position=question_stem 的词优先考虑 context_clue，除非该词本身是答案判断的核心障碍。
   word_meaning（猜词题）中，题干划线目标词/目标短语本身不得作为 blockerWords，也不得因为目标词本身生而提高 vocabLoad.level；词汇负荷只评估上下文线索词、选项词和干扰项词。
7. adjective_summary 与 abstract_phrase_summary 边界：
   - adjective_summary：正确选项是一个或两个形容词，压缩人物/事件/经历/做法的性质。
   - abstract_phrase_summary：正确选项是抽象名词短语或概念短语，压缩一段具体描述。
   - adjective_summary 默认属于抽象评价压缩，不是普通同义替换；不得判 T2。若选项为 Tasteful/Revolutionary/Pragmatic 等评价性形容词，优先判 T10，并标 T6_T10。
   - adjective_summary 只有在形容词非常具体、客观，且证据集中在连续1-2句时，才允许判 T6；不得低于 T6。
   - 抽象标题压缩：正确选项若是省略式/反讽式疑问标题（如 Why the Rush?），且需要把全文多处具体内容压缩为标题含义，surfaceQuestion.type 用 passage_main_idea，但 synonymDifficulty.cardId 用 T10。
   - abstract_phrase_summary 默认优先检查 T10；只有当选项只是原文可直接推出的事实性结论，而非概念标签时，才降为 T6。
8. infoSpan 必须输出 level、source、evidence：
   - level 只能是 single_point, multi_point, cross_paragraph；
   - source 只能是 derived_from_t_card 或 overridden_by_evidence；
   - T卡可作为默认推导，但必须用原文证据确认；T6 不一定跨段，T5 段落主旨也不一定跨全文。
9. 多点细节整合规则：
   - 若正确选项包含两个并列概括词，且分别由原文两句或两处信息支撑，answeringMove 必须为 multi_point_matching，infoSpan 必须为 multi_point，synonymDifficulty 必须优先考虑 T4。
   - 若 locationSentence 或 answerSentence 中实际引用了两句，不能判 T2；T2 只适用于单句内同义改写。
   - 若原文目的句很明确，但正确选项用更高层表达概括该目的（如 share what would stick/rock/leaf → reflect on the journey），可保持 T2，但必须加 boundaryFlags: ["T2_T6"]，并在 boundaryCheck 说明存在轻微抽象跳跃。
10. evidence / evidenceSentence / sourceExpression / optionExpression 必须完整照抄原文或选项，不得缩写。

3) 全文脉络分析：
- 提炼核心框架（背景-问题-方法-结果-结论）；
- 输出可讲评的总分/过渡句。
- 同时输出 passageSummary：80字以内中文简介，用于题库卡片摘要；只概括篇章对象、核心内容和主题意义，不逐题解析。

最终只返回 JSON 对象：
{
  "passageSummary": "80字以内中文篇章简介",
  "articleAnalysis": {
    "framework": "背景-问题-方法-结果",
    "summary": "一句中文总结",
    "keyChunks": [
      { "chunk": "核心词块", "pos": "词性", "phonetic": "音标", "reason": "用途说明" }
    ]
  },
  "questions": [
    {
      "questionNo": "题号",
      "questionType": "细节理解题/主旨大意题/推理题/猜词题",
      "surfaceQuestion": {
        "type": "single_detail_normal/multi_detail_learn_from/why_did/word_meaning/paragraph_main_idea/passage_main_idea/writing_technique/paragraph_function/author_purpose/attitude_tone/inference_general/example_function/adjective_summary/abstract_phrase_summary",
        "scope": "word_or_phrase/sentence/paragraph/passage/example",
        "answeringMove": "direct_locating/option_backtracking/context_guessing/coverage_test/function_to_argument/rhetorical_method_identification/minimal_inference/description_to_adjective/multi_point_matching/elimination",
        "reason": "一句话说明为什么这样分类"
      },
      "questionTranslation": "中文翻译",
      "strategy": "对应题型策略简述",
      "locationSentence": "定位句（原文）",
      "locationSentenceTranslation": "定位句翻译",
      "answerSentence": "答案句（原文）",
      "answer": "A/B/C/D/E/F/G",
      "explanation": "中文完整解析（含题目翻译、定位、选项对比）",
      "distractorAnalysis": [
        { "option": "A", "type": "0/1/2/3", "reason": "含中英对照的解释；正确答案必须type=0" }
      ],
      "synonymMappings": [
        { "text": "原文表达", "replacement": "选项同义替换" }
      ],
      "synonymDifficulty": {
        "soloLevel": "单点类/多点类/关联类/抽象拓展类",
        "cardId": "T1/T2/T3/T4/T5/T6/T7/T8/T9/T10",
        "name": "类型名称",
        "higherOrderThinking": "不明显/分析推断/归纳建构/态度评价",
        "difficultyDefault": 1,
        "confidence": 0.86,
        "sourceExpression": "完整原文证据，不得缩写",
        "optionExpression": "完整正确选项，不得缩写",
        "reason": "{soloLevel} {cardId}：{证据说明}，因此是{name}。",
        "boundaryCheck": "为什么不是最相近类型",
        "studentBlocker": "学生会卡在哪里",
        "teachingMove": "讲评时怎么教",
        "reviewNeeded": false,
        "boundaryFlags": ["T2_T6"]
      },
      "difficultyProfile": {
        "vocabLoad": {
          "starWordDensity": {
            "passage": "low/medium/high",
            "answerPath": "low/medium/high",
            "options": "low/medium/high"
          },
          "blockerWords": [
            {
              "word": "关键高中词或词组",
              "position": "answer_path/correct_option/distractor/question_stem/passage_background",
              "role": "semantic_bridge/distractor_trap/answer_key/context_clue",
              "reason": "说明这个词为什么影响或不影响作答"
            }
          ],
          "level": "low/medium/high"
        },
        "syntaxLoad": {
          "level": "low/medium/high",
          "evidenceSentence": "完整照抄最影响理解的原文句子",
          "reason": "说明为什么这句语法负荷高/中/低"
        },
        "infoSpan": {
          "level": "single_point/multi_point/cross_paragraph",
          "source": "derived_from_t_card/overridden_by_evidence",
          "evidence": "完整照抄支撑位置或说明证据分布"
        },
        "reasoningAbstraction": "low/medium/high/very_high",
        "distractorStrength": "low/medium/high",
        "topicAbstractness": "low/medium/high",
        "mainBlockers": ["vocab", "abstraction"],
        "finalScore": 6,
        "finalLabel": "low/medium/high",
        "reason": "一句话说明总难度来源"
      },
      "languageFeatures": "一句语言特征分析"
    }
  ]
}`

const DEEPSEEK_GRAMMAR_PARSE_PROMPT = `你是高考英语语法填空教学助理。按以下格式对每个题目进行最详尽的解析，最后给出全文翻译。

格式模板（每个题目单独输出）：
**题号. 答案: 填入词**
*   **提示词意思**: \`提示词\` 词性，在此意为"中文释义"。
*   **解析**: 分析空格前后语法结构、固定搭配、时态语态等，给出填空依据。
*   **挖空句翻译**: 将包含该空的完整句子翻译成中文。

最后给出全文翻译。

返回 JSON 对象（不要 markdown 代码块）：
{
  "questions": [
    {
      "questionNo": "题号，如56",
      "answer": "填入的单词",
      "hintMeaning": "提示词的词性和中文释义，如：line 名词，在此意为（产品的）系列",
      "analysis": "详细语法和句意解析",
      "sentenceTranslation": "挖空句的中文翻译"
    }
  ],
  "fullTranslation": "全文中文翻译"
}`

const DEEPSEEK_CLOZE_PARSE_PROMPT = readPromptFile(
  'cloze-parse-prompt.txt',
  `你是高考英语完形填空教学助理。先给出选项答案、故事大意，再按照故事脉络逐题解释答案，最后串词成篇。只返回 JSON 对象，包含 answerLine、storyTitle、storySummary、questions、condensedStory。`,
)

const DEEPSEEK_SEVEN_CHOICES_PARSE_PROMPT = readPromptFile(
  'seven-choices-parse-prompt.txt',
  `你是高考英语七选五教学助理。先给出文章主旨和答案，再逐空说明位置与上下文、选项翻译和解析。`,
)

const DEEPSEEK_TOPIC_LABEL_PROMPT = `你是高中英语篇章主题标签助手。你只能从给定清单中为一个题组/篇章选择话题标签。

要求：
1. 标签对象必须针对整篇文章/整组题，不要逐小题贴标签。
2. 每个标签必须完整使用“主题-主题群-子主题”格式。
3. 可以选择多个标签，通常 1-3 个；只有材料确实覆盖多个主题时才多选。
4. 只能使用给定清单中的原文标签，不得改写、增删、合并或自造标签。
5. reason 用一句中文说明文本证据，confidence 为 0-1 的数字。

最终只返回 JSON 对象：
{
  "topicLabels": [
    {
      "label": "主题-主题群-子主题",
      "reason": "一句中文证据说明",
      "confidence": 0.9
    }
  ]
}`

const DEEPSEEK_PASSAGE_SUMMARY_PROMPT = `你是高中英语题库篇章简介助手。请根据题组原文、题目和答案信息，生成适合题库列表检索与教师快速判断的中文篇章简介。

要求：
1. 只概括篇章内容和主题意义，不逐题解析。
2. 用 1 句话或 2 个短句，80-140 个中文字符。
3. 写清文本主要人物/对象、核心事件或信息、主题价值。
4. 不要使用“本文主要讲了”这类空泛开头。
5. 最终只返回 JSON 对象：
{
  "summary": "中文篇章简介"
}`

function normalizeSynonymMapping(item) {
  if (!item || typeof item !== 'object') return null
  const text = optionalString(item.text)
  const replacement = optionalString(item.replacement)
  if (!text && !replacement) return null
  return { text, replacement }
}

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

// reading-difficulty domain normalizers (surfaceQuestion / synonymDifficulty / difficultyProfile)
// live in server/reading-analysis/readingDifficultyNormalizer.mjs (cut H5-J). The factory injects
// the helpers that still live here; the 3 public normalizers are consumed only by
// normalizeReadingParseQuestion below. All injected deps are hoisted function declarations.
const { normalizeReadingSurfaceQuestion, normalizeReadingSynonymDifficulty, normalizeReadingDifficultyProfile } =
  createReadingDifficultyNormalizer({
    optionalString,
    normalizeAnswerValue,
    cleanDraftText,
    objectValue,
    loadSynonymDifficultyKnowledge,
    normalizeSynonymCardId,
    normalizeSynonymConfidence,
    normalizeSynonymBoolean,
    uniqueSynonymFlags,
  })

function normalizeReadingParseQuestion(item, context = {}) {
  if (!item || typeof item !== 'object') return null

  const questionNo = optionalString(item.questionNo)
  if (!questionNo) return null

  const questionType = optionalString(item.questionType) || '阅读理解'
  const answer = normalizeAnswerValue(item.answer)
  const questionTranslation = optionalString(item.questionTranslation)
  const strategy = optionalString(item.strategy)
  const locationSentence = optionalString(item.locationSentence)
  const locationSentenceTranslation = optionalString(item.locationSentenceTranslation)
  const answerSentence = optionalString(item.answerSentence)
  const languageFeatures = optionalString(item.languageFeatures)
  const explanation = optionalString(item.explanation)
  if (!answer && !explanation) return null

  const surfaceQuestion = normalizeReadingSurfaceQuestion(item, context)
  const distractorAnalysis = Array.isArray(item.distractorAnalysis)
    ? item.distractorAnalysis
        .map((entry) =>
          entry && typeof entry === 'object'
            ? {
                option: optionalString(entry.option).toUpperCase(),
                type:
                  optionalString(entry.option).toUpperCase() === answer
                    ? '0'
                    : ['1', '2', '3'].includes(optionalString(entry.type))
                      ? optionalString(entry.type)
                      : '2',
                reason: optionalString(entry.reason),
              }
            : null,
        )
        .filter(Boolean)
    : []

  const synonymMappings = Array.isArray(item.synonymMappings)
    ? item.synonymMappings.map(normalizeSynonymMapping).filter(Boolean)
    : []
  const synonymDifficulty = normalizeReadingSynonymDifficulty(item.synonymDifficulty, {
    surfaceQuestion,
    originalQuestion: context.originalQuestion,
  })
  const difficultyProfile = normalizeReadingDifficultyProfile(item, { synonymDifficulty, surfaceQuestion })

  return {
    questionNo,
    questionType,
    surfaceQuestion,
    questionTranslation,
    strategy,
    locationSentence,
    locationSentenceTranslation,
    answerSentence,
    answer,
    explanation,
    distractorAnalysis,
    synonymMappings,
    synonymDifficulty,
    difficultyProfile,
    languageFeatures,
    confidence: 0.95,
  }
}

function normalizeReadingParseArticle(payload) {
  if (!payload || typeof payload !== 'object') return null
  const framework = optionalString(payload.framework)
  const summary = optionalString(payload.summary)
  const keyChunks = Array.isArray(payload.keyChunks)
    ? payload.keyChunks
        .map((item) => {
          if (!item || typeof item !== 'object') return null
          const chunk = optionalString(item.chunk)
          if (!chunk) return null
          return {
            chunk,
            pos: optionalString(item.pos),
            phonetic: optionalString(item.phonetic),
            reason: optionalString(item.reason),
          }
        })
        .filter(Boolean)
    : []
  if (!framework && !summary && keyChunks.length === 0) return null
  return {
    framework,
    summary,
    keyChunks,
  }
}

function normalizeSavedVerifyResult(questionGroupId, group, payload) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.results)) return null

  const allowedVerdicts = new Set(['correct', 'answer_wrong', 'explanation_wrong', 'both_wrong', 'uncertain', 'skipped'])
  const results = payload.results
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const questionNo = optionalString(item.questionNo)
      if (!questionNo) return null
      const rawVerdict = optionalString(item.verdict)
      return {
        questionId: optionalString(item.questionId),
        questionNo,
        verdict: allowedVerdicts.has(rawVerdict) ? rawVerdict : 'uncertain',
        reason: optionalString(item.reason),
        correctAnswer: optionalString(item.correctAnswer),
        apiCall: item.apiCall === true,
        apiLatencyMs: Number(item.apiLatencyMs || 0) || undefined,
      }
    })
    .filter(Boolean)

  if (results.length === 0) return null

  return {
    questionGroupId,
    title: optionalString(payload.title) || group.title || '',
    questionCount: Number(group.question_count || payload.questionCount || results.length),
    verifiedCount: results.filter((item) => item.verdict !== 'skipped').length,
    results,
    requestId: optionalString(payload.requestId),
    provider: optionalString(payload.provider) || 'deepseek',
    model: optionalString(payload.model),
    keySource: optionalString(payload.keySource),
    keyFingerprint: optionalString(payload.keyFingerprint) || optionalString(payload.keyMask),
    calledCount: Number(payload.calledCount || 0) || results.filter((item) => item.apiCall).length || undefined,
    thinkingMode: payload.thinkingMode === true,
    allApiCalled: payload.allApiCalled === true,
    totalLatencyMs: Number(payload.totalLatencyMs || 0) || undefined,
  }
}

function syncReadingAiDifficultyScores(db, questionGroupId, questions) {
  const rows = db
    .prepare(
      `
      SELECT id, question_no, display_order
      FROM questions
      WHERE group_id = ?
      ORDER BY display_order, question_no
      `,
    )
    .all(questionGroupId)
  if (!rows.length || !Array.isArray(questions) || !questions.length) return []

  const warnings = []
  const rowsByNo = new Map(rows.map((row) => [String(row.question_no || '').trim(), row]))
  const usedQuestionIds = new Set()
  const update = db.prepare(
    `
    UPDATE questions
    SET ai_difficulty_score = ?
    WHERE id = ?
    `,
  )

  questions.forEach((item, index) => {
    const score = normalizeAiDifficultyScore(item?.difficultyProfile?.finalScore)
    if (score === null) return

    const questionNo = String(item?.questionNo || '').trim()
    let row = questionNo ? rowsByNo.get(questionNo) : null
    if (!row && rows[index] && !usedQuestionIds.has(rows[index].id)) {
      row = rows[index]
    }
    if (!row || usedQuestionIds.has(row.id)) {
      warnings.push(`第 ${questionNo || index + 1} 题 AI 难度分无法匹配数据库小题，已跳过。`)
      return
    }

    usedQuestionIds.add(row.id)
    update.run(score, row.id)
  })

  return warnings
}

function saveReadingParseResult(questionGroupId, input) {
  const db = openDatabase({ readOnly: false })
  const payload = input?.readingParseResult && typeof input.readingParseResult === 'object'
    ? input.readingParseResult
    : input
  const verifyPayload = input?.verifyResult && typeof input.verifyResult === 'object'
    ? input.verifyResult
    : null

  try {
    const group = db
      .prepare(
        `
        SELECT
          qg.id,
          qg.passage_id,
          qg.title,
          COUNT(q.id) AS question_count,
          GROUP_CONCAT(q.question_no) AS question_nos
        FROM question_groups qg
        LEFT JOIN questions q ON q.group_id = qg.id
        WHERE qg.id = ?
        GROUP BY qg.id
        `,
      )
      .get(questionGroupId)

    if (!group) {
      throw new Error('题组未找到，无法保存 AI 阅读解析。')
    }

    if (payload?.questionGroupId && String(payload.questionGroupId) !== String(questionGroupId)) {
      throw new Error('AI 阅读解析所属题组不一致，已停止保存。')
    }

    const originalQuestionByNo = new Map(
      db
        .prepare('SELECT question_no, stem FROM questions WHERE group_id = ?')
        .all(questionGroupId)
        .map((question) => [String(question.question_no || '').trim(), { stem: question.stem || '' }]),
    )
    const questions = Array.isArray(payload?.questions)
      ? payload.questions
          .map((item) =>
            normalizeReadingParseQuestion(item, {
              originalQuestion: originalQuestionByNo.get(optionalString(item?.questionNo)),
            }),
          )
          .filter(Boolean)
      : []

    if (questions.length === 0) {
      throw new Error('AI 阅读解析没有有效小题内容，无法保存。')
    }

    const questionNoList = String(group.question_nos || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
    const parsedByNo = new Map(questions.map((item) => [String(item.questionNo), item]))
    const normalizedPayload = {
      questionGroupId,
      title: optionalString(payload?.title) || group.title || '',
      questionCount: Number(group.question_count || payload?.questionCount || questions.length),
      parsedCount: questions.length,
      matchedCount: questionNoList.filter((questionNo) => parsedByNo.has(questionNo)).length,
      unmatchedQuestionNos: questionNoList.filter((questionNo) => !parsedByNo.has(questionNo)),
      passageSummary:
        optionalString(payload?.passageSummary || payload?.passage_summary) ||
        optionalString(payload?.articleAnalysis?.summary),
      articleAnalysis: payload?.articleAnalysis ? normalizeReadingParseArticle(payload.articleAnalysis) : null,
      requestId: optionalString(payload?.requestId),
      provider: optionalString(payload?.provider) || 'deepseek',
      model: optionalString(payload?.model),
      keySource: optionalString(payload?.keySource),
      keyFingerprint: optionalString(payload?.keyFingerprint) || optionalString(payload?.keyMask),
      requestMs: Number(payload?.requestMs || 0) || undefined,
      thinkingMode: payload?.thinkingMode === true,
      totalLatencyMs: Number(payload?.totalLatencyMs || 0) || undefined,
      questions,
    }
    const normalizedVerifyPayload = normalizeSavedVerifyResult(questionGroupId, group, verifyPayload)
    const id = optionalString(input?.id) || optionalString(payload?.savedResultId) || randomUUID()

    db.prepare(
      `
      INSERT INTO reading_parse_results (
        id,
        question_group_id,
        payload_json,
        verify_payload_json,
        provider,
        model,
        thinking_mode,
        request_id,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      ON CONFLICT(question_group_id) DO UPDATE SET
        payload_json = excluded.payload_json,
        verify_payload_json = excluded.verify_payload_json,
        provider = excluded.provider,
        model = excluded.model,
        thinking_mode = excluded.thinking_mode,
        request_id = excluded.request_id,
        updated_at = datetime('now')
      `,
    ).run(
      id,
      questionGroupId,
      JSON.stringify(normalizedPayload),
      JSON.stringify(normalizedVerifyPayload || {}),
      normalizedPayload.provider,
      normalizedPayload.model || '',
      normalizedPayload.thinkingMode ? 1 : 0,
      normalizedPayload.requestId || '',
    )

    if (normalizedPayload.passageSummary) {
      db.prepare('UPDATE passages SET summary = ?, updated_at = datetime(\'now\') WHERE id = ?').run(
        safeTruncate(normalizedPayload.passageSummary, 240),
        group.passage_id,
      )
    }

    const difficultySyncWarnings = syncReadingAiDifficultyScores(db, questionGroupId, normalizedPayload.questions)
    const [questionGroup] = selectQuestionGroupCards(db, 'WHERE id = ?', [questionGroupId])

    return {
      readingParseResult: getSavedReadingParseResult(db, questionGroupId),
      verifyResult: getSavedReadingVerifyResult(db, questionGroupId),
      questionGroup: questionGroup || null,
      difficultySyncWarnings,
    }
  } finally {
    db.close()
  }
}

function maskApiKey(apiKey) {
  const value = String(apiKey || '').trim()
  if (!value) return 'missing'
  if (value.length <= 10) return `${'*'.repeat(Math.max(0, value.length - 1))}X`
  return `${value.slice(0, 4)}...${value.slice(-4)} (${value.length}位)`
}

function elapsedMs(startAt) {
  return Date.now() - startAt
}

function appendVerifyAudit(entry) {
  try {
    mkdirSync(path.dirname(verifyAuditLogPath), { recursive: true })
    const safeEntry = {
      time: new Date().toISOString(),
      ...entry,
    }
    writeFileSync(verifyAuditLogPath, `${JSON.stringify(safeEntry, null, 0)}\n`, {
      flag: 'a',
      encoding: 'utf8',
    })
  } catch {
    // 持久化日志失败不能影响验证主流程
  }
}

// The 4 DeepSeek per-type parse owners (reading / cloze / grammar-fill / seven-choices) now live in
// ./ai-parse/questionGroupParseService.mjs (cut H5-L). The 4 frozen system prompts above
// (DEEPSEEK_*_PROMPT) stay defined HERE and are INJECTED into the factory under the SAME names, so the
// moved owner bodies are byte-identical to before the extraction. The factory must run after those
// const prompts are defined (above) and after the function declarations it injects are in scope.
const questionGroupParseImplementation = createQuestionGroupParseImplementation({
  callDeepSeekWithFallback,
  getQuestionGroupDetail,
  describeKeySource,
  normalizeDeepSeekModel,
  maskApiKey,
  elapsedMs,
  optionalString,
  formatSynonymDifficultyKnowledgeForReadingPrompt,
  normalizeReadingParseQuestion,
  normalizeReadingParseArticle,
  normalizeClozeParseQuestion,
  normalizeSevenChoicesParseQuestion,
  DEEPSEEK_API_KEY,
  DEEPSEEK_READING_PARSE_PROMPT,
  DEEPSEEK_GRAMMAR_PARSE_PROMPT,
  DEEPSEEK_CLOZE_PARSE_PROMPT,
  DEEPSEEK_SEVEN_CHOICES_PARSE_PROMPT,
})
const {
  parseReadingByQuestionGroup: parseReadingByQuestionGroupImpl,
  parseClozeByQuestionGroup: parseClozeByQuestionGroupImpl,
  parseGrammarByQuestionGroup: parseGrammarByQuestionGroupImpl,
  parseSevenChoicesByQuestionGroup: parseSevenChoicesByQuestionGroupImpl,
} = questionGroupParseImplementation
// Hoisted forwarding wrappers: the serverContext object literal (defined at module top, before this
// factory call) references these 4 owners via property shorthand. Keeping each a hoisted `async function`
// declaration (delegating to the H5-L factory impl, with the exact original signature + default)
// preserves the serverContext call site and avoids a TDZ on the serverContext literal.
async function parseReadingByQuestionGroup(questionGroupId, apiKey, model, parseRequestId, thinkingMode = false) {
  return parseReadingByQuestionGroupImpl(questionGroupId, apiKey, model, parseRequestId, thinkingMode)
}
async function parseClozeByQuestionGroup(questionGroupId, apiKey, model, parseRequestId, thinkingMode = false) {
  return parseClozeByQuestionGroupImpl(questionGroupId, apiKey, model, parseRequestId, thinkingMode)
}
async function parseGrammarByQuestionGroup(questionGroupId, apiKey, model, parseRequestId, thinkingMode = false) {
  return parseGrammarByQuestionGroupImpl(questionGroupId, apiKey, model, parseRequestId, thinkingMode)
}
async function parseSevenChoicesByQuestionGroup(questionGroupId, apiKey, model, parseRequestId, thinkingMode = false) {
  return parseSevenChoicesByQuestionGroupImpl(questionGroupId, apiKey, model, parseRequestId, thinkingMode)
}

// The DOCX OOXML renderer (escapeXml … convertDocxToPdf, ~24 fns + readingDistractorTypeLabel) now lives
// in ./exports/docxRenderer.mjs (cut H5-G). USER-VISIBLE: the WordprocessingML strings are byte-sensitive.
// Only two free identifiers are injected — groupTypeLabels (a non-hoisted const@~149) and optionalString —
// so the factory must run LATE (a plain const destructure before createExportImplementation@~62 would TDZ
// on groupTypeLabels). The 3 entry fns alias to *Impl and re-enter api.mjs through hoisted forwarding
// wrappers (all 3 sync, exact original signatures) so createExportImplementation@~62 keeps injecting the
// hoisted wrappers unchanged (it only STORES them; they run at export time after init). timestampPrefix
// STAYS in api.mjs (not docx rendering); the renderer never calls it.
// figure-render cut (fig-token P0): paperAssetsDir is injected so
// docxRenderer.mjs can resolve a group's figures/manifest.json + embed the
// PNG (optional — the factory defaults it to null, matching every other
// caller/test that omits it). buildDocumentXml/writeDocxPackage both gained
// an `images` out-parameter for the same reason (see docxRenderer.mjs's
// header comment above buildExamDocumentXml) — forwarded through here
// unchanged so the wrappers stay "exact original signatures" plus the one
// new param.
const docxRenderer = createDocxRenderer({
  groupTypeLabels,
  optionalString,
  paperAssetsDir,
})
const {
  buildDocumentXml: buildDocumentXmlImpl,
  writeDocxPackage: writeDocxPackageImpl,
  convertDocxToPdf: convertDocxToPdfImpl,
} = docxRenderer
function buildDocumentXml({ title, versionType, items, blocks, questionNumberStart, printStyle, images = [], normalizationDiagnostics = [], canonicalConsumption = null }) {
  return buildDocumentXmlImpl({ title, versionType, items, blocks, questionNumberStart, printStyle, images, normalizationDiagnostics, canonicalConsumption })
}
function writeDocxPackage({ documentXml, outputPath, title, images = [] }) {
  return writeDocxPackageImpl({ documentXml, outputPath, title, images })
}
function convertDocxToPdf(docxPath, outputPath) {
  return convertDocxToPdfImpl(docxPath, outputPath)
}

function formatQuestionGroupForTopicLabel(detail) {
  const questionText = (detail.questions || [])
    .slice(0, 8)
    .map((question) =>
      [
        `题号：${question.questionNo}`,
        question.stem ? `题干：${question.stem}` : '',
        question.answer ? `答案：${question.answer}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    )
    .join('\n\n')

  return [
    `题组类型：${groupTypeLabels[detail.groupType] || detail.groupType}`,
    `题组标题：${detail.title}`,
    `篇章标题：${detail.passage?.title || detail.passageTitle || ''}`,
    detail.summary ? `摘要：${detail.summary}` : '',
    detail.instruction ? `题组说明：${detail.instruction}` : '',
    `原文：\n${detail.passage?.materialText?.slice(0, 3600) || '（无完整原文）'}`,
    questionText ? `题目信息：\n${questionText}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')
}

function formatQuestionGroupForSummary(detail) {
  const questionText = (detail.questions || [])
    .slice(0, 10)
    .map((question) =>
      [
        `题号：${question.questionNo}`,
        question.stem ? `题干：${question.stem}` : '',
        question.answer ? `答案：${question.answer}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    )
    .join('\n\n')

  return [
    `题组类型：${groupTypeLabels[detail.groupType] || detail.groupType}`,
    `题组标题：${detail.title}`,
    `篇章标题：${detail.passage?.title || detail.passageTitle || ''}`,
    detail.instruction ? `题组说明：${detail.instruction}` : '',
    `原文：\n${detail.passage?.materialText?.slice(0, 4200) || detail.summary || '（无完整原文）'}`,
    questionText ? `题目信息：\n${questionText}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

function normalizeSummaryPayload(payload) {
  if (!payload) return ''
  if (typeof payload === 'string') return safeTruncate(payload, 240)
  if (typeof payload !== 'object') return ''

  const candidates = [
    payload.summary,
    payload.articleSummary,
    payload.passageSummary,
    payload.introduction,
    payload.description,
    payload['篇章简介'],
    payload['摘要'],
  ]

  for (const candidate of candidates) {
    const summary = optionalString(candidate)
    if (summary) return safeTruncate(summary, 240)
  }

  return ''
}

async function callDeepSeekPassageSummary(context) {
  const result = await callDeepSeekWithFallback({
    apiKey: context.apiKey,
    model: context.model,
    provider: context.provider,
    messages: [
      {
        role: 'system',
        content: DEEPSEEK_PASSAGE_SUMMARY_PROMPT,
      },
      {
        role: 'user',
        content: `请为以下题组生成篇章简介。\n\n${formatQuestionGroupForSummary(context.detail)}`,
      },
    ],
    temperature: 0.2,
    maxTokens: context.thinkingMode ? 2048 : 1000,
    thinkingMode: context.provider === LOCAL_QWEN_PROVIDER ? false : context.thinkingMode,
  })

  return result.parsed
}

function saveQuestionGroupSummary(questionGroupId, summary) {
  const db = openDatabase({ readOnly: false })
  try {
    const row = db
      .prepare(
        `
        SELECT qg.id, qg.passage_id
        FROM question_groups qg
        WHERE qg.id = ?
        `,
      )
      .get(questionGroupId)

    if (!row) {
      throw new Error('题组未找到。')
    }

    db.prepare('UPDATE passages SET summary = ?, updated_at = datetime(\'now\') WHERE id = ?').run(summary, row.passage_id)
    const [questionGroup] = selectQuestionGroupCards(db, 'WHERE id = ?', [questionGroupId])
    return questionGroup
  } finally {
    db.close()
  }
}

async function generateQuestionGroupSummary(questionGroupId, apiKey, model, requestId, thinkingMode = false) {
  const resolvedRequestId = requestId || randomUUID()
  const startedAt = Date.now()
  const detail = getQuestionGroupDetail(questionGroupId)
  if (!detail) {
    throw new Error('题组未找到。')
  }

  const selectedModel = normalizeDeepSeekModel(model)
  const keySource = describeKeySource(apiKey)
  const key = String(apiKey || DEEPSEEK_API_KEY).trim()
  console.log(
    `AI summary trace=${resolvedRequestId} group=${questionGroupId} model=${selectedModel} provider=deepseek thinking=off`,
  )

  const parsed = await callDeepSeekPassageSummary({
    apiKey: key,
    model: selectedModel,
    provider: 'deepseek',
    detail,
    thinkingMode: false,
  })
  const summary = normalizeSummaryPayload(parsed)
  if (!summary) {
    throw new Error('DeepSeek 未返回有效篇章简介。')
  }

  const questionGroup = saveQuestionGroupSummary(questionGroupId, summary)
  return {
    questionGroupId,
    title: detail.title,
    summary,
    questionGroup,
    provider: 'deepseek',
    model: selectedModel,
    thinkingMode: false,
    keySource: keySource.source,
    keyFingerprint: maskApiKey(key),
    keyMask: maskApiKey(key),
    requestId: resolvedRequestId,
    totalLatencyMs: elapsedMs(startedAt),
  }
}

export function buildTopicLabelMessages(detail) {
  const allowedLabels = TOPIC_LABEL_TAXONOMY.map((entry, index) => `${index + 1}. ${entry.label}`).join('\n')
  return [
    {
      role: 'system',
      content: `${DEEPSEEK_TOPIC_LABEL_PROMPT}\n\n可选标签清单：\n${allowedLabels}`,
    },
    {
      role: 'user',
      content: `请为以下题组/篇章推荐话题标签，并严格只从清单中选择。\n\n${formatQuestionGroupForTopicLabel(detail)}`,
    },
  ]
}

async function callDeepSeekTopicLabels(context) {
  const result = await callDeepSeekWithFallback({
    apiKey: context.apiKey,
    model: context.model,
    provider: context.provider,
    messages: buildTopicLabelMessages(context.detail),
    temperature: 0.1,
    maxTokens: context.thinkingMode ? 4096 : 2500,
    thinkingMode: context.provider === LOCAL_QWEN_PROVIDER ? false : context.thinkingMode,
  })

  return result.parsed
}

async function generateTopicLabelsByQuestionGroup(questionGroupId, apiKey, model, requestId, thinkingMode = false) {
  const resolvedRequestId = requestId || randomUUID()
  const startedAt = Date.now()
  const detail = getQuestionGroupDetail(questionGroupId)
  if (!detail) {
    throw new Error('题组未找到。')
  }

  const selectedModel = normalizeDeepSeekModel(model)
  const keySource = describeKeySource(apiKey)
  const key = String(apiKey || DEEPSEEK_API_KEY).trim()
  console.log(
    `AI topic labels trace=${resolvedRequestId} group=${questionGroupId} model=${selectedModel} provider=deepseek thinking=off`,
  )

  const topicLabels = normalizeTopicLabelPayload(
    await callDeepSeekTopicLabels({
      apiKey: key,
      model: selectedModel,
      provider: 'deepseek',
      detail,
      thinkingMode: false,
    }),
  )

  if (topicLabels.length === 0) {
    throw new Error('DeepSeek 未返回有效话题标签。')
  }

  return {
    questionGroupId,
    title: detail.title,
    topicLabels,
    provider: 'deepseek',
    model: selectedModel,
    thinkingMode: false,
    keySource: keySource.source,
    keyFingerprint: maskApiKey(key),
    keyMask: maskApiKey(key),
    requestId: resolvedRequestId,
    totalLatencyMs: elapsedMs(startedAt),
    pipeline: 'deepseek-flash-topic-labels',
    fallbackUsed: false,
  }
}

export function bindTopicLabelsToQuestionGroup(questionGroupId, input) {
  const db = openDatabase({ readOnly: false })
  try {
    const exists = db.prepare('SELECT id FROM question_groups WHERE id = ?').get(questionGroupId)
    if (!exists) {
      throw new Error('题组未找到。')
    }
    const topicLabels = normalizeTopicLabelPayload(input)
    if (topicLabels.length === 0) {
      throw new Error('没有可绑定的话题标签。')
    }
    replaceQuestionGroupTopicLabels(db, questionGroupId, topicLabels)
    return {
      questionGroupId,
      topicLabels: getTopicLabelsForQuestionGroup(db, questionGroupId),
    }
  } finally {
    db.close()
  }
}

function listUnlabeledGroupIds() {
  const db = openDatabase({ readOnly: true })
  try {
    const allRows = db.prepare('SELECT id FROM question_groups ORDER BY id').all()
    const labeledRows = db
      .prepare('SELECT DISTINCT question_group_id FROM question_group_topic_labels')
      .all()
    const labeledSet = new Set(labeledRows.map((r) => r.question_group_id))
    const unlabeled = allRows.map((r) => r.id).filter((id) => !labeledSet.has(id))
    const skipped = allRows.length - unlabeled.length
    return { unlabeled, skipped }
  } finally {
    db.close()
  }
}

// Public paths that stay reachable even in forced-auth mode (plan.md decision 1 /
// ADR-0012 decision 2). Everything else — including /paper-assets/ static files
// and the /user-space/*.pdf route inside mySpaceRoutes — is gated because this
// check runs before both the static special-case and runRoutes.
const AUTH_PUBLIC_ROUTES = [
  { method: 'POST', pattern: /^\/api\/auth\/login$/ },
  { method: 'GET', pattern: /^\/api\/auth\/me$/ },
  { method: 'GET', pattern: /^\/api\/health$/ },
]

function isAuthPublicRoute(method, pathname) {
  return AUTH_PUBLIC_ROUTES.some((route) => route.method === method && route.pattern.test(pathname))
}

// Single-point auth gate (plan.md decision 2 / ADR-0012 decision 2). Bootstrap-open
// mode (empty users table) never blocks anything — this keeps every existing
// smoke/verify script (each spawning its own temp empty database) green with zero
// changes. Once the first user exists, every non-whitelisted request needs a valid,
// non-expired session for an active user; a session close to expiry is renewed
// (sliding TTL) on a short-lived write connection.
//
// GET /api/auth/me is whitelisted (never 401s here) but still needs the resolved
// session attached to context so its own handler can report authRequired/user —
// so the whitelist only suppresses the "write 401 and stop" behavior below, it
// does not skip session resolution.
//
// Returns `{ session, authMode }` (session is null when unauthenticated/open-mode)
// when the request should proceed, or `null` when this function has already
// written the response and the caller must return without doing anything else.
//
// `authMode` ('open' | 'enforced') is the M0-3 role-gate's positive signal
// (docs/cuts/m0-3-role-gate/plan.md 1a / ADR-0013): it is returned explicitly in
// every branch below (including the whitelist-route-with-no-session branch) so the
// owner-only route gate in server/router/index.mjs never has to infer "open mode"
// from an absent session — a whitelisted auth route with no cookie also has a null
// session, and that must NOT read as bootstrap-open.
function applyAuthGate(request, response, pathname) {
  const isPublic = isAuthPublicRoute(request.method, pathname)

  const readDb = openUserDatabase({ readOnly: true })
  let usersExist
  try {
    usersExist = countUsers(readDb) > 0
  } finally {
    readDb.close()
  }

  if (!usersExist) {
    // Bootstrap-open mode: behave exactly like the pre-M0-2 server.
    return { session: null, authMode: 'open' }
  }

  const token = readSessionTokenFromRequest(request)
  const readDbForSession = openUserDatabase({ readOnly: true })
  let session
  try {
    session = readSession(readDbForSession, token)
  } finally {
    readDbForSession.close()
  }

  if (!session) {
    if (isPublic) return { session: null, authMode: 'enforced' }
    sendJson(response, 401, { error: 'not_authenticated' })
    return null
  }

  if (sessionNeedsRenewal(session)) {
    const writeDb = openUserDatabase({ readOnly: false })
    try {
      renewSession(writeDb, session.tokenHash)
    } finally {
      writeDb.close()
    }
  }

  return {
    session: { userId: session.userId, username: session.username, role: session.role },
    authMode: 'enforced',
  }
}

// M0-3 owner/member route gate (docs/cuts/m0-3-role-gate/plan.md 1a, PM revision
// 2026-07-03): the runRoutes `beforeHandle` hook — this is where the 403 policy
// actually lives (router/index.mjs stays a pure dispatch skeleton with no auth
// vocabulary; see verify-h1-router-skeleton.mjs's forbidden-term guard).
//
// Uses a POSITIVE check (`authMode === 'enforced'`) rather than `!== 'open'` on
// purpose (PA MF-3): any future authMode value, or a context that forgot to set
// authMode at all, must fail OPEN here (no gate) rather than accidentally 403-ing
// bootstrap-open mode. `applyAuthGate` above is responsible for making sure
// authMode is always one of the two known strings in every reachable branch —
// this function only trusts what it's given.
function ownerGateBeforeHandle(route, { response, context }) {
  if (!route.ownerOnly) return false
  if (context?.authMode !== 'enforced') return false
  if (context?.session?.role === 'owner') return false
  sendJson(response, 403, { error: 'forbidden' })
  return true
}

const server = createServer(async (request, response) => {
  if (!request.url) {
    sendJson(response, 400, { error: 'Missing URL' })
    return
  }

  if (request.method === 'OPTIONS') {
    sendJson(response, 204, {})
    return
  }

  const url = new URL(request.url, `http://${request.headers.host || '127.0.0.1'}`)

  try {
    const authResult = applyAuthGate(request, response, url.pathname)
    if (!authResult) {
      return
    }

    if (request.method === 'GET' && url.pathname.startsWith('/paper-assets/')) {
      sendPaperAssetStatic(response, url.pathname)
      return
    }

    if (
      await runRoutes(serverRoutes, {
        request,
        response,
        url,
        context: authResult.session
          ? { ...serverContext, session: authResult.session, authMode: authResult.authMode }
          : { ...serverContext, authMode: authResult.authMode },
      }, { beforeHandle: ownerGateBeforeHandle })
    ) {
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/ai/verify-trace') {
      const traceId = url.searchParams.get('traceId')?.trim()
      if (!traceId) {
        sendJson(response, 400, { error: 'Missing traceId' })
        return
      }
      if (!existsSync(verifyAuditLogPath)) {
        sendJson(response, 200, { traceId, events: [] })
        return
      }

      const events = []
      const raw = readFileSync(verifyAuditLogPath, 'utf8')
      for (const line of raw.split('\n')) {
        if (!line.trim()) continue
        try {
          const parsed = JSON.parse(line)
          if (parsed.traceId === traceId) {
            events.push(parsed)
          }
        } catch {
          // ignore invalid lines
        }
      }
      sendJson(response, 200, { traceId, events })
      return
    }

    sendJson(response, 404, { error: 'Not found' })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    sendJson(response, 500, { error: message })
  }
})

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  ensureDatabaseShape()
  openUserDatabase({ readOnly: false }).close()
  cleanupPaperImportTempArtifacts(paperAssetsDir)
  ensureMySpaceFilesRoot(userSpaceFilesDir)

  {
    const db = openUserDatabase({ readOnly: true })
    try {
      if (countUsers(db) === 0) {
        console.warn(
          '[auth] users 表为空，登录未启用 — 运行 node scripts/create-user.mjs 创建账号（上线部署前必须先建号，见 ADR-0012 决策 1）',
        )
      }
    } finally {
      db.close()
    }
  }

  server.listen(port, '127.0.0.1', () => {
    console.log(`Question bank API listening on http://127.0.0.1:${port}`)
    console.log(`SQLite database: ${dbPath}`)
    console.log(`User-data database: ${userDataDbPath}`)
  })
}
