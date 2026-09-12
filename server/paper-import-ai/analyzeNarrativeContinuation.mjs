import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv from 'ajv/dist/2020.js'
import {
  createAnalyzerProviderShell,
  readPromptFile,
  readTeachingAnalysisPrompt,
} from './analyzerProviderShell.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '../..')
const promptPath = path.join(rootDir, 'prompts/continuation-analysis-v2.md')
const stagedAnalysisContractPath = path.join(
  rootDir,
  'prompts/continuation-writing-staged-analysis-v2.md',
)
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

export function buildNarrativeContinuationAnalysisMessages({ writingTask }) {
  assertNarrativeContinuationInput({ writingTask })
  return [
    {
      role: 'system',
      content: `${readTeachingAnalysisPrompt(promptPath)}\n\nExact output schema:\n${JSON.stringify(schema)}`,
    },
    {
      role: 'user',
      content: [
        'Analyze the complete continuation Writing Task below.',
        'If it is eligible narrative continuation, return one continuation-analysis-v2 JSON object.',
        'If it is not eligible, return only the unsupported sentinel specified by the system prompt.',
        'Return JSON text only.',
        '',
        'Structured input:',
        JSON.stringify(buildPromptInput(writingTask), null, 2),
      ].join('\n'),
    },
  ]
}

export function buildNarrativeContinuationStagedAnalysisContract() {
  return [
    readPromptFile(promptPath).trimEnd(),
    '',
    'Exact nested continuationAnalysis schema:',
    JSON.stringify(schema),
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

export function validateNarrativeContinuationAnalysis(analysis, { writingTask }) {
  assertNarrativeContinuationInput({ writingTask })

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
  return /schema invalid|evidence excerpt|constraint ids|requiredExitState|JSON|缺少|必须|不能为空/.test(message)
}

export const analyzeNarrativeContinuationImportCandidate = createAnalyzerProviderShell({
  assertInput: assertNarrativeContinuationInput,
  buildMessages: buildNarrativeContinuationAnalysisMessages,
  validate: (analysis, input) => validateNarrativeContinuationAnalysis(analysis, input),
  isRetryable: isRetryableNarrativeContinuationError,
})
