import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

export const LABELS = {
  materializing: '材料化中',
  awaiting_review: '待审核',
  changes_requested: '待修改',
  approved: '已认可',
  locally_published: '本地已发布',
  ready_to_ship: '可上线',
  shipped: '已上线',
  failed: '失败',
}

export const ANALYSIS_KEYS = [
  'reading-a',
  'reading-b',
  'reading-c',
  'reading-d',
  'seven',
  'cloze',
  'grammar',
]

export const WRITING_ANALYSIS_KEYS = ['application', 'continuation']

export function isOpsVisible(probes) {
  const hasSignal =
    Boolean(probes.blocked) ||
    probes.aiCheck ||
    probes.qaAccepted ||
    probes.locallyPublished ||
    probes.shipped ||
    probes.shippedReceiptInvalid ||
    Boolean(probes.helpNeeded)
  if (probes.latest) return hasSignal
  return hasSignal || probes.source || probes.groups || (probes.config && probes.analyses)
}

export function statusOf(probes) {
  if (probes.shipped) return 'shipped'
  if (probes.shippedReceiptInvalid) return 'failed'
  if (probes.blocked) return 'failed'
  if (probes.rendererStale) return 'changes_requested'
  if (probes.reviewState === 'changes_requested') return 'changes_requested'
  if (probes.reviewState === 'awaiting_review') return 'awaiting_review'
  if (probes.universal) {
    if (
      probes.locallyPublished
      && probes.qaAccepted
      && probes.latest
      && probes.aiCheck
    ) return 'ready_to_ship'
    if (probes.locallyPublished) return 'locally_published'
    if (probes.qaAccepted) return 'approved'
    if (probes.reviewState === 'approved') return 'approved'
  } else {
    if (probes.qaAccepted && probes.latest && probes.aiCheck) return 'ready_to_ship'
    if (probes.reviewState === 'approved') return 'approved'
  }
  return 'materializing'
}

function readJsonIfPresent(filePath) {
  if (!existsSync(filePath)) return null
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'))
  } catch {
    return { _invalid: true, path: filePath }
  }
}

const APPROVAL_IDENTITY_KEYS = [
  'approvalId',
  'revisionId',
  'sourceDigest',
  'candidateDigest',
  'visibleStructureDigest',
  'bundleDigest',
]

const APPROVAL_DIGEST_KEYS = [
  'sourceDigest',
  'candidateDigest',
  'visibleStructureDigest',
  'bundleDigest',
]

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function isSha256Digest(value) {
  return typeof value === 'string' && /^sha256:[0-9a-f]{64}$/i.test(value)
}

function hasApprovalIdentity(value) {
  return isNonEmptyString(value?.approvalId)
    && isNonEmptyString(value?.revisionId)
    && APPROVAL_DIGEST_KEYS.every((key) => isSha256Digest(value[key]))
}

function hasPublicationIdentity(value) {
  return Number.isInteger(value?.assetVersion)
    && value.assetVersion > 0
    && value.versionName === `v${value.assetVersion}`
    && isSha256Digest(value.canonicalPublicationDigest)
}

function expectedShipCommands(paperId) {
  return new Set([
    `node scripts/pull-run-push.mjs push ${paperId} --owner-said-ship`,
    `node scripts/pull-run-push.mjs push ${paperId} --owner-said-retry-ship`,
  ])
}

function shippedReceiptMatchesLocalState({
  receipt,
  paperId,
  universal,
  qaReceipt,
  publicationReceipt,
}) {
  const baseCurrent = Boolean(
    receipt
    && !receipt._invalid
    && typeof receipt.shippedAt === 'string'
    && Number.isFinite(Date.parse(receipt.shippedAt))
    && expectedShipCommands(paperId).has(receipt.command),
  )
  if (!universal) return baseCurrent
  return baseCurrent
    && receipt.schemaVersion === 'nck1-import-shipped-v1'
    && receipt.paperId === paperId
    && qaReceipt?.schemaVersion === 'web-import-review-qa-accepted-v1'
    && publicationReceipt?.schemaVersion === 'universal-nck1-local-publication-v1'
    && hasApprovalIdentity(receipt)
    && hasApprovalIdentity(qaReceipt)
    && hasApprovalIdentity(publicationReceipt)
    && hasPublicationIdentity(receipt)
    && hasPublicationIdentity(publicationReceipt)
    && APPROVAL_IDENTITY_KEYS.every((key) => (
      receipt[key] === qaReceipt?.[key]
      && receipt[key] === publicationReceipt?.[key]
    ))
    && receipt.assetVersion === publicationReceipt?.assetVersion
    && receipt.versionName === publicationReceipt?.versionName
    && receipt.canonicalPublicationDigest === publicationReceipt?.canonicalPublicationDigest
}

function mtimeMs(filePath) {
  if (!existsSync(filePath)) return 0
  try {
    return statSync(filePath).mtimeMs
  } catch {
    return 0
  }
}

function hasSource(paperDir, manifest) {
  if (
    existsSync(path.join(paperDir, 'source.docx')) ||
    existsSync(path.join(paperDir, 'source', 'paper.pdf')) ||
    existsSync(path.join(paperDir, 'source', 'answers.pdf'))
  ) return true
  return Boolean(
    manifest
    && !manifest._invalid
    && Array.isArray(manifest.documents)
    && manifest.documents.length > 0
    && manifest.documents.every((document) => (
      typeof document?.path === 'string'
      && existsSync(path.join(paperDir, document.path))
    )),
  )
}

function analysisCounts(paperDir) {
  let analyze = 0
  let analysis = 0
  for (const key of ANALYSIS_KEYS) {
    if (existsSync(path.join(paperDir, `analyze-${key}-combined.txt`))) analyze += 1
    if (existsSync(path.join(paperDir, `analysis-${key}.json`))) analysis += 1
  }
  return { analyze, analysis }
}

function writingAnalysisCount(paperDir) {
  return WRITING_ANALYSIS_KEYS.filter((key) => (
    existsSync(path.join(paperDir, `analysis-${key}.json`))
  )).length
}

export function probePaper({
  repoRoot,
  paperId,
  reviewStatus = null,
  paperAssetsDir = process.env.QUESTION_BANK_PAPER_ASSET_ROOT
    || path.join(repoRoot, 'app/public/paper-assets'),
}) {
  const paperDir = path.join(repoRoot, 'scripts/import-pipeline/papers', paperId)
  const signalsDir = path.join(paperDir, 'signals')
  const latestDir = path.join(paperAssetsDir, paperId, 'latest')
  const config = readJsonIfPresent(path.join(paperDir, 'config.json'))
  const manifest = readJsonIfPresent(path.join(paperDir, 'universal-source-manifest.json'))
  const materialization = readJsonIfPresent(
    path.join(paperDir, 'materialization', 'nck1-source-materialization-v1.json'),
  )
  const candidate = readJsonIfPresent(
    path.join(paperDir, 'canonical-evidence', 'candidate-summary.json'),
  )
  const blocked = readJsonIfPresent(path.join(signalsDir, 'blocked.json'))
  const helpNeeded = readJsonIfPresent(path.join(signalsDir, 'help-needed.json'))
  const aiCheck = readJsonIfPresent(path.join(signalsDir, 'ai-answer-check.json'))
  const qaAccepted = readJsonIfPresent(path.join(signalsDir, 'qa-accepted.json'))
  const locallyPublished = readJsonIfPresent(
    path.join(signalsDir, 'locally-published.json'),
  )
  const shippedReceipt = readJsonIfPresent(path.join(signalsDir, 'shipped.json'))
  const counts = analysisCounts(paperDir)
  const writingCount = writingAnalysisCount(paperDir)
  const universal = Boolean(config)
    && !config._invalid
    && String(config.format) === 'universal-nck1'
  const format3 = Boolean(config) && !config._invalid && String(config.format) === '3'
  const writingPublished = existsSync(path.join(latestDir, 'analyses', 'writing-analysis-v1.json'))
  const shipped = shippedReceiptMatchesLocalState({
    receipt: shippedReceipt,
    paperId,
    universal,
    qaReceipt: qaAccepted,
    publicationReceipt: locallyPublished,
  })
  const probes = {
    paperId,
    paperName:
      (config && !config._invalid && config.provenance && config.provenance.paperName) ||
      paperId,
    source: hasSource(paperDir, manifest),
    config: Boolean(config) && !config._invalid,
    materialization: Boolean(materialization) && !materialization._invalid,
    candidate: Boolean(candidate) && !candidate._invalid,
    universal,
    groups: existsSync(path.join(paperDir, 'groups.json')),
    analyzeCount: counts.analyze,
    analysisCount: counts.analysis,
    analyses: counts.analyze === ANALYSIS_KEYS.length && counts.analysis === ANALYSIS_KEYS.length,
    format3,
    writingAnalysisCount: writingCount,
    writingAnalyses: writingCount === WRITING_ANALYSIS_KEYS.length,
    writingPublished,
    writingReady: format3
      ? ((existsSync(latestDir) && statSync(latestDir).isDirectory())
        ? writingPublished
        : writingCount === WRITING_ANALYSIS_KEYS.length)
      : true,
    aiCheck: Boolean(aiCheck) && aiCheck.ok === true,
    latest: existsSync(latestDir) && statSync(latestDir).isDirectory(),
    qaAccepted: Boolean(qaAccepted) && !qaAccepted._invalid,
    locallyPublished:
      Boolean(locallyPublished)
      && !locallyPublished._invalid
      && locallyPublished.schemaVersion === 'universal-nck1-local-publication-v1',
    shipped,
    shippedReceiptInvalid: Boolean(shippedReceipt) && !shipped,
    blocked: blocked && !blocked._invalid ? blocked : null,
    helpNeeded: helpNeeded && !helpNeeded._invalid ? helpNeeded : null,
    reviewState: reviewStatus?.latest?.state || null,
    rendererStale: reviewStatus?.rendererStale === true,
    mtimeMs: Math.max(
      mtimeMs(path.join(paperDir, 'config.json')),
      mtimeMs(path.join(paperDir, 'universal-source-manifest.json')),
      mtimeMs(path.join(
        paperDir,
        'materialization',
        'nck1-source-materialization-v1.json',
      )),
      mtimeMs(path.join(paperDir, 'canonical-evidence', 'candidate-summary.json')),
      mtimeMs(path.join(paperDir, 'groups.json')),
      mtimeMs(path.join(signalsDir, 'blocked.json')),
      mtimeMs(path.join(signalsDir, 'ai-answer-check.json')),
      mtimeMs(path.join(signalsDir, 'qa-accepted.json')),
      mtimeMs(path.join(signalsDir, 'locally-published.json')),
      mtimeMs(path.join(signalsDir, 'shipped.json')),
      mtimeMs(path.join(signalsDir, 'help-needed.json')),
      mtimeMs(latestDir),
    ),
  }
  const status = statusOf(probes)
  return {
    ...probes,
    status,
    statusLabel: LABELS[status],
    gatesGreen:
      probes.latest
      && probes.aiCheck
      && (!probes.universal || probes.locallyPublished)
      && !probes.blocked,
    visible: isOpsVisible(probes),
  }
}

export function listPaperIds(repoRoot) {
  const papersRoot = path.join(repoRoot, 'scripts/import-pipeline/papers')
  if (!existsSync(papersRoot)) return []
  return readdirSync(papersRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .sort()
}

export function listOpsPapers(repoRoot) {
  return listPaperIds(repoRoot)
    .map((paperId) => probePaper({ repoRoot, paperId }))
    .filter((paper) => paper.visible)
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
}

export function homeLists(papers) {
  return {
    awaitingReview: papers.filter((paper) => paper.status === 'awaiting_review'),
    failed: papers.filter((paper) => paper.status === 'failed'),
    recent: papers,
  }
}

function exactApprovalReceipt(receipt, approval, schemaVersion) {
  return Boolean(receipt)
    && !receipt._invalid
    && receipt.schemaVersion === schemaVersion
    && hasApprovalIdentity(receipt)
    && hasApprovalIdentity(approval)
    && APPROVAL_IDENTITY_KEYS.every((key) => receipt[key] === approval?.[key])
}

export function inspectPublicationReceipt({
  db = null,
  dbPath = null,
  paperAssetsDir,
  paperId,
  receipt,
}) {
  const version = Number(receipt?.assetVersion)
  const latestPath = path.join(paperAssetsDir, paperId, 'latest', 'paper-asset.json')
  const latest = readJsonIfPresent(latestPath)
  if (!latest || latest._invalid) {
    return {
      current: false,
      code: 'publication_latest_missing',
      message: 'The committed latest paper asset is missing or invalid',
    }
  }
  if (
    latest.paper?.paperId !== paperId
    || latest.paper?.assetVersion !== version
  ) {
    return {
      current: false,
      code: 'publication_latest_mismatch',
      message: 'The latest paper asset does not match the local publication receipt',
    }
  }
  if (!db && (!dbPath || !existsSync(dbPath))) {
    return {
      current: false,
      code: 'publication_database_missing',
      message: 'The local question bank database is missing',
    }
  }

  let database = db
  let closeDatabase = false
  try {
    if (!database) {
      database = new DatabaseSync(dbPath, { readOnly: true })
      closeDatabase = true
    }
    const requiredTables = database.prepare(
      `
      SELECT name
      FROM sqlite_master
      WHERE type = 'table' AND name IN ('paper_asset_versions', 'canonical_paper_publications')
      `,
    ).all()
    if (requiredTables.length !== 2) {
      return {
        current: false,
        code: 'publication_database_shape_missing',
        message: 'The local database lacks publication state tables',
      }
    }
    const assetRow = database.prepare(
      `
      SELECT version_name, status
      FROM paper_asset_versions
      WHERE paper_id = ? AND asset_version = ?
      `,
    ).get(paperId, version)
    if (assetRow?.status !== 'published' || assetRow.version_name !== receipt.versionName) {
      return {
        current: false,
        code: 'publication_asset_not_published',
        message: 'The receipt asset version is not published in the local database',
      }
    }
    const canonicalRow = database.prepare(
      `
      SELECT version_name, publication_digest
      FROM canonical_paper_publications
      WHERE paper_id = ? AND source_asset_version = ? AND is_current = 1
      `,
    ).get(paperId, version)
    if (
      canonicalRow?.version_name !== receipt.versionName
      || canonicalRow.publication_digest !== receipt.canonicalPublicationDigest
    ) {
      return {
        current: false,
        code: 'canonical_publication_not_current',
        message: 'The receipt does not match the current Canonical Paper publication',
      }
    }
    return { current: true, code: null, message: null }
  } catch {
    return {
      current: false,
      code: 'publication_database_unreadable',
      message: 'The local publication state could not be read from the question bank database',
    }
  } finally {
    if (closeDatabase) database.close()
  }
}

function nextStep(state, paper, reviewStatus, receiptState) {
  const command = (value) => `node scripts/import-pipeline/review.mjs ${value} ${paper.paperId}`
  if (state === 'failed') {
    return { action: 'resolve_blocker', command: null, mutatesProduction: false }
  }
  if (state === 'shipped') {
    return { action: 'done', command: null, mutatesProduction: false }
  }
  if (state === 'ready_to_ship') {
    return { action: 'stop_ready_to_ship', command: null, mutatesProduction: false }
  }
  if (state === 'locally_published') {
    return { action: 'inspect_local_publication', command: null, mutatesProduction: false }
  }
  if (state === 'approved') {
    return receiptState.acceptanceCurrent
      ? { action: 'publish_local', command: command('publish'), mutatesProduction: false }
      : { action: 'accept_approval', command: command('accept'), mutatesProduction: false }
  }
  if (state === 'changes_requested') {
    return {
      action: reviewStatus?.rendererStale
        ? 'resubmit_for_current_renderer'
        : 'revise_and_resubmit',
      command: command('status'),
      mutatesProduction: false,
    }
  }
  if (state === 'awaiting_review') {
    return { action: 'wait_for_owner_review', command: command('status'), mutatesProduction: false }
  }
  if (!paper.config || !paper.source || !paper.materialization) {
    return { action: 'continue_materialization', command: null, mutatesProduction: false }
  }
  if (!paper.candidate || !paper.aiCheck) {
    return { action: 'verify_and_build_candidate', command: null, mutatesProduction: false }
  }
  return { action: 'push_revision', command: command('push'), mutatesProduction: false }
}

export function preflightPaper({
  repoRoot,
  paperId,
  reviewStatus = null,
  reviewChecked = false,
  dbPath = process.env.QUESTION_BANK_DB || path.join(repoRoot, 'data/question-bank.sqlite'),
  paperAssetsDir = process.env.QUESTION_BANK_PAPER_ASSET_ROOT
    || path.join(repoRoot, 'app/public/paper-assets'),
}) {
  const paper = probePaper({ repoRoot, paperId, reviewStatus, paperAssetsDir })
  const paperDir = path.join(repoRoot, 'scripts/import-pipeline/papers', paperId)
  const qaReceipt = readJsonIfPresent(path.join(paperDir, 'signals', 'qa-accepted.json'))
  const candidateSummary = readJsonIfPresent(
    path.join(paperDir, 'canonical-evidence', 'candidate-summary.json'),
  )
  const teacherConfirmation = readJsonIfPresent(
    path.join(paperDir, 'canonical-evidence', 'teacher-confirmation-v1.json'),
  )
  const savedApproval = readJsonIfPresent(
    path.join(paperDir, 'canonical-evidence', 'web-review-approval-v1.json'),
  )
  const publicationReceipt = readJsonIfPresent(
    path.join(paperDir, 'signals', 'locally-published.json'),
  )
  const shippedReceipt = readJsonIfPresent(path.join(paperDir, 'signals', 'shipped.json'))
  const latestAsset = readJsonIfPresent(path.join(
    paperAssetsDir,
    paperId,
    'latest',
    'paper-asset.json',
  ))
  const approval = reviewStatus?.approval || null
  const receiptState = {
    candidateCurrent: Boolean(
      candidateSummary
      && !candidateSummary._invalid
      && candidateSummary.paperId === paperId
      && candidateSummary.sourceDigest === approval?.sourceDigest
      && candidateSummary.candidateDigest === approval?.candidateDigest
    ),
    confirmationCurrent: Boolean(
      teacherConfirmation
      && !teacherConfirmation._invalid
      && teacherConfirmation.schemaVersion === 'teacher-confirmation-v1'
      && teacherConfirmation.confirmed === true
      && teacherConfirmation.sourceDigest === approval?.sourceDigest
      && teacherConfirmation.candidateDigest === approval?.candidateDigest
    ),
    approvalCurrent: exactApprovalReceipt(
      savedApproval,
      approval,
      'web-import-review-approval-v1',
    ),
    qaCurrent: exactApprovalReceipt(
      qaReceipt,
      approval,
      'web-import-review-qa-accepted-v1',
    ),
    publicationCurrent: exactApprovalReceipt(
      publicationReceipt,
      approval,
      'universal-nck1-local-publication-v1',
    ),
    acceptanceCurrent: false,
    latestCurrent: false,
    publicationCommitted: false,
    shippedCurrent: false,
  }
  receiptState.publicationCurrent = receiptState.publicationCurrent
    && Number.isInteger(publicationReceipt.assetVersion)
    && publicationReceipt.assetVersion > 0
    && publicationReceipt.versionName === `v${publicationReceipt.assetVersion}`
    && typeof publicationReceipt.canonicalPublicationDigest === 'string'
  receiptState.acceptanceCurrent = receiptState.candidateCurrent
    && receiptState.confirmationCurrent
    && receiptState.approvalCurrent
    && receiptState.qaCurrent
  receiptState.latestCurrent = receiptState.publicationCurrent
    && !latestAsset?._invalid
    && latestAsset?.paper?.paperId === paperId
    && latestAsset?.paper?.assetVersion === publicationReceipt.assetVersion
  const publicationInspection = receiptState.publicationCurrent
    ? inspectPublicationReceipt({
        dbPath,
        paperAssetsDir,
        paperId,
        receipt: publicationReceipt,
      })
    : { current: false, code: null, message: null }
  receiptState.publicationCommitted = publicationInspection.current
  receiptState.shippedCurrent = Boolean(
    paper.shipped
    && receiptState.publicationCommitted
    && exactApprovalReceipt(
      shippedReceipt,
      approval,
      'nck1-import-shipped-v1',
    )
    && shippedReceipt.paperId === paperId
    && shippedReceipt.assetVersion === publicationReceipt?.assetVersion
    && shippedReceipt.versionName === publicationReceipt?.versionName
    && shippedReceipt.canonicalPublicationDigest
      === publicationReceipt?.canonicalPublicationDigest,
  )
  const blockers = []
  for (const [receipt, code, label] of [
    [qaReceipt, 'qa_receipt_invalid', 'signals/qa-accepted.json'],
    [publicationReceipt, 'publication_receipt_invalid', 'signals/locally-published.json'],
  ]) {
    if (receipt?._invalid) blockers.push({ code, message: `${label} is not valid JSON` })
  }
  if (paper.shippedReceiptInvalid) {
    blockers.push({
      code: 'shipped_receipt_invalid',
      message: 'signals/shipped.json is invalid or is not bound to this paper publication',
    })
  }
  const hasReviewStageLocalState = paper.candidate
    || paper.aiCheck
    || Boolean(qaReceipt)
    || Boolean(publicationReceipt)
    || Boolean(shippedReceipt)
  if (!reviewChecked && hasReviewStageLocalState) {
    blockers.push({
      code: 'review_access_required',
      message: 'Review state was not checked; configure both Import Review origin and Agent token',
    })
  }
  if (reviewChecked && !reviewStatus && (qaReceipt || publicationReceipt)) {
    blockers.push({
      code: 'review_receipt_without_revision',
      message: 'Local approval/publication receipt has no matching Review paper',
    })
  }
  if (reviewStatus?.paperId && reviewStatus.paperId !== paperId) {
    blockers.push({
      code: 'review_paper_mismatch',
      message: 'Review status belongs to a different paperId',
    })
  }
  if (reviewStatus && !paper.config) {
    blockers.push({ code: 'local_config_missing', message: 'Local import config is missing' })
  }
  if (reviewStatus && !paper.source) {
    blockers.push({ code: 'local_source_missing', message: 'Local immutable source is missing' })
  }
  if (reviewStatus && !paper.materialization) {
    blockers.push({
      code: 'local_materialization_missing',
      message: 'Local Source Materialization is missing or invalid',
    })
  }
  if (reviewStatus && !paper.candidate) {
    blockers.push({
      code: 'local_candidate_missing',
      message: 'Local digest-bound Candidate summary is missing or invalid',
    })
  }
  if (reviewStatus && !paper.aiCheck) {
    blockers.push({
      code: 'answer_check_missing',
      message: 'AI Answer Transcription Check is missing or not green',
    })
  }
  if (reviewStatus && qaReceipt && !qaReceipt._invalid && !receiptState.qaCurrent) {
    blockers.push({
      code: 'stale_qa_receipt_ignored',
      message: 'Local QA receipt does not match the current Review approval and was ignored',
    })
  }
  if (
    reviewStatus
    && publicationReceipt
    && !publicationReceipt._invalid
    && !receiptState.publicationCurrent
  ) {
    blockers.push({
      code: 'stale_publication_receipt_ignored',
      message: 'Local publication receipt does not match the current Review approval and was ignored',
    })
  }
  if (receiptState.publicationCurrent && !receiptState.publicationCommitted) {
    blockers.push({
      code: publicationInspection.code,
      message: publicationInspection.message,
    })
  }
  if (
    reviewStatus
    && paper.shipped
    && !receiptState.shippedCurrent
  ) {
    blockers.push({
      code: 'stale_shipped_receipt_ignored',
      message: 'The shipped receipt does not match the current Review approval and publication',
    })
  }
  if (paper.blocked) {
    blockers.push({
      code: paper.blocked.code || 'blocked',
      message: paper.blocked.note || 'The local import is blocked',
    })
  }

  let state = paper.status
  const hardFailure = blockers.some((blocker) => [
    'qa_receipt_invalid',
    'publication_receipt_invalid',
    'shipped_receipt_invalid',
    'review_access_required',
    'review_receipt_without_revision',
    'review_paper_mismatch',
    'local_config_missing',
    'local_source_missing',
    'local_materialization_missing',
    'local_candidate_missing',
    'answer_check_missing',
  ].includes(blocker.code))
  if (reviewStatus?.latest?.state === 'approved' && !receiptState.qaCurrent) state = 'approved'
  if (reviewStatus?.latest?.state === 'approved' && receiptState.publicationCurrent) {
    state = receiptState.acceptanceCurrent
      && receiptState.latestCurrent
      && receiptState.publicationCommitted
      && paper.aiCheck
      ? 'ready_to_ship'
      : 'locally_published'
  }
  if (reviewStatus?.latest?.state === 'awaiting_review') state = 'awaiting_review'
  if (reviewStatus?.latest?.state === 'changes_requested') state = 'changes_requested'
  if (reviewStatus?.rendererStale) state = 'changes_requested'
  if (hardFailure) state = 'failed'
  if (!hardFailure && !paper.blocked && receiptState.shippedCurrent) state = 'shipped'
  if (paper.blocked) state = 'failed'

  return {
    schemaVersion: 'nck1-import-agent-preflight-v1',
    paperId,
    state,
    local: {
      source: paper.source,
      materialization: paper.materialization,
      candidate: paper.candidate,
      answerCheck: paper.aiCheck,
      qaAccepted: paper.qaAccepted,
      locallyPublished: paper.locallyPublished,
      latest: paper.latest,
      shipped: paper.shipped,
      shippedReceiptInvalid: paper.shippedReceiptInvalid,
      blocked: Boolean(paper.blocked),
    },
    review: {
      checked: reviewChecked,
      exists: Boolean(reviewStatus),
      latestRevisionId: reviewStatus?.latestRevisionId || null,
      latestState: reviewStatus?.latest?.state || null,
      rendererStale: reviewStatus?.rendererStale === true,
      unresolvedCount: Number(reviewStatus?.unresolvedCount || 0),
      approvalId: approval?.approvalId || null,
    },
    receipts: receiptState,
    blockers,
    next: nextStep(state, paper, reviewStatus, receiptState),
    production: {
      pushAllowed: false,
      reason: 'Preflight never grants production authorization; require a current explicit Owner ship command and the separate ship checklist',
    },
  }
}

export function shipPrompt(paper) {
  if (paper.status === 'ready_to_ship') {
    return { kind: 'ship', say: `上线 ${paper.paperId}` }
  }
  if (paper.status === 'failed' && paper.blocked?.code === 'ship_failed') {
    return { kind: 'retry', say: `重试上线 ${paper.paperId}` }
  }
  if (paper.status === 'shipped') {
    return { kind: 'done', say: null }
  }
  return { kind: 'not_ready', say: null }
}

export function qaLinks(paper, appOrigin) {
  const origin = appOrigin.replace(/\/$/, '')
  const screen = `${origin}/?view=paper-browse&paperId=${encodeURIComponent(paper.paperId)}`
  if (!paper.latest) {
    return {
      screen: null,
      studentPrint: null,
      teacherPrint: null,
      note: '本地尚未 publish（无 latest），Screen / Print 入口不可用。',
    }
  }
  return {
    screen,
    studentPrint: screen,
    teacherPrint: `${screen}&lecture=1`,
    note: 'Screen 打开消费端整卷预览。Student / Teacher Print 走同一消费端共享渲染：将该卷入草稿卷后切换学生版 / 教师版。本后台不另造卷面、不对答案。',
  }
}
