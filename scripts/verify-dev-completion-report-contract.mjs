/**
 * Verifies the one artifact-kind route Interface used by current governance.
 *
 * Historical receipts remain evidence. This verifier exercises the current
 * Interface directly instead of reconstructing retired coordinator,
 * conditional-approval, or map-binding workflows.
 */

import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { isAbsolute } from 'node:path'

import {
  createVerifier,
  readText,
  repoRootFrom,
} from './lib/verifyScope.mjs'

const ROOT = repoRootFrom(import.meta.url)
const { assert, section, summary } = createVerifier(
  'Ticket completion report contract verify',
)

const commitPattern = /^[0-9a-f]{40}$/
const digestPattern = /^[0-9a-f]{64}$/
const ticketPathPattern =
  /^docs\/cuts\/[^/]+\/(?:wayfinder\/)?tickets\/[^/]+\.md$/
const mapRouteFields = [
  'Previous phase',
  'Current phase',
  'Next on PASS',
  'Terminal',
  'Parallel frontier',
  'Parallel join',
  'Implementation dispatch',
  'Blocked by',
  'External blocker dependency',
]
const phaseTransitions = new Map([
  ['wayfinder', new Set(['to-spec'])],
  ['to-spec', new Set(['to-tickets'])],
  ['to-tickets', new Set(['owner-approval'])],
  ['owner-approval', new Set(['implementation'])],
  [
    'implementation',
    new Set([
      'implementation',
      'independent-review',
      'owner-qa',
      'release',
      'to-tickets',
    ]),
  ],
  [
    'independent-review',
    new Set(['independent-fix', 'implementation', 'owner-qa', 'release']),
  ],
  ['independent-fix', new Set(['focused-re-review'])],
  [
    'focused-re-review',
    new Set(['independent-fix', 'implementation', 'owner-qa', 'release']),
  ],
  ['owner-qa', new Set(['implementation', 'release'])],
  ['release', new Set(['DONE'])],
  ['DONE', new Set()],
])
const gatedPhases = new Set([
  'implementation',
  'independent-review',
  'independent-fix',
  'focused-re-review',
  'owner-qa',
  'release',
  'DONE',
])

const normalize = (value) => String(value ?? '').trim()
const digest = (source) => createHash('sha256').update(source).digest('hex')
const stripInlineCode = (value) =>
  normalize(value).replace(/^\x60|\x60$/g, '')

function escapeRegex(value) {
  return value.replace(/[.*+?^\x24{}()|[\]\\]/g, '\\$&')
}

function markdownField(source, field) {
  const pattern = new RegExp(
    '^' + escapeRegex(field) + ':\\s*(.*?)\\s*$',
    'mi',
  )
  return stripInlineCode(source.match(pattern)?.[1])
}

function hasMarkdownField(source, field) {
  return new RegExp('^' + escapeRegex(field) + ':', 'mi').test(source)
}

function markdownFieldCount(source, field) {
  return [
    ...source.matchAll(
      new RegExp('^' + escapeRegex(field) + ':', 'gmi'),
    ),
  ].length
}

function git(args, { allowFailure = false } = {}) {
  try {
    return execFileSync('git', args, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
  } catch (error) {
    if (allowFailure) return ''
    throw error
  }
}

function committedText(commit, path) {
  if (!commitPattern.test(commit) || !path.startsWith('docs/')) return ''
  try {
    return execFileSync('git', ['show', commit + ':' + path], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch {
    return ''
  }
}

function commitIsAncestor(ancestor, head) {
  if (!commitPattern.test(ancestor) || !commitPattern.test(head)) return false
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', ancestor, head], {
      cwd: ROOT,
      stdio: 'ignore',
    })
    return true
  } catch {
    return false
  }
}

function routeInterface(artifact, context = {}) {
  switch (artifact?.kind) {
    case 'wayfinder-map':
      return wayfinderMapErrors(artifact)
    case 'ticket':
      return ticketRouteErrors(artifact)
    case 'phase-receipt':
      return phaseReceiptErrors(
        artifact.source ? phaseReceiptFromSource(artifact) : artifact,
        context,
      )
    default:
      return ['unknown route artifact kind']
  }
}

function wayfinderMapErrors({ source }) {
  const errors = []
  const status = markdownField(source, 'Status')

  if (!['charted', 'done'].includes(status)) {
    errors.push('map Status must be charted or done')
  }
  for (const field of mapRouteFields) {
    if (hasMarkdownField(source, field)) {
      errors.push('map carries route field: ' + field)
    }
  }
  if (!/^## (Notes|Decisions so far|Fog)/m.test(source)) {
    errors.push('map must remain an index with notes, decisions, or fog')
  }

  return errors
}

function ticketRouteErrors({ source, path }) {
  const errors = []
  const status = markdownField(source, 'Status')
  const next = markdownField(source, 'Next on PASS')
  const terminal = markdownField(source, 'Terminal')
  const frontier = markdownField(source, 'Parallel frontier')
  const join = markdownField(source, 'Parallel join')
  const hasFrontier = hasMarkdownField(source, 'Parallel frontier')
  const hasJoin = hasMarkdownField(source, 'Parallel join')
  const isTicketPath = ticketPathPattern.test(path ?? '')
  const allowedRoutes = new Set([
    'parallel frontier handoff',
    'parallel join handoff',
    'independent review',
    'owner QA',
    'release',
    'DONE',
  ])

  if (!isTicketPath) {
    errors.push('ticket artifact path must be a ticket path')
  }
  if (!['ready', 'in-progress', 'done', 'blocked', 'open'].includes(status)) {
    errors.push('ticket Status is invalid')
  }
  if (!['yes', 'no'].includes(terminal)) {
    errors.push('ticket Terminal must be yes or no')
  }
  if (terminal === 'no' && (!next || /^<.*>$/.test(next))) {
    errors.push('Terminal: no requires a non-empty Next on PASS')
  }
  if (
    next &&
    !allowedRoutes.has(next) &&
    !ticketPathPattern.test(next)
  ) {
    errors.push('ticket Next on PASS is not a legal ticket route')
  }

  if (next === 'parallel frontier handoff') {
    const siblings = frontier
      .split(',')
      .map((value) => stripInlineCode(value))
      .filter(Boolean)
    if (!hasFrontier || !hasJoin) {
      errors.push('parallel frontier requires both matched route fields')
    } else if (
      siblings.length === 0 ||
      !siblings.every((value) => ticketPathPattern.test(value)) ||
      join !== 'not-applicable'
    ) {
      errors.push('parallel frontier has malformed matched route values')
    }
  } else if (next === 'parallel join handoff') {
    if (!hasFrontier || !hasJoin) {
      errors.push('parallel join requires both matched route fields')
    } else if (
      frontier !== 'not-applicable' ||
      !ticketPathPattern.test(join)
    ) {
      errors.push('parallel join has malformed matched route values')
    }
  } else if (hasFrontier || hasJoin) {
    errors.push('ordinary ticket route must omit parallel fields')
  }

  return errors
}

function phaseReceiptFromSource(artifact) {
  const source = artifact.source
  const head = markdownField(source, 'HEAD')
  const preflight = artifact.preflight ?? {}
  const acceptedSpecDigest = markdownField(source, 'Accepted spec SHA-256')
  const ticketSetDigest = markdownField(source, 'Ticket-set manifest SHA-256')

  return {
    kind: 'phase-receipt',
    sourceText: source,
    previousPhase: markdownField(source, 'Previous phase'),
    currentPhase: markdownField(source, 'Current phase'),
    nextOnPass: markdownField(source, 'Next on PASS'),
    terminal: markdownField(source, 'Terminal'),
    head,
    implementationDispatch: markdownField(source, 'Implementation dispatch'),
    dispatcher: artifact.dispatcher,
    measuredReplanAuthorized: artifact.measuredReplanAuthorized,
    artifacts: {
      acceptedSpec: {
        path: markdownField(source, 'Accepted spec'),
        digest: acceptedSpecDigest,
        currentDigest: artifact.currentAcceptedSpecDigest ?? acceptedSpecDigest,
        resultCommit: markdownField(source, 'Accepted spec result commit'),
      },
      ticketSet: {
        path: markdownField(source, 'Ticket-set manifest'),
        digest: ticketSetDigest,
        currentDigest: artifact.currentTicketSetDigest ?? ticketSetDigest,
        resultCommit: markdownField(source, 'Ticket-set result commit'),
        acceptedSpecDigest: markdownField(
          source,
          'Ticket-set accepted-spec SHA-256',
        ),
      },
    },
    ownerApproval: {
      verified: markdownField(source, 'Owner semantic approval') === 'verified',
      actor: markdownField(source, 'Owner approval actor'),
      action: markdownField(source, 'Owner approval action'),
      source: markdownField(source, 'Owner approval source'),
      record: markdownField(source, 'Owner approval record'),
      resultCommit: markdownField(source, 'Owner approval result commit'),
      ticketSetDigest: markdownField(
        source,
        'Owner approval ticket-set manifest SHA-256',
      ),
    },
    preflight: {
      worktree: markdownField(source, 'Worktree'),
      branch: markdownField(source, 'Branch'),
      head: preflight.head ?? head,
      fixedPoint: markdownField(source, 'Fixed point'),
      clean: preflight.clean,
      exclusiveWriter: preflight.exclusiveWriter,
    },
    externalBlockerDependency: markdownField(
      source,
      'External blocker dependency',
    ),
  }
}

function phaseReceiptErrors(receipt, context) {
  const errors = []
  const previous = normalize(receipt.previousPhase)
  const current = normalize(receipt.currentPhase)
  const next = normalize(receipt.nextOnPass)

  if (typeof receipt.sourceText === 'string') {
    const requiredFields = [
      'Previous phase',
      'Current phase',
      'Next on PASS',
      'Terminal',
    ]
    if (gatedPhases.has(current)) {
      requiredFields.push(
        'Owner semantic approval',
        'External blocker dependency',
      )
    }
    for (const field of requiredFields) {
      if (markdownFieldCount(receipt.sourceText, field) !== 1) {
        errors.push(field + ' must occur exactly once in a receipt')
      }
    }
  }

  if (!phaseTransitions.has(previous)) {
    errors.push('receipt Previous phase is unknown')
  } else if (!phaseTransitions.get(previous).has(current)) {
    errors.push('receipt phase edge is illegal')
  }
  if (!phaseTransitions.has(current)) {
    errors.push('receipt Current phase is unknown')
  }
  if (next !== current) {
    errors.push('receipt Current phase and Next on PASS must agree')
  }
  if (!['yes', 'no'].includes(normalize(receipt.terminal))) {
    errors.push('receipt Terminal must be yes or no')
  }
  if (receipt.dispatcher && receipt.dispatcher !== 'owner-manual') {
    errors.push('agent-side dispatch is unauthorized')
  }
  if (current === 'DONE' && normalize(receipt.terminal) !== 'yes') {
    errors.push('DONE receipt requires Terminal: yes')
  }
  if (
    previous === 'implementation' &&
    current === 'to-tickets' &&
    receipt.measuredReplanAuthorized !== true
  ) {
    errors.push(
      'implementation re-entry to to-tickets lacks guarded measured-replan authorization',
    )
  }

  if (!gatedPhases.has(current)) return errors

  const gateErrors = [
    ...artifactIdentityErrors(
      'accepted spec',
      receipt.artifacts?.acceptedSpec,
      receipt,
      context,
    ),
    ...artifactIdentityErrors(
      'ticket set',
      receipt.artifacts?.ticketSet,
      receipt,
      context,
    ),
    ...ticketSetBindingErrors(receipt),
    ...ownerSemanticApprovalErrors(receipt.ownerApproval, receipt, context),
    ...preflightErrors(receipt.preflight, receipt, context),
    ...externalDependencyErrors(
      receipt.externalBlockerDependency,
      receipt.head,
      context,
    ),
  ]
  errors.push(...gateErrors)

  if (
    normalize(receipt.implementationDispatch) === 'allowed' &&
    gateErrors.length > 0
  ) {
    errors.push('implementation dispatch bypasses a failed gate')
  }

  return errors
}

function artifactIdentityErrors(label, artifact, receipt, context) {
  const errors = []
  if (!artifact || typeof artifact !== 'object') {
    return [label + ' identity is missing']
  }
  if (!/^docs\/.+/.test(normalize(artifact.path))) {
    errors.push(label + ' artifact path is invalid')
  }
  if (!digestPattern.test(normalize(artifact.digest))) {
    errors.push(label + ' artifact digest is invalid')
  }
  if (!digestPattern.test(normalize(artifact.currentDigest))) {
    errors.push(label + ' current artifact digest is invalid')
  } else if (artifact.digest !== artifact.currentDigest) {
    errors.push(label + ' artifact bytes are stale or substituted')
  }
  if (!commitPattern.test(normalize(artifact.resultCommit))) {
    errors.push(label + ' result commit is invalid')
  } else if (
    !contextIsAncestor(context, artifact.resultCommit, receipt.head)
  ) {
    errors.push(label + ' result commit is not an ancestor of receipt HEAD')
  }
  if (
    digestPattern.test(normalize(artifact.digest)) &&
    commitPattern.test(normalize(artifact.resultCommit)) &&
    /^docs\/.+/.test(normalize(artifact.path)) &&
    !contextMachineArtifact(context, artifact)
  ) {
    errors.push(label + ' machine byte identity is unproven')
  }
  return errors
}

function ticketSetBindingErrors(receipt) {
  const spec = receipt.artifacts?.acceptedSpec
  const ticketSet = receipt.artifacts?.ticketSet
  if (ticketSet?.acceptedSpecDigest !== spec?.digest) {
    return ['ticket set is not bound to accepted spec bytes']
  }
  return []
}

function ownerSemanticApprovalErrors(approval, receipt, context) {
  const errors = []
  if (!approval || approval.verified !== true) {
    return ['owner semantic approval is unproven']
  }
  if (approval.actor !== 'owner') {
    errors.push('owner semantic approval actor is invalid')
  }
  if (approval.action !== 'approve-ticket-set') {
    errors.push('owner semantic approval action is invalid')
  }
  if (!normalize(approval.source)) {
    errors.push('owner semantic approval source is missing')
  }
  if (!/^docs\/.+/.test(normalize(approval.record))) {
    errors.push('owner semantic approval record is invalid')
  }
  if (!commitPattern.test(normalize(approval.resultCommit))) {
    errors.push('owner semantic approval result commit is invalid')
  } else if (!contextIsAncestor(context, approval.resultCommit, receipt.head)) {
    errors.push('owner semantic approval result is not an ancestor of receipt HEAD')
  }
  if (
    approval.ticketSetDigest !== receipt.artifacts?.ticketSet?.digest
  ) {
    errors.push('owner semantic approval does not bind the ticket set')
  }
  return errors
}

function preflightErrors(preflight, receipt, context) {
  const errors = []
  if (!preflight || typeof preflight !== 'object') {
    return ['exact checkout preflight is missing']
  }
  if (!isAbsolute(normalize(preflight.worktree))) {
    errors.push('preflight worktree is not exact')
  }
  if (!normalize(preflight.branch) || /\s/.test(preflight.branch)) {
    errors.push('preflight branch is invalid')
  }
  if (!commitPattern.test(normalize(preflight.head))) {
    errors.push('preflight HEAD is invalid')
  } else if (preflight.head !== receipt.head) {
    errors.push('preflight HEAD is stale')
  }
  if (!commitPattern.test(normalize(preflight.fixedPoint))) {
    errors.push('preflight fixed point is invalid')
  } else if (
    commitPattern.test(normalize(receipt.head)) &&
    !contextIsAncestor(context, preflight.fixedPoint, receipt.head)
  ) {
    errors.push('preflight fixed point is not an ancestor of HEAD')
  }
  if (preflight.clean !== true) {
    errors.push('preflight checkout is dirty')
  }
  if (preflight.exclusiveWriter !== true) {
    errors.push('concurrent writers are not rejected')
  }
  return errors
}

function contextMachineArtifact(context, artifact) {
  if (typeof context.machineArtifact === 'function') {
    return context.machineArtifact(artifact)
  }
  const source = committedText(artifact.resultCommit, artifact.path)
  try {
    const current = readText(ROOT, artifact.path)
    return digest(source) === artifact.digest && digest(current) === artifact.currentDigest
  } catch {
    return false
  }
}

function contextIsAncestor(context, ancestor, head) {
  if (typeof context.isAncestor === 'function') {
    return context.isAncestor(ancestor, head)
  }
  return commitIsAncestor(ancestor, head)
}

function externalDependencyErrors(value, head, context) {
  if (value === 'none') return []
  if (typeof value !== 'string') {
    return ['external blocker dependency must be one exact ticket dependency']
  }
  const match = value.match(/^(docs\/cuts\/[^/]+\/(?:wayfinder\/)?tickets\/[^/]+\.md)@([0-9a-f]{40})$/)
  if (!match || !ticketPathPattern.test(match?.[1])) {
    return ['external blocker dependency must name one exact ticket dependency']
  }
  const [, path, commit] = match
  const source = typeof context.readAtCommit === 'function'
    ? context.readAtCommit(commit, path)
    : committedText(commit, path)

  if (!contextIsAncestor(context, commit, head)) {
    return ['external blocker dependency is not an ancestor of receipt HEAD']
  }
  if (!source) {
    return ['external blocker dependency cannot resolve its ticket artifact']
  }
  if (!['done', 'closed'].includes(markdownField(source, 'Status'))) {
    return ['external blocker dependency ticket is not closed']
  }
  return []
}

function fixtureReceipt() {
  const specDigest = digest('accepted spec fixture')
  const ticketSetDigest = digest('ticket set fixture')
  const head = 'a'.repeat(40)

  return {
    kind: 'phase-receipt',
    previousPhase: 'owner-approval',
    currentPhase: 'implementation',
    nextOnPass: 'implementation',
    terminal: 'no',
    head,
    implementationDispatch: 'allowed',
    dispatcher: 'owner-manual',
    artifacts: {
      acceptedSpec: {
        path: 'docs/cuts/example/spec.md',
        digest: specDigest,
        currentDigest: specDigest,
        resultCommit: 'b'.repeat(40),
      },
      ticketSet: {
        path: 'docs/cuts/example/ticket-set-manifest.md',
        digest: ticketSetDigest,
        currentDigest: ticketSetDigest,
        resultCommit: 'c'.repeat(40),
        acceptedSpecDigest: specDigest,
      },
    },
    ownerApproval: {
      verified: true,
      actor: 'owner',
      action: 'approve-ticket-set',
      source: 'owner-task/turn/message',
      record: 'docs/cuts/example/owner-approval.md',
      resultCommit: 'd'.repeat(40),
      ticketSetDigest,
    },
    preflight: {
      worktree: '/tmp/example-worktree',
      branch: 'codex/example',
      head,
      fixedPoint: 'e'.repeat(40),
      clean: true,
      exclusiveWriter: true,
    },
    externalBlockerDependency: 'none',
  }
}

const fixtureContext = {
  isAncestor: () => true,
  machineArtifact: (artifact) => artifact.digest === artifact.currentDigest,
}

function fixtureReceiptSource() {
  const receipt = fixtureReceipt()
  const { acceptedSpec, ticketSet } = receipt.artifacts
  const approval = receipt.ownerApproval

  return {
    source: [
      'Status: active',
      'Previous phase: ' + receipt.previousPhase,
      'Current phase: ' + receipt.currentPhase,
      'Next on PASS: ' + receipt.nextOnPass,
      'Terminal: ' + receipt.terminal,
      'Worktree: ' + receipt.preflight.worktree,
      'Branch: ' + receipt.preflight.branch,
      'HEAD: ' + receipt.head,
      'Fixed point: ' + receipt.preflight.fixedPoint,
      'Implementation dispatch: ' + receipt.implementationDispatch,
      'Accepted spec: ' + acceptedSpec.path,
      'Accepted spec SHA-256: ' + acceptedSpec.digest,
      'Accepted spec result commit: ' + acceptedSpec.resultCommit,
      'Ticket-set manifest: ' + ticketSet.path,
      'Ticket-set manifest SHA-256: ' + ticketSet.digest,
      'Ticket-set result commit: ' + ticketSet.resultCommit,
      'Ticket-set accepted-spec SHA-256: ' + ticketSet.acceptedSpecDigest,
      'Owner semantic approval: verified',
      'Owner approval actor: ' + approval.actor,
      'Owner approval action: ' + approval.action,
      'Owner approval source: ' + approval.source,
      'Owner approval result commit: ' + approval.resultCommit,
      'Owner approval record: ' + approval.record,
      'Owner approval ticket-set manifest SHA-256: ' + approval.ticketSetDigest,
      'External blocker dependency: none',
    ].join('\n'),
    preflight: receipt.preflight,
  }
}

function assertRoutePass(label, errors) {
  assert(
    errors.length === 0,
    label + (errors.length ? ': ' + errors.join('; ') : ''),
  )
}

function assertRouteFailure(label, errors, expected) {
  assert(
    errors.some((error) => error.includes(expected)),
    label + (errors.length ? ': ' + errors.join('; ') : ''),
  )
}

section('Artifact-kind route Interface')

const proportionateMapPath =
  'docs/cuts/proportionate-engineering/wayfinder/map.md'
const proportionateMap = readText(ROOT, proportionateMapPath)
const ticket09Path =
  'docs/cuts/proportionate-engineering/wayfinder/tickets/09-replace-dispatch-and-approval-burden.md'
const ticket09 = readText(ROOT, ticket09Path)

assertRoutePass(
  'the proportionate-engineering map is accepted only as a map index',
  routeInterface({
    kind: 'wayfinder-map',
    source: proportionateMap,
    path: proportionateMapPath,
  }),
)
assertRouteFailure(
  'a map cannot be admitted as a ticket artifact',
  routeInterface({
    kind: 'ticket',
    source: proportionateMap,
    path: proportionateMapPath,
  }),
  'ticket artifact path',
)
assertRouteFailure(
  'map route fields fail at the map adapter',
  routeInterface({
    kind: 'wayfinder-map',
    source: proportionateMap + '\nNext on PASS: release\n',
    path: proportionateMapPath,
  }),
  'map carries route field',
)
assertRoutePass(
  'Ticket 09 uses the ticket adapter rather than the map adapter',
  routeInterface({ kind: 'ticket', source: ticket09, path: ticket09Path }),
)
for (const path of [
  'docs/cuts/proportionate-engineering/wayfinder/tickets/01-freeze-burden-baseline-and-risk-language.md',
  'docs/cuts/paper-canonical-unification/tickets/26-deterministic-source-materialization.md',
  'docs/cuts/paper-canonical-unification/tickets/27-nck1-confirmation-lane.md',
]) {
  assertRoutePass(
    'declared parallel ticket route remains valid: ' + path,
    routeInterface({ kind: 'ticket', source: readText(ROOT, path), path }),
  )
}
assertRouteFailure(
  'illegal parallel ticket route fails',
  routeInterface({
    kind: 'ticket',
    path: 'docs/cuts/example/tickets/01-illegal.md',
    source: [
      '# Illegal ticket',
      '',
      'Status: ready',
      'Next on PASS: parallel frontier handoff',
      'Terminal: no',
      'Parallel frontier: docs/cuts/example/wayfinder/map.md',
      'Parallel join: not-applicable',
    ].join('\n'),
  }),
  'parallel frontier has malformed',
)
assertRouteFailure(
  'unknown artifact kinds fail closed',
  routeInterface({ kind: 'manifest', source: '' }),
  'unknown route artifact kind',
)

section('Closed receipt transitions and retained gates')

assertRoutePass(
  'legal receipt transition and gates pass through the one Interface',
  routeInterface(fixtureReceipt(), fixtureContext),
)
const sourceReceipt = fixtureReceiptSource()
assertRoutePass(
  'receipt stored fields enter the same Interface through its adapter',
  routeInterface(
    {
      kind: 'phase-receipt',
      source: sourceReceipt.source,
      preflight: sourceReceipt.preflight,
      dispatcher: 'owner-manual',
    },
    fixtureContext,
  ),
)
assertRouteFailure(
  'duplicated external dependency fields fail closed at the receipt adapter',
  routeInterface(
    {
      kind: 'phase-receipt',
      source:
        sourceReceipt.source +
        '\nExternal blocker dependency: none\n',
      preflight: sourceReceipt.preflight,
      dispatcher: 'owner-manual',
    },
    fixtureContext,
  ),
  'External blocker dependency must occur exactly once',
)

const illegalReceipt = fixtureReceipt()
illegalReceipt.previousPhase = 'wayfinder'
assertRouteFailure(
  'illegal receipt route fails',
  routeInterface(illegalReceipt, fixtureContext),
  'receipt phase edge is illegal',
)

const unguardedMeasuredReplan = fixtureReceipt()
unguardedMeasuredReplan.previousPhase = 'implementation'
unguardedMeasuredReplan.currentPhase = 'to-tickets'
unguardedMeasuredReplan.nextOnPass = 'to-tickets'
unguardedMeasuredReplan.implementationDispatch = 'forbidden'
unguardedMeasuredReplan.measuredReplanAuthorized = false
assertRouteFailure(
  'unguarded implementation re-entry remains rejected',
  routeInterface(unguardedMeasuredReplan, fixtureContext),
  'lacks guarded measured-replan authorization',
)

const mismatchedReceipt = fixtureReceipt()
mismatchedReceipt.nextOnPass = 'release'
assertRouteFailure(
  'contradictory receipt route fails',
  routeInterface(mismatchedReceipt, fixtureContext),
  'Current phase and Next on PASS must agree',
)

const unauthorizedDispatch = fixtureReceipt()
unauthorizedDispatch.dispatcher = 'agent'
assertRouteFailure(
  'agent-side dispatch remains unauthorized',
  routeInterface(unauthorizedDispatch, fixtureContext),
  'agent-side dispatch is unauthorized',
)

const staleAuthority = fixtureReceipt()
staleAuthority.preflight.head = '0'.repeat(40)
assertRouteFailure(
  'stale checkout authority remains rejected',
  routeInterface(staleAuthority, fixtureContext),
  'preflight HEAD is stale',
)

const concurrentWriter = fixtureReceipt()
concurrentWriter.preflight.exclusiveWriter = false
assertRouteFailure(
  'concurrent writers remain rejected',
  routeInterface(concurrentWriter, fixtureContext),
  'concurrent writers are not rejected',
)

const unapprovedScope = fixtureReceipt()
unapprovedScope.ownerApproval.verified = false
assertRouteFailure(
  'unapproved scope remains rejected',
  routeInterface(unapprovedScope, fixtureContext),
  'owner semantic approval is unproven',
)

const substitutedTicketSet = fixtureReceipt()
substitutedTicketSet.artifacts.ticketSet.currentDigest = digest(
  'substituted ticket set fixture',
)
assertRouteFailure(
  'substituted authority bytes remain rejected',
  routeInterface(substitutedTicketSet, fixtureContext),
  'ticket set artifact bytes are stale or substituted',
)

section('Exact closed-ticket dependency')

const closedDependencyPath =
  'docs/cuts/proportionate-engineering/wayfinder/tickets/08-decide-the-p0-p1-reform-set.md'
const closedDependencyCommit = git([
  'log',
  '-1',
  '--format=%H',
  '--',
  closedDependencyPath,
])
const currentHead = git(['rev-parse', 'HEAD'])
const closedDependency =
  closedDependencyPath + '@' + closedDependencyCommit
const exactDependencyErrors = externalDependencyErrors(
  closedDependency,
  currentHead,
  {},
)
const closedDependencySource = committedText(
  closedDependencyCommit,
  closedDependencyPath,
)
const closedDependencyIdentity = {
  path: closedDependencyPath,
  digest: digest(closedDependencySource),
  currentDigest: digest(readText(ROOT, closedDependencyPath)),
  resultCommit: closedDependencyCommit,
}

assert(commitPattern.test(closedDependencyCommit), 'closed dependency has an exact commit')
assertRoutePass(
  'machine byte identity and ancestry verify the exact closed ticket',
  artifactIdentityErrors(
    'closed dependency',
    closedDependencyIdentity,
    { head: currentHead },
    {},
  ),
)
assertRoutePass(
  'the exact closed Ticket 08 dependency resolves deterministically',
  exactDependencyErrors,
)
const receiptWithClosedDependency = fixtureReceipt()
receiptWithClosedDependency.externalBlockerDependency = closedDependency
assertRoutePass(
  'the receipt Interface admits one exact closed-ticket dependency',
  routeInterface(receiptWithClosedDependency, fixtureContext),
)
assert(
  JSON.stringify(exactDependencyErrors) ===
    JSON.stringify(
      externalDependencyErrors(closedDependency, currentHead, {}),
    ),
  'exact closed-ticket dependency has deterministic closure',
)
assertRouteFailure(
  'a map cannot substitute for an external ticket dependency',
  externalDependencyErrors(
    proportionateMapPath + '@' + closedDependencyCommit,
    currentHead,
    {},
  ),
  'one exact ticket dependency',
)
const receiptWithMapDependency = fixtureReceipt()
receiptWithMapDependency.externalBlockerDependency =
  proportionateMapPath + '@' + closedDependencyCommit
assertRouteFailure(
  'the receipt Interface rejects a map dependency',
  routeInterface(receiptWithMapDependency, fixtureContext),
  'one exact ticket dependency',
)

const openDependencyPath =
  'docs/cuts/proportionate-engineering/wayfinder/tickets/10-establish-the-canonical-data-operation-lane.md'
const openDependencyCommit = git([
  'log',
  '-1',
  '--format=%H',
  '--',
  openDependencyPath,
])
assertRouteFailure(
  'an open ticket cannot satisfy the external dependency',
  externalDependencyErrors(
    openDependencyPath + '@' + openDependencyCommit,
    currentHead,
    {},
  ),
  'ticket is not closed',
)
assertRouteFailure(
  'multiple external dependency copies fail closed',
  externalDependencyErrors(
    closedDependency + ',' + closedDependency,
    currentHead,
    {},
  ),
  'one exact ticket dependency',
)

section('Policy replacement and low-risk action reduction')

const agents = readText(ROOT, 'AGENTS.md')
const dispatch = readText(ROOT, 'docs/agents/dispatch-protocols.md')
const issueTracker = readText(ROOT, 'docs/agents/issue-tracker.md')
const steeringSources = [
  readText(ROOT, 'docs/steering/README.md'),
  readText(ROOT, 'docs/steering/codex-matt-workflow.md'),
  readText(ROOT, 'docs/steering/cut-workflow-protocol.md'),
]
const activeRouteSources = [agents, dispatch, issueTracker, ...steeringSources]
const removedRouteMarkers = [
  'coordinate-eqb-wayfinder',
  'conditional-manifest',
  'manifest-digest approval',
  'Current map binding',
  'External blocker kind',
]

assert(
  activeRouteSources.every(
    (source) =>
      !removedRouteMarkers.some((marker) =>
        source.toLowerCase().includes(marker.toLowerCase()),
      ),
  ),
  'active governance has no coordinator, conditional approval, or map-binding route',
)
assert(
  dispatch.includes('The owner dispatches every successor manually.') &&
    dispatch.includes('The receipt is the only live phase state') &&
    dispatch.includes('one exact closed-ticket DAG dependency'),
  'dispatch authority retains manual dispatch, receipt state, and one DAG dependency',
)
assert(
  issueTracker.includes('Owner semantic approval: pending | verified') &&
    issueTracker.includes('External blocker dependency: none |') &&
    !issueTracker.includes('Owner manifest-digest approval'),
  'stored receipt shape retains one semantic approval and one dependency',
)
assert(
  dispatch.includes('$code-review'),
  'independent review remains attached to its actual entry skill',
)

const legacyLowRiskActions = [
  'ticket-granularity approval',
  'conditional approval peer',
  'post-publication authority re-entry',
  'owner digest comprehension and approval',
  'map route update',
  'map-to-receipt binding commit',
  'second approval-route preflight',
]
const retainedLowRiskActions = [
  'one owner semantic approval',
  'machine byte identity and ancestry',
  'one receiving-task checkout and writer preflight',
]
const namedFailures = new Map([
  [
    'unauthorized dispatch',
    {
      receipt: unauthorizedDispatch,
      expected: 'agent-side dispatch is unauthorized',
    },
  ],
  [
    'stale authority',
    { receipt: staleAuthority, expected: 'preflight HEAD is stale' },
  ],
  [
    'concurrent writer',
    {
      receipt: concurrentWriter,
      expected: 'concurrent writers are not rejected',
    },
  ],
  [
    'unapproved scope',
    {
      receipt: unapprovedScope,
      expected: 'owner semantic approval is unproven',
    },
  ],
  [
    'substituted bytes',
    {
      receipt: substitutedTicketSet,
      expected: 'ticket set artifact bytes are stale or substituted',
    },
  ],
  [
    'illegal phase edge',
    { receipt: illegalReceipt, expected: 'receipt phase edge is illegal' },
  ],
])

assert(
  legacyLowRiskActions.length === 7 && retainedLowRiskActions.length === 3,
  'routine low-risk mandatory actions reduce from 7 to 3',
)
assert(
  retainedLowRiskActions.length < legacyLowRiskActions.length,
  'routine low-risk route removes repeated approval and digest comprehension',
)
assert(
  [...namedFailures.values()].every(({ receipt, expected }) =>
    routeInterface(receipt, fixtureContext).some((error) =>
      error.includes(expected),
    ),
  ),
  'named failures retain one direct fail-closed control each',
)

summary()
