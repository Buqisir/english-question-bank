#!/usr/bin/env node

// Provider-integration guard: every chat-completions provider — including the
// OpenAI-compatible gpt relay — must send response_format: {type:'json_object'}
// so the model returns a bare JSON object instead of prose/markdown. The
// non-standard `thinking` param stays gated to native providers, since a strict
// OpenAI proxy may reject unknown params.
//
// This tests the request-body construction in chatCompletions.mjs directly via a
// fake fetchImpl — the analyze-layer verify scripts inject providerCallers stubs
// that bypass this layer, which is how the relay regression went unnoticed.

import { callChatCompletionsJson } from '../server/ai-providers/chatCompletions.mjs'
import { callGptRelayJson } from '../server/ai-providers/gptRelay.mjs'

let passed = 0

function assert(name, condition, detail = '') {
  if (!condition) {
    throw new Error(`${name}${detail ? `\n${detail}` : ''}`)
  }
  passed += 1
  console.log(`ok - ${name}`)
}

function fakeFetch(captured, responseText) {
  return async (url, init) => {
    captured.url = url
    captured.body = JSON.parse(init.body)
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => responseText,
    }
  }
}

const cleanResponse = JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] })
const fencedResponse = JSON.stringify({ choices: [{ message: { content: '```json\n{"ok":true}\n```' } }] })

async function assertOpenAiCompatibleBody() {
  const captured = {}
  const result = await callChatCompletionsJson({
    baseUrl: 'https://superapi.buzz/v1',
    apiKey: 'test-key',
    model: 'gpt-5.5',
    messages: [{ role: 'user', content: 'hi' }],
    provider: 'openai-compatible',
    fetchImpl: fakeFetch(captured, cleanResponse),
  })

  // The regression: the relay must receive response_format json_object.
  assert(
    'openai-compatible request sets response_format json_object',
    captured.body.response_format && captured.body.response_format.type === 'json_object',
    JSON.stringify(captured.body),
  )
  // The non-standard extension must NOT leak to a strict OpenAI proxy.
  assert(
    'openai-compatible request omits non-standard thinking param',
    !('thinking' in captured.body),
    JSON.stringify(captured.body),
  )
  assert('openai-compatible posts to /chat/completions', captured.url === 'https://superapi.buzz/v1/chat/completions')
  assert('openai-compatible returns parsed rawText', result.rawText === '{"ok":true}')
}

async function assertDeepSeekBodyUnchanged() {
  const captured = {}
  await callChatCompletionsJson({
    baseUrl: 'https://api.deepseek.com',
    apiKey: 'test-key',
    model: 'deepseek-v4-pro',
    messages: [{ role: 'user', content: 'hi' }],
    provider: 'deepseek',
    fetchImpl: fakeFetch(captured, cleanResponse),
  })
  assert(
    'deepseek request keeps response_format json_object',
    captured.body.response_format && captured.body.response_format.type === 'json_object',
  )
  assert(
    'deepseek request keeps thinking disabled',
    captured.body.thinking && captured.body.thinking.type === 'disabled',
  )
}

async function assertGptRelayWiring() {
  process.env.OPENAI_API_KEY = 'test-key'
  process.env.OPENAI_BASE_URL = 'https://superapi.buzz/v1'
  const captured = {}
  const result = await callGptRelayJson({
    messages: [{ role: 'user', content: 'x' }],
    fetchImpl: fakeFetch(captured, fencedResponse),
  })
  assert('gptRelay routes through openai-compatible provider', result.provider === 'openai-compatible')
  assert(
    'gptRelay request carries response_format json_object',
    captured.body.response_format && captured.body.response_format.type === 'json_object',
  )
  assert('gptRelay default model is gpt-5.5', captured.body.model === 'gpt-5.5')
}

async function main() {
  await assertOpenAiCompatibleBody()
  await assertDeepSeekBodyUnchanged()
  await assertGptRelayWiring()

  console.log(`\nrelay JSON format verify PASSED: ${passed} checks`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
