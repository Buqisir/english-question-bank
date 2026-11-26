import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { promisify } from 'node:util'

test('concurrent Review launches reuse healthy listeners and repair stale PIDs', { timeout: 15_000 }, async t => {
  const root = mkdtempSync(path.join(tmpdir(), 'local-review-test-'))
  const cli = path.join(root, 'scripts/import-pipeline/local-review.mjs')
  const run = (...args) => promisify(execFile)(process.execPath, [cli, ...args])
  t.after(async () => {
    await run('down')
    rmSync(root, { recursive: true, force: true })
  })
  for (const dir of ['scripts/import-pipeline', 'server', 'app/node_modules/vite/bin', 'data']) {
    mkdirSync(path.join(root, dir), { recursive: true })
  }
  copyFileSync(path.join(import.meta.dirname, 'local-review.mjs'), cli)
  const listener = `const port = process.argv.includes('--port')
    ? process.argv[process.argv.indexOf('--port') + 1] : process.env.QUESTION_BANK_API_PORT
    require('node:http').createServer((_, response) => response.end('OK')).listen(Number(port), '127.0.0.1')`
  writeFileSync(path.join(root, 'server/api.mjs'), `import { createRequire } from 'node:module'\nconst require = createRequire(import.meta.url)\n${listener}`)
  writeFileSync(path.join(root, 'app/node_modules/vite/bin/vite.js'), listener)
  for (const name of ['question-bank', 'user-data']) writeFileSync(path.join(root, `data/${name}.sqlite`), '')
  const ports = [createServer(), createServer()]
  const [api, app] = await Promise.all(ports.map(server => new Promise(resolve =>
    server.listen(0, '127.0.0.1', () => resolve(String(server.address().port))))))
  await Promise.all(ports.map(server => new Promise(resolve => server.close(resolve))))
  const up = () => run('up', '--api-port', api, '--app-port', app).then(result => JSON.parse(result.stdout))
  const launches = await Promise.all([up(), up()])
  assert.deepEqual(launches.map(item => item.state).sort(), ['already_running', 'running'])
  const [{ apiPid, appPid }] = launches
  assert.deepEqual([launches[1].apiPid, launches[1].appPid], [apiPid, appPid])
  const statePath = path.join(root, 'imports/local-review/state.json')
  writeFileSync(statePath, JSON.stringify({ ...JSON.parse(readFileSync(statePath)), apiPid: 999999, appPid: 999999 }))
  const claimed = await up()
  assert.deepEqual([claimed.state, claimed.apiPid, claimed.appPid], ['already_running', apiPid, appPid])
})
