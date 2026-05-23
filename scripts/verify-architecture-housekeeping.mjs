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
assert('code-style doc exists', existsSync(path.join(rootDir, 'docs/code-style.md')))
assert('shared UI token file exists', existsSync(path.join(rootDir, 'app/src/shared-ui/tokens.css')))
assert('CI verify entrypoint exists', existsSync(path.join(rootDir, 'scripts/verify-ci.mjs')))

const workflowTemplate = read('docs/ci/verify-workflow-template.yml')
assert('workflow template installs app dependencies with pnpm', workflowTemplate.includes('pnpm install --frozen-lockfile'))
assert('workflow template runs app build', workflowTemplate.includes('pnpm run build'))
assert('workflow template runs stable verify entrypoint', workflowTemplate.includes('pnpm run verify:all'))

const appPackage = read('app/package.json')
assert('app exposes verify:all script', appPackage.includes('"verify:all": "node ../scripts/verify-ci.mjs"'))

const indexCss = read('app/src/index.css')
const tokensCss = read('app/src/shared-ui/tokens.css')
assert('index.css imports shared tokens first', indexCss.startsWith('@import "./shared-ui/tokens.css";'))
assert('tokens define core color namespace', tokensCss.includes('--eqb-color-paper') && tokensCss.includes('--eqb-color-primary'))
assert('tokens define spacing scale', tokensCss.includes('--eqb-space-1') && tokensCss.includes('--eqb-space-5'))

const verifyCi = read('scripts/verify-ci.mjs')
assert('verify-ci keeps C7 import contracts in stable suite', verifyCi.includes('verify-c7-paper-import-contracts.mjs'))
assert('verify-ci keeps draft render contract in stable suite', verifyCi.includes('verify-c8-draft-paper-render-model.mjs'))
assert('verify-ci excludes C8 forbidden-scope cut script', !verifyCi.includes('verify-c8-forbidden-scope.mjs'))
assert('verify-ci excludes C8 added-file contract script', !verifyCi.includes('verify-c8-draft-paper-contracts.mjs'))
assert('verify-ci excludes host interaction cut forbidden-scope script', !verifyCi.includes('verify-paper-surface-host-interaction.mjs'))

const scriptsReadme = read('scripts/README.md')
assert('scripts README documents stable CI entrypoint', scriptsReadme.includes('Stable CI entrypoint'))
assert('scripts README documents workflow-scope install constraint', scriptsReadme.includes('requires a token with workflow scope'))
assert('scripts README marks host interaction as not CI', scriptsReadme.includes('Host interaction reducer / state rules; includes cut-specific forbidden-scope checks | no'))
assert('scripts README marks C8 added-file contract as not CI', scriptsReadme.includes('C8 PR A added-file/API contract; cut-specific | no'))

const codeStyle = read('docs/code-style.md')
assert('code-style documents file suffix rules', codeStyle.includes('Server runtime code uses `.mjs`'))
assert('code-style documents server module targets', codeStyle.includes('server/question-bank/'))
assert('code-style documents CSS token policy', codeStyle.includes('app/src/shared-ui/tokens.css'))

if (failed > 0) {
  console.error(`\nArchitecture housekeeping verify FAILED: ${passed} passed, ${failed} failed`)
  process.exit(1)
}

console.log(`\nArchitecture housekeeping verify passed: ${passed} passed, 0 failed`)
