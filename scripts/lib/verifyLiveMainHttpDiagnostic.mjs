import assert from 'node:assert/strict'
import http from 'node:http'
import { spawn, spawnSync } from 'node:child_process'
import { canonical } from '../../deploy/eqb-barrier-bootstrap.mjs'
import { buildLiveMainHttpDiagnosticCommand, liveMainHttpSummary, parseLiveMainHttpDiagnostic } from './barrierBootstrapTat.mjs'

export async function verifyLiveMainHttpDiagnostic() {
  const secret = 'FAKE_PRIVATE_CONTENT'
  const wire = buildLiveMainHttpDiagnosticCommand()
  assert.deepEqual(buildLiveMainHttpDiagnosticCommand(), wire)
  assert.equal(spawnSync('/bin/bash', ['-n'], { input: wire.command }).status, 0)
  assert.ok(!wire.command.includes('/dev/fd/3'))
  assert.ok(!wire.command.includes('--location'))
  const source = wire.command.split("<<'EQB_HTTP_NODE'\n")[1].split('\nEQB_HTTP_NODE')[0]
  const execute = input => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module'], { stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = '', stderr = ''
    child.stdout.on('data', bytes => { stdout += bytes })
    child.stderr.on('data', bytes => { stderr += bytes })
    child.on('error', reject)
    child.on('exit', (status, signal) => resolve({ status, signal, stdout, stderr }))
    child.stdin.end(input)
  })
  // The old extra pipe is not a regular, reopenable descriptor on Linux.
  if (process.platform === 'linux') {
    const fd = spawnSync(process.execPath, ['-e', `
      const fs = require('node:fs');
      if (!fs.fstatSync(3).isSocket()) throw new Error('Expected Node socket');
      try { fs.openSync('/dev/fd/3', 'w'); process.exitCode = 1; }
      catch (error) { if (error.code !== 'ENXIO') throw error; }
    `], { stdio: ['ignore', 'pipe', 'pipe', 'pipe'] })
    assert.equal(fd.status, 0)
  }
  let requests = 0
  const server = http.createServer((request, response) => {
    requests++
    const status = Number(request.url.slice(1))
    assert.equal(request.headers.authorization, undefined)
    response.writeHead(status, { 'Content-Type': 'application/json', 'X-RateLimit-Remaining': '0',
      'X-RateLimit-Reset': '1800000000', 'Retry-After': '60', 'X-GitHub-Request-Id': secret,
      Location: `https://example.invalid/${secret}`, 'Set-Cookie': secret })
    response.end(secret)
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    for (const status of [200, 302, 401, 403, 404, 429, 500]) {
      // Only substitute identity and the endpoint; execute the emitted Node
      // program with real curl, env, descriptor configuration and parser.
      const input = 'process.getuid = () => 0; process.getgid = () => 0;\n' + source.replace(
        'https://api.github.com/repos/Buqisir/english-question-bank/git/ref/heads/main',
        `http://127.0.0.1:${server.address().port}/${status}`)
      const result = await execute(input)
      assert.equal(result.status, 0, result.stderr)
      assert.equal(result.stderr, '')
      const report = parseLiveMainHttpDiagnostic(result.stdout, result.status)
      assert.equal(report.stage, 'live-main-http')
      assert.equal(report.httpStatus, status)
      assert.equal(report.curlExit, status >= 400 ? 22 : 0)
      assert.equal(report.rateRemaining, 0)
      assert.equal(report.retryAfter, 60)
      assert.equal(report.hasLocation, true)
      assert.equal(result.stdout.includes(secret), false)
    }
    assert.equal(requests, 7, 'no redirects or retries')
    const nonroot = await execute('process.getuid = () => 0; process.getgid = () => 29;\n' + source)
    assert.equal(nonroot.status, 70)
    assert.equal(parseLiveMainHttpDiagnostic(nonroot.stdout, nonroot.status).spawnCode, 'EACCES')
    assert.equal(requests, 7)
  } finally { await new Promise(resolve => server.close(resolve)) }
  const valid = 'HTTP/1.1 403 Forbidden\r\nX-RateLimit-Remaining: 0\r\n\r\n403 0'
  for (const stdout of [valid + secret, secret + valid, valid.replace('403 0', '200 0'),
    valid.replace('403 0', '403 1'), valid.replace('Remaining: 0', 'Remaining: 00'),
    valid.replace('\r\n\r\n', '\r\nx-ratelimit-remaining: 1\r\n\r\n'),
    valid.replace('Forbidden', '\u0080'), valid + '\n', valid.replace(/\r/g, ''),
    'HTTP/1.1 200 Connection established\r\n\r\n' + valid]) {
    const report = liveMainHttpSummary({ status: 22, stdout, stderr: secret })
    assert.equal(report.stage, 'unknown')
    assert.equal(report.httpStatus, null)
    assert.equal(canonical(report).includes(secret), false)
    parseLiveMainHttpDiagnostic(canonical(report), 70)
  }
  for (const result of [{ status: 23 }, { status: null, signal: 'SIGSEGV' },
    { status: 22, error: { code: 'ENOBUFS', message: secret } }, { status: 0 }]) {
    const report = liveMainHttpSummary({ stdout: valid, stderr: secret, ...result })
    assert.equal(report.stage, 'unknown')
    assert.equal(canonical(report).includes(secret), false)
  }
  const known = liveMainHttpSummary({ status: 22, stdout: valid })
  for (const change of [{ httpStatus: [403] }, { curlExit: 0 }, { spawnCode: secret },
    { stage: 'unknown' }, { extra: true }, { retryAfter: '60' }]) {
    assert.throws(() => parseLiveMainHttpDiagnostic(canonical({ ...known, ...change }), 0))
  }
  for (const exit of [70, null, undefined]) assert.throws(() => parseLiveMainHttpDiagnostic(canonical(known), exit))
  assert.throws(() => parseLiveMainHttpDiagnostic(canonical(known) + secret, 0), /^Error: Invalid HTTP diagnostic$/)
  console.log('  ✓ HTTP diagnostic: Linux fd3 ENXIO, real curl stdout headers, redaction, strict parsing, no follow/retry, root GID guard')
}
