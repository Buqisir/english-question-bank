import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { deflateSync } from 'node:zlib'

import { digestJson, sha256 } from '../../../shared/paper-canonical/stable.mjs'
import { extractAnswerTextFromPdfBytes } from '../../../server/paper-import/internal/answerTextExtraction.mjs'
import {
  describeAnswerImageRasterizer,
  renderAnswerPdfPageRegion,
} from '../../../server/paper-import/internal/answerImageEvidence.mjs'

const answerRanges = [[21, 23], [24, 27], [28, 31], [32, 35], [36, 40], [41, 55], [56, 65]]
const syntheticAnswerSourceText = answerRanges.map(([start, end]) => (
  `${start}-${end} ${'A'.repeat(end - start + 1)}`
)).join('\n')

function compressedTextPdf(value) {
  const textCommands = value.split('\n').map((line, index) => {
    const escaped = line.replace(/([\\()])/gu, '\\$1')
    return `${index === 0 ? '' : '0 -20 Td '}(${escaped}) Tj`
  }).join(' ')
  const content = Buffer.from(`BT /F1 12 Tf 72 720 Td ${textCommands} ET`)
  const compressed = deflateSync(content)
  const objects = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),
    Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    Buffer.from('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>'),
    Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'),
    Buffer.concat([
      Buffer.from(`<< /Length ${compressed.byteLength} /Filter /FlateDecode >>\nstream\n`),
      compressed,
      Buffer.from('\nendstream'),
    ]),
  ]
  const chunks = [Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'binary')]
  const offsets = [0]
  let offset = chunks[0].byteLength
  objects.forEach((object, index) => {
    offsets.push(offset)
    const chunk = Buffer.concat([
      Buffer.from(`${index + 1} 0 obj\n`),
      object,
      Buffer.from('\nendobj\n'),
    ])
    chunks.push(chunk)
    offset += chunk.byteLength
  })
  const xrefOffset = offset
  const xref = [
    `xref\n0 ${objects.length + 1}\n`,
    '0000000000 65535 f \n',
    ...offsets.slice(1).map((entry) => `${String(entry).padStart(10, '0')} 00000 n \n`),
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
  ].join('')
  chunks.push(Buffer.from(xref))
  return Buffer.concat(chunks)
}

function imageOnlyAnswerPdf() {
  const width = 612
  const height = 792
  const pixels = Buffer.alloc(width * height, 255)
  for (let questionNo = 21; questionNo <= 65; questionNo += 1) {
    const top = 20 + (questionNo - 21) * 16
    for (let y = top; y < top + 10; y += 1) {
      for (let x = 60; x < 552; x += 1) {
        pixels[y * width + x] = ((x - 60 + questionNo) % 36) < 18 ? 25 : 210
      }
    }
  }
  const image = deflateSync(pixels)
  const content = Buffer.from('q 612 0 0 792 0 0 cm /AnswerPage Do Q')
  const objects = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),
    Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    Buffer.from('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /AnswerPage 4 0 R >> >> /Contents 5 0 R >>'),
    Buffer.concat([
      Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ${image.byteLength} >>\nstream\n`),
      image,
      Buffer.from('\nendstream'),
    ]),
    Buffer.concat([
      Buffer.from(`<< /Length ${content.byteLength} >>\nstream\n`),
      content,
      Buffer.from('\nendstream'),
    ]),
  ]
  const chunks = [Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'binary')]
  const offsets = [0]
  let offset = chunks[0].byteLength
  objects.forEach((object, index) => {
    offsets.push(offset)
    const chunk = Buffer.concat([
      Buffer.from(`${index + 1} 0 obj\n`),
      object,
      Buffer.from('\nendobj\n'),
    ])
    chunks.push(chunk)
    offset += chunk.byteLength
  })
  chunks.push(Buffer.from([
    `xref\n0 ${objects.length + 1}\n`,
    '0000000000 65535 f \n',
    ...offsets.slice(1).map((entry) => `${String(entry).padStart(10, '0')} 00000 n \n`),
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF\n`,
  ].join('')))
  return Buffer.concat(chunks)
}

function pngCrc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = ((crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0)) >>> 0
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type)
  const chunk = Buffer.alloc(12 + data.byteLength)
  chunk.writeUInt32BE(data.byteLength, 0)
  typeBytes.copy(chunk, 4)
  data.copy(chunk, 8)
  chunk.writeUInt32BE(
    pngCrc32(Buffer.concat([typeBytes, data])),
    8 + data.byteLength,
  )
  return chunk
}

function pngArtifact(pixelWidth, pixelHeight, variant) {
  const rowLength = pixelWidth * 4 + 1
  const scanlines = Buffer.alloc(rowLength * pixelHeight, 255)
  for (let y = 0; y < pixelHeight; y += 1) {
    const rowStart = y * rowLength
    scanlines[rowStart] = 0
    for (let x = 0; x < pixelWidth; x += 1) {
      const offset = rowStart + 1 + x * 4
      const ink = variant % 2 === 0
        ? y > pixelHeight * 0.35 && y < pixelHeight * 0.65
        : x > pixelWidth * 0.35 && x < pixelWidth * 0.65
      const value = ink ? 35 + variant * 5 : 255
      scanlines[offset] = value
      scanlines[offset + 1] = value
      scanlines[offset + 2] = value
      scanlines[offset + 3] = 255
    }
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(pixelWidth, 0)
  header.writeUInt32BE(pixelHeight, 4)
  header[8] = 8
  header[9] = 6
  const bytes = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(scanlines)),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
  return {
    mimeType: 'image/png',
    encodedBytes: bytes.toString('base64'),
    byteLength: bytes.byteLength,
    sha256: sha256(new Uint8Array(bytes)),
    pixelWidth,
    pixelHeight,
  }
}

function textOptions(questionId, labels = ['A', 'B', 'C', 'D']) {
  return labels.map((label) => ({
    optionId: `option:${questionId}:${label.toLowerCase()}`,
    label,
    contentKind: 'text',
    text: `Synthetic option ${label}`,
  }))
}

function question(questionId, questionNo) {
  return {
    questionId,
    questionNo,
    stem: `Synthetic renderer-owned stem ${questionNo}`,
    options: textOptions(questionId),
    answerRef: `answer:${questionId}`,
  }
}

function answer(questionId, page = 1) {
  return {
    answerRef: `answer:${questionId}`,
    questionId,
    answer: 'A',
    source: { documentRole: 'answer_pdf', page },
  }
}

function listeningEvidence(paperId, questionPdfSha256, answerPdfSha256) {
  const questions = {
    schemaVersion: 'paper-listening-questions-v1',
    paperId,
    section1: {
      questions: Array.from({ length: 5 }, (_value, index) => ({
        no: index + 1,
        stem: `Synthetic listening question ${index + 1}`,
        options: { A: 'Alpha', B: 'Beta', C: 'Gamma' },
      })),
    },
    section2: {
      questions: Array.from({ length: 15 }, (_value, index) => ({
        no: index + 6,
        stem: `Synthetic listening question ${index + 6}`,
        options: { A: 'Alpha', B: 'Beta', C: 'Gamma' },
        textRef: `Text ${6 + Math.floor(index / 3)}`,
      })),
    },
  }
  const answers = {
    schemaVersion: 'paper-listening-answers-v1',
    paperId,
    answers: Object.fromEntries(Array.from({ length: 20 }, (_value, index) => [String(index + 1), 'A'])),
  }
  const transcript = {
    schemaVersion: 'paper-listening-transcript-v1',
    paperId,
    texts: Array.from({ length: 10 }, (_value, index) => ({
      textId: `Text ${index + 1}`,
      label: `Text ${index + 1}`,
      lines: [{ speaker: 'Speaker', line: `Synthetic listening source segment ${index + 1}.` }],
      ...(index >= 5
        ? { coversQuestions: [6 + (index - 5) * 3, 7 + (index - 5) * 3, 8 + (index - 5) * 3] }
        : {}),
    })),
  }
  const jsonDigest = (value) => sha256(new TextEncoder().encode(JSON.stringify(value)))
  const inventory = {
    schemaVersion: 'listening-source-inventory-v1',
    paperId,
    profileId: 'nck1',
    contractRef: { id: 'listening-raw-closure', version: 'nck1-v1' },
    review: { method: 'manual_source_transcription', status: 'accepted' },
    sourceBindings: {
      questions: { extractedDocumentDigest: jsonDigest(questions), sourceDocumentDigest: questionPdfSha256 },
      answers: { extractedDocumentDigest: jsonDigest(answers), sourceDocumentDigest: answerPdfSha256 },
      transcript: { extractedDocumentDigest: jsonDigest(transcript), sourceDocumentDigest: answerPdfSha256 },
    },
    shortDialogueJoins: Array.from({ length: 5 }, (_value, index) => ({
      questionNo: index + 1,
      textId: `Text ${index + 1}`,
    })),
    timing: { disposition: 'not_supplied' },
    audio: { disposition: 'not_supplied', sourceReferences: [] },
    receivedArtifactInventory: {
      status: 'complete',
      inputKeys: [
        'original_question_source',
        'listening_answer_source',
        'listening_questions',
        'listening_answers',
        'listening_transcript',
        'listening_inventory',
      ],
    },
  }
  return { questions, answers, transcript, inventory }
}

function visual({ observationId, owner, page, x, y, width, height, variant }) {
  return {
    observationId,
    owner,
    source: {
      documentRole: 'question_pdf',
      page,
      pageSizePoints: { width: 595, height: 842 },
      pointGeometry: { x, y, width, height },
      extraction: {
        kind: 'embedded_image',
        objectId: `xref:${100 + variant}`,
        extractor: 'synthetic-pdf-object-fixture',
        version: '1',
      },
    },
    targetSizePoints: { width, height },
    sourceCrop: pngArtifact(Math.round(width), Math.round(height), variant),
    sourceTruthChecklist: [
      { relationship: 'identity', sourceTruth: `synthetic source object ${100 + variant}` },
      { relationship: 'geometry', sourceTruth: 'point placement and aspect ratio remain source measured' },
    ],
    alternatives: [],
  }
}

export function makeFormat2ImportJobFixture({
  sourceDir,
  paperId = 'paper-format2-synthetic',
  writerId = 'ticket-01-fixture-writer',
  answerEvidenceKind = 'text',
} = {}) {
  if (!sourceDir) throw new Error('sourceDir is required')
  mkdirSync(sourceDir, { recursive: true })
  const questionPdfBytes = Buffer.from('%PDF-1.7\n% compact synthetic Format 2 question source\n')
  const answerPdfBytes = answerEvidenceKind === 'image'
    ? imageOnlyAnswerPdf()
    : compressedTextPdf(syntheticAnswerSourceText)
  const questionPdfPath = path.join(sourceDir, 'synthetic-questions.pdf')
  const answerPdfPath = path.join(sourceDir, 'synthetic-answers.pdf')
  writeFileSync(questionPdfPath, questionPdfBytes)
  writeFileSync(answerPdfPath, answerPdfBytes)
  const questionPdfSha256 = sha256(new Uint8Array(questionPdfBytes))
  const answerPdfSha256 = sha256(new Uint8Array(answerPdfBytes))
  const provenance = {
    paperName: 'Compact synthetic Format 2 paper',
    sourceLabel: 'Ticket 01 synthetic fixture',
  }
  const optionQuestionId = 'question:reading-b:24'
  const listening = listeningEvidence(paperId, questionPdfSha256, answerPdfSha256)
  const optionOwners = ['A', 'B', 'C', 'D'].map((label) => ({
    kind: 'reading_option',
    groupId: 'group:reading-b',
    questionId: optionQuestionId,
    optionId: `option:${optionQuestionId}:${label.toLowerCase()}`,
  }))
  const passageObservationId = 'observation:reading-a:passage-figure'
  const optionObservationIds = ['A', 'B', 'C', 'D'].map(
    (label) => `observation:reading-b:q2:${label.toLowerCase()}`,
  )
  const transcription = {
    schemaVersion: 'format2-transcription-v1',
    paperId,
    format: 'format2-pdf-pair-v1',
    provenance,
    sourceBindings: { questionPdfSha256, answerPdfSha256 },
    groups: [
      {
        groupId: 'group:reading-a',
        slotId: 'reading.a',
        groupType: 'reading',
        blocks: [
          { blockId: 'block:reading-a:text', kind: 'text', text: 'Short synthetic passage.' },
          {
            blockId: 'block:reading-a:table',
            kind: 'table',
            rows: [['Route', 'Minutes'], ['A', '12']],
          },
          {
            blockId: 'block:reading-a:figure',
            kind: 'visual_placeholder',
            visualObservationId: passageObservationId,
          },
        ],
        questions: [21, 22, 23].map((number) => question(
          number === 21 ? 'q-2026-i-021' : `question:reading-a:${number}`,
          number,
        )),
      },
      {
        groupId: 'group:reading-b',
        slotId: 'reading.b',
        groupType: 'reading',
        blocks: [{ blockId: 'block:reading-b:text', kind: 'text', text: 'Choose the matching diagram.' }],
        questions: [
          {
            questionId: optionQuestionId,
            questionNo: 24,
            stem: 'Which source-authored figure matches the description?',
            options: ['A', 'B', 'C', 'D'].map((label, index) => ({
              optionId: optionOwners[index].optionId,
              label,
              contentKind: 'figure',
              visualObservationId: optionObservationIds[index],
            })),
            answerRef: `answer:${optionQuestionId}`,
          },
          ...[25, 26, 27].map((number) => question(`question:reading-b:${number}`, number)),
        ],
      },
      {
        groupId: 'group:reading-c',
        slotId: 'reading.c',
        groupType: 'reading',
        blocks: [{ blockId: 'block:reading-c:text', kind: 'text', text: 'Compact Reading C passage.' }],
        questions: [28, 29, 30, 31].map((number) => question(`question:reading-c:${number}`, number)),
      },
      {
        groupId: 'group:reading-d',
        slotId: 'reading.d',
        groupType: 'reading',
        blocks: [{ blockId: 'block:reading-d:text', kind: 'text', text: 'Compact Reading D passage.' }],
        questions: [32, 33, 34, 35].map((number) => question(`question:reading-d:${number}`, number)),
      },
      {
        groupId: 'group:seven',
        slotId: 'reading.seven-choices',
        groupType: 'seven_choices',
        blocks: [{
          blockId: 'block:seven:framed-columns',
          kind: 'framed_columns',
          columns: [
            { columnId: 'column:left', heading: 'Before', paragraphs: ['Synthetic left column.'] },
            { columnId: 'column:right', heading: 'After', paragraphs: ['Synthetic right column.'] },
          ],
        }],
        questions: [36, 37, 38, 39, 40].map((number) => ({
          ...question(`question:seven:${number}`, number),
          options: textOptions(`question:seven:${number}`, ['A', 'B', 'C', 'D', 'E', 'F', 'G'])
            .map((option) => ({
              ...option,
              text: `Shared synthetic option ${option.label}`,
            })),
        })),
      },
      {
        groupId: 'group:cloze',
        slotId: 'language.cloze',
        groupType: 'cloze',
        blocks: [{ blockId: 'block:cloze:text', kind: 'text', text: 'A compact cloze ___.' }],
        questions: Array.from({ length: 15 }, (_value, index) => {
          const number = 41 + index
          return question(`question:cloze:${number}`, number)
        }),
      },
      {
        groupId: 'group:grammar',
        slotId: 'language.grammar-fill',
        groupType: 'grammar_fill',
        blocks: [{ blockId: 'block:grammar:text', kind: 'text', text: 'A compact grammar blank.' }],
        questions: Array.from({ length: 10 }, (_value, index) => {
          const number = 56 + index
          return { ...question(`question:grammar:${number}`, number), options: [] }
        }),
      },
      {
        groupId: 'group:listening',
        slotId: 'listening.raw',
        groupType: 'listening',
        blocks: [{
          blockId: 'block:listening:material',
          kind: 'listening_material',
          ...listening,
        }],
        questions: [],
      },
      {
        groupId: 'group:application',
        slotId: 'writing.application',
        groupType: 'application_writing',
        blocks: [{
          blockId: 'block:application:material',
          kind: 'writing_material',
          taskType: 'application',
          prompt: 'You are a student. Write a short note to a classmate to invite them to the reading club; include its time and place.',
          wordCountTarget: 80,
          wordCountScope: 'student_authored_only',
          applicationEvidence: {
            writerRole: 'a student',
            audienceOrDestination: 'a classmate',
            deliverable: 'a short note',
            communicativePurpose: 'invite them to the reading club',
            contentRequirements: ['include the reading club time and place'],
            answerRegionAbsent: true,
          },
        }],
        questions: [],
      },
      {
        groupId: 'group:continuation',
        slotId: 'writing.continuation',
        groupType: 'continuation_writing',
        blocks: [{
          blockId: 'block:continuation:material',
          kind: 'writing_material',
          taskType: 'continuation',
          prompt: 'Continue the short synthetic story in about 150 words.',
          wordCountTarget: 150,
          wordCountScope: 'unspecified',
          sourceInstruction: '阅读下面材料，根据其内容和所给段落开头语续写两段，使之构成一篇完整的短文。',
          continuationStarters: [
            'Paragraph 1: The student opened the classroom door.',
            'Paragraph 2: The class finally understood the message.',
          ],
        }],
        questions: [],
      },
    ],
    officialAnswers: [
      ...[21, 22, 23].map((number) => answer(
        number === 21 ? 'q-2026-i-021' : `question:reading-a:${number}`,
      )),
      answer(optionQuestionId),
      ...[25, 26, 27].map((number) => answer(`question:reading-b:${number}`)),
      ...[28, 29, 30, 31].map((number) => answer(`question:reading-c:${number}`)),
      ...[32, 33, 34, 35].map((number) => answer(`question:reading-d:${number}`)),
      ...[36, 37, 38, 39, 40].map((number) => answer(`question:seven:${number}`)),
      ...Array.from({ length: 15 }, (_value, index) => answer(`question:cloze:${41 + index}`)),
      ...Array.from({ length: 10 }, (_value, index) => answer(`question:grammar:${56 + index}`)),
    ],
    visuals: [
      visual({
        observationId: passageObservationId,
        owner: { kind: 'passage', groupId: 'group:reading-a' },
        page: 1,
        x: 60,
        y: 180,
        width: 120,
        height: 70,
        variant: 0,
      }),
      ...optionOwners.map((owner, index) => visual({
        observationId: optionObservationIds[index],
        owner,
        page: 2,
        x: 60 + index * 125,
        y: 420,
        width: 90,
        height: 72,
        variant: index + 1,
      })),
    ],
  }
  const questionNumberById = new Map(transcription.groups.flatMap((group) => (
    group.questions.map((item) => [item.questionId, item.questionNo])
  )))
  const commonCheck = {
    schemaVersion: 'answer-transcription-check-v2',
    method: 'ai-source-markings-vs-answer-key',
    answerPdfSha256,
    officialAnswersDigest: digestJson(transcription.officialAnswers),
  }
  if (answerEvidenceKind === 'image') {
    const rasterizer = describeAnswerImageRasterizer()
    const dpi = 72
    const pageRaster = renderAnswerPdfPageRegion(answerPdfBytes, { page: 1, dpi })
    const pixelBox = { x: 45, y: 16, width: 522, height: 724 }
    const regionRaster = renderAnswerPdfPageRegion(answerPdfBytes, {
      page: 1,
      dpi,
      pixelBox,
    })
    const regions = [{
      regionId: 'answer-region:objective-grid',
      page: 1,
      pixelBox,
      sha256: regionRaster.sha256,
      byteLength: regionRaster.byteLength,
    }]
    const sourceMarking = transcription.officialAnswers.map((officialAnswer) => (
      `${questionNumberById.get(officialAnswer.questionId)}. ${officialAnswer.answer}`
    )).join('\n')
    transcription.answerTranscriptionCheck = {
      ...commonCheck,
      evidenceKind: 'page_image_regions',
      rasterization: { ...rasterizer, dpi },
      pages: [{
        page: 1,
        pixelWidth: pageRaster.pixelWidth,
        pixelHeight: pageRaster.pixelHeight,
        sha256: pageRaster.sha256,
        byteLength: pageRaster.byteLength,
      }],
      regions,
      sourceMarkings: transcription.officialAnswers.map((officialAnswer) => ({
        ...(() => {
          const questionNo = questionNumberById.get(officialAnswer.questionId)
          return {
            questionId: officialAnswer.questionId,
            questionNo,
            questionRange: { start: 21, end: 65 },
            answerOrdinal: questionNo - 21,
            answer: officialAnswer.answer,
            page: officialAnswer.source.page,
            sourceMarking,
            regionId: 'answer-region:objective-grid',
          }
        })(),
      })),
    }
  } else {
    const extraction = extractAnswerTextFromPdfBytes(answerPdfBytes)
    const extractedAnswerText = extraction.extractedText
    transcription.answerTranscriptionCheck = {
      ...commonCheck,
      evidenceKind: 'text',
      extraction,
      sourceMarkings: transcription.officialAnswers.map((officialAnswer) => ({
        ...(() => {
          const questionNo = questionNumberById.get(officialAnswer.questionId)
        const [rangeStart, rangeEnd] = answerRanges.find(
          ([start, end]) => questionNo >= start && questionNo <= end,
        )
        const sourceMarking = `${rangeStart}-${rangeEnd} ${'A'.repeat(rangeEnd - rangeStart + 1)}`
        const start = extractedAnswerText.indexOf(sourceMarking)
        const answerOrdinal = questionNo - rangeStart
        const answerStart = start + Buffer.byteLength(`${rangeStart}-${rangeEnd} `) + answerOrdinal
        return {
          questionId: officialAnswer.questionId,
          questionNo,
          questionRange: { start: rangeStart, end: rangeEnd },
          answerOrdinal,
          answer: officialAnswer.answer,
          page: officialAnswer.source.page,
          sourceMarking,
          byteSpan: { start, end: start + Buffer.byteLength(sourceMarking) },
          answerByteSpan: { start: answerStart, end: answerStart + 1 },
        }
        })(),
      })),
    }
  }
  return {
    input: {
      paperId,
      sources: {
        schemaVersion: 'format2-source-pair-v1',
        format: 'format2-pdf-pair-v1',
        questionPdf: { absolutePath: questionPdfPath, sha256: questionPdfSha256 },
        answerPdf: { absolutePath: answerPdfPath, sha256: answerPdfSha256 },
      },
      provenance,
      transcription,
      state: { writerId },
    },
    questionPdfBytes,
    answerPdfBytes,
    passageObservationId,
    optionObservationIds,
  }
}
