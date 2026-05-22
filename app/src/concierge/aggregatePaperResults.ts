/**
 * Aggregate ConciergeSearchHit[] into source-paper rows for the V1.1 IA.
 *
 * One row in the desk's result list now represents an upstream "原卷 / 来源卷"
 * (e.g. "2026 浙江一模"), not a single passage. Each row carries the question
 * groups (篇章) inside that source paper that matched the user's search.
 *
 * 重要事实:
 *   - QuestionGroup 仍然是最小加入单位。本聚合只改"展示分桶"。
 *   - 草稿卷 (App.basket) 仍然按 group.id 加入。
 *   - 我们绝不在前端编造一张"整卷"进入 basket。
 *
 * Bucket key:
 *   `${paperName}__${year}__${region}` —— 三段组合保证稳定。
 *   再加 `${source}__${sourceType}` 作为辅助签名，防止同名同年同地区但来源不同
 *   的卷被误合并。
 *   任一关键字段缺失或异常 → 进入显式 "其他来源" 桶。
 */

import type { QuestionGroupCard, SourceType } from '../domain/questionBank.ts'
import type { ConciergeSearchHit } from './conciergeSearch.ts'
import { cleanReason } from './reason.ts'

const FALLBACK_KEY = 'paper:_其他来源_'

export type PaperResultGroup = {
  group: QuestionGroupCard
  reason: string
}

/**
 * Cut 6 — paper-level hit context.
 *
 * The current concierge search emits `ConciergeSearchHit` rows whose minimal
 * unit is still a `QuestionGroup`. The teacher-facing question
 * "this row matched the source paper as a whole vs. it matched specific
 * passages inside the paper" is therefore a presentation-layer concern, not
 * a search-API concern. `PaperHitContext` is a typed lens over the same
 * hits the aggregator already collected, so the row UI can decide:
 *
 *   - what badge wording to use (e.g. "命中 N 个篇章" vs "试卷匹配 · …")
 *   - which inner group to scroll to first when the row is expanded
 *   - which inner groups to highlight as "this is what the search hit"
 *
 * V1 constraint: search hits are always passage-scoped, so every aggregated
 * paper currently produces `scope: 'passage'`. The 'paper' and 'mixed'
 * branches are reserved by type so future search-side changes (e.g. an
 * intent classifier that recognises "this query is asking for a whole
 * paper") can populate them without re-shaping `PaperResult`.
 *
 * We deliberately do NOT inspect the reason text to decide scope — the
 * search hit object is the only source of truth for "what matched".
 */
export type PaperHitScope = 'passage' | 'paper' | 'mixed'

export type PaperPassageHit = {
  groupId: string
  reason: string
}

export type PaperHitContext = {
  /** What kind of search hit produced this row. V1 is always 'passage'. */
  scope: PaperHitScope
  /** Stable list of every group-id inside this paper that the search hit. */
  hitGroupIds: string[]
  /**
   * The group the row UI should scroll into view first on expand. Equals
   * the first hit group's id; null when the bucket somehow has no groups
   * (the aggregator never produces such buckets in practice but we keep
   * the type total).
   */
  primaryGroupId: string | null
  /**
   * Per-passage hit detail, in original hit order. Mirrors `groups` but
   * keeps just the (id, reason) pair so the row UI doesn't reach into
   * the full `QuestionGroupCard` shape just to decide what to render.
   */
  passageHits: PaperPassageHit[]
  /**
   * The reason string the row should display in the badge area. V1 keeps
   * this aligned with `representativeReason` for forward-compat — the
   * row UI may switch to `displayReason` in a future pass without
   * needing a domain-level change.
   */
  displayReason: string
}

export type PaperResult = {
  /** Stable id used for expandedPaperKey & React key. */
  key: string
  /** "2025 浙江一模" / "26.3 广东深圳高三一模英语试卷" — for the row title. */
  paperName: string
  year: number | null
  region: string
  source: string
  sourceType: SourceType | null
  /** Cardinality of `groups`. Kept for back-compat — verify scripts read this. */
  hitCount: number
  /** Distinct groupTypes inside this paper (used for the small chip strip). */
  groupTypes: string[]
  /** Sanitized reason — taken from the highest-ranked hit in this paper. */
  representativeReason: string
  /** All matching groups inside this paper, in original hit order. */
  groups: PaperResultGroup[]
  /** True when key fields were missing → bucketed into "其他来源". */
  isFallback: boolean
  /**
   * Cut 6 — paper-level hit context. Additive: existing consumers that read
   * `representativeReason` / `hitCount` / `groups` keep working unchanged.
   * Cut 6 row UI consumes `hitContext` to choose badge wording, decide
   * highlight, and decide which inner group to scroll to.
   */
  hitContext: PaperHitContext
}

function trim(value: unknown): string {
  return String(value ?? '').trim()
}

/**
 * Normalize the auxiliary source signature so a "扫描版", an extra space, or
 * different punctuation in `source` doesn't split the same paper into two
 * rows. Main key still uses paperName + year + region; this only touches the
 * suffix that prevents same-name/year/region but truly different upstream
 * provenance from merging.
 */
function normalizeSourceSignature(value: unknown): string {
  let text = String(value ?? '')
  // Drop common provenance-noise tokens that appear inconsistently.
  text = text.replace(/扫描版|高清版|word\s*版|pdf\s*版|教师版|学生版|完整版|整理版/gi, ' ')
  // Passage-level labels should not split one source paper into separate
  // buckets. "2024 九省联考 阅读 C" and "2024 九省联考 阅读 D" are the same
  // paper row with different matched groups inside it.
  text = text.replace(/阅读(?:理解)?\s*[A-G]/gi, ' ')
  text = text.replace(/reading\s*[A-G]/gi, ' ')
  // Collapse all whitespace (incl. CJK full-width space) to nothing.
  text = text.replace(/[\s\u3000]+/g, '')
  // Drop common punctuation that shows up only in some copies.
  text = text.replace(/[，,。．\.()（）【】《》\[\]"'`~!@#$%^&*+=|\\:;<>?/-]+/g, '')
  return text.toLowerCase()
}

function buildKey(group: QuestionGroupCard): { key: string; isFallback: boolean } {
  const paperName = trim(group.paperName)
  const region = trim(group.region)
  const yearOk = Number.isFinite(group.year) && group.year > 0
  const regionOk = region.length > 0 && region !== '未标地区' && region !== '未标'
  if (!paperName || !yearOk || !regionOk) {
    return { key: FALLBACK_KEY, isFallback: true }
  }
  // Auxiliary signature — normalized so cosmetic differences in `source`
  // (extra spaces, "扫描版", punctuation) don't fragment the bucket.
  const sigSource = normalizeSourceSignature(group.source) || '∅'
  const sigType = trim(group.sourceType) || '∅'
  return {
    key: `paper:${paperName}__${group.year}__${region}__${sigSource}__${sigType}`,
    isFallback: false,
  }
}

export function aggregatePaperResults(hits: ConciergeSearchHit[]): PaperResult[] {
  const buckets = new Map<string, PaperResult>()
  for (const hit of hits) {
    const { group, reason } = hit
    const { key, isFallback } = buildKey(group)
    let bucket = buckets.get(key)
    if (!bucket) {
      bucket = {
        key,
        paperName: isFallback ? '其他来源' : trim(group.paperName),
        year: isFallback ? null : (Number.isFinite(group.year) ? group.year : null),
        region: isFallback ? '' : trim(group.region),
        source: isFallback ? '' : trim(group.source),
        sourceType: isFallback ? null : (group.sourceType || null),
        hitCount: 0,
        groupTypes: [],
        representativeReason: cleanReason(reason),
        groups: [],
        isFallback,
        // Initialise the hit context with the same first-hit reason the
        // representativeReason picks. We populate the rest of the fields
        // (hitGroupIds / primaryGroupId / passageHits) once we know the
        // full list of hits in this bucket — see the post-loop pass below.
        hitContext: {
          scope: 'passage',
          hitGroupIds: [],
          primaryGroupId: null,
          passageHits: [],
          displayReason: cleanReason(reason),
        },
      }
      buckets.set(key, bucket)
    }
    bucket.hitCount += 1
    if (!bucket.groupTypes.includes(group.groupType)) {
      bucket.groupTypes.push(group.groupType)
    }
    const cleanedReason = cleanReason(reason)
    bucket.groups.push({ group, reason: cleanedReason })
    bucket.hitContext.hitGroupIds.push(group.id)
    bucket.hitContext.passageHits.push({
      groupId: group.id,
      reason: cleanedReason,
    })
  }
  // Finalise primaryGroupId now that every bucket has its full hit list.
  // V1 keeps scope === 'passage' for every bucket — the search API is the
  // only place that could legitimately upgrade this to 'paper' or 'mixed',
  // and the search API does not yet emit paper-scoped hits.
  for (const bucket of buckets.values()) {
    bucket.hitContext.primaryGroupId =
      bucket.hitContext.hitGroupIds[0] ?? null
  }
  // Order: preserve first-hit order across paper rows; fallback bucket sinks to bottom.
  const ordered: PaperResult[] = []
  const seen = new Set<string>()
  for (const hit of hits) {
    const { key } = buildKey(hit.group)
    if (seen.has(key)) continue
    seen.add(key)
    const bucket = buckets.get(key)
    if (bucket) ordered.push(bucket)
  }
  ordered.sort((a, b) => {
    if (a.isFallback === b.isFallback) return 0
    return a.isFallback ? 1 : -1
  })
  return ordered
}
