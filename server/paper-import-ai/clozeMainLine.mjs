// 完形讲法（docs/product/cloze-methods.md）：题组的主线层和每个空的脉络、找法、正确项语境义、错项。
// 新生成的完形必须带这些字段；已冻结的旧解析没有它们，照旧通过。
// correctFit.reason 和 signatureFacet 由脉络和找法推出，供站内面板、组卷文本和检索继续使用。

export const CLOZE_CHECK_LABELS = {
  collocation: '看搭配',
  echo: '看复现',
  topic: '看话题',
  'action-sequence': '看动作顺序',
  affect: '看情感',
  direction: '看走向',
  'contextual-meaning': '看语境义',
  logic: '看逻辑',
}

export const CLOZE_POS_LABELS = { verb: '动词', noun: '名词', adjective: '形容词', adverb: '副词', phrase: '词组' }
const OTHER_POS_LABELS = new Set(['介词', '连词', '代词'])
const LOGIC_POS = new Set(['adverb', 'phrase', 'other'])
const ROLES = new Set(['main', 'detail'])

// 词性加考点，正好是词性特有考点时，对上检索用的 signatureFacet。
const SIGNATURE_BY_POS_CHECK = {
  'verb:action-sequence': 'cloze.signature.verb.action-sequence',
  'noun:topic': 'cloze.signature.noun.semantic-field',
  'adjective:affect': 'cloze.signature.adjective.affective-consistency',
  'adverb:affect': 'cloze.signature.adverb.affective-consistency',
  'adverb:direction': 'cloze.signature.adverb.affective-consistency',
  'phrase:contextual-meaning': 'cloze.signature.phrase.contextual-composition',
}

const LIMITS = { context: 45, find: 55, distractor: 45, theme: 40, paragraph: 30, emotion: 40, dictMeaning: 8, meaning: 12 }
const LOFTY = /(体现了?|升华|彰显|表达了?)[^，。；,;]{0,10}(精神|品质|主题|道理|情怀|情感)/
const ABSENCE = /(没有|并无|未提|没提|不涉及|无)[^，。；,;]{0,8}(情节|情境|事件|话题|活动|经历)/
const BLANK_MARKER = /__\d*__|_{2,}/

const text = (value) => (typeof value === 'string' ? value.trim() : '')
const normalize = (value) => value.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ')
// 一个汉字算 1，一个英文词或数字算 1，标点不算。
export function clozeTextUnits(value) {
  return (value.match(/[㐀-鿿]/g) || []).length + (value.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g) || []).length
}

export function clozeFindLabel(blank) {
  const check = CLOZE_CHECK_LABELS[blank?.find?.check] || ''
  const pos = CLOZE_POS_LABELS[blank?.pos] || (blank?.pos === 'other' && OTHER_POS_LABELS.has(blank?.find?.posLabel) ? blank.find.posLabel : '')
  return pos + check
}

export function hasClozeTeachingLines(blank) {
  return Boolean(text(blank?.context) && text(blank?.find?.text) && CLOZE_CHECK_LABELS[blank?.find?.check])
}

// 新字段齐全时，补上旧字段：reason 由脉络和找法拼成；没写 signatureFacet 的，由词性和考点推出；
// affectiveArc 由情感线补。
export function deriveClozeLegacyFields(analysis) {
  for (const blank of Object.values(analysis?.blanks || {})) {
    if (!blank || typeof blank !== 'object' || !hasClozeTeachingLines(blank)) continue
    blank.correctFit = blank.correctFit && typeof blank.correctFit === 'object' ? blank.correctFit : {}
    if (!text(blank.correctFit.reason)) blank.correctFit.reason = `${text(blank.context)}${clozeFindLabel(blank)}：${text(blank.find.text)}`
    const facet = SIGNATURE_BY_POS_CHECK[`${blank.pos}:${blank.find.check}`]
    if (facet && !blank.signatureFacet) blank.signatureFacet = facet
  }
  // 情感线是站内面板 affectiveArc 的来源；没写情感线的说明文不补。
  for (const group of Object.values(analysis?.groups || {})) {
    const emotion = text(group?.mainLine?.emotion)
    if (emotion && !text(group.affectiveArc)) group.affectiveArc = emotion
  }
}

function makeQuoteCheck(passage) {
  const normalizedPassage = normalize(passage)
  return (quote, where) => {
    const value = text(quote)
    if (!value) throw new Error(`${where}: 引文为空。`)
    if (BLANK_MARKER.test(value)) throw new Error(`${where}: 引文里有空位标记「${value}」。`)
    if (!normalizedPassage.includes(normalize(value))) throw new Error(`${where}: 「${value}」不在原文里（要原样抄）。`)
    return value
  }
}

function assertLength(value, limit, where) {
  const units = clozeTextUnits(value)
  if (units > limit) throw new Error(`${where}: ${units} 字，超过 ${limit}。`)
}

function assertQuotedInside(line, quote, where) {
  if (!normalize(line).includes(normalize(quote))) throw new Error(`${where}: 引文「${quote}」没有原样出现在这句里。`)
}

function assertNoDot(value, where) {
  if (value.includes('·')) throw new Error(`${where}: 不要用「·」。`)
}

function assertBlankLines({ questionId, item, question, quoteCheck }) {
  const where = questionId
  if (!ROLES.has(item.role)) throw new Error(`${where}: role 只能是 main 或 detail。`)
  const context = text(item.context)
  if (!context) throw new Error(`${where}: 缺少 context（脉络）。`)
  assertLength(context, LIMITS.context, `${where} 脉络`)
  if (LOFTY.test(context)) throw new Error(`${where} 脉络: 「${context.match(LOFTY)[0]}」是空话，用原文的事来说。`)
  const find = item.find
  if (!find || typeof find !== 'object') throw new Error(`${where}: 缺少 find（找法）。`)
  if (!CLOZE_CHECK_LABELS[find.check]) throw new Error(`${where}: find.check 值无效：${find.check}。`)
  if (find.posLabel !== undefined && !(item.pos === 'other' && OTHER_POS_LABELS.has(find.posLabel))) {
    throw new Error(`${where}: find.posLabel 只在 pos 为 other 时写，且只能是介词、连词、代词。`)
  }
  if (find.check === 'logic' && !LOGIC_POS.has(item.pos)) {
    throw new Error(`${where}: 看逻辑只用在选项本身是连词、逻辑副词或表逻辑的词组时；靠信号词定正负的用看情感，定动作的用看搭配或看动作顺序。`)
  }
  const findText = text(find.text)
  if (!findText) throw new Error(`${where}: 缺少 find.text。`)
  assertLength(findText, LIMITS.find, `${where} 找法`)
  if (Object.values(CLOZE_CHECK_LABELS).some((label) => findText.startsWith(label))) {
    throw new Error(`${where} 找法: find.text 不以考点名开头，导出会自动加。`)
  }
  if (!Array.isArray(find.quotes) || find.quotes.length === 0) throw new Error(`${where} 找法: 至少引一处原文。`)
  for (const quote of find.quotes) assertQuotedInside(findText, quoteCheck(quote, `${where} 找法`), `${where} 找法`)
  const ownNo = new RegExp(`(?<![0-9A-Za-z])${Number(question.stem)}(?![0-9])`)
  for (const [label, value] of [['脉络', context], ['找法', findText]]) {
    if (ownNo.test(value)) throw new Error(`${where} ${label}: 不写本空题号，题头已经印了。`)
    assertNoDot(value, `${where} ${label}`)
  }
  // 正确项：先词典义（最接近这句的义项，学生要记住的词义），不同时再写语境义（此处具体指什么）。
  // 题头印「词典义；此处指语境义」（Owner 2026-11-23）。
  const dictMeaning = text(item.correctFit?.dictMeaning)
  const meaning = text(item.correctFit?.meaning)
  if (!dictMeaning) throw new Error(`${where}: 缺少 correctFit.dictMeaning（正确项的词典义，取最接近这句的义项）。`)
  for (const [value, limit, label] of [[dictMeaning, LIMITS.dictMeaning, '词典义'], [meaning, LIMITS.meaning, '语境义']]) {
    if (!value) continue
    assertLength(value, limit, `${where} ${label}`)
    if (/[A-Za-z]/.test(value)) throw new Error(`${where} ${label}: 只写中文意思，答案词题头已经印了。`)
    if (/^(意为|意思是|指|此处|这里|文中)/.test(value) || /[。；;]/.test(value)) throw new Error(`${where} ${label}: 只写意思本身，一个短语，不写「意为」「此处指」、不写理由。`)
    assertNoDot(value, `${where} ${label}`)
  }
  if (meaning && meaning === dictMeaning) throw new Error(`${where} 语境义: 和词典义一样就不写 meaning，只留 dictMeaning。`)
  for (const gloss of item.distractorGlosses) {
    const label = `${where} ${gloss?.optionLabel} 项`
    const meaning = text(gloss?.meaning)
    if (!meaning) throw new Error(`${label}: 缺少 meaning。`)
    assertLength(meaning, LIMITS.distractor, label)
    if (ABSENCE.test(meaning)) throw new Error(`${label}: 「${meaning.match(ABSENCE)[0]}」只说原文没有，要说原文写的是什么。`)
    assertNoDot(meaning, label)
    assertQuotedInside(meaning, quoteCheck(gloss?.quote, label), label)
  }
}

function assertMainLine({ mainLine, group, quoteCheck }) {
  if (!mainLine || typeof mainLine !== 'object') throw new Error('groups.mainLine 不能为空。')
  const theme = text(mainLine.theme?.text)
  if (!theme) throw new Error('主题意义: 缺少 mainLine.theme.text。')
  assertLength(theme, LIMITS.theme, '主题意义')
  if (LOFTY.test(theme)) throw new Error(`主题意义: 「${theme.match(LOFTY)[0]}」是空话。`)
  assertQuotedInside(theme, quoteCheck(mainLine.theme?.quote, '主题意义'), '主题意义')
  const paragraphIds = group.paragraphs.map((paragraph) => paragraph.id)
  const lines = Array.isArray(mainLine.paragraphs) ? mainLine.paragraphs : []
  if (lines.map((line) => line?.paragraphId).join('\n') !== paragraphIds.join('\n')) {
    throw new Error(`主线: mainLine.paragraphs 要按顺序对应原文 ${paragraphIds.length} 段。`)
  }
  for (const line of lines) {
    const value = text(line.text)
    if (!value) throw new Error(`主线 ${line.paragraphId}: 缺少 text。`)
    assertLength(value, LIMITS.paragraph, `主线 ${line.paragraphId}`)
  }
  if (typeof mainLine.emotion !== 'string') throw new Error('情感线: mainLine.emotion 要是字符串，没有就写空字符串。')
  assertLength(mainLine.emotion, LIMITS.emotion, '情感线')
  for (const value of [theme, mainLine.emotion, ...lines.map((line) => text(line.text))]) assertNoDot(value, '题组主线')
}

// required：新生成必须齐全。否则只校验已经写了的部分，旧解析不受影响。
export function assertClozeTeachingLines(analysis, group, { required = false } = {}) {
  const groupAnalysis = analysis.groups?.[group.groupId] || {}
  const quoteCheck = makeQuoteCheck(group.paragraphs.map((paragraph) => paragraph.text).join('\n'))
  for (const question of group.questions) {
    const item = analysis.blanks?.[question.id]
    if (!item) continue
    const present = item.context !== undefined || item.find !== undefined || item.role !== undefined
    if (required || present) assertBlankLines({ questionId: question.id, item, question, quoteCheck })
  }
  if (required || groupAnalysis.mainLine !== undefined) {
    assertMainLine({ mainLine: groupAnalysis.mainLine, group, quoteCheck })
  }
}
