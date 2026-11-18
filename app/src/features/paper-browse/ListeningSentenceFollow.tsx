import { useEffect, useRef, useState, type ReactNode } from 'react'
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
  const [inView, setInView] = useState(true)
  const loopTarget = useRef(-1)
  const loopRepeating = useRef(false)
  const list = useRef<HTMLDivElement>(null)
  const repeatStart = sentences[0]?.repeatStart ?? Infinity

  useEffect(() => {
    if (!audio || !sentences.length) return
    let frame = 0
    const sync = () => {
      cancelAnimationFrame(frame)
      const target = sentences[loopTarget.current]
      if (target && !audio.paused && !audio.seeking && audio.currentTime >= sentenceEnd(target, loopRepeating.current)) {
        audio.currentTime = sentenceStart(target, loopRepeating.current)
      }
      const repeating = audio.currentTime + 0.025 >= repeatStart
      const index = sentences.findLastIndex((sentence) => sentenceStart(sentence, repeating) <= audio.currentTime + 0.025)
      setCurrent(target ? loopTarget.current : index)
      if (!audio.paused) frame = requestAnimationFrame(sync)
    }
    const stopLoop = () => {
      loopTarget.current = -1
      setLoop(false)
    }
    const onPlayerSeek = () => {
      const target = sentences[loopTarget.current]
      const repeating = loopRepeating.current
      if (target && (audio.currentTime < sentenceStart(target, repeating) || audio.currentTime >= sentenceEnd(target, repeating))) {
        stopLoop()
      }
      sync()
    }
    const events = ['play', 'pause', 'seeked', 'ended', 'timeupdate'] as const
    events.forEach((event) => audio.addEventListener(event, sync))
    audio.addEventListener(listeningPlayerSeekEvent, onPlayerSeek)
    audio.addEventListener(listeningPlayerSwitchEvent, stopLoop)
    stopLoop()
    setError(false)
    sync()
    return () => {
      cancelAnimationFrame(frame)
      events.forEach((event) => audio.removeEventListener(event, sync))
      audio.removeEventListener(listeningPlayerSeekEvent, onPlayerSeek)
      audio.removeEventListener(listeningPlayerSwitchEvent, stopLoop)
    }
  }, [audio, sentences, repeatStart])

  useEffect(() => {
    const panel = list.current?.closest<HTMLElement>('.paper-browse-lecture-panel')
    if (!panel) return
    const stopFollowing = () => setFollowing(false)
    const onWheel = (event: WheelEvent) => { if (event.deltaY) stopFollowing() }
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (event.defaultPrevented || (event.key === ' ' && target.closest('button, summary'))) return
      if (target.closest('[role="slider"]') && ['Home', 'End', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
      if (['PageUp', 'PageDown', 'Home', 'End', 'ArrowUp', 'ArrowDown', ' '].includes(event.key)) stopFollowing()
    }
    const onPointerDown = (event: PointerEvent) => {
      if (event.target === panel && event.clientX >= panel.getBoundingClientRect().left + panel.clientWidth) stopFollowing()
    }
    panel.addEventListener('wheel', onWheel, { passive: true })
    panel.addEventListener('touchmove', stopFollowing, { passive: true })
    panel.addEventListener('keydown', onKey)
    panel.addEventListener('pointerdown', onPointerDown)
    return () => {
      panel.removeEventListener('wheel', onWheel)
      panel.removeEventListener('touchmove', stopFollowing)
      panel.removeEventListener('keydown', onKey)
      panel.removeEventListener('pointerdown', onPointerDown)
    }
  }, [sentences])

  useEffect(() => {
    const row = list.current?.children[current]
    if (!row) return
    const observer = new IntersectionObserver(([entry]) => {
      setInView(entry.isIntersecting)
      if (following && !entry.isIntersecting) scrollListeningTarget(row, 'nearest')
    })
    observer.observe(row)
    return () => observer.disconnect()
  }, [current, following])

  useEffect(() => {
    const row = reviewedSentence && list.current?.children[reviewedSentence.index] as HTMLElement | undefined
    if (!row) return
    setFollowing(false)
    row.querySelector('button')?.focus({ preventScroll: true })
    scrollListeningTarget(row, 'center')
    const duration = Number.parseFloat(getComputedStyle(row).getPropertyValue('--motion-fast'))
    const flash = row.animate([{ backgroundColor: 'var(--eqb-color-state-selected)' }, {}], {
      duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : duration,
      delay: 480, fill: 'backwards',
    })
    return () => flash.cancel()
  }, [reviewedSentence])

  function playSentence(index: number) {
    if (!audio) return
    onActivate(audio)
    setFollowing(true)
    setError(false)
    if (audio.error) audio.load()
    if (loop) loopTarget.current = index
    audio.currentTime = sentenceStart(sentences[index], loop ? loopRepeating.current : audio.currentTime + 0.025 >= repeatStart)
    setCurrent(index)
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
      setCurrent(loopTarget.current)
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
      <div className="listening-follow-lines" ref={list}>
        {sentences.map((sentence, index) => {
          const evidence = sentence.evidence ?? []
          const previous = sentences[index - 1]
          const speakerChange = previous?.speaker !== sentence.speaker
          const questionLabels = [...new Set(evidence.map(({ question }) => question))]
            .filter((question) => !previous?.evidence?.some((item) => item.question === question))
          return <div key={sentence.start} className="listening-follow-line"
            data-speaker-change={previous && speakerChange ? true : undefined}
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
                  onClick={() => { setFollowing(false); onQuestion(question) }}>第 {question} 题</button>)}
              </span>}
              <p className="listening-follow-translation">{sentence.zh}</p>
            </div>
          </div>
        })}
      </div>
    </section>}
    {children}
    {!following && audio && current >= 0 && !inView && <div className="listening-follow-return">
      <button type="button" className="listening-quiet-control" onClick={() => {
        const row = list.current?.children[current]
        if (row) scrollListeningTarget(row, 'center')
        row?.querySelector('button')?.focus({ preventScroll: true })
        setFollowing(true)
      }}>回到当前句</button>
    </div>}
  </>
}
