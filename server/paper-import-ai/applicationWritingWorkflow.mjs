import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const promptPath = path.join(repoRoot, 'prompts/application-writing-model-answer-v2.md')
const SPEC_CONTRADICTS = 'SPEC CONTRADICTS: cannot reconstruct complete application task'

function failContradicts(detail) {
  throw new Error(`${SPEC_CONTRADICTS}: ${detail}`)
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function normalized(value) {
  return value.replace(/\s+/g, ' ').trim()
}

function paragraphText(groupPassage) {
  if (groupPassage == null) return ''
  if (typeof groupPassage === 'string') return groupPassage.trim()
  if (typeof groupPassage !== 'object' || Array.isArray(groupPassage)) {
    failContradicts('group passage is malformed')
  }
  if (typeof groupPassage.materialText === 'string') return groupPassage.materialText.trim()
  if (!Array.isArray(groupPassage.paragraphs)) {
    failContradicts('group passage has no recoverable paragraphs')
  }
  const paragraphs = groupPassage.paragraphs.map((paragraph, index) => {
    const text = nonEmptyString(paragraph?.text)
    if (!text) failContradicts(`group passage paragraph ${index + 1} is missing text`)
    return text
  })
  return paragraphs.join('\n')
}

function structuredGiven(writingTask) {
  const given = writingTask.applicationGiven
  if (given === undefined) return []
  if (typeof given === 'string') {
    const title = nonEmptyString(given)
    if (!title) failContradicts('applicationGiven title is empty')
    return [title]
  }
  if (!given || typeof given !== 'object' || Array.isArray(given)) {
    failContradicts('applicationGiven is malformed')
  }
  const parts = []
  for (const field of ['top', 'bottom']) {
    if (!Array.isArray(given[field])) failContradicts(`applicationGiven.${field} is not an array`)
    for (const [index, value] of given[field].entries()) {
      const text = nonEmptyString(value)
      if (!text) failContradicts(`applicationGiven.${field}[${index}] is empty`)
      parts.push(text)
    }
  }
  return parts
}

function instructionAndPassage(writingTask, groupPassage) {
  if (!writingTask || writingTask.taskType !== 'application') {
    failContradicts('writing task is not an application task')
  }
  const instruction = nonEmptyString(writingTask.instruction)
  if (!instruction) failContradicts('instruction is missing')
  const passage = paragraphText(groupPassage)
  return { instruction, passage }
}

function inferredGiven(instruction, passage) {
  const source = [instruction, passage].filter(Boolean).join('\n')
  const salutation = source.match(/\b(?:dear|hello|hi)\s+[^,\r\n]+,/i)?.[0]?.trim()
  const closing = source.match(/\b(?:yours(?:\s+sincerely)?|sincerely|best regards|best wishes|regards|love),?\s*(?:\r?\n\s*)?[A-Z][A-Za-z .'-]*/i)?.[0]?.trim()
  return [...new Set([salutation, closing].filter(Boolean))]
}

function expectedGiven(writingTask, groupPassage) {
  const explicit = structuredGiven(writingTask)
  if (explicit.length > 0) return explicit
  const { instruction, passage } = instructionAndPassage(writingTask, groupPassage)
  return inferredGiven(instruction, passage)
}

export function buildCompleteApplicationTaskText(writingTask, groupPassage) {
  const { instruction, passage } = instructionAndPassage(writingTask, groupPassage)
  const given = structuredGiven(writingTask)
  const sections = [
    `【题面原文】\n${instruction}`,
    `【词数要求】\n${Number.isFinite(writingTask.wordCountTarget) ? `${writingTask.wordCountTarget}词左右` : '题面未提供明确词数'}`,
  ]
  if (passage && normalized(passage) !== normalized(instruction)) {
    sections.push(`【题组背景材料】\n${passage}`)
  }
  const sourceText = [instruction, passage].filter(Boolean).join('\n')
  const missingGiven = given.filter((text) => !normalized(sourceText).includes(normalized(text)))
  if (missingGiven.length > 0) {
    sections.push(`【题面给定格式】\n${missingGiven.join('\n')}`)
  }
  return sections.join('\n\n')
}

export function buildApplicationModelAnswerMessages(writingTask, groupPassage) {
  const prompt = readFileSync(promptPath, 'utf8').trim()
  const taskText = buildCompleteApplicationTaskText(writingTask, groupPassage)
  return [{ role: 'user', content: `${prompt}\n\n${taskText}` }]
}

function wordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length
}

function occurrences(text, fragment) {
  let count = 0
  let start = 0
  while (true) {
    const index = text.indexOf(fragment, start)
    if (index === -1) return count
    count += 1
    start = index + fragment.length
  }
}

export function validateApplicationModelAnswer({ modelAnswer, writingTask, groupPassage }) {
  if (!nonEmptyString(modelAnswer)) throw new Error('application model answer is empty')
  if (modelAnswer !== modelAnswer.trim()) {
    throw new Error('application model answer must start and end with composition content')
  }
  const answer = modelAnswer.trim()
  if (/^```|```$/m.test(answer) || /^#{1,6}\s/m.test(answer) || /\*\*|__/.test(answer)) {
    throw new Error('application model answer contains Markdown packaging')
  }
  if (/^\s*[\[{]/.test(answer)) throw new Error('application model answer contains JSON packaging')
  if (/[\u3400-\u9fff]/.test(answer)) throw new Error('application model answer contains Chinese explanation')
  if (/\n\s*\n\s*\n/.test(answer)) throw new Error('application model answer has an obvious blank-line format error')

  const given = expectedGiven(writingTask, groupPassage)
  let previousIndex = -1
  for (const text of given) {
    const count = occurrences(answer, text)
    if (count === 0) throw new Error(`application model answer is missing required given text: ${text}`)
    if (count > 1) throw new Error(`application model answer repeated required given text: ${text}`)
    const index = answer.indexOf(text)
    if (index < previousIndex) throw new Error('application model answer puts required given text in the wrong order')
    previousIndex = index
  }

  const studentWordCount = wordCount(answer) - given.reduce((total, text) => total + wordCount(text), 0)
  if (studentWordCount <= 0) throw new Error('application model answer has no student-written content')
  const target = writingTask.wordCountTarget
  if (target === 80 && (studentWordCount < 80 || studentWordCount > 105)) {
    throw new Error(`application model answer word count ${studentWordCount} is outside the accepted range [80, 105]`)
  }
  if (Number.isFinite(target) && target !== 80) {
    const lower = Math.ceil(target * 0.8)
    const upper = Math.ceil(target * 1.3)
    if (studentWordCount < lower || studentWordCount > upper) {
      throw new Error(`application model answer word count ${studentWordCount} is outside the accepted range [${lower}, ${upper}]`)
    }
  }
  return {
    studentWordCount,
    wordCountStatus: target === 80 ? (studentWordCount >= 85 && studentWordCount <= 100 ? 'recommended' : 'accepted') : 'accepted',
  }
}

export function validateApplicationReview(review) {
  if (!review || typeof review !== 'object' || Array.isArray(review)) {
    throw new Error('application review is not an object')
  }
  if (Object.keys(review).some((key) => !['verdict', 'findings'].includes(key))) {
    throw new Error('application review contains unknown fields')
  }
  if (!['PASS', 'MUST_FIX'].includes(review.verdict) || !Array.isArray(review.findings)) {
    throw new Error('application review has an invalid verdict or findings')
  }
  if (review.verdict === 'PASS' && review.findings.length !== 0) {
    throw new Error('application review PASS must have no findings')
  }
  if (review.verdict === 'MUST_FIX' && review.findings.length === 0) {
    throw new Error('application review MUST_FIX requires a finding')
  }
  for (const finding of review.findings) {
    if (!finding || typeof finding !== 'object' || Array.isArray(finding)) {
      throw new Error('application review finding is malformed')
    }
    if (Object.keys(finding).some((key) => !['code', 'problem', 'requiredChange'].includes(key))) {
      throw new Error('application review finding contains unknown fields')
    }
    for (const key of ['code', 'problem', 'requiredChange']) {
      if (!nonEmptyString(finding[key])) throw new Error(`application review finding ${key} is empty`)
    }
  }
  return review
}
