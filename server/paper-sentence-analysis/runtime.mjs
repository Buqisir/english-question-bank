import { createHash, randomUUID } from 'node:crypto'
import path from 'node:path'
import { compileFixture } from '../../shared/sentence-analysis/compileFixture.mjs'
import { LIMITS } from '../../shared/sentence-analysis/constants.mjs'
import { analysisSentences, resolveTargetFromStream } from '../../shared/sentence-analysis/resolveTarget.mjs'
import { validateSentenceAnalysis } from '../../shared/sentence-analysis/validate.mjs'
import { buildSelectionSourceFromConsumption } from '../../shared/paper-selection/sourceProjection.mjs'
import { createBoundedLru } from '../paper-translation/boundedLru.mjs'
import { createSingleFlight } from '../paper-translation/singleFlight.mjs'
import { createSentenceAnalysisStore } from './analysisStore.mjs'
import { buildMessages, buildRepairMessages, PROMPT_VERSION } from './prompt.mjs'
import { spansToAuthoring } from './spans.mjs'

export const DEFAULT_SENTENCE_ANALYSIS_MODEL = 'deepseek-flash'
const DEEPSEEK_CHAT_URL = 'https://api.deepseek.com/chat/completions'
const UPSTREAM_TIMEOUT_MS = 90_000
const MAX_OUTPUT_TOKENS = 8000
const USER_RPM = 12
const CACHE_MAX_ENTRIES = 500
const CACHE_MAX_BYTES = 16 * 1024 * 1024
const TARGET_FIELDS = ['paperId', 'sourceRevision', 'streamId', 'start', 'end', 'sentenceText']
const AUTHORING_FIELDS = ['translationZh', 'roots', 'units', 'relations', 'restores']

function serviceError(code, message, status, extra = {}) {
  const error = new Error(message)
  error.code = code
  error.status = status
  Object.assign(error, extra)
  return error
}

function featureEnabled(env) {
  const raw = env.QUESTION_BANK_SENTENCE_ANALYSIS_ENABLED
  if (raw == null || raw === '') return true
  return !['0', 'false', 'off', 'no'].includes(String(raw).toLowerCase())
}

function occurrences(text, piece) {
  let count = 0
  let from = 0
  while (from <= text.length) {
    const at = text.indexOf(piece, from)
    if (at < 0) break
    count += 1
    from = at + Math.max(piece.length, 1)
  }
  return count
}

// 译文片段只用于联动高亮；对不上的片段直接丢掉，不让整句分析失败。
function tidyAuthoring(raw) {
  const picked = {}
  for (const key of AUTHORING_FIELDS) if (raw[key] !== undefined) picked[key] = raw[key]
  const translation = typeof picked.translationZh === 'string' ? picked.translationZh : null
  if (Array.isArray(picked.units)) {
    picked.units = picked.units.map((unit) => {
      if (!unit || typeof unit !== 'object') return unit
      const next = { ...unit }
      for (const key of ['role', 'layer', 'parent']) if (next[key] === undefined) next[key] = null
      if (!Array.isArray(next.zh) || !translation) {
        delete next.zh
        delete next.zhOccurrence
        return next
      }
      next.zh = next.zh.filter((piece) => typeof piece === 'string' && piece && occurrences(translation, piece) === 1)
      delete next.zhOccurrence
      if (next.zh.length === 0) delete next.zh
      return next
    })
  }
  return picked
}

function parseJson(text) {
  const trimmed = String(text || '').trim()
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start < 0 || end <= start) throw serviceError('SENTENCE_ANALYSIS_BAD_REPLY', 'Model reply is not JSON', 502)
  try {
    return JSON.parse(trimmed.slice(start, end + 1))
  } catch {
    throw serviceError('SENTENCE_ANALYSIS_BAD_REPLY', 'Model reply is not JSON', 502)
  }
}

export function compileModelReply(replyText, sentenceText, model, { lenient = false } = {}) {
  const { dropped: _dropped, ...converted } = spansToAuthoring(parseJson(replyText), sentenceText, { lenient })
  const authoring = tidyAuthoring(converted)
  const compiled = compileFixture({ ...authoring, sentenceText }, { id: 'model' })
  const withProducer = { ...compiled, producer: { kind: 'model', id: model } }
  const validated = validateSentenceAnalysis(withProducer)
  if (!validated.ok) {
    throw serviceError('FIXTURE_COMPILE', validated.errors.map((error) => `${error.code} ${error.path}: ${error.message}`).join('\n'), 502)
  }
  return validated.value
}

export function createPaperSentenceAnalysisRuntime({
  loadCanonicalConsumption,
  loadSource,
  env = process.env,
  now = () => Date.now(),
  fetchImpl = fetch,
  dailyLimitCounter,
  rootDir = null,
} = {}) {
  const enabled = featureEnabled(env)
  const apiKey = String(env.DEEPSEEK_API_KEY || '').trim()
  const endpoint = env.DEEPSEEK_API_URL || DEEPSEEK_CHAT_URL
  const model = String(env.SENTENCE_ANALYSIS_MODEL || DEFAULT_SENTENCE_ANALYSIS_MODEL).trim()
  const publicOrigin = env.QUESTION_BANK_PUBLIC_ORIGIN || ''
  const dataDir = env.QUESTION_BANK_SENTENCE_ANALYSIS_DATA_DIR || (rootDir ? path.join(rootDir, 'data/paper-sentence-analysis') : null)
  const cache = createBoundedLru({ maxEntries: CACHE_MAX_ENTRIES, maxBytes: CACHE_MAX_BYTES })
  const flight = createSingleFlight()
  const windows = new Map()

  let store = null
  let storeInitialized = false

  // The durable store only saves repeat model calls; when it cannot open or
  // fails mid-request the card still works from memory and the model.
  function getStore() {
    if (storeInitialized) return store
    storeInitialized = true
    if (!dataDir) return null
    try {
      store = createSentenceAnalysisStore({ filePath: path.join(dataDir, 'sentence-analysis.sqlite'), now })
    } catch {
      store = null
    }
    return store
  }

  function readStored(key, sentenceText) {
    let row
    try {
      row = getStore()?.get(key)
    } catch {
      return null
    }
    if (!row) return null
    try {
      return compileModelReply(row.reply, sentenceText, model, { lenient: row.lenient })
    } catch {
      // A converter change can reject an old reply; drop it and ask the model again.
      try {
        getStore()?.delete(key)
      } catch {
        // Ignore: the fresh reply below overwrites the same key.
      }
      return null
    }
  }

  function writeStored(key, { sentenceText, context, produced }) {
    try {
      getStore()?.set(key, {
        model,
        promptVersion: PROMPT_VERSION,
        sentenceText,
        contextText: context,
        reply: produced.reply,
        lenient: produced.lenient,
        attempts: produced.attempts,
      })
    } catch {
      // The model call is already settled; a failed write must not fail the card.
    }
  }

  function status() {
    return { enabled, configured: Boolean(apiKey), model, promptVersion: PROMPT_VERSION }
  }

  function requireAuth(context) {
    if (context?.authMode === 'enforced' && !context?.session?.userId) {
      throw serviceError('not_authenticated', 'not_authenticated', 401)
    }
  }

  function admit(userId) {
    const key = userId || 'anonymous'
    const minute = Math.floor(now() / 60_000)
    const slot = windows.get(key)
    if (!slot || slot.minute !== minute) {
      windows.set(key, { minute, count: 1 })
      return
    }
    slot.count += 1
    if (slot.count > USER_RPM) throw serviceError('SENTENCE_ANALYSIS_RATE_LIMITED', '分析请求太频繁，请稍后再试', 429)
  }

  function resolveSource(paperId) {
    if (typeof loadSource === 'function') return loadSource(paperId)
    return buildSelectionSourceFromConsumption(loadCanonicalConsumption({ paperId, consumerId: 'screen' }))
  }

  function verifyTarget(body) {
    if (!body || typeof body !== 'object' || Object.keys(body).some((key) => !TARGET_FIELDS.includes(key))) {
      throw serviceError('SENTENCE_ANALYSIS_REQUEST_INVALID', 'Unexpected request fields', 400)
    }
    const { paperId, sourceRevision, streamId, start, end, sentenceText } = body
    if (
      typeof paperId !== 'string' || !paperId
      || typeof sourceRevision !== 'string'
      || typeof streamId !== 'string'
      || !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start
      || typeof sentenceText !== 'string' || sentenceText.length > LIMITS.sentenceText
    ) {
      throw serviceError('SENTENCE_ANALYSIS_REQUEST_INVALID', 'Malformed sentence target', 400)
    }
    let source
    try {
      source = resolveSource(paperId)
    } catch (error) {
      throw serviceError(error.code || 'SELECTION_SOURCE_UNAVAILABLE', 'Canonical consumption is not available', 409)
    }
    if (source.sourceRevision !== sourceRevision) {
      throw serviceError('SELECTION_SOURCE_MISMATCH', 'sourceRevision does not match', 409)
    }
    const stream = source.streams.find((item) => item.streamId === streamId)
    const resolved = resolveTargetFromStream({
      source,
      segment: { streamId, start, end },
      familyContractId: stream?.role === 'passage-body' ? 'reading' : null,
    })
    if (!resolved.ok) throw serviceError('SENTENCE_ANALYSIS_NOT_A_SENTENCE', resolved.reason, 400)
    const { target } = resolved
    if (target.start !== start || target.end !== end || target.sentenceText !== sentenceText) {
      throw serviceError('SELECTION_SOURCE_MISMATCH', 'Sentence target does not match the paper', 409)
    }
    const previous = analysisSentences(stream.text).findLast((sentence) => sentence.end <= target.start)
    return { target, context: previous?.text.trim() || '' }
  }

  async function complete(messages, signal) {
    const timeout = AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
    const combined = AbortSignal.any([signal, timeout])
    let response
    try {
      response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0,
          max_tokens: MAX_OUTPUT_TOKENS,
          response_format: { type: 'json_object' },
          thinking: { type: 'disabled' },
          stream: false,
        }),
        signal: combined,
        redirect: 'error',
      })
    } catch (error) {
      if (timeout.aborted) throw serviceError('SENTENCE_ANALYSIS_TIMEOUT', 'Model timed out', 504)
      if (error?.name === 'AbortError') throw error
      throw serviceError('SENTENCE_ANALYSIS_UPSTREAM_UNREACHABLE', 'Model is unreachable', 502)
    }
    const text = await response.text()
    if (!response.ok) {
      const status = response.status === 401 || response.status === 403 ? 503 : 502
      throw serviceError('SENTENCE_ANALYSIS_UPSTREAM_ERROR', `Model request failed (${response.status})`, status)
    }
    let payload
    try {
      payload = JSON.parse(text)
    } catch {
      throw serviceError('SENTENCE_ANALYSIS_BAD_REPLY', 'Model reply is not JSON', 502)
    }
    const content = payload?.choices?.[0]?.message?.content
    if (typeof content !== 'string' || !content.trim()) {
      throw serviceError('SENTENCE_ANALYSIS_BAD_REPLY', 'Model reply is empty', 502)
    }
    return content
  }

  async function produce(sentenceText, context, signal) {
    if (dailyLimitCounter?.isExceeded()) {
      throw serviceError('SENTENCE_ANALYSIS_BUDGET_EXHAUSTED', '今日 AI 额度已用完', 429)
    }
    dailyLimitCounter?.increment()
    const first = await complete(buildMessages(sentenceText, { context }), signal)
    try {
      return { analysis: compileModelReply(first, sentenceText, model), reply: first, lenient: false, attempts: 1 }
    } catch (error) {
      if (error.code !== 'FIXTURE_COMPILE' && error.code !== 'SENTENCE_ANALYSIS_BAD_REPLY') throw error
      dailyLimitCounter?.increment()
      const second = await complete(buildRepairMessages(sentenceText, first, error.message.slice(0, 2000), { context }), signal)
      try {
        return { analysis: compileModelReply(second, sentenceText, model), reply: second, lenient: false, attempts: 2 }
      } catch (retryError) {
        if (retryError.code === 'FIXTURE_COMPILE') {
          try {
            return { analysis: compileModelReply(second, sentenceText, model, { lenient: true }), reply: second, lenient: true, attempts: 2 }
          } catch {
            // The strict retry message is the more useful diagnosis.
          }
          throw serviceError('SENTENCE_ANALYSIS_INVALID', retryError.message.slice(0, 500), 502)
        }
        throw retryError
      }
    }
  }

  async function analyze({ body, context, requestId = randomUUID(), userId, signal }) {
    requireAuth(context)
    if (!enabled) throw serviceError('SENTENCE_ANALYSIS_UNAVAILABLE', 'Sentence analysis is disabled', 503)
    if (!apiKey) throw serviceError('SENTENCE_ANALYSIS_UNAVAILABLE', 'Sentence analysis is not configured', 503)
    const { target, context: previous } = verifyTarget(body)
    const key = createHash('sha256').update(`${model}\n${PROMPT_VERSION}\n${previous}\n${target.sentenceText}`).digest('hex')
    let analysis = cache.get(key)
    if (!analysis) {
      analysis = readStored(key, target.sentenceText)
      if (analysis) cache.set(key, analysis, JSON.stringify(analysis).length)
    }
    const cached = Boolean(analysis)
    if (!analysis) {
      admit(userId)
      analysis = await flight.subscribe(key, async ({ signal: flightSignal, markDispatched }) => {
        markDispatched()
        const produced = await produce(target.sentenceText, previous, flightSignal)
        cache.set(key, produced.analysis, JSON.stringify(produced.analysis).length)
        writeStored(key, { sentenceText: target.sentenceText, context: previous, produced })
        return produced.analysis
      }, signal)
    }
    return {
      requestId,
      cached,
      analysis: { ...analysis, source: { ...target } },
    }
  }

  return {
    analyze,
    status,
    config: { publicOrigin },
    close() {
      getStore()?.close()
    },
  }
}
