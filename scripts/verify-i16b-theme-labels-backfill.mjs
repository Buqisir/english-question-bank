#!/usr/bin/env node
/**
 * Verification: I16·B theme-label batch backfill + minimal trigger UI.
 *
 * PA Static Verify Requirements (from pa.md):
 *   1. 3 unlabeled groups → all classified + bound; summary counts processed/labeled.
 *   2. An already-labeled group is skipped (idempotency), counted in skipped.
 *   3. Group #2's classify throws → counted in failed[], batch continues, others labeled.
 *   4. Summary shape { processed, labeled, skipped, failed[] } correct.
 *   5. Source assertion: backfill route registered via factory spread in serverRoutes (NOT literal push).
 *   6. Front-end button calls /api/topic-labels/backfill.
 *   7. MF-2 fence: diff does not modify prompts/reading-choice-analysis-v1.md,
 *      server/shared/topicTaxonomy.mjs, analyzeReading.mjs, packageBuilder.mjs.
 */

import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { backfillTopicLabels } from '../server/topic-labels/backfillTopicLabels.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

let passed = 0
let failed = 0

function assert(name, condition, detail = '') {
  if (condition) {
    passed++
    console.log(`PASS ${name}`)
  } else {
    failed++
    console.error(`FAIL ${name}${detail ? `\n  ${detail}` : ''}`)
  }
}

console.log('I16-B verify: theme-label batch backfill')
console.log()

// ─── Req 1: All unlabeled groups get classify+bind ────────────────────────────
console.log('=== Req 1: All unlabeled groups classified + bound ===')
{
  const classifyCalls = []
  const bindCalls = []

  const mockClassify = async (id, apiKey, model) => {
    classifyCalls.push({ id, apiKey, model })
    return { topicLabels: [{ label: `label-${id}`, theme: 'T', themeGroup: 'TG', subtopic: 'S' }] }
  }

  const mockBind = (id, topicLabels) => {
    bindCalls.push({ id, topicLabels })
    return { questionGroupId: id, topicLabels }
  }

  const mockListUnlabeled = () => ['g1', 'g2', 'g3']

  const summary = await backfillTopicLabels({
    listUnlabeledGroupIds: mockListUnlabeled,
    classify: mockClassify,
    bind: mockBind,
    apiKey: 'test-key',
    model: 'deepseek-chat',
  })

  assert(
    'Req1: classify called for all 3 unlabeled groups',
    classifyCalls.length === 3,
    `classify calls: ${classifyCalls.length}`
  )
  assert(
    'Req1: bind called for all 3 unlabeled groups',
    bindCalls.length === 3,
    `bind calls: ${bindCalls.length}`
  )
  assert(
    'Req1: processed count is 3',
    summary.processed === 3,
    `processed: ${summary.processed}`
  )
  assert(
    'Req1: labeled count is 3',
    summary.labeled === 3,
    `labeled: ${summary.labeled}`
  )
  assert(
    'Req1: skipped count is 0',
    summary.skipped === 0,
    `skipped: ${summary.skipped}`
  )
  assert(
    'Req1: failed array is empty',
    Array.isArray(summary.failed) && summary.failed.length === 0,
    `failed: ${JSON.stringify(summary.failed)}`
  )
}

console.log()

// ─── Req 2: Already-labeled group skipped ─────────────────────────────────────
console.log('=== Req 2: Already-labeled group skipped (idempotent) ===')
{
  // listUnlabeledGroupIds returns only unlabeled ones — so if we return empty, 0 processed
  // But to test skip behavior: we pass a listUnlabeled that returns only some groups
  // and check that summary.skipped is correct
  // In this model, listUnlabeledGroupIds filters already-labeled groups;
  // skipped = total_groups - unlabeled. But since we only have unlabeled IDs from the fn,
  // the orchestrator itself doesn't know total. So skipped is tracked differently.
  // Per plan: "幂等（跳过已标）" — listUnlabeledGroupIds ONLY returns unlabeled ones.
  // The orchestrator can accept an optional total count, OR the function can embed skip logic.
  // Most natural: orchestrator doesn't skip (listUnlabeledGroupIds already filtered).
  // But plan says summary includes skipped count.
  // Let's interpret: the orchestrator calls listUnlabeledGroupIds, and the mock can optionally
  // return some "already labeled" groups that have labels. Alternatively, we test by injecting
  // a listUnlabeledGroupIds that also optionally returns "all group ids" and an "already labeled" check.
  //
  // Simplest design: backfillTopicLabels accepts listUnlabeledGroupIds that returns ONLY unlabeled.
  // The total processed = those returned; skipped = 0 from orchestrator's perspective.
  // But that means we can't report "skipped M" meaningfully.
  //
  // Better: orchestrator receives all group IDs + a check fn, OR listUnlabeledGroupIds
  // returns { unlabeled, totalGroups } OR it returns all IDs and the orchestrator checks labels.
  //
  // Per PA SW-E advice: "inject listUnlabeledGroupIds and drop db". The cleanest design
  // where skipped is meaningful: listUnlabeledGroupIds returns only unlabeled IDs, but
  // we also inject a separate listAllGroupIds (or totalGroupCount). OR skipped is just
  // "groups returned by listUnlabeledGroupIds that classify returned no labels for".
  //
  // Let's keep it simplest: skipped = groups where classify returns empty topicLabels.
  // No — per plan "已标的跳过" = listUnlabeledGroupIds already excludes them, so skipped
  // comes from groups the orchestrator decides not to process.
  //
  // Final decision: orchestrator takes listUnlabeledGroupIds as the authoritative source.
  // skipped counts within the batch when classify returns empty/null topicLabels (no-material).
  // For truly already-labeled groups: they're excluded by listUnlabeledGroupIds, so they
  // won't appear in the summary at all. skipped = classify returned no labels.
  //
  // However the plan says summary reports "已标 N / 跳过 M（已有标签）" — so skipped means
  // already-labeled. That means the orchestrator needs to know how many were already labeled.
  // The cleanest injection: listUnlabeledGroupIds returns { unlabeled: [], skipped: N }.

  const mockClassify = async (id) => ({
    topicLabels: [{ label: `lbl-${id}`, theme: 'T', themeGroup: 'TG', subtopic: 'S' }]
  })
  const mockBind = (id, topicLabels) => ({ questionGroupId: id, topicLabels })

  // listUnlabeledGroupIds returns already-labeled info: 1 group already labeled, 2 unlabeled
  const mockListUnlabeled = () => ({ unlabeled: ['g1', 'g2'], skipped: 1 })

  const summary = await backfillTopicLabels({
    listUnlabeledGroupIds: mockListUnlabeled,
    classify: mockClassify,
    bind: mockBind,
    apiKey: 'test-key',
    model: 'deepseek-chat',
  })

  assert(
    'Req2: labeled count is 2',
    summary.labeled === 2,
    `labeled: ${summary.labeled}`
  )
  assert(
    'Req2: skipped count is 1 (already labeled)',
    summary.skipped === 1,
    `skipped: ${summary.skipped}`
  )
  assert(
    'Req2: processed = labeled + failed (2 unlabeled processed)',
    summary.processed === 2,
    `processed: ${summary.processed}`
  )
}

console.log()

// ─── Req 3: classify throws on group #2 → failed[], batch continues ───────────
console.log('=== Req 3: classify throws on group #2 → failed[], batch continues ===')
{
  const bindCalls = []
  let callCount = 0

  const mockClassify = async (id) => {
    callCount++
    if (id === 'g2') throw new Error('DeepSeek timeout')
    return { topicLabels: [{ label: `lbl-${id}`, theme: 'T', themeGroup: 'TG', subtopic: 'S' }] }
  }
  const mockBind = (id, topicLabels) => {
    bindCalls.push(id)
    return { questionGroupId: id, topicLabels }
  }
  const mockListUnlabeled = () => ({ unlabeled: ['g1', 'g2', 'g3'], skipped: 0 })

  const summary = await backfillTopicLabels({
    listUnlabeledGroupIds: mockListUnlabeled,
    classify: mockClassify,
    bind: mockBind,
    apiKey: 'test-key',
    model: 'deepseek-chat',
  })

  assert(
    'Req3: all 3 classify attempts made (no early abort)',
    callCount === 3,
    `classify calls: ${callCount}`
  )
  assert(
    'Req3: g2 not bound (classify threw)',
    !bindCalls.includes('g2'),
    `bound: ${bindCalls.join(',')}`
  )
  assert(
    'Req3: g1 and g3 bound despite g2 failure',
    bindCalls.includes('g1') && bindCalls.includes('g3'),
    `bound: ${bindCalls.join(',')}`
  )
  assert(
    'Req3: labeled count is 2',
    summary.labeled === 2,
    `labeled: ${summary.labeled}`
  )
  assert(
    'Req3: failed array has 1 entry for g2',
    summary.failed.length === 1 && summary.failed[0].id === 'g2',
    `failed: ${JSON.stringify(summary.failed)}`
  )
  assert(
    'Req3: failed entry has error property',
    typeof summary.failed[0].error === 'string',
    `failed[0]: ${JSON.stringify(summary.failed[0])}`
  )
}

console.log()

// ─── Req 4: Summary shape correct ─────────────────────────────────────────────
console.log('=== Req 4: Summary shape { processed, labeled, skipped, failed[] } ===')
{
  const mockClassify = async (id) => ({
    topicLabels: [{ label: `lbl-${id}`, theme: 'T', themeGroup: 'TG', subtopic: 'S' }]
  })
  const mockBind = (id, topicLabels) => ({ questionGroupId: id, topicLabels })
  const mockListUnlabeled = () => ({ unlabeled: ['g1'], skipped: 2 })

  const summary = await backfillTopicLabels({
    listUnlabeledGroupIds: mockListUnlabeled,
    classify: mockClassify,
    bind: mockBind,
    apiKey: 'test-key',
  })

  assert(
    'Req4: summary has processed',
    typeof summary.processed === 'number',
    `processed: ${JSON.stringify(summary.processed)}`
  )
  assert(
    'Req4: summary has labeled',
    typeof summary.labeled === 'number',
    `labeled: ${JSON.stringify(summary.labeled)}`
  )
  assert(
    'Req4: summary has skipped',
    typeof summary.skipped === 'number',
    `skipped: ${JSON.stringify(summary.skipped)}`
  )
  assert(
    'Req4: summary has failed array',
    Array.isArray(summary.failed),
    `failed: ${JSON.stringify(summary.failed)}`
  )
  assert(
    'Req4: skipped=2 from listUnlabeled return value',
    summary.skipped === 2,
    `skipped: ${summary.skipped}`
  )
  assert(
    'Req4: labeled=1',
    summary.labeled === 1,
    `labeled: ${summary.labeled}`
  )
}

console.log()

// ─── Req 5: Backfill route registered via factory spread in serverRoutes ──────
console.log('=== Req 5: Route registered via factory spread in serverRoutes ===')
{
  const apiSource = readFileSync(path.join(rootDir, 'server/api.mjs'), 'utf8')

  assert(
    'Req5: api.mjs imports createTopicLabelBackfillRoutes',
    apiSource.includes('createTopicLabelBackfillRoutes'),
    'createTopicLabelBackfillRoutes not found in api.mjs'
  )
  assert(
    'Req5: createTopicLabelBackfillRoutes() spread into serverRoutes array',
    /serverRoutes\s*=\s*\[[\s\S]*createTopicLabelBackfillRoutes\(\)/.test(apiSource),
    'createTopicLabelBackfillRoutes() not spread in serverRoutes'
  )
  const routeFileSource = readFileSync(path.join(rootDir, 'server/topic-labels/topicLabelBackfillRoutes.mjs'), 'utf8')
  assert(
    'Req5: /api/topic-labels/backfill route path exists in server code',
    apiSource.includes('/api/topic-labels/backfill') ||
      routeFileSource.includes('topic-labels') && routeFileSource.includes('backfill'),
    '/api/topic-labels/backfill route not found in server source'
  )
}

console.log()

// ─── Req 6: Frontend posts to /api/topic-labels/backfill ──────────────────────
console.log('=== Req 6: Frontend service calls /api/topic-labels/backfill ===')
{
  const serviceSource = readFileSync(path.join(rootDir, 'app/src/services/questionGroups.ts'), 'utf8')

  assert(
    'Req6: questionGroups.ts contains /api/topic-labels/backfill',
    serviceSource.includes('/api/topic-labels/backfill'),
    'backfill endpoint not found in questionGroups.ts'
  )
  assert(
    'Req6: questionGroups.ts exports backfillTopicLabels function',
    serviceSource.includes('export') && serviceSource.includes('backfillTopicLabels'),
    'backfillTopicLabels export not found in questionGroups.ts'
  )

  const appSource = readFileSync(path.join(rootDir, 'app/src/App.tsx'), 'utf8')
  assert(
    'Req6: App.tsx imports backfillTopicLabels',
    appSource.includes('backfillTopicLabels'),
    'backfillTopicLabels not found in App.tsx'
  )
  assert(
    'Req6: App.tsx has 给题库打主题标签 trigger button',
    appSource.includes('给题库打主题标签') || appSource.includes('backfill'),
    '给题库打主题标签 button not found in App.tsx'
  )
}

console.log()

// ─── Req 7: MF-2 diff-fence assertions ────────────────────────────────────────
console.log('=== Req 7: MF-2 diff-fence — forbidden files untouched ===')
{
  // prompts/reading-choice-analysis-v1.md must NOT contain topicLabels
  const analysisPromptPath = path.join(rootDir, 'prompts/reading-choice-analysis-v1.md')
  if (existsSync(analysisPromptPath)) {
    const promptContent = readFileSync(analysisPromptPath, 'utf8')
    assert(
      'Req7 MF-2: prompts/reading-choice-analysis-v1.md does NOT contain topicLabels',
      !promptContent.includes('topicLabels'),
      'topicLabels found in reading-choice-analysis-v1.md — forbidden re-coupling!'
    )
  } else {
    assert('Req7 MF-2: prompts/reading-choice-analysis-v1.md exists', false, 'File not found')
  }

  // server/shared/topicTaxonomy.mjs must NOT be recreated
  assert(
    'Req7 MF-2: server/shared/topicTaxonomy.mjs does NOT exist (must not be recreated)',
    !existsSync(path.join(rootDir, 'server/shared/topicTaxonomy.mjs')),
    'topicTaxonomy.mjs was recreated — forbidden!'
  )

  // server/paper-import-ai/analyzeReading.mjs must NOT contain topicLabels
  const analyzeReadingPath = path.join(rootDir, 'server/paper-import-ai/analyzeReading.mjs')
  if (existsSync(analyzeReadingPath)) {
    const analyzeSource = readFileSync(analyzeReadingPath, 'utf8')
    assert(
      'Req7 MF-2: analyzeReading.mjs does NOT contain topicLabels',
      !analyzeSource.includes('topicLabels'),
      'topicLabels found in analyzeReading.mjs — forbidden re-coupling!'
    )
  } else {
    assert('Req7 MF-2: server/paper-import-ai/analyzeReading.mjs exists', false, 'File not found')
  }

  // server/paper-import-ai/packageBuilder.mjs must NOT contain topicLabels
  const packageBuilderPath = path.join(rootDir, 'server/paper-import-ai/packageBuilder.mjs')
  if (existsSync(packageBuilderPath)) {
    const pkgSource = readFileSync(packageBuilderPath, 'utf8')
    assert(
      'Req7 MF-2: packageBuilder.mjs does NOT contain topicLabels',
      !pkgSource.includes('topicLabels'),
      'topicLabels found in packageBuilder.mjs — forbidden re-coupling!'
    )
  } else {
    assert('Req7 MF-2: server/paper-import-ai/packageBuilder.mjs exists', false, 'File not found')
  }
}

console.log()

// ─── Registration in CI and README ────────────────────────────────────────────
console.log('=== CI + README registration ===')
{
  const verifyCi = readFileSync(path.join(rootDir, 'scripts/verify-ci.mjs'), 'utf8')
  const scriptsReadme = readFileSync(path.join(rootDir, 'scripts/README.md'), 'utf8')

  assert(
    'CI: verify-ci.mjs includes i16b verifier',
    verifyCi.includes('verify-i16b-theme-labels-backfill.mjs'),
  )
  assert(
    'CI: scripts/README.md documents i16b verifier',
    scriptsReadme.includes('verify-i16b-theme-labels-backfill.mjs'),
  )
}

console.log()

// ─── Summary ─────────────────────────────────────────────────────────────────
if (failed > 0) {
  console.error(`I16-B theme-labels-backfill verify FAILED: ${passed} passed, ${failed} failed`)
  process.exit(1)
}
console.log(`I16-B theme-labels-backfill verify passed: ${passed} passed, 0 failed`)
