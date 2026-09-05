import { gzipSync } from 'node:zlib'
import { canonical, failureResult, parsePayload, parseReadiness, parseProbeRequest } from '../../deploy/eqb-barrier-bootstrap.mjs'
import { hash } from '../../deploy/eqb-deploy-barrier.mjs'

// Returns bytes only. Dispatch/poll is the existing single-shot TAT adapter;
// neither constructing a command nor computing its digest reads credentials.
export function buildBarrierTatCommand({ operatorSource, payloadText, readinessText = null, transactionId = null, probeText = null }) {
  const payload = parsePayload(payloadText)
  if (typeof operatorSource !== 'string' || !operatorSource.startsWith('#!/usr/bin/env node\n')
    || operatorSource.includes('\0')) throw new Error('Invalid bootstrap operator source')
  const managerSource = Buffer.from(payload.files['deploy/eqb-deploy-barrier.mjs'].base64, 'base64').toString('utf8')
  const install = readinessText !== null
  const probe = probeText === null ? null : parseProbeRequest(probeText, payloadText)
  if (probe && (install || transactionId !== null || probe.operatorDigest !== hash(operatorSource))) {
    throw new Error('Probe cannot install or use a different operator')
  }
  const responseId = probe?.transactionId ?? transactionId
  if (install) {
    parseReadiness(readinessText, payloadText)
    if (typeof transactionId !== 'string'
      || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(transactionId)) {
      throw new Error('Invalid bootstrap transaction')
    }
  } else if (transactionId !== null) throw new Error('Readonly inspector takes no transaction')
  // Compress source text, not an already-base64 payload. Reconstruct and verify
  // the exact canonical payload bytes remotely; no archive/path extraction.
  const transportPayload = { ...payload, files: Object.fromEntries(Object.entries(payload.files).map(([name, file]) => {
    const content = Buffer.from(file.base64, 'base64').toString('utf8')
    if (Buffer.from(content).toString('base64') !== file.base64) throw new Error('Bootstrap files must be UTF-8 source')
    return [name, { mode: file.mode, sha256: file.sha256, content }]
  })) }
  const bundle = canonical({ operatorSource, managerSource, transportPayload, readinessText, transactionId, probeText })
  const encoded = gzipSync(bundle, { level: 9 }).toString('base64')
  const node = `
import fs from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
let operator, stage = 'transport-load';
try {
if (process.getuid() !== 0 || process.getgid() !== 0) throw new Error('Root only');
const bytes = gunzipSync(Buffer.from('${encoded}', 'base64'));
if (createHash('sha256').update(bytes).digest('hex') !== '${hash(bundle)}') throw new Error('Bundle mismatch');
const input = JSON.parse(bytes);
const data = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const managerURL = data(input.managerSource);
const source = input.operatorSource.replace("'./eqb-deploy-barrier.mjs'", JSON.stringify(managerURL));
operator = await import(data(source));
input.payloadText = operator.canonical({...input.transportPayload, files: Object.fromEntries(Object.entries(input.transportPayload.files).map(([name, file]) => [name, {mode:file.mode,sha256:file.sha256,base64:Buffer.from(file.content).toString('base64')}]))});
if (createHash('sha256').update(input.payloadText).digest('hex') !== '${hash(payloadText)}') throw new Error('Payload mismatch');
${install ? `
stage = 'dispatch-stage';
const manager = await import(managerURL);
manager.safeAncestors('/opt/eqb/deployments/deploy.lock');
const root = '/opt/eqb/deployments/barrier-dispatch-' + input.transactionId;
fs.mkdirSync(root, {mode: 0o700});
manager.syncDirectory('/opt/eqb/deployments');
for (const [name, text] of Object.entries({
  'eqb-barrier-bootstrap.mjs': input.operatorSource,
  'eqb-deploy-barrier.mjs': input.managerSource,
  'payload.json': input.payloadText,
  'readiness.json': input.readinessText,
})) manager.privateWrite(root + '/' + name, text);
stage = 'manager-launch';
const unit = 'eqb-barrier-install-' + input.transactionId;
const result = spawnSync('/usr/bin/systemd-run', ['--quiet', '--wait', '--collect', '--unit=' + unit,
  '--property=Type=exec', '--property=UMask=0077', '--property=KillMode=control-group',
  '--property=StandardInput=null', '--property=StandardOutput=journal', '--property=StandardError=journal',
  '--', '/usr/bin/env', '-i', 'PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin', '/usr/bin/node', '--no-addons',
  root + '/eqb-barrier-bootstrap.mjs', 'install', root + '/payload.json', root + '/readiness.json', input.transactionId],
  {encoding:'utf8', maxBuffer:1024*1024, env:{PATH:'/usr/local/bin:/usr/bin:/bin:/usr/sbin'}});
if (result.error || result.status === null) {
  manager.readonlyCommand(stage, '', [], {}, () => result);
}
stage = 'journal-sync';
manager.readonlyCommand(stage, '/usr/bin/journalctl', ['--sync']);
stage = 'journal-read';
const output = manager.readonlyCommand(stage, '/usr/bin/journalctl', ['--quiet', '--no-pager', '--output=cat', '_SYSTEMD_UNIT=' + unit + '.service', 'PRIORITY=6']);
const readiness = operator.parseReadiness(input.readinessText, input.payloadText);
const receipt = operator.parseInstallExecution({output, exitCode:result.status}, {
  transactionId:input.transactionId, targetSha:input.transportPayload.targetSha,
  previousSha:readiness.previousSha, productionSha:readiness.productionSha,
  payloadDigest:'${hash(payloadText)}', readinessDigest:'${hash(readinessText)}'
});
process.stdout.write(operator.canonical(receipt));
process.exitCode = receipt.conclusion === 'success' ? 0 : 70;
` : `
const manager = await import(managerURL);
manager.safeAncestors('/opt/eqb/deployments/deploy.lock');
const report = manager.withDeploymentLock('/opt/eqb', () => ${probe
    ? 'operator.preInstallProbe(input.payloadText, input.probeText)'
    : 'operator.inspectHost(input.payloadText)'});
process.stdout.write(operator.canonical(report));
${probe ? "process.exitCode = report.current === 'passed' ? 0 : 70;" : ''}
`}
} catch (error) {
  const fallback = ${JSON.stringify(failureResult(responseId, 'transport-load'))};
  process.stdout.write(operator ? operator.canonical(operator.failureResult(${JSON.stringify(responseId)}, stage, error)) : JSON.stringify(fallback) + '\\n');
  process.exitCode = 70;
}
`
  const command = `#!/usr/bin/env bash\nset -Eeuo pipefail\numask 077\n/usr/bin/env -i PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin /usr/bin/node --no-addons --input-type=module <<'EQB_BARRIER_NODE'\n${node}\nEQB_BARRIER_NODE\n`
  if (Buffer.byteLength(Buffer.from(command).toString('base64')) > 64 * 1024) throw new Error('Bootstrap TAT payload exceeds limit')
  return { command, commandDigest: hash(command), operatorDigest: hash(operatorSource), payloadDigest: hash(payloadText) }
}

// Standalone diagnostic only: never called by probe/install or sent automatically.
// Node extra 'pipe' descriptors are sockets on Linux; fopen('/dev/fd/3') can
// fail with ENXIO. Capture headers and write-out together on ordinary stdout.
export function liveMainHttpSummary(result) {
  const report = { stage: 'unknown', curlExit: Number.isInteger(result.status) ? result.status : null,
    spawnCode: ['ENOENT', 'EACCES', 'ETIMEDOUT', 'ENOBUFS'].includes(result.error?.code) ? result.error.code : null,
    httpStatus: null, sslVerifyResult: null, stderrBytes: Buffer.byteLength(result.stderr || ''),
    rateRemaining: null, rateReset: null, retryAfter: null, hasLocation: false, hasGitHubRequestId: false,
    profile: 'no-config-anonymous' }
  try {
    if (result.error || result.signal || ![0, 22].includes(result.status)) return report
    const bytes = Buffer.from(result.stdout || '')
    if (bytes.some(byte => byte > 126 || (byte < 32 && ![9, 10, 13].includes(byte)))) return report
    const text = bytes.toString('ascii')
    const boundary = text.indexOf('\r\n\r\n')
    if (boundary < 0) return report
    const tail = /^([1-5][0-9]{2}) (0|[1-9][0-9]*)$/.exec(text.slice(boundary + 4))
    const lines = text.slice(0, boundary).split('\r\n')
    const status = /^HTTP\/(?:1\.[01]|2|3) ([1-5][0-9]{2})(?: [^\r\n]*)?$/.exec(lines.shift())
    if (!tail || !status || status[1] !== tail[1] || tail[2] !== '0'
      || (Number(tail[1]) >= 400 ? result.status !== 22 : result.status !== 0)) return report
    const headers = new Map()
    for (const line of lines) {
      const pair = /^([!#$%&'*+.^_`|~0-9A-Za-z-]+):[ \t]*([^\r\n]*)$/.exec(line)
      if (!pair || headers.has(pair[1].toLowerCase())) return report
      headers.set(pair[1].toLowerCase(), pair[2].trim())
    }
    const number = name => {
      if (!headers.has(name)) return null
      const value = headers.get(name)
      if (!/^(0|[1-9][0-9]*)$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error('Invalid numeric header')
      return Number(value)
    }
    const rateRemaining = number('x-ratelimit-remaining'), rateReset = number('x-ratelimit-reset'), retryAfter = number('retry-after')
    return { ...report, stage: 'live-main-http', httpStatus: Number(tail[1]), sslVerifyResult: 0,
      rateRemaining, rateReset, retryAfter, hasLocation: headers.has('location'), hasGitHubRequestId: headers.has('x-github-request-id') }
  } catch { return report }
}

export function parseLiveMainHttpDiagnostic(text, exitCode) {
  let value
  try { value = JSON.parse(text) } catch { throw new Error('Invalid HTTP diagnostic') }
  const template = liveMainHttpSummary({})
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || canonical(value) !== text || Object.keys(value).sort().join() !== Object.keys(template).sort().join()
    || value.profile !== template.profile || !['unknown', 'live-main-http'].includes(value.stage)
    || ![null, 'ENOENT', 'EACCES', 'ETIMEDOUT', 'ENOBUFS'].includes(value.spawnCode)
    || !['curlExit', 'httpStatus', 'sslVerifyResult', 'rateRemaining', 'rateReset', 'retryAfter'].every(key =>
      value[key] === null || (Number.isSafeInteger(value[key]) && value[key] >= 0))
    || !Number.isSafeInteger(value.stderrBytes) || value.stderrBytes < 0
    || typeof value.hasLocation !== 'boolean' || typeof value.hasGitHubRequestId !== 'boolean') throw new Error('Invalid HTTP diagnostic')
  if (value.stage === 'unknown') {
    if (['httpStatus', 'sslVerifyResult', 'rateRemaining', 'rateReset', 'retryAfter'].some(key => value[key] !== null)
      || value.hasLocation || value.hasGitHubRequestId) throw new Error('Unknown HTTP diagnostic claims evidence')
  } else if (value.spawnCode !== null || !Number.isInteger(value.httpStatus) || value.httpStatus < 100 || value.httpStatus > 599
    || value.sslVerifyResult !== 0 || value.curlExit !== (value.httpStatus >= 400 ? 22 : 0)) throw new Error('HTTP diagnostic exit mismatch')
  if (exitCode !== (value.stage === 'unknown' ? 70 : 0)) throw new Error('HTTP diagnostic transport exit mismatch')
  return value
}

export function buildLiveMainHttpDiagnosticCommand() {
  const command = `#!/usr/bin/env bash
set -Eeuo pipefail
/usr/bin/env -i PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin /usr/bin/node --no-addons --input-type=module <<'EQB_HTTP_NODE'
import { spawnSync } from 'node:child_process';
const summarize = ${liveMainHttpSummary.toString()};
let result;
if (process.getuid() !== 0 || process.getgid() !== 0) {
  result = { error: { code: 'EACCES' } };
} else {
  try {
    result = spawnSync('/usr/bin/curl', ['-q', '--fail', '--silent', '--show-error', '--max-time', '10',
      '--output', '/dev/null', '--dump-header', '-', '--write-out', '%{http_code} %{ssl_verify_result}',
      'https://api.github.com/repos/Buqisir/english-question-bank/git/ref/heads/main'],
      { env: { PATH: '/usr/local/bin:/usr/bin:/bin:/usr/sbin' }, timeout: 15000, maxBuffer: 65536,
        stdio: ['ignore', 'pipe', 'pipe'] });
  } catch { result = { status: null }; }
}
const report = summarize(result);
process.stdout.write(JSON.stringify(Object.fromEntries(Object.entries(report).sort(([a], [b]) => a.localeCompare(b)))) + '\\n');
process.exitCode = report.stage === 'unknown' ? 70 : 0;
EQB_HTTP_NODE
`
  return { command, commandDigest: hash(command) }
}
