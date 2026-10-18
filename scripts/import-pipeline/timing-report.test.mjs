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

test('upload report shows reuse and server finalize phases while retaining legacy receipts', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'eqb-timing-'))
  try {
    const fast = path.join(root, 'imports/ocr-proofread/paper-test/fast')
    mkdirSync(fast, { recursive: true })
    const legacy = { startedAt: 'legacy', manifestFiles: 8, uploadedFiles: 8,
      uploadedBytes: 32796, putSeconds: 1, putMode: 'parallel', finalizeSeconds: 2, completed: true }
    writeFileSync(path.join(fast, 'upload-timeline.jsonl'), [
      legacy,
      { ...legacy, startedAt: 'metrics', uploadedFiles: 1, uploadedBytes: 4098,
        reusedFiles: 7, reusedBytes: 28698, completed: false,
        finalizeMetrics: { outcome: 'failed', failedStage: 'projection', durationsMs: {
          fileHash: 100, projection: 200, identityAndReport: 30, inventory: 40,
          transactionAndPreview: 50, mutexWait: 60,
        } } },
    ].map(JSON.stringify).join('\n'))
    const report = paperReport(root, 'paper-test')
    const legacyLine = report.split('\n').find(line => line.startsWith('上传 | legacy'))
    assert.equal(legacyLine, '上传 | legacy | manifest 8 / 实传 8 / 32796 bytes / PUT 1.0s (parallel) / finalize 2.0s')
    assert.match(report, /复用 7 文件 \/ 28698 bytes/u)
    assert.match(report, /finalize 分段 fileHash 100.0ms \/ projection 200.0ms \/ identityAndReport 30.0ms \/ inventory 40.0ms \/ transactionAndPreview 50.0ms \/ mutexWait 60.0ms/u)
    assert.match(report, /finalize failedStage projection/u)
    assert.match(batchRow(root, 'paper-test'), /2.0s \/ 4.0s$/u)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
