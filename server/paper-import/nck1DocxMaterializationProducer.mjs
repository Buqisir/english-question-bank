import { execFileSync } from 'node:child_process'

import { extractDocxDocumentStructure } from '../paper-canonical/docxSourceAdapter.mjs'
import { validateNck1SourceMaterialization } from '../../shared/paper-canonical/nck1SourceMaterialization.mjs'
import { writingNoticeGroup, writingWordCount } from '../../shared/paper-canonical/applicationWritingDisplay.mjs'
import { digestJson, sha256 } from '../../shared/paper-canonical/stable.mjs'

export const NCK1_DOCX_MATERIALIZATION_PRODUCER_VERSION =
  'nck1-docx-materialization-producer-v17'

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
// A number enclosed by underscores is a complete blank, even when OCR kept
// only one leading stroke. Do not leave that stroke in the surrounding prose.
const BLANK = /(?<![\p{L}\p{N}_])_+\d{1,3}_+|(?:(?<!\d)\d{1,3}[.．、]?\p{Zs}*)?_{2,}\d{0,3}_{0,}/gu
const COMBINED_ANSWER_BOUNDARY = /^(?:【)?(?:(?:英语|参考)|[^。！？!?\n]{0,120}英语试(?:题|卷)(?:参考)?)?答案(?:(?:及|与)(?:解析|详解|听力(?:原文|材料)))?(?:】)?[:：]?$/u
const INLINE_ANSWER_DETAIL = /(?:【)?(?:答案(?:及|与)?)?(?:解析|详解)(?:】)?\s*[:：]?|(?:Explanation|Analysis)\s*[:：]/iu
const LISTENING_TRANSCRIPT_TITLE = String.raw`(?:(?:英语)?听力(?:部分|试题|测试)?(?:原文|材料|录音稿|录音原文|录音材料|录音文稿|文稿)|录音(?:原文|文稿|稿)|答案及听力材料)`
const LISTENING_TRANSCRIPT_HEADING = new RegExp(String.raw`^(?:附[:：]?\s*)?(?:【)?${LISTENING_TRANSCRIPT_TITLE}(?:[（(]录音稿[）)])?(?:】)?[:：]?$`, 'u')
const WRITING_SAMPLE_BOUNDARY = new RegExp(String.raw`^(?:(?:[一二三四五六七八九十]+[、.．]\s*|\(\s*[一二三四五六七八九十]+\s*\)\s*)?(?:附[:：，,]?\s*)?(?:【)?(?:(?:应用文|读后续写|续写|书面表达)(?:写作)?)?(?:评分|给分)|(?:【)?(?:答案(?:解析|详解)|解析|详解)|(?:附[:：]?\s*)?各档次|${LISTENING_TRANSCRIPT_TITLE}|AI\s+editions?\b)`, 'iu')
// Labels that open an official sample; scoring or prompt text may precede them.
const WRITING_SAMPLE_LABEL = /^(?:(?:(?:A|One)\s+)?Possible\s+Version(?:\s+\d+)?|(?:【)?(?:参考范文|范文|参考作文|写作样例|作答示例)(?:\s*[一二三1-3])?(?:】)?)\s*[:：]?$/iu
const LISTENING_TEXT_MARKER = /^(?:Text\s*(\d{1,2})|\(Text\s*(\d{1,2})\))\s*[:：]?$/iu
const LISTENING_PAUSE_REPEAT_SEQUENCE = /^(?:(?:\(\s*停顿\s*\d+(?:\.\d+)?\s*(?:秒|分钟|分)\s*\)|\(\s*重复\s*\)))+$/u
const SLOT_SPECS = [
  ['reading.a', 'reading', 21, 23],
  ['reading.b', 'reading', 24, 27],
  ['reading.c', 'reading', 28, 31],
  ['reading.d', 'reading', 32, 35],
]

function normalized(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[\u200b\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
}

function trimEdgeSpaces(value) {
  return String(value || '').replace(/^\p{Zs}+|\p{Zs}+$/gu, '')
}

function sourceLocator(documentId, sourceIndex) {
  if (sourceIndex && typeof sourceIndex === 'object') {
    return structuredClone(sourceIndex)
  }
  return {
    kind: 'docx_part',
    documentId,
    part: 'word/document.xml',
    selector: `(/w:document/w:body//w:p)[${sourceIndex}]`,
  }
}

function sourceRef(documentId, sourceIndex = null) {
  if (sourceIndex && typeof sourceIndex === 'object') {
    return {
      documentId,
      page: sourceIndex.page,
      region: structuredClone(sourceIndex.region),
    }
  }
  return sourceIndex === null ? { documentId } : { documentId, sourceIndex }
}

function hasSourceLocator(documentId, sourceIndex) {
  if (Number.isInteger(sourceIndex) && sourceIndex > 0) return true
  return sourceIndex?.kind === 'page_region'
    && sourceIndex.documentId === documentId
    && Number.isInteger(sourceIndex.page)
    && sourceIndex.page > 0
    && sourceIndex.region
    && ['x', 'y', 'width', 'height'].every((key) =>
      Number.isFinite(sourceIndex.region[key]))
    && sourceIndex.region.width > 0
    && sourceIndex.region.height > 0
}

function listeningCue(text) {
  const value = normalized(text)
  if (LISTENING_PAUSE_REPEAT_SEQUENCE.test(value)) {
    return { disposition: 'excluded_exam_broadcast', reason: 'standalone_pause_or_repeat_cue', kind: 'pause_repeat_cue' }
  }
  if (/^第一节到此结束[。.!！]?(?:\(\s*停顿\s*\d+(?:\.\d+)?\s*(?:秒|分钟|分)\s*\))?$/u.test(value)) {
    return { disposition: 'excluded_exam_broadcast', reason: 'anchored_section_transition', kind: 'section_transition', nextTextNumber: 6 }
  }
  if (/^听力部分到此结束[。.!！]?$/u.test(value)) {
    return { disposition: 'excluded_exam_broadcast', reason: 'anchored_listening_end_cue', kind: 'listening_end', nextTextNumber: null }
  }
  if (/^第二节到此结束(?:[。.!！,，])?现在[,，]?你有(?:\d+|两|三|四|五|十)分钟(?:的)?时间将试卷上的答案转涂到(?:客观题答题卡|答题纸|答题卡)上[。.!！]?(?:\(\s*停顿\s*\d+(?:\.\d+)?\s*(?:秒|分钟|分)\s*\))?$/u.test(value)) {
    return { disposition: 'excluded_exam_broadcast', reason: 'anchored_section_transition_and_answer_transfer', kind: 'answer_transfer', nextTextNumber: null }
  }
  const announcement = /^听下面(?:(?:的)?录音|一段(?:对话|独白|对话或独白))[,，]回答第(\d+)(?:(?:至|到|[-–—])第?(\d+)|(?:和|、)第?(\d+))?(?:[一二两三四五六七八九十\d]+个)?(?:小题|题)[。.!！]?(?:现在[,，]?你有\d+秒钟的时间阅读(?:这(?:[一二两三四五六七八九十\d]+个)?小题|第(\d+)小题(?:的有关内容)?)[。.!！]?)?$/u.exec(value)
  if (announcement) {
    const from = Number(announcement[1])
    const to = Number(announcement[2] || announcement[3] || announcement[1])
    if (from < 1 || to > 20 || to < from) return null
    if (announcement[4] && (from !== to || Number(announcement[4]) !== from)) return null
    return {
      disposition: 'excluded_exam_broadcast',
      reason: 'anchored_question_range_announcement',
      kind: 'question_range_announcement',
      questionNumbers: Array.from({ length: to - from + 1 }, (_, index) => from + index),
    }
  }
  const readingInstruction = /^现在[,，]?你有\d+秒钟的时间阅读第(\d+)小题的有关内容[。.!！](?:\(\s*停顿\s*\d+(?:\.\d+)?\s*(?:秒|分钟|分)\s*\))?$/u.exec(value)
  if (readingInstruction) {
    return { disposition: 'excluded_exam_broadcast', reason: 'anchored_question_reading_instruction',
      kind: 'question_reading_instruction', questionNumbers: [Number(readingInstruction[1])] }
  }
  if (/^(?:同学们[,，]?你们好[!！])?这是[^。.!！?？\n]{1,100}听力部分[。. ]该部分分为第一[、,]第二两节[。. ]注意[:：,，]回答听力部分时[，,]请先将答案标在试卷上[。. ]听力部分结束前[,，]你将有(?:\d+|两)分钟的时间将你的答案转涂到(?:客观题答题卡|答题纸|答题卡)上[。.!！.]?(?:\(\s*停顿\s*\d+(?:\.\d+)?\s*(?:秒|分钟|分)\s*\))?$/u.test(value)) {
    return { disposition: 'excluded_exam_broadcast', reason: 'anchored_listening_opening_notice', kind: 'listening_opening_notice', nextTextNumber: 1 }
  }
  if (/^这是[^。.!！?？\n]{1,100}听力部分[。. ]该部分分为第一[、,]第二两节[。.!！.]?$/u.test(value)) {
    return { disposition: 'excluded_exam_broadcast', reason: 'anchored_listening_opening_notice', kind: 'listening_opening_notice', nextTextNumber: 1 }
  }
  if (/^注意[,，]回答听力部分时[，,]请先将答案标在试卷上[。. ]听力部分结束前[,，]你将有(?:\d+|两)分钟(?:的)?时间将你的答案转涂到(?:客观题答题卡|答题纸|答题卡)上[。.!！.]?$/u.test(value)) {
    return { disposition: 'excluded_exam_broadcast', reason: 'anchored_listening_answer_instruction', kind: 'listening_answer_instruction', nextTextNumber: 1 }
  }
  if (/^请看听力部分第一节[。.!！]?$/u.test(value)) {
    return { disposition: 'excluded_exam_broadcast', reason: 'anchored_section_transition', kind: 'section_direction', nextTextNumber: 1 }
  }
  if (/^第一节[:：]听下面5段(录音|对话)[。.]每段\1后有一个小题[,，]从题中所给的A、\s*B、\s*C三个选项中选出最佳选项(?:[,，]并标在试卷的相应位置)?[。.]听完每段\1后[,，]你都有\d+秒钟的时间来回答有关小题和阅读下一小题[。.]每段\1(?:播放|读)两遍[。.!！]?(?:\(\s*停顿\s*\d+(?:\.\d+)?\s*(?:秒|分钟|分)\s*\))?$/u.test(value)) {
    return { disposition: 'excluded_exam_broadcast', reason: 'anchored_section_direction', kind: 'section_direction', nextTextNumber: 1 }
  }
  if (/^第二节[:：]听下面5段(录音|对话或独白)[。.]每段\1后有几个小题[,，]从题中所给的A、\s*B、\s*C三个选项中选出最佳选项(?:[,，]并标在试卷的相应位置)?[。.]听每段\1前[,，]你将有时间阅读各个小题[,，]每小题\d+秒钟[;；]听完后[,，](?:每小题都有|各小题将给出)\d+秒钟的作答时间[。.]每段\1(?:播放|读)两遍[。.!！]?(?:\(\s*停顿\s*\d+(?:\.\d+)?\s*(?:秒|分钟|分)\s*\))?$/u.test(value)) {
    return { disposition: 'excluded_exam_broadcast', reason: 'anchored_section_direction', kind: 'section_direction', nextTextNumber: 6 }
  }
  return null
}

function containsEmbeddedListeningCue(text) {
  const value = normalized(text)
  return /\(\s*(?:停顿\s*\d+(?:\.\d+)?\s*(?:秒|分钟|分)|重复)\s*\)|听下面(?:(?:的)?录音|一段(?:对话|独白|对话或独白))[,，]回答第\d+|(?:第一节|第二节)(?:到此结束|[:：].*听下面5段)|听力部分到此结束|转涂到(?:客观题答题卡|答题纸|答题卡)/u.test(value)
}

const LISTENING_SECONDS = /\b\d+(?:\.\d+)?\s*sec(?:ond)?s?\b/iu

// Only the fixed role labels of exam dialogues can be speakers here. Any word label ("Repeat:",
// "Silence:", "Tom:") may be a pause or replay instruction, so it never exempts a seconds value.
function listeningTurn(text) {
  const turn = /^\s*(M|W|A|B|Man|Woman|Boy|Girl)\s*[:：]\s*(\S.*)$/u.exec(text)
  return turn ? { label: turn[1], speech: turn[2] } : null
}

// A role label is a confirmed speaker only when it opens at least two transcript lines and at
// least one of them says no seconds.
function confirmedListeningSpeakers(texts) {
  const lines = new Map()
  for (const text of texts) {
    const turn = listeningTurn(text)
    if (!turn) continue
    const entry = lines.get(turn.label) || { count: 0, withoutSeconds: 0 }
    entry.count += 1
    if (!LISTENING_SECONDS.test(text)) entry.withoutSeconds += 1
    lines.set(turn.label, entry)
  }
  return new Set([...lines].filter(([, entry]) => entry.count >= 2 && entry.withoutSeconds >= 1).map(([label]) => label))
}

// A confirmed speaker's turn can say "14 seconds" as speech; every other seconds value
// (instructions, durations, named or metadata labels, bracketed notes) stays a review item.
function listeningTimingMetadata(text, speakers = new Set()) {
  if (/分段时长|录音时长|语速|每分钟\s*\d+\s*词|\b\d+(?:\.\d+)?\s*wpm\b/iu.test(text)) return true
  if (!LISTENING_SECONDS.test(text)) return false
  if (/[(（[【][^)）\]】]*\b\d+(?:\.\d+)?\s*sec(?:ond)?s?\b[^)）\]】]*[)）\]】]/iu.test(text)) return true
  const turn = listeningTurn(text)
  if (!turn || !speakers.has(turn.label)) return true
  // "Speaker: 2 minutes 25 seconds" with nothing else to say reads as a duration note, not speech.
  return !turn.speech.replace(/\b(?:\d+(?:\.\d+)?|about|around|approximately|and|minutes?|mins?|seconds?|secs?)\b|[^\p{L}]/giu, '')
}

function listeningItemRecord(item, index, documentId, disposition, reason, kind = null) {
  const located = hasSourceLocator(documentId, item?.sourceIndex)
  return {
    sourceOrder: index,
    itemKind: item?.kind || 'unknown',
    text: typeof item?.text === 'string' ? item.text : null,
    source: located ? sourceLocator(documentId, item.sourceIndex) : null,
    disposition,
    reason,
    ...(kind ? { kind } : {}),
  }
}

function addIssue(issues, code, path, message, source = null) {
  issues.push({ code, path, message, source })
}

function exactPosition(body, pattern, path, issues, documentId, range = null) {
  const matches = body.flatMap((item, index) =>
    item.kind === 'paragraph'
      && (!range || (index >= range[0] && index < range[1]))
      && pattern.test(normalized(item.text))
      ? [index]
      : [])
  if (matches.length !== 1) {
    addIssue(
      issues,
      'NCK1_DOCX_SECTION_AMBIGUOUS',
      path,
      `Expected exactly one section marker; found ${matches.length}`,
      sourceRef(documentId),
    )
    return null
  }
  return matches[0]
}

function optionalExactPosition(body, pattern, path, issues, documentId, range = null) {
  const matches = body.flatMap((item, index) =>
    item.kind === 'paragraph'
      && (!range || (index >= range[0] && index < range[1]))
      && pattern.test(normalized(item.text))
      ? [index]
      : [])
  if (matches.length <= 1) return matches[0] ?? null
  addIssue(issues, 'NCK1_DOCX_SECTION_AMBIGUOUS', path,
    `Expected zero or one optional section marker; found ${matches.length}`,
    sourceRef(documentId))
  return null
}

function questionPositions(body, number, from, to) {
  const pattern = new RegExp(`^${number}[.．、]\\s*`, 'u')
  const positions = []
  for (let index = from; index < to; index += 1) {
    if (body[index]?.kind === 'paragraph' && pattern.test(normalized(body[index].text))) {
      positions.push(index)
    }
  }
  return positions
}

function questionPosition(body, number, from, to) {
  return questionPositions(body, number, from, to)[0] ?? null
}

function optionsFromMatches(text, matches) {
  const options = matches.map((match, index) => ({
    label: match[1] || match[2],
    text: trimEdgeSpaces(text.slice(
      match.index + match[0].length,
      matches[index + 1]?.index ?? text.length,
    )),
  }))
  return options.every((option) => normalized(option.text))
    ? { leadingText: trimEdgeSpaces(text.slice(0, matches[0].index)), options }
    : null
}

// A dotted capital that touches another dotted capital ("Washington D. C.", "U. S.") reads as an
// abbreviation in the stem or an option, not as an option label.
function abbreviationLetter(text, match) {
  const before = text.slice(0, match.index + (match[0].length - match[0].trimStart().length))
  const after = text.slice(match.index + match[0].length)
  return /(?:^|[^A-Za-z])[A-Z][.．]\s*$/u.test(before) || startsAbbreviation(text, match)
}

// A label whose text opens with another dotted capital ("D. C.", "A. J. Smith") may be the start of
// an abbreviation rather than an option, so it is never accepted as a label.
function startsAbbreviation(text, match) {
  return /^[A-Z][.．](?![A-Za-z])/u.test(text.slice(match.index + match[0].length))
}

// When the plain label scan fails, accept exactly one label sequence whose skipped candidates
// are all abbreviation letters; several readings stay ambiguous for review.
function optionsSkippingAbbreviations(text, matches, labels) {
  const readings = []
  const walk = (start, chosen) => {
    if (readings.length > 1) return
    if (chosen.length === labels.length) {
      const skipped = matches.filter((match) => !chosen.includes(match))
      if (!skipped.every((match) => abbreviationLetter(text, match))) return
      const parsed = optionsFromMatches(text, chosen)
      if (parsed) readings.push(parsed)
      return
    }
    for (let index = start; index < matches.length; index += 1) {
      const match = matches[index]
      if ((match[1] || match[2]) !== labels[chosen.length] || startsAbbreviation(text, match)) continue
      if (chosen.length === 0 && !matches.slice(0, index).every((skipped) => abbreviationLetter(text, skipped))) continue
      walk(index + 1, [...chosen, match])
    }
  }
  walk(0, [])
  return readings.length === 1 ? readings[0] : null
}

function parseOptionsWithLeadingText(items, labels) {
  const paragraphs = items.filter((item) => item.kind === 'paragraph')
  for (let end = 1; end <= paragraphs.length; end += 1) {
    const text = paragraphs.slice(0, end)
      .map((item) => item.text)
      .join('\n')
      .replace(/^\s*\d{1,3}[.．、]\s*/u, '')
    const matches = [...text.matchAll(
      /(?:^|\s)([A-G])[.．、]\s*|(?:^|[\t\n]| {2,})([A-G])\s+/gu,
    )]
    if (
      matches.length === labels.length
      && matches.every((match, index) => (match[1] || match[2]) === labels[index])
    ) {
      // A later paragraph may still hold the real label, so read on instead of accepting it here.
      if (matches.some((match) => startsAbbreviation(text, match))) continue
      const parsed = optionsFromMatches(text, matches)
      if (parsed) return parsed
      continue
    }
    if (matches.length > labels.length) {
      const parsed = optionsSkippingAbbreviations(text, matches, labels)
      if (parsed) return parsed
    }
  }
  return null
}

function parseOptions(items, labels) {
  return parseOptionsWithLeadingText(items, labels)?.options || null
}

function contentWithBlanks(text, blankBySourceNumber, issues, path, source) {
  // Trim paragraph exterior only. Text-run edges adjoining a blank are prose.
  text = trimEdgeSpaces(text)
  const matches = [...String(text).matchAll(BLANK)]
  const content = []
  let offset = 0
  for (const match of matches) {
    const sourceNumber = Number(/\d{1,3}/u.exec(match[0])?.[0])
    const blankId = blankBySourceNumber.get(sourceNumber)
    if (!blankId) {
      addIssue(issues, 'NCK1_DOCX_BLANK_AMBIGUOUS', path,
        'A blank does not carry one expected source number', source)
      continue
    }
    const before = text.slice(offset, match.index)
    if (before) content.push({ kind: 'text', text: before })
    content.push({ kind: 'blank_ref', blankId })
    offset = match.index + match[0].length
  }
  const after = text.slice(offset)
  if (after) content.push({ kind: 'text', text: after })
  return content.filter((item) => item.kind !== 'text' || normalized(item.text).length > 0)
}

function paragraphBlock({ paperId, slotId, item, index, documentId, role = 'body', blanks = new Map(), issues }) {
  return {
    kind: 'paragraph',
    blockId: `block:${paperId}:${slotId.replaceAll('.', '-')}:${index + 1}`,
    role,
    content: contentWithBlanks(
      item.text,
      blanks,
      issues,
      `groups.${slotId}.blocks[${index}]`,
      sourceRef(documentId, item.sourceIndex),
    ),
    source: sourceLocator(documentId, item.sourceIndex),
  }
}

function tableBlock({ paperId, slotId, item, index, documentId, issues }) {
  if (
    item.nestedTableCount > 0
    || item.rows.length === 0
    || item.rows.some((row) => row.cells.length === 0 || row.cells.some((cell) =>
      (cell.containsDrawing && !cell.materializedMedia)
      || cell.containsNestedTable
      || cell.verticalMerge !== null
      || (normalized(cell.text).length === 0 && !cell.materializedMedia)))
  ) {
    addIssue(issues, 'NCK1_DOCX_TABLE_REVIEW_REQUIRED',
      `groups.${slotId}.blocks[${index}]`,
      'Nested, drawn, vertically merged, or empty table cells require Agent confirmation',
      sourceRef(documentId))
  }
  return {
    kind: 'table',
    blockId: `block:${paperId}:${slotId.replaceAll('.', '-')}:table-${item.tableIndex}`,
    columnCount: item.columnCount,
    rows: item.rows.map((row, rowIndex) => {
      let columnStart = 0
      return {
        rowId: `row:${paperId}:${slotId.replaceAll('.', '-')}:${item.tableIndex}:${rowIndex + 1}`,
        cells: row.cells.map((cell, cellIndex) => {
          const value = {
            cellId: `cell:${paperId}:${slotId.replaceAll('.', '-')}:${item.tableIndex}:${rowIndex + 1}:${cellIndex + 1}`,
            columnStart,
            columnSpan: cell.columnSpan,
            rowSpan: 1,
            role: row.header ? 'header' : 'data',
            content: cell.materializedMedia
              ? [{
                  kind: 'media_ref',
                  mediaId: cell.materializedMedia.mediaId,
                  alt: '',
                }]
              : normalized(cell.text)
                ? [{ kind: 'text', text: trimEdgeSpaces(cell.text) }]
                : [{ kind: 'text', text: '[Agent confirmation required]' }],
          }
          columnStart += cell.columnSpan
          return value
        }),
      }
    }),
    source: item.source
      ? structuredClone(item.source)
      : {
          kind: 'docx_part',
          documentId,
          part: 'word/document.xml',
          selector: item.selector,
        },
  }
}

function contentBlocks(items, context) {
  return items.flatMap((item, index) => {
    if (item.kind === 'paragraph' && item.containsDrawing) {
      if (item.materializedMedia && normalized(item.text).length === 0) {
        return [{
          kind: 'figure',
          blockId: `block:${context.paperId}:${context.slotId.replaceAll('.', '-')}:figure-${item.sourceIndex?.kind === 'page_region' ? digestJson(item.sourceIndex).slice(7, 23) : item.sourceIndex}`,
          mediaId: item.materializedMedia.mediaId,
          caption: '',
          source: sourceLocator(context.documentId, item.sourceIndex),
        }]
      }
      addIssue(context.issues, 'NCK1_DOCX_VISUAL_REVIEW_REQUIRED',
        `groups.${context.slotId}.blocks[${index}]`,
        'A source paragraph contains a drawing that requires Agent visual confirmation',
        sourceRef(context.documentId, item.sourceIndex))
    }
    if (item.kind === 'paragraph' && normalized(item.text).length === 0) return []
    return [item.kind === 'table'
      ? tableBlock({ ...context, item, index })
      : paragraphBlock({ ...context, item, index })]
  })
}

function objectiveQuestion({ paperId, canonicalNumber, family, questionItem, questionItems, blankItem = questionItem, prompt = null, documentId, issues }) {
  const sourceNumber = Number(/^(\d{1,3})[.．、]/u.exec(normalized(questionItem?.text))?.[1])
  const labels = family === 'listening' ? ['A', 'B', 'C'] : ['A', 'B', 'C', 'D']
  const parsedOptions = ['reading', 'cloze', 'listening'].includes(family)
    ? parseOptionsWithLeadingText(questionItems, labels)
    : { options: [] }
  const options = parsedOptions?.options || null
  if (!Number.isInteger(sourceNumber)) {
    addIssue(issues, 'NCK1_DOCX_QUESTION_NUMBER_AMBIGUOUS',
      `questions.${canonicalNumber}`, 'Question number is not closed',
      sourceRef(documentId, questionItem?.sourceIndex))
  }
  if (options === null) {
    addIssue(issues, 'NCK1_DOCX_OPTIONS_AMBIGUOUS',
      `questions.${canonicalNumber}.options`, `Expected ${labels.join('-')} in source order`,
      sourceRef(documentId, questionItem?.sourceIndex))
  }
  const questionId = `question:${paperId}:${canonicalNumber}`
  const blankId = ['seven-choices', 'cloze', 'grammar-fill'].includes(family)
    ? `blank:${paperId}:${canonicalNumber}`
    : null
  const stem = ['reading', 'listening'].includes(family)
    ? parsedOptions?.leadingText || ''
    : ''
  return {
    questionId,
    sourceNumber: sourceNumber || canonicalNumber,
    canonicalNumber,
    stem,
    options: options || [],
    blankId,
    prompt,
    source: sourceLocator(documentId, (blankItem || questionItem).sourceIndex),
  }
}

function readMcqQuestions({ paperId, body, from, to, rangeStart, rangeEnd, family, documentId, issues }) {
  const positionsByNumber = Array.from({ length: to - from + 1 }, (_, index) =>
    questionPositions(body, from + index, rangeStart, rangeEnd))
  if (positionsByNumber.some((positions) => positions.length !== 1)) {
    addIssue(issues, 'NCK1_DOCX_QUESTION_SEQUENCE_INCOMPLETE',
      `questions.${from}-${to}`, `Expected Questions ${from}-${to} exactly once each`,
      sourceRef(documentId))
    return []
  }
  const positions = positionsByNumber.map(([position]) => position)
  return positions.map((position, index) => objectiveQuestion({
    paperId,
    canonicalNumber: from + index,
    family,
    questionItem: body[position],
    questionItems: body.slice(position, positions[index + 1] ?? rangeEnd),
    documentId,
    issues,
  }))
}

function readingGroups({ paperId, body, firstStart, secondStart, documentId, issues }) {
  const letters = ['A', 'B', 'C', 'D'].map((letter) => exactPosition(
    body,
    new RegExp(`^${letter}$`, 'u'),
    `sections.reading.${letter.toLowerCase()}`,
    issues,
    documentId,
    [firstStart + 1, secondStart],
  ))
  return SLOT_SPECS.map(([slotId, family, from, to], slotIndex) => {
    const start = letters[slotIndex]
    const end = letters[slotIndex + 1] ?? secondStart
    if (start === null || end === null) return emptyGroup(paperId, slotId, family)
    const questions = readMcqQuestions({
      paperId, body, from, to, rangeStart: start + 1, rangeEnd: end,
      family, documentId, issues,
    })
    const firstQuestion = questionPosition(body, from, start + 1, end) ?? end
    const blocks = contentBlocks(body.slice(start + 1, firstQuestion), {
      paperId, slotId, documentId, issues,
      role: 'body', blanks: new Map(),
    })
    // A–D identify passage slots, not titles. Source review assigns any
    // actual title/subtitle; paragraph position alone is not evidence.
    return group(paperId, slotId, family, blocks, questions)
  })
}

function emptyGroup(paperId, slotId, family) {
  return group(paperId, slotId, family, [], [])
}

function group(paperId, slotId, family, blocks, questions, optionBank = [], writingTask = null) {
  return {
    slotId,
    groupId: `group:${paperId}:${slotId.replaceAll('.', '-')}`,
    family,
    blocks,
    questions,
    optionBank,
    writingTask,
  }
}

function blankMatches(items) {
  return items.flatMap((item, itemIndex) => item.kind === 'paragraph'
    ? [...item.text.matchAll(BLANK)].map((match) => ({
        item,
        itemIndex,
        token: match[0],
        sourceNumber: Number(/\d{1,3}/u.exec(match[0])?.[0]),
        after: item.text.slice(match.index + match[0].length),
      }))
    : [])
}

function blankGroup({ paperId, slotId, family, items, from, to, documentId, issues, optionBank = [] }) {
  items = items.map((item) => ({ ...item, text: item.textWithNumberedBlanks ?? item.text }))
  const matches = blankMatches(items)
  if (
    matches.length !== to - from + 1
    || matches.some((match, index) => match.sourceNumber !== from + index)
  ) {
    addIssue(issues, 'NCK1_DOCX_BLANK_SEQUENCE_INCOMPLETE',
      `groups.${slotId}`, `Expected source blanks ${from}-${to} exactly once in order`,
      sourceRef(documentId))
  }
  const blankBySourceNumber = new Map(matches.map((match, index) => [
    match.sourceNumber,
    `blank:${paperId}:${from + index}`,
  ]))
  const questions = matches.slice(0, to - from + 1).map((match, index) => {
    const canonicalNumber = from + index
    const prompt = family === 'grammar-fill'
      ? /^\s*[（(]([^()（）]+)[）)]/u.exec(match.after)?.[1]?.trim() || null
      : null
    return objectiveQuestion({
      paperId,
      canonicalNumber,
      family,
      questionItem: { ...match.item, text: `${match.sourceNumber}.` },
      questionItems: [],
      blankItem: match.item,
      prompt,
      documentId,
      issues,
    })
  })
  const blocks = contentBlocks(items, {
    paperId, slotId, documentId, issues, role: 'body', blanks: blankBySourceNumber,
  })
  return group(paperId, slotId, family, blocks, questions, optionBank)
}

function sevenChoices({ paperId, body, start, end, documentId, issues }) {
  const meaningful = body.slice(start + 1, end).filter((item) =>
    item.kind !== 'paragraph' || normalized(item.text))
  let bankStart = -1
  for (let index = 0; index < meaningful.length; index += 1) {
    if (parseOptions([meaningful[index]], ['A'])
      && 'BCDEFG'.split('').every((label, offset) =>
        parseOptions([meaningful[index + offset + 1]], [label]))) {
      bankStart = index
      break
    }
  }
  if (bankStart < 0) {
    addIssue(issues, 'NCK1_DOCX_OPTION_BANK_AMBIGUOUS', 'groups.seven-choices.optionBank',
      'Expected one ordered A-G option bank', sourceRef(documentId))
    return emptyGroup(paperId, 'seven-choices', 'seven-choices')
  }
  const bank = meaningful.slice(bankStart, bankStart + 7)
    .map((item, index) => parseOptions([item], [String.fromCharCode(65 + index)])?.[0])
    .filter(Boolean)
  const bodyItems = meaningful.slice(1, bankStart)
  return blankGroup({
    paperId, slotId: 'seven-choices', family: 'seven-choices',
    items: bodyItems, from: 36, to: 40, documentId, issues, optionBank: bank,
  })
}

function clozeGroup({ paperId, body, start, end, documentId, issues }) {
  const q41 = questionPosition(body, 41, start + 1, end)
  if (q41 === null) {
    addIssue(issues, 'NCK1_DOCX_QUESTION_SEQUENCE_INCOMPLETE', 'groups.cloze',
      'Expected Cloze Questions 41-55', sourceRef(documentId))
    return emptyGroup(paperId, 'cloze', 'cloze')
  }
  const passageItems = body.slice(start + 2, q41)
    .map((item) => ({ ...item, text: item.textWithNumberedBlanks ?? item.text }))
  const matches = blankMatches(passageItems)
  const questions = readMcqQuestions({
    paperId, body, from: 41, to: 55, rangeStart: q41, rangeEnd: end,
    family: 'cloze', documentId, issues,
  })
  if (matches.length !== 15 || matches.some((match, index) => match.sourceNumber !== 41 + index)) {
    addIssue(issues, 'NCK1_DOCX_BLANK_SEQUENCE_INCOMPLETE', 'groups.cloze.blocks',
      'Expected source blanks 41-55 exactly once in order', sourceRef(documentId))
  }
  const blanks = new Map(matches.map((match, index) => [
    match.sourceNumber, `blank:${paperId}:${41 + index}`,
  ]))
  for (const [index, question] of questions.entries()) {
    if (matches[index]) {
      question.blankId = `blank:${paperId}:${41 + index}`
    }
  }
  const blocks = contentBlocks(passageItems, {
    paperId, slotId: 'cloze', documentId, issues, role: 'body', blanks,
  })
  return group(paperId, 'cloze', 'cloze', blocks, questions)
}

function isAnswerExplanationHeading(item) {
  return item.kind === 'paragraph'
    && /^(?:【)?(?:答案(?:及|与)?)?(?:详细解析|解析|详解)(?:】)?/u.test(normalized(item.text))
}

function slicedStructure(structure, start, end = structure.body.length) {
  const body = structure.body.slice(start, end)
  return {
    ...structure,
    body,
    paragraphs: body.filter((item) => item.kind === 'paragraph'),
    tables: body.filter((item) => item.kind === 'table'),
  }
}

export function splitNck1CombinedSourceStructure(structure, documentId, issues) {
  const body = structure?.body || []
  const boundaries = body.flatMap((item, index) =>
    item.kind === 'paragraph' && COMBINED_ANSWER_BOUNDARY.test(normalized(item.text))
      ? [index]
      : [])
  const writing = body.findIndex((item) =>
    item.kind === 'paragraph' && /^第四部分\s*写作/u.test(normalized(item.text)))
  if (
    boundaries.length !== 1
    || writing < 0
    || boundaries[0] <= writing
    || boundaries[0] >= body.length - 1
  ) {
    addIssue(
      issues,
      'NCK1_COMBINED_SOURCE_BOUNDARY_AMBIGUOUS',
      'documents.question_and_answers',
      `Combined source requires one explicit answer boundary after the complete question paper; found ${boundaries.length}`,
      sourceRef(documentId),
    )
    return {
      questionStructure: slicedStructure(structure, 0, 0),
      answerStructure: slicedStructure(structure, 0, 0),
    }
  }
  return {
    questionStructure: slicedStructure(structure, 0, boundaries[0]),
    answerStructure: slicedStructure(structure, boundaries[0] + 1),
  }
}

function skeletonRole(text, index, givens) {
  text = normalized(text)
  if (/^Dear\b.*[,，]$/iu.test(text)) return 'salutation'
  if (/^Yours(?: sincerely| faithfully| truly)?[,，]\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}$/u.test(text)) return 'closing'
  if (/^(?:Yours(?: sincerely| faithfully| truly)?|Sincerely|Best(?: wishes| regards)?)[,，]?$/iu.test(text)) return 'closing'
  if (index > 0 && ['closing'].includes(skeletonRole(givens[index - 1] || '', -1, []))) return 'signature'
  if (index === 1 && /^Dear\b.*[,，]$/iu.test(normalized(givens[0])) && /[.!?。！？]$/u.test(text)) return 'opening'
  if (givens.length === 1 && !/[.!。！]$/u.test(text)) return 'title'
  return null
}

function writingGroup({ paperId, slotId, family, items, documentId, officialModelAnswer, issues }) {
  let meaningful = items.filter((item) => item.kind !== 'paragraph' || normalized(item.text) || item.containsDrawing)
  const promptItem = meaningful[0]
  const notice = writingNoticeGroup(meaningful.map(item => item.kind === 'paragraph' ? normalized(item.text) : ''))
  const noticeIndex = notice?.startIndex ?? -1
  if (!promptItem || noticeIndex < 1) {
    addIssue(issues, 'NCK1_DOCX_WRITING_BOUNDARY_AMBIGUOUS', `groups.${slotId}`,
      'Writing prompt and 注意 boundary are not closed', sourceRef(documentId))
    return emptyGroup(paperId, slotId, family)
  }
  const noticeEnd = noticeIndex + notice.blockCount - 1
  const tail = meaningful.slice(noticeEnd + 1)
  const box = tail.length === 1 && tail[0].kind === 'table' ? tail[0] : null
  const cell = box?.rows.length === 1 && box.rows[0].cells.length === 1 ? box.rows[0].cells[0] : null
  if (box?.columnCount === 1 && box.nestedTableCount === 0
    && cell?.columnSpan === 1 && cell.verticalMerge === null
    && !cell.containsDrawing && !cell.containsNestedTable && cell.sourceParagraphs) {
    // A one-cell response box after 注意 is not a semantic data table. Retain
    // each original w:p and its locator, including the two separate starters.
    meaningful = meaningful.slice(0, noticeEnd + 1)
      .concat(cell.sourceParagraphs.filter((item) => normalized(item.text)))
  }
  const givens = meaningful.slice(noticeEnd + 1).filter((item) => item.kind === 'paragraph')
  const skeleton = family === 'application-writing'
    ? givens.map((item, index) => ({
        text: trimEdgeSpaces(item.text),
        role: skeletonRole(trimEdgeSpaces(item.text), index, givens.map((given) => trimEdgeSpaces(given.text))),
      }))
    : []
  if (skeleton.some((item) => item.role === null)) {
    addIssue(issues, 'NCK1_DOCX_WRITING_SKELETON_AMBIGUOUS',
      `groups.${slotId}.writingTask.givenSkeleton`,
      'A response-box given cannot be classified without Agent confirmation',
      sourceRef(documentId))
  }
  if (family === 'continuation-writing' && givens.length !== 2) {
    addIssue(issues, 'NCK1_DOCX_CONTINUATION_STARTERS_AMBIGUOUS',
      `groups.${slotId}.writingTask.starters`,
      `Expected exactly two continuation starters; found ${givens.length}`,
      sourceRef(documentId))
  }
  const blocks = contentBlocks(meaningful, {
    paperId, slotId, documentId, issues, role: 'body', blanks: new Map(),
  })
  if (family === 'application-writing') {
    for (let index = noticeEnd + 1; index < blocks.length; index += 1) {
      if (skeleton[index - noticeEnd - 1]?.role === 'title') blocks[index].role = 'title'
    }
  }
  const task = {
    taskType: family === 'application-writing' ? 'application' : 'continuation',
    prompt: trimEdgeSpaces(promptItem.text),
    material: family === 'continuation-writing'
      ? meaningful.slice(1, noticeIndex).map((item) => trimEdgeSpaces(item.text))
      : [],
    starters: family === 'continuation-writing'
      ? givens.map((item) => trimEdgeSpaces(item.text))
      : [],
    givenSkeleton: skeleton.map((item) => ({ text: item.text, role: item.role || 'opening' })),
    wordCountTarget: writingWordCount(meaningful.slice(noticeIndex, noticeEnd + 1).map(item => item.text).join(' ')),
    officialModelAnswer,
    source: sourceLocator(documentId, promptItem.sourceIndex),
  }
  if (!task.wordCountTarget) {
    addIssue(issues, 'NCK1_DOCX_WRITING_WORD_COUNT_AMBIGUOUS',
      `groups.${slotId}.writingTask.wordCountTarget`,
      'Writing word count is not stated in the source notice',
      sourceRef(documentId, promptItem.sourceIndex))
  }
  return group(paperId, slotId, family, blocks, [], [], task)
}

// A text answer is a short source spelling. One trailing list separator
// ("56.in;") and an optional letter inside a word ("fuel(l)ed", printed
// "fuel(l) ed") are answer-key formats; other punctuation, Chinese text, or a
// long run means explanation prose may be attached, so the value is withheld.
function textAnswerValue(rawValue) {
  const value = String(rawValue).trim().replace(/\s*[.。;；,，]$/u, '')
  const shape = normalized(value).replace(/(?<=\p{L})\(\p{L}{1,3}\)(?: (?=\p{L}))?/gu, '')
  if (
    !shape
    || value.length > 80
    || shape.split(' ').length > 4
    || /[.!?。！？,，;；:：（）()“”"\p{Script=Han}\d]/u.test(shape)
  ) return null
  return value
}

function choiceAnswerValue(rawValue) {
  return /^[A-G]$/u.test(normalized(rawValue)) ? normalized(rawValue) : null
}

function answerValueFor(number, rawValue) {
  return number <= 55 ? choiceAnswerValue(rawValue) : textAnswerValue(rawValue)
}

function consecutive(numbers) {
  return numbers.every((number, index) => index === 0 || number === numbers[index - 1] + 1)
}

// "21A 22B 23D" or "56 creator 57 hidden": a key printed without periods. Only
// a whole line of two or more consecutive pairs counts, so numbers inside
// prose, scores, or transcripts never become answers.
function unpunctuatedAnswerPairs(text) {
  const line = normalized(text)
  if (/\d\s*[.．、]/u.test(line)) return null
  const pairs = []
  const pattern = /(\d{1,2}) ?([A-Za-z][^\d]*?) ?(?=\d|$)/yu
  let end = 0
  for (let match = pattern.exec(line); match; match = pattern.exec(line)) {
    pairs.push([Number(match[1]), match[2]])
    end = pattern.lastIndex
  }
  if (end !== line.length || pairs.length < 2 || !consecutive(pairs.map(([number]) => number))) return null
  const values = pairs.map(([number, value]) => answerValueFor(number, value))
  return values.every(Boolean) ? pairs.map(([number], index) => [number, values[index]]) : null
}

const ANSWER_GRID_NUMBER_LABEL = /^(?:题号|题序|序号|小题)$/u
const ANSWER_GRID_VALUE_LABEL = /^答案$/u

// One number row and the answer row printed under it, from a table or from
// two transcribed lines ("序号 1 2 3" / "答案 C C B"). Text lines carry no cell
// boundaries, so their answers must be one word each; tables keep phrases.
function answerGridPairs(numberCells, valueCells) {
  const label = (cells, pattern) => (pattern.test(normalized(cells[0])) ? cells.slice(1) : null)
  const numbers = label(numberCells, ANSWER_GRID_NUMBER_LABEL)
  const values = label(valueCells, ANSWER_GRID_VALUE_LABEL)
  if (!numbers || !values) return null
  const used = numbers.findLastIndex((cell) => normalized(cell)) + 1
  const parsedNumbers = numbers.slice(0, used).map((cell) =>
    (/^\d{1,2}$/u.test(normalized(cell)) ? Number(normalized(cell)) : null))
  if (used < 2 || parsedNumbers.some((number) => number === null) || !consecutive(parsedNumbers)) return { ambiguous: true }
  if (values.length < used || values.slice(used).some((cell) => normalized(cell))) return { ambiguous: true, numbers: parsedNumbers }
  const parsedValues = parsedNumbers.map((number, index) => answerValueFor(number, values[index]))
  return parsedValues.every(Boolean)
    ? { pairs: parsedNumbers.map((number, index) => [number, parsedValues[index]]) }
    : { ambiguous: true, numbers: parsedNumbers }
}

function answerLineCells(text) {
  return normalized(text).replace(/^(\S+?) ?[|｜:：] ?/u, '$1 ').split(' ')
}

const NUMBERED_WRITING_ANSWER_SECTION = /^(?:第四部分|四[、.．])\s*[:：]?\s*(?:写作|书面表达)/u
// Some answer books print only "写作" above the samples; it counts only when no
// numbered writing part exists, so a later "写作" explanation title is inert.
const BARE_WRITING_ANSWER_SECTION = /^写作\s*(?:\([^)]*\))?\s*[:：]?$/u

function writingAnswerSectionHeading(text) {
  return NUMBERED_WRITING_ANSWER_SECTION.test(text) || BARE_WRITING_ANSWER_SECTION.test(text)
}

function parseOfficialAnswers(answerBody, answerDocumentId, issues) {
  const answers = new Map()
  const locate = (item) => sourceLocator(answerDocumentId, item.kind === 'table'
    ? item.source || { kind: 'docx_part', documentId: answerDocumentId, part: 'word/document.xml', selector: item.selector }
    : item.sourceIndex)
  const at = (item) => sourceRef(answerDocumentId, item.kind === 'table' ? item.source || null : item.sourceIndex)
  const add = (number, value, item) => {
    if (number < 1 || number > 65) return
    const previous = answers.get(number)
    const cleaned = String(value).trim()
    if (!cleaned || INLINE_ANSWER_DETAIL.test(cleaned)) {
      addIssue(issues, 'NCK1_ANSWER_DETAIL_LEAK_DETECTED', `answers.${number}`,
        'An answer value contains source explanation text', at(item))
      return
    }
    if (previous && previous.value !== cleaned) {
      addIssue(issues, 'NCK1_DOCX_ANSWER_CONFLICT', `answers.${number}`,
        'Official answer source contains conflicting values', at(item))
      return
    }
    answers.set(number, { value: cleaned, authority: locate(item) })
  }
  const ambiguousGrid = (numbers, item) => addIssue(issues, 'NCK1_ANSWER_VALUE_BOUNDARY_AMBIGUOUS',
    numbers?.length ? `answers.${numbers[0]}-${numbers.at(-1)}` : 'answers.grid',
    'An answer grid does not pair each question number with one clear answer', at(item))
  const lines = []
  for (const item of answerBody) {
    if (item.kind === 'table') {
      lines.push({ item, table: true })
      continue
    }
    if (item.kind !== 'paragraph') continue
    if (writingAnswerSectionHeading(normalized(item.text))) break
    if (isAnswerExplanationHeading(item)) {
      const activeAnswersComplete = Array.from(
        { length: 45 },
        (_, index) => answers.has(index + 21),
      ).every(Boolean)
      if (activeAnswersComplete) break
      lines.push({ item, explanationHeading: true })
      continue
    }
    for (const text of item.text.split('\n')) lines.push({ item, text })
  }
  for (const [index, line] of lines.entries()) {
    const { item } = line
    if (line.table) {
      for (const [rowIndex, row] of item.rows.entries()) {
        const next = item.rows[rowIndex + 1]
        if (!next) continue
        const grid = answerGridPairs(row.cells.map((cell) => cell.text), next.cells.map((cell) => cell.text))
        if (grid?.pairs) grid.pairs.forEach(([number, value]) => add(number, value, item))
        else if (grid?.ambiguous) ambiguousGrid(grid.numbers, item)
      }
      continue
    }
    if (line.explanationHeading) continue
    const { text } = line
    const previous = lines[index - 1]
    if (previous?.text !== undefined
      && answerGridPairs(answerLineCells(previous.text), answerLineCells(text))) continue
    const next = lines[index + 1]
    const grid = next?.text !== undefined
      ? answerGridPairs(answerLineCells(text), answerLineCells(next.text))
      : null
    if (grid) {
      if (grid.pairs) grid.pairs.forEach(([number, value]) => add(number, value, next.item))
      else ambiguousGrid(grid.numbers, item)
      continue
    }
    for (const match of text.matchAll(/(\d{1,2})\s*[-–—~～－至]\s*(\d{1,2})\s*([A-G]+)/gu)) {
      const from = Number(match[1])
      const to = Number(match[2])
      if (match[3].length !== to - from + 1) {
        addIssue(issues, 'NCK1_DOCX_ANSWER_RANGE_AMBIGUOUS', `answers.${from}-${to}`,
          'Official answer range length does not match its labels', at(item))
        continue
      }
      ;[...match[3]].forEach((value, offset) => add(from + offset, value, item))
    }
    const pairs = unpunctuatedAnswerPairs(text)
    if (pairs) {
      pairs.forEach(([number, value]) => add(number, value, item))
      continue
    }
    for (const match of text.matchAll(
      /(\d{1,2})\s*[.．、]\s*(.*?)(?=(?:\d{1,2})\s*[.．、]|$)/gu,
    )) {
      const number = Number(match[1])
      const rawValue = trimEdgeSpaces(match[2])
      // Numbers past 65 are writing parts or explanation items, never answers.
      if (!normalized(rawValue) || number < 1 || number > 65) continue
      if (number <= 55) {
        const label = /^([A-G])(?=$|[\s.．、,，;；。:：)）【])/u.exec(normalized(rawValue))?.[1]
        if (label) add(number, label, item)
        continue
      }
      const detail = INLINE_ANSWER_DETAIL.exec(rawValue)
      const value = textAnswerValue(detail ? rawValue.slice(0, detail.index) : rawValue)
      if (!value) {
        // An explanation that restates an already keyed answer is not a
        // second authority; only an unkeyed number needs review.
        if (answers.has(number)) continue
        addIssue(issues, 'NCK1_ANSWER_VALUE_BOUNDARY_AMBIGUOUS', `answers.${number}`,
          'A text answer cannot be separated safely from adjacent explanation text', at(item))
        continue
      }
      add(number, value, item)
    }
  }
  return answers
}

// Bare part headings carry no sample label of their own: "第一节（满分15分）".
const BARE_APPLICATION_HEADING = /^第一节\s*(?:\([^)]*\))?\s*[:：]?$/u
const BARE_CONTINUATION_HEADING = /^第二节\s*(?:\([^)]*\))?\s*[:：]?$/u
const APPLICATION_HEADINGS = [
  /^第一节(?:\s*[:：])?.*(?:应用文(?:写作)?|参考范文|One possible version)/iu,
  /^(?:[一1][、.．]\s*|\(\s*[一1]\s*\)\s*)?(?:应用文(?:写作)?|书面表达)\s*(?:\([^)]*\))?\s*[:：]?$/u,
  BARE_APPLICATION_HEADING,
]
const CONTINUATION_HEADINGS = [
  /^第二节(?:\s*[:：])?.*(?:读后续写|参考范文|One possible version)/iu,
  /^(?:[二2][、.．]\s*|\(\s*[二2]\s*\)\s*)?读后续写\s*(?:\([^)]*\))?\s*[:：]?$/u,
  BARE_CONTINUATION_HEADING,
]

function writingSamplePosition(answerBody, patterns, from) {
  return answerBody.flatMap((item, index) => {
    if (index < from || item.kind !== 'paragraph') return []
    const text = normalized(item.text)
    return patterns.some((pattern) => pattern.test(text)) ? [index] : []
  })
}

function writingSampleText(answerBody, from, to, { bareHeading = false } = {}) {
  // A source can put scoring prose/tables before the explicit sample label.
  // Only that exact label establishes the sample start; do not infer it from
  // English-looking text or discard scoring from the captured source stream.
  const labels = answerBody.flatMap((item, index) => index >= from && index < to
    && item.kind === 'paragraph'
    && WRITING_SAMPLE_LABEL.test(normalized(item.text)) ? [index] : [])
  // A single label is not essay prose. Multiple labelled alternatives retain
  // their labels and order rather than silently selecting one sample.
  const start = labels.length ? labels[0] + (labels.length === 1 ? 1 : 0) : from
  const boundary = answerBody.findIndex((item, index) =>
    index >= start
      && index < to
      && item.kind === 'paragraph'
      && (WRITING_SAMPLE_BOUNDARY.test(normalized(item.text))
        || LISTENING_TRANSCRIPT_HEADING.test(normalized(item.text))
        || LISTENING_TEXT_MARKER.test(normalized(item.text))
        || listeningCue(item.text)))
  const end = boundary >= 0 ? boundary : to
  const lines = answerBody
    .slice(start, end)
    .filter((item) => item.kind === 'paragraph' && normalized(item.text))
    .map((item) => trimEdgeSpaces(item.text))
  // Under a bare heading with no sample label, Chinese text first is scoring
  // or instructions, not the sample; leave it for review instead of keeping it.
  if (bareHeading && !labels.length && /\p{Script=Han}/u.test(lines[0] || '')) return ''
  return lines.join('\n')
}

function parseOfficialWritingSamples(answerBody, answerDocumentId, issues) {
  // OCR engines may return one source region containing several visually
  // distinct paragraphs. Split only for this answer-sample boundary parser;
  // every derived paragraph retains the exact source locator. DOCX/PDF
  // paragraph streams are unchanged by this normalization.
  const sampleBody = answerBody.flatMap((item) =>
    item.kind === 'paragraph' && String(item.text).includes('\n')
      ? String(item.text).split('\n').map((text) => ({ ...item, text }))
      : [item])
  const numberedSections = writingSamplePosition(sampleBody, [NUMBERED_WRITING_ANSWER_SECTION], 0)
  const writingSections = numberedSections.length
    ? numberedSections
    : writingSamplePosition(sampleBody, [BARE_WRITING_ANSWER_SECTION], 0)
  let applicationPatterns = APPLICATION_HEADINGS
  let continuationPatterns = CONTINUATION_HEADINGS
  if (writingSections.length === 0) {
    // Some answer books print only the two typed part headings ("应用文:" and
    // "读后续写:"). Without a writing part title a bare "第一节" is not
    // evidence, so only typed headings, each exactly once and in order, count.
    const typedApplication = APPLICATION_HEADINGS.filter((pattern) => pattern !== BARE_APPLICATION_HEADING)
    const typedContinuation = CONTINUATION_HEADINGS.filter((pattern) => pattern !== BARE_CONTINUATION_HEADING)
    const application = writingSamplePosition(sampleBody, typedApplication, 0)
    const continuation = writingSamplePosition(sampleBody, typedContinuation, 0)
    if (application.length === 1 && continuation.length === 1 && application[0] < continuation[0]) {
      writingSections.push(application[0] - 1)
      applicationPatterns = typedApplication
      continuationPatterns = typedContinuation
    } else {
      const sampleEvidence = sampleBody.find((item) => item.kind === 'paragraph'
        && [WRITING_SAMPLE_LABEL, /^Paragraph\s*1\s*[:：]/iu, ...typedApplication, ...typedContinuation]
          .some((pattern) => pattern.test(normalized(item.text))))
      if (sampleEvidence) {
        addIssue(issues, 'NCK1_ANSWER_WRITING_SAMPLE_BOUNDARY_AMBIGUOUS', 'answers.writingSamples',
          'Writing sample text appears without a recognized writing-answer section',
          sourceRef(answerDocumentId, sampleEvidence.sourceIndex))
      }
      return { application: null, continuation: null }
    }
  }
  if (writingSections.length !== 1) {
    addIssue(
      issues,
      'NCK1_ANSWER_WRITING_SAMPLE_BOUNDARY_AMBIGUOUS',
      'answers.writingSamples',
      `Expected one writing-answer section; found ${writingSections.length}`,
      sourceRef(answerDocumentId),
    )
    return { application: null, continuation: null }
  }
  const writingStart = writingSections[0]
  // Explanation pages after the key often repeat bare "第一节"/"第二节", so a
  // bare heading counts only when no typed heading names that part.
  const headings = (patterns, barePattern) => {
    const typed = writingSamplePosition(sampleBody, patterns.filter((pattern) => pattern !== barePattern), writingStart + 1)
    if (typed.length || !patterns.includes(barePattern)) return typed
    return writingSamplePosition(sampleBody, [barePattern], writingStart + 1)
  }
  const applicationHeadings = headings(applicationPatterns, BARE_APPLICATION_HEADING)
  const continuationHeadings = headings(continuationPatterns, BARE_CONTINUATION_HEADING)
  if (applicationHeadings.length !== 1 || continuationHeadings.length !== 1
    || applicationHeadings[0] >= continuationHeadings[0]) {
    addIssue(
      issues,
      'NCK1_ANSWER_WRITING_SAMPLE_BOUNDARY_AMBIGUOUS',
      'answers.writingSamples',
      'Official writing samples require one ordered application heading and one continuation heading',
      sourceRef(answerDocumentId, sampleBody[writingStart]?.sourceIndex),
    )
    return { application: null, continuation: null }
  }
  const bare = (index, pattern) => pattern.test(normalized(sampleBody[index].text))
  const application = writingSampleText(
    sampleBody,
    applicationHeadings[0] + 1,
    continuationHeadings[0],
    { bareHeading: bare(applicationHeadings[0], BARE_APPLICATION_HEADING) },
  )
  const continuation = writingSampleText(
    sampleBody,
    continuationHeadings[0] + 1,
    sampleBody.length,
    { bareHeading: bare(continuationHeadings[0], BARE_CONTINUATION_HEADING) },
  )
  if (!normalized(application) || !normalized(continuation)) {
    addIssue(
      issues,
      'NCK1_ANSWER_WRITING_SAMPLE_BOUNDARY_AMBIGUOUS',
      'answers.writingSamples',
      'Both official writing sample sections must contain source text before scoring or explanation material',
      sourceRef(answerDocumentId, sampleBody[writingStart]?.sourceIndex),
    )
    return { application: null, continuation: null }
  }
  return { application, continuation }
}

function activeAnswers(paperId, answerMap, issues, answerDocumentId) {
  const answers = []
  for (let number = 21; number <= 65; number += 1) {
    const parsed = answerMap.get(number)
    if (!parsed) {
      addIssue(issues, 'NCK1_DOCX_ANSWER_MISSING', `answers.${number}`,
        `Official answer ${number} is missing`, sourceRef(answerDocumentId))
      continue
    }
    answers.push({
      questionId: `question:${paperId}:${number}`,
      canonicalNumber: number,
      value: parsed.value,
      authority: parsed.authority,
    })
  }
  return answers
}

function listeningMaterialization({ paperId, questionBody, readingStart, answerBody, answerMap, questionDocumentId, answerDocumentId, coverageDocumentId, issues }) {
  const listeningHeading = optionalExactPosition(
    questionBody,
    /^第一部分\s*听力/u,
    'sections.listening',
    issues,
    questionDocumentId,
    [0, readingStart],
  )
  if (listeningHeading === null) {
    return {
      materialization: {
        state: 'not_supplied',
        evidence: {
          kind: 'question_source_reviewed_no_listening_content',
          documentId: coverageDocumentId,
        },
      },
      partition: {
        disposition: 'question_source_has_no_listening_section',
        heading: null,
        precedingContentBoundary: null,
        openingPreamble: [],
        segments: [],
        trailingItems: [],
      },
    }
  }
  const questions = readMcqQuestions({
    paperId, body: questionBody, from: 1, to: 20,
    rangeStart: listeningHeading + 1, rangeEnd: readingStart,
    family: 'listening', documentId: questionDocumentId, issues,
  }).map(({ sourceNumber: _sourceNumber, questionId: _questionId, blankId: _blankId, prompt: _prompt, ...question }) => question)
  const section2Heading = questionBody.findIndex((item, index) =>
    index > listeningHeading && index < readingStart
    && item.kind === 'paragraph' && /^第二节/u.test(normalized(item.text)))
  const section1Once = questionBody.slice(
    listeningHeading + 1,
    section2Heading < 0 ? readingStart : section2Heading,
  ).find((item) =>
    item.kind === 'paragraph' && /仅读一遍/u.test(normalized(item.text)))
  const answers = []
  for (let number = 1; number <= 20; number += 1) {
    const parsed = answerMap.get(number)
    if (!parsed) {
      addIssue(issues, 'NCK1_DOCX_LISTENING_ANSWER_MISSING', `listening.answers.${number}`,
        `Official Listening answer ${number} is missing`, sourceRef(answerDocumentId))
    } else answers.push({ canonicalNumber: number, ...parsed })
  }
  const ranges = []
  for (const item of questionBody.slice(listeningHeading + 1, readingStart)) {
    if (item.kind !== 'paragraph') continue
    const match = /回答第\s*(\d+)\s*(?:和|、|至|到|[-–—])\s*第?\s*(\d+)/u.exec(normalized(item.text))
    if (match) ranges.push({
      questionNumbers: Array.from(
        { length: Number(match[2]) - Number(match[1]) + 1 },
        (_, index) => Number(match[1]) + index,
      ),
      item,
    })
  }
  const longRanges = ranges.filter((range) => range.questionNumbers[0] >= 6)
  const longQuestionNumbers = longRanges.flatMap((range) => range.questionNumbers)
  if (longRanges.length !== 5
    || longQuestionNumbers.join(',') !== Array.from({ length: 15 }, (_, index) => index + 6).join(',')) {
    addIssue(issues, 'NCK1_DOCX_LISTENING_RANGES_AMBIGUOUS', 'listening.transcript',
      'Listening material ranges do not cover Questions 6-20 exactly once',
      sourceRef(questionDocumentId))
  }
  const firstMarkerIndex = answerBody.findIndex((item) =>
    item.kind === 'paragraph' && LISTENING_TEXT_MARKER.test(normalized(item.text)))
  const headingIndexes = answerBody.flatMap((item, index) =>
    index < firstMarkerIndex
      && item.kind === 'paragraph' && LISTENING_TRANSCRIPT_HEADING.test(normalized(item.text))
      ? [index]
      : [])
  const markers = answerBody.flatMap((item, index) => {
    const match = item.kind === 'paragraph'
      ? LISTENING_TEXT_MARKER.exec(normalized(item.text))
      : null
    return match ? [{ number: Number(match[1] || match[2]), index, item }] : []
  })
  const runIsOrdered = markers.length === 10
    && markers.every((marker, index) => marker.number === index + 1)
  if (!runIsOrdered) {
    addIssue(issues, 'NCK1_DOCX_LISTENING_TRANSCRIPT_AMBIGUOUS', 'listening.transcript',
      `Expected one unique ordered Text 1-10 run; found ${markers.map((marker) => marker.number).join(',') || 'none'}`,
      sourceRef(answerDocumentId, markers[0]?.item?.sourceIndex))
  }
  if (headingIndexes.length > 1) {
    addIssue(issues, 'NCK1_DOCX_LISTENING_TRANSCRIPT_AMBIGUOUS', 'listening.transcript',
      `Expected zero or one standalone Listening transcript title; found ${headingIndexes.length}`,
      sourceRef(answerDocumentId, answerBody[headingIndexes[1]]?.sourceIndex))
  }
  const headingIndex = headingIndexes.length === 1 ? headingIndexes[0] : -1
  if (headingIndex >= 0 && markers.some((marker) => marker.index < headingIndex)) {
    addIssue(issues, 'NCK1_DOCX_LISTENING_TRANSCRIPT_AMBIGUOUS', 'listening.transcript',
      'A Text marker precedes the standalone Listening transcript title',
      sourceRef(answerDocumentId, answerBody[headingIndex]?.sourceIndex))
  }
  const lastMarkerIndex = markers.at(-1)?.index ?? -1
  const analysis = lastMarkerIndex < 0 ? -1 : answerBody.findIndex((item, index) =>
    index > lastMarkerIndex && isAnswerExplanationHeading(item))
  const listeningEndIndexes = lastMarkerIndex < 0 ? [] : answerBody.flatMap((item, index) =>
    index > lastMarkerIndex && item.kind === 'paragraph'
      && listeningCue(item.text)?.kind === 'listening_end'
      ? [index]
      : [])
  const terminalIndex = listeningEndIndexes.length === 1 ? listeningEndIndexes[0] : -1
  const analysisBeforeEnd = analysis >= 0 && (terminalIndex < 0 || analysis < terminalIndex)
  const transcriptEnd = terminalIndex >= 0 && !analysisBeforeEnd
    ? terminalIndex + 1
    : analysis >= 0 ? analysis : answerBody.length
  if (listeningEndIndexes.length > 1) {
    addIssue(issues, 'NCK1_DOCX_LISTENING_TRANSCRIPT_AMBIGUOUS', 'listening.transcript',
      'Listening source contains duplicate end cues',
      sourceRef(answerDocumentId, answerBody[lastMarkerIndex]?.sourceIndex))
  }
  const transcriptParagraphs = answerBody
    .slice(Math.max(0, markers[0]?.index ?? 0), transcriptEnd)
    .filter((item) => item.kind === 'paragraph')
  const speakers = confirmedListeningSpeakers(transcriptParagraphs.map((item) => normalized(item.text)))
  const timingSourceIndexes = new Set(transcriptParagraphs
    .filter((item) => listeningTimingMetadata(normalized(item.text), speakers))
    .map((item) => item.sourceIndex))
  if (timingSourceIndexes.size > 0) {
    addIssue(issues, 'NCK1_DOCX_LISTENING_TIMING_REVIEW_REQUIRED', 'listening.timing',
      'Source-provided Listening duration or speed data requires exact Agent transcription',
      sourceRef(answerDocumentId, [...timingSourceIndexes][0]))
  }

  let precedingBoundaryIndex = headingIndex >= 0 ? headingIndex : markers[0]?.index - 1
  const openingPreambleIndexes = []
  if (markers[0]) {
    let cursor = markers[0].index - 1
    if (headingIndex >= 0) {
      for (let index = headingIndex + 1; index < markers[0].index; index += 1) {
        openingPreambleIndexes.push(index)
      }
    } else {
      while (cursor >= 0) {
        const item = answerBody[cursor]
        const cue = item?.kind === 'paragraph' ? listeningCue(item.text) : null
        if (!cue && !(item?.kind === 'paragraph' && !normalized(item.text))) break
        openingPreambleIndexes.unshift(cursor)
        cursor -= 1
      }
      precedingBoundaryIndex = cursor
    }
  }
  if (headingIndex < 0 && precedingBoundaryIndex >= 0
    && !/^略[。. ]?$/u.test(normalized(answerBody[precedingBoundaryIndex]?.text))) {
    addIssue(issues, 'NCK1_DOCX_LISTENING_TRANSCRIPT_AMBIGUOUS', 'listening.transcript',
      'Headingless Listening needs a closed preceding answer boundary; unknown preamble text cannot be discarded',
      sourceRef(answerDocumentId, answerBody[precedingBoundaryIndex]?.sourceIndex))
  }
  const precedingBoundary = precedingBoundaryIndex >= 0
    ? listeningItemRecord(answerBody[precedingBoundaryIndex], precedingBoundaryIndex,
      answerDocumentId, 'preceding_content_boundary',
      headingIndex >= 0 ? 'explicit_source_transcript_title' : 'last_source_item_before_bounded_marker_preamble')
    : null
  const recordPreambleItem = (index) => {
    const item = answerBody[index]
    const cue = item?.kind === 'paragraph' ? listeningCue(item.text) : null
    const empty = item?.kind === 'paragraph' && !normalized(item.text)
    const supported = Boolean(cue || empty)
    if (!supported || !hasSourceLocator(answerDocumentId, item?.sourceIndex)) {
      addIssue(issues, 'NCK1_DOCX_LISTENING_CUE_BOUNDARY_AMBIGUOUS', 'listening.transcript',
        !supported
          ? 'Unrecognized source content occurs between the transcript boundary and Text 1'
          : 'A preamble source item has no exact source locator',
        sourceRef(answerDocumentId, item?.sourceIndex))
    }
    const record = listeningItemRecord(item, index, answerDocumentId,
      cue?.disposition || (empty ? 'empty_separator' : 'unresolved'),
      cue?.reason || (empty ? 'source_blank_paragraph' : 'unrecognized_preamble_content'), cue?.kind)
    return record
  }
  const openingPreamble = openingPreambleIndexes.map(recordPreambleItem)
  for (const record of openingPreamble) {
    const cue = listeningCue(record.text)
    if (cue && Object.hasOwn(cue, 'nextTextNumber') && cue.nextTextNumber !== markers[0]?.number) {
      addIssue(issues, 'NCK1_DOCX_LISTENING_CUE_BOUNDARY_AMBIGUOUS', 'listening.transcript',
        'A section or end cue occurs in the opening preamble at the wrong source boundary',
        record.source ? sourceRef(answerDocumentId, record.source) : sourceRef(answerDocumentId))
    }
    if (!cue?.questionNumbers) continue
    const expectedNumbers = markers[0]
      ? markers[0].number <= 5
        ? [markers[0].number]
        : longRanges[markers[0].number - 6]?.questionNumbers || []
      : []
    const actualNumbers = listeningCue(record.text)?.questionNumbers || []
    if (!markers[0] || digestJson(actualNumbers) !== digestJson(expectedNumbers)
      || actualNumbers.some((number) => !questions.some((question) => question.canonicalNumber === number))) {
      addIssue(issues, 'NCK1_DOCX_LISTENING_ANNOUNCEMENT_RANGE_AMBIGUOUS', 'listening.transcript',
        'An opening question announcement does not match Text 1 and its source question range',
        record.source ? sourceRef(answerDocumentId, record.source) : sourceRef(answerDocumentId))
    }
  }
  const transcript = []
  const segmentRecords = []
  const inspectItem = (item, index, nextMarker) => {
    if (item?.kind !== 'paragraph') {
      addIssue(issues, 'NCK1_DOCX_LISTENING_MIXED_CONTENT_AMBIGUOUS', 'listening.transcript',
        'Listening source contains a table or unsupported mixed content inside the marker-bounded region',
        sourceRef(answerDocumentId, item?.sourceIndex))
      const record = listeningItemRecord(item, index, answerDocumentId, 'unresolved',
        'unsupported_mixed_source_item')
      return { record, text: null }
    }
    const text = typeof item.text === 'string' ? trimEdgeSpaces(item.text) : ''
    if (timingSourceIndexes.has(item.sourceIndex)) {
      const record = listeningItemRecord(item, index, answerDocumentId,
        'unresolved_source_timing', 'timing_requires_exact_agent_transcription')
      return { record, text: null }
    }
    const cue = listeningCue(text)
    if (cue) {
      if (Object.hasOwn(cue, 'nextTextNumber') && cue.nextTextNumber !== (nextMarker?.number ?? null)) {
        addIssue(issues, 'NCK1_DOCX_LISTENING_CUE_BOUNDARY_AMBIGUOUS', 'listening.transcript',
          'A section or end cue does not match its source Text boundary',
          sourceRef(answerDocumentId, item.sourceIndex))
      }
      if (cue.questionNumbers) {
        const expectedMarker = nextMarker
        const expectedNumbers = expectedMarker
          ? expectedMarker.number <= 5
            ? [expectedMarker.number]
            : longRanges[expectedMarker.number - 6]?.questionNumbers || []
          : []
        const sourceQuestionsExist = cue.questionNumbers.every((number) =>
          questions.some((question) => question.canonicalNumber === number))
        if (!expectedMarker || !sourceQuestionsExist
          || digestJson(cue.questionNumbers) !== digestJson(expectedNumbers)) {
          addIssue(issues, 'NCK1_DOCX_LISTENING_ANNOUNCEMENT_RANGE_AMBIGUOUS', 'listening.transcript',
            'A standalone question announcement does not match the next Text segment and source question range',
            sourceRef(answerDocumentId, item.sourceIndex))
        }
      }
      if (!hasSourceLocator(answerDocumentId, item.sourceIndex)) {
        addIssue(issues, 'NCK1_DOCX_LISTENING_SOURCE_LOCATOR_MISSING', 'listening.transcript',
          'A standalone broadcast item has no exact source locator',
          sourceRef(answerDocumentId, item.sourceIndex))
      }
      const record = listeningItemRecord(item, index, answerDocumentId,
        cue.disposition, cue.reason, cue.kind)
      return { record, text: null }
    }
    if (!normalized(text)) {
      const record = listeningItemRecord(item, index, answerDocumentId,
        'empty_separator', 'source_blank_paragraph')
      return { record, text: null }
    }
    if (containsEmbeddedListeningCue(text)) {
      addIssue(issues, 'NCK1_DOCX_LISTENING_CUE_BOUNDARY_AMBIGUOUS', 'listening.transcript',
        'A possible exam cue is embedded in a source speech item and cannot be safely separated',
        sourceRef(answerDocumentId, item.sourceIndex))
    }
    if (!hasSourceLocator(answerDocumentId, item.sourceIndex)) {
      addIssue(issues, 'NCK1_DOCX_LISTENING_SOURCE_LOCATOR_MISSING', 'listening.transcript',
        'A transcript source item has no exact source locator',
        sourceRef(answerDocumentId, item.sourceIndex))
    }
    const record = listeningItemRecord(item, index, answerDocumentId,
      'retained_question_bearing_speech', 'not_an_anchored_standalone_exam_cue', 'dialogue_or_monologue')
    return { record, text }
  }
  if (runIsOrdered && markers.every((marker) => marker.index < transcriptEnd)
    && (headingIndex < 0 || headingIndex < markers[0].index)) {
    for (const [segmentIndex, marker] of markers.entries()) {
      const nextMarker = markers[segmentIndex + 1] || null
      const boundary = nextMarker?.index ?? transcriptEnd
      const bodyTexts = []
      const bodyRecords = []
      let broadcastStarted = false
      for (let index = marker.index + 1; index < boundary; index += 1) {
        const inspected = inspectItem(answerBody[index], index, nextMarker)
        bodyRecords.push(inspected.record)
        if (inspected.record.disposition === 'excluded_exam_broadcast') {
          if (bodyTexts.length === 0) {
            addIssue(issues, 'NCK1_DOCX_LISTENING_CUE_BOUNDARY_AMBIGUOUS', 'listening.transcript',
              'A broadcast cannot be excluded before a nonempty question-bearing body',
              sourceRef(answerDocumentId, answerBody[index].sourceIndex))
          }
          broadcastStarted = true
        } else if (inspected.text !== null && broadcastStarted) {
          addIssue(issues, 'NCK1_DOCX_LISTENING_CUE_BOUNDARY_AMBIGUOUS', 'listening.transcript',
            'Speech resumes after an apparent broadcast; the boundary is not proven',
            sourceRef(answerDocumentId, answerBody[index].sourceIndex))
        }
        if (inspected.text !== null) bodyTexts.push(inspected.text)
      }
      const questionNumbers = marker.number <= 5
        ? [marker.number]
        : longRanges[marker.number - 6]?.questionNumbers || []
      const markerRecord = listeningItemRecord(marker.item, marker.index, answerDocumentId,
        'segment_boundary', 'exact_ordered_text_marker', 'text_marker')
      const text = bodyTexts.join('\n')
      if (!normalized(text)) {
        addIssue(issues, 'NCK1_DOCX_LISTENING_TRANSCRIPT_AMBIGUOUS', 'listening.transcript',
          `Text ${marker.number} has no nonempty retained transcript body`,
          sourceRef(answerDocumentId, marker.item?.sourceIndex))
      }
      if (!hasSourceLocator(answerDocumentId, marker.item?.sourceIndex)) {
        addIssue(issues, 'NCK1_DOCX_LISTENING_SOURCE_LOCATOR_MISSING', 'listening.transcript',
          `Text ${marker.number} marker has no exact source locator`,
          sourceRef(answerDocumentId, marker.item?.sourceIndex))
      }
      const firstBodyItem = answerBody.slice(marker.index + 1, boundary).find((item) =>
        item.kind === 'paragraph' && normalized(item.text)
          && !listeningCue(item.text) && !timingSourceIndexes.has(item.sourceIndex)
          && hasSourceLocator(answerDocumentId, item.sourceIndex))
      transcript.push({
        segmentId: `listening-text-${marker.number}`,
        text,
        questionNumbers,
        ...(firstBodyItem ? { source: sourceLocator(answerDocumentId, firstBodyItem.sourceIndex) } : {}),
      })
      segmentRecords.push({
        textNumber: marker.number,
        questionNumbers,
        previousTextMarker: segmentIndex > 0
          ? listeningItemRecord(markers[segmentIndex - 1].item, markers[segmentIndex - 1].index,
              answerDocumentId, 'segment_boundary', 'previous_ordered_text_marker', 'text_marker')
          : null,
        textMarker: markerRecord,
        nextTextMarker: nextMarker
          ? listeningItemRecord(nextMarker.item, nextMarker.index,
              answerDocumentId, 'segment_boundary', 'next_ordered_text_marker', 'text_marker')
          : null,
        bodyItems: bodyRecords,
        textDigest: digestJson(text),
      })
    }
  }
  const trailingItems = []
  const trailingEnd = analysis >= 0 ? analysis : answerBody.length
  if (terminalIndex >= 0) {
    for (let index = terminalIndex + 1; index < trailingEnd; index += 1) {
      const item = answerBody[index]
      const isBlank = item?.kind === 'paragraph' && !normalized(item.text)
      if (!isBlank) {
        addIssue(issues, 'NCK1_DOCX_LISTENING_TRANSCRIPT_AMBIGUOUS', 'listening.transcript',
          'Source content follows the listening end boundary without a proven new section',
          sourceRef(answerDocumentId, item?.sourceIndex))
      }
      trailingItems.push(listeningItemRecord(item, index, answerDocumentId,
        isBlank ? 'empty_separator' : 'unresolved',
        isBlank ? 'source_blank_paragraph' : 'unclosed_source_tail'))
    }
  }
  const partition = {
    disposition: headingIndex >= 0 ? 'explicit_transcript_title' : 'headingless_ordered_text_markers',
    heading: headingIndex >= 0
      ? listeningItemRecord(answerBody[headingIndex], headingIndex, answerDocumentId,
          'transcript_boundary', 'explicit_standalone_source_title', 'transcript_title')
      : null,
    precedingContentBoundary: precedingBoundary,
    openingPreamble,
    questionSourceRanges: ranges.map(({ questionNumbers, item }) => ({
      questionNumbers,
      source: hasSourceLocator(questionDocumentId, item.sourceIndex)
        ? sourceLocator(questionDocumentId, item.sourceIndex)
        : null,
    })),
    segments: segmentRecords,
    analysisBoundary: analysis >= 0
      ? listeningItemRecord(answerBody[analysis], analysis, answerDocumentId,
          'source_section_boundary', 'answer_analysis_begins_after_transcript')
      : null,
    listeningEndBoundary: terminalIndex >= 0
      ? listeningItemRecord(answerBody[terminalIndex], terminalIndex, answerDocumentId,
          'source_section_boundary', 'anchored_listening_end_cue', 'listening_end')
      : null,
    ...(terminalIndex < 0 && analysis < 0 ? { endBoundary: 'source_document_end' } : {}),
    trailingItems,
  }
  return {
    materialization: {
      state: 'captured', questions, answers, transcript,
      timing: section1Once ? [{
        kind: 'section1_playback',
        passes: 1,
        source: sourceLocator(questionDocumentId, section1Once.sourceIndex),
      }] : [],
    },
    partition,
  }
}

function documentRecord(document) {
  return {
    documentId: document.documentId,
    role: document.role,
    mediaType: document.mediaType,
    sha256: document.sha256,
    byteLength: document.byteLength,
    pageCount: document.pageCount,
  }
}

function identifyEmbeddedMedia(bytes, declaredMimeType) {
  const [pixelWidth, pixelHeight, format] = execFileSync(
    'magick', ['identify', '-format', '%w,%h,%m', '-'], {
      encoding: 'utf8',
      input: bytes,
    },
  ).split(',')
  const mimeType = ({ PNG: 'image/png', JPEG: 'image/jpeg', WEBP: 'image/webp' })[format]
  if (
    mimeType !== declaredMimeType
    || !Number.isInteger(Number(pixelWidth))
    || Number(pixelWidth) < 1
    || !Number.isInteger(Number(pixelHeight))
    || Number(pixelHeight) < 1
  ) throw new Error('Embedded media bytes do not match their supported image declaration')
  return {
    pixelWidth: Number(pixelWidth),
    pixelHeight: Number(pixelHeight),
  }
}

function prepareDocxEmbeddedMedia({ paperId, structure, documentId, issues }) {
  const media = []
  const mediaFiles = []
  let ordinal = 0
  const prepare = (owner, path, text) => {
    if (!owner.containsDrawing) return
    const candidates = owner.embeddedMedia || []
    if (candidates.length !== 1 || normalized(text)) {
      addIssue(
        issues,
        'NCK1_DOCX_MEDIA_ASSOCIATION_AMBIGUOUS',
        path,
        'A DOCX media placement must be one image-only source paragraph or table cell',
        sourceRef(documentId, candidates[0]?.sourceIndex),
      )
      return
    }
    const candidate = candidates[0]
    if (!candidate.supported) {
      const layoutUnsupported = candidate.drawingMode === 'anchor'
        || candidate.presentation === null
      addIssue(
        issues,
        layoutUnsupported
          ? 'NCK1_DOCX_MEDIA_LAYOUT_UNSUPPORTED'
          : 'NCK1_DOCX_MEDIA_ASSOCIATION_AMBIGUOUS',
        path,
        layoutUnsupported
          ? 'Anchored, oversized, unusually spaced, or nonstandard-aligned DOCX media is outside the shared layout intent'
          : 'DOCX media must bind one internal PNG/JPEG/WebP relationship and exact extent',
        sourceRef(documentId, candidate.sourceIndex),
      )
      return
    }
    let dimensions
    try {
      dimensions = identifyEmbeddedMedia(candidate.bytes, candidate.mimeType)
    } catch (error) {
      addIssue(
        issues,
        'NCK1_DOCX_MEDIA_ASSOCIATION_AMBIGUOUS',
        path,
        error.message,
        sourceRef(documentId, candidate.sourceIndex),
      )
      return
    }
    ordinal += 1
    const mediaId = `media:${paperId}:docx-${candidate.sourceIndex}-${ordinal}`
    owner.materializedMedia = { mediaId }
    media.push({
      mediaId,
      usage: 'content',
      kind: 'figure',
      mimeType: candidate.mimeType,
      sha256: sha256(candidate.bytes),
      ...dimensions,
      extraction: {
        kind: 'docx_media',
        documentId,
        entryName: candidate.entryName,
      },
      presentation: structuredClone(candidate.presentation),
      publication: {
        selection: 'source_crop',
        sourceSha256: sha256(candidate.bytes),
      },
    })
    mediaFiles.push({ mediaId, bytes: candidate.bytes })
  }
  for (const [bodyIndex, item] of structure.body.entries()) {
    if (item.kind === 'paragraph') {
      prepare(item, `documents.${documentId}.body[${bodyIndex}]`, item.text)
      continue
    }
    for (const [rowIndex, row] of item.rows.entries()) {
      for (const [cellIndex, cell] of row.cells.entries()) {
        prepare(
          cell,
          `documents.${documentId}.tables[${item.tableIndex}].rows[${rowIndex}].cells[${cellIndex}]`,
          cell.text,
        )
      }
    }
  }
  return { media, mediaFiles }
}

function referencedGroupMediaIds(groups) {
  const ids = new Set()
  const visitBlocks = (blocks) => {
    for (const block of blocks || []) {
      if (block.kind === 'figure') ids.add(block.mediaId)
      if (block.kind === 'table') {
        for (const row of block.rows) {
          for (const cell of row.cells) {
            for (const item of cell.content) {
              if (item.kind === 'media_ref') ids.add(item.mediaId)
            }
          }
        }
      }
      if (block.kind === 'framed_columns') {
        for (const column of block.columns) visitBlocks(column.blocks)
      }
    }
  }
  for (const candidate of groups) visitBlocks(candidate.blocks)
  return ids
}

export function nck1DocxProducerSourceDigest(documents, { producerVersion = NCK1_DOCX_MATERIALIZATION_PRODUCER_VERSION } = {}) {
  return digestJson({
    producerVersion,
    documents: documents.map((document) => ({
      documentId: document.documentId,
      sha256: document.sha256,
      byteLength: document.byteLength,
    })),
  })
}

function carrierIssues(issues, codePrefix) {
  return issues.map(({ code, path, message, source }) => ({
    code: code.replace(/^NCK1_DOCX_/u, `${codePrefix}_`),
    path,
    message,
    source,
  }))
}

export function produceNck1MaterializationFromStructures({
  paperId,
  documents,
  question,
  answer,
  coverage,
  questionStructure,
  answerStructure,
  issues,
  sourceVisuals = [],
  codePrefix,
  producerVersion,
  reviewSchemaVersion,
  sourceDigest,
  mediaInventory = [],
  mediaFiles = [],
}) {
  const body = questionStructure.body
  const answerBody = answerStructure.body
  const readingStart = exactPosition(body, /^第二部分\s*阅读/u, 'sections.reading', issues, question?.documentId)
  const languageStart = exactPosition(body, /^第三部分\s*语言(?:知识)?运用/u, 'sections.language', issues, question?.documentId)
  const writingStart = exactPosition(body, /^第四部分\s*写作/u, 'sections.writing', issues, question?.documentId)
  const readingFirst = readingStart === null || languageStart === null ? null : exactPosition(
    body, /^第一节/u, 'sections.reading.first', issues, question?.documentId,
    [readingStart + 1, languageStart],
  )
  const readingSecond = readingStart === null || languageStart === null ? null : exactPosition(
    body, /^第二节/u, 'sections.reading.second', issues, question?.documentId,
    [readingStart + 1, languageStart],
  )
  const languageFirst = languageStart === null || writingStart === null ? null : exactPosition(
    body, /^第一节/u, 'sections.language.first', issues, question?.documentId,
    [languageStart + 1, writingStart],
  )
  const languageSecond = languageStart === null || writingStart === null ? null : exactPosition(
    body, /^第二节/u, 'sections.language.second', issues, question?.documentId,
    [languageStart + 1, writingStart],
  )
  const writingFirst = writingStart === null ? null : exactPosition(
    body, /^第一节/u, 'sections.writing.first', issues, question?.documentId,
    [writingStart + 1, body.length],
  )
  const writingSecond = writingStart === null ? null : exactPosition(
    body, /^第二节/u, 'sections.writing.second', issues, question?.documentId,
    [writingStart + 1, body.length],
  )
  const officialWritingSamples = parseOfficialWritingSamples(
    answerBody,
    answer?.documentId,
    issues,
  )
  let groups = []
  if (question && answer && coverage
    && [readingFirst, readingSecond, languageFirst, languageSecond, writingFirst, writingSecond]
    .every((position) => position !== null)) {
    groups = readingGroups({
      paperId, body, firstStart: readingFirst, secondStart: readingSecond,
      documentId: question.documentId, issues,
    })
    groups.push(sevenChoices({
      paperId, body, start: readingSecond, end: languageStart,
      documentId: question.documentId, issues,
    }))
    groups.push(clozeGroup({
      paperId, body, start: languageFirst, end: languageSecond,
      documentId: question.documentId, issues,
    }))
    groups.push(blankGroup({
      paperId, slotId: 'grammar-fill', family: 'grammar-fill',
      items: body.slice(languageSecond + 2, writingStart), from: 56, to: 65,
      documentId: question.documentId, issues,
    }))
    groups.push(writingGroup({
      paperId, slotId: 'writing.application', family: 'application-writing',
      items: body.slice(writingFirst + 1, writingSecond),
      documentId: question.documentId,
      officialModelAnswer: officialWritingSamples.application,
      issues,
    }))
    groups.push(writingGroup({
      paperId, slotId: 'writing.continuation', family: 'continuation-writing',
      items: body.slice(writingSecond + 1),
      documentId: question.documentId,
      officialModelAnswer: officialWritingSamples.continuation,
      issues,
    }))
  }
  const answerMap = parseOfficialAnswers(answerBody, answer?.documentId, issues)
  const answers = activeAnswers(paperId, answerMap, issues, answer?.documentId)
  const tables = groups.flatMap((candidate) => candidate.blocks.filter((block) => block.kind === 'table'))
  if (
    tables.some((table) => table.source.kind !== 'page_region')
    && coverage?.pageCount !== 1
  ) {
    addIssue(issues, 'NCK1_DOCX_TABLE_PAGE_REVIEW_REQUIRED', 'sourceCoverage.visuals',
      'Semantic table page locations require Agent confirmation for multi-page renditions',
      sourceRef(coverage.documentId))
  }
  const referencedMediaIds = referencedGroupMediaIds(groups)
  for (const item of mediaInventory) {
    if (referencedMediaIds.has(item.mediaId)) continue
    addIssue(
      issues,
      'NCK1_DOCX_MEDIA_ASSOCIATION_AMBIGUOUS',
      `media.${item.mediaId}`,
      'A DOCX image was captured but could not be associated with one Canonical question group',
      sourceRef(item.extraction.documentId),
    )
  }
  const selectedMedia = mediaInventory.filter((item) => referencedMediaIds.has(item.mediaId))
  const selectedMediaFiles = mediaFiles.filter((item) => referencedMediaIds.has(item.mediaId))
  const sourceCoverage = {
    documentId: coverage?.documentId || 'unresolved-question-rendition',
    reviewedPages: coverage
      ? Array.from({ length: coverage.pageCount }, (_, index) => index + 1)
      : [],
    visuals: [
      ...tables.map((table, index) => {
        const visual = {
          visualId: `visual:${paperId}:table-${index + 1}`,
          page: table.source.kind === 'page_region' ? table.source.page : 1,
          disposition: 'semantic_table',
          targetId: table.blockId,
        }
        if (table.source.kind === 'page_region') {
          visual.region = structuredClone(table.source.region)
        }
        return visual
      }),
      ...sourceVisuals.map((visual) => structuredClone(visual)),
      ...(coverage?.pageCount === 1
        ? selectedMedia.filter(item => !sourceVisuals.some(visual => visual.targetId === item.mediaId)).map((item, index) => ({
            visualId: `visual:${paperId}:media-${index + 1}`,
            page: 1,
            disposition: 'content_media',
            targetId: item.mediaId,
          }))
        : []),
    ],
  }
  const listeningResult = !question || !answer || readingStart === null
    ? {
        materialization: {
          state: 'not_supplied',
          evidence: { kind: 'question_source_reviewed_no_listening_content', documentId: sourceCoverage.documentId },
        },
        partition: {
          disposition: 'listening_source_boundary_not_evaluated',
          heading: null,
          precedingContentBoundary: null,
          openingPreamble: [],
          segments: [],
          trailingItems: [],
        },
      }
    : listeningMaterialization({
        paperId, questionBody: body, readingStart, answerBody, answerMap,
        questionDocumentId: question.documentId, answerDocumentId: answer.documentId,
        coverageDocumentId: sourceCoverage.documentId, issues,
      })
  const listening = listeningResult.materialization
  const materialization = {
    schemaVersion: selectedMedia.length > 0
      ? 'nck1-source-materialization-v2'
      : 'nck1-source-materialization-v1',
    paperId,
    profileId: 'nck1',
    documents: documents.map(documentRecord),
    groups,
    answers,
    media: selectedMedia,
    sourceCoverage,
    listening,
    issues: carrierIssues(issues, codePrefix),
  }
  if (issues.length === 0) {
    for (const invalid of validateNck1SourceMaterialization(materialization)) {
      addIssue(issues, `${codePrefix}_${invalid.code}`, invalid.path, invalid.message)
    }
    materialization.issues = carrierIssues(issues, codePrefix)
  }
  const listeningSourcePartition = {
    schemaVersion: 'nck1-listening-source-partition-v1',
    paperId,
    producerVersion,
    producerSourceDigest: sourceDigest,
    sourceDocuments: documents.map((document) => ({
      documentId: document.documentId,
      role: document.role,
      sha256: document.sha256,
      byteLength: document.byteLength,
    })),
    ...listeningResult.partition,
    originalMaterializationOutputDigest: sha256(
      new TextEncoder().encode(`${JSON.stringify(materialization, null, 2)}\n`),
    ),
  }
  const required = carrierIssues(issues, codePrefix)
  return {
    disposition: issues.length === 0 ? 'ready_for_verification' : 'needs_agent_review',
    materialization,
    mediaFiles: selectedMediaFiles,
    review: {
      schemaVersion: reviewSchemaVersion,
      paperId,
      producerVersion,
      sourceDigest,
      required,
      listeningSourcePartition,
      agentTasks: [
        ...SLOT_SPECS.map(([slotId]) => ({
          kind: 'reading_source_roles', slotId, parallelizableRead: true,
        })),
        { kind: 'writing_analysis', slotId: 'writing.application', parallelizableRead: true },
        { kind: 'writing_analysis', slotId: 'writing.continuation', parallelizableRead: true },
      ],
      singleWriter: {
        paperId,
        policy: 'one_import_writer_per_paper',
        parallelReadAllowed: [...SLOT_SPECS.map(([slotId]) => slotId), 'writing.application', 'writing.continuation'],
      },
    },
  }
}

export function produceNck1DocxMaterialization({ paperId, documents }) {
  if (!/^paper-[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(paperId || '')) {
    throw new TypeError('NCK1 DOCX materialization requires one valid paperId')
  }
  if (!Array.isArray(documents)) throw new TypeError('NCK1 DOCX materialization requires captured documents')
  const issues = []
  for (const document of documents) {
    if (!(document.bytes instanceof Uint8Array)) {
      addIssue(issues, 'NCK1_DOCX_SOURCE_BYTES_MISSING', `documents.${document.documentId}`,
        'Captured source bytes are unavailable', sourceRef(document.documentId))
      continue
    }
    if (sha256(document.bytes) !== document.sha256 || document.bytes.byteLength !== document.byteLength) {
      addIssue(issues, 'NCK1_DOCX_SOURCE_DIGEST_MISMATCH', `documents.${document.documentId}`,
        'Source bytes no longer match immutable Source Capture', sourceRef(document.documentId))
    }
  }
  const questionDocs = documents.filter((document) =>
    document.role === 'question_source' && document.mediaType === DOCX)
  const answerDocs = documents.filter((document) =>
    document.role === 'official_answers' && document.mediaType === DOCX)
  const combinedDocs = documents.filter((document) =>
    document.role === 'question_and_answers' && document.mediaType === DOCX)
  const separateSourceSet = questionDocs.length === 1
    && answerDocs.length === 1
    && combinedDocs.length === 0
  const combinedSourceSet = questionDocs.length === 0
    && answerDocs.length === 0
    && combinedDocs.length === 1
  const question = separateSourceSet ? questionDocs[0] : combinedDocs[0]
  const answer = separateSourceSet ? answerDocs[0] : combinedDocs[0]
  const rendition = documents.find((document) =>
    document.mediaType === 'application/pdf'
    && document.documentId === question?.renditionDocumentId
    && document.renditionOf === question?.documentId)
  if ((!separateSourceSet && !combinedSourceSet) || !rendition) {
    addIssue(issues, 'NCK1_DOCX_SOURCE_SET_AMBIGUOUS', 'documents',
      'Producer requires either one question DOCX plus one official-answer DOCX, or one combined DOCX, with the question-bearing PDF rendition')
  }
  let questionStructure = { body: [], unsupportedParagraphCount: 0, tables: [] }
  let answerStructure = { body: [], unsupportedParagraphCount: 0, tables: [] }
  try {
    if (question) questionStructure = extractDocxDocumentStructure(question.bytes)
    if (question && answer === question) {
      const split = splitNck1CombinedSourceStructure(
        questionStructure,
        question?.documentId,
        issues,
      )
      questionStructure = split.questionStructure
      answerStructure = split.answerStructure
    } else if (answer) {
      answerStructure = extractDocxDocumentStructure(answer.bytes)
    }
  } catch (error) {
    addIssue(issues, 'NCK1_DOCX_STRUCTURE_UNREADABLE', 'documents',
      error.message, null)
  }
  if (questionStructure.unsupportedParagraphCount || answerStructure.unsupportedParagraphCount) {
    addIssue(issues, 'NCK1_DOCX_CONTAINER_UNSUPPORTED', 'documents',
      'DOCX contains paragraphs outside supported body paragraph/table containers')
  }
  if (answerStructure.tables.length > 0) {
    addIssue(issues, 'NCK1_DOCX_ANSWER_TABLE_REVIEW_REQUIRED', 'documents.official_answers',
      'Official answers in DOCX tables require Agent confirmation', sourceRef(answer?.documentId))
  }
  const preparedMedia = question
    ? prepareDocxEmbeddedMedia({
        paperId,
        structure: questionStructure,
        documentId: question.documentId,
        issues,
      })
    : { media: [], mediaFiles: [] }
  return produceNck1MaterializationFromStructures({
    paperId,
    documents,
    question,
    answer,
    coverage: rendition,
    questionStructure,
    answerStructure,
    issues,
    codePrefix: 'NCK1_DOCX',
    producerVersion: NCK1_DOCX_MATERIALIZATION_PRODUCER_VERSION,
    reviewSchemaVersion: 'nck1-docx-materialization-review-v1',
    sourceDigest: nck1DocxProducerSourceDigest(documents),
    mediaInventory: preparedMedia.media,
    mediaFiles: preparedMedia.mediaFiles,
  })
}
