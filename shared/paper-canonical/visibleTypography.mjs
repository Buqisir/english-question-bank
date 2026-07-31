const chineseGloss = '[\\u3400-\\u9fff]+'
const englishToken = "[A-Za-z]+(?:[’'-][A-Za-z]+)*"

/**
 * Registered semantic-preserving cleanup for visible English exam text.
 *
 * The rule is deliberately narrow: it only touches Chinese gloss parentheses,
 * punctuation spacing immediately after such a gloss, and ASCII apostrophes
 * between English letters. Other punctuation remains byte-for-byte unchanged.
 */
export function canonicalizeVisibleEnglishTypography(value) {
  if (typeof value !== 'string') return value
  return value
    .replace(
      new RegExp(`(${englishToken})\\s*（(${chineseGloss})）`, 'gu'),
      '$1 ($2)',
    )
    .replace(
      new RegExp(
        `(${englishToken}\\s+\\(${chineseGloss}\\))\\s+([.,;:!?])`,
        'gu',
      ),
      '$1$2',
    )
    .replace(/([A-Za-z])'([A-Za-z])/gu, '$1’$2')
}
