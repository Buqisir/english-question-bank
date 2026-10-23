// Decoder/ASR duration rounding may differ by less than one audio frame.
// Bound the descriptor, never rewrite the retained, hash-bound ASR JSON.
export function boundedAsrWindow(window, durationSeconds) {
  const { startSeconds, endSeconds } = window
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0
    || !Number.isFinite(startSeconds) || !Number.isFinite(endSeconds)
    || startSeconds < 0 || endSeconds <= startSeconds
    || startSeconds >= durationSeconds || endSeconds - durationSeconds > 0.05 + 1e-9) {
    throw new Error('ASR window lies outside the bound audio duration')
  }
  return { startSeconds, endSeconds: Math.min(endSeconds, durationSeconds) }
}
