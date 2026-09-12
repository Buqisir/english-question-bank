import { readFileSync } from 'node:fs'
import path from 'node:path'
import Ajv from 'ajv/dist/2020.js'

import {
  TOPIC_LABEL_TAXONOMY,
  isExactTopicTriple,
} from '../../shared/topics/topicTaxonomy.mjs'

const schemaPath = path.resolve(import.meta.dirname, '../../schemas/paper-import/listening-analysis-v1.schema.json')
const promptPath = path.resolve(import.meta.dirname, '../../prompts/listening-analysis-v1.md')
export const LISTENING_ANALYSIS_FILE_NAME = 'listening-analysis-v1.json'
export const LISTENING_STAGED_ANALYSIS_FILE_NAME = 'analysis-listening.json'
export const LISTENING_ANALYSIS_PROFILE = 'complete-with-listening-v1'
export const LEGACY_NCK1_ANALYSIS_PROFILE = 'legacy-nine-v1'

export const LISTENING_ANALYSIS_SCHEMA = Object.freeze(
  JSON.parse(readFileSync(schemaPath, 'utf8')),
)
const validateSchema = new Ajv({ allErrors: true, strict: false }).compile(LISTENING_ANALYSIS_SCHEMA)

function fail(message, code = 'LISTENING_ANALYSIS_INVALID') {
  const error = new Error(message)
  error.code = code
  throw error
}

function formatSchemaErrors(errors = []) {
  return errors.map((error) => `${error.instancePath || '/'} ${error.message || 'invalid'}`).join('; ')
}

function exactKeys(value, expected, label) {
  const actual = Object.keys(value || {}).sort()
  const wanted = [...expected].sort()
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    fail(`${label} identity closure mismatch: expected ${wanted.join(', ')}, got ${actual.join(', ')}`)
  }
}

function sourceListening(materialization) {
  const listening = materialization?.listening
  if (listening?.state !== 'captured') {
    fail('Listening teaching analysis requires captured listening source material')
  }
  return listening
}

export function buildListeningAnalysisInput(materialization, { segmentIds = null } = {}) {
  const listening = sourceListening(materialization)
  const selectedIds = segmentIds === null
    ? new Set(listening.transcript.map(({ segmentId }) => segmentId))
    : new Set(segmentIds)
  if (selectedIds.size === 0) fail('Listening analysis input must select at least one material')
  const answers = new Map(listening.answers.map(({ canonicalNumber, value }) => [canonicalNumber, value]))
  const questions = new Map(listening.questions.map((question) => [question.canonicalNumber, question]))
  const materials = listening.transcript
    .filter(({ segmentId }) => selectedIds.has(segmentId))
    .map((segment) => ({
      segmentId: segment.segmentId,
      transcript: segment.text,
      questions: segment.questionNumbers.map((questionNo) => {
        const question = questions.get(questionNo)
        const officialAnswer = answers.get(questionNo)
        if (!question || !officialAnswer) fail(`${segment.segmentId} references unresolved question ${questionNo}`)
        return {
          questionId: `question:listening:${questionNo}`,
          questionNo,
          stem: question.stem,
          options: Object.fromEntries(question.options.map(({ label, text }) => [label, text])),
          officialAnswer,
        }
      }),
    }))
  exactKeys(Object.fromEntries(materials.map((material) => [material.segmentId, true])), selectedIds, 'Listening material selection')
  return {
    paperId: materialization.paperId,
    sourceAssetVersion: 1,
    materials,
  }
}

export function buildListeningAnalysisMessages({ materialization, segmentIds = null }) {
  const input = buildListeningAnalysisInput(materialization, { segmentIds })
  const prompt = readFileSync(promptPath, 'utf8').trim()
  return [{
    role: 'system',
    content: [
      prompt,
      '',
      'Exact output JSON Schema (authoritative; do not assume repository access):',
      JSON.stringify(LISTENING_ANALYSIS_SCHEMA, null, 2),
      '',
      'Exact allowed topic taxonomy (choose one linked object per material):',
      JSON.stringify(TOPIC_LABEL_TAXONOMY.map(({ theme, themeGroup, subtopic }) => ({ theme, themeGroup, subtopic })), null, 2),
    ].join('\n'),
  }, {
    role: 'user',
    content: [
      'Create the complete listening-analysis-v1 JSON for LISTENING_INPUT.',
      'Return JSON text only.',
      '',
      'LISTENING_INPUT',
      JSON.stringify(input, null, 2),
    ].join('\n'),
  }]
}

export function buildListeningAnalysisAgentRequest({
  materialization,
  segmentIds = null,
  teachingDoctrine,
}) {
  const input = buildListeningAnalysisInput(materialization, { segmentIds })
  const outputContract = [
    readFileSync(promptPath, 'utf8').trim(),
    '',
    'Exact output JSON Schema:',
    JSON.stringify(LISTENING_ANALYSIS_SCHEMA, null, 2),
    '',
    'Exact allowed topic taxonomy:',
    JSON.stringify(TOPIC_LABEL_TAXONOMY.map(({ theme, themeGroup, subtopic }) => ({ theme, themeGroup, subtopic })), null, 2),
  ].join('\n')
  return {
    group: 'listening-unit',
    sourceGroup: {
      groupKey: 'listening-unit',
      material: { groupId: 'listening-unit', ...input },
    },
    authoritativeAnswers: Object.fromEntries(input.materials.flatMap((material) =>
      material.questions.map(({ questionId, officialAnswer }) => [questionId, officialAnswer]))),
    outputContract,
    teachingDoctrine,
  }
}

export function validateListeningAnalysis(analysis, {
  materialization,
  segmentIds = null,
  sourceAssetVersion = 1,
} = {}) {
  if (!validateSchema(analysis)) fail(`Listening analysis schema invalid: ${formatSchemaErrors(validateSchema.errors)}`)
  if (analysis.paperId !== materialization?.paperId) fail('Listening analysis paperId does not match the source')
  if (analysis.sourceAssetVersion !== sourceAssetVersion) fail('Listening analysis sourceAssetVersion does not match the Review Candidate')
  const input = buildListeningAnalysisInput(materialization, { segmentIds })
  const expectedMaterials = new Map(input.materials.map((material) => [material.segmentId, material]))
  const expectedQuestions = new Map(input.materials.flatMap((material) =>
    material.questions.map((question) => [question.questionId, { ...question, segmentId: material.segmentId }])))
  exactKeys(analysis.materials, expectedMaterials.keys(), 'Listening materials')
  exactKeys(analysis.questions, expectedQuestions.keys(), 'Listening questions')

  const assignedQuestions = new Set()
  const warnings = []
  for (const [segmentId, expected] of expectedMaterials) {
    const material = analysis.materials[segmentId]
    if (material.segmentId !== segmentId) fail(`${segmentId} material identity is forged`)
    if (material.transcript !== expected.transcript) fail(`${segmentId} transcript must exactly match the captured source`)
    if (!isExactTopicTriple(material.topic)) fail(`${segmentId} topic is not one valid taxonomy parent-child triple`)
    const expectedIds = expected.questions.map(({ questionId }) => questionId)
    if (new Set(material.questionIds).size !== material.questionIds.length) fail(`${segmentId} has duplicate questionIds`)
    if (JSON.stringify([...material.questionIds].sort()) !== JSON.stringify([...expectedIds].sort())) {
      fail(`${segmentId} questionIds do not match its captured questionNumbers`)
    }
    for (const questionId of material.questionIds) {
      if (assignedQuestions.has(questionId)) fail(`${questionId} is assigned to more than one listening material`)
      assignedQuestions.add(questionId)
    }
    const chineseCharacters = (material.summaryZh.match(/\p{Script=Han}/gu) || []).length
    if (chineseCharacters < 20 || chineseCharacters > 40) {
      warnings.push({
        code: chineseCharacters < 20 ? 'LISTENING_SUMMARY_SHORT' : 'LISTENING_SUMMARY_LONG',
        segmentId,
        chineseCharacters,
        message: `${segmentId} summary has ${chineseCharacters} Chinese characters; 20–40 is a soft target`,
      })
    }
  }

  for (const [questionId, expected] of expectedQuestions) {
    const question = analysis.questions[questionId]
    if (question.questionId !== questionId) fail(`${questionId} question identity is forged`)
    if (question.segmentId !== expected.segmentId) fail(`${questionId} is bound to the wrong listening material`)
    if (question.officialAnswer !== expected.officialAnswer) fail(`${questionId} official answer disagrees with source authority`)
    const material = analysis.materials[expected.segmentId]
    if (!material.transcript.includes(question.evidence.quote)) fail(`${questionId} evidence quote must exactly occur in its transcript`)
    const distractorLabels = (question.distractors || []).map(({ label }) => label)
    if (new Set(distractorLabels).size !== distractorLabels.length) fail(`${questionId} has duplicate distractor labels`)
    if (distractorLabels.includes(question.officialAnswer)) fail(`${questionId} marks the official answer as a distractor`)
  }
  if (assignedQuestions.size !== expectedQuestions.size) fail('Listening material question coverage is incomplete')

  return { ok: true, warnings }
}
