#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import {
  AMP_ORB_DEPLOY_GITHUB_API_MAX_BUFFER_BYTES,
  AMP_ORB_DEPLOY_REPOSITORY,
  assertDeploymentCandidateStillCurrent,
  deployLatestRelease,
  deploymentAuthorityFromEnvironment,
  deploymentGitHubApiArgs,
  deploymentSSHInvocation,
  materializeDeploymentCredentials,
  parseDeploymentControllerOutput,
  parseReviewedPersistenceControllerOutput,
  parseDeploymentControllerPreflight,
  readDeploymentWorkflowEvidence,
  resolveLatestDeploymentCandidate,
  verifyDeploymentAuthority,
} from './lib/ampOrbDeploy.mjs'

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url))

function runGit(args) {
  return execFileSync('git', args, { cwd: repositoryRoot, encoding: 'utf8' })
}

function readGitHubJson(endpoint) {
  return JSON.parse(execFileSync('gh', deploymentGitHubApiArgs(endpoint), {
    cwd: repositoryRoot,
    encoding: 'utf8',
    maxBuffer: AMP_ORB_DEPLOY_GITHUB_API_MAX_BUFFER_BYTES,
  }))
}

function readMainSha() {
  return readGitHubJson(`repos/${AMP_ORB_DEPLOY_REPOSITORY}/git/ref/heads/main`)?.object?.sha
}

function readDeploymentVerification(sha) {
  const authority = deploymentAuthorityFromEnvironment(process.env)
  return verifyDeploymentAuthority({
    expectedSha: sha,
    githubActionsAppId: authority.githubActionsAppId,
    readWorkflowEvidence: (expectedSha) => readDeploymentWorkflowEvidence({
      sha: expectedSha,
      readJson: readGitHubJson,
    }),
  })
}

function readLocalSha() { return runGit(['rev-parse', 'HEAD']).trim() }
function readLocalStatus() { return runGit(['status', '--porcelain']) }

function candidate() {
  return resolveLatestDeploymentCandidate({ runGit, readMainSha, readDeploymentVerification })
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
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30 * 60 * 1000,
  })
  if (result.error) throw new Error('SSH outcome unknown; preserve host receipt and do not retry')
  if (result.status === 75) throw new Error('Another production deployment is already running')
  if (result.status === 255) {
    throw new Error('Production controller outcome is unknown after SSH transport failure; inspect host receipts before any retry')
  }
  if (!String(result.stdout || '').trim()) {
    throw new Error(`Deployment controller exited without a receipt (code ${result.status})`)
  }
  if (remoteArgs[0] === 'deploy') {
    const receiptParser = remoteArgs[2] === 'migrate'
      ? parseReviewedPersistenceControllerOutput : parseDeploymentControllerOutput
    const receipt = receiptParser(result.stdout, remoteArgs[1], remoteArgs[3])
    if (result.status !== (receipt.conclusion === 'success' ? 0 : 1)) {
      throw new Error('SSH receipt/exit mismatch; outcome unknown, do not retry')
    }
    if (receipt.conclusion !== 'success') {
      throw new Error(`Production controller reported ${receipt.failureCode || 'failure'}`)
    }
  } else if (result.status !== 0) {
    throw new Error(`Deployment controller failed (code ${result.status})`)
  }
  return result.stdout
}

async function plan() {
  console.log(JSON.stringify({ command: 'deploy latest', productionMutationAllowed: false, ...await candidate() }, null, 2))
}

async function preflight() {
  if (!process.argv.includes('--owner-said-preflight')) {
    throw new Error('Current Owner authorization for the read-only production preflight is required')
  }
  const resolved = await candidate()
  await assertCandidateStillAuthoritative(resolved)
  await withDeploymentCredentials((credentials) => {
    console.log(JSON.stringify({
      candidate: resolved,
      productionMutationAllowed: false,
      remote: parseDeploymentControllerPreflight(invokeController(['preflight'], credentials)),
    }, null, 2))
  })
}

async function deploy() {
  const result = await deployLatestRelease({
    argv: process.argv.slice(2),
    resolveCandidate: candidate,
    revalidateCandidate: assertCandidateStillAuthoritative,
    readProductionSha: () => withDeploymentCredentials((credentials) =>
      parseDeploymentControllerPreflight(invokeController(['preflight'], credentials)).productionSha),
    readChangedPaths: (previousSha, targetSha, paths) => runGit([
      'diff', '--name-only', '--no-renames', previousSha, targetSha, '--', ...paths,
    ]).trim().split('\n').filter(Boolean),
    invokeController: (sha, classification, digest) => withDeploymentCredentials((credentials) => invokeController(
      ['deploy', sha, ...(classification ? [classification, digest] : [])],
      credentials,
    )),
  })
  console.log(JSON.stringify({ command: 'deploy latest', productionMutationAllowed: true, ...result }, null, 2))
}

try {
  if (/^(?:root-barrier-|bootstrap|baseline|maintenance-install-readiness|install-controlled-ssh|status|reviewed-persistence|update-host-config)/u.test(process.argv[2] || '')) {
    throw new Error('Retired control-plane command; controlled SSH migration requires separate root authorization')
  }
  if (process.argv[2] === 'plan') await plan()
  else if (process.argv[2] === 'preflight') await preflight()
  else if (process.argv[2] === 'deploy') await deploy()
  else throw new Error('Usage: amp-orb-deploy.mjs plan | preflight --owner-said-preflight | deploy --owner-said-deploy-latest')
} catch (error) {
  console.error(`Amp Orb deployment failed closed: ${error.message}`)
  process.exitCode = 1
}
