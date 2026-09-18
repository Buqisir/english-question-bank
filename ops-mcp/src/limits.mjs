import {
  MAX_KEYWORD_CHARS,
  MAX_LOG_LIMIT,
  MAX_LOG_MINUTES,
  MAX_RESPONSE_BYTES,
  MIN_KEYWORD_CHARS,
  MIN_LOG_LIMIT,
  MIN_LOG_MINUTES,
  TOOL_TIMEOUT_MS,
} from './config.mjs'

export class ToolInputError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ToolInputError'
  }
}

export function clampLogQuery({ minutes, limit, keyword } = {}) {
  const parsedMinutes = minutes == null ? 120 : Number(minutes)
  const parsedLimit = limit == null ? 50 : Number(limit)
  if (!Number.isInteger(parsedMinutes) || parsedMinutes < MIN_LOG_MINUTES || parsedMinutes > MAX_LOG_MINUTES) {
    throw new ToolInputError(`minutes must be an integer ${MIN_LOG_MINUTES}–${MAX_LOG_MINUTES}`)
  }
  if (!Number.isInteger(parsedLimit) || parsedLimit < MIN_LOG_LIMIT || parsedLimit > MAX_LOG_LIMIT) {
    throw new ToolInputError(`limit must be an integer ${MIN_LOG_LIMIT}–${MAX_LOG_LIMIT}`)
  }
  let parsedKeyword
  if (keyword != null) {
    if (typeof keyword !== 'string') throw new ToolInputError('keyword must be a string')
    parsedKeyword = keyword
    if (
      parsedKeyword.length < MIN_KEYWORD_CHARS
      || parsedKeyword.length > MAX_KEYWORD_CHARS
      || parsedKeyword.includes('\0')
    ) {
      throw new ToolInputError(`keyword must be ${MIN_KEYWORD_CHARS}–${MAX_KEYWORD_CHARS} ordinary characters`)
    }
  }
  return { minutes: parsedMinutes, limit: parsedLimit, keyword: parsedKeyword }
}

export async function withTimeout(work, timeoutMs = TOOL_TIMEOUT_MS) {
  let timer
  try {
    return await Promise.race([
      work(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`tool exceeded ${timeoutMs}ms`)), timeoutMs)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

export function boundJson(value) {
  const collectedAt = new Date().toISOString()
  const payload = { ...value, collectedAt }
  let text = JSON.stringify(payload)
  if (Buffer.byteLength(text, 'utf8') <= MAX_RESPONSE_BYTES) {
    return { payload, truncated: Boolean(payload.truncated), bytes: Buffer.byteLength(text, 'utf8') }
  }
  const shrinkable = { ...payload, truncated: true }
  if (Array.isArray(shrinkable.entries)) {
    while (
      shrinkable.entries.length > 0
      && Buffer.byteLength(JSON.stringify(shrinkable), 'utf8') > MAX_RESPONSE_BYTES
    ) {
      shrinkable.entries.pop()
    }
  }
  if (typeof shrinkable.summary === 'string' && Buffer.byteLength(JSON.stringify(shrinkable), 'utf8') > MAX_RESPONSE_BYTES) {
    shrinkable.summary = '[truncated]'
  }
  text = JSON.stringify(shrinkable)
  if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) {
    const fallback = {
      error: 'response_truncated',
      truncated: true,
      collectedAt,
    }
    return { payload: fallback, truncated: true, bytes: Buffer.byteLength(JSON.stringify(fallback), 'utf8') }
  }
  return { payload: shrinkable, truncated: true, bytes: Buffer.byteLength(text, 'utf8') }
}

export function toolTextResult(value, isError = false) {
  const bounded = boundJson(value)
  return {
    content: [{ type: 'text', text: JSON.stringify(bounded.payload) }],
    isError,
  }
}
