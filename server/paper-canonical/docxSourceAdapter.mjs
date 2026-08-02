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

function projectedOptions(options) {
  return Object.entries(options || {}).map(([label, text]) => ({
    label,
    text: projectedText(text),
  }))
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

function projectedText(value) {
  return String(value || '')
}

function sourceInlineProjection(inlines) {
  return (inlines || []).map((inline) => inline.kind === 'text'
    ? { kind: 'text', text: projectedText(inline.text) }
    : inline.kind === 'blank_ref'
      ? { kind: 'blank_ref', blankId: inline.blankId }
      : { kind: inline.kind })
}

function parsedParagraphProjection(rawGroup, family) {
  if (family === 'application-writing') {
    return [{
      kind: 'paragraph',
      inlines: [{
        kind: 'text',
        text: projectedText(rawGroup.paragraphs.map((paragraph) => paragraph.text).join('\n')),
      }],
    }]
  }
  if (family === 'continuation-writing') {
    return [
      {
        kind: 'paragraph',
        inlines: [{
          kind: 'text',
          text: projectedText(rawGroup.paragraphs.map((paragraph) => paragraph.text).join('\n')),
        }],
      },
      ...(rawGroup.continuationStarters || []).map((starter) => ({
        kind: 'paragraph',
        inlines: [{ kind: 'text', text: projectedText(starter) }],
      })),
    ]
  }
  const blankIdByMarker = new Map((rawGroup.questions || []).map((question, index) => [
    String(question.questionNo || question.stem || ''),
    rawGroup.blankIds?.[index],
  ]))
  return (rawGroup.paragraphs || []).map((paragraph) => {
    const text = String(paragraph.text || '')
    const markerPattern = family === 'seven-choices'
      ? new RegExp(`(?<!\\d)(${[...blankIdByMarker.keys()].join('|')})(?!\\d)`, 'g')
      : family === 'cloze' || family === 'grammar-fill'
        ? /__(\d+)__/g
        : null
    if (!markerPattern) {
      return {
        kind: 'paragraph',
        inlines: [{ kind: 'text', text: projectedText(text) }],
      }
    }
    const inlines = []
    let cursor = 0
    let match
    while ((match = markerPattern.exec(text)) !== null) {
      if (match.index > cursor) {
        inlines.push({
          kind: 'text',
          text: projectedText(text.slice(cursor, match.index)),
        })
      }
      inlines.push({ kind: 'blank_ref', blankId: blankIdByMarker.get(match[1]) })
      cursor = match.index + match[0].length
    }
    if (cursor < text.length || inlines.length === 0) {
      inlines.push({ kind: 'text', text: projectedText(text.slice(cursor)) })
    }
    return { kind: 'paragraph', inlines }
  })
}

function parsedChoiceOwnership(group, family) {
  if (family === 'seven-choices') {
    return {
      ownership: 'shared_bank',
      owner: group.groupId,
      options: (group.optionBank || []).map((option) => ({
        optionId: `option:${option.label}`,
        label: option.label,
        text: projectedText(option.text),
      })),
    }
  }
  if (family === 'reading' || family === 'cloze') {
    return {
      ownership: 'per_question',
      sets: group.questions.map((question) => ({
        questionId: question.id,
        options: projectedOptions(question.options).map((option) => ({
          optionId: `option:${question.id}:${option.label}`,
          ...option,
        })),
      })),
    }
  }
  return { ownership: 'none' }
}

function sourceChoiceOwnership(group) {
  const ownership = group.variant?.choiceOwnership
  if (ownership?.ownership === 'shared_bank') {
    return {
      ownership: 'shared_bank',
      owner: group.groupId,
      options: (ownership.options || []).map((option) => ({
        optionId: option.optionId,
        label: option.label,
        text: projectedText(option.content?.[0]?.text),
      })),
    }
  }
  if (ownership?.ownership === 'per_question') {
    return {
      ownership: 'per_question',
      sets: (ownership.sets || []).map((set) => ({
        questionId: set.questionId,
        options: (set.options || []).map((option) => ({
          optionId: option.optionId,
          label: option.label,
          text: projectedText(option.content?.[0]?.text),
        })),
      })),
    }
  }
  return { ownership: ownership?.ownership }
}

function parsedQuestionProjection(group, family) {
  if (family === 'reading') {
    return group.questions.map((question) => ({
      questionId: question.id,
      stem: [{ kind: 'text', text: projectedText(question.stem) }],
      correctOptionId: `option:${question.id}:${question.answerKey}`,
    }))
  }
  if (family === 'seven-choices') {
    return group.questions.map((question, index) => ({
      questionId: question.id,
      blankId: group.blankIds[index],
      correctOptionId: `option:${question.answerKey}`,
      authorityAssertionRef: `answer:${question.id}`,
    }))
  }
  return []
}

function sourceQuestionProjection(group) {
  if (group.family === 'reading') {
    return (group.variant?.questions || []).map((question) => ({
      questionId: question.questionId,
      stem: sourceInlineProjection(question.stem),
      correctOptionId: question.correctOptionId,
    }))
  }
  if (group.family === 'seven-choices') {
    return (group.variant?.members || []).map((member) => ({
      questionId: member.questionId,
      blankId: member.blankId,
      correctOptionId: member.answer?.optionId,
      authorityAssertionRef: member.answer?.authorityAssertionRef,
    }))
  }
  return []
}

function parsedGroupProjection(slotId, group) {
  const family = familyBySlot.get(slotId)
  return {
    slotId,
    groupId: group.groupId,
    family,
    variantFamily: family,
    questionIds: group.questions.map((question) => question.id),
    blankIds: [...(group.blankIds || [])],
    content: parsedParagraphProjection(group, family),
    questions: parsedQuestionProjection(group, family),
    choiceOwnership: parsedChoiceOwnership(group, family),
    wordCountTarget: family === 'application-writing'
      ? null
      : family === 'continuation-writing'
        ? null
        : undefined,
  }
}

function sourceGroupProjection(group) {
  return {
    slotId: group.slotId,
    groupId: group.groupId,
    family: group.family,
    variantFamily: group.variant?.family,
    questionIds: [...(group.questionIds || [])],
    blankIds: [...(group.blankIds || [])],
    content: (group.content?.blocks || []).map((block) => ({
      kind: block.kind,
      inlines: sourceInlineProjection(block.inlines),
    })),
    questions: sourceQuestionProjection(group),
    choiceOwnership: sourceChoiceOwnership(group),
    wordCountTarget: group.variant?.wordCountRuling?.target,
  }
}

function semanticProjectionFromParsed(parsed, rawText) {
  const groups = [...rawGroupsBySlot(parsed)].map(([slotId, group]) => {
    const projection = parsedGroupProjection(slotId, group)
    if (projection.family === 'application-writing') {
      projection.wordCountTarget = wordCountTarget(rawText, '写作')
    } else if (projection.family === 'continuation-writing') {
      projection.wordCountTarget = wordCountTarget(rawText, '续写')
    } else {
      delete projection.wordCountTarget
    }
    return projection
  })
  return {
    profileId: 'nck1',
    groups,
    assertions: objectiveQuestions(parsed).map((question) => ({
      assertionId: `answer:${question.id}`,
      questionId: question.id,
      answer: question.answerKey,
      authority: 'official',
    })),
  }
}

function semanticProjectionFromSource(source) {
  return {
    profileId: source?.profileId,
    groups: (source?.groups || []).map(sourceGroupProjection),
    assertions: (source?.assertions || []).map((assertion) => ({
      assertionId: assertion.assertionId,
      questionId: assertion.questionId,
      answer: assertion.answer,
      authority: assertion.authority,
    })),
  }
}

function wordCountTarget(rawText, label) {
  const match = new RegExp(`${label}词数应为\\s*(\\d+)\\s*个左右`).exec(rawText)
  return match ? Number(match[1]) : null
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
  const parsed = buildGroups(rawText, source?.paperId || '')
  hydrateSevenChoiceBank(parsed, rawText)
  const derivedProjection = semanticProjectionFromParsed(parsed, rawText)
  const envelopeProjection = semanticProjectionFromSource(source)
  const semanticProjectionMatches = digestJson(envelopeProjection)
    === digestJson(derivedProjection)
  const listening = inspectDocxListeningEvidence(docxBytes)
  const inactiveClosureMatches = listening.transcript.coverage === 'exactly_once'
    || (
      Object.keys(source?.inactiveSlots || {}).length === 0
      && (source?.inactiveSourceClosures || []).length === 0
    )
  return {
    ok: semanticProjectionMatches && inactiveClosureMatches,
    verifiedSource: semanticProjectionMatches ? structuredClone(source) : null,
    sourceByteRange: documentXml.compressedRange,
    rawTextDigest: sha256(new TextEncoder().encode(rawText)),
    semanticProjectionMatches,
    derivedProjectionDigest: digestJson(derivedProjection),
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
