#!/usr/bin/env node
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createPaperTranslationRoutes, createPaperTranslationRuntime } from '../server/paper-translation/routes.mjs'
import { createQwenMtFlashAdapter } from '../server/paper-translation/qwenMtFlash.mjs'
import { MODEL_ID, TRANSLATION_OPTIONS } from '../shared/paper-selection/constants.mjs'

const temp = mkdtempSync(path.join(tmpdir(), 'eqb-paper-translation-routes-'))
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
  return {
    QUESTION_BANK_PAPER_TRANSLATION_ENABLED: '1',
    QUESTION_BANK_PAPER_TRANSLATION_ALLOW_OPEN_AUTH: '1',
    DASHSCOPE_API_KEY: 'super-secret-key-value',
    QWEN_MT_REGION: 'cn-beijing',
    QWEN_MT_WORKSPACE_ID: 'workspace1',
    QWEN_MT_MONTHLY_BUDGET_CNY: '10',
    QUESTION_BANK_PAPER_TRANSLATION_DATA_DIR: path.join(temp, 'data'),
    QUESTION_BANK_PUBLIC_ORIGIN: 'https://eqbank.cc',
    ...overrides,
  }
}

function createResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    parsed: null,
    writeHead(status, headers) {
      this.statusCode = status
      this.headers = headers
    },
    end(text) {
      this.body = text
      this.parsed = text ? JSON.parse(text) : null
    },
  }
}

function routeBy(routes, method, pathname) {
  return routes.find((route) => route.method === method && pathname.match(route.pattern))
}

let capturedUpstream = []
function stubAdapter() {
  capturedUpstream = []
  return {
    async translateSelection(input) {
      capturedUpstream.push(input)
      return {
        translation: '处理',
        finishReason: 'stop',
        usage: { promptTokens: 24, completionTokens: 2, totalTokens: 26 },
        model: MODEL_ID,
      }
    },
  }
}

function makeContext(runtime, overrides = {}) {
  return {
    authMode: 'open',
    session: null,
    resolveDataUserId() { return 'local' },
    paperTranslation: runtime,
    ...overrides,
  }
}

function makeRequest({ origin = 'http://127.0.0.1:5173', contentType = 'application/json', body }) {
  const payload = Buffer.from(JSON.stringify(body || {}))
  return {
    headers: {
      origin,
      host: '127.0.0.1:5173',
      'content-type': contentType,
    },
    on(event, handler) {
      if (event === 'data') handler(payload)
      if (event === 'end') handler()
    },
    destroy() {},
  }
}

const routes = createPaperTranslationRoutes()
check('GET status is defined', Boolean(routeBy(routes, 'GET', '/api/paper-translation/status')))
check('POST translate is defined', Boolean(routeBy(routes, 'POST', '/api/paper-translation/translate')))

{
  const runtime = createPaperTranslationRuntime({
    rootDir: temp,
    env: enabledEnv(),
    loadSource: () => source,
    adapter: stubAdapter(),
  })
  const response = createResponse()
  await routeBy(routes, 'GET', '/api/paper-translation/status').handle({
    response,
    context: makeContext(runtime),
  })
  check('status is private no-store', response.headers['cache-control'] === 'private, no-store')
  check('status exposes capability booleans only', (
    response.parsed.enabled === true
    && response.parsed.keyAvailable === true
    && response.parsed.canRequestNew === true
    && !JSON.stringify(response.parsed).includes('super-secret-key-value')
    && !JSON.stringify(response.parsed).includes('sk-')
  ))
  runtime.close()
}

{
  const runtime = createPaperTranslationRuntime({
    rootDir: path.join(temp, 'translate'),
    env: enabledEnv(),
    loadSource: () => source,
    adapter: stubAdapter(),
  })
  const response = createResponse()
  await routeBy(routes, 'POST', '/api/paper-translation/translate').handle({
    request: makeRequest({
      body: {
        schemaVersion: 'paper-selection-request-v1',
        paperId: 'paper-example',
        sourceRevision: source.sourceRevision,
        segments: [{
          streamId: 'group-example/passage/body',
          start: 33,
          end: 40,
          selectedText: 'address',
        }],
      },
    }),
    response,
    context: makeContext(runtime),
  })
  check('valid selection translates', response.statusCode === 200 && response.parsed.results[0].translation === '处理')
  check('upstream request translates the selected text with a domains hint', (
    capturedUpstream.length === 1
    && capturedUpstream[0].selectedText === 'address'
    && typeof capturedUpstream[0].translationOptions?.domains === 'string'
    && capturedUpstream[0].translationOptions.domains.includes('Selected: address')
  ))
  runtime.close()
}

{
  const runtime = createPaperTranslationRuntime({
    rootDir: path.join(temp, 'csrf'),
    env: enabledEnv(),
    loadSource: () => source,
    adapter: stubAdapter(),
  })
  const response = createResponse()
  await routeBy(routes, 'POST', '/api/paper-translation/translate').handle({
    request: makeRequest({
      origin: 'https://evil.example',
      body: {
        schemaVersion: 'paper-selection-request-v1',
        paperId: 'paper-example',
        sourceRevision: source.sourceRevision,
        segments: [{ streamId: 'group-example/passage/body', start: 33, end: 40, selectedText: 'address' }],
      },
    }),
    response,
    context: makeContext(runtime),
  })
  check('cross-origin POST is rejected before provider dispatch', response.statusCode === 403 && capturedUpstream.length === 0)
  runtime.close()
}

{
  const runtime = createPaperTranslationRuntime({
    rootDir: path.join(temp, 'tamper'),
    env: enabledEnv(),
    loadSource: () => source,
    adapter: stubAdapter(),
  })
  const response = createResponse()
  await routeBy(routes, 'POST', '/api/paper-translation/translate').handle({
    request: makeRequest({
      body: {
        schemaVersion: 'paper-selection-request-v1',
        paperId: 'paper-example',
        sourceRevision: 'sha256:tampered',
        segments: [{ streamId: 'group-example/passage/body', start: 33, end: 40, selectedText: 'address' }],
      },
    }),
    response,
    context: makeContext(runtime),
  })
  check('tampered sourceRevision is 409 with zero upstream', response.statusCode === 409 && capturedUpstream.length === 0)
  runtime.close()
}

{
  const runtime = createPaperTranslationRuntime({
    rootDir: path.join(temp, 'proxy'),
    env: enabledEnv(),
    loadSource: () => source,
    adapter: stubAdapter(),
  })
  const response = createResponse()
  await routeBy(routes, 'POST', '/api/paper-translation/translate').handle({
    request: makeRequest({
      body: {
        schemaVersion: 'paper-selection-request-v1',
        paperId: 'paper-example',
        sourceRevision: source.sourceRevision,
        prompt: 'translate anything',
        segments: [{ streamId: 'group-example/passage/body', start: 33, end: 40, selectedText: 'address' }],
      },
    }),
    response,
    context: makeContext(runtime),
  })
  check('client-supplied prompt cannot turn the route into a generic proxy', response.statusCode === 400 && capturedUpstream.length === 0)
  runtime.close()
}

{
  const runtime = createPaperTranslationRuntime({
    rootDir: path.join(temp, 'auth'),
    env: enabledEnv({ QUESTION_BANK_PAPER_TRANSLATION_ALLOW_OPEN_AUTH: '' }),
    loadSource: () => source,
    adapter: stubAdapter(),
  })
  const cap = runtime.capability({ authMode: 'open' })
  check('bootstrap-open does not get paid proxy rights by default', cap.canRequestNew === false && cap.reason === 'auth')
  runtime.close()
}

{
  let sent
  const adapter = createQwenMtFlashAdapter({
    endpoint: 'https://workspace1.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions',
    apiKey: 'super-secret-key-value',
    fetchImpl: async (url, init) => {
      sent = { url, init }
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        async json() {
          return {
            model: MODEL_ID,
            choices: [{ message: { content: '处理' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 12, completion_tokens: 2, total_tokens: 14 },
          }
        },
      }
    },
  })
  const result = await adapter.translateSelection({
    selectedText: 'address',
    maxTokens: 256,
    translationOptions: {
      source_lang: TRANSLATION_OPTIONS.source_lang,
      target_lang: TRANSLATION_OPTIONS.target_lang,
      domains: 'High-school English exam paper. Selected: address',
    },
  })
  const body = JSON.parse(sent.init.body)
  check('Flash request uses the official workspace endpoint', sent.url.endsWith('/compatible-mode/v1/chat/completions'))
  check('Flash user message is the selected text, not the instruction prompt', (
    body.messages.length === 1
    && body.messages[0].role === 'user'
    && body.messages[0].content === 'address'
  ))
  check('Flash request is a single user message with top-level translation_options', (
    body.model === MODEL_ID
    && body.stream === false
    && body.temperature === 0
    && body.translation_options.source_lang === TRANSLATION_OPTIONS.source_lang
    && body.translation_options.domains.includes('Selected: address')
    && !Object.hasOwn(body, 'tools')
    && !Object.hasOwn(body, 'response_format')
  ))
  check('adapter never puts the API key in the JSON body', !sent.init.body.includes('super-secret-key-value'))
  check('truncated-looking success still requires a complete stop', result.translation === '处理')
}

{
  const adapter = createQwenMtFlashAdapter({
    endpoint: 'https://evil.example/compatible-mode/v1/chat/completions',
    apiKey: 'super-secret-key-value',
    fetchImpl: async () => {
      throw new Error('ssrf')
    },
  })
  try {
    await adapter.translateSelection({ selectedText: 'x', maxTokens: 16 })
    check('non-allowlisted endpoint is rejected', false)
  } catch (error) {
    check('non-allowlisted endpoint is rejected', error.code === 'TRANSLATION_ENDPOINT_INVALID')
  }
}

rmSync(temp, { recursive: true, force: true })
if (failed > 0) {
  console.error(`FAILED ${failed}  passed ${passed}`)
  process.exit(1)
}
console.log(`OK ${passed}`)
