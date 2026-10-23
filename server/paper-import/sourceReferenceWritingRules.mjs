// Existing OCR producer predicates shared with scoring admission. Keep source
// recognition identical without importing the CLI producer into the server.
// Answer keys may number writing as the third part when listening is absent.
export const WRITING_PART = /^第[三四]部分\s*[:：]?\s*写作/u
export const WRITING_SECTION = [
  ['application', /^第[一二]节\s*[:：]?\s*(?:[（(]\s*(?:应用文|书面表达)\s*[）)]|应用文|书面表达)/u],
  ['continuation', /^第[一二]节\s*[:：]?\s*(?:[（(]\s*(?:读后续写|续写)\s*[）)]|读后续写|续写)/u],
]
// Reading explanations can start directly after samples, without a part title.
export const ANSWER_EXPLANATION_START = /^(?:【(?:解题导语|语篇导读|语篇解读)】|答案详解|参考答案详解|试题解析|答案解析|(?:2[1-9]|[3-5]\d|6[0-5])\s*[.．、]\s*[A-G]\s*\p{Script=Han})/u
