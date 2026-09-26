import { allowedAudioUrl } from '../../../../../shared/paper-dictionary/audioUrl.mjs'

let active: HTMLAudioElement | null = null

export function stopDictionaryAudio() {
  if (!active) return
  active.pause()
  active.removeAttribute('src')
  active.load()
  active = null
}

function playOnce(url: string): Promise<'played' | 'aborted'> {
  stopDictionaryAudio()
  const audio = new Audio()
  audio.preload = 'none'
  audio.src = url
  active = audio
  return audio.play().then(() => 'played' as const, (error: unknown) => {
    if (active === audio) stopDictionaryAudio()
    if (error instanceof DOMException && error.name === 'AbortError') return 'aborted' as const
    throw error
  })
}

export async function playDictionaryAudio(url: string, fallbackUrl?: string): Promise<void> {
  const allowed = allowedAudioUrl(url)
  const fallback = fallbackUrl ? allowedAudioUrl(fallbackUrl) : null
  if (!allowed) throw new Error('暂无录音')
  try {
    await playOnce(allowed)
    return
  } catch (error) {
    // 浏览器拒绝自动播放不是录音坏了，换一个文件也一样放不出。
    const blocked = error instanceof DOMException && error.name === 'NotAllowedError'
    if (!fallback || blocked) throw new Error('暂时无法播放', { cause: error })
  }
  try {
    await playOnce(fallback)
  } catch (error) {
    throw new Error('暂时无法播放', { cause: error })
  }
}
