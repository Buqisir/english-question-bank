import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { batchRow, grouped, paperReport, readTimeline } from './timing-report.mjs'

test('legacy step timings survive missing new receipts; incomplete lines are ignored', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'eqb-timing-'))
  try {
    const fast = path.join(root, 'imports/ocr-proofread/paper-test/fast')
    mkdirSync(fast, { recursive: true })
    writeFileSync(path.join(fast, 'state.json'), JSON.stringify({
      steps: { push: { seconds: 206.4, finishedAt: '2026-10-18T00:00:00Z' } },
    }))
    assert.match(paperReport(root, 'paper-test'), /脚本步骤 \| push \| 206.4s/u)
    assert.match(paperReport(root, 'paper-test'), /AI 阶段 \| 无记录/u)
    assert.match(batchRow(root, 'paper-test'), /^paper-test \| 206.4s \| 无记录/u)
    const timeline = path.join(fast, 'agent-timeline.jsonl')
    writeFileSync(timeline, '{"label":"proofread","seconds":3}\n{"label":')
    assert.deepEqual(readTimeline(timeline), [{ label: 'proofread', seconds: 3 }])
    assert.deepEqual(grouped([
      { label: 'proofread', seconds: 3 }, { label: 'proofread', seconds: 5 },
    ], 'label', ['seconds']), [{ label: 'proofread', count: 2, seconds: 8 }])
    writeFileSync(timeline, [
      { event: 'started', label: 'proofread', log: 'a' },
      { event: 'finished', label: 'proofread', log: 'a', seconds: 3 },
      { event: 'started', label: 'proofread', log: 'b' },
      { event: 'finished', label: 'proofread', log: 'b', seconds: 5 },
    ].map(JSON.stringify).join('\n'))
    assert.match(paperReport(root, 'paper-test'), /proofread \| 2 次 \/ 8.0s/u)
    assert.match(batchRow(root, 'paper-test'), /^paper-test \| 206.4s \| 8.0s/u)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
