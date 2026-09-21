import { createHash } from 'node:crypto'
import {
  PROMPT_VERSION,
  TASK_FRAGMENT,
  TASK_SELECTED_TEXT,
  TRANSLATION_OPTIONS,
} from './constants.mjs'

const DOMAIN_RULES = [
  'High-school English exam paper.',
  'Translate only the selected English into Simplified Chinese.',
  'Use the surrounding context only to disambiguate this occurrence.',
  'Do not translate the context, fill blanks, answer questions, or add dictionary lists.',
  'Return only the translation as plain text.',
].join(' ')

const TASK_SENTENCE = Object.freeze({
  [TASK_FRAGMENT]:
    'For a fragment, give the concise sense of this occurrence in context.',
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
  const domains = [
    DOMAIN_RULES,
    task,
    `Context before: ${beforeSelection ?? ''}`,
    `Selected: ${selectedText ?? ''}`,
    `Context after: ${afterSelection ?? ''}`,
  ].join(' ')
  // Preserve the complete authoritative window. translateService preflights the
  // actual message plus these domains against Flash input limits before dispatch.
  return domains
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
