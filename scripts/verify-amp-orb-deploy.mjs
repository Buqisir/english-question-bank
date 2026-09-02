#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
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
  activatePreparedRelease,
  assertDeploymentCandidateStillCurrent,
  assertAuthoritativeDeploymentChecks,
  bootstrapReleaseLayout,
  currentReleaseSha,
  deployLatestRelease,
  deploymentGitHubApiArgs,
  deploymentLockInvocation,
  deploymentSSHInvocation,
  materializeDeploymentCredentials,
  migrateLegacyProductionBaseline,
  parseBootstrapKeyRetirementReceipt,
  parseDeploymentControllerOutput,
  parseDeploymentControllerPreflight,
  parseDeploymentPreflightOutput,
  parseLegacyBaselineReceipt,
  requireDeployLatestAuthorization,
  requireLegacyBaselineAuthorization,
  requireReleaseLayoutBootstrapAuthorization,
  resolveLatestDeploymentCandidate,
} from './lib/ampOrbDeploy.mjs'
import {
  EQB_DEPLOY_CONTROLLER_VERSION,
  parseControllerCommand,
  runController,
} from '../deploy/eqb-deploy-controller.mjs'
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
  return JSON.stringify({
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
  })
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

const controllerPreflight = parseDeploymentControllerPreflight(JSON.stringify({
  schemaVersion: 'eqb-deployment-preflight-v2',
  controllerVersion: 'eqb-deploy-controller-v1',
  productionSha: oldSha,
  eqb: 'active',
  caddy: 'active',
  layout: 'release',
}))
assert(controllerPreflight.productionSha === oldSha, 'fixed controller preflight is parsed strictly')

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

const legacyPreflight = {
  productionSha: oldSha,
  trackedDirtyPaths: 0,
  eqb: 'active',
  caddy: 'active',
  layout: 'legacy',
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

const migratedPreflight = { ...legacyPreflight, productionSha: newSha }
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
const bootstrapOrder = []
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
  async verifyBootstrapIdentityRetired() {
    bootstrapOrder.push('old-rejected')
    return true
  },
  async rotateControllerSecret() {
    bootstrapOrder.push('secret')
  },
})
assert(bootstrapped.controllerPreflight.layout === 'release', 'new forced controller proves release layout')
assert(
  bootstrapOrder.join(',')
    === 'resolve,main,preflight,main,bootstrap,controller,retire,controller,old-rejected,secret',
  'bootstrap proves the new route, retires and rejects the old key, then rotates the secret last',
)

let ineligibleBootstrapInvoked = false
assert(await (async () => {
  try {
    await bootstrapReleaseLayout({
      argv: ['bootstrap', '--owner-said-release-bootstrap'],
      resolveCandidate: async () => candidate,
      readMainSha: async () => newSha,
      readLegacyPreflight: async () => legacyPreflight,
      invokeBootstrap: async () => {
        ineligibleBootstrapInvoked = true
      },
      readControllerPreflight: async () => healthyReleasePreflight,
      retireBootstrapIdentity: async () => parseBootstrapKeyRetirementReceipt(keyRetirementReceipt),
      verifyBootstrapIdentityRetired: async () => true,
      rotateControllerSecret: async () => {},
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
      invokeBootstrap: async () => {},
      readControllerPreflight: async () => ({ ...healthyReleasePreflight, caddy: 'inactive' }),
      retireBootstrapIdentity: async () => parseBootstrapKeyRetirementReceipt(keyRetirementReceipt),
      verifyBootstrapIdentityRetired: async () => true,
      rotateControllerSecret: async () => {
        unverifiedSecretRotated = true
      },
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
      invokeBootstrap: async () => {},
      readControllerPreflight: async () => healthyReleasePreflight,
      retireBootstrapIdentity: async () => parseBootstrapKeyRetirementReceipt(keyRetirementReceipt),
      verifyBootstrapIdentityRetired: async () => false,
      rotateControllerSecret: async () => {
        unretiredSecretRotated = true
      },
    })
    return false
  } catch {
    return true
  }
})(), 'still-usable privileged bootstrap identity fails the bootstrap')
assert(!unretiredSecretRotated, 'controller key is not rotated while the old identity remains usable')

section('Private credentials and pinned SSH invocation')

const credentialRoot = mkdtempSync(path.join(tmpdir(), 'eqb-deploy-credentials-'))
const generatedKey = path.join(credentialRoot, 'generated')
execFileSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', generatedKey])
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

const ssh = deploymentSSHInvocation({
  host: 'deployer@production.invalid',
  keyPath: materialized.keyPath,
  knownHostsPath: materialized.knownHostsPath,
})
assert(ssh.command === 'ssh', 'deployment uses the system SSH client')
assert(ssh.args.includes('StrictHostKeyChecking=yes'), 'SSH host-key checking is strict')
assert(
  ssh.args.includes(`UserKnownHostsFile=${materialized.knownHostsPath}`),
  'SSH trusts only the private pinned known_hosts file',
)
assert(ssh.args.includes('GlobalKnownHostsFile=/dev/null'), 'global host keys cannot widen trust')
assert(ssh.args.includes('BatchMode=yes'), 'SSH cannot fall back to an interactive password')
assert(ssh.args.includes('PreferredAuthentications=publickey'), 'SSH attempts only the pinned public-key identity')
assert(!ssh.args.some((arg) => arg.includes('StrictHostKeyChecking=no')), 'insecure host-key bypass is absent')

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
].join('\n'))
assert(preflight.productionSha === oldSha, 'preflight returns one exact production SHA')
assert(preflight.trackedDirtyPaths === 0, 'preflight dirty count is parsed as a number')
assert(preflight.eqb === 'active' && preflight.caddy === 'active', 'preflight reports both service states')
assert(preflight.layout === 'legacy', 'preflight distinguishes legacy and release layouts')
assert(
  (() => {
    try {
      parseDeploymentPreflightOutput(`productionSha=${oldSha}\ntrackedDirtyPaths=0\neqb=active\ncaddy=active\nlayout=release\nunexpected=value`)
      return false
    } catch {
      return true
    }
  })(),
  'unexpected remote preflight output fails closed',
)
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
  advanceAfterBuild = false,
  hostConfigurationChange = false,
  persistenceAuthorityChange = false,
  protectedDiffFailure = false,
  unsafeCandidateDirectory = null,
  tamperDeploymentControl = false,
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
    protectedDiffFailure,
    unsafeCandidateDirectory,
    tamperDeploymentControl,
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
        if (args.at(-1) !== 'deploy') {
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
        for (const relative of [
          'Caddyfile.release',
          'eqb-release.service',
          'eqb-deploy-controller',
          'eqb-deploy-controller.mjs',
        ]) {
          writeFileSync(path.join(release, 'deploy', relative), `trusted archive ${relative}\n`)
        }
        return ''
      }
      if (command === '/usr/bin/systemctl' && args[0] === 'restart') {
        state.restarts.push(currentSha())
        return ''
      }
      if (command === '/usr/bin/systemctl' && args[0] === 'is-active') {
        return args.includes('--quiet') ? '' : 'active\n'
      }
      if (command === '/usr/bin/curl') {
        if (failCandidateHealth && currentSha() === newSha) {
          throw new Error('fixture candidate unhealthy')
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
    seal(directory) {
      chmodSync(directory, 0o755)
    },
  }
  return { root, config, dependencies, state, currentSha }
}

assert(
  parseControllerCommand(`deploy ${newSha}`).sha === newSha,
  'fixed controller accepts only one exact machine-resolved SHA',
)
for (const command of ['', 'deploy', `deploy ${newSha} --force`, `deploy ${newSha}; id`, 'bash -s']) {
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

const fixedSuccess = controllerFixture()
const fixedSuccessResult = await runController({
  originalCommand: `deploy ${newSha}`,
  config: fixedSuccess.config,
  dependencies: fixedSuccess.dependencies,
})
assert(fixedSuccessResult.exitCode === 0, 'fixed controller reports healthy activation success')
assert(fixedSuccess.currentSha() === newSha, 'fixed controller atomically activates the prepared SHA')
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

const fixedPreflight = controllerFixture()
const fixedPreflightResult = await runController({
  originalCommand: 'preflight',
  config: fixedPreflight.config,
  dependencies: fixedPreflight.dependencies,
})
assert(
  fixedPreflightResult.output.layout === 'release'
    && fixedPreflightResult.output.productionSha === oldSha,
  'fixed controller provides bounded read-only preflight',
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
const bootstrapSource = readText(ROOT, 'deploy/bootstrap-eqb-deployment.sh')
const baselineSource = readText(ROOT, 'deploy/eqb-legacy-baseline.mjs')
const keyRetirementSource = readText(ROOT, 'deploy/retire-eqb-bootstrap-key.mjs')
execFileSync(process.execPath, ['--check', path.join(ROOT, 'deploy', 'eqb-deploy-controller.mjs')])
execFileSync(process.execPath, ['--check', path.join(ROOT, 'deploy', 'eqb-legacy-baseline.mjs')])
execFileSync(process.execPath, ['--check', path.join(ROOT, 'deploy', 'retire-eqb-bootstrap-key.mjs')])
execFileSync('/bin/sh', ['-n', path.join(ROOT, 'deploy', 'eqb-deploy-controller')])
execFileSync('/bin/bash', ['-n', path.join(ROOT, 'deploy', 'bootstrap-eqb-deployment.sh')])
assert(controllerWrapper.includes('/usr/bin/flock'), 'installed wrapper owns the non-blocking production lock')
assert(
  controllerWrapper.indexOf('/usr/bin/systemd-run') < controllerWrapper.indexOf('/usr/bin/flock'),
  'host systemd owns the controller and lock beyond the Deployment Orb connection',
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
  controllerSource.includes("['-hR', 'root:root', directory]")
    && bootstrapSource.includes('chown -hR root:root "$staging"'),
  'release sealing changes symlink ownership without following candidate links',
)
assert(
  bootstrapSource.includes('restrict,command=') && bootstrapSource.includes('ssh-ed25519'),
  'one-time bootstrap installs a forced-command-only deployment key',
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
for (const protectedPath of [
  'data/sql',
  'server/api.mjs',
  'server/auth/auth.mjs',
  'server/draft-paper/draftPaperStore.mjs',
  'server/import-review/importReviewStore.mjs',
  'server/my-space/mySpace.mjs',
  'server/paper-import/publisher.mjs',
  'server/paper-import/storage.mjs',
  'server/source-intake/sourceIntakeStore.mjs',
  'server/user-data',
  'server/vocabulary/vocabularyStore.mjs',
]) {
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
    && bootstrapSource.includes('--resolve eqbank.cc:443:127.0.0.1 https://eqbank.cc/')
    && bootstrapSource.includes('https://eqbank.cc/ops/?view=review'),
  'one-time bootstrap verifies API and static-surface rollback health and retains recovery evidence otherwise',
)
assert(
  bootstrapSource.includes('bootstrap_log=$backup/build.log')
    && bootstrapSource.includes('install -o root -g root -m 0600 /dev/null "$bootstrap_log"')
    && bootstrapSource.includes('>> "$bootstrap_log" 2>&1'),
  'bootstrap keeps candidate install and build output in a private host log',
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
    && baselineSource.includes("stage = 'pre-caddy-dist-proof'")
    && baselineSource.includes('sameDistManifest(targetDist)')
    && baselineSource.includes('rollbackDist = installBuild(true)')
    && baselineSource.includes('sameDistManifest(rollbackDist)'),
  'baseline proves generated dist modes and hashes before both forward and rollback Caddy starts',
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
  keyRetirementSource.includes("const authorizedKeys = '/root/.ssh/authorized_keys'")
    && keyRetirementSource.includes('oldMatches.length !== 1')
    && keyRetirementSource.includes('newMatches.length !== 1')
    && keyRetirementSource.includes('fs.renameSync(replacementPath, authorizedKeys)')
    && keyRetirementSource.includes('fs.renameSync(rollbackPath, authorizedKeys)')
    && keyRetirementSource.includes('syncSshDirectory()')
    && keyRetirementSource.includes("original.includes('\\r')"),
  'bootstrap identity retirement is exact, atomic, and restores authorized_keys on failed proof',
)
assert(
  keyRetirementSource.includes("process.umask(0o077)")
    && keyRetirementSource.includes("fs.mkdtempSync('/var/backups/eqb/bootstrap-key-retirement-')")
    && keyRetirementSource.includes("privateWrite(backupPath, original)"),
  'bootstrap identity retirement retains a root-private rollback copy',
)
const service = readText(ROOT, 'deploy/eqb-release.service')
const caddy = readText(ROOT, 'deploy/Caddyfile.release')
assert(service.includes('WorkingDirectory=/opt/eqb/current'), 'systemd runs only the atomic current release')
assert(service.includes('--env-file-if-exists=/opt/eqb/shared/.env'), 'systemd keeps production environment outside releases')
assert(caddy.includes('root * /opt/eqb/current/app/dist'), 'Caddy serves only the atomic current release')
assert(!caddy.includes('/opt/eqb/english-question-bank/app/dist'), 'Caddy no longer serves the mutable source checkout')

section('Production activation is Owner-authorized and bounded')

const cli = readText(ROOT, 'scripts/amp-orb-deploy.mjs')
assert(cli.includes("process.argv[2] === 'plan'"), 'CLI exposes a no-mutation deployment plan')
assert(cli.includes("process.argv[2] === 'preflight'"), 'CLI exposes an Owner-authorized read-only preflight')
assert(cli.includes("process.argv[2] === 'baseline'"), 'CLI exposes the protected legacy baseline command')
assert(cli.includes("process.argv[2] === 'bootstrap'"), 'CLI exposes the one-time release-layout bootstrap')
assert(cli.includes("process.argv[2] === 'deploy'"), 'CLI exposes the Owner-authorized deploy-latest command')
assert(cli.includes('productionMutationAllowed: false'), 'plan and preflight declare no production mutation authority')
assert(cli.includes('productionMutationAllowed: true'), 'successful deployment output declares production mutation')
assert(cli.includes("invokeController(['deploy', sha]"), 'SSH sends only the exact SHA to the fixed controller')
assert(!cli.includes("remoteArgs: ['bash', '-s']"), 'production activation never streams candidate shell code')
assert(!cli.includes('StrictHostKeyChecking=no'), 'CLI contains no SSH trust bypass')
assert(
  cli.includes("input: readFileSync(legacyBaselineSource, 'utf8')")
    && cli.includes('/var/lock/eqb-legacy-baseline.lock')
    && cli.includes("'/usr/bin/node',")
    && cli.includes("'--input-type=module',"),
  'baseline streams the exact tracked operator under a non-blocking host lock',
)
assert(
  cli.includes("input: readFileSync(releaseBootstrapSource, 'utf8')")
    && cli.includes('/var/lock/eqb-release-bootstrap.lock')
    && cli.includes('EQB_DEPLOY_CONTROLLER_PUBLIC_KEY_BODY='),
  'bootstrap streams the exact tracked script under a separate non-blocking host lock',
)
assert(
  cli.includes("input: readFileSync(bootstrapKeyRetirementSource, 'utf8')")
    && cli.includes('EQB_DEPLOY_BOOTSTRAP_PUBLIC_KEY_BODY=')
    && cli.includes('verifyBootstrapIdentityRetired')
    && cli.includes('Permission denied \\(publickey'),
  'bootstrap retires the exact old identity and distinguishes auth rejection from transport failure',
)
assert(
  cli.includes("'--data-file', '-'")
    && cli.includes('input: readFileSync(identity.privateKeyPath')
    && cli.includes('projectId = String(process.env.AMP_PROJECT_ID')
    && cli.includes('environmentRefreshRequired: true'),
  'verified controller key rotates only the current Deployment project secret through stdin',
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
