import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv from 'ajv/dist/2020.js'
import {
  createAnalyzerProviderShell,
  readPromptFile,
} from './analyzerProviderShell.mjs'
import {
  CONTINUATION_ANALYSIS_V3,
  checkContinuationAnalysisV3,
} from '../../shared/writing/continuationAnalysisV3.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '../..')
// Spec D2 (docs/cuts/continuation-writing-v3/spec.md): the V3 prompt body plus
// the structured task input, exactly as in the blind trials. The shared
// teaching doctrine is not appended. V2 stays only for validating stored data.
const promptPath = path.join(rootDir, 'prompts/continuation-writing-model-answer-v3.md')
const stagedAnalysisContractPath = path.join(
  rootDir,
  'prompts/continuation-writing-staged-analysis-v3.md',
)
const CONTINUATION_V3_HEADING = '# Continuation Writing Model Answer Prompt — V3'
const schemaPath = path.join(rootDir, 'schemas/paper-import/continuation-analysis-v2.schema.json')

const schema = JSON.parse(readPromptFile(schemaPath))
const validateSchema = new Ajv({ allErrors: true, strict: false }).compile(schema)

function optionalString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function assertNarrativeContinuationInput(input) {
  const writingTask = input?.writingTask
  if (!writingTask || typeof writingTask !== 'object' || Array.isArray(writingTask)) {
    throw new Error('缺少 continuation Writing Task。')
  }
  if (writingTask.taskType !== 'continuation') {
    throw new Error(`Writing Task taskType 必须是 continuation，got ${writingTask.taskType || 'empty'}。`)
  }
  if (!optionalString(writingTask.instruction)) throw new Error('continuation instruction 不能为空。')
  if (!optionalString(writingTask.materialText)) throw new Error('continuation materialText 不能为空。')
  if (!Array.isArray(writingTask.continuationStarters) || writingTask.continuationStarters.length !== 2) {
    throw new Error('continuationStarters 必须恰好包含两个段首句。')
  }
  if (!writingTask.continuationStarters.every(optionalString)) {
    throw new Error('两个 continuation starter 都必须是非空字符串。')
  }
}

function buildPromptInput(writingTask) {
  return {
    writingTaskId: writingTask.writingTaskId || '',
    groupId: writingTask.groupId || '',
    taskType: 'continuation',
    instruction: writingTask.instruction,
    materialText: writingTask.materialText,
    paragraphStarters: [
      writingTask.continuationStarters[0],
      writingTask.continuationStarters[1],
    ],
    wordCountTarget: Number(writingTask.wordCountTarget || 150),
  }
}

/**
 * The V3 prompt the model sees: the file from 「你是一名」 on. The title and the
 * status/provenance notes above it are for maintainers; the trials sent the
 * body only (`docs/cuts/continuation-writing-v3/trial/prep.mjs`).
 */
export function readContinuationV3PromptBody() {
  const text = readPromptFile(promptPath)
  const lines = text.split('\n')
  if (lines[0] !== CONTINUATION_V3_HEADING) {
    throw new Error(`continuation V3 prompt must start with ${CONTINUATION_V3_HEADING}`)
  }
  let start = 1
  while (start < lines.length && (lines[start] === '' || lines[start].startsWith('>'))) start += 1
  return lines.slice(start).join('\n')
}

export function buildContinuationTaskInputText(writingTask) {
  assertNarrativeContinuationInput({ writingTask })
  return [
    'Complete continuation Writing Task:',
    '',
    'Structured input:',
    JSON.stringify(buildPromptInput(writingTask), null, 2),
  ].join('\n')
}

export function buildNarrativeContinuationAnalysisMessages({ writingTask }) {
  const taskText = buildContinuationTaskInputText(writingTask)
  return [{ role: 'user', content: `${readContinuationV3PromptBody()}\n\n${taskText}\n` }]
}

export function buildNarrativeContinuationStagedAnalysisContract() {
  return [
    CONTINUATION_V3_HEADING,
    '',
    readContinuationV3PromptBody().trimEnd(),
    '',
    '---',
    '',
    readPromptFile(stagedAnalysisContractPath).trim(),
  ].join('\n')
}

function formatSchemaErrors(errors = []) {
  return errors
    .map((error) => {
      const location = error.instancePath || '/'
      const property = error.params?.additionalProperty
        ? ` (${error.params.additionalProperty})`
        : ''
      return `${location}: ${error.message || 'invalid'}${property}`
    })
    .join('; ')
}

function visitObjects(value, visit) {
  if (!value || typeof value !== 'object') return
  visit(value)
  if (Array.isArray(value)) {
    for (const item of value) visitObjects(item, visit)
    return
  }
  for (const child of Object.values(value)) visitObjects(child, visit)
}

function sourceTextByEvidenceKind(writingTask) {
  return {
    instruction: writingTask.instruction,
    material: writingTask.materialText,
    paragraph1Starter: writingTask.continuationStarters[0],
    paragraph2Starter: writingTask.continuationStarters[1],
  }
}

function validateEvidenceRefs(analysis, writingTask) {
  const sources = sourceTextByEvidenceKind(writingTask)
  visitObjects(analysis, (value) => {
    if (!Object.hasOwn(value, 'source') || !Object.hasOwn(value, 'excerpt')) return
    const source = value.source
    const excerpt = value.excerpt
    if (!Object.hasOwn(sources, source)) {
      throw new Error(`evidence source is invalid: ${String(source)}`)
    }
    if (!sources[source].includes(excerpt)) {
      throw new Error(
        `evidence excerpt must be an exact substring of ${source}: ${JSON.stringify(excerpt)}`,
      )
    }
  })
}

function validateConstraintInvariants(analysis) {
  const constraints = []
  for (const constraint of analysis.continuationContract.hardConstraints) constraints.push(constraint)
  for (const constraint of analysis.continuationContract.forbiddenContradictions) constraints.push(constraint)
  for (const paragraph of analysis.continuationContract.paragraphs) {
    for (const constraint of paragraph.requiredMoves) constraints.push(constraint)
    for (const constraint of paragraph.requiredExitState) constraints.push(constraint)
  }
  for (const constraint of analysis.continuationContract.closureRequirements) constraints.push(constraint)

  const constraintIds = constraints.map(({ id }) => id)
  const duplicateIds = constraintIds.filter((id, index) => constraintIds.indexOf(id) !== index)
  if (duplicateIds.length > 0) {
    throw new Error(`continuation constraint ids must be unique: ${[...new Set(duplicateIds)].join(', ')}`)
  }

  const paragraph1Exit = analysis.continuationContract.paragraphs[0].requiredExitState
  const hasBackwardStarterEvidence = paragraph1Exit.some((constraint) => (
    constraint.evidence.some((item) => item.source === 'paragraph2Starter')
  ))
  if (!hasBackwardStarterEvidence) {
    throw new Error(
      'paragraph 1 requiredExitState must include evidence from paragraph2Starter.',
    )
  }

  const normalizedConstraints = new Set(constraints.map(({ statement }) => statement.trim().toLowerCase()))
  const optionalRoutes = [
    ...analysis.continuationContract.openChoices,
    ...analysis.continuationContract.paragraphs.flatMap((paragraph) =>
      paragraph.supportedOptions.map(({ statement }) => statement)),
    ...(analysis.developmentPlan.alternatives || []),
  ]
  const promoted = optionalRoutes.find((statement) =>
    normalizedConstraints.has(statement.trim().toLowerCase()))
  if (promoted) {
    throw new Error(`optional routes must not be duplicated as constraints: ${promoted}`)
  }
}

/**
 * V3 check (docs/cuts/continuation-writing-v3/spec.md D3). Accepts either the
 * stored object or the model's raw output (with `taskType` and `blocked`), and
 * returns the writing entry to persist. Throws on any D3 failure.
 */
export function validateContinuationAnalysisV3({ analysis, writingTask }) {
  assertNarrativeContinuationInput({ writingTask })
  if (!analysis || typeof analysis !== 'object' || Array.isArray(analysis)) {
    throw new Error('continuation analysis V3 is not an object')
  }
  let stored = analysis
  if ('blocked' in analysis || 'taskType' in analysis) {
    if (analysis.blocked != null) throw new Error(`continuation analysis V3 is blocked: ${analysis.blocked}`)
    if (analysis.taskType !== 'continuation') throw new Error('continuation analysis V3 taskType must be continuation')
    const { taskType: _taskType, blocked: _blocked, ...rest } = analysis
    stored = { schemaVersion: CONTINUATION_ANALYSIS_V3, ...rest }
  }
  const { problems, warnings, wordCounts, directSpeech } = checkContinuationAnalysisV3(stored, {
    material: writingTask.materialText,
    starters: writingTask.continuationStarters,
    wordCountTarget: Number(writingTask.wordCountTarget || 150),
  })
  if (problems.length > 0) {
    throw new Error(`continuation analysis V3 failed: ${problems.join('; ')}`)
  }
  return {
    writing: { taskType: 'continuation', modelAnswer: stored.standard.essay, continuationAnalysis: stored },
    warnings,
    wordCounts,
    directSpeech,
  }
}

export function validateNarrativeContinuationAnalysis(analysis, { writingTask }) {
  assertNarrativeContinuationInput({ writingTask })

  if (analysis?.schemaVersion === CONTINUATION_ANALYSIS_V3) {
    validateContinuationAnalysisV3({ analysis, writingTask })
    return analysis
  }

  if (analysis?.status === 'unsupported') {
    const observedMode = optionalString(analysis.observedMode) || 'unknown'
    const reason = optionalString(analysis.reason) || 'No reason supplied.'
    throw new Error(`UNSUPPORTED_CONTINUATION_MODE: ${observedMode}: ${reason}`)
  }

  if (!validateSchema(analysis)) {
    throw new Error(`continuation analysis schema invalid: ${formatSchemaErrors(validateSchema.errors)}`)
  }

  validateEvidenceRefs(analysis, writingTask)
  validateConstraintInvariants(analysis)
  return analysis
}

function isRetryableNarrativeContinuationError(error) {
  const message = error instanceof Error ? error.message : String(error || '')
  if (message.includes('UNSUPPORTED_CONTINUATION_MODE')) return false
  return /continuation analysis V3 failed|schema invalid|evidence excerpt|constraint ids|requiredExitState|JSON|缺少|必须|不能为空/.test(message)
}

export const analyzeNarrativeContinuationImportCandidate = createAnalyzerProviderShell({
  assertInput: assertNarrativeContinuationInput,
  buildMessages: buildNarrativeContinuationAnalysisMessages,
  // The prompt returns raw V3 (with taskType and blocked). The shell returns it
  // unchanged once it passes; validateContinuationAnalysisV3 turns it into the
  // writing entry to persist.
  validate: (analysis, input) => {
    validateContinuationAnalysisV3({ analysis, writingTask: input.writingTask })
  },
  isRetryable: isRetryableNarrativeContinuationError,
})
