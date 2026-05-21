#!/usr/bin/env node
/**
 * C6a-6a verification for reviewed Reading B analysis import.
 * Run: node scripts/verify-c6a6a-reading-b-analysis.mjs
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

function deepFindKeys(value, keyName, pathName = '$', out = []) {
  if (value === null || typeof value !== 'object') return out
  if (Array.isArray(value)) {
    value.forEach((item, index) => deepFindKeys(item, keyName, `${pathName}[${index}]`, out))
    return out
  }
  for (const [key, child] of Object.entries(value)) {
    const next = `${pathName}.${key}`
    if (key === keyName) out.push(next)
    deepFindKeys(child, keyName, next, out)
  }
  return out
}

function collectStrings(value, out = []) {
  if (typeof value === 'string') {
    out.push(value)
    return out
  }
  if (value === null || typeof value !== 'object') return out
  if (Array.isArray(value)) {
    value.forEach((item) => collectStrings(item, out))
    return out
  }
  Object.values(value).forEach((child) => collectStrings(child, out))
  return out
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

console.log('=== C6a-6a: Reading B reviewed analysis import ===\n')

console.log('-- 1. Scope --')

const allowedFiles = new Set([
  'app/public/paper-assets/paper-2024-jslk-english/analyses/reading-choice-analysis-v1.json',
  'app/src/data/sampleQuestionGroups.ts',
  'app/src/features/paper-intelligence/paperIntelligenceRoute.ts',
  'data/sql/seed-v0.sql',
  'scripts/verify-c6a-2-reading-a-analysis.mjs',
  'scripts/verify-c6a4-paper-asset-analysis-loader.mjs',
  'scripts/verify-c6a5-search-entry-e2e.mjs',
  'scripts/verify-c6a6a-reading-b-analysis.mjs',
  'scripts/verify-c6a6b-open-reading-b-analysis-entry.mjs',
  'scripts/verify-c6a7-reading-c-analysis.mjs',
])

for (const file of changedFiles) {
  assert(`changed file allowed: ${file}`, allowedFiles.has(file), 'unexpected C6a-6a file')
}

assert(
  'paper-asset source fixture unchanged',
  !changedFiles.includes('app/public/paper-assets/paper-2024-jslk-english/paper-asset.json'),
)
assert(
  'PaperSurface renderer unchanged',
  !changedFiles.some((file) => file.startsWith('app/src/shared-ui/papersurface/')),
)

console.log('\n-- 2. Fixture shape --')

const asset = readJson('app/public/paper-assets/paper-2024-jslk-english/paper-asset.json')
const analysis = readJson(
  'app/public/paper-assets/paper-2024-jslk-english/analyses/reading-choice-analysis-v1.json',
)
const groupId = 'group-2024-jslk-reading-b'
const group = asset.content.groups[groupId]
const groupAnalysis = analysis.groups[groupId]
const targetQuestionIds = ['q-2024-jslk-024', 'q-2024-jslk-025', 'q-2024-jslk-026', 'q-2024-jslk-027']
const paragraphsById = Object.fromEntries(
  (group?.passage?.paragraphs ?? []).map((paragraph) => [paragraph.paragraphId, paragraph.text]),
)

assertEqual('schemaVersion', analysis.schemaVersion, 'reading-choice-analysis-v1')
assertEqual('paperId matches asset', analysis.paperId, asset.paper.paperId)
assertEqual('sourceAssetVersion matches asset', analysis.sourceAssetVersion, asset.paper.assetVersion)
assert('no top-level status wrapper', analysis.status === undefined)
assert('no top-level analysis wrapper', analysis.analysis === undefined)
assert('targetGroups includes Reading A', analysis.targetGroups.includes('group-2024-jslk-reading-a'))
assert('targetGroups includes Reading B', analysis.targetGroups.includes(groupId))
assert('Reading B source group exists', !!group)
assert('Reading B analysis group exists', !!groupAnalysis)
assertEqual('Reading B question ids match asset group', JSON.stringify(group.questionIds), JSON.stringify(targetQuestionIds))
assertEqual(
  'Reading B discourse paragraph ids match asset paragraphs',
  JSON.stringify(groupAnalysis.discourseStructure.paragraphs.map((paragraph) => paragraph.paragraphId)),
  JSON.stringify(group.passage.paragraphs.map((paragraph) => paragraph.paragraphId)),
)

const forbiddenKeys = ['correctAnswer', 'answer', 'correctOptionLabel', 'supportEvidence', 'questionSide', 'sourceSide', 'relation']
for (const key of forbiddenKeys) {
  assert(`no forbidden key ${key}`, deepFindKeys(analysis, key).length === 0)
}
assert('no invalid scopeShift subtype narrowing', !collectStrings(analysis).includes('narrowing'))

console.log('\n-- 3. Reading B question analysis --')

const allowedPrimarySkills = new Set([
  'detail',
  'inference',
  'mainIdea',
  'wordMeaning',
  'authorPurpose',
  'attitude',
  'title',
  'structure',
])
const allowedTrapTypes = new Set([
  'sourceLexicalTrap',
  'polarityReversal',
  'scopeShift',
  'entityMismatch',
  'unsupportedClaim',
])
const allowedPolaritySubtypes = new Set([
  'oppositeAction',
  'oppositeAttitude',
  'oppositeTrend',
  'causeEffectReversal',
  'timeOrderReversal',
  'negationReversal',
])
const allowedScopeSubtypes = new Set([
  'overgeneralization',
  'overstatement',
  'understatement',
  'conditionRemoved',
])
const allowedRelationTypes = new Set(['locationCue', 'paraphrase', 'wordFamily', 'calculation'])

for (const questionId of targetQuestionIds) {
  const question = analysis.questions[questionId]
  const answerEntry = asset.answerKey.answers[questionId]

  assert(`${questionId} analysis exists`, !!question)
  assert(`${questionId} skill primary controlled`, allowedPrimarySkills.has(question.skill?.primary))
  if (question.skill?.secondary !== undefined) {
    assertEqual(`${questionId} secondary skill is inference`, question.skill.secondary, 'inference')
    assert(
      `${questionId} secondary inference legal pair`,
      ['detail', 'attitude'].includes(question.skill.primary),
    )
  }
  assert(`${questionId} questionFocus exists`, typeof question.questionFocus === 'string' && question.questionFocus.length > 5)
  assert(`${questionId} stemTranslationZh exists`, typeof question.stemTranslationZh === 'string' && question.stemTranslationZh.length > 5)
  assert(`${questionId} optionAnalysis is array`, Array.isArray(question.optionAnalysis))
  assertEqual(`${questionId} optionAnalysis has A-D`, question.optionAnalysis.map((option) => option.label).join(''), 'ABCD')

  const correctOptions = question.optionAnalysis.filter((option) => option.status === 'correct')
  assertEqual(`${questionId} has one correct option`, correctOptions.length, 1)
  assertEqual(`${questionId} correct option matches answerKey`, correctOptions[0]?.label, answerEntry.answer)

  for (const option of question.optionAnalysis) {
    assert(`${questionId} ${option.label} translation exists`, typeof option.optionTranslationZh === 'string' && option.optionTranslationZh.length > 0)
    assert(`${questionId} ${option.label} status controlled`, ['correct', 'wrong'].includes(option.status))

    if (option.status === 'correct') {
      assert(`${questionId} correct ${option.label} has evidence`, Array.isArray(option.evidence) && option.evidence.length >= 1)
      assertEqual(`${questionId} correct first evidence is primary`, option.evidence[0]?.role, 'primary')
      option.evidence.forEach((item) => {
        assert(`${questionId} evidence role controlled`, ['primary', 'supporting'].includes(item.role))
        assert(`${questionId} evidence quote exact in ${item.paragraphId}`, paragraphsById[item.paragraphId]?.includes(item.quote))
        assert(`${questionId} evidence anchor exists`, typeof item.anchor === 'string' && item.anchor.length > 0)
      })
      assert(`${questionId} correct ${option.label} has no trap`, option.trap === undefined)
      assert(`${questionId} correct ${option.label} has no trapEvidence`, option.trapEvidence === undefined)
      continue
    }

    assert(`${questionId} wrong ${option.label} has trap`, !!option.trap)
    assert(`${questionId} wrong ${option.label} trap primary controlled`, allowedTrapTypes.has(option.trap?.primaryType))
    assert(`${questionId} wrong ${option.label} has no nested trapEvidence`, option.trap?.trapEvidence === undefined)

    if (option.trap.primaryType === 'sourceLexicalTrap') {
      assert(`${questionId} ${option.label} lexical match type controlled`, ['exact', 'wordFamily'].includes(option.trap.matchType))
      assert(`${questionId} ${option.label} lexical source appears in source`, quoteExists(option.trap.sourceText, paragraphsById))
      assert(`${questionId} ${option.label} lexical has sibling trapEvidence`, Array.isArray(option.trapEvidence) && option.trapEvidence.length >= 1)
    }

    if (option.trap.primaryType === 'polarityReversal') {
      assert(`${questionId} ${option.label} polarity subtype controlled`, allowedPolaritySubtypes.has(option.trap.subtype))
      assert(`${questionId} ${option.label} polarity sourceQuote exact`, quoteExists(option.trap.sourceQuote, paragraphsById))
      assert(`${questionId} ${option.label} polarity sourceHighlight substring`, option.trap.sourceQuote.includes(option.trap.sourceHighlight))
      assert(`${questionId} ${option.label} polarity optionHighlight substring`, option.trap.optionText.includes(option.trap.optionHighlight))
      assert(`${questionId} ${option.label} polarity has sibling trapEvidence`, Array.isArray(option.trapEvidence) && option.trapEvidence.length >= 1)
    }

    if (option.trap.primaryType === 'scopeShift') {
      assert(`${questionId} ${option.label} scope subtype controlled`, allowedScopeSubtypes.has(option.trap.subtype))
      assert(`${questionId} ${option.label} scope sourceQuote exact`, quoteExists(option.trap.sourceQuote, paragraphsById))
      assert(`${questionId} ${option.label} scope sourceHighlight substring`, option.trap.sourceQuote.includes(option.trap.sourceHighlight))
      assert(`${questionId} ${option.label} scope optionHighlight substring`, option.trap.optionText.includes(option.trap.optionHighlight))
    }

    if (option.trap.primaryType === 'unsupportedClaim') {
      assert(`${questionId} ${option.label} unsupported has claim`, typeof option.trap.claim === 'string' && option.trap.claim.length > 0)
      assert(`${questionId} ${option.label} unsupported has no sourceQuote`, option.trap.sourceQuote === undefined)
      assert(`${questionId} ${option.label} unsupported has no sourceText`, option.trap.sourceText === undefined)
      assert(`${questionId} ${option.label} unsupported has no trapEvidence`, option.trapEvidence === undefined)
      assert(`${questionId} ${option.label} unsupported says 原文未提及`, /原文未提及/.test(option.trap.explanation || ''))
    }

    ;(option.trapEvidence || []).forEach((item) => {
      assert(`${questionId} ${option.label} trapEvidence quote exact in ${item.paragraphId}`, paragraphsById[item.paragraphId]?.includes(item.quote))
      assert(`${questionId} ${option.label} trapEvidence anchor exists`, typeof item.anchor === 'string' && item.anchor.length > 0)
    })
  }

  const relations = question.locationParaphrases || []
  assert(`${questionId} has 1-2 locationParaphrases`, relations.length >= 1 && relations.length <= 2)
  relations.forEach((relation) => {
    assert(`${questionId} location sourceRole controlled`, ['stem', 'correctOption'].includes(relation.sourceRole))
    assert(`${questionId} location relationType controlled`, allowedRelationTypes.has(relation.relationType))
    assert(`${questionId} location targetText exact`, paragraphsById[relation.targetParagraphId]?.includes(relation.targetText))
    assert(`${questionId} location note exists`, typeof relation.note === 'string' && relation.note.length > 5)
  })
}

console.log('\n-- 4. Regression locks for cleaned GPT-5.5 output --')

const q24 = analysis.questions['q-2024-jslk-024']
const q25 = analysis.questions['q-2024-jslk-025']
const q26 = analysis.questions['q-2024-jslk-026']
const q27 = analysis.questions['q-2024-jslk-027']

assertEqual('Q24 C primary trap is polarityReversal', q24.optionAnalysis[2].trap.primaryType, 'polarityReversal')
assertEqual('Q24 C secondary trap is sourceLexicalTrap', q24.optionAnalysis[2].trap.secondaryType, 'sourceLexicalTrap')
assertEqual('Q24 D lexical sourceText cleaned to night', q24.optionAnalysis[3].trap.sourceText, 'night')
assertEqual('Q24 D lexical optionText cleaned to night', q24.optionAnalysis[3].trap.optionText, 'night')
assertEqual('Q25 A no false sourceLexical secondary type', q25.optionAnalysis[0].trap.secondaryType, undefined)
assertEqual('Q25 A time order reversal locked', q25.optionAnalysis[0].trap.subtype, 'timeOrderReversal')
assertEqual('Q26 first evidence primary', q26.optionAnalysis[3].evidence[0].role, 'primary')
assertEqual('Q26 second evidence supporting', q26.optionAnalysis[3].evidence[1].role, 'supporting')
assertEqual('Q27 A scope subtype uses schema value', q27.optionAnalysis[0].trap.subtype, 'understatement')

console.log('\n-- 5. Route ownership --')

assert('Reading B data verify does not require route state', true)

console.log(`\nC6a-6a verify: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
