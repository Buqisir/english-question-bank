#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
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
  EQB_HOST_CONFIGURATION_PATHS,
  EQB_PERSISTENCE_AUTHORITY_PATHS,
  EQB_STABLE_LAUNCHER_PATHS,
  abandonReleaseBootstrapRecovery,
  activatePreparedRelease,
  assertDeploymentCandidateStillCurrent,
  assertAuthoritativeDeploymentChecks,
  bootstrapPayloadStageInput,
  bootstrapReleaseLayout,
  classifyReleaseBootstrapJournal,
  classifyReleaseBootstrapOutcome,
  clearAbandonedReleaseBootstrapRecovery,
  clearCompletedReleaseBootstrapRecovery,
  completeReleaseBootstrapRecovery,
  createReleaseBootstrapRecovery,
  currentReleaseSha,
  deployReviewedPersistenceLatest,
  deployLatestRelease,
  deploymentChangedPathDigest,
  deploymentGitHubApiArgs,
  deploymentLockInvocation,
  deploymentSSHInvocation,
  deploymentSSHTransportUser,
  isSshPublicKeyAuthenticationDenied,
  materializeDeploymentCredentials,
  migrateLegacyProductionBaseline,
  parseBootstrapKeyRetirementReceipt,
  parseDeploymentControllerOutput,
  parseDeploymentControllerPreflight,
  parseDeploymentPreflightOutput,
  parseHostConfigurationControllerOutput,
  parseLegacyBaselineReceipt,
  parseOpenSshEd25519PublicKeyBody,
  parseReviewedPersistenceControllerOutput,
  parseReleaseBootstrapCancellation,
  parseReleaseBootstrapFailure,
  readAbandonedReleaseBootstrapRecovery,
  readCompletedReleaseBootstrapRecovery,
  readReleaseBootstrapRecovery,
  removeReleaseBootstrapRecovery,
  requireDeployLatestAuthorization,
  requireLegacyBaselineAuthorization,
  requireReleaseLayoutBootstrapAuthorization,
  requireReleaseLayoutBootstrapAbandonAuthorization,
  requireReleaseLayoutBootstrapResumeAuthorization,
  requireReviewedPersistenceDeployAuthorization,
  requireUpdateHostConfigurationAuthorization,
  resumeReleaseLayoutBootstrap,
  resolveLatestDeploymentCandidate,
  updateLatestHostConfiguration,
} from './lib/ampOrbDeploy.mjs'
import {
  EQB_DEPLOY_CONTROLLER_VERSION,
  HOST_CONFIGURATION_PATHS,
  PERSISTENCE_AUTHORITY_PATHS,
  STABLE_LAUNCHER_PATHS,
  formatControllerOutput,
  parseControllerCommand,
  runController,
} from '../deploy/eqb-deploy-controller.mjs'
import {
  controllerSudoAllowed,
  inspectLegacyBaselineState,
  legacyReleaseChildProof,
} from '../deploy/eqb-legacy-baseline-state.mjs'
import { createVerifier, readText, repoRootFrom } from './lib/verifyScope.mjs'

const ROOT = repoRootFrom(import.meta.url)
const { assert, section, summary } = createVerifier('Amp Orb production deployment contract')
const oldSha = '1'.repeat(40)
const newSha = '2'.repeat(40)

function checkRun(name, sha, {
  id,
  status = 'completed',
  conclusion = 'success',
  app = 'github-actions',
  suiteId = 100,
  detailsUrl = `https://github.com/Buqisir/english-question-bank/actions/runs/200/job/${id}`,
} = {}) {
  return {
    id,
    name,
    head_sha: sha,
    status,
    conclusion,
    details_url: detailsUrl,
    app: { slug: app },
    check_suite: { id: suiteId },
  }
}

function checks(sha, { verify = {}, e2e = {} } = {}) {
  return {
    total_count: 2,
    check_runs: [
      { ...checkRun('verify', sha, { id: 1 }), ...verify },
      { ...checkRun('e2e', sha, { id: 2 }), ...e2e },
    ],
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
for (const [authorize, argv, label] of [
  [
    requireReviewedPersistenceDeployAuthorization,
    ['reviewed-persistence', '--owner-said-reviewed-persistence-deploy'],
    'reviewed-persistence deployment',
  ],
  [
    requireUpdateHostConfigurationAuthorization,
    ['update-host-config', '--owner-said-update-host-config'],
    'host configuration update',
  ],
]) {
  assert((() => {
    authorize(argv)
    return true
  })(), `${label} requires its distinct Owner authorization`)
  assert((() => {
    try {
      authorize([argv[0], '--sha', newSha])
      return false
    } catch {
      return true
    }
  })(), `${label} rejects a caller-selected SHA or missing authorization`)
}
assert(
  (() => {
    requireReleaseLayoutBootstrapResumeAuthorization([
      'bootstrap-resume',
      '--owner-said-release-bootstrap-resume',
    ])
    return true
  })(),
  'bootstrap recovery requires its separate explicit Owner authorization',
)
assert(
  (() => {
    try {
      requireReleaseLayoutBootstrapResumeAuthorization([
        'bootstrap-resume',
        '--owner-said-release-bootstrap-resume',
        '--sha',
        newSha,
      ])
      return false
    } catch {
      return true
    }
  })(),
  'bootstrap recovery target cannot be replaced by a caller-supplied SHA',
)

const candidate = await resolveLatestDeploymentCandidate({
  runGit: fakeGit(),
  readMainSha: async () => newSha,
  readCommitChecks: async (sha) => checks(sha),
})
assert(candidate.sha === newSha, 'current clean main resolves automatically')
assert(
  candidate.verification.provider === 'github-actions'
    && candidate.verification.checks.map(({ name }) => name).join(',') === 'verify,e2e',
  'exact hosted verify and e2e success is authoritative',
)
assert(
  deploymentGitHubApiArgs(
    `repos/Buqisir/english-question-bank/commits/${newSha}/check-runs?filter=latest&per_page=100`,
  ).join(' ') === `api --hostname github.com repos/Buqisir/english-question-bank/commits/${newSha}/check-runs?filter=latest&per_page=100`,
  'GitHub API authority is pinned to github.com regardless of GH_HOST',
)

const fastForwarded = await resolveLatestDeploymentCandidate({
  runGit: fakeGit({ localSha: oldSha }),
  readMainSha: async () => newSha,
  readCommitChecks: async (sha) => checks(sha),
})
assert(fastForwarded.sha === newSha, 'stale clean main fast-forwards without an Owner-supplied SHA')

for (const [label, options, readMainSha, readCommitChecks] of [
  ['non-main checkout', { branch: 'feature' }, async () => newSha, async (sha) => checks(sha)],
  ['dirty checkout', { dirty: ' M server/api.mjs\n' }, async () => newSha, async (sha) => checks(sha)],
  ['diverged checkout', { mergeError: true }, async () => newSha, async (sha) => checks(sha)],
  ['main changed after fetch', {}, async () => '3'.repeat(40), async (sha) => checks(sha)],
  [
    'missing required check',
    {},
    async () => newSha,
    async (sha) => ({ total_count: 1, check_runs: [checkRun('verify', sha, { id: 1 })] }),
  ],
  [
    'pending required check',
    {},
    async () => newSha,
    async (sha) => checks(sha, { e2e: { status: 'in_progress', conclusion: null } }),
  ],
]) {
  let rejected = false
  try {
    await resolveLatestDeploymentCandidate({
      runGit: fakeGit(options),
      readMainSha,
      readCommitChecks,
    })
  } catch {
    rejected = true
  }
  assert(rejected, `${label} fails closed before SSH`)
}

assert(
  (() => {
    try {
      const wrongSha = checks(newSha)
      wrongSha.check_runs[0].head_sha = oldSha
      assertAuthoritativeDeploymentChecks(wrongSha, newSha)
      return false
    } catch {
      return true
    }
  })(),
  'a required check for another SHA cannot authorize deployment',
)
assert(
  (() => {
    try {
      assertAuthoritativeDeploymentChecks({
        total_count: 2,
        check_runs: [
          checkRun('verify (manual)', newSha, { id: 1 }),
          checkRun('e2e (manual)', newSha, { id: 2 }),
        ],
      }, newSha)
      return false
    } catch {
      return true
    }
  })(),
  'manual workflow jobs cannot authorize deployment',
)
assert(
  (() => {
    try {
      const newerPending = checks(newSha)
      newerPending.check_runs.push(checkRun('verify', newSha, {
        id: 3,
        status: 'in_progress',
        conclusion: null,
      }))
      assertAuthoritativeDeploymentChecks(newerPending, newSha)
      return false
    } catch {
      return true
    }
  })(),
  'an older success cannot override a newer pending required check',
)
assert(
  (() => {
    try {
      const wrongSource = checks(newSha)
      wrongSource.check_runs[0].app = { slug: 'untrusted-check-app' }
      assertAuthoritativeDeploymentChecks(wrongSource, newSha)
      return false
    } catch {
      return true
    }
  })(),
  'a same-name success from another check source cannot authorize deployment',
)
assert(
  (() => {
    try {
      const wrongTarget = checks(newSha)
      wrongTarget.check_runs[0].details_url = 'https://example.invalid/actions/runs/200/job/1'
      assertAuthoritativeDeploymentChecks(wrongTarget, newSha)
      return false
    } catch {
      return true
    }
  })(),
  'a GitHub Actions check targeting another repository cannot authorize deployment',
)
assert(
  (() => {
    try {
      const mixedRuns = checks(newSha)
      mixedRuns.check_runs[1].check_suite = { id: 101 }
      assertAuthoritativeDeploymentChecks(mixedRuns, newSha)
      return false
    } catch {
      return true
    }
  })(),
  'successes from different workflow runs cannot be combined to authorize deployment',
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

function controllerReceipt({
  targetSha = newSha,
  conclusion = 'success',
  failureCode = null,
} = {}) {
  return `EQB_DEPLOY_RECEIPT ${JSON.stringify({
    schemaVersion: 'eqb-deployment-receipt-v2',
    controllerVersion: 'eqb-deploy-controller-v1',
    state: 'reported',
    conclusion,
    targetSha,
    previousSha: oldSha,
    staged: true,
    noOp: false,
    rolledBack: conclusion === 'failure',
    rollbackHealthy: conclusion === 'failure' ? true : null,
    failureCode,
    startedAt: '2026-09-02T00:00:00.000Z',
    finishedAt: '2026-09-02T00:01:00.000Z',
    receiptPath: `/opt/eqb/deployments/receipts/20260902-${targetSha}-fixture.json`,
  })}`
}

const parsedControllerReceipt = parseDeploymentControllerOutput(
  controllerReceipt(),
  newSha,
)
assert(parsedControllerReceipt.targetSha === newSha, 'controller receipt is bound to the exact candidate SHA')

const deploymentOrder = []
const deployed = await deployLatestRelease({
  argv: ['deploy', '--owner-said-deploy-latest'],
  async resolveCandidate() {
    deploymentOrder.push('resolve')
    return candidate
  },
  async readMainSha() {
    deploymentOrder.push('recheck')
    return newSha
  },
  async invokeController(sha) {
    deploymentOrder.push(`controller:${sha}`)
    return controllerReceipt({ targetSha: sha })
  },
})
assert(deployed.receipt.conclusion === 'success', 'healthy controller receipt completes deployment')
assert(
  deploymentOrder.join(',') === `resolve,recheck,controller:${newSha}`,
  'Owner authorization resolves and rechecks exact main before controller invocation',
)

let staleInvoked = false
assert(
  await (async () => {
    try {
      await deployLatestRelease({
        argv: ['deploy', '--owner-said-deploy-latest'],
        resolveCandidate: async () => candidate,
        readMainSha: async () => '3'.repeat(40),
        invokeController: async () => {
          staleInvoked = true
          return controllerReceipt()
        },
      })
      return false
    } catch {
      return true
    }
  })(),
  'main advancement stops an authorized deployment',
)
assert(!staleInvoked, 'stale main stops before production controller invocation')

assert(
  await (async () => {
    try {
      await deployLatestRelease({
        argv: ['deploy', '--owner-said-deploy-latest'],
        resolveCandidate: async () => candidate,
        readMainSha: async () => newSha,
        invokeController: async () => controllerReceipt({
          conclusion: 'failure',
          failureCode: 'HEALTH_CHECK_FAILED',
        }),
      })
      return false
    } catch (error) {
      return error.message.includes('HEALTH_CHECK_FAILED')
    }
  })(),
  'controller failure remains a deployment failure even after healthy rollback',
)

for (const [label, output] of [
  ['unexpected field', controllerReceipt().replace(/\}\s*$/u, ',"extra":true}')],
  ['another SHA', controllerReceipt({ targetSha: oldSha })],
  ['non-JSON', 'deployment succeeded'],
  ['duplicate marker', `${controllerReceipt()}\n${controllerReceipt()}`],
]) {
  assert(
    (() => {
      try {
        parseDeploymentControllerOutput(output, newSha)
        return false
      } catch {
        return true
      }
    })(),
    `${label} controller response fails closed`,
  )
}
assert(
  parseDeploymentControllerOutput(`diagnostic noise\n${controllerReceipt()}\n`, newSha).targetSha
    === newSha,
  'controller receipt marker survives unrelated journal output',
)

const controllerPreflight = parseDeploymentControllerPreflight(JSON.stringify({
  schemaVersion: 'eqb-deployment-preflight-v2',
  controllerVersion: 'eqb-deploy-controller-v1',
  productionSha: oldSha,
  eqb: 'active',
  caddy: 'active',
  layout: 'release',
}))
assert(controllerPreflight.productionSha === oldSha, 'fixed controller preflight is parsed strictly')
assert(
  parseDeploymentControllerPreflight(formatControllerOutput(controllerPreflight)).productionSha === oldSha,
  'controller entrypoint keeps read-only preflight as strict raw JSON',
)
assert(
  parseDeploymentControllerOutput(
    formatControllerOutput(JSON.parse(controllerReceipt().slice('EQB_DEPLOY_RECEIPT '.length))),
    newSha,
  ).targetSha === newSha,
  'controller entrypoint marks deployment receipts without exposing them to journal noise',
)

const persistencePaths = ['server/api.mjs']
const persistenceDigest = deploymentChangedPathDigest(persistencePaths)
function reviewedPersistenceOutput({ conclusion = 'success', failureCode = null } = {}) {
  return `EQB_REVIEWED_PERSISTENCE_RECEIPT ${JSON.stringify({
    schemaVersion: 'eqb-reviewed-persistence-receipt-v1',
    controllerVersion: 'eqb-deploy-controller-v1',
    state: 'reported',
    conclusion,
    targetSha: newSha,
    previousSha: oldSha,
    staged: true,
    changedPersistencePaths: persistencePaths,
    changedPersistencePathsDigest: persistenceDigest,
    databaseSnapshots: {
      'question-bank.sqlite': 'a'.repeat(64),
      'user-data.sqlite': 'b'.repeat(64),
      'import-ops.sqlite': 'c'.repeat(64),
    },
    trafficReopened: conclusion === 'success',
    rolledBack: conclusion === 'failure',
    databasesRestored: conclusion === 'failure',
    rollbackHealthy: conclusion === 'failure' ? true : null,
    recovered: false,
    failureCode,
    startedAt: '2026-09-03T00:00:00.000Z',
    finishedAt: '2026-09-03T00:01:00.000Z',
    receiptPath: `/opt/eqb/deployments/receipts/reviewed-persistence-${newSha}.json`,
  })}`
}
assert(
  parseReviewedPersistenceControllerOutput(
    reviewedPersistenceOutput(),
    newSha,
    persistenceDigest,
  ).trafficReopened,
  'reviewed-persistence receipt binds the exact path digest and traffic boundary',
)
assert(
  (() => {
    try {
      parseReviewedPersistenceControllerOutput(
        reviewedPersistenceOutput(),
        newSha,
        'd'.repeat(64),
      )
      return false
    } catch {
      return true
    }
  })(),
  'reviewed-persistence receipt for another reviewed diff fails closed',
)
const reviewedOrder = []
const reviewedLatest = await deployReviewedPersistenceLatest({
  argv: ['reviewed-persistence', '--owner-said-reviewed-persistence-deploy'],
  resolveCandidate: async () => {
    reviewedOrder.push('resolve')
    return candidate
  },
  readMainSha: async () => {
    reviewedOrder.push('main')
    return newSha
  },
  readProductionSha: async () => {
    reviewedOrder.push('production')
    return oldSha
  },
  readChangedPaths: async (_previous, _target, paths) => {
    reviewedOrder.push(paths === EQB_PERSISTENCE_AUTHORITY_PATHS ? 'diff' : 'wrong-diff')
    return persistencePaths
  },
  invokeController: async (sha, digest) => {
    reviewedOrder.push(`controller:${sha}:${digest}`)
    return reviewedPersistenceOutput()
  },
})
assert(
  reviewedLatest.changedPathsDigest === persistenceDigest
    && reviewedOrder.join(',')
      === `resolve,main,production,diff,main,controller:${newSha}:${persistenceDigest}`,
  'reviewed-persistence resolves CI main, binds the protected diff, rechecks main, then invokes host',
)

const hostPaths = ['deploy/eqb-deploy-controller.mjs']
const hostDigest = deploymentChangedPathDigest(hostPaths)
function hostConfigurationOutput({ conclusion = 'success', failureCode = null } = {}) {
  return `EQB_HOST_CONFIGURATION_RECEIPT ${JSON.stringify({
    schemaVersion: 'eqb-host-configuration-receipt-v1',
    controllerVersion: 'eqb-deploy-controller-v1',
    state: 'reported',
    conclusion,
    targetSha: newSha,
    previousHostConfigurationSha: oldSha,
    changedHostConfigurationPaths: hostPaths,
    changedHostConfigurationPathsDigest: hostDigest,
    staged: true,
    installed: conclusion === 'success',
    noOp: false,
    rolledBack: conclusion === 'failure',
    rollbackHealthy: conclusion === 'failure' ? true : null,
    recovered: false,
    failureCode,
    startedAt: '2026-09-03T00:00:00.000Z',
    finishedAt: '2026-09-03T00:01:00.000Z',
    receiptPath: `/opt/eqb/deployments/receipts/host-configuration-${newSha}.json`,
  })}`
}
assert(
  parseHostConfigurationControllerOutput(hostConfigurationOutput(), newSha, hostDigest).installed,
  'host-configuration receipt binds one exact version and reviewed path digest',
)
const updatedHost = await updateLatestHostConfiguration({
  argv: ['update-host-config', '--owner-said-update-host-config'],
  resolveCandidate: async () => candidate,
  readMainSha: async () => newSha,
  readProductionSha: async () => oldSha,
  readChangedPaths: async (_previous, _target, paths) => {
    assert(paths === EQB_HOST_CONFIGURATION_PATHS, 'host update compares only its fixed file set')
    return hostPaths
  },
  invokeController: async () => hostConfigurationOutput(),
})
assert(updatedHost.changedPathsDigest === hostDigest, 'host update reaches the controller with exact diff evidence')

section('One-time baseline migration and release-layout bootstrap')

for (const [authorize, argv, label] of [
  [
    requireLegacyBaselineAuthorization,
    ['baseline', '--owner-said-baseline-migration'],
    'baseline migration',
  ],
  [
    requireReleaseLayoutBootstrapAuthorization,
    ['bootstrap', '--owner-said-release-bootstrap'],
    'release-layout bootstrap',
  ],
]) {
  assert((() => {
    authorize(argv)
    return true
  })(), `${label} accepts only its explicit Owner authorization`)
  assert((() => {
    try {
      authorize([...argv, '--sha', newSha])
      return false
    } catch {
      return true
    }
  })(), `${label} rejects an Owner-supplied SHA`)
}
assert((() => {
  requireReleaseLayoutBootstrapAbandonAuthorization([
    'bootstrap-abandon',
    '--owner-said-release-bootstrap-abandon',
  ])
  return true
})(), 'failed bootstrap abandonment accepts only its separate Owner authorization')
assert((() => {
  try {
    requireReleaseLayoutBootstrapAbandonAuthorization([
      'bootstrap-abandon',
      '--owner-said-release-bootstrap-abandon',
      '--sha',
      newSha,
    ])
    return false
  } catch {
    return true
  }
})(), 'bootstrap abandonment target cannot be supplied outside private recovery state')

function legacyBaselineReceipt({
  targetSha = newSha,
  previousSha = oldSha,
  productionSha = targetSha,
  conclusion = 'success',
  failureCode = null,
  rollbackHealthy = null,
  rolledBack = conclusion === 'failure',
  eqb = 'active',
  caddy = 'active',
  identityInstalled = conclusion === 'success',
  quarantinePreserved = conclusion === 'success',
} = {}) {
  return JSON.stringify({
    schemaVersion: 'eqb-legacy-baseline-receipt-v1',
    state: 'reported',
    conclusion,
    targetSha,
    previousSha,
    productionSha,
    eqb,
    caddy,
    layout: 'legacy',
    identityInstalled,
    quarantinePreserved,
    backupsVerified: true,
    migrationVerified: true,
    distVerified: true,
    rolledBack,
    rollbackHealthy,
    failureCode,
    startedAt: '2026-09-02T00:00:00.000Z',
    finishedAt: '2026-09-02T00:10:00.000Z',
    bootstrapRun: false,
  })
}

const parsedBaselineReceipt = parseLegacyBaselineReceipt(legacyBaselineReceipt(), newSha)
assert(
  parsedBaselineReceipt.conclusion === 'success'
    && parsedBaselineReceipt.productionSha === newSha,
  'baseline receipt is strictly bound to the exact healthy target',
)
const parsedFailedBaselineReceipt = parseLegacyBaselineReceipt(legacyBaselineReceipt({
  productionSha: oldSha,
  conclusion: 'failure',
  failureCode: 'start-caddy:strict-health',
  rollbackHealthy: true,
}), newSha)
assert(
  parsedFailedBaselineReceipt.conclusion === 'failure'
    && parsedFailedBaselineReceipt.rolledBack
    && parsedFailedBaselineReceipt.rollbackHealthy,
  'baseline healthy rollback receipt proves the exact restored baseline and services',
)
const parsedPostTrafficFailure = parseLegacyBaselineReceipt(legacyBaselineReceipt({
  productionSha: newSha,
  conclusion: 'failure',
  failureCode: 'start-caddy:strict-health',
  rollbackHealthy: false,
  rolledBack: false,
  caddy: 'inactive',
}), newSha)
assert(
  parsedPostTrafficFailure.conclusion === 'failure'
    && !parsedPostTrafficFailure.rolledBack
    && !parsedPostTrafficFailure.rollbackHealthy
    && parsedPostTrafficFailure.productionSha === newSha,
  'post-traffic failure receipt truthfully preserves the consistent target without claiming rollback',
)
for (const [label, output] of [
  ['unexpected field', legacyBaselineReceipt().replace(/\}\s*$/u, ',"extra":true}')],
  ['another SHA', legacyBaselineReceipt({ targetSha: oldSha })],
  ['non-JSON', 'baseline complete'],
  ['healthy rollback without rollback', legacyBaselineReceipt({
    productionSha: oldSha,
    conclusion: 'failure',
    failureCode: 'start-caddy:strict-health',
    rollbackHealthy: true,
    rolledBack: false,
  })],
  ['healthy rollback on target code', legacyBaselineReceipt({
    productionSha: newSha,
    conclusion: 'failure',
    failureCode: 'start-caddy:strict-health',
    rollbackHealthy: true,
  })],
  ['healthy rollback with Caddy inactive', legacyBaselineReceipt({
    productionSha: oldSha,
    conclusion: 'failure',
    failureCode: 'start-caddy:strict-health',
    rollbackHealthy: true,
    caddy: 'inactive',
  })],
]) {
  assert((() => {
    try {
      parseLegacyBaselineReceipt(output, newSha)
      return false
    } catch {
      return true
    }
  })(), `${label} baseline response fails closed`)
}

function legacyBaselineStateFixture({ withSuccess = true, withFailure = false } = {}) {
  const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'eqb-legacy-baseline-state-'))
  const productionRoot = path.join(fixtureRoot, 'opt', 'eqb')
  const repo = path.join(productionRoot, 'english-question-bank')
  const backupRoot = path.join(fixtureRoot, 'backups')
  const home = path.join(fixtureRoot, 'home', 'eqb')
  const sshDirectory = path.join(home, '.ssh')
  const defaultIdentity = path.join(sshDirectory, 'id_ed25519')
  mkdirSync(repo, { recursive: true })
  mkdirSync(backupRoot, { recursive: true })
  mkdirSync(sshDirectory, { recursive: true })
  chmodSync(backupRoot, 0o700)
  chmodSync(sshDirectory, 0o700)
  writeFileSync(defaultIdentity, 'private fixture identity\n')
  chmodSync(defaultIdentity, 0o600)

  const writeEvidence = (name, receipt, { quarantine = false } = {}) => {
    const evidence = path.join(backupRoot, name)
    mkdirSync(evidence, { mode: 0o700 })
    chmodSync(evidence, 0o700)
    const receiptPath = path.join(evidence, 'receipt.json')
    writeFileSync(receiptPath, `${receipt}\n`)
    chmodSync(receiptPath, 0o600)
    if (!quarantine) return { evidence, receiptPath }
    const quarantineDirectory = path.join(evidence, 'quarantine')
    const wrapper = path.join(quarantineDirectory, 'releases')
    const child = path.join(wrapper, 'legacy-release')
    mkdirSync(child, { recursive: true })
    chmodSync(quarantineDirectory, 0o700)
    chmodSync(wrapper, 0o755)
    const publicFile = path.join(child, 'app', 'dist', 'index.html')
    mkdirSync(path.dirname(publicFile), { recursive: true })
    writeFileSync(publicFile, 'legacy public fixture\n')
    return { evidence, receiptPath, quarantineDirectory, wrapper, child, publicFile }
  }

  const success = withSuccess
    ? writeEvidence('baseline-success', legacyBaselineReceipt(), { quarantine: true })
    : null
  const failure = withFailure
    ? writeEvidence('baseline-failure', legacyBaselineReceipt({
        conclusion: 'failure',
        targetSha: newSha,
        previousSha: oldSha,
        productionSha: oldSha,
        failureCode: 'build-runtime:generated-dist-mode',
        rollbackHealthy: true,
        identityInstalled: false,
        quarantinePreserved: false,
      }))
    : null
  const proof = success ? legacyReleaseChildProof(success.wrapper) : null
  const inspect = ({
    expectedChildDigest = proof?.digest || '0'.repeat(64),
    expectedChildFileCount = proof?.fileCount || 1,
  } = {}) => inspectLegacyBaselineState({
    repo,
    backupRoot,
    home,
    expectedHead: newSha,
    expectedChildDigest,
    expectedChildFileCount,
    rootUid: process.getuid(),
    sourceUid: process.getuid(),
    sourceGid: process.getgid(),
  })
  return {
    fixtureRoot,
    productionRoot,
    repo,
    backupRoot,
    home,
    sshDirectory,
    defaultIdentity,
    success,
    failure,
    proof,
    inspect,
  }
}

{
  const fixture = legacyBaselineStateFixture({ withFailure: true })
  try {
    const state = fixture.inspect()
    assert(
      state.baselineState === 'established'
        && state.baselineReceipts === 1
        && state.baselineFailedReceipts === 1
        && state.quarantineChildren === 1
        && state.liveReleaseLayout === 'absent'
        && state.defaultIdentity === 'ok',
      'executable inspector recognizes one exact consumed baseline and ignores one valid failed attempt',
    )
    const currentUser = execFileSync('/usr/bin/id', ['-un'], { encoding: 'utf8' }).trim()
    const inspected = spawnSync(process.execPath, [
      path.join(ROOT, 'deploy', 'eqb-legacy-baseline-state.mjs'),
      fixture.repo,
      fixture.backupRoot,
      fixture.home,
      newSha,
      fixture.proof.digest,
      String(fixture.proof.fileCount),
      currentUser,
      currentUser,
    ], { encoding: 'utf8' })
    assert(
      inspected.status === 0
        && inspected.stdout.includes('baselineState=established\n')
        && inspected.stdout.includes('controllerSudo=invalid\n')
        && inspected.stdout.trim().split('\n').length === 7,
      'inspector entrypoint emits the complete strict host-evidence shape',
    )
  } finally {
    rmSync(fixture.fixtureRoot, { recursive: true, force: true })
  }
}

{
  const fixture = legacyBaselineStateFixture({ withSuccess: false, withFailure: true })
  try {
    const state = fixture.inspect()
    assert(
      state.baselineState === 'absent'
        && state.baselineReceipts === 0
        && state.baselineFailedReceipts === 1,
      'failed-only evidence remains an unconsumed baseline state',
    )
  } finally {
    rmSync(fixture.fixtureRoot, { recursive: true, force: true })
  }
}

{
  const fixture = legacyBaselineStateFixture({ withSuccess: false })
  try {
    const state = fixture.inspect()
    assert(
      state.baselineState === 'absent'
        && state.baselineReceipts === 0
        && state.baselineFailedReceipts === 0,
      'zero baseline receipts remains an unconsumed baseline state',
    )
  } finally {
    rmSync(fixture.fixtureRoot, { recursive: true, force: true })
  }
}

const invalidLegacyBaselineFixtures = [
  ['two success receipts', (fixture) => {
    cpSync(fixture.success.evidence, path.join(fixture.backupRoot, 'baseline-success-copy'), {
      recursive: true,
    })
  }],
  ['success receipt for another SHA', (fixture) => {
    const receipt = JSON.parse(readFileSync(fixture.success.receiptPath, 'utf8'))
    receipt.targetSha = oldSha
    writeFileSync(fixture.success.receiptPath, `${JSON.stringify(receipt)}\n`)
    chmodSync(fixture.success.receiptPath, 0o600)
  }],
  ['success receipt without a prior SHA', (fixture) => {
    const receipt = JSON.parse(readFileSync(fixture.success.receiptPath, 'utf8'))
    receipt.previousSha = newSha
    writeFileSync(fixture.success.receiptPath, `${JSON.stringify(receipt)}\n`)
    chmodSync(fixture.success.receiptPath, 0o600)
  }],
  ['wrong receipt schema', (fixture) => {
    const receipt = JSON.parse(readFileSync(fixture.success.receiptPath, 'utf8'))
    receipt.schemaVersion = 'eqb-legacy-baseline-receipt-v2'
    writeFileSync(fixture.success.receiptPath, `${JSON.stringify(receipt)}\n`)
    chmodSync(fixture.success.receiptPath, 0o600)
  }],
  ['receipt that claims bootstrap ran', (fixture) => {
    const receipt = JSON.parse(readFileSync(fixture.success.receiptPath, 'utf8'))
    receipt.bootstrapRun = true
    writeFileSync(fixture.success.receiptPath, `${JSON.stringify(receipt)}\n`)
    chmodSync(fixture.success.receiptPath, 0o600)
  }],
  ['world-readable success receipt', (fixture) => {
    chmodSync(fixture.success.receiptPath, 0o644)
  }],
  ['zero quarantine children', (fixture) => {
    rmSync(fixture.success.child, { recursive: true, force: true })
  }],
  ['two quarantine children', (fixture) => {
    mkdirSync(path.join(fixture.success.wrapper, 'second-release'))
  }],
  ['wrong quarantine digest', (_fixture, inspectOptions) => {
    inspectOptions.expectedChildDigest = 'f'.repeat(64)
  }],
  ['special quarantine node', (fixture) => {
    symlinkSync('index.html', path.join(path.dirname(fixture.success.publicFile), 'linked.html'))
  }],
  ['missing default identity', (fixture) => {
    rmSync(fixture.defaultIdentity)
  }],
  ['linked default identity', (fixture) => {
    rmSync(fixture.defaultIdentity)
    const target = path.join(fixture.home, 'identity-target')
    writeFileSync(target, 'identity target\n')
    chmodSync(target, 0o600)
    symlinkSync(target, fixture.defaultIdentity)
  }],
  ['multiply-linked default identity', (fixture) => {
    linkSync(fixture.defaultIdentity, path.join(fixture.home, 'second-identity-link'))
  }],
  ['world-readable default identity', (fixture) => {
    chmodSync(fixture.defaultIdentity, 0o644)
  }],
  ['legacy RSA fallback identity', (fixture) => {
    const rsa = path.join(fixture.sshDirectory, 'id_rsa')
    writeFileSync(rsa, 'legacy RSA fixture\n')
    chmodSync(rsa, 0o600)
  }],
  ['existing live release layout', (fixture) => {
    mkdirSync(path.join(fixture.productionRoot, 'releases'))
  }],
]
for (const [label, mutate] of invalidLegacyBaselineFixtures) {
  const fixture = legacyBaselineStateFixture()
  try {
    const inspectOptions = {}
    mutate(fixture, inspectOptions)
    assert(fixture.inspect(inspectOptions).baselineState === 'invalid', `${label} invalidates S1 evidence`)
  } finally {
    rmSync(fixture.fixtureRoot, { recursive: true, force: true })
  }
}

const legacyPreflight = {
  productionSha: oldSha,
  trackedDirtyPaths: 0,
  eqb: 'active',
  caddy: 'active',
  layout: 'legacy',
  baselineState: 'absent',
  baselineReceipts: 0,
  baselineFailedReceipts: 1,
  quarantineChildren: 0,
  liveReleaseLayout: 'partial',
  defaultIdentity: 'missing',
  controllerSudo: 'ok',
  strictHealth: 'ok',
}
const baselineOrder = []
const migratedBaseline = await migrateLegacyProductionBaseline({
  argv: ['baseline', '--owner-said-baseline-migration'],
  async resolveCandidate() {
    baselineOrder.push('resolve')
    return candidate
  },
  async readMainSha() {
    baselineOrder.push('main')
    return newSha
  },
  async readLegacyPreflight() {
    baselineOrder.push('preflight')
    return legacyPreflight
  },
  async invokeOperator() {
    baselineOrder.push('operator')
    return { exitCode: 0, output: legacyBaselineReceipt() }
  },
})
assert(migratedBaseline.receipt.conclusion === 'success', 'healthy baseline receipt completes migration')
assert(
  baselineOrder.join(',') === 'resolve,main,preflight,main,operator',
  'baseline resolves, rechecks, preflights, rechecks, then invokes the host operator',
)

let ineligibleBaselineInvoked = false
assert(await (async () => {
  try {
    await migrateLegacyProductionBaseline({
      argv: ['baseline', '--owner-said-baseline-migration'],
      resolveCandidate: async () => candidate,
      readMainSha: async () => newSha,
      readLegacyPreflight: async () => ({ ...legacyPreflight, layout: 'release' }),
      invokeOperator: async () => {
        ineligibleBaselineInvoked = true
        return { exitCode: 0, output: legacyBaselineReceipt() }
      },
    })
    return false
  } catch {
    return true
  }
})(), 'ineligible legacy production fails the baseline migration')
assert(!ineligibleBaselineInvoked, 'ineligible baseline stops before the host operator')

let repeatedBaselineInvoked = false
assert(await (async () => {
  try {
    await migrateLegacyProductionBaseline({
      argv: ['baseline', '--owner-said-baseline-migration'],
      resolveCandidate: async () => candidate,
      readMainSha: async () => newSha,
      readLegacyPreflight: async () => ({
        ...legacyPreflight,
        baselineState: 'established',
        baselineReceipts: 1,
        quarantineChildren: 1,
        liveReleaseLayout: 'absent',
        defaultIdentity: 'ok',
      }),
      invokeOperator: async () => {
        repeatedBaselineInvoked = true
        return { exitCode: 0, output: legacyBaselineReceipt() }
      },
    })
    return false
  } catch (error) {
    return error.message === 'BASELINE_ALREADY_ESTABLISHED'
  }
})(), 'an established baseline is a consumed transition, not a continuation deploy path')
assert(!repeatedBaselineInvoked, 'established baseline evidence stops before streaming the root operator')

assert(await (async () => {
  try {
    await migrateLegacyProductionBaseline({
      argv: ['baseline', '--owner-said-baseline-migration'],
      resolveCandidate: async () => candidate,
      readMainSha: async () => newSha,
      readLegacyPreflight: async () => legacyPreflight,
      invokeOperator: async () => ({ exitCode: 1, output: legacyBaselineReceipt() }),
    })
    return false
  } catch {
    return true
  }
})(), 'baseline process exit and structured receipt conclusion must agree')

const migratedPreflight = {
  ...legacyPreflight,
  baselineState: 'established',
  baselineReceipts: 1,
  quarantineChildren: 1,
  liveReleaseLayout: 'absent',
  defaultIdentity: 'ok',
}
const healthyReleasePreflight = {
  schemaVersion: 'eqb-deployment-preflight-v2',
  controllerVersion: 'eqb-deploy-controller-v1',
  productionSha: newSha,
  eqb: 'active',
  caddy: 'active',
  layout: 'release',
}
const keyRetirementReceipt = JSON.stringify({
  schemaVersion: 'eqb-bootstrap-key-retirement-v1',
  state: 'reported',
  conclusion: 'success',
  oldKeyRemoved: true,
  forcedKeyPreserved: true,
  originalDigest: '3'.repeat(64),
  installedDigest: '4'.repeat(64),
})
assert(
  parseBootstrapKeyRetirementReceipt(keyRetirementReceipt).oldKeyRemoved,
  'bootstrap identity retirement receipt is parsed strictly',
)
for (const [label, output] of [
  ['unexpected field', keyRetirementReceipt.replace(/\}\s*$/u, ',"extra":true}')],
  ['unchanged authorized keys', keyRetirementReceipt.replace('4'.repeat(64), '3'.repeat(64))],
  ['non-JSON', 'bootstrap key retired'],
]) {
  assert((() => {
    try {
      parseBootstrapKeyRetirementReceipt(output)
      return false
    } catch {
      return true
    }
  })(), `${label} bootstrap key-retirement response fails closed`)
}
const bootstrapUnit = `eqb-release-bootstrap-${'9'.repeat(32)}`
const cancellationReceipt = {
  schemaVersion: 'eqb-release-bootstrap-cancellation-v1',
  state: 'reported',
  conclusion: 'cancelled',
  targetSha: newSha,
  unit: bootstrapUnit,
  cancellationInstalled: true,
  hostAttemptStarted: false,
}
const cancellationMarker = `EQB_BOOTSTRAP_CANCELLATION ${JSON.stringify(cancellationReceipt)}`
assert(
  parseReleaseBootstrapCancellation(
    `diagnostic\n${cancellationMarker}\n`,
    newSha,
    bootstrapUnit,
  ).cancellationInstalled,
  'bootstrap cancellation marker is strictly bound to the target and host unit',
)
for (const [label, output, sha, unit] of [
  ['missing', '', newSha, bootstrapUnit],
  ['duplicate', `${cancellationMarker}\n${cancellationMarker}`, newSha, bootstrapUnit],
  ['wrong target', cancellationMarker, oldSha, bootstrapUnit],
  ['wrong unit', cancellationMarker, newSha, `eqb-release-bootstrap-${'8'.repeat(32)}`],
  ['unexpected field', cancellationMarker.replace(/\}$/u, ',"extra":true}'), newSha, bootstrapUnit],
]) {
  assert((() => {
    try {
      parseReleaseBootstrapCancellation(output, sha, unit)
      return false
    } catch {
      return true
    }
  })(), `${label} bootstrap cancellation evidence fails closed`)
}
const bootstrapFailureReceipt = JSON.stringify({
  schemaVersion: 'eqb-deployment-bootstrap-failure-v1',
  state: 'reported',
  conclusion: 'failure',
  targetSha: newSha,
  failedStage: 'migrate-persistence',
  exitCode: 1,
  rollbackHealthy: true,
  evidenceRetained: true,
})
const bootstrapFailureMarker = (receipt) => `EQB_BOOTSTRAP_FAILURE ${receipt}`
const parsedBootstrapFailure = parseReleaseBootstrapFailure(
  `remote diagnostic\n${bootstrapFailureMarker(bootstrapFailureReceipt)}\n`,
  newSha,
  1,
)
assert(
  parsedBootstrapFailure.failedStage === 'migrate-persistence'
    && parsedBootstrapFailure.rollbackHealthy
    && parsedBootstrapFailure.evidenceRetained,
  'bootstrap failure marker preserves a strict sanitized stage and recovery verdict',
)
assert(
  parseReleaseBootstrapFailure(
    bootstrapFailureMarker(bootstrapFailureReceipt),
    newSha,
  ).exitCode === 1,
  'manager-owned bootstrap journal can authenticate failure after an SSH disconnect',
)
assert(
  classifyReleaseBootstrapJournal(
    `diagnostic\nEQB deployment bootstrap complete: ${newSha}\n`,
    newSha,
  ).state === 'success',
  'one exact bootstrap completion marker authenticates host success despite journal noise',
)
assert(
  classifyReleaseBootstrapJournal('build still running\n', newSha).state === 'unknown',
  'zero terminal bootstrap markers remain unknown instead of becoming a retryable failure',
)
assert(
  classifyReleaseBootstrapJournal(bootstrapFailureMarker(bootstrapFailureReceipt), newSha)
    .failure.rollbackHealthy,
  'one exact bootstrap failure marker authenticates healthy rollback evidence',
)
for (const journal of [
  `EQB deployment bootstrap complete: ${newSha}\nEQB deployment bootstrap complete: ${newSha}\n`,
  `${bootstrapFailureMarker(bootstrapFailureReceipt)}\nEQB deployment bootstrap complete: ${newSha}\n`,
]) {
  assert((() => {
    try {
      classifyReleaseBootstrapJournal(journal, newSha)
      return false
    } catch {
      return true
    }
  })(), 'ambiguous bootstrap terminal markers fail closed')
}
for (const [label, journal, status, expected] of [
  ['exit zero with one completion', `EQB deployment bootstrap complete: ${newSha}\n`, 0, 'success'],
  ['SSH disconnect with one completion', `EQB deployment bootstrap complete: ${newSha}\n`, 255, 'success'],
  ['exit zero without a terminal marker', '', 0, 'unknown'],
  ['SSH disconnect without a terminal marker', '', 255, 'unknown'],
  ['lock exit without a terminal marker', '', 75, 'lock'],
  ['matching failure exit and marker', bootstrapFailureMarker(bootstrapFailureReceipt), 1, 'failure'],
]) {
  assert(
    classifyReleaseBootstrapOutcome(journal, newSha, status).state === expected,
    `${label} has an explicit bootstrap outcome`,
  )
}
for (const [label, journal, status] of [
  ['completion with mismatched process failure', `EQB deployment bootstrap complete: ${newSha}\n`, 1],
  ['failure marker with mismatched process exit', bootstrapFailureMarker(bootstrapFailureReceipt), 2],
  [
    'duplicate completion markers',
    `EQB deployment bootstrap complete: ${newSha}\nEQB deployment bootstrap complete: ${newSha}\n`,
    0,
  ],
]) {
  assert((() => {
    try {
      classifyReleaseBootstrapOutcome(journal, newSha, status)
      return false
    } catch {
      return true
    }
  })(), `${label} is invalid bootstrap outcome evidence`)
}
const payloadFixtureRoot = mkdtempSync(path.join(tmpdir(), 'eqb-bootstrap-payload-'))
try {
  chmodSync(payloadFixtureRoot, 0o700)
  const payloadSource = '#!/usr/bin/env bash\nprintf \'%s\\n\' "${NOT_EXPANDED}"\n'
  const payloadDigest = createHash('sha256').update(payloadSource).digest('hex')
  const uid = statSync(payloadFixtureRoot).uid
  const gid = statSync(payloadFixtureRoot).gid
  const localStageInput = (source, digest) => bootstrapPayloadStageInput(source, digest)
    .replaceAll('/var/backups/eqb', payloadFixtureRoot)
    .replaceAll("'0:0:700'", `'${uid}:${gid}:700'`)
    .replaceAll("'0:0:600:1'", `'${uid}:${gid}:600:1'`)
    .replace('/usr/bin/chown 0:0', `/usr/bin/chown ${uid}:${gid}`)
  const staged = spawnSync('/bin/bash', ['-s', '--', newSha, payloadDigest], {
    encoding: 'utf8',
    input: localStageInput(payloadSource, payloadDigest),
  })
  const payloadPath = path.join(
    payloadFixtureRoot,
    `bootstrap-payload-${newSha}-${payloadDigest.slice(0, 16)}.sh`,
  )
  const restaged = spawnSync('/bin/bash', ['-s', '--', newSha, payloadDigest], {
    encoding: 'utf8',
    input: localStageInput(payloadSource, payloadDigest),
  })
  assert(
    staged.status === 0
      && staged.stdout.trim() === `EQB bootstrap payload staged: ${newSha}`
      && restaged.status === 0
      && readFileSync(payloadPath, 'utf8') === payloadSource
      && (statSync(payloadPath).mode & 0o7777) === 0o600
      && statSync(payloadPath).nlink === 1,
    'bootstrap payload staging is exact, private, hash-bound, and idempotent',
  )

  const partialSource = '#!/usr/bin/env bash\nprintf partial\\n\n'
  const partialDigest = createHash('sha256').update(partialSource).digest('hex')
  const delimiter = `EQB_BOOTSTRAP_PAYLOAD_${partialDigest.toUpperCase()}`
  const completeInput = localStageInput(partialSource, partialDigest)
  const partialInput = completeInput.slice(0, completeInput.lastIndexOf(delimiter))
  const interrupted = spawnSync('/bin/bash', ['-s', '--', oldSha, partialDigest], {
    encoding: 'utf8',
    input: partialInput,
  })
  assert(
    interrupted.stdout.trim() === ''
      && !readdirSync(payloadFixtureRoot).some((name) => name.includes(oldSha) || name.startsWith('.bootstrap-payload-')),
    'interrupted bootstrap payload transfer cannot install or leave a partial executable',
  )
} finally {
  rmSync(payloadFixtureRoot, { recursive: true, force: true })
}
const earlyBootstrapFailure = parseReleaseBootstrapFailure(
  bootstrapFailureMarker(bootstrapFailureReceipt
    .replace('migrate-persistence', 'preflight')
    .replace('"evidenceRetained":true', '"evidenceRetained":false')),
  newSha,
  1,
)
assert(
  earlyBootstrapFailure.failedStage === 'preflight'
    && earlyBootstrapFailure.rollbackHealthy
    && !earlyBootstrapFailure.evidenceRetained,
  'early bootstrap preflight failure remains classifiable before private evidence is safe to create',
)
for (const [label, output, expectedSha, expectedExitCode] of [
  [
    'unexpected field',
    bootstrapFailureMarker(bootstrapFailureReceipt.replace(/\}\s*$/u, ',"extra":true}')),
    newSha,
    1,
  ],
  ['another SHA', bootstrapFailureMarker(bootstrapFailureReceipt), oldSha, 1],
  ['another exit code', bootstrapFailureMarker(bootstrapFailureReceipt), newSha, 2],
  ['non-JSON', bootstrapFailureMarker('bootstrap failed during migration'), newSha, 1],
]) {
  assert((() => {
    try {
      parseReleaseBootstrapFailure(output, expectedSha, expectedExitCode)
      return false
    } catch {
      return true
    }
  })(), `${label} bootstrap failure marker fails closed`)
}
const bootstrapOrder = []
let bootstrapIdentityClassification = 0
const bootstrapped = await bootstrapReleaseLayout({
  argv: ['bootstrap', '--owner-said-release-bootstrap'],
  async resolveCandidate() {
    bootstrapOrder.push('resolve')
    return candidate
  },
  async readMainSha() {
    bootstrapOrder.push('main')
    return newSha
  },
  async readLegacyPreflight() {
    bootstrapOrder.push('preflight')
    return migratedPreflight
  },
  async isAncestor(previousSha, targetSha) {
    bootstrapOrder.push('ancestor')
    return previousSha === oldSha && targetSha === newSha
  },
  async readProtectedDiff(previousSha, targetSha, paths) {
    bootstrapOrder.push('protected-diff')
    assert(
      previousSha === oldSha
        && targetSha === newSha
        && paths === EQB_PERSISTENCE_AUTHORITY_PATHS,
      'bootstrap compares the established baseline with exact candidate over the fixed authority set',
    )
    return []
  },
  async invokeBootstrap() {
    bootstrapOrder.push('bootstrap')
  },
  async readControllerPreflight() {
    bootstrapOrder.push('controller')
    return healthyReleasePreflight
  },
  async retireBootstrapIdentity() {
    bootstrapOrder.push('retire')
    return parseBootstrapKeyRetirementReceipt(keyRetirementReceipt)
  },
  async classifyBootstrapIdentity() {
    bootstrapOrder.push('classify-old')
    bootstrapIdentityClassification += 1
    return bootstrapIdentityClassification === 1 ? 'active' : 'retired'
  },
  async rotateControllerSecret() {
    bootstrapOrder.push('secret')
  },
  async cleanupRecovery() {
    bootstrapOrder.push('cleanup')
  },
})
assert(bootstrapped.controllerPreflight.layout === 'release', 'new forced controller proves release layout')
assert(
  bootstrapOrder.join(',')
    === 'resolve,main,preflight,ancestor,protected-diff,main,bootstrap,controller,classify-old,secret,retire,controller,classify-old,cleanup',
  'bootstrap proves S1 ancestry and authority, proves the new route, rotates Secret, then retires the old key',
)

let ineligibleBootstrapInvoked = false
assert(await (async () => {
  try {
    await bootstrapReleaseLayout({
      argv: ['bootstrap', '--owner-said-release-bootstrap'],
      resolveCandidate: async () => candidate,
      readMainSha: async () => newSha,
      readLegacyPreflight: async () => legacyPreflight,
      isAncestor: async () => true,
      readProtectedDiff: async () => [],
      invokeBootstrap: async () => {
        ineligibleBootstrapInvoked = true
      },
      readControllerPreflight: async () => healthyReleasePreflight,
      retireBootstrapIdentity: async () => parseBootstrapKeyRetirementReceipt(keyRetirementReceipt),
      classifyBootstrapIdentity: async () => 'active',
      rotateControllerSecret: async () => {},
      cleanupRecovery: async () => {},
    })
    return false
  } catch {
    return true
  }
})(), 'bootstrap rejects production that has not completed the exact baseline migration')
assert(!ineligibleBootstrapInvoked, 'ineligible bootstrap stops before production mutation')

let unverifiedSecretRotated = false
assert(await (async () => {
  try {
    await bootstrapReleaseLayout({
      argv: ['bootstrap', '--owner-said-release-bootstrap'],
      resolveCandidate: async () => candidate,
      readMainSha: async () => newSha,
      readLegacyPreflight: async () => migratedPreflight,
      isAncestor: async () => true,
      readProtectedDiff: async () => [],
      invokeBootstrap: async () => {},
      readControllerPreflight: async () => ({ ...healthyReleasePreflight, caddy: 'inactive' }),
      retireBootstrapIdentity: async () => parseBootstrapKeyRetirementReceipt(keyRetirementReceipt),
      classifyBootstrapIdentity: async () => 'active',
      rotateControllerSecret: async () => {
        unverifiedSecretRotated = true
      },
      cleanupRecovery: async () => {},
    })
    return false
  } catch {
    return true
  }
})(), 'unhealthy new controller preflight fails the bootstrap')
assert(!unverifiedSecretRotated, 'controller key is not rotated before forced-route health proof')

let unretiredSecretRotated = false
assert(await (async () => {
  try {
    await bootstrapReleaseLayout({
      argv: ['bootstrap', '--owner-said-release-bootstrap'],
      resolveCandidate: async () => candidate,
      readMainSha: async () => newSha,
      readLegacyPreflight: async () => migratedPreflight,
      isAncestor: async () => true,
      readProtectedDiff: async () => [],
      invokeBootstrap: async () => {},
      readControllerPreflight: async () => healthyReleasePreflight,
      retireBootstrapIdentity: async () => parseBootstrapKeyRetirementReceipt(keyRetirementReceipt),
      classifyBootstrapIdentity: async () => 'active',
      rotateControllerSecret: async () => {
        unretiredSecretRotated = true
      },
      cleanupRecovery: async () => {},
    })
    return false
  } catch {
    return true
  }
})(), 'still-usable privileged bootstrap identity fails the bootstrap')
assert(unretiredSecretRotated, 'verified controller Secret remains usable before old-key retirement proof')

for (const [label, isAncestor, protectedDiff, expectedError] of [
  ['non-ancestor baseline', false, [], 'BASELINE_ANCESTRY_UNKNOWN'],
  ['unreadable ancestry', new Error('missing object'), [], 'BASELINE_ANCESTRY_UNKNOWN'],
  [
    'changed persistence authority',
    true,
    ['server/source-intake/sourceIntakeStore.mjs'],
    'PERSISTENCE_AUTHORITY_CHANGED',
  ],
]) {
  let mutated = false
  assert(await (async () => {
    try {
      await bootstrapReleaseLayout({
        argv: ['bootstrap', '--owner-said-release-bootstrap'],
        resolveCandidate: async () => candidate,
        readMainSha: async () => newSha,
        readLegacyPreflight: async () => migratedPreflight,
        isAncestor: async () => {
          if (isAncestor instanceof Error) throw isAncestor
          return isAncestor
        },
        readProtectedDiff: async () => protectedDiff,
        invokeBootstrap: async () => { mutated = true },
        readControllerPreflight: async () => healthyReleasePreflight,
        retireBootstrapIdentity: async () => {},
        classifyBootstrapIdentity: async () => 'retired',
        rotateControllerSecret: async () => {},
        cleanupRecovery: async () => {},
      })
      return false
    } catch (error) {
      return error.message === expectedError
    }
  })(), `${label} fails with its stable S1 transition error`)
  assert(!mutated, `${label} stops before host bootstrap mutation`)
}

let sameShaBootstrapInvoked = false
await bootstrapReleaseLayout({
  argv: ['bootstrap', '--owner-said-release-bootstrap'],
  resolveCandidate: async () => ({ ...candidate, sha: oldSha }),
  readMainSha: async () => oldSha,
  readLegacyPreflight: async () => migratedPreflight,
  isAncestor: async (previousSha, targetSha) => previousSha === targetSha,
  readProtectedDiff: async () => [],
  invokeBootstrap: async () => { sameShaBootstrapInvoked = true },
  readControllerPreflight: async () => ({ ...healthyReleasePreflight, productionSha: oldSha }),
  retireBootstrapIdentity: async () => parseBootstrapKeyRetirementReceipt(keyRetirementReceipt),
  classifyBootstrapIdentity: async () => 'retired',
  rotateControllerSecret: async () => {},
  cleanupRecovery: async () => {},
})
assert(sameShaBootstrapInvoked, 'an established baseline may still bootstrap its exact current SHA')

const resumeOrder = []
const resumeStates = ['active', 'retired']
let repeatedHostBootstrap = false
const resumedBeforeRetirement = await resumeReleaseLayoutBootstrap({
  argv: ['bootstrap-resume', '--owner-said-release-bootstrap-resume'],
  candidate,
  async readControllerPreflight() {
    resumeOrder.push('controller')
    return healthyReleasePreflight
  },
  async classifyBootstrapIdentity() {
    resumeOrder.push('classify-old')
    return resumeStates.shift()
  },
  async retireBootstrapIdentity() {
    resumeOrder.push('retire')
    return parseBootstrapKeyRetirementReceipt(keyRetirementReceipt)
  },
  async rotateControllerSecret() {
    resumeOrder.push('secret')
  },
  async cleanupRecovery() {
    resumeOrder.push('cleanup')
  },
  async invokeBootstrap() {
    repeatedHostBootstrap = true
  },
})
assert(
  resumedBeforeRetirement.resumed
    && resumedBeforeRetirement.initialIdentityState === 'active'
    && resumedBeforeRetirement.keyRetirement?.oldKeyRemoved,
  'recovery after host success completes the pending old-key retirement',
)
assert(
  resumeOrder.join(',') === 'controller,classify-old,secret,retire,controller,classify-old,cleanup',
  'resume proves host state, rotates Secret, retires and rejects the old key, then cleans recovery',
)
assert(!repeatedHostBootstrap, 'bootstrap resume cannot invoke the host bootstrap transaction again')

const postRetirementOrder = []
const resumedAfterRetirement = await resumeReleaseLayoutBootstrap({
  argv: ['bootstrap-resume', '--owner-said-release-bootstrap-resume'],
  candidate,
  async readControllerPreflight() {
    postRetirementOrder.push('controller')
    return healthyReleasePreflight
  },
  async classifyBootstrapIdentity() {
    postRetirementOrder.push('classify-old')
    return 'retired'
  },
  async retireBootstrapIdentity() {
    postRetirementOrder.push('retire')
  },
  async rotateControllerSecret() {
    postRetirementOrder.push('secret')
  },
  async cleanupRecovery() {
    postRetirementOrder.push('cleanup')
  },
})
assert(
  resumedAfterRetirement.initialIdentityState === 'retired'
    && resumedAfterRetirement.keyRetirement === null
    && !postRetirementOrder.includes('retire'),
  'resume after retirement does not repeat key mutation',
)
assert(
  postRetirementOrder.join(',') === 'controller,classify-old,secret,controller,classify-old,cleanup',
  'resume after retirement rotates idempotently between the two route proofs before cleanup',
)

const unknownResumeActions = []
assert(await (async () => {
  try {
    await resumeReleaseLayoutBootstrap({
      argv: ['bootstrap-resume', '--owner-said-release-bootstrap-resume'],
      candidate,
      readControllerPreflight: async () => healthyReleasePreflight,
      classifyBootstrapIdentity: async () => 'unknown',
      retireBootstrapIdentity: async () => unknownResumeActions.push('retire'),
      rotateControllerSecret: async () => unknownResumeActions.push('secret'),
      cleanupRecovery: async () => unknownResumeActions.push('cleanup'),
    })
    return false
  } catch {
    return true
  }
})(), 'unknown old-key transport state fails bootstrap recovery closed')
assert(unknownResumeActions.length === 0, 'unknown old-key state cannot mutate keys, Secret, or recovery')

section('Private credentials and pinned SSH invocation')

const credentialRoot = mkdtempSync(path.join(tmpdir(), 'eqb-deploy-credentials-'))
const generatedKey = path.join(credentialRoot, 'generated')
execFileSync('ssh-keygen', [
  '-q', '-t', 'ed25519', '-N', '', '-C', 'eqb-bootstrap-comment-fixture', '-f', generatedKey,
])
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

const generatedControllerKey = path.join(credentialRoot, 'generated-controller')
execFileSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', generatedControllerKey])
const publicKeyBody = (privateKeyPath) => parseOpenSshEd25519PublicKeyBody(execFileSync(
  'ssh-keygen',
  ['-y', '-f', privateKeyPath],
  { encoding: 'utf8' },
))
const commentedPublicKey = execFileSync(
  'ssh-keygen',
  ['-y', '-f', materialized.keyPath],
  { encoding: 'utf8' },
)
assert(
  commentedPublicKey.trim().split(/\s+/u).length === 3
    && publicKeyBody(materialized.keyPath) === commentedPublicKey.trim().split(/\s+/u)[1],
  'Deployment Ed25519 private keys remain valid when ssh-keygen emits a public-key comment',
)
for (const invalidPublicKey of [
  'ssh-rsa AAAAFixtureOnly comment',
  'ssh-ed25519 AAAAFixtureOnly\nssh-ed25519 AAAASecondFixture',
]) {
  assert((() => {
    try {
      parseOpenSshEd25519PublicKeyBody(invalidPublicKey)
      return false
    } catch {
      return true
    }
  })(), 'Deployment public-key parsing rejects wrong-key-type and multiline output')
}
for (const [label, probe, expected] of [
  [
    'the only advertised method',
    {
      status: 255,
      stdout: '',
      stderr: 'deployer@production.invalid: Permission denied (publickey).\n',
    },
    true,
  ],
  [
    'one of several advertised methods',
    {
      status: 255,
      stdout: '',
      stderr: 'deployer@production.invalid: Permission denied (publickey,password).\n',
    },
    true,
  ],
  [
    'not advertised',
    {
      status: 255,
      stdout: '',
      stderr: 'deployer@production.invalid: Permission denied (password).\n',
    },
    false,
  ],
  [
    'accompanied by command output',
    {
      status: 255,
      stdout: 'remote command output\n',
      stderr: 'deployer@production.invalid: Permission denied (publickey,password).\n',
    },
    false,
  ],
  [
    'accompanied by another diagnostic line',
    {
      status: 255,
      stdout: '',
      stderr: 'diagnostic\ndeployer@production.invalid: Permission denied (publickey,password).\n',
    },
    false,
  ],
  [
    'reported with a non-transport exit',
    {
      status: 1,
      stdout: '',
      stderr: 'deployer@production.invalid: Permission denied (publickey,password).\n',
    },
    false,
  ],
]) {
  assert(
    isSshPublicKeyAuthenticationDenied(probe) === expected,
    `public-key authentication denial is classified when publickey is ${label}`,
  )
}
const recoveryRoot = path.join(credentialRoot, 'recovery-state')
const recovery = createReleaseBootstrapRecovery({
  stateRoot: recoveryRoot,
  candidateSha: newSha,
  projectId: '00000000-0000-0000-0000-000000000001',
  transportTarget: 'deployer@production.invalid',
  unit: `eqb-release-bootstrap-${'a'.repeat(32)}`,
  controllerPrivateKey: readFileSync(generatedControllerKey, 'utf8'),
  controllerPublicKeyBody: publicKeyBody(generatedControllerKey),
  bootstrapPrivateKey: readFileSync(generatedKey, 'utf8'),
  bootstrapPublicKeyBody: publicKeyBody(generatedKey),
  now: () => new Date('2026-09-03T00:00:00.000Z'),
})
assert(
  path.basename(recovery.directory) === `bootstrap-${newSha}`
    && (statSync(recoveryRoot).mode & 0o777) === 0o700
    && (statSync(recovery.directory).mode & 0o777) === 0o700,
  'bootstrap recovery uses one deterministic private target directory',
)
assert(
  [recovery.recoveryPath, recovery.controllerPrivateKeyPath, recovery.bootstrapPrivateKeyPath]
    .every((filePath) => (statSync(filePath).mode & 0o777) === 0o600),
  'bootstrap recovery record and both identities are private files',
)
assert(
  !readdirSync(recoveryRoot).some((name) => name.startsWith('.bootstrap-')),
  'bootstrap recovery is atomically published without a visible partial record',
)
const reloadedRecovery = readReleaseBootstrapRecovery({ stateRoot: recoveryRoot })
assert(
  reloadedRecovery.targetSha === newSha
    && reloadedRecovery.unit === `eqb-release-bootstrap-${'a'.repeat(32)}`
    && reloadedRecovery.controllerPrivateKey === readFileSync(generatedControllerKey, 'utf8')
    && reloadedRecovery.bootstrapPrivateKey === readFileSync(generatedKey, 'utf8'),
  'a fresh executor can recover the exact target, unit, controller key, and old bootstrap key',
)
assert((() => {
  try {
    createReleaseBootstrapRecovery({
      stateRoot: recoveryRoot,
      candidateSha: newSha,
      projectId: '00000000-0000-0000-0000-000000000001',
      transportTarget: 'deployer@production.invalid',
      unit: `eqb-release-bootstrap-${'b'.repeat(32)}`,
      controllerPrivateKey: readFileSync(generatedControllerKey, 'utf8'),
      controllerPublicKeyBody: publicKeyBody(generatedControllerKey),
      bootstrapPrivateKey: readFileSync(generatedKey, 'utf8'),
      bootstrapPublicKeyBody: publicKeyBody(generatedKey),
    })
    return false
  } catch {
    return true
  }
})(), 'fresh bootstrap cannot overwrite a pending recovery record')
const completedRecovery = completeReleaseBootstrapRecovery(reloadedRecovery, {
  now: () => new Date('2026-09-03T00:01:00.000Z'),
})
assert(
  !existsSync(recovery.directory)
    && path.basename(completedRecovery.directory) === `completed-bootstrap-${newSha}`
    && !existsSync(path.join(completedRecovery.directory, 'controller-identity'))
    && !existsSync(path.join(completedRecovery.directory, 'bootstrap-identity')),
  'post-rotation cleanup atomically terminalizes recovery before removing both private identities',
)
const reloadedCompletion = readCompletedReleaseBootstrapRecovery({ stateRoot: recoveryRoot })
assert(
  reloadedCompletion.controllerSecretRotated
    && reloadedCompletion.completedAt === '2026-09-03T00:01:00.000Z'
    && (statSync(reloadedCompletion.completionPath).mode & 0o777) === 0o600,
  'a fresh executor can prove completed Secret rotation from the retained terminal receipt',
)
clearCompletedReleaseBootstrapRecovery({ stateRoot: recoveryRoot, targetSha: newSha })
assert(
  existsSync(completedRecovery.directory)
    && !existsSync(path.join(completedRecovery.directory, 'controller-identity'))
    && !existsSync(path.join(completedRecovery.directory, 'bootstrap-identity')),
  'terminal recovery cleanup is idempotent and retains only non-secret evidence',
)

const interruptedRecoveryRoot = path.join(credentialRoot, 'interrupted-recovery-state')
const interruptedRecovery = createReleaseBootstrapRecovery({
  stateRoot: interruptedRecoveryRoot,
  candidateSha: newSha,
  projectId: '00000000-0000-0000-0000-000000000001',
  transportTarget: 'deployer@production.invalid',
  unit: `eqb-release-bootstrap-${'d'.repeat(32)}`,
  controllerPrivateKey: readFileSync(generatedControllerKey, 'utf8'),
  controllerPublicKeyBody: publicKeyBody(generatedControllerKey),
  bootstrapPrivateKey: readFileSync(generatedKey, 'utf8'),
  bootstrapPublicKeyBody: publicKeyBody(generatedKey),
})
let identityRemoval = 0
assert((() => {
  try {
    completeReleaseBootstrapRecovery(interruptedRecovery, {
      removeIdentity(filePath) {
        identityRemoval += 1
        if (identityRemoval === 2) throw new Error('simulated cleanup interruption')
        rmSync(filePath)
      },
    })
    return false
  } catch {
    return true
  }
})(), 'interrupted post-rotation identity cleanup remains a reported failure')
const interruptedCompletion = readCompletedReleaseBootstrapRecovery({
  stateRoot: interruptedRecoveryRoot,
})
assert(
  interruptedCompletion.controllerSecretRotated
    && !existsSync(path.join(interruptedCompletion.directory, 'controller-identity'))
    && existsSync(path.join(interruptedCompletion.directory, 'bootstrap-identity')),
  'an interrupted cleanup retains atomic terminal evidence and the unremoved private identity',
)
clearCompletedReleaseBootstrapRecovery({ stateRoot: interruptedRecoveryRoot })
assert(
  !existsSync(path.join(interruptedCompletion.directory, 'bootstrap-identity')),
  'a fresh executor idempotently finishes an interrupted identity cleanup',
)

function createAbandonmentRecovery(stateRoot, suffix) {
  return createReleaseBootstrapRecovery({
    stateRoot,
    candidateSha: newSha,
    projectId: '00000000-0000-0000-0000-000000000001',
    transportTarget: 'deployer@production.invalid',
    unit: `eqb-release-bootstrap-${suffix.repeat(32)}`,
    controllerPrivateKey: readFileSync(generatedControllerKey, 'utf8'),
    controllerPublicKeyBody: publicKeyBody(generatedControllerKey),
    bootstrapPrivateKey: readFileSync(generatedKey, 'utf8'),
    bootstrapPublicKeyBody: publicKeyBody(generatedKey),
  })
}
const healthyBootstrapFailure = {
  schemaVersion: 'eqb-deployment-bootstrap-failure-v1',
  state: 'reported',
  conclusion: 'failure',
  targetSha: newSha,
  failedStage: 'install-controller',
  exitCode: 1,
  rollbackHealthy: true,
  evidenceRetained: true,
}
const cancellationFor = (recoveryRecord, hostAttemptStarted = true) => ({
  schemaVersion: 'eqb-release-bootstrap-cancellation-v1',
  state: 'reported',
  conclusion: 'cancelled',
  targetSha: recoveryRecord.targetSha,
  unit: recoveryRecord.unit,
  cancellationInstalled: true,
  hostAttemptStarted,
})

const abandonedRecoveryRoot = path.join(credentialRoot, 'abandoned-recovery-state')
const abandonmentRecovery = createAbandonmentRecovery(abandonedRecoveryRoot, 'd')
const abandoned = abandonReleaseBootstrapRecovery(abandonmentRecovery, {
  failure: healthyBootstrapFailure,
  cancellation: cancellationFor(abandonmentRecovery),
  previousSha: oldSha,
  controllerIdentityRejected: true,
  legacyHealthy: true,
  now: () => new Date('2026-09-03T00:02:00.000Z'),
})
assert(
  !existsSync(abandonmentRecovery.directory)
    && path.basename(abandoned.directory) === `abandoned-bootstrap-${newSha}`
    && abandoned.previousSha === oldSha
    && abandoned.rollbackHealthy
    && !abandoned.preMutationFailure
    && abandoned.controllerIdentityRejected
    && abandoned.legacyHealthy
    && (statSync(abandoned.abandonmentPath).mode & 0o777) === 0o600
    && !existsSync(path.join(abandoned.directory, 'controller-identity'))
    && !existsSync(path.join(abandoned.directory, 'bootstrap-identity')),
  'proven healthy rollback is terminalized privately before both recovery identities are removed',
)

const preMutationAbandonmentRoot = path.join(credentialRoot, 'pre-mutation-abandonment-state')
const preMutationAbandonmentRecovery = createAbandonmentRecovery(preMutationAbandonmentRoot, 'a')
const preMutationAbandonment = abandonReleaseBootstrapRecovery(preMutationAbandonmentRecovery, {
  failure: {
    ...healthyBootstrapFailure,
    failedStage: 'verify-established-baseline',
    rollbackHealthy: false,
  },
  cancellation: cancellationFor(preMutationAbandonmentRecovery),
  previousSha: oldSha,
  controllerIdentityRejected: true,
  legacyHealthy: true,
})
assert(
  preMutationAbandonment.preMutationFailure
    && !preMutationAbandonment.rollbackHealthy
    && preMutationAbandonment.legacyHealthy
    && !existsSync(path.join(preMutationAbandonment.directory, 'controller-identity'))
    && !existsSync(path.join(preMutationAbandonment.directory, 'bootstrap-identity')),
  'a retained terminal failure from the known pre-mutation stages can return to independently proven healthy S1',
)

const cancelledUnknownRoot = path.join(credentialRoot, 'cancelled-unknown-state')
const cancelledUnknownRecovery = createAbandonmentRecovery(cancelledUnknownRoot, 'b')
const cancelledUnknown = abandonReleaseBootstrapRecovery(cancelledUnknownRecovery, {
  cancellation: cancellationFor(cancelledUnknownRecovery, false),
  previousSha: oldSha,
  controllerIdentityRejected: true,
  legacyHealthy: true,
})
assert(
  cancelledUnknown.evidenceKind === 'host-cancellation'
    && cancelledUnknown.failedStage === 'dispatch-unknown'
    && cancelledUnknown.hostExitCode === null
    && cancelledUnknown.cancellationInstalled
    && cancelledUnknown.preMutationFailure
    && !cancelledUnknown.rollbackHealthy
    && !existsSync(path.join(cancelledUnknown.directory, 'controller-identity'))
    && !existsSync(path.join(cancelledUnknown.directory, 'bootstrap-identity')),
  'a lock-serialized host cancellation plus strict S1 proof safely terminalizes unknown dispatch',
)

const interruptedAbandonmentRoot = path.join(credentialRoot, 'interrupted-abandonment-state')
const interruptedAbandonmentRecovery = createAbandonmentRecovery(interruptedAbandonmentRoot, 'e')
let abandonmentRemovals = 0
assert((() => {
  try {
    abandonReleaseBootstrapRecovery(interruptedAbandonmentRecovery, {
      failure: healthyBootstrapFailure,
      cancellation: cancellationFor(interruptedAbandonmentRecovery),
      previousSha: oldSha,
      controllerIdentityRejected: true,
      legacyHealthy: true,
      removeIdentity(filePath) {
        abandonmentRemovals += 1
        if (abandonmentRemovals === 2) throw new Error('simulated interruption')
        rmSync(filePath)
      },
    })
    return false
  } catch {
    return true
  }
})(), 'interrupted abandonment identity cleanup remains a reported failure')
const interruptedAbandonment = readAbandonedReleaseBootstrapRecovery({
  stateRoot: interruptedAbandonmentRoot,
  targetSha: newSha,
})
assert(
  !existsSync(path.join(interruptedAbandonment.directory, 'controller-identity'))
    && existsSync(path.join(interruptedAbandonment.directory, 'bootstrap-identity')),
  'interrupted abandonment retains terminal evidence and the unremoved identity',
)
clearAbandonedReleaseBootstrapRecovery({
  stateRoot: interruptedAbandonmentRoot,
  targetSha: newSha,
})
assert(
  !existsSync(path.join(interruptedAbandonment.directory, 'bootstrap-identity')),
  'a fresh executor idempotently completes abandoned recovery identity cleanup',
)

const refusedAbandonmentRoot = path.join(credentialRoot, 'refused-abandonment-state')
const refusedAbandonment = createAbandonmentRecovery(refusedAbandonmentRoot, 'f')
assert((() => {
  try {
    abandonReleaseBootstrapRecovery(refusedAbandonment, {
      failure: healthyBootstrapFailure,
      previousSha: oldSha,
      controllerIdentityRejected: true,
      legacyHealthy: true,
    })
    return false
  } catch {
    return true
  }
})(), 'abandonment without exact host cancellation evidence fails closed')
assert((() => {
  try {
    abandonReleaseBootstrapRecovery(refusedAbandonment, {
      cancellation: cancellationFor(refusedAbandonment, true),
      previousSha: oldSha,
      controllerIdentityRejected: true,
      legacyHealthy: true,
    })
    return false
  } catch {
    return true
  }
})(), 'unknown dispatch with durable host acceptance cannot be abandoned')
assert((() => {
  try {
    abandonReleaseBootstrapRecovery(refusedAbandonment, {
      failure: {
        ...healthyBootstrapFailure,
        failedStage: 'install-controller',
        rollbackHealthy: false,
      },
      cancellation: cancellationFor(refusedAbandonment),
      previousSha: oldSha,
      controllerIdentityRejected: true,
      legacyHealthy: true,
    })
    return false
  } catch {
    return true
  }
})(), 'post-mutation abandonment without healthy rollback proof fails closed')
assert(
  existsSync(refusedAbandonment.directory)
    && existsSync(refusedAbandonment.controllerPrivateKeyPath)
    && existsSync(refusedAbandonment.bootstrapPrivateKeyPath)
    && !existsSync(path.join(refusedAbandonment.directory, 'abandonment.json')),
  'invalid abandonment proof cannot mutate active recovery evidence or identities',
)
assert((() => {
  try {
    abandonReleaseBootstrapRecovery(refusedAbandonment, {
      failure: healthyBootstrapFailure,
      cancellation: cancellationFor(refusedAbandonment),
      previousSha: oldSha,
    })
    return false
  } catch {
    return true
  }
})(), 'abandonment cannot manufacture controller-rejection or healthy-legacy proof')

const discardRecovery = createReleaseBootstrapRecovery({
  stateRoot: recoveryRoot,
  candidateSha: oldSha,
  projectId: '00000000-0000-0000-0000-000000000001',
  transportTarget: 'deployer@production.invalid',
  unit: `eqb-release-bootstrap-${'c'.repeat(32)}`,
  controllerPrivateKey: readFileSync(generatedControllerKey, 'utf8'),
  controllerPublicKeyBody: publicKeyBody(generatedControllerKey),
  bootstrapPrivateKey: readFileSync(generatedKey, 'utf8'),
  bootstrapPublicKeyBody: publicKeyBody(generatedKey),
})
removeReleaseBootstrapRecovery(discardRecovery)
assert(!existsSync(discardRecovery.directory), 'pre-host recovery discard removes only its active target record')

const ssh = deploymentSSHInvocation({
  host: 'deployer@production.invalid',
  keyPath: materialized.keyPath,
  knownHostsPath: materialized.knownHostsPath,
})
assert(ssh.command === 'ssh', 'deployment uses the system SSH client')
assert(ssh.args.includes('StrictHostKeyChecking=yes'), 'SSH host-key checking is strict')
assert(
  ssh.args.includes('ServerAliveInterval=15') && ssh.args.includes('ServerAliveCountMax=4'),
  'SSH transport detects a lost peer instead of hanging indefinitely',
)
assert(
  ssh.args.includes(`UserKnownHostsFile=${materialized.knownHostsPath}`),
  'SSH trusts only the private pinned known_hosts file',
)
assert(ssh.args.includes('GlobalKnownHostsFile=/dev/null'), 'global host keys cannot widen trust')
assert(ssh.args.includes('BatchMode=yes'), 'SSH cannot fall back to an interactive password')
assert(ssh.args.includes('PreferredAuthentications=publickey'), 'SSH attempts only the pinned public-key identity')
assert(!ssh.args.some((arg) => arg.includes('StrictHostKeyChecking=no')), 'insecure host-key bypass is absent')
assert((() => {
  try {
    deploymentSSHInvocation({
      host: 'deployer@production.invalid',
      keyPath: materialized.keyPath,
      knownHostsPath: materialized.knownHostsPath,
      remoteArgs: ['deploy', `${newSha};id`],
    })
    return false
  } catch {
    return true
  }
})(), 'SSH remote argv rejects shell metacharacters before OpenSSH concatenates it')
assert(
  deploymentSSHTransportUser('deployer@production.invalid') === 'deployer',
  'deployment SSH transport account is explicit and machine-resolved',
)
for (const target of ['production.invalid', 'root@production.invalid', 'BadUser@production.invalid']) {
  assert((() => {
    try {
      deploymentSSHTransportUser(target)
      return false
    } catch {
      return true
    }
  })(), `unsafe deployment SSH transport target ${JSON.stringify(target)} fails closed`)
}

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
  'baselineState=established',
  'baselineReceipts=1',
  'baselineFailedReceipts=2',
  'quarantineChildren=1',
  'liveReleaseLayout=absent',
  'defaultIdentity=ok',
  'controllerSudo=ok',
  'strictHealth=ok',
].join('\n'))
assert(preflight.productionSha === oldSha, 'preflight returns one exact production SHA')
assert(preflight.trackedDirtyPaths === 0, 'preflight dirty count is parsed as a number')
assert(preflight.eqb === 'active' && preflight.caddy === 'active', 'preflight reports both service states')
assert(preflight.layout === 'legacy', 'preflight distinguishes legacy and release layouts')
assert(
  preflight.baselineState === 'established'
    && preflight.baselineReceipts === 1
    && preflight.baselineFailedReceipts === 2
    && preflight.quarantineChildren === 1
    && preflight.liveReleaseLayout === 'absent'
    && preflight.defaultIdentity === 'ok'
    && preflight.controllerSudo === 'ok'
    && preflight.strictHealth === 'ok',
  'preflight carries strict established-baseline and transport evidence',
)
const validPreflightOutput = [
  `productionSha=${oldSha}`,
  'trackedDirtyPaths=0',
  'eqb=active',
  'caddy=active',
  'layout=legacy',
  'baselineState=established',
  'baselineReceipts=1',
  'baselineFailedReceipts=0',
  'quarantineChildren=1',
  'liveReleaseLayout=absent',
  'defaultIdentity=ok',
  'controllerSudo=ok',
  'strictHealth=ok',
]
assert(
  (() => {
    try {
      parseDeploymentPreflightOutput(`${validPreflightOutput.join('\n')}\nunexpected=value`)
      return false
    } catch {
      return true
    }
  })(),
  'unexpected remote preflight output fails closed',
)
for (const [label, lines] of [
  ['missing evidence', validPreflightOutput.filter((line) => !line.startsWith('controllerSudo='))],
  ['duplicate evidence', [...validPreflightOutput, 'controllerSudo=ok']],
  [
    'invalid evidence enum',
    validPreflightOutput.map((line) => line === 'defaultIdentity=ok' ? 'defaultIdentity=unknown' : line),
  ],
  [
    'invalid evidence count',
    validPreflightOutput.map((line) => line === 'baselineReceipts=1' ? 'baselineReceipts=-1' : line),
  ],
  [
    'unsafe evidence count',
    validPreflightOutput.map((line) => (
      line === 'baselineReceipts=1' ? `baselineReceipts=${'9'.repeat(100)}` : line
    )),
  ],
]) {
  assert((() => {
    try {
      parseDeploymentPreflightOutput(lines.join('\n'))
      return false
    } catch {
      return true
    }
  })(), `${label} in remote preflight fails closed`)
}
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

section('Fixed host controller stages without production-data access')

function writeReleaseMarker(root, sha, controllerVersion = EQB_DEPLOY_CONTROLLER_VERSION) {
  const release = path.join(root, 'releases', sha)
  mkdirSync(path.join(release, 'app', 'dist'), { recursive: true })
  writeFileSync(path.join(release, 'app', 'dist', 'index.html'), '<!doctype html>')
  writeFileSync(path.join(release, '.eqb-release.json'), `${JSON.stringify({
    schemaVersion: 'eqb-release-v1',
    sha,
    controllerVersion,
  })}\n`)
}

function controllerFixture({
  failCandidateHealth = false,
  failPostTrafficHealth = false,
  failLiveDatabaseOnce = false,
  failSnapshotOnce = false,
  failHostConfigurationReloadOnce = false,
  failHostConfigurationReload = false,
  mutateDatabasesOnEnsure = false,
  advanceAfterBuild = false,
  hostConfigurationChange = false,
  persistenceAuthorityChange = false,
  stableLauncherChange = false,
  protectedDiffFailure = false,
  unsafeCandidateDirectory = null,
  tamperDeploymentControl = false,
  wrongDistModes = false,
  linkedDist = false,
} = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'eqb-controller-fixture-'))
  const source = path.join(root, 'english-question-bank')
  mkdirSync(source)
  for (const relative of [
    'releases',
    'deployments',
    'shared/data',
    'shared/paper-assets',
    'shared/exports',
    'shared/server-logs',
  ]) {
    mkdirSync(path.join(root, relative), { recursive: true })
  }
  chmodSync(path.join(root, 'shared'), 0o700)
  writeFileSync(path.join(root, 'shared', '.env'), 'FIXTURE_ONLY=1\n', { mode: 0o600 })
  writeFileSync(path.join(root, 'shared', 'sentinel'), 'unchanged')
  for (const name of ['question-bank.sqlite', 'user-data.sqlite', 'import-ops.sqlite']) {
    writeFileSync(path.join(root, 'shared', 'data', name), `${name}:before\n`, { mode: 0o600 })
  }
  const systemdUnitPath = path.join(root, 'installed-eqb.service')
  const caddyConfigPath = path.join(root, 'installed-Caddyfile')
  const rootWrapperPath = path.join(root, 'installed-controller')
  const transportWrapperPath = path.join(root, 'installed-transport')
  writeFileSync(systemdUnitPath, 'old service\n')
  writeFileSync(caddyConfigPath, 'old caddy\n')
  writeFileSync(rootWrapperPath, 'stable controller\n')
  writeFileSync(transportWrapperPath, 'stable transport\n')
  writeReleaseMarker(root, oldSha, 'eqb-deploy-controller-older-compatible')
  symlinkSync(path.join('releases', oldSha), path.join(root, 'current'))

  const state = {
    mainSha: newSha,
    buildCalls: [],
    sourceCalls: [],
    systemCalls: [],
    restarts: [],
    advanced: false,
    hostConfigurationChange,
    persistenceAuthorityChange,
    stableLauncherChange,
    protectedDiffFailure,
    unsafeCandidateDirectory,
    tamperDeploymentControl,
    failLiveDatabaseOnce,
    failSnapshotOnce,
    failHostConfigurationReloadOnce,
    failHostConfigurationReload,
    mutateDatabasesOnEnsure,
    trafficOpened: true,
  }
  const config = {
    root,
    source,
    controllerUid: statSync(root).uid,
    minimumFreeBytes: 0,
    sourceUser: 'fixture-source',
    runtimeUser: 'fixture-runtime',
    buildUser: 'fixture-build',
    buildGroup: 'fixture-build',
    repositoryUrls: ['fixture://Buqisir/english-question-bank'],
    service: 'eqb',
    caddyService: 'caddy',
    systemdUnitPath,
    caddyConfigPath,
    rootWrapperPath,
    transportWrapperPath,
  }
  const currentSha = () => path.basename(readlinkSync(path.join(root, 'current')))
  const dependencies = {
    runSource(command, args) {
      state.sourceCalls.push([command, ...args])
      const joined = args.join(' ')
      if (joined.endsWith('remote get-url origin')) {
        return 'fixture://Buqisir/english-question-bank\n'
      }
      if (joined.includes(' fetch ')) return ''
      if (joined.endsWith('rev-parse FETCH_HEAD')) return `${state.mainSha}\n`
      if (joined.endsWith('rev-parse HEAD')) return `${oldSha}\n`
      throw new Error(`Unexpected source command: ${command} ${joined}`)
    },
    runBuild(command, args, { release }) {
      state.buildCalls.push([command, ...args])
      if (args.at(-1) === 'build') {
        mkdirSync(path.join(release, 'app', 'dist'), { recursive: true })
        writeFileSync(path.join(release, 'app', 'dist', 'index.html'), '<!doctype html>')
        if (wrongDistModes) {
          chmodSync(path.join(release, 'app', 'dist'), 0o700)
          chmodSync(path.join(release, 'app', 'dist', 'index.html'), 0o600)
        }
        if (linkedDist) {
          linkSync(
            path.join(release, 'app', 'dist', 'index.html'),
            path.join(release, 'app', 'dist', 'linked.html'),
          )
        }
        if (state.tamperDeploymentControl) {
          writeFileSync(path.join(release, 'deploy', 'eqb-deploy-controller.mjs'), 'candidate-controlled')
        }
        if (state.unsafeCandidateDirectory) {
          const candidatePath = path.join(release, state.unsafeCandidateDirectory)
          const outside = path.join(root, `outside-${state.unsafeCandidateDirectory.replaceAll('/', '-')}`)
          rmSync(candidatePath, { recursive: true, force: true })
          mkdirSync(outside, { recursive: true })
          symlinkSync(outside, candidatePath)
        }
        symlinkSync(
          path.join(root, 'shared', 'sentinel'),
          path.join(release, '.eqb-release.json'),
        )
        if (advanceAfterBuild && !state.advanced) {
          state.mainSha = '3'.repeat(40)
          state.advanced = true
        }
      }
      return ''
    },
    runSystem(command, args, options = {}) {
      state.systemCalls.push([command, ...args])
      if (command === '/usr/bin/git' && args.includes('diff')) {
        if (state.protectedDiffFailure) throw new Error('fixture missing commit')
        const pathspecs = args.slice(args.indexOf('--') + 1)
        if (pathspecs.includes('deploy/eqb-deploy-transport')) {
          return state.stableLauncherChange ? 'deploy/eqb-deploy-transport\n' : ''
        }
        if (pathspecs.includes('deploy/eqb-release.service')) {
          return state.hostConfigurationChange ? 'deploy/eqb-release.service\n' : ''
        }
        return state.persistenceAuthorityChange ? 'server/api.mjs\n' : ''
      }
      if (command === '/usr/bin/git' && args.includes('archive')) {
        writeFileSync(options.stdio[1], 'fixture archive')
        return ''
      }
      if (command === '/usr/bin/tar') {
        const release = args[args.indexOf('-C') + 1]
        const hostConfigurationArchive = String(args[1]).includes('/.host-config-archive-')
        if (args.at(-1) !== 'deploy' && !hostConfigurationArchive) {
          for (const relative of [
            'app/public/paper-assets',
            'server/logs',
            'scripts',
            'data',
            'exports',
          ]) {
            mkdirSync(path.join(release, relative), { recursive: true })
          }
        }
        mkdirSync(path.join(release, 'deploy'), { recursive: true })
        const deployFiles = [
          'Caddyfile.release',
          'eqb-release.service',
          'eqb-deploy-transport',
          'eqb-deploy-controller',
          'eqb-deploy-controller.mjs',
        ]
        for (const relative of hostConfigurationArchive
          ? deployFiles.filter((name) => !['eqb-deploy-transport', 'eqb-deploy-controller'].includes(name))
          : deployFiles) {
          const content = hostConfigurationArchive && relative === 'eqb-deploy-controller.mjs'
            ? 'export const fixtureController = true\n'
            : `trusted archive ${relative}\n`
          writeFileSync(path.join(release, 'deploy', relative), content)
        }
        return ''
      }
      if (command === '/usr/bin/systemctl' && ['start', 'restart'].includes(args[0])) {
        state.restarts.push(currentSha())
        if (args[1] === 'caddy') state.trafficOpened = true
        return ''
      }
      if (command === '/usr/bin/systemctl' && args[0] === 'stop') {
        if (args[1] === 'caddy') state.trafficOpened = false
        return ''
      }
      if (command === '/usr/bin/systemctl' && args[0] === 'daemon-reload') return ''
      if (command === '/usr/bin/systemctl' && args[0] === 'is-active') {
        return args.includes('--quiet') ? '' : 'active\n'
      }
      if (command === '/usr/bin/node' && args[0] === '--check') return ''
      if (command === '/usr/bin/systemd-analyze') return ''
      if (command === '/usr/bin/caddy' && args[0] === 'validate') return ''
      if (command === '/usr/bin/caddy' && args[0] === 'reload') {
        if (state.failHostConfigurationReload || state.failHostConfigurationReloadOnce) {
          state.failHostConfigurationReloadOnce = false
          throw new Error('fixture Caddy reload failure')
        }
        return ''
      }
      if (command === '/usr/bin/curl') {
        if (failCandidateHealth && currentSha() === newSha) {
          throw new Error('fixture candidate unhealthy')
        }
        if (failPostTrafficHealth && state.trafficOpened && currentSha() === newSha) {
          throw new Error('fixture post-traffic health failure')
        }
        return ''
      }
      throw new Error(`Unexpected system command: ${command} ${args.join(' ')}`)
    },
    async sleep() {},
    uid() {
      return statSync(path.join(root, 'shared')).uid
    },
    chown() {},
    runRuntime() {
      state.runtimeEnsures = (state.runtimeEnsures || 0) + 1
      if (state.mutateDatabasesOnEnsure && state.runtimeEnsures === 1) {
        for (const name of ['question-bank.sqlite', 'user-data.sqlite', 'import-ops.sqlite']) {
          writeFileSync(path.join(root, 'shared', 'data', name), `${name}:migrated\n`)
        }
      }
    },
    snapshotDatabase(source, destination) {
      if (state.failSnapshotOnce) {
        state.failSnapshotOnce = false
        throw new Error('fixture snapshot failure')
      }
      copyFileSync(source, destination)
    },
    verifyDatabase(filePath) {
      if (
        state.failLiveDatabaseOnce
        && filePath.includes('/shared/data/')
        && currentSha() === newSha
      ) {
        state.failLiveDatabaseOnce = false
        throw new Error('fixture live database integrity failure')
      }
      return true
    },
    seal(directory) {
      chmodSync(directory, 0o755)
    },
  }
  const fixture = { root, config, dependencies, state, currentSha }
  installFixtureHostConfiguration(fixture, oldSha)
  return fixture
}

function installFixtureHostConfiguration(fixture, sha, { candidate = false } = {}) {
  const version = path.join(
    fixture.root,
    'deployments',
    'host-configuration',
    'versions',
    sha,
  )
  mkdirSync(path.join(version, 'deploy'), { recursive: true })
  const content = {
    'deploy/Caddyfile.release': candidate ? 'new caddy\n' : 'old caddy\n',
    'deploy/eqb-release.service': candidate ? 'new service\n' : 'old service\n',
    'deploy/eqb-deploy-controller.mjs': candidate
      ? 'export const fixtureController = true\n'
      : 'export const oldFixtureController = true\n',
  }
  for (const [relative, bytes] of Object.entries(content)) {
    writeFileSync(path.join(version, relative), bytes)
  }
  const stableLaunchers = {
    'deploy/eqb-deploy-controller': createHash('sha256')
      .update(readFileSync(fixture.config.rootWrapperPath)).digest('hex'),
    'deploy/eqb-deploy-transport': createHash('sha256')
      .update(readFileSync(fixture.config.transportWrapperPath)).digest('hex'),
  }
  writeFileSync(path.join(version, '.eqb-host-configuration.json'), `${JSON.stringify({
    schemaVersion: 'eqb-host-configuration-v1',
    sha,
    files: Object.fromEntries(Object.entries(content).map(([relative, bytes]) => [
      relative,
      createHash('sha256').update(bytes).digest('hex'),
    ])),
    stableLaunchers,
    preparedAt: '2026-09-03T00:00:00.000Z',
  })}\n`)
  const current = path.join(fixture.root, 'deployments', 'host-configuration', 'current')
  rmSync(current, { force: true })
  symlinkSync(path.join('versions', sha), current)
  return version
}

assert(
  parseControllerCommand(`deploy ${newSha}`).sha === newSha,
  'fixed controller accepts only one exact machine-resolved SHA',
)
const maintenanceDigest = '4'.repeat(64)
for (const command of ['deploy-reviewed-persistence', 'update-host-config']) {
  const parsed = parseControllerCommand(`${command} ${newSha} ${maintenanceDigest}`)
  assert(
    parsed.command === command && parsed.sha === newSha && parsed.digest === maintenanceDigest,
    `fixed controller accepts exact ${command} SHA and reviewed-path digest`,
  )
}
for (const command of [
  '',
  'deploy',
  `deploy ${newSha} --force`,
  `deploy ${newSha}; id`,
  `deploy-reviewed-persistence ${newSha}`,
  `deploy-reviewed-persistence ${newSha} ${maintenanceDigest} extra`,
  `deploy-reviewed-persistence ${newSha} ${maintenanceDigest};id`,
  `update-host-config ${newSha} short`,
  'bash -s',
]) {
  assert(
    (() => {
      try {
        parseControllerCommand(command)
        return false
      } catch {
        return true
      }
    })(),
    `fixed controller rejects command injection shape ${JSON.stringify(command)}`,
  )
}

const fixedSuccess = controllerFixture({ wrongDistModes: true })
const fixedSuccessResult = await runController({
  originalCommand: `deploy ${newSha}`,
  config: fixedSuccess.config,
  dependencies: fixedSuccess.dependencies,
})
assert(fixedSuccessResult.exitCode === 0, 'fixed controller reports healthy activation success')
assert(fixedSuccess.currentSha() === newSha, 'fixed controller atomically activates the prepared SHA')
assert(
  (statSync(path.join(fixedSuccess.root, 'releases', newSha, 'app', 'dist')).mode & 0o7777) === 0o755
    && (statSync(path.join(
      fixedSuccess.root,
      'releases',
      newSha,
      'app',
      'dist',
      'index.html',
    )).mode & 0o7777) === 0o644,
  'ordinary controller normalizes generated dist to exact Caddy-readable modes',
)
assert(fixedSuccess.state.buildCalls.length === 5, 'candidate install, Chromium smoke, and build run in the isolated build boundary')
assert(
  fixedSuccess.state.systemCalls.some((call) => call[0] === '/usr/bin/git' && call.includes('archive'))
    && fixedSuccess.state.sourceCalls.every((call) => !call.includes('archive')),
  'only the root controller archives fetched source into its private descriptor',
)
assert(fixedSuccess.state.restarts.join(',') === newSha, 'healthy activation restarts only the candidate')
for (const [relative, target] of [
  ['data', path.join(fixedSuccess.root, 'shared', 'data')],
  ['app/public/paper-assets', path.join(fixedSuccess.root, 'shared', 'paper-assets')],
  ['exports', path.join(fixedSuccess.root, 'shared', 'exports')],
  ['server/logs', path.join(fixedSuccess.root, 'shared', 'server-logs')],
  ['.env', path.join(fixedSuccess.root, 'shared', '.env')],
]) {
  assert(
    readlinkSync(path.join(fixedSuccess.root, 'releases', newSha, relative)) === target,
    `${relative} is attached only after the candidate build`,
  )
}
assert(
  readFileSync(path.join(fixedSuccess.root, 'shared', 'sentinel'), 'utf8') === 'unchanged',
  'candidate marker replacement and activation do not mutate shared production data',
)
assert(
  (statSync(fixedSuccessResult.output.receiptPath).mode & 0o777) === 0o600,
  'fixed controller writes a private terminal receipt',
)
const fixedBuildLogs = readdirSync(path.join(fixedSuccess.root, 'deployments', 'logs'))
assert(
  fixedBuildLogs.length === 1
    && (statSync(path.join(fixedSuccess.root, 'deployments', 'logs', fixedBuildLogs[0])).mode & 0o777) === 0o600,
  'candidate output stays in a private host log rather than depending on the Orb connection',
)
const fixedIdempotent = await runController({
  originalCommand: `deploy ${newSha}`,
  config: fixedSuccess.config,
  dependencies: fixedSuccess.dependencies,
})
assert(fixedIdempotent.output.noOp && fixedIdempotent.exitCode === 0, 'same healthy release is idempotent')
assert(fixedSuccess.state.buildCalls.length === 5, 'idempotent deployment does not rebuild an existing sealed release')
assert(fixedSuccess.state.restarts.length === 1, 'idempotent deployment does not restart production')
rmSync(fixedSuccess.root, { recursive: true, force: true })

const linkedDist = controllerFixture({ linkedDist: true })
const linkedDistResult = await runController({
  originalCommand: `deploy ${newSha}`,
  config: linkedDist.config,
  dependencies: linkedDist.dependencies,
})
assert(
  linkedDistResult.exitCode === 1
    && linkedDist.currentSha() === oldSha
    && linkedDist.state.restarts.length === 0,
  'ordinary controller rejects linked generated files before activation',
)
rmSync(linkedDist.root, { recursive: true, force: true })

const tamperedControl = controllerFixture({ tamperDeploymentControl: true })
const tamperedControlResult = await runController({
  originalCommand: `deploy ${newSha}`,
  config: tamperedControl.config,
  dependencies: tamperedControl.dependencies,
})
assert(tamperedControlResult.exitCode === 0, 'candidate deployment-control tampering cannot block trusted restoration')
assert(
  readFileSync(
    path.join(tamperedControl.root, 'releases', newSha, 'deploy', 'eqb-deploy-controller.mjs'),
    'utf8',
  ) === 'trusted archive eqb-deploy-controller.mjs\n',
  'deployment control files are restored from the root-private exact-target archive after build',
)
rmSync(tamperedControl.root, { recursive: true, force: true })

for (const unsafeCandidateDirectory of ['app', 'app/public', 'server']) {
  const unsafeCandidate = controllerFixture({ unsafeCandidateDirectory })
  const unsafeCandidateResult = await runController({
    originalCommand: `deploy ${newSha}`,
    config: unsafeCandidate.config,
    dependencies: unsafeCandidate.dependencies,
  })
  assert(
    unsafeCandidateResult.exitCode === 1
      && unsafeCandidateResult.output.failureCode === 'PREPARATION_FAILED',
    `candidate symlinked ${unsafeCandidateDirectory} ancestor fails closed`,
  )
  assert(
    unsafeCandidate.state.restarts.length === 0,
    `candidate symlinked ${unsafeCandidateDirectory} ancestor stops before restart`,
  )
  rmSync(unsafeCandidate.root, { recursive: true, force: true })
}

const fixedRollback = controllerFixture({ failCandidateHealth: true })
const fixedRollbackResult = await runController({
  originalCommand: `deploy ${newSha}`,
  config: fixedRollback.config,
  dependencies: fixedRollback.dependencies,
})
assert(fixedRollbackResult.exitCode === 1, 'failed candidate remains a terminal deployment failure')
assert(fixedRollback.currentSha() === oldSha, 'fixed controller restores the previous release after failed health')
assert(
  fixedRollback.state.restarts.join(',') === `${newSha},${oldSha}`,
  'failed health restarts candidate once and restored release once',
)
assert(
  fixedRollbackResult.output.rolledBack && fixedRollbackResult.output.rollbackHealthy,
  'failed deployment receipt proves healthy rollback',
)
rmSync(fixedRollback.root, { recursive: true, force: true })

const fixedMainChanged = controllerFixture({ advanceAfterBuild: true })
const fixedMainChangedResult = await runController({
  originalCommand: `deploy ${newSha}`,
  config: fixedMainChanged.config,
  dependencies: fixedMainChanged.dependencies,
})
assert(fixedMainChangedResult.exitCode === 1, 'main advancement fails the deployment')
assert(fixedMainChangedResult.output.failureCode === 'MAIN_CHANGED', 'main advancement has a distinct failure code')
assert(fixedMainChanged.currentSha() === oldSha, 'main advancement stops before activation')
assert(fixedMainChanged.state.restarts.length === 0, 'main advancement never restarts production')
rmSync(fixedMainChanged.root, { recursive: true, force: true })

const insufficientSpace = controllerFixture()
insufficientSpace.config.minimumFreeBytes = Number.MAX_SAFE_INTEGER
const insufficientSpaceResult = await runController({
  originalCommand: `deploy ${newSha}`,
  config: insufficientSpace.config,
  dependencies: insufficientSpace.dependencies,
})
assert(insufficientSpaceResult.exitCode === 1, 'insufficient staging space fails the deployment')
assert(insufficientSpace.state.buildCalls.length === 0, 'insufficient staging space fails before candidate build')
assert(insufficientSpace.state.restarts.length === 0, 'insufficient staging space never restarts production')
rmSync(insufficientSpace.root, { recursive: true, force: true })

for (const [fixtureOptions, expectedCode, label] of [
  [
    { hostConfigurationChange: true },
    'HOST_CONFIGURATION_UPDATE_REQUIRED',
    'fixed host configuration change',
  ],
  [
    { persistenceAuthorityChange: true },
    'SEPARATE_MUTATION_AUTHORIZATION_REQUIRED',
    'production persistence-authority change',
  ],
  [
    { protectedDiffFailure: true },
    'PREPARATION_FAILED',
    'unavailable protected-path comparison',
  ],
]) {
  const protectedChange = controllerFixture(fixtureOptions)
  const protectedChangeResult = await runController({
    originalCommand: `deploy ${newSha}`,
    config: protectedChange.config,
    dependencies: protectedChange.dependencies,
  })
  assert(
    protectedChangeResult.exitCode === 1
      && protectedChangeResult.output.failureCode === expectedCode,
    `${label} fails closed with a distinct terminal result`,
  )
  assert(protectedChange.state.buildCalls.length === 0, `${label} stops before candidate build`)
  assert(protectedChange.state.restarts.length === 0, `${label} stops before production restart`)
  rmSync(protectedChange.root, { recursive: true, force: true })
}

const reviewedDigest = deploymentChangedPathDigest(['server/api.mjs'])
const reviewedSuccess = controllerFixture({ persistenceAuthorityChange: true })
const reviewedSuccessResult = await runController({
  originalCommand: `deploy-reviewed-persistence ${newSha} ${reviewedDigest}`,
  config: reviewedSuccess.config,
  dependencies: reviewedSuccess.dependencies,
})
assert(
  reviewedSuccessResult.exitCode === 0
    && reviewedSuccessResult.output.schemaVersion === 'eqb-reviewed-persistence-receipt-v1'
    && reviewedSuccessResult.output.trafficReopened
    && !reviewedSuccessResult.output.rolledBack,
  'reviewed-persistence deploy snapshots, migrates offline, and reopens traffic only on success',
)
assert(
  reviewedSuccess.state.runtimeEnsures === 2
    && reviewedSuccess.currentSha() === newSha
    && Object.keys(reviewedSuccessResult.output.databaseSnapshots).length === 3,
  'reviewed-persistence deploy runs import-ops owners twice and verifies all three snapshots',
)
rmSync(reviewedSuccess.root, { recursive: true, force: true })

const wrongReviewedDigest = controllerFixture({ persistenceAuthorityChange: true })
const wrongReviewedDigestResult = await runController({
  originalCommand: `deploy-reviewed-persistence ${newSha} ${'f'.repeat(64)}`,
  config: wrongReviewedDigest.config,
  dependencies: wrongReviewedDigest.dependencies,
})
assert(
  wrongReviewedDigestResult.exitCode === 1
    && wrongReviewedDigestResult.output.failureCode === 'REVIEWED_PERSISTENCE_DIFF_MISMATCH'
    && wrongReviewedDigest.state.buildCalls.length === 0,
  'reviewed-persistence host independently rejects a different path digest before build',
)
rmSync(wrongReviewedDigest.root, { recursive: true, force: true })

const snapshotFailure = controllerFixture({
  persistenceAuthorityChange: true,
  failSnapshotOnce: true,
})
const snapshotFailureResult = await runController({
  originalCommand: `deploy-reviewed-persistence ${newSha} ${reviewedDigest}`,
  config: snapshotFailure.config,
  dependencies: snapshotFailure.dependencies,
})
assert(
  snapshotFailureResult.exitCode === 1
    && !snapshotFailureResult.output.trafficReopened
    && snapshotFailure.currentSha() === oldSha
    && snapshotFailure.state.runtimeEnsures === undefined,
  'snapshot failure restores service on the previous release before candidate persistence runs',
)
rmSync(snapshotFailure.root, { recursive: true, force: true })

const preTrafficFailure = controllerFixture({
  persistenceAuthorityChange: true,
  failLiveDatabaseOnce: true,
  mutateDatabasesOnEnsure: true,
})
const preTrafficFailureResult = await runController({
  originalCommand: `deploy-reviewed-persistence ${newSha} ${reviewedDigest}`,
  config: preTrafficFailure.config,
  dependencies: preTrafficFailure.dependencies,
})
assert(
  preTrafficFailureResult.exitCode === 1
    && preTrafficFailureResult.output.databasesRestored
    && preTrafficFailureResult.output.rolledBack
    && preTrafficFailureResult.output.rollbackHealthy
    && !preTrafficFailureResult.output.trafficReopened
    && preTrafficFailure.currentSha() === oldSha,
  'pre-traffic migration verification failure restores all snapshots and previous release',
)
assert(
  readFileSync(path.join(preTrafficFailure.root, 'shared/data/question-bank.sqlite'), 'utf8')
    === 'question-bank.sqlite:before\n',
  'pre-traffic rollback restores original database bytes',
)
rmSync(preTrafficFailure.root, { recursive: true, force: true })

const postTrafficFailure = controllerFixture({
  persistenceAuthorityChange: true,
  failPostTrafficHealth: true,
  mutateDatabasesOnEnsure: true,
})
const postTrafficFailureResult = await runController({
  originalCommand: `deploy-reviewed-persistence ${newSha} ${reviewedDigest}`,
  config: postTrafficFailure.config,
  dependencies: postTrafficFailure.dependencies,
})
assert(
  postTrafficFailureResult.exitCode === 1
    && postTrafficFailureResult.output.trafficReopened
    && !postTrafficFailureResult.output.databasesRestored
    && !postTrafficFailureResult.output.rolledBack
    && postTrafficFailure.currentSha() === newSha,
  'post-traffic failure never replays snapshots or runs previous code against migrated data',
)
assert(
  readFileSync(path.join(postTrafficFailure.root, 'shared/data/question-bank.sqlite'), 'utf8')
    === 'question-bank.sqlite:migrated\n',
  'post-traffic failure preserves migrated live database bytes',
)
assert(
  existsSync(path.join(
    postTrafficFailure.root,
    'deployments/reviewed-persistence/active.json',
  )),
  'post-traffic failure retains recovery state instead of authorizing snapshot replay',
)
rmSync(postTrafficFailure.root, { recursive: true, force: true })

function writeInterruptedReviewedState(fixture, { trafficReopened }) {
  writeReleaseMarker(fixture.root, newSha)
  rmSync(path.join(fixture.root, 'current'))
  symlinkSync(path.join('releases', newSha), path.join(fixture.root, 'current'))
  const stateRoot = path.join(fixture.root, 'deployments', 'reviewed-persistence')
  const snapshotRoot = path.join(stateRoot, 'interrupted-snapshots')
  mkdirSync(snapshotRoot, { recursive: true })
  const snapshots = {}
  for (const name of ['question-bank.sqlite', 'user-data.sqlite', 'import-ops.sqlite']) {
    const live = path.join(fixture.root, 'shared', 'data', name)
    const snapshot = path.join(snapshotRoot, name)
    copyFileSync(live, snapshot)
    const metadata = statSync(live)
    snapshots[name] = {
      digest: createHash('sha256').update(readFileSync(snapshot)).digest('hex'),
      gid: metadata.gid,
      mode: metadata.mode & 0o7777,
      path: snapshot,
      size: metadata.size,
      uid: metadata.uid,
    }
    writeFileSync(live, `${name}:interrupted-migration\n`)
  }
  writeFileSync(path.join(stateRoot, 'active.json'), `${JSON.stringify({
    schemaVersion: 'eqb-reviewed-persistence-state-v1',
    targetSha: newSha,
    previousSha: oldSha,
    changedPaths: ['server/api.mjs'],
    changedPathsDigest: reviewedDigest,
    staged: true,
    snapshots,
    trafficReopened,
    startedAt: '2026-09-03T00:00:00.000Z',
  })}\n`, { mode: 0o600 })
}

const interruptedBeforeTraffic = controllerFixture({ persistenceAuthorityChange: true })
writeInterruptedReviewedState(interruptedBeforeTraffic, { trafficReopened: false })
const recoveredBeforeTraffic = await runController({
  originalCommand: `deploy-reviewed-persistence ${newSha} ${reviewedDigest}`,
  config: interruptedBeforeTraffic.config,
  dependencies: interruptedBeforeTraffic.dependencies,
})
assert(
  recoveredBeforeTraffic.exitCode === 1
    && recoveredBeforeTraffic.output.recovered
    && recoveredBeforeTraffic.output.databasesRestored
    && recoveredBeforeTraffic.output.rollbackHealthy
    && interruptedBeforeTraffic.currentSha() === oldSha,
  'interrupted pre-traffic transaction resumes only to safe snapshot rollback',
)
rmSync(interruptedBeforeTraffic.root, { recursive: true, force: true })

const interruptedAfterTraffic = controllerFixture({ persistenceAuthorityChange: true })
writeInterruptedReviewedState(interruptedAfterTraffic, { trafficReopened: true })
const recoveredAfterTraffic = await runController({
  originalCommand: `deploy-reviewed-persistence ${newSha} ${reviewedDigest}`,
  config: interruptedAfterTraffic.config,
  dependencies: interruptedAfterTraffic.dependencies,
})
assert(
  recoveredAfterTraffic.exitCode === 0
    && recoveredAfterTraffic.output.recovered
    && !recoveredAfterTraffic.output.databasesRestored
    && readFileSync(
      path.join(interruptedAfterTraffic.root, 'shared/data/question-bank.sqlite'),
      'utf8',
    ) === 'question-bank.sqlite:interrupted-migration\n',
  'interrupted post-traffic transaction terminalizes healthy target without snapshot replay',
)
rmSync(interruptedAfterTraffic.root, { recursive: true, force: true })

const hostUpdateSuccess = controllerFixture({ hostConfigurationChange: true })
installFixtureHostConfiguration(hostUpdateSuccess, oldSha)
const hostUpdateDigest = deploymentChangedPathDigest(['deploy/eqb-release.service'])
const hostUpdateSuccessResult = await runController({
  originalCommand: `update-host-config ${newSha} ${hostUpdateDigest}`,
  config: hostUpdateSuccess.config,
  dependencies: hostUpdateSuccess.dependencies,
})
assert(
  hostUpdateSuccessResult.exitCode === 0
    && hostUpdateSuccessResult.output.schemaVersion === 'eqb-host-configuration-receipt-v1'
    && hostUpdateSuccessResult.output.installed
    && !hostUpdateSuccessResult.output.rolledBack
    && !existsSync(path.join(
      hostUpdateSuccess.root,
      'deployments/host-configuration-update/recovery-controller.mjs',
    )),
  `versioned host configuration validates, installs atomically, reloads, and reports success: ${JSON.stringify({ result: hostUpdateSuccessResult, state: hostUpdateSuccess.state })}`,
)
assert(
  readlinkSync(path.join(hostUpdateSuccess.root, 'deployments/host-configuration/current'))
    === path.join('versions', newSha),
  'host configuration current pointer advances to one exact SHA',
)
const hostUpdateNoOp = await runController({
  originalCommand: `update-host-config ${newSha} ${hostUpdateDigest}`,
  config: hostUpdateSuccess.config,
  dependencies: hostUpdateSuccess.dependencies,
})
assert(hostUpdateNoOp.exitCode === 0 && hostUpdateNoOp.output.noOp, 'installed host configuration is idempotent')
rmSync(hostUpdateSuccess.root, { recursive: true, force: true })

const hostUpdateRollback = controllerFixture({
  hostConfigurationChange: true,
  failHostConfigurationReloadOnce: true,
})
installFixtureHostConfiguration(hostUpdateRollback, oldSha)
const hostUpdateRollbackResult = await runController({
  originalCommand: `update-host-config ${newSha} ${hostUpdateDigest}`,
  config: hostUpdateRollback.config,
  dependencies: hostUpdateRollback.dependencies,
})
assert(
  hostUpdateRollbackResult.exitCode === 1
    && hostUpdateRollbackResult.output.rolledBack
    && hostUpdateRollbackResult.output.rollbackHealthy
    && readlinkSync(path.join(hostUpdateRollback.root, 'deployments/host-configuration/current'))
      === path.join('versions', oldSha)
    && readFileSync(hostUpdateRollback.config.systemdUnitPath, 'utf8') === 'old service\n',
  'failed host configuration reload restores files and the previous version pointer',
)
const hostUpdateAfterHealthyRollback = await runController({
  originalCommand: `update-host-config ${newSha} ${hostUpdateDigest}`,
  config: hostUpdateRollback.config,
  dependencies: hostUpdateRollback.dependencies,
})
assert(
  hostUpdateAfterHealthyRollback.exitCode === 0
    && hostUpdateAfterHealthyRollback.output.installed
    && !hostUpdateAfterHealthyRollback.output.staged,
  'a fresh authorization can reuse a validated version after healthy host-config rollback',
)
rmSync(hostUpdateRollback.root, { recursive: true, force: true })

const hostUpdateUnsafeRollback = controllerFixture({
  hostConfigurationChange: true,
  failHostConfigurationReload: true,
})
installFixtureHostConfiguration(hostUpdateUnsafeRollback, oldSha)
const hostUpdateUnsafeRollbackResult = await runController({
  originalCommand: `update-host-config ${newSha} ${hostUpdateDigest}`,
  config: hostUpdateUnsafeRollback.config,
  dependencies: hostUpdateUnsafeRollback.dependencies,
})
assert(
  hostUpdateUnsafeRollbackResult.exitCode === 1
    && !hostUpdateUnsafeRollbackResult.output.rollbackHealthy
    && existsSync(path.join(
      hostUpdateUnsafeRollback.root,
      'deployments/host-configuration-update/active.json',
    ))
    && existsSync(path.join(
      hostUpdateUnsafeRollback.root,
      'deployments/host-configuration-update/recovery-controller.mjs',
    )),
  'unhealthy host-configuration rollback retains exact recovery state',
)
rmSync(hostUpdateUnsafeRollback.root, { recursive: true, force: true })

function writeInterruptedHostUpdate(fixture, { complete }) {
  const target = installFixtureHostConfiguration(fixture, newSha, { candidate: true })
  copyFileSync(
    path.join(target, 'deploy/eqb-release.service'),
    fixture.config.systemdUnitPath,
  )
  if (complete) {
    copyFileSync(
      path.join(target, 'deploy/Caddyfile.release'),
      fixture.config.caddyConfigPath,
    )
  }
  const stateRoot = path.join(
    fixture.root,
    'deployments',
    'host-configuration-update',
  )
  mkdirSync(stateRoot, { recursive: true })
  chmodSync(stateRoot, 0o700)
  copyFileSync(
    path.join(
      fixture.root,
      'deployments/host-configuration/versions',
      oldSha,
      'deploy/eqb-deploy-controller.mjs',
    ),
    path.join(stateRoot, 'recovery-controller.mjs'),
  )
  chmodSync(path.join(stateRoot, 'recovery-controller.mjs'), 0o600)
  const backup = path.join(stateRoot, `backup-${newSha}-interrupted`)
  mkdirSync(path.join(backup, 'deploy'), { recursive: true })
  chmodSync(backup, 0o700)
  writeFileSync(path.join(backup, 'deploy/eqb-release.service'), 'old service\n', { mode: 0o600 })
  writeFileSync(path.join(backup, 'deploy/Caddyfile.release'), 'old caddy\n', { mode: 0o600 })
  writeFileSync(path.join(stateRoot, 'active.json'), `${JSON.stringify({
    schemaVersion: 'eqb-host-configuration-state-v1',
    targetSha: newSha,
    previousSha: oldSha,
    changedPaths: ['deploy/eqb-release.service'],
    changedPathsDigest: hostUpdateDigest,
    staged: true,
    backupDirectory: backup,
    startedAt: '2026-09-03T00:00:00.000Z',
  })}\n`, { mode: 0o600 })
}

const interruptedHostUpdate = controllerFixture({ hostConfigurationChange: true })
writeInterruptedHostUpdate(interruptedHostUpdate, { complete: true })
const recoveredHostUpdate = await runController({
  originalCommand: `update-host-config ${newSha} ${hostUpdateDigest}`,
  config: interruptedHostUpdate.config,
  dependencies: interruptedHostUpdate.dependencies,
})
assert(
  recoveredHostUpdate.exitCode === 0
    && recoveredHostUpdate.output.recovered
    && recoveredHostUpdate.output.installed,
  'interrupted installed host configuration is health-checked and terminalized idempotently',
)
rmSync(interruptedHostUpdate.root, { recursive: true, force: true })

const partialHostUpdate = controllerFixture({ hostConfigurationChange: true })
writeInterruptedHostUpdate(partialHostUpdate, { complete: false })
const recoveredPartialHostUpdate = await runController({
  originalCommand: `update-host-config ${newSha} ${hostUpdateDigest}`,
  config: partialHostUpdate.config,
  dependencies: partialHostUpdate.dependencies,
})
assert(
  recoveredPartialHostUpdate.exitCode === 1
    && recoveredPartialHostUpdate.output.recovered
    && recoveredPartialHostUpdate.output.rolledBack
    && recoveredPartialHostUpdate.output.rollbackHealthy
    && readlinkSync(path.join(partialHostUpdate.root, 'deployments/host-configuration/current'))
      === path.join('versions', oldSha),
  'interrupted partial host installation bypasses strict active-marker proof only to roll back',
)
rmSync(partialHostUpdate.root, { recursive: true, force: true })

const rootInstalledTarget = controllerFixture({
  hostConfigurationChange: true,
  stableLauncherChange: true,
})
const rootInstalledVersion = installFixtureHostConfiguration(rootInstalledTarget, newSha, { candidate: true })
copyFileSync(
  path.join(rootInstalledVersion, 'deploy/eqb-release.service'),
  rootInstalledTarget.config.systemdUnitPath,
)
copyFileSync(
  path.join(rootInstalledVersion, 'deploy/Caddyfile.release'),
  rootInstalledTarget.config.caddyConfigPath,
)
const rootInstalledDeploy = await runController({
  originalCommand: `deploy ${newSha}`,
  config: rootInstalledTarget.config,
  dependencies: rootInstalledTarget.dependencies,
})
assert(
  rootInstalledDeploy.exitCode === 0 && rootInstalledTarget.currentSha() === newSha,
  'digest-bound root installation unlocks the exact stable-launcher and host-config target only',
)
rmSync(rootInstalledTarget.root, { recursive: true, force: true })

const fixedPreflight = controllerFixture()
const fixedPreflightResult = await runController({
  originalCommand: 'preflight',
  config: fixedPreflight.config,
  dependencies: fixedPreflight.dependencies,
})
assert(
  fixedPreflightResult.output.layout === 'release'
    && fixedPreflightResult.output.productionSha === oldSha,
  'fixed controller provides bounded read-only preflight with active host configuration proof',
)
writeFileSync(fixedPreflight.config.caddyConfigPath, 'tampered caddy\n')
assert(
  await (async () => {
    try {
      await runController({
        originalCommand: 'preflight',
        config: fixedPreflight.config,
        dependencies: fixedPreflight.dependencies,
      })
      return false
    } catch {
      return true
    }
  })(),
  'fixed preflight rejects installed host configuration that drifts from its active version marker',
)
rmSync(fixedPreflight.root, { recursive: true, force: true })

const partialPreflight = controllerFixture()
rmSync(path.join(partialPreflight.root, 'current'))
assert(
  await (async () => {
    try {
      await runController({
        originalCommand: 'preflight',
        config: partialPreflight.config,
        dependencies: partialPreflight.dependencies,
      })
      return false
    } catch {
      return true
    }
  })(),
  'partial or dangling release layout never falls back to a legacy success',
)
rmSync(partialPreflight.root, { recursive: true, force: true })

const writableRootPreflight = controllerFixture()
chmodSync(writableRootPreflight.root, 0o777)
assert(
  await (async () => {
    try {
      await runController({
        originalCommand: 'preflight',
        config: writableRootPreflight.config,
        dependencies: writableRootPreflight.dependencies,
      })
      return false
    } catch {
      return true
    }
  })(),
  'runtime-writable deployment root fails preflight',
)
rmSync(writableRootPreflight.root, { recursive: true, force: true })

const controllerSource = readText(ROOT, 'deploy/eqb-deploy-controller.mjs')
const controllerWrapper = readText(ROOT, 'deploy/eqb-deploy-controller')
const transportWrapper = readText(ROOT, 'deploy/eqb-deploy-transport')
const bootstrapSource = readText(ROOT, 'deploy/bootstrap-eqb-deployment.sh')
const baselineSource = readText(ROOT, 'deploy/eqb-legacy-baseline.mjs')
const baselineStateSource = readText(ROOT, 'deploy/eqb-legacy-baseline-state.mjs')
const keyRetirementSource = readText(ROOT, 'deploy/retire-eqb-bootstrap-key.mjs')
const cancellationSource = readText(ROOT, 'deploy/cancel-eqb-bootstrap-attempt.mjs')
const maintenanceInstallerSource = readText(ROOT, 'deploy/install-eqb-maintenance-controller.sh')
const deployLibrarySource = readText(ROOT, 'scripts/lib/ampOrbDeploy.mjs')
const baselineProtectedBlock = baselineSource.slice(
  baselineSource.indexOf('  const protectedPaths = ['),
  baselineSource.indexOf('\n  ]', baselineSource.indexOf('  const protectedPaths = [')) + 4,
)
const baselineProtectedPaths = [...baselineProtectedBlock.matchAll(/^    '([^']+)',$/gmu)]
  .map((match) => match[1])
const bootstrapProtectedBlock = bootstrapSource.slice(
  bootstrapSource.indexOf('protected_changes=$('),
  bootstrapSource.indexOf('\n[[ -z $protected_changes ]]'),
)
const bootstrapProtectedPaths = [...bootstrapProtectedBlock.matchAll(/^  (\S+)(?: \\|\))$/gmu)]
  .map((match) => match[1])
assert(
  JSON.stringify(PERSISTENCE_AUTHORITY_PATHS) === JSON.stringify(EQB_PERSISTENCE_AUTHORITY_PATHS)
    && JSON.stringify(baselineProtectedPaths) === JSON.stringify(EQB_PERSISTENCE_AUTHORITY_PATHS)
    && JSON.stringify(bootstrapProtectedPaths) === JSON.stringify(EQB_PERSISTENCE_AUTHORITY_PATHS),
  'Orb, baseline, bootstrap, and fixed controller use one exact persistence-authority path set',
)
assert(
  JSON.stringify(HOST_CONFIGURATION_PATHS) === JSON.stringify(EQB_HOST_CONFIGURATION_PATHS)
    && JSON.stringify(STABLE_LAUNCHER_PATHS) === JSON.stringify(EQB_STABLE_LAUNCHER_PATHS),
  'Orb and fixed controller use exact host-configuration and stable-launcher path sets',
)
const privateWriteSource = controllerSource.slice(
  controllerSource.indexOf('function privateWrite('),
  controllerSource.indexOf('\nfunction sha256(', controllerSource.indexOf('function privateWrite(')),
)
assert(
  privateWriteSource.indexOf("openSync(temporary, 'wx', 0o600)")
      < privateWriteSource.indexOf("writeFileSync(descriptor, value, 'utf8')")
    && privateWriteSource.indexOf("writeFileSync(descriptor, value, 'utf8')")
      < privateWriteSource.indexOf('fsyncSync(descriptor)')
    && privateWriteSource.indexOf('fsyncSync(descriptor)')
      < privateWriteSource.indexOf('renameSync(temporary, filePath)')
    && privateWriteSource.indexOf('renameSync(temporary, filePath)')
      < privateWriteSource.indexOf('syncDirectory(path.dirname(filePath))')
    && controllerSource.includes(
      'fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW',
    ),
  'maintenance state publication fsyncs bytes before rename and the parent directory after rename',
)
assert(
  controllerSource.includes('syncDirectory(config.root)')
    && controllerSource.includes('syncDirectory(directory)\n  return snapshots')
    && controllerSource.includes('syncDirectory(path.dirname(filePath))\n      verifySqliteDatabase')
    && controllerSource.includes('syncDirectory(hostConfigurationRoot(config))')
    && controllerSource.includes('syncDirectory(path.dirname(statePath))'),
  'release pointers, database snapshots/restores, host pointers, and terminal state removal are durable',
)
const installerRollbackSource = maintenanceInstallerSource.slice(
  maintenanceInstallerSource.indexOf('rollback() {'),
  maintenanceInstallerSource.indexOf('\n\ncleanup() {'),
)
assert(
  maintenanceInstallerSource.indexOf('host_config_created=1')
      < maintenanceInstallerSource.indexOf('install -d -o root -g root -m 0700 "$HOST_CONFIG_ROOT"')
    && installerRollbackSource.includes(
      'host_config_created == 1 && (activated == 0 || restored == 1)',
    )
    && installerRollbackSource.includes('rollback_failed=1')
    && installerRollbackSource.includes('rollback incomplete; backup=%s')
    && maintenanceInstallerSource.includes('sync -f "$HOST_CONFIG_ROOT"')
    && maintenanceInstallerSource.includes('sync -f "$backup"'),
  'one-time installer removes a handled partial layout and reports incomplete rollback explicitly',
)
execFileSync(process.execPath, ['--check', path.join(ROOT, 'deploy', 'eqb-deploy-controller.mjs')])
execFileSync(process.execPath, ['--check', path.join(ROOT, 'deploy', 'eqb-legacy-baseline-state.mjs')])
execFileSync(process.execPath, ['--check', path.join(ROOT, 'deploy', 'eqb-legacy-baseline.mjs')])
execFileSync(process.execPath, ['--check', path.join(ROOT, 'deploy', 'retire-eqb-bootstrap-key.mjs')])
execFileSync(process.execPath, ['--check', path.join(ROOT, 'deploy', 'cancel-eqb-bootstrap-attempt.mjs')])
execFileSync('/bin/sh', ['-n', path.join(ROOT, 'deploy', 'eqb-deploy-controller')])
execFileSync('/bin/sh', ['-n', path.join(ROOT, 'deploy', 'eqb-deploy-transport')])
execFileSync('/bin/bash', ['-n', path.join(ROOT, 'deploy', 'bootstrap-eqb-deployment.sh')])
execFileSync('/bin/bash', ['-n', path.join(ROOT, 'deploy', 'install-eqb-maintenance-controller.sh')])
for (const originalCommand of [
  '',
  'deploy',
  `deploy ${newSha} --force`,
  `deploy ${newSha}; id`,
  `deploy-reviewed-persistence ${newSha}`,
  `deploy-reviewed-persistence ${newSha} ${maintenanceDigest} extra`,
  `deploy-reviewed-persistence ${newSha} ${maintenanceDigest};id`,
  `update-host-config ${newSha} short`,
  'bash -s',
]) {
  const rejected = spawnSync('/bin/sh', [path.join(ROOT, 'deploy', 'eqb-deploy-transport')], {
    encoding: 'utf8',
    env: { ...process.env, SSH_ORIGINAL_COMMAND: originalCommand },
  })
  assert(rejected.status === 64, `transport wrapper rejects command shape ${JSON.stringify(originalCommand)}`)
}
for (const args of [
  [],
  ['preflight'],
  ['--'],
  ['--', 'deploy'],
  ['--', 'deploy', newSha, '--force'],
  ['--', 'deploy-reviewed-persistence', newSha],
  ['--', 'deploy-reviewed-persistence', newSha, maintenanceDigest, 'extra'],
  ['--', 'update-host-config', newSha, 'short'],
]) {
  const rejected = spawnSync('/bin/sh', [path.join(ROOT, 'deploy', 'eqb-deploy-controller'), ...args], {
    encoding: 'utf8',
  })
  assert(rejected.status === 64, `root wrapper rejects argv shape ${JSON.stringify(args)}`)
}

const earlyBootstrapProcess = spawnSync(
  '/bin/bash',
  [path.join(ROOT, 'deploy', 'bootstrap-eqb-deployment.sh'), newSha, '-'],
  {
    encoding: 'utf8',
    env: { ...process.env, EQB_DEPLOY_BOOTSTRAP_PUBLIC_KEY_BODY: '' },
  },
)
const earlyBootstrapProcessFailure = parseReleaseBootstrapFailure(
  earlyBootstrapProcess.stderr,
  newSha,
  earlyBootstrapProcess.status,
)
assert(
  earlyBootstrapProcess.status === 1
    && earlyBootstrapProcessFailure.failedStage === 'preflight'
    && !earlyBootstrapProcessFailure.rollbackHealthy
    && !earlyBootstrapProcessFailure.evidenceRetained,
  'early bootstrap failure does not claim healthy production before the strict health gate',
)

function functionSource(source, name, next) {
  const start = source.indexOf(`${name}() {`)
  const end = source.indexOf(`\n\n${next}`, start)
  if (start < 0 || end < 0) throw new Error(`Cannot isolate ${name} for rollback fixture`)
  return source.slice(start, end)
}

const cancellationFixtureRoot = mkdtempSync(path.join(tmpdir(), 'eqb-bootstrap-cancellation-'))
chmodSync(cancellationFixtureRoot, 0o700)
try {
  const cancellationFixture = path.join(cancellationFixtureRoot, 'cancel.mjs')
  writeFileSync(cancellationFixture, cancellationSource
    .replace(
      "const backupRoot = '/var/backups/eqb'",
      `const backupRoot = ${JSON.stringify(cancellationFixtureRoot)}`,
    )
    .replace("if (process.getuid?.() !== 0) fail('run-as-root')", '')
    .replaceAll('before.uid !== 0', 'before.uid !== process.getuid()')
    .replaceAll('before.gid !== 0', 'before.gid !== process.getgid()')
    .replaceAll('backupRootState.uid !== 0', 'backupRootState.uid !== process.getuid()')
    .replaceAll('backupRootState.gid !== 0', 'backupRootState.gid !== process.getgid()')
    .replace(
      'fs.fchownSync(descriptor, 0, 0)',
      'fs.fchownSync(descriptor, process.getuid(), process.getgid())',
    ))
  const cancellationUnit = `eqb-release-bootstrap-${'7'.repeat(32)}`
  const runCancellation = (unit = cancellationUnit) => spawnSync(
    process.execPath,
    [cancellationFixture, newSha, unit],
    {
      encoding: 'utf8',
      env: process.env,
    },
  )
  const firstCancellation = runCancellation()
  const cancellation = parseReleaseBootstrapCancellation(
    firstCancellation.stdout,
    newSha,
    cancellationUnit,
  )
  const cancellationPath = path.join(
    cancellationFixtureRoot,
    `bootstrap-cancellation-${cancellationUnit}.json`,
  )
  const firstCancellationBytes = readFileSync(cancellationPath, 'utf8')
  const secondCancellation = runCancellation()
  assert(
    firstCancellation.status === 0
      && secondCancellation.status === 0
      && cancellation.cancellationInstalled
      && !cancellation.hostAttemptStarted
      && parseReleaseBootstrapCancellation(
        secondCancellation.stdout,
        newSha,
        cancellationUnit,
      ).cancellationInstalled
      && readFileSync(cancellationPath, 'utf8') === firstCancellationBytes
      && (statSync(cancellationPath).mode & 0o777) === 0o600,
    'host cancellation is private, exact, atomic, and idempotent for one target and unit',
  )

  const acceptedUnit = `eqb-release-bootstrap-${'6'.repeat(32)}`
  const acceptedPath = path.join(
    cancellationFixtureRoot,
    `bootstrap-attempt-${acceptedUnit}.json`,
  )
  const acceptanceGate = functionSource(
    bootstrapSource,
    'register_host_acceptance',
    'report_failure() {',
  )
    .replace('    || ! chown root:root "$temporary" \\\n', '')
    .replace('!= 0:0:600:1', `!= ${process.getuid()}:${process.getgid()}:600:1`)
  const acceptanceGateHarness = path.join(cancellationFixtureRoot, 'accept.sh')
  writeFileSync(acceptanceGateHarness, `#!/usr/bin/env bash
set -euo pipefail
${acceptanceGate}
fail() { printf 'acceptance-failed\\n'; exit 23; }
FAILURE_BACKUP_ROOT=$1
TARGET_SHA=$2
BOOTSTRAP_UNIT=$3
register_host_acceptance
`)
  const hostAcceptance = spawnSync('/bin/bash', [
    acceptanceGateHarness,
    cancellationFixtureRoot,
    newSha,
    acceptedUnit,
  ], { encoding: 'utf8' })
  assert(
    hostAcceptance.status === 0
      && (statSync(acceptedPath).mode & 0o777) === 0o600,
    'host bootstrap atomically retains unit-bound acceptance before beginning its attempt',
  )
  const acceptedCancellation = runCancellation(acceptedUnit)
  assert(
    acceptedCancellation.status === 0
      && parseReleaseBootstrapCancellation(
        acceptedCancellation.stdout,
        newSha,
        acceptedUnit,
      ).hostAttemptStarted,
    'host cancellation reports durable bootstrap acceptance instead of treating it as dispatch-unknown',
  )

  const unsafeUnit = `eqb-release-bootstrap-${'5'.repeat(32)}`
  writeFileSync(
    path.join(cancellationFixtureRoot, `bootstrap-attempt-${unsafeUnit}.json`),
    '{}\n',
    { mode: 0o644 },
  )
  const unsafeCancellation = runCancellation(unsafeUnit)
  assert(
    unsafeCancellation.status !== 0
      && !existsSync(path.join(
        cancellationFixtureRoot,
        `bootstrap-cancellation-${unsafeUnit}.json`,
      )),
    'unsafe or malformed host acceptance evidence blocks cancellation and recovery cleanup',
  )

  const cancellationGate = functionSource(
    bootstrapSource,
    'assert_not_cancelled',
    'report_failure() {',
  )
    .replace('state.uid !== 0', 'state.uid !== process.getuid()')
    .replace('state.gid !== 0', 'state.gid !== process.getgid()')
    .replace('/usr/bin/node', process.execPath)
  const cancellationGateHarness = path.join(cancellationFixtureRoot, 'gate.sh')
  writeFileSync(cancellationGateHarness, `#!/usr/bin/env bash
set -euo pipefail
${cancellationGate}
fail() { printf 'cancelled-before-mutation\\n'; exit 23; }
FAILURE_BACKUP_ROOT=$1
TARGET_SHA=$2
BOOTSTRAP_UNIT=$3
assert_not_cancelled
printf 'unsafe-runtime-mutation\\n'
`)
  const blockedBootstrap = spawnSync('/bin/bash', [
    cancellationGateHarness,
    cancellationFixtureRoot,
    newSha,
    cancellationUnit,
  ], { encoding: 'utf8' })
  assert(
    blockedBootstrap.status === 23
      && blockedBootstrap.stdout.trim() === 'cancelled-before-mutation'
      && !blockedBootstrap.stdout.includes('unsafe-runtime-mutation'),
    'a queued host bootstrap observes exact cancellation before its first runtime mutation',
  )

  const lockPath = path.join(cancellationFixtureRoot, 'bootstrap.lock')
  const lockContention = spawnSync('/bin/bash', [
    '-c',
    'exec 9>"$1"; /usr/bin/flock --exclusive 9; '
      + '/usr/bin/flock --exclusive --nonblock --conflict-exit-code 75 "$1" /bin/true',
    'eqb-lock-fixture',
    lockPath,
  ])
  assert(
    lockContention.status === 75,
    'host cancellation refuses while the bootstrap transaction lock is held',
  )
} finally {
  rmSync(cancellationFixtureRoot, { recursive: true, force: true })
}

for (const [label, rules, allowed] of [
  ['global NOPASSWD ALL', '    (ALL : ALL) NOPASSWD: ALL', true],
  [
    'unrestricted exact controller',
    '    (root) NOPASSWD: /usr/local/libexec/eqb-deploy-controller-v1',
    true,
  ],
  [
    'legacy bounded controller commands',
    '    (root) NOPASSWD: /usr/local/libexec/eqb-deploy-controller-v1 -- preflight, '
      + '/usr/local/libexec/eqb-deploy-controller-v1 -- deploy *',
    false,
  ],
  [
    'legacy separate bounded controller rules',
    '    (root) NOPASSWD: /usr/local/libexec/eqb-deploy-controller-v1 -- preflight\n'
      + '    (root) NOPASSWD: /usr/local/libexec/eqb-deploy-controller-v1 -- deploy *',
    false,
  ],
  [
    'complete bounded controller rules',
    '    (root) NOPASSWD: /usr/local/libexec/eqb-deploy-controller-v1 -- preflight,\n'
      + '        /usr/local/libexec/eqb-deploy-controller-v1 -- deploy *,\n'
      + '        /usr/local/libexec/eqb-deploy-controller-v1 -- deploy-reviewed-persistence *,\n'
      + '        /usr/local/libexec/eqb-deploy-controller-v1 -- update-host-config *',
    true,
  ],
  [
    'preflight-only controller',
    '    (root) NOPASSWD: /usr/local/libexec/eqb-deploy-controller-v1 -- preflight',
    false,
  ],
  [
    'password-required controller',
    '    (root) PASSWD: /usr/local/libexec/eqb-deploy-controller-v1',
    false,
  ],
  [
    'mixed password tag',
    '    (root) NOPASSWD: /usr/local/libexec/eqb-deploy-controller-v1 -- preflight, '
      + 'PASSWD: /usr/local/libexec/eqb-deploy-controller-v1 -- deploy *',
    false,
  ],
  [
    'near-prefix commands',
    '    (root) NOPASSWD: /usr/local/libexec/eqb-deploy-controller-v1 -- preflight-extra, '
      + '/usr/local/libexec/eqb-deploy-controller-v1 -- deploy-extra *',
    false,
  ],
]) {
  assert(controllerSudoAllowed(rules) === allowed, `${label} sudo scope is classified exactly`)
}

const snapshotFixtureRoot = mkdtempSync(path.join(tmpdir(), 'eqb-bootstrap-snapshots-'))
try {
  const snapshotFunctions = [
    functionSource(bootstrapSource, 'verify_sqlite_database', 'snapshot_databases() {'),
    functionSource(bootstrapSource, 'snapshot_databases', 'normalize_generated_dist() {'),
  ].join('\n\n')
    .replaceAll('/usr/bin/node', JSON.stringify(process.execPath))
    .replace('install -d -o root -g root -m 0700', '/usr/bin/mkdir -p')
    .replace('    chown root:root "$snapshot"\n', '')
  const harness = path.join(snapshotFixtureRoot, 'snapshot-fixture.sh')
  writeFileSync(harness, `#!/usr/bin/env bash
set -euo pipefail
${snapshotFunctions}
SOURCE=$1/live
backup=$1/backup
declare -A database_snapshot_digests=()
declare -A database_identities=()
for name in question-bank.sqlite user-data.sqlite import-ops.sqlite; do
  database_identities["$name"]=$(stat -c '%d:%i' "$SOURCE/data/$name")
done
fail() { printf '%s\n' "$1" >&2; return 1; }
snapshot_databases
for name in question-bank.sqlite user-data.sqlite import-ops.sqlite; do
  printf '%s=%s\n' "$name" "${'${database_snapshot_digests[$name]}'}"
done
`, { mode: 0o700 })
  const liveData = path.join(snapshotFixtureRoot, 'live', 'data')
  mkdirSync(liveData, { recursive: true })
  for (const name of ['question-bank.sqlite', 'user-data.sqlite', 'import-ops.sqlite']) {
    execFileSync('/usr/bin/sqlite3', [
      path.join(liveData, name),
      'PRAGMA foreign_keys=ON; CREATE TABLE parent(id INTEGER PRIMARY KEY); '
        + 'CREATE TABLE child(parent_id INTEGER REFERENCES parent(id)); INSERT INTO parent VALUES(1);',
    ])
  }
  const snapshotResult = spawnSync('/bin/bash', [harness, snapshotFixtureRoot], {
    encoding: 'utf8',
  })
  const reportedDigests = new Map(String(snapshotResult.stdout || '').trim().split('\n')
    .filter(Boolean)
    .map((line) => line.split('=')))
  assert(snapshotResult.status === 0, 'bootstrap database snapshot harness completes successfully')
  for (const name of ['question-bank.sqlite', 'user-data.sqlite', 'import-ops.sqlite']) {
    const snapshot = path.join(snapshotFixtureRoot, 'backup', 'databases', name)
    const integrity = execFileSync('/usr/bin/sqlite3', [snapshot, 'PRAGMA integrity_check;'], {
      encoding: 'utf8',
    }).trim()
    const digest = createHash('sha256').update(readFileSync(snapshot)).digest('hex')
    assert(
      integrity === 'ok'
        && (statSync(snapshot).mode & 0o777) === 0o600
        && reportedDigests.get(name) === digest,
      `${name} snapshot is valid, private, and bound to its receipt digest`,
    )
  }
  rmSync(path.join(snapshotFixtureRoot, 'backup'), { recursive: true, force: true })
  rmSync(path.join(liveData, 'user-data.sqlite'))
  const failedSnapshot = spawnSync('/bin/bash', [harness, snapshotFixtureRoot], {
    encoding: 'utf8',
  })
  assert(failedSnapshot.status !== 0, 'missing live database fails the snapshot stage closed')
} finally {
  rmSync(snapshotFixtureRoot, { recursive: true, force: true })
}

const rollbackFixtureRoot = mkdtempSync(path.join(tmpdir(), 'eqb-bootstrap-rollback-'))
try {
  const functions = [
    functionSource(bootstrapSource, 'report_failure', 'fail() {'),
    functionSource(bootstrapSource, 'cleanup_public_key', 'assert_authorized_keys_state() {'),
    functionSource(bootstrapSource, 'cleanup', 'restore_protected_modes() {'),
    functionSource(bootstrapSource, 'restore_protected_modes', 'restore_file() {'),
    functionSource(bootstrapSource, 'restore_file', 'restore_migrated_directory() {'),
    functionSource(bootstrapSource, 'restore_migrated_directory', 'remove_empty_directory() {'),
    functionSource(bootstrapSource, 'remove_empty_directory', 'strict_health_once() {'),
    functionSource(bootstrapSource, 'rollback', 'stage=initial-health'),
  ].join('\n\n')
    .replaceAll('/etc/systemd/system/eqb.service', '"$LEGACY_UNIT"')
    .replaceAll('/etc/caddy/Caddyfile', '"$LEGACY_CADDY"')
  const harness = path.join(rollbackFixtureRoot, 'rollback-fixture.sh')
  writeFileSync(harness, `#!/usr/bin/env bash
set -u
umask 077
${functions}
fixture=$1
ROOT=$fixture/root
SOURCE=$ROOT/source
TARGET_SHA=${newSha}
backup=$fixture/backup
bootstrap_log=$backup/build.log
release=$ROOT/releases/$TARGET_SHA
LEGACY_UNIT=$fixture/missing-parent/eqb.service
LEGACY_CADDY=$fixture/etc/caddy/Caddyfile
CONTROLLER_DIRECTORY=$fixture/usr/local/libexec
CONTROLLER=$CONTROLLER_DIRECTORY/eqb-deploy-controller-v1
CONTROLLER_MODULE=$CONTROLLER_DIRECTORY/eqb-deploy-controller-v1.mjs
TRANSPORT_CONTROLLER=$CONTROLLER_DIRECTORY/eqb-deploy-transport-v1
HOST_CONFIG_ROOT=$ROOT/deployments/host-configuration
AUTHORIZED_KEYS=$fixture/root-ssh/authorized_keys
PUBLIC_KEY_TEMP=
archive_dir=
build_home=
staging=
success_receipt=
stage=install-controller
activated=1
key_installed=0
controller_directory_created=0
root_hardened=0
build_user_created=0
build_group_created=0
root_uid=0
root_gid=0
root_mode=755
declare -a protected_paths=()
declare -A protected_modes=()
mkdir -p "$SOURCE/data" "$SOURCE/app/public/paper-assets" "$SOURCE/exports" \
  "$SOURCE/server/logs" "$release" "$ROOT/deployments/receipts" "$backup" \
  "$(dirname "$LEGACY_CADDY")"
: > "$SOURCE/.env"
: > "$backup/build.log"
: > "$backup/eqb.service"
: > "$backup/Caddyfile"
systemctl() { return 0; }
wait_for_strict_health() { return 0; }
exec 3> "$fixture/marker"
exec 2>> "$bootstrap_log"
rollback 1
`, { mode: 0o700 })
  const rollbackProcess = spawnSync('/bin/bash', [harness, rollbackFixtureRoot], {
    encoding: 'utf8',
  })
  const rollbackMarker = readFileSync(path.join(rollbackFixtureRoot, 'marker'), 'utf8')
  const rollbackFailure = parseReleaseBootstrapFailure(rollbackMarker, newSha, 1)
  const rollbackLog = readFileSync(path.join(rollbackFixtureRoot, 'backup', 'build.log'), 'utf8')
  const rollbackReceipt = path.join(rollbackFixtureRoot, 'backup', 'failure-receipt.json')
  assert(
    rollbackProcess.status === 1
      && !rollbackFailure.rollbackHealthy
      && rollbackFailure.evidenceRetained
      && rollbackLog.includes('Legacy rollback step failed: restore_file')
      && !rollbackMarker.includes('restore_file')
      && existsSync(rollbackReceipt)
      && (statSync(rollbackReceipt).mode & 0o777) === 0o600,
    'executed rollback continues after a restore error, reports unhealthy, and retains private evidence',
  )
} finally {
  rmSync(rollbackFixtureRoot, { recursive: true, force: true })
}

const distFixtureRoot = mkdtempSync(path.join(tmpdir(), 'eqb-bootstrap-dist-'))
try {
  const normalizeSource = functionSource(
    bootstrapSource,
    'normalize_generated_dist',
    'trap cleanup_public_key EXIT',
  ).replace('/usr/bin/node', JSON.stringify(process.execPath))
  const harness = path.join(distFixtureRoot, 'normalize-fixture.sh')
  writeFileSync(harness, `#!/usr/bin/env bash
set -euo pipefail
${normalizeSource}
normalize_generated_dist "$1"
`, { mode: 0o700 })
  const dist = path.join(distFixtureRoot, 'dist')
  const nested = path.join(dist, 'assets')
  mkdirSync(nested, { recursive: true, mode: 0o700 })
  writeFileSync(path.join(dist, 'index.html'), 'index\n', { mode: 0o600 })
  writeFileSync(path.join(nested, 'app.js'), 'asset\n', { mode: 0o600 })
  chmodSync(dist, 0o700)
  chmodSync(nested, 0o700)
  const normalized = spawnSync('/bin/bash', [harness, dist], { encoding: 'utf8' })
  assert(
    normalized.status === 0
      && readFileSync(path.join(dist, 'index.html'), 'utf8') === 'index\n'
      && readFileSync(path.join(nested, 'app.js'), 'utf8') === 'asset\n'
      && (statSync(dist).mode & 0o777) === 0o755
      && (statSync(nested).mode & 0o777) === 0o755
      && (statSync(path.join(dist, 'index.html')).mode & 0o777) === 0o644
      && (statSync(path.join(nested, 'app.js')).mode & 0o777) === 0o644,
    'executed bootstrap dist normalization preserves bytes and enforces exact Caddy-readable modes',
  )
  const linked = path.join(distFixtureRoot, 'linked-dist')
  mkdirSync(linked)
  writeFileSync(path.join(linked, 'index.html'), 'linked\n')
  linkSync(path.join(linked, 'index.html'), path.join(linked, 'second.html'))
  const rejectedLinkedDist = spawnSync('/bin/bash', [harness, linked], { encoding: 'utf8' })
  assert(rejectedLinkedDist.status !== 0, 'bootstrap dist normalization rejects linked regular files')
} finally {
  rmSync(distFixtureRoot, { recursive: true, force: true })
}

assert(controllerWrapper.includes('/usr/bin/flock'), 'installed wrapper owns the non-blocking production lock')
assert(
  controllerWrapper.indexOf('/usr/bin/systemd-run') < controllerWrapper.indexOf('/usr/bin/flock'),
  'host systemd owns the controller and lock beyond the Deployment Orb connection',
)
assert(
  !controllerWrapper.includes('--pipe')
    && controllerWrapper.includes('--property=StandardInput=null')
    && controllerWrapper.includes('--property=StandardOutput=journal')
    && controllerWrapper.includes('/usr/bin/journalctl'),
  'fixed controller execution survives a disconnected SSH output pipe and returns journal evidence',
)
assert(controllerWrapper.includes('/usr/bin/env -i'), 'installed wrapper clears caller-controlled environment')
assert(!controllerWrapper.includes('/opt/eqb/current'), 'installed wrapper never executes candidate release code')
assert(controllerSource.includes("buildUser: 'eqb-build'"), 'candidate lifecycle runs as a separate unprivileged build user')
assert(controllerSource.includes('controllerUid: 0'), 'production release control remains root-owned')
assert(controllerSource.includes('minimumFreeBytes: 5 * 1024 * 1024 * 1024'), 'controller preserves staging headroom on the production disk')
assert(!controllerSource.includes('eval('), 'fixed controller contains no dynamic shell evaluation')
assert(
  controllerSource.includes("run('/usr/bin/systemd-run'")
    && controllerSource.includes("'--wait'")
    && controllerSource.includes("'--pipe'")
    && controllerSource.includes("'--collect'")
    && controllerSource.includes("'--property=Type=exec'")
    && controllerSource.includes("'--property=RuntimeMaxSec=1200s'")
    && controllerSource.includes("'--property=KillMode=control-group'")
    && controllerSource.includes('`--uid=${config.buildUser}`'),
  'ordinary candidate commands run in transient build-user cgroups that terminate leftover children',
)
assert(
  controllerSource.includes("'/bin/sh', '-c', 'umask 022; exec \"$@\"', 'eqb-release-build'")
    && bootstrapSource.includes("/bin/sh -c 'umask 022; exec \"$@\"' eqb-bootstrap-build"),
  'ordinary and bootstrap builds explicitly create Caddy-readable artifacts',
)
assert(
  bootstrapSource.includes('stage=normalize-generated-dist')
    && bootstrapSource.includes('stage=pre-caddy-dist-proof')
    && bootstrapSource.includes('fs.constants.O_NOFOLLOW')
    && bootstrapSource.includes('fs.fchmodSync(descriptor, expectedMode)')
    && bootstrapSource.includes("throw new Error('generated-dist-normalize-drift')"),
  'bootstrap proves exact generated-dist modes and byte identity before release activation',
)
assert(
  controllerSource.includes("['-hR', 'root:root', directory]")
    && bootstrapSource.includes('chown -hR root:root "$staging"'),
  'release sealing changes symlink ownership without following candidate links',
)
assert(
  bootstrapSource.includes('restrict,command=') && bootstrapSource.includes('ssh-ed25519'),
  'one-time bootstrap installs a forced-command-only deployment key',
)
assert(
  bootstrapSource.includes('TRANSPORT_CONTROLLER=$CONTROLLER_DIRECTORY/eqb-deploy-transport-v1')
    && bootstrapSource.includes('forced_key="restrict,command=\\"$TRANSPORT_CONTROLLER\\"')
    && transportWrapper.includes(
      'exec /usr/bin/sudo -n /usr/local/libexec/eqb-deploy-controller-v1 -- preflight',
    )
    && transportWrapper.includes(
      'exec /usr/bin/sudo -n /usr/local/libexec/eqb-deploy-controller-v1 -- deploy "$sha"',
    )
    && transportWrapper.includes("command_name=deploy-reviewed-persistence")
    && transportWrapper.includes("command_name=update-host-config")
    && transportWrapper.includes('[ "${#digest}" -eq 64 ] || exit 64')
    && controllerWrapper.includes('/opt/eqb/deployments/host-configuration/current/deploy/eqb-deploy-controller.mjs')
    && controllerWrapper.includes('/opt/eqb/deployments/host-configuration-update/recovery-controller.mjs'),
  'forced transport and stable root wrappers accept only bounded versioned maintenance commands',
)
assert(
  maintenanceInstallerSource.indexOf('tar -tf "$PAYLOAD"')
      < maintenanceInstallerSource.indexOf('tar -xf "$PAYLOAD"')
    && maintenanceInstallerSource.includes("fail 'payload archive member set is not exact'")
    && maintenanceInstallerSource.includes("fail 'payload member is not a regular file'")
    && maintenanceInstallerSource.includes('show "$TARGET_SHA:$relative"')
    && maintenanceInstallerSource.includes('sudo -n -l -U "$TRANSPORT_USER"')
    && maintenanceInstallerSource.includes('SSH_ORIGINAL_COMMAND=preflight')
    && maintenanceInstallerSource.includes('EQB_MAINTENANCE_CONTROLLER_INSTALL')
    && maintenanceInstallerSource.includes('strict_health'),
  'one-time root installer binds exact typed target bytes and proves the full forced route before success',
)
assert(
  bootstrapSource.includes('umask 077')
    && bootstrapSource.includes('EQB_DEPLOY_CONTROLLER_PUBLIC_KEY_BODY')
    && bootstrapSource.includes('mktemp /run/eqb-controller-public-key-XXXXXXXX')
    && bootstrapSource.includes('cleanup_public_key'),
  'bootstrap accepts only a private temporary materialization of the generated public key',
)
assert(
  bootstrapSource.includes('/usr/bin/systemd-run')
    && bootstrapSource.includes('--property=Type=exec')
    && bootstrapSource.includes('--property=RuntimeMaxSec=1200s')
    && bootstrapSource.includes('--property=KillMode=control-group')
    && bootstrapSource.includes('--uid=eqb-build')
    && bootstrapSource.includes('/usr/bin/env -i'),
  'one-time bootstrap also isolates candidate code in terminating build-user cgroups with a cleared environment',
)
assert(
  bootstrapSource.includes('tar -xf "$archive" -C "$staging" deploy')
    && bootstrapSource.includes('! -L $staging/deploy/$control_file'),
  'bootstrap installs deployment control files only after exact-archive restoration and regular-file checks',
)
assert(
  bootstrapSource.includes('rm -rf "$staging/.eqb-release.json"')
    && bootstrapSource.includes('set -o noclobber'),
  'bootstrap release-marker creation cannot follow a candidate-provided link',
)
assert(
  bootstrapSource.includes('! -L $ROOT/releases')
    && bootstrapSource.includes('! -L $ROOT/shared')
    && bootstrapSource.includes('! -L $ROOT/deployments')
    && bootstrapSource.includes('! -L $CONTROLLER')
    && bootstrapSource.includes('! -L $AUTHORIZED_KEYS'),
  'bootstrap rejects dangling links at privileged installation ancestors and destinations',
)
assert(
  bootstrapSource.includes('CONTROLLER_DIRECTORY=/usr/local/libexec')
    && bootstrapSource.includes('stage=prepare-controller-directory')
    && bootstrapSource.includes('install -d -o root -g root -m 0755 "$CONTROLLER_DIRECTORY"')
    && bootstrapSource.includes('controller_directory_created=1')
    && bootstrapSource.includes('rollback_step remove_empty_directory "$CONTROLLER_DIRECTORY"'),
  'bootstrap creates the fixed controller directory and removes only its own empty directory on rollback',
)
assert(
  bootstrapSource.includes('! -L $SOURCE/$relative')
    && bootstrapSource.includes('chown -hR eqb:eqb "$ROOT/shared"'),
  'bootstrap rejects linked legacy ancestors and never follows migrated-state links while changing ownership',
)
assert(
  bootstrapSource.includes('protect_legacy_path "$SOURCE/.env"')
    && bootstrapSource.includes('chmod go-rwx "$path"')
    && bootstrapSource.includes('restore_protected_modes'),
  'bootstrap keeps legacy production data private during candidate preparation and restores modes on failure',
)
for (const protectedPath of EQB_PERSISTENCE_AUTHORITY_PATHS) {
  assert(
    controllerSource.includes(`'${protectedPath}'`) && bootstrapSource.includes(protectedPath),
    `${protectedPath} is protected in both ordinary deployment and initial bootstrap`,
  )
}
assert(
  bootstrapSource.includes('chown root:root "$ROOT"')
    && bootstrapSource.includes('chown "$root_uid:$root_gid" "$ROOT"'),
  'bootstrap seals the deployment root and restores its former owner on rollback',
)
assert(
  bootstrapSource.includes('install -d -o root -g root -m 0711 "$ROOT/deployments"')
    && bootstrapSource.includes('install -d -o root -g root -m 0700 "$ROOT/deployments/receipts"'),
  'deployment parent permits isolated traversal while private receipts remain unreadable',
)
assert(
  bootstrapSource.includes('rollback')
    && bootstrapSource.includes('legacy service configuration restored and healthy')
    && bootstrapSource.includes('root-private backup retained')
    && bootstrapSource.includes('https://eqbank.cc/api/health https://eqbank.cc/')
    && bootstrapSource.includes('"https://eqbank.cc/ops/?view=review"'),
  'one-time bootstrap verifies API and static-surface rollback health and retains recovery evidence otherwise',
)
assert(
  bootstrapSource.includes('trap - ERR\n  set +e')
    && bootstrapSource.includes('rollback_step restore_file')
    && bootstrapSource.includes('rollback_step restore_migrated_directory')
    && bootstrapSource.includes('if (( service_recovered == 0 )); then rollback_healthy=0; fi')
    && bootstrapSource.match(/rollback_healthy=1/gu)?.length === 1,
  'rollback continues through every restore step and never lets later health erase an earlier failure',
)
assert(
  bootstrapSource.includes('/usr/bin/timeout --signal=TERM --kill-after=2s 15s')
    && bootstrapSource.includes('wait_for_strict_health')
    && bootstrapSource.includes('https://eqbank.cc/api/health https://eqbank.cc/')
    && controllerSource.includes(
      "curl(['--resolve', 'eqbank.cc:443:127.0.0.1', 'https://eqbank.cc/'])",
    ),
  'bootstrap, rollback, and ordinary deploy share the local TLS and public health surface',
)
assert(
  bootstrapSource.includes('verify_sqlite_database')
    && bootstrapSource.includes("import { DatabaseSync } from 'node:sqlite'")
    && bootstrapSource.includes("database_identities[\"$database_name\"]=$(stat -c '%d:%i'")
    && bootstrapSource.includes('stage=verify-migrated-persistence'),
  'bootstrap verifies all live databases and exact moved identities before release sealing',
)
assert(
  bootstrapSource.includes('stage=snapshot-databases\nsnapshot_databases')
    && bootstrapSource.indexOf('stage=snapshot-databases')
      < bootstrapSource.indexOf('stage=secure-root')
    && bootstrapSource.indexOf('stage=snapshot-databases')
      < bootstrapSource.indexOf('stage=stop-legacy-service')
    && bootstrapSource.includes('production database changed before snapshot')
    && bootstrapSource.includes('production database changed during snapshot')
    && bootstrapSource.includes('"databaseSnapshots": {')
    && bootstrapSource.includes('database_snapshot_digests[question-bank.sqlite]'),
  'bootstrap takes race-checked private SQLite evidence before any maintenance mutation',
)
assert(
  baselineStateSource.includes("receipt.schemaVersion !== LEGACY_BASELINE_RECEIPT_SCHEMA_VERSION")
    && baselineStateSource.includes("receipt.targetSha === expectedHead")
    && baselineStateSource.includes('proof.digest === expectedChildDigest')
    && baselineStateSource.includes("liveReleaseLayout === 'absent'")
    && baselineStateSource.includes("defaultIdentity === 'ok'"),
  'established S1 requires exact receipt, quarantine, absent-layout, and identity evidence',
)
assert(
  bootstrapSource.includes('assert_authorized_keys_state')
    && bootstrapSource.includes('bootstrapLines.length !== 1')
    && bootstrapSource.includes("bootstrapFields[0] !== 'ssh-ed25519'")
    && bootstrapSource.includes('authorizationLines.length !== (expectedForcedKey ? 2 : 1)')
    && bootstrapSource.includes('controllerLines.length !== 1')
    && bootstrapSource.includes('deployment forced key postcondition failed'),
  'bootstrap proves exact old/new authorized-key state before later key retirement',
)
assert(
  controllerSource.includes("[EQB_DEPLOY_RECEIPT_SCHEMA_VERSION, 'EQB_DEPLOY_RECEIPT ']")
    && controllerSource.includes("[EQB_REVIEWED_PERSISTENCE_RECEIPT_SCHEMA_VERSION, 'EQB_REVIEWED_PERSISTENCE_RECEIPT ']")
    && controllerSource.includes("[EQB_HOST_CONFIGURATION_RECEIPT_SCHEMA_VERSION, 'EQB_HOST_CONFIGURATION_RECEIPT ']")
    && controllerSource.includes('process.stdout.write(formatControllerOutput(result.output))'),
  'fixed controller emits one schema-selected parseable receipt marker instead of raw journal JSON',
)
assert(
  bootstrapSource.indexOf('stage=cleanup') < bootstrapSource.indexOf('stage=success-receipt')
    && bootstrapSource.includes('trap - EXIT')
    && bootstrapSource.includes('if [[ -n $success_receipt ]]; then rollback_step rm -f'),
  'bootstrap cleans transient state before success and removes a partial success receipt on rollback',
)
assert(
  bootstrapSource.includes('bootstrap_log=$backup/build.log')
    && bootstrapSource.includes('install -o root -g root -m 0600 /dev/null "$bootstrap_log"')
    && bootstrapSource.includes('exec 3>&2')
    && bootstrapSource.includes('exec 2>> "$bootstrap_log"')
    && bootstrapSource.includes('>> "$bootstrap_log" 2>&1'),
  'bootstrap keeps operator diagnostics and candidate output in a private host log',
)
assert(
  bootstrapSource.includes('FAILURE_BACKUP_ROOT=/var/backups/eqb')
    && bootstrapSource.includes('backup=$(mktemp -d "$FAILURE_BACKUP_ROOT/bootstrap-attempt-')
    && bootstrapSource.includes('failed_stage=$stage')
    && bootstrapSource.includes('failure-receipt.json')
    && bootstrapSource.includes('EQB_BOOTSTRAP_FAILURE ')
    && !bootstrapSource.includes('rm -rf "$backup"'),
  'healthy bootstrap rollback retains a private failure receipt and build log outside release layout',
)
for (const forbidden of ['pull-run-push', 'backup-to-r2', 'rclone ', 'migrate:']) {
  assert(!bootstrapSource.includes(forbidden), `bootstrap never invokes forbidden ${forbidden.trim()} operation`)
}

assert(
  baselineSource.includes('process.umask(0o077)')
    && baselineSource.includes("'umask 022; exec \"$@\"'"),
  'baseline keeps operator evidence private while install and build children create readable artifacts',
)
assert(
  baselineSource.includes('function childProof(wrapper)')
    && baselineSource.includes("const pre = childProof('/opt/eqb/releases')")
    && baselineSource.includes('const moved = childProof(quarantine)')
    && baselineSource.includes('completeDigest: digest(completeFiles)')
    && baselineSource.includes('proof.completeDigest === quarantineRecord.completeDigest'),
  'baseline verifies the same inner quarantine child and a complete byte digest before rollback',
)
assert(
  baselineSource.includes('function pathEntryExists(filePath)')
    && baselineSource.includes('if (pathEntryExists(fixedPath))')
    && baselineSource.includes('pathEntryExists(defaultKey)')
    && baselineSource.includes('stat.isSymbolicLink()'),
  'baseline rejects dangling fixed paths and linked generated trees',
)
assert(
  baselineSource.includes('const expectedMode = stat.isDirectory() ? 0o755 : 0o644')
    && baselineSource.includes("if (stat.isFile() && stat.nlink !== 1) throw new Error('generated-dist-linked-file')")
    && baselineSource.includes('const before = distManifest({ verifyModes: false })')
    && baselineSource.includes('fs.constants.O_NOFOLLOW')
    && baselineSource.includes('stat.dev === entry.dev')
    && baselineSource.includes('stat.ino === entry.ino')
    && baselineSource.includes('fs.fchmodSync(descriptor, expectedMode)')
    && baselineSource.includes('if (!sameDistContent(before, after))')
    && baselineSource.includes('return normalizeDistModes()')
    && baselineSource.includes("stage = 'pre-caddy-dist-proof'")
    && baselineSource.includes('sameDistManifest(targetDist)')
    && baselineSource.includes('rollbackDist = installBuild(true)')
    && baselineSource.includes('sameDistManifest(rollbackDist)'),
  'baseline normalizes only generated dist modes without content drift before both Caddy starts',
)
assert(
  baselineSource.includes(
    'const healthy = baselineRestored && serviceRecoveryHealthy && strictHealth()',
  )
    && baselineSource.includes('rolledBack: rollbackResult.rolledBack')
    && baselineSource.includes("curl(['--resolve', `${publicHost}:443:127.0.0.1`, `${origin}/`])"),
  'baseline claims healthy rollback only after terminal strict health and exact baseline restoration',
)
assert(
  baselineSource.includes('if (!trafficReopened && snapshotsReady)')
    && baselineSource.includes('if (codeAdvanced && !trafficReopened)')
    && baselineSource.indexOf("throw new Error('target-invariants-before-caddy')")
      < baselineSource.indexOf("stage = 'start-caddy'"),
  'baseline proves target invariants before Caddy and never restores code or DB after traffic reopening',
)
const baselineCaddyStart = baselineSource.slice(baselineSource.indexOf("stage = 'start-caddy'"))
assert(
  baselineCaddyStart.indexOf('trafficReopened = true')
    < baselineCaddyStart.indexOf("must('/usr/bin/systemctl', ['start', 'caddy']"),
  'the first Caddy start attempt crosses the irreversible traffic boundary',
)
const baselineServiceStop = baselineSource.slice(baselineSource.indexOf("stage = 'stop-services'"))
assert(
  baselineServiceStop.indexOf('maintenance = true')
    < baselineServiceStop.indexOf("must('/usr/bin/systemctl', ['stop', 'caddy']"),
  'rollback owns service recovery from the first maintenance stop attempt',
)
for (const forbidden of ['pull-run-push', 'backup-to-r2', 'rclone ', 'promote-paper']) {
  assert(!baselineSource.includes(forbidden), `baseline never invokes forbidden ${forbidden.trim()} operation`)
}
assert(
  keyRetirementSource.includes("execFileSync('/usr/bin/getent', ['passwd', transportUser]")
    && keyRetirementSource.includes("path.join(sshDirectory, 'authorized_keys')")
    && keyRetirementSource.includes("pathEntryExists(path.join(sshDirectory, 'authorized_keys2'))")
    && keyRetirementSource.includes('oldMatches.length !== 1')
    && keyRetirementSource.includes('newMatches.length !== 1')
    && keyRetirementSource.includes('authorizationRecords(records).length !== 2')
    && keyRetirementSource.includes('fs.renameSync(replacementPath, transport.authorizedKeys)')
    && keyRetirementSource.includes('fs.renameSync(rollbackPath, transport.authorizedKeys)')
    && keyRetirementSource.includes('syncDirectory(transport.sshDirectory)')
    && keyRetirementSource.includes("original.includes('\\r')"),
  'bootstrap identity retirement resolves the transport boundary, is exact and atomic, and restores on failed proof',
)
assert(
  keyRetirementSource.includes("process.umask(0o077)")
    && keyRetirementSource.includes("fs.mkdtempSync('/var/backups/eqb/bootstrap-key-retirement-')")
    && keyRetirementSource.includes("privateWrite(backupPath, original)"),
  'bootstrap identity retirement retains a root-private rollback copy',
)
assert(
  cancellationSource.includes("process.umask(0o077)")
    && cancellationSource.includes("fs.openSync(temporary, 'wx', 0o600)")
    && cancellationSource.includes('fs.renameSync(temporary, markerPath)')
    && cancellationSource.includes('syncDirectory(backupRoot)')
    && cancellationSource.includes('receipt.targetSha !== targetSha')
    && cancellationSource.includes('receipt.unit !== unit'),
  'bootstrap cancellation is root-private, atomic, and bound to one target and unit',
)
assert(
  bootstrapSource.includes('EQB_DEPLOY_BOOTSTRAP_UNIT')
    && bootstrapSource.indexOf('assert_not_cancelled')
      < bootstrapSource.indexOf('backup=$(mktemp -d')
    && bootstrapSource.indexOf('assert_not_cancelled')
      < bootstrapSource.indexOf('stage=initial-health'),
  'bootstrap checks the exact cancellation marker under its caller-held lock before mutation',
)
const recoveryPublishSource = deployLibrarySource.slice(
  deployLibrarySource.indexOf('export function createReleaseBootstrapRecovery'),
  deployLibrarySource.indexOf('export function readReleaseBootstrapRecovery'),
)
assert(
  recoveryPublishSource.includes('mkdtempSync(path.join(stateRoot, `.bootstrap-${targetSha}-`)')
    && recoveryPublishSource.indexOf('syncDirectory(preparedDirectory)')
      < recoveryPublishSource.indexOf('renameSync(preparedDirectory, directory)')
    && recoveryPublishSource.indexOf('renameSync(preparedDirectory, directory)')
      < recoveryPublishSource.indexOf('syncDirectory(stateRoot)'),
  'bootstrap recovery is fully fsynced in a hidden directory before atomic publication',
)
const service = readText(ROOT, 'deploy/eqb-release.service')
const caddy = readText(ROOT, 'deploy/Caddyfile.release')
assert(service.includes('WorkingDirectory=/opt/eqb/current'), 'systemd runs only the atomic current release')
assert(service.includes('--env-file-if-exists=/opt/eqb/shared/.env'), 'systemd keeps production environment outside releases')
assert(caddy.includes('root * /opt/eqb/current/app/dist'), 'Caddy serves only the atomic current release')
assert(!caddy.includes('/opt/eqb/english-question-bank/app/dist'), 'Caddy no longer serves the mutable source checkout')

section('Production activation is Owner-authorized and bounded')

const cli = readText(ROOT, 'scripts/amp-orb-deploy.mjs')
const bootstrapCli = cli.slice(
  cli.indexOf('function stageReleaseBootstrapPayload'),
  cli.indexOf('function readNewControllerPreflight'),
)
const bootstrapEntry = cli.slice(
  cli.indexOf('async function bootstrap()'),
  cli.indexOf('async function bootstrapResume()'),
)
const bootstrapInspectEntry = cli.slice(
  cli.indexOf('async function bootstrapInspect()'),
  cli.indexOf('async function bootstrapAbandon()'),
)
const bootstrapAbandonEntry = cli.slice(
  cli.indexOf('async function bootstrapAbandon()'),
  cli.indexOf('async function deploy()'),
)
const deploymentRunbook = readText(ROOT, 'docs/cuts/launch-deploy/runbook.md')
const flatDeploymentRunbook = deploymentRunbook.replaceAll('\n', ' ')
assert(cli.includes("process.argv[2] === 'plan'"), 'CLI exposes a no-mutation deployment plan')
assert(cli.includes("process.argv[2] === 'preflight'"), 'CLI exposes an Owner-authorized read-only preflight')
assert(cli.includes("process.argv[2] === 'baseline'"), 'CLI exposes the protected legacy baseline command')
assert(cli.includes("process.argv[2] === 'bootstrap'"), 'CLI exposes the one-time release-layout bootstrap')
assert(cli.includes("process.argv[2] === 'bootstrap-inspect'"), 'CLI exposes read-only bootstrap recovery inspection')
assert(cli.includes("process.argv[2] === 'bootstrap-resume'"), 'CLI exposes explicit bootstrap finalization recovery')
assert(cli.includes("process.argv[2] === 'bootstrap-abandon'"), 'CLI exposes proven failed recovery abandonment')
assert(cli.includes("process.argv[2] === 'deploy'"), 'CLI exposes the Owner-authorized deploy-latest command')
assert(cli.includes('productionMutationAllowed: false'), 'plan and preflight declare no production mutation authority')
assert(cli.includes('productionMutationAllowed: true'), 'successful deployment output declares production mutation')
assert(cli.includes("invokeController(['deploy', sha]"), 'SSH sends only the exact SHA to the fixed controller')
assert(!cli.includes("remoteArgs: ['bash', '-s']"), 'production activation never streams candidate shell code')
assert(!cli.includes('StrictHostKeyChecking=no'), 'CLI contains no SSH trust bypass')
assert(
  cli.includes(
    'head="$(/usr/bin/sudo -n /usr/sbin/runuser -u eqb -- /usr/bin/git -C "$repo" rev-parse HEAD)"',
  )
    && cli.includes(
      'status --porcelain --untracked-files=no | /usr/bin/wc -l',
    )
    && cli.includes('strict_health=invalid')
    && cli.includes('strict_health=ok')
    && cli.includes('strictHealth=%s'),
  'legacy preflight proves tracked checkout state and strict health through the production boundary',
)
assert(
  cli.includes("input: readFileSync(legacyBaselineSource, 'utf8')")
    && cli.includes('/var/lock/eqb-legacy-baseline.lock')
    && cli.includes("'/usr/bin/node',")
    && cli.includes("'--input-type=module',"),
  'baseline streams the exact tracked operator under a non-blocking host lock',
)
assert(
  bootstrapCli.includes('input: bootstrapPayloadStageInput(bootstrapSource, bootstrapDigest)')
    && bootstrapCli.includes('/var/backups/eqb/bootstrap-payload-')
    && bootstrapCli.includes('/var/lock/eqb-release-bootstrap.lock')
    && bootstrapCli.includes('EQB_DEPLOY_BOOTSTRAP_UNIT=${identity.unit}')
    && bootstrapCli.includes('/usr/bin/systemd-run')
    && bootstrapCli.includes('--property=StandardInput=null')
    && bootstrapCli.includes('--property=StandardOutput=journal')
    && !bootstrapCli.includes("'--pipe'")
    && bootstrapCli.includes('/usr/bin/journalctl')
    && bootstrapCli.includes("remoteArgs: ['sudo', '-n', '/usr/bin/journalctl', '--sync']")
    && bootstrapCli.includes('const journalOutput = await readBootstrapJournal(identity)')
    && bootstrapCli.includes('classifyReleaseBootstrapOutcome(journalOutput, candidate.sha, remote.status)'),
  'bootstrap hash-stages the tracked script and runs it under a disconnect-safe host service and lock',
)
assert(
  bootstrapEntry.indexOf('stageReleaseBootstrapPayload(resolved)')
    < bootstrapEntry.indexOf('createControllerIdentityRecovery({')
    && bootstrapEntry.indexOf('createControllerIdentityRecovery({')
      < bootstrapEntry.indexOf('bootstrapAttempted = true')
    && bootstrapEntry.indexOf('bootstrapAttempted = true')
      < bootstrapEntry.indexOf('invokeReleaseBootstrap({'),
  'inert payload staging precedes durable recovery, which precedes the host bootstrap attempt',
)
assert(
  cli.includes("input: readFileSync(bootstrapKeyRetirementSource, 'utf8')")
    && cli.includes('EQB_DEPLOY_BOOTSTRAP_PUBLIC_KEY_BODY=')
    && cli.includes('classifyPrivilegedBootstrapIdentity')
    && cli.includes("remoteArgs: ['/bin/true']")
    && cli.includes('isSshPublicKeyAuthenticationDenied(remote)'),
  'bootstrap retires the exact old identity and distinguishes auth rejection from transport failure',
)
assert(
  cli.includes("'.local', 'state', 'eqb-deployment'")
    && cli.includes('createControllerIdentityRecovery')
    && cli.includes('readReleaseBootstrapRecovery')
    && cli.includes('readCompletedReleaseBootstrapRecovery')
    && cli.includes('hostBootstrapRepeated: false'),
  'bootstrap resumes finalization without repeating host bootstrap and retains crash-safe terminal evidence',
)
assert(
  bootstrapInspectEntry.includes('await readBootstrapJournal(identity)')
    && bootstrapInspectEntry.includes('await classifyControllerIdentity(identity)')
    && bootstrapInspectEntry.includes('await classifyPrivilegedBootstrapIdentity(identity)'),
  'bootstrap inspection resolves journal and identity probes before reporting their values',
)
assert(
  cli.includes('classifyControllerIdentity(identity)')
    && cli.includes("!['failure', 'unknown'].includes(journal.state)")
    && cli.includes('cancelReleaseBootstrapAttempt(identity)')
    && cli.includes("input: readFileSync(bootstrapCancellationSource, 'utf8')")
    && bootstrapAbandonEntry.includes(
      "await classifyPrivilegedBootstrapIdentity(identity) !== 'active'",
    )
    && cli.includes('abandonReleaseBootstrapRecovery(recovery, {'),
  'abandonment cancels queued dispatch under the host lock before both SSH identity classifications',
)
assert(
  bootstrapAbandonEntry.includes('await readBootstrapJournal(identity)')
    && bootstrapAbandonEntry.includes('await cancelReleaseBootstrapAttempt(identity)')
    && bootstrapAbandonEntry.includes('await classifyControllerIdentity(identity)')
    && bootstrapAbandonEntry.includes('await classifyPrivilegedBootstrapIdentity(identity)')
    && bootstrapAbandonEntry.indexOf('cancelReleaseBootstrapAttempt(identity)')
      < bootstrapAbandonEntry.indexOf('classifyControllerIdentity(identity)')
    && bootstrapAbandonEntry.indexOf('cancelReleaseBootstrapAttempt(identity)')
      < bootstrapAbandonEntry.indexOf('readLegacyPreflight('),
  'host cancellation resolves before abandonment state proofs and local cleanup',
)
assert(
  !bootstrapInspectEntry.includes('readCommitChecks')
    && !bootstrapAbandonEntry.includes('readCommitChecks')
    && bootstrapAbandonEntry.includes("legacy.strictHealth !== 'ok'"),
  'recovery inspection and proven healthy S1 cleanup remain usable during a GitHub outage',
)
assert(
  cli.includes("'--data-file', '-'")
    && cli.includes('input: readFileSync(identity.privateKeyPath')
    && cli.includes('projectId = String(process.env.AMP_PROJECT_ID')
    && cli.includes('environmentRefreshRequired: true'),
  'verified controller key rotates only the current Deployment project secret through stdin',
)
assert(
  flatDeploymentRunbook.includes('after one successful receipt it is consumed and must not be rerun')
    && flatDeploymentRunbook.includes('Do not run `amp orb restart-processes` while bootstrap finalization is pending')
    && deploymentRunbook.indexOf('verify the new\n   forced-controller route, rotate only')
      < deploymentRunbook.indexOf('atomically retire the exact old privileged key'),
  'runbook preserves consumed baseline, rotate-before-retire, and no-early-refresh ordering',
)

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
for (const [command, authorization, label] of [
  ['baseline', '--owner-said-baseline-migration', 'baseline migration'],
  ['bootstrap', '--owner-said-release-bootstrap', 'release-layout bootstrap'],
  ['bootstrap-resume', '--owner-said-release-bootstrap-resume', 'release-layout bootstrap recovery'],
  ['bootstrap-abandon', '--owner-said-release-bootstrap-abandon', 'failed bootstrap abandonment'],
]) {
  const unauthorized = spawnSync(
    process.execPath,
    [path.join(ROOT, 'scripts', 'amp-orb-deploy.mjs'), command],
    { cwd: ROOT, encoding: 'utf8' },
  )
  assert(unauthorized.status === 1, `${label} without current Owner authorization is rejected`)
  assert(
    unauthorized.stderr.includes('Current Owner authorization'),
    `unauthorized ${label} stops before credentials, SSH, or production work`,
  )
  const suppliedSha = spawnSync(
    process.execPath,
    [path.join(ROOT, 'scripts', 'amp-orb-deploy.mjs'), command, authorization, '--sha', newSha],
    { cwd: ROOT, encoding: 'utf8' },
  )
  assert(
    suppliedSha.status === 1 && suppliedSha.stderr.includes('do not supply --sha'),
    `${label} CLI rejects a caller-supplied SHA before production work`,
  )
}
const unauthorizedBootstrapInspect = spawnSync(
  process.execPath,
  [path.join(ROOT, 'scripts', 'amp-orb-deploy.mjs'), 'bootstrap-inspect'],
  { cwd: ROOT, encoding: 'utf8' },
)
assert(
  unauthorizedBootstrapInspect.status === 1
    && unauthorizedBootstrapInspect.stderr.includes('Current Owner authorization'),
  'bootstrap inspection without current read-only authorization stops before recovery or SSH work',
)
const suppliedInspectSha = spawnSync(
  process.execPath,
  [
    path.join(ROOT, 'scripts', 'amp-orb-deploy.mjs'),
    'bootstrap-inspect',
    '--owner-said-preflight',
    '--sha',
    newSha,
  ],
  { cwd: ROOT, encoding: 'utf8' },
)
assert(
  suppliedInspectSha.status === 1 && suppliedInspectSha.stderr.includes('do not supply --sha'),
  'bootstrap inspection rejects a caller-supplied target before recovery or SSH work',
)
const unauthorizedDeploy = spawnSync(
  process.execPath,
  [path.join(ROOT, 'scripts', 'amp-orb-deploy.mjs'), 'deploy'],
  { cwd: ROOT, encoding: 'utf8' },
)
assert(unauthorizedDeploy.status === 1, 'deploy without current Owner authorization is rejected')
assert(
  unauthorizedDeploy.stderr.includes('Current Owner authorization'),
  'unauthorized deploy stops before candidate resolution, credentials, or SSH',
)
for (const command of ['activate', 'activate-release']) {
  const attempted = spawnSync(
    process.execPath,
    [path.join(ROOT, 'scripts', 'amp-orb-deploy.mjs'), command, '--owner-said-deploy-latest'],
    { cwd: ROOT, encoding: 'utf8' },
  )
  assert(attempted.status === 1, `${command} bypass entrypoint exits non-zero`)
  assert(
    attempted.stderr.includes('Usage: amp-orb-deploy.mjs plan | preflight')
      && attempted.stderr.includes('deploy --owner-said-deploy-latest'),
    `${command} is rejected instead of bypassing deploy-latest gates`,
  )
}

summary()
