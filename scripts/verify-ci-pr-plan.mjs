#!/usr/bin/env node
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { classifyActionsChanges, planPullRequest, parseRiskAdvice, applyAgentChoice } from './ci-pr-plan.mjs'

import {
  assertVerificationShardCoverage,
  createVerificationShards,
  e2eRenderShardOverrides,
  verificationShardOverrides,
  verificationShardScripts,
} from './lib/verificationShards.mjs'

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
const selectionShells = [...workflow.matchAll(/        run: \|\n(          plan=[\s\S]*?)\n      - name: Enable pinned pnpm/gu)]
  .map(match => match[1])
assert.equal(selectionShells.length, 6, 'all isolated workers resolve the trusted natural-event pack')
assert(selectionShells.every(shell => shell === selectionShells[0]),
  'no worker may select a different pack or weaker identity check')
const selectionShell = selectionShells[0]
const jobEntries = [...workflow.slice(workflow.indexOf('\njobs:')).matchAll(/^  ([a-z][a-z0-9-]*):\n([\s\S]*?)(?=^  [a-z][a-z0-9-]*:|$(?![\s\S]))/gm)]
const jobs = Object.fromEntries(jobEntries.map(([, name, body]) => [name, body]))
const workerNames = ['verify-1', 'verify-2', 'e2e-seams-1', 'e2e-seams-2', 'e2e-render-1', 'e2e-render-2']
assert.deepEqual(Object.keys(jobs), ['verify-1', 'verify-2', 'verify', ...workerNames.slice(2), 'e2e'],
  'preserve the exact v4 worker and required-check topology')
const verifyJobs = ['verify-1', 'verify-2'].map(name => jobs[name])
const seamsJobs = ['e2e-seams-1', 'e2e-seams-2'].map(name => jobs[name])
const renderJobs = ['e2e-render-1', 'e2e-render-2'].map(name => jobs[name])
const verifyJob = verifyJobs[0]
for (const [lane, workers] of [['verify', verifyJobs], ['e2e', renderJobs]]) {
  for (const [index, worker] of workers.entries()) {
    assert(worker.includes(`--pack "$VERIFY_PACK" --lane ${lane} --shard ${index + 1} --jobs 2`))
  }
}
for (const worker of seamsJobs) assert(!worker.includes('verify:all'), 'fixed seams do not repeat pack preflight or scripts')
assert(!/continue-on-error:/.test(workflow), 'failures remain failures')
for (const name of workerNames) {
  const worker = jobs[name]
  assert(!/needs:|^    if:/m.test(worker), 'workers run independently on every natural event')
  for (const setup of ['actions/checkout@v4', 'actions/setup-node@v4', 'fetch-depth: 0',
    'persist-credentials: false', 'pnpm -C app install --frozen-lockfile', 'npm --prefix server ci',
    'pnpm -C app exec playwright install --with-deps --no-shell chromium']) assert(worker.includes(setup), setup)
}
for (const renderJob of renderJobs) assert(renderJob.includes("if: ${{ !cancelled() && steps.chromium.outcome == 'success' && steps.lane.outcome == 'success' && steps.lane.outputs.count != '0' }}"),
  'render setup and nonempty lane are required for execution')
const seamScripts = [
  'verify-draft-pagination-renderer.mjs',
  'verify-draft-pagination-dom-contract.mjs',
  'verify-a3-imposition.mjs',
  'verify-reorder-suggest.mjs',
  'verify-paper-normalization-grammar-fill-browser.mjs',
  'smoke-golden-path.mjs',
]
const assignedSeams = seamsJobs.map(worker => [...worker.matchAll(/run: node scripts\/([^\s]+\.mjs)/g)].map(match => match[1]))
assert.deepEqual(assignedSeams, [
  [seamScripts[0], seamScripts[3]],
  [seamScripts[1], seamScripts[2], seamScripts[4], seamScripts[5]],
], 'balance fixed seams without changing their internal behavior')
assert.deepEqual(assignedSeams.flat().sort(), [...seamScripts].sort(), 'fixed seams form a disjoint full union')
for (const script of seamScripts) {
  assert.equal(workflow.split(`run: node scripts/${script}`).length - 1, 1, `${script} executes exactly once in every pack`)
  const seamStep = seamsJobs.flatMap(worker => worker.split('      - name:')).find(step => step.includes(`run: node scripts/${script}`))
  assert(seamStep && !/\bif:/.test(seamStep), `${script} is mandatory, never conditionally skipped`)
}
for (const [name, needs, variables] of [
  ['verify', ['verify-1', 'verify-2'], ['SHARD_1_RESULT', 'SHARD_2_RESULT']],
  ['e2e', workerNames.slice(2), ['SEAMS_1_RESULT', 'SEAMS_2_RESULT', 'RENDER_1_RESULT', 'RENDER_2_RESULT']],
]) {
  const aggregate = jobs[name]
  assert(aggregate.includes(`    name: ${name}\n`))
  assert(aggregate.includes(`    needs: [${needs.join(', ')}]\n`))
  assert(aggregate.includes('    if: ${{ always() }}\n'))
  for (const [index, worker] of needs.entries()) assert(aggregate.includes(`${variables[index]}: \${{ needs.${worker}.result }}`))
  const shell = aggregate.match(/        run: \|\n([\s\S]*)/u)?.[1]
  assert(shell, 'exercise the actual aggregation shell')
  const results = ['success', 'failure', 'cancelled', 'skipped', '']
  const combinations = variables.reduce(states => states.flatMap(state => results.map(result => [...state, result])), [[]])
  // Batch the process launches through one shell; keep the complete result matrix.
  const assertions = combinations.map(combination => {
    const environment = variables.map((variable, index) => `${variable}='${combination[index]}'`).join(' ')
    const success = combination.every(result => result === 'success')
    return `if ${environment} bash -e -o pipefail -c "$1"; then ${success ? 'true' : 'exit 1'}; else ${success ? 'exit 1' : 'true'}; fi`
  }).join('\n')
  execFileSync('bash', ['-e', '-o', 'pipefail', '-c', assertions, 'aggregate-fixture', shell], { stdio: 'pipe' })

}
const systemInstall = job => job.match(/sudo apt-get install --yes [^\n]+/)?.[0]
assert(systemInstall(verifyJob))
for (const worker of [...verifyJobs, ...renderJobs]) assert.equal(systemInstall(worker), systemInstall(verifyJob), 'retain system dependencies')
for (const worker of seamsJobs) assert(!systemInstall(worker), 'browser seams retain Playwright OS dependencies only')
const laneShells = renderJobs.map(renderJob => {
  assert(renderJob.includes("- name: Install verification system dependencies\n        if: ${{ steps.lane.outputs.count != '0' }}"),
    'empty render partitions do not add system installation')
  const shell = renderJob.match(/        run: \|\n(          lane=[\s\S]*?)\n      - name: Install verification system dependencies/u)?.[1]
  assert(shell, 'exercise the actual render shard planning shell')
  return shell
})
const registry = JSON.parse(execFileSync(process.execPath, ['scripts/verify-ci.mjs', '--list-json'], { encoding: 'utf8' }))
for (const script of [
  'scripts/verify-verification-command-runner.mjs',
  'scripts/verify-verification-scheduler.mjs',
  'scripts/verify-ci-pr-plan.mjs',
  'scripts/verify-import-review-ocr-worker.mjs',
]) {
  assert(registry.packs.all.includes(script), `${script}: retain Full coverage`)
  for (const [pack, scripts] of Object.entries(registry.packs)) {
    if (pack !== 'all') assert(!scripts.includes(script), `${script}: exclude from ${pack}`)
  }
}
for (const pack of Object.keys(registry.packs)) {
  const plan = (lane, shard = 'all') => JSON.parse(execFileSync(process.execPath,
    ['scripts/verify-ci.mjs', '--plan-json', '--pack', pack, '--lane', lane, '--shard', shard], { encoding: 'utf8' }))
  const complete = plan('all')
  const partition = []
  for (const lane of ['verify', 'e2e']) {
    const shards = ['1', '2'].map(shard => plan(lane, shard))
    const scripts = shards.flatMap(shard => shard.scripts)
    assert.equal(new Set(scripts).size, scripts.length, `${pack}/${lane}: no duplicate shard scripts`)
    assert.deepEqual([...scripts].sort(), [...plan(lane).scripts].sort(), `${pack}/${lane}: preserve full lane union`)
    for (const shard of shards) assert.deepEqual(shard.preflight, complete.preflight, 'each shard retains diff/build preflight')
    partition.push(...scripts)
  }
  assert.equal(new Set(partition).size, partition.length, `${pack}: no duplicate pack scripts`)
  assert.deepEqual([...partition].sort(), [...complete.scripts].sort(), `${pack}: workers preserve the complete pack union`)
  assert.deepEqual(complete.scripts, registry.packs[pack], 'local Full remains unpartitioned')
}
for (const overrides of [verificationShardOverrides, e2eRenderShardOverrides]) {
  const allocated = Object.values(overrides).flat()
  const allocation = createVerificationShards(allocated, overrides)
  assert.deepEqual(allocation, overrides, 'balance overrides retain every current destination')
  assertVerificationShardCoverage(allocated, allocation)
  const futureScript = 'scripts/future-check.mjs'
  const futureRegistry = [...allocated, futureScript]
  const futureAllocation = createVerificationShards(futureRegistry, overrides)
  assert(!futureAllocation['1'].includes(futureScript))
  assert(futureAllocation['2'].includes(futureScript), 'fixture SHA-256 ends in 2b: modulo 2 plus 1 is shard 2')
  assertVerificationShardCoverage(futureRegistry, futureAllocation)
  for (const pack of Object.values(registry.packs)) {
    const selected = [...pack.filter(script => allocated.includes(script)), futureScript]
    const shards = ['1', '2'].map(shard => verificationShardScripts(selected, shard, futureAllocation))
    assert.equal(new Set(shards.flat()).size, selected.length, 'new script has exactly one destination in each pack')
    assert.deepEqual(shards.flat().sort(), [...selected].sort(), 'new script preserves each pack union')
  }
  const reordered = createVerificationShards([...futureRegistry].reverse(), {
    '2': overrides['2'], '1': overrides['1'],
  })
  for (const shard of ['1', '2']) assert.deepEqual([...reordered[shard]].sort(), [...futureAllocation[shard]].sort(),
    'hash assignment is independent of registry and override key order')
  assert.throws(() => assertVerificationShardCoverage(futureRegistry, allocation), /missing/)
  assert.throws(() => createVerificationShards(allocated.slice(1), overrides), /stale/,
    'retired or moved scripts require removing their balance override')
  assert.throws(() => createVerificationShards(allocated, {
    ...overrides, '2': [...overrides['2'], allocated[0]],
  }), /duplicate/)
  assert.throws(() => createVerificationShards([...allocated, allocated[0]], overrides), /Invalid verify shard allocation/)
  for (const invalid of [
    { ...overrides, '3': [] },
    { '1': overrides['1'], '3': overrides['2'] },
    { ...overrides, extra: [] },
    { '1': allocated },
  ]) {
    assert.throws(() => createVerificationShards(allocated, invalid), /expected exactly 1 and 2/)
    assert.throws(() => assertVerificationShardCoverage(allocated, invalid), /expected exactly 1 and 2/)
  }
}
for (const args of [
  ['--shard'], ['--shard', '3'], ['--shard', '1'], ['--lane', 'e2e', '--shard', '3'],
  ['--lane', 'verify', '--shard', '1', '--shard', '2'], ['--lane', 'verify', '--shard', '1', '--shard'],
]) {
  assert.equal(spawnSync(process.execPath, ['scripts/verify-ci.mjs', '--plan-json', ...args]).status, 1,
    `invalid shard args cannot silently omit coverage: ${args.join(' ')}`)
}
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
  const runLanePlan = (pack, laneShell) => execFileSync('bash', ['-e', '-o', 'pipefail', '-c', laneShell], {
    cwd: new URL('..', import.meta.url), stdio: 'pipe', env: {
      ...process.env, VERIFY_PACK: pack, RUNNER_TEMP: runnerTemp,
      GITHUB_OUTPUT: path.join(runnerTemp, 'lane-output'), GITHUB_STEP_SUMMARY: path.join(runnerTemp, 'lane-summary'),
    },
  })
  for (const [index, laneShell] of laneShells.entries()) {
    for (const [pack, counts] of [['all', [1, 5]], ['ui', [0, 0]], ['feature', [0, 0]], ['paper-data', [0, 0]], ['import-paper', [1, 2]]]) {
      const count = counts[index]
      const output = runLanePlan(pack, laneShell).toString()
      assert(readFileSync(path.join(runnerTemp, 'lane-output'), 'utf8').endsWith(`count=${count}\n`),
        `${pack}/${index + 1}: extra setup/execution follows actual selected scripts`)
      assert.equal(output.includes('所选 pack 合法空集合 (scripts=0)'), count === 0, 'successful empty shard records its legitimate selected-pack empty set')
    }
    assert.throws(() => runLanePlan('invalid-pack', laneShell), 'lane planning errors fail the job instead of skipping coverage')
  }
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
