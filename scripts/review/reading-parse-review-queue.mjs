export const VALID_SURFACE_TYPES = new Set([
  'single_detail_normal',
  'multi_detail_learn_from',
  'why_did',
  'word_meaning',
  'paragraph_main_idea',
  'passage_main_idea',
  'writing_technique',
  'paragraph_function',
  'author_purpose',
  'attitude_tone',
  'inference_general',
  'example_function',
  'adjective_summary',
  'abstract_phrase_summary',
])

const CARD_BY_SURFACE = {
  word_meaning: 'T3',
  writing_technique: 'T8',
  paragraph_function: 'T8',
  example_function: 'T7',
  abstract_phrase_summary: 'T10',
  paragraph_main_idea: 'T5',
  passage_main_idea: 'T5',
  attitude_tone: 'T9',
  inference_general: 'T6',
}

function stableCandidateId(report, row) {
  const runId = report?.runId || 'unknown-run'
  return [
    runId,
    row.paper,
    row.passage,
    `Q${row.questionNo}`,
  ]
    .map((item) => String(item || '').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, ''))
    .filter(Boolean)
    .join('__')
}

export function expectedReviewCard(row) {
  if (row.surfaceType === 'adjective_summary') {
    return ['T6', 'T10'].includes(row.tCardId) ? '' : 'T10'
  }
  return CARD_BY_SURFACE[row.surfaceType] || ''
}

function suggestedAction(row) {
  const expected = expectedReviewCard(row)
  const category = String(row.driftCategory || '')

  if (['single_detail_normal', 'why_did'].includes(row.surfaceType) && ['T5', 'T7', 'T8', 'T9', 'T10'].includes(row.tCardId)) {
    return 'correct_surface'
  }
  if (expected && row.tCardId && expected !== row.tCardId) {
    return 'correct_card'
  }
  if (category.includes('prompt') && row.surfaceType) return 'correct_surface'
  if (category.includes('backend') && expected) return 'correct_card'
  return 'accept'
}

function suggestedCorrection(row) {
  const action = suggestedAction(row)
  if (action === 'correct_card') {
    return {
      surfaceType: row.surfaceType || '',
      tCardId: expectedReviewCard(row) || '',
    }
  }
  if (action === 'correct_surface' && row.answeringMove === 'coverage_test') {
    return {
      surfaceType: row.surfaceScope === 'passage' ? 'passage_main_idea' : 'paragraph_main_idea',
      tCardId: row.tCardId || '',
    }
  }
  if (action === 'correct_surface' && row.tCardId === 'T7') {
    return {
      surfaceType: 'example_function',
      tCardId: row.tCardId || '',
    }
  }
  if (action === 'correct_surface' && row.surfaceType === 'multi_detail_learn_from' && ['T1', 'T2', 'T3'].includes(row.tCardId)) {
    return {
      surfaceType: 'single_detail_normal',
      tCardId: row.tCardId || '',
    }
  }
  return {
    surfaceType: '',
    tCardId: '',
  }
}

export function buildReviewCandidates(report) {
  const rows = Array.isArray(report?.rows) ? report.rows : []
  return rows
    .filter((row) => row.suspiciousReason || row.reviewNeeded === true || suggestedAction(row) !== 'accept')
    .map((row) => {
      const correction = suggestedCorrection(row)
      return {
        candidateId: stableCandidateId(report, row),
        status: 'pending',
        allowedActions: ['accept', 'correct_card', 'correct_surface'],
        suggestedAction: suggestedAction(row),
        suggestedCorrection: correction,
        source: {
          sourceFile: row.sourceFile || '',
          paper: row.paper || '',
          passage: row.passage || '',
          groupTitle: row.groupTitle || '',
          evalGroupId: row.evalGroupId || '',
          questionNo: String(row.questionNo || ''),
          stem: row.questionStem || '',
          answer: row.answer || '',
        },
        aiJudgment: {
          questionType: row.questionType || '',
          surfaceType: row.surfaceType || '',
          surfaceScope: row.surfaceScope || '',
          answeringMove: row.answeringMove || '',
          tCardId: row.tCardId || '',
          tName: row.tName || '',
          soloLevel: row.soloLevel || '',
          confidence: row.confidence ?? '',
          boundaryFlags: Array.isArray(row.boundaryFlags) ? row.boundaryFlags : [],
          reviewNeeded: row.reviewNeeded === true,
          finalScore: row.finalScore ?? '',
          finalLabel: row.finalLabel || '',
        },
        evidence: {
          sourceExpression: row.sourceExpression || '',
          optionExpression: row.optionExpression || '',
          reason: row.reason || '',
          boundaryCheck: row.boundaryCheck || '',
          suspiciousReason: row.suspiciousReason || '',
          driftCategory: row.driftCategory || '',
        },
        teacherDecision: {
          action: '',
          correctedCardId: '',
          correctedSurfaceType: '',
          note: '',
        },
      }
    })
}

export function summarizeReviewCandidates(candidates) {
  const summary = {
    total: candidates.length,
    suggestedActions: {},
    driftCategories: {},
    reviewNeeded: candidates.filter((candidate) => candidate.aiJudgment.reviewNeeded).length,
  }

  for (const candidate of candidates) {
    summary.suggestedActions[candidate.suggestedAction] =
      (summary.suggestedActions[candidate.suggestedAction] || 0) + 1
    const category = candidate.evidence.driftCategory || 'manual'
    summary.driftCategories[category] = (summary.driftCategories[category] || 0) + 1
  }

  return summary
}

export function buildReviewCandidatePayload(report) {
  const candidates = buildReviewCandidates(report)
  return {
    version: 1,
    runId: report?.runId || '',
    createdAt: new Date().toISOString(),
    sourceReport: report?.sourceReport || '',
    summary: summarizeReviewCandidates(candidates),
    teacherInstructions: {
      actions: {
        accept: 'AI 判断可用，直接沉淀为 golden case。',
        correct_card: 'T 卡错了，在 teacherDecision.correctedCardId 写入正确 T1-T10。',
        correct_surface: '题型画像错了，在 teacherDecision.correctedSurfaceType 写入正确 surfaceQuestion.type。',
      },
      editFields: [
        'teacherDecision.action',
        'teacherDecision.correctedCardId',
        'teacherDecision.correctedSurfaceType',
        'teacherDecision.note',
      ],
    },
    candidates,
  }
}
