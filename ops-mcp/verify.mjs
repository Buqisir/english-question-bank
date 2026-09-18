#!/usr/bin/env node
import { spawn, execFileSync } from 'node:child_process'
import { existsSync, realpathSync, mkdtempSync, mkdirSync, writeFileSync, chmodSync, readFileSync, symlinkSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { exportJWK, generateKeyPair, SignJWT } from 'jose'
import { loadConfig } from './src/config.mjs'
import { createAccessVerifier } from './src/auth.mjs'
import { sanitizeLogLine, pickHealthFields, redactText } from './src/redact.mjs'
import { isErrorLine, searchServiceLogs } from './src/logs.mjs'
import { probeHealth } from './src/health.mjs'
import { createOpsHttpServer } from './src/index.mjs'
import { collectOverview } from './src/overview.mjs'
import { clampLogQuery } from './src/limits.mjs'
import { recordRunningCommit } from './host/record-running-commit.mjs'
import { readCheckoutCommit, readRunningCommit } from './src/versions.mjs'
import { runHostVerify } from './host/verify-host.mjs'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
let passed = 0
let failed = 0

function assert(name, condition, details = '') {
  if (condition) {
    passed += 1
    console.log(`PASS ${name}`)
    return
  }
  failed += 1
  console.error(`FAIL ${name}${details ? `\n  ${details}` : ''}`)
}

function throws(name, fn, match) {
  try {
    fn()
    assert(name, false, 'did not throw')
  } catch (error) {
    assert(name, match.test(String(error.message)), error.message)
  }
}

async function throwsAsync(name, fn, match) {
  try {
    await fn()
    assert(name, false, 'did not throw')
  } catch (error) {
    assert(name, match.test(String(error.message)), error.message)
  }
}

function read(relPath) {
  return readFileSync(path.join(rootDir, relPath), 'utf8')
}

const TEAM = 'https://eqb-test.cloudflareaccess.com'
const AUD = 'a'.repeat(32)
const EMAIL = 'bqy2661342736@gmail.com'
const OTHER_EMAIL = 'other@example.com'

const { publicKey, privateKey } = await generateKeyPair('RS256')
const jwk = await exportJWK(publicKey)
jwk.kid = 'test-ops-mcp'
jwk.alg = 'RS256'
jwk.use = 'sig'
const jwks = { keys: [jwk] }
const verifyAccess = createAccessVerifier({
  teamDomain: TEAM,
  audience: AUD,
  allowedEmail: EMAIL,
  jwks,
})

async function signToken(claims = {}, { expired = false } = {}) {
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT({ email: EMAIL, ...claims })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-ops-mcp' })
    .setIssuer(TEAM)
    .setAudience(AUD)
    .setIssuedAt(expired ? now - 3600 : now)
    .setExpirationTime(expired ? now - 60 : now + 900)
    .sign(privateKey)
}

console.log('EQB Ops MCP verify')

throws(
  'config refuses missing Access audience',
  () => loadConfig({
    EQB_OPS_MCP_ALLOWED_EMAIL: EMAIL,
    EQB_OPS_MCP_TEAM_DOMAIN: TEAM,
  }),
  /AUD/,
)

throws(
  'config refuses non-loopback listen',
  () => loadConfig({
    EQB_OPS_MCP_ALLOWED_EMAIL: EMAIL,
    EQB_OPS_MCP_TEAM_DOMAIN: TEAM,
    EQB_OPS_MCP_AUD: AUD,
    EQB_OPS_MCP_LISTEN: '0.0.0.0',
  }),
  /127\.0\.0\.1/,
)

throws(
  'config refuses test auth without explicit allow',
  () => loadConfig({
    EQB_OPS_MCP_ALLOWED_EMAIL: EMAIL,
    EQB_OPS_MCP_AUTH_MODE: 'test',
  }),
  /Test auth is disabled/,
)

throws(
  'config refuses caller-chosen health URL',
  () => loadConfig({
    EQB_OPS_MCP_ALLOWED_EMAIL: EMAIL,
    EQB_OPS_MCP_TEAM_DOMAIN: TEAM,
    EQB_OPS_MCP_AUD: AUD,
    EQB_OPS_MCP_HEALTH_URL: 'http://example.com/api/health',
  }),
  /127\.0\.0\.1/,
)

throws(
  'config refuses health path other than /api/health',
  () => loadConfig({
    EQB_OPS_MCP_ALLOWED_EMAIL: EMAIL,
    EQB_OPS_MCP_TEAM_DOMAIN: TEAM,
    EQB_OPS_MCP_AUD: AUD,
    EQB_OPS_MCP_HEALTH_URL: 'http://127.0.0.1:8787/api/admin',
  }),
  /\/api\/health/,
)

await throwsAsync('missing token is rejected', () => verifyAccess({}), /Missing Cloudflare Access/)
await throwsAsync(
  'wrong email is rejected',
  async () => verifyAccess({ authorization: `Bearer ${await signToken({ email: OTHER_EMAIL })}` }),
  /not allowed/,
)
await throwsAsync(
  'expired token is rejected',
  async () => verifyAccess({ authorization: `Bearer ${await signToken({}, { expired: true })}` }),
  /rejected/,
)
await throwsAsync(
  'forged token is rejected',
  async () => {
    const other = await generateKeyPair('RS256')
    const forged = await new SignJWT({ email: EMAIL })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-ops-mcp' })
      .setIssuer(TEAM)
      .setAudience(AUD)
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(other.privateKey)
    await verifyAccess({ authorization: `Bearer ${forged}` })
  },
  /rejected/,
)
const good = await signToken()
const identity = await verifyAccess({ 'cf-access-jwt-assertion': good })
assert('valid Access JWT with owner email is accepted', identity.email === EMAIL)

const health = pickHealthFields({ ok: true, dbPath: '/secret/db' }, 200, 12)
assert('health picker keeps ok', health.ok === true)
assert('health picker keeps status', health.statusCode === 200)
assert('health picker does not leak dbPath', !('dbPath' in health))

assert(
  'redact strips bearer tokens',
  redactText('Authorization: Bearer supersecretvalue1').includes('[redacted]'),
)
assert(
  'redact strips emails',
  !redactText('user student@school.edu failed').includes('student@school.edu'),
)
assert(
  'uncleanable header lines are omitted',
  sanitizeLogLine('Cookie: session=abcdefghijklmnopqrstuvwxyz012345') == null,
)
assert(
  'ordinary error lines are kept',
  Boolean(sanitizeLogLine('2026-09-18T00:00:00+00:00 host eqb[1]: failed to render pdf')),
)

const temp = realpathSync(mkdtempSync(path.join(tmpdir(), 'eqb-ops-mcp-')))
const now = Math.floor(Date.now() / 1000) * 1000
const iso = (offsetMinutes) => new Date(now - offsetMinutes * 60 * 1000).toISOString().replace('.000Z', '+00:00')
const logFile = path.join(temp, 'eqb.log')
writeFileSync(logFile, [
  `${iso(10)} host eqb[9]: ERROR failed to render pdf`,
  `${iso(10)} host eqb[9]: Authorization: Bearer supersecretvalue1`,
  `${iso(10)} host eqb[9]: token=abcdefghijklmnopqrstuvwxyz0123456789ABCD`,
  `${iso(9)} host eqb[9]: 500`,
  `${iso(8)} host eqb[9]: timeout`,
  `${iso(7)} host eqb[9]: sent 1500 bytes`,
  `${iso(3)} host eqb[9]: ERROR timeout talking to renderer`,
  `${iso(2000)} host eqb[9]: ERROR ancient`,
].join('\n'))

const errors = searchServiceLogs({
  logFile,
  minutes: 120,
  limit: 50,
  errorsOnly: true,
  now,
})
assert('recent errors include current EQB errors', errors.entries.some((entry) => entry.text.includes('failed to render pdf')))
assert('recent errors include a bare 500', errors.entries.some((entry) => /(?:^|\s)500(?:\s|$)/u.test(entry.text)))
assert('recent errors include timeout without ERROR prefix', errors.entries.some((entry) => entry.text.includes('timeout') && !entry.text.includes('ERROR timeout talking')))
assert('recent errors do not treat 1500 as 500', !errors.entries.some((entry) => entry.text.includes('1500 bytes')))
assert('isErrorLine accepts bare 500', isErrorLine('500') && isErrorLine('status:500'))
assert('isErrorLine accepts timeout', isErrorLine('upstream timeout') && isErrorLine('timed out'))
assert('isErrorLine rejects 1500 and .500 timestamps', !isErrorLine('sent 1500 bytes') && !isErrorLine('12:00:00.500Z ok'))
assert('recent errors exclude ancient lines', !errors.entries.some((entry) => entry.text.includes('ancient')))
assert('recent errors omit credential lines', !JSON.stringify(errors).includes('supersecretvalue1'))
assert('search range is reported', errors.range.from && errors.range.to)

const searched = searchServiceLogs({
  logFile,
  minutes: 120,
  limit: 50,
  keyword: 'timeout',
  now,
})
assert('keyword match is literal', searched.entries.length >= 2 && searched.entries.every((entry) => entry.text.includes('timeout')))

try {
  searchServiceLogs({ logFile: path.join(temp, 'missing.log'), minutes: 60, limit: 10, now })
  assert('missing log file is an error', false)
} catch (error) {
  assert('missing log file is an error', error.name === 'LogReadError')
}

throws('minutes below 5 are rejected', () => clampLogQuery({ minutes: 4, limit: 10 }), /5–1440/)
throws('limit above 200 is rejected', () => clampLogQuery({ minutes: 60, limit: 201 }), /1–200/)
throws('overlong keyword is rejected', () => clampLogQuery({ minutes: 60, limit: 10, keyword: 'x'.repeat(101) }), /ordinary characters/)

await runHostVerify(assert, throws, throwsAsync, temp)

const healthHit = await probeHealth('http://127.0.0.1/api/health', {
  fetchImpl: async () => ({
    status: 200,
    json: async () => ({ ok: true, dbPath: '/secret/db' }),
  }),
})
assert('probeHealth does not return dbPath', !('dbPath' in healthHit) && healthHit.ok === true)

const releaseRoot = path.join(temp, 'eqb')
const sha = 'b'.repeat(40)
mkdirSync(path.join(releaseRoot, 'releases', sha), { recursive: true })
writeFileSync(path.join(releaseRoot, 'releases', sha, '.eqb-release.json'), JSON.stringify({
  schemaVersion: 'eqb-release-v1',
  sha,
}))
symlinkSync(path.join('releases', sha), path.join(releaseRoot, 'current'))
const checkout = path.join(temp, 'checkout')
mkdirSync(checkout)
const git = await new Promise((resolve, reject) => {
  const child = spawn('git', ['init'], { cwd: checkout, stdio: 'ignore' })
  child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error('git init'))))
})
void git
writeFileSync(path.join(checkout, 'README'), 'checkout')
await new Promise((resolve, reject) => {
  const child = spawn('git', ['-c', 'user.email=ops@example.com', '-c', 'user.name=ops', 'commit', '--allow-empty', '-m', 'checkout'], {
    cwd: checkout,
    stdio: 'ignore',
  })
  child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error('git commit'))))
})
const checkoutSha = await new Promise((resolve, reject) => {
  const child = spawn('git', ['rev-parse', 'HEAD'], { cwd: checkout, encoding: 'utf8' })
  let out = ''
  child.stdout.on('data', (chunk) => { out += chunk })
  child.on('exit', (code) => (code === 0 ? resolve(out.trim()) : reject(new Error('rev-parse'))))
})

const systemctlBin = path.join(temp, 'systemctl')
writeFileSync(systemctlBin, '#!/bin/sh\necho MainPID=0\necho ActiveState=active\necho ActiveEnterTimestamp=unknown\n')
chmodSync(systemctlBin, 0o755)
const gitBin = ['/opt/homebrew/bin/git', '/usr/bin/git'].find((bin) => existsSync(bin)) || 'git'
const unknownOverview = await collectOverview({
  checkoutPath: checkout,
  gitBin,
  releaseRoot,
  systemctlBin,
  eqbService: 'eqb',
  caddyService: 'caddy',
  diskPath: temp,
})
assert('checkoutCommit is git HEAD', unknownOverview.checkoutCommit === checkoutSha)
assert(
  'runningCommit is unknown without process proof',
  unknownOverview.runningCommit === 'unknown' && Boolean(unknownOverview.runningCommitReason),
)

const provenancePath = path.join(temp, 'running-commit.json')
const invocationId = 'd'.repeat(32)
const pid = 12345
const versionConfig = { checkoutPath: checkout, gitBin, releaseRoot, systemctlBin,
  eqbService: 'eqb', caddyService: 'caddy', diskPath: temp, provenancePath }
function serviceFixture({ active = 'active', processId = pid, invocation = invocationId } = {}) {
  writeFileSync(systemctlBin, `#!/bin/sh\necho MainPID=${processId}\necho ActiveState=${active}\necho InvocationID=${invocation}\necho ActiveEnterTimestamp=2026-09-18T12:00:00Z\n`)
  chmodSync(systemctlBin, 0o755)
}
function writeProof(overrides = {}) {
  rmSync(provenancePath, { force: true })
  const proof = recordRunningCommit({ cwd: path.join(releaseRoot, 'releases', sha),
    releaseRoot, pid, invocationId, destination: provenancePath })
  if (Object.keys(overrides).length) {
    rmSync(provenancePath)
    writeFileSync(provenancePath, JSON.stringify({ ...proof, ...overrides }), { mode: 0o444 })
  }
  return proof
}
serviceFixture()
writeProof()
const proven = await collectOverview(versionConfig)
assert('runningCommit is startup release provenance', proven.runningCommit === sha)
assert('running proof explains PID and invocation', proven.runningCommitProof.pid === pid
  && proven.runningCommitProof.invocationId === invocationId)
assert('checkout and running stay distinct', proven.checkoutCommit === checkoutSha
  && proven.runningCommit === sha && checkoutSha !== sha)
// Moving the deployment pointer must not change the running process proof.
rmSync(path.join(releaseRoot, 'current'))
symlinkSync('releases/' + 'b'.repeat(40), path.join(releaseRoot, 'current'))
assert('current pointer movement does not rewrite running commit',
  (await readRunningCommit(versionConfig)).commit === sha)
serviceFixture({ active: 'inactive', processId: 0 })
assert('inactive service rejects old provenance', (await readRunningCommit(versionConfig)).commit === 'unknown')
serviceFixture({ invocation: 'e'.repeat(32) })
assert('new invocation rejects old provenance even with same PID',
  (await readRunningCommit(versionConfig)).commit === 'unknown')
serviceFixture()
rmSync(provenancePath)
assert('missing provenance has reason', /ENOENT/.test((await readRunningCommit(versionConfig)).reason))
writeFileSync(provenancePath, '{broken')
assert('corrupt JSON does not fail overview', (await collectOverview(versionConfig)).runningCommit === 'unknown')
writeProof({ commit: 'not-a-sha' })
assert('invalid SHA is rejected', (await readRunningCommit(versionConfig)).commit === 'unknown')
writeProof({ pid: pid + 1 })
assert('different PID is rejected', (await readRunningCommit(versionConfig)).commit === 'unknown')
writeProof()
chmodSync(provenancePath, 0o666)
assert('writable provenance is rejected', (await readRunningCommit(versionConfig)).commit === 'unknown')
chmodSync(provenancePath, 0o444)
// Git's test hook simulates a different owner without requiring root/chown.
// Reset inherited safe.directory exceptions only inside this fixture. CI hosts
// may trust broad temp paths; that must not invalidate the negative control.
const ownershipTestEnv = {
  GIT_TEST_ASSUME_DIFFERENT_OWNER: '1',
  GIT_CONFIG_COUNT: '1',
  GIT_CONFIG_KEY_0: 'safe.directory',
  GIT_CONFIG_VALUE_0: '',
  LC_ALL: 'C',
}
const oldOwnershipEnv = Object.fromEntries(Object.keys(ownershipTestEnv).map((key) => [key, process.env[key]]))
Object.assign(process.env, ownershipTestEnv)
try {
  let rejected = false
  try { execFileSync(gitBin, ['-C', checkout, 'rev-parse', 'HEAD'], { stdio: 'pipe' }) }
  catch (error) { rejected = /dubious ownership/.test(String(error.stderr)) }
  assert('different owner fixture actually triggers safe.directory', rejected)
  assert('per-call safe.directory permits read-only HEAD',
    (await readCheckoutCommit(versionConfig)).commit === checkoutSha)
} finally {
  for (const [key, value] of Object.entries(oldOwnershipEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}
const callCounter = path.join(temp, 'systemctl-calls')
writeFileSync(systemctlBin, `#!/bin/sh
if [ -f '${callCounter}' ]; then
  echo InvocationID=${'e'.repeat(32)}
else
  touch '${callCounter}'
  echo InvocationID=${invocationId}
fi
echo MainPID=${pid}
echo ActiveState=active
`)
assert('restart during proof read is rejected',
  /changed while reading/.test((await readRunningCommit(versionConfig)).reason))
serviceFixture()
throws('writer rejects mismatched startup marker', () => recordRunningCommit({
  cwd: checkout, releaseRoot, pid, invocationId, destination: provenancePath,
}), /not a versioned release/)
assert('provenance drop-in preserves ExecStart', !read('ops-mcp/host/eqb-provenance.conf').includes('ExecStart'))
assert('provenance installer never restarts services',
  !/systemctl (?:restart|start|stop)/u.test(read('ops-mcp/host/install-running-provenance.sh')))
assert('checkout failure keeps reason', Boolean((await readCheckoutCommit({
  ...versionConfig, checkoutPath: path.join(temp, 'missing-checkout'),
})).reason))

const originHealth = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ ok: true, dbPath: '/secret/db' }))
})
await new Promise((resolve) => originHealth.listen(0, '127.0.0.1', resolve))
const healthPort = originHealth.address().port

const config = loadConfig({
  EQB_OPS_MCP_ALLOWED_EMAIL: EMAIL,
  EQB_OPS_MCP_TEAM_DOMAIN: TEAM,
  EQB_OPS_MCP_AUD: AUD,
  EQB_OPS_MCP_PORT: '8799',
  EQB_OPS_MCP_HEALTH_URL: `http://127.0.0.1:${healthPort}/api/health`,
  EQB_OPS_MCP_LOG_FILE: logFile,
  EQB_OPS_MCP_RELEASE_ROOT: releaseRoot,
  EQB_OPS_MCP_CHECKOUT: checkout,
  EQB_OPS_MCP_DISK_PATH: temp,
  EQB_OPS_MCP_SYSTEMCTL_BIN: systemctlBin,
  EQB_OPS_MCP_GIT_BIN: gitBin,
})
const httpServer = createOpsHttpServer({ config, verifyAccess })
await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve))
const addr = httpServer.address()
assert('HTTP server binds loopback', addr.address === '127.0.0.1' || addr.address === '::ffff:127.0.0.1')
const base = `http://127.0.0.1:${addr.port}`

async function postMcp({ token, sessionId, payload, origin }) {
  const headers = {
    accept: 'application/json, text/event-stream',
    'content-type': 'application/json',
    host: `127.0.0.1:${addr.port}`,
  }
  if (token) headers.authorization = `Bearer ${token}`
  if (sessionId) headers['mcp-session-id'] = sessionId
  if (origin) headers.origin = origin
  const response = await fetch(`${base}/mcp`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  })
  const text = await response.text()
  let json = null
  if (text) {
    try {
      json = JSON.parse(text)
    } catch {
      const data = [...text.matchAll(/^data:\s*(.*)$/gmu)].map((match) => match[1]).filter(Boolean)
      if (data.length) json = JSON.parse(data.at(-1))
    }
  }
  return {
    status: response.status,
    sessionId: response.headers.get('mcp-session-id') || sessionId,
    json,
    text,
  }
}

const unauth = await postMcp({
  payload: { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
})
assert('unauthenticated MCP is 401', unauth.status === 401)
assert('unauthenticated response has no tool payload', !JSON.stringify(unauth.json || {}).includes('runningCommit'))

const token = await signToken()
const init = await postMcp({
  token,
  payload: {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'eqb-ops-verify', version: '1.0.0' },
    },
  },
})
assert(`initialize succeeds (${init.status})`, init.status === 200 && init.json?.result, init.text)
const sessionId = init.sessionId
await postMcp({
  token,
  sessionId,
  payload: { jsonrpc: '2.0', method: 'notifications/initialized' },
})
const listed = await postMcp({
  token,
  sessionId,
  payload: { jsonrpc: '2.0', id: 2, method: 'tools/list' },
})
const tools = listed.json?.result?.tools || []
assert(
  'exactly four tools are exposed',
  tools.map((tool) => tool.name).sort().join(',') === 'health_check,recent_errors,search_logs,server_overview',
)
assert(
  'every tool is marked read-only',
  tools.length === 4 && tools.every((tool) => tool.annotations?.readOnlyHint === true),
)

async function callTool(name, args = {}) {
  const result = await postMcp({
    token,
    sessionId,
    payload: {
      jsonrpc: '2.0',
      id: name,
      method: 'tools/call',
      params: { name, arguments: args },
    },
  })
  const text = result.json?.result?.content?.[0]?.text
  return { ...result, body: text ? JSON.parse(text) : result.json }
}

const overview = await callTool('server_overview')
assert('server_overview returns checkoutCommit', SHA_LIKE(overview.body?.checkoutCommit) || overview.body?.checkoutCommit === 'unknown')
assert('server_overview reports collection time', Boolean(overview.body?.collectedAt))
const healthTool = await callTool('health_check')
assert('health_check ok is true', healthTool.body?.ok === true)
assert('health_check does not leak dbPath', !JSON.stringify(healthTool.body).includes('/secret/db'))
const recent = await callTool('recent_errors', { minutes: 120, limit: 20 })
assert('recent_errors reports range', Boolean(recent.body?.range?.from))
assert('recent_errors does not hide a read as empty without entries key', Array.isArray(recent.body?.entries) || Boolean(recent.body?.error))
const found = await callTool('search_logs', { keyword: 'timeout', minutes: 120, limit: 20 })
assert('search_logs finds the keyword', found.body?.entries?.some((entry) => entry.text.includes('timeout')))

const forbiddenOrigin = await postMcp({
  token,
  payload: { jsonrpc: '2.0', id: 9, method: 'ping' },
  origin: 'https://evil.example',
})
assert('foreign Origin is rejected', forbiddenOrigin.status === 403)

const unit = read('ops-mcp/host/eqb-ops-mcp.service')
assert('unit runs as eqb-ops', /User=eqb-ops/.test(unit) && /NoNewPrivileges=true/.test(unit))
assert('unit has no sudo', !/sudo/.test(unit))
const install = read('ops-mcp/host/install-eqb-ops-mcp.sh')
const hostChecks = read('ops-mcp/host/host-checks.sh')
assert(
  'install refuses Caddy and eqb.service edits',
  install.includes('assert_install_destination') && hostChecks.includes('/etc/caddy/Caddyfile') && hostChecks.includes('/etc/systemd/system/eqb.service'),
)
assert('rollback does not stop shared cloudflared', read('ops-mcp/host/rollback-eqb-ops-mcp.sh').includes('Do not systemctl stop cloudflared unless'))
assert('Caddyfile.release is untouched by this package', !read('deploy/Caddyfile.release').includes('mcp.eqbank.cc'))

httpServer.close()
originHealth.close()
rmSync(temp, { recursive: true, force: true })

function SHA_LIKE(value) {
  return typeof value === 'string' && /^[a-f0-9]{40}$/u.test(value)
}

console.log(`EQB Ops MCP verify: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
