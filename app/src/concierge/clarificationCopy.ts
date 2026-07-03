/**
 * Decide what clarification text to show on the desk.
 *
 * Strategy:
 *   - If the backend supplied a specific, natural-sounding clarificationQuestion,
 *     prefer it (we don't want to lose the model's intent-aware nudge).
 *   - If the backend's question contains mechanical / form-validator phrases,
 *     fall back to a calm front-end template that just asks for one more
 *     direction (主题、题型、难度，或考法).
 *
 * Pure function, exported for unit verification.
 */

const MECHANICAL_PHRASES = [
  '学生做题思路像',
  '文章讲的内容像',
  '刚才的搜索',
  '补一句就会重新搜',
  '再确认一下',
]

export function pickClarificationLine(
  pendingQuery: string,
  backendQuestion: string | null | undefined,
): string {
  const q = (backendQuestion || '').trim()
  const isMechanical = q.length === 0 || MECHANICAL_PHRASES.some((phrase) => q.includes(phrase))
  if (!isMechanical) {
    return q
  }
  return `我理解你想找「${pendingQuery}」。再补一个方向就行：主题、题型、难度，或考法。`
}

/**
 * Restart cut ⑤ — honest-degrade notice for the fallback result banner.
 *
 * The local keyword fallback (`conciergeSearch.ts`) now tags every hit
 * `weak: true` when it only cleared the noise floor, not the confidence
 * floor (no real topicLabel / 篇位 / 题型 / 地区 signal — only scattered
 * general-field substring hits). When EVERY hit in a non-empty result set is
 * weak, the notice must say so plainly instead of reusing the ordinary
 * fallback message ("已按本地题库精确信息匹配。" / "没填 AI 密钥，先用本地
 * 题库帮你找。" etc.) — those imply a confident match this result set does
 * not actually have. A fully empty result set is handled separately by the
 * desk's existing vacuum-state branch (not this function).
 */
export function pickResultsNoticeLine(allWeak: boolean, assistantMessage: string): string {
  if (allWeak) {
    return '没有精确匹配，以下是主题相近的题组。'
  }
  return assistantMessage
}
