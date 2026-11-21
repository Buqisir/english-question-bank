#!/usr/bin/env node

import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  buildCompanionAnalysisHtml,
  companionAnalysisFileName,
  loadCompanionAnalysisSource,
} from '../server/exports/companionAnalysisRenderer.mjs'
import { createExportImplementation } from '../server/exports/exportImplementation.mjs'
import { projectContinuationAnalysisDisplay } from '../shared/writing/continuationAnalysis.mjs'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const paperAssetsDir = path.join(rootDir, 'test-fixtures', 'retired-paper-assets')
const source = loadCompanionAnalysisSource({
  paperAssetsDir,
  paperId: 'paper-2025-i',
})
const html = buildCompanionAnalysisHtml(source)
const historicalContinuationSource = loadCompanionAnalysisSource({
  paperAssetsDir: path.join(rootDir, 'app/public/paper-assets'),
  paperId: 'paper-mock-gd-2026-m1',
})
const historicalContinuationHtml = buildCompanionAnalysisHtml(historicalContinuationSource)
const historicalWriting = Object.values(historicalContinuationSource.analyses.writing.groups)
  .map(({ writing }) => writing)
  .find(({ taskType }) => taskType === 'continuation')
const historicalEvidence = historicalWriting.continuationAnalysis.storyUnderstanding
  .centralSituation.evidence[0].excerpt
assert.equal((historicalContinuationHtml.match(/data-continuation-section=/gu) || []).length, 4)
assert.ok(historicalContinuationHtml.includes(historicalEvidence))
assert.ok(historicalContinuationHtml.includes('历史分析保留'))
assert.ok(!historicalContinuationHtml.includes('语言对齐'))

const v2ContinuationSource = structuredClone(historicalContinuationSource)
const v2Writing = Object.values(v2ContinuationSource.analyses.writing.groups)
  .map(({ writing }) => writing)
  .find(({ taskType }) => taskType === 'continuation')
const projected = projectContinuationAnalysisDisplay(v2Writing.continuationAnalysis)
v2Writing.continuationAnalysis = {
  schemaVersion: 'continuation-analysis-v2',
  storyUnderstanding: projected.storyUnderstanding,
  continuationContract: projected.continuationContract,
  developmentPlan: projected.developmentPlan,
}
v2Writing.continuationAnalysis.developmentPlan.paragraphs[0].emotionChanges = [{
  trigger: 'EMOTION_TRIGGER_SENTINEL。',
  from: 'uncertain',
  to: 'resolved',
  visibleAction: 'VISIBLE_ACTION_SENTINEL。',
}]
v2Writing.continuationAnalysis.developmentPlan.paragraphs[0].cluePayoffs = [{
  clue: { source: 'material', excerpt: 'CLUE_SENTINEL' }, payoff: 'PAYOFF_SENTINEL',
}]
Object.assign(v2Writing.continuationAnalysis.developmentPlan, {
  qualityRisks: ['QUALITY_RISK_SENTINEL'], reviewNotes: ['REVIEW_NOTE_SENTINEL'], internal: 'INTERNAL_SENTINEL',
})
v2Writing.officialModelAnswer = 'LEGACY_SOURCE_SENTINEL'
v2Writing.modelAnswer = 'GENERATED_MODEL_SENTINEL'
const v2ContinuationHtml = buildCompanionAnalysisHtml(v2ContinuationSource)
assert.equal((v2ContinuationHtml.match(/data-continuation-section=/gu) || []).length, 4)
assert.match(v2ContinuationHtml, /<p>触发：EMOTION_TRIGGER_SENTINEL<\/p><p>变化：uncertain → resolved<\/p><p>表现：VISIBLE_ACTION_SENTINEL<\/p>/u)
assert.match(v2ContinuationHtml, /<li><p><b>原文<\/b>：“CLUE_SENTINEL”<\/p><p>PAYOFF_SENTINEL<\/p><\/li>/u)
assert.doesNotMatch(v2ContinuationHtml, /质量风险|QUALITY_RISK_SENTINEL|REVIEW_NOTE_SENTINEL|INTERNAL_SENTINEL/u)
assert.ok(v2ContinuationHtml.includes('LEGACY_SOURCE_SENTINEL'))
assert.ok(v2ContinuationHtml.includes('GENERATED_MODEL_SENTINEL'))
assert.match(v2ContinuationHtml, /<h4>参考范文<\/h4>[\s\S]*LEGACY_SOURCE_SENTINEL[\s\S]*<h4>参考范文（AI 撰写）<\/h4>[\s\S]*GENERATED_MODEL_SENTINEL/u)
assert.ok(!v2ContinuationHtml.includes('continuationDesign'))
assert.ok(!v2ContinuationHtml.includes('highlightExpressions'))
const [continuationGroupId] = Object.entries(v2ContinuationSource.analyses.writing.groups)
  .find(([, { writing }]) => writing === v2Writing)
const writingProjection = {
  paperAsset: v2ContinuationSource.paperAsset,
  analysisSidecars: { 'writing-analysis-v1.json': v2ContinuationSource.analyses.writing },
  consumption: { visibleStructure: [
    { kind: 'part' }, { kind: 'section' },
    { kind: 'group', groupId: continuationGroupId, slotId: 'writing.continuation' },
  ] },
  sourceReferences: { groups: [{ groupId: continuationGroupId, taskType: 'continuation', essays: { entries: [] } }] },
}
delete v2Writing.officialModelAnswer
const sourceEssay = ['参考范文', 'SOURCE_ESSAY_SENTINEL']
const aiEssay = ['参考范文（AI 撰写）', 'GENERATED_MODEL_SENTINEL']
for (const [hasSource, hasAi, expected] of [
  [true, true, [sourceEssay, aiEssay]], [true, false, [sourceEssay]],
  [false, true, [aiEssay]], [false, false, []],
]) {
  writingProjection.sourceReferences.groups[0].essays.entries = hasSource
    ? [{ provenance: 'unofficial', paragraphs: [{ text: sourceEssay[1] }] }] : []
  v2Writing.modelAnswer = hasAi ? aiEssay[1] : ''
  const revision = buildCompanionAnalysisHtml({ projection: writingProjection })
  assert.deepEqual([...revision.matchAll(/<h4>([^<]*范文[^<]*)<\/h4><p class="model-paragraph">([^<]+)<\/p>/gu)]
    .map(([, label, text]) => [label, text]), expected)
  assert.equal(revision.includes('data-continuation-section="modelAnswer"'), expected.length > 0)
}
const translatedSource = structuredClone(source)
for (const group of Object.values(translatedSource.analyses.reading.groups)) {
  group.fullTranslationZh = '这是阅读文章的完整中文译文。'
}
translatedSource.analyses.sevenChoices.groups['group-2025-i-seven-choices'].fullTranslationZh =
  Array.from({ length: 5 }, (_, index) => `[${36 + index}]七选五译文。`).join('')
translatedSource.analyses.cloze.groups['group-2025-i-cloze'].fullTranslationZh =
  Array.from({ length: 15 }, (_, index) => `[${41 + index}]完形填空译文。`).join('')
translatedSource.analyses.grammarFill.groups['group-2025-i-grammar-fill'].fullTranslationZh =
  Array.from({ length: 10 }, (_, index) => `[${56 + index}]语法填空译文。`).join('')
translatedSource.analyses.reading.groups['group-2025-i-reading-b'].selectedLongSentences = [{
  paragraphId: 'para-2025-i-reading-b-1',
  sourceText: 'More than once, I found myself wondering just how my students knew their subjects so well.',
  displayText: 'More than once, I found myself wondering just how my students knew their subjects so well.',
  relatedQuestionIds: ['q-2025-i-024'],
  translationZh: '我不止一次地思索，我的学生怎么会如此了解他们笔下的人物。',
  analysisZh: '主干是 I found myself wondering；how 引出的部分说明 wondering 的具体内容。',
  underlineTexts: ['I found myself wondering', 'how my students knew their subjects so well'],
}]
const translatedHtml = buildCompanionAnalysisHtml(translatedSource)

assert.match(html, /^<!DOCTYPE html>/u)
assert.ok(html.includes('<body><!--\nTHESIS:'), 'direction contract remains in emitted HTML')
assert.ok(html.includes('<title>2025年新课标I卷｜配套解析</title>'))
assert.equal(companionAnalysisFileName(source.paperAsset), '2025年新课标I卷-配套解析.pdf')

assert.ok(html.includes('答案速查'))
assert.ok(!html.includes('配套解析 · 依据已发布答案与解析编排'))
assert.ok(!html.includes('解析先还原题目所在语境'))
assert.ok(!html.includes('.edition-line'))
assert.ok(!html.includes('.front-note'))
assert.ok(html.includes('第二部分 阅读'))
assert.ok(html.includes('第三部分 语言运用'))
assert.ok(html.includes('第四部分 写作'))
assert.ok(html.indexOf('第二部分 阅读') < html.indexOf('第三部分 语言运用'))
assert.ok(html.indexOf('第三部分 语言运用') < html.indexOf('第四部分 写作'))
assert.equal((html.match(/class="question question--/gu) || []).length, 45)

assert.ok(html.includes('篇章大意'))
assert.ok(html.includes('干扰项辨析'))
assert.equal((html.match(/class="reading-distractor-item"/gu) || []).length, 45)
assert.equal((html.match(/class="cloze-distractor-item"/gu) || []).length, 45)
assert.ok(html.includes('原文依据'))
assert.ok(!html.includes('--paper-soft'))
assert.ok(!html.includes('background: var(--paper-soft)'))
assert.ok(html.includes('class="context-chain"'))
assert.ok(!html.includes('.context-chain-answer {\n  background:'))
assert.ok(html.includes('class="distractor distractor--cloze"'))
assert.ok(!html.includes('词义对照'))
assert.ok(!html.includes('option-glosses'))
assert.ok(html.includes('string-set: running-group attr(data-running)'), 'group heading feeds the dictionary-style running head')
assert.ok(html.includes('参考范文'))
assert.ok(!html.includes('精选表达'))
assert.ok(!html.includes('续写路线'))
assert.ok(html.includes('参考范文（AI 撰写）'))
assert.equal((translatedHtml.match(/class="full-translation"/gu) || []).length, 7)
assert.equal((translatedHtml.match(/class="translation-marker"/gu) || []).length, 0)
assert.ok(translatedHtml.includes('[36]七选五译文。'))
assert.ok(translatedHtml.includes('全文译文'))
assert.equal((translatedHtml.match(/class="long-sentences"/gu) || []).length, 1)
assert.ok(translatedHtml.includes('长难句解析'))
assert.ok(translatedHtml.includes('<span class="source-underline">I found myself wondering</span>'))
assert.ok(translatedHtml.includes('<span class="inline-label">句子解析</span>'))
assert.ok(translatedHtml.includes('<span class="inline-label">参考译文</span>'))

assert.ok(!html.includes('primaryMechanismFacet'))
assert.ok(!html.includes('signatureFacet'))
assert.ok(!html.includes('facetKey'))
assert.ok(!html.includes('semanticField'))

assert.ok(html.includes('size: A4 portrait'))
assert.ok(html.includes('margin: 17mm 14.2mm 18mm 18mm'))
assert.ok(html.includes('@page:left'))
assert.ok(html.includes('--fs: 10pt'), 'body size stays at 10pt (old layout was 9pt)')
assert.ok(html.includes('--lh: 15pt'))
assert.ok(html.includes('class="analysis-body"'))
assert.ok(html.includes('column-count: 2'))
assert.ok(html.includes('column-gap: calc(2 * var(--char))'))
assert.ok(html.includes('column-rule: 0.35pt solid var(--line)'))
assert.ok(html.includes('--green: #596a58'))
assert.ok(html.includes('--green-deep: #3b4e3d'))
assert.ok(!html.includes('--green-pale'))
assert.ok(html.includes('orphans: 2'))
assert.ok(html.includes('widows: 2'))
// Repository fonts only, in the exam paper's own stack, and kept out of
// Paged.js's CSS parser (a full OTF bundle drops every author rule after it).
assert.ok(html.includes('--zh: "EQB Termes", "EQB Source Han Serif", serif'))
assert.match(html, /<style data-pagedjs-ignore>\n@font-face \{ font-family: 'EQB Termes'/u)
const authorCss = html.slice(html.indexOf('<style>\n'), html.indexOf('</head>'))
assert.ok(!/sans-serif|PingFang|Songti|Noto|Helvetica|Arial/u.test(authorCss), 'no system-font fallbacks')
// Paged.js justifies the last line of split fragments unless told otherwise.
assert.ok(html.includes('text-align-last: start'))

const sevenGroupId = 'group-2025-i-seven-choices'
const [sevenQuestionId, nextSevenQuestionId] = source.paperAsset.content.groups[sevenGroupId].questionIds
const listeningGroupId = 'listening-fixture'
const listeningQuestionId = 'question:listening:1'
const listeningIds = [1, 3, 4].map(number => `question:listening:${number}`)
const revisionAsset = structuredClone(source.paperAsset)
revisionAsset.content.groups[sevenGroupId].passage.paragraphs = [{
  paragraphId: 'seven-fixture', text: 'Earlier. __36__ Later.',
}]
revisionAsset.content.groups[listeningGroupId] = { groupId: listeningGroupId, groupType: 'listening',
  questionIds: listeningIds }
for (const id of listeningIds) {
  revisionAsset.content.questions[id] = { questionNo: Number(id.at(-1)) }
  revisionAsset.answerKey.answers[id] = { answer: 'C' }
}
const sevenAnalysis = structuredClone(source.analyses.sevenChoices)
sevenAnalysis.questions[sevenQuestionId].contextEvidence = {
  paragraphId: 'seven-fixture', beforeQuote: 'Later.', afterQuote: 'Later.',
}
sevenAnalysis.groups[sevenGroupId].fullTranslationZh = '甲乙'
sevenAnalysis.groups[sevenGroupId].teachingContent = {
  schemaVersion: 'objective-teaching-content-v1',
  translation: { textId: 'translation', paragraphs: [{ paragraphId: 'p', quote: '甲乙' }] },
  annotations: [[sevenQuestionId, 2, '甲乙'], [nextSevenQuestionId, 1, '甲']].map(([id, end, quote]) => ({
    kind: 'evidence', questionIds: [id], translationRanges: [{ textId: 'translation', paragraphId: 'p', start: 0, end, quote }],
  })),
}
const revisionHtml = buildCompanionAnalysisHtml({ projection: {
  paperAsset: revisionAsset,
  materialization: { listening: {
    answers: [{ canonicalNumber: 1, value: 'C', provenance: 'unofficial' }],
    transcript: [{ segmentId: 'm' }, { segmentId: 'missing' }, { segmentId: 'n' }],
  } },
  consumption: { visibleStructure: [
    { kind: 'part' }, { kind: 'section' },
    { kind: 'group', groupId: listeningGroupId, slotId: 'listening.short-dialogue' },
    { kind: 'section' }, { kind: 'group', groupId: sevenGroupId, slotId: 'seven-choices' },
  ] },
  analysisSidecars: {
    'seven-choices-analysis-v1.json': sevenAnalysis,
    'listening-analysis-v1.json': {
      materials: {
        n: { segmentId: 'n', questionIds: [listeningIds[2], listeningIds[1]], topic: {} },
        m: { segmentId: 'm', questionIds: [listeningQuestionId], topic: {} },
      },
      questions: { [listeningQuestionId]: {} },
    },
  },
} })
assert.doesNotMatch(revisionHtml, /<span>空前<\/span><p lang="en">Later\.<\/p>/)
assert.match(revisionHtml, /<span>空后<\/span><p lang="en">Later\.<\/p>/)
assert.match(revisionHtml, /<h3>听力<small>听力答案（非官方，据录音整理）<\/small><\/h3>/)
assert.match(revisionHtml, /<small>听力答案（非官方，据录音整理）<\/small>/)
assert.match(revisionHtml, /第 1 段材料（第 1 题）[\s\S]*第 3 段材料（第 3–4 题）/u)
assert.deepEqual([...revisionHtml.matchAll(/class="translation-marker">(\[[\d、]+\])<\/b>/gu)]
  .map(([, marker]) => marker), ['[36、37]', '[36]'])
const answerCells = markup => [...markup.matchAll(/data-question-id="([^"]+)"><b>([^<]+)<\/b> <span>([^<]+)<\/span>/gu)]
  .map(([, id, number, answer]) => [id, `${number} ${answer}`])
for (const document of [html, revisionHtml]) {
  const [frontmatter, body] = document.split('<div class="analysis-body">')
  const groups = [...body.matchAll(/<div class="group-key-answers[^"]*">(.*?)<\/div>/gu)]
  assert.deepEqual(groups.flatMap(([, cells]) => answerCells(cells)), answerCells(frontmatter))
}
assert.doesNotMatch(html, /[。．.!！?？]）：|[。．.!！?？]；作用：/)

const tempDir = mkdtempSync(path.join(tmpdir(), 'verify-companion-analysis-'))
try {
  const implementation = createExportImplementation({
    rootDir,
    exportDir: tempDir,
    getQuestionGroupDetail: () => null,
    buildPrintHtml: () => '',
    paperAssetsDir,
    timestampPrefix: () => 'verification',
  })
  const htmlResult = implementation.exportCompanionAnalysisHtml({ paperId: 'paper-2025-i' })
  assert.equal(htmlResult.fileName, '2025年新课标I卷-配套解析.html')
  assert.equal(htmlResult.body, html)

  const pdfResult = implementation.exportCompanionAnalysisPdf({ paperId: 'paper-2025-i' })
  assert.equal(pdfResult.fileName, '2025年新课标I卷-配套解析.pdf')
  assert.equal(pdfResult.body.subarray(0, 4).toString(), '%PDF')
  assert.equal(readFileSync(pdfResult.outputPath).subarray(0, 4).toString(), '%PDF')
} finally {
  rmSync(tempDir, { recursive: true, force: true })
}

console.log('Companion analysis HTML/PDF export: PASS')

// No dot separators anywhere the renderer writes its own text: answers align in
// columns, lists use 、, labels use ：. (A 间隔号 inside a translated foreign
// name such as 马克·吐温 comes from the analysis text and is correct.)
for (const file of readdirSync(new URL('../server/exports/companion-analysis/', import.meta.url))) {
  const source = readFileSync(new URL(`../server/exports/companion-analysis/${file}`, import.meta.url), 'utf8')
  assert.ok(!source.includes('·'), `${file} writes a · separator`)
}

// One printed passage per blank paragraph: the completed text carries both the
// clue moved over from the original and the filled answer; a paragraph whose
// texts do not line up keeps the old 原题 / 答案补全 pair.
{
  const { renderSourceRelationships } = await import('../server/exports/companion-analysis/blocks.mjs')
  const original = 'Yet now I live in the countryside, __56__ tea grows, and __57__ (center) heating fails.'
  const completed = 'Yet now I live in the countryside, where tea grows, and central heating fails.'
  const at = (text, quote) => { const start = Array.from(text.slice(0, text.indexOf(quote))).length; return { start, end: start + Array.from(quote).length, quote } }
  const teaching = (completedText) => ({
    schemaVersion: 'objective-teaching-content-v1',
    sourceTextId: 'src',
    completedSourceTexts: [{ textId: 'done', paragraphId: 'p1', text: completedText }],
    annotations: [
      { annotationId: 'e56', kind: 'answer-evidence', questionIds: ['q56'], sourceRanges: [{ textId: 'src', paragraphId: 'p1', ...at(original, 'the countryside') }] },
      { annotationId: 'i56', kind: 'answer-insertion', questionIds: ['q56'], sourceRanges: [{ textId: 'done', paragraphId: 'p1', ...at(completedText, 'where') }] },
      { annotationId: 'i57', kind: 'answer-insertion', questionIds: ['q57'], sourceRanges: [{ textId: 'done', paragraphId: 'p1', ...at(completedText, 'central') }] },
      { annotationId: 'e57', kind: 'answer-evidence', questionIds: ['q57'], sourceRanges: [{ textId: 'src', paragraphId: 'p1', ...at(original, 'heating fails') }] },
    ],
  })
  const group = { groupType: 'grammarFill', passage: { paragraphs: [{ paragraphId: 'p1', text: original }] } }
  const paper = { content: { questions: { q56: { questionNo: 56 }, q57: { questionNo: 57 } } } }
  const merged = renderSourceRelationships({ teachingContent: teaching(completed) }, group, paper)
  assert.equal([...merged.matchAll(/data-source-text-state="merged"/gu)].length, 1)
  assert.doesNotMatch(merged, /原题|答案补全|__56__/u)
  for (const [kind, text] of [['answer-evidence', 'the countryside'], ['answer-insertion', 'where'], ['answer-insertion', 'central'], ['answer-evidence', 'heating fails']]) {
    assert.match(merged, new RegExp(`data-annotation-kinds="${kind}"[^>]*>${text}</span>`, 'u'))
  }
  const edited = 'Yet now I live in the countryside, where tea grows, and central heating often fails.'
  const unaligned = renderSourceRelationships({ teachingContent: teaching(edited) }, group, paper)
  assert.match(unaligned, /原题[\s\S]*答案补全/u, 'texts that do not line up keep both paragraphs')
}
console.log('Companion analysis merged passage and separators: PASS')
