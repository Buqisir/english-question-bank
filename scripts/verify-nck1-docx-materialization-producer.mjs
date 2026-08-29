#!/usr/bin/env node

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { importCanonicalCandidate } from '../shared/paper-canonical/compiler.mjs'
import {
  produceNck1DocxMaterialization,
} from '../server/paper-import/nck1DocxMaterializationProducer.mjs'
import {
  paperWriterLockPath,
  runNck1DocxMaterializationJob,
  withPaperWriterLock,
} from './import-pipeline/nck1-docx-materialize.mjs'
import {
  makeSyntheticNck1DocxFixture,
} from '../test-fixtures/paper-import/nck1-docx-materialization-v1/fixture.mjs'

const fixture = makeSyntheticNck1DocxFixture()
const produced = produceNck1DocxMaterialization({
  paperId: fixture.paperId,
  documents: fixture.sourceDocuments,
})

assert.equal(produced.disposition, 'ready_for_verification')
assert.deepEqual(produced.review.required, [])
assert.deepEqual(
  produced.materialization.groups.map((group) => group.slotId),
  [
    'reading.a',
    'reading.b',
    'reading.c',
    'reading.d',
    'seven-choices',
    'cloze',
    'grammar-fill',
    'writing.application',
    'writing.continuation',
  ],
)
assert.equal(produced.materialization.answers.length, 45)
assert.deepEqual(
  produced.materialization.answers.slice(0, 4).map((answer) => answer.value),
  ['A', 'B', 'C', 'D'],
  'glued adjacent answer ranges must retain source-backed answer order',
)
assert.equal(produced.materialization.answers[35].value, 'walked')
assert.equal(produced.materialization.answers[37].value, 'on')
assert.equal(produced.materialization.answers.at(-1).value, 'note')
assert.equal(produced.materialization.listening.state, 'not_supplied')
assert.equal(
  produced.materialization.groups[0].blocks.some((block) =>
    block.kind === 'table' && block.columnCount === 2 && block.rows.length === 2),
  true,
  'a DOCX semantic table must remain a semantic grid',
)
const paragraphLocators = produced.materialization.groups.flatMap((group) =>
  group.blocks.filter((block) => block.kind === 'paragraph').map((block) =>
    block.source.selector))
assert(paragraphLocators.length > 20)
assert(paragraphLocators.every((selector) =>
  /^\(\/w:document\/w:body\/\/w:p\)\[\d+\]$/u.test(selector)))
assert.equal(new Set(paragraphLocators).size, paragraphLocators.length)
assert.deepEqual(
  produced.review.agentTasks.map((task) => task.kind),
  ['writing_analysis', 'writing_analysis'],
  'only writing analysis remains on the normal Agent reasoning path',
)
assert(produced.review.agentTasks.every((task) => task.parallelizableRead === true))
assert.equal(produced.review.singleWriter.paperId, fixture.paperId)

const input = {
  kind: 'nck1-source-materialization',
  materializationBytes: new TextEncoder().encode(JSON.stringify(
    produced.materialization,
  )),
  documents: fixture.sourceDocuments.map((document) => ({
    documentId: document.documentId,
    bytes: document.bytes,
  })),
  media: [],
}
const imported = importCanonicalCandidate(input)
assert.deepEqual(imported.issues, [])
assert.equal(imported.candidate?.interpretation.groups.length, 9)
assert.equal(imported.candidate?.interpretation.assertions.length, 45)

const mediaFixture = makeSyntheticNck1DocxFixture({ mediaLayout: true })
const mediaProduced = produceNck1DocxMaterialization({
  paperId: mediaFixture.paperId,
  documents: mediaFixture.sourceDocuments,
})
assert.equal(mediaProduced.disposition, 'ready_for_verification')
assert.equal(
  mediaProduced.materialization.schemaVersion,
  'nck1-source-materialization-v2',
)
assert.deepEqual(
  mediaProduced.materialization.media.map((media) => media.presentation),
  [
    {
      alignment: 'left',
      widthRatio: 0.4,
      spacingBefore: 'compact',
      spacingAfter: 'none',
    },
    {
      alignment: 'center',
      widthRatio: 0.6,
      spacingBefore: 'none',
      spacingAfter: 'normal',
    },
    {
      alignment: 'left',
      widthRatio: 0.1,
      spacingBefore: 'none',
      spacingAfter: 'none',
    },
  ],
  'DOCX relationship, extent, alignment, and spacing become one shared layout intent',
)
assert.deepEqual(
  mediaProduced.materialization.groups[0].blocks.map((block) => block.kind),
  ['paragraph', 'figure', 'figure', 'table'],
)
assert.equal(mediaProduced.mediaFiles.length, 3)
const importedMedia = importCanonicalCandidate({
  kind: 'nck1-source-materialization',
  materializationBytes: new TextEncoder().encode(JSON.stringify(
    mediaProduced.materialization,
  )),
  documents: mediaFixture.sourceDocuments.map((document) => ({
    documentId: document.documentId,
    bytes: document.bytes,
  })),
  media: mediaProduced.mediaFiles,
})
assert.deepEqual(importedMedia.issues, [])
assert.equal(importedMedia.candidate?.interpretation.groups[0].media.length, 3)

const anchoredMedia = produceNck1DocxMaterialization({
  paperId: fixture.paperId,
  documents: makeSyntheticNck1DocxFixture({
    mediaLayout: true,
    anchoredMedia: true,
  }).sourceDocuments,
})
assert.equal(anchoredMedia.disposition, 'needs_agent_review')
assert(anchoredMedia.review.required.some((item) =>
  item.code === 'NCK1_DOCX_MEDIA_LAYOUT_UNSUPPORTED'))

const orphanMedia = produceNck1DocxMaterialization({
  paperId: fixture.paperId,
  documents: makeSyntheticNck1DocxFixture({
    mediaLayout: true,
    orphanMedia: true,
  }).sourceDocuments,
})
assert.equal(orphanMedia.disposition, 'needs_agent_review')
assert(orphanMedia.review.required.some((item) =>
  item.code === 'NCK1_DOCX_MEDIA_ASSOCIATION_AMBIGUOUS'))

const uncertain = produceNck1DocxMaterialization({
  paperId: fixture.paperId,
  documents: makeSyntheticNck1DocxFixture({
    duplicateReadingHeading: true,
  }).sourceDocuments,
})
assert.equal(uncertain.disposition, 'needs_agent_review')
assert(uncertain.review.required.some((item) =>
  item.code === 'NCK1_DOCX_SECTION_AMBIGUOUS'))
assert(uncertain.materialization.issues.length > 0)

const duplicateQuestion = produceNck1DocxMaterialization({
  paperId: fixture.paperId,
  documents: makeSyntheticNck1DocxFixture({
    duplicateReadingQuestion: true,
  }).sourceDocuments,
})
assert.equal(duplicateQuestion.disposition, 'needs_agent_review')
assert(duplicateQuestion.review.required.some((item) =>
  item.code === 'NCK1_DOCX_QUESTION_SEQUENCE_INCOMPLETE'))

const missingAnswer = produceNck1DocxMaterialization({
  paperId: fixture.paperId,
  documents: makeSyntheticNck1DocxFixture({ missingAnswer: true }).sourceDocuments,
})
assert.equal(missingAnswer.disposition, 'needs_agent_review')
assert(missingAnswer.review.required.some((item) =>
  item.code === 'NCK1_DOCX_ANSWER_MISSING'))

const missingSource = produceNck1DocxMaterialization({
  paperId: fixture.paperId,
  documents: fixture.sourceDocuments.filter((document) =>
    document.role !== 'official_answers'),
})
assert.equal(missingSource.disposition, 'needs_agent_review')
assert(missingSource.review.required.some((item) =>
  item.code === 'NCK1_DOCX_SOURCE_SET_AMBIGUOUS'))

const suppliedListeningTiming = produceNck1DocxMaterialization({
  paperId: fixture.paperId,
  documents: makeSyntheticNck1DocxFixture({
    listening: true,
    listeningTiming: true,
  }).sourceDocuments,
})
assert.equal(suppliedListeningTiming.disposition, 'needs_agent_review')
assert.equal(suppliedListeningTiming.materialization.listening.questions.length, 20)
assert(suppliedListeningTiming.review.required.some((item) =>
  item.code === 'NCK1_DOCX_LISTENING_TIMING_REVIEW_REQUIRED'))

const tempRoot = mkdtempSync(path.join(tmpdir(), 'eqb-nck1-docx-producer-'))
try {
  for (const document of fixture.sourceDocuments) {
    const manifestDocument = fixture.manifest.documents.find((candidate) =>
      candidate.documentId === document.documentId)
    const outputPath = path.join(tempRoot, manifestDocument.path)
    mkdirSync(path.dirname(outputPath), { recursive: true })
    writeFileSync(outputPath, document.bytes)
  }
  const writerLock = paperWriterLockPath(tempRoot)
  const readyPath = path.join(tempRoot, 'concurrent-writer-ready')
  const lockModuleUrl = new URL('./import-pipeline/nck1-docx-materialize.mjs', import.meta.url).href
  const concurrentWriter = spawn(process.execPath, ['--input-type=module', '--eval', `
    import { writeFileSync } from 'node:fs'
    import { withPaperWriterLock } from ${JSON.stringify(lockModuleUrl)}
    withPaperWriterLock(
      { paperDir: ${JSON.stringify(tempRoot)}, paperId: ${JSON.stringify(fixture.paperId)} },
      () => {
        writeFileSync(${JSON.stringify(readyPath)}, 'ready')
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 750)
      },
    )
  `], { stdio: ['ignore', 'pipe', 'pipe'] })
  const concurrentWriterExit = once(concurrentWriter, 'exit')
  for (let attempt = 0; attempt < 300 && !existsSync(readyPath); attempt += 1) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10)
  }
  assert.equal(existsSync(readyPath), true, 'a real concurrent writer must acquire the paper lock')
  assert.throws(
    () => runNck1DocxMaterializationJob({
      paperDir: tempRoot,
      manifest: fixture.manifest,
    }),
    /already has a writer/u,
    'the same paperId cannot have concurrent materialization writers',
  )
  const [concurrentWriterCode] = await concurrentWriterExit
  assert.equal(concurrentWriterCode, 0)
  assert.equal(existsSync(writerLock), false, 'a successful writer releases the paper lock')

  assert.throws(
    () => withPaperWriterLock(
      { paperDir: tempRoot, paperId: fixture.paperId },
      () => { throw new Error('synthetic writer failure') },
    ),
    /synthetic writer failure/u,
  )
  assert.equal(existsSync(writerLock), false, 'a failed writer releases the paper lock')
  const first = runNck1DocxMaterializationJob({
    paperDir: tempRoot,
    manifest: fixture.manifest,
  })
  assert.equal(first.cached, false)
  assert.equal(first.disposition, 'ready_for_verification')
  const outputPath = path.join(tempRoot, fixture.manifest.materializationPath)
  const firstBytes = readFileSync(outputPath)
  const second = runNck1DocxMaterializationJob({
    paperDir: tempRoot,
    manifest: fixture.manifest,
  })
  assert.equal(second.cached, true)
  assert.equal(second.outputState, 'producer_output_unchanged')
  assert.deepEqual(readFileSync(outputPath), firstBytes)

  writeFileSync(outputPath, Buffer.concat([firstBytes, Buffer.from('\n')]))
  const resumed = runNck1DocxMaterializationJob({
    paperDir: tempRoot,
    manifest: fixture.manifest,
  })
  assert.equal(resumed.cached, true)
  assert.equal(resumed.outputState, 'agent_modified')
  assert.equal(readFileSync(outputPath).byteLength, firstBytes.byteLength + 1)

  const receiptBytes = readFileSync(first.receiptPath)
  rmSync(first.receiptPath)
  assert.throws(
    () => runNck1DocxMaterializationJob({
      paperDir: tempRoot,
      manifest: fixture.manifest,
    }),
    /refusing to overwrite/u,
    'an unbound existing Materialization is never overwritten',
  )
  assert.equal(readFileSync(outputPath).byteLength, firstBytes.byteLength + 1)
  writeFileSync(first.receiptPath, receiptBytes)

  const questionPath = path.join(tempRoot, fixture.manifest.documents[0].path)
  writeFileSync(questionPath, Buffer.concat([
    readFileSync(questionPath),
    Buffer.from('source changed'),
  ]))
  assert.throws(
    () => runNck1DocxMaterializationJob({
      paperDir: tempRoot,
      manifest: fixture.manifest,
    }),
    /create a new Source Capture/u,
    'changed source bytes cannot reuse or overwrite a digest-bound output',
  )
} finally {
  rmSync(tempRoot, { recursive: true, force: true })
}

console.log('verify-nck1-docx-materialization-producer: PASS')
