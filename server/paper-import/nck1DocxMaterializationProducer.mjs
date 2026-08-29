import { extractDocxDocumentStructure } from '../paper-canonical/docxSourceAdapter.mjs'
import { validateNck1SourceMaterialization } from '../../shared/paper-canonical/nck1SourceMaterialization.mjs'
import { digestJson, sha256 } from '../../shared/paper-canonical/stable.mjs'

export const NCK1_DOCX_MATERIALIZATION_PRODUCER_VERSION =
  'nck1-docx-materialization-producer-v2'

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const BLANK = /(?:\d{1,3}[.．、]?\p{Zs}*)?_{2,}\d{0,3}_{0,}/gu
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

function parseOptions(items, labels) {
  const paragraphs = items.filter((item) => item.kind === 'paragraph')
  for (let end = 1; end <= paragraphs.length; end += 1) {
    const text = paragraphs.slice(0, end)
      .map((item) => item.text)
      .join('\n')
      .replace(/^\s*\d{1,3}[.．、]\s*/u, '')
    const matches = [...text.matchAll(
      /(?:^|[\t\n]| {2,})([A-G])(?:[.．、]\s*|\s+)/gu,
    )]
    if (
      matches.length !== labels.length
      || matches.some((match, index) => match[1] !== labels[index])
    ) continue
    const options = matches.map((match, index) => ({
      label: match[1],
      text: trimEdgeSpaces(text.slice(
        match.index + match[0].length,
        matches[index + 1]?.index ?? text.length,
      )),
    }))
    if (options.every((option) => normalized(option.text))) return options
  }
  return null
}

function contentWithBlanks(text, blankBySourceNumber, issues, path, source) {
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
  if (content[0]?.kind === 'text') content[0].text = trimEdgeSpaces(content[0].text)
  if (content.at(-1)?.kind === 'text') content.at(-1).text = trimEdgeSpaces(content.at(-1).text)
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
      cell.containsDrawing
      || cell.containsNestedTable
      || cell.verticalMerge !== null
      || normalized(cell.text).length === 0))
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
            content: normalized(cell.text)
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
    if (item.kind === 'paragraph' && normalized(item.text).length === 0) return []
    if (item.kind === 'paragraph' && item.containsDrawing) {
      addIssue(context.issues, 'NCK1_DOCX_VISUAL_REVIEW_REQUIRED',
        `groups.${context.slotId}.blocks[${index}]`,
        'A source paragraph contains a drawing that requires Agent visual confirmation',
        sourceRef(context.documentId, item.sourceIndex))
    }
    return [item.kind === 'table'
      ? tableBlock({ ...context, item, index })
      : paragraphBlock({ ...context, item, index })]
  })
}

function objectiveQuestion({ paperId, canonicalNumber, family, questionItem, questionItems, blankItem = questionItem, prompt = null, documentId, issues }) {
  const sourceNumber = Number(/^(\d{1,3})[.．、]/u.exec(normalized(questionItem?.text))?.[1])
  const labels = family === 'listening' ? ['A', 'B', 'C'] : ['A', 'B', 'C', 'D']
  const options = ['reading', 'cloze', 'listening'].includes(family)
    ? parseOptions(questionItems, labels)
    : []
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
    ? trimEdgeSpaces(String(questionItem?.text || '').replace(/^\s*\d{1,3}[.．、]\s*/u, ''))
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
    if (blocks[0]?.kind === 'paragraph') blocks[0].role = 'title'
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
      question.source = sourceLocator(documentId, matches[index].item.sourceIndex)
    }
  }
  const blocks = contentBlocks(passageItems, {
    paperId, slotId: 'cloze', documentId, issues, role: 'body', blanks,
  })
  return group(paperId, 'cloze', 'cloze', blocks, questions)
}

function wordCount(items) {
  const text = items.map((item) => item.text || '').join(' ')
  const match = /词数[^0-9]{0,20}(\d{2,3})|(?:about\s+)?(\d{2,3})\s*words?/iu.exec(text)
  return Number(match?.[1] || match?.[2] || 0)
}

function isAnswerExplanationHeading(item) {
  return item.kind === 'paragraph'
    && /^(?:【)?(?:答案)?(?:解析|详解)(?:】)?/u.test(normalized(item.text))
}

function writingAnswerRanges(answerBody, issues, answerDocumentId) {
  const writing = answerBody.findIndex((item) =>
    item.kind === 'paragraph' && /^第四部分\s*写作/u.test(normalized(item.text)))
  const analysis = answerBody.findIndex(isAnswerExplanationHeading)
  if (writing < 0) return { application: null, continuation: null }
  const first = answerBody.findIndex((item, index) => index > writing
    && item.kind === 'paragraph' && /^第一节/u.test(normalized(item.text)))
  const second = answerBody.findIndex((item, index) => index > first
    && item.kind === 'paragraph' && /^第二节/u.test(normalized(item.text)))
  if (first < 0 || second < 0) {
    addIssue(issues, 'NCK1_DOCX_WRITING_ANSWER_AMBIGUOUS', 'answers.writing',
      'Official writing answer section is not closed', sourceRef(answerDocumentId))
    return { application: null, continuation: null }
  }
  const stop = answerBody.findIndex((item, index) => index > second
    && item.kind === 'paragraph'
    && (/听力原文/u.test(normalized(item.text)) || isAnswerExplanationHeading(item)))
  const join = (items) => {
    const text = items.filter((item) => item.kind === 'paragraph' && normalized(item.text))
      .map((item) => trimEdgeSpaces(item.text)).join('\n')
    return text || null
  }
  return {
    application: join(answerBody.slice(first + 1, second)),
    continuation: join(answerBody.slice(second + 1, stop < 0 ? (analysis < 0 ? answerBody.length : analysis) : stop)),
  }
}

function skeletonRole(text, index, givens) {
  if (/^Dear\b.*[,，]$/iu.test(text)) return 'salutation'
  if (/^(?:Yours|Sincerely|Best(?: wishes| regards)?)[,，]?$/iu.test(text)) return 'closing'
  if (index > 0 && ['closing'].includes(skeletonRole(givens[index - 1] || '', -1, []))) return 'signature'
  if (givens.length === 1 && !/[.!?。！？]$/u.test(text)) return 'title'
  return null
}

function writingGroup({ paperId, slotId, family, items, documentId, officialModelAnswer, issues }) {
  const meaningful = items.filter((item) => item.kind !== 'paragraph' || normalized(item.text))
  const promptItem = meaningful[0]
  const noticeIndex = meaningful.findIndex((item) =>
    item.kind === 'paragraph' && /^注意(?:事项)?[:：]/u.test(normalized(item.text)))
  if (!promptItem || noticeIndex < 1) {
    addIssue(issues, 'NCK1_DOCX_WRITING_BOUNDARY_AMBIGUOUS', `groups.${slotId}`,
      'Writing prompt and 注意 boundary are not closed', sourceRef(documentId))
    return emptyGroup(paperId, slotId, family)
  }
  let noticeEnd = noticeIndex
  while (meaningful[noticeEnd + 1]?.kind === 'paragraph'
    && /^(?:\(\d+\)|\d+[.、．])/u.test(normalized(meaningful[noticeEnd + 1].text))) {
    noticeEnd += 1
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
    wordCountTarget: wordCount(meaningful.slice(noticeIndex, noticeEnd + 1)),
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

function parseOfficialAnswers(answerBody, answerDocumentId, issues) {
  const cutoff = answerBody.findIndex((item) =>
    item.kind === 'paragraph'
    && (/^第四部分\s*写作/u.test(normalized(item.text)) || isAnswerExplanationHeading(item)))
  const source = answerBody.slice(0, cutoff < 0 ? answerBody.length : cutoff)
  const answers = new Map()
  const add = (number, value, item) => {
    const previous = answers.get(number)
    const cleaned = String(value).trim()
    if (previous && previous.value !== cleaned) {
      addIssue(issues, 'NCK1_DOCX_ANSWER_CONFLICT', `answers.${number}`,
        'Official answer source contains conflicting values',
        sourceRef(answerDocumentId, item.sourceIndex))
      return
    }
    answers.set(number, {
      value: cleaned,
      authority: sourceLocator(answerDocumentId, item.sourceIndex),
    })
  }
  for (const item of source) {
    if (item.kind !== 'paragraph') continue
    for (const match of item.text.matchAll(/(\d{1,2})\s*[-–—~至]\s*(\d{1,2})\s*([A-G]+)/gu)) {
      const from = Number(match[1])
      const to = Number(match[2])
      if (match[3].length !== to - from + 1) {
        addIssue(issues, 'NCK1_DOCX_ANSWER_RANGE_AMBIGUOUS', `answers.${from}-${to}`,
          'Official answer range length does not match its labels',
          sourceRef(answerDocumentId, item.sourceIndex))
        continue
      }
      ;[...match[3]].forEach((value, index) => add(from + index, value, item))
    }
    for (const match of item.text.matchAll(
      /(\d{1,2})\s*[.．、]\s*(.*?)(?=(?:\d{1,2})\s*[.．、]|$)/gu,
    )) {
      if (Number(match[1]) >= 56 && normalized(match[2])) add(Number(match[1]), match[2], item)
    }
  }
  return answers
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
      state: 'not_supplied',
      evidence: {
        kind: 'question_source_reviewed_no_listening_content',
        documentId: coverageDocumentId,
      },
    }
  }
  const questions = readMcqQuestions({
    paperId, body: questionBody, from: 1, to: 20,
    rangeStart: listeningHeading + 1, rangeEnd: readingStart,
    family: 'listening', documentId: questionDocumentId, issues,
  }).map(({ sourceNumber: _sourceNumber, questionId: _questionId, blankId: _blankId, prompt: _prompt, ...question }) => question)
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
    const match = /回答第(\d+)(?:和|、|至|到)第?(\d+)/u.exec(normalized(item.text))
    if (match) ranges.push(Array.from(
      { length: Number(match[2]) - Number(match[1]) + 1 },
      (_, index) => Number(match[1]) + index,
    ))
  }
  const longRanges = ranges.filter((range) => range[0] >= 6)
  if (longRanges.length !== 5 || longRanges.flat().join(',') !== Array.from({ length: 15 }, (_, index) => index + 6).join(',')) {
    addIssue(issues, 'NCK1_DOCX_LISTENING_RANGES_AMBIGUOUS', 'listening.transcript',
      'Listening material ranges do not cover Questions 6-20 exactly once',
      sourceRef(questionDocumentId))
  }
  const transcriptHeading = answerBody.findIndex((item) =>
    item.kind === 'paragraph' && /听力原文/u.test(normalized(item.text)))
  const analysis = answerBody.findIndex(isAnswerExplanationHeading)
  if (transcriptHeading < 0) {
    addIssue(issues, 'NCK1_DOCX_LISTENING_TRANSCRIPT_AMBIGUOUS', 'listening.transcript',
      'Official answer source does not close a Listening transcript section',
      sourceRef(answerDocumentId))
  }
  const transcriptEnd = analysis < 0 ? answerBody.length : analysis
  const timingSourceIndexes = new Set(answerBody
    .slice(Math.max(0, transcriptHeading + 1), transcriptEnd)
    .filter((item) => item.kind === 'paragraph'
      && /(?:分段时长|录音时长|语速|每分钟\s*\d+\s*词|\b\d+(?:\.\d+)?\s*(?:sec(?:ond)?s?|wpm)\b)/iu
        .test(normalized(item.text)))
    .map((item) => item.sourceIndex))
  if (timingSourceIndexes.size > 0) {
    addIssue(issues, 'NCK1_DOCX_LISTENING_TIMING_REVIEW_REQUIRED', 'listening.timing',
      'Source-provided Listening duration or speed data requires exact Agent transcription',
      sourceRef(answerDocumentId, [...timingSourceIndexes][0]))
  }
  const markers = []
  for (let index = transcriptHeading + 1; index < transcriptEnd; index += 1) {
    const match = answerBody[index]?.kind === 'paragraph'
      ? /^Text\s*(\d{1,2})$/iu.exec(normalized(answerBody[index].text))
      : null
    if (match) markers.push({ number: Number(match[1]), index })
  }
  if (markers.length !== 10 || markers.some((marker, index) => marker.number !== index + 1)) {
    addIssue(issues, 'NCK1_DOCX_LISTENING_TRANSCRIPT_AMBIGUOUS', 'listening.transcript',
      `Expected Text 1-10 exactly once; found ${markers.length}`, sourceRef(answerDocumentId))
  }
  const transcript = markers.map((marker, index) => {
    const paragraphs = answerBody.slice(marker.index + 1, markers[index + 1]?.index ?? transcriptEnd)
      .filter((item) => item.kind === 'paragraph'
        && normalized(item.text)
        && !timingSourceIndexes.has(item.sourceIndex))
    return {
      segmentId: `listening-text-${marker.number}`,
      text: paragraphs.map((item) => trimEdgeSpaces(item.text)).join('\n'),
      questionNumbers: marker.number <= 5 ? [marker.number] : longRanges[marker.number - 6] || [],
      source: sourceLocator(answerDocumentId, paragraphs[0]?.sourceIndex || marker.number),
    }
  })
  return { state: 'captured', questions, answers, transcript, timing: [] }
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

export function nck1DocxProducerSourceDigest(documents) {
  return digestJson({
    producerVersion: NCK1_DOCX_MATERIALIZATION_PRODUCER_VERSION,
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
  codePrefix,
  producerVersion,
  reviewSchemaVersion,
  sourceDigest,
}) {
  const body = questionStructure.body
  const answerBody = answerStructure.body
  const readingStart = exactPosition(body, /^第二部分\s*阅读/u, 'sections.reading', issues, question?.documentId)
  const languageStart = exactPosition(body, /^第三部分\s*语言运用/u, 'sections.language', issues, question?.documentId)
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
    const models = writingAnswerRanges(answerBody, issues, answer.documentId)
    groups.push(writingGroup({
      paperId, slotId: 'writing.application', family: 'application-writing',
      items: body.slice(writingFirst + 1, writingSecond),
      documentId: question.documentId, officialModelAnswer: models.application, issues,
    }))
    groups.push(writingGroup({
      paperId, slotId: 'writing.continuation', family: 'continuation-writing',
      items: body.slice(writingSecond + 1),
      documentId: question.documentId, officialModelAnswer: models.continuation, issues,
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
  const sourceCoverage = {
    documentId: coverage?.documentId || 'unresolved-question-rendition',
    reviewedPages: coverage
      ? Array.from({ length: coverage.pageCount }, (_, index) => index + 1)
      : [],
    visuals: tables.map((table, index) => {
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
  }
  const listening = !question || !answer || readingStart === null
    ? { state: 'not_supplied', evidence: { kind: 'question_source_reviewed_no_listening_content', documentId: sourceCoverage.documentId } }
    : listeningMaterialization({
        paperId, questionBody: body, readingStart, answerBody, answerMap,
        questionDocumentId: question.documentId, answerDocumentId: answer.documentId,
        coverageDocumentId: sourceCoverage.documentId, issues,
      })
  const materialization = {
    schemaVersion: 'nck1-source-materialization-v1',
    paperId,
    profileId: 'nck1',
    documents: documents.map(documentRecord),
    groups,
    answers,
    media: [],
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
  const required = carrierIssues(issues, codePrefix)
  return {
    disposition: issues.length === 0 ? 'ready_for_verification' : 'needs_agent_review',
    materialization,
    review: {
      schemaVersion: reviewSchemaVersion,
      paperId,
      producerVersion,
      sourceDigest,
      required,
      agentTasks: [
        { kind: 'writing_analysis', slotId: 'writing.application', parallelizableRead: true },
        { kind: 'writing_analysis', slotId: 'writing.continuation', parallelizableRead: true },
      ],
      singleWriter: {
        paperId,
        policy: 'one_import_writer_per_paper',
        parallelReadAllowed: ['writing.application', 'writing.continuation'],
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
  const question = questionDocs[0]
  const answer = answerDocs[0]
  const rendition = documents.find((document) =>
    document.mediaType === 'application/pdf'
    && document.documentId === question?.renditionDocumentId
    && document.renditionOf === question?.documentId)
  if (questionDocs.length !== 1 || answerDocs.length !== 1 || !rendition) {
    addIssue(issues, 'NCK1_DOCX_SOURCE_SET_AMBIGUOUS', 'documents',
      'Producer requires exactly one question DOCX, one official-answer DOCX, and the question DOCX PDF rendition')
  }
  let questionStructure = { body: [], unsupportedParagraphCount: 0, tables: [] }
  let answerStructure = { body: [], unsupportedParagraphCount: 0, tables: [] }
  try {
    if (question) questionStructure = extractDocxDocumentStructure(question.bytes)
    if (answer) answerStructure = extractDocxDocumentStructure(answer.bytes)
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
  })
}
