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
  /** DeepSeek key. Empty string means "go straight to fallback" unless serverKeyAvailable. */
  apiKey: string
  /**
   * True when the server holds its own DeepSeek key (cut ai-key-server-fallback:
   * GET /api/ai/status). Lets the steward call proceed with an empty apiKey — the
   * server's own `apiKey || DEEPSEEK_API_KEY` fallback picks it up. Defaults to false,
   * which preserves the pre-cut behavior (local fallback whenever apiKey is empty).
   */
  serverKeyAvailable?: boolean
  /**
   * True when today's server-key AI daily quota is exhausted (cut m0-5-ai-daily-limit,
   * GET /api/ai/status dailyLimit.exceeded). When true AND no client key is present,
   * the search goes straight to the local keyword fallback — same as serverKeyAvailable
   * being false, but with distinct fallback-reason / assistant-message text so a
   * teacher can tell "no key configured" apart from "today's quota ran out". Defaults
   * to false, which preserves pre-cut behavior.
   */
  dailyLimitExceeded?: boolean
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
  /**
   * True when this hit has no real dimension/topic signal (no topicLabel /
   * 篇位 / 题型 / 地区 match) and only cleared the noise floor on scattered
   * general-field substring hits. Steward-sourced hits are never weak — this
   * only applies to the local keyword fallback. Absent/false means "normal
   * confidence"; UI treats `undefined` the same as `false`.
   */
  weak?: boolean
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
      /**
       * True when every hit in `hits` is `weak` (only fires when `hits` is
       * non-empty — an empty result never reaches here, it takes the
       * `kind: 'results', hits: []` shape instead so the desk can render the
       * true vacuum state + starter chips). Lets the notice bar distinguish
       * "no exact match, here is what's topically close" from an ordinary
       * confident fallback match.
       */
      allWeak: boolean
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

/**
 * Restart cut ⑤ helper: which "run" each `tokenize()` output token was
 * produced from — a whitespace/punctuation-delimited segment's CJK run (the
 * whole run itself, plus every bigram `cjkBigrams` carved out of IT, all
 * share that run's id), or a standalone non-CJK segment (its own id).
 *
 * Feeds the multiplicity signal in `rankKeywordCandidates`: two bigrams
 * carved from the SAME connected run ("存在" and "在的", both sliced out of
 * "不存在的题目") are not independent evidence — they are two views of one
 * coincidence, exactly the "存在的" 3-char span overlap CR-5 flagged. Two
 * tokens from DIFFERENT runs ("随便" and "征集" in "随便 征集作品", or a
 * mixed CJK+non-CJK query) genuinely are two separate coincidences, which is
 * much less likely to both be accidental.
 */
function tokenRunIdsOf(query: string): Map<string, number> {
  const raw = query
    .replace(/[，。、；：！？,.!?;:()（）【】"'《》<>\\/|]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)

  const runIds = new Map<string, number>()
  let nextRunId = 0
  for (const segment of raw) {
    let cjkRun = ''
    const flushCjkRun = () => {
      if (!cjkRun) return
      const runId = nextRunId++
      if (!CJK_STOPWORDS.has(cjkRun)) runIds.set(cjkRun, runId)
      for (const gram of cjkBigrams(cjkRun)) {
        if (!CJK_STOPWORDS.has(gram)) runIds.set(gram, runId)
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
    const nonCjkOnly = /^[^一-鿿]+$/.test(segment)
    if (nonCjkOnly) runIds.set(segment, nextRunId++)
  }
  return runIds
}

/**
 * Restart cut ⑤ MF-1 fix — document-frequency (DF) noise signal.
 *
 * V1 of this cut used a "whole-run token" check (was the matched token a
 * user-typed, delimiter-bounded unit, vs a `cjkBigrams` fragment carved out
 * of a longer connected run). CR-5 measured that this misfires on the MOST
 * common real teacher input shape — unspaced Chinese ("找篇科技文",
 * "科技文章") — because a real 2-char content word carved out of an unbroken
 * run is structurally IDENTICAL to a coincidental bigram carved out of
 * gibberish; neither is ever a "whole run" token. That check silently
 * dropped genuine hits.
 *
 * DF replaces it: build one combined haystack per group — every tier
 * (topic label segments, section/place, tags, general fields) joined — and
 * count, across the WHOLE candidate pool, how many groups' haystacks contain
 * a given token as a substring. A token that is genuinely part of this
 * bank's vocabulary ("科技" DF≈19, "生态" DF≈29, "写作" DF≈54 in the live
 * 278-group bank) clears a small absolute floor easily; an isolated
 * collision bigram carved from a garbled query ("存在"/"题目" from
 * "不存在的题目") measured DF 1-2 — NOT reliably separable from DF alone at
 * this floor, because a corpus this size also contains genuinely rare real
 * words at DF 1-2 (e.g. "征集" DF=1 for one real 应用文 group).
 *
 * The DF floor is therefore combined with a second, complementary signal:
 * matched-token COUNT. A query that only ever lands ONE isolated token on a
 * given candidate (every gibberish-polluted candidate measured this way —
 * "存在" alone, "题目" alone, never two) is much weaker evidence than a
 * candidate matched by two OR MORE independent tokens (a coincidence has to
 * happen twice on the same candidate, which is far less likely than once).
 * A candidate clears the general-tier noise floor when EITHER signal fires:
 * DF_THRESHOLD alone (a single but clearly-common token), or 2+ distinct
 * matched tokens (multiple weaker/rarer tokens corroborating each other).
 * This also keeps small hermetic test pools (1-12 groups, where an absolute
 * DF of 3 may be structurally unreachable) working via the multiplicity path.
 */
const DF_NOISE_THRESHOLD = 3

/**
 * All haystack tiers joined into one substring-search string per group —
 * topic label segments, section/place, tags, and general fields. Reuses
 * `buildWeightedHaystacks` (already computed per group elsewhere) so this
 * stays in lockstep with what the ranked score itself considers matchable;
 * a token DF should reflect the SAME text the scorer searches, not a
 * narrower/wider slice of it.
 */
function buildCombinedHaystack(group: QuestionGroupCard): string {
  const tiers = buildWeightedHaystacks(group)
  return [tiers.topic.join(' '), tiers.section, tiers.place, tiers.general].join(' ')
}

/**
 * Lazy per-pool DF cache: `rankKeywordCandidates` is called once per search
 * round with a fixed candidate pool, so build the pool's combined haystacks
 * once and memoize each token's document frequency the first time it is
 * asked for. Cheap at real-bank scale (273 groups) — CR-5's own sizing note.
 */
function makeDocumentFrequencyLookup(pool: QuestionGroupCard[]): (token: string) => number {
  const haystacks = pool.map(buildCombinedHaystack)
  const cache = new Map<string, number>()
  return (token: string): number => {
    const cached = cache.get(token)
    if (cached !== undefined) return cached
    let df = 0
    for (const haystack of haystacks) {
      if (haystack.includes(token)) df += 1
    }
    cache.set(token, df)
    return df
  }
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
  /**
   * True when this candidate's matched tokens carry enough corpus-level
   * signal to clear the general-tier noise floor — see `DF_NOISE_THRESHOLD`
   * doc comment. Computed once per `rankKeywordCandidates` call using the
   * pool-scoped DF lookup; restart cut ⑤ MF-1 fix.
   */
  hasCorpusSignal: boolean
  /**
   * CR-5 SW-2 fix — one representative token per matched query run (see
   * `tokenRunIdsOf`), keeping only the LONGEST token from each run. A carved
   * 2-char bigram never appears here unless it is itself the longest thing
   * its run produced (i.e. the run IS just 2 characters, a real short word).
   * This is what `buildLocalReason`'s weak fallback line joins — never the
   * raw `matchedTokens`, which can contain meaningless carve fragments like
   * "的完"/"集作" a teacher should never have to read.
   */
  displayTokens: string[]
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function extractReadingSectionLabel(group: QuestionGroupCard): string | null {
  const text = [group.section, group.source, group.title].join(' ')
  // Real imported data stores the passage letter in `title` as bare English
  // "Reading C" / "Passage C" — `group.section` is a generic paper-outline
  // string ("第二部分 阅读 / 第一节 阅读理解") with no letter at all. Try the
  // Chinese "阅读(理解)?C" form first (sample/legacy data), then the English
  // "Reading/Passage C" form (real imported data).
  const cnMatch = text.match(/阅读(?:理解)?\s*([A-D])/i)
  if (cnMatch) return cnMatch[1].toLowerCase()
  const enMatch = text.match(/\b(?:reading|passage)\s*([A-D])\b/i)
  return enMatch ? enMatch[1].toLowerCase() : null
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
  /**
   * Topic segments stay an ARRAY, not a joined string. Topic matching uses
   * a stricter prefix/equal rule (see `topicSegmentMatchesToken`) that must
   * run per-segment — joining segments into one string and substring-testing
   * the whole blob would let a token match across a segment boundary (e.g.
   * landing inside "人生态度" just because some other segment nearby
   * contains "生"), which is exactly the false-positive this tier exists to
   * avoid.
   */
  topic: string[]
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
    topic: topicSegments.filter(Boolean).map(normalize),
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

/**
 * Topic-tier matching is intentionally STRICTER than the generic substring
 * check every other tier uses. Plain substring matching let a query bigram
 * like "生态" land inside an unrelated label such as "正确的人生态度" ("生态"
 * IS a substring of "人生态度" — chars 2-3 — even though the label has
 * nothing to do with ecology). A topic segment earns a match only when the
 * token is the WHOLE segment or the segment's leading text — i.e. the token
 * reads like the start of that specific topic word, not a coincidental
 * embedded pair of characters:
 *   "生态"  -> "生态环境" segment: match (prefix)
 *   "生态"  -> "人生态度" segment: no match (embedded, not a prefix)
 *   "生态环境" -> "生态环境" segment: match (equal)
 */
function topicSegmentMatchesToken(segment: string, token: string): boolean {
  if (!segment || !token) return false
  return segment === token || segment.startsWith(token)
}

/** Pick the topic label whose leaf/path text a matched token actually landed on. */
function findMatchedTopicLabel(group: QuestionGroupCard, matchedTokens: string[]): TopicLabel | null {
  for (const label of group.topicLabels || []) {
    const segments = [label.label, ...String(label.label || '').split('-'), label.subtopic]
      .filter(Boolean)
      .map(normalize)
    for (const token of matchedTokens) {
      if (segments.some((segment) => topicSegmentMatchesToken(segment, token))) {
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

function matchesTier(tiers: HaystackTiers, tierKey: keyof HaystackTiers, token: string): boolean {
  if (tierKey === 'topic') {
    return tiers.topic.some((segment) => topicSegmentMatchesToken(segment, token))
  }
  return tokenMatchesHaystack(tiers[tierKey], token)
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
      matchesTier(tiers, key, token),
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

/**
 * Query-side chrome characters (audit挂账 #3' — weak-reason token leak fix).
 *
 * A matched token is worth ECHOING BACK to the teacher only when it reads
 * like a content word. `cjkBigrams` deliberately carves loose fragments out
 * of a connected run ("我想要一篇讲动物的题" → "我想"/"要一"/"的题"/...) so
 * matching can be forgiving — but those fragments are tokenizer debris, and
 * real-bank QA saw them leak into the visible reason ("可能相关：要一").
 * Any token containing one of these grammar / politeness / counter / paper-
 * meta characters is suppressed from DISPLAY (scoring is untouched — which
 * hits surface, and how they rank, does not change).
 *
 * Bias is deliberately toward suppression: a falsely-killed real word
 * ("有趣" via 有, "演讲" via 讲) just degrades that reason to the bare,
 * honest "可能相关" line that already exists — while a falsely-kept fragment
 * is gibberish in the teacher's face. The set is the character inventory of
 * `CJK_STOPWORDS` plus common function characters, minus characters that
 * commonly build real topic words (关→关系, 话→神话, 好→好奇 are excluded).
 */
const REASON_CHROME_CJK_CHARS = new Set(
  '的了篇题找一两道请帮我你他她它个最是在和与些这那有于讲给要想需能就都也还很么吗呢吧啊呀之其或及不没把被对从到让别',
)

/**
 * Real words the chrome-character rule cannot catch, but that describe the
 * QUERY or the QUESTION-BANK APPARATUS rather than passage content —
 * "可能相关：相关" / "可能相关：文章" tells the teacher nothing.
 */
const REASON_META_WORDS = new Set(['文章', '内容', '相关', '资料', '材料', '素材', '东西'])

/**
 * True when a matched token reads like a content word a teacher would
 * recognize as "why this group surfaced": at least 2 characters (a bare
 * section letter "c" or a lone CJK character is never self-explanatory),
 * no query-chrome characters, not a meta word.
 */
function isDisplayWorthyToken(token: string): boolean {
  if (token.length < 2) return false
  if (REASON_META_WORDS.has(token)) return false
  for (const ch of token) {
    if (REASON_CHROME_CJK_CHARS.has(ch)) return false
  }
  return true
}

/**
 * CR-5 SW-2 fix — collapse `matchedTokens` down to one representative token
 * per query run (see `tokenRunIdsOf`), keeping the LONGEST token from each
 * run. A run that produced a real word ("科技") keeps that word; a run that
 * only produced overlapping carve fragments keeps whichever fragment is
 * longest — never a laundry list of every bigram carved from the same short
 * span. Order follows first-appearance in `matchedTokens` for stable,
 * predictable reason text.
 *
 * Display-worthiness (audit挂账 #3') filters BEFORE the longest-per-run
 * pick, so chrome fragments never occupy a run's display slot: for
 * "…讲动物的题", the carve order puts "要一" ahead of "动物" and both are
 * length 2 — without the filter the fragment wins the first-appearance
 * tiebreak; with it, the content word does. A run whose matches are all
 * chrome contributes nothing, and a fully-empty result degrades the weak
 * reason to the bare "可能相关" line in `buildLocalReason`.
 */
function pickDisplayTokens(matchedTokens: string[], tokenRunIds: Map<string, number>): string[] {
  const bestByRun = new Map<number, string>()
  const runOrder: number[] = []
  for (const token of matchedTokens) {
    if (!isDisplayWorthyToken(token)) continue
    const runId = tokenRunIds.get(token) ?? -1
    const current = bestByRun.get(runId)
    if (current === undefined) {
      runOrder.push(runId)
      bestByRun.set(runId, token)
    } else if (token.length > current.length) {
      bestByRun.set(runId, token)
    }
  }
  return runOrder.map((runId) => bestByRun.get(runId) as string)
}

function rankKeywordCandidates(groups: QuestionGroupCard[], query: string): KeywordCandidate[] {
  const tokens = tokenize(query).map(normalize).filter((t) => t.length > 0)
  if (tokens.length === 0) {
    return groups.map((group) => ({
      group,
      hits: 0,
      score: 0,
      nonGeneralScore: 0,
      matchedTokens: [],
      matchedTopicLabel: null,
      hasCorpusSignal: false,
      displayTokens: [],
    }))
  }
  // DF is measured against the FULL, unfiltered bank (not the possibly
  // intent-narrowed `pool` below) — a token's corpus-vocabulary status
  // should not shift depending on which dimension filter happened to fire
  // for this particular query.
  const documentFrequencyOf = makeDocumentFrequencyLookup(groups)
  const tokenRunIds = tokenRunIdsOf(query)
  const intent = parseLocalIntent(query)
  // Explicit dimensions (section letter / group type / region) hard-filter
  // by default — a teacher who says "C 篇" or "全国甲卷" named a real
  // constraint, and every caller (both the high-confidence local-direct
  // path AND the last-resort no-API-key/steward-error fallback that
  // teachers actually hit most often when no AI key is configured) should
  // respect it. Only fall back to the unfiltered pool when the filter would
  // eliminate every group — an unrelated query should never go empty just
  // because the intent parser mis-fired.
  const intentFilteredPool = applyIntentHardFilters(groups, intent)
  const hasExplicitIntent = intent.sectionLetters.length > 0 || !!intent.groupType || !!intent.region
  const pool = hasExplicitIntent && intentFilteredPool.length > 0 ? intentFilteredPool : groups
  const scored = pool.map((group) => {
    const { score, nonGeneralScore, hits, matchedTokens } = scoreGroupAgainstTokens(group, tokens)
    const yearBoost = intent.year && group.year === intent.year ? WEIGHT_BY_TIER.place : 0
    // Two independent ways a general-tier match earns corpus signal:
    //   1. At least one matched token is common enough in the bank's own
    //      vocabulary (DF >= DF_NOISE_THRESHOLD) to read as a real content
    //      word, not a coincidental carve.
    //   2. Two or more matched tokens come from DIFFERENT query runs (see
    //      `tokenRunIdsOf`) — a coincidence landing on this candidate twice,
    //      from two UNRELATED parts of the query, is far less likely than
    //      once. Two overlapping bigrams carved from the SAME connected run
    //      ("存在"+"在的" both sliced out of "不存在的题目") do NOT count as
    //      two here — they collapse to one run and carry exactly one
    //      coincidence's worth of evidence, matching the CR-5 measured
    //      real-bank false-positive shape.
    const matchedRunIds = new Set(matchedTokens.map((token) => tokenRunIds.get(token) ?? -1))
    const hasCorpusSignal =
      matchedTokens.some((token) => documentFrequencyOf(token) >= DF_NOISE_THRESHOLD) || matchedRunIds.size >= 2
    return {
      group,
      hits,
      score: score + yearBoost,
      nonGeneralScore: nonGeneralScore + yearBoost,
      matchedTokens,
      matchedTopicLabel: findMatchedTopicLabel(group, matchedTokens),
      hasCorpusSignal,
      displayTokens: pickDisplayTokens(matchedTokens, tokenRunIds),
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
 * True for a tag that names a dimension (year / month / region / paper /
 * source-type / group-type) rather than passage content. These are exactly
 * the provenance tags real imports attach ("2025", "1月", "浙江卷", "真题",
 * "完形填空", ...) — they duplicate what `sectionText`/`placeText` already
 * render, so using one as the "讲X的" topic phrase produces nonsense like
 * "讲2025的 完形填空" or "讲七选五的 七选五".
 */
function isDimensionShapedTag(tag: string): boolean {
  const value = tag.trim()
  if (!value) return true
  if (/^\d{4}$/.test(value)) return true // bare year: "2025"
  if (/^\d{1,2}月$/.test(value)) return true // bare month: "1月" / "6月"
  if (/^(真题|模拟题|自建|其他|AI导题)$/.test(value)) return true // source-type provenance
  if (Object.values(groupTypeLabel).includes(value)) return true // "完形填空" / "阅读理解" / ...
  if (/卷$/.test(value)) return true // paper/region provenance: "浙江卷" / "全国甲卷" / "新课标Ⅰ卷"
  if (/^(九省联考|新高考全国卷[一二三]?)$/.test(value)) return true // other bare provenance labels
  return false
}

/**
 * When no topic label matched, fall back to a matched `tags` entry as the
 * "what this is about" phrase — a curated content tag ("社区共享") reads
 * like a teacher wrote it; a dimension tag ("2025", "完形填空") does not —
 * it just repeats what the section/place parts of the reason already say.
 */
function findMatchedTag(group: QuestionGroupCard, matchedTokens: string[]): string | null {
  for (const tag of group.tags || []) {
    if (isDimensionShapedTag(tag)) continue
    const normalizedTag = normalize(tag)
    if (!normalizedTag) continue
    if (matchedTokens.some((token) => tokenMatchesHaystack(normalizedTag, token))) {
      return tag
    }
  }
  return null
}

/**
 * Build a teacher-facing reason line from what actually matched — no raw
 * token dump. `weak` (restart cut ⑤) softens the wording for a hit that
 * cleared the noise floor but not the confidence floor: the reason must not
 * claim a "命中" (hit) the search isn't actually confident about, so it uses
 * "可能相关" phrasing instead of asserting a topic/keyword match.
 */
function buildLocalReason(candidate: KeywordCandidate, weak = false): string {
  const { group, matchedTopicLabel, matchedTokens, displayTokens } = candidate
  const section = extractReadingSectionLabel(group)
  // "讲生态环境的 C 篇" style — a space before the bare section letter reads
  // as a label ("C 篇"), not "C篇" glued to the preceding Chinese clause.
  const sectionText = section ? `${section.toUpperCase()} 篇` : (groupTypeLabel[group.groupType] || '')
  // Only real content (a topic-label subtopic or a curated content tag)
  // earns the "讲X的" phrasing. A pure dimension hit (year / 题型 / 篇位 /
  // 地区, with nothing else recognized) has no content word to report —
  // it renders as a plain "地区 年份 · 题型/篇位" line instead, below.
  const topicText =
    matchedTopicLabel?.subtopic ||
    matchedTopicLabel?.label.split('-').pop() ||
    findMatchedTag(group, matchedTokens) ||
    ''
  const placeText = [group.year ? `${group.year}` : '', group.region].filter(Boolean).join(' ')

  const parts: string[] = []
  if (topicText && sectionText) {
    parts.push(weak ? `可能与${topicText}相关的 ${sectionText}` : `讲${topicText}的 ${sectionText}`)
  } else if (topicText) {
    parts.push(weak ? `可能与${topicText}相关` : `讲${topicText}`)
  } else if (placeText && sectionText && !weak) {
    // Pure-dimension match (e.g. "2025 浙江卷", "全国甲卷 完形"): state the
    // dimensions plainly, place first — no invented topic clause. Gated on
    // `!weak` — a weak candidate did not actually earn a dimension match
    // (place/section text here is read straight off the group's own
    // fields, not off what the query tokens matched), so claiming it here
    // would contradict the "可能相关" honesty this wording exists for.
    parts.push(placeText)
    parts.push(sectionText)
    return parts.join(' · ')
  } else if (sectionText && !weak) {
    parts.push(sectionText)
  }
  if (placeText && !weak) parts.push(placeText)

  if (parts.length > 0) return parts.join(' · ')
  // CR-5 SW-2: the weak fallback line joins `displayTokens` (one longest
  // DISPLAY-WORTHY token per matched query run — see `isDisplayWorthyToken`),
  // never raw `matchedTokens` — a carved 2-char bigram sibling like
  // "的完"/"集作", a chrome fragment like "要一", a bare section letter "c",
  // or a meta word like "相关" must never reach this teacher-facing string
  // even when it technically contributed to the score. When nothing
  // display-worthy matched, the bare "可能相关" line is the honest floor.
  if (weak) {
    return displayTokens.length > 0 ? `可能相关：${displayTokens.join('、')}` : '可能相关'
  }
  if (matchedTokens.length > 0) return `匹配关键词：${matchedTokens.join('、')}`
  return '关键词匹配'
}

function toSearchHit(candidate: KeywordCandidate): ConciergeSearchHit {
  const weak = !isConfidentCandidate(candidate)
  return {
    group: candidate.group,
    reason: buildLocalReason(candidate, weak),
    weak,
  }
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

/**
 * A candidate is noise — not even "weak" — only when its ENTIRE signal is
 * general-tier (title/summary/tags/... — no topicLabel / 篇位 / 题型 / 地区
 * signal at all, i.e. `nonGeneralScore === 0`) AND it has no `hasCorpusSignal`
 * (see `DF_NOISE_THRESHOLD` doc comment — CR-5 MF-1 fix). This is exactly
 * the shape a garbled/gibberish query produces against a large real bank:
 * one or more isolated 2-character CJK bigrams (weight 1 general-tier x
 * length factor 1 = 1 each), CARVED OUT of a longer garbled run,
 * coincidentally substring-match some field of some group, each in
 * isolation (measured: every gibberish-polluted real-bank candidate matched
 * exactly one such token, never two) AND that token is corpus-rare (DF 1-2,
 * below the DF_NOISE_THRESHOLD floor).
 *
 * Any candidate with `nonGeneralScore > 0` — even a single section-letter
 * hit ("C" alone, section-tier weight 3) that stays well below the
 * confidence floor — already carries a real, if partial, dimension signal
 * and must never be reclassified as noise; it is weak at worst (mirrors the
 * `highConfidenceLocalHits` doc comment: "a bare section letter... still
 * deserves the steward's fuzzier semantic read", now also "still deserves
 * an honest weak card" for the local fallback).
 *
 * "找篇科技文" / "科技文章" (unspaced, the real teacher-input shape) are NOT
 * the noise case: "科技" is corpus-common (DF>=DF_NOISE_THRESHOLD in the
 * live bank), so `hasCorpusSignal` fires via the DF path even though "科技"
 * is, mechanically, just as much a carved bigram as any gibberish fragment —
 * the difference DF actually measures is real-bank vocabulary membership,
 * not the query-side carving mechanism.
 */

/**
 * True when a candidate has a real dimension/topic signal (clears the
 * existing high-confidence floors) OR at least clears the noise floor above.
 * `isConfidentCandidate` decides "not weak"; a candidate that is neither
 * confident nor above the noise floor is dropped entirely by the callers
 * below (never becomes a `weak: true` hit).
 *
 * Two-floor model, shared by `highConfidenceLocalHits` (the strict "resolve
 * locally without asking the steward" gate) and the fallback ranking (the
 * looser "still show it, but say so honestly" gate):
 *   - confident: non-general score clears HIGH_CONFIDENCE_SCORE_FLOOR, or
 *     total score clears GENERAL_ONLY_PHRASE_SCORE_FLOOR (dense/long phrase
 *     match — same rule `highConfidenceLocalHits` always used).
 *   - weak (not confident, but has ANY non-general signal, or
 *     `hasCorpusSignal` on its general-tier signal): shown, but flagged so
 *     the UI can say "可能相关" instead of implying a real hit.
 *   - noise (purely general-tier AND no corpus signal): dropped before it
 *     ever reaches the UI.
 */
function isConfidentCandidate(candidate: KeywordCandidate): boolean {
  return (
    candidate.nonGeneralScore >= HIGH_CONFIDENCE_SCORE_FLOOR ||
    candidate.score >= GENERAL_ONLY_PHRASE_SCORE_FLOOR
  )
}

function isAboveNoiseFloor(candidate: KeywordCandidate): boolean {
  if (isConfidentCandidate(candidate)) return true
  if (candidate.nonGeneralScore > 0) return true
  return candidate.hasCorpusSignal
}

/**
 * Keyword fallback ranking: count hits across known card fields + tags +
 * topicLabels, drop pure noise (see `WEAK_NOISE_FLOOR`), and mark surviving
 * non-confident hits as `weak` so the caller can render an honest notice
 * instead of implying every returned card is a real match.
 */
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
    .filter(isAboveNoiseFloor)
    .slice(0, limit)
    .map(toSearchHit)
}

function highConfidenceLocalHits(
  groups: QuestionGroupCard[],
  query: string,
  limit = 12,
): ConciergeSearchHit[] {
  // rankKeywordCandidates already hard-filters by any explicit intent
  // dimension (section letter / group type / region) when that filter
  // yields at least one candidate — see its doc comment.
  const candidates = rankKeywordCandidates(groups, query)
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

const DEFAULT_STEWARD_TIMEOUT_MS = 20000
const THINKING_STEWARD_TIMEOUT_MS = 60000

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
  const serverKeyAvailable = input.serverKeyAvailable ?? false
  const dailyLimitExceeded = input.dailyLimitExceeded ?? false
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
      // highConfidenceLocalHits only ever returns candidates that already
      // cleared the confidence floor, so this branch is never weak.
      allWeak: false,
    }
  }

  if (!apiKey && !serverKeyAvailable) {
    const hits = rankByKeywords(input.questionGroups, intent)
    return {
      kind: 'results',
      hits,
      assistantMessage: '没填 AI 密钥，先用本地题库帮你找。',
      query: intent,
      sentMessage,
      source: 'fallback',
      fallbackReason: 'missing-api-key',
      allWeak: hits.length > 0 && hits.every((hit) => hit.weak),
    }
  }

  // cut m0-5-ai-daily-limit (C5): server key exists but today's quota is exhausted
  // AND the teacher has not pasted their own key -> same local fallback path as
  // missing-api-key, but with a distinct reason/message (teacher can tell "no key
  // configured" apart from "AI ran out for today, back tomorrow").
  if (!apiKey && dailyLimitExceeded) {
    const hits = rankByKeywords(input.questionGroups, intent)
    return {
      kind: 'results',
      hits,
      assistantMessage: '今天的 AI 额度用完了，先用本地题库帮你找，明天自动恢复。',
      query: intent,
      sentMessage,
      source: 'fallback',
      fallbackReason: 'daily-limit-exceeded',
      allWeak: hits.length > 0 && hits.every((hit) => hit.weak),
    }
  }

  try {
    const defaultTimeoutMs = thinkingMode ? THINKING_STEWARD_TIMEOUT_MS : DEFAULT_STEWARD_TIMEOUT_MS
    const result = await withTimeout(
      doStewardCall(sentMessage, apiKey, thinkingMode),
      input.stewardTimeoutMs ?? defaultTimeoutMs,
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
    const fallbackHits = rankByKeywords(input.questionGroups, intent)
    return {
      kind: 'results',
      hits: fallbackHits,
      assistantMessage: '管家暂时没连上，我先用本地题库帮你找。',
      query: intent,
      sentMessage,
      source: 'fallback',
      fallbackReason: 'api-error',
      allWeak: fallbackHits.length > 0 && fallbackHits.every((hit) => hit.weak),
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
