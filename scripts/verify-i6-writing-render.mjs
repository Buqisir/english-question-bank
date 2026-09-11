#!/usr/bin/env node

// I6-writing-render Step 1: buildWritingPageModel derives the ordered A4 page
// chrome for one writing group from the whole-paper flat content.blocks.
//
// The fixture mirrors the exact block emission of
// server/paper-import-ai/packageBuilder.mjs (application: lines ~570-575;
// continuation: lines ~629-640). A preceding non-writing group block guards
// against cross-section bleed.

import { buildWritingPageModel } from '../app/src/features/paper-intelligence/writingPageModel.mjs'
import {
  applicationWritingNoticeLines,
  continuationStarterDisplayText,
  writingNoticeGroup,
} from '../shared/paper-canonical/applicationWritingDisplay.mjs'

let passed = 0
function assert(name, condition, detail = '') {
  if (!condition) throw new Error(`${name}${detail ? `\n${detail}` : ''}`)
  passed += 1
  console.log(`ok - ${name}`)
}

const STARTERS = ['This is Maya\'s secret.', 'Now Katherine realized.']
const STARTER_TEXT = `Paragraph 1: ${STARTERS[0]}\n\nParagraph 2: ${STARTERS[1]}`
const APP_NOTICE = '注意：\n（1）写作词数应为80个左右；\n（2）请按如下格式在答题卡的相应位置作答。'
const CONT_PROMPT = '阅读下面材料，根据其内容和所给段落开头语续写两段，使之构成一篇完整的短文。'
const CONT_NOTICE = '注意：\n（1）续写词数应为150个左右；\n（2）请按如下格式在答题卡的相应位置作答。'

assert('continuation display strips numeric Paragraph labels',
  continuationStarterDisplayText('Paragraph 1: Starter one.', 0) === 'Starter one.'
  && continuationStarterDisplayText('Paragraph 2: Starter two.', 1) === 'Starter two.')
assert('continuation display strips word Paragraph labels',
  continuationStarterDisplayText('Paragraph one: Starter one.', 0) === 'Starter one.'
  && continuationStarterDisplayText('Paragraph two: Starter two.', 1) === 'Starter two.')
assert('continuation display never strips the wrong paragraph label',
  continuationStarterDisplayText('Paragraph 2: Deliberate source text.', 0)
    === 'Paragraph 2: Deliberate source text.')

const splitNotice = writingNoticeGroup([
  'Writing prompt.',
  '注意：',
  '1. 写作词数应为80个左右；',
  '2. 请按如下格式在答题卡的相应位置作答。',
  'Given title',
])
assert('source-preserved notice paragraphs retain one grouped display position',
  splitNotice?.startIndex === 1
  && splitNotice.blockCount === 3
  && splitNotice.lines.map((line) => line.kind).join(',') === 'label,instruction,instruction'
  && splitNotice.lines[1].text === '（1）写作词数应为80个左右；')

const extendedNotice = writingNoticeGroup([
  'Writing prompt.', '注意事项：', '1. 写作词数应为80个左右；',
  '2. 请按如下格式作答。', 'Given title',
])
assert('validation and display share the 注意事项 label and split source boundary',
  extendedNotice?.startIndex === 1 && extendedNotice.blockCount === 3
  && extendedNotice.lines[0].text === '注意事项：')
const decimalNotice = applicationWritingNoticeLines('注意：1. Use a 2.5 cm margin; 2. Write about 80 words.')
assert('decimal measurements never become numbered notice boundaries',
  decimalNotice?.length === 3 && decimalNotice[1].text.includes('2.5 cm'))
assert('a decimal-leading paragraph stays outside a split notice',
  writingNoticeGroup(['注意：', '1. Write about 80 words.', '2.5 cm is the title.'])?.blockCount === 2)

const asset = {
  content: {
    blocks: [
      // preceding non-writing group — must not bleed into either writing region
      { type: 'sectionHeading', sectionId: 's-gf', text: '第三部分 语言运用（第二节 语法填空）' },
      { type: 'group', groupId: 'g-grammar' },
      // application writing
      { type: 'pageBreakHint' },
      { type: 'partHeading', partId: 'p-writing', text: '第四部分 写作（共两节，满分40分）' },
      { type: 'sectionHeading', sectionId: 's-app', text: '第一节（满分15分）' },
      { type: 'group', groupId: 'g-app' },
      { type: 'instruction', text: APP_NOTICE },
      { type: 'answerBox', writingTaskId: 'wt-app', label: '应用文写作答题区' },
      // continuation writing
      { type: 'sectionHeading', sectionId: 's-cont', text: '第二节（满分25分）' },
      { type: 'instruction', text: CONT_PROMPT },
      { type: 'group', groupId: 'g-cont' },
      { type: 'instruction', text: CONT_NOTICE },
      { type: 'instruction', text: STARTER_TEXT },
      { type: 'answerBox', writingTaskId: 'wt-cont', label: '读后续写答题区' },
    ],
    groups: {
      'g-app': { groupId: 'g-app', groupType: 'writing', writingTaskId: 'wt-app' },
      'g-cont': { groupId: 'g-cont', groupType: 'writing', writingTaskId: 'wt-cont' },
    },
    writingTasks: {
      'wt-app': { writingTaskId: 'wt-app', taskType: 'application' },
      'wt-cont': { writingTaskId: 'wt-cont', taskType: 'continuation', continuationStarters: STARTERS },
    },
  },
}

function kinds(model) {
  return model.blocks.map((b) => b.kind)
}

// ── Application: empty box, paper-order chrome, no bleed ──
const app = buildWritingPageModel(asset, asset.content.groups['g-app'], asset.content.writingTasks['wt-app'])
assert('app model order is part→section→passage→notice→answerBox',
  JSON.stringify(kinds(app)) === JSON.stringify(['partHeading', 'sectionHeading', 'passage', 'instruction', 'answerBox']),
  JSON.stringify(kinds(app)))
assert('app partHeading is the writing part', app.blocks[0].text.includes('第四部分'))
assert('app sectionHeading is 第一节', app.blocks[1].text.includes('第一节'))
assert('app notice is the 80-word notice', app.blocks.find((b) => b.kind === 'instruction')?.text === APP_NOTICE)
const appBox = app.blocks.find((b) => b.kind === 'answerBox')
assert('app answerBox label present', appBox?.label === '应用文写作答题区')
assert('app answerBox is empty (no given top/bottom — no applicationGiven in this fixture)',
  Array.isArray(appBox?.givenTop) && appBox.givenTop.length === 0 && Array.isArray(appBox?.givenBottom) && appBox.givenBottom.length === 0)
assert('app model does not bleed the preceding grammar section',
  !app.blocks.some((b) => 'text' in b && b.text.includes('第三部分')))

// ── Continuation: box carries the two starters, starter instruction folded ──
const cont = buildWritingPageModel(asset, asset.content.groups['g-cont'], asset.content.writingTasks['wt-cont'])
assert('cont model order is section→prompt→passage→notice→answerBox',
  JSON.stringify(kinds(cont)) === JSON.stringify(['sectionHeading', 'instruction', 'passage', 'instruction', 'answerBox']),
  JSON.stringify(kinds(cont)))
assert('cont starts at 第二节 (no app bleed, no partHeading)',
  cont.blocks[0].kind === 'sectionHeading' && cont.blocks[0].text.includes('第二节')
  && !cont.blocks.some((b) => b.kind === 'partHeading'))
assert('cont prompt instruction is the 阅读材料 prompt', cont.blocks[1].text === CONT_PROMPT)
const contInstr = cont.blocks.filter((b) => b.kind === 'instruction').map((b) => b.text)
assert('cont keeps the 注意 instruction', contInstr.includes(CONT_NOTICE))
assert('cont folds the starter instruction (not standalone)', !contInstr.includes(STARTER_TEXT))
const contBox = cont.blocks.find((b) => b.kind === 'answerBox')
assert('cont answerBox label present', contBox?.label === '读后续写答题区')
assert('cont answerBox carries the two starters as givenTop (migrated from givenLines)',
  JSON.stringify(contBox?.givenTop) === JSON.stringify(STARTERS))
assert('cont answerBox givenBottom is empty (continuation never routes via applicationGiven)',
  Array.isArray(contBox?.givenBottom) && contBox.givenBottom.length === 0)
assert('cont model does not bleed the application section',
  !cont.blocks.some((b) => 'text' in b && (b.text.includes('第一节') || b.text === APP_NOTICE)))

// ── I7: application WITH given 上下格式 → answerBox carries top/bottom ──
{
  const appWithGiven = buildWritingPageModel(asset, asset.content.groups['g-app'], {
    writingTaskId: 'wt-app',
    taskType: 'application',
    applicationGiven: { top: ['Dear Chris,', 'I’m Li Hua.'], bottom: ['Yours,', 'Li Hua'] },
  })
  const box = appWithGiven.blocks.find((b) => b.kind === 'answerBox')
  assert('app-with-given: answerBox givenTop = applicationGiven.top',
    JSON.stringify(box?.givenTop) === JSON.stringify(['Dear Chris,', 'I’m Li Hua.']))
  assert('app-with-given: answerBox givenBottom = applicationGiven.bottom',
    JSON.stringify(box?.givenBottom) === JSON.stringify(['Yours,', 'Li Hua']))
}

// ── Degenerate guards ──
const missing = buildWritingPageModel(asset, { groupId: 'g-nope', writingTaskId: 'wt-nope' }, null)
assert('missing group yields empty model', missing.blocks.length === 0)

console.log(`\nI6 writing-render model verify PASSED: ${passed} checks`)
