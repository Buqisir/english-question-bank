import { crc32 } from 'node:zlib'

import { sha256 } from '../../../shared/paper-canonical/stable.mjs'

const docxMediaType =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function paragraph(text) {
  return `<w:p><w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`
}

const syntheticMediaBytes = new Uint8Array(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABAQAAAAA3bvkkAAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAACYktHRAAB3YoTpAAAAAd0SU1FB+oIGwgLAVaDsf4AAAAldEVYdGRhdGU6Y3JlYXRlADIwMjYtMDgtMjdUMDg6MTE6MDErMDA6MDCMMSViAAAAJXRFWHRkYXRlOm1vZGlmeQAyMDI2LTA4LTI3VDA4OjExOjAxKzAwOjAw/Wyd3gAAACh0RVh0ZGF0ZTp0aW1lc3RhbXAAMjAyNi0wOC0yN1QwODoxMTowMSswMDowMKp5vAEAAAAKSURBVAjXY2AAAAACAAHiIbwzAAAAAElFTkSuQmCC',
  'base64',
))

function mediaDrawing({ relationshipId, widthEmu, alignment, spacingBefore, spacingAfter, mode = 'inline' }) {
  return `<w:p><w:pPr><w:jc w:val="${alignment}"/><w:spacing w:before="${spacingBefore}" w:after="${spacingAfter}"/></w:pPr><w:r><w:drawing><wp:${mode}><wp:extent cx="${widthEmu}" cy="635000"/><wp:docPr id="1" name="Synthetic media"/><a:graphic><a:graphicData><pic:pic><pic:blipFill><a:blip r:embed="${relationshipId}"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:${mode}></w:drawing></w:r></w:p>`
}

function semanticTable({ mediaLayout = false } = {}) {
  const cell = (text) => `<w:tc><w:p><w:r><w:t>${escapeXml(text)}</w:t></w:r></w:p></w:tc>`
  const mediaCell = `<w:tc>${mediaDrawing({
    relationshipId: 'rIdTableMedia',
    widthEmu: 635000,
    alignment: 'left',
    spacingBefore: 0,
    spacingAfter: 0,
  })}</w:tc>`
  return '<w:tbl>'
    + '<w:tblGrid><w:gridCol/><w:gridCol/></w:tblGrid>'
    + `<w:tr>${cell('Day')}${cell('Task')}</w:tr>`
    + `<w:tr>${cell('Monday')}${mediaLayout ? mediaCell : cell('Read')}</w:tr>`
    + '</w:tbl>'
}

function zipStore(files) {
  const chunks = []
  const centrals = []
  let offset = 0
  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8')
    const data = Buffer.from(file.bytes)
    const crc = crc32(data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(name.length, 26)
    chunks.push(local, name, data)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(offset, 42)
    centrals.push(central, name)
    offset += 30 + name.length + data.length
  }
  const central = Buffer.concat(centrals)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(files.length, 8)
  eocd.writeUInt16LE(files.length, 10)
  eocd.writeUInt32LE(central.length, 12)
  eocd.writeUInt32LE(offset, 16)
  return new Uint8Array(Buffer.concat([...chunks, central, eocd]))
}

function docx(blocks, { mediaLayout = false, transformXml = (xml) => xml } = {}) {
  const documentXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + `<w:body>${blocks.join('')}<w:sectPr><w:pgSz w:w="12000"/><w:pgMar w:left="1000" w:right="1000"/></w:sectPr></w:body></w:document>`
  const files = [{ name: 'word/document.xml', bytes: transformXml(documentXml) }]
  if (mediaLayout) {
    files.push({
      name: 'word/_rels/document.xml.rels',
      bytes: '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdBlockLeft" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/><Relationship Id="rIdBlockCenter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/><Relationship Id="rIdTableMedia" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/></Relationships>',
    })
    files.push({ name: 'word/media/image1.png', bytes: syntheticMediaBytes })
  }
  return zipStore(files)
}

function question(no, { stem = `Which choice fits item ${no}?`, options = 'A. Alpha  B. Bravo  C. Charlie  D. Delta' } = {}) {
  return [
    paragraph(`${no}. ${stem}`),
    ...[options].flat().map(paragraph),
  ]
}

function listeningQuestion(no) {
  return [
    paragraph(`${no}. Which listening choice fits item ${no}?`),
    paragraph('A. Alpha  B. Bravo  C. Charlie'),
  ]
}

function reading(letter, from, to, {
  table = false,
  duplicateQuestion = null,
  mediaLayout = false,
  anchoredMedia = false,
  questionShapes = {},
} = {}) {
  return [
    paragraph(letter),
    paragraph(`${letter} passage keeps one small promise.`),
    ...(mediaLayout ? [
      mediaDrawing({
        relationshipId: 'rIdBlockLeft',
        widthEmu: 2540000,
        alignment: 'left',
        spacingBefore: 120,
        spacingAfter: 0,
        mode: anchoredMedia ? 'anchor' : 'inline',
      }),
      mediaDrawing({
        relationshipId: 'rIdBlockCenter',
        widthEmu: 3810000,
        alignment: 'center',
        spacingBefore: 0,
        spacingAfter: 240,
      }),
    ] : []),
    ...(table ? [semanticTable({ mediaLayout })] : []),
    ...Array.from({ length: to - from + 1 }, (_, index) =>
      question(from + index, questionShapes[from + index])).flat(),
    ...(duplicateQuestion ? question(duplicateQuestion) : []),
  ]
}

function questionBlocks({
  duplicateReadingHeading = false,
  duplicateReadingQuestion = false,
  listening = false,
  mediaLayout = false,
  anchoredMedia = false,
  orphanMedia = false,
  chineseNoticeNumbering = false,
  fullWidthNoticeNumbering = false,
  circledNoticeNumbering = false,
  abbreviationStem = false,
  abbreviationOption = false,
  dottedNameStem = false,
  abbreviationSplitOption = false,
} = {}) {
  const sevenParagraphs = Array.from({ length: 5 }, (_, index) =>
    paragraph(`  A short guide has ${36 + index}._____ for learners.  `))
  const sevenOptions = 'ABCDEFG'.split('').map((label) =>
    paragraph(`${label}. ${label} option sentence.`))
  const clozeText = Array.from({ length: 15 }, (_, index) =>
    `${41 + index}._____`).join(' and ')
  const grammarText = Array.from({ length: 10 }, (_, index) =>
    `${56 + index}._____(${index % 2 === 0 ? 'learn' : 'word'})`).join(' and ')
  return [
    paragraph('Synthetic NCK1 paper'),
    ...(listening ? [
      paragraph('第一部分 听力 (共两节，满分30分)'),
      ...Array.from({ length: 20 }, (_, index) =>
        listeningQuestion(index + 1)).flat(),
      paragraph('听第6段材料，回答第6、7题。'),
      paragraph('听第7段材料，回答第8、9题。'),
      paragraph('听第8段材料，回答第10至12题。'),
      paragraph('听第9段材料，回答第13至16题。'),
      paragraph('听第10段材料，回答第17至20题。'),
    ] : []),
    paragraph('第二部分 阅读 (共两节，满分50分)'),
    ...(duplicateReadingHeading
      ? [paragraph('第二部分 阅读 (共两节，满分50分)')]
      : []),
    paragraph('第一节(共15小题；每小题2.5分，满分37.5分)'),
    paragraph('阅读下列短文，从每题所给的四个选项中选出最佳选项。'),
    ...(orphanMedia ? [mediaDrawing({
      relationshipId: 'rIdBlockLeft',
      widthEmu: 2540000,
      alignment: 'left',
      spacingBefore: 0,
      spacingAfter: 0,
    })] : []),
    ...reading('A', 21, 23, {
      table: true,
      duplicateQuestion: duplicateReadingQuestion ? 21 : null,
      mediaLayout,
      anchoredMedia,
    }),
    ...reading('B', 24, 27, { questionShapes: {
      ...(abbreviationStem ? { 24: { stem: 'What did the class visit in Washington D. C.?' } } : {}),
      ...(dottedNameStem ? { 26: { stem: 'What does the passage say about D. Smith?' } } : {}),
      ...(abbreviationSplitOption ? { 27: { options: ['A. Alpha  B. Bravo  C. Washington D. C.', 'D. Delta'] } } : {}),
      ...(abbreviationOption ? { 25: { options: 'A. Alpha  B. A trip to D. C.  C. Charlie  D. Delta' } } : {}),
    } }),
    ...reading('C', 28, 31),
    ...reading('D', 32, 35),
    paragraph('第二节(共5小题；每小题2.5分，满分12.5分)'),
    paragraph('阅读下面短文，从短文后的选项中选出可以填入空白处的最佳选项。'),
    ...sevenParagraphs,
    ...sevenOptions,
    paragraph('第三部分 语言知识运用 (共两节，满分30分)'),
    paragraph('第一节(共15小题；每小题1分，满分15分)'),
    paragraph('阅读下面短文，从每题所给的四个选项中选出最佳选项。'),
    paragraph(`A learner finished the plan: ${clozeText}.`),
    ...Array.from({ length: 15 }, (_, index) => question(41 + index)).flat(),
    paragraph('第二节(共10小题；每小题1.5分，满分15分)'),
    paragraph('阅读下面材料，在空白处填入适当的单词或括号内单词的正确形式。'),
    paragraph(`Practice helps: ${grammarText}.`),
    paragraph('第四部分 写作 (共两节，满分40分)'),
    paragraph('第一节(满分15分)'),
    paragraph('Write a short notice for the reading club.'),
    paragraph('内容包括：'),
    paragraph('1. Share the meeting time;'),
    paragraph('2. Invite new members.'),
    paragraph('注意：'),
    paragraph(`${chineseNoticeNumbering ? '一、' : fullWidthNoticeNumbering ? '１、' : circledNoticeNumbering ? '①、' : '1.'} 写作词数应为80个左右；`),
    paragraph(`${chineseNoticeNumbering ? '二、' : fullWidthNoticeNumbering ? '２、' : circledNoticeNumbering ? '②、' : '2.'} 请按如下格式在答题卡的相应位置作答。`),
    paragraph('Should We Join the Reading Club?'),
    paragraph('第二节(满分25分)'),
    paragraph('阅读下面材料，根据其内容和所给段落开头语续写两段。'),
    paragraph('Mia found a lost notebook after class.'),
    paragraph('The owner name was written on its first page.'),
    paragraph('注意：'),
    paragraph('1. 续写词数应为150左右；'),
    paragraph('2. 请按如下格式在答题卡的相应位置作答。'),
    paragraph('Mia carried the notebook to the school office.'),
    paragraph('The next morning, a student came to thank her.'),
  ]
}

function questionDocument(options = {}) {
  return docx(questionBlocks(options), options)
}

const OBJECTIVE_KEY = 'ABCDABCBCDACDAB' + 'ABCDE' + 'ABCDABCDABCDABC'
const TEXT_KEY = ['walked', 'quickly', 'on', 'the', 'path', 'and', 'shared', 'a', 'kind', 'note']

function answerTable(rows) {
  const cell = (text) => `<w:tc><w:p><w:r><w:t>${escapeXml(text)}</w:t></w:r></w:p></w:tc>`
  return `<w:tbl><w:tblGrid>${'<w:gridCol/>'.repeat(rows[0].length)}</w:tblGrid>`
    + rows.map((row) => `<w:tr>${row.map(cell).join('')}</w:tr>`).join('')
    + '</w:tbl>'
}

// Real answer-key layouts: unpunctuated pairs, number/answer grids printed as
// lines or tables, and list separators with an optional in-word letter.
function formattedKey(answerFormat) {
  const objective = [...OBJECTIVE_KEY]
  const numbers = (from, count) => Array.from({ length: count }, (_, index) => String(from + index))
  if (answerFormat === 'unpunctuated') {
    return [
      paragraph(objective.slice(0, 15).map((value, index) => `${21 + index}${value}`).join(' ')),
      paragraph(objective.slice(15, 20).map((value, index) => `${36 + index} ${value}`).join(' ')),
      paragraph(objective.slice(20).map((value, index) => `${41 + index}${value}`).join(' ')),
      paragraph(TEXT_KEY.map((value, index) => `${56 + index} ${value}`).join(' ')),
    ]
  }
  if (answerFormat === 'gridLines') {
    const rows = []
    for (let from = 21; from <= 55; from += 10) {
      const count = Math.min(10, 56 - from)
      rows.push(paragraph(`序号 ${numbers(from, count).join(' ')}`))
      rows.push(paragraph(`答案 ${objective.slice(from - 21, from - 21 + count).join(' ')}`))
    }
    rows.push(paragraph(`题号| ${numbers(56, 10).join(' ')}`), paragraph(`答案| ${TEXT_KEY.join(' ')}`))
    return rows
  }
  if (answerFormat === 'gridTable') {
    const rows = []
    for (let from = 21; from <= 55; from += 10) {
      const count = Math.min(10, 56 - from)
      const pad = Array.from({ length: 10 - count }, () => '')
      rows.push(['序号', ...numbers(from, count), ...pad])
      rows.push(['答案', ...objective.slice(from - 21, from - 21 + count), ...pad])
    }
    return [answerTable(rows), answerTable([
      ['题号', ...numbers(56, 5)], ['答案', 'walked', 'quickly', 'on', 'the', 'path'],
      ['题号', ...numbers(61, 5)], ['答案', 'and', 'shared', 'a', 'kind', 'note'],
    ])]
  }
  if (answerFormat === 'separators') {
    return [
      paragraph('21~23 ABC 24~27 DABC 28~31 BCDA 32~35 CDAB'),
      paragraph('36－40 ABCDE'),
      paragraph('41-45ABCDA46-50BCDAB51-55CDABC'),
      paragraph('56.walked;\t57.quickly;\t58.on;\t59.the;\t60.path;'),
      paragraph('61.and;\t62.shared;\t63.a;\t64.kind;\t65.no(t) e;'),
    ]
  }
  return null
}

function writingSampleBlocks(writingShape) {
  const application = ['Should We Join the Reading Club?', 'Join us on Friday to read and share ideas.']
  const continuation = ['Mia carried the notebook to the school office. The teacher found its owner.',
    'The next morning, a student came to thank her. They became friends.']
  const shapes = {
    standard: ['第四部分 写作', '第一节：应用文（满分15分）', ...application, '第二节：读后续写（满分25分）', ...continuation],
    bare: ['第四部分 写作（共两节，满分40分）', '第一节（满分15分）', ...application, '第二节（满分25分）', ...continuation],
    bareScoringFirst: ['第四部分 写作', '第一节（满分15分）', '一、本题总分为15分，按5个档次给分。', ...application,
      '第二节（满分25分）', ...continuation],
    typed: ['写作', '应用文', ...application, '读后续写', ...continuation],
    typedNoSection: ['应用文:', '参考范文:', ...application, '读后续写:', '参考范文:', ...continuation],
    chineseLabel: ['第四部分 写作', '第一节', '评分原则：内容要点完整。', '参考范文：', ...application,
      '第二节', '写作样例', ...continuation, '一、评分原则', '按档次给分。'],
    typedWithBareExplanations: ['第四部分 写作', '第一节：应用文写作', ...application, '附应用文评分标准',
      '第二节：读后续写', ...continuation, '读后续写评分标准', '第一节（满分15分）', '按档次给分。',
      '第二节（满分25分）', '按档次给分。'],
    stackedLabels: ['第四部分 写作', '第一节', '(四)参考范文', 'Possible Version 1:', ...application,
      '第二节', '【作答示例】', 'One possible version:', ...continuation],
    typedScoringOnly: ['第四部分 写作', '应用文:', '一、本题总分为15分，按5个档次给分。', '按内容要点给分。',
      '读后续写:', '一、本题总分为25分，按5个档次给分。', '按内容要点给分。'],
    missingSection: ['One Possible Version:', ...application, ...continuation],
  }
  return shapes[writingShape].map(paragraph)
}

function answerBlocks({
  answerShape = 'detailed',
  answerHeading = true,
  ambiguousTextAnswer = false,
  missingAnswer = false,
  multilineAnswers = false,
  answerFormat = null,
  restatedExplanations = false,
  explanationAfterKey = false,
  writingShape = 'standard',
  listening = false,
  listeningHeading = '听力原文',
  listeningMarkerSuffix = '',
  listeningTiming = false,
  listeningSeconds = null,
} = {}) {
  const formatted = formattedKey(answerFormat)
  const key = [
    paragraph('Synthetic official answers'),
    ...(listening ? [
      paragraph('1-5ABCAB6-10BCABC11-15ABCAB16-20BCABC'),
    ] : []),
    ...(formatted || [
    // Deliberately glue adjacent ranges and answers to exercise the real shape.
    multilineAnswers
      ? '<w:p><w:r><w:t>21. A</w:t><w:br/><w:t>22. B</w:t><w:br/><w:t>23. C</w:t><w:br/><w:t>24-27DABC28-31BCDA32-35CDAB</w:t></w:r></w:p>'
      : paragraph('21-23ABC24-27DABC28-31BCDA32-35CDAB'),
    paragraph('36-40ABCDE'),
    paragraph('41-45ABCDA46-50BCDAB51-55CDABC'),
    multilineAnswers
      ? '<w:p><w:r><w:t>56. walked</w:t><w:br/><w:t>57. quickly58.on59.the60.path61.and62.shared63.a64.kind</w:t><w:br/><w:t>65. note</w:t></w:r></w:p>'
      : paragraph(
      missingAnswer
        ? '56.walked\t\t57.quickly58.on\t59.the60.path61.and62.shared63.a64.kind'
        : ambiguousTextAnswer
          ? '56.walked\t\t57.quickly58.on\t59.the60.path61.and62.shared63.a64.kind65.note followed by a long explanation sentence whose boundary is not marked clearly enough for an authoritative grammar answer'
          : '56.walked\t\t57.quickly58.on\t59.the60.path61.and62.shared63.a64.kind65.note',
    ),
    ]),
  ]
  if (answerShape === 'key_only') return key
  return [
    ...(answerHeading ? [paragraph('答案与解析')] : []),
    ...key,
    ...(explanationAfterKey ? [paragraph('解析'), paragraph('21. D 由原文第二段可知。')] : []),
    paragraph('21. A【解析】DETAIL_TOKEN_MUST_NOT_LEAK into Materialization, Review, Screen, or Print.'),
    paragraph('56. walked【解析】DETAIL_TOKEN_MUST_NOT_LEAK into Materialization, Review, Screen, or Print.'),
    ...(restatedExplanations ? [
      paragraph('56.walked。考查非谓语动词。'),
      paragraph('65.考查名词的数。句意:同64题解析。'),
      paragraph('66.应用文参考例文'),
      ...(restatedExplanations === 'conflict' ? [paragraph('56.walking。考查非谓语动词。')] : []),
    ] : []),
    ...writingSampleBlocks(writingShape),
    ...(listening ? [
      paragraph(listeningHeading),
      ...Array.from({ length: 10 }, (_, index) => [
        paragraph(`Text ${index + 1}${listeningMarkerSuffix}`),
        ...(index === 0 && listeningSeconds === 'metadata' ? [paragraph('（Text 1：25 seconds）')] : []),
        ...(index === 0 && listeningSeconds === 'duration' ? [paragraph('The duration of this recording is 25 seconds.')] : []),
        ...(index === 0 && listeningSeconds === 'note' ? [paragraph('Note: 25 seconds')] : []),
        ...(index === 0 && listeningSeconds === 'compound' ? [paragraph('Total Time: 2 minutes 25 seconds')] : []),
        ...(index === 0 && listeningSeconds === 'dialogue'
          ? ['W: Is the soup ready?', 'M: Not yet.', 'W: Wait 14 seconds.'].map(paragraph)
          : index === 0 && listeningSeconds === 'instructions'
            ? ['Silence: 5 seconds between conversations', 'Repeat: after 15 seconds', 'Synthetic transcript 1.',
              'Silence: 5 seconds between conversations', 'Repeat: after 15 seconds'].map(paragraph)
            : index === 0 && listeningSeconds === 'replay'
              ? ['Repeat: once', 'Synthetic transcript 1.', 'Repeat: after 15 seconds'].map(paragraph)
              : [paragraph(`Synthetic transcript ${index + 1}.`)]),
      ]).flat(),
      ...(listeningTiming ? [paragraph('语速：每分钟 120 词')] : []),
    ] : []),
    paragraph('【答案解析】'),
  ]
}

function answerDocument(options = {}) {
  return docx(answerBlocks(options), options)
}

function combinedDocument(options = {}) {
  const boundary = options.combinedBoundary === 'missing'
    ? []
    : options.combinedBoundary === 'duplicate'
      ? [paragraph('参考答案'), paragraph('英语答案')]
      : [paragraph('参考答案及解析')]
  return docx([
    ...questionBlocks(options),
    ...boundary,
    ...answerBlocks({ ...options, answerHeading: false }),
  ], options)
}

export function makeSyntheticNck1DocxFixture(options = {}) {
  const questionBytes = questionDocument(options)
  const answerBytes = answerDocument(options)
  const combinedBytes = combinedDocument(options)
  const renditionBytes = new Uint8Array(Buffer.from(
    '%PDF-1.7\nsynthetic deterministic rendition\n%%EOF\n',
  ))
  const separateDocuments = [
    {
      documentId: 'question-source-1',
      role: 'question_source',
      mediaType: docxMediaType,
      sha256: sha256(questionBytes),
      byteLength: questionBytes.byteLength,
      pageCount: 1,
      path: 'source/question-source-1.docx',
      renditionDocumentId: 'question-source-1-pdf-rendition',
    },
    {
      documentId: 'question-source-1-pdf-rendition',
      role: 'question_source',
      mediaType: 'application/pdf',
      sha256: sha256(renditionBytes),
      byteLength: renditionBytes.byteLength,
      pageCount: 1,
      path: 'source/renditions/question-source-1-pdf-rendition.pdf',
      renditionOf: 'question-source-1',
    },
    {
      documentId: 'official-answers-2',
      role: 'official_answers',
      mediaType: docxMediaType,
      sha256: sha256(answerBytes),
      byteLength: answerBytes.byteLength,
      pageCount: 1,
      path: 'source/official-answers-2.docx',
    },
  ]
  const combinedDocuments = [
    {
      documentId: 'question-and-answers-1',
      role: 'question_and_answers',
      mediaType: docxMediaType,
      sha256: sha256(combinedBytes),
      byteLength: combinedBytes.byteLength,
      pageCount: 1,
      path: 'source/question-and-answers-1.docx',
      renditionDocumentId: 'question-and-answers-1-pdf-rendition',
    },
    {
      documentId: 'question-and-answers-1-pdf-rendition',
      role: 'question_and_answers',
      mediaType: 'application/pdf',
      sha256: sha256(renditionBytes),
      byteLength: renditionBytes.byteLength,
      pageCount: 1,
      path: 'source/renditions/question-and-answers-1-pdf-rendition.pdf',
      renditionOf: 'question-and-answers-1',
    },
  ]
  const documents = options.combined ? combinedDocuments : separateDocuments
  const sourceBytes = options.combined
    ? [combinedBytes, renditionBytes]
    : [questionBytes, renditionBytes, answerBytes]
  return {
    paperId: 'paper-synthetic-docx-2026-m1',
    questionBytes,
    answerBytes,
    combinedBytes,
    renditionBytes,
    manifest: {
      schemaVersion: 'universal-nck1-source-manifest-v1',
      paperId: 'paper-synthetic-docx-2026-m1',
      profileId: 'nck1',
      provenance: { paperName: 'Synthetic NCK1', source: 'test fixture' },
      documents,
      materializationPath: 'materialization/nck1-source-materialization-v1.json',
      mediaDirectory: 'materialization/media',
      canonicalRequestPath: 'canonical-evidence/canonical-import-request.json',
    },
    sourceDocuments: documents.map((document, index) => ({
      ...document,
      bytes: sourceBytes[index],
    })),
  }
}
