function compactTopicLabelText(value) {
  return String(value || '')
    .trim()
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, '')
}

function makeTopicLabels(theme, themeGroup, subtopics) {
  return subtopics.map((subtopic) => ({
    theme,
    themeGroup,
    subtopic,
    label: `${theme}-${themeGroup}-${subtopic}`,
  }))
}

const TOPIC_LABEL_TAXONOMY = [
  ...makeTopicLabels('人与自我', '生活与学习', [
    '个人生活', '家庭生活', '社区生活', '学校生活',
    '健康的生活方式', '积极的生活态度', '认识自我', '丰富自我', '完善自我',
    '乐于学习', '善于学习', '终身学习', '语言学习的规律', '语言学习的方法',
  ]),
  ...makeTopicLabels('人与自我', '做人与做事', [
    '劳动实践', '劳动价值', '工匠精神', '优秀品行', '正确的人生态度',
    '公民义务', '社会责任', '生命的意义', '生命的价值', '生命安全',
    '未来职业发展趋势', '个人职业倾向', '未来规划', '创新意识', '创业意识',
  ]),
  ...makeTopicLabels('人与社会', '社会服务与人际沟通', [
    '良好的人际关系', '社会交往', '公益事业', '志愿服务',
    '跨文化沟通', '包容', '合作',
  ]),
  ...makeTopicLabels('人与社会', '文学、艺术与体育', [
    '小说', '戏剧', '诗歌', '传记', '文学简史', '经典演讲', '文学名著',
    '绘画领域的代表性作品和人物', '建筑领域的代表性作品和人物',
    '影视领域的概况及其发展', '音乐领域的概况及其发展',
    '日常体育活动', '大型体育赛事', '体育与健康', '体育精神',
  ]),
  ...makeTopicLabels('人与社会', '历史、社会与文化', [
    '文化习俗', '传统节日', '对社会有突出贡献的人物', '重要国际组织',
    '社会公益机构', '法律常识', '法治意识', '物质文化遗产', '非物质文化遗产',
    '社会热点问题', '农业发展', '乡村振兴', '重大政治事件', '重大历史事件',
    '文化渊源', '国家安全', '社会进步', '人类文明发展',
  ]),
  ...makeTopicLabels('人与社会', '科学与技术', [
    '科技发展', '信息技术创新', '科学精神', '信息安全', '网络安全',
  ]),
  ...makeTopicLabels('人与自然', '自然生态', [
    '不同国家地理概况', '自然环境', '人与动植物', '生态环境', '自然科学研究成果',
  ]),
  ...makeTopicLabels('人与自然', '环境保护', [
    '自然遗产保护', '人与环境', '生态环境', '国土安全',
    '人类生存与环境的关系', '社会发展与环境的关系',
  ]),
  ...makeTopicLabels('人与自然', '灾害防范', [
    '自然灾害与防范', '安全常识', '自我保护',
  ]),
  ...makeTopicLabels('人与自然', '宇宙探索', [
    '地球奥秘探索', '宇宙奥秘探索',
  ]),
]

const TOPIC_LABEL_BY_LABEL = new Map(TOPIC_LABEL_TAXONOMY.map((entry) => [entry.label, entry]))
const TOPIC_LABEL_BY_COMPACT_LABEL = new Map(
  TOPIC_LABEL_TAXONOMY.map((entry) => [compactTopicLabelText(entry.label), entry]),
)

export function isValidTopicLabel(theme, themeGroup, subtopic) {
  const label = `${theme}-${themeGroup}-${subtopic}`
  return TOPIC_LABEL_BY_LABEL.has(label) || TOPIC_LABEL_BY_COMPACT_LABEL.has(compactTopicLabelText(label))
}

export { TOPIC_LABEL_TAXONOMY, TOPIC_LABEL_BY_LABEL, TOPIC_LABEL_BY_COMPACT_LABEL, makeTopicLabels }
