#!/usr/bin/env node

import assert from 'node:assert/strict'
import sourceIntakeWakeupPlugin from '../.amp/plugins/source-intake-wakeup.js'
import './verify-source-intake-dispatch.mjs'

const original = process.env.QUESTION_BANK_SOURCE_INTAKE_PLUGIN_ENABLED
try {
  process.env.QUESTION_BANK_SOURCE_INTAKE_PLUGIN_ENABLED = '1'
  const calls = []
  await sourceIntakeWakeupPlugin(new Proxy({ logger: { log: (message) => calls.push(message) } }, {
    get(target, key) {
      if (key === 'logger') return target.logger
      assert.fail(`Retired plugin must not access ${String(key)}`)
    },
  }))
  assert.equal(calls.length, 1)
  assert.match(calls[0], /retired/)
} finally {
  if (original === undefined) delete process.env.QUESTION_BANK_SOURCE_INTAKE_PLUGIN_ENABLED
  else process.env.QUESTION_BANK_SOURCE_INTAKE_PLUGIN_ENABLED = original
}
console.log('PASS retired source-intake plugin cannot register, dispatch, or send messages even with the old enable flag')
