#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { appendFileSync } from 'node:fs'

import {
  AMP_ORB_DEPLOY_GITHUB_API_MAX_BUFFER_BYTES,
  AMP_ORB_DEPLOY_REPOSITORY,
  EQB_PERSISTENCE_AUTHORITY_PATHS,
  deploymentChangedPathDigest,
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

const repoApi = `repos/${AMP_ORB_DEPLOY_REPOSITORY}`
function issueApi(endpoint, method, body) {
  return JSON.parse(execFileSync('gh', ['api', `${repoApi}/${endpoint}`,
    ...(method ? ['--method', method, '--input', '-'] : ['--paginate', '--slurp'])], {
    encoding: 'utf8', input: body ? JSON.stringify(body) : undefined,
  }))
}
function openIssues(label) {
  return issueApi(`issues?state=open&per_page=100${label ? `&labels=${label}` : ''}`).flat()
    .filter(issue => !issue.pull_request)
}
function paused() { return openIssues('deploy-paused').length > 0 }
function upsertIssue(title, body, pause = false) {
  const signed = `${body}\n\n—— Droid 整理（${new Date().toISOString().slice(0, 10)}）`
  if (pause) {
    const labels = issueApi('labels?per_page=100').flat()
    if (!labels.some(label => label.name === 'deploy-paused')) {
      issueApi('labels', 'POST', { name: 'deploy-paused', color: 'd93f0b' })
    }
  }
  const existing = openIssues().find(issue => issue.title === title)
  return issueApi(existing ? `issues/${existing.number}` : 'issues', existing ? 'PATCH' : 'POST',
    { title, body: signed, ...(pause ? { labels: ['deploy-paused'] } : {}) })
}
function ciOutput(values) {
  if (process.env.GITHUB_OUTPUT) {
    for (const [key, value] of Object.entries(values)) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`)
  }
}
function summary(message) {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${message}\n`)
  console.log(message)
}
async function ci(command) {
  if (process.env.GITHUB_ACTIONS !== 'true' || process.env.GITHUB_REF !== 'refs/heads/main') {
    throw new Error('CI deployment requires the main workflow')
  }
  // Separate CI identity; never read the Owner Mac Keychain.
  process.env.QUESTION_BANK_DEPLOY_SSH_PRIVATE_KEY = process.env.EQB_DEPLOY_SSH_KEY
  process.env.QUESTION_BANK_DEPLOY_SSH_KNOWN_HOSTS = process.env.EQB_DEPLOY_KNOWN_HOSTS
  process.env.QUESTION_BANK_DEPLOY_SSH_HOST = process.env.EQB_DEPLOY_SSH_HOST
  const mode = process.env.EQB_DEPLOY_MODE || 'auto'
  if (!['auto', 'code-only', 'migration'].includes(mode)) throw new Error('Invalid deployment mode')
  if (command !== 'ci-rollback' && paused()) {
    ciOutput({ deploy: false })
    summary('SKIP：存在 open deploy-paused issue；关闭暂停 issue 后恢复自动上线。')
    return
  }
  await withDeploymentCredentials(async credentials => {
    const readPreflight = () => parseDeploymentControllerPreflight(invokeController(['preflight'], credentials))
    if (command === 'ci-rollback') {
      if (process.env.EQB_ROLLBACK_CONFIRM !== 'ROLLBACK') throw new Error('Confirmation must be ROLLBACK')
      const before = readPreflight()
      if (!before.previousSha) throw new Error('No safe previous release; migration or missing history/marker')
      const receipt = parseDeploymentControllerOutput(
        invokeController(['deploy', before.previousSha], credentials), before.previousSha)
      if (receipt.rolledBackFrom !== before.productionSha) throw new Error('CURRENT_CHANGED; reconcile host receipt')
      const issue = upsertIssue(`自动上线已暂停：已回退 ${before.productionSha} → ${receipt.targetSha}`,
        `回退已完成。恢复自动上线：关闭本 issue（手机上点 Close issue），再运行 Deploy 的 auto，或等待下一次 main Verify 全绿。\n运行：${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`, true)
      const health = readPreflight()
      if (health.productionSha !== receipt.targetSha || health.eqb !== 'active' || health.caddy !== 'active') {
        throw new Error(`Rollback health mismatch; deployments paused at ${issue.html_url}`)
      }
      summary(`PASS：回退 ${before.productionSha} → ${receipt.targetSha}；health release=${health.productionSha}；暂停：${issue.html_url}`)
      return
    }
    const resolved = await candidate()
    if (command === 'ci-plan') {
      const before = readPreflight()
      const paths = runGit(['diff', '--name-only', '--no-renames', before.productionSha, resolved.sha,
        '--', ...EQB_PERSISTENCE_AUTHORITY_PATHS]).trim().split('\n').filter(Boolean)
      const requiresReview = paths.length > 0
      if (requiresReview) {
        const issue = upsertIssue(`需要部署判断：${resolved.sha}`,
          `当前版本：${before.productionSha}\n目标版本：${resolved.sha}\n保护路径：\n${paths.map(p => `- \`${p}\``).join('\n')}\n\n请在 Deploy → Run workflow 选 code-only 或 migration；production-reviewed 必须由 Owner 批准。`)
        summary(`需要部署判断：${issue.html_url}`)
      }
      ciOutput({ sha: resolved.sha, production: before.productionSha,
        digest: paths.length ? deploymentChangedPathDigest(paths) : '', deploy: !(requiresReview && mode === 'auto') })
      summary(`计划：${before.productionSha} → ${resolved.sha}；mode=${mode}；保护路径=${paths.length}`)
      return
    }
    if (command !== 'ci-deploy' || resolved.sha !== process.env.EQB_EXPECTED_SHA) throw new Error('MAIN_CHANGED')
    const result = await deployLatestRelease({
      argv: ['deploy', '--owner-said-deploy-latest', ...(mode === 'auto' ? [] : [`--${mode}`])],
      resolveCandidate: async () => resolved,
      revalidateCandidate: assertCandidateStillAuthoritative,
      readProductionSha: () => {
        const sha = readPreflight().productionSha
        if (sha !== process.env.EQB_EXPECTED_PRODUCTION) throw new Error('CURRENT_CHANGED')
        return sha
      },
      readChangedPaths: (previous, target, paths) => {
        const changed = runGit(['diff', '--name-only', '--no-renames', previous, target, '--', ...paths])
          .trim().split('\n').filter(Boolean)
        if ((changed.length ? deploymentChangedPathDigest(changed) : '') !== process.env.EQB_EXPECTED_DIGEST) throw new Error('DIFF_CHANGED')
        return changed
      },
      invokeController: (sha, classification, digest) => {
        if (paused()) throw new Error('DEPLOY_PAUSED')
        return invokeController(['deploy', sha, ...(classification ? [classification, digest] : [])], credentials)
      },
    })
    const health = readPreflight()
    if (health.productionSha !== result.candidate.sha || health.eqb !== 'active' || health.caddy !== 'active') {
      throw new Error('Post-deploy health release mismatch')
    }
    summary(`PASS：部署 ${result.candidate.sha}；health release=${health.productionSha}；eqb=${health.eqb}；caddy=${health.caddy}`)
  })
}

try {
  if (/^(?:root-barrier-|bootstrap|baseline|maintenance-install-readiness|install-controlled-ssh|status|reviewed-persistence|update-host-config)/u.test(process.argv[2] || '')) {
    throw new Error('Retired control-plane command; controlled SSH migration requires separate root authorization')
  }
  if (['ci-plan', 'ci-deploy', 'ci-rollback'].includes(process.argv[2])) await ci(process.argv[2])
  else if (process.argv[2] === 'plan') await plan()
  else if (process.argv[2] === 'preflight') await preflight()
  else if (process.argv[2] === 'deploy') await deploy()
  else throw new Error('Usage: amp-orb-deploy.mjs plan | preflight --owner-said-preflight | deploy --owner-said-deploy-latest')
} catch (error) {
  if (process.env.GITHUB_ACTIONS === 'true') summary(`FAIL：${error.message}；结果不明时先核对主机回执，不自动重试。`)
  console.error(`Amp Orb deployment failed closed: ${error.message}`)
  process.exitCode = 1
}
