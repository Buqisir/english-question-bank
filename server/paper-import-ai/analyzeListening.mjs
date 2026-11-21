import { readFileSync } from 'node:fs'
import path from 'node:path'
import Ajv from 'ajv/dist/2020.js'
import { digestJson } from '../../shared/paper-canonical/stable.mjs'
import { readTeachingAnalysisPrompt } from './analyzerProviderShell.mjs'

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
  const prompt = readTeachingAnalysisPrompt(promptPath)
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
  sentenceTargets,
}) {
  const input = buildListeningAnalysisInput(materialization, { segmentIds })
  for (const material of input.materials) {
    if (sentenceTargets) material.sentenceTargets = sentenceTargets[material.segmentId] ?? []
  }
  const responseSchema = sentenceTargets ? structuredClone(LISTENING_ANALYSIS_SCHEMA) : LISTENING_ANALYSIS_SCHEMA
  if (sentenceTargets) responseSchema.$defs.sentence = {
    type: 'object', additionalProperties: false, required: ['id', 'zh'],
    properties: { id: { type: 'string', minLength: 1 }, zh: { type: 'string', minLength: 1 } },
  }
  const outputContract = [
    readTeachingAnalysisPrompt(promptPath),
    '',
    'Exact output JSON Schema:',
    JSON.stringify(responseSchema, null, 2),
    '',
    'Exact allowed topic taxonomy:',
    JSON.stringify(TOPIC_LABEL_TAXONOMY.map(({ theme, themeGroup, subtopic }) => ({ theme, themeGroup, subtopic })), null, 2),
    ...(sentenceTargets ? ['Copy each id from sentenceTargets and translate its en. Omit entries you cannot translate. '
      + 'The importer supplies sentence text, timing, offsets and question links.'] : []),
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

export function mergeListeningSentenceAnalysis(draft, segments = [], authored = null) {
  const analysis = structuredClone(draft)
  const byId = new Map(segments.filter(({ degraded }) => !degraded).map(segment => [segment.segment, segment.sentences]))
  for (const material of Object.values(analysis?.materials ?? {})) {
    const supplied = authored?.materials?.[material.segmentId]?.sentences
    const translations = new Map([material.sentences, supplied].flatMap(entries => Array.isArray(entries) ? entries : [])
      .filter(entry => typeof entry?.id === 'string' && typeof entry.zh === 'string' && entry.zh.trim())
      .map(({ id, zh }) => [id, zh.trim()]))
    delete material.sentences
    const aligned = byId.get(material.segmentId)
    if (!aligned?.length) continue
    const questions = (material.questionIds ?? []).flatMap(id => {
      const quote = analysis.questions?.[id]?.evidence?.quote
      const questionNo = Number(id.split(':').at(-1))
      if (!quote || !Number.isSafeInteger(questionNo) || questionNo < 1) return []
      const matches = aligned.filter(({ en }) => en.includes(quote))
      return matches.length === 1 ? [{ id: matches[0].id, questionNo }] : []
    })
    material.sentences = aligned.map(({ id, en, speaker, utf16Start, utf16End, passes }) => {
      const questionNumbers = questions.filter(question => question.id === id).map(({ questionNo }) => questionNo)
      const zh = translations.get(id)
      return { id, en, ...(zh ? { zh } : {}), ...(speaker ? { speaker } : {}), utf16Start, utf16End,
        passes: passes.map(({ start, end }) => ({ start, end })), ...(questionNumbers.length ? { questionNumbers } : {}) }
    })
  }
  return analysis
}

export function validateListeningAnalysis(analysis, {
  materialization,
  segmentIds = null,
  sourceAssetVersion = 1,
  sealed = false,
  getSentenceAlignment,
} = {}) {
  return validateListeningAnalysisInput(analysis, {
    ...buildListeningAnalysisInput(materialization, { segmentIds }),
    sourceAssetVersion,
  }, { sealed, getSentenceAlignment })
}

// The bounded input is also the exact source sent to an isolated worker.
export function validateListeningAnalysisInput(analysis, input, { sealed = false, getSentenceAlignment } = {}) {
  if (!validateSchema(analysis)) fail(`Listening analysis schema invalid: ${formatSchemaErrors(validateSchema.errors)}`)
  if (analysis.paperId !== input.paperId) fail('Listening analysis paperId does not match the source')
  if (analysis.sourceAssetVersion !== input.sourceAssetVersion) fail('Listening analysis sourceAssetVersion does not match the Review Candidate')
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
    const questionNumbers = new Set(expected.questions.map(({ questionNo }) => questionNo))
    // A sealed revision retains the sentence values checked when it was admitted.
    const sentences = sealed ? [] : material.sentences ?? []
    for (const [index, sentence] of sentences.entries()) {
      const previous = sentences[index - 1]
      if (sentence.utf16Start >= sentence.utf16End || sentence.utf16End > expected.transcript.length
        || sentence.en !== expected.transcript.slice(sentence.utf16Start, sentence.utf16End)
        || (previous && (sentence.utf16Start < previous.utf16End || sentence.passes.length !== previous.passes.length))
        || sentence.passes.some(({ start, end }, pass) => start >= end || start < previous?.passes[pass]?.end)
        || (sentence.passes[1] && sentence.passes[1].start < sentences.at(-1).passes[0].end)) {
        fail(`${segmentId} has an invalid sentence range`)
      }
      if (sentence.questionNumbers?.some(number => !questionNumbers.has(number))) {
        fail(`${segmentId} has a sentence question outside the material`)
      }
    }
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
    const { quote } = question.evidence
    if (!quote.trim()) fail(`${questionId} evidence quote must not be blank`)
    if (!material.transcript.includes(quote)) fail(`${questionId} evidence quote must exactly occur in its transcript`)
    const distractorLabels = (question.distractors || []).map(({ label }) => label)
    if (new Set(distractorLabels).size !== distractorLabels.length) fail(`${questionId} has duplicate distractor labels`)
    if (distractorLabels.includes(question.officialAnswer)) fail(`${questionId} marks the official answer as a distractor`)
  }
  if (assignedQuestions.size !== expectedQuestions.size) fail('Listening material question coverage is incomplete')

  if (!sealed && getSentenceAlignment && Object.values(analysis.materials).some(material => material.sentences)) {
    const expected = mergeListeningSentenceAnalysis(analysis, getSentenceAlignment())
    for (const [segmentId, { sentences }] of Object.entries(analysis.materials)) {
      const generated = expected.materials[segmentId].sentences
      if (sentences && (!generated || digestJson(sentences) !== digestJson(generated))) {
        fail(`${segmentId} sentences must match the program alignment`)
      }
    }
  }
  return { ok: true, warnings }
}
