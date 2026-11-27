// 七选五讲法（docs/product/seven-choices-methods.md v1）：每个空的锁定词、找法、讲解、错项，
// 题组的两个多余选项。新生成的七选五必须带这些字段；已冻结的旧解析没有它们，照旧通过。
// optionFit.fitSummary 和 keyDistractors 由新字段推出，供站内面板、组卷文本继续使用。
import { clozeTextUnits } from './clozeMainLine.mjs'

export const SEVEN_EXTRA_KINDS = { shadow: '影子项', context: '语境项', topic: '话题项' }

const LIMITS = { find: 55, explain: 80, distractor: 45, extra: 100 }
const EMPTY_TALK = [/能统领整段/, /不符合语境/, /不如.{0,12}切题/, /衔接自然/, /使文章更完整/, /语意连贯/, /起到.{0,12}的?作用/]
const PARAGRAPH_NUMBER = /第\s*[一二三四五六七八九十百0-9]+\s*段/
const EXTRA_BLANK_LOCATION = /第\s*\d+\s*题|第\s*[一二三四五六七八九十百0-9]+\s*段\s*第\s*[一二三四五六七八九十百0-9]+\s*空/g
const BLANK_MARKER = /__\d*__|_{2,}/

const text = (value) => (typeof value === 'string' ? value.trim() : '')
const list = (value) => (Array.isArray(value) ? value : [])
const normalize = (value) => String(value || '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ')
const includesLoose = (haystack, needle) => normalize(haystack).includes(normalize(needle))
const includesFolded = (haystack, needle) => normalize(haystack).toLowerCase().includes(normalize(needle).toLowerCase())

export function hasSevenChoicesTeachingLines(entry) {
  return Boolean(text(entry?.find?.text) && text(entry?.explain))
}

// 空在哪一段、段里空前空后各是什么。空位后面残留的题序小数字（如 `__31__ 1`）算空白。
export function locateSevenChoicesBlank(paragraphs, questionNo, paragraphId) {
  const list = Array.isArray(paragraphs) ? paragraphs : []
  const marker = `__${questionNo}__`
  const index = list.findIndex((paragraph) => paragraph?.paragraphId === paragraphId && String(paragraph.text || '').includes(marker))
  const found = index >= 0 ? index : list.findIndex((paragraph) => String(paragraph?.text || '').includes(marker))
  if (found < 0) return null
  const [rawBefore, ...rest] = String(list[found].text).split(marker)
  const rawAfter = rest.join(marker)
  const before = rawBefore.replace(/^[\s●•]+/, '').trim()
  const after = rawAfter.replace(/^\s*\d{1,2}(?=\s|$)/, '').trim()
  return { index: found, paragraph: list[found], before, after }
}

// 卷面上空前、答案、空后三行印什么。导出照这个印，校验照这个查：找法引文和锁定词都要落在这三行里。
const SENTENCE_BREAK = /(?<=[.!?。！？]["”’)]?)\s+/
const looseIncludes = (haystack, needle) => Boolean(needle) && includesLoose(haystack, needle)
// A heading line: short, and either bulleted or without a full stop. Some papers bullet
// whole paragraphs (「• Before you open the book, … __37__ 2」); those are not headings.
const isHeading = (value) => value.trim().length < 80 && (/^\s*[●•]/.test(value) || !/[.!?。！？]["”’)]?\s*$/.test(value))
const tidy = (value) => String(value || '').replace(/^\s*[●•]\s*/, '').replace(/(__\d+__)\s+\d{1,2}(?=\s|$)/g, '$1')
  .replace(/\s+/g, ' ').replace(/ ([,.;:!?])/g, '$1').trim()
const sentencesOf = (value) => tidy(value).split(SENTENCE_BREAK).filter(Boolean)
const onlyGap = (value) => !/[A-Za-z0-9]/.test(value.replace(/^\s*\d{1,2}(?=\s|$)/, ''))


// The paragraph next to the blank's own one, shown only when the analysis uses
// it: its 找法 quotes or 锁定词 come from there, or an older analysis quoted it as
// 空前 or 空后. Owner 2026-11-23: a blank at a paragraph's start shows 上段末尾,
// one at the end shows 下段开头; nothing is printed where the passage begins or ends.
function neighbourRow(paragraph, side, used) {
  if (!paragraph) return null
  const raw = String(paragraph.text || '')
  if (!used.some((quote) => looseIncludes(raw, quote))) return null
  if (isHeading(raw)) return { label: '小标题', text: tidy(raw) }
  const sentences = sentencesOf(raw)
  if (side === 'before') {
    const last = sentences.length - 1
    const at = sentences.findIndex((sentence) => used.some((quote) => looseIncludes(sentence, quote)))
    if (at === -1 || at === last) return { label: '上段末尾', text: sentences[last] }
    return { label: '上段', text: `${sentences.slice(at, at + 1).join(' ')} ……` }
  }
  const at = sentences.findIndex((sentence) => used.some((quote) => looseIncludes(sentence, quote)))
  if (at <= 0) return { label: '下段开头', text: sentences[0] }
  return { label: '下段', text: `…… ${sentences[at]}` }
}

// A quote from the blank's own paragraph; 「……」 marks words left out between it and the blank.
function ownRow(quote, side, own) {
  if (!quote) return null
  const at = normalize(own).indexOf(normalize(quote))
  if (at === -1) return null
  const gap = side === 'before' ? normalize(own).slice(at + normalize(quote).length) : normalize(own).slice(0, at)
  const text = onlyGap(gap) ? quote : side === 'before' ? `${quote} ……` : `…… ${quote}`
  return { label: side === 'before' ? '空前' : '空后', text }
}

function nearestSentence(own, side) {
  const sentences = sentencesOf(own)
  return side === 'before' ? sentences.at(-1) : sentences[0]
}

export function contextChainRows(entry, paragraphs, questionNo) {
  const evidence = entry?.contextEvidence || {}
  const beforeQuote = text(evidence.beforeQuote)
  const afterQuote = text(evidence.afterQuote)
  const located = locateSevenChoicesBlank(paragraphs, questionNo, evidence.paragraphId)
  if (!located) {
    return { before: beforeQuote ? { label: '空前', text: beforeQuote } : null, after: afterQuote ? { label: '空后', text: afterQuote } : null }
  }
  const used = [...list(entry?.find?.quotes), ...list(entry?.lock), beforeQuote, afterQuote].map((item) => text(item)).filter(Boolean)
  const all = list(paragraphs)
  const before = located.before
    ? ownRow(beforeQuote, 'before', located.before) || { label: '空前', text: nearestSentence(located.before, 'before') }
    : neighbourRow(all[located.index - 1], 'before', used)
  const after = located.after
    ? ownRow(afterQuote, 'after', located.after) || { label: '空后', text: nearestSentence(located.after, 'after') }
    : neighbourRow(all[located.index + 1], 'after', used)
  return { before, after }
}

function makeQuoteCheck(sources) {
  return (quote, where) => {
    const value = text(quote)
    if (!value) throw new Error(`${where}: 引文为空。`)
    if (BLANK_MARKER.test(value)) throw new Error(`${where}: 引文里有空位标记「${value}」。`)
    if (!sources.some((source) => includesLoose(source, value))) throw new Error(`${where}: 「${value}」不在原文或选项里（要原样抄）。`)
    return value
  }
}

function assertProse(value, limit, where, { quotes = [], quoteCheck, forbiddenNumbers = [], allowBlankLocations = false }) {
  if (!value) throw new Error(`${where}: 空的。`)
  const units = clozeTextUnits(value)
  if (units > limit) throw new Error(`${where}: ${units} 字，超过 ${limit}。`)
  for (const pattern of EMPTY_TALK) if (pattern.test(value)) throw new Error(`${where}: 「${value.match(pattern)[0]}」是空话，说原文哪个词怎么接。`)
  if (value.includes('·')) throw new Error(`${where}: 不要用「·」。`)
  const locationProse = allowBlankLocations ? value.replace(EXTRA_BLANK_LOCATION, ' ') : value
  const paragraphNumber = locationProse.match(PARAGRAPH_NUMBER)
  if (paragraphNumber) throw new Error(`${where}: 不写「${paragraphNumber[0]}」，说上一段、下一段或引原文。`)
  for (const no of forbiddenNumbers) {
    if (new RegExp(`(?<![0-9A-Za-z])${no}(?![0-9])`).test(locationProse)) throw new Error(`${where}: 不写题号 ${no}。`)
  }
  for (const quote of quotes) {
    const checked = quoteCheck(quote, where)
    if (!includesLoose(value, checked)) throw new Error(`${where}: 引文「${checked}」没有原样出现在这段话里。`)
  }
}

function groupFacts(group) {
  const paragraphs = (group.paragraphs || []).map((paragraph) => ({ paragraphId: paragraph.id ?? paragraph.paragraphId, text: String(paragraph.text || '') }))
  const optionText = Object.fromEntries((group.optionBank || []).map((option) => [option.label, String(option.text || '')]))
  const blanks = (group.questions || []).map((question) => ({ questionId: question.id, questionNo: Number(question.stem ?? question.questionNo), answer: question.answerKey }))
  const answers = new Set(blanks.map((blank) => blank.answer))
  const extraLabels = Object.keys(optionText).filter((label) => !answers.has(label))
  return { paragraphs, optionText, blanks, answers, extraLabels }
}

function assertBlank({ blank, item, facts, quoteCheck }) {
  const where = blank.questionId
  const located = locateSevenChoicesBlank(facts.paragraphs, blank.questionNo, item.contextEvidence?.paragraphId)
  if (!located) throw new Error(`${where}: 原文里找不到 __${blank.questionNo}__。`)
  const evidence = item.contextEvidence || {}
  if (evidence.paragraphId !== located.paragraph.paragraphId) throw new Error(`${where}: contextEvidence.paragraphId 要是空所在的段落 ${located.paragraph.paragraphId}。`)
  const beforeQuote = text(evidence.beforeQuote)
  const afterQuote = text(evidence.afterQuote)
  if (beforeQuote && !includesLoose(located.before, beforeQuote)) throw new Error(`${where}: beforeQuote 只抄本段空前的原文；上一段的句子由导出自己取。`)
  if (afterQuote && !includesLoose(located.after, afterQuote)) throw new Error(`${where}: afterQuote 只抄本段空后的原文；下一段的句子由导出自己取。`)
  // 学生在卷面上只看得到空前、答案、空后三行（空在段首、段尾时那一行是上段、下段的一句）。
  // 锁定词要在这三行里才看得到加粗；找法引的原文也要在这三行里，学生才不用回原文去翻。
  const answerText = facts.optionText[blank.answer] || ''
  const rows = contextChainRows(item, facts.paragraphs, blank.questionNo)
  const printed = [rows.before?.text, answerText, rows.after?.text].filter(Boolean).join('\n')
  const onPage = (quote) => includesLoose(printed, text(quote))
  const tooFar = '在本段但离空远的，把 beforeQuote 或 afterQuote 抄长一点包进来；在上段、下段的，只有空在段首、段尾时才印得出来，而且只印一句'
  if (!Array.isArray(item.lock) || item.lock.length < 1 || item.lock.length > 3) throw new Error(`${where}: lock 要 1 到 3 个锁定词。`)
  for (const word of item.lock) {
    if (!text(word) || !onPage(word)) throw new Error(`${where}: 锁定词「${word}」要原样出现在卷面的空前、答案、空后三行里；${tooFar}。`)
  }
  const forbiddenNumbers = [blank.questionNo]
  const find = item.find
  if (!find || typeof find !== 'object') throw new Error(`${where}: 缺少 find（找法）。`)
  if (!Array.isArray(find.quotes) || find.quotes.length === 0) throw new Error(`${where} 找法: 至少引一处原文。`)
  assertProse(text(find.text), LIMITS.find, `${where} 找法`, { quotes: find.quotes, quoteCheck, forbiddenNumbers })
  for (const quote of find.quotes) {
    if (!onPage(quote)) throw new Error(`${where} 找法: 引文「${text(quote)}」不在卷面的空前、答案、空后三行里，学生得回原文去翻；${tooFar}。`)
  }
  assertProse(text(item.explain), LIMITS.explain, `${where} 讲解`, { quoteCheck, forbiddenNumbers })
  if (!Array.isArray(item.distractors) || item.distractors.length > 1) throw new Error(`${where}: distractors 要是 0 或 1 项的数组。`)
  const otherAnswers = facts.blanks.filter((other) => other !== blank).map((other) => other.answer)
  for (const distractor of item.distractors) {
    if (!otherAnswers.includes(distractor?.label)) throw new Error(`${where} 错项: ${distractor?.label} 不是另一空的正确答案；多余选项写在题组的 extraOptions 里。`)
    assertProse(text(distractor.text), LIMITS.distractor, `${where} ${distractor.label} 项`, { quotes: distractor.quotes || [], quoteCheck, forbiddenNumbers })
  }
}

function assertExtras({ extras, facts, quoteCheck }) {
  if (!extras || typeof extras !== 'object' || Array.isArray(extras)) throw new Error('题组缺少 extraOptions（两个多余选项）。')
  const numbers = facts.blanks.map((blank) => blank.questionNo)
  for (const label of Object.keys(extras)) {
    if (!facts.extraLabels.includes(label)) throw new Error(`extraOptions.${label}: 不是多余选项（多余的是 ${facts.extraLabels.join('、')}）。`)
  }
  for (const label of facts.extraLabels) {
    const where = `多余选项 ${label}`
    const extra = extras[label]
    if (!extra || typeof extra !== 'object') throw new Error(`${where}: 缺这一条。`)
    if (!SEVEN_EXTRA_KINDS[extra.kind]) throw new Error(`${where}: kind 只能是 shadow、context、topic。`)
    if (extra.target === null) {
      if (extra.kind !== 'topic') throw new Error(`${where}: target 为 null（哪一空都接不实）时 kind 必须是 topic。`)
    } else if (!numbers.includes(extra.target)) throw new Error(`${where}: target ${extra.target} 不是本组的题号。`)
    if (extra.secondary !== null && (!numbers.includes(extra.secondary) || extra.secondary === extra.target)) throw new Error(`${where}: secondary ${extra.secondary} 不对。`)
    if (extra.kind === 'shadow') {
      if (!facts.answers.has(extra.shadowOf)) throw new Error(`${where}: shadowOf 要是某一空的正确答案。`)
      if (!Array.isArray(extra.shared) || extra.shared.length === 0) throw new Error(`${where}: 影子项要写 shared（两边共同的词）。`)
      for (const word of extra.shared) {
        if (!text(word) || !includesFolded(facts.optionText[label], word) || !includesFolded(facts.optionText[extra.shadowOf], word)) {
          throw new Error(`${where}: 共同词「${word}」要同时出现在 ${label} 和 ${extra.shadowOf} 里。`)
        }
      }
    } else if (extra.shadowOf !== null) throw new Error(`${where}: 不是影子项，shadowOf 写 null。`)
    assertProse(text(extra.text), LIMITS.extra, where, {
      quotes: extra.quotes || [], quoteCheck, forbiddenNumbers: numbers, allowBlankLocations: true,
    })
  }
}

export function assertSevenChoicesTeachingLines(analysis, group, { required = false } = {}) {
  const facts = groupFacts(group)
  const quoteCheck = makeQuoteCheck([...facts.paragraphs.map((paragraph) => paragraph.text), ...Object.values(facts.optionText)])
  for (const blank of facts.blanks) {
    const item = analysis.questions?.[blank.questionId]
    if (!item) continue
    const present = item.find !== undefined || item.explain !== undefined || item.lock !== undefined
    if (required || present) assertBlank({ blank, item, facts, quoteCheck })
  }
  const extras = analysis.groups?.[group.groupId]?.extraOptions
  if (required || extras !== undefined) assertExtras({ extras, facts, quoteCheck })
}

// 新字段齐全时补上旧字段：fitSummary 用讲解；keyDistractors 用错项和瞄准这一空的多余选项。
export function deriveSevenChoicesLegacyFields(analysis, group) {
  const facts = groupFacts(group)
  const extras = analysis?.groups?.[group.groupId]?.extraOptions || {}
  for (const blank of facts.blanks) {
    const item = analysis?.questions?.[blank.questionId]
    if (!item || typeof item !== 'object' || !hasSevenChoicesTeachingLines(item)) continue
    item.optionFit = item.optionFit && typeof item.optionFit === 'object' ? item.optionFit : {}
    if (!text(item.optionFit.correctOptionLabel)) item.optionFit.correctOptionLabel = blank.answer
    if (!text(item.optionFit.fitSummary)) item.optionFit.fitSummary = text(item.explain)
    if (!Array.isArray(item.keyDistractors)) {
      item.keyDistractors = [
        ...(item.distractors || []).map((distractor) => ({ optionLabel: distractor.label, reason: text(distractor.text) })),
        ...Object.entries(extras).filter(([, extra]) => extra?.target === blank.questionNo).map(([label, extra]) => ({ optionLabel: label, reason: text(extra.text) })),
      ]
    }
  }
}
