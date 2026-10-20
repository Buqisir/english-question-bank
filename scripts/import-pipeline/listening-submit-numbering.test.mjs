import test from 'node:test'
import assert from 'node:assert/strict'
import { importSubmissionIssues } from './lib-import-submit-gate.mjs'

const issues = stem => importSubmissionIssues({ materialization: { groups: [{ stem }] } })
test('Chinese numbered entries beginning with Latin acronyms are blocked', () => {
  const found = issues('要点：(1) DIY 活动；(2) BBQ 晚会')
  assert.equal(found[0]?.code, 'IMPORT_SUBMIT_CHINESE_HALF_WIDTH_NUMBERING')
  assert.deepEqual(found.flatMap(x => x.matches), ['(1)', '(2)'])
})
test('the complete numbered entry spans acronym and Han inline runs', () => {
  const found = issues({ runs: [{ text: '要点：' }, { text: '(1) DIY ' },
    { text: '活动；' }, { text: '(2) BBQ ' }, { text: '晚会' }] })
  assert.deepEqual(found.flatMap(x => x.matches), ['(1)', '(2)'])
})
test('one entry cannot inherit Han from the next numbered entry or separator', () => {
  for (const text of ['(1) DIY only；(2) BBQ 晚会', '(1) DIY only (2) BBQ 晚会']) {
    assert.deepEqual(issues(text).flatMap(x => x.matches), ['(2)'])
  }
})
test('English quotes stay exempt while Han outside quotes still belongs to its entry', () => {
  assert.deepEqual(issues('请阅读句子 “Include (1) a title.” 并翻译。'), [])
  assert.deepEqual(issues('要点：(1) “DIY” 活动；(2) “Include a title.” 晚会').flatMap(x => x.matches),
    ['(1)', '(2)'])
})
