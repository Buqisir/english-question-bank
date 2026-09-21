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

const DOMAINS_MAX = 4_000

export function promptTemplateHash() {
  return createHash('sha256')
    .update(DOMAIN_RULES, 'utf8')
    .update('\n', 'utf8')
    .update(TASK_SENTENCE[TASK_FRAGMENT], 'utf8')
    .update('\n', 'utf8')
    .update(TASK_SENTENCE[TASK_SELECTED_TEXT], 'utf8')
    .digest('hex')
}

function clip(text, max) {
  if (typeof text !== 'string') return ''
  if (text.length <= max) return text
  return `${text.slice(0, max)}…`
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
    `Context before: ${clip(beforeSelection, 1200)}`,
    `Selected: ${clip(selectedText, 800)}`,
    `Context after: ${clip(afterSelection, 1200)}`,
  ].join(' ')
  return clip(domains, DOMAINS_MAX)
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
