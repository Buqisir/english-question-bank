import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { callDeepSeekJson } from '../ai-providers/deepseek.mjs'
import { extractFirstJsonObject } from './extractJson.mjs'

/**
 * I16·C — Grammar-fill verb teaching axes (时态 / 语态 / 主谓一致).
 *
 * Classifies FINITE-VERB blanks (facetKey === 'grammar-fill.given.verb.finite')
 * along three orthogonal axes. Deterministic-first (owner locked "标全形态 A":
 * the answer FORM is objective), AI fallback only for forms the answer string
 * cannot decide (bare past vs base, agreement that needs the subject — MF-4).
 *
 * NEVER touches the frozen grammar-fill-analysis-v1 contract / validator.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const registryPath = path.join(__dirname, 'grammar-fill-verb-axes-v1.json')
const promptPath = path.join(__dirname, '..', '..', 'prompts', 'grammar-fill-verb-profile-v1.md')

export const FINITE_VERB_FACET = 'grammar-fill.given.verb.finite'

const REGISTRY = JSON.parse(readFileSync(registryPath, 'utf8'))
const VALID_TENSE = new Set(REGISTRY.axes.tense)
const VALID_VOICE = new Set(REGISTRY.axes.voice)
const VALID_AGREEMENT = new Set(REGISTRY.axes.agreement)

// ── token sets for the deterministic classifier ──────────────────────────────
const BE_ANY = new Set(['am', 'is', 'are', 'was', 'were', 'be', 'been', 'being'])
const BE_PRESENT = new Set(['am', 'is', 'are'])
const BE_PAST = new Set(['was', 'were'])
const HAVE_PRESENT = new Set(['have', 'has'])
const MODAL = new Set(['will', 'shall', 'can', 'could', 'may', 'might', 'must', 'should', 'would'])
// Lead tokens that fix subject number from the form alone:
const LEAD_SINGULAR = new Set(['is', 'am', 'was', 'has', 'does'])
const LEAD_PLURAL = new Set(['are', 'were'])
// Lead aux whose form is number-invariant → 主谓一致 not tested → 'na':
const LEAD_NA = new Set(['had', 'will', 'shall', 'can', 'could', 'may', 'might', 'must', 'should', 'would'])

function tokenize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[.,!?;:"'()]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

/**
 * Deterministic classification from the answer FORM + the given hint lemma.
 * Returns { tense, voice, agreement, method:'deterministic' } when the form is
 * decidable, or null when it needs subject/lexical context (→ AI fallback).
 */
export function classifyFiniteVerbFormDeterministic({ answer, hint }) {
  const t = tokenize(answer)
  if (t.length === 0) return null

  const lead = t[0]
  const last = t[t.length - 1]
  const hintLemma = String(hint || '').toLowerCase().trim()
  const isBeHint = hintLemma === 'be'

  const hasIng = t.some((x) => x.endsWith('ing'))
  const hasBe = t.some((x) => BE_ANY.has(x))
  const hasHavePresent = t.some((x) => HAVE_PRESENT.has(x))
  const hasHad = t.includes('had')
  const hasModal = t.some((x) => MODAL.has(x))

  // ── tense ──
  let tense
  if (hasModal && !hasHavePresent && !hasHad) tense = 'other' // 情态/将来结构 → other（无 future 轴）
  else if (hasBe && hasIng) tense = 'progressive' // be + -ing（含 being + PP 的被动进行）
  else if (hasHavePresent) tense = 'present-perfect'
  else if (hasHad) tense = 'past-perfect'
  else if (t.some((x) => BE_PRESENT.has(x))) tense = 'present'
  else if (t.some((x) => BE_PAST.has(x))) tense = 'past'
  else return null // 裸实义动词（base / -s / 不规则过去）→ 交 AI

  // ── voice ──
  let voice
  if (isBeHint) voice = 'active' // be 作系动词/主动词 → 主动
  else if (hasBe && !last.endsWith('ing')) voice = 'passive' // be + 过去分词
  else voice = 'active'

  // ── agreement（主谓一致）──
  let agreement
  if (LEAD_SINGULAR.has(lead)) agreement = 'singular'
  else if (LEAD_PLURAL.has(lead)) agreement = 'plural'
  else if (LEAD_NA.has(lead)) agreement = 'na' // 形式不随主语数变 → 不考主谓一致
  else return null // have-引导 / 其它 → 数需主语，交 AI（MF-4）

  return { tense, voice, agreement, method: 'deterministic' }
}

/** Pull finite-verb blanks out of a grammar-fill-analysis-v1 object. */
export function extractFiniteVerbBlanks(analysis) {
  const blanks = analysis?.blanks
  if (!blanks || typeof blanks !== 'object') return []
  const out = []
  for (const [questionId, entry] of Object.entries(blanks)) {
    if (entry?.facetKey !== FINITE_VERB_FACET) continue
    out.push({
      questionId: String(questionId),
      blankId: entry.blankId || '',
      answer: entry.answer || '',
      hint: entry.hint || '',
      reason: entry.reason || '',
      // evidence carries the subject signal the answer alone may lack (MF-4)
      evidence: Array.isArray(entry.evidence) ? entry.evidence : [],
    })
  }
  return out
}

function readApiPrompt() {
  return readFileSync(promptPath, 'utf8')
}

/** Build the AI messages for the blanks the deterministic pass could not decide. */
export function buildVerbProfileMessages(blanks) {
  const items = blanks.map((b) => ({
    questionId: b.questionId,
    answer: b.answer,
    hint: b.hint,
    // sentence/subject context so agreement can be derived from the subject (MF-4)
    reason: b.reason,
    subjectSignals: b.evidence
      .filter((ev) => ev && (ev.type === 'subject' || ev.signalSide === 'passage'))
      .map((ev) => ({ signalText: ev.signalText, relation: ev.relation })),
  }))
  return [
    { role: 'system', content: readApiPrompt() },
    {
      role: 'user',
      content: [
        'Classify each finite-verb blank on the three axes (tense, voice, agreement).',
        'Return JSON text only. First char must be { and last char must be }.',
        '',
        'Blanks:',
        JSON.stringify({ blanks: items }, null, 2),
      ].join('\n'),
    },
  ]
}

/** Validate one axis triple against the frozen registry. */
function assertValidProfile(questionId, profile) {
  if (!profile || typeof profile !== 'object') throw new Error(`${questionId}: 缺少动词三轴。`)
  if (!VALID_TENSE.has(profile.tense)) throw new Error(`${questionId}: tense 非法值 ${profile.tense}。`)
  if (!VALID_VOICE.has(profile.voice)) throw new Error(`${questionId}: voice 非法值 ${profile.voice}。`)
  if (!VALID_AGREEMENT.has(profile.agreement)) throw new Error(`${questionId}: agreement 非法值 ${profile.agreement}。`)
}

/**
 * Classify all finite-verb blanks of one group.
 *
 * @param {Array} blanks - from extractFiniteVerbBlanks()
 * @param {object} options
 * @param {(args:{messages:any[]})=>Promise<{rawText:string}>} [options.providerCaller]
 *   Injected AI caller; defaults to DeepSeek. Only invoked when ≥1 blank is
 *   undecidable by form. Tests inject a stub (no real DeepSeek call).
 * @returns {Promise<Record<string,{tense,voice,agreement,method}>>}
 */
export async function analyzeGrammarFillVerbProfile(blanks, options = {}) {
  const result = {}
  const undecided = []

  for (const blank of blanks) {
    const det = classifyFiniteVerbFormDeterministic(blank)
    if (det) {
      const { method, ...axes } = det
      assertValidProfile(blank.questionId, axes)
      result[blank.questionId] = { ...axes, method: 'deterministic' }
    } else {
      undecided.push(blank)
    }
  }

  if (undecided.length === 0) return result

  const providerCaller = options.providerCaller || ((args) => callDeepSeekJson({ ...args, model: options.model }))
  const messages = buildVerbProfileMessages(undecided)
  const providerResult = await providerCaller({ messages })
  const parsed = extractFirstJsonObject(providerResult.rawText)
  const aiBlanks = parsed?.blanks
  if (!aiBlanks || typeof aiBlanks !== 'object') throw new Error('AI 动词三轴返回缺少 blanks。')

  for (const blank of undecided) {
    const profile = aiBlanks[blank.questionId]
    assertValidProfile(blank.questionId, profile)
    result[blank.questionId] = {
      tense: profile.tense,
      voice: profile.voice,
      agreement: profile.agreement,
      method: 'ai',
    }
  }

  return result
}
