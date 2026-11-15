import { PlaybackIcon } from '../../icons/MotionIcons'
import { iconMotionInput } from '../../icons/motionInput'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  ListMusic,
  RefreshCw,
  RotateCcw,
  Volume,
} from '../../icons'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PublicVocabularyDictationSet } from '../../domain/vocabulary'
import { getPublicVocabularyDictationSet, VocabularyApiError } from '../../services/vocabulary'
import { getVocabularyAudioPath, type VocabularyAudioAccent } from '../vocabulary-listen/vocabularyAudioVariants'
import { Skeleton } from '../../shared-ui/Skeleton.tsx'
import { useDelayedBusy } from '../../shared-ui/useDelayedBusy.ts'
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

/**
 * 听写页的灰块（等待第四轮，2026-11-15；原来是整页居中的图标、「正在准备听写」和一行说明）。
 * 顶栏（獭石 / 自动听写）照常；下面用真页面同一套容器 class 画题板和控制区，字、键的位置放灰块，
 * 高度跟着同一套规则走（题板最小高 410，窄屏 360），数据到了不跳。
 * 灰块走门槛：showSkeleton 由调用处的 useDelayedBusy 给；300ms 内只有读屏那一句。
 * 听写纸扫码进来时，在这一页的代码块到之前还有一层 main.tsx 的启动壳；第五轮（2026-11-15）起它画同样的灰块，
 * 那边的灰块已经出了（bootStartedAt 算出来过了 300ms），这里接着出，不重新数门槛（不会「灰块 → 空 → 灰块」）；
 * 第六轮起「至少留 500ms」也从启动壳的灰块出来那一刻算（useDelayedBusy 的 pendingSince）。
 */
function DictationOpeningSkeleton({ showSkeleton }: { showSkeleton: boolean }) {
  return (
    <div className="vocabulary-dictation-page">
      <header className="vocabulary-dictation-header">
        <a href="/" aria-label="返回獭石首页">獭石</a>
        <span>自动听写</span>
      </header>
      <main className="vocabulary-dictation-shell vocabulary-dictation-skeleton" role="status" aria-busy="true">
        <span className="visually-hidden">正在准备听写</span>
        {showSkeleton && <>
          <section className="vocabulary-dictation-stage" aria-hidden="true">
            <div className="vocabulary-dictation-title-row">
              <h1><Skeleton width={120} height={10} /></h1>
              <strong><Skeleton width={36} height={10} /></strong>
            </div>
            <div className="vocabulary-dictation-question">
              <Skeleton width={120} height={64} />
            </div>
            <p className="vocabulary-dictation-status"><Skeleton width={96} height={14} /></p>
            <p className="vocabulary-dictation-instruction"><Skeleton width={260} height={12} /></p>
            <div className="vocabulary-dictation-progress" />
          </section>
          <section className="vocabulary-dictation-controls" aria-hidden="true">
            <div className="vocabulary-dictation-transport">
              <Skeleton width={44} height={44} shape="pill" />
              <Skeleton width={64} height={64} shape="pill" />
              <Skeleton width={44} height={44} shape="pill" />
            </div>
            <span className="vocabulary-dictation-replay"><Skeleton width={72} height={20} /></span>
            <div className="vocabulary-dictation-settings">
              {[3, 4].map((count) => (
                <div key={count} className="vocabulary-dictation-skeleton-fieldset">
                  <p className="vocabulary-dictation-skeleton-legend"><Skeleton width={56} height={10} /></p>
                  <div>
                    {Array.from({ length: count }, (_, index) => <Skeleton key={index} height={36} />)}
                  </div>
                </div>
              ))}
              <div className="vocabulary-dictation-volume">
                <Skeleton width={16} height={16} />
                <Skeleton height={4} />
              </div>
            </div>
          </section>
        </>}
      </main>
    </div>
  )
}

function LoadState({ kind, onRetry }: { kind: 'missing' | 'revoked' | 'error'; onRetry: () => void }) {
  const content = kind === 'revoked'
      ? { title: '这份听写练习已停止分享', detail: '请向老师索取新的听写纸。' }
      : kind === 'missing'
        ? { title: '没有找到这份听写练习', detail: '链接可能不完整，请重新扫描纸上的二维码。' }
        : { title: '听写练习暂时无法打开', detail: '请检查网络后再试一次。' }

  return (
    <main className="vocabulary-dictation-message" aria-live="polite">
      <div>
        <ListMusic size={32} aria-hidden="true" />
        <h1>{content.title}</h1>
        <p>{content.detail}</p>
        {kind === 'error' && <button type="button" onClick={onRetry}><RefreshCw size={16} />重新加载</button>}
      </div>
    </main>
  )
}

export function VocabularyDictationPage({
  shareId,
  accent,
  bootStartedAt,
}: {
  shareId: string
  accent: VocabularyAudioAccent
  /** main.tsx 启动壳挂上的时刻（performance.now()）。扫码进来才有。 */
  bootStartedAt?: number
}) {
  const savedSettings = useMemo(readSavedSettings, [])
  const [set, setSet] = useState<PublicVocabularyDictationSet | null>(null)
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'missing' | 'revoked' | 'error'>('loading')
  // 灰块走门槛（等待第四轮）：出了至少留 500ms，这期间真题板（或出错那一页）先不换上。
  // 扫码进来时这段等待从启动壳挂上就开始了（等待第六轮）：门槛和「至少留 500ms」都从 bootStartedAt 算，
  // 启动壳的灰块已经出了就接着出，数据来得再快也从启动壳的灰块出来那一刻留满 500ms（第五轮只做了前一半）。
  const openingPhase = useDelayedBusy(loadState === 'loading', { pendingSince: bootStartedAt })
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
  const volumeRef = useRef(volume)
  const statusRef = useRef<DictationStatus>('idle')
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null)
  const cueContextRef = useRef<AudioContext | null>(null)

  const entries = set?.entries ?? []
  const currentEntry = entries[currentIndex] ?? null
  const progress = entries.length ? ((currentIndex + 1) / entries.length) * 100 : 0
  const effectiveAccent = set?.accent ?? accent
  const sessionKey = `${SESSION_STORAGE_KEY}:${shareId}:${effectiveAccent}`

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
          const nextSessionKey = `${SESSION_STORAGE_KEY}:${shareId}:${nextSet.accent ?? accent}`
          const saved = JSON.parse(window.localStorage.getItem(nextSessionKey) ?? '{}') as { index?: number; completed?: boolean }
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
  }, [accent, shareId])

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
    volumeRef.current = volume
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
    audio.src = getVocabularyAudioPath(entry, effectiveAccent)
    audio.currentTime = 0
    audio.volume = volumeRef.current
    void audio.play().catch(() => {
      if (generationRef.current !== generation || activeAudioResolveRef.current !== finish) return
      shouldContinueRef.current = false
      setStatus('error')
      releaseWakeLock()
      finish(false)
    })
  }), [effectiveAccent, entries, releaseWakeLock])

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

  if (loadState === 'loading' || openingPhase === 'waiting') {
    return <>{audioElement}<DictationOpeningSkeleton showSkeleton={openingPhase === 'waiting'} /></>
  }

  if (loadState !== 'ready' || !set || !currentEntry) {
    return <>{audioElement}<LoadState kind={loadState === 'ready' ? 'error' : loadState} onRetry={load} /></>
  }

  return (
    <div className="vocabulary-dictation-page" {...iconMotionInput}>
      {audioElement}
      <header className="vocabulary-dictation-header">
        <a href="/" aria-label="返回獭石首页">獭石</a>
        <span>自动听写</span>
      </header>

      <main className="vocabulary-dictation-shell">
        {resumePrompt ? (
          <section className="vocabulary-dictation-resume" aria-labelledby="dictation-resume-title">
            <RotateCcw size={32} aria-hidden="true" />
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
                <button type="button" onClick={() => selectQuestion(Math.max(0, currentIndex - 1))} disabled={currentIndex === 0} aria-label="上一题"><ChevronLeft size={24} /></button>
                <button
                  type="button"
                  className="primary-control"
                  onClick={status === 'error' ? () => void runFrom(currentIndex, false) : togglePlayback}
                  aria-label={['countdown', 'playing', 'waiting'].includes(status) ? '暂停听写' : status === 'error' ? '重试当前单词音频' : status === 'ended' ? '从头再听一遍' : status === 'paused' ? '继续听写' : '开始听写'}
                >
                  {status === 'error' || status === 'ended'
                    ? <RotateCcw size={24} />
                    : <PlaybackIcon size={24} variant="fill" playing={['countdown', 'playing', 'waiting'].includes(status)} />}
                </button>
                <button type="button" onClick={() => selectQuestion(Math.min(entries.length - 1, currentIndex + 1))} disabled={currentIndex === entries.length - 1} aria-label="下一题"><ChevronRight size={24} /></button>
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
                  <Volume size={16} aria-hidden="true" />
                  <span className="visually-hidden">音量</span>
                  <input type="range" min="0" max="1" step="0.05" value={volume} onChange={(event) => setVolume(Number(event.target.value))} aria-label="播放音量" />
                </label>
              </div>
            </section>

            {status === 'ended' && (
              <section className="vocabulary-dictation-complete" aria-labelledby="dictation-complete-title">
                <Check size={32} aria-hidden="true" />
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
