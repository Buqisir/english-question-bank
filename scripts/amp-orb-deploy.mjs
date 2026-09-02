#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  AMP_ORB_DEPLOY_REPOSITORY,
  bootstrapReleaseLayout,
  deployLatestRelease,
  deploymentGitHubApiArgs,
  deploymentSSHInvocation,
  materializeDeploymentCredentials,
  migrateLegacyProductionBaseline,
  parseBootstrapKeyRetirementReceipt,
  parseDeploymentControllerOutput,
  parseDeploymentControllerPreflight,
  parseDeploymentPreflightOutput,
  requireReleaseLayoutBootstrapAuthorization,
  resolveLatestDeploymentCandidate,
} from './lib/ampOrbDeploy.mjs'

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url))
const legacyBaselineSource = fileURLToPath(
  new URL('../deploy/eqb-legacy-baseline.mjs', import.meta.url),
)
const releaseBootstrapSource = fileURLToPath(
  new URL('../deploy/bootstrap-eqb-deployment.sh', import.meta.url),
)
const bootstrapKeyRetirementSource = fileURLToPath(
  new URL('../deploy/retire-eqb-bootstrap-key.mjs', import.meta.url),
)
const legacyReleaseChildDigest = '25d8acc95172626cf03de96b2cc61d0f81508352082b976b9f1095bfbe15d4d5'

function runGit(args) {
  return execFileSync('git', args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
  })
}

function readCommitChecks(sha) {
  return JSON.parse(execFileSync(
    'gh',
    deploymentGitHubApiArgs(
      `repos/${AMP_ORB_DEPLOY_REPOSITORY}/commits/${sha}/check-runs?filter=latest&per_page=100`,
    ),
    { cwd: repositoryRoot, encoding: 'utf8' },
  ))
}

function readMainSha() {
  const ref = JSON.parse(execFileSync(
    'gh',
    deploymentGitHubApiArgs(`repos/${AMP_ORB_DEPLOY_REPOSITORY}/git/ref/heads/main`),
    { cwd: repositoryRoot, encoding: 'utf8' },
  ))
  return ref?.object?.sha
}

async function candidate() {
  return resolveLatestDeploymentCandidate({ runGit, readMainSha, readCommitChecks })
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
printf 'productionSha=%s\\ntrackedDirtyPaths=%s\\neqb=%s\\ncaddy=%s\\nlayout=%s\\n' \
  "$head" "$dirty" "$eqb" "$caddy" "$layout"
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
  const invocation = deploymentSSHInvocation({
    host: String(process.env.QUESTION_BANK_DEPLOY_SSH_HOST || ''),
    keyPath: credentials.keyPath,
    knownHostsPath: credentials.knownHostsPath,
    remoteArgs,
  })
  const result = spawnSync(invocation.command, invocation.args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  if (result.error) throw result.error
  if (result.status === 75) throw new Error('Another production deployment is already running')
  if (!String(result.stdout || '').trim()) {
    throw new Error(`Deployment controller exited without a receipt (code ${result.status})`)
  }
  if (result.status !== 0) {
    if (remoteArgs[0] === 'deploy') {
      const receipt = parseDeploymentControllerOutput(result.stdout, remoteArgs[1])
      throw new Error(`Production controller reported ${receipt.failureCode || 'failure'}`)
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

async function bootstrapPreflight() {
  if (!process.argv.includes('--owner-said-preflight')) {
    throw new Error('Current Owner authorization for the read-only production preflight is required')
  }
  const resolved = await candidate()
  console.log(JSON.stringify({
    candidate: resolved,
    productionMutationAllowed: false,
    transitionOnly: true,
    remote: await readLegacyPreflight(),
  }, null, 2))
}

function readLegacyPreflight() {
  return withDeploymentCredentials((credentials) => {
    const invocation = deploymentSSHInvocation({
      host: String(process.env.QUESTION_BANK_DEPLOY_SSH_HOST || ''),
      keyPath: credentials.keyPath,
      knownHostsPath: credentials.knownHostsPath,
    })
    const remote = spawnSync(invocation.command, invocation.args, {
      encoding: 'utf8',
      input: bootstrapPreflightScript,
    })
    if (remote.error) throw remote.error
    if (remote.status !== 0) throw new Error('Legacy deployment preflight failed')
    return parseDeploymentPreflightOutput(remote.stdout)
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
    readMainSha,
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
  const fields = execFileSync('ssh-keygen', ['-y', '-f', privateKeyPath], {
    encoding: 'utf8',
  }).trim().split(/\s+/u)
  if (fields.length !== 2 || !/^[A-Za-z0-9+/]+={0,3}$/u.test(fields[1] || '')) {
    throw new Error('Deployment SSH identity is not a valid private key')
  }
  return fields[1]
}

function createControllerIdentity() {
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

function deploymentProjectId() {
  const projectId = String(process.env.AMP_PROJECT_ID || '')
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(projectId)) {
    throw new Error('Current Deployment Orb project identity is missing or invalid')
  }
  return projectId
}

function invokeReleaseBootstrap({ candidate, identity }) {
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
        '/var/lock/eqb-release-bootstrap.lock',
        '/usr/bin/env',
        `EQB_DEPLOY_CONTROLLER_PUBLIC_KEY_BODY=${identity.publicKeyBody}`,
        '/bin/bash',
        '-s',
        '--',
        candidate.sha,
        '-',
      ],
    })
    const remote = spawnSync(invocation.command, invocation.args, {
      encoding: 'utf8',
      input: readFileSync(releaseBootstrapSource, 'utf8'),
      maxBuffer: 4 * 1024 * 1024,
      timeout: 3 * 60 * 60 * 1000,
    })
    if (remote.error) throw remote.error
    if (remote.status === 75) throw new Error('Another release-layout bootstrap is already running')
    if (remote.status !== 0) {
      throw new Error(`Release-layout bootstrap failed (code ${remote.status})`)
    }
    if (String(remote.stdout || '').trim() !== `EQB deployment bootstrap complete: ${candidate.sha}`) {
      throw new Error('Release-layout bootstrap completion response is invalid')
    }
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
        '/var/lock/eqb-release-bootstrap.lock',
        '/usr/bin/env',
        `EQB_DEPLOY_BOOTSTRAP_PUBLIC_KEY_BODY=${publicKeyBody(credentials.keyPath)}`,
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

function verifyBootstrapIdentityRetired() {
  return withDeploymentCredentials((credentials) => {
    const invocation = deploymentSSHInvocation({
      host: String(process.env.QUESTION_BANK_DEPLOY_SSH_HOST || ''),
      keyPath: credentials.keyPath,
      knownHostsPath: credentials.knownHostsPath,
      remoteArgs: ['preflight'],
    })
    const remote = spawnSync(invocation.command, invocation.args, {
      encoding: 'utf8',
      env: { ...process.env, LC_ALL: 'C' },
      timeout: 30_000,
    })
    if (remote.error) throw remote.error
    return remote.status === 255
      && /Permission denied \(publickey(?:,[^)]+)?\)\./u.test(String(remote.stderr || ''))
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
  const identity = createControllerIdentity()
  let bootstrapAttempted = false
  let secretRotated = false
  try {
    const result = await bootstrapReleaseLayout({
      argv: process.argv.slice(2),
      resolveCandidate: candidate,
      readMainSha,
      readLegacyPreflight,
      async invokeBootstrap({ candidate: resolved }) {
        bootstrapAttempted = true
        return invokeReleaseBootstrap({ candidate: resolved, identity })
      },
      readControllerPreflight() {
        return readNewControllerPreflight(identity)
      },
      retireBootstrapIdentity() {
        return retirePrivilegedBootstrapIdentity(identity)
      },
      verifyBootstrapIdentityRetired,
      async rotateControllerSecret() {
        rotateControllerSecret({ identity, projectId })
        secretRotated = true
      },
    })
    console.log(JSON.stringify({
      command: 'one-time release-layout bootstrap',
      productionMutationAllowed: true,
      controllerSecretRotated: true,
      environmentRefreshRequired: true,
      ...result,
    }, null, 2))
  } catch (error) {
    if (bootstrapAttempted && !secretRotated) {
      console.error(`Generated controller identity retained for recovery at ${identity.directory}`)
    } else {
      identity.cleanup()
    }
    throw error
  }
  identity.cleanup()
}

async function deploy() {
  const result = await deployLatestRelease({
    argv: process.argv.slice(2),
    resolveCandidate: candidate,
    readMainSha,
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

try {
  if (process.argv[2] === 'plan') await plan()
  else if (process.argv[2] === 'preflight') await preflight()
  else if (process.argv[2] === 'bootstrap-preflight') await bootstrapPreflight()
  else if (process.argv[2] === 'baseline') await baseline()
  else if (process.argv[2] === 'bootstrap') await bootstrap()
  else if (process.argv[2] === 'deploy') await deploy()
  else {
    throw new Error(
      'Usage: amp-orb-deploy.mjs plan | preflight --owner-said-preflight | bootstrap-preflight --owner-said-preflight | baseline --owner-said-baseline-migration | bootstrap --owner-said-release-bootstrap | deploy --owner-said-deploy-latest',
    )
  }
} catch (error) {
  console.error(`Amp Orb deployment failed closed: ${error.message}`)
  process.exitCode = 1
}
