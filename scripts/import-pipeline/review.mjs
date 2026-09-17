#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { tmpdir } from 'node:os'

import {
  inspectPublicationReceipt,
  preflightPaper,
} from '../../import-ops/lib/probe.mjs'
import { releaseShippingGuard } from './ship-checklist.mjs'
import { materializeNck1CanonicalRequest } from '../../server/paper-canonical/nck1MaterializationCanonicalRequest.mjs'
import { loadCanonicalImportRequest } from '../../server/paper-canonical/importRequest.mjs'
import {
  ocrReviewBundleDigest,
  reviewBundleDigest,
} from '../../server/import-review/importReviewStore.mjs'
import {
  buildNck1OcrReviewProjection,
  buildNck1ReviewProjection,
  loadNck1ReviewSource,
  ocrReviewBundleFilePaths,
  reviewBundleFilePaths,
  resolveReviewFile,
} from '../../server/import-review/revisionProjection.mjs'
import { importCanonicalCandidate } from '../../shared/paper-canonical/compiler.mjs'
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
import { sha256, stableStringify } from '../../shared/paper-canonical/stable.mjs'
import { assertNotNck1SourceOnly } from './nck1-source-only.mjs'
import { buildPrintHtml } from '../../server/print-renderer.mjs'
import {
  renderReviewDiagnosticEdition,
  renderReviewFixedEdition,
} from '../../server/import-review/reviewPagination.mjs'
import { closeChromiumPool } from '../../server/draft-paper/chromiumPool.mjs'
import { fixedPageLayoutPolicy } from '../../server/draft-paper/fixedPagePdfPlanner.mjs'
import { assertApplicationGivenOwnership } from './lib-nck1-new-paper-locks.mjs'
import {
  PAPER_PAGINATION_PLAN_FILE_NAME,
  validatePaperPaginationPlan,
} from '../../server/paper-import/paginationPlan.mjs'

const root = path.resolve(import.meta.dirname, '../..')
const papersRoot = path.join(import.meta.dirname, 'papers')

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
  const value = String(process.env.QUESTION_BANK_IMPORT_OPS_ORIGIN || '').replace(/\/$/, '')
  if (!/^https?:\/\//.test(value)) {
    fail('QUESTION_BANK_IMPORT_OPS_ORIGIN must be an http(s) origin')
  }
  return value
}

function token() {
  const value = String(process.env.QUESTION_BANK_IMPORT_OPS_AGENT_TOKEN || '')
  if (!value) fail('QUESTION_BANK_IMPORT_OPS_AGENT_TOKEN is required')
  return value
}

function shippingToken() {
  const value = String(process.env.QUESTION_BANK_IMPORT_OPS_SHIP_TOKEN || '')
  if (!value) fail('QUESTION_BANK_IMPORT_OPS_SHIP_TOKEN is required for promotion')
  if (value === token()) fail('Import Agent and shipping tokens must be different')
  return value
}

async function api(
  pathname,
  init = {},
  { allowNotFound = false, binary = false, credential = 'agent' } = {},
) {
  const credentialToken = credential === 'shipping' ? shippingToken() : token()
  const response = await fetch(`${origin()}${pathname}`, {
    ...init,
    headers: {
      authorization: `Bearer ${credentialToken}`,
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

function reviewManifest(paperDir, projection, resolvesIssueIds = [], buildId = producerBuildId()) {
  const initializationPath = path.join(paperDir, 'signals', 'source-intake-initialization.json')
  const initialization = existsSync(initializationPath)
    ? JSON.parse(readFileSync(initializationPath, 'utf8'))
    : null
  if (initialization && initialization.paperId !== projection.paperId) {
    fail('Source-intake initialization receipt paperId does not match the Review workspace')
  }
  const manifest = {
    schemaVersion: projection.importProfile
      ? 'web-import-review-bundle-v2'
      : 'web-import-review-bundle-v1',
    paperId: projection.paperId,
    paperName: projection.paperName,
    ...(initialization?.baseRevisionId
      ? { expectedBaseRevisionId: initialization.baseRevisionId }
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

async function pushRevision(paperId) {
  const paperDir = paperDirectory(paperId)
  const projection = buildNck1ReviewProjection(paperDir, { requireAnalyses: true })
  const manifest = reviewManifest(paperDir, projection, resolvedIssueIds())
  const finalized = await uploadReviewBundle(paperDir, manifest)
  console.log(JSON.stringify({
    paperId,
    revisionId: finalized.revision.id,
    revisionNumber: finalized.revision.revisionNumber,
    state: finalized.revision.state,
    bundleDigest: finalized.revision.bundleDigest,
  }, null, 2))
}

async function paginationQa(paperId) {
  const paperDir = paperDirectory(paperId)
  const edition = option('--edition')
  if (!['friendly8', 'friendly10'].includes(edition)) {
    fail('pagination-qa requires --edition friendly8|friendly10')
  }
  const breakOption = option('--break-slots')
  const coverOption = option('--cover-gaps')
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
    policy = fixedPageLayoutPolicy(edition, listeningCount, sourceHasListening)
    let candidatePlan = projection.paginationPlan
    if (explicitEdit) {
      const currentEdition = projection.paginationPlan?.editions?.[edition]
      const breakSlotIds = breakOption === null
        ? currentEdition?.breakSlotIds || []
        : String(breakOption).split(',').map((value) => value.trim()).filter(Boolean)
      const coverGapsPt = coverOption === null
        ? currentEdition?.coverGapsPt ?? (policy.omitCover ? null : edition === 'friendly8' ? [0, 18] : [72, 72])
        : coverOption === 'none' || policy.omitCover
          ? null
          : String(coverOption).split(',').map(Number)
      candidatePlan = {
        schemaVersion: 'paper-pagination-plan-v1',
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
    const rendered = await renderReviewFixedEdition(renderedProjection, edition, buildPrintHtml)
    slotByGroup = new Map(projection.paginationSlotBindings.map(({ groupId, slotId }) => [groupId, slotId]))
    const selectedEdition = useAuto ? {
      ...policy,
      coverGapsPt: rendered.coverGapsPt,
      breakSlotIds: rendered.plannedBreakGroupIds.map((groupId) => slotByGroup.get(groupId)),
      allowSplitOptionBank: rendered.allowSplitOptionBank ?? false,
    } : {
      ...candidatePlan.editions[edition],
      allowSplitOptionBank: candidatePlan.editions[edition].allowSplitOptionBank ?? false,
    }
    const plan = validatePaperPaginationPlan({
      schemaVersion: 'paper-pagination-plan-v1',
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
    if (projection && policy) {
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
      targetPages: policy?.targetPages || (edition === 'friendly8' ? 8 : 10),
      actualPages: error.actualPages ?? diagnostic?.pageCount ?? null,
      searchedCandidates: error.searchedCandidates ?? null,
      error: { code: error.code || null, message: error.message },
      diagnosticError,
      diagnosticPolicy: policy ? {
        ...policy,
        coverGapsPt: policy.omitCover ? null : edition === 'friendly8' ? [0, 18] : [72, 72],
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
  const status = await api(
    `/api/import-agent-reviews/papers/${encodeURIComponent(paperId)}`,
  )
  const revision = status.latest
  if (
    revision?.paperId !== paperId
    || revision.reviewKind !== 'candidate'
    || revision.state === 'uploading'
    || !revision.finalizedAt
    || !revision.manifest
    || revision.manifest.paperId !== paperId
  ) fail(`${paperId} has no finalized Candidate revision to hydrate`)
  if (
    revision.manifest.bundleDigest !== revision.bundleDigest
    || reviewBundleDigest(revision.manifest) !== revision.bundleDigest
    || !exactFileDescriptors(revision.manifest.files, status.files || [])
  ) fail('Latest Review revision manifest, file inventory, or bundleDigest does not close')

  mkdirSync(papersRoot, { recursive: true })
  const temporary = mkdtempSync(path.join(papersRoot, '.hydrate-'))
  try {
    for (const file of revision.manifest.files) {
      const downloaded = await api(
        `/api/import-review-preview/revisions/${encodeURIComponent(revision.id)}`
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

async function status(paperId) {
  const result = await api(
    `/api/import-agent-reviews/papers/${encodeURIComponent(paperId)}`,
  )
  console.log(JSON.stringify(result, null, 2))
}

async function preflight(paperId) {
  paperDirectory(paperId)
  const configuredOrigin = String(process.env.QUESTION_BANK_IMPORT_OPS_ORIGIN || '').trim()
  const configuredToken = String(process.env.QUESTION_BANK_IMPORT_OPS_AGENT_TOKEN || '').trim()
  if (Boolean(configuredOrigin) !== Boolean(configuredToken)) {
    fail(
      'Preflight requires both QUESTION_BANK_IMPORT_OPS_ORIGIN and '
        + 'QUESTION_BANK_IMPORT_OPS_AGENT_TOKEN, or neither while materializing locally',
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

function summaryCandidate(paperDir) {
  const loaded = loadNck1ReviewSource(paperDir)
  if (loaded.config.importProfile !== 'public-paper-v1' || loaded.analyzedPackage) {
    fail('Paragraph summaries are only available for raw-source public-paper-v1 workspaces')
  }
  const imported = importCanonicalCandidate(loaded.sourceInput)
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
    [],
    approval.producerBuildId,
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
      console.log(`ALREADY PUBLISHED ${paperId} ${existingReceipt.versionName}: ready_to_ship; no deployment was run`)
      return
    }
    const result = publishUniversalNck1Import({
      reviewRootDir: paperDir,
      approvedIdentity: approval,
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
  const approval = status.approval
  if (!approval || approval.paperId !== paperId) {
    fail('The latest renderer-current Candidate has no exact Owner approval')
  }
  const identity = {
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
  }
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

async function main() {
  const [command, paperId, issueId] = process.argv.slice(2)
  if (command !== 'promote') assertNotNck1SourceOnly(paperId, command)
  if (command === 'push') await pushRevision(paperId)
  else if (command === 'pagination-qa') await paginationQa(paperId)
  else if (command === 'hydrate') await hydrate(paperId)
  else if (command === 'push-ocr') await pushOcrReview(paperId)
  else if (command === 'pull-ocr-confirmation') await pullOcrConfirmation(paperId)
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
  else if (command === 'release-ship-guard') await releaseShipGuard(paperId, issueId)
  else fail(
    'Usage: review.mjs push <paperId> [--resolves issue-1,issue-2] | '
      + 'pagination-qa <paperId> --edition friendly8|friendly10 [--auto | --break-slots a,b --cover-gaps 54,54] [--save-plan] [--output dir] | hydrate <paperId> | '
      + 'push-ocr <paperId> | pull-ocr-confirmation <paperId> [--revision rev-id] | '
      + 'preflight <paperId> | verify-analyses <paperId> | prepare-summaries <paperId> --output <request.json> | verify-summaries <paperId> | prepare-search-metadata <paperId> --output <request.json> | finalize-search-metadata <paperId> --input <authored.json> | verify-search-metadata <paperId> | status <paperId> | '
      + 'reply <paperId> <issueId> --message <text> | '
      + 'accept <paperId> | publish <paperId> | '
      + 'promote <paperId> --owner-said-ship|--owner-said-retry-ship | '
      + 'release-ship-guard <paperId> <guardId> --owner-said-abort-ship',
  )
}

main().catch((error) => {
  console.error(error.code ? `${error.code}: ${error.message}` : error.message)
  process.exitCode = 1
})
