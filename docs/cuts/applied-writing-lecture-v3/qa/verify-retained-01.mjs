#!/usr/bin/env node

import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  isCompleteReviewCard,
  persistWritingAnalysisGroup,
  validateWritingAnalysisCandidate,
} from '../../../../server/writing-analysis/writingAnalysisBackfillService.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
let passed = 0

function check(name, fn) {
  fn()
  passed += 1
  console.log(`ok - ${name}`)
}

const reviewCard = {
  form: '邀请邮件',
  topic: '邀请外教参加校广播访谈',
  reader: '外教 Caroline',
  person: '第一人称为主，第二人称指向对方',
  tense: '一般现在时为主',
  type: '邀请类',
  points: ['节目介绍', '访谈时间和话题'],
  readerWho: '外教与受邀嘉宾',
  readerCares: '节目价值与访谈安排',
  readerWants: '目的明确、安排具体、保留协商余地',
  value: '让对方清楚为何受邀、需要分享什么以及如何回复',
}

const highlights = [
  { text: 'Alpha sentence.', note: 'note-a', extra: { preserved: 1 } },
  { text: 'Beta sentence.', note: 'note-b', rank: 2 },
  { text: 'Gamma sentence.', note: 'note-c' },
]

function applicationCandidate(overrides = {}) {
  return {
    taskType: 'application',
    modelAnswer: 'Alpha sentence. Beta sentence. Gamma sentence. This answer has enough ordinary words to pass the soft word-count guidance without changing validation behavior.',
    reviewCard: structuredClone(reviewCard),
    highlightExpressions: structuredClone(highlights),
    ...overrides,
  }
}

function continuationCandidate() {
  return {
    taskType: 'continuation',
    modelAnswer: 'Alpha sentence. Beta sentence. Gamma sentence.',
    continuationDesign: {
      theme: 'kindness',
      paragraphs: ['first paragraph plan', 'second paragraph plan'],
    },
    highlightExpressions: structuredClone(highlights),
  }
}

check('complete application reviewCard validates', () => {
  assert.doesNotThrow(() => validateWritingAnalysisCandidate(applicationCandidate()))
})

check('continuation rejects reviewCard semantics', () => {
  assert.throws(
    () => validateWritingAnalysisCandidate({
      ...continuationCandidate(),
      reviewCard: structuredClone(reviewCard),
    }),
    /reviewCard/,
  )
})

const invalidCards = [
  ['missing', undefined],
  ['null', null],
  ['partial', { ...reviewCard, value: undefined }],
  ['wrong scalar type', { ...reviewCard, form: 42 }],
  ['wrong point count', { ...reviewCard, points: ['one'] }],
  ['trim-dirty', { ...reviewCard, topic: ' dirty' }],
  ['multiline', { ...reviewCard, reader: 'first\nsecond' }],
  ['carriage-return multiline', { ...reviewCard, reader: 'first\rsecond' }],
  ['Unicode NEL multiline', { ...reviewCard, reader: 'first\u0085second' }],
  ['Unicode vertical-tab multiline', { ...reviewCard, reader: 'first\u000Bsecond' }],
  ['Unicode form-feed multiline', { ...reviewCard, reader: 'first\u000Csecond' }],
  ['Unicode line-separator multiline', { ...reviewCard, reader: 'first\u2028second' }],
  ['Unicode paragraph-separator multiline', { ...reviewCard, reader: 'first\u2029second' }],
  ['markup', { ...reviewCard, person: '<strong>first</strong>' }],
  ['Markdown', { ...reviewCard, tense: '**present**' }],
  ['Markdown unordered list', { ...reviewCard, points: ['- first item', 'second item'] }],
  ['Markdown ordered list', { ...reviewCard, points: ['1. first item', 'second item'] }],
  ['Markdown thematic break', { ...reviewCard, value: '---' }],
  ['over 80 code points', { ...reviewCard, value: '字'.repeat(81) }],
  ['unknown field', { ...reviewCard, annotation: 'not allowed' }],
]

for (const [name, invalidReviewCard] of invalidCards) {
  check(`${name} application reviewCard rejects`, () => {
    assert.equal(isCompleteReviewCard(invalidReviewCard), false)
    if (invalidReviewCard === undefined) {
      assert.doesNotThrow(
        () => validateWritingAnalysisCandidate(applicationCandidate({ reviewCard: invalidReviewCard })),
      )
    } else {
      assert.throws(
        () => validateWritingAnalysisCandidate(applicationCandidate({ reviewCard: invalidReviewCard })),
        /reviewCard/,
      )
    }
  })
}

const tempRoot = mkdtempSync(path.join(tmpdir(), 'eqb-retained-01-'))
try {
  const paperId = 'paper-retained-fixture'
  const groupId = 'group-retained-application'
  const analysisDir = path.join(tempRoot, paperId, 'latest', 'analyses')
  mkdirSync(analysisDir, { recursive: true })
  writeFileSync(
    path.join(tempRoot, paperId, 'latest', 'paper-asset.json'),
    `${JSON.stringify({ paper: { paperId }, content: {} }, null, 2)}\n`,
  )
  const filePath = path.join(analysisDir, 'writing-analysis-v1.json')
  writeFileSync(filePath, `${JSON.stringify({
    schemaVersion: 'writing-analysis-v1',
    paperId,
    groups: {},
  }, null, 2)}\n`)

  const application = applicationCandidate()
  validateWritingAnalysisCandidate(application)
  persistWritingAnalysisGroup({ paperAssetsDir: tempRoot }, { paperId, groupId }, application)
  const persistedApplication = JSON.parse(readFileSync(filePath, 'utf8')).groups[groupId].writing

  check('application reviewCard round-trips exactly', () => {
    assert.deepEqual(persistedApplication.reviewCard, reviewCard)
  })
  check('application highlightExpressions preserve objects and order exactly', () => {
    assert.deepEqual(persistedApplication.highlightExpressions, highlights)
  })
  const persistenceInvalidReviewCards = invalidCards.filter(([name]) => [
    'Unicode NEL multiline',
    'Unicode vertical-tab multiline',
    'Unicode form-feed multiline',
    'Markdown thematic break',
  ].includes(name))
  for (const [name, invalidReviewCard] of persistenceInvalidReviewCards) {
    check(`persistence rejects ${name} before creating a group`, () => {
      const rejectedGroupId = `group-retained-malformed-${name.replace(/[^a-z]+/gi, '-').toLowerCase()}`
      assert.throws(
        () => persistWritingAnalysisGroup(
          { paperAssetsDir: tempRoot },
          { paperId, groupId: rejectedGroupId },
          applicationCandidate({ reviewCard: invalidReviewCard }),
        ),
        /reviewCard/,
      )
      const payloadAfterRejection = JSON.parse(readFileSync(filePath, 'utf8'))
      assert.equal(payloadAfterRejection.groups[rejectedGroupId], undefined)
    })
  }
  check('persistence does not duplicate the validator warning', () => {
    const warnings = []
    const originalWarn = console.warn
    console.warn = (message) => warnings.push(message)
    try {
      const warningCandidate = applicationCandidate()
      validateWritingAnalysisCandidate(warningCandidate)
      persistWritingAnalysisGroup(
        { paperAssetsDir: tempRoot },
        { paperId, groupId: 'group-retained-warning-once' },
        warningCandidate,
      )
    } finally {
      console.warn = originalWarn
    }
    assert.equal(warnings.length, 1)
    assert.match(warnings[0], /application modelAnswer word count/)
  })

  const continuationId = 'group-retained-continuation'
  const continuation = continuationCandidate()
  validateWritingAnalysisCandidate(continuation)
  persistWritingAnalysisGroup(
    { paperAssetsDir: tempRoot },
    { paperId, groupId: continuationId },
    continuation,
  )
  const persistedContinuation = JSON.parse(readFileSync(filePath, 'utf8')).groups[continuationId].writing

  check('continuation projection gains no reviewCard and does not drift', () => {
    assert.deepEqual(persistedContinuation, {
      taskType: continuation.taskType,
      modelAnswer: continuation.modelAnswer,
      continuationDesign: continuation.continuationDesign,
      highlightExpressions: continuation.highlightExpressions.map(({ text, note }) => ({ text, note })),
    })
  })
} finally {
  rmSync(tempRoot, { recursive: true, force: true })
}

const pilotAssets = [
  ['paper-2022-i', 'group-2022-i-writing-application'],
  ['paper-2024-i', 'group-2024-i-writing-application'],
]

for (const [paperId, groupId] of pilotAssets) {
  const payload = JSON.parse(readFileSync(
    path.join(repoRoot, 'app/public/paper-assets', paperId, 'latest/analyses/writing-analysis-v1.json'),
    'utf8',
  ))
  check(`${paperId} publishes a valid complete reviewCard`, () => {
    assert.doesNotThrow(() => validateWritingAnalysisCandidate(payload.groups[groupId].writing))
  })
}

const { default: Ajv2020 } = await import(
  pathToFileURL(path.join(repoRoot, 'server/node_modules/ajv/dist/2020.js')).href
)
const writingAnalysisSchema = JSON.parse(readFileSync(
  path.join(repoRoot, 'schemas/paper-import/writing-analysis-v1.schema.json'),
  'utf8',
))
const validateWritingAnalysisSchema = new Ajv2020().compile(writingAnalysisSchema)
const schemaEnvelope = (writing) => ({
  schemaVersion: 'writing-analysis-v1',
  paperId: 'paper-retained-fixture',
  groups: { 'group-retained-fixture': { writing } },
})

check('JSON schema accepts a complete application reviewCard', () => {
  assert.equal(validateWritingAnalysisSchema(schemaEnvelope(applicationCandidate())), true)
})
check('JSON schema accepts a review-card scalar at the 80-code-point boundary', () => {
  assert.equal(validateWritingAnalysisSchema(schemaEnvelope(applicationCandidate({
    reviewCard: { ...reviewCard, value: '字'.repeat(80) },
  }))), true)
})
check('JSON schema rejects reviewCard on continuation', () => {
  assert.equal(validateWritingAnalysisSchema(schemaEnvelope({
    ...continuationCandidate(),
    reviewCard,
  })), false)
})

for (const [name, invalidReviewCard] of invalidCards) {
  if (invalidReviewCard === undefined) continue
  check(`JSON schema rejects ${name} reviewCard`, () => {
    assert.equal(validateWritingAnalysisSchema(schemaEnvelope(applicationCandidate({
      reviewCard: invalidReviewCard,
    }))), false)
  })
}

const { createServer } = await import(
  pathToFileURL(path.join(repoRoot, 'app/node_modules/vite/dist/node/index.js')).href
)
const { createElement } = await import(
  pathToFileURL(path.join(repoRoot, 'app/node_modules/react/index.js')).href
)
const { renderToStaticMarkup } = await import(
  pathToFileURL(path.join(repoRoot, 'app/node_modules/react-dom/server.js')).href
)

const vite = await createServer({
  root: path.join(repoRoot, 'app'),
  appType: 'custom',
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const retained = await vite.ssrLoadModule(
    '/src/features/paper-browse/RetainedWritingLecture.tsx',
  )
  const writingPaperPage = await vite.ssrLoadModule(
    '/src/features/paper-intelligence/WritingPaperPage.tsx',
  )
  const paperBrowsePage = await vite.ssrLoadModule(
    '/src/features/paper-browse/PaperBrowsePage.tsx',
  )
  const validAnalysis = applicationCandidate()

  check('frontend review-card guard accepts the 80-code-point boundary', () => {
    assert.equal(retained.isCompleteReviewCard({ ...reviewCard, value: '字'.repeat(80) }), true)
  })
  for (const [name, invalidReviewCard] of invalidCards) {
    check(`frontend review-card guard rejects ${name}`, () => {
      assert.equal(retained.isCompleteReviewCard(invalidReviewCard), false)
    })
  }

  for (const [, groupId] of pilotAssets) {
    check(`${groupId} publishes retained lecture only in its active lecture state`, () => {
      assert.equal(retained.getRetainedWritingLecture({
        lectureOpen: true,
        panelGroupId: groupId,
        groupId,
        sourceTaskType: 'application',
        analysis: validAnalysis,
      }), validAnalysis)
    })
  }

  const unavailableStates = [
    ['closed lecture', { lectureOpen: false }],
    ['panel ownership moved', { panelGroupId: 'group-other' }],
    ['non-pilot application', { groupId: 'group-other', panelGroupId: 'group-other' }],
    ['continuation source', { sourceTaskType: 'continuation' }],
    ['continuation analysis', { analysis: continuationCandidate() }],
    ['missing reviewCard', { analysis: applicationCandidate({ reviewCard: undefined }) }],
    ['malformed reviewCard', { analysis: applicationCandidate({ reviewCard: { ...reviewCard, value: null } }) }],
    ['blank model answer', { analysis: applicationCandidate({ modelAnswer: '   ' }) }],
    ['wrong-type model answer', { analysis: applicationCandidate({ modelAnswer: null }) }],
    ...invalidCards.map(([name, invalidReviewCard]) => [
      `${name} reviewCard`,
      { analysis: applicationCandidate({ reviewCard: invalidReviewCard }) },
    ]),
  ]

  for (const [name, overrides] of unavailableStates) {
    check(`${name} does not publish retained lecture`, () => {
      assert.equal(retained.getRetainedWritingLecture({
        lectureOpen: true,
        panelGroupId: pilotAssets[0][1],
        groupId: pilotAssets[0][1],
        sourceTaskType: 'application',
        analysis: validAnalysis,
        ...overrides,
      }), null)
    })
  }

  const answerHtml = renderToStaticMarkup(
    createElement(retained.RetainedModelAnswer, { modelAnswer: validAnalysis.modelAnswer }),
  )
  check('plain model answer preserves all logical lines and uses retained-only classes', () => {
    for (const line of validAnalysis.modelAnswer.split('\n')) assert.ok(answerHtml.includes(line))
    assert.match(answerHtml, /retained-writing-answer/)
    assert.doesNotMatch(answerHtml, /highlight|annotation|underline|arrow|leader|seed|geometry/)
  })

  check('application answer box exposes one whole-box lecture trigger without adding a button', () => {
    let activationCount = 0
    const page = writingPaperPage.WritingPaperPage({
      pageModel: {
        blocks: [{
          kind: 'answerBox',
          label: '应用文答题区',
          givenTop: ['Dear Caroline,'],
          givenBottom: ['Yours sincerely,', 'Li Hua'],
        }],
      },
      children: null,
      onAnswerBoxActivate: () => {
        activationCount += 1
      },
    })
    const [answerBox] = page.props.children
    assert.equal(answerBox.type, 'div')
    assert.equal(answerBox.props['data-writing-lecture-trigger'], '')
    assert.equal(answerBox.props.role, 'button')
    assert.equal(answerBox.props.tabIndex, 0)
    answerBox.props.onClick()
    let prevented = false
    answerBox.props.onKeyDown({
      key: 'Enter',
      preventDefault: () => {
        prevented = true
      },
    })
    assert.equal(activationCount, 2)
    assert.equal(prevented, true)

    const ordinaryPage = writingPaperPage.WritingPaperPage({
      pageModel: {
        blocks: [{
          kind: 'answerBox',
          label: '读后续写答题区',
          givenTop: ['Paragraph 1 starter'],
          givenBottom: [],
        }],
      },
      children: null,
    })
    const [ordinaryAnswerBox] = ordinaryPage.props.children
    assert.equal(ordinaryAnswerBox.props['data-writing-lecture-trigger'], undefined)
    assert.equal(ordinaryAnswerBox.props.role, undefined)
    assert.equal(ordinaryAnswerBox.props.onClick, undefined)
  })

  check('only an explicit lecture deep link opens the initial lecture state', () => {
    const focusGroupId = 'group-2022-i-writing-application'
    assert.equal(paperBrowsePage.hasExplicitLectureIntent({ focusGroupId, lecture: false }), false)
    assert.equal(paperBrowsePage.hasExplicitLectureIntent({ focusGroupId, lecture: undefined }), false)
    assert.equal(paperBrowsePage.hasExplicitLectureIntent({ focusGroupId: undefined, lecture: true }), true)
  })

  const cardHtml = renderToStaticMarkup(
    createElement(retained.RetainedReviewCard, { reviewCard }),
  )
  check('review card renders the complete four-section mapping and nothing extra', () => {
    for (const heading of ['基础判断', '内容要点', '读者三问', '价值落点']) {
      assert.ok(cardHtml.includes(heading))
    }
    assert.deepEqual(
      [...cardHtml.matchAll(/data-review-section="([^"]+)"/g)].map((match) => match[1]),
      ['basics', 'points', 'reader', 'value'],
    )
    for (const value of [
      reviewCard.form,
      reviewCard.topic,
      reviewCard.reader,
      reviewCard.person,
      reviewCard.tense,
      reviewCard.type,
      ...reviewCard.points,
      reviewCard.readerWho,
      reviewCard.readerCares,
      reviewCard.readerWants,
      reviewCard.value,
    ]) {
      assert.ok(cardHtml.includes(value))
    }
    assert.match(cardHtml, /retained-writing-card/)
    assert.doesNotMatch(cardHtml, /Alpha sentence|note-a|highlight|annotation|underline|arrow|leader|tab|seed|geometry/)
  })
} finally {
  await vite.close()
}

console.log(`\nRETAINED-01 checks: ${passed} passed`)
