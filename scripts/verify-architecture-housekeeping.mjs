#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

let passed = 0
let failed = 0

function read(relPath) {
  return readFileSync(path.join(rootDir, relPath), 'utf8')
}

function assert(name, condition, details = '') {
  if (condition) {
    passed += 1
    console.log(`PASS ${name}`)
  } else {
    failed += 1
    console.error(`FAIL ${name}${details ? `\n  ${details}` : ''}`)
  }
}

console.log('Architecture housekeeping verify')

assert('GitHub Actions workflow template exists', existsSync(path.join(rootDir, 'docs/ci/verify-workflow-template.yml')))
assert('GitHub Actions workflow install note exists', existsSync(path.join(rootDir, 'docs/ci/verify-workflow-install.md')))
assert('code-style doc exists', existsSync(path.join(rootDir, 'docs/code-style.md')))
assert('shared UI token file exists', existsSync(path.join(rootDir, 'app/src/shared-ui/tokens.css')))
assert('CI verify entrypoint exists', existsSync(path.join(rootDir, 'scripts/verify-ci.mjs')))
assert('Matt spec template exists', existsSync(path.join(rootDir, 'docs/cuts/_templates/spec.md')))
assert('Matt ticket template exists', existsSync(path.join(rootDir, 'docs/cuts/_templates/ticket.md')))
assert('handoff template exists', existsSync(path.join(rootDir, 'docs/cuts/_templates/handoff.md')))
assert('cut note template exists', existsSync(path.join(rootDir, 'docs/cuts/_templates/cut-note.md')))
assert('decisions template exists', existsSync(path.join(rootDir, 'docs/cuts/_templates/decisions.md')))

const workflowTemplate = read('docs/ci/verify-workflow-template.yml')
assert('workflow template installs app dependencies with pnpm', workflowTemplate.includes('pnpm install --frozen-lockfile'))
assert('workflow template installs server dependencies with npm ci', workflowTemplate.includes('npm ci') && workflowTemplate.includes('working-directory: server'))
assert('workflow template runs stable verify entrypoint', workflowTemplate.includes('pnpm run verify:all'))
assert(
  'workflow template delegates app build to stable verify entrypoint',
  workflowTemplate.includes('Run app build and core verify scripts') && !workflowTemplate.includes('pnpm run build'),
)

const workflowInstallNote = read('docs/ci/verify-workflow-install.md')
const realWorkflowExists = existsSync(path.join(rootDir, '.github/workflows/verify.yml'))
assert('workflow install state is documented or installed', realWorkflowExists || workflowInstallNote.includes('Status: Not installed.'))
assert('workflow install note documents workflow scope requirement', workflowInstallNote.includes('workflow') && workflowInstallNote.includes('.github/workflows/verify.yml'))
assert('workflow install note includes server dependencies', workflowInstallNote.includes('npm ci --prefix server'))

const claudeInstructions = read('CLAUDE.md')
const agentInstructions = read('AGENTS.md')
const issueTracker = read('docs/agents/issue-tracker.md')
assert('CLAUDE delegates to AGENTS single source', claudeInstructions.includes('Read `AGENTS.md`') && claudeInstructions.includes('single source of truth'))
assert('CLAUDE does not duplicate browser rules', !claudeInstructions.includes('Codex in-app browser'))
assert('AGENTS declares single source of truth', agentInstructions.includes('single source of truth for current project rules'))
assert('issue tracker keeps fresh-task truth in tracked files', issueTracker.includes('tracked local Markdown') && issueTracker.includes('never durable'))
assert('project does not vendor stale Matt skills', !existsSync(path.join(rootDir, '.claude/skills/tdd/SKILL.md')) && !existsSync(path.join(rootDir, '.claude/skills/grill-with-docs/SKILL.md')))
assert('project does not expose retired relay agents', !existsSync(path.join(rootDir, '.claude/agents/dev.md')) && !existsSync(path.join(rootDir, '.claude/agents/cr-reviewer.md')))

const appPackage = read('app/package.json')
assert('app exposes verify:all script', appPackage.includes('"verify:all": "node ../scripts/verify-ci.mjs"'))

const indexCss = read('app/src/index.css')
const tokensCss = read('app/src/shared-ui/tokens.css')
assert('index.css imports shared tokens first', indexCss.startsWith('@import "./shared-ui/tokens.css";'))
assert('tokens define core color namespace', tokensCss.includes('--eqb-color-paper') && tokensCss.includes('--eqb-color-primary'))
assert('tokens define spacing scale', tokensCss.includes('--eqb-space-1') && tokensCss.includes('--eqb-space-5'))

function readVerifyCiRegistry() {
  const result = spawnSync(process.execPath, ['scripts/verify-ci.mjs', '--list-json'], {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (result.status !== 0) {
    return {
      ok: false,
      error: result.stderr || result.stdout || `exit ${result.status}`,
      preflight: [],
      scripts: [],
    }
  }
  try {
    const registry = JSON.parse(result.stdout)
    return {
      ok: true,
      error: '',
      preflight: Array.isArray(registry.preflight) ? registry.preflight : [],
      scripts: Array.isArray(registry.scripts) ? registry.scripts : [],
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      preflight: [],
      scripts: [],
    }
  }
}

const verifyCiRegistry = readVerifyCiRegistry()
assert('verify-ci exposes executable --list-json registry', verifyCiRegistry.ok, verifyCiRegistry.error)
const verifyCiScripts = verifyCiRegistry.scripts
const verifyCiPreflightLabels = verifyCiRegistry.preflight.map((step) => step?.label)
assert('verify-ci runs git diff --check', verifyCiPreflightLabels.includes('git diff --check'))
assert('verify-ci runs app build/typecheck', verifyCiPreflightLabels.includes('app build/typecheck'))
assert('verify-ci keeps C7 import contracts in stable suite', verifyCiScripts.includes('scripts/verify-c7-paper-import-contracts.mjs'))
assert('verify-ci keeps C8 draft paper contracts in stable suite', verifyCiScripts.includes('scripts/verify-c8-draft-paper-contracts.mjs'))
assert('verify-ci keeps draft render contract in stable suite', verifyCiScripts.includes('scripts/verify-c8-draft-paper-render-model.mjs'))
assert('verify-ci excludes C8 forbidden-scope cut script', !verifyCiScripts.includes('scripts/verify-c8-forbidden-scope.mjs'))
assert('verify-ci excludes host interaction cut forbidden-scope script', !verifyCiScripts.includes('scripts/verify-paper-surface-host-interaction.mjs'))

const scriptsReadme = read('scripts/README.md')
assert('scripts README documents stable CI entrypoint', scriptsReadme.includes('Stable CI entrypoint'))
assert('scripts README documents build/typecheck in stable CI', scriptsReadme.includes('build/typecheck'))
assert('scripts README documents server dependency install', scriptsReadme.includes('npm ci') && scriptsReadme.includes('server/'))
assert('scripts README documents workflow-scope install constraint', scriptsReadme.includes('requires a token with workflow scope'))
// reading-analysis-retire (2026-07-16): `verify-paper-surface-host-interaction.mjs`
// and its README row are retired (reachability.md §4 B-class, plan.md
// Scope 步 6) — the row this assertion checked for no longer exists.
// Mechanical fix required by the deletion itself, not a scope-guard
// loosening: the cross-check assertions below (README yes/no rows ↔
// verify-ci registry membership) still fully cover the invariant this
// script exists to protect.
assert('scripts README marks C8 draft paper contracts as CI', scriptsReadme.includes('C8 draft-paper API/search/workbench contract | yes'))

function parseReadmeCiRows(source) {
  const rows = []
  const lines = source.split(/\r?\n/)
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (!line.includes('| Script |') || !line.includes('Runs in CI?')) {
      continue
    }
    index += 2
    while (index < lines.length && lines[index].trim().startsWith('|')) {
      const cells = lines[index]
        .trim()
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((cell) => cell.trim())
      rows.push({
        line: index + 1,
        script: cells[0] || '',
        ci: cells[2] || '',
        cellCount: cells.length,
      })
      index += 1
    }
  }
  return rows
}

function normalizeReadmeScript(script) {
  const bare = script.replaceAll('`', '').trim()
  if (!bare) {
    return ''
  }
  return bare.startsWith('scripts/') ? bare : `scripts/${bare}`
}

const readmeCiRows = parseReadmeCiRows(scriptsReadme)
const malformedRows = readmeCiRows.filter((row) => row.cellCount !== 3 || !['yes', 'no'].includes(row.ci))
assert(
  'scripts README CI tables have exactly yes/no in Runs in CI column',
  malformedRows.length === 0,
  malformedRows.map((row) => `line ${row.line}: ${row.script} => ${row.ci || '(blank)'}`).join('\n'),
)

const readmeYesScripts = readmeCiRows
  .filter((row) => row.ci === 'yes')
  .map((row) => normalizeReadmeScript(row.script))
  .filter((script) => script !== 'scripts/verify-ci.mjs')
const readmeNoScripts = readmeCiRows
  .filter((row) => row.ci === 'no')
  .map((row) => normalizeReadmeScript(row.script))

const missingFromVerifyCi = readmeYesScripts.filter((script) => !verifyCiScripts.includes(script))
assert(
  'scripts README yes rows are included in verify-ci',
  missingFromVerifyCi.length === 0,
  missingFromVerifyCi.join('\n'),
)

const missingFromReadmeYes = verifyCiScripts.filter((script) => !readmeYesScripts.includes(script))
assert(
  'verify-ci scripts are marked yes in scripts README',
  missingFromReadmeYes.length === 0,
  missingFromReadmeYes.join('\n'),
)

const noRowsInVerifyCi = readmeNoScripts.filter((script) => verifyCiScripts.includes(script))
assert(
  'scripts README no rows are absent from verify-ci',
  noRowsInVerifyCi.length === 0,
  noRowsInVerifyCi.join('\n'),
)

const codeStyle = read('docs/code-style.md')
assert('code-style documents file suffix rules', codeStyle.includes('Server runtime code uses `.mjs`'))
assert('code-style documents server module targets', codeStyle.includes('server/question-bank/'))
assert('code-style documents CSS token policy', codeStyle.includes('app/src/shared-ui/tokens.css'))
assert('code-style documents build/typecheck in stable suite', codeStyle.includes('including app build/typecheck'))

const cutWorkflow = read('docs/steering/cut-workflow-protocol.md')
assert('workflow protocol follows Matt planning chain', cutWorkflow.includes('grill-with-docs') && cutWorkflow.includes('to-spec') && cutWorkflow.includes('to-tickets'))
assert('workflow protocol assigns one fresh implementation task per ticket', cutWorkflow.includes('one fresh top-level `/implement` task per ready ticket'))
assert('workflow protocol reserves Wayfinder for fog', cutWorkflow.includes('Wayfinder') && cutWorkflow.includes('Huge and foggy'))
assert('workflow protocol defines escalation signals', cutWorkflow.includes('CONTEXT INSUFFICIENT') && cutWorkflow.includes('SPEC CONTRADICTS'))
assert(
  'workflow protocol preserves manual shipping with one coordinator exception',
  cutWorkflow.includes('owner manually opens one ship task') &&
    cutWorkflow.includes('$coordinate-eqb-wayfinder') &&
    cutWorkflow.includes('dispatch-protocols.md'),
)

const mattWorkflow = read('docs/steering/codex-matt-workflow.md')
assert(
  'Matt workflow keeps manual dispatch and names the sole coordinator exception',
  mattWorkflow.includes('Manual owner dispatch is the default') &&
    mattWorkflow.includes('sole agent-side exception') &&
    mattWorkflow.includes('$coordinate-eqb-wayfinder'),
)
assert('Matt workflow defines one directly pasteable next-task block', mattWorkflow.includes('New top-level task:') && mattWorkflow.includes('Worktree:') && mattWorkflow.includes('Expected HEAD:'))
assert('Matt workflow separates internal workers from relay', mattWorkflow.includes('internal Standards and Spec reviewers') && mattWorkflow.includes('never become the next ticket or phase'))

const status = read('docs/STATUS.md')
assert(
  'STATUS records the current owner-explicit coordinator policy',
  status.includes('owner 显式 Wayfinder 薄协调治理发布') &&
    status.includes('$coordinate-eqb-wayfinder') &&
    status.includes('Stop Hook bridge') &&
    status.includes('App Server Runner') &&
    status.includes('永不启用或重试'),
)
assert(
  'STATUS preserves the retired Matt relay history',
  status.includes('Matt-native 手工顶层任务流程') &&
    status.includes('取代 2026-07-22') &&
    status.includes('不得路由当前工作'),
)

const refactorRoadmap = read('docs/architecture/refactor-roadmap-2026-06.md')
const refactorHandoff = read('docs/architecture/refactor-handoff-2026-06.md')
function normalizeGovernanceProse(source) {
  return source
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[`*_/#:()[\]{}"'“”‘’.,;!?—–→+-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const retiredAuthorityPatterns = [
  {
    label: 'current or living authority',
    pattern: /\b(current|living|live|active|operative|present|authoritative|controlling|governing|canonical)\s+(roadmap|handoff|plan|instructions?|workflow|source)\b/,
  },
  {
    label: 'agent-created relay successor',
    pattern: /\b(agent|automation|bot|claude|coordinator|dev|implementer|maintainer|relay|reviewer|rm)\s+(creates?|opens?|starts?|spawns?|dispatches?|initiates?|launches?)\s+(the\s+)?(next|following|subsequent|successor)\s+(task|phase|stage)\b/,
  },
  {
    label: 'passive agent-created relay successor',
    pattern: /\b(next|following|subsequent|successor)\s+(task|phase|stage)\s+(is|gets|will be)\s+(created|opened|started|spawned|dispatched|initiated|launched)\s+by\s+(an?\s+)?(agent|automation|bot|claude|coordinator|dev|implementer|maintainer|relay|reviewer|rm)\b/,
  },
  {
    label: 'delegated or agent-initiated integration',
    pattern: /\b(agent|automation|bot|claude|coordinator|delegate|delegated|dev|implementer|maintainer|reviewer|rm)\s+(is\s+)?(authorized|allowed|assigned|empowered|entitled|permitted)?\s*(may|can|should|will|to)?\s*(merge|land|integrate|push|publish|release|ship)\b/,
  },
  {
    label: 'integration assigned to an agent role',
    pattern: /\b(merge|land|integrate|push|publish|release|ship)\s+(is\s+|gets\s+|will be\s+)?(assigned|authorized|delegated|entrusted|permitted)?\s*(by|per|through|to|via)\s+(an?\s+)?(agent|automation|bot|claude|coordinator|delegate|delegated|dev|implementer|maintainer|reviewer|rm)\b/,
  },
  {
    label: 'solo merge permission',
    pattern: /\b(mergeable|shippable|releasable)\s+(alone|by|solo|without)\b/,
  },
]

function retiredAuthorityFinding(source) {
  const normalized = normalizeGovernanceProse(source)
  return retiredAuthorityPatterns.find(({ pattern }) => pattern.test(normalized))
}

for (const sample of [
  'Status: Living roadmap',
  'This is the active plan.',
  'Status: present roadmap.',
  'The coordinator opens the following phase.',
  'The reviewer initiates the subsequent stage.',
  'The maintainer opens the next task.',
  'The next task is launched by an implementer.',
  'An agent may land the branch.',
  'The implementer is authorized to merge.',
  'Integrate via delegated RM.',
  'Merge is delegated to RM.',
  'This change is shippable solo.',
]) {
  assert(
    `housekeeping catches retired authority paraphrase: ${sample}`,
    Boolean(retiredAuthorityFinding(sample)),
  )
}

for (const [name, source] of [
  ['refactor roadmap', refactorRoadmap],
  ['refactor handoff', refactorHandoff],
]) {
  assert(
    `${name} is explicitly historical and non-authoritative`,
    source.includes('Status: Historical technical record — non-authoritative.') &&
      normalizeGovernanceProse(source).includes('owner opens a new top level task'),
  )
  const retiredFinding = retiredAuthorityFinding(source)
  assert(
    `${name} cannot restore current/living, relay-successor, or delegated integration authority`,
    !retiredFinding,
    retiredFinding ? `matched ${retiredFinding.label}` : '',
  )
  assert(
    `${name} contains no reusable legacy workflow recipe`,
    !/\b(worktree cleanup|fresh[- ]agent|automatic cr|automatic rm|push →|squash[- ]merge|the recipe)\b/i.test(source),
  )
}

const handoffTemplate = read('docs/cuts/_templates/handoff.md')
assert('handoff template captures next-cut lessons', handoffTemplate.includes('Things The Next Cut Must Know') && handoffTemplate.includes('Evidence:') && handoffTemplate.includes('Rule:'))

if (failed > 0) {
  console.error(`\nArchitecture housekeeping verify FAILED: ${passed} passed, ${failed} failed`)
  process.exit(1)
}

console.log(`\nArchitecture housekeeping verify passed: ${passed} passed, 0 failed`)
