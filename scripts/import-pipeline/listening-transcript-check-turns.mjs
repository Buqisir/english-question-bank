import { listeningEditEvidenceMatch, listeningEditSpeakerLabels, listeningEditWords,
  touchesListeningSpeakerBoundary } from '../../server/paper-import/spellingReview.mjs'
import { alignListeningSentences } from './listening-sentence-align.mjs'
import { align } from './listening-transcript-check-alignment.mjs'

function sourceTurns(text) {
  const turns = []
  const labels = [...text.matchAll(listeningEditSpeakerLabels)]
  let start = 0, speaker = null
  for (const label of [...labels, { index: text.length, 0: '' }]) {
    const before = text.slice(start, label.index).trimEnd()
    const content = before.trimStart()
    if (content) {
      const previous = turns.at(-1)
      if (previous && previous.speaker === speaker) previous.end = start + before.length
      else turns.push({ start: start + before.length - content.length, end: start + before.length, speaker })
    } else if (speaker) return null
    start = label.index + label[0].length
    speaker = label[1]?.toLowerCase()
  }
  return turns
}

function turnTimes(group, text, engines, turns) {
  const { key, segmentId, occurrence } = group
  const window = (engine, field) => ({ ...occurrence, segments: [{ [field]: engines[engine][key] }] })
  const { segments: [alignment] } = alignListeningSentences({
    // The checker transcribes one reviewed occurrence at a time.
    document: { listening: { transcript: [{ segmentId, text, instruction: 'Read once.' }] } },
    review: { groups: [{ segmentId, playback: occurrence, occurrences: [occurrence] }] },
    apple: window('apple', 'runs'), whisper: [window('parakeet-v2', 'words')],
  })
  if (alignment.degraded) return null
  const times = turns.map(turn => {
    const sentences = alignment.sentences.filter(s => s.utf16Start >= turn.start && s.utf16End <= turn.end)
    if (!sentences.length || sentences.some(s => (s.speaker?.toLowerCase() ?? null) !== turn.speaker)) return null
    return { start: sentences[0].passes[0].start, end: sentences.at(-1).passes[0].end, count: sentences.length }
  })
  if (times.some(time => !time || !Number.isFinite(time.start) || !Number.isFinite(time.end))
    || times.reduce((count, time) => count + time.count, 0) !== alignment.sentences.length) return null
  return times
}

function timedTurns(reading, times, { startSeconds, endSeconds }) {
  const cuts = times.slice(1).map((time, i) => (times[i].end + time.start) / 2 - startSeconds)
  const edges = [0, ...cuts, endSeconds - startSeconds]
  const turns = times.map((_, i) => ({ words: [], first: -1, last: -1, startSeconds: edges[i] + startSeconds,
    endSeconds: i === times.length - 1 ? endSeconds : edges[i + 1] + startSeconds }))
  let turn = 0, previous = -Infinity
  for (const [index, word] of reading.words.entries()) {
    const middle = (word.startSeconds + word.endSeconds) / 2
    if (!Number.isFinite(middle) || middle < previous || middle < 0 || middle >= edges.at(-1)) return null
    previous = middle
    while (middle >= edges[turn + 1]) turn++
    const bucket = turns[turn]
    if (!bucket.words.length) bucket.first = index
    bucket.words.push(word)
    bucket.last = index
  }
  if (turns.some(bucket => !bucket.words.length)) return null
  // A single written word can expand to several normalized units. Keep them together.
  if (turns.slice(1).some(bucket => reading.words[bucket.first - 1].end > reading.words[bucket.first].start)) return null
  return turns
}

function turnSpan(text, turn, reading, bucket, lastTurn) {
  const first = bucket.words[0].start
  const end = bucket.words.at(-1).end
  const next = reading.words[bucket.last + 1]?.start ?? reading.text.length
  const mark = reading.text.slice(end, next).trimEnd()
  if (!lastTurn && !/^[.!?]+["'’”)\]]*$/u.test(mark)) return null
  let before = text.slice(turn.start, turn.end)
  let after = reading.text.slice(first, end) + mark
  if (touchesListeningSpeakerBoundary(text, { start: turn.start, before })) {
    // Admission protects the punctuation in front of a new speaker label too.
    const tail = before.match(/[^\p{L}\p{N}]+$/u)?.[0]
    if (!tail || !after.endsWith(tail)) return null
    before = before.slice(0, -tail.length)
    after = after.slice(0, -tail.length)
  }
  const span = { start: turn.start, before, after }
  return touchesListeningSpeakerBoundary(text, span) ? null : span
}

function evidenceFor(text, span, reading, { first, last }) {
  const removed = listeningEditWords(span.before).length
  const left = listeningEditWords(text.slice(0, span.start)).length
  const right = listeningEditWords(text).length - left - removed
  const { words, text: heardText } = reading
  let start = first, end = last
  // Alignment units may split contractions that admission counts as one word.
  while (start > 0 && listeningEditWords(heardText.slice(words[start].start, words[first].start)).length < Math.min(left, 2)) start--
  while (end < words.length - 1 && listeningEditWords(heardText.slice(words[last].end, words[end].end)).length < Math.min(right, 2)) end++
  const heard = heardText.slice(words[start].start, words[end].end)
  return listeningEditEvidenceMatch(text, span, heard) === 'unique' ? heard : null
}

export function rewriteTurns(group, text, readings, engines, audioSha256) {
  const { segmentId, occurrence } = group
  const manual = reason => ({
    edits: [],
    rewrite: { segmentId, reason },
    review: [{ segmentId, occurrence, before: text, reason,
      evidence: Object.fromEntries(readings.map(reading => [reading.engine, reading.text.trim()])) }],
  })
  const turns = sourceTurns(text)
  const times = turns?.length && turnTimes(group, text, engines, turns)
  if (!times?.length) return manual('逐句时间不足，无法确认全部说话轮次，请整段听核。')
  const apple = readings.find(reading => reading.engine === 'apple')
  const parakeet = readings.find(reading => reading.engine === 'parakeet-v2')
  const appleTurns = timedTurns(apple, times, occurrence)
  const recorded = timedTurns(parakeet, times, occurrence)
  if (!appleTurns || !recorded) return manual('录音词无法完整归到说话轮次，请整段听核。')
  const edits = []
  for (const [i, turn] of turns.entries()) {
    const { words, startSeconds, endSeconds } = recorded[i]
    if (align(words, appleTurns[i].words).similarity < 0.8) {
      return manual('两家引擎有轮次分歧，请整段听核。')
    }
    const span = turnSpan(text, turn, parakeet, recorded[i], i === turns.length - 1)
    if (!span) return manual('录音句界或标点与说话人边界不兼容，请整段听核。')
    if (span.before === span.after) continue
    const evidence = { apple: evidenceFor(text, span, apple, appleTurns[i]),
      'parakeet-v2': evidenceFor(text, span, parakeet, recorded[i]) }
    if (Object.values(evidence).some(heard => !heard)) {
      return manual('有轮次缺少两家可唯一定位的录音证据，请整段听核。')
    }
    edits.push({ segmentId, ...span, audioSha256, occurrence, startSeconds, endSeconds, evidence,
      reason: '按两家录音共识整轮替换。' })
  }
  return { edits, review: [], rewrite: { segmentId, reason: '已按录音共识逐轮替换。' } }
}
