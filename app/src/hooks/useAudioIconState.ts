import { useCallback, useEffect, useRef, useState } from 'react'
import type { AudioIconState } from '../icons/MotionIcons'

export function trackAudioIconState(audio: HTMLAudioElement, onChange: (state: AudioIconState) => void) {
  const playing = () => onChange('playing')
  // 换音源前的 pause() 会异步派发一个旧的 pause 事件；那时新的 play() 已经开始，忽略它。
  const paused = () => { if (audio.paused) onChange('idle') }
  const stopped = () => onChange('idle')
  audio.addEventListener('playing', playing)
  audio.addEventListener('pause', paused)
  audio.addEventListener('ended', stopped)
  audio.addEventListener('error', stopped)
  return () => {
    audio.removeEventListener('playing', playing)
    audio.removeEventListener('pause', paused)
    audio.removeEventListener('ended', stopped)
    audio.removeEventListener('error', stopped)
  }
}

// 发音图标的状态只来自真实的音频事件：点击后 waiting，playing 事件到达才算发声，
// ended / pause / error 或 play() 被拒绝都回到 idle。key 用来区分同一处的多个按钮。
export function useAudioIconState() {
  const [current, setCurrent] = useState<{ key: string; state: AudioIconState }>({ key: '', state: 'idle' })
  const active = useRef<HTMLAudioElement | null>(null)
  const detach = useRef<(() => void) | null>(null)

  useEffect(() => () => {
    detach.current?.()
    active.current = null
  }, [])

  const play = useCallback((audio: HTMLAudioElement, key = '') => {
    detach.current?.()
    active.current = audio
    const set = (state: AudioIconState) => { if (active.current === audio) setCurrent({ key, state }) }
    detach.current = trackAudioIconState(audio, set)
    set('waiting')
    return audio.play().catch((error: unknown) => {
      set('idle')
      throw error
    })
  }, [])

  const stateFor = useCallback((key = '') => (current.key === key ? current.state : 'idle'), [current])
  return { state: current.state, stateFor, play }
}
