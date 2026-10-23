// Statistical projection only. Never emits an import decision/sidecar playback.
const orderIssues = new Set(['WHOLE_PAPER_ORDER_UNPROVEN', 'WHOLE_PAPER_ORDER_CONFLICT', 'NEIGHBOR_BOUNDARY_CROSSED'])
export function replayOrderProjection(group) {
  const issues = group.issues.filter(code => !orderIssues.has(code))
  return { decision: issues.length ? 'review_required' : 'usable', issues,
    orderStatus: 'ORDER_NOT_EVALUABLE_IN_REPLAY' }
}

export function listeningReplayDistributions(groups) {
  const local = groups.map(replayOrderProjection)
  const reviewRequired = local.filter(g => g.decision === 'review_required').length
  return {
    includingOrder: { usable: 0, review_required: reviewRequired, ORDER_NOT_EVALUABLE_IN_REPLAY: groups.length - reviewRequired },
    orderNotEvaluable: { usable: groups.length - reviewRequired, review_required: reviewRequired },
    orderStatusCounts: { ORDER_NOT_EVALUABLE_IN_REPLAY: groups.length },
  }
}
