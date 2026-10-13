const mode = import.meta.env.VITE_EQB_SENTENCE_ANALYSIS

// Production builds receive no VITE_* variables, so the feature defaults on;
// the server-side QUESTION_BANK_SENTENCE_ANALYSIS_ENABLED switch is the runtime kill switch.
export const SENTENCE_ANALYSIS_ENABLED = mode !== 'off'

export const SENTENCE_ANALYSIS_MODE: 'fixture' | 'api' = mode === 'fixture' ? 'fixture' : 'api'
