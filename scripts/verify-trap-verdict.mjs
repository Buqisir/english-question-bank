import assert from 'node:assert/strict'
import { trapTailIssue, trapVerdict } from '../server/paper-import/trapVerdict.mjs'

const polarity = {
  primaryType: 'polarityReversal',
  sourceQuote: 'People are able to interpret the meows.',
  sourceHighlight: 'able to interpret',
  optionText: 'They are hard to interpret.',
  optionHighlight: 'hard to interpret',
}

// 无中生有: the name is dropped, the sentence stays.
let v = trapVerdict({ primaryType: 'unsupportedClaim', explanation: '原文未提及按性别分组，属于无中生有。' })
assert.deepEqual([v.change, v.name, v.text], ['dropped', '', '原文未提及按性别分组。'])
assert.match(trapTailIssue({ primaryType: 'unsupportedClaim', explanation: '原文没提制服，属无中生有。' }), /「无中生有」不印/u)

// Tail, primaryType and the sentence agree: the name moves to 错在.
v = trapVerdict({ ...polarity, explanation: '原文说人能读懂猫叫（able to interpret），选项却说很难，属黑白颠倒。' })
assert.deepEqual([v.change, v.name, v.text], ['named', '正反颠倒', '原文说人能读懂猫叫（able to interpret），选项却说很难。'])
assert.equal(trapTailIssue({ ...polarity, explanation: '原文说人能读懂猫叫，选项却说很难，属正反颠倒。' }), '')

// A bare known name after the comma counts as a tail too; the older data names print in 心法 wording.
v = trapVerdict({ primaryType: 'entityMismatch', sourceEntity: 'Messier', optionEntity: 'Thorp', explanation: '西班牙线由 Messier 教授带队，并非 Thorp 教授，对象错配。' })
assert.deepEqual([v.change, v.name], ['named', '张冠李戴'])
assert.equal(trapVerdict({ ...polarity, explanation: '原文说能读懂，选项却说很难，属黑白颠倒。' }).name, '正反颠倒')
assert.match(trapTailIssue({ ...polarity, explanation: '原文说能读懂，选项却说很难，属黑白颠倒。' }), /^$/u)

// The tail disagrees with primaryType: nothing moves.
v = trapVerdict({ ...polarity, explanation: '带队的是 A，不是 B，属对象错配。' })
assert.equal(v.change, 'kept')
assert.match(trapTailIssue({ ...polarity, explanation: '带队的是 A，不是 B，属对象错配。' }), /数据标的是 polarityReversal/u)

// A coined name stays as written and the validator refuses it.
v = trapVerdict({ primaryType: 'sourceLexicalTrap', sourceText: 'maintenance', optionText: 'maintenance work', relationNote: '并非 maintenance 一词的含义，属同词族干扰。' })
assert.equal(v.change, 'kept')
assert.match(trapTailIssue({ primaryType: 'sourceLexicalTrap', relationNote: '提到家长之处是学生改变饮食，属正面内容。' }), /不在三个名字里/u)

// 原文词钩 does not print: the tail is dropped, and new freezes may not write it.
const hook = { primaryType: 'sourceLexicalTrap', sourceText: 'fur-coat-wearing film stars', optionText: 'To see famous film stars.' }
v = trapVerdict({ ...hook, relationNote: '选项借用 film stars 一词，实际并非聚集目的，属原文词钩。' })
assert.deepEqual([v.change, v.name, v.text], ['dropped', '', '选项借用 film stars 一词，实际并非聚集目的。'])
assert.match(trapTailIssue({ ...hook, relationNote: '选项借用 film stars，属词钩干扰项。' }), /不印/u)

// No tail, no change; a clause that merely ends in 错配 is not a tail.
assert.equal(trapVerdict({ primaryType: 'entityMismatch', explanation: '原文的网络是组织联盟，对象与性质都被错配。' }).change, 'none')
assert.equal(trapVerdict({ primaryType: 'polarityReversal', explanation: '选项却说很难，与原文意思相反。' }).change, 'none')

console.log('trapVerdict: PASS')
