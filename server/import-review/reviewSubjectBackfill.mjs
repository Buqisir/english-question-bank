import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { digestJson } from '../../shared/paper-canonical/stable.mjs'
import { validateMediaPublication } from '../../shared/paper-canonical/mediaPresentation.mjs'
import { LISTENING_AUDIO_PATHS } from '../paper-import/listeningAudioEvidence.mjs'
import { readListeningReview } from '../paper-import/listeningReview.mjs'
import { buildStoredReviewSubject } from './reviewSubject.mjs'
import { withSealedReviewSnapshot } from './sealedReviewFiles.mjs'
import { ensureReviewCompatibilityShape } from './reviewCompatibilitySchema.mjs'
import { reviewBuildIdentityProvider } from './reviewBuildIdentity.mjs'
import { captureReviewCompatibilitySnapshot as capture, sameReviewCompatibilitySnapshot as same,
  storedReviewRevision } from './reviewCompatibilityStore.mjs'
import { applyReviewCompatibilityWrite, prepareReviewCompatibilityWrite,
  reviewCompatibilityAttempts } from './reviewCompatibilityWrite.mjs'
import { acquireReviewCompatibilityLeader, reviewCompatibilityBusy,
  reviewCompatibilityLockDiagnostics } from './reviewCompatibilityScheduling.mjs'

const fail = reasonCode => { throw Object.assign(new Error(reasonCode), { reasonCode }) }
export const REVIEW_BACKFILL_FILE_BUDGET = Object.freeze({ maxFileBytes: 64 * 1024 ** 2, maxTotalBytes: 256 * 1024 ** 2 })
const eligible = value => value?.paper.latest_revision_id === value?.revision.id
  && ['awaiting_review', 'approved'].includes(value?.revision.state)
  && !value.shipping_guards.length && !value.promotions.some(row => row.state === 'publishing')

function originalListeningReview(directory, revision, preview, evidence) {
  if (!evidence.some(file => file.path === 'listening-review-v1.json')) return null
  const source = evidence.find(file => file.path === 'universal-source-manifest.json')?.json
  const materialization = evidence.find(file => file.path === source?.materializationPath)?.json
  const transcript = materialization?.listening?.transcript
  const audio = JSON.parse(preview.payload_json).consumption?.listeningAudio
  const original = evidence.find(file => file.path === LISTENING_AUDIO_PATHS.original)
  const playback = evidence.find(file => file.path === LISTENING_AUDIO_PATHS.playback)
  if (!transcript || !audio || !original || !playback
    || audio.sha256 !== playback.sha256 || audio.byteLength !== playback.byteLength) fail('MISSING_VALIDATED_LISTENING_REVIEW')
  return readListeningReview(directory, {
    paperId: revision.paperId, sourceDigest: revision.sourceDigest, candidateDigest: revision.candidateDigest,
    originalAudioSha256: original.sha256, playbackAudioSha256: playback.sha256,
    durationSeconds: audio.durationSeconds, timebase: 'normalized_playback_seconds',
    transcriptDigest: digestJson(transcript),
  }, transcript)
}

function originalConfirmations(value, revision, evidence) {
  // Walk only retained JSON, including unknown sidecar roles. No current
  // compiler/projection is allowed to invent a historical media selection.
  function visit(node) {
    if (!node || typeof node !== 'object') return
    if (node.publication?.selection === 'human_confirmed_ai_candidate') {
      const publication = node.publication
      if (!validateMediaPublication(publication, node.presentation)) fail('MEDIA_CONFIRMATION_UNTRUSTED')
      const confirmation = publication.confirmation
      const row = value.media_confirmations.find(row => row.id === confirmation.receiptId
        && row.paper_id === revision.paperId && row.media_id === node.mediaId)
      const receipt = row && JSON.parse(row.receipt_json)
      if (!row || row.revision_id === revision.id || receipt.confirmationId !== confirmation.receiptId
        || receipt.sourceSha256 !== confirmation.sourceSha256
        || receipt.candidateSha256 !== confirmation.candidateSha256
        || receipt.presentationDigest !== confirmation.presentationDigest
        || receipt.reviewMethod !== confirmation.reviewMethod
        || digestJson(receipt.checklist) !== digestJson(confirmation.checklist)
        || !evidence.some(file => file.sha256 === receipt.sourceSha256)
        || !evidence.some(file => file.sha256 === receipt.candidateSha256)) fail('MEDIA_CONFIRMATION_UNTRUSTED')
    }
    for (const child of Object.values(node)) visit(child)
  }
  for (const file of evidence) if (file.json) visit(file.json)
}

// Shared historical extractor: CLI and the bounded API thread use the same
// original records/bytes. It never invokes the current compiler or renderer.
export function extractStoredReviewBaseline(value, directory) {
  if (!eligible(value)) fail('NOT_ELIGIBLE')
  const revision = storedReviewRevision(value.revision)
  if (revision.reviewKind !== 'candidate') fail('OCR_NOT_APPLICABLE')
  if (!/^rev-[a-f0-9-]{36}$/.test(revision.id)) fail('REVIEW_REVISION_INVALID')
  if (!value.preview?.payload_json) fail('MISSING_BASELINE')
  const storedFiles = value.files.map(row => ({ path: row.path, role: row.role,
    mediaType: row.media_type, sha256: row.sha256, byteLength: row.byte_length }))
  const baseline = withSealedReviewSnapshot(directory, revision.manifest.files, sealed => {
    const changed = sealed.fileEvidence.some(file => {
      const original = revision.manifest.files.find(item => item.path === file.path)
      return original.sha256 !== file.sha256 || original.byteLength !== file.byteLength
    })
    if (changed) fail('SEALED_FILE_CHANGED')
    originalConfirmations(value, revision, sealed.fileEvidence)
    return buildStoredReviewSubject({ revision, preview: value.preview, storedFiles,
      fileEvidence: sealed.fileEvidence,
      validatedListeningReview: originalListeningReview(sealed.directory, revision, value.preview, sealed.fileEvidence) })
  }, REVIEW_BACKFILL_FILE_BUDGET)
  if (!baseline.ok) fail(baseline.reasonCode)
  baseline.provenance.confirmationsDigest = digestJson(value.media_confirmations)
  return baseline
}

// Explicit local maintenance. The shared leader excludes API background
// workers; activity checks and the same raw-row CAS handle concurrent API
// finalization/approval. No transaction spans filesystem reads or identity work.
export async function backfillReviewSubjects({ dbPath, filesRoot, apply = false }) {
  const report = { dryRun: !apply, canBackfill: 0, applied: 0, skipped: 0, alreadyPresent: 0, results: [] }
  const leader = acquireReviewCompatibilityLeader()
  if (!leader) return { ...report, paused: 'LEADER_BUSY', locks: reviewCompatibilityLockDiagnostics() }
  const withDb = (write, fn) => {
    const db = new DatabaseSync(dbPath, { readOnly: !write })
    db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000')
    try { return fn(db) } finally { db.close() }
  }
  try {
    if (reviewCompatibilityBusy()) return { ...report, paused: 'ACTIVITY_PENDING', locks: reviewCompatibilityLockDiagnostics() }
    const ids = withDb(false, db => db.prepare(`SELECT r.id FROM import_review_revisions r
      JOIN import_review_papers p ON p.latest_revision_id=r.id
      WHERE r.state IN ('awaiting_review','approved') ORDER BY r.id`).all().map(row => row.id))
    let target = null
    if (apply) {
      target = await reviewBuildIdentityProvider().ready()
      withDb(true, db => ensureReviewCompatibilityShape(db))
    }
    for (const revisionId of ids) {
      let result = { revisionId, action: 'skipped' }
      try {
        if (reviewCompatibilityBusy()) fail('ACTIVITY_PENDING')
        const value = withDb(false, db => capture(db, revisionId))
        result.paperId = value.revision.paper_id
        if (value.subject) {
          report.alreadyPresent++
          report.results.push({ ...result, action: 'already_present', reasonCode: 'SUBJECT_EXISTS' })
          continue
        }
        const baseline = extractStoredReviewBaseline(value, path.join(filesRoot, revisionId))
        const revision = storedReviewRevision(value.revision)
        if (apply) withDb(true, db => {
          db.exec('BEGIN IMMEDIATE')
          try {
            if (reviewCompatibilityBusy() || !same(capture(db, revisionId), value)) fail('CAS_CHANGED')
            const previous = reviewCompatibilityAttempts(db, revisionId, target.targetBuildId)
            const plan = prepareReviewCompatibilityWrite(revision, null, previous, baseline, {
              result: 'unknown', reasonCode: 'BACKFILL_PENDING', targetBuildId: target.targetBuildId,
              subjectDigest: baseline.subjectDigest,
            })
            // Never carry an old terminal into a newly created baseline.
            if (!plan.subjectValues || previous.some(row => row.result !== 'unknown')) fail('BASELINE_UNTRUSTED')
            applyReviewCompatibilityWrite(db, plan)
            if (db.prepare('PRAGMA foreign_key_check').all().length) fail('FOREIGN_KEY_CHECK_FAILED')
            db.exec('COMMIT')
          } catch (error) { if (db.isTransaction) db.exec('ROLLBACK'); throw error }
        })
        report.canBackfill++
        if (apply) report.applied++
        result = { ...result, action: apply ? 'backfilled' : 'would_backfill',
          reasonCode: apply ? 'BACKFILL_PENDING' : 'EVIDENCE_VERIFIED', subjectDigest: baseline.subjectDigest }
      } catch (error) {
        report.skipped++
        result.reasonCode = error.reasonCode || (error.code === 'ENOENT' ? 'MISSING_EVIDENCE' : 'BASELINE_UNTRUSTED')
      }
      report.results.push(result)
    }
    return report
  } finally { leader.release() }
}
