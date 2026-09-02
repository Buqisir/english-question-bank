#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import {
  AMP_ORB_DEPLOY_REPOSITORY,
  deploymentGitHubApiArgs,
  deploymentSSHInvocation,
  materializeDeploymentCredentials,
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

function readCommitStatus(sha) {
  return JSON.parse(execFileSync(
    'gh',
    deploymentGitHubApiArgs(`repos/${AMP_ORB_DEPLOY_REPOSITORY}/commits/${sha}/status`),
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
  return resolveLatestDeploymentCandidate({ runGit, readMainSha, readCommitStatus })
}

const preflightScript = `
set -euo pipefail
repo=/opt/eqb/english-question-bank
test -d "$repo"
head="$(sudo -n -u eqb git -C "$repo" rev-parse HEAD)"
dirty="$(sudo -n -u eqb git -C "$repo" status --porcelain | wc -l)"
eqb="$(systemctl is-active eqb || true)"
caddy="$(systemctl is-active caddy || true)"
layout=legacy
if test -L /opt/eqb/current && test -d /opt/eqb/releases && test -d /opt/eqb/shared; then
  layout=release
fi
printf 'productionSha=%s\\ntrackedDirtyPaths=%s\\neqb=%s\\ncaddy=%s\\nlayout=%s\\n' \
  "$head" "$dirty" "$eqb" "$caddy" "$layout"
`

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
  const credentials = materializeDeploymentCredentials({
    privateKey: process.env.QUESTION_BANK_DEPLOY_SSH_PRIVATE_KEY,
    knownHosts: process.env.QUESTION_BANK_DEPLOY_SSH_KNOWN_HOSTS,
  })
  try {
    execFileSync('ssh-keygen', ['-y', '-f', credentials.keyPath], { stdio: 'ignore' })
    const invocation = deploymentSSHInvocation({
      host: String(process.env.QUESTION_BANK_DEPLOY_SSH_HOST || ''),
      keyPath: credentials.keyPath,
      knownHostsPath: credentials.knownHostsPath,
    })
    const result = spawnSync(invocation.command, invocation.args, {
      encoding: 'utf8',
      input: preflightScript,
    })
    if (result.error) throw result.error
    if (result.status !== 0) throw new Error('Deployment SSH preflight failed')
    console.log(JSON.stringify({
      candidate: resolved,
      productionMutationAllowed: false,
      remote: parseDeploymentPreflightOutput(result.stdout),
    }, null, 2))
  } finally {
    credentials.cleanup()
  }
}

try {
  if (process.argv[2] === 'plan') await plan()
  else if (process.argv[2] === 'preflight') await preflight()
  else {
    throw new Error(
      'Usage: amp-orb-deploy.mjs plan | preflight --owner-said-preflight',
    )
  }
} catch (error) {
  console.error(`Amp Orb deployment failed closed: ${error.message}`)
  process.exitCode = 1
}
