#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  AMP_ORB_DEPLOY_RECEIPT_SCHEMA_VERSION,
  activatePreparedRelease,
  assertDeploymentCandidateStillCurrent,
  assertAuthoritativeDeploymentStatus,
  currentReleaseSha,
  deploymentGitHubApiArgs,
  deploymentLockInvocation,
  deploymentSSHInvocation,
  materializeDeploymentCredentials,
  parseDeploymentPreflightOutput,
  requireDeployLatestAuthorization,
  resolveLatestDeploymentCandidate,
} from './lib/ampOrbDeploy.mjs'
import { createVerifier, readText, repoRootFrom } from './lib/verifyScope.mjs'

const ROOT = repoRootFrom(import.meta.url)
const { assert, section, summary } = createVerifier('Amp Orb production deployment contract')
const oldSha = '1'.repeat(40)
const newSha = '2'.repeat(40)

function status(sha, state = 'success') {
  return {
    sha,
    state,
    statuses: [{
      id: 1,
      sha,
      context: 'Amp Orb Verify',
      state,
      description: 'verify:all + e2e passed on Amp Orb',
      target_url: 'https://ampcode.com/threads/T-01a0570a-57a0-77ea-b243-54843baca65d',
    }],
  }
}

function fakeGit({
  branch = 'main',
  dirty = '',
  localSha = newSha,
  fetchedSha = newSha,
  mergeError = false,
} = {}) {
  let head = localSha
  return async (args) => {
    const command = args.join(' ')
    if (command === 'branch --show-current') return `${branch}\n`
    if (command === 'status --porcelain') return dirty
    if (command === 'fetch origin main --quiet') return ''
    if (command === 'merge --ff-only origin/main') {
      if (mergeError) throw new Error('Not possible to fast-forward')
      head = fetchedSha
      return 'Fast-forward\n'
    }
    if (command === 'rev-parse HEAD') return `${head}\n`
    throw new Error(`Unexpected git invocation: ${command}`)
  }
}

section('Owner command and exact authoritative candidate')

assert(
  (() => {
    requireDeployLatestAuthorization(['deploy', '--owner-said-deploy-latest'])
    return true
  })(),
  'natural “deploy latest” authorization needs no handwritten SHA',
)
assert(
  (() => {
    try {
      requireDeployLatestAuthorization(['deploy', '--owner-said-deploy-latest', '--sha', newSha])
      return false
    } catch {
      return true
    }
  })(),
  'caller-supplied deployment SHA is rejected',
)

const candidate = await resolveLatestDeploymentCandidate({
  runGit: fakeGit(),
  readMainSha: async () => newSha,
  readCommitStatus: async (sha) => status(sha),
})
assert(candidate.sha === newSha, 'current clean main resolves automatically')
assert(candidate.status.state === 'success', 'exact Amp Orb Verify success is authoritative')
assert(
  deploymentGitHubApiArgs(`repos/Buqisir/english-question-bank/commits/${newSha}/status`)
    .join(' ') === `api --hostname github.com repos/Buqisir/english-question-bank/commits/${newSha}/status`,
  'GitHub API authority is pinned to github.com regardless of GH_HOST',
)

const fastForwarded = await resolveLatestDeploymentCandidate({
  runGit: fakeGit({ localSha: oldSha }),
  readMainSha: async () => newSha,
  readCommitStatus: async (sha) => status(sha),
})
assert(fastForwarded.sha === newSha, 'stale clean main fast-forwards without an Owner-supplied SHA')

for (const [label, options, readMainSha, readCommitStatus] of [
  ['non-main checkout', { branch: 'feature' }, async () => newSha, async (sha) => status(sha)],
  ['dirty checkout', { dirty: ' M server/api.mjs\n' }, async () => newSha, async (sha) => status(sha)],
  ['diverged checkout', { mergeError: true }, async () => newSha, async (sha) => status(sha)],
  ['main changed after fetch', {}, async () => '3'.repeat(40), async (sha) => status(sha)],
  ['missing required status', {}, async () => newSha, async (sha) => ({ sha, statuses: [] })],
  ['pending required status', {}, async () => newSha, async (sha) => status(sha, 'pending')],
]) {
  let rejected = false
  try {
    await resolveLatestDeploymentCandidate({
      runGit: fakeGit(options),
      readMainSha,
      readCommitStatus,
    })
  } catch {
    rejected = true
  }
  assert(rejected, `${label} fails closed before SSH`)
}

assert(
  (() => {
    try {
      assertAuthoritativeDeploymentStatus(status(oldSha), newSha)
      return false
    } catch {
      return true
    }
  })(),
  'status for another SHA cannot authorize deployment',
)
assert(
  (() => {
    try {
      const missingStatusSha = status(newSha)
      delete missingStatusSha.statuses[0].sha
      assertAuthoritativeDeploymentStatus(missingStatusSha, newSha)
      return false
    } catch {
      return true
    }
  })(),
  'required status without its own exact SHA is rejected',
)
assert(
  (() => {
    try {
      assertAuthoritativeDeploymentStatus({
        sha: newSha,
        statuses: [
          { ...status(newSha).statuses[0], id: 1, state: 'success' },
          { ...status(newSha).statuses[0], id: 2, state: 'pending' },
        ],
      }, newSha)
      return false
    } catch {
      return true
    }
  })(),
  'an older success cannot override a newer pending required status',
)
assert(
  (() => {
    try {
      const wrongSource = status(newSha)
      wrongSource.statuses[0].target_url = 'https://ampcode.com/threads/T-00000000-0000-0000-0000-000000000000'
      assertAuthoritativeDeploymentStatus(wrongSource, newSha)
      return false
    } catch {
      return true
    }
  })(),
  'a same-name success from another status source cannot authorize deployment',
)

assert(
  await assertDeploymentCandidateStillCurrent({
    readMainSha: async () => newSha,
    sha: newSha,
  }) === newSha,
  'pinned candidate can be rechecked immediately before activation',
)
assert(
  await (async () => {
    try {
      await assertDeploymentCandidateStillCurrent({
        readMainSha: async () => '3'.repeat(40),
        sha: newSha,
      })
      return false
    } catch {
      return true
    }
  })(),
  'a newer main fails closed and requires a fresh “部署最新版” command',
)

section('Private credentials and pinned SSH invocation')

const credentialRoot = mkdtempSync(path.join(tmpdir(), 'eqb-deploy-credentials-'))
const generatedKey = path.join(credentialRoot, 'generated')
execFileSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', generatedKey])
const oneLineKey = readFileSync(generatedKey, 'utf8').replaceAll('\n', '')
const materialized = materializeDeploymentCredentials({
  privateKey: oneLineKey,
  knownHosts: 'production.invalid ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFixtureOnly',
  parent: credentialRoot,
})
assert((statSync(materialized.directory).mode & 0o777) === 0o700, 'credential directory is mode 0700')
assert((statSync(materialized.keyPath).mode & 0o777) === 0o600, 'private key is mode 0600')
assert((statSync(materialized.knownHostsPath).mode & 0o777) === 0o600, 'known_hosts is mode 0600')
assert(
  (() => {
    try {
      execFileSync('ssh-keygen', ['-y', '-f', materialized.keyPath], { stdio: 'ignore' })
      return true
    } catch {
      return false
    }
  })(),
  'single-line Project Secret is restored to a valid private key',
)

const ssh = deploymentSSHInvocation({
  host: 'deployer@production.invalid',
  keyPath: materialized.keyPath,
  knownHostsPath: materialized.knownHostsPath,
})
assert(ssh.command === 'ssh', 'deployment uses the system SSH client')
assert(ssh.args.includes('StrictHostKeyChecking=yes'), 'SSH host-key checking is strict')
assert(
  ssh.args.includes(`UserKnownHostsFile=${materialized.knownHostsPath}`),
  'SSH trusts only the private pinned known_hosts file',
)
assert(ssh.args.includes('GlobalKnownHostsFile=/dev/null'), 'global host keys cannot widen trust')
assert(ssh.args.includes('BatchMode=yes'), 'SSH cannot fall back to an interactive password')
assert(!ssh.args.some((arg) => arg.includes('StrictHostKeyChecking=no')), 'insecure host-key bypass is absent')

const locked = deploymentLockInvocation({
  root: '/opt/eqb',
  executable: '/usr/bin/node',
  args: ['/opt/eqb/deployment-controller.mjs', 'activate', newSha],
})
assert(locked.command === 'flock', 'production activation is wrapped by the system lock')
assert(locked.args.includes('--exclusive') && locked.args.includes('--nonblock'), 'a second deployment fails instead of waiting or overlapping')
assert(locked.args.includes('/opt/eqb/deployments/deploy.lock'), 'deployment lock has one stable host path')
assert(locked.args.includes('75'), 'lock contention has a distinct exit code')

const preflight = parseDeploymentPreflightOutput([
  `productionSha=${oldSha}`,
  'trackedDirtyPaths=0',
  'eqb=active',
  'caddy=active',
  'layout=legacy',
].join('\n'))
assert(preflight.productionSha === oldSha, 'preflight returns one exact production SHA')
assert(preflight.trackedDirtyPaths === 0, 'preflight dirty count is parsed as a number')
assert(preflight.eqb === 'active' && preflight.caddy === 'active', 'preflight reports both service states')
assert(preflight.layout === 'legacy', 'preflight distinguishes legacy and release layouts')
assert(
  (() => {
    try {
      parseDeploymentPreflightOutput(`productionSha=${oldSha}\ntrackedDirtyPaths=0\neqb=active\ncaddy=active\nlayout=release\nunexpected=value`)
      return false
    } catch {
      return true
    }
  })(),
  'unexpected remote preflight output fails closed',
)
materialized.cleanup()
assert(!existsSync(materialized.directory), 'credential files are removed after use')
rmSync(credentialRoot, { recursive: true, force: true })

section('Atomic release activation, idempotency, and rollback')

function releaseFixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'eqb-release-fixture-'))
  mkdirSync(path.join(root, 'releases', oldSha), { recursive: true })
  mkdirSync(path.join(root, 'releases', newSha), { recursive: true })
  mkdirSync(path.join(root, 'shared'), { recursive: true })
  writeFileSync(path.join(root, 'shared', 'production-data'), 'must-not-change')
  symlinkSync(path.join('releases', oldSha), path.join(root, 'current'))
  return root
}

const successRoot = releaseFixture()
const successRestarts = []
const success = await activatePreparedRelease({
  root: successRoot,
  sha: newSha,
  restart: async (event) => successRestarts.push(event),
  healthCheck: async () => true,
})
assert(currentReleaseSha(successRoot) === newSha, 'healthy candidate becomes current atomically')
assert(readlinkSync(path.join(successRoot, 'current')) === path.join('releases', newSha), 'current is a relative release symlink')
assert(successRestarts.length === 1 && successRestarts[0].phase === 'activate', 'healthy activation restarts once')
assert(success.receipt.conclusion === 'success' && !success.receipt.rolledBack, 'success receipt is terminal')
assert(success.receipt.schemaVersion === AMP_ORB_DEPLOY_RECEIPT_SCHEMA_VERSION, 'receipt schema is versioned')
assert((statSync(path.join(successRoot, 'deployments')).mode & 0o777) === 0o700, 'deployment state directory is mode 0700')
assert((statSync(success.receiptPath).mode & 0o777) === 0o600, 'deployment receipt is mode 0600')
assert(readFileSync(path.join(successRoot, 'shared', 'production-data'), 'utf8') === 'must-not-change', 'shared production data is untouched')

const idempotentRestarts = []
const idempotent = await activatePreparedRelease({
  root: successRoot,
  sha: newSha,
  restart: async (event) => idempotentRestarts.push(event),
  healthCheck: async () => true,
})
assert(idempotent.receipt.noOp && idempotent.receipt.conclusion === 'success', 'same healthy SHA is an idempotent no-op')
assert(idempotentRestarts.length === 0, 'idempotent deploy does not restart production')
rmSync(successRoot, { recursive: true, force: true })

const rollbackRoot = releaseFixture()
const rollbackRestarts = []
const rollback = await activatePreparedRelease({
  root: rollbackRoot,
  sha: newSha,
  restart: async (event) => rollbackRestarts.push(event),
  healthCheck: async ({ phase }) => phase === 'rollback',
})
assert(currentReleaseSha(rollbackRoot) === oldSha, 'failed candidate restores the previous current pointer')
assert(rollbackRestarts.map(({ phase }) => phase).join(',') === 'activate,rollback', 'failed health triggers one rollback restart')
assert(rollback.receipt.conclusion === 'failure', 'failed activation reports failure')
assert(rollback.receipt.rolledBack && rollback.receipt.rollbackHealthy, 'receipt proves healthy rollback')
assert(readFileSync(path.join(rollbackRoot, 'shared', 'production-data'), 'utf8') === 'must-not-change', 'rollback never mutates shared production data')
rmSync(rollbackRoot, { recursive: true, force: true })

section('Production activation remains intentionally closed')

const cli = readText(ROOT, 'scripts/amp-orb-deploy.mjs')
assert(cli.includes("process.argv[2] === 'plan'"), 'CLI exposes a no-mutation deployment plan')
assert(cli.includes("process.argv[2] === 'preflight'"), 'CLI exposes an Owner-authorized read-only preflight')
assert(cli.includes('productionMutationAllowed: false'), 'plan and preflight declare no production mutation authority')
assert(!cli.includes('StrictHostKeyChecking=no'), 'CLI contains no SSH trust bypass')

const closedRoot = mkdtempSync(path.join(tmpdir(), 'eqb-deploy-closed-'))
const sshMarker = path.join(closedRoot, 'ssh-called')
const fakeSsh = path.join(closedRoot, 'ssh')
writeFileSync(fakeSsh, '#!/bin/sh\n: > "$EQB_DEPLOY_SSH_MARKER"\nexit 99\n')
chmodSync(fakeSsh, 0o700)
const unauthorizedPreflight = spawnSync(
  process.execPath,
  [path.join(ROOT, 'scripts', 'amp-orb-deploy.mjs'), 'preflight'],
  { cwd: ROOT, encoding: 'utf8' },
)
assert(unauthorizedPreflight.status === 1, 'preflight without current Owner authorization is rejected')
assert(
  unauthorizedPreflight.stderr.includes('Current Owner authorization'),
  'unauthorized preflight stops before checkout or SSH work',
)
for (const command of ['deploy', 'activate', 'activate-release']) {
  const attempted = spawnSync(
    process.execPath,
    [path.join(ROOT, 'scripts', 'amp-orb-deploy.mjs'), command, '--owner-said-deploy-latest'],
    {
      cwd: ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${closedRoot}:${process.env.PATH || ''}`,
        EQB_DEPLOY_SSH_MARKER: sshMarker,
      },
    },
  )
  assert(attempted.status === 1, `${command} production entrypoint exits non-zero`)
  assert(
    attempted.stderr.includes('Usage: amp-orb-deploy.mjs plan | preflight'),
    `${command} is rejected as unavailable rather than starting deployment`,
  )
}
assert(!existsSync(sshMarker), 'closed production entrypoints never invoke SSH')
rmSync(closedRoot, { recursive: true, force: true })

summary()
