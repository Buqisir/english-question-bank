#!/usr/bin/env node

// I7 Step 1: extractApplicationParagraphs separates the application "given
// skeleton" (上下格式/title) from the 情境 prompt. The given skeleton is the
// trailing run of pure non-CJK lines, captured ONLY when a positive signal
// matches (salutation / closing word / single-line title) — else fail-safe: keep
// everything in the prompt (MF1). 5 shapes + an inline-aside guard (MF2).

import { extractApplicationParagraphs } from '../server/paper-import-ai/docxSplitter.mjs'

let passed = 0
function assert(name, condition, detail = '') {
  if (!condition) throw new Error(`${name}${detail ? `\n${detail}` : ''}`)
  passed += 1
  console.log(`ok - ${name}`)
}

const texts = (res) => res.paragraphs.map((p) => p.text)

// ── Shape 1: letter skeleton (重庆 type) → top + bottom ──
{
  const res = extractApplicationParagraphs([
    '假定你是校报记者李华，在上周五的“校园开放日”(Open Day), 外教Chris承担了英语示范课教学。为准确报道该活动，请你给Chris写一封邮件，内容包括：',
    '(1)询问示范课的内容与亮点；',
    '(2)征求其出镜照片使用授权。',
    '(2)可适当增加细节，使内容充实、行文连贯。',
    'Dear Chris,',
    'I’m Li Hua, a student reporter for our school newspaper.',
    'Yours,',
    'Li Hua',
  ], 'i7')
  assert('letter: given captured', res.applicationGiven !== null)
  assert('letter: top = salutation + opening',
    JSON.stringify(res.applicationGiven.top) === JSON.stringify(['Dear Chris,', 'I’m Li Hua, a student reporter for our school newspaper.']),
    JSON.stringify(res.applicationGiven.top))
  assert('letter: bottom = closing + signature',
    JSON.stringify(res.applicationGiven.bottom) === JSON.stringify(['Yours,', 'Li Hua']),
    JSON.stringify(res.applicationGiven.bottom))
  assert('letter: 情境 keeps 4 Chinese lines, no English', texts(res).length === 4 && !texts(res).some((t) => /Dear|Yours|Li Hua/.test(t)))
  assert('letter: inline aside (Open Day) stays in 情境 (not misclassified)', texts(res)[0].includes('(Open Day)'))
}

// ── Shape 2: title-only → all top, no bottom ──
{
  const res = extractApplicationParagraphs([
    '假定你是学生会主席，请为校园英语角写一则招新通知。',
    'Welcome to Join the English Corner',
  ], 'i7')
  assert('title: given captured', res.applicationGiven !== null)
  assert('title: top = the title, bottom empty',
    JSON.stringify(res.applicationGiven.top) === JSON.stringify(['Welcome to Join the English Corner']) && res.applicationGiven.bottom.length === 0)
  assert('title: 情境 keeps only the Chinese line', texts(res).length === 1)
}

// ── Shape 3: no given (all Chinese) → null, all kept ──
{
  const res = extractApplicationParagraphs([
    '假定你是李华，请给外教写一封信介绍中国春节。',
    '(1)介绍春节的由来；',
    '(2)邀请他一起过节。',
  ], 'i7')
  assert('no-given: applicationGiven is null', res.applicationGiven === null)
  assert('no-given: all 3 情境 lines kept', texts(res).length === 3)
}

// ── Shape 4: NEGATIVE GUARD — trailing English sentence, no signal → NOT eaten ──
{
  const res = extractApplicationParagraphs([
    '假定你是李华，请向外教描述你的家乡。',
    '(1)地理位置与气候；',
    'Please describe it in detail.',
  ], 'i7')
  assert('negative-guard: not captured (null)', res.applicationGiven === null)
  assert('negative-guard: trailing English line stays in 情境', texts(res).includes('Please describe it in detail.'))
}

// ── Shape 5: salutation-only letter (no closing word) → captured, all top ──
{
  const res = extractApplicationParagraphs([
    '假定你是李华，请给Ms. Smith写一封感谢信。',
    '(1)表达谢意；',
    'Dear Ms. Smith,',
  ], 'i7')
  assert('salutation-only: given captured via salutation signal', res.applicationGiven !== null)
  assert('salutation-only: all top, bottom empty',
    JSON.stringify(res.applicationGiven.top) === JSON.stringify(['Dear Ms. Smith,']) && res.applicationGiven.bottom.length === 0)
  assert('salutation-only: 情境 keeps 2 Chinese lines', texts(res).length === 2)
}

console.log(`\nI7 application-given verify PASSED: ${passed} checks`)
