import { resolveCanonicalAuthority } from '../paper-canonical/authority.mjs'
import { grammarFillRhythmForPaperAuthority } from '../paper-canonical/grammarFillRhythm.mjs'
import { digestJson } from '../paper-canonical/stable.mjs'

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

export function grammarFillBlankRulingForRhythm(rhythm) {
  const geometry = rhythm?.ruleVerticalGeometry
  if (rhythm?.schemaVersion === 'grammar-fill-rhythm-v5') {
    return shortBlankRuling
  }
  if (geometry?.verticalAlignment !== 'blank-bottom') {
    throw new Error('Grammar Fill blank ruling requires a bound bottom-rule authority')
  }
  return Object.freeze({
    ...shortBlankRuling,
    screenLineWidthPx: geometry.screenRuleThicknessPx,
    printLineWidthPt: geometry.printPdfRuleThicknessPt,
  })
}

/**
 * The Screen projection is derived only from the exact authority already
 * carried by a verified Consumption Plan.  Keeping the manifest lookup and
 * its bound renderer artifact together prevents a caller-supplied v5 default
 * or a CSS-only token from silently replacing a scoped successor ruling.
 */
export function grammarFillScreenRulingForCanonicalConsumption({
  paperId,
  authorityRef,
}) {
  const authority = resolveCanonicalAuthority(authorityRef)
  if (!authority.ok) {
    throw new Error('Grammar Fill Screen ruling authority is unavailable')
  }
  const rhythm = grammarFillRhythmForPaperAuthority({
    paperId,
    manifestVersion: authority.closure.authorityRef.manifestVersion,
  })
  const boundRhythm = authority.closure.artifacts['renderer-grammar-fill-rhythm']
  if (!boundRhythm || digestJson(boundRhythm) !== digestJson(rhythm)) {
    throw new Error('Grammar Fill Screen ruling disagrees with the bound renderer authority')
  }
  // Only the v44/v7 successor owns the new Screen projection. Historical
  // bound rhythms retain their immutable static PaperSurface semantics after
  // the exact artifact check above.
  if (rhythm.schemaVersion !== 'grammar-fill-rhythm-v7') return null
  const ruling = grammarFillBlankRulingForRhythm(rhythm)
  if (ruling.ruleVerticalAlignment !== 'blank-bottom') {
    throw new Error('Grammar Fill Screen ruling requires the shared bottom-rule relation')
  }
  return Object.freeze({
    rhythmSchemaVersion: rhythm.schemaVersion,
    blankWidth: `${rhythm.blankGeometry.widthEm}em`,
    screenRuleWidth: `${ruling.screenLineWidthPx}px`,
    ruleAlignItems: 'flex-end',
    baselineStep: `${rhythm.targets.screen.baselineStepPx}px`,
    promptGap: `${rhythm.promptGeometry.gapEm}em`,
  })
}

export const paperBlankRuling = Object.freeze({
  cloze: shortBlankRuling,
  sevenChoices: Object.freeze({
    ...shortBlankRuling,
    width: '4.6em',
  }),
})
