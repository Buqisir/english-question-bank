import { FLASH_MAX_INPUT_TOKENS } from './constants.mjs'

/**
 * Conservative overestimate for Flash input screening.
 * ASCII runs count as 1 token / 2 code points; other code points count as 1.
 * This is not a Qwen tokenizer and is not used as a billing figure.
 */
export function conservativeInputTokenEstimate(text) {
  if (typeof text !== 'string') return FLASH_MAX_INPUT_TOKENS + 1
  let ascii = 0
  let other = 0
  for (const char of text) {
    if (char.codePointAt(0) <= 0x7f) ascii += 1
    else other += 1
  }
  return Math.ceil(ascii / 2) + other + 8
}

export function promptFitsFlashInput(prompt) {
  return conservativeInputTokenEstimate(prompt) <= FLASH_MAX_INPUT_TOKENS
}
