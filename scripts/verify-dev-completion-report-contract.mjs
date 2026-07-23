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
const compact = (source) => source.replace(/\s+/g, ' ')
const fencedBlocks = (source) =>
  [...source.matchAll(/```(?:text)?\n([\s\S]*?)```/g)].map((match) =>
    match[1].trim(),
  )
const nextBlock = (source, marker) =>
  fencedBlocks(source).find((block) => block.startsWith(marker))
const lineIndex = (block, field) =>
  block
    .split('\n')
    .findIndex((line) => line.startsWith(field))

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
    normalized.includes('implements or fixes an implementation ticket') &&
      normalized.includes('must explicitly say to use `/implement`'),
    `${name} requires explicit /implement in implementation or fix Next`,
  )
}
assert(
  agents.includes("same top-level task until it passes") &&
    workflow.includes("one ticket's TDD and code-review loop"),
  'one ticket keeps implementation and ordinary review in one task',
)

summary()
