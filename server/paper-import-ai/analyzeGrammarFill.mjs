import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertFullTranslationZh,
  assertObjectiveTeachingAnnotations,
  assertSharedPassageIntroduction,
  assertSelectedLongSentences,
  createAnalyzerProviderShell,
  readTeachingAnalysisPrompt,
  rewriteApiPrompt,
} from './analyzerProviderShell.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '../..')
const promptPath = path.join(rootDir, 'prompts/grammar-fill-analysis-v1.md')
const facetsPath = path.join(__dirname, 'grammar-fill-facets-v2.json')
const similarityPath = path.join(__dirname, 'grammar-fill-similarity-v1.json')

// ============================================================
// Registry: 22 leaf facets (D1 grammar-facets-v2, 2026-07-15 owner-locked
// semantics — docs/cuts/similar-questions/program.md §语法填空考点粒度终稿).
// Old `given.noun` / `given.adjective` / `given.derivation.*` (17-leaf v1
// registry, grammar-fill-facets-v1.json) retired: 词形转换 8-way
// `given.conversion.<src>-to-<dst>` + 3 new split-off leaves
// (`given.noun.number` / `given.noun.genitive` / `given.adjective.comparison`).
// ============================================================

const FACET_REGISTRY = JSON.parse(readFileSync(facetsPath, 'utf8'))
const LEAF_FACET_KEYS = new Set(FACET_REGISTRY.map((f) => f.facet_key))
const FACET_BLANK_TYPE = Object.fromEntries(FACET_REGISTRY.map((f) => [f.facet_key, f.blank_type]))
const SIMILARITY_REGISTRY = JSON.parse(readFileSync(similarityPath, 'utf8'))
const SIMILARITY_PROFILES = new Map(SIMILARITY_REGISTRY.map((entry) => [entry.facet_key, entry]))

// Parent nodes that are NOT valid leaf facetKeys.
const PARENT_FACET_KEYS = new Set([
  'grammar-fill',
  'grammar-fill.given',
  'grammar-fill.given.verb',
  'grammar-fill.given.conversion',
  'grammar-fill.no-hint',
  'grammar-fill.no-hint.conjunction',
])

const NON_FINITE_FACET = 'grammar-fill.given.verb.non-finite'
const NOUN_TO_VERB_FACET = 'grammar-fill.given.conversion.noun-to-verb'

const VALID_ROLE_VALUES = new Set([
  'subject',
  'predicative',
  'object',
  'attributive',
  'adverbial',
  'appositive',
  'object-complement',
  'subject-complement',
])

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

function assertExactKeys(value, keys, label) {
  const expected = [...keys].sort()
  const actual = Object.keys(value).sort()
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} 必须且只能包含：${expected.join(', ')}。`)
  }
}

function readApiPrompt() {
  return rewriteApiPrompt(readTeachingAnalysisPrompt(promptPath))
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
        'Create exactly one grammar-fill-analysis-v2 JSON object for the target group below.',
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

const FINITE_ROUTE_TENSES = new Map([
  ['present-stable-description', 'present'],
  ['present-frequency-marker', 'present'],
  ['present-progressive-current-action', 'progressive'],
  ['past-explicit-time', 'past'],
  ['past-context-cue', 'past'],
  ['past-narrative-chain', 'past'],
  ['present-perfect-explicit-marker', 'present-perfect'],
  ['present-perfect-current-effect', 'present-perfect'],
  ['past-progressive-background', 'progressive'],
  ['past-perfect-prior-past', 'past-perfect'],
  ['modal-passive', 'other'],
])

function validateSimilarityProfile(item, questionId) {
  if (!Object.prototype.hasOwnProperty.call(item, 'similarityProfile')) {
    if (item.facetKey === NON_FINITE_FACET && item.role === 'appositive') {
      throw new Error(`${questionId}: appositive 必须提供 similarityProfile。`)
    }
    return
  }

  const profile = item.similarityProfile
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    throw new Error(`${questionId}: similarityProfile 必须是对象。`)
  }
  assertExactKeys(profile, ['route', 'features'], `${questionId}: similarityProfile`)

  const route = optionalString(profile.route)
  if (!route) throw new Error(`${questionId}: similarityProfile.route 不能为空。`)
  if (!Array.isArray(profile.features)) {
    throw new Error(`${questionId}: similarityProfile.features 必须是数组。`)
  }

  const spec = SIMILARITY_PROFILES.get(item.facetKey)
  if (!spec) throw new Error(`${questionId}: ${item.facetKey} 没有相似题细分表。`)
  if (!spec.routes.includes(route)) {
    throw new Error(`${questionId}: similarityProfile.route 与 facetKey ${item.facetKey} 不匹配。`)
  }

  const seen = new Set()
  for (const feature of profile.features) {
    const normalized = optionalString(feature)
    if (!normalized || !spec.features.includes(normalized)) {
      throw new Error(`${questionId}: similarityProfile.features 包含 ${item.facetKey} 不支持的值。`)
    }
    if (seen.has(normalized)) {
      throw new Error(`${questionId}: similarityProfile.features 不得重复。`)
    }
    seen.add(normalized)
  }

  if (item.facetKey === NON_FINITE_FACET) {
    if (route === 'attributive-participle') {
      const positionCount = ['preposed', 'postposed'].filter((feature) => seen.has(feature)).length
      const relationCount = [
        'active-relation',
        'passive-relation',
        'completed-state',
        'ongoing-passive',
      ].filter((feature) => seen.has(feature)).length
      if (positionCount !== 1 || relationCount !== 1 || seen.size !== 2) {
        throw new Error(`${questionId}: attributive-participle 必须各有一个位置和关系 feature。`)
      }
    } else if (seen.size !== 0) {
      throw new Error(`${questionId}: 只有 attributive-participle 可设置非谓语 features。`)
    }
  }

  if (item.facetKey === 'grammar-fill.given.adjective.comparison') {
    const allowed = route === 'comparative'
      ? new Set(['than-marker', 'degree-modifier', 'parallel-comparative', 'semantic-comparison', 'fixed-comparative-frame'])
      : new Set(['explicit-range-unique', 'semantic-superlative'])
    if (seen.size === 0 || [...seen].some((feature) => !allowed.has(feature))) {
      throw new Error(`${questionId}: adjective.comparison 必须提供与 ${route} 一致的判断 feature。`)
    }
  }

  if (item.facetKey === 'grammar-fill.no-hint.conjunction.relative-clause') {
    const antecedentCount = ['human', 'thing', 'whole-event'].filter((feature) => seen.has(feature)).length
    const restrictionCount = ['restrictive', 'non-restrictive'].filter((feature) => seen.has(feature)).length
    if (antecedentCount !== 1 || restrictionCount !== 1 || seen.size !== 2) {
      throw new Error(`${questionId}: relative-clause 必须各有一个先行项类型和限制性 feature。`)
    }
  }

  if (item.facetKey === 'grammar-fill.no-hint.conjunction.noun-clause' && seen.size !== 1) {
    throw new Error(`${questionId}: noun-clause 必须且只能有一个从句成分 feature。`)
  }

  if (item.facetKey === NOUN_TO_VERB_FACET) {
    const allowed = route === 'finite-result'
      ? new Set(FINITE_ROUTE_TENSES.keys())
      : new Set(SIMILARITY_PROFILES.get(NON_FINITE_FACET).routes)
    if (seen.size !== 1 || [...seen].some((feature) => !allowed.has(feature))) {
      throw new Error(`${questionId}: noun-to-verb 必须提供一个与 ${route} 一致的细分 feature。`)
    }
    if (route === 'finite-result') {
      const [finiteRoute] = seen
      const expectedTense = FINITE_ROUTE_TENSES.get(finiteRoute)
      if (expectedTense && item.tense !== expectedTense) {
        throw new Error(`${questionId}: noun-to-verb 谓语路线与程序判定的 tense ${item.tense} 不一致。`)
      }
      if (finiteRoute === 'modal-passive' && item.voice !== 'passive') {
        throw new Error(`${questionId}: noun-to-verb modal-passive 必须对应被动语态。`)
      }
    }
  }

  if (
    item.facetKey === NON_FINITE_FACET
    && optionalString(item.role)
    && !route.startsWith(`${item.role}-`)
  ) {
    throw new Error(`${questionId}: similarityProfile.route 与非谓语 role ${item.role} 不一致。`)
  }

  if (
    (item.facetKey === NON_FINITE_FACET && route === 'appositive-gerund')
    || (item.facetKey === NOUN_TO_VERB_FACET && route === 'non-finite-result' && seen.has('appositive-gerund'))
  ) {
    if (!isSupportedAppositiveGerundAnswer(item.answer)) {
      throw new Error(`${questionId}: appositive-gerund 必须对应程序派生的普通主动 doing。`)
    }
  }

  if (item.facetKey === 'grammar-fill.given.verb.finite') {
    const expectedTense = FINITE_ROUTE_TENSES.get(route)
    if (expectedTense && item.tense !== expectedTense) {
      throw new Error(`${questionId}: similarityProfile.route 与程序判定的 tense ${item.tense} 不一致。`)
    }
    if (route === 'modal-passive' && item.voice !== 'passive') {
      throw new Error(`${questionId}: modal-passive 路线必须对应被动语态。`)
    }
  }
}

export function validateGrammarFillShape(analysis, {
  paper,
  group,
  requireFullTranslation = false,
  requireSelectedLongSentences = false,
  requireTeachingContent = false,
}) {
  if (!analysis || typeof analysis !== 'object' || Array.isArray(analysis)) throw new Error('AI 未返回 JSON 对象。')
  if (analysis.schemaVersion !== 'grammar-fill-analysis-v2') throw new Error('AI JSON schemaVersion 不正确。')
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

  assertSharedPassageIntroduction(analysis.groups?.[group.groupId])
  if (requireFullTranslation) {
    assertFullTranslationZh(analysis.groups[group.groupId], group, { requireBlankMarkers: true })
  }
  assertSelectedLongSentences(analysis.groups[group.groupId], group, {
    required: requireSelectedLongSentences,
  })
  if (requireTeachingContent) {
    assertObjectiveTeachingAnnotations(analysis.groups[group.groupId], group, {
      sourceAssetVersion: analysis.sourceAssetVersion,
      requireAnswerInsertions: true,
    })
  }

  // Build passage text for exact-substring validation (C3).
  const passageText = group.paragraphs.map((p) => p.text).join('\n')

  for (const questionId of expectedQuestionIds) {
    const sourceQuestion = group.questions.find((q) => q.id === questionId)
    const item = analysis.blanks[questionId]
    if (!item || typeof item !== 'object') throw new Error(`${questionId}: 缺少空格分析。`)

    // Required fields
    if (!optionalString(item.blankId)) throw new Error(`${questionId}: 缺少 blankId。`)
    if (item.blankId !== sourceQuestion?.blankId) throw new Error(`${questionId}: blankId does not match source question.`)
    if (typeof item.blankNo !== 'number') throw new Error(`${questionId}: blankNo 必须是数字。`)
    if (item.blankNo !== Number(sourceQuestion?.stem)) throw new Error(`${questionId}: blankNo does not match source question.`)

    // blankType
    if (item.blankType !== 'given' && item.blankType !== 'no-hint') {
      throw new Error(`${questionId}: blankType 必须是 given 或 no-hint，实际：${item.blankType}。`)
    }

    const sourceBlankType = sourceQuestion?.prompt ? 'given' : 'no-hint'
    if (item.blankType !== sourceBlankType) {
      throw new Error(`${questionId}: blankType does not match source question.`)
    }

    // hint consistency: given → non-empty string; no-hint → null
    if (item.blankType === 'given') {
      if (!optionalString(item.hint)) throw new Error(`${questionId}: given 空格的 hint 不能为空。`)
      if (item.hint !== sourceQuestion.prompt) throw new Error(`${questionId}: hint does not match source question.`)
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
      throw new Error(`${questionId}: facetKey "${facetKey}" 不在 ${LEAF_FACET_KEYS.size} 个合法叶节点中。`)
    }

    // C2: leaf blank_type must match blank's blankType
    const expectedBlankType = FACET_BLANK_TYPE[facetKey]
    if (expectedBlankType !== item.blankType) {
      throw new Error(`${questionId}: facetKey "${facetKey}" 的 blank_type 是 ${expectedBlankType}，与空格 blankType ${item.blankType} 不一致。`)
    }

    // The syntactic role remains required; the personal fast/slow path is retired.
    if (facetKey === NON_FINITE_FACET) {
      if (!optionalString(item.role) || !VALID_ROLE_VALUES.has(item.role)) {
        throw new Error(`${questionId}: grammar-fill.given.verb.non-finite 必须有合法 role 值。`)
      }
    } else {
      if (item.role !== null && item.role !== undefined && item.role !== '') {
        throw new Error(`${questionId}: 只有 non-finite 空格才能设置 role，当前 facetKey 是 ${facetKey}。`)
      }
    }

    validateSimilarityProfile(item, questionId)

    // reason
    if (!optionalString(item.reason)) throw new Error(`${questionId}: 缺少 reason。`)

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
// D1 (grammar-facets-v2) verb axes — server-side deterministic derivation,
// never asked of the AI (owner 2026-07-15: "三特征全部从 answer 推导").
// Intentionally a separate small copy of
// scripts/grammar-facets-v2-migrate.mjs's deriveVerbAxes/deriveNonFiniteForm
// (same owner-locked rules), not an import: the migrate script's copy is
// already run + owner-verified against the frozen 33-file migration output
// (docs/cuts/grammar-facets-v2/step1-samples.md) and must not shift after
// the fact; THIS copy is the single live source for NEW imports going
// forward (small-ledger ruling 2026-07-17: the migrate twin is a frozen
// historical record of a completed one-shot migration, never re-run, so the
// two are not consolidated and no drift surface exists between them —
// editing the rules for future imports means editing here only).
// ============================================================

const BE_ANY = new Set(['am', 'is', 'are', 'was', 'were', 'be', 'been', 'being'])
const BE_PRESENT = new Set(['am', 'is', 'are'])
const BE_PAST = new Set(['was', 'were'])
const HAVE_PRESENT = new Set(['have', 'has'])
const MODAL = new Set(['will', 'shall', 'can', 'could', 'may', 'might', 'must', 'should', 'would'])
const AGREEMENT_SENSITIVE_TOKENS = new Set(['is', 'am', 'are', 'was', 'were', 'has', 'have', 'does'])

function tokenizeAnswer(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[.,!?;:"'()]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

function deriveVerbAxes({ hint, answer }) {
  const t = tokenizeAnswer(answer)
  if (t.length === 0) return null
  const lead = t[0]
  const hintLemma = String(hint || '').toLowerCase().trim()
  const isBeHint = hintLemma === 'be'

  const hasIng = t.some((x) => x.endsWith('ing'))
  const hasBe = t.some((x) => BE_ANY.has(x))
  const hasHavePresent = t.some((x) => HAVE_PRESENT.has(x))
  const hasHad = t.includes('had')
  const hasModal = t.some((x) => MODAL.has(x))
  const last = t[t.length - 1]

  let tense = null
  if (hasModal) tense = 'other'
  else if (hasBe && hasIng) tense = 'progressive'
  else if (hasHavePresent) tense = 'present-perfect'
  else if (hasHad) tense = 'past-perfect'
  else if (t.some((x) => BE_PRESENT.has(x))) tense = 'present'
  else if (t.some((x) => BE_PAST.has(x))) tense = 'past'
  else if (lead === 'be') tense = 'other'
  else if (t.length === 1 && lead === hintLemma) tense = 'other'
  else if (/s$/.test(lead)) tense = 'present'
  else if (/ed$/.test(lead) || lead !== hintLemma) tense = 'past'
  else tense = null
  if (!tense) return null

  let voice
  if (isBeHint) voice = 'active'
  else if (hasBe && !last.endsWith('ing')) voice = 'passive'
  else voice = 'active'

  const agreementSensitive =
    t.some((x) => AGREEMENT_SENSITIVE_TOKENS.has(x)) || (/^[a-z]+s$/.test(last) && !AGREEMENT_SENSITIVE_TOKENS.has(last))

  return { tense, voice, agreementSensitive }
}

function deriveNonFiniteForm(answer) {
  const a = String(answer || '').trim()
  if (/^to\b/i.test(a)) return 'to-do'
  if (/^being\b/i.test(a) || /ing$/i.test(a)) return 'doing'
  return 'done'
}

function deriveNonFiniteSimilarityForm(answer) {
  const normalized = String(answer || '').trim().toLowerCase().replace(/\s+/g, ' ')
  if (normalized.startsWith('to have been ') || normalized.startsWith('having been ')) return null
  if (normalized.startsWith('to have ')) return 'to-have-done'
  if (normalized.startsWith('to be ')) return 'to-be-done'
  if (normalized.startsWith('to ')) return 'to-do'
  if (normalized.startsWith('having ')) return 'having-done'
  if (normalized.startsWith('being ')) return 'being-done'
  if (normalized.endsWith('ing')) return 'doing'
  return 'done'
}

// This route's answer-form boundary does not establish syntactic apposition.
export function isSupportedAppositiveGerundAnswer(answer) {
  if (typeof answer !== 'string') return false
  return answer.split('/').every((alternative) => {
    const normalized = alternative.trim().toLowerCase().replace(/\s+/g, ' ')
    return /^(?:not )?[a-z]+ing$/.test(normalized)
      && deriveNonFiniteSimilarityForm(normalized) === 'doing'
  })
}

/** Stamp tense/voice/agreementSensitive (finite) or form (non-finite) onto
 * every blank, deterministically from answer/hint — never AI-authored. When
 * the deterministic rule cannot decide (should not happen on real data; see
 * migrate script comment), the field is left null rather than guessed. */
export function stampGrammarFillDerivedFields(analysis) {
  const blanks = analysis?.blanks
  if (!blanks || typeof blanks !== 'object') return analysis
  for (const blank of Object.values(blanks)) {
    if (!blank || typeof blank !== 'object') continue
    const nounToVerbRoute = blank.facetKey === NOUN_TO_VERB_FACET
      ? blank.similarityProfile?.route
      : null
    if (
      blank.facetKey === 'grammar-fill.given.verb.finite'
      || nounToVerbRoute === 'finite-result'
    ) {
      const axes = deriveVerbAxes({ hint: blank.hint, answer: blank.answer })
      blank.tense = axes?.tense ?? null
      blank.voice = axes?.voice ?? null
      blank.agreementSensitive = axes ? axes.agreementSensitive : null
    } else if (
      blank.facetKey === NON_FINITE_FACET
      || nounToVerbRoute === 'non-finite-result'
    ) {
      blank.form = deriveNonFiniteForm(blank.answer)
      blank.similarityForm = deriveNonFiniteSimilarityForm(blank.answer)
    }
  }
  return analysis
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
    promptVersion: 'grammar-fill-analysis-v2',
    reviewStatus: 'reviewed',
    reviewedBy: '',
    reviewedAt: new Date().toISOString().slice(0, 10),
  }
  stampGrammarFillDerivedFields(analysis)
}

// ============================================================
// Main entry point
// ============================================================

export const analyzeGrammarFillImportCandidate = createAnalyzerProviderShell({
  assertInput: assertGrammarFillAnalyzeInput,
  buildMessages: buildGrammarFillAnalysisMessages,
  validate: (analysis, input) => validateGrammarFillShape(analysis, {
    ...input,
    requireFullTranslation: true,
    requireSelectedLongSentences: true,
    requireTeachingContent: true,
  }),
  isRetryable: isRetryableGrammarFillError,
  beforeValidate: stampGrammarFillMeta,
})
