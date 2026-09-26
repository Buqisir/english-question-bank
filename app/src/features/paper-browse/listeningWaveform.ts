// Screen-only waveform envelope for listening recordings. Decoded once per
// audio URL at a low sample rate (the envelope of speech survives it) and
// reduced to one loudness value per bucket; every segment player slices the same array.
export type WaveformEnvelope = {
  readonly bucketSeconds: number
  readonly peaks: Float32Array
  /** Loud reference level (99.5th percentile) so quiet recordings still read. */
  readonly reference: number
}

const BUCKET_SECONDS = 0.05
const DECODE_SAMPLE_RATE = 4000
const cache = new Map<string, Promise<WaveformEnvelope>>()

async function decodeEnvelope(src: string): Promise<WaveformEnvelope> {
  const response = await fetch(src, { credentials: 'same-origin' })
  if (!response.ok) throw new Error(`waveform fetch failed: ${response.status}`)
  const encoded = await response.arrayBuffer()
  const context = new OfflineAudioContext(1, 1, DECODE_SAMPLE_RATE)
  const buffer = await context.decodeAudioData(encoded)
  const samplesPerBucket = Math.max(1, Math.round(buffer.sampleRate * BUCKET_SECONDS))
  const bucketCount = Math.ceil(buffer.length / samplesPerBucket)
  // RMS loudness per bucket: speech peaks are nearly uniform, loudness is not.
  const peaks = new Float32Array(bucketCount)
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel)
    for (let bucket = 0; bucket < bucketCount; bucket += 1) {
      const from = bucket * samplesPerBucket
      const end = Math.min(data.length, from + samplesPerBucket)
      let sum = 0
      for (let index = from; index < end; index += 1) sum += data[index] * data[index]
      peaks[bucket] += Math.sqrt(sum / Math.max(1, end - from)) / buffer.numberOfChannels
    }
  }
  const sorted = Float32Array.from(peaks).sort()
  const reference = sorted[Math.floor(sorted.length * 0.995)] || 1
  return { bucketSeconds: samplesPerBucket / buffer.sampleRate, peaks, reference }
}

export function loadWaveformEnvelope(src: string): Promise<WaveformEnvelope> {
  let pending = cache.get(src)
  if (!pending) {
    pending = decodeEnvelope(src)
    pending.catch(() => cache.delete(src))
    cache.set(src, pending)
  }
  return pending
}

/** Bar heights in 0..1 for `barCount` equal slices of [start, end). */
export function waveformBars(
  envelope: WaveformEnvelope,
  startSeconds: number,
  endSeconds: number,
  barCount: number,
): number[] {
  const span = Math.max(0, endSeconds - startSeconds)
  return Array.from({ length: barCount }, (_, bar) => {
    const from = Math.floor((startSeconds + (span * bar) / barCount) / envelope.bucketSeconds)
    const to = Math.max(from + 1, Math.floor((startSeconds + (span * (bar + 1)) / barCount) / envelope.bucketSeconds))
    let peak = 0
    for (let index = from; index < to && index < envelope.peaks.length; index += 1) {
      if (envelope.peaks[index] > peak) peak = envelope.peaks[index]
    }
    return Math.min(1, peak / envelope.reference)
  })
}
