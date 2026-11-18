import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { ListeningSentence } from '../../domain/listeningAnalysis'
import { Check } from '../../icons'
import { Button } from '../../shared-ui/Button'
import { paperSurfaceTokens } from '../../../../shared/papersurface/tokens.mjs'
import { ListeningTransport, listeningPlayerSeekEvent, listeningPlayerSwitchEvent, playListeningAudio } from './ListeningSegmentPlayer'

function sentenceStart(sentence: ListeningSentence, repeating: boolean) {
  return repeating ? sentence.repeatStart ?? sentence.start : sentence.start
}

function sentenceEnd(sentence: ListeningSentence, repeating: boolean) {
  return sentenceStart(sentence, repeating) + sentence.end - sentence.start
}

export function scrollListeningTarget(target: Element, block: ScrollLogicalPosition) {
  const panel = target.closest<HTMLElement>('.paper-browse-lecture-panel')
  if (!panel || !['auto', 'scroll'].includes(getComputedStyle(panel).overflowY)) {
    target.scrollIntoView({ block, behavior: 'instant' })
    return
  }
  const row = target.getBoundingClientRect()
  const top = panel.getBoundingClientRect().top + panel.clientTop
  const bottom = top + panel.clientHeight
  if (block === 'nearest' && row.top >= top && row.bottom <= bottom) return
  const offset = block === 'center' ? (panel.clientHeight - row.height) / 2
    : block === 'start' ? Number.parseFloat(getComputedStyle(target).scrollMarginBlockStart)
    : row.top < top ? 0 : panel.clientHeight - row.height
  panel.scrollBy({ top: row.top - top - offset, behavior: 'instant' })
}

// Signature motion (DESIGN.md §6): the scroll may exceed 300 ms so readers
// can track the same line of text.
const phraseDuration = 700
const jumpDuration = 500
const FOLLOW_BEAT_MS = 150
const FOLLOW_SOFT_START_MS = 140
const calmBeatDuration = 200
const calmV1HighlightDuration = 150
const calmReadingInset = 0.08
const calmSpring = { response: 0.62, dampingRatio: 0.88 }

const calmDefaults = { beat: 150, min: 600, max: 900, perLine: 110, tail: 0.5 }
type CalmTuning = typeof calmDefaults
const tuningStorage = 'eqb-listening-calm-v2'
const tuningRanges = [
  ['beat', '停顿', 100, 250, 1],
  ['min', '最短', 500, 750, 1],
  ['max', '最长', 750, 1000, 1],
  ['perLine', '每行', 50, 150, 1],
  ['tail', '收尾', 0, 1, 0.01],
] as const
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

// Preview-only tuning panel. Remove the panel and its persisted overrides before release.
function loadCalmTuning() {
  const tuning = { ...calmDefaults }
  try {
    const saved = JSON.parse(localStorage.getItem(tuningStorage) ?? '{}')
    for (const [key, , min, max] of tuningRanges) {
      const value = saved?.[key]
      if (typeof value === 'number' && Number.isFinite(value)) tuning[key] = clamp(value, min, max)
    }
  } catch { /* Use defaults if storage is unavailable. */ }
  return tuning
}

function CalmTuningPanel({ values, onChange }: { values: CalmTuning; onChange: (value: CalmTuning) => void }) {
  const summary = tuningRanges.map(([key]) => `${key} ${values[key]}`).join(' · ')
  return <aside className="listening-follow-tuning" aria-label="跟读动效调参">
    <div className="listening-follow-tuning-sliders">
      {tuningRanges.map(([key, label, min, max, step]) => <label key={key}>
        <span>{label} {values[key]}</span>
        <input type="range" aria-label={label} min={min} max={max} step={step} value={values[key]}
          onChange={(event) => onChange({ ...values, [key]: event.currentTarget.valueAsNumber })} />
      </label>)}
      <Button size="sm" onClick={() => onChange(calmDefaults)}>恢复默认</Button>
    </div>
    <input className="listening-follow-tuning-summary" aria-label="可复制的动效参数"
      readOnly value={summary} onFocus={(event) => event.currentTarget.select()} />
  </aside>
}

function curveParameter(progress: number, x1: number, x2: number) {
  // Solve x for the requested cubic Bézier, then sample y at the same t.
  let low = 0
  let high = 1
  for (let i = 0; i < 16; i++) {
    const t = (low + high) / 2
    const inverse = 1 - t
    const x = 3 * inverse * inverse * t * x1 + 3 * inverse * t * t * x2 + t ** 3
    if (x < progress) low = t
    else high = t
  }
  const t = (low + high) / 2
  return t
}

function followEase(progress: number, calmV1: boolean) {
  const t = curveParameter(progress, calmV1 ? 0.4 : 0.22, calmV1 ? 0.2 : 0.36)
  return calmV1 ? t * t * (3 - 2 * t) : 1 - (1 - t) ** 3
}

type CalmCurve = { x1: number; x2: number; control: number; distance: number }

function sampleCalmCurve(curve: CalmCurve, progress: number, duration: number) {
  const { x1, x2, control, distance } = curve
  if (progress === 0) return { offset: 0, velocity: control / (x1 * duration) }
  if (progress === 1) return { offset: distance, velocity: 0 }
  const t = curveParameter(progress, x1, x2)
  const rest = 1 - t
  const offset = 3 * rest * rest * t * control + t * t * (3 - 2 * t) * distance
  const dx = rest * rest * x1 + 2 * rest * t * (x2 - x1) + t * t * (1 - x2)
  const dy = rest * rest * control + 2 * rest * t * (distance - control)
  return { offset, velocity: dy / (dx * duration) }
}

function sentenceFocusTop(row: HTMLElement, height: number, calm: boolean) {
  const bounds = row.getBoundingClientRect()
  const english = calm ? row.querySelector('.listening-follow-sentence')?.getBoundingClientRect() : null
  if (!english) return bounds.height / 2 - height * 0.4
  return Math.max(
    english.top - bounds.top + english.height / 2 - height * 0.45,
    bounds.height - height * (1 - calmReadingInset),
  )
}

const noSentences: ListeningSentence[] = []

export function ListeningSentenceFollow({ sentences = noSentences, audio, onActivate, onQuestion, reviewedSentence, children }: {
  sentences?: ListeningSentence[]
  audio?: HTMLAudioElement | null
  onActivate: (audio: HTMLAudioElement) => void
  onQuestion: (question: number) => void
  reviewedSentence: { index: number } | null
  children?: ReactNode
}) {
  const [current, setCurrent] = useState(-1)
  const [loop, setLoop] = useState(false)
  const [error, setError] = useState(false)
  const [following, setFollowing] = useState(true)
  const [focused, setFocused] = useState(false)
  const follows = useRef(true)
  const loopTarget = useRef(-1)
  const loopRepeating = useRef(false)
  const list = useRef<HTMLDivElement>(null)
  const jumpToCurrent = useRef<() => void>(() => {})
  const repeatStart = sentences[0]?.repeatStart ?? Infinity
  const params = new URLSearchParams(window.location.search)
  const followParam = params.get('follow')
  const mode = followParam === 'step' || followParam === 'flow' || followParam === 'calm-v1' || followParam === 'calm' || followParam === 'calm2'
    ? followParam : 'calm-v2'
  const flow = mode === 'flow'
  const calmV1 = mode === 'calm-v1'
  const calmV2 = mode === 'calm-v2'
  const calm2 = mode === 'calm2'
  const calm = mode === 'calm' || calmV1 || calmV2 || calm2
  const tune = calmV2 && params.get('tune') === '1'
  const [tuning, setTuning] = useState(() => tune ? loadCalmTuning() : calmDefaults)
  const liveTuning = useRef(tuning)
  const updateTuning = (value: CalmTuning) => {
    liveTuning.current = value
    setTuning(value)
    try { localStorage.setItem(tuningStorage, JSON.stringify(value)) } catch { /* Keep live values. */ }
  }

  const setFollow = useCallback((enabled: boolean) => {
    follows.current = enabled
    setFollowing(enabled)
  }, [])

  const positionList = useCallback((top: number) => {
    const scroller = list.current
    if (!scroller) return
    scroller.scrollTop = top
  }, [])

  useLayoutEffect(() => {
    const scroller = list.current
    const first = scroller?.firstElementChild as HTMLElement | null
    const last = scroller?.lastElementChild as HTMLElement | null
    if (!scroller || !first || !last) return
    const measure = () => {
      const height = scroller.clientHeight
      scroller.style.paddingTop = `${Math.max(0, -sentenceFocusTop(first, height, calm))}px`
      scroller.style.paddingBottom = `${Math.max(0, height + sentenceFocusTop(last, height, calm) - last.offsetHeight)}px`
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(scroller, { box: 'border-box' })
    observer.observe(first)
    if (last !== first) observer.observe(last)
    return () => observer.disconnect()
  }, [sentences, calm])

  useEffect(() => {
    const scroller = list.current
    if (!audio || !scroller || !sentences.length) return
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
    let frame = 0
    let lastIndex = -1
    let lastSentenceChange = -Infinity
    let lastRepeating = false
    let focusTimeout: number | undefined
    let motion: {
      from: number; index: number; start: number; duration: number; velocity: number; automatic: boolean; curve?: CalmCurve
    } | null = null
    let curveSample: { position: number; time: number } | null = null
    let curveVelocity = 0
    let spring: {
      index: number; position: number; velocity: number; time: number; automatic: boolean; softStart: number | null
    } | null = null
    let pending: { index: number; start: number } | null = null
    const omega = 2 * Math.PI / calmSpring.response
    const stiffness = omega ** 2
    const damping = 2 * calmSpring.dampingRatio * omega
    const center = (index: number) => {
      const row = scroller.children[index] as HTMLElement | undefined
      if (!row) return scroller.scrollTop
      const top = row.offsetTop + sentenceFocusTop(row, scroller.clientHeight, calm)
      return Math.max(0, Math.min(top, scroller.scrollHeight - scroller.clientHeight))
    }
    const setSpringTarget = (index: number, now: number, automatic: boolean) => {
      if (spring) {
        if (calm2 && spring.index !== index) spring.softStart = spring.velocity === 0 ? now : null
        spring.index = index
        spring.time = Math.max(spring.time, now)
        spring.automatic = automatic
      } else {
        spring = { index, position: scroller.scrollTop, velocity: 0, time: now, automatic, softStart: calm2 ? now : null }
      }
    }
    const startCurve = (index: number, duration: number, now: number, automatic = false) => {
      motion = { from: scroller.scrollTop, index, start: now, duration, velocity: curveVelocity, automatic }
      if (calmV1) curveSample = { position: scroller.scrollTop, time: now }
    }
    const startCalmV2 = (index: number, now: number, automatic: boolean) => {
      if (motion?.curve && motion.index === index) {
        motion.automatic = automatic
        return
      }
      let from = scroller.scrollTop
      let velocity = 0
      if (motion?.curve) {
        const sample = sampleCalmCurve(motion.curve, clamp((now - motion.start) / motion.duration, 0, 1), motion.duration)
        from = motion.from + sample.offset
        velocity = sample.velocity
      }
      const distance = center(index) - from
      if (!distance && !velocity) return
      const english = scroller.children[index].querySelector('.listening-follow-sentence')!
      const lineHeight = Number.parseFloat(getComputedStyle(english).lineHeight)
      const { min, max, perLine, tail } = tune ? liveTuning.current : calmDefaults
      const duration = clamp(min + perLine * Math.max(0, Math.abs(distance) / lineHeight - 2), min, max)
      const x2 = 0.2 - tail * 0.12 * (max > min ? (duration - min) / (max - min) : 0)
      // The first control point sets the exact incoming velocity. For a close
      // forward target, shorten its time coordinate to keep all points monotonic.
      const x1 = velocity * distance > 0 ? Math.min(0.4, Math.abs(distance / (velocity * duration))) : 0.4
      motion = { from, index, start: now, duration, velocity, automatic,
        curve: { x1, x2, control: velocity * x1 * duration, distance } }
    }
    const stopCurve = () => {
      motion = null
      curveSample = null
      curveVelocity = 0
    }
    const isShortAndVisible = (index: number) => {
      const sentence = sentences[index]
      if (sentence.end - sentence.start >= 1) return false
      const row = scroller.children[index] as HTMLElement
      const top = row.offsetTop - scroller.scrollTop
      const height = scroller.clientHeight
      return top >= height * calmReadingInset && top + row.offsetHeight <= height * (1 - calmReadingInset)
    }
    const sync = (now: number, jump = false) => {
      frame = 0
      const target = sentences[loopTarget.current]
      if (target && !audio.paused && !audio.seeking && audio.currentTime >= sentenceEnd(target, loopRepeating.current)) {
        audio.currentTime = sentenceStart(target, loopRepeating.current)
      }
      const time = audio.currentTime
      const repeating = time + 0.025 >= repeatStart
      const index = target ? loopTarget.current
        : sentences.findLastIndex((sentence) => sentenceStart(sentence, repeating) <= time + 0.025)
      const changedSentence = index !== lastIndex || repeating !== lastRepeating
      const continuous = flow && !reducedMotion.matches
      if (index >= 0 && follows.current) {
        if (reducedMotion.matches) {
          if (jump || index !== lastIndex || motion || spring || pending) positionList(center(index))
          pending = null
          stopCurve()
          spring = null
        } else {
          if (calmV2) {
            if (jump || (!audio.paused && (index < lastIndex || repeating !== lastRepeating))) {
              pending = null
              startCalmV2(index, now, false)
            } else {
              if (index !== lastIndex && !audio.paused) {
                const short = isShortAndVisible(index)
                pending = short ? null : { index, start: now }
                if (short && motion?.automatic) stopCurve()
              }
              if (audio.paused || (!target && time >= sentenceEnd(sentences[index], repeating))) {
                pending = null
                if (motion?.automatic) stopCurve()
              }
              if (pending && now - pending.start >= (tune ? liveTuning.current.beat : calmDefaults.beat)) {
                startCalmV2(pending.index, now, true)
                pending = null
              }
            }
          } else if (calm && !calmV1) {
            if (jump) {
              pending = null
              setSpringTarget(index, now, false)
            } else {
              if (changedSentence && !audio.paused) {
                const short = isShortAndVisible(index)
                const beat = calm2 ? FOLLOW_BEAT_MS : now - lastSentenceChange < calmBeatDuration ? 0 : calmBeatDuration
                // Let a prior spring finish toward its own target during the beat.
                pending = short ? null : { index, start: now + beat }
                if (short && spring?.automatic) spring = null
              }
              if (audio.paused || (!target && time >= sentenceEnd(sentences[index], repeating))) {
                pending = null
                if (spring?.automatic) spring = null
              }
              if (pending && now >= pending.start) {
                setSpringTarget(pending.index, pending.start, true)
                pending = null
              }
            }
          } else if (jump || (!audio.paused && (index < lastIndex || repeating !== lastRepeating))) {
            pending = null
            startCurve(index, jumpDuration, now)
          } else if (calmV1) {
            if (index !== lastIndex && !audio.paused) {
              const short = isShortAndVisible(index)
              pending = short ? null : { index, start: now + calmV1HighlightDuration }
              if (short && motion?.automatic) stopCurve()
            }
            if (audio.paused || (!target && time >= sentenceEnd(sentences[index], repeating))) {
              pending = null
              if (motion?.automatic) stopCurve()
            }
            if (pending && now >= pending.start) {
              const row = scroller.children[pending.index].querySelector('.listening-follow-sentence')!
              const lineHeight = Number.parseFloat(getComputedStyle(row).lineHeight)
              const distance = Math.abs(center(pending.index) - scroller.scrollTop)
              startCurve(pending.index, distance > lineHeight * 3 ? 800 : 650, now, true)
              pending = null
            }
          } else if (!continuous && index !== lastIndex) {
            startCurve(index, phraseDuration, now)
          }

          if (spring) {
            const to = center(spring.index)
            const dt = Math.min(0.032, Math.max(0, (now - spring.time) / 1000))
            spring.time = now
            // Substep the semi-implicit Euler update to keep the response
            // consistent across refresh rates and avoid excess damping.
            const steps = Math.max(1, Math.ceil(dt / 0.004))
            const h = dt / steps
            for (let i = 0; i < steps; i++) {
              let scale = 1
              if (spring.softStart !== null) {
                const sampleTime = now - (dt - (i + 1) * h) * 1000
                const x = Math.min(1, Math.max(0, (sampleTime - spring.softStart) / FOLLOW_SOFT_START_MS))
                scale = x * x * (3 - 2 * x)
              }
              spring.velocity += (-stiffness * scale * (spring.position - to) - damping * Math.sqrt(scale) * spring.velocity) * h
              spring.position += spring.velocity * h
            }
            if (Math.abs(spring.position - to) < 0.5 && Math.abs(spring.velocity) < 5) {
              positionList(to)
              spring = null
            } else {
              positionList(spring.position)
            }
          } else if (motion?.curve) {
            const progress = clamp((now - motion.start) / motion.duration, 0, 1)
            const { offset } = sampleCalmCurve(motion.curve, progress, motion.duration)
            positionList(motion.from + offset)
            if (progress === 1) stopCurve()
          } else if (motion) {
            const elapsed = Math.max(0, now - motion.start)
            const progress = Math.min(1, elapsed / motion.duration)
            const to = center(motion.index)
            const distance = to - motion.from
            const eased = progress === 1 ? 1 : followEase(progress, calmV1)
            let position = motion.from + distance * eased
            if (motion.velocity) {
              // Preserve velocity when retargeting, and brake before reversing.
              const aligned = Math.sign(motion.velocity) === Math.sign(distance)
              const brake = aligned ? Math.min(84, Math.abs(distance / motion.velocity)) : 84
              const coast = Math.min(elapsed, brake)
              if (brake > 0) position += motion.velocity * coast * (1 - coast / (2 * brake)) * (1 - eased)
            }
            if (calmV1) position = Math.max(0, Math.min(position, scroller.scrollHeight - scroller.clientHeight))
            if (curveSample && now - curveSample.time >= 4) {
              curveVelocity = (position - curveSample.position) / (now - curveSample.time)
              curveSample = { position, time: now }
            }
            positionList(position)
            if (progress === 1) stopCurve()
          } else if (continuous && !audio.paused && !audio.seeking) {
            const from = center(index)
            const next = sentences[index + 1]
            let to = from
            if (next && !target) {
              const start = sentenceStart(sentences[index], repeating)
              const end = sentenceStart(next, repeating)
              const progress = end > start ? Math.min(1, Math.max(0, (time - start) / (end - start))) : 0
              to += (center(index + 1) - from) * progress
            }
            const delta = to - scroller.scrollTop
            // Snap below half a CSS pixel of movement to avoid rounding stalls.
            positionList(scroller.scrollTop + (Math.abs(delta * 0.12) < 0.5 ? delta : delta * 0.12))
          }
        }
      } else {
        pending = null
        stopCurve()
        spring = null
      }
      if (index !== lastIndex) setCurrent(index)
      if (index >= 0 && changedSentence) lastSentenceChange = now
      lastIndex = index
      lastRepeating = repeating
      if (!audio.paused || motion || spring) frame = requestAnimationFrame(sync)
    }
    const update = (jump = false) => {
      cancelAnimationFrame(frame)
      sync(performance.now(), jump)
    }
    const onPlay = () => {
      window.clearTimeout(focusTimeout)
      setFocused(true)
      update()
    }
    const onPause = () => {
      window.clearTimeout(focusTimeout)
      focusTimeout = window.setTimeout(() => setFocused(false), 300)
      if (flow && !reducedMotion.matches) motion = null
      update()
    }
    const stopLoop = () => {
      loopTarget.current = -1
      setLoop(false)
    }
    const onPlayerSeek = () => {
      const target = sentences[loopTarget.current]
      const repeating = loopRepeating.current
      if (target && (audio.currentTime < sentenceStart(target, repeating) || audio.currentTime >= sentenceEnd(target, repeating))) stopLoop()
      setFollow(true)
      update(true)
    }
    const onMediaUpdate = () => { if (!frame) update() }
    const playbackEvents = ['timeupdate', 'seeked'] as const
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('ended', onPause)
    playbackEvents.forEach(event => audio.addEventListener(event, onMediaUpdate))
    audio.addEventListener(listeningPlayerSeekEvent, onPlayerSeek)
    audio.addEventListener(listeningPlayerSwitchEvent, stopLoop)
    jumpToCurrent.current = () => update(true)
    stopLoop()
    setCurrent(-1)
    setError(false)
    setFocused(!audio.paused)
    update()
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(focusTimeout)
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('ended', onPause)
      playbackEvents.forEach(event => audio.removeEventListener(event, onMediaUpdate))
      audio.removeEventListener(listeningPlayerSeekEvent, onPlayerSeek)
      audio.removeEventListener(listeningPlayerSwitchEvent, stopLoop)
      jumpToCurrent.current = () => {}
    }
  }, [audio, sentences, repeatStart, flow, calm, calmV1, calmV2, calm2, tune, positionList, setFollow])

  useEffect(() => {
    const row = reviewedSentence && list.current?.children[reviewedSentence.index] as HTMLElement | undefined
    if (!row) return
    setFollow(false)
    const scroller = list.current
    if (scroller) {
      positionList(row.offsetTop + sentenceFocusTop(row, scroller.clientHeight, calm))
      scrollListeningTarget(scroller, 'nearest')
    }
    row.querySelector('button')?.focus({ preventScroll: true })
    const duration = Number.parseFloat(getComputedStyle(row).getPropertyValue('--motion-fast'))
    const flash = row.animate([{ backgroundColor: 'var(--eqb-color-state-selected)' }, {}], {
      duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : duration,
      delay: 480, fill: 'backwards',
    })
    return () => flash.cancel()
  }, [reviewedSentence, calm, positionList, setFollow])

  function playSentence(index: number) {
    if (!audio) return
    onActivate(audio)
    setFollow(true)
    setError(false)
    if (audio.error) audio.load()
    if (loop) loopTarget.current = index
    audio.currentTime = sentenceStart(sentences[index], loop ? loopRepeating.current : audio.currentTime + 0.025 >= repeatStart)
    jumpToCurrent.current()
    void playListeningAudio(audio).catch((reason) => {
      if (!(reason instanceof DOMException && reason.name === 'AbortError')) setError(true)
    })
  }

  function toggleLoop() {
    if (!audio) return
    loopTarget.current = loop ? -1 : Math.max(0, current)
    const target = sentences[loopTarget.current]
    if (target) {
      loopRepeating.current = audio.currentTime + 0.025 >= repeatStart
      const start = sentenceStart(target, loopRepeating.current)
      if (audio.currentTime < start || audio.currentTime >= sentenceEnd(target, loopRepeating.current)) audio.currentTime = start
      jumpToCurrent.current()
    }
    setLoop(!loop)
  }

  return <>
    <ListeningTransport audio={audio} onActivate={onActivate} sentenceControls={sentences.length ? <>
      <button className="listening-quiet-control" type="button" disabled={!audio || current <= 0} onClick={() => playSentence(current - 1)}>上一句</button>
      <button className="listening-quiet-control" type="button" disabled={!audio || current >= sentences.length - 1} onClick={() => playSentence(current + 1)}>下一句</button>
      <button className="listening-quiet-control" type="button" disabled={!audio} aria-pressed={loop} onClick={toggleLoop}>
        {loop && <Check size={16} aria-hidden />}单句循环
      </button>
    </> : undefined} />
    {sentences.length > 0 && <section className="listening-transcript" aria-label="录音稿">
      <h6>录音稿</h6>
      {error && <p className="listening-audio-error" role="status">录音未能播放，请重试</p>}
      <div className="listening-follow-lines" ref={list} tabIndex={0} role="region" aria-label="逐句录音稿"
        data-follow={mode} data-focused={focused || undefined} data-auto-follow={focused && following || undefined}
        style={calmV2 ? { '--listening-highlight-duration': `${tune ? tuning.beat : calmDefaults.beat}ms` } as CSSProperties : undefined}
        onWheel={(event) => { if (event.deltaY) setFollow(false) }}
        onTouchMove={() => setFollow(false)}
        onPointerDown={(event) => {
          const scroller = event.currentTarget
          const gutterStart = scroller.getBoundingClientRect().left + scroller.clientWidth
          if (event.target === scroller && event.clientX >= gutterStart) setFollow(false)
        }}
        onKeyDown={(event) => {
          // A focus change can scroll the list without a scroll gesture.
          // Suspend only on keys that actually request scrolling.
          if (!event.defaultPrevented && (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.key)
            || (event.key === ' ' && event.target === event.currentTarget))) setFollow(false)
        }}>
        {sentences.map((sentence, index) => {
          const evidence = sentence.evidence ?? []
          const previous = sentences[index - 1]
          const speakerChange = previous?.speaker !== sentence.speaker
          const questionLabels = [...new Set(evidence.map(({ question }) => question))]
            .filter((question) => !previous?.evidence?.some((item) => item.question === question))
          return <div key={sentence.start} className="listening-follow-line"
            data-speaker-change={previous && speakerChange ? true : undefined}
            data-distance={current < 0 ? undefined : Math.min(4, Math.abs(index - current))}
            data-playable={audio ? '' : undefined} aria-current={audio && current === index ? 'true' : undefined}>
            <span className="listening-follow-speaker" style={{ fontFamily: paperSurfaceTokens.paperFontStack }}>
              {speakerChange && sentence.speaker && `${sentence.speaker}:`}
            </span>
            <div>
              <button className="listening-follow-sentence" type="button" lang="en" disabled={!audio}
                aria-description={sentence.zh} style={{ fontFamily: paperSurfaceTokens.paperFontStack }}
                onClick={() => playSentence(index)}>
                {evidence.length > 0
                  ? <mark className="ps-evidence-anchor--active" data-paper-evidence-kind={evidence[0].kind}>{sentence.en}</mark>
                  : sentence.en}
              </button>
              {questionLabels.length > 0 && <span className="listening-follow-evidence">
                {questionLabels.map((question) => <button key={question} type="button" className="listening-quiet-control"
                  onClick={() => { setFollow(false); onQuestion(question) }}>第 {question} 题</button>)}
              </span>}
              <p className="listening-follow-translation">{sentence.zh}</p>
            </div>
          </div>
        })}
      </div>
      {tune && <CalmTuningPanel values={tuning} onChange={updateTuning} />}
    </section>}
    {!following && audio && current >= 0 && <div className="listening-follow-return">
      <button type="button" className="listening-quiet-control" onClick={() => {
        const scroller = list.current
        if (scroller) {
          scrollListeningTarget(scroller, 'nearest')
          scroller.focus({ preventScroll: true })
        }
        setFollow(true)
        jumpToCurrent.current()
      }}>回到当前句</button>
    </div>}
    {children}
  </>
}
