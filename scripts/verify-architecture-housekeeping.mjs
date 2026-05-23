#!/usr/bin/env node
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
assert('CR-lite template exists', existsSync(path.join(rootDir, 'docs/cuts/_templates/cr-lite.md')))
assert('external review template exists', existsSync(path.join(rootDir, 'docs/cuts/_templates/external-review-report.md')))
assert('watch ledger template exists', existsSync(path.join(rootDir, 'docs/cuts/_templates/watch-ledger.md')))
assert('H2 cut note exists', existsSync(path.join(rootDir, 'docs/cuts/H2-workflow-verify-ci-discipline/cut-note.md')))
assert('H2 handoff exists', existsSync(path.join(rootDir, 'docs/cuts/H2-workflow-verify-ci-discipline/handoff.md')))

const workflowTemplate = read('docs/ci/verify-workflow-template.yml')
assert('workflow template installs app dependencies with pnpm', workflowTemplate.includes('pnpm install --frozen-lockfile'))
assert('workflow template runs app build', workflowTemplate.includes('pnpm run build'))
assert('workflow template runs stable verify entrypoint', workflowTemplate.includes('pnpm run verify:all'))

const workflowInstallNote = read('docs/ci/verify-workflow-install.md')
const realWorkflowExists = existsSync(path.join(rootDir, '.github/workflows/verify.yml'))
assert('workflow install state is documented or installed', realWorkflowExists || workflowInstallNote.includes('Status: Not installed.'))
assert('workflow install note documents workflow scope requirement', workflowInstallNote.includes('workflow') && workflowInstallNote.includes('.github/workflows/verify.yml'))

const appPackage = read('app/package.json')
assert('app exposes verify:all script', appPackage.includes('"verify:all": "node ../scripts/verify-ci.mjs"'))

const indexCss = read('app/src/index.css')
const tokensCss = read('app/src/shared-ui/tokens.css')
assert('index.css imports shared tokens first', indexCss.startsWith('@import "./shared-ui/tokens.css";'))
assert('tokens define core color namespace', tokensCss.includes('--eqb-color-paper') && tokensCss.includes('--eqb-color-primary'))
assert('tokens define spacing scale', tokensCss.includes('--eqb-space-1') && tokensCss.includes('--eqb-space-5'))

const verifyCi = read('scripts/verify-ci.mjs')
assert('verify-ci keeps C7 import contracts in stable suite', verifyCi.includes('verify-c7-paper-import-contracts.mjs'))
assert('verify-ci keeps C8 draft paper contracts in stable suite', verifyCi.includes('verify-c8-draft-paper-contracts.mjs'))
assert('verify-ci keeps draft render contract in stable suite', verifyCi.includes('verify-c8-draft-paper-render-model.mjs'))
assert('verify-ci excludes C8 forbidden-scope cut script', !verifyCi.includes('verify-c8-forbidden-scope.mjs'))
assert('verify-ci excludes host interaction cut forbidden-scope script', !verifyCi.includes('verify-paper-surface-host-interaction.mjs'))

const scriptsReadme = read('scripts/README.md')
assert('scripts README documents stable CI entrypoint', scriptsReadme.includes('Stable CI entrypoint'))
assert('scripts README documents workflow-scope install constraint', scriptsReadme.includes('requires a token with workflow scope'))
assert('scripts README marks host interaction as not CI', scriptsReadme.includes('Host interaction reducer / state rules; includes cut-specific forbidden-scope checks | no'))
assert('scripts README marks C8 draft paper contracts as CI', scriptsReadme.includes('C8 draft-paper API/search/workbench contract | yes'))

function extractVerifyCiScripts(source) {
  const match = source.match(/const scripts = \[([\s\S]*?)\]/)
  if (!match) {
    return []
  }
  return [...match[1].matchAll(/'([^']+\.mjs)'/g)].map((item) => item[1])
}

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

const verifyCiScripts = extractVerifyCiScripts(verifyCi)
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

const cutWorkflow = read('.kiro/steering/cut-workflow-protocol.md')
assert('workflow protocol requires CR-lite failure angle', cutWorkflow.includes('failure / attack angle'))
assert('workflow protocol defines watch ledger destination', cutWorkflow.includes('docs/cuts/<CUT>/watch-ledger.md'))
assert('workflow protocol asks external review for token metadata', cutWorkflow.includes('token usage / estimated cost'))

const crLiteTemplate = read('docs/cuts/_templates/cr-lite.md')
assert('CR-lite template includes failure angle section', crLiteTemplate.includes('## Failure / Attack Angle'))

const externalReviewTemplate = read('docs/cuts/_templates/external-review-report.md')
assert('external review template includes baseline and cost sections', externalReviewTemplate.includes('## Baseline Reviewed') && externalReviewTemplate.includes('## Token / Cost Metadata'))

const watchLedgerTemplate = read('docs/cuts/_templates/watch-ledger.md')
assert('watch ledger template includes status vocabulary', watchLedgerTemplate.includes('converted-to-follow-up'))

const h2Entrypoint = read('docs/cuts/H2-workflow-verify-ci-discipline/agent-entrypoint.md')
const h2CutNote = read('docs/cuts/H2-workflow-verify-ci-discipline/cut-note.md')
const h2Handoff = read('docs/cuts/H2-workflow-verify-ci-discipline/handoff.md')
assert('H2 entrypoint is closed', h2Entrypoint.includes('Stage: Closed. Do not add H2-D.'))
assert('H2 cut note routes away from H2-D', h2CutNote.includes('Do not add H2-D.'))
assert('H2 handoff routes future housekeeping away from H2', h2Handoff.includes('Do not create H2-D.'))

if (failed > 0) {
  console.error(`\nArchitecture housekeeping verify FAILED: ${passed} passed, ${failed} failed`)
  process.exit(1)
}

console.log(`\nArchitecture housekeeping verify passed: ${passed} passed, 0 failed`)
