import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import { Headphones, Pause, Play } from '../../icons'
import { EqbIcon } from '../../icons/EqbIcon'
import { loadWaveformEnvelope, waveformBars, type WaveformEnvelope } from './listeningWaveform'

type Props = {
  src: string
  label: string
  startSeconds: number
  endSeconds: number
  onActivate: (audio: HTMLAudioElement) => void
  /** Whole-recording player gets a longer waveform. */
  size?: 'segment' | 'full'
  /** Question-segment starts drawn over the whole-recording waveform. */
  marks?: ReadonlyArray<{ label: string; startSeconds: number; endSeconds: number }>
}

/** Slow → fast; the gauge needle points left, up, right. */
const RATES = [0.75, 1, 1.25] as const
const NEEDLE_DEGREES = { 0.75: -50, 1: 0, 1.25: 50 } as const
/** One click steps in this order, so the needle sweeps right, then returns. */
const CLICK_NEXT = { 1: 1.25, 1.25: 0.75, 0.75: 1 } as const
const BAR_PITCH = 3
const BAR_WIDTH = 1.5
const WAVE_WIDTH = { segment: 216, full: 384 } as const
const WAVE_HEIGHT = 28
const MARK_CHAR_PX = 5.5
const HEADER_CLEARANCE = 72

function clock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

export function ListeningSegmentPlayer({ src, label, startSeconds, endSeconds, onActivate, size = 'segment', marks }: Props) {
  const rootRef = useRef<HTMLSpanElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const waveRef = useRef<HTMLDivElement>(null)
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
  const [envelope, setEnvelope] = useState<WaveformEnvelope | null>(null)
  // While dragging only the caret moves; the audio seeks once on release.
  const [dragPosition, setDragPosition] = useState<number | null>(null)
  const duration = Math.max(0, endSeconds - startSeconds)
  const barCount = Math.floor(waveWidth / BAR_PITCH)
  const bars = envelope ? waveformBars(envelope, startSeconds, endSeconds, barCount) : null
  const shownPosition = dragPosition ?? position
  const progress = duration > 0 ? Math.min(1, shownPosition / duration) : 0

  useEffect(() => {
    const audio = audioRef.current
    return () => { audio?.pause() }
  }, [])

  useEffect(() => {
    if (!open || envelope) return
    let cancelled = false
    loadWaveformEnvelope(src).then((next) => { if (!cancelled) setEnvelope(next) }, () => {})
    return () => { cancelled = true }
  }, [open, envelope, src])

  useEffect(() => {
    if (!playing) return
    let frame: number
    const tick = () => {
      const audio = audioRef.current
      if (!audio) return
      if (audio.currentTime >= endSeconds) {
        audio.pause()
        audio.currentTime = endSeconds
        setPosition(duration)
        return
      }
      setPosition(Math.max(0, audio.currentTime - startSeconds))
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, startSeconds, endSeconds, duration])

  useEffect(() => {
    if (!open) return
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
  }, [open])

  // Keep the floating card inside the paper and below the sticky header.
  // Rects are in zoomed viewport pixels; the shift is in local CSS pixels.
  useLayoutEffect(() => {
    const card = cardRef.current
    const trigger = triggerRef.current
    const root = rootRef.current
    if (!open || !card || !trigger || !root) return
    const container = root.closest('.paper-browse-zoom') ?? document.body
    const lecture = root.closest('.paper-browse-shell')?.querySelector('.paper-browse-lecture-panel')
    const place = () => {
      // Measure the unanimated root, not the card's entrance transform.
      const zoom = root.getBoundingClientRect().width / (root.offsetWidth || 1) || 1
      const triggerRect = trigger.getBoundingClientRect()
      const bounds = container.getBoundingClientRect()
      const left = Math.max(8, bounds.left + 8)
      const lectureLeft = lecture?.getBoundingClientRect().left
      const right = Math.min(document.documentElement.clientWidth - 8, bounds.right - 8,
        lectureLeft !== undefined && lectureLeft > left ? lectureLeft - 8 : Infinity)
      const chrome = card.offsetWidth - (waveRef.current?.offsetWidth ?? waveWidth)
      const width = Math.max(BAR_PITCH, Math.min(WAVE_WIDTH[size], Math.floor((right - left) / zoom - chrome)))
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
    if (lecture) observer.observe(lecture)
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
  }, [open, size, waveWidth])

  async function play() {
    const audio = audioRef.current
    if (!audio) return
    setError(false)
    onActivate(audio)
    if (audio.error) audio.load()
    if (audio.currentTime < startSeconds || audio.currentTime >= endSeconds - 0.05) audio.currentTime = startSeconds
    try { await audio.play() } catch (reason) {
      // Aborted by a newer seek, or blocked until a real gesture: stay paused, not an error.
      if (!(reason instanceof DOMException && (reason.name === 'AbortError' || reason.name === 'NotAllowedError'))) setError(true)
    }
  }

  function togglePlayback() {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) void play()
    else audio.pause()
  }

  function changeRate(speed: number) {
    setRate(speed)
    if (audioRef.current) audioRef.current.playbackRate = speed
  }

  function onTrigger() {
    if (open) { setOpen(false); return }
    setShift(0)
    setOpen(true)
    if (audioRef.current?.paused) void play()
  }

  function seekTo(seconds: number) {
    const next = Math.min(duration, Math.max(0, seconds))
    setPosition(next)
    const audio = audioRef.current
    if (audio) audio.currentTime = startSeconds + next
  }

  function pointerSeconds(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    return Math.min(duration, Math.max(0, ((event.clientX - rect.left) / rect.width) * duration))
  }

  function jumpTo(seconds: number) {
    seekTo(seconds)
    if (audioRef.current?.paused) void play()
  }

  function onWaveKey(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 15 : 5
    const moves: Record<string, number> = { ArrowLeft: -step, ArrowDown: -step, ArrowRight: step, ArrowUp: step }
    if (event.key in moves) seekTo(position + moves[event.key])
    else if (event.key === 'Home') seekTo(0)
    else if (event.key === 'End') seekTo(duration)
    else return
    event.preventDefault()
  }

  const barRects = (bars ?? Array.from({ length: barCount }, () => 0)).map((height, index) => {
    const barHeight = Math.max(BAR_WIDTH, height * WAVE_HEIGHT)
    return <rect key={index} x={index * BAR_PITCH} y={(WAVE_HEIGHT - barHeight) / 2}
      width={BAR_WIDTH} height={barHeight} rx={BAR_WIDTH / 2}
      style={{ '--listening-bar-index': index } as CSSProperties} />
  })
  // Each question segment owns its span of the waveform; its label is centred
  // over that span and dropped only if it would touch the previous label.
  const toX = (seconds: number) => duration > 0
    ? Math.min(waveWidth, Math.max(0, ((seconds - startSeconds) / duration) * waveWidth)) : 0
  const nowSeconds = startSeconds + shownPosition
  const markItems = (marks ?? []).reduce<{
    items: Array<{ label: string; startSeconds: number; x: number; width: number; showLabel: boolean; current: boolean }>
    labelEnd: number
  }>((layout, mark) => {
    const x = toX(mark.startSeconds)
    const width = Math.max(4, toX(mark.endSeconds) - x)
    const halfLabel = (mark.label.length * MARK_CHAR_PX) / 2
    const showLabel = x + width / 2 - halfLabel >= layout.labelEnd + 2
    const current = (started || dragPosition !== null)
      && nowSeconds >= mark.startSeconds && nowSeconds < mark.endSeconds
    return {
      items: [...layout.items, { ...mark, x, width, showLabel, current }],
      labelEnd: showLabel ? x + width / 2 + halfLabel : layout.labelEnd,
    }
  }, { items: [], labelEnd: -Infinity }).items

  return <span ref={rootRef} className="listening-player" data-size={size}
    data-playing={playing || undefined} data-open={open || undefined}
    onClick={(event) => event.stopPropagation()}>
    <audio ref={audioRef} src={src} preload="none"
      onPlay={() => { setPlaying(true); setStarted(true); onActivate(audioRef.current!) }}
      onPause={() => setPlaying(false)}
      onEnded={() => setPlaying(false)}
      onError={() => { setError(true); setPlaying(false) }}
      onLoadedMetadata={() => {
        const audio = audioRef.current!
        if (audio.currentTime < startSeconds) audio.currentTime = startSeconds
        audio.playbackRate = rate
      }}
      onTimeUpdate={() => {
        const audio = audioRef.current!
        if (!playing) setPosition(Math.min(duration, Math.max(0, audio.currentTime - startSeconds)))
      }}
    />
    <button ref={triggerRef} type="button" className="listening-player-trigger"
      aria-expanded={open} aria-label={`${label}录音${playing ? '（播放中）' : ''}`} title={`${label}录音`}
      onClick={onTrigger}>
      <Headphones size={16} variant={playing ? 'fill' : 'line'} aria-hidden="true" />
    </button>
    {open && <div ref={cardRef} className="listening-player-card" role="group" aria-label={`${label}录音`}
      data-placement={placement} style={{ '--listening-card-shift': `${shift}px` } as CSSProperties}>
      <button type="button" className="listening-player-play" aria-label={playing ? '暂停' : '播放'}
        onClick={togglePlayback}>
        {playing ? <Pause size={14} variant="fill" aria-hidden="true" /> : <Play size={14} variant="fill" aria-hidden="true" />}
      </button>
      <span className="listening-player-track" style={{ width: waveWidth }}>
      {markItems.length > 0 && <span className="listening-player-marks">
        {markItems.map((mark) => <button key={mark.startSeconds} type="button"
          className="listening-player-mark" style={{ left: mark.x, width: mark.width }}
          aria-label={`跳到第 ${mark.label} 题`} aria-current={mark.current ? 'true' : undefined}
          data-label={`第 ${mark.label} 题`} data-current={mark.current || undefined}
          onClick={() => jumpTo(mark.startSeconds - startSeconds)}>
          {mark.showLabel && <span className="listening-player-mark-label" aria-hidden="true">{mark.label}</span>}
        </button>)}
      </span>}
      <div ref={waveRef} className="listening-player-wave" role="slider" tabIndex={0}
        aria-label={`${label}播放进度`} aria-valuemin={0} aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(shownPosition)} aria-valuetext={`${clock(shownPosition)} / ${clock(duration)}`}
        data-loading={bars ? undefined : ''}
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
          seekTo(pointerSeconds(event))
          setDragPosition(null)
        }}
        onPointerCancel={() => setDragPosition(null)}>
        <svg className="listening-player-bars" viewBox={`0 0 ${waveWidth} ${WAVE_HEIGHT}`} aria-hidden="true">
          {barRects}
        </svg>
        <svg className="listening-player-bars listening-player-bars--played" viewBox={`0 0 ${waveWidth} ${WAVE_HEIGHT}`}
          aria-hidden="true" style={{ clipPath: `inset(0 ${(1 - progress) * 100}% 0 0)` }}>{barRects}</svg>
        <span className="listening-player-head" aria-hidden="true"
          style={{ transform: `translateX(${progress * waveWidth}px)` }}>
          <svg className="listening-player-caret" viewBox="0 0 8 6"><path d="M2 1.75h4L4 4.5z" /></svg>
        </span>
      </div>
      </span>
      <span className="listening-player-time" aria-live="off">
        {started || dragPosition !== null ? clock(shownPosition) : clock(duration)}
      </span>
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
        <EqbIcon size={18} aria-hidden="true">
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
