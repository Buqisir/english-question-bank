#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import {
  AMP_ORB_CI_LOCK_CONFLICT_EXIT_CODE,
  ampOrbCILockInvocation,
  createGitHubAppInstallationTokenProvider,
  createGitHubCheckWriter,
  createGitHubStatusWriter,
  defaultAmpOrbCIStateDir,
  discoverAmpOrbCIJobs,
  drainAmpOrbCIQueue,
  enqueueAmpOrbCIJob,
  executeAmpOrbCILanes,
  repositoryRootFromModule,
  resolveAmpOrbCIPullRequest,
  runAmpOrbCIJob,
} from './lib/ampOrbCI.mjs'

function values(flag) {
  const matches = []
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === flag && process.argv[index + 1]) {
      matches.push(process.argv[index + 1])
    }
  }
  return matches
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
const queueCommands = new Set(['discover', 'drain'])

if (process.env.AMP_ORB_CI_LOCK_HELD !== '1') {
  const invocation = ampOrbCILockInvocation({
    stateDir,
    controllerPath: fileURLToPath(import.meta.url),
    controllerArgs: process.argv.slice(2),
    wait: queueCommands.has(controllerCommand),
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
  if (!queueCommands.has(controllerCommand) && controllerCommand !== 'run') {
    throw new Error('Usage: amp-orb-ci.mjs discover|drain|run')
  }
  const token = String(process.env.QUESTION_BANK_AMP_CI_GITHUB_STATUS_TOKEN || '')
  const writeStatus = createGitHubStatusWriter({
    token,
    threadId: String(process.env.AMP_THREAD_ID || ''),
  })
  const checksEnabled = process.env.QUESTION_BANK_AMP_CI_GITHUB_CHECKS_ENABLED === '1'
  const publishCheck = checksEnabled
    ? createGitHubCheckWriter({
        appId: process.env.QUESTION_BANK_AMP_CI_GITHUB_APP_ID,
        getInstallationToken: createGitHubAppInstallationTokenProvider({
          appId: process.env.QUESTION_BANK_AMP_CI_GITHUB_APP_ID,
          installationId: process.env.QUESTION_BANK_AMP_CI_GITHUB_APP_INSTALLATION_ID,
          privateKey: process.env.QUESTION_BANK_AMP_CI_GITHUB_APP_PRIVATE_KEY,
        }),
      })
    : null
  const runJob = (input) => runAmpOrbCIJob(input, {
    stateDir: defaultAmpOrbCIStateDir(repositoryRoot),
    publishCheck,
    writeStatus,
    execute: ({ input: exactInput, onFastResult, writeOutput }) => executeAmpOrbCILanes(exactInput, {
      onFastResult,
      repositoryRoot,
      writeOutput,
    }),
  })
  if (controllerCommand === 'discover') {
    const jobs = await discoverAmpOrbCIJobs({ token })
    const queued = jobs.map((input) => enqueueAmpOrbCIJob(input, { stateDir }))
      .filter(({ outcome }) => outcome === 'queued').length
    console.log(`Amp Orb CI discovered ${jobs.length} current target(s); ${queued} newly queued.`)
  }
  if (queueCommands.has(controllerCommand)) {
    const results = await drainAmpOrbCIQueue({
      stateDir,
      resolveJob: (input) => resolveAmpOrbCIPullRequest(input, { repositoryRoot }),
      runJob,
    })
    const deferred = results.filter(({ outcome }) => outcome === 'deferred').length
    console.log(`Amp Orb CI processed ${results.length} queued delivery(s); ${deferred} deferred.`)
    if (deferred > 0) process.exitCode = 1
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
