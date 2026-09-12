function makeTopicLabels(theme, themeGroup, subtopics) {
  return subtopics.map((subtopic) => ({
    theme,
    themeGroup,
    subtopic,
    label: `${theme}-${themeGroup}-${subtopic}`,
  }))
}

export function compactTopicLabelText(value) {
  return String(value || '')
    .trim()
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, '')
}

export const TOPIC_LABEL_TAXONOMY = Object.freeze([
  ...makeTopicLabels('人与自我', '生活与学习', ['个人生活', '家庭生活', '社区生活', '学校生活', '健康的生活方式', '积极的生活态度', '认识自我', '丰富自我', '完善自我', '乐于学习', '善于学习', '终身学习', '语言学习的规律', '语言学习的方法']),
  ...makeTopicLabels('人与自我', '做人与做事', ['劳动实践', '劳动价值', '工匠精神', '优秀品行', '正确的人生态度', '公民义务', '社会责任', '生命的意义', '生命的价值', '生命安全', '未来职业发展趋势', '个人职业倾向', '未来规划', '创新意识', '创业意识']),
  ...makeTopicLabels('人与社会', '社会服务与人际沟通', ['良好的人际关系', '社会交往', '公益事业', '志愿服务', '跨文化沟通', '包容', '合作']),
  ...makeTopicLabels('人与社会', '文学、艺术与体育', ['小说', '戏剧', '诗歌', '传记', '文学简史', '经典演讲', '文学名著', '绘画领域的代表性作品和人物', '建筑领域的代表性作品和人物', '影视领域的概况及其发展', '音乐领域的概况及其发展', '日常体育活动', '大型体育赛事', '体育与健康', '体育精神']),
  ...makeTopicLabels('人与社会', '历史、社会与文化', ['文化习俗', '传统节日', '对社会有突出贡献的人物', '重要国际组织', '社会公益机构', '法律常识', '法治意识', '物质文化遗产', '非物质文化遗产', '社会热点问题', '农业发展', '乡村振兴', '重大政治事件', '重大历史事件', '文化渊源', '国家安全', '社会进步', '人类文明发展']),
  ...makeTopicLabels('人与社会', '科学与技术', ['科技发展', '信息技术创新', '科学精神', '信息安全', '网络安全']),
  ...makeTopicLabels('人与自然', '自然生态', ['不同国家地理概况', '自然环境', '人与动植物', '生态环境', '自然科学研究成果']),
  ...makeTopicLabels('人与自然', '环境保护', ['自然遗产保护', '人与环境', '国土安全', '人类生存与环境的关系', '社会发展与环境的关系']),
  ...makeTopicLabels('人与自然', '灾害防范', ['自然灾害与防范', '安全常识', '自我保护']),
  ...makeTopicLabels('人与自然', '宇宙探索', ['地球奥秘探索', '宇宙奥秘探索']),
])

const TOPIC_LABEL_BY_LABEL = new Map(TOPIC_LABEL_TAXONOMY.map((entry) => [entry.label, entry]))
const TOPIC_LABEL_BY_COMPACT_LABEL = new Map(
  TOPIC_LABEL_TAXONOMY.map((entry) => [compactTopicLabelText(entry.label), entry]),
)

function topicSubtopicAliasKey(theme, subtopic) {
  return `${compactTopicLabelText(theme)}|${compactTopicLabelText(subtopic)}`
}

function makeTopicAliasTargets(theme, themeGroup, subtopics) {
  return subtopics
    .map((subtopic) => TOPIC_LABEL_BY_LABEL.get(`${theme}-${themeGroup}-${subtopic}`))
    .filter(Boolean)
}

const TOPIC_SUBTOPIC_ALIASES = new Map()
function addTopicSubtopicAlias(theme, oldSubtopic, themeGroup, subtopics) {
  TOPIC_SUBTOPIC_ALIASES.set(topicSubtopicAliasKey(theme, oldSubtopic), makeTopicAliasTargets(theme, themeGroup, subtopics))
}

addTopicSubtopicAlias('人与自我', '个人、家庭、社区及学校生活', '生活与学习', ['个人生活', '家庭生活', '社区生活', '学校生活'])
addTopicSubtopicAlias('人与自我', '健康的生活方式、积极的生活态度', '生活与学习', ['健康的生活方式', '积极的生活态度'])
addTopicSubtopicAlias('人与自我', '认识自我，丰富自我，完善自我', '生活与学习', ['认识自我', '丰富自我', '完善自我'])
addTopicSubtopicAlias('人与自我', '乐于学习，善于学习，终身学习', '生活与学习', ['乐于学习', '善于学习', '终身学习'])
addTopicSubtopicAlias('人与自我', '语言学习的规律、方法等', '生活与学习', ['语言学习的规律', '语言学习的方法'])
addTopicSubtopicAlias('人与自我', '劳动实践、劳动价值与工匠精神', '做人与做事', ['劳动实践', '劳动价值', '工匠精神'])
addTopicSubtopicAlias('人与自我', '优秀品行，正确的人生态度，公民义务与社会责任', '做人与做事', ['优秀品行', '正确的人生态度', '公民义务', '社会责任'])
addTopicSubtopicAlias('人与自我', '生命的意义与价值、生命安全', '做人与做事', ['生命的意义', '生命的价值', '生命安全'])
addTopicSubtopicAlias('人与自我', '未来职业发展趋势，个人职业倾向、未来规划等', '做人与做事', ['未来职业发展趋势', '个人职业倾向', '未来规划'])
addTopicSubtopicAlias('人与自我', '创新与创业意识', '做人与做事', ['创新意识', '创业意识'])
addTopicSubtopicAlias('人与社会', '良好的人际关系与社会交往', '社会服务与人际沟通', ['良好的人际关系', '社会交往'])
addTopicSubtopicAlias('人与社会', '公益事业与志愿服务', '社会服务与人际沟通', ['公益事业', '志愿服务'])
addTopicSubtopicAlias('人与社会', '跨文化沟通、包容与合作', '社会服务与人际沟通', ['跨文化沟通', '包容', '合作'])
addTopicSubtopicAlias('人与社会', '小说、戏剧、诗歌、传记、文学简史、经典演讲、文学名著等', '文学、艺术与体育', ['小说', '戏剧', '诗歌', '传记', '文学简史', '经典演讲', '文学名著'])
addTopicSubtopicAlias('人与社会', '绘画、建筑等领域的代表性作品和人物', '文学、艺术与体育', ['绘画领域的代表性作品和人物', '建筑领域的代表性作品和人物'])
addTopicSubtopicAlias('人与社会', '影视、音乐等领域的概况及其发展', '文学、艺术与体育', ['影视领域的概况及其发展', '音乐领域的概况及其发展'])
addTopicSubtopicAlias('人与社会', '日常体育活动、大型体育赛事、体育与健康、体育精神', '文学、艺术与体育', ['日常体育活动', '大型体育赛事', '体育与健康', '体育精神'])
addTopicSubtopicAlias('人与社会', '文化习俗与传统节日', '历史、社会与文化', ['文化习俗', '传统节日'])
addTopicSubtopicAlias('人与社会', '重要国际组织与社会公益机构', '历史、社会与文化', ['重要国际组织', '社会公益机构'])
addTopicSubtopicAlias('人与社会', '法律常识与法治意识等', '历史、社会与文化', ['法律常识', '法治意识'])
addTopicSubtopicAlias('人与社会', '物质与非物质文化遗产', '历史、社会与文化', ['物质文化遗产', '非物质文化遗产'])
addTopicSubtopicAlias('人与社会', '农业发展、乡村振兴', '历史、社会与文化', ['农业发展', '乡村振兴'])
addTopicSubtopicAlias('人与社会', '重大政治、历史事件，文化渊源', '历史、社会与文化', ['重大政治事件', '重大历史事件', '文化渊源'])
addTopicSubtopicAlias('人与社会', '社会进步与人类文明发展', '历史、社会与文化', ['社会进步', '人类文明发展'])
addTopicSubtopicAlias('人与社会', '科技发展与信息技术创新，科学精神', '科学与技术', ['科技发展', '信息技术创新', '科学精神'])
addTopicSubtopicAlias('人与社会', '信息安全、网络安全', '科学与技术', ['信息安全', '网络安全'])
TOPIC_SUBTOPIC_ALIASES.set(topicSubtopicAliasKey('人与自然', '自然环境、自然遗产保护'), [
  ...makeTopicAliasTargets('人与自然', '自然生态', ['自然环境']),
  ...makeTopicAliasTargets('人与自然', '环境保护', ['自然遗产保护']),
])
TOPIC_SUBTOPIC_ALIASES.set(topicSubtopicAliasKey('人与自然', '人与环境、人与动植物、生态环境、国土安全'), [
  ...makeTopicAliasTargets('人与自然', '自然生态', ['人与动植物', '生态环境']),
  ...makeTopicAliasTargets('人与自然', '环境保护', ['人与环境', '国土安全']),
])
addTopicSubtopicAlias('人与自然', '自然灾害与防范，安全常识与自我保护', '灾害防范', ['自然灾害与防范', '安全常识', '自我保护'])
addTopicSubtopicAlias('人与自然', '人类生存、社会发展与环境的关系', '环境保护', ['人类生存与环境的关系', '社会发展与环境的关系'])
addTopicSubtopicAlias('人与自然', '地球与宇宙奥秘探索', '宇宙探索', ['地球奥秘探索', '宇宙奥秘探索'])
addTopicSubtopicAlias('人与社会', '对社会有突出贡献的人物', '历史、社会与文化', ['对社会有突出贡献的人物'])
addTopicSubtopicAlias('人与社会', '社会热点问题', '历史、社会与文化', ['社会热点问题'])
addTopicSubtopicAlias('人与社会', '国家安全', '历史、社会与文化', ['国家安全'])
addTopicSubtopicAlias('人与自然', '不同国家地理概况', '自然生态', ['不同国家地理概况'])
addTopicSubtopicAlias('人与自然', '自然科学研究成果', '自然生态', ['自然科学研究成果'])

function optionalString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function clampConfidence(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 0
  return Math.max(0, Math.min(1, number))
}

function normalizeTopicLabelItem(item) {
  if (!item) return []
  const isTextItem = typeof item === 'string'
  const rawLabel = isTextItem
    ? item
    : optionalString(item.label || item.topicLabel || item.value || item.name)
  const labelParts = rawLabel.split('-')
  const rawTheme = isTextItem ? optionalString(labelParts[0]) : optionalString(item.theme || item.主题 || labelParts[0])
  const rawThemeGroup = isTextItem
    ? optionalString(labelParts[1])
    : optionalString(item.themeGroup || item.theme_group || item.主题群 || labelParts[1])
  const rawSubtopic = isTextItem
    ? optionalString(labelParts.slice(2).join('-'))
    : optionalString(item.subtopic || item.subTopic || item.子主题 || labelParts.slice(2).join('-'))
  const assembledLabel = rawTheme && rawThemeGroup && rawSubtopic ? `${rawTheme}-${rawThemeGroup}-${rawSubtopic}` : ''
  const compactLabel = compactTopicLabelText(rawLabel || assembledLabel)
  const canonical = TOPIC_LABEL_BY_LABEL.get(rawLabel) || TOPIC_LABEL_BY_LABEL.get(assembledLabel) || TOPIC_LABEL_BY_COMPACT_LABEL.get(compactLabel)
  const source = isTextItem ? 'ai' : optionalString(item.source) || 'ai'
  const reason = isTextItem ? '' : optionalString(item.reason || item.理由 || item.explanation || item.analysis)
  const confidence = isTextItem ? 0 : clampConfidence(item.confidence ?? item.score ?? item.置信度)
  const decorate = (topicLabel) => ({ ...topicLabel, source, reason, confidence })
  if (canonical) return [decorate(canonical)]
  return (TOPIC_SUBTOPIC_ALIASES.get(topicSubtopicAliasKey(rawTheme, rawSubtopic)) || []).map(decorate)
}

export function normalizeTopicLabelPayload(payload) {
  const rawLabels = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.topicLabels)
      ? payload.topicLabels
      : Array.isArray(payload?.labels)
        ? payload.labels
        : Array.isArray(payload?.results)
          ? payload.results
          : []
  const labels = []
  const seenLabels = new Set()
  rawLabels.forEach((item) => {
    normalizeTopicLabelItem(item).forEach((normalized) => {
      if (!normalized || seenLabels.has(normalized.label)) return
      seenLabels.add(normalized.label)
      labels.push(normalized)
    })
  })
  return labels
}

export function isExactTopicTriple(topic) {
  if (!topic || typeof topic !== 'object' || Array.isArray(topic)) return false
  const keys = Object.keys(topic).sort()
  if (keys.join(',') !== 'subtopic,theme,themeGroup') return false
  return TOPIC_LABEL_BY_LABEL.has(`${topic.theme}-${topic.themeGroup}-${topic.subtopic}`)
}
