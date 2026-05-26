import { callChatCompletionsJson } from './chatCompletions.mjs'

const DEEPSEEK_BASE_URL = 'https://api.deepseek.com'

export function normalizeDeepSeekModel(value) {
  const raw = String(value || '').trim().toLowerCase().replace(/\s+/g, '').replace(/_/g, '-')
  if (raw === 'deepseek-v4-pro') return 'deepseek-v4-pro'
  if (raw === 'deepseek-v4-flash') return 'deepseek-v4-flash'
  return 'deepseek-v4-pro'
}

export function callDeepSeekJson({ messages, model = 'deepseek-v4-pro', fetchImpl }) {
  return callChatCompletionsJson({
    baseUrl: DEEPSEEK_BASE_URL,
    apiKey: process.env.DEEPSEEK_API_KEY,
    model: normalizeDeepSeekModel(model),
    messages,
    provider: 'deepseek',
    fetchImpl,
  })
}
