#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import {
  AMP_ORB_CI_LOCK_CONFLICT_EXIT_CODE,
  ampOrbCILockInvocation,
  createGitHubStatusWriter,
  defaultAmpOrbCIStateDir,
  executeAmpOrbCISandbox,
  repositoryRootFromModule,
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
  if (process.argv[2] !== 'run') throw new Error('Usage: amp-orb-ci.mjs run <fixed webhook identity>')
  const event = values('--event').at(-1)
  const pullRequest = values('--pull-request').at(-1)
  return {
    event,
    sha: values('--sha').at(-1),
    testedSha: values('--tested-sha').at(-1),
    baseSha: values('--base-sha').at(-1),
    deliveryId: values('--delivery').at(-1),
    pullRequestNumber: pullRequest === undefined ? null : Number(pullRequest),
    forced: process.argv.includes('--forced'),
  }
}

const repositoryRoot = repositoryRootFromModule(import.meta.url)
const stateDir = defaultAmpOrbCIStateDir(repositoryRoot)

if (process.env.AMP_ORB_CI_LOCK_HELD !== '1') {
  const invocation = ampOrbCILockInvocation({
    stateDir,
    controllerPath: fileURLToPath(import.meta.url),
    controllerArgs: process.argv.slice(2),
  })
  const result = spawnSync(invocation.command, invocation.args, {
    encoding: 'utf8',
    env: { ...process.env, AMP_ORB_CI_LOCK_HELD: '1' },
    stdio: 'inherit',
  })
  if (result.error) throw result.error
  if (result.status === AMP_ORB_CI_LOCK_CONFLICT_EXIT_CODE) {
    console.log('Amp Orb shadow CI is already running; queued owning-thread messages remain serial.')
    process.exit(0)
  }
  process.exit(result.status ?? 1)
}

try {
  const input = parseInput()
  const writeStatus = createGitHubStatusWriter({
    token: String(process.env.QUESTION_BANK_AMP_CI_GITHUB_STATUS_TOKEN || ''),
    threadId: String(process.env.AMP_THREAD_ID || ''),
  })
  const result = await runAmpOrbCIJob(input, {
    stateDir: defaultAmpOrbCIStateDir(repositoryRoot),
    writeStatus,
    execute: ({ input: exactInput, writeOutput }) => executeAmpOrbCISandbox(exactInput, {
      repositoryRoot,
      writeOutput,
    }),
  })
  const conclusion = result.receipt?.conclusion || 'unchanged'
  console.log(`Amp Orb shadow CI ${result.outcome}: ${conclusion} for ${input.sha}`)
  if (result.logPath) console.log(`Private log: ${result.logPath}`)
} catch (error) {
  console.error(`Amp Orb shadow CI controller failed: ${error.message}`)
  process.exitCode = 1
}
