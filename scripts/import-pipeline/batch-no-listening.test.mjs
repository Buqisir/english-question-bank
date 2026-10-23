import assert from 'node:assert/strict'
import test from 'node:test'
import { prepArgs } from './batch-run.mjs'

const item = {
  paperId: 'paper-mock-guangdong-source',
  paperName: '广东测试卷',
  provenance: { source: '已核对的题卷', year: 2026, month: 3 },
  question: '/source/question.pdf',
  answer: '/source/answers.pdf',
}

test('批量 prep 将原卷无听力声明传给单卷入口，而非推断缺少音频', () => {
  const args = prepArgs({ ...item, listening: 'absent-by-exam-design' })
  assert.deepEqual(args.slice(0, 5), [
    'prep', item.paperId, '--listening', 'absent-by-exam-design', '--',
  ])
  assert.ok(!prepArgs(item).includes('--listening'))
  assert.throws(() => prepArgs({ ...item, listening: 'absent-by-exam-design', audio: '/source/audio.mp3' }), /不能附带/)
  assert.throws(() => prepArgs({ ...item, listening: 'missing' }), /只接受/)
})

test('历史有听力批量 prep 参数不变', () => {
  assert.deepEqual(prepArgs({ ...item, audio: '/source/audio.mp3' }), [
    'prep', item.paperId, '--audio', '/source/audio.mp3', '--',
    '--paper-name', item.paperName, '--provenance', item.provenance.source,
    '--year', '2026', '--month', '3',
    '--source', `question_source=${item.question}`, '--source', `official_answers=${item.answer}`,
  ])
})
