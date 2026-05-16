/**
 * Aggregate ConciergeSearchHit[] into source-paper rows for the V1.1 IA.
 *
 * One row in the desk's result list now represents an upstream "原卷 / 来源卷"
 * (e.g. "2026 浙江一模"), not a single passage. Each row carries the question
 * groups (篇章) inside that source paper that matched the user's search.
 *
 * 重要事实:
 *   - QuestionGroup 仍然是最小加入单位。本聚合只改“展示分桶”。
 *   - 草稿卷 (App.basket) 仍然按 group.id 加入。
 *   - 我们绝不在前端编造一张“整卷”进入 basket。
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

export type PaperResult = {
  /** Stable id used for expandedPaperKey & React key. */
  key: string
  /** "2025 浙江一模" / "26.3 广东深圳高三一模英语试卷" — for the row title. */
  paperName: string
  year: number | null
  region: string
  source: string
  sourceType: SourceType | null
  /** "命中 N 组" */
  hitCount: number
  /** Distinct groupTypes inside this paper (used for the small chip strip). */
  groupTypes: string[]
  /** Sanitized reason — taken from the highest-ranked hit in this paper. */
  representativeReason: string
  /** All matching groups inside this paper, in original hit order. */
  groups: PaperResultGroup[]
  /** True when key fields were missing → bucketed into "其他来源". */
  isFallback: boolean
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
      }
      buckets.set(key, bucket)
    }
    bucket.hitCount += 1
    if (!bucket.groupTypes.includes(group.groupType)) {
      bucket.groupTypes.push(group.groupType)
    }
    bucket.groups.push({ group, reason: cleanReason(reason) })
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
