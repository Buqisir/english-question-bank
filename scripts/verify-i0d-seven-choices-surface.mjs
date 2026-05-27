#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = process.cwd()
const PAPER_ID = 'paper-2024-jslk-english'
const GROUP_ID = 'group-2024-jslk-seven-choices'
const ASSET_PATH = `app/public/paper-assets/${PAPER_ID}/paper-asset.json`
const ANALYSIS_PATH = `app/public/paper-assets/${PAPER_ID}/analyses/seven-choices-analysis-v1.json`
const ADAPTER_PATH = 'app/src/features/paper-intelligence/sevenChoicesSurfaceAdapter.ts'

const failures = []

function assert(condition, message) {
  if (!condition) failures.push(message)
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(ROOT, path), 'utf8'))
}

function normalize(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function questionNo(questionId) {
  return String(Number(questionId.split('-').at(-1)))
}

const asset = readJson(ASSET_PATH)
const analysis = readJson(ANALYSIS_PATH)
const adapterSource = readFileSync(resolve(ROOT, ADAPTER_PATH), 'utf8')
const group = asset.content.groups[GROUP_ID]
const passageText = group.passage.paragraphs.map((paragraph) => paragraph.text).join('\n')
const optionByLabel = new Map(group.optionBank.map((option) => [option.label, option.text]))

assert(group.groupType === 'sevenChoices', 'target group is sevenChoices')
assert(group.questionIds.length === 5, 'target group has 5 blank questions')
assert(group.optionBank.length === 7, 'target group has A-G option bank')
assert(analysis.schemaVersion === 'seven-choices-analysis-v1', 'analysis schemaVersion is seven-choices-analysis-v1')
assert(analysis.targetGroups.includes(GROUP_ID), 'analysis targets sevenChoices group')

const correctLabels = new Set()

for (const questionId of group.questionIds) {
  const item = analysis.questions[questionId]
  const no = questionNo(questionId)
  assert(item, `${questionId}: analysis exists`)
  if (!item) continue

  assert(passageText.match(new RegExp(`(^|\\D)${no}(?=\\D|$)`)), `${questionId}: blank marker ${no} is present in passage`)

  const correctLabel = item.optionFit?.correctOptionLabel
  correctLabels.add(correctLabel)
  const optionText = optionByLabel.get(correctLabel)
  assert(optionText, `${questionId}: correct option label resolves to optionBank`)
  assert(normalize(optionText) === normalize(item.optionFit?.correctOptionText || optionText), `${questionId}: UI can derive option text from optionBank`)

  const contextSignals = (item.mechanismSignals || []).filter((signal) => signal.signalSide === 'context-before' || signal.signalSide === 'context-after')
  const optionSignals = (item.mechanismSignals || []).filter((signal) => signal.signalSide === 'option')
  for (const signal of contextSignals) {
    assert(passageText.includes(signal.signalText), `${questionId}: context signal appears in passage: ${signal.signalText}`)
  }
  for (const signal of optionSignals) {
    assert(optionText.includes(signal.signalText), `${questionId}: option signal appears only in option card source: ${signal.signalText}`)
  }

  let locatedLeftClueCount = 0
  for (const clue of item.topicClues || []) {
    if (passageText.includes(clue)) locatedLeftClueCount += 1
  }
  locatedLeftClueCount += contextSignals.filter((signal) => passageText.includes(signal.signalText)).length
  assert(locatedLeftClueCount > 0, `${questionId}: at least one left-side clue can be highlighted`)
  assert(Array.isArray(item.optionFit?.matchedClues) && item.optionFit.matchedClues.length > 0, `${questionId}: matchedClues available for detail panel`)
  assert(typeof item.optionFit?.fitSummary === 'string' && item.optionFit.fitSummary.trim().length > 0, `${questionId}: fitSummary available for open card`)
  assert(typeof item.teachingNote === 'string' && item.teachingNote.trim().length > 0, `${questionId}: teachingNote available for details`)
}

assert(correctLabels.size === 5, 'five distinct correct options map to five blank chains')
assert(group.optionBank.some((option) => !correctLabels.has(option.label)), 'at least one wrong option remains plain')
assert(adapterSource.includes('SEVEN_CHOICES_BLANK_WRAPPER_RUN'), 'surface adapter owns a seven-choices blank wrapper normalizer')
assert(adapterSource.includes('[_＿]{3,}') && adapterSource.includes('formatSingleSevenChoicesBlankMarker'), 'surface adapter consumes underline-wrapped blank markers')

if (failures.length > 0) {
  console.error(`FAILED ${failures.length} assertion(s):`)
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('I0-D seven choices surface verify passed.')
