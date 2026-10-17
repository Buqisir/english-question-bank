#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import {
  chmodSync,
  createReadStream,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { tmpdir } from 'node:os'
import tls from 'node:tls'

import {
  inspectPublicationReceipt,
  preflightPaper,
} from '../../import-ops/lib/probe.mjs'
import { releaseShippingGuard } from './ship-checklist.mjs'
import { materializeNck1CanonicalRequest } from '../../server/paper-canonical/nck1MaterializationCanonicalRequest.mjs'
import { loadCanonicalImportRequest } from '../../server/paper-canonical/importRequest.mjs'
import { createFileSystemCanonicalPublicationStore, loadCanonicalOnlyConsumers } from '../../server/paper-canonical/publication.mjs'
import { readSourceReferencePublication } from '../../server/paper-import/sourceReferencePublication.mjs'
import {
  ocrReviewBundleDigest,
  reviewBundleDigest,
  validateAgentOcrCorrectionReceipt,
} from '../../server/import-review/importReviewStore.mjs'
import {
  buildNck1OcrReviewProjection,
  buildNck1ReviewProjection,
  loadNck1ReviewSource,
  importNck1ReviewCandidate,
  ocrReviewBundleFilePaths,
  reviewBundleFilePaths,
  resolveReviewFile,
  validateAgentOcrCorrectionSidecar,
} from '../../server/import-review/revisionProjection.mjs'
import { compileNck1MaterializationCandidatePreview, importCanonicalCandidate } from '../../shared/paper-canonical/compiler.mjs'
import { validateInlineBlankTextBoundaries } from '../../shared/paper-canonical/inlineBlankBoundaries.mjs'
import { buildPreprocessingReport } from '../../server/paper-import/preprocessingReport.mjs'
import {
  prepareSpellingReview,
  summarizeSpellingReview,
  SPELLING_REVIEW_FILE,
  SPELLING_REVIEW_INSTRUCTIONS,
  TEXT_REVIEW_POLICY,
  TEXT_REVIEW_INSTRUCTIONS,
  TEXT_REVIEW_POLICY_V2,
  TEXT_REVIEW_INSTRUCTIONS_V2,
  TEXT_REVIEW_POLICY_V4,
  TEXT_REVIEW_INSTRUCTIONS_V4,
} from '../../server/paper-import/spellingReview.mjs'
import {
  enumerateParagraphSummaryTargets,
  validateParagraphSummaries,
} from '../../server/paper-import-ai/paragraphSummaries.mjs'
import {
  finalizePublicSearchMetadata,
  preparePublicSearchMetadataRequest,
  validatePublicSearchMetadata,
} from '../../server/paper-import-ai/publicSearchMetadata.mjs'
import { publishUniversalNck1Import } from '../../server/paper-import/publisher.mjs'
import { digestJson, sha256, stableStringify } from '../../shared/paper-canonical/stable.mjs'
import { assertNotNck1SourceOnly } from './nck1-source-only.mjs'
import { resolveReviewOrigin } from './review-target.mjs'
import { buildPrintHtml } from '../../server/print-renderer.mjs'
import { prepareListeningWaveform } from '../../server/paper-import/listeningWaveform.mjs'
import { LISTENING_REVIEW_FILE, listeningReviewSubject, validateListeningReview, readListeningReview } from '../../server/paper-import/listeningReview.mjs'
import { applyListeningInstructionCorrection, correctedListeningCount, LISTENING_INSTRUCTION_CORRECTION_FILE, LISTENING_INSTRUCTION_CORRECTION_POLICY } from '../../server/paper-import/listeningInstructionCorrection.mjs'
import { LISTENING_WAVEFORM_FILE } from '../../shared/paper-canonical/listeningWaveform.mjs'
import { LISTENING_AUDIO_PATHS } from '../../server/paper-import/listeningAudioEvidence.mjs'
import {
  renderReviewDiagnosticEdition,
  renderReviewFixedEdition,
} from '../../server/import-review/reviewPagination.mjs'
import { closeChromiumPool } from '../../server/draft-paper/chromiumPool.mjs'
import { fixedPageLayoutPolicy } from '../../server/draft-paper/fixedPagePdfPlanner.mjs'
import { STUDENT_PRODUCT_EDITIONS, studentProductPolicy } from '../../server/draft-paper/studentProductPdf.mjs'
import { assertApplicationGivenOwnership } from './lib-nck1-new-paper-locks.mjs'
import {
  FIXED_PAGINATION_EDITIONS,
  PAPER_PAGINATION_PLAN_FILE_NAME,
  economyPageLimitForPlan,
  validatePaperPaginationPlan,
} from '../../server/paper-import/paginationPlan.mjs'

const root = path.resolve(import.meta.dirname, '../..')
const papersRoot = path.join(import.meta.dirname, 'papers')

// OpenSSL 3.5+ adds a post-quantum hybrid key share by default; the larger ClientHello spans
// several TCP segments and some proxy paths reset most such handshakes to the Review host.
if (tls.DEFAULT_ECDH_CURVE === 'auto') tls.DEFAULT_ECDH_CURVE = 'X25519:P-256:P-384'

function fail(message) {
  throw new Error(message)
}

function option(name) {
  const index = process.argv.indexOf(name)
  return index < 0 ? null : process.argv[index + 1] ?? null
}

function paperDirectory(paperId) {
  if (!/^paper-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(paperId || '')) {
    fail('A valid paperId is required')
  }
  return path.join(papersRoot, paperId)
}

function origin() {
  return resolveReviewOrigin(root)
}

function token() {
  const value = String(process.env.QUESTION_BANK_IMPORT_OPS_AGENT_TOKEN || '')
  if (!value) fail('QUESTION_BANK_IMPORT_OPS_AGENT_TOKEN or QUESTION_BANK_IMPORT_OPS_AGENT_USERNAME is required')
  return value
}

function shippingToken() {
  const value = String(process.env.QUESTION_BANK_IMPORT_OPS_SHIP_TOKEN || '')
  if (!value) fail('QUESTION_BANK_IMPORT_OPS_SHIP_TOKEN is required for promotion')
  if (value === String(process.env.QUESTION_BANK_IMPORT_OPS_AGENT_TOKEN || '')) {
    fail('Import Agent and shipping tokens must be different')
  }
  return value
}

const AGENT_KEYCHAIN_SERVICE = 'eqbank-import-agent'
let agentSessionCookie = null

function agentUsername() {
  return String(process.env.QUESTION_BANK_IMPORT_OPS_AGENT_USERNAME || '').trim()
}

function agentPassword(username) {
  const supplied = String(process.env.QUESTION_BANK_IMPORT_OPS_AGENT_PASSWORD || '')
  if (supplied) return supplied
  try {
    return execFileSync('security', ['find-generic-password', '-a', username, '-s', AGENT_KEYCHAIN_SERVICE, '-w'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).replace(/\n$/u, '')
  } catch {
    return fail(`import_agent ${username} needs QUESTION_BANK_IMPORT_OPS_AGENT_PASSWORD or Keychain item ${AGENT_KEYCHAIN_SERVICE}`)
  }
}

// The server accepts the shared Agent bearer token or an import_agent web session for the
// same Agent routes. A session never carries shipping authority; promotion still needs its token.
async function agentCredentialHeaders(targetOrigin) {
  const username = agentUsername()
  if (process.env.QUESTION_BANK_IMPORT_OPS_AGENT_TOKEN || !username) return { authorization: `Bearer ${token()}` }
  if (!agentSessionCookie) {
    const response = await fetch(`${targetOrigin}/api/auth/login`, {
      method: 'POST',
      redirect: 'error',
      headers: { 'content-type': 'application/json', origin: targetOrigin },
      body: JSON.stringify({ username, password: agentPassword(username) }),
    })
    const body = await response.json().catch(() => null)
    if (!response.ok) fail(`import_agent login failed: ${response.status} ${body?.error || ''}`.trim())
    if (body?.user?.accountKind !== 'import_agent') fail(`${username} is not an import_agent account`)
    const session = response.headers.getSetCookie()
      .map((cookie) => /^eqb_session=([^;]+)/u.exec(cookie)?.[1]).find(Boolean)
    if (!session) fail('import_agent login returned no session cookie')
    agentSessionCookie = `eqb_session=${session}`
  }
  return { cookie: agentSessionCookie, origin: targetOrigin }
}

function publicationCapabilityPath(paperId) {
  if (!/^paper-[a-zA-Z0-9-]+$/.test(paperId || '')) fail('Publication requires a valid paperId')
  return path.join(root, 'data', 'import-publication-requests', `${paperId}.json`)
}

function exactApprovalIdentity(approval, paperId) {
  if (!approval || approval.paperId !== paperId) fail('The latest renderer-current Candidate has no exact Owner approval')
  return {
    approvalId: approval.approvalId,
    revisionId: approval.revisionId,
    sourceDigest: approval.sourceDigest,
    candidateDigest: approval.candidateDigest,
    visibleStructureDigest: approval.visibleStructureDigest,
    analysisDigest: approval.analysisDigest,
    ...(approval.importProfile ? {
      importProfile: approval.importProfile,
      paragraphSummariesDigest: approval.paragraphSummariesDigest,
      publicSearchMetadataDigest: approval.publicSearchMetadataDigest,
    } : {}),
    bundleDigest: approval.bundleDigest,
  }
}

async function api(
  pathname,
  init = {},
  { allowNotFound = false, binary = false, credential = 'agent' } = {},
) {
  const targetOrigin = origin()
  const credentialHeaders = credential === 'shipping'
    ? { authorization: `Bearer ${shippingToken()}` }
    : await agentCredentialHeaders(targetOrigin)
  const response = await fetch(`${targetOrigin}${pathname}`, {
    ...init,
    redirect: 'error',
    headers: {
      ...credentialHeaders,
      ...(init.headers || {}),
    },
  })
  const contentType = response.headers.get('content-type') || ''
  if (binary && response.ok) {
    return {
      bytes: Buffer.from(await response.arrayBuffer()),
      contentType,
    }
  }
  const body = contentType.includes('application/json')
    ? await response.json()
    : await response.text()
  if (
    allowNotFound
    && response.status === 404
    && body?.code === 'IMPORT_REVIEW_NOT_FOUND'
  ) return null
  if (!response.ok) {
    fail(`${response.status} ${body?.code || ''} ${body?.error || body || 'Review API failed'}`.trim())
  }
  return body
}

function producerBuildId() {
  if (process.env.QUESTION_BANK_BUILD_ID) return process.env.QUESTION_BANK_BUILD_ID
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
    }).trim()
  } catch {
    return 'unknown-build'
  }
}

function fileDescriptors(paperDir, files = reviewBundleFilePaths(paperDir)) {
  return files.map((file) => {
    const bytes = readFileSync(resolveReviewFile(paperDir, file.path))
    return {
      ...file,
      sha256: sha256(bytes),
      byteLength: bytes.byteLength,
    }
  })
}

async function uploadReviewBundle(paperDir, manifest) {
  const created = await api('/api/import-agent-reviews/revisions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(manifest),
  })
  for (const relativePath of created.missingFiles || []) {
    const file = manifest.files.find((candidate) => candidate.path === relativePath)
    if (!file) fail(`Server requested an unknown file: ${relativePath}`)
    await api(
      `/api/import-agent-reviews/revisions/${encodeURIComponent(created.revision.id)}`
        + `/files?path=${encodeURIComponent(relativePath)}`,
      {
        method: 'PUT',
        headers: {
          'content-length': String(file.byteLength),
          'content-type': file.mediaType,
        },
        body: readFileSync(resolveReviewFile(paperDir, relativePath)),
      },
    )
  }
  return api(
    `/api/import-agent-reviews/revisions/${encodeURIComponent(created.revision.id)}/finalize`,
    { method: 'POST' },
  )
}

function reviewManifest(paperDir, projection, resolvesIssueIds = [], buildId = producerBuildId(), approvedBaseRevisionId) {
  const initializationPath = path.join(paperDir, 'signals', 'source-intake-initialization.json')
  const initialization = existsSync(initializationPath)
    ? JSON.parse(readFileSync(initializationPath, 'utf8'))
    : null
  if (initialization && initialization.paperId !== projection.paperId) {
    fail('Source-intake initialization receipt paperId does not match the Review workspace')
  }
  const restorePath = path.join(paperDir, 'signals', 'review-restore.json')
  const restore = existsSync(restorePath) ? requiredJson(restorePath, 'Review restore binding') : null
  if (restore && (restore.schemaVersion !== 'review-restore-v1'
    || restore.paperId !== projection.paperId || restore.origin !== origin()
    || !/^rev-[a-zA-Z0-9-]+$/.test(restore.revisionId || '')
    || !/^sha256:[a-f0-9]{64}$/.test(restore.bundleDigest || '')
    || (initialization?.baseRevisionId && initialization.baseRevisionId !== restore.revisionId))) {
    fail('Review restore origin, paper, or base revision differs; reconcile before submitting a repair')
  }
  const expectedBaseRevisionId = approvedBaseRevisionId === undefined
    ? restore?.revisionId || initialization?.baseRevisionId
    : approvedBaseRevisionId
  const manifest = {
    schemaVersion: projection.importProfile
      ? (projection.ocrCorrectionReport ? 'web-import-review-bundle-v3' : 'web-import-review-bundle-v2')
      : 'web-import-review-bundle-v1',
    paperId: projection.paperId,
    paperName: projection.paperName,
    ...(expectedBaseRevisionId
      ? { expectedBaseRevisionId }
      : {}),
    sourceDigest: projection.sourceDigest,
    candidateDigest: projection.candidateDigest,
    visibleStructureDigest: projection.visibleStructureDigest,
    ...(projection.importProfile
      ? {
          importProfile: projection.importProfile,
          paragraphSummariesDigest: projection.paragraphSummariesDigest,
          publicSearchMetadataDigest: projection.publicSearchMetadataDigest,
          ...(projection.analysisDigest ? { analysisDigest: projection.analysisDigest } : {}),
          ...(projection.ocrCorrectionReport ? {
            ocrCorrectionReportVersion: projection.ocrCorrectionReport.schemaVersion,
            ocrCorrectionReportDigest: digestJson(projection.ocrCorrectionReport),
          } : {}),
        }
      : { analysisDigest: projection.analysisDigest }),
    producerBuildId: buildId,
    files: fileDescriptors(paperDir),
    resolvesIssueIds,
  }
  return { ...manifest, bundleDigest: reviewBundleDigest(manifest) }
}

function resolvedIssueIds() {
  return String(option('--resolves') || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
}

async function linkThread(paperId) {
  const threadId = option('--thread')
  const expectedThreadId = option('--from') || null
  const valid = value => /^T-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value || '')
  if (!valid(threadId) || (expectedThreadId !== null && !valid(expectedThreadId))
    || (process.argv.includes('--from') && !expectedThreadId)) fail('link-thread requires --thread T-id and optional --from T-id')
  console.log(JSON.stringify(await api(`/api/import-agent-reviews/papers/${encodeURIComponent(paperId)}/discussion-thread`, {
    method: 'PUT', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ threadId, expectedThreadId }),
  }), null, 2))
}

async function pushRevision(paperId) {
  const paperDir = paperDirectory(paperId)
  const projection = buildNck1ReviewProjection(paperDir, { requireAnalyses: true })
  const boundaryIssues = validateInlineBlankTextBoundaries(projection.compilation.artifacts.canonicalPaper.questionGroups)
  if (boundaryIssues.length) fail(JSON.stringify(boundaryIssues, null, 2))
  const manifest = reviewManifest(paperDir, projection, resolvedIssueIds())
  const finalized = await uploadReviewBundle(paperDir, manifest)
  console.log(JSON.stringify({
    paperId,
    revisionId: finalized.revision.id,
    revisionNumber: finalized.revision.revisionNumber,
    state: finalized.revision.state,
    bundleDigest: finalized.revision.bundleDigest,
    ...(projection.spellingReviewSummary ? { spellingReview: projection.spellingReviewSummary } : {}),
  }, null, 2))
}

async function paginationQa(paperId) {
  const paperDir = paperDirectory(paperId)
  const edition = option('--edition')
  if (!FIXED_PAGINATION_EDITIONS.includes(edition)) {
    fail(`pagination-qa requires --edition ${FIXED_PAGINATION_EDITIONS.join('|')}`)
  }
  const breakOption = option('--break-slots')
  const coverOption = option('--cover-gaps')
  const pageLimitOption = option('--economy-page-limit')
  const productLayoutOption = option('--product-layout')
  const product = STUDENT_PRODUCT_EDITIONS.includes(edition)
  if (pageLimitOption !== null && (edition !== 'economy8' || pageLimitOption !== '9')) {
    fail('--economy-page-limit supports only the explicitly permitted economy8 nine-page ceiling')
  }
  if (productLayoutOption !== null && (pageLimitOption !== '9' || breakOption === null)) {
    fail('--product-layout requires --edition economy8 --economy-page-limit 9 --break-slots')
  }
  if (product && coverOption !== null) fail('New student products retain the title and omit administrative notices; --cover-gaps is not supported')
  const explicitEdit = breakOption !== null || coverOption !== null
  if (process.argv.includes('--auto') && explicitEdit) {
    fail('--auto cannot be combined with --break-slots or --cover-gaps')
  }
  const outputDir = path.resolve(option('--output') || path.join(paperDir, 'pagination-qa', edition))
  mkdirSync(outputDir, { recursive: true })
  const rasterize = (pdfPath, prefix) => {
    for (const name of readdirSync(outputDir)) {
      if (name.startsWith(`${prefix}-`) && name.endsWith('.png')) {
        rmSync(path.join(outputDir, name))
      }
    }
    execFileSync('pdftoppm', ['-png', '-r', '120', pdfPath, path.join(outputDir, prefix)])
    return readdirSync(outputDir)
      .filter((name) => name.startsWith(`${prefix}-`) && name.endsWith('.png'))
      .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
  }
  let projection
  let policy
  let slotByGroup = new Map()
  try {
    projection = buildNck1ReviewProjection(paperDir, { requireAnalyses: true })
    assertApplicationGivenOwnership(projection.compilation.artifacts.canonicalPaper.questionGroups
      .find(group => group.variant.family === 'application-writing'))
    const sourceHasListening = projection.paginationSlotBindings.some((entry) =>
      entry.familyContractId === 'listening')
    const listeningCount = projection.paginationSlotBindings.filter((entry) =>
      entry.familyContractId === 'listening').length
    const economyPageLimit = pageLimitOption === '9' ? 9 : economyPageLimitForPlan(projection.paginationPlan)
    const productPlanVersion = economyPageLimit === 9 ? 'paper-pagination-plan-v5' : 'paper-pagination-plan-v4'
    const selectedPolicy = product ? studentProductPolicy(edition, listeningCount, { economyPageLimit })
      : fixedPageLayoutPolicy(edition, listeningCount, sourceHasListening)
    policy = { targetPages: selectedPolicy.targetPages, includeListening: selectedPolicy.includeListening, omitCover: selectedPolicy.omitCover }
    let candidatePlan = projection.paginationPlan
    if (explicitEdit) {
      const currentEdition = projection.paginationPlan?.editions?.[edition]
      const productLayout = productLayoutOption === null ? currentEdition?.layout
        : JSON.parse(readFileSync(path.resolve(productLayoutOption), 'utf8'))
      if (product && !productLayout) fail('Run --auto --save-plan before editing product break slots, or supply an explicitly permitted nine-page --product-layout')
      const breakSlotIds = breakOption === null
        ? currentEdition?.breakSlotIds || []
        : String(breakOption).split(',').map((value) => value.trim()).filter(Boolean)
      const coverGapsPt = product ? null : coverOption === null
        ? currentEdition?.coverGapsPt ?? (policy.omitCover ? null : policy.targetPages === 8 ? [0, 18] : [72, 72])
        : coverOption === 'none' || policy.omitCover
          ? null
          : String(coverOption).split(',').map(Number)
      candidatePlan = {
        schemaVersion: product || ['paper-pagination-plan-v4', 'paper-pagination-plan-v5'].includes(projection.paginationPlan?.schemaVersion) ? productPlanVersion : edition.startsWith('long') ? 'paper-pagination-plan-v2'
          : projection.paginationPlan?.schemaVersion || 'paper-pagination-plan-v1',
        paperId: projection.paperId,
        sourceDigest: projection.sourceDigest,
        candidateDigest: projection.candidateDigest,
        editions: {
          ...(projection.paginationPlan?.editions || {}),
          [edition]: {
            ...policy,
            coverGapsPt,
            breakSlotIds,
            allowSplitOptionBank: currentEdition?.allowSplitOptionBank ?? false,
            ...(product ? { layout: productLayout } : {}),
          },
        },
      }
    }
    const useAuto = process.argv.includes('--auto') || !candidatePlan?.editions?.[edition]
    if (!useAuto) {
      candidatePlan = validatePaperPaginationPlan(candidatePlan, {
        paperId: projection.paperId,
        sourceDigest: projection.sourceDigest,
        candidateDigest: projection.candidateDigest,
        slotBindings: projection.paginationSlotBindings,
        sourceHasListening,
      })
    }
    const renderedProjection = useAuto ? { ...projection, paginationPlan: null } : {
      ...projection,
      paginationPlan: candidatePlan,
    }
    const rendered = await renderReviewFixedEdition(renderedProjection, edition, buildPrintHtml, undefined, {
      economyPageLimit, restoreAnswerBoxes: productLayoutOption !== null,
    })
    slotByGroup = new Map(projection.paginationSlotBindings.map(({ groupId, slotId }) => [groupId, slotId]))
    const selectedEdition = useAuto ? {
      ...policy,
      coverGapsPt: product ? null : rendered.coverGapsPt,
      breakSlotIds: rendered.plannedBreakGroupIds.map((groupId) => slotByGroup.get(groupId)),
      allowSplitOptionBank: rendered.allowSplitOptionBank ?? false,
      ...(product ? { layout: rendered.layout } : {}),
      ...(rendered.answerBoxHeightsMm ? { answerBoxHeightsMm: rendered.answerBoxHeightsMm } : {}),
    } : {
      ...candidatePlan.editions[edition],
      allowSplitOptionBank: candidatePlan.editions[edition].allowSplitOptionBank ?? false,
      ...(product ? { layout: rendered.layout } : {}),
    }
    const plan = validatePaperPaginationPlan({
      schemaVersion: product || ['paper-pagination-plan-v4', 'paper-pagination-plan-v5'].includes(candidatePlan?.schemaVersion) ? productPlanVersion : edition.startsWith('long') ? 'paper-pagination-plan-v2'
        : candidatePlan?.schemaVersion || 'paper-pagination-plan-v1',
      paperId: projection.paperId,
      sourceDigest: projection.sourceDigest,
      candidateDigest: projection.candidateDigest,
      editions: { ...(candidatePlan?.editions || {}), [edition]: selectedEdition },
    }, {
      paperId: projection.paperId,
      sourceDigest: projection.sourceDigest,
      candidateDigest: projection.candidateDigest,
      slotBindings: projection.paginationSlotBindings,
      sourceHasListening,
    })
    const pdfPath = path.join(outputDir, `${paperId}-${edition}.pdf`)
    writeFileSync(pdfPath, rendered.pdfBytes)
    const screenshots = rasterize(pdfPath, 'page')
    const report = {
      schemaVersion: 'paper-pagination-qa-report-v1',
      status: 'success',
      paperId,
      sourceDigest: projection.sourceDigest,
      candidateDigest: projection.candidateDigest,
      edition,
      mode: rendered.mode,
      pageCount: rendered.pageCount,
      searchedCandidates: rendered.searchedCandidates,
      selectedPlan: selectedEdition,
      groups: rendered.inspection.map(({ id, type, pages, optionBankPages }) => ({
        groupId: id,
        slotId: slotByGroup.get(id),
        type,
        pages,
        optionBankPages,
      })),
      warnings: {
        crossFaceGroupIds: rendered.crossingGroupIds,
        splitGroupIds: rendered.splitGroupIds,
        splitOptionBankCount: rendered.splitOptionBankCount,
      },
      artifacts: { pdf: path.basename(pdfPath), screenshots },
      pdf: path.basename(pdfPath),
      screenshots,
    }
    writeFileSync(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
    if (process.argv.includes('--save-plan')) {
      const target = path.join(paperDir, PAPER_PAGINATION_PLAN_FILE_NAME)
      const temporary = `${target}.tmp`
      writeFileSync(temporary, `${stableStringify(plan)}\n`)
      renameSync(temporary, target)
    }
    console.log(JSON.stringify({ ...report, outputDir }, null, 2))
  } catch (error) {
    let diagnostic = null
    let diagnosticError = null
    let pdf = null
    let screenshots = []
    if (projection && policy && !product) {
      try {
        diagnostic = await renderReviewDiagnosticEdition(projection, edition, buildPrintHtml)
        const pdfPath = path.join(outputDir, `${paperId}-${edition}-diagnostic-natural.pdf`)
        writeFileSync(pdfPath, diagnostic.pdfBytes)
        pdf = path.basename(pdfPath)
        screenshots = rasterize(pdfPath, 'diagnostic-page')
      } catch (failure) {
        diagnosticError = { code: failure.code || null, message: failure.message }
      }
    }
    const groups = (diagnostic?.inspection || []).map(({ id, type, pages, optionBankPages }) => ({
      groupId: id,
      slotId: slotByGroup.get(id)
        || projection?.paginationSlotBindings.find((entry) => entry.groupId === id)?.slotId
        || null,
      type,
      pages,
      optionBankPages,
    }))
    const failureReport = {
      schemaVersion: 'paper-pagination-qa-failure-report-v1',
      status: 'failure',
      paperId,
      sourceDigest: projection?.sourceDigest || null,
      candidateDigest: projection?.candidateDigest || null,
      edition,
      targetPages: policy?.targetPages ?? null,
      actualPages: error.actualPages ?? diagnostic?.pageCount ?? null,
      searchedCandidates: error.searchedCandidates ?? null,
      error: { code: error.code || null, message: error.message },
      diagnosticError,
      diagnosticPolicy: policy ? {
        ...policy,
        coverGapsPt: policy.omitCover ? null : policy.targetPages === 8 ? [0, 18] : [72, 72],
        allowSplitOptionBank: false,
      } : null,
      slotMapping: projection?.paginationSlotBindings || [],
      groups,
      artifacts: { pdf, screenshots },
      planSaved: false,
    }
    const reportPath = path.join(outputDir, 'failure-report.json')
    writeFileSync(reportPath, `${JSON.stringify(failureReport, null, 2)}\n`)
    throw Object.assign(new Error(`${error.message} Diagnostic report: ${reportPath}`), {
      code: error.code,
    })
  } finally {
    await closeChromiumPool()
  }
}

async function hydrate(paperId) {
  const paperDir = paperDirectory(paperId)
  if (existsSync(paperDir)) fail(`Local paper workspace already exists: ${paperId}`)
  const requestedRevisionId = option('--revision')
  if (process.argv.includes('--revision')
    && (!requestedRevisionId || requestedRevisionId.startsWith('--'))) {
    fail('hydrate --revision requires an exact revision id')
  }
  const status = await api(
    `/api/import-agent-reviews/papers/${encodeURIComponent(paperId)}`,
  )
  const revision = requestedRevisionId && requestedRevisionId !== status.latest?.id
    ? status.revisions?.find((item) => item.id === requestedRevisionId)
    : status.latest
  if (
    revision?.paperId !== paperId
    || revision.reviewKind !== 'candidate'
    || revision.state === 'uploading'
    || !revision.finalizedAt
    || !revision.manifest
    || revision.manifest.paperId !== paperId
  ) fail(`${paperId} has no finalized Candidate revision to hydrate${requestedRevisionId ? `: ${requestedRevisionId}` : ''}`)
  // status.files belongs only to latest. Historical files are checked against
  // their own immutable manifest below, never the current revision's inventory.
  if (
    revision.manifest.bundleDigest !== revision.bundleDigest
    || reviewBundleDigest(revision.manifest) !== revision.bundleDigest
    || (revision.id === status.latest?.id
      && !exactFileDescriptors(revision.manifest.files, status.files || []))
  ) fail('Selected Review revision manifest, file inventory, or bundleDigest does not close')

  mkdirSync(papersRoot, { recursive: true })
  const temporary = mkdtempSync(path.join(papersRoot, '.hydrate-'))
  try {
    for (const file of revision.manifest.files) {
      const downloaded = await api(
        `/api/import-agent-reviews/revisions/${encodeURIComponent(revision.id)}`
          + `/files?path=${encodeURIComponent(file.path)}`,
        {},
        { binary: true },
      )
      if (
        downloaded.bytes.byteLength !== file.byteLength
        || sha256(downloaded.bytes) !== file.sha256
      ) fail(`Hydrated Review file changed in transit: ${file.path}`)
      const filePath = resolveReviewFile(temporary, file.path)
      mkdirSync(path.dirname(filePath), { recursive: true })
      writeFileSync(filePath, downloaded.bytes)
    }
    const projection = buildNck1ReviewProjection(temporary, { requireAnalyses: false })
    const identity = {
      sourceDigest: projection.sourceDigest,
      candidateDigest: projection.candidateDigest,
      visibleStructureDigest: projection.visibleStructureDigest,
      ...(projection.importProfile
        ? {
            importProfile: projection.importProfile,
            paragraphSummariesDigest: projection.paragraphSummariesDigest,
            publicSearchMetadataDigest: projection.publicSearchMetadataDigest,
            ...(projection.analysisDigest ? { analysisDigest: projection.analysisDigest } : {}),
          }
        : { analysisDigest: projection.analysisDigest }),
    }
    for (const [key, value] of Object.entries(identity)) {
      if (revision.manifest[key] !== value) {
        fail(`Hydrated Review ${key} does not match its finalized manifest`)
      }
    }
    const report = projection.ocrCorrectionReport
    if (report) {
      if (digestJson(report) !== revision.manifest.ocrCorrectionReportDigest) {
        fail('Hydrated OCR correction report does not match its finalized manifest')
      }
      const { receipt } = await api(
        `/api/import-agent-reviews/revisions/${encodeURIComponent(report.ocrRevisionId)}/ocr-confirmation`,
      )
      if (receipt?.schemaVersion !== 'web-import-ocr-review-confirmation-v1'
        || receipt.paperId !== paperId
        || receipt.revisionId !== report.ocrRevisionId
        || receipt.confirmationId !== report.ocrConfirmationId
        || receipt.reviewerKind !== 'import_agent'
        || receipt.sourceSetDigest !== report.originalSourceSetDigest
        || receipt.evidenceDigest !== report.ocrEvidenceDigest
        || receipt.correctionReport?.sourceSetDigest !== report.originalSourceSetDigest
        || !receipt.confirmation) {
        fail('Hydrated OCR receipt does not match the exact historical correction binding')
      }
      // Recover server-held evidence, never recreate an approval or transfer
      // the previous worker's source-intake lease. This is outside the bundle.
      const receiptPath = path.join(temporary, 'signals', 'agent-proofreading-receipt.json')
      mkdirSync(path.dirname(receiptPath), { recursive: true })
      writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
    }
    const restorePath = path.join(temporary, 'signals', 'review-restore.json')
    mkdirSync(path.dirname(restorePath), { recursive: true })
    writeFileSync(restorePath, `${JSON.stringify({
      schemaVersion: 'review-restore-v1', paperId, origin: origin(),
      revisionId: revision.id, bundleDigest: revision.bundleDigest,
    }, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
    renameSync(temporary, paperDir)
  } catch (error) {
    rmSync(temporary, { recursive: true, force: true })
    throw error
  }
  console.log(JSON.stringify({
    paperId,
    revisionId: revision.id,
    bundleDigest: revision.bundleDigest,
    files: revision.manifest.files.length,
    state: 'hydrated',
  }, null, 2))
}

async function cleanupPlan(paperId) {
  const paperDir = paperDirectory(paperId)
  const revisionId = option('--revision')
  if (!/^rev-[a-f0-9-]{36}$/.test(revisionId || '')) fail('cleanup-plan requires --revision with an exact finalized Candidate')
  if (!existsSync(paperDir) || lstatSync(paperDir).isSymbolicLink()
    || realpathSync(paperDir) !== path.join(realpathSync(papersRoot), paperId)) {
    fail('Cleanup inventory requires an existing non-symlink paper workspace')
  }
  const status = await api(`/api/import-agent-reviews/papers/${encodeURIComponent(paperId)}`)
  const revision = status.revisions?.find(item => item.id === revisionId) || (status.latest?.id === revisionId ? status.latest : null)
  if (!revision || revision.paperId !== paperId || revision.reviewKind !== 'candidate'
    || revision.state === 'uploading' || !revision.finalizedAt || !revision.manifest
    || revision.manifest.paperId !== paperId || reviewBundleDigest(revision.manifest) !== revision.bundleDigest) {
    fail('Cleanup inventory requires an exact finalized Candidate with a closed manifest')
  }
  const tracked = new Set(execFileSync('git', ['ls-files', '-z', '--', path.relative(root, paperDir)],
    { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean).map(file => path.resolve(root, file)))
  const manifest = new Map(revision.manifest.files.map(file => [file.path, file]))
  const files = []
  async function inspect(directory) {
    for (const name of readdirSync(directory).sort()) {
      const filePath = path.join(directory, name)
      const info = lstatSync(filePath)
      const relative = path.relative(paperDir, filePath).split(path.sep).join('/')
      if (info.isDirectory()) { await inspect(filePath); continue }
      if (!info.isFile()) { files.push({ path: relative, preserve: 'symlink_or_special_file' }); continue }
      const hash = createHash('sha256')
      for await (const chunk of createReadStream(filePath)) hash.update(chunk)
      const digest = `sha256:${hash.digest('hex')}`
      const expected = manifest.get(relative)
      const after = lstatSync(filePath)
      const changed = info.ino !== after.ino || info.size !== after.size || info.mtimeMs !== after.mtimeMs
      files.push({ path: relative, byteLength: info.size, sha256: digest,
        allocatedBytes: info.blocks * 512, linkCount: info.nlink,
        preserve: tracked.has(filePath) ? 'git_tracked' : changed ? 'changed_during_inventory'
          : !expected ? 'outside_remote_manifest'
            : expected.sha256 !== digest || expected.byteLength !== info.size ? 'differs_from_remote_manifest' : null })
    }
  }
  await inspect(paperDir)
  console.log(JSON.stringify({
    schemaVersion: 'paper-local-cleanup-plan-v1', paperId, revisionId, bundleDigest: revision.bundleDigest,
    origin: origin(), directory: paperDir, mode: 'inspection_only', eligibleForDeletion: false,
    blockers: ['remote_bytes_and_product_reads_not_verified', 'independent_backup_and_restore_not_proven',
      'task_ownership_and_safe_stop_not_confirmed', 'bounded_deletion_not_authorized',
      ...(files.some(file => file.preserve) ? ['preserved_local_files_require_reconciliation'] : []),
      ...(status.revisions?.some(item => item.state === 'uploading') ? ['uploading_revision_requires_reconciliation'] : [])],
    matchingUntrackedBytes: files.filter(file => !file.preserve).reduce((sum, file) => sum + file.byteLength, 0),
    // Shared inodes and APFS clones mean logical lengths are not reclaimable space.
    reclaimableBytes: null, files,
  }, null, 2))
}

async function pushOcrReview(paperId) {
  const paperDir = paperDirectory(paperId)
  const projection = buildNck1OcrReviewProjection(paperDir)
  const input = {
    schemaVersion: 'web-import-ocr-review-bundle-v1',
    paperId: projection.paperId,
    paperName: projection.paperName,
    sourceSetDigest: projection.sourceSetDigest,
    evidenceDigest: projection.evidenceDigest,
    reviewStructureDigest: projection.reviewStructureDigest,
    producerBuildId: producerBuildId(),
    files: fileDescriptors(paperDir, ocrReviewBundleFilePaths(paperDir)),
  }
  const manifest = { ...input, bundleDigest: ocrReviewBundleDigest(input) }
  const finalized = await uploadReviewBundle(paperDir, manifest)
  console.log(JSON.stringify({
    paperId,
    revisionId: finalized.revision.id,
    revisionNumber: finalized.revision.revisionNumber,
    state: finalized.revision.state,
    reviewKind: 'ocr',
    bundleDigest: finalized.revision.bundleDigest,
  }, null, 2))
}

async function proofreadOcr(paperId) {
  const revisionId = option('--revision')
  const inputPath = option('--input')
  if (!revisionId || !inputPath) fail('proofread-ocr requires --revision and --input')
  const projection = buildNck1OcrReviewProjection(paperDirectory(paperId))
  const input = JSON.parse(readFileSync(path.resolve(inputPath), 'utf8'))
  const reviewStatus = await api(`/api/import-agent-reviews/papers/${encodeURIComponent(paperId)}`)
  if (reviewStatus.latestRevisionId !== revisionId) fail('Only the current exact OCR revision may be proofread')
  const revision = reviewStatus.revisions.find((entry) => entry.id === revisionId)
  if (!revision || revision.manifest.sourceSetDigest !== projection.sourceSetDigest
    || revision.manifest.evidenceDigest !== projection.evidenceDigest) fail('OCR revision does not match local evidence')
  const result = await api(
    `/api/import-agent-reviews/papers/${encodeURIComponent(paperId)}/revisions/${encodeURIComponent(revisionId)}/proofread-ocr`,
    { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...input, bundleDigest: revision.bundleDigest }) },
  )
  console.log(JSON.stringify({ paperId, revisionId, reviewerKind: result.receipt.reviewerKind,
    confirmationId: result.receipt.confirmationId,
    nextCommand: `node scripts/import-pipeline/review.mjs pull-ocr-confirmation ${paperId} --revision ${revisionId}`,
  }, null, 2))
}

async function pullOcrConfirmation(paperId) {
  const paperDir = paperDirectory(paperId)
  const projection = buildNck1OcrReviewProjection(paperDir)
  const reviewStatus = await api(
    `/api/import-agent-reviews/papers/${encodeURIComponent(paperId)}`,
  )
  const revisionId = option('--revision') || reviewStatus.latestRevisionId
  if (!revisionId) fail(`${paperId} has no OCR review revision`)
  const result = await api(
    `/api/import-agent-reviews/revisions/${encodeURIComponent(revisionId)}/ocr-confirmation`,
  )
  if (
    result.receipt?.paperId !== paperId
    || result.receipt?.sourceSetDigest !== projection.sourceSetDigest
    || result.receipt?.evidenceDigest !== projection.evidenceDigest
  ) fail('Web OCR confirmation no longer matches the local immutable source evidence')
  if (result.receipt.reviewerKind === 'import_agent') {
    const reportPath = path.join(paperDir, 'signals', 'agent-proofreading-receipt.json')
    mkdirSync(path.dirname(reportPath), { recursive: true })
    const bytes = `${JSON.stringify(result.receipt, null, 2)}\n`
    if (existsSync(reportPath) && readFileSync(reportPath, 'utf8') !== bytes) {
      fail('Existing Agent proofreading receipt differs; preserve it and reconcile')
    }
    if (!existsSync(reportPath)) writeFileSync(reportPath, bytes, { flag: 'wx' })
  }
  const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'eqb-ocr-confirmation-'))
  try {
    const temporaryPath = path.join(temporaryRoot, 'confirmation.json')
    writeFileSync(temporaryPath, `${JSON.stringify(result.confirmation, null, 2)}\n`)
    execFileSync(
      process.execPath,
      [path.join(import.meta.dirname, 'universal-nck1.mjs'), 'confirm-ocr', paperId, temporaryPath],
      { cwd: root, stdio: 'inherit' },
    )
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
}

function finalizeOcrCorrectionReport(paperId) {
  const paperDir = paperDirectory(paperId)
  const inputPath = option('--input')
  if (!inputPath) fail('finalize-ocr-correction-report requires --input <entries.json>')
  const receiptPaths = [
    path.join(paperDir, 'signals', 'agent-proofreading-receipt.json'),
    path.join(paperDir, 'materialization', 'agent-proofreading-receipt.json'),
  ]
  const receiptPath = receiptPaths.find(existsSync)
  if (!receiptPath) fail('Exact saved Agent OCR confirmation receipt is required')
  const receipt = requiredJson(receiptPath, 'Agent OCR confirmation receipt')
  if (receipt.reviewerKind !== 'import_agent' || !receipt.correctionReport) {
    fail('Saved receipt is not an Agent OCR confirmation')
  }
  const authored = requiredJson(path.resolve(inputPath), 'authored OCR correction entries')
  if (!Array.isArray(authored.entries)) fail('Authored OCR correction report requires entries[]')
  const loaded = loadNck1ReviewSource(paperDir)
  const imported = importCanonicalCandidate(loaded.sourceInput)
  if (!imported.candidate || imported.issues.length) fail('Materialization must pass before preparing its report')
  const preview = compileNck1MaterializationCandidatePreview(imported.candidate)
  if (!preview.compilation) fail('Candidate must compile before preparing its report')
  const report = {
    schemaVersion: 'agent-ocr-correction-report-v2',
    paperId,
    sourceDigest: preview.candidate.source.sha256,
    candidateDigest: preview.candidate.candidateDigest,
    ocrRevisionId: receipt.revisionId,
    ocrConfirmationId: receipt.confirmationId,
    originalSourceSetDigest: receipt.sourceSetDigest,
    ocrEvidenceDigest: receipt.evidenceDigest,
    entries: authored.entries,
  }
  const materialization = JSON.parse(new TextDecoder().decode(loaded.sourceInput.materializationBytes))
  validateAgentOcrCorrectionSidecar(report, {
    materialization,
    paperId, documents: loaded.manifest.documents,
    sourceDocuments: loaded.sourceInput.documents,
    sourceDigest: report.sourceDigest, candidateDigest: report.candidateDigest,
  })
  validateAgentOcrCorrectionReceipt(report, receipt, materialization)
  const target = path.join(paperDir, 'agent-ocr-correction-report-v2.json')
  if (existsSync(target)) fail(`OCR correction report already exists: ${target}`)
  writeFileSync(target, `${stableStringify(report)}\n`, { flag: 'wx' })
  console.log(JSON.stringify({ paperId, entries: report.entries.length, reportDigest: digestJson(report), output: target }, null, 2))
}

async function status(paperId) {
  const result = await api(
    `/api/import-agent-reviews/papers/${encodeURIComponent(paperId)}`,
  )
  console.log(JSON.stringify(result, null, 2))
}

async function preflight(paperId) {
  paperDirectory(paperId)
  const configuredOrigin = String(process.env.QUESTION_BANK_IMPORT_OPS_ORIGIN || '').trim()
  const configuredToken = String(process.env.QUESTION_BANK_IMPORT_OPS_AGENT_TOKEN || '').trim() || agentUsername()
  if (Boolean(configuredOrigin) !== Boolean(configuredToken)) {
    fail(
      'Preflight requires both QUESTION_BANK_IMPORT_OPS_ORIGIN and an Agent credential '
        + '(QUESTION_BANK_IMPORT_OPS_AGENT_TOKEN or _USERNAME), or neither while materializing locally',
    )
  }
  const reviewChecked = Boolean(configuredOrigin && configuredToken)
  const reviewStatus = reviewChecked
    ? await api(
      `/api/import-agent-reviews/papers/${encodeURIComponent(paperId)}`,
      {},
      { allowNotFound: true },
    )
    : null
  console.log(JSON.stringify(preflightPaper({
    repoRoot: root,
    paperId,
    reviewStatus,
    reviewChecked,
  }), null, 2))
}

function verifyAnalyses(paperId) {
  const config = requiredJson(path.join(paperDirectory(paperId), 'config.json'), 'config.json')
  if (config.importProfile === 'public-paper-v1') {
    fail('public-paper-v1 does not use teaching analyses; run verify-summaries instead')
  }
  const projection = buildNck1ReviewProjection(
    paperDirectory(paperId),
    { requireAnalyses: true },
  )
  console.log(JSON.stringify({
    paperId,
    stagedInputs: 9,
    previewSidecars: Object.keys(projection.analysisSidecars).sort(),
    analysisDigest: projection.analysisDigest,
    status: 'ready_for_review_push',
  }, null, 2))
}

function listeningInstructionCorrection(paperId, command) {
  const paperDir = paperDirectory(paperId)
  const loaded = loadNck1ReviewSource(paperDir, { preparingListeningCorrection: command !== 'verify-listening-instruction-correction' })
  const raw = JSON.parse(new TextDecoder().decode(loaded.sourceInput.materializationBytes))
  const playback = loaded.sourceInput.listeningAudio
  const original = loaded.listeningAudioEvidence?.descriptors.find(file => file.role === 'listening_audio_original')
  if (!playback || !original || loaded.analyzedPackage) fail('Correction requires captured raw-source audio')
  if (command === 'prepare-listening-instruction-correction') {
    const output = option('--output')
    const slotId = option('--slot')
    const playCount = Number(option('--count'))
    const instruction = raw.sourcePresentation?.instructions.find(item => item.slotId === slotId)
    if (!output || !instruction || !['listening.short-dialogue', 'listening.long-form'].includes(slotId)) {
      fail('prepare-listening-instruction-correction requires --slot <listening slot> --count 1|2 --output <request.json>')
    }
    const groups = raw.listening.transcript.filter(group => group.questionNumbers.every(number => slotId === 'listening.short-dialogue' ? number <= 5 : number >= 6))
      .sort((a, b) => Math.min(...a.questionNumbers) - Math.min(...b.questionNumbers))
    writeFileSync(path.resolve(output), `${JSON.stringify({
      instructions: 'Attest each complete nonoverlapping recording occurrence in this section. Embed original evidence JSON verbatim with byte length, SHA, exact windows and actual settings. Repeated ASR output is not recording repetition. This is an instruction-count correction, not OCR or Owner approval. Do not change original documents or audio.',
      transcript: groups,
      report: { schemaVersion: 'listening-instruction-correction-v1', policy: LISTENING_INSTRUCTION_CORRECTION_POLICY,
        paperId, materializationSha256: sha256(loaded.sourceInput.materializationBytes), transcriptDigest: digestJson(raw.listening.transcript),
        originalAudioSha256: original.sha256, playbackAudioSha256: playback.sha256, durationSeconds: playback.durationSeconds,
        reviewedBy: 'import_agent', reviewedAt: null, method: 'asr_source_comparison', untrustedContentHandledAsData: true,
        evidence: [], instructions: [{ slotId, source: instruction.source, before: instruction.text,
          after: correctedListeningCount(instruction.text, playCount), playCount, reason: '',
          groups: groups.map(group => ({ segmentId: group.segmentId, occurrences: [] })) }],
      },
    }, null, 2)}\n`, { flag: 'wx' })
    console.log('PREPARED count-only correction; no review attested or source changed')
    return
  }
  if (command === 'finalize-listening-instruction-correction') {
    const input = option('--input')
    if (!input) fail('finalize-listening-instruction-correction requires --input <correction.json>')
    loaded.sourceInput.listeningInstructionCorrectionBytes = new Uint8Array(readFileSync(path.resolve(input)))
  }
  const bytes = loaded.sourceInput.listeningInstructionCorrectionBytes
  if (!bytes) fail('No listening instruction correction exists')
  const corrected = applyListeningInstructionCorrection(loaded.sourceInput.materializationBytes, bytes, playback)
  if (corrected.correction.originalAudioSha256 !== original.sha256) fail('Original audio binding differs')
  const imported = importCanonicalCandidate(loaded.sourceInput)
  if (!imported.candidate || imported.issues.length) fail(imported.issues[0]?.message || 'Invalid corrected Candidate')
  const preview = compileNck1MaterializationCandidatePreview(imported.candidate)
  if (!preview.compilation) fail(preview.unresolvedIssues?.[0]?.message || 'Corrected Candidate does not compile')
  if (command === 'finalize-listening-instruction-correction') {
    const active = path.join(paperDir, LISTENING_INSTRUCTION_CORRECTION_FILE)
    if (existsSync(active)) {
      const previous = readFileSync(active)
      if (sha256(previous) !== sha256(bytes)) {
        const historyDir = path.join(paperDir, 'listening-instruction-correction-history')
        mkdirSync(historyDir, { recursive: true })
        const history = path.join(historyDir, `${sha256(previous).slice(7)}.json`)
        if (existsSync(history)) {
          if (sha256(readFileSync(history)) !== sha256(previous)) fail('Retained instruction correction changed')
        } else writeFileSync(history, previous, { flag: 'wx' })
      }
    }
    writeFileSync(active, bytes)
  }
  console.log(JSON.stringify({ paperId, validation: 'PASS', sourceDigest: imported.candidate.source.sha256,
    candidateDigest: imported.candidate.candidateDigest, correctionDigest: sha256(bytes),
    corrections: corrected.correction.instructions.map(({ slotId, before, after }) => ({ slotId, before, after })),
    next: 'New Candidate: rebind answer checks, summaries, metadata and navigation review; regenerate frozen PDFs in a fresh working copy before a new Review.',
    revision: 'not_submitted', publication: null }, null, 2))
}

function listeningReview(paperId, command) {
  const paperDir = paperDirectory(paperId)
  const loaded = loadNck1ReviewSource(paperDir)
  const input = command === 'finalize-listening-review' ? option('--input') : null
  if (command === 'finalize-listening-review' && !input) fail('finalize-listening-review requires --input <review.json>')
  const authoredBytes = input ? readFileSync(path.resolve(input)) : null
  const expectedDigest = option('--candidate-digest') || (authoredBytes
    ? JSON.parse(authoredBytes.toString('utf8'))?.subject?.candidateDigest : null)
  const imported = importNck1ReviewCandidate(paperDir, loaded, expectedDigest)
  if (!imported.candidate || imported.issues.length) fail(imported.issues[0]?.message || 'Invalid listening Candidate')
  const subject = listeningReviewSubject(loaded, imported.candidate)
  const transcript = loaded.materialization.listening.transcript
  if (command === 'prepare-listening-review') {
    const output = option('--output')
    if (!output) fail('prepare-listening-review requires --output <request.json>')
    writeFileSync(path.resolve(output), `${JSON.stringify({
      instructions: 'Review every source group for identity, order, completeness and nontruncating playback. Reuse retained local ASR; do not treat missing markers as mismatch, signal candidates as verified, overlap as repetition, or ASR as direct listening/safety certification. Usable means teacher navigation, not verbatim certification. Keep material uncertainty review_required or blocked; retain nonmaterial doubts in limits. Bind every occurrence to retained evidence. Never invent an attestation.',
      transcript,
      sourceInstructions: loaded.materialization.sourcePresentation?.instructions || [],
      report: {
        schemaVersion: 'listening-review-v1', subject, reviewedBy: 'import_agent', reviewedAt: null,
        method: 'asr_source_comparison', untrustedContentHandledAsData: true,
        scope: { purpose: 'teacher_navigation', verbatim: 'not_certified', wholeRecordingContent: 'not_certified' },
        evidence: [],
        groups: [...transcript].sort((a, b) => Math.min(...a.questionNumbers) - Math.min(...b.questionNumbers))
          .map(group => ({ segmentId: group.segmentId, questionNumbers: group.questionNumbers,
            decision: 'review_required', reason: '尚未审阅', limits: [], playback: null, occurrences: [] })),
      },
      evidenceDescriptor: { path: 'listening-review-evidence/window-000.json', sha256: 'sha256:<actual digest>',
        byteLength: '<actual bytes>', kind: 'asr_window', window: { startSeconds: 0, endSeconds: '<actual end>' },
        settings: { engine: '<actual engine/version>', model: '<actual checkpoint>', language: '<actual language>',
          vad: '<actual boolean>', computeType: '<actual compute type>' } },
    }, null, 2)}\n`, { flag: 'wx' })
    console.log(`PREPARED listening review for ${paperId}; no ASR or attestation performed`)
    return
  }
  let validated
  if (command === 'finalize-listening-review') {
    const bytes = authoredBytes
    validated = validateListeningReview(paperDir, JSON.parse(bytes.toString('utf8')), subject, transcript)
    const active = path.join(paperDir, LISTENING_REVIEW_FILE)
    if (existsSync(active)) {
      const previous = readFileSync(active)
      if (sha256(previous) !== sha256(bytes)) {
        const historyDir = path.join(paperDir, 'listening-review-history')
        mkdirSync(historyDir, { recursive: true })
        const history = path.join(historyDir, `${sha256(previous).slice(7)}.json`)
        if (existsSync(history)) {
          if (sha256(readFileSync(history)) !== sha256(previous)) fail('Retained listening history changed')
        } else writeFileSync(history, previous, { flag: 'wx' })
      }
    }
    writeFileSync(active, bytes)
  } else validated = readListeningReview(paperDir, subject, transcript)
  if (!validated) fail('No listening review exists')
  console.log(JSON.stringify({ paperId, validation: 'PASS', scope: validated.review.scope,
    usableGroups: validated.review.groups.filter(group => group.decision === 'usable').length,
    unresolvedGroups: validated.review.groups.filter(group => group.decision !== 'usable').map(group => group.segmentId),
    semanticJudgment: 'import_agent_attestation', revision: 'not_submitted', publication: null }, null, 2))
}

function spellingReview(paperId, command) {
  const paperDir = paperDirectory(paperId)
  const loaded = loadNck1ReviewSource(paperDir, { preparingSpelling: command !== 'verify-spelling' })
  if (loaded.analyzedPackage) fail('Spelling preprocessing requires a raw-source workspace')
  if (command === 'prepare-spelling') {
    const output = option('--output')
    if (!output) fail('prepare-spelling requires --output <request.json>')
    writeFileSync(path.resolve(output), `${JSON.stringify({
      instructions: loaded.config.spellingReview === TEXT_REVIEW_POLICY_V4 ? TEXT_REVIEW_INSTRUCTIONS_V4
        : loaded.config.spellingReview === TEXT_REVIEW_POLICY ? TEXT_REVIEW_INSTRUCTIONS
        : loaded.config.spellingReview === TEXT_REVIEW_POLICY_V2 ? TEXT_REVIEW_INSTRUCTIONS_V2 : SPELLING_REVIEW_INSTRUCTIONS,
      paperId,
      sourceManifest: loaded.manifest,
      materialization: loaded.materialization,
      report: prepareSpellingReview(loaded.sourceInput.materializationBytes, loaded.config.spellingReview),
    }, null, 2)}\n`, { flag: 'wx' })
    console.log(`PREPARED spelling review for ${paperId}; no review has been attested`)
    return
  }
  if (command === 'finalize-spelling') {
    const input = option('--input')
    if (!input) fail('finalize-spelling requires --input <review.json>')
    loaded.sourceInput.spellingReviewBytes = new Uint8Array(readFileSync(path.resolve(input)))
    if (loaded.config.spellingReview && JSON.parse(new TextDecoder().decode(loaded.sourceInput.spellingReviewBytes)).schemaVersion !== loaded.config.spellingReview) {
      fail('review policy differs from config')
    }
  }
  if (!loaded.sourceInput.spellingReviewBytes) fail('No spelling review exists')
  const imported = importCanonicalCandidate(loaded.sourceInput)
  if (!imported.candidate || imported.issues.length) fail(imported.issues[0]?.message || 'Invalid spelling Candidate')
  const preview = compileNck1MaterializationCandidatePreview(imported.candidate)
  if (!preview.compilation) fail(preview.unresolvedIssues?.[0]?.message || 'Corrected Candidate does not compile')
  if (command === 'finalize-spelling') {
    const activePath = path.join(paperDir, SPELLING_REVIEW_FILE)
    if (existsSync(activePath)) {
      const previous = new Uint8Array(readFileSync(activePath))
      const previousDigest = sha256(previous)
      if (previousDigest !== sha256(loaded.sourceInput.spellingReviewBytes)) {
        const historyDir = path.join(paperDir, 'spelling-review-history')
        mkdirSync(historyDir, { recursive: true })
        const historyPath = path.join(historyDir, `${previousDigest.slice('sha256:'.length)}.json`)
        if (existsSync(historyPath)) {
          if (sha256(new Uint8Array(readFileSync(historyPath))) !== previousDigest) fail('retained review history changed')
        } else writeFileSync(historyPath, previous, { flag: 'wx' })
      }
    }
    writeFileSync(activePath, loaded.sourceInput.spellingReviewBytes)
  }
  const report = JSON.parse(new TextDecoder().decode(loaded.sourceInput.spellingReviewBytes))
  console.log(JSON.stringify({ status: 'PASS', paperId, targets: report.targets.length,
    ...summarizeSpellingReview(report),
    reviewDigest: sha256(loaded.sourceInput.spellingReviewBytes),
    candidateDigest: imported.candidate.candidateDigest,
    semanticJudgment: 'import_agent_attestation',
    next: 'Rebuild answer checks, summaries and search metadata against this Candidate before Review.',
  }, null, 2))
}

async function preprocessingReport(paperId) {
  const evidencePath = option('--evidence')
  const output = option('--output')
  if (!evidencePath || !output) fail('preprocessing-report requires --evidence <evidence.json> --output <report.md>')
  const evidenceFile = path.resolve(evidencePath)
  const projection = buildNck1ReviewProjection(paperDirectory(paperId))
  const evidence = requiredJson(evidenceFile, 'handoff evidence')
  const reviewStatus = evidence.schemaVersion === 'preprocessing-handoff-evidence-v4' && evidence.screen
    ? await api(`/api/import-agent-reviews/papers/${encodeURIComponent(paperId)}`) : null
  const markdown = buildPreprocessingReport(projection, evidence, {
    baseDirectory: path.dirname(evidenceFile), reviewStatus,
  })
  writeFileSync(path.resolve(output), markdown, { flag: 'wx' })
  console.log(JSON.stringify({ paperId, candidateDigest: projection.candidateDigest,
    report: path.resolve(output), reportDigest: sha256(new TextEncoder().encode(markdown)),
    handoff: 'Deliver this single 校正报告与预处理完成表 to Owner; it contains preview links and retained doubts.',
  }, null, 2))
}

function summaryCandidate(paperDir) {
  const loaded = loadNck1ReviewSource(paperDir)
  if (loaded.config.importProfile !== 'public-paper-v1' || loaded.analyzedPackage) {
    fail('Paragraph summaries are only available for raw-source public-paper-v1 workspaces')
  }
  const imported = importNck1ReviewCandidate(paperDir, loaded)
  if (!imported.candidate || imported.issues.length) {
    const issue = imported.issues[0]
    fail(`${issue?.code || 'MATERIALIZATION_INVALID'}: ${issue?.message || 'Candidate derivation failed'}`)
  }
  return { loaded, candidate: imported.candidate }
}

function prepareSummaries(paperId) {
  const paperDir = paperDirectory(paperId)
  const output = option('--output')
  if (!output) fail('prepare-summaries requires --output <request.json>')
  const outputPath = path.resolve(output)
  if (existsSync(outputPath)) fail(`Summary request output already exists: ${outputPath}`)
  const { loaded, candidate } = summaryCandidate(paperDir)
  const targets = enumerateParagraphSummaryTargets(loaded.materialization)
  const targetGroups = new Set(targets.map(({ groupId }) => groupId))
  const request = {
    schemaVersion: 'paragraph-summaries-request-v1',
    paperId,
    sourceDigest: candidate.source.sha256,
    candidateDigest: candidate.candidateDigest,
    outputFile: 'paragraph-summaries-v1.json',
    outputSchema: requiredJson(path.join(root, 'schemas/paper-import/paragraph-summaries-v1.schema.json'), 'paragraph summaries schema'),
    prompt: readFileSync(path.join(root, 'prompts/paragraph-summaries-v1.md'), 'utf8'),
    groups: loaded.materialization.groups
      .filter(({ groupId }) => targetGroups.has(groupId))
      .map((group) => ({
        groupId: group.groupId,
        sourceGroup: structuredClone(group),
        authoritativeAnswers: structuredClone(loaded.materialization.answers),
        targets: targets.filter((target) => target.groupId === group.groupId),
      })),
  }
  mkdirSync(path.dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, `${JSON.stringify(request, null, 2)}\n`, { flag: 'wx' })
  console.log(JSON.stringify({ paperId, sourceDigest: request.sourceDigest, candidateDigest: request.candidateDigest, targetCount: targets.length, output: outputPath }, null, 2))
}

function verifySummaries(paperId) {
  const paperDir = paperDirectory(paperId)
  const { loaded, candidate } = summaryCandidate(paperDir)
  const sidecar = requiredJson(path.join(paperDir, 'paragraph-summaries-v1.json'), 'paragraph-summaries-v1.json')
  const issues = validateParagraphSummaries({ sidecar, materialization: loaded.materialization, sourceDigest: candidate.source.sha256, candidateDigest: candidate.candidateDigest })
  if (issues.length) fail(`${issues[0].code}: ${issues[0].message}`)
  const bytes = readFileSync(path.join(paperDir, 'paragraph-summaries-v1.json'))
  console.log(JSON.stringify({ paperId, importProfile: loaded.config.importProfile, paragraphSummariesDigest: sha256(bytes), summaries: enumerateParagraphSummaryTargets(loaded.materialization).length, status: 'summaries_verified' }, null, 2))
}

function prepareSearchMetadata(paperId) {
  const paperDir = paperDirectory(paperId)
  const output = option('--output')
  if (!output) fail('prepare-search-metadata requires --output <request.json>')
  const outputPath = path.resolve(output)
  if (existsSync(outputPath)) fail(`Search metadata request output already exists: ${outputPath}`)
  const { loaded, candidate } = summaryCandidate(paperDir)
  const request = preparePublicSearchMetadataRequest({
    materialization: loaded.materialization,
    sourceDigest: candidate.source.sha256,
    candidateDigest: candidate.candidateDigest,
  })
  request.prompt = readFileSync(path.join(root, 'prompts/public-search-metadata-v1.md'), 'utf8')
  mkdirSync(path.dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, `${JSON.stringify(request, null, 2)}\n`, { flag: 'wx' })
  console.log(JSON.stringify({ paperId, ...request.binding, groups: request.sourceGroups.length, output: outputPath }, null, 2))
}

function finalizeSearchMetadata(paperId) {
  const paperDir = paperDirectory(paperId)
  const input = option('--input')
  if (!input) fail('finalize-search-metadata requires --input <authored.json>')
  const target = path.join(paperDir, 'public-search-metadata-v1.json')
  if (existsSync(target)) fail(`Public search metadata already exists: ${target}`)
  const { loaded, candidate } = summaryCandidate(paperDir)
  const authored = requiredJson(path.resolve(input), 'authored search metadata')
  const sidecar = finalizePublicSearchMetadata({
    authored,
    materialization: loaded.materialization,
    sourceDigest: candidate.source.sha256,
    candidateDigest: candidate.candidateDigest,
  })
  const bytes = Buffer.from(`${stableStringify(sidecar)}\n`)
  writeFileSync(target, bytes, { flag: 'wx' })
  console.log(JSON.stringify({ paperId, publicSearchMetadataDigest: sha256(bytes), groups: sidecar.groups.length, status: 'search_metadata_finalized' }, null, 2))
}

function verifySearchMetadata(paperId) {
  const paperDir = paperDirectory(paperId)
  const { loaded, candidate } = summaryCandidate(paperDir)
  const filePath = path.join(paperDir, 'public-search-metadata-v1.json')
  const sidecar = requiredJson(filePath, 'public-search-metadata-v1.json')
  const issues = validatePublicSearchMetadata({ sidecar, materialization: loaded.materialization, sourceDigest: candidate.source.sha256, candidateDigest: candidate.candidateDigest })
  if (issues.length) fail(`${issues[0].code}: ${issues[0].message}`)
  console.log(JSON.stringify({ paperId, publicSearchMetadataDigest: sha256(readFileSync(filePath)), groups: sidecar.groups.length, status: 'search_metadata_verified' }, null, 2))
}

async function reply(paperId, issueId) {
  const message = option('--message')
  if (!issueId || !message) fail('reply requires <paperId> <issueId> --message <text>')
  const result = await api(
    `/api/import-agent-reviews/papers/${encodeURIComponent(paperId)}`
      + `/issues/${encodeURIComponent(issueId)}/messages`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message }),
    },
  )
  console.log(JSON.stringify({
    paperId: result.paperId,
    issueId,
    messages: result.issueMessages.filter((item) => item.issueId === issueId),
  }, null, 2))
}

function exactFileDescriptors(localFiles, approvedFiles) {
  const comparable = (files) => files
    .map(({ path: filePath, sha256: digest, byteLength, mediaType, role }) => ({
      path: filePath,
      sha256: digest,
      byteLength,
      mediaType,
      role,
    }))
    .sort((left, right) => left.path.localeCompare(right.path))
  return stableStringify(comparable(localFiles)) === stableStringify(comparable(approvedFiles))
}

async function approvedLocalReview(paperId) {
  const paperDir = paperDirectory(paperId)
  const status = await api(
    `/api/import-agent-reviews/papers/${encodeURIComponent(paperId)}`,
  )
  const approval = status.approval
  if (!approval || status.latest?.state !== 'approved') {
    fail(`${paperId} has no current approved revision`)
  }
  const projection = buildNck1ReviewProjection(paperDir, { requireAnalyses: true })
  for (const [actual, expected, label] of [
    [projection.sourceDigest, approval.sourceDigest, 'sourceDigest'],
    [projection.candidateDigest, approval.candidateDigest, 'candidateDigest'],
    [projection.visibleStructureDigest, approval.visibleStructureDigest, 'visibleStructureDigest'],
    ...(projection.importProfile
      ? [
          [projection.importProfile, approval.importProfile, 'importProfile'],
          [projection.paragraphSummariesDigest, approval.paragraphSummariesDigest, 'paragraphSummariesDigest'],
          [projection.publicSearchMetadataDigest, approval.publicSearchMetadataDigest, 'publicSearchMetadataDigest'],
          ...(projection.analysisDigest
            ? [[projection.analysisDigest, approval.analysisDigest, 'analysisDigest']]
            : []),
        ]
      : [[projection.analysisDigest, approval.analysisDigest, 'analysisDigest']]),
  ]) {
    if (actual !== expected) fail(`Local ${label} no longer matches web approval`)
  }
  const localManifest = reviewManifest(
    paperDir,
    projection,
    status.latest.manifest.resolvesIssueIds || [],
    approval.producerBuildId,
    status.latest.manifest.expectedBaseRevisionId || null,
  )
  if (
    !exactFileDescriptors(localManifest.files, status.latest.manifest.files)
    || localManifest.bundleDigest !== approval.bundleDigest
  ) fail('Local review bundle no longer matches web approval')
  return { paperDir, status, approval, projection }
}

async function accept(paperId) {
  const {
    paperDir,
    approval,
    projection,
  } = await approvedLocalReview(paperId)

  const confirmation = {
    schemaVersion: 'teacher-confirmation-v1',
    candidateDigest: projection.candidateDigest,
    sourceDigest: projection.sourceDigest,
    confirmed: true,
  }
  const materialized = materializeNck1CanonicalRequest(projection.sourceInput, confirmation)
  const outputDir = path.join(paperDir, 'canonical-evidence')
  rmSync(outputDir, { recursive: true, force: true })
  mkdirSync(outputDir, { recursive: true })
  writeFileSync(path.join(outputDir, 'candidate-summary.json'), `${JSON.stringify({
    paperId,
    sourceDigest: projection.sourceDigest,
    candidateDigest: projection.candidateDigest,
  }, null, 2)}\n`)
  writeFileSync(
    path.join(outputDir, 'web-review-approval-v1.json'),
    `${JSON.stringify(approval, null, 2)}\n`,
  )
  for (const [fileName, bytes] of materialized.outputs) {
    writeFileSync(path.join(outputDir, fileName), bytes)
  }
  const signalsDir = path.join(paperDir, 'signals')
  mkdirSync(signalsDir, { recursive: true })
  writeFileSync(path.join(signalsDir, 'qa-accepted.json'), `${JSON.stringify({
    schemaVersion: 'web-import-review-qa-accepted-v1',
    acceptedAt: approval.approvedAt,
    by: approval.approvedBy,
    approvalId: approval.approvalId,
    revisionId: approval.revisionId,
    sourceDigest: approval.sourceDigest,
    candidateDigest: approval.candidateDigest,
    visibleStructureDigest: approval.visibleStructureDigest,
    analysisDigest: approval.analysisDigest,
    ...(approval.importProfile
      ? {
          importProfile: approval.importProfile,
          paragraphSummariesDigest: approval.paragraphSummariesDigest,
          publicSearchMetadataDigest: approval.publicSearchMetadataDigest,
        }
      : {}),
    bundleDigest: approval.bundleDigest,
  }, null, 2)}\n`)
  console.log(`ACCEPTED ${paperId}: exact web approval materialized; no publish or deployment was run`)
}

function requiredJson(filePath, label) {
  if (!existsSync(filePath)) fail(`${label} is missing; run review.mjs accept first`)
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'))
  } catch {
    fail(`${label} is not valid JSON`)
  }
}

function assertAcceptedReceipts(paperDir, approval, projection) {
  const evidenceDir = path.join(paperDir, 'canonical-evidence')
  const qaAccepted = requiredJson(
    path.join(paperDir, 'signals', 'qa-accepted.json'),
    'signals/qa-accepted.json',
  )
  const webApproval = requiredJson(
    path.join(evidenceDir, 'web-review-approval-v1.json'),
    'canonical-evidence/web-review-approval-v1.json',
  )
  const confirmation = requiredJson(
    path.join(evidenceDir, 'teacher-confirmation-v1.json'),
    'canonical-evidence/teacher-confirmation-v1.json',
  )
  if (qaAccepted.schemaVersion !== 'web-import-review-qa-accepted-v1') {
    fail('signals/qa-accepted.json has an unsupported schemaVersion')
  }
  for (const [actual, expected, label] of [
    [qaAccepted.approvalId, approval.approvalId, 'qa approvalId'],
    [qaAccepted.revisionId, approval.revisionId, 'qa revisionId'],
    [qaAccepted.sourceDigest, approval.sourceDigest, 'qa sourceDigest'],
    [qaAccepted.candidateDigest, approval.candidateDigest, 'qa candidateDigest'],
    [qaAccepted.visibleStructureDigest, approval.visibleStructureDigest, 'qa visibleStructureDigest'],
    [qaAccepted.analysisDigest, approval.analysisDigest, 'qa analysisDigest'],
    ...(approval.importProfile
      ? [
          [qaAccepted.importProfile, approval.importProfile, 'qa importProfile'],
          [qaAccepted.paragraphSummariesDigest, approval.paragraphSummariesDigest, 'qa paragraphSummariesDigest'],
          [qaAccepted.publicSearchMetadataDigest, approval.publicSearchMetadataDigest, 'qa publicSearchMetadataDigest'],
        ]
      : []),
    [qaAccepted.bundleDigest, approval.bundleDigest, 'qa bundleDigest'],
  ]) {
    if (actual !== expected) fail(`${label} no longer matches current web approval`)
  }
  if (stableStringify(webApproval) !== stableStringify(approval)) {
    fail('Saved web approval no longer matches current web approval')
  }
  const expectedConfirmation = {
    schemaVersion: 'teacher-confirmation-v1',
    candidateDigest: projection.candidateDigest,
    sourceDigest: projection.sourceDigest,
    confirmed: true,
  }
  if (stableStringify(confirmation) !== stableStringify(expectedConfirmation)) {
    fail('Saved Teacher Confirmation no longer matches the approved local Candidate')
  }
  const answerCheck = requiredJson(
    path.join(paperDir, 'signals', 'ai-answer-check.json'),
    'signals/ai-answer-check.json',
  )
  if (answerCheck.ok !== true) fail('AI Answer Transcription Check has not passed')
  return {
    qaAccepted,
    canonicalRequest: loadCanonicalImportRequest(
      path.join(evidenceDir, 'canonical-import-request.json'),
    ),
  }
}

function publicationReceiptMatchesApproval(receipt, approval) {
  return receipt?.schemaVersion === 'universal-nck1-local-publication-v1'
    && receipt.approvalId === approval.approvalId
    && receipt.revisionId === approval.revisionId
    && receipt.sourceDigest === approval.sourceDigest
    && receipt.candidateDigest === approval.candidateDigest
    && receipt.visibleStructureDigest === approval.visibleStructureDigest
    && receipt.analysisDigest === approval.analysisDigest
    && (!approval.importProfile || (
      receipt.importProfile === approval.importProfile
      && receipt.paragraphSummariesDigest === approval.paragraphSummariesDigest
      && receipt.publicSearchMetadataDigest === approval.publicSearchMetadataDigest
    ))
    && receipt.bundleDigest === approval.bundleDigest
    && Number.isInteger(receipt.assetVersion)
    && receipt.assetVersion > 0
    && receipt.versionName === `v${receipt.assetVersion}`
    && typeof receipt.canonicalPublicationDigest === 'string'
}

async function publish(paperId) {
  const {
    paperDir,
    status,
    approval,
    projection,
  } = await approvedLocalReview(paperId)
  const { canonicalRequest } = assertAcceptedReceipts(
    paperDir,
    approval,
    projection,
  )
  const dbPath = process.env.QUESTION_BANK_DB
    || path.join(root, 'data/question-bank.sqlite')
  const paperAssetsDir = process.env.QUESTION_BANK_PAPER_ASSET_ROOT
    || path.join(root, 'app/public/paper-assets')
  const receiptPath = path.join(paperDir, 'signals', 'locally-published.json')
  const existingReceipt = existsSync(receiptPath)
    ? requiredJson(receiptPath, 'signals/locally-published.json')
    : null
  const db = new DatabaseSync(dbPath, { readOnly: false })
  try {
    if (existingReceipt?.approvalId === approval.approvalId) {
      if (
        !publicationReceiptMatchesApproval(existingReceipt, approval)
        || !inspectPublicationReceipt({
          db,
          paperAssetsDir,
          paperId,
          receipt: existingReceipt,
        }).current
      ) fail('Existing local publication receipt does not match approval or committed current state')
      const consumers = loadCanonicalOnlyConsumers({
        ref: { paperId, versionName: existingReceipt.versionName, sourceAssetVersion: existingReceipt.assetVersion,
          publicationDigest: existingReceipt.canonicalPublicationDigest },
        store: createFileSystemCanonicalPublicationStore({ rootDir: paperAssetsDir, db }),
      })
      readSourceReferencePublication({ db, paperAssetsDir, consumption: Object.values(consumers)[0],
        expected: projection.sourceReferencesBytes ? {
          approvalId: approval.approvalId, revisionId: approval.revisionId, bundleDigest: approval.bundleDigest,
          sourceReferencesDigest: projection.sourceReferencesDigest,
        } : null })
      console.log(`ALREADY PUBLISHED ${paperId} ${existingReceipt.versionName}: ready_to_ship; no deployment was run`)
      return
    }
    const result = publishUniversalNck1Import({
      reviewRootDir: paperDir,
      approvedIdentity: approval,
      approvedManifest: status.latest.manifest,
      canonicalRequest,
      db,
      paperAssetsDir,
    })
    if (!result.ok) {
      const diagnostics = result.canonicalAdmission?.diagnostics || []
      fail(diagnostics.map((item) => `${item.code}: ${item.message}`).join('; ')
        || `Universal NCK1 publish failed: ${result.status}`)
    }
    const receipt = {
      schemaVersion: 'universal-nck1-local-publication-v1',
      publishedAt: new Date().toISOString(),
      approvalId: approval.approvalId,
      revisionId: approval.revisionId,
      sourceDigest: approval.sourceDigest,
      candidateDigest: approval.candidateDigest,
      visibleStructureDigest: approval.visibleStructureDigest,
      analysisDigest: approval.analysisDigest,
      ...(approval.importProfile
        ? {
            importProfile: approval.importProfile,
            paragraphSummariesDigest: approval.paragraphSummariesDigest,
            publicSearchMetadataDigest: approval.publicSearchMetadataDigest,
          }
        : {}),
      bundleDigest: approval.bundleDigest,
      assetVersion: result.publish.assetVersion,
      versionName: result.publish.versionName,
      canonicalPublicationDigest: result.publish.canonicalPublicationDigest,
    }
    writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`)
    console.log(`PUBLISHED ${paperId} ${receipt.versionName}: ready_to_ship; no deployment was run`)
  } finally {
    db.close()
  }
}

async function releaseShipGuard(paperId, guardId) {
  if (!guardId || !process.argv.includes('--owner-said-abort-ship')) {
    fail(
      'release-ship-guard requires <paperId> <guardId> --owner-said-abort-ship '
        + 'after confirming the old push process is no longer running',
    )
  }
  const result = await releaseShippingGuard(paperId, guardId)
  console.log(JSON.stringify({ paperId, guardId, ...result }, null, 2))
}

async function promote(paperId) {
  const ship = process.argv.includes('--owner-said-ship')
  const retry = process.argv.includes('--owner-said-retry-ship')
  const allowed = new Set([
    'promote',
    paperId,
    '--owner-said-ship',
    '--owner-said-retry-ship',
  ])
  const unknown = process.argv.slice(2).filter((argument) => !allowed.has(argument))
  if (unknown.length > 0 || ship === retry) {
    fail(
      'promote requires exactly one current Owner authorization flag: '
        + '--owner-said-ship or --owner-said-retry-ship',
    )
  }
  const status = await api(
    `/api/import-agent-reviews/papers/${encodeURIComponent(paperId)}`,
  )
  const identity = exactApprovalIdentity(status.approval, paperId)
  console.log(JSON.stringify({
    action: retry ? 'retry_ship' : 'ship',
    paperId,
    ...identity,
  }, null, 2))
  const result = await api(
    `/api/import-agent-reviews/papers/${encodeURIComponent(paperId)}/promotions`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...identity,
        intent: retry ? 'retry_ship' : 'ship',
      }),
    },
    { credential: 'shipping' },
  )
  console.log(JSON.stringify({
    status: result.status,
    promotion: result.promotion,
    backupBoundary: 'Production R2 backup remains asynchronous and is not part of this receipt.',
  }, null, 2))
}

async function requestPublication(paperId) {
  const revisionId = option('--revision')
  if (!revisionId) fail('request-publication requires --revision <exact preview revision ID>')
  const status = await api(`/api/import-agent-reviews/papers/${encodeURIComponent(paperId)}`)
  if (status.latestRevisionId !== revisionId) fail('--revision must be the exact latest finalized preview revision')
  const target = publicationCapabilityPath(paperId)
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 })
  const lock = `${target}.lock`
  try { mkdirSync(lock, { mode: 0o700 }) } catch (error) {
    if (error.code === 'EEXIST') fail('Publication request is locked; reconcile the existing operation before clearing its lock')
    throw error
  }
  try {
  let capability
  if (existsSync(target)) {
    capability = readPublicationCapability(paperId)
    if (process.argv.includes('--new-request')) {
      const { request } = await api(`/api/import-agent-reviews/publication-requests/${encodeURIComponent(capability.requestId)}`)
      const retired = request.state === 'revoked'
        || (['pending', 'granted'].includes(request.state) && request.expired === true)
        || (request.state === 'consumed' && request.promotion?.state === 'published')
      if (!retired) throw new Error('Existing request is still live or its promotion is unresolved; preserve it and reconcile before renewal')
      const archive = `${target}.${capability.requestId}`
      if (existsSync(archive)) throw new Error('Capability archive already exists; reconcile without overwriting it')
      renameSync(target, archive)
      capability = null
    } else if (capability.revisionId !== revisionId) {
      throw new Error('Existing capability targets another revision; reconcile status then use --new-request after expiry, revocation or published completion')
    }
  }
  if (!capability) {
    capability = { paperId, revisionId, requestId: `publication-request-${randomUUID()}`,
      requestSecret: randomBytes(32).toString('base64url') }
    writeFileSync(target, `${JSON.stringify(capability, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
  }
  chmodSync(target, 0o600)
  const result = await api(`/api/import-agent-reviews/papers/${encodeURIComponent(paperId)}/publication-requests`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ requestId: capability.requestId, revisionId,
      secretHash: sha256(capability.requestSecret), ampThreadId: process.env.AMP_THREAD_ID || undefined }),
  })
  console.log(JSON.stringify({ request: result.request, confirmationUrl: `${origin()}/api/import-reviews/publication-requests/${result.request.requestId}/confirmation`, capabilityFile: target }, null, 2))
  } finally {
    rmSync(lock, { recursive: true })
  }
}

function readPublicationCapability(paperId) {
  const target = publicationCapabilityPath(paperId)
  if (!existsSync(target)) fail(`No local publication capability for ${paperId}`)
  const capability = JSON.parse(readFileSync(target, 'utf8'))
  if (capability.paperId !== paperId || !/^publication-request-[0-9a-f-]{36}$/i.test(capability.requestId || '')
    || !/^[A-Za-z0-9_-]{43}$/.test(capability.requestSecret || '')) fail('Invalid retained publication capability; preserve it for reconciliation')
  return capability
}

async function publicationStatus(paperId) {
  const capability = readPublicationCapability(paperId)
  const result = await api(`/api/import-agent-reviews/publication-requests/${encodeURIComponent(capability.requestId)}`)
  console.log(JSON.stringify(result, null, 2))
}

async function redeemPublication(paperId) {
  const capability = readPublicationCapability(paperId)
  const result = await api(`/api/import-agent-reviews/papers/${encodeURIComponent(paperId)}/publication-requests/${encodeURIComponent(capability.requestId)}/redeem`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ requestSecret: capability.requestSecret }),
  })
  console.log(JSON.stringify({ ...result, backupBoundary: 'Production R2 backup remains asynchronous and is not part of this receipt.' }, null, 2))
}

async function main() {
  const [command, paperId, issueId] = process.argv.slice(2)
  if (!['promote', 'request-publication', 'publication-status', 'redeem-publication'].includes(command)) assertNotNck1SourceOnly(paperId, command)
  if (command === 'push') await pushRevision(paperId)
  else if (['prepare-listening-instruction-correction', 'finalize-listening-instruction-correction', 'verify-listening-instruction-correction'].includes(command)) listeningInstructionCorrection(paperId, command)
  else if (['prepare-listening-review', 'finalize-listening-review', 'verify-listening-review'].includes(command)) listeningReview(paperId, command)
  else if (command === 'prepare-listening-waveform') {
    const root = paperDirectory(paperId)
    const loaded = loadNck1ReviewSource(root)
    const playback = loaded.sourceInput.listeningAudio || loaded.analyzedPackage?.listeningAudio
    if (!playback) fail('Paper has no captured playback audio')
    const playbackPath = loaded.analyzedPackage
      ? loaded.sourceProvenance.members.find((member) => member.role === 'audio').path : LISTENING_AUDIO_PATHS.playback
    const waveform = prepareListeningWaveform(resolveReviewFile(root, LISTENING_WAVEFORM_FILE),
      readFileSync(resolveReviewFile(root, playbackPath)), playback.durationSeconds)
    console.log(JSON.stringify({ paperId, playbackAudioSha256: waveform.playbackAudioSha256,
      waveformSha256: sha256(readFileSync(resolveReviewFile(root, LISTENING_WAVEFORM_FILE))),
      buckets: waveform.peaks.length, path: LISTENING_WAVEFORM_FILE }, null, 2))
  }
  else if (command === 'pagination-qa') await paginationQa(paperId)
  else if (command === 'hydrate') await hydrate(paperId)
  else if (command === 'link-thread') await linkThread(paperId)
  else if (command === 'cleanup-plan') await cleanupPlan(paperId)
  else if (command === 'push-ocr') await pushOcrReview(paperId)
  else if (command === 'proofread-ocr') await proofreadOcr(paperId)
  else if (command === 'pull-ocr-confirmation') await pullOcrConfirmation(paperId)
  else if (command === 'finalize-ocr-correction-report') finalizeOcrCorrectionReport(paperId)
  else if (['prepare-spelling', 'finalize-spelling', 'verify-spelling'].includes(command)) spellingReview(paperId, command)
  else if (command === 'preprocessing-report') await preprocessingReport(paperId)
  else if (command === 'preflight') await preflight(paperId)
  else if (command === 'verify-analyses') verifyAnalyses(paperId)
  else if (command === 'prepare-summaries') prepareSummaries(paperId)
  else if (command === 'verify-summaries') verifySummaries(paperId)
  else if (command === 'prepare-search-metadata') prepareSearchMetadata(paperId)
  else if (command === 'finalize-search-metadata') finalizeSearchMetadata(paperId)
  else if (command === 'verify-search-metadata') verifySearchMetadata(paperId)
  else if (command === 'status') await status(paperId)
  else if (command === 'reply') await reply(paperId, issueId)
  else if (command === 'accept') await accept(paperId)
  else if (command === 'publish') await publish(paperId)
  else if (command === 'promote') await promote(paperId)
  else if (command === 'request-publication') await requestPublication(paperId)
  else if (command === 'publication-status') await publicationStatus(paperId)
  else if (command === 'redeem-publication') await redeemPublication(paperId)
  else if (command === 'release-ship-guard') await releaseShipGuard(paperId, issueId)
  else fail(
    'Usage: review.mjs push <paperId> [--resolves issue-1,issue-2] | '
      + 'prepare-listening-waveform <paperId> (local derivative only; no approval or publication) | '
      + 'prepare-listening-review <paperId> --output <request.json> | finalize-listening-review <paperId> --input <review.json> | verify-listening-review <paperId> | '
      + 'prepare-listening-instruction-correction <paperId> --slot <listening slot> --count 1|2 --output <request.json> | finalize-listening-instruction-correction <paperId> --input <correction.json> | verify-listening-instruction-correction <paperId> | '
      + 'pagination-qa <paperId> --edition largeComplete|largeNoListening|economy8 [--auto | --break-slots a,b] [--economy-page-limit 9 --product-layout layout.json (explicit Owner-permitted economy ceiling)] [--save-plan] [--output dir] (historical friendly8|friendly10|long10|long12 still supported) | hydrate <paperId> [--revision rev-id] | '
      + 'cleanup-plan <paperId> --revision rev-id (inspection only; never deletes or certifies eligibility) | '
      + 'link-thread <paperId> --thread T-id [--from T-id] (explicit discussion handoff only) | '
      + 'push-ocr <paperId> | proofread-ocr <paperId> --revision rev-id --input review.json | pull-ocr-confirmation <paperId> [--revision rev-id] | '
      + 'finalize-ocr-correction-report <paperId> --input <entries.json> | '
      + 'prepare-spelling <paperId> --output <request.json> | finalize-spelling <paperId> --input <review.json> | verify-spelling <paperId> | '
      + 'preprocessing-report <paperId> --evidence <evidence.json> --output <report.md> | '
      + 'preflight <paperId> | verify-analyses <paperId> | prepare-summaries <paperId> --output <request.json> | verify-summaries <paperId> | prepare-search-metadata <paperId> --output <request.json> | finalize-search-metadata <paperId> --input <authored.json> | verify-search-metadata <paperId> | status <paperId> | '
      + 'reply <paperId> <issueId> --message <text> | '
      + 'accept <paperId> | publish <paperId> | '
      + 'promote <paperId> --owner-said-ship|--owner-said-retry-ship | '
      + 'request-publication <paperId> --revision <exact-preview-id> | publication-status <paperId> | redeem-publication <paperId> | '
      + 'release-ship-guard <paperId> <guardId> --owner-said-abort-ship',
  )
}

main().catch((error) => {
  console.error(error.code ? `${error.code}: ${error.message}` : error.message)
  process.exitCode = 1
})
