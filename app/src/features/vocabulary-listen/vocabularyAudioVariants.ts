export type VocabularyAudioAccent = 'american' | 'british'

export const VOCABULARY_AUDIO_ACCENT_STORAGE_KEY = 'eqb-vocabulary-review-accent-wanwei-round-one-v1'
const DEFAULT_PROGRAM_ID = 'wanwei-round-one-v1'

function accentStorageKey(programId: string): string {
  return `eqb-vocabulary-review-accent:${programId}`
}

type VocabularyAudioEntry = {
  id: string
  audio?: {
    path: string
  }
  audioVariants?: Partial<Record<VocabularyAudioAccent, { path: string }>>
}

export type BritishVocabularyAudioReadiness = {
  version: 'eqb-british-cori-high-v1'
  entryCount: 1600
  fileNamePattern: '{entryId}.mp3'
}

const BRITISH_AUDIO_VERSION = 'eqb-british-cori-high-v1'
const BRITISH_AUDIO_ROOT = `/vocabulary-assets/wanwei-round-one-v1/audio/${BRITISH_AUDIO_VERSION}`

export function readVocabularyAudioAccent(programId = DEFAULT_PROGRAM_ID): VocabularyAudioAccent {
  if (typeof window === 'undefined') return 'american'
  const saved = window.localStorage.getItem(accentStorageKey(programId))
    ?? (programId === DEFAULT_PROGRAM_ID ? window.localStorage.getItem(VOCABULARY_AUDIO_ACCENT_STORAGE_KEY) : null)
  return saved === 'british' ? 'british' : 'american'
}

export function saveVocabularyAudioAccent(accent: VocabularyAudioAccent, programId = DEFAULT_PROGRAM_ID): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(accentStorageKey(programId), accent)
  if (programId === DEFAULT_PROGRAM_ID) window.localStorage.setItem(VOCABULARY_AUDIO_ACCENT_STORAGE_KEY, accent)
}

export async function getBritishVocabularyAudioReadiness(signal?: AbortSignal): Promise<BritishVocabularyAudioReadiness | null> {
  try {
    const response = await fetch(`${BRITISH_AUDIO_ROOT}/ready.json`, { signal })
    if (!response.ok) return null
    const payload = await response.json() as Partial<BritishVocabularyAudioReadiness>
    if (
      payload.version !== BRITISH_AUDIO_VERSION
      || payload.entryCount !== 1600
      || payload.fileNamePattern !== '{entryId}.mp3'
    ) return null
    return payload as BritishVocabularyAudioReadiness
  } catch (error) {
    if (signal?.aborted) throw error
    return null
  }
}

export function getVocabularyAudioPath(entry: VocabularyAudioEntry, accent: VocabularyAudioAccent): string {
  const explicitVariant = entry.audioVariants?.[accent]?.path
  if (explicitVariant) return explicitVariant
  return accent === 'british'
    ? `${BRITISH_AUDIO_ROOT}/${entry.id}.mp3`
    : entry.audio?.path ?? `/vocabulary-assets/wanwei-round-one-v1/audio/eqb-british-teacher-v1/${entry.id}.mp3`
}
