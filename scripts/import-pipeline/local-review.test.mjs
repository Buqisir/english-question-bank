import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { once } from 'node:events'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { promisify } from 'node:util'

test('Review recovers a killed lock holder, reuses healthy listeners and isolates runtimes', { timeout: 15_000 }, async t => {
  const root = mkdtempSync(path.join(tmpdir(), 'local-review-test-'))
  const cli = path.join(root, 'scripts/import-pipeline/local-review.mjs')
  const run = (...args) => promisify(execFile)(process.execPath, [cli, ...args])
  const runtime = path.join(root, 'imports/local-review')
  const statePath = path.join(runtime, 'state.json')
  const ready = path.join(runtime, 'tmp/api-ready')
  const allowHealth = path.join(runtime, 'tmp/allow-health')
  t.after(async () => {
    if (!existsSync(statePath) && existsSync(ready)) {
      process.kill(Number(readFileSync(ready)), 'SIGTERM')
    }
    await run('down')
    rmSync(root, { recursive: true, force: true })
  })
  for (const dir of ['scripts/import-pipeline', 'server', 'app/node_modules/vite/bin', 'data']) {
    mkdirSync(path.join(root, dir), { recursive: true })
  }
  copyFileSync(path.join(import.meta.dirname, 'local-review.mjs'), cli)
  const listener = `const app = process.argv.includes('--port')
    const port = app ? process.argv[process.argv.indexOf('--port') + 1] : process.env.QUESTION_BANK_API_PORT
    const fs = require('node:fs')
    const tmp = process.env.TMPDIR
    require('node:http').createServer((_, response) => {
      if (!app && !fs.existsSync(tmp + '/allow-health')) response.statusCode = 503
      response.end('OK')
    }).listen(Number(port), '127.0.0.1', () => {
      if (!app) fs.writeFileSync(tmp + '/api-ready', String(process.pid))
    })`
  writeFileSync(path.join(root, 'server/api.mjs'), `import { createRequire } from 'node:module'\nconst require = createRequire(import.meta.url)\n${listener}`)
  writeFileSync(path.join(root, 'app/node_modules/vite/bin/vite.js'), listener)
  for (const name of ['question-bank', 'user-data']) writeFileSync(path.join(root, `data/${name}.sqlite`), '')
  const ports = [createServer(), createServer()]
  const [api, app] = await Promise.all(ports.map(server => new Promise(resolve =>
    server.listen(0, '127.0.0.1', () => resolve(String(server.address().port))))))
  await Promise.all(ports.map(server => new Promise(resolve => server.close(resolve))))
  const args = ['up', '--api-port', api, '--app-port', app]
  const holder = spawn(process.execPath, [cli, ...args], { stdio: 'ignore' })
  const exited = once(holder, 'exit')
  try {
    for (let attempt = 0; attempt < 100 && !existsSync(ready); attempt++) await delay(50)
    assert(existsSync(ready), 'first startup reached API health check')
  } finally {
    holder.kill('SIGKILL')
    await exited
  }
  const recoveredApiPid = Number(readFileSync(ready))
  writeFileSync(allowHealth, '')
  const up = () => run(...args).then(result => JSON.parse(result.stdout))
  const launches = await Promise.all([up(), up()])
  assert.deepEqual(launches.map(item => item.state).sort(), ['already_running', 'running'])
  const [{ apiPid, appPid }] = launches
  assert.equal(apiPid, recoveredApiPid)
  assert.deepEqual([launches[1].apiPid, launches[1].appPid], [apiPid, appPid])
  const state = JSON.parse(readFileSync(statePath))
  writeFileSync(statePath, JSON.stringify({ ...state, apiPid: 999999, appPid: 999999 }))
  const claimed = await up()
  assert.deepEqual([claimed.state, claimed.apiPid, claimed.appPid], ['already_running', apiPid, appPid])

  const other = path.join(root, 'other-runtime')
  mkdirSync(other)
  writeFileSync(path.join(other, 'state.json'), JSON.stringify({ ...state, runtime: other }))
  for (const action of ['up', 'down']) {
    await assert.rejects(run(action, '--runtime', other), /outside this Local Review runtime/u)
  }
  const stillRunning = await up()
  assert.deepEqual([stillRunning.apiPid, stillRunning.appPid], [apiPid, appPid])
})
