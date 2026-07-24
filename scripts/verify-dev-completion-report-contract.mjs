/**
 * Verifies the Matt-native ticket completion report and manual Next contract.
 */

import {
  createVerifier,
  readText,
  repoRootFrom,
} from './lib/verifyScope.mjs'

const ROOT = repoRootFrom(import.meta.url)
const { assert, section, summary } = createVerifier('Ticket completion report contract verify')

const agents = readText(ROOT, 'AGENTS.md')
const steering = readText(ROOT, 'docs/steering/dev-completion-protocol.md')
const readme = readText(ROOT, 'docs/steering/README.md')
const template = readText(ROOT, 'docs/agents/dev-completion-report-template.md')
const workflow = readText(ROOT, 'docs/steering/codex-matt-workflow.md')
const dispatch = readText(ROOT, 'docs/agents/dispatch-protocols.md')
const handoff = readText(ROOT, 'docs/cuts/_templates/handoff.md')
const modelRouting = readText(ROOT, 'docs/agents/model-routing.md')
const reviewLevels = readText(ROOT, 'docs/agents/review-levels.md')
const reviewOverlay = readText(ROOT, 'docs/agents/cr-persona.md')
const cutWorkflow = readText(ROOT, 'docs/steering/cut-workflow-protocol.md')
const compact = (source) => source.replace(/\s+/g, ' ')
const fencedBlocks = (source) =>
  [...source.matchAll(/```(?:text)?\n([\s\S]*?)```/g)].map((match) =>
    match[1].trim(),
  )
const nextBlock = (source, marker) =>
  fencedBlocks(source).find((block) => lineIndex(block, marker) >= 0)
const attachedSkillBlock = (source, skill) =>
  fencedBlocks(source).find((block) => block.startsWith(`[$${skill}](`))
const skillRequiredTaskBlocks = (source) =>
  [
    ...source.matchAll(
      /<!-- skill-required-handoff -->\s*```(?:text)?\n([\s\S]*?)```/g,
    ),
  ].map((match) => match[1].trim())
const lineIndex = (block, field) =>
  block
    .split('\n')
    .findIndex((line) => line.startsWith(field))
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
  const attachment = lines[0].match(skillAttachmentPattern)
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

function assertStructuredBlock(name, source, marker, fields) {
  const block = nextBlock(source, marker)
  assert(Boolean(block), `${name} contains a copyable ${marker} block`)
  if (!block) {
    return ''
  }

  const indexes = fields.map((field) => lineIndex(block, field))
  for (const [index, field] of fields.entries()) {
    assert(indexes[index] >= 0, `${name} ${marker} field is in-block: ${field}`)
  }
  assert(
    indexes.every((value, index) => value >= 0 && (index === 0 || value > indexes[index - 1])),
    `${name} ${marker} fields keep the canonical order`,
  )
  return block
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
  'Next：等待人工 QA',
  'Worktree:',
  'Branch:',
  'Expected HEAD:',
  'Spec:',
  'Ticket:',
  'Fixed point:',
  'QA checklist:',
  'Prompt:',
]

section('skill attachment contract')

const skillTaskBlock = (skill, prompt, { blankLine = true } = {}) =>
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
${prompt}`

const assertInvalidSkillHandoff = (name, block, taskType, expectedError) => {
  const errors = validateSkillHandoff(block, taskType)
  assert(
    errors.some((error) => error.includes(expectedError)),
    `${name} fails with ${expectedError}`,
  )
}

assert(
  validateSkillHandoff(
    skillTaskBlock('implement', 'Use $implement to implement the ticket.'),
    'implementation',
  ).length === 0,
  'implementation handoff accepts an attachment-first $implement block',
)
assert(
  validateSkillHandoff(
    skillTaskBlock('code-review', 'Use $code-review for an independent review.'),
    'focused-re-review',
  ).length === 0,
  'focused re-review accepts an attachment-first $code-review block',
)
assertInvalidSkillHandoff(
  'missing Markdown attachment',
  skillTaskBlock('implement', 'Use $implement to implement the ticket.')
    .split('\n')
    .slice(2)
    .join('\n'),
  'implementation',
  'skill attachment',
)
assertInvalidSkillHandoff(
  'missing blank line after attachment',
  skillTaskBlock(
    'implement',
    'Use $implement to implement the ticket.',
    { blankLine: false },
  ),
  'implementation',
  'blank line',
)
assertInvalidSkillHandoff(
  'implementation attachment mismatch',
  skillTaskBlock('code-review', 'Use $implement to implement the ticket.'),
  'implementation',
  '$implement',
)
assertInvalidSkillHandoff(
  'attachment label and target mismatch',
  skillTaskBlock('implement', 'Use $implement to implement the ticket.').replace(
    '/implement/SKILL.md',
    '/code-review/SKILL.md',
  ),
  'implementation',
  'label and target',
)
assertInvalidSkillHandoff(
  'slash skill without attachment',
  `/implement
Worktree: /absolute/path/to/worktree
Branch: codex/example
Expected HEAD: 0123456789abcdef
Spec: not applicable
Ticket: not applicable
Fixed point: 0123456789abcdef
Model: gpt-5.6-terra
Effort: medium
Prompt:
Implement the ticket.`,
  'implementation',
  'skill attachment',
)
assertInvalidSkillHandoff(
  'fix handoff without $implement',
  skillTaskBlock('skill-name', 'Fix the implementation ticket.'),
  'fix',
  '$implement',
)
assertInvalidSkillHandoff(
  'independent review without $code-review',
  skillTaskBlock('implement', 'Run the independent review.'),
  'independent-review',
  '$code-review',
)
assertInvalidSkillHandoff(
  'focused re-review without $code-review',
  skillTaskBlock('implement', 'Recheck the prior Must Fix.'),
  'focused-re-review',
  '$code-review',
)
assert(
  skillRequiredTaskBlocks(`No-skill ship handoff:

\`\`\`text
Worktree: /absolute/path/to/worktree
Branch: codex/example
Expected HEAD: 0123456789abcdef
Spec: not applicable
Ticket: not applicable
Fixed point: 0123456789abcdef
Model: gpt-5.6-terra
Effort: medium
Prompt:
Ship the completed work.
\`\`\``).length === 0,
  'no-skill handoff is not forced to attach a skill',
)
assert(
  validateSkillHandoff(
    attachedSkillBlock(workflow, 'implement') ?? '',
    'implementation',
  ).length === 0,
  'workflow implementation example attaches $implement',
)
assert(
  validateSkillHandoff(
    attachedSkillBlock(workflow, 'code-review') ?? '',
    'independent-review',
  ).length === 0,
  'workflow independent-review example attaches $code-review',
)
assert(
  validateSkillHandoff(
    attachedSkillBlock(workflow, 'wayfinder') ?? '',
    'generic',
  ).length === 0,
  'workflow Wayfinder example attaches its actual entry skill',
)

section('documents')

assert(template.includes('Ticket Completion Report Template'), 'template exists')
assert(readme.includes('dev-completion-protocol.md'), 'steering index links protocol')
assert(agents.includes('single source of truth'), 'AGENTS.md is read as the project SSOT')

section('short result')

for (const field of [
  'Result:',
  'Ticket:',
  'Commit:',
  'Changed:',
  'Verify:',
  'Browser QA:',
  'Risks:',
]) {
  assert(steering.includes(field) && template.includes(field), `field present: ${field}`)
}

assert(
  steering.includes('Do not paste raw command logs') &&
    template.includes('No raw command logs'),
  'raw logs are forbidden',
)

section('manual Next')

const newTaskDocuments = [
  ['AGENTS.md', agents],
  ['completion protocol', steering],
  ['completion template', template],
  ['Matt workflow', workflow],
  ['dispatch protocol', dispatch],
  ['handoff template', handoff],
]
const newTaskBlocks = newTaskDocuments.map(([name, source]) =>
  assertStructuredBlock(name, source, 'Worktree:', newTaskFields),
)
for (const [name, source] of newTaskDocuments) {
  const blocks = skillRequiredTaskBlocks(source)
  assert(blocks.length > 0, `${name} contains a skill-required new-task block`)
  for (const [index, block] of blocks.entries()) {
    assert(
      validateSkillHandoff(block, 'generic').length === 0,
      `${name} new-task block ${index + 1} is attachment-first`,
    )
  }
}
const qaDocuments = [
  ['AGENTS.md', agents],
  ['completion protocol', steering],
  ['completion template', template],
  ['Matt workflow', workflow],
]
for (const [name, source] of qaDocuments) {
  assertStructuredBlock(name, source, 'Next：等待人工 QA', humanQaFields)
}

assert(
  agents.includes('task-applicable Spec, Ticket, and Fixed point anchor') &&
  steering.includes('all applicable anchors') &&
    template.includes('all applicable anchors') &&
    workflow.includes('all applicable anchors') &&
    dispatch.includes('all applicable anchors'),
  'Next requires every task-applicable artifact anchor',
)
assert(
  compact(steering).includes('owner should not have to find or remember') &&
    compact(template).includes('owner should not have to find or remember'),
  'Next repeats artifacts instead of relying on owner memory',
)
assert(
  newTaskBlocks.every(
    (block) =>
      block.includes('Effort: <low | medium | high | xhigh | max | ultra>'),
  ),
  'every new-task block supports low/medium/high/xhigh/max/ultra',
)
for (const block of newTaskBlocks) {
  assert(
    block.includes('Spec:') &&
      block.includes('Ticket:') &&
      block.includes('Fixed point:'),
    'new-task anchors are co-located inside one copyable block',
  )
}
assert(
  modelRouting.includes('`xhigh`, `max`, and `ultra` require explicit owner direction') &&
    steering.includes('explicit owner direction') &&
    template.includes('explicit owner direction'),
  'extended efforts stay owner-directed and evidence-based',
)
assert(
  steering.includes('does not create or supervise the') &&
    steering.includes('next top-level task'),
  'implementation task cannot dispatch a successor',
)

section('non-negotiable exit')

const exitContractDocuments = [
  ['AGENTS.md', agents],
  ['completion protocol', steering],
  ['completion template', template],
  ['Matt workflow', workflow],
]
for (const [name, source] of exitContractDocuments) {
  const normalized = compact(source)
  assert(source.includes('result-only final message is invalid'), `${name} rejects result-only finals`)
  assert(source.includes('Next：留在当前任务'), `${name} includes same-task Next`)
  assert(source.includes('Next：等待人工 QA'), `${name} includes owner-QA Next`)
  assert(source.includes('DONE'), `${name} includes terminal DONE`)
  assert(
    /implement(?:ation|s)?.{0,140}fix(?:es)?.{0,140}attach(?:es)? `\$implement`/i.test(
      normalized,
    ),
    `${name} attaches $implement for implementation or fix Next`,
  )
  assert(
    /independent review.{0,120}focused re-review.{0,120}attach(?:es)? `\$code-review`/i.test(
      normalized,
    ),
    `${name} attaches $code-review for review and re-review Next`,
  )
}
assert(
  agents.includes("same top-level task until it passes") &&
    workflow.includes("one ticket's TDD and code-review loop"),
  'one ticket keeps implementation and ordinary review in one task',
)
assert(
  agents.includes('SKILL UNAVAILABLE') &&
    agents.includes('NATURAL-LANGUAGE FALLBACK') &&
    workflow.includes('SKILL UNAVAILABLE') &&
    workflow.includes('NATURAL-LANGUAGE FALLBACK'),
  'unavailable skills and non-Codex fallbacks are declared honestly',
)
assert(
  compact(agents).includes('initial independent review') &&
    compact(agents).includes('focused re-review') &&
    compact(workflow).includes('Initial independent review') &&
    compact(workflow).includes('Focused re-review'),
  'initial review and focused re-review have distinct contracts',
)
for (const [name, source] of [
  ['AGENTS.md', agents],
  ['review levels', reviewLevels],
  ['review overlay', reviewOverlay],
  ['Matt workflow', workflow],
  ['cut workflow', cutWorkflow],
]) {
  const normalized = compact(source)
  assert(
    normalized.includes('previously reviewed HEAD') ||
      normalized.includes('previous reviewed HEAD'),
    `${name} pins focused re-review to the previously reviewed HEAD`,
  )
  assert(
    normalized.includes('fix diff') && normalized.includes('direct regressions'),
    `${name} scopes focused re-review to the fix diff and direct regressions`,
  )
  assert(
    normalized.includes('owner QA') &&
      (normalized.includes('shipping') || normalized.includes('release')),
    `${name} closes a green lineage into QA or release`,
  )
  assert(
    normalized.includes('one review lineage'),
    `${name} treats one fresh review as one lineage`,
  )
}
assert(
  exitContractDocuments.every(([, source]) =>
    !compact(source).includes('must explicitly say to use `/implement`'),
  ),
  'Prompt-only /implement contract is removed',
)
assert(
  [...newTaskDocuments, ['Matt workflow', workflow]].every(
    ([, source]) => !source.includes('starts directly with `Worktree:`'),
  ),
  'Worktree-first skill handoff contract is removed',
)
assert(
  newTaskBlocks.every(
    (block) => !block.split('\n')[0].includes('/Users/huangxuewei'),
  ),
  'tracked attachment examples use generic paths',
)

summary()
