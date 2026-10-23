// Pure line-role candidates. Priorities are local to a phase; lower runs first.
// Rules recognize candidates only: callers retain state transitions and output assembly.
import { computeLineFacts } from './ocr-line-facts.mjs'

const FOOTER = /第\s*\d+\s*页|共\s*\d+\s*页/u
const TRANSCRIPT_MARKER = /^\(?Text\s*\d{1,2}\)?\s*[:：.．]?(?=\s|$|[（(])/iu
const TRANSCRIPT_END = /^(?:第[一二三四五六]部分|参考|写作|阅读|语言|[一二三四五六]、)/u
const SPEAKER_LABEL = /^\(?[A-Z][A-Za-z]{0,15}(?:\.?\s[A-Z][A-Za-z]{0,15})?\)?\s*[:：]/u

const WRITING_SECTION = [
  ['application', /^第[一二]节\s*[:：]?\s*(?:[（(]\s*(?:应用文|书面表达)\s*[）)]|应用文|书面表达)/u],
  ['continuation', /^第[一二]节\s*[:：]?\s*(?:[（(]\s*(?:读后续写|续写)\s*[）)]|读后续写|续写)/u],
]
// Numbering varies between answer books. Only the explicit task word gives
// these fully anchored headings their scope; NFKC is a matching view only.
const NUMBERED_APPLICATION_SECTION = /^\(\s*(?:[一二三四五六七八九十]+|[1-9]\d?)\s*\)\s*应用文(?:写作)?\s*(?:\(\s*满分\s*\d+\s*分\s*\))?\s*[:：]?$/u
const NUMBERED_CONTINUATION_SECTION = /^\(\s*(?:[一二三四五六七八九十]+|[1-9]\d?)\s*\)\s*读后续写\s*(?:\(\s*满分\s*\d+\s*分\s*\))?\s*[:：]?$/u
const WRITING_SCORING_SECTION = [
  ['application', /^应用文评分细则\s*[:：]?$/u],
  ['continuation', /^读后续写评分细则\s*[:：]?$/u],
]
// Answer keys may number writing as the third part when listening is absent.
// Some keys head the samples only with "第一节（满分15分）".
const WRITING_PART = /^第[三四]部分\s*[:：]?\s*写作/u
const BARE_WRITING_SECTION = /^第([一二])节\s*(?:\(满分\s*\d+\s*分\))?\s*[:：]?$/u
// Some keys start their reading explanations immediately after the samples,
// without another "第…部分" heading. That divider ends the key's writing scope.
const ANSWER_EXPLANATION_START = /^(?:【(?:解题导语|语篇导读|语篇解读)】|答案详解|参考答案详解|试题解析|答案解析|(?:2[1-9]|[3-5]\d|6[0-5])\s*[.．、]\s*[A-G]\s*\p{Script=Han})/u

const ENTRY_LABEL = /^(?:[一二三四五六七八九十]+、\s*)?(参考范文|考场作文|作答示例\s*|参考答案|范文|(?:(?:A|One)\s+)?Possible\s+Version|评分(?:原则|标准|说明|细则|要求|建议)|【[^】]+】|\[[^\]]+\])[:：]?$/iu
const NUMBERED_ENTRY_LABEL = /^[1-9]\d?\.\s*(?:参考范文|考场作文|作答示例|参考答案|范文|(?:(?:A|One)\s+)?Possible\s+Version|评分(?:原则|标准|说明|细则|要求|建议))[:：]?$/iu
const WORD_COUNT_SAMPLE_LABEL = /^参考范文(?:[一二三四五六七八九十]+)?\s*(?:（\s*\d+\s*词\s*）|\(\s*\d+\s*词\s*\))[:：]?$/u
const NUMBERED_SAMPLE_LABEL = /^范文\s*(?:[一二三四五六七八九十]+|\d+)\s*(?:（\s*\d+\s*词\s*）|\(\s*\d+\s*词\s*\))?[:：]?$/u
const EXAMPLE_SAMPLE_LABEL = /^【示例[一二三四五六七八九十]+】(?:\s*[:：]?\s*\p{Script=Han}[^\r\n]*)?$/u
const PARENTHESIZED_SAMPLE_LABEL = /^[（(](?:(?:A|One)\s+)?Possible\s+Version[）)]$/iu
const SCORING_LABEL = /阅卷|评分|评卷|给分|档次/u
const ESSAY_LABEL = /范文|例文|范例|答案|考场作文|作答示例|Possible\s+Version|【示例[一二三四五六七八九十]+】/iu
// The key's own teaching commentary (【审题重点】, 主题语境：…) is neither a source sample nor scoring.
const COMMENTARY_LINE = /^(?:\p{Script=Han}|[（(]\s*[一二三四五六七八九十]+\s*[）)]\s*\p{Script=Han}|\d+\s*[.．、]\s*\p{Script=Han})/u
const STUDENT_SCRIPT_BOUNDARY = /^[（(]\s*[一二三四五六七八九十]+\s*[）)]\s*样卷\s*[:：]?$/u
const VERSION_LABEL = /^(Possible Version|Version|范文)\s*\d+[:：]?$/iu
const SALUTATION = /^Dear\s.+,$/u
const CLOSING = /^(Yours|Best wishes|Best regards|Sincerely|Yours sincerely|Love)[^.]{0,20},$/iu

// Examples are short source/fixture excerpts from ocr-proofread.test.mjs and
// the frozen BUB-85 corpus. Context is explicit so the same text can have
// different candidates without changing the source. Geometry-only examples
// use those fixture coordinates. No whole passages belong in this table.
const fixture = value => typeof value === 'string' ? { text: value } : value
function rule(id, phase, priority, match, example, counterExample, extra = {}) {
  return Object.freeze({ id, phase, priority, match,
    examples: Object.freeze([fixture(example)]),
    counterExamples: Object.freeze([fixture(counterExample)]), ...extra })
}
const pattern = (id, phase, priority, regex, example, counterExample, extra) =>
  rule(id, phase, priority, f => regex.test(f.text), example, counterExample,
    { capture: text => text.match(regex),
      scan: text => text.matchAll(new RegExp(regex.source, `${regex.flags}g`)), ...extra })
const edge = { y: 0.04, height: 0.02 }
const boundary = { previous: { role: 'body', right: 0.81, page: 1 }, margin: { left: 0.1, right: 0.9 } }

export const LINE_ROLE_RULES = Object.freeze([
  rule('worksheet.footer', 'worksheet', 10, (f, c) =>
    (c.index >= c.lineCount - 2 && FOOTER.test(f.text))
      || (c.index === c.lineCount - 1 && /页/u.test(f.text) && f.wordCount <= 12),
  { text: '英语参考答案 第2页（共5页）', context: { index: 3, lineCount: 4 } },
  { text: '英语参考答案 第2页（共5页）', context: { index: 0, lineCount: 4 } }),
  pattern('worksheet.watermark', 'watermark', 10,
    /微\s*信\s*公\s*众\s*号\s*(?:I\s*A\s*[Il1|]\s*)?(?:English)?/u,
    '微信公众号', '英语参考答案'),

  pattern('transcript.marker', 'transcript-state', 10, TRANSCRIPT_MARKER, 'Text 2（推断题）', '21. A separate question.'),
  pattern('transcript.end', 'transcript-state', 20, TRANSCRIPT_END, '参考范文', 'Text 10'),
  pattern('transcript.speaker', 'speaker', 10, SPEAKER_LABEL, 'M: This laptop also has a', 'touchscreen for everyday use'),
  rule('transcript.note-start', 'note-start', 10, (f, c) =>
    c.inTranscript && /^★\s*\p{Script=Han}/u.test(f.text),
  { text: '★ 另一条注释。', context: { inTranscript: true } },
  { text: '另一条注释。', context: { inTranscript: true } }),
  rule('transcript.numeric-continuation', 'numeric-continuation', 10, (f, c) =>
    c.previousSpeech && c.previousFacts.endsThousandsPrefix && /^\d{3}(?:\b|[-‐])/u.test(f.trimmed),
  { text: '500-acre reserve and a', context: { previousSpeech: true, previousFacts: { endsThousandsPrefix: true } } },
  { text: '21. A separate question.', context: { previousSpeech: true, previousFacts: { endsThousandsPrefix: true } } }),
  rule('transcript.speech', 'speech', 10, (f, c) =>
    c.inTranscript && f.trimmed && f.trimmed === f.text
      && !TRANSCRIPT_MARKER.test(f.trimmed)
      && (/^(?:[A-Za-z("'“‘]|\(\d+\))/u.test(f.trimmed) || c.numericContinuation) && !f.figure,
  { text: 'M: Learn by connecting', context: { inTranscript: true } },
  { text: '21. A separate question.', context: { inTranscript: true } }),
  rule('transcript.note', 'note', 10, (f, c) =>
    c.inTranscript && !f.figure && (c.noteStart || (c.previousNote && /^\p{Script=Han}/u.test(f.trimmed))),
  { text: '拉底河与底格里斯河）。', context: { inTranscript: true, previousNote: true } },
  { text: 'Text 10', context: { inTranscript: true, previousNote: true } }),
  rule('transcript.note-continuation', 'note-continuation', 10, (_f, c) =>
    c.note && c.previousNote && !c.noteStart && !c.previousFacts.endsHanSentence,
  { text: '拉底河与底格里斯河）。', context: { note: true, previousNote: true, previousFacts: { endsHanSentence: false } } },
  { text: '★ 另一条注释。', context: { note: true, previousNote: true, noteStart: true } }),
  rule('transcript.turn-continuation', 'turn-continuation', 10, (f, c) =>
    (c.speech && c.previousSpeech && !SPEAKER_LABEL.test(f.trimmed)) || c.noteContinuation,
  { text: 'and these continue that turn', context: { speech: true, previousSpeech: true } },
  { text: 'W: These are other words', context: { speech: true, previousSpeech: true } }),
  rule('transcript.note-bullet', 'note-bullet', 10, (f, c) => c.noteContinuation && /^★\s/u.test(f.text),
    { text: '★ 另一条注释。', context: { noteContinuation: true } },
    { text: '另一条注释。', context: { noteContinuation: true } }),
  rule('transcript.hanging', 'hanging', 10, (f, c) =>
    (SPEAKER_LABEL.test(f.text) || c.noteBullet) && c.singlePhysicalLine,
  { text: 'M: This laptop also has a', context: { singlePhysicalLine: true } },
  { text: 'M: This laptop also has a', context: { singlePhysicalLine: false } }),
  rule('transcript.split-colon', 'split-colon', 10, (f, c) => c.hanging && /^[:：;；]$/u.test(f.text),
    { text: ';', context: { hanging: true } }, { text: 'M', context: { hanging: true } }),
  rule('transcript.wrap', 'wrap', 10, (f, c) =>
    !(f.box.left > c.speechLeft + c.last.height * 0.35)
      && f.box.top >= c.last.top && f.box.top - c.last.top <= c.last.height * 3
      && c.last.right + c.last.height * 0.5 + f.firstWordWidth > c.columnRight,
  { text: 'and these continue that turn', words: [{ box: { left: 28, top: 30, width: 90, height: 10 } }],
    context: { speechLeft: 28, last: { top: 15, right: 100, height: 10 }, columnRight: 100 } },
  { text: 'A new paragraph starts here', words: [{ box: { left: 40, top: 30, width: 90, height: 10 } }],
    context: { speechLeft: 28, last: { top: 15, right: 100, height: 10 }, columnRight: 100 } }),

  pattern('presentation.example', 'presentation', 10, /^例[：:]/u, '例：', 'Text 1'),
  pattern('direction.listening-long', 'direction', 10, /^听下面\d+段对话或独白/u,
    '听下面5段对话或独白', '听下面5段对话。', { value: 'listening.long-form' }),
  pattern('direction.listening-short', 'direction', 20, /^听下面\d+段对话。/u,
    '听下面5段对话。', '听下面5段对话或独白', { value: 'listening.short-dialogue' }),
  pattern('direction.seven-choices', 'direction', 30, /多余选项/u,
    '有两项为多余选项', '括号内单词的正确形式', { value: 'seven-choices' }),
  pattern('direction.cloze', 'direction', 40, /选出可以填入空白处/u,
    '选出可以填入空白处的最佳选项', '有两项为多余选项', { value: 'cloze' }),
  pattern('direction.grammar-fill', 'direction', 50, /括号内单词的正确形式/u,
    '括号内单词的正确形式', '选出可以填入空白处的最佳选项', { value: 'grammar-fill' }),
  pattern('direction.reading', 'direction', 60, /^阅读下列短文，从每题所给的/u,
    '阅读下列短文，从每题所给的', '括号内单词的正确形式', { value: 'reading.a' }),

  rule('furniture.repeated-title', 'furniture', 10, (f, c) =>
    f.furnitureEdge && c.repeated && f.text.length <= 100 && /考试|高三|模拟|联考|试卷/u.test(f.text),
  { text: '浙江省六校高三模拟考试', region: edge, context: { repeated: true } },
  { text: 'A small flame of kindness.', region: edge, context: { repeated: true } }),
  rule('furniture.chinese-counter', 'furniture', 20, f => f.furnitureEdge && FOOTER.test(f.text),
    { text: '英语参考答案 第2页（共5页）', region: edge }, { text: 'Possible Version', region: edge }),
  rule('furniture.english-counter', 'furniture', 30, f =>
    f.furnitureEdge && /\bPage\s+\d+(?:\s+of\s+\d+)?\b/iu.test(f.text),
  { text: 'English Answer Key Page 2 of 5', region: edge },
  { text: 'English Answer Key Page 2 of 5', region: { y: 0.4, height: 0.02 } }),
  rule('furniture.chinese-key', 'furniture', 40, f => f.furnitureEdge
    && /^[\p{Script=Han}\d\s（）()·—\-：:]{0,80}英语\s*(?:试题)?\s*(?:参考)?\s*答案/u.test(f.text),
  { text: '高三英语参考答案', region: edge }, { text: 'Possible Version', region: edge }),
  rule('furniture.english-key', 'furniture', 50, f => f.furnitureEdge
    && /^English\s+(?:Reference\s+)?Answer\s*Key/iu.test(f.text),
  { text: 'English Answer Key Page 2 of 5', region: edge },
  { text: 'English was my favorite subject.', region: edge }),

  pattern('entry.general', 'entry-label', 10, ENTRY_LABEL, '一、参考范文：', '范文分析'),
  pattern('entry.word-count', 'entry-label', 20, WORD_COUNT_SAMPLE_LABEL, '参考范文一（92词）', '参考范文四（很多词）'),
  pattern('entry.numbered', 'entry-label', 30, NUMBERED_SAMPLE_LABEL, '范文一（83词）：', '范文分析'),
  pattern('entry.example', 'entry-label', 40, EXAMPLE_SAMPLE_LABEL, '【示例二】建议调整活动安排', '【示例一】An English sentence follows.'),
  pattern('entry.parenthesized', 'entry-label', 50, PARENTHESIZED_SAMPLE_LABEL, '(One possible version)', 'One possible version:'),
  pattern('entry.version', 'entry-label', 60, /^(?:(?:A|One)\s+)?Possible\s+Version\s*\d+[:：]?$/iu,
    'Possible Version 2', 'Possible Version 2 describes a design.'),
  rule('entry.arabic-numbered', 'entry-label', 70, f => NUMBERED_ENTRY_LABEL.test(f.nfkc),
    '4. 评分细则', '4. 评分时应考虑内容。'),
  pattern('entry.scoring-kind', 'entry-kind', 10, SCORING_LABEL, '二、评分原则', '参考范文', { value: 'scoring' }),
  pattern('entry.essay-kind', 'entry-kind', 20, ESSAY_LABEL, '参考范文', '二、评分原则', { value: 'essays' }),
  rule('entry.sample-label', 'sample-label', 10, f =>
    Boolean(firstLineRole('entry-label', f)) && ESSAY_LABEL.test(f.text),
  '参考范文（80词）', '二、评分原则'),
  pattern('writing.inline-sample', 'inline-sample', 10,
    /^(第[一二]节\s*(?:[（(]满分\s*\d+\s*分[）)])?)\s+(作答示例[:：]?|[（(](?:(?:A|One)\s+)?Possible\s+Version[）)])$/iu,
    '第一节（满分15分） (One possible version)', '第一节（阅读理解） (One possible version)'),
  // Only 作答示例 accepts the producer's optional colon/space separator.
  // Possible Version retains its existing whitespace and parentheses rule.
  pattern('writing.inline-answer-sample', 'inline-sample', 20,
    /^(第[一二]节)\s*[:：]?\s*(作答示例\s*[:：]?)$/u,
    '第一节：作答示例', '第一节：作答示例说明如下。'),
  pattern('writing.repeated-heading', 'repeated-heading', 10, /^写作\s*[:：]?$/u, '写作', '第四部分 写作'),
  pattern('writing.part', 'writing-part', 10, WRITING_PART, '第四部分 写作', '第三部分 语言知识运用'),
  pattern('writing.bare-section', 'bare-section', 10, BARE_WRITING_SECTION, '第一节', '第一节（阅读理解）'),
  pattern('writing.application', 'writing-section', 10, WRITING_SECTION[0][1], '第一节（应用文）', '第一节（阅读理解）', { value: 'application' }),
  pattern('writing.continuation', 'writing-section', 20, WRITING_SECTION[1][1], '第二节 读后续写', '第二节(语法填空)', { value: 'continuation' }),
  rule('writing.numbered-application', 'writing-section', 30, f => NUMBERED_APPLICATION_SECTION.test(f.nfkc),
    '（二）应用文写作', '（二）语法适用', { value: 'application' }),
  rule('writing.numbered-continuation', 'writing-section', 40, f => NUMBERED_CONTINUATION_SECTION.test(f.nfkc),
    '（三）读后续写（满分25分）', '（三）读后续写需要审题。', { value: 'continuation' }),
  pattern('writing.application-scoring', 'scoring-section', 10, WRITING_SCORING_SECTION[0][1], '应用文评分细则', '本篇应用文评分细则需要另行讨论。', { value: 'application' }),
  pattern('writing.continuation-scoring', 'scoring-section', 20, WRITING_SCORING_SECTION[1][1], '读后续写评分细则：', '读后续写评分细则分析', { value: 'continuation' }),
  rule('writing.explanations', 'section-stop', 10, (f, c) => c.sectionCount && ANSWER_EXPLANATION_START.test(f.text),
    { text: '【解题导语】本文是一篇应用文。', context: { sectionCount: 1 } },
    { text: '参考范文', context: { sectionCount: 1 } }),
  rule('writing.omission', 'omission', 10, (f, c) => (c.inWriting || c.current)
    && /^(?:略|[（(]略[）)]|(?:参考)?范文[：:]?\s*略|(?:源)?无范文|未提供范文)[。.]?$/u.test(f.trimmed),
  { text: '略', context: { inWriting: true } }, { text: '参考范文', context: { inWriting: true } }),
  rule('writing.part-boundary', 'part-boundary', 10, f =>
    /^(第[一二三四五]部分|(?:附\s*[:：]\s*)?听力)/u.test(f.text) || TRANSCRIPT_MARKER.test(f.text),
    '附：听力录音稿', '第二节 读后续写'),
  pattern('writing.student-script', 'capture-stop', 10, STUDENT_SCRIPT_BOUNDARY, '（五）样卷', '（四）作答示例'),
  rule('writing.commentary', 'commentary', 10, (f, c) => c.entryKind !== 'scoring'
    && (COMMENTARY_LINE.test(f.text) || (c.skipping && f.hasHan)),
  '1. 故事概述', { text: '1. 本题总分为15分。', context: { entryKind: 'scoring' } }),
  rule('writing.skipped-fragment', 'skipped-fragment', 10, (f, c) => c.skipping && !f.startsUpperOrQuote,
  { text: 'leave the next day.', context: { skipping: true } },
  { text: 'A completed sample.', context: { skipping: true } }),
  rule('writing.margin-body', 'margin-body', 10, f => f.startsEnglishOrQuote && f.observationCount > 3,
    { text: 'Our club will plant herbs.', boxes: Array.from({ length: 4 }, () => ({ region: { x: .1, y: .3, width: .1, height: .02 } })) },
    { text: '1. 故事概述', boxes: Array.from({ length: 4 }, () => ({ region: { x: .1, y: .3, width: .1, height: .02 } })) }),
  pattern('paragraph.version', 'paragraph-role', 10, VERSION_LABEL, 'Possible Version 1', 'Possible Version', { value: 'label' }),
  pattern('paragraph.salutation', 'paragraph-role', 20, SALUTATION, 'Dear Sam,', 'Our club will plant herbs.', { value: 'salutation' }),
  pattern('paragraph.closing', 'paragraph-role', 30, CLOSING, 'Yours,', 'Alex', { value: 'closing' }),
  pattern('paragraph.numbered', 'numbered-paragraph', 10, /^Paragraph\s*\d+[:：]/u, 'Paragraph 1:', '(1) They watered it together.'),
  rule('reference.indented', 'indent', 10, (f, c) => f.left > c.margin.left + 0.015,
    { text: 'a genuinely new paragraph.', left: .14, context: boundary },
    { text: 'Unexpectedly everything changed.', left: .1, context: boundary }),
  rule('reference.page-turn', 'page-turn', 10, (f, c) => c.previous && c.previous.page !== f.page,
    { text: 'Unexpectedly everything changed.', page: 2, context: boundary },
    { text: 'Unexpectedly everything changed.', page: 1, context: boundary }),
  rule('reference.previous-short', 'previous-short', 10, (f, c) =>
    c.previous && c.previous.right < c.margin.right - 0.06
      && c.previous.right + f.firstObservationWidth + 0.003 < c.margin.right,
  { text: 'Unexpectedly everything changed.', context: boundary },
  { text: 'Unexpectedly everything changed.', boxes: [{ region: { x: .1, y: .3, width: .1, height: .02 } }], context: boundary }),
  rule('reference.lowercase-continuation', 'lowercase-continuation', 10, (f, c) =>
    c.previous?.role === 'body' && !c.pageTurn && !c.indented && !c.previousShort && f.startsLower,
  { text: 'and these continue that turn', context: { ...boundary, previousShort: false } },
  { text: 'and these continue that turn', context: { ...boundary, previousShort: true } }),
])

const byId = new Map(LINE_ROLE_RULES.map(rule => [rule.id, rule]))
const byPhase = new Map()
for (const rule of LINE_ROLE_RULES) {
  if (!byPhase.has(rule.phase)) byPhase.set(rule.phase, [])
  byPhase.get(rule.phase).push(rule)
}
for (const rules of byPhase.values()) rules.sort((a, b) => a.priority - b.priority)

export function matchesLineRole(id, facts, context = {}) {
  const rule = byId.get(id)
  if (!rule) throw new Error(`Unknown line-role rule: ${id}`)
  return rule.match(facts, context)
}
export function firstLineRole(phase, facts, context = {}) {
  const rules = byPhase.get(phase)
  if (!rules) throw new Error(`Unknown line-role phase: ${phase}`)
  return rules.find(rule => rule.match(facts, context)) || null
}

// Capture extraction uses the same regex as its named candidate, never another
// recognition path. These captures do not mutate the printed source text.
export function speakerLabel(text) { return byId.get('transcript.speaker').capture(text)?.[0] || null }
export function inlineSampleParts(text) {
  return firstLineRole('inline-sample', computeLineFacts({ text }))?.capture(text)?.slice(1)
}
export function bareSectionNumber(text) { return byId.get('writing.bare-section').capture(text)?.[1] || null }
export function watermarkMatches(text) { return byId.get('worksheet.watermark').scan(text) }

export function writingSectionText(facts, heading, rest, inWriting) {
  if (!inWriting) return facts.text
  return matchesLineRole('writing.repeated-heading', computeLineFacts({ text: heading })) && rest.length === 1
    ? rest[0].trim() : facts.text.replace(/^写作\s+(?=第[一二]节)/u, '')
}
