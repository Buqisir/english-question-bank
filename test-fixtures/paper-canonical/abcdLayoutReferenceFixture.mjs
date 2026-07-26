/**
 * Redacted diagnostic proxies for the accepted NEEA visual reference.
 *
 * The reference option wording is deliberately not copied. Neutral glyph runs
 * are shaped by the production public seam and must stay within one point of
 * the retained Canvas advances recorded in the accepted prototype notes.
 */
export const abcdLayoutReferenceFixture = Object.freeze({
  sourceImages: Object.freeze([
    Object.freeze({
      path: 'docs/product/exam-paper-format-reference/images/page-04-reading-a-b.jpeg',
      sha256: 'sha256:79378d6d9e9664282687d0d36226d10b0462f1b55a51fa2dfd93512756222d8a',
    }),
    Object.freeze({
      path: 'docs/product/exam-paper-format-reference/images/page-09-cloze.jpeg',
      sha256: 'sha256:6e4297ba33b34c150657ae7116b08dfd115e3a284579467bf7bc612ccf10b23c',
    }),
  ]),
  cases: Object.freeze([
    Object.freeze({
      questionId: 'gold-page-04-q21',
      expectedMode: 'four_columns',
      expectedAdvanceTwip: Object.freeze([1257, 1459, 1366, 1062]),
      redactedText: Object.freeze([
        'mmmmiiiiii',
        'mmmmmmiiii',
        'mmmmiiiiiiii',
        'miiiiiiiiiii',
      ]),
    }),
    Object.freeze({
      questionId: 'gold-page-04-q22',
      expectedMode: 'one_column',
      expectedAdvanceTwip: Object.freeze([2721, 2760, 3869, 4377]),
      redactedText: Object.freeze([
        'mmmmmmmmmiiiiiiiiiiiiiiiii',
        'mmmmmmmmmmiiiiiiiiiiiiiii',
        'mmmmmmmmmmmmmmmmmmmiiiiiiiii',
        'mmmmmmmmmmmmmmmmmmmmmmiiiiiiiii',
      ]),
    }),
    Object.freeze({
      questionId: 'gold-page-04-q23',
      expectedMode: 'two_by_two',
      expectedAdvanceTwip: Object.freeze([2077, 2217, 2001, 2473]),
      redactedText: Object.freeze([
        'mmmmmmmmmiiiiii',
        'mmmmmmiiiiiiiiiiiiiiiii',
        'mmmmmiiiiiiiiiiiiiiii',
        'mmmmmmmmmmiiiiiiiiii',
      ]),
    }),
  ]),
})
