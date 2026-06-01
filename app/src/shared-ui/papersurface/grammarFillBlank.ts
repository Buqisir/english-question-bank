/**
 * I15 — grammar-fill in-passage blank recognition (pure, no JSX/DOM).
 *
 * Isolated from PaperSurface's `paperBlankPattern` (cloze `__41__` /
 * 七选五 `_____36_____` are untouched). Lives in its own `.ts` module so
 * the verifier can import + test the REAL shipped pattern (a `.tsx` cannot
 * be imported by the node-based verifier).
 *
 * Format: `NN.` + `_{2,}` (+ optional `(hint)`), e.g. `56._____`,
 * `57._____(absorb)`. The DOT is REQUIRED — it is the feature that
 * distinguishes a grammar-fill blank (`56._____`, number-then-dot) from a
 * cloze (`__41__`) / 七选五 (`_____36_____`) marker (underscores WRAP the
 * number, no dot). The real splitter/stored format always emits `NN.`
 * (verified on the QA asset); a dot-less blank falls back to the defensive
 * non-interactive render. The number BEFORE the dot+underscores is captured,
 * so `Increase intake 64._____ 3-5g` yields `64`, never the trailing `3`;
 * numeric noise (`2026`, `800g`, `3-5g`, `25-30g`) never matches.
 */
export const grammarFillBlankPattern = /(\d{1,3})\._{2,}(?:\([^)]*\))?/g

/**
 * Return the captured blank numbers of every grammar-fill blank in `text`,
 * in document order, using the shared `grammarFillBlankPattern`.
 */
export function findGrammarFillBlankNumbers(text: string): string[] {
  grammarFillBlankPattern.lastIndex = 0
  const out: string[] = []
  let match: RegExpExecArray | null
  while ((match = grammarFillBlankPattern.exec(text)) !== null) {
    out.push(match[1])
  }
  return out
}
