#!/usr/bin/env node

import assert from 'node:assert/strict'
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
  check('the left answer box carries both model answers without a separate panel', () => {
    assert.ok(writingPageHtml.includes('AI 参考范文'))
    assert.ok(writingPageHtml.includes('官方范文'))
    assert.ok(writingPageHtml.includes('retained-writing-answer'))
    assert.doesNotMatch(writingPageHtml, /pi-writing-highlights|HIDDEN-HIGHLIGHT-EXPRESSION/)
  })

  const cardHtml = renderToStaticMarkup(
    createElement(retained.RetainedReviewCard, { reviewCard }),
  )
  check('the right side remains exactly the existing four-section review card', () => {
    assert.deepEqual(
      [...cardHtml.matchAll(/data-review-section="([^"]+)"/g)].map((match) => match[1]),
      ['basics', 'points', 'reader', 'value'],
    )
    assert.doesNotMatch(cardHtml, /AI 参考范文|官方范文|HIDDEN-HIGHLIGHT-EXPRESSION|亮点表达/)
  })
} finally {
  await vite.close()
}

console.log(`\nTicket 03 data-driven lecture checks: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exitCode = 1
