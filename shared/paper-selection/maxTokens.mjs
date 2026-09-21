import {
  FLASH_MAX_CONTEXT_TOKENS,
  FLASH_MAX_INPUT_TOKENS,
  FLASH_MAX_OUTPUT_TOKENS,
  FRAGMENT_DEFAULT_MAX_TOKENS,
  TASK_FRAGMENT,
} from './constants.mjs'
import { conservativeInputTokenEstimate } from './tokenEstimate.mjs'

export function maxTokensForSelection(selectedText, taskMode, prompt) {
  const units = typeof selectedText === 'string' ? selectedText.length : 0
  let maxTokens = FRAGMENT_DEFAULT_MAX_TOKENS
  if (taskMode !== TASK_FRAGMENT || units > 80) {
    maxTokens = Math.min(FLASH_MAX_OUTPUT_TOKENS, Math.max(FRAGMENT_DEFAULT_MAX_TOKENS, units * 2))
  }
  const inputEstimate = conservativeInputTokenEstimate(prompt)
  const remaining = FLASH_MAX_CONTEXT_TOKENS - inputEstimate
  if (remaining < 16) {
    const error = new Error('Prompt exceeds the Flash context window')
    error.code = 'SELECTION_TOKEN_LIMIT'
    throw error
  }
  maxTokens = Math.min(maxTokens, FLASH_MAX_OUTPUT_TOKENS, remaining)
  if (inputEstimate > FLASH_MAX_INPUT_TOKENS) {
    const error = new Error('Prompt exceeds the Flash input token limit')
    error.code = 'SELECTION_TOKEN_LIMIT'
    throw error
  }
  return maxTokens
}
