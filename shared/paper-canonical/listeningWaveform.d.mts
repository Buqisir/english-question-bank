export type ListeningWaveform = {
  readonly schemaVersion: 'listening-waveform-v1'
  readonly playbackAudioSha256: string
  readonly bucketSeconds: number
  readonly durationSeconds: number
  readonly reference: number
  readonly peaks: readonly number[]
}
export type ListeningTiming = {
  readonly segmentId: string
  readonly questionNumbers: readonly number[]
  readonly firstQuestionId: string
  readonly startSeconds: number
  readonly endSeconds: number
}
export const LISTENING_WAVEFORM_FILE: string
export const PUBLISHED_LISTENING_WAVEFORM_FILE: string
export function assertListeningWaveform(value: unknown, playbackAudioSha256: string, durationSeconds: number): ListeningWaveform
export function assertListeningPlaybackUi(value: unknown, playbackAudioSha256: string, durationSeconds: number): {
  waveform: ListeningWaveform
  segments: readonly ListeningTiming[]
}
export function firstListeningSectionRange(segments: readonly ListeningTiming[] | undefined, questionNumbers: readonly number[]): {
  startSeconds: number
  endSeconds: number
  segments: readonly ListeningTiming[]
} | null
