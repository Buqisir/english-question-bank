/**
 * Verifies the Matt-native completion-exit policy and its canonical templates.
 *
 * This verifier checks tracked policy artifacts and deterministic scenarios.
 * It does not inspect or claim to validate an agent's real final response.
 */

import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'

import {
  createVerifier,
  readText,
  repoRootFrom,
} from './lib/verifyScope.mjs'

const ROOT = repoRootFrom(import.meta.url)
const { assert, section, summary } = createVerifier(
  'Ticket completion report contract verify',
)

const documents = new Map([
  ['AGENTS.md', readText(ROOT, 'AGENTS.md')],
  [
    'dispatch protocol',
    readText(ROOT, 'docs/agents/dispatch-protocols.md'),
  ],
  [
    'completion protocol',
    readText(ROOT, 'docs/steering/dev-completion-protocol.md'),
  ],
  [
    'completion template',
    readText(ROOT, 'docs/agents/dev-completion-report-template.md'),
  ],
  [
    'owner QA template',
    readText(ROOT, 'docs/agents/owner-qa-handoff-template.md'),
  ],
  ['Matt workflow', readText(ROOT, 'docs/steering/codex-matt-workflow.md')],
  ['handoff template', readText(ROOT, 'docs/cuts/_templates/handoff.md')],
  ['issue tracker', readText(ROOT, 'docs/agents/issue-tracker.md')],
  ['ticket template', readText(ROOT, 'docs/cuts/_templates/ticket.md')],
  [
    'QA checklist template',
    readText(ROOT, 'docs/cuts/_templates/qa-checklist.md'),
  ],
])

const agents = documents.get('AGENTS.md')
const dispatch = documents.get('dispatch protocol')
const steering = documents.get('completion protocol')
const template = documents.get('completion template')
const ownerQa = documents.get('owner QA template')
const workflow = documents.get('Matt workflow')
const ticketTemplate = documents.get('ticket template')
const issueTracker = documents.get('issue tracker')
const readme = readText(ROOT, 'docs/steering/README.md')
const modelRouting = readText(ROOT, 'docs/agents/model-routing.md')
const cutWorkflow = readText(ROOT, 'docs/steering/cut-workflow-protocol.md')
const currentPaperPhase = readText(
  ROOT,
  'docs/cuts/paper-canonical-unification/phase-transition.md',
)
const currentPaperPhasePath =
  'docs/cuts/paper-canonical-unification/phase-transition.md'
const currentPaperMapPath =
  'docs/cuts/paper-canonical-unification/wayfinder/map.md'
const currentPaperMap = readText(ROOT, currentPaperMapPath)
const currentPaperConditionalEvidence = readText(
  ROOT,
  'docs/cuts/paper-canonical-unification/conditional-manifest-approval-evidence.md',
)
const currentPaperTicket01 = readText(
  ROOT,
  'docs/cuts/paper-canonical-unification/tickets/01-canonical-foundation.md',
)
const currentPaperTicket02 = readText(
  ROOT,
  'docs/cuts/paper-canonical-unification/tickets/02-route-authority-repair.md',
)
const parallelTicketPaths = [
  'docs/cuts/paper-canonical-unification/tickets/27-nck1-confirmation-lane.md',
  'docs/cuts/paper-canonical-unification/tickets/28-national-legacy-confirmation-lane.md',
  'docs/cuts/paper-canonical-unification/tickets/29-zhejiang-legacy-confirmation-lane.md',
]
const parallelJoinTicketPath =
  'docs/cuts/paper-canonical-unification/tickets/30-integrate-confirmed-canonical-corpus.md'
const currentPaperTicket26 = readText(
  ROOT,
  'docs/cuts/paper-canonical-unification/tickets/26-deterministic-source-materialization.md',
)
const currentPaperLaneTickets = parallelTicketPaths.map((path) =>
  readText(ROOT, path),
)
const currentPaperTicket30 = readText(ROOT, parallelJoinTicketPath)
const globalCoordinatorSkillPath =
  '/Users/huangxuewei/.codex/skills/coordinate-eqb-wayfinder/SKILL.md'
const globalCoordinatorYamlPath =
  '/Users/huangxuewei/.codex/skills/coordinate-eqb-wayfinder/agents/openai.yaml'
const reviewedDispatchDigest =
  '328993218476c8e2ee3120bad2399fb30c3b332b4fe5c1e1af35388f76ecf4fc'
const reviewedGlobalCoordinatorSkillDigest =
  '5283214f3300f55a0cd91c6f491c1750a09d6d2a2bf4a637be7d46623c23f5d3'
const reviewedGlobalCoordinatorYamlDigest =
  '064e1a9c970291ee6030f7650677823d0746c6664092760071bb272b1d62402b'

const compact = (source) => source.replace(/\s+/g, ' ')
const sourceDigest = (source) =>
  createHash('sha256').update(source).digest('hex')
const fencedBlocks = (source) =>
  [...source.matchAll(/```(?:text)?\n([\s\S]*?)```/g)].map((match) =>
    match[1].trim(),
  )
const lineIndex = (block, field) =>
  block.split('\n').findIndex((line) => line.startsWith(field))
const skillRequiredTaskBlocks = (source) =>
  [
    ...source.matchAll(
      /<!-- skill-required-handoff -->\s*```(?:text)?\n([\s\S]*?)```/g,
    ),
  ].map((match) => match[1].trim())

const skillAttachmentPattern =
  /^\[\$(?<skill>[a-z0-9][a-z0-9-]*)\]\((?<path>\/[^)\n]+\/SKILL\.md)\)$/
const requiredSkillByTaskType = new Map([
  ['to-spec', 'to-spec'],
  ['to-tickets', 'to-tickets'],
  ['implementation', 'implement'],
  ['fix', 'implement'],
  ['independent-review', 'code-review'],
  ['focused-re-review', 'code-review'],
])

function validateSkillHandoff(block, taskType) {
  const lines = block.split('\n')
  const attachment = lines[0]?.match(skillAttachmentPattern)
  const errors = []

  if (!attachment) {
    errors.push('skill attachment must be complete Markdown on the first line')
  }
  if (lines[1] !== '') {
    errors.push('skill attachment must be followed by one blank line')
  }

  const targetSkill = attachment?.groups?.path.split('/').at(-2)
  if (attachment && targetSkill !== attachment.groups.skill) {
    errors.push('skill attachment label and target must match')
  }

  const requiredSkill = requiredSkillByTaskType.get(taskType)
  if (
    requiredSkill &&
    (attachment?.groups?.skill !== requiredSkill || targetSkill !== requiredSkill)
  ) {
    errors.push(`${taskType} handoff requires $${requiredSkill}`)
  }

  return errors
}

function frontmatterName(source) {
  const frontmatter = source.match(/^---\n([\s\S]*?)\n---(?:\n|$)/)?.[1]
  return frontmatter
    ?.match(/^name:\s*["']?([^"'\n]+?)["']?\s*$/m)?.[1]
    ?.trim()
}

function invocationAvailability(
  skill,
  { activeCatalog = [], ownerAttached = [] },
) {
  if (activeCatalog.includes(skill)) {
    return { available: true, source: 'active catalog' }
  }
  if (ownerAttached.includes(skill)) {
    return { available: true, source: 'owner attachment' }
  }
  return { available: false, code: 'SKILL UNAVAILABLE' }
}

function resolveHandoffReference(skill, candidates) {
  const verified = new Map()

  for (const candidate of candidates) {
    if (
      !['owner path', 'skill bridge'].includes(candidate.source) ||
      !candidate.exists ||
      !candidate.readable ||
      !isAbsolute(candidate.path) ||
      candidate.realPath !== candidate.path ||
      frontmatterName(candidate.contents) !== skill
    ) {
      continue
    }
    verified.set(candidate.path, candidate)
  }

  if (verified.size === 0) {
    return { available: false, code: 'SKILL UNAVAILABLE' }
  }
  if (verified.size > 1) {
    return { available: false, code: 'SKILL AMBIGUOUS' }
  }
  return { available: true, path: [...verified.keys()][0] }
}

function completionExitErrors({
  terminal,
  currentTaskComplete,
  initiativeClosed,
  ownerQaPending = false,
  nextOnPass,
  exit,
}) {
  const errors = []
  const exitKinds = new Set(['same-task', 'new-task', 'owner-qa', 'done'])
  const normalizedNextOnPass = nextOnPass?.trim().toLowerCase()
  const routesToOwnerQa = normalizedNextOnPass === 'owner qa'
  const routesToDone = normalizedNextOnPass === 'done'
  const legalExitKind = !currentTaskComplete
    ? 'same-task'
    : initiativeClosed
      ? 'done'
      : ownerQaPending
        ? 'owner-qa'
        : 'new-task'

  if (!terminal && !nextOnPass?.trim()) {
    errors.push('Terminal: no requires Next on PASS')
  }
  if (legalExitKind === 'new-task' && !nextOnPass?.trim()) {
    errors.push('completed ticket requires Next on PASS')
  }
  if (ownerQaPending && !currentTaskComplete) {
    errors.push(
      'owner QA cannot be pending before the current task completes',
    )
  }
  if (initiativeClosed && ownerQaPending) {
    errors.push('closed initiative cannot also be waiting for owner QA')
  }
  if (initiativeClosed && !currentTaskComplete) {
    errors.push('closed initiative requires a completed current task')
  }
  if (initiativeClosed && (!terminal || !routesToDone)) {
    errors.push(
      'closed initiative requires Terminal: yes and Next on PASS: DONE',
    )
  }
  if (ownerQaPending && !routesToOwnerQa) {
    errors.push('owner-QA pending requires Next on PASS: owner QA')
  }
  if (currentTaskComplete && routesToOwnerQa && !ownerQaPending) {
    errors.push('Next on PASS: owner QA requires owner-QA pending')
  }
  if (currentTaskComplete && routesToDone && !initiativeClosed) {
    errors.push('Next on PASS: DONE requires a closed initiative')
  }
  if (!exitKinds.has(exit.kind)) {
    errors.push(`unknown completion exit: ${exit.kind}`)
    return errors
  }

  if (exit.kind !== legalExitKind) {
    errors.push(`only legal exit is ${legalExitKind}`)
  }
  if (exit.kind === 'done' && !initiativeClosed) {
    errors.push('DONE requires a closed initiative')
  }
  if (!terminal && currentTaskComplete && exit.kind === 'same-task') {
    errors.push('completed ticket requires its successor handoff')
  }
  if (
    legalExitKind === 'new-task' &&
    exit.kind === 'new-task' &&
    exit.target !== nextOnPass
  ) {
    errors.push('successor handoff must match Next on PASS')
  }

  return errors
}

function ticketRouteErrors(source) {
  const route = source.match(/^Next on PASS:\s*(.*?)\s*$/im)?.[1]?.trim()
  const frontier = markdownField(source, 'Parallel frontier')
  const join = markdownField(source, 'Parallel join')
  const parallelPaths = (value) =>
    value
      ?.split(',')
      .map((path) => path.trim().replace(/^`|`$/g, ''))
      .filter(Boolean) ?? []
  const frontierPaths = parallelPaths(frontier)
  const joinPaths = parallelPaths(join)
  const parallelFieldsPresent = [frontier, join].map(
    (value) => value !== undefined,
  )
  const errors = []

  if (
    /^Terminal:\s*no\s*$/im.test(source) &&
    (!route || /^<.*>$/.test(route))
  ) {
    errors.push('Terminal: no requires a non-empty, non-placeholder Next on PASS')
  }
  if (route === 'parallel frontier handoff') {
    if (!parallelFieldsPresent.every(Boolean)) {
      errors.push('parallel frontier handoff requires both matched-route fields')
    } else if (
      frontierPaths.length === 0 ||
      !frontierPaths.every((path) => /^docs\/.+\.md$/.test(path)) ||
      join !== 'not-applicable'
    ) {
      errors.push('parallel frontier handoff has malformed matched-route values')
    }
  } else if (route === 'parallel join handoff') {
    if (!parallelFieldsPresent.every(Boolean)) {
      errors.push('parallel join handoff requires both matched-route fields')
    } else if (
      frontier !== 'not-applicable' ||
      joinPaths.length !== 1 ||
      !/^docs\/.+\.md$/.test(joinPaths[0])
    ) {
      errors.push('parallel join handoff has malformed matched-route values')
    }
  } else if (parallelFieldsPresent.some(Boolean)) {
    errors.push('ordinary serial routes must omit both parallel matched-route fields')
  }
  return errors
}

const modelRouteRowSelectors = {
  coordinatorPlanning: (work) => work.startsWith('Coordinator, Wayfinder,'),
  deterministicMechanical: (work) =>
    work.startsWith('Deterministic, repetitive,'),
  normalImplementation: (work) =>
    work === 'Normal implementation and semantic fixes',
  crossCutClosure: (work) =>
    work.startsWith('First-of-kind source adapters;'),
  ordinaryReview: (work) =>
    work === 'Independent Standards/Spec review and focused re-review',
  aggregateReview: (work) => work.startsWith('High-risk aggregate review:'),
}
const modelRouteSelectors = new Map([
  ['coordinator', modelRouteRowSelectors.coordinatorPlanning],
  ['planning', modelRouteRowSelectors.coordinatorPlanning],
  ['deterministic-mechanical', modelRouteRowSelectors.deterministicMechanical],
  ['normal-implementation', modelRouteRowSelectors.normalImplementation],
  ['semantic-fix', modelRouteRowSelectors.normalImplementation],
  ['first-of-kind', modelRouteRowSelectors.crossCutClosure],
  ['cross-cut', modelRouteRowSelectors.crossCutClosure],
  ['full-semantic-closure', modelRouteRowSelectors.crossCutClosure],
  ['screen-print-pdf-closure', modelRouteRowSelectors.crossCutClosure],
  ['independent-review', modelRouteRowSelectors.ordinaryReview],
  ['focused-re-review', modelRouteRowSelectors.ordinaryReview],
  ['high-risk-aggregate-review', modelRouteRowSelectors.aggregateReview],
])

function modelRoutingTableRows(source) {
  const table = source.match(
    /\| Work \| Model \| Effort \|\n\| --- \| --- \| --- \|\n((?:\|[^\n]+\|\n?)+)/,
  )?.[1]
  if (!table) {
    throw new Error('authoritative model-routing table is missing or malformed')
  }

  const rows = table
    .trim()
    .split('\n')
    .map((line) => {
      const cells = line
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim().replace(/^`|`$/g, ''))
      if (cells.length !== 3 || cells.some((cell) => !cell)) {
        throw new Error('authoritative model-routing row is malformed')
      }
      return { work: cells[0], model: cells[1], effort: cells[2] }
    })

  if (rows.length !== 6) {
    throw new Error('authoritative model-routing table must contain six routes')
  }
  return rows
}

function expectedCurrentModelRoute(routeKind, authority = modelRouting) {
  const selector = modelRouteSelectors.get(routeKind)
  if (!selector) {
    return null
  }
  const matches = modelRoutingTableRows(authority).filter(({ work }) =>
    selector(work),
  )
  if (matches.length !== 1) {
    throw new Error(
      `authoritative model-routing table does not select exactly one row for ${routeKind}`,
    )
  }
  return { model: matches[0].model, effort: matches[0].effort }
}

function currentModelRouteErrors({
  routeKind,
  model,
  effort,
  source = 'current-authority',
  authority = modelRouting,
}) {
  const errors = []
  let expected
  try {
    expected = expectedCurrentModelRoute(routeKind, authority)
  } catch (error) {
    errors.push(error.message)
    return errors
  }

  if (!expected) {
    errors.push(`unknown current route kind: ${routeKind}`)
    return errors
  }
  if (source !== 'current-authority') {
    errors.push('current tasks cannot inherit a model from historical text')
  }
  if (model !== expected.model || effort !== expected.effort) {
    errors.push(
      `${routeKind} requires ${expected.model} / ${expected.effort}`,
    )
  }
  return errors
}

const fullCommitPattern = /^[0-9a-f]{40}$/
const sha256Pattern = /^[0-9a-f]{64}$/
const absoluteSkillPattern = /^\/.+\/SKILL\.md$/
const exactApprovalIdentityPattern =
  /^(?:[0-9a-f]{8,}(?:-[0-9a-f]+)+|[a-z][a-z0-9-]*:[^\s]+)$/i

function markdownField(source, field) {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return source
    .match(new RegExp(`^${escaped}:\\s*(.*?)\\s*$`, 'm'))?.[1]
    ?.replace(/^`|`$/g, '')
}

function committedArtifactBytes(commit, artifactPath) {
  try {
    return execFileSync('git', ['show', `${commit}:${artifactPath}`], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch {
    return null
  }
}

function committedArtifactDigest(commit, artifactPath) {
  const bytes = committedArtifactBytes(commit, artifactPath)
  return bytes ? createHash('sha256').update(bytes).digest('hex') : ''
}

function committedArtifactText(commit, artifactPath) {
  return committedArtifactBytes(commit, artifactPath)?.toString('utf8') ?? ''
}

function currentArtifactDigest(artifactPath) {
  try {
    return createHash('sha256')
      .update(readFileSync(resolve(ROOT, artifactPath)))
      .digest('hex')
  } catch {
    return ''
  }
}

function commitIsAncestor(commit, head) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', commit, head], {
      cwd: ROOT,
      stdio: 'ignore',
    })
    return true
  } catch {
    return false
  }
}

function commitParent(commit) {
  try {
    return execFileSync('git', ['rev-parse', `${commit}^`], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return ''
  }
}

function commitChangedPaths(commit) {
  try {
    return execFileSync(
      'git',
      [
        'diff-tree',
        '--root',
        '--no-commit-id',
        '--name-only',
        '-r',
        '--no-renames',
        commit,
      ],
      {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    )
      .trim()
      .split('\n')
      .filter(Boolean)
  } catch {
    return []
  }
}

function firstCommitAfterAncestor(ancestor, head) {
  try {
    return (
      execFileSync(
        'git',
        ['rev-list', '--ancestry-path', '--reverse', `${ancestor}..${head}`],
        {
          cwd: ROOT,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        },
      )
        .trim()
        .split('\n')
        .filter(Boolean)[0] ?? ''
    )
  } catch {
    return ''
  }
}

function onlyMarkdownFieldChanged(
  before,
  after,
  field,
  expectedBefore,
  expectedAfter,
) {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`^${escaped}:[^\\r\\n]*$`, 'gm')
  const beforeMatches = [...before.matchAll(pattern)]
  const afterMatches = [...after.matchAll(pattern)]
  if (
    beforeMatches.length !== 1 ||
    afterMatches.length !== 1 ||
    beforeMatches[0][0] !== `${field}: ${expectedBefore}` ||
    afterMatches[0][0] !== `${field}: ${expectedAfter}`
  ) {
    return false
  }
  const sentinel = `${field}: <route-field-sentinel>`
  return (
    before.replace(pattern, sentinel) === after.replace(pattern, sentinel)
  )
}

function worktreeIsClean() {
  try {
    return (
      execFileSync('git', ['status', '--porcelain=v1'], {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim() === ''
    )
  } catch {
    return false
  }
}

function currentGitHead() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return ''
  }
}

const externalBlockerKindPattern = /^[a-z0-9][a-z0-9 ._/-]{2,159}$/i
const reservedExternalBlockerKinds = new Set([
  'pending',
  'none',
  'not-applicable',
  'n-a',
  'na',
  'null',
  'undefined',
  'unknown',
  'tbd',
  'todo',
  'placeholder',
  'unset',
  'not-required',
  'not-set',
  'empty',
  'nil',
  'n-i-l',
  'tbc',
  't-b-c',
  'not-available',
  'not-specified',
  'unspecified',
  'no-blocker',
  'no-blocker-kind',
])
const externalBlockerClosurePattern = /^(docs\/.+)@([0-9a-f]{40})$/

function externalBlockerKindIsValid(kind) {
  if (!externalBlockerKindPattern.test(kind ?? '')) {
    return false
  }
  const canonical = kind
    .trim()
    .toLowerCase()
    .replace(/[\s._/]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
  return (
    canonical.length > 0 &&
    !reservedExternalBlockerKinds.has(canonical)
  )
}

function parseExternalBlockerClosureEvidence(evidence, expectedKind, head) {
  const match = evidence?.match(externalBlockerClosurePattern)
  if (!match) {
    return { formatValid: false }
  }

  const [, artifactPath, commit] = match
  const artifactSource = committedArtifactText(commit, artifactPath)
  return {
    formatValid: true,
    artifactPath,
    commit,
    ancestor:
      fullCommitPattern.test(head ?? '') && commitIsAncestor(commit, head),
    artifactExists: artifactSource.length > 0,
    artifactStatus: markdownField(artifactSource, 'Status'),
    artifactKind: markdownField(artifactSource, 'External blocker kind'),
    expectedKind,
  }
}

function conditionalDispatchHistory(startCommit, endCommit, receiptPath) {
  if (
    !fullCommitPattern.test(startCommit ?? '') ||
    !fullCommitPattern.test(endCommit ?? '') ||
    !/^docs\/.+/.test(receiptPath ?? '') ||
    !commitIsAncestor(startCommit, endCommit)
  ) {
    return { verified: false, observations: [] }
  }

  try {
    const descendants = execFileSync(
      'git',
      ['rev-list', '--ancestry-path', '--reverse', `${startCommit}..${endCommit}`],
      {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    )
      .trim()
      .split('\n')
      .filter(Boolean)
    const observations = [startCommit, ...descendants].map((commit) => ({
      commit,
      state: markdownField(
        committedArtifactText(commit, receiptPath),
        'Implementation dispatch',
      ),
    }))
    return {
      verified:
        observations.length > 0 &&
        observations.every(({ state }) => state === 'forbidden'),
      observations,
    }
  } catch {
    return { verified: false, observations: [] }
  }
}

function previousActiveExternalBlockerObservation(observations) {
  const [current, ...history] = observations
  if (current?.status !== 'none') {
    return null
  }
  for (const observation of history) {
    if (observation.status === 'active') {
      return observation
    }
    if (
      observation.status !== 'none' ||
      observation.kind !== current.kind ||
      observation.evidence !== current.evidence
    ) {
      return null
    }
  }
  return null
}

function previousExternalBlockerState(head, receiptPath) {
  if (!fullCommitPattern.test(head ?? '') || !/^docs\/.+/.test(receiptPath ?? '')) {
    return null
  }

  try {
    const commits = execFileSync(
      'git',
      ['log', '--format=%H', head, '--', receiptPath],
      {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    )
      .trim()
      .split('\n')
      .filter(Boolean)
    const observations = commits.map((commit) => {
      const receipt = committedArtifactText(commit, receiptPath)
      return {
        commit,
        status: markdownField(receipt, 'External implementation blocker'),
        kind: markdownField(receipt, 'External blocker kind'),
        evidence: markdownField(receipt, 'External blocker closure evidence'),
      }
    })
    return previousActiveExternalBlockerObservation(observations)
  } catch {
    return null
  }
}

function parseCoordinatorYaml(source) {
  const root = {}
  const stack = [{ indent: -2, value: root }]

  for (const [index, rawLine] of source.split(/\r?\n/).entries()) {
    if (!rawLine.trim() || rawLine.trimStart().startsWith('#')) {
      continue
    }
    if (rawLine.includes('\t')) {
      throw new Error(`line ${index + 1}: tabs are forbidden`)
    }
    const match = rawLine.match(/^(\s*)([A-Za-z_][A-Za-z0-9_-]*):(?:\s+(.*))?$/)
    if (!match) {
      throw new Error(`line ${index + 1}: unsupported YAML syntax`)
    }
    const indent = match[1].length
    if (indent % 2 !== 0) {
      throw new Error(`line ${index + 1}: indentation must use two spaces`)
    }
    while (stack.at(-1).indent >= indent) {
      stack.pop()
    }
    const parent = stack.at(-1)
    if (!parent || indent !== parent.indent + 2) {
      throw new Error(`line ${index + 1}: invalid mapping indentation`)
    }
    const key = match[2]
    if (Object.hasOwn(parent.value, key)) {
      throw new Error(`line ${index + 1}: duplicate key ${key}`)
    }
    const scalar = match[3]
    if (scalar === undefined) {
      parent.value[key] = {}
      stack.push({ indent, value: parent.value[key] })
      continue
    }
    if (scalar === 'true' || scalar === 'false') {
      parent.value[key] = scalar === 'true'
      continue
    }
    if (scalar.startsWith('"') && scalar.endsWith('"')) {
      parent.value[key] = JSON.parse(scalar)
      continue
    }
    throw new Error(`line ${index + 1}: scalar must be quoted or boolean`)
  }

  return root
}

function coordinatorYamlErrors(source) {
  try {
    const parsed = parseCoordinatorYaml(source)
    const errors = []
    for (const field of [
      parsed.interface?.display_name,
      parsed.interface?.short_description,
      parsed.interface?.default_prompt,
    ]) {
      if (typeof field !== 'string' || !field.trim()) {
        errors.push('interface strings must be non-empty')
      }
    }
    if (parsed.policy?.allow_implicit_invocation !== false) {
      errors.push('allow_implicit_invocation must remain false')
    }
    return errors
  } catch (error) {
    return [error.message]
  }
}

function coordinatorSkillErrors(source) {
  const errors = []
  const normalized = compact(source)

  if (frontmatterName(source) !== 'coordinate-eqb-wayfinder') {
    errors.push('frontmatter name must remain coordinate-eqb-wayfinder')
  }
  if (!/^disable-model-invocation:\s*true\s*$/m.test(source)) {
    errors.push('disable-model-invocation must remain true')
  }
  if (!normalized.includes("initiative's repository-read-only coordinator")) {
    errors.push('coordinator must remain repository-read-only')
  }
  if (!normalized.includes('Create exactly one fresh top-level peer')) {
    errors.push('coordinator must create exactly one fresh top-level peer')
  }
  for (const requiredLifecycleText of [
    'record the peer id and exact proposal identity',
    'bind the approval identity to the unchanged peer and proposal',
    'resume that same peer once through the official Codex top-level task messaging mechanism',
    'clean state and no concurrent writer',
    'let the authority select an owner pause or one bounded approval-recording peer under a valid conditional policy',
    'every predicate fact is already proven and no writer overlaps',
    "constrain it to the authority's minimum complete route surface and deterministic commit/binding sequence",
    'Treat any incomplete sequence as non-dispatchable',
    'forbid it from starting implementation',
    'After it returns, preflight the exact bytes, ancestry, route agreement, and writer state again before any later dispatch',
  ]) {
    if (!normalized.includes(requiredLifecycleText)) {
      errors.push(`coordinator lacks guarded same-peer lifecycle: ${requiredLifecycleText}`)
    }
  }
  if (
    !normalized.includes(
      'Do not classify, merge, split, retry, or advance a route independently of `dispatch-protocols.md`',
    )
  ) {
    errors.push('coordinator must not reinterpret the dispatch authority')
  }
  if (
    !normalized.includes('through official Codex top-level task creation') ||
    !normalized.includes(
      'Top-level task creation and that one guarded same-peer message are the only execution mechanisms',
    )
  ) {
    errors.push('official creation and one guarded same-peer message must be the only mechanisms')
  }
  for (const mechanic of [
    'Hook',
    'Runner',
    'daemon',
    'worker',
    'fork',
    'recursive coordinator',
    'successor subagent',
  ]) {
    const escaped = mechanic.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    if (new RegExp(`\\b${escaped}\\b`, 'i').test(source)) {
      errors.push(`thin coordinator mentions forbidden mechanic: ${mechanic}`)
    }
  }
  if (
    /\b(?:create|launch|start)\b[^\n.]{0,80}\b(?:second|another|additional|multiple|parallel|extra|replacement|two)\b[^\n.]{0,40}\b(?:peers?|top-level tasks?|successors?)\b/i.test(
      source,
    ) ||
    /\b(?:a\s+)?(?:second|another|additional|multiple|concurrent|parallel|extra|replacement|two)\s+(?:top-level\s+)?(?:peers?|tasks?|successors?)\b[^\n.]{0,50}\b(?:may be created|is created|is allowed|are allowed|permitted)\b/i.test(
      source,
    )
  ) {
    errors.push('coordinator must not describe an alternate execution topology')
  }
  for (const copiedDetail of [
    '`to-spec`',
    'owner ticket-granularity approval',
    'owner-QA pause',
    'ordinary Standards',
    'independent review',
    'independent lineage',
    'independent fix',
    'focused re-review',
  ]) {
    if (source.includes(copiedDetail)) {
      errors.push(`coordinator must not copy dispatch detail: ${copiedDetail}`)
    }
  }
  if (
    !normalized.includes(
      'Treat `dispatch-protocols.md` as the sole owner of legal transitions, gates, pauses, resumes, and successor routing',
    )
  ) {
    errors.push('coordinator must execute the project dispatch authority')
  }
  if (/gpt-5\.6|`medium`|`high`/.test(source)) {
    errors.push('coordinator must not copy the project model table')
  }

  return errors
}

function coordinatorDispatchAuthorityErrors(source) {
  const normalized = compact(source)
  const errors = []

  if (sourceDigest(source) !== reviewedDispatchDigest) {
    errors.push('dispatch authority bytes differ from the reviewed binding')
  }
  const coordinatorSection =
    source.match(
      /### Owner-started Wayfinder coordinator exception\n([\s\S]*?)(?=\n### )/,
    )?.[1] ?? ''
  const normalizedCoordinatorSection = compact(coordinatorSection)
  if (
    !normalizedCoordinatorSection.includes(
      'repository-read-only and may use only official Codex top-level task tools to create and compactly wait on exactly one fresh peer at a time',
    ) ||
    !normalizedCoordinatorSection.includes(
      'It may not delegate, fork, resume, create another coordinator, or overlap writers, except for the one same-peer `$to-tickets` publication resume defined below',
    ) ||
    !normalized.includes(
      'resume that same exact peer once through the official Codex top-level task messaging mechanism',
    )
  ) {
    errors.push('dispatch authority must own the exact coordinator topology')
  }
  if (
    /\b(?:coordinator|it)\s+(?:may|can|should|must|will)\s+(?!not\b)[^\n.]{0,80}\b(?:delegate|fork|overlap)\b/i.test(normalizedCoordinatorSection) ||
    /\b(?:second|another|additional|multiple|concurrent|parallel|extra|two)\b[^\n.]{0,80}\b(?:peers?|top-level tasks?|successors?|writers?)\b/i.test(
      normalizedCoordinatorSection.replace('another coordinator', ''),
    )
  ) {
    errors.push('dispatch authority contradicts its sole coordinator topology')
  }

  if (
    !source.includes('| `wayfinder` | `to-spec` |') ||
    !source.includes('| `to-spec` | `to-tickets` |')
  ) {
    errors.push('dispatch authority must keep to-spec and to-tickets distinct')
  }
  if (
    !normalized.includes('Coordination pauses at `owner-approval`') ||
    !normalized.includes('It also pauses at `owner-qa`')
  ) {
    errors.push('dispatch authority must own both owner pauses')
  }
  for (const conditionalInvariant of [
    'This approves that predicate, not unknown content',
    'published ticket count, titles, blockers, paper membership, capacity annotations, model routes, parallel lanes, merge order, and downstream obligations equal the approved proposal',
    'every manifest path and digest matches the current ticket bytes',
    'implementation dispatch stayed forbidden throughout evaluation',
    'there is no new relevant verifier failure, malformed evidence, drift, or partial publication',
    'Creating this peer is allowed only after every predicate fact is already proven and no writer overlaps',
    'It must not also start implementation',
    'one bounded approval-recording peer may update only the minimum complete route surface',
    'The approval-route commit writes only the predicate evidence, approval record, and map `Next on PASS`',
    'the exact approval-recording peer identity',
    'The immediately following binding commit writes only the receipt',
    'It must not claim the hash of the commit that contains it',
    'The first commit is a deliberately non-dispatchable intermediate state',
    'the approval-route commit must be the direct parent of the binding commit',
    're-verifies all four implementation gates before any implementation dispatch',
  ]) {
    if (!normalized.includes(conditionalInvariant)) {
      errors.push(`dispatch authority lacks conditional approval invariant: ${conditionalInvariant}`)
    }
  }
  if (
    !normalized.includes(
      'One implementation task keeps implementation, TDD, ordinary Standards + Spec review, ordinary fixes, verification, and commit together',
    ) ||
    !normalized.includes(
      'A fresh peer is used only for a separately required independent review lineage',
    ) ||
    !normalized.includes(
      'a review failure authorizes no automatic retry or refill',
    )
  ) {
    errors.push('dispatch authority must own ordinary and independent review routes')
  }

  return errors
}

function reviewedArtifactBindingErrors(source, expectedDigest, label) {
  return sourceDigest(source) === expectedDigest
    ? []
    : [`${label} bytes differ from the reviewed binding`]
}

function artifactProofErrors(
  proof,
  expectedSkill,
  { requireCurrentDigest = false } = {},
) {
  const errors = []
  const entrySkillValid =
    expectedSkill === null
      ? proof?.entrySkill === 'none' ||
        absoluteSkillPattern.test(proof?.entrySkill ?? '')
      : absoluteSkillPattern.test(proof?.entrySkill ?? '') &&
        proof.entrySkill.endsWith(`/${expectedSkill}/SKILL.md`)

  if (
    proof?.committed !== true ||
    (expectedSkill !== null && proof?.skill !== expectedSkill) ||
    !entrySkillValid ||
    !fullCommitPattern.test(proof?.sourceHead ?? '') ||
    !fullCommitPattern.test(proof?.resultCommit ?? '') ||
    !/^docs\/.+/.test(proof?.artifactPath ?? '') ||
    !sha256Pattern.test(proof?.artifactDigest ?? '')
  ) {
    errors.push(`${expectedSkill} provenance is incomplete or malformed`)
  }
  if (
    sha256Pattern.test(proof?.artifactDigest ?? '') &&
    proof.artifactDigest !== proof.actualArtifactDigest
  ) {
    errors.push(`${expectedSkill} artifact digest is stale or mismatched`)
  }
  if (
    requireCurrentDigest &&
    sha256Pattern.test(proof?.artifactDigest ?? '') &&
    proof.artifactDigest !== proof.currentArtifactDigest
  ) {
    errors.push(`${expectedSkill} current artifact digest is stale or mismatched`)
  }
  return errors
}

function ownerApprovalErrors(approval, ticketManifestDigest) {
  const errors = []

  if (
    approval?.committed !== true ||
    approval?.actor !== 'owner' ||
    approval?.action !== 'approve-ticket-granularity' ||
    !fullCommitPattern.test(approval?.resultCommit ?? '') ||
    !/^docs\/.+/.test(approval?.recordPath ?? '') ||
    !sha256Pattern.test(approval?.ticketManifestDigest ?? '') ||
    approval.ticketManifestDigest !== ticketManifestDigest ||
    approval?.ancestor !== true ||
    approval?.recordExists !== true ||
    approval?.recordedStatus !== 'verified' ||
    approval?.recordedActor !== 'owner' ||
    approval?.recordedAction !== 'approve-ticket-granularity' ||
    approval?.recordedManifestDigest !== approval?.ticketManifestDigest
  ) {
    errors.push('owner ticket-granularity approval is absent or stale')
  }
  return errors
}

const conditionalPredicateClauses = [
  ['proposalIdentityExact', 'proposal task/turn identity changed or is unproven'],
  ['granularityIdentityExact', 'owner granularity-approval identity changed or is unproven'],
  ['proposalEquivalent', 'published ticket semantics differ from the approved proposal'],
  ['ticketBytesMatchManifest', 'manifest paths/digests do not match current ticket bytes'],
  ['acceptedSpecBinding', 'accepted-spec binding is unproven'],
  ['toTicketsProvenance', 'to-tickets provenance is unproven'],
  ['ticketSetBinding', 'ticket-set binding is unproven'],
  ['routeMapReceiptIdentity', 'route/map/receipt identity is unproven'],
  ['cleanExactHead', 'clean exact HEAD is unproven'],
  ['ancestry', 'required ancestry is unproven'],
  ['exclusiveWriter', 'a competing writer exists or exclusivity is unproven'],
  ['implementationForbidden', 'implementation dispatch was not forbidden throughout evaluation'],
  ['noNewRelevantVerifierFailure', 'a new relevant verifier failure exists or is unproven'],
  ['baselineVerifierExceptionsReported', 'baseline verifier exceptions were not reported'],
  ['noMalformedEvidence', 'predicate evidence is malformed or incomplete'],
  ['noDrift', 'publication or authority drift exists or is unproven'],
  ['noPartialPublication', 'publication is partial or completeness is unproven'],
]

function manifestApprovalErrors(approval, ticketManifestDigest) {
  const errors = []
  const mode = approval?.mode
  const expectedAction =
    mode === 'exact-digest'
      ? 'approve-manifest-digest'
      : mode === 'conditional-predicate'
        ? 'apply-conditional-manifest-approval'
        : null
  const sourceIsExact = exactApprovalIdentityPattern.test(
    approval?.sourceIdentity ?? '',
  )

  if (
    approval?.committed !== true ||
    approval?.actor !== 'owner' ||
    approval?.action !== expectedAction ||
    !sourceIsExact ||
    !fullCommitPattern.test(approval?.resultCommit ?? '') ||
    !/^docs\/.+/.test(approval?.recordPath ?? '') ||
    !sha256Pattern.test(approval?.ticketManifestDigest ?? '') ||
    approval.ticketManifestDigest !== ticketManifestDigest ||
    approval?.ancestor !== true ||
    approval?.recordExists !== true ||
    approval?.recordedStatus !== 'verified' ||
    approval?.recordedMode !== mode ||
    approval?.recordedActor !== 'owner' ||
    approval?.recordedAction !== expectedAction ||
    approval?.recordedSourceIdentity !== approval?.sourceIdentity ||
    approval?.recordedManifestDigest !== approval?.ticketManifestDigest ||
    approval?.implementationDispatched !== 'no' ||
    approval?.recordedImplementationDispatched !== 'no'
  ) {
    errors.push('owner manifest approval is absent, stale, or not approval-only')
  }

  if (mode === 'exact-digest') {
    if (
      ![undefined, 'not-applicable'].includes(
        approval?.recordingPeerIdentity,
      ) ||
      ![undefined, 'not-applicable'].includes(
        approval?.recordedRecordingPeerIdentity,
      ) ||
      approval?.predicateEvidencePath !== 'not-applicable' ||
      approval?.predicateEvidenceDigest !== 'not-applicable' ||
      approval?.recordedPredicateEvidencePath !== 'not-applicable' ||
      approval?.recordedPredicateEvidenceDigest !== 'not-applicable'
    ) {
      errors.push('exact-digest approval must not claim conditional predicate evidence')
    }
    return errors
  }

  if (mode !== 'conditional-predicate') {
    errors.push('owner manifest approval mode is missing or unknown')
    return errors
  }

  if (approval?.explicitConditionalAuthorization !== true) {
    errors.push('conditional manifest approval was not explicitly authorized')
  }
  if (
    !exactApprovalIdentityPattern.test(approval?.proposalIdentity ?? '') ||
    !exactApprovalIdentityPattern.test(approval?.granularityIdentity ?? '') ||
    !exactApprovalIdentityPattern.test(approval?.recordingPeerIdentity ?? '') ||
    approval?.recordedProposalIdentity !== approval?.proposalIdentity ||
    approval?.recordedGranularityIdentity !== approval?.granularityIdentity ||
    approval?.recordedRecordingPeerIdentity !== approval?.recordingPeerIdentity
  ) {
    errors.push('conditional manifest approval identities are missing or stale')
  }
  if (
    !/^docs\/.+/.test(approval?.predicateEvidencePath ?? '') ||
    !sha256Pattern.test(approval?.predicateEvidenceDigest ?? '') ||
    approval?.predicateEvidenceDigest !== approval?.actualPredicateEvidenceDigest ||
    approval?.recordedPredicateEvidencePath !== approval?.predicateEvidencePath ||
    approval?.recordedPredicateEvidenceDigest !== approval?.predicateEvidenceDigest
  ) {
    errors.push('conditional manifest approval lacks exact predicate evidence')
  }
  for (const [field, anomaly] of conditionalPredicateClauses) {
    if (approval?.predicate?.[field] !== true) {
      errors.push(`conditional manifest approval anomaly: ${anomaly}`)
    }
  }
  return errors
}

const phaseEntrySkills = new Map([
  ['wayfinder', 'wayfinder'],
  ['to-spec', 'to-spec'],
  ['to-tickets', 'to-tickets'],
  ['implementation', 'implement'],
  ['independent-review', 'code-review'],
  ['independent-fix', 'implement'],
  ['focused-re-review', 'code-review'],
  ['owner-qa', null],
  ['release', null],
])
const phaseLabels = new Map([
  ['wayfinder', 'Wayfinder'],
  ['to-spec', 'To-spec'],
  ['to-tickets', 'To-tickets'],
  ['implementation', 'Implementation'],
  ['independent-review', 'Independent review'],
  ['independent-fix', 'Independent fix'],
  ['focused-re-review', 'Focused re-review'],
  ['owner-qa', 'Owner QA'],
  ['release', 'Release'],
])
const legalPhaseTransitions = new Map([
  ['wayfinder', new Set(['to-spec'])],
  ['to-spec', new Set(['to-tickets'])],
  ['to-tickets', new Set(['owner-approval'])],
  ['owner-approval', new Set(['implementation'])],
  [
    'implementation',
    new Set([
      'implementation',
      'to-tickets',
      'independent-review',
      'owner-qa',
      'release',
    ]),
  ],
  [
    'independent-review',
    new Set(['implementation', 'independent-fix', 'owner-qa', 'release']),
  ],
  ['independent-fix', new Set(['focused-re-review'])],
  [
    'focused-re-review',
    new Set(['implementation', 'independent-fix', 'owner-qa', 'release']),
  ],
  ['owner-qa', new Set(['implementation', 'release'])],
  ['release', new Set(['DONE'])],
  ['DONE', new Set()],
])

function dispatchTableTransitions(source) {
  return new Map(
    [...source.matchAll(/^\| `([^`]+)` \| ([^\n]+) \|$/gm)].map(
      ([, previous, nextCell]) => [
        previous,
        new Set([...nextCell.matchAll(/`([^`]+)`/g)].map((match) => match[1])),
      ],
    ),
  )
}

function transitionMapsEqual(actual, expected) {
  return (
    actual.size === expected.size &&
    [...expected].every(
      ([phase, nextPhases]) =>
        actual.has(phase) &&
        actual.get(phase).size === nextPhases.size &&
        [...nextPhases].every((next) => actual.get(phase).has(next)),
    )
  )
}
const implementationGatePhases = new Set([
  'implementation',
  'independent-review',
  'independent-fix',
  'focused-re-review',
  'owner-qa',
  'release',
  'DONE',
])

function provenanceFromReceipt(source, phase) {
  const label = phaseLabels.get(phase)
  if (!label) {
    return {}
  }
  const resultCommit = markdownField(source, `${label} result commit`)
  const artifactPath = markdownField(source, `${label} artifact`)

  return {
    skill: phaseEntrySkills.get(phase),
    entrySkill: markdownField(source, `${label} entry skill`),
    committed: markdownField(source, `${label} provenance`) === 'verified',
    sourceHead: markdownField(source, `${label} source HEAD`),
    resultCommit,
    artifactPath,
    artifactDigest: markdownField(source, `${label} artifact SHA-256`),
    actualArtifactDigest:
      fullCommitPattern.test(resultCommit ?? '') &&
      /^docs\/.+/.test(artifactPath ?? '')
        ? committedArtifactDigest(resultCommit, artifactPath)
        : '',
    currentArtifactDigest: /^docs\/.+/.test(artifactPath ?? '')
      ? currentArtifactDigest(artifactPath)
      : '',
  }
}

function parsePhaseReceipt(
  source,
  mapSource,
  mapSourcePath,
  head,
  receiptSourcePath,
) {
  const previous = markdownField(source, 'Previous phase')
  const current = markdownField(source, 'Current phase')
  const next = markdownField(source, 'Next on PASS')
  const mapPath = markdownField(source, 'Wayfinder map')
  const bindingCommit = markdownField(source, 'Current map binding commit')
  const bindingArtifact = markdownField(source, 'Current map artifact')
  const bindingDigest = markdownField(source, 'Current map artifact SHA-256')
  const specProvenance = provenanceFromReceipt(source, 'to-spec')
  const ticketsProvenance = provenanceFromReceipt(source, 'to-tickets')
  const acceptedSpecPath = markdownField(source, 'Accepted spec')
  const ticketManifestPath = markdownField(source, 'Ticket-set manifest')
  const approvalResultCommit = markdownField(
    source,
    'Owner approval result commit',
  )
  const approvalRecordPath = markdownField(source, 'Owner approval record')
  const approvalRecordSource =
    fullCommitPattern.test(approvalResultCommit ?? '') &&
    /^docs\/.+/.test(approvalRecordPath ?? '')
      ? committedArtifactText(approvalResultCommit, approvalRecordPath)
      : ''
  const manifestApprovalResultCommit = markdownField(
    source,
    'Owner manifest-digest approval result commit',
  )
  const manifestApprovalRecordPath = markdownField(
    source,
    'Owner manifest-digest approval record',
  )
  const manifestApprovalRecordSource =
    fullCommitPattern.test(manifestApprovalResultCommit ?? '') &&
    /^docs\/.+/.test(manifestApprovalRecordPath ?? '')
      ? committedArtifactText(
          manifestApprovalResultCommit,
          manifestApprovalRecordPath,
        )
      : ''
  const predicateFieldVerified = (field) =>
    markdownField(manifestApprovalRecordSource, field) === 'verified'
  const manifestApprovalMode = markdownField(
    source,
    'Owner manifest-digest approval mode',
  )
  const approvalRecordingPeerIdentity = markdownField(
    source,
    'Owner manifest-digest approval recording peer',
  )
  const recordedApprovalRecordingPeerIdentity = markdownField(
    manifestApprovalRecordSource,
    'Owner manifest-digest approval recording peer',
  )
  const conditionalExclusiveWriter = predicateFieldVerified(
    'Conditional exclusive writer',
  )
  const conditionalImplementationForbidden =
    markdownField(
      manifestApprovalRecordSource,
      'Conditional implementation dispatch during evaluation',
    ) === 'forbidden'
  const recordedImplementationDispatched = markdownField(
    manifestApprovalRecordSource,
    'Implementation dispatched by approval record',
  )
  const approvalBindingCommit =
    fullCommitPattern.test(manifestApprovalResultCommit ?? '') &&
    fullCommitPattern.test(head ?? '')
      ? firstCommitAfterAncestor(manifestApprovalResultCommit, head)
      : ''
  const approvalRouteParent = fullCommitPattern.test(
    manifestApprovalResultCommit ?? '',
  )
    ? commitParent(manifestApprovalResultCommit)
    : ''
  const approvalBindingReceiptSource =
    fullCommitPattern.test(approvalBindingCommit) &&
    /^docs\/.+/.test(receiptSourcePath ?? '')
      ? committedArtifactText(approvalBindingCommit, receiptSourcePath)
      : ''
  const bindingMapPath = markdownField(
    approvalBindingReceiptSource,
    'Wayfinder map',
  )
  const bindingApprovalRecordPath = markdownField(
    approvalBindingReceiptSource,
    'Owner manifest-digest approval record',
  )
  const bindingPredicateEvidencePath = markdownField(
    approvalBindingReceiptSource,
    'Owner manifest-digest approval predicate evidence',
  )
  const bindingApprovalRecordingPeerIdentity = markdownField(
    approvalBindingReceiptSource,
    'Owner manifest-digest approval recording peer',
  )
  const manifestApprovalProposalIdentity = markdownField(
    source,
    'Owner manifest-digest approval proposal identity',
  )
  const manifestApprovalProposalCommit = manifestApprovalProposalIdentity?.match(
    /^result-commit:([0-9a-f]{40})$/,
  )?.[1]
  const dispatchHistory = conditionalDispatchHistory(
    manifestApprovalProposalCommit,
    approvalBindingCommit,
    receiptSourcePath,
  )
  const externalImplementationBlocker = markdownField(
    source,
    'External implementation blocker',
  )
  const externalBlockerKind = markdownField(source, 'External blocker kind')
  const externalBlockerClosureEvidence = markdownField(
    source,
    'External blocker closure evidence',
  )
  const approvalSequence =
    manifestApprovalMode === 'conditional-predicate'
      ? {
          writerCount: conditionalExclusiveWriter ? 1 : 0,
          exclusiveWriter: conditionalExclusiveWriter,
          samePeer:
            exactApprovalIdentityPattern.test(
              bindingApprovalRecordingPeerIdentity ?? '',
            ) &&
            bindingApprovalRecordingPeerIdentity ===
              recordedApprovalRecordingPeerIdentity,
          predicateEvidencePath: bindingPredicateEvidencePath,
          approvalRecordPath: bindingApprovalRecordPath,
          mapPath: bindingMapPath,
          receiptPath: receiptSourcePath,
          approvalRouteChangedPaths: fullCommitPattern.test(
            manifestApprovalResultCommit ?? '',
          )
            ? commitChangedPaths(manifestApprovalResultCommit)
            : [],
          bindingChangedPaths: fullCommitPattern.test(approvalBindingCommit)
            ? commitChangedPaths(approvalBindingCommit)
            : [],
          approvalRouteCommit: manifestApprovalResultCommit,
          bindingCommit: approvalBindingCommit,
          bindingParent: fullCommitPattern.test(approvalBindingCommit)
            ? commitParent(approvalBindingCommit)
            : '',
          approvalRouteAncestorOfBinding:
            fullCommitPattern.test(manifestApprovalResultCommit ?? '') &&
            fullCommitPattern.test(approvalBindingCommit) &&
            commitIsAncestor(
              manifestApprovalResultCommit,
              approvalBindingCommit,
            ),
          bindingIsCurrentHeadOrAncestor:
            fullCommitPattern.test(approvalBindingCommit) &&
            fullCommitPattern.test(head ?? '') &&
            commitIsAncestor(approvalBindingCommit, head) &&
            head === currentGitHead(),
          approvalRecordClaimsContainingCommit:
            markdownField(
              manifestApprovalRecordSource,
              'Owner manifest-digest approval result commit',
            ) === manifestApprovalResultCommit,
          receiptApprovalResultCommit: markdownField(
            approvalBindingReceiptSource,
            'Owner manifest-digest approval result commit',
          ),
          mapNext: markdownField(
            committedArtifactText(
              manifestApprovalResultCommit,
              bindingMapPath,
            ),
            'Next on PASS',
          ),
          mapOnlyRouteFieldChanged:
            fullCommitPattern.test(approvalRouteParent) &&
            fullCommitPattern.test(manifestApprovalResultCommit ?? '') &&
            /^docs\/.+/.test(bindingMapPath ?? '') &&
            onlyMarkdownFieldChanged(
              committedArtifactText(approvalRouteParent, bindingMapPath),
              committedArtifactText(
                manifestApprovalResultCommit,
                bindingMapPath,
              ),
              'Next on PASS',
              'owner-approval',
              'implementation',
            ),
          receiptCurrent: markdownField(
            approvalBindingReceiptSource,
            'Current phase',
          ),
          receiptNext: markdownField(
            approvalBindingReceiptSource,
            'Next on PASS',
          ),
          receiptMapBindingCommit: markdownField(
            approvalBindingReceiptSource,
            'Current map binding commit',
          ),
          receiptMapBindingPath: markdownField(
            approvalBindingReceiptSource,
            'Current map artifact',
          ),
          receiptMapBindingDigest: markdownField(
            approvalBindingReceiptSource,
            'Current map artifact SHA-256',
          ),
          mapDigestAtApprovalRouteCommit:
            fullCommitPattern.test(manifestApprovalResultCommit ?? '') &&
            /^docs\/.+/.test(bindingMapPath ?? '')
              ? committedArtifactDigest(
                  manifestApprovalResultCommit,
                  bindingMapPath,
                )
              : '',
          currentMapDigest:
            fullCommitPattern.test(approvalBindingCommit) &&
            /^docs\/.+/.test(bindingMapPath ?? '')
              ? committedArtifactDigest(
                  approvalBindingCommit,
                  bindingMapPath,
                )
            : '',
          dispatchHistoryVerified: dispatchHistory.verified,
          dispatchHistoryObservations: dispatchHistory.observations,
          implementationDispatchedBeforeBinding: !(
            recordedImplementationDispatched === 'no' &&
            conditionalImplementationForbidden
          ),
          cleanAfterBinding: worktreeIsClean(),
          allImplementationGatesVerified:
            markdownField(
              approvalBindingReceiptSource,
              'Canonical authority gates',
            ) === 'verified' ||
            markdownField(
              approvalBindingReceiptSource,
              'Implementation dispatch',
            ) === 'allowed',
        }
      : null

  return {
    previous,
    current,
    next,
    terminal: markdownField(source, 'Terminal') === 'yes',
    implementationDispatch: markdownField(source, 'Implementation dispatch'),
    canonicalAuthorityGates: markdownField(
      source,
      'Canonical authority gates',
    ),
    externalImplementationBlocker,
    externalBlockerKind,
    externalBlockerClosureEvidence,
    externalBlockerClosure: parseExternalBlockerClosureEvidence(
      externalBlockerClosureEvidence,
      externalBlockerKind,
      head,
    ),
    previousExternalBlocker: previousExternalBlockerState(
      head,
      receiptSourcePath,
    ),
    mapStatus: markdownField(mapSource, 'Status'),
    mapNext: markdownField(mapSource, 'Next on PASS'),
    binding: {
      verified: markdownField(source, 'Current map binding') === 'verified',
      mapPath,
      sourceArtifactPath: mapSourcePath,
      commit: bindingCommit,
      artifactPath: bindingArtifact,
      artifactDigest: bindingDigest,
      ancestor:
        fullCommitPattern.test(bindingCommit ?? '') &&
        fullCommitPattern.test(head ?? '') &&
        commitIsAncestor(bindingCommit, head),
      committedArtifactDigest:
        fullCommitPattern.test(bindingCommit ?? '') &&
        /^docs\/.+/.test(bindingArtifact ?? '')
          ? committedArtifactDigest(bindingCommit, bindingArtifact)
          : '',
      currentArtifactDigest: /^docs\/.+/.test(bindingArtifact ?? '')
        ? currentArtifactDigest(bindingArtifact)
        : '',
    },
    provenance: new Map(
      [...phaseEntrySkills.keys()].map((phase) => [
        phase,
        provenanceFromReceipt(source, phase),
      ]),
    ),
    outcomes: new Map(
      [...phaseLabels].map(([phase, label]) => [
        phase,
        markdownField(source, `${label} outcome`),
      ]),
    ),
    spec: {
      accepted:
        /^docs\/.+/.test(acceptedSpecPath ?? '') &&
        markdownField(source, 'Accepted spec SHA-256') !== 'pending',
      path: acceptedSpecPath,
      digest: markdownField(source, 'Accepted spec SHA-256'),
      currentArtifactDigest: /^docs\/.+/.test(acceptedSpecPath ?? '')
        ? currentArtifactDigest(acceptedSpecPath)
        : '',
      provenance: specProvenance,
    },
    tickets: {
      bindingVerified: markdownField(source, 'Ticket-set binding') === 'verified',
      manifestPath: ticketManifestPath,
      manifestDigest: markdownField(source, 'Ticket-set manifest SHA-256'),
      currentArtifactDigest: /^docs\/.+/.test(ticketManifestPath ?? '')
        ? currentArtifactDigest(ticketManifestPath)
        : '',
      boundSpecDigest: markdownField(
        source,
        'Ticket-set accepted-spec SHA-256',
      ),
      provenance: ticketsProvenance,
    },
    approval: {
      committed:
        markdownField(source, 'Owner ticket-granularity approval') ===
        'verified',
      actor: markdownField(source, 'Owner approval actor'),
      action: markdownField(source, 'Owner approval action'),
      resultCommit: approvalResultCommit,
      recordPath: approvalRecordPath,
      ticketManifestDigest: markdownField(
        source,
        'Owner approval ticket-set manifest SHA-256',
      ),
      ancestor:
        fullCommitPattern.test(approvalResultCommit ?? '') &&
        fullCommitPattern.test(head ?? '') &&
        commitIsAncestor(approvalResultCommit, head),
      recordExists: Boolean(approvalRecordSource),
      recordedStatus: markdownField(
        approvalRecordSource,
        'Owner ticket-granularity approval',
      ),
      recordedActor: markdownField(approvalRecordSource, 'Owner approval actor'),
      recordedAction: markdownField(
        approvalRecordSource,
        'Owner approval action',
      ),
      recordedManifestDigest: markdownField(
        approvalRecordSource,
        'Owner approval ticket-set manifest SHA-256',
      ),
    },
    manifestApproval: {
      committed:
        markdownField(source, 'Owner manifest-digest approval') === 'verified',
      mode: manifestApprovalMode,
      actor: markdownField(source, 'Owner manifest-digest approval actor'),
      action: markdownField(source, 'Owner manifest-digest approval action'),
      sourceIdentity: markdownField(
        source,
        'Owner manifest-digest approval source',
      ),
      proposalIdentity: manifestApprovalProposalIdentity,
      granularityIdentity: markdownField(
        source,
        'Owner manifest-digest approval granularity identity',
      ),
      recordingPeerIdentity: approvalRecordingPeerIdentity,
      explicitConditionalAuthorization:
        markdownField(
          manifestApprovalRecordSource,
          'Conditional manifest authorization',
        ) === 'explicit',
      predicateEvidencePath: markdownField(
        source,
        'Owner manifest-digest approval predicate evidence',
      ),
      predicateEvidenceDigest: markdownField(
        source,
        'Owner manifest-digest approval predicate evidence SHA-256',
      ),
      actualPredicateEvidenceDigest:
        fullCommitPattern.test(manifestApprovalResultCommit ?? '') &&
        /^docs\/.+/.test(
          markdownField(
            source,
            'Owner manifest-digest approval predicate evidence',
          ) ?? '',
        )
          ? committedArtifactDigest(
              manifestApprovalResultCommit,
              markdownField(
                source,
                'Owner manifest-digest approval predicate evidence',
              ),
            )
          : '',
      resultCommit: manifestApprovalResultCommit,
      recordPath: manifestApprovalRecordPath,
      ticketManifestDigest: markdownField(
        source,
        'Owner manifest-digest approval ticket-set manifest SHA-256',
      ),
      ancestor:
        fullCommitPattern.test(manifestApprovalResultCommit ?? '') &&
        fullCommitPattern.test(head ?? '') &&
        commitIsAncestor(manifestApprovalResultCommit, head),
      recordExists: Boolean(manifestApprovalRecordSource),
      recordedStatus: markdownField(
        manifestApprovalRecordSource,
        'Owner manifest-digest approval',
      ),
      recordedMode: markdownField(
        manifestApprovalRecordSource,
        'Owner manifest-digest approval mode',
      ),
      recordedActor: markdownField(
        manifestApprovalRecordSource,
        'Owner manifest-digest approval actor',
      ),
      recordedAction: markdownField(
        manifestApprovalRecordSource,
        'Owner manifest-digest approval action',
      ),
      recordedSourceIdentity: markdownField(
        manifestApprovalRecordSource,
        'Owner manifest-digest approval source',
      ),
      recordedProposalIdentity: markdownField(
        manifestApprovalRecordSource,
        'Owner manifest-digest approval proposal identity',
      ),
      recordedGranularityIdentity: markdownField(
        manifestApprovalRecordSource,
        'Owner manifest-digest approval granularity identity',
      ),
      recordedRecordingPeerIdentity:
        recordedApprovalRecordingPeerIdentity,
      recordedPredicateEvidencePath: markdownField(
        manifestApprovalRecordSource,
        'Owner manifest-digest approval predicate evidence',
      ),
      recordedPredicateEvidenceDigest: markdownField(
        manifestApprovalRecordSource,
        'Owner manifest-digest approval predicate evidence SHA-256',
      ),
      recordedManifestDigest: markdownField(
        manifestApprovalRecordSource,
        'Owner manifest-digest approval ticket-set manifest SHA-256',
      ),
      implementationDispatched: markdownField(
        source,
        'Implementation dispatched by approval record',
      ),
      recordedImplementationDispatched,
      predicate: {
        proposalIdentityExact: predicateFieldVerified(
          'Conditional proposal identity exact',
        ),
        granularityIdentityExact: predicateFieldVerified(
          'Conditional granularity identity exact',
        ),
        proposalEquivalent: predicateFieldVerified(
          'Conditional proposal equivalence',
        ),
        ticketBytesMatchManifest: predicateFieldVerified(
          'Conditional ticket bytes match manifest',
        ),
        acceptedSpecBinding: predicateFieldVerified(
          'Conditional accepted-spec binding',
        ),
        toTicketsProvenance: predicateFieldVerified(
          'Conditional to-tickets provenance',
        ),
        ticketSetBinding: predicateFieldVerified(
          'Conditional ticket-set binding',
        ),
        routeMapReceiptIdentity: predicateFieldVerified(
          'Conditional route/map/receipt identity',
        ),
        cleanExactHead: predicateFieldVerified('Conditional clean exact HEAD'),
        ancestry: predicateFieldVerified('Conditional ancestry'),
        exclusiveWriter: predicateFieldVerified('Conditional exclusive writer'),
        implementationForbidden:
          markdownField(
            manifestApprovalRecordSource,
            'Conditional implementation dispatch during evaluation',
          ) === 'forbidden',
        noNewRelevantVerifierFailure: predicateFieldVerified(
          'Conditional no new relevant verifier failure',
        ),
        baselineVerifierExceptionsReported: /^(?:none|documented:.+)$/i.test(
          markdownField(
            manifestApprovalRecordSource,
            'Conditional baseline verifier exceptions',
          ) ?? '',
        ),
        noMalformedEvidence: predicateFieldVerified(
          'Conditional no malformed evidence',
        ),
        noDrift: predicateFieldVerified('Conditional no drift'),
        noPartialPublication: predicateFieldVerified(
          'Conditional no partial publication',
        ),
      },
    },
    approvalSequence,
  }
}

function currentMapBindingErrors(binding) {
  const errors = []
  if (
    binding?.verified !== true ||
    !/^docs\/.+/.test(binding?.mapPath ?? '') ||
    !/^docs\/.+/.test(binding?.sourceArtifactPath ?? '') ||
    !fullCommitPattern.test(binding?.commit ?? '') ||
    !/^docs\/.+/.test(binding?.artifactPath ?? '') ||
    !sha256Pattern.test(binding?.artifactDigest ?? '')
  ) {
    errors.push('current map route binding is incomplete or malformed')
    return errors
  }
  if (
    binding.artifactPath !== binding.mapPath ||
    binding.artifactPath !== binding.sourceArtifactPath
  ) {
    errors.push('current map route binding targets a different artifact')
  }
  if (!binding.ancestor) {
    errors.push('current map binding commit is not an ancestor of HEAD')
  }
  if (binding.artifactDigest !== binding.committedArtifactDigest) {
    errors.push('current map binding does not match the artifact at its commit')
  }
  if (binding.artifactDigest !== binding.currentArtifactDigest) {
    errors.push('current map binding is stale or mismatched with current bytes')
  }
  return errors
}

function samePathSet(actual = [], expected = []) {
  return (
    actual.length === expected.length &&
    [...new Set(actual)].length === actual.length &&
    expected.every((path) => actual.includes(path))
  )
}

function conditionalApprovalWriteSequenceErrors(sequence) {
  const errors = []
  const approvalRouteSurface = [
    sequence?.predicateEvidencePath,
    sequence?.approvalRecordPath,
    sequence?.mapPath,
  ]
  const bindingSurface = [sequence?.receiptPath]

  if (
    sequence?.writerCount !== 1 ||
    sequence?.exclusiveWriter !== true ||
    sequence?.samePeer !== true
  ) {
    errors.push('conditional approval sequence requires one exclusive peer')
  }
  if (
    !samePathSet(sequence?.approvalRouteChangedPaths, approvalRouteSurface) ||
    !samePathSet(sequence?.bindingChangedPaths, bindingSurface)
  ) {
    errors.push('conditional approval sequence exceeds its minimum route surface')
  }
  if (
    !fullCommitPattern.test(sequence?.approvalRouteCommit ?? '') ||
    !fullCommitPattern.test(sequence?.bindingCommit ?? '') ||
    sequence?.bindingParent !== sequence?.approvalRouteCommit ||
    sequence?.approvalRouteCommit === sequence?.bindingCommit ||
    sequence?.approvalRouteAncestorOfBinding !== true ||
    sequence?.bindingIsCurrentHeadOrAncestor !== true
  ) {
    errors.push('conditional approval binding commit must directly follow its approval-route commit')
  }
  if (
    sequence?.approvalRecordClaimsContainingCommit !== false ||
    sequence?.receiptApprovalResultCommit !== sequence?.approvalRouteCommit
  ) {
    errors.push('conditional approval must not require a commit to claim its own hash')
  }
  if (
    sequence?.mapNext !== 'implementation' ||
    sequence?.receiptCurrent !== 'implementation' ||
    sequence?.receiptNext !== 'implementation'
  ) {
    errors.push('conditional approval route fields must agree on implementation')
  }
  if (sequence?.mapOnlyRouteFieldChanged !== true) {
    errors.push('conditional approval map may change only Next on PASS to implementation')
  }
  if (
    sequence?.receiptMapBindingCommit !== sequence?.approvalRouteCommit ||
    sequence?.receiptMapBindingPath !== sequence?.mapPath ||
    !sha256Pattern.test(sequence?.receiptMapBindingDigest ?? '') ||
    sequence?.receiptMapBindingDigest !== sequence?.mapDigestAtApprovalRouteCommit ||
    sequence?.receiptMapBindingDigest !== sequence?.currentMapDigest
  ) {
    errors.push('conditional approval receipt must bind exact current map bytes at the approval-route commit')
  }
  if (
    sequence?.implementationDispatchedBeforeBinding !== false ||
    sequence?.cleanAfterBinding !== true ||
    sequence?.allImplementationGatesVerified !== true
  ) {
    errors.push('conditional approval remains non-dispatchable until clean binding and all gates pass')
  }
  if (sequence?.dispatchHistoryVerified !== true) {
    errors.push('conditional approval history contains a non-forbidden or unproven dispatch state')
  }
  return errors
}

function externalBlockerErrors(state) {
  const {
    externalImplementationBlocker: status,
    externalBlockerKind: kind,
    externalBlockerClosureEvidence: evidence,
    externalBlockerClosure: closure,
    previousExternalBlocker,
  } = state
  const errors = []
  const groupAbsent = [status, kind, evidence].every((value) => value === undefined)

  if (groupAbsent) {
    return errors
  }
  if (![status, kind, evidence].every((value) => value !== undefined)) {
    errors.push('External implementation blocker field group is incomplete')
    return errors
  }
  if (!['active', 'none'].includes(status)) {
    errors.push('External implementation blocker is malformed')
  }
  if (!externalBlockerKindIsValid(kind)) {
    errors.push('External blocker kind is missing or malformed')
  }
  if (status === 'active' && evidence !== 'pending') {
    errors.push('Active external blocker requires pending closure evidence')
  }
  if (status === 'none') {
    if (evidence === 'pending') {
      errors.push('External blocker cannot close with pending evidence')
    }
    if (
      closure?.formatValid !== true ||
      closure?.ancestor !== true ||
      closure?.artifactExists !== true ||
      !['done', 'closed'].includes(closure?.artifactStatus) ||
      closure?.artifactKind !== kind
    ) {
      errors.push('External blocker closure evidence is not durable, resolvable, and consistent')
    }
    if (
      previousExternalBlocker?.status !== 'active' ||
      previousExternalBlocker?.kind !== kind ||
      previousExternalBlocker?.evidence !== 'pending'
    ) {
      errors.push('External blocker closure does not match the prior committed blocker identity')
    }
  }
  return errors
}

function phaseTransitionErrors(state) {
  const errors = []
  const {
    previous,
    current,
    next,
    terminal,
    implementationDispatch,
    canonicalAuthorityGates,
    externalImplementationBlocker,
    externalBlockerKind,
    externalBlockerClosureEvidence,
    externalBlockerClosure,
    previousExternalBlocker,
    provenance,
    outcomes,
    spec,
    tickets,
    approval,
    manifestApproval,
    approvalSequence,
    measuredReplanAuthorized,
  } = state
  const approvalSequenceErrors =
    manifestApproval?.mode === 'conditional-predicate'
      ? conditionalApprovalWriteSequenceErrors(approvalSequence)
      : []

  errors.push(...approvalSequenceErrors)
  const externalBlockerStateErrors = externalBlockerErrors({
    externalImplementationBlocker,
    externalBlockerKind,
    externalBlockerClosureEvidence,
    externalBlockerClosure,
    previousExternalBlocker,
  })
  errors.push(...externalBlockerStateErrors)

  if (!legalPhaseTransitions.has(previous)) {
    errors.push(`unknown previous phase route kind: ${previous}`)
  }
  if (!legalPhaseTransitions.has(current)) {
    errors.push(`unknown current phase route kind: ${current}`)
  }
  if (current !== next) {
    errors.push('current phase and Next on PASS disagree')
  }
  if (
    legalPhaseTransitions.has(previous) &&
    legalPhaseTransitions.has(current) &&
    !legalPhaseTransitions.get(previous).has(current)
  ) {
    errors.push(`illegal phase transition: ${previous} -> ${current}`)
  }
  if (
    previous === 'implementation' &&
    current === 'to-tickets' &&
    measuredReplanAuthorized !== true
  ) {
    errors.push('implementation re-entry to to-tickets lacks guarded measured-replan authorization')
  }
  if ((current === 'DONE') !== terminal) {
    errors.push('Terminal must be yes only for DONE')
  }

  if (previous === 'owner-approval') {
    errors.push(...ownerApprovalErrors(approval, tickets.manifestDigest))
    errors.push(
      ...manifestApprovalErrors(manifestApproval, tickets.manifestDigest),
    )
  } else if (previous !== 'DONE' && phaseEntrySkills.has(previous)) {
    errors.push(
      ...artifactProofErrors(
        provenance.get(previous),
        phaseEntrySkills.get(previous),
      ),
    )
  }

  const specProofErrors = artifactProofErrors(spec.provenance, 'to-spec', {
    requireCurrentDigest: true,
  })
  const ticketsProofErrors = artifactProofErrors(
    tickets.provenance,
    'to-tickets',
    { requireCurrentDigest: true },
  )
  const specProven =
    spec.accepted === true &&
    specProofErrors.length === 0 &&
    spec.digest === spec.provenance.artifactDigest &&
    spec.digest === spec.currentArtifactDigest
  const ticketsProven =
    tickets.bindingVerified === true &&
    ticketsProofErrors.length === 0 &&
    tickets.manifestDigest === tickets.provenance.artifactDigest &&
    tickets.manifestDigest === tickets.currentArtifactDigest
  const ticketsBound =
    specProven &&
    ticketsProven &&
    tickets.boundSpecDigest === spec.digest
  const approvalBound =
    ownerApprovalErrors(approval, tickets.manifestDigest).length === 0
  const manifestApprovalBound =
    manifestApprovalErrors(manifestApproval, tickets.manifestDigest).length ===
      0 && approvalSequenceErrors.length === 0

  if (
    ['to-tickets', 'owner-approval'].includes(current) ||
    implementationGatePhases.has(current)
  ) {
    if (!specProven) {
      errors.push('current accepted spec lacks verified to-spec provenance')
    }
  }
  if (current === 'owner-approval' || implementationGatePhases.has(current)) {
    if (!ticketsProven) {
      errors.push('current ticket set lacks verified to-tickets provenance')
    }
    if (!ticketsBound) {
      errors.push('current ticket set is not bound to the accepted spec')
    }
  }
  if (implementationGatePhases.has(current) && !approvalBound) {
    errors.push('owner ticket-granularity approval is absent or stale')
  }
  if (implementationGatePhases.has(current) && !manifestApprovalBound) {
    errors.push('owner manifest approval is absent or stale')
  }

  const implementationAllowed =
    specProven &&
    ticketsProven &&
    ticketsBound &&
    approvalBound &&
    manifestApprovalBound
  const externalBlockerDeclared = externalImplementationBlocker !== undefined
  const externalBlockerClosed =
    externalImplementationBlocker === 'none' &&
    externalBlockerStateErrors.length === 0
  const externalBlockerActive =
    externalBlockerDeclared && !externalBlockerClosed
  if (
    externalBlockerActive &&
    implementationAllowed &&
    canonicalAuthorityGates !== 'verified'
  ) {
    errors.push('External blocker must not obscure the four canonical authority gates')
  }
  if (
    implementationDispatch !==
    (implementationAllowed && !externalBlockerActive ? 'allowed' : 'forbidden')
  ) {
    errors.push('Implementation dispatch does not match the four gates and external blocker')
  }

  if (['independent-review', 'focused-re-review'].includes(previous)) {
    const outcome = outcomes.get(previous)
    if (current === 'independent-fix' && outcome !== 'failed') {
      errors.push('independent fix requires a canonical failed review result')
    }
    if (current !== 'independent-fix' && outcome !== 'passed') {
      errors.push('review may advance only from a canonical PASS result')
    }
  }
  if (previous === 'owner-qa' && outcomes.get(previous) !== 'accepted') {
    errors.push('owner QA may advance only after recorded owner-QA acceptance')
  }
  if (previous === 'release' && outcomes.get(previous) !== 'complete') {
    errors.push('DONE requires complete release provenance')
  }

  return errors
}

function phaseReceiptErrors(state) {
  const errors = [
    ...currentMapBindingErrors(state.binding),
    ...phaseTransitionErrors(state),
  ]
  if (state.mapStatus !== 'done') {
    errors.push('current Wayfinder map status must be done')
  }
  if (state.mapNext !== state.current || state.mapNext !== state.next) {
    errors.push('map route, current phase, and receipt Next on PASS disagree')
  }
  return errors
}

function markdownFilesUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      return markdownFilesUnder(path)
    }
    return entry.isFile() && entry.name.endsWith('.md') ? [path] : []
  })
}

const newTaskFields = [
  'Worktree:',
  'Branch:',
  'Expected HEAD:',
  'Spec:',
  'Ticket:',
  'Fixed point:',
  'Model:',
  'Effort:',
  'Prompt:',
]
const humanQaFields = [
  'QA Ready: yes',
  'Worktree:',
  'Branch:',
  'HEAD:',
  'Spec:',
  'Ticket:',
  'Fixed point:',
  'Opened:',
  'URL:',
  'Initial state:',
  'Checklist:',
]
const fullNewTaskBlocks = (source) =>
  fencedBlocks(source).filter((block) =>
    newTaskFields.every((field) => lineIndex(block, field) >= 0),
  )

section('deterministic completion exits')

const successorRoute = {
  terminal: false,
  currentTaskComplete: true,
  initiativeClosed: false,
  ownerQaPending: false,
  nextOnPass: 'docs/cuts/example/tickets/TICKET-02.md',
}
const exitErrors = (exit) => completionExitErrors({ ...successorRoute, exit })

assert(
  exitErrors({ kind: 'done' }).some((error) =>
    error.includes('DONE requires a closed initiative'),
  ),
  'non-terminal ticket rejects DONE',
)
assert(
  exitErrors({ kind: 'same-task' }).some((error) =>
    error.includes('completed ticket requires its successor handoff'),
  ),
  'completed non-terminal ticket rejects same-task owner wait',
)
assert(
  exitErrors({
    kind: 'new-task',
    target: successorRoute.nextOnPass,
  }).length === 0,
  'completed non-terminal ticket accepts the declared successor handoff',
)
assert(
  exitErrors({ kind: 'owner-qa' }).some((error) =>
    error.includes('only legal exit is new-task'),
  ),
  'completed non-terminal ticket rejects owner-QA handoff',
)
assert(
  exitErrors({ kind: 'unexpected' }).some((error) =>
    error.includes('unknown completion exit'),
  ),
  'completion exits are closed to the declared four kinds',
)
for (const exit of [
  { kind: 'new-task', target: successorRoute.nextOnPass },
  { kind: 'owner-qa' },
  { kind: 'done' },
]) {
  assert(
    completionExitErrors({
      ...successorRoute,
      currentTaskComplete: false,
      exit,
    }).some((error) => error.includes('only legal exit is same-task')),
    `unfinished current ticket rejects ${exit.kind}`,
  )
}
assert(
  completionExitErrors({
    ...successorRoute,
    currentTaskComplete: false,
    exit: { kind: 'same-task' },
  }).length === 0,
  'unfinished current ticket accepts same-task',
)
const ownerQaRoute = {
  terminal: false,
  currentTaskComplete: true,
  initiativeClosed: false,
  ownerQaPending: true,
  nextOnPass: 'owner QA',
}
for (const exit of [
  { kind: 'same-task' },
  { kind: 'new-task', target: ownerQaRoute.nextOnPass },
  { kind: 'done' },
]) {
  assert(
    completionExitErrors({ ...ownerQaRoute, exit }).some((error) =>
      error.includes('only legal exit is owner-qa'),
    ),
    `owner-QA pending rejects ${exit.kind}`,
  )
}
assert(
  completionExitErrors({
    ...ownerQaRoute,
    exit: { kind: 'owner-qa' },
  }).length === 0,
  'owner-QA pending accepts owner-QA handoff',
)
assert(
  completionExitErrors({
    ...ownerQaRoute,
    currentTaskComplete: false,
    exit: { kind: 'same-task' },
  }).some((error) =>
    error.includes('owner QA cannot be pending before the current task completes'),
  ),
  'owner-QA pending rejects an unfinished current ticket state',
)
assert(
  completionExitErrors({
    ...ownerQaRoute,
    nextOnPass: successorRoute.nextOnPass,
    exit: { kind: 'owner-qa' },
  }).some((error) =>
    error.includes('owner-QA pending requires Next on PASS: owner QA'),
  ),
  'owner-QA pending rejects a ticket-successor route',
)
assert(
  completionExitErrors({
    ...successorRoute,
    nextOnPass: ownerQaRoute.nextOnPass,
    exit: { kind: 'new-task', target: ownerQaRoute.nextOnPass },
  }).some((error) =>
    error.includes('Next on PASS: owner QA requires owner-QA pending'),
  ),
  'owner-QA route rejects a non-pending owner-QA state',
)
const closedRoute = {
  terminal: true,
  currentTaskComplete: true,
  initiativeClosed: true,
  ownerQaPending: false,
  nextOnPass: 'DONE',
}
for (const exit of [
  { kind: 'same-task' },
  { kind: 'new-task', target: 'DONE' },
  { kind: 'owner-qa' },
]) {
  assert(
    completionExitErrors({ ...closedRoute, exit }).some((error) =>
      error.includes('only legal exit is done'),
    ),
    `closed initiative rejects ${exit.kind}`,
  )
}
assert(
  completionExitErrors({
    ...closedRoute,
    exit: { kind: 'done' },
  }).length === 0,
  'closed initiative accepts DONE',
)
assert(
  completionExitErrors({
    ...closedRoute,
    ownerQaPending: true,
    exit: { kind: 'done' },
  }).some((error) =>
    error.includes('closed initiative cannot also be waiting for owner QA'),
  ),
  'closed initiative rejects an owner-QA pending state',
)
assert(
  completionExitErrors({
    ...closedRoute,
    currentTaskComplete: false,
    exit: { kind: 'same-task' },
  }).some((error) =>
    error.includes('closed initiative requires a completed current task'),
  ),
  'closed initiative rejects an unfinished current ticket state',
)
assert(
  completionExitErrors({
    ...closedRoute,
    terminal: false,
    nextOnPass: successorRoute.nextOnPass,
    exit: { kind: 'done' },
  }).some((error) =>
    error.includes('closed initiative requires Terminal: yes and Next on PASS: DONE'),
  ),
  'closed initiative rejects a non-terminal ticket-successor route',
)
assert(
  completionExitErrors({
    ...closedRoute,
    initiativeClosed: false,
    exit: { kind: 'new-task', target: 'DONE' },
  }).some((error) =>
    error.includes('Next on PASS: DONE requires a closed initiative'),
  ),
  'completed DONE route rejects an open initiative state',
)
assert(
  completionExitErrors({
    terminal: false,
    currentTaskComplete: true,
    initiativeClosed: false,
    nextOnPass: '',
    exit: { kind: 'new-task', target: '' },
  }).some((error) => error.includes('Terminal: no requires Next on PASS')),
  'Terminal: no ticket requires a non-empty Next on PASS',
)
assert(
  completionExitErrors({
    terminal: true,
    currentTaskComplete: true,
    initiativeClosed: false,
    nextOnPass: '',
    exit: { kind: 'new-task', target: '' },
  }).some((error) => error.includes('completed ticket requires Next on PASS')),
  'Terminal: yes open initiative requires a non-empty Next on PASS',
)
assert(
  completionExitErrors({
    ...successorRoute,
    terminal: true,
    exit: {
      kind: 'new-task',
      target: 'docs/cuts/example/tickets/TICKET-03.md',
    },
  }).some((error) =>
    error.includes('successor handoff must match Next on PASS'),
  ),
  'Terminal: yes open initiative rejects a mismatched successor handoff',
)
assert(
  ticketRouteErrors('Terminal: no\n').some((error) =>
    error.includes('Next on PASS'),
  ),
  'tracked Terminal: no ticket text rejects a missing Next on PASS',
)
assert(
  ticketRouteErrors(
    'Terminal: no\nNext on PASS: docs/cuts/example/tickets/02.md\n',
  ).length === 0,
  'ordinary serial tickets omit both parallel matched-route fields',
)
assert(
  ticketRouteErrors(
    'Terminal: no\nNext on PASS: docs/cuts/example/tickets/02.md\nParallel frontier: not-applicable\nParallel join: not-applicable\n',
  ).some((error) => error.includes('ordinary serial routes')),
  'ordinary serial tickets reject parallel placeholder fields',
)
assert(
  ticketRouteErrors(
    'Terminal: no\nNext on PASS: parallel frontier handoff\nParallel frontier: docs/cuts/example/tickets/02.md, docs/cuts/example/tickets/03.md\nParallel join: not-applicable\n',
  ).length === 0,
  'parallel-frontier tickets require the matched deterministic field pair',
)
assert(
  ticketRouteErrors(
    'Terminal: no\nNext on PASS: parallel join handoff\nParallel frontier: not-applicable\nParallel join: docs/cuts/example/tickets/04.md\n',
  ).length === 0,
  'parallel-join tickets require the matched deterministic field pair',
)
assert(
  ticketRouteErrors(
    'Terminal: no\nNext on PASS: parallel join handoff\nParallel join: docs/cuts/example/tickets/04.md\n',
  ).some((error) => error.includes('both matched-route fields')),
  'parallel routes reject an incomplete matched-route field pair',
)
const trackedTicketRouteErrors = markdownFilesUnder(resolve(ROOT, 'docs/cuts'))
  .flatMap((path) =>
    ticketRouteErrors(readFileSync(path, 'utf8')).map(
      (error) => `${relative(ROOT, path)}: ${error}`,
    ),
  )
assert(
  trackedTicketRouteErrors.length === 0,
  `tracked Terminal: no tickets declare Next on PASS${
    trackedTicketRouteErrors.length
      ? ` (${trackedTicketRouteErrors.join('; ')})`
      : ''
  }`,
)

assert(
  [...documents.values()].every(
    (source) => !source.includes('Next：等待人工 QA'),
  ),
  'active authority and templates reject the retired QA Next',
)

const newTaskTemplateOccurrences = [...documents].flatMap(([name, source]) =>
  fullNewTaskBlocks(source).map((block) => [name, block]),
)
assert(
  newTaskTemplateOccurrences.length === 1 &&
    newTaskTemplateOccurrences[0][0] === 'dispatch protocol',
  'dispatch protocol is the only full new-task handoff template owner',
)

const ownerQaTemplateOccurrences = [...documents].flatMap(([name, source]) =>
  fencedBlocks(source)
    .filter((block) =>
      humanQaFields.every((field) => lineIndex(block, field) >= 0),
    )
    .map((block) => [name, block]),
)
assert(
  ownerQaTemplateOccurrences.length === 1 &&
    ownerQaTemplateOccurrences[0][0] === 'owner QA template',
  'owner QA full template has exactly one canonical owner',
)

section('Wayfinder development phase gates')

const requireGlobalCoordinator = process.argv.includes(
  '--require-global-coordinator',
)
const globalCoordinatorFilesExist =
  existsSync(globalCoordinatorYamlPath) &&
  existsSync(globalCoordinatorSkillPath)
const portableCoordinatorYaml = `interface:
  display_name: "EQB Wayfinder"
  short_description: "Validated phase coordinator"
  default_prompt: "Use the explicit coordinator."
policy:
  allow_implicit_invocation: false
`
const portableCoordinatorSkill = `---
name: coordinate-eqb-wayfinder
description: Explicit fixture.
disable-model-invocation: true
---
Act only as the initiative's repository-read-only coordinator.
Treat \`dispatch-protocols.md\` as the sole owner of legal transitions, gates, pauses, resumes, and successor routing.
Do not classify, merge, split, retry, or advance a route independently of \`dispatch-protocols.md\`.
Create exactly one fresh top-level peer through official Codex top-level task creation.
For the guarded \`$to-tickets\` lifecycle, record the peer id and exact proposal identity, bind the approval identity to the unchanged peer and proposal, verify clean state and no concurrent writer, and resume that same peer once through the official Codex top-level task messaging mechanism.
After publication, let the authority select an owner pause or one bounded approval-recording peer under a valid conditional policy. Require every predicate fact is already proven and no writer overlaps, forbid it from starting implementation, and constrain it to the authority's minimum complete route surface and deterministic commit/binding sequence. Treat any incomplete sequence as non-dispatchable. After it returns, preflight the exact bytes, ancestry, route agreement, and writer state again before any later dispatch.
Top-level task creation and that one guarded same-peer message are the only execution mechanisms.
`
const portableCoordinatorSkillDigest = sourceDigest(portableCoordinatorSkill)

if (requireGlobalCoordinator) {
  assert(
    globalCoordinatorFilesExist,
    'required installed global coordinator files exist',
  )
}
assert(
  coordinatorYamlErrors(portableCoordinatorYaml).length === 0,
  'portable coordinator YAML parser accepts explicit-only policy fixture',
)
assert(
  coordinatorYamlErrors(
    portableCoordinatorYaml.replace(
      'allow_implicit_invocation: false',
      'allow_implicit_invocation: true',
    ),
  ).some((error) => error.includes('must remain false')),
  'portable coordinator YAML parser rejects implicit invocation',
)
assert(
  coordinatorSkillErrors(portableCoordinatorSkill).length === 0,
  'portable coordinator skill parser accepts the thin contract fixture',
)
assert(
  reviewedArtifactBindingErrors(
    portableCoordinatorSkill,
    portableCoordinatorSkillDigest,
    'portable coordinator fixture',
  ).length === 0,
  'portable coordinator fixture matches its reviewed-byte binding',
)
assert(
  coordinatorSkillErrors(
    portableCoordinatorSkill.replace('repository-read-only', 'read-only-ish'),
  ).some((error) => error.includes('repository-read-only')),
  'portable coordinator skill parser rejects a lost read-only boundary',
)
assert(
  coordinatorSkillErrors(
    portableCoordinatorSkill.replace(
      'Create exactly one fresh top-level peer',
      'Create one peer',
    ),
  ).some((error) => error.includes('exactly one fresh top-level peer')),
  'portable coordinator skill parser requires exactly one fresh top-level peer',
)
for (const mechanic of [
  'Hook',
  'Runner',
  'daemon',
  'worker',
  'fork',
  'recursive coordinator',
  'successor subagent',
]) {
  assert(
    coordinatorSkillErrors(
      `${portableCoordinatorSkill}\nA ${mechanic} may be used for dispatch.\n`,
    ).some((error) => error.includes(mechanic)),
    `portable coordinator skill parser rejects any ${mechanic} exception`,
  )
}
for (const contradiction of [
  'Create a second top-level peer when useful.',
  'A concurrent top-level peer may be created.',
  'A second peer is created when useful.',
  'Launch a second peer when useful.',
  'A second peer is allowed.',
  'Concurrent top-level tasks are permitted.',
]) {
  assert(
    coordinatorSkillErrors(
      `${portableCoordinatorSkill}\n${contradiction}\n`,
    ).some((error) => error.includes('alternate execution topology')),
    `portable coordinator skill parser rejects: ${contradiction}`,
  )
}
for (const contradiction of [
  'Simultaneous execution is permitted.',
  'Other task tools are also allowed.',
  'Forking is allowed.',
]) {
  assert(
    reviewedArtifactBindingErrors(
      `${portableCoordinatorSkill}\n${contradiction}\n`,
      portableCoordinatorSkillDigest,
      'portable coordinator fixture',
    ).some((error) => error.includes('reviewed binding')),
    `portable reviewed-byte binding rejects: ${contradiction}`,
  )
}
assert(
  coordinatorSkillErrors(
    `${portableCoordinatorSkill}\nPreserve separate \`to-spec\` and \`to-tickets\` peers.\n`,
  ).some((error) => error.includes('must not copy dispatch detail')),
  'portable coordinator skill parser rejects copied phase detail',
)
const dispatchAuthorityErrors = coordinatorDispatchAuthorityErrors(dispatch)
assert(
  dispatchAuthorityErrors.length === 0,
  `tracked dispatch authority preserves every coordinator-critical invariant${
    dispatchAuthorityErrors.length
      ? ` (${dispatchAuthorityErrors.join('; ')})`
      : ''
  }`,
)
assert(
  transitionMapsEqual(dispatchTableTransitions(dispatch), legalPhaseTransitions),
  'documented phase table exactly matches the executable transition matrix',
)
for (const requiredGuardText of [
  'a committed current implementation result explicitly failed closed',
  'immutable, hashable measured evidence proves that the approved ticket capacity or route assumption is invalid',
  'continuing the declared implementation successor would be unsafe or false',
  'the owner explicitly authorizes one bounded measured replan',
  'implementation dispatch is immediately forbidden',
  'truthful `$to-tickets` provenance',
  'exact ticket granularity and then the exact produced manifest SHA-256',
]) {
  assert(
    compact(dispatch).includes(requiredGuardText),
    `guarded implementation-to-tickets prose requires: ${requiredGuardText}`,
  )
}
for (const contradiction of [
  'The coordinator may fork.',
  'A second peer is allowed.',
  'Concurrent top-level tasks are permitted.',
]) {
  assert(
    coordinatorDispatchAuthorityErrors(
      dispatch.replace(
        'The global skill executes the project authorities',
        `${contradiction}\n\nThe global skill executes the project authorities`,
      ),
    ).some((error) => error.includes('contradicts')),
    `tracked dispatch parser rejects: ${contradiction}`,
  )
}
assert(
  coordinatorDispatchAuthorityErrors(
    dispatch.replace(
      'may use only official Codex top-level task tools',
      'may use any available task tools',
    ),
  ).some((error) => error.includes('exact coordinator topology')),
  'tracked dispatch parser requires official top-level task tools',
)
for (const contradiction of [
  'Other task tools are also allowed.',
  'Forking is allowed.',
]) {
  assert(
    coordinatorDispatchAuthorityErrors(`${dispatch}\n${contradiction}\n`).some(
      (error) => error.includes('reviewed binding'),
    ),
    `tracked dispatch reviewed-byte binding rejects: ${contradiction}`,
  )
}
if (requireGlobalCoordinator && globalCoordinatorFilesExist) {
  const installedCoordinatorYaml = readFileSync(
    globalCoordinatorYamlPath,
    'utf8',
  )
  const installedCoordinatorSkill = readFileSync(
    globalCoordinatorSkillPath,
    'utf8',
  )
  assert(
    [
      ...coordinatorYamlErrors(installedCoordinatorYaml),
      ...reviewedArtifactBindingErrors(
        installedCoordinatorYaml,
        reviewedGlobalCoordinatorYamlDigest,
        'installed global coordinator YAML',
      ),
    ].length === 0,
    'installed global coordinator YAML is valid and remains explicit-only',
  )
  assert(
    [
      ...coordinatorSkillErrors(installedCoordinatorSkill),
      ...reviewedArtifactBindingErrors(
        installedCoordinatorSkill,
        reviewedGlobalCoordinatorSkillDigest,
        'installed global coordinator skill',
      ),
    ].length === 0,
    'installed global coordinator executes the canonical dispatch contract without copying it',
  )
}
for (const field of [
  'Owner manifest-digest approval mode:',
  'Owner manifest-digest approval source:',
  'Owner manifest-digest approval proposal identity:',
  'Owner manifest-digest approval granularity identity:',
  'Owner manifest-digest approval recording peer:',
  'Owner manifest-digest approval predicate evidence:',
  'Owner manifest-digest approval predicate evidence SHA-256:',
  'Owner manifest-digest approval result commit:',
  'Owner manifest-digest approval ticket-set manifest SHA-256:',
  'Implementation dispatched by approval record:',
]) {
  assert(
    issueTracker.includes(field),
    `issue-tracker schema binds conditional approval field: ${field}`,
  )
}
assert(
  compact(issueTracker).includes(
    '`Owner manifest-digest approval result commit` is the approval-route commit',
  ) &&
    compact(issueTracker).includes(
      'The immediately following receipt-only binding commit records that already-known commit hash',
    ) &&
    compact(issueTracker).includes(
      'The receipt and approval record bind the same exact approval-recording peer identity',
    ) &&
    compact(issueTracker).includes(
      'The approval record never claims the hash of the commit that contains itself',
    ),
  'issue-tracker defines the non-self-referential approval result-commit binding',
)
assert(
  compact(issueTracker).includes(
    'Ordinary serial tickets omit both fields',
  ) &&
    compact(issueTracker).includes(
      'includes both fields',
    ) &&
    compact(issueTracker).includes(
      'semantics live only in `dispatch-protocols.md`',
    ),
  'issue-tracker stores parallel fields only as a conditional matched-route pair',
)

const fixtureSourceHead = '1'.repeat(40)
const fixtureSpecCommit = '2'.repeat(40)
const fixtureApprovalCommit = '4'.repeat(40)
const fixtureSpecDigest = 'a'.repeat(64)
const fixtureTicketsDigest = 'b'.repeat(64)
const fixtureBindingDigest = 'c'.repeat(64)

function verifiedProvenance(phase, digest = 'd'.repeat(64)) {
  const skill = phaseEntrySkills.get(phase)
  return {
    skill,
    entrySkill: skill === null ? 'none' : `/absolute/path/to/${skill}/SKILL.md`,
    committed: true,
    sourceHead: fixtureSourceHead,
    resultCommit: fixtureSpecCommit,
    artifactPath: `docs/cuts/example/${phase}.md`,
    artifactDigest: digest,
    actualArtifactDigest: digest,
    currentArtifactDigest: digest,
  }
}

function verifiedExactManifestApproval() {
  return {
    committed: true,
    mode: 'exact-digest',
    actor: 'owner',
    action: 'approve-manifest-digest',
    sourceIdentity: 'owner-message:item-exact-digest',
    proposalIdentity: 'not-applicable',
    granularityIdentity: 'not-applicable',
    recordingPeerIdentity: 'not-applicable',
    explicitConditionalAuthorization: false,
    predicateEvidencePath: 'not-applicable',
    predicateEvidenceDigest: 'not-applicable',
    actualPredicateEvidenceDigest: '',
    resultCommit: fixtureApprovalCommit,
    recordPath: 'docs/cuts/example/manifest-approval.md',
    ticketManifestDigest: fixtureTicketsDigest,
    ancestor: true,
    recordExists: true,
    recordedStatus: 'verified',
    recordedMode: 'exact-digest',
    recordedActor: 'owner',
    recordedAction: 'approve-manifest-digest',
    recordedSourceIdentity: 'owner-message:item-exact-digest',
    recordedProposalIdentity: 'not-applicable',
    recordedGranularityIdentity: 'not-applicable',
    recordedRecordingPeerIdentity: 'not-applicable',
    recordedPredicateEvidencePath: 'not-applicable',
    recordedPredicateEvidenceDigest: 'not-applicable',
    recordedManifestDigest: fixtureTicketsDigest,
    implementationDispatched: 'no',
    recordedImplementationDispatched: 'no',
    predicate: {},
  }
}

function verifiedConditionalManifestApproval() {
  const predicate = Object.fromEntries(
    conditionalPredicateClauses.map(([field]) => [field, true]),
  )
  return {
    ...verifiedExactManifestApproval(),
    mode: 'conditional-predicate',
    action: 'apply-conditional-manifest-approval',
    sourceIdentity: 'owner-message:item-conditional-policy',
    proposalIdentity: 'peer:proposal-task/item-9',
    granularityIdentity: 'owner-message:item-granularity',
    recordingPeerIdentity: 'peer:approval-recording-task',
    explicitConditionalAuthorization: true,
    predicateEvidencePath: 'docs/cuts/example/manifest-approval-evidence.md',
    predicateEvidenceDigest: 'f'.repeat(64),
    actualPredicateEvidenceDigest: 'f'.repeat(64),
    recordedMode: 'conditional-predicate',
    recordedAction: 'apply-conditional-manifest-approval',
    recordedSourceIdentity: 'owner-message:item-conditional-policy',
    recordedProposalIdentity: 'peer:proposal-task/item-9',
    recordedGranularityIdentity: 'owner-message:item-granularity',
    recordedRecordingPeerIdentity: 'peer:approval-recording-task',
    recordedPredicateEvidencePath:
      'docs/cuts/example/manifest-approval-evidence.md',
    recordedPredicateEvidenceDigest: 'f'.repeat(64),
    predicate,
  }
}

function verifiedConditionalApprovalWriteSequence() {
  const approvalRouteCommit = '5'.repeat(40)
  const bindingCommit = '6'.repeat(40)
  const mapDigest = '7'.repeat(64)
  const predicateEvidencePath =
    'docs/cuts/example/conditional-approval-evidence.md'
  const approvalRecordPath =
    'docs/cuts/example/conditional-manifest-approval.md'
  const mapPath = 'docs/cuts/example/wayfinder/map.md'
  const receiptPath = 'docs/cuts/example/phase-transition.md'
  return {
    writerCount: 1,
    exclusiveWriter: true,
    samePeer: true,
    predicateEvidencePath,
    approvalRecordPath,
    mapPath,
    receiptPath,
    approvalRouteChangedPaths: [
      predicateEvidencePath,
      approvalRecordPath,
      mapPath,
    ],
    bindingChangedPaths: [receiptPath],
    approvalRouteCommit,
    bindingCommit,
    bindingParent: approvalRouteCommit,
    approvalRouteAncestorOfBinding: true,
    bindingIsCurrentHeadOrAncestor: true,
    approvalRecordClaimsContainingCommit: false,
    receiptApprovalResultCommit: approvalRouteCommit,
    mapNext: 'implementation',
    mapOnlyRouteFieldChanged: true,
    receiptCurrent: 'implementation',
    receiptNext: 'implementation',
    receiptMapBindingCommit: approvalRouteCommit,
    receiptMapBindingPath: mapPath,
    receiptMapBindingDigest: mapDigest,
    mapDigestAtApprovalRouteCommit: mapDigest,
    currentMapDigest: mapDigest,
    dispatchHistoryVerified: true,
    dispatchHistoryObservations: [
      { commit: approvalRouteCommit, state: 'forbidden' },
      { commit: bindingCommit, state: 'forbidden' },
    ],
    implementationDispatchedBeforeBinding: false,
    cleanAfterBinding: true,
    allImplementationGatesVerified: true,
  }
}

function phaseFixture(previous, current) {
  const specReady = current !== 'to-spec'
  const ticketsReady = !['to-spec', 'to-tickets'].includes(current)
  const approvalReady = implementationGatePhases.has(current)
  const specProvenance = specReady
    ? verifiedProvenance('to-spec', fixtureSpecDigest)
    : {}
  const ticketsProvenance = ticketsReady
    ? verifiedProvenance('to-tickets', fixtureTicketsDigest)
    : {}
  const approval = approvalReady
    ? {
        committed: true,
        actor: 'owner',
        action: 'approve-ticket-granularity',
        resultCommit: fixtureApprovalCommit,
        recordPath: 'docs/cuts/example/phase-transition.md',
        ticketManifestDigest: fixtureTicketsDigest,
        ancestor: true,
        recordExists: true,
        recordedStatus: 'verified',
        recordedActor: 'owner',
        recordedAction: 'approve-ticket-granularity',
        recordedManifestDigest: fixtureTicketsDigest,
      }
    : {}
  const manifestApproval = approvalReady
    ? verifiedExactManifestApproval()
    : {}
  const provenance = new Map()
  if (phaseEntrySkills.has(previous)) {
    provenance.set(
      previous,
      previous === 'to-spec'
        ? specProvenance
        : previous === 'to-tickets'
          ? ticketsProvenance
          : verifiedProvenance(previous),
    )
  }
  const outcomes = new Map()
  if (['independent-review', 'focused-re-review'].includes(previous)) {
    outcomes.set(
      previous,
      current === 'independent-fix' ? 'failed' : 'passed',
    )
  }
  if (previous === 'owner-qa') {
    outcomes.set(previous, 'accepted')
  }
  if (previous === 'release') {
    outcomes.set(previous, 'complete')
  }

  return {
    previous,
    current,
    next: current,
    terminal: current === 'DONE',
    implementationDispatch: approvalReady ? 'allowed' : 'forbidden',
    mapStatus: 'done',
    mapNext: current,
    binding: {
      verified: true,
      mapPath: 'docs/cuts/example/map.md',
      sourceArtifactPath: 'docs/cuts/example/map.md',
      commit: fixtureSpecCommit,
      artifactPath: 'docs/cuts/example/map.md',
      artifactDigest: fixtureBindingDigest,
      ancestor: true,
      committedArtifactDigest: fixtureBindingDigest,
      currentArtifactDigest: fixtureBindingDigest,
    },
    provenance,
    outcomes,
    spec: specReady
      ? {
          accepted: true,
          path: 'docs/cuts/example/spec.md',
          digest: fixtureSpecDigest,
          currentArtifactDigest: fixtureSpecDigest,
          provenance: specProvenance,
        }
      : { provenance: {} },
    tickets: ticketsReady
      ? {
          bindingVerified: true,
          manifestPath: 'docs/cuts/example/ticket-set.manifest',
          manifestDigest: fixtureTicketsDigest,
          currentArtifactDigest: fixtureTicketsDigest,
          boundSpecDigest: fixtureSpecDigest,
          provenance: ticketsProvenance,
        }
      : { provenance: {} },
    approval,
    manifestApproval,
    approvalSequence: null,
    measuredReplanAuthorized:
      previous === 'implementation' && current === 'to-tickets',
  }
}

assert(
  manifestApprovalErrors(
    verifiedExactManifestApproval(),
    fixtureTicketsDigest,
  ).length === 0,
  'ordinary explicit exact-digest approval remains valid',
)

for (const [previous, nextPhases] of legalPhaseTransitions) {
  for (const current of nextPhases) {
    assert(
      phaseReceiptErrors(phaseFixture(previous, current)).length === 0,
      `legal phase progression passes: ${previous} -> ${current}`,
    )
  }
}

const unguardedMeasuredReplan = phaseFixture('implementation', 'to-tickets')
unguardedMeasuredReplan.measuredReplanAuthorized = false
assert(
  phaseReceiptErrors(unguardedMeasuredReplan).some((error) =>
    error.includes('lacks guarded measured-replan authorization'),
  ),
  'implementation-to-tickets re-entry fails closed without every measured-replan guard',
)

const staleBindingFixture = phaseFixture('wayfinder', 'to-spec')
staleBindingFixture.binding.currentArtifactDigest = 'e'.repeat(64)
assert(
  currentMapBindingErrors(staleBindingFixture.binding).some((error) =>
    error.includes('current bytes'),
  ),
  'stale or mismatched current-map binding fails closed',
)

const wrongMapArtifactFixture = phaseFixture('wayfinder', 'to-spec')
wrongMapArtifactFixture.binding.artifactPath =
  'docs/cuts/example/unrelated-map.md'
assert(
  currentMapBindingErrors(wrongMapArtifactFixture.binding).some((error) =>
    error.includes('different artifact'),
  ),
  'current-map binding must target the receipt Wayfinder map',
)

for (const previous of legalPhaseTransitions.keys()) {
  for (const current of legalPhaseTransitions.keys()) {
    if (legalPhaseTransitions.get(previous).has(current)) {
      continue
    }
    const invalid = phaseFixture(previous, current)
    const errors = phaseReceiptErrors(invalid)
    assert(
      errors.some((error) =>
        error.includes(`illegal phase transition: ${previous} -> ${current}`),
      ),
      `every unlisted phase edge fails closed: ${previous} -> ${current}`,
    )
  }
}

const earlyApprovalBypass = phaseFixture('wayfinder', 'to-spec')
earlyApprovalBypass.tickets.manifestDigest = fixtureTicketsDigest
earlyApprovalBypass.approval = {
  committed: true,
  actor: 'owner',
  action: 'approve-ticket-granularity',
  resultCommit: fixtureApprovalCommit,
  recordPath: 'docs/cuts/example/phase-transition.md',
  ticketManifestDigest: fixtureTicketsDigest,
  ancestor: true,
  recordExists: true,
  recordedStatus: 'verified',
  recordedActor: 'owner',
  recordedAction: 'approve-ticket-granularity',
  recordedManifestDigest: fixtureTicketsDigest,
}
earlyApprovalBypass.implementationDispatch = 'allowed'
assert(
  phaseReceiptErrors(earlyApprovalBypass).some((error) =>
    error.includes('does not match the four gates'),
  ),
  'early approval cannot enable implementation without all four gates',
)

for (const { name, mutate, expectedError } of [
  {
    name: 'accepted-spec provenance',
    mutate: (fixture) => {
      fixture.spec.provenance.sourceHead = 'malformed'
    },
    expectedError: 'accepted spec lacks verified to-spec provenance',
  },
  {
    name: 'ticket-set provenance',
    mutate: (fixture) => {
      fixture.tickets.provenance.sourceHead = 'malformed'
    },
    expectedError: 'ticket set lacks verified to-tickets provenance',
  },
  {
    name: 'ticket-to-spec binding',
    mutate: (fixture) => {
      fixture.tickets.boundSpecDigest = 'e'.repeat(64)
    },
    expectedError: 'ticket set is not bound to the accepted spec',
  },
  {
    name: 'owner approval evidence',
    mutate: (fixture) => {
      fixture.approval.recordedManifestDigest = 'e'.repeat(64)
    },
    expectedError: 'owner ticket-granularity approval is absent or stale',
  },
]) {
  const invalid = phaseFixture('owner-approval', 'implementation')
  mutate(invalid)
  const errors = phaseReceiptErrors(invalid)
  assert(
    errors.some((error) => error.includes(expectedError)) &&
      errors.some((error) =>
        error.includes('Implementation dispatch does not match the four gates'),
      ),
    `implementation remains forbidden when ${name} is unverified`,
  )
}

const toTicketsBypass = phaseFixture('to-tickets', 'owner-approval')
toTicketsBypass.current = 'implementation'
toTicketsBypass.next = 'implementation'
toTicketsBypass.mapNext = 'implementation'
assert(
  phaseReceiptErrors(toTicketsBypass).some((error) =>
    error.includes('illegal phase transition: to-tickets -> implementation'),
  ) &&
    phaseReceiptErrors(toTicketsBypass).some((error) =>
      error.includes('owner ticket-granularity approval is absent or stale'),
    ),
  'to-tickets cannot bypass owner approval into implementation',
)

const unknownRouteFixture = phaseFixture('wayfinder', 'to-spec')
unknownRouteFixture.current = 'mystery-route'
unknownRouteFixture.next = 'mystery-route'
unknownRouteFixture.mapNext = 'mystery-route'
assert(
  phaseReceiptErrors(unknownRouteFixture).some((error) =>
    error.includes('unknown current phase route kind'),
  ),
  'unknown route kinds fail closed',
)

const malformedProvenanceFixture = phaseFixture('wayfinder', 'to-spec')
malformedProvenanceFixture.provenance.set('wayfinder', {
  ...malformedProvenanceFixture.provenance.get('wayfinder'),
  sourceHead: 'short-commit',
})
assert(
  phaseReceiptErrors(malformedProvenanceFixture).some((error) =>
    error.includes('provenance is incomplete or malformed'),
  ),
  'missing or malformed completed-phase provenance fails closed',
)

const specDigestMismatch = phaseFixture('to-spec', 'to-tickets')
specDigestMismatch.spec.currentArtifactDigest = 'e'.repeat(64)
assert(
  phaseReceiptErrors(specDigestMismatch).some((error) =>
    error.includes('verified to-spec provenance'),
  ),
  'accepted-spec digest mismatch fails closed',
)

const ticketDigestMismatch = phaseFixture('to-tickets', 'owner-approval')
ticketDigestMismatch.tickets.currentArtifactDigest = 'e'.repeat(64)
assert(
  phaseReceiptErrors(ticketDigestMismatch).some((error) =>
    error.includes('verified to-tickets provenance'),
  ),
  'ticket-set digest mismatch fails closed',
)

for (const approvalMutation of [
  {},
  {
    committed: true,
    actor: 'owner',
    action: 'approve-ticket-granularity',
    resultCommit: fixtureApprovalCommit,
    recordPath: 'docs/cuts/example/phase-transition.md',
    ticketManifestDigest: 'e'.repeat(64),
  },
  {
    ...phaseFixture('owner-approval', 'implementation').approval,
    ancestor: false,
  },
  {
    ...phaseFixture('owner-approval', 'implementation').approval,
    recordExists: false,
  },
  {
    ...phaseFixture('owner-approval', 'implementation').approval,
    recordedManifestDigest: 'e'.repeat(64),
  },
]) {
  const staleApprovalFixture = phaseFixture(
    'owner-approval',
    'implementation',
  )
  staleApprovalFixture.approval = approvalMutation
  staleApprovalFixture.implementationDispatch = 'forbidden'
  assert(
    phaseReceiptErrors(staleApprovalFixture).some((error) =>
      error.includes('owner ticket-granularity approval is absent or stale'),
    ),
    'missing or stale owner approval fails closed',
  )
}

const conditionalApprovalPass = phaseFixture('owner-approval', 'implementation')
conditionalApprovalPass.manifestApproval =
  verifiedConditionalManifestApproval()
conditionalApprovalPass.approvalSequence =
  verifiedConditionalApprovalWriteSequence()
assert(
  phaseReceiptErrors(conditionalApprovalPass).length === 0,
  'explicit conditional-predicate approval passes only with complete exact evidence',
)

const missingConditionalSequence = phaseFixture(
  'owner-approval',
  'implementation',
)
missingConditionalSequence.manifestApproval =
  verifiedConditionalManifestApproval()
assert(
  phaseReceiptErrors(missingConditionalSequence).some((error) =>
    error.includes('minimum route surface'),
  ) &&
    phaseReceiptErrors(missingConditionalSequence).some((error) =>
      error.includes('Implementation dispatch does not match the four gates'),
    ),
  'real phase-receipt seam rejects conditional approval without its commit sequence',
)

const mapBeforeApproval = `Status: done
Next on PASS: owner-approval

## Notes
Stable bytes.
`
const mapAfterApproval = mapBeforeApproval.replace(
  'Next on PASS: owner-approval',
  'Next on PASS: implementation',
)
assert(
  onlyMarkdownFieldChanged(
    mapBeforeApproval,
    mapAfterApproval,
    'Next on PASS',
    'owner-approval',
    'implementation',
  ),
  'map byte comparison accepts only the exact approval route-field change',
)
for (const extraMapMutation of [
  mapAfterApproval.replace('Stable bytes.', 'Changed bytes.'),
  mapAfterApproval.replace(
    'Next on PASS: implementation\n',
    'Next on PASS: implementation\n\n',
  ),
  mapAfterApproval.replace(
    'Next on PASS: implementation',
    'Next on PASS: implementation ',
  ),
]) {
  assert(
    !onlyMarkdownFieldChanged(
      mapBeforeApproval,
      extraMapMutation,
      'Next on PASS',
      'owner-approval',
      'implementation',
    ),
    'map byte comparison rejects every extra map-byte change',
  )
}

const conditionalApprovalDescendant = phaseFixture(
  'implementation',
  'independent-review',
)
conditionalApprovalDescendant.manifestApproval =
  verifiedConditionalManifestApproval()
conditionalApprovalDescendant.approvalSequence =
  verifiedConditionalApprovalWriteSequence()
assert(
  phaseReceiptErrors(conditionalApprovalDescendant).length === 0,
  'later phase validates the historical conditional-approval binding separately from its current route',
)

assert(
  conditionalApprovalWriteSequenceErrors(
    verifiedConditionalApprovalWriteSequence(),
  ).length === 0,
  'conditional approval uses one exact two-commit route-and-binding sequence',
)

for (const { name, mutate, expectedError } of [
  {
    name: 'an extra changed artifact',
    mutate: (sequence) => {
      sequence.approvalRouteChangedPaths.push('docs/cuts/example/spec.md')
    },
    expectedError: 'exceeds its minimum route surface',
  },
  {
    name: 'a second writer',
    mutate: (sequence) => {
      sequence.writerCount = 2
      sequence.exclusiveWriter = false
    },
    expectedError: 'requires one exclusive peer',
  },
  {
    name: 'a non-adjacent binding commit',
    mutate: (sequence) => {
      sequence.bindingParent = '8'.repeat(40)
    },
    expectedError: 'must directly follow',
  },
  {
    name: 'unproven commit ancestry',
    mutate: (sequence) => {
      sequence.approvalRouteAncestorOfBinding = false
    },
    expectedError: 'must directly follow',
  },
  {
    name: 'extra map-byte changes',
    mutate: (sequence) => {
      sequence.mapOnlyRouteFieldChanged = false
    },
    expectedError: 'map may change only Next on PASS',
  },
  {
    name: 'a self-referential approval record',
    mutate: (sequence) => {
      sequence.approvalRecordClaimsContainingCommit = true
    },
    expectedError: 'must not require a commit to claim its own hash',
  },
  {
    name: 'route disagreement',
    mutate: (sequence) => {
      sequence.receiptNext = 'owner-approval'
    },
    expectedError: 'route fields must agree',
  },
  {
    name: 'a stale map digest',
    mutate: (sequence) => {
      sequence.currentMapDigest = '9'.repeat(64)
    },
    expectedError: 'bind exact current map bytes',
  },
  {
    name: 'implementation before binding',
    mutate: (sequence) => {
      sequence.implementationDispatchedBeforeBinding = true
    },
    expectedError: 'remains non-dispatchable',
  },
]) {
  const invalid = verifiedConditionalApprovalWriteSequence()
  mutate(invalid)
  assert(
    conditionalApprovalWriteSequenceErrors(invalid).some((error) =>
      error.includes(expectedError),
    ),
    `conditional approval sequence rejects ${name}`,
  )
}

for (const { name, mutate, expectedError } of [
  {
    name: 'silence',
    mutate: (approval) => {
      approval.sourceIdentity = 'silence'
      approval.recordedSourceIdentity = 'silence'
      approval.explicitConditionalAuthorization = false
    },
    expectedError: 'not explicitly authorized',
  },
  {
    name: 'generic approval',
    mutate: (approval) => {
      approval.sourceIdentity = 'continue'
      approval.recordedSourceIdentity = 'continue'
    },
    expectedError: 'absent, stale, or not approval-only',
  },
  {
    name: 'proposal-only approval',
    mutate: (approval) => {
      approval.sourceIdentity = 'proposal-only'
      approval.recordedSourceIdentity = 'proposal-only'
      approval.explicitConditionalAuthorization = false
    },
    expectedError: 'not explicitly authorized',
  },
  {
    name: 'missing predicate evidence',
    mutate: (approval) => {
      approval.predicateEvidencePath = 'pending'
      approval.predicateEvidenceDigest = 'pending'
    },
    expectedError: 'lacks exact predicate evidence',
  },
  {
    name: 'changed approval-recording peer',
    mutate: (approval) => {
      approval.recordedRecordingPeerIdentity = 'peer:different-task'
    },
    expectedError: 'identities are missing or stale',
  },
  {
    name: 'changed ticket bytes',
    mutate: (approval) => {
      approval.predicate.ticketBytesMatchManifest = false
    },
    expectedError: 'manifest paths/digests do not match current ticket bytes',
  },
  {
    name: 'new verifier failure',
    mutate: (approval) => {
      approval.predicate.noNewRelevantVerifierFailure = false
    },
    expectedError: 'a new relevant verifier failure exists or is unproven',
  },
  {
    name: 'competing writer',
    mutate: (approval) => {
      approval.predicate.exclusiveWriter = false
    },
    expectedError: 'a competing writer exists or exclusivity is unproven',
  },
  {
    name: 'approval plus implementation in one task',
    mutate: (approval) => {
      approval.implementationDispatched = 'yes'
      approval.recordedImplementationDispatched = 'yes'
    },
    expectedError: 'absent, stale, or not approval-only',
  },
]) {
  const invalid = phaseFixture('owner-approval', 'implementation')
  invalid.manifestApproval = verifiedConditionalManifestApproval()
  invalid.approvalSequence = verifiedConditionalApprovalWriteSequence()
  mutate(invalid.manifestApproval)
  const errors = phaseReceiptErrors(invalid)
  assert(
    errors.some((error) => error.includes(expectedError)) &&
      errors.some((error) =>
        error.includes('Implementation dispatch does not match the four gates'),
      ),
    `conditional manifest approval rejects ${name}`,
  )
}

const passedReviewToFix = phaseFixture(
  'independent-review',
  'independent-fix',
)
passedReviewToFix.outcomes.set('independent-review', 'passed')
assert(
  phaseReceiptErrors(passedReviewToFix).some((error) =>
    error.includes('requires a canonical failed review result'),
  ),
  'a passing independent review cannot route to a fix peer',
)

const failedReviewToRelease = phaseFixture('independent-review', 'release')
failedReviewToRelease.outcomes.set('independent-review', 'failed')
assert(
  phaseReceiptErrors(failedReviewToRelease).some((error) =>
    error.includes('canonical PASS result'),
  ),
  'a failed independent review cannot advance without a selected fix',
)

for (const reviewPhase of ['independent-review', 'focused-re-review']) {
  const passedReviewReturn = phaseFixture(reviewPhase, 'implementation')
  assert(
    phaseReceiptErrors(passedReviewReturn).length === 0,
    `${reviewPhase} may return to implementation on canonical PASS`,
  )

  for (const outcome of [undefined, 'failed', 'accepted', 'complete']) {
    const invalidReviewReturn = phaseFixture(reviewPhase, 'implementation')
    invalidReviewReturn.outcomes.set(reviewPhase, outcome)
    assert(
      phaseReceiptErrors(invalidReviewReturn).some((error) =>
        error.includes('canonical PASS result'),
      ),
      `${reviewPhase} cannot return to implementation without canonical PASS`,
    )
  }

  const gatedReviewReturn = phaseFixture(reviewPhase, 'implementation')
  gatedReviewReturn.approval.recordedManifestDigest = 'e'.repeat(64)
  gatedReviewReturn.implementationDispatch = 'forbidden'
  assert(
    phaseReceiptErrors(gatedReviewReturn).some((error) =>
      error.includes('owner ticket-granularity approval is absent or stale'),
    ),
    `${reviewPhase} cannot return to implementation after implementation-gate drift`,
  )
}

const acceptedOwnerQaReturn = phaseFixture('owner-qa', 'implementation')
assert(
  phaseReceiptErrors(acceptedOwnerQaReturn).length === 0,
  'owner QA may return to implementation after committed owner acceptance',
)
for (const outcome of [undefined, 'passed', 'failed', 'complete']) {
  const invalidOwnerQaReturn = phaseFixture('owner-qa', 'implementation')
  invalidOwnerQaReturn.outcomes.set('owner-qa', outcome)
  assert(
    phaseReceiptErrors(invalidOwnerQaReturn).some((error) =>
      error.includes('recorded owner-QA acceptance'),
    ),
    'owner QA cannot return to implementation without committed owner acceptance',
  )
}
const gatedOwnerQaReturn = phaseFixture('owner-qa', 'implementation')
gatedOwnerQaReturn.approval.recordedManifestDigest = 'e'.repeat(64)
gatedOwnerQaReturn.implementationDispatch = 'forbidden'
assert(
  phaseReceiptErrors(gatedOwnerQaReturn).some((error) =>
    error.includes('owner ticket-granularity approval is absent or stale'),
  ),
  'owner QA cannot return to implementation after implementation-gate drift',
)

assert(
  currentModelRouteErrors({
    routeKind: 'normal-implementation',
    model: 'gpt-5.6-terra',
    effort: 'high',
  }).length === 0,
  'normal implementation uses the authoritative Terra High route',
)
assert(
  currentModelRouteErrors({
    routeKind: 'normal-implementation',
    model: 'gpt-5.6-sol',
    effort: 'medium',
    source: 'historical-handoff',
  }).some((error) =>
    error.includes('cannot inherit a model from historical text'),
  ),
  'current task rejects a model inherited from historical text',
)
for (const [routeKind, model, effort] of [
  ['coordinator', 'gpt-5.6-sol', 'medium'],
  ['planning', 'gpt-5.6-sol', 'medium'],
  ['deterministic-mechanical', 'gpt-5.6-luna', 'max'],
  ['normal-implementation', 'gpt-5.6-terra', 'high'],
  ['semantic-fix', 'gpt-5.6-terra', 'high'],
  ['first-of-kind', 'gpt-5.6-terra', 'max'],
  ['cross-cut', 'gpt-5.6-terra', 'max'],
  ['full-semantic-closure', 'gpt-5.6-terra', 'max'],
  ['screen-print-pdf-closure', 'gpt-5.6-terra', 'max'],
  ['independent-review', 'gpt-5.6-sol', 'medium'],
  ['focused-re-review', 'gpt-5.6-sol', 'medium'],
  ['high-risk-aggregate-review', 'gpt-5.6-sol', 'high'],
]) {
  assert(
    currentModelRouteErrors({
      routeKind,
      model,
      effort,
    }).length === 0,
    `${routeKind} uses ${model} / ${effort} from the authoritative table`,
  )
}

for (const [routeKind, staleModel, staleEffort] of [
  ['deterministic-mechanical', 'gpt-5.6-sol', 'medium'],
  ['normal-implementation', 'gpt-5.6-sol', 'medium'],
  ['semantic-fix', 'gpt-5.6-luna', 'max'],
  ['first-of-kind', 'gpt-5.6-terra', 'high'],
  ['independent-review', 'gpt-5.6-sol', 'high'],
  ['focused-re-review', 'gpt-5.6-sol', 'high'],
  ['high-risk-aggregate-review', 'gpt-5.6-sol', 'medium'],
]) {
  assert(
    currentModelRouteErrors({
      routeKind,
      model: staleModel,
      effort: staleEffort,
    }).some((error) => error.includes('requires')),
    `${routeKind} rejects a wrong or stale route`,
  )
}
assert(
  currentModelRouteErrors({
    routeKind: 'normal-implementation',
    model: 'gpt-5.6-terra',
    effort: 'high',
    authority: modelRouting.replace(
      '| Normal implementation and semantic fixes |',
      '| Renamed implementation route |',
    ),
  }).some((error) => error.includes('does not select exactly one row')),
  'model routing fails closed when the authoritative row is missing or stale',
)
assert(
  currentModelRouteErrors({
    routeKind: 'unknown-workload',
    model: 'gpt-5.6-sol',
    effort: 'medium',
  }).some((error) => error.includes('unknown current route kind')),
  'unknown model route kinds fail closed',
)

const currentHead = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: ROOT,
  encoding: 'utf8',
}).trim()
const currentPaperPhaseState = parsePhaseReceipt(
  currentPaperPhase,
  currentPaperMap,
  currentPaperMapPath,
  currentHead,
  currentPaperPhasePath,
)
const currentPaperPhaseErrors = phaseReceiptErrors(currentPaperPhaseState)
assert(
  currentPaperPhaseErrors.length === 0,
  `current paper initiative generically validates at ${currentPaperPhaseState.previous} -> ${currentPaperPhaseState.current}${
    currentPaperPhaseErrors.length
      ? ` (${currentPaperPhaseErrors.join('; ')})`
      : ''
  }`,
)
assert(
  currentPaperPhaseState.current !== 'to-spec' ||
    (!currentPaperPhaseState.spec.provenance.committed &&
      !currentPaperPhaseState.tickets.provenance.committed &&
      currentPaperPhaseState.approval.committed !== true),
  'a pending to-spec frontier has no fabricated later-phase provenance',
)
assert(
  /^Status:\s*done\s*$/m.test(currentPaperTicket01) &&
    currentPaperPhase.includes(
      '2c7435026923db6b359e3770f22fdd11ed7d3c01',
    ),
  'current paper route preserves the completed Ticket 01 result',
)
assert(
  phaseReceiptErrors(
    phaseFixture('implementation', 'independent-review'),
  ).length === 0 &&
    markdownField(currentPaperTicket02, 'Next on PASS') ===
      'independent review',
  'Ticket 02 bootstrap uses the pre-existing implementation-to-independent-review edge',
)
assert(
  markdownField(currentPaperTicket26, 'Next on PASS') ===
    'parallel frontier handoff' &&
    parallelTicketPaths.every((path) =>
      markdownField(currentPaperTicket26, 'Parallel frontier')?.includes(path),
    ),
  'Ticket 26 has one declared handoff for the exact three-lane parallel frontier',
)
for (const [index, laneTicket] of currentPaperLaneTickets.entries()) {
  assert(
    markdownField(laneTicket, 'Next on PASS') === 'parallel join handoff' &&
      markdownField(laneTicket, 'Parallel join') === parallelJoinTicketPath,
    `Ticket ${index + 27} has one lane-result handoff to the deterministic join`,
  )
}
assert(
  /Blocked by:\s*Tickets 27, 28, and 29 PASS/.test(currentPaperTicket30) &&
    /fixed\s+order Ticket 27 → Ticket 28 → Ticket 29/.test(currentPaperTicket30),
  'Ticket 30 requires all three lane PASS results and preserves fixed integration order',
)

const externallyBlockedImplementation = phaseFixture(
  'owner-approval',
  'implementation',
)
externallyBlockedImplementation.canonicalAuthorityGates = 'verified'
externallyBlockedImplementation.externalImplementationBlocker = 'active'
externallyBlockedImplementation.externalBlockerKind =
  'project-wide proportionate-engineering Wayfinder'
externallyBlockedImplementation.externalBlockerClosureEvidence = 'pending'
externallyBlockedImplementation.externalBlockerClosure = { formatValid: false }
externallyBlockedImplementation.implementationDispatch = 'forbidden'
assert(
  phaseReceiptErrors(externallyBlockedImplementation).length === 0,
  'an explicit pending external blocker keeps verified implementation gates non-dispatchable',
)
externallyBlockedImplementation.implementationDispatch = 'allowed'
assert(
  phaseReceiptErrors(externallyBlockedImplementation).some((error) =>
    error.includes('external blocker'),
  ),
  'an active external blocker rejects implementation dispatch',
)

for (const placeholderKind of [
  '',
  'pending',
  'pending.',
  'none',
  'none-',
  'not-applicable',
  'not-applicable.',
  'not_applicable',
  'not applicable',
  'n/a',
  'N.A.',
  'nil',
  'tbc',
  'unknown',
  'not_required',
  'not set',
  'empty',
]) {
  const placeholderBlocker = structuredClone(externallyBlockedImplementation)
  placeholderBlocker.externalBlockerKind = placeholderKind
  placeholderBlocker.implementationDispatch = 'forbidden'
  assert(
    phaseReceiptErrors(placeholderBlocker).some((error) =>
      error.includes('External blocker kind'),
    ),
    `external blocker rejects placeholder kind: ${placeholderKind}`,
  )
}

for (const durableKind of [
  'project-wide-proportionate-engineering-wayfinder',
  'project-wide proportionate-engineering Wayfinder',
]) {
  const durableBlocker = structuredClone(externallyBlockedImplementation)
  durableBlocker.externalBlockerKind = durableKind
  durableBlocker.implementationDispatch = 'forbidden'
  assert(
    phaseReceiptErrors(durableBlocker).length === 0,
    `external blocker accepts durable kind: ${durableKind}`,
  )
}

const activeBlockerObservation = {
  commit: '1'.repeat(40),
  status: 'active',
  kind: 'project-wide proportionate-engineering Wayfinder',
  evidence: 'pending',
}
const closedBlockerObservation = {
  commit: '2'.repeat(40),
  status: 'none',
  kind: activeBlockerObservation.kind,
  evidence: `docs/cuts/proportionate-engineering/wayfinder/map.md@${fixtureApprovalCommit}`,
}
assert(
  previousActiveExternalBlockerObservation([
    closedBlockerObservation,
    activeBlockerObservation,
  ])?.commit === activeBlockerObservation.commit,
  'advanced HEAD closure history traverses past the current none receipt to the earlier active identity',
)
assert(
  previousActiveExternalBlockerObservation([
    { ...closedBlockerObservation, commit: '3'.repeat(40) },
    closedBlockerObservation,
    activeBlockerObservation,
  ])?.commit === activeBlockerObservation.commit,
  'closure history traverses repeated none receipt states to the earlier active identity',
)
assert(
  previousActiveExternalBlockerObservation([
    closedBlockerObservation,
    {
      ...closedBlockerObservation,
      commit: '3'.repeat(40),
      kind: 'different blocker',
    },
    activeBlockerObservation,
  ]) === null,
  'closure history rejects a divergent none state instead of skipping it',
)
assert(
  previousActiveExternalBlockerObservation([closedBlockerObservation]) ===
    null,
  'the current none receipt cannot serve as its own previous active proof',
)

const durablyClosedExternalBlocker = phaseFixture(
  'owner-approval',
  'implementation',
)
durablyClosedExternalBlocker.canonicalAuthorityGates = 'verified'
durablyClosedExternalBlocker.externalImplementationBlocker = 'none'
durablyClosedExternalBlocker.externalBlockerKind =
  'project-wide proportionate-engineering Wayfinder'
durablyClosedExternalBlocker.externalBlockerClosureEvidence =
  `docs/cuts/proportionate-engineering/wayfinder/map.md@${fixtureApprovalCommit}`
durablyClosedExternalBlocker.externalBlockerClosure = {
  formatValid: true,
  ancestor: true,
  artifactExists: true,
  artifactStatus: 'done',
  artifactKind: 'project-wide proportionate-engineering Wayfinder',
}
durablyClosedExternalBlocker.previousExternalBlocker = {
  commit: '1'.repeat(40),
  status: 'active',
  kind: 'project-wide proportionate-engineering Wayfinder',
  evidence: 'pending',
}
durablyClosedExternalBlocker.implementationDispatch = 'allowed'
assert(
  phaseReceiptErrors(durablyClosedExternalBlocker).length === 0,
  'durable matching external-blocker closure permits verified implementation gates',
)

for (const [name, mutate] of [
  [
    'none plus pending plus allowed',
    (fixture) => {
      fixture.externalBlockerClosureEvidence = 'pending'
      fixture.externalBlockerClosure = { formatValid: false }
    },
  ],
  [
    'closure artifact kind mismatch',
    (fixture) => {
      fixture.externalBlockerClosure = {
        ...fixture.externalBlockerClosure,
        artifactKind: 'different blocker',
      }
    },
  ],
  [
    'closure evidence commit is not an ancestor',
    (fixture) => {
      fixture.externalBlockerClosure = {
        ...fixture.externalBlockerClosure,
        ancestor: false,
      }
    },
  ],
  [
    'closure changes the prior blocker kind',
    (fixture) => {
      fixture.previousExternalBlocker = {
        ...fixture.previousExternalBlocker,
        kind: 'different blocker',
      }
    },
  ],
  [
    'the current none closure as its own previous identity after HEAD advances',
    (fixture) => {
      fixture.previousExternalBlocker = {
        status: 'none',
        kind: fixture.externalBlockerKind,
        evidence: fixture.externalBlockerClosureEvidence,
      }
    },
  ],
]) {
  const invalid = structuredClone(durablyClosedExternalBlocker)
  mutate(invalid)
  assert(
    phaseReceiptErrors(invalid).some((error) =>
      error.toLowerCase().includes('external blocker'),
    ),
    `external blocker rejects ${name}`,
  )
}

const conditionalHistoryBypass = phaseFixture(
  'owner-approval',
  'implementation',
)
conditionalHistoryBypass.manifestApproval =
  verifiedConditionalManifestApproval()
conditionalHistoryBypass.approvalSequence =
  verifiedConditionalApprovalWriteSequence()
conditionalHistoryBypass.approvalSequence.dispatchHistoryVerified = false
assert(
  phaseReceiptErrors(conditionalHistoryBypass).some((error) =>
    error.includes('history contains a non-forbidden'),
  ),
  'conditional approval rejects a historically allowed dispatch state',
)
assert(
  markdownField(currentPaperConditionalEvidence, 'Status') === 'rejected' &&
    [
      '5a8233caaf29e0e86321d77df2f079b16e725f73',
      '85037b6bbc5a01a7f8f355a089162e6bfc6ff253',
      '8971e445a06a492f742ce16c4d8d78242523b1f7',
      '697d603b0ec6bda345ad2f2fe1bd0df0d34de44d',
      '4c0e23726ddcf92ff60b9cc35b16b9ec12776271',
    ].every((commit) => currentPaperConditionalEvidence.includes(commit)) &&
    currentPaperConditionalEvidence.includes(
      'earlier evidence line claiming dispatch stayed\nforbidden throughout evaluation was false and is withdrawn',
    ),
  'current conditional evidence truthfully records the independently readable dispatch history',
)

section('canonical handoff')

const canonicalBlocks = skillRequiredTaskBlocks(dispatch)
const canonicalBlock = canonicalBlocks[0] ?? ''
const unmarkedDuplicate = `\`\`\`text\n${canonicalBlock}\n\`\`\``
assert(
  fullNewTaskBlocks(unmarkedDuplicate).length === 1,
  'unmarked full new-task template is still detected',
)
assert(canonicalBlocks.length === 1, 'dispatch owns one complete new-task template')
assert(
  validateSkillHandoff(canonicalBlock, 'generic').length === 0,
  'canonical new-task template is attachment-first',
)
for (const field of newTaskFields) {
  assert(lineIndex(canonicalBlock, field) >= 0, `canonical field present: ${field}`)
}
assert(
  newTaskFields
    .map((field) => lineIndex(canonicalBlock, field))
    .every((value, index, values) => value >= 0 && (!index || value > values[index - 1])),
  'canonical fields keep their required order',
)
assert(
  canonicalBlock.includes('actual entry action') &&
    canonicalBlock.includes('Next on PASS'),
  'canonical prompt adapts to the actual entry action and durable route',
)
assert(
  !canonicalBlock.includes('Implement and only implement'),
  'canonical prompt does not mislabel every entry action as implementation',
)
assert(
  !canonicalBlock.split('\n')[0].includes('/Users/huangxuewei'),
  'tracked attachment uses a generic absolute path',
)
assert(
  dispatch.includes('`dispatch` means') &&
    dispatch.includes('`handoff` means') &&
    compact(dispatch).includes('does not create or run the successor'),
  'dispatch protocol distinguishes dispatch from handoff',
)
assert(
  dispatch.includes('Terminal: no') &&
    dispatch.includes('same-task response') &&
    dispatch.includes('DONE'),
  'dispatch protocol makes non-terminal exits deterministic',
)
assert(
  ticketTemplate.includes('Next on PASS:') &&
    ticketTemplate.includes('Terminal: <yes | no>') &&
    issueTracker.includes('Next on PASS:') &&
    issueTracker.includes('Terminal: yes | no'),
  'ticket template and tracker declare the durable route',
)

section('skill boundary')

const skillTaskBlock = (skill, { blankLine = true } = {}) =>
  `[$${skill}](/absolute/path/to/${skill}/SKILL.md)\n${blankLine ? '\n' : ''}` +
  `Worktree: /absolute/path/to/worktree
Branch: codex/example
Expected HEAD: 0123456789abcdef
Spec: not applicable
Ticket: not applicable
Fixed point: 0123456789abcdef
Model: gpt-5.6-sol
Effort: medium
Prompt:
Implement only the linked ticket.`

assert(
  validateSkillHandoff(skillTaskBlock('to-spec'), 'to-spec').length === 0,
  'to-spec phase accepts attachment-first $to-spec',
)
assert(
  validateSkillHandoff(skillTaskBlock('to-tickets'), 'to-tickets').length ===
    0,
  'to-tickets phase accepts attachment-first $to-tickets',
)
assert(
  validateSkillHandoff(skillTaskBlock('implement'), 'implementation').length ===
    0,
  'implementation accepts attachment-first $implement',
)
assert(
  validateSkillHandoff(skillTaskBlock('code-review'), 'independent-review')
    .length === 0,
  'independent review accepts attachment-first $code-review',
)
assert(
  validateSkillHandoff(skillTaskBlock('code-review'), 'implementation').some(
    (error) => error.includes('$implement'),
  ),
  'implementation rejects the wrong entry skill',
)
assert(
  validateSkillHandoff(skillTaskBlock('implement', { blankLine: false }), 'fix')
    .some((error) => error.includes('blank line')),
  'skill attachment requires one following blank line',
)
assert(
  validateSkillHandoff(
    skillTaskBlock('implement').replace(
      '/implement/SKILL.md',
      '/code-review/SKILL.md',
    ),
    'implementation',
  ).some((error) => error.includes('label and target')),
  'skill attachment label and target must match',
)

const explicitOnlySkill = {
  source: 'owner path',
  path: '/absolute/path/to/implement/SKILL.md',
  realPath: '/absolute/path/to/implement/SKILL.md',
  exists: true,
  readable: true,
  contents: `---
name: implement
disable-model-invocation: true
---
Implement the ticket.`,
}
assert(
  invocationAvailability('implement', { activeCatalog: ['implement'] })
    .available,
  'active-catalog skill is invokable now',
)
assert(
  invocationAvailability('implement', { ownerAttached: ['implement'] })
    .available,
  'owner-attached skill is invokable now',
)
assert(
  !invocationAvailability('implement', {}).available,
  'discoverable path alone is not a current invocation',
)
assert(
  resolveHandoffReference('implement', [explicitOnlySkill]).available,
  'verified explicit-only skill is handoff-referenceable',
)
assert(
  resolveHandoffReference('implement', [
    explicitOnlySkill,
    {
      ...explicitOnlySkill,
      source: 'skill bridge',
      path: '/other/absolute/path/to/implement/SKILL.md',
      realPath: '/other/absolute/path/to/implement/SKILL.md',
    },
  ]).code === 'SKILL AMBIGUOUS',
  'conflicting verified skill paths are ambiguous',
)
assert(
  compact(dispatch).includes(
    'Invocation availability and handoff referenceability are separate',
  ) &&
    dispatch.includes('disable-model-invocation: true') &&
    dispatch.includes('SKILL UNAVAILABLE') &&
    dispatch.includes('NATURAL-LANGUAGE FALLBACK'),
  'dispatch owns the detailed skill-availability contract',
)

section('pointers and concise authorities')

assert(
  agents.includes('single source of truth for current project rules'),
  'AGENTS.md remains the current SSOT',
)
assert(
  agents.split('\n').length < 343,
  'AGENTS.md is shorter than the pre-change 343 lines',
)
for (const [name, source] of [
  ['AGENTS.md', agents],
  ['completion protocol', steering],
  ['completion template', template],
  ['Matt workflow', workflow],
  ['handoff template', documents.get('handoff template')],
]) {
  assert(
    source.includes('dispatch-protocols.md'),
    `${name} points to the canonical dispatch protocol`,
  )
}
for (const [name, source] of [
  ['AGENTS.md', agents],
  ['dispatch protocol', dispatch],
  ['completion protocol', steering],
  ['completion template', template],
  ['Matt workflow', workflow],
  ['handoff template', documents.get('handoff template')],
  ['QA checklist template', documents.get('QA checklist template')],
]) {
  assert(
    source.includes('owner-qa-handoff-template.md'),
    `${name} points to the canonical owner-QA template`,
  )
}
assert(
  readme.includes('dev-completion-protocol.md') &&
    readme.includes('dispatch-protocols.md') &&
    readme.includes('owner-qa-handoff-template.md'),
  'steering index links each completion authority',
)

for (const field of [
  'Result:',
  'Ticket:',
  'Commit:',
  'Changed:',
  'Verify:',
  'Browser QA:',
  'Risks:',
]) {
  assert(template.includes(field), `short result field present: ${field}`)
}
assert(
  template.includes('No raw command logs') &&
    steering.includes('Do not paste raw command logs'),
  'completion reports forbid raw logs',
)
assert(
  workflow.includes('New top-level task:') &&
    workflow.includes('Worktree:') &&
    workflow.includes('Expected HEAD:'),
  'Matt workflow retains a discoverable new-task pointer',
)
assert(
  workflow.includes('internal Standards and') &&
    workflow.includes('never become the next') &&
    workflow.includes("one ticket's TDD and code-review loop"),
  'Matt workflow preserves bounded internal-review ownership',
)
assert(
  modelRoutingTableRows(modelRouting).length === 6 &&
    [...modelRouteSelectors.values()].every(
      (selector) =>
        modelRoutingTableRows(modelRouting).filter(({ work }) => selector(work))
          .length === 1,
    ) &&
    agents.includes('current model table lives in') &&
    dispatch.includes('Use the owner-approved workload routes in'),
  'model routing is structurally bound to its single authoritative table',
)
assert(
  dispatch.includes('Closed development phase state machine') &&
    dispatch.includes('Implementation gates') &&
    dispatch.includes('Pause and resume') &&
    compact(issueTracker).includes('owns storage paths and field shape only') &&
    compact(workflow).includes(
      'legal transitions and gates live in `../agents/dispatch-protocols.md`',
    ) &&
    compact(cutWorkflow).includes(
      'closed state machine, gates, pauses, and successor routing',
    ),
  'phase receipt has one detailed owner and concise authority pointers',
)
assert(
  agents.includes('sole agent-side dispatch exception') &&
    dispatch.includes('Owner-started Wayfinder coordinator exception') &&
    dispatch.includes('$coordinate-eqb-wayfinder') &&
    workflow.includes('sole agent-side exception'),
  'current authorities authorize only the explicit Wayfinder coordinator',
)
assert(
  !existsSync(resolve(ROOT, 'docs/cuts/codex-matt-governance')) &&
    [agents, dispatch, readme, workflow, cutWorkflow].every(
      (source) =>
        !/Desktop Stop Hook|App Server Runner|Auto-Next|agent-entrypoint/.test(
          source,
        ),
    ),
  'retired governance cut and repeated route tombstones are absent',
)

section('owner QA')

const ownerQaBlock =
  fencedBlocks(ownerQa).find((block) =>
    humanQaFields.every((field) => lineIndex(block, field) >= 0),
  ) ?? ''
assert(Boolean(ownerQaBlock), 'canonical owner-QA block exists')
assert(
  ownerQaBlock.endsWith(
    '请按清单检查。完成后回复“QA 完成”；若失败，请告诉我对应序号和实际现象。',
  ),
  'owner-QA handoff ends with its exact response request',
)
assert(
  compact(ownerQa).includes('throwaway prototypes') &&
    compact(ownerQa).includes('production implementation') &&
    compact(ownerQa).includes('post-fix re-QA') &&
    compact(ownerQa).includes('responsive checks') &&
    compact(ownerQa).includes('real-data acceptance') &&
    compact(ownerQa).includes('independent review passes'),
  'owner-QA contract covers every visible-work route',
)
assert(
  ownerQa.includes('Opening and smoke-checking the page is provisioning') &&
    ownerQa.includes('Only the owner may give the visual or product QA verdict'),
  'QA provisioning remains distinct from owner acceptance',
)
assert(
  ownerQa.includes('report `QA Ready: no`') &&
    ownerQa.includes('shortest recovery action') &&
    ownerQa.includes('do not claim to be waiting for owner QA'),
  'failed provisioning cannot claim QA readiness',
)

summary()
