#!/usr/bin/env node

import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildApplicationModelAnswerMessages,
  buildCompleteApplicationTaskText,
  validateApplicationModelAnswer,
  validateApplicationReview,
} from '../../../../server/paper-import-ai/applicationWritingWorkflow.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
const promptPath = path.join(repoRoot, 'prompts/application-writing-model-answer-v2.md')
const specPath = path.join(repoRoot, 'docs/cuts/application-writing-v1/spec.md')
const driverPath = path.join(repoRoot, 'scripts/import-pipeline/writing-analysis-driver.mjs')
let passed = 0

function check(name, fn) {
  fn()
  passed += 1
  console.log(`ok - ${name}`)
}

function expectFailure(name, fn, pattern) {
  check(name, () => assert.throws(fn, pattern))
}

function appendixAPrompt() {
  const spec = readFileSync(specPath, 'utf8')
  const start = spec.indexOf('你是一名熟悉中国高考英语应用文评分标准的英文写作者。')
  const end = spec.indexOf('\n---\n\n# 附录 B', start)
  assert.notEqual(start, -1, 'Appendix A prompt start must exist')
  assert.notEqual(end, -1, 'Appendix A prompt end must exist')
  return spec.slice(start, end).trim()
}

const given = {
  top: ['A Helpful Plan', 'Dear Chris,', 'I am writing to share a plan with you.'],
  bottom: ['Yours,', 'Li Hua'],
}

const writingTask = {
  writingTaskId: 'wt-ticket-02',
  groupId: 'group-ticket-02',
  taskType: 'application',
  title: '应用文写作',
  instruction: '假定你是李华，请给英国朋友 Chris 写邮件介绍校园计划，内容包括活动安排和你的期待。注意：写作词数应为80左右。',
  wordCountTarget: 80,
  applicationGiven: given,
}

const groupPassage = {
  paragraphs: [
    { paragraphId: 'p-background', text: '活动将在周五下午的图书馆举行。' },
    { paragraphId: 'p-format', text: '请按给定格式作答。' },
  ],
}

function modelAnswer(studentWordCount = 85) {
  return [
    ...given.top,
    Array.from({ length: studentWordCount }, () => 'useful').join(' '),
    ...given.bottom,
  ].join('\n')
}

function fallbackModelAnswer(studentWordCount = 85) {
  return [
    'Dear Chris,',
    'I am writing to share a plan with you.',
    Array.from({ length: studentWordCount }, () => 'useful').join(' '),
    'Yours,',
    'Li Hua',
  ].join('\n')
}

const reviewCard = {
  form: '邮件',
  topic: '介绍校园计划',
  reader: '英国朋友',
  person: '第一人称',
  tense: '一般现在时',
  type: '介绍类',
  points: ['说明活动安排', '表达个人期待'],
  readerWho: '英国朋友 Chris',
  readerCares: '活动安排是否清楚',
  readerWants: '了解计划并作出回应',
  value: '帮助朋友了解校园活动',
}

check('locked prompt file is byte-for-byte Appendix A authority', () => {
  assert.equal(readFileSync(promptPath, 'utf8').trim(), appendixAPrompt())
})

check('adapter reconstructs instruction, word target, all given format, and group passage', () => {
  const taskText = buildCompleteApplicationTaskText(writingTask, groupPassage)
  for (const expected of [
    writingTask.instruction,
    '80',
    ...given.top,
    ...given.bottom,
    '活动将在周五下午的图书馆举行。',
  ]) {
    assert.ok(taskText.includes(expected), `missing ${expected}`)
  }
})

check('adapter falls back to an instruction-embedded skeleton', () => {
  const fallbackTask = {
    ...writingTask,
    applicationGiven: undefined,
    instruction: `请写一封邮件。\nDear Chris,\nI am writing to share a plan with you.\nYours,\nLi Hua`,
  }
  const taskText = buildCompleteApplicationTaskText(fallbackTask, null)
  for (const expected of ['Dear Chris,', 'I am writing to share a plan with you.', 'Yours,', 'Li Hua']) {
    assert.ok(taskText.includes(expected), `missing ${expected}`)
  }
  assert.equal(validateApplicationModelAnswer({
    modelAnswer: fallbackModelAnswer(),
    writingTask: fallbackTask,
    groupPassage: null,
  }).studentWordCount, 85)
  assert.throws(() => validateApplicationModelAnswer({
    modelAnswer: fallbackModelAnswer().replace('I am writing to share a plan with you.\n', ''),
    writingTask: fallbackTask,
    groupPassage: null,
  }), /given text/)
})

check('adapter keeps an instruction skeleton when a Chinese group passage follows it', () => {
  const fallbackTask = {
    ...writingTask,
    applicationGiven: undefined,
    instruction: `请写一封邮件，介绍校园计划并表达期待。\nDear Chris,\nI am writing to share a plan with you.\nYours,\nLi Hua`,
  }
  const fallbackPassage = {
    paragraphs: [
      { paragraphId: 'p-background', text: '活动将在周五下午的图书馆举行。' },
      { paragraphId: 'p-reminder', text: '请结合以上背景完成写作。' },
    ],
  }
  assert.equal(validateApplicationModelAnswer({
    modelAnswer: fallbackModelAnswer(),
    writingTask: fallbackTask,
    groupPassage: fallbackPassage,
  }).studentWordCount, 85)
  assert.throws(() => validateApplicationModelAnswer({
    modelAnswer: fallbackModelAnswer().replace('I am writing to share a plan with you.\n', ''),
    writingTask: fallbackTask,
    groupPassage: fallbackPassage,
  }), /given text/)
})

check('adapter falls back to a group-passage skeleton', () => {
  const fallbackTask = {
    ...writingTask,
    applicationGiven: undefined,
    instruction: '请按题组材料中的完整格式写一封邮件。',
  }
  const fallbackPassage = {
    paragraphs: [
      { paragraphId: 'p1', text: 'Dear Chris,' },
      { paragraphId: 'p2', text: 'I am writing to share a plan with you.' },
      { paragraphId: 'p3', text: 'Yours,' },
      { paragraphId: 'p4', text: 'Li Hua' },
    ],
  }
  const taskText = buildCompleteApplicationTaskText(fallbackTask, fallbackPassage)
  for (const expected of ['Dear Chris,', 'I am writing to share a plan with you.', 'Yours,', 'Li Hua']) {
    assert.ok(taskText.includes(expected), `missing ${expected}`)
  }
  assert.equal(validateApplicationModelAnswer({
    modelAnswer: fallbackModelAnswer(),
    writingTask: fallbackTask,
    groupPassage: fallbackPassage,
  }).studentWordCount, 85)
  assert.throws(() => validateApplicationModelAnswer({
    modelAnswer: fallbackModelAnswer().replace('I am writing to share a plan with you.\n', ''),
    writingTask: fallbackTask,
    groupPassage: fallbackPassage,
  }), /given text/)
})

check('adapter accepts a legacy applicationGiven title string from the stored asset shape', () => {
  const taskText = buildCompleteApplicationTaskText({
    ...writingTask,
    applicationGiven: 'Ranking My College Life Essentials',
  }, groupPassage)
  assert.ok(taskText.includes('Ranking My College Life Essentials'))
  assert.doesNotThrow(() => validateApplicationModelAnswer({
    modelAnswer: ['Ranking My College Life Essentials', Array.from({ length: 85 }, () => 'useful').join(' ')].join('\n'),
    writingTask: { ...writingTask, applicationGiven: 'Ranking My College Life Essentials' },
    groupPassage,
  }))
})

check('adapter infers an inline salutation and closing before validating word count', () => {
  const inlineTask = {
    ...writingTask,
    applicationGiven: undefined,
    instruction: '请写一封邮件。注意：写作词数应为80左右。Dear Caroline,\nYours sincerely, Li Hua',
  }
  const complete = buildCompleteApplicationTaskText(inlineTask, null)
  assert.ok(complete.includes('Dear Caroline,'))
  assert.ok(complete.includes('Yours sincerely, Li Hua'))
  const valid = ['Dear Caroline,', Array.from({ length: 85 }, () => 'useful').join(' '), 'Yours sincerely, Li Hua'].join('\n')
  assert.equal(validateApplicationModelAnswer({ modelAnswer: valid, writingTask: inlineTask, groupPassage: null }).studentWordCount, 85)
  assert.throws(
    () => validateApplicationModelAnswer({
      modelAnswer: Array.from({ length: 80 }, () => 'useful').join(' '),
      writingTask: inlineTask,
      groupPassage: null,
    }),
    /given text/,
  )
})

check('validator keeps no-skeleton application articles compatible', () => {
  const articleTask = {
    ...writingTask,
    applicationGiven: undefined,
    instruction: '请写一篇介绍校园活动的短文。注意：写作词数应为80左右。',
  }
  const answer = Array.from({ length: 85 }, () => 'useful').join(' ')
  assert.equal(validateApplicationModelAnswer({
    modelAnswer: answer,
    writingTask: articleTask,
    groupPassage: null,
  }).studentWordCount, 85)
})

expectFailure(
  'validator fails closed when a complete group-passage letter is background for a reply',
  () => validateApplicationModelAnswer({
    modelAnswer: [
      'Dear Chris,',
      Array.from({ length: 85 }, () => 'useful').join(' '),
      'Yours,',
      'Li Hua',
    ].join('\n'),
    writingTask: {
      ...writingTask,
      applicationGiven: undefined,
      instruction: '请阅读题组材料提供的来信，注意开头和结尾，并给 Chris 回复。注意：写作词数应为80左右。',
    },
    groupPassage: {
      paragraphs: [
        { paragraphId: 'p-letter-salutation', text: 'Dear Li Hua,' },
        { paragraphId: 'p-letter-body', text: 'How are you? I am planning to visit your school next month. Could you tell me about one activity I should join and explain why you recommend it?' },
        { paragraphId: 'p-letter-closing', text: 'Yours,' },
        { paragraphId: 'p-letter-signature', text: 'Chris' },
      ],
    },
  }),
  /SPEC CONTRADICTS/,
)

for (const [sourceName, instruction, passage] of [
  [
    'instruction',
    '请完成应用文。\nI am writing to invite you to our Open Day.',
    null,
  ],
  [
    'group passage',
    '请完成题组材料中的应用文。',
    {
      paragraphs: [
        { paragraphId: 'p-context', text: '请根据以上信息完成写作。' },
        { paragraphId: 'p-opening', text: 'I am writing to invite you to our Open Day.' },
      ],
    },
  ],
]) {
  expectFailure(
    `validator fails closed when an opening-only ${sourceName} fallback is ambiguous`,
    () => validateApplicationModelAnswer({
      modelAnswer: Array.from({ length: 85 }, () => 'useful').join(' '),
      writingTask: { ...writingTask, applicationGiven: undefined, instruction },
      groupPassage: passage,
    }),
    /SPEC CONTRADICTS/,
  )
}

expectFailure(
  'adapter fails closed with SPEC CONTRADICTS when the instruction is absent',
  () => buildCompleteApplicationTaskText({ ...writingTask, instruction: '  ' }, groupPassage),
  /SPEC CONTRADICTS/,
)
expectFailure(
  'adapter fails closed with SPEC CONTRADICTS for malformed structured given text',
  () => buildCompleteApplicationTaskText({ ...writingTask, applicationGiven: { top: 'Dear Chris,', bottom: [] } }, groupPassage),
  /SPEC CONTRADICTS/,
)

check('application builder appends only the reconstructed complete task to the locked prompt', () => {
  const taskText = buildCompleteApplicationTaskText(writingTask, groupPassage)
  const messages = buildApplicationModelAnswerMessages(writingTask, groupPassage)
  assert.deepEqual(messages.map(({ role }) => role), ['user'])
  assert.equal(messages[0].content, `${appendixAPrompt()}\n\n${taskText}`)
  assert.match(messages[0].content, /最终只输出完整的英文成文。/)
})

check('machine validator accepts a pure-text compliant answer and deducts structured given text', () => {
  const result = validateApplicationModelAnswer({
    modelAnswer: modelAnswer(),
    writingTask,
    groupPassage,
  })
  assert.equal(result.studentWordCount, 85)
  assert.equal(result.wordCountStatus, 'recommended')
})

for (const [name, answer, pattern] of [
  ['JSON wrapper', '{"taskType":"application"}', /JSON/],
  ['Markdown wrapper', '```text\nhello\n```', /Markdown/],
  ['Chinese explanation', `${modelAnswer()}\n中文说明`, /Chinese/],
  ['leading wrapper whitespace', `\n${modelAnswer()}`, /start and end/],
  ['missing given skeleton', modelAnswer().replace('Dear Chris,\n', ''), /given text/],
  ['duplicated given skeleton', `${modelAnswer()}\nDear Chris,`, /repeated/],
  ['out-of-range student word count', modelAnswer(79), /word count/],
]) {
  expectFailure(`machine validator rejects ${name}`, () => validateApplicationModelAnswer({
    modelAnswer: answer,
    writingTask,
    groupPassage,
  }), pattern)
}

check('review validator accepts only a PASS or MUST_FIX review shape', () => {
  assert.deepEqual(validateApplicationReview({ verdict: 'PASS', findings: [] }), { verdict: 'PASS', findings: [] })
  assert.deepEqual(validateApplicationReview({
    verdict: 'MUST_FIX',
    findings: [{ code: 'FORMAT', problem: 'Greeting is missing.', requiredChange: 'Restore the greeting.' }],
  }).verdict, 'MUST_FIX')
})

for (const badReview of [
  undefined,
  { verdict: 'PASS', findings: [{ code: 'X', problem: 'No', requiredChange: 'No' }] },
  { verdict: 'MUST_FIX', findings: [] },
  { verdict: 'PASS', findings: [], reviewedBy: 'generator' },
]) {
  expectFailure(`review validator rejects ${JSON.stringify(badReview)}`, () => validateApplicationReview(badReview), /review/)
}

const tempRoot = mkdtempSync(path.join(tmpdir(), 'eqb-ticket-02-'))
try {
  const paperId = 'paper-ticket-02'
  const groupId = 'group-ticket-02'
  const latestDir = path.join(tempRoot, 'assets', paperId, 'latest')
  const workDir = path.join(tempRoot, 'work')
  const asset = {
    paper: { paperId },
    content: {
      groups: {
        [groupId]: {
          groupId,
          groupType: 'writing',
          title: '应用文写作',
          questionIds: [],
          writingTaskId: writingTask.writingTaskId,
          passage: groupPassage,
        },
        'group-ticket-02-continuation': {
          groupId: 'group-ticket-02-continuation',
          groupType: 'writing',
          title: '读后续写',
          questionIds: [],
          writingTaskId: 'wt-ticket-02-continuation',
        },
      },
      writingTasks: {
        [writingTask.writingTaskId]: writingTask,
        'wt-ticket-02-continuation': {
          writingTaskId: 'wt-ticket-02-continuation',
          groupId: 'group-ticket-02-continuation',
          taskType: 'continuation',
          title: '读后续写',
          instruction: 'continuation instruction',
          materialText: 'The kind child walked home.',
          continuationStarters: ['The child smiled.', 'The child felt happy.'],
          wordCountTarget: 150,
        },
      },
    },
  }
  mkdirSync(latestDir, { recursive: true })
  writeFileSync(path.join(latestDir, 'paper-asset.json'), `${JSON.stringify(asset, null, 2)}\n`)

  const env = {
    ...process.env,
    WRITING_ANALYSIS_PAPER_ASSETS_DIR: path.join(tempRoot, 'assets'),
    WRITING_ANALYSIS_WORK_DIR: workDir,
    WRITING_ANALYSIS_ALLOWED_PAPERS: paperId,
  }
  const runDriver = (...args) => execFileSync('node', [driverPath, ...args], { encoding: 'utf8', env })
  const key = `${paperId}__${groupId}`

  check('application list writes a pure-text prompt and separated application work files', () => {
    runDriver('list', 'application')
    assert.equal(existsSync(path.join(workDir, `${key}.out.json`)), false)
    assert.equal(existsSync(path.join(workDir, `${key}.model-answer.prompt.txt`)), true)
    assert.equal(existsSync(path.join(workDir, `${key}.task.json`)), true)
    assert.match(readFileSync(path.join(workDir, `${key}.model-answer.prompt.txt`), 'utf8'), /完整写作题目/)
  })

  writeFileSync(path.join(workDir, `${key}.model-answer.txt`), modelAnswer())
  writeFileSync(path.join(workDir, `${key}.review-card.json`), JSON.stringify(reviewCard))
  writeFileSync(path.join(workDir, `${key}.review.json`), JSON.stringify({
    verdict: 'MUST_FIX',
    findings: [{ code: 'CONTENT', problem: 'A point needs revision.', requiredChange: 'Revise the point.' }],
  }))

  check('application persist refuses a MUST_FIX review and creates no paper asset', () => {
    const result = spawnSync('node', [driverPath, 'persist', 'application'], { encoding: 'utf8', env })
    assert.equal(result.status, 1)
    assert.match(result.stdout, /MUST_FIX/)
    assert.equal(existsSync(path.join(latestDir, 'analyses', 'writing-analysis-v1.json')), false)
  })

  rmSync(path.join(workDir, `${key}.review.json`))
  check('application persist refuses a missing independent review with a non-zero exit', () => {
    const result = spawnSync('node', [driverPath, 'persist', 'application'], { encoding: 'utf8', env })
    assert.equal(result.status, 1)
    assert.match(result.stdout, /MISSING independent review/)
    assert.equal(existsSync(path.join(latestDir, 'analyses', 'writing-analysis-v1.json')), false)
  })

  writeFileSync(path.join(workDir, `${key}.review.json`), JSON.stringify({ verdict: 'PASS', findings: [] }))
  writeFileSync(path.join(workDir, `${key}.official-model-answer.txt`), 'Official answer.\n\nSecond paragraph.')

  check('application persist requires machine validation and PASS before atomic Ticket 01 persistence', () => {
    runDriver('persist', 'application')
    const persisted = JSON.parse(readFileSync(path.join(latestDir, 'analyses', 'writing-analysis-v1.json'), 'utf8'))
    const writing = persisted.groups[groupId].writing
    assert.equal(writing.taskType, 'application')
    assert.equal(writing.modelAnswer, modelAnswer())
    assert.deepEqual(writing.reviewCard, reviewCard)
    assert.equal(writing.officialModelAnswer, 'Official answer.\n\nSecond paragraph.')
    assert.equal(Object.hasOwn(writing, 'audit'), false)
    assert.equal(Object.hasOwn(writing, 'review'), false)
    assert.equal(Object.hasOwn(writing, 'highlightExpressions'), false)
  })

  check('continuation list remains on its existing combined-prompt protocol', () => {
    runDriver('list', 'continuation')
    const continuationKey = `${paperId}__group-ticket-02-continuation`
    assert.equal(existsSync(path.join(workDir, `${continuationKey}.combined.txt`)), true)
    assert.equal(existsSync(path.join(workDir, `${continuationKey}.model-answer.prompt.txt`)), false)
  })
} finally {
  rmSync(tempRoot, { recursive: true, force: true })
}

console.log(`\nTicket 02 reviewed workflow verify: ${passed} passed, 0 failed`)
