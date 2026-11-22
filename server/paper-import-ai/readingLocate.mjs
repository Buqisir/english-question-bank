// 定位 for reading questions (BUB-255): how a reader gets from the question to
// the passage. The stem gives the locating words (定位词); they find one passage
// sentence (定位句); the answer is either in that sentence or in its context,
// and when it is not in the sentence a one-line bridge says why.
//
// The analysis stores this on the question as `locateBy` plus, for questions
// located from the stem, one `locationParaphrases` item with
// `sourceRole: "stem"` and `relationType: "locationCue"`. Whether the answer
// sits in the 定位句 is computed here, never stored.
import { splitSentences } from '../../shared/paper-selection/segmentation.mjs'

export const LOCATE_BY = Object.freeze(['stem', 'options', 'passage'])
export const BRIDGE_MAX_UNITS = 25
export const CUE_MAX_WORDS = 5
export const FIND_MAX_UNITS = 16
export const FIND_MAX_ENGLISH_WORDS = 2
// 找法 (`locateFindZh`): the second line under the 定位 skeleton (the 定位词
// and its paragraph, 核对选项 or 看全文): one move from where the reader lands
// and what to look for there (往前一句找原因, 看 but 后), with at most one
// signal word in English. It names paragraphs as [[paragraphId]]; the page
// prints each one the way the passage is labelled (第 3 段, a section head),
// so the line never counts paragraphs on its own. An empty string means the
// answer is in the 定位句 and there is nothing more to point at. Why the
// answer follows stays in bridgeZh, under the quote.
export const PARAGRAPH_TOKEN = /\[\[([^\]\s]+)\]\]/gu

const ABBREVIATION = /\b(?:Dr|Mr|Mrs|Ms|St|Prof|Jr|Sr|Mt|vs|etc|No|Co|Inc|Ltd|U\.S|e\.g|i\.e)\.\s*$/u
const EDGE = /^[\s“"‘'(（]+|[\s”"’')）]+$/gu
const LATIN_WORD = /[A-Za-z0-9][A-Za-z0-9’'.-]*/gu
const CJK = /[㐀-鿿]/gu

// Passages carry no-break spaces where the stem and the agent write plain
// ones; compare with every no-break space read as a space. One character
// stands for one, so positions in the stored text stay the same.
const plain = value => value.replace(/\u00a0/gu, ' ')
const text = value => (typeof value === 'string' ? plain(value).trim() : '')
const plainParagraph = (paragraphs, id) => {
  const value = paragraphs.get(id)
  return typeof value === 'string' ? plain(value) : value
}
const core = value => String(value ?? '').replace(EDGE, '')

// Sentences of one passage paragraph. Intl.Segmenter splits after "Dr.",
// between the initials of "D. C." and inside "(or a few!) doesn't", and it
// ends a sentence inside reported speech (say, “That’s okay. Put it …”).
// A piece belongs to the sentence before it when that one ends in an
// abbreviation, when both sides of the break are single-letter initials, when
// the piece starts in lower case, or when the sentence before it opened a
// short quotation (“Safe!”, “That’s okay.”) after some words of its own and
// the quotation closes later in the paragraph. A quoted speech of full
// sentences still splits, so each of its sentences can be a 定位句.
const SHORT_QUOTE_WORDS = 3
const INITIAL_END = /(?:^|[\s(])[A-Z]\.\s*$/u
const INITIAL_START = /^[A-Z]\.(?:[\s,;:]|$)/u
function insideReportedSpeech(sentence, paragraphText) {
  const open = sentence.text.lastIndexOf('“')
  if (open <= 0 || sentence.text.slice(0, open).trim() === '') return false
  const quoted = sentence.text.slice(open)
  return !quoted.includes('”') && (quoted.match(LATIN_WORD)?.length ?? 0) <= SHORT_QUOTE_WORDS
    && paragraphText.indexOf('”', sentence.end) >= 0
}

export function passageSentences(paragraphText) {
  const sentences = []
  for (const piece of splitSentences(paragraphText)) {
    const previous = sentences.at(-1)
    if (previous && (ABBREVIATION.test(previous.text) || /^[a-z]/u.test(piece.text)
      || (INITIAL_END.test(previous.text) && INITIAL_START.test(piece.text))
      || insideReportedSpeech(previous, paragraphText))) {
      previous.end = piece.end
      previous.text = paragraphText.slice(previous.start, previous.end)
    } else {
      sentences.push({ start: piece.start, end: piece.end, text: piece.text })
    }
  }
  return sentences
}

// A bridge is short: each Chinese character and each English word counts once.
export function bridgeUnits(value) {
  const source = String(value ?? '')
  return (source.match(CJK)?.length ?? 0) + (source.match(LATIN_WORD)?.length ?? 0)
}

export function stemLocateItems(entry) {
  return (Array.isArray(entry?.locationParaphrases) ? entry.locationParaphrases : [])
    .filter(item => item?.sourceRole === 'stem' && item?.relationType === 'locationCue')
}

export function hasReadingLocate(entry) {
  return entry != null && Object.hasOwn(entry, 'locateBy')
}

// Whole-word search, so the cue "it" is not found inside "lit".
function findWord(haystack, needle, { ignoreCase = false } = {}) {
  // A no-break space in the passage still matches a plain space in the stem.
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&').replace(/\s+/gu, '\\s+')
  const match = new RegExp(`(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`, ignoreCase ? 'iu' : 'u').exec(haystack)
  return match ? { index: match.index, text: match[0] } : null
}

// Two guards on a stem 定位, checked when the caller passes the option texts.
// A chart answer: the correct option states a number the passage text never
// writes, and answerText gives no number of its own, so the answer is read off
// a chart or worked out, and a 定位句 would point at the wrong place. A bridge
// toward a distractor: bridgeZh echoes an English word that only a wrong
// option uses, which steers the student to that option.
const NUMBER = /\d[\d,.]*\d|\d/gu
const NUMBER_WORD = /\b(?:half|thirds?|quarters?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|hundred|thousand|million|billion|twice|double|triple|dozen|percent)\b/iu
const STOPWORDS = new Set(('a an the of to in on at for and or but is are was were be been it its they them their he she his her '
  + 'this that these those with by from as not no do does did can could will would should have has had i we you our your my me '
  + 'us so than then there here what which who why how when where also just very more most less much many some any all one').split(' '))
const contentWords = value => new Set((plain(String(value ?? '')).toLowerCase().match(/[a-z][a-z’'-]*/gu) ?? [])
  .filter(word => !STOPWORDS.has(word)))

function chartAnswer({ correctText, paragraphs, answerText, stemText }) {
  const passage = [...paragraphs.values()].filter(value => typeof value === 'string').map(plain).join('\n')
  const unwritten = (correctText.match(NUMBER) ?? []).some(number => !passage.includes(number))
  if (!unwritten) return false
  const ownNumber = (answerText.match(NUMBER) ?? []).some(number => !stemText.includes(number)) || NUMBER_WORD.test(answerText)
  return !ownNumber
}

function bridgeTowardDistractor({ bridge, correctText, wrongTexts, stemText }) {
  const words = contentWords(bridge)
  if (!words.size) return null
  const kept = new Set([...contentWords(correctText), ...contentWords(stemText)])
  const wrong = new Set(wrongTexts.flatMap(value => [...contentWords(value)]))
  return [...words].find(word => wrong.has(word) && !kept.has(word)) ?? null
}

// Resolve and check one question's 定位. `paragraphs` maps paragraph id to its
// text; `correctEvidence` is the correct option's evidence list. `options`
// (label to text, or a list of { label, text }) and `answer` (the correct label) are optional; with them the
// two guards above run too. Returns `{ errors, locate }`; `locate` is null
// whenever there are errors.
export function resolveReadingLocate({ entry, stem, paragraphs, correctEvidence, options, answer: answerLabel }) {
  const errors = []
  const fail = message => {
    errors.push(message)
    return { errors, locate: null }
  }
  const by = entry?.locateBy
  if (!LOCATE_BY.includes(by)) return fail('locateBy 必须是 stem、options 或 passage。')
  const items = stemLocateItems(entry)
  const find = Object.hasOwn(entry, 'locateFindZh') ? text(entry.locateFindZh) : null
  if (find !== null) {
    if (!find && by !== 'stem') return fail(`locateBy=${by} 时 findZh 不能是空的。`)
    const ids = [...find.matchAll(PARAGRAPH_TOKEN)].map(match => match[1])
    const missing = ids.find(id => typeof paragraphs.get(id) !== 'string')
    if (missing) return fail(`findZh 里的 [[${missing}]] 不是这篇的段落。`)
    if (/\[\[|\]\]/u.test(find.replace(PARAGRAPH_TOKEN, ''))) return fail('findZh 里段落只能写成 [[paragraphId]]。')
    if (/第\s*[\d一二三四五六七八九十]+\s*段/u.test(find)) return fail('findZh 里不自己数段，段落写成 [[paragraphId]]。')
    if (bridgeUnits(find.replace(PARAGRAPH_TOKEN, '第几段')) > FIND_MAX_UNITS) return fail(`findZh 不超过 ${FIND_MAX_UNITS} 字（一个英文词算一个字）。`)
    if ((find.replace(PARAGRAPH_TOKEN, ' ').match(LATIN_WORD) ?? []).length > FIND_MAX_ENGLISH_WORDS) return fail(`findZh 里英文最多 ${FIND_MAX_ENGLISH_WORDS} 个词（一个信号词），别抄原文短语。`)
  }
  if (by !== 'stem') {
    if (items.length) return fail(`locateBy=${by} 时不写题干定位项（sourceRole stem + locationCue）。`)
    return { errors, locate: { by, ...(find !== null ? { find } : {}) } }
  }
  if (items.length !== 1) return fail('locateBy=stem 时必须恰好有一项题干定位（sourceRole stem + locationCue）。')
  const [item] = items
  const sourceText = text(item.sourceText)
  const stemText = plain(String(stem ?? ''))
  if (!sourceText || !stemText.includes(sourceText)) return fail('定位词 sourceText 必须从题干原样抄。')
  const words = sourceText.match(LATIN_WORD)?.length ?? 0
  if (words < 1 || words > CUE_MAX_WORDS) return fail(`定位词 sourceText 必须是 1–${CUE_MAX_WORDS} 个英文词。`)
  if (core(sourceText).toLowerCase() === core(stemText).toLowerCase()) return fail('定位词 sourceText 不能是整句题干。')

  const paragraphId = text(item.targetParagraphId)
  const paragraph = plainParagraph(paragraphs, paragraphId)
  if (typeof paragraph !== 'string') return fail(`定位句引用了不存在的 targetParagraphId：${paragraphId || '空'}。`)
  const targetText = text(item.targetText)
  if (!targetText || !paragraph.includes(targetText)) return fail('定位句 targetText 必须精确匹配原文。')
  const sentences = passageSentences(paragraph)
  const sentenceIndex = sentences.findIndex(sentence => core(sentence.text) === core(targetText))
  if (sentenceIndex < 0) return fail('定位句 targetText 必须是原文中完整的一句。')
  const sentence = sentences[sentenceIndex]

  const targetCue = text(item.targetCue)
  const sentenceText = paragraph.slice(sentence.start, sentence.end)
  let cue
  if (targetCue) {
    if (!targetText.includes(targetCue)) return fail('targetCue 必须是定位句里的原词。')
    const cueWords = targetCue.match(LATIN_WORD)?.length ?? 0
    if (cueWords < 1 || cueWords > CUE_MAX_WORDS) return fail(`targetCue 必须是 1–${CUE_MAX_WORDS} 个英文词。`)
    cue = findWord(sentenceText, targetCue) ?? { index: sentenceText.indexOf(targetCue), text: targetCue }
  } else {
    cue = findWord(sentenceText, sourceText, { ignoreCase: true })
    if (!cue) return fail('定位词和定位句里的写法不同时，必须写 targetCue。')
  }
  const cueOffset = sentence.start + cue.index
  const cueText = cue.text

  const answerText = text(item.answerText)
  if (!answerText) return fail('必须写 answerText：正确项原文依据里答案所在的那一段原文。')
  let answer = null
  for (const evidence of Array.isArray(correctEvidence) ? correctEvidence : []) {
    const quote = text(evidence?.quote)
    const evidenceParagraph = plainParagraph(paragraphs, evidence?.paragraphId)
    if (!quote.includes(answerText) || typeof evidenceParagraph !== 'string') continue
    const quoteStart = evidenceParagraph.indexOf(quote)
    if (quoteStart < 0) continue
    const start = quoteStart + quote.indexOf(answerText)
    answer = { paragraphId: evidence.paragraphId, start, end: start + answerText.length }
    break
  }
  if (!answer) return fail('answerText 必须落在正确项已有的原文依据（evidence quote）里。')

  const same = answer.paragraphId === paragraphId && answer.start >= sentence.start && answer.end <= sentence.end
  const bridge = text(item.bridgeZh)
  if (same && bridge) return fail('答案就在定位句里，不写 bridgeZh。')
  if (!same && !bridge) return fail('答案不在定位句里，必须用 bridgeZh 写清原因。')
  if (find === '' && !same) return fail('答案不在定位句里，findZh 要写往哪走、找什么。')
  if (bridge && bridgeUnits(bridge) > BRIDGE_MAX_UNITS) return fail(`bridgeZh 不超过 ${BRIDGE_MAX_UNITS} 字（一个英文词算一个字）。`)

  const optionTexts = Array.isArray(options)
    ? Object.fromEntries(options.map(option => [option?.label, option?.text]))
    : (options && typeof options === 'object' ? options : null)
  const correctText = optionTexts && typeof optionTexts[answerLabel] === 'string' ? plain(optionTexts[answerLabel]) : null
  if (correctText != null) {
    if (chartAnswer({ correctText, paragraphs, answerText, stemText })) {
      return fail('正确项里的数字原文没写，answerText 也没有数字：答案多半在图表里或要自己算，不给定位句，locateBy 改用 options。')
    }
    const wrongTexts = Object.entries(optionTexts)
      .filter(([label, value]) => label !== answerLabel && typeof value === 'string').map(([, value]) => value)
    const echoed = bridge ? bridgeTowardDistractor({ bridge, correctText, wrongTexts, stemText }) : null
    if (echoed) return fail(`bridgeZh 里的 ${echoed} 只出现在错项里，会把学生引向干扰项，换个说法。`)
    const findEcho = find ? bridgeTowardDistractor({ bridge: find.replace(PARAGRAPH_TOKEN, ' '), correctText, wrongTexts, stemText }) : null
    if (findEcho) return fail(`findZh 里的 ${findEcho} 只出现在错项里，会把学生引向干扰项，换个说法。`)
  }

  return {
    errors,
    locate: {
      by,
      sourceText,
      paragraphId,
      sentence: { index: sentenceIndex, start: sentence.start, end: sentence.end },
      cue: { start: cueOffset, end: cueOffset + cueText.length, text: cueText },
      answer,
      same,
      bridge,
      ...(find !== null ? { find } : {}),
    },
  }
}

// 定位补全: an agent writes only `locateBy` and the stem locating item for
// questions whose analysis is already reviewed. Earlier stem locating items
// are replaced; every other byte of the analysis must stay as it was.
const LOCATE_FIELDS = ['sourceText', 'targetText', 'targetParagraphId', 'targetCue', 'answerText', 'bridgeZh', 'note']

export function withoutReadingLocate(analysis) {
  const copy = structuredClone(analysis)
  for (const entry of Object.values(copy?.questions ?? {})) {
    delete entry.locateBy
    delete entry.locateFindZh
    if (Array.isArray(entry.locationParaphrases)) {
      entry.locationParaphrases = entry.locationParaphrases
        .filter(item => !(item?.sourceRole === 'stem' && item?.relationType === 'locationCue'))
    }
  }
  return copy
}

export function mergeReadingLocate(analysis, response) {
  const merged = structuredClone(analysis)
  const answers = response?.questions
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) throw new Error('定位补全回复缺少 questions 对象。')
  for (const [questionId, answer] of Object.entries(answers)) {
    const entry = merged.questions?.[questionId]
    if (!entry) throw new Error(`定位补全回复里有不存在的题：${questionId}`)
    const unknown = Object.keys(answer ?? {}).filter(key => !['locateBy', 'locate', 'findZh'].includes(key))
    if (unknown.length) throw new Error(`${questionId}: 定位补全只写 locateBy、locate 和 findZh，多了 ${unknown.join(', ')}`)
    const extra = Object.keys(answer.locate ?? {}).filter(key => !LOCATE_FIELDS.includes(key))
    if (extra.length) throw new Error(`${questionId}: locate 里只能有 ${LOCATE_FIELDS.join(', ')}，多了 ${extra.join(', ')}`)
    const kept = (entry.locationParaphrases ?? [])
      .filter(item => !(item?.sourceRole === 'stem' && item?.relationType === 'locationCue'))
    const items = answer.locate ? [{
      sourceText: answer.locate.sourceText,
      sourceRole: 'stem',
      targetText: answer.locate.targetText,
      targetParagraphId: answer.locate.targetParagraphId,
      relationType: 'locationCue',
      ...(answer.locate.targetCue ? { targetCue: answer.locate.targetCue } : {}),
      answerText: answer.locate.answerText,
      ...(answer.locate.bridgeZh ? { bridgeZh: answer.locate.bridgeZh } : {}),
      note: answer.locate.note,
    }] : []
    entry.locateBy = answer.locateBy
    if (answer.findZh !== undefined) entry.locateFindZh = answer.findZh
    else delete entry.locateFindZh
    entry.locationParaphrases = [...items, ...kept]
  }
  if (JSON.stringify(withoutReadingLocate(merged)) !== JSON.stringify(withoutReadingLocate(analysis))) {
    throw new Error('定位补全改动了定位以外的字段。')
  }
  return merged
}
