// Existing OCR producer predicates shared with scoring admission. Keep source
// recognition identical without importing the CLI producer into the server.
// Scoring predicates share this matching view; captured source text is untouched.
export const writingRuleMatchingView = text => text.normalize('NFKC').replace(/\s+/gu, '')
// The #586 sample parser is also the authority for Version one/two/three
// (or 1–3), including its optional Chinese ordinal and whole-label boundary.
export const WRITING_SAMPLE_LABEL = /^(?:(?:[一二三四五六七八九十]+[、.．]\s*|\(\s*[一二三四五六七八九十]+\s*\)\s*))?(?:(?:(?:A|One)\s+)?Possible\s+Version(?:\s+\d+)?|Version\s+(?<version>one|two|three|[1-3])|(?:【)?(?:参考范文|范文|参考作文|写作样例|作答示例)(?:\s*[一二三1-3])?(?:】)?)\s*[:：]?$/iu
export const isWritingVersionLabel = text =>
  Boolean(WRITING_SAMPLE_LABEL.exec(text.normalize('NFKC').trim())?.groups?.version)
// Answer keys may number writing as the third part when listening is absent.
export const WRITING_PART = /^第[三四]部分\s*[:：]?\s*写作/u
// Answer-first keys may name the task without a writing-part or section number.
export const BARE_APPLICATION_SECTION = /^应用文\s*[:：]?$/u
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
export const NON_WRITING_SECTION = /^(?:第[一二三四五六七八九十\d]+(?:部分|节)|\([一二三四五六七八九十\d]+\)|[一二三四五六七八九十\d]+[、.])\s*[:：]?\s*\(?\s*(?:阅读(?:理解)?|七选五|完形填空|语法填空|语言(?:知识)?运用|短文改错|词汇运用|听力(?:理解)?)\s*\)?(?:\s*\([^)]*\))*\s*[:：]?$/u
export const NUMBERED_ENTRY_LABEL = /^[1-9]\d?\.\s*(?:参考范文|考场作文|作答示例|参考答案|范文|(?:(?:A|One)\s+)?Possible\s+Version|评分(?:原则|标准|说明|细则|要求|建议))[:：]?$/iu
// Match complete rubric titles only; parentheses are a numbering style, not
// permission to treat ordinary scoring commentary as a new entry.
export const SCORING_ENTRY_LABEL = /^(?:(?:[一二三四五六七八九十]+、|\(\s*[一二三四五六七八九十]+\s*\))\s*)?(?:评分(?:原则|标准|说明|细则|要求|建议)|各档次给分范围(?:和|及)要求)\s*[:：]?$/u
// Reading explanations can start directly after samples, without a part title.
export const ANSWER_EXPLANATION_START = /^(?:【(?:解题导语|语篇导读|语篇解读)】|答案详解|参考答案详解|试题解析|答案解析|(?:2[1-9]|[3-5]\d|6[0-5])\s*[.．、]\s*[A-G]\s*\p{Script=Han})/u
