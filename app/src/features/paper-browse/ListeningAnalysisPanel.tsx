import { useId, useLayoutEffect, useRef, useState } from 'react'
import type { ListeningAnalysisV1, ListeningMaterialAnalysis } from '../../domain/listeningAnalysis'
import { ListeningTransport } from './ListeningSegmentPlayer'
import { ListeningSentenceFollow, scrollListeningTarget } from './ListeningSentenceFollow'

function spokenWords(text: string) {
  return text.normalize('NFKC').toLowerCase().replace(/[’‘'ʼ]/g, '').match(/[\p{L}\p{N}]+/gu)?.join(' ') ?? ''
}

function findQuoteStart(quote: string, sentences: string[]) {
  if (!quote) return undefined
  const matches = sentences.flatMap((sentence, index) => {
    if (` ${sentence} `.includes(` ${quote} `)) return [index]
    // A multi-sentence quote can still have a unique, verbatim first sentence.
    if (sentence && quote.startsWith(`${sentence} `)
      && `${sentences.slice(index).join(' ')} `.startsWith(`${quote} `)) return [index]
    return []
  })
  return matches.length === 1 ? matches[0] : undefined
}

export function ListeningAnalysisPanel({ title, answers, analysis, groupQuestionIds, activeQuestionId, segments,
  segmentAudio, playback, onActivate, onReturnToPlayback, fontError, unavailable }: {
  title: string
  answers: string | null
  analysis?: ListeningAnalysisV1
  groupQuestionIds: string[]
  activeQuestionId: string | null
  segments: readonly { segmentId: string; firstQuestionId: string; questionNumbers: readonly number[] }[]
  segmentAudio: Record<string, HTMLAudioElement | null>
  playback: { segmentId: string | null; audio: HTMLAudioElement } | null
  onActivate: (audio: HTMLAudioElement) => void
  onReturnToPlayback?: () => void
  fontError: string
  unavailable: string
}) {
  const answersId = useId()
  const [openAnswerSection, setOpenAnswerSection] = useState<string | null>(null)
  const answersOpen = openAnswerSection === title
  const allowed = new Set(groupQuestionIds)
  const materials = Object.values(analysis?.materials ?? {}).filter((material) =>
    material.questionIds.some((questionId) => allowed.has(questionId)))
  const material = activeQuestionId
    ? materials.find((item) => item.questionIds.includes(activeQuestionId))
    : materials[0]
  const segment = segments.find((item) => item.segmentId === material?.segmentId)
    ?? segments.find((item) => activeQuestionId
      ? item.questionNumbers.includes(Number(activeQuestionId.split(':').at(-1)))
      : allowed.has(item.firstQuestionId))
  const segmentId = segment?.segmentId ?? material?.segmentId
  const audio = playback && (!playback.segmentId || playback.segmentId === segmentId)
    ? playback.audio : segmentId ? segmentAudio[segmentId] : null
  const number = segmentId?.match(/^listening-text-(\d+)$/)?.[1]
  const numbers = material?.questionIds.map((id) => id.split(':').at(-1)) ?? segment?.questionNumbers ?? []
  const range = numbers.length > 1 && numbers.every((no, index) => Number(no) === Number(numbers[0]) + index)
    ? `${numbers[0]}–${numbers.at(-1)}` : numbers.join('、')
  const heading = [number && `第 ${number} 段`, range && `第 ${range} 题`].filter(Boolean).join(' · ')

  return <div className="listening-analysis-panel">
    <header className="listening-analysis-section-heading">
      <h4>{title}</h4>
      {answers && <>
        <button type="button" className="listening-quiet-control" aria-expanded={answersOpen} aria-controls={answersId}
          onClick={() => setOpenAnswerSection(answersOpen ? null : title)}>全节答案</button>
        <p className="paper-browse-answer-row" id={answersId} hidden={!answersOpen}>{answers}</p>
      </>}
    </header>
    {onReturnToPlayback && playback?.segmentId && playback.segmentId !== segmentId
      && <button type="button" className="listening-quiet-control" onClick={onReturnToPlayback}>回到当前句</button>}
    {material && analysis ? <ListeningMaterial key={material.segmentId} {...{ material, analysis, allowed, heading, audio, onActivate }} />
      : <>
        {heading && <h5>{heading}</h5>}
        {audio && <ListeningTransport audio={audio} onActivate={onActivate} />}
        <p className="paper-browse-lecture-empty" role={fontError ? 'alert' : undefined}>{fontError || unavailable}</p>
      </>}
  </div>
}

function ListeningMaterial({ material, analysis, allowed, heading, audio, onActivate }: {
  material: ListeningMaterialAnalysis
  analysis: ListeningAnalysisV1
  allowed: Set<string>
  heading: string
  audio?: HTMLAudioElement | null
  onActivate: (audio: HTMLAudioElement) => void
}) {
  const [questionJump, setQuestionJump] = useState<{ number: number } | null>(null)
  const [reviewedSentence, setReviewedSentence] = useState<{ index: number } | null>(null)
  const materialRef = useRef<HTMLElement>(null)
  const questionsRef = useRef<HTMLDivElement>(null)
  const questions = material.questionIds.filter((id) => allowed.has(id)).map((id) => analysis.questions[id]).filter(Boolean)
  const sentenceWords = (material.sentences ?? []).map(({ en }) => spokenWords(en))

  useLayoutEffect(() => {
    materialRef.current?.closest('.paper-browse-lecture-panel')?.scrollTo({ top: 0, behavior: 'instant' })
  }, [])

  useLayoutEffect(() => {
    if (!questionJump) return
    const question = questionsRef.current?.querySelector<HTMLDetailsElement>(`[data-question-number="${questionJump.number}"]`)
    if (!question) return
    question.open = true
    question.querySelector('summary')?.focus({ preventScroll: true })
    scrollListeningTarget(question, 'start')
  }, [questionJump])

  return <section className="listening-analysis-material" ref={materialRef}>
    <header className="listening-analysis-intro">
      <h5>{heading}</h5>
      <p className="listening-analysis-summary">{material.summaryZh}</p>
    </header>
    <ListeningSentenceFollow sentences={material.sentences} audio={audio} onActivate={onActivate}
      onQuestion={(number) => setQuestionJump({ number })} reviewedSentence={reviewedSentence}>
      {!material.sentences?.length && <section className="listening-transcript listening-transcript-plain">
        <h6>录音稿</h6>
        <p className="listening-analysis-summary">本段可整段播放</p>
        <p lang="en">{material.transcript}</p>
        <p className="listening-follow-translation">{material.translationZh}</p>
      </section>}
      {questions.length > 0 && <div className="listening-analysis-questions" ref={questionsRef}>
        <h6>逐题讲解</h6>
        {questions.map((question) => {
          const number = question.questionId.split(':').at(-1)
          const quoteStart = findQuoteStart(spokenWords(question.evidence.quote), sentenceWords)
          return <details key={question.questionId} className="listening-analysis-question" data-question-number={number}>
            <summary><b>{number}</b><span>答案 <b>{question.officialAnswer}</b></span></summary>
            <div className="listening-analysis-explanation">
              <p>{question.reasonZh}</p>
              {quoteStart !== undefined ? <button type="button" className="listening-quiet-control" onClick={() => setReviewedSentence({ index: quoteStart })}>
                回看原句
              </button> : <blockquote lang="en">“{question.evidence.quote}”</blockquote>}
              {question.distractors?.length ? <div className="listening-analysis-distractors">
                <b>干扰项辨析</b>
                {question.distractors.map((item) => <p key={item.label}><b>{item.label} 项</b>：{item.explanationZh}</p>)}
              </div> : null}
              <details className="listening-analysis-translation">
                <summary className="listening-quiet-control">题干与选项译文</summary>
                <p>{question.stemTranslationZh}</p>
                <ul>
                  {(['A', 'B', 'C'] as const).map((label) => <li key={label}><b>{label}</b> {question.optionTranslationsZh[label]}</li>)}
                </ul>
              </details>
            </div>
          </details>
        })}
      </div>}
    </ListeningSentenceFollow>
  </section>
}
