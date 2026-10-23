import assert from 'node:assert/strict'
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { setTimeout as sleep } from 'node:timers/promises'

test('agent timeout kills the process group, records the deadline and preserves retry receipts', async (t) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'eqb-agent-timeout-'))
  const fakeDroid = path.join(dir, 'droid')
  const previousDroid = process.env.EQB_BATCH_DROID
  writeFileSync(fakeDroid, `#!${process.execPath}
const { readFileSync, writeFileSync, existsSync } = require('node:fs')
const { spawn } = require('node:child_process')
const prompt = readFileSync(process.argv[process.argv.indexOf('-f') + 1], 'utf8')
const config = JSON.parse(prompt.split('\\n').find(line => line.startsWith('{"testMode"')))
if (existsSync(config.pids)) {
  writeFileSync(config.output, '{"ok":true}')
  process.exit(0)
}
if (config.testMode === 'ignore-term') process.on('SIGTERM', () => {})
spawn(process.execPath, ['-e', \`
  const { writeFileSync } = require('node:fs')
  process.on('SIGTERM', () => {})
  writeFileSync(\${JSON.stringify(config.pids)}, JSON.stringify([process.ppid, process.pid]))
  setInterval(() => {}, 1000)
\`], { stdio: 'ignore' })
setInterval(() => {}, 1000)
`)
  chmodSync(fakeDroid, 0o700)
  process.env.EQB_BATCH_DROID = fakeDroid
  const { agent } = await import('./batch-run.mjs')
  const alive = (pid) => {
    try { process.kill(pid, 0); return true } catch (error) {
      if (error.code === 'ESRCH') return false
      throw error
    }
  }
  try {
    for (const testMode of ['exit-on-term', 'ignore-term']) {
      await t.test(testMode, async () => {
        const pids = path.join(dir, `${testMode}-pids.json`)
        const output = path.join(dir, `${testMode}-output.json`)
        const timeout = 1500
        const ctx = {
          dir, state: {}, agents: (fn) => fn(), save() {},
          log: (label) => path.join(dir, `${label}.log`),
        }
        const paper = { paperId: testMode, completed: {}, agentRuns: [] }
        try {
          await agent(ctx, paper, 'fake-check', 'sol', JSON.stringify({ testMode, pids, output }),
            [output], { timeout })
          assert.deepEqual(paper.agentRuns.map(({ exit }) => exit), [124, 0])
          assert.ok(paper.completed['fake-check'][output], 'only successful retry gets a completion receipt')
          const calls = paper.agentRuns.length
          await agent(ctx, paper, 'fake-check', 'sol', '', [output], { timeout })
          assert.equal(paper.agentRuns.length, calls, 'valid receipt skips another invocation')
          const records = readFileSync(path.join(dir, 'logs/agent-timeline.jsonl'), 'utf8')
            .trim().split('\n').map((line) => JSON.parse(line)).filter((record) => record.log.includes(testMode))
          assert.deepEqual(records.map(({ event, exit, timeoutMs }) => ({ event, exit, timeoutMs })), [
            { event: 'started', exit: null, timeoutMs: timeout },
            { event: 'finished', exit: 'timeout', timeoutMs: timeout },
            { event: 'started', exit: null, timeoutMs: timeout },
            { event: 'finished', exit: 0, timeoutMs: timeout },
          ])
          assert.ok(paper.agentRuns[0].seconds >= timeout / 1000)
          assert.ok(paper.agentRuns[0].seconds < 10, 'configured timeout replaces the 25-minute default')
          const processes = JSON.parse(readFileSync(pids, 'utf8'))
          for (let i = 0; i < 100 && processes.some(alive); i++) await sleep(20)
          assert.deepEqual(processes.filter(alive), [], 'parent and SIGTERM-resistant grandchild both exited')
        } finally {
          if (existsSync(pids)) {
            const [group] = JSON.parse(readFileSync(pids, 'utf8'))
            try { process.kill(-group, 'SIGKILL') } catch {}
          }
        }
      })
    }
  } finally {
    if (previousDroid === undefined) delete process.env.EQB_BATCH_DROID
    else process.env.EQB_BATCH_DROID = previousDroid
    rmSync(dir, { recursive: true, force: true })
  }
})
