import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { buildReviewPack, edgeSentences, reviewCuts } from './listening-owner-review-pack.mjs'
import { writeListeningEvidence } from './lib-listening-evidence.mjs'

const hash = file => `sha256:${createHash('sha256').update(readFileSync(file)).digest('hex')}`
const put = (file, data) => { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify(data)) }
const pauses = [{ startSeconds: 1, endSeconds: 2 }, { startSeconds: 5, endSeconds: 7.5 },
  { startSeconds: 7.5, endSeconds: 8 }, { startSeconds: 11, endSeconds: 14 }]
const sourceText = 'M: Bright birds gather beside our quiet river. W: Fresh apples grow beyond those hills.'

function fixture() {
  const temp = realpathSync(mkdtempSync(path.join(tmpdir(), 'eqb-review-pack-'))), root = path.join(temp, 'repo')
  const paperId = 'paper-mock-review-test', paperDir = path.join(root, 'scripts/import-pipeline/papers', paperId)
  const attempt = path.join(root, 'imports/ocr-proofread', paperId, 'fast/listening-segment-attempts/attempt-2026-01-01')
  const audio = path.join(paperDir, 'materialization/listening-audio/playback.mp3')
  mkdirSync(path.dirname(audio), { recursive: true })
  execFileSync('ffmpeg', ['-nostdin', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=16',
    '-af', "volume='if(between(t,2,5)+between(t,8,11),0.5,0)':eval=frame", '-c:a', 'libmp3lame', audio])
  const tokens = sourceText.replace(/[MW]:/gu, '').replace(/[.]/gu, '').trim().split(/\s+/u)
  const words = [2, 8].flatMap(start => tokens.map((token, i) => ({
    token, rawRunText: token, startSeconds: start + i * 3 / tokens.length,
    endSeconds: start + (i + 1) * 3 / tokens.length,
  })))
  put(path.join(attempt, 'input.json'), { audioSha256: hash(audio), subject: { durationSeconds: 16, paperId } })
  put(path.join(paperDir, 'config.json'), { provenance: { paperName: '合成听核卷' } })
  put(path.join(attempt, 'silence.json'), { status: 0, pauses })
  const group = { segmentId: 'listening-text-1', decision: 'review_required', engine: 'fixture',
    sourceText, questionNumbers: [1], expectedReadings: 2, issues: ['BOUNDARY_UNCERTAIN'],
    observedWindows: [{ startSeconds: 0, endSeconds: 16, evidencePaths: ['raw.json'], words }] }
  put(path.join(attempt, 'raw.json'), { words })
  put(path.join(attempt, 'rule-result.json'), { groups: [group] })
  return { temp, root, papers: [paperId], paperId, paperDir, attempt, audio, group, output: path.join(temp, 'pack') }
}

test('compressed diagnostics produce identical Owner sentences, rounds, cuts and clip bytes; fingerprint includes gzip', () => {
  const f = fixture()
  try {
    const old = buildReviewPack({ ...f, attempts: { [f.paperId]: f.attempt } })
    const attempt = path.join(path.dirname(f.attempt), 'attempt-compact')
    cpSync(f.attempt, attempt, { recursive: true })
    rmSync(path.join(attempt, 'rule-result.json'))
    writeListeningEvidence({ attempt, apple: { groups: [f.group] }, resolved: { groups: [f.group] },
      input: { normalization: {} }, rawEvidence: [] })
    const next = buildReviewPack({ ...f, output: path.join(f.temp, 'compact-pack'), attempts: { [f.paperId]: attempt } })
    // Only the newly allocated attempt directory changes; compare every other
    // value, including nested anchor evidence and actual encoded clip digests.
    const semantic = manifest => JSON.parse(JSON.stringify(manifest.segments)
      .replaceAll(f.attempt, '<attempt>').replaceAll(attempt, '<attempt>'))
    assert.deepEqual(semantic(next), semantic(old))
    assert.equal(next.inputSha256[path.join(attempt, 'diagnostics.json.gz')], hash(path.join(attempt, 'diagnostics.json.gz')))
    const compressed = path.join(attempt, 'diagnostics.json.gz')
    writeFileSync(compressed, 'corrupt')
    assert.throws(() => buildReviewPack({ ...f, output: path.join(f.temp, 'bad-pack'),
      attempts: { [f.paperId]: attempt } }), /DIAGNOSTIC_INVALID/u)
    assert.equal(existsSync(path.join(f.temp, 'bad-pack')), false)
  } finally { rmSync(f.temp, { recursive: true, force: true }) }
})

test('0.8-second buffer stops at adjacent pause midpoints; context expands exact cut by 3 seconds', () => {
  const r = reviewCuts({ wordStartSeconds: 2, wordEndSeconds: 5, pauses, durationSeconds: 16 })
  assert.equal(r.startSeconds, 1.5)
  assert.equal(r.endSeconds, 5.8)
  assert.equal(r.actualLeadingBufferSeconds, 0.5)
  assert.equal(r.actualTrailingBufferSeconds, 0.8)
  assert.equal(r.clips[1].sourceStartSeconds, 0)
  assert.equal(r.clips[1].sourceEndSeconds, 8.8)
  const narrow = reviewCuts({ wordStartSeconds: 8, wordEndSeconds: 11, durationSeconds: 16,
    pauses: [{ startSeconds: 7.8, endSeconds: 8 }, { startSeconds: 11, endSeconds: 11.2 }] })
  assert.equal(narrow.startSeconds, 7.9)
  assert.equal(narrow.endSeconds, 11.1)
  const long = reviewCuts({ wordStartSeconds: 8, wordEndSeconds: 11, durationSeconds: 13,
    pauses: [{ startSeconds: 5, endSeconds: 8 }, { startSeconds: 11, endSeconds: 13 }] })
  assert.equal(long.startSeconds, 7.2)
  assert.equal(long.endSeconds, 11.8)
  assert.equal(long.clips[1].sourceEndSeconds, 13)
  assert.throws(() => reviewCuts({ wordStartSeconds: 2, wordEndSeconds: 5, pauses: [], durationSeconds: 16 }), /REVIEW_PACK_PAUSE_MISSING/u)
  assert.throws(() => reviewCuts({ wordStartSeconds: NaN, wordEndSeconds: 5, pauses, durationSeconds: 16 }), /INVALID_WORD_EDGES/u)
})

test('first and last sentences preserve literal source and abbreviations', () => {
  const text = 'M: Ask Mr. Smith at 3 p.m. W: Fine, thank you!'
  assert.deepEqual(edgeSentences(text), ['Ask Mr. Smith at 3 p.m.', 'Fine, thank you!'])
})

test('CLI emits distinct rounds, exact/context clips, literal Chinese page, SHA-bound unreviewed manifest, without source writes', () => {
  const f = fixture()
  try {
    const files = ['input.json', 'rule-result.json', 'silence.json', 'raw.json'].map(n => path.join(f.attempt, n))
    const before = files.map(hash), audioBefore = hash(f.audio)
    execFileSync(process.execPath, [path.join(import.meta.dirname, 'listening-owner-review-pack.mjs'),
      f.paperId, '--root', f.root, '--output', f.output])
    const manifest = JSON.parse(readFileSync(path.join(f.output, 'manifest.json')))
    assert.equal(manifest.ownerReviewed, false)
    assert.equal(manifest.asrAdded, false)
    assert.equal(manifest.sourceFingerprintCheck, 'PASS')
    assert.equal(manifest.timebase, 'normalized_playback_seconds')
    assert.equal(manifest.rules.bufferSeconds, 0.8)
    assert.equal(manifest.rules.contextSeconds, 3)
    assert.equal(manifest.rules.playbackRate, 1)
    assert.equal(manifest.inputSha256[path.join(import.meta.dirname, 'listening-owner-review-pack.mjs')],
      hash(path.join(import.meta.dirname, 'listening-owner-review-pack.mjs')))
    for (const file of files) assert.equal(manifest.inputSha256[file], hash(file))
    assert.equal(manifest.inputSha256[f.audio], audioBefore)
    assert.deepEqual(files.map(hash), before)
    assert.equal(hash(f.audio), audioBefore)
    const [segment] = manifest.segments
    assert.equal(segment.sourceText, sourceText)
    assert.equal(segment.paperName, '合成听核卷')
    assert.deepEqual(segment.readings.map(r => r.reading), [1, 2])
    assert.ok(segment.readings[0].endSeconds < segment.readings[1].startSeconds)
    for (const r of segment.readings) {
      assert.deepEqual(r.clips.map(c => c.kind), ['exact', 'context'])
      assert.ok(r.startSeconds >= r.signalEvidence.leadingMidpoint)
      assert.ok(r.endSeconds <= r.signalEvidence.trailingMidpoint)
      for (const c of r.clips) {
        assert.equal(hash(path.join(f.output, c.clipPath)), c.sha256)
        assert.ok(Math.abs(c.ffprobeDurationSeconds - c.requestedDurationSeconds) < 0.08)
        assert.equal(c.probe.streams[0].codec_name, 'mp3')
      }
    }
    const html = readFileSync(path.join(f.output, 'index.html'), 'utf8')
    for (const expected of ['lang="zh-CN"', '应听首句', '应听末句', '第 1 遍', '第 2 遍', '整录音', 'data-start="1.5"', 'audio controls']) assert.ok(html.includes(expected))
    assert.ok(!html.includes('BOUNDARY_UNCERTAIN'), 'machine issue codes stay in manifest')
    assert.throws(() => buildReviewPack(f), /OUTPUT_EXISTS/u)
  } finally { rmSync(f.temp, { recursive: true, force: true }) }
})

test('explicit paper/segment/reading selection and multiple papers do not repeat whole-envelope clips', () => {
  const f = fixture()
  try {
    const m = buildReviewPack({ ...f, selections: [`${f.paperId}:listening-text-1:2`] })
    assert.deepEqual(m.segments[0].readings.map(r => r.reading), [2])
    const other = 'paper-mock-second'
    cpSync(f.paperDir, path.join(f.root, 'scripts/import-pipeline/papers', other), { recursive: true })
    const otherBase = path.join(f.root, 'imports/ocr-proofread', other)
    cpSync(path.dirname(path.dirname(path.dirname(f.attempt))), otherBase, { recursive: true })
    put(path.join(otherBase, 'fast/listening-segment-attempts', path.basename(f.attempt), 'input.json'),
      { audioSha256: hash(f.audio), subject: { paperId: other, durationSeconds: 16 } })
    const both = buildReviewPack({ ...f, papers: [f.paperId, other], output: path.join(f.temp, 'multi') })
    assert.equal(both.segments.length, 2)
    assert.notEqual(both.segments[0].readings[0].clips[0].clipPath, both.segments[1].readings[0].clips[0].clipPath)
  } finally { rmSync(f.temp, { recursive: true, force: true }) }
})

test('review-pack anchors apply the shared pause projection to retained v1 attempts without changing display or input', () => {
  for (const prefix of ['', 'M: (Text 1)\n']) {
    const f = fixture()
    try {
      const literal = `${prefix}${sourceText} （停10秒）`
      const tokens = [...(prefix ? ['Text', '1'] : []),
        ...f.group.observedWindows[0].words.filter(w => w.startSeconds < 6).map(w => w.token)]
      const words = [2, 8].flatMap(start => tokens.map((token, i) => ({
        token, rawRunText: token, startSeconds: start + i * 3 / tokens.length,
        endSeconds: start + (i + 1) * 3 / tokens.length,
      })))
      put(path.join(f.attempt, 'raw.json'), { words })
      const file = path.join(f.attempt, 'rule-result.json')
      put(file, { groups: [{ ...f.group, sourceText: literal,
        observedWindows: [{ ...f.group.observedWindows[0], words }],
        sourceProjection: { version: 'listening-spoken-projection-v1', sourceText: literal,
          text: literal.replace(/^M: /gmu, '   '), exclusions: [] } }] })
      const before = hash(file)
      const manifest = buildReviewPack(f)
      assert.deepEqual(manifest.segments[0].readings.map(r => r.reading), [1, 2])
      assert.equal(manifest.segments[0].sourceText, literal)
      assert.ok(readFileSync(path.join(f.output, 'index.html'), 'utf8').includes(literal))
      assert.equal(hash(file), before)
      assert.equal(manifest.ownerReviewed, false)
      assert.equal(manifest.segments[0].readings[0].asrFirstWord.token, prefix ? 'text' : 'bright',
        'masking a speaker cannot turn its spoken (Text 1) into a heading on reprojection')
      assert.equal(manifest.segments[0].readings[0].wordStartSeconds, 2)
    } finally { rmSync(f.temp, { recursive: true, force: true }) }
  }
})

test('rejects source-directory/symlink output, bad selections, changed audio and missing edge evidence before output exists', () => {
  const f = fixture()
  try {
    assert.throws(() => buildReviewPack({ ...f, output: path.join(f.paperDir, 'pack') }), /OUTPUT_INSIDE_SOURCE/u)
    symlinkSync(f.paperDir, path.join(f.temp, 'alias'))
    assert.throws(() => buildReviewPack({ ...f, output: path.join(f.temp, 'alias/pack') }), /OUTPUT_INSIDE_SOURCE/u)
    assert.throws(() => buildReviewPack({ ...f, selections: [`${f.paperId}:listening-text-1:3`] }), /SELECTION_INVALID/u)
    assert.equal(existsSync(f.output), false)
    put(path.join(f.attempt, 'input.json'), { audioSha256: 'sha256:wrong', subject: { durationSeconds: 16 } })
    assert.throws(() => buildReviewPack(f), /AUDIO_CHANGED/u)
    put(path.join(f.attempt, 'input.json'), { audioSha256: hash(f.audio), subject: { paperId: 'paper-mock-other', durationSeconds: 16 } })
    assert.throws(() => buildReviewPack(f), /ATTEMPT_MISMATCH/u)
    put(path.join(f.attempt, 'input.json'), { audioSha256: hash(f.audio), subject: { durationSeconds: 16 } })
    put(path.join(f.attempt, 'silence.json'), { status: 0, pauses: [] })
    assert.throws(() => buildReviewPack(f), /PAUSE_MISSING/u)
    put(path.join(f.attempt, 'silence.json'), { status: 0, pauses })
    put(path.join(f.attempt, 'rule-result.json'), { groups: [{ ...f.group, observedWindows: [] }] })
    assert.throws(() => buildReviewPack(f), /READING_COUNT_AMBIGUOUS/u)
    assert.equal(existsSync(f.output), false)
  } finally { rmSync(f.temp, { recursive: true, force: true }) }
})

test('one-reading source stays one reading; ASR silence absorption retains raw edges and signal reconciliation', () => {
  const f = fixture()
  try {
    const words = f.group.observedWindows[0].words.filter(w => w.startSeconds < 6).map(w => ({ ...w }))
    words[0].startSeconds = 1.5
    words.at(-1).endSeconds = 5.6
    put(path.join(f.attempt, 'rule-result.json'), { groups: [{ ...f.group, expectedReadings: 1,
      observedWindows: [{ ...f.group.observedWindows[0], words }] }] })
    const m = buildReviewPack({ ...f, attempts: { [f.paperId]: f.attempt } })
    assert.equal(m.segments[0].readings.length, 1)
    const [r] = m.segments[0].readings
    assert.equal(r.asrFirstWord.startSeconds, 1.5)
    assert.equal(r.asrLastWord.endSeconds, 5.6)
    assert.equal(r.wordStartSeconds, 2)
    assert.equal(r.wordEndSeconds, 5)
    assert.equal(r.clips.length, 2)
  } finally { rmSync(f.temp, { recursive: true, force: true }) }
})
