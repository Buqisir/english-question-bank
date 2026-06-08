// AI-completion transport + retry/abort/timeout + thinking-mode fallback + provider dispatch.
// Extracted from server/api.mjs (cut H5-D, refactor-roadmap-2026-06). Behavior-preserving:
// the function bodies are byte-identical to their pre-cut form (only re-indented into the factory;
// added leading whitespace is semantically inert). The flash-default normalizeDeepSeekModel is moved
// verbatim and intentionally NOT de-duped against ai-providers/deepseek.mjs (which is pro-default).
//
// HTTP transport, retry config and timing are injected (fetchImpl / elapsedMs / config) so the
// verify can stub fetch and exercise retry + provider routing + thinking-mode fallback. The H5-C
// pure JSON/verify extraction helpers are imported directly from ./jsonExtraction.mjs (a leaf, no
// cycle). This module never imports back from api.mjs.

import {
  parseJsonFromString,
  getDeepSeekMessageText,
  collectDeepSeekMessageTexts,
  parseLooseVerifyResult,
  extractVerifyResultFromPayload,
  extractReadingParsePayloadFromPayload,
  extractFirstJson,
  safeTruncate,
} from './jsonExtraction.mjs'

export function createCompletionRunner(deps) {
  const {
    fetchImpl = fetch,
    elapsedMs,
    DEEPSEEK_API_URL,
    DEFAULT_DEEPSEEK_MODEL,
    DEEPSEEK_HTTP_RETRY_COUNT,
    DEEPSEEK_HTTP_RETRY_DELAY_MS,
    DEEPSEEK_MODEL_ALIASES,
    LOCAL_QWEN_CHAT_API_URL,
    LOCAL_QWEN_CHAT_MODEL,
    LOCAL_QWEN_CHAT_TIMEOUT_MS,
    LOCAL_QWEN_PROVIDER,
  } = deps

  function buildDeepSeekRequestOptions({ model, messages, temperature, maxTokens, thinkingMode, responseFormat }) {
    const requestBody = {
      model,
      messages,
      max_tokens: maxTokens,
      thinking: { type: thinkingMode ? 'enabled' : 'disabled' },
    }

    if (responseFormat === 'json_object') {
      requestBody.response_format = { type: 'json_object' }
    }

    if (thinkingMode) {
      requestBody.reasoning_effort = 'high'
    } else if (typeof temperature === 'number') {
      requestBody.temperature = temperature
    }

    return requestBody
  }

  function normalizeDeepSeekModel(inputModel) {
    const rawModel = String(inputModel || '').trim()
    if (!rawModel) return DEFAULT_DEEPSEEK_MODEL
    const normalizedKey = rawModel.toLowerCase().replace(/\s+/g, '').replace(/_/g, '-')
    return DEEPSEEK_MODEL_ALIASES[normalizedKey] || DEFAULT_DEEPSEEK_MODEL
  }

  function isLocalQwenModel(inputModel) {
    const normalizedKey = String(inputModel || '').trim().toLowerCase().replace(/\s+/g, '').replace(/_/g, '-')
    return ['qwen3-8b-local', 'qwen3-8b', 'local-qwen'].includes(normalizedKey)
  }

  function normalizeAiChatModel(inputModel) {
    return isLocalQwenModel(inputModel) ? LOCAL_QWEN_CHAT_MODEL : normalizeDeepSeekModel(inputModel)
  }

  function describeAiKeySource(apiKey, model) {
    if (isLocalQwenModel(model)) {
      return {
        source: 'local',
        provider: LOCAL_QWEN_PROVIDER,
      }
    }
    return describeKeySource(apiKey)
  }

  function describeKeySource(apiKey) {
    const hasClientKey = Boolean(apiKey && String(apiKey).trim())
    return {
      source: hasClientKey ? 'client' : 'env',
      provider: 'deepseek',
    }
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  async function callDeepSeekCompletion(context) {
    const requestBody = buildDeepSeekRequestOptions(context)
    const maxAttempts = Math.max(1, DEEPSEEK_HTTP_RETRY_COUNT + 1)

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const requestStartAt = Date.now()
      let response
      let rawStatusText = ''

      try {
        response = await fetchImpl(DEEPSEEK_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${context.apiKey}`,
          },
          body: JSON.stringify(requestBody),
        })
        rawStatusText = await response.text().catch(() => '')
      } catch (error) {
        if (attempt < maxAttempts) {
          await delay(DEEPSEEK_HTTP_RETRY_DELAY_MS)
          continue
        }
        throw error
      }

      const requestMs = elapsedMs(requestStartAt)
      if (typeof context.onHttpResponse === 'function') {
        context.onHttpResponse({
          rawStatusText,
          status: response.status,
          ok: response.ok,
          latencyMs: requestMs,
          attempt,
        })
      }

      const data = parseJsonFromString(rawStatusText)

      if (!response.ok) {
        const errorText = safeTruncate(rawStatusText, 240)
        throw new Error(`DeepSeek API 返回错误 ${response.status}: ${errorText}`)
      }

      if (!data) {
        if (attempt < maxAttempts) {
          await delay(DEEPSEEK_HTTP_RETRY_DELAY_MS)
          continue
        }
        const errorText = safeTruncate(rawStatusText, 240)
        throw new Error(`DeepSeek API 返回非 JSON：${errorText}`)
      }

      const raw = getDeepSeekMessageText(data?.choices?.[0]?.message || data)

      const firstMessageText = collectDeepSeekMessageTexts(data).at(0)

      return {
        data,
        rawText: raw,
        firstMessageText,
        latencyMs: requestMs,
        status: response.status,
        rawStatusText,
      }
    }

    throw new Error('DeepSeek API 请求未完成。')
  }

  function buildLocalQwenRequestOptions({ model, messages, temperature, maxTokens }) {
    const normalizedMessages = Array.isArray(messages)
      ? messages.map((message) => ({
          role: message.role || 'user',
          content:
            message.role === 'user'
              ? `/no_think\n${String(message.content || '')}`
              : String(message.content || ''),
        }))
      : []

    return {
      model: model || LOCAL_QWEN_CHAT_MODEL,
      messages: normalizedMessages,
      temperature: typeof temperature === 'number' ? temperature : 0.2,
      max_tokens: maxTokens,
      stream: false,
    }
  }

  async function callLocalQwenCompletion(context) {
    const requestStartAt = Date.now()
    const requestBody = buildLocalQwenRequestOptions(context)
    const controller = new AbortController()
    const timeout = setTimeout(() => {
      controller.abort(new Error(`本地 Qwen 请求超时 ${LOCAL_QWEN_CHAT_TIMEOUT_MS}ms`))
    }, LOCAL_QWEN_CHAT_TIMEOUT_MS)

    try {
      const response = await fetchImpl(LOCAL_QWEN_CHAT_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      })

      const requestMs = elapsedMs(requestStartAt)
      const rawStatusText = await response.text().catch(() => '')
      if (typeof context.onHttpResponse === 'function') {
        context.onHttpResponse({
          rawStatusText,
          status: response.status,
          ok: response.ok,
          latencyMs: requestMs,
        })
      }

      const data = parseJsonFromString(rawStatusText)

      if (!response.ok) {
        const errorText = safeTruncate(rawStatusText, 240)
        throw new Error(`本地 Qwen 服务返回错误 ${response.status}: ${errorText}`)
      }

      if (!data) {
        const errorText = safeTruncate(rawStatusText, 240)
        throw new Error(`本地 Qwen 服务返回非 JSON：${errorText}`)
      }

      const raw = getDeepSeekMessageText(data?.choices?.[0]?.message || data)
      const firstMessageText = collectDeepSeekMessageTexts(data).at(0)

      return {
        data,
        rawText: raw,
        firstMessageText,
        latencyMs: requestMs,
        status: response.status,
        rawStatusText,
      }
    } catch (error) {
      const timeoutError = controller.signal.aborted
        ? new Error(`本地 Qwen 请求超时 ${LOCAL_QWEN_CHAT_TIMEOUT_MS}ms`)
        : error
      throw timeoutError
    } finally {
      clearTimeout(timeout)
    }
  }

  async function callDeepSeekWithFallback(context, onParseError) {
    const parseResult = (result) => {
      const rawCandidates = [result.firstMessageText, result.rawText, result.rawStatusText]

      if (context?.expectedResponseSchema === 'verify') {
        const fromData = extractVerifyResultFromPayload(result.data)
        if (fromData) return fromData

        for (const text of rawCandidates) {
          const jsonCandidate = extractFirstJson(text)
          if (jsonCandidate) {
            const normalizedVerify = extractVerifyResultFromPayload(jsonCandidate)
            if (normalizedVerify) return normalizedVerify
          }

          const looseParsed = parseLooseVerifyResult(text)
          if (looseParsed) return looseParsed
        }

        return null
      }

      if (context?.expectedResponseSchema === 'reading_parse') {
        const fromData = extractReadingParsePayloadFromPayload(result.data)
        if (fromData) return fromData

        for (const text of rawCandidates) {
          const jsonCandidate = extractFirstJson(text)
          if (!jsonCandidate) continue
          const normalizedReadingParse = extractReadingParsePayloadFromPayload(jsonCandidate)
          if (normalizedReadingParse) return normalizedReadingParse
        }

        return null
      }

      const jsonParsedCandidate = rawCandidates.map((candidateText) => extractFirstJson(candidateText)).find(Boolean)
      return jsonParsedCandidate || null
    }

    const completion = context.provider === LOCAL_QWEN_PROVIDER ? callLocalQwenCompletion : callDeepSeekCompletion
    const result = await completion(context)
    let parsed = parseResult(result)
    let fallbackUsed = false

    if (!parsed && context.thinkingMode === true && context.provider !== LOCAL_QWEN_PROVIDER) {
      const fallbackResult = await completion({
        ...context,
        thinkingMode: false,
      })
      parsed = parseResult(fallbackResult)
      if (parsed) {
        fallbackUsed = true
        Object.assign(result, fallbackResult)
      }
    }

    const finalParsed = parsed
    if (!finalParsed || typeof finalParsed !== 'object') {
      const rawLength = typeof result.rawText === 'string' ? result.rawText.length : 0
      const providerName = context.provider === LOCAL_QWEN_PROVIDER ? '本地 Qwen' : 'DeepSeek'
      const parseError = new Error(`${providerName} 返回结果不符合预期 JSON。原始长度 ${rawLength} 字符。`)
      onParseError?.(parseError, {
        thinkingMode: context.thinkingMode === true,
        model: context.model,
        expectedResponseSchema: context.expectedResponseSchema,
        rawPreview: safeTruncate(`${result.rawStatusText || ''}${result.rawStatusText ? '\n' : ''}${result.rawText || ''}`, 500),
        latencyMs: result.latencyMs,
        status: result.status,
      })
      throw parseError
    }

    return {
      ...result,
      parsed: finalParsed,
      thinkingModeUsed: context.thinkingMode === true,
      fallbackUsed,
    }
  }

  return {
    buildDeepSeekRequestOptions,
    normalizeDeepSeekModel,
    isLocalQwenModel,
    normalizeAiChatModel,
    describeAiKeySource,
    describeKeySource,
    delay,
    callDeepSeekCompletion,
    buildLocalQwenRequestOptions,
    callLocalQwenCompletion,
    callDeepSeekWithFallback,
  }
}
