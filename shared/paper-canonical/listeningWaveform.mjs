// Rebuildable playback geometry, not transcription, mapping or paper meaning.
export const LISTENING_WAVEFORM_FILE = 'materialization/listening-audio/waveform-v1.json'
export const PUBLISHED_LISTENING_WAVEFORM_FILE = 'listening/playback-ui-v1.json'

export function assertListeningWaveform(value, playbackAudioSha256, durationSeconds) {
  if (!value || value.schemaVersion !== 'listening-waveform-v1'
    || value.playbackAudioSha256 !== playbackAudioSha256
    || !/^sha256:[a-f0-9]{64}$/.test(playbackAudioSha256)
    || value.bucketSeconds !== 0.05
    || !Number.isFinite(value.durationSeconds) || value.durationSeconds <= 0
    || !Number.isFinite(durationSeconds) || Math.abs(value.durationSeconds - durationSeconds) > 0.2
    || !Number.isFinite(value.reference) || value.reference <= 0
    || !Array.isArray(value.peaks)
    || value.peaks.length !== Math.ceil(value.durationSeconds / value.bucketSeconds - 1e-9)
    || value.peaks.some((peak) => !Number.isFinite(peak) || peak < 0)) {
    throw new Error('Listening waveform does not match playback bytes/duration or envelope v1')
  }
  return value
}

export function assertListeningPlaybackUi(value, playbackAudioSha256, durationSeconds) {
  const waveform = assertListeningWaveform(value?.waveform, playbackAudioSha256, durationSeconds)
  let end = 0
  const numbers = new Set()
  if (!Array.isArray(value.segments)) throw new Error('Invalid listening playback timing')
  for (const segment of value.segments) {
    if (!segment || typeof segment.segmentId !== 'string' || !segment.segmentId
      || !Array.isArray(segment.questionNumbers) || !segment.questionNumbers.length
      || segment.questionNumbers.some((number) => !Number.isInteger(number) || number < 1 || number > 20 || numbers.has(number))
      || segment.firstQuestionId !== `question:listening:${Math.min(...segment.questionNumbers)}`
      || !Number.isFinite(segment.startSeconds) || !Number.isFinite(segment.endSeconds)
      || segment.startSeconds < end || segment.endSeconds <= segment.startSeconds || segment.endSeconds > durationSeconds) {
      throw new Error('Invalid listening playback timing')
    }
    end = segment.endSeconds
    segment.questionNumbers.forEach((number) => numbers.add(number))
  }
  // Do not allow presentation metadata to override the authoritative audio URL/digest.
  return { waveform, segments: value.segments }
}

// Require complete, ordered, single-question timing coverage. Candidate signal
// boundaries are still candidate boundaries; this does not confirm their content.
export function firstListeningSectionRange(segments, questionNumbers) {
  if (questionNumbers.join(',') !== '1,2,3,4,5' || !Array.isArray(segments)) return null
  const selected = segments.filter((segment) => segment.questionNumbers.some((number) => questionNumbers.includes(number)))
    .sort((left, right) => left.questionNumbers[0] - right.questionNumbers[0])
  if (selected.length !== questionNumbers.length || selected.some((segment, index) =>
    segment.questionNumbers.length !== 1 || segment.questionNumbers[0] !== questionNumbers[index]
    || !Number.isFinite(segment.startSeconds) || !Number.isFinite(segment.endSeconds)
    || segment.startSeconds < 0 || segment.endSeconds <= segment.startSeconds
    || (index > 0 && segment.startSeconds < selected[index - 1].endSeconds))) return null
  return { startSeconds: selected[0].startSeconds, endSeconds: selected.at(-1).endSeconds, segments: selected }
}
