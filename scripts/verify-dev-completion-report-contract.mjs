/**
 * Verifies the Matt-native completion-exit policy and its canonical templates.
 *
 * This verifier checks tracked policy artifacts and deterministic scenarios.
 * It does not inspect or claim to validate an agent's real final response.
 */

import { readdirSync, readFileSync } from 'node:fs'
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

const compact = (source) => source.replace(/\s+/g, ' ')
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
  if (!/^Terminal:\s*no\s*$/im.test(source)) {
    return []
  }

  const route = source.match(/^Next on PASS:\s*(.*?)\s*$/im)?.[1]?.trim()
  if (!route || /^<.*>$/.test(route)) {
    return ['Terminal: no requires a non-empty, non-placeholder Next on PASS']
  }
  return []
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
Model: gpt-5.6-terra
Effort: medium
Prompt:
Implement only the linked ticket.`

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
  modelRouting.includes(
    '`xhigh`, `max`, and `ultra` require explicit owner direction',
  ) &&
    dispatch.includes('explicit owner direction'),
  'extended efforts remain owner-directed',
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
