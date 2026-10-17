#!/usr/bin/env node
// Isolated loopback Review rehearsal: fresh DB copies, a generated local Agent credential,
// the real API and the real website renderer, without touching data/ or any remote target.
//
//   up      [--runtime <dir>] [--api-port 18890] [--app-port 51790]
//   run     [--runtime <dir>] -- <command> [args...]   inject origin + Agent credential
//   owner   [--runtime <dir>] --username <name>        local owner account in the runtime copy
//   status  [--runtime <dir>]
//   down    [--runtime <dir>]
//
// The credential stays in <runtime>/secrets (0600) and is never printed.
import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import {
  chmodSync, copyFileSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync,
} from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '../..')

function fail(message) {
  console.error(message)
  process.exit(1)
}

function option(name, fallback = null) {
  const separator = process.argv.indexOf('--')
  const args = separator === -1 ? process.argv : process.argv.slice(0, separator)
  const index = args.indexOf(name)
  return index === -1 ? fallback : args[index + 1]
}

const runtime = path.resolve(option('--runtime') || path.join(root, 'imports/local-review'))
const statePath = path.join(runtime, 'state.json')
const tokenPath = path.join(runtime, 'secrets/agent.token')
const bindingPath = path.join(root, '.amp/import-review-origin')

function readState() {
  return existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : null
}

function alive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function serverEnvironment(state) {
  const token = readFileSync(tokenPath, 'utf8').trim()
  return {
    HOME: path.join(runtime, 'home'),
    TMPDIR: path.join(runtime, 'tmp'),
    PATH: process.env.PATH,
    PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH
      || path.join(process.env.HOME, 'Library/Caches/ms-playwright'),
    ...(process.env.EQB_OCR_RASTER_CACHE_DIR ? { EQB_OCR_RASTER_CACHE_DIR: process.env.EQB_OCR_RASTER_CACHE_DIR } : {}),
    QUESTION_BANK_API_PORT: String(state.apiPort),
    QUESTION_BANK_DB: path.join(runtime, 'db/question-bank.sqlite'),
    USER_DATA_DB: path.join(runtime, 'db/user-data.sqlite'),
    QUESTION_BANK_IMPORT_OPS_DB: path.join(runtime, 'db/import-ops.sqlite'),
    QUESTION_BANK_IMPORT_OPS_ROOT: path.join(runtime, 'review-files'),
    QUESTION_BANK_PAPER_ASSET_ROOT: path.join(runtime, 'paper-assets'),
    QUESTION_BANK_USER_SPACE_ROOT: path.join(runtime, 'user-space'),
    QUESTION_BANK_BLOB_ROOT: path.join(runtime, 'blobs'),
    QUESTION_BANK_FILE_STORE: 'local',
    QUESTION_BANK_IMPORT_OPS_ORIGIN: state.apiOrigin,
    QUESTION_BANK_IMPORT_REVIEW_OWNER_ORIGIN: state.appOrigin,
    QUESTION_BANK_PUBLIC_ORIGIN: state.appOrigin,
    QUESTION_BANK_IMPORT_OPS_AGENT_TOKEN: token,
    AI_DAILY_USAGE_SNAPSHOT_PATH: path.join(runtime, 'ai-daily-usage.json'),
  }
}

async function waitFor(url, label) {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.status < 500) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  fail(`${label} did not answer at ${url}; see ${path.join(runtime, 'logs')}`)
}

function bindOrigin(apiOrigin) {
  if (existsSync(bindingPath)) {
    const bound = readFileSync(bindingPath, 'utf8').trim()
    if (bound !== apiOrigin) fail(`${bindingPath} is bound to ${bound}; refusing to rebind to ${apiOrigin}`)
    return
  }
  mkdirSync(path.dirname(bindingPath), { recursive: true })
  writeFileSync(bindingPath, `${apiOrigin}\n`)
}

async function up() {
  const existing = readState()
  if (existing && alive(existing.apiPid) && alive(existing.appPid)) {
    console.log(JSON.stringify({ ok: true, state: 'already_running', ...existing }, null, 2))
    return
  }
  const apiPort = Number(option('--api-port', existing?.apiPort || 18890))
  const appPort = Number(option('--app-port', existing?.appPort || 51790))
  for (const directory of ['db', 'review-files', 'paper-assets', 'user-space', 'blobs', 'home', 'tmp', 'logs']) {
    mkdirSync(path.join(runtime, directory), { recursive: true })
  }
  mkdirSync(path.join(runtime, 'secrets'), { recursive: true, mode: 0o700 })
  for (const name of ['question-bank.sqlite', 'user-data.sqlite']) {
    const target = path.join(runtime, 'db', name)
    if (!existsSync(target)) copyFileSync(path.join(root, 'data', name), target)
  }
  if (!existsSync(tokenPath)) {
    writeFileSync(tokenPath, `${randomBytes(32).toString('base64url')}\n`, { mode: 0o600 })
  }
  chmodSync(tokenPath, 0o600)
  const state = {
    runtime,
    apiPort,
    appPort,
    apiOrigin: `http://127.0.0.1:${apiPort}`,
    appOrigin: `http://127.0.0.1:${appPort}`,
  }
  bindOrigin(state.apiOrigin)
  const environment = serverEnvironment(state)
  const log = (name) => openSync(path.join(runtime, 'logs', name), 'a')
  const api = spawn(process.execPath, [path.join(root, 'server/api.mjs')], {
    cwd: root, env: environment, detached: true, stdio: ['ignore', log('api.log'), log('api.log')],
  })
  api.unref()
  await waitFor(`${state.apiOrigin}/api/health`, 'API')
  const app = spawn(process.execPath, [
    path.join(root, 'app/node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(appPort), '--strictPort',
  ], {
    cwd: path.join(root, 'app'),
    env: { ...environment, HOME: process.env.HOME },
    detached: true,
    stdio: ['ignore', log('app.log'), log('app.log')],
  })
  app.unref()
  await waitFor(state.appOrigin, 'Website')
  const saved = { ...state, apiPid: api.pid, appPid: app.pid, startedAt: new Date().toISOString() }
  writeFileSync(statePath, `${JSON.stringify(saved, null, 2)}\n`)
  console.log(JSON.stringify({ ok: true, state: 'running', ...saved, binding: bindingPath }, null, 2))
}

function run() {
  const state = readState()
  if (!state || !alive(state.apiPid)) fail('Local Review is not running; start it with `local-review.mjs up`')
  const separator = process.argv.indexOf('--')
  const [command, ...args] = separator === -1 ? [] : process.argv.slice(separator + 1)
  if (!command) fail('Usage: local-review.mjs run -- <command> [args...]')
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: {
      ...process.env,
      QUESTION_BANK_IMPORT_OPS_ORIGIN: state.apiOrigin,
      QUESTION_BANK_IMPORT_OPS_AGENT_TOKEN: readFileSync(tokenPath, 'utf8').trim(),
      QUESTION_BANK_IMPORT_REVIEW_OWNER_ORIGIN: state.appOrigin,
    },
  })
  process.exit(result.status ?? 1)
}

function owner() {
  const username = option('--username')
  if (!username) fail('owner requires --username')
  mkdirSync(path.join(runtime, 'secrets'), { recursive: true, mode: 0o700 })
  const passwordPath = path.join(runtime, 'secrets', `${username}.password`)
  const password = existsSync(passwordPath)
    ? readFileSync(passwordPath, 'utf8').trim()
    : randomBytes(12).toString('base64url')
  writeFileSync(passwordPath, `${password}\n`, { mode: 0o600 })
  const result = spawnSync(process.execPath, [
    path.join(root, 'scripts/create-user.mjs'), '--username', username, '--role', 'owner', '--password-stdin',
  ], {
    cwd: root,
    input: `${password}\n`,
    encoding: 'utf8',
    env: { ...process.env, USER_DATA_DB: path.join(runtime, 'db/user-data.sqlite') },
  })
  if (result.status !== 0 && !/exist|已存在/iu.test(`${result.stderr || ''}${result.stdout || ''}`)) fail(result.stderr || 'create-user failed')
  console.log(JSON.stringify({ ok: true, username, passwordFile: passwordPath }, null, 2))
}

function status() {
  const state = readState()
  console.log(JSON.stringify(state
    ? { ...state, apiAlive: alive(state.apiPid), appAlive: alive(state.appPid) }
    : { state: 'not_started', runtime }, null, 2))
}

function down() {
  const state = readState()
  if (!state) return console.log(JSON.stringify({ ok: true, state: 'not_started' }))
  for (const pid of [state.appPid, state.apiPid]) {
    if (alive(pid)) process.kill(-pid, 'SIGTERM')
  }
  console.log(JSON.stringify({ ok: true, state: 'stopped', runtime }, null, 2))
}

const command = process.argv[2]
if (command === 'up') await up()
else if (command === 'run') run()
else if (command === 'owner') owner()
else if (command === 'status') status()
else if (command === 'down') down()
else fail('Usage: local-review.mjs <up|run|owner|status|down> [--runtime <dir>]')
