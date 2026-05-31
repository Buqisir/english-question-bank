#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseReadingCandidatesFromText, parseReadingDocxBuffer } from '../server/paper-import-ai/docxSplitter.mjs'
import { buildPaperImportAiPackageFiles } from '../server/paper-import-ai/packageBuilder.mjs'
import { createPaperImportAiRoutes } from '../server/paper-import-ai/routes.mjs'
import { validatePaperImportPackage } from '../server/paper-import/validator.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

let passed = 0

function assert(name, condition, detail = '') {
  if (!condition) throw new Error(`${name}${detail ? `\n${detail}` : ''}`)
  passed += 1
  console.log(`ok - ${name}`)
}

function assertRejects(name, fn, pattern) {
  return Promise.resolve().then(() => fn()).then(
    () => { throw new Error(`${name}\nexpected rejection`) },
    (error) => {
      const message = error && typeof error === 'object' && 'message' in error
        ? String(error.message)
        : error instanceof Error ? error.message : String(error)
      assert(name, pattern.test(message), message)
    },
  )
}

function readRepoFile(relPath) {
  return readFileSync(path.join(repoRoot, relPath), 'utf8')
}

// ---- Splitter ----

function fixtureClozeText() {
  return `
第三部分 语言知识运用 (共两节，满分30分)
第一节(共15小题；每小题1分，满分15分)
阅读下面短文，从短文后各题所给的A、B、C和D四个选项中，选出可以填入空白处的最佳选项。
Last week, my tree was dying. I texted my neighbor Karen. She texted me back __41__ to teach me. I was __42__ to have a neighbor who cared.
When my family moved here, Karen created a map so I could become __43__ with neighbors. Karen wanted to create a sense of __44__, and she wasn't going to leave it up to __45__.
Soon after we moved in, Karen began __46__ when I was in the yard. I loved flowers as much as Karen did. I had a daughter who had a rare __47__. I didn't have much time for __48__. Karen __49__ what it took to care for someone.
Karen helped us __50__ an uplifting landscape. I know I am not __51__.
My husband and I think about __52__ to a bigger house. Having a neighbor like Karen is one reason to __53__ where we are. She makes me want to be a better __54__. She makes me want to be like those __55__ that climb up.
41. A. hesitantly			B. instantly			C. eventually			D. gradually
42. A. cautious			B. lucky			C. curious			D. optimistic
43. A. strict			B. patient			C. content			D. familiar
44. A. achievement			B. humor			C. belonging			D. satisfaction
45. A. chance			B. expectation			C. standard			D. challenge
46. A. showing off			B. dropping by			C. standing by			D. putting off
47. A. habit			B. disease			C. talent			D. opportunity
48. A. reading			B. cleaning			C. chatting			D. gardening
49. A. understood			B. predicted			C. forgot			D. complained
50. A. create			B. imagine			C. preserve			D. assess
51. A. busy			B. ready			C. lazy			D. alone
52. A. adapting			B. returning			C. moving			D. sticking
53. A. rest			B. wait			C. stay			D. recognize
54. A. human			B. gardener			C. caregiver			D. mother
55. A. leaves			B. roses			C. trees			D. weeds
41-45 BBDCA 46-50 BBDAA 51-55 DCCAB
第二节(共10小题；每小题1.5分，满分15分)
`
}

function assertSplitterFixture() {
  const result = parseReadingCandidatesFromText(fixtureClozeText(), {
    sourceFilename: 'i3-fixture.docx', paperId: 'paper-i3-fixture',
  })
  assert('I3 fixture has cloze group', Boolean(result.clozeGroup))
  const c = result.clozeGroup
  assert('I3 cloze group has 15 questions', c.questions.length === 15)
  assert('I3 cloze group has A-D options on questions', c.questions.every(q => ['A','B','C','D'].every(l => q.options[l])))
  assert('I3 cloze answers match range', c.questions.map(q => q.answerKey).join('') === 'BBDCABBDAADCCAB')
  assert('I3 cloze not in skipped', !result.skipped.some(s => s.reason === 'cloze_out_of_scope_for_i1'))
  assert('I3 cloze has paragraphs', c.paragraphs.length > 0)
}

function assertSplitterNoCloze() {
  const text = `第二部分 阅读\nA\nSimple passage.\n21. Q?\nA. a B. b C. c D. d\n21-21 A`
  const result = parseReadingCandidatesFromText(text, { sourceFilename: 'no-cloze.docx', paperId: 'paper-no-cloze' })
  assert('no cloze paper has null clozeGroup', result.clozeGroup === null)
  assert('no cloze paper has null clozeError', result.clozeError === null)
}

function assertSplitterMissingOptions() {
  // Cloze detected by option-line pattern but no valid options parsed.
  const text = `第三部分 语言知识运用\n第一节\n阅读下面短文...\nPassage with __41__ __42__.\n41. A. x B. y C. z D. w\n42. A. x B. y C. z D. w\n第二节`
  const result = parseReadingCandidatesFromText(text, { sourceFilename: 'missing-opts.docx', paperId: 'paper-missing-opts' })
  assert('detected cloze with too few options produces null group', result.clozeGroup === null)
  assert('detected cloze with too few options produces error', result.clozeError && result.clozeError.reason === 'cloze_missing_options')
}

function assertSplitterIncompleteOptions() {
  // 10 options (enough to parse) but < 15 (incomplete).
  const lines = ['第三部分 语言知识运用', '第一节', '阅读下面短文...', 'Passage with __41__ through __50__.']
  for (let n = 41; n <= 50; n++) lines.push(`${n}. A. a B. b C. c D. d`)
  lines.push('第二节')
  const result = parseReadingCandidatesFromText(lines.join('\n'), { sourceFilename: 'incomplete.docx', paperId: 'paper-incomplete' })
  assert('incomplete options produces null cloze group', result.clozeGroup === null)
  assert('incomplete options produces error', result.clozeError && result.clozeError.reason === 'cloze_incomplete_options')
}

// ---- Package builder ----

function clFixture() {
  const sourceBuffer = Buffer.from('PK i3 package')
  const sourceHash = createHash('sha256').update(sourceBuffer).digest('hex')
  const paper = { paperId: 'paper-i3-pkg', sourceFilename: 'i3.docx', sourceHash, answerSourceFilename: 'i3-ans.docx' }
  return {
    sourceBuffer, sourceHash,
    parseResult: {
      paper,
      readingGroups: ['A','B','C','D'].map((l, i) => ({
        groupId: `group-i3-reading-${l.toLowerCase()}`,
        title: `Reading ${l}`, order: i,
        paragraphs: [{ id: `para-i3-${l.toLowerCase()}-p1`, text: `Reading ${l} text.` }],
        questions: [{ id: `q-i3-${String(21+i).padStart(3,'0')}`, stem: `Q?`, options: {A:'a',B:'b',C:'c',D:'d'}, answerKey: 'A' }],
      })),
      skipped: [],
      clozeGroup: {
        groupId: 'group-i3-cloze', groupType: 'cloze', title: '完形填空', order: 5,
        paragraphs: [{ id: 'para-i3-cloze-p1', text: 'Passage with __41__ and __42__.' }],
        questions: [41,42,43,44,45,46,47,48,49,50,51,52,53,54,55].map(n => ({
          id: `q-i3-${String(n).padStart(3,'0')}`, stem: String(n),
          answerKey: 'B', blankId: `blank-i3-${String(n).padStart(3,'0')}`,
          options: { A: 'a', B: 'b', C: 'c', D: 'd' },
        })),
        blankIds: [41,42,43,44,45,46,47,48,49,50,51,52,53,54,55].map(n => `blank-i3-${String(n).padStart(3,'0')}`),
      },
      sevenChoicesGroup: {
        groupId: 'group-i3-seven-choices', groupType: 'sevenChoices', title: '七选五', order: 4,
        paragraphs: [{ id: 'para-i3-seven-p1', text: 'Seven choices passage.' }],
        optionBank: ['A','B','C','D','E','F','G'].map(l => ({ label: l, text: `Option ${l}` })),
        questions: [36,37,38,39,40].map(n => ({
          id: `q-i3-${String(n).padStart(3,'0')}`, stem: String(n),
          answerKey: 'A', blankId: `blank-i3-${String(n).padStart(3,'0')}`,
        })),
        blankIds: [36,37,38,39,40].map(n => `blank-i3-${String(n).padStart(3,'0')}`),
      },
      grammarFillGroup: {
        groupId: 'group-i3-grammar-fill', groupType: 'grammarFill', title: '语法填空', order: 6,
        paragraphs: [{ id: 'para-i3-gf-p1', text: 'Grammar fill passage with  56  and  57  .' }],
        questions: [56,57,58,59,60,61,62,63,64,65].map(n => ({
          id: `q-i3-${String(n).padStart(3,'0')}`, stem: String(n),
          answerKey: 'word', blankId: `blank-i3-${String(n).padStart(3,'0')}`,
          prompt: n === 56 ? 'be' : null,
        })),
        blankIds: [56,57,58,59,60,61,62,63,64,65].map(n => `blank-i3-${String(n).padStart(3,'0')}`),
      },
      applicationGroup: {
        groupId: 'group-i3-writing-application', groupType: 'writing', title: '应用文写作', order: 7,
        paragraphs: [{ id: 'para-i3-app-p1', text: '应用文写作场景.' }],
        questions: [],
      },
      continuationGroup: {
        groupId: 'group-i3-writing-continuation', groupType: 'writing', title: '读后续写', order: 8,
        paragraphs: [{ id: 'para-i3-cont-p1', text: 'Continuation material text.' }],
        continuationStarters: ['Paragraph 1 starter.', 'Paragraph 2 starter.'],
        questions: [],
      },
    },
    readingAnalyses: Object.fromEntries(['A','B','C','D'].map((l) => {
      const gid = `group-i3-reading-${l.toLowerCase()}`
      return [gid, {
        schemaVersion: 'reading-choice-analysis-v1', paperId: 'paper-i3-pkg', sourceAssetVersion: 1,
        targetGroups: [gid], meta: { generatedBy: 'stub', model: 'stub', promptVersion: 'reading-choice-analysis-v1', reviewStatus: 'reviewed' },
        groups: { [gid]: { overview: `Reading ${l} overview.` } },
        questions: Object.fromEntries([{ id: `q-i3-${String(21+['A','B','C','D'].indexOf(l)).padStart(3,'0')}`, skill: { primary: 'detail' }, questionFocus: 'Q?', stemTranslationZh: '翻译', optionAnalysis: ['A','B','C','D'].map(x => ({ label: x, optionTranslationZh: x, status: x === 'A' ? 'correct' : 'wrong' })), locationParaphrases: [] }].map(q => [q.id, q])),
      }]
    })),
  }
}

const I3_SC_ANALYSIS = {
  schemaVersion: 'seven-choices-analysis-v1', paperId: 'paper-i3-pkg', sourceAssetVersion: 1,
  targetGroups: ['group-i3-seven-choices'], meta: { generatedBy: 'stub' },
  groups: { 'group-i3-seven-choices': { overview: 'SC overview.' } },
  questions: Object.fromEntries([36,37,38,39,40].map(n => [`q-i3-${String(n).padStart(3,'0')}`, { optionFit: { correctOptionLabel: 'A' } }])),
}

function i3ClozeAnalysis(fix) {
  const cl = fix.parseResult.clozeGroup
  return {
    schemaVersion: 'cloze-analysis-v1',
    paperId: 'paper-i3-pkg',
    sourceAssetVersion: 1,
    targetGroups: [cl.groupId],
    meta: { generatedBy: 'stub', model: 'stub', promptVersion: 'cloze-analysis-v1', reviewStatus: 'reviewed' },
    groups: { [cl.groupId]: { overview: '完形填空概览。', affectiveArc: '情感平稳。' } },
    blanks: Object.fromEntries(
      cl.questions.map((q) => [
        q.id,
        {
          blankId: q.blankId,
          blankNo: Number(q.stem),
          pos: 'verb',
          correctFit: { optionLabel: q.answerKey, reason: '搭配合理。' },
          distractorGlosses: ['A', 'B', 'C', 'D'].filter((l) => l !== q.answerKey).map((l) => ({
            optionLabel: l, optionText: q.options[l], meaning: `表示"${q.options[l]}"。`,
          })),
          evidence: [{ type: 'collocation-partner', signalText: 'Passage', signalSide: 'context-before', relation: '话题词呼应。' }],
          teachingNote: '通过施受关系判断。',
        },
      ]),
    ),
  }
}

function assertPackageBuilder() {
  const fix = clFixture()
  fix.parseResult.paper.sourceHash = fix.sourceHash
  const clozeAnalysis = i3ClozeAnalysis(fix)

  // Success: package with all four families (I8 now requires cloze analysis).
  const files = buildPaperImportAiPackageFiles({
    parseResult: fix.parseResult,
    analysesByGroupId: fix.readingAnalyses,
    sevenChoicesGroup: fix.parseResult.sevenChoicesGroup,
    sevenChoicesAnalysis: I3_SC_ANALYSIS,
    clozeGroup: fix.parseResult.clozeGroup,
    clozeAnalysis,
    grammarFillGroup: fix.parseResult.grammarFillGroup,
    applicationGroup: fix.parseResult.applicationGroup,
    continuationGroup: fix.parseResult.continuationGroup,
    sourceDocx: { fileName: 'i3.docx', buffer: fix.sourceBuffer },
  })
  const validation = validatePaperImportPackage(files)
  assert('I3 package with cloze passes C7 validator', validation.ok, JSON.stringify(validation.blockingIssues, null, 2))

  const asset = JSON.parse(files.find(f => f.fileName === 'paper-asset.json').buffer.toString())
  const clGroupInAsset = Object.values(asset.content.groups).find(g => g.groupType === 'cloze')
  assert('I3 paper asset includes cloze group', Boolean(clGroupInAsset))
  assert('I3 cloze group has 15 questionIds', clGroupInAsset.questionIds.length === 15)
  assert('I3 cloze group has passage paragraphs', (clGroupInAsset.passage?.paragraphs || []).length > 0)
  assert('I3 cloze analysis file present (I8 required-when-present)', files.some(f => f.fileName === 'cloze-analysis-v1.json'))

  // Block: missing answer key.
  const noAnsGroup = JSON.parse(JSON.stringify(fix.parseResult.clozeGroup))
  noAnsGroup.questions[0].answerKey = ''
  assertRejects('I3 blocks on missing cloze answer', () =>
    buildPaperImportAiPackageFiles({
      parseResult: { ...fix.parseResult, clozeGroup: noAnsGroup },
      analysesByGroupId: fix.readingAnalyses,
      sevenChoicesGroup: fix.parseResult.sevenChoicesGroup,
      sevenChoicesAnalysis: I3_SC_ANALYSIS,
      clozeGroup: noAnsGroup,
      clozeAnalysis,
      grammarFillGroup: fix.parseResult.grammarFillGroup,
      applicationGroup: fix.parseResult.applicationGroup,
      continuationGroup: fix.parseResult.continuationGroup,
      sourceDocx: { fileName: 'i3.docx', buffer: fix.sourceBuffer },
    }),
  /缺少答案解析版答案/)

  // No cloze: I4-A blocks missing objective family.
  assertRejects('I4-A blocks missing cloze family', () =>
    buildPaperImportAiPackageFiles({
      parseResult: { ...fix.parseResult, clozeGroup: null },
      analysesByGroupId: fix.readingAnalyses,
      sevenChoicesGroup: fix.parseResult.sevenChoicesGroup,
      sevenChoicesAnalysis: {
        schemaVersion: 'seven-choices-analysis-v1', paperId: 'paper-i3-pkg', sourceAssetVersion: 1,
        targetGroups: ['group-i3-seven-choices'], meta: { generatedBy: 'stub' },
        groups: { 'group-i3-seven-choices': { overview: 'SC overview.' } },
        questions: Object.fromEntries([36,37,38,39,40].map(n => [`q-i3-${String(n).padStart(3,'0')}`, { optionFit: { correctOptionLabel: 'A' } }])),
      },
      grammarFillGroup: fix.parseResult.grammarFillGroup,
      applicationGroup: fix.parseResult.applicationGroup,
      continuationGroup: fix.parseResult.continuationGroup,
      sourceDocx: { fileName: 'i3.docx', buffer: fix.sourceBuffer },
    }),
  /缺少完形填空/)
}

// ---- Route ----

function assertRouteContract() {
  const routes = createPaperImportAiRoutes()
  assert('I3 publish route registered', routes.some(r => r.method === 'POST' && r.pattern.test('/api/paper-import-ai/publish')))

  const routeSource = readRepoFile('server/paper-import-ai/routes.mjs')
  assert('I3 route passes clozeGroup to package builder', routeSource.includes('clozeGroup'))

  const serviceSource = readRepoFile('app/src/services/paperImportAi.ts')
  assert('I3 service has cloze group type', serviceSource.includes('PaperImportAiClozeGroup'))
  assert('I3 service passes clozeGroup to publish', serviceSource.includes('clozeGroup: input.clozeGroup'))

  const pageSource = readRepoFile('app/src/features/paper-import-ai/PaperImportAiWorkbench.tsx')
  assert('I3 page shows cloze panel', pageSource.includes('完形填空 预览'))
  assert('I3 page checks cloze answers', pageSource.includes('clHasAnswers'))
}

// ---- Real DOCX ----

async function assertRealDocx() {
  const canonicalPath = path.join(repoRoot, 'docs/sources/paper-2024-jslk-english/2024-jslk-english-source.docx')
  const canonical = await parseReadingDocxBuffer(readFileSync(canonicalPath), {
    sourceFilename: '2024-jslk-english-source.docx',
  })
  // 2024 JSLK may or may not have cloze in this format; at minimum splitter doesn't crash.
  assert('real DOCX splitter does not crash on cloze detection', canonical !== null)
}

// ---- Main ----

async function main() {
  assertSplitterFixture()
  assertSplitterNoCloze()
  assertSplitterMissingOptions()
  assertSplitterIncompleteOptions()
  assertPackageBuilder()
  assertRouteContract()
  await assertRealDocx()

  console.log(`\nI3 cloze AI import verify PASSED: ${passed} checks`)
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
