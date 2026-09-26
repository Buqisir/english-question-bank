#!/usr/bin/env node

import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createSourceIntakeDispatcher, IMPORT_PROJECT_ID } from './import-pipeline/source-intake-dispatch.mjs'

const root = mkdtempSync(path.join(tmpdir(), 'eqb-retired-dispatch-'))
const submissionId = 'submission-11111111-1111-4111-8111-111111111111'
const digest = `sha256:${'a'.repeat(64)}`
const controllerThreadId = 'T-01a057c0-ecc9-745c-aaa7-a51dddb22306'
const candidateThreadId = 'T-22222222-2222-4222-8222-222222222222'
const secret = 'private-reservation-verifier'
let calls = 0
let remote = { state: 'bound', submissionId, submissionDigest: digest, ampThreadId: candidateThreadId, reservationToken: secret }
const dispatcher = createSourceIntakeDispatcher({ root, controllerThreadId, controllerProjectId: IMPORT_PROJECT_ID,
  api: async (action, id, body, options) => {
    calls++
    assert.equal(action, 'status')
    assert.equal(id, submissionId)
    assert.deepEqual(body, { submissionDigest: digest })
    assert.deepEqual(options, { readOnly: true })
    if (remote instanceof Error) throw remote
    return { worker: remote }
  },
})
try {
  for (const operation of ['prepare', 'beginCreate', 'bind', 'takeAssignment']) {
    assert.deepEqual(await dispatcher[operation](submissionId, digest, 'event'), {
      state: 'blocked', reason: 'automatic_intake_retired', startable: false,
    })
  }
  assert.equal(calls, 0)
  assert.deepEqual(readdirSync(root), [], 'retired calls must not create journals or locks')
  assert.equal((await dispatcher.status(submissionId)).startable, false)
  assert.equal(calls, 0)
  const directory = path.join(root, submissionId)
  mkdirSync(directory)
  const file = path.join(directory, 'dispatch.json')
  for (const state of ['reserved', 'creating', 'reserve_unknown', 'binding', 'bind_unknown', 'bound', 'assignment_issued']) {
    const bytes = JSON.stringify({ submissionId, digest, controllerThreadId, candidateThreadId, state, reservationToken: secret })
    writeFileSync(file, bytes)
    const status = await dispatcher.status(submissionId)
    assert.equal(status.startable, false, `${state} must never resume automatically`)
    assert.equal(status.local.state, state)
    assert.equal(status.remote.ampThreadId, candidateThreadId)
    assert.doesNotMatch(JSON.stringify(status), new RegExp(secret))
    for (const operation of ['prepare', 'beginCreate', 'bind', 'takeAssignment']) await dispatcher[operation](submissionId)
    assert.equal(readFileSync(file, 'utf8'), bytes, 'historical evidence must remain byte-identical')
    assert.deepEqual(readdirSync(directory), ['dispatch.json'])
  }
  remote = { ...remote, submissionDigest: `sha256:${'b'.repeat(64)}` }
  assert.equal((await dispatcher.status(submissionId)).remote.state, 'unknown')
  remote = new Error(secret)
  assert.equal((await dispatcher.status(submissionId)).remote.state, 'unknown')
  writeFileSync(file, `{"private":${secret}}`)
  await assert.rejects(dispatcher.status(submissionId), (error) => {
    assert.doesNotMatch(error.message, new RegExp(secret))
    return /private dispatch journal/.test(error.message)
  })
  console.log('PASS retired dispatch blocks all mutations; historical status stays read-only, non-startable, and redacted')
} finally {
  rmSync(root, { recursive: true, force: true })
}
