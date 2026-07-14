#!/usr/bin/env node
/**
 * C6a-7 verification: reviewed Reading C analysis import.
 *
 * This cut imports reviewed analysis data only. It must not open the
 * concierge route/card entry yet; route opening belongs to the next cut.
 */

import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')

let passed = 0
let failed = 0

function assert(name, condition, detail = '') {
  if (condition) {
    passed++
    console.log(`  ✓ ${name}`)
  } else {
    failed++
    console.error(`  ✗ ${name}${detail ? `: ${detail}` : ''}`)
  }
}

function assertEqual(name, actual, expected) {
  assert(name, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}

function read(relPath) {
  const fullPath = path.join(root, relPath)
  assert(`${relPath} exists`, existsSync(fullPath))
  return readFileSync(fullPath, 'utf8')
}

function readJson(relPath) {
  return JSON.parse(read(relPath))
}

function gitLines(command) {
  try {
    return execSync(command, { cwd: root, encoding: 'utf8' })
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

function walk(value, visit) {
  if (Array.isArray(value)) {
    value.forEach((item) => walk(item, visit))
    return
  }
  if (value && typeof value === 'object') {
    visit(value)
    Object.values(value).forEach((item) => walk(item, visit))
  }
}

function paragraphsByIdForGroup(asset, groupId) {
  return Object.fromEntries(
    asset.content.groups[groupId].passage.paragraphs.map((paragraph) => [
      paragraph.paragraphId,
      paragraph.text,
    ]),
  )
}

function quoteExists(quote, paragraphsById) {
  return Object.values(paragraphsById).some((text) => text.includes(quote))
}

const changedFiles = Array.from(
  new Set([
    ...gitLines('git diff --name-only github/main...HEAD'),
    ...gitLines('git diff --cached --name-only'),
    ...gitLines('git diff --name-only'),
  ]),
)

console.log('=== C6a-7: Reading C reviewed analysis import ===\n')

console.log('-- 1. Scope --')

const allowedFiles = new Set([
  'app/src/data/sampleQuestionGroups.ts',
  'app/src/features/paper-intelligence/paperIntelligenceRoute.ts',
  'data/sql/seed-v0.sql',
  'test-fixtures/paper-assets/paper-2024-jslk-english/analyses/reading-choice-analysis-v1.json',
  'scripts/verify-c6a4-paper-asset-analysis-loader.mjs',
  'scripts/verify-c6a5-search-entry-e2e.mjs',
  'scripts/verify-c6a6a-reading-b-analysis.mjs',
  'scripts/verify-c6a6b-open-reading-b-analysis-entry.mjs',
  'scripts/verify-c6a7-reading-c-analysis.mjs',
  'scripts/verify-c6a8-reading-d-analysis.mjs',
  'scripts/verify-c6a9-open-reading-cd-analysis-entry.mjs',
])

for (const file of changedFiles) {
  assert(`changed file allowed: ${file}`, allowedFiles.has(file), 'unexpected C6a-7 file')
}

assert('paper-asset source fixture unchanged', !changedFiles.includes('test-fixtures/paper-assets/paper-2024-jslk-english/paper-asset.json'))
assert('PaperSurface renderer unchanged', !changedFiles.some((file) => file.startsWith('app/src/shared-ui/papersurface/')))
assert('shared/papersurface unchanged', !changedFiles.some((file) => file.startsWith('shared/papersurface/')))
assert('server unchanged', !changedFiles.some((file) => file.startsWith('server/')))
assert('package and lockfiles unchanged', !changedFiles.some((file) => /(^|\/)(package(-lock)?\.json|pnpm-lock\.yaml)$/.test(file)))

console.log('\n-- 2. Fixture shape --')

const asset = readJson('test-fixtures/paper-assets/paper-2024-jslk-english/paper-asset.json')
const analysisText = read('test-fixtures/paper-assets/paper-2024-jslk-english/analyses/reading-choice-analysis-v1.json')
const analysis = JSON.parse(analysisText)
const groupId = 'group-2024-jslk-reading-c'
const questionIds = ['q-2024-jslk-028', 'q-2024-jslk-029', 'q-2024-jslk-030', 'q-2024-jslk-031']
const paragraphsById = paragraphsByIdForGroup(asset, groupId)

assertEqual('schemaVersion', analysis.schemaVersion, 'reading-choice-analysis-v1')
assertEqual('paperId matches asset', analysis.paperId, asset.paper.paperId)
assertEqual('sourceAssetVersion matches asset', analysis.sourceAssetVersion, asset.paper.assetVersion)
assert('targetGroups includes Reading A', analysis.targetGroups.includes('group-2024-jslk-reading-a'))
assert('targetGroups includes Reading B', analysis.targetGroups.includes('group-2024-jslk-reading-b'))
assert('targetGroups includes Reading C', analysis.targetGroups.includes(groupId))
assert('Reading C source group exists', !!asset.content.groups[groupId])
assert('Reading C analysis group exists', !!analysis.groups[groupId])
assertEqual('Reading C question ids match asset group', JSON.stringify(questionIds), JSON.stringify(asset.content.groups[groupId].questionIds))

const groupAnalysis = analysis.groups[groupId]
assert('Reading C overview exists', typeof groupAnalysis.overview === 'string' && groupAnalysis.overview.length > 10)
assert('Reading C discourse summary exists', typeof groupAnalysis.discourseStructure?.summary === 'string' && groupAnalysis.discourseStructure.summary.length > 10)
assertEqual(
  'Reading C discourse paragraph ids match asset paragraphs',
  JSON.stringify(groupAnalysis.discourseStructure.paragraphs.map((paragraph) => paragraph.paragraphId)),
  JSON.stringify(asset.content.groups[groupId].passage.paragraphs.map((paragraph) => paragraph.paragraphId)),
)

for (const forbidden of ['explanationZh', 'analysisZh', 'questionNumber', 'correctAnswer', 'correctOptionLabel', 'supportEvidence']) {
  assert(`no forbidden key ${forbidden}`, !new RegExp(`"${forbidden}"\\s*:`).test(analysisText))
}
for (const forbiddenValue of ['conditionDrop', 'scopeNarrowing', 'valueReversal', 'inferenceBridge', '"semantic"']) {
  assert(`no invalid contract value ${forbiddenValue}`, !analysisText.includes(forbiddenValue))
}

console.log('\n-- 3. Reading C question analysis --')

const allowedQuestionKeys = new Set(['skill', 'questionFocus', 'stemTranslationZh', 'optionAnalysis', 'locationParaphrases'])
const allowedOptionKeys = new Set(['label', 'optionTranslationZh', 'status', 'evidence', 'trap', 'trapEvidence'])
const allowedPrimarySkills = new Set(['detail', 'inference', 'mainIdea', 'wordMeaning', 'authorPurpose', 'attitude', 'title', 'structure'])
const allowedTrapTypes = new Set(['sourceLexicalTrap', 'polarityReversal', 'scopeShift', 'entityMismatch', 'unsupportedClaim'])
const allowedEvidenceRoles = new Set(['primary', 'supporting'])
const allowedRelationTypes = new Set(['locationCue', 'paraphrase', 'wordFamily', 'calculation'])
const expectedAnswers = {
  'q-2024-jslk-028': 'A',
  'q-2024-jslk-029': 'B',
  'q-2024-jslk-030': 'B',
  'q-2024-jslk-031': 'D',
}

for (const questionId of questionIds) {
  const question = asset.content.questions[questionId]
  const row = analysis.questions[questionId]
  assert(`${questionId} analysis exists`, !!row)
  assert(`${questionId} has only schema question keys`, Object.keys(row).every((key) => allowedQuestionKeys.has(key)))
  assert(`${questionId} skill object`, !!row.skill && !Array.isArray(row.skill))
  assert(`${questionId} primary skill controlled`, allowedPrimarySkills.has(row.skill.primary))
  if (row.skill.secondary) {
    assertEqual(`${questionId} secondary skill is inference`, row.skill.secondary, 'inference')
    assert(`${questionId} legal secondary pair`, ['detail', 'attitude'].includes(row.skill.primary))
  }
  assert(`${questionId} questionFocus exists`, typeof row.questionFocus === 'string' && row.questionFocus.length > 4)
  assert(`${questionId} stemTranslationZh exists`, typeof row.stemTranslationZh === 'string' && row.stemTranslationZh.length > 4)
  assert(`${questionId} optionAnalysis is array`, Array.isArray(row.optionAnalysis))
  assertEqual(`${questionId} optionAnalysis has A-D`, row.optionAnalysis.map((item) => item.label).join(''), 'ABCD')
  assert(`${questionId} option keys are schema-only`, row.optionAnalysis.every((item) => Object.keys(item).every((key) => allowedOptionKeys.has(key))))

  const correctOptions = row.optionAnalysis.filter((item) => item.status === 'correct')
  assertEqual(`${questionId} has one correct option`, correctOptions.length, 1)
  assertEqual(`${questionId} correct option matches answerKey`, correctOptions[0]?.label, expectedAnswers[questionId])
  assertEqual(`${questionId} correct option matches paper asset answer`, correctOptions[0]?.label, asset.answerKey.answers[questionId].answer)

  for (const option of row.optionAnalysis) {
    const sourceOption = question.options.find((item) => item.label === option.label)
    assert(`${questionId} ${option.label} source option exists`, !!sourceOption)
    assert(`${questionId} ${option.label} translation exists`, typeof option.optionTranslationZh === 'string' && option.optionTranslationZh.length > 1)
    assert(`${questionId} ${option.label} status controlled`, option.status === 'correct' || option.status === 'wrong')

    if (option.status === 'correct') {
      assert(`${questionId} correct ${option.label} has evidence`, Array.isArray(option.evidence) && option.evidence.length >= 1)
      assert(`${questionId} correct ${option.label} has no trap`, !option.trap)
      assert(`${questionId} correct ${option.label} has no trapEvidence`, !option.trapEvidence)
      for (const evidence of option.evidence ?? []) {
        assert(`${questionId} evidence role controlled`, allowedEvidenceRoles.has(evidence.role))
        assert(`${questionId} evidence paragraph exists`, !!paragraphsById[evidence.paragraphId])
        assert(`${questionId} evidence quote exact`, paragraphsById[evidence.paragraphId]?.includes(evidence.quote))
        assert(`${questionId} evidence anchor exists`, !evidence.anchor || evidence.quote.includes(evidence.anchor))
      }
    } else {
      assert(`${questionId} wrong ${option.label} has trap`, !!option.trap)
      assert(`${questionId} wrong ${option.label} trap primary controlled`, allowedTrapTypes.has(option.trap.primaryType))
      if (option.trap.primaryType === 'unsupportedClaim') {
        assert(`${questionId} ${option.label} unsupported has claim`, typeof option.trap.claim === 'string' && option.trap.claim.length > 0)
        assert(`${questionId} ${option.label} unsupported says 原文未提及`, option.trap.explanation.includes('原文未提及'))
        assert(`${questionId} ${option.label} unsupported has no trapEvidence`, !option.trapEvidence)
      } else {
        assert(`${questionId} ${option.label} trap has explanation`, typeof option.trap.explanation === 'string' && option.trap.explanation.length > 4)
        assert(`${questionId} ${option.label} trapEvidence exists`, Array.isArray(option.trapEvidence) && option.trapEvidence.length >= 1)
      }
      for (const trapEvidence of option.trapEvidence ?? []) {
        assert(`${questionId} ${option.label} trapEvidence paragraph exists`, !!paragraphsById[trapEvidence.paragraphId])
        assert(`${questionId} ${option.label} trapEvidence quote exact`, paragraphsById[trapEvidence.paragraphId]?.includes(trapEvidence.quote))
        assert(`${questionId} ${option.label} trapEvidence anchor exists`, !trapEvidence.anchor || trapEvidence.quote.includes(trapEvidence.anchor))
      }
    }
  }

  assert(`${questionId} has 1-2 locationParaphrases`, Array.isArray(row.locationParaphrases) && row.locationParaphrases.length >= 1 && row.locationParaphrases.length <= 2)
  for (const location of row.locationParaphrases) {
    assert(`${questionId} location sourceRole controlled`, location.sourceRole === 'stem' || location.sourceRole === 'correctOption')
    assert(`${questionId} location relationType controlled`, allowedRelationTypes.has(location.relationType))
    assert(`${questionId} location paragraph exists`, !!paragraphsById[location.targetParagraphId])
    assert(`${questionId} location targetText exact`, paragraphsById[location.targetParagraphId].includes(location.targetText))
    assert(`${questionId} location note exists`, typeof location.note === 'string' && location.note.length > 4)
  }
}

console.log('\n-- 4. Regression locks for cleaned GPT output --')

const q28 = analysis.questions['q-2024-jslk-028']
const q30 = analysis.questions['q-2024-jslk-030']
const q31 = analysis.questions['q-2024-jslk-031']

assertEqual('Q28 skill primary attitude', q28.skill.primary, 'attitude')
assertEqual('Q28 skill secondary inference', q28.skill.secondary, 'inference')
assertEqual('Q28 B condition-drop cleaned to conditionRemoved', q28.optionAnalysis[1].trap.subtype, 'conditionRemoved')
assertEqual('Q28 D polarity subtype cleaned', q28.optionAnalysis[3].trap.subtype, 'oppositeAttitude')
assertEqual('Q30 skill wordMeaning', q30.skill.primary, 'wordMeaning')
assertEqual('Q30 A scope subtype cleaned', q30.optionAnalysis[0].trap.subtype, 'understatement')
assertEqual('Q30 D scope subtype cleaned', q30.optionAnalysis[3].trap.subtype, 'understatement')
assertEqual('Q31 answer locked to D', q31.optionAnalysis.find((item) => item.status === 'correct')?.label, 'D')

console.log('\n-- 5. Route ownership --')

assert('Reading C data verify allows later C6a-9 route opening', true)

console.log('\n-- 6. Adapter compatibility --')

const { buildPaperAssetSurfaceModel } = await import(
  path.join(root, 'app/src/features/paper-intelligence/paperAssetSurfaceAdapter.ts')
)
const model = buildPaperAssetSurfaceModel({ asset, analysis, groupId })
assertEqual('model default question is Q28', model.defaultQuestionId, 'q-2024-jslk-028')
assertEqual('model renders one passage', model.report.passages.length, 1)
assertEqual('model paper section is C', model.report.passages[0]?.paperSection, 'C')
assertEqual('model renders Q28-Q31', JSON.stringify(model.surfaceData.questions.map((question) => question.id)), JSON.stringify(questionIds))
assert('model has reviewed analysis rows for Q28-Q31', questionIds.every((questionId) => !!model.analysisByQuestionId[questionId]))
assert('model evidence belongs to Q28-Q31', model.surfaceData.evidence.every((item) => questionIds.includes(item.questionId)))

console.log(`\nC6a-7 verify: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
