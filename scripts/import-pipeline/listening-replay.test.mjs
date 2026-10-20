import test from 'node:test'
import assert from 'node:assert/strict'
import { listeningReplayDistributions, replayOrderProjection } from './lib-listening-replay.mjs'
test('crop-only replay separates unavailable order from genuine failures without approving playback', () => {
  const orderOnly = { issues: ['WHOLE_PAPER_ORDER_UNPROVEN'], playback: { startSeconds: 1, endSeconds: 2 } }
  const failed = { issues: ['WHOLE_PAPER_ORDER_UNPROVEN', 'READING_COUNT_UNKNOWN'] }
  assert.deepEqual(listeningReplayDistributions([orderOnly, failed]), {
    includingOrder: { usable: 0, review_required: 1, ORDER_NOT_EVALUABLE_IN_REPLAY: 1 },
    orderNotEvaluable: { usable: 1, review_required: 1 },
    orderStatusCounts: { ORDER_NOT_EVALUABLE_IN_REPLAY: 2 },
  })
  assert.equal(replayOrderProjection(orderOnly).playback, undefined)
  assert.deepEqual(orderOnly.issues, ['WHOLE_PAPER_ORDER_UNPROVEN'])
  assert.deepEqual(replayOrderProjection(failed).issues, ['READING_COUNT_UNKNOWN'])
})
