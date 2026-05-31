/**
 * normalizePassageText.mjs
 *
 * Pure, dependency-free, idempotent normalization of English-content passage text.
 * Applied at parse time (docxSplitter.mjs assembled paragraph/stem/option build sites),
 * upstream of AI analysis, so stored passage and AI evidence quotes share the same bytes.
 *
 * Implements 5 deterministic, meaning-safe rules (slices 2a + 2b):
 *
 * Rule 1 — Half-width punctuation in English context.
 *   Full-width ，。？！；：（） etc. → English half-width equivalents, ONLY when the
 *   preceding character is an ASCII letter or digit AND the following character is NOT a
 *   CJK character. Mixed seam (English-preceding + CJK-following): does NOT convert —
 *   the CJK-following guard wins. Deterministic; locked by verifier.
 *
 * Rule 2 — One space after English punctuation before a letter.
 *   [.,;:!?] directly followed by an ASCII letter → insert one space.
 *   MUST NOT widen to digits (must not touch `56`).
 *
 * Rule 3 — CJK-gloss parenthesis spacing.
 *   A parenthesis pair whose interior contains at least one CJK character gets
 *   half-width parens + one space before the opening paren (if not already spaced)
 *   and one space after the closing paren (if not already spaced).
 *   Scoped to CJK-interior parens ONLY — never touches (wear), (56), or pure ASCII/digit content.
 *
 * Rule 5 — Em dash (slice 2b, appended after Rule 2).
 *   Three or more ASCII hyphens `-{3,}` → single em dash — (U+2014).
 *   A run of 2+ em dashes / horizontal bars [—―]{2,} → single — (U+2014).
 *   Single hyphen `-`, two hyphens `--`, and a lone already-correct — are never touched.
 *
 * Rule 4 — Curly quotes (slice 2b, appended after Rule 5 so Rule 4 sees normalized —).
 *   4a — Straight double quote " (U+0022) → directional curly:
 *     OPENING " (U+201C) when at string start or immediately preceded by whitespace,
 *     `(`, `[`, `{`, — (U+2014), – (U+2013), or another opening quote " / '.
 *     CLOSING " (U+201D) otherwise (including when preceded by sentence punctuation ,.;:!?).
 *     MF-1: a " preceded by ,.;:!? is CLOSING (dominant pattern: "Hello," she said.).
 *     The inverse `said,"Hello"` is 0-corpus sloppy input; accepted cosmetic wrong-facing quote.
 *   4b — Straight single quote ' (U+0027) → conservative:
 *     If immediately preceded by an ASCII letter [A-Za-z] → ' (U+2019).
 *     Otherwise leave the straight ' unchanged (ambiguity — human review per standard).
 *
 * No space-collapsing rule (C2 — must not disturb I10 blank markers).
 */

/**
 * @param {string} text
 * @returns {string}
 */
export function normalizePassageText(text) {
  if (!text) return String(text || '')
  let s = String(text)

  // ---- Rule 1 ----
  // Full-width punctuation → half-width, only when preceded by ASCII letter/digit
  // and NOT followed by a CJK character (or optional whitespace then CJK).
  // The negative lookahead `(?!\s*CJK)` ensures mixed seams (English-left, CJK-right)
  // are NOT converted — the CJK-following guard wins deterministically.
  s = s.replace(
    /(?<=[A-Za-z0-9])[，。？！；：（）「」『』【】《》〈〉](?!\s*[一-鿿㐀-䶿豈-﫿])/g,
    (ch) => {
      switch (ch) {
        case '，': return ','
        case '。': return '.'
        case '？': return '?'
        case '！': return '!'
        case '；': return ';'
        case '：': return ':'
        case '（': return '('
        case '）': return ')'
        case '「': return '"'
        case '」': return '"'
        case '『': return "'"
        case '』': return "'"
        case '【': return '['
        case '】': return ']'
        case '《': return '<'
        case '》': return '>'
        case '〈': return '<'
        case '〉': return '>'
        default: return ch
      }
    }
  )

  // ---- Rule 3 ----
  // CJK-interior paren pairs → half-width parens + surrounding spaces.
  // Run before Rule 2 so any rule-1-converted parens are already ASCII here.
  //
  // Step 3a: normalize full-width （ and ） to ASCII parens when interior is CJK.
  // (Rule 1 may have already done this if preceded by ASCII; this catches remaining cases.)
  s = s.replace(
    /（([^（）]*[一-鿿㐀-䶿豈-﫿][^（）]*)）/g,
    '($1)'
  )

  // Step 3b: add space before `(CJK...)` if not already preceded by whitespace.
  s = s.replace(
    /(?<!\s)\(([^)]*[一-鿿㐀-䶿豈-﫿][^)]*)\)/g,
    ' ($1)'
  )

  // Step 3c: add space after `(CJK...)` if not already followed by whitespace.
  s = s.replace(
    /\(([^)]*[一-鿿㐀-䶿豈-﫿][^)]*)\)(?!\s)/g,
    '($1) '
  )

  // ---- Rule 2 ----
  // One space after English punctuation before a letter (not digit — must not touch `56`).
  s = s.replace(/([.,;:!?])([A-Za-z])/g, '$1 $2')

  // ---- Rule 5 ----
  // Three or more ASCII hyphens → single em dash (U+2014).
  s = s.replace(/-{3,}/g, '—')
  // A run of 2+ em dashes / horizontal bars → single em dash (U+2014).
  s = s.replace(/[—―]{2,}/g, '—')

  // ---- Rule 4 ----
  // 4a — Straight double quote (U+0022) → directional curly.
  // Opening positions: start-of-string OR preceded by whitespace / ( [ { — – " '.
  // Convert opening first, then convert all remaining straight " to closing.
  s = s.replace(/(^|[\s(\[{—–“‘])"(?=[^])/g, '$1“')
  // All remaining straight " → closing " (U+201D).
  s = s.replace(/"/g, '”')

  // 4b — Straight single quote (U+0027) preceded by ASCII letter → ' (U+2019).
  // Conservative gate: only letter-preceded. Standalone ' left unchanged.
  s = s.replace(/(?<=[A-Za-z])'/g, '’')

  return s
}
