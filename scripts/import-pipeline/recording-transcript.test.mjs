import assert from 'node:assert/strict'
import { test } from 'node:test'
import { extractDocxDocumentStructure } from '../../server/paper-canonical/docxSourceAdapter.mjs'
import { deriveNck1MaterializationBundle } from '../../server/paper-canonical/nck1MaterializationAdapter.mjs'
import { produceNck1MaterializationFromStructures, RECORDING_TRANSCRIPT_TITLE } from '../../server/paper-import/nck1DocxMaterializationProducer.mjs'
import { sha256 } from '../../shared/paper-canonical/stable.mjs'
import { makeSyntheticNck1DocxFixture } from '../../test-fixtures/paper-import/nck1-docx-materialization-v1/fixture.mjs'
import { recordingCuts, recordingDocx } from './recording-transcript.mjs'
import { withWork } from './listening-transcript-check-engines.mjs'

const fixture = makeSyntheticNck1DocxFixture({ listening: true, transformXml: xml => xml
  .replace('第一节：应用文（满分15分）', '第一节：作答示例')
  .replace('第二节：读后续写（满分25分）', '第二节：作答示例') })
const question = fixture.sourceDocuments.find(document => document.role === 'question_source')
const answer = fixture.sourceDocuments.find(document => document.role === 'official_answers')
const coverage = fixture.sourceDocuments.find(document => document.renditionOf === question.documentId)
const sources = [question, answer, coverage]
const questionStructure = extractDocxDocumentStructure(question.bytes)
const original = extractDocxDocumentStructure(answer.bytes)
const answerWithoutTranscript = { ...original, body: original.body.slice(0, original.body.findIndex(item => item.text === '听力原文')) }
const produce = (answerStructure, recordingTranscript) => produceNck1MaterializationFromStructures({
  paperId: fixture.paperId, documents: recordingTranscript ? [...sources, recordingTranscript] : sources,
  question, answer, coverage, questionStructure, answerStructure, issues: [],
  codePrefix: 'NCK1_OCR', recordingTranscript,
}).materialization
const hash = sha256(Buffer.from('local audio fixture'))

test('explicit recording transcript keeps the answers and derives an audio-bound Candidate', async () => {
  const printed = produce(original)
  const groups = printed.listening.transcript.map(({ segmentId, questionNumbers }, i) => ({
    segmentId, questionNumbers, playback: { startSeconds: i * 2, endSeconds: i * 2 + 1 },
  }))
  const cuts = { paperId: fixture.paperId, playbackAudioSha256: hash, groups }
  assert.equal(recordingCuts(cuts, fixture.paperId, hash, 20).length, 10)
  assert.throws(() => recordingCuts({ ...cuts, groups: groups.slice(1) }, fixture.paperId, hash, 20), /十段/)
  assert.throws(() => recordingCuts(cuts, fixture.paperId, sha256(Buffer.from('other audio')), 20), /十段/)
  assert.equal(printed.listening.transcript.length, 10)
  assert(produce(answerWithoutTranscript).issues.some(issue => issue.code === 'NCK1_OCR_LISTENING_TRANSCRIPT_AMBIGUOUS'))
  const paragraphs = [RECORDING_TRANSCRIPT_TITLE, `录音 SHA-256：${hash}`, 'ASR attempt：test',
    `evidence.json：${hash}；摘要：测试`]
  for (const [i, group] of groups.entries()) paragraphs.push(`Text ${i + 1} | 题号：${group.questionNumbers.join(',')} | 据录音整理 | This is spoken dialogue ${i + 1}.`)
  const supplemental = async lines => {
    const bytes = await withWork(work => recordingDocx(lines, work))
    return { documentId: 'recording-transcript', role: 'unofficial_listening', mediaType: question.mediaType,
      sha256: sha256(bytes), byteLength: bytes.length, pageCount: 1, bytes }
  }
  const missing = await supplemental(paragraphs.slice(0, -1))
  assert.throws(() => produce(answerWithoutTranscript, missing), /十段|Text 1–10/)
  const document = await supplemental(paragraphs)
  assert.throws(() => produce(original, document), /印刷听力原文/)
  const materialization = produce(answerWithoutTranscript, document)
  assert.deepEqual(materialization.issues, [])
  assert.deepEqual(materialization.listening.answers, printed.listening.answers)
  assert.equal(materialization.listening.transcript[9].text, 'This is spoken dialogue 10.')
  const input = { kind: 'nck1-source-materialization', materializationBytes: Buffer.from(JSON.stringify(materialization)),
    documents: [...sources, document].map(({ documentId, bytes }) => ({ documentId, bytes })), media: [],
    listeningAudio: { relativePath: 'listening/playback.mp3', durationSeconds: 20, byteLength: 20, mediaType: 'audio/mpeg', sha256: hash } }
  assert.deepEqual(deriveNck1MaterializationBundle(input).issues, [])
  input.listeningAudio.sha256 = sha256(Buffer.from('replacement audio'))
  assert(deriveNck1MaterializationBundle(input).issues.some(issue => issue.code === 'MATERIALIZATION_UNOFFICIAL_LISTENING_SOURCE_INVALID'))
})
