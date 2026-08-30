#!/usr/bin/env node

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'

import {
  runVerificationCommand,
} from './lib/verificationCommandRunner.mjs'

function processExists(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error?.code === 'EPERM'
  }
}

async function waitForProcessExit(pid) {
  const deadline = Date.now() + 2_000
  while (Date.now() < deadline) {
    if (!processExists(pid)) return
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}

const fixture = String.raw`
  const { spawn } = require('node:child_process')
  const descendant = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    stdio: 'inherit',
  })
  console.log('DESCENDANT_PID=' + descendant.pid)
  console.error('LONG_LINE_HEAD:' + 'x'.repeat(20000) + ':LONG_LINE_TAIL')
  setTimeout(() => process.exit(7), 50)
`

let output = ''
let descendantPid = null
const unrelated = spawn(
  process.execPath,
  ['-e', 'setInterval(() => {}, 1000)'],
  { stdio: 'ignore' },
)
try {
  const status = await runVerificationCommand(
    process.execPath,
    ['-e', fixture],
    {
      cwd: process.cwd(),
      maxLineChars: 1_024,
      stdout: (chunk) => { output += chunk },
      stderr: (chunk) => { output += chunk },
    },
  )
  assert.equal(status, 7)
  descendantPid = Number(/DESCENDANT_PID=(\d+)/u.exec(output)?.[1])
  assert(Number.isInteger(descendantPid) && descendantPid > 0)
  assert.match(output, /LONG_LINE_HEAD:/u)
  assert.match(output, /LONG_LINE_TAIL/u)
  assert.match(
    output,
    /\[line truncated: \d+ chars omitted; sha256:[a-f0-9]{64}\]/u,
  )
  assert(output.length < 2_000, 'long child output is bounded')
  if (process.platform !== 'win32') {
    await waitForProcessExit(descendantPid)
    assert.equal(
      processExists(descendantPid),
      false,
      'runner reaps a verifier descendant without touching unrelated processes',
    )
    assert.equal(
      processExists(unrelated.pid),
      true,
      'runner leaves an unrelated process outside the verifier group alive',
    )
  }
} finally {
  if (descendantPid && processExists(descendantPid)) {
    try {
      process.kill(descendantPid, 'SIGKILL')
    } catch {
      // The runner may have reaped it between the existence check and signal.
    }
  }
  if (processExists(unrelated.pid)) unrelated.kill('SIGKILL')
}

console.log('verification command runner verification passed')
