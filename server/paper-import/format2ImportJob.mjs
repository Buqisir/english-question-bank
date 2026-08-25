import Ajv from 'ajv/dist/2020.js'
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  cloneJson,
  digestJson,
  exactKeys,
  sha256,
  stableStringify,
} from '../../shared/paper-canonical/stable.mjs'
import { createVisualImportCandidate } from '../paper-canonical/visualCandidate.mjs'

const FORMAT = 'format2-pdf-pair-v1'
const RESULT_SCHEMA_VERSION = 'format2-import-job-result-v1'
const RECEIPT_SCHEMA_VERSION = 'format2-import-job-receipt-v1'
const TRANSCRIPTION_SCHEMA_VERSION = 'format2-transcription-v1'
const SOURCE_PAIR_SCHEMA_VERSION = 'format2-source-pair-v1'
const STOP_CODE = 'exact_teacher_confirmation_required'
const PAPER_ID_PATTERN = /^paper-[a-z0-9]+(?:-[a-z0-9]+)*$/u
const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/u
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const transcriptionSchema = JSON.parse(readFileSync(
  path.join(rootDir, 'schemas/paper-import/format2-transcription-v1.schema.json'),
  'utf8',
))
const validateTranscriptionSchema = new Ajv({
  allErrors: true,
  strict: false,
}).compile(transcriptionSchema)

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

function validateOperationInput(input, options) {
  if (!exactKeys(input, ['paperId', 'sources', 'provenance', 'transcription', 'state'])) {
    fail(
      'FORMAT2_JOB_REQUEST_INVALID',
      'Format 2 Job accepts only paperId, sources, provenance, transcription, and state',
    )
  }
  if (!exactKeys(options, ['repositoryRoot']) || !path.isAbsolute(options.repositoryRoot)) {
    fail('FORMAT2_JOB_REQUEST_INVALID', 'Format 2 Job requires one absolute repositoryRoot dependency')
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
    inputKey: 'question_pdf',
    roles: ['question_source', 'source_provenance'],
    originalName: path.basename(input.sources.questionPdf.absolutePath),
    bytes: questionBytes,
  })
  const answerDocument = sourceDocument({
    inputKey: 'answer_pdf',
    roles: ['official_answer_source', 'source_provenance'],
    originalName: path.basename(input.sources.answerPdf.absolutePath),
    bytes: answerBytes,
  })
  return { questionBytes, answerBytes, questionDocument, answerDocument }
}

function transcriptionSchemaDiagnostics(transcription) {
  if (validateTranscriptionSchema(transcription)) return []
  return (validateTranscriptionSchema.errors || []).map((error) => ({
    code: 'FORMAT2_TRANSCRIPTION_SCHEMA_INVALID',
    path: error.instancePath || '/',
    message: `${error.instancePath || '/'} ${error.message || 'is invalid'}`,
  }))
}

function semanticIssue(code, pathValue, message) {
  return { code, path: pathValue, message }
}

function validateTranscriptionSemantics(input) {
  const transcription = input.transcription
  const schemaDiagnostics = transcriptionSchemaDiagnostics(transcription)
  if (schemaDiagnostics.length > 0) {
    fail(
      'FORMAT2_TRANSCRIPTION_SCHEMA_INVALID',
      'Format 2 transcription does not match format2-transcription-v1',
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
  const visualReferences = new Map()
  for (const [groupIndex, group] of transcription.groups.entries()) {
    const groupPath = `/groups/${groupIndex}`
    if (groups.has(group.groupId)) {
      issues.push(semanticIssue('FORMAT2_TRANSCRIPTION_IDENTITY_DUPLICATE', `${groupPath}/groupId`, 'Group identity is duplicated'))
    }
    groups.set(group.groupId, group)
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
  for (const [index, visual] of transcription.visuals.entries()) {
    const visualPath = `/visuals/${index}`
    if (observationIds.has(visual.observationId)) {
      issues.push(semanticIssue('FORMAT2_VISUAL_IDENTITY_DUPLICATE', `${visualPath}/observationId`, 'Visual observation is duplicated'))
    }
    observationIds.add(visual.observationId)
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
  if (issues.length > 0) {
    fail('FORMAT2_TRANSCRIPTION_INVALID', 'Format 2 transcription failed closed semantic validation', issues)
  }
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
    sourceSpanId: `source-span:${visual.observationId}`,
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
  const transcriptionPath = path.join(runDir, 'format2-transcription-v1.json')
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
        schemaVersion: TRANSCRIPTION_SCHEMA_VERSION,
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
    path.join(runDir, 'format2-transcription-v1.json'),
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
    },
    contractVersions: {
      transcription: TRANSCRIPTION_SCHEMA_VERSION,
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
  const helpPath = path.join(signalsDir, 'help-needed.json')
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

function runStartOrContinue(input, options) {
  validateOperationInput(input, options)
  const documents = captureExactDocuments(input)
  validateTranscriptionSemantics(input)
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
  }
  const jobId = stableId('format2-job', inputIdentity)
  const paperDir = path.join(
    options.repositoryRoot,
    'scripts/import-pipeline/papers',
    input.paperId,
  )
  const jobRoot = path.join(paperDir, 'job')
  claimWriter(jobRoot, input.state.writerId)
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

/**
 * Public pre-confirmation seam for one supported Format 2 import Job.
 * It advances deterministic work, persists exact evidence, and stops before
 * Teacher Confirmation. Canonical compilation/publication is intentionally
 * absent until the separate resume operation is implemented.
 */
export function startOrContinueFormat2ImportJob(input, options) {
  try {
    return runStartOrContinue(input, options)
  } catch (error) {
    return failureResult(error)
  }
}
