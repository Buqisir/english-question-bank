#!/usr/bin/env node
/**
 * verify-h5d-completion-runner.mjs
 *
 * Covers cut H5-D — AI-completion transport + retry/abort/timeout + thinking-mode
 * fallback + provider dispatch extracted into server/ai-providers/completionRunner.mjs.
 *
 * Strategy: stub fetch (I8/I13 precedent — no network). Construct the runner with an
 * injected stub fetchImpl + injected config and exercise the real transport paths:
 *  - provider routing: DeepSeek vs local-Qwen by model (isLocalQwenModel / provider).
 *  - retry behavior: stub fails N times then succeeds → assert retry count + delay calls.
 *  - thinking-mode fallback: first (thinking=true) yields unparsable, fallback
 *    (thinking=false) yields a parseable JSON → assert fallbackUsed envelope.
 *  - envelope shape {data, rawText, firstMessageText, latencyMs, status, rawStatusText,
 *    parsed, thinkingModeUsed, fallbackUsed} for fixed stubbed responses.
 *  - flash-default preserved: normalizeDeepSeekModel('anything-unknown') === main's default.
 *  - Used-but-undefined guard (the H5-B lesson): every moved fn still referenced in
 *    api.mjs must be present in the re-import destructure, else runtime ReferenceError.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createCompletionRunner } from '../server/ai-providers/completionRunner.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

let passed = 0
function assert(name, condition, detail = '') {
  if (!condition) {
    throw new Error(`FAIL: ${name}${detail ? `\n  detail: ${detail}` : ''}`)
  }
  passed += 1
  console.log(`ok - ${name}`)
}

async function assertRejects(name, fn, pattern) {
  try {
    await fn()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    assert(name, pattern.test(message), `actual message: ${message}`)
    return
  }
  throw new Error(`FAIL: ${name}\n  expected rejection but resolved`)
}

// ----------------------------------------------------------------------------
// Config mirrors the api.mjs production injection (deterministic, no env reads).
// ----------------------------------------------------------------------------
const CONFIG = {
  DEEPSEEK_API_URL: 'https://api.deepseek.com/chat/completions',
  DEFAULT_DEEPSEEK_MODEL: 'deepseek-v4-flash',
  DEEPSEEK_HTTP_RETRY_COUNT: 1,
  DEEPSEEK_HTTP_RETRY_DELAY_MS: 0,
  DEEPSEEK_MODEL_ALIASES: {
    'deepseek-v4-pro': 'deepseek-v4-pro',
    'deepseek-v4-flash': 'deepseek-v4-flash',
  },
  LOCAL_QWEN_CHAT_API_URL: 'http://127.0.0.1:8791/v1/chat/completions',
  LOCAL_QWEN_CHAT_MODEL: 'qwen3-8b-local',
  LOCAL_QWEN_CHAT_TIMEOUT_MS: 90000,
  LOCAL_QWEN_PROVIDER: 'qwen-local',
}

function makeResponse({ ok = true, status = 200, body = '' }) {
  return {
    ok,
    status,
    text: async () => body,
  }
}

// A stub fetch that records calls and replays a scripted sequence of responses
// (or throws scripted network errors), per target URL.
function makeStubFetch(script) {
  const calls = []
  let i = 0
  const fetchImpl = async (url, init) => {
    calls.push({ url, init })
    const step = script[i] ?? script[script.length - 1]
    i += 1
    if (step.throw) throw new Error(step.throw)
    return makeResponse(step)
  }
  fetchImpl.calls = calls
  return fetchImpl
}

function makeRunner(fetchImpl) {
  return createCompletionRunner({
    ...CONFIG,
    fetchImpl,
    // elapsedMs is injected exactly as api.mjs does (Date.now() - startAt).
    elapsedMs: (startAt) => Date.now() - startAt,
  })
}

// delay() is internal to the runner; with DEEPSEEK_HTTP_RETRY_DELAY_MS=0 the retry path
// is instant, so retry counts are asserted via fetch.calls (the observable side effect).

async function run() {
  // ========================================================================
  // 1. Re-import surface / used-but-undefined guard (the H5-B lesson)
  // ========================================================================
  const apiSource = readFileSync(path.join(repoRoot, 'server/api.mjs'), 'utf8')

  // The full move-set returned by the factory.
  const moveSet = [
    'buildDeepSeekRequestOptions',
    'normalizeDeepSeekModel',
    'isLocalQwenModel',
    'normalizeAiChatModel',
    'describeAiKeySource',
    'describeKeySource',
    'delay',
    'callDeepSeekCompletion',
    'buildLocalQwenRequestOptions',
    'callLocalQwenCompletion',
    'callDeepSeekWithFallback',
  ]

  const runner = makeRunner(makeStubFetch([{ ok: true, body: '{}' }]))
  for (const name of moveSet) {
    assert(`factory exports ${name}`, typeof runner[name] === 'function')
  }

  // Parse the destructure block in api.mjs: `const { ... } = completionRunner`.
  const destructureMatch = apiSource.match(/const\s*\{([^}]*)\}\s*=\s*completionRunner/)
  assert('api.mjs destructures completionRunner', Boolean(destructureMatch))
  const destructured = new Set(
    destructureMatch[1]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  )

  // For every moved fn, find references in api.mjs OUTSIDE the destructure line.
  const apiWithoutDestructure = apiSource.replace(destructureMatch[0], '')
  for (const name of moveSet) {
    const re = new RegExp(`\\b${name}\\b`)
    const referenced = re.test(apiWithoutDestructure)
    if (referenced) {
      // Used in api.mjs → MUST be destructured, else ReferenceError at runtime.
      assert(`used-but-undefined guard: ${name} is destructured`, destructured.has(name), `${name} is referenced in api.mjs but missing from the re-import destructure`)
    } else {
      // Not referenced → must NOT be in the destructure (no dead bindings expected).
      assert(`unused fn ${name} not in destructure`, !destructured.has(name))
    }
  }
  // Concretely: the four transport entry points must be destructured.
  for (const name of ['normalizeDeepSeekModel', 'describeKeySource', 'callLocalQwenCompletion', 'callDeepSeekWithFallback']) {
    assert(`required re-import: ${name}`, destructured.has(name))
  }

  // ========================================================================
  // 2. flash-default preserved (capture from main, NOT the working tree).
  // ========================================================================
  const { execFileSync } = await import('node:child_process')
  const mainApi = execFileSync('git', ['show', 'main:server/api.mjs'], { cwd: repoRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  const mainDefaultMatch = mainApi.match(/const DEFAULT_DEEPSEEK_MODEL = '([^']+)'/)
  assert('main DEFAULT_DEEPSEEK_MODEL captured', Boolean(mainDefaultMatch))
  const mainFlashDefault = mainDefaultMatch[1]
  assert('flash-default constant is flash on main', mainFlashDefault === 'deepseek-v4-flash')
  assert(
    "normalizeDeepSeekModel('anything-unknown') === main flash-default",
    runner.normalizeDeepSeekModel('anything-unknown') === mainFlashDefault,
    `got ${runner.normalizeDeepSeekModel('anything-unknown')}`,
  )
  assert("normalizeDeepSeekModel('') === flash-default", runner.normalizeDeepSeekModel('') === mainFlashDefault)
  // Alias map key is 'deepseek-v4-pro'; normalization lowercases, strips whitespace and maps _→-.
  assert("normalizeDeepSeekModel('DeepSeek-V4-Pro') aliases to pro", runner.normalizeDeepSeekModel('DeepSeek-V4-Pro') === 'deepseek-v4-pro')
  assert("normalizeDeepSeekModel('deepseek_v4_pro') aliases to pro", runner.normalizeDeepSeekModel('deepseek_v4_pro') === 'deepseek-v4-pro')

  // ========================================================================
  // 3. provider routing: isLocalQwenModel + normalizeAiChatModel + key source.
  // ========================================================================
  assert('isLocalQwenModel qwen3-8b-local', runner.isLocalQwenModel('qwen3-8b-local') === true)
  assert('isLocalQwenModel local-qwen', runner.isLocalQwenModel('LOCAL-QWEN') === true)
  assert('isLocalQwenModel deepseek false', runner.isLocalQwenModel('deepseek-v4-flash') === false)
  assert('normalizeAiChatModel local → LOCAL_QWEN_CHAT_MODEL', runner.normalizeAiChatModel('qwen3-8b') === CONFIG.LOCAL_QWEN_CHAT_MODEL)
  assert('normalizeAiChatModel cloud → flash-default', runner.normalizeAiChatModel('whatever') === 'deepseek-v4-flash')
  assert('describeAiKeySource local', JSON.stringify(runner.describeAiKeySource('k', 'local-qwen')) === JSON.stringify({ source: 'local', provider: 'qwen-local' }))
  assert('describeKeySource client', runner.describeKeySource('sk-abc').source === 'client')
  assert('describeKeySource env', runner.describeKeySource('').source === 'env')

  // ========================================================================
  // 4. Routing by provider: LOCAL_QWEN_PROVIDER hits the local URL; otherwise DeepSeek.
  // ========================================================================
  {
    const deepseekFetch = makeStubFetch([{ ok: true, body: JSON.stringify({ choices: [{ message: { content: '{"verdict":"x"}' } }] }) }])
    const r = makeRunner(deepseekFetch)
    await r.callDeepSeekWithFallback({ apiKey: 'k', model: 'deepseek-v4-flash', messages: [], maxTokens: 10 })
    assert('DeepSeek routing hits DeepSeek URL', deepseekFetch.calls[0].url === CONFIG.DEEPSEEK_API_URL)

    const qwenFetch = makeStubFetch([{ ok: true, body: JSON.stringify({ choices: [{ message: { content: '{"ok":1}' } }] }) }])
    const rq = makeRunner(qwenFetch)
    await rq.callDeepSeekWithFallback({ provider: CONFIG.LOCAL_QWEN_PROVIDER, model: 'qwen3-8b-local', messages: [{ role: 'user', content: 'hi' }], maxTokens: 10 })
    assert('local-Qwen routing hits local URL', qwenFetch.calls[0].url === CONFIG.LOCAL_QWEN_CHAT_API_URL)
    // local-Qwen request applies the /no_think prefix to user messages.
    const sentBody = JSON.parse(qwenFetch.calls[0].init.body)
    assert('local-Qwen prefixes /no_think on user content', sentBody.messages[0].content === '/no_think\nhi')
    assert('local-Qwen stream:false', sentBody.stream === false)
  }

  // ========================================================================
  // 5. Retry behavior: stub throws (network error) once, then succeeds.
  //    DEEPSEEK_HTTP_RETRY_COUNT=1 → maxAttempts=2 → exactly 2 fetch calls.
  // ========================================================================
  {
    const retryFetch = makeStubFetch([
      { throw: 'ECONNRESET' },
      { ok: true, body: JSON.stringify({ choices: [{ message: { content: '{"verdict":"correct"}' } }] }) },
    ])
    const r = makeRunner(retryFetch)
    // Spy on delay by wrapping the exported one is not possible (internal); assert via
    // call count: the retry path issues a second fetch only after a delay() resolves.
    const result = await r.callDeepSeekWithFallback({ apiKey: 'k', model: 'deepseek-v4-flash', messages: [], maxTokens: 10 })
    assert('retry: exactly 2 fetch attempts (1 fail + 1 success)', retryFetch.calls.length === 2)
    assert('retry: eventually parses success envelope', result.parsed && typeof result.parsed === 'object')
  }

  // Retry also fires on non-JSON body (data == null) before giving up.
  {
    const nonJsonFetch = makeStubFetch([
      { ok: true, body: 'not json at all' },
      { ok: true, body: JSON.stringify({ choices: [{ message: { content: '{"verdict":"correct"}' } }] }) },
    ])
    const r = makeRunner(nonJsonFetch)
    const result = await r.callDeepSeekWithFallback({ apiKey: 'k', model: 'deepseek-v4-flash', messages: [], maxTokens: 10, expectedResponseSchema: 'verify' })
    assert('retry on non-JSON body then success', nonJsonFetch.calls.length === 2 && Boolean(result.parsed))
  }

  // Exhausted retries on persistent network error → rejects with the underlying error.
  await assertRejects(
    'persistent network error rejects after exhausting retries',
    async () => {
      const r = makeRunner(makeStubFetch([{ throw: 'ENETDOWN' }, { throw: 'ENETDOWN' }]))
      await r.callDeepSeekWithFallback({ apiKey: 'k', model: 'deepseek-v4-flash', messages: [], maxTokens: 10 })
    },
    /ENETDOWN/,
  )

  // HTTP non-2xx (no retry on !ok) → throws the DeepSeek error envelope.
  await assertRejects(
    'HTTP 500 surfaces DeepSeek API error',
    async () => {
      const r = makeRunner(makeStubFetch([{ ok: false, status: 500, body: 'server boom' }]))
      await r.callDeepSeekWithFallback({ apiKey: 'k', model: 'deepseek-v4-flash', messages: [], maxTokens: 10 })
    },
    /DeepSeek API 返回错误 500/,
  )

  // ========================================================================
  // 6. Thinking-mode fallback: thinking=true yields unparsable; the fallback
  //    call with thinking=false yields parseable JSON → fallbackUsed=true.
  // ========================================================================
  {
    const fallbackFetch = makeStubFetch([
      // attempt 1 (thinking=true): valid HTTP+JSON envelope but message has NO json → unparsable
      { ok: true, body: JSON.stringify({ choices: [{ message: { content: 'thinking out loud, no json here' } }] }) },
      // fallback (thinking=false): parseable JSON
      { ok: true, body: JSON.stringify({ choices: [{ message: { content: '{"verdict":"correct"}' } }] }) },
    ])
    const r = makeRunner(fallbackFetch)
    const result = await r.callDeepSeekWithFallback({
      apiKey: 'k',
      model: 'deepseek-v4-flash',
      messages: [],
      maxTokens: 10,
      thinkingMode: true,
      expectedResponseSchema: 'verify',
    })
    assert('fallback: two completion calls issued (thinking then non-thinking)', fallbackFetch.calls.length === 2)
    // First request had thinking enabled, fallback disabled.
    const firstBody = JSON.parse(fallbackFetch.calls[0].init.body)
    const secondBody = JSON.parse(fallbackFetch.calls[1].init.body)
    assert('fallback: first request thinking enabled', firstBody.thinking.type === 'enabled')
    assert('fallback: fallback request thinking disabled', secondBody.thinking.type === 'disabled')
    assert('fallback: fallbackUsed true', result.fallbackUsed === true)
    assert('fallback: thinkingModeUsed reflects requested mode', result.thinkingModeUsed === true)
    assert('fallback: parsed verdict surfaces', result.parsed && result.parsed.verdict === 'correct')
  }

  // local-Qwen never triggers the thinking fallback (provider gate).
  await assertRejects(
    'local-Qwen does not fallback; unparsable rejects',
    async () => {
      const qf = makeStubFetch([{ ok: true, body: JSON.stringify({ choices: [{ message: { content: 'no json' } }] }) }])
      const r = makeRunner(qf)
      await r.callDeepSeekWithFallback({
        provider: CONFIG.LOCAL_QWEN_PROVIDER,
        model: 'qwen3-8b-local',
        messages: [{ role: 'user', content: 'hi' }],
        maxTokens: 10,
        thinkingMode: true,
        expectedResponseSchema: 'verify',
      })
    },
    /本地 Qwen 返回结果不符合预期 JSON/,
  )

  // ========================================================================
  // 7. Envelope shape for a fixed stubbed DeepSeek response.
  // ========================================================================
  {
    const okFetch = makeStubFetch([{ ok: true, status: 200, body: JSON.stringify({ choices: [{ message: { content: '{"verdict":"answer_wrong"}' } }] }) }])
    const r = makeRunner(okFetch)
    const result = await r.callDeepSeekWithFallback({ apiKey: 'k', model: 'deepseek-v4-flash', messages: [], maxTokens: 10, expectedResponseSchema: 'verify' })
    for (const key of ['data', 'rawText', 'firstMessageText', 'latencyMs', 'status', 'rawStatusText', 'parsed', 'thinkingModeUsed', 'fallbackUsed']) {
      assert(`envelope has key ${key}`, key in result)
    }
    assert('envelope status 200', result.status === 200)
    assert('envelope fallbackUsed false on first-try success', result.fallbackUsed === false)
    assert('envelope thinkingModeUsed false (not requested)', result.thinkingModeUsed === false)
    assert('envelope latencyMs is a number', typeof result.latencyMs === 'number')
    assert('envelope parsed verdict', result.parsed.verdict === 'answer_wrong')
  }

  // buildDeepSeekRequestOptions / buildLocalQwenRequestOptions request shaping.
  {
    const r = makeRunner(makeStubFetch([{ ok: true, body: '{}' }]))
    const ds = r.buildDeepSeekRequestOptions({ model: 'm', messages: [], maxTokens: 5, thinkingMode: true, responseFormat: 'json_object' })
    assert('buildDeepSeekRequestOptions thinking enabled + reasoning_effort high', ds.thinking.type === 'enabled' && ds.reasoning_effort === 'high')
    assert('buildDeepSeekRequestOptions json_object response_format', ds.response_format.type === 'json_object')
    const ds2 = r.buildDeepSeekRequestOptions({ model: 'm', messages: [], maxTokens: 5, thinkingMode: false, temperature: 0.3 })
    assert('buildDeepSeekRequestOptions non-thinking carries temperature', ds2.temperature === 0.3 && ds2.thinking.type === 'disabled')
  }

  console.log(`\nAll ${passed} H5-D completion-runner checks passed.`)
}

run().catch((error) => {
  console.error(error.message || error)
  process.exit(1)
})
