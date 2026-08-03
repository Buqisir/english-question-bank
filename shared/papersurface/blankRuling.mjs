/**
 * Presentation-only ruling for semantic paper blanks.
 *
 * This module deliberately contains no marker parsing. Canonical consumers
 * select a ruling from the already-known group type.
 */
const shortBlankRuling = Object.freeze({
  width: '3.3em',
  numberSuffix: '',
  numberAlignment: 'center',
  lineStyle: 'single-thin',
  screenLineWidthPx: 1,
  printLineWidthPt: 0.5,
  // Ticket 35: all inline blank families share this vertical number-to-rule
  // relationship. Width remains family-specific below.
  ruleVerticalAlignment: 'blank-bottom',
  whiteSpace: 'nowrap',
  hintPlacement: 'immediately-after',
})

export const paperBlankRuling = Object.freeze({
  cloze: shortBlankRuling,
  grammarFill: shortBlankRuling,
  sevenChoices: Object.freeze({
    ...shortBlankRuling,
    width: '4.6em',
  }),
})
