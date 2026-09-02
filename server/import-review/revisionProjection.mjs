import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import {
  compileNck1MaterializationCandidatePreview,
  importCanonicalCandidate,
} from '../../shared/paper-canonical/compiler.mjs'
import { resolveCanonicalAuthority } from '../../shared/paper-canonical/authority.mjs'
import { consumerContractRefs } from '../../shared/paper-canonical/consumers.mjs'
import { projectCanonicalPaper } from '../../shared/paper-canonical/projector.mjs'
import { decorateProjectedMediaPresentation } from '../../shared/paper-canonical/mediaPresentation.mjs'
import { digestJson, stableStringify } from '../../shared/paper-canonical/stable.mjs'
import {
  assertCanonicalConsumptionVisibleStructure,
  assertCanonicalVisibleStructure,
} from '../../shared/paper-canonical/visibleStructure.mjs'
import {
  buildNck1AnalysisProjection,
  NCK1_STAGED_ANALYSIS_FILES,
} from './nck1AnalysisProjection.mjs'
import {
  NCK1_IMAGE_BUNDLE_MEDIA_TYPE,
  assertNck1ImageBundlePageArtifacts,
} from '../paper-import/nck1ImageSourceBundle.mjs'
import {
  NCK1_OCR_EVIDENCE_FILE_NAME,
  NCK1_OCR_REVIEW_CODES,
  resolveConfirmedNck1OcrEvidence,
  validateNck1OcrSourceEvidence,
} from '../paper-import/nck1OcrSourceEvidence.mjs'
import { assertListeningAudioManifest } from '../paper-import/listeningAudioEvidence.mjs'

function fail(message, code = 'IMPORT_REVIEW_CANDIDATE_INVALID') {
  const error = new Error(message)
  error.code = code
  throw error
}

export function reviewMediaFileName(media) {
  const extension = ({
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
  })[media.mimeType]
  if (!extension) fail(`Unsupported Candidate media type: ${media.mimeType}`)
  return `${media.mediaId.replaceAll(':', '__')}.${extension}`
}

export function reviewMediaCandidateFileName(media) {
  const extension = ({
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
  })[media.publication?.candidate?.mimeType]
  if (!extension) fail(`Unsupported Candidate rendition type: ${media.publication?.candidate?.mimeType}`)
  return `${media.mediaId.replaceAll(':', '__')}--candidate.${extension}`
}

function normalizedRelativePath(value, label) {
  if (
    typeof value !== 'string'
    || !value
    || value.includes('\\')
    || path.posix.isAbsolute(value)
    || path.posix.normalize(value) !== value
    || value.split('/').some((segment) => !segment || segment === '.' || segment === '..')
  ) fail(`${label} has an invalid relative path`, 'IMPORT_REVIEW_PATH_INVALID')
  return value
}

export function resolveReviewFile(rootDir, relativePath, label = 'Review file') {
  const normalized = normalizedRelativePath(relativePath, label)
  const root = path.resolve(rootDir)
  const resolved = path.resolve(root, ...normalized.split('/'))
  if (!resolved.startsWith(`${root}${path.sep}`)) {
    fail(`${label} escapes the revision root`, 'IMPORT_REVIEW_PATH_INVALID')
  }
  return resolved
}

function readJson(filePath, label) {
  if (!existsSync(filePath)) fail(`${label} is missing`)
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'))
  } catch {
    fail(`${label} is not valid JSON`)
  }
}

export function loadNck1ReviewSource(rootDir) {
  const config = readJson(resolveReviewFile(rootDir, 'config.json'), 'config.json')
  const manifest = readJson(
    resolveReviewFile(rootDir, 'universal-source-manifest.json'),
    'universal-source-manifest.json',
  )
  if (
    ![
      'universal-nck1-source-manifest-v1',
      'universal-nck1-source-manifest-v2',
    ].includes(manifest.schemaVersion)
    || manifest.paperId !== config.paperId
    || !Array.isArray(manifest.documents)
  ) fail('Universal NCK1 source manifest is incomplete')
  const validatedListeningAudioEvidence = assertListeningAudioManifest(rootDir, manifest)
  const listeningAudioEvidence = validatedListeningAudioEvidence
    ? {
        descriptors: [...validatedListeningAudioEvidence.descriptors.values()]
          .map((descriptor) => structuredClone(descriptor)),
        asr: structuredClone(validatedListeningAudioEvidence.asr),
        check: structuredClone(validatedListeningAudioEvidence.check),
      }
    : null
  const materializationPath = resolveReviewFile(
    rootDir,
    normalizedRelativePath(manifest.materializationPath, 'materializationPath'),
  )
  if (!existsSync(materializationPath)) fail('Source Materialization is missing')
  const materializationBytes = new Uint8Array(readFileSync(materializationPath))
  let materialization
  try {
    materialization = JSON.parse(new TextDecoder().decode(materializationBytes))
  } catch {
    fail('Source Materialization is not valid JSON')
  }
  if (materialization.listening?.state === 'captured' && !listeningAudioEvidence) {
    fail(
      'Captured listening requires passed audio comparison and content-safety evidence',
      'LISTENING_AUDIO_REVIEW_REQUIRED',
    )
  }
  const documentPathById = new Map(manifest.documents.map((document) => [
    document.documentId,
    resolveReviewFile(rootDir, normalizedRelativePath(document.path, `document ${document.documentId}`)),
  ]))
  for (const document of manifest.documents) {
    if (document.mediaType !== NCK1_IMAGE_BUNDLE_MEDIA_TYPE) continue
    const documentPath = documentPathById.get(document.documentId)
    if (!documentPath || !existsSync(documentPath)) {
      fail(`Image source bundle is unavailable: ${document.documentId}`)
    }
    assertNck1ImageBundlePageArtifacts(
      { ...document, bytes: new Uint8Array(readFileSync(documentPath)) },
      (document.pages || []).map((page) => {
        const pagePath = resolveReviewFile(
          rootDir,
          normalizedRelativePath(page.path, `document ${document.documentId} page ${page.page}`),
        )
        if (!existsSync(pagePath)) {
          fail(`Image source page is unavailable: ${document.documentId}:${page.page}`)
        }
        return { ...page, bytes: new Uint8Array(readFileSync(pagePath)) }
      }),
    )
  }
  const sourceInput = {
    kind: 'nck1-source-materialization',
    materializationBytes,
    documents: materialization.documents.map((document) => {
      const sourcePath = documentPathById.get(document.documentId)
      if (!sourcePath || !existsSync(sourcePath)) {
        fail(`Materialized document is unavailable: ${document.documentId}`)
      }
      return {
        documentId: document.documentId,
        bytes: new Uint8Array(readFileSync(sourcePath)),
      }
    }),
    media: materialization.media.map((media) => {
      const relativePath = path.posix.join(
        normalizedRelativePath(manifest.mediaDirectory, 'mediaDirectory'),
        reviewMediaFileName(media),
      )
      const mediaPath = resolveReviewFile(rootDir, relativePath)
      if (!existsSync(mediaPath)) fail(`Materialized media is unavailable: ${media.mediaId}`)
      if (!media.publication?.candidate) {
        return { mediaId: media.mediaId, bytes: new Uint8Array(readFileSync(mediaPath)) }
      }
      const renditionPath = resolveReviewFile(
        rootDir,
        path.posix.join(
          normalizedRelativePath(manifest.mediaDirectory, 'mediaDirectory'),
          reviewMediaCandidateFileName(media),
        ),
      )
      if (!existsSync(renditionPath)) {
        fail(`Materialized media Candidate is unavailable: ${media.mediaId}`)
      }
      return {
        mediaId: media.mediaId,
        bytes: new Uint8Array(readFileSync(mediaPath)),
        renditionBytes: new Uint8Array(readFileSync(renditionPath)),
      }
    }),
  }
  return { config, manifest, materialization, sourceInput, listeningAudioEvidence }
}

function projectedSourceRegion(manifest, materialization, {
  visualId,
  documentId,
  page,
  region,
  disposition,
  targetId,
}) {
  const sourceDocument = materialization.documents.find((document) =>
    document.documentId === documentId)
  const manifestDocument = manifest.documents.find((document) =>
    document.documentId === documentId)
  if (!sourceDocument || !manifestDocument) {
    fail('Source visual inventory does not resolve to one captured document')
  }
  const sourcePath = normalizedRelativePath(
    manifestDocument.path,
    `document ${sourceDocument.documentId}`,
  )
  const imagePage = sourceDocument.mediaType === NCK1_IMAGE_BUNDLE_MEDIA_TYPE
    ? manifestDocument.pages?.find((candidate) => candidate.page === page)
    : null
  if (sourceDocument.mediaType === NCK1_IMAGE_BUNDLE_MEDIA_TYPE && !imagePage) {
    fail(`Source visual page is unavailable: ${sourceDocument.documentId}:${page}`)
  }
  return {
    visualId,
    documentId: sourceDocument.documentId,
    path: imagePage
      ? normalizedRelativePath(
          imagePage.path,
          `document ${sourceDocument.documentId} page ${page}`,
        )
      : sourcePath,
    sourceDigest: imagePage?.sha256 || sourceDocument.sha256,
    mediaType: imagePage?.mediaType || sourceDocument.mediaType,
    page,
    region: region ? structuredClone(region) : null,
    disposition,
    targetId,
    state: region ? 'paired' : 'unlocated',
  }
}

function sourceVisualProjection(manifest, materialization) {
  const coverage = materialization.sourceCoverage
  const declaredVisuals = coverage.visuals.map((visual) => projectedSourceRegion(
    manifest,
    materialization,
    {
      ...visual,
      documentId: coverage.documentId,
    },
  ))
  const semanticLocators = materialization.groups.flatMap((group) => [
    ...group.blocks.map((block) => ({ targetId: block.blockId, source: block.source })),
    ...group.questions.map((question) => ({
      targetId: question.questionId,
      source: question.source,
    })),
  ]).filter(({ source }) => source?.kind === 'page_region')
  return [
    ...declaredVisuals,
    ...semanticLocators.map(({ targetId, source }) => projectedSourceRegion(
      manifest,
      materialization,
      {
        visualId: `visual:${materialization.paperId}:source-locator:${targetId}`,
        documentId: source.documentId,
        page: source.page,
        region: source.region,
        disposition: 'semantic_text',
        targetId,
      },
    )),
  ]
}

function primarySourceType(materialization) {
  const source = materialization.documents.find((document) =>
    ['question_source', 'question_and_answers'].includes(document.role))
  if (source?.mediaType === NCK1_IMAGE_BUNDLE_MEDIA_TYPE) return 'image'
  return source?.mediaType?.includes('wordprocessingml') ? 'docx' : 'pdf'
}

export function reviewBundleFilePaths(rootDir) {
  const { manifest, materialization } = loadNck1ReviewSource(rootDir)
  const paperAsset = buildNck1CompatibilityPaperAsset({
    config: readJson(resolveReviewFile(rootDir, 'config.json'), 'config.json'),
    materialization,
    sourceAssetVersion: 1,
    primarySourceType: primarySourceType(materialization),
  })
  buildNck1AnalysisProjection({
    rootDir,
    materialization,
    paperAsset,
    required: true,
  })
  return [
    { path: 'config.json', mediaType: 'application/json', role: 'config' },
    {
      path: 'universal-source-manifest.json',
      mediaType: 'application/json',
      role: 'source_manifest',
    },
    {
      path: normalizedRelativePath(manifest.materializationPath, 'materializationPath'),
      mediaType: 'application/json',
      role: 'materialization',
    },
    ...manifest.documents.map((document) => ({
      path: normalizedRelativePath(document.path, `document ${document.documentId}`),
      mediaType: document.mediaType,
      role: document.role,
    })),
    ...manifest.documents.flatMap((document) =>
      (document.pages || []).map((page) => ({
        path: normalizedRelativePath(
          page.path,
          `document ${document.documentId} page ${page.page}`,
        ),
        mediaType: page.mediaType,
        role: `${document.role}_page`,
      }))),
    ...(manifest.attachments || []).map((attachment) => ({
      path: normalizedRelativePath(
        attachment.path,
        `attachment ${attachment.attachmentId}`,
      ),
      mediaType: attachment.mediaType,
      role: attachment.role,
    })),
    ...materialization.media.flatMap((media) => [{
      path: path.posix.join(
        normalizedRelativePath(manifest.mediaDirectory, 'mediaDirectory'),
        reviewMediaFileName(media),
      ),
      mediaType: media.mimeType,
      role: 'content_media',
    }, ...(media.publication?.candidate
      ? [{
          path: path.posix.join(
            normalizedRelativePath(manifest.mediaDirectory, 'mediaDirectory'),
            reviewMediaCandidateFileName(media),
          ),
          mediaType: media.publication.candidate.mimeType,
          role: 'content_media_candidate',
        }]
      : [])]),
    ...NCK1_STAGED_ANALYSIS_FILES.map(({ path: relativePath, role }) => ({
      path: relativePath,
      mediaType: 'application/json',
      role,
    })),
  ]
}

export function loadNck1OcrReviewSource(rootDir) {
  const config = readJson(resolveReviewFile(rootDir, 'config.json'), 'config.json')
  const manifest = readJson(
    resolveReviewFile(rootDir, 'universal-source-manifest.json'),
    'universal-source-manifest.json',
  )
  if (
    manifest.schemaVersion !== 'universal-nck1-source-manifest-v1'
    || manifest.paperId !== config.paperId
    || !Array.isArray(manifest.documents)
  ) fail('Universal NCK1 OCR source manifest is incomplete')
  const documents = manifest.documents.map((document) => {
    const filePath = resolveReviewFile(
      rootDir,
      normalizedRelativePath(document.path, `document ${document.documentId}`),
    )
    if (!existsSync(filePath)) fail(`OCR source document is unavailable: ${document.documentId}`)
    const captured = { ...document, bytes: new Uint8Array(readFileSync(filePath)) }
    if (document.mediaType === NCK1_IMAGE_BUNDLE_MEDIA_TYPE) {
      assertNck1ImageBundlePageArtifacts(captured, (document.pages || []).map((page) => {
        const pagePath = resolveReviewFile(
          rootDir,
          normalizedRelativePath(page.path, `document ${document.documentId} page ${page.page}`),
        )
        if (!existsSync(pagePath)) {
          fail(`OCR source page is unavailable: ${document.documentId}:${page.page}`)
        }
        return { ...page, bytes: new Uint8Array(readFileSync(pagePath)) }
      }))
    }
    return captured
  })
  const evidence = readJson(
    resolveReviewFile(
      rootDir,
      path.posix.join('materialization', NCK1_OCR_EVIDENCE_FILE_NAME),
    ),
    NCK1_OCR_EVIDENCE_FILE_NAME,
  )
  const reviewFindings = validateNck1OcrSourceEvidence({
    paperId: manifest.paperId,
    documents,
    evidence,
    includeReviewFindings: true,
  })
  const blocking = reviewFindings.filter((item) =>
    !NCK1_OCR_REVIEW_CODES.includes(item.code))
  if (blocking.length > 0) {
    fail(`${blocking[0].code}: ${blocking[0].message}`, blocking[0].code)
  }
  return { config, manifest, documents, evidence, reviewFindings }
}

export function ocrReviewBundleFilePaths(rootDir) {
  const { manifest } = loadNck1OcrReviewSource(rootDir)
  return [
    { path: 'config.json', mediaType: 'application/json', role: 'config' },
    {
      path: 'universal-source-manifest.json',
      mediaType: 'application/json',
      role: 'source_manifest',
    },
    {
      path: path.posix.join('materialization', NCK1_OCR_EVIDENCE_FILE_NAME),
      mediaType: 'application/json',
      role: 'ocr_evidence',
    },
    ...manifest.documents.map((document) => ({
      path: normalizedRelativePath(document.path, `document ${document.documentId}`),
      mediaType: document.mediaType,
      role: document.renditionOf ? 'source_rendition' : document.role,
    })),
    ...manifest.documents.flatMap((document) =>
      (document.pages || []).map((page) => ({
        path: normalizedRelativePath(
          page.path,
          `document ${document.documentId} page ${page.page}`,
        ),
        mediaType: page.mediaType,
        role: `${document.role}_page`,
      }))),
  ]
}

export function buildNck1OcrReviewProjection(rootDir) {
  const loaded = loadNck1OcrReviewSource(rootDir)
  const manifestById = new Map(loaded.manifest.documents.map((document) => [
    document.documentId,
    document,
  ]))
  const reviewDocuments = loaded.evidence.documents.map((evidenceDocument) => {
    const sourceDocument = manifestById.get(evidenceDocument.documentId)
    if (!sourceDocument || sourceDocument.renditionOf) {
      fail(`OCR evidence document is unavailable: ${evidenceDocument.documentId}`)
    }
    return {
      documentId: sourceDocument.documentId,
      role: sourceDocument.role,
      pages: evidenceDocument.pages.map((page) => {
        const imagePage = sourceDocument.mediaType === NCK1_IMAGE_BUNDLE_MEDIA_TYPE
          ? sourceDocument.pages?.find((candidate) => candidate.page === page.page)
          : null
        if (sourceDocument.mediaType === NCK1_IMAGE_BUNDLE_MEDIA_TYPE && !imagePage) {
          fail(`OCR source page is unavailable: ${sourceDocument.documentId}:${page.page}`)
        }
        return {
          page: page.page,
          source: {
            path: normalizedRelativePath(
              imagePage?.path || sourceDocument.path,
              `document ${sourceDocument.documentId} page ${page.page}`,
            ),
            mediaType: imagePage?.mediaType || sourceDocument.mediaType,
            sha256: imagePage?.sha256 || sourceDocument.sha256,
          },
          raster: structuredClone(page.raster),
          regions: structuredClone(page.regions),
          observations: structuredClone(page.observations),
          readingOrderEdges: structuredClone(page.readingOrderEdges),
        }
      }),
    }
  })
  return {
    ...loaded,
    reviewKind: 'ocr',
    paperId: loaded.manifest.paperId,
    paperName: loaded.config.provenance.paperName,
    sourceSetDigest: loaded.evidence.sourceSetDigest,
    evidenceDigest: loaded.evidence.evidenceDigest,
    reviewStructureDigest: digestJson({
      schemaVersion: 'web-import-ocr-review-structure-v1',
      paperId: loaded.manifest.paperId,
      sourceSetDigest: loaded.evidence.sourceSetDigest,
      evidenceDigest: loaded.evidence.evidenceDigest,
    }),
    ocrReview: {
      engine: structuredClone(loaded.evidence.engine),
      confidenceThreshold: loaded.evidence.confidenceThreshold,
      reviewFindings: structuredClone(loaded.reviewFindings),
      documents: reviewDocuments,
    },
  }
}

export function validateNck1OcrReviewConfirmation(projection, confirmation) {
  if (projection?.reviewKind !== 'ocr') {
    fail('OCR confirmation requires one OCR review projection', 'IMPORT_REVIEW_OCR_REQUIRED')
  }
  const resolved = resolveConfirmedNck1OcrEvidence({
    paperId: projection.paperId,
    documents: projection.documents,
    evidence: projection.evidence,
    confirmation,
  })
  if (resolved.issues.length > 0) {
    fail(`${resolved.issues[0].code}: ${resolved.issues[0].message}`, resolved.issues[0].code)
  }
  return confirmation
}

export function buildImportReviewProjection(
  rootDir,
  { reviewKind = 'candidate', requireAnalyses = false } = {},
) {
  return reviewKind === 'ocr'
    ? buildNck1OcrReviewProjection(rootDir)
    : buildNck1ReviewProjection(rootDir, { requireAnalyses })
}

function visibleStructure(projected) {
  const structure = projected.nodes.flatMap((node) => {
    if (['part', 'section', 'instruction'].includes(node.kind)) {
      return [structuredClone(node)]
    }
    if (node.kind === 'group') {
      return [{
        kind: 'group',
        slotId: node.slotId,
        groupId: node.groupId,
        familyContractId: node.familyContractId,
      }]
    }
    if (node.kind === 'answer_region') return []
    fail(`Candidate projection contains unknown node kind: ${node.kind}`)
  })
  assertCanonicalVisibleStructure(
    structure,
    projected.nodes
      .filter((node) => node.kind === 'group')
      .map((node) => ({
        slotId: node.slotId,
        groupId: node.groupId,
        familyContractId: node.familyContractId,
      })),
  )
  return structure
}

function mediaArtifacts(projected, sourceCapture) {
  const documents = new Map(sourceCapture.documents.map((document) => [
    document.immutableArtifactRef?.artifactId,
    document,
  ]))
  const artifacts = new Map()
  for (const occurrence of projected.nodes) {
    if (occurrence.kind !== 'group') continue
    for (const media of occurrence.media || []) {
      const document = documents.get(media.sourceArtifactRef?.artifactId)
      if (
        !document
        || document.sha256 !== media.sha256
        || document.mediaType !== media.mimeType
        || typeof document.encodedBytes !== 'string'
      ) fail(`Candidate media does not close against source bytes: ${media.mediaId}`)
      const artifact = {
        mediaId: media.mediaId,
        mimeType: media.mimeType,
        sha256: media.sha256,
        pixelWidth: media.pixelWidth,
        pixelHeight: media.pixelHeight,
        sourceArtifactRef: media.sourceArtifactRef,
        encodedBytes: document.encodedBytes,
      }
      const existing = artifacts.get(media.mediaId)
      if (existing && stableStringify(existing) !== stableStringify(artifact)) {
        fail(`Candidate media identity is ambiguous: ${media.mediaId}`)
      }
      artifacts.set(media.mediaId, artifact)
    }
  }
  return [...artifacts.values()]
}

function mediaDerivationProjection(sourceCapture) {
  const documents = new Map(sourceCapture.documents.map((document) => [
    document.documentId,
    document,
  ]))
  const candidates = new Map(sourceCapture.observations
    .filter((observation) => observation.kind === 'media_derivation_candidate')
    .map((observation) => [observation.value?.mediaId, observation]))
  return sourceCapture.observations
    .filter((observation) =>
      observation.kind === 'source_media'
      && observation.value?.presentation
      && observation.value?.publication)
    .map((observation) => {
      const source = documents.get(observation.documentId)
      const candidateObservation = candidates.get(observation.value.mediaId)
      const candidateDocument = candidateObservation
        ? documents.get(candidateObservation.documentId)
        : null
      if (
        !source
        || typeof source.encodedBytes !== 'string'
        || source.sha256 !== observation.value.sha256
        || (
          candidateObservation
          && (
            !candidateDocument
            || typeof candidateDocument.encodedBytes !== 'string'
            || candidateDocument.sha256
              !== candidateObservation.value?.candidate?.sha256
          )
        )
      ) fail(`Media derivation does not close against immutable bytes: ${observation.value.mediaId}`)
      return {
        mediaId: observation.value.mediaId,
        presentation: structuredClone(observation.value.presentation),
        presentationDigest: digestJson(observation.value.presentation),
        publication: structuredClone(observation.value.publication),
        source: {
          mimeType: source.mediaType,
          sha256: source.sha256,
          pixelWidth: observation.value.pixelWidth,
          pixelHeight: observation.value.pixelHeight,
          encodedBytes: source.encodedBytes,
        },
        ...(candidateObservation
          ? {
              candidate: {
                ...structuredClone(candidateObservation.value.candidate),
                encodedBytes: candidateDocument.encodedBytes,
              },
            }
          : {}),
      }
    })
}

export function buildNck1ReviewConsumption(candidate, compilation) {
  const { sourceCapture, canonicalPaper } = compilation.artifacts
  const authority = resolveCanonicalAuthority(canonicalPaper.paperPlan.authorityRef)
  if (!authority.ok) fail('Candidate preview authority is unavailable')
  const projectedResult = projectCanonicalPaper({
    plan: canonicalPaper.paperPlan,
    groups: canonicalPaper.questionGroups,
    sourceCapture,
    authorityClosure: authority.closure,
  })
  const projected = {
    ...projectedResult,
    nodes: decorateProjectedMediaPresentation(
      projectedResult.nodes,
      sourceCapture,
    ),
  }
  const groupsByFamily = new Map()
  for (const group of canonicalPaper.questionGroups) {
    const familyContractId = group.contractRef.familyContractId
    const groupIds = groupsByFamily.get(familyContractId) || []
    groupIds.push(group.identity.groupId)
    groupsByFamily.set(familyContractId, groupIds)
  }
  const selections = [...groupsByFamily].map(([familyContractId, groupIds]) => {
    const projectedOccurrences = projected.nodes.filter(
      (node) => node.kind === 'group' && groupIds.includes(node.groupId),
    )
    return {
      mode: 'canonical',
      familyContractId,
      groupIds,
      projectedOccurrences,
      ...([
        'seven-choices',
        'cloze',
        'grammar-fill',
        ...(['49', '50'].includes(
          canonicalPaper.paperPlan.authorityRef.manifestVersion,
        )
          ? ['continuation-writing']
          : []),
      ].includes(familyContractId)
        ? {
            projectedOccurrenceDigests: projectedOccurrences.map((occurrence) => ({
              groupId: occurrence.groupId,
              digest: digestJson(occurrence),
            })),
          }
        : {}),
    }
  })
  const structure = visibleStructure(projected)
  const consumption = {
    disposition: 'ready',
    paperId: canonicalPaper.paperPlan.paperId,
    sourceAssetVersion: candidate.interpretation.sourceAssetVersion,
    sourceAssetDigest: candidate.source.sha256,
    authorityRef: structuredClone(canonicalPaper.paperPlan.authorityRef),
    profileRef: structuredClone(canonicalPaper.paperPlan.profileRef),
    consumerContractRef: structuredClone(consumerContractRefs.screen),
    visibleStructure: structure,
    visibleStructureDigest: digestJson(structure),
    selections,
    mediaArtifacts: mediaArtifacts(projected, sourceCapture),
    diagnostics: [],
  }
  assertCanonicalConsumptionVisibleStructure(consumption)
  return consumption
}

function compatibilityText(
  blocks,
  questionNoByBlankId = new Map(),
  family = null,
) {
  return blocks
    .filter((block) => block.kind === 'paragraph')
    .map((block) => {
      let text = ''
      for (const [index, inline] of block.content.entries()) {
        if (inline.kind === 'text') {
          text += inline.text
          continue
        }
        const marker = `__${questionNoByBlankId.get(inline.blankId)}__`
        if (family !== 'grammar-fill') {
          text += marker
          continue
        }
        const nextInline = block.content[index + 1]
        const prefix = /[\p{L}\p{N}_]$/u.test(text) ? ' ' : ''
        const suffix =
          nextInline?.kind === 'text'
          && /^(?:[\p{L}\p{N}_]|\()/u.test(nextInline.text)
            ? ' '
            : ''
        text += `${prefix}${marker}${suffix}`
      }
      return text
    })
    .join('\n')
}

export function buildNck1CompatibilityPaperAsset({
  config,
  materialization,
  sourceAssetVersion,
  primarySourceType = 'pdf',
}) {
  const groupTypes = {
    reading: 'reading',
    'seven-choices': 'sevenChoices',
    cloze: 'cloze',
    'grammar-fill': 'grammarFill',
    'application-writing': 'writing',
    'continuation-writing': 'writing',
  }
  const groups = {}
  const questions = {}
  const blanks = {}
  const writingTasks = {}
  const answerKey = {}
  const answers = new Map(materialization.answers.map((answer) => [answer.questionId, answer]))
  const listeningGroups = materialization.listening.state === 'captured'
    ? [
        { slotId: 'listening.short-dialogue', from: 1, to: 5 },
        { slotId: 'listening.long-form', from: 6, to: 20 },
      ]
    : []
  const listeningAnswers = new Map((materialization.listening.answers || []).map((answer) => [
    answer.canonicalNumber,
    answer,
  ]))
  for (const spec of listeningGroups) {
    const groupId = `group:${materialization.paperId}:${spec.slotId}`
    const listeningQuestions = materialization.listening.questions.filter((question) =>
      question.canonicalNumber >= spec.from && question.canonicalNumber <= spec.to)
    const questionIds = listeningQuestions.map((question) =>
      `question:listening:${question.canonicalNumber}`)
    groups[groupId] = {
      groupId,
      groupType: 'listening',
      title: spec.slotId,
      questionIds,
    }
    for (const question of listeningQuestions) {
      const questionId = `question:listening:${question.canonicalNumber}`
      const answer = listeningAnswers.get(question.canonicalNumber)
      questions[questionId] = {
        questionId,
        questionNo: question.canonicalNumber,
        groupId,
        stem: question.stem,
        options: question.options.map(({ label, text }) => ({ label, text })),
      }
      if (answer) {
        answerKey[questionId] = {
          questionId,
          questionNo: question.canonicalNumber,
          answer: answer.value,
        }
      }
    }
  }
  for (const group of materialization.groups) {
    const questionIds = group.questions.map((question) => question.questionId)
    const blankIds = group.questions.map((question) => question.blankId).filter(Boolean)
    const questionNoByBlankId = new Map(group.questions
      .filter((question) => question.blankId)
      .map((question) => [question.blankId, question.canonicalNumber]))
    const writingTaskId = group.writingTask ? `writing-task:${group.groupId}` : undefined
    groups[group.groupId] = {
      groupId: group.groupId,
      groupType: groupTypes[group.family],
      title: group.slotId,
      questionIds,
      ...(blankIds.length > 0 ? { blankIds } : {}),
      ...(writingTaskId ? { writingTaskId } : {}),
      passage: {
        paragraphs: group.blocks
          .filter((block) => block.kind === 'paragraph')
          .map((block) => ({
            paragraphId: block.blockId,
            ...(group.family === 'seven-choices'
              ? { role: block.role }
              : {}),
            text: compatibilityText(
              [block],
              questionNoByBlankId,
              group.family,
            ),
          })),
      },
      ...(group.optionBank.length > 0
        ? { optionBank: group.optionBank.map(({ label, text }) => ({ label, text })) }
        : {}),
    }
    for (const question of group.questions) {
      questions[question.questionId] = {
        questionId: question.questionId,
        questionNo: question.canonicalNumber,
        groupId: group.groupId,
        stem: question.stem,
        ...(question.options.length > 0
          ? { options: question.options.map(({ label, text }) => ({ label, text })) }
          : {}),
        ...(question.blankId ? { blankId: question.blankId } : {}),
      }
      if (question.blankId) {
        blanks[question.blankId] = {
          blankId: question.blankId,
          groupId: group.groupId,
          questionId: question.questionId,
          ...(question.prompt ? { prompt: question.prompt } : {}),
        }
      }
      const answer = answers.get(question.questionId)
      if (answer) {
        answerKey[question.questionId] = {
          questionId: question.questionId,
          questionNo: question.canonicalNumber,
          answer: answer.value,
        }
      }
    }
    if (group.writingTask) {
      writingTasks[writingTaskId] = {
        writingTaskId,
        groupId: group.groupId,
        taskType: group.writingTask.taskType,
        title: group.slotId,
        instruction: group.writingTask.prompt,
        wordCountTarget: group.writingTask.wordCountTarget,
        ...(group.writingTask.material.length > 0
          ? { materialText: group.writingTask.material.join('\n') }
          : {}),
        ...(group.writingTask.starters.length > 0
          ? { continuationStarters: group.writingTask.starters }
          : {}),
        ...(group.writingTask.officialModelAnswer
          ? { officialModelAnswer: group.writingTask.officialModelAnswer }
          : {}),
      }
    }
  }
  return {
    schemaVersion: 'paper-asset-v1',
    paper: {
      paperId: materialization.paperId,
      title: config.provenance.paperName,
      subject: 'English',
      source: config.provenance.source,
      assetVersion: sourceAssetVersion,
      status: 'draft',
    },
    sources: { primarySourceType },
    layoutTree: { parts: [] },
    content: {
      blocks: [
        ...listeningGroups.map(({ slotId }) => ({
          type: 'group',
          groupId: `group:${materialization.paperId}:${slotId}`,
        })),
        ...materialization.groups.map((group) => ({ type: 'group', groupId: group.groupId })),
      ],
      groups,
      questions,
      ...(Object.keys(blanks).length > 0 ? { blanks } : {}),
      ...(Object.keys(writingTasks).length > 0 ? { writingTasks } : {}),
    },
    answerKey: { answers: answerKey },
    analysis: {},
  }
}

function listeningReviewProjection(materialization, listeningAudioEvidence) {
  if (materialization.listening.state !== 'captured') return null
  const answers = new Map(materialization.listening.answers.map((answer) => [
    answer.canonicalNumber,
    answer.value,
  ]))
  return {
    questions: materialization.listening.questions.map((question) => ({
      questionId: `question:listening:${question.canonicalNumber}`,
      questionNo: question.canonicalNumber,
      officialAnswer: answers.get(question.canonicalNumber),
      transcriptSegments: materialization.listening.transcript
        .filter((segment) => segment.questionNumbers.includes(question.canonicalNumber))
        .map((segment) => ({
          segmentId: segment.segmentId,
          text: segment.text,
          questionNumbers: [...segment.questionNumbers],
        })),
    })),
    audio: {
      durationSeconds: listeningAudioEvidence.asr.durationSeconds,
      engine: structuredClone(listeningAudioEvidence.asr.engine),
      playbackAudioSha256: listeningAudioEvidence.check.playbackAudioSha256,
      asrSha256: listeningAudioEvidence.check.asrSha256,
      comparison: structuredClone(listeningAudioEvidence.check.comparison),
      contentSafety: {
        verdict: listeningAudioEvidence.check.contentSafety.verdict,
        reviewedAt: listeningAudioEvidence.check.contentSafety.reviewedAt,
      },
    },
  }
}

function configuredSourceType(config, paperId) {
  const sourceType = config.provenance?.sourceType
    || (paperId.startsWith('paper-mock-') ? '模拟题' : '真题')
  if (!['真题', '模拟题', '校本题', '自编题'].includes(sourceType)) {
    fail(`Unsupported sourceType: ${sourceType}`)
  }
  return sourceType
}

function configuredYear(config, paperId) {
  const explicit = Number(config.provenance?.year)
  if (Number.isInteger(explicit) && explicit >= 1900 && explicit <= 2100) {
    return explicit
  }
  const inferred = Number(
    /(?:19|20)\d{2}/.exec(
      `${paperId} ${config.provenance?.paperName || ''}`,
    )?.[0],
  )
  if (!Number.isInteger(inferred)) {
    fail('Universal NCK1 compatibility metadata requires a factual year')
  }
  return inferred
}

export function buildNck1CompatibilityPackage({
  config,
  manifest,
  materialization,
  sourceAssetVersion = 1,
  analysisSidecars = {},
}) {
  const sourceDocument = materialization.documents.find((document) =>
    ['question_source', 'question_and_answers'].includes(document.role))
  const manifestDocument = manifest.documents.find((document) =>
    document.documentId === sourceDocument?.documentId)
  if (!sourceDocument || !manifestDocument) {
    fail('Universal NCK1 compatibility metadata requires one question source')
  }
  const sourceFileSha256 = String(sourceDocument.sha256 || '').replace(/^sha256:/, '')
  if (!/^[a-f0-9]{64}$/.test(sourceFileSha256)) {
    fail('Universal NCK1 question source digest is invalid')
  }
  const sourceType = configuredSourceType(config, materialization.paperId)
  const year = configuredYear(config, materialization.paperId)
  const defaultTags = Array.isArray(config.provenance?.defaultTags)
    ? config.provenance.defaultTags
    : [sourceType, String(year)]
  const paperAsset = buildNck1CompatibilityPaperAsset({
    config,
    materialization,
    sourceAssetVersion,
    primarySourceType: primarySourceType(materialization),
  })
  const answerKey = {
    schemaVersion: 'answer-key-v1',
    paperId: materialization.paperId,
    sourceAssetVersion,
    answers: structuredClone(paperAsset.answerKey.answers),
  }
  return {
    paperAsset,
    answerKey,
    readingAnalysis: analysisSidecars['reading-choice-analysis-v1.json'] || null,
    scAnalysis: analysisSidecars['seven-choices-analysis-v1.json'] || null,
    clozeAnalysis: analysisSidecars['cloze-analysis-v1.json'] || null,
    grammarFillAnalysis: analysisSidecars['grammar-fill-analysis-v1.json'] || null,
    writingAnalysis: analysisSidecars['writing-analysis-v1.json'] || null,
    importMeta: {
      schemaVersion: 'import-meta-v1',
      paperId: materialization.paperId,
      sourceFileName: path.basename(manifestDocument.path),
      sourceFileSha256,
      paper: {
        year,
        region: config.provenance?.region || config.provenance.source,
        paperName: config.provenance.paperName,
        examCode: materialization.paperId.replace(/^paper-/, ''),
        subject: 'English',
        sourceType,
        defaultTags,
      },
    },
    sourceAssetDigest: sourceFileSha256,
  }
}

export function buildNck1ReviewProjection(rootDir, { requireAnalyses = false } = {}) {
  const loaded = loadNck1ReviewSource(rootDir)
  const imported = importCanonicalCandidate(loaded.sourceInput)
  if (!imported.candidate || imported.issues.length > 0) {
    const issue = imported.issues[0]
    fail(`${issue?.code || 'MATERIALIZATION_INVALID'}: ${issue?.message || 'Candidate derivation failed'}`)
  }
  const preview = compileNck1MaterializationCandidatePreview(imported.candidate)
  if (!preview.compilation) {
    const issue = preview.unresolvedIssues?.[0]
    fail(`${issue?.code || 'CANDIDATE_PREVIEW_INVALID'}: ${issue?.message || 'Candidate preview compilation failed'}`)
  }
  const consumption = buildNck1ReviewConsumption(
    preview.candidate,
    preview.compilation,
  )
  const mediaDerivations = mediaDerivationProjection(
    preview.compilation.artifacts.sourceCapture,
  )
  const paperAsset = buildNck1CompatibilityPaperAsset({
    config: loaded.config,
    materialization: loaded.materialization,
    sourceAssetVersion: preview.candidate.interpretation.sourceAssetVersion,
    primarySourceType: primarySourceType(loaded.materialization),
  })
  const analysisProjection = buildNck1AnalysisProjection({
    rootDir,
    materialization: loaded.materialization,
    paperAsset,
    sourceAssetVersion: preview.candidate.interpretation.sourceAssetVersion,
    required: requireAnalyses,
  })
  const sourceVisuals = sourceVisualProjection(
    loaded.manifest,
    loaded.materialization,
  )
  return {
    ...loaded,
    paperId: loaded.materialization.paperId,
    paperName: loaded.config.provenance.paperName,
    sourceDigest: preview.candidate.source.sha256,
    candidateDigest: preview.candidate.candidateDigest,
    visibleStructureDigest: consumption.visibleStructureDigest,
    candidate: preview.candidate,
    compilation: preview.compilation,
    consumption,
    mediaDerivations,
    paperAsset,
    sourceVisuals,
    listeningReview: listeningReviewProjection(
      loaded.materialization,
      loaded.listeningAudioEvidence,
    ),
    analysisSidecars: analysisProjection?.sidecars || {},
    analysisDigest: analysisProjection?.digest || null,
  }
}

export function printConsumption(screenConsumption) {
  return {
    ...structuredClone(screenConsumption),
    consumerContractRef: structuredClone(consumerContractRefs.print_pdf),
  }
}
