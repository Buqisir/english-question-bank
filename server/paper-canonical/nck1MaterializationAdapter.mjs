import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  resolveCanonicalAuthority,
  nck1MaterializationCandidateAuthorityRef,
  nck1MaterializationHistoricalAuthorityRef58,
  nck1MaterializationHistoricalAuthorityRef59,
  nck1MaterializationHistoricalAuthorityRef61,
} from '../../shared/paper-canonical/authority.mjs'
import { SOURCE_INSTRUCTION_SLOTS } from '../../shared/paper-canonical/sourcePresentation.mjs'
import {
  digestNck1SourceMaterialization,
  validateNck1SourceMaterialization,
  normalizedWritingText,
} from '../../shared/paper-canonical/nck1SourceMaterialization.mjs'
import { writingNoticeGroup, writingWordCount } from '../../shared/paper-canonical/applicationWritingDisplay.mjs'
import {
  digestJson,
  exactKeys,
  sha256,
} from '../../shared/paper-canonical/stable.mjs'
import { extractDocxDocumentParagraphs, extractDocxParagraphEmphasis } from './docxSourceAdapter.mjs'
import { mapSourceEmphasisEdits, splitSourceEmphasis } from './sourceEmphasis.mjs'
import { resolveConfirmedNck1OcrEvidence, NCK1_OCR_CONFIRMATION_SCHEMA_VERSION_V2, NCK1_OCR_CONFIRMATION_SCHEMA_VERSION_V3 } from '../paper-import/nck1OcrSourceEvidence.mjs'
import { produceNck1MaterializationFromStructures } from '../paper-import/nck1DocxMaterializationProducer.mjs'
import { rasterPdfRegion } from './pdfRegionRaster.mjs'
import { applySpellingReview, verifyTerminalWhitespaceSourceEvidence, SPELLING_REVIEW_FILE } from '../paper-import/spellingReview.mjs'
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

function bundleDigest(materializationBytes, documents, media, listeningAudio, spellingReviewBytes, ocrSourceBytes) {
  return digestJson({
    materialization: sha256(materializationBytes),
    ...(listeningAudio ? { listeningAudio } : {}),
    ...(spellingReviewBytes ? { spellingReview: sha256(spellingReviewBytes) } : {}),
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

function validateBundle(materialization, input) {
  const issues = validateNck1SourceMaterialization(materialization)
    .map((item) => adapterIssue(item.code, item.message, item.path))
  const documentsById = new Map(input.documents.map((entry) => [entry.documentId, entry]))
  const mediaById = new Map(input.media.map((entry) => [entry.mediaId, entry]))
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
      const temp = mkdtempSync(path.join(tmpdir(), 'eqb-reading-layout-proof-'))
      try {
        const measurement = question.figureLayout.measurementEvidenceBody
        const sourcePath = path.join(temp, 'source.pdf')
        writeFileSync(sourcePath, documentsById.get(question.source.documentId).bytes)
        const bbox = execFileSync('pdftotext', ['-f', String(question.source.page), '-l', String(question.source.page), '-bbox', sourcePath, '-'], { encoding: 'utf8' })
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
        issues.push(adapterIssue('MATERIALIZATION_FIGURE_MEASUREMENT_UNVERIFIED', 'Measured Reading layout must replay source PDF page dimensions and A-D label boxes within 0.5pt', '$.groups'))
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
  return { issues, documentsById, mediaById, instructionDocument }
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

function writingVariant(group, content, issues, source, documentsById) {
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
  const paragraphs = group.blocks.filter(block => block.kind === 'paragraph')
  const notice = writingNoticeGroup(paragraphs.map(block => normalizedWritingText(paragraphText(block))))
  const noticeBlocks = notice ? paragraphs.slice(notice.startIndex, notice.startIndex + notice.blockCount) : []
  const wordCountBlock = noticeBlocks.find(block => writingWordCount(paragraphText(block)) === task.wordCountTarget)
  if (!wordCountBlock) {
    issues.push(adapterIssue('MATERIALIZATION_WRITING_WORD_COUNT_UNRESOLVED', `Writing word-count source for ${group.groupId} must resolve to one paragraph`, '$.groups'))
    return null
  }
  if (group.family === 'application-writing') {
    const givenBlocks = paragraphs.slice(notice.startIndex + notice.blockCount)
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
    const promptBlocks = group.blocks.filter((block) =>
      block.kind === 'paragraph' && !givenBlockIds.has(block.blockId))
    const situationBlock = promptBlocks.find((block) =>
      paragraphText(block).includes(task.prompt)) || promptBlocks[0]
    if (!situationBlock || promptBlocks.length + givenParts.length !== group.blocks.length) {
      issues.push(adapterIssue('MATERIALIZATION_APPLICATION_PROMPT_UNRESOLVED', `Application prompt for ${group.groupId} must resolve to paragraph blocks`, '$.groups'))
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
      contentRequirements: promptBlocks
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

function groupVariant(group, answersByQuestionId, content, issues, source, documentsById) {
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
    return writingVariant(group, content, issues, source, documentsById)
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
    span: { start: 0, end: document.bytes.byteLength },
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

function appendListeningGroups(source, materialization, documentsById) {
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
          && materialization.listening.timing.some((entry) =>
            entry?.kind === 'section1_playback' && entry.passes === 1)
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
  { analyzedPackage = false, authorityRef = nck1MaterializationCandidateAuthorityRef } = {},
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
    const canonicalBlocks = group.family === 'continuation-writing'
      ? group.blocks.filter((block) =>
          block.kind !== 'paragraph'
          || paragraphText(block) !== group.writingTask.prompt)
      : group.blocks
    const content = { blocks: canonicalBlocks.map(canonicalBlock) }
    const groupMedia = [
      ...referencedMediaIds(group.blocks),
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
          ...(['nck1-source-materialization-v2', 'nck1-source-materialization-v3', 'nck1-source-materialization-v4', 'nck1-analyzed-package-content-v1'].includes(materialization.schemaVersion)
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
      ),
      sourceSpanRefsByTarget: Object.fromEntries([
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
  appendListeningGroups(source, materialization, documentsById)
  for (const entry of materialization.sourcePresentation?.instructions || []) {
    const group = source.groups.find(group => group.slotId === canonicalSlotId(entry.slotId))
    const instructionId = SOURCE_INSTRUCTION_SLOTS[entry.slotId]
    const observation = observationForLocator(`observation:source-instruction:${group.groupId}`,
      'source_instruction', entry.source, { instructionId, text: entry.text }, documentsById)
    observation.extraction.version = '5'
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
      bytes: new Uint8Array(input.materializationBytes),
      declared: {
        mediaType: NCK1_MATERIALIZATION_MEDIA_TYPE,
        originalName: `${materialization.schemaVersion}.json`,
      },
    },
    ...(input.spellingReviewBytes ? [{
      inputKey: 'spelling_review',
      roles: ['source_provenance'],
      bytes: new Uint8Array(input.spellingReviewBytes),
      declared: { mediaType: 'application/json', originalName: SPELLING_REVIEW_FILE },
    }] : []),
    ...(input.ocrSourceBytes ? ['evidence', 'confirmation'].map((kind) => ({
      inputKey: `ocr_source_${kind}`,
      roles: ['source_provenance'],
      bytes: new Uint8Array(input.ocrSourceBytes[`${kind}Bytes`]),
      declared: { mediaType: 'application/json', originalName: `nck1-ocr-source-${kind}-v1.json` },
    })) : []),
    ...input.documents.flatMap((entry) => {
      const document = documentsById.get(entry.documentId)
      const sourceDocument = {
        inputKey: inputKeyForDocument(entry.documentId),
        roles: sourceRoles(document.role),
        bytes: new Uint8Array(entry.bytes),
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
        bytes: new Uint8Array(page.bytes),
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
        bytes: new Uint8Array(entry.bytes),
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
        bytes: new Uint8Array(entry.renditionBytes),
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

function appendReadingSourceEmphasis(source, raw, documentsById, review, issues) {
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
            ? splitSourceEmphasis(mapped.text, mapped.ranges, derived.inlines[index].nodeId)
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

function appendOcrReadingSourceEmphasis(source, raw, documentsById, ocrSourceBytes, review, issues) {
  try {
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
    if (confirmation.schemaVersion === NCK1_OCR_CONFIRMATION_SCHEMA_VERSION_V3) {
      const flatten = blocks => blocks.flatMap(block => block.kind === 'framed_columns'
        ? block.columns.flatMap(column => flatten(column.blocks)) : [block])
      const blocks = raw.groups.flatMap(group => flatten(group.blocks))
      const question = raw.documents.find(document => !document.renditionOf && document.role === 'question_source')
      const answer = raw.documents.find(document => !document.renditionOf && document.role === 'official_answers')
      // Reuse the producer's source-order parser, not the mutable Candidate's
      // claimed group. This also excludes answer-source tables from student content.
      const expectedGroups = question && answer ? produceNck1MaterializationFromStructures({
        paperId: raw.paperId, documents: raw.documents, question, answer, coverage: question,
        questionStructure: resolved.structures.get(question.documentId),
        answerStructure: resolved.structures.get(answer.documentId),
        issues: [], sourceVisuals: resolved.sourceVisuals, mediaInventory: raw.media,
        codePrefix: 'NCK1_OCR',
      }).materialization.groups : []
      const placements = groups => groups.flatMap(group => {
        const ordered = flatten(group.blocks)
        return ordered.flatMap((block, index) => ['table', 'figure'].includes(block.kind) ? [{
          slotId: group.slotId, kind: block.kind, source: block.source,
          ...(block.kind === 'figure' ? { mediaId: block.mediaId } : {}),
          before: ordered[index - 1]?.source ?? null,
          after: ordered[index + 1]?.source ?? null,
        }] : [])
      })
      if (digestJson(placements(raw.groups)) !== digestJson(placements(expectedGroups))) {
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
      if (raw.media.length !== resolved.contentMedia.length) {
        throw new Error('OCR media inventory must contain only the confirmed question-source crops')
      }
      for (const { mediaId, source: locator } of resolved.contentMedia) {
        const media = raw.media.find(item => item.mediaId === mediaId)
        if (!media || media.extraction.kind !== 'pdf_crop'
          || media.extraction.documentId !== locator.documentId || media.extraction.page !== locator.page
          || digestJson(media.extraction.region) !== digestJson(locator.region)
          || blocks.filter(block => block.kind === 'figure' && block.mediaId === mediaId
            && digestJson(block.source) === digestJson(locator)).length !== 1) {
          throw new Error('Confirmed OCR image must retain its exact source crop and one content placement')
        }
      }
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
    const consumed = new Set()
    const corrections = new Map((review?.targets || []).map(target => [target.jsonPointer, target.corrections]))
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
      const inlines = parts.flatMap((part, index) => {
        const localRanges = ranges.flatMap(range => {
          const start = Math.max(range.start - offset, 0)
          const end = Math.min(range.end - offset, part.text.length)
          return end > start ? [{ start, end, marks: range.marks }] : []
        })
        const mapped = mapSourceEmphasisEdits(part.text, localRanges, corrections.get(part.pointer) || [])
        if (mapped.text !== derived[index]?.text) throw new Error('OCR emphasis editorial mapping differs from effective text')
        offset += part.text.length
        return localRanges.length ? splitSourceEmphasis(mapped.text, mapped.ranges, derived[index].nodeId) : [derived[index]]
      })
      const observation = observationForLocator(`observation:source-emphasis:${targetId}`,
        'source_reading_emphasis', locator,
        { targetId, ranges: paragraph.sourceEmphasis, evidenceDigest: evidence.evidenceDigest,
          confirmationSha256: sha256(ocrSourceBytes.confirmationBytes) }, documentsById)
      observation.extraction.version = '4'
      source.observations.push(observation)
      for (const inline of inlines) derivedGroup.sourceSpanRefsByTarget[`content_node:${inline.nodeId}`] = [`source-span:${observation.observationId}`]
      consumed.add(key)
      return inlines
    }
    for (const [groupIndex, group] of raw.groups.entries()) {
      if (group.family !== 'reading') continue
      const derivedGroup = source.groups.find(item => item.groupId === group.groupId)
      const derivedBlocks = new Map(sourceOrderedParagraphEntries(derivedGroup.content.blocks, '')
        .map(({ block }) => [block.nodeId, block]))
      for (const { block, path: blockPath } of sourceOrderedParagraphEntries(group.blocks, `/groups/${groupIndex}/blocks`)) {
        if (block.content.some(item => item.kind !== 'text')) continue
        const pointer = blockPath.replace(/\[(\d+)\]/gu, '/$1').replaceAll('.', '/')
        const derived = derivedBlocks.get(block.blockId)
        const inlines = apply(block.source, block.content.map((item, index) => ({
          text: item.text, pointer: `${pointer}/content/${index}/text`,
        })), derived.inlines, block.blockId, derivedGroup)
        if (inlines) derived.inlines = inlines
      }
      for (const [index, question] of group.questions.entries()) {
        const derived = derivedGroup.variant.questions[index]
        const inlines = apply(question.source, [{ text: question.stem,
          pointer: `/groups/${groupIndex}/questions/${index}/stem`,
        }], derived.stem, question.questionId, derivedGroup, true)
        if (inlines) derived.stem = inlines
      }
    }
    if (consumed.size !== marked.size) throw new Error('OCR source emphasis has an unmatched or unsupported target')
  } catch (error) {
    issues.push(adapterIssue('MATERIALIZATION_SOURCE_EMPHASIS_UNSUPPORTED', error.message, '$.ocrSourceBytes'))
  }
}

export function deriveNck1MaterializationBundle(rawInput, authorityRef = nck1MaterializationCandidateAuthorityRef) {
  const input = cloneNck1MaterializationInput(rawInput)
  const sourceDigest = bundleDigest(
    input.materializationBytes,
    input.documents,
    input.media,
    input.listeningAudio,
    input.spellingReviewBytes,
    input.ocrSourceBytes,
  )
  let materialization = parseMaterialization(input.materializationBytes)
  if (!materialization) {
    return {
      input,
      sourceDigest,
      materialization: null,
      source: null,
      request: null,
      issues: [adapterIssue('MATERIALIZATION_JSON_INVALID', 'NCK1 Source Materialization bytes are not readable JSON')],
    }
  }
  const validation = validateBundle(materialization, input)
  if ((materialization.schemaVersion === 'nck1-source-materialization-v4'
    || (input.ocrSourceBytes && parseMaterialization(input.ocrSourceBytes.confirmationBytes)?.schemaVersion === NCK1_OCR_CONFIRMATION_SCHEMA_VERSION_V3))
    && authorityRef.manifestVersion !== '62') {
    validation.issues.push(adapterIssue('MATERIALIZATION_AUTHORITY_UNSUPPORTED', 'Source presentation and OCR content visuals require the v62 closure'))
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
      const correctedIssues = validateNck1SourceMaterialization(materialization)
      if (correctedIssues.length) throw new Error(correctedIssues[0].message)
    } catch (error) {
      return { input, sourceDigest, materialization, source: null, request: null,
        issues: [adapterIssue('SPELLING_REVIEW_INVALID', error.message)] }
    }
  }
  const derivationIssues = []
  const source = deriveNck1SemanticSource(
    materialization,
    validation.documentsById,
    validation.mediaById,
    validation.instructionDocument,
    derivationIssues,
    { authorityRef },
  )
  if ([nck1MaterializationCandidateAuthorityRef, nck1MaterializationHistoricalAuthorityRef58,
    nck1MaterializationHistoricalAuthorityRef59, nck1MaterializationHistoricalAuthorityRef61]
    .some(ref => authorityRef.manifestDigest === ref.manifestDigest)) {
    appendReadingSourceEmphasis(source, rawMaterialization, validation.documentsById,
      input.spellingReviewBytes ? JSON.parse(new TextDecoder().decode(input.spellingReviewBytes)) : null,
      derivationIssues)
  }
  if (input.ocrSourceBytes) {
    if (![nck1MaterializationCandidateAuthorityRef, nck1MaterializationHistoricalAuthorityRef61]
      .some(ref => authorityRef.manifestDigest === ref.manifestDigest)) {
      derivationIssues.push(adapterIssue('MATERIALIZATION_SOURCE_EMPHASIS_UNSUPPORTED', 'Historical authorities do not accept OCR source emphasis'))
    } else {
      appendOcrReadingSourceEmphasis(source, rawMaterialization, validation.documentsById, input.ocrSourceBytes,
        input.spellingReviewBytes ? JSON.parse(textDecoder.decode(input.spellingReviewBytes)) : null, derivationIssues)
    }
  }
  if (derivationIssues.length > 0) {
    return {
      input,
      sourceDigest,
      materialization,
      source,
      request: null,
      issues: derivationIssues,
    }
  }
  return {
    input,
    sourceDigest,
    materialization,
    materializationDigest: digestNck1SourceMaterialization(materialization),
    source,
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
      + (derivation.input.ocrSourceBytes?.evidenceBytes.byteLength ?? 0)
      + (derivation.input.ocrSourceBytes?.confirmationBytes.byteLength ?? 0)
      + derivation.input.documents.reduce((total, entry) => total + entry.bytes.byteLength, 0)
      + derivation.input.media.reduce((total, entry) => total + entry.bytes.byteLength, 0),
    ...(derivation.input.spellingReviewBytes ? {
      spellingReview: { sha256: sha256(derivation.input.spellingReviewBytes), byteLength: derivation.input.spellingReviewBytes.byteLength },
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
