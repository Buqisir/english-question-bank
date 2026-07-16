/**
 * Restart cut ③ — teacher-version real analysis (paper-assets join).
 *
 * Reads reviewed per-question analysis JSON from app/public/paper-assets/
 * (reading-choice / cloze / grammar-fill / seven-choices) and degrades each
 * question's analysis object into a short Chinese explanation string for
 * print. This module never writes the DB — analysis stays a display-layer
 * join (ADR-0008): questions.explanation is not backfilled.
 *
 * writing / continuation groups are explicitly out of scope: they have no
 * per-question objective analysis file in this shape and are skipped.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { resolvePaperAssetReadPaths } from '../paper-import/storage.mjs'

const MAX_ANALYSIS_TEXT_LENGTH = 600

const ANALYSIS_FILE_BY_GROUP_TYPE = {
  reading: 'reading-choice-analysis-v1.json',
  cloze: 'cloze-analysis-v1.json',
  grammar_cloze: 'grammar-fill-analysis-v1.json',
  seven_choices: 'seven-choices-analysis-v1.json',
}

// groupType values that never carry an objective per-question analysis file
// under this join (writing tasks use a separate writing-analysis envelope
// that is out of scope for this cut).
const EXCLUDED_GROUP_TYPES = new Set(['writing', 'continuation', 'listening', 'other'])

function truncateAnalysisText(text) {
  const chars = Array.from(String(text || '').trim())
  if (chars.length <= MAX_ANALYSIS_TEXT_LENGTH) return chars.join('')
  return `${chars.slice(0, MAX_ANALYSIS_TEXT_LENGTH).join('')}……`
}

function readJsonSafe(filePath) {
  if (!filePath || !existsSync(filePath)) return null
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

/**
 * Find which paper-assets paperId owns a given groupId, by scanning
 * paper-asset.json files (same lookup paperImportRoutes/api.mjs use for
 * findPaperAssetGroup). Returns null when no paper-asset owns the group
 * (e.g. a manually authored question group with no import origin).
 */
function findOwningPaperId(paperAssetsDir, groupId) {
  if (!existsSync(paperAssetsDir)) return null
  let entries
  try {
    entries = readdirSync(paperAssetsDir, { withFileTypes: true })
  } catch {
    return null
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const { assetPath } = resolvePaperAssetReadPaths(paperAssetsDir, entry.name)
    if (!existsSync(assetPath)) continue
    const asset = readJsonSafe(assetPath)
    if (asset?.content?.groups?.[groupId]) return entry.name
  }
  return null
}

function formatReadingText(entry) {
  if (!entry) return ''
  const parts = []
  if (entry.questionFocus) parts.push(String(entry.questionFocus).trim())
  const options = Array.isArray(entry.optionAnalysis) ? entry.optionAnalysis : []
  const correct = options.find((option) => option?.status === 'correct')
  if (correct) {
    const quotes = Array.isArray(correct.evidence)
      ? correct.evidence.map((item) => item?.quote).filter(Boolean)
      : []
    if (quotes.length > 0) {
      parts.push(`正答依据：${quotes.join('；')}`)
    }
  }
  // r2-trap-audit: `suspension.level === 'row'` marks a machine-provable
  // dead trap struct (子结构坏死，无可用解释) — skip it here the same way
  // the panel shows nothing for it (宁缺勿假). `badge`-level suspension
  // only hides the type badge in the panel; the explanation text itself is
  // unaffected and still prints here.
  const traps = options
    .filter((option) => option?.status === 'wrong' && option?.trap?.explanation && option?.trap?.suspension?.level !== 'row')
    .map((option) => `${option.label}. ${option.trap.explanation}`)
  if (traps.length > 0) {
    parts.push(`干扰项：${traps.join('　')}`)
  }
  return parts.join('\n')
}

function formatClozeText(entry) {
  if (!entry) return ''
  const parts = []
  if (entry.correctFit?.reason) {
    parts.push(`正答依据：${entry.correctFit.reason}`)
  }
  const glosses = Array.isArray(entry.distractorGlosses) ? entry.distractorGlosses : []
  const distractorText = glosses
    .map((item) => (item?.optionLabel && item?.meaning ? `${item.optionLabel}. ${item.meaning}` : ''))
    .filter(Boolean)
  if (distractorText.length > 0) {
    parts.push(`干扰项：${distractorText.join('　')}`)
  }
  if (entry.teachingNote) parts.push(`点拨：${entry.teachingNote}`)
  return parts.join('\n')
}

function formatGrammarFillText(entry) {
  if (!entry) return ''
  const parts = []
  if (entry.answer && entry.reason) {
    parts.push(`【${entry.answer}】${entry.reason}`)
  } else if (entry.reason) {
    parts.push(entry.reason)
  }
  if (entry.teachingNote) parts.push(`点拨：${entry.teachingNote}`)
  return parts.join('\n')
}

function formatSevenChoicesText(entry) {
  if (!entry) return ''
  const parts = []
  const signals = Array.isArray(entry.mechanismSignals) ? entry.mechanismSignals : []
  const relations = signals.map((signal) => signal?.relation).filter(Boolean)
  if (relations.length > 0) {
    parts.push(`正答依据：${relations.join('；')}`)
  } else if (entry.optionFit?.fitSummary) {
    parts.push(`正答依据：${entry.optionFit.fitSummary}`)
  }
  const clues = Array.isArray(entry.topicClues) ? entry.topicClues.filter(Boolean) : []
  if (clues.length > 0) {
    parts.push(`话题线索：${clues.join('；')}`)
  }
  if (entry.teachingNote) parts.push(`点拨：${entry.teachingNote}`)
  return parts.join('\n')
}

const FORMATTER_BY_GROUP_TYPE = {
  reading: formatReadingText,
  cloze: formatClozeText,
  grammar_cloze: formatGrammarFillText,
  seven_choices: formatSevenChoicesText,
}

/**
 * Load one asset+analysis bundle for a paperId, caching per paperId so a
 * multi-item export session only reads each paper's analysis files once.
 */
function loadPaperAnalysisBundle(paperAssetsDir, paperId, cache) {
  if (cache.has(paperId)) return cache.get(paperId)
  const { baseDir } = resolvePaperAssetReadPaths(paperAssetsDir, paperId)
  const bundle = { reading: null, cloze: null, grammar_cloze: null, seven_choices: null }
  for (const [groupType, fileName] of Object.entries(ANALYSIS_FILE_BY_GROUP_TYPE)) {
    const filePath = path.join(baseDir, 'analyses', fileName)
    const parsed = readJsonSafe(filePath)
    if (parsed) bundle[groupType] = parsed
  }
  cache.set(paperId, bundle)
  return bundle
}

/**
 * Build a questionId -> analysis text lookup for a set of export items.
 *
 * @param {Array<{ detail: { id: string, groupType: string, questions: Array<{ id: string }> } }>} items
 * @param {{ paperAssetsDir: string }} deps
 * @returns {Map<string, string>} questionId -> Chinese analysis text (may be empty map)
 */
export function loadGroupAnalysisTexts(items, { paperAssetsDir }) {
  const result = new Map()
  if (!Array.isArray(items) || items.length === 0) return result
  if (!paperAssetsDir) return result

  const paperIdByGroupIdCache = new Map()
  const bundleCache = new Map()

  for (const item of items) {
    const detail = item?.detail
    if (!detail) continue
    const groupType = String(detail.groupType || '')
    if (EXCLUDED_GROUP_TYPES.has(groupType)) continue
    const formatter = FORMATTER_BY_GROUP_TYPE[groupType]
    if (!formatter) continue

    const groupId = detail.id
    let paperId = paperIdByGroupIdCache.get(groupId)
    if (paperId === undefined) {
      paperId = findOwningPaperId(paperAssetsDir, groupId)
      paperIdByGroupIdCache.set(groupId, paperId)
    }
    if (!paperId) continue

    const bundle = loadPaperAnalysisBundle(paperAssetsDir, paperId, bundleCache)
    const analysisFile = bundle[groupType]
    if (!analysisFile) continue

    // reading / seven_choices key by `questions`; cloze / grammar_cloze key by `blanks`.
    const table = groupType === 'reading' || groupType === 'seven_choices'
      ? analysisFile.questions
      : analysisFile.blanks
    if (!table || typeof table !== 'object') continue

    for (const question of detail.questions || []) {
      const entry = table[question.id]
      if (!entry) continue
      const text = truncateAnalysisText(formatter(entry))
      if (text) result.set(question.id, text)
    }
  }

  return result
}
