import assert from 'node:assert/strict'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

test('batch agents deny MCP connections without changing model, tools or autonomy', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'eqb-agent-isolation-'))
  const fakeDroid = path.join(dir, 'droid')
  const previousDroid = process.env.EQB_BATCH_DROID
  writeFileSync(fakeDroid, `#!${process.execPath}
const { readFileSync, writeFileSync } = require('node:fs')
const args = process.argv.slice(2)
const prompt = readFileSync(args[args.indexOf('-f') + 1], 'utf8')
const output = JSON.parse(prompt.split('\\n').find(line => line.startsWith('{"capture"'))).capture
writeFileSync(output, JSON.stringify(args))
`)
  chmodSync(fakeDroid, 0o700)
  process.env.EQB_BATCH_DROID = fakeDroid
  try {
    const { agent, MODELS } = await import('./batch-run.mjs')
    for (const readOnly of [false, true]) {
      const capture = path.join(dir, `${readOnly}.json`)
      const ctx = {
        dir, state: {}, agents: (fn) => fn(), save() {},
        log: (label) => path.join(dir, `${label}.log`),
      }
      const paper = { paperId: 'isolation-probe', completed: {}, agentRuns: [] }
      await agent(ctx, paper, `check-${readOnly}`, 'luna', JSON.stringify({ capture }),
        [capture], { retries: 0, readOnly })
      const args = JSON.parse(readFileSync(capture, 'utf8'))
      const settings = path.join(import.meta.dirname, 'batch-agent-settings.json')
      assert.deepEqual(args, [
        'exec', '-m', MODELS.luna.model, '-r', MODELS.luna.effort,
        '--auto', 'medium', '--cwd', path.resolve(import.meta.dirname, '../..'),
        '--only-tools', readOnly ? 'Read,Grep,Glob,LS' : 'Read,Grep,Glob,LS,ApplyPatch',
        '--settings', settings, '-f', path.join(dir, `isolation-probe-check-${readOnly}-1.log.prompt.txt`),
      ])
      assert.deepEqual(JSON.parse(readFileSync(settings, 'utf8')), {
        mcpPolicy: { enabled: true, allowlist: [] },
      })
      assert.equal(paper.agentRuns[0].exit, 0)
    }
  } finally {
    if (previousDroid === undefined) delete process.env.EQB_BATCH_DROID
    else process.env.EQB_BATCH_DROID = previousDroid
    rmSync(dir, { recursive: true, force: true })
  }
})
