#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildApplicationModelAnswerMessages } from '../server/paper-import-ai/applicationWritingWorkflow.mjs'
import {
  assertFullTranslationZh,
  assertSelectedLongSentences,
} from '../server/paper-import-ai/analyzerProviderShell.mjs'
import { buildClozeAnalysisMessages } from '../server/paper-import-ai/analyzeCloze.mjs'
import { buildGrammarFillAnalysisMessages } from '../server/paper-import-ai/analyzeGrammarFill.mjs'
import { buildNarrativeContinuationAnalysisMessages } from '../server/paper-import-ai/analyzeNarrativeContinuation.mjs'
import { buildReadingAnalysisMessages } from '../server/paper-import-ai/analyzeReading.mjs'
import { buildSevenChoicesAnalysisMessages } from '../server/paper-import-ai/analyzeSevenChoices.mjs'
import { buildReadingAnalysisMessages as buildImportPipelineReadingAnalysisMessages } from './import-pipeline/lib.mjs'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const referenceDir = path.join(
  rootDir,
  '.agents/skills/importing-nck1-papers/reference',
)
const doctrinePath = path.join(referenceDir, 'teaching-analysis-style-v1.md')
const benchmarkPath = path.join(referenceDir, 'teaching-analysis-benchmark-v1.json')

const read = (relativePath) => readFileSync(path.join(rootDir, relativePath), 'utf8')
const doctrine = readFileSync(doctrinePath, 'utf8')
const benchmarkText = readFileSync(benchmarkPath, 'utf8')
const benchmark = JSON.parse(benchmarkText)

assert.match(doctrine, /^# Teaching Analysis Style — V1$/m)
assert.match(doctrine, /先讲人话，再给名字/)
assert.match(doctrine, /完整分类、标签、证据与边界/)
assert.match(doctrine, /三个错项都要辨析/)
assert.match(doctrine, /`fullTranslationZh`/)
assert.match(doctrine, /`selectedLongSentences`/)
assert.match(doctrine, /找主干 → 接修饰 → 讲关系 → 译全句/)
assert.match(doctrine, /此处词义 → 它为什么有诱惑 → 放回当前语境为什么不成立/)
assert.match(doctrine, /还原句子骨架 → 说明空格职责 → 得到答案形式/)
assert.match(doctrine, /一条参考续写路线 = 唯一正确情节/)

const skill = read('.agents/skills/importing-nck1-papers/SKILL.md')
assert.match(skill, /reference\/teaching-analysis-style-v1\.md/)
assert.match(skill, /reference\/teaching-analysis-benchmark-v1\.json/)
assert.match(skill, /docs\/product\/similar-question-dimensions\.md/)
assert.match(skill, /one model pass by default/)
assert.match(skill, /Generate teaching prose and similarity support in the same type-specific\s+analysis pass/)
assert.match(skill, /Never ask the worker to\s+guess reading slot, year, source identity, authoritative answers, deterministic\s+grammar answer forms, or Embedding vectors/)
assert.match(skill, /For Grammar Fill, first run the exported\s+`stampGrammarFillDerivedFields` normalizer/)
assert.match(skill, /`buildApplicationStagedAnalysisContract`/)
assert.match(skill, /`buildNarrativeContinuationStagedAnalysisContract`/)
assert.match(skill, /maximum concurrency of\s+four/)
assert.match(skill, /`requireFullTranslation: true`/)
assert.match(skill, /`requireSelectedLongSentences: true`/)

const prompts = {
  reading: read('prompts/reading-choice-analysis-v1.md'),
  sevenChoices: read('prompts/seven-choices-analysis-v1.md'),
  cloze: read('prompts/cloze-analysis-v1.md'),
  grammarFill: read('prompts/grammar-fill-analysis-v1.md'),
  application: read('prompts/application-writing-model-answer-v3.md'),
  continuation: read('prompts/continuation-analysis-v1.md'),
}

assert.match(prompts.reading, /hidden calculation, comparison, analogy, or inference step/)
assert.match(prompts.reading, /Writing-method questions must say both what\s+the author does and what/)
assert.match(prompts.reading, /similarityProfile/)
assert.match(prompts.reading, /`fullTranslationZh`/)
assert.match(prompts.reading, /`selectedLongSentences`/)
assert.match(prompts.reading, /Why does the author mention X.*writing-method/s)
assert.match(prompts.reading, /Do NOT fill `meta\.model`, `meta\.reviewedBy`, or `meta\.reviewedAt`/)
assert.doesNotMatch(prompts.reading, /"reviewedBy"\s*:/)
assert.match(prompts.sevenChoices, /空前正在做\/问\/说明什么 → 选项补上什么 → 空后为何能从这里继续/)
assert.match(prompts.sevenChoices, /which small part appears to fit/)
assert.match(prompts.sevenChoices, /`fullTranslationZh`/)
assert.match(prompts.sevenChoices, /`selectedLongSentences`/)
assert.match(prompts.sevenChoices, /Do not add a second `similarityProfile` object/)
assert.match(prompts.sevenChoices, /positionFacet`, `roleFacet`, and\s+`primaryMechanismFacet`/)
assert.match(prompts.sevenChoices, /Final Literal-Substring Check/)
assert.match(prompts.sevenChoices, /Do not return until every literal search succeeds/)
assert.match(prompts.sevenChoices, /Do NOT fill `meta\.model`, `meta\.reviewedBy`, or `meta\.reviewedAt`/)
assert.doesNotMatch(prompts.sevenChoices, /"reviewedBy"\s*:/)
assert.doesNotMatch(prompts.cloze, /NEVER argue why a distractor is wrong/)
assert.doesNotMatch(prompts.cloze, /Do NOT explain why it is wrong/)
assert.match(prompts.cloze, /why a student might consider it/)
assert.match(prompts.cloze, /`fullTranslationZh`/)
assert.match(prompts.cloze, /`selectedLongSentences`/)
assert.match(prompts.cloze, /放回当前语境为何不成立/)
assert.match(prompts.cloze, /similaritySummary/)
assert.match(prompts.cloze, /Embedding vector itself is generated and versioned by\s+the indexer/)
assert.match(prompts.grammarFill, /restore the shortest useful skeleton around the gap/)
assert.match(prompts.grammarFill, /`fullTranslationZh`/)
assert.match(prompts.grammarFill, /`selectedLongSentences`/)
assert.match(prompts.grammarFill, /find oneself doing 是固定搭配/)
assert.match(prompts.grammarFill, /Controlled `similarityProfile`/)
assert.match(prompts.grammarFill, /similarityForm.*server stamps/s)
assert.match(prompts.application, /礼貌不能反过来取消核心任务/)
assert.match(prompts.application, /考场可复现的完成路线/)
assert.doesNotMatch(prompts.application, /similaritySummary|Embedding vector/)
assert.match(prompts.continuation, /one teachable route, never the hidden answer/)
assert.match(prompts.continuation, /because starter 2 says/)
assert.match(prompts.continuation, /`softAffordances`, `supportedOptions`.*grounded statement/s)
assert.match(prompts.continuation, /Every `routeRationale` item is a grounded statement/)
assert.doesNotMatch(prompts.continuation, /similaritySummary|Embedding vector/)

const translationGroup = {
  groupId: 'group-translation-check',
  questions: [
    { id: 'question-36', stem: '36' },
    { id: 'question-37', stem: '37' },
  ],
}
assert.doesNotThrow(() => assertFullTranslationZh(
  { fullTranslationZh: '这是一段完整译文。' },
  translationGroup,
))
assert.doesNotThrow(() => assertFullTranslationZh(
  { fullTranslationZh: '先读上文。[36]补全此处，再读下文。[37]完成全文。' },
  translationGroup,
  { requireBlankMarkers: true },
))
assert.throws(
  () => assertFullTranslationZh(
    { fullTranslationZh: '先读上文。[36]补全此处，再读下文。' },
    translationGroup,
    { requireBlankMarkers: true },
  ),
  /必须且只能包含一次 \[37\]/,
)

const selectedSentenceGroup = {
  groupId: 'group-selected-sentence',
  paragraphs: [{
    id: 'para-selected-sentence',
    text: 'The room was __41__ with books that mattered.',
  }],
  questions: [{
    id: 'question-41',
    stem: '41',
    answerKey: 'B',
    options: { A: 'covered', B: 'filled', C: 'painted', D: 'built' },
  }],
  optionBank: [],
}
const selectedSentence = {
  paragraphId: 'para-selected-sentence',
  sourceText: 'The room was __41__ with books that mattered.',
  displayText: 'The room was filled with books that mattered.',
  relatedQuestionIds: ['question-41'],
  translationZh: '房间里摆满了那些重要的书。',
  analysisZh: '主干是 The room was filled，that mattered 修饰 books。',
  underlineTexts: ['was filled', 'that mattered'],
}
assert.doesNotThrow(() => assertSelectedLongSentences(
  { selectedLongSentences: [selectedSentence] },
  selectedSentenceGroup,
  { required: true },
))
assert.throws(
  () => assertSelectedLongSentences({}, selectedSentenceGroup, { required: true }),
  /必须包含 1—2 个长难句/,
)
assert.throws(
  () => assertSelectedLongSentences({
    selectedLongSentences: [{ ...selectedSentence, displayText: selectedSentence.sourceText }],
  }, selectedSentenceGroup, { required: true }),
  /按权威答案补全/,
)
assert.throws(
  () => assertFullTranslationZh(
    { fullTranslationZh: '[36]重复标记。[36]仍然重复。[37]只出现一次。' },
    translationGroup,
    { requireBlankMarkers: true },
  ),
  /必须且只能包含一次 \[36\]/,
)
assert.throws(
  () => assertFullTranslationZh(
    { fullTranslationZh: '先出现[37]，后出现[36]。' },
    translationGroup,
    { requireBlankMarkers: true },
  ),
  /\[37\] 必须按题面空号顺序出现/,
)

const applicationStaged = read('prompts/application-writing-staged-analysis-v1.md')
const continuationStaged = read('prompts/continuation-writing-staged-analysis-v1.md')
assert.match(applicationStaged, /"taskType": "application"/)
assert.match(applicationStaged, /"reviewCard"/)
assert.match(continuationStaged, /"taskType": "continuation"/)
assert.match(continuationStaged, /"continuationAnalysis"/)
assert.doesNotMatch(continuationStaged, /brothers|twins|first-person|150 student-written/i)

const clozePanel = read('app/src/features/paper-intelligence/ClozeAnalysisPanel.tsx')
const clozeSurfaceAdapter = read('app/src/features/paper-intelligence/clozeAnalysisSurfaceAdapter.ts')
const readingSurfaceAdapter = read('app/src/features/paper-intelligence/paperAssetSurfaceAdapter.ts')
assert.match(clozePanel, />干扰项辨析</)
assert.doesNotMatch(clozePanel, />干扰项释义</)
for (const label of ['前后呼应', '语气照应', '结合语境']) {
  assert.match(clozeSurfaceAdapter, new RegExp(label))
}
assert.match(readingSurfaceAdapter, /sourceLexicalTrap: '原词照搬'/)
assert.doesNotMatch(readingSurfaceAdapter, /原文词钩干扰/)

const paper = {
  paperId: 'paper-teaching-style-fixture',
  sourceAssetVersion: 1,
}
const paragraph = { id: 'para-teaching-style-fixture', text: 'A short source sentence.' }
const question = {
  id: 'q-teaching-style-fixture',
  stem: 'What does the source show?',
  blankId: 'blank-teaching-style-fixture',
  answerKey: 'A',
  options: { A: 'answer', B: 'other', C: 'third', D: 'fourth' },
  prompt: 'answer',
}

const messages = [
  buildReadingAnalysisMessages({
    paper,
    group: { groupId: 'group-reading', paragraphs: [paragraph], questions: [question] },
  })[0].content,
  buildImportPipelineReadingAnalysisMessages({
    paper,
    group: { groupId: 'group-reading', paragraphs: [paragraph], questions: [question] },
  })[0].content,
  buildSevenChoicesAnalysisMessages({
    paper,
    group: {
      groupId: 'group-seven',
      paragraphs: [paragraph],
      questions: [question],
      optionBank: [
        { label: 'A', text: 'one' },
        { label: 'B', text: 'two' },
        { label: 'C', text: 'three' },
        { label: 'D', text: 'four' },
        { label: 'E', text: 'five' },
        { label: 'F', text: 'six' },
        { label: 'G', text: 'seven' },
      ],
    },
  })[0].content,
  buildClozeAnalysisMessages({
    paper,
    group: { groupId: 'group-cloze', paragraphs: [paragraph], questions: [question] },
  })[0].content,
  buildGrammarFillAnalysisMessages({
    paper,
    group: { groupId: 'group-grammar', paragraphs: [paragraph], questions: [question] },
  })[0].content,
  buildApplicationModelAnswerMessages({
    writingTaskId: 'wt-application-style-fixture',
    groupId: 'group-application',
    taskType: 'application',
    instruction: '假定你是李华，请给朋友写一封邮件分享一次活动。',
    wordCountTarget: 80,
  }, null)[0].content,
  buildNarrativeContinuationAnalysisMessages({
    writingTask: {
      writingTaskId: 'wt-continuation-style-fixture',
      groupId: 'group-continuation',
      taskType: 'continuation',
      instruction: 'Continue the story in two paragraphs.',
      materialText: 'A child wanted to repair a broken gift before her mother returned.',
      continuationStarters: [
        'Her father entered the room.',
        'Together they carried the repaired gift downstairs.',
      ],
      wordCountTarget: 150,
    },
  })[0].content,
]

for (const [index, content] of messages.entries()) {
  const headingCount = content.match(/^# Teaching Analysis Style — V1$/gm)?.length || 0
  assert.equal(headingCount, 1, `runtime prompt ${index + 1} must load the shared doctrine exactly once`)
  assert.match(content, /先讲人话，再给名字/)
}

assert.equal(benchmark.version, 'teaching-analysis-benchmark-v1')
assert.equal(benchmark.cases.length, 25)
assert.equal(new Set(benchmark.cases.map(({ id }) => id)).size, benchmark.cases.length)
assert.deepEqual(
  Object.fromEntries(
    [...new Set(benchmark.cases.map(({ kind }) => kind))]
      .sort()
      .map((kind) => [kind, benchmark.cases.filter((item) => item.kind === kind).length]),
  ),
  {
    application: 2,
    cloze: 6,
    continuation: 3,
    grammarFill: 6,
    reading: 5,
    sevenChoices: 3,
  },
)
assert.doesNotMatch(benchmarkText, /https?:\/\/|user-content|\.pdf/i)

for (const item of benchmark.cases) {
  assert.ok(item.focus?.trim(), `${item.id}: focus is required`)
  assert.ok(item.requiredTeachingMoves?.length >= 2, `${item.id}: requiredTeachingMoves need at least two checks`)
  assert.ok(item.rejectIf?.length >= 2, `${item.id}: rejectIf needs at least two checks`)

  const baseDir = path.join(
    rootDir,
    'app/public/paper-assets',
    item.paperId,
    'latest',
  )
  const asset = JSON.parse(readFileSync(path.join(baseDir, 'paper-asset.json'), 'utf8'))
  const group = asset.content?.groups?.[item.groupId]
  assert.ok(group, `${item.id}: group ${item.groupId} must exist`)

  const analysis = JSON.parse(
    readFileSync(path.join(baseDir, 'analyses', item.analysisFile), 'utf8'),
  )
  if (item.kind === 'reading' || item.kind === 'sevenChoices') {
    assert.ok(asset.content?.questions?.[item.targetId], `${item.id}: question must exist`)
    assert.ok(analysis.questions?.[item.targetId], `${item.id}: question analysis must exist`)
  } else if (item.kind === 'cloze' || item.kind === 'grammarFill') {
    assert.ok(asset.content?.questions?.[item.targetId], `${item.id}: blank question must exist`)
    assert.ok(analysis.blanks?.[item.targetId], `${item.id}: blank analysis must exist`)
  } else {
    assert.ok(asset.content?.writingTasks?.[item.targetId], `${item.id}: writing task must exist`)
    const writing = analysis.groups?.[item.groupId]?.writing
    assert.equal(writing?.taskType, item.kind, `${item.id}: writing analysis kind must match`)
  }
}

console.log('PASS teaching-analysis doctrine is loaded by all live builders and the 25-case benchmark resolves to tracked assets')
