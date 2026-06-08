import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createAnalyzerProviderShell, readPromptFile, rewriteApiPrompt } from './analyzerProviderShell.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '../..')
const promptPath = path.join(rootDir, 'prompts/grammar-fill-analysis-v1.md')
const facetsPath = path.join(__dirname, 'grammar-fill-facets-v1.json')

// ============================================================
// Registry: 16 leaf facets
// ============================================================

const FACET_REGISTRY = JSON.parse(readFileSync(facetsPath, 'utf8'))
const LEAF_FACET_KEYS = new Set(FACET_REGISTRY.map((f) => f.facet_key))
const FACET_BLANK_TYPE = Object.fromEntries(FACET_REGISTRY.map((f) => [f.facet_key, f.blank_type]))

// Parent nodes that are NOT valid leaf facetKeys.
const PARENT_FACET_KEYS = new Set([
  'grammar-fill',
  'grammar-fill.given',
  'grammar-fill.given.verb',
  'grammar-fill.given.derivation',
  'grammar-fill.no-hint',
  'grammar-fill.no-hint.conjunction',
])

const NON_FINITE_FACET = 'grammar-fill.given.verb.non-finite'

const VALID_ROLE_VALUES = new Set([
  'subject',
  'predicative',
  'object',
  'attributive',
  'adverbial',
  'object-complement',
  'subject-complement',
])

const VALID_PATH_VALUES = new Set(['fast', 'slow'])

const VALID_EVIDENCE_TYPES = new Set([
  'subject',
  'time-marker',
  'antecedent',
  'modified-word',
  'governing-word',
  'collocation',
  'comparison',
  'parallel',
  'connector',
  'clause-frame',
  'of-phrase',
  'determiner',
])

// Blank-marker patterns that must NOT appear in signalText.
// Two-space-surrounded numbers 56-65, or (word) hint tokens.
const BLANK_MARKER_RE = /\s{2}(?:5[6-9]|6[0-5])\s{2}|\([A-Za-z]+\)/

// ============================================================
// Helpers
// ============================================================

function optionalString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function readApiPrompt() {
  return rewriteApiPrompt(readPromptFile(promptPath))
}

// ============================================================
// C1: FROZEN 4-op answer normalization
// Exactly: trim → collapse-ws → lowercase → split on '/'
// FORBIDDEN: NO stemming, NO lemmatization, NO punctuation-strip, NO fuzzy
// ============================================================

function normalizeAnswerBranch(raw) {
  return String(raw)
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

function answerMatchesKey(aiAnswer, answerKey) {
  const normalizedAi = normalizeAnswerBranch(aiAnswer)
  const branches = String(answerKey).split('/').map(normalizeAnswerBranch)
  return branches.some((branch) => normalizedAi === branch)
}

// ============================================================
// Input assertion (SW-1: no options, 10 questions)
// ============================================================

function assertGrammarFillAnalyzeInput(input) {
  const paper = input?.paper
  const group = input?.group
  if (!paper || typeof paper !== 'object') throw new Error('缺少 paper。')
  if (!group || typeof group !== 'object') throw new Error('缺少 grammar-fill group。')
  if (!optionalString(paper.paperId)) throw new Error('paper.paperId 不能为空。')
  if (!optionalString(group.groupId)) throw new Error('group.groupId 不能为空。')
  if (!Array.isArray(group.paragraphs) || group.paragraphs.length === 0) throw new Error('group.paragraphs 不能为空。')
  if (!Array.isArray(group.questions) || group.questions.length !== 10) throw new Error('语法填空 group 必须有 10 道题。')
  for (const question of group.questions) {
    if (!optionalString(question?.id)) throw new Error('题目缺少 id。')
    if (!optionalString(question?.blankId)) throw new Error(`题目 ${question?.id || ''} 缺少 blankId。`)
    // Note: grammar fill has NO options object — do NOT check for options.
  }
}

// ============================================================
// Prompt builder (SW-1: hint from question.prompt)
// ============================================================

function buildPromptInput({ paper, group }) {
  const sourceAssetVersion = Number(paper.sourceAssetVersion || 1) || 1
  return {
    paper: {
      paperId: paper.paperId,
      sourceFilename: paper.sourceFilename || '',
      sourceHash: paper.sourceHash || '',
      sourceAssetVersion,
    },
    targetGroups: [group.groupId],
    content: {
      groups: {
        [group.groupId]: {
          groupId: group.groupId,
          groupType: 'grammarFill',
          title: group.title || '语法填空',
          order: Number(group.order || 0),
          passage: {
            paragraphs: group.paragraphs.map((paragraph) => ({
              paragraphId: paragraph.id,
              text: paragraph.text,
            })),
          },
          questions: group.questions.map((q) => ({
            questionId: q.id,
            blankNo: Number(q.stem) || 0,
            blankId: q.blankId,
            // SW-1: given word is stored in question.prompt; map to 'hint' for the AI
            blankType: q.prompt ? 'given' : 'no-hint',
            hint: q.prompt || null,
          })),
        },
      },
    },
    answerKey: Object.fromEntries(group.questions.map((q) => [q.id, q.answerKey || ''])),
  }
}

export function buildGrammarFillAnalysisMessages({ paper, group }) {
  const promptInput = buildPromptInput({ paper, group })
  return [
    {
      role: 'system',
      content: readApiPrompt(),
    },
    {
      role: 'user',
      content: [
        'Create exactly one grammar-fill-analysis-v1 JSON object for the target group below.',
        'Return JSON text only. The first character must be { and the final character must be }.',
        '',
        'Structured input:',
        JSON.stringify(promptInput, null, 2),
      ].join('\n'),
    },
  ]
}

// ============================================================
// Validator
// ============================================================

export function validateGrammarFillShape(analysis, { paper, group }) {
  if (!analysis || typeof analysis !== 'object' || Array.isArray(analysis)) throw new Error('AI 未返回 JSON 对象。')
  if (analysis.schemaVersion !== 'grammar-fill-analysis-v1') throw new Error('AI JSON schemaVersion 不正确。')
  if (analysis.paperId !== paper.paperId) throw new Error('AI JSON paperId 与当前试卷不一致。')
  if (Number(analysis.sourceAssetVersion || 0) < 1) throw new Error('AI JSON sourceAssetVersion 无效。')
  if (!Array.isArray(analysis.targetGroups) || analysis.targetGroups.length !== 1 || analysis.targetGroups[0] !== group.groupId) {
    throw new Error('AI JSON targetGroups 必须只包含当前题组。')
  }
  if (!analysis.blanks || typeof analysis.blanks !== 'object' || Array.isArray(analysis.blanks)) {
    throw new Error('AI JSON blanks 必须是对象。')
  }

  const expectedQuestionIds = group.questions.map((q) => q.id).sort()
  const actualQuestionIds = Object.keys(analysis.blanks).sort()
  if (JSON.stringify(actualQuestionIds) !== JSON.stringify(expectedQuestionIds)) {
    throw new Error(`AI JSON blanks questionIds 不匹配：expected ${expectedQuestionIds.join(', ')}, got ${actualQuestionIds.join(', ')}`)
  }

  // overview required
  if (!optionalString(analysis.groups?.[group.groupId]?.overview)) {
    throw new Error('AI JSON groups.overview 不能为空。')
  }

  // Build passage text for exact-substring validation (C3).
  const passageText = group.paragraphs.map((p) => p.text).join('\n')

  for (const questionId of expectedQuestionIds) {
    const sourceQuestion = group.questions.find((q) => q.id === questionId)
    const item = analysis.blanks[questionId]
    if (!item || typeof item !== 'object') throw new Error(`${questionId}: 缺少空格分析。`)

    // Required fields
    if (!optionalString(item.blankId)) throw new Error(`${questionId}: 缺少 blankId。`)
    if (typeof item.blankNo !== 'number') throw new Error(`${questionId}: blankNo 必须是数字。`)

    // blankType
    if (item.blankType !== 'given' && item.blankType !== 'no-hint') {
      throw new Error(`${questionId}: blankType 必须是 given 或 no-hint，实际：${item.blankType}。`)
    }

    // hint consistency: given → non-empty string; no-hint → null
    if (item.blankType === 'given') {
      if (!optionalString(item.hint)) throw new Error(`${questionId}: given 空格的 hint 不能为空。`)
    } else {
      if (item.hint !== null && item.hint !== undefined && item.hint !== '') {
        throw new Error(`${questionId}: no-hint 空格的 hint 必须为 null。`)
      }
    }

    // facetKey: must be a valid leaf, not a parent
    const facetKey = String(item.facetKey || '')
    if (PARENT_FACET_KEYS.has(facetKey)) {
      throw new Error(`${questionId}: facetKey "${facetKey}" 是父节点，不是合法叶节点。`)
    }
    if (!LEAF_FACET_KEYS.has(facetKey)) {
      throw new Error(`${questionId}: facetKey "${facetKey}" 不在 16 个合法叶节点中。`)
    }

    // C2: leaf blank_type must match blank's blankType
    const expectedBlankType = FACET_BLANK_TYPE[facetKey]
    if (expectedBlankType !== item.blankType) {
      throw new Error(`${questionId}: facetKey "${facetKey}" 的 blank_type 是 ${expectedBlankType}，与空格 blankType ${item.blankType} 不一致。`)
    }

    // role/path: required iff non-finite
    if (facetKey === NON_FINITE_FACET) {
      if (!optionalString(item.role) || !VALID_ROLE_VALUES.has(item.role)) {
        throw new Error(`${questionId}: grammar-fill.given.verb.non-finite 必须有合法 role 值。`)
      }
      if (!optionalString(item.path) || !VALID_PATH_VALUES.has(item.path)) {
        throw new Error(`${questionId}: grammar-fill.given.verb.non-finite 必须有合法 path 值（fast 或 slow）。`)
      }
    } else {
      if (item.role !== null && item.role !== undefined && item.role !== '') {
        throw new Error(`${questionId}: 只有 non-finite 空格才能设置 role，当前 facetKey 是 ${facetKey}。`)
      }
      if (item.path !== null && item.path !== undefined && item.path !== '') {
        throw new Error(`${questionId}: 只有 non-finite 空格才能设置 path，当前 facetKey 是 ${facetKey}。`)
      }
    }

    // reason
    if (!optionalString(item.reason)) throw new Error(`${questionId}: 缺少 reason。`)

    // teachingNote
    if (!optionalString(item.teachingNote)) throw new Error(`${questionId}: 缺少 teachingNote。`)

    // C1: answer-match against answer key — FROZEN 4-op normalization
    const aiAnswer = optionalString(item.answer)
    const answerKey = sourceQuestion?.answerKey || ''
    if (aiAnswer && answerKey) {
      if (!answerMatchesKey(aiAnswer, answerKey)) {
        const conflictError = new Error(
          `${questionId}: AI 答案与答案解析版不一致：官方 ${answerKey}，AI ${aiAnswer}。（使用4步归一化：trim/collapse-ws/lowercase/split-/）`,
        )
        conflictError.isAnswerConflict = true
        throw conflictError
      }
    }

    // evidence: ≥1 item
    if (!Array.isArray(item.evidence) || item.evidence.length === 0) {
      throw new Error(`${questionId}: evidence 不能为空，至少需要 1 个。`)
    }

    // evidence: each item's signalText is exact substring of passage and has no blank marker
    for (const ev of item.evidence) {
      if (!ev || typeof ev !== 'object') continue
      // Use raw signalText (not trimmed) for blank-marker check to catch '  56  ' etc.
      const rawSignalText = typeof ev.signalText === 'string' ? ev.signalText : ''
      const signalText = rawSignalText.trim()
      if (!signalText) continue

      // evidence type validation
      if (ev.type !== undefined && !VALID_EVIDENCE_TYPES.has(ev.type)) {
        throw new Error(`${questionId}: evidence type 值无效：${ev.type}。`)
      }

      // C3: no blank marker in signalText — check raw (untrimmed) value to catch leading/trailing markers
      if (BLANK_MARKER_RE.test(rawSignalText)) {
        throw new Error(`${questionId}: evidence signalText "${rawSignalText}" 包含空格标记，不允许引用空格 token 或括号提示词。`)
      }

      // C3: exact substring of passage
      if (!passageText.includes(signalText)) {
        throw new Error(`${questionId}: evidence signalText "${signalText}" 必须精确匹配原文。`)
      }
    }
  }
}

// ============================================================
// Provider caller (shell shared; per-type seams injected)
// ============================================================

function isRetryableGrammarFillError(error) {
  // Answer conflicts are never retryable — fundamental mismatch.
  if (error && error.isAnswerConflict) return false
  const message = error instanceof Error ? error.message : String(error || '')
  if (/答案解析版不一致/.test(message)) return false
  return /JSON|schemaVersion|questionIds|blanks|精确匹配原文|缺少|必须|不匹配|无效|空格标记/.test(message)
}

// ============================================================
// Meta stamping — server-side, never trust model self-report
// ============================================================

function stampGrammarFillMeta(analysis, { providerResult, providerId }) {
  if (!analysis || typeof analysis !== 'object') return
  const prior = analysis.meta && typeof analysis.meta === 'object' ? analysis.meta : {}
  analysis.meta = {
    ...prior,
    generatedBy: 'external-ai',
    model: optionalString(providerResult?.model) || String(providerId || ''),
    promptVersion: 'grammar-fill-analysis-v1',
    reviewStatus: 'reviewed',
    reviewedBy: '',
    reviewedAt: new Date().toISOString().slice(0, 10),
  }
}

// ============================================================
// Main entry point
// ============================================================

export const analyzeGrammarFillImportCandidate = createAnalyzerProviderShell({
  assertInput: assertGrammarFillAnalyzeInput,
  buildMessages: buildGrammarFillAnalysisMessages,
  validate: validateGrammarFillShape,
  isRetryable: isRetryableGrammarFillError,
  beforeValidate: stampGrammarFillMeta,
})
