#!/usr/bin/env node
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { classifyActionsChanges, planPullRequest, parseRiskAdvice, applyAgentChoice } from './ci-pr-plan.mjs'

const identity = { head: 'a'.repeat(40), base: 'b'.repeat(40), pack: 'all' }
const suggestion = { head: identity.head, base: identity.base, pack: 'ui', reason: 'Only local presentation changed.' }
const block = advice => `<!-- eqb-risk-plan\n${JSON.stringify(advice)}\n-->`
assert.deepEqual(parseRiskAdvice(block(suggestion), identity), {
  status: 'valid', pack: 'ui', reason: suggestion.reason,
})
assert.equal(parseRiskAdvice(block({ ...suggestion, reason: 'Valid emoji 🧪' }), identity).status, 'valid')
for (const [body, status] of [
  [undefined, 'missing'], ['Ordinary PR body', 'missing'],
  [block({ ...suggestion, head: 'c'.repeat(40) }), 'stale'],
  [block({ ...suggestion, base: 'c'.repeat(40) }), 'stale'],
  [block({ ...suggestion, pack: 'security' }), 'invalid'],
  [block({ ...suggestion, extra: true }), 'invalid'],
  [block({ ...suggestion, reason: ' ' }), 'invalid'],
  [block({ ...suggestion, reason: 'a'.repeat(1001) }), 'invalid'],
  [block({ ...suggestion, reason: '\ud800' }), 'invalid'],
  [block({ ...suggestion, head: [identity.head] }), 'invalid'],
  [block({ ...suggestion, reason: 'line\n::error::injection' }), 'invalid'],
  [block(suggestion) + block(suggestion), 'invalid'],
  [block(suggestion).replace('"pack":"ui"', '"pack":"all","pack":"ui"'), 'invalid'],
  [block(suggestion).replace('"head":', '"pack":null,"head":'), 'invalid'],
  ['<!-- eqb-risk-plan\nnot JSON\n-->', 'invalid'],
  ['<!-- eqb-risk-plan', 'invalid'],
  [block(null), 'invalid'], [block([]), 'invalid'],
]) assert.equal(parseRiskAdvice(body, identity).status, status)
assert.equal(parseRiskAdvice(block({ ...suggestion, reason: '##[set-output]x $(exit 1); `echo nope` <b>data</b>' }), identity).status, 'valid',
  'reason remains data, never shell or instructions')

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
  [['app/src/auth/LoginPage.tsx'], 'all'],
  [['app/src/domain/questionBank.ts'], 'all'],
  [['schemas/paper.json'], 'all'],
  [['app/pnpm-lock.yaml'], 'all'],
  [['server/package.json'], 'all'],
  // Semantic seed #462: UI branding included shared draft/Paper and API changes.
  [['DESIGN.md', 'app/src/features/draft-paper/DraftPaperWorkbench.tsx', 'server/api.mjs'], 'all'],
  // Semantic seed #465: narrow model pin still changes protected coordinator/plugin code.
  [['.amp/plugins/nck1-analysis-agent.js', '.amp/plugins/source-intake-wakeup.js'], 'all'],
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
  const chosen = applyAgentChoice(plan, parseRiskAdvice(block(suggestion), identity))
  assert.equal(chosen.pack, pack === 'all' ? 'all' : 'ui', 'hard boundary wins; ordinary Agent choice wins')
  if (pack === 'all') assert.deepEqual(chosen.scripts, plan.scripts)
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
const selectionFailure = applyAgentChoice({ pack: 'feature' }, { status: 'valid', pack: 'ui' }, (_files, pack) => {
  if (pack === 'ui') throw new Error('cannot load selected registry pack')
  return { scripts: ['scripts/verify-ci-pr-plan.mjs'] }
})
assert.equal(selectionFailure.pack, 'all')
assert.equal(selectionFailure.reason, 'agent-selection-failed')
const malformedAdvice = parseRiskAdvice(block({ ...suggestion, reason: '\ud800' }), identity)
const unicodePlan = applyAgentChoice({ pack: 'feature' }, malformedAdvice)
assert.equal(execFileSync('jq', ['-er', '.pack'], { input: JSON.stringify(unicodePlan), encoding: 'utf8' }).trim(), 'all')

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
  write('scripts/verify-ci.mjs', "console.log(JSON.stringify({ pack: 'all', agentAdvice: { reason: '##[set-output]x' } }))\n")
  const base = commit('base')
  write('app/src/concierge/conciergeSearch.ts', 'export const fixture = 2\n')
  const head = commit('candidate')
  const tree = git('rev-parse', 'HEAD^{tree}')
  const tested = git('commit-tree', tree, '-p', base, '-p', head, '-m', 'test merge')
  git('checkout', '-q', '--detach', tested)
  const bootstrapOutput = bootstrap(base, head, tested).toString()
  assert(!bootstrapOutput.includes('##[set-output]'), 'actual workflow keeps command-like data out of runner stdout')
  assert(readFileSync(path.join(runnerTemp, 'summary'), 'utf8').includes('##[set-output]x'))
  assert.equal(JSON.parse(readFileSync(path.join(runnerTemp, 'eqb-verification-plan.json'), 'utf8')).pack, 'all')
  assert.throws(() => bootstrap(base, base, tested), 'bootstrap rejects stale head even without a base planner')
  const plan = planPullRequest({ repository, base, head, tested })
  assert.equal(plan.pack, 'all', 'no advice falls back to Full')
  assert.equal(plan.classifierPack, 'feature')
  assert.equal(plan.policySource, base)
  assert(plan.scripts.includes('scripts/verify-restart1-local-search-intent.mjs'))
  const eventPath = path.join(runnerTemp, 'event.json')
  for (const [body, status, expectedPack] of [
    [block({ head, base, pack: 'ui', reason: 'Request less coverage' }), 'valid', 'ui'],
    [block({ head, base, pack: 'feature', reason: 'Feature consumers changed' }), 'valid', 'feature'],
    [block({ head, base, pack: 'all', reason: 'Broader uncertainty' }), 'valid', 'all'],
    [undefined, 'missing', 'all'], [block(suggestion), 'stale', 'all'], ['<!-- eqb-risk-plan\n!\n-->', 'invalid', 'all'],
  ]) {
    writeFileSync(eventPath, JSON.stringify({ pull_request: { head: { sha: head }, base: { sha: base }, body } }))
    const actual = planPullRequest({ repository, base, head, tested, eventPath })
    assert.equal(actual.agentAdvice.status, status)
    assert.equal(actual.pack, expectedPack)
    assert.equal(actual.classifierPack, 'feature')
    assert.equal(actual.head, head)
    const expected = JSON.parse(execFileSync(process.execPath, ['scripts/verify-ci.mjs', '--plan-json', '--pack', expectedPack], { encoding: 'utf8' }))
    assert.deepEqual(actual.scripts, expected.scripts, 'execute the exact existing pack, not classifier scripts with a changed label')
  }
  for (const contents of ['bad JSON', '{}']) {
    writeFileSync(eventPath, contents)
    const actual = planPullRequest({ repository, base, head, tested, eventPath })
    assert.equal(actual.pack, 'all')
    assert.deepEqual(actual.scripts, plan.scripts)
    assert.equal(actual.agentAdvice.status, 'invalid')
  }
  rmSync(eventPath)
  assert.equal(planPullRequest({ repository, base, head, tested, eventPath }).agentAdvice.detail, 'event-unreadable')
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
  writeFileSync(eventPath, JSON.stringify({ pull_request: {
    head: { sha: maliciousHead }, base: { sha: base },
    body: block({ head: maliciousHead, base, pack: 'ui', reason: 'Try to override protected files' }),
  } }))
  const protectedPlan = planPullRequest({ repository, base, head: maliciousHead, tested: maliciousMerge, eventPath })
  assert.equal(protectedPlan.pack, 'all', 'valid lower-pack advice cannot override hard boundaries')
  assert.equal(protectedPlan.agentAdvice.pack, 'ui')
  assert.equal(protectedPlan.reason, 'protected-path')
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
assert(workflow.includes('"$GITHUB_SHA" "$GITHUB_EVENT_PATH"'))
assert(workflow.includes("pack=$(jq -er '.pack'"), 'execution reads the trusted resolved pack')
assert(!/^\s*cat "\$plan"\s*$/mu.test(selectionShell), 'untrusted reason must never be printed as an Actions stdout command')
assert(workflow.includes("github.event.pull_request.head.sha) || 'Verify' }}"),
  'main run.name must remain Verify for the deployment authority reader')
console.log('verify-ci-pr-plan: PASS (risk packs, escalation, immutable identities, candidate policy isolation)')
