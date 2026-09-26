import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import {
  DICTIONARY_ATTRIBUTION,
  DICTIONARY_MEMORY_CACHE_MAX_BYTES,
  DICTIONARY_MEMORY_CACHE_MAX_ENTRIES,
  DICTIONARY_REQUEST_SCHEMA,
  DICTIONARY_RESPONSE_SCHEMA,
  DICTIONARY_SCHEMA,
  DICTIONARY_STATUS_SCHEMA,
  FORM_LOOKUP_VERSION,
  MAX_DICTIONARY_BODY_BYTES,
  MAX_DICTIONARY_RESPONSE_BYTES,
  MAX_WORD_UTF16,
  DICTIONARY_LOOKUP_RPM,
  SENSE_PICK_DEFAULT_MODEL,
  SENSE_PICK_MAX_OCCURRENCE_UTF16,
  SENSE_PICK_MAX_OUTPUT_TOKENS,
  SENSE_PICK_PROMPT_VERSION,
  SENSE_PICK_RATE_VERSION,
  SENSE_PICK_REQUEST_SCHEMA,
  SENSE_PICK_RESERVED_INPUT_TOKENS,
  SENSE_PICK_RESPONSE_SCHEMA,
} from '../../shared/paper-dictionary/constants.mjs'
import { classifyCompleteEnglishWord } from '../../shared/paper-dictionary/wordToken.mjs'
import {
  buildSelectionSourceFromConsumption,
  readSelection,
} from '../../shared/paper-selection/sourceProjection.mjs'
import { buildAdjacentContext } from '../../shared/paper-selection/segmentation.mjs'
import { createBoundedLru } from '../paper-translation/boundedLru.mjs'
import { createTranslationCacheStore } from '../paper-translation/cacheStore.mjs'
import { readPaperTranslationConfig } from '../paper-translation/config.mjs'
import { createTranslationScheduler } from '../paper-translation/scheduler.mjs'
import { createSingleFlight } from '../paper-translation/singleFlight.mjs'
import { createUsageLedger, unavailableLedger } from '../paper-translation/usageLedger.mjs'
import { lookupSurface, openPaperDictionary } from './store.mjs'
import { enrichWithGaokao, sharedGaokaoVocabulary } from './gaokao.mjs'
import { buildSenseCandidates, createSensePickAdapter } from './sensePick.mjs'

function serviceError(code, message, status) {
  const error = new Error(message)
  error.code = code
  error.status = status
  return error
}

function dictionaryPathFrom(rootDir, env) {
  return env.QUESTION_BANK_PAPER_DICTIONARY_PATH
    || path.join(rootDir, 'data', 'paper-dictionary', 'eqb-dictionary.sqlite')
}

function featureEnabled(env) {
  const raw = env.QUESTION_BANK_PAPER_DICTIONARY_ENABLED
  if (raw == null || raw === '') return true
  return !['0', 'false', 'off', 'no'].includes(String(raw).toLowerCase())
}

export function createPaperDictionaryRuntime({
  rootDir,
  loadCanonicalConsumption,
  loadSource,
  env = process.env,
  now = () => Date.now(),
  gaokaoVocabulary = sharedGaokaoVocabulary,
  fetchImpl = fetch,
  sensePickAdapter,
} = {}) {
  const enabled = featureEnabled(env)
  let vocabulary
  function gaokao() {
    if (vocabulary === undefined) {
      try {
        vocabulary = typeof gaokaoVocabulary === 'function' ? gaokaoVocabulary() : gaokaoVocabulary
      } catch (error) {
        console.warn('[paper-dictionary] gaokao vocabulary unavailable:', error.message)
        vocabulary = null
      }
    }
    return vocabulary
  }
  const filePath = dictionaryPathFrom(rootDir, env)
  const publicOrigin = env.QUESTION_BANK_PUBLIC_ORIGIN || ''
  let opened = null

  // 本文义只看圈中的这一个词，不把后面的词并成短语。
  // 模型兜底借用翻译功能的开关、Key、工作区和月度额度。密钥只放行 qwen-mt-flash。
  // 账本就是翻译账本文件，rate_version 区分条目，缓存另开一个文件。
  const translationConfig = readPaperTranslationConfig(env)
  const senseModel = (env.QWEN_SENSE_MODEL || SENSE_PICK_DEFAULT_MODEL).trim() || SENSE_PICK_DEFAULT_MODEL
  const dataDir = translationConfig.dataDir || path.join(rootDir, 'data', 'paper-translation')
  let senseLedger = null
  let senseLedgerInitialized = false
  let senseCache = null
  let senseCacheInitialized = false
  const senseScheduler = createTranslationScheduler({ now })
  const senseFlight = createSingleFlight()
  const senseAdapter = sensePickAdapter || createSensePickAdapter({
    endpoint: translationConfig.endpoint,
    apiKey: translationConfig.apiKey,
    model: senseModel,
    fetchImpl,
  })

  function getSenseLedger() {
    if (senseLedgerInitialized) return senseLedger
    senseLedgerInitialized = true
    try {
      senseLedger = createUsageLedger({
        filePath: path.join(dataDir, 'translation-usage.sqlite'),
        monthlyBudgetCny: translationConfig.monthlyBudgetCny,
        rateVersion: SENSE_PICK_RATE_VERSION,
      })
    } catch {
      senseLedger = unavailableLedger()
    }
    return senseLedger
  }

  function getSenseCache() {
    if (senseCacheInitialized) return senseCache
    senseCacheInitialized = true
    try {
      senseCache = createTranslationCacheStore({
        filePath: path.join(dataDir, 'sense-cache.sqlite'),
      })
    } catch {
      senseCache = null
    }
    return senseCache
  }

  function sensePickReady() {
    return Boolean(
      enabled
      && translationConfig.enabled
      && translationConfig.keyAvailable
      && translationConfig.endpoint
      && translationConfig.configValid
    )
  }

  function sensePickReason() {
    if (!enabled) return 'disabled'
    if (!translationConfig.enabled) return 'disabled'
    if (!translationConfig.keyAvailable || !translationConfig.endpoint || !translationConfig.configValid) {
      return 'key-unavailable'
    }
    if (!getSenseLedger().available) return 'ledger-unavailable'
    if (translationConfig.monthlyBudgetCny == null) return 'budget-unconfigured'
    return 'ok'
  }

  function dictionary() {
    if (!enabled) return { available: false, reason: 'disabled', db: null, meta: null }
    if (!opened) opened = openPaperDictionary(filePath)
    return opened
  }

  const lexicalCache = createBoundedLru({
    maxEntries: DICTIONARY_MEMORY_CACHE_MAX_ENTRIES,
    maxBytes: DICTIONARY_MEMORY_CACHE_MAX_BYTES,
  })
  const rateWindows = new Map()

  function status() {
    const current = dictionary()
    const senseEnabled = sensePickReady()
    return {
      schemaVersion: DICTIONARY_STATUS_SCHEMA,
      enabled,
      available: Boolean(current.available),
      dictionaryVersion: current.meta?.dictionary_version || null,
      reason: enabled ? current.reason : 'disabled',
      sensePick: {
        enabled: senseEnabled,
        reason: sensePickReason(),
      },
      limits: {
        maxWordUtf16: MAX_WORD_UTF16,
        maxBodyBytes: MAX_DICTIONARY_BODY_BYTES,
        maxResponseBytes: MAX_DICTIONARY_RESPONSE_BYTES,
      },
    }
  }

  function admit(userId) {
    const key = userId || 'anonymous'
    const at = now()
    let slot = rateWindows.get(key)
    if (!slot || at - slot.start >= 60_000) {
      slot = { start: at, count: 0 }
    }
    slot.count += 1
    rateWindows.delete(key)
    rateWindows.set(key, slot)
    while (rateWindows.size > 10_000) {
      const oldest = rateWindows.keys().next().value
      rateWindows.delete(oldest)
    }
    if (slot.count > DICTIONARY_LOOKUP_RPM) {
      throw serviceError('DICTIONARY_RATE_LIMITED', '查词正忙，请稍后再试', 429)
    }
  }

  function resolveSource(paperId) {
    if (typeof loadSource === 'function') return loadSource(paperId)
    const consumption = loadCanonicalConsumption({
      paperId,
      consumerId: 'screen',
    })
    return buildSelectionSourceFromConsumption(consumption)
  }

  function requireAuth(context) {
    if (context?.authMode === 'enforced' && !context?.session?.userId) {
      throw serviceError('not_authenticated', 'not_authenticated', 401)
    }
  }

  function fitPayload(payload) {
    const clone = structuredClone(payload)
    const size = () => Buffer.byteLength(JSON.stringify(clone))
    if (size() <= MAX_DICTIONARY_RESPONSE_BYTES) return clone

    clone.truncated = true
    const senses = () => clone.entries.flatMap((entry) => entry.posGroups.flatMap((group) => group.senses))
    for (const priority of ['rare', 'common', 'core']) {
      for (const sense of senses()) {
        if (sense.priority === priority && sense.learnerExplanation) {
          sense.learnerExplanation = null
          if (size() <= MAX_DICTIONARY_RESPONSE_BYTES) return clone
        }
      }
    }
    let omitted = 0
    for (const entry of clone.entries) {
      for (const group of entry.posGroups) {
        if (group.senses.length > 1) {
          omitted += group.senses.length - 1
          group.senses = group.senses.slice(0, 1)
        }
      }
    }
    clone.omittedSenseCount = omitted
    if (size() <= MAX_DICTIONARY_RESPONSE_BYTES) return clone
    for (const sense of senses()) {
      if (typeof sense.learnerExplanation === 'string' && sense.learnerExplanation.length > 180) {
        sense.learnerExplanation = `${sense.learnerExplanation.slice(0, 180)}…`
      }
      if (typeof sense.shortGloss === 'string' && sense.shortGloss.length > 80) {
        sense.shortGloss = `${sense.shortGloss.slice(0, 80)}…`
      }
    }
    clone.truncated = true
    return clone
  }

  function lexicalEntry(surface) {
    const current = dictionary()
    if (!current.available) {
      throw serviceError('DICTIONARY_UNAVAILABLE', '词典暂不可用', 503)
    }
    const version = current.meta.dictionary_version || DICTIONARY_SCHEMA
    const cacheKey = `${version}\n${FORM_LOOKUP_VERSION}\n${surface}`
    const cached = lexicalCache.get(cacheKey)
    if (cached) return cached
    const found = lookupSurface(current.db, surface)
    const payload = {
      dictionaryVersion: version,
      status: found.status,
      entries: enrichWithGaokao(found.entries, gaokao()),
      attribution: current.meta.attribution || DICTIONARY_ATTRIBUTION,
    }
    lexicalCache.set(cacheKey, payload, JSON.stringify(payload).length)
    return payload
  }

  // lookup 与 sense 共用的入站校验：同一套 schema 白名单、限流、来源校验和整词校验。
  function resolveWordSelection({ body, context, userId, schemaVersion }) {
    requireAuth(context)
    const current = dictionary()
    if (!enabled || !current.available) {
      throw serviceError('DICTIONARY_UNAVAILABLE', '词典暂不可用', 503)
    }
    if (!body || body.schemaVersion !== schemaVersion) {
      throw serviceError('DICTIONARY_REQUEST_INVALID', 'Unknown dictionary request schema', 400)
    }
    const allowedKeys = new Set(['schemaVersion', 'paperId', 'sourceRevision', 'segments'])
    if (Object.keys(body).some((key) => !allowedKeys.has(key))) {
      throw serviceError('DICTIONARY_REQUEST_INVALID', 'Client-supplied dictionary controls are not allowed', 400)
    }
    if (typeof body.paperId !== 'string' || !body.paperId || typeof body.sourceRevision !== 'string') {
      throw serviceError('DICTIONARY_REQUEST_INVALID', 'paperId and sourceRevision are required', 400)
    }
    if (!Array.isArray(body.segments) || body.segments.length !== 1) {
      throw serviceError('DICTIONARY_REQUEST_INVALID', 'Dictionary lookup accepts one word segment', 400)
    }
    const segment = body.segments[0]
    const segmentKeys = new Set(['streamId', 'start', 'end', 'selectedText'])
    if (!segment || Object.keys(segment).some((key) => !segmentKeys.has(key))) {
      throw serviceError('DICTIONARY_REQUEST_INVALID', 'Dictionary segment is malformed', 400)
    }
    admit(userId)

    let source
    try {
      source = resolveSource(body.paperId)
    } catch (error) {
      throw serviceError(error.code || 'SELECTION_SOURCE_UNAVAILABLE', 'Canonical consumption is not available', 409)
    }
    if (source.sourceRevision !== body.sourceRevision) {
      throw serviceError('SELECTION_SOURCE_MISMATCH', 'sourceRevision does not match', 409)
    }
    let slice
    try {
      slice = readSelection(source, segment)
    } catch (error) {
      const status = error.code === 'SELECTION_SOURCE_MISMATCH' ? 409 : 400
      throw serviceError(error.code || 'DICTIONARY_REQUEST_INVALID', error.message, status)
    }
    const word = classifyCompleteEnglishWord(slice.stream.text, segment.start, segment.end)
    if (!word || word.surface !== segment.selectedText || word.start !== segment.start || word.end !== segment.end) {
      throw serviceError('DICTIONARY_NOT_A_WORD', 'Selection is not one complete English word', 400)
    }
    return { source, segment, slice, word }
  }

  function lookup({ body, context, requestId = randomUUID(), userId }) {
    const { source, word } = resolveWordSelection({
      body, context, userId, schemaVersion: DICTIONARY_REQUEST_SCHEMA,
    })
    const lexical = lexicalEntry(word.surface)
    return fitPayload({
      schemaVersion: DICTIONARY_RESPONSE_SCHEMA,
      requestId,
      sourceRevision: source.sourceRevision,
      dictionaryVersion: lexical.dictionaryVersion,
      selectedText: word.surface,
      status: lexical.status,
      entries: lexical.entries,
      truncated: false,
      attribution: lexical.attribution,
    })
  }

  function senseRecordFromReply(reply) {
    if (reply.kind === 'sense') {
      const { candidate } = reply
      return {
        status: 'ok',
        match: {
          entryId: candidate.entryId,
          posGroupIndex: candidate.posGroupIndex,
          senseId: candidate.senseId,
          gloss: candidate.gloss,
        },
        phrase: null,
      }
    }
    if (reply.kind === 'phrase') {
      return { status: 'ok', match: null, phrase: { text: reply.phrase, gloss: reply.gloss } }
    }
    return { status: 'none', match: null, phrase: null }
  }

  async function sense({ body, context, signal, requestId = randomUUID(), userId }) {
    if (!sensePickReady()) {
      throw serviceError('SENSE_UNAVAILABLE', '本文义暂不可用', 503)
    }
    // 与翻译同一道付费闸：强制登录态要会话，开放态要显式允许。
    if (context?.authMode === 'open' && !translationConfig.allowOpenAuth) {
      throw serviceError('SENSE_UNAVAILABLE', '本文义暂不可用', 503)
    }
    const { source, segment, slice, word } = resolveWordSelection({
      body, context, userId, schemaVersion: SENSE_PICK_REQUEST_SCHEMA,
    })
    const lexical = lexicalEntry(word.surface)
    const candidates = buildSenseCandidates(lexical.entries)
    const respond = (record) => ({
      schemaVersion: SENSE_PICK_RESPONSE_SCHEMA,
      requestId,
      sourceRevision: source.sourceRevision,
      selectedText: word.surface,
      ...record,
    })
    if (lexical.status === 'not-found' || candidates.length === 0) {
      return respond({ status: 'none', match: null, phrase: null })
    }
    const headwords = [...new Set(lexical.entries.map((entry) => entry.headword))]
    const adjacent = buildAdjacentContext(slice.stream.text, segment.start, segment.end)
    let occurrence = adjacent.contextText.replace(/\s+/g, ' ').trim()
    if (occurrence.length > SENSE_PICK_MAX_OCCURRENCE_UTF16) {
      // 找不到句子边界的整段兜底：以选中词为中心截断，上下文仍然是原文。
      const center = occurrence.indexOf(word.surface)
      const half = Math.floor(SENSE_PICK_MAX_OCCURRENCE_UTF16 / 2)
      const from = Math.max(0, (center < 0 ? 0 : center) - half)
      occurrence = occurrence.slice(from, from + SENSE_PICK_MAX_OCCURRENCE_UTF16).trim()
    }
    const cacheKey = createHash('sha256').update([
      SENSE_PICK_PROMPT_VERSION,
      senseModel,
      lexical.dictionaryVersion,
      word.surface,
      occurrence,
    ].join('\n')).digest('hex')
    const cached = getSenseCache()?.get(cacheKey)
    if (cached) return respond(cached)

    const ledger = getSenseLedger()
    if (!ledger.available || translationConfig.monthlyBudgetCny == null) {
      throw serviceError('SENSE_UNAVAILABLE', '本文义暂不可用', 503)
    }
    const reservedMicro = Math.ceil(SENSE_PICK_RESERVED_INPUT_TOKENS * 0.7)
      + Math.ceil(SENSE_PICK_MAX_OUTPUT_TOKENS * 1.95)
    if (!ledger.canReserve(reservedMicro)) {
      throw serviceError('SENSE_BUDGET_EXHAUSTED', '本月本文义额度已用完', 429)
    }

    const record = await senseFlight.subscribe(cacheKey, async ({
      signal: flightSignal,
      markDispatched,
      hasSubscribers,
    }) => {
      const again = getSenseCache()?.get(cacheKey)
      if (again) return again
      let receipt
      try {
        receipt = ledger.reserve({
          inputTokens: SENSE_PICK_RESERVED_INPUT_TOKENS,
          outputTokens: SENSE_PICK_MAX_OUTPUT_TOKENS,
        })
      } catch {
        throw serviceError('SENSE_BUDGET_EXHAUSTED', '本月本文义额度已用完', 429)
      }
      let dispatched = false
      let settled = false
      try {
        senseScheduler.admitGlobalDispatch(SENSE_PICK_RESERVED_INPUT_TOKENS + SENSE_PICK_MAX_OUTPUT_TOKENS)
        const releaseSlot = await senseScheduler.acquireSlot()
        try {
          if (!hasSubscribers() && flightSignal.aborted) {
            ledger.release(receipt.receiptId)
            throw serviceError('SENSE_CANCELLED', 'Sense pick cancelled', { status: 499 })
          }
          ledger.markDispatched(receipt.receiptId)
          markDispatched()
          dispatched = true
          const reply = await senseAdapter.pickSense({
            surface: word.surface,
            headwords,
            occurrence,
            candidates,
          }, flightSignal)
          ledger.settle(receipt.receiptId, reply.usage)
          settled = true
          const picked = senseRecordFromReply(reply)
          try {
            getSenseCache()?.set(cacheKey, picked)
          } catch {
            // 调用已结算，缓存写不进去也不能重试扣费。
          }
          return picked
        } finally {
          releaseSlot()
        }
      } catch (error) {
        if (!settled) {
          if (dispatched && error?.usage) ledger.settle(receipt.receiptId, error.usage)
          else ledger.release(receipt.receiptId)
        }
        throw error
      }
    }, signal)
    return respond(record)
  }

  return {
    config: { filePath, enabled, publicOrigin },
    status,
    lookup,
    sense,
    close() {
      opened?.db?.close()
      opened = null
      getSenseCache()?.close()
      getSenseLedger().close()
    },
  }
}
