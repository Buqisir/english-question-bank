/**
 * Pure helpers extracted from the manual EntryModal so the question-number
 * assignment logic is unit-testable through a public seam (this module) rather
 * than only through a React render harness (the repo has no jsdom harness;
 * `.tsx` verify convention is source-regex + behavioral pure-helper import).
 *
 * Extracted for the H12-A EntryModal `addEntryQuestion` duplicate-`questionNo`
 * fix: after a *non-last* sub-question is removed (which intentionally does
 * NOT renumber, leaving a gap), `length + 1` collides with the surviving last
 * question's number. `nextQuestionNumber` uses `max(existing questionNo) + 1`
 * so the prefilled `题号` can never duplicate an existing entry.
 */

/**
 * Returns the next sub-question number for a manually-edited group, computed
 * as one greater than the maximum existing `questionNo` (parsed as a base-10
 * integer). Returns `'1'` for an empty list. Non-integer `questionNo` values
 * (e.g. an owner hand-typing a label) contribute `0` to the max so they can
 * never silently lower the next number.
 */
export function nextQuestionNumber(questions: ReadonlyArray<{ questionNo: string }>): string {
  const maxNo = questions.reduce<number>(
    (max, question) => Math.max(max, parseInt(question.questionNo, 10) || 0),
    0,
  )
  return String(maxNo + 1)
}
