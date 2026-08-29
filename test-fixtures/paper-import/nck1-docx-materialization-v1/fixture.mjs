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

function semanticTable() {
  const cell = (text) => `<w:tc><w:p><w:r><w:t>${escapeXml(text)}</w:t></w:r></w:p></w:tc>`
  return '<w:tbl>'
    + '<w:tblGrid><w:gridCol/><w:gridCol/></w:tblGrid>'
    + `<w:tr>${cell('Day')}${cell('Task')}</w:tr>`
    + `<w:tr>${cell('Monday')}${cell('Read')}</w:tr>`
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

function docx(blocks) {
  const documentXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
    + `<w:body>${blocks.join('')}</w:body></w:document>`
  return zipStore([{ name: 'word/document.xml', bytes: documentXml }])
}

function question(no) {
  return [
    paragraph(`${no}. Which choice fits item ${no}?`),
    paragraph('A. Alpha  B. Bravo  C. Charlie  D. Delta'),
  ]
}

function listeningQuestion(no) {
  return [
    paragraph(`${no}. Which listening choice fits item ${no}?`),
    paragraph('A. Alpha  B. Bravo  C. Charlie'),
  ]
}

function reading(letter, from, to, { table = false, duplicateQuestion = null } = {}) {
  return [
    paragraph(letter),
    paragraph(`${letter} passage keeps one small promise.`),
    ...(table ? [semanticTable()] : []),
    ...Array.from({ length: to - from + 1 }, (_, index) =>
      question(from + index)).flat(),
    ...(duplicateQuestion ? question(duplicateQuestion) : []),
  ]
}

function questionBlocks({
  duplicateReadingHeading = false,
  duplicateReadingQuestion = false,
  listening = false,
} = {}) {
  const sevenParagraphs = Array.from({ length: 5 }, (_, index) =>
    paragraph(`A short guide has ${36 + index}._____ for learners.`))
  const sevenOptions = 'ABCDEFG'.split('').map((label) =>
    paragraph(`${label}. ${label} option sentence.`))
  const clozeText = Array.from({ length: 15 }, (_, index) =>
    `${41 + index}._____`).join(' ')
  const grammarText = Array.from({ length: 10 }, (_, index) =>
    `${56 + index}._____(${index % 2 === 0 ? 'learn' : 'word'})`).join(' ')
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
    ...reading('A', 21, 23, {
      table: true,
      duplicateQuestion: duplicateReadingQuestion ? 21 : null,
    }),
    ...reading('B', 24, 27),
    ...reading('C', 28, 31),
    ...reading('D', 32, 35),
    paragraph('第二节(共5小题；每小题2.5分，满分12.5分)'),
    paragraph('阅读下面短文，从短文后的选项中选出可以填入空白处的最佳选项。'),
    ...sevenParagraphs,
    ...sevenOptions,
    paragraph('第三部分 语言运用 (共两节，满分30分)'),
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
    paragraph('1. 写作词数应为80个左右；'),
    paragraph('2. 请按如下格式在答题卡的相应位置作答。'),
    paragraph('Reading Club Notice'),
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
  return docx(questionBlocks(options))
}

function answerBlocks({
  answerShape = 'detailed',
  answerHeading = true,
  ambiguousTextAnswer = false,
  missingAnswer = false,
  listening = false,
  listeningHeading = '听力原文',
  listeningTiming = false,
} = {}) {
  const key = [
    paragraph('Synthetic official answers'),
    ...(listening ? [
      paragraph('1-5ABCAB6-10BCABC11-15ABCAB16-20BCABC'),
    ] : []),
    // Deliberately glue adjacent ranges and answers to exercise the real shape.
    paragraph('21-23ABC24-27DABC28-31BCDA32-35CDAB'),
    paragraph('36-40ABCDE'),
    paragraph('41-45ABCDA46-50BCDAB51-55CDABC'),
    paragraph(
      missingAnswer
        ? '56.walked\t\t57.quickly58.on\t59.the60.path61.and62.shared63.a64.kind'
        : ambiguousTextAnswer
          ? '56.walked\t\t57.quickly58.on\t59.the60.path61.and62.shared63.a64.kind65.note followed by a long explanation sentence whose boundary is not marked clearly enough for an authoritative grammar answer'
          : '56.walked\t\t57.quickly58.on\t59.the60.path61.and62.shared63.a64.kind65.note',
    ),
  ]
  if (answerShape === 'key_only') return key
  return [
    ...(answerHeading ? [paragraph('答案与解析')] : []),
    ...key,
    paragraph('21. A【解析】DETAIL_TOKEN_MUST_NOT_LEAK into Materialization, Review, Screen, or Print.'),
    paragraph('56. walked【解析】DETAIL_TOKEN_MUST_NOT_LEAK into Materialization, Review, Screen, or Print.'),
    paragraph('第四部分 写作'),
    paragraph('第一节 参考范文'),
    paragraph('Reading Club Notice'),
    paragraph('Join us on Friday to read and share ideas.'),
    paragraph('第二节 参考范文'),
    paragraph('Mia carried the notebook to the school office. The teacher found its owner.'),
    paragraph('The next morning, a student came to thank her. They became friends.'),
    ...(listening ? [
      paragraph(listeningHeading),
      ...Array.from({ length: 10 }, (_, index) => [
        paragraph(`Text ${index + 1}`),
        paragraph(`Synthetic transcript ${index + 1}.`),
      ]).flat(),
      ...(listeningTiming ? [paragraph('语速：每分钟 120 词')] : []),
    ] : []),
    paragraph('【答案解析】'),
  ]
}

function answerDocument(options = {}) {
  return docx(answerBlocks(options))
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
  ])
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
