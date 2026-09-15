/** 今天翻到 — one passage fixed per calendar day. Pure; no React. */
import type { QuestionGroupCard } from '../domain/questionBank.ts'
import { compactSummary } from './passageText.ts'

/** Stable per calendar day, so the desk looks the same all day and changes overnight. */
function dayIndex(dayKey: string, size: number): number {
  let hash = 0
  for (const char of dayKey) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return size > 0 ? hash % size : 0
}

export function pickDailyPassage(groups: QuestionGroupCard[], today = new Date()): QuestionGroupCard | null {
  // Only passages with a real one-line summary read well here; cloze/grammar
  // rows whose summary is just the group name are skipped.
  const candidates = groups
    .filter((group) => compactSummary(group).length >= 12)
    .sort((a, b) => a.id.localeCompare(b.id))
  if (candidates.length === 0) return null
  const dayKey = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`
  return candidates[dayIndex(dayKey, candidates.length)]
}
