import {
  copyFileSync,
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
import { createExportRoutes } from './exports/exportRoutes.mjs'
import { createPaperImportRoutes } from './paper-import/paperImportRoutes.mjs'
import { ensurePaperImportDatabaseShape } from './paper-import/publisher.mjs'
import { cleanupPaperImportTempArtifacts, listPaperAssetVersions, resolvePaperAssetReadPaths } from './paper-import/storage.mjs'
import { defineRoute, readJsonRouteBody, runRoutes } from './router/index.mjs'
import { ensureMySpaceDatabaseShape, ensureMySpaceFilesRoot } from './my-space/mySpace.mjs'
import { createMySpaceRoutes } from './my-space/mySpaceRoutes.mjs'
import { createPaperSurfaceAnalysisAvailability } from './search/paperSurfaceAvailability.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const dbPath = process.env.QUESTION_BANK_DB || path.join(rootDir, 'data/question-bank.sqlite')
const exportDir = path.join(rootDir, 'exports')
const importDir = path.join(rootDir, 'imports')
const paperAssetsDir = process.env.QUESTION_BANK_PAPER_ASSET_ROOT || path.join(rootDir, 'app/public/paper-assets')
const userSpaceFilesDir = process.env.QUESTION_BANK_USER_SPACE_ROOT || path.join(rootDir, 'data/user-space/files')
const promptsDir = path.join(__dirname, 'prompts')
const verifyAuditLogPath = path.join(rootDir, 'server', 'logs', 'verify-audit.log')
const port = Number(process.env.QUESTION_BANK_API_PORT || 8787)
const paperSurfaceAnalysisAvailability = createPaperSurfaceAnalysisAvailability({ paperAssetsDir })
const serverContext = {
  rootDir,
  dbPath,
  exportDir,
  importDir,
  paperAssetsDir,
  userSpaceFilesDir,
  openDatabase,
  readJsonBody,
  sendDocx,
  sendPdf,
  sendJson,
  exportDocx,
  exportPdf,
  exportPrintHtml,
  exportPrintPdf,
  getPaperSurfaceAnalysisAvailabilityByGroupId,
  invalidatePaperSurfaceAnalysisAvailability,
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
const objectivePaperSections = [
  { title: '阅读理解 A', groupType: 'reading' },
  { title: '阅读理解 B', groupType: 'reading' },
  { title: '阅读理解 C', groupType: 'reading' },
  { title: '阅读理解 D', groupType: 'reading' },
  { title: '七选五', groupType: 'seven_choices' },
  { title: '完形填空', groupType: 'cloze' },
  { title: '语法填空', groupType: 'grammar_cloze' },
]
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
    '生态环境',
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
      if (group) return { asset, group }
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

export function isGroupPrintReady(db, groupId) {
  const group = db
    .prepare(
      `
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
      WHERE qg.id = ?
      GROUP BY qg.id, qg.group_type, qg.instruction, p.material_text, p.summary
      `,
    )
    .get(groupId)

  if (!group) return { ok: false, reason: '题组不存在' }
  if (!PRINT_READY_GROUP_TYPES.has(group.group_type)) {
    if (group.group_type === 'listening') return { ok: false, reason: '听力题组暂不支持打印' }
    return { ok: false, reason: '题型暂不支持打印' }
  }
  const paperAssetMatch = findPaperAssetGroup(groupId)
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

const draftPaperStore = createDraftPaperStore({
  exportDir,
  getQuestionGroupDetail,
  groupTypeLabels,
  isGroupPrintReady,
  openDatabase,
  rootDir,
  selectQuestionGroupCards,
})
serverContext.draftPaperStore = draftPaperStore

const serverRoutes = [
  ...h1Routes,
  ...createMySpaceRoutes(),
  ...createDraftPaperRoutes(),
  ...createPaperImportRoutes(),
  ...createExportRoutes(),
]

function getDraftSearchContext(db) {
  const current = draftPaperStore.getCurrentDraftPaperRow(db)
  if (!current) {
    return { currentDraftPaperId: null, groupIds: new Set() }
  }
  const rows = db
    .prepare('SELECT group_id FROM draft_paper_items WHERE draft_paper_id = ?')
    .all(current.id)
  return {
    currentDraftPaperId: current.id,
    groupIds: new Set(rows.map((row) => row.group_id)),
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
  ...makeTopicAliasTargets('人与自然', '自然生态', ['人与动植物']),
  ...makeTopicAliasTargets('人与自然', '环境保护', ['人与环境', '生态环境', '国土安全']),
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
    'access-control-expose-headers': 'x-verify-request-id, x-parse-request-id',
    'content-type': 'application/json; charset=utf-8',
  })
  response.end(JSON.stringify(body))
}

function sendBinary(response, { body, fileName, outputPath, contentType }) {
  response.writeHead(200, {
    'access-control-allow-origin': 'http://127.0.0.1:5173',
    'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-expose-headers': 'content-disposition, x-file-name, x-output-path',
    'content-disposition': `attachment; filename="${encodeURIComponent(fileName)}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    'content-type': contentType,
    'x-file-name': encodeURIComponent(fileName),
    'x-output-path': encodeURIComponent(outputPath),
  })
  response.end(body)
}

function sendDocx(response, body, fileName, outputPath) {
  sendBinary(response, {
    body,
    fileName,
    outputPath,
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  })
}

function sendPdf(response, body, fileName, outputPath) {
  sendBinary(response, {
    body,
    fileName,
    outputPath,
    contentType: 'application/pdf',
  })
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
    db.exec(`
      CREATE TABLE IF NOT EXISTS draft_papers (
        id TEXT PRIMARY KEY,
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
        group_id TEXT NOT NULL REFERENCES question_groups(id) ON DELETE RESTRICT,
        source_paper_id TEXT NOT NULL DEFAULT '',
        order_index INTEGER NOT NULL DEFAULT 0,
        page_break_before INTEGER NOT NULL DEFAULT 0 CHECK (page_break_before IN (0, 1)),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(draft_paper_id, group_id)
      );
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
      CREATE UNIQUE INDEX IF NOT EXISTS idx_draft_papers_current_one
      ON draft_papers(current_marker)
      WHERE current_marker = 1;
      CREATE INDEX IF NOT EXISTS idx_draft_papers_current ON draft_papers(current_marker, updated_at);
      CREATE INDEX IF NOT EXISTS idx_draft_paper_items_draft ON draft_paper_items(draft_paper_id, order_index);
      CREATE INDEX IF NOT EXISTS idx_draft_paper_items_group ON draft_paper_items(group_id);
    `)
    ensurePaperImportDatabaseShape(db)
    ensureMySpaceDatabaseShape(db)
  } finally {
    db.close()
  }
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

function normalizeTopicLabelPayload(payload) {
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
  draftContext = { currentDraftPaperId: null, groupIds: new Set() },
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
    canAddToDraftPaper: printReady.ok && draftPaperButtonState === 'add',
    draftPaperButtonState,
    currentDraftPaperId: draftContext.currentDraftPaperId,
    printUnavailableReason: printReady.ok ? null : printReady.reason,
  }
}

function selectQuestionGroupCards(db, whereClause = '', params = []) {
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
        ORDER BY year DESC, region, paper_name, section, title
      `,
    )
    .all(...params)

  const topicLabelsByGroupId = getTopicLabelsForQuestionGroups(
    db,
    rows.map((row) => row.id),
  )
  const paperSurfaceAnalysisAvailabilityByGroupId = getPaperSurfaceAnalysisAvailabilityByGroupId()
  const draftContext = getDraftSearchContext(db)

  return rows.map((row) => {
    const printReady = isGroupPrintReady(db, row.id)
    return rowToQuestionGroupCard({
      ...row,
      topicLabels: topicLabelsByGroupId.get(row.id) || [],
    }, paperSurfaceAnalysisAvailabilityByGroupId, draftContext, printReady)
  })
}

function listQuestionGroups() {
  const db = openDatabase()

  try {
    return selectQuestionGroupCards(db)
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

function applyPaperAssetToQuestionGroupDetail(baseDetail, asset, group, dbQuestions) {
  const materialText = paperAssetParagraphText(group)
  const groupType = normalizePaperAssetGroupType(group?.groupType) || baseDetail.groupType
  return {
    ...baseDetail,
    groupType,
    passage: {
      ...baseDetail.passage,
      materialText: materialText || baseDetail.passage.materialText,
      title: String(group?.title || baseDetail.passage.title || '').trim(),
    },
    questions: buildQuestionDetailsFromPaperAsset(asset, group, dbQuestions),
  }
}

function getQuestionGroupDetail(id) {
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

function rowToImportFile(row) {
  return {
    id: row.id,
    originalName: row.original_name,
    storedPath: row.stored_path,
    fileType: row.file_type,
    contentRole: row.content_role || 'question',
    bundleId: row.bundle_id || '',
    bundleTitle: row.bundle_title || '',
    status: row.status,
    sourceId: row.source_id || '',
    note: row.note || '',
    createdAt: row.created_at,
    parse: row.parse_id
      ? {
          id: row.parse_id,
          status: row.parse_status,
          parser: row.parser || '',
          lineCount: row.line_count || 0,
          charCount: row.char_count || 0,
          preview: row.parse_preview || '',
          errorMessage: row.error_message || '',
          updatedAt: row.parse_updated_at || '',
        }
      : null,
  }
}

function rowToImportFileParse(row) {
  if (!row) return null

  return {
    id: row.id,
    importFileId: row.import_file_id,
    parser: row.parser || '',
    extractedText: row.extracted_text || '',
    lineCount: row.line_count || 0,
    charCount: row.char_count || 0,
    status: row.status,
    errorMessage: row.error_message || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function listImportFiles(limit = 30) {
  const db = openDatabase()
  const safeLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 200) : 30

  try {
    return db
      .prepare(
        `
        SELECT
          f.id,
          f.original_name,
          f.stored_path,
          f.file_type,
          f.content_role,
          f.bundle_id,
          f.bundle_title,
          f.status,
          f.source_id,
          f.note,
          f.created_at,
          t.id AS parse_id,
          t.status AS parse_status,
          t.parser,
          t.line_count,
          t.char_count,
          substr(replace(replace(t.extracted_text, char(10), ' / '), char(13), ' '), 1, 220) AS parse_preview,
          t.error_message,
          t.updated_at AS parse_updated_at
        FROM import_files
        AS f
        LEFT JOIN import_file_texts t ON t.import_file_id = f.id
        ORDER BY f.created_at DESC
        LIMIT ?
        `,
      )
      .all(safeLimit)
      .map(rowToImportFile)
  } finally {
    db.close()
  }
}

function deriveImportBundleReadiness(roleCounts) {
  if (roleCounts.questionWithAnalysis > 0) return 'single_file_ready'
  if (roleCounts.question > 0 && roleCounts.answerAnalysis > 0) return 'paired_files_ready'
  if (roleCounts.question > 0) return 'missing_analysis'
  if (roleCounts.answerAnalysis > 0) return 'missing_question'
  return 'reference_only'
}

function normalizeExamTitle(value) {
  return String(value || '')
    .replace(/高考真题/g, '')
    .replace(/英语试卷/g, '')
    .replace(/英语/g, '')
    .replace(/试卷/g, '')
    .replace(/[第（）()\s/_-]/g, '')
    .replace(/卷$/g, '')
    .trim()
}

function extractDeclaredExamTitleFromText(value) {
  const preview = String(value || '')
  const match = preview.match(/20\d{2}年[^/。；;，,]{0,28}?(?:高考真题英语试卷|英语试卷|试卷)/)
  return match?.[0]?.replace(/\s+/g, ' ').trim() || ''
}

function buildImportBundleQualityWarnings(title, files) {
  const warnings = []
  const normalizedTitle = normalizeExamTitle(title)

  files.forEach((file) => {
    if (!['question', 'question_with_analysis'].includes(file.contentRole)) return

    const declaredTitle = extractDeclaredExamTitleFromText(file.parse?.preview)
    if (!declaredTitle) return

    const normalizedDeclaredTitle = normalizeExamTitle(declaredTitle)
    const isSameTitle =
      normalizedTitle &&
      normalizedDeclaredTitle &&
      (normalizedTitle.includes(normalizedDeclaredTitle) || normalizedDeclaredTitle.includes(normalizedTitle))

    if (!isSameTitle) {
      warnings.push(`来源口径提示：${file.originalName} 内文开头疑似为「${declaredTitle}」，已按文件名为准。`)
    }
  })

  return warnings.slice(0, 4)
}

function buildDraftSourceQualityWarnings(title, files) {
  const warnings = []
  const normalizedTitle = normalizeExamTitle(title)

  files.forEach((file) => {
    if (!['question', 'question_with_analysis'].includes(file.content_role)) return

    const declaredTitle = extractDeclaredExamTitleFromText(file.extracted_text)
    if (!declaredTitle) return

    const normalizedDeclaredTitle = normalizeExamTitle(declaredTitle)
    const isSameTitle =
      normalizedTitle &&
      normalizedDeclaredTitle &&
      (normalizedTitle.includes(normalizedDeclaredTitle) || normalizedDeclaredTitle.includes(normalizedTitle))

    if (!isSameTitle) {
      warnings.push(`来源口径提示：${file.original_name} 内文开头疑似为「${declaredTitle}」，已按文件名为准。`)
    }
  })

  return warnings.slice(0, 4)
}

function buildImportBundle(bundleId, files) {
  const roleCounts = {
    question: 0,
    answerAnalysis: 0,
    questionWithAnalysis: 0,
    other: 0,
  }

  for (const file of files) {
    if (file.contentRole === 'answer_analysis') {
      roleCounts.answerAnalysis += 1
    } else if (file.contentRole === 'question_with_analysis') {
      roleCounts.questionWithAnalysis += 1
    } else if (file.contentRole === 'question') {
      roleCounts.question += 1
    } else {
      roleCounts.other += 1
    }
  }

  const parsedFiles = files.filter((file) => file.parse?.status === 'succeeded')
  const failedParseFiles = files.filter((file) => file.parse?.status === 'failed')
  const title =
    files.find((file) => file.bundleTitle)?.bundleTitle ||
    files[0]?.originalName?.replace(/\.[^.]+$/, '') ||
    '未命名资料组'
  const latestCreatedAt = files.reduce(
    (latest, file) => (String(file.createdAt) > String(latest) ? file.createdAt : latest),
    files[0]?.createdAt || '',
  )

  return {
    id: bundleId,
    title,
    fileCount: files.length,
    parsedCount: parsedFiles.length,
    failedParseCount: failedParseFiles.length,
    totalLineCount: parsedFiles.reduce((sum, file) => sum + (file.parse?.lineCount || 0), 0),
    totalCharCount: parsedFiles.reduce((sum, file) => sum + (file.parse?.charCount || 0), 0),
    latestCreatedAt,
    readiness: deriveImportBundleReadiness(roleCounts),
    qualityWarnings: buildImportBundleQualityWarnings(title, files),
    roleCounts,
    files,
  }
}

function listImportBundles() {
  const files = listImportFiles(200)
  const grouped = new Map()

  for (const file of files) {
    const bundleId = file.bundleId || `single-${file.id}`
    grouped.set(bundleId, [...(grouped.get(bundleId) || []), file])
  }

  return Array.from(grouped.entries())
    .map(([bundleId, filesForBundle]) => buildImportBundle(bundleId, filesForBundle))
    .sort((a, b) => String(b.latestCreatedAt).localeCompare(String(a.latestCreatedAt)))
}

function rowToImportBatchItem(row) {
  return {
    id: row.id,
    batchId: row.batch_id,
    fileName: row.file_name,
    filePath: row.file_path,
    fileType: row.file_type,
    fileSize: row.file_size || 0,
    contentRole: row.content_role || 'question_with_analysis',
    bundleId: row.bundle_id || '',
    bundleTitle: row.bundle_title || '',
    importFileId: row.import_file_id || '',
    status: row.status,
    errorMessage: row.error_message || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function rowToImportBatch(row, items = []) {
  return {
    id: row.id,
    title: row.title,
    directoryPath: row.directory_path,
    recursive: Boolean(row.recursive),
    contentRole: row.content_role,
    status: row.status,
    fileCount: row.file_count || 0,
    supportedCount: row.supported_count || 0,
    importedCount: row.imported_count || 0,
    parsedCount: row.parsed_count || 0,
    failedCount: row.failed_count || 0,
    errorMessage: row.error_message || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items,
  }
}

function listImportBatches(limit = 12) {
  const db = openDatabase()
  const safeLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 50) : 12

  try {
    const batches = db
      .prepare(
        `
        SELECT *
        FROM import_batches
        ORDER BY updated_at DESC, created_at DESC
        LIMIT ?
        `,
      )
      .all(safeLimit)

    const selectItems = db.prepare(
      `
      SELECT *
      FROM import_batch_items
      WHERE batch_id = ?
      ORDER BY file_name COLLATE NOCASE, created_at
      LIMIT 250
      `,
    )

    return batches.map((batch) => rowToImportBatch(batch, selectItems.all(batch.id).map(rowToImportBatchItem)))
  } finally {
    db.close()
  }
}

function expandLocalPath(value) {
  const rawPath = requiredString(value, 'directoryPath')
  if (rawPath === '~') return process.env.HOME || rawPath
  if (rawPath.startsWith('~/')) return path.join(process.env.HOME || '', rawPath.slice(2))
  return rawPath
}

function inferBatchBundleTitle(fileName) {
  return sanitizeFileName(fileName)
    .replace(/\.[^.]+$/, '')
    .replace(/[-_ ]?答案版$/i, '')
    .replace(/[-_ ]?阅读理解解析[（(][^)）]+[)）]$/i, '')
    .replace(/[-_ ]?试题(?:分析|研究)?[-_ ]?解析版$/i, '')
    .replace(/[-_ ]?解析版$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function inferBatchContentRole(fileName, fallbackRole) {
  const name = String(fileName || '')
  if (/阅读理解解析|试题(?:分析|研究)?[-_ ]?解析版|解析版/.test(name)) return 'answer_analysis'
  if (/答案版/.test(name)) return 'question_with_analysis'
  return fallbackRole
}

function collectImportBatchFiles(directoryPath, recursive) {
  const files = []
  const maxFiles = 250
  const maxDepth = recursive ? 3 : 1

  function visit(currentPath, depth) {
    if (files.length >= maxFiles || depth > maxDepth) return

    const entries = readdirSync(currentPath, { withFileTypes: true }).filter((entry) => !entry.name.startsWith('.'))

    for (const entry of entries) {
      if (files.length >= maxFiles) break

      const entryPath = path.join(currentPath, entry.name)

      if (entry.isDirectory()) {
        if (recursive) visit(entryPath, depth + 1)
        continue
      }

      if (!entry.isFile()) continue

      const fileType = inferImportFileType(entry.name)
      if (!['docx', 'pdf'].includes(fileType)) continue

      const stats = statSync(entryPath)
      files.push({
        fileName: sanitizeFileName(entry.name),
        filePath: entryPath,
        fileType,
        fileSize: stats.size,
      })
    }
  }

  visit(directoryPath, 1)

  return files.sort((a, b) => a.filePath.localeCompare(b.filePath, 'zh-CN'))
}

function updateImportBatchStats(db, batchId, explicitStatus = '') {
  const stats = db
    .prepare(
      `
      SELECT
        COUNT(*) AS file_count,
        SUM(CASE WHEN status <> 'unsupported' THEN 1 ELSE 0 END) AS supported_count,
        SUM(CASE WHEN status IN ('imported', 'parsed') THEN 1 ELSE 0 END) AS imported_count,
        SUM(CASE WHEN status = 'parsed' THEN 1 ELSE 0 END) AS parsed_count,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_count,
        SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) AS queued_count,
        SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) AS skipped_count
      FROM import_batch_items
      WHERE batch_id = ?
      `,
    )
    .get(batchId)

  const fileCount = Number(stats?.file_count || 0)
  const supportedCount = Number(stats?.supported_count || 0)
  const importedCount = Number(stats?.imported_count || 0)
  const parsedCount = Number(stats?.parsed_count || 0)
  const failedCount = Number(stats?.failed_count || 0)
  const queuedCount = Number(stats?.queued_count || 0)
  const skippedCount = Number(stats?.skipped_count || 0)
  const doneCount = importedCount + skippedCount
  const status =
    explicitStatus ||
    (failedCount > 0 && importedCount === 0
      ? 'failed'
      : failedCount > 0 || (queuedCount > 0 && doneCount > 0)
        ? 'partial'
        : supportedCount > 0 && doneCount >= supportedCount
          ? 'imported'
          : 'scanned')

  db.prepare(
    `
    UPDATE import_batches
    SET
      status = ?,
      file_count = ?,
      supported_count = ?,
      imported_count = ?,
      parsed_count = ?,
      failed_count = ?,
      updated_at = datetime('now')
    WHERE id = ?
    `,
  ).run(status, fileCount, supportedCount, importedCount, parsedCount, failedCount, batchId)
}

function getImportBatch(db, batchId) {
  const batch = db.prepare('SELECT * FROM import_batches WHERE id = ?').get(batchId)
  if (!batch) return null

  const items = db
    .prepare(
      `
      SELECT *
      FROM import_batch_items
      WHERE batch_id = ?
      ORDER BY file_name COLLATE NOCASE, created_at
      `,
    )
    .all(batchId)
    .map(rowToImportBatchItem)

  return rowToImportBatch(batch, items)
}

function scanImportDirectory(input) {
  const directoryPath = expandLocalPath(input.directoryPath)
  const recursive = input.recursive === undefined ? true : Boolean(input.recursive)
  const contentRole = requiredEnum(
    input.contentRole || 'question_with_analysis',
    ['question', 'answer_analysis', 'question_with_analysis', 'other'],
    'contentRole',
  )

  if (!existsSync(directoryPath)) {
    throw new Error(`directory not found: ${directoryPath}`)
  }

  const directoryStats = statSync(directoryPath)
  if (!directoryStats.isDirectory()) {
    throw new Error(`not a directory: ${directoryPath}`)
  }

  const files = collectImportBatchFiles(directoryPath, recursive)
  const batchId = `batch-${randomUUID()}`
  const title =
    optionalString(input.title) ||
    path.basename(directoryPath) ||
    `批量导入 ${new Date().toISOString().slice(0, 10)}`
  const db = openDatabase({ readOnly: false })

  try {
    db.exec('BEGIN')
    db.prepare(
      `
      INSERT INTO import_batches (id, title, directory_path, recursive, content_role, status, file_count, supported_count)
      VALUES (?, ?, ?, ?, ?, 'scanned', ?, ?)
      `,
    ).run(batchId, title, directoryPath, recursive ? 1 : 0, contentRole, files.length, files.length)

    const insertItem = db.prepare(
      `
      INSERT INTO import_batch_items (
        id,
        batch_id,
        file_name,
        file_path,
        file_type,
        file_size,
        content_role,
        bundle_title,
        status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'queued')
      `,
    )

    files.forEach((file) => {
      insertItem.run(
        `batch-item-${randomUUID()}`,
        batchId,
        file.fileName,
        file.filePath,
        file.fileType,
        file.fileSize,
        inferBatchContentRole(file.fileName, contentRole),
        inferBatchBundleTitle(file.fileName),
      )
    })

    updateImportBatchStats(db, batchId, 'scanned')
    db.exec('COMMIT')

    return getImportBatch(db, batchId)
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

function findSectionHeadings(text) {
  const headings = []
  const headingPattern = /(^|\n)((?:第[一二三四五六七八九十]+(?:部分|节)|[一二三四五六七八九十]+、|语法填空|完形填空|七选五|阅读理解(?: [A-E])?)[^\n]{0,120})/g
  let match = headingPattern.exec(text)

  while (match) {
    headings.push({
      index: match.index + match[1].length,
      title: cleanDraftText(match[2]),
    })
    match = headingPattern.exec(text)
  }

  return headings
}

function findSectionTitle(headings, offset) {
  let current = ''

  for (const heading of headings) {
    if (heading.index > offset) break
    current = heading.title
  }

  return current
}

function stripChineseSectionPrefix(sectionTitle) {
  return String(sectionTitle || '').replace(/^[一二三四五六七八九十]+、/, '').trim()
}

function findItemBlocks(text) {
  const matches = []
  const itemPattern = /(^|\n)(\d{1,2})\.\(([\d.]+)分\)/g
  let match = itemPattern.exec(text)

  while (match) {
    matches.push({
      start: match.index + match[1].length,
      markerEnd: itemPattern.lastIndex,
      itemNo: match[2],
      score: Number(match[3]) || 0,
    })
    match = itemPattern.exec(text)
  }

  if (matches.length === 0) {
    const structuredBlocks = findStructuredExamItemBlocks(text)
    if (structuredBlocks.length > 0) return structuredBlocks

    const numberedItemPattern = /(^|\n)(\d{1,2})[.．]\s*/g
    match = numberedItemPattern.exec(text)

    while (match) {
      matches.push({
        start: match.index + match[1].length,
        markerEnd: numberedItemPattern.lastIndex,
        itemNo: match[2],
        score: 0,
      })
      match = numberedItemPattern.exec(text)
    }
  }

  return matches.map((item, index) => ({
    ...item,
    rawText: cleanItemBlockText(text.slice(item.markerEnd, matches[index + 1]?.start ?? text.length)),
  }))
}

function patternIndex(text, pattern, start = 0) {
  const offsetText = String(text || '').slice(start)
  const match = pattern.exec(offsetText)
  return match ? start + match.index + (match[1]?.length || 0) : -1
}

function nextPositiveIndex(...values) {
  const positive = values.filter((value) => Number.isInteger(value) && value >= 0)
  return positive.length > 0 ? Math.min(...positive) : -1
}

function pushSectionItemBlock(blocks, text, start, end, itemNo) {
  if (start < 0) return
  const safeEnd = end >= 0 ? end : text.length
  if (safeEnd <= start) return

  blocks.push({
    start,
    markerEnd: start,
    itemNo,
    score: 0,
    rawText: cleanItemBlockText(text.slice(start, safeEnd)),
  })
}

function findStructuredExamItemBlocks(text) {
  const blocks = []
  const readingStart = patternIndex(text, /(^|\n)第一节[^\n]*(?:(?:37\.5|30分|满分30分)[\s\S]{0,120}?阅读(?:下面|下列|上面)短文|阅读(?:下面|下列|上面)短文)/)
  const sevenStart = patternIndex(text, /(^|\n)第二节[^\n]*(?:短文后的选项|(?:\n\s*)+(?:阅读下面短文[，,])?[^\n]{0,80}短文后的选项)/)
  const languageStart = patternIndex(text, /(^|\n)第[二三]部分\s*(?:语言(?:知识)?|英语知识)运用/)
  const writingStart = patternIndex(text, /(^|\n)第[三四]部分\s*写作/)
  const readingEnd = nextPositiveIndex(sevenStart, languageStart, writingStart)

  if (readingStart >= 0 && readingEnd > readingStart) {
    const readingText = text.slice(readingStart, readingEnd)
    const letterMatches = []
    const letterPattern = /(^|\n)([A-D])\s*(?=\n)/g
    let match = letterPattern.exec(readingText)

    while (match) {
      letterMatches.push({
        start: readingStart + match.index + match[1].length,
        markerEnd: readingStart + letterPattern.lastIndex,
        letter: match[2],
      })
      match = letterPattern.exec(readingText)
    }

    const readingItems = letterMatches.length > 0 ? letterMatches : []
    if (readingItems.length === 0) {
      const numberedPattern = /(^|\n)(\d{1,2})[.．]\s+/g
      match = numberedPattern.exec(readingText)
      while (match) {
        readingItems.push({
          start: readingStart + match.index + match[1].length,
          markerEnd: readingStart + numberedPattern.lastIndex,
          letter: '',
          itemNo: match[2],
        })
        match = numberedPattern.exec(readingText)
      }
    }

    for (const [index, item] of readingItems.entries()) {
      blocks.push({
        start: item.start,
        markerEnd: item.markerEnd,
        itemNo: item.itemNo || String(item.letter.charCodeAt(0) - 64),
        score: 0,
        rawText: cleanItemBlockText(text.slice(item.markerEnd, readingItems[index + 1]?.start ?? readingEnd)),
      })
    }
  }

  pushSectionItemBlock(blocks, text, sevenStart, nextPositiveIndex(languageStart, writingStart), '5')

  if (languageStart >= 0) {
    const clozeStart = patternIndex(text, /(^|\n)第一节[^\n]*(?:15小题|每题1分|满分15分|满分30分)/, languageStart)
    const grammarStart = patternIndex(text, /(^|\n)第二节[^\n]*(?:10小题|每小题1\.5|满分15分|语法填空)/, languageStart)
    pushSectionItemBlock(blocks, text, clozeStart, nextPositiveIndex(grammarStart, writingStart), '6')
    pushSectionItemBlock(blocks, text, grammarStart, writingStart, '7')
  }

  if (writingStart >= 0) {
    const writingEnd = nextPositiveIndex()
    pushSectionItemBlock(blocks, text, writingStart, writingEnd, '8')
  }

  if (blocks.length === 0) {
    const grammarMatch = patternIndex(text, /(^|\n)语法填空/)
    const clozeMatch = patternIndex(text, /(^|\n)完形填空/)
    const sevenMatch = patternIndex(text, /(^|\n)七选五/)
    const writingFallback = patternIndex(text, /(^|\n)(?:第四部分\s*)?(?:写作|书面表达|应用文)/)
    const allStarts = [grammarMatch, clozeMatch, sevenMatch, writingStart, writingFallback].filter((s) => s >= 0).sort((a, b) => a - b)
    if (allStarts.length > 0) {
      for (let i = 0; i < allStarts.length; i++) {
        blocks.push({
          start: allStarts[i],
          markerEnd: allStarts[i],
          itemNo: String(i + 1),
          score: 0,
          rawText: cleanItemBlockText(text.slice(allStarts[i], allStarts[i + 1] ?? text.length)),
        })
      }
    }
  }

  return blocks.sort((a, b) => a.start - b.start)
}

function cleanItemBlockText(text) {
  let result = cleanDraftText(text)
  let previous = ''

  while (result && result !== previous) {
    previous = result
    result = result.replace(/\n(?:[A-D]|第[一二三四五六七八九十]+(?:部分|节)[^\n]*|[一二三四五六七八九十]+、[^\n]*)\s*$/, '').trim()
  }

  return result
}

function findOptionMarkers(text) {
  const markers = []
  const optionPattern = /(^|\s)([A-G])(?:[．.、]|\s+(?=[A-Za-z]))\s*/g
  let match = optionPattern.exec(text)

  while (match) {
    markers.push({
      label: match[2],
      start: match.index + match[1].length,
      end: optionPattern.lastIndex,
    })
    match = optionPattern.exec(text)
  }

  return markers
}

function findLineOptionMarkers(text) {
  const markers = []
  const optionPattern = /(^|\n)(\s*)([A-G])[．.、]\s*/g
  let match = optionPattern.exec(text)

  while (match) {
    markers.push({
      label: match[3],
      start: match.index + match[1].length + match[2].length,
      end: optionPattern.lastIndex,
    })
    match = optionPattern.exec(text)
  }

  return markers
}

function extractOptionsFromMarkers(text, markers) {
  const rawOptions = markers
    .map((marker, index) => ({
      label: marker.label,
      content: cleanDraftText(text.slice(marker.end, markers[index + 1]?.start ?? text.length)),
    }))
    .filter((option) => option.content)

  return splitEmbeddedOptionMarkers(rawOptions)
}

function splitEmbeddedOptionMarkers(options) {
  const output = []
  const labelOrder = (label) => String(label || '').toUpperCase().charCodeAt(0)

  options.forEach((option) => {
    let currentLabel = option.label
    let content = option.content
    const embeddedPattern = /([^\s])([A-G])[．.、]\s*/g
    let match = embeddedPattern.exec(content)

    while (match) {
      const nextLabel = match[2]
      const markerStart = match.index + match[1].length
      if (labelOrder(nextLabel) <= labelOrder(currentLabel)) {
        match = embeddedPattern.exec(content)
        continue
      }

      const currentContent = cleanDraftText(content.slice(0, markerStart))
      if (currentContent) {
        output.push({ label: currentLabel, content: currentContent })
      }

      currentLabel = nextLabel
      content = content.slice(embeddedPattern.lastIndex)
      embeddedPattern.lastIndex = 0
      match = embeddedPattern.exec(content)
    }

    const finalContent = cleanDraftText(content)
    if (finalContent) {
      output.push({ label: currentLabel, content: finalContent })
    }
  })

  return output
}

function extractOptions(text) {
  return extractOptionsFromMarkers(text, findOptionMarkers(text))
}

function extractLineOptions(text) {
  return extractOptionsFromMarkers(text, findLineOptionMarkers(text))
}

function stripBracketAnswerBlocks(text) {
  return cleanDraftText(text)
    .replace(/【答案】[\s\S]*?(?=(?:\n\s*[（(]\d{1,2}[）)]|\n\s*[A-G][．.、]|\n\s*$|$))/g, '')
    .trim()
}

function normalizeAnswerValue(value) {
  return cleanDraftText(value)
    .replace(/^[：:，,。．.\s]+/, '')
    .replace(/[。．.\s]+$/, '')
    .trim()
}

function extractBracketAnswerValue(text) {
  const choiceMatch = String(text || '').match(/【答案】\s*([A-G])(?:\s|$)/)
  if (choiceMatch) return normalizeAnswerValue(choiceMatch[1])

  const match = String(text || '').match(/【答案】\s*([^\n]+)/)
  return match ? normalizeAnswerValue(match[1]) : ''
}

function countLineStartQuestionMarkers(text) {
  const value = String(text || '')
  const parenthesizedCount = [...value.matchAll(/(^|\n)[（(]\d{1,2}[）)]\s*/g)].length
  const numberedCount = [...value.matchAll(/(^|\n)\d{1,2}[.．]\s+/g)].length
  return parenthesizedCount + numberedCount
}

function countParenthesizedQuestionMarkers(text) {
  return [...String(text || '').matchAll(/(^|\n)[（(]\d{1,2}[）)]\s*/g)].length
}

function buildAnswerMapFromBracketAnswers(blockText) {
  const answerMap = new Map()
  const text = cleanDraftText(blockText)
  const explicitPattern = /(^|\n)[（(](\d{1,2})[）)]\s*(?:\n|\s)*【答案】\s*([^\n]+)/g
  let match = explicitPattern.exec(text)

  while (match) {
    answerMap.set(match[2], normalizeAnswerValue(match[3]))
    match = explicitPattern.exec(text)
  }

  const listMatch = text.match(/【答案】\s*\[\[([\s\S]*?)\]\]/)
  if (listMatch) {
    const values = [...listMatch[1].matchAll(/"([^"]+)"/g)].map((item) => normalizeAnswerValue(item[1]))
    const questionNos = [...new Set([...text.matchAll(/[（(](\d{1,2})[）)]/g)].map((item) => item[1]))]

    values.forEach((value, index) => {
      if (questionNos[index] && !answerMap.has(questionNos[index])) answerMap.set(questionNos[index], value)
    })
  }

  const plainListMatch = text.match(/【答案】\s*([^\n]+)/)
  if (plainListMatch && !plainListMatch[1].includes('[[')) {
    const values = plainListMatch[1]
      .split(/[；;、，,]\s*/)
      .map(normalizeAnswerValue)
      .filter(Boolean)
    const questionNos = [...new Set([...text.matchAll(/[（(](\d{1,2})[）)]/g)].map((item) => item[1]))]

    if (values.length > 1) {
      values.forEach((value, index) => {
        if (questionNos[index] && !answerMap.has(questionNos[index])) answerMap.set(questionNos[index], value)
      })
    }
  }

  return answerMap
}

function defaultScoreForGroup(groupType) {
  if (groupType === 'cloze' || groupType === 'grammar_cloze') return 1.5
  if (groupType === 'writing') return 25
  return 2
}

function inferTotalScoreFromSectionTitle(sectionTitle) {
  return Number(String(sectionTitle || '').match(/满分\s*([\d.]+)\s*分/)?.[1]) || 0
}

function inferPerQuestionScoreFromSectionTitle(sectionTitle) {
  const score = Number(String(sectionTitle || '').match(/每小题\s*([\d.]+)\s*分/)?.[1]) || 0
  return score > 0 && score <= 5 ? score : 0
}

function readingPassageLetter(itemNo) {
  const index = Number(itemNo) - 1
  if (!Number.isInteger(index) || index < 0 || index > 25) return String(itemNo || '').trim()
  return String.fromCharCode(65 + index)
}

function isListeningItem(sectionTitle, rawText) {
  const signalText = cleanDraftText(`${sectionTitle}\n${String(rawText || '').slice(0, 220)}`)
  return /听力|听下面|对话|独白|听完|录音/.test(signalText)
}

function inferDraftGroupName(groupType, sectionTitle, itemNo) {
  const sectionName = stripChineseSectionPrefix(sectionTitle)

  if (groupType === 'reading') return `阅读理解 ${readingPassageLetter(itemNo)}`
  if (groupType === 'seven_choices') return '七选五'
  if (groupType === 'cloze') return '完形填空'
  if (groupType === 'grammar_cloze') return '语法填空'
  if (groupType === 'writing' && sectionName.includes('短文改错')) return '短文改错'
  if (groupType === 'writing' && sectionName.includes('书面表达')) return '书面表达'
  if (groupType === 'writing') return '写作'

  const fallback = groupTypeLabels[groupType] || sectionName || '题组'
  return itemNo ? `${fallback} ${itemNo}` : fallback
}

function buildDraftGroupTitle(bundleTitle, groupType, sectionTitle, itemNo) {
  return cleanDraftText(`${bundleTitle} ${inferDraftGroupName(groupType, sectionTitle, itemNo)}`)
}

function questionContext(text, index, size = 120) {
  const start = Math.max(0, index - size)
  const end = Math.min(text.length, index + size)
  return cleanDraftText(text.slice(start, end))
}

function inferQuestionStem(stem, questionNo, groupType) {
  if (stem) return stem
  if (groupType === 'cloze') return `第 ${questionNo} 空`
  if (groupType === 'seven_choices') return `第 ${questionNo} 空`
  if (groupType === 'grammar_cloze') return `第 ${questionNo} 空`
  return `第 ${questionNo} 题`
}

function parseScoredQuestions(blockText, groupType) {
  const matches = []
  const questionPattern = /[（(](\d{1,2})[）)]\s*[（(]([\d.]+)分[）)]/g
  let match = questionPattern.exec(blockText)

  while (match) {
    matches.push({
      start: match.index,
      markerEnd: questionPattern.lastIndex,
      questionNo: match[1],
      score: Number(match[2]) || 0,
    })
    match = questionPattern.exec(blockText)
  }

  const questions = matches.map((item, index) => {
    const segment = cleanDraftText(blockText.slice(item.markerEnd, matches[index + 1]?.start ?? blockText.length))
    const answer = extractBracketAnswerValue(segment)
    const questionText = stripBracketAnswerBlocks(segment)
    const optionMarkers = findOptionMarkers(questionText)
    const stemText = optionMarkers.length > 0 ? questionText.slice(0, optionMarkers[0].start) : questionText
    const stem = inferQuestionStem(cleanDraftText(stemText), item.questionNo, groupType)

    return {
      questionNo: item.questionNo,
      questionType: groupType === 'cloze' ? '完形语义' : groupType === 'grammar_cloze' ? '语法填空' : '',
      stem,
      answer,
      explanation: '',
      score: item.score,
      options: extractOptions(questionText),
      rawText: segment,
      confidence: optionMarkers.length > 0 && answer ? 0.86 : optionMarkers.length > 0 || stemText.trim() ? 0.82 : 0.58,
    }
  })

  return {
    materialText: cleanDraftText(matches.length > 0 ? blockText.slice(0, matches[0].start) : blockText),
    questions,
  }
}

function parseParenthesizedChoiceQuestions(blockText, groupType) {
  const matches = []
  const questionPattern = /(^|\n)[（(](\d{1,2})[）)]\s*/g
  let match = questionPattern.exec(blockText)

  while (match) {
    matches.push({
      start: match.index + match[1].length,
      markerEnd: questionPattern.lastIndex,
      questionNo: match[2],
    })
    match = questionPattern.exec(blockText)
  }

  const questions = matches.map((item, index) => {
    const segment = cleanDraftText(blockText.slice(item.markerEnd, matches[index + 1]?.start ?? blockText.length))
    const answer = extractBracketAnswerValue(segment)
    const questionText = stripBracketAnswerBlocks(segment)
    const optionMarkers = findOptionMarkers(questionText)
    const stemText = optionMarkers.length > 0 ? questionText.slice(0, optionMarkers[0].start) : questionText
    const stem = inferQuestionStem(cleanDraftText(stemText), item.questionNo, groupType)

    return {
      questionNo: item.questionNo,
      questionType: groupType === 'cloze' ? '完形语义' : groupType === 'reading' ? '阅读选择' : '',
      stem,
      answer,
      explanation: '',
      score: defaultScoreForGroup(groupType),
      options: extractOptions(questionText),
      rawText: segment,
      confidence: optionMarkers.length > 0 && answer ? 0.86 : optionMarkers.length > 0 ? 0.8 : 0.62,
    }
  })

  return {
    materialText: cleanDraftText(matches.length > 0 ? blockText.slice(0, matches[0].start) : blockText),
    questions,
  }
}


function parseLineNumberedChoiceQuestions(blockText, groupType) {
  const matches = []
  const questionPattern = /(^|\n)(\d{1,2})[.．]\s*/g
  let match = questionPattern.exec(blockText)

  while (match) {
    matches.push({
      start: match.index + match[1].length,
      markerEnd: questionPattern.lastIndex,
      questionNo: match[2],
    })
    match = questionPattern.exec(blockText)
  }

  const questions = matches.map((item, index) => {
    const segment = cleanDraftText(blockText.slice(item.markerEnd, matches[index + 1]?.start ?? blockText.length))
    const answer = extractBracketAnswerValue(segment)
    const questionText = stripBracketAnswerBlocks(segment)
    const optionMarkers = findOptionMarkers(questionText)
    const stemText = optionMarkers.length > 0 ? questionText.slice(0, optionMarkers[0].start) : questionText
    const stem = inferQuestionStem(cleanDraftText(stemText), item.questionNo, groupType)

    return {
      questionNo: item.questionNo,
      questionType: groupType === 'cloze' ? '完形语义' : groupType === 'reading' ? '阅读选择' : '',
      stem,
      answer,
      explanation: '',
      score: defaultScoreForGroup(groupType),
      options: extractOptions(questionText),
      rawText: segment,
      confidence: optionMarkers.length > 0 && answer ? 0.86 : optionMarkers.length > 0 ? 0.8 : 0.62,
    }
  })

  return {
    materialText: cleanDraftText(matches.length > 0 ? blockText.slice(0, matches[0].start) : blockText),
    questions,
  }
}

function parseGapQuestions(blockText, groupType) {
  const answerMap = buildAnswerMapFromBracketAnswers(blockText)
  const textWithoutAnswers = stripBracketAnswerBlocks(blockText).replace(/(^|\n)[（(]\d{1,2}[）)]\s*(?=\n|$)/g, '\n')
  const optionMarkers =
    groupType === 'seven_choices' ? findLineOptionMarkers(textWithoutAnswers)
    : groupType === 'grammar_cloze' ? []
    : findOptionMarkers(textWithoutAnswers)
  const materialText = cleanDraftText(
    optionMarkers.length > 0 ? textWithoutAnswers.slice(0, optionMarkers[0].start) : textWithoutAnswers,
  )
  const commonOptions =
    groupType === 'seven_choices' ? extractOptionsFromMarkers(textWithoutAnswers, optionMarkers) : []
  const gapPattern = /[（(](\d{1,2})[）)]|_{2,}\s*(\d{1,2})\s*_{2,}|(?<!\d)(\d{1,2})[.．]\s*_{2,}/g
  const seen = new Set()
  const questions = []
  let match = gapPattern.exec(materialText)

  while (match) {
    const questionNo = match[1] || match[2] || match[3]
    if (!seen.has(questionNo)) {
      seen.add(questionNo)
      questions.push({
        questionNo,
        questionType: groupType === 'seven_choices' ? '句子还原' : '语法填空',
        stem: inferQuestionStem('', questionNo, groupType),
        answer: answerMap.get(questionNo) || '',
        explanation: '',
        score: defaultScoreForGroup(groupType),
        options: commonOptions,
        rawText: questionContext(materialText, match.index),
        confidence:
          groupType === 'seven_choices' && commonOptions.length >= 5 && answerMap.has(questionNo)
            ? 0.84
            : groupType === 'seven_choices' && commonOptions.length >= 5
              ? 0.78
              : answerMap.has(questionNo)
                ? 0.74
                : 0.68,
      })
    }
    match = gapPattern.exec(materialText)
  }

  return { materialText, questions }
}

function inferGroupType(sectionTitle, blockText, itemNo = '') {
  const sectionName = stripChineseSectionPrefix(sectionTitle)
  const compactText = cleanDraftText(blockText)
  const signalText = cleanDraftText(`${sectionName}\n${compactText}`)

  if (sectionName.includes('完形')) return 'cloze'
  if (sectionName.includes('语法')) return 'grammar_cloze'
  if (sectionName.includes('七选五') || sectionName.includes('短文七')) return 'seven_choices'
  if (sectionName.includes('书信') || sectionName.includes('写作')) return 'writing'
  if (/短文后的选项|多余选项|七选五/.test(signalText)) return 'seven_choices'
  if (/在空白处|括号内单词|语法填空/.test(signalText)) return 'grammar_cloze'
  if (/完形/.test(signalText)) return 'cloze'
  if (/短文改错|修改作文|书面表达|写封邮件/.test(signalText)) return 'writing'

  const hasScoredQuestionMarkers = /\(\d{1,2}\)\s*\(([\d.]+)分\)/.test(compactText)
  const scoredQuestionMarkerCount = [...compactText.matchAll(/[（(]\d{1,2}[）)]\s*[（(][\d.]+分[）)]/g)].length
  const optionCount = extractOptions(stripBracketAnswerBlocks(compactText)).length
  const blankCount = new Set([...compactText.matchAll(/[（(](\d{1,2})[）)]/g)].map((match) => match[1])).size
  const lineOptions = extractLineOptions(stripBracketAnswerBlocks(compactText))
  const uniqueLineOptionLabels = new Set(lineOptions.map((option) => option.label))
  const lineStartQuestionCount = countLineStartQuestionMarkers(compactText)

  if (blankCount >= 5 && uniqueLineOptionLabels.size >= 7) return 'seven_choices'
  if (scoredQuestionMarkerCount >= 15 || (lineStartQuestionCount >= 15 && hasScoredQuestionMarkers)) return 'cloze'
  if (/续写|段落开头语|写一篇|写篇|演讲稿|投稿|报道|邮件|短文参赛|书面表达|应用文/.test(signalText)) return 'writing'
  if (sectionName.includes('阅读')) return 'reading'
  if (lineStartQuestionCount >= 15 && optionCount >= lineStartQuestionCount * 3) return 'cloze'
  if (lineStartQuestionCount >= 1 && optionCount >= lineStartQuestionCount * 3) return 'reading'
  if (['5'].includes(String(itemNo)) && optionCount >= 7 && blankCount >= 5) return 'seven_choices'

  return 'other'
}

function inferSourceMetadata(bundleTitle) {
  const title = String(bundleTitle || '')
  const year = Number(title.match(/(20\d{2})/)?.[1]) || new Date().getFullYear()
  const region = title.match(/年([^卷]+?)卷/)?.[1] || ''

  return {
    sourceType: 'real_exam',
    year,
    region,
    paperName: title,
  }
}

function buildDraftGroup({ bundleTitle, item, sectionTitle }) {
  const groupType = item.groupType || inferGroupType(sectionTitle, item.rawText, item.itemNo)
  const sectionName = stripChineseSectionPrefix(sectionTitle) || groupTypeLabels[groupType]
  const inferredScore = item.score || (groupType === 'reading' ? 0 : inferTotalScoreFromSectionTitle(sectionTitle))
  const inferredQuestionScore = inferPerQuestionScoreFromSectionTitle(sectionTitle)
  const titleItemNo = item.titleItemNo || item.itemNo
  const scored = parseScoredQuestions(item.rawText, groupType)
  const parsed =
    scored.questions.length > 0
      ? scored
      : ['reading', 'cloze'].includes(groupType) && countLineStartQuestionMarkers(item.rawText) > 0
        ? countParenthesizedQuestionMarkers(item.rawText) > 0
          ? parseParenthesizedChoiceQuestions(item.rawText, groupType)
          : parseLineNumberedChoiceQuestions(item.rawText, groupType)
      : groupType === 'writing'
        ? {
            materialText: '',
            questions: [
              {
                questionNo: item.itemNo,
                questionType: '写作任务',
                stem: item.rawText,
                answer: '',
                explanation: '',
                score: inferredScore || defaultScoreForGroup(groupType),
                options: [],
                rawText: item.rawText,
                confidence: 0.74,
              },
            ],
          }
        : parseGapQuestions(item.rawText, groupType)
  const normalizedQuestionScore =
    inferredQuestionScore ||
    (inferredScore > 0 && parsed.questions.length > 0 ? inferredScore / parsed.questions.length : 0)
  const normalizedParsed =
    normalizedQuestionScore > 0 && ['reading', 'seven_choices', 'cloze', 'grammar_cloze'].includes(groupType)
      ? {
          ...parsed,
          questions: parsed.questions.map((question) => ({
            ...question,
            score: normalizedQuestionScore,
          })),
        }
      : parsed
  const warnings = []

  if (normalizedParsed.questions.length === 0) warnings.push('未识别到小题，请人工检查原文格式。')
  if (groupType === 'reading' && normalizedParsed.questions.some((question) => question.options.length === 0)) {
    warnings.push('存在无选项题，可能是阅读回答问题或选项识别不完整。')
  }
  if (groupType === 'grammar_cloze' && normalizedParsed.questions.some((question) => !question.answer)) {
    warnings.push('语法填空存在未识别答案，需人工或解析文件补齐。')
  }
  if (groupType === 'seven_choices') {
    const optionLabels = normalizedParsed.questions[0]?.options?.map((option) => option.label) || []
    const duplicateLabels = [...new Set(optionLabels.filter((label, index) => optionLabels.indexOf(label) !== index))]
    const missingLabels = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].filter((label) => !optionLabels.includes(label))

    if (optionLabels.length !== 7 || duplicateLabels.length > 0 || missingLabels.length > 0) {
      const details = [
        missingLabels.length > 0 ? `缺少 ${missingLabels.join('、')}` : '',
        duplicateLabels.length > 0 ? `重复 ${duplicateLabels.join('、')}` : '',
        optionLabels.length !== 7 ? `识别到 ${optionLabels.length} 个选项` : '',
      ]
        .filter(Boolean)
        .join('，')
      warnings.push(`七选五选项标签疑似异常：${details}，请人工核对原文。`)
    }
  }

  return {
    id: `draft-${item.itemNo}`,
    sourceItemNo: item.itemNo,
    sectionTitle,
    groupType,
    title: buildDraftGroupTitle(bundleTitle, groupType, sectionTitle, titleItemNo),
    instruction: sectionName,
    materialText: normalizedParsed.materialText,
    questionCount: normalizedParsed.questions.length,
    totalScore: normalizedParsed.questions.reduce((sum, question) => sum + (question.score || 0), 0) || inferredScore,
    confidence:
      normalizedParsed.questions.length === 0
        ? 0.35
        : Math.min(...normalizedParsed.questions.map((question) => question.confidence ?? 0.6)),
    warnings,
    questions: normalizedParsed.questions,
  }
}

function getParsedImportFilesForBundle(bundleId) {
  const db = openDatabase()
  const fallbackFileId = String(bundleId || '').startsWith('single-') ? String(bundleId).slice('single-'.length) : ''

  try {
    return db
      .prepare(
        `
        SELECT
          f.id,
          f.original_name,
          f.content_role,
          f.bundle_id,
          f.bundle_title,
          f.created_at,
          t.parser,
          t.extracted_text,
          t.line_count,
          t.char_count
        FROM import_files f
        JOIN import_file_texts t ON t.import_file_id = f.id
        WHERE (f.bundle_id = ? OR f.id = ?) AND t.status = 'succeeded'
        ORDER BY f.created_at ASC
        `,
      )
      .all(bundleId, fallbackFileId)
  } finally {
    db.close()
  }
}

async function generateImportBundleDraft(bundleId) {
  const files = getParsedImportFilesForBundle(bundleId)
  if (files.length === 0) return null

  const primaryFiles = files.filter((file) => ['question', 'question_with_analysis'].includes(file.content_role))
  const sourceFiles = primaryFiles.length > 0 ? primaryFiles : files
  const answerFiles = files.filter((file) => ['answer_analysis', 'question_with_analysis'].includes(file.content_role))
  const title = sourceFiles.find((file) => file.bundle_title)?.bundle_title || sourceFiles[0].original_name.replace(/\.[^.]+$/, '')
  const text = normalizeDraftText(sourceFiles.map((file) => file.extracted_text).join('\n\n'))
  const headings = findSectionHeadings(text)
  const itemBlocks = findItemBlocks(text)
    .map((item) => ({
      ...item,
      sectionTitle: findSectionTitle(headings, item.start),
    }))
    .filter((item) => !isListeningItem(item.sectionTitle, item.rawText))
  const source = inferSourceMetadata(title)
  let readingIndex = 0
  const parsedGroups = itemBlocks.map((item) => {
    const groupType = inferGroupType(item.sectionTitle, item.rawText, item.itemNo)
    const titleItemNo = groupType === 'reading' ? String(++readingIndex) : item.itemNo

    return buildDraftGroup({
      bundleTitle: title,
      item: {
        ...item,
        groupType,
        titleItemNo,
      },
      sectionTitle: item.sectionTitle,
    })
  })
  const answerIndex = answerFiles.length > 0 ? buildStructuredAnswerEntryIndex(answerFiles, title) : null
  const answerMerge = answerIndex ? mergeAnswerEntriesIntoDraftGroups(parsedGroups, answerIndex) : null
  const groups = answerMerge?.groups || parsedGroups
  const warnings = []

  if (groups.length === 0) warnings.push('未识别到题组编号，如 1.(15分)，请检查 DOCX 抽取文本。')
  if (answerFiles.length === 0) {
    warnings.push('当前资料组缺少解析文件，草稿暂不含答案和解析。')
  }
  if (answerIndex) {
    warnings.push(...answerIndex.warnings)
    if (answerIndex.structuredEntryCount === 0 && answerIndex.global.length === 0) {
      warnings.push('解析文件中未识别到可并入草稿的答案条目，请人工检查格式。')
    } else if ((answerMerge?.matchedQuestionCount || 0) === 0) {
      warnings.push('解析文件已有答案条目，但暂未匹配到草稿题号，请人工核对题号或题组边界。')
    }
  }
  warnings.push(...buildDraftSourceQualityWarnings(title, sourceFiles))

  const draft = {
    id: `draft-${bundleId}`,
    bundleId,
    title,
    source,
    generatedAt: new Date().toISOString(),
    sourceFiles: sourceFiles.map((file) => ({
      id: file.id,
      originalName: file.original_name,
      contentRole: file.content_role,
      parser: file.parser,
      lineCount: file.line_count || 0,
      charCount: file.char_count || 0,
    })),
    answerFiles: answerFiles.map((file) => ({
      id: file.id,
      originalName: file.original_name,
      contentRole: file.content_role,
      parser: file.parser,
      lineCount: file.line_count || 0,
      charCount: file.char_count || 0,
    })),
    answerMatchedQuestionCount: answerMerge?.matchedQuestionCount || 0,
    groupCount: groups.length,
    questionCount: groups.reduce((sum, group) => sum + group.questionCount, 0),
    warnings,
    groups,
  }

  return draft
}

function getImportBundleTitle(bundleId) {
  const db = openDatabase()
  const fallbackFileId = String(bundleId || '').startsWith('single-') ? String(bundleId).slice('single-'.length) : ''

  try {
    const row = db
      .prepare(
        `
        SELECT bundle_title, original_name
        FROM import_files
        WHERE bundle_id = ? OR id = ?
        ORDER BY created_at ASC
        LIMIT 1
        `,
      )
      .get(bundleId, fallbackFileId)

    return row?.bundle_title || row?.original_name?.replace(/\.[^.]+$/, '') || ''
  } finally {
    db.close()
  }
}

function getParsedAnswerFilesForBundle(bundleId) {
  const db = openDatabase()
  const fallbackFileId = String(bundleId || '').startsWith('single-') ? String(bundleId).slice('single-'.length) : ''

  try {
    return db
      .prepare(
        `
        SELECT
          f.id,
          f.original_name,
          f.content_role,
          f.bundle_id,
          f.bundle_title,
          f.created_at,
          t.parser,
          t.extracted_text,
          t.line_count,
          t.char_count
        FROM import_files f
        JOIN import_file_texts t ON t.import_file_id = f.id
        WHERE
          (f.bundle_id = ? OR f.id = ?)
          AND f.content_role IN ('answer_analysis', 'question_with_analysis')
          AND t.status = 'succeeded'
        ORDER BY f.created_at ASC
        `,
      )
      .all(bundleId, fallbackFileId)
  } finally {
    db.close()
  }
}

function parseQuestionNoFromTitle(title) {
  const readingMatch = String(title || '').match(/阅读理解\s*([A-D])/i)
  if (readingMatch) return readingMatch[1].toUpperCase()

  return String(title || '').match(/(\d{1,2})\s*$/)?.[1] || ''
}

function listFormalGroupsForBundleTitle(bundleTitle) {
  const db = openDatabase()
  const title = String(bundleTitle || '').trim()

  try {
    const rows = db
      .prepare(
        `
        SELECT
          qg.id AS group_id,
          qg.title,
          qg.group_type,
          qg.default_score,
          s.paper_name,
          s.region,
          q.id AS question_id,
          q.question_no,
          q.stem,
          q.answer,
          q.explanation,
          q.display_order
        FROM question_groups qg
        JOIN passages p ON p.id = qg.passage_id
        JOIN sources s ON s.id = p.source_id
        LEFT JOIN questions q ON q.group_id = qg.id
        WHERE s.paper_name = ? OR qg.title LIKE ?
        ORDER BY qg.title ASC, q.display_order ASC
        `,
      )
      .all(title, `${title}%`)
    const groups = new Map()

    for (const row of rows) {
      if (!groups.has(row.group_id)) {
        groups.set(row.group_id, {
          id: row.group_id,
          title: row.title,
          sourceItemNo: parseQuestionNoFromTitle(row.title),
          groupType: row.group_type,
          defaultScore: row.default_score || 0,
          paperName: row.paper_name || '',
          region: row.region || '',
          questions: [],
        })
      }

      if (row.question_id) {
        groups.get(row.group_id).questions.push({
          id: row.question_id,
          questionNo: row.question_no,
          stem: row.stem || '',
          answer: row.answer || '',
          explanation: row.explanation || '',
        })
      }
    }

    return Array.from(groups.values())
  } finally {
    db.close()
  }
}

function isAnswerEntryStart(text) {
  return /^\s*[A-G]\b/.test(text)
}

function findAnswerItemBlocks(text) {
  const matches = []
  const itemPattern = /(^|\n)(\d{1,2})[.、．]\s*([^\n]{0,80})/g
  let match = itemPattern.exec(text)

  while (match) {
    if (!isAnswerEntryStart(match[3]) && /(答案|解析|完形|语法|阅读|七选五|写作)/.test(match[3])) {
      matches.push({
        start: match.index + match[1].length,
        markerEnd: itemPattern.lastIndex,
        itemNo: match[2],
      })
    }
    match = itemPattern.exec(text)
  }

  return matches.map((item, index) => ({
    ...item,
    rawText: cleanDraftText(text.slice(item.markerEnd, matches[index + 1]?.start ?? text.length)),
  }))
}

function cleanAnswerExplanation(text) {
  return cleanDraftText(text)
    .replace(/^答案\s*[:：]?\s*/i, '')
    .replace(/^解析\s*[:：]?\s*/i, '')
    .replace(/^[。．.、，,;；\s]+/, '')
    .trim()
}

function parseAnswerEntries(text) {
  const entries = []
  const normalized = cleanDraftText(text)
  const entryPattern =
    /(?:^|\n|\s)(?:[（(](\d{1,2})[）)]|(\d{1,2})[.、．])\s*([A-G])(?:\s*[。．.、，,;；]?\s*)([\s\S]*?)(?=(?:\n|\s)(?:[（(]\d{1,2}[）)]|\d{1,2}[.、．])\s*[A-G](?:\s|[。．.、，,;；])|$)/g
  let match = entryPattern.exec(normalized)

  while (match) {
    const explanation = cleanAnswerExplanation(match[4])
    entries.push({
      questionNo: match[1] || match[2],
      answer: match[3],
      explanation,
      rawText: cleanDraftText(match[0]),
      confidence: explanation ? 0.78 : 0.62,
    })
    match = entryPattern.exec(normalized)
  }

  return entries
}


function parseCompactAnswerEntries(text) {
  const normalized = cleanDraftText(text).replace(/([A-G])(?=\d{1,2}\s*[-－—]\s*\d{1,2})/g, '$1 ')
  const entries = []
  const rangePattern = /(?:^|\n|\s)(\d{1,2})\s*[-－—]\s*(\d{1,2})\s*([A-G]{2,})(?=\s|$)/g
  let match = rangePattern.exec(normalized)

  while (match) {
    const start = Number(match[1])
    const end = Number(match[2])
    const values = match[3].split('')
    if (Number.isInteger(start) && Number.isInteger(end) && end >= start && end - start + 1 === values.length) {
      values.forEach((answer, index) => {
        const questionNo = String(start + index)
        entries.push({
          questionNo,
          answer,
          explanation: '',
          rawText: cleanDraftText(match[0]),
          confidence: 0.76,
        })
      })
    }
    match = rangePattern.exec(normalized)
  }

  const grammarStart = normalized.search(/语法填空/)
  if (grammarStart >= 0) {
    const afterGrammar = normalized.slice(grammarStart)
    const writingOffset = afterGrammar.search(/第四部分|写作/)
    const rawGrammarText = writingOffset >= 0 ? afterGrammar.slice(0, writingOffset) : afterGrammar
    const grammarText = cleanDraftText(rawGrammarText)
      .replace(/^语法填空[^\n]*(?:\n|$)/, '')
      .replace(/([A-Za-z)）/])(\d{1,2}[.、．])/g, '$1 $2')
    const grammarMarkers = []
    const grammarPattern = /(?:^|\s)(\d{1,2})[.、．]\s*/g
    match = grammarPattern.exec(grammarText)

    while (match) {
      grammarMarkers.push({
        questionNo: Number(match[1]),
        start: match.index,
        end: grammarPattern.lastIndex,
      })
      match = grammarPattern.exec(grammarText)
    }

    const pushGrammarEntry = (questionNo, rawAnswer, rawText = rawAnswer) => {
      const answer = normalizeAnswerValue(String(rawAnswer || '').replace(/\s*\n\s*/g, ' ').replace(/\s{2,}/g, ' '))
      if (answer && !/^[A-G]$/.test(answer)) {
        entries.push({
          questionNo: String(questionNo),
          answer,
          explanation: '',
          rawText: cleanDraftText(rawText),
          confidence: 0.72,
        })
      }
    }
    const splitGrammarAnswerLines = (rawAnswer) =>
      String(rawAnswer || '')
        .split(/\n+/)
        .map((part) => normalizeAnswerValue(part))
        .filter(Boolean)

    const firstGrammarMarker = grammarMarkers[0]
    if (firstGrammarMarker?.questionNo === 57) {
      pushGrammarEntry(56, grammarText.slice(0, firstGrammarMarker.start))
    }

    grammarMarkers.forEach((marker, index) => {
      const nextMarker = grammarMarkers[index + 1]
      const rawAnswer = grammarText.slice(marker.end, nextMarker?.start ?? grammarText.length)
      const gapSize = nextMarker ? nextMarker.questionNo - marker.questionNo : 1

      if (gapSize > 1) {
        const answerLines = splitGrammarAnswerLines(rawAnswer)
        if (answerLines.length >= gapSize) {
          answerLines.slice(0, gapSize).forEach((answer, answerIndex) => {
            pushGrammarEntry(marker.questionNo + answerIndex, answer, answer)
          })
          return
        }
      }

      pushGrammarEntry(marker.questionNo, rawAnswer)
    })
  }

  return entries
}

function parseDetailedAnswerEntries(text, fallbackEntries = []) {
  const normalized = cleanDraftText(text)
  const fallbackByNo = new Map(fallbackEntries.map((entry) => [String(entry.questionNo), entry]))
  const entries = []
  const entryPattern = /(^|\n)第(\d{1,2})题[.．、:：]?\s*([\s\S]*?)(?=(?:\n第\d{1,2}题[.．、:：]?\s*)|$)/g
  let match = entryPattern.exec(normalized)

  while (match) {
    const questionNo = match[2]
    const rawText = cleanDraftText(`第${questionNo}题.${match[3]}`)
    const explanationStart = rawText.search(/解析\s*[:：]/)

    if (explanationStart < 0) {
      match = entryPattern.exec(normalized)
      continue
    }

    const fallback = fallbackByNo.get(questionNo)
    const leadingText = cleanDraftText(
      rawText
        .replace(new RegExp(`^第${questionNo}题[.．、:：]?\\s*`), '')
        .slice(0, explanationStart),
    )
    const choiceAnswer = normalizeAnswerValue(leadingText.match(/^([A-G])(?:\s|[.．、]|$)/)?.[1] || '')
    const answer = fallback?.answer || choiceAnswer
    const explanation = limitedExplanation(rawText.slice(explanationStart).replace(/^解析\s*[:：]\s*/, ''))

    entries.push({
      questionNo,
      answer,
      explanation,
      rawText,
      confidence: answer && explanation ? 0.92 : explanation ? 0.76 : 0.48,
    })
    match = entryPattern.exec(normalized)
  }

  return entries
}

function normalizeGroupTitleKey(title) {
  return cleanDraftText(title).replace(/\s+/g, ' ')
}

function limitedExplanation(text, maxLength = 1000) {
  const cleaned = cleanAnswerExplanation(text)
  if (cleaned.length <= maxLength) return cleaned
  return `${cleaned.slice(0, maxLength).trim()}...`
}

function mergeAnswerEntries(existingEntries, incomingEntries) {
  const byNo = new Map(existingEntries.map((entry) => [String(entry.questionNo), entry]))

  for (const entry of incomingEntries) {
    const key = String(entry.questionNo)
    const existing = byNo.get(key)
    if (!existing) {
      byNo.set(key, entry)
      continue
    }

    byNo.set(key, {
      ...existing,
      answer: entry.answer || existing.answer,
      explanation: entry.explanation || existing.explanation,
      rawText: entry.rawText || existing.rawText,
      confidence: Math.max(existing.confidence || 0, entry.confidence || 0),
    })
  }

  return Array.from(byNo.values()).sort((a, b) => Number(a.questionNo) - Number(b.questionNo))
}

function addAnswerEntriesForGroup(index, groupTitle, entries) {
  const normalizedTitle = normalizeGroupTitleKey(groupTitle)
  if (!normalizedTitle || entries.length === 0) return

  const existing = index.byGroupTitle.get(normalizedTitle) || []
  index.byGroupTitle.set(normalizedTitle, mergeAnswerEntries(existing, entries))
}

function answerEntriesFromDraftQuestions(questions) {
  return questions
    .filter((question) => question.answer)
    .map((question) => ({
      questionNo: question.questionNo,
      answer: question.answer || '',
      explanation: '',
      rawText: cleanDraftText(question.rawText || question.stem || ''),
      confidence: Math.max(question.confidence || 0.72, 0.74),
    }))
}

function addQuestionWithAnalysisEntries(index, file, bundleTitle) {
  const text = normalizeDraftText(file.extracted_text)
  const headings = findSectionHeadings(text)
  const itemBlocks = findItemBlocks(text)
    .map((item) => ({
      ...item,
      sectionTitle: findSectionTitle(headings, item.start),
    }))
    .filter((item) => !isListeningItem(item.sectionTitle, item.rawText))

  let readingIndex = 0
  let groupEntryCount = 0

  for (const item of itemBlocks) {
    const groupType = inferGroupType(item.sectionTitle, item.rawText, item.itemNo)
    if (!['reading', 'seven_choices', 'cloze', 'grammar_cloze'].includes(groupType)) continue

    const titleItemNo = groupType === 'reading' ? String(++readingIndex) : item.itemNo
    const group = buildDraftGroup({
      bundleTitle,
      item: {
        ...item,
        groupType,
        titleItemNo,
      },
      sectionTitle: item.sectionTitle,
    })
    const entries = answerEntriesFromDraftQuestions(group.questions)
    addAnswerEntriesForGroup(index, group.title, entries)
    groupEntryCount += entries.length
  }

  if (groupEntryCount === 0) {
    index.warnings.push(`${file.original_name} 未按题组识别出可写回的答案。`)
  }
}

function parseReadingAnalysisEntries(sectionText) {
  const text = cleanDraftText(sectionText)
  const matches = []
  const questionPattern = /(^|\n)第(\d{1,2})题[^\n]*/g
  let match = questionPattern.exec(text)

  while (match) {
    matches.push({
      start: match.index + match[1].length,
      questionNo: match[2],
    })
    match = questionPattern.exec(text)
  }

  return matches
    .map((item, index) => {
      const rawText = cleanDraftText(text.slice(item.start, matches[index + 1]?.start ?? text.length))
      const answer = normalizeAnswerValue(
        rawText.match(/答案\s*[:：]\s*([A-G])(?:\s|[.．、]|$)/)?.[1] ||
          rawText.match(/^第\d{1,2}题\s*[.．、:：]?\s*([A-G])(?:\s|[.．、]|$)/)?.[1] ||
          '',
      )
      const explanationStart = rawText.search(/解析\s*[:：]/)
      const explanation =
        explanationStart >= 0
          ? limitedExplanation(rawText.slice(explanationStart).replace(/^解析\s*[:：]\s*/, ''))
          : limitedExplanation(
              rawText
                .replace(/^第\d{1,2}题\s*[.．、:：]?\s*[A-G]\s*/, '')
                .replace(/答案\s*[:：]\s*[A-G][^\n]*/, ''),
            )

      return {
        questionNo: item.questionNo,
        answer,
        explanation,
        rawText,
        confidence: answer && explanation ? 0.94 : answer ? 0.82 : 0.48,
      }
    })
    .filter((entry) => entry.answer)
}

function addReadingAnalysisEntries(index, file, bundleTitle) {
  const text = cleanDraftText(file.extracted_text)
  const sections = []
  const sectionPattern = /(^|\n)([A-D])篇[^\n]*/g
  let match = sectionPattern.exec(text)

  while (match) {
    sections.push({
      start: match.index + match[1].length,
      letter: match[2],
    })
    match = sectionPattern.exec(text)
  }

  for (const [indexInList, section] of sections.entries()) {
    const rawSection = text.slice(section.start, sections[indexInList + 1]?.start ?? text.length)
    const entries = parseReadingAnalysisEntries(rawSection)
    addAnswerEntriesForGroup(index, `${bundleTitle} 阅读理解 ${section.letter}`, entries)
  }

  return sections.length
}

function buildStructuredAnswerEntryIndex(answerFiles, bundleTitle) {
  const answerText = answerFiles.map((file) => file.extracted_text).join('\n\n')
  const plainEntries = parseAnswerEntries(answerText)
  const compactEntries = parseCompactAnswerEntries(answerText)
  const globalEntries = mergeAnswerEntries(
    mergeAnswerEntries(plainEntries, compactEntries),
    parseDetailedAnswerEntries(answerText, mergeAnswerEntries(plainEntries, compactEntries)),
  )
  const index = {
    byGroupTitle: new Map(),
    global: globalEntries,
    warnings: [],
  }

  for (const file of answerFiles) {
    if (file.content_role === 'question_with_analysis') {
      addQuestionWithAnalysisEntries(index, file, bundleTitle)
      continue
    }

    if (file.content_role === 'answer_analysis') {
      const readingSectionCount = addReadingAnalysisEntries(index, file, bundleTitle)
      if (readingSectionCount === 0) {
        index.warnings.push(`${file.original_name} 未识别到“A篇/B篇/C篇/D篇”式阅读解析边界。`)
      }
    }
  }

  index.structuredEntryCount = Array.from(index.byGroupTitle.values()).reduce((sum, entries) => sum + entries.length, 0)
  return index
}

function canUseGlobalAnswerEntries(formalGroups) {
  const seen = new Set()
  let count = 0

  for (const group of formalGroups) {
    for (const question of group.questions) {
      const key = String(question.questionNo || '').trim()
      if (!key) return false
      if (seen.has(key)) return false
      seen.add(key)
      count += 1
    }
  }

  return count > 0
}

function getGlobalAnswerEntriesForGroup(answerIndex, formalGroup) {
  const questionNos = new Set(formalGroup.questions.map((question) => String(question.questionNo)))
  return answerIndex.global.filter((entry) => questionNos.has(String(entry.questionNo)))
}

function pickAnswerEntriesForGroup(answerIndex, formalGroups, formalGroup) {
  const entries = answerIndex.byGroupTitle.get(normalizeGroupTitleKey(formalGroup.title))
  if (entries?.length) {
    return mergeAnswerEntries(getGlobalAnswerEntriesForGroup(answerIndex, formalGroup), entries)
  }

  if (formalGroups.length === 1 && answerIndex.global.length > 0) {
    return answerIndex.global
  }

  if (canUseGlobalAnswerEntries(formalGroups) && answerIndex.global.length > 0) {
    return getGlobalAnswerEntriesForGroup(answerIndex, formalGroup)
  }

  return []
}


function mergeAnswerEntriesIntoDraftGroups(groups, answerIndex) {
  const answerableGroups = groups.filter((group) =>
    ['reading', 'seven_choices', 'cloze', 'grammar_cloze'].includes(group.groupType),
  )
  const groupsForGlobalMatching = answerableGroups.length > 0 ? answerableGroups : groups
  let matchedQuestionCount = 0

  const mergedGroups = groups.map((group) => {
    if (!['reading', 'seven_choices', 'cloze', 'grammar_cloze'].includes(group.groupType)) return group

    const entries = pickAnswerEntriesForGroup(answerIndex, groupsForGlobalMatching, group)
    const entriesByNo = new Map(entries.map((entry) => [String(entry.questionNo), entry]))
    let groupMatchedQuestionCount = 0
    const questions = group.questions.map((question) => {
      const entry = entriesByNo.get(String(question.questionNo))
      if (!entry) return question

      groupMatchedQuestionCount += 1
      matchedQuestionCount += 1
      return {
        ...question,
        answer: question.answer || entry.answer || '',
        explanation: question.explanation || '',
        confidence: Math.max(question.confidence || 0, entry.confidence || 0),
      }
    })
    const warnings = group.warnings.filter(
      (warning) =>
        !(
          group.groupType === 'grammar_cloze' &&
          warning.startsWith('语法填空存在未识别答案') &&
          questions.every((question) => question.answer)
        ),
    )

    if (entries.length > 0 && groupMatchedQuestionCount < group.questions.length) {
      warnings.push(`${group.questions.length - groupMatchedQuestionCount} 道小题尚未从解析文件匹配到答案。`)
    }

    return {
      ...group,
      warnings,
      questions,
    }
  })

  return {
    groups: mergedGroups,
    matchedQuestionCount,
  }
}

function generateAnswerAlignmentDraft(bundleId) {
  const title = getImportBundleTitle(bundleId)
  if (!title) return null

  const answerFiles = getParsedAnswerFilesForBundle(bundleId)
  const formalGroups = listFormalGroupsForBundleTitle(title)
  const warnings = []

  if (formalGroups.length === 0) {
    warnings.push('题库中还没有可对齐的正式题组，请先从拆题草稿入库题目。')
  }
  if (answerFiles.length === 0) {
    warnings.push('当前资料组没有已解析的答案解析文件，请先导入并解析“答案解析文件”。')
  }

  const answerIndex = buildStructuredAnswerEntryIndex(answerFiles, title)
  warnings.push(...answerIndex.warnings)
  if (answerFiles.length > 0 && answerIndex.structuredEntryCount === 0 && answerIndex.global.length === 0) {
    warnings.push('解析文件中未识别到可按题组写回的答案条目，请人工检查格式。')
  }
  if (
    answerFiles.length > 0 &&
    formalGroups.length > 1 &&
    answerIndex.structuredEntryCount === 0 &&
    answerIndex.global.length > 0 &&
    !canUseGlobalAnswerEntries(formalGroups)
  ) {
    warnings.push('解析文件缺少可靠题组边界，已暂停跨题组自动匹配，避免错贴答案。')
  }

  const groups = formalGroups.map((group) => {
    const entries = pickAnswerEntriesForGroup(answerIndex, formalGroups, group)
    const entriesByNo = new Map(entries.map((entry) => [String(entry.questionNo), entry]))
    const matches = group.questions.map((question) => {
      const entry = entriesByNo.get(String(question.questionNo))
      const answerDiffers = Boolean(
        entry?.answer &&
          question.answer &&
          normalizeAnswerValue(entry.answer) !== normalizeAnswerValue(question.answer),
      )
      return {
        questionId: question.id,
        questionNo: question.questionNo,
        stem: question.stem,
        currentAnswer: question.answer,
        currentExplanation: question.explanation,
        proposedAnswer: entry?.answer || '',
        proposedExplanation: '',
        rawText: entry?.rawText || '',
        confidence: entry ? entry.confidence : 0,
        answerDiffers,
        status: entry ? 'matched' : 'missing',
      }
    })
    const matchedCount = matches.filter((match) => match.status === 'matched').length
    const mismatchCount = matches.filter((match) => match.answerDiffers).length
    const groupWarnings = []
    if (matchedCount !== group.questions.length) {
      groupWarnings.push(`${group.questions.length - matchedCount} 道小题尚未匹配到答案解析。`)
    }
    if (mismatchCount > 0) {
      groupWarnings.push(`${mismatchCount} 道小题的解析答案与题库现有答案不一致，写回前需人工核对。`)
    }

    return {
      id: `answer-align-${group.id}`,
      questionGroupId: group.id,
      title: group.title,
      sourceItemNo: group.sourceItemNo,
      groupType: group.groupType,
      questionCount: group.questions.length,
      matchedCount,
      confidence: matches.length > 0 ? matchedCount / matches.length : 0,
      warnings: groupWarnings,
      matches,
    }
  })

  return {
    id: `answer-align-${bundleId}`,
    bundleId,
    title,
    generatedAt: new Date().toISOString(),
    sourceFiles: answerFiles.map((file) => ({
      id: file.id,
      originalName: file.original_name,
      contentRole: file.content_role,
      parser: file.parser,
      lineCount: file.line_count || 0,
      charCount: file.char_count || 0,
    })),
    targetGroupCount: formalGroups.length,
    matchedGroupCount: groups.filter((group) => group.matchedCount > 0).length,
    matchedQuestionCount: groups.reduce((sum, group) => sum + group.matchedCount, 0),
    warnings,
    groups,
  }
}

function applyAnswerAlignment(bundleId, input = {}) {
  const alignment = generateAnswerAlignmentDraft(bundleId)
  if (!alignment) return null

  const questionGroupId = optionalString(input.questionGroupId)
  const overwrite = Boolean(input.overwrite)
  const targetGroups = questionGroupId
    ? alignment.groups.filter((group) => group.questionGroupId === questionGroupId)
    : alignment.groups

  if (targetGroups.length === 0) {
    throw new Error('No matching question group found in answer alignment')
  }

  const db = openDatabase({ readOnly: false })
  const updateQuestion = db.prepare(
    `
    UPDATE questions
    SET answer = ?, explanation = ?, updated_at = datetime('now')
    WHERE id = ?
    `,
  )
  const result = {
    bundleId,
    questionGroupId,
    overwrite,
    targetGroupCount: targetGroups.length,
    matchedQuestionCount: 0,
    updatedQuestionCount: 0,
    updatedAnswerCount: 0,
    updatedExplanationCount: 0,
    skippedExistingCount: 0,
    missingQuestionCount: 0,
  }

  try {
    db.exec('BEGIN')

    for (const group of targetGroups) {
      for (const match of group.matches) {
        if (match.status !== 'matched') {
          result.missingQuestionCount += 1
          continue
        }

        result.matchedQuestionCount += 1
        const shouldUpdateAnswer = Boolean(match.proposedAnswer) && (overwrite || !match.currentAnswer)
        const shouldUpdateExplanation = false

        if (!shouldUpdateAnswer && !shouldUpdateExplanation) {
          result.skippedExistingCount += 1
          continue
        }

        updateQuestion.run(
          shouldUpdateAnswer ? match.proposedAnswer : match.currentAnswer,
          match.currentExplanation,
          match.questionId,
        )
        result.updatedQuestionCount += 1
        if (shouldUpdateAnswer) result.updatedAnswerCount += 1
        if (shouldUpdateExplanation) result.updatedExplanationCount += 1
      }
    }

    db.exec('COMMIT')
    return result
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

function inferImportFileType(fileName, mimeType = '') {
  const lowerName = String(fileName || '').toLowerCase()
  const lowerMime = String(mimeType || '').toLowerCase()

  if (lowerName.endsWith('.docx') || lowerMime.includes('wordprocessingml')) return 'docx'
  if (lowerName.endsWith('.pdf') || lowerMime.includes('pdf')) return 'pdf'
  return 'other'
}

function sanitizeFileName(fileName) {
  const baseName = path.basename(String(fileName || 'import-file')).replace(/[\\/:*?"<>|\x00-\x1F]/g, ' ')
  const cleanName = baseName.replace(/\s+/g, ' ').trim().slice(0, 120)
  return cleanName || 'import-file'
}

function findExistingImportBundleId(db, bundleTitle) {
  const title = optionalString(bundleTitle)
  if (!title) return ''

  const row = db
    .prepare(
      `
      SELECT bundle_id
      FROM import_files
      WHERE bundle_title = ? AND bundle_id <> ''
      ORDER BY created_at ASC, id ASC
      LIMIT 1
      `,
    )
    .get(title)

  return row?.bundle_id || ''
}

function findExistingImportFileForBatchItem(input) {
  const db = openDatabase()

  try {
    const row = db
      .prepare(
        `
        SELECT
          id,
          original_name,
          stored_path,
          file_type,
          content_role,
          bundle_id,
          bundle_title,
          status,
          source_id,
          note,
          created_at
        FROM import_files
        WHERE original_name = ?
          AND content_role = ?
          AND bundle_title = ?
        ORDER BY
          CASE status WHEN 'parsed' THEN 0 ELSE 1 END,
          created_at ASC,
          id ASC
        LIMIT 1
        `,
      )
      .get(input.fileName, input.contentRole, input.bundleTitle)

    return row ? rowToImportFile(row) : null
  } finally {
    db.close()
  }
}

function createImportFile(input) {
  const originalName = sanitizeFileName(requiredString(input.fileName, 'fileName'))
  const fileType = inferImportFileType(originalName, input.mimeType)
  const contentRole = requiredEnum(
    input.contentRole || 'question',
    ['question', 'answer_analysis', 'question_with_analysis', 'other'],
    'contentRole',
  )
  const dataBase64 = requiredString(input.dataBase64, 'dataBase64')
  const bundleTitle = optionalString(input.bundleTitle) || originalName.replace(/\.[^.]+$/, '')
  const requestedBundleId = optionalString(input.bundleId)

  if (!['docx', 'pdf'].includes(fileType)) {
    throw new Error('Only DOCX and PDF files are supported for now')
  }

  const body = Buffer.from(dataBase64, 'base64')
  if (body.length === 0) {
    throw new Error('file content is empty')
  }
  if (body.length > 25_000_000) {
    throw new Error('file is too large; current limit is 25MB')
  }

  mkdirSync(importDir, { recursive: true })
  const fileId = `import-${randomUUID()}`
  const safeStoredName = `${timestampPrefix()}-${fileId}-${originalName}`
  const outputPath = path.join(importDir, safeStoredName)
  const storedPath = path.relative(rootDir, outputPath)
  writeFileSync(outputPath, body)

  const db = openDatabase({ readOnly: false })

  try {
    const bundleId = requestedBundleId || findExistingImportBundleId(db, bundleTitle) || `bundle-${randomUUID()}`

    db.prepare(
      `
      INSERT INTO import_files (id, original_name, stored_path, file_type, content_role, bundle_id, bundle_title, status, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'imported', ?)
      `,
    ).run(fileId, originalName, storedPath, fileType, contentRole, bundleId, bundleTitle, optionalString(input.note))

    return rowToImportFile(
      db.prepare(
        `
        SELECT
          id,
          original_name,
          stored_path,
          file_type,
          content_role,
          bundle_id,
          bundle_title,
          status,
          source_id,
          note,
          created_at
        FROM import_files
        WHERE id = ?
        `,
      ).get(fileId),
    )
  } finally {
    db.close()
  }
}

function createImportFileFromLocalPath(input) {
  const sourcePath = requiredString(input.filePath, 'filePath')
  const originalName = sanitizeFileName(optionalString(input.fileName) || path.basename(sourcePath))
  const fileType = inferImportFileType(originalName)
  const contentRole = requiredEnum(
    input.contentRole || 'question_with_analysis',
    ['question', 'answer_analysis', 'question_with_analysis', 'other'],
    'contentRole',
  )
  const bundleTitle = optionalString(input.bundleTitle) || originalName.replace(/\.[^.]+$/, '')
  const requestedBundleId = optionalString(input.bundleId)

  if (!['docx', 'pdf'].includes(fileType)) {
    throw new Error('Only DOCX and PDF files are supported for batch import')
  }
  if (!existsSync(sourcePath)) {
    throw new Error(`source file not found: ${sourcePath}`)
  }

  const stats = statSync(sourcePath)
  if (!stats.isFile()) {
    throw new Error(`source path is not a file: ${sourcePath}`)
  }
  if (stats.size === 0) {
    throw new Error('file content is empty')
  }
  if (stats.size > 25_000_000) {
    throw new Error('file is too large; current limit is 25MB')
  }

  mkdirSync(importDir, { recursive: true })
  const fileId = `import-${randomUUID()}`
  const safeStoredName = `${timestampPrefix()}-${fileId}-${originalName}`
  const outputPath = path.join(importDir, safeStoredName)
  const storedPath = path.relative(rootDir, outputPath)
  copyFileSync(sourcePath, outputPath)

  const db = openDatabase({ readOnly: false })

  try {
    const bundleId = requestedBundleId || findExistingImportBundleId(db, bundleTitle) || `bundle-${randomUUID()}`

    db.prepare(
      `
      INSERT INTO import_files (id, original_name, stored_path, file_type, content_role, bundle_id, bundle_title, status, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'imported', ?)
      `,
    ).run(
      fileId,
      originalName,
      storedPath,
      fileType,
      contentRole,
      bundleId,
      bundleTitle,
      optionalString(input.note) || `批量导入来源：${sourcePath}`,
    )

    return rowToImportFile(
      db.prepare(
        `
        SELECT
          id,
          original_name,
          stored_path,
          file_type,
          content_role,
          bundle_id,
          bundle_title,
          status,
          source_id,
          note,
          created_at
        FROM import_files
        WHERE id = ?
        `,
      ).get(fileId),
    )
  } finally {
    db.close()
  }
}

function updateImportBatchItemStatus(itemId, fields) {
  const db = openDatabase({ readOnly: false })

  try {
    db.prepare(
      `
      UPDATE import_batch_items
      SET
        status = ?,
        import_file_id = ?,
        bundle_id = ?,
        error_message = ?,
        updated_at = datetime('now')
      WHERE id = ?
      `,
    ).run(fields.status, fields.importFileId || '', fields.bundleId || '', fields.errorMessage || '', itemId)
  } finally {
    db.close()
  }
}

function runImportBatch(batchId, input = {}) {
  const parseDocx = input.parseDocx === undefined ? true : Boolean(input.parseDocx)
  const rawLimit = input.limit
  const importLimit =
    rawLimit === undefined || rawLimit === null || rawLimit === 'all' || rawLimit === ''
      ? 0
      : Number(rawLimit)

  if (importLimit < 0 || !Number.isFinite(importLimit) || !Number.isInteger(importLimit)) {
    throw new Error('limit must be a positive integer or omitted')
  }

  const db = openDatabase({ readOnly: false })
  const batch = getImportBatch(db, batchId)

  if (!batch) {
    db.close()
    return null
  }

  const allQueuedItems = batch.items.filter((item) => item.status === 'queued')
  const queuedItems = importLimit > 0 ? allQueuedItems.slice(0, importLimit) : allQueuedItems
  db.prepare("UPDATE import_batches SET status = 'importing', error_message = '', updated_at = datetime('now') WHERE id = ?").run(batchId)
  db.close()

  let imported = 0
  let parsed = 0
  let failed = 0

  for (const item of queuedItems) {
    try {
      const existingImportFile = findExistingImportFileForBatchItem(item)

      if (existingImportFile) {
        if (parseDocx && item.fileType === 'docx' && existingImportFile.status !== 'parsed') {
          parseImportFile(existingImportFile.id)
          parsed += 1
          updateImportBatchItemStatus(item.id, {
            status: 'parsed',
            importFileId: existingImportFile.id,
            bundleId: existingImportFile.bundleId,
          })
        } else {
          updateImportBatchItemStatus(item.id, {
            status: 'skipped',
            importFileId: existingImportFile.id,
            bundleId: existingImportFile.bundleId,
            errorMessage: '已存在同名资料，跳过重复导入。',
          })
        }
        continue
      }

      const importFile = createImportFileFromLocalPath({
        filePath: item.filePath,
        fileName: item.fileName,
        contentRole: item.contentRole,
        bundleTitle: item.bundleTitle,
        bundleId: item.bundleId,
        note: `批量导入 ${batch.title}：${item.filePath}`,
      })
      imported += 1
      updateImportBatchItemStatus(item.id, {
        status: 'imported',
        importFileId: importFile.id,
        bundleId: importFile.bundleId,
      })

      if (parseDocx && item.fileType === 'docx') {
        parseImportFile(importFile.id)
        parsed += 1
        updateImportBatchItemStatus(item.id, {
          status: 'parsed',
          importFileId: importFile.id,
          bundleId: importFile.bundleId,
        })
      }
    } catch (error) {
      failed += 1
      updateImportBatchItemStatus(item.id, {
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const finalDb = openDatabase({ readOnly: false })

  try {
    const finalStatus = failed > 0 ? 'partial' : ''
    updateImportBatchStats(finalDb, batchId, finalStatus)
    return getImportBatch(finalDb, batchId)
  } finally {
    finalDb.close()
  }
}

function decodeXmlEntities(value) {
  return String(value || '')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&')
}

function extractDocxTextWithOoxml(filePath) {
  const documentXml = execFileSync('unzip', ['-p', filePath, 'word/document.xml'], { encoding: 'utf8' })

  let normalStyleIndent = false
  try {
    const stylesXml = execFileSync('unzip', ['-p', filePath, 'word/styles.xml'], { encoding: 'utf8' })
    const normalStyleMatch = stylesXml.match(/<w:style[^>]*w:styleId="1"[^>]*>[\s\S]*?<w:ind[^>]*\/>/)
    if (normalStyleMatch) {
      normalStyleIndent = /w:firstLine(?:Chars)?="[1-9]/.test(normalStyleMatch[0])
    }
  } catch {
    // styles.xml may not exist.
  }

  const paragraphs = [...documentXml.matchAll(/<w:p[\s\S]*?<\/w:p>/g)]
    .map(([paragraphXml]) => {
      const textContent =
        paragraphXml
          .replace(/<w:(?:tab|cr|br)\b[^>]*\/>/g, '\n')
          .match(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)
          ?.map((textNode) => decodeXmlEntities(textNode.replace(/^<w:t\b[^>]*>/, '').replace(/<\/w:t>$/, '')))
          .join('') || ''
      const trimmed = textContent.replace(/\u00a0/g, ' ').trim()
      if (!trimmed) return ''

      const pPrMatch = paragraphXml.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)
      let shouldIndent = false
      if (pPrMatch) {
        const indMatch = pPrMatch[0].match(/<w:ind[^>]*>/)
        if (indMatch) {
          const firstLineMatch = indMatch[0].match(/w:firstLine(?:Chars)?="(\d+)"/)
          if (firstLineMatch && Number(firstLineMatch[1]) > 0) {
            shouldIndent = true
          }
        } else if (normalStyleIndent) {
          const styleRef = pPrMatch[0].match(/<w:pStyle[^>]*w:val="(\d+)"/)
          if (!styleRef || styleRef[1] === '1') {
            shouldIndent = true
          }
        }
      } else if (normalStyleIndent) {
        shouldIndent = true
      }

      if (shouldIndent && trimmed.length > 15 && !/^[A-H][.．、]|^\d{1,2}[.．、]|^第[一二三四五六七八九十]|^[一二三四五六七八九十][、．]/.test(trimmed)) {
        return `\u3000\u3000${trimmed}`
      }

      return trimmed
    })
    .filter(Boolean)

  return paragraphs.join('\n')
}

function extractDocxText(filePath) {
  const ooxmlText = extractDocxTextWithOoxml(filePath)
  if (ooxmlText) {
    return {
      parser: 'ooxml-document-xml',
      text: ooxmlText,
    }
  }

  try {
    const text = execFileSync('pandoc', [filePath, '--to=plain', '--wrap=none'], {
      encoding: 'utf8',
      maxBuffer: 20_000_000,
    })
      .replace(/\r\n?/g, '\n')
      .trim()

    if (text) {
      return {
        parser: 'pandoc-docx-plain',
        text,
      }
    }
  } catch {
    // Fall through.
  }

  return {
    parser: 'pandoc-docx-plain',
    text: '',
  }
}

function countTextLines(text) {
  return String(text || '').split('\n').filter((line) => line.trim()).length
}

function upsertImportFileParse(db, importFileId, parse) {
  const existing = db.prepare('SELECT id FROM import_file_texts WHERE import_file_id = ?').get(importFileId)
  const parseId = existing?.id || `import-text-${randomUUID()}`

  db.prepare(
    `
    INSERT INTO import_file_texts (
      id,
      import_file_id,
      parser,
      extracted_text,
      line_count,
      char_count,
      status,
      error_message,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(import_file_id) DO UPDATE SET
      parser = excluded.parser,
      extracted_text = excluded.extracted_text,
      line_count = excluded.line_count,
      char_count = excluded.char_count,
      status = excluded.status,
      error_message = excluded.error_message,
      updated_at = datetime('now')
    `,
  ).run(
    parseId,
    importFileId,
    parse.parser,
    parse.extractedText,
    parse.lineCount,
    parse.charCount,
    parse.status,
    parse.errorMessage,
  )

  return db.prepare('SELECT * FROM import_file_texts WHERE import_file_id = ?').get(importFileId)
}

function getImportFileParse(id) {
  const db = openDatabase()

  try {
    return rowToImportFileParse(db.prepare('SELECT * FROM import_file_texts WHERE import_file_id = ?').get(id))
  } finally {
    db.close()
  }
}

function parseImportFile(id) {
  const db = openDatabase({ readOnly: false })

  try {
    const importFile = db.prepare('SELECT * FROM import_files WHERE id = ?').get(id)
    if (!importFile) return null

    const filePath = path.join(rootDir, importFile.stored_path)
    if (!existsSync(filePath)) {
      throw new Error(`Imported file missing at ${importFile.stored_path}`)
    }
    if (importFile.file_type !== 'docx') {
      throw new Error('Only DOCX text extraction is supported in this step')
    }

    const extracted = extractDocxText(filePath)
    const text = extracted.text.trim()
    const parse = {
      parser: extracted.parser,
      extractedText: text,
      lineCount: countTextLines(text),
      charCount: text.length,
      status: 'succeeded',
      errorMessage: '',
    }

    db.exec('BEGIN')
    const row = upsertImportFileParse(db, id, parse)
    db.prepare("UPDATE import_files SET status = 'parsed' WHERE id = ?").run(id)
    db.exec('COMMIT')
    return rowToImportFileParse(row)
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

function deleteImportFile(id) {
  const db = openDatabase({ readOnly: false })

  try {
    const importFile = db.prepare('SELECT * FROM import_files WHERE id = ?').get(id)
    if (!importFile) return null

    db.exec('BEGIN')
    db.prepare('DELETE FROM import_file_texts WHERE import_file_id = ?').run(id)
    db.prepare('DELETE FROM import_batch_items WHERE import_file_id = ?').run(id)
    db.prepare('DELETE FROM import_files WHERE id = ?').run(id)
    db.exec('COMMIT')

    const filePath = path.join(rootDir, importFile.stored_path)
    try {
      if (existsSync(filePath)) unlinkSync(filePath)
    } catch {
      // File may already be gone.
    }

    return { id }
  } catch (error) {
    try { db.exec('ROLLBACK') } catch { /* ignore */ }
    throw error
  } finally {
    db.close()
  }
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

function findExportFile(title, versionType, extension = 'docx') {
  const fileName = `${title}-${versionType === 'student' ? '学生版' : '教师版'}.${extension}`
  const verifiedPath = path.join(exportDir, 'verified', fileName)

  if (existsSync(verifiedPath)) {
    return {
      exists: true,
      fileName,
      outputPath: verifiedPath,
      verified: true,
    }
  }

  if (!existsSync(exportDir)) {
    return {
      exists: false,
      fileName,
      outputPath: '',
      verified: false,
    }
  }

  const candidates = readdirSync(exportDir)
    .filter((entry) => entry.endsWith(fileName))
    .map((entry) => {
      const outputPath = path.join(exportDir, entry)
      return {
        entry,
        outputPath,
        mtimeMs: statSync(outputPath).mtimeMs,
      }
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs)

  const latest = candidates[0]

  return {
    exists: Boolean(latest),
    fileName,
    outputPath: latest?.outputPath || '',
    verified: false,
  }
}

function inferPaperTitleFromQuestionGroupTitle(title) {
  const section = objectivePaperSections.find((item) => String(title || '').endsWith(` ${item.title}`))
  if (!section) return ''
  return String(title).slice(0, -section.title.length).trim()
}

function listObjectiveBankRows(db, paperTitle) {
  const expectedTitles = objectivePaperSections.map((section) => `${paperTitle} ${section.title}`)
  const placeholders = expectedTitles.map(() => '?').join(', ')

  if (!placeholders) return []

  return db
    .prepare(
      `
      SELECT
        qg.id,
        qg.title,
        qg.group_type,
        qg.default_score,
        q.id AS question_id,
        q.answer,
        COUNT(o.id) AS option_count
      FROM question_groups qg
      LEFT JOIN questions q ON q.group_id = qg.id
      LEFT JOIN options o ON o.question_id = q.id
      WHERE qg.title IN (${placeholders})
      GROUP BY qg.id, qg.title, qg.group_type, qg.default_score, q.id, q.answer
      ORDER BY qg.display_order, q.display_order
      `,
    )
    .all(...expectedTitles)
}

function buildObjectiveBankStatus(db, paperTitle) {
  const rows = listObjectiveBankRows(db, paperTitle)
  const groups = new Map()

  rows.forEach((row) => {
    if (!row.id) return
    if (!groups.has(row.id)) {
      groups.set(row.id, {
        id: row.id,
        title: row.title,
        groupType: row.group_type,
        defaultScore: row.default_score,
        questionCount: 0,
        missingAnswerCount: 0,
        missingOptionQuestionCount: 0,
      })
    }

    const group = groups.get(row.id)
    if (!row.question_id) return

    group.questionCount += 1
    if (!String(row.answer || '').trim()) group.missingAnswerCount += 1
    if (row.group_type !== 'grammar_cloze' && Number(row.option_count || 0) === 0) {
      group.missingOptionQuestionCount += 1
    }
  })

  const groupList = Array.from(groups.values())
  const completedSections = objectivePaperSections
    .filter((section) => groupsBySectionTitle(groupList).has(`${paperTitle} ${section.title}`))
    .map((section) => section.title)
  const missingSections = objectivePaperSections
    .filter((section) => !completedSections.includes(section.title))
    .map((section) => section.title)

  return {
    objectiveGroupCount: groupList.length,
    expectedObjectiveGroupCount: objectivePaperSections.length,
    objectiveQuestionCount: groupList.reduce((sum, group) => sum + group.questionCount, 0),
    missingAnswerCount: groupList.reduce((sum, group) => sum + group.missingAnswerCount, 0),
    missingOptionGroupCount: groupList.filter((group) => group.missingOptionQuestionCount > 0).length,
    completedSections,
    missingSections,
    groups: groupList,
  }
}

function groupsBySectionTitle(groups) {
  return new Set(groups.map((group) => group.title))
}

function workflowStatusFor({ importBundle, bank, paperSet, exports }) {
  const hasImport = Boolean(importBundle?.fileCount)
  const allImportsParsed = hasImport && importBundle.parsedCount >= importBundle.fileCount
  const bankComplete =
    bank.objectiveGroupCount >= bank.expectedObjectiveGroupCount &&
    bank.missingAnswerCount === 0 &&
    bank.missingOptionGroupCount === 0
  const exported = exports.studentDocx.exists && exports.teacherDocx.exists

  if (paperSet && exported) {
    return {
      status: 'closed_loop',
      label: '已闭环',
      nextAction: '可直接用于组题、讲评或继续渲染抽检。',
    }
  }

  if (paperSet) {
    return {
      status: 'ready_to_export',
      label: '待导出',
      nextAction: '已保存整卷题集，下一步导出学生版和教师版。',
    }
  }

  if (bankComplete) {
    return {
      status: 'ready_to_paper',
      label: '待组卷',
      nextAction: '客观题已完整入库，下一步生成整卷题集。',
    }
  }

  if (bank.objectiveGroupCount > 0) {
    return {
      status: 'needs_review',
      label: '入库未齐',
      nextAction: '已有部分题组入库，需补齐缺失板块或核对答案选项。',
    }
  }

  if (allImportsParsed) {
    return {
      status: 'ready_to_commit',
      label: '可拆题',
      nextAction: '资料已解析，下一步生成拆题草稿并做教师质检。',
    }
  }

  if (hasImport) {
    return {
      status: 'needs_parse',
      label: '待解析',
      nextAction: '已有原件，下一步解析 DOCX/PDF 后生成拆题草稿。',
    }
  }

  return {
    status: 'not_started',
    label: '未开始',
    nextAction: '先导入试卷原件。',
  }
}

function listPaperWorkflowStatuses() {
  const db = openDatabase()

  try {
    const importBundles = listImportBundles()
    const titles = new Set(importBundles.map((bundle) => bundle.title).filter(Boolean))

    db.prepare('SELECT title FROM question_groups')
      .all()
      .forEach((row) => {
        const paperTitle = inferPaperTitleFromQuestionGroupTitle(row.title)
        if (paperTitle) titles.add(paperTitle)
      })

    db.prepare('SELECT title FROM paper_sets')
      .all()
      .forEach((row) => {
        if (!String(row.title || '').match(/\s*客观题$/)) return
        const paperTitle = String(row.title || '').replace(/\s*客观题$/, '').trim()
        if (paperTitle) titles.add(paperTitle)
      })

    const paperSets = selectPaperSetSummaries(db)
    const importBundleByTitle = new Map(importBundles.map((bundle) => [bundle.title, bundle]))
    const paperSetByTitle = new Map(paperSets.map((paperSet) => [paperSet.title, paperSet]))

    return Array.from(titles)
      .sort((a, b) => a.localeCompare(b, 'zh-CN'))
      .map((title) => {
        const importBundle = importBundleByTitle.get(title) || null
        const bank = buildObjectiveBankStatus(db, title)
        const objectivePaperTitle = `${title} 客观题`
        const paperSet = paperSetByTitle.get(objectivePaperTitle) || null
        const exports = {
          studentDocx: findExportFile(objectivePaperTitle, 'student', 'docx'),
          teacherDocx: findExportFile(objectivePaperTitle, 'teacher', 'docx'),
        }
        const workflow = workflowStatusFor({ importBundle, bank, paperSet, exports })

        return {
          id: importBundle?.id || paperSet?.id || `paper-workflow-${title}`,
          title,
          objectivePaperTitle,
          bundleId: importBundle?.id || '',
          updatedAt: importBundle?.latestCreatedAt || paperSet?.updatedAt || paperSet?.createdAt || '',
          status: workflow.status,
          statusLabel: workflow.label,
          nextAction: workflow.nextAction,
          importFiles: importBundle
            ? {
                fileCount: importBundle.fileCount,
                parsedCount: importBundle.parsedCount,
                failedParseCount: importBundle.failedParseCount,
                readiness: importBundle.readiness,
                roleCounts: importBundle.roleCounts,
                qualityWarnings: importBundle.qualityWarnings,
              }
            : {
                fileCount: 0,
                parsedCount: 0,
                failedParseCount: 0,
                readiness: 'reference_only',
                roleCounts: {
                  question: 0,
                  answerAnalysis: 0,
                  questionWithAnalysis: 0,
                  other: 0,
                },
                qualityWarnings: [],
              },
          bank,
          paperSet,
          exports,
        }
      })
      .sort((a, b) => {
        const rank = {
          needs_review: 0,
          ready_to_commit: 1,
          ready_to_paper: 2,
          ready_to_export: 3,
          needs_parse: 4,
          not_started: 5,
          closed_loop: 6,
        }
        return (rank[a.status] ?? 9) - (rank[b.status] ?? 9) || String(b.updatedAt).localeCompare(String(a.updatedAt))
      })
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

function escapeXml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function run(text, options = {}) {
  const runProperties = [
    options.bold ? '<w:b/>' : '',
    options.italic ? '<w:i/>' : '',
    options.size ? `<w:sz w:val="${options.size}"/>` : '',
    options.color ? `<w:color w:val="${options.color}"/>` : '',
  ].join('')
  const textParts = String(text ?? '').split('\n')
  const textXml = textParts
    .map((part, index) => `${index > 0 ? '<w:br/>' : ''}<w:t xml:space="preserve">${escapeXml(part)}</w:t>`)
    .join('')

  return `<w:r>${runProperties ? `<w:rPr>${runProperties}</w:rPr>` : ''}${textXml}</w:r>`
}

function paragraph(content = '', options = {}) {
  const children = Array.isArray(content) ? content.join('') : run(content)
  const properties = [
    options.align ? `<w:jc w:val="${options.align}"/>` : '',
    options.before || options.after
      ? `<w:spacing${options.before ? ` w:before="${options.before}"` : ''}${options.after ? ` w:after="${options.after}"` : ''}/>`
      : '',
    options.indentLeft ? `<w:ind w:left="${options.indentLeft}"/>` : '',
    options.keepNext ? '<w:keepNext/>' : '',
    options.shading ? `<w:shd w:val="clear" w:color="auto" w:fill="${options.shading}"/>` : '',
  ].join('')

  return `<w:p>${properties ? `<w:pPr>${properties}</w:pPr>` : ''}${children}</w:p>`
}

function docxSimpleTable(rows, { colWidths = [], headerShading = 'E5E7EB', bodyShading = 'F9FAFB' } = {}) {
  if (!rows.length) return ''
  const colCount = Math.max(...rows.map((r) => r.length))
  const widths = colWidths.length === colCount ? colWidths : Array(colCount).fill(Math.floor(9000 / colCount))

  const tablePr = [
    '<w:tblW w:w="5000" w:type="pct"/>',
    '<w:tblBorders>',
    '<w:top w:val="single" w:sz="4" w:space="0" w:color="D1D5DB"/>',
    '<w:left w:val="single" w:sz="4" w:space="0" w:color="D1D5DB"/>',
    '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="D1D5DB"/>',
    '<w:right w:val="single" w:sz="4" w:space="0" w:color="D1D5DB"/>',
    '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="D1D5DB"/>',
    '<w:insideV w:val="single" w:sz="4" w:space="0" w:color="D1D5DB"/>',
    '</w:tblBorders>',
  ].join('')

  const rowXml = rows.map((cells, rowIndex) => {
    const shading = rowIndex === 0 ? headerShading : bodyShading
    const cellsXml = cells.map((cell, colIndex) => {
      const width = widths[colIndex] || 2400
      const content = typeof cell === 'string'
        ? paragraph(cell, { after: 40 })
        : Array.isArray(cell)
          ? paragraph(cell, { after: 40 })
          : `<w:p>${cell}</w:p>`
      return `<w:tc>
        <w:tcPr><w:tcW w:w="${width}" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="${shading}"/></w:tcPr>
        ${content}
      </w:tc>`
    }).join('')
    return `<w:tr>${cellsXml}</w:tr>`
  }).join('')

  return `<w:tbl><w:tblPr>${tablePr}</w:tblPr>${rowXml}</w:tbl>`
}

function normalizeDocxLines(text) {
  const value = String(text || '').replace(/\r\n?/g, '\n').trim()
  if (!value) return []
  return value.split('\n').map((line) => stripTrailingSpaces(line)).filter(Boolean)
}

function stripTrailingSpaces(line) {
  return line.replace(/[^\S\u3000]+$/, '').replace(/^[^\S\u3000]+/, '')
}

function docxQuestionStem(detail, question) {
  const questionNo = String(question.questionNo || '').trim()

  if (detail.groupType === 'seven_choices' || detail.groupType === 'grammar_cloze') {
    return questionNo ? `第 ${questionNo} 空` : '空'
  }

  if (detail.groupType === 'cloze') {
    return question.stem || (questionNo ? `第 ${questionNo} 空` : '完形填空')
  }

  return question.stem || (questionNo ? `第 ${questionNo} 题` : '题目')
}

function uniqueDocxOptions(questions) {
  const seen = new Set()
  const options = []

  questions.forEach((question) => {
    question.options.forEach((option) => {
      const label = String(option.label || '').trim()
      const content = String(option.content || '').trim()
      const key = `${label}::${content}`

      if ((!label && !content) || seen.has(key)) return
      seen.add(key)
      options.push(option)
    })
  })

  return options.sort((a, b) => {
    const orderDelta = Number(a.displayOrder || 0) - Number(b.displayOrder || 0)
    if (orderDelta !== 0) return orderDelta
    return String(a.label || '').localeCompare(String(b.label || ''), 'en', { numeric: true })
  })
}

function findSavedReadingParseQuestion(detail, question) {
  const questionNo = String(question.questionNo || '').trim()
  if (!questionNo) return null

  const savedQuestions = Array.isArray(detail.readingParseResult?.questions)
    ? detail.readingParseResult.questions
    : []

  return savedQuestions.find((item) => String(item.questionNo || '').trim() === questionNo) || null
}

function findSavedReadingVerifyQuestion(detail, question) {
  const questionNo = String(question.questionNo || '').trim()
  if (!questionNo) return null

  const savedResults = Array.isArray(detail.readingVerifyResult?.results)
    ? detail.readingVerifyResult.results
    : []

  return savedResults.find((item) => String(item.questionNo || '').trim() === questionNo) || null
}

function findSavedGrammarParseQuestion(detail, question) {
  const questionNo = String(question.questionNo || '').trim()
  if (!questionNo) return null

  const savedQuestions = Array.isArray(detail.grammarParseResult?.questions)
    ? detail.grammarParseResult.questions
    : []

  return savedQuestions.find((item) => String(item.questionNo || '').trim() === questionNo) || null
}

function findSavedClozeParseQuestion(detail, question) {
  const questionNo = String(question.questionNo || '').trim()
  if (!questionNo) return null

  const savedQuestions = Array.isArray(detail.clozeParseResult?.questions)
    ? detail.clozeParseResult.questions
    : []

  return savedQuestions.find((item) => String(item.questionNo || '').trim() === questionNo) || null
}

function findSavedSevenChoicesParseQuestion(detail, question) {
  const questionNo = String(question.questionNo || '').trim()
  if (!questionNo) return null

  const savedQuestions = Array.isArray(detail.sevenChoicesParseResult?.questions)
    ? detail.sevenChoicesParseResult.questions
    : []

  return savedQuestions.find((item) => String(item.questionNo || '').trim() === questionNo) || null
}

const docxVerifyVerdictLabels = {
  correct: '录入答案正确',
  answer_wrong: '录入答案错误',
  explanation_wrong: '解析需复核',
  both_wrong: '答案与解析均需复核',
  uncertain: '状态不确定',
  skipped: '已跳过',
}

function docxVerifyStatusLabel(verifyItem) {
  if (!verifyItem) return '状态未保存'
  return docxVerifyVerdictLabels[verifyItem.verdict] || '状态不确定'
}

function docxQuestionExplanation(detail, question) {
  const savedAiParse = detail.groupType === 'reading'
    ? findSavedReadingParseQuestion(detail, question)
    : detail.groupType === 'cloze'
      ? findSavedClozeParseQuestion(detail, question)
    : detail.groupType === 'seven_choices'
      ? findSavedSevenChoicesParseQuestion(detail, question)
    : detail.groupType === 'grammar_cloze'
      ? findSavedGrammarParseQuestion(detail, question)
    : null
  const savedAiExplanation = optionalString(savedAiParse?.explanation || savedAiParse?.analysis)
  if (savedAiExplanation) return savedAiExplanation

  return optionalString(question.explanation) || '待补'
}

function pushDocxLabelParagraph(body, label, text, options = {}) {
  const value = optionalString(text)
  if (!value) return

  body.push(
    paragraph(
      [
        run(`${label}：`, { bold: true }),
        run(value),
      ],
      options,
    ),
  )
}

function pushDocxReadingAnalysis(body, detail, question) {
  const savedAiParse = findSavedReadingParseQuestion(detail, question)
  if (!savedAiParse) {
    body.push(paragraph(`解析：${docxQuestionExplanation(detail, question)}`, { after: 120, shading: 'EEF2F4' }))
    return
  }

  const verifyItem = findSavedReadingVerifyQuestion(detail, question)
  const isCorrect = verifyItem?.verdict === 'correct'
  const statusColor = isCorrect ? '065F46' : '92400E'
  const statusBg = isCorrect ? 'D1FAE5' : 'FEF3C7'
  const statusIcon = isCorrect ? '\u2713' : '\u26A0'
  const statusText = isCorrect ? '答案确认正确' : docxVerifyStatusLabel(verifyItem)

  body.push(
    paragraph(
      [
        run(`${statusIcon} `, { bold: true, size: 22, color: statusColor }),
        run(statusText, { bold: true, size: 21, color: statusColor }),
      ],
      { before: 20, after: 80, shading: statusBg, indentLeft: 120 },
    ),
  )

  pushDocxLabelParagraph(body, '题目翻译', savedAiParse.questionTranslation, { after: 50, shading: 'F8FAFC' })
  pushDocxLabelParagraph(body, '题型策略', savedAiParse.strategy, { after: 50, shading: 'F8FAFC' })

  const locationText = [
    optionalString(savedAiParse.locationSentence),
    optionalString(savedAiParse.locationSentenceTranslation),
  ].filter(Boolean).join('\n')
  pushDocxLabelParagraph(body, '定位句', locationText, { after: 50, shading: 'F8FAFC' })
  pushDocxLabelParagraph(body, '答案句', savedAiParse.answerSentence, { after: 50, shading: 'F8FAFC' })
  pushDocxLabelParagraph(body, 'AI 解析', savedAiParse.explanation || '待补', { after: 70, shading: 'F8FAFC' })

  const synonymMappings = Array.isArray(savedAiParse.synonymMappings) ? savedAiParse.synonymMappings : []
  if (synonymMappings.length > 0) {
    body.push(paragraph([run('同义替换', { bold: true, size: 21, color: '1D4ED8' })], { before: 60, after: 50, shading: 'DBEAFE', keepNext: true }))
    const tableRows = [
      [[run('原文表达', { bold: true, size: 19 })], [run('同义替换', { bold: true, size: 19 })]],
      ...synonymMappings.map((m) => [optionalString(m.text), optionalString(m.replacement)]),
    ]
    body.push(docxSimpleTable(tableRows, { colWidths: [4500, 4500] }))
    body.push(paragraph('', { after: 40 }))
  }

  const distractorAnalysis = Array.isArray(savedAiParse.distractorAnalysis) ? savedAiParse.distractorAnalysis : []
  if (distractorAnalysis.length > 0) {
    body.push(paragraph([run('选项分析', { bold: true, size: 21 })], { before: 60, after: 50, keepNext: true }))
    distractorAnalysis.forEach((item) => {
      const option = optionalString(item.option)
      const type = optionalString(item.type)
      const reason = optionalString(item.reason)
      const label = [option, type ? `（${readingDistractorTypeLabel(type)}）` : ''].filter(Boolean).join(' ')
      body.push(
        paragraph(
          [
            run(`${label || '\u00A0'}  `, { bold: true, size: 20, color: type === '0' ? '047857' : 'B91C1C' }),
            run(reason || type || '待补'),
          ],
          { after: 35, indentLeft: 240, shading: type === '0' ? 'ECFDF5' : 'FFF7ED' },
        ),
      )
    })
  }

  pushDocxLabelParagraph(body, '语言特征', savedAiParse.languageFeatures, { before: 40, after: 120, shading: 'F8FAFC' })
}

function pushDocxGrammarAnalysis(body, detail, question) {
  const savedAiParse = findSavedGrammarParseQuestion(detail, question)
  if (!savedAiParse) {
    body.push(paragraph(`解析：${docxQuestionExplanation(detail, question)}`, { after: 120, shading: 'EEF2F4' }))
    return
  }

  pushDocxLabelParagraph(body, 'AI 答案', savedAiParse.answer, { after: 50, shading: 'F8FAFC' })
  pushDocxLabelParagraph(body, '提示词意思', savedAiParse.hintMeaning, { after: 50, shading: 'F8FAFC' })
  pushDocxLabelParagraph(body, 'AI 解析', savedAiParse.analysis || '待补', { after: 70, shading: 'F8FAFC' })
  pushDocxLabelParagraph(body, '挖空句翻译', savedAiParse.sentenceTranslation, { after: 120, shading: 'F8FAFC' })
}

function pushDocxClozeAnalysis(body, detail, question) {
  const savedAiParse = findSavedClozeParseQuestion(detail, question)
  if (!savedAiParse) {
    body.push(paragraph(`解析：${docxQuestionExplanation(detail, question)}`, { after: 120, shading: 'EEF2F4' }))
    return
  }

  const answerText = [
    optionalString(savedAiParse.answer),
    optionalString(savedAiParse.answerText),
    optionalString(savedAiParse.answerMeaning) ? `（${optionalString(savedAiParse.answerMeaning)}）` : '',
  ].filter(Boolean).join(' · ')
  pushDocxLabelParagraph(body, 'AI 答案', answerText || savedAiParse.answer, { after: 50, shading: 'F8FAFC' })
  pushDocxLabelParagraph(body, 'AI 解析', savedAiParse.analysis || '待补', { after: 70, shading: 'F8FAFC' })

  const distractorAnalysis = Array.isArray(savedAiParse.distractorAnalysis) ? savedAiParse.distractorAnalysis : []
  if (distractorAnalysis.length > 0) {
    body.push(paragraph([run('干扰项分析', { bold: true, size: 21 })], { before: 60, after: 50, keepNext: true }))
    distractorAnalysis.forEach((item) => {
      const option = optionalString(item.option)
      const text = optionalString(item.text)
      const reason = optionalString(item.reason)
      body.push(
        paragraph(
          [
            run(`${option || '\u00A0'}  `, { bold: true, size: 20, color: 'B91C1C' }),
            run([text, reason].filter(Boolean).join('：') || '待补'),
          ],
          { after: 35, indentLeft: 240, shading: 'FFF7ED' },
        ),
      )
    })
  }
}

function pushDocxSevenChoicesAnalysis(body, detail, question) {
  const savedAiParse = findSavedSevenChoicesParseQuestion(detail, question)
  if (!savedAiParse) {
    body.push(paragraph(`解析：${docxQuestionExplanation(detail, question)}`, { after: 120, shading: 'EEF2F4' }))
    return
  }

  const answerText = [
    optionalString(savedAiParse.answer),
    optionalString(savedAiParse.optionText),
  ].filter(Boolean).join(' · ')
  pushDocxLabelParagraph(body, 'AI 答案', answerText || savedAiParse.answer, { after: 50, shading: 'F8FAFC' })
  pushDocxLabelParagraph(body, '选项翻译', savedAiParse.optionTranslation, { after: 50, shading: 'F8FAFC' })
  pushDocxLabelParagraph(body, '上下文位置', savedAiParse.positionContext, { after: 50, shading: 'F8FAFC' })
  pushDocxLabelParagraph(body, 'AI 解析', savedAiParse.analysis || '待补', { after: 120, shading: 'F8FAFC' })
}

function pushDocxAnswerArea(body, detail, question, versionType) {
  if (versionType === 'student') {
    return
  }

  body.push(paragraph([run(`答案：${question.answer || '待补'}`, { bold: true })], { after: 40, shading: 'EEF2F4' }))

  if (detail.groupType === 'reading') {
    pushDocxReadingAnalysis(body, detail, question)
    return
  }

  if (detail.groupType === 'cloze') {
    pushDocxClozeAnalysis(body, detail, question)
    return
  }

  if (detail.groupType === 'seven_choices') {
    pushDocxSevenChoicesAnalysis(body, detail, question)
    return
  }

  if (detail.groupType === 'grammar_cloze') {
    pushDocxGrammarAnalysis(body, detail, question)
    return
  }

  body.push(paragraph(`解析：${docxQuestionExplanation(detail, question)}`, { after: 120, shading: 'EEF2F4' }))
}

function docxFileName(title, versionType) {
  const versionLabel = versionType === 'student' ? '学生版' : '教师版'
  const cleanTitle = String(title || '英语题集')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)

  return `${cleanTitle || '英语题集'}-${versionLabel}.docx`
}

function pdfFileName(title, versionType) {
  return docxFileName(title, versionType).replace(/\.docx$/, '.pdf')
}

function timestampPrefix() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
}

// --- Exam-style renderer: formal Gaokao-style paper layout ---
function buildExamDocumentXml({ title, versionType, items, blocks, questionNumberStart }) {
  const startNum = Number.isInteger(questionNumberStart) && questionNumberStart >= 1 ? questionNumberStart : 1
  const body = []

  // Header: centered title, no metadata line
  body.push(paragraph([run(title || '英语试题', { bold: true, size: 32 })], { align: 'center', after: 60 }))
  if (versionType === 'teacher') {
    body.push(paragraph([run('（教师版 含答案解析）', { size: 20, color: '666666' })], { align: 'center', after: 200 }))
  } else {
    body.push(paragraph('', { after: 160 }))
  }

  const itemByGroupId = new Map(items.map((item) => [item.detail.id, item]))

  // Determine if we should use short-option two-column layout
  function isShortOptions(options) {
    if (!options || options.length === 0) return false
    return options.every((o) => String(o.content || '').length <= 20)
  }

  function renderOptionsExam(body, options, groupType) {
    if (!options || options.length === 0) return
    if (groupType === 'cloze') {
      // Cloze: inline
      const inlineText = options.map((o) => `${o.label}. ${o.content}`).join('    ')
      body.push(paragraph(inlineText, { after: 50, indentLeft: 420 }))
      return
    }
    if (isShortOptions(options) && options.length === 4) {
      // Two-column borderless table for short ABCD options
      const row1 = [
        `${options[0].label}. ${options[0].content}`,
        `${options[1].label}. ${options[1].content}`,
      ]
      const row2 = [
        `${options[2].label}. ${options[2].content}`,
        `${options[3].label}. ${options[3].content}`,
      ]
      body.push(examOptionTable([row1, row2]))
    } else {
      // Single-column
      options.forEach((option) => {
        body.push(paragraph(`${option.label}. ${option.content}`, { after: 30, indentLeft: 420 }))
      })
    }
  }

  // Render blocks or legacy items
  if (Array.isArray(blocks) && blocks.length > 0) {
    let questionNum = startNum

    for (const block of blocks) {
      if (block.type === 'section_header' && block.title) {
        body.push(paragraph([run(block.title, { bold: true, size: 24 })], { before: 280, after: 120, keepNext: true }))
      } else if (block.type === 'page_break') {
        body.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>')
      } else if (block.type === 'question_group' && block.questionGroupId) {
        const item = itemByGroupId.get(block.questionGroupId)
        if (!item) continue
        const { detail } = item
        const score = Number.isFinite(Number(block.score)) ? Number(block.score) : item.score
        const passageLines = normalizeDocxLines(detail.passage.materialText || detail.passage.summary || '')

        // Extract passage label (A/B/C/D) from sectionTitle if possible
        const sectionTitle = block.sectionTitle || item.sectionTitle || ''
        const passageLabelMatch = sectionTitle.match(/([A-D])$/)
        const passageLabel = passageLabelMatch ? passageLabelMatch[1] : ''

        if (passageLabel) {
          body.push(paragraph([run(passageLabel, { bold: true, size: 22 })], { align: 'center', before: 160, after: 80, keepNext: true }))
        }

        // Passage text
        if (passageLines.length > 0 && passageLines[0]) {
          passageLines.forEach((line) => {
            body.push(paragraph(line, { after: 60 }))
          })
          body.push(paragraph('', { after: 80 }))
        }

        // Questions
        detail.questions.forEach((question) => {
          body.push(
            paragraph(
              [run(`${questionNum}.  ${docxQuestionStem(detail, question)}`)],
              { before: 60, after: 50 },
            ),
          )
          renderOptionsExam(body, question.options, detail.groupType)

          // Teacher version: compact answer
          if (versionType === 'teacher') {
            body.push(paragraph([run(`【答案】${question.answer || '待补'}`, { size: 18, color: '333333' })], { after: 30, indentLeft: 420 }))
            const explanation = question.explanation || question.note || ''
            if (explanation) {
              body.push(paragraph([run(`【解析】${explanation}`, { size: 18, color: '666666' })], { after: 50, indentLeft: 420 }))
            }
          }
          questionNum++
        })
      }
    }
  } else {
    // Legacy fallback for exam style
    let questionNum = startNum
    items.forEach((item) => {
      const { detail } = item
      const passageLines = normalizeDocxLines(detail.passage.materialText || detail.passage.summary || '')

      if (passageLines.length > 0 && passageLines[0]) {
        passageLines.forEach((line) => {
          body.push(paragraph(line, { after: 60 }))
        })
        body.push(paragraph('', { after: 80 }))
      }

      detail.questions.forEach((question) => {
        body.push(
          paragraph([run(`${questionNum}.  ${docxQuestionStem(detail, question)}`)], { before: 60, after: 50 }),
        )
        renderOptionsExam(body, question.options, detail.groupType)
        if (versionType === 'teacher') {
          body.push(paragraph([run(`【答案】${question.answer || '待补'}`, { size: 18, color: '333333' })], { after: 30, indentLeft: 420 }))
        }
        questionNum++
      })
    })
  }

  // TODO: Footer with page numbers (英语试题 第 PAGE 页（共 NUMPAGES 页）) requires
  // header/footer parts in the DOCX package. Skipped in V1 to avoid destabilizing
  // the zip package structure. Can be added by creating word/footer1.xml and
  // referencing it in sectPr with <w:footerReference>.
  body.push(
    `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>`,
  )

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${body.join('')}</w:body>
</w:document>`
}

// Borderless two-column option table for exam style
function examOptionTable(rows) {
  const colWidth = 4500
  const rowXml = rows.map((cells) => {
    const cellsXml = cells.map((cell) =>
      `<w:tc><w:tcPr><w:tcW w:w="${colWidth}" w:type="dxa"/><w:tcBorders><w:top w:val="none"/><w:left w:val="none"/><w:bottom w:val="none"/><w:right w:val="none"/><w:insideH w:val="none"/><w:insideV w:val="none"/></w:tcBorders></w:tcPr>${paragraph(cell, { after: 30 })}</w:tc>`
    ).join('')
    return `<w:tr>${cellsXml}</w:tr>`
  }).join('')
  return `<w:tbl><w:tblPr><w:tblW w:w="9000" w:type="dxa"/><w:tblBorders><w:top w:val="none"/><w:left w:val="none"/><w:bottom w:val="none"/><w:right w:val="none"/><w:insideH w:val="none"/><w:insideV w:val="none"/></w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid><w:gridCol w:w="${colWidth}"/><w:gridCol w:w="${colWidth}"/></w:tblGrid>${rowXml}</w:tbl>`
}

function buildDocumentXml({ title, versionType, items, blocks, questionNumberStart, printStyle }) {
  if (printStyle === 'exam') {
    return buildExamDocumentXml({ title, versionType, items, blocks, questionNumberStart })
  }
  // Handout style (original behavior)
  const versionLabel = versionType === 'student' ? '学生版' : '教师版'
  const totalQuestions = items.reduce((sum, item) => sum + item.detail.questions.length, 0)
  const totalScore = items.reduce((sum, item) => sum + item.detail.questions.length * item.score, 0)
  const body = [
    paragraph([run('ENGLISH QUESTION SET', { bold: true, size: 20, color: '6D737B' })], { align: 'center', after: 80 }),
    paragraph([run(title, { bold: true, size: 32 })], { align: 'center', after: 100 }),
    paragraph(`${versionLabel} · ${items.length} 题组 · ${totalQuestions} 小题 · ${totalScore.toFixed(1)} 分`, {
      align: 'center',
      after: 260,
    }),
  ]

  const startNum = Number.isInteger(questionNumberStart) && questionNumberStart >= 1 ? questionNumberStart : 1

  // If blocks are provided, render by block sequence
  if (Array.isArray(blocks) && blocks.length > 0) {
    let questionNum = startNum
    const itemByGroupId = new Map(items.map((item) => [item.detail.id, item]))

    for (const block of blocks) {
      if (block.type === 'section_header' && block.title) {
        body.push(
          paragraph([run(block.title, { bold: true, size: 28 })], { before: 300, after: 120, keepNext: true }),
        )
      } else if (block.type === 'page_break') {
        body.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>')
      } else if (block.type === 'question_group' && block.questionGroupId) {
        const item = itemByGroupId.get(block.questionGroupId)
        if (!item) continue
        const { detail, note, sectionTitle } = item
        // Prefer block.score (from PaperExportBlock) over item.score
        const score = Number.isFinite(Number(block.score)) ? Number(block.score) : item.score
        const passageLines = normalizeDocxLines(detail.passage.materialText || detail.passage.summary || '暂无完整原文。')

        body.push(
          paragraph(
            [
              run(`${sectionTitle || detail.title}`, { bold: true, size: 26 }),
            ],
            { before: 240, after: 40, keepNext: true },
          ),
          paragraph(`${detail.title} · ${detail.source} · ${groupTypeLabels[detail.groupType] || detail.groupType} · 每题 ${score} 分`, {
            after: 120,
          }),
        )
        if (versionType === 'teacher' && note) {
          body.push(paragraph(`讲评备注：${note}`, { after: 120, shading: 'EEF2F4' }))
        }
        body.push(paragraph([run(detail.passage.title, { bold: true, size: 22 })], { after: 60, keepNext: true }))
        passageLines.forEach((line) => {
          body.push(paragraph(line, { after: 80, indentLeft: 240 }))
        })

        if (detail.groupType === 'seven_choices') {
          const sharedOptions = uniqueDocxOptions(detail.questions)
          if (sharedOptions.length > 0) {
            body.push(paragraph([run('选项', { bold: true })], { before: 80, after: 50, keepNext: true }))
            sharedOptions.forEach((option) => {
              body.push(paragraph(`${option.label}. ${option.content}`, { after: 40, indentLeft: 360 }))
            })
          }
        }

        detail.questions.forEach((question) => {
          body.push(
            paragraph(
              [
                run(`${questionNum}. `, { bold: true }),
                run(docxQuestionStem(detail, question), { bold: true }),
              ],
              { before: 90, after: 70, keepNext: true },
            ),
          )
          if (detail.groupType !== 'seven_choices') {
            if (detail.groupType === 'cloze' && question.options.length > 0) {
              const inlineText = question.options.map((o) => `${o.label}. ${o.content}`).join('  ')
              body.push(paragraph(inlineText, { after: 60, indentLeft: 360 }))
            } else {
              question.options.forEach((option) => {
                body.push(paragraph(`${option.label}. ${option.content}`, { after: 40, indentLeft: 360 }))
              })
            }
          }
          pushDocxAnswerArea(body, detail, question, versionType)
          questionNum++
        })
      }
    }
  } else {
    // Legacy fallback: render by items array (flat question group list without block structure).
    // This path is kept for backward compatibility with older saved paper sets that don't have blocks.
    // Once all clients send blocks, this branch can be removed.
    let legacyQuestionNum = startNum
    items.forEach((item, groupIndex) => {
      const { detail, note, score, sectionTitle } = item
      const passageLines = normalizeDocxLines(detail.passage.materialText || detail.passage.summary || '暂无完整原文。')

      body.push(
        paragraph(
          [
            run(`${groupIndex + 1}. `, { bold: true, size: 26 }),
            run(sectionTitle || detail.title, { bold: true, size: 26 }),
          ],
          { before: groupIndex === 0 ? 0 : 240, after: 40, keepNext: true },
        ),
        paragraph(`${detail.title} · ${detail.source} · ${groupTypeLabels[detail.groupType] || detail.groupType} · 每题 ${score} 分`, {
          after: 120,
        }),
      )
      if (versionType === 'teacher' && note) {
        body.push(paragraph(`讲评备注：${note}`, { after: 120, shading: 'EEF2F4' }))
      }
      body.push(paragraph([run(detail.passage.title, { bold: true, size: 22 })], { after: 60, keepNext: true }))

      passageLines.forEach((line) => {
        body.push(paragraph(line, { after: 80, indentLeft: 240 }))
      })

      if (detail.groupType === 'seven_choices') {
        const sharedOptions = uniqueDocxOptions(detail.questions)

        if (sharedOptions.length > 0) {
          body.push(paragraph([run('选项', { bold: true })], { before: 80, after: 50, keepNext: true }))
          sharedOptions.forEach((option) => {
            body.push(paragraph(`${option.label}. ${option.content}`, { after: 40, indentLeft: 360 }))
          })
        }
      }

      detail.questions.forEach((question) => {
        body.push(
          paragraph(
            [
              run(`${legacyQuestionNum}. `, { bold: true }),
              run(docxQuestionStem(detail, question), { bold: true }),
            ],
            { before: 90, after: 70, keepNext: true },
          ),
        )

        if (detail.groupType !== 'seven_choices') {
          if (detail.groupType === 'cloze' && question.options.length > 0) {
            const inlineText = question.options.map((o) => `${o.label}. ${o.content}`).join('  ')
            body.push(paragraph(inlineText, { after: 60, indentLeft: 360 }))
          } else {
            question.options.forEach((option) => {
              body.push(paragraph(`${option.label}. ${option.content}`, { after: 40, indentLeft: 360 }))
            })
          }
        }

        pushDocxAnswerArea(body, detail, question, versionType)
        legacyQuestionNum++
      })
    })
  }

  body.push(
    `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>`,
  )

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${body.join('')}</w:body>
</w:document>`
}

function writeDocxPackage({ documentXml, outputPath, title }) {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'question-bank-docx-'))

  try {
    mkdirSync(path.join(tempDir, '_rels'), { recursive: true })
    mkdirSync(path.join(tempDir, 'docProps'), { recursive: true })
    mkdirSync(path.join(tempDir, 'word'), { recursive: true })

    writeFileSync(
      path.join(tempDir, '[Content_Types].xml'),
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`,
    )

    writeFileSync(
      path.join(tempDir, '_rels/.rels'),
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`,
    )

    writeFileSync(
      path.join(tempDir, 'docProps/core.xml'),
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${escapeXml(title)}</dc:title>
  <dc:creator>English Question Bank</dc:creator>
  <cp:lastModifiedBy>English Question Bank</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:modified>
</cp:coreProperties>`,
    )

    writeFileSync(
      path.join(tempDir, 'docProps/app.xml'),
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>English Question Bank</Application>
</Properties>`,
    )

    writeFileSync(path.join(tempDir, 'word/document.xml'), documentXml)
    execFileSync('zip', ['-qr', outputPath, '.'], { cwd: tempDir })
    return readFileSync(outputPath)
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

function exportDocx(input) {
  const title = requiredString(input.title, 'title')
  const versionType = requiredEnum(input.versionType, ['student', 'teacher'], 'versionType')
  const items = Array.isArray(input.items) ? input.items : []

  if (items.length === 0) {
    throw new Error('items are required')
  }

  const questionNumberStart = Number.isInteger(Number(input.questionNumberStart)) && Number(input.questionNumberStart) >= 1
    ? Number(input.questionNumberStart)
    : 1
  const blocks = Array.isArray(input.blocks) ? input.blocks : null

  const exportItems = items.map((item) => {
    const itemInput = item && typeof item === 'object' ? item : {}
    const questionGroupId = requiredString(itemInput.questionGroupId, 'questionGroupId')
    const detail = getQuestionGroupDetail(questionGroupId)

    if (!detail) {
      throw new Error(`questionGroupId not found: ${questionGroupId}`)
    }

    return {
      detail,
      note: optionalString(itemInput.note),
      score: Math.max(0, Number.isFinite(Number(itemInput.score)) ? Number(itemInput.score) : detail.defaultScore),
      sectionTitle: optionalString(itemInput.sectionTitle),
    }
  })

  mkdirSync(exportDir, { recursive: true })
  const fileName = docxFileName(title, versionType)
  const outputPath = path.join(exportDir, `${timestampPrefix()}-${fileName}`)
  const printStyle = input.printStyle === 'exam' ? 'exam' : 'handout'
  const documentXml = buildDocumentXml({ title, versionType, items: exportItems, blocks, questionNumberStart, printStyle })
  const body = writeDocxPackage({ documentXml, outputPath, title })

  return {
    body,
    fileName,
    outputPath,
  }
}

function findSoffice() {
  const candidates = [
    process.env.SOFFICE_PATH,
    '/opt/homebrew/bin/soffice',
    '/usr/local/bin/soffice',
    '/Applications/LibreOffice.app/Contents/MacOS/soffice',
    '/Applications/OpenOffice.app/Contents/MacOS/soffice',
    'soffice',
  ].filter(Boolean)

  for (const candidate of candidates) {
    if (candidate === 'soffice' || existsSync(candidate)) return candidate
  }

  throw new Error('LibreOffice soffice not found; cannot export PDF')
}

function convertDocxToPdf(docxPath, outputPath) {
  const soffice = findSoffice()
  const profileDir = mkdtempSync(path.join(tmpdir(), 'question-bank-lo-profile-'))

  try {
    execFileSync(
      soffice,
      [
        '--headless',
        `-env:UserInstallation=file://${profileDir}`,
        '--convert-to',
        'pdf',
        '--outdir',
        path.dirname(outputPath),
        docxPath,
      ],
      { stdio: 'pipe' },
    )

    const generatedPath = path.join(path.dirname(outputPath), `${path.basename(docxPath, '.docx')}.pdf`)
    if (!existsSync(generatedPath)) {
      throw new Error('LibreOffice did not produce a PDF file')
    }
    if (generatedPath !== outputPath) {
      renameSync(generatedPath, outputPath)
    }
  } finally {
    rmSync(profileDir, { recursive: true, force: true })
  }
}

function exportPdf(input) {
  const title = requiredString(input.title, 'title')
  const versionType = requiredEnum(input.versionType, ['student', 'teacher'], 'versionType')
  const docxResult = exportDocx({ ...input, title, versionType })
  const fileName = pdfFileName(title, versionType)
  const outputPath = docxResult.outputPath.replace(/\.docx$/, '.pdf')

  convertDocxToPdf(docxResult.outputPath, outputPath)
  rmSync(docxResult.outputPath, { force: true })

  return {
    body: readFileSync(outputPath),
    fileName,
    outputPath,
  }
}

function exportPrintHtml(input) {
  const title = requiredString(input.title, 'title')
  const versionType = requiredEnum(input.versionType, ['student', 'teacher'], 'versionType')
  const items = Array.isArray(input.items) ? input.items : []
  if (items.length === 0) throw new Error('items are required')

  const printStyle = input.printStyle === 'handout' ? 'handout' : 'exam'
  const questionNumberStart = Number.isInteger(Number(input.questionNumberStart)) && Number(input.questionNumberStart) >= 1
    ? Number(input.questionNumberStart) : 1
  const blocks = Array.isArray(input.blocks) ? input.blocks : null

  const exportItems = items.map((item) => {
    const itemInput = item && typeof item === 'object' ? item : {}
    const questionGroupId = requiredString(itemInput.questionGroupId, 'questionGroupId')
    const detail = getQuestionGroupDetail(questionGroupId)
    if (!detail) throw new Error(`questionGroupId not found: ${questionGroupId}`)
    return {
      detail,
      note: optionalString(itemInput.note),
      score: Math.max(0, Number.isFinite(Number(itemInput.score)) ? Number(itemInput.score) : detail.defaultScore),
      sectionTitle: optionalString(itemInput.sectionTitle),
    }
  })

  const html = buildPrintHtml({ title, versionType, printStyle, items: exportItems, blocks, questionNumberStart })
  const versionLabel = versionType === 'student' ? '学生版' : '教师版'
  const fileName = `${title}-${versionLabel}-精排.html`

  return { body: html, fileName }
}

function exportPrintPdf(input) {
  const htmlResult = exportPrintHtml(input)
  const title = requiredString(input.title, 'title')
  const versionType = requiredEnum(input.versionType, ['student', 'teacher'], 'versionType')
  const versionLabel = versionType === 'student' ? '学生版' : '教师版'

  // Find vivliostyle CLI
  const vivliostylePaths = [
    path.join(rootDir, 'node_modules', '.bin', 'vivliostyle'),
    path.join(rootDir, 'server', 'node_modules', '.bin', 'vivliostyle'),
  ]
  let vivliostyleBin = null
  for (const p of vivliostylePaths) {
    if (existsSync(p)) { vivliostyleBin = p; break }
  }
  if (!vivliostyleBin) {
    throw new Error('vivliostyle CLI not found. Install with: npm install @vivliostyle/cli')
  }

  mkdirSync(exportDir, { recursive: true })
  const tempDir = mkdtempSync(path.join(tmpdir(), 'question-bank-print-'))
  const htmlPath = path.join(tempDir, 'paper.html')
  const pdfPath = path.join(tempDir, 'paper.pdf')

  try {
    writeFileSync(htmlPath, htmlResult.body)
    execFileSync(vivliostyleBin, ['build', htmlPath, '-o', pdfPath], { timeout: 60000 })
    const fileName = `${title}-${versionLabel}-精排.pdf`
    const outputPath = path.join(exportDir, `${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}-${fileName}`)
    copyFileSync(pdfPath, outputPath)
    return { body: readFileSync(outputPath), fileName, outputPath }
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || ''
const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions'
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

function buildDeepSeekRequestOptions({ model, messages, temperature, maxTokens, thinkingMode, responseFormat }) {
  const requestBody = {
    model,
    messages,
    max_tokens: maxTokens,
    thinking: { type: thinkingMode ? 'enabled' : 'disabled' },
  }

  if (responseFormat === 'json_object') {
    requestBody.response_format = { type: 'json_object' }
  }

  if (thinkingMode) {
    requestBody.reasoning_effort = 'high'
  } else if (typeof temperature === 'number') {
    requestBody.temperature = temperature
  }

  return requestBody
}

function normalizeDeepSeekModel(inputModel) {
  const rawModel = String(inputModel || '').trim()
  if (!rawModel) return DEFAULT_DEEPSEEK_MODEL
  const normalizedKey = rawModel.toLowerCase().replace(/\s+/g, '').replace(/_/g, '-')
  return DEEPSEEK_MODEL_ALIASES[normalizedKey] || DEFAULT_DEEPSEEK_MODEL
}

function isLocalQwenModel(inputModel) {
  const normalizedKey = String(inputModel || '').trim().toLowerCase().replace(/\s+/g, '').replace(/_/g, '-')
  return ['qwen3-8b-local', 'qwen3-8b', 'local-qwen'].includes(normalizedKey)
}

function normalizeAiChatModel(inputModel) {
  return isLocalQwenModel(inputModel) ? LOCAL_QWEN_CHAT_MODEL : normalizeDeepSeekModel(inputModel)
}

function describeAiKeySource(apiKey, model) {
  if (isLocalQwenModel(model)) {
    return {
      source: 'local',
      provider: LOCAL_QWEN_PROVIDER,
    }
  }
  return describeKeySource(apiKey)
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

function describeKeySource(apiKey) {
  const hasClientKey = Boolean(apiKey && String(apiKey).trim())
  return {
    source: hasClientKey ? 'client' : 'env',
    provider: 'deepseek',
  }
}

function parseJsonFromString(rawText) {
  try {
    return JSON.parse(rawText)
  } catch {
    return null
  }
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function extractBalancedJson(rawText) {
  if (typeof rawText !== 'string') return ''

  const text = rawText.trim()
  let depth = 0
  let inString = false
  let escape = false
  let start = -1

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (escape) {
      escape = false
      continue
    }

    if (char === '\\') {
      escape = true
      continue
    }

    if (char === '"') {
      inString = !inString
      continue
    }

    if (inString) {
      continue
    }

    if (char === '{') {
      if (depth === 0) {
        start = index
      }
      depth += 1
      continue
    }

    if (char === '}' && depth > 0) {
      depth -= 1
      if (depth === 0 && start >= 0) {
        return text.slice(start, index + 1)
      }
    }
  }

  return ''
}

function extractBalancedJsonCandidates(rawText, maxCandidates = 8) {
  if (typeof rawText !== 'string') return []

  const text = rawText.trim()
  if (!text) return []

  const candidates = []
  let depth = 0
  let inString = false
  let escape = false
  let start = -1

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]

    if (escape) {
      escape = false
      continue
    }

    if (char === '\\') {
      escape = true
      continue
    }

    if (char === '"') {
      inString = !inString
      continue
    }

    if (inString) {
      continue
    }

    if (char === '{') {
      if (depth === 0) {
        start = index
      }
      depth += 1
      continue
    }

    if (char === '}' && depth > 0) {
      depth -= 1
      if (depth === 0 && start >= 0) {
        const candidate = text.slice(start, index + 1).trim()
        if (candidate) {
          candidates.push(candidate)
          if (candidates.length >= maxCandidates) {
            break
          }
        }
        start = -1
      }
    }
  }

  return candidates
}

function parseJsonObject(text) {
  const parsed = parseJsonFromString(String(text || '').trim())
  if (isPlainObject(parsed)) {
    if (Array.isArray(parsed.choices) && parsed.choices.length > 0) {
      const message = parsed.choices[0].message || parsed.choices[0]
      const messageText = getDeepSeekMessageText(message)
      const messageParsed = parseJsonObject(messageText)
      if (messageParsed) {
        return messageParsed
      }
      return null
    }

    return parsed
  }

  const balancedCandidates = extractBalancedJsonCandidates(text)
  for (const candidate of balancedCandidates) {
    const balancedParsed = parseJsonFromString(candidate)
    if (isPlainObject(balancedParsed)) {
      return balancedParsed
    }
  }

  return null
}

function normalizeVerifyVerdict(value) {
  if (!value) return ''
  const normalized = String(value)
    .toLowerCase()
    .replace(/[\s]/g, '')
    .replace(/[:：，。,;；!！?？]/g, '')

  const isCorrect = ['correct', '答案正确', '正确', '正确答案', '答案无误', '无误', '对'].includes(normalized)
  const isAnswerWrong = [
    'answer_wrong',
    'answerwrong',
    '答案错误',
    'answererror',
    '答案有误',
    '答案不对',
    '答案不正确',
  ].includes(normalized)
  const isExplanationWrong = [
    'explanation_wrong',
    'explanationwrong',
    '解析有误',
    '解析错误',
    '解析不当',
    '解析有问题',
  ].includes(normalized)
  const isBothWrong = [
    'both_wrong',
    'bothwrong',
    '答案和解析均错',
    '答案与解析均错',
    '答案和解析都错',
    '两项均错',
    '答案及解析错误',
  ].includes(normalized)
  const isUncertain = ['uncertain', 'unknown', '未知', '不确定', '待定', '待确认'].includes(normalized)

  if (isBothWrong) return 'both_wrong'
  if (isCorrect) return 'correct'
  if (isAnswerWrong) return 'answer_wrong'
  if (isExplanationWrong) return 'explanation_wrong'
  if (isUncertain) return 'uncertain'

  return ''
}

function inferVerifyVerdictFromText(rawText) {
  const text = String(rawText || '').toLowerCase()
  if (!text.trim()) return ''

  const normalized = text.replace(/[\s:：，。,;；!！?？]/g, '')

  if ((normalized.includes('bothwrong') || normalized.includes('答案和解析均错') || normalized.includes('答案与解析均错') || normalized.includes('答案和解析都错') || normalized.includes('两项均错')))
    return 'both_wrong'
  if (normalized.includes('答案正确') || normalized.includes('正确答案') || normalized === 'correct' || normalized.includes('答案无误') || normalized === '正确')
    return 'correct'
  if (normalized.includes('answerwrong') || normalized.includes('答案错误') || normalized.includes('答案有误') || normalized.includes('答案不对') || normalized.includes('答案不正确'))
    return 'answer_wrong'
  if (normalized.includes('explanationwrong') || normalized.includes('解析有误') || normalized.includes('解析错误') || normalized.includes('解析不当') || normalized.includes('解析不对'))
    return 'explanation_wrong'
  if (normalized.includes('uncertain') || normalized.includes('未知') || normalized.includes('待定') || normalized.includes('不确定') || normalized.includes('待确认'))
    return 'uncertain'

  return ''
}

function getDeepSeekMessageText(message) {
  if (!message || typeof message !== 'object') return ''
  const normalizeText = (value) => {
    if (typeof value === 'string') return value
    if (Array.isArray(value)) {
      return value
        .map((entry) => normalizeText(entry))
        .filter(Boolean)
        .join('\n')
    }
    if (value && typeof value === 'object') {
      if (typeof value.text === 'string') return String(value.text)
      if (typeof value.content === 'string') {
        return String(value.content)
      }
      if (Array.isArray(value.content)) {
        return value
          .content
          .map((entry) => normalizeText(entry))
          .filter(Boolean)
          .join('\n')
      }
      if (typeof value.value === 'string') {
        return String(value.value)
      }
      if (typeof value.data === 'string') {
        return String(value.data)
      }
      if (typeof value.text === 'string') {
        return String(value.text)
      }
      if (Array.isArray(value.parts)) {
        return normalizeText(value.parts)
      }
    }

    return ''
  }

  const contentText = normalizeText(message.content)
  if (contentText.trim()) return contentText

  const reasoningText = normalizeText(message.reasoning_content)
  if (reasoningText.trim()) return reasoningText

  const reasoningFallbackText = normalizeText(message.reasoning)
  if (reasoningFallbackText.trim()) return reasoningFallbackText

  const choiceMessage = message?.choices?.[0]?.message
  const choiceMessageText = getDeepSeekMessageText(choiceMessage)
  if (choiceMessageText.trim()) {
    return choiceMessageText
  }

  if (Array.isArray(message.choices)) {
    for (const choice of message.choices) {
      const choiceText = getDeepSeekMessageText(choice?.message || choice)
      if (choiceText.trim()) {
        return choiceText
      }
    }
  }

  return ''
}

function collectDeepSeekMessageTexts(message) {
  const texts = []
  const seen = new Set()
  const seenObjects = new Set()

  const normalizeTextValue = (value) => {
    if (typeof value === 'string') return value
    if (Array.isArray(value)) {
      return value
        .map((entry) => normalizeTextValue(entry))
        .filter(Boolean)
        .join('\n')
    }

    if (value && typeof value === 'object') {
      if (typeof value.text === 'string') return String(value.text)
      if (typeof value.content === 'string') return String(value.content)
      if (Array.isArray(value.content)) {
        return value
          .content
          .map((entry) => normalizeTextValue(entry))
          .filter(Boolean)
          .join('\n')
      }
      if (typeof value.value === 'string') return String(value.value)
      if (typeof value.data === 'string') return String(value.data)
      if (Array.isArray(value.parts)) {
        return normalizeTextValue(value.parts)
      }
    }

    return ''
  }

  const addText = (value) => {
    const normalized = normalizeTextValue(value).trim()
    if (!normalized || seen.has(normalized)) return
    seen.add(normalized)
    texts.push(normalized)
  }

  const visit = (node, depth = 0) => {
    if (!node || typeof node !== 'object') return
    if (depth > 6) return
    if (seenObjects.has(node)) return
    seenObjects.add(node)

    if (Array.isArray(node)) {
      for (const item of node) {
        visit(item, depth + 1)
      }
      return
    }

    addText(node.content)
    addText(node.reasoning_content)
    addText(node.reasoning)
    addText(node.output)
    addText(node.text)

    Object.values(node).forEach((value) => {
      if (typeof value === 'string') {
        addText(value)
        return
      }
      visit(value, depth + 1)
    })
  }

  visit(message)

  return texts
}

function parseLooseVerifyResult(rawText) {
  if (!rawText) return null

  const direct = isPlainObject(rawText) ? normalizeVerifyResultObject(rawText) : null
  if (direct && direct.verdict) return direct

  const text = String(rawText)
  if (!text.trim()) return null

  const matchWithValue = (patterns) => {
    for (const pattern of patterns) {
      const match = text.match(pattern)
      if (match && match[1]) {
        return match[1].trim()
      }
    }
    return ''
  }

  const verdictRaw = matchWithValue([
    /(?:^|[\n\s])(?:verdict|判定)\s*[:：]?\s*(correct|answer_wrong|explanation_wrong|both_wrong|uncertain|correct answer|答案正确|答案错误|答案有误|解析有误|答案和解析均错|答案与解析均错|答案和解析都错|两项均错|解析错误)\b/i,
    /(?:^|[\n\s])(?:结论|最终结论|结果)\s*[:：]?\s*(correct|answer_wrong|explanation_wrong|both_wrong|uncertain|正确|正确答案|答案错误|答案有误|解析有误|答案和解析均错|答案与解析均错|答案和解析都错|两项均错|解析错误|均错误|不确定)\b/i,
  ])
  const normalizeVerifyVerdict = (value) => {
    if (!value) return ''
    const normalized = String(value)
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/[:：，。,;；!！?？]/g, '')
    if (['correct', 'correctanswer', '答案正确', 'correctanswer', '正确'].includes(normalized)) return 'correct'
    if (['answer_wrong', 'answerwrong', '答案错误', 'answererror', '答案有误', 'answeriswrong'].includes(normalized)) return 'answer_wrong'
    if (['explanation_wrong', 'explanationwrong', '解析有误', '解析错误', '解析不对', 'explicationwrong'].includes(normalized))
      return 'explanation_wrong'
    if (
      [
        'both_wrong',
        'bothwrong',
        '答案和解析均错',
        '答案与解析均错',
        '答案和解析都错',
        '两项均错',
        '解析与答案均错',
      ].includes(normalized)
    )
      return 'both_wrong'
    if (['uncertain', '未知', '待定', '不确定'].includes(normalized)) return 'uncertain'
    return ''
  }

  let verdict = normalizeVerifyVerdict(verdictRaw)
  if (!verdict) verdict = inferVerifyVerdictFromText(text)
  if (!verdict) {
    const candidatePayload = extractFirstJson(text)
    if (candidatePayload) {
      const candidate = normalizeVerifyResultObject(candidatePayload) || extractVerifyResultFromPayload(candidatePayload)
      if (candidate) return candidate
    }
    const nested = extractVerifyResultFromPayload(getDeepSeekMessageText(rawText))
    if (nested) return nested
  }

  const correctAnswer = matchWithValue([/(?:^|[\n\s])(?:correctanswer|correct answer|正确答案)\s*[:：]\s*([A-Z]{1,2}|[A-Z]{0,2}[0-9]+|[\w\u4e00-\u9fff-]+)/i])
  const reason = matchWithValue([
    /(?:^|[\n\s])(?:reason|reasoning|解析|理由|说明)\s*[:：]?\s*([\s\S]{1,220}?)(?:\n|$)/i,
    /(?:模型返回|根据解析|主要是)\s*([\s\S]{1,220}?)(?:\n|$)/i,
  ])

  if (!verdict) return null

  return {
    verdict,
    reason: reason || '模型返回了非标准 JSON，已按兜底规则解析。',
    correctAnswer: correctAnswer || '',
  }
}

function extractJsonCandidates(rawText) {
  if (rawText === null || rawText === undefined) return []
  if (typeof rawText === 'string') {
    const trimmed = rawText.trim()
    if (!trimmed) return []

    const candidates = [trimmed]
    const codeMatch = trimmed.match(/```json\s*([\s\S]*?)```/i)
    if (codeMatch && codeMatch[1]) {
      candidates.push(codeMatch[1].trim())
    }
    for (const candidate of extractBalancedJsonCandidates(trimmed, 6)) {
      if (!candidates.includes(candidate)) {
        candidates.push(candidate)
      }
    }

    return candidates
  }

  if (typeof rawText !== 'object') return []

  const candidates = []
  const seen = new Set()
  const addCandidate = (value) => {
    if (typeof value !== 'string') return
    const normalized = value.trim()
    if (!normalized || seen.has(normalized)) return
    seen.add(normalized)
    candidates.push(normalized)
  }

  collectDeepSeekMessageTexts(rawText).forEach(addCandidate)

  return candidates
}

function extractVerifyResultFromPayload(payload, options = { seen: new Set(), depth: 0 }) {
  if (!payload) return null
  if (options.depth > 8) return null

  if (typeof payload === 'string') {
    const jsonPayload = extractFirstJson(payload)
    if (jsonPayload) {
      const extracted = normalizeVerifyResultObject(jsonPayload) || extractVerifyResultFromPayload(jsonPayload, options)
      if (extracted) return extracted
    }
    return parseLooseVerifyResult(payload)
  }

  if (typeof payload !== 'object') return null

  if (options.seen.has(payload)) return null
  options.seen.add(payload)

  const direct = normalizeVerifyResultObject(payload)
  if (direct) return direct

  if (Array.isArray(payload)) {
    for (const entry of payload) {
      const nested = extractVerifyResultFromPayload(entry, {
        seen: options.seen,
        depth: options.depth + 1,
      })
      if (nested) return nested
    }

    return null
  }

  for (const value of Object.values(payload)) {
    const nested = extractVerifyResultFromPayload(value, {
      seen: options.seen,
      depth: options.depth + 1,
    })
    if (nested) return nested
  }

  return null
}

function extractReadingParsePayloadFromPayload(payload, options = { seen: new Set(), depth: 0 }) {
  if (!payload) return null
  if (options.depth > 8) return null

  if (typeof payload === 'string') {
    const jsonPayload = extractFirstJson(payload)
    if (jsonPayload) {
      return extractReadingParsePayloadFromPayload(jsonPayload, options)
    }
    return null
  }

  if (typeof payload !== 'object') return null
  if (options.seen.has(payload)) return null
  options.seen.add(payload)

  if (isPlainObject(payload) && Array.isArray(payload.questions)) {
    return payload
  }

  if (Array.isArray(payload)) {
    for (const entry of payload) {
      const nested = extractReadingParsePayloadFromPayload(entry, {
        seen: options.seen,
        depth: options.depth + 1,
      })
      if (nested) return nested
    }
    return null
  }

  for (const value of Object.values(payload)) {
    const nested = extractReadingParsePayloadFromPayload(value, {
      seen: options.seen,
      depth: options.depth + 1,
    })
    if (nested) return nested
  }

  return null
}

function normalizeVerifyResultObject(value) {
  if (!isPlainObject(value)) return null

  const verdictRaw = value.verdict || value.result || value.label || value.conclusion || value.结论
  const reasonRaw = value.reason || value.explanation || value.analysis || value.note || value.reasoning
  const correctAnswerRaw = value.correctAnswer || value.correct_answer || value.correctanswer || value.answer || value.答案

  const normalizeVerifyVerdict = (value) => {
    if (!value) return ''
    const normalized = String(value)
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/[:：]/g, '')

    if (['correct', '正确', '对', '答案正确'].includes(normalized)) return 'correct'
    if (['answer_wrong', 'answerwrong', '答案错误', 'answererror', '答案有误'].includes(normalized)) return 'answer_wrong'
    if (['explanation_wrong', 'explanationwrong', '解析有误', '解析错误'].includes(normalized)) return 'explanation_wrong'
    if (['both_wrong', 'bothwrong', '答案和解析均错', '两项均错', '答案与解析均错', '答案和解析都错'].includes(normalized)) return 'both_wrong'
    if (['uncertain', 'unknown', '未知', '不确定', '待定'].includes(normalized)) return 'uncertain'
    return ''
  }

  const verdict = normalizeVerifyVerdict(verdictRaw)
  if (!verdict) return null

  const correctAnswer = String(correctAnswerRaw || '')
  const reason = String(reasonRaw || '')

  return {
    verdict,
    reason: reason || '模型返回了非标准 JSON，已按兜底规则解析。',
    correctAnswer: correctAnswer ? correctAnswer.trim() : '',
  }
}

function extractFirstJson(rawText) {
  const candidates = extractJsonCandidates(rawText)

  for (const candidate of candidates) {
    const parsedPayload = parseJsonObject(candidate)
    if (parsedPayload && typeof parsedPayload === 'object') {
      return parsedPayload
    }
  }

  const message = rawText && typeof rawText === 'object' ? getDeepSeekMessageText(rawText?.choices?.[0]?.message || rawText) : ''
  if (typeof message === 'string') {
    const messagePayload = parseJsonObject(message)
    if (messagePayload && typeof messagePayload === 'object') {
      return messagePayload
    }
  }

  return null
}

function safeTruncate(rawText, maxLength = 320) {
  if (typeof rawText !== 'string') return ''
  const text = rawText.trim()
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength)}…`
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function callDeepSeekCompletion(context) {
  const requestBody = buildDeepSeekRequestOptions(context)
  const maxAttempts = Math.max(1, DEEPSEEK_HTTP_RETRY_COUNT + 1)

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const requestStartAt = Date.now()
    let response
    let rawStatusText = ''

    try {
      response = await fetch(DEEPSEEK_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${context.apiKey}`,
        },
        body: JSON.stringify(requestBody),
      })
      rawStatusText = await response.text().catch(() => '')
    } catch (error) {
      if (attempt < maxAttempts) {
        await delay(DEEPSEEK_HTTP_RETRY_DELAY_MS)
        continue
      }
      throw error
    }

    const requestMs = elapsedMs(requestStartAt)
    if (typeof context.onHttpResponse === 'function') {
      context.onHttpResponse({
        rawStatusText,
        status: response.status,
        ok: response.ok,
        latencyMs: requestMs,
        attempt,
      })
    }

    const data = parseJsonFromString(rawStatusText)

    if (!response.ok) {
      const errorText = safeTruncate(rawStatusText, 240)
      throw new Error(`DeepSeek API 返回错误 ${response.status}: ${errorText}`)
    }

    if (!data) {
      if (attempt < maxAttempts) {
        await delay(DEEPSEEK_HTTP_RETRY_DELAY_MS)
        continue
      }
      const errorText = safeTruncate(rawStatusText, 240)
      throw new Error(`DeepSeek API 返回非 JSON：${errorText}`)
    }

    const raw = getDeepSeekMessageText(data?.choices?.[0]?.message || data)

    const firstMessageText = collectDeepSeekMessageTexts(data).at(0)

    return {
      data,
      rawText: raw,
      firstMessageText,
      latencyMs: requestMs,
      status: response.status,
      rawStatusText,
    }
  }

  throw new Error('DeepSeek API 请求未完成。')
}

function buildLocalQwenRequestOptions({ model, messages, temperature, maxTokens }) {
  const normalizedMessages = Array.isArray(messages)
    ? messages.map((message) => ({
        role: message.role || 'user',
        content:
          message.role === 'user'
            ? `/no_think\n${String(message.content || '')}`
            : String(message.content || ''),
      }))
    : []

  return {
    model: model || LOCAL_QWEN_CHAT_MODEL,
    messages: normalizedMessages,
    temperature: typeof temperature === 'number' ? temperature : 0.2,
    max_tokens: maxTokens,
    stream: false,
  }
}

async function callLocalQwenCompletion(context) {
  const requestStartAt = Date.now()
  const requestBody = buildLocalQwenRequestOptions(context)
  const controller = new AbortController()
  const timeout = setTimeout(() => {
    controller.abort(new Error(`本地 Qwen 请求超时 ${LOCAL_QWEN_CHAT_TIMEOUT_MS}ms`))
  }, LOCAL_QWEN_CHAT_TIMEOUT_MS)

  try {
    const response = await fetch(LOCAL_QWEN_CHAT_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    })

    const requestMs = elapsedMs(requestStartAt)
    const rawStatusText = await response.text().catch(() => '')
    if (typeof context.onHttpResponse === 'function') {
      context.onHttpResponse({
        rawStatusText,
        status: response.status,
        ok: response.ok,
        latencyMs: requestMs,
      })
    }

    const data = parseJsonFromString(rawStatusText)

    if (!response.ok) {
      const errorText = safeTruncate(rawStatusText, 240)
      throw new Error(`本地 Qwen 服务返回错误 ${response.status}: ${errorText}`)
    }

    if (!data) {
      const errorText = safeTruncate(rawStatusText, 240)
      throw new Error(`本地 Qwen 服务返回非 JSON：${errorText}`)
    }

    const raw = getDeepSeekMessageText(data?.choices?.[0]?.message || data)
    const firstMessageText = collectDeepSeekMessageTexts(data).at(0)

    return {
      data,
      rawText: raw,
      firstMessageText,
      latencyMs: requestMs,
      status: response.status,
      rawStatusText,
    }
  } catch (error) {
    const timeoutError = controller.signal.aborted
      ? new Error(`本地 Qwen 请求超时 ${LOCAL_QWEN_CHAT_TIMEOUT_MS}ms`)
      : error
    throw timeoutError
  } finally {
    clearTimeout(timeout)
  }
}

async function callDeepSeekWithFallback(context, onParseError) {
  const parseResult = (result) => {
    const rawCandidates = [result.firstMessageText, result.rawText, result.rawStatusText]

    if (context?.expectedResponseSchema === 'verify') {
      const fromData = extractVerifyResultFromPayload(result.data)
      if (fromData) return fromData

      for (const text of rawCandidates) {
        const jsonCandidate = extractFirstJson(text)
        if (jsonCandidate) {
          const normalizedVerify = extractVerifyResultFromPayload(jsonCandidate)
          if (normalizedVerify) return normalizedVerify
        }

        const looseParsed = parseLooseVerifyResult(text)
        if (looseParsed) return looseParsed
      }

      return null
    }

    if (context?.expectedResponseSchema === 'reading_parse') {
      const fromData = extractReadingParsePayloadFromPayload(result.data)
      if (fromData) return fromData

      for (const text of rawCandidates) {
        const jsonCandidate = extractFirstJson(text)
        if (!jsonCandidate) continue
        const normalizedReadingParse = extractReadingParsePayloadFromPayload(jsonCandidate)
        if (normalizedReadingParse) return normalizedReadingParse
      }

      return null
    }

    const jsonParsedCandidate = rawCandidates.map((candidateText) => extractFirstJson(candidateText)).find(Boolean)
    return jsonParsedCandidate || null
  }

  const completion = context.provider === LOCAL_QWEN_PROVIDER ? callLocalQwenCompletion : callDeepSeekCompletion
  const result = await completion(context)
  let parsed = parseResult(result)
  let fallbackUsed = false

  if (!parsed && context.thinkingMode === true && context.provider !== LOCAL_QWEN_PROVIDER) {
    const fallbackResult = await completion({
      ...context,
      thinkingMode: false,
    })
    parsed = parseResult(fallbackResult)
    if (parsed) {
      fallbackUsed = true
      Object.assign(result, fallbackResult)
    }
  }

  const finalParsed = parsed
  if (!finalParsed || typeof finalParsed !== 'object') {
    const rawLength = typeof result.rawText === 'string' ? result.rawText.length : 0
    const providerName = context.provider === LOCAL_QWEN_PROVIDER ? '本地 Qwen' : 'DeepSeek'
    const parseError = new Error(`${providerName} 返回结果不符合预期 JSON。原始长度 ${rawLength} 字符。`)
    onParseError?.(parseError, {
      thinkingMode: context.thinkingMode === true,
      model: context.model,
      expectedResponseSchema: context.expectedResponseSchema,
      rawPreview: safeTruncate(`${result.rawStatusText || ''}${result.rawStatusText ? '\n' : ''}${result.rawText || ''}`, 500),
      latencyMs: result.latencyMs,
      status: result.status,
    })
    throw parseError
  }

  return {
    ...result,
    parsed: finalParsed,
    thinkingModeUsed: context.thinkingMode === true,
    fallbackUsed,
  }
}

function normalizeSynonymMapping(item) {
  if (!item || typeof item !== 'object') return null
  const text = optionalString(item.text)
  const replacement = optionalString(item.replacement)
  if (!text && !replacement) return null
  return { text, replacement }
}

const READING_SURFACE_QUESTION_TYPES = new Set([
  'single_detail_normal',
  'multi_detail_learn_from',
  'why_did',
  'word_meaning',
  'paragraph_main_idea',
  'passage_main_idea',
  'writing_technique',
  'paragraph_function',
  'author_purpose',
  'attitude_tone',
  'inference_general',
  'example_function',
  'adjective_summary',
  'abstract_phrase_summary',
])
const READING_SURFACE_SCOPES = new Set(['word_or_phrase', 'sentence', 'paragraph', 'passage', 'example'])
const READING_ANSWERING_MOVES = new Set([
  'direct_locating',
  'option_backtracking',
  'context_guessing',
  'coverage_test',
  'function_to_argument',
  'rhetorical_method_identification',
  'minimal_inference',
  'description_to_adjective',
  'multi_point_matching',
  'elimination',
])
const READING_LOAD_LEVELS = new Set(['low', 'medium', 'high'])
const READING_REASONING_LEVELS = new Set(['low', 'medium', 'high', 'very_high'])
const READING_INFO_SPAN_LEVELS = new Set(['single_point', 'multi_point', 'cross_paragraph'])
const READING_INFO_SPAN_SOURCES = new Set(['derived_from_t_card', 'overridden_by_evidence'])
const READING_BLOCKER_POSITIONS = new Set([
  'answer_path',
  'correct_option',
  'distractor',
  'question_stem',
  'passage_background',
])
const READING_BLOCKER_ROLES = new Set(['semantic_bridge', 'distractor_trap', 'answer_key', 'context_clue'])
const READING_MAIN_BLOCKERS = new Set(['vocab', 'syntax', 'distractor', 'abstraction', 'info_span', 'topic'])
const READING_FINAL_LABELS = new Set(['low', 'medium', 'high'])
const READING_T_CARD_SCORE_FLOORS = {
  T1: 1,
  T2: 2,
  T3: 3,
  T4: 3,
  T5: 4,
  T6: 4,
  T7: 4,
  T8: 4,
  T9: 4,
  T10: 7,
}

function readingFinalLabelFromScore(score) {
  if (!score) return ''
  return score <= 3 ? 'low' : score <= 6 ? 'medium' : 'high'
}

function readingScoreFloorForCard(cardId) {
  return READING_T_CARD_SCORE_FLOORS[normalizeSynonymCardId(cardId)] || 0
}

function normalizeEnumString(value, allowed, fallback = '') {
  const normalized = optionalString(value).toLowerCase().replace(/[\s-]+/g, '_')
  return allowed.has(normalized) ? normalized : fallback
}

function normalizeEnumArray(values, allowed) {
  const result = []
  const seen = new Set()
  ;(Array.isArray(values) ? values : [values]).forEach((value) => {
    const normalized = normalizeEnumString(value, allowed)
    if (!normalized || seen.has(normalized)) return
    seen.add(normalized)
    result.push(normalized)
  })
  return result
}

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function readingQuestionStemText(item, context = {}) {
  return cleanDraftText([
    context?.originalQuestion?.stem,
    item?.stem,
    item?.question,
    item?.questionText,
    item?.questionStem,
    item?.questionTranslation,
  ].filter(Boolean).join(' '))
}

function isEntityPurposeMentionStem(stemText) {
  return /\bpurpose\s+of\s+(?:the\s+)?(?:laws?|rules?|polic(?:y|ies)|measures?|programs?|projects?|strateg(?:y|ies))\s+(?:mentioned|listed|discussed)\b/i.test(stemText)
}

function isExampleFunctionStem(stemText) {
  if (isEntityPurposeMentionStem(stemText)) return false
  return /\b(?:mention(?:s|ed|ing)?|discuss(?:es|ed|ing)?|illustrate|show|demonstrate|prove|cite|cited|refer(?:red)? to|list(?:s|ed|ing)?|example)\b/i.test(stemText) ||
    /提及|提到|引用|举例|例子|为了说明|用来说明/.test(stemText)
}

function inferCoverageScopeFromStem(stemText) {
  const text = String(stemText || '')
  if (/\b(?:paragraph|para\.)\b|段/.test(text)) return 'paragraph'
  if (/\b(?:title|text|passage|article)\b|全文|文章|标题/.test(text)) return 'passage'
  return 'paragraph'
}

function readingCorrectOptionTextFromContext(item, context = {}) {
  const answer = normalizeAnswerValue(item?.answer || context?.originalQuestion?.answer).toUpperCase()
  const answerLabel = answer.match(/[A-G]/)?.[0] || ''
  const options = Array.isArray(context?.originalQuestion?.options) ? context.originalQuestion.options : []
  const option = answerLabel
    ? options.find((entry) => optionalString(entry.label).toUpperCase() === answerLabel)
    : null
  return (
    optionalString(option?.content) ||
    optionalString(option?.text) ||
    optionalString(item?.synonymDifficulty?.optionExpression || item?.synonymDifficulty?.option_expression)
  )
}

function optionLooksLikeAdjectiveSummary(optionText) {
  const text = optionalString(optionText)
    .replace(/^[A-G]\s*[.、)]\s*/i, '')
    .replace(/[.。]+$/g, '')
    .trim()
  if (!text) return false
  if (/^(?:to|for|by|because|why|how|what|when|where|who|the|a|an)\b/i.test(text)) return false
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length < 1 || words.length > 3) return false
  return words.every((word) => /^[A-Za-z][A-Za-z-]*$/.test(word))
}

function isAdjectiveSummaryStem(stemText, optionText) {
  if (!optionLooksLikeAdjectiveSummary(optionText)) return false
  return (
    /\b(?:best\s+describes?|describe(?:s|d)?|what\s+does\s+.+?\s+think\s+of|how\s+does\s+.+?\s+(?:view|feel\s+about|see))\b/i.test(stemText) ||
    /最能描述|如何评价|怎么看|认为.*怎么样/.test(stemText)
  )
}

function normalizeReadingSurfaceQuestion(item, context = {}) {
  const source = objectValue(item?.surfaceQuestion || item?.surface_question)
  const type = normalizeEnumString(
    source.type || source.questionType || item?.surfaceQuestionType || item?.surface_question_type,
    READING_SURFACE_QUESTION_TYPES,
  )
  let answeringMove = normalizeEnumString(
    source.answeringMove || source.answering_move || item?.answeringMove || item?.answering_move,
    READING_ANSWERING_MOVES,
  )
  let scope = normalizeEnumString(source.scope || item?.questionScope || item?.question_scope, READING_SURFACE_SCOPES)
  let reason = optionalString(source.reason || source.analysis || item?.surfaceQuestionReason || item?.surface_question_reason)
  let normalizedType = type
  const stemText = readingQuestionStemText(item, context)
  const correctOptionText = readingCorrectOptionTextFromContext(item, context)
  const asksExampleFunction = isExampleFunctionStem(stemText)
  const asksAdjectiveSummary = isAdjectiveSummaryStem(stemText, correctOptionText)
  const asksPersonPurpose =
    /\b(?:trying to do|try to do|tried to do|intend(?:ed)? to|aim(?:ed)? to|goal|purpose|want(?:ed)? to|seek(?:ing)? to|call(?:ed)? on)\b/i.test(stemText) ||
    /为什么|为何|目的|试图|想要|旨在/.test(stemText)

  if (asksAdjectiveSummary && normalizedType !== 'adjective_summary') {
    normalizedType = 'adjective_summary'
    answeringMove = 'description_to_adjective'
    reason = reason
      ? `${reason}（后端校正：题干要求用一两个形容词/评价词压缩原文描述，属于 adjective_summary。）`
      : '后端校正：题干要求用一两个形容词/评价词压缩原文描述，属于 adjective_summary。'
  }
  if (['why_did', 'single_detail_normal'].includes(type) && asksExampleFunction) {
    normalizedType = 'example_function'
    scope = 'example'
    answeringMove = answeringMove === 'direct_locating' ? 'function_to_argument' : answeringMove
    reason = reason
      ? `${reason}（后端校正：题干问作者提及/引用某例子的功能，属于例子功能。）`
      : '后端校正：题干问作者提及/引用某例子的功能，属于例子功能。'
  }
  if (type === 'example_function' && asksPersonPurpose && !asksExampleFunction) {
    normalizedType = 'why_did'
    scope = scope === 'example' ? 'sentence' : scope
    answeringMove = answeringMove === 'function_to_argument' ? 'direct_locating' : answeringMove
    reason = reason
      ? `${reason}（后端校正：题干问人物/群体目的，不是例子功能。）`
      : '后端校正：题干问人物/群体目的，不是作者提及例子的功能。'
  }
  if (normalizedType === 'single_detail_normal' && answeringMove === 'coverage_test') {
    const coverageScope = scope || inferCoverageScopeFromStem(stemText)
    if (coverageScope === 'paragraph') {
      normalizedType = 'paragraph_main_idea'
      scope = coverageScope
      reason = reason
        ? `${reason}（后端校正：coverage_test + paragraph 属于段落主旨/归纳，不是普通单细节。）`
        : '后端校正：coverage_test + paragraph 属于段落主旨/归纳，不是普通单细节。'
    } else if (coverageScope === 'passage') {
      normalizedType = 'passage_main_idea'
      scope = coverageScope
      reason = reason
        ? `${reason}（后端校正：coverage_test + passage 属于文章主旨/归纳，不是普通单细节。）`
        : '后端校正：coverage_test + passage 属于文章主旨/归纳，不是普通单细节。'
    }
  }
  if (
    normalizedType === 'passage_main_idea' &&
    /\b(?:author'?s?\s+purpose|purpose\s+in\s+writing|why\s+(?:does|did)\s+the\s+author\s+write)\b/i.test(stemText)
  ) {
    normalizedType = 'author_purpose'
    scope = scope || 'passage'
    answeringMove = answeringMove || 'coverage_test'
    reason = reason
      ? `${reason}（后端校正：题干问作者写作目的，surfaceQuestion.type 应为 author_purpose。）`
      : '后端校正：题干问作者写作目的，surfaceQuestion.type 应为 author_purpose。'
  }
  if (normalizedType === 'why_did' && isWhyDifficultStem(stemText)) {
    answeringMove = 'minimal_inference'
    reason = reason
      ? `${reason}（后端校正：why difficult/hard/challenging 题通常要求推出底层原因，做题动作为 minimal_inference。）`
      : '后端校正：why difficult/hard/challenging 题通常要求推出底层原因，做题动作为 minimal_inference。'
  }
  const rawSynonymSource = objectValue(item?.synonymDifficulty || item?.synonym_difficulty)
  const rawSynonymCardId = normalizeSynonymCardId(rawSynonymSource.cardId || rawSynonymSource.card_id || rawSynonymSource.typeId || rawSynonymSource.type_id || rawSynonymSource.type)
  if (normalizedType === 'multi_detail_learn_from' && ['T1', 'T2', 'T3'].includes(rawSynonymCardId)) {
    normalizedType = 'single_detail_normal'
    reason = reason
      ? `${reason}（后端校正：证据与T卡均为单点，不能标多细节回文验证。）`
      : '后端校正：证据与T卡均为单点，不能标多细节回文验证。'
  }
  if (!type && !answeringMove && !scope && !reason) return null

  return {
    type: normalizedType,
    scope,
    answeringMove,
    reason,
  }
}

function normalizeReadingDifficultyProfile(item, context = {}) {
  const source = objectValue(item?.difficultyProfile || item?.difficulty_profile)
  if (Object.keys(source).length === 0) return null
  const surfaceQuestion = context?.surfaceQuestion || normalizeReadingSurfaceQuestion(item, context)
  const isWordMeaningQuestion = surfaceQuestion?.type === 'word_meaning'
  const synonymCardId =
    context?.synonymDifficulty?.cardId ||
    normalizeSynonymCardId(item?.synonymDifficulty?.cardId || item?.synonymDifficulty?.typeId || item?.synonymDifficulty?.type)
  const scoreFloor = readingScoreFloorForCard(synonymCardId)
  const hasBoundaryFlag = (context?.synonymDifficulty?.boundaryFlags || []).length > 0

  const vocabLoadRaw = objectValue(source.vocabLoad || source.vocab_load)
  const densityRaw = objectValue(vocabLoadRaw.starWordDensity || vocabLoadRaw.star_word_density)
  const blockerWordsRaw = Array.isArray(vocabLoadRaw.blockerWords || vocabLoadRaw.blocker_words)
    ? (vocabLoadRaw.blockerWords || vocabLoadRaw.blocker_words)
        .map((entry) => {
          if (!entry || typeof entry !== 'object') return null
          const word = optionalString(entry.word || entry.phrase)
          if (!word) return null
          return {
            word,
            position: normalizeEnumString(entry.position, READING_BLOCKER_POSITIONS),
            role: normalizeEnumString(entry.role, READING_BLOCKER_ROLES),
            reason: optionalString(entry.reason || entry.analysis),
          }
        })
        .filter(Boolean)
    : []
  const blockerWords = isWordMeaningQuestion
    ? blockerWordsRaw.filter((word) => word.position !== 'question_stem')
    : blockerWordsRaw

  const syntaxLoadRaw = objectValue(source.syntaxLoad || source.syntax_load)
  const infoSpanRaw = objectValue(source.infoSpan || source.info_span)
  const rawInfoSpan = typeof (source.infoSpan || source.info_span) === 'string' ? source.infoSpan || source.info_span : ''
  const finalScoreNumber = Number(source.finalScore ?? source.final_score)
  const rawFinalScore = Number.isFinite(finalScoreNumber)
    ? Math.max(1, Math.min(10, Math.round(finalScoreNumber)))
    : 0
  const boundaryFloor = hasBoundaryFlag && scoreFloor > 0 ? Math.min(10, scoreFloor + 1) : scoreFloor
  const finalScore = Math.max(rawFinalScore, boundaryFloor)
  const finalLabel = readingFinalLabelFromScore(finalScore)
  const rawMainBlockers = normalizeEnumArray(source.mainBlockers || source.main_blockers || [], READING_MAIN_BLOCKERS)
  const rawVocabLevel = normalizeEnumString(vocabLoadRaw.level, READING_LOAD_LEVELS)
  const hasSemanticBridge = blockerWords.some((word) => word.role === 'semantic_bridge')
  const vocabLevel = blockerWords.length === 0 ? 'low' : hasSemanticBridge && rawVocabLevel === 'low' ? 'medium' : rawVocabLevel
  const mainBlockers = vocabLevel === 'low' ? rawMainBlockers.filter((blocker) => blocker !== 'vocab') : rawMainBlockers

  return {
    vocabLoad: {
      starWordDensity: {
        passage: normalizeEnumString(densityRaw.passage, READING_LOAD_LEVELS),
        answerPath: normalizeEnumString(densityRaw.answerPath || densityRaw.answer_path, READING_LOAD_LEVELS),
        options: normalizeEnumString(densityRaw.options, READING_LOAD_LEVELS),
      },
      blockerWords,
      level: vocabLevel,
    },
    syntaxLoad: {
      level: normalizeEnumString(syntaxLoadRaw.level, READING_LOAD_LEVELS),
      evidenceSentence: optionalString(syntaxLoadRaw.evidenceSentence || syntaxLoadRaw.evidence_sentence),
      reason: optionalString(syntaxLoadRaw.reason || syntaxLoadRaw.analysis),
    },
    infoSpan: {
      level: normalizeEnumString(infoSpanRaw.level || rawInfoSpan, READING_INFO_SPAN_LEVELS),
      source: normalizeEnumString(infoSpanRaw.source, READING_INFO_SPAN_SOURCES),
      evidence: optionalString(infoSpanRaw.evidence || infoSpanRaw.reason),
    },
    reasoningAbstraction: normalizeEnumString(
      source.reasoningAbstraction || source.reasoning_abstraction,
      READING_REASONING_LEVELS,
    ),
    distractorStrength: normalizeEnumString(
      source.distractorStrength || source.distractor_strength,
      READING_LOAD_LEVELS,
    ),
    topicAbstractness: normalizeEnumString(source.topicAbstractness || source.topic_abstractness, READING_LOAD_LEVELS),
    mainBlockers,
    finalScore,
    finalLabel,
    reason: optionalString(source.reason || source.analysis),
  }
}

function isEllipticalQuestionTitle(optionExpression) {
  const text = optionalString(optionExpression)
  if (!text || !/\?$/.test(text)) return false
  const match = text.match(/^(?:why|what|where|who|when|how)\b\s+(.+)\?$/i)
  if (!match) return false
  return !/\b(?:am|is|are|was|were|be|being|been|do|does|did|can|could|will|would|should|may|might|must|have|has|had)\b/i.test(match[1])
}

function hasCrossSentenceEvidence(sourceExpression) {
  const text = optionalString(sourceExpression)
  if (!text) return false
  if (/…|\.\.\.|[；;]/.test(text)) return true
  const sentenceEnds = text.match(/[.!?。！？](?:\s|$|["'”’])/g) || []
  return sentenceEnds.length >= 2
}

function hasMultiPointSelfDescription(...values) {
  const text = values.map((value) => optionalString(value)).filter(Boolean).join(' ')
  return /(?:多句|多个|两句|两处|多处|multi(?:ple)?|two|several)/i.test(text)
}

function isCausalReadingStem(stemText) {
  return /\b(?:what\s+(?:has\s+)?led\s+to|what\s+(?:has\s+)?caused|why\b|reason|resulted?\s+in|bring(?:s|ing)?\s+about)\b/i.test(stemText) ||
    /为什么|为何|原因|导致|造成|引起/.test(stemText)
}

function optionAddsMissingJudgment(sourceExpression, optionExpression) {
  const source = optionalString(sourceExpression).toLowerCase()
  const option = optionalString(optionExpression).toLowerCase()
  const judgmentWords = ['improper', 'wrong', 'flawed', 'poor', 'incorrect', 'inadequate', 'misleading']
  return judgmentWords.some((word) => option.includes(word) && !source.includes(word))
}

function isWhyDifficultStem(stemText) {
  const text = optionalString(stemText)
  return /\bwhy\b.+\b(?:difficult|hard|challenging|challenge|tricky|complicated)\b/i.test(text) ||
    /为什么.+(?:难|困难|不容易|有挑战)/.test(text)
}

function optionAddsUnderlyingCause(sourceExpression, optionExpression) {
  const source = optionalString(sourceExpression).toLowerCase()
  const option = optionalString(optionExpression).toLowerCase()
  const causePatterns = [
    /\brooted in\b/,
    /\bdeep(?:ly)?\s+(?:rooted|held)\b/,
    /\bfundamental\b/,
    /\binherent\b/,
    /\bunderlying\b/,
    /\btendency\b/,
  ]
  return causePatterns.some((pattern) => pattern.test(option) && !pattern.test(source))
}

const READING_SURFACE_CARD_OVERRIDES = {
  paragraph_main_idea: 'T5',
  passage_main_idea: 'T5',
  author_purpose: 'T5',
  inference_general: 'T6',
  example_function: 'T7',
  attitude_tone: 'T9',
}

function normalizeReadingSynonymDifficulty(item, context = {}) {
  if (!item || typeof item !== 'object') return null

  const knowledge = loadSynonymDifficultyKnowledge()
  const rawCardId = normalizeSynonymCardId(item.cardId || item.typeId || item.type)
  const sourceExpression = optionalString(item.sourceExpression || item.source_expression)
  const optionExpression = optionalString(item.optionExpression || item.option_expression)
  const rawReason = optionalString(item.reason || item.reasoning || item.analysis)
  const rawBoundaryCheck = optionalString(item.boundaryCheck || item.boundary_check)
  const stemText = readingQuestionStemText(item, context)
  const isWordMeaningQuestion = context?.surfaceQuestion?.type === 'word_meaning'
  const isAbstractPhraseSummary = context?.surfaceQuestion?.type === 'abstract_phrase_summary'
  const isWritingTechniqueQuestion = ['writing_technique', 'paragraph_function'].includes(context?.surfaceQuestion?.type)
  const isAdjectiveSummary = context?.surfaceQuestion?.type === 'adjective_summary'
  const isEntityPurposeMention = isEntityPurposeMentionStem(stemText)
  const isAbstractTitleCompression =
    context?.surfaceQuestion?.type === 'passage_main_idea' &&
    context?.surfaceQuestion?.answeringMove === 'coverage_test' &&
    isEllipticalQuestionTitle(optionExpression)
  const forcedWordMeaningCard = isWordMeaningQuestion && rawCardId !== 'T1'
  const forcedAbstractPhraseCard = isAbstractPhraseSummary && rawCardId !== 'T10'
  const forcedAbstractTitleCard = isAbstractTitleCompression && rawCardId !== 'T10'
  const forcedWritingTechniqueCard = isWritingTechniqueQuestion && rawCardId !== 'T8'
  const forcedAdjectiveSummaryCard = isAdjectiveSummary && !['T6', 'T10'].includes(rawCardId)
  const forcedWhyDidInferenceCard =
    context?.surfaceQuestion?.type === 'why_did' &&
    rawCardId === 'T2' &&
    hasCrossSentenceEvidence(sourceExpression)
  const forcedCausalJudgmentInferenceCard =
    rawCardId === 'T2' &&
    isCausalReadingStem(stemText) &&
    optionAddsMissingJudgment(sourceExpression, optionExpression)
  const forcedWhyDifficultInferenceCard =
    rawCardId === 'T2' &&
    isWhyDifficultStem(stemText) &&
    optionAddsUnderlyingCause(sourceExpression, optionExpression)
  const forcedMultiPointSelfDescribedCard =
    rawCardId === 'T2' &&
    hasCrossSentenceEvidence(sourceExpression) &&
    hasMultiPointSelfDescription(rawReason, rawBoundaryCheck)
  const forcedEntityPurposeMentionCard = isEntityPurposeMention && rawCardId === 'T7'
  const surfaceOverrideCardId = READING_SURFACE_CARD_OVERRIDES[context?.surfaceQuestion?.type] || ''
  const forcedSurfaceCard = Boolean(surfaceOverrideCardId) && !isAbstractTitleCompression && rawCardId !== surfaceOverrideCardId
  const cardId = forcedWordMeaningCard
    ? 'T3'
    : forcedAbstractPhraseCard
      ? 'T10'
      : forcedAbstractTitleCard
        ? 'T10'
        : forcedWritingTechniqueCard
          ? 'T8'
          : forcedAdjectiveSummaryCard
            ? 'T10'
            : forcedWhyDidInferenceCard
              ? 'T6'
              : forcedCausalJudgmentInferenceCard
                ? 'T6'
                : forcedWhyDifficultInferenceCard
                  ? 'T6'
                  : forcedMultiPointSelfDescribedCard
                    ? 'T4'
                    : forcedEntityPurposeMentionCard
                      ? 'T2'
                      : forcedSurfaceCard
                        ? surfaceOverrideCardId
                        : rawCardId
  const card = knowledge.cardMap.get(cardId)
  if (!card) return null
  const shouldFlagWhyDifficultInference =
    cardId === 'T6' &&
    isWhyDifficultStem(stemText) &&
    optionAddsUnderlyingCause(sourceExpression, optionExpression)
  const shouldFlagExampleFunctionBoundary =
    context?.surfaceQuestion?.type === 'example_function' &&
    cardId === 'T7'
  const shouldFlagWritingTechniqueBoundary =
    isWritingTechniqueQuestion &&
    cardId === 'T8'
  const shouldFlagMainIdeaBoundary =
    ['paragraph_main_idea', 'passage_main_idea', 'author_purpose'].includes(context?.surfaceQuestion?.type) &&
    ['T5', 'T10'].includes(cardId)

  const confidence = normalizeSynonymConfidence(item.confidence ?? item.score ?? item.conf, 0.82)
  const reviewThreshold = ['T6', 'T8'].includes(cardId) ? 0.78 : 0.72
  const forcedCard =
    forcedWordMeaningCard ||
    forcedAbstractPhraseCard ||
    forcedAbstractTitleCard ||
    forcedWritingTechniqueCard ||
    forcedAdjectiveSummaryCard ||
    forcedWhyDidInferenceCard ||
    forcedCausalJudgmentInferenceCard ||
    forcedWhyDifficultInferenceCard ||
    forcedMultiPointSelfDescribedCard ||
    forcedEntityPurposeMentionCard ||
    forcedSurfaceCard
  const reviewNeeded =
    normalizeSynonymBoolean(item.reviewNeeded ?? item.review_needed ?? item.needsReview) ||
    forcedWordMeaningCard ||
    isAbstractPhraseSummary ||
    forcedAbstractTitleCard ||
    forcedWritingTechniqueCard ||
    isAdjectiveSummary ||
    forcedWhyDidInferenceCard ||
    forcedCausalJudgmentInferenceCard ||
    forcedWhyDifficultInferenceCard ||
    forcedMultiPointSelfDescribedCard ||
    forcedEntityPurposeMentionCard ||
    forcedSurfaceCard ||
    ['T9', 'T10'].includes(cardId) ||
    confidence < reviewThreshold

  const boundaryFlags = uniqueSynonymFlags(item.boundaryFlags || item.boundary_flags || [])
  const normalizedBoundaryFlags = forcedWordMeaningCard
    ? uniqueSynonymFlags([
        ...boundaryFlags.filter((flag) => !['T1_T2', 'T2_T4', 'T2_T6'].includes(flag)),
        'T3_T6',
      ])
    : forcedAbstractPhraseCard
      ? uniqueSynonymFlags([
          ...boundaryFlags.filter((flag) => !['T1_T2', 'T2_T4', 'T2_T6', 'T3_T6', 'T4_T6', 'T6_T9'].includes(flag)),
          'T6_T10',
        ])
      : forcedAbstractTitleCard
        ? uniqueSynonymFlags([
            ...boundaryFlags.filter((flag) => !['T1_T2', 'T2_T4', 'T2_T6', 'T3_T6', 'T4_T6', 'T6_T9', 'T7_T8'].includes(flag)),
            'T5_T10',
          ])
        : forcedWritingTechniqueCard || shouldFlagWritingTechniqueBoundary
        ? uniqueSynonymFlags([
            ...boundaryFlags.filter((flag) => !['T1_T2', 'T2_T4', 'T2_T6', 'T3_T6', 'T4_T6', 'T5_T10', 'T6_T9'].includes(flag)),
            'T7_T8',
          ])
        : isAdjectiveSummary
          ? uniqueSynonymFlags([
              ...boundaryFlags.filter((flag) => !['T1_T2', 'T2_T4', 'T2_T6', 'T3_T6', 'T4_T6', 'T5_T10', 'T6_T9'].includes(flag)),
              'T6_T10',
            ])
          : forcedWhyDidInferenceCard
            ? uniqueSynonymFlags([...boundaryFlags, 'T2_T6'])
            : forcedCausalJudgmentInferenceCard
            ? uniqueSynonymFlags([...boundaryFlags, 'T2_T6'])
            : forcedWhyDifficultInferenceCard
              ? uniqueSynonymFlags([...boundaryFlags, 'T2_T6'])
              : shouldFlagWhyDifficultInference
                ? uniqueSynonymFlags([...boundaryFlags, 'T2_T6'])
                : shouldFlagExampleFunctionBoundary
                  ? uniqueSynonymFlags([...boundaryFlags, 'T7_T8'])
                  : shouldFlagMainIdeaBoundary
                    ? uniqueSynonymFlags([...boundaryFlags, 'T5_T10'])
                    : forcedMultiPointSelfDescribedCard
                      ? uniqueSynonymFlags([...boundaryFlags, 'T2_T4'])
                      : forcedEntityPurposeMentionCard
                        ? uniqueSynonymFlags(boundaryFlags.filter((flag) => flag !== 'T7_T8'))
                        : boundaryFlags
  const reason = forcedWordMeaningCard
    ? `单点类 T3：题干要求推测词/短语在语境中的含义，目标是确定词义本身，因此是${card.name}。`
    : forcedAbstractPhraseCard
      ? `抽象拓展类 T10：题面要求把具体描述压缩成抽象概念短语，正确选项属于抽象标签，因此是${card.name}。`
      : forcedAbstractTitleCard
        ? `抽象拓展类 T10：题干虽是标题/主旨题，但正确标题是省略式疑问标题，需要将全文具体批评压缩为抽象标题，因此是${card.name}。`
        : forcedWritingTechniqueCard
          ? `关联类 T8：题干要求判断作者如何展开段落或呈现问题，目标是识别段落修辞/写作手法功能，因此是${card.name}。`
          : forcedAdjectiveSummaryCard
          ? `抽象拓展类 T10：题干要求把原文描述压缩成形容词评价标签，正确选项不是单句同义替换，而是性质概括，因此是${card.name}。`
          : forcedWhyDidInferenceCard
            ? `关联类 T6：题干问原因/目的，但答案需要跨句情感、因果或目的推断，不能只按单句同义改写处理，因此是${card.name}。`
            : forcedCausalJudgmentInferenceCard
              ? `关联类 T6：题干问原因/结果，正确选项加入了原文未直接给出的评价性判断，需要从原文原因线索推出，因此是${card.name}。`
              : forcedWhyDifficultInferenceCard
                ? `关联类 T6：题干问为什么困难，正确选项概括的是原文现象背后的底层原因，而非单句同义替换，因此是${card.name}。`
                : forcedMultiPointSelfDescribedCard
                  ? `多点类 T4：原文证据跨句，且解析自身说明存在多个动作/信息点，正确选项需要拼合这些信息后概括，因此是${card.name}。`
                  : forcedEntityPurposeMentionCard
                    ? `单点类 T2：题干问法律/政策本身的目的，原文单句给出其保护对象或用途，选项只是同义概括，不是作者举例意图，因此是${card.name}。`
                    : forcedSurfaceCard
                      ? `${card.soloLevel || ''} ${cardId}：题型画像为${context?.surfaceQuestion?.type}，后端按题型轴将T卡校正为${card.name || cardId}。`.trim()
                      : rawReason
  const boundaryCheck = forcedWordMeaningCard
    ? '不是T2单句同义改写：猜词题的任务不是识别普通同义替换，而是根据上下文确定目标词在本文中的语境义。'
    : forcedAbstractPhraseCard
      ? '不是T6隐含逻辑推断：本题重点不是推出一个事实性结论，而是将具体描述概括为抽象概念标签。'
      : forcedAbstractTitleCard
        ? '不是普通T5主旨覆盖：本题正确标题不是直接概括文章讲什么，而是用省略式疑问将全文批评压缩成抽象标题。'
        : forcedWritingTechniqueCard
          ? '不是T2单句同义改写：正确选项即使是简短手法标签，也是在判断段落展开方式或修辞功能，而不是把某个单句换词表达。'
          : forcedAdjectiveSummaryCard
            ? '不是T2单句同义改写：形容词压缩题要求从具体描述概括性质或评价，学生要完成抽象标签匹配，而不是识别原文单句换词。'
            : forcedWhyDidInferenceCard
              ? '不是T2单句同义改写：答案不是单句直接换词，而是从跨句线索推出人物目的或原因。'
              : forcedCausalJudgmentInferenceCard
                ? '不是T2单句同义改写：原文只给出原因线索，选项中的评价性判断不是原文原词或直接同义词。'
                : forcedWhyDifficultInferenceCard
                  ? '不是T2单句同义改写：原文没有直接说出这个底层原因，而是需要从现象或例子推出为什么困难。'
                  : forcedMultiPointSelfDescribedCard
                    ? '不是T2单句同义改写：T2只适用于单句单点换词；跨句多个动作/信息点压缩成选项应判T4。'
                    : forcedEntityPurposeMentionCard
                      ? '不是T7举例引用意图：mentioned 在这里只是修饰 laws/policies，题干问法律/政策目的，不是作者为什么提及该例子。'
                      : forcedSurfaceCard
                        ? '后端一致性校正：surfaceQuestion.type 已经确定题型轴，synonymDifficulty.cardId 必须与题型轴一致。'
                        : rawBoundaryCheck

  return {
    cardId,
    name: forcedCard
      ? card.name || cardId
      : optionalString(item.name) || card.name || cardId,
    soloLevel: forcedCard
      ? card.soloLevel || ''
      : optionalString(item.soloLevel || item.solo_level) || card.soloLevel || '',
    higherOrderThinking: forcedCard
      ? card.higherOrderThinking || ''
      : optionalString(item.higherOrderThinking || item.higher_order_thinking) || card.higherOrderThinking || '',
    difficultyDefault: Number(card.difficultyDefault || item.difficultyDefault || item.difficulty || 0) || 0,
    confidence,
    sourceExpression,
    optionExpression,
    reason,
    boundaryCheck,
    studentBlocker: forcedCard
      ? card.studentBlocker || ''
      : optionalString(item.studentBlocker || item.student_blocker) || card.studentBlocker || '',
    teachingMove: forcedCard
      ? card.teachingMove || ''
      : optionalString(item.teachingMove || item.teaching_move) || card.teachingMove || '',
    reviewNeeded,
    boundaryFlags: normalizedBoundaryFlags,
    evidenceSource: 'deepseek_reading_parse',
  }
}

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

function readingDistractorTypeLabel(type) {
  const normalized = optionalString(type)
  if (normalized === '0') return '正确项'
  if (normalized === '1') return '细节词误导'
  if (normalized === '2') return '无中生有'
  if (normalized === '3') return '常识干扰'
  return normalized
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

function formatQuestionForReadingParse(question) {
  const optionsText = question.options?.length
    ? question.options
        .map((option) => `${option.label}. ${option.content}`)
        .join('\n')
    : '（无）'

  return [
    `题号：${question.questionNo}`,
    `题型：${question.questionType || '阅读理解'}`,
    `题干：${question.stem}`,
    `选项：\n${optionsText}`,
    question.answer ? `当前答案：${question.answer}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

async function callDeepSeekParseReading(context) {
  const questionSummaries = context.questions
    .map((question, index) => `【题目${index + 1}】\n${formatQuestionForReadingParse(question)}`)
    .join('\n\n')

  const selectedModel = context.model
  const messages = [
    {
      role: 'system',
      content: `${DEEPSEEK_READING_PARSE_PROMPT}

同义替换难度知识卡（必须只使用这些类型，不要自创分类）：
${formatSynonymDifficultyKnowledgeForReadingPrompt()}`,
    },
    {
      role: 'user',
      content: `请按上述要求处理以下题组。\n\n篇章：${context.passageTitle}\n\n原文（节选）：\n${context.passageText}\n\n题目：\n${questionSummaries}`,
    },
  ]

  const requestStartAt = Date.now()
  const parsedResult = await callDeepSeekWithFallback({
    apiKey: context.apiKey,
    model: selectedModel,
    expectedResponseSchema: 'reading_parse',
    messages,
    temperature: 0.2,
    maxTokens: 8192,
    thinkingMode: context.thinkingMode,
    responseFormat: context.thinkingMode ? undefined : 'json_object',
  })

  const parsedPayload = parsedResult.parsed
  if (!parsedPayload || typeof parsedPayload !== 'object') {
    throw new Error('DeepSeek 返回结果不符合预期 JSON。')
  }

  const rawQuestions = Array.isArray(parsedPayload.questions) ? parsedPayload.questions : []
  const originalQuestionByNo = new Map(
    (context.questions || []).map((question) => [String(question.questionNo || '').trim(), question]),
  )
  const questions = rawQuestions
    .map((item) =>
      normalizeReadingParseQuestion(item, {
        originalQuestion: originalQuestionByNo.get(optionalString(item?.questionNo)),
      }),
    )
    .filter(Boolean)

  const articleAnalysis = parsedPayload.articleAnalysis
    ? normalizeReadingParseArticle(parsedPayload.articleAnalysis)
    : null
  const passageSummary =
    optionalString(parsedPayload.passageSummary || parsedPayload.passage_summary) ||
    optionalString(articleAnalysis?.summary)

  if (questions.length === 0) {
    throw new Error('DeepSeek 未返回有效题目解析。')
  }

  return {
    questions,
    articleAnalysis,
    passageSummary,
    requestLatencyMs: parsedResult.latencyMs,
    totalLatencyMs: elapsedMs(requestStartAt),
    rawTextLength: parsedResult.rawText.length,
  }
}

async function parseReadingByQuestionGroup(questionGroupId, apiKey, model, parseRequestId, thinkingMode = false) {
  const keySource = describeKeySource(apiKey)
  const key = String(apiKey || DEEPSEEK_API_KEY).trim()
  if (!key) {
    throw new Error('未设置 API Key。请在右上角输入 DeepSeek Key 或设环境变量 DEEPSEEK_API_KEY。')
  }

  const selectedModel = normalizeDeepSeekModel(model)
  const resolvedParseRequestId = parseRequestId || randomUUID()
  const parseStartedAt = Date.now()

  const detail = getQuestionGroupDetail(questionGroupId)
  if (!detail) {
    throw new Error('题组未找到。')
  }

  const questionsForParse = detail.questions
    .map((question) => ({
      questionNo: question.questionNo,
      questionType: question.questionType,
      stem: question.stem,
      options: question.options,
      answer: question.answer,
      explanation: question.explanation,
    }))
    .filter((question) => question.stem)

  if (questionsForParse.length === 0) {
    throw new Error('该题组缺少可解析题干。')
  }

  console.log(
    `AI reading parse trace=${resolvedParseRequestId} group=${questionGroupId} model=${selectedModel} thinking=${
      thinkingMode ? 'on' : 'off'
    } keySource=${keySource.source} keyMask=${maskApiKey(key)} questionCount=${questionsForParse.length}`,
  )

  const parseResult = await callDeepSeekParseReading({
    apiKey: key,
    model: selectedModel,
    passageTitle: detail.passage.title,
    passageText: detail.passage.materialText?.slice(0, 4200) || '',
    questions: questionsForParse,
    thinkingMode,
  })

  const parsedByNo = new Map(parseResult.questions.map((item) => [item.questionNo, item]))
  const questionNoList = questionsForParse.map((question) => String(question.questionNo))

  return {
    questionGroupId,
    title: detail.title,
    questionCount: questionsForParse.length,
    parsedCount: parseResult.questions.length,
    matchedCount: questionNoList.filter((questionNo) => parsedByNo.has(questionNo)).length,
    unmatchedQuestionNos: questionNoList.filter((questionNo) => !parsedByNo.has(questionNo)),
    passageSummary: parseResult.passageSummary || optionalString(parseResult.articleAnalysis?.summary),
    articleAnalysis: parseResult.articleAnalysis || null,
    keySource: keySource.source,
    keyFingerprint: maskApiKey(key),
    keyMask: maskApiKey(key),
    requestId: resolvedParseRequestId,
    requestMs: parseResult.requestLatencyMs,
    model: selectedModel,
    thinkingMode,
    provider: keySource.provider,
    totalLatencyMs: elapsedMs(parseStartedAt),
    questions: parseResult.questions,
  }
}

let synonymDifficultyKnowledgeCache = null

function loadSynonymDifficultyKnowledge() {
  if (synonymDifficultyKnowledgeCache) return synonymDifficultyKnowledgeCache
  const payload = JSON.parse(readFileSync(SYNONYM_DIFFICULTY_KNOWLEDGE_PATH, 'utf8'))
  const cards = Array.isArray(payload.cards) ? payload.cards : []
  const cardMap = new Map(cards.map((card) => [optionalString(card.cardId).toUpperCase(), card]))
  synonymDifficultyKnowledgeCache = {
    ...payload,
    cards,
    cardMap,
    cardIds: new Set(cards.map((card) => optionalString(card.cardId).toUpperCase()).filter(Boolean)),
  }
  return synonymDifficultyKnowledgeCache
}

function normalizeSynonymCardId(value) {
  const raw = optionalString(value).toUpperCase().replace(/\s+/g, '')
  if (!raw) return ''
  const match = raw.match(/T(?:10|[1-9])/)
  return match ? match[0] : raw
}

function normalizeSynonymConfidence(value, fallback = 0.68) {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['high', '高', '较高'].includes(normalized)) return 0.85
    if (['medium', '中', '中等'].includes(normalized)) return 0.66
    if (['low', '低', '较低'].includes(normalized)) return 0.45
  }
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return clamp01(number > 1 ? number / 100 : number)
}

function normalizeSynonymBoolean(value) {
  if (value === true) return true
  if (value === false) return false
  const text = optionalString(value).toLowerCase()
  if (!text) return false
  return ['true', 'yes', '需要', '是', '1', 'review', 'review_needed'].includes(text)
}

function uniqueSynonymFlags(values) {
  const allowedFlags = new Set(['T1_T2', 'T2_T4', 'T2_T6', 'T3_T6', 'T4_T6', 'T5_T10', 'T6_T10', 'T7_T8', 'T6_T9'])
  const flags = []
  const seen = new Set()
  ;(Array.isArray(values) ? values : [values]).forEach((value) => {
    const flag = optionalString(value)
      .toUpperCase()
      .replace(/[^A-Z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '')
    if (!flag || seen.has(flag) || !allowedFlags.has(flag)) return
    seen.add(flag)
    flags.push(flag)
  })
  return flags
}

function getCorrectOptionText(question) {
  const answer = normalizeAnswerValue(question.answer).toUpperCase()
  const answerLabel = answer.match(/[A-G]/)?.[0] || ''
  const option = answerLabel
    ? question.options?.find((item) => optionalString(item.label).toUpperCase() === answerLabel)
    : null
  if (option) return `${option.label}. ${option.content}`
  return answer ? `答案：${answer}` : ''
}

function findReadingParseItem(detail, question, overrideReadingParseResult) {
  const parseResult = overrideReadingParseResult || detail.readingParseResult
  const questionNo = optionalString(question.questionNo)
  if (!parseResult || !Array.isArray(parseResult.questions) || !questionNo) return null
  return parseResult.questions.find((item) => optionalString(item.questionNo) === questionNo) || null
}

function selectSynonymMappingForQuestion(readingParseItem, answerLabel) {
  const mappings = Array.isArray(readingParseItem?.synonymMappings) ? readingParseItem.synonymMappings : []
  if (mappings.length === 0) return null
  if (!answerLabel) return mappings[0]

  const matching = mappings.find((mapping) =>
    optionalString(mapping.replacement).toUpperCase().includes(answerLabel.toUpperCase()),
  )
  return matching || mappings[0]
}

function buildSynonymSourceAndOption(detail, question, overrideReadingParseResult) {
  const readingParseItem = findReadingParseItem(detail, question, overrideReadingParseResult)
  const answerLabel = normalizeAnswerValue(question.answer).toUpperCase().match(/[A-G]/)?.[0] || ''
  const mapping = selectSynonymMappingForQuestion(readingParseItem, answerLabel)
  const correctOption = getCorrectOptionText(question)
  let evidenceSource = 'passage_excerpt'
  let sourceExpression = optionalString(mapping?.text)
  if (sourceExpression) {
    evidenceSource = 'saved_synonym_mapping'
  } else {
    sourceExpression = optionalString(readingParseItem?.answerSentence) || optionalString(readingParseItem?.locationSentence)
    if (sourceExpression) {
      evidenceSource = 'saved_reading_parse'
    } else {
      sourceExpression = optionalString(question.explanation)
      if (sourceExpression) {
        evidenceSource = 'question_explanation'
      } else {
        sourceExpression = safeTruncate(optionalString(detail.passage?.materialText), 900)
      }
    }
  }
  const optionExpression =
    optionalString(mapping?.replacement) ||
    correctOption ||
    optionalString(readingParseItem?.answer) ||
    optionalString(question.answer)

  return {
    sourceExpression,
    optionExpression,
    readingParseItem,
    correctOption,
    evidenceSource,
    evidenceWeak: evidenceSource === 'passage_excerpt' || !sourceExpression || !optionExpression,
  }
}

function addSynonymCandidate(target, cardId) {
  const normalized = normalizeSynonymCardId(cardId)
  if (!normalized || target.includes(normalized)) return
  target.push(normalized)
}

function hasLexicalMeaningSignal(stemLower) {
  if (/find out/.test(stemLower)) return false
  return (
    /underlined/.test(stemLower) ||
    /closest in meaning/.test(stemLower) ||
    /\brefer(?:s|red|ring)? to\b/.test(stemLower) ||
    /\bstand(?:s)? for\b/.test(stemLower) ||
    /what does [\s\S]{0,80}\bmean\b/.test(stemLower) ||
    /meaning of/.test(stemLower)
  )
}

function hasMentionIntentSignal(stemLower) {
  if (isEntityPurposeMentionStem(stemLower)) return false
  return (
    /\bmention(?:s|ed|ing)?\b/.test(stemLower) ||
    /\bdiscuss(?:es|ed|ing)?\b/.test(stemLower) ||
    /\blist(?:s|ed|ing)?\b/.test(stemLower) ||
    /by mentioning/.test(stemLower) ||
    /purpose in mentioning/.test(stemLower) ||
    /why does [\s\S]{0,80}\b(?:refer to|cite|give the example|use the example)\b/.test(stemLower) ||
    /提及|提到|引用|举例|例子|为了说明|用来说明/.test(stemLower)
  )
}

function hasParagraphFunctionSignal(stemLower, optionLower) {
  if (hasMentionIntentSignal(stemLower)) return false
  return (
    /function of (?:the )?(?:paragraph|section)/.test(stemLower) ||
    /purpose of (?:the )?(?:paragraph|section)/.test(stemLower) ||
    /how does (?:the )?author (?:present|develop|organize)/.test(stemLower) ||
    /by giving examples|by comparison|by analogy/.test(optionLower)
  )
}

function hasTitleOrMainIdeaSignal(stemLower) {
  return (
    /best title/.test(stemLower) ||
    /suitable title/.test(stemLower) ||
    /main idea/.test(stemLower) ||
    /mainly about/.test(stemLower) ||
    /mainly talk/.test(stemLower) ||
    /what is (?:the )?(?:text|passage|paragraph)[\s\S]{0,60}mainly/.test(stemLower) ||
    /\btitle\b/.test(stemLower)
  )
}

function hasAttitudeSignal(stemLower, optionLower) {
  return (
    /\battitude\b|\btone\b|\bview\b|\bfeel(?:s|ing)? about\b|\bthink(?:s)? of\b/.test(stemLower) ||
    /critical|objective|supportive|skeptical|sceptical|neutral|positive|negative|workable|attached/.test(optionLower)
  )
}

function hasAbstractPhraseOptionSignal(optionLower) {
  return (
    /barrier to entry|low barrier|far-reaching|unforgettable experience/.test(optionLower) ||
    /\bthe (?:value|importance|significance|nature|role|impact|effect|potential|limitation|challenge|appeal|benefit|drawback) of\b/.test(optionLower)
  )
}

function hasInferenceSignal(stemLower) {
  return (
    /\binfer\b|\bimply\b|\bimplies\b|\bsuggest(?:s|ed)?\b|\bconclude\b|\bindicate(?:s|d)?\b/.test(stemLower) ||
    /what can we learn/.test(stemLower) ||
    /\bwhy\b/.test(stemLower) ||
    /\breason\b/.test(stemLower)
  )
}

function hasMultiPointSignal(stemLower, sourceLower) {
  return (
    /how many|how much|when|where|which of the following|according to/.test(stemLower) &&
    /(?:\d|am|pm|monday|tuesday|wednesday|thursday|friday|saturday|sunday|first|second|third|condition|if|unless)/.test(sourceLower)
  )
}

function routeSynonymDifficultyCandidates({ question, sourceExpression, optionExpression }) {
  const stemLower = optionalString(question.stem).toLowerCase()
  const sourceLower = optionalString(sourceExpression).toLowerCase()
  const optionLower = optionalString(optionExpression).toLowerCase()
  const candidates = []
  const routeReasons = []
  const boundaryFlags = []
  const abstractPhraseSignal = hasAbstractPhraseOptionSignal(optionLower)

  if (hasLexicalMeaningSignal(stemLower)) {
    addSynonymCandidate(candidates, 'T3')
    addSynonymCandidate(candidates, 'T2')
    addSynonymCandidate(candidates, 'T6')
    routeReasons.push('题干含猜词或指代信号，优先走T3。')
  }

  if (hasMentionIntentSignal(stemLower)) {
    addSynonymCandidate(candidates, 'T7')
    addSynonymCandidate(candidates, 'T8')
    addSynonymCandidate(candidates, 'T6')
    boundaryFlags.push('T7_T8')
    routeReasons.push('题干含mention/举例意图信号，优先走T7。')
  } else if (hasParagraphFunctionSignal(stemLower, optionLower)) {
    addSynonymCandidate(candidates, 'T8')
    addSynonymCandidate(candidates, 'T7')
    addSynonymCandidate(candidates, 'T5')
    boundaryFlags.push('T7_T8')
    routeReasons.push('题干或选项含段落功能信号，优先走T8。')
  }

  if (hasTitleOrMainIdeaSignal(stemLower)) {
    addSynonymCandidate(candidates, 'T5')
    addSynonymCandidate(candidates, 'T10')
    addSynonymCandidate(candidates, 'T6')
    boundaryFlags.push('T5_T10')
    routeReasons.push('题干含主旨或标题信号，只在T5/T10为主的候选内判断。')
  }

  if (hasAttitudeSignal(stemLower, optionLower)) {
    addSynonymCandidate(candidates, 'T9')
    addSynonymCandidate(candidates, 'T6')
    addSynonymCandidate(candidates, 'T10')
    boundaryFlags.push('T6_T9')
    routeReasons.push('题干或选项含态度立场信号，纳入T9。')
  }

  if (hasInferenceSignal(stemLower) && candidates.length === 0) {
    addSynonymCandidate(candidates, 'T6')
    if (abstractPhraseSignal) addSynonymCandidate(candidates, 'T10')
    addSynonymCandidate(candidates, 'T2')
    addSynonymCandidate(candidates, 'T4')
    if (abstractPhraseSignal) boundaryFlags.push('T6_T10')
    routeReasons.push('题干含推断信号，优先走T6。')
  }

  if (abstractPhraseSignal && !candidates.includes('T10')) {
    addSynonymCandidate(candidates, 'T10')
    addSynonymCandidate(candidates, 'T6')
    boundaryFlags.push('T6_T10')
    routeReasons.push('正确选项含抽象概念短语，纳入T10并检查T6/T10边界。')
  }

  if (hasMultiPointSignal(stemLower, sourceLower)) {
    addSynonymCandidate(candidates, 'T4')
    addSynonymCandidate(candidates, 'T2')
    addSynonymCandidate(candidates, 'T6')
    routeReasons.push('题干与证据含时间、数字或多条件信号，纳入T4。')
  }

  if (candidates.length === 0) {
    addSynonymCandidate(candidates, 'T1')
    addSynonymCandidate(candidates, 'T2')
    addSynonymCandidate(candidates, 'T6')
    routeReasons.push('无特殊题干信号，按细节题常见T1/T2/T6判断。')
  }

  if (candidates.includes('T1') && candidates.includes('T2')) {
    boundaryFlags.push('T1_T2')
  }
  if (candidates.includes('T2') && candidates.includes('T6')) {
    boundaryFlags.push('T2_T6')
  }

  return {
    candidateCards: candidates.slice(0, 5),
    routeReasons,
    boundaryFlags: uniqueSynonymFlags(boundaryFlags),
  }
}

function formatSynonymDifficultyCardForPrompt(card) {
  return [
    `${card.cardId} ${card.name}`,
    `SOLO：${card.soloLevel}；高阶思维：${card.higherOrderThinking}；默认难度：${card.difficultyDefault}`,
    `定义：${card.definition}`,
    `信号：${(card.signals || []).join('；')}`,
    `边界：${card.caution || '无'}`,
    `8B提示：${card.promptHintFor8B || ''}`,
  ].join('\n')
}

function formatSynonymDifficultyKnowledgeForReadingPrompt() {
  const knowledge = loadSynonymDifficultyKnowledge()
  return knowledge.cards
    .map((card) =>
      [
        `${card.cardId} ${card.name}`,
        `SOLO：${card.soloLevel}；高阶思维：${card.higherOrderThinking}；默认难度：${card.difficultyDefault}`,
        `定义：${card.definition}`,
        `信号：${(card.signals || []).join('；')}`,
        `边界：${card.caution || '无'}`,
      ].join('；'),
    )
    .join('\n')
}

function buildSynonymDifficultyPrompt({ knowledge, question, sourceExpression, optionExpression, candidateCards, routeReasons }) {
  const cardText = candidateCards
    .map((cardId) => knowledge.cardMap.get(cardId))
    .filter(Boolean)
    .map(formatSynonymDifficultyCardForPrompt)
    .join('\n\n')
  const optionsText = question.options?.length
    ? question.options.map((option) => `${option.label}. ${option.content}`).join('\n')
    : '（无选项）'

  return `你是高考英语阅读题“原文表达 -> 正确选项表达”的同义替换难度初判助手。

你只能从候选卡中选择cardId，不能输出候选卡以外的类型。
候选cardId：${candidateCards.join(', ')}

硬规则：
1. 输出必须是一个JSON对象，不要markdown，不要解释性正文。
2. cardId只能是候选cardId之一。
3. difficultyDefault不用你判断，程序会根据cardId回填；你可以不输出。
4. T10必须review_needed=true。
5. T7/T8先找上下文论点，再判断例子/段落服务于哪个论点；不允许只从选项里“To show”“By giving examples”等标签反推。
6. T3只用于underlined/closest in meaning/refer to/mean等词义语境题；find out不是T3信号。
7. T1只用于近乎原词复现；只要有明确语义或句式改写，优先T2。

候选知识卡：
${cardText}

路由依据：
${routeReasons.join('\n') || '无'}

题目信息：
题号：${question.questionNo}
题型：${question.questionType || '阅读理解'}
题干：${question.stem}
选项：
${optionsText}
录入答案：${question.answer || '（无）'}

原文表达（不要缩写，按给定内容判断）：
${sourceExpression || '（缺少明确原文表达，请降低置信度）'}

正确选项表达（不要缩写，按给定内容判断）：
${optionExpression || '（缺少明确选项表达，请降低置信度）'}

只返回JSON：
{
  "cardId": "候选cardId之一",
  "confidence": 0.0,
  "review_needed": false,
  "boundaryFlags": ["可选，如T5_T10"],
  "reason": "用中文一句话说明为什么是这个类型，必须基于原文表达与正确选项表达。"
}`
}

function extractSynonymDifficultyPayload(payload) {
  if (!payload || typeof payload !== 'object') return null
  if (payload.cardId || payload.typeId || payload.type || payload.label) return payload
  const candidates = [payload.result, payload.classification, payload.answer, payload.output, payload.data]
  for (const candidate of candidates) {
    const nested = extractSynonymDifficultyPayload(candidate)
    if (nested) return nested
  }
  if (Array.isArray(payload.results) && payload.results.length > 0) {
    return extractSynonymDifficultyPayload(payload.results[0])
  }
  return null
}

function buildSynonymDeepSeekTriggers({ cardId, confidence, reviewNeeded, boundaryFlags, candidateCards, invalidCardId, evidenceWeak }) {
  const triggers = []
  if (reviewNeeded) triggers.push('review_needed')
  if (['T7', 'T8', 'T9', 'T10'].includes(cardId)) triggers.push('advanced_type')
  if (confidence < 0.72) triggers.push('low_confidence')
  if (evidenceWeak) triggers.push('weak_evidence_anchor')
  if (boundaryFlags.some((flag) => ['T5_T10', 'T6_T10', 'T7_T8', 'T6_T9', 'T2_T6'].includes(flag))) {
    triggers.push('boundary_fuzzy')
  }
  if (candidateCards.length > 2) triggers.push('wide_candidate_set')
  if (invalidCardId) triggers.push('invalid_card_replaced')
  return [...new Set(triggers)]
}

function normalizeSynonymDifficultyResult(rawPayload, context) {
  const knowledge = context.knowledge
  const candidateSet = new Set(context.candidateCards)
  const payload = extractSynonymDifficultyPayload(rawPayload) || {}
  const rawCardId = normalizeSynonymCardId(payload.cardId || payload.typeId || payload.type || payload.label)
  const invalidCardId = rawCardId && !candidateSet.has(rawCardId)
  const fallbackCardId = context.candidateCards[0] || 'T2'
  const cardId = !invalidCardId && rawCardId ? rawCardId : fallbackCardId
  const card = knowledge.cardMap.get(cardId) || knowledge.cardMap.get(fallbackCardId)
  const confidence = normalizeSynonymConfidence(payload.confidence ?? payload.score ?? payload.conf, invalidCardId ? 0.45 : 0.68)
  const rawReviewNeeded =
    normalizeSynonymBoolean(payload.review_needed ?? payload.reviewNeeded ?? payload.needsReview ?? payload.review)
  const boundaryFlags = uniqueSynonymFlags([
    ...context.boundaryFlags,
    ...(Array.isArray(payload.boundaryFlags) ? payload.boundaryFlags : []),
    ...(Array.isArray(payload.boundary_flags) ? payload.boundary_flags : []),
    context.evidenceWeak ? 'BROAD_PASSAGE_EVIDENCE' : '',
    invalidCardId ? 'INVALID_CARD_REPLACED' : '',
  ])
  const reviewNeeded =
    rawReviewNeeded ||
    invalidCardId ||
    context.evidenceWeak ||
    cardId === 'T10' ||
    confidence < 0.72 ||
    ['T7', 'T8', 'T9'].includes(cardId)
  const deepSeekTriggers = buildSynonymDeepSeekTriggers({
    cardId,
    confidence,
    reviewNeeded,
    boundaryFlags,
    candidateCards: context.candidateCards,
    invalidCardId,
    evidenceWeak: context.evidenceWeak,
  })

  return {
    questionId: context.question.id,
    questionNo: context.question.questionNo,
    cardId,
    name: card?.name || cardId,
    soloLevel: card?.soloLevel || '',
    higherOrderThinking: card?.higherOrderThinking || '',
    difficultyDefault: Number(card?.difficultyDefault || 0) || 0,
    confidence,
    reviewNeeded,
    boundaryFlags,
    deepSeekRecommended: deepSeekTriggers.length > 0,
    deepSeekTriggers,
    candidateCards: context.candidateCards,
    routeReasons: context.routeReasons,
    reason: optionalString(payload.reason || payload.reasoning || payload.whyThisType || payload.analysis) ||
      (invalidCardId ? '8B输出了候选范围外的类型，已按路由候选兜底并标记复核。' : '8B未返回明确理由，需人工复核。'),
    sourceExpression: context.sourceExpression,
    optionExpression: context.optionExpression,
    evidenceSource: context.evidenceSource,
    provider: LOCAL_QWEN_PROVIDER,
    model: LOCAL_QWEN_CHAT_MODEL,
    latencyMs: context.latencyMs,
    retryCount: context.retryCount,
    rawCardId: rawCardId || '',
    invalidCardId: Boolean(invalidCardId),
  }
}

async function classifySynonymDifficultyQuestion(context) {
  const messages = [
    {
      role: 'system',
      content: '你只输出JSON对象。你必须遵守候选cardId白名单，不能编造类型。',
    },
    {
      role: 'user',
      content: buildSynonymDifficultyPrompt(context),
    },
  ]

  const startedAt = Date.now()
  const firstResult = await callLocalQwenCompletion({
    model: LOCAL_QWEN_CHAT_MODEL,
    provider: LOCAL_QWEN_PROVIDER,
    messages,
    temperature: 0,
    maxTokens: 700,
  })
  let parsed = extractFirstJson(firstResult.rawText) || extractFirstJson(firstResult.firstMessageText) || extractFirstJson(firstResult.rawStatusText)
  let normalized = normalizeSynonymDifficultyResult(parsed, {
    ...context,
    latencyMs: firstResult.latencyMs,
    retryCount: 0,
  })

  if (normalized.invalidCardId || !parsed) {
    const retryResult = await callLocalQwenCompletion({
      model: LOCAL_QWEN_CHAT_MODEL,
      provider: LOCAL_QWEN_PROVIDER,
      messages: [
        messages[0],
        {
          role: 'user',
          content: `${messages[1].content}\n\n上次输出无效。请重新输出一个JSON对象，cardId必须严格属于：${context.candidateCards.join(', ')}。`,
        },
      ],
      temperature: 0,
      maxTokens: 500,
    })
    parsed = extractFirstJson(retryResult.rawText) || extractFirstJson(retryResult.firstMessageText) || extractFirstJson(retryResult.rawStatusText)
    normalized = normalizeSynonymDifficultyResult(parsed, {
      ...context,
      latencyMs: elapsedMs(startedAt),
      retryCount: 1,
    })
  }

  return normalized
}

async function generateSynonymDifficultyByQuestionGroup(questionGroupId, input = {}) {
  if (!QUESTION_BANK_ENABLE_LOCAL_QWEN) {
    throw new Error('题库本地 Qwen 初判已停用。请使用 DeepSeek 阅读解析内置的 synonymDifficulty。')
  }

  const startedAt = Date.now()
  const resolvedRequestId = input.requestId || randomUUID()
  const detail = getQuestionGroupDetail(questionGroupId)
  if (!detail) {
    throw new Error('题组未找到。')
  }
  if (detail.groupType !== 'reading') {
    throw new Error('同义替换难度初判目前仅支持阅读理解题组。')
  }

  const knowledge = loadSynonymDifficultyKnowledge()
  console.log(
    `AI synonym difficulty trace=${resolvedRequestId} group=${questionGroupId} model=${LOCAL_QWEN_CHAT_MODEL} provider=${LOCAL_QWEN_PROVIDER} questionCount=${detail.questions.length}`,
  )

  const results = []
  for (const question of detail.questions) {
    const { sourceExpression, optionExpression, evidenceSource, evidenceWeak } = buildSynonymSourceAndOption(
      detail,
      question,
      input.readingParseResult,
    )
    const routed = routeSynonymDifficultyCandidates({ question, sourceExpression, optionExpression })
    const candidateCards = routed.candidateCards.filter((cardId) => knowledge.cardIds.has(cardId))
    if (candidateCards.length === 0) {
      candidateCards.push('T2')
    }

    try {
      const result = await classifySynonymDifficultyQuestion({
        knowledge,
        question,
        sourceExpression,
        optionExpression,
        evidenceSource,
        evidenceWeak,
        candidateCards,
        routeReasons: routed.routeReasons,
        boundaryFlags: routed.boundaryFlags,
      })
      results.push(result)
    } catch (error) {
      const card = knowledge.cardMap.get(candidateCards[0]) || knowledge.cardMap.get('T2')
      results.push({
        questionId: question.id,
        questionNo: question.questionNo,
        cardId: card?.cardId || candidateCards[0] || 'T2',
        name: card?.name || '待复核',
        soloLevel: card?.soloLevel || '',
        higherOrderThinking: card?.higherOrderThinking || '',
        difficultyDefault: Number(card?.difficultyDefault || 0) || 0,
        confidence: 0.35,
        reviewNeeded: true,
        boundaryFlags: uniqueSynonymFlags([...routed.boundaryFlags, 'LOCAL_MODEL_ERROR']),
        deepSeekRecommended: true,
        deepSeekTriggers: ['local_model_error', 'review_needed'],
        candidateCards,
        routeReasons: routed.routeReasons,
        reason: error instanceof Error ? `本地8B初判失败：${error.message}` : '本地8B初判失败。',
        sourceExpression,
        optionExpression,
        evidenceSource,
        provider: LOCAL_QWEN_PROVIDER,
        model: LOCAL_QWEN_CHAT_MODEL,
        latencyMs: 0,
        retryCount: 0,
        rawCardId: '',
        invalidCardId: false,
      })
    }
  }

  return {
    questionGroupId,
    title: detail.title,
    questionCount: detail.questions.length,
    classifiedCount: results.length,
    reviewNeededCount: results.filter((item) => item.reviewNeeded).length,
    deepSeekRecommendedCount: results.filter((item) => item.deepSeekRecommended).length,
    provider: LOCAL_QWEN_PROVIDER,
    model: LOCAL_QWEN_CHAT_MODEL,
    keySource: 'local',
    requestId: resolvedRequestId,
    knowledgeVersion: knowledge.version || '',
    totalLatencyMs: elapsedMs(startedAt),
    results,
  }
}

async function callDeepSeekParseGrammar(context) {
  const questionText = context.questions
    .map((q, i) => `题目${i + 1}：第${q.questionNo}题${q.stem ? '，题干：' + q.stem : ''}`)
    .join('\n')

  const messages = [
    { role: 'system', content: DEEPSEEK_GRAMMAR_PARSE_PROMPT },
    {
      role: 'user',
      content: `请按上述要求处理以下语法填空篇章。\n\n篇章标题：${context.passageTitle}\n\n原文：\n${context.passageText}\n\n题目：\n${questionText}`,
    },
  ]

  const result = await callDeepSeekWithFallback({
    apiKey: context.apiKey,
    model: context.model,
    messages,
    temperature: 0.15,
    maxTokens: 6000,
    thinkingMode: context.thinkingMode,
  })

  return result.parsed
}

function formatQuestionForClozeParse(question) {
  const optionsText = question.options?.length
    ? question.options
        .map((option) => `${option.label}. ${option.content}`)
        .join('\n')
    : '（无）'

  return [
    `题号：${question.questionNo}`,
    question.stem ? `题干：${question.stem}` : '',
    `选项：\n${optionsText}`,
    question.answer ? `当前答案：${question.answer}` : '',
    question.explanation ? `已有解析：${question.explanation}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

async function callDeepSeekParseCloze(context) {
  const questionText = context.questions
    .map((question, index) => `【空${index + 1}】\n${formatQuestionForClozeParse(question)}`)
    .join('\n\n')

  const result = await callDeepSeekWithFallback({
    apiKey: context.apiKey,
    model: context.model,
    messages: [
      { role: 'system', content: DEEPSEEK_CLOZE_PARSE_PROMPT },
      {
        role: 'user',
        content: `请按上述“完形填空处理”模式解析以下题组。\n\n篇章标题：${context.passageTitle}\n\n原文：\n${context.passageText}\n\n题目与选项：\n${questionText}`,
      },
    ],
    temperature: 0.18,
    maxTokens: context.thinkingMode ? 8192 : 6500,
    thinkingMode: context.thinkingMode,
  })

  return result.parsed
}

async function parseClozeByQuestionGroup(questionGroupId, apiKey, model, parseRequestId, thinkingMode = false) {
  const keySource = describeKeySource(apiKey)
  const key = String(apiKey || DEEPSEEK_API_KEY).trim()
  if (!key) {
    throw new Error('未设置 API Key。请在右上角输入 DeepSeek Key 或设环境变量 DEEPSEEK_API_KEY。')
  }
  const selectedModel = normalizeDeepSeekModel(model)
  const resolvedParseRequestId = parseRequestId || randomUUID()
  const parseStartedAt = Date.now()

  const detail = getQuestionGroupDetail(questionGroupId)
  if (!detail || detail.groupType !== 'cloze') {
    throw new Error('仅支持完形填空题组。')
  }

  console.log(
    `AI cloze parse trace=${resolvedParseRequestId} group=${questionGroupId} model=${selectedModel} thinking=${
      thinkingMode ? 'on' : 'off'
    } keySource=${keySource.source} keyMask=${maskApiKey(key)} questionCount=${detail.questions.length}`,
  )

  const parsed = await callDeepSeekParseCloze({
    apiKey: key,
    model: selectedModel,
    passageTitle: detail.passage.title,
    passageText: detail.passage.materialText?.slice(0, 3200) || '',
    questions: detail.questions,
    thinkingMode,
  })

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('DeepSeek 返回结果不符合预期。')
  }

  const questions = (Array.isArray(parsed.questions) ? parsed.questions : [])
    .map((item) => normalizeClozeParseQuestion(item))
    .filter(Boolean)

  if (questions.length === 0) {
    throw new Error('DeepSeek 未返回有效完形填空解析。')
  }

  return {
    questionGroupId,
    title: detail.title,
    questionCount: detail.questions.length,
    parsedCount: questions.length,
    answerLine: optionalString(parsed.answerLine),
    storyTitle: optionalString(parsed.storyTitle),
    storySummary: optionalString(parsed.storySummary),
    condensedStory: optionalString(parsed.condensedStory),
    questions,
    keySource: keySource.source,
    keyFingerprint: maskApiKey(key),
    keyMask: maskApiKey(key),
    requestId: resolvedParseRequestId,
    model: selectedModel,
    thinkingMode,
    provider: keySource.provider,
    totalLatencyMs: elapsedMs(parseStartedAt),
  }
}

async function parseGrammarByQuestionGroup(questionGroupId, apiKey, model, parseRequestId, thinkingMode = false) {
  const keySource = describeKeySource(apiKey)
  const key = String(apiKey || DEEPSEEK_API_KEY).trim()
  if (!key) {
    throw new Error('未设置 API Key。')
  }
  const selectedModel = normalizeDeepSeekModel(model)
  const resolvedParseRequestId = parseRequestId || randomUUID()
  const parseStartedAt = Date.now()

  const detail = getQuestionGroupDetail(questionGroupId)
  if (!detail || detail.groupType !== 'grammar_cloze') {
    throw new Error('仅支持语法填空题组。')
  }

  console.log(
    `AI grammar parse trace=${resolvedParseRequestId} group=${questionGroupId} model=${selectedModel}`,
  )

  const parsed = await callDeepSeekParseGrammar({
    apiKey: key,
    model: selectedModel,
    passageTitle: detail.passage.title,
    passageText: detail.passage.materialText?.slice(0, 2500) || '',
    questions: detail.questions,
    thinkingMode,
  })

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('DeepSeek 返回结果不符合预期。')
  }

  const questions = (Array.isArray(parsed.questions) ? parsed.questions : []).map((item) => ({
    questionNo: String(item.questionNo || ''),
    answer: String(item.answer || ''),
    hintMeaning: String(item.hintMeaning || ''),
    analysis: String(item.analysis || ''),
    sentenceTranslation: String(item.sentenceTranslation || ''),
  })).filter((item) => item.questionNo)

  if (questions.length === 0) {
    throw new Error('DeepSeek 未返回有效题目解析。')
  }

  return {
    questionGroupId,
    title: detail.title,
    questionCount: detail.questions.length,
    parsedCount: questions.length,
    fullTranslation: String(parsed.fullTranslation || ''),
    questions,
    keySource: keySource.source,
    keyFingerprint: maskApiKey(key),
    keyMask: maskApiKey(key),
    requestId: resolvedParseRequestId,
    model: selectedModel,
    thinkingMode,
    provider: keySource.provider,
    totalLatencyMs: elapsedMs(parseStartedAt),
  }
}

function formatQuestionForSevenChoicesParse(question) {
  return [
    `题号：${question.questionNo}`,
    question.stem ? `题干：${question.stem}` : '',
    question.answer ? `当前答案：${question.answer}` : '',
    question.explanation ? `已有解析：${question.explanation}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

function formatOptionsForSevenChoicesParse(questions) {
  const optionsByLabel = new Map()
  questions.forEach((question) => {
    question.options?.forEach((option) => {
      const label = optionalString(option.label).toUpperCase()
      if (label && !optionsByLabel.has(label)) {
        optionsByLabel.set(label, optionalString(option.content))
      }
    })
  })
  return Array.from(optionsByLabel.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, content]) => `${label}. ${content}`)
    .join('\n')
}

async function callDeepSeekParseSevenChoices(context) {
  const questionText = context.questions
    .map((question, index) => `【空${index + 1}】\n${formatQuestionForSevenChoicesParse(question)}`)
    .join('\n\n')
  const optionsText = formatOptionsForSevenChoicesParse(context.questions) || '（无）'

  const result = await callDeepSeekWithFallback({
    apiKey: context.apiKey,
    model: context.model,
    messages: [
      {
        role: 'system',
        content: `${DEEPSEEK_SEVEN_CHOICES_PARSE_PROMPT}

请严格只返回 JSON 对象，不要 markdown 代码块。JSON 结构如下：
{
  "articleSummary": "文章主旨中文概括",
  "answerLine": "36. D 37. C 38. B 39. G 40. A",
  "questions": [
    {
      "questionNo": "36",
      "answer": "D",
      "optionText": "选项英文原句",
      "optionTranslation": "选项中文翻译",
      "positionContext": "位置与上下文",
      "analysis": "对应解析"
    }
  ]
}`,
      },
      {
        role: 'user',
        content: `请按上述“七选五处理”模式解析以下题组。\n\n篇章标题：${context.passageTitle}\n\n原文：\n${context.passageText}\n\n备选项：\n${optionsText}\n\n题目：\n${questionText}`,
      },
    ],
    temperature: 0.18,
    maxTokens: context.thinkingMode ? 8192 : 6500,
    thinkingMode: context.thinkingMode,
  })

  return result.parsed
}

async function parseSevenChoicesByQuestionGroup(questionGroupId, apiKey, model, parseRequestId, thinkingMode = false) {
  const keySource = describeKeySource(apiKey)
  const key = String(apiKey || DEEPSEEK_API_KEY).trim()
  if (!key) {
    throw new Error('未设置 API Key。请在右上角输入 DeepSeek Key 或设环境变量 DEEPSEEK_API_KEY。')
  }
  const selectedModel = normalizeDeepSeekModel(model)
  const resolvedParseRequestId = parseRequestId || randomUUID()
  const parseStartedAt = Date.now()

  const detail = getQuestionGroupDetail(questionGroupId)
  if (!detail || detail.groupType !== 'seven_choices') {
    throw new Error('仅支持七选五题组。')
  }

  console.log(
    `AI seven choices parse trace=${resolvedParseRequestId} group=${questionGroupId} model=${selectedModel} thinking=${
      thinkingMode ? 'on' : 'off'
    } keySource=${keySource.source} keyMask=${maskApiKey(key)} questionCount=${detail.questions.length}`,
  )

  const parsed = await callDeepSeekParseSevenChoices({
    apiKey: key,
    model: selectedModel,
    passageTitle: detail.passage.title,
    passageText: detail.passage.materialText?.slice(0, 3200) || '',
    questions: detail.questions,
    thinkingMode,
  })

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('DeepSeek 返回结果不符合预期。')
  }

  const questions = (Array.isArray(parsed.questions) ? parsed.questions : [])
    .map((item) => normalizeSevenChoicesParseQuestion(item))
    .filter(Boolean)

  if (questions.length === 0) {
    throw new Error('DeepSeek 未返回有效七选五解析。')
  }

  return {
    questionGroupId,
    title: detail.title,
    questionCount: detail.questions.length,
    parsedCount: questions.length,
    answerLine: optionalString(parsed.answerLine),
    articleSummary: optionalString(parsed.articleSummary),
    questions,
    keySource: keySource.source,
    keyFingerprint: maskApiKey(key),
    keyMask: maskApiKey(key),
    requestId: resolvedParseRequestId,
    model: selectedModel,
    thinkingMode,
    provider: keySource.provider,
    totalLatencyMs: elapsedMs(parseStartedAt),
  }
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

const DEEPSEEK_SEMANTIC_RERANK_PROMPT = `你是高中英语题库语义检索重排助手。
你只能根据给定候选题组为用户的检索意图排序，不要新增候选，不要输出解释性正文。

规则：
1. 优先理解语义，不要只看字面词。
2. 重点看题组标题、篇章标题、摘要、命中题干、答案提示、标签、话题标签。
3. 候选都不匹配时，也必须返回最相关的候选。
4. score 是 0 到 1 之间的小数，越大越相关。
5. reason 控制在 30 字以内，说明最关键的匹配点。
6. 只返回 JSON 对象，不要 markdown 代码块，不要额外说明。

返回格式：
{
  "rankings": [
    {
      "questionGroupId": "题组 ID",
      "score": 0.96,
      "reason": "匹配点说明"
    }
  ]
}`

const QUESTION_BANK_STEWARD_PROMPT = `你是高中英语题库搜索管家，只负责把老师的自然语言转成检索意图。
不要做阅读题解析，不要判断答案对错，不要生成讲评稿。

可用相似维度：
- skill：考查技能、SOLO、T1-T10、题面题型、做题动作，如 T6 推断、T10 抽象压缩、猜词题、例子功能。
- theme：文章主题、话题标签、语篇内容，如科技发展、人与自然、购物、环保。
- difficulty：难度相近，如高难、中等、低难、干扰项强、抽象度高。
- source：来源相似，如浙江卷、全国卷、2023年、1月卷、真题/模拟题。
- mixed：用户明确要求多个维度同时相似。

交互口径：
- 前台面对老师时只说自然语言，不说 skill/theme/difficulty/source，不说“按维度选择”。
- 如果要澄清，用“做题思路像 / 文章内容像 / 学生卡点像”这类老师能直接理解的话。
- 不要要求用户回复固定枚举；允许用户直接补一句描述。

澄清规则：
如果用户只说“找相似题/类似题/同款题/推荐几道”但没有说明相似维度，必须 needsClarification=true。
澄清问题必须用自然语言，不要暴露 skill/theme/difficulty/source、SOLO T卡、来源年份等内部字段。
推荐口吻：你更想找“学生做题思路像”的，还是“文章讲的内容像”的？也可以直接补一句，比如“找同样要抽象概括的”。
注意：“高阶题/T5-T10”是 skill 维度，不等于 difficultyLevels=high；只有用户明确说“高难/难度高”才设置 difficultyLevels。

返回 JSON 对象，不要 markdown，不要额外说明：
{
  "intent": "find_similar/search/clarify",
  "needsClarification": false,
  "clarificationQuestion": "",
  "similarityDimension": "skill/theme/difficulty/source/mixed/null",
  "rewrittenQuery": "适合后端检索的一句话，保留T卡、题型、主题、年份等关键词",
  "filters": {
    "groupType": "reading/cloze/seven_choices/grammar_cloze/null",
    "sourceType": "real_exam/mock_exam/self_made/null",
    "years": ["2023"],
    "regions": ["浙江"],
    "tCardIds": ["T6"],
    "surfaceQuestionTypes": ["passage_main_idea"],
    "difficultyLevels": ["high"]
  },
  "answer": "一句中文说明你会怎么找"
}`

function formatSemanticSearchCandidateForDeepSeek(candidate, rank) {
  const group = candidate.group
  return [
    `${rank + 1}. 题组ID：${group.id}`,
    `题组标题：${group.title}`,
    `篇章标题：${group.passageTitle || '（无）'}`,
    `题组类型：${groupTypeLabels[group.groupType] || group.groupType}`,
    Number.isFinite(candidate.score) ? `预排序分：${Math.round(clamp01(candidate.score) * 100)}%` : '',
    group.summary ? `摘要：${safeTruncate(group.summary, 180)}` : '',
    group.hit ? `命中题干：${safeTruncate(group.hit, 140)}` : '',
    group.answerPreview ? `答案提示：${safeTruncate(group.answerPreview, 80)}` : '',
    group.tags?.length ? `标签：${group.tags.join('，')}` : '',
    group.topicLabels?.length ? `话题标签：${group.topicLabels.map((topicLabel) => topicLabel.label).join('，')}` : '',
    group.readingSearchSignals?.text ? `阅读解析标签：${safeTruncate(group.readingSearchSignals.text, 260)}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

function normalizeSemanticSearchRankings(payload) {
  const rawRankings = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.rankings)
      ? payload.rankings
      : Array.isArray(payload?.matches)
        ? payload.matches
      : Array.isArray(payload?.results)
        ? payload.results
        : []

  return rawRankings
    .map((item, index) => {
      const questionGroupId = optionalString(item?.questionGroupId || item?.id || item?.groupId)
      if (!questionGroupId) return null
      const rawScore = Number(item?.score ?? item?.relevanceScore ?? item?.rankScore)
      return {
        questionGroupId,
        score: Number.isFinite(rawScore) ? rawScore : null,
        reason: optionalString(item?.reason || item?.explanation || item?.analysis),
        index,
      }
    })
    .filter(Boolean)
}

function buildSemanticSearchMatchesFromRankings(candidates, rankings, candidateById, scoreFromRanking) {
  const seenIds = new Set()
  const rankedMatches = []

  rankings.forEach((ranking) => {
    const candidate = candidateById.get(ranking.questionGroupId)
    if (!candidate || seenIds.has(candidate.group.id)) return

    const defaultRankScore = clamp01(1 - rankedMatches.length / Math.max(rankings.length - 1, 1))
    const rankingScore =
      ranking.score === null ? defaultRankScore : clamp01(ranking.score > 1 ? ranking.score / 100 : ranking.score)

    seenIds.add(candidate.group.id)
    rankedMatches.push({
      ...candidate,
      deepSeekReason: ranking.reason,
      deepSeekScore: rankingScore,
      score: scoreFromRanking(candidate, rankingScore),
    })
  })

  candidates.forEach((candidate) => {
    if (!seenIds.has(candidate.group.id)) {
      rankedMatches.push(candidate)
    }
  })

  return rankedMatches
}

function buildDeepSeekSemanticSearchReason(group, reason, rank, sourceName = 'DeepSeek') {
  if (reason) {
    return `${sourceName} 检测第 ${rank + 1} 位；${safeTruncate(reason, 40)}`
  }

  const labelPieces = []
  if (group.topicLabels?.length) {
    labelPieces.push(group.topicLabels.slice(0, 2).map((topicLabel) => topicLabel.label).join(' / '))
  }
  if (group.tags?.length) {
    labelPieces.push(group.tags.slice(0, 3).join(' / '))
  }
  const evidence = labelPieces.filter(Boolean).join('；')
  return evidence
    ? `${sourceName} 检测第 ${rank + 1} 位；命中 ${evidence}。`
    : `${sourceName} 检测第 ${rank + 1} 位。`
}

function normalizeSemanticSearchText(value) {
  return optionalString(value)
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^\w\u4e00-\u9fff]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildSemanticSearchTerms(query) {
  const normalizedQuery = normalizeSemanticSearchText(query)
  if (!normalizedQuery) return []

  const terms = []
  const seen = new Set()
  const pushTerm = (term) => {
    const normalizedTerm = normalizeSemanticSearchText(term)
    if (!normalizedTerm || normalizedTerm.length < 2 || seen.has(normalizedTerm)) return
    seen.add(normalizedTerm)
    terms.push(normalizedTerm)
  }

  pushTerm(normalizedQuery)
  normalizedQuery.split(' ').forEach(pushTerm)
  return terms.slice(0, 10)
}

function scoreSemanticSearchField(text, exactQuery, terms) {
  const normalizedText = normalizeSemanticSearchText(text)
  if (!normalizedText) return 0

  let score = 0
  if (exactQuery && normalizedText.includes(exactQuery)) {
    score += 0.7
  }

  const candidateTerms = terms.filter((term) => term !== exactQuery)
  if (candidateTerms.length > 0) {
    let matchedTerms = 0
    candidateTerms.forEach((term) => {
      if (normalizedText.includes(term)) {
        matchedTerms += 1
      }
    })
    score += Math.min(0.3, (matchedTerms / candidateTerms.length) * 0.3)
  }

  return Math.min(1, score)
}

function scoreSemanticSearchCandidate(group, exactQuery, terms) {
  const topicLabelText = Array.isArray(group.topicLabels) ? group.topicLabels.map((topicLabel) => topicLabel.label).join(' ') : ''
  const fieldScores = [
    scoreSemanticSearchField(group.title, exactQuery, terms) * 0.24,
    scoreSemanticSearchField(group.passageTitle, exactQuery, terms) * 0.14,
    scoreSemanticSearchField(group.summary, exactQuery, terms) * 0.14,
    scoreSemanticSearchField(group.hit, exactQuery, terms) * 0.14,
    scoreSemanticSearchField(group.answerPreview, exactQuery, terms) * 0.08,
    scoreSemanticSearchField(Array.isArray(group.tags) ? group.tags.join(' ') : '', exactQuery, terms) * 0.12,
    scoreSemanticSearchField(topicLabelText, exactQuery, terms) * 0.1,
    scoreSemanticSearchField(group.readingSearchSignals?.text || '', exactQuery, terms) * 0.18,
    scoreSemanticSearchField([group.source, group.region, group.paperName, group.section].filter(Boolean).join(' '), exactQuery, terms) * 0.04,
  ]

  return clamp01(fieldScores.reduce((sum, value) => sum + value, 0))
}

function buildSemanticSearchCandidatePool(groups, query) {
  const exactQuery = normalizeSemanticSearchText(query)
  const terms = buildSemanticSearchTerms(query)
  const scoredGroups = groups
    .map((group, index) => ({
      group,
      score: scoreSemanticSearchCandidate(group, exactQuery, terms),
      index,
    }))
    .sort((left, right) => {
      const scoreDelta = right.score - left.score
      if (scoreDelta !== 0) return scoreDelta
      const yearDelta = (Number(right.group.year) || 0) - (Number(left.group.year) || 0)
      if (yearDelta !== 0) return yearDelta
      return left.index - right.index
    })

  return scoredGroups.slice(0, Math.min(SEMANTIC_SEARCH_PREFILTER_TOP_K, scoredGroups.length))
}

function normalizeStewardArray(value) {
  if (Array.isArray(value)) {
    return value.map(optionalString).filter(Boolean).slice(0, 8)
  }
  const normalized = optionalString(value)
  return normalized ? [normalized] : []
}

function inferStewardDimensionFromQuery(query) {
  const text = optionalString(query)
  if (!text) return ''

  if (
    /(做题思路|解题思路|解题方法|学生卡点|卡点|考法|考查方式|题型|题面|SOLO|T10|T[1-9]\b|猜词|词义|推断|主旨|标题|例子|引用|态度|写作手法|段落功能|why mention|why did|抽象概括|抽象压缩|抽象短语)/i.test(
      text,
    )
  ) {
    return 'skill'
  }
  if (/(文章内容|内容像|讲的内容|主题|话题|语篇|材料内容|科技|环保|城市|购物|自然|社会|文化|人物|故事)/i.test(text)) {
    return 'theme'
  }
  if (/(难度|高难|难题|低难|简单|容易|中等|干扰|迷惑|词汇|语法|抽象度|信息跨度)/i.test(text)) {
    return 'difficulty'
  }
  if (/(来源|年份|真题|模拟|浙江|全国|新课标|北京|上海|广东|深圳|一模|二模|20\d{2}|1月|6月|卷)/i.test(text)) {
    return 'source'
  }

  return ''
}

function inferStewardSurfaceQuestionTypesFromQuery(query) {
  const text = optionalString(query)
  const types = []
  const push = (type) => {
    if (!types.includes(type)) types.push(type)
  }

  if (/(抽象概括|抽象压缩|抽象短语|low barrier|barrier to entry)/i.test(text)) push('abstract_phrase_summary')
  if (/(形容词压缩|一两个形容词|adjective)/i.test(text)) push('adjective_summary')
  if (/(猜词|词义|划线词|underlined word|underlined phrase)/i.test(text)) push('word_meaning')
  if (/(例子功能|举例|引用|why mention|mentioning)/i.test(text)) push('example_function')
  if (/(why did|为什么.*做|原因题)/i.test(text)) push('why_did')
  if (/(段落主旨|paragraph main)/i.test(text)) push('paragraph_main_idea')
  if (/(文章主旨|全文主旨|mainly about|passage main)/i.test(text)) push('passage_main_idea')
  if (/(写作手法|writing technique|修辞手法)/i.test(text)) push('writing_technique')
  if (/(态度|语气|attitude|tone)/i.test(text)) push('attitude_tone')
  if (/(推断|infer|inference)/i.test(text)) push('inference_general')

  return types
}

function inferStewardTCardIdsFromQuery(query) {
  const text = optionalString(query)
  return Array.from(text.matchAll(/\bT(10|[1-9])\b/gi))
    .map((match) => normalizeSynonymCardId(match[0]))
    .filter(Boolean)
}

function normalizeQuestionBankStewardPlan(payload, fallbackQuery) {
  const source = payload && typeof payload === 'object' ? payload : {}
  const allowedIntents = new Set(['find_similar', 'search', 'clarify'])
  const allowedDimensions = new Set(['skill', 'theme', 'difficulty', 'source', 'mixed', 'null'])
  const allowedSurfaceTypes = new Set([
    'single_detail_normal',
    'multi_detail_learn_from',
    'why_did',
    'word_meaning',
    'paragraph_main_idea',
    'passage_main_idea',
    'writing_technique',
    'paragraph_function',
    'author_purpose',
    'attitude_tone',
    'inference_general',
    'example_function',
    'adjective_summary',
    'abstract_phrase_summary',
  ])
  const filters = objectValue(source.filters)
  const intent = optionalString(source.intent)
  const similarityDimension = optionalString(source.similarityDimension || source.similarity_dimension)
  const groupType = optionalString(filters.groupType || filters.group_type)
  const sourceType = optionalString(filters.sourceType || filters.source_type)
  const queryText = optionalString(fallbackQuery)
  const inferredDimension = inferStewardDimensionFromQuery(queryText)
  const inferredSurfaceTypes = inferStewardSurfaceQuestionTypesFromQuery(queryText).filter((type) => allowedSurfaceTypes.has(type))
  const inferredTCardIds = inferStewardTCardIdsFromQuery(queryText)
  const hasExplicitDifficultySignal =
    /(高难|难度高|难题|低难|难度低|简单|容易|中等难度|难度中等|difficulty)/i.test(queryText)
  const normalizedDifficultyLevels = normalizeStewardArray(filters.difficultyLevels || filters.difficulty_levels)
    .map((value) => {
      const normalizedValue = value.toLowerCase()
      if (['high', '高', '高难'].includes(normalizedValue)) return 'high'
      if (['medium', '中', '中等'].includes(normalizedValue)) return 'medium'
      if (['low', '低', '低难', '简单'].includes(normalizedValue)) return 'low'
      return ''
    })
    .filter(Boolean)
  const normalized = {
    intent: allowedIntents.has(intent) ? intent : 'search',
    needsClarification: source.needsClarification === true || source.needs_clarification === true,
    clarificationQuestion: optionalString(source.clarificationQuestion || source.clarification_question),
    similarityDimension: allowedDimensions.has(similarityDimension) ? similarityDimension : 'null',
    rewrittenQuery: optionalString(source.rewrittenQuery || source.rewritten_query) || optionalString(fallbackQuery),
    filters: {
      groupType: ['reading', 'cloze', 'seven_choices', 'grammar_cloze'].includes(groupType) ? groupType : '',
      sourceType: ['real_exam', 'mock_exam', 'self_made'].includes(sourceType) ? sourceType : '',
      years: normalizeStewardArray(filters.years || filters.year),
      regions: normalizeStewardArray(filters.regions || filters.region),
      tCardIds: Array.from(
        new Set([...normalizeStewardArray(filters.tCardIds || filters.t_card_ids).map(normalizeSynonymCardId).filter(Boolean), ...inferredTCardIds]),
      ),
      surfaceQuestionTypes: normalizeStewardArray(filters.surfaceQuestionTypes || filters.surface_question_types).filter((type) =>
        allowedSurfaceTypes.has(type),
      ),
      difficultyLevels: hasExplicitDifficultySignal ? Array.from(new Set(normalizedDifficultyLevels)) : [],
    },
    answer: optionalString(source.answer),
  }
  if (inferredSurfaceTypes.length) {
    normalized.filters.surfaceQuestionTypes = Array.from(new Set([...normalized.filters.surfaceQuestionTypes, ...inferredSurfaceTypes]))
  }
  if (normalized.similarityDimension === 'null' && inferredDimension) {
    normalized.similarityDimension = inferredDimension
  }
  if (inferredDimension && normalized.needsClarification) {
    normalized.needsClarification = false
    normalized.clarificationQuestion = ''
    if (normalized.intent === 'clarify') normalized.intent = 'find_similar'
    if (!normalized.answer) normalized.answer = `我按${summarizeStewardDimension(normalized.similarityDimension)}来找。`
  }

  if (normalized.intent === 'clarify') {
    normalized.needsClarification = true
  }
  if (normalized.needsClarification && !normalized.clarificationQuestion) {
    normalized.clarificationQuestion =
      '你更想找“学生做题思路像”的，还是“文章讲的内容像”的？也可以直接补一句，比如“找同样要抽象概括的”。'
  }

  return normalized
}

function shouldForceStewardClarification(query, plan) {
  const text = optionalString(query)
  if (!text) return false
  const asksSimilar = /(相似|类似|同款|同类|推荐.*题|找.*题)/.test(text)
  if (!asksSimilar) return false
  const hasDimensionSignal =
    /(做题思路|解题思路|学生卡点|文章内容|讲的内容|技能|SOLO|T10|T[1-9]\b|题型|猜词|推断|主旨|标题|例子|引用|态度|写作手法|压缩|抽象|主题|话题|难度|高难|中等|简单|干扰|浙江|全国|新课标|北京|上海|真题|模拟|年份|20\d{2})/i.test(
      text,
    )
  return !hasDimensionSignal && plan.similarityDimension === 'null'
}

function buildStewardSemanticQuery(query, plan) {
  const filters = plan.filters || {}
  const parts = [
    plan.rewrittenQuery,
    plan.similarityDimension && plan.similarityDimension !== 'null' ? `相似维度:${plan.similarityDimension}` : '',
    filters.groupType ? `题组类型:${filters.groupType}` : '',
    filters.sourceType ? `来源:${filters.sourceType}` : '',
    filters.years?.length ? `年份:${filters.years.join(' ')}` : '',
    filters.regions?.length ? `地区:${filters.regions.join(' ')}` : '',
    filters.tCardIds?.length ? `T卡:${filters.tCardIds.join(' ')}` : '',
    filters.surfaceQuestionTypes?.length ? `题面:${filters.surfaceQuestionTypes.join(' ')}` : '',
    filters.difficultyLevels?.length ? `难度:${filters.difficultyLevels.join(' ')}` : '',
  ].filter(Boolean)

  const semanticQuery = parts.join('；').trim()
  return semanticQuery || optionalString(query)
}

function summarizeStewardDimension(dimension) {
  const labels = {
    skill: '做题思路相似',
    theme: '文章内容相似',
    difficulty: '难度接近',
    source: '真题风格相近',
    mixed: '综合相似',
  }
  return labels[dimension] || '综合语义'
}

function buildQuestionBankStewardMessage(plan, searchResult) {
  if (plan.needsClarification) {
    return (
      plan.clarificationQuestion ||
      '你更想找“学生做题思路像”的，还是“文章讲的内容像”的？也可以直接补一句，比如“找同样要抽象概括的”。'
    )
  }

  const count = searchResult?.matches?.length || 0
  const dimension = summarizeStewardDimension(plan.similarityDimension)
  const lead = plan.answer || `我按${dimension}来找。`
  if (count === 0) {
    return `${lead} 目前没有找到稳定匹配，可以换一个主题、T卡或年份再试。`
  }
  return `${lead} 已按${dimension}推荐 ${count} 个候选，优先看列表前几项的匹配理由。`
}

function matchStewardFilter(match, plan) {
  const filters = plan.filters || {}
  const group = match.questionGroup || match.group || {}
  const signals = group.readingSearchSignals || {}

  if (filters.groupType && group.groupType !== filters.groupType) return false
  if (filters.sourceType && group.sourceType !== filters.sourceType) return false
  if (filters.years?.length && !filters.years.includes(String(group.year || ''))) return false
  if (filters.regions?.length && !filters.regions.some((region) => optionalString(group.region).includes(region))) return false
  if (filters.tCardIds?.length) {
    const groupCards = Array.isArray(signals.tCardIds) ? signals.tCardIds : []
    if (!filters.tCardIds.some((cardId) => groupCards.includes(cardId))) return false
  }
  if (filters.surfaceQuestionTypes?.length) {
    const surfaceTypes = Array.isArray(signals.surfaceTypes) ? signals.surfaceTypes : []
    if (!filters.surfaceQuestionTypes.some((surfaceType) => surfaceTypes.includes(surfaceType))) return false
  }
  if (filters.difficultyLevels?.length) {
    const requested = filters.difficultyLevels.map((value) => optionalString(value).toLowerCase())
    const difficultyAliases = {
      high: 'high',
      hard: 'high',
      '高': 'high',
      '高难': 'high',
      medium: 'medium',
      mid: 'medium',
      '中': 'medium',
      '中等': 'medium',
      low: 'low',
      easy: 'low',
      '低': 'low',
      '低难': 'low',
      '简单': 'low',
    }
    const difficulty = difficultyAliases[optionalString(group.difficulty).toLowerCase()] || optionalString(group.difficulty).toLowerCase()
    const scores = Array.isArray(signals.finalScores) ? signals.finalScores : []
    const hasScoreMatch = scores.some((score) => {
      if (requested.includes('high')) return score >= 7
      if (requested.includes('medium')) return score >= 4 && score <= 6
      if (requested.includes('low')) return score <= 3
      return false
    })
    if (!requested.includes(difficulty) && !hasScoreMatch) return false
  }

  return true
}

function applyStewardFiltersToMatches(matches, plan) {
  const filters = plan.filters || {}
  const hasHardFilter = Boolean(
    filters.groupType ||
      filters.sourceType ||
      filters.years?.length ||
      filters.regions?.length ||
      filters.tCardIds?.length ||
      filters.surfaceQuestionTypes?.length ||
      filters.difficultyLevels?.length,
  )
  if (!hasHardFilter) return matches

  const filtered = matches.filter((match) => matchStewardFilter(match, plan))
  if (filtered.length === 0) return []

  return filtered.map((match) => ({
    ...match,
    reason: `管家规则过滤；${match.reason}`,
  }))
}

async function planQuestionBankStewardSearch(query, apiKey, requestId) {
  const key = String(apiKey || DEEPSEEK_API_KEY).trim()
  if (!key) {
    throw new Error('未设置 DeepSeek API Key。请在右上角输入 DeepSeek Key 或设环境变量 DEEPSEEK_API_KEY。')
  }

  const result = await callDeepSeekWithFallback({
    apiKey: key,
    model: DEFAULT_DEEPSEEK_MODEL,
    provider: 'deepseek',
    messages: [
      {
        role: 'system',
        content: QUESTION_BANK_STEWARD_PROMPT,
      },
      {
        role: 'user',
        content: `老师的问题：${query}`,
      },
    ],
    temperature: 0,
    maxTokens: 900,
    thinkingMode: false,
    responseFormat: 'json_object',
  })

  const plan = normalizeQuestionBankStewardPlan(result.parsed, query)
  if (shouldForceStewardClarification(query, plan)) {
    plan.intent = 'clarify'
    plan.needsClarification = true
    plan.clarificationQuestion =
      '你更想找“学生做题思路像”的，还是“文章讲的内容像”的？也可以直接补一句，比如“找同样要抽象概括的”。'
  }

  return {
    plan,
    latencyMs: result.latencyMs,
    requestId,
  }
}

async function questionBankStewardSearch(query, apiKey, requestId) {
  const normalizedQuery = optionalString(query)
  if (!normalizedQuery) {
    throw new Error('请输入想让题库管家查找的问题。')
  }

  const resolvedRequestId = requestId || randomUUID()
  const startedAt = Date.now()
  const keySource = describeKeySource(apiKey)
  const key = String(apiKey || DEEPSEEK_API_KEY).trim()
  const { plan } = await planQuestionBankStewardSearch(normalizedQuery, key, resolvedRequestId)

  if (plan.needsClarification) {
    return {
      query: normalizedQuery,
      assistantMessage: buildQuestionBankStewardMessage(plan, null),
      needsClarification: true,
      clarificationQuestion: plan.clarificationQuestion,
      intent: plan,
      matches: [],
      provider: 'deepseek',
      model: DEFAULT_DEEPSEEK_MODEL,
      thinkingMode: false,
      keySource: keySource.source,
      keyFingerprint: maskApiKey(key),
      keyMask: maskApiKey(key),
      requestId: resolvedRequestId,
      totalLatencyMs: elapsedMs(startedAt),
      pipeline: 'deepseek-flash-steward',
    }
  }

  const semanticQuery = buildStewardSemanticQuery(normalizedQuery, plan)
  const searchResult = await semanticSearchQuestionGroups(semanticQuery, key, `${resolvedRequestId}-search`)
  const matches = applyStewardFiltersToMatches(searchResult.matches, plan).slice(0, QUESTION_BANK_STEWARD_TOP_K)
  const limitedSearchResult = {
    ...searchResult,
    query: semanticQuery,
    matches,
  }

  return {
    query: normalizedQuery,
    assistantMessage: buildQuestionBankStewardMessage(plan, limitedSearchResult),
    needsClarification: false,
    clarificationQuestion: '',
    intent: plan,
    search: limitedSearchResult,
    matches,
    provider: 'deepseek',
    model: DEFAULT_DEEPSEEK_MODEL,
    thinkingMode: false,
    keySource: keySource.source,
    keyFingerprint: maskApiKey(key),
    keyMask: maskApiKey(key),
    requestId: resolvedRequestId,
    totalLatencyMs: elapsedMs(startedAt),
    pipeline: `deepseek-flash-steward+${searchResult.pipeline || 'semantic-search'}`,
  }
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

function formatQuestionGroupForSemanticSearch(group) {
  return {
    id: group.id,
    title: group.title,
    source: group.source,
    section: group.section,
    passageTitle: group.passageTitle,
    summary: safeTruncate(group.summary || '', 280),
    groupType: groupTypeLabels[group.groupType] || group.groupType,
    difficulty: group.difficulty,
    hit: safeTruncate(group.hit || '', 220),
    answerPreview: safeTruncate(group.answerPreview || '', 120),
    tags: group.tags || [],
    topicLabels: (group.topicLabels || []).map((topicLabel) => topicLabel.label),
  }
}

function normalizeReadingSearchSignalQuestion(item) {
  if (!item || typeof item !== 'object') return null
  const questionNo = optionalString(item.questionNo || item.question_no)
  const surfaceQuestion = objectValue(item.surfaceQuestion || item.surface_question)
  const synonymDifficulty = objectValue(item.synonymDifficulty || item.synonym_difficulty)
  const difficultyProfile = objectValue(item.difficultyProfile || item.difficulty_profile)
  const surfaceType = optionalString(surfaceQuestion.type)
  const answeringMove = optionalString(surfaceQuestion.answeringMove || surfaceQuestion.answering_move)
  const cardId = normalizeSynonymCardId(
    synonymDifficulty.cardId || synonymDifficulty.card_id || synonymDifficulty.typeId || synonymDifficulty.type_id,
  )
  const cardName = optionalString(synonymDifficulty.name)
  const finalScore = Number(difficultyProfile.finalScore ?? difficultyProfile.final_score)
  const scoreText = Number.isFinite(finalScore) ? `难度${Math.round(finalScore)}` : ''
  const optionExpression = optionalString(synonymDifficulty.optionExpression || synonymDifficulty.option_expression)
  const questionType = optionalString(item.questionType || item.question_type)
  const pieces = [
    questionNo ? `Q${questionNo}` : '',
    questionType,
    surfaceType,
    answeringMove,
    cardId,
    cardName,
    scoreText,
    optionExpression ? `正确选项:${safeTruncate(optionExpression, 32)}` : '',
  ].filter(Boolean)

  if (pieces.length === 0) return null
  return {
    text: pieces.join(' '),
    surfaceType,
    answeringMove,
    cardId,
    finalScore: Number.isFinite(finalScore) ? finalScore : null,
  }
}

function buildReadingSearchSignals(payload) {
  const questions = Array.isArray(payload?.questions) ? payload.questions : []
  const signalQuestions = questions.map(normalizeReadingSearchSignalQuestion).filter(Boolean)
  if (signalQuestions.length === 0) return null

  const unique = (values) => Array.from(new Set(values.map(optionalString).filter(Boolean)))
  const tCardIds = unique(signalQuestions.map((question) => question.cardId))
  const surfaceTypes = unique(signalQuestions.map((question) => question.surfaceType))
  const answeringMoves = unique(signalQuestions.map((question) => question.answeringMove))
  const finalScores = signalQuestions
    .map((question) => question.finalScore)
    .filter((score) => Number.isFinite(score))
    .map((score) => Math.round(score))
  const highOrderCount = signalQuestions.filter((question) =>
    ['T5', 'T6', 'T7', 'T8', 'T9', 'T10'].includes(question.cardId),
  ).length
  const finalScoreText =
    finalScores.length > 0
      ? `难度分:${unique(finalScores.map(String)).join('/')}`
      : ''
  const summaryPieces = [
    tCardIds.length ? `T卡:${tCardIds.join('/')}` : '',
    surfaceTypes.length ? `题面:${surfaceTypes.join('/')}` : '',
    answeringMoves.length ? `动作:${answeringMoves.join('/')}` : '',
    highOrderCount ? `高阶题:${highOrderCount}` : '',
    finalScoreText,
  ].filter(Boolean)

  return {
    text: [summaryPieces.join('；'), signalQuestions.map((question) => question.text).join('；')].filter(Boolean).join('；'),
    tCardIds,
    surfaceTypes,
    answeringMoves,
    highOrderCount,
    finalScores,
  }
}

function getReadingSearchSignalsForQuestionGroups(db, questionGroupIds) {
  const ids = Array.from(new Set((questionGroupIds || []).map((id) => optionalString(id)).filter(Boolean)))
  const signalsByGroupId = new Map(ids.map((id) => [id, null]))
  if (ids.length === 0) return signalsByGroupId

  const placeholders = ids.map(() => '?').join(', ')
  const rows = db
    .prepare(
      `
      SELECT question_group_id, payload_json
      FROM reading_parse_results
      WHERE question_group_id IN (${placeholders})
      `,
    )
    .all(...ids)

  rows.forEach((row) => {
    const payload = parseSavedJson(row.payload_json)
    const signals = buildReadingSearchSignals(payload)
    if (signals) {
      signalsByGroupId.set(row.question_group_id, signals)
    }
  })

  return signalsByGroupId
}

async function callDeepSeekTopicLabels(context) {
  const allowedLabels = TOPIC_LABEL_TAXONOMY.map((entry, index) => `${index + 1}. ${entry.label}`).join('\n')
  const result = await callDeepSeekWithFallback({
    apiKey: context.apiKey,
    model: context.model,
    provider: context.provider,
    messages: [
      {
        role: 'system',
        content: `${DEEPSEEK_TOPIC_LABEL_PROMPT}\n\n可选标签清单：\n${allowedLabels}`,
      },
      {
        role: 'user',
        content: `请为以下题组/篇章推荐话题标签，并严格只从清单中选择。\n\n${formatQuestionGroupForTopicLabel(context.detail)}`,
      },
    ],
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

function bindTopicLabelsToQuestionGroup(questionGroupId, input) {
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

async function semanticSearchQuestionGroups(query, apiKey, requestId) {
  const normalizedQuery = optionalString(query)
  if (!normalizedQuery) {
    throw new Error('请输入要检索的关键词或语义描述。')
  }

  const resolvedRequestId = requestId || randomUUID()
  const startedAt = Date.now()
  const db = openDatabase()
  let groups
  try {
    const cards = selectQuestionGroupCards(db)
    const readingSignalsByGroupId = getReadingSearchSignalsForQuestionGroups(
      db,
      cards.map((group) => group.id),
    )
    groups = cards.map((group) => ({
      ...group,
      readingSearchSignals: readingSignalsByGroupId.get(group.id) || null,
    }))
  } finally {
    db.close()
  }

  const groupById = new Map(groups.map((group) => [group.id, group]))
  if (groups.length === 0) {
    return {
      query: normalizedQuery,
      matches: [],
      provider: 'deepseek',
      model: DEFAULT_DEEPSEEK_MODEL,
      thinkingMode: false,
      keySource: 'missing',
      keyFingerprint: 'missing',
      keyMask: 'missing',
      requestId: resolvedRequestId,
      totalLatencyMs: elapsedMs(startedAt),
      pipeline: 'deepseek-flash',
    }
  }

  const deepSeekKeySource = describeKeySource(apiKey)
  const deepSeekKey = String(apiKey || DEEPSEEK_API_KEY).trim()
  if (!deepSeekKey) {
    throw new Error('未设置 DeepSeek API Key。请在右上角输入 DeepSeek Key 或设环境变量 DEEPSEEK_API_KEY。')
  }

  const candidatePool = buildSemanticSearchCandidatePool(groups, normalizedQuery)
  console.log(
    `AI semantic search trace=${resolvedRequestId} model=${DEFAULT_DEEPSEEK_MODEL} provider=deepseek thinking=off candidates=${candidatePool.length}/${groups.length}`,
  )

  const candidateText = candidatePool
    .map((candidate, index) => formatSemanticSearchCandidateForDeepSeek(candidate, index))
    .join('\n\n')
  const deepSeekResult = await callDeepSeekWithFallback({
    apiKey: deepSeekKey,
    model: DEFAULT_DEEPSEEK_MODEL,
    provider: 'deepseek',
    messages: [
      {
        role: 'system',
        content: DEEPSEEK_SEMANTIC_RERANK_PROMPT,
      },
      {
        role: 'user',
        content: `检索意图：${normalizedQuery}\n\n候选题组：\n${candidateText}\n\n请按相关度返回最多 ${SEMANTIC_SEARCH_TOP_K} 个 rankings。`,
      },
    ],
    temperature: 0,
    maxTokens: 1800,
    thinkingMode: false,
  })
  const deepSeekRankings = normalizeSemanticSearchRankings(deepSeekResult.parsed)
  const candidateById = new Map(candidatePool.map((candidate) => [candidate.group.id, candidate]))
  const matches = buildSemanticSearchMatchesFromRankings(
    candidatePool,
    deepSeekRankings,
    candidateById,
    (candidate, rankingScore) => clamp01(0.35 * candidate.score + 0.65 * rankingScore),
  ).slice(0, SEMANTIC_SEARCH_TOP_K)

  return {
    query: normalizedQuery,
    matches: matches.map((match, index) => ({
      questionGroupId: match.group.id,
      score: clamp01(match.score),
      reason: buildDeepSeekSemanticSearchReason(match.group, match.deepSeekReason, index),
      questionGroup: groupById.get(match.group.id),
    })),
    provider: 'deepseek',
    model: DEFAULT_DEEPSEEK_MODEL,
    pipeline: 'local-recall+deepseek-flash',
    thinkingMode: false,
    keySource: deepSeekKeySource.source,
    keyFingerprint: maskApiKey(deepSeekKey),
    keyMask: maskApiKey(deepSeekKey),
    requestId: resolvedRequestId,
    totalLatencyMs: elapsedMs(startedAt),
  }
}

async function verifyQuestionGroup(questionGroupId, apiKey, model, verifyRequestId, thinkingMode = false) {
  const keySource = describeKeySource(apiKey)
  const key = String(apiKey || DEEPSEEK_API_KEY).trim()
  if (!key) {
    throw new Error('未设置 API Key。请在右上角输入 DeepSeek Key 或设环境变量 DEEPSEEK_API_KEY。')
  }
  const selectedModel = normalizeDeepSeekModel(model)
  const resolvedVerifyRequestId = verifyRequestId || randomUUID()
  const verifyStartedAt = Date.now()

  const detail = getQuestionGroupDetail(questionGroupId)
  if (!detail) {
    throw new Error('题组未找到。')
  }

  console.log(
    `AI verify trace=${resolvedVerifyRequestId} group=${questionGroupId} model=${selectedModel} thinking=${
      thinkingMode ? 'on' : 'off'
    } keySource=${keySource.source} keyMask=${maskApiKey(key)} questionCount=${detail.questions.length}`,
  )
  appendVerifyAudit({
    type: 'group_start',
    traceId: resolvedVerifyRequestId,
    questionGroupId,
    groupType: detail.groupType,
        model: selectedModel,
        thinkingMode,
        keySource: keySource.source,
        keyMask: maskApiKey(key),
        questionCount: detail.questions.length,
  })

  let calledCount = 0
  const questionCount = detail.questions.length

  const results = []
  for (const question of detail.questions) {
    if (!question.answer) {
      results.push({
        questionId: question.id,
        questionNo: question.questionNo,
        verdict: 'skipped',
        reason: '无答案，跳过验证。',
        apiCall: false,
      })
      continue
    }

    calledCount += 1
    const startedAt = Date.now()
    try {
      const result = await callDeepSeekVerify({
        apiKey: key,
        model: selectedModel,
        thinkingMode,
        questionGroupId,
        groupType: detail.groupType,
        questionId: question.id,
        passageTitle: detail.passage.title,
        passageText: detail.passage.materialText?.slice(0, 2000) || '',
        questionNo: question.questionNo,
        stem: question.stem,
        options: question.options.map((o) => `${o.label}. ${o.content}`).join('\n'),
        answer: question.answer,
        explanation: question.explanation || '',
        traceId: resolvedVerifyRequestId,
      })
      results.push({
        ...result,
        apiCall: true,
        apiLatencyMs: elapsedMs(startedAt),
      })
    } catch (error) {
      const reason = error instanceof Error ? `AI 调用失败：${error.message}` : 'AI 调用失败。'
      results.push({
        questionId: question.id,
        questionNo: question.questionNo,
        verdict: 'uncertain',
        reason,
        apiCall: true,
        apiLatencyMs: elapsedMs(startedAt),
      })
    }
  }

  appendVerifyAudit({
    type: 'group_end',
    traceId: resolvedVerifyRequestId,
    questionGroupId,
    questionCount: detail.questions.length,
    calledCount,
    verifiedCount: results.filter((r) => r.verdict !== 'skipped').length,
  })

  return {
    questionGroupId,
    title: detail.title,
    questionCount,
    verifiedCount: results.filter((r) => r.verdict !== 'skipped').length,
    calledCount,
    keySource: keySource.source,
    keyFingerprint: maskApiKey(key),
    keyMask: maskApiKey(key),
    requestId: resolvedVerifyRequestId,
    model: selectedModel,
    thinkingMode,
    provider: keySource.provider,
    totalLatencyMs: elapsedMs(verifyStartedAt),
    allApiCalled: calledCount === detail.questions.length,
    results,
  }
}

async function callDeepSeekVerify(context) {
  const optionsText = context.options ? `\n选项:\n${context.options}` : ''
  const stem = context.groupType === 'cloze'
    ? `第 ${context.questionNo} 空`
    : context.stem

  const messages = [
    {
      role: 'system',
      content: `你是一位高考英语阅卷老师。请只验证以下试题的当前答案是否正确，不评价解析文本。

题型：${groupTypeLabels[context.groupType]}
篇章：${context.passageTitle}

${context.passageText ? `篇章内容（节选）:\n${context.passageText}` : ''}

返回 JSON 格式：
{"verdict": "correct"|"answer_wrong"|"uncertain", "correctAnswer": "正确的答案（如答案错误）", "reason": "简短理由（中文，50字内）"}`,
    },
    {
      role: 'user',
      content: `请验证：

试题：${stem}${optionsText}
当前答案：${context.answer}`,
    },
  ]

  const requestStartAt = Date.now()
  try {
    console.log(
      `AI verify trace=${context.traceId} q=${context.questionNo} model=${context.model} groupType=${context.groupType} passage=${context.passageTitle}`,
    )

    const verifyParsed = await callDeepSeekWithFallback(
      {
        apiKey: context.apiKey,
        model: context.model,
        expectedResponseSchema: 'verify',
        messages,
        temperature: 0.1,
        maxTokens: context.thinkingMode ? 1600 : 600,
        thinkingMode: context.thinkingMode,
        onHttpResponse: ({ rawStatusText, status, ok, latencyMs }) => {
          appendVerifyAudit({
            type: 'question_call_http',
            traceId: context.traceId,
            questionGroupId: context.questionGroupId || '',
            questionId: context.questionId || '',
            questionNo: context.questionNo,
            model: context.model,
            status,
            ok,
            latencyMs,
            passageTitle: context.passageTitle,
            contentPreview: safeTruncate(rawStatusText, 120),
          })
        },
      },
      (error, options) => {
        appendVerifyAudit({
          type: 'question_call_parse_error',
          traceId: context.traceId,
          questionGroupId: context.questionGroupId || '',
          questionId: context.questionId || '',
          questionNo: context.questionNo,
          model: options?.model || context.model,
          thinkingMode: options?.thinkingMode ? 'on' : 'off',
          expectedResponseSchema: options?.expectedResponseSchema,
          rawPreview: safeTruncate(options?.rawPreview || error.message, 200),
        })
      },
    )

    const parsed = verifyParsed.parsed
    console.log(`AI verify: Q${context.questionNo} verdict from DeepSeek`)
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('DeepSeek 返回结果不符合预期 JSON。')
    }

    if (!parsed.verdict) {
      appendVerifyAudit({
        type: 'question_call_parse_error',
        traceId: context.traceId,
        questionGroupId: context.questionGroupId || '',
        questionId: context.questionId || '',
        questionNo: context.questionNo,
        model: context.model,
        thinkingMode: context.thinkingMode ? 'on' : 'off',
        rawPreview: safeTruncate(String(parsed ? JSON.stringify(parsed) : ''), 200),
      })
    } else {
      appendVerifyAudit({
        type: 'question_call_success',
        traceId: context.traceId,
        questionGroupId: context.questionGroupId || '',
        questionId: context.questionId || '',
        questionNo: context.questionNo,
        verdict: parsed.verdict || 'uncertain',
        reason: parsed.reason || '',
        correctAnswer: parsed.correctAnswer || '',
      })
    }

    return {
      questionId: context.questionId || '',
      questionNo: context.questionNo,
      verdict: parsed.verdict || 'uncertain',
      reason: parsed.reason || '无法解析 AI 返回。',
      correctAnswer: parsed.correctAnswer || '',
    }
  } catch (error) {
    appendVerifyAudit({
      type: 'question_call_error',
      traceId: context.traceId,
      questionGroupId: context.questionGroupId || '',
      questionId: context.questionId || '',
      questionNo: context.questionNo,
      model: context.model,
      errorMessage: error instanceof Error ? error.message : String(error),
      latencyMs: elapsedMs(requestStartAt),
    })
    throw error
  }
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
    if (request.method === 'GET' && url.pathname.startsWith('/paper-assets/')) {
      sendPaperAssetStatic(response, url.pathname)
      return
    }

    if (await runRoutes(serverRoutes, { request, response, url, context: serverContext })) {
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/question-groups') {
      sendJson(response, 200, { questionGroups: listQuestionGroups() })
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

    if (request.method === 'POST' && url.pathname === '/api/ai/semantic-search') {
      const input = await readJsonBody(request)
      const result = await semanticSearchQuestionGroups(input.query, input.apiKey, input.requestId)
      sendJson(response, 200, result)
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/ai/question-bank-steward') {
      const input = await readJsonBody(request)
      const result = await questionBankStewardSearch(input.message || input.query, input.apiKey, input.requestId)
      sendJson(response, 200, result)
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/paper-sets') {
      sendJson(response, 200, { paperSets: listPaperSets() })
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/paper-workflows') {
      sendJson(response, 200, { paperWorkflows: listPaperWorkflowStatuses() })
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/import-files') {
      sendJson(response, 200, { importFiles: listImportFiles() })
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/import-bundles') {
      sendJson(response, 200, { importBundles: listImportBundles() })
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/import-batches') {
      sendJson(response, 200, { importBatches: listImportBatches() })
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/import-batches/scan') {
      const input = await readJsonBody(request)
      const importBatch = scanImportDirectory(input)
      sendJson(response, 201, { importBatch })
      return
    }

    const importBatchRunMatch = url.pathname.match(/^\/api\/import-batches\/([^/]+)\/import$/)
    if (request.method === 'POST' && importBatchRunMatch) {
      const input = await readJsonBody(request)
      const importBatch = runImportBatch(decodeURIComponent(importBatchRunMatch[1]), input)
      if (!importBatch) {
        sendJson(response, 404, { error: 'Import batch not found' })
        return
      }
      sendJson(response, 200, { importBatch })
      return
    }

    const importBundleDraftMatch = url.pathname.match(/^\/api\/import-bundles\/([^/]+)\/draft$/)
    if (request.method === 'POST' && importBundleDraftMatch) {
      const input = await readJsonBody(request)
      const draft = await generateImportBundleDraft(decodeURIComponent(importBundleDraftMatch[1]), input)
      if (!draft) {
        sendJson(response, 404, { error: 'Parsed import bundle not found' })
        return
      }
      sendJson(response, 200, { draft })
      return
    }

    const answerAlignmentMatch = url.pathname.match(/^\/api\/import-bundles\/([^/]+)\/answer-alignment$/)
    if (request.method === 'POST' && answerAlignmentMatch) {
      const alignment = generateAnswerAlignmentDraft(decodeURIComponent(answerAlignmentMatch[1]))
      if (!alignment) {
        sendJson(response, 404, { error: 'Import bundle not found' })
        return
      }
      sendJson(response, 200, { alignment })
      return
    }

    const answerAlignmentApplyMatch = url.pathname.match(/^\/api\/import-bundles\/([^/]+)\/answer-alignment\/apply$/)
    if (request.method === 'POST' && answerAlignmentApplyMatch) {
      const input = await readJsonBody(request)
      const result = applyAnswerAlignment(decodeURIComponent(answerAlignmentApplyMatch[1]), input)
      if (!result) {
        sendJson(response, 404, { error: 'Import bundle not found' })
        return
      }
      sendJson(response, 200, { result })
      return
    }

    const importFileParseMatch = url.pathname.match(/^\/api\/import-files\/([^/]+)\/parse$/)
    if (request.method === 'GET' && importFileParseMatch) {
      const parse = getImportFileParse(decodeURIComponent(importFileParseMatch[1]))
      if (!parse) {
        sendJson(response, 404, { error: 'Import parse not found' })
        return
      }
      sendJson(response, 200, { parse })
      return
    }

    const deleteImportFileMatch = url.pathname.match(/^\/api\/import-files\/([^/]+)$/)
    if (request.method === 'DELETE' && deleteImportFileMatch) {
      const result = deleteImportFile(decodeURIComponent(deleteImportFileMatch[1]))
      if (!result) {
        sendJson(response, 404, { error: 'Import file not found' })
        return
      }
      sendJson(response, 200, { ok: true })
      return
    }

    const paperSetMatch = url.pathname.match(/^\/api\/paper-sets\/([^/]+)$/)
    if (request.method === 'GET' && paperSetMatch) {
      const paperSet = getPaperSet(decodeURIComponent(paperSetMatch[1]))
      if (!paperSet) {
        sendJson(response, 404, { error: 'Paper set not found' })
        return
      }
      sendJson(response, 200, { paperSet })
      return
    }

    const detailMatch = url.pathname.match(/^\/api\/question-groups\/([^/]+)$/)
    const readingParseMatch = url.pathname.match(/^\/api\/question-groups\/([^/]+)\/reading-parse$/)
    const clozeParseMatch = url.pathname.match(/^\/api\/question-groups\/([^/]+)\/cloze-parse$/)
    const sevenChoicesParseMatch = url.pathname.match(/^\/api\/question-groups\/([^/]+)\/seven-choices-parse$/)
    const grammarParseMatch = url.pathname.match(/^\/api\/question-groups\/([^/]+)\/grammar-parse$/)
    const summaryMatch = url.pathname.match(/^\/api\/question-groups\/([^/]+)\/summary$/)
    const topicLabelsMatch = url.pathname.match(/^\/api\/question-groups\/([^/]+)\/topic-labels$/)
    const synonymDifficultyMatch = url.pathname.match(/^\/api\/question-groups\/([^/]+)\/synonym-difficulty$/)
    const questionDifficultyMatch = url.pathname.match(/^\/api\/questions\/([^/]+)\/difficulty-rating$/)
    if (request.method === 'GET' && detailMatch) {
      const questionGroup = getQuestionGroupDetail(decodeURIComponent(detailMatch[1]))
      if (!questionGroup) {
        sendJson(response, 404, { error: 'Question group not found' })
        return
      }
      sendJson(response, 200, { questionGroup })
      return
    }

    if (request.method === 'PUT' && readingParseMatch) {
      const input = await readJsonBody(request, { maxBytes: 3_000_000 })
      const result = saveReadingParseResult(decodeURIComponent(readingParseMatch[1]), input)
      sendJson(response, 200, result)
      return
    }

    if (request.method === 'POST' && readingParseMatch) {
      const input = await readJsonBody(request)
      const result = await parseReadingByQuestionGroup(
        decodeURIComponent(readingParseMatch[1]),
        input.apiKey,
        input.model,
        input.requestId,
        input.thinkingMode,
      )
      sendJson(response, 200, result)
      return
    }

    if (request.method === 'POST' && clozeParseMatch) {
      const input = await readJsonBody(request)
      const result = await parseClozeByQuestionGroup(
        decodeURIComponent(clozeParseMatch[1]),
        input.apiKey,
        input.model,
        input.requestId,
        input.thinkingMode,
      )
      sendJson(response, 200, result)
      return
    }

    if (request.method === 'PUT' && clozeParseMatch) {
      const input = await readJsonBody(request, { maxBytes: 3_000_000 })
      const result = saveClozeParseResult(decodeURIComponent(clozeParseMatch[1]), input)
      sendJson(response, 200, result)
      return
    }

    if (request.method === 'POST' && sevenChoicesParseMatch) {
      const input = await readJsonBody(request)
      const result = await parseSevenChoicesByQuestionGroup(
        decodeURIComponent(sevenChoicesParseMatch[1]),
        input.apiKey,
        input.model,
        input.requestId,
        input.thinkingMode,
      )
      sendJson(response, 200, result)
      return
    }

    if (request.method === 'PUT' && sevenChoicesParseMatch) {
      const input = await readJsonBody(request, { maxBytes: 3_000_000 })
      const result = saveSevenChoicesParseResult(decodeURIComponent(sevenChoicesParseMatch[1]), input)
      sendJson(response, 200, result)
      return
    }

    if (request.method === 'PUT' && questionDifficultyMatch) {
      const input = await readJsonBody(request, { maxBytes: 20_000 })
      let question = null
      try {
        question = saveQuestionDifficultyRating(decodeURIComponent(questionDifficultyMatch[1]), input)
      } catch (error) {
        sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) })
        return
      }
      if (!question) {
        sendJson(response, 404, { error: 'Question not found' })
        return
      }
      sendJson(response, 200, { question })
      return
    }

    if (request.method === 'POST' && grammarParseMatch) {
      const input = await readJsonBody(request)
      const result = await parseGrammarByQuestionGroup(
        decodeURIComponent(grammarParseMatch[1]),
        input.apiKey,
        input.model,
        input.requestId,
        input.thinkingMode,
      )
      sendJson(response, 200, result)
      return
    }

    if (request.method === 'PUT' && grammarParseMatch) {
      const input = await readJsonBody(request, { maxBytes: 3_000_000 })
      const result = saveGrammarParseResult(decodeURIComponent(grammarParseMatch[1]), input)
      sendJson(response, 200, result)
      return
    }

    if (request.method === 'POST' && summaryMatch) {
      const input = await readJsonBody(request)
      const result = await generateQuestionGroupSummary(
        decodeURIComponent(summaryMatch[1]),
        input.apiKey,
        input.model,
        input.requestId,
        input.thinkingMode,
      )
      sendJson(response, 200, result)
      return
    }

    if (request.method === 'POST' && topicLabelsMatch) {
      const input = await readJsonBody(request)
      const result = await generateTopicLabelsByQuestionGroup(
        decodeURIComponent(topicLabelsMatch[1]),
        input.apiKey,
        input.model,
        input.requestId,
        input.thinkingMode,
      )
      sendJson(response, 200, result)
      return
    }

    if (request.method === 'POST' && synonymDifficultyMatch) {
      if (!QUESTION_BANK_ENABLE_LOCAL_QWEN) {
        sendJson(response, 410, {
          error: '题库本地 Qwen 初判已停用。请使用 DeepSeek 阅读解析内置的 synonymDifficulty。',
          replacement: 'POST /api/question-groups/:id/reading-parse',
        })
        return
      }
      const input = await readJsonBody(request, { maxBytes: 3_000_000 })
      const result = await generateSynonymDifficultyByQuestionGroup(
        decodeURIComponent(synonymDifficultyMatch[1]),
        input,
      )
      sendJson(response, 200, result)
      return
    }

    if (request.method === 'PUT' && topicLabelsMatch) {
      const input = await readJsonBody(request, { maxBytes: 1_000_000 })
      const result = bindTopicLabelsToQuestionGroup(decodeURIComponent(topicLabelsMatch[1]), input)
      sendJson(response, 200, result)
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/question-groups') {
      const input = await readJsonBody(request)
      const questionGroup = createQuestionGroup(input)
      sendJson(response, 201, { questionGroup })
      return
    }

    if (request.method === 'PUT' && detailMatch) {
      const input = await readJsonBody(request)
      const questionGroup = updateQuestionGroup(decodeURIComponent(detailMatch[1]), input)
      if (!questionGroup) {
        sendJson(response, 404, { error: 'Question group not found' })
        return
      }
      sendJson(response, 200, { questionGroup })
      return
    }

    if (request.method === 'DELETE' && detailMatch) {
      const result = deleteQuestionGroup(decodeURIComponent(detailMatch[1]))
      if (!result) {
        sendJson(response, 404, { error: 'Question group not found' })
        return
      }
      sendJson(response, 200, { ok: true })
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/paper-sets') {
      const input = await readJsonBody(request)
      const paperSet = createPaperSet(input)
      sendJson(response, 201, { paperSet })
      return
    }

    if (request.method === 'PUT' && paperSetMatch) {
      const input = await readJsonBody(request)
      const updateInput = { ...input, id: decodeURIComponent(paperSetMatch[1]) }
      const paperSet = createPaperSet(updateInput)
      sendJson(response, 200, { paperSet })
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/import-files') {
      const input = await readJsonBody(request, { maxBytes: 35_000_000 })
      const importFile = createImportFile(input)
      sendJson(response, 201, { importFile })
      return
    }

    if (request.method === 'POST' && importFileParseMatch) {
      const parse = parseImportFile(decodeURIComponent(importFileParseMatch[1]))
      if (!parse) {
        sendJson(response, 404, { error: 'Import file not found' })
        return
      }
      sendJson(response, 200, { parse })
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/ai/verify-question-group') {
      const verifyRequestId = randomUUID()
      try {
        const input = await readJsonBody(request)
        const thinkingMode = input?.thinkingMode === true
        console.log(
          `AI verify: trace=${verifyRequestId} group=${input.questionGroupId} model=${input.model || DEFAULT_DEEPSEEK_MODEL} thinking=${thinkingMode ? 'on' : 'off'}`,
        )
        const result = await verifyQuestionGroup(
          input.questionGroupId,
          input.apiKey,
          input.model,
          verifyRequestId,
          thinkingMode,
        )
        if (result.requestId) {
          response.setHeader('x-verify-request-id', result.requestId)
        }
        sendJson(response, 200, result)
      } catch (error) {
        response.setHeader('x-verify-request-id', verifyRequestId)
        sendJson(response, 500, {
          error: error instanceof Error ? error.message : String(error),
          requestId: verifyRequestId,
        })
      }
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/ai/parse-reading') {
      const parseRequestId = randomUUID()
      try {
        const input = await readJsonBody(request)
        const thinkingMode = input?.thinkingMode === true
        console.log(
          `AI parse reading: trace=${parseRequestId} group=${input.questionGroupId} model=${input.model || DEFAULT_DEEPSEEK_MODEL} thinking=${thinkingMode ? 'on' : 'off'}`,
        )
        const result = await parseReadingByQuestionGroup(
          input.questionGroupId,
          input.apiKey,
          input.model,
          parseRequestId,
          thinkingMode,
        )
        if (result.requestId) {
          response.setHeader('x-parse-request-id', result.requestId)
        }
        sendJson(response, 200, result)
      } catch (error) {
        response.setHeader('x-parse-request-id', parseRequestId)
        sendJson(response, 500, {
          error: error instanceof Error ? error.message : String(error),
          requestId: parseRequestId,
        })
      }
      return
    }

    sendJson(response, 404, { error: 'Not found' })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    sendJson(response, 500, { error: message })
  }
})

ensureDatabaseShape()
cleanupPaperImportTempArtifacts(paperAssetsDir)
ensureMySpaceFilesRoot(userSpaceFilesDir)

server.listen(port, '127.0.0.1', () => {
  console.log(`Question bank API listening on http://127.0.0.1:${port}`)
  console.log(`SQLite database: ${dbPath}`)
})
