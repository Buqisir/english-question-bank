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

const steering = readText(ROOT, 'docs/steering/dev-completion-protocol.md')
const readme = readText(ROOT, 'docs/steering/README.md')
const template = readText(ROOT, 'docs/agents/dev-completion-report-template.md')
const workflow = readText(ROOT, 'docs/steering/codex-matt-workflow.md')
const dispatch = readText(ROOT, 'docs/agents/dispatch-protocols.md')
const handoff = readText(ROOT, 'docs/cuts/_templates/handoff.md')
const modelRouting = readText(ROOT, 'docs/agents/model-routing.md')
const compact = (source) => source.replace(/\s+/g, ' ')

section('documents')

assert(template.includes('Ticket Completion Report Template'), 'template exists')
assert(readme.includes('dev-completion-protocol.md'), 'steering index links protocol')

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

for (const field of [
  'Next：新开顶层任务',
  'Worktree:',
  'Branch:',
  'Expected HEAD:',
  'Spec:',
  'Ticket:',
  'Fixed point:',
  'Model:',
  'Effort:',
  'Prompt:',
]) {
  assert(steering.includes(field) && template.includes(field), `Next field present: ${field}`)
}

assert(
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
  steering.includes('Next：等待人工 QA') &&
    template.includes('Next：等待人工 QA') &&
    workflow.includes('Next：等待人工 QA'),
  'copyable manual QA exit exists',
)
assert(
  steering.includes('QA checklist:') &&
    template.includes('QA checklist:') &&
    workflow.includes('QA checklist:'),
  'manual QA exit names its checklist',
)
for (const value of ['low', 'medium', 'high', 'xhigh', 'max', 'ultra']) {
  assert(
    steering.includes(value) &&
      template.includes(value) &&
      workflow.includes(value) &&
      dispatch.includes(value) &&
      handoff.includes(value),
    `Next surfaces support effort: ${value}`,
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
assert(steering.includes('DONE'), 'terminal DONE exists')

summary()
