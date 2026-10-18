import assert from 'node:assert/strict'
import test from 'node:test'
import { timedCandidateRender, finishPaginationTiming } from '../../server/draft-paper/paginationTiming.mjs'
import { summarizePaginationTiming } from './pagination-timing.mjs'

test('candidate diagnostics preserve render order, options, result identity and thrown errors', async () => {
  const layout = { fontSizePt: 12, figureLayout: 'natural', answerBoxHeightsMm: { application: 65, continuation: 57 } }
  const result = { pageCount: 10 }
  const overflow = Object.assign(new Error('overflow'), { code: 'PAPER_LAYOUT_OVERFLOW' })
  const seen = []
  const inspect = () => {}
  const timed = timedCandidateRender(async (html, options) => {
    seen.push(html)
    assert.equal(options.inspect, inspect)
    options.timing.queueWaitMs = 3
    options.timing.renderMs = 11
    options.timing.pdfMs = 5
    if (html === 'overflow') throw overflow
    return result
  }, { edition: 'largeNoListening', accepts: value => value.pageCount <= 10 })
  const html = '<section data-canonical-group-id="reading-a" data-pdf-planned-break>'
  assert.equal(await timed.measure(html, { inspect }, layout), result)
  await assert.rejects(timed.measure('overflow', { inspect }, layout), error => error === overflow)
  assert.deepEqual(seen, [html, 'overflow'])
  assert.deepEqual(timed.timing.candidates.map(row => [row.index, row.hit, row.error]), [
    [1, true, undefined], [2, false, 'PAPER_LAYOUT_OVERFLOW'],
  ])
  assert.deepEqual(timed.timing.candidates[0].breakGroupIds, ['reading-a'])
  layout.answerBoxHeightsMm.application = 24
  assert.equal(timed.timing.candidates[0].layout.answerBoxHeightsMm.application, 65)
  assert.ok(timed.timing.candidates.every(row => row.totalMs >= 0))
  assert.ok(finishPaginationTiming(timed.timing).totalSeconds >= 0)
})

test('summary reports candidate totals and tolerates historical reports', () => {
  assert.equal(summarizePaginationTiming({ edition: 'economy8' }), 'economy8 | 无 timing 记录')
  assert.equal(summarizePaginationTiming({ edition: 'economy8', timing: {
    totalSeconds: 2, chromiumLaunchMs: 100,
    candidates: [{ totalMs: 20, queueWaitMs: 2 }, { totalMs: 40, queueWaitMs: 3 }],
  } }), 'economy8 | 2 | 2.00s | 30.00ms / 40.00ms | 5.00ms | 100.00ms')
})
