#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = process.cwd()
const PAPER_ID = 'paper-2024-jslk-english'
const GROUP_ID = 'group-2024-jslk-seven-choices'
const DEFAULT_ANALYSIS_PATH = `app/public/paper-assets/${PAPER_ID}/analyses/seven-choices-analysis-v1.json`
const ASSET_PATH = `app/public/paper-assets/${PAPER_ID}/paper-asset.json`

const expectedAnswers = {
  'q-2024-jslk-036': 'B',
  'q-2024-jslk-037': 'G',
  'q-2024-jslk-038': 'A',
  'q-2024-jslk-039': 'F',
  'q-2024-jslk-040': 'D',
}

const positionFacets = new Set([
  'seven-choices.position.paragraph-start',
  'seven-choices.position.paragraph-middle',
  'seven-choices.position.paragraph-end',
])

const roleFacets = new Set([
  'seven-choices.role.topic',
  'seven-choices.role.summary',
  'seven-choices.role.bridge',
  'seven-choices.role.cohesion',
])

const mechanismFacets = new Set([
  'seven-choices.cohesion.grammatical.referential-cohesion',
  'seven-choices.cohesion.grammatical.logical-connector',
  'seven-choices.cohesion.lexical.topic-field-recurrence',
  'seven-choices.cohesion.lexical.synonym-paraphrase',
])

const requiredSignalMechanisms = new Set([
  'seven-choices.cohesion.grammatical.referential-cohesion',
  'seven-choices.cohesion.grammatical.logical-connector',
])

const signalSides = new Set(['context', 'option'])

const failures = []

function assert(condition, message) {
  if (!condition) failures.push(message)
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(ROOT, path), 'utf8'))
}

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[“”]/g, '"')
    .replace(/[’]/g, "'")
    .trim()
}

function optionalString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key)
}

function blankMarkerForQuestionId(questionId) {
  return String(Number(questionId.split('-').at(-1)))
}

function containsBlankMarker(questionId, value) {
  const marker = blankMarkerForQuestionId(questionId)
  return new RegExp(`\\b${marker}\\b`).test(String(value || ''))
}

function walkKeys(value, callback) {
  if (Array.isArray(value)) {
    value.forEach((item) => walkKeys(item, callback))
    return
  }
  if (!value || typeof value !== 'object') return
  Object.keys(value).forEach((key) => {
    callback(key)
    walkKeys(value[key], callback)
  })
}

function loadAsset() {
  assert(existsSync(resolve(ROOT, ASSET_PATH)), `paper asset exists: ${ASSET_PATH}`)
  return readJson(ASSET_PATH)
}

function selfCheck() {
  const requiredFiles = [
    'prompts/seven-choices-analysis-v1.md',
    'docs/cuts/I0-seven-choices-analysis-contract/seven-choices-analysis-v1.contract.md',
    'docs/cuts/I0-seven-choices-analysis-prompt/decisions.md',
    'docs/cuts/I0-seven-choices-analysis-prompt/external-ai-input-seven-choices.md',
  ]

  requiredFiles.forEach((path) => {
    assert(existsSync(resolve(ROOT, path)), `required I0-C file exists: ${path}`)
  })

  const prompt = readFileSync(resolve(ROOT, 'prompts/seven-choices-analysis-v1.md'), 'utf8')
  assert(prompt.includes('downloadable `.json` file'), 'prompt requires downloadable JSON file')
  assert(prompt.includes('Do NOT output JSON in chat'), 'prompt forbids chat JSON')
  assert(prompt.includes('UNABLE_TO_CREATE_FILE'), 'prompt has no JSON fallback and defines failure token')
  assert(prompt.includes('seven-choices-analysis-v1.json'), 'prompt names output file')
  assert(prompt.includes('topic-field-recurrence'), 'prompt uses final lexical facet key')
  assert(prompt.includes('referential-cohesion'), 'prompt uses final reference facet key')
  assert(prompt.includes('mechanismSignals'), 'prompt includes mechanismSignals field')
  assert(!prompt.includes('topic-word-echo'), 'prompt excludes stale topic-word-echo key')
  assert(!prompt.includes('pronoun-reference'), 'prompt excludes stale pronoun-reference key')

  const input = readFileSync(resolve(ROOT, 'docs/cuts/I0-seven-choices-analysis-prompt/external-ai-input-seven-choices.md'), 'utf8')
  assert(input.includes('mechanismSignals'), 'external input includes mechanismSignals instruction')
  Object.entries(expectedAnswers).forEach(([questionId, answer]) => {
    assert(input.includes(questionId), `external input includes ${questionId}`)
    assert(input.includes(`"${questionId}": "${answer}"`), `external input includes fixture answer ${questionId}=${answer}`)
  })

  const asset = loadAsset()
  const group = asset.content?.groups?.[GROUP_ID]
  assert(group?.groupType === 'sevenChoices', 'paper asset has sevenChoices group')
  assert(Array.isArray(group?.questionIds) && group.questionIds.length === 5, 'sevenChoices group has 5 questionIds')
  assert(Array.isArray(group?.blankIds) && group.blankIds.length === 5, 'sevenChoices group has 5 blankIds')
  assert(Array.isArray(group?.optionBank) && group.optionBank.length === 7, 'sevenChoices group has A-G optionBank')
}

function validateAnalysis(analysisPath) {
  const asset = loadAsset()
  const group = asset.content.groups[GROUP_ID]
  const questionIds = group.questionIds
  const paragraphById = new Map(group.passage.paragraphs.map((paragraph) => [paragraph.paragraphId, paragraph.text]))
  const passageText = normalize(group.passage.paragraphs.map((paragraph) => paragraph.text).join('\n'))
  const optionByLabel = new Map(group.optionBank.map((option) => [option.label, option.text]))

  assert(existsSync(resolve(ROOT, analysisPath)), `analysis JSON exists: ${analysisPath}`)
  if (!existsSync(resolve(ROOT, analysisPath))) return

  const analysis = readJson(analysisPath)
  assert(analysis.schemaVersion === 'seven-choices-analysis-v1', 'schemaVersion is seven-choices-analysis-v1')
  assert(analysis.paperId === PAPER_ID, `paperId is ${PAPER_ID}`)
  assert(analysis.sourceAssetVersion === asset.paper.assetVersion, 'sourceAssetVersion matches paper assetVersion')
  assert(Array.isArray(analysis.targetGroups) && analysis.targetGroups.length === 1 && analysis.targetGroups[0] === GROUP_ID, 'targetGroups contains only seven choices group')
  assert(analysis.meta?.promptVersion === 'seven-choices-analysis-v1', 'meta.promptVersion is seven-choices-analysis-v1')
  assert(analysis.groups && typeof analysis.groups[GROUP_ID] === 'object', 'groups includes target group')
  assert(analysis.questions && typeof analysis.questions === 'object', 'questions object exists')

  const groupAnalysis = analysis.groups?.[GROUP_ID] || {}
  assert(optionalString(groupAnalysis.overview), 'group analysis has overview')
  assert(groupAnalysis.discourseStructure && typeof groupAnalysis.discourseStructure === 'object', 'group analysis has discourseStructure')
  for (const duplicatedKey of ['groupId', 'groupType', 'questionIds', 'blankIds', 'optionBank', 'passageTitle']) {
    assert(!hasOwn(groupAnalysis, duplicatedKey), `group analysis does not duplicate paper-asset field: ${duplicatedKey}`)
  }
  const units = Array.isArray(groupAnalysis.discourseStructure?.units) ? groupAnalysis.discourseStructure.units : []
  for (const unit of units) {
    assert(optionalString(unit.unitId), 'group unit has unitId')
    assert(Array.isArray(unit.paragraphIds) && unit.paragraphIds.length > 0, 'group unit has paragraphIds')
    for (const paragraphId of unit.paragraphIds || []) {
      assert(paragraphById.has(paragraphId), `group unit paragraphId exists: ${paragraphId}`)
    }
  }

  const actualQuestionIds = Object.keys(analysis.questions || {}).sort()
  assert(JSON.stringify(actualQuestionIds) === JSON.stringify([...questionIds].sort()), 'questions exactly match target group questionIds')

  for (const questionId of questionIds) {
    const item = analysis.questions?.[questionId]
    const assetQuestion = asset.content.questions[questionId]
    assert(item && typeof item === 'object', `${questionId}: analysis item exists`)
    if (!item || typeof item !== 'object') continue

    assert(item.blankId === assetQuestion.blankId, `${questionId}: blankId matches paper asset`)
    assert(positionFacets.has(item.positionFacet), `${questionId}: valid positionFacet`)
    assert(roleFacets.has(item.roleFacet), `${questionId}: valid roleFacet`)

    const hasPrimary = hasOwn(item, 'primaryMechanismFacet')
    if (item.roleFacet === 'seven-choices.role.cohesion') {
      assert(hasPrimary && mechanismFacets.has(item.primaryMechanismFacet), `${questionId}: cohesion role has valid primaryMechanismFacet`)
    } else if (item.roleFacet === 'seven-choices.role.bridge') {
      assert(!hasPrimary || mechanismFacets.has(item.primaryMechanismFacet), `${questionId}: bridge role primaryMechanismFacet is absent or valid`)
    } else {
      assert(!hasPrimary, `${questionId}: topic/summary role must not include primaryMechanismFacet`)
    }

    const supporting = Array.isArray(item.supportingMechanismFacets) ? item.supportingMechanismFacets : []
    assert(supporting.length <= 2, `${questionId}: supportingMechanismFacets length <= 2`)
    supporting.forEach((facet) => {
      assert(mechanismFacets.has(facet), `${questionId}: valid supporting mechanism ${facet}`)
    })

    const correctLabel = item.optionFit?.correctOptionLabel
    const correctOptionText = normalize(optionByLabel.get(correctLabel))
    const activeMechanisms = [item.primaryMechanismFacet, ...supporting].filter(Boolean)
    const mechanismSignals = Array.isArray(item.mechanismSignals) ? item.mechanismSignals : []
    const needsSignal = activeMechanisms.some((facet) => requiredSignalMechanisms.has(facet))
    if (needsSignal) {
      assert(mechanismSignals.length > 0, `${questionId}: grammatical cohesion has mechanismSignals`)
    }
    for (const signal of mechanismSignals) {
      assert(mechanismFacets.has(signal.mechanismFacet), `${questionId}: mechanismSignal has valid mechanismFacet`)
      assert(activeMechanisms.includes(signal.mechanismFacet), `${questionId}: mechanismSignal facet is active on question`)
      assert(optionalString(signal.signalText), `${questionId}: mechanismSignal.signalText exists`)
      assert(signalSides.has(signal.signalSide), `${questionId}: mechanismSignal.signalSide is context or option`)
      assert(optionalString(signal.relation), `${questionId}: mechanismSignal.relation exists`)
      assert(!containsBlankMarker(questionId, signal.signalText), `${questionId}: mechanismSignal.signalText excludes blank marker`)
      const signalText = normalize(signal.signalText)
      if (signal.signalSide === 'context') {
        assert(passageText.includes(signalText), `${questionId}: context-side mechanismSignal appears in passage: ${signal.signalText}`)
      } else if (correctOptionText) {
        assert(correctOptionText.includes(signalText), `${questionId}: option-side mechanismSignal appears in correct option: ${signal.signalText}`)
      }
      const targetText = optionalString(signal.targetText)
      if (targetText) {
        assert(!containsBlankMarker(questionId, targetText), `${questionId}: mechanismSignal.targetText excludes blank marker`)
      }
    }

    assert(Array.isArray(item.topicClues) && item.topicClues.length > 0, `${questionId}: topicClues non-empty`)
    for (const clue of item.topicClues || []) {
      const normalizedClue = normalize(clue)
      assert(normalizedClue.length > 0, `${questionId}: topicClue is non-empty`)
      assert(passageText.includes(normalizedClue), `${questionId}: topicClue appears in context: ${clue}`)
      if (correctOptionText.includes(normalizedClue)) {
        assert(passageText.includes(normalizedClue), `${questionId}: topicClue is not option-only: ${clue}`)
      }
    }

    const evidence = item.contextEvidence
    assert(evidence && typeof evidence === 'object', `${questionId}: contextEvidence exists`)
    const paragraphText = paragraphById.get(evidence?.paragraphId)
    assert(Boolean(paragraphText), `${questionId}: contextEvidence paragraphId exists`)
    for (const field of ['beforeQuote', 'afterQuote']) {
      const quote = optionalString(evidence?.[field])
      if (quote && paragraphText) {
        assert(normalize(paragraphText).includes(normalize(quote)), `${questionId}: ${field} appears in paragraph text`)
        assert(!containsBlankMarker(questionId, quote), `${questionId}: ${field} excludes blank marker`)
      }
    }
    const heading = optionalString(evidence?.headingAnchor)
    if (heading) {
      assert(passageText.includes(normalize(heading)), `${questionId}: headingAnchor appears in passage`)
      assert(!containsBlankMarker(questionId, heading), `${questionId}: headingAnchor excludes blank marker`)
    }

    assert(item.optionFit && typeof item.optionFit === 'object', `${questionId}: optionFit exists`)
    assert(optionByLabel.has(correctLabel), `${questionId}: correctOptionLabel is in optionBank`)
    const authoritativeAnswer = asset.answerKey?.answers?.[questionId]?.answer || expectedAnswers[questionId]
    assert(correctLabel === authoritativeAnswer, `${questionId}: correctOptionLabel matches answer authority`)
    assert(optionalString(item.optionFit.fitSummary), `${questionId}: optionFit.fitSummary exists`)
    assert(Array.isArray(item.optionFit.matchedClues) && item.optionFit.matchedClues.length > 0, `${questionId}: optionFit.matchedClues non-empty`)
    for (const match of item.optionFit.matchedClues || []) {
      assert(optionalString(match.contextSide), `${questionId}: matchedClue.contextSide exists`)
      assert(optionalString(match.optionSide), `${questionId}: matchedClue.optionSide exists`)
      assert(optionalString(match.relation), `${questionId}: matchedClue.relation exists`)
    }

    const distractors = Array.isArray(item.keyDistractors) ? item.keyDistractors : []
    assert(distractors.length <= 2, `${questionId}: keyDistractors length <= 2`)
    for (const distractor of distractors) {
      assert(optionByLabel.has(distractor.optionLabel), `${questionId}: distractor optionLabel is in optionBank`)
      assert(distractor.optionLabel !== correctLabel, `${questionId}: distractor optionLabel differs from correct option`)
      assert(optionalString(distractor.reason), `${questionId}: distractor reason exists`)
    }
    walkKeys(distractors, (key) => {
      assert(!/facet/i.test(key), `${questionId}: distractors do not contain facet fields`)
    })

    assert(optionalString(item.teachingNote), `${questionId}: teachingNote exists`)
  }
}

const args = process.argv.slice(2)
const selfCheckOnly = args.includes('--self-check')
const analysisPath = args.find((arg) => !arg.startsWith('--')) || DEFAULT_ANALYSIS_PATH

if (selfCheckOnly) {
  selfCheck()
} else {
  validateAnalysis(analysisPath)
}

if (failures.length > 0) {
  console.error(`FAILED ${failures.length} assertion(s):`)
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exit(1)
}

console.log(selfCheckOnly ? 'I0-C self-check passed.' : `I0-C analysis verify passed: ${analysisPath}`)
