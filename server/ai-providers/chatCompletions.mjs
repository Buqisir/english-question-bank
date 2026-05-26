export function firstTextFromChatCompletion(payload) {
  const message = payload?.choices?.[0]?.message
  if (typeof message?.content === 'string') return message.content
  if (Array.isArray(message?.content)) {
    return message.content
      .map((part) => (typeof part === 'string' ? part : part?.text || ''))
      .join('')
      .trim()
  }
  return ''
}

export function normalizeChatBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '')
}

export async function callChatCompletionsJson({
  baseUrl,
  apiKey,
  model,
  messages,
  temperature = 0,
  maxTokens = 7000,
  provider,
  fetchImpl = fetch,
}) {
  const key = String(apiKey || '').trim()
  if (!key) throw new Error(`${provider} API key is not configured.`)
  const root = normalizeChatBaseUrl(baseUrl)
  if (!root) throw new Error(`${provider} chat-completions base URL is not configured.`)

  const startedAt = Date.now()
  const response = await fetchImpl(`${root}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
    }),
  })

  const text = await response.text()
  let payload = null
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = null
  }

  if (!response.ok) {
    const detail = payload?.error?.message || payload?.message || text || response.statusText
    throw new Error(`${provider} request failed (${response.status}): ${detail}`)
  }

  const rawText = firstTextFromChatCompletion(payload)
  if (!rawText) throw new Error(`${provider} returned an empty chat-completion message.`)

  return {
    rawText,
    provider,
    model,
    latencyMs: Date.now() - startedAt,
  }
}
