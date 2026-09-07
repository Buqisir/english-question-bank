#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import {
  mkdirSync,
  rmSync,
} from 'node:fs'
import path from 'node:path'
import { performance } from 'node:perf_hooks'

import { runVerificationCommand } from './lib/verificationCommandRunner.mjs'

const RUNNER_ROOT = '/var/tmp/eqb-amp-ci'
const SHA = /^[a-f0-9]{40}$/u
const BUNDLE = /^\/var\/tmp\/eqb-amp-ci\/inbox\/[a-f0-9-]{36}\/repository\.bundle$/u
const LANES = new Set(['fast', 'full'])

export function parseSandboxInput(argv = process.argv) {
  const value = (flag) => {
    const index = argv.lastIndexOf(flag)
    return index === -1 ? undefined : argv[index + 1]
  }
  const event = value('--event')
  const sha = value('--sha')
  const testedSha = value('--tested-sha')
  const baseSha = value('--base-sha')
  const bundlePath = value('--bundle')
  const lane = value('--lane')
  const verifyChanged = argv.includes('--verify-changed')
  const pullRequestValue = value('--pull-request')
  const pullRequestNumber = pullRequestValue === undefined ? null : Number(pullRequestValue)
  if (!['pull_request', 'push'].includes(event)) throw new Error('Invalid sandbox event')
  if (!SHA.test(sha || '') || !SHA.test(testedSha || '') || !SHA.test(baseSha || '')) {
    throw new Error('Invalid sandbox SHA')
  }
  if (!BUNDLE.test(bundlePath || '')) throw new Error('Invalid sandbox bundle path')
  if (!LANES.has(lane)) throw new Error('Invalid sandbox lane')
  if (event === 'pull_request' && (!Number.isSafeInteger(pullRequestNumber) || pullRequestNumber < 1)) {
    throw new Error('Invalid sandbox pull request')
  }
  if (event === 'push' && pullRequestNumber !== null) throw new Error('Push sandbox input has a PR')
  if (event === 'push' && testedSha !== sha) throw new Error('Push sandbox commits differ')
  if (verifyChanged && (event !== 'pull_request' || lane !== 'fast')) throw new Error('Invalid changed verification lane')
  return {
    event,
    sha,
    testedSha,
    baseSha,
    bundlePath,
    lane,
    verifyChanged,
    pullRequestNumber,
    forced: argv.includes('--forced'),
  }
}

function runGit(args, { cwd = RUNNER_ROOT, allowFailure = false } = {}) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 120_000,
  })
  if (!allowFailure && result.status !== 0) {
    throw new Error(`git ${args[0]} failed (${result.status})\n${result.stderr.slice(-2_000)}`)
  }
  return result
}

export const AMP_ORB_CI_E2E_COMMANDS = Object.freeze([
  ['node', ['scripts/verify-draft-pagination-renderer.mjs']],
  ['node', ['scripts/verify-draft-pagination-dom-contract.mjs']],
  ['node', ['scripts/verify-a3-imposition.mjs']],
  ['node', ['scripts/verify-reorder-suggest.mjs']],
  ['node', ['scripts/verify-paper-normalization-grammar-fill-browser.mjs']],
  ['node', ['scripts/smoke-golden-path.mjs']],
])

export const AMP_ORB_CI_FAST_PORTS = Object.freeze({
  'scripts/verify-a3-imposition.mjs': Object.freeze({ api: '15997', vite: '15197' }),
  'scripts/verify-reorder-suggest.mjs': Object.freeze({ api: '15998', vite: '15198' }),
  'scripts/smoke-golden-path.mjs': Object.freeze({ api: '15999', vite: '15199' }),
})

export function ampOrbCILaneCommands(lane) {
  if (lane === 'fast') return AMP_ORB_CI_E2E_COMMANDS
  if (lane === 'full') return [['pnpm', ['-C', 'app', 'verify:all']]]
  throw new Error('Invalid sandbox lane')
}

async function runCommand(command, args, { cwd, onOutput = null, signal }) {
  console.log(`\n==> ${command} ${args.join(' ')}`)
  return runVerificationCommand(command, args, {
    abortSignal: signal,
    cwd,
    stdout(chunk) {
      process.stdout.write(chunk)
      onOutput?.(chunk)
    },
    stderr(chunk) {
      process.stderr.write(chunk)
      onOutput?.(chunk)
    },
  })
}

export async function runSandbox(input, { signal }) {
  const startedAt = performance.now()
  mkdirSync(path.join(RUNNER_ROOT, 'runs'), { recursive: true, mode: 0o700 })
  const checkout = path.join(RUNNER_ROOT, 'runs', `${input.testedSha}-${randomUUID()}`)
  try {
    runGit(['init', '--initial-branch=amp-ci-empty', checkout])
    runGit([
      'fetch',
      '--no-tags',
      input.bundlePath,
      '+refs/amp-ci/bundle/*:refs/amp-ci/bundle/*',
    ], { cwd: checkout })
    runGit(['update-ref', 'refs/remotes/origin/main', input.baseSha], { cwd: checkout })
    runGit(['checkout', '--detach', input.testedSha], { cwd: checkout })
    const head = runGit(['rev-parse', 'HEAD'], { cwd: checkout }).stdout.trim()
    const base = runGit(['cat-file', '-e', `${input.baseSha}^{commit}`], {
      allowFailure: true,
      cwd: checkout,
    })
    const initialStatus = runGit(['status', '--porcelain', '--untracked-files=no'], { cwd: checkout })
      .stdout.trim()
    if (head !== input.testedSha || base.status !== 0 || initialStatus) {
      throw new Error('Exact sandbox checkout/base identity is not clean')
    }

    const setupCommands = [
      ['pnpm', ['-C', 'app', 'install', '--frozen-lockfile']],
      ['npm', ['--prefix', 'server', 'ci']],
      ['pnpm', ['-C', 'app', 'exec', 'playwright', 'install', '--no-shell', 'chromium']],
    ]
    for (const [command, args] of setupCommands) {
      const exitCode = await runCommand(command, args, { cwd: checkout, signal })
      if (exitCode !== 0) {
        return {
          kind: 'setup-failed',
          lane: input.lane,
          exitCode,
          wallSeconds: (performance.now() - startedAt) / 1000,
        }
      }
    }

    let verifyExitCode = null
    let verificationCounts = null
    const e2eFailures = []
    if (input.lane === 'fast') {
      const commands = [...ampOrbCILaneCommands(input.lane)]
      if (input.verifyChanged) commands.push(['pnpm', ['-C', 'app', 'verify:changed', '--', '--base-ref', input.baseSha]])
      for (const [command, args] of commands) {
        const ports = AMP_ORB_CI_FAST_PORTS[args[0]]
        if (ports) {
          process.env.AMP_ORB_CI_API_PORT = ports.api
          process.env.AMP_ORB_CI_VITE_PORT = ports.vite
        } else {
          delete process.env.AMP_ORB_CI_API_PORT
          delete process.env.AMP_ORB_CI_VITE_PORT
        }
        let summaryTail = ''
        const exitCode = await runCommand(command, args, { cwd: checkout, signal,
          onOutput(chunk) { summaryTail = `${summaryTail}${chunk}`.slice(-16_384) } })
        if (args.includes('verify:changed')) {
          verifyExitCode = exitCode
          const matches = [...summaryTail.matchAll(/PASS (\d+) \/ SKIP (\d+) \/ FAIL (\d+)/gu)]
          if (matches.length === 1) verificationCounts = {
            pass: Number(matches[0][1]), skip: Number(matches[0][2]), fail: Number(matches[0][3]),
          }
        } else if (exitCode !== 0) e2eFailures.push({ command, args, exitCode })
      }
      delete process.env.AMP_ORB_CI_API_PORT
      delete process.env.AMP_ORB_CI_VITE_PORT
    } else {
      const [[command, args]] = ampOrbCILaneCommands(input.lane)
      let summaryTail = ''
      verifyExitCode = await runCommand(command, args, {
        cwd: checkout,
        onOutput(chunk) {
          summaryTail = `${summaryTail}${chunk}`.slice(-16_384)
        },
        signal,
      })
      const matches = [...summaryTail.matchAll(/PASS (\d+) \/ SKIP (\d+) \/ FAIL (\d+)/gu)]
      if (matches.length === 1) {
        verificationCounts = {
          pass: Number(matches[0][1]),
          skip: Number(matches[0][2]),
          fail: Number(matches[0][3]),
        }
      }
    }
    const finalHead = runGit(['rev-parse', 'HEAD'], { cwd: checkout }).stdout.trim()
    const finalStatus = runGit(['status', '--porcelain', '--untracked-files=no'], { cwd: checkout })
      .stdout.trim()
    const clean = finalHead === input.testedSha && finalStatus === ''
    const laneExitCode = input.lane === 'fast'
      ? (e2eFailures.length === 0 && clean && (!input.verifyChanged
        || (verifyExitCode === 0 && verificationCounts && verificationCounts.fail === 0)) ? 0 : 1)
      : (verifyExitCode === 0 && verificationCounts?.fail === 0 && clean ? 0 : 1)
    return {
      kind: 'verified',
      lane: input.lane,
      verifyExitCode,
      verificationCounts,
      e2eFailureCount: e2eFailures.length,
      commandCount: input.lane === 'fast' ? AMP_ORB_CI_E2E_COMMANDS.length + (input.verifyChanged ? 1 : 0) : 1,
      clean,
      wallSeconds: (performance.now() - startedAt) / 1000,
      exitCode: laneExitCode,
    }
  } finally {
    rmSync(checkout, { force: true, recursive: true })
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const abortController = new AbortController()
  const abort = (signal) => abortController.abort(signal)
  process.once('SIGINT', () => abort('SIGINT'))
  process.once('SIGTERM', () => abort('SIGTERM'))
  let input = null
  try {
    input = parseSandboxInput()
    const result = await runSandbox(input, { signal: abortController.signal })
    console.log(`AMP_ORB_CI_RESULT ${JSON.stringify(result)}`)
    if (result.exitCode !== 0) {
      process.exitCode = 1
    }
  } catch (error) {
    console.error(`Amp Orb CI sandbox failed: ${error.message}`)
    console.log(`AMP_ORB_CI_RESULT ${JSON.stringify({
      kind: 'sandbox-error',
      lane: input?.lane ?? null,
    })}`)
    process.exitCode = 1
  }
}
