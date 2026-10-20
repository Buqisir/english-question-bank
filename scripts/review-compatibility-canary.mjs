#!/usr/bin/env node
// An explicit one-revision operation. Never scans or approves/publishes papers.
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { reviewBuildIdentityProvider } from '../server/import-review/reviewBuildIdentity.mjs'
import { createReviewCompatibilityStore, captureReviewCompatibilitySnapshot, storedReviewRevision } from '../server/import-review/reviewCompatibilityStore.mjs'
import { createAutomaticReviewSubjectBackfillStore } from '../server/import-review/automaticReviewSubjectBackfill.mjs'
import { runReviewCompatibilityWorker } from '../server/import-review/runReviewCompatibilityWorker.mjs'
import { acquireReviewCompatibilityLeader } from '../server/import-review/reviewCompatibilityScheduling.mjs'

const args = process.argv.slice(2)
const option = flag => args.includes(flag) ? args[args.indexOf(flag) + 1] : null
const dbPath = option('--db'), filesRoot = option('--files-root'), revisionId = option('--revision')
const operator = option('--operator'), reason = option('--reason')
if (!dbPath || !filesRoot || !/^rev-[a-f0-9-]{36}$/.test(revisionId || '') || !operator?.trim() || !reason?.trim()) {
  throw new Error('Usage: review-compatibility-canary.mjs --db <Review DB> --files-root <sealed root> --revision <revision ID> --operator <name> --reason <reason> [--apply]')
}
// The canary is explicitly requested, independently of API automatic scheduling.
process.env.EQB_REVIEW_COMPATIBILITY_AUTORUN = '1'
const leader = acquireReviewCompatibilityLeader()
if (!leader) throw new Error('LEADER_BUSY')
try {
  const target = await reviewBuildIdentityProvider().ready()
  const db = new DatabaseSync(dbPath, { readOnly: true })
  let value
  try { value = captureReviewCompatibilitySnapshot(db, revisionId) } finally { db.close() }
  if (!value?.revision || value.paper?.latest_revision_id !== revisionId) throw new Error('REVISION_NOT_CURRENT')
  let baseline = null
  const report = { revisionId, operator, reason, apply: args.includes('--apply'), targetBuildId: target.targetBuildId }
  if (!value.subject) {
    const backfill = createAutomaticReviewSubjectBackfillStore({ dbPath, filesRoot })
    const job = backfill.prepare(revisionId)
    if (!job) throw new Error('BACKFILL_NOT_ELIGIBLE')
    const output = await backfill.compute(job, { leaderLease: leader.lease })
    report.backfill = output.comparison
    baseline = output.baseline
    if (report.apply) report.backfillCommit = await backfill.commit(job, output)
  }
  if (!value.subject && !baseline?.ok) {
    report.comparison = { result: 'unknown', reasonCode: report.backfill.reasonCode }
  } else if (report.apply) {
    const store = createReviewCompatibilityStore({ dbPath, filesRoot })
    const job = store.prepare(revisionId)
    if (!job) throw new Error('COMPARISON_NOT_ELIGIBLE')
    const output = await store.compute(job, { leaderLease: leader.lease })
    report.comparison = output.comparison
    report.comparisonCommit = await store.commit(job, output)
  } else {
    report.comparison = (await runReviewCompatibilityWorker({
      directory: path.join(filesRoot, revisionId), revision: storedReviewRevision(value.revision),
      preview: value.preview, storedFiles: JSON.parse(value.revision.manifest_json).files,
      storedSubjectJson: value.subject?.subject_json || JSON.stringify(baseline.subject),
      targetBuildId: target.targetBuildId,
    }, { leaderLease: leader.lease })).comparison
  }
  console.log(JSON.stringify(report, null, 2))
  if (report.comparison.result !== 'equal') process.exitCode = 1
} finally { leader.release() }
