import assert from 'node:assert/strict'
import { subjectFreeHeaderTitle, configuredHeaderTitle, configuredPaperHeader, validatedPaperHeaderTitle } from '../shared/paper-canonical/headerTitle.mjs'
import { mockPaperCoverName } from '../shared/paper-canonical/listeningPresentation.mjs'
import { buildNck1CompatibilityPaperAsset } from '../server/import-review/revisionProjection.mjs'

const examples = [
  ['2025~2026学年佛山市普通高中教学质量检测（二）英语试题', '2025~2026学年佛山市普通高中教学质量检测（二）'],
  ['宁波市2025学年第一学期高考模拟考试英语学科试题卷', '宁波市2025学年第一学期高考模拟考试'],
  ['2026年合肥市高三第一次教学质量检测英语', '2026年合肥市高三第一次教学质量检测'],
  ['浙江省镇海中学2026年5月高三高考模拟测试英语试题（5月卷）', '浙江省镇海中学2026年5月高三高考模拟测试（5月卷）'],
  ['山东省滨州市2025—2026学年度第一学期期末测试高三英语试题', '山东省滨州市2025—2026学年度第一学期期末测试'],
  ['2025-2026学年佛山市普通高中教学质量检测（一）高三英语', '2025-2026学年佛山市普通高中教学质量检测（一）'],
  ['湖北省腾云联盟2025-2026学年度上学期10月联考高三英语试题卷', '湖北省腾云联盟2025-2026学年度上学期10月联考'],
  ['华中师范大学第一附属中学2026届高三年级五月适应性检测高三英语试题', '华中师范大学第一附属中学2026届高三年级五月适应性检测'],
  ['25年8月浙江名校协作体高二英语试题', '25年8月浙江名校协作体'],
  ['2026年学校高三年级英语试题', '2026年学校'],
  ['2026年高一高二英语试题', '2026年高一'],
  ['2026年高三模拟考试英语试题', '2026年高三模拟考试'],
  ['2026年联考高三（英语）', '2026年联考'],
  ['2026年联考（高三年级英语试题）', '2026年联考'],
  ['2026年高一（高二英语）', '2026年高一'],
  ['2026年联考 (高二 英语试题) （一）', '2026年联考（一）'],
  ['26年5月苏锡常镇二模英语试题', '26年5月苏锡常镇二模'],
  ['26年4月福建省质检英语试题', '26年4月福建省质检'],
  ['山东省2026年4月高三核心素养评估英语试题', '山东省2026年4月高三核心素养评估'],
  ['26年3月杭二月考英语试题', '26年3月杭二月考'],
  ['26年1月扬州高三上学期期末英语试题', '26年1月扬州高三上学期期末'],
  ['25年11月重庆市九龙坡区期中考英语', '25年11月重庆市九龙坡区期中考'],
  ['25年9月嘉兴基测英语', '25年9月嘉兴基测'],
  ['25年8月福州第一次调研英语试题', '25年8月福州第一次调研'],
  ['2026届广州市高三年级8月阶段训练英语', '2026届广州市高三年级8月阶段训练'],
  ['汕头市2025-2026学年度普通高中毕业班教学质量监测英语', '汕头市2025-2026学年度普通高中毕业班教学质量监测'],
  ['A10联盟2026届高三上学期9月学情诊断高三英语试题', 'A10联盟2026届高三上学期9月学情诊断'],
  ['2025-2026学年第二学期浙江省精诚联盟适应性联考高三英语学科练习', '2025-2026学年第二学期浙江省精诚联盟适应性联考'],
  ['2025-2026学年第一学期江浙皖高中(县中)发展共同体高三年级10月联考英语学科试题', '2025-2026学年第一学期江浙皖高中(县中)发展共同体高三年级10月联考'],
  ['台州市2026届高三第二次教学质量评估试题（英语）', '台州市2026届高三第二次教学质量评估试题'],
  ['台州市试题 ( 英 语 ) （一）(二)', '台州市试题（一）(二)'],
  ['25年8月七彩阳光英语高三英语试题', '25年8月七彩阳光英语'],
]
for (const [source, expected] of examples) {
  assert.equal(subjectFreeHeaderTitle(source), expected)
  const config = { provenance: { paperName: source }, headerTitle: expected }
  assert.equal(configuredHeaderTitle(config), expected)
  assert.equal(validatedPaperHeaderTitle(configuredPaperHeader(config)), expected)
}
for (const previous of Array.from('考试测检调模练估断评研卷题末中一二三度年级期赛A9）“ \t')) {
  assert.equal(subjectFreeHeaderTitle(`卷名${previous}英语试题`), `卷名${previous}`.trimEnd())
}
for (const suffix of ['英语学科试题卷', '英语试题卷', '英语试题', '英语试卷', '英语',
  '英语学科', '英语练习', '英语真题', '英语样题', '英语学科练习', '英语学科试题']) {
  for (const space of ['', ' ', '　', ' \t　']) {
    assert.equal(subjectFreeHeaderTitle(`高三模拟考试${[...suffix].join(space)}（5月卷）`),
      '高三模拟考试（5月卷）')
  }
}
for (const grade of ['高一', '高二', '高三', '高一年级', '高二年级', '高三年级']) {
  for (const space of ['', ' ', '　', ' \t　']) {
    assert.equal(subjectFreeHeaderTitle(`浙江名校协作体 ${grade}${space}英语试题（5月卷）`),
      '浙江名校协作体（5月卷）')
  }
}
for (const title of ['英语', ' 英 语 ', '英语试题', '——英语试卷！', '英语（ ）',
  '英语学校2026年教学质量检测', '英语学科教学质量检测', '英语教学研究', '商务英语', '专业英语',
  '英语语言学基础', '大学英语教学研究试题', '高三英语能力测试', '高三英语试题分析',
  '商务英语试题', '商务英语试卷', '专业英语试卷', '专业英语学科试题卷',
  '大学英语试题（A卷）', '旅游英语试题卷', '医学英 语试题', '英语听力', '（英语）', '( 英语 )',
  '高三英语试题', '——高三年级英语试题！', '（高二英语）', '高三英语听力',
  '26年3月浙江名校协作体高三', '26年2月青岛期末考/高二']) {
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
assert.deepEqual(configuredPaperHeader({ ...config, headerTitle }), { sourceTitle: original, headerTitle })
assert.equal(validatedPaperHeaderTitle(configuredPaperHeader({ ...config, headerTitle })), headerTitle)
for (const binding of [null, {}, { sourceTitle: original, headerTitle: '未经审核的替换卷名' },
  { sourceTitle: original, headerTitle, extra: true }, { sourceTitle: original, headerTitle: undefined }]) {
  assert.throws(() => validatedPaperHeaderTitle(binding), { code: 'PAPER_HEADER_TITLE_INVALID' })
}
assert.throws(() => configuredHeaderTitle({ ...config, headerTitle: 'Arbitrary rename' }), /headerTitle/)
assert.throws(() => configuredHeaderTitle({ ...config, headerTitle: '' }), /headerTitle/)
const materialization = { paperId: 'paper-header-title-fixture', listening: { state: 'not_supplied' }, groups: [], answers: [] }
const oldAsset = buildNck1CompatibilityPaperAsset({ config, materialization, sourceAssetVersion: 1 })
const newAsset = buildNck1CompatibilityPaperAsset({ config: { ...config, headerTitle }, materialization, sourceAssetVersion: 1 })
assert.equal(Object.hasOwn(oldAsset.paper, 'headerTitle'), false)
assert.equal(newAsset.paper.title, original)
assert.deepEqual(newAsset, oldAsset, 'headerTitle belongs only to the config/publication, never the compatibility asset')
for (const sourceType of ['模拟题', '真题', '校本题', '自编题', undefined]) {
  assert.equal(mockPaperCoverName(sourceType, original), sourceType === '模拟题' ? original : null)
  assert.equal(mockPaperCoverName(sourceType, original, headerTitle), headerTitle)
}
console.log('PASS first-page title suffixes, edition notes, lexical counterexamples, explicit opt-in, unchanged metadata and historical fallback')
