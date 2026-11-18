import { useEffect, useRef, useState } from 'react'
import type { ListeningSentence } from '../../domain/listeningAnalysis'
import { Check, Pause, Play } from '../../icons'
import { paperSurfaceTokens } from '../../../../shared/papersurface/tokens.mjs'
import { listeningPlayerSeekEvent } from './ListeningSegmentPlayer'

export function ListeningSentenceFollow({ sentences, audio }: {
  sentences: ListeningSentence[]
  audio?: HTMLAudioElement | null
}) {
  const [current, setCurrent] = useState(-1)
  const [playing, setPlaying] = useState(false)
  const [loop, setLoop] = useState(false)
  const [error, setError] = useState(false)
  const [following, setFollowing] = useState(true)
  const loopTarget = useRef(-1)
  const list = useRef<HTMLDivElement>(null)
  const autoScrolling = useRef(false)

  useEffect(() => {
    if (!audio) return
    let frame = 0
    const sync = () => {
      cancelAnimationFrame(frame)
      const target = sentences[loopTarget.current]
      if (target && !audio.paused && !audio.seeking && audio.currentTime >= target.end) {
        audio.currentTime = target.start
      }
      const index = sentences.findLastIndex((sentence) => sentence.start <= audio.currentTime + 0.025)
      setCurrent(target ? loopTarget.current : index)
      setPlaying(!audio.paused)
      if (!audio.paused) frame = requestAnimationFrame(sync)
    }
    const onPlayerSeek = () => {
      const target = sentences[loopTarget.current]
      if (!target || (audio.currentTime >= target.start && audio.currentTime < target.end)) return
      loopTarget.current = -1
      setLoop(false)
      sync()
    }
    const events = ['play', 'pause', 'seeked', 'ended', 'timeupdate'] as const
    events.forEach((event) => audio.addEventListener(event, sync))
    audio.addEventListener(listeningPlayerSeekEvent, onPlayerSeek)
    sync()
    return () => {
      cancelAnimationFrame(frame)
      events.forEach((event) => audio.removeEventListener(event, sync))
      audio.removeEventListener(listeningPlayerSeekEvent, onPlayerSeek)
    }
  }, [audio, sentences])

  useEffect(() => {
    if (!following) return
    const scroller = list.current
    const row = scroller?.children[current] as HTMLElement | undefined
    if (!scroller || !row) return
    if (row.offsetTop >= scroller.scrollTop
      && row.offsetTop + row.offsetHeight <= scroller.scrollTop + scroller.clientHeight) return
    const top = Math.max(0, Math.min(row.offsetTop - 12, scroller.scrollHeight - scroller.clientHeight))
    if (Math.abs(top - scroller.scrollTop) < 1) return
    autoScrolling.current = true
    scroller.scrollTo({
      top,
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    })
  }, [current, following])

  function pauseFollowing() {
    const scroller = list.current
    if (!scroller || scroller.scrollHeight <= scroller.clientHeight) return
    if (autoScrolling.current) scroller.scrollTo({ top: scroller.scrollTop, behavior: 'instant' })
    autoScrolling.current = false
    setFollowing(false)
  }

  function playSentence(index?: number) {
    if (!audio) return
    setError(false)
    if (audio.error) audio.load()
    if (index !== undefined) {
      if (loop) loopTarget.current = index
      audio.currentTime = sentences[index].start
      setCurrent(index)
    }
    void audio.play().catch((reason) => {
      if (!(reason instanceof DOMException && reason.name === 'AbortError')) setError(true)
    })
  }

  function toggleLoop() {
    if (!audio) return
    loopTarget.current = loop ? -1 : Math.max(0, current)
    const target = sentences[loopTarget.current]
    if (target) {
      if (audio.currentTime < target.start || audio.currentTime >= target.end) audio.currentTime = target.start
      setCurrent(loopTarget.current)
    }
    setLoop(!loop)
  }

  function togglePlayback() {
    if (!audio) return
    if (!audio.paused) {
      audio.pause()
      return
    }
    const index = loopTarget.current
    const target = sentences[index]
    if (target && (audio.currentTime < target.start || audio.currentTime >= target.end)) {
      playSentence(index)
      return
    }
    playSentence(current < 0 || audio.currentTime >= sentences[sentences.length - 1].end ? 0 : undefined)
  }

  return <div className="listening-analysis-text listening-follow">
    <div className="listening-follow-toolbar" role="group" aria-label="逐句播放控制">
      <h6>逐句跟读</h6>
      <button type="button" disabled={!audio} onClick={togglePlayback}>
        {playing ? <Pause size={16} aria-hidden /> : <Play size={16} aria-hidden />}
        {playing ? '暂停' : '播放'}
      </button>
      <button type="button" disabled={!audio || current <= 0} onClick={() => playSentence(current - 1)}>上一句</button>
      <button type="button" disabled={!audio || current >= sentences.length - 1} onClick={() => playSentence(current + 1)}>下一句</button>
      <button type="button" disabled={!audio} aria-pressed={loop} onClick={toggleLoop}>
        <Check size={16} aria-hidden />单句循环
      </button>
    </div>
    {error && <div role="status">播放失败。再点一次播放。</div>}
    <div className="listening-follow-lines" ref={list}
      onWheel={(event) => { if (event.deltaY) pauseFollowing() }}
      onTouchMove={pauseFollowing}
      onPointerDown={(event) => {
        const scroller = event.currentTarget
        if (event.clientX >= scroller.getBoundingClientRect().left + scroller.clientWidth) pauseFollowing()
      }}
      onScroll={() => { if (!autoScrolling.current) pauseFollowing() }}
      onScrollEnd={() => { autoScrolling.current = false }}>
      {sentences.map((sentence, index) => {
        const evidence = sentence.evidence ?? []
        const previous = sentences[index - 1]
        const speakerChange = previous?.speaker !== sentence.speaker
        const questionLabels = [...new Set(evidence.map(({ question }) => question))]
          .filter((question) => !previous?.evidence?.some((item) => item.question === question))
        return <button key={sentence.start} type="button" className="listening-follow-line"
          data-speaker-change={previous && speakerChange ? true : undefined}
          disabled={!audio} aria-current={current === index ? 'true' : undefined}
          onClick={() => playSentence(index)}>
          <span className="listening-follow-speaker" style={{ fontFamily: paperSurfaceTokens.paperFontStack }}>
            {speakerChange && sentence.speaker && `${sentence.speaker}:`}
          </span>
          <span>
            <span lang="en" style={{ fontFamily: paperSurfaceTokens.paperFontStack }}>
              {evidence.length > 0
                ? <mark className="ps-evidence-anchor--active" data-paper-evidence-kind={evidence[0].kind}>{sentence.en}</mark>
                : sentence.en}
            </span>
            {questionLabels.length > 0 && <span lang="zh-CN" className="listening-follow-evidence">
              第 {questionLabels.join('、')} 题
            </span>}
          </span>
          <span className="listening-follow-translation">{sentence.zh}</span>
        </button>
      })}
    </div>
    {!following && current >= 0 && (
      <button type="button" className="listening-quiet-control" onClick={() => {
        const row = list.current?.children[current] as HTMLButtonElement | undefined
        row?.focus({ preventScroll: true })
        setFollowing(true)
      }}>回到当前句</button>
    )}
  </div>
}
