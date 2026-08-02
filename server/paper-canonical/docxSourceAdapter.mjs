import { canonicalAuthorityRef } from '../../shared/paper-canonical/authority.mjs'
import { digestJson, sha256 } from '../../shared/paper-canonical/stable.mjs'
import { buildGroups } from '../../scripts/import-pipeline/lib.mjs'
import { inflateRawSync } from 'node:zlib'

const textEncoder = new TextEncoder()

export const DOCX_SOURCE_ENVELOPE_MEDIA_TYPE =
  'application/vnd.eqb.docx-source-envelope+json'
export const DOCX_MEDIA_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

const EOCD_SIGNATURE = 0x06054b50
const CENTRAL_FILE_SIGNATURE = 0x02014b50
const LOCAL_FILE_SIGNATURE = 0x04034b50
const MAX_EOCD_SEARCH_BYTES = 65_557
const MAX_DOCUMENT_XML_BYTES = 20 * 1024 * 1024

function requireRange(buffer, offset, length, label) {
  if (offset < 0 || length < 0 || offset + length > buffer.length) {
    throw new Error(`DOCX ${label} is truncated`)
  }
}

function findEndOfCentralDirectory(buffer) {
  const minimumOffset = Math.max(0, buffer.length - MAX_EOCD_SEARCH_BYTES)
  for (let offset = buffer.length - 22; offset >= minimumOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) return offset
  }
  throw new Error('DOCX ZIP central directory is missing')
}

function readDocxPackage(docxBytes) {
  const buffer = Buffer.from(docxBytes)
  const eocdOffset = findEndOfCentralDirectory(buffer)
  requireRange(buffer, eocdOffset, 22, 'ZIP directory')
  const entryCount = buffer.readUInt16LE(eocdOffset + 10)
  const centralOffset = buffer.readUInt32LE(eocdOffset + 16)
  if (entryCount === 0xffff || centralOffset === 0xffffffff) {
    throw new Error('ZIP64 DOCX source is unsupported')
  }
  let offset = centralOffset
  const entries = []
  let documentXml = null
  for (let index = 0; index < entryCount; index += 1) {
    requireRange(buffer, offset, 46, 'ZIP central entry')
    if (buffer.readUInt32LE(offset) !== CENTRAL_FILE_SIGNATURE) {
      throw new Error('DOCX ZIP central directory is corrupt')
    }
    const flags = buffer.readUInt16LE(offset + 8)
    const method = buffer.readUInt16LE(offset + 10)
    const compressedSize = buffer.readUInt32LE(offset + 20)
    const uncompressedSize = buffer.readUInt32LE(offset + 24)
    const nameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    const localOffset = buffer.readUInt32LE(offset + 42)
    requireRange(buffer, offset + 46, nameLength, 'ZIP entry name')
    const name = buffer
      .toString('utf8', offset + 46, offset + 46 + nameLength)
      .replaceAll('\\', '/')
    entries.push(name)
    if (name === 'word/document.xml') {
      if ((flags & 0x1) !== 0) throw new Error('Encrypted DOCX source is unsupported')
      if (uncompressedSize > MAX_DOCUMENT_XML_BYTES) {
        throw new Error('DOCX document XML is too large')
      }
      requireRange(buffer, localOffset, 30, 'ZIP local entry')
      if (buffer.readUInt32LE(localOffset) !== LOCAL_FILE_SIGNATURE) {
        throw new Error('DOCX local entry is corrupt')
      }
      const localNameLength = buffer.readUInt16LE(localOffset + 26)
      const localExtraLength = buffer.readUInt16LE(localOffset + 28)
      const dataOffset = localOffset + 30 + localNameLength + localExtraLength
      requireRange(buffer, dataOffset, compressedSize, 'ZIP entry data')
      const compressed = buffer.subarray(dataOffset, dataOffset + compressedSize)
      const content = method === 0
        ? Buffer.from(compressed)
        : method === 8
          ? inflateRawSync(compressed)
          : null
      if (!content) throw new Error(`Unsupported DOCX ZIP compression method ${method}`)
      if (content.length !== uncompressedSize) {
        throw new Error('DOCX document XML size mismatch')
      }
      documentXml = {
        compressedRange: { start: dataOffset, end: dataOffset + compressedSize },
        text: content.toString('utf8'),
      }
    }
    offset += 46 + nameLength + extraLength + commentLength
  }
  if (!documentXml) throw new Error('DOCX document XML is missing')
  return { documentXml, entries }
}

function decodeXml(value) {
  return String(value || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
}

/**
 * Extract the textual body from one immutable DOCX without using a platform
 * converter. This intentionally preserves paragraph and hard-break boundaries
 * so a profile adapter may make its own deterministic structural decisions.
 */
export function extractDocxDocumentText(docxBytes) {
  if (!(docxBytes instanceof Uint8Array) || docxBytes.byteLength === 0) {
    throw new TypeError('DOCX text extraction requires immutable DOCX bytes')
  }
  const xml = readDocxPackage(docxBytes).documentXml.text
  return decodeXml(
    xml
      .replace(/<w:tab\b[^>]*\/?\s*>/g, '\t')
      .replace(/<w:(?:br|cr)\b[^>]*\/?\s*>/g, '\n')
      .replace(/<\/w:p>/g, '\n')
      .replace(/<[^>]+>/g, ''),
  )
}

function rawGroupsBySlot(parsed) {
  return new Map([
    ...parsed.readingGroups.map((group, index) => [`reading.${'abcd'[index]}`, group]),
    ['reading.seven-choices', parsed.seven],
    ['language.cloze', parsed.cloze],
    ['language.grammar-fill', parsed.grammar],
    ['writing.application', parsed.application],
    ['writing.continuation', parsed.continuation],
  ])
}

function hydrateSevenChoiceBank(parsed, rawText) {
  const title = parsed.seven.paragraphs[0]?.text
  const start = typeof title === 'string' ? rawText.indexOf(title) : -1
  const answerStart = start >= 0 ? rawText.indexOf('【答案】[[', start) : -1
  if (start < 0 || answerStart < 0) return
  parsed.seven.optionBank = [...rawText.slice(start, answerStart).matchAll(
    /(?:^|\n)[ \t　]*([A-G])[．.]\s*([^\n]+)/g,
  )].map((match) => ({ label: match[1], text: match[2].trim() }))
}

function objectiveQuestions(parsed) {
  return [
    ...parsed.readingGroups.flatMap((group) => group.questions),
    ...parsed.seven.questions,
    ...parsed.cloze.questions,
    ...parsed.grammar.questions,
  ]
}

const familyBySlot = new Map([
  ['reading.a', 'reading'],
  ['reading.b', 'reading'],
  ['reading.c', 'reading'],
  ['reading.d', 'reading'],
  ['reading.seven-choices', 'seven-choices'],
  ['language.cloze', 'cloze'],
  ['language.grammar-fill', 'grammar-fill'],
  ['writing.application', 'application-writing'],
  ['writing.continuation', 'continuation-writing'],
])

function contentText(nodeId, text) {
  return [{ kind: 'text', nodeId, text: String(text || '') }]
}

function markerNumber(question) {
  return String(question.questionNo || question.stem || '')
}

function paragraphBlocks(rawGroup, blankIds = []) {
  const blankIdByMarker = new Map((rawGroup.questions || []).map((question, index) => [
    markerNumber(question),
    blankIds[index],
  ]))
  const markerPattern = rawGroup.groupType === 'sevenChoices'
    ? new RegExp(
        `(?<!\\d)(${(rawGroup.questions || []).map(markerNumber).join('|')})(?!\\d)`,
        'g',
      )
    : /__(\d+)__/g
  return (rawGroup.paragraphs || []).map((paragraph, index) => {
    const inlines = []
    const text = String(paragraph.text || '')
    let cursor = 0
    let match
    while ((match = markerPattern.exec(text)) !== null) {
      if (match.index > cursor) {
        inlines.push({
          kind: 'text',
          nodeId: `text:${paragraph.id || rawGroup.groupId}:${cursor}`,
          text: text.slice(cursor, match.index),
        })
      }
      const blankId = blankIdByMarker.get(match[1])
      inlines.push(blankId
        ? { kind: 'blank_ref', nodeId: `blank-ref:${blankId}`, blankId }
        : {
            kind: 'text',
            nodeId: `text:${paragraph.id || rawGroup.groupId}:${match.index}`,
            text: match[0],
          })
      cursor = match.index + match[0].length
    }
    if (cursor < text.length || inlines.length === 0) {
      inlines.push({
        kind: 'text',
        nodeId: `text:${paragraph.id || rawGroup.groupId}:${cursor || index}`,
        text: text.slice(cursor),
      })
    }
    return {
      kind: 'paragraph',
      nodeId: paragraph.id || `paragraph:${rawGroup.groupId}:${index + 1}`,
      inlines,
    }
  })
}

function optionContent(groupId, questionId, options) {
  return Object.entries(options || {}).map(([label, text]) => ({
    optionId: `option:${questionId}:${label}`,
    label,
    content: contentText(`text:${groupId}:${questionId}:option:${label}`, text),
  }))
}

function choiceOwnership(rawGroup, family) {
  if (family === 'seven-choices') {
    return {
      ownership: 'shared_bank',
      bankId: `bank:${rawGroup.groupId}`,
      options: (rawGroup.optionBank || []).map((option) => ({
        optionId: `option:${option.label}`,
        label: option.label,
        content: contentText(
          `text:${rawGroup.groupId}:option:${option.label}`,
          option.text,
        ),
      })),
    }
  }
  if (family === 'reading' || family === 'cloze') {
    return {
      ownership: 'per_question',
      sets: rawGroup.questions.map((question) => ({
        questionId: question.id,
        options: optionContent(rawGroup.groupId, question.id, question.options),
      })),
    }
  }
  return { ownership: 'none' }
}

function wordCountTarget(rawText, label) {
  const match = new RegExp(`${label}词数应为\\s*(\\d+)\\s*个左右`).exec(rawText)
  if (!match) throw new Error(`DOCX source lacks ${label} word-count instruction`)
  return Number(match[1])
}

function deriveVariant(rawGroup, family, blankIds, rawText) {
  const ownership = choiceOwnership(rawGroup, family)
  if (family === 'reading') {
    return {
      family,
      passageBlockRoles: [],
      questions: rawGroup.questions.map((question) => ({
        questionId: question.id,
        stem: contentText(`text:${question.id}:stem`, question.stem),
        correctOptionId: `option:${question.id}:${question.answerKey}`,
      })),
      choiceOwnership: ownership,
    }
  }
  if (family === 'seven-choices') {
    return {
      family,
      choiceOwnership: ownership,
      members: rawGroup.questions.map((question, index) => ({
        questionId: question.id,
        blankId: blankIds[index],
        answer: {
          optionId: `option:${question.answerKey}`,
          authorityAssertionRef: `answer:${question.id}`,
        },
      })),
    }
  }
  if (family === 'grammar-fill') {
    return {
      family,
      choiceOwnership: ownership,
      promptBindings: blankIds.map((blankId) => ({
        blankId,
        provision: 'source_proven_none',
        authorityObservationRef: `observation:grammar-fill-prompt:${blankId}`,
      })),
    }
  }
  if (family === 'application-writing') {
    const groupId = rawGroup.groupId
    const blockId = `paragraph:${groupId}:prompt`
    const inlineNodeIds = [`text:${groupId}:prompt`]
    const contentRef = { blockId, inlineNodeIds }
    return {
      family,
      writingTaskId: `writing-task:${groupId}`,
      promptBlockRefs: [blockId],
      situation: {
        writerRole: contentRef,
        audienceOrDestination: contentRef,
        deliverable: contentRef,
        communicativePurpose: contentRef,
      },
      contentRequirements: [{
        requirementId: `requirement:${groupId}:1`,
        contentRef,
      }],
      wordCountRuling: {
        kind: 'approximate_target',
        target: wordCountTarget(rawText, '写作'),
        countScope: 'student_authored_only',
        sourceRef: contentRef,
        authorityObservationRef: `observation:${groupId}:word-count`,
      },
      givenSkeleton: {
        presence: 'none',
        answerRegionAbsenceAssertionRef:
          `observation:${groupId}:answer-region-empty`,
      },
      choiceOwnership: ownership,
      response: {
        kind: 'group_level_written_response',
        answerRegionRef: 'writing.application-box',
        authorityObservationRef: `observation:${groupId}:response`,
      },
    }
  }
  if (family === 'continuation-writing') {
    const groupId = rawGroup.groupId
    const materialBlockId = `paragraph:${groupId}:material`
    const starterBlockIds = [1, 2].map(
      (index) => `paragraph:${groupId}:starter:${index}`,
    )
    if ((rawGroup.continuationStarters || []).length !== starterBlockIds.length) {
      throw new Error('DOCX source continuation starters are incomplete')
    }
    return {
      family,
      writingTaskId: `writing-task:${groupId}`,
      materialBlockRefs: [materialBlockId],
      wordCountRuling: {
        kind: 'approximate_target',
        target: wordCountTarget(rawText, '续写'),
        countScope: 'student_authored_only',
        sourceRef: {
          blockId: materialBlockId,
          inlineNodeIds: [`text:${groupId}:material`],
        },
        authorityObservationRef: `observation:${groupId}:word-count`,
      },
      starterProvision: {
        kind: 'ordered_source_starters',
        starters: starterBlockIds.map((contentRef, index) => ({
          starterId: `starter:${groupId}:${index + 1}`,
          contentRef,
          authorityObservationRef: `observation:${groupId}:starter:${index + 1}`,
        })),
      },
      choiceOwnership: ownership,
      response: {
        kind: 'group_level_written_response',
        answerRegionRef: 'writing.continuation-box',
        authorityObservationRef: `observation:${groupId}:response`,
      },
    }
  }
  return { family, choiceOwnership: ownership }
}

function deriveContent(rawGroup, family, blankIds) {
  if (family === 'application-writing') {
    const groupId = rawGroup.groupId
    return {
      blocks: [{
        kind: 'paragraph',
        nodeId: `paragraph:${groupId}:prompt`,
        inlines: contentText(
          `text:${groupId}:prompt`,
          rawGroup.paragraphs.map((paragraph) => paragraph.text).join('\n'),
        ),
      }],
    }
  }
  if (family === 'continuation-writing') {
    const groupId = rawGroup.groupId
    return {
      blocks: [
        {
          kind: 'paragraph',
          nodeId: `paragraph:${groupId}:material`,
          inlines: contentText(
            `text:${groupId}:material`,
            rawGroup.paragraphs.map((paragraph) => paragraph.text).join('\n'),
          ),
        },
        ...(rawGroup.continuationStarters || []).map((starter, index) => ({
          kind: 'paragraph',
          nodeId: `paragraph:${groupId}:starter:${index + 1}`,
          inlines: contentText(
            `text:${groupId}:starter:${index + 1}`,
            starter,
          ),
        })),
      ],
    }
  }
  return { blocks: paragraphBlocks(rawGroup, blankIds) }
}

function sourceObservation({ observationId, kind, value, sourceByteRange }) {
  return {
    observationId,
    kind,
    documentInputKey: 'source_docx',
    value,
    span: { ...sourceByteRange },
    extraction: { adapterId: 'docx-source-envelope', version: '1' },
  }
}

function writingObservations(group, family, sourceByteRange) {
  const groupId = group.groupId
  if (family === 'application-writing') {
    return [
      sourceObservation({
        observationId: `observation:${groupId}:answer-region-empty`,
        kind: 'application_answer_region_absence',
        value: { groupId, answerRegionRef: 'writing.application-box' },
        sourceByteRange,
      }),
      sourceObservation({
        observationId: `observation:${groupId}:word-count`,
        kind: 'application_word_count_ruling',
        value: {
          groupId,
          target: group.variant.wordCountRuling.target,
          countScope: 'student_authored_only',
        },
        sourceByteRange,
      }),
      sourceObservation({
        observationId: `observation:${groupId}:response`,
        kind: 'application_response_binding',
        value: {
          groupId,
          writingTaskId: group.variant.writingTaskId,
          answerRegionRef: group.variant.response.answerRegionRef,
        },
        sourceByteRange,
      }),
    ]
  }
  if (family === 'continuation-writing') {
    return [
      sourceObservation({
        observationId: `observation:${groupId}:word-count`,
        kind: 'continuation_word_count_ruling',
        value: {
          groupId,
          target: group.variant.wordCountRuling.target,
          countScope: 'student_authored_only',
        },
        sourceByteRange,
      }),
      ...group.variant.starterProvision.starters.map((starter) =>
        sourceObservation({
          observationId: starter.authorityObservationRef,
          kind: 'continuation_source_starter',
          value: {
            groupId,
            starterId: starter.starterId,
            contentRef: starter.contentRef,
          },
          sourceByteRange,
        })),
      sourceObservation({
        observationId: `observation:${groupId}:response`,
        kind: 'continuation_response_binding',
        value: {
          groupId,
          writingTaskId: group.variant.writingTaskId,
          answerRegionRef: group.variant.response.answerRegionRef,
        },
        sourceByteRange,
      }),
    ]
  }
  return []
}

function deriveNck1Identity(rawText) {
  const title = /^\s*(\d{4})年全国高考一卷英语真题/m.exec(rawText)
  if (!title) throw new Error('DOCX source lacks a supported NCK1 paper identity')
  return { paperId: `paper-${title[1]}-i`, profileId: 'nck1' }
}

/**
 * Derive the complete compiler source from immutable DOCX bytes. The envelope
 * may assert this value, but none of its caller-authored fields are consumed.
 */
export function deriveDocxCanonicalSource(docxBytes) {
  const { documentXml } = readDocxPackage(docxBytes)
  const rawText = extractDocxDocumentText(docxBytes)
  const identity = deriveNck1Identity(rawText)
  const parsed = buildGroups(rawText, identity.paperId)
  hydrateSevenChoiceBank(parsed, rawText)
  const sourceByteRange = documentXml.compressedRange
  const observations = []
  const groups = [...rawGroupsBySlot(parsed)].map(([slotId, rawGroup]) => {
    const family = familyBySlot.get(slotId)
    if (!family) throw new Error(`DOCX source slot ${slotId} is unsupported`)
    const blankIds = [...(rawGroup.blankIds || [])]
    const group = {
      groupId: rawGroup.groupId,
      slotId,
      family,
      questionIds: rawGroup.questions.map((question) => question.id),
      blankIds,
      sourceSpanId: `source-span:observation:${slotId}`,
      content: deriveContent(rawGroup, family, blankIds),
      media: [],
      variant: deriveVariant(rawGroup, family, blankIds, rawText),
      sourceSpanRefsByTarget: family === 'grammar-fill'
        ? Object.fromEntries(blankIds.map((blankId) => [
            `prompt_provision:${blankId}`,
            [`source-span:observation:grammar-fill-prompt:${blankId}`],
          ]))
        : {},
    }
    observations.push(sourceObservation({
      observationId: `observation:${slotId}`,
      kind: 'docx_section',
      value: slotId,
      sourceByteRange,
    }))
    if (family === 'grammar-fill') {
      observations.push(...blankIds.map((blankId) => sourceObservation({
        observationId: `observation:grammar-fill-prompt:${blankId}`,
        kind: 'grammar_fill_prompt_provision',
        value: { blankId, provision: 'source_proven_none' },
        sourceByteRange,
      })))
    }
    observations.push(...writingObservations(group, family, sourceByteRange))
    return group
  })
  const groupByQuestionId = new Map(groups.flatMap((group) =>
    group.questionIds.map((questionId) => [questionId, group])))
  return {
    ...identity,
    sourceAssetVersion: 1,
    profileInstructionSourceDigest: sha256(docxBytes),
    observations,
    assertions: objectiveQuestions(parsed).map((question) => ({
      assertionId: `answer:${question.id}`,
      questionId: question.id,
      answer: question.answerKey,
      authority: 'official',
      sourceSpanId: groupByQuestionId.get(question.id).sourceSpanId,
    })),
    groups,
    transformations: [],
    inactiveSlots: {},
    inactiveSourceClosures: [],
  }
}

/**
 * Inspect the inactive NCK1 Listening slice directly from the immutable DOCX.
 * Absence is evidence only for optional timing and package audio inventory;
 * the ten transcript segments remain required and therefore fail closed when
 * the DOCX does not contain them.
 */
export function inspectDocxListeningEvidence(docxBytes) {
  const { documentXml, entries } = readDocxPackage(docxBytes)
  const rawText = extractDocxDocumentText(docxBytes)
  const listeningStart = rawText.indexOf('一、听力选择题')
  const readingStart = rawText.indexOf('二、阅读理解')
  if (listeningStart < 0 || readingStart <= listeningStart) {
    throw new Error('DOCX source lacks a bounded NCK1 listening section')
  }
  const sourceSlice = rawText.slice(listeningStart, readingStart)
  const questions = [...sourceSlice.matchAll(
    /(?:^|\n)(?:\(\d+\)\s*(?:\([^\n)]*分\))?|[1-5]\.\([^\n)]*分\))\s*([^\n?]+\?)\nA．([^\n]+)\nB．([^\n]+)\nC．([^\n]+)\n【答案】\s*([ABC])/gm,
  )].map((match, index) => ({
    questionNo: index + 1,
    stem: match[1].trim(),
    options: { A: match[2].trim(), B: match[3].trim(), C: match[4].trim() },
    answer: match[5],
  }))
  const transcriptMarkers = [...rawText.matchAll(
    /(?:^|\n)\s*Text\s*(10|[1-9])\b/gm,
  )]
  const transcriptSegments = transcriptMarkers.map((match, index) => {
    const start = match.index
    const nextStart = transcriptMarkers[index + 1]?.index
    const referenceAnswerStart = rawText.indexOf('---参考答案---', start)
    const end = nextStart
      ?? (referenceAnswerStart >= 0 ? referenceAnswerStart : rawText.length)
    const text = rawText.slice(start, end)
    return {
      textId: `Text ${match[1]}`,
      extractedTextStart: start,
      extractedTextEnd: end,
      extractedTextDigest: sha256(new TextEncoder().encode(text)),
    }
  })
  const transcriptIds = transcriptSegments.map((segment) =>
    Number(segment.textId.slice('Text '.length)))
  const audioEntries = entries.filter((entry) =>
    /\.(?:mp3|m4a|wav|aac|ogg)$/i.test(entry))
  return {
    sourceSlice: {
      kind: 'docx_extracted_text_range',
      documentXmlCompressedRange: { ...documentXml.compressedRange },
      extractedTextStart: listeningStart,
      extractedTextEnd: readingStart,
      extractedTextDigest: sha256(new TextEncoder().encode(sourceSlice)),
    },
    questions,
    transcript: {
      expectedSegmentCount: 10,
      segmentIds: transcriptIds,
      segments: transcriptSegments,
      coverage: transcriptIds.length === 10
        && transcriptIds.every((value, index) => value === index + 1)
        ? 'exactly_once'
        : 'incomplete_source',
    },
    timing: {
      disposition: /(?:timeRange|timingTable|\b\d+[′']\d+[″"])/.test(rawText)
        ? 'supplied_unparsed'
        : 'not_supplied',
    },
    audio: audioEntries.length === 0
      ? { disposition: 'not_supplied', packageEntries: [] }
      : { disposition: 'captured_uninterpreted', packageEntries: audioEntries },
  }
}

/**
 * Re-open and parse the immutable DOCX at the public compiler boundary. This
 * makes the envelope a transport shape rather than semantic authority.
 */
export function inspectDocxEnvelopeSource(docxBytes, source) {
  const { documentXml } = readDocxPackage(docxBytes)
  const rawText = extractDocxDocumentText(docxBytes)
  const derivedSource = deriveDocxCanonicalSource(docxBytes)
  const completeSourceMatches = digestJson(source) === digestJson(derivedSource)
  const listening = inspectDocxListeningEvidence(docxBytes)
  const inactiveClosureMatches = listening.transcript.coverage === 'exactly_once'
    || (
      Object.keys(derivedSource.inactiveSlots).length === 0
      && derivedSource.inactiveSourceClosures.length === 0
    )
  return {
    ok: completeSourceMatches && inactiveClosureMatches,
    verifiedSource: completeSourceMatches ? derivedSource : null,
    sourceByteRange: documentXml.compressedRange,
    rawTextDigest: sha256(new TextEncoder().encode(rawText)),
    completeSourceMatches,
    derivedSourceDigest: digestJson(derivedSource),
    inactiveClosureMatches,
    listening,
  }
}

function immutableDocument(document) {
  if (
    !document
    || typeof document.inputKey !== 'string'
    || !Array.isArray(document.roles)
    || !(document.bytes instanceof Uint8Array)
    || typeof document.declared?.mediaType !== 'string'
  ) {
    throw new TypeError('DOCX source adapter supplemental evidence must be immutable documents')
  }
  return {
    inputKey: document.inputKey,
    roles: [...document.roles],
    bytes: new Uint8Array(document.bytes),
    declared: {
      mediaType: document.declared.mediaType,
      ...(document.declared.originalName
        ? { originalName: document.declared.originalName }
        : {}),
    },
  }
}

/**
 * Package structured source facts with their immutable DOCX evidence. The
 * compiler owns validation and never treats this as a legacy asset projection.
 */
export function buildDocxCanonicalImportRequest({
  docxBytes,
  source,
  originalName = 'source.docx',
  supplementalDocuments = [],
}) {
  if (!(docxBytes instanceof Uint8Array) || docxBytes.byteLength === 0) {
    throw new TypeError('DOCX source adapter requires immutable DOCX bytes')
  }
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new TypeError('DOCX source adapter requires structured source facts')
  }
  if (!Array.isArray(supplementalDocuments)) {
    throw new TypeError('DOCX source adapter supplemental evidence must be an array')
  }
  const supplemental = supplementalDocuments.map(immutableDocument)
  const inputKeys = new Set(['source_docx', 'docx_source_envelope'])
  for (const document of supplemental) {
    if (inputKeys.has(document.inputKey)) {
      throw new TypeError(`DOCX source adapter duplicate evidence input ${document.inputKey}`)
    }
    inputKeys.add(document.inputKey)
  }

  const sourceDocument = {
    inputKey: 'source_docx',
    mediaType: DOCX_MEDIA_TYPE,
    sha256: sha256(docxBytes),
    byteLength: docxBytes.byteLength,
  }
  const envelope = {
    schemaVersion: 'docx-source-envelope-v1',
    sourceDocument,
    source,
  }
  return {
    authority: canonicalAuthorityRef,
    evidence: {
      documents: [
        {
          inputKey: sourceDocument.inputKey,
          roles: [
            'question_source',
            'official_answer_source',
            'source_provenance',
          ],
          bytes: new Uint8Array(docxBytes),
          declared: { mediaType: DOCX_MEDIA_TYPE, originalName },
        },
        {
          inputKey: 'docx_source_envelope',
          roles: ['operator_assertions'],
          bytes: textEncoder.encode(JSON.stringify(envelope)),
          declared: {
            mediaType: DOCX_SOURCE_ENVELOPE_MEDIA_TYPE,
            originalName: 'docx-source-envelope.json',
          },
        },
        ...supplemental,
      ],
    },
  }
}
