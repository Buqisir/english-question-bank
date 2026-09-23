#!/usr/bin/env node
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createTranslationCacheStore } from '../server/paper-translation/cacheStore.mjs'
import { createSingleFlight } from '../server/paper-translation/singleFlight.mjs'
import { costMicroCny, createUsageLedger, initializeUsageLedger } from '../server/paper-translation/usageLedger.mjs'
import { createPaperTranslationRuntime, userMessageFor } from '../server/paper-translation/translateService.mjs'
import { createTranslationScheduler } from '../server/paper-translation/scheduler.mjs'
import { FLASH_MAX_INPUT_TOKENS, INPUT_YUAN_PER_MILLION, OUTPUT_YUAN_PER_MILLION } from '../shared/paper-selection/constants.mjs'

const temp = mkdtempSync(path.join(tmpdir(), 'eqb-paper-translation-cache-'))
let passed = 0
let failed = 0
function check(name, condition, details = '') {
  if (condition) {
    passed += 1
    console.log(`PASS ${name}`)
  } else {
    failed += 1
    console.error(`FAIL ${name}${details ? `\n  ${details}` : ''}`)
  }
}

const EXAMPLE = 'The road was closed. They had to address the problem. Work began that afternoon.'
const source = {
  paperId: 'paper-example',
  sourceRevision: 'sha256:example-source-revision',
  streams: [{
    streamId: 'group-example/passage/body',
    text: EXAMPLE,
    role: 'passage-body',
    groupId: 'group-example',
    leaves: [{ kind: 'paragraph', id: 'p1', start: 0, end: EXAMPLE.length }],
  }],
}

function enabledEnv(overrides = {}) {
  const dataDir = overrides.QUESTION_BANK_PAPER_TRANSLATION_DATA_DIR
    || path.join(temp, 'data', String(enabledEnv.seq = (enabledEnv.seq || 0) + 1))
  initializeUsageLedger({ filePath: path.join(dataDir, 'translation-usage.sqlite') })
  return {
    QUESTION_BANK_PAPER_TRANSLATION_ENABLED: '1',
    QUESTION_BANK_PAPER_TRANSLATION_ALLOW_OPEN_AUTH: '1',
    DASHSCOPE_API_KEY: 'test-key-not-real',
    QWEN_MT_REGION: 'cn-beijing',
    QWEN_MT_WORKSPACE_ID: 'workspace1',
    QWEN_MT_MONTHLY_BUDGET_CNY: '10',
    QUESTION_BANK_PAPER_TRANSLATION_DATA_DIR: dataDir,
    ...overrides,
  }
}

const requestBody = {
  schemaVersion: 'paper-selection-request-v1',
  paperId: 'paper-example',
  sourceRevision: source.sourceRevision,
  segments: [{
    streamId: 'group-example/passage/body',
    start: 33,
    end: 40,
    selectedText: 'address',
  }],
}

{
  const cachePath = path.join(temp, 'cache.sqlite')
  const store = createTranslationCacheStore({ filePath: cachePath })
  store.set('abc', { translation: '解决', taskMode: 'contextual-fragment' })
  check('memory cache returns the stored payload', store.get('abc').translation === '解决')
  store.close()
  const reopened = createTranslationCacheStore({ filePath: cachePath })
  check('sqlite cache survives process restart', reopened.get('abc').translation === '解决')
  reopened.close()
}

{
  const usagePath = path.join(temp, 'usage.sqlite')
  initializeUsageLedger({ filePath: usagePath })
  const ledger = createUsageLedger({ filePath: usagePath, monthlyBudgetCny: 10 })
  const receipt = ledger.reserve({ inputTokens: FLASH_MAX_INPUT_TOKENS, outputTokens: 256 })
  ledger.markDispatched(receipt.receiptId)
  ledger.settle(receipt.receiptId, { promptTokens: 40, completionTokens: 6 })
  const used = ledger.usedMicro()
  ledger.settle(receipt.receiptId, null)
  check('usage ledger records settled cost', used > 0 && used < receipt.reservedMicroCny)
  check('a later empty settle does not replace the real cost with the reserve', ledger.usedMicro() === used)
  ledger.close()
  const reopened = createUsageLedger({ filePath: usagePath, monthlyBudgetCny: 10 })
  check('clearing result cache is not required to keep the budget ledger', reopened.usedMicro() === used)
  reopened.close()
}

{
  const broken = path.join(temp, 'broken-usage.sqlite')
  writeFileSync(broken, 'not a sqlite database')
  try {
    createUsageLedger({ filePath: broken, monthlyBudgetCny: 10 })
    check('corrupt usage ledger fails closed', false)
  } catch (error) {
    check('corrupt usage ledger fails closed', error.code === 'TRANSLATION_LEDGER_UNAVAILABLE')
  }
}

{
  let calls = 0
  const inflight = createSingleFlight()
  const work = () => new Promise((resolve) => {
    calls += 1
    setTimeout(() => resolve('ok'), 20)
  })
  const results = await Promise.all(Array.from({ length: 30 }, () => inflight.subscribe('k', work)))
  check('30 subscribers on the same key dispatch work once', calls === 1 && results.every((item) => item === 'ok'))
}

{
  let calls = 0
  const inflight = createSingleFlight()
  const work = ({ signal }) => new Promise((resolve, reject) => {
    calls += 1
    signal.addEventListener('abort', () => reject(new Error('aborted')))
    setTimeout(() => resolve('kept'), 30)
  })
  const a = new AbortController()
  const first = inflight.subscribe('k2', work, a.signal)
  const second = inflight.subscribe('k2', work)
  a.abort()
  try {
    await first
    check('cancelled subscriber rejects', false)
  } catch {
    check('cancelled subscriber rejects', true)
  }
  check('remaining subscriber still receives the result', (await second) === 'kept' && calls === 1)
}

{
  let providerCalls = 0
  const runtime = createPaperTranslationRuntime({
    rootDir: temp,
    env: enabledEnv(),
    loadSource: () => source,
    adapter: {
      async translateSelection() {
        providerCalls += 1
        return {
          translation: '处理',
          finishReason: 'stop',
          usage: { promptTokens: 20, completionTokens: 2, totalTokens: 22 },
          model: 'qwen-mt-flash',
        }
      },
    },
  })
  const context = { authMode: 'open' }
  const first = await runtime.translate({ body: requestBody, context, userId: 'user-a' })
  const second = await runtime.translate({ body: requestBody, context, userId: 'user-b' })
  check('shared public-paper cache is reused across users', providerCalls === 1 && first.results[0].translation === '处理')
  check('second user is a cache hit', second.results[0].cacheDisposition === 'hit')
  runtime.close()
}

{
  let providerCalls = 0
  const runtime = createPaperTranslationRuntime({
    rootDir: path.join(temp, 'off'),
    env: enabledEnv({ QUESTION_BANK_PAPER_TRANSLATION_ENABLED: '0' }),
    loadSource: () => source,
    adapter: {
      async translateSelection() {
        providerCalls += 1
        throw new Error('should not run')
      },
    },
  })
  try {
    await runtime.translate({ body: requestBody, context: { authMode: 'open' }, userId: 'user-a' })
    check('feature off does not translate', false)
  } catch (error) {
    check('feature off does not translate', error.code === 'TRANSLATION_DISABLED' && providerCalls === 0)
  }
  runtime.close()
}

{
  let providerCalls = 0
  const runtime = createPaperTranslationRuntime({
    rootDir: path.join(temp, 'nokey'),
    env: enabledEnv({ DASHSCOPE_API_KEY: '' }),
    loadSource: () => source,
    adapter: {
      async translateSelection() {
        providerCalls += 1
        throw new Error('should not run')
      },
    },
  })
  const cap = runtime.capability({ authMode: 'open' })
  check('missing key reports keyAvailable false without leaking a secret', (
    cap.keyAvailable === false && !JSON.stringify(cap).includes('test-key')
  ))
  const result = await runtime.translate({ body: requestBody, context: { authMode: 'open' }, userId: 'user-a' })
    .then((value) => value, (error) => error)
  check('missing key does not dispatch upstream', providerCalls === 0)
  check('missing key says translation is unavailable, not that the budget is gone', (
    (result.code === 'TRANSLATION_UNAVAILABLE' || result.body?.results?.[0]?.code === 'TRANSLATION_UNAVAILABLE')
    && (result.message === '翻译暂不可用' || result.body?.results?.[0]?.message === '翻译暂不可用')
    && result.message !== '本月翻译额度已用完，已缓存的结果仍可查看'
  ))
  runtime.close()
}

{
  let providerCalls = 0
  const runtime = createPaperTranslationRuntime({
    rootDir: path.join(temp, 'trunc'),
    env: enabledEnv(),
    loadSource: () => source,
    adapter: {
      async translateSelection() {
        providerCalls += 1
        const error = new Error('truncated')
        error.code = 'TRANSLATION_TRUNCATED'
        error.status = 502
        throw error
      },
    },
  })
  try {
    await runtime.translate({ body: requestBody, context: { authMode: 'open' }, userId: 'user-a' })
    check('truncated output is not a success', false)
  } catch (error) {
    check('truncated output does not become a successful cache entry', error.code === 'TRANSLATION_TRUNCATED' || error.body?.results?.[0]?.code === 'TRANSLATION_TRUNCATED')
  }
  try {
    await runtime.translate({ body: requestBody, context: { authMode: 'open' }, userId: 'user-a' })
  } catch {
    // still miss
  }
  check('failed translations are retried rather than cached as success', providerCalls === 2)
  runtime.close()
}

{
  let t = 0
  const scheduler = createTranslationScheduler({ now: () => t })
  scheduler.admitGlobalDispatch(20_000)
  let secondCode = null
  try {
    scheduler.admitGlobalDispatch(20_000)
  } catch (error) {
    secondCode = error.code
  }
  check('a full reserved-TPM window rejects the next dispatch', secondCode === 'TRANSLATION_GLOBAL_RATE_LIMIT')
  t = 60_001
  let expiredCode = null
  try {
    scheduler.admitGlobalDispatch(20_000)
  } catch (error) {
    expiredCode = error.code
  }
  check('reserved TPM expires after one minute', expiredCode == null)
}

{
  let providerCalls = 0
  const runtime = createPaperTranslationRuntime({
    rootDir: path.join(temp, 'rpm'),
    env: enabledEnv(),
    loadSource: () => source,
    adapter: {
      async translateSelection(input) {
        providerCalls += 1
        return {
          translation: `「${input.selectedText}」`,
          finishReason: 'stop',
          usage: { promptTokens: 40, completionTokens: 2, totalTokens: 42 },
          model: 'qwen-mt-flash',
        }
      },
    },
  })
  const words = ['road', 'closed', 'They', 'problem', 'began']
  const codes = []
  for (const word of words) {
    const start = EXAMPLE.indexOf(word)
    const result = await runtime.translate({
      body: {
        schemaVersion: 'paper-selection-request-v1',
        paperId: 'paper-example',
        sourceRevision: source.sourceRevision,
        segments: [{
          streamId: 'group-example/passage/body',
          start,
          end: start + word.length,
          selectedText: word,
        }],
      },
      context: { authMode: 'open' },
      userId: 'user-a',
    }).then((value) => value, (error) => error)
    codes.push(result.code || result.results?.[0]?.status || 'ok')
  }
  check(
    'five short selections in one minute are not globally rate-limited',
    providerCalls === 5 && codes.every((code) => code === 'ok'),
    codes.join(','),
  )
  runtime.close()
}

{
  const runtime = createPaperTranslationRuntime({
    rootDir: path.join(temp, 'expand'),
    env: enabledEnv(),
    loadSource: () => source,
    adapter: {
      async translateSelection() {
        return {
          translation: '来自布宜诺斯艾利斯大学的研究人员成功地利用机器人导师，教会了南美洲的一种小型鸟类。',
          finishReason: 'stop',
          usage: { promptTokens: 40, completionTokens: 40, totalTokens: 80 },
          model: 'qwen-mt-flash',
        }
      },
    },
  })
  const start = EXAMPLE.indexOf('road')
  const result = await runtime.translate({
    body: {
      schemaVersion: 'paper-selection-request-v1',
      paperId: 'paper-example',
      sourceRevision: source.sourceRevision,
      segments: [{
        streamId: 'group-example/passage/body',
        start,
        end: start + 'road'.length,
        selectedText: 'road',
      }],
    },
    context: { authMode: 'open' },
    userId: 'user-a',
  }).then((value) => value, (error) => error)
  check(
    'a fragment that returns a whole-paragraph translation is rejected',
    result.code === 'TRANSLATION_TEMPLATE_ECHO' || result.results?.[0]?.code === 'TRANSLATION_TEMPLATE_ECHO',
    result.code || result.results?.[0]?.code || 'none',
  )
  const actualMicro = costMicroCny(40, INPUT_YUAN_PER_MILLION) + costMicroCny(40, OUTPUT_YUAN_PER_MILLION)
  check(
    'a rejected fragment is billed at actual usage, not the 8192 reserve',
    runtime.ledger.usedMicro() === actualMicro,
    `used=${runtime.ledger.usedMicro()} actual=${actualMicro}`,
  )
  runtime.close()
}
check('a broken ledger is not described as an empty monthly budget', userMessageFor('TRANSLATION_LEDGER_UNAVAILABLE') === '翻译暂不可用')
check('an unreachable service is not described as a bad translation', userMessageFor('TRANSLATION_UPSTREAM_UNREACHABLE') === '服务没连上，请重试')

await import('./verify-paper-translation-repair.mjs')

rmSync(temp, { recursive: true, force: true })
if (failed > 0) {
  console.error(`FAILED ${failed}  passed ${passed}`)
  process.exit(1)
}
console.log(`OK ${passed}`)
