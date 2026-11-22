import assert from 'node:assert/strict'
import { stripTrapName, trapNameIssue } from '../server/paper-import/trapNameTail.mjs'

const strip = (explanation) => stripTrapName({ explanation })

// 「，属X。」 tails with a label word are dropped; the sentence stays as written.
assert.deepEqual(strip('原文未提及按性别分组，属于无中生有。'), { text: '原文未提及按性别分组。', label: '无中生有' })
assert.equal(strip('原文说人能读懂猫叫，选项却说很难，属黑白颠倒。').text, '原文说人能读懂猫叫，选项却说很难。')
assert.equal(strip('并非 maintenance 一词的含义，属同词族干扰。').text, '并非 maintenance 一词的含义。')
assert.equal(strip('原文从未提及门牙大小，属用原文词钩干扰。').label, '用原文词钩干扰')
assert.equal(strip('该说法原文没有，故属无中生有。').text, '该说法原文没有。')

// Bare labels: a short noun phrase ending in a label.
assert.equal(strip('西班牙线由 Messier 教授带队，并非 Thorp 教授，对象错配。').text, '西班牙线由 Messier 教授带队，并非 Thorp 教授。')
assert.equal(strip('选项说她很失望，态度黑白颠倒。').label, '态度黑白颠倒')
assert.equal(strip('原文没写这件事，此项无中生有。').text, '原文没写这件事。')

// Clauses that explain the trick, say which part is made up, or are not labels stay.
for (const kept of [
  '原文说的是 A，选项把对象错配到作者身上。',
  '原文只谈课程，\'考试\'属于无中生有。',
  '原文只提到医生，护士属无中生有。',
  '设钩的是 pictures，但原文是卫星图像，属性与来源都不符。',
  '提到家长之处是学生改变饮食，属正面内容。',
  '原文的网络是组织联盟，对象与性质都被错配。',
  '这一点原文有写，不是无中生有。',
  '原文说先 A 后 B，颠倒了因果。',
  '选项却说很难，与原文意思相反。',
]) assert.deepEqual(strip(kept), { text: kept, label: '' }, kept)

// relationNote is read when explanation is empty.
assert.equal(stripTrapName({ relationNote: '选项借用 film stars 一词，实际并非聚集目的，属原文词钩。' }).text, '选项借用 film stars 一词，实际并非聚集目的。')

// The validator refuses a tail in new freezes and names it.
assert.match(trapNameIssue({ explanation: '原文没提制服，属无中生有。' }), /「无中生有」/u)
assert.equal(trapNameIssue({ explanation: '原文没提制服。' }), '')

console.log('trapNameTail: PASS')
