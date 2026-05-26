import { callChatCompletionsJson } from './chatCompletions.mjs'

export function normalizeGptRelayModel(value) {
  return String(value || '').trim() || 'gpt-5.5'
}

export function getGptRelayBaseUrl() {
  return process.env.OPENAI_BASE_URL || process.env.OPENAI_COMPAT_BASE_URL || process.env.CHATGPT_BASE_URL || ''
}

export function callGptRelayJson({ messages, model = 'gpt-5.5', fetchImpl }) {
  return callChatCompletionsJson({
    baseUrl: getGptRelayBaseUrl(),
    apiKey: process.env.OPENAI_API_KEY,
    model: normalizeGptRelayModel(model),
    messages,
    provider: 'openai-compatible',
    fetchImpl,
  })
}
