#!/usr/bin/env node
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { crc32 } from 'node:zlib'
import { fileURLToPath } from 'node:url'

import { compileCanonicalPaper } from '../shared/paper-canonical/compiler.mjs'
import { loadCanonicalImportRequest } from '../server/paper-canonical/importRequest.mjs'
import {
  admitCanonicalPaperImport,
  publishCanonicalPaperPublication,
} from '../server/paper-canonical/publication.mjs'
import {
  DOCX_PAIR_REQUEST_FILE_NAME,
  isDocxPairCanonicalImportRequest,
} from '../server/paper-canonical/docxPairCanonicalRequest.mjs'
import { isTrustedDocxCanonicalImportRequest } from '../server/paper-canonical/trustedDocxCanonicalRequest.mjs'
import { assertNck1ApplicationChrome } from './import-pipeline/lib-nck1-new-paper-locks.mjs'
import {
  deriveDocxPairCanonicalSource,
  deriveNck1Identity,
  extractDocxDocumentText,
  isReservedNck1ExamPaperId,
} from '../server/paper-canonical/docxSourceAdapter.mjs'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pairProducer = path.join(
  rootDir,
  'scripts/import-pipeline/build-docx-pair-canonical-request.mjs',
)
const trustedProducer = path.join(
  rootDir,
  'scripts/import-pipeline/build-trusted-docx-canonical-request.mjs',
)
const tempRoot = mkdtempSync(path.join(tmpdir(), 'eqb-docx-pair-request-'))

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
  const centralBuf = Buffer.concat(centrals)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(files.length, 8)
  eocd.writeUInt16LE(files.length, 10)
  eocd.writeUInt32LE(centralBuf.length, 12)
  eocd.writeUInt32LE(offset, 16)
  return new Uint8Array(Buffer.concat([...chunks, centralBuf, eocd]))
}

function docxWithText(text) {
  const escaped = String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
  const paras = escaped.split('\n').map((line) =>
    `<w:p><w:r><w:t>${line}</w:t></w:r></w:p>`).join('')
  return zipStore([{
    name: 'word/document.xml',
    bytes: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
      + `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">`
      + `<w:body>${paras}</w:body></w:document>`,
  }])
}

function mcq(no, stem = 'What is this about?') {
  return `${no}. ${stem}\nA. Alpha choice here\nB. Bravo choice here\nC. Charlie choice here\nD. Delta choice here`
}

function reading(letter, from, to) {
  const questions = []
  for (let no = from; no <= to; no += 1) questions.push(mcq(no))
  return `${letter}\nA short ${letter} passage about students who keep a promise after school.\n${questions.join('\n')}`
}

function syntheticPairDocx() {
  const clozeBlanks = Array.from({ length: 15 }, (_, index) => `__${41 + index}__`).join(' then ')
  const grammar = Array.from({ length: 10 }, (_, index) => `${56 + index}._____(word)`).join(' ')
  const paper = [
    '2026年普通高等学校招生全国统一考试模拟测试(一)',
    '第二部分 阅读理解(共两节，满分50分)',
    '第一节(共15小题；每小题2.5分，满分37.5分)',
    '阅读下列短文，从每题所给的A、B、C、D四个选项中，选出最佳选项。',
    reading('A', 21, 23),
    reading('B', 24, 27),
    reading('C', 28, 31),
    reading('D', 32, 35),
    '第二节（共5小题；每小题2.5分，满分12.5分）',
    '阅读下面短文，从短文后的选项中选出可以填入空白处的最佳选项。选项中有两项为多余选项。',
    'A seven passage __36__ continues with more words __37__ and then __38__ before __39__ ends __40__ here.',
    'A. First option text here',
    'B. Second option text here',
    'C. Third option text here',
    'D. Fourth option text here',
    'E. Fifth option text here',
    'F. Sixth option text here',
    'G. Seventh option text here',
    '第三部分 语言运用(共两节，满分30分)',
    '第一节(共15小题；每小题1分，满分15分)',
    '阅读下面短文，从每题所给的A、B、C、D四个选项中选出最佳选项。',
    `A cloze story ${clozeBlanks} about winter work.`,
    ...Array.from({ length: 15 }, (_, index) => mcq(41 + index, 'Choose the best word.')),
    '第二节（共10小题；每小题1.5分，满分15分）',
    '阅读下面短文，在空白处填入1个适当的单词或括号内单词的正确形式。',
    `A grammar passage ${grammar}.`,
    '第四部分 写作(共两节，满分40分)',
    '第一节(满分15分)',
    '你将参加英语课上的演讲活动。请写一篇演讲稿，内容包括：',
    '(1)陈述看法，',
    '(2)提出建议。',
    '注意：',
    '(1)写作词数应为80左右；',
    '(2)请按如下格式在答题卡的相应位置作答。',
    'Should the Badminton Club Set Entry Requirements?',
    '第二节（满分25分）',
    '阅读下面材料，根据其内容和所给段落开头语续写两段，使之构成一篇完整的短文。',
    'Every day after school, Lucas and Noah pressed their noses against the shop window.',
    'They stared at the red bicycle and promised to keep working until they could buy it.',
    '注意：',
    '(1)续写词数应为150左右；',
    '(2)请按如下格式在答题卡的相应位置作答。',
    'They started shoveling snow in their own neighborhood first.',
    'The shopkeeper smiled when the brothers returned with their savings.',
  ].join('\n')
  const answers = [
    '21-23 BAC',
    '24-27 ABCD',
    '28-31 DCBA',
    '32-35 ABCD',
    '36-40 ABCDE',
    '41-45 ABCDE',
    '46-50 ABCDE',
    '51-55 ABCDE',
    '56. has regarded',
    '57. revealing',
    '58. completely',
    '59. To understand',
    '60. What',
    '61. and',
    '62. remarkable',
    '63. appreciation',
    '64. it',
    '65. to',
    '【答案解析】',
    'dummy',
  ].join('\n')
  return {
    question: docxWithText(paper),
    answers: docxWithText(answers),
  }
}

function runProducer(script, args) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: rootDir,
    encoding: 'utf8',
  })
  if (result.status !== 0) {
    const error = new Error(
      result.stderr || result.stdout || `producer exited ${result.status}`,
    )
    error.status = result.status
    error.stdout = result.stdout
    error.stderr = result.stderr
    throw error
  }
  return result
}

try {
  const mockTitle = docxWithText('2026年普通高等学校招生全国统一考试模拟测试(一)')
  assert.throws(
    () => deriveNck1Identity(extractDocxDocumentText(mockTitle)),
    /DOCX source lacks a supported NCK1 paper identity/,
  )
  assert.equal(isReservedNck1ExamPaperId('paper-mock-gd-2026-m1'), false)
  assert.equal(isReservedNck1ExamPaperId('paper-2026-i'), true)
  assert.equal(isReservedNck1ExamPaperId('paper-zj-2026-jan'), true)

  const mockTitlePath = path.join(tempRoot, 'mock-title.docx')
  writeFileSync(mockTitlePath, mockTitle)
  let formatOneOnMock
  try {
    runProducer(trustedProducer, [
      mockTitlePath,
      '--output-dir',
      path.join(tempRoot, 'format-1-mock'),
      '--expected-paper-id',
      'paper-mock-gd-2026-m1',
      '--write',
    ])
  } catch (error) {
    formatOneOnMock = error
  }
  assert.match(
    String(formatOneOnMock?.stderr || formatOneOnMock?.message || ''),
    /DOCX source lacks a supported NCK1 paper identity|DOCX_SOURCE_DOCUMENT_INVALID/,
  )

  const pair = syntheticPairDocx()
  const derived = deriveDocxPairCanonicalSource(pair.question, pair.answers, {
    paperId: 'paper-mock-syn-2026-m1',
  })
  const application = derived.groups.find(
    (group) => group.family === 'application-writing',
  )
  assert.ok(application, 'pair derivation must emit application writing')
  assertNck1ApplicationChrome(application)
  assert.equal(
    application.content.blocks
      .find((block) => block.nodeId.endsWith(':given:title'))
      ?.inlines
      ?.map((inline) => inline.text)
      .join(''),
    'Should the Badminton Club Set Entry Requirements?',
  )

  const questionPath = path.join(tempRoot, 'paper.docx')
  const answersPath = path.join(tempRoot, 'answers.docx')
  writeFileSync(questionPath, pair.question)
  writeFileSync(answersPath, pair.answers)

  let missingId
  try {
    runProducer(pairProducer, [
      questionPath,
      answersPath,
      '--output-dir',
      path.join(tempRoot, 'missing-id'),
      '--write',
    ])
  } catch (error) {
    missingId = error
  }
  assert.equal(missingId?.status, 1)

  let reserved
  try {
    runProducer(pairProducer, [
      questionPath,
      answersPath,
      '--output-dir',
      path.join(tempRoot, 'reserved'),
      '--expected-paper-id',
      'paper-2026-i',
      '--write',
    ])
  } catch (error) {
    reserved = error
  }
  assert.match(
    String(reserved?.stderr || reserved?.message || ''),
    /DOCX_PAIR_PAPER_ID_RESERVED|must not occupy reserved/,
  )

  const outputDir = path.join(tempRoot, 'canonical-evidence')
  runProducer(pairProducer, [
    questionPath,
    answersPath,
    '--output-dir',
    outputDir,
    '--expected-paper-id',
    'paper-mock-syn-2026-m1',
    '--write',
  ])
  const requestPath = path.join(outputDir, DOCX_PAIR_REQUEST_FILE_NAME)
  const loaded = loadCanonicalImportRequest(requestPath)
  assert.equal(isDocxPairCanonicalImportRequest(loaded), true)
  assert.equal(isTrustedDocxCanonicalImportRequest(loaded), false)
  assert.equal(
    loaded.evidence.documents.some((document) => document.inputKey === 'question_docx'),
    true,
  )
  assert.equal(
    loaded.evidence.documents.some((document) => document.inputKey === 'official_answer_docx'),
    true,
  )
  runProducer(pairProducer, [
    questionPath,
    answersPath,
    '--output-dir',
    outputDir,
    '--expected-paper-id',
    'paper-mock-syn-2026-m1',
  ])

  const generic = compileCanonicalPaper(loaded)
  assert.equal(
    'canonicalPaper' in generic.artifacts,
    false,
    'generic compiler must not bypass Teacher Confirmation',
  )

  const publicationDb = new DatabaseSync(path.join(tempRoot, 'publication.sqlite'))
  const publicationRoot = path.join(tempRoot, 'publications')
  const admitted = admitCanonicalPaperImport({
    request: loaded,
    sourceAssetVersion: 1,
  })
  assert.equal(
    admitted.ok,
    true,
    `DOCX pair admission failed: ${JSON.stringify(admitted.diagnostics)}`,
  )
  assert.equal(admitted.sealed.manifest.paperId, 'paper-mock-syn-2026-m1')
  const published = publishCanonicalPaperPublication({
    rootDir: publicationRoot,
    db: publicationDb,
    request: loaded,
    sourceAssetVersion: 1,
  })
  assert.equal(published.status, 'published')
  assert.equal(
    existsSync(path.join(publicationRoot, 'paper-mock-syn-2026-m1', 'latest')),
    true,
    'DOCX pair publication must write latest/ under the isolated root',
  )
  assert.equal(
    existsSync(path.join(publicationRoot, 'paper-2026-i', 'latest')),
    false,
    'format ③ must not publish under a reserved national exam id',
  )

  const wrongSource = admitCanonicalPaperImport({
    request: loaded,
    sourceAssetVersion: 1,
    sourceAsset: pair.answers,
  })
  assert.equal(wrongSource.ok, false)
  assert.equal(
    wrongSource.diagnostics.some(
      (diagnostic) => diagnostic.code === 'CANONICAL_PUBLICATION_SOURCE_UNBOUND',
    ),
    true,
    'DOCX pair admission must reject an answers-docx source override',
  )

  publicationDb.close()
  console.log(JSON.stringify({
    status: 'PASS',
    paperId: 'paper-mock-syn-2026-m1',
    producer: 'scripts/import-pipeline/build-docx-pair-canonical-request.mjs',
    ownerAssertedIdentity: true,
    reservedExamIdRejected: true,
    formatOneTitleDerivationUntouched: true,
    loadedRequest: true,
    isolatedLatest: true,
  }))
} finally {
  rmSync(tempRoot, { recursive: true, force: true })
}
