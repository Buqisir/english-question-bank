import type { SentenceAnalysisV1, ValidationError } from './types.d.mts'

export function validateSentenceAnalysis(value: unknown):
  | { ok: true; value: SentenceAnalysisV1 }
  | { ok: false; errors: ValidationError[] }
