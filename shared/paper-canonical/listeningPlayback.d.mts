export type ListeningTiming = {
  readonly segmentId: string
  readonly questionNumbers: readonly number[]
  readonly firstQuestionId: string
  readonly startSeconds: number
  readonly endSeconds: number
}
export const LEGACY_LISTENING_WAVEFORM_FILE: string
export const PUBLISHED_LISTENING_PLAYBACK_UI_FILE: string
export function assertListeningPlaybackUi(value: unknown, playbackAudioSha256: string, durationSeconds: number): {
  segments: readonly ListeningTiming[]
}
export function firstListeningSectionRange(segments: readonly ListeningTiming[] | undefined, questionNumbers: readonly number[]): {
  startSeconds: number
  endSeconds: number
  segments: readonly ListeningTiming[]
} | null
