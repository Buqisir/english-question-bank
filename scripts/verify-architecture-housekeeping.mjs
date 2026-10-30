#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
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
  'scripts/amp-orb-ci.mjs',
  'scripts/amp-orb-ci-sandbox.mjs',
  'scripts/verify-ci.mjs',
  'app/package.json',
  'app/src/shared-ui/tokens.css',
]) {
  assert(`${relPath} exists`, existsSync(path.join(rootDir, relPath)))
}

const appPackage = JSON.parse(read('app/package.json'))
const serverPackage = JSON.parse(read('server/package.json'))
const serverLock = JSON.parse(read('server/package-lock.json'))
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
assert('app pins Playwright exactly', appPackage.devDependencies?.playwright === '1.60.0')
assert('server pins playwright-core to the same version', serverPackage.dependencies?.['playwright-core'] === appPackage.devDependencies?.playwright)
assert(
  'Vivliostyle reuses the pinned playwright-core authority',
  serverPackage.overrides?.['@vivliostyle/cli']?.['playwright-core'] === appPackage.devDependencies?.playwright &&
    serverLock.packages?.['node_modules/playwright-core']?.version === appPackage.devDependencies?.playwright &&
    !serverLock.packages?.['node_modules/@vivliostyle/cli/node_modules/playwright-core'],
)

function sourceFiles(relDir) {
  const files = []
  const visit = (relPath) => {
    for (const entry of readdirSync(path.join(rootDir, relPath), { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue
      const child = path.join(relPath, entry.name)
      if (entry.isDirectory()) visit(child)
      else if (/\.(?:js|mjs|ts|tsx)$/.test(entry.name)) files.push(child)
    }
  }
  visit(relDir)
  return files
}

const unpinnedChromiumLaunches = []
let chromiumLaunchCount = 0
for (const relPath of ['scripts', 'server', 'app/src'].flatMap(sourceFiles)) {
  const source = read(relPath)
  for (const match of source.matchAll(/chromium\.launch\(\{/g)) {
    chromiumLaunchCount += 1
    const callEnd = source.indexOf('})', match.index)
    const call = callEnd === -1 ? '' : source.slice(match.index, callEnd + 2)
    if (!/channel:\s*['"]chromium['"]/.test(call)) {
      const line = source.slice(0, match.index).split('\n').length
      unpinnedChromiumLaunches.push(`${relPath}:${line}`)
    }
  }
}
assert('browser-backed checks have launch coverage', chromiumLaunchCount > 0)
assert(
  'every direct browser launch selects the pinned full Chromium',
  unpinnedChromiumLaunches.length === 0,
  unpinnedChromiumLaunches.join('\n'),
)

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
const frozenVocabularyScripts = scripts.filter((script) => (
  /\/verify-gaokao-vocabulary-/.test(script)
  || (/\/verify-vocabulary-/.test(script) && script !== 'scripts/verify-vocabulary-notebook.mjs')
))
assert(
  'frozen personal vocabulary verifiers remain outside the daily registry',
  frozenVocabularyScripts.length === 0,
  frozenVocabularyScripts.join('\n'),
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

function routeFor(...changedFiles) {
  const result = spawnSync(process.execPath, [
    'scripts/verify-ci.mjs',
    '--plan-json',
    ...changedFiles.flatMap((changedFile) => ['--changed-file', changedFile]),
  ], { cwd: rootDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  const label = changedFiles.join(' + ')
  assert(
    `verify route plans ${label}`,
    result.status === 0,
    result.stderr || result.stdout,
  )
  if (result.status !== 0) return null
  try {
    return JSON.parse(result.stdout)
  } catch (error) {
    assert(`verify route for ${label} is valid JSON`, false, String(error))
    return null
  }
}

for (const [changedFile, expectedRisk, expectedPack] of [
  ['app/src/shared-ui/tokens.css', 'ui-micro', 'ui'],
  ['app/src/concierge/ConciergeDesk.css', 'ordinary-local-feature', 'feature'],
  ['app/src/features/draft-paper/DraftPaperWorkbench.css', 'shared-renderer-contract', 'paper'],
  ['app/src/shared-ui/papersurface/PaperSurface.css', 'shared-renderer-contract', 'paper'],
  ['app/src/features/paper-browse/paperBrowsePage.css', 'shared-renderer-contract', 'paper'],
  ['app/src/shared-ui/Button.tsx', 'ordinary-local-feature', 'feature'],
  ['app/public/paper-assets/paper-new/latest/paper-asset.json', 'known-shape-paper-data', 'paper-data'],
  ['server/services/questionBankSteward.mjs', 'ordinary-local-feature', 'feature'],
  ['server/print-renderer.mjs', 'shared-renderer-contract', 'paper'],
  ['server/vocabulary/vocabularyPdfRenderer.mjs', 'shared-renderer-contract', 'paper'],
  ['server/vocabulary/vocabularyStore.mjs', 'auth-persistence-migration', 'security'],
  ['server/vocabulary/vocabularyRoutes.mjs', 'auth-persistence-migration', 'security'],
  ['.amp/plugins/github-ci-wakeup.js', 'auth-persistence-migration', 'security'],
  ['deploy/eqb-deploy-controller.mjs', 'auth-persistence-migration', 'security'],
  ['ops-mcp/src/index.mjs', 'auth-persistence-migration', 'security'],
  ['scripts/verify-ops-mcp.mjs', 'auth-persistence-migration', 'security'],
  ['scripts/amp-orb-ci.mjs', 'auth-persistence-migration', 'security'],
  ['scripts/lib/ampOrbCICoordination.mjs', 'auth-persistence-migration', 'security'],
  ['scripts/verify-amp-orb-ci.mjs', 'auth-persistence-migration', 'security'],
  ['scripts/verify-amp-orb-ci-coordination.mjs', 'auth-persistence-migration', 'security'],
  ['scripts/amp-orb-deploy.mjs', 'auth-persistence-migration', 'security'],
  ['scripts/lib/ampOrbDeploy.mjs', 'auth-persistence-migration', 'security'],
  ['scripts/lib/tencentTat.mjs', 'auth-persistence-migration', 'security'],
  ['server/api.mjs', 'unknown-fallback', 'all'],
  ['data/sql/schema.sql', 'auth-persistence-migration', 'security'],
  ['.github/workflows/example.yml', 'unknown-fallback', 'all'],
  ['import-ops/server.mjs', 'ordinary-local-feature', 'feature'],
  ['scripts/import-pipeline/ship-checklist.mjs', 'ordinary-local-feature', 'feature'],
  // A registered verifier resolves to the domain of the pack tier that covers
  // it instead of escalating to unknown.
  ['scripts/verify-paper-canonical-reading-publication.mjs', 'shared-renderer-contract', 'paper'],
  ['scripts/verify-scoped-publication.mjs', 'auth-persistence-migration', 'security'],
  ['scripts/verify-h5h-semantic-search.mjs', 'ordinary-local-feature', 'feature'],
  ['scripts/verify-ci.mjs', 'unknown-fallback', 'all'],
  ['scripts/verify-ci-pr-plan.mjs', 'unknown-fallback', 'all'],
  // Unregistered test/verification helpers contribute no domain.
  ['scripts/verify-source-reference-answer-booklet.mjs', 'ordinary-local-feature', 'feature'],
  ['scripts/import-pipeline/ocr-line-roles.test.mjs', 'ordinary-local-feature', 'feature'],
  ['server/services/sourceReferencePngSizing.test.mjs', 'ordinary-local-feature', 'feature'],
  ['test-fixtures/review-compatibility/sample.json', 'ordinary-local-feature', 'feature'],
]) {
  const plan = routeFor(changedFile)
  if (!plan) continue
  assert(
    `${changedFile} selects ${expectedPack}`,
    plan.risk === expectedRisk && plan.pack === expectedPack,
    JSON.stringify(plan),
  )
}

const mixedHighRiskPlan = routeFor(
  'server/auth/sessionStore.mjs',
  'server/print-renderer.mjs',
)
if (mixedHighRiskPlan) {
  assert(
    'mixed security and Paper changes fall back to all',
    mixedHighRiskPlan.risk === 'mixed-high-risk-fallback' && mixedHighRiskPlan.pack === 'all',
    JSON.stringify(mixedHighRiskPlan),
  )
}

const mixedHelperAndFeaturePlan = routeFor(
  'server/services/questionBankSteward.mjs',
  'server/services/sourceReferencePngSizing.test.mjs',
  'test-fixtures/review-compatibility/sample.json',
  'scripts/verify-source-reference-answer-booklet.mjs',
)
if (mixedHelperAndFeaturePlan) {
  assert(
    'test helpers do not escalate a feature change',
    mixedHelperAndFeaturePlan.risk === 'ordinary-local-feature' && mixedHelperAndFeaturePlan.pack === 'feature',
    JSON.stringify(mixedHelperAndFeaturePlan),
  )
}

const importOpsWithDocs = routeFor(
  'CONTEXT.md',
  'import-ops/server.mjs',
)
if (importOpsWithDocs) {
  assert(
    'import-ops plus markdown stays on the feature pack',
    importOpsWithDocs.risk === 'ordinary-local-feature' && importOpsWithDocs.pack === 'feature',
    JSON.stringify(importOpsWithDocs),
  )
}

const mixedUiPlan = routeFor(
  'app/src/shared-ui/tokens.css',
  'app/src/shared-ui/Button.tsx',
)
if (mixedUiPlan) {
  assert(
    'CSS plus frontend behavior promotes to feature',
    mixedUiPlan.risk === 'ordinary-local-feature' && mixedUiPlan.pack === 'feature',
    JSON.stringify(mixedUiPlan),
  )
}

const missingBaseResult = spawnSync(process.execPath, [
  'scripts/verify-ci.mjs',
  '--plan-json',
  '--changed',
  '--base-ref',
  'refs/heads/definitely-missing-verification-base',
], { cwd: rootDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
let missingBasePlan = null
try {
  missingBasePlan = JSON.parse(missingBaseResult.stdout)
} catch {
  // The assertions below report the raw output.
}
assert(
  'missing Git base fails closed to the full pack',
  missingBaseResult.status === 0 &&
    missingBasePlan?.risk === 'git-diff-fallback' &&
    missingBasePlan?.pack === 'all' &&
    typeof missingBasePlan?.detectionError === 'string',
  missingBaseResult.stderr || missingBaseResult.stdout,
)

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
