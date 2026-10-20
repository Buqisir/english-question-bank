#!/usr/bin/env node
// Offline rehearsal. Capture authenticated GET responses separately; this
// command has no network, DB-write, approval or publication capability.
import { existsSync, mkdirSync, readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { digestJson } from '../shared/paper-canonical/stable.mjs'
import { runReviewCompatibilityWorker } from '../server/import-review/runReviewCompatibilityWorker.mjs'
import { REVIEW_BACKFILL_BUDGET } from '../server/import-review/automaticReviewSubjectBackfill.mjs'
import { computeSealedReviewSubjects } from '../server/import-review/revisionProjection.mjs'
import { compareReviewSubjects } from '../server/import-review/reviewCompatibility.mjs'
import { computeReviewBuildIdentity } from '../server/import-review/reviewBuildIdentity.mjs'
import { reviewBackfillDiagnostic } from '../server/import-review/reviewBackfillDiagnostic.mjs'

const read = file => JSON.parse(readFileSync(file, 'utf8'))

export function rehearsalSnapshot(status, previewApi, analysisApi) {
  const revision = status.latest
  const manifest = revision.manifest
  const ready = previewApi?.consumption?.status === 200 && previewApi?.['asset/paper-asset.json']?.status === 200
  if (ready && (!analysisApi || Object.keys(analysisApi).length !== 6
    || Object.values(analysisApi).some(value => ![200, 404].includes(value.status)))) {
    throw new Error('Captured analysis endpoints are missing or unavailable')
  }
  const payload = ready ? {
    consumption: previewApi.consumption.body,
    paperAsset: previewApi['asset/paper-asset.json'].body,
    analysisSidecars: Object.fromEntries(Object.entries(analysisApi).filter(([, value]) => value.status === 200)
      .map(([name, value]) => [name, value.body])),
  } : null
  return {
    revision: { id: revision.id, paper_id: revision.paperId, state: revision.state,
      renderer_build_id: revision.rendererBuildId, bundle_digest: revision.bundleDigest,
      source_digest: revision.sourceDigest, candidate_digest: revision.candidateDigest,
      visible_structure_digest: revision.visibleStructureDigest, manifest_json: JSON.stringify(manifest) },
    paper: { latest_revision_id: revision.id },
    files: status.files.map(file => ({ path: file.path, role: file.role, media_type: file.mediaType,
      sha256: file.sha256, byte_length: file.byteLength })),
    preview: payload ? { revision_id: revision.id, bundle_digest: revision.bundleDigest,
      renderer_build_id: revision.rendererBuildId, payload_digest: digestJson(payload), payload_json: JSON.stringify(payload) } : null,
    media_confirmations: status.mediaConfirmations || [], shipping_guards: [], promotions: [], subject: null,
  }
}

export async function rehearseReviewSubjectBackfill(evidenceRoot, { papersRoot, paperId = null,
  onProgress = () => {} } = {}) {
  evidenceRoot = realpathSync(evidenceRoot)
  papersRoot ||= read(path.join(evidenceRoot, 'rehearsal-input.json')).papersRoot
  papersRoot = realpathSync(papersRoot)
  const workspaceRoot = path.join(evidenceRoot, 'workspaces')
  mkdirSync(workspaceRoot, { recursive: true })
  const previousTmpdir = process.env.TMPDIR
  const previousLockRoot = process.env.EQB_REVIEW_COMPATIBILITY_TEST_LOCK_ROOT
  process.env.TMPDIR = workspaceRoot
  process.env.EQB_REVIEW_COMPATIBILITY_TEST_LOCK_ROOT = path.join(workspaceRoot, 'locks')
  try {
    const papers = read(path.join(evidenceRoot, 'list.json')).body.papers
      .filter(paper => paper.state === 'awaiting_review' && paper.reviewKind === 'candidate'
        && (!paperId || paper.paperId === paperId))
    const targetBuildId = computeReviewBuildIdentity({ repoRoot: path.resolve(import.meta.dirname, '..') }).targetBuildId
    const results = []
    for (const paper of papers) {
      const captured = path.join(evidenceRoot, 'papers', paper.paperId)
      let result = { paperId: paper.paperId, paperName: paper.paperName, revisionId: paper.latestRevisionId }
      try {
        const status = read(path.join(captured, 'status.json'))
        if (status.status !== 200 || status.body.latest.id !== paper.latestRevisionId) throw new Error('Captured status identity mismatch')
        const previewApi = read(path.join(captured, 'preview-api.json'))
        const analysisApi = existsSync(path.join(captured, 'analysis-api.json')) ? read(path.join(captured, 'analysis-api.json')) : null
        const value = rehearsalSnapshot(status.body, previewApi, analysisApi)
        const directory = path.join(papersRoot, paper.paperId)
        onProgress({ paperId: paper.paperId, stage: 'backfill-start' })
        const backfill = await runReviewCompatibilityWorker({ mode: 'backfill', value, previous: [],
          directory, targetBuildId }, { heapMb: REVIEW_BACKFILL_BUDGET.heapMb, timeoutMs: REVIEW_BACKFILL_BUDGET.deadlineMs })
        onProgress({ paperId: paper.paperId, stage: 'backfill-end', reasonCode: backfill.comparison.reasonCode })
        const baseline = backfill.baseline
        if (!baseline?.ok) throw Object.assign(new Error(backfill.comparison.diagnostic?.message || backfill.comparison.reasonCode),
          { reasonCode: backfill.comparison.reasonCode, pointer: backfill.comparison.diagnostic?.pointer || '' })
        const revision = status.body.latest
        onProgress({ paperId: paper.paperId, stage: 'comparison-start' })
        const input = { directory, revision, preview: value.preview, storedFiles: revision.manifest.files }
        const compared = computeSealedReviewSubjects(input)
        const comparison = compareReviewSubjects({ ...compared, storedSubject: baseline.subject, targetBuildId })
        onProgress({ paperId: paper.paperId, stage: 'comparison-end', reasonCode: comparison.reasonCode })
        result = { ...result, result: comparison.result, reasonCode: comparison.reasonCode,
          subjectBytes: baseline.metrics.subjectBytes, differences: comparison.differences,
          subjectDigest: baseline.subjectDigest, backfillBudget: backfill.comparison.metrics,
          comparisonBudget: comparison.metrics }
      } catch (error) {
        result = { ...result, result: 'unknown', reasonCode: error.reasonCode || error.code || 'REHEARSAL_FAILED',
          diagnostic: reviewBackfillDiagnostic(error) }
      }
      results.push(result)
      console.error(`${result.paperId}\t${result.result}\t${result.reasonCode}\t${result.subjectBytes ?? ''}`)
      // Let previous large parsed evidence be reclaimed between papers.
      await new Promise(resolve => setImmediate(resolve))
    }
    const counts = Object.fromEntries(['equal', 'different', 'unknown'].map(key =>
      [key, results.filter(result => result.result === key).length]))
    return {
      capturedAt: new Date().toISOString(), targetBuildId, evidenceRoot, papersRoot,
      comparisonMode: 'inline',
      limitation: 'Preview envelope and payload_digest reconstructed from authenticated GET payloads; raw historical SQLite preview row/digest and hidden guard/confirmation rows are not exposed. Missing preview is never rebuilt from current projection. This is offline content rehearsal, not a production CAS or approval test.',
      counts, results,
    }
  } finally {
    if (previousTmpdir === undefined) delete process.env.TMPDIR
    else process.env.TMPDIR = previousTmpdir
    if (previousLockRoot === undefined) delete process.env.EQB_REVIEW_COMPATIBILITY_TEST_LOCK_ROOT
    else process.env.EQB_REVIEW_COMPATIBILITY_TEST_LOCK_ROOT = previousLockRoot
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [directory, ...options] = process.argv.slice(2)
  const option = flag => options.includes(flag) ? options[options.indexOf(flag) + 1] : undefined
  if (!directory) throw new Error('Usage: node scripts/rehearse-review-subject-backfill.mjs <evidence-directory> [--papers-root <sealed-papers-directory>] [--paper <paperId>]')
  const report = await rehearseReviewSubjectBackfill(directory, { papersRoot: option('--papers-root'), paperId: option('--paper'),
    onProgress: options.includes('--verbose') ? event => console.error(JSON.stringify(event)) : undefined })
  console.log(JSON.stringify(report, null, 2))
  if (report.results.some(row => row.result !== 'equal'
    && !(row.paperId === 'paper-mock-cq8-2026-m5' && row.reasonCode === 'MISSING_BASELINE'))) process.exitCode = 1
}
