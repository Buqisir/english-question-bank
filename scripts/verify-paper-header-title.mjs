import assert from 'node:assert/strict'
import { subjectFreeHeaderTitle, configuredHeaderTitle } from '../shared/paper-canonical/headerTitle.mjs'
import { mockPaperCoverName } from '../shared/paper-canonical/listeningPresentation.mjs'
import { buildNck1CompatibilityPaperAsset } from '../server/import-review/revisionProjection.mjs'

const examples = [
  ['2025~2026学年佛山市普通高中教学质量检测（二）英语试题', '2025~2026学年佛山市普通高中教学质量检测（二）'],
  ['宁波市2025学年第一学期高考模拟考试英语学科试题卷', '宁波市2025学年第一学期高考模拟考试'],
  ['2026年合肥市高三第一次教学质量检测英语', '2026年合肥市高三第一次教学质量检测'],
  ['浙江省镇海中学2026年5月高三高考模拟测试英语试题（5月卷）', '浙江省镇海中学2026年5月高三高考模拟测试（5月卷）'],
]
for (const [source, expected] of examples) assert.equal(subjectFreeHeaderTitle(source), expected)
for (const suffix of ['英语学科试题卷', '英语试题卷', '英语试题', '英语试卷', '英语']) {
  for (const space of ['', ' ', '　', ' \t　']) {
    assert.equal(subjectFreeHeaderTitle(`高三模拟考试${[...suffix].join(space)}（5月卷）`),
      '高三模拟考试（5月卷）')
  }
}
for (const title of ['英语', ' 英 语 ', '英语试题', '——英语试卷！', '英语（ ）',
  '英语学校2026年教学质量检测', '英语学科教学质量检测', '英语教学研究', '商务英语', '专业英语',
  '英语语言学基础', '大学英语教学研究试题', '高三英语能力测试', '高三英语试题分析']) {
  assert.equal(subjectFreeHeaderTitle(title), title, title)
}
assert.equal(subjectFreeHeaderTitle('英语学校2026年教学质量检测英语试卷'),
  '英语学校2026年教学质量检测', 'an earlier lexical occurrence is preserved')
assert.equal(subjectFreeHeaderTitle('模拟考试英语试题 (5月卷)（A卷）'), '模拟考试(5月卷)（A卷）')
assert.equal(subjectFreeHeaderTitle('高三模拟考试英语试题。'), '高三模拟考试。')
assert.throws(() => subjectFreeHeaderTitle(null), TypeError)

const original = examples[3][0]
const headerTitle = subjectFreeHeaderTitle(original)
const config = { provenance: { paperName: original, source: 'Fixture', sourceType: '模拟题' } }
assert.equal(configuredHeaderTitle(config), undefined)
assert.equal(configuredHeaderTitle({ ...config, headerTitle }), headerTitle)
assert.throws(() => configuredHeaderTitle({ ...config, headerTitle: 'Arbitrary rename' }), /headerTitle/)
assert.throws(() => configuredHeaderTitle({ ...config, headerTitle: '' }), /headerTitle/)
const materialization = { paperId: 'paper-header-title-fixture', listening: { state: 'not_supplied' }, groups: [], answers: [] }
const oldAsset = buildNck1CompatibilityPaperAsset({ config, materialization, sourceAssetVersion: 1 })
const newAsset = buildNck1CompatibilityPaperAsset({ config: { ...config, headerTitle }, materialization, sourceAssetVersion: 1 })
assert.equal(Object.hasOwn(oldAsset.paper, 'headerTitle'), false)
assert.equal(newAsset.paper.title, original)
assert.equal(newAsset.paper.headerTitle, headerTitle)
const withoutHeader = structuredClone(newAsset)
delete withoutHeader.paper.headerTitle
assert.deepEqual(withoutHeader, oldAsset, 'only the optional display title changes')
for (const sourceType of ['模拟题', '真题', '校本题', '自编题', undefined]) {
  assert.equal(mockPaperCoverName(sourceType, original), sourceType === '模拟题' ? original : null)
  assert.equal(mockPaperCoverName(sourceType, original, headerTitle), headerTitle)
}
console.log('PASS first-page title suffixes, edition notes, lexical counterexamples, explicit opt-in, unchanged metadata and historical fallback')
