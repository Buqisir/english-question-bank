import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type KeyboardEvent, type PointerEvent } from 'react'
import { Headphones } from '../../icons'
import { PlaybackIcon } from '../../icons/MotionIcons'
import { iconMotionInput } from '../../icons/motionInput'
import { EqbIcon } from '../../icons/EqbIcon'

type Props = {
  src: string
  label: string
  startSeconds: number
  endSeconds: number
  onActivate: (audio: HTMLAudioElement) => void
  segmentId?: string
  onSegmentAudio?: (id: string, audio: HTMLAudioElement | null) => void
  lecture?: boolean
  /** Whole-recording player gets a longer track. */
  size?: 'segment' | 'full'
  /** Question-segment starts drawn over the whole-recording track. */
  marks?: ReadonlyArray<{ label: string; startSeconds: number; endSeconds: number }>
}

export const listeningPlayerSeekEvent = 'listening-player-seek'
export const listeningPlayerSwitchEvent = 'listening-player-switch'

const audioRanges = new WeakMap<HTMLAudioElement, Pick<Props, 'startSeconds' | 'endSeconds' | 'label' | 'marks'>>()

export function playListeningAudio(audio: HTMLAudioElement) {
  const range = audioRanges.get(audio)
  if (audio.error) audio.load()
  if (range && (audio.currentTime < range.startSeconds || audio.currentTime >= range.endSeconds - 0.05)) {
    audio.currentTime = range.startSeconds
  }
  return audio.play()
}

function isPlaybackError(reason: unknown) {
  return !(reason instanceof DOMException && ['AbortError', 'NotAllowedError'].includes(reason.name))
}

/** Slow → fast; the gauge needle points left, up, right. */
const RATES = [0.75, 1, 1.25] as const
const NEEDLE_DEGREES = { 0.75: -50, 1: 0, 1.25: 50 } as const
/** One click steps in this order, so the needle sweeps right, then returns. */
const CLICK_NEXT = { 1: 1.25, 1.25: 0.75, 0.75: 1 } as const
const WAVE_WIDTH = { segment: 216, full: 384 } as const
const MARK_CHAR_PX = 8
const MARK_LABEL_MAX_SHIFT_PX = 12
const HEADER_CLEARANCE = 72
const PROGRESS_UPDATE_MS = 250

function clock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

export function ListeningSegmentPlayer({ src, label, startSeconds, endSeconds, onActivate, segmentId, onSegmentAudio, lecture = false, size = 'segment', marks }: Props) {
  const rootRef = useRef<HTMLSpanElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const attachAudio = useCallback((audio: HTMLAudioElement | null) => {
    audioRef.current = audio
    if (segmentId) onSegmentAudio?.(segmentId, audio)
  }, [segmentId, onSegmentAudio])
  useLayoutEffect(() => {
    const audio = audioRef.current
    if (audio) audioRanges.set(audio, { startSeconds, endSeconds, label, marks })
  }, [startSeconds, endSeconds, label, marks])
  const cardRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [placement, setPlacement] = useState<'above' | 'below'>('above')
  const [shift, setShift] = useState(0)
  const [waveWidth, setWaveWidth] = useState<number>(WAVE_WIDTH[size])
  const [playing, setPlaying] = useState(false)
  const [position, setPosition] = useState(0)
  const [rate, setRate] = useState<number>(1)
  // Before the first play the single clock shows the length; afterwards, elapsed time.
  const [started, setStarted] = useState(false)
  const [error, setError] = useState(false)
  const duration = Math.max(0, endSeconds - startSeconds)

  const stopAtEnd = useCallback((audio: HTMLAudioElement) => {
    if (audio.currentTime < endSeconds) return false
    audio.pause()
    if (audio.currentTime !== endSeconds) audio.currentTime = endSeconds
    setPosition(duration)
    return true
  }, [endSeconds, duration])

  useEffect(() => {
    const audio = audioRef.current
    return () => { audio?.pause() }
  }, [])

  useEffect(() => {
    if (!playing) return
    let frame: number
    let lastUpdate = -Infinity
    const tick = (now: number) => {
      const audio = audioRef.current
      if (!audio) return
      if (stopAtEnd(audio)) return
      if (!lecture && open && now - lastUpdate >= PROGRESS_UPDATE_MS) {
        lastUpdate = now
        setPosition(Math.max(0, audio.currentTime - startSeconds))
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, lecture, open, startSeconds, stopAtEnd])

  useEffect(() => {
    if (!open || lecture) return
    const onPointerDown = (event: globalThis.PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      triggerRef.current?.focus()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, lecture])

  // Keep the floating card inside the paper and below the sticky header.
  // Rects are in zoomed viewport pixels; the shift is in local CSS pixels.
  useLayoutEffect(() => {
    const card = cardRef.current
    const trigger = triggerRef.current
    const root = rootRef.current
    if (!open || lecture || !card || !trigger || !root) return
    const container = root.closest('.paper-browse-zoom') ?? document.body
    const place = () => {
      // Measure the unanimated root, not the card's entrance transform.
      const zoom = root.getBoundingClientRect().width / (root.offsetWidth || 1) || 1
      const triggerRect = trigger.getBoundingClientRect()
      const bounds = container.getBoundingClientRect()
      const left = Math.max(8, bounds.left + 8)
      const right = Math.min(document.documentElement.clientWidth - 8, bounds.right - 8)
      const chrome = card.offsetWidth - waveWidth
      const width = Math.max(3, Math.min(WAVE_WIDTH[size], Math.floor((right - left) / zoom - chrome)))
      setWaveWidth(width)
      const cardWidth = (chrome + width) * zoom
      const desiredLeft = Math.max(left, Math.min(triggerRect.left - 10 * zoom, right - cardWidth))
      setShift((desiredLeft - triggerRect.left) / zoom + 10)
      setPlacement(triggerRect.top - card.offsetHeight * zoom - 8 < HEADER_CLEARANCE ? 'below' : 'above')
    }
    place()
    const observer = new ResizeObserver(place)
    observer.observe(container)
    observer.observe(card)
    // Text wrapping moves the absolutely positioned trail after resize without
    // resizing the player. Reposition when that host commits its new anchor.
    const trail = root.closest('.ps-text-trail')
    const anchorObserver = new MutationObserver(place)
    if (trail) anchorObserver.observe(trail, { attributes: true, attributeFilter: ['style'] })
    window.addEventListener('resize', place)
    return () => {
      observer.disconnect()
      anchorObserver.disconnect()
      window.removeEventListener('resize', place)
    }
  }, [open, lecture, size, waveWidth])

  async function play() {
    const audio = audioRef.current
    if (!audio) return
    setError(false)
    onActivate(audio)
    try { await playListeningAudio(audio) } catch (reason) {
      if (isPlaybackError(reason)) setError(true)
    }
  }

  function togglePlayback() {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) void play()
    else audio.pause()
  }

  function changeRate(speed: number) {
    if (audioRef.current) audioRef.current.defaultPlaybackRate = audioRef.current.playbackRate = speed
  }

  function onTrigger() {
    if (lecture) { togglePlayback(); return }
    if (open) { setOpen(false); return }
    setShift(0)
    setOpen(true)
    if (audioRef.current?.paused) void play()
    else if (audioRef.current) onActivate(audioRef.current)
  }

  return <span ref={rootRef} className="listening-player" data-size={size}
    {...iconMotionInput}
    data-playing={playing || undefined} data-open={!lecture && open || undefined}
    onClick={(event) => event.stopPropagation()}>
    <audio ref={attachAudio} src={src} preload="none"
      onPlay={() => { setPlaying(true); setStarted(true); onActivate(audioRef.current!) }}
      onPause={() => setPlaying(false)}
      onEnded={() => setPlaying(false)}
      onError={() => { setError(true); setPlaying(false) }}
      onRateChange={() => { if (!lecture) setRate(audioRef.current!.playbackRate) }}
      onLoadedMetadata={() => {
        const audio = audioRef.current!
        if (audio.currentTime < startSeconds) audio.currentTime = startSeconds
        audio.playbackRate = audio.defaultPlaybackRate
      }}
      onTimeUpdate={() => {
        const audio = audioRef.current!
        // Media events still enforce the boundary when background tabs suspend rAF.
        if (stopAtEnd(audio)) return
        if (!playing) setPosition(Math.min(duration, Math.max(0, audio.currentTime - startSeconds)))
      }}
      onSeeked={() => {
        if (!lecture) setPosition(Math.min(duration, Math.max(0, audioRef.current!.currentTime - startSeconds)))
      }}
    />
    <button ref={triggerRef} type="button" className="listening-player-trigger"
      aria-expanded={lecture ? undefined : open} aria-label={`${label}录音${playing ? '（播放中）' : ''}`} title={`${label}录音`}
      onClick={onTrigger}>
      <Headphones size={16} variant={playing ? 'fill' : 'line'} aria-hidden="true" />
    </button>
    {lecture && error && <span className="listening-player-audio-error" role="alert">录音未能播放，请重试</span>}
    {!lecture && open && <div ref={cardRef} className="listening-player-card" role="group" aria-label={`${label}录音`}
      data-placement={placement} style={{ '--listening-card-shift': `${shift}px` } as CSSProperties}>
      <button type="button" className="listening-player-play" aria-label={playing ? '暂停' : '播放'}
        onClick={togglePlayback}>
        <PlaybackIcon playing={playing} size={14} variant="fill" />
      </button>
      <ListeningProgress key={label} {...{ label, startSeconds, endSeconds, marks, position, started }} width={waveWidth}
        readPosition={() => (audioRef.current?.currentTime ?? startSeconds) - startSeconds}
        onSeek={(seconds) => seekAudio(audioRef.current, startSeconds, endSeconds, seconds)}
        jumpTo={(seconds) => {
          seekAudio(audioRef.current, startSeconds, endSeconds, seconds)
          if (audioRef.current?.paused) void play()
        }} />
      <button type="button" className="listening-player-speed" data-label={`${rate}×`}
        data-changed={rate === 1 ? undefined : ''}
        aria-label={`播放速度 ${rate} 倍，点击切换`}
        onClick={() => changeRate(CLICK_NEXT[rate as (typeof RATES)[number]])}
        onKeyDown={(event) => {
          const index = RATES.indexOf(rate as (typeof RATES)[number])
          const step = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[event.key]
          if (step === undefined) return
          event.preventDefault()
          const next = RATES[index + step]
          if (next !== undefined) changeRate(next)
        }}>
        <EqbIcon size={20} aria-hidden="true">
          <path d="M4.5 17a8.1 8.1 0 1 1 15 0" />
          <g className="listening-player-needle"
            style={{ transform: `rotate(${NEEDLE_DEGREES[rate as (typeof RATES)[number]]}deg)` }}>
            <path d="M12 14V8.75" />
          </g>
          <circle cx="12" cy="14" r="1.6" fill="currentColor" stroke="none" />
        </EqbIcon>
      </button>
      {error && <span className="listening-player-error" role="alert">录音未能播放，点 ▶ 重试</span>}
    </div>}
  </span>
}

function seekAudio(audio: HTMLAudioElement | null, start: number, end: number, seconds: number) {
  if (!audio) return
  audio.currentTime = Math.min(end, Math.max(start, start + seconds))
  audio.dispatchEvent(new Event(listeningPlayerSeekEvent))
}

function ListeningProgress({ label, startSeconds, endSeconds, marks, position, started = true, width, showDuration, readPosition, onSeek, jumpTo }: {
  label: string
  startSeconds: number
  endSeconds: number
  marks?: Props['marks']
  position: number
  started?: boolean
  width?: number
  showDuration?: boolean
  readPosition: () => number
  onSeek: (seconds: number) => void
  jumpTo: (seconds: number) => void
}) {
  const trackRef = useRef<HTMLSpanElement>(null)
  const [trackWidth, setTrackWidth] = useState(0)
  const [dragPosition, setDragPosition] = useState<number | null>(null)
  const duration = Math.max(0, endSeconds - startSeconds)
  const shownPosition = dragPosition ?? position
  const progress = duration > 0 ? Math.min(1, shownPosition / duration) : 0
  const waveWidth = width ?? trackWidth

  useLayoutEffect(() => {
    if (width !== undefined || !trackRef.current) return
    const track = trackRef.current
    const resize = () => setTrackWidth(track.clientWidth)
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(track)
    return () => observer.disconnect()
  }, [width])

  function pointerSeconds(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    return Math.min(duration, Math.max(0, ((event.clientX - rect.left) / rect.width) * duration))
  }

  function onWaveKey(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 15 : 5
    const moves: Record<string, number> = { ArrowLeft: -step, ArrowDown: -step, ArrowRight: step, ArrowUp: step }
    if (event.key in moves) onSeek(readPosition() + moves[event.key])
    else if (event.key === 'Home') onSeek(0)
    else if (event.key === 'End') onSeek(duration)
    else return
    event.preventDefault()
  }

  // Each question segment owns its span of the track; its label is centred
  // over that span, nudged right past the previous label when short adjacent
  // segments crowd together, and dropped only if that nudge would drift too far.
  const toX = (seconds: number) => duration > 0
    ? Math.min(waveWidth, Math.max(0, ((seconds - startSeconds) / duration) * waveWidth)) : 0
  const nowSeconds = startSeconds + shownPosition
  const markItems = (marks ?? []).reduce<{
    items: Array<{ label: string; startSeconds: number; x: number; width: number; showLabel: boolean; labelShift: number; current: boolean }>
    labelEnd: number
  }>((layout, mark) => {
    const x = toX(mark.startSeconds)
    const width = Math.max(4, toX(mark.endSeconds) - x)
    const halfLabel = (mark.label.length * MARK_CHAR_PX) / 2
    const centredLeft = x + width / 2 - halfLabel
    const labelLeft = Math.max(centredLeft, layout.labelEnd + 2)
    const labelShift = labelLeft - centredLeft
    const showLabel = labelShift <= MARK_LABEL_MAX_SHIFT_PX
    const current = (started || dragPosition !== null)
      && nowSeconds >= mark.startSeconds && nowSeconds < mark.endSeconds
    return {
      items: [...layout.items, { ...mark, x, width, showLabel, labelShift, current }],
      labelEnd: showLabel ? labelLeft + halfLabel * 2 : layout.labelEnd,
    }
  }, { items: [], labelEnd: -Infinity }).items
  // Real time spans only: silence/instructions remain empty, never equal divisions.
  // Without segment timestamps the honest fallback is one continuous progress line.
  const lineSpans = (marks?.length ? marks : [{ startSeconds, endSeconds }])
    .map((mark) => ({ x: toX(mark.startSeconds), width: toX(mark.endSeconds) - toX(mark.startSeconds) }))
    .filter((span) => span.width > 0)

  return <>
      <span className="listening-player-track" style={width === undefined ? undefined : { width }} ref={trackRef}>
      {markItems.length > 0 && <span className="listening-player-marks">
        {markItems.map((mark) => <button key={mark.startSeconds} type="button"
          className="listening-player-mark" style={{ left: mark.x, width: mark.width }}
          aria-label={`跳到第 ${mark.label} 题`} aria-current={mark.current ? 'true' : undefined}
          data-label={`第 ${mark.label} 题`} data-current={mark.current || undefined}
          onClick={() => jumpTo(mark.startSeconds - startSeconds)}>
          {mark.showLabel && <span className="listening-player-mark-label" aria-hidden="true"
            style={mark.labelShift > 0 ? { left: mark.labelShift } : undefined}>{mark.label}</span>}
        </button>)}
      </span>}
      <div className="listening-player-progress" role="slider" tabIndex={0}
        aria-label={`${label}播放进度`} aria-valuemin={0} aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(shownPosition)} aria-valuetext={`${clock(shownPosition)} / ${clock(duration)}`}
        data-dragging={dragPosition === null ? undefined : ''}
        onKeyDown={onWaveKey}
        onPointerDown={(event) => {
          setDragPosition(pointerSeconds(event))
          try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* pointer already gone */ }
        }}
        onPointerMove={(event) => {
          if (dragPosition !== null) setDragPosition(pointerSeconds(event))
        }}
        onPointerUp={(event) => {
          if (dragPosition === null) return
          onSeek(pointerSeconds(event))
          setDragPosition(null)
        }}
        onPointerCancel={() => setDragPosition(null)}>
        <>
          <span className="listening-player-line-spans" aria-hidden="true">
            {lineSpans.map((span, index) => <span key={index} className="listening-player-line"
              style={{ left: span.x, width: span.width }} />)}
          </span>
          <span className="listening-player-line-spans listening-player-line-spans--played" aria-hidden="true"
            style={{ clipPath: `inset(0 ${(1 - progress) * 100}% 0 0)` }}>
            {lineSpans.map((span, index) => <span key={index} className="listening-player-line"
              style={{ left: span.x, width: span.width }} />)}
          </span>
          <span className="listening-player-line-head" aria-hidden="true"
            style={{ left: progress * waveWidth }}>
            <span className="listening-player-line-thumb" />
          </span>
        </>
      </div>
      </span>
      <span className="listening-player-time" aria-live="off">
        {showDuration ? `${clock(shownPosition)} / ${clock(duration)}` : started || dragPosition !== null ? clock(shownPosition) : clock(duration)}
      </span>
  </>
}

export function ListeningTransport({ audio, onActivate, sentenceControls }: {
  audio: HTMLAudioElement | null | undefined
  onActivate: Props['onActivate']
  sentenceControls?: ReactNode
}) {
  const range = audio && audioRanges.get(audio)
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [rate, setRate] = useState<number>(1)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!audio) return
    let lastUpdate = -Infinity
    const syncProgress = () => {
      lastUpdate = performance.now()
      setTime(audio.currentTime)
    }
    const onTimeUpdate = () => {
      if (performance.now() - lastUpdate >= PROGRESS_UPDATE_MS) syncProgress()
    }
    const sync = () => {
      syncProgress()
      setPlaying(!audio.paused)
      setRate(audio.playbackRate)
      setError(Boolean(audio.error))
    }
    const events = ['play', 'pause', 'ended', 'seeked', 'ratechange', 'error', 'loadstart'] as const
    events.forEach(event => audio.addEventListener(event, sync))
    audio.addEventListener('timeupdate', onTimeUpdate)
    sync()
    return () => {
      events.forEach(event => audio.removeEventListener(event, sync))
      audio.removeEventListener('timeupdate', onTimeUpdate)
    }
  }, [audio])

  async function play() {
    if (!audio) return
    onActivate(audio)
    setError(false)
    try { await playListeningAudio(audio) } catch (reason) {
      if (isPlaybackError(reason)) setError(true)
    }
  }

  return <div className="listening-transport" role="group" aria-label="录音播放控制">
    <div className="listening-transport-main">
      <button type="button" className="listening-quiet-control" disabled={!range} onClick={() => {
        if (audio && !audio.paused) audio.pause()
        else void play()
      }}>
        <PlaybackIcon playing={Boolean(range && playing)} size={16} variant="fill" />
        {range && playing ? '暂停' : '播放'}
      </button>
      {range && <ListeningProgress key={range.label} {...range} showDuration
        position={Math.min(range.endSeconds - range.startSeconds, Math.max(0, time - range.startSeconds))}
        readPosition={() => (audio?.currentTime ?? range.startSeconds) - range.startSeconds}
        onSeek={(seconds) => seekAudio(audio ?? null, range.startSeconds, range.endSeconds, seconds)}
        jumpTo={(seconds) => {
          seekAudio(audio ?? null, range.startSeconds, range.endSeconds, seconds)
          if (audio?.paused) void play()
        }} />}
    </div>
    {sentenceControls && <div className="listening-transport-secondary">
      {sentenceControls}
      <button type="button" className="listening-quiet-control listening-transport-speed" disabled={!audio}
        aria-label={`播放速度 ${rate} 倍，点击切换`}
        onClick={() => {
          if (audio) audio.defaultPlaybackRate = audio.playbackRate = CLICK_NEXT[rate as (typeof RATES)[number]] ?? 1
        }}>
        {rate}×
      </button>
    </div>}
    {audio && error && <p className="listening-audio-error" role="status">录音未能播放，请重试</p>}
  </div>
}
