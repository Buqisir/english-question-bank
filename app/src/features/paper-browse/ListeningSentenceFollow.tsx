import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { ListeningSentence } from '../../domain/listeningAnalysis'
import { Check } from '../../icons'
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
const FOLLOW_BEAT_MS = 150
const FOLLOW_MIN_MS = 620
const FOLLOW_MAX_MS = 880
const FOLLOW_PER_LINE_MS = 100
const FOLLOW_TAIL = 0.6
const FOLLOW_FOCUS = 0.38
const MAX_ANIMATION_FRAME_MS = 34
const readingInset = 0.08
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

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

type FollowCurve = { x1: number; x2: number; control: number; distance: number }

function sampleFollowCurve(curve: FollowCurve, progress: number, duration: number) {
  const { x1, x2, control, distance } = curve
  if (progress === 0) return { offset: 0, velocity: control / (x1 * duration) }
  if (progress === 1) return { offset: distance, velocity: 0 }
  const t = curveParameter(progress, x1, x2)
  const rest = 1 - t
  // Cubic Hermite in Bézier form, with zero velocity at the destination.
  const offset = 3 * rest * rest * t * control + t * t * (3 - 2 * t) * distance
  const dx = rest * rest * x1 + 2 * rest * t * (x2 - x1) + t * t * (1 - x2)
  const dy = rest * rest * control + 2 * rest * t * (distance - control)
  return { offset, velocity: dy / (dx * duration) }
}

function sentenceFocusTop(row: HTMLElement, height: number) {
  const bounds = row.getBoundingClientRect()
  const english = row.querySelector('.listening-follow-sentence')?.getBoundingClientRect() ?? bounds
  return english.top - bounds.top + english.height / 2 - height * FOLLOW_FOCUS
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
    positionList(0)
  }, [audio, sentences, positionList])

  useLayoutEffect(() => {
    const scroller = list.current
    const last = scroller?.lastElementChild as HTMLElement | null
    if (!scroller || !last) return
    const measure = () => {
      const height = scroller.clientHeight
      scroller.style.paddingBottom = `${Math.max(0, height + sentenceFocusTop(last, height) - last.offsetHeight)}px`
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(scroller, { box: 'border-box' })
    observer.observe(last)
    return () => observer.disconnect()
  }, [sentences])

  useEffect(() => {
    const scroller = list.current
    if (!audio || !scroller || !sentences.length) return
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
    let frame = 0
    let animTime = 0
    let lastFrameTime: number | undefined
    let lastAudioTime: number | undefined
    let lastIndex = -1
    let lastRepeating = false
    let focusTimeout: number | undefined
    let motion: { from: number; index: number; start: number; duration: number; automatic: boolean; curve: FollowCurve } | null = null
    let pending: { index: number; start: number } | null = null
    const center = (index: number) => {
      const row = scroller.children[index] as HTMLElement | undefined
      if (!row) return scroller.scrollTop
      const top = row.offsetTop + sentenceFocusTop(row, scroller.clientHeight)
      return Math.max(0, Math.min(top, scroller.scrollHeight - scroller.clientHeight))
    }
    const startMotion = (index: number, now: number, automatic: boolean) => {
      const to = center(index)
      if (motion?.index === index && to === motion.from + motion.curve.distance) {
        motion.automatic = automatic
        return
      }
      let from = scroller.scrollTop
      let velocity = 0
      if (motion) {
        const sample = sampleFollowCurve(motion.curve, clamp((now - motion.start) / motion.duration, 0, 1), motion.duration)
        from = motion.from + sample.offset
        velocity = sample.velocity
      }
      const distance = to - from
      if (!distance && !velocity) return
      const english = scroller.children[index].querySelector('.listening-follow-sentence')!
      const lineHeight = Number.parseFloat(getComputedStyle(english).lineHeight)
      const duration = clamp(FOLLOW_MIN_MS + FOLLOW_PER_LINE_MS * Math.max(0, Math.abs(distance) / lineHeight - 2),
        FOLLOW_MIN_MS, FOLLOW_MAX_MS)
      const x2 = 0.2 - FOLLOW_TAIL * 0.12 * (duration - FOLLOW_MIN_MS) / (FOLLOW_MAX_MS - FOLLOW_MIN_MS)
      // The first control point sets the exact incoming velocity. For a close
      // forward target, shorten its time coordinate to keep all points monotonic.
      const x1 = velocity * distance > 0 ? Math.min(0.4, Math.abs(distance / (velocity * duration))) : 0.4
      motion = { from, index, start: now, duration, automatic,
        curve: { x1, x2, control: velocity * x1 * duration, distance } }
    }
    const isShortAndVisible = (index: number) => {
      const sentence = sentences[index]
      if (sentence.end - sentence.start >= 1) return false
      const row = scroller.children[index] as HTMLElement
      const top = row.offsetTop - scroller.scrollTop
      const height = scroller.clientHeight
      return top >= height * readingInset && top + row.offsetHeight <= height * (1 - readingInset)
    }
    const sync = (now: number, jump = false) => {
      const target = sentences[loopTarget.current]
      if (target && !audio.paused && !audio.seeking && audio.currentTime >= sentenceEnd(target, loopRepeating.current)) {
        audio.currentTime = sentenceStart(target, loopRepeating.current)
      }
      const reportedTime = audio.currentTime
      const rollback = !jump && !audio.seeking && lastAudioTime !== undefined
        && reportedTime < lastAudioTime && lastAudioTime - reportedTime < 0.5
      // Keep the last accepted time until playback catches up or a seek resets it.
      const time = rollback ? lastAudioTime! : reportedTime
      lastAudioTime = time
      const repeating = time + 0.025 >= repeatStart
      const index = target ? loopTarget.current
        : sentences.findLastIndex((sentence) => sentenceStart(sentence, repeating) <= time + 0.025)
      if (index < 0 || !follows.current) {
        pending = null
        motion = null
      } else if (reducedMotion.matches) {
        if (jump || (!audio.paused && index !== lastIndex) || motion || pending) positionList(center(index))
        pending = null
        motion = null
      } else {
        if (jump || (!audio.paused && (index < lastIndex || repeating !== lastRepeating))) {
          pending = null
          startMotion(index, now, false)
        } else {
          if (index !== lastIndex && !audio.paused) {
            const short = isShortAndVisible(index)
            pending = short ? null : { index, start: now }
            if (short && motion?.automatic) motion = null
          }
          if (audio.paused || (!target && time >= sentenceEnd(sentences[index], repeating))) {
            pending = null
            if (motion?.automatic) motion = null
          }
          if (pending && now - pending.start >= FOLLOW_BEAT_MS) {
            startMotion(pending.index, now, true)
            pending = null
          }
        }
        if (motion) {
          const progress = clamp((now - motion.start) / motion.duration, 0, 1)
          const { offset } = sampleFollowCurve(motion.curve, progress, motion.duration)
          positionList(motion.from + offset)
          if (progress === 1) motion = null
        }
      }
      if (index !== lastIndex) setCurrent(index)
      lastIndex = index
      lastRepeating = repeating
      if (!audio.paused || motion) {
        lastFrameTime ??= performance.now()
        frame = requestAnimationFrame(onFrame)
      } else {
        lastFrameTime = undefined
      }
    }
    const onFrame = (timestamp: number) => {
      frame = 0
      const elapsed = clamp(timestamp - (lastFrameTime ?? timestamp), 0, MAX_ANIMATION_FRAME_MS)
      lastFrameTime = Math.max(timestamp, lastFrameTime ?? timestamp)
      animTime += elapsed
      sync(animTime)
    }
    const update = (jump = false) => {
      cancelAnimationFrame(frame)
      frame = 0
      sync(animTime, jump)
    }
    const onPlay = () => {
      window.clearTimeout(focusTimeout)
      setFocused(true)
      update()
    }
    const onPause = () => {
      window.clearTimeout(focusTimeout)
      focusTimeout = window.setTimeout(() => setFocused(false), 300)
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
    const onSeeking = () => {
      lastAudioTime = undefined
    }
    const playbackEvents = ['timeupdate', 'seeked'] as const
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('ended', onPause)
    audio.addEventListener('seeking', onSeeking)
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
      audio.removeEventListener('seeking', onSeeking)
      playbackEvents.forEach(event => audio.removeEventListener(event, onMediaUpdate))
      audio.removeEventListener(listeningPlayerSeekEvent, onPlayerSeek)
      audio.removeEventListener(listeningPlayerSwitchEvent, stopLoop)
      jumpToCurrent.current = () => {}
    }
  }, [audio, sentences, repeatStart, positionList, setFollow])

  useEffect(() => {
    const row = reviewedSentence && list.current?.children[reviewedSentence.index] as HTMLElement | undefined
    if (!row) return
    setFollow(false)
    const scroller = list.current
    if (scroller) {
      positionList(row.offsetTop + sentenceFocusTop(row, scroller.clientHeight))
      scrollListeningTarget(scroller, 'nearest')
    }
    row.querySelector('button')?.focus({ preventScroll: true })
    const duration = Number.parseFloat(getComputedStyle(row).getPropertyValue('--motion-fast'))
    const flash = row.animate([{ backgroundColor: 'var(--eqb-color-state-selected)' }, {}], {
      duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : duration,
      delay: 480, fill: 'backwards',
    })
    return () => flash.cancel()
  }, [reviewedSentence, positionList, setFollow])

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
        data-focused={focused || undefined} data-auto-follow={focused && following || undefined}
        style={{ '--listening-highlight-duration': `${FOLLOW_BEAT_MS}ms` } as CSSProperties}
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
