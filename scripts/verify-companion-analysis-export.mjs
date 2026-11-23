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
assert.match(v2ContinuationHtml, /<li><p class="continuation-evidence"><span class="inline-label">原文依据<\/span><span lang="en">“CLUE_SENTINEL”<\/span><\/p><p>PAYOFF_SENTINEL<\/p><\/li>/u)
// Evidence is one run-in line everywhere: no bullet list, no colon after the label.
assert.doesNotMatch(v2ContinuationHtml, /<ul class="continuation-evidence">|<b>(?:原文|题干)<\/b>：/u)
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
assert.ok(!html.includes('干扰项辨析'))
assert.match(html, /class="reading-distractor-item"><b>[A-D] 项<\/b>(?:（[^）]*）)?错在：/u)
assert.match(html, /class="cloze-distractor-item"><b>[A-D] 项<\/b>（[^）]*）意为：/u)
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
// Each clue's number appears once, after its last character (甲 ends the 37
// clue, 乙 ends the 36 clue), however the two clues overlap.
assert.deepEqual([...revisionHtml.matchAll(/class="clue-no">([\d,]+)<\/sup>/gu)]
  .map(([, marker]) => marker), ['37', '36'])
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

// One function, one component, one look: every class on the page and every
// class the stylesheet styles belongs to a component in components.mjs.
{
  const { analysisComponentByClass } = await import('../server/exports/companion-analysis/components.mjs')
  const { companionAnalysisStyles } = await import('../server/exports/companion-analysis/styles.mjs')
  for (const document of [html, revisionHtml]) {
    const body = document.slice(document.indexOf('<body'))
    for (const [, classes] of body.matchAll(/class="([^"]+)"/gu)) {
      for (const className of classes.split(/\s+/u)) {
        assert.ok(analysisComponentByClass.has(className), `class "${className}" belongs to no component`)
      }
    }
  }
  const css = companionAnalysisStyles({ houseMark: 'X', paginated: true }).replace(/\/\*[\s\S]*?\*\//gu, '')
  for (const [, className] of css.matchAll(/\.([a-z][a-z0-9-]*)/gu)) {
    if (className.startsWith('pagedjs')) continue
    assert.ok(analysisComponentByClass.has(className), `styles.mjs styles "${className}", which belongs to no component`)
  }
  // No horizontal rule in the body: the column rule is the only line, the
  // masthead's short bar the only rule outside it.
  assert.deepEqual([...css.matchAll(/^\s*([^{}]+?)\s*\{[^}]*border(?:-top|-bottom)?:\s*[^;]*solid/gmu)].map(([, selector]) => selector), ['.title-rule'])
}
console.log('Companion analysis components: PASS')

// No dot separators anywhere the renderer writes its own text: answers align in
// columns, lists use 、, labels use ：. (A 间隔号 inside a translated foreign
// name such as 马克·吐温 comes from the analysis text and is correct.)
for (const file of readdirSync(new URL('../server/exports/companion-analysis/', import.meta.url))) {
  const source = readFileSync(new URL(`../server/exports/companion-analysis/${file}`, import.meta.url), 'utf8')
  assert.ok(!source.includes('·'), `${file} writes a · separator`)
}

// No passage is reprinted. Grammar fill prints, under each question, the one
// sentence with every blank filled: this question's answer carries [n] and
// bold, its clue (moved over from the original passage) is tinted, and the
// other blanks are filled in plain. A paragraph whose texts do not line up
// prints no sentence rather than a wrong one.
{
  const { renderGrammarFillGroup } = await import('../server/exports/companion-analysis/grammarFill.mjs')
  const original = 'I grew up in a city. Yet now I live in the countryside, __56__ tea grows, and __57__ (center) heating fails. It is cold.'
  const completed = 'I grew up in a city. Yet now I live in the countryside, where tea grows, and central heating fails. It is cold.'
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
  const group = { groupId: 'g', groupType: 'grammarFill', questionIds: ['q56', 'q57'], passage: { paragraphs: [{ paragraphId: 'p1', text: original }] } }
  const paper = {
    content: { questions: { q56: { questionNo: 56 }, q57: { questionNo: 57 } } },
    answerKey: { answers: { q56: { answer: 'where' }, q57: { answer: 'central' } } },
  }
  const render = (completedText) => renderGrammarFillGroup({
    group, title: '语法填空', paperAsset: paper, answers: [], openingHeadings: '',
    analysis: { groups: { g: { teachingContent: teaching(completedText) } }, blanks: {
      q56: { reason: 'R56', facetKey: 'grammar-fill.no-hint.conjunction.relative-clause' },
      q57: { reason: 'R57', facetKey: 'grammar-fill.given.conversion.noun-to-adjective' },
    } },
  })
  const html = render(completed)
  assert.doesNotMatch(html, /source-relationships|原题|答案补全|__56__/u, 'no passage is reprinted')
  const lines = [...html.matchAll(/<p class="question-stem question-stem--en" lang="en">([\s\S]*?)<\/p>/gu)].map((match) => match[1])
  assert.equal(lines.length, 2, 'one sentence line per question')
  const plain = (line) => line.replace(/<[^>]+>/gu, '')
  for (const line of lines) assert.equal(plain(line), 'Yet now I live in the countryside, where tea grows, and central heating fails.', 'the line is the answer\'s sentence, completed')
  const [line56, line57] = lines
  // The line sits under its own question block, so it prints no [56] and no
  // superscript (Owner 2026-11-23): the answer is bold, the clue tinted.
  for (const line of lines) assert.doesNotMatch(line, /blank-no|clue-no|\[5[67]\]/u, 'no question numbers in the sentence line')
  assert.match(line56, /<span class="source-relationship answer-fill"[^>]*>where<\/span>/u)
  assert.match(line56, /data-annotation-kinds="answer-evidence"[^>]*>the countryside/u)
  assert.doesNotMatch(line56, /\[57\]|data-annotation-ids="(?:i57|e57)"/u, 'the other blank is filled in plain')
  assert.match(line57, /answer-fill"[^>]*>central /u)
  // Paged.js drops whitespace-only text nodes: the space between the answer
  // and the clue after it ("central heating") must live inside a mark.
  assert.doesNotMatch(line57, /<\/span>[\t\n\r ]+<(?:span class="source-relationship|b class="blank-no)/u)
  assert.match(line57, /answer-fill"[^>]*>central <\/span><span class="source-relationship source-underline"/u)
  const line56At = html.indexOf('<p class="question-stem question-stem--en"')
  assert.ok(html.indexOf('R56') > line56At, 'the sentence comes before the explanation')
  // 考点 runs in after the heading, before the sentence line, spelled from
  // the facet fields; a facet the export does not know prints no line.
  const topic56 = '<p class="grammar-topic"><span class="inline-label">考点</span>定语从句</p>'
  assert.ok(html.includes(topic56) && html.indexOf(topic56) < line56At)
  assert.ok(html.includes('<span class="inline-label">考点</span>词形转换（名词变形容词）</p>'))
  const { grammarTopic } = await import('../server/exports/companion-analysis/grammarTopic.mjs')
  const finite = 'grammar-fill.given.verb.finite'
  assert.equal(grammarTopic({ facetKey: finite, tense: 'progressive', answer: 'was fixing' }), '谓语动词（过去进行时）')
  assert.equal(grammarTopic({ facetKey: finite, tense: 'other', voice: 'passive' }), '谓语动词（情态动词后，被动）')
  assert.equal(grammarTopic({ facetKey: finite, tense: 'other', voice: 'active' }), '谓语动词', 'an unsettled detail is left out')
  assert.equal(grammarTopic({ facetKey: 'grammar-fill.given.verb.non-finite', role: 'attributive', form: 'done', similarityForm: 'done' }), '非谓语动词（作定语，done）')
  assert.equal(grammarTopic({ facetKey: 'grammar-fill.given.pronoun', similarityProfile: { route: 'reflexive-pronoun' } }), '代词（有提示词，反身代词）')
  assert.equal(grammarTopic({ facetKey: 'grammar-fill.no-hint.article', answer: 'an' }), '冠词（不定冠词）')
  assert.equal(grammarTopic({ facetKey: 'grammar-fill.something-new' }), '')
  const nonFinite = { facetKey: 'grammar-fill.given.verb.non-finite', role: 'subject', form: 'to-be-done' }
  assert.equal(grammarTopic(nonFinite, 'It is also common for them '), '非谓语动词（作真正主语，to be done）')
  assert.equal(grammarTopic(nonFinite, 'These days, it is not unusual for children '), '非谓语动词（作真正主语，to be done）')
  assert.equal(grammarTopic({ ...nonFinite, form: 'to-do' }, 'It can be easy '), '非谓语动词（作真正主语，to do）')
  assert.equal(grammarTopic(nonFinite, ''), '非谓语动词（作主语，to be done）')
  assert.equal(grammarTopic({ ...nonFinite, role: 'object' }, 'It is clear that we hope '), '非谓语动词（作宾语，to be done）')
  assert.equal(grammarTopic({ facetKey: 'grammar-fill.given.conversion.noun-to-noun' }), '词形转换（名词加后缀）')
  const unaligned = render('I grew up in a city. Yet now I live in the countryside, where tea grows, and central heating often fails. It is cold.')
  assert.doesNotMatch(unaligned, /question-stem--en/u, 'texts that do not line up print no sentence')
  assert.match(unaligned, /R56/u)
  // Reading quotes its clues once, in each question's 原文依据, and prints no
  // passage of its own, even when the passage carries clue marks.
  const { renderReadingGroup } = await import('../server/exports/companion-analysis/reading.mjs')
  const readingHtml = renderReadingGroup({
    group: { groupId: 'g', groupType: 'reading', title: '阅读 A', questionIds: [], passage: group.passage },
    paperAsset: paper, analysis: { groups: { g: { teachingContent: teaching(completed) } } }, answers: [], openingHeadings: '',
  })
  assert.match(readingHtml, /analysis-group--reading/u)
  assert.doesNotMatch(readingHtml, /source-relationships|原文证据段落/u)
}
console.log('Companion analysis grammar-fill sentence lines, no reprinted passage and separators: PASS')

{
  // 定位: stem words found in the clue paragraph, and the paragraph counted the
  // way the exam paper counts it.
  const { stemLocators, passagePlace, renderReadingGroup } = await import('../server/exports/companion-analysis/reading.mjs')
  assert.deepEqual(stemLocators('Where can you find an original copy of the Magna Carta?',
    'It’s also home to an ancient library. One of the four original copies of the Magna Carta is displayed there.'),
  ['Magna Carta', 'original copy'])
  assert.deepEqual(stemLocators('Why does Dr. Doswell mention the tornadoes?', 'Dr. Doswell saw tornadoes in 1999.'), ['Dr. Doswell', 'tornadoes'])
  assert.deepEqual(stemLocators('Which is the best title for the text?', 'A title.'), [])
  const plain = { passage: { paragraphs: [
    { paragraphId: 'p1', text: 'First paragraph ends here.' },
    { paragraphId: 'p2', text: 'Second paragraph is cut at a page break and goes on' },
    { paragraphId: 'p3', text: 'in lower case after the break.' },
    { paragraphId: 'p4', text: 'Third paragraph.' },
  ] } }
  assert.equal(passagePlace(plain, 'p3'), '第 2 段', 'a page-break half counts as the paragraph it continues')
  assert.equal(passagePlace(plain, 'p4'), '第 3 段')
  const titled = { passage: { paragraphs: [{ paragraphId: 't', text: 'A Title Without a Full Stop' }, ...plain.passage.paragraphs] } }
  assert.equal(passagePlace(titled, 't'), '标题')
  assert.equal(passagePlace(titled, 'p4'), '第 3 段', 'the title is not a paragraph')
  const sectioned = { passage: { paragraphs: [
    { paragraphId: 't', text: 'Market Towns to Visit' },
    { paragraphId: 'i', text: 'An opening paragraph.' },
    { paragraphId: 'h1', text: 'Hereford, Herefordshire' },
    { paragraphId: 'b1', text: 'Hereford has a cathedral.' },
    { paragraphId: 'h2', text: 'Ludlow, Shropshire' },
    { paragraphId: 'b2', text: 'Ludlow has food.' },
  ] } }
  assert.equal(passagePlace(sectioned, 'b1'), 'Hereford, Herefordshire')
  assert.equal(passagePlace(sectioned, 'h2'), '小标题')
  assert.equal(passagePlace(sectioned, 'i'), '开头')
  const listed = { passage: { paragraphs: [
    { paragraphId: 't', text: 'Explorers Camp' },
    { paragraphId: 'a', text: '• Full day camp for kids aged 5 -- 13.' },
    { paragraphId: 'w1', text: 'Week 1 | July 8 -- 12' },
    { paragraphId: 'w2', text: 'Week 2 | July 15 -- 19' },
    { paragraphId: 'r', text: '• The last day to cancel is June 15.' },
  ] } }
  assert.equal(passagePlace(listed, 'r'), '第 4 段', 'short lines of one shape in a row are a list, not section heads')
  assert.equal(passagePlace(listed, 'w2'), '第 3 段')
  const fields = { passage: { paragraphs: [
    { paragraphId: 't', text: 'Weekend Walks' },
    { paragraphId: 'h1', text: 'Walk 1: The Natural World' },
    { paragraphId: 'a1', text: 'This walk takes you along the river.' },
    { paragraphId: 'd1', text: 'Walk Duration: 6 hours' },
    { paragraphId: 'h2', text: 'Walk 2: Hills' },
    { paragraphId: 'a2', text: 'This walk climbs the hill.' },
    { paragraphId: 'd2', text: 'Walk Duration: 5 hours' },
  ] } }
  assert.equal(passagePlace(fields, 'd2'), 'Walk 2: Hills 第 2 段', 'a Label: value line whose label repeats is an info line, not a head')
  const glued = { passage: { paragraphs: [
    { paragraphId: 't', text: 'Theatres' },
    { paragraphId: 'h1', text: 'St David’s Hall' },
    { paragraphId: 'b1', text: 'St David’s Hall is the National Concert Hall of Wales.' },
    { paragraphId: 'g1', text: 'The Hayes, Cardiff CF10 1AHwww. stdavidshallcardiff. co. ukThe Glee Club' },
    { paragraphId: 'b2', text: 'Every weekend this is a comedy club.' },
    { paragraphId: 'c', text: '©2026 The Glee Club' },
    { paragraphId: 'b3', text: 'Tickets sell fast at weekends, so book early.' },
    { paragraphId: 'e', text: 'Mermaid Quay, Cardiff CF10 5BZ' },
  ] } }
  assert.equal(passagePlace(glued, 'b2'), 'The Glee Club 第 1 段', 'a line with the next head glued on names that head by the glued part')
  assert.equal(passagePlace(glued, 'g1'), 'St David’s Hall 第 2 段', 'the address before the glued head stays in the section above')
  assert.equal(passagePlace(glued, 'b3'), 'The Glee Club 第 3 段', 'a source credit is not a head')
  assert.equal(passagePlace(glued, 'e'), 'The Glee Club 第 4 段', 'a short last line heads nothing')
  assert.equal(passagePlace(fields, 'h1'), '小标题')
  const { passageHtml } = await import('../server/exports/companion-analysis/text.mjs')
  assert.equal(passageHtml('Raeburn\u2028Thursday 30 Oct. <b>'), 'Raeburn<br>Thursday 30 Oct. &lt;b&gt;', 'a line separator in passage words prints as a line break')

  const optionsGroup = { groupId: 'g', groupType: 'reading', title: 'reading.a', questionIds: ['q1'], passage: plain.passage }
  const optionsHtml = renderReadingGroup({ group: optionsGroup, answers: [], openingHeadings: '',
    paperAsset: { content: { questions: { q1: { questionId: 'q1', questionNo: 21, groupId: 'g', stem: 'Which is true?', options: [] } } }, answerKey: { answers: { q1: { answer: 'B' } } } },
    analysis: { groups: {}, questions: { q1: { locateBy: 'options', stemTranslationZh: '哪项正确？', similarityProfile: { family: 'detail' }, locationParaphrases: [],
      optionAnalysis: [{ label: 'B', status: 'correct', evidence: [{ paragraphId: 'p4', quote: 'Third paragraph.' }, { paragraphId: 'p1', quote: 'First paragraph ends here.' }] }] } } } })
  if (optionsHtml.includes('question-number')) {
    assert.match(optionsHtml, /按选项回原文<span class="locate-where">正确项出自第 1 段、第 3 段<\/span>/u, 'the options line names where the correct option comes from')
  }

  const skeleton = (locateBy, family, locateFindZh) => renderReadingGroup({ group: optionsGroup, answers: [], openingHeadings: '',
    paperAsset: { content: { questions: { q1: { questionId: 'q1', questionNo: 21, groupId: 'g', stem: 'Which is true?', options: [] } } }, answerKey: { answers: { q1: { answer: 'B' } } } },
    analysis: { groups: {}, questions: { q1: { locateBy, locateFindZh, stemTranslationZh: '哪项正确？', similarityProfile: { family }, locationParaphrases: [],
      optionAnalysis: [{ label: 'B', status: 'correct', evidence: [{ paragraphId: 'p4', quote: 'Third paragraph.' }] }] } } } })
  const checked = skeleton('options', 'detail', '各带地名回原文，[[p4]]写着 free')
  if (checked.includes('question-number')) {
    assert.match(checked, /定位<\/span>核对选项<span class="locate-find">各带地名回原文，第 3 段写着 free<\/span><\/p>/u,
      'with a short line the 定位 line is the skeleton and that line, the paragraph printed the page’s way')
    assert.match(skeleton('passage', 'main-idea', '盯住反复出现的 trust'), /定位<\/span>看全文<span class="locate-find">盯住反复出现的 trust<\/span>/u)
    const same = renderReadingGroup({ group: optionsGroup, answers: [], openingHeadings: '',
      paperAsset: { content: { questions: { q1: { questionId: 'q1', questionNo: 21, groupId: 'g', stem: 'What happens here?', options: [] } } }, answerKey: { answers: { q1: { answer: 'B' } } } },
      analysis: { groups: {}, questions: { q1: { locateBy: 'stem', locateFindZh: '', stemTranslationZh: '这里发生了什么？', similarityProfile: { family: 'detail' },
        locationParaphrases: [{ sourceText: 'here', sourceRole: 'stem', targetText: 'First paragraph ends here.', targetParagraphId: 'p1', relationType: 'locationCue', answerText: 'First paragraph ends' }],
        optionAnalysis: [{ label: 'B', status: 'correct', evidence: [{ paragraphId: 'p1', quote: 'First paragraph ends here.' }] }] } } } })
    assert.match(same, /定位<\/span><b lang="en">here<\/b> →<span class="locate-note">第 1 段<\/span><\/p>/u,
      'when the passage repeats the stem word the skeleton prints it once and the arrow leads to the paragraph; an empty line under it prints nothing, not 原词')
  }

  const group = { groupId: 'g', groupType: 'reading', title: 'reading.a', questionIds: ['q1'], passage: plain.passage }
  const paper = { content: { questions: { q1: { questionId: 'q1', questionNo: 21, groupId: 'g', stem: 'What does the third paragraph say?', options: [] } } },
    answerKey: { answers: { q1: { answer: 'B' } } } }
  const html = renderReadingGroup({ group, paperAsset: paper, answers: [], openingHeadings: '', analysis: { groups: {}, questions: { q1: {
    stemTranslationZh: '第三段说了什么？', similarityProfile: { family: 'detail' },
    optionAnalysis: [{ label: 'B', status: 'correct', evidence: [{ paragraphId: 'p4', quote: 'Third paragraph.' }] }],
    locationParaphrases: [{ sourceText: 'The third one.', sourceRole: 'correctOption', targetText: 'Third paragraph.', relationType: 'paraphrase', note: 'NOTE_SENTINEL' }],
  } } } })
  if (html.includes('question-number')) {
    assert.match(html, /<p class="evidence-locate"><span class="inline-label">定位<\/span><b lang="en">third<\/b> → 第 3 段<\/p>/u)
    assert.match(html, /<p class="evidence-paraphrase"><span class="inline-label">同义替换<\/span><b>B 项<\/b> <span lang="en">The third one\.<\/span><\/p>/u)
    assert.ok(html.indexOf('evidence-locate') < html.indexOf('evidence-quote')
      && html.indexOf('evidence-quote') < html.indexOf('evidence-paraphrase')
      && html.indexOf('evidence-paraphrase') < html.indexOf('NOTE_SENTINEL'), '定位 → 原文依据 → 同义替换 → 分析')
  } else assert.fail(`reading fixture did not render a question: ${html.slice(0, 200)}`)

  // 2026-11-23, learnt from the 答案详解 book on our own lines: the 定位 note
  // carries the 定位句's place in its paragraph, the correct option prints
  // its translation like a wrong one, and options ruled out by one sentence
  // share one line.
  const three = { groupId: 'g', groupType: 'reading', title: 'reading.a', questionIds: ['q1'], passage: { paragraphs: [
    { paragraphId: 'p1', text: 'Ann runs a farm. Her cows give milk. She sells cheese.' }] } }
  const learnt = renderReadingGroup({ group: three, answers: [], openingHeadings: '',
    paperAsset: { content: { questions: { q1: { questionId: 'q1', questionNo: 21, groupId: 'g', stem: 'What do the cows give?', options: [] } } }, answerKey: { answers: { q1: { answer: 'B' } } } },
    analysis: { groups: {}, questions: { q1: { locateBy: 'stem', locateFindZh: '', stemTranslationZh: '牛产什么？', similarityProfile: { family: 'detail' },
      locationParaphrases: [
        { sourceText: 'cows', sourceRole: 'stem', targetText: 'Her cows give milk.', targetParagraphId: 'p1', relationType: 'locationCue', answerText: 'milk' },
        { sourceText: 'Milk.', sourceRole: 'correctOption', targetText: 'milk', relationType: 'paraphrase', note: '讲解' }],
      optionAnalysis: [
        { label: 'A', status: 'wrong', optionTranslationZh: '肉。', trap: { explanation: '原文只说产奶和奶酪。' } },
        { label: 'B', status: 'correct', optionTranslationZh: '牛奶。', evidence: [{ paragraphId: 'p1', quote: 'Her cows give milk.' }] },
        { label: 'C', status: 'wrong', optionTranslationZh: '羊毛。', trap: { explanation: '原文只说产奶和奶酪。' } },
        { label: 'D', status: 'wrong', optionTranslationZh: '蛋。', trap: { explanation: '另一个理由。' } }] } } } })
  if (learnt.includes('question-number')) {
    assert.match(learnt, /<span class="locate-note">第 1 段第 2 句<\/span>/u, 'the 定位 note names the 定位句: 首句, 末句 or 第 M 句')
    assert.match(learnt, /同义替换<\/span><b>B 项<\/b>（牛奶）<span lang="en">Milk\.<\/span>/u, 'the correct option prints its translation once, as a wrong one does')
    assert.match(learnt, /<b>A、C 项<\/b>（肉；羊毛）错在：原文只说产奶和奶酪。/u, 'two options with one sentence share one line')
    assert.equal((learnt.match(/class="reading-distractor-item"/gu) || []).length, 2)
  } else assert.fail('the 定位 + 同义替换 fixture did not render a question')

  const { renderAnswerRuns } = await import('../server/exports/companion-analysis/blocks.mjs')
  const runs = renderAnswerRuns(Array.from({ length: 12 }, (_, index) => ({ questionId: `q${index}`, number: index + 1, value: 'A' })))
  assert.equal((runs.match(/<div class="answer-run">/gu) || []).length, 3, 'answers come five to a block')
  const { companionAnalysisStyles } = await import('../server/exports/companion-analysis/styles.mjs')
  const numberRule = companionAnalysisStyles({ houseMark: '', paginated: true }).match(/\.question-number \{[^}]*\}/u)?.[0] || ''
  assert.match(numberRule, /text-align-last: center;/u, 'the body’s text-align-last: start would pin the figures to the block’s left edge')
}
console.log('Companion analysis 定位, paragraph count and answer table: PASS')
