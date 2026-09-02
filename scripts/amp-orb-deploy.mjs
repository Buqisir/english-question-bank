#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import {
  AMP_ORB_DEPLOY_REPOSITORY,
  deployLatestRelease,
  deploymentGitHubApiArgs,
  deploymentSSHInvocation,
  materializeDeploymentCredentials,
  parseDeploymentControllerOutput,
  parseDeploymentControllerPreflight,
  parseDeploymentPreflightOutput,
  resolveLatestDeploymentCandidate,
} from './lib/ampOrbDeploy.mjs'

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url))

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
head="$(git -c safe.directory="$repo" -C "$repo" rev-parse HEAD)"
dirty="$(git -c safe.directory="$repo" -C "$repo" status --porcelain | wc -l)"
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
    console.log(JSON.stringify({
      candidate: resolved,
      productionMutationAllowed: false,
      transitionOnly: true,
      remote: parseDeploymentPreflightOutput(remote.stdout),
    }, null, 2))
  })
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
  else if (process.argv[2] === 'deploy') await deploy()
  else {
    throw new Error(
      'Usage: amp-orb-deploy.mjs plan | preflight --owner-said-preflight | bootstrap-preflight --owner-said-preflight | deploy --owner-said-deploy-latest',
    )
  }
} catch (error) {
  console.error(`Amp Orb deployment failed closed: ${error.message}`)
  process.exitCode = 1
}
