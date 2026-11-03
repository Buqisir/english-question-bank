import { allowedAudioUrl } from '../../../../../shared/paper-dictionary/audioUrl.mjs'
import type { AudioIconState } from '../../../icons/MotionIcons'
import { trackAudioIconState } from '../../../hooks/useAudioIconState'

let active: HTMLAudioElement | null = null
let detach: (() => void) | null = null

// 查词卡发音按钮的图标状态：哪一个录音（主地址）在等待 / 发声。换备用地址时保持 waiting。
type Snapshot = { key: string; state: AudioIconState }
let snapshot: Snapshot = { key: '', state: 'idle' }
const listeners = new Set<() => void>()
function setSnapshot(next: Snapshot) {
  if (next.key === snapshot.key && next.state === snapshot.state) return
  snapshot = next
  for (const listener of listeners) listener()
}
export function subscribeDictionaryAudio(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
export function getDictionaryAudioSnapshot() {
  return snapshot
}

function release() {
  detach?.()
  detach = null
  if (!active) return
  active.pause()
  active.removeAttribute('src')
  active.load()
  active = null
}

export function stopDictionaryAudio() {
  release()
  setSnapshot({ key: snapshot.key, state: 'idle' })
}

function playOnce(url: string, key: string): Promise<'played' | 'aborted'> {
  release()
  const audio = new Audio()
  audio.preload = 'none'
  audio.src = url
  active = audio
  setSnapshot({ key, state: 'waiting' })
  // 开播前的加载错误由 play() 的拒绝处理（可能还要换备用地址），这里不提前回到 idle，免得图标闪一下。
  let started = false
  detach = trackAudioIconState(audio, (state) => {
    if (active !== audio) return
    if (state === 'playing') started = true
    if (state === 'idle' && !started) return
    setSnapshot({ key, state })
  })
  return audio.play().then(() => 'played' as const, (error: unknown) => {
    if (active === audio) release()
    if (error instanceof DOMException && error.name === 'AbortError') return 'aborted' as const
    throw error
  })
}

export async function playDictionaryAudio(url: string, fallbackUrl?: string): Promise<void> {
  const allowed = allowedAudioUrl(url)
  const fallback = fallbackUrl ? allowedAudioUrl(fallbackUrl) : null
  if (!allowed) throw new Error('暂无录音')
  try {
    await playOnce(allowed, url)
    return
  } catch (error) {
    // 浏览器拒绝自动播放不是录音坏了，换一个文件也一样放不出。
    const blocked = error instanceof DOMException && error.name === 'NotAllowedError'
    if (!fallback || blocked) {
      setSnapshot({ key: url, state: 'idle' })
      throw new Error('暂时无法播放', { cause: error })
    }
  }
  try {
    await playOnce(fallback, url)
  } catch (error) {
    setSnapshot({ key: url, state: 'idle' })
    throw new Error('暂时无法播放', { cause: error })
  }
}
