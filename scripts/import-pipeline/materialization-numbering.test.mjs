import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeMaterializationNumbering } from './materialization-numbering.mjs'
import { buildOcrReportEntries } from './ocr-proofread.mjs'
import { importSubmissionIssues } from './lib-import-submit-gate.mjs'
import { addOcrNumberingProjections, validateOcrNumberingProjection } from '../../shared/ocrNumberingProjection.mjs'

const source = { documentId: 'question', page: 7 }
const text = value => ({ kind: 'text', text: value })
const fixture = values => ({ groups: [{ blocks: values.map(value => ({
  kind: 'paragraph', source, content: [text(value)],
})) }] })

for (const [name, values] of [
  ['Jinan six forms', ['(1) 你的一次志愿者服务经历；', '(2) 你的感受和倡议。',
    '(1) 写作词数应为80左右；', '(2) 可适当增加细节，以使行文连贯。',
    '(1) 续写词数应为150左右；', '(2) 请按如下格式在答题卡的相应位置作答。']],
  ['Jiangnan ten schools seven forms', ['(1)简要描述该现象；', '(2)分析其可能带来的好处与弊端；',
    '(3)提出你的积极建议。', '(1)写作词数应为80左右；', '(2)请按如下格式在答题纸的相应位置作答。',
    '(1)续写词数应为150左右；', '(2)请按如下格式在答题卡的相应位置作答。']],
]) test(`normalizes ${name} with exactly two bracket changes per field`, () => {
  const result = normalizeMaterializationNumbering(fixture(values))
  assert.equal(result.changes.length, values.length)
  for (const change of result.changes) {
    assert.equal(change.before.length, change.after.length)
    assert.equal([...change.before].filter((char, i) => char !== change.after[i]).length, 2)
  }
})

test('normalizes complete Chinese instructions, retaining digits, whitespace and provenance; idempotent', () => {
  const input = fixture(['(1)内容要点；', '(2)请按格式作答。', '( 3 ) DIY活动介绍；',
    '注意：\n(1)词数80左右；', '(1)简要描述该现象；', '(2)分析其好处与弊端。'])
  const before = structuredClone(input)
  const result = normalizeMaterializationNumbering(input)
  assert.equal(result.changes.length, 6)
  assert.deepEqual(input, before)
  assert.equal(importSubmissionIssues({ materialization: result.materialization }).length, 0)
  assert.equal(result.materialization.groups[0].blocks[2].content[0].text, '（ 3 ） DIY活动介绍；')
  assert.deepEqual(result.materialization.groups[0].blocks[0].source, source)
  const again = normalizeMaterializationNumbering(result.materialization)
  assert.equal(again.changes.length, 0)
  assert.strictEqual(again.materialization, result.materialization)
})

test('leaves English, quotations, Chinese glosses, metadata and unprovable runs unchanged', () => {
  const input = fixture(['Include (1) a title.', '请引用 “Include (1) a title.”',
    'badge(徽章) (1) is useful.'])
  input.groups[0].blocks.push({ kind: 'paragraph', source, content: [text('(1'), text(')中文要求')] },
    { kind: 'paragraph', source, content: [text('(1)'), text('中文要求')] },
    { kind: 'paragraph', source, content: [text('(1)中文'), { kind: 'blank', id: 'blank' }] },
    { kind: 'paragraph', content: [text('(1)无来源')] })
  input.issues = ['(1)机器注释']
  const result = normalizeMaterializationNumbering(input)
  assert.strictEqual(result.materialization, input)
  assert.equal(result.changes.length, 0)
  assert.ok(importSubmissionIssues({ materialization: input }).length > 0)
})

test('table text runs use the same source projection and preserve the table', () => {
  const input = { groups: [{ blocks: [{ kind: 'table', source,
    rows: [{ cells: [{ content: [text('(1)中文要求')] }] }] }] }] }
  const result = normalizeMaterializationNumbering(input)
  assert.equal(result.changes[0].pointer, '/groups/0/blocks/0/rows/0/cells/0/content/0/text')
  assert.equal(result.materialization.groups[0].blocks[0].rows[0].cells[0].content[0].text, '（1）中文要求')
})

test('report entries locate the normalized full source run and finalizer recomputes proof', () => {
  const input = fixture(['(1)简要描述该现象；'])
  const receipt = { correctionReport: { entries: [{
    itemId: 'item-174', kind: 'ocr_repair', ocrText: '(l)简要描述该现象；',
    correctedText: '(1)简要描述该现象；', documentId: source.documentId,
    page: source.page, reason: '核对原页修正数字',
  }] } }
  const result = normalizeMaterializationNumbering(input).materialization
  const { entries, skipped } = buildOcrReportEntries(receipt, result)
  assert.equal(entries.length, 1)
  assert.deepEqual(skipped, [])
  assert.equal(entries[0].after, '（1）简要描述该现象；')
  assert.equal(entries[0].before, receipt.correctionReport.entries[0].ocrText)
  const report = addOcrNumberingProjections({ schemaVersion: 'agent-ocr-correction-report-v2',
    paperId: 'paper-test', entries }, receipt, result)
  assert.ok(validateOcrNumberingProjection(report, report.entries[0], result, '(1)简要描述该现象；'))
  const altered = structuredClone(result)
  altered.groups[0].blocks[0].content[0].text += '额外文字'
  assert.equal(buildOcrReportEntries(receipt, altered).entries.length, 0)
  const wrongPage = structuredClone(result)
  wrongPage.groups[0].blocks[0].source.page = 8
  assert.equal(buildOcrReportEntries(receipt, wrongPage).entries.length, 0)
})
