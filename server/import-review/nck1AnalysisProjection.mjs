import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import Ajv from 'ajv/dist/2020.js'

import {
  buildPaperImportAiPackageFiles,
} from '../paper-import-ai/packageBuilder.mjs'
import { validateReadingAnalysisShape } from '../paper-import-ai/analyzeReading.mjs'
import { validateSevenChoicesShape } from '../paper-import-ai/analyzeSevenChoices.mjs'
import { validateClozeShape } from '../paper-import-ai/analyzeCloze.mjs'
import { validateGrammarFillShape } from '../paper-import-ai/analyzeGrammarFill.mjs'
import {
  validateNarrativeContinuationAnalysis,
} from '../paper-import-ai/analyzeNarrativeContinuation.mjs'
import {
  isCompleteReviewCard,
  validateWritingAnalysisCandidate,
} from '../writing-analysis/writingAnalysisBackfillService.mjs'
import { digestJson } from '../../shared/paper-canonical/stable.mjs'

const readingSchema = JSON.parse(readFileSync(path.join(
  import.meta.dirname,
  '../../schemas/paper-import/reading-choice-analysis-v1.schema.json',
), 'utf8'))
const writingSchema = JSON.parse(readFileSync(path.join(
  import.meta.dirname,
  '../../schemas/paper-import/writing-analysis-v1.schema.json',
), 'utf8'))
const ajv = new Ajv({ allErrors: true, strict: false })
const validateReadingSchema = ajv.compile(readingSchema)
const validateWritingSchema = ajv.compile(writingSchema)

export const NCK1_STAGED_ANALYSIS_FILES = Object.freeze([
  { key: 'reading-a', path: 'analysis-reading-a.json', role: 'analysis_reading_a' },
  { key: 'reading-b', path: 'analysis-reading-b.json', role: 'analysis_reading_b' },
  { key: 'reading-c', path: 'analysis-reading-c.json', role: 'analysis_reading_c' },
  { key: 'reading-d', path: 'analysis-reading-d.json', role: 'analysis_reading_d' },
  { key: 'seven', path: 'analysis-seven.json', role: 'analysis_seven_choices' },
  { key: 'cloze', path: 'analysis-cloze.json', role: 'analysis_cloze' },
  { key: 'grammar', path: 'analysis-grammar.json', role: 'analysis_grammar_fill' },
  { key: 'application', path: 'analysis-application.json', role: 'analysis_application' },
  { key: 'continuation', path: 'analysis-continuation.json', role: 'analysis_continuation' },
])

export const NCK1_ANALYSIS_SIDECAR_FILES = Object.freeze([
  'reading-choice-analysis-v1.json',
  'seven-choices-analysis-v1.json',
  'cloze-analysis-v1.json',
  'grammar-fill-analysis-v1.json',
  'writing-analysis-v1.json',
])

function fail(message, code = 'NCK1_ANALYSIS_INVALID') {
  const error = new Error(message)
  error.code = code
  throw error
}

function formatSchemaErrors(errors = []) {
  return errors.map((error) => {
    const property = error.params?.additionalProperty
      ? ` (${error.params.additionalProperty})`
      : ''
    return `${error.instancePath || '/'}: ${error.message || 'invalid'}${property}`
  }).join('; ')
}

function readAnalysis(rootDir, descriptor) {
  const filePath = path.join(rootDir, descriptor.path)
  if (!existsSync(filePath)) {
    fail(`Missing required staged analysis: ${descriptor.path}`, 'NCK1_ANALYSIS_INCOMPLETE')
  }
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'))
  } catch {
    fail(`Staged analysis is not valid JSON: ${descriptor.path}`)
  }
}

function optionsObject(options = []) {
  return Object.fromEntries(options.map(({ label, text }) => [label, text]))
}

function legacyGroup(paperAsset, materializationGroup, order) {
  const group = paperAsset.content.groups[materializationGroup.groupId]
  if (!group) fail(`Paper projection is missing group ${materializationGroup.groupId}`)
  return {
    groupId: materializationGroup.groupId,
    title: materializationGroup.slotId,
    order,
    paragraphs: (group.passage?.paragraphs || []).map((paragraph) => ({
      id: paragraph.paragraphId,
      text: paragraph.text,
    })),
    questions: (group.questionIds || []).map((questionId) => {
      const question = paperAsset.content.questions[questionId]
      const answer = paperAsset.answerKey.answers[questionId]
      if (!question || !answer?.answer) {
        fail(`Objective Question does not close against an authoritative answer: ${questionId}`)
      }
      return {
        id: questionId,
        stem: ['reading'].includes(materializationGroup.family)
          ? question.stem
          : String(question.questionNo),
        options: optionsObject(question.options),
        answerKey: answer.answer,
        blankId: question.blankId,
        prompt: question.blankId
          ? paperAsset.content.blanks?.[question.blankId]?.prompt || null
          : null,
      }
    }),
    blankIds: group.blankIds || [],
    optionBank: group.optionBank || [],
    continuationStarters: materializationGroup.writingTask?.starters || [],
    applicationGiven: materializationGroup.writingTask?.givenSkeleton || null,
  }
}

function exactKeys(value, expected, label) {
  const actual = Object.keys(value || {}).sort()
  const sortedExpected = [...expected].sort()
  if (JSON.stringify(actual) !== JSON.stringify(sortedExpected)) {
    fail(`${label} closure mismatch: expected ${sortedExpected.join(', ')}, got ${actual.join(', ')}`)
  }
}

function assertBlankClosure(analysis, group, collectionName) {
  exactKeys(analysis[collectionName], group.questions.map(({ id }) => id), `${group.groupId} ${collectionName}`)
  for (const question of group.questions) {
    const item = analysis[collectionName][question.id]
    if (item.blankId !== question.blankId) {
      fail(`${question.id} analysis blankId does not match the paper`)
    }
    if (Number(item.blankNo) !== Number(question.stem)) {
      fail(`${question.id} analysis blankNo does not match the paper`)
    }
  }
}

function assertAnswerClosure(analysis, group, collectionName, answerAt) {
  for (const question of group.questions) {
    if (!String(answerAt(analysis[collectionName][question.id]) || '').trim()) {
      fail(`${question.id} analysis answer does not close against the authoritative answer`)
    }
  }
}

function assertSourceVersion(analysis, expected, label) {
  if (Number(analysis.sourceAssetVersion) !== Number(expected)) {
    fail(`${label} sourceAssetVersion does not match the Review Candidate`)
  }
}

function assertReadingOptionClosure(analysis, group) {
  for (const question of group.questions) {
    const expectedLabels = Object.keys(question.options).sort()
    const items = analysis.questions[question.id]?.optionAnalysis || []
    const actualLabels = items.map(({ label }) => label).sort()
    if (
      items.length !== expectedLabels.length
      || new Set(actualLabels).size !== actualLabels.length
      || JSON.stringify(actualLabels) !== JSON.stringify(expectedLabels)
    ) {
      fail(`${question.id} reading analysis options do not close against the paper`)
    }
  }
}

export function projectNck1StagedWritingAnalysis(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    fail('Staged writing analysis is missing or not an object')
  }
  if (raw.taskType === 'application') {
    if (!isCompleteReviewCard(raw.reviewCard)) {
      fail('New-paper application analysis requires a complete ReviewCard')
    }
    return {
      taskType: 'application',
      modelAnswer: raw.modelAnswer,
      reviewCard: structuredClone(raw.reviewCard),
      ...(typeof raw.officialModelAnswer === 'string' && raw.officialModelAnswer.trim()
        ? { officialModelAnswer: raw.officialModelAnswer }
        : {}),
    }
  }
  if (raw.taskType === 'continuation') {
    if (!raw.continuationAnalysis || typeof raw.continuationAnalysis !== 'object') {
      fail('New-paper continuation analysis must use continuationAnalysis')
    }
    if (raw.continuationDesign !== undefined || raw.highlightExpressions !== undefined) {
      fail('New-paper continuation analysis must not mix historical fields')
    }
    return {
      taskType: 'continuation',
      modelAnswer: raw.modelAnswer,
      continuationAnalysis: structuredClone(raw.continuationAnalysis),
    }
  }
  fail(`Unsupported staged writing taskType: ${raw.taskType}`)
}

function writingTask(paperAsset, groupId) {
  const group = paperAsset.content.groups[groupId]
  const task = paperAsset.content.writingTasks?.[group?.writingTaskId]
  if (!group || !task) fail(`Writing Task is missing for ${groupId}`)
  return task
}

function parsedSidecar(files, fileName) {
  const file = files.find((candidate) => candidate?.fileName === fileName)
  if (!file?.buffer) fail(`Deterministic analysis projection did not produce ${fileName}`)
  return JSON.parse(file.buffer.toString('utf8'))
}

export function buildNck1AnalysisProjection({
  rootDir,
  materialization,
  paperAsset,
  sourceAssetVersion = 1,
  required = true,
}) {
  const presentCount = NCK1_STAGED_ANALYSIS_FILES.filter(({ path: relativePath }) =>
    existsSync(path.join(rootDir, relativePath))).length
  if (presentCount === 0 && !required) return null
  if (presentCount !== NCK1_STAGED_ANALYSIS_FILES.length) {
    const missing = NCK1_STAGED_ANALYSIS_FILES
      .filter(({ path: relativePath }) => !existsSync(path.join(rootDir, relativePath)))
      .map(({ path: relativePath }) => relativePath)
    fail(`Incomplete staged analyses; missing: ${missing.join(', ')}`, 'NCK1_ANALYSIS_INCOMPLETE')
  }

  const raw = Object.fromEntries(NCK1_STAGED_ANALYSIS_FILES.map((descriptor) => [
    descriptor.key,
    readAnalysis(rootDir, descriptor),
  ]))
  const answers = Object.values(paperAsset.answerKey?.answers || {})
  if (answers.length !== 45 || answers.some(({ answer }) => !String(answer || '').trim())) {
    fail('Analysis projection requires all 45 authoritative objective answers')
  }

  const groupsBySlot = new Map(materialization.groups.map((group) => [group.slotId, group]))
  const getGroup = (slotId, order) => {
    const group = groupsBySlot.get(slotId)
    if (!group) fail(`Materialization is missing ${slotId}`)
    return legacyGroup(paperAsset, group, order)
  }
  const readingGroups = ['a', 'b', 'c', 'd'].map((letter, index) =>
    getGroup(`reading.${letter}`, index + 1))
  const seven = getGroup('seven-choices', 5)
  const cloze = getGroup('cloze', 6)
  const grammar = getGroup('grammar-fill', 7)
  const application = getGroup('writing.application', 8)
  const continuation = getGroup('writing.continuation', 9)
  const paper = {
    paperId: materialization.paperId,
    sourceFilename: 'nck1-source-materialization-v1.json',
    sourceHash: '',
    sourceAssetVersion,
  }

  for (const [index, group] of readingGroups.entries()) {
    const analysis = raw[`reading-${String.fromCharCode(97 + index)}`]
    if (!validateReadingSchema(analysis)) {
      fail(`Reading analysis schema invalid: ${formatSchemaErrors(validateReadingSchema.errors)}`)
    }
    exactKeys(analysis.groups, [group.groupId], `${group.groupId} analysis groups`)
    validateReadingAnalysisShape(analysis, { paper, group })
    assertSourceVersion(analysis, sourceAssetVersion, group.groupId)
    assertReadingOptionClosure(analysis, group)
  }
  exactKeys(raw.seven.groups, [seven.groupId], `${seven.groupId} analysis groups`)
  exactKeys(raw.cloze.groups, [cloze.groupId], `${cloze.groupId} analysis groups`)
  exactKeys(raw.grammar.groups, [grammar.groupId], `${grammar.groupId} analysis groups`)
  validateSevenChoicesShape(raw.seven, { paper, group: seven })
  validateClozeShape(raw.cloze, { paper, group: cloze })
  validateGrammarFillShape(raw.grammar, { paper, group: grammar })
  assertSourceVersion(raw.seven, sourceAssetVersion, seven.groupId)
  assertSourceVersion(raw.cloze, sourceAssetVersion, cloze.groupId)
  assertSourceVersion(raw.grammar, sourceAssetVersion, grammar.groupId)
  assertBlankClosure(raw.seven, seven, 'questions')
  assertBlankClosure(raw.cloze, cloze, 'blanks')
  assertBlankClosure(raw.grammar, grammar, 'blanks')
  assertAnswerClosure(raw.seven, seven, 'questions', (item) =>
    item.optionFit?.correctOptionLabel)
  assertAnswerClosure(raw.cloze, cloze, 'blanks', (item) =>
    item.correctFit?.optionLabel)
  assertAnswerClosure(raw.grammar, grammar, 'blanks', (item) => item.answer)

  const applicationWriting = projectNck1StagedWritingAnalysis(raw.application)
  const continuationWriting = projectNck1StagedWritingAnalysis(raw.continuation)
  validateWritingAnalysisCandidate(applicationWriting)
  validateWritingAnalysisCandidate(continuationWriting)
  validateNarrativeContinuationAnalysis(continuationWriting.continuationAnalysis, {
    writingTask: writingTask(paperAsset, continuation.groupId),
  })

  const files = buildPaperImportAiPackageFiles({
    parseResult: { paper, readingGroups },
    analysesByGroupId: Object.fromEntries(readingGroups.map((group, index) => [
      group.groupId,
      raw[`reading-${String.fromCharCode(97 + index)}`],
    ])),
    sevenChoicesGroup: seven,
    sevenChoicesAnalysis: raw.seven,
    clozeGroup: cloze,
    clozeAnalysis: raw.cloze,
    grammarFillGroup: grammar,
    grammarFillAnalysis: raw.grammar,
    applicationGroup: application,
    continuationGroup: continuation,
    sourceDocx: null,
  })
  const sidecars = {
    'reading-choice-analysis-v1.json': parsedSidecar(files, 'reading-choice-analysis-v1.json'),
    'seven-choices-analysis-v1.json': parsedSidecar(files, 'seven-choices-analysis-v1.json'),
    'cloze-analysis-v1.json': parsedSidecar(files, 'cloze-analysis-v1.json'),
    'grammar-fill-analysis-v1.json': parsedSidecar(files, 'grammar-fill-analysis-v1.json'),
    'writing-analysis-v1.json': {
      schemaVersion: 'writing-analysis-v1',
      paperId: materialization.paperId,
      groups: {
        [application.groupId]: { writing: applicationWriting },
        [continuation.groupId]: { writing: continuationWriting },
      },
    },
  }
  for (const fileName of NCK1_ANALYSIS_SIDECAR_FILES.slice(0, 4)) {
    sidecars[fileName].sourceAssetVersion = sourceAssetVersion
  }
  if (!validateWritingSchema(sidecars['writing-analysis-v1.json'])) {
    fail(`Writing analysis schema invalid: ${formatSchemaErrors(validateWritingSchema.errors)}`)
  }

  const expectedReadingIds = readingGroups.flatMap((group) => group.questions.map(({ id }) => id))
  exactKeys(sidecars['reading-choice-analysis-v1.json'].questions, expectedReadingIds, 'reading questions')
  if (expectedReadingIds.length !== 15) fail('Reading analysis requires exactly 15 Questions')
  exactKeys(
    sidecars['writing-analysis-v1.json'].groups,
    [application.groupId, continuation.groupId],
    'writing groups',
  )

  return {
    inputs: raw,
    sidecars,
    digest: digestJson(sidecars),
  }
}
