#!/usr/bin/env node

import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  buildCompanionAnalysisHtml,
  companionAnalysisFileName,
  loadCompanionAnalysisSource,
} from '../server/exports/companionAnalysisRenderer.mjs'
import { createExportImplementation } from '../server/exports/exportImplementation.mjs'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const paperAssetsDir = path.join(rootDir, 'app', 'public', 'paper-assets')
const source = loadCompanionAnalysisSource({
  paperAssetsDir,
  paperId: 'paper-2025-i',
})
const html = buildCompanionAnalysisHtml(source)
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
assert.ok(html.includes('margin-bottom: 0.8mm;\n  break-after: avoid;'))
assert.ok(html.includes('参考范文'))
assert.ok(html.includes('精选表达'))
assert.ok(html.includes('续写路线'))
assert.equal((translatedHtml.match(/class="full-translation"/gu) || []).length, 7)
assert.equal((translatedHtml.match(/class="translation-marker"/gu) || []).length, 30)
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
assert.ok(html.includes('margin: 17mm 17mm 19mm 21mm'))
assert.ok(html.includes('@page:left'))
assert.ok(html.includes('font-size: 9pt'))
assert.ok(html.includes('class="analysis-body"'))
assert.ok(html.includes('column-count: 2'))
assert.ok(html.includes('column-gap: 8mm'))
assert.ok(html.includes('column-rule: 0.35pt solid var(--line)'))
assert.ok(html.includes('--green: #596a58'))
assert.ok(html.includes('--green-deep: #3b4e3d'))
assert.ok(!html.includes('--green-pale'))
assert.ok(html.includes('orphans: 3'))
assert.ok(html.includes('widows: 3'))

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
