import {
  MODEL_ID,
  TRANSLATION_OPTIONS,
  UPSTREAM_TIMEOUT_MS,
} from '../../shared/paper-selection/constants.mjs'
import { endpointAllowed } from './config.mjs'

function translationError(code, message, { retryable = false, status = 502 } = {}) {
  const error = new Error(message)
  error.code = code
  error.retryable = retryable
  error.status = status
  return error
}

export function looksLikeTemplateEcho(text) {
  if (typeof text !== 'string') return false
  return /DATA:\s*\{/.test(text)
    || (/before_selection/.test(text) && /selected_text/.test(text))
    || /Context before:/.test(text)
    || /Do not translate the context/.test(text)
}

export function createQwenMtFlashAdapter({
  endpoint,
  apiKey,
  fetchImpl = fetch,
} = {}) {
  async function translateSelection(input, signal) {
    if (!endpoint || !endpointAllowed(endpoint)) {
      throw translationError('TRANSLATION_ENDPOINT_INVALID', 'Translation endpoint is not allowed', {
        status: 503,
      })
    }
    if (!apiKey) {
      throw translationError('TRANSLATION_KEY_MISSING', 'Translation is not configured', {
        status: 503,
      })
    }
    const timeout = AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
    const combined = signal
      ? (typeof AbortSignal.any === 'function'
        ? AbortSignal.any([signal, timeout])
        : timeout)
      : timeout
    const selectedText = typeof input.selectedText === 'string' ? input.selectedText : ''
    if (!selectedText) {
      throw translationError('SELECTION_REQUEST_INVALID', 'selectedText is required')
    }
    const translationOptions = input.translationOptions && typeof input.translationOptions === 'object'
      ? input.translationOptions
      : TRANSLATION_OPTIONS
    const body = {
      model: MODEL_ID,
      messages: [{ role: 'user', content: selectedText }],
      translation_options: translationOptions,
      stream: false,
      temperature: 0,
      max_tokens: input.maxTokens,
    }
    let response
    try {
      response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: combined,
        redirect: 'error',
      })
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw translationError('TRANSLATION_TIMEOUT', 'Translation timed out', {
          retryable: true,
          status: 504,
        })
      }
      throw translationError('TRANSLATION_UPSTREAM_UNREACHABLE', 'Translation provider is unreachable', {
        retryable: true,
        status: 502,
      })
    }

    if (response.status === 401 || response.status === 403) {
      throw translationError('TRANSLATION_PROVIDER_AUTH', 'Translation provider rejected the request', {
        status: 503,
      })
    }
    if (response.status === 429) {
      const retryAfter = response.headers.get('retry-after')
      const error = translationError('TRANSLATION_RATE_LIMITED', 'Translation is busy, retry shortly', {
        retryable: true,
        status: 429,
      })
      error.retryAfter = retryAfter
      throw error
    }
    if (!response.ok) {
      throw translationError('TRANSLATION_UPSTREAM_ERROR', 'Translation provider failed', {
        retryable: response.status >= 500,
        status: 502,
      })
    }

    let payload
    try {
      payload = await response.json()
    } catch {
      throw translationError('TRANSLATION_BAD_PAYLOAD', 'Translation provider returned invalid JSON')
    }
    const content = payload?.choices?.[0]?.message?.content
    const finishReason = payload?.choices?.[0]?.finish_reason
    const usage = payload?.usage
    if (payload?.model && payload.model !== MODEL_ID) {
      throw translationError('TRANSLATION_MODEL_MISMATCH', 'Translation provider returned an unexpected model')
    }
    if (typeof content !== 'string' || content.trim() === '') {
      throw translationError('TRANSLATION_EMPTY', 'Translation was empty')
    }
    if (finishReason === 'length') {
      throw translationError('TRANSLATION_TRUNCATED', 'Translation was truncated')
    }
    if (finishReason && finishReason !== 'stop') {
      throw translationError('TRANSLATION_INCOMPLETE', 'Translation did not finish cleanly')
    }
    if (looksLikeTemplateEcho(content)) {
      throw translationError('TRANSLATION_TEMPLATE_ECHO', 'Translation echoed the prompt')
    }
    if (
      !usage
      || !Number.isInteger(usage.prompt_tokens)
      || !Number.isInteger(usage.completion_tokens)
      || usage.prompt_tokens < 0
      || usage.completion_tokens < 0
    ) {
      throw translationError('TRANSLATION_USAGE_MISSING', 'Translation usage was missing', {
        status: 502,
      })
    }
    return {
      translation: content.trim(),
      finishReason: finishReason || 'stop',
      usage: {
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
        totalTokens: Number.isInteger(usage.total_tokens)
          ? usage.total_tokens
          : usage.prompt_tokens + usage.completion_tokens,
      },
      model: payload.model || MODEL_ID,
    }
  }

  return { translateSelection }
}

export function createStubTranslationAdapter({
  translateSelection,
} = {}) {
  return {
    translateSelection: translateSelection || (async (input) => ({
      translation: `「${input.selectedText}」`,
      finishReason: 'stop',
      usage: {
        promptTokens: 12,
        completionTokens: 4,
        totalTokens: 16,
      },
      model: MODEL_ID,
    })),
  }
}
