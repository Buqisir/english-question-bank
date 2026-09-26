// 本文义只在圈中的这一个词的义项里选。不把紧随其后的词并成短语。
// qwen-mt-flash 只能从这些义项里原样抄一条；抄出来的字对不上任何一条，就不标。
import {
  SENSE_PICK_MAX_CANDIDATES,
  SENSE_PICK_MAX_OUTPUT_TOKENS,
} from '../../shared/paper-dictionary/constants.mjs'
import { UPSTREAM_TIMEOUT_MS } from '../../shared/paper-selection/constants.mjs'
import { endpointAllowed } from '../paper-translation/config.mjs'

function senseError(code, message, { retryable = false, status = 502, usage = null } = {}) {
  const error = new Error(message)
  error.code = code
  error.retryable = retryable
  error.status = status
  if (usage) error.usage = usage
  return error
}

const PRIORITY_RANK = { core: 0, common: 1, rare: 2 }

// 候选清单 = 全部词条里有中文释义的义项，核心义在前，同档保持词典原序。
export function buildSenseCandidates(entries, max = SENSE_PICK_MAX_CANDIDATES) {
  const all = []
  for (const entry of entries || []) {
    for (const group of entry.posGroups || []) {
      for (const sense of group.senses || []) {
        const gloss = typeof sense.shortGloss === 'string' ? sense.shortGloss.trim() : ''
        if (!gloss) continue
        all.push({
          entryId: entry.entryId,
          posGroupIndex: group.posGroupIndex,
          senseId: sense.senseId,
          headword: entry.headword,
          pos: group.posLabel,
          gloss,
          rank: PRIORITY_RANK[sense.priority] ?? 3,
        })
      }
    }
  }
  return all
    .sort((a, b) => a.rank - b.rank)
    .slice(0, max)
    .map((item, index) => ({ ...item, n: index + 1 }))
}

// 原句放进 domains 后，Flash 会改写成近义词（悬挂着 → 悬挂在），逐字对不上。
// 这里只给义项清单，让它抄最常见的那条。
export function buildSenseDomains({ candidates }) {
  const list = (candidates || []).map((item) => item.gloss).filter(Boolean).join(' | ')
  return `High-school English exam. Copy exactly one gloss from this list and output nothing else: ${list}`
}

// Flash 有时不挑一条，而是把整份清单原样吐回来（用「 | 」串起来）。
// 清单已经按核心义排过，这时采用第一条，而不是让卡片空着。
// 自由发挥、对不上任何一条的译文仍然不标。
export function matchCopiedGloss(content, candidates) {
  const list = candidates || []
  const text = typeof content === 'string' ? content.trim() : ''
  const exact = list.find((item) => item.gloss === text)
  if (exact) return { kind: 'sense', candidate: exact }
  if (text.includes(' | ')) {
    const first = text.split(' | ')[0].trim()
    const echoed = list.find((item) => item.gloss === first)
    if (echoed) return { kind: 'sense', candidate: echoed }
  }
  return { kind: 'none' }
}

export function createSensePickAdapter({
  endpoint,
  apiKey,
  model,
  fetchImpl = fetch,
} = {}) {
  async function pickSense(input, signal) {
    if (!endpoint || !endpointAllowed(endpoint)) {
      throw senseError('SENSE_UNAVAILABLE', 'Sense pick endpoint is not allowed', { status: 503 })
    }
    if (!apiKey) {
      throw senseError('SENSE_UNAVAILABLE', 'Sense pick is not configured', { status: 503 })
    }
    const { surface, candidates } = input
    if (!surface || !Array.isArray(candidates) || candidates.length === 0) {
      throw senseError('SENSE_REQUEST_INVALID', 'surface and candidates are required', { status: 400 })
    }
    const timeout = AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
    const combined = signal
      ? (typeof AbortSignal.any === 'function' ? AbortSignal.any([signal, timeout]) : timeout)
      : timeout
    const body = {
      model,
      messages: [{ role: 'user', content: surface }],
      translation_options: {
        source_lang: 'English',
        target_lang: 'Chinese',
        domains: buildSenseDomains({ candidates }),
      },
      temperature: 0,
      max_tokens: SENSE_PICK_MAX_OUTPUT_TOKENS,
      stream: false,
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
        throw senseError('SENSE_TIMEOUT', 'Sense pick timed out', { retryable: true, status: 504 })
      }
      throw senseError('SENSE_UPSTREAM_UNREACHABLE', 'Sense pick provider is unreachable', {
        retryable: true,
        status: 502,
      })
    }
    if (response.status === 401 || response.status === 403) {
      throw senseError('SENSE_PROVIDER_AUTH', 'Sense pick provider rejected the request', { status: 503 })
    }
    if (response.status === 429) {
      throw senseError('SENSE_RATE_LIMITED', 'Sense pick is busy, retry shortly', {
        retryable: true,
        status: 429,
      })
    }
    if (!response.ok) {
      throw senseError('SENSE_UPSTREAM_ERROR', 'Sense pick provider failed', {
        retryable: response.status >= 500,
        status: 502,
      })
    }
    let payload
    try {
      payload = await response.json()
    } catch {
      throw senseError('SENSE_BAD_PAYLOAD', 'Sense pick provider returned invalid JSON')
    }
    const content = payload?.choices?.[0]?.message?.content
    const finishReason = payload?.choices?.[0]?.finish_reason
    const usage = payload?.usage
    if (payload?.model && model && payload.model !== model) {
      throw senseError('SENSE_MODEL_MISMATCH', 'Sense pick provider returned an unexpected model')
    }
    const observedUsage = usage && Number.isInteger(usage.prompt_tokens) && Number.isInteger(usage.completion_tokens)
      ? {
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
        totalTokens: Number.isInteger(usage.total_tokens)
          ? usage.total_tokens
          : usage.prompt_tokens + usage.completion_tokens,
      }
      : null
    if (typeof content !== 'string' || content.trim() === '') {
      throw senseError('SENSE_EMPTY', 'Sense pick was empty', { usage: observedUsage })
    }
    if (!observedUsage) {
      throw senseError('SENSE_USAGE_MISSING', 'Sense pick usage was missing', { status: 502 })
    }
    const copied = matchCopiedGloss(content, candidates)
    // 清单太长时回复会被截断，但第一条义项往往已经完整。圈中词用这条，不再报截断。
    if (copied.kind === 'sense') {
      return { ...copied, usage: observedUsage, model: payload.model || model }
    }
    if (finishReason === 'length') {
      throw senseError('SENSE_TRUNCATED', 'Sense pick was truncated', { usage: observedUsage })
    }
    if (finishReason && finishReason !== 'stop') {
      throw senseError('SENSE_INCOMPLETE', 'Sense pick did not finish cleanly', { usage: observedUsage })
    }
    return { ...copied, usage: observedUsage, model: payload.model || model }
  }

  return { pickSense }
}
