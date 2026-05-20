/**
 * Verifies the DEV completion report contract stays short and reviewable.
 */

import {
  createVerifier,
  readText,
  repoRootFrom,
} from './lib/verifyScope.mjs'

const ROOT = repoRootFrom(import.meta.url)
const { assert, section, summary } = createVerifier('DEV completion report contract verify')

const steering = readText(ROOT, '.kiro/steering/dev-completion-protocol.md')
const readme = readText(ROOT, '.kiro/steering/README.md')
const agents = readText(ROOT, 'AGENTS.md')
const template = readText(ROOT, 'docs/agents/dev-completion-report-template.md')

section('template exists and is linked')

assert(template.includes('DEV Completion Report Template'), 'template document exists')
assert(
  steering.includes('docs/agents/dev-completion-report-template.md'),
  'steering protocol links to template',
)
assert(
  readme.includes('dev-completion-protocol.md'),
  'steering README points agents to dev-completion protocol',
)
assert(
  agents.includes('dev-completion-protocol.md'),
  'AGENTS points agents to dev-completion protocol',
)

section('single short fenced report rule')

assert(
  steering.includes('exactly one fenced `text` code block'),
  'steering requires exactly one fenced text block',
)
assert(
  /no prose outside the fence/i.test(steering),
  'steering forbids prose outside completion fence',
)
assert(
  steering.includes('Recommended maximum: 60 lines'),
  'steering sets short report line budget',
)
assert(
  template.includes('Recommended maximum: 60 lines'),
  'template repeats short report line budget',
)

section('raw-log prevention')

for (const phrase of [
  'Do not paste raw verify output',
  'Use verify summaries only',
  'No raw command logs',
]) {
  assert(steering.includes(phrase) || template.includes(phrase), `contract includes: ${phrase}`)
}

section('required fields')

for (const field of [
  'PR URL',
  'Branch',
  'Commit',
  'Baseline',
  'Changed Files',
  'Verify',
  'Browser QA',
  'Forbidden Scopes',
  'Known Risks / Expected False Positives',
  'PO QA',
]) {
  assert(steering.includes(field) && template.includes(field), `required field present: ${field}`)
}

section('browser QA and PO QA boundaries')

assert(
  steering.includes('Static verify is not browser QA'),
  'steering states static verify is not browser QA',
)
assert(
  steering.includes('Link the relevant PO QA checklist'),
  'steering requires PO QA checklist link for visual surfaces',
)
assert(
  template.includes('If browser QA is not applicable, say why'),
  'template requires explanation when browser QA is not applicable',
)

summary()
