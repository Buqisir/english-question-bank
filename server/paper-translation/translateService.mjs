import { randomUUID } from 'node:crypto'
import {
  ACCESS_SCOPE_PUBLIC,
  CONTEXT_POLICY,
  FLASH_MAX_INPUT_TOKENS,
  MAX_BODY_BYTES,
  MAX_CONTEXT_UTF16,
  MAX_SEGMENTS,
  MAX_SELECTED_UTF16,
  MODEL_ID,
  PROMPT_VERSION,
  TASK_FRAGMENT,
  PROVIDER_ID,
  REQUEST_SCHEMA,
  RESPONSE_SCHEMA,
  SOURCE_CACHE_MAX_BYTES,
  SOURCE_CACHE_MAX_ENTRIES,
  SOURCE_PROJECTION_VERSION,
  STATUS_SCHEMA,
} from '../../shared/paper-selection/constants.mjs'
import { cacheKeyFromInput, stableRequestOptions } from '../../shared/paper-selection/cacheKey.mjs'
import { maxTokensForSelection } from '../../shared/paper-selection/maxTokens.mjs'
import { buildTranslationOptions, promptMeta } from '../../shared/paper-selection/prompt.mjs'
import {
  buildSelectionSourceFromConsumption,
  computeSourceRevision,
  validateTranslateSegments,
} from '../../shared/paper-selection/sourceProjection.mjs'
import { conservativeInputTokenEstimate, promptFitsFlashInput } from '../../shared/paper-selection/tokenEstimate.mjs'
import { createBoundedLru } from './boundedLru.mjs'
import { createTranslationCacheStore } from './cacheStore.mjs'
import { readPaperTranslationConfig } from './config.mjs'
import { createQwenMtFlashAdapter, looksLikeExpandedFragment } from './qwenMtFlash.mjs'
import { createTranslationScheduler } from './scheduler.mjs'
import { createSingleFlight } from './singleFlight.mjs'
import { createUsageLedger, unavailableLedger } from './usageLedger.mjs'

function serviceError(code, message, { status = 400, retryable = false, usage = null } = {}) {
  const error = new Error(message)
  error.code = code
  error.status = status
  error.retryable = retryable
  if (usage) error.usage = usage
  throw error
}

function denialFromReason(reason) {
  switch (reason) {
    case 'budget-exhausted':
      return { code: 'TRANSLATION_BUDGET_EXHAUSTED', retryable: true }
    case 'auth':
      return { code: 'not_authenticated', retryable: false }
    case 'disabled':
      return { code: 'TRANSLATION_DISABLED', retryable: false }
    default:
      return { code: 'TRANSLATION_UNAVAILABLE', retryable: true }
  }
}

function statusForTranslationCode(code) {
  switch (code) {
    case 'TRANSLATION_DISABLED':
    case 'TRANSLATION_UNAVAILABLE':
    case 'TRANSLATION_LEDGER_UNAVAILABLE':
    case 'TRANSLATION_PROVIDER_AUTH':
    case 'TRANSLATION_KEY_MISSING':
      return 503
    case 'TRANSLATION_BUDGET_EXHAUSTED':
    case 'TRANSLATION_RATE_LIMITED':
    case 'TRANSLATION_USER_RATE_LIMIT':
    case 'TRANSLATION_GLOBAL_RATE_LIMIT':
      return 429
    case 'not_authenticated':
      return 401
    case 'SELECTION_TOKEN_LIMIT':
    case 'SELECTION_LIMIT':
      return 413
    case 'TRANSLATION_TIMEOUT':
      return 504
    default:
      return 502
  }
}

function userMessageFor(code) {
  switch (code) {
    case 'SELECTION_SOURCE_MISMATCH':
    case 'SELECTION_SOURCE_UNAVAILABLE':
      return '试卷来源已更新，请重新选择后再翻译'
    case 'SELECTION_LIMIT':
    case 'SELECTION_TOKEN_LIMIT':
      return '选区过长，请缩短后再翻译'
    case 'TRANSLATION_BUDGET_EXHAUSTED':
      return '本月翻译额度已用完，已缓存的结果仍可查看'
    case 'TRANSLATION_LEDGER_UNAVAILABLE':
    case 'TRANSLATION_UNAVAILABLE':
    case 'TRANSLATION_DISABLED':
    case 'TRANSLATION_PROVIDER_AUTH':
      return '翻译暂不可用'
    case 'TRANSLATION_UPSTREAM_UNREACHABLE':
      return '服务没连上，请重试'
    case 'TRANSLATION_RATE_LIMITED':
    case 'TRANSLATION_USER_RATE_LIMIT':
    case 'TRANSLATION_GLOBAL_RATE_LIMIT':
    case 'TRANSLATION_QUEUE_TIMEOUT':
    case 'TRANSLATION_INFLIGHT_LIMIT':
      return '翻译正忙，请稍后再试'
    case 'TRANSLATION_TIMEOUT':
      return '翻译超时，请重试或重新选择'
    case 'TRANSLATION_TRUNCATED':
    case 'TRANSLATION_EMPTY':
    case 'TRANSLATION_TEMPLATE_ECHO':
    case 'TRANSLATION_INCOMPLETE':
      return '这段文字暂时未能正确翻译，请重试或重新选择'
    case 'not_authenticated':
      return '请先登录后再翻译'
    default:
      return '这段文字暂时未能正确翻译，请重试或重新选择'
  }
}

function logEvent(fields) {
  const safe = {
    event: 'paper-translation',
    ...fields,
  }
  console.info(JSON.stringify(safe))
}

export function createPaperTranslationRuntime({
  rootDir,
  loadCanonicalConsumption,
  loadSource,
  env = process.env,
  fetchImpl = fetch,
  adapter,
  now = () => Date.now(),
} = {}) {
  const config = readPaperTranslationConfig(env)
  const dataDir = config.dataDir || `${rootDir}/data/paper-translation`

  let cacheStore = null
  let cacheInitialized = false
  let ledger = unavailableLedger()
  let ledgerInitialized = false

  function getCacheStore() {
    if (cacheInitialized) return cacheStore
    cacheInitialized = true
    try {
      cacheStore = createTranslationCacheStore({
        filePath: `${dataDir}/translation-cache.sqlite`,
      })
    } catch {
      cacheStore = null
    }
    return cacheStore
  }

  function getLedger() {
    if (ledgerInitialized) return ledger
    ledgerInitialized = true
    try {
      ledger = createUsageLedger({
        filePath: `${dataDir}/translation-usage.sqlite`,
        monthlyBudgetCny: config.monthlyBudgetCny,
      })
    } catch {
      ledger = unavailableLedger()
    }
    return ledger
  }

  const sourceCache = createBoundedLru({
    maxEntries: SOURCE_CACHE_MAX_ENTRIES,
    maxBytes: SOURCE_CACHE_MAX_BYTES,
  })
  const scheduler = createTranslationScheduler({ now })
  const singleFlight = createSingleFlight()
  const provider = adapter || createQwenMtFlashAdapter({
    endpoint: config.endpoint,
    apiKey: config.apiKey,
    fetchImpl,
  })
  let providerCircuitUntil = 0
  let consecutiveAuthFailures = 0

  function authAllowsPaid(context) {
    if (context?.authMode === 'enforced' && context?.session?.userId) return true
    if (context?.authMode === 'open' && config.allowOpenAuth) return true
    return false
  }

  function capability(context) {
    const keyOk = config.keyAvailable && Boolean(config.endpoint) && config.configValid
    const circuitOpen = now() < providerCircuitUntil
    const activeLedger = config.enabled ? getLedger() : unavailableLedger()
    const ledgerOk = activeLedger.available
    const canRequestNew = Boolean(
      config.enabled
      && keyOk
      && ledgerOk
      && config.monthlyBudgetCny != null
      && activeLedger.canReserve(1)
      && authAllowsPaid(context)
      && !circuitOpen,
    )
    let reason = 'ok'
    if (!config.enabled) reason = 'disabled'
    else if (!authAllowsPaid(context)) reason = 'auth'
    else if (!keyOk) reason = 'key-unavailable'
    else if (!ledgerOk) reason = 'ledger-unavailable'
    else if (config.monthlyBudgetCny == null) reason = 'budget-unconfigured'
    else if (!activeLedger.canReserve(1)) reason = 'budget-exhausted'
    else if (circuitOpen) reason = 'provider-circuit'
    return {
      schemaVersion: STATUS_SCHEMA,
      enabled: config.enabled,
      keyAvailable: config.keyAvailable,
      canRequestNew,
      reason,
      promptVersion: PROMPT_VERSION,
      contextPolicy: CONTEXT_POLICY,
      sourceProjectionVersion: SOURCE_PROJECTION_VERSION,
      limits: {
        maxSelectedUtf16: MAX_SELECTED_UTF16,
        maxContextUtf16: MAX_CONTEXT_UTF16,
        maxSegments: MAX_SEGMENTS,
        maxBodyBytes: MAX_BODY_BYTES,
      },
    }
  }

  function resolveSource(paperId) {
    if (typeof loadSource === 'function') return loadSource(paperId)
    const consumption = loadCanonicalConsumption({
      paperId,
      consumerId: 'screen',
    })
    const revision = computeSourceRevision(consumption)
    const cached = sourceCache.get(revision)
    if (cached) return cached
    const source = buildSelectionSourceFromConsumption(consumption)
    sourceCache.set(revision, source, JSON.stringify(source).length)
    return source
  }

  async function translateOne(prepared, { signal, userId, requestId }) {
    const { adjacent } = prepared
    const translationOptions = buildTranslationOptions({
      taskMode: adjacent.taskMode,
      beforeSelection: adjacent.beforeSelection,
      selectedText: adjacent.selectedText,
      afterSelection: adjacent.afterSelection,
    })
    const prompt = `${adjacent.selectedText}\n${translationOptions.domains}`
    if (!promptFitsFlashInput(prompt)) {
      serviceError('SELECTION_TOKEN_LIMIT', 'Prompt exceeds the Flash input token limit', {
        status: 413,
      })
    }
    const maxTokens = maxTokensForSelection(adjacent.selectedText, adjacent.taskMode, prompt)
    const requestOptions = stableRequestOptions({ maxTokens, translationOptions })
    const cacheKey = cacheKeyFromInput({
      region: config.region,
      deploymentScope: config.workspaceId || 'unscoped',
      taskMode: adjacent.taskMode,
      requestOptions,
      contextText: adjacent.contextText,
      selectionInContext: adjacent.selectionInContext,
      selectedText: adjacent.selectedText,
      boundaryRoles: prepared.boundaryRoles,
    })
    const cached = getCacheStore()?.get(cacheKey)
    if (cached) {
      return {
        ...cached,
        cacheDisposition: 'memory-or-sqlite',
        cacheKey,
      }
    }

    return await singleFlight.subscribe(cacheKey, async ({ signal: flightSignal, markDispatched, hasSubscribers }) => {
      const stillCached = getCacheStore()?.get(cacheKey)
      if (stillCached) return { ...stillCached, cacheDisposition: 'coalesced-hit', cacheKey }

      const receipt = getLedger().reserve({
        inputTokens: FLASH_MAX_INPUT_TOKENS,
        outputTokens: maxTokens,
      })
      let dispatched = false
      let settled = false
      try {
        scheduler.admitGlobalDispatch(conservativeInputTokenEstimate(prompt) + maxTokens)
        const releaseSlot = await scheduler.acquireSlot()
        try {
          if (!hasSubscribers() && flightSignal.aborted) {
            getLedger().release(receipt.receiptId)
            serviceError('TRANSLATION_CANCELLED', 'Translation cancelled', { status: 499 })
          }
          getLedger().markDispatched(receipt.receiptId)
          markDispatched()
          dispatched = true
          const started = now()
          const result = await provider.translateSelection({
            selectedText: adjacent.selectedText,
            translationOptions,
            maxTokens,
          }, flightSignal)
          if (
            adjacent.taskMode === TASK_FRAGMENT
            && looksLikeExpandedFragment(adjacent.selectedText, result.translation)
          ) {
            getLedger().settle(receipt.receiptId, result.usage)
            settled = true
            serviceError('TRANSLATION_TEMPLATE_ECHO', 'Translation expanded beyond the selection', {
              status: 502,
              retryable: true,
              usage: result.usage,
            })
          }
          getLedger().settle(receipt.receiptId, result.usage)
          settled = true
          const record = {
            translation: result.translation,
            taskMode: adjacent.taskMode,
            resultKind: 'selection-translation',
            selectedText: adjacent.selectedText,
            contextCoverage: adjacent.contextCoverage,
            promptVersion: promptMeta().promptVersion,
          }
          try {
            getCacheStore()?.set(cacheKey, record)
          } catch {
            // The provider call is already settled. A cache miss must not rebill it.
          }
          logEvent({
            requestId,
            code: 'ok',
            durationMs: now() - started,
            tokensIn: result.usage.promptTokens,
            tokensOut: result.usage.completionTokens,
            costMicroCny: undefined,
            cache: 'miss',
          })
          consecutiveAuthFailures = 0
          return { ...record, cacheDisposition: 'miss', cacheKey }
        } finally {
          releaseSlot()
        }
      } catch (error) {
        if (error?.code === 'TRANSLATION_PROVIDER_AUTH') {
          consecutiveAuthFailures += 1
          if (consecutiveAuthFailures >= 3) providerCircuitUntil = now() + 60_000
        }
        if (!settled) {
          const usage = error?.usage
          if (dispatched && usage) getLedger().settle(receipt.receiptId, usage)
          else getLedger().release(receipt.receiptId)
        }
        throw error
      }
    }, signal)
  }

  async function translate({ body, context, signal, requestId = randomUUID(), userId }) {
    const started = now()
    const cap = capability(context)
    if (!cap.enabled) {
      serviceError('TRANSLATION_DISABLED', 'Paper translation is disabled', { status: 503 })
    }
    if (context?.authMode === 'enforced' && !context?.session?.userId) {
      serviceError('not_authenticated', 'not_authenticated', { status: 401 })
    }

    if (!body || body.schemaVersion !== REQUEST_SCHEMA) {
      serviceError('SELECTION_REQUEST_INVALID', 'Unknown translation request schema')
    }
    if (typeof body.paperId !== 'string' || !body.paperId || typeof body.sourceRevision !== 'string') {
      serviceError('SELECTION_REQUEST_INVALID', 'paperId and sourceRevision are required')
    }
    if ('prompt' in body || 'context' in body || 'provider' in body || 'model' in body || 'cacheKey' in body || 'userId' in body) {
      serviceError('SELECTION_REQUEST_INVALID', 'Client-supplied translation controls are not allowed')
    }

    scheduler.admitUser(userId || 'anonymous')

    let source
    try {
      source = resolveSource(body.paperId)
    } catch (error) {
      serviceError(
        error.code || 'SELECTION_SOURCE_UNAVAILABLE',
        'Canonical consumption is not available',
        { status: 409 },
      )
    }
    if (source.sourceRevision !== body.sourceRevision) {
      serviceError('SELECTION_SOURCE_MISMATCH', 'sourceRevision does not match', { status: 409 })
    }

    let prepared
    try {
      prepared = validateTranslateSegments(source, body.segments)
    } catch (error) {
      const status = error.code === 'SELECTION_LIMIT' ? 413 : 400
      serviceError(error.code || 'SELECTION_REQUEST_INVALID', error.message, { status })
    }

    const results = []
    const misses = []
    for (const item of prepared) {
      const adjacent = item.adjacent
      const translationOptions = buildTranslationOptions({
        taskMode: adjacent.taskMode,
        beforeSelection: adjacent.beforeSelection,
        selectedText: adjacent.selectedText,
        afterSelection: adjacent.afterSelection,
      })
      const prompt = `${adjacent.selectedText}\n${translationOptions.domains}`
      let maxTokens
      try {
        if (!promptFitsFlashInput(prompt)) {
          serviceError('SELECTION_TOKEN_LIMIT', 'Prompt exceeds the Flash input token limit', {
            status: 413,
          })
        }
        maxTokens = maxTokensForSelection(adjacent.selectedText, adjacent.taskMode, prompt)
      } catch (error) {
        serviceError(error.code || 'SELECTION_TOKEN_LIMIT', error.message, { status: 413 })
      }
      const cacheKey = cacheKeyFromInput({
        region: config.region,
        deploymentScope: config.workspaceId || 'unscoped',
        taskMode: adjacent.taskMode,
        requestOptions: stableRequestOptions({ maxTokens, translationOptions }),
        contextText: adjacent.contextText,
        selectionInContext: adjacent.selectionInContext,
        selectedText: adjacent.selectedText,
        boundaryRoles: item.boundaryRoles,
      })
      const cached = getCacheStore()?.get(cacheKey)
      if (cached) {
        results[item.segmentIndex] = {
          segmentIndex: item.segmentIndex,
          status: 'ok',
          taskMode: cached.taskMode,
          resultKind: 'selection-translation',
          selectedText: item.selectedText,
          translation: cached.translation,
          contextCoverage: cached.contextCoverage,
          cacheDisposition: 'hit',
        }
      } else {
        misses.push({ item, cacheKey, maxTokens })
      }
    }

    if (misses.length > 0 && !cap.canRequestNew) {
      const denial = denialFromReason(cap.reason)
      for (const miss of misses) {
        results[miss.item.segmentIndex] = {
          segmentIndex: miss.item.segmentIndex,
          status: 'error',
          code: denial.code,
          message: userMessageFor(denial.code),
          retryable: denial.retryable,
        }
      }
    } else if (misses.length > 0) {
      const reserveEach = misses.map((miss) => (
        { input: FLASH_MAX_INPUT_TOKENS, output: miss.maxTokens }
      ))
      const totalMicro = reserveEach.reduce((sum, item) => (
        sum + Math.ceil(item.input * 0.7) + Math.ceil(item.output * 1.95)
      ), 0)
      if (!getLedger().canReserve(totalMicro)) {
        for (const miss of misses) {
          results[miss.item.segmentIndex] = {
            segmentIndex: miss.item.segmentIndex,
            status: 'error',
            code: 'TRANSLATION_BUDGET_EXHAUSTED',
            message: userMessageFor('TRANSLATION_BUDGET_EXHAUSTED'),
            retryable: true,
          }
        }
      } else {
        await Promise.all(misses.map(async (miss) => {
          try {
            const translated = await translateOne(miss.item, { signal, userId, requestId })
            results[miss.item.segmentIndex] = {
              segmentIndex: miss.item.segmentIndex,
              status: 'ok',
              taskMode: translated.taskMode,
              resultKind: 'selection-translation',
              selectedText: miss.item.selectedText,
              translation: translated.translation,
              contextCoverage: translated.contextCoverage,
              cacheDisposition: translated.cacheDisposition,
            }
          } catch (error) {
            results[miss.item.segmentIndex] = {
              segmentIndex: miss.item.segmentIndex,
              status: 'error',
              code: error.code || 'TRANSLATION_FAILED',
              message: userMessageFor(error.code),
              retryable: Boolean(error.retryable),
            }
          }
        }))
      }
    }

    const ok = results.filter((item) => item?.status === 'ok')
    const failed = results.filter((item) => item?.status === 'error')
    logEvent({
      requestId,
      code: failed.length === 0 ? 'ok' : (ok.length ? 'partial' : (failed[0]?.code || 'error')),
      durationMs: now() - started,
      cache: misses.length === 0 ? 'hit' : 'mixed',
      provider: PROVIDER_ID,
      model: MODEL_ID,
      accessScope: ACCESS_SCOPE_PUBLIC,
    })

    if (ok.length === 0) {
      const first = failed[0]
      const status = statusForTranslationCode(first?.code)
      const error = new Error(first?.message || 'Translation failed')
      error.code = first?.code || 'TRANSLATION_FAILED'
      error.status = status
      error.retryable = Boolean(first?.retryable)
      error.body = {
        schemaVersion: RESPONSE_SCHEMA,
        requestId,
        sourceRevision: source.sourceRevision,
        promptVersion: PROMPT_VERSION,
        results,
        partial: false,
      }
      throw error
    }

    return {
      schemaVersion: RESPONSE_SCHEMA,
      requestId,
      sourceRevision: source.sourceRevision,
      promptVersion: PROMPT_VERSION,
      results,
      partial: failed.length > 0,
    }
  }

  return {
    config,
    capability,
    translate,
    get cacheStore() {
      return getCacheStore()
    },
    get ledger() {
      return getLedger()
    },
    singleFlight,
    scheduler,
    close() {
      getCacheStore()?.close()
      getLedger().close()
    },
  }
}

export { userMessageFor }
