import {
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  ListMusic,
  Pause,
  Play,
  RotateCcw,
  Volume2,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PublicVocabularyDictationSet } from '../../domain/vocabulary'
import { getPublicVocabularyDictationSet, VocabularyApiError } from '../../services/vocabulary'
import { getVocabularyAudioPath, type VocabularyAudioAccent } from '../vocabulary-listen/vocabularyAudioVariants'
import './vocabularyDictationPage.css'

type DictationStatus = 'idle' | 'countdown' | 'playing' | 'waiting' | 'paused' | 'ended' | 'error'

const REPEAT_GAP_MS = 800
const COUNTDOWN_SECONDS = 3
const SETTINGS_STORAGE_KEY = 'eqb-vocabulary-dictation-settings-v1'
const SESSION_STORAGE_KEY = 'eqb-vocabulary-dictation-session-v1'

type SavedSettings = {
  repeatCount: 1 | 2 | 3
  gapSeconds: number
}

function clampGap(value: number) {
  return Math.max(3, Math.min(15, Math.round(value)))
}

function readSavedSettings(): SavedSettings {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SETTINGS_STORAGE_KEY) ?? '{}') as Partial<SavedSettings>
    return {
      repeatCount: parsed.repeatCount === 1 || parsed.repeatCount === 3 ? parsed.repeatCount : 2,
      gapSeconds: clampGap(Number(parsed.gapSeconds) || 5),
    }
  } catch {
    return { repeatCount: 2, gapSeconds: 5 }
  }
}

function LoadState({ kind, onRetry }: { kind: 'loading' | 'missing' | 'revoked' | 'error'; onRetry: () => void }) {
  const content = kind === 'loading'
    ? { title: '正在准备听写', detail: '题目顺序和录音正在载入。' }
    : kind === 'revoked'
      ? { title: '这份听写练习已停止分享', detail: '请向老师索取新的听写纸。' }
      : kind === 'missing'
        ? { title: '没有找到这份听写练习', detail: '链接可能不完整，请重新扫描纸上的二维码。' }
        : { title: '听写练习暂时无法打开', detail: '请检查网络后再试一次。' }

  return (
    <main className="vocabulary-dictation-message" aria-live="polite">
      <div>
        <ListMusic size={30} strokeWidth={1.5} aria-hidden="true" />
        <h1>{content.title}</h1>
        <p>{content.detail}</p>
        {kind === 'error' && <button type="button" onClick={onRetry}><RotateCcw size={16} />重新加载</button>}
      </div>
    </main>
  )
}

export function VocabularyDictationPage({
  shareId,
  accent,
}: {
  shareId: string
  accent: VocabularyAudioAccent
}) {
  const savedSettings = useMemo(readSavedSettings, [])
  const [set, setSet] = useState<PublicVocabularyDictationSet | null>(null)
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'missing' | 'revoked' | 'error'>('loading')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [repeatCount, setRepeatCount] = useState<1 | 2 | 3>(savedSettings.repeatCount)
  const [gapSeconds, setGapSeconds] = useState(savedSettings.gapSeconds)
  const [gapInputValue, setGapInputValue] = useState(String(savedSettings.gapSeconds))
  const [volume, setVolume] = useState(1)
  const [playedRepeat, setPlayedRepeat] = useState(0)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [status, setStatus] = useState<DictationStatus>('idle')
  const [resumePrompt, setResumePrompt] = useState(false)
  const [answerConfirmOpen, setAnswerConfirmOpen] = useState(false)
  const [showAnswers, setShowAnswers] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const timerRef = useRef<number | null>(null)
  const timerResolveRef = useRef<((continued: boolean) => void) | null>(null)
  const activeAudioResolveRef = useRef<((played: boolean) => void) | null>(null)
  const generationRef = useRef(0)
  const shouldContinueRef = useRef(false)
  const currentIndexRef = useRef(0)
  const repeatCountRef = useRef(repeatCount)
  const gapSecondsRef = useRef(gapSeconds)
  const statusRef = useRef<DictationStatus>('idle')
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null)
  const cueContextRef = useRef<AudioContext | null>(null)

  const entries = set?.entries ?? []
  const currentEntry = entries[currentIndex] ?? null
  const progress = entries.length ? ((currentIndex + 1) / entries.length) * 100 : 0
  const sessionKey = `${SESSION_STORAGE_KEY}:${shareId}:${accent}`

  const saveSession = useCallback((index: number, completed = false) => {
    window.localStorage.setItem(sessionKey, JSON.stringify({ index, completed }))
  }, [sessionKey])

  const releaseWakeLock = useCallback(() => {
    const lock = wakeLockRef.current
    wakeLockRef.current = null
    if (lock) void lock.release().catch(() => {})
  }, [])

  const requestWakeLock = useCallback(() => {
    const wakeLock = navigator.wakeLock
    if (!wakeLock || wakeLockRef.current) return
    void wakeLock.request('screen')
      .then((lock) => { wakeLockRef.current = lock })
      .catch(() => {})
  }, [])

  const cancelPending = useCallback((pauseAudio = true) => {
    generationRef.current += 1
    shouldContinueRef.current = false
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    timerResolveRef.current?.(false)
    timerResolveRef.current = null
    activeAudioResolveRef.current?.(false)
    activeAudioResolveRef.current = null
    if (pauseAudio) audioRef.current?.pause()
    setCountdown(null)
    releaseWakeLock()
  }, [releaseWakeLock])

  const load = useCallback(() => {
    const controller = new AbortController()
    setLoadState('loading')
    getPublicVocabularyDictationSet(shareId, controller.signal)
      .then((nextSet) => {
        let savedIndex = 0
        let completed = false
        try {
          const saved = JSON.parse(window.localStorage.getItem(sessionKey) ?? '{}') as { index?: number; completed?: boolean }
          savedIndex = Math.max(0, Math.min(nextSet.entries.length - 1, Number(saved.index) || 0))
          completed = saved.completed === true
        } catch {}
        setSet(nextSet)
        setCurrentIndex(savedIndex)
        currentIndexRef.current = savedIndex
        setStatus(completed ? 'ended' : 'idle')
        statusRef.current = completed ? 'ended' : 'idle'
        setResumePrompt(savedIndex > 0 && !completed)
        setLoadState('ready')
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        if (error instanceof VocabularyApiError && error.status === 410) setLoadState('revoked')
        else if (error instanceof VocabularyApiError && error.status === 404) setLoadState('missing')
        else setLoadState('error')
      })
    return () => controller.abort()
  }, [sessionKey, shareId])

  useEffect(load, [load])

  useEffect(() => {
    repeatCountRef.current = repeatCount
    gapSecondsRef.current = gapSeconds
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ repeatCount, gapSeconds }))
  }, [gapSeconds, repeatCount])

  useEffect(() => {
    currentIndexRef.current = currentIndex
  }, [currentIndex])

  useEffect(() => {
    statusRef.current = status
  }, [status])

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume
  }, [volume])

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'hidden') return
      if (!['countdown', 'playing', 'waiting'].includes(statusRef.current)) return
      cancelPending()
      setStatus('paused')
      saveSession(currentIndexRef.current)
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [cancelPending, saveSession])

  useEffect(() => () => {
    cancelPending()
    cueContextRef.current?.close().catch(() => {})
    cueContextRef.current = null
    const audio = audioRef.current
    audio?.removeAttribute('src')
    audio?.load()
  }, [cancelPending])

  const wait = useCallback((milliseconds: number, generation: number) => new Promise<boolean>((resolve) => {
    const finish = (continued: boolean) => {
      timerRef.current = null
      if (timerResolveRef.current === finish) timerResolveRef.current = null
      resolve(continued)
    }
    timerResolveRef.current = finish
    timerRef.current = window.setTimeout(
      () => finish(generationRef.current === generation && shouldContinueRef.current),
      milliseconds,
    )
  }), [])

  const playCue = useCallback(async (generation: number) => {
    try {
      const AudioContextConstructor = window.AudioContext
      const context = cueContextRef.current ?? new AudioContextConstructor()
      cueContextRef.current = context
      if (context.state === 'suspended') await context.resume()
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.frequency.value = 660
      gain.gain.setValueAtTime(0.0001, context.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.035, context.currentTime + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.09)
      oscillator.connect(gain)
      gain.connect(context.destination)
      oscillator.start()
      oscillator.stop(context.currentTime + 0.1)
    } catch {}
    return wait(180, generation)
  }, [wait])

  const playAudioOnce = useCallback((index: number, generation: number) => new Promise<boolean>((resolve) => {
    const audio = audioRef.current
    const entry = entries[index]
    if (!audio || !entry || generationRef.current !== generation) {
      resolve(false)
      return
    }
    const onEnded = () => finish(true)
    const onError = () => {
      if (generationRef.current !== generation || activeAudioResolveRef.current !== finish) return
      shouldContinueRef.current = false
      setStatus('error')
      releaseWakeLock()
      finish(false)
    }
    const finish = (played: boolean) => {
      if (activeAudioResolveRef.current === finish) activeAudioResolveRef.current = null
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('error', onError)
      resolve(played && generationRef.current === generation && shouldContinueRef.current)
    }
    activeAudioResolveRef.current = finish
    audio.addEventListener('ended', onEnded, { once: true })
    audio.addEventListener('error', onError, { once: true })
    audio.src = getVocabularyAudioPath(entry, accent)
    audio.currentTime = 0
    audio.volume = volume
    void audio.play().catch(() => {
      if (generationRef.current !== generation || activeAudioResolveRef.current !== finish) return
      shouldContinueRef.current = false
      setStatus('error')
      releaseWakeLock()
      finish(false)
    })
  }), [accent, entries, releaseWakeLock, volume])

  const runFrom = useCallback(async (startIndex: number, withCountdown: boolean) => {
    cancelPending()
    const generation = generationRef.current
    shouldContinueRef.current = true
    requestWakeLock()

    if (withCountdown) {
      setStatus('countdown')
      for (let value = COUNTDOWN_SECONDS; value >= 1; value -= 1) {
        setCountdown(value)
        if (!await wait(1000, generation)) return
      }
      setCountdown(null)
    }

    let index = startIndex
    while (index < entries.length && generationRef.current === generation && shouldContinueRef.current) {
      currentIndexRef.current = index
      setCurrentIndex(index)
      setPlayedRepeat(0)
      saveSession(index)
      if (!await playCue(generation)) return

      let repetition = 0
      while (repetition < repeatCountRef.current) {
        if (repetition > 0 && !await wait(REPEAT_GAP_MS, generation)) return
        setStatus('playing')
        setPlayedRepeat(repetition + 1)
        if (!await playAudioOnce(index, generation)) return
        repetition += 1
      }

      setStatus('waiting')
      if (!await wait(gapSecondsRef.current * 1000, generation)) return
      if (index === entries.length - 1) {
        shouldContinueRef.current = false
        setStatus('ended')
        saveSession(index, true)
        releaseWakeLock()
        return
      }
      index += 1
    }
  }, [cancelPending, entries.length, playAudioOnce, playCue, releaseWakeLock, requestWakeLock, saveSession, wait])

  const pause = useCallback(() => {
    cancelPending()
    setStatus('paused')
    saveSession(currentIndexRef.current)
  }, [cancelPending, saveSession])

  const togglePlayback = useCallback(() => {
    if (!currentEntry) return
    if (['countdown', 'playing', 'waiting'].includes(status)) {
      pause()
      return
    }
    if (status === 'ended') {
      setShowAnswers(false)
      setAnswerConfirmOpen(false)
      currentIndexRef.current = 0
      setCurrentIndex(0)
      saveSession(0)
      void runFrom(0, true)
      return
    }
    void runFrom(currentIndexRef.current, status === 'idle')
  }, [currentEntry, pause, runFrom, saveSession, status])

  const selectQuestion = useCallback((nextIndex: number) => {
    const wasRunning = ['countdown', 'playing', 'waiting'].includes(status)
    cancelPending()
    currentIndexRef.current = nextIndex
    setCurrentIndex(nextIndex)
    setPlayedRepeat(0)
    setStatus(wasRunning ? 'idle' : status === 'ended' || status === 'error' ? 'idle' : status)
    saveSession(nextIndex)
    if (wasRunning) void runFrom(nextIndex, false)
  }, [cancelPending, runFrom, saveSession, status])

  const startOver = useCallback(() => {
    cancelPending()
    setResumePrompt(false)
    setShowAnswers(false)
    setAnswerConfirmOpen(false)
    currentIndexRef.current = 0
    setCurrentIndex(0)
    setPlayedRepeat(0)
    setStatus('idle')
    saveSession(0)
  }, [cancelPending, saveSession])

  const replayFromStart = useCallback(() => {
    startOver()
    void runFrom(0, true)
  }, [runFrom, startOver])

  const replayCurrent = useCallback(() => {
    setShowAnswers(false)
    setAnswerConfirmOpen(false)
    void runFrom(currentIndexRef.current, false)
  }, [runFrom])

  const statusText = useMemo(() => {
    if (status === 'countdown') return `${countdown ?? COUNTDOWN_SECONDS} 秒后开始`
    if (status === 'playing') return `正在播放 · 第 ${playedRepeat} 遍`
    if (status === 'waiting') return `书写时间 · ${gapSeconds} 秒`
    if (status === 'paused') return '已暂停，继续时会从本题重新播放'
    if (status === 'ended') return '本组听写完成'
    if (status === 'error') return '当前单词加载失败，请重试'
    return '准备开始'
  }, [countdown, gapSeconds, playedRepeat, status])

  const audioElement = <audio ref={audioRef} preload="metadata" hidden />

  if (loadState !== 'ready' || !set || !currentEntry) {
    return <>{audioElement}<LoadState kind={loadState === 'ready' ? 'error' : loadState} onRetry={load} /></>
  }

  return (
    <div className="vocabulary-dictation-page">
      {audioElement}
      <header className="vocabulary-dictation-header">
        <a href="/" aria-label="返回英语题库首页">EQBank</a>
        <span>自动听写</span>
      </header>

      <main className="vocabulary-dictation-shell">
        {resumePrompt ? (
          <section className="vocabulary-dictation-resume" aria-labelledby="dictation-resume-title">
            <RotateCcw size={30} strokeWidth={1.5} aria-hidden="true" />
            <h1 id="dictation-resume-title">继续上次听写？</h1>
            <p>{set.title} · 已到第 {currentIndex + 1} / {entries.length} 题</p>
            <div>
              <button type="button" className="primary" onClick={() => setResumePrompt(false)}>继续上次听写</button>
              <button type="button" onClick={startOver}>从头开始</button>
            </div>
          </section>
        ) : (
          <>
            <section className="vocabulary-dictation-stage" aria-live="polite">
              <div className="vocabulary-dictation-title-row">
                <h1>{set.title}</h1>
                <strong>{currentIndex + 1} / {entries.length}</strong>
              </div>
              <div className="vocabulary-dictation-question">
                <p>第</p>
                <strong>{currentIndex + 1}</strong>
                <p>题</p>
                <span className={status === 'playing' ? 'is-playing' : undefined} aria-hidden="true"><i /><i /><i /></span>
              </div>
              <p className={status === 'error' ? 'vocabulary-dictation-status is-error' : 'vocabulary-dictation-status'}>{statusText}</p>
              <p className="vocabulary-dictation-instruction">请在纸上写下英文单词、词性和一个中文义。</p>
              <div
                className="vocabulary-dictation-progress"
                role="progressbar"
                aria-label="听写进度"
                aria-valuemin={1}
                aria-valuemax={entries.length}
                aria-valuenow={currentIndex + 1}
                aria-valuetext={`${currentIndex + 1} / ${entries.length}`}
              >
                <span style={{ transform: `scaleX(${progress / 100})` }} />
              </div>
            </section>

            <section className="vocabulary-dictation-controls" aria-label="自动听写控制">
              <div className="vocabulary-dictation-transport">
                <button type="button" onClick={() => selectQuestion(Math.max(0, currentIndex - 1))} disabled={currentIndex === 0} aria-label="上一题"><ChevronLeft size={22} /></button>
                <button
                  type="button"
                  className="primary-control"
                  onClick={status === 'error' ? () => void runFrom(currentIndex, false) : togglePlayback}
                  aria-label={['countdown', 'playing', 'waiting'].includes(status) ? '暂停听写' : status === 'error' ? '重试当前单词音频' : status === 'ended' ? '从头再听一遍' : status === 'paused' ? '继续听写' : '开始听写'}
                >
                  {['countdown', 'playing', 'waiting'].includes(status)
                    ? <Pause size={24} fill="currentColor" />
                    : status === 'error' || status === 'ended'
                      ? <RotateCcw size={22} />
                      : <Play size={24} fill="currentColor" />}
                </button>
                <button type="button" onClick={() => selectQuestion(Math.min(entries.length - 1, currentIndex + 1))} disabled={currentIndex === entries.length - 1} aria-label="下一题"><ChevronRight size={22} /></button>
              </div>

              <button type="button" className="vocabulary-dictation-replay" onClick={replayCurrent} disabled={status === 'countdown'}>
                <RotateCcw size={16} aria-hidden="true" />
                重播本题
              </button>

              <div className="vocabulary-dictation-settings">
                <fieldset>
                  <legend>每词播放</legend>
                  {([1, 2, 3] as const).map((count) => (
                    <button key={count} type="button" className={repeatCount === count ? 'is-selected' : undefined} onClick={() => setRepeatCount(count)} aria-pressed={repeatCount === count}>{count}遍</button>
                  ))}
                </fieldset>
                <fieldset>
                  <legend>词间书写时间</legend>
                  {[3, 5, 8].map((seconds) => (
                    <button
                      key={seconds}
                      type="button"
                      className={gapSeconds === seconds ? 'is-selected' : undefined}
                      onClick={() => {
                        setGapSeconds(seconds)
                        setGapInputValue(String(seconds))
                      }}
                      aria-pressed={gapSeconds === seconds}
                    >
                      {seconds}秒
                    </button>
                  ))}
                  <label className={![3, 5, 8].includes(gapSeconds) ? 'is-selected' : undefined}>
                    <span>自定义</span>
                    <input
                      type="number"
                      min="3"
                      max="15"
                      step="1"
                      value={gapInputValue}
                      onChange={(event) => {
                        const nextInput = event.target.value
                        setGapInputValue(nextInput)
                        if (!nextInput.trim()) return
                        const nextGap = Number(nextInput)
                        if (Number.isFinite(nextGap) && nextGap >= 3 && nextGap <= 15) {
                          setGapSeconds(Math.round(nextGap))
                        }
                      }}
                      onBlur={() => {
                        const nextGap = gapInputValue.trim()
                          ? clampGap(Number(gapInputValue))
                          : gapSeconds
                        setGapSeconds(nextGap)
                        setGapInputValue(String(nextGap))
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') event.currentTarget.blur()
                      }}
                      aria-label="自定义词间书写时间，3到15秒"
                    />
                  </label>
                </fieldset>
                <label className="vocabulary-dictation-volume">
                  <Volume2 size={17} aria-hidden="true" />
                  <span className="visually-hidden">音量</span>
                  <input type="range" min="0" max="1" step="0.05" value={volume} onChange={(event) => setVolume(Number(event.target.value))} aria-label="播放音量" />
                </label>
              </div>
            </section>

            {status === 'ended' && (
              <section className="vocabulary-dictation-complete" aria-labelledby="dictation-complete-title">
                <Check size={28} strokeWidth={1.7} aria-hidden="true" />
                <div>
                  <h2 id="dictation-complete-title">本组听写完成</h2>
                  <p>可以从头再听一遍，或者核对本组答案。</p>
                </div>
                <div>
                  <button type="button" onClick={replayFromStart}><RotateCcw size={16} />再听一遍</button>
                  <button type="button" className="primary" onClick={() => setAnswerConfirmOpen(true)}><Eye size={16} />查看答案</button>
                </div>
              </section>
            )}

            {answerConfirmOpen && !showAnswers && (
              <section className="vocabulary-dictation-answer-confirm" aria-labelledby="dictation-answer-confirm-title">
                <div>
                  <h2 id="dictation-answer-confirm-title">现在查看答案？</h2>
                  <p>确认后将显示本组全部英文、词性和核心义。</p>
                </div>
                <div>
                  <button type="button" onClick={() => setAnswerConfirmOpen(false)}>暂不查看</button>
                  <button type="button" className="primary" onClick={() => { setShowAnswers(true); setAnswerConfirmOpen(false) }}>确认查看</button>
                </div>
              </section>
            )}

            {showAnswers && (
              <section className="vocabulary-dictation-answers" aria-labelledby="dictation-answers-title">
                <div><h2 id="dictation-answers-title">本组答案</h2><span>{entries.length} 题</span></div>
                <ol>
                  {entries.map((entry, index) => (
                    <li key={entry.id}>
                      <span>{index + 1}</span>
                      <strong>{entry.answer}</strong>
                      <i>{entry.partOfSpeech}</i>
                      <p>{entry.sourceMeanings.join('；')}</p>
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  )
}
