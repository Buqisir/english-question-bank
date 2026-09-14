#!/usr/bin/env node
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { classifyActionsChanges, planPullRequest } from './ci-pr-plan.mjs'

const change = (...paths) => ({ status: 'M', oldMode: '100644', newMode: '100644', paths })
for (const [files, pack] of [
  [['README.md'], 'ui'],
  [['app/src/shared-ui/tokens.css'], 'ui'],
  [['app/src/concierge/conciergeSearch.ts'], 'feature'],
  [['test-fixtures/paper-import/example.json'], 'paper-data'],
  [['scripts/import-pipeline/papers/example/source.mjs'], 'import-paper'],
  [['server/paper-canonical/pdfRegionRaster.mjs'], 'all'],
  [['app/src/features/draft-paper/draftPaperPreviewHtml.ts'], 'all'],
  [['server/my-space/mySpace.mjs'], 'all'],
  [['server/import-review/importReviewStore.mjs'], 'all'],
  [['server/paper-import/storage.mjs'], 'all'],
  [['server/auth/password.mjs'], 'all'],
  [['server/api.mjs'], 'all'],
  [['scripts/amp-orb-deploy.mjs'], 'all'],
  [['.github/workflows/verify.yml'], 'all'],
  [['AGENTS.md'], 'all'],
  [['docs/agents/new-rule.md'], 'all'],
  [['scripts/ci-pr-plan.mjs'], 'all'],
  [['scripts/lib/ampOrbCIPolicy.mjs'], 'all'],
  [['scripts/verify-ci.mjs'], 'all'],
  [['unknown.config'], 'all'],
  [['app/src/concierge/conciergeSearch.ts', 'server/auth/password.mjs'], 'all'],
  [['scripts/import-pipeline/papers/example/source.mjs', 'app/src/concierge/conciergeSearch.ts'], 'all'],
]) {
  const plan = classifyActionsChanges(files.map(file => change(file)))
  assert.equal(plan.pack, pack, files.join(','))
  assert(plan.scripts.length > 0, 'summary lists the nonempty executed pack')
}
for (const dangerous of [
  { ...change('README.md'), status: 'D', newMode: '000000' },
  { ...change('README.md'), oldMode: '100644', newMode: '120000' },
  { ...change('README.md'), newMode: '100755' },
  { ...change('AGENTS.md', 'README.md'), status: 'R' },
]) assert.equal(classifyActionsChanges([dangerous]).pack, 'all')
assert.equal(classifyActionsChanges([]).pack, 'all')
assert.equal(classifyActionsChanges([change('app/src/concierge/conciergeSearch.ts')], files => {
  if (files) throw new Error('classifier broken')
  return { scripts: ['scripts/verify-ci-pr-plan.mjs'] }
}).reason, 'classifier-failed')
assert.equal(classifyActionsChanges([change('app/src/concierge/conciergeSearch.ts')], files => files
  ? { risk: 'ordinary-local-feature', pack: 'ui', scripts: [] }
  : { scripts: ['scripts/verify-ci-pr-plan.mjs'] }).pack, 'all')

const repository = mkdtempSync(path.join(tmpdir(), 'eqb-ci-plan-'))
const runnerTemp = mkdtempSync(path.join(tmpdir(), 'eqb-ci-bootstrap-'))
const workflow = readFileSync(new URL('../.github/workflows/verify.yml', import.meta.url), 'utf8')
const selectionShell = workflow.match(/        run: \|\n(          plan=[\s\S]*?)\n      - name: Enable pinned pnpm/u)?.[1]
assert(selectionShell, 'exercise the actual workflow selection step')
const bootstrap = (base, head, tested) => execFileSync('bash', ['-e', '-o', 'pipefail', '-c', selectionShell], {
  cwd: repository, stdio: 'pipe', env: {
    ...process.env, BASE_SHA: base, HEAD_SHA: head, GITHUB_SHA: tested,
    GITHUB_EVENT_NAME: 'pull_request', GITHUB_WORKSPACE: repository, RUNNER_TEMP: runnerTemp,
    GITHUB_OUTPUT: path.join(runnerTemp, 'output'), GITHUB_STEP_SUMMARY: path.join(runnerTemp, 'summary'),
  },
})
const git = (...args) => execFileSync('git', args, { cwd: repository, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const write = (file, contents) => {
  const absolute = path.join(repository, file)
  mkdirSync(path.dirname(absolute), { recursive: true })
  writeFileSync(absolute, contents)
}
const commit = label => { git('add', '.'); git('commit', '-qm', label); return git('rev-parse', 'HEAD') }
try {
  git('init', '-q', '-b', 'main')
  git('config', 'user.name', 'CI fixture')
  git('config', 'user.email', 'ci-fixture@example.invalid')
  git('config', 'commit.gpgsign', 'false')
  write('app/src/concierge/conciergeSearch.ts', 'export const fixture = 1\n')
  write('scripts/verify-ci.mjs', "console.log(JSON.stringify({ pack: 'all' }))\n")
  const base = commit('base')
  write('app/src/concierge/conciergeSearch.ts', 'export const fixture = 2\n')
  const head = commit('candidate')
  const tree = git('rev-parse', 'HEAD^{tree}')
  const tested = git('commit-tree', tree, '-p', base, '-p', head, '-m', 'test merge')
  git('checkout', '-q', '--detach', tested)
  bootstrap(base, head, tested)
  assert.equal(JSON.parse(readFileSync(path.join(runnerTemp, 'eqb-verification-plan.json'), 'utf8')).pack, 'all')
  assert.throws(() => bootstrap(base, base, tested), 'bootstrap rejects stale head even without a base planner')
  const plan = planPullRequest({ repository, base, head, tested })
  assert.equal(plan.pack, 'feature')
  assert.equal(plan.policySource, base)
  assert(plan.scripts.includes('scripts/verify-restart1-local-search-intent.mjs'))
  assert.throws(() => planPullRequest({ repository, base: head, head: base, tested }), /exact PR test merge/)
  write('app/src/concierge/conciergeSearch.ts', 'dirty after identity\n')
  assert.throws(() => planPullRequest({ repository, base, head, tested }), /exact PR test merge/)
  git('checkout', '--', '.')
  git('checkout', '-q', '--detach', head)
  write('scripts/verify-ci.mjs', "throw new Error('candidate classifier must never execute')\n")
  const maliciousHead = commit('candidate policy change')
  const maliciousMerge = git('commit-tree', git('rev-parse', 'HEAD^{tree}'), '-p', base, '-p', maliciousHead, '-m', 'test merge')
  git('checkout', '-q', '--detach', maliciousMerge)
  assert.equal(planPullRequest({ repository, base, head: maliciousHead, tested: maliciousMerge }).pack, 'all')
  const reversed = git('commit-tree', tree, '-p', head, '-p', base, '-m', 'reversed')
  git('checkout', '-q', '--detach', reversed)
  assert.throws(() => planPullRequest({ repository, base, head, tested: reversed }), /exact PR test merge/)
  const wrongTree = git('commit-tree', git('rev-parse', `${base}^{tree}`), '-p', base, '-p', head, '-m', 'wrong tree')
  git('checkout', '-q', '--detach', wrongTree)
  assert.throws(() => planPullRequest({ repository, base, head, tested: wrongTree }), /contain its current base/)
  assert.throws(() => bootstrap(base, head, wrongTree), 'bootstrap rejects wrong tree even without a base planner')
} finally {
  rmSync(repository, { recursive: true, force: true })
  rmSync(runnerTemp, { recursive: true, force: true })
}

// A natural rollout cannot reduce before the planner exists on main.
assert(workflow.includes('"$BASE_SHA:scripts/ci-pr-plan.mjs"'))
assert(workflow.includes('node "$trusted/scripts/ci-pr-plan.mjs"'))
assert(workflow.includes('node scripts/verify-ci.mjs --plan-json --pack all'))
assert(workflow.includes("github.event.pull_request.head.sha) || 'Verify' }}"),
  'main run.name must remain Verify for the deployment authority reader')
console.log('verify-ci-pr-plan: PASS (risk packs, escalation, immutable identities, candidate policy isolation)')
