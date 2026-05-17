/**
 * Paper Intelligence evidence adapter — public entry point.
 *
 * This barrel exists so consumers can `import { toEvidenceModel,
 * selectEvidence, EvidenceItem } from '.../evidence'` without poking at
 * the internal file split.
 *
 * The adapter is intentionally pure: no React / DOM / network / DB.
 * See the verify script `scripts/verify-paper-intelligence-evidence-
 * audit.mjs` for the static rules that enforce these constraints.
 */

export {
  toEvidenceModel,
  selectEvidence,
  buildSupportEvidenceId,
  buildTrapEvidenceId,
} from './paperIntelligenceEvidence.ts'

export type {
  AdapterOptions,
  EvidenceItem,
  EvidenceKind,
  EvidenceModel,
  EvidenceSelector,
  PassageBodyMap,
  PassageEvidenceView,
  QuestionEvidenceView,
  ToEvidenceModelFn,
  SelectEvidenceFn,
} from './paperIntelligenceEvidenceTypes.ts'
