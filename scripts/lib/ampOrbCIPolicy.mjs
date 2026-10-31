import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { TextDecoder } from 'node:util'

import { EQB_HOST_CONFIGURATION_PATHS, EQB_PERSISTENCE_AUTHORITY_PATHS } from './ampOrbDeploy.mjs'

export const AMP_ORB_CI_PR_POLICY_VERSION = 'pr-risk-v1'
const LOW_RISKS = new Set(['ui-micro', 'non-governance-docs', 'known-shape-paper-data'])
const ALWAYS_FULL = [
  /(?:^|\/)AGENTS\.md$/u, /(?:^|\/)CLAUDE\.md$/u,
  /^standards\//u, /^\.agents\//u,
  /^\.amp\/plugins\//u, /^\.github\/workflows\//u,
  /^scripts\/(?:verify-ci\.mjs|amp-orb-ci(?:-sandbox)?\.mjs|verify-amp-orb-ci\.mjs)$/u,
  /^scripts\/lib\/(?:ampOrbCI|ampOrbCIPolicy|verificationCommandRunner|verificationScheduler|verifyScope)\.mjs$/u,
  /^data\/sql\//u, /^deploy\//u, /^server\/(?:auth|user-data|source-intake|import-ops)\//u,
  /^server\/(?:ai-daily-limit|vocabulary\/vocabulary(?:Store|Routes|PrintJobs))\.mjs$/u,
]
const PAPER_DATA = [/^app\/public\/paper-assets\//u, /^test-fixtures\/paper-canonical\/publications\//u, /^test-fixtures\/paper-import\//u]
const NON_GOVERNANCE_DOCS = [/\.md$/u]
const AUTHORITY_PATHS = [...EQB_PERSISTENCE_AUTHORITY_PATHS, ...EQB_HOST_CONFIGURATION_PATHS]

function digest(value) {
  return createHash('sha256').update(value).digest('hex')
}

export function parseAmpOrbCIDiffRaw(buffer) {
  if (!Buffer.isBuffer(buffer)) throw new Error('Trusted diff must be a Buffer')
  let text
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    throw new Error('Malformed trusted diff encoding')
  }
  const fields = text.split('\0')
  if (fields.at(-1) !== '') throw new Error('Malformed trusted diff terminator')
  fields.pop()
  const changes = []
  for (let index = 0; index < fields.length;) {
    const metadata = fields[index++]
    const match = /^:([0-7]{6}) ([0-7]{6}) ([a-f0-9]{40}) ([a-f0-9]{40}) ([A-Z])\d*$/u.exec(metadata)
    if (!match || index >= fields.length || !['A', 'M', 'R', 'D', 'T'].includes(match[5])) throw new Error('Malformed trusted diff record')
    const status = match[5]
    const first = fields[index++]
    if (!first || /[\n\r]/u.test(first)) throw new Error('Malformed trusted diff path')
    let paths = [first]
    if (status === 'R' || status === 'C') {
      if (index >= fields.length || !fields[index] || /[\n\r]/u.test(fields[index])) throw new Error('Malformed trusted rename record')
      paths = [first, fields[index++]]
    }
    changes.push({ oldMode: match[1], newMode: match[2], status, paths })
  }
  return changes
}

export function classifyAmpOrbCIPullRequest(changes, { alwaysFull = false } = {}) {
  const files = [...new Set(changes.flatMap((change) => change.paths))].sort()
  let override = null
  if (alwaysFull) override = 'always-full'
  else if (changes.some(({ status, oldMode, newMode }) => !['A', 'M', 'R'].includes(status)
    || (oldMode !== '000000' && oldMode !== '100644') || newMode !== '100644')) override = 'unsupported-change'
  else if (files.some((file) => ALWAYS_FULL.some((pattern) => pattern.test(file))
    || AUTHORITY_PATHS.some((authority) => file === authority || file.startsWith(`${authority}/`)))) override = 'protected-path'
  let risk = 'ordinary-local-feature'
  if (files.length > 0 && files.every((file) => NON_GOVERNANCE_DOCS.some((pattern) => pattern.test(file)))) risk = 'non-governance-docs'
  else if (files.length > 0 && files.every((file) => PAPER_DATA.some((pattern) => pattern.test(file))
    && /\.(?:json|png|jpe?g|webp|pdf)$/u.test(file))) risk = 'known-shape-paper-data'
  else if (files.length > 0 && files.every((file) => file === 'app/src/shared-ui/tokens.css')) risk = 'ui-micro'
  if (override) risk = 'forced-full'
  const requiredLanes = LOW_RISKS.has(risk) ? ['fast'] : ['fast', 'full']
  return Object.freeze({
    policyVersion: AMP_ORB_CI_PR_POLICY_VERSION,
    files,
    filesDigest: digest(files.join('\0')),
    risk,
    override,
    requiredLanes,
    policyDigest: digest(JSON.stringify({ policyVersion: AMP_ORB_CI_PR_POLICY_VERSION, requiredLanes, risk, override, filesDigest: digest(files.join('\0')) })),
  })
}

export function trustedAmpOrbCIPolicy(repositoryRoot, baseSha, headSha, {
  execFileSyncImpl = execFileSync,
  alwaysFull = (() => {
    // Only the installed controller's private state can activate reduction.
    // The webhook environment need not be refreshed; candidates never see it.
    try {
      const config = JSON.parse(readFileSync(path.join(repositoryRoot, '.scratch/amp-orb-ci/pr-policy.json'), 'utf8'))
      return config?.schemaVersion !== 'amp-orb-ci-pr-policy-v1' || config.mode !== 'risk-lanes'
    } catch {
      return true
    }
  })(),
} = {}) {
  let output
  try {
    output = execFileSyncImpl('git', ['diff', '--raw', '-z', '--no-abbrev', '--find-renames', '--no-ext-diff', '--no-textconv', baseSha, headSha, '--'], {
      cwd: repositoryRoot, encoding: null, stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000,
    })
    return classifyAmpOrbCIPullRequest(parseAmpOrbCIDiffRaw(output), { alwaysFull })
  } catch {
    const base = classifyAmpOrbCIPullRequest([], { alwaysFull: true })
    const override = 'trusted-diff-failed'
    return Object.freeze({ ...base, override, policyDigest: digest(JSON.stringify({
      policyVersion: base.policyVersion, requiredLanes: base.requiredLanes,
      risk: base.risk, override, filesDigest: base.filesDigest,
    })) })
  }
}
