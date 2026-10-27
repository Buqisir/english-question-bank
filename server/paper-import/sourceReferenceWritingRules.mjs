// Existing OCR producer predicates shared with scoring admission. Keep source
// recognition identical without importing the CLI producer into the server.
// Scoring predicates share this matching view; captured source text is untouched.
import { OCR_SOURCE_REFERENCES_PRODUCER_VERSION, LEGACY_OCR_SOURCE_REFERENCES_PRODUCER_VERSION,
  usesExplicitWritingTitles } from './sourceReferenceSemantics.mjs'
export const writingRuleMatchingView = text => text.normalize('NFKC').replace(/\s+/gu, '')
export const SOURCE_REFERENCE_ANSWER_ROLES = Object.freeze(['official_answers', 'question_and_answers'])
// The #586 sample parser is also the authority for Version one/two/three
// (or 1–3), including its optional Chinese ordinal and whole-label boundary.
export const WRITING_SAMPLE_LABEL = /^(?:(?:[一二三四五六七八九十]+[、.．]\s*|\(\s*[一二三四五六七八九十]+\s*\)\s*))?(?:(?:(?:A|One)\s+)?Possible\s+Version(?:\s+\d+)?|Version\s+(?<version>one|two|three|[1-3])|(?:【)?(?:参考范文|范文|参考作文|写作样例|作答示例)(?:\s*[一二三1-3])?(?:】)?)\s*[:：]?$/iu
export const isWritingVersionLabel = text =>
  Boolean(WRITING_SAMPLE_LABEL.exec(text.normalize('NFKC').trim())?.groups?.version)
// These are the producer's entry-label and entry-kind predicates. Keep their
// complete-label boundaries shared with admission and scoring ownership.
export const ENTRY_LABEL = /^(?:[一二三四五六七八九十]+、\s*)?(参考范文|考场作文|作答示例\s*|参考答案|范文|(?:(?:A|One)\s+)?Possible\s+Versions?|评分(?:原则|标准|说明|细则|要求|建议)|【[^】]+】|\[[^\]]+\])[:：]?$/iu
export const WORD_COUNT_SAMPLE_LABEL = /^参考范文(?:[一二三四五六七八九十]+)?\s*(?:（\s*\d+\s*词\s*）|\(\s*\d+\s*词\s*\))[:：]?$/u
export const NUMBERED_SAMPLE_LABEL = /^范文\s*(?:[一二三四五六七八九十]+|\d+)\s*(?:（\s*\d+\s*词\s*）|\(\s*\d+\s*词\s*\))?[:：]?$/u
export const EXAMPLE_SAMPLE_LABEL = /^【示例[一二三四五六七八九十]+】(?:\s*[:：]?\s*\p{Script=Han}[^\r\n]*)?$/u
export const PARENTHESIZED_SAMPLE_LABEL = /^[（(](?:(?:A|One)\s+)?Possible\s+Version[）)]$/iu
export const NUMBERED_VERSION_SAMPLE_LABEL = /^(?:(?:A|One)\s+)?Possible\s+Version\s*\d+[:：]?$/iu
export const SCORING_LABEL = /阅卷|评分|评卷|给分|档次/u
const ESSAY_LABEL = /范文|例文|范例|答案|考场作文|作答示例|Possible\s+Version|【示例[一二三四五六七八九十]+】/iu
// Brackets classify an entry candidate, not its authority as a sample. Only
// known complete sample titles may supply essays; never strip arbitrary brackets.
const BRACKETED_SAMPLE_TITLE = [
  String.raw`(?:参考范文|考场作文|作答示例|参考答案|范文|参考作文|写作样例|例文|范例)(?:\s*(?:[一二三四五六七八九十]+|\d+))?|(?:(?:A|One)\s+)?Possible\s+Versions?(?:\s*\d+)?`,
  // Embed the existing complete numbered/word-count grammars within the outer
  // bracket boundary, removing only their start/end anchors.
  WORD_COUNT_SAMPLE_LABEL.source.slice(1, -1),
  NUMBERED_SAMPLE_LABEL.source.slice(1, -1),
].join('|')
const BRACKETED_SAMPLE_LABEL = new RegExp(
  String.raw`^(?:[一二三四五六七八九十]+、\s*)?(?:【(?:${BRACKETED_SAMPLE_TITLE})】|\[(?:${BRACKETED_SAMPLE_TITLE})\])[:：]?$`, 'iu')
export function isSourceReferenceSampleLabel(text, producerVersion = OCR_SOURCE_REFERENCES_PRODUCER_VERSION) {
  if (producerVersion !== LEGACY_OCR_SOURCE_REFERENCES_PRODUCER_VERSION && /[【\[]/u.test(text)
    && !BRACKETED_SAMPLE_LABEL.test(text) && !EXAMPLE_SAMPLE_LABEL.test(text)) return false
  const version = isWritingVersionLabel(text)
  const complete = ENTRY_LABEL.test(text) || WORD_COUNT_SAMPLE_LABEL.test(text)
    || NUMBERED_SAMPLE_LABEL.test(text) || EXAMPLE_SAMPLE_LABEL.test(text)
    || PARENTHESIZED_SAMPLE_LABEL.test(text) || NUMBERED_VERSION_SAMPLE_LABEL.test(text)
    || NUMBERED_ENTRY_LABEL.test(text.normalize('NFKC')) || version
  return complete && !SCORING_LABEL.test(writingRuleMatchingView(text)) && (ESSAY_LABEL.test(text) || version)
}
// Answer keys may number writing as the third part when listening is absent.
export const WRITING_PART = /^第[三四]部分\s*[:：]?\s*写作/u
// Answer-first keys may name the task without a writing-part or section number.
export const BARE_APPLICATION_SECTION = /^(?:应用文|书面表达)\s*[:：]?$/u
// These are the existing producer's bare/combined section predicates.
export const BARE_WRITING_SECTION = /^第([一二])节\s*(?:\(满分\s*\d+\s*分\))?\s*[:：]?$/u
export const INLINE_WRITING_SAMPLE = /^(第[一二]节\s*(?:[（(]满分\s*\d+\s*分[）)])?)(?:\s+|(?<=[）)]))(作答示例[:：]?|[（(](?:(?:A|One)\s+)?Possible\s+Version[）)])$/iu
export const INLINE_WRITING_ANSWER_SAMPLE = /^(第[一二]节)\s*[:：]?\s*(作答示例\s*[:：]?)$/u
export const WRITING_SECTION = [
  ['application', /^第[一二]节\s*[:：]?\s*(?:[（(]\s*(?:应用文|书面表达)\s*[）)]|应用文|书面表达)/u],
  ['continuation', /^第[一二]节\s*[:：]?\s*(?:[（(]\s*(?:读后续写|续写)\s*[）)]|读后续写|续写)/u],
]
// Numbering varies between answer books. Only the explicit task word gives
// these fully anchored headings their scope; NFKC is a matching view only.
export const NUMBERED_APPLICATION_SECTION = /^(?:\(\s*(?:[一二三四五六七八九十]+|[1-9]\d?)\s*\)|[1-9]\d?\.)\s*应用文(?:写作)?\s*(?:\(\s*满分\s*\d+\s*分\s*\))?\s*[:：]?$/u
export const NUMBERED_CONTINUATION_SECTION = /^(?:\(\s*(?:[一二三四五六七八九十]+|[1-9]\d?)\s*\)|[1-9]\d?\.)\s*读后续写\s*(?:\(\s*满分\s*\d+\s*分\s*\))?\s*[:：]?$/u
export const WRITING_SCORING_SECTION = [
  ['application', /^(?:(?:[（(]\s*[一二三四五六七八九十]+\s*[）)]|[一二三四五六七八九十]+、)\s*)?(?:应用文(?:写作)?评分(?:细则|(?:参考)?标准)|应用文各档次的给分范围和要求)\s*[:：]?$/u],
  ['continuation', /^(?:(?:[（(]\s*[一二三四五六七八九十]+\s*[）)]|[一二三四五六七八九十]+、)\s*)?(?:(?:读后)?续写评分(?:细则|(?:参考)?标准)|读后续写各档次的给分范围和要求)\s*[:：]?$/u],
]
// A transcript may precede a separate rubric appendix. Only its complete
// source heading allows leaving listening; task and entry labels are still required.
export const WRITING_SCORING_OVERVIEW = /^(?:写作评分说明|写作评分标准|评分细则)\s*[:：]?$/u
// Explanations reopen only for an adjacent overview + fully named task rubric,
// or the exact NCK1 section/score + rubric-label pair below.
export function isExplicitScoringAppendixStart(text, nextText = '') {
  return Boolean(scoredWritingRubricTask(text, nextText))
    || (WRITING_SCORING_OVERVIEW.test(writingRuleMatchingView(text))
      && WRITING_SCORING_SECTION.some(([, pattern]) => pattern.test(writingRuleMatchingView(nextText))))
}
// NCK1's bare rubric headings identify a task only with its exact section/score
// pair AND an adjacent complete rubric label. A bare section or prose mentioning
// scoring cannot reopen explanations; do not recapture the reprinted samples.
export function scoredWritingRubricTask(text, nextText = '') {
  if (!SCORING_ENTRY_LABEL.test(writingRuleMatchingView(nextText))) return null
  const heading = writingRuleMatchingView(text)
  return /^第一节\(满分15分\)[:：]?$/u.test(heading) ? 'application'
    : /^第二节\(满分25分\)[:：]?$/u.test(heading) ? 'continuation' : null
}
export const LISTENING_REFERENCE_START = /^(?:(?:附\s*[:：]?\s*)?听力|录音原文|\(?Text\s*\d)/iu
// Numbered headings for other exam tasks end writing ownership, including
// parenthesized titles and optional source score/count annotations.
const OBJECTIVE_SECTION_NAMES = '阅读(?:理解)?|七选五|完形填空|语法填空|语言(?:知识)?运用|短文改错|词汇运用|听力(?:理解)?'
export const NON_WRITING_SECTION = new RegExp(
  String.raw`^(?:第[一二三四五六七八九十\d]+(?:部分|节)|\([一二三四五六七八九十\d]+\)|[一二三四五六七八九十\d]+[、.])\s*[:：]?\s*\(?\s*(?:${OBJECTIVE_SECTION_NAMES})\s*\)?(?:\s*\([^)]*\))*\s*[:：]?$`, 'u')
export const OBJECTIVE_ANSWER_FIGURE_MARKER = new RegExp(`^(?:${OBJECTIVE_SECTION_NAMES}|完形|[A-G])$`, 'u')
export const NUMBERED_ENTRY_LABEL = /^[1-9]\d?\.\s*(?:参考范文|考场作文|作答示例|参考答案|范文|(?:(?:A|One)\s+)?Possible\s+Version|评分(?:原则|标准|说明|细则|要求|建议))[:：]?$/iu
// Match complete rubric titles only; parentheses are a numbering style, not
// permission to treat ordinary scoring commentary as a new entry.
export const SCORING_ENTRY_LABEL = /^(?:(?:[一二三四五六七八九十]+、|\(\s*[一二三四五六七八九十]+\s*\))\s*)?(?:评分(?:原则|标准|说明|细则|要求|建议)|各档次给分范围(?:和|及)要求)\s*[:：]?$/u
// Reading explanations can start directly after samples, without a part title.
export const ANSWER_EXPLANATION_START = /^(?:【(?:解题导语|语篇导读|语篇解读)】|答案详解|参考答案详解|试题解析|答案解析|(?:2[1-9]|[3-5]\d|6[0-5])\s*[.．、]\s*[A-G]\s*\p{Script=Han})/u
// New bare/bracketed dividers require the whole heading. NFKC and trimming
// are matching-only; preserve source text and the existing prefix rules.
const ANSWER_EXPLANATION_HEADING = /^(?:解析|答案解析|【解析】|【答案解析】)[:：]?$/u
export const isSourceReferenceExplanationStart = (text, producerVersion = OCR_SOURCE_REFERENCES_PRODUCER_VERSION) =>
  ANSWER_EXPLANATION_START.test(text)
    || (producerVersion !== LEGACY_OCR_SOURCE_REFERENCES_PRODUCER_VERSION
      && ANSWER_EXPLANATION_HEADING.test(text.normalize('NFKC').trim()))

// v19 additions are whole source headings, never substring/score inference.
// Original item bytes and geometry remain the capture/admission authority.
export function explicitWritingHeading(text, producerVersion = OCR_SOURCE_REFERENCES_PRODUCER_VERSION) {
  if (!usesExplicitWritingTitles(producerVersion)) return null
  const view = text.normalize('NFKC').trim()
  const task = /^(应用文(?:写作)?|书面表达|读后续写)(?:\s*\(满分(15|25)分\))?\s*[:：]?$/u.exec(view)
  if (task) {
    const taskType = task[1] === '读后续写' ? 'continuation' : 'application'
    if (task[2] && task[2] !== (taskType === 'application' ? '15' : '25')) return null
    return { taskType, sample: false, omission: false }
  }
  const sample = /^(应用文|读后续写)参考范文\s*[:：]?$/u.exec(view)
  if (sample) return { taskType: sample[1] === '应用文' ? 'application' : 'continuation', sample: true, omission: false }
  if (/^66\.\s*应用文参考例文\s*[:：]?$/u.test(view)) {
    return { taskType: 'application', sample: true, omission: false }
  }
  if (/^67\.\s*读后续写参考例文(?:\s*\(文章来源 Chicken soup for the teenage soul\))?\s*[:：]?$/u.test(view)) {
    return { taskType: 'continuation', sample: true, omission: false }
  }
  const omission = /^(第一节\s*应用文写作|第二节\s*读后续写)\s*\(范文略\)\s*[:：]?$/u.exec(view)
  return omission ? { taskType: omission[1].startsWith('第一节') ? 'application' : 'continuation',
    sample: false, omission: true } : null
}

export const applicationStanceLabel = (text, taskType) => taskType === 'application'
  && /^范文(?:一[:：]支持立场|二[:：]反对立场)[:：]?$/u.test(text.normalize('NFKC').trim())
export const continuationScoringLabel = (text, taskType) => taskType === 'continuation'
  && /^2\.\s*评分参考\s*[:：]?$/u.test(text.normalize('NFKC').trim())
export const continuationThoughtHeading = text => /^1\.\s*续写思路\s*[:：]?$/u.test(text.normalize('NFKC').trim())
export const applicationScoringPoint = text => {
  const match = /^([1-4])\.\s*(内容要点|语言|阅卷原则|阅卷标准)\s*[:：]/u.exec(text.normalize('NFKC').trim())
  return match && ['内容要点', '语言', '阅卷原则', '阅卷标准'][Number(match[1]) - 1] === match[2]
    ? Number(match[1]) : null
}
// A closed Chinese gloss requires actual English outside the brackets. Merely
// containing AI, a Latin quote or a letter inside a Chinese note proves nothing.
export const verifiedParenthesizedEnglish = text => {
  const body = /^[（(][^（）()\r\n]+[）)]\s*([\p{Script=Latin}“"'‘][^\r\n]*)$/u.exec(text.trim())?.[1]
  return Boolean(body && /\p{Script=Latin}/u.test(body) && !/\p{Script=Han}/u.test(body))
}

export const isWritingTranscriptTitle = (text, producerVersion = OCR_SOURCE_REFERENCES_PRODUCER_VERSION) =>
  usesExplicitWritingTitles(producerVersion)
    && /^(?:高三英语试题听力录音稿|2026届高中毕业班适应性练习英语听力部分录音稿)$/u.test(text.normalize('NFKC').trim())
export function isCompleteWritingTranscriptHeading(text, nextText, producerVersion = OCR_SOURCE_REFERENCES_PRODUCER_VERSION) {
  return isWritingTranscriptTitle(text, producerVersion)
    && /^\(?Text\s*1\)?\s*[:：.．]?$/iu.test(nextText?.normalize('NFKC').trim() || '')
}
