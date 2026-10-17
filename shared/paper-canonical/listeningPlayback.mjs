// Playback timing is independent of retired waveform geometry.
export const LEGACY_LISTENING_WAVEFORM_FILE = 'materialization/listening-audio/waveform-v1.json'
export const PUBLISHED_LISTENING_PLAYBACK_UI_FILE = 'listening/playback-ui-v1.json'

export function assertListeningPlaybackUi(value, playbackAudioSha256, durationSeconds) {
  // Legacy derivatives bind audio inside waveform. Ignore its retired geometry,
  // but retain the original audio binding and verify the whole file digest upstream.
  const binding = value?.playbackAudioSha256 ? value : value?.waveform
  if (!binding || binding.playbackAudioSha256 !== playbackAudioSha256
    || !/^sha256:[a-f0-9]{64}$/.test(playbackAudioSha256)
    || !Number.isFinite(durationSeconds) || durationSeconds <= 0
    || !Number.isFinite(binding.durationSeconds)
    || Math.abs(binding.durationSeconds - durationSeconds) > 0.2) {
    throw new Error('Listening playback timing does not match audio')
  }
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
  return { segments: value.segments }
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
