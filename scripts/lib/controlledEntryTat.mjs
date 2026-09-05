import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { parseControlledTransaction } from './ampOrbDeploy.mjs'

const hash = value => createHash('sha256').update(value).digest('hex')
export const CONTROLLED_ENTRY_FILES = Object.freeze([
  'deploy/Caddyfile.release', 'deploy/eqb-release.service',
  'deploy/eqb-deploy-controller.mjs', 'deploy/eqb-deploy-controller',
  'deploy/eqb-deploy-transport', 'deploy/install-eqb-controlled-ssh',
])

// Bytes only; this neither reads credentials nor dispatches. No archive paths,
// links, download, background unit or second installer state machine.
export function buildControlledEntryTat({ files, planText, terminalText }) {
  const plan = JSON.parse(planText)
  const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u
  if (!uuid.test(plan.transactionId) || !uuid.test(plan.priorTransactionId)
    || plan.transactionId === plan.priorTransactionId
    || !/^[a-f0-9]{40}$/u.test(plan.targetSha)
    || plan.priorTerminalDigest !== hash(terminalText)
    || Object.keys(files).sort().join('\n') !== [...CONTROLLED_ENTRY_FILES].sort().join('\n')) {
    throw new Error('Invalid controlled entry inputs')
  }
  const directory = `/opt/eqb/deployments/controlled-entry-${plan.transactionId}`
  if (plan.priorTerminalFile !== `${directory}/terminal.json`) throw new Error('Invalid terminal path')
  const payload = JSON.stringify(Object.fromEntries(CONTROLLED_ENTRY_FILES.map(name => {
    const bytes = Buffer.from(files[name])
    const content = bytes.toString('utf8')
    if (!Buffer.from(content).equals(bytes)) throw new Error('Installer files must be UTF-8 source')
    return [name, { content, digest: hash(bytes) }]
  })))
  const bundle = JSON.stringify({ payload, planText, terminalText })
  const encoded = gzipSync(bundle, { level: 9 }).toString('base64')
  const node = `
import fs from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const hash = value => createHash('sha256').update(value).digest('hex');
try {
if (process.getuid() !== 0 || process.getgid() !== 0) throw 0;
const bytes = gunzipSync(Buffer.from('${encoded}', 'base64'), {maxOutputLength: 2097152});
if (hash(bytes) !== '${hash(bundle)}') throw 0;
const input = JSON.parse(bytes);
for (const name of ['/opt', '/opt/eqb', '/opt/eqb/deployments']) {
  const s = fs.lstatSync(name);
  if (!s.isDirectory() || s.isSymbolicLink() || s.uid !== 0 || s.gid !== 0 || (s.mode & 0o022)) throw 0;
}
const directory = '${directory}';
fs.mkdirSync(directory, {mode: 0o700});
const save = (name, bytes) => fs.writeFileSync(name, bytes, {mode: 0o600, flag: 'wx', flush: true});
save(directory + '/plan.json', input.planText);
save(directory + '/terminal.json', input.terminalText);
fs.mkdirSync(directory + '/deploy', {mode: 0o700});
const files = JSON.parse(input.payload);
if (Object.keys(files).sort().join(',') !== '${[...CONTROLLED_ENTRY_FILES].sort().join(',')}') throw 0;
for (const [name, entry] of Object.entries(files)) {
  const bytes = Buffer.from(entry.content, 'utf8');
  if (hash(bytes) !== entry.digest) throw 0;
  save(directory + '/' + name, bytes);
}
const result = spawnSync('/bin/bash', [directory + '/deploy/install-eqb-controlled-ssh',
  directory + '/plan.json', '${hash(planText)}'],
  {encoding:'utf8', maxBuffer:1048576, env:{PATH:'/usr/local/bin:/usr/bin:/bin'}});
// Preserve output privately, never echo arbitrary root diagnostics to TAT.
save(directory + '/install.stdout', result.stdout || '');
save(directory + '/install.stderr', result.stderr || '');
const text = result.stdout || '';
if (!result.error && [0,70].includes(result.status)
  && /^EQB_CONTROLLED_TRANSACTION [^\\r\\n]+\\n$/.test(text)) process.stdout.write(text);
process.exitCode = result.error || result.status === null ? 70 : result.status;
} catch { process.stderr.write('Controlled entry delivery unknown; do not retry\\n'); process.exitCode = 70; }
`
  const command = `#!/bin/bash\nset -eu\numask 077\nexec /usr/bin/env -i PATH=/usr/local/bin:/usr/bin:/bin /usr/bin/node --no-addons --input-type=module <<'EQB_ENTRY'\n${node}\nEQB_ENTRY\n`
  if (Buffer.from(command).toString('base64').length > 65536) throw new Error('Controlled entry exceeds TAT limit')
  return { command, plan, planDigest: hash(planText), payloadDigest: hash(payload),
    installerDigest: hash(Buffer.from(files['deploy/install-eqb-controlled-ssh'])),
    commandDigest: hash(command), commandBytes: Buffer.byteLength(command) }
}

// save must durably write private evidence, exclusively, before returning.
// A thrown adapter call supplies no terminal: preserve UNKNOWN, never invent one.
export async function executeControlledEntryTat({ prepared, targetDigest, execute, save }) {
  const { plan } = prepared
  save('binding.json', JSON.stringify({ ...prepared, command: undefined, targetDigest }))
  save('command.sh', prepared.command)
  try {
    const terminal = await execute(prepared.command)
    save('terminal.json', JSON.stringify(terminal))
    if (terminal.targetDigest !== targetDigest
      || !['SUCCESS', 'FAILED'].includes(terminal.invocationStatus)
      || terminal.taskStatus !== terminal.invocationStatus
      || (terminal.invocationStatus === 'SUCCESS') !== (terminal.exitCode === 0)) throw 0
    const record = parseControlledTransaction(terminal.output, {
      transactionId: plan.transactionId, command: 'install-entry',
      sha: plan.targetSha, digest: prepared.planDigest,
    }, terminal.exitCode)
    if (record.previousSha !== plan.productionSha
      || record.receipt.previousHostConfigurationSha !== plan.hostConfigurationSha
      || record.receipt.priorTransactionId !== plan.priorTransactionId
      || record.receipt.priorTerminalDigest !== plan.priorTerminalDigest
      || (record.state === 'success' && record.receipt.rollbackHealthy !== null)
      || (record.state === 'failure' && record.receipt.rollbackHealthy !== true)) throw 0
    save('result.json', JSON.stringify(record))
    return record
  } catch {
    save('unknown.json', JSON.stringify({ transactionId: plan.transactionId, state: 'unknown', retryAllowed: false }))
    throw new Error('Controlled entry outcome unknown; preserve evidence and do not retry')
  }
}
