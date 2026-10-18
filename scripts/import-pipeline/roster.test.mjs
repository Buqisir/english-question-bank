import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { buildRoster, classifyStatus, compareRows, parseExamMonth } from './roster.mjs'

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
  const facts = { production: true, submitted: { state: 'submitted', revisionId: 'rev-1' },
    local: { state: 'blocked', blocked: { kind: 'withdrawn' } }, answer: false, audio: false }
  assert.equal(classifyStatus(facts), '已在生产')
  facts.production = false
  assert.equal(classifyStatus(facts), '已送审待审')
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
      shengzhou: { paperName: '嵊州', latestRevisionId: 'ocr-1' },
      joint: { paperName: '另一正式卷名', latestRevisionId: 'rev-2' },
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
    assert.deepEqual(first.rows.map((r) => r.status), ['本地进行中/卡住', '已在生产'])
    assert.equal(first.rows[0].match, 'ocrOnly')
    assert.equal(first.rows[1].match, 'submittedRevision')
    const second = buildRoster({ sourceRoot, batchRoot, cacheFile })
    assert.equal(second.hashReads, 0)
    assert.deepEqual(second.rows, first.rows)
    writeFileSync(path.join(sourceRoot, blockedKey, '试题（10页版）.pdf'), 'changed')
    assert.equal(buildRoster({ sourceRoot, batchRoot, cacheFile }).hashReads, 1)
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
})
