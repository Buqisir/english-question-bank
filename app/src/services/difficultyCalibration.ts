/**
 * Calibrated Difficulty Preview — read-only runtime projection.
 *
 * This module implements the soft-calibrator V1.1 rules from the
 * difficulty-calibration-experiment-v1 report. It does NOT modify
 * the database, teacherDifficulty, or raw AI scores.
 *
 * Input: structured fields already available from ReadingParseQuestionGroupResult
 * Output: a CalibrationPreview object for display only.
 */

export type CalibrationReasonCode =
  | 'strict_low_score_gate'
  | 't2_hidden_blocker_audit'
  | 'answer_path_vocab'
  | 'topic_pressure'
  | 'location_instability'
  | 'strong_distractor'
  | 'abstract_mapping'
  | 'syntax_load'
  | 'word_meaning_context_load'
  | 'high_ceiling_watch'
  | 't10_possible_overestimate'

export type CalibrationPreview = {
  rawScore: number
  calibratedScore: number
  reasons: CalibrationReasonCode[]
  watchFlags: WatchFlag[]
  displayLabel: string
}

export type WatchFlag = {
  code: 'high_ceiling_watch' | 't10_possible_overestimate'
  label: string
}

export type CalibrationInput = {
  /** AI difficulty score on 1-10 scale */
  aiDifficultyScore?: number | null
  /** Already-mapped 1-5 score if available */
  deepseekMappedDifficulty?: number | null
  /** Surface question type from reading parse */
  surfaceType?: string | null
  /** Answering move from reading parse */
  answeringMove?: string | null
  /** T-card ID from synonym difficulty classification */
  tCardId?: string | null
  /** Main blockers array from difficulty profile */
  mainBlockers?: string[] | null
  /** Question stem text */
  stem?: string | null
}

// --- Internal helpers ---

function clampScore(value: number): number {
  return Math.max(1, Math.min(5, value))
}

function getRawScore(input: CalibrationInput): number {
  const mapped = Number(input.deepseekMappedDifficulty)
  if (Number.isInteger(mapped) && mapped >= 1 && mapped <= 5) return mapped

  const raw10 = Number(input.aiDifficultyScore)
  if (Number.isFinite(raw10) && raw10 >= 1 && raw10 <= 10) return clampScore(Math.ceil(raw10 / 2))

  return 3
}

function hasBlocker(blockers: string[], blocker: string): boolean {
  return blockers.includes(blocker)
}

function hasStrongBlocker(blockers: string[]): boolean {
  return blockers.some((b) => ['vocab', 'syntax', 'distractor', 'topic', 'info_span'].includes(b))
}

function isAbstractSurface(surfaceType?: string | null): boolean {
  return [
    'adjective_summary',
    'abstract_phrase_summary',
    'passage_main_idea',
    'paragraph_main_idea',
    'writing_technique',
    'author_purpose',
    'example_function',
    'inference_general',
  ].includes(surfaceType || '')
}

function isAbstractCard(tCardId?: string | null): boolean {
  return ['T5', 'T6', 'T7', 'T8', 'T9', 'T10'].includes(tCardId || '')
}

function isAbstractMappingBanned(surfaceType?: string | null, tCardId?: string | null): boolean {
  return (
    ['attitude_tone', 'adjective_summary', 'abstract_phrase_summary'].includes(surfaceType || '') &&
    ['T9', 'T10'].includes(tCardId || '')
  )
}

function isWordMeaningContextLoad(input: CalibrationInput): boolean {
  const { surfaceType, tCardId, stem, mainBlockers } = input
  if (surfaceType !== 'word_meaning' && tCardId !== 'T3') return false
  const blockers = mainBlockers || []
  const stemLower = (stem || '').toLowerCase()
  return (
    /refer to/.test(stemLower) ||
    hasBlocker(blockers, 'syntax') ||
    hasBlocker(blockers, 'distractor') ||
    hasBlocker(blockers, 'topic') ||
    hasBlocker(blockers, 'info_span')
  )
}

function isHighCeilingWatch(input: CalibrationInput): boolean {
  const blockers = input.mainBlockers || []
  const hasMeaningBlocker = blockers.some((b) =>
    ['vocab', 'syntax', 'distractor', 'abstraction', 'info_span', 'topic'].includes(b),
  )
  if (!hasMeaningBlocker) return false

  const raw10 = Number(input.aiDifficultyScore)
  if (!(raw10 >= 5)) return false

  return (
    ['passage_main_idea', 'paragraph_main_idea', 'inference_general'].includes(input.surfaceType || '') ||
    ['coverage_test', 'minimal_inference'].includes(input.answeringMove || '')
  )
}

function isStrictLowCandidate(input: CalibrationInput, rawScore: number): boolean {
  const blockers = input.mainBlockers || []
  return (
    rawScore === 1 &&
    ['T1', 'T2'].includes(input.tCardId || '') &&
    input.surfaceType === 'single_detail_normal' &&
    input.answeringMove === 'direct_locating' &&
    blockers.length === 0
  )
}

// --- Core calibration logic ---

function detectCalibrationReasons(input: CalibrationInput): CalibrationReasonCode[] {
  const rawScore = getRawScore(input)
  const blockers = input.mainBlockers || []
  const reasons: Set<CalibrationReasonCode> = new Set()

  // strict_low_score_gate
  if (rawScore === 1 && !isStrictLowCandidate(input, rawScore)) {
    reasons.add('strict_low_score_gate')
  }

  // t2_hidden_blocker_audit
  const directOrLowSurface =
    input.tCardId === 'T2' ||
    input.answeringMove === 'direct_locating' ||
    input.surfaceType === 'why_did'
  if (directOrLowSurface && hasStrongBlocker(blockers)) {
    reasons.add('t2_hidden_blocker_audit')
  }

  // Individual blocker reasons
  if (hasBlocker(blockers, 'vocab')) reasons.add('answer_path_vocab')
  if (hasBlocker(blockers, 'syntax')) reasons.add('syntax_load')
  if (hasBlocker(blockers, 'distractor')) reasons.add('strong_distractor')
  if (hasBlocker(blockers, 'topic')) reasons.add('topic_pressure')

  // location_instability
  if (['option_backtracking', 'multi_point_matching', 'minimal_inference'].includes(input.answeringMove || '')) {
    reasons.add('location_instability')
  }

  // abstract_mapping
  if (!isAbstractMappingBanned(input.surfaceType, input.tCardId) && (isAbstractSurface(input.surfaceType) || isAbstractCard(input.tCardId))) {
    reasons.add('abstract_mapping')
  }

  // word_meaning_context_load
  if (isWordMeaningContextLoad(input)) reasons.add('word_meaning_context_load')

  // high_ceiling_watch
  if (isHighCeilingWatch(input)) reasons.add('high_ceiling_watch')

  // t10_possible_overestimate
  if (input.tCardId === 'T10' && rawScore >= 4) {
    const concreteBlockers = blockers.filter((b) => !['abstraction', 'info_span'].includes(b))
    if (concreteBlockers.length === 0) reasons.add('t10_possible_overestimate')
  }

  return [...reasons]
}

function calibrateSoftV1_1(input: CalibrationInput): { score: number; reasons: CalibrationReasonCode[] } {
  const rawScore = getRawScore(input)
  const reasons = detectCalibrationReasons(input)
  let increase = 0

  if (rawScore === 1 && reasons.includes('strict_low_score_gate')) {
    increase += 1
  } else if (rawScore <= 2 && reasons.includes('t2_hidden_blocker_audit')) {
    increase += 1
  }

  const concreteReasonCount = [
    'answer_path_vocab',
    'syntax_load',
    'strong_distractor',
    'topic_pressure',
    'location_instability',
  ].filter((r) => reasons.includes(r as CalibrationReasonCode)).length

  if (rawScore + increase <= 2 && concreteReasonCount >= 2) increase += 1
  if (rawScore + increase <= 2 && reasons.includes('word_meaning_context_load')) increase += 1

  let score = clampScore(rawScore + Math.min(2, increase))

  // T10 watch: reduce by 1 if flagged
  if (reasons.includes('t10_possible_overestimate')) {
    score = clampScore(score - 1)
  }

  return { score, reasons }
}

// --- Reason labels ---

const reasonLabelMap: Record<CalibrationReasonCode, string> = {
  strict_low_score_gate: '低分门槛审计',
  t2_hidden_blocker_audit: 'T2隐性阻断审计',
  answer_path_vocab: '答案路径词汇负荷',
  topic_pressure: '话题压力',
  location_instability: '定位不稳定',
  strong_distractor: '强干扰项',
  abstract_mapping: '抽象映射',
  syntax_load: '句法负荷',
  word_meaning_context_load: '猜词语境负荷',
  high_ceiling_watch: '高天花板观察',
  t10_possible_overestimate: 'T10可能高估',
}

export function getReasonLabel(code: CalibrationReasonCode): string {
  return reasonLabelMap[code] || code
}

// --- Public API ---

/**
 * Compute a read-only calibration preview for a single question.
 * Returns null if there is no AI difficulty data to calibrate from.
 */
export function computeCalibrationPreview(input: CalibrationInput): CalibrationPreview | null {
  // Need at least one AI score to produce a preview
  if (input.aiDifficultyScore == null && input.deepseekMappedDifficulty == null) {
    return null
  }

  const rawScore = getRawScore(input)
  const { score: calibratedScore, reasons } = calibrateSoftV1_1(input)

  // Build watch flags
  const watchFlags: WatchFlag[] = []
  if (reasons.includes('high_ceiling_watch')) {
    watchFlags.push({ code: 'high_ceiling_watch', label: '可能高天花板，需教师复核' })
  }
  if (reasons.includes('t10_possible_overestimate')) {
    watchFlags.push({ code: 't10_possible_overestimate', label: '抽象压缩样本不足，可能高估' })
  }

  // Display label
  let displayLabel: string
  if (reasons.length === 0 && calibratedScore === rawScore) {
    displayLabel = '未触发校正规则，仅为原始分'
  } else if (watchFlags.length > 0 && calibratedScore === rawScore) {
    displayLabel = watchFlags.map((f) => f.label).join('；')
  } else {
    displayLabel = `校正建议 ${rawScore} → ${calibratedScore}`
  }

  return {
    rawScore,
    calibratedScore,
    reasons,
    watchFlags,
    displayLabel,
  }
}
