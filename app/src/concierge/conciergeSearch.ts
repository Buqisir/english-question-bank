/**
 * conciergeSearch — runs a natural-language intent against the question bank.
 *
 * Strategy:
 *   1. If apiKey is present, ask the question-bank steward (DeepSeek backend).
 *   2. If steward returns needsClarification=true, surface that without ranking.
 *   3. If apiKey is missing or the call throws, run a local keyword fallback
 *      across title / passageTitle / summary / hit / source / region / tags.
 *
 * Pure-ish: only side effect is the network call inside doStewardCall.
 */

import { groupTypeLabel, type GroupType, type QuestionGroupCard, type TopicLabel } from '../domain/questionBank.ts'
import {
  askQuestionBankSteward,
  type QuestionBankStewardResult,
  type SemanticSearchMatch,
} from '../services/questionGroups.ts'

export type ConciergeSearchInput = {
  /** Raw user intent text. */
  intent: string
  /** Optional pending query held while we wait for a clarification reply. */
  pendingQuery?: string | null
  /** All known question groups; required for keyword fallback rendering. */
  questionGroups: QuestionGroupCard[]
  /** DeepSeek key. Empty string means "go straight to fallback". */
  apiKey: string
  /** Whether to enable thinking mode for the steward DeepSeek calls. Defaults to false. */
  thinkingMode?: boolean
  /** Optional override for tests; defaults to the real ask call. */
  doStewardCall?: (message: string, apiKey: string, thinkingMode?: boolean) => Promise<QuestionBankStewardResult>
  /** Test hook; production keeps this short enough to avoid a stuck search UI. */
  stewardTimeoutMs?: number
}

export type ConciergeSearchHit = {
  group: QuestionGroupCard
  /** Steward-supplied reason or local keyword reason. Never displayed as a score. */
  reason: string
}

export type ConciergeSearchOutcome =
  | {
      kind: 'results'
      hits: ConciergeSearchHit[]
      assistantMessage: string
      /** Original intent message used for the round (unmodified user input). */
      query: string
      /** Final message sent to backend (may include "原 query；补充说明：" prefix). */
      sentMessage: string
      source: 'steward'
    }
  | {
      kind: 'results'
      hits: ConciergeSearchHit[]
      assistantMessage: string
      query: string
      sentMessage: string
      source: 'fallback'
      fallbackReason: string
    }
  | {
      kind: 'clarification'
      assistantMessage: string
      clarificationQuestion: string
      query: string
      sentMessage: string
    }

const KEYWORD_FIELDS: Array<keyof QuestionGroupCard> = [
  'title',
  'passageTitle',
  'summary',
  'hit',
  'source',
  'region',
  'paperName',
  'section',
]

function normalize(text: string) {
  return String(text || '').toLowerCase().trim()
}

// Chinese function words that a teacher's natural-language query is full of
// ("找一篇讲……的题") but that carry no topical signal. Kept short and
// deliberately conservative — dropping too aggressively risks eating a real
// content word that happens to be a single/double CJK character.
const CJK_STOPWORDS = new Set([
  '的', '了', '篇', '题', '找', '一道', '一篇', '请', '帮我', '一个',
  '最好', '是', '在', '和', '与', '的话', '一些', '这个', '那个', '有',
  '关于', '讲', '道', '给我', '要', '想', '需要',
])

/** True for any character in the common CJK Unified Ideographs block. */
function isCjkChar(ch: string): boolean {
  return ch >= '一' && ch <= '鿿'
}

/**
 * Break one CJK run into overlapping bigrams (e.g. "生态主题" ->
 * "生态"/"态主"/"主题"). Bigram matching is what lets a query segment land
 * on a *substring* of a longer haystack phrase (topic label paths, section
 * text) without a real Chinese word segmenter. Runs of length 1 produce no
 * bigrams (nothing to pair); the caller still keeps the whole run as its
 * own candidate token.
 */
function cjkBigrams(run: string): string[] {
  // A 2-character run's only possible bigram is the run itself — the
  // caller already pushes the whole run separately, so skip here to avoid
  // silently double-counting that one token in the weighted score.
  if (run.length < 3) return []
  const grams: string[] = []
  for (let i = 0; i < run.length - 1; i++) {
    grams.push(run.slice(i, i + 2))
  }
  return grams
}

/**
 * Tokenize a natural-language query into matchable tokens.
 *
 * Non-CJK behavior is unchanged from V1: split on whitespace and common
 * punctuation, keep Latin/digit tokens. Single-letter Latin tokens are kept
 * for paper labels such as "Reading C" — matching below treats them as
 * standalone labels so "c" does not hit ordinary words like "Coe".
 *
 * CJK behavior (new): a connected run of Chinese characters is NOT split by
 * whitespace (teachers write "生态主题" with no space), so a single run would
 * previously become one coarse token that can only match an *exact* substring
 * of the haystack. We additionally emit 2-character bigrams for each run (and
 * the whole run itself) so "生态主题" can land on "自然生态" or "生态环境"
 * inside a topic-label path. Bigram/whole-run tokens that are pure stopwords
 * are dropped so they cannot manufacture a false-positive hit.
 */
export function tokenize(query: string): string[] {
  const raw = query
    .replace(/[，。、；：！？,.!?;:()（）【】"'《》<>\\/|]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)

  const tokens: string[] = []
  for (const segment of raw) {
    let cjkRun = ''
    const flushCjkRun = () => {
      if (!cjkRun) return
      if (!CJK_STOPWORDS.has(cjkRun)) tokens.push(cjkRun)
      for (const gram of cjkBigrams(cjkRun)) {
        if (!CJK_STOPWORDS.has(gram)) tokens.push(gram)
      }
      cjkRun = ''
    }
    for (const ch of segment) {
      if (isCjkChar(ch)) {
        cjkRun += ch
      } else {
        flushCjkRun()
      }
    }
    flushCjkRun()
    // Non-CJK content in this segment (Latin/digits/mixed) — keep as-is,
    // matching V1 behavior. A segment that was purely CJK produces nothing
    // more here since cjkRun already consumed every character.
    const nonCjkOnly = /^[^一-鿿]+$/.test(segment)
    if (nonCjkOnly) tokens.push(segment)
  }
  // De-dupe: the same bigram or word can recur across a query (e.g. two
  // separate section letters producing the same alias token), and downstream
  // scoring sums one weight per distinct matched token — a duplicate token
  // must not silently double that weight.
  return Array.from(new Set(tokens))
}

type KeywordCandidate = {
  group: QuestionGroupCard
  hits: number
  score: number
  /** score with `general`-tier (title/summary/tags/...) contributions excluded. */
  nonGeneralScore: number
  matchedTokens: string[]
  /** Best-matching topic-label leaf, used to build a human reason line. */
  matchedTopicLabel: TopicLabel | null
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function extractReadingSectionLabel(group: QuestionGroupCard): string | null {
  const text = [group.section, group.source, group.title].join(' ')
  const match = text.match(/阅读(?:理解)?\s*([A-D])/i)
  return match ? match[1].toLowerCase() : null
}

/**
 * A structured reading of a query's explicit dimensions. Every field is
 * "best effort, may be null" — a query can name zero, one, or several
 * dimensions at once ("2025 浙江卷 七选五" names region + year + groupType).
 */
export type LocalSearchIntent = {
  /** Explicit 4-digit year, e.g. "2025" -> 2025. */
  year: number | null
  /** Explicit reading-section letters, e.g. "阅读C" / "Reading C" -> ['c']. Empty when unnamed. */
  sectionLetters: string[]
  /** Explicit group type, e.g. "七选五" -> 'seven_choices'. Null when unnamed. */
  groupType: GroupType | null
  /** Explicit region phrase as it should appear in `group.region`, e.g. "浙江" / "全国甲卷" -> '全国甲卷'. */
  region: string | null
}

// Ordered so a more specific phrase (全国甲卷) is tried before a more
// generic one that could partially overlap (全国). Each entry's regex
// captures nothing; the whole match is the canonical region text to filter
// `group.region` against (case/space-insensitive substring check).
const REGION_PATTERNS: RegExp[] = [
  /全国[甲乙丙]卷/,
  /全国新课标\s*[ⅠⅡ12一二]/,
  /新课标\s*[ⅠⅡ12一二]/i,
  /浙江/,
  /九省联考/,
]

// 题型 phrase -> GroupType. Matched as a plain substring against the raw
// query (order matters only where phrases could overlap; none do here).
const GROUP_TYPE_PATTERNS: Array<{ pattern: RegExp; groupType: GroupType }> = [
  { pattern: /完形填空|完形/, groupType: 'cloze' },
  { pattern: /七选五/, groupType: 'seven_choices' },
  { pattern: /语法填空/, groupType: 'grammar_cloze' },
  { pattern: /读后续写|续写/, groupType: 'continuation' },
  { pattern: /应用文/, groupType: 'writing' },
  { pattern: /阅读理解|阅读/, groupType: 'reading' },
]

/**
 * Parse a raw query into explicit structured dimensions using local regexes
 * only (no LLM). Used to (a) hard-filter the local candidate pool when a
 * teacher names a dimension explicitly, and (b) strongly boost year matches.
 * Anything not recognized here is left to the soft token/weight scoring.
 */
export function parseLocalIntent(query: string): LocalSearchIntent {
  const text = String(query || '')

  const yearMatch = text.match(/(20\d{2})/)
  const year = yearMatch ? Number(yearMatch[1]) : null

  const sectionLetters = new Set<string>()
  // Group 1 captures a whole "阅读/reading/passage C[, D[ and E]]"-style run
  // so "阅读 C D" and "Reading C and D" both resolve to two letters, not
  // just the first. Group 2 is the standalone "C 篇" phrasing.
  const sectionRegex =
    /(?:阅读(?:理解)?|reading|passage)\s*([A-D](?:\s*(?:[,，、]|and|、)?\s*[A-D])*)\b|\b([A-D])\s*篇/gi
  let sectionMatch: RegExpExecArray | null
  while ((sectionMatch = sectionRegex.exec(text)) !== null) {
    const run = sectionMatch[1] || sectionMatch[2] || ''
    for (const letter of run.match(/[A-D]/gi) || []) {
      sectionLetters.add(letter.toLowerCase())
    }
  }

  let groupType: GroupType | null = null
  for (const entry of GROUP_TYPE_PATTERNS) {
    if (entry.pattern.test(text)) {
      groupType = entry.groupType
      break
    }
  }

  let region: string | null = null
  for (const pattern of REGION_PATTERNS) {
    const match = text.match(pattern)
    if (match) {
      region = match[0]
      break
    }
  }

  return {
    year,
    sectionLetters: Array.from(sectionLetters),
    groupType,
    region,
  }
}

function groupMatchesRegion(group: QuestionGroupCard, region: string): boolean {
  const groupRegion = normalize(group.region)
  const wanted = normalize(region)
  // "全国甲卷" as a query region should match a group region of "全国甲卷"
  // (exact provenance tag) even though the group's own `region` field does
  // not repeat "卷". Compare both directions as substrings so either a
  // looser query phrase or a looser stored region still lines up.
  return groupRegion.includes(wanted) || wanted.includes(groupRegion)
}

/**
 * Narrow the candidate pool to groups that satisfy every *explicitly named*
 * dimension in the intent. A dimension the intent did not detect is not
 * filtered on at all (soft scoring still applies on top of this pool).
 */
function applyIntentHardFilters(
  groups: QuestionGroupCard[],
  intent: LocalSearchIntent,
): QuestionGroupCard[] {
  let pool = groups
  if (intent.sectionLetters.length > 0) {
    pool = pool.filter((group) => {
      const letter = extractReadingSectionLabel(group)
      return letter !== null && intent.sectionLetters.includes(letter)
    })
  }
  if (intent.groupType) {
    pool = pool.filter((group) => group.groupType === intent.groupType)
  }
  if (intent.region) {
    pool = pool.filter((group) => groupMatchesRegion(group, intent.region as string))
  }
  return pool
}

/**
 * Weighted haystack tiers for one group. A query token is scored by the
 * *highest* tier it lands in, not summed across tiers — a token that
 * happens to appear in both the topic label and the summary should not
 * outscore two independent topic-label hits.
 *
 *   topic   — topic label leaf/path text (highest signal: a teacher who
 *             says "生态" almost always means the topic, not a stray word
 *             in the passage).
 *   section — reading-section / group-type aliases ("阅读 C", "七选五").
 *   place   — region / year / paper name (where and when).
 *   general — everything else (title, summary, tags, hit sentence, ...).
 */
type HaystackTiers = {
  topic: string
  section: string
  place: string
  general: string
}

const WEIGHT_BY_TIER: Record<keyof HaystackTiers, number> = {
  topic: 5,
  section: 3,
  place: 2,
  general: 1,
}

function buildWeightedHaystacks(group: QuestionGroupCard): HaystackTiers {
  const readingSection = extractReadingSectionLabel(group)
  // Lettered aliases ("阅读 C", "reading C") are as specific as `group.section`
  // itself — they earn the `section` tier. The *bare* group-type words
  // ("reading" / "reading comprehension" with no letter) match essentially
  // every reading group in the bank, so they carry little discriminating
  // power on their own and belong in `general` alongside "阅读" bigrams
  // hitting the same generic aliases.
  const genericTypeAliases = group.groupType === 'reading' ? ['reading', 'reading comprehension'] : []
  const letteredSectionAliases =
    group.groupType === 'reading' && readingSection
      ? [
          `reading ${readingSection}`,
          `passage ${readingSection}`,
          `阅读 ${readingSection}`,
          `阅读${readingSection}`,
          `阅读理解 ${readingSection}`,
        ]
      : []

  // Topic label leaf strings PLUS every `-`-joined path segment, so a
  // teacher's query lands whether they say the full path
  // ("人与自然-自然生态-生态环境"), just the theme group ("自然生态"), or
  // just the leaf subtopic ("生态环境").
  const topicLabels = group.topicLabels || []
  const topicSegments = topicLabels.flatMap((label) => [
    label.label,
    ...String(label.label || '').split('-'),
    label.theme,
    label.themeGroup,
    label.subtopic,
  ])

  return {
    topic: topicSegments.filter(Boolean).map(normalize).join(' '),
    section: [group.section, ...letteredSectionAliases].filter(Boolean).map(normalize).join(' '),
    place: [group.region, group.paperName, String(group.year || '')]
      .filter(Boolean)
      .map(normalize)
      .join(' '),
    general: [
      ...KEYWORD_FIELDS.map((field) => String(group[field] ?? '')),
      ...(group.tags || []),
      ...genericTypeAliases,
    ]
      .filter(Boolean)
      .map(normalize)
      .join(' '),
  }
}

function tokenMatchesHaystack(haystack: string, token: string): boolean {
  if (/^[a-z]$/.test(token)) {
    return new RegExp(`(^|[^a-z0-9])${escapeRegex(token)}([^a-z0-9]|$)`, 'i').test(
      haystack,
    )
  }
  return haystack.includes(token)
}

/** Pick the topic label whose leaf/path text a matched token actually landed on. */
function findMatchedTopicLabel(group: QuestionGroupCard, matchedTokens: string[]): TopicLabel | null {
  for (const label of group.topicLabels || []) {
    const segments = [label.label, ...String(label.label || '').split('-'), label.subtopic]
      .filter(Boolean)
      .map(normalize)
    for (const token of matchedTokens) {
      if (segments.some((segment) => tokenMatchesHaystack(segment, token))) {
        return label
      }
    }
  }
  return null
}

/**
 * A 2-character CJK bigram is a deliberately loose net (needed so "生态主题"
 * can land on "生态环境") and carries real collision risk on its own. A
 * longer CJK run — 3+ characters, and especially the *whole* run tokenize()
 * kept intact — is a near-verbatim phrase; matching one is strong, specific
 * evidence (e.g. a chunk of a passage title), not incidental overlap. This
 * factor lets a handful of long-run/whole-run hits outweigh a pile of short
 * bigram hits without a separate bookkeeping pass.
 */
function tokenLengthFactor(token: string): number {
  if (token.length >= 5) return 4
  if (token.length >= 3) return 2
  return 1
}

function scoreGroupAgainstTokens(
  group: QuestionGroupCard,
  tokens: string[],
): { score: number; nonGeneralScore: number; hits: number; matchedTokens: string[] } {
  const tiers = buildWeightedHaystacks(group)
  let score = 0
  let nonGeneralScore = 0
  let hits = 0
  const matchedTokens: string[] = []
  for (const token of tokens) {
    const tierKey = (['topic', 'section', 'place', 'general'] as const).find((key) =>
      tokenMatchesHaystack(tiers[key], token),
    )
    if (!tierKey) continue
    hits += 1
    const weight = WEIGHT_BY_TIER[tierKey] * tokenLengthFactor(token)
    score += weight
    if (tierKey !== 'general') nonGeneralScore += weight
    matchedTokens.push(token)
  }
  return { score, nonGeneralScore, hits, matchedTokens }
}

function rankKeywordCandidates(
  groups: QuestionGroupCard[],
  query: string,
  options?: { requireIntentMatch?: boolean },
): KeywordCandidate[] {
  const tokens = tokenize(query).map(normalize).filter((t) => t.length > 0)
  if (tokens.length === 0) {
    return groups.map((group) => ({
      group,
      hits: 0,
      score: 0,
      nonGeneralScore: 0,
      matchedTokens: [],
      matchedTopicLabel: null,
    }))
  }
  const intent = parseLocalIntent(query)
  const pool = options?.requireIntentMatch ? applyIntentHardFilters(groups, intent) : groups
  const scored = pool.map((group) => {
    const { score, nonGeneralScore, hits, matchedTokens } = scoreGroupAgainstTokens(group, tokens)
    const yearBoost = intent.year && group.year === intent.year ? WEIGHT_BY_TIER.place : 0
    return {
      group,
      hits,
      score: score + yearBoost,
      nonGeneralScore: nonGeneralScore + yearBoost,
      matchedTokens,
      matchedTopicLabel: findMatchedTopicLabel(group, matchedTokens),
    }
  })
  return scored
    .filter((entry) => entry.hits > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return (b.group.year || 0) - (a.group.year || 0)
    })
}

/**
 * When no topic label matched, fall back to a matched `tags` entry as the
 * "what this is about" phrase — a curated tag ("社区共享") reads like a
 * teacher wrote it; a raw bigram token ("态主") does not.
 */
function findMatchedTag(group: QuestionGroupCard, matchedTokens: string[]): string | null {
  for (const tag of group.tags || []) {
    const normalizedTag = normalize(tag)
    if (!normalizedTag) continue
    if (matchedTokens.some((token) => tokenMatchesHaystack(normalizedTag, token))) {
      return tag
    }
  }
  return null
}

/** Build a teacher-facing reason line from what actually matched — no raw token dump. */
function buildLocalReason(candidate: KeywordCandidate): string {
  const { group, matchedTopicLabel, matchedTokens } = candidate
  const section = extractReadingSectionLabel(group)
  // "讲生态环境的 C 篇" style — a space before the bare section letter reads
  // as a label ("C 篇"), not "C篇" glued to the preceding Chinese clause.
  const sectionText = section ? `${section.toUpperCase()} 篇` : (groupTypeLabel[group.groupType] || '')
  const topicText =
    matchedTopicLabel?.subtopic ||
    matchedTopicLabel?.label.split('-').pop() ||
    findMatchedTag(group, matchedTokens) ||
    ''
  const placeText = [group.year ? `${group.year}` : '', group.region].filter(Boolean).join(' ')

  const parts: string[] = []
  if (topicText && sectionText) {
    parts.push(`讲${topicText}的 ${sectionText}`)
  } else if (topicText) {
    parts.push(`讲${topicText}`)
  } else if (sectionText) {
    parts.push(sectionText)
  }
  if (placeText) parts.push(placeText)

  if (parts.length > 0) return parts.join(' · ')
  if (matchedTokens.length > 0) return `匹配关键词：${matchedTokens.join('、')}`
  return '关键词匹配'
}

function toSearchHit(candidate: KeywordCandidate): ConciergeSearchHit {
  return {
    group: candidate.group,
    reason: buildLocalReason(candidate),
  }
}

/** Keyword fallback ranking: count hits across known card fields + tags + topicLabels. */
export function rankByKeywords(
  groups: QuestionGroupCard[],
  query: string,
  limit = 12,
): ConciergeSearchHit[] {
  const tokens = tokenize(query).map(normalize).filter((t) => t.length > 0)
  if (tokens.length === 0) {
    return groups.slice(0, limit).map((group) => ({ group, reason: '近期题组' }))
  }
  return rankKeywordCandidates(groups, query)
    .slice(0, limit)
    .map(toSearchHit)
}

/**
 * Threshold recalibrated for the weighted-score model (V1 compared raw hit
 * counts against a `>= 2` floor). A single topic-label hit (score 5) or a
 * section+place combo (3 + 2 = 5) should already be considered a confident
 * local match; a single generic-field hit (score 1) should not.
 */
const HIGH_CONFIDENCE_SCORE_FLOOR = 5

/**
 * A pure `general`-tier match (no topic/section/place signal at all) needs a
 * higher bar: several scattered incidental keyword hits should NOT resolve
 * locally (that is exactly the "let the steward try" case), but a dense,
 * near-verbatim phrase match against the title/passage text — the query
 * contains a long run that appears in the passage almost word-for-word —
 * is strong enough evidence on its own.
 */
const GENERAL_ONLY_PHRASE_SCORE_FLOOR = 8

function highConfidenceLocalHits(
  groups: QuestionGroupCard[],
  query: string,
  limit = 12,
): ConciergeSearchHit[] {
  // Section / group-type / region are hard filters when the query names them
  // explicitly ("2025 浙江卷", "七选五", "全国甲卷 完形") — a teacher who
  // names a dimension explicitly wants that dimension respected, not
  // "softly preferred". If the filter would eliminate every group (e.g. the
  // intent parse mis-fires on an unrelated query), fall through to the
  // unfiltered candidate set instead of returning zero results.
  const filteredCandidates = rankKeywordCandidates(groups, query, { requireIntentMatch: true })
  const candidates = filteredCandidates.length > 0
    ? filteredCandidates
    : rankKeywordCandidates(groups, query)
  const topScore = candidates[0]?.score ?? 0
  const topNonGeneralScore = candidates[0]?.nonGeneralScore ?? 0

  // Confidence requires a non-trivial signal, not just a couple of
  // incidental general-field hits. Two ways to earn confidence:
  //   1. The non-general score (topic / section / place tiers) alone
  //      clears the floor — a real topic-label hit, a lettered section
  //      match ("Reading C"), or a region/year hit. A bare section letter
  //      with nothing else recognized (e.g. "生态主题 C 篇" against a
  //      dataset with no ecology-tagged group) scores only the single
  //      letter's weight and correctly stays below this floor — it still
  //      deserves the steward's fuzzier semantic read.
  //   2. The total score (even if entirely general-tier) clears a higher
  //      bar — a dense/near-verbatim phrase match against the title or
  //      passage text, not scattered single-word overlap.
  const confident =
    topNonGeneralScore >= HIGH_CONFIDENCE_SCORE_FLOOR || topScore >= GENERAL_ONLY_PHRASE_SCORE_FLOOR
  if (!confident) return []

  return candidates
    .filter((candidate) => candidate.score === topScore)
    .slice(0, limit)
    .map(toSearchHit)
}

function hitsFromStewardMatches(
  matches: SemanticSearchMatch[],
  questionGroups: QuestionGroupCard[],
): ConciergeSearchHit[] {
  const groupById = new Map(questionGroups.map((g) => [g.id, g]))
  return matches
    .map((match) => {
      const group = groupById.get(match.questionGroupId) || match.questionGroup
      if (!group) return null
      return { group, reason: (match.reason || '').trim() }
    })
    .filter((hit): hit is ConciergeSearchHit => hit !== null)
}

function buildSentMessage(intent: string, pendingQuery: string | null | undefined): string {
  const trimmed = intent.trim()
  if (pendingQuery && trimmed && trimmed !== pendingQuery) {
    return `${pendingQuery}；补充说明：${trimmed}`
  }
  return trimmed
}

const DEFAULT_STEWARD_TIMEOUT_MS = 6000

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = globalThis.setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`))
    }, timeoutMs)
    promise.then(
      (value) => {
        globalThis.clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        globalThis.clearTimeout(timer)
        reject(error)
      },
    )
  })
}

export async function runConciergeSearch(
  input: ConciergeSearchInput,
): Promise<ConciergeSearchOutcome> {
  const intent = input.intent.trim()
  const sentMessage = buildSentMessage(intent, input.pendingQuery)
  const apiKey = (input.apiKey || '').trim()
  const thinkingMode = input.thinkingMode ?? false
  const doStewardCall = input.doStewardCall || askQuestionBankSteward
  const localDirectHits = highConfidenceLocalHits(input.questionGroups, intent)

  if (localDirectHits.length > 0) {
    return {
      kind: 'results',
      hits: localDirectHits,
      assistantMessage: '已按本地题库精确信息匹配。',
      query: intent,
      sentMessage,
      source: 'fallback',
      fallbackReason: 'local-direct-match',
    }
  }

  if (!apiKey) {
    return {
      kind: 'results',
      hits: rankByKeywords(input.questionGroups, intent),
      assistantMessage: '没填 AI 密钥，先用本地题库帮你找。',
      query: intent,
      sentMessage,
      source: 'fallback',
      fallbackReason: 'missing-api-key',
    }
  }

  try {
    const result = await withTimeout(
      doStewardCall(sentMessage, apiKey, thinkingMode),
      input.stewardTimeoutMs ?? DEFAULT_STEWARD_TIMEOUT_MS,
      'question-bank steward',
    )
    if (result.needsClarification) {
      return {
        kind: 'clarification',
        assistantMessage: result.assistantMessage || '能再说细一点吗？',
        clarificationQuestion: result.clarificationQuestion || result.assistantMessage || '能再说细一点吗？',
        query: intent,
        sentMessage,
      }
    }
    const matches = result.search?.matches || result.matches || []
    return {
      kind: 'results',
      hits: hitsFromStewardMatches(matches, input.questionGroups),
      assistantMessage: result.assistantMessage || '找到一些可能匹配的题组。',
      query: intent,
      sentMessage,
      source: 'steward',
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    // Surface the technical error in the dev console only; UI gets a soft Chinese line.
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[concierge] steward call failed; using keyword fallback:', message)
    }
    return {
      kind: 'results',
      hits: rankByKeywords(input.questionGroups, intent),
      assistantMessage: '管家暂时没连上，我先用本地题库帮你找。',
      query: intent,
      sentMessage,
      source: 'fallback',
      fallbackReason: 'api-error',
    }
  }
}

/**
 * Build a "find similar" intent string for a known group.
 * Uses title / summary / tags so users see why the new search is relevant.
 */
export function buildSimilarIntent(group: QuestionGroupCard): string {
  const tags = (group.tags || []).slice(0, 3)
  const tagText = tags.length > 0 ? `；标签 ${tags.join('、')}` : ''
  const summary = (group.summary || '').trim()
  const summaryText = summary ? `；主题接近「${summary.slice(0, 40)}」` : ''
  return `找类似这道题：${group.title}${summaryText}${tagText}`
}
