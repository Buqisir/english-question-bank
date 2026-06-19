import Ajv from 'ajv/dist/2020.js'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '../..')
const schemaDir = path.join(rootDir, 'schemas/paper-import')

export const PAPER_IMPORT_LIMITS = {
  maxFiles: 20,
  maxFileBytes: 5_000_000,
  maxTotalBytes: 20_000_000,
}

export const PAPER_IMPORT_SCHEMA_VERSIONS = new Set([
  'paper-asset-v1',
  'answer-key-v1',
  'import-meta-v1',
  'reading-choice-analysis-v1',
  'seven-choices-analysis-v1',
  'cloze-analysis-v1',
  'grammar-fill-analysis-v1',
])

const readingChoiceAnalysisFileName = 'reading-choice-analysis-v1.json'
const paperIdPattern = /^paper-[a-z0-9]+(?:-[a-z0-9]+)*$/
const readingChoiceSuffixPattern = /reading-[abcd]$/i

let ajvCache = null
const schemaCache = new Map()

function loadSchema(schemaFileName) {
  if (!schemaCache.has(schemaFileName)) {
    schemaCache.set(schemaFileName, JSON.parse(readFileSync(path.join(schemaDir, schemaFileName), 'utf8')))
  }
  return schemaCache.get(schemaFileName)
}

function makeAjv() {
  if (ajvCache) return ajvCache
  const ajv = new Ajv({ allErrors: true, strict: false })
  for (const fileName of [
    'paper-asset-v1.schema.json',
    'answer-key-v1.schema.json',
    'import-meta-v1.schema.json',
    'reading-choice-analysis-v1.schema.json',
  ]) {
    const schemaPath = path.join(schemaDir, fileName)
    if (!existsSync(schemaPath)) continue
    const schema = loadSchema(fileName)
    ajv.addSchema(schema, schema.$id)
  }
  ajvCache = ajv
  return ajv
}

function issue(severity, code, message, extra = {}) {
  return {
    severity,
    code,
    message,
    fileName: extra.fileName || null,
    path: extra.path || null,
    suggestedFix: extra.suggestedFix || null,
    ...extra,
  }
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value))
}

function normalizeWhitespace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function compactComparable(value) {
  return normalizeWhitespace(value)
    .replace(/[“”]/g, '"')
    .replace(/[’]/g, "'")
}

function countMatches(text, quote) {
  if (!quote) return 0
  let count = 0
  let offset = 0
  while (offset <= text.length) {
    const index = text.indexOf(quote, offset)
    if (index === -1) break
    count += 1
    offset = index + Math.max(quote.length, 1)
  }
  return count
}

function countQuoteMatches(text, quote) {
  const exact = countMatches(text, quote)
  if (exact > 0) return { count: exact, mode: 'exact' }
  const normalizedText = compactComparable(text)
  const normalizedQuote = compactComparable(quote)
  const normalized = countMatches(normalizedText, normalizedQuote)
  return { count: normalized, mode: normalized > 0 ? 'normalizedWhitespace' : 'missing' }
}

function getGroupLetter(groupId) {
  const match = String(groupId || '').match(/reading-([abcd])$/i)
  return match ? match[1].toUpperCase() : ''
}

function getReadingChoiceGroups(asset) {
  const groups = asset?.content?.groups || {}
  return Object.values(groups)
    .filter((group) => group?.groupType === 'reading' && readingChoiceSuffixPattern.test(group.groupId))
    .sort((a, b) => getGroupLetter(a.groupId).localeCompare(getGroupLetter(b.groupId)))
}

function getGroupParagraphTextById(group) {
  const result = new Map()
  for (const paragraph of group?.passage?.paragraphs || []) {
    if (paragraph?.paragraphId) {
      result.set(String(paragraph.paragraphId), String(paragraph.text || ''))
    }
  }
  return result
}

function optionLabelSet(question) {
  return new Set((question?.options || []).map((option) => String(option.label)))
}

function labelsEqual(a, b) {
  if (a.size !== b.size) return false
  for (const value of a) {
    if (!b.has(value)) return false
  }
  return true
}

function detectJsonSchemaVersion(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const schemaVersion = parsed.schemaVersion
  return typeof schemaVersion === 'string' ? schemaVersion : null
}

function parseJsonStrict(file) {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(file.buffer)
  const trimmed = text.trim()
  if (trimmed.startsWith('```') || trimmed.endsWith('```')) {
    throw new Error('JSON 文件不能包含 Markdown code fence。')
  }
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
    throw new Error('JSON 顶层必须是对象，不能是数组、纯文本或带解释说明。')
  }
  const parsed = JSON.parse(trimmed)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('JSON 顶层必须是对象。')
  }
  return parsed
}

function validateSchema(schemaId, data, fileName) {
  const ajv = makeAjv()
  const validate = ajv.getSchema(schemaId)
  if (!validate) return [] // Schema not available (e.g. seven-choices-analysis-v1); skip AJV validation.
  if (validate(data)) return []
  return (validate.errors || []).map((error) =>
    issue('blocking', 'schema.invalid', `${fileName}: ${error.instancePath || '/'} ${error.message}`, {
      fileName,
      path: error.instancePath || '/',
      suggestedFix: '按 schema 修正字段、类型或枚举值后重新上传。',
    }),
  )
}

function pointerFor(pathParts) {
  if (pathParts.length === 0) return '/'
  return `/${pathParts.map((part) => String(part).replace(/~/g, '~0').replace(/\//g, '~1')).join('/')}`
}

function stripUnknownFields(value, schema, warnings, fileName, pathParts = []) {
  if (!schema || typeof schema !== 'object' || !value || typeof value !== 'object') {
    return
  }

  if (Array.isArray(value)) {
    if (schema.items) {
      value.forEach((item, index) => stripUnknownFields(item, schema.items, warnings, fileName, [...pathParts, index]))
    }
    return
  }

  const properties = schema.properties && typeof schema.properties === 'object' ? schema.properties : {}
  const hasKnownProperties = Object.keys(properties).length > 0
  if (schema.additionalProperties === false && hasKnownProperties) {
    for (const key of Object.keys(value)) {
      if (!Object.prototype.hasOwnProperty.call(properties, key)) {
        delete value[key]
        const pathValue = pointerFor([...pathParts, key])
        warnings.push(issue('warning', 'json.unknownFieldStripped', `${fileName}: 已移除未知字段 ${pathValue}。`, {
          fileName,
          path: pathValue,
          suggestedFix: '删除 schema 未定义字段后重新导出 JSON。',
        }))
      }
    }
  }

  for (const [key, childSchema] of Object.entries(properties)) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      stripUnknownFields(value[key], childSchema, warnings, fileName, [...pathParts, key])
    }
  }
}

function stripUnknownFieldsForSchema(schemaId, data, warnings, fileName) {
  const schemaPath = path.join(schemaDir, schemaId)
  if (!existsSync(schemaPath)) return
  const schema = loadSchema(schemaId)
  stripUnknownFields(data, schema, warnings, fileName)
}

function classifyFile(file) {
  const fileName = path.basename(String(file.fileName || ''))
  const ext = path.extname(fileName).toLowerCase()
  if (!fileName || fileName !== file.fileName) {
    return { kind: 'rejected', fileName, reason: '文件名不能包含路径。' }
  }
  if (ext === '.docx') return { kind: 'docx', fileName }
  if (ext === '.json') return { kind: 'json', fileName }
  return { kind: 'rejected', fileName, reason: '只允许 .docx 和 .json。' }
}

function validateReadingAnalysisBundle({ asset, answerKey, analyses, blockingIssues, warnings }) {
  const merged = {
    schemaVersion: 'reading-choice-analysis-v1',
    paperId: asset.paper.paperId,
    sourceAssetVersion: asset.paper.assetVersion,
    targetGroups: [],
    meta: {},
    groups: {},
    questions: {},
  }
  const groupOwners = new Map()
  const questionOwners = new Map()

  for (const entry of analyses) {
    const analysis = entry.data
    if (analysis.paperId !== asset.paper.paperId) {
      blockingIssues.push(issue('blocking', 'analysis.paperIdMismatch', `${entry.fileName}: paperId 与 paper-asset 不一致。`, {
        fileName: entry.fileName,
        suggestedFix: `把 paperId 改为 ${asset.paper.paperId}。`,
      }))
      continue
    }
    if (analysis.sourceAssetVersion !== asset.paper.assetVersion) {
      blockingIssues.push(issue('blocking', 'analysis.assetVersionMismatch', `${entry.fileName}: sourceAssetVersion 与 paper-asset 不一致。`, {
        fileName: entry.fileName,
        suggestedFix: `把 sourceAssetVersion 改为 ${asset.paper.assetVersion}。`,
      }))
      continue
    }
    const isMultiTarget = Array.isArray(analysis.targetGroups) && analysis.targetGroups.length > 1
    if (isMultiTarget) {
      warnings.push(issue('warning', 'analysis.multiTargetFile', `${entry.fileName}: 多 targetGroups 文件允许导入，但会归并为统一 reading-choice-analysis-v1.json。`, {
        fileName: entry.fileName,
      }))
    }
    merged.meta = { ...merged.meta, ...(analysis.meta || {}) }
    for (const groupId of analysis.targetGroups || []) {
      const previous = groupOwners.get(groupId)
      if (previous && !isMultiTarget && !previous.isMultiTarget) {
        blockingIssues.push(issue('blocking', 'analysis.groupConflict', `${groupId} 在多个同级 analysis 文件中重复出现。`, {
          fileName: entry.fileName,
          suggestedFix: '每个 reading group 只保留一个解析文件，或使用总文件 + 单 group override。',
        }))
      }
      if (previous) {
        warnings.push(issue('warning', 'analysis.groupOverride', `${groupId} 使用 ${entry.fileName} 覆盖 ${previous.fileName}。`, {
          fileName: entry.fileName,
        }))
      }
      groupOwners.set(groupId, { fileName: entry.fileName, isMultiTarget })
      if (!merged.targetGroups.includes(groupId)) merged.targetGroups.push(groupId)
      if (analysis.groups?.[groupId]) {
        merged.groups[groupId] = analysis.groups[groupId]
      }
    }
    for (const [questionId, questionAnalysis] of Object.entries(analysis.questions || {})) {
      const previous = questionOwners.get(questionId)
      if (previous && !isMultiTarget && !previous.isMultiTarget) {
        blockingIssues.push(issue('blocking', 'analysis.questionConflict', `${questionId} 在多个同级 analysis 文件中重复出现。`, {
          fileName: entry.fileName,
        }))
      }
      if (previous) {
        warnings.push(issue('warning', 'analysis.questionOverride', `${questionId} 使用 ${entry.fileName} 覆盖 ${previous.fileName}。`, {
          fileName: entry.fileName,
        }))
      }
      questionOwners.set(questionId, { fileName: entry.fileName, isMultiTarget })
      merged.questions[questionId] = cloneJson(questionAnalysis)
    }
  }

  const readingGroups = getReadingChoiceGroups(asset)
  // 阅读篇数随试卷格式: 新课标完形15题→阅读4篇(A–D); 老卷完形20题→浙江3篇(A–C)/全国4篇(A–D)。
  // 与 packageBuilder resolveFormatProfile 同一信号(完形题数为主键,cloze=20 再按阅读篇数分流;MF-3),
  // 避免把浙江3篇误判成"缺 Reading D",同时全国4篇仍严格要 A–D(漏 D 照报)。新课标(cloze≠20)恒要 4 篇。
  const clozeGroupForFmt = Object.values(asset.content?.groups || {}).find((group) => group?.groupType === 'cloze')
  const clozeCountForFmt = Array.isArray(clozeGroupForFmt?.questionIds) ? clozeGroupForFmt.questionIds.length : 0
  const actualLetters = new Set(readingGroups.map((group) => getGroupLetter(group.groupId)))
  const expectedLetters =
    clozeCountForFmt === 20
      ? actualLetters.has('D') // 全国老卷(4篇含D) → A–D; 浙江老卷(3篇) → A–C
        ? new Set(['A', 'B', 'C', 'D'])
        : new Set(['A', 'B', 'C'])
      : new Set(['A', 'B', 'C', 'D'])
  for (const letter of expectedLetters) {
    if (!actualLetters.has(letter)) {
      blockingIssues.push(issue('blocking', 'paperAsset.readingGroupMissing', `缺少 Reading ${letter} 题组。`, {
        suggestedFix: `在 paper-asset.content.groups 中补齐 Reading ${letter} 题组。`,
      }))
    }
  }

  for (const group of readingGroups) {
    if (!merged.targetGroups.includes(group.groupId)) {
      blockingIssues.push(issue('blocking', 'analysis.groupMissing', `${group.groupId} 缺少 reviewed reading analysis。`, {
        suggestedFix: '补充该 group 的 reading-choice-analysis-v1 解析。',
      }))
    }
    const paragraphTextById = getGroupParagraphTextById(group)
    for (const questionId of group.questionIds || []) {
      const question = asset.content.questions?.[questionId]
      if (!question) {
        blockingIssues.push(issue('blocking', 'paperAsset.questionMissing', `${group.groupId} 引用的 ${questionId} 不存在。`, {
          suggestedFix: '修正 group.questionIds 或补齐 content.questions。',
        }))
        continue
      }
      const keyAnswer = answerKey.answers?.[questionId]
      if (!keyAnswer) {
        blockingIssues.push(issue('blocking', 'answerKey.questionMissing', `${questionId} 缺少 answer-key。`, {
          suggestedFix: '在 answer-key.json 中补齐该题答案。',
        }))
      }
      const embeddedAnswer = asset.answerKey?.answers?.[questionId]
      if (embeddedAnswer && keyAnswer && embeddedAnswer.answer !== keyAnswer.answer) {
        blockingIssues.push(issue('blocking', 'answerKey.assetMismatch', `${questionId} 的 answer-key 与 paper-asset.answerKey 不一致。`, {
          suggestedFix: '让 answer-key.json 与 paper-asset.answerKey 使用同一个正确答案。',
        }))
      }
      const analysis = merged.questions[questionId]
      if (!analysis) {
        blockingIssues.push(issue('blocking', 'analysis.questionMissing', `${questionId} 缺少 reviewed analysis。`, {
          suggestedFix: '补齐该题解析。',
        }))
        continue
      }
      const expectedLabels = optionLabelSet(question)
      const actualLabels = new Set((analysis.optionAnalysis || []).map((option) => String(option.label)))
      if (!labelsEqual(expectedLabels, actualLabels)) {
        blockingIssues.push(issue('blocking', 'analysis.optionLabelsMismatch', `${questionId} 的 optionAnalysis label 集合与题目选项不一致。`, {
          suggestedFix: '让 optionAnalysis 覆盖且只覆盖题目 A/B/C/D 选项。',
        }))
      }
      const correct = (analysis.optionAnalysis || []).find((option) => option.status === 'correct')
      if (keyAnswer && correct && String(correct.label) !== String(keyAnswer.answer)) {
        blockingIssues.push(issue('blocking', 'analysis.answerMismatch', `${questionId} 的 correct option 与 answer-key 不一致。`, {
          suggestedFix: `把正确项设为 ${keyAnswer.answer}，或修正 answer-key。`,
        }))
      }
      for (const option of analysis.optionAnalysis || []) {
        const isCorrect = option.status === 'correct'
        const evidenceRows = isCorrect ? option.evidence || [] : option.trapEvidence || []
        if (option.trap?.primaryType === 'unsupportedClaim' && Array.isArray(option.trapEvidence) && option.trapEvidence.length > 0) {
          delete option.trapEvidence
          warnings.push(issue('warning', 'analysis.unsupportedClaimEvidenceStripped', `${questionId} ${option.label}: unsupportedClaim 不允许 evidence line，已在 normalized 输出中移除 trapEvidence。`, {
            suggestedFix: '无中生有只写 explanation，不写 trapEvidence。',
          }))
          continue
        }
        for (const evidence of evidenceRows) {
          const paragraphId = String(evidence?.paragraphId || '')
          const quote = String(evidence?.quote || '')
          if (!paragraphTextById.has(paragraphId)) {
            blockingIssues.push(issue('blocking', 'analysis.unknownParagraphId', `${questionId} ${option.label}: paragraphId ${paragraphId} 不属于该题组。`, {
              suggestedFix: '改为该 passage 中真实存在的 paragraphId。',
            }))
            continue
          }
          const paragraphText = paragraphTextById.get(paragraphId)
          const match = countQuoteMatches(paragraphText, quote)
          if (match.count === 0) {
            blockingIssues.push(issue('blocking', 'analysis.unresolvedQuote', `${questionId} ${option.label}: quote 无法在 ${paragraphId} 定位。`, {
              suggestedFix: '把 quote 改成原文中可定位的连续文本，或修正 paragraphId。',
              quote,
            }))
          } else if (match.count > 1 && evidence.occurrenceIndex == null) {
            blockingIssues.push(issue('blocking', 'analysis.multiMatchQuote', `${questionId} ${option.label}: quote 在 ${paragraphId} 出现多次但没有 occurrenceIndex。`, {
              suggestedFix: '补 occurrenceIndex 或扩大 quote 到唯一可定位文本。',
              quote,
            }))
          } else if (match.mode === 'normalizedWhitespace') {
            warnings.push(issue('warning', 'analysis.quoteWhitespaceNormalized', `${questionId} ${option.label}: quote 通过空白规整后可定位。`, {
              suggestedFix: '建议改成与 paper-asset 段落完全一致的连续原文。',
              quote,
            }))
          }
        }
      }
    }
  }

  merged.targetGroups.sort()
  return merged
}

function buildStructurePreview(asset) {
  const groups = Object.values(asset?.content?.groups || {})
  return groups.map((group) => ({
    groupId: group.groupId,
    groupType: group.groupType,
    title: group.title,
    questionIds: group.questionIds || [],
    paragraphCount: Array.isArray(group.passage?.paragraphs) ? group.passage.paragraphs.length : 0,
  }))
}

function validateNonReadingCompleteness({ asset, answerKey, warnings }) {
  for (const group of Object.values(asset?.content?.groups || {})) {
    const isReadingChoiceGroup = group?.groupType === 'reading' && readingChoiceSuffixPattern.test(group.groupId)
    if (isReadingChoiceGroup) continue

    for (const questionId of group?.questionIds || []) {
      if (!asset.content.questions?.[questionId]) {
        warnings.push(issue('warning', 'nonReading.questionMissing', `${group.groupId}: ${questionId} 不存在。非 Reading A-D 暂不阻断发布。`, {
          suggestedFix: '后续开放该题型前，补齐 paper-asset.content.questions。',
          groupId: group.groupId,
          questionId,
        }))
      }
      if (!answerKey.answers?.[questionId]) {
        warnings.push(issue('warning', 'nonReading.answerKeyMissing', `${group.groupId}: ${questionId} 缺少 answer-key。非 Reading A-D 暂不阻断发布。`, {
          suggestedFix: '后续开放该题型前，补齐 answer-key.json。',
          groupId: group.groupId,
          questionId,
        }))
      }
    }
  }
}

function validateParsedBundle(parsedFiles, warnings, blockingIssues) {
  const paperAssetEntries = parsedFiles.filter((entry) => entry.schemaVersion === 'paper-asset-v1')
  const answerKeyEntries = parsedFiles.filter((entry) => entry.schemaVersion === 'answer-key-v1')
  const importMetaEntries = parsedFiles.filter((entry) => entry.schemaVersion === 'import-meta-v1')
  const analysisEntries = parsedFiles.filter((entry) => entry.schemaVersion === 'reading-choice-analysis-v1')
  const scAnalysisEntries = parsedFiles.filter((entry) => entry.schemaVersion === 'seven-choices-analysis-v1')
  const clozeAnalysisEntries = parsedFiles.filter((entry) => entry.schemaVersion === 'cloze-analysis-v1')
  const grammarFillAnalysisEntries = parsedFiles.filter((entry) => entry.schemaVersion === 'grammar-fill-analysis-v1')

  if (paperAssetEntries.length !== 1) {
    blockingIssues.push(issue('blocking', 'package.paperAssetCount', '必须且只能上传 1 个 paper-asset-v1 JSON。', {
      suggestedFix: '保留一个 paper-asset.json。',
    }))
  }
  if (answerKeyEntries.length !== 1) {
    blockingIssues.push(issue('blocking', 'package.answerKeyCount', '必须且只能上传 1 个 answer-key-v1 JSON。', {
      suggestedFix: '补充或保留一个 answer-key.json。',
    }))
  }
  if (importMetaEntries.length !== 1) {
    blockingIssues.push(issue('blocking', 'package.importMetaCount', '必须且只能上传 1 个 import-meta-v1 JSON。', {
      suggestedFix: '补充或保留一个 import-meta.json。',
    }))
  }
  if (analysisEntries.length < 1) {
    blockingIssues.push(issue('blocking', 'package.analysisMissing', '至少上传 1 个 reading-choice-analysis-v1 JSON。', {
      suggestedFix: '补充总解析文件或按 Reading A-D 拆分的解析文件。',
    }))
  }
  if (scAnalysisEntries.length > 1) {
    blockingIssues.push(issue('blocking', 'package.tooManySevenChoicesAnalysis', '最多上传 1 个 seven-choices-analysis-v1 JSON。'))
  }
  if (clozeAnalysisEntries.length > 1) {
    blockingIssues.push(issue('blocking', 'package.tooManyClozeAnalysis', '最多上传 1 个 cloze-analysis-v1 JSON。'))
  }
  if (grammarFillAnalysisEntries.length > 1) {
    blockingIssues.push(issue('blocking', 'package.tooManyGrammarFillAnalysis', '最多上传 1 个 grammar-fill-analysis-v1 JSON。'))
  }
  if (blockingIssues.length > 0 || !paperAssetEntries[0] || !answerKeyEntries[0] || !importMetaEntries[0]) {
    return null
  }

  const paperAsset = cloneJson(paperAssetEntries[0].data)
  const answerKey = cloneJson(answerKeyEntries[0].data)
  const importMeta = cloneJson(importMetaEntries[0].data)

  if (!paperIdPattern.test(paperAsset.paper.paperId)) {
    blockingIssues.push(issue('blocking', 'paperId.invalid', `${paperAsset.paper.paperId} 不符合 paperId 命名规则。`))
  }
  if (answerKey.paperId !== paperAsset.paper.paperId) {
    blockingIssues.push(issue('blocking', 'answerKey.paperIdMismatch', 'answer-key paperId 与 paper-asset 不一致。'))
  }
  if (importMeta.paperId !== paperAsset.paper.paperId) {
    blockingIssues.push(issue('blocking', 'importMeta.paperIdMismatch', 'import-meta paperId 与 paper-asset 不一致。'))
  }
  if (answerKey.sourceAssetVersion !== paperAsset.paper.assetVersion) {
    blockingIssues.push(issue('blocking', 'answerKey.assetVersionMismatch', 'answer-key sourceAssetVersion 与 paper-asset 不一致。'))
  }

  for (const questionId of Object.keys(answerKey.answers || {})) {
    if (!paperAsset.content.questions?.[questionId]) {
      blockingIssues.push(issue('blocking', 'answerKey.unknownQuestion', `${questionId} 在 answer-key 中存在，但 paper-asset.content.questions 不存在。`))
    }
  }

  const readingAnalysis = validateReadingAnalysisBundle({
    asset: paperAsset,
    answerKey,
    analyses: analysisEntries,
    blockingIssues,
    warnings,
  })

  // Seven-choices analysis is optional; pass through if present.
  const scAnalysis = scAnalysisEntries.length === 1 ? cloneJson(scAnalysisEntries[0].data) : null
  if (scAnalysis && scAnalysis.paperId !== paperAsset.paper.paperId) {
    warnings.push(issue('warning', 'sevenChoicesAnalysis.paperIdMismatch', 'seven-choices-analysis paperId 与 paper-asset 不一致，将以 paper-asset 为准。'))
  }

  // Cloze analysis is optional; pass through if present.
  const clozeAnalysis = clozeAnalysisEntries.length === 1 ? cloneJson(clozeAnalysisEntries[0].data) : null
  if (clozeAnalysis && clozeAnalysis.paperId !== paperAsset.paper.paperId) {
    warnings.push(issue('warning', 'clozeAnalysis.paperIdMismatch', 'cloze-analysis paperId 与 paper-asset 不一致，将以 paper-asset 为准。'))
  }

  // Grammar-fill analysis is optional; pass through if present.
  const grammarFillAnalysis = grammarFillAnalysisEntries.length === 1 ? cloneJson(grammarFillAnalysisEntries[0].data) : null
  if (grammarFillAnalysis && grammarFillAnalysis.paperId !== paperAsset.paper.paperId) {
    warnings.push(issue('warning', 'grammarFillAnalysis.paperIdMismatch', 'grammar-fill-analysis paperId 与 paper-asset 不一致，将以 paper-asset 为准。'))
  }

  validateNonReadingCompleteness({ asset: paperAsset, answerKey, warnings })

  return {
    paperAsset,
    answerKey,
    importMeta,
    readingAnalysis,
    scAnalysis,
    clozeAnalysis,
    grammarFillAnalysis,
  }
}

export function validatePaperImportPackage(files, options = {}) {
  const warnings = []
  const blockingIssues = []
  const acceptedFiles = []
  const rejectedFiles = []
  const docxFiles = []
  const jsonFiles = []
  const parsedFiles = []

  if (!Array.isArray(files) || files.length === 0) {
    blockingIssues.push(issue('blocking', 'package.empty', '请上传一个完整试卷包。'))
  }
  if (files.length > PAPER_IMPORT_LIMITS.maxFiles) {
    blockingIssues.push(issue('blocking', 'limits.tooManyFiles', `最多允许 ${PAPER_IMPORT_LIMITS.maxFiles} 个文件。`))
  }

  let totalBytes = 0
  for (const rawFile of files || []) {
    const file = {
      fileName: String(rawFile.fileName || ''),
      contentType: rawFile.contentType || '',
      buffer: Buffer.isBuffer(rawFile.buffer) ? rawFile.buffer : Buffer.from(rawFile.buffer || ''),
    }
    const size = file.buffer.byteLength
    totalBytes += size
    const classified = classifyFile(file)
    if (size > PAPER_IMPORT_LIMITS.maxFileBytes) {
      rejectedFiles.push({ fileName: file.fileName, reason: '单文件超过 5MB。' })
      blockingIssues.push(issue('blocking', 'limits.fileTooLarge', `${file.fileName} 超过 5MB。`, { fileName: file.fileName }))
      continue
    }
    if (classified.kind === 'rejected') {
      rejectedFiles.push({ fileName: file.fileName, reason: classified.reason })
      blockingIssues.push(issue('blocking', 'package.rejectedFileType', `${file.fileName}: ${classified.reason}`, { fileName: file.fileName }))
      continue
    }
    acceptedFiles.push({ fileName: file.fileName, size, kind: classified.kind })
    if (classified.kind === 'docx') docxFiles.push(file)
    if (classified.kind === 'json') jsonFiles.push(file)
  }

  if (totalBytes > PAPER_IMPORT_LIMITS.maxTotalBytes) {
    blockingIssues.push(issue('blocking', 'limits.packageTooLarge', '试卷包总大小超过 20MB。'))
  }
  if (docxFiles.length !== 1) {
    blockingIssues.push(issue('blocking', 'package.docxCount', '必须且只能上传 1 个 DOCX 源文件。', {
      suggestedFix: '保留一份试题正文 DOCX。',
    }))
  }
  const sourceDocx = docxFiles[0] || null
  if (sourceDocx && sourceDocx.buffer.subarray(0, 2).toString('utf8') !== 'PK') {
    blockingIssues.push(issue('blocking', 'docx.invalidMagic', `${sourceDocx.fileName} 不是有效 DOCX/ZIP 容器。`, {
      fileName: sourceDocx.fileName,
      suggestedFix: '上传真实 .docx 文件，不要改后缀。',
    }))
  }

  for (const file of jsonFiles) {
    try {
      const parsed = parseJsonStrict(file)
      const schemaVersion = detectJsonSchemaVersion(parsed)
      if (!schemaVersion) {
        blockingIssues.push(issue('blocking', 'json.schemaVersionMissing', `${file.fileName} 缺少 schemaVersion。`, {
          fileName: file.fileName,
        }))
        continue
      }
      if (!PAPER_IMPORT_SCHEMA_VERSIONS.has(schemaVersion)) {
        blockingIssues.push(issue('blocking', 'json.schemaVersionUnknown', `${file.fileName} 的 schemaVersion 不受支持：${schemaVersion}`, {
          fileName: file.fileName,
        }))
        continue
      }
      stripUnknownFieldsForSchema(`${schemaVersion}.schema.json`, parsed, warnings, file.fileName)
      const schemaIssues = validateSchema(`${schemaVersion}.schema.json`, parsed, file.fileName)
      blockingIssues.push(...schemaIssues)
      parsedFiles.push({ fileName: file.fileName, schemaVersion, data: parsed })
    } catch (error) {
      blockingIssues.push(issue('blocking', 'json.parseFailed', `${file.fileName}: ${error instanceof Error ? error.message : String(error)}`, {
        fileName: file.fileName,
        suggestedFix: '输出纯 JSON 文件，不要 code fence、说明文字、JSON5 或尾逗号。',
      }))
    }
  }

  const normalized = validateParsedBundle(parsedFiles, warnings, blockingIssues)
  if (normalized && sourceDocx) {
    const docxDigest = sha256(sourceDocx.buffer)
    if (normalized.importMeta.sourceFileName !== sourceDocx.fileName) {
      warnings.push(issue('warning', 'importMeta.sourceFileNameMismatch', 'import-meta sourceFileName 与上传 DOCX 文件名不一致，将以实际上传文件为准。'))
      normalized.importMeta.sourceFileName = sourceDocx.fileName
    }
    if (normalized.importMeta.sourceFileSha256 !== docxDigest) {
      blockingIssues.push(issue('blocking', 'importMeta.sourceShaMismatch', 'import-meta sourceFileSha256 与上传 DOCX SHA-256 不一致。', {
        suggestedFix: `把 sourceFileSha256 改为 ${docxDigest}，或上传匹配的 DOCX。`,
      }))
    }
    normalized.sourceDocx = {
      fileName: sourceDocx.fileName,
      buffer: sourceDocx.buffer,
      sha256: docxDigest,
    }
    normalized.paperAsset.paper.status = 'published'
    normalized.paperAsset.sources = {
      ...normalized.paperAsset.sources,
      docx: {
        ...(normalized.paperAsset.sources?.docx || {}),
        fileName: sourceDocx.fileName,
        sha256: docxDigest,
      },
    }
  }

  const paperId = normalized?.paperAsset?.paper?.paperId || null
  const assetVersion = normalized?.paperAsset?.paper?.assetVersion || null
  const readingGroups = normalized ? getReadingChoiceGroups(normalized.paperAsset) : []

  return {
    ok: blockingIssues.length === 0,
    paperId,
    assetVersion,
    acceptedFiles,
    rejectedFiles,
    warnings,
    blockingIssues,
    structurePreview: normalized ? buildStructurePreview(normalized.paperAsset) : [],
    readingGroups: readingGroups.map((group) => ({
      groupId: group.groupId,
      title: group.title,
      questionIds: group.questionIds,
      defaultQuestionId: group.questionIds?.[0] || null,
    })),
    packageData: normalized,
    limits: PAPER_IMPORT_LIMITS,
    generatedAt: options.now || new Date().toISOString(),
  }
}

export function makePublicValidationReport(report) {
  return {
    ok: report.ok,
    paperId: report.paperId,
    assetVersion: report.assetVersion,
    acceptedFiles: report.acceptedFiles,
    rejectedFiles: report.rejectedFiles,
    warnings: report.warnings,
    blockingIssues: report.blockingIssues,
    structurePreview: report.structurePreview,
    readingGroups: report.readingGroups,
    limits: report.limits,
    generatedAt: report.generatedAt,
  }
}

export function readImportPackageFromDirectory(dirPath) {
  if (!existsSync(dirPath)) {
    throw new Error(`Import fixture directory not found: ${dirPath}`)
  }
  return readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const filePath = path.join(dirPath, entry.name)
      return {
        fileName: entry.name,
        buffer: readFileSync(filePath),
      }
    })
}

export { countQuoteMatches, getReadingChoiceGroups, issue as makePaperImportIssue, sha256 }
