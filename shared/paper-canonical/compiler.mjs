import {
  canonicalAuthorityRef,
  nck1MaterializationCandidateAuthorityRef,
  resolveCanonicalAuthority,
  slotsForProfile,
  trustedDocxCandidateAuthorityRef,
  trustedLegacyHistoricalCandidateAuthorityRef,
  trustedLegacyCaptureCandidateAuthorityRef,
  paper2026IPrintSuccessorCandidateAuthorityRef,
  paper2026ISuccessorCandidateAuthorityRef,
  paper2026IOwnerQaContentSuccessorCandidateAuthorityRef,
  validateJsonSchema,
} from './authority.mjs'
import { validateApplicationWritingContract } from './applicationWriting.mjs'
import { validateContinuationWritingContract } from './continuationWriting.mjs'
import {
  validateGrammarFillPromptContract,
  validateGrammarFillPromptProvision,
} from './grammarFillPromptContract.mjs'
import { appendListeningInactiveClosures } from './listeningInactive.mjs'
import {
  collectListeningTargets,
  validateListeningContract,
} from './listening.mjs'
import {
  DOCX_MEDIA_TYPE,
  DOCX_PAIR_IDENTITY_MEDIA_TYPE,
  DOCX_PAIR_IDENTITY_SCHEMA_VERSION,
  DOCX_SOURCE_ENVELOPE_MEDIA_TYPE,
  deriveDocxCanonicalSource,
  deriveDocxPairCanonicalSource,
  inspectDocxEnvelopeSource,
  inspectDocxPairEnvelopeSource,
  isReservedNck1ExamPaperId,
} from '../../server/paper-canonical/docxSourceAdapter.mjs'
import {
  TICKET_26_LEGACY_CAPTURE_MEDIA_TYPE,
  TICKET_26_LEGACY_CAPTURE_INPUT_KIND,
  TICKET_26_LEGACY_SOURCE_ENVELOPE_MEDIA_TYPE,
  applyTicket26OwnerQaContentSuccessor,
  buildTicket26LegacyCompilerRequest,
  inspectTicket26LegacyEnvelopeSource,
  ticket26LegacyCompilerDocumentsMatch,
} from '../../server/paper-canonical/legacyTicket26SourceAdapter.mjs'
import {
  isRegisteredConfirmedCanonicalHistoricalReplayCapability,
} from '../../server/paper-canonical/registeredConfirmedCanonicalAdmission.mjs'
import {
  NCK1_MATERIALIZATION_INPUT_KIND,
  NCK1_MATERIALIZATION_CANDIDATE_SCHEMA_VERSION,
  cloneNck1MaterializationInput,
  deriveNck1MaterializationBundle,
  isNck1MaterializationInput,
  nck1MaterializationSourceSummary,
} from '../../server/paper-canonical/nck1MaterializationAdapter.mjs'
import { validateReadingContract } from './reading.mjs'
import {
  FRAMED_COLUMNS_CHILD_KINDS,
  FRAMED_COLUMNS_COLUMN_COUNT,
  FRAMED_COLUMNS_KIND,
  collectRichContentTargetValues,
  collectRichContentTargets,
  contentHasFramedColumns,
  forEachRichInline,
  framedColumnsHeadingBlock,
  isQuestionLikeRichBlock,
  readingCaptureHasUnregisteredBlock,
  someRichBlocks,
} from './richContent.mjs'
import { validateSevenChoicesContract } from './sevenChoices.mjs'
import { cloneJson, digestJson, exactKeys, isRecordValue, sha256, stableStringify, withoutKey } from './stable.mjs'

const trustedDocxCandidateCompile = Symbol('trustedDocxCandidateCompile')
const docxPairCandidateCompile = Symbol('docxPairCandidateCompile')
const nck1MaterializationCandidateCompile = Symbol('nck1MaterializationCandidateCompile')
const trustedLegacyCaptureCandidateCompile = Symbol('trustedLegacyCaptureCandidateCompile')
import { canonicalizeVisibleEnglishTypography } from './visibleTypography.mjs'
import { replayCanonicalVisibleTypography } from './visibleTypographyReplay.mjs'

const blockingPriority = ['answer_conflict', 'incomplete_source', 'unsupported', 'needs_review']

const trustedLegacyCaptureCandidateAuthorities = [
  trustedLegacyHistoricalCandidateAuthorityRef,
  trustedLegacyCaptureCandidateAuthorityRef,
  paper2026IPrintSuccessorCandidateAuthorityRef,
  paper2026ISuccessorCandidateAuthorityRef,
  paper2026IOwnerQaContentSuccessorCandidateAuthorityRef,
]
const paper2026ISuccessorSourceCaptureSha256 =
  'sha256:398b386bd2a1d343a96623232d81914b5d5fb6f8308d188761bd9f224f4a84cd'
const paper2026IOwnerQaContentSuccessorChoice =
  'paper-2026-i-owner-qa-content-successor-v1'
const trustedOwnerQaContentSuccessorCompile = Symbol(
  'trustedOwnerQaContentSuccessorCompile',
)

function sameAuthorityRef(left, right) {
  return Boolean(
    left
    && right
    && left.manifestId === right.manifestId
    && left.manifestVersion === right.manifestVersion
    && left.manifestDigest === right.manifestDigest,
  )
}

function trustedLegacyCaptureCandidateAuthorityFor(
  authority,
  { allowsHistoricalReplay = false } = {},
) {
  const candidates = allowsHistoricalReplay
    ? trustedLegacyCaptureCandidateAuthorities
    : [
      trustedLegacyCaptureCandidateAuthorityRef,
      paper2026IPrintSuccessorCandidateAuthorityRef,
      paper2026ISuccessorCandidateAuthorityRef,
      paper2026IOwnerQaContentSuccessorCandidateAuthorityRef,
    ]
  return candidates.find((candidate) =>
    sameAuthorityRef(authority, candidate)) || null
}

function legacySourceAdapterVersionForAuthority(
  authority,
  { allowsHistoricalReplay = false } = {},
) {
  return authority?.manifestVersion === '41' && allowsHistoricalReplay ? '3' : '4'
}

function diagnostic(code, disposition, path, message, sourceSpanRefs = []) {
  return { code, disposition, path, message, sourceSpanRefs }
}

function dispositionFor(diagnostics) {
  return blockingPriority.find((candidate) => diagnostics.some((item) => item.disposition === candidate)) || 'ready'
}

function asBytes(value) {
  return value instanceof Uint8Array ? value : null
}

function bytesToBase64(bytes) {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  return btoa(binary)
}

function stableId(prefix, value) {
  return `${prefix}:${digestJson(value).slice('sha256:'.length, 28)}`
}

function jsonObjectPropertyRange(bytes, propertyName) {
  const marker = new TextEncoder().encode(`"${propertyName}":`)
  let markerStart = -1
  for (let offset = 0; offset <= bytes.byteLength - marker.byteLength; offset++) {
    if (marker.every((value, index) => bytes[offset + index] === value)) {
      markerStart = offset
      break
    }
  }
  if (markerStart < 0) return null
  let start = markerStart + marker.byteLength
  while (start < bytes.byteLength && /\s/.test(String.fromCharCode(bytes[start]))) start++
  if (bytes[start] !== 0x7b) return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let offset = start; offset < bytes.byteLength; offset++) {
    const value = bytes[offset]
    if (inString) {
      if (escaped) escaped = false
      else if (value === 0x5c) escaped = true
      else if (value === 0x22) inString = false
      continue
    }
    if (value === 0x22) inString = true
    else if (value === 0x7b) depth++
    else if (value === 0x7d && --depth === 0) return { start, end: offset + 1 }
  }
  return null
}

function parseJsonDocument(document, diagnostics) {
  try {
    const value = JSON.parse(new TextDecoder().decode(document.bytes))
    return isRecordValue(value) ? value : null
  } catch (error) {
    diagnostics.push(diagnostic('SOURCE_DOCUMENT_UNREADABLE', 'incomplete_source', '$.evidence.documents', `JSON evidence is unreadable: ${error.message}`))
    return null
  }
}

function underscoreMarkerMatches(text) {
  return [...String(text || '').matchAll(/(_+)(\d+)(_+)/g)].map((marker) => ({
    raw: marker[0],
    number: Number(marker[2]),
    index: marker.index,
    leftWidth: marker[1].length,
    rightWidth: marker[3].length,
  }))
}

function localOrdinalMarkerMatches(text) {
  return [...String(text || '').matchAll(/\(([1-5])\)/g)].map((marker) => ({
    raw: marker[0],
    number: Number(marker[1]),
    index: marker.index,
    dialectId: 'source-local-parenthesized-ordinal-v1',
  }))
}

function referenceMarkerMatches(group, text) {
  if (group.groupType !== 'sevenChoices') {
    return [...String(text || '').matchAll(/__(\d+)__/g)].map((marker) => ({
      raw: marker[0],
      number: Number(marker[1]),
      index: marker.index,
    }))
  }
  const underscores = underscoreMarkerMatches(text)
  return underscores.length > 0 ? underscores : localOrdinalMarkerMatches(text)
}

function referenceContent(group) {
  const blankIdByNumber = new Map((group.blankIds || []).map((blankId) => [Number(blankId.match(/(\d+)$/)?.[1]), blankId]))
  return {
    blocks: (group.passage?.paragraphs || []).map((paragraph) => {
      const inlines = []
      let cursor = 0
      let textIndex = 0
      for (const marker of referenceMarkerMatches(group, paragraph.text)) {
        if (marker.index > cursor) {
          inlines.push({ kind: 'text', nodeId: `text:${paragraph.paragraphId}:${textIndex++}`, text: paragraph.text.slice(cursor, marker.index) })
        }
        const blankId = group.groupType === 'sevenChoices' && marker.dialectId === 'source-local-parenthesized-ordinal-v1'
          ? group.blankIds[marker.number - 1]
          : blankIdByNumber.get(marker.number)
        if (blankId) inlines.push({ kind: 'blank_ref', nodeId: `blank-ref:${paragraph.paragraphId}:${marker.number}`, blankId })
        else inlines.push({ kind: 'text', nodeId: `unresolved-marker:${paragraph.paragraphId}:${marker.number}`, text: marker.raw })
        cursor = marker.index + marker.raw.length
      }
      if (cursor < String(paragraph.text || '').length) {
        inlines.push({ kind: 'text', nodeId: `text:${paragraph.paragraphId}:${textIndex}`, text: paragraph.text.slice(cursor) })
      }
      return { kind: 'paragraph', nodeId: paragraph.paragraphId, inlines }
    }),
  }
}

function grammarFillPromptBindingsFromPaper({
  paper,
  paperEntry,
  promptEntry,
  documents,
  group,
  source,
  diagnostics,
  sourceEvidenceSchema,
  promptProvisionSchema,
  promptAdapterVersion,
}) {
  const evidence = promptEntry?.value
  const evidenceIssues = sourceEvidenceSchema
    ? validateJsonSchema(
        evidence,
        sourceEvidenceSchema,
        '$.evidence.grammarFillPromptSourceCapture',
      )
    : [{ code: 'SCHEMA_MISSING' }]
  const sourceBindingsValid = (
    evidence?.paperId === source.paperId
    && evidence?.sourceAssetVersion === source.sourceAssetVersion
    && evidence?.groupId === group.groupId
    && evidence?.review?.method === 'manual_source_review'
    && evidence?.review?.status === 'accepted'
    && evidence?.sources?.paperAsset?.sha256 === paperEntry.document.sha256
    && evidence?.sources?.questionPdf?.sha256
      && documents.some(
        (document) =>
          document.mediaType === 'application/pdf'
          && document.roles.includes('question_source')
          && document.sha256 === evidence.sources.questionPdf.sha256,
      )
  )
  const rows = Array.isArray(evidence?.rows) ? evidence.rows : []
  const promptProvisionIssues = rows.flatMap((row, index) =>
    validateGrammarFillPromptProvision(
      {
        blankId: row?.blankId,
        provision: row?.provision,
        ...(Object.hasOwn(row || {}, 'prompt') ? { prompt: row.prompt } : {}),
      },
      promptProvisionSchema,
      `$.evidence.grammarFillPromptSourceCapture.rows[${index}]`,
    ))
  if (
    evidenceIssues.length > 0
    || promptProvisionIssues.length > 0
    || !sourceBindingsValid
    || rows.length !== group.blankIds.length
    || rows.some(
      (row, index) =>
        row?.ordinal !== index + 1
        || row?.blankId !== group.blankIds[index]
        || row?.questionId !== group.questionIds[index],
    )
  ) {
    diagnostics.push(diagnostic(
      'GRAMMAR_FILL_PROMPT_SOURCE_CAPTURE_INVALID',
      'incomplete_source',
      '$.evidence.grammarFillPromptSourceCapture',
      'Grammar Fill prompt evidence must be complete, accepted, source-bound, and ordered',
    ))
  }
  return (group.blankIds || []).map((blankId) => {
    const blank = paper.content?.blanks?.[blankId]
    const row = rows.find((candidate) => candidate?.blankId === blankId)
    const span = promptEntry
      ? byteRangeForText(
          promptEntry.document.bytes,
          `"blankId":"${blankId}"`,
          0,
          promptEntry.document.bytes.byteLength,
        )
      : null
    const observationId =
      `observation:reference:grammar-fill:prompt:${blankId}`
    const provision = row?.provision
    const prompt = row?.prompt
    const paperAssetAgrees = (
      isRecordValue(blank)
      && (
        provision === 'source_prompt'
          ? Object.hasOwn(blank, 'prompt') && blank.prompt === prompt
          : provision === 'source_proven_none'
            && !Object.hasOwn(blank, 'prompt')
      )
    )
    if (!paperAssetAgrees || !span) {
      diagnostics.push(diagnostic(
        'GRAMMAR_FILL_PROMPT_EVIDENCE_INCOMPLETE',
        'incomplete_source',
        '$.evidence.grammarFillPromptSourceCapture.rows',
        `Grammar Fill Blank ${blankId} lacks accepted independent prompt-provision evidence`,
      ))
    } else {
      source.observations.push({
        observationId,
        kind: 'grammar_fill_prompt_provision',
        documentInputKey: promptEntry.document.inputKey,
        value: {
          blankId,
          provision,
          ...(provision === 'source_prompt' ? { prompt } : {}),
        },
        span,
        extraction: {
          adapterId: 'grammar-fill-prompt-evidence',
          version: promptAdapterVersion,
        },
      })
    }
    return {
      blankId,
      provision,
      ...(provision === 'source_prompt' ? { prompt } : {}),
      authorityObservationRef: observationId,
    }
  })
}

function byteRangeForText(bytes, text, start, end, after = start) {
  const target = new TextEncoder().encode(text)
  for (let offset = Math.max(start, after); offset <= end - target.byteLength; offset++) {
    if (target.every((value, index) => bytes[offset + index] === value)) return { start: offset, end: offset + target.byteLength }
  }
  return null
}

function inspectSevenChoicesGroup(paper, group, expectedNumbers, diagnostics) {
  const questions = (group.questionIds || []).map((questionId) => paper.content?.questions?.[questionId])
  if (group.questionIds?.length !== 5 || group.blankIds?.length !== 5 || questions.some((question) => !question)) {
    diagnostics.push(diagnostic('SEVEN_CHOICES_EVIDENCE_INCOMPLETE', 'incomplete_source', '$.evidence.paperAsset', 'Seven Choices requires five complete Question and Blank pairs'))
    return null
  }
  if (new Set(group.questionIds).size !== 5 || new Set(group.blankIds).size !== 5) {
    diagnostics.push(diagnostic('SEVEN_CHOICES_IDENTITY_AMBIGUOUS', 'needs_review', '$.evidence.paperAsset', 'Seven Choices Question and Blank identities are ambiguous'))
  }
  for (const [index, question] of questions.entries()) {
    if (question.questionId !== group.questionIds[index] || question.groupId !== group.groupId || question.blankId !== group.blankIds[index] || question.questionNo !== expectedNumbers[index]) {
      diagnostics.push(diagnostic('SEVEN_CHOICES_IDENTITY_AMBIGUOUS', 'needs_review', '$.evidence.paperAsset', 'Seven Choices source identities do not close against Plan order'))
    }
    if (Object.hasOwn(question, 'options')) {
      diagnostics.push(diagnostic('SEVEN_CHOICES_PER_QUESTION_OPTIONS_FORBIDDEN', 'needs_review', '$.evidence.paperAsset', 'Seven Choices cannot fall back to Question-owned Options'))
    }
  }
  const underscoreMarkers = (group.passage?.paragraphs || []).flatMap((paragraph) => underscoreMarkerMatches(paragraph.text).map((marker) => ({ paragraph, marker })))
  const ordinalMarkers = (group.passage?.paragraphs || []).flatMap((paragraph) => localOrdinalMarkerMatches(paragraph.text).map((marker) => ({ paragraph, marker })))
  const wrappers = new Set(underscoreMarkers.map(({ marker }) => `${marker.leftWidth}:${marker.rightWidth}`))
  const registeredUnderscore = underscoreMarkers.length > 0 && wrappers.size === 1 && ['2:2', '5:5'].includes([...wrappers][0])
  const registeredOrdinal = underscoreMarkers.length === 0
    && ordinalMarkers.length > 0
    && ordinalMarkers.every(({ marker }, index) => marker.number === index + 1)
  if (!registeredUnderscore && !registeredOrdinal) {
    diagnostics.push(diagnostic('SEVEN_CHOICES_DIALECT_UNSUPPORTED', 'unsupported', '$.evidence.paperAsset', 'Seven Choices marker dialect is not registered'))
    return null
  }
  const markers = registeredUnderscore ? underscoreMarkers : ordinalMarkers
  const dialectId = registeredOrdinal
    ? 'source-local-parenthesized-ordinal-v1'
    : markers[0].marker.leftWidth === 2
      ? 'plan-number-double-underscore-v1'
      : 'plan-number-five-underscore-v1'
  if (markers.length !== 5) {
    diagnostics.push(diagnostic(
      'SEVEN_CHOICES_MARKER_EVIDENCE_INCOMPLETE',
      markers.length < 5 ? 'incomplete_source' : 'needs_review',
      '$.evidence.paperAsset',
      'Seven Choices requires exactly five ordered source markers',
    ))
  }
  for (const [index, { paragraph, marker }] of markers.entries()) {
    const expectedMarkerNumber = registeredOrdinal ? index + 1 : questions[index]?.questionNo
    if (marker.number !== expectedMarkerNumber) {
      diagnostics.push(diagnostic('SEVEN_CHOICES_MARKER_IDENTITY_AMBIGUOUS', 'needs_review', '$.evidence.paperAsset', 'Source markers must match the five Plan-assigned Question identities'))
    }
    const suffix = paragraph.text.slice(marker.index + marker.raw.length)
    if (registeredUnderscore && /^\s*\([1-5]\)/u.test(suffix)) {
      diagnostics.push(diagnostic('SEVEN_CHOICES_STRAY_ORDINAL', 'needs_review', '$.evidence.paperAsset', 'Marker-adjacent local ordinals require explicit source review'))
    }
  }
  const options = group.optionBank
  if (!Array.isArray(options) || options.length < 7 || options.some((option) => typeof option?.text !== 'string' || option.text.length === 0)) {
    diagnostics.push(diagnostic('SEVEN_CHOICES_BANK_EVIDENCE_INCOMPLETE', 'incomplete_source', '$.evidence.paperAsset', 'Seven Choices requires one complete source-backed A-G bank'))
    return null
  }
  if (options.length !== 7 || options.map((option) => option.label).join('') !== 'ABCDEFG' || new Set(options.map((option) => option.label)).size !== 7) {
    diagnostics.push(diagnostic('SEVEN_CHOICES_BANK_IDENTITY_AMBIGUOUS', 'needs_review', '$.evidence.paperAsset', 'Seven Choices bank identity and A-G order must be exact'))
  }
  return { questions, markers, options, dialectId }
}

function referenceOptions(paper, group, diagnostics, familyId) {
  if (familyId === 'grammar-fill') return { ownership: 'none' }
  const sets = []
  for (const [index, questionId] of group.questionIds.entries()) {
    const question = paper.content?.questions?.[questionId]
    if (!question || question.blankId !== group.blankIds[index] || question.options?.map((option) => option.label).join('') !== 'ABCD' || question.options.some((option) => typeof option.text !== 'string')) {
      diagnostics.push(diagnostic('REFERENCE_CLOZE_OPTIONS_INVALID', 'needs_review', '$.evidence.paperAsset', `Cloze Question ${questionId} does not close one ordered A-D set`))
      continue
    }
    sets.push({
      questionId,
      options: question.options.map((option) => ({
        optionId: `option:${questionId}:${option.label}`,
        label: option.label,
        content: [{ kind: 'text', nodeId: `text:${questionId}:${option.label}`, text: option.text }],
      })),
    })
  }
  return { ownership: 'per_question', sets }
}

function readingContentTargetValues(content) {
  return collectRichContentTargetValues(content)
}

function visitVisibleTextNodes(value, visit, seen = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) visitVisibleTextNodes(item, visit, seen)
    return
  }
  if (!isRecordValue(value)) return
  if (
    value.kind === 'text'
    && typeof value.nodeId === 'string'
    && typeof value.text === 'string'
  ) {
    if (!seen.has(value.nodeId)) {
      seen.add(value.nodeId)
      visit(value)
    }
    return
  }
  for (const child of Object.values(value)) {
    visitVisibleTextNodes(child, visit, seen)
  }
}

function appendVisibleTypographyTransformations(source, diagnostics) {
  let transformationSequence = Math.max(
    0,
    ...(source.transformations || []).map((record) => record.sequence || 0),
  )
  const observationById = new Map(
    (source.observations || []).map((observation) => [
      observation.observationId,
      observation,
    ]),
  )
  const registeredRecordIds = new Set(
    (source.transformations || []).map((record) => record.recordId),
  )
  for (const group of source.groups || []) {
    visitVisibleTextNodes(
      { content: group.content, variant: group.variant },
      (inline) => {
        const before = inline.text
        const after = canonicalizeVisibleEnglishTypography(before)
        if (after === before) return
        const targetKey = `content_node:${inline.nodeId}`
        const baseSourceSpanId =
          group.sourceSpanRefsByTarget?.[targetKey]?.[0]
          || group.sourceSpanId
        const baseObservationId = baseSourceSpanId?.startsWith('source-span:')
          ? baseSourceSpanId.slice('source-span:'.length)
          : null
        const baseObservation = observationById.get(baseObservationId)
        if (!baseObservation) {
          diagnostics.push(diagnostic(
            'VISIBLE_TYPOGRAPHY_SOURCE_UNRESOLVED',
            'incomplete_source',
            `$.groups.${group.groupId}.${targetKey}`,
            'Visible typography cleanup requires one exact immutable source span',
          ))
          return
        }
        const observationId =
          `observation:visible-typography:${group.groupId}:${inline.nodeId}`
        const visibleSourceSpanId = `source-span:${observationId}`
        const recordId =
          `record:visible-typography:${group.groupId}:${inline.nodeId}`
        if (
          observationById.has(observationId)
          || registeredRecordIds.has(recordId)
        ) {
          diagnostics.push(diagnostic(
            'VISIBLE_TYPOGRAPHY_IDENTITY_DUPLICATE',
            'needs_review',
            `$.groups.${group.groupId}.${targetKey}`,
            'Visible typography cleanup identities must be unique',
          ))
          return
        }
        const observationValue = { nodeId: inline.nodeId, text: before }
        const observation = {
          observationId,
          kind: 'canonical_visible_typography_source',
          documentInputKey: baseObservation.documentInputKey,
          value: observationValue,
          span: cloneJson(baseObservation.span),
        }
        source.observations.push(observation)
        observationById.set(observationId, observation)
        const record = {
          recordId,
          sequence: ++transformationSequence,
          ruleId: 'canonical-visible-typography',
          ruleVersion: '2',
          target: {
            identity: inline.nodeId,
            path: 'content.text',
          },
          operation: 'canonical_visible_typography',
          inputSourceSpanIds: [visibleSourceSpanId],
          before,
          after,
          certainty: 'exact',
          preconditions: {
            sourceObservationIds: [observationId],
            sourceValueDigests: [digestJson(observationValue)],
          },
          outputDigest: digestJson(after),
        }
        source.transformations = [...(source.transformations || []), record]
        registeredRecordIds.add(recordId)
        group.sourceSpanRefsByTarget = {
          ...(group.sourceSpanRefsByTarget || {}),
          [targetKey]: [
            ...new Set([
              ...(group.sourceSpanRefsByTarget?.[targetKey] || []),
              visibleSourceSpanId,
            ]),
          ],
        }
        group.transformationRecordIdsByTarget = {
          ...(group.transformationRecordIdsByTarget || {}),
          [targetKey]: [
            ...new Set([
              ...(group.transformationRecordIdsByTarget?.[targetKey] || []),
              recordId,
            ]),
          ],
        }
        inline.text = after
      },
    )
  }
}

function validNormalizedRegion(region) {
  return isRecordValue(region)
    && exactKeys(region, ['x', 'y', 'width', 'height'])
    && ['x', 'y', 'width', 'height'].every((key) => typeof region[key] === 'number' && Number.isFinite(region[key]))
    && region.x >= 0
    && region.y >= 0
    && region.width > 0
    && region.height > 0
    && region.x + region.width <= 1
    && region.y + region.height <= 1
}

function appendReadingReferenceGroups({
  source,
  paper,
  answerKey,
  paperEntry,
  answerEntry,
  readingEntry,
  documents,
  activeProfile,
  diagnostics,
}) {
  const readingSlots = slotsForProfile(activeProfile).filter((slot) => slot.familyContractRef?.id === 'reading')
  const missingSlots = readingSlots.filter((slot) => !source.groups.some((candidate) => candidate.slotId === slot.slotId))
  if (missingSlots.length === 0) return
  if (!readingEntry) {
    diagnostics.push(diagnostic('READING_STRUCTURE_EVIDENCE_INCOMPLETE', 'incomplete_source', '$.evidence.documents', 'Reading cannot compile from the flattened marker or placeholder bridge alone'))
    return
  }
  const readingCapture = readingEntry.value
  const sourceDocument = documents.find((document) => document.sha256 === readingCapture?.sourceDocumentDigest)
  if (
    !isRecordValue(readingCapture)
    || !exactKeys(readingCapture, ['schemaVersion', 'paperId', 'sourceDocumentDigest', 'groups'])
    || readingCapture.schemaVersion !== 'reading-source-capture-v1'
    || readingCapture.paperId !== source.paperId
    || !sourceDocument
    || sourceDocument.mediaType !== 'application/pdf'
    || !isRecordValue(readingCapture.groups)
  ) {
    diagnostics.push(diagnostic('READING_SOURCE_CAPTURE_INVALID', 'incomplete_source', '$.evidence.documents', 'Reading structured capture must bind one immutable source document digest'))
    return
  }
  const captureEntries = Object.entries(readingCapture.groups)
  const capturedSlots = captureEntries.map(([, group]) => group?.slotId)
  const missingSlotIds = new Set(missingSlots.map((slot) => slot.slotId))
  if (
    captureEntries.length !== missingSlots.length
    || new Set(capturedSlots).size !== capturedSlots.length
    || captureEntries.some(([groupId, group]) => group?.groupId !== groupId || !missingSlotIds.has(group?.slotId))
  ) {
    diagnostics.push(diagnostic('READING_SOURCE_CAPTURE_AMBIGUOUS', 'needs_review', '$.evidence.readingCapture.groups', 'Reading structured capture keys and missing Profile slots must close exactly once'))
    return
  }
  const capturedBySlot = new Map(captureEntries.map(([, group]) => [group.slotId, group]))
  let sequence = Math.max(0, ...(source.transformations || []).map((record) => record.sequence || 0))
  for (const slot of missingSlots) {
    const captured = capturedBySlot.get(slot.slotId)
    const group = captured && paper.content?.groups?.[captured.groupId]
    const groupRange = captured ? jsonObjectPropertyRange(readingEntry.document.bytes, captured.groupId) : null
    if (
      !isRecordValue(captured)
      || !exactKeys(captured, ['groupId', 'slotId', 'sourcePage', 'visualProofDigest', 'content', 'passageBlockRoles', 'sourceObservations'])
      || captured.slotId !== slot.slotId
      || !Number.isInteger(captured.sourcePage)
      || captured.sourcePage < 1
      || (captured.visualProofDigest !== null && !documents.some((document) => document.sha256 === captured.visualProofDigest && document.mediaType.startsWith('image/')))
      || !groupRange
      || group?.groupType !== 'reading'
      || !Array.isArray(group.questionIds)
      || !questionCardinalityMatches(slot.questionCardinality, group.questionIds.length)
    ) {
      diagnostics.push(diagnostic('READING_GROUP_EVIDENCE_INCOMPLETE', 'incomplete_source', '$.evidence.readingCapture', `Reading slot ${slot.slotId} lacks one exact structured source Group`))
      continue
    }
    const targetValues = readingContentTargetValues(captured.content)
    const expectedTargets = targetValues.targets
    const observedTargets = new Map()
    let observationShapeInvalid = false
    for (const [index, observation] of (captured.sourceObservations || []).entries()) {
      const targetKey = `${observation?.target?.kind}:${observation?.target?.id}`
      if (
        !isRecordValue(observation)
        || !exactKeys(observation, ['target', 'page', 'region', 'review', 'value'])
        || !isRecordValue(observation.target)
        || !exactKeys(observation.target, ['kind', 'id'])
        || observation.target.kind !== 'content_node'
        || typeof observation.target.id !== 'string'
        || !Number.isInteger(observation.page)
        || observation.page < 1
        || !validNormalizedRegion(observation.region)
        || !isRecordValue(observation.review)
        || !exactKeys(observation.review, ['method', 'status'])
        || observation.review.method !== 'manual_transcription'
        || observation.review.status !== 'accepted'
        || observedTargets.has(targetKey)
      ) {
        observationShapeInvalid = true
        continue
      }
      observedTargets.set(targetKey, observation)
    }
    if (readingCaptureHasUnregisteredBlock(captured.content?.blocks)) {
      diagnostics.push(diagnostic('RICH_BLOCK_UNSUPPORTED', 'unsupported', '$.evidence.readingCapture', `Reading slot ${slot.slotId} contains an unregistered rich-content block`))
      continue
    }
    if (stableStringify(captured.content).match(/\[(?:表|图)\s*:/u)) {
      diagnostics.push(diagnostic('READING_FLATTENED_BRIDGE_FORBIDDEN', 'incomplete_source', '$.evidence.readingCapture', `Reading slot ${slot.slotId} cannot replace structured content with a flattened marker or placeholder`))
      continue
    }
    if (targetValues.duplicate) {
      diagnostics.push(diagnostic('READING_IDENTITY_DUPLICATE', 'needs_review', '$.evidence.readingCapture', `Reading slot ${slot.slotId} repeats a rich-content semantic identity`))
      continue
    }
    if (observationShapeInvalid) {
      diagnostics.push(diagnostic('READING_SOURCE_TRANSCRIPTION_COVERAGE_AMBIGUOUS', 'needs_review', '$.evidence.readingCapture', `Reading slot ${slot.slotId} needs one reviewed PDF page/region observation per rich-content identity`))
      continue
    }
    if (observedTargets.size !== expectedTargets.size) {
      const tableIncomplete = someRichBlocks(captured.content?.blocks, (block) => block?.kind === 'table' && (
        !Array.isArray(block.rows)
        || block.rows.length === 0
        || block.rows.some((row) => !Array.isArray(row?.cells) || row.cells.reduce((total, cell) => total + (Number.isInteger(cell?.columnSpan) ? cell.columnSpan : 0), 0) < block.columnCount)
      ))
      diagnostics.push(diagnostic(
        tableIncomplete ? 'READING_TABLE_INCOMPLETE' : 'READING_SOURCE_TRANSCRIPTION_INCOMPLETE',
        'incomplete_source',
        '$.evidence.readingCapture',
        `Reading slot ${slot.slotId} has missing content or reviewed PDF transcription observations`,
      ))
      continue
    }
    if (
      [...expectedTargets.keys()].some((targetKey) => !observedTargets.has(targetKey))
      || [...observedTargets.keys()].some((targetKey) => !expectedTargets.has(targetKey))
    ) {
      diagnostics.push(diagnostic('READING_SOURCE_TRANSCRIPTION_COVERAGE_AMBIGUOUS', 'needs_review', '$.evidence.readingCapture', `Reading slot ${slot.slotId} has conflicting semantic identities in its reviewed PDF transcription`))
      continue
    }
    if ([...expectedTargets].some(([targetKey, value]) => stableStringify(observedTargets.get(targetKey).value) !== stableStringify(value))) {
      diagnostics.push(diagnostic('READING_SOURCE_TRANSCRIPTION_MISMATCH', 'incomplete_source', '$.evidence.readingCapture', `Reading slot ${slot.slotId} disagrees with its reviewed PDF transcription evidence`))
      continue
    }
    const observationId = `observation:reference:reading:${captured.groupId}`
    const sourceSpanId = `source-span:${observationId}`
    source.observations.push({
      observationId,
      kind: 'reading_structured_group',
      documentInputKey: readingEntry.document.inputKey,
      value: captured,
      span: groupRange,
    })
    const questions = []
    const sets = []
    const sourceSpanRefsByTarget = {}
    const transformationRecordIdsByTarget = {}
    for (const [targetKey, observation] of observedTargets) {
      const targetId = observation.target.id
      const targetObservationId = `observation:reference:reading:${captured.groupId}:${targetId}`
      const targetSourceSpanId = `source-span:${targetObservationId}`
      const recordId = `record:reference:reading:${captured.groupId}:${targetId}`
      source.observations.push({
        observationId: targetObservationId,
        kind: 'reading_reviewed_manual_transcription',
        documentInputKey: sourceDocument.inputKey,
        value: observation.value,
        span: {
          kind: 'page_region',
          page: observation.page,
          region: observation.region,
        },
      })
      source.transformations = [...(source.transformations || []), {
        recordId,
        sequence: ++sequence,
        ruleId: 'direct-projection',
        ruleVersion: '2',
        target: { identity: targetId, path: targetKey },
        operation: 'direct_projection',
        inputSourceSpanIds: [targetSourceSpanId],
        before: observation.value,
        after: observation.value,
        certainty: 'exact',
        preconditions: {
          sourceObservationIds: [targetObservationId],
          sourceValueDigests: [digestJson(observation.value)],
        },
        outputDigest: digestJson(observation.value),
      }]
      sourceSpanRefsByTarget[targetKey] = [targetSourceSpanId]
      transformationRecordIdsByTarget[targetKey] = [recordId]
    }
    for (const [questionIndex, questionId] of group.questionIds.entries()) {
      const question = paper.content?.questions?.[questionId]
      const answer = answerKey.answers?.[questionId]
      const questionRange = jsonObjectPropertyRange(paperEntry.document.bytes, questionId)
      const answerRange = jsonObjectPropertyRange(answerEntry.document.bytes, questionId)
      if (
        !question
        || question.groupId !== captured.groupId
        || !questionRange
        || !answer
        || !answerRange
        || question.options?.map((option) => option.label).join('') !== 'ABCD'
        || question.options.some((option) => typeof option.text !== 'string' || option.text.length === 0)
      ) {
        diagnostics.push(diagnostic('READING_QUESTION_EVIDENCE_INCOMPLETE', 'incomplete_source', '$.evidence.documents', `Reading Question ${questionId} lacks exact stem, A-D Options, or official answer evidence`))
        continue
      }
      if (
        question.questionId !== questionId
        || (
          slot.numberingRule.kind === 'range'
          && question.questionNo !== slot.numberingRule.start + questionIndex
        )
      ) {
        diagnostics.push(diagnostic('READING_QUESTION_IDENTITY_AMBIGUOUS', 'needs_review', '$.evidence.documents', `Reading Question ${questionId} disagrees with Profile numbering identity`))
      }
      const optionId = (label) => `option:${questionId}:${label}`
      questions.push({
        questionId,
        stem: [{ kind: 'text', nodeId: `text:${questionId}:stem`, text: question.stem }],
        correctOptionId: optionId(answer.answer),
      })
      sets.push({
        questionId,
        options: question.options.map((option) => ({
          optionId: optionId(option.label),
          label: option.label,
          content: [{ kind: 'text', nodeId: `text:${questionId}:option:${option.label}`, text: option.text }],
        })),
      })
      const questionObservationId = `observation:reference-question:${questionId}`
      const answerObservationId = `observation:reference-answer:${questionId}`
      source.observations.push(
        {
          observationId: questionObservationId,
          kind: 'reading_question',
          documentInputKey: paperEntry.document.inputKey,
          value: question,
          span: questionRange,
        },
        {
          observationId: answerObservationId,
          kind: 'official_answer',
          documentInputKey: answerEntry.document.inputKey,
          value: answer,
          span: answerRange,
        },
      )
      source.assertions.push({
        assertionId: `answer:${questionId}`,
        questionId,
        answer: answer.answer,
        authority: 'official',
        sourceSpanId: `source-span:${answerObservationId}`,
      })
      const questionSpans = [
        `source-span:${questionObservationId}`,
        `source-span:${answerObservationId}`,
      ]
      sourceSpanRefsByTarget[`question:${questionId}`] = questionSpans
      sourceSpanRefsByTarget[`content_node:text:${questionId}:stem`] = [`source-span:${questionObservationId}`]
      for (const option of question.options) {
        sourceSpanRefsByTarget[`option:${optionId(option.label)}`] = [`source-span:${questionObservationId}`]
        sourceSpanRefsByTarget[`content_node:text:${questionId}:option:${option.label}`] = [`source-span:${questionObservationId}`]
      }
    }
    source.groups.push({
      groupId: captured.groupId,
      slotId: captured.slotId,
      family: 'reading',
      questionIds: [...group.questionIds],
      blankIds: [],
      sourceSpanId,
      content: cloneJson(captured.content),
      media: [],
      variant: {
        family: 'reading',
        passageBlockRoles: cloneJson(captured.passageBlockRoles),
        questions,
        choiceOwnership: { ownership: 'per_question', sets },
      },
      sourceSpanRefsByTarget,
      transformationRecordIdsByTarget,
    })
  }
}

function appendApplicationWritingReferenceGroup({
  source,
  applicationEntry,
  transcriptionEntry,
  provenanceEntries,
  documents,
  diagnostics,
}) {
  if (source.groups.some((candidate) => candidate.slotId === 'writing.application')) return
  if (!applicationEntry) {
    diagnostics.push(diagnostic('APPLICATION_SOURCE_CAPTURE_INCOMPLETE', 'incomplete_source', '$.evidence.documents', 'Application Writing requires one reviewed structured source capture'))
    return
  }
  const closure = resolveCanonicalAuthority(canonicalAuthorityRef).closure
  const capture = applicationEntry.value
  const schemaIssues = validateJsonSchema(capture, closure.schemas['application-writing-source-capture-v1'], '$.evidence.applicationWritingCapture')
  if (schemaIssues.length > 0) {
    diagnostics.push(...schemaIssues.map((item) => diagnostic('APPLICATION_SOURCE_CAPTURE_INVALID', 'incomplete_source', item.path, item.message)))
    return
  }
  const provenanceMatches = provenanceEntries.filter((entry) => (
    entry.value?.schemaVersion === 'import-meta-v1'
    && entry.value?.paperId === capture.paperId
    && `sha256:${entry.value?.sourceFileSha256}` === capture.sourceDocumentDigest
  ))
  const capturedSourceMatches = documents.filter((document) => document.sha256 === capture.sourceDocumentDigest)
  if (
    capture.paperId !== source.paperId
    || provenanceMatches.length !== 1
    || capturedSourceMatches.length !== 1
    || capture.group.groupId.length === 0
  ) {
    diagnostics.push(diagnostic('APPLICATION_SOURCE_PROVENANCE_INVALID', 'incomplete_source', '$.evidence.applicationWritingCapture', 'Application Writing capture must bind one paper and one immutable source digest'))
    return
  }
  const transcription = transcriptionEntry?.value
  const transcriptionIssues = validateJsonSchema(
    transcription,
    closure.schemas['application-writing-source-transcription-v1'],
    '$.evidence.applicationWritingTranscription',
  )
  if (
    !transcriptionEntry
    || transcriptionIssues.length > 0
    || transcriptionEntry.document.sha256 !== capture.group.sourceLocation?.transcriptionDigest
    || transcription?.paperId !== capture.paperId
    || transcription?.sourceDocumentDigest !== capture.sourceDocumentDigest
    || transcription?.groupId !== capture.group.groupId
  ) {
    diagnostics.push(diagnostic('APPLICATION_SOURCE_TRANSCRIPTION_INVALID', 'incomplete_source', '$.evidence.applicationWritingTranscription', 'Application Writing requires one reviewed transcription bound to the immutable source document and captured Group'))
    return
  }
  const capturedBlocks = (capture.group.content?.blocks || []).map((block) => ({
    blockId: block.nodeId,
    text: (block.inlines || []).map((inline) => inline.text || '').join(''),
  }))
  const capturedGiven = capture.group.variant?.givenSkeleton
  const capturedPartBlockIds = capturedGiven?.presence === 'provided'
    ? capturedGiven.parts.map((part) => part.blockRef)
    : []
  if (
    digestJson(capturedBlocks) !== digestJson(transcription.orderedBlocks)
    || capturedGiven?.presence !== transcription.answerRegion.presence
    || capture.group.variant?.response?.answerRegionRef !== transcription.answerRegion.answerRegionRef
    || digestJson(capturedPartBlockIds) !== digestJson(transcription.answerRegion.partBlockIds)
  ) {
    diagnostics.push(diagnostic('APPLICATION_SOURCE_TRANSCRIPTION_CONFLICT', 'needs_review', '$.evidence.applicationWritingCapture.group', 'Application Writing capture conflicts with the reviewed source transcription'))
    return
  }
  const variantIssues = validateJsonSchema(
    capture.group.variant,
    closure.schemas['canonical-application-writing-variant-v1'],
    '$.evidence.applicationWritingCapture.group.variant',
  )
  if (variantIssues.length > 0) {
    diagnostics.push(...variantIssues.map((item) => diagnostic('APPLICATION_SOURCE_VARIANT_INVALID', 'incomplete_source', item.path, item.message)))
    return
  }
  const observationIds = new Set()
  const sourceObservationId = `observation:application-source:${capture.group.groupId}`
  const sourceSpanId = `source-span:${sourceObservationId}`
  source.observations.push({
    observationId: sourceObservationId,
    kind: 'application_source_group',
    documentInputKey: applicationEntry.document.inputKey,
    value: {
      groupId: capture.group.groupId,
      sourceDocumentDigest: capture.sourceDocumentDigest,
      sourceLocation: capture.group.sourceLocation,
      review: capture.review,
    },
    span: { start: 0, end: applicationEntry.document.byteLength },
  })
  for (const observation of capture.group.observations) {
    if (
      !isRecordValue(observation)
      || !exactKeys(observation, ['observationId', 'kind', 'value'])
      || typeof observation.observationId !== 'string'
      || typeof observation.kind !== 'string'
      || !isRecordValue(observation.value)
      || observationIds.has(observation.observationId)
    ) {
      diagnostics.push(diagnostic('APPLICATION_SOURCE_OBSERVATION_INVALID', 'needs_review', '$.evidence.applicationWritingCapture.group.observations', 'Reviewed Application observations require unique closed identities'))
      continue
    }
    observationIds.add(observation.observationId)
    source.observations.push({
      observationId: observation.observationId,
      kind: observation.kind,
      documentInputKey: applicationEntry.document.inputKey,
      value: cloneJson(observation.value),
      span: { start: 0, end: applicationEntry.document.byteLength },
    })
  }
  if (diagnostics.some((item) => item.code === 'APPLICATION_SOURCE_OBSERVATION_INVALID')) return
  source.groups.push({
    groupId: capture.group.groupId,
    slotId: capture.group.slotId,
    family: 'application-writing',
    questionIds: [],
    blankIds: [],
    sourceSpanId,
    content: cloneJson(capture.group.content),
    media: [],
    variant: cloneJson(capture.group.variant),
  })
}

function appendContinuationWritingReferenceGroup({
  source,
  continuationEntry,
  transcriptionEntry,
  provenanceEntries,
  documents,
  diagnostics,
}) {
  if (source.groups.some((candidate) => candidate.slotId === 'writing.continuation')) return
  if (!continuationEntry) {
    diagnostics.push(diagnostic('CONTINUATION_SOURCE_CAPTURE_INCOMPLETE', 'incomplete_source', '$.evidence.documents', 'Continuation Writing requires one reviewed structured source capture'))
    return
  }
  const closure = resolveCanonicalAuthority(canonicalAuthorityRef).closure
  const continuationFamily = closure.families.get('continuation-writing')
  const captureSchemaId = continuationFamily?.sourceEvidenceSchemaId
  const transcriptionSchemaId =
    continuationFamily?.sourceTranscriptionSchemaId
  const capture = continuationEntry.value
  const schemaIssues = validateJsonSchema(
    capture,
    closure.schemas[captureSchemaId],
    '$.evidence.continuationWritingCapture',
  )
  if (schemaIssues.length > 0) {
    diagnostics.push(...schemaIssues.map((item) => diagnostic('CONTINUATION_SOURCE_CAPTURE_INVALID', 'incomplete_source', item.path, item.message)))
    return
  }
  const provenanceMatches = provenanceEntries.filter((entry) => (
    entry.value?.schemaVersion === 'import-meta-v1'
    && entry.value?.paperId === capture.paperId
    && `sha256:${entry.value?.sourceFileSha256}` === capture.sourceDocumentDigest
  ))
  const capturedSourceMatches = documents.filter((document) => document.sha256 === capture.sourceDocumentDigest)
  const capturedSource = capturedSourceMatches[0]
  const sourceLocation = capture.group.sourceLocation
  const sourceInspection = sourceLocation?.sourceInspection
  const starterProvision = capture.group.variant?.starterProvision
  const capturedStarterDigests = (starterProvision?.starters || []).map((starter) => {
    const block = capture.group.content?.blocks?.find((candidate) => candidate.nodeId === starter.contentRef)
    return block ? digestJson((block.inlines || []).map((inline) => inline.text || '').join('')) : null
  })
  const twoStarterLocation = (
    starterProvision?.kind === 'ordered_source_starters'
    && capturedSource?.mediaType === 'application/pdf'
    && isRecordValue(sourceLocation)
    && exactKeys(sourceLocation, ['kind', 'page', 'region', 'sourceInspection', 'transcriptionDigest'])
    && sourceLocation.kind === 'pdf_page_region'
    && Number.isInteger(sourceLocation.page)
    && sourceLocation.page > 0
    && isRecordValue(sourceLocation.region)
    && exactKeys(sourceLocation.region, ['x', 'y', 'width', 'height'])
    && isRecordValue(sourceInspection)
    && exactKeys(sourceInspection, ['method', 'starterTextDigests', 'occurrenceCounts'])
    && sourceInspection.method === 'normalized_page_text'
    && Array.isArray(sourceInspection.starterTextDigests)
    && sourceInspection.starterTextDigests.length === 2
    && Array.isArray(sourceInspection.occurrenceCounts)
    && sourceInspection.occurrenceCounts.length === 2
    && sourceInspection.occurrenceCounts.every((count) => count === 1)
  )
  const plotLedLocation = (
    starterProvision?.kind === 'source_proven_none'
    && capturedSource?.mediaType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    && isRecordValue(sourceLocation)
    && exactKeys(sourceLocation, ['kind', 'sourceInspection', 'transcriptionDigest'])
    && sourceLocation.kind === 'docx_wml_inventory'
    && isRecordValue(sourceInspection)
    && exactKeys(sourceInspection, ['method', 'plotLedInstructionCount', 'paragraphOneLabelCount', 'paragraphTwoLabelCount', 'answerRegionClosure'])
    && sourceInspection.method === 'wml_read_only'
    && sourceInspection.plotLedInstructionCount === 1
    && sourceInspection.paragraphOneLabelCount === 0
    && sourceInspection.paragraphTwoLabelCount === 0
    && sourceInspection.answerRegionClosure === 'closed'
  )
  if (
    capture.paperId !== source.paperId
    || capture.profileId !== source.profileId
    || provenanceMatches.length !== 1
    || capturedSourceMatches.length !== 1
    || capture.group.groupId.length === 0
  ) {
    diagnostics.push(diagnostic('CONTINUATION_SOURCE_PROVENANCE_INVALID', 'incomplete_source', '$.evidence.continuationWritingCapture', 'Continuation Writing capture must bind one paper, Profile, and immutable source digest'))
    return
  }
  if (!twoStarterLocation && !plotLedLocation) {
    diagnostics.push(diagnostic('CONTINUATION_SOURCE_LOCATION_INVALID', 'incomplete_source', '$.evidence.continuationWritingCapture.group.sourceLocation', 'Continuation starter semantics require reviewed PDF page-text or DOCX WML source closure'))
    return
  }
  const transcription = transcriptionEntry?.value
  const transcriptionIssues = validateJsonSchema(
    transcription,
    closure.schemas[transcriptionSchemaId],
    '$.evidence.continuationWritingTranscription',
  )
  if (
    !transcriptionEntry
    || transcriptionIssues.length > 0
    || transcriptionEntry.document.sha256 !== capture.group.sourceLocation?.transcriptionDigest
    || transcription?.paperId !== capture.paperId
    || transcription?.sourceDocumentDigest !== capture.sourceDocumentDigest
    || transcription?.groupId !== capture.group.groupId
  ) {
    diagnostics.push(diagnostic('CONTINUATION_SOURCE_TRANSCRIPTION_INVALID', 'incomplete_source', '$.evidence.continuationWritingTranscription', 'Continuation Writing requires one reviewed transcription bound to the immutable source document and captured Group'))
    return
  }
  if (continuationFamily?.version === '3') {
    const expectedPreservedDistinctions = [
      'punctuation_code_points',
      'punctuation_adjacent_spacing',
      'apostrophe_code_points',
      'word_presence',
    ]
    const validLineage = (lineage, predecessorSchemaVersion) => (
      isRecordValue(lineage)
      && exactKeys(lineage, [
        'kind',
        'predecessor',
        'sourceTextNormalization',
        'preservedDistinctions',
      ])
      && lineage.kind === 'immutable_source_fidelity_successor'
      && lineage.sourceTextNormalization
        === 'unicode_nfc_ascii_whitespace_collapse_v1'
      && digestJson(lineage.preservedDistinctions)
        === digestJson(expectedPreservedDistinctions)
      && isRecordValue(lineage.predecessor)
      && exactKeys(lineage.predecessor, ['schemaVersion', 'sha256'])
      && lineage.predecessor.schemaVersion === predecessorSchemaVersion
      && /^sha256:[a-f0-9]{64}$/.test(lineage.predecessor.sha256)
    )
    if (
      !validLineage(
        capture.lineage,
        'continuation-writing-source-capture-v1',
      )
      || !validLineage(
        transcription.lineage,
        'continuation-writing-source-transcription-v1',
      )
    ) {
      diagnostics.push(diagnostic(
        'CONTINUATION_SOURCE_SUCCESSOR_LINEAGE_INVALID',
        'incomplete_source',
        '$.evidence.continuationWritingCapture.lineage',
        'Continuation Writing v3 requires explicit immutable predecessor and punctuation-preserving source-text lineage',
      ))
      return
    }
  }
  const capturedBlocks = (capture.group.content?.blocks || []).map((block) => ({
    blockId: block.nodeId,
    textDigest: digestJson((block.inlines || []).map((inline) => inline.text || '').join('')),
  }))
  const capturedProvision = capture.group.variant?.starterProvision
  const capturedTranscriptionProvision = capturedProvision?.kind === 'ordered_source_starters'
    ? { kind: capturedProvision.kind, contentRefs: capturedProvision.starters.map((starter) => starter.contentRef) }
    : { kind: capturedProvision?.kind }
  if (
    digestJson(capturedBlocks) !== digestJson(transcription.orderedBlocks)
    || digestJson(capture.group.variant?.materialBlockRefs) !== digestJson(transcription.materialBlockRefs)
    || digestJson(capturedTranscriptionProvision) !== digestJson(transcription.starterProvision)
    || capture.group.variant?.response?.answerRegionRef !== transcription.answerRegionRef
  ) {
    diagnostics.push(diagnostic('CONTINUATION_SOURCE_TRANSCRIPTION_CONFLICT', 'needs_review', '$.evidence.continuationWritingCapture.group', 'Continuation Writing capture conflicts with the reviewed source transcription'))
    return
  }
  if (
    starterProvision?.kind === 'ordered_source_starters'
    && starterProvision.starters.length === 2
    && stableStringify(sourceInspection.starterTextDigests) !== stableStringify(capturedStarterDigests)
  ) {
    diagnostics.push(diagnostic('CONTINUATION_SOURCE_LOCATION_INVALID', 'incomplete_source', '$.evidence.continuationWritingCapture.group.sourceLocation', 'The two captured starter texts must match the independently reviewed source-page proof'))
    return
  }
  const variantIssues = validateJsonSchema(
    capture.group.variant,
    closure.schemas['canonical-continuation-writing-variant-v1'],
    '$.evidence.continuationWritingCapture.group.variant',
  )
  if (variantIssues.length > 0) {
    diagnostics.push(...variantIssues.map((item) => diagnostic('CONTINUATION_SOURCE_VARIANT_INVALID', 'incomplete_source', item.path, item.message)))
    return
  }
  const observationIds = new Set()
  const sourceObservationId = `observation:continuation-source:${capture.group.groupId}`
  const sourceSpanId = `source-span:${sourceObservationId}`
  source.observations.push({
    observationId: sourceObservationId,
    kind: 'continuation_source_group',
    documentInputKey: continuationEntry.document.inputKey,
    value: {
      groupId: capture.group.groupId,
      sourceDocumentDigest: capture.sourceDocumentDigest,
      sourceLocation: capture.group.sourceLocation,
      review: capture.review,
    },
    span: { start: 0, end: continuationEntry.document.byteLength },
  })
  for (const observation of capture.group.observations) {
    if (
      !isRecordValue(observation)
      || !exactKeys(observation, ['observationId', 'kind', 'value'])
      || typeof observation.observationId !== 'string'
      || typeof observation.kind !== 'string'
      || !isRecordValue(observation.value)
      || observationIds.has(observation.observationId)
    ) {
      diagnostics.push(diagnostic('CONTINUATION_SOURCE_OBSERVATION_INVALID', 'needs_review', '$.evidence.continuationWritingCapture.group.observations', 'Reviewed Continuation observations require unique closed identities'))
      continue
    }
    observationIds.add(observation.observationId)
    source.observations.push({
      observationId: observation.observationId,
      kind: observation.kind,
      documentInputKey: continuationEntry.document.inputKey,
      value: cloneJson(observation.value),
      span: { start: 0, end: continuationEntry.document.byteLength },
    })
  }
  if (diagnostics.some((item) => item.code === 'CONTINUATION_SOURCE_OBSERVATION_INVALID')) return
  const visibleContent = cloneJson(capture.group.content)
  const sourceSpanRefsByTarget = {}
  const transformationRecordIdsByTarget = {}
  let transformationSequence = Math.max(
    0,
    ...(source.transformations || []).map((record) => record.sequence || 0),
  )
  for (const block of visibleContent.blocks || []) {
    for (const inline of block.inlines || []) {
      if (inline.kind !== 'text') continue
      const before = inline.text
      const after = canonicalizeVisibleEnglishTypography(before)
      if (after === before) continue
      const observationId =
        `observation:visible-typography:${capture.group.groupId}:${inline.nodeId}`
      const visibleSourceSpanId = `source-span:${observationId}`
      const recordId =
        `record:visible-typography:${capture.group.groupId}:${inline.nodeId}`
      const observationValue = { nodeId: inline.nodeId, text: before }
      source.observations.push({
        observationId,
        kind: 'canonical_visible_typography_source',
        documentInputKey: continuationEntry.document.inputKey,
        value: observationValue,
        span: { start: 0, end: continuationEntry.document.byteLength },
      })
      source.transformations = [...(source.transformations || []), {
        recordId,
        sequence: ++transformationSequence,
        ruleId: 'canonical-visible-typography',
        ruleVersion: '2',
        target: {
          identity: inline.nodeId,
          path: 'content.text',
        },
        operation: 'canonical_visible_typography',
        inputSourceSpanIds: [visibleSourceSpanId],
        before,
        after,
        certainty: 'exact',
        preconditions: {
          sourceObservationIds: [observationId],
          sourceValueDigests: [digestJson(observationValue)],
        },
        outputDigest: digestJson(after),
      }]
      sourceSpanRefsByTarget[`content_node:${inline.nodeId}`] = [
        visibleSourceSpanId,
      ]
      transformationRecordIdsByTarget[`content_node:${inline.nodeId}`] = [
        recordId,
      ]
      inline.text = after
    }
  }
  source.groups.push({
    groupId: capture.group.groupId,
    slotId: capture.group.slotId,
    profileId: capture.profileId,
    family: 'continuation-writing',
    questionIds: [],
    blankIds: [],
    sourceSpanId,
    content: visibleContent,
    media: [],
    variant: cloneJson(capture.group.variant),
    sourceSpanRefsByTarget,
    transformationRecordIdsByTarget,
  })
}

function appendNck1ContinuationInstructionEvidence({
  source,
  instructionEntries,
  expectedSourceDocumentDigest,
  documents,
  diagnostics,
}) {
  if (source.profileId !== 'nck1') return
  if (instructionEntries.length !== 1) {
    diagnostics.push(diagnostic(
      'CONTINUATION_INSTRUCTION_EVIDENCE_INCOMPLETE',
      'incomplete_source',
      '$.evidence.continuationInstruction',
      'NCK1 requires exactly one reviewed continuation instruction correction',
    ))
    return
  }
  const entry = instructionEntries[0]
  const evidence = entry.value
  const authority = resolveCanonicalAuthority(canonicalAuthorityRef)
  const profile = authority.closure.profiles.get('nck1')
  const expectedInstruction =
    profile?.instructions?.['writing.continuation.prompt']
  const schemaIssues = validateJsonSchema(
    evidence,
    authority.closure.schemas['profile-writing-source-evidence-v1'],
    '$.evidence.continuationInstruction',
  )
  const sourceMatches = documents.filter(
    (document) => document.sha256 === evidence?.sourceDocumentDigest,
  )
  const record = evidence?.transformationRecord
  const exactCorrection = (
    evidence?.paperId === source.paperId
    && evidence?.profileId === source.profileId
    && typeof expectedSourceDocumentDigest === 'string'
    && evidence.sourceDocumentDigest === expectedSourceDocumentDigest
    && sourceMatches.length === 1
    && sourceMatches[0].mediaType === 'application/pdf'
    && sourceMatches[0].roles.includes('question_source')
    && sourceMatches[0].roles.includes('source_provenance')
    && stableStringify(evidence?.instruction)
      === stableStringify(expectedInstruction)
    && evidence?.sourceLocation?.kind === 'pdf_page_region'
    && Number.isInteger(evidence?.sourceLocation?.page)
    && evidence.sourceLocation.page > 0
    && validNormalizedRegion(evidence?.sourceLocation?.region)
    && typeof evidence?.sourceLocation?.locator === 'string'
    && evidence.sourceLocation.locator.length > 0
    && record?.ruleId === 'source-exact-transcription'
    && record?.ruleVersion === '1'
    && record?.certainty === 'exact'
    && typeof record?.recordId === 'string'
    && record.recordId.length > 0
    && typeof record?.before === 'string'
    && record.before.length > 0
    && record.before !== record.after
    && record?.after === expectedInstruction?.text
    && typeof record?.proof === 'string'
    && record.proof.length > 0
  )
  if (schemaIssues.length > 0 || !exactCorrection) {
    diagnostics.push(diagnostic(
      'CONTINUATION_INSTRUCTION_EVIDENCE_INVALID',
      'incomplete_source',
      '$.evidence.continuationInstruction',
      'NCK1 continuation instruction evidence must bind the exact source digest, Profile instruction, and accepted correction',
    ))
    return
  }
  const observationId =
    `observation:profile-instruction:${source.paperId}:writing.continuation.prompt`
  const sourceSpanId = `source-span:${observationId}`
  source.observations.push({
    observationId,
    kind: 'profile_instruction_correction',
    documentInputKey: sourceMatches[0].inputKey,
    value: cloneJson(evidence),
    span: {
      kind: 'page_region',
      page: evidence.sourceLocation.page,
      region: cloneJson(evidence.sourceLocation.region),
    },
  })
  const transformations = Array.isArray(source.transformations)
    ? source.transformations
    : []
  const lastSequence = transformations.reduce(
    (maximum, candidate) =>
      Number.isInteger(candidate?.sequence)
        ? Math.max(maximum, candidate.sequence)
        : maximum,
    0,
  )
  const observationValue = cloneJson(evidence)
  transformations.push({
    recordId: record.recordId,
    sequence: lastSequence + 1,
    ruleId: record.ruleId,
    ruleVersion: record.ruleVersion,
    target: {
      identity: 'profile:nck1:instruction:writing.continuation.prompt',
      path: 'instructions.writing.continuation.prompt.text',
    },
    operation: 'profile_instruction_correction',
    inputSourceSpanIds: [sourceSpanId],
    before: record.before,
    after: record.after,
    certainty: record.certainty,
    preconditions: {
      sourceObservationIds: [observationId],
      sourceValueDigests: [digestJson(observationValue)],
    },
    outputDigest: digestJson(record.after),
  })
  source.transformations = transformations
}

function adaptReferenceFamilies(parsed, documents, diagnostics) {
  const finish = () => {
    appendVisibleTypographyTransformations(parsed.value, diagnostics)
    return parsed
  }
  const structured = documents
    .filter((document) => document.mediaType === 'application/json' && document.roles.some((role) => ['question_source', 'official_answer_source', 'structured_source'].includes(role)))
    .map((document) => ({ document, value: parseJsonDocument(document, diagnostics) }))
  const paperEntry = structured.find((entry) => entry.value?.schemaVersion === 'paper-asset-v1')
  const answerEntry = structured.find((entry) => entry.value?.schemaVersion === 'answer-key-v1')
  const readingEntry = structured.find((entry) => entry.value?.schemaVersion === 'reading-source-capture-v1')
  const promptDocuments = documents.filter(
    (document) =>
      document.mediaType
        === 'application/vnd.eqb.grammar-fill-prompt-source-capture+json',
  )
  const promptEntry = promptDocuments.length === 1
    ? {
        document: promptDocuments[0],
        value: parseJsonDocument(promptDocuments[0], diagnostics),
      }
    : null
  const applicationDocument = documents.find((document) => document.mediaType === 'application/vnd.eqb.application-writing-source-capture+json')
  const applicationEntry = applicationDocument
    ? { document: applicationDocument, value: parseJsonDocument(applicationDocument, diagnostics) }
    : null
  const transcriptionDocument = documents.find((document) => document.mediaType === 'application/vnd.eqb.application-writing-source-transcription+json')
  const transcriptionEntry = transcriptionDocument
    ? { document: transcriptionDocument, value: parseJsonDocument(transcriptionDocument, diagnostics) }
    : null
  const continuationDocument = documents.find((document) => document.mediaType === 'application/vnd.eqb.continuation-writing-source-capture+json')
  const continuationEntry = continuationDocument
    ? { document: continuationDocument, value: parseJsonDocument(continuationDocument, diagnostics) }
    : null
  const continuationTranscriptionDocument = documents.find((document) => document.mediaType === 'application/vnd.eqb.continuation-writing-source-transcription+json')
  const continuationTranscriptionEntry = continuationTranscriptionDocument
    ? { document: continuationTranscriptionDocument, value: parseJsonDocument(continuationTranscriptionDocument, diagnostics) }
    : null
  const listeningMediaTypes = new Map([
    ['questions', 'application/vnd.eqb.listening-questions+json'],
    ['answers', 'application/vnd.eqb.listening-answers+json'],
    ['transcript', 'application/vnd.eqb.listening-transcript+json'],
    ['inventory', 'application/vnd.eqb.listening-source-inventory+json'],
  ])
  const listeningEntries = Object.fromEntries(
    [...listeningMediaTypes].map(([key, mediaType]) => {
      const entries = documents
        .filter((document) => document.mediaType === mediaType)
        .map((document) => ({
          document,
          value: parseJsonDocument(document, diagnostics),
        }))
      if (entries.length > 1) {
        const conflictingAnswers = key === 'answers'
          && entries.every((entry) => isRecordValue(entry.value))
          && new Set(entries.map((entry) => stableStringify(entry.value))).size > 1
        diagnostics.push(diagnostic(
          conflictingAnswers
            ? 'LISTENING_OFFICIAL_ANSWER_DOCUMENT_CONFLICT'
            : 'LISTENING_SOURCE_DOCUMENT_AMBIGUOUS',
          conflictingAnswers ? 'answer_conflict' : 'needs_review',
          `$.evidence.documents.${key}`,
          conflictingAnswers
            ? 'Competing listening answer documents disagree'
            : `Listening ${key} evidence must resolve to exactly one document`,
        ))
      }
      return [key, entries[0] || null]
    }),
  )
  const instructionEntries = documents
    .filter((document) => document.mediaType === 'application/vnd.eqb.profile-writing-source-evidence+json')
    .map((document) => ({
      document,
      value: parseJsonDocument(document, diagnostics),
    }))
  const provenanceEntries = documents
    .filter((document) => document.mediaType === 'application/json' && document.roles.includes('source_provenance'))
    .map((document) => ({ document, value: parseJsonDocument(document, diagnostics) }))
  appendApplicationWritingReferenceGroup({
    source: parsed.value,
    applicationEntry,
    transcriptionEntry,
    provenanceEntries,
    documents,
    diagnostics,
  })
  appendNck1ContinuationInstructionEvidence({
    source: parsed.value,
    instructionEntries,
    expectedSourceDocumentDigest:
      continuationEntry?.value?.sourceDocumentDigest
      || parsed.value?.profileInstructionSourceDigest,
    documents,
    diagnostics,
  })
  appendContinuationWritingReferenceGroup({
    source: parsed.value,
    continuationEntry,
    transcriptionEntry: continuationTranscriptionEntry,
    provenanceEntries,
    documents,
    diagnostics,
  })
  const currentAuthority = resolveCanonicalAuthority(canonicalAuthorityRef).closure
  const activeProfile = currentAuthority.profiles.get(parsed.value.profileId)
  appendListeningInactiveClosures({
    source: parsed.value,
    profileSlots: activeProfile ? slotsForProfile(activeProfile) : [],
    documents,
    questionsEntry: listeningEntries.questions,
    answersEntry: listeningEntries.answers,
    transcriptEntry: listeningEntries.transcript,
    inventoryEntry: listeningEntries.inventory,
    inventorySchema: currentAuthority.schemas['listening-source-inventory-v1'],
    diagnostics,
  })
  if (!paperEntry && !answerEntry) return finish()
  if (!paperEntry || !answerEntry) {
    diagnostics.push(diagnostic('REFERENCE_EVIDENCE_INCOMPLETE', 'incomplete_source', '$.evidence.documents', 'Cloze and Grammar Fill reference publication requires paper asset and official answer evidence together'))
    return finish()
  }
  const source = parsed.value
  const paper = paperEntry.value
  const answerKey = answerEntry.value
  if (paper.paper?.paperId !== source.paperId || answerKey.paperId !== source.paperId || answerKey.sourceAssetVersion !== source.sourceAssetVersion) {
    diagnostics.push(diagnostic('REFERENCE_SOURCE_IDENTITY_MISMATCH', 'needs_review', '$.evidence.documents', 'Reference paper identity and source version must agree across immutable evidence'))
    return finish()
  }
  const hasGrammarFillReference = Object.values(
    paper.content?.groups || {},
  ).some((candidate) => candidate?.groupType === 'grammarFill')
  if (hasGrammarFillReference && promptDocuments.length !== 1) {
    diagnostics.push(diagnostic(
      'GRAMMAR_FILL_PROMPT_SOURCE_CAPTURE_REQUIRED',
      'incomplete_source',
      '$.evidence.documents',
      'Current Grammar Fill compilation requires exactly one reviewed prompt source capture',
    ))
  }
  const familySpecs = [
    { familyId: 'cloze', slotId: 'language.cloze', legacyType: 'cloze' },
    { familyId: 'grammar-fill', slotId: 'language.grammar-fill', legacyType: 'grammarFill' },
    { familyId: 'seven-choices', slotId: 'reading.seven-choices', legacyType: 'sevenChoices' },
  ]
  const referenceAuthority =
    resolveCanonicalAuthority(canonicalAuthorityRef).closure
  const referenceProfile = referenceAuthority.profiles.get(source.profileId)
  appendReadingReferenceGroups({
    source,
    paper,
    answerKey,
    paperEntry,
    answerEntry,
    readingEntry,
    documents,
    activeProfile: referenceProfile,
    diagnostics,
  })
  const sevenChoicesSlot = referenceProfile && slotsForProfile(referenceProfile).find((slot) => slot.slotId === 'reading.seven-choices')
  const sevenChoicesNumbers = sevenChoicesSlot?.numberingRule?.kind === 'range'
    ? Array.from({ length: 5 }, (_, index) => sevenChoicesSlot.numberingRule.start + index)
    : []
  let sequence = Math.max(0, ...(source.transformations || []).map((record) => record.sequence || 0))
  for (const spec of familySpecs) {
    if (source.groups.some((candidate) => candidate.slotId === spec.slotId)) continue
    const group = Object.values(paper.content?.groups || {}).find((candidate) => candidate?.groupType === spec.legacyType)
    const groupRange = group ? jsonObjectPropertyRange(paperEntry.document.bytes, group.groupId) : null
    if (!group || !groupRange || !Array.isArray(group.questionIds) || !Array.isArray(group.blankIds) || !Array.isArray(group.passage?.paragraphs) || group.passage.paragraphs.some((paragraph) => typeof paragraph?.paragraphId !== 'string' || typeof paragraph.text !== 'string')) {
      diagnostics.push(diagnostic('REFERENCE_GROUP_INCOMPLETE', 'incomplete_source', '$.evidence.paperAsset', `${spec.familyId} reference Group is missing or malformed`))
      continue
    }
    const observationId = `observation:reference:${spec.familyId}`
    const sourceSpanId = `source-span:${observationId}`
    const sevenChoices = spec.familyId === 'seven-choices' ? inspectSevenChoicesGroup(paper, group, sevenChoicesNumbers, diagnostics) : null
    source.observations.push({
      observationId,
      kind: 'reference_question_group',
      documentInputKey: paperEntry.document.inputKey,
      value: group,
      span: groupRange,
    })
    const content = referenceContent(group)
    const grammarFillPromptBindings =
      spec.familyId === 'grammar-fill'
        ? grammarFillPromptBindingsFromPaper({
            paper,
            paperEntry,
            promptEntry,
            documents,
            group,
            source,
            diagnostics,
            sourceEvidenceSchema:
              referenceAuthority.schemas[
                referenceAuthority.families.get('grammar-fill')
                  ?.promptEvidenceSchemaId
              ],
            promptProvisionSchema:
              referenceAuthority.schemas[
                referenceAuthority.families.get('grammar-fill')
                  ?.promptProvisionSchemaId
              ],
            promptAdapterVersion:
              referenceAuthority.artifacts.adapter.adapters.find(
                (adapter) =>
                  adapter.adapterId === 'grammar-fill-prompt-evidence',
              )?.version,
          })
        : null
    const sourceGroup = {
      groupId: group.groupId,
      slotId: spec.slotId,
      family: spec.familyId,
      questionIds: [...group.questionIds],
      blankIds: [...group.blankIds],
      sourceSpanId,
      content,
      media: [],
      variant: {
        family: spec.familyId,
        ...(
          spec.familyId === 'grammar-fill'
            ? {
                promptBindings: grammarFillPromptBindings,
              }
            : {}
        ),
        ...(spec.familyId === 'seven-choices'
          ? {
              members: (group.questionIds || []).map((questionId, index) => ({
                questionId,
                blankId: group.blankIds[index],
                answer: {
                  optionId: `option:${group.groupId}:${answerKey.answers?.[questionId]?.answer}`,
                  authorityAssertionRef: `answer:${questionId}`,
                },
              })),
              choiceOwnership: {
                ownership: 'shared_bank',
                bankId: `bank:${group.groupId}`,
                options: (group.optionBank || []).map((option) => ({
                  optionId: `option:${group.groupId}:${option.label}`,
                  label: option.label,
                  content: [{ kind: 'text', nodeId: `text:${group.groupId}:option:${option.label}`, text: option.text }],
                })),
              },
            }
          : { choiceOwnership: referenceOptions(paper, group, diagnostics, spec.familyId) }),
      },
      sourceSpanRefsByTarget:
        grammarFillPromptBindings == null
          ? {}
          : Object.fromEntries(
              grammarFillPromptBindings.map((binding) => [
                `prompt_provision:${binding.blankId}`,
                [`source-span:${binding.authorityObservationRef}`],
              ]),
            ),
    }
    source.groups.push(sourceGroup)
    if (sevenChoices) {
      let markerSearchOffset = groupRange.start
      for (const [index, { marker }] of sevenChoices.markers.entries()) {
        const markerRange = byteRangeForText(paperEntry.document.bytes, marker.raw, groupRange.start, groupRange.end, markerSearchOffset)
        if (!markerRange) {
          diagnostics.push(diagnostic('SEVEN_CHOICES_MARKER_SPAN_MISSING', 'incomplete_source', '$.evidence.paperAsset', 'Seven Choices marker bytes do not resolve inside the captured Group'))
          continue
        }
        markerSearchOffset = markerRange.end
        const markerObservationId = `observation:reference-marker:${index + 1}:${group.blankIds[index]}`
        const markerSourceSpanId = `source-span:${markerObservationId}`
        source.observations.push({
          observationId: markerObservationId,
          kind: 'seven_choices_marker',
          documentInputKey: paperEntry.document.inputKey,
          value: {
            groupId: group.groupId,
            blankId: group.blankIds[index],
            marker: marker.raw,
            dialectId: sevenChoices.dialectId,
          },
          span: markerRange,
        })
        sourceGroup.sourceSpanRefsByTarget[`blank:${group.blankIds[index]}`] = [markerSourceSpanId]
      }
    }
    const record = {
      recordId: `record:reference:${spec.familyId}`,
      sequence: ++sequence,
      ruleId: 'direct-projection',
      ruleVersion: '2',
      target: { identity: group.groupId, path: 'content.blocks' },
      operation: 'structural_tokenization',
      inputSourceSpanIds: [sourceSpanId],
      before: group.passage.paragraphs,
      after: cloneJson(content.blocks),
      certainty: 'exact',
      preconditions: { sourceObservationIds: [observationId], sourceValueDigests: [digestJson(group)] },
      outputDigest: digestJson(content.blocks),
    }
    source.transformations = [...(source.transformations || []), record]
    for (const [index, questionId] of group.questionIds.entries()) {
      const question = paper.content?.questions?.[questionId]
      const answer = answerKey.answers?.[questionId]
      const answerRange = jsonObjectPropertyRange(answerEntry.document.bytes, questionId)
      if (!question || !answer || !answerRange) {
        diagnostics.push(diagnostic('REFERENCE_QUESTION_EVIDENCE_INCOMPLETE', 'incomplete_source', '$.evidence.documents', `${spec.familyId} Question ${questionId} lacks one exact Blank or official answer`))
        continue
      }
      if (question.blankId !== group.blankIds[index]) {
        if (spec.familyId !== 'seven-choices') {
          diagnostics.push(diagnostic('REFERENCE_QUESTION_EVIDENCE_INCOMPLETE', 'incomplete_source', '$.evidence.documents', `${spec.familyId} Question ${questionId} lacks one exact Blank or official answer`))
          continue
        }
        diagnostics.push(diagnostic('REFERENCE_QUESTION_IDENTITY_AMBIGUOUS', 'needs_review', '$.evidence.documents', `${spec.familyId} Question ${questionId} disagrees with its Group Blank identity`))
      }
      const answerObservationId = `observation:reference-answer:${questionId}`
      source.observations.push({
        observationId: answerObservationId,
        kind: 'official_answer',
        documentInputKey: answerEntry.document.inputKey,
        value: answer,
        span: answerRange,
      })
      source.assertions.push({
        assertionId: `answer:${questionId}`,
        questionId,
        answer: answer.answer,
        authority: 'official',
        sourceSpanId: `source-span:${answerObservationId}`,
      })
      if (spec.familyId === 'seven-choices') {
        sourceGroup.sourceSpanRefsByTarget[`question:${questionId}`] = [sourceSpanId, `source-span:${answerObservationId}`]
      }
    }
  }
  return finish()
}

function captureRequestEvidence(request) {
  const diagnostics = []
  const documents = []
  const sourceDocuments = request?.evidence?.documents
  if (!Array.isArray(sourceDocuments) || sourceDocuments.length === 0) {
    diagnostics.push(diagnostic('SOURCE_DOCUMENTS_MISSING', 'incomplete_source', '$.evidence.documents', 'At least one immutable source document is required'))
  }
  for (const [index, input] of (sourceDocuments || []).entries()) {
    const bytes = asBytes(input?.bytes)
    if (!input || typeof input.inputKey !== 'string' || !Array.isArray(input.roles) || !bytes) {
      diagnostics.push(diagnostic('SOURCE_DOCUMENT_INVALID', 'incomplete_source', `$.evidence.documents[${index}]`, 'Source documents require inputKey, roles, and immutable bytes'))
      continue
    }
    const documentDigest = sha256(bytes)
    const artifactId = stableId('source-document', { sha256: documentDigest })
    documents.push({
      documentId: stableId('document', { digest: documentDigest, roles: input.roles, inputKey: input.inputKey }),
      inputKey: input.inputKey,
      roles: [...input.roles],
      mediaType: input.declared?.mediaType || 'application/octet-stream',
      originalName: input.declared?.originalName || null,
      byteLength: bytes.byteLength,
      sha256: documentDigest,
      immutableArtifactRef: {
        artifactId,
        relativePath: `source-evidence/${artifactId.slice('source-document:'.length)}.bin`,
        sha256: documentDigest,
        byteLength: bytes.byteLength,
      },
      encodedBytes: bytesToBase64(bytes),
      bytes,
    })
  }
  return { documents, diagnostics }
}

function parseDocxSourceEnvelope(documents, diagnostics) {
  const envelopes = documents.filter(
    (document) => document.mediaType === 'application/vnd.eqb.docx-source-envelope+json',
  )
  if (envelopes.length === 0) return undefined
  if (envelopes.length !== 1) {
    diagnostics.push(diagnostic('DOCX_SOURCE_ENVELOPE_AMBIGUOUS', 'incomplete_source', '$.evidence.documents', 'DOCX source evidence requires exactly one envelope'))
    return null
  }
  const envelopeDocument = envelopes[0]
  try {
    const envelope = JSON.parse(new TextDecoder().decode(envelopeDocument.bytes))
    const sourceDocument = envelope?.sourceDocument
    const legacyEnvelope = envelope?.schemaVersion === 'docx-source-envelope-v1'
    const trustedEnvelope = envelope?.schemaVersion === 'docx-source-envelope-v2'
    if (
      !isRecordValue(envelope)
      || (!legacyEnvelope && !trustedEnvelope)
      || !isRecordValue(sourceDocument)
      || typeof sourceDocument.inputKey !== 'string'
      || typeof sourceDocument.sha256 !== 'string'
      || !Number.isInteger(sourceDocument.byteLength)
      || (legacyEnvelope && !isRecordValue(envelope.source))
    ) {
      diagnostics.push(diagnostic('DOCX_SOURCE_ENVELOPE_INVALID', 'incomplete_source', '$.evidence.documents', 'DOCX source envelope must declare one source-bound immutable document'))
      return null
    }
    const sourceCandidates = documents.filter(
      (document) => document.inputKey === sourceDocument.inputKey,
    )
    if (sourceCandidates.length > 1) {
      diagnostics.push(diagnostic('DOCX_SOURCE_DOCUMENT_AMBIGUOUS', 'incomplete_source', '$.evidence.documents', 'DOCX source envelope must bind exactly one immutable document'))
      return null
    }
    const source = sourceCandidates[0]
    if (!source) {
      diagnostics.push(diagnostic('DOCX_SOURCE_DOCUMENT_MISSING', 'incomplete_source', '$.evidence.documents', 'DOCX source envelope references a missing immutable document'))
      return null
    }
    if (
      source.mediaType
        !== 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      || sourceDocument.mediaType !== source.mediaType
      || sourceDocument.sha256 !== source.sha256
      || sourceDocument.byteLength !== source.byteLength
    ) {
      diagnostics.push(diagnostic('DOCX_SOURCE_DIGEST_MISMATCH', 'incomplete_source', '$.evidence.documents', 'DOCX source envelope no longer binds the supplied immutable DOCX bytes'))
      return null
    }
    const pairIdentityDocuments = documents.filter(
      (document) => document.inputKey === 'docx_pair_identity',
    )
    const pairAnswerDocuments = documents.filter(
      (document) => document.inputKey === 'official_answer_docx',
    )
    const isDocxPair = source.inputKey === 'question_docx'
    if (isDocxPair) {
      if (legacyEnvelope) {
        diagnostics.push(diagnostic('DOCX_SOURCE_ENVELOPE_INVALID', 'incomplete_source', '$.evidence.documents', 'DOCX pair evidence cannot use the legacy single-source envelope'))
        return null
      }
      if (pairIdentityDocuments.length !== 1 || pairAnswerDocuments.length !== 1) {
        diagnostics.push(diagnostic('DOCX_PAIR_EVIDENCE_INCOMPLETE', 'incomplete_source', '$.evidence.documents', 'DOCX pair evidence requires one question DOCX, one answer DOCX, and one owner paper identity'))
        return null
      }
      if (!['question_source', 'source_provenance'].every((role) => source.roles.includes(role))) {
        diagnostics.push(diagnostic('DOCX_SOURCE_ROLE_INCOMPLETE', 'incomplete_source', '$.evidence.documents', 'DOCX pair question source must carry question and provenance roles'))
        return null
      }
      const answers = pairAnswerDocuments[0]
      if (
        answers.mediaType !== DOCX_MEDIA_TYPE
        || !answers.roles.includes('official_answer_source')
      ) {
        diagnostics.push(diagnostic('DOCX_SOURCE_ROLE_INCOMPLETE', 'incomplete_source', '$.evidence.documents', 'DOCX pair answer source must carry the official-answer role'))
        return null
      }
      const identityDocument = pairIdentityDocuments[0]
      let identity
      try {
        identity = JSON.parse(new TextDecoder().decode(identityDocument.bytes))
      } catch (error) {
        diagnostics.push(diagnostic('DOCX_PAIR_IDENTITY_INVALID', 'incomplete_source', '$.evidence.documents', `DOCX pair identity is unreadable: ${error.message}`))
        return null
      }
      if (
        identityDocument.mediaType !== DOCX_PAIR_IDENTITY_MEDIA_TYPE
        || !exactKeys(identity, ['schemaVersion', 'paperId', 'profileId'])
        || identity.schemaVersion !== DOCX_PAIR_IDENTITY_SCHEMA_VERSION
        || identity.profileId !== 'nck1'
        || typeof identity.paperId !== 'string'
        || identity.paperId.length === 0
      ) {
        diagnostics.push(diagnostic('DOCX_PAIR_IDENTITY_INVALID', 'incomplete_source', '$.evidence.documents', 'DOCX pair identity must bind schemaVersion, owner paperId, and nck1'))
        return null
      }
      if (isReservedNck1ExamPaperId(identity.paperId)) {
        diagnostics.push(diagnostic('DOCX_PAIR_PAPER_ID_RESERVED', 'unsupported', '$.evidence.documents', `DOCX pair identity must not occupy reserved NCK1 exam id ${identity.paperId}`))
        return null
      }
      let inspection
      try {
        inspection = inspectDocxPairEnvelopeSource(source.bytes, answers.bytes, {
          adapterVersion: '2',
          paperId: identity.paperId,
        })
      } catch (error) {
        diagnostics.push(diagnostic(
          'DOCX_SOURCE_DOCUMENT_INVALID',
          'incomplete_source',
          '$.evidence.documents',
          `DOCX pair bytes cannot be opened by the registered adapter: ${error.message}`,
        ))
        return null
      }
      if (!inspection.ok) {
        diagnostics.push(diagnostic(
          'DOCX_SOURCE_DERIVATION_INVALID',
          'incomplete_source',
          '$.docxSourceEnvelope.sourceDocument',
          'The DOCX pair adapter did not derive a complete source state',
        ))
        return null
      }
      return {
        value: inspection.verifiedSource,
        adapter: 'docx-source-envelope',
        envelope,
        sourceDocumentId: source.documentId,
        sourceDocumentDigest: source.sha256,
        inspection,
      }
    }
    if (![
      'question_source',
      'official_answer_source',
      'source_provenance',
    ].every((role) => source.roles.includes(role))) {
      diagnostics.push(diagnostic('DOCX_SOURCE_ROLE_INCOMPLETE', 'incomplete_source', '$.evidence.documents', 'DOCX source must explicitly carry question, official-answer, and provenance roles'))
      return null
    }
    let inspection
    try {
      inspection = inspectDocxEnvelopeSource(source.bytes, {
        adapterVersion: legacyEnvelope ? '1' : '2',
        ...(legacyEnvelope ? { assertedSource: envelope.source } : {}),
      })
    } catch (error) {
      diagnostics.push(diagnostic(
        'DOCX_SOURCE_DOCUMENT_INVALID',
        'incomplete_source',
        '$.evidence.documents',
        `DOCX source bytes cannot be opened by the registered adapter: ${error.message}`,
      ))
      return null
    }
    if (!inspection.ok) {
      diagnostics.push(diagnostic(
        legacyEnvelope ? 'DOCX_SOURCE_DERIVATION_MISMATCH' : 'DOCX_SOURCE_DERIVATION_INVALID',
        'incomplete_source',
        legacyEnvelope ? '$.docxSourceEnvelope.source' : '$.docxSourceEnvelope.sourceDocument',
        legacyEnvelope
          ? 'DOCX envelope source does not exactly match the registered adapter derivation'
          : 'The trusted DOCX adapter did not derive a complete source state',
      ))
      return null
    }
    if (
      legacyEnvelope
      && (
        inspection.listening.questions.length !== 20
        || inspection.listening.questions.some((question) =>
          Object.keys(question.options).join('') !== 'ABC'
          || !Object.hasOwn(question.options, question.answer))
        || inspection.listening.transcript.coverage !== 'exactly_once'
        || inspection.listening.timing.disposition === 'supplied_unparsed'
      )
    ) {
      diagnostics.push(diagnostic(
        'DOCX_LISTENING_SOURCE_INCOMPLETE',
        'incomplete_source',
        '$.docxSourceEnvelope.source.inactiveSourceClosures',
        'Inactive Listening requires source-derived questions, A-C Options, answers, ten transcripts, exact supplied timing, and a closed package audio inventory',
      ))
    }
    return {
      value: inspection.verifiedSource,
      adapter: 'docx-source-envelope',
      envelope,
      sourceDocumentId: source.documentId,
      sourceDocumentDigest: source.sha256,
      inspection,
    }
  } catch (error) {
    diagnostics.push(diagnostic('DOCX_SOURCE_ENVELOPE_INVALID', 'incomplete_source', '$.evidence.documents', `DOCX source envelope is unreadable: ${error.message}`))
    return null
  }
}

function parseTicket26LegacySourceEnvelope(
  documents,
  diagnostics,
  { legacySourceAdapterVersion = '4', ownerQaContentSuccessor = false } = {},
) {
  const envelopes = documents.filter(
    (document) => document.mediaType === TICKET_26_LEGACY_SOURCE_ENVELOPE_MEDIA_TYPE,
  )
  if (envelopes.length === 0) return undefined
  if (envelopes.length !== 1) {
    diagnostics.push(diagnostic('TICKET_26_LEGACY_ENVELOPE_AMBIGUOUS', 'incomplete_source', '$.evidence.documents', 'Ticket 26 legacy source evidence requires exactly one envelope'))
    return null
  }
  try {
    const envelope = JSON.parse(new TextDecoder().decode(envelopes[0].bytes))
    const sourceCaptureDocument = envelope?.sourceCaptureDocument
    if (
      !isRecordValue(envelope)
      || !exactKeys(envelope, ['schemaVersion', 'sourceCaptureDocument'])
      || envelope.schemaVersion !== 'ticket-26-legacy-source-envelope-v1'
      || !isRecordValue(sourceCaptureDocument)
      || !exactKeys(sourceCaptureDocument, ['inputKey', 'mediaType', 'sha256', 'byteLength'])
    ) {
      diagnostics.push(diagnostic('TICKET_26_LEGACY_ENVELOPE_INVALID', 'incomplete_source', '$.evidence.documents', 'Ticket 26 legacy envelope must bind exactly one immutable capture document'))
      return null
    }
    const captures = documents.filter((document) => document.inputKey === sourceCaptureDocument.inputKey)
    if (captures.length !== 1) {
      diagnostics.push(diagnostic('TICKET_26_LEGACY_CAPTURE_AMBIGUOUS', 'incomplete_source', '$.evidence.documents', 'Ticket 26 legacy envelope must bind exactly one source capture'))
      return null
    }
    const sourceCapture = captures[0]
    if (
      sourceCapture.mediaType !== TICKET_26_LEGACY_CAPTURE_MEDIA_TYPE
      || sourceCaptureDocument.mediaType !== sourceCapture.mediaType
      || sourceCaptureDocument.sha256 !== sourceCapture.sha256
      || sourceCaptureDocument.byteLength !== sourceCapture.byteLength
      || sourceCapture.roles.length !== 1
      || sourceCapture.roles[0] !== 'source_provenance'
    ) {
      diagnostics.push(diagnostic('TICKET_26_LEGACY_CAPTURE_BINDING_MISMATCH', 'incomplete_source', '$.evidence.documents', 'Ticket 26 legacy envelope no longer binds the supplied immutable capture bytes'))
      return null
    }
    const inspection = inspectTicket26LegacyEnvelopeSource(sourceCapture.bytes, {
      adapterVersion: legacySourceAdapterVersion,
    })
    if (!inspection.ok || !ticket26LegacyCompilerDocumentsMatch(inspection.record, documents)) {
      diagnostics.push(diagnostic('TICKET_26_LEGACY_CAPTURE_UNTRUSTED', 'incomplete_source', '$.evidence.documents', 'Ticket 26 legacy capture identity or nested immutable document binding is not trusted'))
      return null
    }
    return {
      value: ownerQaContentSuccessor
        ? applyTicket26OwnerQaContentSuccessor(
            sourceCapture.bytes,
            inspection.source,
          )
        : inspection.source,
      adapter: 'ticket-26-legacy-source-envelope',
      envelope,
      sourceDocumentId: sourceCapture.documentId,
      sourceDocumentDigest: sourceCapture.sha256,
    }
  } catch (error) {
    diagnostics.push(diagnostic('TICKET_26_LEGACY_ENVELOPE_INVALID', 'incomplete_source', '$.evidence.documents', `Ticket 26 legacy envelope is unreadable: ${error.message}`))
    return null
  }
}

function parseFixtureEvidence(documents, diagnostics, options = {}) {
  const docxEnvelope = parseDocxSourceEnvelope(documents, diagnostics)
  if (docxEnvelope !== undefined) return docxEnvelope
  const ticket26LegacyEnvelope = parseTicket26LegacySourceEnvelope(
    documents,
    diagnostics,
    options,
  )
  if (ticket26LegacyEnvelope !== undefined) return ticket26LegacyEnvelope
  const source = documents.find((document) => document.mediaType === 'application/vnd.eqb.canonical-fixture+json')
  if (!source) {
    diagnostics.push(diagnostic('SOURCE_ADAPTER_UNSUPPORTED', 'unsupported', '$.evidence.documents', 'No registered source adapter can read the supplied evidence'))
    return null
  }
  try {
    const parsed = JSON.parse(new TextDecoder().decode(source.bytes))
    if (!isRecordValue(parsed)) throw new TypeError('Fixture root is not an object')
    return adaptReferenceFamilies({ source, value: parsed }, documents, diagnostics)
  } catch (error) {
    diagnostics.push(diagnostic('SOURCE_DOCUMENT_UNREADABLE', 'incomplete_source', '$.evidence.documents', `Fixture evidence is unreadable: ${error.message}`))
    return null
  }
}

function buildSourceCapture(documents, parsed, diagnostics) {
  const observations = []
  const sourceSpans = []
  const assertions = []
  const observationIds = new Set()
  const inputObservations = parsed?.value?.observations || []
  for (const [index, observation] of inputObservations.entries()) {
    if (!isRecordValue(observation) || typeof observation.observationId !== 'string' || typeof observation.kind !== 'string' || typeof observation.documentInputKey !== 'string') {
      diagnostics.push(diagnostic('OBSERVATION_INVALID', 'incomplete_source', `$.observations[${index}]`, 'Observations need a stable id, kind, and source document key'))
      continue
    }
    if (observationIds.has(observation.observationId)) {
      diagnostics.push(diagnostic('OBSERVATION_DUPLICATE', 'incomplete_source', `$.observations[${index}]`, 'Observation identities must identify exactly one source fact'))
      continue
    }
    const document = documents.find((candidate) => candidate.inputKey === observation.documentInputKey)
    const start = observation.span?.start
    const end = observation.span?.end
    const pageRegion = observation.span?.kind === 'page_region'
      && document?.mediaType === 'application/pdf'
      && Number.isInteger(observation.span.page)
      && observation.span.page > 0
      && validNormalizedRegion(observation.span.region)
    const byteRange = Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end >= start && end <= (document?.byteLength ?? -1)
    if (!document || (!byteRange && !pageRegion)) {
      diagnostics.push(diagnostic('SOURCE_SPAN_INVALID', 'incomplete_source', `$.observations[${index}]`, 'Observation span is not closed against immutable document bytes'))
      continue
    }
    const sourceSpanId = `source-span:${observation.observationId}`
    observationIds.add(observation.observationId)
    observations.push({
      observationId: observation.observationId,
      documentId: document.documentId,
      kind: observation.kind,
      value: observation.value ?? null,
      order: index,
      extraction: isRecordValue(observation.extraction)
        && exactKeys(observation.extraction, ['adapterId', 'version'])
        && typeof observation.extraction.adapterId === 'string'
        && typeof observation.extraction.version === 'string'
        ? cloneJson(observation.extraction)
        : { adapterId: 'canonical-fixture-evidence', version: '1' },
      sourceSpanId,
    })
    sourceSpans.push({
      sourceSpanId,
      documentId: document.documentId,
      documentDigest: document.sha256,
      coordinate: pageRegion
        ? { kind: 'page_region', page: observation.span.page, region: cloneJson(observation.span.region) }
        : { kind: 'byte_range', start, end },
    })
  }
  for (const [index, assertion] of (parsed?.value?.assertions || []).entries()) {
    if (!isRecordValue(assertion) || typeof assertion.assertionId !== 'string' || typeof assertion.questionId !== 'string' || typeof assertion.answer !== 'string' || typeof assertion.sourceSpanId !== 'string') {
      diagnostics.push(diagnostic('ASSERTION_INVALID', 'incomplete_source', `$.assertions[${index}]`, 'Answer assertions require identity, answer, question, and source span'))
      continue
    }
    if (!sourceSpans.some((span) => span.sourceSpanId === assertion.sourceSpanId)) {
      diagnostics.push(diagnostic('ASSERTION_SOURCE_UNRESOLVED', 'incomplete_source', `$.assertions[${index}]`, 'Answer assertion does not resolve to a source span'))
      continue
    }
    assertions.push({
      assertionId: assertion.assertionId,
      questionId: assertion.questionId,
      answer: assertion.answer,
      authority: assertion.authority || 'official',
      sourceSpanId: assertion.sourceSpanId,
    })
  }
  const serializedDocuments = documents.map(({ bytes: _bytes, ...document }) => document)
  const captureBase = {
    schemaVersion: 'source-capture-v1',
    documents: serializedDocuments,
    observations,
    sourceSpans,
    assertions,
  }
  const digest = digestJson(captureBase)
  return { ...captureBase, captureId: stableId('source-capture', captureBase), digest }
}

function validateCapture(capture, closure) {
  const issues = validateJsonSchema(
    capture,
    closure.schemas['source-capture-v1'],
    '$.sourceCapture',
  )
  const registeredAdapters = new Map(
    (closure.artifacts.adapter?.adapters || []).map((adapter) => [
      adapter.adapterId,
      adapter.version,
    ]),
  )
  for (const [index, observation] of capture.observations.entries()) {
    if (
      registeredAdapters.get(observation.extraction?.adapterId)
      !== observation.extraction?.version
    ) {
      issues.push({
        code: 'SOURCE_ADAPTER_UNREGISTERED',
        path: `$.sourceCapture.observations[${index}].extraction`,
        message: 'Source observation does not bind one registered adapter version',
      })
    }
  }
  return issues
}

function validateDocxSourceBinding(parsed, capture, diagnostics) {
  if (parsed?.adapter !== 'docx-source-envelope') return
  if (parsed.value.profileInstructionSourceDigest !== parsed.sourceDocumentDigest) {
    diagnostics.push(diagnostic('DOCX_SOURCE_PROFILE_UNBOUND', 'incomplete_source', '$.sourceCapture.profileInstructionSourceDigest', 'DOCX source profile proof must bind the immutable DOCX digest'))
  }
  if (capture.observations.some(
    (observation) => observation.documentId !== parsed.sourceDocumentId,
  )) {
    diagnostics.push(diagnostic('DOCX_SOURCE_SPAN_UNBOUND', 'incomplete_source', '$.sourceCapture.observations', 'DOCX source facts may not resolve through supplemental or legacy documents'))
  }
}

function validateAnswerAssertions(capture, diagnostics) {
  const byQuestion = new Map()
  for (const assertion of capture.assertions.filter((item) => item.authority === 'official')) {
    const answers = byQuestion.get(assertion.questionId) || new Set()
    answers.add(assertion.answer)
    byQuestion.set(assertion.questionId, answers)
  }
  for (const [questionId, answers] of byQuestion) {
    if (answers.size > 1) diagnostics.push(diagnostic('OFFICIAL_ANSWER_CONFLICT', 'answer_conflict', '$.assertions', `Authoritative answers conflict for ${questionId}`))
  }
}

function validateAnswerCoverage(source, capture, diagnostics) {
  const officialQuestionIds = new Set(
    capture.assertions
      .filter((assertion) => assertion.authority === 'official')
      .map((assertion) => assertion.questionId),
  )
  for (const group of source.groups || []) {
    for (const questionId of group.questionIds || []) {
      if (!officialQuestionIds.has(questionId)) {
        diagnostics.push(diagnostic('OFFICIAL_ANSWER_MISSING', 'incomplete_source', '$.assertions', `Missing official answer evidence for ${questionId}`))
      }
    }
  }
}

export function validateExactTransformationRecords(records, capture, closure) {
  const diagnostics = []
  const legacyAuthority = closure.authorityRef.manifestVersion === '1'
  const registeredRules = new Map(closure.artifacts.normalization.rules.map((rule) => [`${rule.ruleId}@${rule.version}`, rule]))
  const sourceSpanIds = new Set(capture.sourceSpans.map((span) => span.sourceSpanId))
  const observationsById = new Map(capture.observations.map((observation) => [observation.observationId, observation]))
  let previousSequence = 0
  const recordIds = new Set()
  const accepted = []
  for (const [index, record] of (records || []).entries()) {
    const path = `$.transformations[${index}]`
    if (!isRecordValue(record) || !exactKeys(record, ['recordId', 'sequence', 'ruleId', 'ruleVersion', 'target', 'operation', 'inputSourceSpanIds', 'before', 'after', 'certainty', 'preconditions', 'outputDigest']) || typeof record.recordId !== 'string' || typeof record.ruleId !== 'string' || typeof record.ruleVersion !== 'string' || typeof record.operation !== 'string' || !isRecordValue(record.target) || !exactKeys(record.target, ['identity', 'path']) || typeof record.target.identity !== 'string' || typeof record.target.path !== 'string') {
      diagnostics.push(diagnostic('TRANSFORMATION_SHAPE_INVALID', 'needs_review', path, 'Transformation records are closed ledger entries'))
      continue
    }
    const rule = registeredRules.get(`${record.ruleId}@${record.ruleVersion}`)
    const proof = rule?.operationProofs?.[record.operation]
    if (record.certainty !== 'exact' || !rule || !rule.allowedOperations.includes(record.operation) || (!legacyAuthority && !proof)) {
      diagnostics.push(diagnostic('TRANSFORMATION_NOT_EXACT', 'needs_review', path, 'Only registered exact transformations can produce canonical semantics'))
      continue
    }
    if (legacyAuthority) {
      if (recordIds.has(record.recordId) || !Number.isInteger(record.sequence) || record.sequence <= previousSequence || !Array.isArray(record.inputSourceSpanIds) || record.inputSourceSpanIds.length === 0 || record.inputSourceSpanIds.some((id) => !sourceSpanIds.has(id)) || record.outputDigest !== digestJson(record.after)) {
        diagnostics.push(diagnostic('TRANSFORMATION_CLOSURE_INVALID', 'needs_review', path, 'Transformation sequence, lineage, or output digest cannot be replayed'))
        continue
      }
      previousSequence = record.sequence
      recordIds.add(record.recordId)
      accepted.push(cloneJson(record))
      continue
    }
    const observationIds = record.preconditions?.sourceObservationIds
    const observations = Array.isArray(observationIds) ? observationIds.map((observationId) => observationsById.get(observationId)) : []
    const expectedPreconditions = observations.length === proof.observationArity && observations.every(Boolean)
      ? {
          sourceObservationIds: [...observationIds],
          sourceValueDigests: observations.map((observation) => digestJson(observation.value)),
        }
      : null
    const expectedSpanIds = observations.every(Boolean)
      ? observations.map((observation) => observation.sourceSpanId)
      : []
    const structuralTokenizationProof = record.operation === 'structural_tokenization'
      && observations.length === 1
      && observations[0]
      && record.target.path === 'content.blocks'
      && record.target.identity === observations[0].value?.groupId
      && stableStringify(record.before) === stableStringify(observations[0].value?.passage?.paragraphs)
      && stableStringify(record.after) === stableStringify(referenceContent(observations[0].value).blocks)
    const sourceIdentityProof = proof.kind === 'source_identity'
      && observations.length === 1
      && observations[0]
      && (record.operation === 'structural_tokenization'
        ? structuralTokenizationProof
        : stableStringify(record.before) === stableStringify(observations[0].value) && stableStringify(record.after) === stableStringify(observations[0].value))
    const joinValue = expectedPreconditions && { sourceObservationIds: expectedPreconditions.sourceObservationIds, sourceValueDigests: expectedPreconditions.sourceValueDigests }
    const uniqueJoinProof = proof.kind === 'unique_observation_join' && observations.length === 2 && new Set(observationIds).size === 2 && stableStringify(record.before) === stableStringify(joinValue) && stableStringify(record.after) === stableStringify(joinValue) && isRecordValue(record.target) && exactKeys(record.target, ['identity', 'path']) && record.target.path === 'source_join' && record.target.identity === stableId('source-join', joinValue)
    const correctionEvidence = observations[0]?.value
    const correctionRecord = correctionEvidence?.transformationRecord
    const profileInstructionCorrectionProof = (
      proof.kind === 'profile_instruction_correction'
      && observations.length === 1
      && observations[0]?.kind === 'profile_instruction_correction'
      && correctionEvidence?.schemaVersion
        === 'profile-writing-source-evidence-v1'
      && correctionEvidence?.profileId === 'nck1'
      && correctionEvidence?.instruction?.instructionId
        === 'writing.continuation.prompt'
      && record.target.identity
        === 'profile:nck1:instruction:writing.continuation.prompt'
      && record.target.path
        === 'instructions.writing.continuation.prompt.text'
      && record.ruleId === correctionRecord?.ruleId
      && record.ruleVersion === correctionRecord?.ruleVersion
      && record.certainty === correctionRecord?.certainty
      && record.before === correctionRecord?.before
      && record.after === correctionRecord?.after
      && record.after === correctionEvidence?.instruction?.text
    )
    const visibleTypographyProof = (
      proof.kind === 'registered_exact_typography'
      && observations.length === 1
      && observations[0]?.kind === 'canonical_visible_typography_source'
      && record.ruleId === 'canonical-visible-typography'
      && record.ruleVersion === rule.version
      && record.operation === 'canonical_visible_typography'
      && record.target.identity === observations[0]?.value?.nodeId
      && record.target.path === 'content.text'
      && record.before === observations[0]?.value?.text
      && record.after !== record.before
      && record.after === replayCanonicalVisibleTypography(
        record.before,
        record.ruleVersion,
      )
    )
    const exactProof = expectedPreconditions && stableStringify(record.preconditions) === stableStringify(expectedPreconditions) && stableStringify(record.inputSourceSpanIds) === stableStringify(expectedSpanIds) && (sourceIdentityProof || uniqueJoinProof || profileInstructionCorrectionProof || visibleTypographyProof)
    if (recordIds.has(record.recordId) || !Number.isInteger(record.sequence) || record.sequence <= previousSequence || !Array.isArray(record.inputSourceSpanIds) || record.inputSourceSpanIds.length === 0 || record.inputSourceSpanIds.some((id) => !sourceSpanIds.has(id)) || record.outputDigest !== digestJson(record.after) || !exactProof) {
      diagnostics.push(diagnostic('TRANSFORMATION_CLOSURE_INVALID', 'needs_review', path, `Transformation ${record.recordId || '(unidentified)'} sequence, lineage, or output digest cannot be replayed`))
      continue
    }
    previousSequence = record.sequence
    recordIds.add(record.recordId)
    accepted.push(cloneJson(record))
  }
  return { diagnostics, records: accepted }
}

function collectRichTargetIds(content) {
  return collectRichContentTargets(content)
}

function collectReadingTargetIds(variant) {
  if (variant?.family !== 'reading') return []
  return [
    ...(variant.questions || []).flatMap((question) => [
      { kind: 'content_node', id: question?.stem?.[0]?.nodeId },
    ]),
    ...(variant.choiceOwnership?.sets || []).flatMap((set) => (set.options || []).flatMap((option) => [
      { kind: 'option', id: option.optionId },
      ...(option.content || []).map((inline) => ({ kind: 'content_node', id: inline.nodeId })),
    ])),
  ].filter((target) => typeof target.id === 'string')
}

function collectGrammarFillTargetIds(variant) {
  if (variant?.family !== 'grammar-fill') return []
  return (variant.promptBindings || []).map((binding) => ({
    kind: 'prompt_provision',
    id: binding.blankId,
  }))
}

function collectApplicationWritingTargetIds(variant) {
  if (variant?.family !== 'application-writing') return []
  if (variant.mode === 'legacy_opaque') {
    return [{ kind: 'writing_task', id: variant.writingTaskId }]
  }
  return [
    { kind: 'writing_task', id: variant.writingTaskId },
    { kind: 'word_ruling', id: variant.wordCountRuling?.authorityObservationRef },
    { kind: 'response_binding', id: variant.response?.authorityObservationRef },
    ...(variant.contentRequirements || []).map((requirement) => ({ kind: 'requirement', id: requirement.requirementId })),
    ...(variant.givenSkeleton?.presence === 'provided'
      ? variant.givenSkeleton.parts.map((part) => ({ kind: 'given_part', id: part.givenPartId }))
      : [{ kind: 'given_absence', id: variant.givenSkeleton?.answerRegionAbsenceAssertionRef }]),
  ].filter((target) => typeof target.id === 'string')
}

function collectContinuationWritingTargetIds(variant) {
  if (variant?.family !== 'continuation-writing') return []
  if (variant.mode === 'legacy_opaque') {
    return [{ kind: 'writing_task', id: variant.writingTaskId }]
  }
  return [
    { kind: 'writing_task', id: variant.writingTaskId },
    ...(variant.sourceInstruction
      ? [{
          kind: 'source_instruction',
          id: variant.sourceInstruction.instructionId,
        }]
      : []),
    { kind: 'word_ruling', id: variant.wordCountRuling?.authorityObservationRef },
    { kind: 'response_binding', id: variant.response?.authorityObservationRef },
    ...(variant.starterProvision?.kind === 'ordered_source_starters'
      ? variant.starterProvision.starters.map((starter) => ({ kind: 'starter', id: starter.starterId }))
      : [{ kind: 'starter_absence', id: variant.starterProvision?.absenceAssertionRef }]),
  ].filter((target) => typeof target.id === 'string')
}

function applicationWritingSourceSpanRefs(variant, content, capture, target) {
  if (variant?.family !== 'application-writing') return null
  if (variant.mode === 'legacy_opaque') return null
  const observationRef = target.kind === 'word_ruling'
    ? variant.wordCountRuling?.authorityObservationRef
    : target.kind === 'response_binding'
      ? variant.response?.authorityObservationRef
      : target.kind === 'given_absence'
        ? variant.givenSkeleton?.answerRegionAbsenceAssertionRef
        : null
  if (observationRef && target.id === observationRef) {
    const observation = capture.observations.find((candidate) => candidate.observationId === observationRef)
    return observation ? [observation.sourceSpanId] : null
  }
  if (target.kind === 'content_node') {
    const wordBlock = content?.blocks?.find((candidate) => candidate.nodeId === variant.wordCountRuling?.sourceRef?.blockId)
    const belongsToWordRuling = target.id === wordBlock?.nodeId
      || wordBlock?.inlines?.some((inline) => inline.nodeId === target.id)
    if (belongsToWordRuling) {
      const observation = capture.observations.find((candidate) => candidate.observationId === variant.wordCountRuling.authorityObservationRef)
      if (observation) return [observation.sourceSpanId]
    }
  }
  if (variant.givenSkeleton?.presence === 'provided') {
    for (const part of variant.givenSkeleton.parts) {
      const block = content?.blocks?.find((candidate) => candidate.nodeId === part.blockRef)
      const targetBelongsToPart = (target.kind === 'given_part' && target.id === part.givenPartId)
        || (target.kind === 'content_node' && (target.id === part.blockRef || block?.inlines?.some((inline) => inline.nodeId === target.id)))
      if (!targetBelongsToPart) continue
      const observation = capture.observations.find((candidate) => candidate.observationId === part.authorityAssertionRef)
      return observation ? [observation.sourceSpanId] : null
    }
  }
  return null
}

function continuationWritingSourceSpanRefs(variant, content, capture, target) {
  if (variant?.family !== 'continuation-writing') return null
  if (variant.mode === 'legacy_opaque') return null
  const observationRef = target.kind === 'source_instruction'
    && target.id === variant.sourceInstruction?.instructionId
    ? variant.sourceInstruction.authorityObservationRef
    : target.kind === 'word_ruling'
      ? variant.wordCountRuling?.authorityObservationRef
      : target.kind === 'response_binding'
        ? variant.response?.authorityObservationRef
        : target.kind === 'starter_absence'
          ? variant.starterProvision?.absenceAssertionRef
          : null
  if (
    observationRef
    && (
      target.kind === 'source_instruction'
      || target.id === observationRef
    )
  ) {
    const observation = capture.observations.find((candidate) => candidate.observationId === observationRef)
    return observation ? [observation.sourceSpanId] : null
  }
  for (const starter of variant.starterProvision?.starters || []) {
    const block = content?.blocks?.find((candidate) => candidate.nodeId === starter.contentRef)
    const belongsToStarter = (target.kind === 'starter' && target.id === starter.starterId)
      || (target.kind === 'content_node' && (target.id === starter.contentRef || block?.inlines?.some((inline) => inline.nodeId === target.id)))
    if (!belongsToStarter) continue
    const observation = capture.observations.find((candidate) => candidate.observationId === starter.authorityObservationRef)
    return observation ? [observation.sourceSpanId] : null
  }
  return null
}

function validateInlines(inlines, blankIds, path, diagnostics, ids, {
  allowMediaRefs = false,
  mediaIds = new Set(),
} = {}) {
  if (!Array.isArray(inlines)) {
    diagnostics.push(diagnostic('RICH_INLINE_INVALID', 'needs_review', path, 'Inlines must be ordered'))
    return
  }
  for (const [index, inline] of inlines.entries()) {
    const inlinePath = `${path}[${index}]`
    const validShape = isRecordValue(inline)
      && typeof inline.nodeId === 'string'
      && (
        (inline.kind === 'text'
          && exactKeys(inline, ['kind', 'nodeId', 'text'])
          && typeof inline.text === 'string')
        || (inline.kind === 'blank_ref'
          && exactKeys(inline, ['kind', 'nodeId', 'blankId'])
          && typeof inline.blankId === 'string')
        || (allowMediaRefs
          && inline.kind === 'media_ref'
          && exactKeys(inline, ['kind', 'nodeId', 'mediaId', 'alt'])
          && typeof inline.mediaId === 'string'
          && typeof inline.alt === 'string')
      )
    if (!validShape) {
      diagnostics.push(diagnostic(
        'RICH_INLINE_SHAPE',
        'needs_review',
        inlinePath,
        allowMediaRefs
          ? 'Only literal text, semantic blank refs, and resolved table media refs are allowed'
          : 'Only literal text and semantic blank refs are allowed',
      ))
      continue
    }
    if (ids.has(inline.nodeId)) diagnostics.push(diagnostic('RICH_NODE_DUPLICATE', 'needs_review', inlinePath, 'Rich node ids must be unique'))
    ids.add(inline.nodeId)
    if (inline.kind === 'blank_ref' && !blankIds.has(inline.blankId)) diagnostics.push(diagnostic('RICH_BLANK_UNRESOLVED', 'needs_review', inlinePath, 'Blank ref is not declared by the group'))
    if (inline.kind === 'media_ref' && !mediaIds.has(inline.mediaId)) diagnostics.push(diagnostic('RICH_MEDIA_UNRESOLVED', 'needs_review', inlinePath, 'Table media ref is not declared by the group'))
  }
}

function validateRichBlock(block, path, blankIds, mediaIds, diagnostics, ids, allowedKinds, richTableV1 = false) {
  if (!isRecordValue(block) || typeof block.kind !== 'string' || typeof block.nodeId !== 'string' || ids.has(block.nodeId)) {
    diagnostics.push(diagnostic('RICH_BLOCK_INVALID', 'needs_review', path, 'Blocks need unique identities'))
    return
  }
  ids.add(block.nodeId)
  if (!allowedKinds.includes(block.kind)) {
    diagnostics.push(diagnostic(
      'RICH_BLOCK_UNSUPPORTED',
      'unsupported',
      path,
      allowedKinds.includes(FRAMED_COLUMNS_KIND)
        ? 'Only paragraph, table, figure, and framed_columns blocks are representable'
        : 'framed_columns children may only be paragraph or table',
    ))
    return
  }
  if (block.kind === 'paragraph') {
    if (!exactKeys(block, ['kind', 'nodeId', 'inlines'])) diagnostics.push(diagnostic('RICH_BLOCK_SHAPE', 'needs_review', path, 'Paragraph fields are closed'))
    validateInlines(block.inlines, blankIds, `${path}.inlines`, diagnostics, ids)
    return
  }
  if (block.kind === 'figure') {
    if (!exactKeys(block, ['kind', 'nodeId', 'mediaId', 'caption']) || !mediaIds.has(block.mediaId)) diagnostics.push(diagnostic('RICH_FIGURE_INVALID', 'unsupported', path, 'Figures need resolved captured media and no layout fields'))
    validateInlines(block.caption, blankIds, `${path}.caption`, diagnostics, ids)
    return
  }
  if (block.kind === 'table') {
    if (!exactKeys(block, ['kind', 'nodeId', 'columnCount', 'rows']) || !Number.isInteger(block.columnCount) || block.columnCount < 1 || !Array.isArray(block.rows)) {
      diagnostics.push(diagnostic('RICH_TABLE_INVALID', 'needs_review', path, 'Tables need a rectangular semantic grid'))
      return
    }
    const activeRowSpans = new Map()
    for (const [rowIndex, row] of block.rows.entries()) {
      if (!isRecordValue(row) || !exactKeys(row, ['rowId', 'cells']) || !Array.isArray(row.cells)) {
        diagnostics.push(diagnostic('RICH_TABLE_ROW_INVALID', 'needs_review', `${path}.rows[${rowIndex}]`, 'Table rows are closed'))
        continue
      }
      const occupied = new Set(activeRowSpans.keys())
      for (const [cellIndex, cell] of row.cells.entries()) {
        if (!isRecordValue(cell) || !exactKeys(cell, ['cellId', 'columnStart', 'columnSpan', 'rowSpan', 'role', 'inlines']) || !Number.isInteger(cell.columnStart) || cell.columnStart < 0 || !Number.isInteger(cell.columnSpan) || cell.columnSpan < 1 || cell.columnStart + cell.columnSpan > block.columnCount || !Number.isInteger(cell.rowSpan) || cell.rowSpan < 1 || !['header', 'data'].includes(cell.role)) {
          diagnostics.push(diagnostic('RICH_TABLE_CELL_INVALID', 'needs_review', `${path}.rows[${rowIndex}].cells[${cellIndex}]`, 'Table cells must establish a rectangular grid'))
          continue
        }
        if (!richTableV1 && cell.rowSpan !== 1) diagnostics.push(diagnostic('RICH_TABLE_CELL_INVALID', 'needs_review', `${path}.rows[${rowIndex}].cells[${cellIndex}].rowSpan`, 'Operative row spans require rich-content-v1 authority'))
        for (let column = cell.columnStart; column < cell.columnStart + cell.columnSpan; column += 1) {
          if (occupied.has(column)) diagnostics.push(diagnostic('RICH_TABLE_CELL_INVALID', 'needs_review', `${path}.rows[${rowIndex}].cells[${cellIndex}]`, 'Table cells and row spans cannot overlap'))
          occupied.add(column)
          if (cell.rowSpan > 1) activeRowSpans.set(column, cell.rowSpan)
        }
        validateInlines(
          cell.inlines,
          blankIds,
          `${path}.rows[${rowIndex}].cells[${cellIndex}].inlines`,
          diagnostics,
          ids,
          { allowMediaRefs: richTableV1, mediaIds },
        )
      }
      if (occupied.size !== block.columnCount) diagnostics.push(diagnostic('RICH_TABLE_NOT_RECTANGULAR', 'needs_review', `${path}.rows[${rowIndex}]`, 'Cells do not cover the declared columns'))
      for (const [column, remaining] of [...activeRowSpans]) {
        if (remaining <= 1) activeRowSpans.delete(column)
        else activeRowSpans.set(column, remaining - 1)
      }
    }
    if (activeRowSpans.size > 0) diagnostics.push(diagnostic('RICH_TABLE_NOT_RECTANGULAR', 'needs_review', path, 'Table row span exceeds the final row'))
    return
  }
  if (block.columnCount !== FRAMED_COLUMNS_COLUMN_COUNT || !Array.isArray(block.columns) || block.columns.length !== FRAMED_COLUMNS_COLUMN_COUNT) {
    diagnostics.push(diagnostic('RICH_BLOCK_UNSUPPORTED', 'unsupported', path, 'framed_columns v1 requires exactly two columns'))
    return
  }
  if (!exactKeys(block, ['kind', 'nodeId', 'columnCount', 'columns'])) {
    diagnostics.push(diagnostic('RICH_BLOCK_SHAPE', 'needs_review', path, 'framed_columns fields are closed'))
    return
  }
  for (const [columnIndex, column] of block.columns.entries()) {
    const columnPath = `${path}.columns[${columnIndex}]`
    if (
      !isRecordValue(column)
      || typeof column.columnId !== 'string'
      || !Array.isArray(column.blocks)
      || column.blocks.length === 0
      || (Object.hasOwn(column, 'columnHeading')
        ? !exactKeys(column, ['columnId', 'columnHeading', 'blocks'])
        : !exactKeys(column, ['columnId', 'blocks']))
    ) {
      diagnostics.push(diagnostic('RICH_BLOCK_SHAPE', 'needs_review', columnPath, 'framed_columns columns are closed'))
      continue
    }
    if (ids.has(column.columnId)) diagnostics.push(diagnostic('RICH_NODE_DUPLICATE', 'needs_review', `${columnPath}.columnId`, 'Rich node ids must be unique'))
    ids.add(column.columnId)
    if (Object.hasOwn(column, 'questions') || column.blocks.some((child) => isQuestionLikeRichBlock(child))) {
      diagnostics.push(diagnostic('RICH_BLOCK_UNSUPPORTED', 'unsupported', columnPath, 'Questions cannot live inside framed_columns'))
    }
    if (Object.hasOwn(column, 'columnHeading') && typeof column.columnHeading !== 'string') {
      diagnostics.push(diagnostic('RICH_FRAMED_COLUMNS_HEADING_INVALID', 'needs_review', `${columnPath}.columnHeading`, 'columnHeading must be a paragraph nodeId in the same column'))
    }
    for (const [childIndex, child] of column.blocks.entries()) {
      validateRichBlock(
        child,
        `${columnPath}.blocks[${childIndex}]`,
        blankIds,
        mediaIds,
        diagnostics,
        ids,
        FRAMED_COLUMNS_CHILD_KINDS,
        richTableV1,
      )
    }
    if (Object.hasOwn(column, 'columnHeading')) {
      const heading = framedColumnsHeadingBlock(column)
      if (!heading || heading.kind !== 'paragraph') {
        diagnostics.push(diagnostic('RICH_FRAMED_COLUMNS_HEADING_INVALID', 'needs_review', `${columnPath}.columnHeading`, 'columnHeading must point at a paragraph in the same column'))
      }
    }
  }
}

function validateRichContent(content, blankIds, mediaIds, richTableV1 = false) {
  const diagnostics = []
  const ids = new Set()
  if (!isRecordValue(content) || !exactKeys(content, ['blocks']) || !Array.isArray(content.blocks)) {
    return [diagnostic('RICH_CONTENT_INVALID', 'needs_review', '$.content', 'Rich content must be a closed block document')]
  }
  for (const [index, block] of content.blocks.entries()) {
    validateRichBlock(
      block,
      `$.content.blocks[${index}]`,
      blankIds,
      mediaIds,
      diagnostics,
      ids,
      [ 'paragraph', 'table', 'figure', FRAMED_COLUMNS_KIND ],
      richTableV1,
    )
  }
  return diagnostics
}

function validateChoiceOwnership(choiceOwnership, questionIds, expectedOwnership) {
  const diagnostics = []
  if (!isRecordValue(choiceOwnership) || choiceOwnership.ownership !== expectedOwnership) {
    return [diagnostic('CHOICE_OWNERSHIP_INVALID', 'needs_review', '$.variant.choiceOwnership', 'Choice ownership must match its family contract')]
  }
  if (expectedOwnership === 'none') {
    if (!exactKeys(choiceOwnership, ['ownership'])) diagnostics.push(diagnostic('CHOICE_OWNERSHIP_SHAPE', 'needs_review', '$.variant.choiceOwnership', 'Non-choice families cannot carry option fields'))
  } else if (expectedOwnership === 'shared_bank') {
    if (!exactKeys(choiceOwnership, ['ownership', 'bankId', 'options']) || !Array.isArray(choiceOwnership.options) || choiceOwnership.options.length === 0) diagnostics.push(diagnostic('SHARED_BANK_INVALID', 'needs_review', '$.variant.choiceOwnership', 'A shared bank is group-owned and closed'))
  } else {
    if (!exactKeys(choiceOwnership, ['ownership', 'sets']) || !Array.isArray(choiceOwnership.sets)) diagnostics.push(diagnostic('PER_QUESTION_OPTIONS_INVALID', 'needs_review', '$.variant.choiceOwnership', 'Per-question choices require closed sets'))
    else {
      const setIds = choiceOwnership.sets.map((set) => set.questionId)
      if (new Set(setIds).size !== setIds.length || setIds.length !== questionIds.length || setIds.some((questionId) => !questionIds.includes(questionId))) diagnostics.push(diagnostic('PER_QUESTION_OPTIONS_COVERAGE', 'needs_review', '$.variant.choiceOwnership', 'Choice sets must cover each question exactly once'))
    }
  }
  return diagnostics
}

function validateReferenceBlankClosure(familyId, questionIds, blankIds, content) {
  if (!['cloze', 'grammar-fill'].includes(familyId)) return []
  const diagnostics = []
  if (questionIds.length !== blankIds.length) {
    diagnostics.push(diagnostic('REFERENCE_BLANK_CARDINALITY', 'needs_review', '$.blankIds', 'Cloze and Grammar Fill require one Blank for every Question'))
  }
  const occurrences = new Map(blankIds.map((blankId) => [blankId, 0]))
  forEachRichInline(content, (inline) => {
    if (inline?.kind === 'blank_ref' && occurrences.has(inline.blankId)) occurrences.set(inline.blankId, occurrences.get(inline.blankId) + 1)
    if (inline?.kind === 'text' && /__\d+__/.test(inline.text)) {
      diagnostics.push(diagnostic('REFERENCE_MARKER_AMBIGUOUS', 'needs_review', '$.content', 'Source Blank markers must be resolved to semantic Blank refs'))
    }
  })
  if ([...occurrences.values()].some((count) => count !== 1)) {
    diagnostics.push(diagnostic('REFERENCE_BLANK_OCCURRENCE', 'needs_review', '$.content', 'Every Cloze and Grammar Fill Blank must occur exactly once in semantic content'))
  }
  return diagnostics
}

function validateGrammarFillPromptBindings(
  blankIds,
  content,
  variant,
  capture,
  evidenceSchema,
) {
  return validateGrammarFillPromptContract({
    blankIds,
    content,
    variant,
    sourceCapture: capture,
    promptProvisionSchema: evidenceSchema,
  }).map((issue) => diagnostic(
    issue.code,
    'needs_review',
    issue.path,
    issue.message,
  ))
}

function buildGroupArtifact(sourceGroup, capture, closure, acceptedRecords) {
  const diagnostics = []
  const family = closure.families.get(sourceGroup?.family)
  if (!family) return { diagnostics: [diagnostic('GROUP_FAMILY_UNSUPPORTED', 'unsupported', '$.groups', 'Group family is not represented by the authority')], artifact: null }
  if (!isRecordValue(sourceGroup) || typeof sourceGroup.groupId !== 'string' || typeof sourceGroup.slotId !== 'string' || !Array.isArray(sourceGroup.questionIds) || !Array.isArray(sourceGroup.blankIds) || typeof sourceGroup.sourceSpanId !== 'string') {
    return { diagnostics: [diagnostic('GROUP_SOURCE_INVALID', 'incomplete_source', '$.groups', 'A group needs identity, slot, ordered refs, and direct source span')], artifact: null }
  }
  const sourceSpanIds = new Set(capture.sourceSpans.map((span) => span.sourceSpanId))
  if (!sourceSpanIds.has(sourceGroup.sourceSpanId)) diagnostics.push(diagnostic('GROUP_SOURCE_UNRESOLVED', 'incomplete_source', '$.groups', 'Group does not resolve to a captured source span'))
  if (new Set(sourceGroup.questionIds).size !== sourceGroup.questionIds.length || new Set(sourceGroup.blankIds).size !== sourceGroup.blankIds.length) diagnostics.push(diagnostic('GROUP_MEMBER_DUPLICATE', 'needs_review', '$.groups', 'Question and Blank identities are unique'))
  const media = cloneJson(sourceGroup.media || []).map((item) => ({
    ...item,
    sourceArtifactRef: {
      captureId: capture.captureId,
      artifactId: item?.sourceArtifactRef?.artifactId,
    },
  }))
  const mediaIds = new Set()
  const capturedArtifacts = new Map(capture.documents.map((document) => [document.immutableArtifactRef?.artifactId, document]))
  for (const [index, item] of media.entries()) {
    const captured = capturedArtifacts.get(item?.sourceArtifactRef?.artifactId)
    if (
      !isRecordValue(item)
      || !exactKeys(item, ['mediaId', 'mimeType', 'sha256', 'pixelWidth', 'pixelHeight', 'sourceArtifactRef'])
      || mediaIds.has(item.mediaId)
      || typeof item.mimeType !== 'string'
      || typeof item.sha256 !== 'string'
      || !Number.isInteger(item.pixelWidth)
      || item.pixelWidth < 1
      || !Number.isInteger(item.pixelHeight)
      || item.pixelHeight < 1
      || !captured
      || captured.sha256 !== item.sha256
    ) diagnostics.push(diagnostic('MEDIA_INVALID', 'incomplete_source', `$.groups.media[${index}]`, 'Media must close immutable bytes, digest, dimensions, and source artifact identity'))
    mediaIds.add(item.mediaId)
  }
  const content = cloneJson(sourceGroup.content || { blocks: [] })
  diagnostics.push(...validateRichContent(
    content,
    new Set(sourceGroup.blankIds),
    mediaIds,
    ['46', '47', '48', '49', '50', '51', '52'].includes(closure.authorityRef.manifestVersion),
  ))
  if (family.familyContractId !== 'reading' && contentHasFramedColumns(content)) {
    diagnostics.push(diagnostic('RICH_BLOCK_UNSUPPORTED', 'unsupported', '$.content', 'framed_columns is only representable in Reading'))
  }
  diagnostics.push(...validateReferenceBlankClosure(family.familyContractId, sourceGroup.questionIds, sourceGroup.blankIds, content))
  const variant = cloneJson(sourceGroup.variant || {})
  const variantKeys = family.familyContractId === 'seven-choices'
    ? ['47', '48', '49', '50', '51', '52'].includes(closure.authorityRef.manifestVersion)
      ? ['family', 'passageBlockRoles', 'members', 'choiceOwnership']
      : ['family', 'members', 'choiceOwnership']
    : family.familyContractId === 'reading'
      ? ['family', 'passageBlockRoles', 'questions', 'choiceOwnership']
      : family.familyContractId === 'listening'
        ? ['family', 'questions', 'transcriptSegments', 'choiceOwnership',
            ...(variant.firstSectionPlayback === undefined ? [] : ['firstSectionPlayback'])]
      : family.familyContractId === 'application-writing'
        ? variant.mode === 'legacy_opaque'
          ? ['family', 'mode', 'writingTaskId', 'sourceTaskType', 'contentBlockRefs', 'wordCountTarget', 'wordCountTargetCertainty', 'wordCountScope', 'choiceOwnership', 'response']
          : ['family', 'writingTaskId', 'promptBlockRefs', 'situation', 'contentRequirements', 'wordCountRuling', 'givenSkeleton', 'choiceOwnership', 'response']
      : family.familyContractId === 'continuation-writing'
        ? variant.mode === 'legacy_opaque'
          ? ['family', 'mode', 'writingTaskId', 'sourceTaskType', 'contentBlockRefs', 'sourceStarterBlockRefs', 'wordCountTarget', 'wordCountTargetCertainty', 'wordCountScope', 'choiceOwnership', 'response']
          : [
              'family',
              'writingTaskId',
              ...(family.variantSchemaId
                === 'canonical-continuation-writing-variant-v3'
                ? ['sourceInstruction']
                : []),
              'materialBlockRefs',
              'wordCountRuling',
              'starterProvision',
              'choiceOwnership',
              'response',
            ]
      : family.familyContractId === 'grammar-fill'
        && Number(family.version) >= 2
        ? ['family', 'promptBindings', 'choiceOwnership']
      : ['family', 'choiceOwnership']
  if (!exactKeys(variant, variantKeys) || variant.family !== family.familyContractId) diagnostics.push(diagnostic('GROUP_VARIANT_INVALID', 'needs_review', '$.groups.variant', 'Variant family must match the closed contract'))
  if (family.variantSchemaId) {
    const variantSchema = closure.schemas[family.variantSchemaId]
    const variantSchemaIssues = variantSchema ? validateJsonSchema(variant, variantSchema, '$.groups.variant') : [{ code: 'APPLICATION_VARIANT_SCHEMA_MISSING', path: '$.groups.variant', message: 'Family variant schema is unavailable' }]
    diagnostics.push(...variantSchemaIssues.map((item) => diagnostic(item.code, 'needs_review', item.path, item.message)))
  }
  diagnostics.push(...validateChoiceOwnership(variant.choiceOwnership, sourceGroup.questionIds, family.choiceOwnership))
  if (family.familyContractId === 'grammar-fill' && Number(family.version) >= 2) {
    diagnostics.push(
      ...validateGrammarFillPromptBindings(
        sourceGroup.blankIds,
        content,
        variant,
        capture,
        closure.schemas[family.promptProvisionSchemaId],
      ),
    )
  }
  if (family.familyContractId === 'seven-choices') {
    diagnostics.push(...validateSevenChoicesContract({
      groupId: sourceGroup.groupId,
      questionIds: sourceGroup.questionIds,
      blankIds: sourceGroup.blankIds,
      content,
      variant,
      assertions: capture.assertions,
      allowPassageBlockRoles:
        ['47', '48', '49', '50', '51', '52'].includes(closure.authorityRef.manifestVersion),
    }).map((item) => diagnostic(item.code, item.disposition, item.path, item.message)))
  }
  if (family.familyContractId === 'reading') {
    diagnostics.push(...validateReadingContract({
      questionIds: sourceGroup.questionIds,
      blankIds: sourceGroup.blankIds,
      content,
      media,
      variant,
      assertions: capture.assertions,
      allowFigureOptions: family.optionModes?.includes('figure') === true,
    }).map((item) => diagnostic(item.code, item.disposition, item.path, item.message)))
  }
  if (family.familyContractId === 'listening') {
    diagnostics.push(...validateListeningContract({
      questionIds: sourceGroup.questionIds,
      blankIds: sourceGroup.blankIds,
      content,
      variant,
      assertions: capture.assertions,
    }).map((item) => diagnostic(item.code, item.disposition, item.path, item.message)))
  }
  if (family.familyContractId === 'application-writing') {
    diagnostics.push(...validateApplicationWritingContract({
      groupId: sourceGroup.groupId,
      questionIds: sourceGroup.questionIds,
      blankIds: sourceGroup.blankIds,
      content,
      variant,
      sourceCapture: capture,
    }).map((item) => diagnostic(item.code, item.disposition, item.path, item.message)))
  }
  if (family.familyContractId === 'continuation-writing') {
    diagnostics.push(...validateContinuationWritingContract({
      groupId: sourceGroup.groupId,
      profileId: sourceGroup.profileId,
      questionIds: sourceGroup.questionIds,
      blankIds: sourceGroup.blankIds,
      content,
      variant,
      sourceCapture: capture,
    }).map((item) => diagnostic(item.code, item.disposition, item.path, item.message)))
  }
  if (diagnostics.length > 0) return { diagnostics, artifact: null }
  const artifactBase = {
    schemaVersion:
      closure.artifacts.core?.groupSchemaId
        || 'canonical-question-group-v1',
    identity: { paperId: sourceGroup.paperId || null, groupId: sourceGroup.groupId },
    contractRef: {
      manifestId: closure.authorityRef.manifestId,
      manifestVersion: closure.authorityRef.manifestVersion,
      manifestDigest: closure.authorityRef.manifestDigest,
      familyContractId: family.familyContractId,
      familyContractVersion: family.version,
      familyContractDigest: digestJson(family),
    },
    questionRefs: sourceGroup.questionIds.map((questionId) => ({ questionId })),
    blankRefs: sourceGroup.blankIds.map((blankId) => ({ blankId })),
    content,
    media,
    variant,
  }
  const targetEntries = [
    { target: { kind: 'group', id: sourceGroup.groupId } },
    ...sourceGroup.questionIds.map((id) => ({ target: { kind: 'question', id } })),
    ...sourceGroup.blankIds.map((id) => ({ target: { kind: 'blank', id } })),
    ...media.map((item) => ({ target: { kind: 'media', id: item.mediaId } })),
    ...collectRichTargetIds(content).map((entry) => ({ target: entry })),
    ...collectReadingTargetIds(variant).map((entry) => ({ target: entry })),
    ...collectListeningTargets(variant).map((entry) => ({ target: entry })),
    ...collectGrammarFillTargetIds(variant).map((entry) => ({ target: entry })),
    ...collectApplicationWritingTargetIds(variant).map((entry) => ({ target: entry })),
    ...collectContinuationWritingTargetIds(variant).map((entry) => ({ target: entry })),
  ].filter((entry, index, entries) => entries.findIndex((candidate) => candidate.target.kind === entry.target.kind && candidate.target.id === entry.target.id) === index)
  const sourceMap = {
    captureId: capture.captureId,
    entries: targetEntries.map((entry) => ({
      ...entry,
      sourceSpanRefs: applicationWritingSourceSpanRefs(variant, content, capture, entry.target)
        || continuationWritingSourceSpanRefs(variant, content, capture, entry.target)
        || sourceGroup.sourceSpanRefsByTarget?.[`${entry.target.kind}:${entry.target.id}`]
        || [sourceGroup.sourceSpanId],
      transformationRecordIds: sourceGroup.transformationRecordIdsByTarget?.[`${entry.target.kind}:${entry.target.id}`]
        || acceptedRecords.filter((record) => record.target?.identity === sourceGroup.groupId).map((record) => record.recordId),
    })),
  }
  const groupSpanIds = [...new Set(sourceMap.entries.flatMap((entry) => entry.sourceSpanRefs))]
  const sourceFingerprint = digestJson({
    captureDigest: capture.digest,
    sourceSpanId: groupSpanIds[0],
    recordIds: sourceMap.entries.flatMap((entry) => entry.transformationRecordIds),
  })
  const semanticDigest = digestJson(artifactBase)
  const artifact = { ...artifactBase, sourceMap, sourceFingerprint, semanticDigest }
  diagnostics.push(...validateJsonSchema(
    artifact,
    closure.schemas[artifact.schemaVersion],
    '$.group',
  ))
  return { diagnostics, artifact }
}

function questionCardinalityMatches(rule, count) {
  return rule?.kind === 'exact'
    ? count === rule.count
    : rule?.kind === 'one_of'
      ? rule.counts.includes(count)
      : false
}

function scoreTotalForBoundSlot(slot, group, diagnostics) {
  const rule = slot.scoringRule
  if (!isRecordValue(rule)) {
    diagnostics.push(diagnostic('PROFILE_SCORING_RULE_INVALID', 'needs_review', `$.profile.slots.${slot.slotId}.scoringRule`, 'Bound profile slot has no closed scoring rule'))
    return null
  }
  if (rule.kind === 'group_total') {
    if (!Number.isFinite(rule.total)) {
      diagnostics.push(diagnostic('PROFILE_SCORING_RULE_INVALID', 'needs_review', `$.profile.slots.${slot.slotId}.scoringRule.total`, 'Group-total scoring requires one finite total'))
      return null
    }
    return rule.total
  }
  if (rule.kind !== 'per_question' || !Number.isFinite(rule.points)) {
    diagnostics.push(diagnostic('PROFILE_SCORING_RULE_INVALID', 'needs_review', `$.profile.slots.${slot.slotId}.scoringRule`, 'Per-question scoring requires one finite point value'))
    return null
  }
  if (!group) {
    if (!Number.isFinite(rule.total)) {
      diagnostics.push(diagnostic('PROFILE_SCORING_RULE_INVALID', 'needs_review', `$.profile.slots.${slot.slotId}.scoringRule.total`, 'Unbound per-question scoring requires one static total'))
      return null
    }
    return rule.total
  }
  const derivedTotal = rule.points * group.questionRefs.length
  if (Object.hasOwn(rule, 'total') && rule.total !== derivedTotal) {
    diagnostics.push(diagnostic('GROUP_SCORE_MISMATCH', 'needs_review', `$.groups.${group.identity.groupId}`, 'Per-question Profile scoring total disagrees with the bound frozen question count'))
    return null
  }
  return derivedTotal
}

function validateBoundSectionScores(profile, groupBySlot, diagnostics) {
  for (const part of profile.parts) {
    for (const section of part.sections) {
      let sectionTotal = 0
      for (const slot of section.slots) {
        const group = slot.activation === 'canonical_group'
          ? groupBySlot.get(slot.slotId)
          : null
        const slotTotal = scoreTotalForBoundSlot(slot, group, diagnostics)
        if (slotTotal !== null) sectionTotal += slotTotal
      }
      if (sectionTotal !== section.score) {
        diagnostics.push(diagnostic('SECTION_SCORE_MISMATCH', 'needs_review', `$.profile.parts.${part.partId}.sections.${section.sectionId}`, 'Bound slot scores do not close the declared section total'))
      }
    }
  }
}

function buildPlan(source, capture, closure, groups, acceptedRecords, reviewDecisions) {
  const diagnostics = []
  const profile = closure.profiles.get(source.profileId)
  if (!profile) return { diagnostics: [diagnostic('PROFILE_UNSUPPORTED', 'unsupported', '$.profileId', 'The source paper does not map to an exact Profile')], plan: null }
  const groupBySlot = new Map()
  for (const group of groups) {
    if (groupBySlot.has(group.slotId)) diagnostics.push(diagnostic('GROUP_SLOT_DUPLICATE', 'needs_review', '$.groups', `Several groups map to ${group.slotId}`))
    groupBySlot.set(group.slotId, group)
  }
  const slots = slotsForProfile(profile)
  const allowedSlots = new Set(slots.map((slot) => slot.slotId))
  for (const group of groups) if (!allowedSlots.has(group.slotId)) diagnostics.push(diagnostic('GROUP_SLOT_UNEXPECTED', 'unsupported', '$.groups', `Unknown profile slot ${group.slotId}`))
  const bindings = []
  const optionalOmissions = []
  const numberingAssignments = []
  let previousFlexibleRangeEnd = null
  for (const [slotIndex, slot] of slots.entries()) {
    if (slot.activation === 'inactive_source') {
      const sourceSliceRefs = source.inactiveSlots?.[slot.slotId]
      const sourceClosure = source.inactiveSourceClosures?.find(
        (candidate) => candidate?.slotId === slot.slotId,
      )
      if (
        profile.completeness.requireInactiveSourceClosure === false
        && sourceSliceRefs === 'not_supplied'
        && slot.renderPolicy === 'suppress'
      ) {
        if (groupBySlot.has(slot.slotId)) {
          diagnostics.push(diagnostic('INACTIVE_SLOT_GROUP_FORBIDDEN', 'incomplete_source', `$.groups.${slot.slotId}`, 'A non-rendered not_supplied slot cannot produce a Canonical Group'))
        } else {
          bindings.push({ slotId: slot.slotId, state: 'inactive', sourceState: 'not_supplied' })
        }
        continue
      }
      if (!Array.isArray(sourceSliceRefs) || sourceSliceRefs.length === 0 || sourceSliceRefs.some((id) => !capture.sourceSpans.some((span) => span.sourceSpanId === id))) {
        diagnostics.push(diagnostic('INACTIVE_SOURCE_MISSING', 'incomplete_source', `$.inactiveSlots.${slot.slotId}`, 'Required inactive source closure is missing'))
      } else if (
        slot.sourceClosureContractRef
        && (
          !isRecordValue(sourceClosure)
          || sourceClosure.status !== 'closed'
          || sourceClosure.contractRef?.id !== slot.sourceClosureContractRef.id
          || sourceClosure.contractRef?.version !== slot.sourceClosureContractRef.version
          || sourceClosure.sourceSliceRefs?.length !== sourceSliceRefs.length
          || sourceClosure.sourceSliceRefs.some((sourceSpanId) => !sourceSliceRefs.includes(sourceSpanId))
          || sourceClosure.closureDigest !== digestJson(withoutKey(sourceClosure, 'closureDigest'))
        )
      ) {
        diagnostics.push(diagnostic('INACTIVE_SOURCE_CLOSURE_INVALID', 'incomplete_source', `$.inactiveSourceClosures.${slot.slotId}`, 'Required inactive source closure does not bind its exact Profile contract and captured source slices'))
      } else {
        bindings.push({
          slotId: slot.slotId,
          state: 'inactive',
          sourceSliceRefs: [...sourceSliceRefs],
          ...(sourceClosure && slot.sourceClosureContractRef
            ? {
                sourceClosureRef: {
                  reportScopeId: sourceClosure.scopeId,
                  contractId: sourceClosure.contractRef.id,
                  contractVersion: sourceClosure.contractRef.version,
                  closureDigest: sourceClosure.closureDigest,
                },
              }
            : {}),
        })
      }
      continue
    }
    const group = groupBySlot.get(slot.slotId)
    if (!group) {
      if (
        slot.presence === 'optional'
        && source.inactiveSlots?.[slot.slotId] === 'not_supplied'
      ) {
        bindings.push({
          slotId: slot.slotId,
          state: 'omitted',
          sourceState: 'not_supplied',
        })
        optionalOmissions.push(slot.slotId)
      } else {
        diagnostics.push(diagnostic('ACTIVE_GROUP_MISSING', 'incomplete_source', `$.groups`, `Required active slot ${slot.slotId} is missing`))
      }
      continue
    }
    if (
      group.variant.family !== slot.familyContractRef.id
      || group.contractRef.familyContractVersion !== slot.familyContractRef.version
    ) {
      diagnostics.push(diagnostic('GROUP_PROFILE_FAMILY_MISMATCH', 'needs_review', `$.groups.${group.groupId}`, 'Group family identity or version disagrees with Profile slot'))
      continue
    }
    if (!questionCardinalityMatches(slot.questionCardinality, group.questionRefs.length)) {
      diagnostics.push(diagnostic('GROUP_CARDINALITY_MISMATCH', 'needs_review', `$.groups.${group.groupId}`, 'Group question cardinality does not match Profile slot'))
      continue
    }
    bindings.push({ slotId: slot.slotId, state: 'bound', groupRef: { groupId: group.identity.groupId } })
    if (slot.numberingRule.kind === 'range') {
      const flexibleRange = slot.questionCardinality.kind === 'one_of'
      const rangeStart = flexibleRange && previousFlexibleRangeEnd !== null
        ? previousFlexibleRangeEnd + 1
        : slot.numberingRule.start
      group.questionRefs.forEach((question, index) => numberingAssignments.push({
        slotId: slot.slotId,
        groupId: group.identity.groupId,
        questionId: question.questionId,
        sourceNumberSpan: group.sourceMap.entries.find((entry) => entry.target.kind === 'question' && entry.target.id === question.questionId)?.sourceSpanRefs[0] || group.sourceMap.entries[0]?.sourceSpanRefs[0],
        canonicalNumber: rangeStart + index,
      }))
      if (flexibleRange) {
        previousFlexibleRangeEnd = rangeStart + group.questionRefs.length - 1
        const nextRangeSlot = slots.slice(slotIndex + 1).find(
          (candidate) => candidate.activation === 'canonical_group'
            && candidate.numberingRule.kind === 'range',
        )
        if (
          !nextRangeSlot
          || nextRangeSlot.questionCardinality.kind !== 'one_of'
        ) {
          const expectedEnd = nextRangeSlot
            ? nextRangeSlot.numberingRule.start - 1
            : slot.numberingRule.end
          if (previousFlexibleRangeEnd !== expectedEnd) {
            diagnostics.push(diagnostic('GROUP_NUMBERING_RANGE_MISMATCH', 'needs_review', `$.groups.${group.groupId}`, 'Flexible Profile cardinality does not close its numbered range'))
          }
        }
      } else {
        previousFlexibleRangeEnd = null
      }
    } else {
      previousFlexibleRangeEnd = null
    }
  }
  if (diagnostics.length === 0) validateBoundSectionScores(profile, groupBySlot, diagnostics)
  if (diagnostics.length > 0) return { diagnostics, plan: null }
  const legacyAuthority = closure.authorityRef.manifestVersion === '1'
  const profileDigest = digestJson(profile)
  const reviewDecisionDigest = legacyAuthority ? null : digestJson(reviewDecisions)
  const plan = {
    schemaVersion: 'canonical-paper-plan-v1',
    planId: stableId('plan', legacyAuthority
      ? { paperId: source.paperId, captureDigest: capture.digest, profileDigest }
      : { paperId: source.paperId, captureDigest: capture.digest, profileDigest, reviewDecisionDigest }),
    paperId: source.paperId,
    authorityRef: closure.authorityRef,
    profileRef: { profileId: profile.profileId, profileVersion: profile.version, profileDigest },
    slotBindings: bindings,
    numberingAssignments,
    sourceConformance: legacyAuthority
      ? {
          status: acceptedRecords.length > 0 ? 'exact_deviations_applied' : 'direct',
          transformationRecordIds: acceptedRecords.map((record) => record.recordId),
        }
      : {
          status: acceptedRecords.length > 0 ? 'exact_deviations_applied' : 'direct',
          transformationRecordIds: acceptedRecords.map((record) => record.recordId),
          reviewDecisionIds: reviewDecisions.map((decision) => decision.decisionId),
          reviewDecisionDigest,
        },
    completeness: { status: 'complete', optionalOmissions },
  }
  diagnostics.push(...validateJsonSchema(plan, closure.schemas['canonical-paper-plan-v1'], '$.plan'))
  return { diagnostics, plan }
}

function normalizeReviewDecisions(value, capture, diagnostics) {
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    diagnostics.push(diagnostic('REVIEW_DECISIONS_INVALID', 'needs_review', '$.reviewDecisions', 'Review decisions must be an ordered explicit input'))
    return []
  }
  const spanIds = new Set(capture.sourceSpans.map((span) => span.sourceSpanId))
  const decisionIds = new Set()
  const decisions = []
  for (const [index, decision] of value.entries()) {
    const path = `$.reviewDecisions[${index}]`
    if (!isRecordValue(decision) || !exactKeys(decision, ['decisionId', 'ambiguityId', 'selectedCandidateId', 'sourceSpanRefs']) || typeof decision.decisionId !== 'string' || typeof decision.ambiguityId !== 'string' || typeof decision.selectedCandidateId !== 'string' || !Array.isArray(decision.sourceSpanRefs) || decision.sourceSpanRefs.length === 0 || decision.sourceSpanRefs.some((sourceSpanId) => !spanIds.has(sourceSpanId)) || decisionIds.has(decision.decisionId)) {
      diagnostics.push(diagnostic('REVIEW_DECISION_INVALID', 'needs_review', path, 'Review decisions require identity, selected candidate, and captured evidence spans'))
      continue
    }
    decisionIds.add(decision.decisionId)
    decisions.push(cloneJson(decision))
  }
  return decisions
}

function validateAmbiguities(ambiguities, reviewDecisions, diagnostics) {
  const decisionsByAmbiguity = new Map(reviewDecisions.map((decision) => [decision.ambiguityId, decision]))
  for (const [index, ambiguity] of (ambiguities || []).entries()) {
    const path = `$.ambiguities[${index}]`
    if (!isRecordValue(ambiguity)) {
      diagnostics.push(diagnostic('AMBIGUOUS_SOURCE_SEMANTICS', 'needs_review', path, String(ambiguity)))
      continue
    }
    if (!exactKeys(ambiguity, ['ambiguityId', 'candidates', 'sourceSpanRefs']) || typeof ambiguity.ambiguityId !== 'string' || !Array.isArray(ambiguity.candidates) || ambiguity.candidates.length < 2 || ambiguity.candidates.some((candidate) => typeof candidate !== 'string') || !Array.isArray(ambiguity.sourceSpanRefs) || ambiguity.sourceSpanRefs.length === 0) {
      diagnostics.push(diagnostic('AMBIGUITY_INVALID', 'needs_review', path, 'Ambiguity candidates require identity and source evidence'))
      continue
    }
    const decision = decisionsByAmbiguity.get(ambiguity.ambiguityId)
    const sameSpans = decision && decision.sourceSpanRefs.length === ambiguity.sourceSpanRefs.length && decision.sourceSpanRefs.every((sourceSpanId) => ambiguity.sourceSpanRefs.includes(sourceSpanId))
    if (!decision || !ambiguity.candidates.includes(decision.selectedCandidateId) || !sameSpans) {
      diagnostics.push(diagnostic('AMBIGUOUS_SOURCE_SEMANTICS', 'needs_review', path, `No explicit evidence-bound decision resolves ${ambiguity.ambiguityId}`))
    }
  }
}

function makeReport({
  disposition,
  capture,
  authority,
  groups = [],
  records = [],
  reviewDecisions = [],
  inactiveSourceClosures = [],
  diagnostics = [],
}) {
  const legacyAuthority = authority?.manifestVersion === '1'
  const closureDigests = inactiveSourceClosures.map(
    (closure) => closure.closureDigest,
  )
  const report = {
    schemaVersion: `normalization-report-v${authority?.manifestVersion || '2'}`,
    disposition,
    authority,
    captureDigest: capture.digest,
    sourceFingerprint: digestJson({
      captureDigest: capture.digest,
      groupFingerprints: groups.map((group) => group.sourceFingerprint),
      ...(Number(authority?.manifestVersion) >= 11
        ? { inactiveSourceClosureDigests: closureDigests }
        : {}),
    }),
    directSourceMap: [
      ...groups.flatMap((group) => group.sourceMap.entries),
      ...inactiveSourceClosures.flatMap(
        (closure) => closure.sourceMap?.entries || [],
      ),
    ],
    transformationRecords: records,
    ...(legacyAuthority ? {} : { reviewDecisions }),
    ...(Number(authority?.manifestVersion) >= 11
      ? { inactiveSourceClosures }
      : {}),
    diagnostics,
  }
  if (disposition === 'ready') report.semanticDigest = legacyAuthority
    ? digestJson({ groups: groups.map((group) => group.semanticDigest) })
    : digestJson({
        groups: groups.map((group) => group.semanticDigest),
        reviewDecisionDigest: digestJson(reviewDecisions),
        ...(Number(authority?.manifestVersion) >= 11
          ? { inactiveSourceClosureDigests: closureDigests }
          : {}),
      })
  return report
}

function blockedResult(disposition, capture, authority, diagnostics, records = [], reviewDecisions = []) {
  return { disposition, artifacts: { sourceCapture: capture, normalizationReport: makeReport({ disposition, capture, authority, records, reviewDecisions, diagnostics }) } }
}

/**
 * Pure whole-paper entry point. The request contains evidence bytes and an
 * exact authority reference; profiles, adapters, renderers, storage, and
 * caller mode are deliberately not caller-selectable.
 */
export function compileCanonicalPaper(
  request,
  { historicalReplayCapability = null } = {},
) {
  const allowsHistoricalReplay =
    isRegisteredConfirmedCanonicalHistoricalReplayCapability(
      historicalReplayCapability,
    )
  const { documents, diagnostics } = captureRequestEvidence(request)
  const ownerQaContentSuccessor = request?.[trustedOwnerQaContentSuccessorCompile]
    === paper2026IOwnerQaContentSuccessorChoice
  const requestedLegacyAuthority = trustedLegacyCaptureCandidateAuthorityFor(
    request?.authority,
    { allowsHistoricalReplay },
  )
  const parsed = parseFixtureEvidence(documents, diagnostics, {
    legacySourceAdapterVersion: legacySourceAdapterVersionForAuthority(
      requestedLegacyAuthority,
      { allowsHistoricalReplay },
    ),
    ownerQaContentSuccessor,
  })
  const capture = buildSourceCapture(documents, parsed, diagnostics)
  const reviewDecisions = normalizeReviewDecisions(request?.reviewDecisions, capture, diagnostics)
  const authorityResolution = resolveCanonicalAuthority(request?.authority)
  if (!authorityResolution.ok) {
    diagnostics.push(...authorityResolution.issues.map((item) => diagnostic(item.code, 'unsupported', item.path, item.message)))
    return blockedResult(dispositionFor(diagnostics), capture, request?.authority || null, diagnostics, [], reviewDecisions)
  }
  const closure = authorityResolution.closure
  const acceptsTrustedDocxCandidate = request?.[trustedDocxCandidateCompile] === true
    && closure.authorityRef.manifestDigest
      === trustedDocxCandidateAuthorityRef.manifestDigest
  const acceptsDocxPairCandidate = request?.[docxPairCandidateCompile] === true
    && closure.authorityRef.manifestDigest
      === trustedDocxCandidateAuthorityRef.manifestDigest
  const acceptsNck1MaterializationCandidate = request?.[nck1MaterializationCandidateCompile] === true
    && closure.authorityRef.manifestDigest
      === nck1MaterializationCandidateAuthorityRef.manifestDigest
  const acceptsConfirmedNck1MaterializationRequest =
    closure.authorityRef.manifestDigest
      === nck1MaterializationCandidateAuthorityRef.manifestDigest
    && isConfirmedNck1MaterializationRequest(request)
  const acceptsTrustedLegacyCaptureCandidate = request?.[trustedLegacyCaptureCandidateCompile] === true
    && Boolean(trustedLegacyCaptureCandidateAuthorityFor(
      closure.authorityRef,
      { allowsHistoricalReplay },
    ))
  if (
    closure.authorityRef.manifestDigest !== canonicalAuthorityRef.manifestDigest
    && !acceptsTrustedDocxCandidate
    && !acceptsDocxPairCandidate
    && !acceptsNck1MaterializationCandidate
    && !acceptsConfirmedNck1MaterializationRequest
    && !acceptsTrustedLegacyCaptureCandidate
  ) {
    diagnostics.push(diagnostic('AUTHORITY_RETIRED', 'unsupported', '$.authority', 'Only the current canonical authority may compile new papers'))
    return blockedResult(dispositionFor(diagnostics), capture, closure.authorityRef, diagnostics, [], [])
  }
  const effectiveReviewDecisions = closure.authorityRef.manifestVersion === '1' ? [] : reviewDecisions
  diagnostics.push(...validateCapture(capture, closure).map((item) => diagnostic(item.code, 'incomplete_source', item.path, item.message)))
  if (parsed?.adapter === 'docx-source-envelope' || parsed?.adapter === 'ticket-26-legacy-source-envelope') {
    const envelopeSchema = closure.schemas[parsed.envelope.schemaVersion]
    const envelopeLabel = parsed.adapter === 'docx-source-envelope'
      ? 'DOCX_SOURCE_ENVELOPE_INVALID'
      : 'TICKET_26_LEGACY_ENVELOPE_INVALID'
    const envelopePath = parsed.adapter === 'docx-source-envelope'
      ? '$.docxSourceEnvelope'
      : '$.ticket26LegacySourceEnvelope'
    if (!envelopeSchema) {
      diagnostics.push(diagnostic(envelopeLabel, 'incomplete_source', `${envelopePath}.schemaVersion`, 'Source envelope schema is unavailable for this authority'))
    } else {
      diagnostics.push(...validateJsonSchema(
        parsed.envelope,
        envelopeSchema,
        envelopePath,
      ).map((item) => diagnostic(envelopeLabel, 'incomplete_source', item.path, item.message)))
    }
  }
  validateDocxSourceBinding(parsed, capture, diagnostics)
  if (!parsed) return blockedResult(dispositionFor(diagnostics), capture, closure.authorityRef, diagnostics, [], reviewDecisions)
  const source = parsed.value
  if (typeof source.paperId !== 'string' || typeof source.profileId !== 'string' || !Array.isArray(source.groups)) {
    diagnostics.push(diagnostic('FIXTURE_SOURCE_SHAPE_INVALID', 'incomplete_source', '$', 'Source evidence does not close a paper, profile, and group list'))
  }
  validateAmbiguities(source.ambiguities, effectiveReviewDecisions, diagnostics)
  for (const marker of source.unsupportedFeatures || []) diagnostics.push(diagnostic('SOURCE_FEATURE_UNSUPPORTED', 'unsupported', '$.unsupportedFeatures', String(marker)))
  validateAnswerAssertions(capture, diagnostics)
  validateAnswerCoverage(source, capture, diagnostics)
  const transformations = validateExactTransformationRecords(source.transformations, capture, closure)
  diagnostics.push(...transformations.diagnostics)
  if (dispositionFor(diagnostics) !== 'ready') return blockedResult(dispositionFor(diagnostics), capture, closure.authorityRef, diagnostics, transformations.records, effectiveReviewDecisions)
  const builtGroups = []
  for (const rawGroup of source.groups) {
    const built = buildGroupArtifact({ ...rawGroup, paperId: source.paperId, profileId: source.profileId }, capture, closure, transformations.records)
    diagnostics.push(...built.diagnostics)
    if (built.artifact) builtGroups.push({ ...built.artifact, slotId: rawGroup.slotId })
  }
  if (dispositionFor(diagnostics) !== 'ready') return blockedResult(dispositionFor(diagnostics), capture, closure.authorityRef, diagnostics, transformations.records, effectiveReviewDecisions)
  const planResult = buildPlan(
    source,
    capture,
    closure,
    builtGroups,
    transformations.records,
    effectiveReviewDecisions,
  )
  diagnostics.push(...planResult.diagnostics)
  if (dispositionFor(diagnostics) !== 'ready') return blockedResult(dispositionFor(diagnostics), capture, closure.authorityRef, diagnostics, transformations.records, effectiveReviewDecisions)
  const builtGroupById = new Map(
    builtGroups.map((group) => [group.identity.groupId, group]),
  )
  const groups = planResult.plan.slotBindings
    .filter((binding) => binding.state === 'bound')
    .map((binding) => builtGroupById.get(binding.groupRef.groupId))
    .map(({ slotId: _slotId, ...group }) => group)
  const sourceClosureScopeIds = new Set(
    planResult.plan.slotBindings
      .map((binding) => binding.sourceClosureRef?.reportScopeId)
      .filter(Boolean),
  )
  const inactiveSourceClosures = cloneJson(
    (source.inactiveSourceClosures || []).filter((closure) =>
      sourceClosureScopeIds.has(closure.scopeId)),
  )
  const report = makeReport({
    disposition: 'ready',
    capture,
    authority: closure.authorityRef,
    groups,
    records: transformations.records,
    reviewDecisions: effectiveReviewDecisions,
    inactiveSourceClosures,
    diagnostics,
  })
  const reportIssues = validateJsonSchema(report, closure.schemas[`normalization-report-v${closure.authorityRef.manifestVersion}`], '$.normalizationReport')
  if (reportIssues.length > 0) {
    const mapped = reportIssues.map((item) => diagnostic(item.code, 'needs_review', item.path, item.message))
    return blockedResult('needs_review', capture, closure.authorityRef, [...diagnostics, ...mapped], transformations.records, effectiveReviewDecisions)
  }
  return {
    disposition: 'ready',
    artifacts: {
      sourceCapture: capture,
      canonicalPaper: { paperPlan: planResult.plan, questionGroups: groups },
      normalizationReport: report,
    },
  }
}

function compileTrustedDocxCandidate(request) {
  return compileCanonicalPaper({
    ...request,
    authority: trustedDocxCandidateAuthorityRef,
    [trustedDocxCandidateCompile]: true,
  })
}

function compileDocxPairCandidate(request) {
  return compileCanonicalPaper({
    ...request,
    authority: trustedDocxCandidateAuthorityRef,
    [docxPairCandidateCompile]: true,
  })
}

function compileNck1MaterializationCandidate(request) {
  return compileCanonicalPaper({
    ...request,
    authority: nck1MaterializationCandidateAuthorityRef,
    [nck1MaterializationCandidateCompile]: true,
  })
}

function compileTrustedLegacyCaptureCandidate(
  request,
  authority = trustedLegacyCaptureCandidateAuthorityRef,
  historicalReplayCapability = null,
  operatorChoices = {},
) {
  const allowsHistoricalReplay =
    isRegisteredConfirmedCanonicalHistoricalReplayCapability(
      historicalReplayCapability,
    )
  const trustedAuthority = trustedLegacyCaptureCandidateAuthorityFor(authority, {
    allowsHistoricalReplay,
  })
  if (!trustedAuthority) {
    throw new Error('Trusted legacy Candidate compilation requires one registered authority')
  }
  return compileCanonicalPaper({
    ...request,
    authority: trustedAuthority,
    [trustedLegacyCaptureCandidateCompile]: true,
    ...(operatorChoices.sourceCorrection === paper2026IOwnerQaContentSuccessorChoice
      ? { [trustedOwnerQaContentSuccessorCompile]: paper2026IOwnerQaContentSuccessorChoice }
      : {}),
  }, { historicalReplayCapability })
}

const trustedDocxCandidateSchemaVersion = 'trusted-docx-import-candidate-v1'
const docxPairCandidateSchemaVersion = 'docx-pair-import-candidate-v1'
const trustedLegacyCaptureCandidateSchemaVersion = 'trusted-ticket-26-legacy-import-candidate-v1'
const confirmationSchemaVersion = 'teacher-confirmation-v1'
const trustedDocxTextEncoder = new TextEncoder()

function trustedDocxIssue(code, message) {
  return { code, disposition: 'incomplete_source', message }
}

function normalizeTrustedDocxOperatorChoices(value) {
  if (value === undefined) return { originalName: 'source.docx' }
  if (!exactKeys(value, ['originalName']) || typeof value.originalName !== 'string' || value.originalName.length === 0) {
    return null
  }
  return { originalName: value.originalName }
}

function trustedDocxCandidateBody({ sourceBytes, sourceDigest, operatorChoices, interpretation, issues }) {
  return {
    schemaVersion: trustedDocxCandidateSchemaVersion,
    authority: trustedDocxCandidateAuthorityRef,
    source: {
      mediaType: DOCX_MEDIA_TYPE,
      sha256: sourceDigest,
      byteLength: sourceBytes.byteLength,
      originalName: operatorChoices.originalName,
    },
    operatorChoices,
    interpretation,
    issues,
  }
}

function buildTrustedDocxCompilerRequest(docxBytes, originalName) {
  const sourceDocument = {
    inputKey: 'source_docx',
    mediaType: DOCX_MEDIA_TYPE,
    sha256: sha256(docxBytes),
    byteLength: docxBytes.byteLength,
  }
  return {
    evidence: {
      documents: [
        {
          inputKey: sourceDocument.inputKey,
          roles: ['question_source', 'official_answer_source', 'source_provenance'],
          bytes: new Uint8Array(docxBytes),
          declared: { mediaType: DOCX_MEDIA_TYPE, originalName },
        },
        {
          inputKey: 'docx_source_envelope',
          roles: ['operator_assertions'],
          bytes: trustedDocxTextEncoder.encode(JSON.stringify({
            schemaVersion: 'docx-source-envelope-v2',
            sourceDocument,
          })),
          declared: {
            mediaType: DOCX_SOURCE_ENVELOPE_MEDIA_TYPE,
            originalName: 'docx-source-envelope.json',
          },
        },
      ],
    },
  }
}

function isTrustedDocxCandidateShape(candidate) {
  return exactKeys(candidate, [
    'schemaVersion',
    'authority',
    'source',
    'operatorChoices',
    'interpretation',
    'issues',
    'candidateDigest',
    'sourceBytes',
  ])
    && candidate.schemaVersion === trustedDocxCandidateSchemaVersion
    && candidate.sourceBytes instanceof Uint8Array
}

function trustedDocxCandidateFromBytes(sourceBytes, operatorChoices) {
  const immutableBytes = new Uint8Array(sourceBytes)
  const sourceDigest = sha256(immutableBytes)
  let interpretation
  let issues = []
  try {
    interpretation = deriveDocxCanonicalSource(immutableBytes)
  } catch {
    issues = [trustedDocxIssue('DOCX_SOURCE_DOCUMENT_INVALID', 'The immutable source bytes cannot be derived by the trusted DOCX adapter')]
  }
  const body = trustedDocxCandidateBody({
    sourceBytes: immutableBytes,
    sourceDigest,
    operatorChoices,
    interpretation: interpretation || null,
    issues,
  })
  return {
    candidate: {
      ...body,
      candidateDigest: digestJson(body),
      sourceBytes: immutableBytes,
    },
  }
}

function normalizeDocxPairOperatorChoices(value) {
  if (
    !exactKeys(value, ['questionOriginalName', 'answersOriginalName', 'paperId'])
    || typeof value.questionOriginalName !== 'string'
    || value.questionOriginalName.length === 0
    || typeof value.answersOriginalName !== 'string'
    || value.answersOriginalName.length === 0
    || typeof value.paperId !== 'string'
    || value.paperId.length === 0
  ) {
    return null
  }
  if (isReservedNck1ExamPaperId(value.paperId)) return null
  return {
    questionOriginalName: value.questionOriginalName,
    answersOriginalName: value.answersOriginalName,
    paperId: value.paperId,
  }
}

function docxPairSourceDigest(questionBytes, answersBytes) {
  return digestJson({
    question: sha256(questionBytes),
    officialAnswers: sha256(answersBytes),
  })
}

function docxPairCandidateBody({
  questionBytes,
  answersBytes,
  sourceDigest,
  operatorChoices,
  interpretation,
  issues,
}) {
  return {
    schemaVersion: docxPairCandidateSchemaVersion,
    authority: trustedDocxCandidateAuthorityRef,
    source: {
      mediaType: DOCX_MEDIA_TYPE,
      sha256: sourceDigest,
      byteLength: questionBytes.byteLength + answersBytes.byteLength,
      originalName: operatorChoices.questionOriginalName,
      question: {
        mediaType: DOCX_MEDIA_TYPE,
        sha256: sha256(questionBytes),
        byteLength: questionBytes.byteLength,
        originalName: operatorChoices.questionOriginalName,
      },
      officialAnswers: {
        mediaType: DOCX_MEDIA_TYPE,
        sha256: sha256(answersBytes),
        byteLength: answersBytes.byteLength,
        originalName: operatorChoices.answersOriginalName,
      },
    },
    operatorChoices,
    interpretation,
    issues,
  }
}

function isDocxPairCandidateShape(candidate) {
  return exactKeys(candidate, [
    'schemaVersion',
    'authority',
    'source',
    'operatorChoices',
    'interpretation',
    'issues',
    'candidateDigest',
    'questionBytes',
    'answersBytes',
  ])
    && candidate.schemaVersion === docxPairCandidateSchemaVersion
    && candidate.questionBytes instanceof Uint8Array
    && candidate.answersBytes instanceof Uint8Array
}

function docxPairCandidateFromBytes(questionBytes, answersBytes, operatorChoices) {
  const immutableQuestion = new Uint8Array(questionBytes)
  const immutableAnswers = new Uint8Array(answersBytes)
  const sourceDigest = docxPairSourceDigest(immutableQuestion, immutableAnswers)
  let interpretation
  let issues = []
  try {
    interpretation = deriveDocxPairCanonicalSource(
      immutableQuestion,
      immutableAnswers,
      { paperId: operatorChoices.paperId },
    )
  } catch {
    issues = [trustedDocxIssue('DOCX_SOURCE_DOCUMENT_INVALID', 'The immutable DOCX pair cannot be derived by the pair adapter')]
  }
  const body = docxPairCandidateBody({
    questionBytes: immutableQuestion,
    answersBytes: immutableAnswers,
    sourceDigest,
    operatorChoices,
    interpretation: interpretation || null,
    issues,
  })
  return {
    candidate: {
      ...body,
      candidateDigest: digestJson(body),
      questionBytes: immutableQuestion,
      answersBytes: immutableAnswers,
    },
  }
}

function buildDocxPairCompilerRequest(
  questionBytes,
  answersBytes,
  operatorChoices,
) {
  const questionDocument = {
    inputKey: 'question_docx',
    mediaType: DOCX_MEDIA_TYPE,
    sha256: sha256(questionBytes),
    byteLength: questionBytes.byteLength,
  }
  const identity = {
    schemaVersion: DOCX_PAIR_IDENTITY_SCHEMA_VERSION,
    paperId: operatorChoices.paperId,
    profileId: 'nck1',
  }
  return {
    evidence: {
      documents: [
        {
          inputKey: questionDocument.inputKey,
          roles: ['question_source', 'source_provenance'],
          bytes: new Uint8Array(questionBytes),
          declared: {
            mediaType: DOCX_MEDIA_TYPE,
            originalName: operatorChoices.questionOriginalName,
          },
        },
        {
          inputKey: 'official_answer_docx',
          roles: ['official_answer_source'],
          bytes: new Uint8Array(answersBytes),
          declared: {
            mediaType: DOCX_MEDIA_TYPE,
            originalName: operatorChoices.answersOriginalName,
          },
        },
        {
          inputKey: 'docx_pair_identity',
          roles: ['operator_assertions'],
          bytes: trustedDocxTextEncoder.encode(JSON.stringify(identity)),
          declared: {
            mediaType: DOCX_PAIR_IDENTITY_MEDIA_TYPE,
            originalName: 'docx-pair-identity.json',
          },
        },
        {
          inputKey: 'docx_source_envelope',
          roles: ['operator_assertions'],
          bytes: trustedDocxTextEncoder.encode(JSON.stringify({
            schemaVersion: 'docx-source-envelope-v2',
            sourceDocument: questionDocument,
          })),
          declared: {
            mediaType: DOCX_SOURCE_ENVELOPE_MEDIA_TYPE,
            originalName: 'docx-source-envelope.json',
          },
        },
      ],
    },
  }
}

export function importDocxPairCanonicalCandidate(
  questionBytes,
  answersBytes,
  operatorChoices,
) {
  if (
    !(questionBytes instanceof Uint8Array)
    || questionBytes.byteLength === 0
    || !(answersBytes instanceof Uint8Array)
    || answersBytes.byteLength === 0
  ) {
    return {
      candidate: null,
      issues: [trustedDocxIssue('SOURCE_BYTES_REQUIRED', 'DOCX pair import requires immutable question and answer DOCX bytes')],
    }
  }
  const normalizedChoices = normalizeDocxPairOperatorChoices(operatorChoices)
  if (!normalizedChoices) {
    return {
      candidate: null,
      issues: [trustedDocxIssue('CALLER_SEMANTICS_REJECTED', 'DOCX pair operator choices may contain only original names and the owner-asserted paperId')],
    }
  }
  const result = docxPairCandidateFromBytes(
    questionBytes,
    answersBytes,
    normalizedChoices,
  )
  return { candidate: result.candidate, issues: result.candidate.issues }
}

function trustedLegacyCaptureCandidateBody({
  sourceBytes,
  inspection,
  interpretation,
  issues,
  authority,
  operatorChoices = {},
}) {
  return {
    schemaVersion: trustedLegacyCaptureCandidateSchemaVersion,
    authority,
    source: {
      mediaType: TICKET_26_LEGACY_CAPTURE_MEDIA_TYPE,
      sha256: sha256(sourceBytes),
      byteLength: sourceBytes.byteLength,
      captureId: inspection.record.capture.captureId,
      captureDigest: inspection.record.capture.digest,
      paperId: inspection.record.paperId,
      documents: inspection.record.documents.map((document) => ({
        role: document.role,
        sha256: document.sha256,
        byteLength: document.byteLength,
      })),
    },
    operatorChoices,
    interpretation,
    issues,
  }
}

function isTrustedLegacyCaptureCandidateShape(candidate) {
  return exactKeys(candidate, [
    'schemaVersion',
    'authority',
    'source',
    'operatorChoices',
    'interpretation',
    'issues',
    'candidateDigest',
    'sourceBytes',
  ])
    && candidate.schemaVersion === trustedLegacyCaptureCandidateSchemaVersion
    && candidate.sourceBytes instanceof Uint8Array
    && (
      exactKeys(candidate.operatorChoices, [])
      || (
        exactKeys(candidate.operatorChoices, ['sourceCorrection'])
        && candidate.operatorChoices.sourceCorrection === paper2026IOwnerQaContentSuccessorChoice
      )
    )
}

function trustedLegacyCaptureCandidateFromBytes(
  sourceBytes,
  authority = trustedLegacyCaptureCandidateAuthorityRef,
  historicalReplayCapability = null,
  operatorChoices = {},
) {
  const allowsHistoricalReplay =
    isRegisteredConfirmedCanonicalHistoricalReplayCapability(
      historicalReplayCapability,
    )
  const trustedAuthority = trustedLegacyCaptureCandidateAuthorityFor(authority, {
    allowsHistoricalReplay,
  })
  if (!trustedAuthority) {
    return {
      candidate: null,
      issues: [trustedDocxIssue('AUTHORITY_UNAVAILABLE', 'Import Candidate requires one registered legacy source authority')],
    }
  }
  const immutableBytes = new Uint8Array(sourceBytes)
  const ownerQaContentSuccessor = operatorChoices?.sourceCorrection
    === paper2026IOwnerQaContentSuccessorChoice
  let inspection
  try {
    inspection = inspectTicket26LegacyEnvelopeSource(immutableBytes, {
      adapterVersion: legacySourceAdapterVersionForAuthority(trustedAuthority, {
        allowsHistoricalReplay,
      }),
    })
  } catch {
    inspection = null
  }
  if (!inspection?.ok) {
    return {
      candidate: null,
      issues: [trustedDocxIssue('TICKET_26_LEGACY_CAPTURE_UNTRUSTED', 'Import Candidate requires exact committed Ticket 26 capture bytes and nested frozen document bindings')],
    }
  }
  const body = trustedLegacyCaptureCandidateBody({
    sourceBytes: immutableBytes,
    inspection,
    interpretation: ownerQaContentSuccessor
      ? applyTicket26OwnerQaContentSuccessor(immutableBytes, inspection.source)
      : inspection.source,
    issues: [],
    authority: trustedAuthority,
    operatorChoices: ownerQaContentSuccessor
      ? { sourceCorrection: paper2026IOwnerQaContentSuccessorChoice }
      : {},
  })
  return {
    candidate: {
      ...body,
      candidateDigest: digestJson(body),
      sourceBytes: immutableBytes,
    },
    issues: [],
  }
}

export function importPaper2026ISuccessorCandidate(sourceCaptureBytes) {
  if (
    !(sourceCaptureBytes instanceof Uint8Array)
    || sha256(sourceCaptureBytes) !== paper2026ISuccessorSourceCaptureSha256
  ) {
    return {
      candidate: null,
      issues: [trustedDocxIssue('TICKET_26_LEGACY_CAPTURE_UNTRUSTED', 'paper-2026-i successor import requires its exact committed source capture bytes')],
    }
  }
  return trustedLegacyCaptureCandidateFromBytes(
    sourceCaptureBytes,
    paper2026ISuccessorCandidateAuthorityRef,
  )
}

export function importPaper2026IOwnerQaContentSuccessorCandidate(sourceCaptureBytes) {
  if (
    !(sourceCaptureBytes instanceof Uint8Array)
    || sha256(sourceCaptureBytes) !== paper2026ISuccessorSourceCaptureSha256
  ) {
    return {
      candidate: null,
      issues: [trustedDocxIssue('TICKET_26_LEGACY_CAPTURE_UNTRUSTED', 'paper-2026-i Owner QA content successor requires its exact committed source capture bytes')],
    }
  }
  return trustedLegacyCaptureCandidateFromBytes(
    sourceCaptureBytes,
    paper2026IOwnerQaContentSuccessorCandidateAuthorityRef,
    null,
    { sourceCorrection: paper2026IOwnerQaContentSuccessorChoice },
  )
}

function suppliedTrustedCandidateBody(candidate) {
  const {
    candidateDigest: _candidateDigest,
    sourceBytes: _sourceBytes,
    questionBytes: _questionBytes,
    answersBytes: _answersBytes,
    sourceInput: _sourceInput,
    ...body
  } = candidate
  return body
}

function nck1MaterializationCandidateBody(derivation) {
  return {
    schemaVersion: NCK1_MATERIALIZATION_CANDIDATE_SCHEMA_VERSION,
    authority: nck1MaterializationCandidateAuthorityRef,
    source: nck1MaterializationSourceSummary(derivation),
    operatorChoices: {},
    interpretation: derivation.source,
    issues: derivation.issues,
  }
}

function nck1MaterializationCandidateFromInput(sourceInput) {
  const derivation = deriveNck1MaterializationBundle(sourceInput)
  const body = nck1MaterializationCandidateBody(derivation)
  return {
    candidate: {
      ...body,
      candidateDigest: digestJson(body),
      sourceInput: cloneNck1MaterializationInput(sourceInput),
    },
    derivation,
  }
}

function nck1InputKey(prefix, id) {
  return `${prefix}_${id.replace(/[^a-z0-9]+/gi, '_')}`
}

function compilerDocumentFingerprint(document) {
  return digestJson({
    inputKey: document.inputKey,
    roles: document.roles,
    declared: document.declared,
    sha256: sha256(document.bytes),
    byteLength: document.bytes.byteLength,
  })
}

function isConfirmedNck1MaterializationRequest(request) {
  const confirmation = request?.nck1MaterializationConfirmation
  if (
    !exactKeys(confirmation, ['schemaVersion', 'candidateDigest', 'sourceDigest', 'confirmed'])
    || confirmation.schemaVersion !== confirmationSchemaVersion
    || confirmation.confirmed !== true
  ) return false
  const requestDocuments = request.evidence?.documents
  if (!Array.isArray(requestDocuments)) return false
  const materializationDocument = requestDocuments.find((document) =>
    document.inputKey === 'nck1_source_materialization'
    && document.declared?.mediaType
      === 'application/vnd.eqb.nck1-source-materialization+json')
  if (!(materializationDocument?.bytes instanceof Uint8Array)) return false
  let materialization
  try {
    materialization = JSON.parse(new TextDecoder().decode(materializationDocument.bytes))
  } catch {
    return false
  }
  const byInputKey = new Map(requestDocuments.map((document) =>
    [document.inputKey, document]))
  const sourceInput = {
    kind: NCK1_MATERIALIZATION_INPUT_KIND,
    materializationBytes: new Uint8Array(materializationDocument.bytes),
    documents: (materialization.documents || []).map((document) => ({
      documentId: document.documentId,
      bytes: byInputKey.get(nck1InputKey('source_document', document.documentId))?.bytes,
    })),
    media: (materialization.media || []).map((media) => ({
      mediaId: media.mediaId,
      bytes: byInputKey.get(nck1InputKey('source_media', media.mediaId))?.bytes,
    })),
  }
  const audioDocument = byInputKey.get('listening_audio_descriptor')
  if (audioDocument) {
    try {
      sourceInput.listeningAudio = JSON.parse(new TextDecoder().decode(audioDocument.bytes))
    } catch {
      return false
    }
  }
  if (!isNck1MaterializationInput(sourceInput)) return false
  const rerun = nck1MaterializationCandidateFromInput(sourceInput)
  if (
    rerun.candidate.issues.length > 0
    || confirmation.candidateDigest !== rerun.candidate.candidateDigest
    || confirmation.sourceDigest !== rerun.candidate.source.sha256
  ) return false
  const expected = rerun.derivation.request.evidence.documents
  return expected.length === requestDocuments.length
    && expected.every((document, index) =>
      compilerDocumentFingerprint(document)
        === compilerDocumentFingerprint(requestDocuments[index]))
}

function isNck1MaterializationCandidateShape(candidate) {
  return exactKeys(candidate, [
    'schemaVersion',
    'authority',
    'source',
    'operatorChoices',
    'interpretation',
    'issues',
    'candidateDigest',
    'sourceInput',
  ])
    && candidate.schemaVersion === NCK1_MATERIALIZATION_CANDIDATE_SCHEMA_VERSION
    && exactKeys(candidate.operatorChoices, [])
    && isNck1MaterializationInput(candidate.sourceInput)
}

function candidateRoute(candidate, historicalReplayCapability = null) {
  if (isNck1MaterializationCandidateShape(candidate)) {
    return {
      rerun: () => nck1MaterializationCandidateFromInput(candidate.sourceInput),
      compile: (rerun) => compileNck1MaterializationCandidate(rerun.derivation.request),
    }
  }
  if (isTrustedDocxCandidateShape(candidate)) {
    return {
      rerun: () => trustedDocxCandidateFromBytes(candidate.sourceBytes, candidate.operatorChoices),
      compile: (rerun) => compileTrustedDocxCandidate(buildTrustedDocxCompilerRequest(
        rerun.candidate.sourceBytes,
        rerun.candidate.operatorChoices.originalName,
      )),
    }
  }
  if (isDocxPairCandidateShape(candidate)) {
    return {
      rerun: () => docxPairCandidateFromBytes(
        candidate.questionBytes,
        candidate.answersBytes,
        candidate.operatorChoices,
      ),
      compile: (rerun) => compileDocxPairCandidate(buildDocxPairCompilerRequest(
        rerun.candidate.questionBytes,
        rerun.candidate.answersBytes,
        rerun.candidate.operatorChoices,
      )),
    }
  }
  if (isTrustedLegacyCaptureCandidateShape(candidate)) {
    const allowsHistoricalReplay =
      isRegisteredConfirmedCanonicalHistoricalReplayCapability(
        historicalReplayCapability,
      )
    const authority = trustedLegacyCaptureCandidateAuthorityFor(candidate.authority, {
      allowsHistoricalReplay,
    })
    if (!authority) return null
    return {
    rerun: () => trustedLegacyCaptureCandidateFromBytes(
        candidate.sourceBytes,
        authority,
        historicalReplayCapability,
        candidate.operatorChoices,
      ),
      compile: (rerun) => compileTrustedLegacyCaptureCandidate(
        buildTicket26LegacyCompilerRequest(rerun.candidate.sourceBytes),
        authority,
        historicalReplayCapability,
        rerun.candidate.operatorChoices,
      ),
    }
  }
  return null
}

/**
 * The only import entrypoint: source bytes are the semantic authority. Caller
 * choices may name the source but cannot supply questions, answers, groups, or
 * a profile.
 */
export function importCanonicalCandidate(sourceBytes, operatorChoices) {
  if (isNck1MaterializationInput(sourceBytes)) {
    if (operatorChoices !== undefined) {
      return { candidate: null, issues: [trustedDocxIssue('CALLER_SEMANTICS_REJECTED', 'NCK1 Source Materialization imports do not accept caller choices or Canonical semantic fields')] }
    }
    const result = nck1MaterializationCandidateFromInput(sourceBytes)
    return { candidate: result.candidate, issues: result.candidate.issues }
  }
  if (sourceBytes instanceof Uint8Array) {
    if (sourceBytes.byteLength === 0) {
      return { candidate: null, issues: [trustedDocxIssue('SOURCE_BYTES_REQUIRED', 'Import Candidate requires immutable non-empty DOCX source bytes')] }
    }
    const normalizedChoices = normalizeTrustedDocxOperatorChoices(operatorChoices)
    if (!normalizedChoices) {
      return { candidate: null, issues: [trustedDocxIssue('CALLER_SEMANTICS_REJECTED', 'Operator choices may contain only the source originalName')] }
    }
    const result = trustedDocxCandidateFromBytes(sourceBytes, normalizedChoices)
    return { candidate: result.candidate, issues: result.candidate.issues }
  }
  if (
    exactKeys(sourceBytes, ['kind', 'sourceCaptureBytes'])
    && sourceBytes.kind === TICKET_26_LEGACY_CAPTURE_INPUT_KIND
    && sourceBytes.sourceCaptureBytes instanceof Uint8Array
  ) {
    if (operatorChoices !== undefined) {
      return { candidate: null, issues: [trustedDocxIssue('CALLER_SEMANTICS_REJECTED', 'Legacy capture imports do not accept caller choices or semantic fields')] }
    }
    return trustedLegacyCaptureCandidateFromBytes(sourceBytes.sourceCaptureBytes)
  }
  return { candidate: null, issues: [trustedDocxIssue('SOURCE_BYTES_REQUIRED', 'Import Candidate requires immutable DOCX bytes, one exact NCK1 Source Materialization input, or one exact Ticket 26 legacy capture input')] }
}

/**
 * Re-derives one NCK1 Candidate and compiles its read-only preview without
 * creating a Teacher Confirmation or a publishable admission. The Candidate
 * authority remains retired at the publication latch, so this result is only
 * suitable for local consumer QA.
 */
export function compileNck1MaterializationCandidatePreview(candidate) {
  if (!isNck1MaterializationCandidateShape(candidate)) {
    return { unresolvedIssues: [trustedDocxIssue('CANDIDATE_REQUIRED', 'NCK1 Candidate preview requires one trusted Source Materialization Candidate')] }
  }
  if (candidate.candidateDigest !== digestJson(suppliedTrustedCandidateBody(candidate))) {
    return { unresolvedIssues: [trustedDocxIssue('CANDIDATE_BINDING_MISMATCH', 'NCK1 Candidate preview digest does not bind the supplied candidate')] }
  }
  const rerun = nck1MaterializationCandidateFromInput(candidate.sourceInput)
  if (
    !rerun.candidate
    || rerun.candidate.candidateDigest !== candidate.candidateDigest
  ) {
    return { unresolvedIssues: [trustedDocxIssue('CANDIDATE_BINDING_MISMATCH', 'NCK1 Candidate preview does not match a fresh trusted derivation')] }
  }
  if (rerun.candidate.issues.length > 0) {
    return { unresolvedIssues: rerun.candidate.issues }
  }
  const compilation = compileNck1MaterializationCandidate(
    rerun.derivation.request,
  )
  if (!compilation.artifacts?.canonicalPaper) {
    const unresolvedIssues = compilation.artifacts?.normalizationReport
      ?.diagnostics
      ?.filter((item) => item.disposition !== 'ready')
      .map(({ code, disposition, message, path }) => ({
        code,
        disposition,
        message,
        path,
      }))
    return {
      unresolvedIssues: unresolvedIssues?.length > 0
        ? unresolvedIssues
        : [trustedDocxIssue('CANONICAL_DERIVATION_INCOMPLETE', 'NCK1 Candidate preview did not derive one complete Canonical Paper')],
    }
  }
  return { candidate: rerun.candidate, compilation }
}

/**
 * Re-derives the candidate from its exact bytes before honoring a teacher's
 * bounded confirmation. It either returns one complete Canonical Paper or no
 * paper and unresolved issues.
 */
export function rederiveConfirmedCanonicalCandidate(
  candidate,
  teacherConfirmation,
  historicalReplayCapability = null,
) {
  if (!exactKeys(teacherConfirmation, ['schemaVersion', 'candidateDigest', 'sourceDigest', 'confirmed']) || teacherConfirmation.schemaVersion !== confirmationSchemaVersion) {
    return { unresolvedIssues: [trustedDocxIssue('CALLER_SEMANTICS_REJECTED', 'Teacher Confirmation may bind only the candidate digest, source digest, and explicit confirmation')] }
  }
  const route = candidateRoute(candidate, historicalReplayCapability)
  if (!route) {
    return { unresolvedIssues: [trustedDocxIssue('CANDIDATE_REQUIRED', 'Teacher Confirmation requires one trusted Import Candidate')] }
  }
  if (candidate.candidateDigest !== digestJson(suppliedTrustedCandidateBody(candidate))) {
    return { unresolvedIssues: [trustedDocxIssue('CANDIDATE_BINDING_MISMATCH', 'Teacher Confirmation candidate digest does not bind the supplied candidate')] }
  }
  const rerun = route.rerun()
  if (!rerun.candidate || candidate.candidateDigest !== rerun.candidate.candidateDigest) {
    return { unresolvedIssues: [trustedDocxIssue('CANDIDATE_BINDING_MISMATCH', 'Teacher Confirmation candidate does not match a fresh trusted derivation')] }
  }
  if (teacherConfirmation.candidateDigest !== rerun.candidate.candidateDigest) {
    return { unresolvedIssues: [trustedDocxIssue('CONFIRMATION_CANDIDATE_MISMATCH', 'Teacher Confirmation must bind the exact Import Candidate digest')] }
  }
  if (teacherConfirmation.sourceDigest !== rerun.candidate.source.sha256) {
    return { unresolvedIssues: [trustedDocxIssue('CONFIRMATION_SOURCE_MISMATCH', 'Teacher Confirmation must bind the exact immutable source digest')] }
  }
  if (teacherConfirmation.confirmed !== true) {
    return { unresolvedIssues: [trustedDocxIssue('TEACHER_CONFIRMATION_REQUIRED', 'A teacher must explicitly confirm the exact Import Candidate')] }
  }
  if (rerun.candidate.issues.length > 0) {
    return { unresolvedIssues: rerun.candidate.issues }
  }
  const compilation = route.compile(rerun)
  if (!compilation.artifacts?.canonicalPaper) {
    const compilationIssues = compilation.artifacts?.normalizationReport?.diagnostics
      ?.filter((item) => item.disposition !== 'ready')
      .map(({ code, disposition, message, path }) => ({ code, disposition, message, path }))
    return {
      unresolvedIssues: compilationIssues?.length > 0
        ? compilationIssues
        : [trustedDocxIssue('CANONICAL_DERIVATION_INCOMPLETE', 'The confirmed candidate did not produce one complete Canonical Paper')],
    }
  }
  return {
    compilation,
    candidate: rerun.candidate,
    confirmation: {
      schemaVersion: confirmationSchemaVersion,
      candidateDigest: rerun.candidate.candidateDigest,
      sourceDigest: rerun.candidate.source.sha256,
    },
  }
}

export function confirmCanonicalCandidate(candidate, teacherConfirmation) {
  const confirmed = rederiveConfirmedCanonicalCandidate(candidate, teacherConfirmation)
  if (!confirmed.compilation) return confirmed
  const { compilation } = confirmed
  return {
    canonicalPaper: {
      ...compilation.artifacts.canonicalPaper,
      ...(candidate.schemaVersion === trustedLegacyCaptureCandidateSchemaVersion
        ? { sourceCapture: compilation.artifacts.sourceCapture }
        : {}),
    },
    confirmation: confirmed.confirmation,
  }
}

export { canonicalAuthorityRef, stableStringify }
