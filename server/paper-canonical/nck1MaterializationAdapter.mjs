import { validateInImageLabelMeasurementBinding } from '../../shared/paper-canonical/readingFigureLayout.mjs'
import { paragraphJoinBoundaryNeedsTrim, CROSS_PAGE_PARAGRAPH_JOIN_VERSION_V2 } from '../../shared/paper-canonical/crossPageParagraphJoin.mjs'
import { resolveInImageOptionLabels, IN_IMAGE_OPTION_LABELS_VERSION_V2, verifyInImageOptionLabelsV2Ownership } from '../../shared/paper-canonical/inImageOptionLabels.mjs'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  resolveCanonicalAuthority,
  nck1MaterializationCandidateAuthorityRef,
  nck1ListeningInstructionAuthorityRef,
  nck1DrawingAreaAuthorityRef,
  nck1ReadingStemFiguresAuthorityRef,
  nck1WritingGivenRefsAuthorityRef, nck1ParagraphJoinAuthorityRef, nck1ListeningSourceDecisionAuthorityRef, nck1OcrOptionEmphasisAuthorityRef, nck1CrossPageJoinV2AuthorityRef, nck1CrossPageProducerIssueAuthorityRef, nck1MultipleWritingNoticesAuthorityRef,
  closureAdmitsListeningSourceDecisions,
  closureAdmitsReadingStemFigures,
  closureAdmitsWritingGivenRefs,
  closureAdmitsParagraphJoins, closureAdmitsMultipleWritingNotices, closureAdmitsCrossPageJoinV2,
  nck1InImageOptionLabelsAuthorityRef, closureAdmitsInImageOptionLabels,
  nck1InImageOptionLabelsV2AuthorityRef, closureAdmitsInImageOptionLabelsV2, closureAdmitsInImageOptionLabelMeasurements,
  validateJsonSchema,
  nck1MaterializationHistoricalAuthorityRef58,
  nck1MaterializationHistoricalAuthorityRef59,
  nck1MaterializationHistoricalAuthorityRef61,
  nck1MaterializationHistoricalAuthorityRef62,
  nck1MaterializationHistoricalAuthorityRef64,
  nck1MaterializationHistoricalAuthorityRef66,
  closureAdmitsApplicationPromptFigures,
  closureAdmitsApplicationDrawingArea,
} from '../../shared/paper-canonical/authority.mjs'
import { SOURCE_INSTRUCTION_SLOTS } from '../../shared/paper-canonical/sourcePresentation.mjs'
import {
  digestNck1SourceMaterialization,
  validateNck1SourceMaterialization,
  normalizedWritingText,
  resolveWritingGivenBlocks,
} from '../../shared/paper-canonical/nck1SourceMaterialization.mjs'
import { writingNoticeGroup, writingNoticeGroups, writingWordCount } from '../../shared/paper-canonical/applicationWritingDisplay.mjs'
import {
  digestJson,
  exactKeys,
  sha256,
} from '../../shared/paper-canonical/stable.mjs'
import { extractDocxDocumentParagraphs, extractDocxParagraphEmphasis } from './docxSourceAdapter.mjs'
import { mapSourceEmphasisEdits, splitSourceEmphasis } from './sourceEmphasis.mjs'
import { resolveOcrQuestionTextEmphasis } from './ocrQuestionTextEmphasis.mjs'
import { resolveConfirmedNck1OcrEvidence, NCK1_OCR_CONFIRMATION_SCHEMA_VERSION_V2, NCK1_OCR_CONFIRMATION_SCHEMA_VERSION_V3 } from '../paper-import/nck1OcrSourceEvidence.mjs'
import { produceNck1MaterializationFromStructures } from '../paper-import/nck1DocxMaterializationProducer.mjs'
import { resolveListeningSourceDecision } from '../paper-import/listeningSourceDecision.mjs'
import { verifyCrossPageParagraphJoinEvidence } from '../paper-import/crossPageParagraphJoinEvidence.mjs'
import { rasterPdfRegion } from './pdfRegionRaster.mjs'
import { applySpellingReview, verifyTerminalWhitespaceSourceEvidence, SPELLING_REVIEW_FILE } from '../paper-import/spellingReview.mjs'
import { applyListeningInstructionCorrection, LISTENING_INSTRUCTION_CORRECTION_FILE } from '../paper-import/listeningInstructionCorrection.mjs'
import {
  NCK1_IMAGE_BUNDLE_MEDIA_TYPE,
  nck1ImageExtension,
  parseNck1ImageSourceBundle,
} from '../paper-import/nck1ImageSourceBundle.mjs'

export const NCK1_MATERIALIZATION_INPUT_KIND =
  'nck1-source-materialization'
export const NCK1_MATERIALIZATION_MEDIA_TYPE =
  'application/vnd.eqb.nck1-source-materialization+json'
export const NCK1_MATERIALIZATION_CANDIDATE_SCHEMA_VERSION =
  'trusted-nck1-materialization-import-candidate-v1'

const textDecoder = new TextDecoder()
const textEncoder = new TextEncoder()

function adapterIssue(code, message, path = '$') {
  return { code, disposition: 'incomplete_source', path, message }
}

function cloneByteEntries(entries, idKey) {
  return entries.map((entry) => ({
    [idKey]: entry[idKey],
    bytes: new Uint8Array(entry.bytes),
    ...(entry.renditionBytes instanceof Uint8Array
      ? { renditionBytes: new Uint8Array(entry.renditionBytes) }
      : {}),
  }))
}

export function isNck1MaterializationInput(value) {
  if (value && Object.hasOwn(value, 'listeningInstructionCorrectionBytes')) {
    const { listeningInstructionCorrectionBytes, ...original } = value
    return listeningInstructionCorrectionBytes instanceof Uint8Array && isNck1MaterializationInput(original)
  }
  if (value && Object.hasOwn(value, 'spellingReviewBytes')) {
    const { spellingReviewBytes, ...original } = value
    return spellingReviewBytes instanceof Uint8Array && isNck1MaterializationInput(original)
  }
  if (value && Object.hasOwn(value, 'ocrSourceBytes')) {
    const { ocrSourceBytes, ...original } = value
    return exactKeys(ocrSourceBytes, ['evidenceBytes', 'confirmationBytes'])
      && ocrSourceBytes.evidenceBytes instanceof Uint8Array
      && ocrSourceBytes.confirmationBytes instanceof Uint8Array
      && isNck1MaterializationInput(original)
  }
  return Boolean(
    value
    && (exactKeys(value, ['kind', 'materializationBytes', 'documents', 'media'])
      || (exactKeys(value, ['kind', 'materializationBytes', 'documents', 'media', 'listeningAudio'])
        && exactKeys(value.listeningAudio, ['relativePath', 'sha256', 'byteLength', 'durationSeconds', 'mediaType'])
        && value.listeningAudio.relativePath === 'listening/playback.mp3'
        && /^sha256:[a-f0-9]{64}$/.test(value.listeningAudio.sha256)
        && Number.isInteger(value.listeningAudio.byteLength) && value.listeningAudio.byteLength > 0
        && Number.isFinite(value.listeningAudio.durationSeconds) && value.listeningAudio.durationSeconds > 0
        && value.listeningAudio.mediaType === 'audio/mpeg'))
    && value.kind === NCK1_MATERIALIZATION_INPUT_KIND
    && value.materializationBytes instanceof Uint8Array
    && Array.isArray(value.documents)
    && value.documents.every((entry) =>
      exactKeys(entry, ['documentId', 'bytes'])
      && typeof entry.documentId === 'string'
      && entry.bytes instanceof Uint8Array)
    && Array.isArray(value.media)
    && value.media.every((entry) =>
      (
        exactKeys(entry, ['mediaId', 'bytes'])
        || exactKeys(entry, ['mediaId', 'bytes', 'renditionBytes'])
      )
      && typeof entry.mediaId === 'string'
      && entry.bytes instanceof Uint8Array
      && (
        entry.renditionBytes === undefined
        || entry.renditionBytes instanceof Uint8Array
      )),
  )
}

export function cloneNck1MaterializationInput(value) {
  return {
    kind: NCK1_MATERIALIZATION_INPUT_KIND,
    materializationBytes: new Uint8Array(value.materializationBytes),
    documents: cloneByteEntries(value.documents, 'documentId'),
    media: cloneByteEntries(value.media, 'mediaId'),
    ...(value.listeningAudio ? { listeningAudio: structuredClone(value.listeningAudio) } : {}),
    ...(value.spellingReviewBytes ? { spellingReviewBytes: new Uint8Array(value.spellingReviewBytes) } : {}),
    ...(value.listeningInstructionCorrectionBytes ? { listeningInstructionCorrectionBytes: new Uint8Array(value.listeningInstructionCorrectionBytes) } : {}),
    ...(value.ocrSourceBytes ? { ocrSourceBytes: {
      evidenceBytes: new Uint8Array(value.ocrSourceBytes.evidenceBytes),
      confirmationBytes: new Uint8Array(value.ocrSourceBytes.confirmationBytes),
    } } : {}),
  }
}

function inputKeyForDocument(documentId) {
  return `source_document_${documentId.replace(/[^a-z0-9]+/gi, '_')}`
}

function inputKeyForMedia(mediaId) {
  return `source_media_${mediaId.replace(/[^a-z0-9]+/gi, '_')}`
}

function inputKeyForMediaRendition(mediaId) {
  return `candidate_media_${mediaId.replace(/[^a-z0-9]+/gi, '_')}`
}

function stableArtifactId(bytes) {
  return `source-document:${digestJson({ sha256: sha256(bytes) }).slice('sha256:'.length, 28)}`
}

function canonicalSlotId(slotId) {
  return ({
    'seven-choices': 'reading.seven-choices',
    cloze: 'language.cloze',
    'grammar-fill': 'language.grammar-fill',
  })[slotId] || slotId
}

function sourceRoles(role) {
  if (role === 'question_source') return ['question_source', 'source_provenance']
  if (role === 'official_answers') return ['official_answer_source', 'source_provenance']
  return ['question_source', 'official_answer_source', 'source_provenance']
}

function originalName(document) {
  const extension = document.mediaType === 'application/pdf'
    ? 'pdf'
    : document.mediaType === NCK1_IMAGE_BUNDLE_MEDIA_TYPE
      ? 'image-bundle.json'
      : 'docx'
  return `${document.documentId}.${extension}`
}

function parseMaterialization(bytes) {
  try {
    return JSON.parse(textDecoder.decode(bytes))
  } catch {
    return null
  }
}

function bundleDigest(materializationBytes, documents, media, listeningAudio, spellingReviewBytes, ocrSourceBytes, listeningInstructionCorrectionBytes) {
  return digestJson({
    materialization: sha256(materializationBytes),
    ...(listeningAudio ? { listeningAudio } : {}),
    ...(spellingReviewBytes ? { spellingReview: sha256(spellingReviewBytes) } : {}),
    ...(listeningInstructionCorrectionBytes ? { listeningInstructionCorrection: sha256(listeningInstructionCorrectionBytes) } : {}),
    ...(ocrSourceBytes ? { ocrSource: {
      evidence: sha256(ocrSourceBytes.evidenceBytes),
      confirmation: sha256(ocrSourceBytes.confirmationBytes),
    } } : {}),
    documents: documents.map((entry) => ({
      documentId: entry.documentId,
      sha256: sha256(entry.bytes),
      byteLength: entry.bytes.byteLength,
    })),
    media: media.map((entry) => ({
      mediaId: entry.mediaId,
      sha256: sha256(entry.bytes),
      byteLength: entry.bytes.byteLength,
      ...(entry.renditionBytes
        ? {
            renditionSha256: sha256(entry.renditionBytes),
            renditionByteLength: entry.renditionBytes.byteLength,
          }
        : {}),
    })),
  })
}

function identifyImage(bytes) {
  const [pixelWidth, pixelHeight, mimeType] = execFileSync(
    'magick', ['identify', '-format', '%w,%h,%m', '-'], {
      encoding: 'utf8',
      input: bytes,
    },
  ).split(',')
  return {
    pixelWidth: Number(pixelWidth),
    pixelHeight: Number(pixelHeight),
    mimeType: ({ PNG: 'image/png', JPEG: 'image/jpeg', WEBP: 'image/webp' })[mimeType],
  }
}

function imageMagickVersion() {
  return execFileSync('magick', ['-version'], { encoding: 'utf8' })
    .split('\n')[0]
    .trim()
}

function replayDeterministicEnhancement(sourceBytes, candidate) {
  if (
    candidate.tool !== 'imagemagick'
    || candidate.toolVersion !== imageMagickVersion()
    || candidate.preset !== 'document-light-cleanup-v1'
    || candidate.mimeType !== 'image/png'
  ) throw new Error('Unsupported deterministic media enhancement recipe')
  return new Uint8Array(execFileSync('magick', [
    '-',
    '-auto-orient',
    '-strip',
    '-colorspace', 'sRGB',
    '-contrast-stretch', '0.5%x0.5%',
    '-unsharp', '0x0.75+0.75+0.008',
    'png32:-',
  ], { input: sourceBytes, maxBuffer: 50 * 1024 * 1024 }))
}

function selectedMedia(media, supplied) {
  if (
    media.publication
    && media.publication.selection !== 'source_crop'
  ) {
    return {
      bytes: supplied.renditionBytes,
      mimeType: media.publication.candidate.mimeType,
      sha256: media.publication.candidate.sha256,
      pixelWidth: media.publication.candidate.pixelWidth,
      pixelHeight: media.publication.candidate.pixelHeight,
    }
  }
  return {
    bytes: supplied.bytes,
    mimeType: media.mimeType,
    sha256: media.sha256,
    pixelWidth: media.pixelWidth,
    pixelHeight: media.pixelHeight,
  }
}

function reextractMedia(media, documentBytes) {
  if (media.extraction.kind === 'pdf_crop') {
    return rasterPdfRegion({
      pdfBytes: documentBytes,
      page: media.extraction.page,
      region: media.extraction.region,
      density: media.extraction.density,
    }).bytes
  }
  const temp = mkdtempSync(path.join(tmpdir(), 'eqb-nck1-media-proof-'))
  try {
    const sourcePath = path.join(temp, 'source.docx')
    writeFileSync(sourcePath, documentBytes)
    if (media.extraction.kind === 'docx_media') {
      return new Uint8Array(execFileSync('unzip', [
        '-p', sourcePath, media.extraction.entryName,
      ]))
    }
    if (media.extraction.kind === 'docx_svg_raster') {
      const svg = execFileSync('unzip', [
        '-p', sourcePath, media.extraction.entryName,
      ])
      return new Uint8Array(execFileSync('magick', [
        '-density', String(media.extraction.density), 'svg:-', 'png32:-',
      ], { input: svg, maxBuffer: 50 * 1024 * 1024 }))
    }
    throw new Error(`Unsupported media extraction kind: ${media.extraction.kind}`)
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
}

function paragraphSelectorText(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/(?:\d{1,2}[.．、]?)?_+/g, '')
    .replace(/\s+/g, '')
}

const PARAGRAPH_BLANK_SENTINEL = '\u0000blank\u0000'
const SOURCE_BLANK_TOKEN_PATTERN = /(?:\d{1,3}[.．、]?\p{Zs}*)?_{2,}\d{0,3}_{0,}/gu

function trimParagraphEdgeSpaces(value) {
  return value.replace(/^\p{Zs}+|\p{Zs}+$/gu, '')
}

function sourceParagraphFidelityText(value, expectedBlankCount) {
  const source = String(value ?? '')
  const blankTokens = [...source.matchAll(SOURCE_BLANK_TOKEN_PATTERN)]
  if (blankTokens.length !== expectedBlankCount) return null
  return trimParagraphEdgeSpaces(source
    .replace(SOURCE_BLANK_TOKEN_PATTERN, PARAGRAPH_BLANK_SENTINEL)
    .replace(
      new RegExp(`\\p{Zs}*${PARAGRAPH_BLANK_SENTINEL}\\p{Zs}*`, 'gu'),
      PARAGRAPH_BLANK_SENTINEL,
    ))
}

export function strictParagraphFidelityText(block) {
  if (!Array.isArray(block?.content)) return null
  let blankCount = 0
  const text = block.content.map((item) => {
    if (item?.kind === 'text' && typeof item.text === 'string') return item.text
    if (item?.kind === 'blank_ref' && typeof item.blankId === 'string') {
      blankCount += 1
      return PARAGRAPH_BLANK_SENTINEL
    }
    return null
  })
  if (text.some((item) => item === null)) return null
  return {
    blankCount,
    text: trimParagraphEdgeSpaces(text.join('')
      .replace(
        new RegExp(`\\p{Zs}*${PARAGRAPH_BLANK_SENTINEL}\\p{Zs}*`, 'gu'),
        PARAGRAPH_BLANK_SENTINEL,
      )),
  }
}

export function paragraphMatchesOneDocxParagraph(block, sourceParagraphs) {
  const blockFidelity = strictParagraphFidelityText(block)
  return blockFidelity?.text.length > 0 && sourceParagraphs.some((paragraph) =>
    sourceParagraphFidelityText(
      (blockFidelity.blankCount > 0 ? paragraph.textWithNumberedBlanks : null)
        ?? paragraph.text ?? paragraph,
      blockFidelity.blankCount,
    ) === blockFidelity.text)
}

function parseDocxParagraphSelector(selector) {
  const value = String(selector || '')
  const sourceIndex = value.match(
    /^\(\/w:document\/w:body\/\/w:p\)\[(\d+)\]$/u,
  )
  if (sourceIndex) {
    return {
      comparison: 'source_index',
      sourceIndex: Number(sourceIndex[1]),
    }
  }
  const contains = value.match(
    /^\/\/w:p\[contains\(\.,\s*(["'])(.+)\1\)\](?:\[(\d+)\])?$/u,
  )
  if (contains) {
    return {
      comparison: 'contains',
      literal: contains[2],
      occurrence: contains[3] ? Number(contains[3]) : null,
    }
  }
  const exact = value.match(
    /^\/\/w:p\[normalize-space\(\.\)=(["'])(.+)\1\](?:\[(\d+)\])?$/u,
  )
  return exact
    ? {
        comparison: 'exact',
        literal: exact[2],
        occurrence: exact[3] ? Number(exact[3]) : null,
      }
    : null
}

export function resolveDocxParagraphSelector(selector, sourceParagraphs) {
  const parsed = parseDocxParagraphSelector(selector)
  if (!parsed) return []
  if (parsed.comparison === 'source_index') {
    return sourceParagraphs.filter((paragraph) =>
      paragraph.sourceIndex === parsed.sourceIndex)
  }
  const normalizedLiteral = paragraphSelectorText(parsed.literal)
  if (!normalizedLiteral) return []
  const matches = sourceParagraphs.filter((paragraph) => {
    const paragraphText = paragraphSelectorText(paragraph.text ?? paragraph)
    return parsed.comparison === 'exact'
      ? paragraphText === normalizedLiteral
      : paragraphText.includes(normalizedLiteral)
  })
  if (parsed.occurrence === null) return matches
  return matches[parsed.occurrence - 1] ? [matches[parsed.occurrence - 1]] : []
}

export function validateDocxParagraphBindings(entries, sourceParagraphs) {
  const issues = []
  const claimedParagraphs = new Set()
  let previousIndex
  for (const { block, path } of entries) {
    const matches = resolveDocxParagraphSelector(block.source.selector, sourceParagraphs)
    if (matches.length !== 1) {
      issues.push(adapterIssue(
        'MATERIALIZATION_DOCX_PARAGRAPH_SELECTOR_INVALID',
        `Paragraph ${block.blockId} selector must resolve exactly one source DOCX w:p`,
        `${path}.source.selector`,
      ))
      continue
    }
    const [sourceParagraph] = matches
    if (!paragraphMatchesOneDocxParagraph(block, [sourceParagraph])) {
      issues.push(adapterIssue(
        'MATERIALIZATION_DOCX_PARAGRAPH_BOUNDARY_INVALID',
        `Paragraph ${block.blockId} must preserve the source DOCX w:p selected by its locator`,
        path,
      ))
    }
    if (claimedParagraphs.has(sourceParagraph.sourceIndex)) {
      issues.push(adapterIssue(
        'MATERIALIZATION_DOCX_PARAGRAPH_PLACEMENT_DUPLICATE',
        `Source DOCX w:p ${sourceParagraph.sourceIndex} is claimed by more than one paragraph block`,
        path,
      ))
    }
    claimedParagraphs.add(sourceParagraph.sourceIndex)
    if (previousIndex !== undefined && sourceParagraph.sourceIndex <= previousIndex) {
      issues.push(adapterIssue(
        'MATERIALIZATION_DOCX_PARAGRAPH_SOURCE_ORDER_INVALID',
        `Paragraph ${block.blockId} is not in source DOCX w:p order`,
        path,
      ))
    }
    previousIndex = sourceParagraph.sourceIndex
  }
  return issues
}

export function sourceOrderedParagraphEntries(blocks, path) {
  return (blocks || []).flatMap((block, blockIndex) => {
    const blockPath = `${path}[${blockIndex}]`
    if (block?.kind === 'paragraph') return [{ block, path: blockPath }]
    if (block?.kind !== 'framed_columns') return []
    return (block.columns || []).flatMap((column, columnIndex) =>
      sourceOrderedParagraphEntries(
        column.blocks,
        `${blockPath}.columns[${columnIndex}].blocks`,
      ))
  })
}

function validateDocxParagraphBoundaries(materialization, documentsById) {
  const issues = []
  const paragraphsByDocumentId = new Map()
  const entriesByDocumentId = new Map()
  const paragraphEntries = (materialization.groups || []).flatMap((group, groupIndex) =>
    sourceOrderedParagraphEntries(group.blocks, `$.groups[${groupIndex}].blocks`))
  const docxParagraphEntries = paragraphEntries.filter(({ block }) =>
    block.source?.kind === 'docx_part'
    && block.source.part === 'word/document.xml')
  const referencedDocumentIds = new Set(docxParagraphEntries.map(({ block }) =>
    block.source.documentId))
  for (const document of materialization.documents || []) {
    if (
      document.mediaType !== 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      || !referencedDocumentIds.has(document.documentId)
    ) continue
    const supplied = documentsById.get(document.documentId)
    if (!supplied) continue
    try {
      paragraphsByDocumentId.set(
        document.documentId,
        extractDocxDocumentParagraphs(supplied.bytes),
      )
    } catch {
      issues.push(adapterIssue(
        'MATERIALIZATION_DOCX_PARAGRAPH_SOURCE_UNAVAILABLE',
        `DOCX paragraph boundaries cannot be read for ${document.documentId}`,
        '$.documents',
      ))
    }
  }
  for (const entry of docxParagraphEntries) {
    if (!paragraphsByDocumentId.has(entry.block.source.documentId)) continue
    const entries = entriesByDocumentId.get(entry.block.source.documentId) || []
    entries.push(entry)
    entriesByDocumentId.set(entry.block.source.documentId, entries)
  }
  for (const [documentId, entries] of entriesByDocumentId) {
    issues.push(...validateDocxParagraphBindings(
      entries,
      paragraphsByDocumentId.get(documentId),
    ))
  }
  return issues
}

// Pure parser for metadata produced by Poppler for exactly the requested page.
// v2 supports only unrotated, equal, zero-origin MediaBox/CropBox coordinates.
export function inImageLabelPageMetadata(bbox, info, pageNumber) {
  const fail = () => { throw new Error('In-image measurement requires one unrotated zero-origin PDF page with identical boxes') }
  const pages = [...bbox.matchAll(/<page width="([\d.]+)" height="([\d.]+)">/gu)]
  if (pages.length !== 1) fail()
  const number = '-?\\d+(?:\\.\\d+)?'
  const get = (field, count) => {
    const matches = [...info.matchAll(new RegExp(`^Page(?:\\s+(\\d+))?\\s+${field}:\\s*(${number}(?:\\s+${number}){${count - 1}})\\s*$`, 'gmu'))]
      .filter(match => !match[1] || Number(match[1]) === pageNumber)
    if (matches.length !== 1) fail()
    return matches[0][2].trim().split(/\s+/u).map(Number)
  }
  const rotation = get('rot', 1)
  const media = get('MediaBox', 4), crop = get('CropBox', 4)
  const width = Number(pages[0][1]), height = Number(pages[0][2])
  const close = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 0.01
  if (rotation[0] !== 0 || width <= 0 || height <= 0
    || media[0] !== 0 || media[1] !== 0 || crop[0] !== 0 || crop[1] !== 0
    || !media.every((value, i) => value === crop[i])
    || !close(width, media[2]) || !close(height, media[3])) fail()
  return { pageWidthPt: width, pageHeightPt: height }
}

// Called only after complete sealed OCR raster replay. Metadata alone merely
// records an obligation; none of these JSON checks can replace pixel replay.
function verifyCompletedImageLabelMeasurement(raw, question, decision, evidencePage, pending) {
  const measurement = question.figureLayout?.measurementEvidenceBody
  const obligation = pending?.get(question.questionId)
  const raster = evidencePage?.raster
  const recipe = raster?.recipe
  const close = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 0.01
  const descriptorDigest = digestJson(raster ?? null)
  const mediaIds = [...decision.labels.map(entry => entry.childMediaId), ...(decision.sharedFigure ? [decision.sharedFigure.mediaId] : [])]
  if (!obligation || obligation.decisionDigest !== digestJson(decision)
    || !validateInImageLabelMeasurementBinding(question.figureLayout, decision)
    || !exactKeys(raster, ['recipe', 'sha256', 'pixelWidth', 'pixelHeight'])
    || !exactKeys(recipe, ['kind', 'density', 'region']) || recipe.kind !== 'pdf_page_region_v1'
    || !Number.isFinite(recipe.density) || recipe.density <= 0
    || digestJson(recipe.region) !== digestJson({ x: 0, y: 0, width: 1, height: 1 })
    || !/^sha256:[a-f0-9]{64}$/u.test(raster.sha256 || '')
    || !Number.isInteger(raster.pixelWidth) || !Number.isInteger(raster.pixelHeight)
    || raster.pixelWidth <= 0 || raster.pixelHeight <= 0
    || descriptorDigest !== measurement.labelEvidence.pageRasterDigest
    || descriptorDigest !== decision.sourceReview.reviewedPageRasterDigest
    || !close(measurement.pageWidthPt, obligation.pageWidthPt)
    || !close(measurement.pageHeightPt, obligation.pageHeightPt)
    || Math.abs(raster.pixelWidth - obligation.pageWidthPt * recipe.density / 72) > 1
    || Math.abs(raster.pixelHeight - obligation.pageHeightPt * recipe.density / 72) > 1
    || mediaIds.some(id => {
      const crop = raw.media.find(media => media.mediaId === id)?.extraction
      return crop?.kind !== 'pdf_crop' || crop.documentId !== obligation.documentId
        || crop.page !== obligation.sourcePage || crop.density !== recipe.density
    })) throw new Error('In-image measurement must complete its private obligation against the replayed sealed RGBA descriptor and all same-density crops')
}

function validateBundle(materialization, input, options) {
  const pendingImageLabelMeasurements = []
  const issues = validateNck1SourceMaterialization(materialization, options)
    .map((item) => adapterIssue(item.code, item.message, item.path))
  const documentsById = new Map(input.documents.map((entry) => [entry.documentId, entry]))
  const mediaById = new Map(input.media.map((entry) => [entry.mediaId, entry]))
  const hasImageLabelMeasurements = (Array.isArray(materialization?.groups) ? materialization.groups : [])
    .some(group => Array.isArray(group?.questions) && group.questions.some(question =>
      question?.figureLayout?.measurementEvidenceBody?.schemaVersion === 'reading-source-layout-measurement-v2'))
  if (hasImageLabelMeasurements
    && (!options.allowInImageLabelMeasurement || materialization.schemaVersion !== 'nck1-source-materialization-v13')) {
    issues.push(adapterIssue('MATERIALIZATION_AUTHORITY_UNSUPPORTED', 'Image-label measurement v2 requires its exact v13 authority capability'))
    return { issues, documentsById, mediaById, instructionDocument: null, pendingImageLabelMeasurements }
  }
  if (documentsById.size !== input.documents.length) {
    issues.push(adapterIssue('MATERIALIZATION_SOURCE_DOCUMENT_DUPLICATE', 'Source document bytes must be identified exactly once', '$.documents'))
  }
  if (mediaById.size !== input.media.length) {
    issues.push(adapterIssue('MATERIALIZATION_SOURCE_MEDIA_DUPLICATE', 'Extracted media bytes must be identified exactly once', '$.media'))
  }
  for (const document of materialization?.documents || []) {
    const supplied = documentsById.get(document.documentId)
    if (
      !supplied
      || supplied.bytes.byteLength !== document.byteLength
      || sha256(supplied.bytes) !== document.sha256
    ) {
      issues.push(adapterIssue('MATERIALIZATION_SOURCE_DOCUMENT_MISMATCH', `Source document ${document.documentId} does not match its immutable materialization binding`, '$.documents'))
    }
    if (document.mediaType === NCK1_IMAGE_BUNDLE_MEDIA_TYPE && supplied) {
      try {
        const bundle = parseNck1ImageSourceBundle(supplied.bytes)
        if (bundle.pages.length !== document.pageCount) {
          throw new Error('page count mismatch')
        }
      } catch {
        issues.push(adapterIssue(
          'MATERIALIZATION_IMAGE_BUNDLE_INVALID',
          `Image source bundle ${document.documentId} does not replay its immutable pages`,
          '$.documents',
        ))
      }
    }
  }
  if (documentsById.size !== (materialization?.documents || []).length) {
    issues.push(adapterIssue('MATERIALIZATION_SOURCE_DOCUMENT_SET_MISMATCH', 'Supplied source documents must exactly equal the materialization inventory', '$.documents'))
  }
  issues.push(...validateDocxParagraphBoundaries(materialization, documentsById))
  for (const group of materialization?.groups || []) {
    for (const question of group.questions || []) {
      if (!question.figureLayout) continue
      const measurementV2 = question.figureLayout.measurementEvidenceBody?.schemaVersion === 'reading-source-layout-measurement-v2'
      const temp = mkdtempSync(path.join(tmpdir(), 'eqb-reading-layout-proof-'))
      try {
        const measurement = question.figureLayout.measurementEvidenceBody
        const sourcePath = path.join(temp, 'source.pdf')
        writeFileSync(sourcePath, documentsById.get(question.source.documentId).bytes)
        const bbox = execFileSync('pdftotext', ['-f', String(question.source.page), '-l', String(question.source.page), '-bbox', sourcePath, '-'], { encoding: 'utf8' })
        if (measurementV2) {
          const decisions = materialization.inImageOptionLabels?.filter(decision =>
            decision.schemaVersion === IN_IMAGE_OPTION_LABELS_VERSION_V2 && decision.questionId === question.questionId) || []
          const document = materialization.documents.find(document => document.documentId === question.source.documentId)
          const supplied = documentsById.get(question.source.documentId)
          const info = execFileSync('pdfinfo', ['-f', String(question.source.page), '-l', String(question.source.page), '-box', sourcePath], { encoding: 'utf8' })
          const metadata = inImageLabelPageMetadata(bbox, info, question.source.page)
          if (decisions.length !== 1 || document?.role !== 'question_source'
            || sha256(supplied.bytes) !== document.sha256
            || !validateInImageLabelMeasurementBinding(question.figureLayout, decisions[0])
            || Math.abs(metadata.pageWidthPt - measurement.pageWidthPt) > 0.01
            || Math.abs(metadata.pageHeightPt - measurement.pageHeightPt) > 0.01
            || pendingImageLabelMeasurements.some(value => value.questionId === question.questionId)) {
            throw new Error('Image-label measurement metadata/decision binding does not replay')
          }
          pendingImageLabelMeasurements.push({ questionId: question.questionId,
            decisionDigest: digestJson(decisions[0]), documentId: document.documentId,
            sourcePage: question.source.page, ...metadata })
          continue
        }
        const page = bbox.match(/<page width="([\d.]+)" height="([\d.]+)">/)
        // Poppler's bbox output is machine-generated, not source-authored XML.
        const labels = [...bbox.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([ABCD])\.<\/word>/g)]
        const close = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 0.5
        if (!page || !close(Number(page[1]), measurement.pageWidthPt) || !close(Number(page[2]), measurement.pageHeightPt)
          || !measurement.labels.every((label) => labels.some((word) => word[5] === label.label
            && close(Number(word[1]), label.leftPt) && close(Number(word[2]), label.topPt)
            && close(Number(word[3]) - Number(word[1]), label.widthPt)
            && close(Number(word[4]) - Number(word[2]), label.heightPt)))) {
          throw new Error('Source label or page measurement does not replay')
        }
      } catch {
        issues.push(adapterIssue('MATERIALIZATION_FIGURE_MEASUREMENT_UNVERIFIED', measurementV2
          ? 'Image-label measurement must bind its v2 decision and replay one unrotated zero-origin PDF page with identical boxes within 0.01pt'
          : 'Measured Reading layout must replay source PDF page dimensions and A-D label boxes within 0.5pt', '$.groups'))
      } finally {
        rmSync(temp, { recursive: true, force: true })
      }
    }
  }
  for (const media of materialization?.media || []) {
    const supplied = mediaById.get(media.mediaId)
    if (!supplied || sha256(supplied.bytes) !== media.sha256) {
      issues.push(adapterIssue('MATERIALIZATION_SOURCE_MEDIA_MISMATCH', `Extracted media ${media.mediaId} does not match its immutable materialization binding`, '$.media'))
      continue
    }
    try {
      const dimensions = execFileSync(
        'magick', ['identify', '-format', '%w,%h', '-'], {
          encoding: 'utf8',
          input: supplied.bytes,
        },
      ).split(',').map(Number)
      if (dimensions[0] !== media.pixelWidth || dimensions[1] !== media.pixelHeight) {
        issues.push(adapterIssue('MATERIALIZATION_MEDIA_DIMENSIONS_MISMATCH', `Media ${media.mediaId} dimensions do not match its immutable inventory`, '$.media'))
      }
    } catch {
      issues.push(adapterIssue('MATERIALIZATION_MEDIA_IMAGE_INVALID', `Media ${media.mediaId} is not a readable source image`, '$.media'))
    }
    const sourceDocument = documentsById.get(media.extraction.documentId)
    try {
      const reextracted = reextractMedia(media, sourceDocument.bytes)
      if (
        reextracted.byteLength !== supplied.bytes.byteLength
        || sha256(reextracted) !== sha256(supplied.bytes)
      ) {
        issues.push(adapterIssue('MATERIALIZATION_MEDIA_RECIPE_MISMATCH', `Media ${media.mediaId} does not replay exactly from its immutable source recipe`, '$.media'))
      }
    } catch {
      issues.push(adapterIssue('MATERIALIZATION_MEDIA_RECIPE_UNAVAILABLE', `Media ${media.mediaId} cannot be replayed from its immutable source recipe`, '$.media'))
    }
    const candidate = media.publication?.candidate
    if (!candidate && supplied.renditionBytes) {
      issues.push(adapterIssue('MATERIALIZATION_MEDIA_RENDITION_UNEXPECTED', `Media ${media.mediaId} supplied rendition bytes without a declared candidate`, '$.media'))
      continue
    }
    if (candidate && !supplied.renditionBytes) {
      issues.push(adapterIssue('MATERIALIZATION_MEDIA_RENDITION_MISSING', `Media ${media.mediaId} declares a candidate without immutable rendition bytes`, '$.media'))
      continue
    }
    if (!candidate) continue
    try {
      const identified = identifyImage(supplied.renditionBytes)
      if (
        sha256(supplied.renditionBytes) !== candidate.sha256
        || identified.mimeType !== candidate.mimeType
        || identified.pixelWidth !== candidate.pixelWidth
        || identified.pixelHeight !== candidate.pixelHeight
      ) {
        issues.push(adapterIssue('MATERIALIZATION_MEDIA_RENDITION_MISMATCH', `Media ${media.mediaId} candidate bytes do not match their immutable declaration`, '$.media'))
        continue
      }
    } catch {
      issues.push(adapterIssue('MATERIALIZATION_MEDIA_RENDITION_INVALID', `Media ${media.mediaId} candidate is not a readable supported image`, '$.media'))
      continue
    }
    if (candidate.kind === 'deterministic_enhancement') {
      try {
        const replayed = replayDeterministicEnhancement(supplied.bytes, candidate)
        if (sha256(replayed) !== candidate.sha256) {
          issues.push(adapterIssue('MATERIALIZATION_MEDIA_ENHANCEMENT_REPLAY_MISMATCH', `Media ${media.mediaId} deterministic enhancement does not replay exactly`, '$.media'))
        }
      } catch {
        issues.push(adapterIssue('MATERIALIZATION_MEDIA_ENHANCEMENT_REPLAY_UNAVAILABLE', `Media ${media.mediaId} deterministic enhancement tool and version are unavailable`, '$.media'))
      }
    }
  }
  if (mediaById.size !== (materialization?.media || []).length) {
    issues.push(adapterIssue('MATERIALIZATION_SOURCE_MEDIA_SET_MISMATCH', 'Supplied media must exactly equal the materialization inventory', '$.media'))
  }
  const instructionDocument = (materialization?.documents || []).find((document) =>
    document.mediaType === 'application/pdf'
    && ['question_source', 'question_and_answers'].includes(document.role))
  if (!instructionDocument) {
    issues.push(adapterIssue('MATERIALIZATION_PROFILE_INSTRUCTION_PDF_REQUIRED', 'NCK1 Candidate derivation requires one immutable PDF source or deterministic DOCX PDF rendition for Profile instruction evidence', '$.documents'))
  }
  const contentSvg = (materialization?.media || []).find((media) =>
    media.usage === 'content' && media.mimeType === 'image/svg+xml')
  if (contentSvg) {
    issues.push(adapterIssue('MATERIALIZATION_CONTENT_MEDIA_TYPE_UNSUPPORTED', 'Canonical content media must be converted deterministically to PNG, JPEG, or WebP while retaining its source extraction recipe', '$.media'))
  }
  return { issues, documentsById, mediaById, instructionDocument, pendingImageLabelMeasurements }
}

function canonicalInline(item, blockId, index) {
  if (item.kind === 'blank_ref') {
    return {
      kind: 'blank_ref',
      nodeId: `blank-ref:${item.blankId}`,
      blankId: item.blankId,
    }
  }
  return {
    kind: 'text',
    nodeId: `text:${blockId}:${index + 1}`,
    text: item.text,
  }
}

function canonicalTableInline(item, cellId, index) {
  if (item.kind === 'media_ref') {
    return {
      kind: 'media_ref',
      nodeId: `media-ref:${cellId}:${index + 1}`,
      mediaId: item.mediaId,
      alt: item.alt,
    }
  }
  return {
    kind: 'text',
    nodeId: `text:${cellId}:${index + 1}`,
    text: item.text,
  }
}

function canonicalBlock(block) {
  if (block.kind === 'paragraph') {
    return {
      kind: 'paragraph',
      nodeId: block.blockId,
      inlines: block.content.map((item, index) =>
        canonicalInline(item, block.blockId, index)),
    }
  }
  if (block.kind === 'table') {
    return {
      kind: 'table',
      nodeId: block.blockId,
      columnCount: block.columnCount,
      rows: block.rows.map((row) => ({
        rowId: row.rowId,
        cells: row.cells.map((cell) => ({
          cellId: cell.cellId,
          columnStart: cell.columnStart,
          columnSpan: cell.columnSpan,
          rowSpan: cell.rowSpan,
          role: cell.role,
          inlines: cell.content.map((item, index) =>
            canonicalTableInline(item, cell.cellId, index)),
        })),
      })),
    }
  }
  if (block.kind === 'figure') {
    return {
      kind: 'figure',
      nodeId: block.blockId,
      mediaId: block.mediaId,
      caption: block.caption.length > 0
        ? [{ kind: 'text', nodeId: `caption:${block.blockId}`, text: block.caption }]
        : [],
    }
  }
  return {
    kind: 'framed_columns',
    nodeId: block.blockId,
    columnCount: 2,
    columns: block.columns.map((column) => ({
      columnId: column.columnId,
      ...(column.headingBlockId === null
        ? {}
        : { columnHeading: column.headingBlockId }),
      blocks: column.blocks.map(canonicalBlock),
    })),
  }
}

function referencedMediaIds(blocks, ids = []) {
  for (const block of blocks) {
    if (block.kind === 'figure') ids.push(block.mediaId)
    if (block.kind === 'table') {
      for (const row of block.rows) {
        for (const cell of row.cells) {
          for (const item of cell.content) {
            if (item.kind === 'media_ref') ids.push(item.mediaId)
          }
        }
      }
    }
    if (block.kind === 'framed_columns') {
      for (const column of block.columns) referencedMediaIds(column.blocks, ids)
    }
  }
  return ids
}

function option(groupId, questionId, value, shared = false) {
  const optionId = shared
    ? `option:${value.label}`
    : `option:${questionId}:${value.label}`
  if (value.figure) {
    return { optionId, label: value.label, figure: structuredClone(value.figure) }
  }
  return {
    optionId,
    label: value.label,
    content: [{
      kind: 'text',
      nodeId: `text:${groupId}:${optionId}`,
      text: value.text,
    }],
  }
}

function choiceOwnership(group) {
  if (group.family === 'seven-choices') {
    return {
      ownership: 'shared_bank',
      bankId: `bank:${group.groupId}`,
      options: group.optionBank.map((value) =>
        option(group.groupId, null, value, true)),
    }
  }
  if (['reading', 'cloze'].includes(group.family)) {
    return {
      ownership: 'per_question',
      sets: group.questions.map((question) => ({
        questionId: question.questionId,
        options: question.options.map((value) =>
          option(group.groupId, question.questionId, value)),
      })),
    }
  }
  return { ownership: 'none' }
}

function paragraphText(block) {
  if (block.kind !== 'paragraph') return ''
  return block.content.map((item) => item.kind === 'text' ? item.text : '').join('')
}

function paragraphRef(block) {
  return {
    blockId: block.blockId,
    inlineNodeIds: block.content.map((item, index) =>
      item.kind === 'text' ? `text:${block.blockId}:${index + 1}` : null)
      .filter(Boolean),
  }
}

function writingObservation(source, documentsById, group, observationId, kind, value, locator = group.writingTask.source) {
  source.observations.push(observationForLocator(
    observationId,
    kind,
    locator,
    value,
    documentsById,
  ))
}

function writingVariant(group, content, issues, source, documentsById, { allowPromptFigures = false, allowDrawingArea = false, allowMultipleApplicationNotices = false } = {}) {
  const task = group.writingTask
  const sourceText = group.blocks.map(paragraphText).join('\n')
  const requiredText = [
    task.prompt,
    ...task.material,
    ...task.starters,
    ...task.givenSkeleton.map((part) => part.text),
  ]
  if (requiredText.some((text) => !sourceText.includes(text))) {
    issues.push(adapterIssue('MATERIALIZATION_WRITING_CONTENT_UNRESOLVED', `Writing semantics for ${group.groupId} do not resolve to its source block stream`, '$.groups'))
  }
  const writingTaskId = `writing-task:${group.groupId}`
  // Under the prompt-figure capability, a figure stays in the source stream and
  // ends any paragraph run, exactly as Screen and Print group notices.
  const promptFigures = allowPromptFigures && group.family === 'application-writing'
    && group.blocks.some(block => block.kind === 'figure')
  const multiple = allowMultipleApplicationNotices && group.family === 'application-writing'
    && writingNoticeGroups(group.blocks.map(block => block.blockId === task.drawingArea?.labelBlockRef ? '' : paragraphText(block))).length > 1
  const paragraphs = multiple ? group.blocks : (promptFigures ? group.blocks : group.blocks.filter(block => block.kind === 'paragraph'))
    .filter(block => block.blockId !== task.drawingArea?.labelBlockRef)
  const notice = writingNoticeGroup(paragraphs.map(block => block.blockId === task.drawingArea?.labelBlockRef ? '' : normalizedWritingText(paragraphText(block))))
  const noticeBlocks = notice ? paragraphs.slice(notice.startIndex, notice.startIndex + notice.blockCount) : []
  const wordCountBlock = noticeBlocks.find(block => writingWordCount(paragraphText(block)) === task.wordCountTarget)
  if (!wordCountBlock) {
    issues.push(adapterIssue('MATERIALIZATION_WRITING_WORD_COUNT_UNRESOLVED', `Writing word-count source for ${group.groupId} must resolve to one paragraph`, '$.groups'))
    return null
  }
  if (group.family === 'application-writing') {
    const drawing = task.drawingArea
    if (drawing && !allowDrawingArea) {
      issues.push(adapterIssue('MATERIALIZATION_DRAWING_AREA_UNSUPPORTED', 'This authority does not admit application drawing areas'))
      return null
    }
    const givenBlocks = Object.hasOwn(task, 'givenBlockRefs')
      ? resolveWritingGivenBlocks(group.blocks, task, group.family, { allowMultipleApplicationNotices })
      : paragraphs.slice(notice.startIndex + notice.blockCount)
        .filter(block => block.kind === 'paragraph' && block.blockId !== drawing?.labelBlockRef)
    if (!givenBlocks) {
      issues.push(adapterIssue('MATERIALIZATION_WRITING_GIVEN_REFS_INVALID', 'Application givens must resolve to one exact source response run', '$.groups'))
      return null
    }
    const givenParts = task.givenSkeleton.map((part, index) => {
      const block = givenBlocks[index]
      if (!block || paragraphText(block) !== part.text) {
        issues.push(adapterIssue('MATERIALIZATION_APPLICATION_GIVEN_UNRESOLVED', `Application fixed text must resolve exactly once in ${group.groupId}`, '$.groups'))
        return null
      }
      const givenPartId = `given-part:${group.groupId}:${index + 1}`
      const authorityAssertionRef = `observation:application:${group.groupId}:given:${index + 1}`
      const placement = ['title', 'salutation', 'opening'].includes(part.role)
        ? 'answer_region_top'
        : 'answer_region_bottom'
      writingObservation(
        source,
        documentsById,
        group,
        authorityAssertionRef,
        'application_given_part',
        {
          groupId: group.groupId,
          givenPartId,
          role: part.role,
          placement,
          blockRef: block.blockId,
        },
        block.source,
      )
      return {
        givenPartId,
        role: part.role,
        placement,
        blockRef: block.blockId,
        authorityAssertionRef,
      }
    }).filter(Boolean)
    const givenBlockIds = new Set(givenParts.map((part) => part.blockRef))
    // The prompt owns every non-given source block in order; textual semantic
    // refs come only from its paragraphs. Figures are source-backed media.
    const promptBlocks = group.blocks.filter((block) =>
      (block.kind === 'paragraph' || (promptFigures && block.kind === 'figure'))
      && !givenBlockIds.has(block.blockId) && block.blockId !== drawing?.labelBlockRef)
    const promptParagraphs = promptBlocks.filter((block) => block.kind === 'paragraph')
    const situationBlock = promptParagraphs.find((block) =>
      paragraphText(block).includes(task.prompt)) || promptParagraphs[0]
    const firstGivenIndex = group.blocks.findIndex((block) => givenBlockIds.has(block.blockId))
    if (!situationBlock || promptBlocks.length + givenParts.length + (drawing ? 1 : 0) !== group.blocks.length
      || (firstGivenIndex >= 0 && group.blocks.slice(firstGivenIndex).some((block) => block.kind === 'figure'))) {
      issues.push(adapterIssue('MATERIALIZATION_APPLICATION_PROMPT_UNRESOLVED', `Application prompt for ${group.groupId} must resolve to paragraph blocks${promptFigures ? ' and source figures before fixed text' : ''}`, '$.groups'))
      return null
    }
    const wordObservationRef = `observation:application:${group.groupId}:word-count`
    const responseObservationRef = `observation:application:${group.groupId}:response`
    writingObservation(source, documentsById, group, wordObservationRef, 'application_word_count_ruling', {
      groupId: group.groupId,
      target: task.wordCountTarget,
      countScope: 'student_authored_only',
    }, wordCountBlock.source)
    writingObservation(source, documentsById, group, responseObservationRef, 'application_response_binding', {
      groupId: group.groupId,
      writingTaskId,
      answerRegionRef: 'writing.application-box',
    })
    let givenSkeleton
    if (givenParts.length > 0) {
      givenSkeleton = { presence: 'provided', parts: givenParts }
    } else {
      const absenceRef = `observation:application:${group.groupId}:answer-region-empty`
      writingObservation(source, documentsById, group, absenceRef, 'application_answer_region_absence', {
        groupId: group.groupId,
        answerRegionRef: 'writing.application-box',
      })
      givenSkeleton = {
        presence: 'none',
        answerRegionAbsenceAssertionRef: absenceRef,
      }
    }
    let drawingArea
    if (drawing) {
      const drawingAreaId = `drawing-area:${group.groupId}:1`
      const authorityObservationRef = `observation:application:${group.groupId}:drawing-area`
      writingObservation(source, documentsById, group, authorityObservationRef, 'application_drawing_area', {
        groupId: group.groupId, drawingAreaId, placement: drawing.placement, labelBlockRef: drawing.labelBlockRef,
      }, drawing.source)
      source.observations.find(item => item.observationId === authorityObservationRef).extraction = {
        adapterId: 'nck1-source-materialization', version: '9',
      }
      drawingArea = { drawingAreaId, placement: drawing.placement, labelBlockRef: drawing.labelBlockRef, authorityObservationRef }
    }
    const situationRef = paragraphRef(situationBlock)
    return {
      family: 'application-writing',
      writingTaskId,
      promptBlockRefs: promptBlocks.map((block) => block.blockId),
      situation: {
        writerRole: situationRef,
        audienceOrDestination: situationRef,
        deliverable: situationRef,
        communicativePurpose: situationRef,
      },
      contentRequirements: promptParagraphs
        .map((block, index) => ({
          requirementId: `requirement:${group.groupId}:${index + 1}`,
          contentRef: paragraphRef(block),
        })),
      wordCountRuling: {
        kind: 'approximate_target',
        target: task.wordCountTarget,
        countScope: 'student_authored_only',
        sourceRef: paragraphRef(wordCountBlock),
        authorityObservationRef: wordObservationRef,
      },
      givenSkeleton,
      choiceOwnership: { ownership: 'none' },
      response: {
        kind: 'group_level_written_response',
        answerRegionRef: 'writing.application-box',
        authorityObservationRef: responseObservationRef,
        ...(drawingArea ? { drawingArea } : {}),
      },
    }
  }
  const starters = task.starters.map((starter, index) => {
    const matches = group.blocks.filter((block) =>
      block.kind === 'paragraph' && paragraphText(block) === starter)
    if (matches.length !== 1) {
      issues.push(adapterIssue('MATERIALIZATION_CONTINUATION_STARTER_UNRESOLVED', `Continuation starter must resolve exactly once in ${group.groupId}`, '$.groups'))
      return null
    }
    const starterId = `starter:${group.groupId}:${index + 1}`
    const authorityObservationRef = `observation:continuation:${group.groupId}:starter:${index + 1}`
    writingObservation(source, documentsById, group, authorityObservationRef, 'continuation_source_starter', {
      groupId: group.groupId,
      starterId,
      contentRef: matches[0].blockId,
    }, matches[0].source)
    return { starterId, contentRef: matches[0].blockId, authorityObservationRef }
  }).filter(Boolean)
  const starterBlockIds = new Set(starters.map((starter) => starter.contentRef))
  const promptBlocks = group.blocks.filter((block) =>
    block.kind === 'paragraph' && paragraphText(block) === task.prompt)
  if (promptBlocks.length !== 1) {
    issues.push(adapterIssue('MATERIALIZATION_CONTINUATION_PROMPT_UNRESOLVED', `Continuation prompt must resolve exactly once in ${group.groupId}`, '$.groups'))
    return null
  }
  const materialBlockRefs = group.blocks
    .filter((block) =>
      !starterBlockIds.has(block.blockId)
      && block.blockId !== promptBlocks[0].blockId)
    .map((block) => block.blockId)
  const wordObservationRef = `observation:continuation:${group.groupId}:word-count`
  const responseObservationRef = `observation:continuation:${group.groupId}:response`
  writingObservation(source, documentsById, group, wordObservationRef, 'continuation_word_count_ruling', {
    groupId: group.groupId,
    target: task.wordCountTarget,
    countScope: 'student_authored_only',
  }, wordCountBlock.source)
  writingObservation(source, documentsById, group, responseObservationRef, 'continuation_response_binding', {
    groupId: group.groupId,
    writingTaskId,
    answerRegionRef: 'writing.continuation-box',
  })
  return {
    family: 'continuation-writing',
    writingTaskId,
    sourceInstruction: {
      instructionId: 'writing.continuation.prompt',
      placement: 'group_instruction',
      text: task.prompt,
      authorityObservationRef:
        `observation:profile-instruction:${source.paperId}:writing.continuation.prompt`,
    },
    materialBlockRefs,
    wordCountRuling: {
      kind: 'approximate_target',
      target: task.wordCountTarget,
      countScope: 'student_authored_only',
      sourceRef: paragraphRef(wordCountBlock),
      authorityObservationRef: wordObservationRef,
    },
    starterProvision: { kind: 'ordered_source_starters', starters },
    choiceOwnership: { ownership: 'none' },
    response: {
      kind: 'group_level_written_response',
      answerRegionRef: 'writing.continuation-box',
      authorityObservationRef: responseObservationRef,
    },
  }
}

function groupVariant(group, answersByQuestionId, content, issues, source, documentsById, writingOptions) {
  const ownership = choiceOwnership(group)
  const roles = group.blocks
    .filter((block) =>
      block.kind === 'paragraph' && block.role !== 'body')
    .map((block) => ({ nodeId: block.blockId, role: block.role }))
  roles.sort((left, right) => left.nodeId.localeCompare(right.nodeId))
  if (group.family === 'reading') {
    return {
      family: 'reading',
      passageBlockRoles: roles,
      questions: group.questions.map((question) => ({
        questionId: question.questionId,
        stem: [{
          kind: 'text',
          nodeId: `text:${question.questionId}:stem`,
          text: question.stem,
        }],
        correctOptionId:
          `option:${question.questionId}:${answersByQuestionId.get(question.questionId)}`,
        ...(question.figureLayout ? { figureLayout: structuredClone(question.figureLayout) } : {}),
        ...(question.stemFigures ? { stemFigures: question.stemFigures.map(canonicalBlock) } : {}),
      })),
      choiceOwnership: ownership,
    }
  }
  if (group.family === 'seven-choices') {
    return {
      family: 'seven-choices',
      passageBlockRoles: roles,
      members: group.questions.map((question) => ({
        questionId: question.questionId,
        blankId: question.blankId,
        answer: {
          optionId: `option:${answersByQuestionId.get(question.questionId)}`,
          authorityAssertionRef: `answer:${question.questionId}`,
        },
      })),
      choiceOwnership: ownership,
    }
  }
  if (group.family === 'grammar-fill') {
    return {
      family: 'grammar-fill',
      promptBindings: group.questions.map((question) => ({
        blankId: question.blankId,
        provision: question.prompt === null
          ? 'source_proven_none'
          : 'source_prompt',
        ...(question.prompt === null ? {} : { prompt: question.prompt }),
        authorityObservationRef: `observation:grammar-prompt:${question.questionId}`,
      })),
      choiceOwnership: ownership,
    }
  }
  if (['application-writing', 'continuation-writing'].includes(group.family)) {
    return writingVariant(group, content, issues, source, documentsById, writingOptions)
  }
  return { family: group.family, choiceOwnership: ownership }
}

function observationForLocator(observationId, kind, locator, value, documentsById) {
  const document = documentsById.get(locator.documentId)
  const packageEvidence = locator.kind === 'package_json_pointer'
    ? {
        schemaVersion: 'package-json-pointer-evidence-v1',
        memberId: locator.documentId,
        pointer: locator.pointer,
        memberSha256: sha256(document.bytes),
        memberByteLength: document.bytes.byteLength,
        memberRole: document.role,
      }
    : null
  return {
    observationId,
    kind,
    documentInputKey: inputKeyForDocument(locator.documentId),
    value: packageEvidence
      && kind === 'profile_instruction_correction'
      && value
      && typeof value === 'object'
      ? { ...structuredClone(value), packageEvidence }
      : value,
    span: ['application_drawing_area', 'application_structured_answer_region'].includes(kind)
      ? Object.fromEntries(Object.entries(locator).filter(([key]) => key !== 'documentId'))
      : { start: 0, end: document.bytes.byteLength },
    extraction: packageEvidence
      ? { adapterId: 'nck1-analyzed-package', version: '1' }
      : {
          adapterId: 'nck1-source-materialization',
          version: '2',
          locator,
        },
  }
}

function instructionEvidence(materialization, instructionDocument, authorityRef) {
  const authority = resolveCanonicalAuthority(authorityRef)
  const instruction = authority.closure.profiles.get('nck1')
    .instructions['writing.continuation.prompt']
  const continuation = materialization.groups.find((group) =>
    group.slotId === 'writing.continuation')
  const locator = continuation.writingTask.source
  const page = locator.kind === 'page_region'
    && locator.documentId === instructionDocument.documentId
    ? locator.page
    : 1
  const region = locator.kind === 'page_region'
    && locator.documentId === instructionDocument.documentId
    ? locator.region
    : { x: 0, y: 0, width: 1, height: 1 }
  return {
    schemaVersion: 'profile-writing-source-evidence-v1',
    paperId: materialization.paperId,
    profileId: 'nck1',
    sourceDocumentDigest: instructionDocument.sha256,
    review: { method: 'manual_source_transcription', status: 'accepted' },
    sourceLocation: {
      kind: 'pdf_page_region',
      page,
      region,
      locator: `nck1-source-materialization:${continuation.groupId}`,
    },
    instruction,
    transformationRecord: {
      recordId: `transformation:${materialization.paperId}:continuation-instruction`,
      ruleId: 'source-exact-transcription',
      ruleVersion: '1',
      certainty: 'exact',
      before: continuation.writingTask.prompt,
      after: instruction.text,
      proof: 'Accepted NCK1 Source Materialization binds the source instruction location.',
    },
  }
}

function appendListeningGroups(source, materialization, documentsById, listeningInstructionCorrection = null) {
  if (materialization.listening.state === 'not_supplied') {
    source.inactiveSlots['listening.short-dialogue'] = 'not_supplied'
    source.inactiveSlots['listening.long-form'] = 'not_supplied'
    return
  }
  const specs = [
    { slotId: 'listening.short-dialogue', from: 1, to: 5 },
    { slotId: 'listening.long-form', from: 6, to: 20 },
  ]
  for (const spec of specs) {
    const observations = []
    const relevantQuestions = materialization.listening.questions.filter((question) =>
      question.canonicalNumber >= spec.from && question.canonicalNumber <= spec.to)
    const relevantAnswers = materialization.listening.answers.filter((answer) =>
      answer.canonicalNumber >= spec.from && answer.canonicalNumber <= spec.to)
    const relevantTranscript = materialization.listening.transcript.filter((segment) =>
      segment.questionNumbers.some((number) => number >= spec.from && number <= spec.to))
    for (const question of relevantQuestions) {
      observations.push(observationForLocator(
        `observation:listening:question:${question.canonicalNumber}`,
        'listening_question',
        question.source,
        question,
        documentsById,
      ))
    }
    for (const answer of relevantAnswers) {
      const observation = observationForLocator(
        `observation:listening:answer:${answer.canonicalNumber}`,
        'listening_official_answer',
        answer.authority,
        answer,
        documentsById,
      )
      observations.push(observation)
      source.assertions.push({
        assertionId: `answer:listening:${answer.canonicalNumber}`,
        questionId: `question:listening:${answer.canonicalNumber}`,
        answer: answer.value,
        authority: 'official',
        sourceSpanId: `source-span:${observation.observationId}`,
      })
    }
    for (const segment of relevantTranscript) {
      observations.push(observationForLocator(
        `observation:listening:transcript:${segment.segmentId}`,
        'listening_transcript',
        segment.source,
        segment,
        documentsById,
      ))
    }
    source.observations.push(...observations)
    const sourceSliceRefs = observations.map((observation) =>
      `source-span:${observation.observationId}`)
    const groupId = `group:${materialization.paperId}:${spec.slotId}`
    const questionSpanRefs = Object.fromEntries(relevantQuestions.flatMap((question) => {
      const questionId = `question:listening:${question.canonicalNumber}`
      const sourceSpanRefs = [
        `source-span:observation:listening:question:${question.canonicalNumber}`,
      ]
      return [
        [`question:${questionId}`, sourceSpanRefs],
        [`content_node:text:${questionId}:stem`, sourceSpanRefs],
        ...question.options.flatMap((value) => {
          const optionId = `option:${questionId}:${value.label}`
          return [
            [`option:${optionId}`, sourceSpanRefs],
            [`content_node:text:${groupId}:${optionId}`, sourceSpanRefs],
          ]
        }),
      ]
    }))
    const transcriptSpanRefs = Object.fromEntries(relevantTranscript.flatMap((segment) => {
      const spanRefs = [
        `source-span:observation:listening:transcript:${segment.segmentId}`,
      ]
      return [
        [`transcript_segment:${segment.segmentId}`, spanRefs],
        [`content_node:text:${groupId}:transcript:${segment.segmentId}`, spanRefs],
      ]
    }))
    source.groups.push({
      paperId: materialization.paperId,
      groupId,
      slotId: spec.slotId,
      profileId: 'nck1',
      family: 'listening',
      questionIds: relevantQuestions.map((question) =>
        `question:listening:${question.canonicalNumber}`),
      blankIds: [],
      sourceSpanId: sourceSliceRefs[0],
      content: { blocks: [] },
      media: [],
      variant: {
        family: 'listening',
        ...(spec.slotId === 'listening.short-dialogue'
          && (listeningInstructionCorrection?.correction.instructions.find(entry => entry.slotId === spec.slotId)?.playCount
            ?? (materialization.listening.timing.some(entry => entry?.kind === 'section1_playback' && entry.passes === 1) ? 1 : 2)) === 1
          ? { firstSectionPlayback: 'once_explicit' }
          : {}),
        questions: relevantQuestions.map((question) => {
          const questionId = `question:listening:${question.canonicalNumber}`
          return {
            questionId,
            stem: [{
              kind: 'text',
              nodeId: `text:${questionId}:stem`,
              text: question.stem,
            }],
            correctOptionId:
              `option:${questionId}:${relevantAnswers.find((answer) =>
                answer.canonicalNumber === question.canonicalNumber).value}`,
          }
        }),
        transcriptSegments: relevantTranscript.map((segment) => ({
          segmentId: segment.segmentId,
          content: [{
            kind: 'text',
            nodeId: `text:${groupId}:transcript:${segment.segmentId}`,
            text: segment.text,
          }],
          questionIds: segment.questionNumbers.map((number) =>
            `question:listening:${number}`),
        })),
        choiceOwnership: {
          ownership: 'per_question',
          sets: relevantQuestions.map((question) => {
            const questionId = `question:listening:${question.canonicalNumber}`
            return {
              questionId,
              options: question.options.map((value) =>
                option(groupId, questionId, value)),
            }
          }),
        },
      },
      sourceSpanRefsByTarget: {
        [`group:${groupId}`]: sourceSliceRefs,
        ...questionSpanRefs,
        ...transcriptSpanRefs,
      },
    })
  }
}

export function deriveNck1SemanticSource(
  materialization,
  documentsById,
  mediaById,
  instructionDocument,
  issues,
  { analyzedPackage = false, authorityRef = nck1MaterializationCandidateAuthorityRef, listeningInstructionCorrection = null } = {},
) {
  const answersByQuestionId = new Map(materialization.answers.map((answer) => [
    answer.questionId,
    answer.value,
  ]))
  const mediaInventoryById = new Map(materialization.media.map((media) => [
    media.mediaId,
    media,
  ]))
  const source = {
    paperId: materialization.paperId,
    profileId: 'nck1',
    sourceAssetVersion: 1,
    profileInstructionSourceDigest: instructionDocument.sha256,
    observations: [],
    assertions: [],
    groups: [],
    transformations: [],
    inactiveSlots: {},
    inactiveSourceClosures: [],
  }
  for (const visual of materialization.sourceCoverage?.visuals || []) {
    if (visual.disposition !== 'structured_answer_region') continue
    const observation = observationForLocator(
      `observation:application:${visual.targetId}:structured-answer-region`,
      'application_structured_answer_region',
      { kind: 'page_region', documentId: materialization.sourceCoverage.documentId,
        page: visual.page, region: structuredClone(visual.region) },
      { groupId: visual.targetId, drawingAreaId: `drawing-area:${visual.targetId}:1`,
        visualId: visual.visualId, disposition: visual.disposition },
      documentsById,
    )
    observation.extraction = { adapterId: 'nck1-source-materialization', version: '9' }
    source.observations.push(observation)
  }
  if (analyzedPackage) {
    const continuation = materialization.groups.find((group) =>
      group.slotId === 'writing.continuation')
    const instruction = resolveCanonicalAuthority(
      authorityRef,
    ).closure.profiles.get('nck1').instructions['writing.continuation.prompt']
    if (continuation?.writingTask?.prompt !== instruction.text) {
      issues.push(adapterIssue(
        'ANALYZED_PACKAGE_CONTINUATION_INSTRUCTION_UNSUPPORTED',
        'Analyzed packages may directly attest the registered continuation instruction; differing source wording needs a separately registered transformation',
        '$.groups',
      ))
    } else {
      const locator = continuation.writingTask.source
      source.observations.push(observationForLocator(
        `observation:profile-instruction:${source.paperId}:writing.continuation.prompt`,
        'profile_instruction_correction',
        locator,
        {
          paperId: source.paperId,
          instructionId: instruction.instructionId,
          text: instruction.text,
          agreement: 'exact_package_member_value',
        },
        documentsById,
      ))
    }
  }
  for (const group of materialization.groups) {
    const sourceLocator = group.blocks[0].source
    const groupObservation = observationForLocator(
      `observation:materialization:group:${group.groupId}`,
      'nck1_materialized_group',
      sourceLocator,
      { groupId: group.groupId, slotId: group.slotId },
      documentsById,
    )
    source.observations.push(groupObservation)
    for (const question of group.questions) {
      const answer = materialization.answers.find((candidate) =>
        candidate.questionId === question.questionId)
      const answerObservation = observationForLocator(
        `observation:official-answer:${question.questionId}`,
        'official_answer',
        answer.authority,
        answer,
        documentsById,
      )
      source.observations.push(answerObservation)
      source.assertions.push({
        assertionId: `answer:${question.questionId}`,
        questionId: question.questionId,
        answer: answer.value,
        authority: 'official',
        sourceSpanId: `source-span:${answerObservation.observationId}`,
      })
      if (group.family === 'grammar-fill') {
        source.observations.push(observationForLocator(
          `observation:grammar-prompt:${question.questionId}`,
          'grammar_fill_prompt_provision',
          question.source,
          {
            blankId: question.blankId,
            provision: question.prompt === null
              ? 'source_proven_none'
              : 'source_prompt',
            ...(question.prompt === null ? {} : { prompt: question.prompt }),
          },
          documentsById,
        ))
      }
    }
    for (const question of group.questions) {
      for (const figure of question.stemFigures || []) {
        const observation = observationForLocator(
          `observation:stem-figure:${figure.blockId}`, 'source_question_figure',
          figure.source, { blockId: figure.blockId, mediaId: figure.mediaId }, documentsById,
        )
        observation.extraction.version = '10'
        source.observations.push(observation)
      }
    }
    const canonicalBlocks = group.family === 'continuation-writing'
      ? group.blocks.filter((block) =>
          block.kind !== 'paragraph'
          || paragraphText(block) !== group.writingTask.prompt)
      : group.blocks
    const content = { blocks: canonicalBlocks.map(canonicalBlock) }
    const groupMedia = [
      ...referencedMediaIds(group.blocks),
      ...group.questions.flatMap(question => referencedMediaIds(question.stemFigures || [])),
      ...group.questions.flatMap((question) => question.options
        .filter((value) => value.figure).map((value) => value.figure.mediaId)),
    ].map((mediaId) => {
      const media = mediaInventoryById.get(mediaId)
      const selected = selectedMedia(media, mediaById.get(mediaId))
      return {
        mediaId,
        mimeType: selected.mimeType,
        sha256: selected.sha256,
        pixelWidth: selected.pixelWidth,
        pixelHeight: selected.pixelHeight,
        sourceArtifactRef: { artifactId: stableArtifactId(selected.bytes) },
      }
    })
    for (const media of groupMedia) {
      const mediaObservationId = `observation:source-media:${media.mediaId}`
      const mediaBytes = mediaById.get(media.mediaId).bytes
      const inventory = mediaInventoryById.get(media.mediaId)
      source.observations.push({
        observationId: mediaObservationId,
        kind: 'source_media',
        documentInputKey: inventory.extraction?.kind === 'package_member'
          ? inputKeyForDocument(inventory.extraction.memberId)
          : inputKeyForMedia(media.mediaId),
        value: {
          mediaId: media.mediaId,
          sha256: inventory.sha256,
          pixelWidth: inventory.pixelWidth,
          pixelHeight: inventory.pixelHeight,
          ...(inventory.extraction?.kind === 'package_member'
            ? {
                packageMemberEvidence: {
                  schemaVersion: 'package-member-evidence-v1',
                  memberId: inventory.extraction.memberId,
                  memberSha256: sha256(mediaBytes),
                  memberByteLength: mediaBytes.byteLength,
                  memberRole: 'media',
                },
              }
            : {}),
          ...(['nck1-source-materialization-v2', 'nck1-source-materialization-v3', 'nck1-source-materialization-v4', 'nck1-source-materialization-v5', 'nck1-source-materialization-v6', 'nck1-source-materialization-v7', 'nck1-source-materialization-v8', 'nck1-source-materialization-v9', 'nck1-source-materialization-v10', 'nck1-source-materialization-v11', 'nck1-source-materialization-v12', 'nck1-source-materialization-v13', 'nck1-analyzed-package-content-v1'].includes(materialization.schemaVersion)
            ? {
                presentation: structuredClone(inventory.presentation),
                publication: structuredClone(inventory.publication),
              }
            : {}),
        },
        span: { start: 0, end: mediaBytes.byteLength },
        extraction: inventory.extraction?.kind === 'package_member'
          ? { adapterId: 'nck1-analyzed-package', version: '1' }
          : {
              adapterId: 'nck1-source-materialization',
              version: '2',
              recipe: inventory.extraction,
            },
      })
      if (inventory.publication?.candidate) {
        const renditionBytes = mediaById.get(media.mediaId).renditionBytes
        source.observations.push({
          observationId: `observation:media-candidate:${media.mediaId}`,
          kind: 'media_derivation_candidate',
          documentInputKey: inputKeyForMediaRendition(media.mediaId),
          value: {
            mediaId: media.mediaId,
            sourceSha256: inventory.sha256,
            candidate: structuredClone(inventory.publication.candidate),
            presentationDigest: digestJson(inventory.presentation),
            selected: inventory.publication.selection !== 'source_crop',
          },
          span: { start: 0, end: renditionBytes.byteLength },
          extraction: {
            adapterId: 'nck1-source-materialization',
            version: '2',
          },
        })
      }
    }
    source.groups.push({
      paperId: materialization.paperId,
      groupId: group.groupId,
      slotId: canonicalSlotId(group.slotId),
      profileId: 'nck1',
      family: group.family,
      questionIds: group.questions.map((question) => question.questionId),
      blankIds: group.questions.map((question) => question.blankId).filter(Boolean),
      sourceSpanId: `source-span:${groupObservation.observationId}`,
      content,
      media: groupMedia,
      variant: groupVariant(
        group,
        answersByQuestionId,
        content,
        issues,
        source,
        documentsById,
        {
          allowMultipleApplicationNotices: closureAdmitsMultipleWritingNotices(resolveCanonicalAuthority(authorityRef).closure),
          allowPromptFigures: closureAdmitsApplicationPromptFigures(resolveCanonicalAuthority(authorityRef).closure),
          allowDrawingArea: closureAdmitsApplicationDrawingArea(resolveCanonicalAuthority(authorityRef).closure),
        },
      ),
      sourceSpanRefsByTarget: Object.fromEntries([
        ...group.questions.flatMap(question => (question.stemFigures || []).flatMap(figure =>
          [figure.blockId, ...(figure.caption ? [`caption:${figure.blockId}`] : [])].map(nodeId => [
            `content_node:${nodeId}`,
            [`source-span:observation:stem-figure:${figure.blockId}`],
          ]))),
        ...groupMedia.map((media) => [
          `media:${media.mediaId}`,
          [`source-span:observation:source-media:${media.mediaId}`],
        ]),
        ...(group.family === 'grammar-fill'
          ? group.questions.map((question) => [
            `prompt_provision:${question.blankId}`,
            [`source-span:observation:grammar-prompt:${question.questionId}`],
          ])
          : []),
      ]),
    })
  }
  appendListeningGroups(source, materialization, documentsById, listeningInstructionCorrection)
  for (const entry of materialization.sourcePresentation?.instructions || []) {
    const group = source.groups.find(group => group.slotId === canonicalSlotId(entry.slotId))
    const instructionId = SOURCE_INSTRUCTION_SLOTS[entry.slotId]
    const corrected = listeningInstructionCorrection?.correction.instructions.some(item => item.slotId === entry.slotId)
    const observation = corrected ? {
      observationId: `observation:corrected-listening-instruction:${group.groupId}`,
      kind: 'source_instruction', documentInputKey: 'listening_instruction_correction',
      value: { instructionId, text: entry.text },
      span: { start: 0, end: listeningInstructionCorrection.byteLength },
      extraction: { adapterId: 'nck1-source-materialization', version: '8' },
    } : observationForLocator(`observation:source-instruction:${group.groupId}`,
      'source_instruction', entry.source, { instructionId, text: entry.text }, documentsById)
    if (!corrected) observation.extraction.version = '5'
    source.observations.push(observation)
    group.sourcePresentation = { instruction: { instructionId, text: entry.text,
      authorityObservationRef: observation.observationId } }
    const refs = [`source-span:${observation.observationId}`]
    if (entry.slotId === 'listening.short-dialogue') {
      const { source: locator, ...example } = materialization.sourcePresentation.listeningExample
      const exampleObservation = observationForLocator(`observation:source-example:${group.groupId}`,
        'source_listening_example', locator, example, documentsById)
      exampleObservation.extraction.version = '5'
      source.observations.push(exampleObservation)
      group.sourcePresentation.example = { ...example, authorityObservationRef: exampleObservation.observationId }
      refs.push(`source-span:${exampleObservation.observationId}`)
    }
    group.sourceSpanRefsByTarget[`source_presentation:${group.groupId}`] = refs
  }
  return source
}

// Read-only compiler evidence shares the derivation's defensive byte snapshot.
function compilerDocuments(input, materialization, source, instructionDocument, authorityRef) {
  const sourceBytes = textEncoder.encode(JSON.stringify(source))
  const profileEvidence = instructionEvidence(materialization, instructionDocument, authorityRef)
  const documentsById = new Map(materialization.documents.map((document) => [
    document.documentId,
    document,
  ]))
  const mediaById = new Map(materialization.media.map((media) => [
    media.mediaId,
    media,
  ]))
  return [
    {
      inputKey: 'canonical_source_envelope',
      roles: ['operator_assertions'],
      bytes: sourceBytes,
      declared: {
        mediaType: 'application/vnd.eqb.canonical-fixture+json',
        originalName: 'canonical-source-envelope.json',
      },
    },
    {
      inputKey: 'nck1_source_materialization',
      roles: ['structured_source', 'source_provenance'],
      bytes: input.materializationBytes,
      declared: {
        mediaType: NCK1_MATERIALIZATION_MEDIA_TYPE,
        originalName: `${materialization.schemaVersion}.json`,
      },
    },
    ...(input.spellingReviewBytes ? [{
      inputKey: 'spelling_review',
      roles: ['source_provenance'],
      bytes: input.spellingReviewBytes,
      declared: { mediaType: 'application/json', originalName: SPELLING_REVIEW_FILE },
    }] : []),
    ...(input.listeningInstructionCorrectionBytes ? [{
      inputKey: 'listening_instruction_correction', roles: ['source_provenance'],
      bytes: input.listeningInstructionCorrectionBytes,
      declared: { mediaType: 'application/json', originalName: LISTENING_INSTRUCTION_CORRECTION_FILE },
    }] : []),
    ...(input.ocrSourceBytes ? ['evidence', 'confirmation'].map((kind) => ({
      inputKey: `ocr_source_${kind}`,
      roles: ['source_provenance'],
      bytes: input.ocrSourceBytes[`${kind}Bytes`],
      declared: { mediaType: 'application/json', originalName: `nck1-ocr-source-${kind}-v1.json` },
    })) : []),
    ...input.documents.flatMap((entry) => {
      const document = documentsById.get(entry.documentId)
      const sourceDocument = {
        inputKey: inputKeyForDocument(entry.documentId),
        roles: sourceRoles(document.role),
        bytes: entry.bytes,
        declared: {
          mediaType: document.mediaType,
          originalName: originalName(document),
        },
      }
      if (document.mediaType !== NCK1_IMAGE_BUNDLE_MEDIA_TYPE) {
        return [sourceDocument]
      }
      const pages = parseNck1ImageSourceBundle(entry.bytes).pages.map((page) => ({
        inputKey: `${inputKeyForDocument(entry.documentId)}_page_${page.page}`,
        roles: sourceRoles(document.role),
        bytes: page.bytes,
        declared: {
          mediaType: page.mediaType,
          originalName: `${entry.documentId}-page-${page.page}.${nck1ImageExtension(page.mediaType)}`,
        },
      }))
      return [sourceDocument, ...pages]
    }),
    ...(input.listeningAudio ? [{
      inputKey: 'listening_audio_descriptor',
      roles: ['source_provenance'],
      bytes: textEncoder.encode(JSON.stringify(input.listeningAudio)),
      declared: { mediaType: 'application/json', originalName: 'listening-audio.json' },
    }] : []),
    ...input.media.flatMap((entry) => {
      const media = mediaById.get(entry.mediaId)
      const sourceDocument = {
        inputKey: inputKeyForMedia(entry.mediaId),
        roles: media.usage === 'content'
          ? ['source_media']
          : ['source_provenance'],
        bytes: entry.bytes,
        declared: {
          mediaType: media.mimeType,
          originalName: `${media.mediaId.replace(/[^a-z0-9]+/gi, '-')}.${media.mimeType.split('/')[1].replace('jpeg', 'jpg')}`,
        },
      }
      if (!media.publication?.candidate) return [sourceDocument]
      const candidate = media.publication.candidate
      return [sourceDocument, {
        inputKey: inputKeyForMediaRendition(entry.mediaId),
        roles: media.usage === 'content'
          && media.publication.selection !== 'source_crop'
          ? ['source_media', 'source_provenance']
          : ['source_provenance'],
        bytes: entry.renditionBytes,
        declared: {
          mediaType: candidate.mimeType,
          originalName: `${media.mediaId.replace(/[^a-z0-9]+/gi, '-')}-candidate.${candidate.mimeType.split('/')[1].replace('jpeg', 'jpg')}`,
        },
      }]
    }),
    {
      inputKey: 'continuation_writing_instruction_evidence',
      roles: ['structured_source', 'source_provenance'],
      bytes: textEncoder.encode(JSON.stringify(profileEvidence)),
      declared: {
        mediaType: 'application/vnd.eqb.profile-writing-source-evidence+json',
        originalName: 'continuation-writing-instruction-evidence.json',
      },
    },
  ]
}

function sourceEmphasisRuleVersion(closure) {
  const rules = closure?.artifacts?.normalization?.rules
  const matches = Array.isArray(rules)
    ? rules.filter(rule => rule.ruleId === 'canonical-visible-typography') : []
  if (matches.length !== 1 || !['3', '4'].includes(matches[0].version)) {
    throw new Error('Source emphasis requires one supported canonical-visible-typography rule')
  }
  return matches[0].version
}

function appendReadingSourceEmphasis(source, raw, documentsById, review, issues, closure) {
  const paragraphsByDocument = new Map()
  const corrections = new Map((review?.targets || []).map((target) => [target.jsonPointer, target.corrections]))
  for (const [groupIndex, group] of raw.groups.entries()) {
    if (group.family !== 'reading') continue
    const derivedGroup = source.groups.find((item) => item.groupId === group.groupId)
    const derivedBlocks = new Map(sourceOrderedParagraphEntries(derivedGroup.content.blocks, '')
      .map(({ block }) => [block.nodeId, block]))
    for (const { block, path: blockPath } of sourceOrderedParagraphEntries(group.blocks, `/groups/${groupIndex}/blocks`)) {
      if (block.source.kind !== 'docx_part' || block.source.part !== 'word/document.xml') continue
      try {
        if (!paragraphsByDocument.has(block.source.documentId)) {
          paragraphsByDocument.set(block.source.documentId,
            extractDocxParagraphEmphasis(documentsById.get(block.source.documentId).bytes))
        }
        const matches = resolveDocxParagraphSelector(block.source.selector, paragraphsByDocument.get(block.source.documentId))
        if (matches.length !== 1 || !matches[0].exact) throw new Error('Source emphasis needs one exact run-complete paragraph')
        const paragraph = matches[0]
        if (!paragraph.ranges.length) continue
        const ruleVersion = sourceEmphasisRuleVersion(closure)
        const rawText = block.content.map((item) => item.kind === 'text' ? item.text : '').join('')
        const leading = paragraph.text.length - paragraph.text.replace(/^\p{Zs}+/u, '').length
        if (paragraph.text.slice(leading).replace(/\p{Zs}+$/u, '') !== rawText
          || block.content.some((item) => item.kind !== 'text')) throw new Error('Source emphasis paragraph cannot map to literal text')
        const derived = derivedBlocks.get(block.blockId)
        let offset = 0
        const inlines = []
        for (const [index, item] of block.content.entries()) {
          const ranges = paragraph.ranges.flatMap((range) => {
            const start = Math.max(range.start - leading - offset, 0)
            const end = Math.min(range.end - leading - offset, item.text.length)
            return end > start ? [{ start, end, marks: range.marks }] : []
          })
          const pointer = `${blockPath.replace(/\[(\d+)\]/gu, '/$1').replaceAll('.', '/')}/content/${index}/text`
          const mapped = mapSourceEmphasisEdits(item.text, ranges, corrections.get(pointer) || [])
          if (derived.inlines[index].text !== mapped.text) throw new Error('Source emphasis editorial mapping differs from effective text')
          inlines.push(...(ranges.length
            ? splitSourceEmphasis(mapped.text, mapped.ranges, derived.inlines[index].nodeId, ruleVersion)
            : [derived.inlines[index]]))
          offset += item.text.length
        }
        const observation = observationForLocator(`observation:source-emphasis:${block.blockId}`,
          'source_reading_emphasis', block.source,
          { blockId: block.blockId, ranges: paragraph.ranges }, documentsById)
        observation.extraction.version = '3'
        source.observations.push(observation)
        derived.inlines = inlines
        for (const inline of inlines) derivedGroup.sourceSpanRefsByTarget[`content_node:${inline.nodeId}`] = [`source-span:${observation.observationId}`]
      } catch (error) {
        issues.push(adapterIssue('MATERIALIZATION_SOURCE_EMPHASIS_UNSUPPORTED', error.message, blockPath))
      }
    }
  }
}

// Called only after the immutable OCR-v3 evidence/confirmation has resolved.
// Rewrite the producer side, never the Candidate or the confirmed inventory.
export function replaceOcrStructuredAnswerRegions(raw, expected, resolved, confirmation, evidence) {
  const replacements = new Map()
  const paragraphs = []
  const visuals = raw.sourceCoverage.visuals.filter(visual => visual.disposition === 'structured_answer_region')
  if (!visuals.length) return { expected, replacements, paragraphs }
  const same = (left, right) => digestJson(left) === digestJson(right)
  const flatten = blocks => blocks.flatMap(block => block.kind === 'framed_columns'
    ? block.columns.flatMap(column => flatten(column.blocks)) : [block])
  const reject = (suffix, message) => {
    const error = new Error(message)
    error.code = `OCR_STRUCTURED_ANSWER_REGION_${suffix}`
    throw error
  }
  const references = raw.groups.flatMap(group => [
    ...referencedMediaIds(group.blocks),
    ...group.questions.flatMap(question => referencedMediaIds(question.stemFigures || [])),
    ...group.questions.flatMap(question => question.options.filter(option => option.figure).map(option => option.figure.mediaId)),
    ...(group.optionBank || []).filter(option => option.figure).map(option => option.figure.mediaId),
  ])
  for (const visual of visuals) {
    const group = raw.groups.find(group => group.groupId === visual.targetId)
    if (!['nck1-source-materialization-v5', 'nck1-source-materialization-v6', 'nck1-source-materialization-v7', 'nck1-source-materialization-v8', 'nck1-source-materialization-v9', 'nck1-source-materialization-v10', 'nck1-source-materialization-v11', 'nck1-source-materialization-v12', 'nck1-source-materialization-v13'].includes(raw.schemaVersion) || group?.family !== 'application-writing'
      || group.writingTask?.taskType !== 'application' || !group.writingTask.drawingArea) {
      reject('UNMATCHED', 'Structured OCR replacement requires a v5/v6 application group with drawingArea')
    }
    const owners = expected.groups.flatMap(owner => flatten(owner.blocks).flatMap(block => {
      if (owner.groupId !== group.groupId || owner.slotId !== group.slotId || owner.family !== group.family
        || block.kind !== 'figure') return []
      const coverage = expected.sourceCoverage.visuals.filter(value =>
        value.disposition === 'content_media' && value.targetId === block.mediaId)
      const parents = resolved.contentMedia.filter(parent => parent.mediaId === block.mediaId)
      if (coverage.length !== 1 || parents.length !== 1
        || raw.sourceCoverage.documentId !== expected.sourceCoverage.documentId
        || parents[0].source.documentId !== raw.sourceCoverage.documentId
        || coverage[0].page !== visual.page || parents[0].source.page !== visual.page
        || (!same(coverage[0].region, visual.region) && !same(parents[0].source.region, visual.region))) return []
      return [{ owner, block, coverage: coverage[0], parent: parents[0] }]
    }))
    if (owners.length !== 1 || replacements.has(owners[0].block.mediaId)) {
      reject('UNMATCHED', 'Structured OCR replacement must match exactly one confirmed source figure in the same application slot/group/page/region')
    }
    const { owner, block, coverage, parent } = owners[0]
    const media = raw.media.find(media => media.mediaId === block.mediaId)
    if (references.includes(block.mediaId) || (media && (media.usage !== 'visual_proof'
      || media.extraction?.kind !== 'pdf_crop'
      || !same({ kind: 'page_region', documentId: media.extraction.documentId,
        page: media.extraction.page, region: media.extraction.region }, parent.source)))) {
      reject('CONTENT_CONFLICT', 'Replaced OCR template media must be absent or an unconsumed visual_proof of its exact confirmed crop')
    }
    const confirmedPage = confirmation.documents.find(document => document.documentId === raw.sourceCoverage.documentId)
      ?.pages.find(page => page.page === visual.page)
    const evidencePage = evidence.documents.find(document => document.documentId === raw.sourceCoverage.documentId)
      ?.pages.find(page => page.page === visual.page)
    const candidates = (confirmedPage?.orderedItems || []).flatMap((item, index) => {
      const observations = item.observationIds.map(id => evidencePage?.observations.find(value => value.observationId === id))
      if (!observations.length || observations.some(value => !value
        || value.region.x < visual.region.x || value.region.y < visual.region.y
        || value.region.x + value.region.width > visual.region.x + visual.region.width
        || value.region.y + value.region.height > visual.region.y + visual.region.height)) return []
      const left = Math.min(...observations.map(value => value.region.x))
      const top = Math.min(...observations.map(value => value.region.y))
      const right = Math.max(...observations.map(value => value.region.x + value.region.width))
      const bottom = Math.max(...observations.map(value => value.region.y + value.region.height))
      return [{ item, index, source: { kind: 'page_region', documentId: raw.sourceCoverage.documentId,
        page: visual.page, region: { x: left, y: top, width: right - left, height: bottom - top } } }]
    })
    const rawBlocks = flatten(group.blocks)
    const label = rawBlocks.find(value => value.blockId === group.writingTask.drawingArea.labelBlockRef)
    const selected = [label, ...(group.writingTask.givenSkeleton || []).map(given => {
      const matches = rawBlocks.filter(value => value.kind === 'paragraph' && paragraphText(value) === given.text)
      return matches.length === 1 ? matches[0] : null
    })]
    if (selected.some(value => value?.kind !== 'paragraph') || new Set(selected).size !== selected.length) {
      reject('TEXT_UNCONFIRMED', 'Structured OCR label and givens require distinct, unambiguous source paragraphs')
    }
    // Existing source paragraphs keep their old comparison path. Only text
    // restored from the removed visual needs this new transcription proof.
    const introduced = selected.filter(value => !flatten(owner.blocks).some(existing =>
      existing.kind === 'paragraph' && same(existing.source, value.source) && paragraphText(existing) === paragraphText(value)))
    const restored = introduced.map(value => {
      const matches = candidates.filter(candidate => candidate.item.text === paragraphText(value))
      if (matches.length !== 1) {
        reject('TEXT_UNCONFIRMED', `No unique confirmed OCR text inside the template for ${value.blockId}: ${paragraphText(value)}`)
      }
      const [match] = matches
      if (!same(value.source, match.source)) {
        reject('TEXT_SOURCE_INVALID', `Structured OCR paragraph ${value.blockId} must reuse the confirmed source of ${match.item.itemId}: ${JSON.stringify(match.source)}`)
      }
      paragraphs.push({ text: match.item.text, sourceIndex: match.source,
        ...(match.item.sourceEmphasis ? { sourceEmphasis: match.item.sourceEmphasis } : {}) })
      return { ...match, block: structuredClone(value) }
    }).sort((left, right) => left.index - right.index)
    const rewrite = blocks => blocks.flatMap(value => value === block ? restored.map(value => value.block)
      : value.kind === 'framed_columns'
        ? [{ ...value, columns: value.columns.map(column => ({ ...column, blocks: rewrite(column.blocks) })) }]
        : [value])
    owner.blocks = rewrite(owner.blocks)
    coverage.disposition = visual.disposition
    coverage.targetId = visual.targetId
    coverage.region = structuredClone(visual.region)
    replacements.set(block.mediaId, parent)
  }
  return { expected, replacements, paragraphs }
}

// B1 derives ownership from the immutable confirmed source stream. The old
// producer is deliberately unchanged: it supplies question identity/locator and
// options, while these contiguous media markers were previously unassociated.
// A subsequent authority must admit the complete v6 reader before publication.
// A v2 shared crop can bypass only the legacy standalone-stem-figure rule,
// and only after its complete source-order bank proof has succeeded.
function confirmedImageOptionV2Banks(raw, resolved, expected, confirmation, evidence, imageLabels, pendingMeasurements) {
  const banks = new Map()
  const same = (a, b) => digestJson(a) === digestJson(b)
  for (const { decision, question } of imageLabels) {
    if (decision.schemaVersion !== IN_IMAGE_OPTION_LABELS_VERSION_V2) continue
    verifyInImageOptionLabelsV2Ownership(decision, confirmation, evidence)
    const parents = resolved.contentMedia.filter(parent => parent.mediaId === decision.parentMediaId
      && same(parent.source, decision.parentSource))
    const page = confirmation.documents.find(document => document.documentId === decision.parentSource.documentId)
      ?.pages.find(page => page.page === decision.parentSource.page)
    const visual = page?.visualClassifications.find(visual => visual.regionId === decision.parentRegionId)
    const anchor = page?.orderedItems.find(item => item.itemId === visual?.afterItemId)
    const body = resolved.structures.get(decision.parentSource.documentId)?.body || []
    const markers = body.flatMap((item, index) => item.materializedMedia?.mediaId === decision.parentMediaId
      && same(item.sourceIndex, decision.parentSource) ? [index] : [])
    const paragraph = body[markers[0] - 1]
    const group = raw.groups.find(group => group.groupId === decision.groupId)
    const derived = expected.groups.flatMap(group => group.family === 'reading'
      ? group.questions.filter(value => same(value.source, question.source)).map(question => ({ group, question })) : [])
    const observed = evidence.documents.find(document => document.documentId === decision.parentSource.documentId)
      ?.pages.find(page => page.page === decision.parentSource.page)
    const regions = anchor?.observationIds.map(id => observed?.observations.find(value => value.observationId === id)?.region)
    const x = Math.min(...(regions || []).map(region => region?.x))
    const y = Math.min(...(regions || []).map(region => region?.y))
    const anchorSource = { kind: 'page_region', documentId: decision.parentSource.documentId, page: decision.parentSource.page,
      region: { x, y, width: Math.max(...(regions || []).map(region => region?.x + region?.width)) - x,
        height: Math.max(...(regions || []).map(region => region?.y + region?.height)) - y } }
    if (parents.length !== 1 || markers.length !== 1 || !regions?.length || regions.some(region => !region)
      || paragraph?.kind !== 'paragraph' || paragraph.materializedMedia || paragraph.text !== anchor?.text
      || !same(paragraph.sourceIndex, anchorSource) || !same(question.source, anchorSource)
      || derived.length !== 1 || !['slotId', 'groupId', 'family'].every(key => group[key] === derived[0].group[key])
      || !['questionId', 'sourceNumber', 'canonicalNumber', 'source', 'stem'].every(key => same(question[key], derived[0].question[key]))) {
      throw new Error('In-image v2 bank must retain the complete source-derived Reading stem, identity and immediately adjacent sealed parent')
    }
    verifyCompletedImageLabelMeasurement(raw, question, decision, observed, pendingMeasurements)
    banks.set(question, decision)
  }
  return banks
}

function confirmedStemFigures(raw, resolved, expected, v2Banks = new Map()) {
  const same = (left, right) => digestJson(left) === digestJson(right)
  const reject = message => { throw new Error(message) }
  const owners = new Map()
  for (const group of raw.groups) {
    for (const question of group.questions) {
      if (!question.stemFigures) continue
      const provenBank = v2Banks.get(question)
      if (provenBank?.sharedFigure) {
        // Shape, original crop, complete source identity/stem and ownership
        // were proved before entering this narrowly bound shared-child branch.
        const figure = question.stemFigures[0]
        if (owners.has(figure.mediaId)) throw new Error('Shared image context must be consumed once')
        owners.set(figure.mediaId, figure)
        continue
      }
      const document = raw.documents.find(document => document.documentId === question.source.documentId)
      if (document?.role !== 'question_source' || document.mediaType !== 'application/pdf') {
        reject('Stem figures require a separate question_source PDF')
      }
      const matches = expected.groups.flatMap(candidate => candidate.family === 'reading'
        ? candidate.questions.filter(value => same(value.source, question.source))
          .map(value => ({ group: candidate, question: value })) : [])
      if (matches.length !== 1) reject('Stem figures require one source-derived Reading question')
      const derived = matches[0]
      if (!['slotId', 'groupId', 'family'].every(key => group[key] === derived.group[key])
        || !['questionId', 'sourceNumber', 'canonicalNumber', 'source', 'stem', 'options']
          .every(key => same(question[key], derived.question[key]))) {
        reject('Stem figures must retain their source-derived group, question identity, stem and options')
      }
      const body = resolved.structures.get(document.documentId)?.body || []
      const anchors = body.flatMap((item, index) => item.kind === 'paragraph' && !item.materializedMedia
        && same(item.sourceIndex, question.source) ? [index] : [])
      if (anchors.length !== 1) reject('Stem figure question anchor must be unique')
      let cursor = anchors[0]
      const text = []
      while (body[cursor]?.kind === 'paragraph' && !body[cursor].materializedMedia) {
        const item = body[cursor]
        // Never pass an option row or a later question looking for a figure.
        if ((cursor !== anchors[0] && /^\s*\d+[.．、]/u.test(item.text))
          || /(?:^|\s)A[.．、]\s*/u.test(item.text)) break
        text.push(item.text)
        cursor += 1
      }
      const stem = text.join('\n').replace(/^\s*\d+[.．、]\s*/u, '').trim()
      if (stem !== derived.question.stem.trim()) reject('Stem figure must follow the complete source stem without crossing unconsumed text')
      const markers = []
      while (body[cursor]?.materializedMedia) {
        markers.push(body[cursor])
        cursor += 1
      }
      if (!markers.length || markers.length !== question.stemFigures.length
        || !/^\s*A[.．、]\s*/u.test(body[cursor]?.text || '')) {
        reject('Stem figures must form one contiguous sequence between stem and first option')
      }
      for (const [index, figure] of question.stemFigures.entries()) {
        const marker = markers[index]
        const parents = resolved.contentMedia.filter(parent => parent.mediaId === figure.mediaId
          && same(parent.source, figure.source))
        if (figure.kind !== 'figure' || parents.length !== 1
          || marker.materializedMedia.mediaId !== figure.mediaId || !same(marker.sourceIndex, figure.source)
          || owners.has(figure.mediaId)) {
          reject('Stem figure must consume its exact confirmed region once in source order; crop revisions are unsupported')
        }
        owners.set(figure.mediaId, figure)
      }
    }
  }
  return owners
}

// OCR-v3 may confirm an aggregate A-D bank or an ordinary body figure whose
// top includes preceding text. Materialization v3/v4 proves these separately.
// This proves provenance and consumption; graphic completeness needs image QA.
function validateOcrMediaConsumption(raw, resolved, confirmation, evidence, expected, blocks, replacements = new Map(), pendingMeasurements = new Map()) {
  const same = (left, right) => digestJson(left) === digestJson(right)
  const reject = message => { throw new Error(message) }
  const mediaById = new Map(raw.media.map(media => [media.mediaId, media]))
  if (mediaById.size !== raw.media.length) reject('OCR media IDs must be globally unique')
  const references = raw.groups.flatMap(group => [
    ...referencedMediaIds(group.blocks),
    ...group.questions.flatMap(question => referencedMediaIds(question.stemFigures || [])),
    ...group.questions.flatMap(question => question.options.filter(option => option.figure)
      .map(option => option.figure.mediaId)),
    ...(group.optionBank || []).filter(option => option.figure).map(option => option.figure.mediaId),
  ])
  const imageLabels = resolveInImageOptionLabels(raw)
  const v2Banks = confirmedImageOptionV2Banks(raw, resolved, expected, confirmation, evidence, imageLabels, pendingMeasurements)
  const stemFigures = confirmedStemFigures(raw, resolved, expected, v2Banks)
  if (stemFigures.size) {
    const regions = new Set()
    for (const media of raw.media) {
      const crop = media.extraction
      if (crop.kind !== 'pdf_crop') continue
      const key = digestJson([crop.documentId, crop.page, crop.region])
      if (regions.has(key)) reject('One confirmed source region cannot be consumed under multiple media identities')
      regions.add(key)
    }
  }
  const consumedImageLabels = new Set()
  const consumed = new Set()
  const childParents = new Map()
  const topTrims = new Map()
  const questionBanks = raw.groups.flatMap(group => group.questions
    .filter(question => question.options.some(option => option.figure))
    .map(question => ({ group, question })))
  const consumedBanks = new Set()
  const inside = (outer, inner) => inner.x >= outer.x - 1e-6 && inner.y >= outer.y - 1e-6
    && inner.x + inner.width <= outer.x + outer.width + 1e-6
    && inner.y + inner.height <= outer.y + outer.height + 1e-6
  const matchesCrop = (media, locator) => media?.usage === 'content' && media.kind === 'figure'
    && media.extraction.kind === 'pdf_crop'
    && media.extraction.documentId === locator.documentId && media.extraction.page === locator.page
  const claim = mediaId => {
    if (consumed.has(mediaId) || references.filter(id => id === mediaId).length !== 1) {
      reject('OCR media must be consumed exactly once by its confirmed body figure or Reading bank')
    }
    consumed.add(mediaId)
  }
  for (const parent of resolved.contentMedia) {
    const { mediaId, source: locator } = parent
    const original = mediaById.get(mediaId)
    if (replacements.has(mediaId)) {
      // The replacement proof already checked exact provenance and zero uses.
      if (original) consumed.add(mediaId)
      continue
    }
    if (original) {
      if (stemFigures.has(mediaId) && !same(original.extraction.region, locator.region)) {
        reject('Stem figures do not admit crop revisions or ordinary body top-trim proof')
      }
      if (!same(original.extraction.region, locator.region)) {
        // Only an ordinary, source-order body figure may tighten its top.
        // Keep the immutable parent and the A-D bank path separate.
        if (!['nck1-source-materialization-v3', 'nck1-source-materialization-v4', 'nck1-source-materialization-v5', 'nck1-source-materialization-v6', 'nck1-source-materialization-v7', 'nck1-source-materialization-v8', 'nck1-source-materialization-v9', 'nck1-source-materialization-v10', 'nck1-source-materialization-v11', 'nck1-source-materialization-v12', 'nck1-source-materialization-v13'].includes(raw.schemaVersion)
          || !matchesCrop(original, locator)
          || resolved.contentMedia.filter(value => value.mediaId === mediaId).length !== 1) {
          reject('OCR top-trim requires one confirmed PDF content figure with its original media ID')
        }
        const child = original.extraction.region
        const outer = locator.region
        if (child.x !== outer.x || child.width !== outer.width || child.y <= outer.y
          || Math.abs(child.y + child.height - outer.y - outer.height) > 1e-9
          || !inside(outer, child)) {
          reject('OCR top-trim may only increase the top while preserving left, width and normalized bottom')
        }
        const confirmedPages = confirmation.documents.filter(document => document.documentId === locator.documentId)
          .flatMap(document => document.pages.filter(page => page.page === locator.page))
        const evidencePages = evidence.documents.filter(document => document.documentId === locator.documentId)
          .flatMap(document => document.pages.filter(page => page.page === locator.page))
        if (confirmedPages.length !== 1 || evidencePages.length !== 1) {
          reject('OCR top-trim requires one verified confirmation and raster page')
        }
        const [confirmedPage] = confirmedPages
        const [evidencePage] = evidencePages
        const raster = evidencePage.raster
        if (original.extraction.density !== raster.recipe.density) {
          reject('OCR top-trim density must equal the verified evidence raster density')
        }
        // Match pdfRegionRaster: round origin and size separately, not edges.
        const window = region => {
          const left = Math.round(region.x * raster.pixelWidth)
          const top = Math.round(region.y * raster.pixelHeight)
          const width = Math.round(region.width * raster.pixelWidth)
          const height = Math.round(region.height * raster.pixelHeight)
          return { left, top, right: left + width, bottom: top + height, height }
        }
        const parentWindow = window(outer)
        const childWindow = window(child)
        if (childWindow.left !== parentWindow.left || childWindow.right !== parentWindow.right
          || childWindow.bottom !== parentWindow.bottom || childWindow.top <= parentWindow.top
          || childWindow.height <= 0) {
          reject('OCR top-trim must preserve the exact raster left, right and bottom and remove positive top pixels')
        }
        const visuals = confirmedPage.visualClassifications.filter(visual => visual.classification === 'content_media'
          && evidencePage.regions.filter(region => region.regionId === visual.regionId
            && same(region.region, outer)).length === 1)
        if (visuals.length !== 1) reject('OCR top-trim requires exactly one confirmed parent classification')
        const [visual] = visuals
        const nonemptyIds = ids => Array.isArray(ids) && ids.length > 0
          && ids.every(id => typeof id === 'string' && id.trim().length > 0)
          && new Set(ids).size === ids.length
        const itemObservations = id => {
          const items = confirmedPage.orderedItems.filter(item => item.itemId === id)
          if (items.length !== 1 || !nonemptyIds(items[0].observationIds)) {
            reject('OCR top-trim requires unique nonempty confirmed items and observations')
          }
          return items[0].observationIds.map(observationId => {
            const matches = evidencePage.observations.filter(observation => observation.observationId === observationId)
            if (matches.length !== 1) reject('OCR top-trim observation must exist exactly once')
            return matches[0]
          })
        }
        if (!nonemptyIds(visual.itemIds)) reject('OCR top-trim requires nonempty unique visual text items')
        const textObservations = visual.itemIds.flatMap(itemObservations)
        if (new Set(textObservations.map(observation => observation.observationId)).size !== textObservations.length
          || textObservations.some(observation => !inside(child, observation.region))) {
          reject('OCR top-trim must retain every confirmed visual text observation in full')
        }
        const anchors = confirmedPage.orderedItems.filter(item => item.itemId === visual.afterItemId)
        if (anchors.length !== 1 || visual.itemIds.includes(visual.afterItemId)) {
          reject('OCR top-trim requires one distinct surviving paragraph anchor')
        }
        const [anchor] = anchors
        const observations = itemObservations(visual.afterItemId)
        const left = Math.min(...observations.map(observation => observation.region.x))
        const top = Math.min(...observations.map(observation => observation.region.y))
        const right = Math.max(...observations.map(observation => observation.region.x + observation.region.width))
        const bottom = Math.max(...observations.map(observation => observation.region.y + observation.region.height))
        const anchorLocator = { kind: 'page_region', documentId: locator.documentId, page: locator.page,
          region: { x: left, y: top, width: right - left, height: bottom - top } }
        const body = resolved.structures.get(locator.documentId)?.body || []
        const anchorParagraphs = body.filter(item => item.kind === 'paragraph' && !item.materializedMedia
          && same(item.sourceIndex, anchorLocator))
        const markers = body.map((item, index) => ({ item, index }))
          .filter(({ item }) => item.materializedMedia?.mediaId === mediaId)
        if (anchorParagraphs.length !== 1 || anchorParagraphs[0].text !== anchor.text || markers.length !== 1
          || !same(markers[0].item.sourceIndex, locator) || body[markers[0].index - 1] !== anchorParagraphs[0]) {
          reject('OCR top-trim parent must immediately follow its unique surviving source paragraph')
        }
        const intrusions = observations.filter(observation => observation.region.y < outer.y
          && observation.region.y + observation.region.height > outer.y
          && Math.min(observation.region.x + observation.region.width, outer.x + outer.width)
            > Math.max(observation.region.x, outer.x))
        if (!intrusions.length || child.y > Math.max(...intrusions.map(observation =>
          observation.region.y + observation.region.height)) + 1e-6) {
          reject('OCR top-trim must remove only the preceding paragraph intrusion at the parent top')
        }
        const flatten = values => values.flatMap(block => block.kind === 'framed_columns'
          ? block.columns.flatMap(column => flatten(column.blocks)) : [block])
        const owners = expected.groups.flatMap(group => {
          const ordered = flatten(group.blocks)
          return ordered.flatMap((block, index) => block.kind === 'figure' && block.mediaId === mediaId
            ? [{ group, block, before: ordered[index - 1] }] : [])
        })
        const rawOwners = raw.groups.flatMap(group => {
          const ordered = flatten(group.blocks)
          return ordered.flatMap((block, index) => block.kind === 'figure' && block.mediaId === mediaId
            ? [{ group, block, before: ordered[index - 1] }] : [])
        })
        if (owners.length !== 1 || rawOwners.length !== 1) {
          reject('OCR top-trim requires exactly one ordinary source-order body figure, never an option bank')
        }
        const expectedOwner = owners[0]
        const owner = rawOwners[0]
        const childSource = { ...locator, region: child }
        if (!['slotId', 'groupId', 'family'].every(key => owner.group[key] === expectedOwner.group[key])
          || owner.block.blockId !== expectedOwner.block.blockId
          || !same(expectedOwner.block.source, locator) || !same(owner.block.source, childSource)
          || [owner.before, expectedOwner.before].some(block => block?.kind !== 'paragraph'
            || !same(block.source, anchorLocator) || paragraphText(block) !== anchor.text)) {
          reject('OCR top-trim must retain its exact source-order owner, figure identity and preceding paragraph')
        }
        const parentVisuals = resolved.sourceVisuals.filter(visual => visual.targetId === mediaId)
        const coverage = raw.sourceCoverage.visuals.filter(visual => visual.targetId === mediaId)
        if (parentVisuals.length !== 1 || parentVisuals[0].disposition !== 'content_media'
          || parentVisuals[0].page !== locator.page || !same(parentVisuals[0].region, outer)
          || raw.sourceCoverage.documentId !== locator.documentId || coverage.length !== 1
          || coverage[0].disposition !== 'content_media' || coverage[0].page !== locator.page
          || !same(coverage[0].region, child)) {
          reject('OCR top-trim coverage must bind the same content media exactly once at its child region')
        }
        claim(mediaId)
        childParents.set(mediaId, parentVisuals[0])
        topTrims.set(mediaId, { block: owner.block, childSource, parentSource: locator })
        continue
      }
      if (!matchesCrop(original, locator) || !same(original.extraction.region, locator.region)
        || [...blocks, ...stemFigures.values()].filter(block => block.kind === 'figure' && block.mediaId === mediaId
          && same(block.source, locator)).length !== 1) {
        reject('Confirmed OCR image must retain its exact source crop and one content placement')
      }
      claim(mediaId)
      continue
    }
    if (!['nck1-source-materialization-v3', 'nck1-source-materialization-v4', 'nck1-source-materialization-v5', 'nck1-source-materialization-v6', 'nck1-source-materialization-v7', 'nck1-source-materialization-v8', 'nck1-source-materialization-v9', 'nck1-source-materialization-v10', 'nck1-source-materialization-v11', 'nck1-source-materialization-v12', 'nck1-source-materialization-v13'].includes(raw.schemaVersion)) {
      reject('OCR option banks require the existing figure-option materialization contract')
    }
    // Recover afterItemId from the verified immutable closure, never from a
    // Candidate group, sourceVisual field, or caller-supplied parent property.
    const confirmedPage = confirmation.documents.find(document => document.documentId === locator.documentId)
      ?.pages.find(page => page.page === locator.page)
    const evidencePage = evidence.documents.find(document => document.documentId === locator.documentId)
      ?.pages.find(page => page.page === locator.page)
    const visuals = (confirmedPage?.visualClassifications || []).filter(visual =>
      visual.classification === 'content_media'
      && evidencePage?.regions.some(region => region.regionId === visual.regionId && same(region.region, locator.region)))
    if (visuals.length !== 1) reject('OCR option bank requires exactly one confirmed parent')
    const [visual] = visuals
    const labels = visual.itemIds.map(id => confirmedPage.orderedItems.find(item => item.itemId === id)?.text).join(' ')
    const imageLabel = imageLabels.find(({ decision }) => decision.parentMediaId === mediaId)
    if (!imageLabel && !/^\s*A[.．、]\s*B[.．、]\s*C[.．、]\s*D[.．、]\s*$/u.test(labels)) {
      reject('OCR option bank parent must consume only the confirmed ordered A-D labels')
    }
    const anchor = confirmedPage.orderedItems.find(item => item.itemId === visual.afterItemId)
    const observations = anchor?.observationIds.map(id =>
      evidencePage.observations.find(observation => observation.observationId === id))
    if (!observations?.length || observations.some(observation => !observation)) {
      reject('OCR option bank has no confirmed source-order question anchor')
    }
    const left = Math.min(...observations.map(observation => observation.region.x))
    const top = Math.min(...observations.map(observation => observation.region.y))
    const right = Math.max(...observations.map(observation => observation.region.x + observation.region.width))
    const bottom = Math.max(...observations.map(observation => observation.region.y + observation.region.height))
    const anchorLocator = { kind: 'page_region', documentId: locator.documentId, page: locator.page,
      region: { x: left, y: top, width: right - left, height: bottom - top } }
    if (imageLabel) {
      const { decision } = imageLabel
      if ((decision.schemaVersion !== IN_IMAGE_OPTION_LABELS_VERSION_V2 && visual.itemIds.length !== 0) || decision.anchorItemId !== visual.afterItemId
        || decision.parentRegionId !== visual.regionId || !same(decision.parentSource, locator)
        || !same(decision.questionSource, anchorLocator)
        || decision.sourceSetDigest !== evidence.sourceSetDigest
        || decision.evidenceDigest !== evidence.evidenceDigest
        || decision.confirmationDigest !== digestJson(confirmation)) {
        reject('In-image option labels must bind the exact sealed OCR generation, parent and source-order anchor')
      }
    }
    const body = resolved.structures.get(locator.documentId)?.body || []
    const anchorParagraphs = body.filter(item => item.kind === 'paragraph' && !item.materializedMedia
      && same(item.sourceIndex, anchorLocator))
    const markers = body.map((item, index) => ({ item, index }))
      .filter(({ item }) => item.materializedMedia?.mediaId === mediaId && same(item.sourceIndex, locator))
    if (anchorParagraphs.length !== 1 || anchorParagraphs[0].text !== anchor.text || markers.length !== 1
      || body[markers[0].index - 1] !== anchorParagraphs[0]) {
      reject('OCR option bank must immediately follow its unique surviving source paragraph')
    }
    const expectedQuestions = expected.groups.flatMap(group => group.family === 'reading'
      ? group.questions.filter(question => same(question.source, anchorLocator)).map(question => ({ group, question }))
      : [])
    if (expectedQuestions.length !== 1) reject('OCR option bank must bind exactly one source-order Reading question')
    const owner = questionBanks.filter(({ group, question }) =>
      group.slotId === expectedQuestions[0].group.slotId && group.groupId === expectedQuestions[0].group.groupId
      && group.family === expectedQuestions[0].group.family
      && ['questionId', 'sourceNumber', 'canonicalNumber', 'source'].every(key =>
        same(question[key], expectedQuestions[0].question[key])))
    if (owner.length !== 1 || consumedBanks.has(owner[0].question)) {
      reject('OCR option bank must retain its source-order slot, group, question identity, numbers and locator')
    }
    const { question } = owner[0]
    if (imageLabel) {
      if (imageLabel.question !== question || consumedImageLabels.has(imageLabel)) reject('In-image labels must bind their unique source-order Reading owner')
      consumedImageLabels.add(imageLabel)
    }
    if (question.options.length !== 4 || question.options.some((option, index) =>
      option.label !== 'ABCD'[index] || !exactKeys(option, ['label', 'figure'])
      || !exactKeys(option.figure, ['mediaId']))) {
      reject('OCR option bank requires four pure figure options ordered A-D')
    }
    const children = question.options.map(option => mediaById.get(option.figure.mediaId))
    if (children.some(media => !matchesCrop(media, locator) || !inside(locator.region, media.extraction.region))) {
      reject('OCR option crops must lie inside their confirmed parent on the same document and page')
    }
    const regions = children.map(media => media.extraction.region)
    const v2 = imageLabel?.decision.schemaVersion === IN_IMAGE_OPTION_LABELS_VERSION_V2
    if (!v2 && Math.max(...regions.map(region => region.y))
      >= Math.min(...regions.map(region => region.y + region.height))) {
      reject('OCR option crops must share a positive vertical band in one row')
    }
    for (let index = 0; index < regions.length; index += 1) {
      if (!v2 && index && regions[index].x <= regions[index - 1].x) reject('OCR A-D crops must follow geometric left-to-right order')
      for (let previous = 0; previous < index; previous += 1) {
        if (Math.min(regions[index].x + regions[index].width, regions[previous].x + regions[previous].width)
          > Math.max(regions[index].x, regions[previous].x)
          && Math.min(regions[index].y + regions[index].height, regions[previous].y + regions[previous].height)
          > Math.max(regions[index].y, regions[previous].y)) {
          reject('OCR option crops must not have positive-area overlap')
        }
      }
    }
    const parentVisuals = resolved.sourceVisuals.filter(visual => visual.disposition === 'content_media'
      && visual.targetId === mediaId && visual.page === locator.page && same(visual.region, locator.region))
    if (parentVisuals.length !== 1) reject('OCR option bank requires one confirmed visual inventory parent')
    const shared = v2Banks.get(question)?.sharedFigure
    if (shared) children.push(mediaById.get(shared.mediaId))
    for (const child of children) {
      const coverage = raw.sourceCoverage.visuals.filter(visual => visual.targetId === child.mediaId)
      if (raw.sourceCoverage.documentId !== child.extraction.documentId || coverage.length !== 1
        || coverage[0].disposition !== 'content_media' || coverage[0].page !== child.extraction.page
        || !same(coverage[0].region, child.extraction.region)) {
        reject('OCR option coverage must exactly bind each child crop once')
      }
      claim(child.mediaId)
      childParents.set(child.mediaId, parentVisuals[0])
    }
    consumedBanks.add(question)
  }
  if (consumed.size !== raw.media.length || raw.media.some(media => !consumed.has(media.mediaId))
    || references.length !== raw.media.length - [...replacements.keys()].filter(id => mediaById.has(id)).length
    || references.some(mediaId => !consumed.has(mediaId))
    || consumedBanks.size !== questionBanks.length || consumedImageLabels.size !== imageLabels.length) {
    reject('OCR media inventory must exactly equal consumed confirmed figures and their bound option crops')
  }
  // Fold only proven child relationships back to the immutable inventory.
  // Unmatched visuals survive this projection and therefore fail equality.
  const foldedParents = new Set()
  const projected = raw.sourceCoverage.visuals.flatMap(visual => {
    const parent = childParents.get(visual.targetId)
    if (!parent) return [visual]
    if (foldedParents.has(parent.targetId)) return []
    foldedParents.add(parent.targetId)
    return [parent]
  })
  const inventory = visuals => visuals.map(visual => digestJson(visual)).sort()
  // The source-order producer also projects confirmed semantic tables into
  // coverage; resolved.sourceVisuals alone contains only images/furniture.
  if (!same(inventory(projected), inventory(expected.sourceCoverage.visuals))) {
    reject('OCR visual coverage must project exactly to the confirmed source inventory')
  }
  // Consume only after the whole source-order/media/coverage proof succeeds.
  for (const question of v2Banks.keys()) {
    if (!pendingMeasurements.delete(question.questionId)) reject('In-image measurement obligation was missing or already consumed')
  }
  return topTrims
}

function appendOcrReadingSourceEmphasis(source, raw, documentsById, ocrSourceBytes, review, issues, writingEmphasis = false, optionEmphasis = false, authorityRef, closure, pendingMeasurements = new Map(), warnings = null) {
  try {
    const ruleVersion = sourceEmphasisRuleVersion(closure)
    let restoredParagraphs = []
    let paragraphJoins = []
    const evidence = JSON.parse(textDecoder.decode(ocrSourceBytes.evidenceBytes))
    const confirmation = JSON.parse(textDecoder.decode(ocrSourceBytes.confirmationBytes))
    if (![NCK1_OCR_CONFIRMATION_SCHEMA_VERSION_V2, NCK1_OCR_CONFIRMATION_SCHEMA_VERSION_V3].includes(confirmation.schemaVersion)) {
      throw new Error('OCR source evidence requires version 2 or 3 transcription closure')
    }
    const resolved = resolveConfirmedNck1OcrEvidence({
      paperId: raw.paperId,
      documents: raw.documents.map(document => ({ ...document, bytes: documentsById.get(document.documentId).bytes })),
      evidence,
      confirmation,
    })
    if (resolved.issues.length) throw new Error(resolved.issues[0].message)
    let authoredExpected = null
    if (raw.schemaVersion === 'nck1-source-materialization-v10' || raw.listeningSourceDecision) {
      const documents = raw.documents.map(document => ({ ...document, bytes: documentsById.get(document.documentId).bytes }))
      const question = documents.find(document => document.role === 'question_source')
      const answer = documents.find(document => document.role === 'official_answers')
      if (!question || !answer) throw new Error('Listening source decisions require separate question/answer sources')
      const listeningSource = resolveListeningSourceDecision({ decision: raw.listeningSourceDecision,
        documents, evidence, confirmation, confirmationBytes: ocrSourceBytes.confirmationBytes, resolved })
      authoredExpected = produceNck1MaterializationFromStructures({
        paperId: raw.paperId, documents, question, answer, coverage: question,
        questionStructure: resolved.structures.get(question.documentId),
        answerStructure: resolved.structures.get(answer.documentId),
        issues: [], sourceVisuals: resolved.sourceVisuals, mediaInventory: raw.media,
        codePrefix: 'NCK1_OCR', listeningSource,
      }).materialization
      if (digestJson(raw.listening?.transcript) !== digestJson(authoredExpected.listening?.transcript)
        || authoredExpected.issues.some(issue => /LISTENING_(?:CUE|TRANSCRIPT|ANNOUNCEMENT|ANALYSIS|SOURCE_LOCATOR|MIXED)/u.test(issue.code))) {
        throw new Error('Authored listening transcript must replay exactly, without unresolved source boundaries')
      }
    }
    let expected = null
    if (confirmation.schemaVersion === NCK1_OCR_CONFIRMATION_SCHEMA_VERSION_V3
      || (raw.schemaVersion === 'nck1-source-materialization-v12' && raw.paragraphJoins)) {
      const question = raw.documents.find(document => !document.renditionOf && document.role === 'question_source')
      const answer = raw.documents.find(document => !document.renditionOf && document.role === 'official_answers')
      // Reuse the producer's source-order parser, not the mutable Candidate's
      // claimed group. This also excludes answer-source tables from student content.
      expected = authoredExpected || (question && answer ? produceNck1MaterializationFromStructures({
        paperId: raw.paperId, documents: raw.documents, question, answer, coverage: question,
        questionStructure: resolved.structures.get(question.documentId),
        answerStructure: resolved.structures.get(answer.documentId),
        issues: [], sourceVisuals: resolved.sourceVisuals, mediaInventory: raw.media,
        codePrefix: 'NCK1_OCR',
      }).materialization : { groups: [], sourceCoverage: { visuals: resolved.sourceVisuals } })
      if (raw.paragraphJoins && ['nck1-source-materialization-v8', 'nck1-source-materialization-v9', 'nck1-source-materialization-v10', 'nck1-source-materialization-v11', 'nck1-source-materialization-v12', 'nck1-source-materialization-v13'].includes(raw.schemaVersion)) {
        paragraphJoins = verifyCrossPageParagraphJoinEvidence(raw, {
          evidence, confirmation, confirmationBytes: ocrSourceBytes.confirmationBytes, resolved, expected, authorityRef,
        })
      }
    }
    if (confirmation.schemaVersion === NCK1_OCR_CONFIRMATION_SCHEMA_VERSION_V3) {
      const flatten = blocks => blocks.flatMap(block => block.kind === 'framed_columns'
        ? block.columns.flatMap(column => flatten(column.blocks)) : [block])
      const blocks = raw.groups.flatMap(group => flatten(group.blocks))
      const replacement = replaceOcrStructuredAnswerRegions(raw, expected, resolved, confirmation, evidence)
      restoredParagraphs = replacement.paragraphs
      const expectedGroups = expected.groups
      const hasTrimCandidate = resolved.contentMedia.some(parent => raw.media.some(media =>
        media.mediaId === parent.mediaId && media.extraction?.kind === 'pdf_crop'
        && digestJson(media.extraction.region) !== digestJson(parent.source.region)))
      // Only a changed parent crop needs proof before placement projection.
      // Other inputs retain the existing placement/table diagnostic precedence.
      const topTrims = hasTrimCandidate
        ? validateOcrMediaConsumption(raw, resolved, confirmation, evidence, expected, blocks, replacement.replacements, pendingMeasurements)
        : new Map()
      const placementSource = (block, project) => {
        const trim = project && block?.kind === 'figure' ? topTrims.get(block.mediaId) : null
        return trim && trim.block === block && digestJson(block.source) === digestJson(trim.childSource)
          ? trim.parentSource : block?.source ?? null
      }
      const placements = (groups, project = false) => groups.flatMap(group => {
        const ordered = flatten(group.blocks)
        return ordered.flatMap((block, index) => ['table', 'figure'].includes(block.kind) ? [{
          slotId: group.slotId, kind: block.kind, source: placementSource(block, project),
          ...(block.kind === 'figure' ? { mediaId: block.mediaId } : {}),
          before: placementSource(ordered[index - 1], project),
          after: placementSource(ordered[index + 1], project),
        }] : [])
      })
      if (digestJson(placements(raw.groups, true)) !== digestJson(placements(expectedGroups))) {
        throw new Error('OCR visuals must retain exactly their confirmed question-source groups and neighboring source anchors')
      }
      const expectedTables = expectedGroups.flatMap(group => flatten(group.blocks)).filter(block => block.kind === 'table')
      const cells = table => table?.rows.map(row => row.cells.map(cell => ({
        content: cell.content, role: cell.role, columnSpan: cell.columnSpan, rowSpan: cell.rowSpan,
      })))
      for (const document of raw.documents.filter(document => document.role === 'question_source')) {
        for (const table of resolved.structures.get(document.documentId)?.tables || []) {
          const matches = blocks.filter(block => block.kind === 'table' && digestJson(block.source) === digestJson(table.source))
          const expected = expectedTables.find(block => digestJson(block.source) === digestJson(table.source))
          if (matches.length !== 1 || !expected || digestJson(cells(matches[0])) !== digestJson(cells(expected))) {
            throw new Error('Confirmed OCR table must retain its exact cells and one source-bound content placement')
          }
        }
      }
      if (!hasTrimCandidate) validateOcrMediaConsumption(raw, resolved, confirmation, evidence, expected, blocks, replacement.replacements, pendingMeasurements)
    }
    const marked = new Map()
    for (const structure of resolved.structures.values()) {
      for (const paragraph of structure.paragraphs) {
        if (!paragraph.sourceEmphasis) continue
        const key = digestJson(paragraph.sourceIndex)
        if (marked.has(key)) throw new Error('OCR emphasis locator is ambiguous')
        marked.set(key, paragraph)
      }
    }
    for (const paragraph of restoredParagraphs) {
      if (!paragraph.sourceEmphasis) continue
      const key = digestJson(paragraph.sourceIndex)
      if (!marked.has(key)) marked.set(key, paragraph)
    }
    const consumed = new Set()
    const corrections = new Map((review?.targets || []).map(target => [target.jsonPointer, target.corrections]))
    if (writingEmphasis) {
      for (const [key, paragraph] of marked) {
        const locator = paragraph.sourceIndex
        if (raw.documents.find(document => document.documentId === locator.documentId)?.role !== 'official_answers') continue
        // Answer headings, scoring and sample starters remain answer-source
        // evidence. Equal words in a question never inherit their formatting.
        const observation = observationForLocator(`observation:answer-source-emphasis:${key.slice(7)}`,
          'source_answer_emphasis', locator,
          { text: paragraph.text, ranges: paragraph.sourceEmphasis, evidenceDigest: evidence.evidenceDigest,
            confirmationSha256: sha256(ocrSourceBytes.confirmationBytes) }, documentsById)
        observation.extraction.version = '5'
        source.observations.push(observation)
        consumed.add(key)
      }
    }
    const apply = (locator, parts, derived, targetId, derivedGroup, stem = false) => {
      const key = digestJson(locator)
      const paragraph = marked.get(key)
      if (!paragraph) return null
      if (consumed.has(key)) throw new Error('OCR emphasis locator is used more than once')
      const text = parts.map(part => part.text).join('')
      const prefix = stem ? paragraph.text.match(/^\s*\d+[.．、]\s*/u)?.[0] : ''
      if (prefix === undefined || paragraph.text.slice(prefix.length, prefix.length + text.length) !== text
        || (!stem && paragraph.text !== text)
        || (stem && paragraph.text.slice(prefix.length + text.length).trim()
          && !/^\s+A[.．、]/u.test(paragraph.text.slice(prefix.length + text.length)))) {
        throw new Error('OCR emphasis does not match the exact materialized text')
      }
      const ranges = paragraph.sourceEmphasis.map(range => ({ ...range,
        start: range.start - prefix.length, end: range.end - prefix.length }))
      if (ranges.some(range => range.start < 0 || range.end > text.length)) {
        throw new Error('OCR emphasis is outside the supported Reading text or stem')
      }
      let offset = 0
      const replacements = new Map()
      const inlines = parts.flatMap((part, index) => {
        const localRanges = ranges.flatMap(range => {
          const start = Math.max(range.start - offset, 0)
          const end = Math.min(range.end - offset, part.text.length)
          return end > start ? [{ start, end, marks: range.marks }] : []
        })
        const mapped = mapSourceEmphasisEdits(part.text, localRanges, corrections.get(part.pointer) || [])
        if (mapped.text !== derived[index]?.text) throw new Error('OCR emphasis editorial mapping differs from effective text')
        offset += part.text.length
        const nodes = localRanges.length ? splitSourceEmphasis(mapped.text, mapped.ranges, derived[index].nodeId, ruleVersion) : [derived[index]]
        replacements.set(derived[index].nodeId, nodes.map(node => node.nodeId))
        return nodes
      })
      if (writingEmphasis && ['application-writing', 'continuation-writing'].includes(derivedGroup.family)) {
        const remap = value => {
          if (!value || typeof value !== 'object') return
          if (Array.isArray(value.inlineNodeIds)) value.inlineNodeIds = value.inlineNodeIds.flatMap(id => replacements.get(id) ?? [id])
          for (const child of Object.values(value)) if (child && typeof child === 'object') remap(child)
        }
        remap(derivedGroup.variant)
      }
      const observation = observationForLocator(`observation:source-emphasis:${targetId}`,
        derivedGroup.family === 'reading' ? 'source_reading_emphasis' : 'source_writing_emphasis', locator,
        { targetId, ranges: paragraph.sourceEmphasis, evidenceDigest: evidence.evidenceDigest,
          confirmationSha256: sha256(ocrSourceBytes.confirmationBytes) }, documentsById)
      observation.extraction.version = '4'
      source.observations.push(observation)
      for (const inline of inlines) derivedGroup.sourceSpanRefsByTarget[`content_node:${inline.nodeId}`] = [`source-span:${observation.observationId}`]
      consumed.add(key)
      return inlines
    }
    for (const [groupIndex, group] of raw.groups.entries()) {
      if (group.family !== 'reading'
        && !(writingEmphasis && ['application-writing', 'continuation-writing'].includes(group.family))) continue
      const derivedGroup = source.groups.find(item => item.groupId === group.groupId)
      const derivedBlocks = new Map(sourceOrderedParagraphEntries(derivedGroup.content.blocks, '')
        .map(({ block }) => [block.nodeId, block]))
      for (const { block, path: blockPath } of sourceOrderedParagraphEntries(group.blocks, `/groups/${groupIndex}/blocks`)) {
        if (block.content.some(item => item.kind !== 'text')) continue
        if (!marked.has(digestJson(block.source))) continue
        const pointer = blockPath.replace(/\[(\d+)\]/gu, '/$1').replaceAll('.', '/')
        const derived = derivedBlocks.get(block.blockId)
        if (!derived) throw new Error('OCR emphasis targets a source instruction without a rich-text paragraph')
        let inlines = null
        try {
          inlines = apply(block.source, block.content.map((item, index) => ({
            text: item.text, pointer: `${pointer}/content/${index}/text`,
          })), derived.inlines, block.blockId, derivedGroup)
        } catch (error) {
          if (!warnings) throw error
          // Emphasis on an unsupported target drops the marks, not the text.
          warnings.push(adapterIssue('MATERIALIZATION_SOURCE_EMPHASIS_DROPPED',
            error.message, pointer))
        }
        if (inlines) derived.inlines = inlines
      }
      for (const [index, question] of group.questions.entries()) {
        const derived = derivedGroup.variant.questions[index]
        if (optionEmphasis && group.family === 'reading' && question.options.every(option => !option.figure)) {
          const mapped = resolveOcrQuestionTextEmphasis(question, resolved.structures.get(question.source.documentId))
          for (const paragraph of mapped.paragraphs) {
            const key = digestJson(paragraph.sourceIndex)
            if (!marked.has(key) || consumed.has(key)) throw new Error('OCR option emphasis source must be consumed exactly once')
            consumed.add(key)
          }
          for (const target of mapped.targets.filter(target => target.ranges.length)) {
            const optionIndex = target.key === 'stem' ? null : Number(target.key.split(':')[1])
            const pointer = `/groups/${groupIndex}/questions/${index}/${optionIndex === null ? 'stem' : `options/${optionIndex}/text`}`
            const original = optionIndex === null ? derived.stem
              : derivedGroup.variant.choiceOwnership.sets[index]?.options[optionIndex]?.content
            if (original?.length !== 1 || original[0].kind !== 'text') throw new Error('OCR option emphasis target is not one literal text node')
            const effective = mapSourceEmphasisEdits(target.text, target.ranges, corrections.get(pointer) || [])
            if (effective.text !== original[0].text) throw new Error('OCR option emphasis editorial mapping differs from effective text')
            const inlines = splitSourceEmphasis(effective.text, effective.ranges, original[0].nodeId, ruleVersion)
            const refs = target.fragments.map(({ paragraph }, fragmentIndex) => {
              const observation = observationForLocator(`observation:source-option-emphasis:${question.questionId}:${target.key}:${fragmentIndex + 1}`,
                'source_reading_option_emphasis', paragraph.sourceIndex,
                { targetId: original[0].nodeId, targetPointer: pointer, text: paragraph.text,
                  ranges: paragraph.sourceEmphasis, targetRanges: target.ranges,
                  evidenceDigest: evidence.evidenceDigest, confirmationSha256: sha256(ocrSourceBytes.confirmationBytes) }, documentsById)
              observation.extraction.version = '15'
              source.observations.push(observation)
              return `source-span:${observation.observationId}`
            })
            for (const inline of inlines) derivedGroup.sourceSpanRefsByTarget[`content_node:${inline.nodeId}`] = refs
            if (optionIndex === null) derived.stem = inlines
            else derivedGroup.variant.choiceOwnership.sets[index].options[optionIndex].content = inlines
          }
          continue
        }
        const inlines = apply(question.source, [{ text: question.stem,
          pointer: `/groups/${groupIndex}/questions/${index}/stem`,
        }], derived.stem, question.questionId, derivedGroup, true)
        if (inlines) derived.stem = inlines
      }
    }
    if (consumed.size !== marked.size) {
      // OCR emphasis no surface consumes (e.g. bolded seven-choices subheads or
      // answer-document marks) loses the style only; the text stays literal and
      // each dropped mark is reported for review instead of blocking.
      if (!warnings) throw new Error('OCR source emphasis has an unmatched or unsupported target')
      for (const [key, paragraph] of marked) {
        if (consumed.has(key)) continue
        warnings.push(adapterIssue('MATERIALIZATION_SOURCE_EMPHASIS_DROPPED',
          'OCR source emphasis has an unmatched or unsupported target',
          `ocrSourceEmphasis[${key.slice(0, 12)}…] ${JSON.stringify(paragraph.sourceIndex)}`))
      }
    }
    // Join after source emphasis and editorial mapping. The two original text
    // segments retain their inline IDs, exact report pointers and source spans.
    for (const { join, blocks, confirmedItems } of paragraphJoins) {
      const group = source.groups.find(group => group.groupId === join.groupId)
      const index = group.content.blocks.findIndex(block => block.nodeId === blocks[0].blockId)
      const left = group.content.blocks[index], right = group.content.blocks[index + 1]
      if (left?.kind !== 'paragraph' || right?.kind !== 'paragraph' || right.nodeId !== blocks[1].blockId
        || [left, right].some(paragraph => paragraph.inlines.some(node => node.kind !== 'text'
          && !(join.schemaVersion === CROSS_PAGE_PARAGRAPH_JOIN_VERSION_V2 && group.family !== 'reading' && node.kind === 'blank_ref')))
        || paragraphJoinBoundaryNeedsTrim(left.inlines) || paragraphJoinBoundaryNeedsTrim(right.inlines)) {
        throw new Error('Cross-page paragraph join cannot map its two effective text segments')
      }
      const refs = join.fragments.map((fragment, fragmentIndex) => {
        const observation = observationForLocator(`observation:paragraph-join:${join.joinId}:${fragmentIndex + 1}`,
          'source_cross_page_paragraph_fragment', fragment.source,
          { relation: structuredClone(join), fragmentIndex, text: join.schemaVersion === CROSS_PAGE_PARAGRAPH_JOIN_VERSION_V2 ? confirmedItems[fragmentIndex].text : blocks[fragmentIndex].content.map(part => part.text).join('') },
          documentsById)
        observation.extraction.version = join.schemaVersion === CROSS_PAGE_PARAGRAPH_JOIN_VERSION_V2 ? ([nck1CrossPageProducerIssueAuthorityRef, nck1MultipleWritingNoticesAuthorityRef, nck1InImageOptionLabelsV2AuthorityRef].some(ref => ref.manifestDigest === authorityRef.manifestDigest) ? '17' : '16') : '12'
        source.observations.push(observation)
        const ref = `source-span:${observation.observationId}`
        const paragraph = fragmentIndex === 0 ? left : right
        for (const inline of paragraph.inlines) {
          const target = `content_node:${inline.nodeId}`
          group.sourceSpanRefsByTarget[target] = [...new Set([...(group.sourceSpanRefsByTarget[target] || []), ref])]
        }
        return ref
      })
      const separator = { kind: 'text', nodeId: `text:paragraph-join:${join.joinId}:separator`, text: ' ' }
      group.sourceSpanRefsByTarget[`content_node:${left.nodeId}`] = refs
      group.sourceSpanRefsByTarget[`content_node:${separator.nodeId}`] = refs
      if (join.schemaVersion === CROSS_PAGE_PARAGRAPH_JOIN_VERSION_V2) delete group.sourceSpanRefsByTarget[`content_node:${right.nodeId}`]
      left.inlines.push(separator, ...right.inlines)
      group.content.blocks.splice(index + 1, 1)
    }
  } catch (error) {
    issues.push(adapterIssue((error.code === 'MATERIALIZATION_PARAGRAPH_JOIN_PRODUCER_ISSUE' || error.code?.startsWith('OCR_STRUCTURED_ANSWER_REGION_'))
      ? error.code : 'MATERIALIZATION_SOURCE_EMPHASIS_UNSUPPORTED', error.message, '$.ocrSourceBytes'))
  }
}

// Scoped to one synchronous projection. Never persist parsed sources across
// requests or trust object identity: every lookup rehashes the exact input bytes.
let sourceCache = null
export function withNck1MaterializationSourceCache(callback) {
  const previous = sourceCache
  sourceCache = new Map()
  try { return callback() } finally { sourceCache = previous }
}

export function nck1MaterializationAuthorityForInput(input) {
  const raw = parseMaterialization(input.materializationBytes)
  if (raw?.schemaVersion === 'nck1-source-materialization-v13') return nck1InImageOptionLabelsV2AuthorityRef
  if (/^nck1-source-materialization-v(?:[7-9]|1[012])$/u.test(raw?.schemaVersion)
    && Array.isArray(raw.groups) && raw.groups.some(group => group?.family === 'application-writing'
      && Array.isArray(group.blocks) && writingNoticeGroups(group.blocks.map(block =>
        block?.kind === 'paragraph' && block.blockId !== group.writingTask?.drawingArea?.labelBlockRef
          && Array.isArray(block.content)
          ? block.content.filter(item => item?.kind === 'text' && typeof item.text === 'string').map(item => item.text).join('')
          : '')).length > 1)) {
    return nck1MultipleWritingNoticesAuthorityRef
  }
  if (parseMaterialization(input.materializationBytes)?.schemaVersion === 'nck1-source-materialization-v12') return nck1CrossPageProducerIssueAuthorityRef
  if (parseMaterialization(input.materializationBytes)?.schemaVersion === 'nck1-source-materialization-v11') return nck1OcrOptionEmphasisAuthorityRef
  if (parseMaterialization(input.materializationBytes)?.schemaVersion === 'nck1-source-materialization-v10') return nck1ListeningSourceDecisionAuthorityRef
  if (parseMaterialization(input.materializationBytes)?.schemaVersion === 'nck1-source-materialization-v9') return nck1InImageOptionLabelsAuthorityRef
  if (parseMaterialization(input.materializationBytes)?.schemaVersion === 'nck1-source-materialization-v8') return nck1ParagraphJoinAuthorityRef
  if (parseMaterialization(input.materializationBytes)?.schemaVersion === 'nck1-source-materialization-v7') return nck1WritingGivenRefsAuthorityRef
  if (parseMaterialization(input.materializationBytes)?.schemaVersion === 'nck1-source-materialization-v6') return nck1ReadingStemFiguresAuthorityRef
  if (parseMaterialization(input.materializationBytes)?.schemaVersion === 'nck1-source-materialization-v5') return nck1DrawingAreaAuthorityRef
  return input.listeningInstructionCorrectionBytes ? nck1ListeningInstructionAuthorityRef : nck1MaterializationCandidateAuthorityRef
}

export function deriveNck1MaterializationBundle(rawInput, authorityRef = nck1MaterializationAuthorityForInput(rawInput)) {
  const sourceDigest = bundleDigest(
    rawInput.materializationBytes, rawInput.documents, rawInput.media,
    rawInput.listeningAudio, rawInput.spellingReviewBytes, rawInput.ocrSourceBytes,
    rawInput.listeningInstructionCorrectionBytes,
  )
  const authority = resolveCanonicalAuthority(authorityRef)
  if (!authority.ok) {
    return { input: cloneNck1MaterializationInput(rawInput), sourceDigest, materialization: null,
      source: null, request: null, issues: authority.issues }
  }
  const options = { allowMultipleApplicationNotices: closureAdmitsMultipleWritingNotices(authority.closure),
    allowInImageLabelMeasurement: closureAdmitsInImageOptionLabelMeasurements(authority.closure) }
  const cacheKey = `${sourceDigest}:${authorityRef.manifestDigest}`
  let prepared = sourceCache?.get(cacheKey)
  if (prepared && bundleDigest(
    prepared.input.materializationBytes, prepared.input.documents, prepared.input.media,
    prepared.input.listeningAudio, prepared.input.spellingReviewBytes, prepared.input.ocrSourceBytes,
    prepared.input.listeningInstructionCorrectionBytes,
  ) !== sourceDigest) prepared = null
  if (!prepared) {
    const input = cloneNck1MaterializationInput(rawInput)
    const materialization = parseMaterialization(input.materializationBytes)
    prepared = { input, materialization,
      validation: materialization ? validateBundle(materialization, input, options) : null }
    // Only successful, fully verified sources can be reused within the same authority.
    if (prepared.validation && !prepared.validation.issues.length
      && !prepared.validation.pendingImageLabelMeasurements.length) sourceCache?.set(cacheKey, prepared)
  }
  const { input } = prepared
  // Derivations expose materialization to their caller. Keep that mutable result
  // separate from the verified parse retained for another authority attempt.
  let materialization = structuredClone(prepared.materialization)
  if (!materialization) {
    return { input, sourceDigest, materialization: null, source: null, request: null,
      issues: [adapterIssue('MATERIALIZATION_JSON_INVALID', 'NCK1 Source Materialization bytes are not readable JSON')] }
  }
  // Authority checks append issues; keep that list private to this derivation.
  const validation = { ...prepared.validation, issues: [...prepared.validation.issues] }
  const pendingMeasurements = new Map((validation.pendingImageLabelMeasurements || [])
    .map(value => [value.questionId, structuredClone(value)]))
  const expectedImageMeasurements = materialization.groups?.flatMap(group => group.questions || [])
    .filter(question => question.figureLayout?.measurementEvidenceBody?.schemaVersion === 'reading-source-layout-measurement-v2') || []
  if (pendingMeasurements.size !== expectedImageMeasurements.length) {
    validation.issues.push(adapterIssue('MATERIALIZATION_IMAGE_MEASUREMENT_PENDING_INVALID', 'Every v2 measurement must register exactly one private source-proof obligation'))
  }
  if (materialization.schemaVersion === 'nck1-source-materialization-v13'
    && (!input.ocrSourceBytes || !closureAdmitsInImageOptionLabelsV2(authority.closure))) {
    validation.issues.push(adapterIssue('MATERIALIZATION_AUTHORITY_UNSUPPORTED', 'Materialization v13 requires the image-option v2 schema and behavior authority'))
  }
  if (materialization.schemaVersion === 'nck1-source-materialization-v12'
    && (!input.ocrSourceBytes || ![nck1CrossPageJoinV2AuthorityRef, nck1CrossPageProducerIssueAuthorityRef, nck1MultipleWritingNoticesAuthorityRef, nck1InImageOptionLabelsV2AuthorityRef].some(ref => ref.manifestDigest === authorityRef.manifestDigest)
      || !closureAdmitsCrossPageJoinV2(resolveCanonicalAuthority(authorityRef).closure))) {
    validation.issues.push(adapterIssue('MATERIALIZATION_AUTHORITY_UNSUPPORTED', 'Materialization v12 requires the cross-page join v2 successor authority and verified OCR bytes'))
  }
  if (materialization.schemaVersion === 'nck1-source-materialization-v11'
    && (!input.ocrSourceBytes || ![nck1OcrOptionEmphasisAuthorityRef, nck1MultipleWritingNoticesAuthorityRef, nck1InImageOptionLabelsV2AuthorityRef].some(ref => ref.manifestDigest === authorityRef.manifestDigest))) {
    validation.issues.push(adapterIssue('MATERIALIZATION_AUTHORITY_UNSUPPORTED', 'Materialization v11 requires the OCR option emphasis successor authority and verified OCR bytes'))
  }
  if ((materialization.schemaVersion === 'nck1-source-materialization-v9' || Object.hasOwn(materialization, 'inImageOptionLabels'))
    && (!input.ocrSourceBytes
      || parseMaterialization(input.ocrSourceBytes.confirmationBytes)?.schemaVersion !== NCK1_OCR_CONFIRMATION_SCHEMA_VERSION_V3
      || !closureAdmitsInImageOptionLabels(resolveCanonicalAuthority(authorityRef).closure))) {
    validation.issues.push(adapterIssue('MATERIALIZATION_AUTHORITY_UNSUPPORTED', 'Materialization v9 requires the explicit in-image label reader and verified OCR bytes'))
  }
  if ((materialization.schemaVersion === 'nck1-source-materialization-v10'
    || (materialization.schemaVersion === 'nck1-source-materialization-v13' && materialization.listeningSourceDecision))
    && (!input.ocrSourceBytes
      || ![NCK1_OCR_CONFIRMATION_SCHEMA_VERSION_V2, NCK1_OCR_CONFIRMATION_SCHEMA_VERSION_V3].includes(parseMaterialization(input.ocrSourceBytes.confirmationBytes)?.schemaVersion)
      || !closureAdmitsListeningSourceDecisions(resolveCanonicalAuthority(authorityRef).closure))) {
    validation.issues.push(adapterIssue('MATERIALIZATION_AUTHORITY_UNSUPPORTED', 'Materialization v10 requires the explicit listening source reader and verified OCR bytes'))
  }
  if ((materialization.schemaVersion === 'nck1-source-materialization-v8' || materialization.paragraphJoins)
    && (!input.ocrSourceBytes
      || !(materialization.paragraphJoins?.every(join => join.schemaVersion === CROSS_PAGE_PARAGRAPH_JOIN_VERSION_V2)
        ? [NCK1_OCR_CONFIRMATION_SCHEMA_VERSION_V2, NCK1_OCR_CONFIRMATION_SCHEMA_VERSION_V3]
        : [NCK1_OCR_CONFIRMATION_SCHEMA_VERSION_V3]).includes(parseMaterialization(input.ocrSourceBytes.confirmationBytes)?.schemaVersion)
      || !closureAdmitsParagraphJoins(resolveCanonicalAuthority(authorityRef).closure))) {
    validation.issues.push(adapterIssue('MATERIALIZATION_AUTHORITY_UNSUPPORTED', 'Materialization v8 requires the explicit paragraph join reader and verified OCR bytes'))
  }
  if (['nck1-source-materialization-v7', 'nck1-source-materialization-v8', 'nck1-source-materialization-v9', 'nck1-source-materialization-v10', 'nck1-source-materialization-v11', 'nck1-source-materialization-v12', 'nck1-source-materialization-v13'].includes(materialization.schemaVersion)
    && !closureAdmitsWritingGivenRefs(resolveCanonicalAuthority(authorityRef).closure)) {
    validation.issues.push(adapterIssue('MATERIALIZATION_AUTHORITY_UNSUPPORTED', 'Materialization v7 requires the explicit writing given refs reader authority'))
  }
  if (['nck1-source-materialization-v6', 'nck1-source-materialization-v7', 'nck1-source-materialization-v8', 'nck1-source-materialization-v9', 'nck1-source-materialization-v10', 'nck1-source-materialization-v11', 'nck1-source-materialization-v12', 'nck1-source-materialization-v13'].includes(materialization.schemaVersion)
    && !closureAdmitsReadingStemFigures(resolveCanonicalAuthority(authorityRef).closure)) {
    validation.issues.push(adapterIssue('MATERIALIZATION_AUTHORITY_UNSUPPORTED', 'Materialization v6 requires the complete Reading stem figure reader authority'))
  }
  if (materialization.groups?.some(group => group.questions?.some(question => question.stemFigures))
    && parseMaterialization(input.ocrSourceBytes?.confirmationBytes)?.schemaVersion !== NCK1_OCR_CONFIRMATION_SCHEMA_VERSION_V3) {
    validation.issues.push(adapterIssue('MATERIALIZATION_STEM_FIGURE_CONFIRMATION_REQUIRED',
      'Stem figures require a verified v3 OCR question-source stream'))
  }
  if ((['nck1-source-materialization-v4', 'nck1-source-materialization-v5', 'nck1-source-materialization-v6', 'nck1-source-materialization-v7', 'nck1-source-materialization-v8', 'nck1-source-materialization-v9', 'nck1-source-materialization-v10', 'nck1-source-materialization-v11', 'nck1-source-materialization-v12', 'nck1-source-materialization-v13'].includes(materialization.schemaVersion)
    || (input.ocrSourceBytes && parseMaterialization(input.ocrSourceBytes.confirmationBytes)?.schemaVersion === NCK1_OCR_CONFIRMATION_SCHEMA_VERSION_V3))
    && !['62', '64', '66', '67', '68', '69', '71', '73', '74', '75', '76', '77', '78', '79', '80', '81'].includes(authorityRef.manifestVersion)) {
    validation.issues.push(adapterIssue('MATERIALIZATION_AUTHORITY_UNSUPPORTED', 'Source presentation and OCR content visuals require a registered source-presentation closure'))
  }
  if ((materialization.schemaVersion === 'nck1-source-materialization-v5'
    || materialization.groups?.some(group => Object.hasOwn(group.writingTask || {}, 'drawingArea')))
    && !closureAdmitsApplicationDrawingArea(resolveCanonicalAuthority(authorityRef).closure)) {
    validation.issues.push(adapterIssue('MATERIALIZATION_DRAWING_AREA_UNSUPPORTED', 'Application drawing areas require their registered successor authority'))
  }
  if (input.listeningInstructionCorrectionBytes && ![nck1ListeningInstructionAuthorityRef, nck1DrawingAreaAuthorityRef, nck1ReadingStemFiguresAuthorityRef, nck1WritingGivenRefsAuthorityRef, nck1ParagraphJoinAuthorityRef, nck1InImageOptionLabelsAuthorityRef, nck1ListeningSourceDecisionAuthorityRef, nck1OcrOptionEmphasisAuthorityRef, nck1CrossPageJoinV2AuthorityRef, nck1CrossPageProducerIssueAuthorityRef, nck1MultipleWritingNoticesAuthorityRef, nck1InImageOptionLabelsV2AuthorityRef].some(ref => ref.manifestDigest === authorityRef.manifestDigest)) {
    validation.issues.push(adapterIssue('MATERIALIZATION_AUTHORITY_UNSUPPORTED', 'Listening instruction correction requires its registered successor authority'))
  }
  if (validation.issues.length > 0) {
    return {
      input,
      sourceDigest,
      materialization,
      source: null,
      request: null,
      issues: validation.issues,
    }
  }
  // Source fidelity (including exact native DOCX paragraphs) is checked above,
  // before applying the separately bound, auditable editorial overlay.
  const rawMaterialization = materialization
  if (input.spellingReviewBytes) {
    try {
      materialization = applySpellingReview(input.materializationBytes, input.spellingReviewBytes)
      verifyTerminalWhitespaceSourceEvidence(input.materializationBytes, input.spellingReviewBytes, input.documents)
      const correctedIssues = validateNck1SourceMaterialization(materialization, options)
      if (correctedIssues.length) throw new Error(correctedIssues[0].message)
    } catch (error) {
      return { input, sourceDigest, materialization, source: null, request: null,
        issues: [adapterIssue('SPELLING_REVIEW_INVALID', error.message)] }
    }
  }
  let listeningInstructionCorrection = null
  if (input.listeningInstructionCorrectionBytes) {
    try {
      const corrected = applyListeningInstructionCorrection(input.materializationBytes,
        input.listeningInstructionCorrectionBytes, input.listeningAudio, materialization)
      const schema = resolveCanonicalAuthority(authorityRef).closure.schemas['listening-instruction-correction-v1']
      const issues = validateJsonSchema(corrected.correction, schema, '$.listeningInstructionCorrection')
      if (issues.length) throw new Error(issues[0].message)
      materialization = corrected.materialization
      listeningInstructionCorrection = { correction: corrected.correction, byteLength: input.listeningInstructionCorrectionBytes.byteLength }
    } catch (error) {
      return { input, sourceDigest, materialization, source: null, request: null,
        issues: [adapterIssue('LISTENING_INSTRUCTION_CORRECTION_INVALID', error.message)] }
    }
  }
  const derivationIssues = []
  const derivationWarnings = []
  const source = deriveNck1SemanticSource(
    materialization,
    validation.documentsById,
    validation.mediaById,
    validation.instructionDocument,
    derivationIssues,
    { authorityRef, listeningInstructionCorrection },
  )
  if (options.allowMultipleApplicationNotices) {
    for (const observation of source.observations) {
      if (observation.observationId?.startsWith('observation:application:')
        || observation.kind?.startsWith('application_')) observation.extraction.version = '18'
    }
  }
  if ([nck1MaterializationCandidateAuthorityRef, nck1ListeningInstructionAuthorityRef, nck1DrawingAreaAuthorityRef, nck1ReadingStemFiguresAuthorityRef, nck1WritingGivenRefsAuthorityRef, nck1ParagraphJoinAuthorityRef, nck1InImageOptionLabelsAuthorityRef, nck1ListeningSourceDecisionAuthorityRef, nck1OcrOptionEmphasisAuthorityRef, nck1CrossPageJoinV2AuthorityRef, nck1CrossPageProducerIssueAuthorityRef, nck1MultipleWritingNoticesAuthorityRef, nck1InImageOptionLabelsV2AuthorityRef, nck1MaterializationHistoricalAuthorityRef58,
    nck1MaterializationHistoricalAuthorityRef59, nck1MaterializationHistoricalAuthorityRef61, nck1MaterializationHistoricalAuthorityRef62, nck1MaterializationHistoricalAuthorityRef64, nck1MaterializationHistoricalAuthorityRef66]
    .some(ref => authorityRef.manifestDigest === ref.manifestDigest)) {
    appendReadingSourceEmphasis(source, rawMaterialization, validation.documentsById,
      input.spellingReviewBytes ? JSON.parse(new TextDecoder().decode(input.spellingReviewBytes)) : null,
      derivationIssues, authority.closure)
  }
  if (input.ocrSourceBytes) {
    if (![nck1MaterializationCandidateAuthorityRef, nck1ListeningInstructionAuthorityRef, nck1DrawingAreaAuthorityRef, nck1ReadingStemFiguresAuthorityRef, nck1WritingGivenRefsAuthorityRef, nck1ParagraphJoinAuthorityRef, nck1InImageOptionLabelsAuthorityRef, nck1ListeningSourceDecisionAuthorityRef, nck1OcrOptionEmphasisAuthorityRef, nck1CrossPageJoinV2AuthorityRef, nck1CrossPageProducerIssueAuthorityRef, nck1MultipleWritingNoticesAuthorityRef, nck1InImageOptionLabelsV2AuthorityRef, nck1MaterializationHistoricalAuthorityRef61, nck1MaterializationHistoricalAuthorityRef62, nck1MaterializationHistoricalAuthorityRef64, nck1MaterializationHistoricalAuthorityRef66]
      .some(ref => authorityRef.manifestDigest === ref.manifestDigest)) {
      derivationIssues.push(adapterIssue('MATERIALIZATION_SOURCE_EMPHASIS_UNSUPPORTED', 'Historical authorities do not accept OCR source emphasis'))
    } else {
      appendOcrReadingSourceEmphasis(source, rawMaterialization, validation.documentsById, input.ocrSourceBytes,
        input.spellingReviewBytes ? JSON.parse(textDecoder.decode(input.spellingReviewBytes)) : null, derivationIssues,
        ['4', '5'].includes(resolveCanonicalAuthority(authorityRef).closure.artifacts['rich-content']?.version),
        [nck1OcrOptionEmphasisAuthorityRef, nck1CrossPageJoinV2AuthorityRef, nck1CrossPageProducerIssueAuthorityRef, nck1MultipleWritingNoticesAuthorityRef, nck1InImageOptionLabelsV2AuthorityRef].some(ref => ref.manifestDigest === authorityRef.manifestDigest), authorityRef, authority.closure, pendingMeasurements,
        // Only the authority this input currently selects may soften dropped
        // emphasis to warnings; historical replays keep the hard issue.
        nck1MaterializationAuthorityForInput(rawInput).manifestDigest === authorityRef.manifestDigest
          ? derivationWarnings : null)
    }
  }
  if (pendingMeasurements.size) {
    derivationIssues.push(adapterIssue('MATERIALIZATION_IMAGE_MEASUREMENT_UNPROVEN', 'Sealed OCR replay and full image-bank proof did not consume every measurement obligation'))
  }
  if (derivationIssues.length > 0) {
    return {
      input,
      sourceDigest,
      materialization,
      source,
      request: null,
      issues: derivationIssues,
      warnings: derivationWarnings,
    }
  }
  return {
    input,
    sourceDigest,
    materialization,
    materializationDigest: digestNck1SourceMaterialization(materialization, options),
    source,
    warnings: derivationWarnings,
    request: {
      authority: authorityRef,
      evidence: {
        documents: compilerDocuments(
          input,
          materialization,
          source,
          validation.instructionDocument,
          authorityRef,
        ),
      },
    },
    issues: [],
  }
}

export function nck1MaterializationSourceSummary(derivation) {
  return {
    mediaType: NCK1_MATERIALIZATION_MEDIA_TYPE,
    sha256: derivation.sourceDigest,
    byteLength:
      derivation.input.materializationBytes.byteLength
      + (derivation.input.spellingReviewBytes?.byteLength ?? 0)
      + (derivation.input.listeningInstructionCorrectionBytes?.byteLength ?? 0)
      + (derivation.input.ocrSourceBytes?.evidenceBytes.byteLength ?? 0)
      + (derivation.input.ocrSourceBytes?.confirmationBytes.byteLength ?? 0)
      + derivation.input.documents.reduce((total, entry) => total + entry.bytes.byteLength, 0)
      + derivation.input.media.reduce((total, entry) => total + entry.bytes.byteLength, 0),
    ...(derivation.input.spellingReviewBytes ? {
      spellingReview: { sha256: sha256(derivation.input.spellingReviewBytes), byteLength: derivation.input.spellingReviewBytes.byteLength },
    } : {}),
    ...(derivation.input.listeningInstructionCorrectionBytes ? {
      listeningInstructionCorrection: { sha256: sha256(derivation.input.listeningInstructionCorrectionBytes),
        byteLength: derivation.input.listeningInstructionCorrectionBytes.byteLength },
    } : {}),
    materialization: {
      sha256: sha256(derivation.input.materializationBytes),
      byteLength: derivation.input.materializationBytes.byteLength,
      ...(derivation.materializationDigest
        ? { semanticDigest: derivation.materializationDigest }
        : {}),
    },
    documents: derivation.input.documents.map((entry) => ({
      documentId: entry.documentId,
      sha256: sha256(entry.bytes),
      byteLength: entry.bytes.byteLength,
    })),
    media: derivation.input.media.map((entry) => ({
      mediaId: entry.mediaId,
      sha256: sha256(entry.bytes),
      byteLength: entry.bytes.byteLength,
      ...(entry.renditionBytes
        ? {
            renditionSha256: sha256(entry.renditionBytes),
            renditionByteLength: entry.renditionBytes.byteLength,
          }
        : {}),
    })),
  }
}
