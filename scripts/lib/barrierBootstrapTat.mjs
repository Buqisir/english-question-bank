import { gzipSync } from 'node:zlib'
import { canonical, parsePayload, parseReadiness } from '../../deploy/eqb-barrier-bootstrap.mjs'
import { hash } from '../../deploy/eqb-deploy-barrier.mjs'

// Returns bytes only. Dispatch/poll is the existing single-shot TAT adapter;
// neither constructing a command nor computing its digest reads credentials.
export function buildBarrierTatCommand({ operatorSource, payloadText, readinessText = null, transactionId = null }) {
  const payload = parsePayload(payloadText)
  if (typeof operatorSource !== 'string' || !operatorSource.startsWith('#!/usr/bin/env node\n')
    || operatorSource.includes('\0')) throw new Error('Invalid bootstrap operator source')
  const managerSource = Buffer.from(payload.files['deploy/eqb-deploy-barrier.mjs'].base64, 'base64').toString('utf8')
  const install = readinessText !== null
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
  const bundle = canonical({ operatorSource, managerSource, transportPayload, readinessText, transactionId })
  const encoded = gzipSync(bundle, { level: 9 }).toString('base64')
  const node = `
import fs from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
if (process.getuid() !== 0 || process.getgid() !== 0) throw new Error('Root only');
const bytes = gunzipSync(Buffer.from('${encoded}', 'base64'));
if (createHash('sha256').update(bytes).digest('hex') !== '${hash(bundle)}') throw new Error('Bundle mismatch');
const input = JSON.parse(bytes);
const data = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const managerURL = data(input.managerSource);
const source = input.operatorSource.replace("'./eqb-deploy-barrier.mjs'", JSON.stringify(managerURL));
const operator = await import(data(source));
input.payloadText = operator.canonical({...input.transportPayload, files: Object.fromEntries(Object.entries(input.transportPayload.files).map(([name, file]) => [name, {mode:file.mode,sha256:file.sha256,base64:Buffer.from(file.content).toString('base64')}]))});
if (createHash('sha256').update(input.payloadText).digest('hex') !== '${hash(payloadText)}') throw new Error('Payload mismatch');
${install ? `
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
` : `
const manager = await import(managerURL);
manager.safeAncestors('/opt/eqb/deployments/deploy.lock');
const report = manager.withDeploymentLock('/opt/eqb', () => operator.inspectHost(input.payloadText));
process.stdout.write(operator.canonical(report));
`}
`
  let command = `#!/usr/bin/env bash\nset -Eeuo pipefail\numask 077\n/usr/bin/env -i PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin /usr/bin/node --no-addons --input-type=module <<'EQB_BARRIER_NODE'\n${node}\nEQB_BARRIER_NODE\n`
  if (install) {
    const root = `/opt/eqb/deployments/barrier-dispatch-${transactionId}`
    const unit = `eqb-barrier-install-${transactionId}`
    command += `status=0
/usr/bin/systemd-run --quiet --wait --collect --unit=${unit} --property=Type=exec --property=UMask=0077 --property=KillMode=control-group --property=StandardInput=null --property=StandardOutput=journal --property=StandardError=journal -- /usr/bin/env -i PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin /usr/bin/node --no-addons ${root}/eqb-barrier-bootstrap.mjs install ${root}/payload.json ${root}/readiness.json ${transactionId} || status=$?
/usr/bin/journalctl --sync
/usr/bin/journalctl --quiet --no-pager --output=cat _SYSTEMD_UNIT=${unit}.service PRIORITY=6
exit "$status"
`
  }
  if (Buffer.byteLength(Buffer.from(command).toString('base64')) > 64 * 1024) throw new Error('Bootstrap TAT payload exceeds limit')
  return { command, commandDigest: hash(command), operatorDigest: hash(operatorSource), payloadDigest: hash(payloadText) }
}
