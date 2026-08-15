import {
  ChevronLeft,
  ChevronRight,
  ListMusic,
  Pause,
  Play,
  RotateCcw,
  Volume2,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PublicVocabularyEntry, PublicVocabularySet } from '../../domain/vocabulary'
import { getPublicVocabularySet, VocabularyApiError } from '../../services/vocabulary'
import {
  getBritishVocabularyAudioReadiness,
  getVocabularyAudioPath,
  type VocabularyAudioAccent,
} from './vocabularyAudioVariants'
import './vocabularyListenPage.css'

type PlaybackStatus = 'idle' | 'playing' | 'paused' | 'ended' | 'error'

const REPEAT_GAP_MS = 800
const WORD_GAP_MS = 2000

function SyllableGuide({ entry, accent }: { entry: PublicVocabularyEntry; accent: VocabularyAudioAccent }) {
  const isForms = entry.pronunciationMode === 'forms'
  const parts = entry.pronunciationParts?.[accent] ?? entry.syllables
  return (
    <div className="vocabulary-listen-syllables" aria-label={isForms ? `${entry.headword} 的词形拆分` : `${entry.headword} 的音节拆分`}>
      {parts.map((syllable, index) => (
        <span key={`${typeof syllable === 'string' ? syllable : syllable.spelling}-${index}`}>
          {index > 0 && <i aria-hidden="true">{isForms ? '/' : '·'}</i>}
          <strong>{typeof syllable === 'string' ? syllable : syllable.spelling}</strong>
        </span>
      ))}
    </div>
  )
}

function LoadState({ kind, onRetry }: { kind: 'loading' | 'missing' | 'revoked' | 'error'; onRetry: () => void }) {
  const content = kind === 'loading'
    ? { title: '正在打开听音词卡', detail: '图片、词卡和音频信息正在载入。' }
    : kind === 'revoked'
      ? { title: '这份听音词卡已停止分享', detail: '请向老师索取新的听音链接。' }
      : kind === 'missing'
        ? { title: '没有找到这份听音词卡', detail: '链接可能不完整，请重新扫描纸上的二维码。' }
        : { title: '听音词卡暂时无法打开', detail: '请检查网络后再试一次。' }

  return (
    <main className="vocabulary-listen-message" aria-live="polite">
      <div>
        <ListMusic size={30} strokeWidth={1.5} aria-hidden="true" />
        <h1>{content.title}</h1>
        <p>{content.detail}</p>
        {(kind === 'error' || kind === 'loading') && kind !== 'loading' && (
          <button type="button" onClick={onRetry}><RotateCcw size={16} />重新加载</button>
        )}
      </div>
    </main>
  )
}

export function VocabularyListenPage({ shareId }: { shareId: string }) {
  const [set, setSet] = useState<PublicVocabularySet | null>(null)
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'missing' | 'revoked' | 'error'>('loading')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [repeatCount, setRepeatCount] = useState<1 | 2 | 3>(2)
  const [accent, setAccent] = useState<VocabularyAudioAccent>('american')
  const [britishAudioReady, setBritishAudioReady] = useState(false)
  const [playedRepeat, setPlayedRepeat] = useState(0)
  const [status, setStatus] = useState<PlaybackStatus>('idle')
  const [volume, setVolume] = useState(1)
  const [showStickyPlayer, setShowStickyPlayer] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const timerRef = useRef<number | null>(null)
  const timerResolveRef = useRef<((continued: boolean) => void) | null>(null)
  const activeAudioResolveRef = useRef<((played: boolean) => void) | null>(null)
  const generationRef = useRef(0)
  const shouldContinueRef = useRef(false)
  const currentIndexRef = useRef(0)
  const resumeIndexRef = useRef(0)
  const repeatCountRef = useRef(repeatCount)
  const playedRepeatRef = useRef(0)
  const resumeRepeatRef = useRef(0)
  const mainCardRef = useRef<HTMLElement | null>(null)

  const entries = set?.entries ?? []
  const currentEntry = entries[currentIndex] ?? null
  const currentPhonetic = currentEntry?.phonetics?.[accent] ?? currentEntry?.phonetic ?? ''
  const progress = entries.length ? ((currentIndex + 1) / entries.length) * 100 : 0

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
  }, [])

  const load = useCallback(() => {
    const controller = new AbortController()
    setLoadState('loading')
    getPublicVocabularySet(shareId, controller.signal)
      .then((nextSet) => {
        setSet(nextSet)
        setCurrentIndex(0)
        currentIndexRef.current = 0
        resumeIndexRef.current = 0
        resumeRepeatRef.current = 0
        setAccent(nextSet.accent ?? 'american')
        setBritishAudioReady(false)
        setStatus('idle')
        setLoadState('ready')
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        if (error instanceof VocabularyApiError && error.status === 410) setLoadState('revoked')
        else if (error instanceof VocabularyApiError && error.status === 404) setLoadState('missing')
        else setLoadState('error')
      })
    return () => controller.abort()
  }, [shareId])

  useEffect(load, [load])

  useEffect(() => {
    if (!set?.entries.length) return undefined
    const controller = new AbortController()
    getBritishVocabularyAudioReadiness(controller.signal)
      .then((readiness) => {
        if (controller.signal.aborted) return
        setBritishAudioReady(Boolean(readiness) && set.entries.every((entry) => Boolean(entry.phonetics?.british)))
      })
      .catch(() => {})
    return () => controller.abort()
  }, [set])

  useEffect(() => {
    repeatCountRef.current = repeatCount
  }, [repeatCount])

  useEffect(() => {
    currentIndexRef.current = currentIndex
  }, [currentIndex])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return undefined
    audio.volume = volume
    return () => {
      cancelPending()
      audio.removeAttribute('src')
      audio.load()
    }
  }, [cancelPending])

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume
  }, [volume])

  useEffect(() => {
    const card = mainCardRef.current
    if (!card || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(([entry]) => setShowStickyPlayer(!entry.isIntersecting), {
      threshold: 0.1,
    })
    observer.observe(card)
    return () => observer.disconnect()
  }, [loadState])

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

  const playAudioOnce = useCallback((entry: PublicVocabularyEntry, generation: number) => new Promise<boolean>((resolve) => {
    const audio = audioRef.current
    if (!audio || generationRef.current !== generation) {
      resolve(false)
      return
    }
    const onEnded = () => finish(true)
    const onError = () => {
      if (generationRef.current !== generation || activeAudioResolveRef.current !== finish) return
      shouldContinueRef.current = false
      setStatus('error')
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
    void audio.play().catch(() => {
      if (generationRef.current !== generation || activeAudioResolveRef.current !== finish) return
      shouldContinueRef.current = false
      setStatus('error')
      finish(false)
    })
  }), [accent])

  const runFrom = useCallback(async (startIndex: number, startRepeat = 0) => {
    cancelPending()
    const generation = generationRef.current
    shouldContinueRef.current = true
    setStatus('playing')
    let index = startIndex
    let repetition = startRepeat

    while (index < entries.length && generationRef.current === generation && shouldContinueRef.current) {
      currentIndexRef.current = index
      resumeIndexRef.current = index
      resumeRepeatRef.current = repetition
      playedRepeatRef.current = repetition
      setCurrentIndex(index)
      setPlayedRepeat(repetition)
      const played = await playAudioOnce(entries[index], generation)
      if (!played) return
      repetition += 1
      playedRepeatRef.current = repetition
      setPlayedRepeat(repetition)

      if (repetition < repeatCountRef.current) {
        resumeIndexRef.current = index
        resumeRepeatRef.current = repetition
        if (!await wait(REPEAT_GAP_MS, generation)) return
        continue
      }
      if (index === entries.length - 1) {
        shouldContinueRef.current = false
        setStatus('ended')
        return
      }
      resumeIndexRef.current = index + 1
      resumeRepeatRef.current = 0
      if (!await wait(WORD_GAP_MS, generation)) return
      index += 1
      repetition = 0
    }
  }, [cancelPending, entries, playAudioOnce, wait])

  const togglePlayback = useCallback(() => {
    if (!currentEntry) return
    if (status === 'playing') {
      cancelPending()
      setStatus('paused')
      return
    }
    if (status === 'ended') {
      resumeIndexRef.current = 0
      resumeRepeatRef.current = 0
      void runFrom(0, 0)
      return
    }
    const startIndex = status === 'paused' ? resumeIndexRef.current : currentIndexRef.current
    const startRepeat = status === 'paused' ? resumeRepeatRef.current : 0
    void runFrom(startIndex, startRepeat)
  }, [cancelPending, currentEntry, runFrom, status])

  const selectWord = useCallback((nextIndex: number) => {
    const wasPlaying = status === 'playing'
    cancelPending()
    currentIndexRef.current = nextIndex
    resumeIndexRef.current = nextIndex
    resumeRepeatRef.current = 0
    playedRepeatRef.current = 0
    setCurrentIndex(nextIndex)
    setPlayedRepeat(0)
    setStatus(wasPlaying || status === 'ended' || status === 'error' ? 'idle' : status)
    if (wasPlaying) void runFrom(nextIndex, 0)
  }, [cancelPending, runFrom, status])

  const retryAudio = useCallback(() => {
    if (!currentEntry) return
    setStatus('idle')
    playedRepeatRef.current = 0
    setPlayedRepeat(0)
    void runFrom(currentIndex, 0)
  }, [currentEntry, currentIndex, runFrom])

  const selectAccent = useCallback((nextAccent: VocabularyAudioAccent) => {
    if (set?.accent) return
    if (nextAccent === accent || nextAccent === 'british' && !britishAudioReady) return
    cancelPending()
    resumeIndexRef.current = currentIndexRef.current
    resumeRepeatRef.current = 0
    playedRepeatRef.current = 0
    setPlayedRepeat(0)
    setStatus('idle')
    setAccent(nextAccent)
  }, [accent, britishAudioReady, cancelPending, set?.accent])

  const statusText = useMemo(() => {
    if (status === 'ended') return '本组听完'
    if (status === 'error') return '音频加载失败'
    if (status === 'playing') return `正在播放 · 第 ${Math.min(playedRepeat + 1, repeatCount)} 遍`
    if (status === 'paused') return '已暂停'
    return '准备开始'
  }, [playedRepeat, repeatCount, status])

  const audioElement = <audio ref={audioRef} preload="metadata" hidden />

  if (loadState !== 'ready' || !set || !currentEntry) {
    return <>{audioElement}<LoadState kind={loadState === 'ready' ? 'error' : loadState} onRetry={load} /></>
  }

  return (
    <div className="vocabulary-listen-page">
      {audioElement}
      <header className="vocabulary-listen-header">
        <a href="/" aria-label="返回英语题库首页">EQBank</a>
        <span>扫码听音频</span>
      </header>

      <main className="vocabulary-listen-shell">
        <section className="vocabulary-listen-card" ref={mainCardRef} aria-live="polite">
          <div className="vocabulary-listen-position">
            <span>{set.title}</span>
            <strong>{currentIndex + 1} / {entries.length}</strong>
          </div>
          <div className="vocabulary-listen-card-body">
            <figure>
              <img src={currentEntry.visual.path} alt={currentEntry.visual.alt} />
            </figure>
            <div className="vocabulary-listen-word">
              <h1>{currentEntry.headword}</h1>
              <SyllableGuide entry={currentEntry} accent={accent} />
              <p className="vocabulary-listen-phonetic">{currentPhonetic}</p>
              <p className="vocabulary-listen-sense">
                <i>{currentEntry.partOfSpeech}</i>
                <strong>{currentEntry.teachingSense}</strong>
              </p>
            </div>
          </div>
        </section>

        <section className="vocabulary-listen-controls" aria-label="听音播放控制">
          <div
            className="vocabulary-listen-progress"
            role="progressbar"
            aria-label="听音进度"
            aria-valuemin={1}
            aria-valuemax={entries.length}
            aria-valuenow={currentIndex + 1}
            aria-valuetext={`${currentIndex + 1} / ${entries.length}`}
          >
            <span style={{ transform: `scaleX(${progress / 100})` }} />
          </div>
          <div className="vocabulary-listen-control-row">
            <button type="button" onClick={() => selectWord(Math.max(0, currentIndex - 1))} disabled={currentIndex === 0} aria-label="上一个单词">
              <ChevronLeft size={22} />
            </button>
            <button className="vocabulary-listen-primary-control" type="button" onClick={status === 'error' ? retryAudio : togglePlayback} aria-label={status === 'playing' ? '暂停播放' : status === 'ended' ? '从头播放' : status === 'error' ? '重试当前单词音频' : status === 'paused' ? '继续播放' : '开始播放'}>
              {status === 'playing' ? <Pause size={24} fill="currentColor" /> : status === 'ended' || status === 'error' ? <RotateCcw size={22} /> : <Play size={24} fill="currentColor" />}
            </button>
            <button type="button" onClick={() => selectWord(Math.min(entries.length - 1, currentIndex + 1))} disabled={currentIndex === entries.length - 1} aria-label="下一个单词">
              <ChevronRight size={22} />
            </button>
          </div>
          <p className={status === 'error' ? 'is-error' : undefined}>{statusText}</p>
          <div className="vocabulary-listen-settings">
            {set.accent ? (
              <p>发音：{set.accent === 'british' ? '英音' : '美音'}</p>
            ) : britishAudioReady && (
              <fieldset>
                <legend>发音</legend>
                <button type="button" className={accent === 'american' ? 'is-selected' : undefined} onClick={() => selectAccent('american')} aria-pressed={accent === 'american'}>美音</button>
                <button type="button" className={accent === 'british' ? 'is-selected' : undefined} onClick={() => selectAccent('british')} aria-pressed={accent === 'british'}>英音</button>
              </fieldset>
            )}
            <fieldset>
              <legend>每词播放</legend>
              {([1, 2, 3] as const).map((count) => (
                <button key={count} type="button" className={repeatCount === count ? 'is-selected' : undefined} onClick={() => setRepeatCount(count)} aria-pressed={repeatCount === count}>{count}遍</button>
              ))}
            </fieldset>
            <label>
              <Volume2 size={17} aria-hidden="true" />
              <span className="visually-hidden">音量</span>
              <input type="range" min="0" max="1" step="0.05" value={volume} onChange={(event) => setVolume(Number(event.target.value))} aria-label="播放音量" />
            </label>
          </div>
        </section>

        <section className="vocabulary-listen-list" aria-labelledby="vocabulary-list-title">
          <div>
            <h2 id="vocabulary-list-title">完整词表</h2>
            <span>点一个词即可切换</span>
          </div>
          <ol>
            {entries.map((entry, index) => (
              <li key={entry.id}>
                <button type="button" className={index === currentIndex ? 'is-current' : undefined} onClick={() => selectWord(index)} aria-current={index === currentIndex ? 'true' : undefined}>
                  <span>{index + 1}</span>
                  <strong>{entry.headword}</strong>
                  <small>{entry.teachingSense}</small>
                  {index === currentIndex && <Volume2 size={16} aria-label="当前单词" />}
                </button>
              </li>
            ))}
          </ol>
        </section>
      </main>

      <div className={`vocabulary-listen-sticky ${showStickyPlayer ? 'is-visible' : ''}`} aria-hidden={!showStickyPlayer}>
        <div><strong>{currentEntry.headword}</strong><span>{currentIndex + 1} / {entries.length}</span></div>
        <button
          type="button"
          onClick={status === 'error' ? retryAudio : togglePlayback}
          tabIndex={showStickyPlayer ? 0 : -1}
          aria-label={status === 'playing' ? '暂停播放' : status === 'ended' ? '从头播放' : status === 'error' ? '重试当前单词音频' : '继续播放'}
        >
          {status === 'playing'
            ? <Pause size={20} fill="currentColor" />
            : status === 'ended' || status === 'error'
              ? <RotateCcw size={19} />
              : <Play size={20} fill="currentColor" />}
        </button>
        <button type="button" onClick={() => selectWord(Math.min(entries.length - 1, currentIndex + 1))} disabled={currentIndex === entries.length - 1} tabIndex={showStickyPlayer ? 0 : -1} aria-label="下一个单词"><ChevronRight size={20} /></button>
      </div>
    </div>
  )
}
