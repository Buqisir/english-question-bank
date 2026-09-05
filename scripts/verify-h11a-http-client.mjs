#!/usr/bin/env node
// Exercise public HTTP behavior, not helper syntax, local names or import sites.
import assert from 'node:assert/strict'
import {
  apiPath,
  decodeHeaderValue,
  errorMessageFromResponse,
  errorFromResponse,
} from '../app/src/services/httpClient.ts'

const previousWindow = globalThis.window
try {
  for (const hostname of ['127.0.0.1', 'localhost', '::1', 'example.com', 'eqbank.cc']) {
    globalThis.window = { location: { hostname } }
    assert.equal(apiPath('/api/x'), '/api/x', `${hostname}: same-origin addressing`)
  }
  delete globalThis.window
  assert.equal(apiPath('/api/x'), '/api/x', 'same path without a browser')
} finally {
  if (previousWindow === undefined) delete globalThis.window
  else globalThis.window = previousWindow
}

assert.equal(decodeHeaderValue(null), '')
assert.equal(decodeHeaderValue(encodeURIComponent('文件名.pdf')), '文件名.pdf')
assert.equal(decodeHeaderValue('%E0%A4%A'), '%E0%A4%A', 'malformed encoding remains readable')

for (const [body, expected] of [
  [JSON.stringify({ error: 'server says no' }), 'server says no'],
  ['not json', 'fallback msg'],
  ['{}', 'fallback msg'],
  [JSON.stringify({ error: '' }), 'fallback msg'],
]) {
  assert.equal(
    await errorMessageFromResponse(new Response(body, { status: 400 }), 'fallback msg'),
    expected,
  )
  const error = await errorFromResponse(new Response(body, { status: 400 }), 'fallback msg')
  assert(error instanceof Error)
  assert.equal(error.message, expected)
}

console.log('PASS HTTP same-origin paths, header decoding and response error behavior')
