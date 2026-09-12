import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createServer } from '../app/node_modules/vite/dist/node/index.js'
import {
  assertAnalysisTextRanges,
  legacyUnderlineRanges,
  partitionAnalysisText,
} from '../shared/analysis/analysisTextRanges.mjs'
import {
  answerCompletedSentence,
  assertObjectiveTeachingAnnotations,
  assertSelectedLongSentences,
} from '../server/paper-import-ai/analyzerProviderShell.mjs'
import { buildCompanionAnalysisHtml } from '../server/exports/companionAnalysisRenderer.mjs'
import {
  buildObjectiveTeachingView,
  projectObjectiveTeachingSource,
} from '../app/src/features/paper-intelligence/objectiveTeachingContentAdapter.ts'

const text = '😀 Go, go home.\r\nGo!'
const ranges = [
  { start: 6, end: 8, quote: 'go' },
  { start: 6, end: 13, quote: 'go home' },
  { start: 9, end: 13, quote: 'home' },
  { start: 6, end: 8, quote: 'go' },
  { start: 14, end: 16, quote: '\r\n' },
]
assert.doesNotThrow(() => assertAnalysisTextRanges(text, ranges))
const fragments = partitionAnalysisText(text, ranges)
assert.equal(fragments.map(({ text: value }) => value).join(''), text)
assert.deepEqual(fragments.find(({ text: value }) => value === 'go').rangeIndices, [0, 1, 3])
assert.deepEqual(fragments.find(({ text: value }) => value === 'home').rangeIndices, [1, 2])
assert.deepEqual(fragments[0], { text: '😀 Go, ', start: 0, end: 6, rangeIndices: [] })
assert.deepEqual(legacyUnderlineRanges(text, ['go home']), [ranges[1]])
assert.throws(() => legacyUnderlineRanges(text, ['Go']), /exactly once/)

for (const range of [
  { start: 7, end: 9, quote: 'go' }, // UTF-16 instead of code points
  { start: 6, end: 8, quote: 'GO' }, // normalization is not allowed
  { start: 6, end: 6, quote: '' },
  { start: -1, end: 1, quote: '😀' },
  { start: 0.5, end: 1, quote: '😀' },
  { start: 0, end: 100, quote: text },
  { start: 14, end: 15, quote: '\n' }, // CRLF is two code points
  { start: 6, end: 8, quote: 'go', guessed: true },
]) assert.throws(() => assertAnalysisTextRanges(text, [range]))
assert.throws(() => assertAnalysisTextRanges(text, []))
assert.doesNotThrow(() => assertAnalysisTextRanges(' e\u0301 ', [
  { start: 1, end: 3, quote: 'e\u0301' },
]))
assert.throws(() => assertAnalysisTextRanges(' e\u0301 ', [
  { start: 1, end: 3, quote: 'é' },
]))

const sourceText = '😀 Go, go home. Go!'
const sentence = {
  sentenceId: 'sentence-1', paragraphId: 'p1', sourceText, displayText: sourceText,
  relatedQuestionIds: ['q1'], translationZh: '回家吧。',
  analysisZh: '这里仅用自有短句检验重复与重叠标注，不充当真实长难句范例。',
  underlineRanges: ranges.slice(0, 4),
}
const group = {
  paragraphs: [{ id: 'p1', text: sourceText }],
  questions: [{ id: 'q1', stem: '21', answerKey: 'A' }],
}
assert.doesNotThrow(() => assertSelectedLongSentences({ selectedLongSentences: [sentence] }, group))
assert.throws(() => assertSelectedLongSentences({ selectedLongSentences: [{
  ...sentence, underlineTexts: ['go home'],
}] }, group), /不能混用/)
assert.throws(() => assertSelectedLongSentences({ selectedLongSentences: [{
  ...sentence, underlineRanges: [{ start: 7, end: 9, quote: 'go' }],
}] }, group), /quote/)

const preciseGroup = {
  paragraphs: [{ id: 'p1', text: '😀 alpha\r\nsame same.' }],
  questions: [
    { id: 'q1', stem: '21', answerKey: 'A' },
    { id: 'q2', stem: '22', answerKey: 'B' },
  ],
}
const preciseAnalysis = {
  fullTranslationZh: '译😀文\r\n重复 重复。',
  selectedLongSentences: [{
    sentenceId: 'sentence-shared',
    paragraphId: 'p1',
    sourceText: 'same same.',
    displayText: 'same same.',
    relatedQuestionIds: ['q1', 'q2'],
    translationZh: '重复。',
    analysisZh: '检验明确选择第二次出现及共享、重叠关系。',
    underlineRanges: [{ start: 5, end: 9, quote: 'same' }],
  }],
  teachingContent: {
    schemaVersion: 'objective-teaching-content-v1',
    sourceTextId: 'source-g1',
    sourceAssetVersion: 7,
    translation: {
      textId: 'translation-g1',
      legacyField: 'fullTranslationZh',
      paragraphs: [
        { paragraphId: 'zh-p1', sourceParagraphIds: ['p1'], start: 0, end: 3, quote: '译😀文' },
        { paragraphId: 'zh-p2', sourceParagraphIds: ['p1'], start: 5, end: 11, quote: '重复 重复。' },
      ],
    },
    completedSourceTexts: [],
    annotations: [
      {
        annotationId: 'shared-second-occurrence',
        kind: 'answer-evidence',
        questionIds: ['q1', 'q2'],
        sourceRanges: [{ textId: 'source-g1', paragraphId: 'p1', start: 14, end: 18, quote: 'same' }],
        translationRanges: [{ textId: 'translation-g1', paragraphId: 'zh-p2', start: 3, end: 5, quote: '重复' }],
      },
      {
        annotationId: 'sentence-structure',
        kind: 'sentence-structure',
        questionIds: ['q1', 'q2'],
        selectedSentenceId: 'sentence-shared',
        sourceRanges: [{ textId: 'source-g1', paragraphId: 'p1', start: 9, end: 18, quote: 'same same' }],
        translationRanges: [{ textId: 'translation-g1', paragraphId: 'zh-p2', start: 0, end: 5, quote: '重复 重复' }],
      },
    ],
  },
}
assert.doesNotThrow(() => assertObjectiveTeachingAnnotations(preciseAnalysis, preciseGroup, {
  sourceAssetVersion: 7,
}))
assert.throws(() => assertObjectiveTeachingAnnotations(preciseAnalysis, preciseGroup, {
  sourceAssetVersion: 8,
}), /stale source revision/)
const staleTranslation = structuredClone(preciseAnalysis)
staleTranslation.fullTranslationZh = '改😀文\r\n重复 重复。'
assert.throws(() => assertObjectiveTeachingAnnotations(staleTranslation, preciseGroup, {
  sourceAssetVersion: 7,
}), /quote/)

const blankGroup = {
  paragraphs: [{ id: 'p-blank', text: 'They __36__ home.' }],
  questions: [{
    id: 'q36', stem: '36', blankId: 'blank-36', answerKey: 'A',
    options: { A: 'go', B: 'stay' },
  }],
}
assert.equal(answerCompletedSentence(blankGroup.paragraphs[0].text, blankGroup), 'They go home.')
const blankAnalysis = {
  fullTranslationZh: '他们回家。',
  selectedLongSentences: [{
    sentenceId: 'sentence-blank', paragraphId: 'p-blank',
    sourceText: 'They __36__ home.', displayText: 'They go home.',
    relatedQuestionIds: ['q36'], translationZh: '他们回家。', analysisZh: '主干为 They go home。',
    underlineRanges: [{ start: 5, end: 7, quote: 'go' }],
  }],
  teachingContent: {
    schemaVersion: 'objective-teaching-content-v1', sourceTextId: 'source-blank', sourceAssetVersion: 2,
    translation: { textId: 'translation-blank', legacyField: 'fullTranslationZh', paragraphs: [
      { paragraphId: 'zh-blank', sourceParagraphIds: ['p-blank'], start: 0, end: 5, quote: '他们回家。' },
    ] },
    completedSourceTexts: [{ textId: 'completed-p-blank', paragraphId: 'p-blank', text: 'They go home.' }],
    annotations: [
      { annotationId: 'e36', kind: 'answer-evidence', questionIds: ['q36'],
        sourceRanges: [{ textId: 'source-blank', paragraphId: 'p-blank', start: 5, end: 11, quote: '__36__' }],
        translationRanges: [{ textId: 'translation-blank', paragraphId: 'zh-blank', start: 0, end: 5, quote: '他们回家。' }] },
      { annotationId: 'i36', kind: 'answer-insertion', questionIds: ['q36'], blankId: 'blank-36',
        sourceRanges: [{ textId: 'completed-p-blank', paragraphId: 'p-blank', start: 5, end: 7, quote: 'go' }],
        translationRanges: [{ textId: 'translation-blank', paragraphId: 'zh-blank', start: 2, end: 4, quote: '回家' }] },
      { annotationId: 's36', kind: 'sentence-structure', questionIds: ['q36'], selectedSentenceId: 'sentence-blank',
        sourceRanges: [{ textId: 'completed-p-blank', paragraphId: 'p-blank', start: 0, end: 12, quote: 'They go home' }],
        translationRanges: [{ textId: 'translation-blank', paragraphId: 'zh-blank', start: 0, end: 5, quote: '他们回家。' }] },
    ],
  },
}
assert.doesNotThrow(() => assertObjectiveTeachingAnnotations(blankAnalysis, blankGroup, {
  sourceAssetVersion: 2,
  requireAnswerInsertions: true,
}))
const guessedCompletion = structuredClone(blankAnalysis)
guessedCompletion.teachingContent.completedSourceTexts[0].text = 'They stay home.'
assert.throws(() => assertObjectiveTeachingAnnotations(guessedCompletion, blankGroup, {
  sourceAssetVersion: 2,
  requireAnswerInsertions: true,
}), /authoritative answer-completed/)

const alias = structuredClone(preciseAnalysis)
alias.teachingContent.translation.textId = alias.teachingContent.sourceTextId
assert.throws(() => assertObjectiveTeachingAnnotations(alias, preciseGroup, { sourceAssetVersion: 7 }), /identities must be distinct/)
const completedAlias = structuredClone(blankAnalysis)
completedAlias.teachingContent.completedSourceTexts[0].textId = 'source-blank'
assert.throws(() => assertObjectiveTeachingAnnotations(completedAlias, blankGroup, { sourceAssetVersion: 2 }), /identities must be distinct/)
const supplementarySentence = structuredClone(preciseAnalysis)
supplementarySentence.selectedLongSentences[0].relatedQuestionIds = []
supplementarySentence.teachingContent.annotations[1].questionIds = []
assert.doesNotThrow(() => assertSelectedLongSentences(supplementarySentence, preciseGroup))
assert.doesNotThrow(() => assertObjectiveTeachingAnnotations(supplementarySentence, preciseGroup, { sourceAssetVersion: 7 }))
const falseSentenceLocation = structuredClone(preciseAnalysis)
falseSentenceLocation.teachingContent.annotations[1].sourceRanges[0] = {
  textId: 'source-g1', paragraphId: 'p1', start: 2, end: 7, quote: 'alpha',
}
assert.throws(() => assertObjectiveTeachingAnnotations(falseSentenceLocation, preciseGroup, { sourceAssetVersion: 7 }), /outside the selected/)
const repeatedAnswerGroup = structuredClone(blankGroup)
repeatedAnswerGroup.paragraphs[0].text = 'go They __36__ home.'
const repeatedAnswer = structuredClone(blankAnalysis)
Object.assign(repeatedAnswer.selectedLongSentences[0], {
  sourceText: 'go They __36__ home.', displayText: 'go They go home.',
  underlineRanges: [{ start: 8, end: 10, quote: 'go' }],
})
repeatedAnswer.teachingContent.completedSourceTexts[0].text = 'go They go home.'
Object.assign(repeatedAnswer.teachingContent.annotations[0].sourceRanges[0], { start: 8, end: 14 })
Object.assign(repeatedAnswer.teachingContent.annotations[1].sourceRanges[0], { start: 8, end: 10 })
Object.assign(repeatedAnswer.teachingContent.annotations[2].sourceRanges[0], { start: 0, end: 15, quote: 'go They go home' })
assert.doesNotThrow(() => assertObjectiveTeachingAnnotations(repeatedAnswer, repeatedAnswerGroup, { sourceAssetVersion: 2, requireAnswerInsertions: true }))
Object.assign(repeatedAnswer.teachingContent.annotations[1].sourceRanges[0], { start: 0, end: 2 })
assert.throws(() => assertObjectiveTeachingAnnotations(repeatedAnswer, repeatedAnswerGroup, { sourceAssetVersion: 2, requireAnswerInsertions: true }), /exactly locate the authoritative inserted answer/)
const multipleInsertions = []
assert.equal(answerCompletedSentence('😀 go __36__ then __37__.', { questions: [
  { id: 'q36', stem: '36', blankId: 'b36', answerKey: 'go' },
  { id: 'q37', stem: '37', blankId: 'b37', answerKey: 'go' },
] }, { onInsertion: (range) => multipleInsertions.push(range) }), '😀 go go then go.')
assert.deepEqual(multipleInsertions, [
  { questionId: 'q36', blankId: 'b36', start: 5, end: 7, quote: 'go' },
  { questionId: 'q37', blankId: 'b37', start: 13, end: 15, quote: 'go' },
])
const teachingView = buildObjectiveTeachingView(preciseAnalysis, { q1: '21', q2: '22' })
assert.deepEqual(teachingView.translationParagraphs[1].segments.at(-2).questionNos, ['21', '22'])
assert.equal(teachingView.translationParagraphs[1].segments.map((part) => part.text).join(''), '重复 重复。')

const html = buildCompanionAnalysisHtml({
  paperAsset: {
    paper: { paperId: 'paper-range-fixture', title: '精确标注验证' },
    content: {
      groups: { g1: {
        groupId: 'g1', groupType: 'reading', questionIds: ['q1', 'q2'],
        passage: { paragraphs: [{ paragraphId: 'p1', text: preciseGroup.paragraphs[0].text }] },
      } },
      questions: { q1: { questionNo: 21 }, q2: { questionNo: 22 } },
    },
    answerKey: { answers: {} },
  },
  analyses: { reading: { groups: { g1: preciseAnalysis }, questions: {} } },
})
assert.match(html, /same <span class="source-underline" data-range-indices="0">same<\/span>\.<\/p>/)
assert.match(html, /data-translation-paragraph-id="zh-p2"/)
assert.match(html, /data-question-nos="21 22"/)
assert.match(html, /\[21、22\]/)
assert.match(html, /data-source-text-state="original"/)
assert.match(html, /data-annotation-ids="[^"]*shared-second-occurrence/)
assert.match(html, /data-question-nos="21 22"/)

const preciseTextMap = {
  paperId: 'paper-range-fixture',
  paragraphs: [{
    id: 'p1',
    section: 'A',
    sentences: [{ id: 'p1-s0', text: preciseGroup.paragraphs[0].text, tokens: [] }],
  }],
}
const sourceProjection = projectObjectiveTeachingSource(
  preciseAnalysis,
  preciseGroup.paragraphs,
  preciseTextMap,
)
assert.equal(sourceProjection.evidence.length, 4, 'overlapping two-question relationships retain every identity')
assert.deepEqual(sourceProjection.evidence[0].range, {
  sentenceId: 'p1-s0', start: 15, end: 19,
}, 'code-point source offset projects to UTF-16 DOM offset for the intended second occurrence')
assert.equal(new Set(sourceProjection.annotations.map(({ id }) => id)).size, 4)

const vite = await createServer({
  root: new URL('../app', import.meta.url).pathname,
  logLevel: 'error',
  server: { middlewareMode: true },
  appType: 'custom',
})
try {
  const { PaperSurface } = await vite.ssrLoadModule('/src/shared-ui/papersurface/PaperSurface.tsx')
  const requireFromApp = createRequire(new URL('../app/package.json', import.meta.url))
  const { createElement } = requireFromApp('react')
  const { renderToStaticMarkup } = requireFromApp('react-dom/server')
  const markup = renderToStaticMarkup(createElement(PaperSurface, {
    textMap: preciseTextMap,
    annotations: sourceProjection.annotations,
    evidence: sourceProjection.evidence,
    questions: [{ id: 'q1', section: 'A', order: 0, questionNo: '21', stem: 'synthetic', options: [] }],
    mode: 'lecture',
    lectureFocus: { kind: 'question', questionId: 'q1', activeEvidenceId: sourceProjection.evidence[0].id },
    readingFocusBySection: {},
    onFocusIntent() {},
  }))
  assert.match(markup, /same <mark[^>]+>same<\/mark>\./, 'actual PaperSurface marks only the supplied second occurrence')
  assert.equal((markup.match(/data-paper-annotation-id=/g) ?? []).length, 4)
  assert.match(markup, /😀 alpha/)
  const playwright = await import('../app/node_modules/playwright/index.js')
  const browser = await playwright.default.chromium.launch({ headless: true, channel: 'chromium' })
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 520 }, deviceScaleFactor: 2 })
    await page.setContent(`<style>body{padding:48px;font:20px/1.8 Georgia,serif}.ps-evidence-anchor--active{background:#ffe08a!important;box-shadow:0 0 0 2px #5b4820;padding:2px}</style>${markup}`)
    const selected = page.locator(`mark[data-paper-evidence-id="${sourceProjection.evidence[0].id}"]`)
    await selected.waitFor()
    assert.equal(await selected.textContent(), 'same')
    mkdirSync(new URL('../.amp/in/artifacts', import.meta.url), { recursive: true })
    await selected.locator('xpath=..').screenshot({ path: new URL('../.amp/in/artifacts/paper-source-second-occurrence.png', import.meta.url).pathname })
  } finally {
    await browser.close()
  }
} finally {
  await vite.close()
}
const legacyMarkerHtml = buildCompanionAnalysisHtml({
  paperAsset: {
    paper: { paperId: 'paper-legacy-marker', title: '旧译文读取' },
    content: { groups: { g1: { groupId: 'g1', groupType: 'reading', questionIds: [] } }, questions: {} },
    answerKey: { answers: {} },
  },
  analyses: { reading: { groups: { g1: { fullTranslationZh: '手写 [36] 不是标注。' } }, questions: {} } },
})
assert.match(legacyMarkerHtml, /手写 \[36\] 不是标注。/)
assert.doesNotMatch(legacyMarkerHtml, /class="translation-marker"/)
console.log('Analysis text ranges: Unicode, CRLF, second occurrence, overlap/many-to-many, stale revision/translation, authoritative insertion, legacy readback and both consumers PASS')
