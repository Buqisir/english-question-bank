import { listeningEditSpeakerLabels, listeningEditTurns, listeningEditWords } from '../../server/paper-import/spellingReview.mjs'
import { alignListeningSentences } from './listening-sentence-align.mjs'
import { align, preserveSourceForms, sameProperNameSound, timedReading, units } from './listening-transcript-check-alignment.mjs'

const spokenNumber = String.raw`(?:\d{1,2}|(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[- ](?:one|two|three|four|five|six|seven|eight|nine))?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen)`
const chineseNumber = '[一二两三四五六七八九十0-9]+'
const announcementStart = String.raw`(?:^|(?<=[.!?。！？:：]))\s*(?:`
  + String.raw`(?:text|questions?)\s+${spokenNumber}(?:\s*(?:to|through|[-–])\s*${spokenNumber})?`
  + String.raw`|第\s*${chineseNumber}\s*(?:段|小?题)`
  + String.raw`|听下面(?:\s*${chineseNumber}\s*段)?的?(?:对话|独白|录音)(?:\s*[,，]\s*回答第\s*${chineseNumber}(?:\s*(?:至|到|和)\s*第?\s*${chineseNumber})?\s*小?题)?`
  + String.raw`)`
const announcement = new RegExp(announcementStart + String.raw`\s*(?:[.!?。！？:：]+|$)`, 'giu')
const unclearAnnouncement = new RegExp(announcementStart + String.raw`(?=\s)`, 'iu')

function withoutAnnouncements(runs) {
  const text = runs.map(run => run.text.trim()).join(' ')
  const masked = text.replace(announcement, value => ' '.repeat(value.length))
  if (unclearAnnouncement.test(masked)) return null
  let offset = 0
  return runs.flatMap(run => {
    const end = offset + run.text.trim().length
    const spoken = masked.slice(offset, end).trim()
    offset = end + 1
    return spoken ? [{ ...run, text: spoken }] : []
  })
}

const turnEngines = ['parakeet-v2', 'gpt-transcribe', 'apple']
const turnCompounds = new Map([
  ['any more', 'anymore'], ['story book', 'storybook'], ['story books', 'storybooks'],
  ['text book', 'textbook'], ['text books', 'textbooks'], ['note book', 'notebook'], ['note books', 'notebooks'],
])

function turnWords(text) {
  const words = listeningEditWords(text)
  if (words.some(word => /[^a-z0-9']/u.test(word))) return words.map(token => ({ token }))
  const parts = units(text)
  const merged = []
  for (let i = 0; i < parts.length; i++) {
    const first = parts[i], second = parts[i + 1]
    const compound = turnCompounds.get(`${first.token} ${second?.token}`)
    if (compound && /^[ \t-]+$/u.test(text.slice(first.end, second.start))) {
      merged.push({ ...first, token: compound, end: second.end })
      i++
    } else merged.push(first)
  }
  return merged
}

export function listeningTurnWordVotes(before, after, evidence) {
  const wanted = turnWords(after)
  const retainedNames = new Set(turnWords(before).filter(word => word.name).map(word => word.token))
  const votes = wanted.map(word => ({ ...word, engines: [] }))
  for (const [engine, heard] of Object.entries(evidence)) {
    if (!turnEngines.includes(engine)) continue
    const { matches } = align(wanted, turnWords(heard), (expected, word) => expected.token === word.token
      || retainedNames.has(expected.token) && sameProperNameSound(expected, word))
    for (const { start, end } of matches) {
      for (let i = start; i < end; i++) votes[i].engines.push(engine)
    }
  }
  return votes
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
    if (!sentences.length || sentences.some(s => (s.speaker?.toLowerCase() ?? null) !== turn.speaker
      || s.passes[0]?.interpolated)) return null
    return { start: sentences[0].passes[0].start, end: sentences.at(-1).passes[0].end, count: sentences.length }
  })
  if (times.some(time => !time || !Number.isFinite(time.start) || !Number.isFinite(time.end))
    || times.reduce((count, time) => count + time.count, 0) !== alignment.sentences.length) return null
  return times
}

function timedTurns(reading, times, { startSeconds }) {
  const turns = times.map(({ start, end }) => ({ words: [], first: -1, last: -1, startSeconds: start, endSeconds: end }))
  let turn = 0, previous = -Infinity, covered = 0
  for (const [index, word] of reading.words.entries()) {
    if (/[\p{L}\p{N}]/u.test(reading.text.slice(covered, word.start))) return null
    covered = Math.max(covered, word.end)
    const middle = startSeconds + (word.startSeconds + word.endSeconds) / 2
    if (!Number.isFinite(middle) || middle < previous) return null
    previous = middle
    while (middle >= turns[turn]?.endSeconds) turn++
    const bucket = turns[turn]
    // Sentence times are rounded to hundredths of a second.
    if (!bucket || startSeconds + word.startSeconds < bucket.startSeconds - 0.005
      || startSeconds + word.endSeconds > bucket.endSeconds + 0.005) return null
    if (!bucket.words.length) bucket.first = index
    bucket.words.push(word)
    bucket.last = index
  }
  if (turns.some(bucket => !bucket.words.length) || /[\p{L}\p{N}]/u.test(reading.text.slice(covered))) return null
  // A single written word can expand to several normalized units. Keep them together.
  if (turns.slice(1).some(bucket => reading.words[bucket.first - 1].end > reading.words[bucket.first].start)) return null
  return turns
}

function turnText(reading, { words, last }, lastTurn) {
  const end = words.at(-1).end
  const next = reading.words[last + 1]?.start ?? reading.text.length
  const mark = reading.text.slice(end, next).trimEnd()
  if (!lastTurn && !/^[.!?]+["'’”)\]]*$/u.test(mark)) return null
  return reading.text.slice(words[0].start, end) + mark
}

export function chooseListeningTurn(before, evidence) {
  for (const engine of turnEngines) {
    if (!evidence[engine]) continue
    const after = preserveSourceForms(before, evidence[engine], listeningEditSpeakerLabels)
    const votes = listeningTurnWordVotes(before, after, evidence)
    if (votes.length && votes.every(word => word.engines.length >= 2)) return after
  }
  return null
}

export async function rewriteTurns(group, text, readings, engines, audioSha256, remote) {
  const { segmentId, occurrence } = group
  const manual = reason => ({
    edits: [],
    rewrite: { segmentId, reason },
    review: [{ segmentId, occurrence, before: text, reason,
      evidence: Object.fromEntries(readings.map(reading => [reading.engine, reading.text.trim()])) }],
  })
  const turns = listeningEditTurns(text)
  const runs = readings.map(({ engine }) => [engine, withoutAnnouncements(engines[engine][group.key] ?? [])])
  if (runs.some(([, spoken]) => !spoken)) return manual('疑似报幕的归属不明，请整段听核。')
  const cleaned = Object.fromEntries(runs.map(([engine, spoken]) => [engine, { [group.key]: spoken }]))
  const times = turns?.length && turnTimes(group, text, cleaned, turns)
  if (!times?.length) return manual('逐句时间不足，无法确认全部说话轮次，请整段听核。')
  const apple = timedReading(cleaned.apple[group.key], [])
  const parakeet = timedReading(cleaned['parakeet-v2'][group.key], [])
  const appleTurns = timedTurns(apple, times, occurrence)
  const recorded = timedTurns(parakeet, times, occurrence)
  if (!appleTurns || !recorded) return manual('录音词无法完整归到说话轮次，请整段听核。')
  const edits = []
  for (const [i, turn] of turns.entries()) {
    const { startSeconds, endSeconds } = recorded[i]
    const { start, end } = turn
    const before = text.slice(start, end)
    const last = i === turns.length - 1
    const evidence = { apple: turnText(apple, appleTurns[i], last), 'parakeet-v2': turnText(parakeet, recorded[i], last) }
    if (!evidence.apple || !evidence['parakeet-v2']) return manual('录音句界与说话人边界不兼容，请整段听核。')
    let after = chooseListeningTurn(before, evidence)
    if (after === null && remote) {
      const { text: heard } = await remote({ startSeconds, endSeconds })
      if (heard?.trim()) evidence['gpt-transcribe'] = heard.trim()
      after = chooseListeningTurn(before, evidence)
    }
    if (after === null) return manual('有轮次未获逐词两家支持，请整段听核。')
    if (before === after) continue
    edits.push({ segmentId, scope: 'turn', turnIndex: i, start, before, after, audioSha256, occurrence,
      startSeconds, endSeconds, evidence, reason: '按逐词录音共识整轮替换。' })
  }
  return { edits, review: [], rewrite: { segmentId, reason: '已按录音共识逐轮替换。' } }
}
