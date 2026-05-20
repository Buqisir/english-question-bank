/**
 * Paper Intelligence → PaperSurface adapter — public entry point.
 *
 * Issue #21-C1, C5a.
 *
 * This barrel exports the three adapter functions and a convenience
 * `buildPaperSurfaceDataFromPi` that composes them into the full
 * PaperSurfaceProps shape (minus controlled state which the harness owns).
 *
 * All exports are pure functions: no React, no hooks, no DOM, no fetch,
 * no localStorage, no router reads, no side effects.
 */

export { piToPaperTextMap, piToPaperTextMapLegacy } from './piToPaperTextMap.ts'
export type { PiTextMapInput, PiTextMapLegacyInput } from './piToPaperTextMap.ts'

export { piToPaperQuestions } from './piToPaperQuestions.ts'
export type { PiQuestionsInput } from './piToPaperQuestions.ts'

export { piToPaperEvidence } from './piToPaperEvidence.ts'
export type { PiEvidenceInput } from './piToPaperEvidence.ts'

import { piToPaperTextMap } from './piToPaperTextMap.ts'
import { piToPaperQuestions } from './piToPaperQuestions.ts'
import { piToPaperEvidence } from './piToPaperEvidence.ts'
import type { PaperTextMap, PaperQuestion, PaperEvidence } from '../../../../../shared/papersurface/types'
import type { PaperIntelligenceReport, QuestionOption, PassageStructure } from '../paperIntelligenceTypes'

export type BuildPaperSurfaceDataInput = {
  report: PaperIntelligenceReport
  bodies: Record<string, string>
  inputOptions?: Record<string, QuestionOption[]>
  /**
   * C5a: Confirmed paragraph structure per section.
   * REQUIRED for the official surface=paper path.
   */
  passageStructures: Record<string, PassageStructure>
}

export type PaperSurfaceData = {
  textMap: PaperTextMap
  questions: PaperQuestion[]
  evidence: PaperEvidence[]
}

/**
 * Convenience: compose all three adapters into the data props
 * PaperSurface needs. The controlled-component state props
 * (mode, lectureFocus, readingFocusBySection, onFocusIntent)
 * are NOT included — those are owned by the harness.
 *
 * C5a: requires passageStructures. Throws if any passage is missing
 * its confirmed structure.
 */
export function buildPaperSurfaceDataFromPi(input: BuildPaperSurfaceDataInput): PaperSurfaceData {
  const { report, bodies, inputOptions, passageStructures } = input

  const textMap = piToPaperTextMap({ report, bodies, passageStructures })
  const questions = piToPaperQuestions({ report, inputOptions })
  const evidence = piToPaperEvidence({ report, bodies, textMap })

  return { textMap, questions, evidence }
}
