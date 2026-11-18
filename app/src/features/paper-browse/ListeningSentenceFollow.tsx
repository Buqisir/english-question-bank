import { useEffect, useRef, useState } from 'react'
import type { ListeningSentence } from '../../domain/listeningAnalysis'
import { Check, Pause, Play } from '../../icons'
import { paperSurfaceTokens } from '../../../../shared/papersurface/tokens.mjs'

export function ListeningSentenceFollow({ sentences, audio }: {
  sentences: ListeningSentence[]
  audio?: HTMLAudioElement | null
}) {
  const [current, setCurrent] = useState(-1)
  const [playing, setPlaying] = useState(false)
  const [loop, setLoop] = useState(false)
  const [error, setError] = useState(false)
  const loopTarget = useRef(-1)
  const list = useRef<HTMLDivElement>(null)

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
    const events = ['play', 'pause', 'seeked', 'ended', 'timeupdate'] as const
    events.forEach((event) => audio.addEventListener(event, sync))
    sync()
    return () => {
      cancelAnimationFrame(frame)
      events.forEach((event) => audio.removeEventListener(event, sync))
    }
  }, [audio, sentences])

  useEffect(() => {
    const scroller = list.current
    const row = scroller?.children[current] as HTMLElement | undefined
    if (!scroller || !row) return
    if (row.offsetTop >= scroller.scrollTop
      && row.offsetTop + row.offsetHeight <= scroller.scrollTop + scroller.clientHeight) return
    scroller.scrollTo({
      top: row.offsetTop - 12,
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    })
  }, [current])

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
      <button type="button" disabled={!audio} aria-label={playing ? '暂停' : '播放'}
        onClick={togglePlayback}>
        {playing ? <Pause size={16} /> : <Play size={16} />}
      </button>
      <button type="button" disabled={!audio || current <= 0} onClick={() => playSentence(current - 1)}>上一句</button>
      <button type="button" disabled={!audio || current >= sentences.length - 1} onClick={() => playSentence(current + 1)}>下一句</button>
      <button type="button" disabled={!audio} aria-pressed={loop} onClick={toggleLoop}>
        <Check size={16} />单句循环
      </button>
    </div>
    {error && <div role="status">播放失败。再点一次播放。</div>}
    <div className="listening-follow-lines" ref={list}>
      {sentences.map((sentence, index) => {
        const evidence = sentence.evidence ?? []
        return <button key={sentence.start} type="button" className="listening-follow-line"
          disabled={!audio} aria-current={current === index ? 'true' : undefined}
          onClick={() => playSentence(index)}>
          <span className="listening-follow-speaker" style={{ fontFamily: paperSurfaceTokens.paperFontStack }}>{sentence.speaker && `${sentence.speaker}:`}</span>
          <span>
            <span lang="en" style={{ fontFamily: paperSurfaceTokens.paperFontStack }}>
              {evidence.length > 0
                ? <mark className="ps-evidence-anchor--active" data-paper-evidence-kind={evidence[0].kind}>{sentence.en}</mark>
                : sentence.en}
            </span>
            {evidence.length > 0 && <span lang="zh-CN" className="listening-follow-evidence">
              第 {[...new Set(evidence.map(({ question }) => question))].join('、')} 题
            </span>}
          </span>
          <span className="listening-follow-translation">{sentence.zh}</span>
        </button>
      })}
    </div>
  </div>
}
