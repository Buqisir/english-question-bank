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
