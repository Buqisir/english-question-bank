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
  'Model:',
  'Effort:',
  'Prompt:',
]) {
  assert(steering.includes(field) && template.includes(field), `Next field present: ${field}`)
}

assert(
  steering.includes('does not create or supervise the') &&
    steering.includes('next top-level task'),
  'implementation task cannot dispatch a successor',
)
assert(steering.includes('DONE'), 'terminal DONE exists')

summary()
