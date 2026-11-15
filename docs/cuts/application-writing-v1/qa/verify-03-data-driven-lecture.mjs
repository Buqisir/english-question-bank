#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
let passed = 0
let failed = 0

function check(name, fn) {
  try {
    fn()
    passed += 1
    console.log(`PASS ${name}`)
  } catch (error) {
    failed += 1
    console.error(`FAIL ${name}`)
    console.error(error.stack)
  }
}

const reviewCard = {
  form: '倡议书',
  topic: '校园低碳生活',
  reader: '全校同学',
  person: '第一人称复数',
  tense: '一般现在时',
  type: '倡议类',
  points: ['说明低碳生活的意义', '提出两条可实行的建议'],
  readerWho: '同学和倡议的参与者',
  readerCares: '建议是否具体可行',
  readerWants: '知道从哪里开始行动',
  value: '让校园行动有明确而可复制的起点',
}

const modelAnswer = `Dear fellow students,

Small changes can make our campus greener. We can turn off lights and bring reusable bottles every day.

The Student Council`
const officialModelAnswer = `Dear fellow students,

We can save energy by walking short distances and sorting rubbish carefully.

The Student Council`
const completeApplication = {
  taskType: 'application',
  modelAnswer,
  officialModelAnswer,
  reviewCard,
  highlightExpressions: [{ text: 'HIDDEN-HIGHLIGHT-EXPRESSION', note: 'must not render here' }],
}

const { createServer } = await import(
  pathToFileURL(path.join(repoRoot, 'app/node_modules/vite/dist/node/index.js')).href,
)
const { createElement } = await import(
  pathToFileURL(path.join(repoRoot, 'app/node_modules/react/index.js')).href,
)
const { renderToStaticMarkup } = await import(
  pathToFileURL(path.join(repoRoot, 'app/node_modules/react-dom/server.js')).href,
)

const vite = await createServer({
  root: path.join(repoRoot, 'app'),
  appType: 'custom',
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const retained = await vite.ssrLoadModule('/src/features/paper-browse/RetainedWritingLecture.tsx')
  const writingPaperPage = await vite.ssrLoadModule('/src/features/paper-intelligence/WritingPaperPage.tsx')

  check('a complete non-whitelist application payload opens the lecture', () => {
    assert.equal(retained.getRetainedWritingLecture({
      lectureOpen: true,
      panelGroupId: 'group-fixture-application',
      groupId: 'group-fixture-application',
      sourceTaskType: 'application',
      analysis: completeApplication,
    }), completeApplication)
  })

  check('a complete application payload is the answer-box lecture trigger, not a groupId whitelist', () => {
    assert.equal(retained.hasCompleteApplicationLecturePayload({
      sourceTaskType: 'application',
      analysis: completeApplication,
    }), true)
    assert.equal(retained.hasCompleteApplicationLecturePayload({
      sourceTaskType: 'application',
      analysis: { ...completeApplication, modelAnswer: '' },
    }), false)
  })

  check('the retained 2022-i group keeps the same complete-payload availability', () => {
    assert.equal(retained.getRetainedWritingLecture({
      lectureOpen: true,
      panelGroupId: 'group-2022-i-writing-application',
      groupId: 'group-2022-i-writing-application',
      sourceTaskType: 'application',
      analysis: completeApplication,
    }), completeApplication)
  })

  for (const [name, overrides] of [
    ['closed lecture', { lectureOpen: false }],
    ['panel ownership moved', { panelGroupId: 'group-other' }],
    ['missing model answer', { analysis: { ...completeApplication, modelAnswer: '' } }],
    ['malformed review card', { analysis: { ...completeApplication, reviewCard: { ...reviewCard, value: '' } } }],
    ['source task type mismatch', { sourceTaskType: 'continuation' }],
    ['analysis task type mismatch', {
      analysis: {
        taskType: 'continuation',
        modelAnswer,
        continuationDesign: { theme: 'kindness', paragraphs: ['one', 'two'] },
        highlightExpressions: [],
      },
    }],
  ]) {
    check(`${name} fails closed to the ordinary writing surface`, () => {
      assert.equal(retained.getRetainedWritingLecture({
        lectureOpen: true,
        panelGroupId: 'group-fixture-application',
        groupId: 'group-fixture-application',
        sourceTaskType: 'application',
        analysis: completeApplication,
        ...overrides,
      }), null)
    })
  }

  check('review-card-only application opens without a model answer', () => {
    const { modelAnswer: omitted, ...analysis } = completeApplication
    assert.equal(retained.getRetainedWritingLecture({
      lectureOpen: true, panelGroupId: 'group-fixture-application',
      groupId: 'group-fixture-application', sourceTaskType: 'application', analysis,
    }), analysis)
    const html = renderToStaticMarkup(createElement(retained.RetainedModelAnswer, {}))
    assert.doesNotMatch(html, /AI 参考范文|data-model-answer-source/)
  })

  const pageProps = {
    pageModel: { blocks: [{
      kind: 'answerBox', label: '应用文答题区',
      givenTop: ['Dear fellow students,'], givenBottom: ['The Student Council'],
    }] },
    children: null,
  }
  check('official-only retained answer stays visible without an AI answer', () => {
    const html = renderToStaticMarkup(createElement(writingPaperPage.WritingPaperPage, {
      ...pageProps, retainedOfficialModelAnswer: officialModelAnswer,
    }))
    assert.match(html, /pi-writing-answer-box--lecture-open/)
    assert.match(html, /data-writing-answer-supplement[\s\S]*官方范文/)
    assert.match(html, /sorting rubbish carefully/)
    assert.doesNotMatch(html, /AI 参考范文|data-model-answer-source="ai"/)
  })
  check('source references retain official and unofficial provenance labels without AI essays', () => {
    const html = renderToStaticMarkup(createElement(writingPaperPage.WritingPaperPage, {
      ...pageProps,
      unofficialReferenceEssays: [
        { referenceId: 'source', authority: 'source_reference',
          paragraphs: [{ paragraphId: 'source-p1', role: 'body', text: 'SOURCE-ESSAY' }] },
        { referenceId: 'supplement', provenance: 'unofficial',
          paragraphs: [{ paragraphId: 'supplement-p1', role: 'body', text: 'UNOFFICIAL-ESSAY' }] },
      ],
    }))
    assert.match(html, /data-model-answer-source="official"[\s\S]*官方参考范文[\s\S]*SOURCE-ESSAY/)
    assert.match(html, /data-model-answer-source="unofficial"[\s\S]*非官方参考范文[\s\S]*UNOFFICIAL-ESSAY/)
    assert.doesNotMatch(html, /AI 参考范文|data-model-answer-source="ai"/)
  })

  const continuation = await vite.ssrLoadModule('/src/features/paper-browse/ContinuationAnalysisPanel.tsx')
  const continuationDomain = await vite.ssrLoadModule('/src/domain/continuationAnalysis.ts')
  const grounded = { statement: 'Source-grounded lecture', evidence: [] }
  const continuationAnalysis = {
    schemaVersion: 'continuation-analysis-v2',
    storyUnderstanding: {
      centralSituation: grounded, sourceEndState: grounded, narrativePerspective: grounded,
      timeAndPlaceFrame: grounded, characters: [], relationships: [], causalChain: [],
      unresolvedProblem: grounded, usableClues: [],
      meaningDirection: { ...grounded, confidence: 'explicit' }, sourceStyle: grounded,
    },
    continuationContract: {
      hardConstraints: [], softAffordances: [], openChoices: [],
      forbiddenContradictions: [], paragraphs: [], closureRequirements: [],
    },
    developmentPlan: { selectedRoute: 'Source-grounded route', routeRationale: [], paragraphs: [] },
  }
  for (const analysis of [
    { taskType: 'continuation', continuationAnalysis },
    { taskType: 'continuation', continuationDesign: { theme: 'care', paragraphs: ['one', 'two'] },
      highlightExpressions: [] },
  ]) {
    check(`continuation ${'continuationAnalysis' in analysis ? 'narrative' : 'legacy'} hides absent essay and retains official-only essay`, () => {
      const html = renderToStaticMarkup(createElement(continuation.ContinuationAnalysisPanel, { analysis }))
      assert.doesNotMatch(html, /data-continuation-section="modelAnswer"|生成参考范文/)
      if ('continuationAnalysis' in analysis) {
        assert.equal(continuationDomain.isNarrativeContinuationWritingAnalysis(analysis), true)
        assert.match(html, /原文理解[\s\S]*续写约束[\s\S]*两段发展方案/)
      }
      const officialHtml = renderToStaticMarkup(createElement(continuation.ContinuationAnalysisPanel, {
        analysis: { ...analysis, officialModelAnswer },
      }))
      assert.match(officialHtml, /官方参考范文[\s\S]*sorting rubbish carefully/)
      assert.doesNotMatch(officialHtml, /生成参考范文/)
    })
  }

  const dualAnswerHtml = renderToStaticMarkup(
    createElement(retained.RetainedModelAnswer, {
      modelAnswer,
      officialModelAnswer,
    }),
  )
  check('dual model answers render in AI then official order with all paragraphs', () => {
    assert.ok(dualAnswerHtml.indexOf('AI 参考范文') < dualAnswerHtml.indexOf('官方范文'))
    for (const line of [...modelAnswer.split('\n'), ...officialModelAnswer.split('\n')]) {
      if (line.length > 0) assert.ok(dualAnswerHtml.includes(line), `missing line: ${line}`)
    }
    assert.doesNotMatch(dualAnswerHtml, /HIDDEN-HIGHLIGHT-EXPRESSION|亮点表达|annotation|underline|arrow|leader|geometry/)
  })

  const aiOnlyHtml = renderToStaticMarkup(
    createElement(retained.RetainedModelAnswer, { modelAnswer }),
  )
  check('an absent official answer leaves no empty official section', () => {
    assert.ok(aiOnlyHtml.includes('AI 参考范文'))
    assert.doesNotMatch(aiOnlyHtml, /官方范文/)
  })

  const writingPageHtml = renderToStaticMarkup(
    createElement(writingPaperPage.WritingPaperPage, {
      pageModel: {
        blocks: [{
          kind: 'answerBox',
          label: '应用文答题区',
          givenTop: ['Dear fellow students,'],
          givenBottom: ['The Student Council'],
        }],
      },
      children: null,
      retainedModelAnswer: modelAnswer,
      retainedOfficialModelAnswer: officialModelAnswer,
    }),
  )
  check('the left answer box grows around both model answers inside the box', () => {
    assert.match(writingPageHtml, /pi-writing-answer-box--lecture-open/)
    assert.match(
      writingPageHtml,
      /pi-writing-answer-box--lecture-open[\s\S]*data-writing-answer-supplement[\s\S]*AI 参考范文[\s\S]*官方范文/,
    )
    assert.doesNotMatch(writingPageHtml, /<\/div>\s*<aside class="pi-writing-answer-supplement"/)
    assert.doesNotMatch(writingPageHtml, /pi-writing-highlights|HIDDEN-HIGHLIGHT-EXPRESSION/)
  })

  const writingCss = readFileSync(
    path.join(repoRoot, 'app/src/features/paper-intelligence/writingPaperPage.css'),
    'utf8',
  )
  check('lecture-open drops the exam-box fixed height so the frame can grow', () => {
    assert.match(
      writingCss,
      /\.pi-writing-answer-box--application\.pi-writing-answer-box--lecture-open[\s\S]*?height:\s*auto/,
    )
  })

  const cardHtml = renderToStaticMarkup(
    createElement(retained.RetainedReviewCard, { reviewCard }),
  )
  check('the right side remains exactly the existing three-section review card', () => {
    assert.deepEqual(
      [...cardHtml.matchAll(/data-review-section="([^"]+)"/g)].map((match) => match[1]),
      ['basics', 'points', 'reader'],
    )
    assert.doesNotMatch(cardHtml, /AI 参考范文|官方范文|HIDDEN-HIGHLIGHT-EXPRESSION|亮点表达/)
  })
} finally {
  await vite.close()
}

console.log(`\nTicket 03 data-driven lecture checks: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exitCode = 1
