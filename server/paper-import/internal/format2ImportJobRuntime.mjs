import Ajv from 'ajv/dist/2020.js'
import {
  closeSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

import {
  cloneJson,
  digestJson,
  exactKeys,
  sha256,
  stableStringify,
} from '../../../shared/paper-canonical/stable.mjs'
import {
  createFileSystemCanonicalPublicationStore,
  loadPaperForConsumptionSync,
  publishCanonicalPaperPublication,
  recoverCanonicalPaperPublication,
} from '../../paper-canonical/publication.mjs'
import {
  buildConfirmedFormat2CanonicalRequest,
} from '../../paper-canonical/format2CanonicalRequest.mjs'
import {
  confirmVisualImportCandidate,
  createVisualImportCandidate,
} from '../../paper-canonical/visualCandidate.mjs'
import {
  format2VisualMediaId,
  format2VisualSourceSpanId,
} from '../../paper-canonical/format2VisualIdentity.mjs'
import {
  readingOptionFigureConsumerContractRefs,
} from '../../../shared/paper-canonical/consumers.mjs'
import { readingOptionFigureAuthorityRef } from '../../../shared/paper-canonical/authority.mjs'
import {
  validateReadingOptionFigureSourceLayoutEvidence,
} from '../../../shared/paper-canonical/readingOptionFigureLayout.mjs'
import { extractAnswerTextFromPdfBytes } from './answerTextExtraction.mjs'
import {
  describeAnswerImageRasterizer,
  renderAnswerPdfPageRegion,
} from './answerImageEvidence.mjs'
import { projectCanonicalConsumerGroup } from '../../../shared/paper-canonical/consumerProjection.mjs'
import { createExportImplementation } from '../../exports/exportImplementation.mjs'
import { buildPrintHtml } from '../../print-renderer.mjs'

const FORMAT = 'format2-pdf-pair-v1'
const RESULT_SCHEMA_VERSION = 'format2-import-job-result-v1'
const RECEIPT_SCHEMA_VERSION = 'format2-import-job-receipt-v1'
const SOURCE_PAIR_SCHEMA_VERSION = 'format2-source-pair-v1'
const STOP_CODE = 'exact_teacher_confirmation_required'
const QA_STOP_CODE = 'owner_qa_required'
const COMPLETION_FAILURE_POINT = 'after-awaiting-qa-dependencies-before-current-crash'
const QA_ACCEPTANCE_SCHEMA_VERSION = 'format2-owner-qa-acceptance-v1'
const PAPER_ID_PATTERN = /^paper-[a-z0-9]+(?:-[a-z0-9]+)*$/u
const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/u
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const transcriptionV1Schema = JSON.parse(readFileSync(
  path.join(rootDir, 'schemas/paper-import/format2-transcription-v1.schema.json'),
  'utf8',
))
const transcriptionV2Schema = JSON.parse(readFileSync(
  path.join(rootDir, 'schemas/paper-import/format2-transcription-v2.schema.json'),
  'utf8',
))
const readingChoiceAnalysisSchema = JSON.parse(readFileSync(
  path.join(rootDir, 'schemas/paper-import/reading-choice-analysis-v1.schema.json'),
  'utf8',
))
const writingAnalysisSchema = JSON.parse(readFileSync(
  path.join(rootDir, 'schemas/paper-import/writing-analysis-v1.schema.json'),
  'utf8',
))
const transcriptionAjv = new Ajv({
  allErrors: true,
  strict: false,
})
transcriptionAjv.addSchema(transcriptionV1Schema)
transcriptionAjv.addSchema(readingChoiceAnalysisSchema)
transcriptionAjv.addSchema(writingAnalysisSchema)
const validateTranscriptionSchemas = new Map([
  ['format2-transcription-v1', transcriptionAjv.getSchema(transcriptionV1Schema.$id)],
  ['format2-transcription-v2', transcriptionAjv.compile(transcriptionV2Schema)],
])
const analysisSidecarConfigs = new Map([
  ['reading-choice-analysis-v1', {
    fileName: 'reading-choice-analysis-v1.json',
    groupTypes: new Set(['reading']),
    entryKey: 'questions',
  }],
  ['seven-choices-analysis-v1', {
    fileName: 'seven-choices-analysis-v1.json',
    groupTypes: new Set(['seven_choices']),
    entryKey: 'questions',
  }],
  ['cloze-analysis-v1', {
    fileName: 'cloze-analysis-v1.json',
    groupTypes: new Set(['cloze']),
    entryKey: 'blanks',
  }],
  ['grammar-fill-analysis-v2', {
    fileName: 'grammar-fill-analysis-v1.json',
    groupTypes: new Set(['grammar_fill']),
    entryKey: 'blanks',
  }],
  ['writing-analysis-v1', {
    fileName: 'writing-analysis-v1.json',
    groupTypes: new Set(['application_writing', 'continuation_writing']),
    entryKey: 'groups',
  }],
])

function format2Error(code, message, diagnostics = []) {
  const error = new Error(message)
  error.code = code
  error.diagnostics = diagnostics.length > 0
    ? diagnostics
    : [{ code, message }]
  return error
}

function fail(code, message, diagnostics) {
  throw format2Error(code, message, diagnostics)
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function sameValue(left, right) {
  return stableStringify(left) === stableStringify(right)
}

function sourceMeasuredFigureLayoutIssues({
  transcription,
  questions,
  visualsByObservation,
  questionPdfSha256,
}) {
  const layouts = transcription.sourceMeasuredFigureLayouts || []
  if (layouts.length === 0) return []
  const issues = []
  const questionIds = new Set()
  for (const [layoutIndex, layout] of layouts.entries()) {
    const layoutPath = `/sourceMeasuredFigureLayouts/${layoutIndex}`
    const intent = layout.intent
    if (questionIds.has(intent.questionId)) {
      issues.push(semanticIssue(
        'FORMAT2_SOURCE_LAYOUT_DUPLICATE',
        `${layoutPath}/intent/questionId`,
        'One Reading Figure Option Question may bind only one source-measured layout intent',
      ))
      continue
    }
    questionIds.add(intent.questionId)
    const record = questions.get(intent.questionId)
    const question = record?.question
    const figureOptions = question?.options?.filter(
      (option) => option.contentKind === 'figure',
    ) || []
    if (
      record?.group?.groupType !== 'reading'
      || figureOptions.length !== 4
      || question.options.length !== 4
    ) {
      issues.push(semanticIssue(
        'FORMAT2_SOURCE_LAYOUT_OWNER_INVALID',
        `${layoutPath}/intent/questionId`,
        'Source-measured layout must bind one homogeneous A-D Reading Figure Option Question',
      ))
      continue
    }
    const expectedOptions = question.options.map((option) => {
      const visual = visualsByObservation.get(option.visualObservationId)
      return {
        optionId: option.optionId,
        label: option.label,
        sourceSpanId: visual
          ? format2VisualSourceSpanId(visual)
          : `source-span:${option.visualObservationId}`,
        page: visual?.source?.page,
        pageSizePoints: visual?.source?.pageSizePoints,
        pointGeometry: visual?.source?.pointGeometry,
      }
    })
    try {
      validateReadingOptionFigureSourceLayoutEvidence({
        layout,
        sourceDocumentSha256: questionPdfSha256,
        questionId: question.questionId,
        expectedOptions,
      })
    } catch (error) {
      const code = ({
        intent: 'FORMAT2_SOURCE_LAYOUT_INTENT_INVALID',
        evidence: 'FORMAT2_SOURCE_LAYOUT_EVIDENCE_INVALID',
        owner: 'FORMAT2_SOURCE_LAYOUT_OWNER_INVALID',
        placement: 'FORMAT2_SOURCE_LAYOUT_PLACEMENT_INVALID',
      })[error?.reason] || 'FORMAT2_SOURCE_LAYOUT_INTENT_INVALID'
      issues.push(semanticIssue(code, layoutPath, error.message))
    }
  }
  return issues
}

function stableId(prefix, value) {
  return `${prefix}:${digestJson(value).slice('sha256:'.length, 28)}`
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`)
}

function atomicWrite(filePath, bytes) {
  mkdirSync(path.dirname(filePath), { recursive: true })
  const temporary = `${filePath}.tmp-${process.pid}`
  writeFileSync(temporary, bytes)
  renameSync(temporary, filePath)
}

function writeImmutable(filePath, bytes, label) {
  if (existsSync(filePath)) {
    const existing = readFileSync(filePath)
    if (!existing.equals(Buffer.from(bytes))) {
      fail('FORMAT2_JOB_DURABLE_STATE_CONFLICT', `${label} conflicts with immutable durable evidence`)
    }
    return
  }
  atomicWrite(filePath, bytes)
}

function readJson(filePath, label) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'))
  } catch (error) {
    fail('FORMAT2_JOB_DURABLE_STATE_INVALID', `${label} is unreadable: ${error.message}`)
  }
}

function failureResult(error) {
  const code = nonEmptyString(error?.code)
    ? error.code
    : 'FORMAT2_JOB_INTERNAL_ERROR'
  const message = nonEmptyString(error?.message)
    ? error.message
    : 'Format 2 Import Job failed without a stable diagnostic'
  return {
    schemaVersion: RESULT_SCHEMA_VERSION,
    paperId: null,
    provenance: null,
    jobId: null,
    lifecycle: 'failed',
    stopReason: { code },
    diagnostics: Array.isArray(error?.diagnostics)
      ? cloneJson(error.diagnostics)
      : [{ code, message }],
    artifacts: {},
    humanEntryPoints: null,
    canonicalPublication: null,
  }
}

function validateOperationInput(input) {
  if (!exactKeys(input, ['paperId', 'sources', 'provenance', 'transcription', 'state'])) {
    fail(
      'FORMAT2_JOB_REQUEST_INVALID',
      'Format 2 Job accepts only paperId, sources, provenance, transcription, and state',
    )
  }
  if (!PAPER_ID_PATTERN.test(input.paperId)) {
    fail('FORMAT2_JOB_PAPER_ID_UNSAFE', 'Format 2 Job paperId is unsafe')
  }
  if (
    !exactKeys(input.provenance, ['paperName', 'sourceLabel'])
    || !nonEmptyString(input.provenance.paperName)
    || !nonEmptyString(input.provenance.sourceLabel)
  ) {
    fail('FORMAT2_JOB_PROVENANCE_INVALID', 'Format 2 Job provenance must bind paperName and sourceLabel')
  }
  if (!exactKeys(input.state, ['writerId']) || !nonEmptyString(input.state.writerId)) {
    fail('FORMAT2_JOB_STATE_INVALID', 'Format 2 Job state must identify one writer')
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/u.test(input.state.writerId)) {
    fail('FORMAT2_JOB_STATE_INVALID', 'Format 2 Job writerId is unsafe')
  }
  if (
    !exactKeys(input.sources, ['schemaVersion', 'format', 'questionPdf', 'answerPdf'])
    || input.sources.schemaVersion !== SOURCE_PAIR_SCHEMA_VERSION
    || input.sources.format !== FORMAT
  ) {
    fail('FORMAT2_JOB_FORMAT_UNSUPPORTED', 'Format 2 Job accepts only one question PDF plus one independent answer PDF')
  }
  for (const [key, label] of [['questionPdf', 'question PDF'], ['answerPdf', 'answer PDF']]) {
    const source = input.sources[key]
    if (
      !exactKeys(source, ['absolutePath', 'sha256'])
      || !path.isAbsolute(source.absolutePath)
      || !SHA256_PATTERN.test(source.sha256)
    ) {
      fail('FORMAT2_JOB_SOURCE_IDENTITY_INVALID', `${label} requires an absolute path and exact SHA-256 identity`)
    }
  }
  if (input.sources.questionPdf.absolutePath === input.sources.answerPdf.absolutePath) {
    fail('FORMAT2_JOB_SOURCE_IDENTITY_INVALID', 'Question and answer PDFs must be independent source files')
  }
}

function readPdfSource(source, role) {
  if (!existsSync(source.absolutePath)) {
    fail(
      role === 'answer_pdf' ? 'FORMAT2_JOB_ANSWER_SOURCE_MISSING' : 'FORMAT2_JOB_QUESTION_SOURCE_MISSING',
      `${role === 'answer_pdf' ? 'Answer' : 'Question'} PDF is missing`,
    )
  }
  const bytes = readFileSync(source.absolutePath)
  if (bytes.byteLength < 5 || bytes.subarray(0, 5).toString('ascii') !== '%PDF-') {
    fail('FORMAT2_JOB_FORMAT_UNSUPPORTED', `${role} is not a supported PDF source`)
  }
  const actualDigest = sha256(new Uint8Array(bytes))
  if (actualDigest !== source.sha256) {
    fail(
      role === 'answer_pdf'
        ? 'FORMAT2_JOB_ANSWER_SOURCE_DIGEST_MISMATCH'
        : 'FORMAT2_JOB_QUESTION_SOURCE_DIGEST_MISMATCH',
      `${role} bytes differ from the admitted source identity`,
    )
  }
  return new Uint8Array(bytes)
}

function sourceDocument({ inputKey, roles, originalName, bytes }) {
  const digest = sha256(bytes)
  const documentId = stableId('document', { digest, inputKey, roles })
  const artifactId = stableId('source-document', { sha256: digest })
  return {
    documentId,
    inputKey,
    roles,
    mediaType: 'application/pdf',
    originalName,
    byteLength: bytes.byteLength,
    sha256: digest,
    immutableArtifactRef: {
      artifactId,
      relativePath: `source-evidence/${artifactId.slice('source-document:'.length)}.bin`,
      sha256: digest,
      byteLength: bytes.byteLength,
    },
    encodedBytes: Buffer.from(bytes).toString('base64'),
  }
}

function captureExactDocuments(input) {
  const questionBytes = readPdfSource(input.sources.questionPdf, 'question_pdf')
  const answerBytes = readPdfSource(input.sources.answerPdf, 'answer_pdf')
  const questionDocument = sourceDocument({
    inputKey: 'original_question_source',
    roles: ['question_source', 'source_provenance'],
    originalName: path.basename(input.sources.questionPdf.absolutePath),
    bytes: questionBytes,
  })
  const answerDocument = sourceDocument({
    inputKey: 'listening_answer_source',
    roles: input.transcription?.listeningSource?.disposition === 'not_supplied'
      ? ['official_answer_source', 'source_provenance']
      : ['official_answer_source', 'transcript_source', 'source_provenance'],
    originalName: path.basename(input.sources.answerPdf.absolutePath),
    bytes: answerBytes,
  })
  return { questionBytes, answerBytes, questionDocument, answerDocument }
}

function transcriptionSchemaDiagnostics(transcription) {
  const validate = validateTranscriptionSchemas.get(transcription?.schemaVersion)
  if (!validate) {
    return [{
      code: 'FORMAT2_TRANSCRIPTION_SCHEMA_INVALID',
      path: '/schemaVersion',
      message: '/schemaVersion uses an unsupported Format 2 transcription contract',
    }]
  }
  if (validate(transcription)) return []
  return (validate.errors || []).map((error) => ({
    code: 'FORMAT2_TRANSCRIPTION_SCHEMA_INVALID',
    path: error.instancePath || '/',
    message: `${error.instancePath || '/'} ${error.message || 'is invalid'}`,
  }))
}

function semanticIssue(code, pathValue, message) {
  return { code, path: pathValue, message }
}

function validateAnswerTranscriptionCheck(input, answerPdfBytes) {
  const transcription = input.transcription
  const check = transcription.answerTranscriptionCheck
  const expectedAnswers = transcription.officialAnswers
  const markings = check?.sourceMarkings
  const questionNumberById = new Map(transcription.groups.flatMap((group) => (
    group.questions.map((question) => [question.questionId, question.questionNo])
  )))
  const invalidBinding = (
    !check
    || check.answerPdfSha256 !== input.sources.answerPdf.sha256
    || check.officialAnswersDigest !== digestJson(expectedAnswers)
  )
  const answersByQuestion = new Map(expectedAnswers.map((answer) => [answer.questionId, answer]))
  let invalidMarkings = (
    !Array.isArray(markings)
    || markings.length !== expectedAnswers.length
    || new Set(markings?.map((marking) => marking.questionId)).size !== expectedAnswers.length
    || markings?.some((marking) => {
      const answer = answersByQuestion.get(marking.questionId)
      return !answer
        || !questionNumberById.has(marking.questionId)
        || marking.answer !== answer.answer
        || marking.page !== answer.source.page
        || marking.questionNo !== questionNumberById.get(marking.questionId)
        || marking.questionRange?.start > marking.questionNo
        || marking.questionRange?.end < marking.questionNo
        || marking.answerOrdinal !== marking.questionNo - marking.questionRange?.start
    })
  )
  let evidenceDigest = null
  let extractedTextSha256 = null
  const markingsByEvidence = new Map()
  if (check?.evidenceKind === 'text') {
    const extractedTextBytes = new TextEncoder().encode(check.extraction.extractedText)
    const actualExtraction = extractAnswerTextFromPdfBytes(answerPdfBytes)
    invalidMarkings ||= (
      check.extraction.extractedTextSha256 !== sha256(extractedTextBytes)
      || !sameValue(check.extraction, actualExtraction)
      || markings.some((marking) => {
        const extractedPage = 1 + Buffer.from(extractedTextBytes)
          .subarray(0, marking.byteSpan.start)
          .filter((byte) => byte === 0x0c).length
        return marking.page !== extractedPage
          || marking.byteSpan.end > extractedTextBytes.byteLength
          || Buffer.from(extractedTextBytes)
            .subarray(marking.byteSpan.start, marking.byteSpan.end)
            .toString('utf8') !== marking.sourceMarking
          || marking.answerByteSpan.start < marking.byteSpan.start
          || marking.answerByteSpan.end > marking.byteSpan.end
          || Buffer.from(extractedTextBytes)
            .subarray(marking.answerByteSpan.start, marking.answerByteSpan.end)
            .toString('utf8') !== marking.answer
      })
    )
    extractedTextSha256 = check.extraction.extractedTextSha256
    evidenceDigest = extractedTextSha256
    for (const marking of markings || []) {
      const key = `${marking.byteSpan?.start}:${marking.byteSpan?.end}`
      const entries = markingsByEvidence.get(key) || []
      entries.push(marking)
      markingsByEvidence.set(key, entries)
    }
  } else if (check?.evidenceKind === 'page_image_regions') {
    const actualRasterizer = describeAnswerImageRasterizer()
    const expectedRasterizer = {
      schemaVersion: check.rasterization.schemaVersion,
      tool: check.rasterization.tool,
      toolVersion: check.rasterization.toolVersion,
      parameters: check.rasterization.parameters,
    }
    const pagesByNumber = new Map((check.pages || []).map((page) => [page.page, page]))
    const regionsById = new Map((check.regions || []).map((region) => [region.regionId, region]))
    invalidMarkings ||= (
      !sameValue(actualRasterizer, expectedRasterizer)
      || pagesByNumber.size !== check.pages.length
      || regionsById.size !== check.regions.length
    )
    if (!invalidMarkings) {
      for (const pageEvidence of check.pages) {
        const rendered = renderAnswerPdfPageRegion(answerPdfBytes, {
          page: pageEvidence.page,
          dpi: check.rasterization.dpi,
        })
        if (
          rendered.pixelWidth !== pageEvidence.pixelWidth
          || rendered.pixelHeight !== pageEvidence.pixelHeight
          || rendered.byteLength !== pageEvidence.byteLength
          || rendered.sha256 !== pageEvidence.sha256
        ) invalidMarkings = true
      }
      for (const region of check.regions) {
        const pageEvidence = pagesByNumber.get(region.page)
        if (
          !pageEvidence
          || region.pixelBox.x + region.pixelBox.width > pageEvidence.pixelWidth
          || region.pixelBox.y + region.pixelBox.height > pageEvidence.pixelHeight
        ) {
          invalidMarkings = true
          continue
        }
        const rendered = renderAnswerPdfPageRegion(answerPdfBytes, {
          page: region.page,
          dpi: check.rasterization.dpi,
          pixelBox: region.pixelBox,
        })
        if (
          rendered.pixelWidth !== region.pixelBox.width
          || rendered.pixelHeight !== region.pixelBox.height
          || rendered.byteLength !== region.byteLength
          || rendered.sha256 !== region.sha256
        ) invalidMarkings = true
      }
    }
    invalidMarkings ||= markings.some((marking) => {
      const region = regionsById.get(marking.regionId)
      return !region || region.page !== marking.page
    })
    evidenceDigest = digestJson({
      rasterization: check.rasterization,
      pages: check.pages,
      regions: check.regions,
    })
    for (const marking of markings || []) {
      const entries = markingsByEvidence.get(marking.regionId) || []
      entries.push(marking)
      markingsByEvidence.set(marking.regionId, entries)
    }
  } else {
    invalidMarkings = true
  }
  const invalidRangeCoverage = [...markingsByEvidence.values()].some((entries) => {
    const first = entries[0]
    const start = first?.questionRange?.start
    const end = first?.questionRange?.end
    const expectedCount = end - start + 1
    return !Number.isInteger(start)
      || !Number.isInteger(end)
      || end < start
      || entries.length !== expectedCount
      || entries.some((marking) => (
        !sameValue(marking.questionRange, first.questionRange)
        || (check.evidenceKind === 'text' && !sameValue(marking.byteSpan, first.byteSpan))
        || (check.evidenceKind === 'page_image_regions' && marking.regionId !== first.regionId)
        || marking.sourceMarking !== first.sourceMarking
      ))
      || !Array.from({ length: expectedCount }, (_value, index) => start + index)
        .every((questionNo) => entries.some((marking) => (
          marking.questionNo === questionNo
          && marking.answerOrdinal === questionNo - start
        )))
  })
  if (invalidBinding || invalidMarkings || invalidRangeCoverage) {
    fail(
      'FORMAT2_ANSWER_TRANSCRIPTION_CHECK_INVALID',
      'AI Answer Transcription Check must bind the admitted answer PDF and match every official answer source marking',
    )
  }
  return {
    answerPdfSha256: check.answerPdfSha256,
    officialAnswersDigest: check.officialAnswersDigest,
    checkDigest: digestJson(check),
    evidenceKind: check.evidenceKind,
    evidenceDigest,
    ...(extractedTextSha256 ? { extractedTextSha256 } : {}),
    markingCount: markings.length,
  }
}

function validateTranscriptionSemantics(input, answerPdfBytes) {
  const transcription = input.transcription
  const schemaDiagnostics = transcriptionSchemaDiagnostics(transcription)
  if (schemaDiagnostics.length > 0) {
    fail(
      'FORMAT2_TRANSCRIPTION_SCHEMA_INVALID',
      'Format 2 transcription does not match its declared schema version',
      schemaDiagnostics,
    )
  }
  const issues = []
  if (transcription.paperId !== input.paperId) {
    issues.push(semanticIssue(
      'FORMAT2_TRANSCRIPTION_PAPER_MISMATCH',
      '/paperId',
      'Transcription paperId differs from the Job identity',
    ))
  }
  if (transcription.format !== FORMAT) {
    issues.push(semanticIssue(
      'FORMAT2_TRANSCRIPTION_FORMAT_UNSUPPORTED',
      '/format',
      'Transcription is not a supported Format 2 PDF pair',
    ))
  }
  if (!sameValue(transcription.provenance, input.provenance)) {
    issues.push(semanticIssue(
      'FORMAT2_TRANSCRIPTION_PROVENANCE_MISMATCH',
      '/provenance',
      'Transcription provenance differs from the Job provenance',
    ))
  }
  if (
    transcription.sourceBindings.questionPdfSha256 !== input.sources.questionPdf.sha256
    || transcription.sourceBindings.answerPdfSha256 !== input.sources.answerPdf.sha256
  ) {
    issues.push(semanticIssue(
      'FORMAT2_TRANSCRIPTION_SOURCE_MISMATCH',
      '/sourceBindings',
      'Transcription source bindings differ from the admitted PDF pair',
    ))
  }

  const groups = new Map()
  const questions = new Map()
  const questionNumbers = new Set()
  const answerRefs = new Set()
  const blockIds = new Set()
  const slotIds = new Set()
  const visualReferences = new Map()
  for (const [groupIndex, group] of transcription.groups.entries()) {
    const groupPath = `/groups/${groupIndex}`
    if (groups.has(group.groupId)) {
      issues.push(semanticIssue('FORMAT2_TRANSCRIPTION_IDENTITY_DUPLICATE', `${groupPath}/groupId`, 'Group identity is duplicated'))
    }
    groups.set(group.groupId, group)
    if (slotIds.has(group.slotId)) {
      issues.push(semanticIssue(
        'FORMAT2_TRANSCRIPTION_IDENTITY_DUPLICATE',
        `${groupPath}/slotId`,
        'Canonical source slot identity is duplicated',
      ))
    }
    slotIds.add(group.slotId)
    const writingBlocks = group.blocks.filter((block) => block.kind === 'writing_material')
    const listeningBlocks = group.blocks.filter((block) => block.kind === 'listening_material')
    const objectiveGroup = ['reading', 'seven_choices', 'cloze', 'grammar_fill'].includes(group.groupType)
    const expectedWritingTask = group.groupType === 'application_writing'
      ? 'application'
      : group.groupType === 'continuation_writing'
        ? 'continuation'
        : null
    if (
      (objectiveGroup && group.questions.length === 0)
      || (expectedWritingTask && (
        group.questions.length !== 0
        || writingBlocks.length !== 1
        || writingBlocks[0].taskType !== expectedWritingTask
      ))
      || (group.groupType === 'listening' && (
        group.questions.length !== 0
        || listeningBlocks.length === 0
      ))
      || (!expectedWritingTask && writingBlocks.length > 0)
      || (group.groupType !== 'listening' && listeningBlocks.length > 0)
      || (expectedWritingTask === 'application'
        && (
          writingBlocks[0]?.continuationStarters !== undefined
          || writingBlocks[0]?.sourceInstruction !== undefined
          || writingBlocks[0]?.wordCountScope !== 'student_authored_only'
          || (
            transcription.schemaVersion === 'format2-transcription-v1'
              ? writingBlocks[0]?.applicationEvidence?.answerRegionAbsent !== true
              : typeof writingBlocks[0]?.applicationEvidence?.answerRegionAbsent
                !== 'boolean'
          )
        ))
      || (expectedWritingTask === 'continuation'
        && (
          writingBlocks[0]?.continuationStarters?.length !== 2
          || typeof writingBlocks[0]?.sourceInstruction !== 'string'
          || writingBlocks[0]?.wordCountScope !== 'unspecified'
          || writingBlocks[0]?.applicationEvidence !== undefined
        ))
    ) {
      issues.push(semanticIssue(
        'FORMAT2_TRANSCRIPTION_GROUP_SHAPE_INVALID',
        groupPath,
        'Group content does not match its supported objective, listening, or writing family',
      ))
    }
    for (const [blockIndex, block] of group.blocks.entries()) {
      const blockPath = `${groupPath}/blocks/${blockIndex}`
      if (blockIds.has(block.blockId)) {
        issues.push(semanticIssue('FORMAT2_TRANSCRIPTION_IDENTITY_DUPLICATE', `${blockPath}/blockId`, 'Block identity is duplicated'))
      }
      blockIds.add(block.blockId)
      if (block.kind === 'table') {
        const width = block.rows[0]?.length
        if (!width || block.rows.some((row) => row.length !== width)) {
          issues.push(semanticIssue(
            'FORMAT2_TRANSCRIPTION_TABLE_INVALID',
            `${blockPath}/rows`,
            'Real table rows must form one rectangular structure',
          ))
        }
      }
      if (block.kind === 'visual_placeholder') {
        const refs = visualReferences.get(block.visualObservationId) || []
        refs.push({ kind: 'passage', groupId: group.groupId, path: blockPath })
        visualReferences.set(block.visualObservationId, refs)
      }
    }
    for (const [questionIndex, question] of group.questions.entries()) {
      const questionPath = `${groupPath}/questions/${questionIndex}`
      if (questions.has(question.questionId)) {
        issues.push(semanticIssue('FORMAT2_TRANSCRIPTION_IDENTITY_DUPLICATE', `${questionPath}/questionId`, 'Question identity is duplicated'))
      }
      if (questionNumbers.has(question.questionNo)) {
        issues.push(semanticIssue('FORMAT2_TRANSCRIPTION_IDENTITY_DUPLICATE', `${questionPath}/questionNo`, 'Question number is duplicated'))
      }
      if (answerRefs.has(question.answerRef)) {
        issues.push(semanticIssue('FORMAT2_TRANSCRIPTION_IDENTITY_DUPLICATE', `${questionPath}/answerRef`, 'Answer reference is duplicated'))
      }
      questions.set(question.questionId, { group, question, path: questionPath })
      questionNumbers.add(question.questionNo)
      answerRefs.add(question.answerRef)
      const optionIds = new Set()
      const labels = new Set()
      for (const [optionIndex, option] of question.options.entries()) {
        const optionPath = `${questionPath}/options/${optionIndex}`
        if (optionIds.has(option.optionId) || labels.has(option.label)) {
          issues.push(semanticIssue('FORMAT2_TRANSCRIPTION_IDENTITY_DUPLICATE', optionPath, 'Option identity or label is duplicated'))
        }
        optionIds.add(option.optionId)
        labels.add(option.label)
        if (option.contentKind === 'figure') {
          const refs = visualReferences.get(option.visualObservationId) || []
          refs.push({
            kind: 'reading_option',
            groupId: group.groupId,
            questionId: question.questionId,
            optionId: option.optionId,
            path: optionPath,
          })
          visualReferences.set(option.visualObservationId, refs)
        }
      }
      const figureOptions = question.options.filter((option) => option.contentKind === 'figure')
      if (figureOptions.length > 0) {
        const homogeneous = group.groupType === 'reading'
          && question.options.length === 4
          && figureOptions.length === 4
          && ['A', 'B', 'C', 'D'].every((label) => labels.has(label))
        if (!homogeneous) {
          issues.push(semanticIssue(
            'FORMAT2_READING_FIGURE_OPTIONS_UNSUPPORTED',
            `${questionPath}/options`,
            'Reading Figure Options must be one homogeneous renderer-labelled A-D set',
          ))
        }
      }
    }
  }

  if (transcription.schemaVersion === 'format2-transcription-v2') {
    const listeningGroups = [...groups.values()].filter(
      (group) => group.groupType === 'listening',
    )
    if (
      transcription.listeningSource.disposition === 'complete'
      && (
        listeningGroups.length !== 1
        || listeningGroups[0].groupId !== transcription.listeningSource.groupId
      )
    ) {
      issues.push(semanticIssue(
        'FORMAT2_LISTENING_SOURCE_CLOSURE_INVALID',
        '/listeningSource',
        'Complete Listening source must bind the one exact transcribed Listening group',
      ))
    }
    if (
      transcription.listeningSource.disposition === 'not_supplied'
      && (
        listeningGroups.length !== 0
        || transcription.listeningSource.source.questionPdfSha256
          !== input.sources.questionPdf.sha256
      )
    ) {
      issues.push(semanticIssue(
        'FORMAT2_LISTENING_SOURCE_CLOSURE_INVALID',
        '/listeningSource',
        'A Reading-first Listening absence must bind the exact question PDF and cannot invent Listening material',
      ))
    }

    for (const { group, question, path: questionPath } of questions.values()) {
      const grammarFill = group.groupType === 'grammar_fill'
      if (grammarFill !== Object.hasOwn(question, 'promptProvision')) {
        issues.push(semanticIssue(
          'FORMAT2_GRAMMAR_PROMPT_PROVISION_INVALID',
          `${questionPath}/promptProvision`,
          'Every and only Grammar Fill blank requires an exact source prompt provision',
        ))
      }
    }

    for (const [groupIndex, group] of transcription.groups.entries()) {
      if (group.groupType !== 'application_writing') continue
      const writingBlockIndex = group.blocks.findIndex(
        (block) => block.kind === 'writing_material',
      )
      const block = group.blocks[writingBlockIndex]
      const provided = block.applicationGiven?.provision === 'source_provided'
      if (
        !block.applicationGiven
        || block.applicationEvidence?.answerRegionAbsent === provided
      ) {
        issues.push(semanticIssue(
          'FORMAT2_APPLICATION_GIVEN_PROVISION_INVALID',
          `/groups/${groupIndex}/blocks/${writingBlockIndex}/applicationGiven`,
          'Application given parts and affirmative answer-region absence must be mutually exclusive',
        ))
      }
      const partIds = new Set()
      const partBlockIds = new Set()
      const roleOrder = new Map(
        ['title', 'salutation', 'opening', 'closing', 'signature']
          .map((role, index) => [role, index]),
      )
      let previousRole = -1
      for (const [partIndex, part] of (block.applicationGiven?.parts || []).entries()) {
        const roleIndex = roleOrder.get(part.role)
        if (
          partIds.has(part.partId)
          || blockIds.has(part.blockId)
          || partBlockIds.has(part.blockId)
          || roleIndex < previousRole
        ) {
          issues.push(semanticIssue(
            'FORMAT2_APPLICATION_GIVEN_PROVISION_INVALID',
            `/groups/${groupIndex}/blocks/${writingBlockIndex}/applicationGiven/parts/${partIndex}`,
            'Application given parts require unique identities and title-to-signature source order',
          ))
        }
        partIds.add(part.partId)
        partBlockIds.add(part.blockId)
        previousRole = roleIndex
      }
      for (const partBlockId of partBlockIds) blockIds.add(partBlockId)
    }

    const analysisVersions = new Set()
    for (const [index, analysis] of transcription.analysisSidecars.entries()) {
      const config = analysisSidecarConfigs.get(analysis.schemaVersion)
      const analysisPath = `/analysisSidecars/${index}`
      if (!config || analysisVersions.has(analysis.schemaVersion)) {
        issues.push(semanticIssue(
          'FORMAT2_ANALYSIS_SIDECAR_INVALID',
          analysisPath,
          'Analysis sidecars require one unique supported contract',
        ))
        continue
      }
      analysisVersions.add(analysis.schemaVersion)
      const targetGroupIds = analysis.schemaVersion === 'writing-analysis-v1'
        ? Object.keys(analysis.groups || {})
        : analysis.targetGroups
      const targetGroups = targetGroupIds.map((groupId) => groups.get(groupId))
      const expectedEntryIds = targetGroups.flatMap((group) => (
        config.entryKey === 'groups'
          ? [group?.groupId]
          : group?.questions.map((question) => question.questionId) || []
      ))
      const actualEntryIds = Object.keys(analysis[config.entryKey] || {})
      if (
        analysis.paperId !== input.paperId
        || (
          analysis.schemaVersion !== 'writing-analysis-v1'
          && (
            analysis.sourceAssetVersion !== 1
            || analysis.meta?.reviewStatus !== 'reviewed'
          )
        )
        || targetGroups.some((group) => !group || !config.groupTypes.has(group.groupType))
        || new Set(targetGroupIds).size !== targetGroupIds.length
        || stableStringify([...actualEntryIds].sort())
          !== stableStringify([...expectedEntryIds].sort())
      ) {
        issues.push(semanticIssue(
          'FORMAT2_ANALYSIS_SIDECAR_INVALID',
          analysisPath,
          'Analysis sidecar identity, reviewed status, target family, or complete entry coverage differs from the transcription',
        ))
      }
    }
  }

  const officialAnswersByRef = new Map()
  const officialQuestionIds = new Set()
  for (const [index, answer] of transcription.officialAnswers.entries()) {
    const answerPath = `/officialAnswers/${index}`
    if (officialAnswersByRef.has(answer.answerRef) || officialQuestionIds.has(answer.questionId)) {
      issues.push(semanticIssue('FORMAT2_ANSWER_IDENTITY_DUPLICATE', answerPath, 'Official answer identity is duplicated'))
    }
    officialAnswersByRef.set(answer.answerRef, answer)
    officialQuestionIds.add(answer.questionId)
    const questionRecord = questions.get(answer.questionId)
    if (!questionRecord || questionRecord.question.answerRef !== answer.answerRef) {
      issues.push(semanticIssue(
        'FORMAT2_ANSWER_QUESTION_MISMATCH',
        answerPath,
        'Official answer does not bind one exact transcribed question',
      ))
    }
    if (
      questionRecord?.question.options.length > 0
      && !questionRecord.question.options.some((option) => option.label === answer.answer)
    ) {
      issues.push(semanticIssue(
        'FORMAT2_ANSWER_OPTION_MISMATCH',
        `${answerPath}/answer`,
        'Official objective answer must name one exact transcribed option label',
      ))
    }
    if (answer.source.documentRole !== 'answer_pdf') {
      issues.push(semanticIssue(
        'FORMAT2_ANSWER_AUTHORITY_INVALID',
        `${answerPath}/source`,
        'Official answers must come only from the admitted answer PDF',
      ))
    }
  }
  for (const { question, path: questionPath } of questions.values()) {
    const answer = officialAnswersByRef.get(question.answerRef)
    if (!answer || answer.questionId !== question.questionId) {
      issues.push(semanticIssue(
        'FORMAT2_OBJECTIVE_ANSWER_COVERAGE_INCOMPLETE',
        `${questionPath}/answerRef`,
        'Every objective question requires one answer-PDF-backed official answer',
      ))
    }
  }
  if (officialAnswersByRef.size !== questions.size) {
    issues.push(semanticIssue(
      'FORMAT2_OBJECTIVE_ANSWER_COVERAGE_INCOMPLETE',
      '/officialAnswers',
      'Official answer coverage must equal the complete objective question set',
    ))
  }

  const observationIds = new Set()
  const ownerKeys = new Set()
  const canonicalMediaIds = new Set()
  const sourceSpanIds = new Set()
  const visualsByObservation = new Map()
  for (const [index, visual] of transcription.visuals.entries()) {
    const visualPath = `/visuals/${index}`
    if (observationIds.has(visual.observationId)) {
      issues.push(semanticIssue('FORMAT2_VISUAL_IDENTITY_DUPLICATE', `${visualPath}/observationId`, 'Visual observation is duplicated'))
    }
    observationIds.add(visual.observationId)
    visualsByObservation.set(visual.observationId, visual)
    const canonicalMediaId = format2VisualMediaId(visual)
    if (canonicalMediaIds.has(canonicalMediaId)) {
      issues.push(semanticIssue(
        'FORMAT2_VISUAL_MEDIA_IDENTITY_DUPLICATE',
        `${visualPath}/stableIdentities/canonicalMediaId`,
        'Canonical visual media identity must resolve exactly once',
      ))
    }
    canonicalMediaIds.add(canonicalMediaId)
    const sourceSpanId = format2VisualSourceSpanId(visual)
    if (sourceSpanIds.has(sourceSpanId)) {
      issues.push(semanticIssue(
        'FORMAT2_VISUAL_SOURCE_SPAN_IDENTITY_DUPLICATE',
        `${visualPath}/stableIdentities/sourceSpanId`,
        'Visual source-span identity must resolve exactly once',
      ))
    }
    sourceSpanIds.add(sourceSpanId)
    const ownerKey = stableStringify(visual.owner)
    if (ownerKeys.has(ownerKey)) {
      issues.push(semanticIssue('FORMAT2_VISUAL_OWNER_DUPLICATE', `${visualPath}/owner`, 'One semantic owner cannot receive multiple visual observations'))
    }
    ownerKeys.add(ownerKey)
    const refs = visualReferences.get(visual.observationId) || []
    const ownerGroup = groups.get(visual.owner.groupId)
    if (
      visual.owner.kind === 'passage'
      && ['listening', 'application_writing', 'continuation_writing'].includes(ownerGroup?.groupType)
    ) {
      issues.push(semanticIssue(
        'FORMAT2_VISUAL_OWNER_UNSUPPORTED',
        `${visualPath}/owner`,
        'Listening and writing material visuals do not enter the Passage/Reading Option candidate contract',
      ))
    }
    if (refs.length !== 1 || !sameValue(
      visual.owner,
      visual.owner.kind === 'passage'
        ? { kind: 'passage', groupId: refs[0]?.groupId }
        : {
            kind: 'reading_option',
            groupId: refs[0]?.groupId,
            questionId: refs[0]?.questionId,
            optionId: refs[0]?.optionId,
          },
    )) {
      issues.push(semanticIssue(
        'FORMAT2_VISUAL_OWNER_UNRESOLVED',
        `${visualPath}/owner`,
        'Visual observation must bind exactly one matching Passage or Reading Option placeholder',
      ))
    }
    const page = visual.source.pageSizePoints
    const box = visual.source.pointGeometry
    if (box.x + box.width > page.width || box.y + box.height > page.height) {
      issues.push(semanticIssue(
        'FORMAT2_VISUAL_GEOMETRY_INVALID',
        `${visualPath}/source/pointGeometry`,
        'Visual point geometry must remain inside its PDF page',
      ))
    }
    const extraction = visual.source.extraction
    if (
      (extraction.kind === 'embedded_image' && !nonEmptyString(extraction.objectId))
      || (extraction.kind === 'page_region_crop' && Object.hasOwn(extraction, 'objectId'))
    ) {
      issues.push(semanticIssue(
        'FORMAT2_VISUAL_EXTRACTION_INVALID',
        `${visualPath}/source/extraction`,
        'Embedded images require objectId while page-region crops must not invent one',
      ))
    }
    const methods = new Set()
    for (const [alternativeIndex, alternative] of visual.alternatives.entries()) {
      if (methods.has(alternative.method)) {
        issues.push(semanticIssue(
          'FORMAT2_VISUAL_ALTERNATIVE_DUPLICATE',
          `${visualPath}/alternatives/${alternativeIndex}/method`,
          'Visual alternative method is duplicated',
        ))
      }
      methods.add(alternative.method)
    }
  }
  for (const [observationId, refs] of visualReferences.entries()) {
    if (!observationIds.has(observationId) || refs.length !== 1) {
      issues.push(semanticIssue(
        'FORMAT2_VISUAL_PLACEHOLDER_UNRESOLVED',
        refs[0]?.path || '/groups',
        `Visual placeholder ${observationId} does not resolve exactly once`,
      ))
    }
  }
  issues.push(...sourceMeasuredFigureLayoutIssues({
    transcription,
    questions,
    visualsByObservation,
    questionPdfSha256: input.sources.questionPdf.sha256,
  }))
  if (issues.length > 0) {
    fail('FORMAT2_TRANSCRIPTION_INVALID', 'Format 2 transcription failed closed semantic validation', issues)
  }
  validateAnswerTranscriptionCheck(input, answerPdfBytes)
}

function normalizedRegion(visual) {
  const page = visual.source.pageSizePoints
  const box = visual.source.pointGeometry
  return {
    x: box.x / page.width,
    y: box.y / page.height,
    width: box.width / page.width,
    height: box.height / page.height,
  }
}

function buildSourceCapture(documents, transcription) {
  const observations = transcription.visuals.map((visual, index) => ({
    observationId: visual.observationId,
    documentId: documents.questionDocument.documentId,
    kind: 'source_figure',
    value: {
      owner: cloneJson(visual.owner),
      pageSizePoints: cloneJson(visual.source.pageSizePoints),
      pointGeometry: cloneJson(visual.source.pointGeometry),
      targetSizePoints: cloneJson(visual.targetSizePoints),
      extraction: cloneJson(visual.source.extraction),
    },
    order: index,
    extraction: {
      adapterId: visual.source.extraction.extractor,
      version: visual.source.extraction.version,
    },
    sourceSpanId: format2VisualSourceSpanId(visual),
  }))
  const sourceSpans = transcription.visuals.map((visual, index) => ({
    sourceSpanId: observations[index].sourceSpanId,
    documentId: documents.questionDocument.documentId,
    documentDigest: documents.questionDocument.sha256,
    coordinate: {
      kind: 'page_region',
      page: visual.source.page,
      region: normalizedRegion(visual),
    },
  }))
  const visualsByQuestionAndOption = new Map()
  for (const visual of transcription.visuals) {
    if (visual.owner.kind !== 'reading_option') continue
    const visualsByOption = visualsByQuestionAndOption.get(
      visual.owner.questionId,
    ) || new Map()
    visualsByOption.set(visual.owner.optionId, visual)
    visualsByQuestionAndOption.set(visual.owner.questionId, visualsByOption)
  }
  for (const [layoutIndex, layout] of (
    transcription.sourceMeasuredFigureLayouts || []
  ).entries()) {
    const visualsByOption = visualsByQuestionAndOption.get(
      layout.intent.questionId,
    )
    const visuals = layout.intent.placements.map((placement) => (
      visualsByOption.get(placement.optionId)
    ))
    const pageSize = visuals[0].source.pageSizePoints
    const left = Math.min(...visuals.map((visual) => visual.source.pointGeometry.x))
    const top = Math.min(...visuals.map((visual) => visual.source.pointGeometry.y))
    const right = Math.max(...visuals.map((visual) => (
      visual.source.pointGeometry.x + visual.source.pointGeometry.width
    )))
    const bottom = Math.max(...visuals.map((visual) => (
      visual.source.pointGeometry.y + visual.source.pointGeometry.height
    )))
    const observationId =
      `observation:format2-source-layout:${layout.intent.questionId}`
    const sourceSpanId = `source-span:${observationId}`
    observations.push({
      observationId,
      documentId: documents.questionDocument.documentId,
      kind: 'reading_option_figure_source_layout',
      value: cloneJson(layout),
      order: transcription.visuals.length + layoutIndex,
      extraction: {
        adapterId: 'format2-source-layout-evidence',
        version: '1',
      },
      sourceSpanId,
    })
    sourceSpans.push({
      sourceSpanId,
      documentId: documents.questionDocument.documentId,
      documentDigest: documents.questionDocument.sha256,
      coordinate: {
        kind: 'page_region',
        page: layout.intent.sourcePage,
        region: {
          x: left / pageSize.width,
          y: top / pageSize.height,
          width: (right - left) / pageSize.width,
          height: (bottom - top) / pageSize.height,
        },
      },
    })
  }
  const body = {
    schemaVersion: 'source-capture-v1',
    documents: [documents.questionDocument, documents.answerDocument],
    observations,
    sourceSpans,
    assertions: [],
  }
  const digest = digestJson(body)
  return {
    ...body,
    captureId: `source-capture:${digest.slice('sha256:'.length, 28)}`,
    digest,
  }
}

function visualCandidateRequest(transcription, sourceCapture) {
  const observations = transcription.visuals.map((visual) => ({
    observationId: visual.observationId,
    owner: cloneJson(visual.owner),
    sourceCrop: cloneJson(visual.sourceCrop),
  }))
  const candidates = transcription.visuals.flatMap((visual) => [
    {
      observationId: visual.observationId,
      owner: cloneJson(visual.owner),
      method: 'source_crop',
      artifact: cloneJson(visual.sourceCrop),
      sourceTruthChecklist: cloneJson(visual.sourceTruthChecklist),
    },
    ...visual.alternatives.map((alternative) => ({
      observationId: visual.observationId,
      owner: cloneJson(visual.owner),
      method: alternative.method,
      artifact: cloneJson(alternative.artifact),
      sourceTruthChecklist: cloneJson(alternative.sourceTruthChecklist),
      reproducibility: cloneJson(alternative.reproducibility),
    })),
  ])
  return { sourceCapture, observations, candidates }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;')
}

function buildComparisonHtml({ paperId, candidatePackage, transcription }) {
  const visualsById = new Map(transcription.visuals.map((visual) => [visual.observationId, visual]))
  const sections = candidatePackage.observations.map((observation) => {
    const visual = visualsById.get(observation.observationId)
    const candidates = candidatePackage.candidates.filter((candidate) => (
      candidate.observationId === observation.observationId
    ))
    const width = Math.round(visual.targetSizePoints.width * 96 / 72 * 100) / 100
    const height = Math.round(visual.targetSizePoints.height * 96 / 72 * 100) / 100
    const cards = candidates.map((candidate) => `
        <figure>
          <div class="target" style="width:${width}px;height:${height}px">
            <img src="data:image/png;base64,${candidate.artifact.encodedBytes}" alt="" />
          </div>
          <figcaption>${escapeHtml(candidate.method)} · ${escapeHtml(candidate.candidateDigest)}</figcaption>
        </figure>`).join('')
    return `
      <section>
        <h2>${escapeHtml(observation.observationId)}</h2>
        <p>${escapeHtml(stableStringify(observation.owner))} · normal target ${width} × ${height}px</p>
        <div class="candidates">${cards}</div>
      </section>`
  }).join('')
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Exact visual confirmation · ${escapeHtml(paperId)}</title>
<style>
body{margin:0;padding:24px;background:#f6f6f4;color:#1e1e1c;font:14px/1.5 system-ui,sans-serif}main{max-width:1100px;margin:auto}h1{font-size:22px}h2{font-size:16px;margin:0}section{margin:18px 0;padding:18px;background:#fff;border:1px solid #deded8;border-radius:12px}.digest,figcaption{font:11px/1.4 ui-monospace,monospace;overflow-wrap:anywhere;color:#62625d}.candidates{display:flex;align-items:flex-start;gap:18px;flex-wrap:wrap}figure{margin:0}.target{display:flex;align-items:center;justify-content:center;background:#fff;border:1px solid #aaa;box-sizing:content-box}.target img{display:block;width:100%;height:100%;object-fit:contain}figcaption{max-width:260px;margin-top:6px}
</style>
</head>
<body><main>
<h1>Exact Teacher Confirmation</h1>
<p>${escapeHtml(paperId)} · images are shown at the declared normal target size; question numbers, stems, and A-D labels remain renderer text.</p>
<p class="digest">package ${escapeHtml(candidatePackage.packageDigest)}</p>
${sections}
</main></body>
</html>`
}

function claimWriter(jobRoot, writerId) {
  mkdirSync(jobRoot, { recursive: true })
  const writerPath = path.join(jobRoot, 'writer.json')
  if (!existsSync(writerPath)) {
    try {
      const descriptor = openSync(writerPath, 'wx')
      try {
        writeFileSync(descriptor, jsonBytes({
          schemaVersion: 'format2-import-job-writer-v1',
          writerId,
        }))
      } finally {
        closeSync(descriptor)
      }
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error
    }
  }
  const writer = readJson(writerPath, 'Format 2 Job writer receipt')
  if (
    !exactKeys(writer, ['schemaVersion', 'writerId'])
    || writer.schemaVersion !== 'format2-import-job-writer-v1'
    || writer.writerId !== writerId
  ) {
    fail('FORMAT2_JOB_SECOND_WRITER', 'Another writer already owns this paper Job')
  }
}

function invalidateChangedDownstreamBeforeSemanticValidation({
  input,
  documents,
  repositoryRoot,
}) {
  const paperDir = path.join(
    repositoryRoot,
    'scripts/import-pipeline/papers',
    input.paperId,
  )
  const jobRoot = path.join(paperDir, 'job')
  const currentPath = path.join(jobRoot, 'current.json')
  if (!existsSync(currentPath)) return { paperDir, jobRoot }
  claimWriter(jobRoot, input.state.writerId)
  const current = readJson(currentPath, 'Format 2 Job current receipt')
  if (
    current.schemaVersion !== RECEIPT_SCHEMA_VERSION
    || current.writerId !== input.state.writerId
    || current.result?.paperId !== input.paperId
  ) {
    fail(
      'FORMAT2_JOB_DURABLE_STATE_INVALID',
      'Existing Format 2 Job does not bind the safely identified paper and writer',
    )
  }
  const nextDigests = {
    questionPdfSha256: documents.questionDocument.sha256,
    answerPdfSha256: documents.answerDocument.sha256,
    transcriptionDigest: digestJson(input.transcription),
  }
  const changed = Object.entries(nextDigests).some(
    ([key, value]) => current.inputDigests?.[key] !== value,
  )
  if (!changed) return { paperDir, jobRoot }

  const signalsDir = path.join(paperDir, 'signals')
  mkdirSync(signalsDir, { recursive: true })
  for (const fileName of ['ai-answer-check.json', 'qa-accepted.json', 'help-needed.json']) {
    const signalPath = path.join(signalsDir, fileName)
    if (existsSync(signalPath)) unlinkSync(signalPath)
  }
  const invalidationCode = 'format2_input_invalidated'
  const invalidatedResult = {
    schemaVersion: RESULT_SCHEMA_VERSION,
    paperId: input.paperId,
    provenance: cloneJson(input.provenance),
    jobId: null,
    lifecycle: 'failed',
    stopReason: { code: invalidationCode },
    diagnostics: [{
      code: 'FORMAT2_UPSTREAM_INPUT_CHANGED',
      message: 'Changed source or transcription invalidated every downstream Format 2 result before new semantic admission.',
    }],
    artifacts: {},
    humanEntryPoints: null,
    canonicalPublication: null,
  }
  atomicWrite(currentPath, jsonBytes({
    schemaVersion: RECEIPT_SCHEMA_VERSION,
    writerId: input.state.writerId,
    inputDigests: nextDigests,
    contractVersions: current.contractVersions || {},
    disposition: 'failed',
    nextStopReason: invalidationCode,
    result: invalidatedResult,
  }))
  atomicWrite(path.join(signalsDir, 'blocked.json'), jsonBytes({
    code: invalidationCode,
    at: new Date().toISOString(),
    note: 'Changed Format 2 source or transcription invalidated prior AI Answer Check and Owner QA.',
  }))
  return { paperDir, jobRoot }
}

function relativeFromPaper(paperDir, targetPath) {
  return path.relative(paperDir, targetPath).split(path.sep).join('/')
}

function buildResult({
  input,
  jobId,
  paperDir,
  runDir,
  sourceCapture,
  candidatePackage,
  comparisonBytes,
}) {
  const transcriptionFileName = `${input.transcription.schemaVersion}.json`
  const transcriptionPath = path.join(runDir, transcriptionFileName)
  const capturePath = path.join(runDir, 'source-capture-v1.json')
  const candidatePath = path.join(runDir, 'visual-import-candidate-v1.json')
  const comparisonPath = path.join(runDir, 'comparison.html')
  const comparisonHref = `/papers/${encodeURIComponent(input.paperId)}/format2-comparison`
  return {
    schemaVersion: RESULT_SCHEMA_VERSION,
    paperId: input.paperId,
    provenance: cloneJson(input.provenance),
    jobId,
    lifecycle: 'importing',
    stopReason: { code: STOP_CODE },
    diagnostics: candidatePackage.unresolvedIssues.map((issue) => cloneJson(issue)),
    artifacts: {
      sourceCapture: {
        captureId: sourceCapture.captureId,
        digest: sourceCapture.digest,
        relativePath: relativeFromPaper(paperDir, capturePath),
      },
      transcription: {
        schemaVersion: input.transcription.schemaVersion,
        digest: digestJson(input.transcription),
        relativePath: relativeFromPaper(paperDir, transcriptionPath),
      },
      candidatePackage: {
        schemaVersion: candidatePackage.schemaVersion,
        packageDigest: candidatePackage.packageDigest,
        relativePath: relativeFromPaper(paperDir, candidatePath),
      },
      comparison: {
        sha256: sha256(new Uint8Array(comparisonBytes)),
        relativePath: relativeFromPaper(paperDir, comparisonPath),
      },
    },
    humanEntryPoints: {
      comparison: {
        href: comparisonHref,
        packageDigest: candidatePackage.packageDigest,
      },
      resumeInstruction: `Resume this Job with exact visual package ${candidatePackage.packageDigest}.`,
    },
    canonicalPublication: null,
  }
}

function persistRun({
  input,
  documents,
  sourceCapture,
  candidatePackage,
  paperDir,
  jobRoot,
  runDir,
  result,
  comparisonBytes,
}) {
  mkdirSync(runDir, { recursive: true })
  for (const document of sourceCapture.documents) {
    const bytes = Buffer.from(document.encodedBytes, 'base64')
    writeImmutable(
      path.join(runDir, document.immutableArtifactRef.relativePath),
      bytes,
      `Source document ${document.documentId}`,
    )
  }
  writeImmutable(
    path.join(runDir, 'source-capture-v1.json'),
    jsonBytes(sourceCapture),
    'Source Capture',
  )
  writeImmutable(
    path.join(runDir, `${input.transcription.schemaVersion}.json`),
    jsonBytes(input.transcription),
    'Format 2 transcription',
  )
  writeImmutable(
    path.join(runDir, 'visual-import-candidate-v1.json'),
    jsonBytes(candidatePackage),
    'Visual candidate package',
  )
  writeImmutable(path.join(runDir, 'comparison.html'), comparisonBytes, 'Exact comparison page')
  const currentReceipt = {
    schemaVersion: RECEIPT_SCHEMA_VERSION,
    writerId: input.state.writerId,
    inputDigests: {
      questionPdfSha256: documents.questionDocument.sha256,
      answerPdfSha256: documents.answerDocument.sha256,
      transcriptionDigest: digestJson(input.transcription),
      authorityDigest: digestJson(readingOptionFigureAuthorityRef),
      answerTranscriptionCheckDigest: digestJson(input.transcription.answerTranscriptionCheck),
    },
    contractVersions: {
      transcription: input.transcription.schemaVersion,
      sourceCapture: sourceCapture.schemaVersion,
      visualCandidate: candidatePackage.schemaVersion,
    },
    disposition: 'stopped',
    nextStopReason: STOP_CODE,
    result,
  }
  atomicWrite(path.join(jobRoot, 'current.json'), jsonBytes(currentReceipt))
  const signalsDir = path.join(paperDir, 'signals')
  mkdirSync(signalsDir, { recursive: true })
  const aiCheckPath = path.join(signalsDir, 'ai-answer-check.json')
  if (existsSync(aiCheckPath)) unlinkSync(aiCheckPath)
  const qaAcceptedPath = path.join(signalsDir, 'qa-accepted.json')
  if (existsSync(qaAcceptedPath)) unlinkSync(qaAcceptedPath)
  const helpPath = path.join(signalsDir, 'help-needed.json')
  const blockedPath = path.join(signalsDir, 'blocked.json')
  if (existsSync(blockedPath)) {
    try {
      const blocked = JSON.parse(readFileSync(blockedPath, 'utf8'))
      if (blocked.code === 'format2_input_invalidated') unlinkSync(blockedPath)
    } catch {
      // A malformed or unrelated blocker is not owned by this Job run.
    }
  }
  let at = new Date().toISOString()
  if (existsSync(helpPath)) {
    try {
      const previous = JSON.parse(readFileSync(helpPath, 'utf8'))
      if (previous.packageDigest === candidatePackage.packageDigest && nonEmptyString(previous.at)) {
        at = previous.at
      }
    } catch {
      // Replace malformed small projection from the exact current durable result.
    }
  }
  atomicWrite(helpPath, jsonBytes({
    question: '请按正常目标尺寸确认 exact visual candidates。',
    at,
    code: STOP_CODE,
    packageDigest: candidatePackage.packageDigest,
    comparisonEntryPoint: result.humanEntryPoints.comparison.href,
    resumeInstruction: result.humanEntryPoints.resumeInstruction,
  }))
}

function runStartOrContinue(input, repositoryRoot) {
  validateOperationInput(input)
  const documents = captureExactDocuments(input)
  const { paperDir, jobRoot } = invalidateChangedDownstreamBeforeSemanticValidation({
    input,
    documents,
    repositoryRoot,
  })
  validateTranscriptionSemantics(input, documents.answerBytes)
  claimWriter(jobRoot, input.state.writerId)
  const sourceCapture = buildSourceCapture(documents, input.transcription)
  let candidatePackage
  try {
    candidatePackage = createVisualImportCandidate(
      visualCandidateRequest(input.transcription, sourceCapture),
    )
  } catch (error) {
    fail(
      error?.code || 'FORMAT2_VISUAL_CANDIDATE_INVALID',
      error?.message || 'Visual Candidate admission failed closed',
    )
  }
  const inputIdentity = {
    schemaVersion: 'format2-import-job-input-v1',
    paperId: input.paperId,
    format: FORMAT,
    provenance: cloneJson(input.provenance),
    questionPdfSha256: documents.questionDocument.sha256,
    answerPdfSha256: documents.answerDocument.sha256,
    transcriptionDigest: digestJson(input.transcription),
    sourceCaptureDigest: sourceCapture.digest,
    candidatePackageDigest: candidatePackage.packageDigest,
    authorityDigest: digestJson(readingOptionFigureAuthorityRef),
  }
  const jobId = stableId('format2-job', inputIdentity)
  const currentPath = path.join(jobRoot, 'current.json')
  if (existsSync(currentPath)) {
    const current = readJson(currentPath, 'Format 2 Job current receipt')
    if (
      current.schemaVersion === RECEIPT_SCHEMA_VERSION
      && current.result?.jobId === jobId
      && current.result?.lifecycle === 'awaiting_qa'
    ) return verifyCompletedAwaitingQa(repositoryRoot, paperDir, jobRoot, current)
  }
  const runDir = path.join(jobRoot, 'runs', jobId.slice('format2-job:'.length))
  const comparisonBytes = Buffer.from(buildComparisonHtml({
    paperId: input.paperId,
    candidatePackage,
    transcription: input.transcription,
  }))
  const result = buildResult({
    input,
    jobId,
    paperDir,
    runDir,
    sourceCapture,
    candidatePackage,
    comparisonBytes,
  })
  persistRun({
    input,
    documents,
    sourceCapture,
    candidatePackage,
    paperDir,
    jobRoot,
    runDir,
    result,
    comparisonBytes,
  })
  return cloneJson(result)
}

function validateResumeInput(input) {
  if (!exactKeys(input, ['paperId', 'jobId', 'teacherConfirmation'])) {
    fail(
      'FORMAT2_JOB_RESUME_REQUEST_INVALID',
      'Format 2 Job resume accepts only paperId, jobId, and teacherConfirmation',
    )
  }
  if (!PAPER_ID_PATTERN.test(input.paperId)) {
    fail('FORMAT2_JOB_PAPER_ID_UNSAFE', 'Format 2 Job paperId is unsafe')
  }
  if (!/^format2-job:[a-f0-9]{21}$/u.test(input.jobId)) {
    fail('FORMAT2_JOB_IDENTITY_INVALID', 'Format 2 Job resume requires one exact Job identity')
  }
  if (!input.teacherConfirmation || typeof input.teacherConfirmation !== 'object') {
    fail(
      'FORMAT2_JOB_CONFIRMATION_INVALID',
      'Format 2 Job resume requires one exact Teacher Confirmation',
    )
  }
}

function resolveDurableArtifact(paperDir, relativePath, label) {
  if (!nonEmptyString(relativePath) || path.isAbsolute(relativePath)) {
    fail('FORMAT2_JOB_DURABLE_STATE_INVALID', `${label} path is invalid`)
  }
  const resolved = path.resolve(paperDir, relativePath)
  if (!resolved.startsWith(`${path.resolve(paperDir)}${path.sep}`)) {
    fail('FORMAT2_JOB_DURABLE_STATE_INVALID', `${label} path escapes the paper Job`)
  }
  if (!existsSync(resolved)) {
    fail('FORMAT2_JOB_DURABLE_STATE_INVALID', `${label} is missing`)
  }
  return resolved
}

function retainedCandidatePackage(paperDir, receipt) {
  const candidatePath = resolveDurableArtifact(
    paperDir,
    receipt.result.artifacts?.candidatePackage?.relativePath,
    'Visual Candidate package',
  )
  const candidatePackage = readJson(candidatePath, 'Format 2 Visual Candidate package')
  if (
    candidatePackage.packageDigest
      !== receipt.result.artifacts?.candidatePackage?.packageDigest
  ) {
    fail(
      'FORMAT2_JOB_DURABLE_STATE_INVALID',
      'Visual Candidate package no longer matches the current durable Job',
    )
  }
  return candidatePackage
}

function invalidateCompletedConfirmation({ paperDir, jobRoot, receipt, candidatePackage }) {
  const artifacts = {}
  for (const key of ['sourceCapture', 'transcription', 'candidatePackage', 'comparison']) {
    if (!receipt.result.artifacts?.[key]) {
      fail(
        'FORMAT2_JOB_DURABLE_STATE_INVALID',
        `Completed Format 2 Job lacks retained ${key} evidence`,
      )
    }
    artifacts[key] = cloneJson(receipt.result.artifacts[key])
  }
  const result = {
    schemaVersion: RESULT_SCHEMA_VERSION,
    paperId: receipt.result.paperId,
    provenance: cloneJson(receipt.result.provenance),
    jobId: receipt.result.jobId,
    lifecycle: 'importing',
    stopReason: { code: STOP_CODE },
    diagnostics: candidatePackage.unresolvedIssues.map((issue) => cloneJson(issue)),
    artifacts,
    humanEntryPoints: {
      comparison: {
        href: `/papers/${encodeURIComponent(receipt.result.paperId)}/format2-comparison`,
        packageDigest: candidatePackage.packageDigest,
      },
      resumeInstruction: `Resume this Job with exact visual package ${candidatePackage.packageDigest}.`,
    },
    canonicalPublication: null,
  }
  const signalsDir = path.join(paperDir, 'signals')
  mkdirSync(signalsDir, { recursive: true })
  for (const fileName of ['ai-answer-check.json', 'qa-accepted.json', 'help-needed.json']) {
    const signalPath = path.join(signalsDir, fileName)
    if (existsSync(signalPath)) unlinkSync(signalPath)
  }
  const contractVersions = cloneJson(receipt.contractVersions || {})
  delete contractVersions.canonicalPublication
  atomicWrite(path.join(jobRoot, 'current.json'), jsonBytes({
    ...cloneJson(receipt),
    contractVersions,
    disposition: 'stopped',
    nextStopReason: STOP_CODE,
    result,
  }))
}

function loadResumeEvidence(repositoryRoot, input) {
  const paperDir = path.join(
    repositoryRoot,
    'scripts/import-pipeline/papers',
    input.paperId,
  )
  const jobRoot = path.join(paperDir, 'job')
  const currentPath = path.join(jobRoot, 'current.json')
  if (!existsSync(currentPath)) {
    fail('FORMAT2_JOB_NOT_FOUND', 'Format 2 Job durable receipt is missing')
  }
  const receipt = readJson(currentPath, 'Format 2 Job current receipt')
  if (
    receipt.schemaVersion !== RECEIPT_SCHEMA_VERSION
    || receipt.result?.schemaVersion !== RESULT_SCHEMA_VERSION
    || receipt.result.paperId !== input.paperId
    || receipt.result.jobId !== input.jobId
  ) {
    fail(
      'FORMAT2_JOB_IDENTITY_MISMATCH',
      'Resume identity differs from the exact current durable Job',
    )
  }
  if (receipt.inputDigests?.authorityDigest !== digestJson(readingOptionFigureAuthorityRef)) {
    fail(
      'FORMAT2_JOB_AUTHORITY_STALE',
      'The durable Job authority differs from the current closed compiler authority',
    )
  }
  if (receipt.result.lifecycle === 'awaiting_qa') {
    const committedPackageDigest = receipt.result.artifacts?.candidatePackage?.packageDigest
    const committedConfirmationDigest =
      receipt.result.artifacts?.confirmedSelection?.confirmationDigest
    if (input.teacherConfirmation.packageDigest !== committedPackageDigest) {
      fail(
        'FORMAT2_JOB_CONFIRMATION_STALE',
        'Completed Job no-op requires the exact committed Teacher Confirmation',
      )
    }
    if (digestJson(input.teacherConfirmation) !== committedConfirmationDigest) {
      const candidatePackage = retainedCandidatePackage(paperDir, receipt)
      try {
        confirmVisualImportCandidate(candidatePackage, input.teacherConfirmation)
      } catch (error) {
        if (String(error?.code || '').startsWith('VISUAL_CONFIRMATION_')) {
          fail(
            'FORMAT2_JOB_CONFIRMATION_STALE',
            'Completed Job received a malformed or substituted Teacher Confirmation',
          )
        }
        throw error
      }
      invalidateCompletedConfirmation({ paperDir, jobRoot, receipt, candidatePackage })
      fail(
        'FORMAT2_JOB_CONFIRMATION_CHANGED',
        'Changed exact Teacher Confirmation invalidated the completed Job; retry the same Job with that confirmation',
      )
    }
    return { paperDir, jobRoot, receipt, completed: true }
  }
  if (
    receipt.result.lifecycle !== 'importing'
    || receipt.result.stopReason?.code !== STOP_CODE
  ) {
    fail(
      'FORMAT2_JOB_STATE_INVALID',
      'Format 2 Job is not stopped at exact Teacher Confirmation',
    )
  }
  const transcriptionPath = resolveDurableArtifact(
    paperDir,
    receipt.result.artifacts?.transcription?.relativePath,
    'Format 2 transcription',
  )
  const sourceCapturePath = resolveDurableArtifact(
    paperDir,
    receipt.result.artifacts?.sourceCapture?.relativePath,
    'Source Capture',
  )
  const candidatePath = resolveDurableArtifact(
    paperDir,
    receipt.result.artifacts?.candidatePackage?.relativePath,
    'Visual Candidate package',
  )
  const transcription = readJson(transcriptionPath, 'Format 2 transcription')
  const sourceCapture = readJson(sourceCapturePath, 'Format 2 Source Capture')
  const candidatePackage = readJson(candidatePath, 'Format 2 Visual Candidate package')
  if (
    digestJson(transcription) !== receipt.result.artifacts.transcription.digest
    || sourceCapture.digest !== receipt.result.artifacts.sourceCapture.digest
    || candidatePackage.packageDigest !== receipt.result.artifacts.candidatePackage.packageDigest
    || candidatePackage.packageDigest !== input.teacherConfirmation.packageDigest
  ) {
    fail(
      'FORMAT2_JOB_CONFIRMATION_STALE',
      'Teacher Confirmation or durable evidence differs from the exact current candidate package',
    )
  }
  const questionDocument = sourceCapture.documents.find(
    (document) => document.inputKey === 'original_question_source',
  )
  const answerDocument = sourceCapture.documents.find(
    (document) => document.inputKey === 'listening_answer_source',
  )
  if (!questionDocument || !answerDocument) {
    fail('FORMAT2_JOB_DURABLE_STATE_INVALID', 'Source Capture PDF pair is incomplete')
  }
  const questionPdfBytes = new Uint8Array(Buffer.from(questionDocument.encodedBytes, 'base64'))
  const answerPdfBytes = new Uint8Array(Buffer.from(answerDocument.encodedBytes, 'base64'))
  if (
    sha256(questionPdfBytes) !== receipt.inputDigests.questionPdfSha256
    || sha256(answerPdfBytes) !== receipt.inputDigests.answerPdfSha256
    || digestJson(transcription) !== receipt.inputDigests.transcriptionDigest
    || receipt.inputDigests.authorityDigest !== digestJson(readingOptionFigureAuthorityRef)
  ) {
    fail(
      'FORMAT2_JOB_DURABLE_STATE_INVALID',
      'Durable source or transcription bytes no longer bind the current Job',
    )
  }
  return {
    paperDir,
    jobRoot,
    receipt,
    completed: false,
    transcription,
    sourceCapture,
    candidatePackage,
    questionPdfBytes,
    answerPdfBytes,
  }
}

function unresolvedResumeResult(evidence, confirmedSelection) {
  return {
    ...cloneJson(evidence.receipt.result),
    diagnostics: confirmedSelection.unresolvedIssues.map((issue) => cloneJson(issue)),
  }
}

function canonicalDiagnostics(compilation) {
  return (compilation?.artifacts?.normalizationReport?.diagnostics || [])
    .filter((diagnostic) => diagnostic.disposition !== 'ready')
    .map((diagnostic) => cloneJson(diagnostic))
}

function readingOptionPublicationConfirmation(evidence, confirmedSelection) {
  const readingObservationIds = new Set(evidence.candidatePackage.observations
    .filter((observation) => observation.owner?.kind === 'reading_option')
    .map((observation) => observation.observationId))
  const candidatePackage = createVisualImportCandidate({
    sourceCapture: evidence.sourceCapture,
    observations: evidence.candidatePackage.observations
      .filter((observation) => readingObservationIds.has(observation.observationId))
      .map((observation) => ({
        observationId: observation.observationId,
        owner: cloneJson(observation.owner),
        sourceCrop: cloneJson(observation.sourceCrop),
      })),
    candidates: evidence.candidatePackage.candidates
      .filter((candidate) => readingObservationIds.has(candidate.observationId))
      .map((candidate) => ({
        observationId: candidate.observationId,
        owner: cloneJson(candidate.owner),
        method: candidate.method,
        artifact: cloneJson(candidate.artifact),
        sourceTruthChecklist: cloneJson(candidate.sourceTruthChecklist),
        ...(candidate.reproducibility
          ? { reproducibility: cloneJson(candidate.reproducibility) }
          : {}),
      })),
  })
  const selectedByObservation = new Map(confirmedSelection.confirmedSelections.map(
    (selection) => [selection.observationId, selection],
  ))
  const teacherConfirmation = {
    schemaVersion: 'visual-teacher-confirmation-v1',
    packageDigest: candidatePackage.packageDigest,
    decisions: candidatePackage.observations.map((observation) => ({
      observationId: observation.observationId,
      owner: cloneJson(observation.owner),
      disposition: 'confirmed',
      selectedCandidateDigest: selectedByObservation.get(
        observation.observationId,
      ).candidateDigest,
    })),
  }
  return { candidatePackage, teacherConfirmation }
}

function groupTypeForPrint(groupType) {
  if (groupType === 'grammarFill') return 'grammar_cloze'
  if (groupType === 'sevenChoices') return 'seven_choices'
  if (groupType === 'continuation') return 'writing'
  return groupType
}

function canonicalPrintPayload(consumption, paperName) {
  const renderedItems = []
  for (const selection of consumption.selections) {
    for (const groupId of selection.groupIds) {
      const group = projectCanonicalConsumerGroup({
        consumption,
        familyContractId: selection.familyContractId,
        groupId,
      })
      renderedItems.push({
        detail: {
          id: groupId,
          paperId: consumption.paperId,
          title: groupId,
          source: paperName,
          groupType: groupTypeForPrint(group.groupType),
          passage: { title: groupId, materialText: '' },
          questions: group.questions.map((question) => ({
            id: question.questionId,
            questionNo: String(question.questionNo),
            stem: question.stem ?? '',
            answer: question.correctOptionId
              ? question.options.find(
                (option) => option.optionId === question.correctOptionId,
              )?.label || ''
              : '',
            explanation: '',
            note: '',
            options: question.options.map((option) => ({
              label: option.label,
              content: option.text,
            })),
          })),
        },
        score: 0,
        sectionTitle: '',
        note: '',
      })
    }
  }
  const details = new Map(renderedItems.map((item) => [item.detail.id, item.detail]))
  const blocks = consumption.visibleStructure.flatMap((node) => {
    if (node.kind === 'group') {
      return [{ type: 'question_group', questionGroupId: node.groupId, score: 0 }]
    }
    if (node.kind !== 'instruction' || node.renderPolicy !== 'render') return []
    if (node.placement === 'part_heading' || node.placement === 'section_heading') {
      return [{
        type: 'section_header',
        title: node.text,
        instructionId: node.instructionId,
      }]
    }
    if (node.placement === 'group_instruction') {
      return [{
        type: 'instruction',
        text: node.text,
        instructionId: node.instructionId,
      }]
    }
    return []
  })
  return {
    title: paperName,
    printStyle: 'exam',
    questionNumberStart: 1,
    items: renderedItems.map((item) => ({
      questionGroupId: item.detail.id,
      score: item.score,
    })),
    blocks,
    details,
  }
}

function artifactDescriptor(paperDir, filePath, mediaType) {
  const bytes = readFileSync(filePath)
  return {
    relativePath: relativeFromPaper(paperDir, filePath),
    sha256: sha256(new Uint8Array(bytes)),
    byteLength: bytes.byteLength,
    mediaType,
  }
}

function persistQaArtifacts({
  evidence,
  paperName,
  printConsumption,
  publicationRoot,
}) {
  const qaDir = path.join(
    evidence.jobRoot,
    'runs',
    evidence.receipt.result.jobId.slice('format2-job:'.length),
    'qa',
  )
  const renderRoot = mkdtempSync(path.join(tmpdir(), 'eqb-format2-qa-render-'))
  try {
    const payload = canonicalPrintPayload(printConsumption, paperName)
    const exporter = createExportImplementation({
      rootDir,
      exportDir: renderRoot,
      getQuestionGroupDetail: (groupId) => payload.details.get(groupId) || null,
      buildPrintHtml,
      paperAssetsDir: publicationRoot,
      resolveCanonicalConsumption: () => printConsumption,
      timestampPrefix: () => 'format2-qa',
    })
    const student = exporter.exportPrintHtml({
      ...payload,
      versionType: 'student',
    }, { imageMode: 'file', canonicalVisibleStructureChrome: true })
    const teacher = exporter.exportPrintHtml({
      ...payload,
      versionType: 'teacher',
    }, { imageMode: 'file', canonicalVisibleStructureChrome: true })
    const pdf = exporter.exportPrintPdf({
      ...payload,
      versionType: 'student',
    }, { canonicalVisibleStructureChrome: true })
    if (
      student.body.includes('<strong>【答案】</strong>')
      || student.body.includes('Analysis sentinel')
      || !teacher.body.includes('<strong>【答案】</strong>')
      || Buffer.from(pdf.body).subarray(0, 4).toString() !== '%PDF'
    ) {
      fail(
        'FORMAT2_QA_ARTIFACT_INVALID',
        'Shared renderer did not produce closed Student, Teacher, and PDF QA artifacts',
      )
    }
    mkdirSync(qaDir, { recursive: true })
    const paths = {
      studentPrint: path.join(qaDir, 'student-print.html'),
      teacherPrint: path.join(qaDir, 'teacher-print.html'),
      pdf: path.join(qaDir, 'student-print.pdf'),
    }
    writeImmutable(paths.studentPrint, Buffer.from(student.body), 'Format 2 Student Print QA artifact')
    writeImmutable(paths.teacherPrint, Buffer.from(teacher.body), 'Format 2 Teacher Print QA artifact')
    if (existsSync(paths.pdf)) {
      if (readFileSync(paths.pdf).subarray(0, 4).toString() !== '%PDF') {
        fail('FORMAT2_QA_ARTIFACT_INVALID', 'Retained Format 2 PDF QA artifact is invalid')
      }
    } else {
      writeImmutable(paths.pdf, Buffer.from(pdf.body), 'Format 2 PDF QA artifact')
    }
    const supportFiles = new Map()
    for (const image of [...student.images, ...teacher.images]) {
      const bytes = readFileSync(image.absoluteSourcePath)
      const existing = supportFiles.get(image.relativeName)
      if (existing && !existing.equals(bytes)) {
        fail('FORMAT2_QA_ARTIFACT_INVALID', `QA support image ${image.relativeName} is ambiguous`)
      }
      supportFiles.set(image.relativeName, bytes)
    }
    const support = []
    for (const [fileName, bytes] of supportFiles) {
      if (path.basename(fileName) !== fileName) {
        fail('FORMAT2_QA_ARTIFACT_INVALID', 'QA support image name is unsafe')
      }
      const filePath = path.join(qaDir, fileName)
      writeImmutable(filePath, bytes, `Format 2 QA support image ${fileName}`)
      support.push({ fileName, ...artifactDescriptor(evidence.paperDir, filePath, 'image/png') })
    }
    return {
      schemaVersion: 'format2-qa-artifacts-v1',
      studentPrint: artifactDescriptor(evidence.paperDir, paths.studentPrint, 'text/html; charset=utf-8'),
      teacherPrint: artifactDescriptor(evidence.paperDir, paths.teacherPrint, 'text/html; charset=utf-8'),
      pdf: artifactDescriptor(evidence.paperDir, paths.pdf, 'application/pdf'),
      support,
    }
  } finally {
    rmSync(renderRoot, { recursive: true, force: true })
  }
}

function buildQaAcceptanceIdentity({ evidence, publication, qaArtifacts }) {
  const identity = {
    schemaVersion: QA_ACCEPTANCE_SCHEMA_VERSION,
    paperId: evidence.receipt.result.paperId,
    jobId: evidence.receipt.result.jobId,
    inputIdentityDigest: digestJson(evidence.receipt.inputDigests),
    candidatePackageDigest:
      evidence.receipt.result.artifacts.candidatePackage.packageDigest,
    confirmationDigest:
      publication.confirmedSelection.confirmationDigest,
    publicationDigest: publication.canonicalPublication.publicationDigest,
    qaArtifactsManifestDigest: digestJson(qaArtifacts),
  }
  const qaIdentityDigest = digestJson(identity)
  return {
    identity: { ...identity, qaIdentityDigest },
    expectedReceipt: {
      schemaVersion: QA_ACCEPTANCE_SCHEMA_VERSION,
      by: 'owner',
      jobId: identity.jobId,
      inputIdentityDigest: identity.inputIdentityDigest,
      candidatePackageDigest: identity.candidatePackageDigest,
      confirmationDigest: identity.confirmationDigest,
      publicationDigest: identity.publicationDigest,
      qaArtifactsManifestDigest: identity.qaArtifactsManifestDigest,
      qaIdentityDigest,
    },
    instruction: 'Only after exact Owner QA, write qa-accepted.json with acceptedAt plus every expectedReceipt field.',
  }
}

function buildQaEntryPoints({
  evidence,
  publication,
  confirmedSelection,
  qaArtifacts,
}) {
  const paperId = publication.paperId
  const encodedPaperId = encodeURIComponent(paperId)
  const appOrigin = 'http://127.0.0.1:5173'
  const qaArtifactOrigin = 'http://127.0.0.1:8790'
  const screen = `${appOrigin}/?view=paper-browse&paperId=${encodedPaperId}`
  const qaBase = `${qaArtifactOrigin}/papers/${encodedPaperId}/format2-qa`
  const artifactEntry = (artifact, href) => ({
    kind: 'artifact_url',
    method: 'GET',
    href,
    sha256: artifact.sha256,
    byteLength: artifact.byteLength,
    mediaType: artifact.mediaType,
  })
  return {
    service: {
      command: 'PORT=5173 bash scripts/dev.sh',
      appOrigin,
      qaArtifactCommand: 'node import-ops/server.mjs',
      qaArtifactOrigin,
    },
    screen: { kind: 'url', method: 'GET', href: screen },
    studentPrint: artifactEntry(qaArtifacts.studentPrint, `${qaBase}/student-print`),
    teacherPrint: artifactEntry(qaArtifacts.teacherPrint, `${qaBase}/teacher-print`),
    pdf: artifactEntry(qaArtifacts.pdf, `${qaBase}/student-pdf`),
    firstFocusState: {
      view: 'paper-browse',
      paperId,
      lecture: false,
    },
    gateSummary: `Canonical ${publication.versionName} exact reload is ready; Owner QA remains required.`,
    qaAcceptance: buildQaAcceptanceIdentity({
      evidence,
      publication: {
        canonicalPublication: publication,
        confirmedSelection,
      },
      qaArtifacts,
    }),
  }
}

function verifyQaArtifacts(paperDir, result) {
  const qaArtifacts = result.artifacts?.qa
  const entryPoints = result.humanEntryPoints
  const descriptors = [
    ['studentPrint', qaArtifacts?.studentPrint],
    ['teacherPrint', qaArtifacts?.teacherPrint],
    ['pdf', qaArtifacts?.pdf],
    ...(Array.isArray(qaArtifacts?.support)
      ? qaArtifacts.support.map((artifact) => ['support', artifact])
      : []),
  ]
  if (
    qaArtifacts?.schemaVersion !== 'format2-qa-artifacts-v1'
    || entryPoints?.qaAcceptance?.identity?.qaArtifactsManifestDigest !== digestJson(qaArtifacts)
    || entryPoints?.qaAcceptance?.expectedReceipt?.qaArtifactsManifestDigest !== digestJson(qaArtifacts)
  ) {
    fail('FORMAT2_QA_ARTIFACT_INVALID', 'Completed Job QA artifact manifest is not exact-receipt bound')
  }
  const supportNames = new Set()
  for (const [key, artifact] of descriptors) {
    if (
      !artifact
      || typeof artifact.relativePath !== 'string'
      || path.isAbsolute(artifact.relativePath)
      || !SHA256_PATTERN.test(artifact.sha256)
      || !Number.isInteger(artifact.byteLength)
      || artifact.byteLength < 1
      || !nonEmptyString(artifact.mediaType)
    ) {
      fail('FORMAT2_QA_ARTIFACT_INVALID', 'Completed Job QA artifact descriptor is invalid')
    }
    if (key === 'support') {
      if (
        !nonEmptyString(artifact.fileName)
        || path.basename(artifact.fileName) !== artifact.fileName
        || supportNames.has(artifact.fileName)
      ) {
        fail('FORMAT2_QA_ARTIFACT_INVALID', 'Completed Job QA support artifact name is unsafe or duplicated')
      }
      supportNames.add(artifact.fileName)
    } else if (
      entryPoints?.[key]?.sha256 !== artifact.sha256
      || entryPoints?.[key]?.byteLength !== artifact.byteLength
      || entryPoints?.[key]?.mediaType !== artifact.mediaType
    ) {
      fail('FORMAT2_QA_ARTIFACT_INVALID', 'Completed Job QA entry point no longer matches its artifact')
    }
    const filePath = path.resolve(paperDir, artifact.relativePath)
    if (!filePath.startsWith(`${path.resolve(paperDir)}${path.sep}`) || !existsSync(filePath)) {
      fail('FORMAT2_QA_ARTIFACT_INVALID', 'Completed Job QA artifact path is missing or unsafe')
    }
    const bytes = readFileSync(filePath)
    if (
      bytes.byteLength !== artifact.byteLength
      || sha256(new Uint8Array(bytes)) !== artifact.sha256
    ) {
      fail('FORMAT2_QA_ARTIFACT_INVALID', 'Completed Job QA artifact bytes changed after receipt')
    }
  }
}

function verifyPublishedAnalysisSidecars(repositoryRoot, result) {
  const manifest = result.artifacts?.analysisSidecars
  if (!manifest) return
  if (
    manifest.schemaVersion !== 'format2-analysis-sidecars-v1'
    || !Array.isArray(manifest.items)
  ) {
    fail('FORMAT2_ANALYSIS_SIDECAR_INVALID', 'Completed Job Analysis sidecar manifest is invalid')
  }
  const versionDir = path.join(
    repositoryRoot,
    'app/public/paper-assets',
    result.paperId,
    'versions',
    result.canonicalPublication.versionName,
  )
  for (const sidecar of manifest.items) {
    const config = analysisSidecarConfigs.get(sidecar.schemaVersion)
    const relativePath = config ? `analyses/${config.fileName}` : null
    const filePath = relativePath ? path.join(versionDir, relativePath) : null
    if (
      !config
      || sidecar.relativePath !== relativePath
      || !SHA256_PATTERN.test(sidecar.sha256)
      || !Number.isInteger(sidecar.byteLength)
      || !filePath
      || !existsSync(filePath)
    ) {
      fail('FORMAT2_ANALYSIS_SIDECAR_INVALID', 'Completed Job Analysis sidecar identity is invalid')
    }
    const bytes = readFileSync(filePath)
    if (
      bytes.byteLength !== sidecar.byteLength
      || sha256(new Uint8Array(bytes)) !== sidecar.sha256
    ) {
      fail('FORMAT2_ANALYSIS_SIDECAR_INVALID', 'Completed Job Analysis sidecar bytes changed after publication')
    }
  }
}

function committedPublicationIdentity({ paperId, published, screen, printPdf }) {
  return {
    paperId,
    versionName: published.versionName,
    sourceAssetVersion: 1,
    publicationDigest: published.publicationDigest,
    reloads: {
      screen: {
        disposition: screen.disposition,
        paperId: screen.paperId,
        versionName: published.versionName,
        publicationDigest: published.publicationDigest,
      },
      printPdf: {
        disposition: printPdf.disposition,
        paperId: printPdf.paperId,
        versionName: published.versionName,
        publicationDigest: published.publicationDigest,
      },
    },
  }
}

function verifyCompletedAwaitingQa(repositoryRoot, paperDir, jobRoot, receipt) {
  const committed = receipt.result?.canonicalPublication
  const publicationDbPath = path.join(repositoryRoot, 'data/question-bank.sqlite')
  if (
    committed?.paperId !== receipt.result.paperId
    || !nonEmptyString(committed.versionName)
    || !nonEmptyString(committed.publicationDigest)
    || !existsSync(publicationDbPath)
  ) {
    fail(
      'FORMAT2_JOB_DURABLE_STATE_INVALID',
      'Completed Format 2 Job lacks one closed local publication identity',
    )
  }
  const db = new DatabaseSync(publicationDbPath)
  try {
    const store = createFileSystemCanonicalPublicationStore({
      rootDir: path.join(repositoryRoot, 'app/public/paper-assets'),
      db,
    })
    const screen = loadPaperForConsumptionSync({
      paperId: committed.paperId,
      version: committed.versionName,
      consumerContract: readingOptionFigureConsumerContractRefs.screen,
    }, store)
    const printPdf = loadPaperForConsumptionSync({
      paperId: committed.paperId,
      version: committed.versionName,
      consumerContract: readingOptionFigureConsumerContractRefs.print_pdf,
    }, store)
    const currentRef = store.readPublishedRefs(committed.paperId).current
    if (
      screen.disposition !== 'ready'
      || printPdf.disposition !== 'ready'
      || currentRef?.versionName !== committed.versionName
      || currentRef?.publicationDigest !== committed.publicationDigest
    ) {
      fail(
        'FORMAT2_CANONICAL_EXACT_RELOAD_FAILED',
        'Completed Format 2 Job no-op requires the exact committed local reload',
      )
    }
  } finally {
    db.close()
  }
  const signalsDir = path.join(paperDir, 'signals')
  const aiCheckPath = path.join(signalsDir, 'ai-answer-check.json')
  let aiCheckValid = false
  if (existsSync(aiCheckPath)) {
    try {
      const signal = readJson(aiCheckPath, 'Format 2 AI answer-check signal')
      aiCheckValid = signal.ok === true
        && signal.answerPdfSha256 === receipt.inputDigests.answerPdfSha256
        && signal.checkDigest === receipt.inputDigests.answerTranscriptionCheckDigest
    } catch {
      aiCheckValid = false
    }
  }
  if (!aiCheckValid) {
    fail('FORMAT2_ANSWER_TRANSCRIPTION_CHECK_INVALID', 'Completed Job lacks its exact digest-bound AI Answer Transcription Check signal')
  }
  verifyQaArtifacts(paperDir, receipt.result)
  verifyPublishedAnalysisSidecars(repositoryRoot, receipt.result)
  verifyPublicationStoreDescriptor(jobRoot)
  const helpPath = path.join(signalsDir, 'help-needed.json')
  if (existsSync(helpPath)) unlinkSync(helpPath)
  return cloneJson(receipt.result)
}

function verifyPublicationStoreDescriptor(jobRoot) {
  const descriptorPath = path.join(jobRoot, 'publication-store.json')
  if (!existsSync(descriptorPath)) {
    fail(
      'FORMAT2_JOB_DURABLE_STATE_INVALID',
      'Completed Format 2 Job lacks its local publication store descriptor',
    )
  }
  const descriptor = readJson(descriptorPath, 'Format 2 local publication store descriptor')
  if (
    !exactKeys(descriptor, ['schemaVersion', 'database'])
    || descriptor.schemaVersion !== 'format2-local-publication-store-v1'
    || descriptor.database !== 'data/question-bank.sqlite'
  ) {
    fail(
      'FORMAT2_JOB_DURABLE_STATE_INVALID',
      'Format 2 local publication store descriptor is invalid',
    )
  }
}

function persistAwaitingQa({
  evidence,
  result,
  answerCheck,
  completionFailurePoint,
}) {
  const current = {
    ...cloneJson(evidence.receipt),
    contractVersions: {
      ...cloneJson(evidence.receipt.contractVersions),
      canonicalPublication: 'canonical-paper-publication-v46',
    },
    disposition: 'stopped',
    nextStopReason: QA_STOP_CODE,
    result,
  }
  const signalsDir = path.join(evidence.paperDir, 'signals')
  mkdirSync(signalsDir, { recursive: true })
  const qaAcceptedPath = path.join(signalsDir, 'qa-accepted.json')
  if (existsSync(qaAcceptedPath)) unlinkSync(qaAcceptedPath)
  const aiCheckPath = path.join(signalsDir, 'ai-answer-check.json')
  atomicWrite(aiCheckPath, jsonBytes({
    ok: true,
    checkedAt: new Date().toISOString(),
    method: 'ai-source-markings-vs-answer-key',
    ...answerCheck,
  }))
  const persistedAnswerCheck = readJson(aiCheckPath, 'Format 2 AI answer-check signal')
  if (
    !nonEmptyString(persistedAnswerCheck.checkedAt)
    || !Number.isFinite(Date.parse(persistedAnswerCheck.checkedAt))
    || !sameValue(persistedAnswerCheck, {
      ok: true,
      checkedAt: persistedAnswerCheck.checkedAt,
      method: 'ai-source-markings-vs-answer-key',
      ...answerCheck,
    })
  ) {
    fail(
      'FORMAT2_ANSWER_TRANSCRIPTION_CHECK_INVALID',
      'Awaiting-QA completion requires one exact persisted AI Answer Transcription Check signal',
    )
  }
  const helpPath = path.join(signalsDir, 'help-needed.json')
  if (existsSync(helpPath)) unlinkSync(helpPath)
  writeImmutable(
    path.join(evidence.jobRoot, 'publication-store.json'),
    jsonBytes({
      schemaVersion: 'format2-local-publication-store-v1',
      database: 'data/question-bank.sqlite',
    }),
    'Format 2 local publication store descriptor',
  )
  verifyPublicationStoreDescriptor(evidence.jobRoot)
  verifyQaArtifacts(evidence.paperDir, result)
  if (completionFailurePoint === COMPLETION_FAILURE_POINT) {
    fail(
      'FORMAT2_JOB_PERSISTENCE_FORCED_CRASH',
      'Forced interruption after awaiting-QA dependencies and before the current receipt',
    )
  }
  atomicWrite(path.join(evidence.jobRoot, 'current.json'), jsonBytes(current))
}

function runResume(
  input,
  repositoryRoot,
  publicationFailurePoint = null,
  completionFailurePoint = null,
) {
  validateResumeInput(input)
  const evidence = loadResumeEvidence(repositoryRoot, input)
  if (evidence.completed) {
    return verifyCompletedAwaitingQa(
      repositoryRoot,
      evidence.paperDir,
      evidence.jobRoot,
      evidence.receipt,
    )
  }
  let confirmedSelection
  try {
    confirmedSelection = confirmVisualImportCandidate(
      evidence.candidatePackage,
      input.teacherConfirmation,
    )
  } catch (error) {
    fail(
      error?.code || 'FORMAT2_JOB_CONFIRMATION_INVALID',
      error?.message || 'Exact Teacher Confirmation failed closed',
    )
  }
  if (
    confirmedSelection.status !== 'confirmed'
    || confirmedSelection.unresolvedIssues.length > 0
  ) {
    return unresolvedResumeResult(evidence, confirmedSelection)
  }
  const answerCheck = validateAnswerTranscriptionCheck({
    transcription: evidence.transcription,
    sources: {
      answerPdf: { sha256: evidence.receipt.inputDigests.answerPdfSha256 },
    },
  }, evidence.answerPdfBytes)
  const prepared = buildConfirmedFormat2CanonicalRequest({
    transcription: evidence.transcription,
    questionPdfBytes: evidence.questionPdfBytes,
    answerPdfBytes: evidence.answerPdfBytes,
    confirmedSelection,
  })
  const publicationConfirmation = readingOptionPublicationConfirmation(
    evidence,
    confirmedSelection,
  )
  const publicationRoot = path.join(repositoryRoot, 'app/public/paper-assets')
  mkdirSync(evidence.jobRoot, { recursive: true })
  const publicationDbPath = path.join(repositoryRoot, 'data/question-bank.sqlite')
  mkdirSync(path.dirname(publicationDbPath), { recursive: true })
  const db = new DatabaseSync(publicationDbPath)
  try {
    recoverCanonicalPaperPublication({
      rootDir: publicationRoot,
      db,
      paperId: input.paperId,
    })
    const published = publishCanonicalPaperPublication({
      rootDir: publicationRoot,
      db,
      request: prepared.request,
      sourceAssetVersion: 1,
      sourceAsset: prepared.sourceAsset,
      visualConfirmation: {
        candidatePackage: publicationConfirmation.candidatePackage,
        teacherConfirmation: publicationConfirmation.teacherConfirmation,
      },
      sidecars: prepared.analysisSidecars.map((sidecar) => ({
        relativePath:
          `analyses/${analysisSidecarConfigs.get(sidecar.schemaVersion).fileName}`,
        bytes: sidecar.bytes,
      })),
      failurePoint: publicationFailurePoint,
    })
    if (!['published', 'idempotent'].includes(published.status)) {
      const diagnostics = canonicalDiagnostics(published.compilation)
      fail(
        'FORMAT2_CANONICAL_COMPILATION_UNRESOLVED',
        'Confirmed Format 2 source did not produce one complete Canonical Paper',
        diagnostics.length > 0 ? diagnostics : published.diagnostics,
      )
    }
    const store = createFileSystemCanonicalPublicationStore({
      rootDir: publicationRoot,
      db,
    })
    const screen = loadPaperForConsumptionSync({
      paperId: input.paperId,
      version: published.versionName,
      consumerContract: readingOptionFigureConsumerContractRefs.screen,
    }, store)
    const printPdf = loadPaperForConsumptionSync({
      paperId: input.paperId,
      version: published.versionName,
      consumerContract: readingOptionFigureConsumerContractRefs.print_pdf,
    }, store)
    const currentRef = store.readPublishedRefs(input.paperId).current
    if (
      screen.disposition !== 'ready'
      || printPdf.disposition !== 'ready'
      || currentRef?.versionName !== published.versionName
      || currentRef?.publicationDigest !== published.publicationDigest
    ) {
      fail(
        'FORMAT2_CANONICAL_EXACT_RELOAD_FAILED',
        'Local publication success requires exact committed Screen and Print/PDF reload',
      )
    }
    const canonicalPublication = committedPublicationIdentity({
      paperId: input.paperId,
      published,
      screen,
      printPdf,
    })
    const qaArtifacts = persistQaArtifacts({
      evidence,
      paperName: evidence.receipt.result.provenance.paperName,
      printConsumption: printPdf,
      publicationRoot,
    })
    const result = {
      schemaVersion: RESULT_SCHEMA_VERSION,
      paperId: input.paperId,
      provenance: cloneJson(evidence.receipt.result.provenance),
      jobId: input.jobId,
      lifecycle: 'awaiting_qa',
      stopReason: { code: QA_STOP_CODE },
      diagnostics: [],
      artifacts: {
        ...cloneJson(evidence.receipt.result.artifacts),
        confirmedSelection: {
          schemaVersion: confirmedSelection.schemaVersion,
          candidatePackageDigest: confirmedSelection.candidatePackageDigest,
          confirmationDigest: confirmedSelection.confirmationDigest,
          digest: digestJson(confirmedSelection),
        },
        qa: qaArtifacts,
        ...(published.sidecars?.length > 0
          ? {
              analysisSidecars: {
                schemaVersion: 'format2-analysis-sidecars-v1',
                items: published.sidecars.map((sidecar) => ({
                  ...cloneJson(sidecar),
                  schemaVersion: [...analysisSidecarConfigs.entries()].find(
                    ([, config]) => `analyses/${config.fileName}` === sidecar.relativePath,
                  )[0],
                })),
              },
            }
          : {}),
      },
      humanEntryPoints: buildQaEntryPoints({
        evidence,
        publication: canonicalPublication,
        confirmedSelection: {
          confirmationDigest: confirmedSelection.confirmationDigest,
        },
        qaArtifacts,
      }),
      canonicalPublication,
    }
    verifyPublishedAnalysisSidecars(repositoryRoot, result)
    persistAwaitingQa({ evidence, result, answerCheck, completionFailurePoint })
    return cloneJson(result)
  } finally {
    db.close()
  }
}

export function createFormat2ImportJobRuntime({
  repositoryRoot,
  publicationFailurePoint = null,
  completionFailurePoint = null,
}) {
  if (!path.isAbsolute(repositoryRoot)) {
    throw format2Error(
      'FORMAT2_JOB_RUNTIME_INVALID',
      'Format 2 internal runtime requires one absolute repository root',
    )
  }
  return Object.freeze({
    startOrContinueFormat2ImportJob(input) {
      try {
        return runStartOrContinue(input, repositoryRoot)
      } catch (error) {
        return failureResult(error)
      }
    },
    resumeFormat2ImportJob(input) {
      try {
        return runResume(
          input,
          repositoryRoot,
          publicationFailurePoint,
          completionFailurePoint,
        )
      } catch (error) {
        return failureResult(error)
      }
    },
    rejectUnsupportedPublicArguments() {
      return failureResult(format2Error(
        'FORMAT2_JOB_REQUEST_INVALID',
        'Public Format 2 Job callers cannot choose repository or storage paths',
      ))
    },
  })
}
