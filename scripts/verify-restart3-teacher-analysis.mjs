#!/usr/bin/env node
/**
 * Verification: Restart cut ③ — teacher-version real analysis (paper-assets join).
 *
 * Hermetic: no `git show main:` / no local `main` ref dependency. Uses only
 * the current worktree's tracked paper-assets fixtures + a direct module
 * import of server/draft-paper/analysisText.mjs.
 *
 * Covers:
 * 1. print-renderer isMetaStub() hides the publisher.mjs metadata stub note,
 *    both source-contract and behavioral (real buildPrintHtml call).
 * 2. Four-family analysis degrader fixture tests (reading/cloze/grammar-fill/
 *    seven-choices) against real tracked paper-zj-2026-jan analysis JSON —
 *    each produces non-empty, ≤600-char Chinese text; writing groups are
 *    excluded (no lookup attempted).
 * 3. findPaperAssetGroup contract regression: still returns { asset, group }
 *    for its two existing call sites, plus additive paperId field.
 * 4. Missing-analysis paper (no writing-analysis-v1.json, e.g. paper-2024-jia
 *    per the plan) does not throat/crash the loader.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { isDeepStrictEqual } from 'node:util'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

let passed = 0
let failed = 0

function assert(name, condition, detail = '') {
  if (condition) {
    passed++
    console.log(`  ✓ ${name}`)
  } else {
    failed++
    console.error(`  ✗ ${name}${detail ? `: ${detail}` : ''}`)
  }
}

function read(relPath) {
  return readFileSync(path.join(rootDir, relPath), 'utf8')
}

function readJson(relPath) {
  return JSON.parse(read(relPath))
}

console.log('=== Restart cut ③: teacher-version real analysis (paper-assets join) ===\n')

/* ───────────────────── 1. print-renderer stub hiding ───────────────────── */

console.log('-- 1. print-renderer.mjs stub hiding --')

const printRenderer = read('server/print-renderer.mjs')
assert('isMetaStub() helper exists', /function isMetaStub\(text\)/.test(printRenderer))
assert(
  'isMetaStub regex matches publisher.mjs stub shape',
  /\/\^paperId=.\*assetVersion=\//.test(printRenderer),
)
assert(
  'explanation render path checks isMetaStub before showing 解析',
  /const explanation = isMetaStub\(rawExplanation\) \? '' : rawExplanation/.test(printRenderer),
)

const { buildPrintHtml } = await import(path.join(rootDir, 'server', 'print-renderer.mjs'))

function makeDetail(overrides = {}) {
  return {
    id: 'group-x',
    title: 'Group X',
    groupType: 'reading',
    passage: { materialText: 'Some passage text.' },
    questions: [
      {
        id: 'q-1',
        stem: 'What is the answer?',
        answer: 'A',
        explanation: '',
        note: 'paperId=paper-x; assetVersion=3',
        options: [{ label: 'A', content: 'Correct' }],
      },
    ],
    ...overrides,
  }
}

const stubHtml = buildPrintHtml({
  title: 'Stub Test',
  versionType: 'teacher',
  printStyle: 'exam',
  items: [{ detail: makeDetail(), score: 2 }],
  blocks: [{ type: 'question_group', questionGroupId: 'group-x', score: 2 }],
  questionNumberStart: 1,
})

assert('teacher print keeps 【答案】 for stub-note question', stubHtml.includes('【答案】'))
assert('teacher print hides 【解析】 when only a metadata stub note is present', !stubHtml.includes('【解析】'))
assert('teacher print never leaks raw paperId=...assetVersion= text', !/paperId=.*assetVersion=/.test(stubHtml))

const realExplanationDetail = makeDetail({
  questions: [
    {
      id: 'q-2',
      stem: 'What is the answer?',
      answer: 'A',
      explanation: '正答依据：...',
      note: 'paperId=paper-x; assetVersion=3',
      options: [{ label: 'A', content: 'Correct' }],
    },
  ],
})
const realHtml = buildPrintHtml({
  title: 'Real Explanation Test',
  versionType: 'teacher',
  printStyle: 'exam',
  items: [{ detail: realExplanationDetail, score: 2 }],
  blocks: [{ type: 'question_group', questionGroupId: 'group-x', score: 2 }],
  questionNumberStart: 1,
})
assert(
  'teacher print shows a real (non-stub) explanation',
  realHtml.includes('<strong>【解析】</strong>正答依据'),
)

/* ───────────────────── 2. analysisText.mjs degrader fixtures ───────────────────── */

console.log('\n-- 2. analysisText.mjs four-family degrader (real tracked fixtures) --')

const { loadGroupAnalysisTexts } = await import(
  path.join(rootDir, 'server', 'draft-paper', 'analysisText.mjs')
)

const paperAssetsDir = path.join(rootDir, 'app', 'public', 'paper-assets')
const zjPaperId = 'paper-zj-2026-jan'
const zjAssetPath = path.join(paperAssetsDir, zjPaperId, 'latest', 'paper-asset.json')
assert('paper-zj-2026-jan fixture asset exists', existsSync(zjAssetPath))

if (existsSync(zjAssetPath)) {
  const zjAsset = readJson(`app/public/paper-assets/${zjPaperId}/latest/paper-asset.json`)

  function detailForGroup(groupId, groupType) {
    const group = zjAsset.content.groups[groupId]
    const questions = (group?.questionIds || []).map((qid) => ({ id: qid, explanation: '' }))
    return { id: groupId, groupType, questions }
  }

  const familyGroups = [
    ['group-zj-2026-jan-reading-a', 'reading'],
    ['group-zj-2026-jan-cloze', 'cloze'],
    ['group-zj-2026-jan-grammar-fill', 'grammar_cloze'],
    ['group-zj-2026-jan-seven-choices', 'seven_choices'],
  ]

  const items = familyGroups.map(([groupId, groupType]) => ({ detail: detailForGroup(groupId, groupType) }))
  const writingGroupId = 'group-zj-2026-jan-writing-application'
  items.push({ detail: detailForGroup(writingGroupId, 'writing') })

  const result = loadGroupAnalysisTexts(items, { paperAssetsDir })

  for (const [groupId, groupType] of familyGroups) {
    const group = zjAsset.content.groups[groupId]
    const questionIds = group?.questionIds || []
    assert(`${groupType} group has question ids to check`, questionIds.length > 0)
    for (const qid of questionIds) {
      const text = result.get(qid)
      assert(`${groupType} ${qid} produced non-empty analysis text`, typeof text === 'string' && text.length > 0)
      assert(`${groupType} ${qid} text is within 600+ellipsis budget`, (text || '').length <= 601)
      assert(`${groupType} ${qid} text is not raw JSON`, text ? !text.trim().startsWith('{') : false)
    }
  }

  const writingGroup = zjAsset.content.groups[writingGroupId]
  const writingQuestionIds = writingGroup?.questionIds || []
  assert(
    'writing group produces no analysis text entries (excluded family)',
    writingQuestionIds.every((qid) => !result.has(qid)),
  )
}

/* ───────────────────── 3. missing/unmatched-group graceful degradation ───────────────────── */

console.log('\n-- 3. missing-analysis / unmatched-group graceful degradation --')

const jiaAssetPath = path.join(paperAssetsDir, 'paper-2024-jia', 'latest', 'paper-asset.json')
const jiaAnalysesDir = path.join(paperAssetsDir, 'paper-2024-jia', 'latest', 'analyses')
assert('paper-2024-jia fixture exists', existsSync(jiaAssetPath))
assert(
  'paper-2024-jia has no writing-analysis-v1.json (plan-cited missing-analysis case)',
  existsSync(jiaAnalysesDir) && !existsSync(path.join(jiaAnalysesDir, 'writing-analysis-v1.json')),
)

if (existsSync(jiaAssetPath)) {
  const jiaAsset = readJson('app/public/paper-assets/paper-2024-jia/latest/paper-asset.json')
  const jiaReadingGroupId = Object.keys(jiaAsset.content.groups).find(
    (groupId) => jiaAsset.content.groups[groupId].groupType === 'reading',
  )
  const jiaGroup = jiaAsset.content.groups[jiaReadingGroupId]
  const jiaItems = [
    {
      detail: {
        id: jiaReadingGroupId,
        groupType: 'reading',
        questions: (jiaGroup?.questionIds || []).map((qid) => ({ id: qid, explanation: '' })),
      },
    },
  ]
  let jiaResult = null
  let jiaThrew = false
  try {
    jiaResult = loadGroupAnalysisTexts(jiaItems, { paperAssetsDir })
  } catch {
    jiaThrew = true
  }
  assert('loader does not throw on a paper missing writing-analysis-v1.json', !jiaThrew)
  assert(
    'loader still returns real reading analysis text for that paper',
    !!jiaResult && (jiaGroup?.questionIds || []).some((qid) => (jiaResult.get(qid) || '').length > 0),
  )
}

let fakeGroupThrew = false
let fakeGroupResult = null
try {
  fakeGroupResult = loadGroupAnalysisTexts(
    [{ detail: { id: 'group-does-not-exist', groupType: 'reading', questions: [{ id: 'q-fake-1', explanation: '' }] } }],
    { paperAssetsDir },
  )
} catch {
  fakeGroupThrew = true
}
assert('loader does not throw for a groupId owned by no paper-asset', !fakeGroupThrew)
assert('loader returns no entry for an unmatched group', !!fakeGroupResult && !fakeGroupResult.has('q-fake-1'))

assert('loader is a safe no-op on empty items', loadGroupAnalysisTexts([], { paperAssetsDir }).size === 0)
assert(
  'loader is a safe no-op when paperAssetsDir is missing from deps',
  loadGroupAnalysisTexts([{ detail: { id: 'g', groupType: 'reading', questions: [] } }], {}).size === 0,
)

/* ───────────────────── 4. findPaperAssetGroup contract regression ───────────────────── */

console.log('\n-- 4. findPaperAssetGroup contract regression (server/api.mjs) --')

const apiSource = read('server/api.mjs')
assert('findPaperAssetGroup still exists', /function findPaperAssetGroup\(groupId\)/.test(apiSource))
assert(
  'findPaperAssetGroup still returns { asset, group } shape for existing callers',
  /if \(group\) return \{ asset, group, paperId: entry\.name \}/.test(apiSource),
)
assert(
  'existing print-ready call site still destructures asset/group only (untouched)',
  /getPaperAssetPrintReady\(paperAssetMatch\.asset, paperAssetMatch\.group\)/.test(apiSource),
)
assert(
  'existing question-group-detail call site still destructures asset/group only (untouched)',
  /applyPaperAssetToQuestionGroupDetail\(baseDetail, paperAssetMatch\.asset, paperAssetMatch\.group, questions\)/.test(apiSource),
)
assert(
  'paperAssetsDir now injected into draftPaperStore factory call',
  /createDraftPaperStore\(\{[\s\S]{0,200}paperAssetsDir,[\s\S]{0,200}\}\)/.test(apiSource),
)

/* ───────────────────── 5. draftPaperStore wiring contract ───────────────────── */

console.log('\n-- 5. draftPaperStore wiring contract --')

const draftStoreSource = read('server/draft-paper/draftPaperStore.mjs')
assert('draftPaperStore imports loadGroupAnalysisTexts', draftStoreSource.includes("import { loadGroupAnalysisTexts } from './analysisText.mjs'"))
assert('draftPaperStore factory accepts paperAssetsDir', /createDraftPaperStore\(\{[\s\S]{0,200}paperAssetsDir,/.test(draftStoreSource))
assert(
  'buildDraftPrintHtml only joins analysis for teacher version',
  /input\.versionType === 'teacher' && paperAssetsDir/.test(draftStoreSource),
)
assert(
  'buildDraftPrintHtml never overwrites an existing (non-empty) explanation',
  /if \(question\.explanation\) continue/.test(draftStoreSource),
)
assert(
  'analysisText.mjs never writes the DB (no db.prepare/UPDATE/INSERT calls)',
  !/\bdb\.(prepare|exec)\(/.test(read('server/draft-paper/analysisText.mjs')),
)

/* ───────────────────── 6. application lecture publish contract ───────────────────── */

console.log('\n-- 6. application lecture publish contract --')

const { validateWritingAnalysisCandidate, persistWritingAnalysisGroup } = await import(
  path.join(rootDir, 'server', 'writing-analysis', 'writingAnalysisBackfillService.mjs')
)

function candidateFor(year) {
  return JSON.parse(read(`docs/cuts/applied-writing-lecture-v3/pilot-content/paper-${year}-i.application.json`))
}

function rejects(name, mutate) {
  const candidate = candidateFor('2024')
  mutate(candidate)
  let threw = false
  try { validateWritingAnalysisCandidate(candidate) } catch { threw = true }
  assert(name, threw)
}

for (const year of ['2022', '2024']) {
  const candidate = candidateFor(year)
  let threw = false
  try { validateWritingAnalysisCandidate(candidate) } catch { threw = true }
  assert(`${year} locked packet passes real application validator`, !threw)
}

rejects('normalized-only review anchor is rejected', (candidate) => { candidate.reviewMarks[0].text = candidate.reviewMarks[0].text.replace('share', 'share  ') })
rejects('normalized-only highlighted anchor is rejected', (candidate) => { candidate.highlightExpressions[0].text = candidate.highlightExpressions[0].text.replace('At first', 'At  first') })
rejects('partial review card is rejected', (candidate) => { delete candidate.reviewCard.reader })
rejects('wrong point cardinality is rejected', (candidate) => { candidate.reviewCard.points = ['only one'] })
rejects('wrong review grid order is rejected', (candidate) => { candidate.reviewMarks[1].grid = 'tense' })
rejects('duplicate non-point grid is rejected', (candidate) => { candidate.reviewMarks[3].grid = 'type' })
rejects('wrong highlight annotation count is rejected', (candidate) => { delete candidate.highlightExpressions[0].lectureAnnotation })
rejects('partial highlight annotation is rejected', (candidate) => { delete candidate.highlightExpressions[0].lectureAnnotation.note })
rejects('trim failure is rejected', (candidate) => { candidate.highlightExpressions[0].lectureAnnotation.label = ' leading' })
rejects('HTML failure is rejected', (candidate) => { candidate.highlightExpressions[0].lectureAnnotation.note = '<b>markup</b>' })
rejects('Markdown failure is rejected', (candidate) => { candidate.highlightExpressions[0].lectureAnnotation.note = '**markdown**' })
rejects('newline failure is rejected', (candidate) => { candidate.highlightExpressions[0].lectureAnnotation.note = 'one\ntwo' })
rejects('code-point limit failure is rejected', (candidate) => { candidate.highlightExpressions[0].lectureAnnotation.label = 'a'.repeat(25) })

const legacy = candidateFor('2024')
delete legacy.reviewCard
delete legacy.reviewMarks
legacy.highlightExpressions.forEach((item) => delete item.lectureAnnotation)
let legacyThrew = false
try { validateWritingAnalysisCandidate(legacy) } catch { legacyThrew = true }
assert('legacy application without every v3 field remains valid but unpublished', !legacyThrew)

const tempAssets = mkdtempSync(path.join(os.tmpdir(), 'awl-v3-verify-'))
try {
  const candidate = candidateFor('2022')
  const { filePath } = persistWritingAnalysisGroup({ paperAssetsDir: tempAssets }, { paperId: 'paper-2022-i', groupId: 'group-2022-i-writing-application' }, candidate)
  const persisted = JSON.parse(readFileSync(filePath, 'utf8'))
  assert('persistence keeps the complete locked lecture payload', isDeepStrictEqual(persisted.groups['group-2022-i-writing-application'].writing, candidate))
  const continuation = { taskType: 'continuation', modelAnswer: 'x '.repeat(120), continuationDesign: { theme: 'theme', paragraphs: ['one', 'two'] }, highlightExpressions: [{ text: 'x', note: 'one' }, { text: 'x', note: 'two' }, { text: 'x', note: 'three' }] }
  validateWritingAnalysisCandidate(continuation)
  persistWritingAnalysisGroup({ paperAssetsDir: tempAssets }, { paperId: 'paper-2022-i', groupId: 'group-2022-i-writing-continuation' }, continuation)
  const storedContinuation = JSON.parse(readFileSync(filePath, 'utf8')).groups['group-2022-i-writing-continuation'].writing
  assert('continuation persistence excludes application lecture fields', !('reviewCard' in storedContinuation) && !storedContinuation.highlightExpressions.some((item) => 'lectureAnnotation' in item))
} finally {
  rmSync(tempAssets, { recursive: true, force: true })
}

/* ───────────────────── summary ───────────────────── */

console.log(`\nRestart cut ③ verify: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
