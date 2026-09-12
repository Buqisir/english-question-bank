import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import Ajv from 'ajv/dist/2020.js'

import {
  buildPaperImportAiPackageFiles,
} from '../paper-import-ai/packageBuilder.mjs'
import { validateReadingAnalysisShape } from '../paper-import-ai/analyzeReading.mjs'
import { validateSevenChoicesShape } from '../paper-import-ai/analyzeSevenChoices.mjs'
import { validateClozeShape } from '../paper-import-ai/analyzeCloze.mjs'
import {
  stampGrammarFillDerivedFields,
  validateGrammarFillShape,
} from '../paper-import-ai/analyzeGrammarFill.mjs'
import {
  validateNarrativeContinuationAnalysis,
} from '../paper-import-ai/analyzeNarrativeContinuation.mjs'
import { validateWritingAnalysisCandidate } from '../writing-analysis/writingAnalysisBackfillService.mjs'
import { isApplicationReviewCardV2 } from '../../shared/writing/applicationReviewCard.mjs'
import { digestJson } from '../../shared/paper-canonical/stable.mjs'
import {
  LEGACY_NCK1_ANALYSIS_PROFILE,
  LISTENING_ANALYSIS_FILE_NAME,
  LISTENING_ANALYSIS_PROFILE,
  LISTENING_STAGED_ANALYSIS_FILE_NAME,
  validateListeningAnalysis,
} from '../paper-import-ai/analyzeListening.mjs'

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
  LISTENING_ANALYSIS_FILE_NAME,
])

export const NCK1_LISTENING_STAGED_ANALYSIS = Object.freeze({
  key: 'listening-unit',
  path: LISTENING_STAGED_ANALYSIS_FILE_NAME,
  role: 'analysis_listening',
})

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

function assertBlankIdClosure(analysis, group, collectionName) {
  exactKeys(analysis[collectionName], group.questions.map(({ id }) => id), `${group.groupId} ${collectionName}`)
  for (const question of group.questions) {
    const item = analysis[collectionName][question.id]
    if (item.blankId !== question.blankId) {
      fail(`${question.id} analysis blankId does not match the paper`)
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
    const correct = items.filter(({ status }) => status === 'correct')
    if (correct.length !== 1 || correct[0].label !== question.answerKey) {
      fail(`${question.id} reading analysis conflicts with the authoritative answer`)
    }
  }
}

function assertAnswerAgreement(analysis, group, collectionName, answerAt) {
  for (const question of group.questions) {
    const supplied = String(answerAt(analysis[collectionName][question.id]) || '').trim()
    if (supplied !== question.answerKey) {
      fail(`${question.id} analysis answer conflicts with the authoritative answer`)
    }
  }
}

export function projectNck1StagedWritingAnalysis(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    fail('Staged writing analysis is missing or not an object')
  }
  if (raw.taskType === 'application') {
    exactKeys(raw, [
      'taskType', 'modelAnswer', 'reviewCard',
      ...(raw.officialModelAnswer === undefined ? [] : ['officialModelAnswer']),
    ], 'application staged analysis')
    if (!isApplicationReviewCardV2(raw.reviewCard)) {
      fail('New-paper application analysis requires application-review-card-v2')
    }
    if (raw.highlightExpressions !== undefined) {
      fail('New-paper application analysis must not include retired highlightExpressions')
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
    exactKeys(raw, [
      'taskType', 'modelAnswer', 'continuationAnalysis',
      ...(raw.officialModelAnswer === undefined ? [] : ['officialModelAnswer']),
    ], 'continuation staged analysis')
    if (!raw.continuationAnalysis || typeof raw.continuationAnalysis !== 'object') {
      fail('New-paper continuation analysis must use continuationAnalysis')
    }
    if (raw.continuationAnalysis.schemaVersion !== 'continuation-analysis-v2') {
      fail('New-paper continuation analysis must use continuation-analysis-v2')
    }
    if (raw.continuationDesign !== undefined || raw.highlightExpressions !== undefined) {
      fail('New-paper continuation analysis must not mix historical fields')
    }
    return {
      taskType: 'continuation',
      modelAnswer: raw.modelAnswer,
      ...(typeof raw.officialModelAnswer === 'string' && raw.officialModelAnswer.trim()
        ? { officialModelAnswer: raw.officialModelAnswer }
        : {}),
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

function withOfficialModelAnswer(analysis, materializationGroup) {
  const sourceAnswer = materializationGroup.writingTask?.officialModelAnswer
  const stagedAnswer = analysis.officialModelAnswer
  if (sourceAnswer === null) {
    if (stagedAnswer !== undefined) {
      fail(`${materializationGroup.groupId} staged officialModelAnswer has no source authority`)
    }
    return analysis
  }
  if (typeof sourceAnswer !== 'string' || !sourceAnswer.trim()) {
    fail(`${materializationGroup.groupId} source officialModelAnswer is malformed`)
  }
  if (stagedAnswer !== undefined && stagedAnswer !== sourceAnswer) {
    fail(`${materializationGroup.groupId} staged officialModelAnswer does not match the source Materialization`)
  }
  return { ...analysis, officialModelAnswer: sourceAnswer }
}

export function buildNck1AnalysisProjection({
  rootDir,
  materialization,
  paperAsset,
  sourceAssetVersion = 1,
  required = true,
  analysisProfile = LEGACY_NCK1_ANALYSIS_PROFILE,
  requireTeachingContent = false,
}) {
  if (![LEGACY_NCK1_ANALYSIS_PROFILE, LISTENING_ANALYSIS_PROFILE].includes(analysisProfile)) {
    fail(`Unknown NCK1 analysis profile: ${analysisProfile}`)
  }
  const presentCount = NCK1_STAGED_ANALYSIS_FILES.filter(({ path: relativePath }) =>
    existsSync(path.join(rootDir, relativePath))).length
  const listeningPresent = existsSync(path.join(rootDir, NCK1_LISTENING_STAGED_ANALYSIS.path))
  if (presentCount === 0 && !required && !listeningPresent) return null
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
  if (analysisProfile === LISTENING_ANALYSIS_PROFILE && !listeningPresent) {
    fail(
      `Analysis profile ${LISTENING_ANALYSIS_PROFILE} requires ${NCK1_LISTENING_STAGED_ANALYSIS.path}`,
      'NCK1_ANALYSIS_INCOMPLETE',
    )
  }
  if (listeningPresent) {
    raw[NCK1_LISTENING_STAGED_ANALYSIS.key] = readAnalysis(
      rootDir,
      NCK1_LISTENING_STAGED_ANALYSIS,
    )
    validateListeningAnalysis(raw[NCK1_LISTENING_STAGED_ANALYSIS.key], {
      materialization,
      sourceAssetVersion,
    })
  }
  const answers = Object.values(paperAsset.answerKey?.answers || {}).filter(
    ({ questionNo }) => questionNo >= 21 && questionNo <= 65,
  )
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
    validateReadingAnalysisShape(analysis, {
      paper,
      group,
      requireFullTranslation: true,
      requireSelectedLongSentences: true,
      requireTeachingContent,
    })
    assertSourceVersion(analysis, sourceAssetVersion, group.groupId)
    assertReadingOptionClosure(analysis, group)
  }
  exactKeys(raw.seven.groups, [seven.groupId], `${seven.groupId} analysis groups`)
  exactKeys(raw.cloze.groups, [cloze.groupId], `${cloze.groupId} analysis groups`)
  exactKeys(raw.grammar.groups, [grammar.groupId], `${grammar.groupId} analysis groups`)
  validateSevenChoicesShape(raw.seven, {
    paper,
    group: seven,
    requireFullTranslation: true,
    requireSelectedLongSentences: true,
    requireTeachingContent,
  })
  validateClozeShape(raw.cloze, {
    paper,
    group: cloze,
    requireFullTranslation: true,
    requireSelectedLongSentences: true,
    requireTeachingContent,
  })
  stampGrammarFillDerivedFields(raw.grammar)
  validateGrammarFillShape(raw.grammar, {
    paper,
    group: grammar,
    requireFullTranslation: true,
    requireSelectedLongSentences: true,
    requireTeachingContent,
  })
  assertSourceVersion(raw.seven, sourceAssetVersion, seven.groupId)
  assertSourceVersion(raw.cloze, sourceAssetVersion, cloze.groupId)
  assertSourceVersion(raw.grammar, sourceAssetVersion, grammar.groupId)
  assertBlankIdClosure(raw.seven, seven, 'questions')
  assertBlankIdClosure(raw.cloze, cloze, 'blanks')
  assertBlankIdClosure(raw.grammar, grammar, 'blanks')
  assertAnswerClosure(raw.seven, seven, 'questions', (item) =>
    item.optionFit?.correctOptionLabel)
  assertAnswerClosure(raw.cloze, cloze, 'blanks', (item) =>
    item.correctFit?.optionLabel)
  assertAnswerClosure(raw.grammar, grammar, 'blanks', (item) => item.answer)
  assertAnswerAgreement(raw.seven, seven, 'questions', (item) =>
    item.optionFit?.correctOptionLabel)
  assertAnswerAgreement(raw.cloze, cloze, 'blanks', (item) =>
    item.correctFit?.optionLabel)
  assertAnswerAgreement(raw.grammar, grammar, 'blanks', (item) => item.answer)

  const applicationWriting = withOfficialModelAnswer(
    projectNck1StagedWritingAnalysis(raw.application),
    groupsBySlot.get('writing.application'),
  )
  const continuationWriting = withOfficialModelAnswer(
    projectNck1StagedWritingAnalysis(raw.continuation),
    groupsBySlot.get('writing.continuation'),
  )
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
    sevenChoicesAnalysis: structuredClone(raw.seven),
    clozeGroup: cloze,
    clozeAnalysis: structuredClone(raw.cloze),
    grammarFillGroup: grammar,
    grammarFillAnalysis: structuredClone(raw.grammar),
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
    ...(raw[NCK1_LISTENING_STAGED_ANALYSIS.key]
      ? { [LISTENING_ANALYSIS_FILE_NAME]: structuredClone(raw[NCK1_LISTENING_STAGED_ANALYSIS.key]) }
      : {}),
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
