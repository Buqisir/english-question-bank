export const ROLES = [
  'subject',
  'predicate',
  'object',
  'indirect-object',
  'predicative',
  'object-complement',
  'subject-complement',
  'attributive',
  'adverbial',
  'appositive',
  'head',
  'nonfinite-verb',
  'parenthetical',
  'logical-subject',
  'expletive',
  'cleft-frame',
]

export const ROLE_LABELS = {
  subject: '主语',
  predicate: '谓语',
  object: '宾语',
  'indirect-object': '间接宾语',
  predicative: '表语',
  'object-complement': '宾语补足语',
  'subject-complement': '主语补足语',
  attributive: '定语',
  adverbial: '状语',
  appositive: '同位语',
  head: '中心词',
  'nonfinite-verb': '非谓语动词',
  parenthetical: '插入语',
  'logical-subject': '逻辑主语',
  expletive: '引导词',
  'cleft-frame': '强调句框架',
}

export const NONFINITE_FORMS = ['infinitive', 'gerund', 'present-participle', 'perfect-participle', 'past-participle']

export const FORMS = [
  'phrase',
  'word',
  'verb-group',
  'clause',
  ...NONFINITE_FORMS,
  'prepositional',
  'adjective-phrase',
  'absolute',
  'with-complex',
  'coordination',
]

export const FORM_LABELS = {
  phrase: '短语',
  word: '单词',
  'verb-group': '动词组',
  clause: '从句',
  infinitive: '不定式',
  gerund: '动名词',
  'present-participle': '现在分词',
  'perfect-participle': '现在分词完成式',
  'past-participle': '过去分词',
  prepositional: '介词短语',
  'adjective-phrase': '形容词短语',
  absolute: '独立主格',
  'with-complex': 'with 复合结构',
  coordination: '并列',
}

// Forms whose members are analysed as their own layer (own subject/verb lines).
export const LAYER_FORMS = ['clause', ...NONFINITE_FORMS, 'absolute', 'with-complex']

export const SENSES = [
  'time',
  'place',
  'cause',
  'condition',
  'concession',
  'purpose',
  'result',
  'manner',
  'comparison',
  'accompaniment',
]

export const SENSE_LABELS = {
  time: '时间',
  place: '地点',
  cause: '原因',
  condition: '条件',
  concession: '让步',
  purpose: '目的',
  result: '结果',
  manner: '方式',
  comparison: '比较',
  accompaniment: '伴随',
}

export const OBSTACLES = [
  'inversion',
  'full-inversion',
  'partial-inversion',
  'fronting',
  'ellipsis',
  'gapping',
  'passive',
  'subjunctive',
  'subjunctive-present',
  'subjunctive-past',
  'subjunctive-future',
  'parenthesis',
  'dummy-it',
  'postponed-subject',
  'dummy-object',
  'postponed-object',
  'cleft',
  'negation',
  'partial-negation',
  'total-negation',
  'double-negation',
  'transferred-negation',
  'implied-negation',
  'split',
  'separation',
  'comparison',
  'as-comparison',
  'comparative',
  'multiple-comparison',
  'double-comparative',
  'collocation',
  'idiom',
  'metaphor',
  'rare-sense',
  'preposition-relative',
]

// Word-level difficulties: the trouble is what the words mean, not how the
// sentence is built. Each carries the exact words to highlight and a gloss.
export const LEXICAL_OBSTACLES = ['collocation', 'idiom', 'metaphor', 'rare-sense']

export function isLexicalObstacle(obstacle) {
  return LEXICAL_OBSTACLES.includes(obstacle)
}

export const OBSTACLE_LABELS = {
  inversion: '倒装',
  'full-inversion': '完全倒装',
  'partial-inversion': '部分倒装',
  fronting: '前置',
  ellipsis: '省略',
  gapping: '承前省略',
  passive: '被动',
  subjunctive: '虚拟',
  'subjunctive-present': '虚拟',
  'subjunctive-past': '虚拟',
  'subjunctive-future': '虚拟',
  parenthesis: '插入',
  'dummy-it': '形式主语',
  'postponed-subject': '真正主语',
  'dummy-object': '形式宾语',
  'postponed-object': '真正宾语',
  cleft: '强调句',
  negation: '否定',
  'partial-negation': '部分否定',
  'total-negation': '全部否定',
  'double-negation': '双重否定',
  'transferred-negation': '否定转移',
  'implied-negation': '含否定意义',
  split: '拆分',
  separation: '分隔',
  comparison: '比较结构',
  'as-comparison': '同级比较',
  comparative: '比较级',
  'multiple-comparison': '倍数比较',
  'double-comparative': '双重比较',
  collocation: '固定搭配',
  idiom: '习语',
  metaphor: '比喻',
  'rare-sense': '熟词生义',
  'preposition-relative': '介词＋关系代词',
}

// How a nonfinite verb relates to its logical subject (what it is done by or to).
export const VOICES = ['active', 'passive', 'completed']

export const MARKS = ['non-restrictive', 'emphasized', 'direct-speech', 'explanatory', 'infinitive-complex']

export const MARK_LABELS = {
  'non-restrictive': '非限制性',
  emphasized: '被强调',
  'direct-speech': '直接引语',
  explanatory: '解释说明',
  'infinitive-complex': '不定式复合结构',
}

export const CONNECTORS = [
  'relative-pronoun',
  'relative-adverb',
  'conjunctive-pronoun',
  'conjunctive-adverb',
  'subordinator',
  'coordinator',
]

export const CONNECTOR_LABELS = {
  'relative-pronoun': '关系代词',
  'relative-adverb': '关系副词',
  'conjunctive-pronoun': '连接代词',
  'conjunctive-adverb': '连接副词',
  subordinator: '从属连词',
  coordinator: '并列连词',
}

export const RELATION_KINDS = ['subject-predicate', 'modifies', 'complements', 'refers-to', 'logical-subject', 'explains']

export const RESTORE_KINDS = ['normal-order', 'ellipsis', 'antecedent', 'rewrite']

export const RESTORE_KIND_LABELS = {
  'normal-order': '正常语序',
  ellipsis: '补全省略',
  antecedent: '代入先行词',
  rewrite: '改写为从句',
}

export const RESTORE_BUTTON_LABELS = {
  'normal-order': '还原',
  ellipsis: '补全省略',
  antecedent: '代入先行词',
  rewrite: '改写为从句',
}

export const PRIMARY_ROLES = ['subject', 'predicate', 'object', 'indirect-object', 'predicative', 'object-complement', 'subject-complement']

const CLAUSE_ROLE_LABELS = {
  subject: '主语从句',
  object: '宾语从句',
  predicative: '表语从句',
  attributive: '定语从句',
  appositive: '同位语从句',
  adverbial: '状语从句',
}

export function isNonfiniteForm(form) {
  return NONFINITE_FORMS.includes(form)
}

export function isLayerForm(form) {
  return LAYER_FORMS.includes(form)
}

export function roleLabel(role) {
  return ROLE_LABELS[role] || ''
}

export function formLabel(form) {
  return FORM_LABELS[form] || ''
}

export function senseLabel(sense) {
  return SENSE_LABELS[sense] || ''
}

export function obstacleLabel(obstacle) {
  return OBSTACLE_LABELS[obstacle] || ''
}

export function markLabel(mark) {
  return MARK_LABELS[mark] || ''
}

export function connectorLabel(kind) {
  return CONNECTOR_LABELS[kind] || ''
}

function hasMark(unit, mark) {
  return Boolean(unit?.marks?.includes(mark))
}

export function clauseChipLabel(unit) {
  if (unit?.role === 'adverbial' && unit.sense) return `${senseLabel(unit.sense)}状从`
  if (unit?.role === 'attributive' && hasMark(unit, 'non-restrictive')) return '非限制性定从'
  return CLAUSE_ROLE_LABELS[unit?.role] || '从句'
}

export function clauseTitleLabel(unit) {
  if (unit?.role === 'adverbial' && unit.sense) return `${senseLabel(unit.sense)}状语从句`
  if (unit?.role === 'attributive' && hasMark(unit, 'non-restrictive')) return '非限制性定语从句'
  return CLAUSE_ROLE_LABELS[unit?.role] || '从句'
}

export function adverbialRoleLabel(unit) {
  if (unit?.role === 'adverbial' && unit.sense) return `${senseLabel(unit.sense)}状语`
  return roleLabel(unit?.role)
}

// 主语（动名词）、原因状语（现在分词）、主语（不定式复合结构）
export function nonfiniteLabel(unit) {
  const form = hasMark(unit, 'infinitive-complex') ? markLabel('infinitive-complex') : formLabel(unit.form)
  return `${adverbialRoleLabel(unit)}（${form}）`
}

// 独立主格·伴随状语、with 复合结构·伴随状语
function complexLabel(unit) {
  return `${formLabel(unit.form)}·${adverbialRoleLabel(unit) || '状语'}`
}

// The form half of a two-part label (现在分词 in 原因状语（现在分词）), or ''.
export function unitFormPart(unit) {
  if (unit.form === 'absolute' || unit.form === 'with-complex') return formLabel(unit.form)
  if (unit.form === 'clause' || !phraseLike(unit)) return ''
  return hasMark(unit, 'infinitive-complex') ? markLabel('infinitive-complex') : formLabel(unit.form)
}

function phraseLike(unit) {
  return (isNonfiniteForm(unit.form) || unit.form === 'adjective-phrase') && unit.role !== 'predicate' && unit.role !== 'nonfinite-verb'
}

export function unitChipLabel(unit) {
  if (unit.form === 'clause') return clauseChipLabel(unit)
  if (unit.form === 'absolute' || unit.form === 'with-complex') return complexLabel(unit)
  if (phraseLike(unit)) return nonfiniteLabel(unit)
  if (unit.role === 'adverbial' && unit.sense) return `${senseLabel(unit.sense)}状语`
  return roleLabel(unit.role) || '结构'
}

export function unitTitleLabel(unit) {
  if (unit.form === 'clause') return clauseTitleLabel(unit)
  if (unit.form === 'absolute' || unit.form === 'with-complex') return complexLabel(unit)
  if (phraseLike(unit)) return nonfiniteLabel(unit)
  return roleLabel(unit.role) || '结构'
}
