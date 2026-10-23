import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { buildRoster, classifyStatus, compareRows, parseExamMonth, writeRoster } from './roster.mjs'

test('考试年月区分明确日期、学年、届别与未知', () => {
  for (const [name, expected] of [
    ['含词汇整理：26年4月合肥二模', '2026-04'], ['2025年10月江南十校', '2025-10'],
    ['2026届A10联盟高三上学期9月学情诊断', '2025-09'],
    ['2025-2026学年第一学期浙南十月联考', '2025-10'],
    ['2025-2026学年第二学期3月联考', '2026-03'], ['26届T8四月联合测评', '2026-04'],
    ['26届宁波一模', null], ['2026年13月考试', null],
  ]) assert.equal(parseExamMonth(name), expected, name)
})

test('状态按生产、送审、进行中、撤回重复、材料、未导入依次判定', () => {
  const facts = { production: { state: 'approved' }, submitted: { state: 'submitted', revisionId: 'rev-1' },
    local: { state: 'blocked', blocked: { kind: 'withdrawn' } }, answer: false, audio: false }
  assert.equal(classifyStatus(facts), '已审核通过')
  facts.production = false
  assert.equal(classifyStatus(facts), '待 Owner 审')
  facts.submitted = { state: 'ocr', revisionId: 'ocr-only' }
  assert.equal(classifyStatus(facts), '已撤回/重复')
  facts.local.blocked.kind = 'needs_owner'
  assert.equal(classifyStatus(facts), '本地进行中/卡住')
  facts.local = null
  assert.equal(classifyStatus(facts), '缺材料')
  facts.answer = true
  assert.equal(classifyStatus(facts), '缺材料')
  facts.audio = true
  assert.equal(classifyStatus(facts), '未导入')
})

test('生产状态区分通过、待审、未完成，未知值不冒充审核通过', () => {
  for (const state of ['approved', 'published']) assert.equal(classifyStatus({ production: { state } }), '已审核通过')
  assert.equal(classifyStatus({ production: { state: 'awaiting_review' } }), '待 Owner 审')
  for (const state of ['uploading', 'changes_requested', 'publishing', 'future_state', undefined]) {
    assert.equal(classifyStatus({ production: { state } }), '生产上传未完成')
  }
})

test('明确无听力不算缺材料，未声明仍缺材料，本批不导独立列出', () => {
  assert.equal(classifyStatus({ answer: true, audio: false }), '缺材料')
  assert.equal(classifyStatus({ answer: true, audio: false, listening: 'absent-by-exam-design' }), '未导入')
  assert.equal(classifyStatus({ answer: false, listening: 'absent-by-exam-design' }), '缺材料')
  assert.equal(classifyStatus({ excluded: true }), '本批不导：题型待支持')
  assert.equal(classifyStatus({ local: { state: 'local_ready' }, answer: true }), '本地完成/待送审')
  const decisions = JSON.parse(readFileSync(new URL('./guangdong-source-decisions-20261019.json', import.meta.url))).sources
  assert.equal(Object.keys(decisions).length, 20)
  assert.equal(Object.values(decisions).filter(value => value.listening === 'absent-by-exam-design').length, 18)
  assert.equal(Object.values(decisions).filter(value => value.excluded).length, 2)
  const highTwo = Object.entries(decisions).find(([key]) => key.includes('高二'))
  assert.equal(highTwo[1].examMonth, '2025-06')
  assert.match(highTwo[1].note, /高二卷/)
})

test('先按年月倒序，再按省份，未知最后', () => {
  const rows = [
    { examMonth: null, province: '安徽', sourceDirectory: 'a' },
    { examMonth: '2025-10', province: '安徽', sourceDirectory: 'b' },
    { examMonth: '2026-04', province: '浙江', sourceDirectory: 'c' },
    { examMonth: '2026-04', province: '安徽', sourceDirectory: 'd' },
  ]
  assert.deepEqual(rows.sort(compareRows).map((r) => r.sourceDirectory), ['d', 'c', 'b', 'a'])
})

test('完整名单展开年级目录、合并题卷版本、复用哈希，OCR 占位不会掩盖卡住', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'eqb-roster-'))
  try {
    const sourceRoot = path.join(temp, 'sources')
    const batchRoot = path.join(temp, 'batch')
    const cacheFile = path.join(temp, 'cache.json')
    const json = (file, value) => { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify(value)) }
    const blockedKey = '浙江模拟题/26年5月嵊州'
    const submittedKey = '浙江模拟题/26年4月联考/高三'
    for (const key of [blockedKey, submittedKey]) {
      const dir = path.join(sourceRoot, key)
      mkdirSync(dir, { recursive: true })
      writeFileSync(path.join(dir, '试题（10页版）.pdf'), `${key}:10`)
      writeFileSync(path.join(dir, '试题（8页版）.pdf'), `${key}:8`)
      writeFileSync(path.join(dir, '答案.pdf'), 'answer')
      writeFileSync(path.join(dir, '听力.mp3'), 'audio')
    }
    json(path.join(batchRoot, 'production-sources.json'), { papers: {
      shengzhou: { paperName: '嵊州', state: 'approved', latestRevisionId: 'ocr-1' },
      joint: { paperName: '另一正式卷名', state: 'awaiting_review', latestRevisionId: 'rev-2' },
      unmatched: { paperName: '其它来源卷', state: 'uploading', latestRevisionId: null },
    } })
    json(path.join(batchRoot, 'submitted.json'), { papers: { joint: { state: 'submitted', revisionId: 'rev-2' } } })
    json(path.join(batchRoot, 'trial/status.json'), { papers: {
      shengzhou: { paperId: 'shengzhou', paperName: '嵊州', item: { inventoryKey: blockedKey },
        ocrRevisionId: 'ocr-1', revisionId: null, state: 'blocked', blocked: { kind: 'needs_owner', reason: '缺听力原文' } },
      joint: { paperId: 'joint', paperName: '联考', item: { inventoryKey: submittedKey }, revisionId: 'rev-2', state: 'reported' },
    } })
    const first = buildRoster({ sourceRoot, batchRoot, cacheFile })
    assert.equal(first.total, 2)
    assert.equal(first.hashReads, 4)
    assert.deepEqual(first.rows.map((r) => r.materials.questionVersions), [2, 2])
    assert.deepEqual(first.rows.map((r) => r.status), ['本地进行中/卡住', '待 Owner 审'])
    assert.equal(first.rows[0].productionState, 'approved')
    assert.equal(first.rows[0].productionRevisionId, 'ocr-1')
    assert.equal(first.rows[1].productionState, 'awaiting_review')
    assert.equal(first.rows[1].productionRevisionId, 'rev-2')
    assert.equal(first.rows[0].match, 'ocrOnly')
    assert.equal(first.rows[1].match, 'submittedRevision')
    const second = buildRoster({ sourceRoot, batchRoot, cacheFile })
    assert.equal(second.hashReads, 0)
    assert.deepEqual(second.rows, first.rows)
    writeFileSync(path.join(sourceRoot, blockedKey, '试题（10页版）.pdf'), 'changed')
    assert.equal(buildRoster({ sourceRoot, batchRoot, cacheFile }).hashReads, 1)
    for (const state of ['uploading', 'future_state']) {
      json(path.join(batchRoot, 'production-sources.json'), { papers: {
        joint: { paperName: '联考', state, latestRevisionId: null },
        unmatched: { paperName: '其它来源卷', state: 'uploading', latestRevisionId: null },
      } })
      const result = buildRoster({ sourceRoot, batchRoot, cacheFile })
      const row = result.rows.find((r) => r.paperId === 'joint')
      assert.equal(row.status, '生产上传未完成')
      assert.equal(row.productionState, state)
      assert.equal(row.productionRevisionId, null)
      assert.equal(row.revisionId, null, '保留快照空 revision，不用本地送审 revision 填充')
      assert.ok(row.notes.some((n) => n.includes(`state=${state}`)))
      assert.equal(row.needsConfirmation.some((n) => n.includes('未知生产 state')), state === 'future_state')
      writeRoster(result, batchRoot)
      const markdown = readFileSync(path.join(batchRoot, 'roster.md'), 'utf8')
      assert.ok(markdown.includes('这些卷在生产里，但源目录里找不到对应文件夹（可能来自其它来源），不影响未导入清单'))
      assert.ok(markdown.includes('state=uploading；latestRevisionId=null'))
      assert.ok(markdown.includes(`${state} / latestRevisionId=null`))
      const sections = ['## 未导入', '## 本地卡住', '## 待 Owner 审', '## 生产上传未完成', '## 已审核通过', '## 缺材料']
      assert.deepEqual(sections.map((section) => markdown.indexOf(section)), sections.map((section) => markdown.indexOf(section)).sort((a, b) => a - b))
    }
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
})
