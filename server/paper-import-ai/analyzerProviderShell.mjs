import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { callDeepSeekJson } from '../ai-providers/deepseek.mjs'
import { callGptRelayJson } from '../ai-providers/gptRelay.mjs'
import { extractFirstJsonObject } from './extractJson.mjs'

// ============================================================
// Byte-identical provider-call shell shared across the 4
// import-analysis modules (analyzeReading / Cloze / GrammarFill /
// SevenChoices).  What varies per type is injected:
//   - assertInput(input)            per-type input assertion
//   - buildMessages(input)          per-type prompt builder
//   - validate(analysis, input)     per-type shape validator
//   - isRetryable(error)            per-type retry predicate (regex differs)
//   - beforeValidate(analysis, ctx) optional pre-validate hook (stampMeta)
// ============================================================

export function readPromptFile(promptPath) {
  return readFileSync(promptPath, 'utf8')
}

export function rewriteApiPrompt(raw) {
  return raw.replace(
    /## Output Requirement[\s\S]*?## Reasoning Rule/,
    [
      '## Output Requirement',
      '',
      'You MUST return exactly one JSON object as plain text in this API response.',
      'The first non-whitespace character MUST be `{` and the final non-whitespace character MUST be `}`.',
      '',
      'Do NOT create or download a file.',
      'Do NOT return `UNABLE_TO_CREATE_FILE`.',
      'Do NOT wrap JSON in markdown fences.',
      'Do NOT write a filename heading.',
      'Do NOT write "Here is the JSON".',
      'Do NOT explain what you are doing.',
      '',
      '## Reasoning Rule',
    ].join('\n'),
  )
}

function normalizeProviderId(providerId) {
  const raw = String(providerId || '').trim().toLowerCase()
  if (raw === 'gpt-5.5' || raw === 'openai' || raw === 'chatgpt') return 'gpt-5.5'
  return 'deepseek-v4-pro'
}

async function callProvider({ providerId, messages, providerCallers }) {
  const provider = normalizeProviderId(providerId)
  if (provider === 'gpt-5.5') {
    return (providerCallers?.gptRelay || callGptRelayJson)({ messages, model: 'gpt-5.5' })
  }
  return (providerCallers?.deepseek || callDeepSeekJson)({ messages, model: 'deepseek-v4-pro' })
}

async function callProviderWithRetry(args, { retries = 1 } = {}) {
  let lastError
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await callProvider(args)
    } catch (error) {
      lastError = error
      if (attempt >= retries) break
    }
  }
  throw lastError
}

/**
 * createAnalyzerProviderShell — factory that returns a single async function
 * `runAnalysis(input, options)` embodying the shared provider-call + retry +
 * JSON-extraction + validate orchestration.
 *
 * Injected per type:
 *   assertInput(input)              — throws on bad input
 *   buildMessages(input)            — returns [{role, content}] array
 *   validate(analysis, input)       — throws on bad AI JSON shape
 *   isRetryable(error) → boolean    — per-type retry predicate
 *   beforeValidate(analysis, ctx)   — optional; called after JSON extraction,
 *                                     before validate (used for stampMeta)
 */
export function createAnalyzerProviderShell({
  assertInput,
  buildMessages,
  validate,
  isRetryable,
  beforeValidate = null,
}) {
  return async function runAnalysis(input, options = {}) {
    assertInput(input)
    const requestId = options.requestId || randomUUID()
    const providerId = normalizeProviderId(input.providerId)
    const messages = buildMessages(input)
    const analysisRetries = Number.isInteger(options.analysisRetries) ? options.analysisRetries : 1
    let lastError
    for (let attempt = 0; attempt <= analysisRetries; attempt += 1) {
      const providerResult = await callProviderWithRetry({
        providerId,
        messages,
        providerCallers: options.providerCallers,
      }, { retries: Number.isInteger(options.providerRetries) ? options.providerRetries : 1 })
      try {
        const analysis = extractFirstJsonObject(providerResult.rawText)
        if (beforeValidate) beforeValidate(analysis, { providerResult, providerId })
        validate(analysis, input)
        return {
          analysis,
          provider: providerResult.provider,
          model: providerResult.model,
          requestId,
          latencyMs: providerResult.latencyMs,
        }
      } catch (error) {
        lastError = error
        if (attempt >= analysisRetries || !isRetryable(error)) break
      }
    }
    throw lastError
  }
}
