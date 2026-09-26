const chineseGloss = '[\\u3400-\\u9fff]+'
const englishToken = "[A-Za-z]+(?:[’'-][A-Za-z]+)*"

/**
 * Registered semantic-preserving cleanup for visible English exam text.
 *
 * The rule is deliberately narrow: it only touches Chinese gloss parentheses,
 * punctuation spacing immediately after such a gloss, and ASCII apostrophes
 * between English letters. Other punctuation remains byte-for-byte unchanged.
 */
export function canonicalizeVisibleEnglishTypography(value, ruleVersion = '2') {
  if (typeof value !== 'string') return value
  if (ruleVersion === '3') {
    return value.replace(
      new RegExp(`(?<![\\p{L}\\p{N}_])(${englishToken})[ \\t]*(?:（([^()（）\\r\\n]*)）|\\(([^()（）\\r\\n]*)\\))[ \\t]*`, 'gu'),
      (match, word, fullWidth, halfWidth, offset, text) => {
        const inside = fullWidth ?? halfWidth
        if (!/\p{Script=Han}/u.test(inside)
          || !/^[\p{Script=Han} \t…，、；：。！？—·“”‘’「」《》〈〉.,;:!?-]+$/u.test(inside)) return match
        const gloss = inside.replace(/^[ \t]+|[ \t]+$/g, '')
        const next = text[offset + match.length] ?? ''
        const suffix = /[A-Za-z0-9]/.test(next) ? ' '
          : next === '' || /[.,;:!?]/.test(next) ? ''
            : match.match(/[ \t]*$/)[0]
        return `${word} (${gloss})${suffix}`
      },
    ).replace(/(?<=[A-Za-z])'(?=[A-Za-z])/gu, '\u2019')
  }
  if (ruleVersion !== '2') throw new Error(`Unsupported visible typography producer: ${ruleVersion}`)
  return value
    .replace(
      new RegExp(`(${englishToken})\\s*（(${chineseGloss})）`, 'gu'),
      '$1 ($2)',
    )
    .replace(
      new RegExp(
        `(${englishToken}\\s*\\(${chineseGloss}\\))\\s+([.,;:!?])`,
        'gu',
      ),
      '$1$2',
    )
    .replace(/(?<=[A-Za-z])'(?=[A-Za-z])/gu, '\u2019')
}
