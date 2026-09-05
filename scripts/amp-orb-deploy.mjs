#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  AMP_ORB_DEPLOY_AMP_CHECK_NAME,
  AMP_ORB_DEPLOY_REPOSITORY,
  EQB_HOST_CONFIGURATION_PATHS,
  EQB_PERSISTENCE_AUTHORITY_PATHS,
  abandonReleaseBootstrapRecovery,
  assertDeploymentCandidateStillCurrent,
  bootstrapPayloadStageInput,
  bootstrapReleaseLayout,
  classifyReleaseBootstrapJournal,
  classifyReleaseBootstrapOutcome,
  clearCompletedReleaseBootstrapRecovery,
  completeReleaseBootstrapRecovery,
  createReleaseBootstrapRecovery,
  deployReviewedPersistenceLatest,
  deployLatestRelease,
  deploymentGitHubApiArgs,
  deploymentAuthorityFromEnvironment,
  deploymentSSHInvocation,
  deploymentSSHTransportUser,
  isSshPublicKeyAuthenticationDenied,
  materializeDeploymentCredentials,
  migrateLegacyProductionBaseline,
  parseBootstrapKeyRetirementReceipt,
  parseControlledTransaction,
  parseReleaseBootstrapCancellation,
  parseDeploymentControllerOutput,
  parseDeploymentControllerPreflight,
  parseDeploymentPreflightOutput,
  parseHostConfigurationControllerOutput,
  parseMaintenanceInstallReadiness,
  parseOpenSshEd25519PublicKeyBody,
  parseReviewedPersistenceControllerOutput,
  readCompletedReleaseBootstrapRecovery,
  readDeploymentCheckRuns,
  readReleaseBootstrapRecovery,
  removeReleaseBootstrapRecovery,
  requireMaintenanceInstallReadinessAuthorization,
  requireReleaseLayoutBootstrapAuthorization,
  requireReleaseLayoutBootstrapAbandonAuthorization,
  requireReleaseLayoutBootstrapResumeAuthorization,
  resumeReleaseLayoutBootstrap,
  resolveLatestDeploymentCandidate,
  syncDirectory,
  updateLatestHostConfiguration,
  verifyDeploymentAuthority,
} from './lib/ampOrbDeploy.mjs'
import {
  buildMaintenanceReadinessTatCommand,
  executeTencentTatCommand,
  readTencentTatConfiguration,
  tencentTatTargetDigest,
} from './lib/tencentTat.mjs'
import { buildBarrierTatCommand } from './lib/barrierBootstrapTat.mjs'
import { CONTROLLED_ENTRY_FILES, buildControlledEntryTat, executeControlledEntryTat } from './lib/controlledEntryTat.mjs'
import { buildPayload, canonical, failureResult, parseFailure, parseReadiness, parseInstallExecution, parseRouteProof } from '../deploy/eqb-barrier-bootstrap.mjs'
import { priorTatEvidence, parseProbeRequest, parseProbeExecution, failedProbe } from '../deploy/eqb-barrier-bootstrap.mjs'

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url))
const legacyBaselineSource = fileURLToPath(
  new URL('../deploy/eqb-legacy-baseline.mjs', import.meta.url),
)
const legacyBaselineStateSource = fileURLToPath(
  new URL('../deploy/eqb-legacy-baseline-state.mjs', import.meta.url),
)
const releaseBootstrapSource = fileURLToPath(
  new URL('../deploy/bootstrap-eqb-deployment.sh', import.meta.url),
)
const bootstrapKeyRetirementSource = fileURLToPath(
  new URL('../deploy/retire-eqb-bootstrap-key.mjs', import.meta.url),
)
const bootstrapCancellationSource = fileURLToPath(
  new URL('../deploy/cancel-eqb-bootstrap-attempt.mjs', import.meta.url),
)
const maintenanceInspectorPath = 'deploy/inspect-eqb-maintenance-host.sh'
const maintenancePayloadPaths = Object.freeze([
  'deploy/Caddyfile.release',
  'deploy/eqb-release.service',
  'deploy/eqb-deploy-transport',
  'deploy/eqb-deploy-controller',
  'deploy/eqb-deploy-controller.mjs',
  maintenanceInspectorPath,
])
const legacyReleaseChildDigest = '25d8acc95172626cf03de96b2cc61d0f81508352082b976b9f1095bfbe15d4d5'
const legacyReleaseChildFileCount = 4876
const bootstrapRecoveryRoot = path.join(homedir(), '.local', 'state', 'eqb-deployment')

function runGit(args) {
  return execFileSync('git', args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
  })
}

function isLocalAncestor(previousSha, targetSha) {
  const result = spawnSync('git', ['merge-base', '--is-ancestor', previousSha, targetSha], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  })
  if (result.error || ![0, 1].includes(result.status)) {
    throw new Error('Cannot compare deployment baseline ancestry')
  }
  return result.status === 0
}

function readLocalProtectedDiff(previousSha, targetSha, protectedPaths) {
  if (
    protectedPaths !== EQB_PERSISTENCE_AUTHORITY_PATHS
    && protectedPaths !== EQB_HOST_CONFIGURATION_PATHS
  ) {
    throw new Error('Deployment protected path set is invalid')
  }
  const result = spawnSync('git', [
    'diff', '--name-only', '--no-renames', previousSha, targetSha, '--', ...protectedPaths,
  ], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  })
  if (result.error || result.status !== 0) {
    throw new Error('Cannot compare deployment persistence authority')
  }
  return String(result.stdout || '').trim().split('\n').filter(Boolean)
}

function readGitHubJson(endpoint) {
  return JSON.parse(execFileSync(
    'gh',
    deploymentGitHubApiArgs(endpoint),
    { cwd: repositoryRoot, encoding: 'utf8' },
  ))
}

function readCommitChecks(sha, { amp = false } = {}) {
  return readDeploymentCheckRuns({
    sha,
    checkName: amp ? AMP_ORB_DEPLOY_AMP_CHECK_NAME : null,
    readJson: readGitHubJson,
  })
}

function readMainSha() {
  const ref = readGitHubJson(`repos/${AMP_ORB_DEPLOY_REPOSITORY}/git/ref/heads/main`)
  return ref?.object?.sha
}

function readWorkflowRun(runId) {
  return readGitHubJson(`repos/${AMP_ORB_DEPLOY_REPOSITORY}/actions/runs/${runId}`)
}

const deploymentAuthority = deploymentAuthorityFromEnvironment(process.env)

function readDeploymentVerification(sha) {
  return verifyDeploymentAuthority({
    authority: deploymentAuthority,
    expectedSha: sha,
    runGit,
    classifyPaths: (paths) => JSON.parse(execFileSync(process.execPath, [
      'scripts/verify-ci.mjs', '--plan-json',
      ...paths.flatMap((file) => ['--changed-file', file]),
    ], { cwd: repositoryRoot, encoding: 'utf8' })).risk,
    readHostedChecks: (expectedSha) => readCommitChecks(expectedSha),
    readWorkflowRun,
    readAmpChecks: (expectedSha) => readCommitChecks(expectedSha, { amp: true }),
  })
}

function readLocalSha() {
  return runGit(['rev-parse', 'HEAD']).trim()
}

function readLocalStatus() {
  return runGit(['status', '--porcelain'])
}

function assertCandidateStillAuthoritative(resolved) {
  return assertDeploymentCandidateStillCurrent({
    readLocalSha,
    readLocalStatus,
    readMainSha,
    readDeploymentVerification,
    sha: resolved.sha,
  })
}

async function candidate() {
  return resolveLatestDeploymentCandidate({ runGit, readMainSha, readDeploymentVerification })
}

const bootstrapPreflightScript = `
set -euo pipefail
repo=/opt/eqb/english-question-bank
test -d "$repo"
head="$(/usr/bin/sudo -n /usr/sbin/runuser -u eqb -- /usr/bin/git -C "$repo" rev-parse HEAD)"
dirty="$(/usr/bin/sudo -n /usr/sbin/runuser -u eqb -- /usr/bin/git -C "$repo" status --porcelain --untracked-files=no | /usr/bin/wc -l)"
eqb="$(systemctl is-active eqb || true)"
caddy="$(systemctl is-active caddy || true)"
layout=legacy
if test -L /opt/eqb/current && test -d /opt/eqb/releases && test -d /opt/eqb/shared; then
  layout=release
fi
strict_health=invalid
if /usr/bin/timeout --signal=TERM --kill-after=2s 20s /bin/bash -c '
  set -e
  /usr/bin/systemctl is-active --quiet eqb
  /usr/bin/systemctl is-active --quiet caddy
  /usr/bin/curl --fail --silent --show-error --connect-timeout 3 --max-time 5 \
    http://127.0.0.1:8787/api/health >/dev/null
  /usr/bin/curl --fail --fail-early --silent --show-error --connect-timeout 3 --max-time 5 \
    --resolve eqbank.cc:443:127.0.0.1 \
    https://eqbank.cc/api/health https://eqbank.cc/ >/dev/null
  /usr/bin/curl --fail --fail-early --silent --show-error --connect-timeout 3 --max-time 5 \
    --parallel --parallel-immediate --parallel-max 4 \
    https://eqbank.cc/api/health \
    https://eqbank.cc/ \
    https://eqbank.cc/ops/ \
    "https://eqbank.cc/ops/?view=review" >/dev/null
'; then
  strict_health=ok
fi
printf 'productionSha=%s\\ntrackedDirtyPaths=%s\\neqb=%s\\ncaddy=%s\\nlayout=%s\\nstrictHealth=%s\\n' \
  "$head" "$dirty" "$eqb" "$caddy" "$layout" "$strict_health"
`

async function withDeploymentCredentials(callback) {
  const credentials = materializeDeploymentCredentials({
    privateKey: process.env.QUESTION_BANK_DEPLOY_SSH_PRIVATE_KEY,
    knownHosts: process.env.QUESTION_BANK_DEPLOY_SSH_KNOWN_HOSTS,
  })
  try {
    execFileSync('ssh-keygen', ['-y', '-f', credentials.keyPath], { stdio: 'ignore' })
    return await callback(credentials)
  } finally {
    credentials.cleanup()
  }
}

function invokeController(remoteArgs, credentials) {
  const markers = {
    deploy: 'EQB_DEPLOY_RECEIPT ',
    'deploy-reviewed-persistence': 'EQB_REVIEWED_PERSISTENCE_RECEIPT ',
    'update-host-config': 'EQB_HOST_CONFIGURATION_RECEIPT ',
  }
  const controlled = Object.hasOwn(markers, remoteArgs[0])
  const expected = controlled ? {
    command: remoteArgs[0], transactionId: randomUUID(), sha: remoteArgs[1], digest: remoteArgs[2] ?? null,
  } : remoteArgs[0] === 'status' ? { transactionId: remoteArgs[1] } : null
  if (controlled) {
    // Emit the safe correlation identity before dispatch, including when SSH
    // loses the response. Neither status nor repeating this UUID can execute it.
    console.error(JSON.stringify({ transactionId: expected.transactionId, targetSha: expected.sha }))
  }
  const invocation = deploymentSSHInvocation({
    host: String(process.env.QUESTION_BANK_DEPLOY_SSH_HOST || ''),
    keyPath: credentials.keyPath,
    knownHostsPath: credentials.knownHostsPath,
    remoteArgs: controlled ? [remoteArgs[0], expected.transactionId, ...remoteArgs.slice(1)] : remoteArgs,
  })
  const result = spawnSync(invocation.command, invocation.args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30 * 60 * 1000,
  })
  if (expected) {
    let record
    try {
      if (result.error) throw new Error('TRANSPORT_FAILED')
      record = parseControlledTransaction(result.stdout, expected, result.status)
    } catch {
      throw new Error(`Controlled outcome unknown; status ${expected.transactionId}; no retry`)
    }
    if (!controlled) return JSON.stringify(record)
    if (record.state !== 'success') {
      throw new Error(`Controlled ${record.state}; status ${expected.transactionId}; no retry`)
    }
    return `${markers[record.command]}${JSON.stringify(record.receipt)}\n`
  }
  if (result.error) throw result.error
  if (result.status === 75) throw new Error('Another production deployment is already running')
  if (result.status === 255) {
    throw new Error(
      'Production controller outcome is unknown after SSH transport failure; inspect preflight and host receipts before any retry',
    )
  }
  if (!String(result.stdout || '').trim()) {
    throw new Error(`Deployment controller exited without a receipt (code ${result.status})`)
  }
  if (result.status !== 0) {
    const receiptParser = remoteArgs[0] === 'deploy'
      ? parseDeploymentControllerOutput
      : remoteArgs[0] === 'deploy-reviewed-persistence'
        ? parseReviewedPersistenceControllerOutput
        : remoteArgs[0] === 'update-host-config'
          ? parseHostConfigurationControllerOutput
          : null
    if (receiptParser) {
      const receipt = receiptParser(result.stdout, remoteArgs[1], remoteArgs[2])
      throw new Error(
        `Production controller reported ${receipt.failureCode || 'failure'}: ${JSON.stringify(receipt)}`,
      )
    }
    throw new Error(`Deployment controller failed (code ${result.status})`)
  }
  return result.stdout
}

async function plan() {
  const resolved = await candidate()
  console.log(JSON.stringify({
    command: 'deploy latest',
    productionMutationAllowed: false,
    ...resolved,
  }, null, 2))
}

async function preflight() {
  if (!process.argv.includes('--owner-said-preflight')) {
    throw new Error('Current Owner authorization for the read-only production preflight is required')
  }
  const resolved = await candidate()
  await assertCandidateStillAuthoritative(resolved)
  return withDeploymentCredentials((credentials) => {
    console.log(JSON.stringify({
      candidate: resolved,
      productionMutationAllowed: false,
      remote: parseDeploymentControllerPreflight(
        invokeController(['preflight'], credentials),
      ),
    }, null, 2))
  })
}

function readMaintenancePayloadDigest(sha) {
  const archived = spawnSync('git', [
    'archive',
    '--format=tar',
    sha,
    '--',
    ...maintenancePayloadPaths,
  ], {
    cwd: repositoryRoot,
    encoding: null,
    maxBuffer: 4 * 1024 * 1024,
  })
  if (archived.error) throw archived.error
  if (archived.status !== 0 || !Buffer.isBuffer(archived.stdout) || archived.stdout.length === 0) {
    throw new Error('Cannot construct the exact maintenance-controller payload')
  }
  return createHash('sha256').update(archived.stdout).digest('hex')
}

function readExactCommitFile(sha, relativePath) {
  const result = spawnSync('git', ['show', `${sha}:${relativePath}`], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  })
  if (result.error) throw result.error
  if (result.status !== 0 || !String(result.stdout || '')) {
    throw new Error(`Cannot read exact candidate file ${relativePath}`)
  }
  return result.stdout
}

async function maintenanceInstallReadiness() {
  requireMaintenanceInstallReadinessAuthorization(process.argv.slice(2))
  const resolved = await candidate()
  const payloadDigest = readMaintenancePayloadDigest(resolved.sha)
  const host = String(process.env.QUESTION_BANK_DEPLOY_SSH_HOST || '')
  const transportUser = deploymentSSHTransportUser(host)
  const configuration = readTencentTatConfiguration()
  const command = buildMaintenanceReadinessTatCommand({
    inspectorSource: readExactCommitFile(resolved.sha, maintenanceInspectorPath),
    targetSha: resolved.sha,
    payloadDigest,
    transportUser,
  })
  await assertCandidateStillAuthoritative(resolved)
  const execution = await executeTencentTatCommand({
    command,
    commandName: `eqb-maint-readiness-${resolved.sha.slice(0, 16)}`,
    configuration,
  })
  const readiness = parseMaintenanceInstallReadiness(
    execution.output,
    resolved.sha,
    payloadDigest,
    transportUser,
  )
  console.log(JSON.stringify({
    command: 'inspect Tencent maintenance-controller installation readiness',
    productionMutationAllowed: false,
    candidate: resolved,
    payloadDigest,
    tencentTatTargetDigest: tencentTatTargetDigest(configuration),
    tencentTat: {
      commandId: execution.commandId,
      invocationId: execution.invocationId,
      invocationTaskId: execution.invocationTaskId,
      invocationStatus: execution.invocationStatus,
      taskStatus: execution.taskStatus,
      exitCode: execution.exitCode,
    },
    readiness,
  }, null, 2))
  if (execution.exitCode !== 0 || readiness.state !== 'ready') {
    throw new Error(
      `Tencent maintenance-install readiness failed closed: ${
        readiness.failureCode || 'REMOTE_COMMAND_FAILED'
      }`,
    )
  }
}

async function rootBarrierBootstrap(install) {
  const args = process.argv.slice(3)
  const authorization = install ? '--owner-said-root-barrier-install' : '--owner-said-root-barrier-readiness'
  if (args[0] !== authorization || args.length !== (install ? 9 : 1)
    || (install && (args[1] !== '--readiness' || args[3] !== '--payload-digest'
      || args[5] !== '--operator-digest' || args[7] !== '--transaction'))) {
    throw new Error('Exact current Owner root-barrier authorization and arguments required')
  }
  const resolved = await candidate()
  const payloadText = buildPayload(resolved.sha, (name) => readExactCommitFile(resolved.sha, name))
  const operatorSource = readExactCommitFile(resolved.sha, 'deploy/eqb-barrier-bootstrap.mjs')
  const readinessText = install ? readFileSync(args[2], 'utf8') : null
  const built = buildBarrierTatCommand({ operatorSource, payloadText, readinessText,
    transactionId: install ? args[8] : null })
  if (install && (built.payloadDigest !== args[4] || built.operatorDigest !== args[6])) {
    throw new Error('Approved root bootstrap digests differ from live main')
  }
  const configuration = readTencentTatConfiguration()
  await assertCandidateStillAuthoritative(resolved)
  // Exactly one RunCommand. The shared adapter treats lost acknowledgments as
  // unknown; there is no reinstall, retry, CI replay or authority fallback.
  let execution
  try {
    execution = await executeTencentTatCommand({ command: built.command,
      commandName: `eqb-barrier-${install ? 'install' : 'inspect'}-${resolved.sha.slice(0, 12)}`,
      description: install ? 'Owner-authorized EQB root barrier bootstrap (mutation)'
        : 'Read-only EQB root barrier installation readiness',
      configuration })
  } catch {
    console.log(canonical(failureResult(install ? args[8] : null, 'remote-output')).trimEnd())
    process.exitCode = 70
    return
  }
  if (!install) {
    try {
      const report = parseReadiness(execution.output, payloadText)
      if (execution.exitCode !== 0) throw new Error('Root readiness failed or unknown')
      console.log(canonical(report).trimEnd())
    } catch {
      let failure
      try { failure = parseFailure(execution.output, null) }
      catch { failure = failureResult(null, 'remote-output', { diagnostic: { exitCode: execution.exitCode } }) }
      console.log(canonical(failure).trimEnd())
      process.exitCode = 70
    }
    return
  }
  const report = parseReadiness(readinessText, payloadText)
  const receipt = parseInstallExecution(execution, { transactionId: args[8],
    payloadDigest: built.payloadDigest, targetSha: resolved.sha,
    previousSha: report.previousSha, productionSha: report.productionSha,
    readinessDigest: createHash('sha256').update(readinessText).digest('hex') })
  if (execution.exitCode !== 0 || receipt.conclusion !== 'success') {
    console.log(canonical(receipt).trimEnd())
    process.exitCode = 70
    return
  }
  // The manager has released deploy.lock. This forced route is independent,
  // not part of its rollback transaction; failure retains the active barrier.
  let forced = 'unknown'
  try {
    await withDeploymentCredentials((credentials) => {
      const result = parseDeploymentControllerPreflight(invokeController(['preflight'], credentials))
      if (result.productionSha !== report.productionSha || result.eqb !== 'active' || result.caddy !== 'active') {
        throw new Error('Post-install forced proof mismatch')
      }
    })
    forced = 'passed'
  } catch {
    process.exitCode = 70
  } finally {
    const text = canonical({ schemaVersion: 'eqb-barrier-route-proof-v1', install: receipt, forced,
      observedAt: new Date().toISOString() })
    parseRouteProof(text, { transactionId: args[8], targetSha: resolved.sha, payloadDigest: built.payloadDigest })
    console.log(text.trimEnd())
  }
}

async function rootBarrierProbe() {
  const args = process.argv.slice(3)
  if (args.length !== 5 || args[0] !== '--owner-said-root-barrier-probe'
    || args[1] !== '--request' || args[3] !== '--prior-tat') throw new Error('Exact readonly probe authorization required')
  const resolved = await candidate()
  const payloadText = buildPayload(resolved.sha, name => readExactCommitFile(resolved.sha, name))
  const requestText = readFileSync(args[2], 'utf8')
  const request = parseProbeRequest(requestText, payloadText)
  const tat = priorTatEvidence(readFileSync(args[4], 'utf8'))
  const digest = bytes => createHash('sha256').update(bytes).digest('hex')
  if (canonical(tat) !== canonical(request.prior.tat)
    || digest(buildPayload(request.prior.targetSha, name => readExactCommitFile(request.prior.targetSha, name))) !== request.prior.payloadDigest
    || digest(readExactCommitFile(request.prior.targetSha, 'deploy/eqb-barrier-bootstrap.mjs')) !== request.prior.operatorDigest) {
    throw new Error('Prior export or exact Git source binding differs')
  }
  const built = buildBarrierTatCommand({ operatorSource: readExactCommitFile(resolved.sha, 'deploy/eqb-barrier-bootstrap.mjs'),
    payloadText, probeText: requestText })
  const configuration = readTencentTatConfiguration()
  if (tencentTatTargetDigest(configuration) !== tat.targetDigest) throw new Error('Prior TAT target differs')
  await assertCandidateStillAuthoritative(resolved)
  let report
  try {
    const execution = await executeTencentTatCommand({ command: built.command,
      commandName: `eqb-barrier-probe-${resolved.sha.slice(0, 12)}`,
      description: 'Read-only EQB pre-install risk probe; no transaction execution', configuration })
    report = parseProbeExecution(execution, requestText, payloadText)
  } catch { report = failedProbe(requestText, payloadText) }
  console.log(canonical(report).trimEnd())
  process.exitCode = report.current === 'passed' ? 0 : 70
}

async function bootstrapPreflight() {
  if (!process.argv.includes('--owner-said-preflight')) {
    throw new Error('Current Owner authorization for the read-only production preflight is required')
  }
  const resolved = await candidate()
  await assertCandidateStillAuthoritative(resolved)
  console.log(JSON.stringify({
    candidate: resolved,
    productionMutationAllowed: false,
    transitionOnly: true,
    remote: await readLegacyPreflight(resolved),
  }, null, 2))
}

function readLegacyPreflight(_candidate, { keyPath: recoveredKeyPath = null } = {}) {
  return withDeploymentCredentials((credentials) => {
    const host = String(process.env.QUESTION_BANK_DEPLOY_SSH_HOST || '')
    const transportUser = deploymentSSHTransportUser(host)
    const keyPath = recoveredKeyPath || credentials.keyPath
    const invocation = deploymentSSHInvocation({
      host,
      keyPath,
      knownHostsPath: credentials.knownHostsPath,
    })
    const remote = spawnSync(invocation.command, invocation.args, {
      encoding: 'utf8',
      input: bootstrapPreflightScript,
    })
    if (remote.error) throw remote.error
    if (remote.status !== 0) throw new Error('Legacy deployment preflight failed')
    const productionLines = String(remote.stdout || '').split('\n')
      .filter((line) => line.startsWith('productionSha='))
    if (productionLines.length !== 1 || !/^productionSha=[a-f0-9]{40}$/u.test(productionLines[0])) {
      throw new Error('Legacy deployment preflight SHA is invalid')
    }
    const productionSha = productionLines[0].slice('productionSha='.length)
    const evidenceInvocation = deploymentSSHInvocation({
      host,
      keyPath,
      knownHostsPath: credentials.knownHostsPath,
      remoteArgs: [
        'sudo', '-n',
        '/usr/bin/env',
        'EQB_LEGACY_BASELINE_INSPECT_STDIN=1',
        '/usr/bin/node',
        '--input-type=module',
        '-',
        '/opt/eqb/english-question-bank',
        '/var/backups/eqb',
        '/home/eqb',
        productionSha,
        legacyReleaseChildDigest,
        String(legacyReleaseChildFileCount),
        'eqb',
        transportUser,
      ],
    })
    const evidence = spawnSync(evidenceInvocation.command, evidenceInvocation.args, {
      encoding: 'utf8',
      input: readFileSync(legacyBaselineStateSource, 'utf8'),
      maxBuffer: 16 * 1024 * 1024,
      timeout: 5 * 60 * 1000,
    })
    if (evidence.error) throw evidence.error
    if (evidence.status !== 0) throw new Error('Legacy baseline evidence inspection failed')
    return parseDeploymentPreflightOutput(`${remote.stdout}\n${evidence.stdout}`)
  })
}

function invokeLegacyBaseline({ candidate, preflight }) {
  return withDeploymentCredentials((credentials) => {
    const invocation = deploymentSSHInvocation({
      host: String(process.env.QUESTION_BANK_DEPLOY_SSH_HOST || ''),
      keyPath: credentials.keyPath,
      knownHostsPath: credentials.knownHostsPath,
      remoteArgs: [
        'sudo', '-n',
        '/usr/bin/flock',
        '--exclusive',
        '--nonblock',
        '--conflict-exit-code', '75',
        '/var/lock/eqb-legacy-baseline.lock',
        '/usr/bin/env',
        'EQB_PHASE1_REPO_ROOT=/opt/eqb/english-question-bank',
        `EQB_PHASE1_OLD_SHA=${preflight.productionSha}`,
        `EQB_PHASE1_TARGET_SHA=${candidate.sha}`,
        `EQB_PHASE1_RELEASE_CHILD_DIGEST=${legacyReleaseChildDigest}`,
        'EQB_PHASE1_PUBLIC_HOST=eqbank.cc',
        'EQB_PHASE1_GIT_HOST=github.com',
        'EQB_PHASE1_SOURCE_HOME=/home/eqb',
        '/usr/bin/node',
        '--input-type=module',
        '-',
      ],
    })
    const remote = spawnSync(invocation.command, invocation.args, {
      encoding: 'utf8',
      input: readFileSync(legacyBaselineSource, 'utf8'),
      maxBuffer: 4 * 1024 * 1024,
      timeout: 3 * 60 * 60 * 1000,
    })
    if (remote.error) throw remote.error
    if (remote.status === 75) throw new Error('Another baseline migration is already running')
    if (!String(remote.stdout || '').trim()) {
      throw new Error(`Legacy baseline operator exited without a receipt (code ${remote.status})`)
    }
    return { exitCode: remote.status, output: remote.stdout }
  })
}

async function baseline() {
  const result = await migrateLegacyProductionBaseline({
    argv: process.argv.slice(2),
    resolveCandidate: candidate,
    revalidateCandidate: assertCandidateStillAuthoritative,
    readLegacyPreflight,
    invokeOperator: invokeLegacyBaseline,
  })
  console.log(JSON.stringify({
    command: 'protected legacy baseline migration',
    productionMutationAllowed: true,
    ...result,
  }, null, 2))
}

function publicKeyBody(privateKeyPath) {
  const publicKey = execFileSync('ssh-keygen', ['-y', '-f', privateKeyPath], {
    encoding: 'utf8',
  })
  return parseOpenSshEd25519PublicKeyBody(publicKey)
}

function generateControllerIdentity() {
  const directory = mkdtempSync(path.join(tmpdir(), 'eqb-controller-identity-'))
  chmodSync(directory, 0o700)
  const privateKeyPath = path.join(directory, 'id_ed25519')
  const publicKeyPath = `${privateKeyPath}.pub`
  try {
    execFileSync('ssh-keygen', [
      '-q', '-t', 'ed25519', '-N', '', '-C', '', '-f', privateKeyPath,
    ], { stdio: 'ignore' })
    chmodSync(privateKeyPath, 0o600)
    chmodSync(publicKeyPath, 0o600)
    const publicFields = readFileSync(publicKeyPath, 'utf8').trim().split(/\s+/u)
    const derivedBody = publicKeyBody(privateKeyPath)
    if (
      publicFields.length < 2
      || publicFields[0] !== 'ssh-ed25519'
      || !/^[A-Za-z0-9+/]+={0,3}$/u.test(publicFields[1])
      || derivedBody !== publicFields[1]
      || (statSync(privateKeyPath).mode & 0o777) !== 0o600
    ) {
      throw new Error('Generated deployment controller identity is invalid')
    }
    return {
      directory,
      privateKeyPath,
      publicKeyBody: publicFields[1],
      cleanup() {
        rmSync(directory, { recursive: true, force: true })
      },
    }
  } catch (error) {
    rmSync(directory, { recursive: true, force: true })
    throw error
  }
}

function identityFromRecovery(recovery, { projectId, transportTarget }) {
  if (
    recovery.projectId !== projectId
    || recovery.transportTargetDigest !== createHash('sha256').update(transportTarget).digest('hex')
  ) {
    throw new Error('Bootstrap recovery does not belong to this Deployment project and SSH target')
  }
  const controllerPublicKeyBody = publicKeyBody(recovery.controllerPrivateKeyPath)
  const bootstrapPublicKeyBody = publicKeyBody(recovery.bootstrapPrivateKeyPath)
  if (
    recovery.controllerPublicKeyDigest
      !== createHash('sha256').update(controllerPublicKeyBody).digest('hex')
    || recovery.bootstrapPublicKeyDigest
      !== createHash('sha256').update(bootstrapPublicKeyBody).digest('hex')
  ) {
    throw new Error('Bootstrap recovery identity digest is invalid')
  }
  return {
    directory: recovery.directory,
    targetSha: recovery.targetSha,
    unit: recovery.unit,
    privateKeyPath: recovery.controllerPrivateKeyPath,
    publicKeyBody: controllerPublicKeyBody,
    bootstrapPrivateKeyPath: recovery.bootstrapPrivateKeyPath,
    bootstrapPublicKeyBody,
    complete() {
      return completeReleaseBootstrapRecovery(recovery)
    },
    discard() {
      removeReleaseBootstrapRecovery(recovery)
    },
  }
}

function createControllerIdentityRecovery({ candidate: resolved, credentials, projectId, transportTarget }) {
  const generated = generateControllerIdentity()
  try {
    const recovery = createReleaseBootstrapRecovery({
      stateRoot: bootstrapRecoveryRoot,
      candidateSha: resolved.sha,
      projectId,
      transportTarget,
      unit: `eqb-release-bootstrap-${randomUUID().replaceAll('-', '')}`,
      controllerPrivateKey: readFileSync(generated.privateKeyPath, 'utf8'),
      controllerPublicKeyBody: generated.publicKeyBody,
      bootstrapPrivateKey: readFileSync(credentials.keyPath, 'utf8'),
      bootstrapPublicKeyBody: publicKeyBody(credentials.keyPath),
    })
    return identityFromRecovery(recovery, { projectId, transportTarget })
  } finally {
    generated.cleanup()
  }
}

function deploymentProjectId() {
  const projectId = String(process.env.AMP_PROJECT_ID || '')
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(projectId)) {
    throw new Error('Current Deployment Orb project identity is missing or invalid')
  }
  return projectId
}

function stageReleaseBootstrapPayload(candidate) {
  return withDeploymentCredentials((credentials) => {
    const host = String(process.env.QUESTION_BANK_DEPLOY_SSH_HOST || '')
    const bootstrapSource = readFileSync(releaseBootstrapSource, 'utf8')
    const bootstrapDigest = createHash('sha256').update(bootstrapSource).digest('hex')
    const payload = `/var/backups/eqb/bootstrap-payload-${candidate.sha}-${bootstrapDigest.slice(0, 16)}.sh`
    const stageInvocation = deploymentSSHInvocation({
      host,
      keyPath: credentials.keyPath,
      knownHostsPath: credentials.knownHostsPath,
      remoteArgs: [
        'sudo', '-n',
        '/bin/bash',
        '-s',
        '--',
        candidate.sha,
        bootstrapDigest,
      ],
    })
    const staged = spawnSync(stageInvocation.command, stageInvocation.args, {
      encoding: 'utf8',
      input: bootstrapPayloadStageInput(bootstrapSource, bootstrapDigest),
      maxBuffer: 4 * 1024 * 1024,
      timeout: 60_000,
    })
    if (staged.error) throw staged.error
    if (staged.status === 75) throw new Error('Another bootstrap payload staging operation is running')
    if (
      staged.status !== 0
      || String(staged.stdout || '').trim() !== `EQB bootstrap payload staged: ${candidate.sha}`
    ) {
      throw new Error('Release-layout bootstrap payload staging failed')
    }
    return payload
  })
}

function readBootstrapJournal(identity) {
  return withDeploymentCredentials((credentials) => {
    const host = String(process.env.QUESTION_BANK_DEPLOY_SSH_HOST || '')
    const syncInvocation = deploymentSSHInvocation({
      host,
      keyPath: identity.bootstrapPrivateKeyPath,
      knownHostsPath: credentials.knownHostsPath,
      remoteArgs: ['sudo', '-n', '/usr/bin/journalctl', '--sync'],
    })
    const synced = spawnSync(syncInvocation.command, syncInvocation.args, {
      encoding: 'utf8',
      timeout: 30_000,
    })
    if (synced.error) throw synced.error
    if (synced.status !== 0) {
      throw new Error('Release-layout bootstrap journal synchronization failed')
    }
    const journalInvocation = deploymentSSHInvocation({
      host,
      keyPath: identity.bootstrapPrivateKeyPath,
      knownHostsPath: credentials.knownHostsPath,
      remoteArgs: [
        'sudo', '-n',
        '/usr/bin/journalctl',
        '--quiet',
        '--no-pager',
        '--output=cat',
        `--unit=${identity.unit}.service`,
      ],
    })
    const journal = spawnSync(journalInvocation.command, journalInvocation.args, {
      encoding: 'utf8',
      timeout: 30_000,
    })
    if (journal.error) throw journal.error
    if (journal.status !== 0) {
      throw new Error('Release-layout bootstrap journal evidence is unavailable')
    }
    return `${journal.stdout || ''}\n${journal.stderr || ''}`
  })
}

function invokeReleaseBootstrap({ candidate, identity, payload }) {
  return withDeploymentCredentials(async (credentials) => {
    const host = String(process.env.QUESTION_BANK_DEPLOY_SSH_HOST || '')
    const transportUser = deploymentSSHTransportUser(host)
    const invocation = deploymentSSHInvocation({
      host,
      keyPath: identity.bootstrapPrivateKeyPath,
      knownHostsPath: credentials.knownHostsPath,
      remoteArgs: [
        'sudo', '-n',
        '/usr/bin/systemd-run',
        '--quiet',
        '--wait',
        '--collect',
        `--unit=${identity.unit}`,
        '--property=Type=exec',
        '--property=KillMode=control-group',
        '--property=StandardInput=null',
        '--property=StandardOutput=journal',
        '--property=StandardError=journal',
        '--',
        '/usr/bin/flock',
        '--exclusive',
        '--nonblock',
        '--conflict-exit-code', '75',
        '/var/lock/eqb-release-bootstrap.lock',
        '/usr/bin/env',
        `EQB_DEPLOY_TRANSPORT_USER=${transportUser}`,
        `EQB_DEPLOY_BOOTSTRAP_UNIT=${identity.unit}`,
        `EQB_DEPLOY_BOOTSTRAP_PUBLIC_KEY_BODY=${identity.bootstrapPublicKeyBody}`,
        `EQB_DEPLOY_CONTROLLER_PUBLIC_KEY_BODY=${identity.publicKeyBody}`,
        `EQB_LEGACY_BASELINE_CHILD_DIGEST=${legacyReleaseChildDigest}`,
        '/bin/bash',
        payload,
        candidate.sha,
        '-',
      ],
    })
    const remote = spawnSync(invocation.command, invocation.args, {
      encoding: 'utf8',
      timeout: 3 * 60 * 60 * 1000,
    })
    const journalOutput = await readBootstrapJournal(identity)
    let evidence
    try {
      evidence = classifyReleaseBootstrapOutcome(journalOutput, candidate.sha, remote.status)
    } catch {
      throw new Error('Release-layout bootstrap returned invalid journal evidence')
    }
    if (evidence.state === 'failure') {
      const { failure } = evidence
      throw new Error(
        `Release-layout bootstrap failed at ${failure.failedStage} `
        + `(code ${failure.exitCode}; rollback ${failure.rollbackHealthy ? 'healthy' : 'unhealthy'}; `
        + `${failure.evidenceRetained ? 'private evidence retained' : 'no private evidence available'})`,
      )
    }
    if (evidence.state === 'success') return
    if (evidence.state === 'lock') throw new Error('Another release-layout bootstrap is already running')
    throw new Error(
      `Release-layout bootstrap outcome is unknown for ${identity.unit}; inspect or resume it instead of retrying`,
    )
  })
}

function readNewControllerPreflight(identity) {
  return withDeploymentCredentials((credentials) => {
    const invocation = deploymentSSHInvocation({
      host: String(process.env.QUESTION_BANK_DEPLOY_SSH_HOST || ''),
      keyPath: identity.privateKeyPath,
      knownHostsPath: credentials.knownHostsPath,
      remoteArgs: ['preflight'],
    })
    const remote = spawnSync(invocation.command, invocation.args, {
      encoding: 'utf8',
    })
    if (remote.error) throw remote.error
    if (remote.status !== 0) throw new Error('New deployment controller preflight failed')
    return parseDeploymentControllerPreflight(remote.stdout)
  })
}

function retirePrivilegedBootstrapIdentity(identity) {
  return withDeploymentCredentials((credentials) => {
    const host = String(process.env.QUESTION_BANK_DEPLOY_SSH_HOST || '')
    const transportUser = deploymentSSHTransportUser(host)
    const invocation = deploymentSSHInvocation({
      host,
      keyPath: identity.bootstrapPrivateKeyPath,
      knownHostsPath: credentials.knownHostsPath,
      remoteArgs: [
        'sudo', '-n',
        '/usr/bin/flock',
        '--exclusive',
        '--nonblock',
        '--conflict-exit-code', '75',
        '/var/lock/eqb-release-bootstrap.lock',
        '/usr/bin/env',
        `EQB_DEPLOY_TRANSPORT_USER=${transportUser}`,
        `EQB_DEPLOY_BOOTSTRAP_PUBLIC_KEY_BODY=${identity.bootstrapPublicKeyBody}`,
        `EQB_DEPLOY_CONTROLLER_PUBLIC_KEY_BODY=${identity.publicKeyBody}`,
        '/usr/bin/node',
        '--input-type=module',
        '-',
      ],
    })
    const remote = spawnSync(invocation.command, invocation.args, {
      encoding: 'utf8',
      input: readFileSync(bootstrapKeyRetirementSource, 'utf8'),
      maxBuffer: 1024 * 1024,
      timeout: 60_000,
    })
    if (remote.error) throw remote.error
    if (remote.status === 75) throw new Error('Release-layout bootstrap lock is already held')
    if (remote.status !== 0) throw new Error('Privileged bootstrap identity retirement failed')
    return parseBootstrapKeyRetirementReceipt(remote.stdout)
  })
}

function cancelReleaseBootstrapAttempt(identity) {
  return withDeploymentCredentials((credentials) => {
    const invocation = deploymentSSHInvocation({
      host: String(process.env.QUESTION_BANK_DEPLOY_SSH_HOST || ''),
      keyPath: identity.bootstrapPrivateKeyPath,
      knownHostsPath: credentials.knownHostsPath,
      remoteArgs: [
        'sudo', '-n',
        '/usr/bin/flock',
        '--exclusive',
        '--nonblock',
        '--conflict-exit-code', '75',
        '/var/lock/eqb-release-bootstrap.lock',
        '/usr/bin/node',
        '--input-type=module',
        '-',
        identity.targetSha,
        identity.unit,
      ],
    })
    const remote = spawnSync(invocation.command, invocation.args, {
      encoding: 'utf8',
      input: readFileSync(bootstrapCancellationSource, 'utf8'),
      maxBuffer: 1024 * 1024,
      timeout: 60_000,
    })
    if (remote.error) throw remote.error
    if (remote.status === 75) {
      throw new Error('Release-layout bootstrap is still running; cancellation lock is held')
    }
    if (remote.status !== 0) throw new Error('Release-layout bootstrap cancellation failed')
    return parseReleaseBootstrapCancellation(
      remote.stdout,
      identity.targetSha,
      identity.unit,
    )
  })
}

function classifyPrivilegedBootstrapIdentity(identity) {
  return withDeploymentCredentials((credentials) => {
    const invocation = deploymentSSHInvocation({
      host: String(process.env.QUESTION_BANK_DEPLOY_SSH_HOST || ''),
      keyPath: identity.bootstrapPrivateKeyPath,
      knownHostsPath: credentials.knownHostsPath,
      remoteArgs: ['/bin/true'],
    })
    const remote = spawnSync(invocation.command, invocation.args, {
      encoding: 'utf8',
      env: { ...process.env, LC_ALL: 'C' },
      timeout: 30_000,
    })
    if (remote.error) throw remote.error
    if (remote.status === 0) return 'active'
    if (isSshPublicKeyAuthenticationDenied(remote)) return 'retired'
    return 'unknown'
  })
}

function classifyControllerIdentity(identity) {
  return withDeploymentCredentials((credentials) => {
    const invocation = deploymentSSHInvocation({
      host: String(process.env.QUESTION_BANK_DEPLOY_SSH_HOST || ''),
      keyPath: identity.privateKeyPath,
      knownHostsPath: credentials.knownHostsPath,
      remoteArgs: ['preflight'],
    })
    const remote = spawnSync(invocation.command, invocation.args, {
      encoding: 'utf8',
      env: { ...process.env, LC_ALL: 'C' },
      timeout: 30_000,
    })
    if (remote.error) throw remote.error
    if (remote.status === 0) {
      try {
        parseDeploymentControllerPreflight(remote.stdout)
        return 'active'
      } catch {
        return 'unknown'
      }
    }
    if (isSshPublicKeyAuthenticationDenied(remote)) return 'rejected'
    return 'unknown'
  })
}

function rotateControllerSecret({ identity, projectId }) {
  const updated = spawnSync('amp', [
    'secrets', 'set', 'QUESTION_BANK_DEPLOY_SSH_PRIVATE_KEY',
    '--project', projectId,
    '--data-file', '-',
    '--secret',
    '--json',
  ], {
    encoding: 'utf8',
    input: readFileSync(identity.privateKeyPath, 'utf8'),
    timeout: 60_000,
  })
  if (updated.error) throw updated.error
  if (updated.status !== 0) throw new Error('Deployment project controller-key rotation failed')
}

async function bootstrap() {
  requireReleaseLayoutBootstrapAuthorization(process.argv.slice(2))
  const projectId = deploymentProjectId()
  const resolvedCandidate = await candidate()
  const transportTarget = String(process.env.QUESTION_BANK_DEPLOY_SSH_HOST || '')
  let identity = null
  let bootstrapAttempted = false
  let recoveryCompleted = false
  try {
    const result = await bootstrapReleaseLayout({
      argv: process.argv.slice(2),
      resolveCandidate: async () => resolvedCandidate,
      revalidateCandidate: assertCandidateStillAuthoritative,
      readLegacyPreflight,
      async invokeBootstrap({ candidate: resolved }) {
        const payload = await stageReleaseBootstrapPayload(resolved)
        identity = await withDeploymentCredentials((credentials) => (
          createControllerIdentityRecovery({
            candidate: resolved,
            credentials,
            projectId,
            transportTarget,
          })
        ))
        bootstrapAttempted = true
        return invokeReleaseBootstrap({ candidate: resolved, identity, payload })
      },
      readControllerPreflight() {
        return readNewControllerPreflight(identity)
      },
      retireBootstrapIdentity() {
        return retirePrivilegedBootstrapIdentity(identity)
      },
      classifyBootstrapIdentity() {
        return classifyPrivilegedBootstrapIdentity(identity)
      },
      async rotateControllerSecret() {
        rotateControllerSecret({ identity, projectId })
      },
      async cleanupRecovery() {
        identity.complete()
        recoveryCompleted = true
      },
      isAncestor: isLocalAncestor,
      readProtectedDiff: readLocalProtectedDiff,
    })
    console.log(JSON.stringify({
      command: 'one-time release-layout bootstrap',
      productionMutationAllowed: true,
      controllerSecretRotated: true,
      environmentRefreshRequired: true,
      ...result,
    }, null, 2))
  } catch (error) {
    if (bootstrapAttempted && !recoveryCompleted && identity) {
      console.error(`Generated controller identity retained for recovery at ${identity.directory}`)
    } else if (!recoveryCompleted && identity) {
      identity.discard()
    }
    throw error
  }
}

async function bootstrapResume() {
  requireReleaseLayoutBootstrapResumeAuthorization(process.argv.slice(2))
  const projectId = deploymentProjectId()
  const transportTarget = String(process.env.QUESTION_BANK_DEPLOY_SSH_HOST || '')
  const completed = readCompletedReleaseBootstrapRecovery({
    stateRoot: bootstrapRecoveryRoot,
    optional: true,
  })
  if (completed) {
    if (
      completed.projectId !== projectId
      || completed.transportTargetDigest
        !== createHash('sha256').update(transportTarget).digest('hex')
    ) {
      throw new Error('Completed bootstrap receipt does not belong to this Deployment project and SSH target')
    }
    const verification = await readDeploymentVerification(completed.targetSha)
    clearCompletedReleaseBootstrapRecovery({
      stateRoot: bootstrapRecoveryRoot,
      targetSha: completed.targetSha,
    })
    console.log(JSON.stringify({
      command: 'resume release-layout bootstrap finalization',
      productionMutationAllowed: false,
      alreadyCompleted: true,
      hostBootstrapRepeated: false,
      controllerSecretRotated: true,
      environmentRefreshRequired: true,
      candidate: {
        repository: AMP_ORB_DEPLOY_REPOSITORY,
        sha: completed.targetSha,
        branch: 'main',
        verification,
      },
    }, null, 2))
    return
  }
  const recovery = readReleaseBootstrapRecovery({ stateRoot: bootstrapRecoveryRoot })
  const identity = identityFromRecovery(recovery, { projectId, transportTarget })
  const verification = await readDeploymentVerification(recovery.targetSha)
  const recoveredCandidate = {
    repository: AMP_ORB_DEPLOY_REPOSITORY,
    sha: recovery.targetSha,
    branch: 'main',
    verification,
  }
  await assertCandidateStillAuthoritative(recoveredCandidate)
  let recoveryCleaned = false
  try {
    const result = await resumeReleaseLayoutBootstrap({
      argv: process.argv.slice(2),
      candidate: recoveredCandidate,
      readControllerPreflight() {
        return readNewControllerPreflight(identity)
      },
      classifyBootstrapIdentity() {
        return classifyPrivilegedBootstrapIdentity(identity)
      },
      retireBootstrapIdentity() {
        return retirePrivilegedBootstrapIdentity(identity)
      },
      async rotateControllerSecret() {
        rotateControllerSecret({ identity, projectId })
      },
      async cleanupRecovery() {
        identity.complete()
        recoveryCleaned = true
      },
    })
    console.log(JSON.stringify({
      command: 'resume release-layout bootstrap finalization',
      productionMutationAllowed: true,
      hostBootstrapRepeated: false,
      controllerSecretRotated: true,
      environmentRefreshRequired: true,
      ...result,
    }, null, 2))
  } catch (error) {
    if (!recoveryCleaned) {
      console.error(`Private bootstrap recovery retained for ${recovery.targetSha}`)
    }
    throw error
  }
}

async function bootstrapInspect() {
  if (!process.argv.includes('--owner-said-preflight')) {
    throw new Error('Current Owner authorization for the read-only bootstrap inspection is required')
  }
  if (process.argv.includes('--sha')) {
    throw new Error('Bootstrap recovery target SHA comes from private durable state; do not supply --sha')
  }
  const projectId = deploymentProjectId()
  const transportTarget = String(process.env.QUESTION_BANK_DEPLOY_SSH_HOST || '')
  const completed = readCompletedReleaseBootstrapRecovery({
    stateRoot: bootstrapRecoveryRoot,
    optional: true,
  })
  if (completed) {
    if (
      completed.projectId !== projectId
      || completed.transportTargetDigest
        !== createHash('sha256').update(transportTarget).digest('hex')
    ) {
      throw new Error('Completed bootstrap receipt does not belong to this Deployment project and SSH target')
    }
    console.log(JSON.stringify({
      command: 'inspect release-layout bootstrap recovery',
      productionMutationAllowed: false,
      state: 'completed',
      targetSha: completed.targetSha,
      controllerSecretRotated: completed.controllerSecretRotated,
    }, null, 2))
    return
  }
  const recovery = readReleaseBootstrapRecovery({ stateRoot: bootstrapRecoveryRoot })
  const identity = identityFromRecovery(recovery, { projectId, transportTarget })
  let journal
  try {
    journal = classifyReleaseBootstrapJournal(
      await readBootstrapJournal(identity),
      recovery.targetSha,
    )
  } catch {
    journal = { state: 'unavailable' }
  }
  const controllerIdentity = await classifyControllerIdentity(identity)
  const bootstrapIdentity = await classifyPrivilegedBootstrapIdentity(identity)
  let legacy = null
  if (bootstrapIdentity === 'active') {
    try {
      legacy = await readLegacyPreflight(null, { keyPath: identity.bootstrapPrivateKeyPath })
    } catch {}
  }
  console.log(JSON.stringify({
    command: 'inspect release-layout bootstrap recovery',
    productionMutationAllowed: false,
    state: 'pending',
    targetSha: recovery.targetSha,
    unit: recovery.unit,
    journal,
    controllerIdentity,
    bootstrapIdentity,
    legacy,
  }, null, 2))
}

async function bootstrapAbandon() {
  requireReleaseLayoutBootstrapAbandonAuthorization(process.argv.slice(2))
  const projectId = deploymentProjectId()
  const transportTarget = String(process.env.QUESTION_BANK_DEPLOY_SSH_HOST || '')
  const recovery = readReleaseBootstrapRecovery({ stateRoot: bootstrapRecoveryRoot })
  const identity = identityFromRecovery(recovery, { projectId, transportTarget })
  const journal = classifyReleaseBootstrapJournal(
    await readBootstrapJournal(identity),
    recovery.targetSha,
  )
  if (!['failure', 'unknown'].includes(journal.state)) {
    throw new Error('Successful bootstrap recovery cannot be abandoned')
  }
  const cancellation = await cancelReleaseBootstrapAttempt(identity)
  if (
    cancellation.hostAttemptStarted
    && (journal.state === 'unknown' || !journal.failure.evidenceRetained)
  ) {
    throw new Error(
      'Bootstrap recovery has durable host acceptance without retained terminal failure evidence',
    )
  }
  if (await classifyControllerIdentity(identity) !== 'rejected') {
    throw new Error('Bootstrap recovery cannot be abandoned while controller identity state is not rejected')
  }
  if (await classifyPrivilegedBootstrapIdentity(identity) !== 'active') {
    throw new Error('Bootstrap recovery cannot be abandoned without the healthy legacy identity')
  }
  const legacy = await readLegacyPreflight(null, { keyPath: identity.bootstrapPrivateKeyPath })
  if (
    legacy.layout !== 'legacy'
    || legacy.baselineState !== 'established'
    || legacy.trackedDirtyPaths !== 0
    || legacy.eqb !== 'active'
    || legacy.caddy !== 'active'
    || legacy.strictHealth !== 'ok'
  ) {
    throw new Error('Bootstrap recovery cannot be abandoned without a healthy established legacy baseline')
  }
  const abandoned = abandonReleaseBootstrapRecovery(recovery, {
    failure: journal.state === 'failure' && journal.failure.evidenceRetained
      ? journal.failure
      : undefined,
    cancellation,
    previousSha: legacy.productionSha,
    controllerIdentityRejected: true,
    legacyHealthy: true,
  })
  console.log(JSON.stringify({
    command: 'abandon failed release-layout bootstrap recovery',
    productionMutationAllowed: false,
    hostCancellationMutationAllowed: true,
    privateRecoveryMutationAllowed: true,
    state: 'abandoned',
    targetSha: abandoned.targetSha,
    previousSha: abandoned.previousSha,
    evidenceKind: abandoned.evidenceKind,
    cancellationInstalled: abandoned.cancellationInstalled,
    hostAttemptStarted: abandoned.hostAttemptStarted,
    rollbackHealthy: abandoned.rollbackHealthy,
    preMutationFailure: abandoned.preMutationFailure,
    controllerIdentityRejected: abandoned.controllerIdentityRejected,
    legacyHealthy: abandoned.legacyHealthy,
  }, null, 2))
}

async function deploy() {
  const result = await deployLatestRelease({
    argv: process.argv.slice(2),
    resolveCandidate: candidate,
    revalidateCandidate: assertCandidateStillAuthoritative,
    async invokeController(sha) {
      return withDeploymentCredentials((credentials) => (
        invokeController(['deploy', sha], credentials)
      ))
    },
  })
  console.log(JSON.stringify({
    command: 'deploy latest',
    productionMutationAllowed: true,
    ...result,
  }, null, 2))
}

function readForcedControllerProductionSha(field = 'productionSha') {
  return withDeploymentCredentials((credentials) => parseDeploymentControllerPreflight(
    invokeController(['preflight'], credentials),
  )[field])
}

async function reviewedPersistenceDeploy() {
  const result = await deployReviewedPersistenceLatest({
    argv: process.argv.slice(2),
    resolveCandidate: candidate,
    revalidateCandidate: assertCandidateStillAuthoritative,
    readProductionSha: readForcedControllerProductionSha,
    readChangedPaths: readLocalProtectedDiff,
    async invokeController(sha, digest) {
      return withDeploymentCredentials((credentials) => invokeController(
        ['deploy-reviewed-persistence', sha, digest],
        credentials,
      ))
    },
  })
  console.log(JSON.stringify({
    command: 'deploy latest with reviewed persistence migration',
    productionMutationAllowed: true,
    ...result,
  }, null, 2))
}

async function updateHostConfig() {
  const result = await updateLatestHostConfiguration({
    argv: process.argv.slice(2),
    resolveCandidate: candidate,
    revalidateCandidate: assertCandidateStillAuthoritative,
    readProductionSha: () => readForcedControllerProductionSha('hostConfigurationSha'),
    readChangedPaths: readLocalProtectedDiff,
    async invokeController(sha, digest) {
      return withDeploymentCredentials((credentials) => invokeController(
        ['update-host-config', sha, digest],
        credentials,
      ))
    },
  })
  console.log(JSON.stringify({
    command: 'install latest reviewed host configuration',
    productionMutationAllowed: true,
    ...result,
  }, null, 2))
}

async function installControlledSsh() {
  const args = process.argv.slice(3)
  if (args.length !== 5 || args[0] !== '--owner-said-install-controlled-ssh'
    || args[1] !== '--plan' || args[3] !== '--prior-terminal') {
    throw new Error('Current Owner authorization and exact plan/terminal files required')
  }
  const resolved = await candidate()
  const planText = readFileSync(args[2], 'utf8')
  const terminalText = readFileSync(args[4], 'utf8')
  const prepared = buildControlledEntryTat({ planText, terminalText,
    files: Object.fromEntries(CONTROLLED_ENTRY_FILES.map(name => [name,
      execFileSync('git', ['show', `${resolved.sha}:${name}`], { cwd: repositoryRoot }),
    ])),
  })
  if (prepared.plan.targetSha !== resolved.sha) throw new Error('Installation target is not exact main')
  const directory = path.join(homedir(), `.eqb-controlled-entry-${prepared.plan.transactionId}`)
  mkdirSync(directory, { mode: 0o700 }) // exclusive local admission, never reuse
  syncDirectory(path.dirname(directory))
  const save = (name, bytes) => {
    writeFileSync(path.join(directory, name), bytes, { mode: 0o600, flag: 'wx', flush: true })
    syncDirectory(directory)
  }
  save('plan.json', planText)
  save('prior-terminal.json', terminalText)
  const configuration = readTencentTatConfiguration()
  const targetDigest = tencentTatTargetDigest(configuration)
  await assertCandidateStillAuthoritative(resolved)
  console.log(JSON.stringify({ command: 'install-controlled-ssh', transactionId: prepared.plan.transactionId,
    sha: resolved.sha, commandDigest: prepared.commandDigest, payloadDigest: prepared.payloadDigest,
    planDigest: prepared.planDigest, commandBytes: prepared.commandBytes, targetDigest, evidenceDirectory: directory }))
  const record = await executeControlledEntryTat({ prepared, targetDigest, save,
    execute: command => executeTencentTatCommand({ command, configuration,
      commandName: `eqb-entry-${prepared.plan.transactionId}`,
      description: 'One-time reviewed controlled SSH entry installation',
      onDispatched: identity => save('dispatch.json', JSON.stringify(identity)),
    }),
  })
  console.log(JSON.stringify(record))
  if (record.state !== 'success') process.exitCode = 1
}

async function transactionStatus() {
  const args = process.argv.slice(3)
  if (args.length !== 3 || args[0] !== '--owner-said-status' || args[1] !== '--transaction'
    || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(args[2])) {
    throw new Error('Status requires current readonly authorization and an exact transaction UUID')
  }
  console.log(await withDeploymentCredentials(credentials => invokeController(['status', args[2]], credentials)))
}

try {
  if (/^(?:root-barrier-|bootstrap|baseline|maintenance-install-readiness)/u.test(process.argv[2] || '')) {
    throw new Error('Retired control-plane command; controlled SSH migration requires separate root authorization')
  }
  if (process.argv[2] === 'plan') await plan()
  else if (process.argv[2] === 'install-controlled-ssh') await installControlledSsh()
  else if (process.argv[2] === 'status') await transactionStatus()
  else if (process.argv[2] === 'preflight') await preflight()
  else if (process.argv[2] === 'maintenance-install-readiness') await maintenanceInstallReadiness()
  else if (process.argv[2] === 'root-barrier-readiness') await rootBarrierBootstrap(false)
  else if (process.argv[2] === 'root-barrier-install') await rootBarrierBootstrap(true)
  else if (process.argv[2] === 'root-barrier-probe') {
    try { await rootBarrierProbe() } catch { throw new Error('Readonly probe input/authority invalid; no retry') }
  }
  else if (process.argv[2] === 'bootstrap-preflight') await bootstrapPreflight()
  else if (process.argv[2] === 'baseline') await baseline()
  else if (process.argv[2] === 'bootstrap') await bootstrap()
  else if (process.argv[2] === 'bootstrap-inspect') await bootstrapInspect()
  else if (process.argv[2] === 'bootstrap-resume') await bootstrapResume()
  else if (process.argv[2] === 'bootstrap-abandon') await bootstrapAbandon()
  else if (process.argv[2] === 'deploy') await deploy()
  else if (process.argv[2] === 'reviewed-persistence') await reviewedPersistenceDeploy()
  else if (process.argv[2] === 'update-host-config') await updateHostConfig()
  else {
    throw new Error(
      'Usage: amp-orb-deploy.mjs plan | preflight --owner-said-preflight | maintenance-install-readiness --owner-said-maintenance-install-readiness | root-barrier-readiness --owner-said-root-barrier-readiness | root-barrier-install --owner-said-root-barrier-install --readiness FILE --payload-digest SHA256 --operator-digest SHA256 --transaction UUID | bootstrap-preflight --owner-said-preflight | baseline --owner-said-baseline-migration | bootstrap --owner-said-release-bootstrap | bootstrap-inspect --owner-said-preflight | bootstrap-resume --owner-said-release-bootstrap-resume | bootstrap-abandon --owner-said-release-bootstrap-abandon | deploy --owner-said-deploy-latest | reviewed-persistence --owner-said-reviewed-persistence-deploy | update-host-config --owner-said-update-host-config'
      + ' | root-barrier-probe --owner-said-root-barrier-probe --request FILE --prior-tat FILE',
    )
  }
} catch (error) {
  console.error(`Amp Orb deployment failed closed: ${error.message}`)
  process.exitCode = 1
}
