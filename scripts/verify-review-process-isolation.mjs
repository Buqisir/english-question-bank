#!/usr/bin/env node
import './lib/reviewTestLockRoot.mjs'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtempSync, writeFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { setTimeout as yieldFor } from 'node:timers/promises'
import { makeReviewRelease } from '../test-fixtures/review-compatibility/release.mjs'
import { startReviewCompatibilityWorker } from '../server/import-review/runReviewCompatibilityWorker.mjs'
import { reviewCompatibilityEligibility, isTransientReviewFailure } from '../server/import-review/reviewRecoveryPolicy.mjs'

const root = mkdtempSync(path.join(tmpdir(), 'eqb-review-process-'))
const server = createServer((_request, response) => response.end('alive'))
try {
  let invoked = 0
  process.env.EQB_REVIEW_COMPATIBILITY_AUTORUN = '0'
  const scheduler = startReviewCompatibilityWorker({ ready() { invoked++ } },
    { backfillStore: { runBatch() { invoked++ } } })
  await yieldFor(50)
  await scheduler.stop()
  assert.equal(invoked, 0)
  delete process.env.EQB_REVIEW_COMPATIBILITY_AUTORUN
  console.log('PASS automatic scheduling is enabled by default and starts neither worker when disabled')

  const release = makeReviewRelease(path.join(root, 'release'))
  const worker = path.join(release, 'server/import-review/reviewCompatibilityWorker.mjs')
  // Only the grandchild allocates the large native buffer. A V8 heap limit or
  // sampling only the direct child's RSS cannot detect this fixture.
  writeFileSync(worker, `
    import {spawn} from 'node:child_process';
    import {writeFileSync} from 'node:fs';
    process.once('message',()=> {
      const parser=spawn(process.execPath,['-e',"const bytes=Buffer.alloc(160*1024**2,1);setInterval(()=>bytes[0],1000)"],{stdio:'ignore'});
      writeFileSync(process.env.REVIEW_TEST_PID,String(parser.pid));
      setInterval(()=>{},1000);
    });
  `)
  process.env.REVIEW_TEST_PID = path.join(root, 'parser.pid')
  const { runReviewCompatibilityWorker } = await import(pathToFileURL(path.join(release, 'server/import-review/runReviewCompatibilityWorker.mjs')))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const before = readdirSync(tmpdir()).filter(name => name.startsWith('eqb-review-job-'))
  for (const mode of ['compare', 'backfill']) {
    const output = await runReviewCompatibilityWorker({ mode }, { rssMb: 96, timeoutMs: 10000 })
    assert.equal(output.comparison.reasonCode, 'WORKER_RSS_LIMIT')
    assert(output.comparison.metrics.peakTreeRssBytes > 96 * 1024 ** 2)
    assert(isTransientReviewFailure(output.comparison.reasonCode))
    assert.equal(reviewCompatibilityEligibility(output.comparison, false).eligible, true)
    assert.equal(reviewCompatibilityEligibility(output.comparison, true).eligible, false)
    assert.equal((await fetch(`http://127.0.0.1:${server.address().port}`)).status, 200)
    assert.deepEqual(readdirSync(tmpdir()).filter(name => name.startsWith('eqb-review-job-')), before)
    console.log(`PASS ${mode}: descendant RSS triggers kill; supervisor HTTP survives, legacy fallback applies and workspace is removed`)
  }
  console.log('PASS 3 review process isolation checks')
} finally {
  delete process.env.REVIEW_TEST_PID
  delete process.env.EQB_REVIEW_COMPATIBILITY_AUTORUN
  await new Promise(resolve => server.close(resolve))
  rmSync(root, { recursive: true, force: true })
}
