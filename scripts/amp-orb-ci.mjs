#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import {
  AMP_ORB_CI_LOCK_CONFLICT_EXIT_CODE,
  ampOrbCILockInvocation,
  ampOrbCIRunId,
  createGitHubAppInstallationTokenProvider,
  createGitHubCheckWriter,
  createGitHubPullRequestReader,
  defaultAmpOrbCIStateDir,
  drainAmpOrbCIQueue,
  executeAmpOrbCILanes,
  planAmpOrbCIQueue,
  repositoryRootFromModule,
  resolveAmpOrbCIPullRequest,
  runAmpOrbCIJob,
} from './lib/ampOrbCI.mjs'
import {
  acknowledgeAmpOrbCICoordinationWake,
  activateAmpOrbCICoordination,
  pauseAmpOrbCICoordination,
  readAmpOrbCICoordination,
  selectAmpOrbCIPullRequest,
} from './lib/ampOrbCICoordination.mjs'

function values(flag) {
  const matches = []
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === flag && process.argv[index + 1]) {
      matches.push(process.argv[index + 1])
    }
  }
  return matches
}

function positiveIntegerFlag(flag) {
  const value = values(flag).at(-1)
  if (!/^\d+$/u.test(value || '') || Number(value) < 1 || !Number.isSafeInteger(Number(value))) {
    throw new Error(`Invalid ${flag}`)
  }
  return Number(value)
}

function parseInput() {
  if (process.argv[2] !== 'run' || !process.argv.includes('--forced')) {
    throw new Error('Usage: amp-orb-ci.mjs run --forced <fixed diagnostic CI identity>')
  }
  const event = values('--event').at(-1)
  const pullRequest = values('--pull-request').at(-1)
  return {
    event,
    sha: values('--sha').at(-1),
    testedSha: values('--tested-sha').at(-1),
    baseSha: values('--base-sha').at(-1),
    deliveryId: values('--delivery').at(-1),
    pullRequestNumber: pullRequest === undefined ? null : Number(pullRequest),
    forced: true,
  }
}

const repositoryRoot = repositoryRootFromModule(import.meta.url, 1)
const stateDir = defaultAmpOrbCIStateDir(repositoryRoot)
const controllerCommand = process.argv[2]
const drainCommands = new Set(['drain', 'coord-select', 'coord-resume'])
const lockedCommands = new Set([
  ...drainCommands,
  'coord-activate',
  'coord-pause',
])

if (controllerCommand === 'coord-status') {
  console.log(JSON.stringify({
    coordination: readAmpOrbCICoordination(stateDir),
    queue: planAmpOrbCIQueue({ stateDir }),
  }, null, 2))
  process.exit(0)
}

if (process.env.AMP_ORB_CI_LOCK_HELD !== '1') {
  const invocation = ampOrbCILockInvocation({
    stateDir,
    controllerPath: fileURLToPath(import.meta.url),
    controllerArgs: process.argv.slice(2),
    wait: lockedCommands.has(controllerCommand),
  })
  const result = spawnSync(invocation.command, invocation.args, {
    encoding: 'utf8',
    env: { ...process.env, AMP_ORB_CI_LOCK_HELD: '1' },
    stdio: 'inherit',
  })
  if (result.error) throw result.error
  if (result.status === AMP_ORB_CI_LOCK_CONFLICT_EXIT_CODE) {
    console.log('Amp Orb CI is already running; durable queue work remains serial.')
    process.exit(0)
  }
  process.exit(result.status ?? 1)
}

try {
  if (!lockedCommands.has(controllerCommand) && controllerCommand !== 'run') {
    throw new Error('Usage: amp-orb-ci.mjs drain|run|coord-activate|coord-select|coord-pause|coord-resume|coord-status')
  }
  const getInstallationToken = drainCommands.has(controllerCommand)
    ? createGitHubAppInstallationTokenProvider({
        appId: process.env.QUESTION_BANK_AMP_CI_GITHUB_APP_ID,
        installationId: process.env.QUESTION_BANK_AMP_CI_GITHUB_APP_INSTALLATION_ID,
        privateKey: process.env.QUESTION_BANK_AMP_CI_GITHUB_APP_PRIVATE_KEY,
      }) : null
  const publishCheck = drainCommands.has(controllerCommand)
    ? createGitHubCheckWriter({
        appId: process.env.QUESTION_BANK_AMP_CI_GITHUB_APP_ID,
        getInstallationToken,
      })
    : null
  const getPullRequest = drainCommands.has(controllerCommand)
    ? createGitHubPullRequestReader({ getInstallationToken }) : null
  const runJob = (input) => runAmpOrbCIJob(input, {
    stateDir: defaultAmpOrbCIStateDir(repositoryRoot),
    publishCheck,
    // Forced diagnostics have no Check writer or App token and always run Full.
    // Natural PRs must use live API freshness; diagnostics still validate the bundle.
    assertFresh: input.event === 'pull_request' && drainCommands.has(controllerCommand) ? async (candidate) => {
      const current = await resolveAmpOrbCIPullRequest({
        kind: 'resolve', event: 'pull_request', sha: candidate.sha, baseSha: candidate.baseSha,
        deliveryId: candidate.deliveryId, pullRequestNumber: candidate.pullRequestNumber,
      }, { repositoryRoot, getPullRequest, retryDelaysMs: [0] })
      return current !== null && ampOrbCIRunId(current) === ampOrbCIRunId(candidate)
    } : async () => true,
    execute: ({ input: exactInput, onFastResult, writeOutput }) => executeAmpOrbCILanes(exactInput, {
      onFastResult,
      repositoryRoot,
      writeOutput,
    }),
  })
  const drainQueue = async () => {
    const before = readAmpOrbCICoordination(stateDir)
    const dispositions = []
    const results = await drainAmpOrbCIQueue({
      stateDir,
      resolveJob: (input) => resolveAmpOrbCIPullRequest(input, {
        repositoryRoot,
        getPullRequest,
      }),
      runJob,
      onDisposition(disposition) { dispositions.push(disposition) },
    })
    if (before.active && before.mode === 'selected' && before.wakePendingGeneration !== null) {
      acknowledgeAmpOrbCICoordinationWake({
        stateDir,
        generation: before.wakePendingGeneration,
        dispositions,
      })
    }
    const deferred = results.filter(({ outcome }) => outcome === 'deferred').length
    const waiting = results.filter(({ outcome }) => outcome === 'waiting').length
    const waitingSummary = waiting > 0 ? `; ${waiting} waiting` : ''
    console.log(`Amp Orb CI processed ${results.length} queued delivery(s); ${deferred} deferred${waitingSummary}.`)
    if (deferred > 0) process.exitCode = 1
    return results
  }
  if (controllerCommand === 'coord-activate') {
    const coordination = activateAmpOrbCICoordination({
      stateDir,
      pullRequestNumbers: values('--pull-request'),
    })
    console.log(JSON.stringify(coordination, null, 2))
  } else if (controllerCommand === 'coord-select') {
    selectAmpOrbCIPullRequest({
      stateDir,
      expectedGeneration: positiveIntegerFlag('--expected-generation'),
      pullRequestNumber: positiveIntegerFlag('--pull-request'),
      sha: values('--head').at(-1),
      baseSha: values('--base').at(-1),
    })
    await drainQueue()
  } else if (controllerCommand === 'coord-pause') {
    const coordination = pauseAmpOrbCICoordination({
      stateDir,
      expectedGeneration: positiveIntegerFlag('--expected-generation'),
    })
    console.log(JSON.stringify(coordination, null, 2))
  } else if (controllerCommand === 'coord-resume' || controllerCommand === 'drain') {
    // Resume always performs one ordinary drain, even after a prior wake was
    // acknowledged, so a real delivery whose launcher failed is recoverable.
    await drainQueue()
  } else {
    const input = parseInput()
    const result = await runJob(input)
    const conclusion = result.receipt?.conclusion || 'unchanged'
    console.log(`Amp Orb CI ${result.outcome}: ${conclusion} for ${input.sha}`)
    if (result.logPath) console.log(`Private log: ${result.logPath}`)
  }
} catch (error) {
  console.error(`Amp Orb CI controller failed: ${error.message}`)
  process.exitCode = 1
}
