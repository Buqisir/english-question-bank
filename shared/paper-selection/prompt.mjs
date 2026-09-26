import { createHash } from 'node:crypto'
import {
  PROMPT_VERSION,
  TASK_FRAGMENT,
  TASK_SELECTED_TEXT,
  TRANSLATION_OPTIONS,
} from './constants.mjs'

const DOMAIN_RULES = [
  'High-school English exam paper.',
  'Translate only the user message into Simplified Chinese.',
  "The user message is the teacher's selected span.",
  'The user message is one selected span inside the occurrence below.',
  'Use the occurrence only to choose the sense of that span.',
  'Do not translate, continue, or output the rest of the occurrence.',
  'Do not fill blanks, answer questions, or add dictionary lists.',
  'Return only the translation as plain text.',
].join(' ')

const TASK_SENTENCE = Object.freeze({
  [TASK_FRAGMENT]:
    'For a fragment, give the concise sense of this selected span only.',
  [TASK_SELECTED_TEXT]:
    'For complete sentences or longer text, translate the selected content faithfully.',
})

export function promptTemplateHash() {
  return createHash('sha256')
    .update(DOMAIN_RULES, 'utf8')
    .update('\n', 'utf8')
    .update(TASK_SENTENCE[TASK_FRAGMENT], 'utf8')
    .update('\n', 'utf8')
    .update(TASK_SENTENCE[TASK_SELECTED_TEXT], 'utf8')
    .digest('hex')
}

export function buildTranslationDomains({
  taskMode,
  beforeSelection,
  selectedText,
  afterSelection,
}) {
  const task = TASK_SENTENCE[taskMode]
  if (!task) {
    const error = new Error('Unknown translation task mode')
    error.code = 'SELECTION_TASK_MODE_INVALID'
    throw error
  }
  const occurrence = `${beforeSelection ?? ''}${selectedText ?? ''}${afterSelection ?? ''}`
    .replace(/\s+/g, ' ')
    .trim()
    .replaceAll('"', "'")
  const quoted = occurrence ? ` Occurrence: "${occurrence}"` : ''
  // Quote the adjacent window inside domains. Flash translates the user message;
  // an unquoted "Selected: word Context after: rest of sentence" makes it continue the word.
  return `${DOMAIN_RULES} ${task}${quoted}`
}

export function buildTranslationOptions(input) {
  return {
    source_lang: TRANSLATION_OPTIONS.source_lang,
    target_lang: TRANSLATION_OPTIONS.target_lang,
    domains: buildTranslationDomains(input),
  }
}

export function promptMeta() {
  return {
    promptVersion: PROMPT_VERSION,
    promptTemplateHash: promptTemplateHash(),
  }
}
