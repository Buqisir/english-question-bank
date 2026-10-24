import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { loadNck1ReviewSource } from '../../server/import-review/revisionProjection.mjs'
import { produceNck1DocxMaterialization } from '../../server/paper-import/nck1DocxMaterializationProducer.mjs'
import { LISTENING_SIGNAL_ATTACHMENTS } from '../../server/paper-import/listeningAudioEvidence.mjs'
import { prepareSpellingReview } from '../../server/paper-import/spellingReview.mjs'
import { digestJson, sha256 } from '../../shared/paper-canonical/stable.mjs'
import { makeSyntheticNck1DocxFixture } from '../../test-fixtures/paper-import/nck1-docx-materialization-v1/fixture.mjs'
import { loadSpellingSourceEmphasis } from './spelling-source-emphasis.mjs'

test('spelling source coordinates survive a validated listening-count overlay and reject actual drift', () => {
  const scratch = path.resolve(import.meta.dirname, '../../.scratch')
  mkdirSync(scratch, { recursive: true })
  const dir = mkdtempSync(path.join(scratch, 'spelling-count-'))
  const encode = value => new TextEncoder().encode(value)
  const write = (name, value) => {
    const bytes = typeof value === 'string' ? encode(value) : encode(JSON.stringify(value))
    mkdirSync(path.dirname(path.join(dir, name)), { recursive: true })
    writeFileSync(path.join(dir, name), bytes)
    return bytes
  }
  try {
    const fixture = makeSyntheticNck1DocxFixture({ transformXml: xml => xml.replace(
      'A passage keeps one small promise.',
      'A passage keeps one </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>small</w:t></w:r><w:r><w:t xml:space="preserve"> promise.',
    ) })
    const raw = produceNck1DocxMaterialization({ paperId: fixture.paperId, documents: fixture.sourceDocuments }).materialization
    const before = '每段对话仅读一遍。', after = '每段对话读两遍。'
    const source = raw.groups[0].blocks[0].source
    raw.listening = { state: 'captured', transcript: [{ segmentId: 'dialogue-1', questionNumbers: [1], text: 'Synthetic dialogue.', source }] }
    raw.sourcePresentation = { instructions: [{ slotId: 'listening.short-dialogue', text: before, source }] }
    const bytes = write('materialization.json', raw)
    write('config.json', { paperId: fixture.paperId })
    const original = write(LISTENING_SIGNAL_ATTACHMENTS[0].path, 'fixture original')
    const playback = write(LISTENING_SIGNAL_ATTACHMENTS[1].path, 'fixture playback')
    const segments = write(LISTENING_SIGNAL_ATTACHMENTS[2].path, {
      schemaVersion: 'listening-audio-segments-v1', paperId: fixture.paperId,
      originalAudioSha256: sha256(original), playbackAudioSha256: sha256(playback),
      durationSeconds: 60, contentValidation: 'not_performed', state: 'unsegmented', candidates: [],
    })
    write('universal-source-manifest.json', {
      ...fixture.manifest, schemaVersion: 'universal-nck1-source-manifest-v3',
      materializationPath: 'materialization.json', mediaDirectory: 'media',
      documents: fixture.sourceDocuments.map(document => ({ ...raw.documents.find(d => d.documentId === document.documentId), path: `${document.documentId}.bin` })),
      attachments: LISTENING_SIGNAL_ATTACHMENTS.map((item, i) => ({
        ...item, sha256: sha256([original, playback, segments][i]), byteLength: [original, playback, segments][i].length,
      })),
    })
    for (const document of fixture.sourceDocuments) writeFileSync(path.join(dir, `${document.documentId}.bin`), document.bytes)
    const content = JSON.stringify({ segments: ['Synthetic repeated dialogue.'] })
    const correction = {
      schemaVersion: 'listening-instruction-correction-v1', policy: 'verified-recording-count-v1',
      paperId: raw.paperId, materializationSha256: sha256(bytes), transcriptDigest: digestJson(raw.listening.transcript),
      originalAudioSha256: sha256(original), playbackAudioSha256: sha256(playback), durationSeconds: 60,
      reviewedBy: 'import_agent', reviewedAt: '2026-10-24T00:00:00.000Z',
      method: 'audio_source_comparison', untrustedContentHandledAsData: true,
      evidence: [{ evidenceId: 'recording', content, sha256: sha256(encode(content)), byteLength: encode(content).length,
        window: { startSeconds: 0, endSeconds: 60 }, settings: { engine: 'fixture', model: 'fixture', language: 'en', vad: false, computeType: 'fixture' } }],
      instructions: [{ slotId: 'listening.short-dialogue', source, before, after, playCount: 2, reason: '合成录音有完整两遍',
        groups: [{ segmentId: 'dialogue-1', occurrences: [1, 20].map(startSeconds => ({ startSeconds, endSeconds: startSeconds + 10, evidenceIds: ['recording'] })) }] }],
    }
    write('listening-instruction-correction-v1.json', correction)
    const request = { materialization: raw, report: prepareSpellingReview(bytes) }
    const loaded = loadNck1ReviewSource(dir, { preparingSpelling: true })
    assert.deepEqual(loaded.materialization, raw, 'prepare-spelling must pair its report with the original materialization')
    assert(loaded.sourceInput.listeningInstructionCorrectionBytes, 'Candidate still receives the validated correction')
    assert.equal(loadNck1ReviewSource(dir).materialization.sourcePresentation.instructions[0].text, after)
    const emphasis = loadSpellingSourceEmphasis(dir, request)
    assert([...emphasis.values()].some(ranges => ranges.some(range => range.marks.includes('bold'))))
    const changed = structuredClone(request)
    changed.materialization.groups[0].blocks[0].content[0].text += ' changed'
    assert.throws(() => loadSpellingSourceEmphasis(dir, changed), /Spelling request differs/)
    assert.throws(() => loadSpellingSourceEmphasis(dir, {
      ...request, report: { ...request.report, materializationSha256: sha256(encode('stale')) },
    }), /Spelling request differs/)
    correction.materializationSha256 = sha256(encode('stale'))
    write('listening-instruction-correction-v1.json', correction)
    assert.throws(() => loadSpellingSourceEmphasis(dir, request), /stale source\/audio/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
