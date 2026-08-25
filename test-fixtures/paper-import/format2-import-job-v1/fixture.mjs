import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { deflateSync } from 'node:zlib'

import { sha256 } from '../../../shared/paper-canonical/stable.mjs'

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
} = {}) {
  if (!sourceDir) throw new Error('sourceDir is required')
  mkdirSync(sourceDir, { recursive: true })
  const questionPdfBytes = Buffer.from('%PDF-1.7\n% compact synthetic Format 2 question source\n')
  const answerPdfBytes = Buffer.from('%PDF-1.7\n% compact synthetic Format 2 official answer source\n')
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
        questions: [21, 22, 23].map((number) => question(`question:reading-a:${number}`, number)),
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
          transcript: 'Speaker one gives a short synthetic direction.',
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
      ...[21, 22, 23].map((number) => answer(`question:reading-a:${number}`)),
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
