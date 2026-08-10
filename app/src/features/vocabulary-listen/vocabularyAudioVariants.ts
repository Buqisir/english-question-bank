export type VocabularyAudioAccent = 'american' | 'british'

type VocabularyAudioEntry = {
  id: string
  audio?: {
    path: string
  }
}

export type BritishVocabularyAudioReadiness = {
  version: 'eqb-british-cori-high-v1'
  entryCount: 1600
  fileNamePattern: '{entryId}.mp3'
}

const BRITISH_AUDIO_VERSION = 'eqb-british-cori-high-v1'
const BRITISH_AUDIO_ROOT = `/vocabulary-assets/wanwei-round-one-v1/audio/${BRITISH_AUDIO_VERSION}`

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
  return accent === 'british'
    ? `${BRITISH_AUDIO_ROOT}/${entry.id}.mp3`
    : entry.audio?.path ?? `/vocabulary-assets/wanwei-round-one-v1/audio/eqb-british-teacher-v1/${entry.id}.mp3`
}
