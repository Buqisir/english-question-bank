export function firstTextFromChatCompletion(payload) {
  const message = payload?.choices?.[0]?.message
  const content = typeof message?.content === 'string' ? message.content : ''
  const reasoning = typeof message?.reasoning_content === 'string' ? message.reasoning_content : ''
  // Reasoning models (e.g. deepseek-v4-pro) may return the JSON in reasoning_content
  // and leave content empty. Prefer content, fall back to reasoning_content.
  const best = content || reasoning
  if (best) return best
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

  const body = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
    stream: false,
  }

  // Only add these params for providers that support them natively.
  // OpenAI-compatible proxies may choke on unknown parameters.
  if (provider !== 'openai-compatible') {
    body.response_format = { type: 'json_object' }
    body.thinking = { type: 'disabled' }
  }

  const startedAt = Date.now()
  const response = await fetchImpl(`${root}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
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
