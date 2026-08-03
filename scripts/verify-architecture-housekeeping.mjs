#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
let passed = 0
let failed = 0

function read(relPath) {
  return readFileSync(path.join(rootDir, relPath), 'utf8')
}

function assert(name, condition, details = '') {
  if (condition) {
    passed += 1
    console.log(`PASS ${name}`)
    return
  }
  failed += 1
  console.error(`FAIL ${name}${details ? `\n  ${details}` : ''}`)
}

console.log('Architecture housekeeping verify')

for (const relPath of [
  '.github/workflows/verify.yml',
  'scripts/verify-ci.mjs',
  'app/package.json',
  'app/src/shared-ui/tokens.css',
]) {
  assert(`${relPath} exists`, existsSync(path.join(rootDir, relPath)))
}

const appPackage = JSON.parse(read('app/package.json'))
assert(
  'app exposes the stable verify entrypoint',
  appPackage.scripts?.['verify:all'] === 'node ../scripts/verify-ci.mjs',
)
assert(
  'app exposes the changed-risk verify entrypoint',
  appPackage.scripts?.['verify:changed'] === 'node ../scripts/verify-ci.mjs --changed',
)
assert(
  'app exposes the Paper seam verify entrypoint',
  appPackage.scripts?.['verify:paper'] === 'node ../scripts/verify-ci.mjs --pack paper',
)

for (const relPath of ['.github/workflows/verify.yml']) {
  const workflow = read(relPath)
  assert(`${relPath} installs app dependencies`, workflow.includes('pnpm install --frozen-lockfile'))
  assert(
    `${relPath} installs server dependencies`,
    workflow.includes('npm ci') && workflow.includes('server'),
  )
  assert(`${relPath} runs verify:all`, workflow.includes('pnpm run verify:all'))
}

const registryResult = spawnSync(
  process.execPath,
  ['scripts/verify-ci.mjs', '--list-json'],
  { cwd: rootDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
)
assert(
  'verify-ci exposes an executable registry',
  registryResult.status === 0,
  registryResult.stderr || registryResult.stdout,
)

let registry = { preflight: [], scripts: [] }
if (registryResult.status === 0) {
  try {
    registry = JSON.parse(registryResult.stdout)
  } catch (error) {
    assert('verify-ci registry is valid JSON', false, String(error))
  }
}

const preflightLabels = (registry.preflight ?? []).map((step) => step.label)
assert('verify-ci runs git diff --check', preflightLabels.includes('git diff --check'))
assert('verify-ci runs app build/typecheck', preflightLabels.includes('app build/typecheck'))

const scripts = registry.scripts ?? []
const uniqueScripts = new Set(scripts)
assert('verify-ci script registrations are unique', uniqueScripts.size === scripts.length)
const missingScripts = scripts.filter((script) => !existsSync(path.join(rootDir, script)))
assert('every verify-ci script exists', missingScripts.length === 0, missingScripts.join('\n'))
assert(
  'architecture housekeeping remains in the stable suite',
  scripts.includes('scripts/verify-architecture-housekeeping.mjs'),
)
const verifyReadme = read('scripts/README.md')
const undocumentedScripts = scripts.filter(
  (script) => ![
    script.slice('scripts/'.length),
    path.basename(script),
  ].some((label) => verifyReadme.includes(`\`${label}\``)),
)
assert(
  'every stable verifier states its named failure in the index',
  undocumentedScripts.length === 0,
  undocumentedScripts.join('\n'),
)

function routeFor(changedFile) {
  const result = spawnSync(process.execPath, [
    'scripts/verify-ci.mjs',
    '--plan-json',
    '--changed-file',
    changedFile,
  ], { cwd: rootDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  assert(
    `verify route plans ${changedFile}`,
    result.status === 0,
    result.stderr || result.stdout,
  )
  if (result.status !== 0) return null
  try {
    return JSON.parse(result.stdout)
  } catch (error) {
    assert(`verify route for ${changedFile} is valid JSON`, false, String(error))
    return null
  }
}

for (const [changedFile, expectedRisk, expectedPack] of [
  ['app/src/shared-ui/Button.tsx', 'ui-micro', 'ui'],
  ['app/public/paper-assets/paper-new/latest/paper-asset.json', 'known-shape-paper-data', 'paper-data'],
  ['server/services/questionBankSteward.mjs', 'ordinary-local-feature', 'feature'],
  ['server/print-renderer.mjs', 'shared-renderer-contract', 'paper'],
  ['data/sql/schema.sql', 'auth-persistence-migration', 'security'],
  ['.github/workflows/verify.yml', 'unknown-fallback', 'all'],
]) {
  const plan = routeFor(changedFile)
  if (!plan) continue
  assert(
    `${changedFile} selects ${expectedPack}`,
    plan.risk === expectedRisk && plan.pack === expectedPack,
    JSON.stringify(plan),
  )
}

const indexCss = read('app/src/index.css')
const tokensCss = read('app/src/shared-ui/tokens.css')
assert('index.css imports shared tokens first', indexCss.startsWith('@import "./shared-ui/tokens.css";'))
assert(
  'shared tokens expose core color and spacing variables',
  tokensCss.includes('--eqb-color-paper') &&
    tokensCss.includes('--eqb-color-primary') &&
    tokensCss.includes('--eqb-space-1') &&
    tokensCss.includes('--eqb-space-5'),
)

if (failed > 0) {
  console.error(`\nArchitecture housekeeping verify FAILED: ${passed} passed, ${failed} failed`)
  process.exit(1)
}

console.log(`\nArchitecture housekeeping verify passed: ${passed} passed, 0 failed`)
