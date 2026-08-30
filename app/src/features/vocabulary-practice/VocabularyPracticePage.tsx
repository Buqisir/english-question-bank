import { ArrowLeft, ArrowRight, BookMarked, Check, Grid2X2, RotateCcw, Volume2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { AppTopbar, type AppTopbarNav } from '../../components/AppTopbar'
import type { VocabularySetDto } from '../../services/vocabulary'
import { getVocabularySet } from '../../services/vocabulary'
import {
  getVocabularyAudioPath,
  readVocabularyAudioAccent,
  type VocabularyAudioAccent,
} from '../vocabulary-listen/vocabularyAudioVariants'
import {
  createVocabularyMatchGame,
  isVocabularyMatchRoundComplete,
  selectVocabularyMatchCard,
  settleVocabularyMatch,
  splitVocabularyMatchRounds,
  type VocabularyMatchGameState,
} from './vocabularyMatchGame'
import './vocabularyPracticePage.css'

type VocabularyPracticePageProps = {
  setId: string
  onBackToSet: () => void
  shellNav: AppTopbarNav
}

const MATCH_CONFIRMATION_MS = 720

export function VocabularyPracticePage({ setId, onBackToSet, shellNav }: VocabularyPracticePageProps) {
  const [vocabularySet, setVocabularySet] = useState<VocabularySetDto | null>(null)
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>(setId ? 'loading' : 'error')
  const [loadError, setLoadError] = useState(setId ? '' : '链接里没有生词组编号，请返回后重新打开趣味练习。')
  const [roundIndex, setRoundIndex] = useState(0)
  const [game, setGame] = useState<VocabularyMatchGameState | null>(null)
  const [liveMessage, setLiveMessage] = useState('全部卡片已盖好。请选择第一张卡。')
  const [audioError, setAudioError] = useState('')
  const [accent, setAccent] = useState<VocabularyAudioAccent>(readVocabularyAudioAccent)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioRequestRef = useRef(0)
  const matchTimerRef = useRef<number | null>(null)
  const boardRef = useRef<HTMLDivElement | null>(null)
  const completionActionRef = useRef<HTMLButtonElement | null>(null)

  const rounds = useMemo(
    () => splitVocabularyMatchRounds(vocabularySet?.entries ?? []),
    [vocabularySet],
  )
  const roundComplete = game ? isVocabularyMatchRoundComplete(game) : false
  const allComplete = roundComplete && roundIndex === rounds.length - 1

  useEffect(() => {
    let cancelled = false
    const audio = audioRef.current
    if (!setId) return () => { cancelled = true }
    getVocabularySet(setId)
      .then((nextSet) => {
        if (cancelled) return
        const nextRounds = splitVocabularyMatchRounds(nextSet.entries)
        if (!nextRounds.length) throw new Error('这个生词组里还没有可以练习的单词。')
        setVocabularySet(nextSet)
        setAccent(readVocabularyAudioAccent(nextSet.programId))
        setRoundIndex(0)
        setGame(createVocabularyMatchGame(nextRounds[0]))
        setLoadState('ready')
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setLoadState('error')
        setLoadError(error instanceof Error ? error.message : '生词组加载失败，请稍后重试。')
      })
    return () => {
      cancelled = true
      if (matchTimerRef.current !== null) window.clearTimeout(matchTimerRef.current)
      audio?.pause()
    }
  }, [setId])

  function clearMatchTimer() {
    if (matchTimerRef.current === null) return
    window.clearTimeout(matchTimerRef.current)
    matchTimerRef.current = null
  }

  function focusAfterMatch(nextState: VocabularyMatchGameState) {
    window.requestAnimationFrame(() => {
      if (isVocabularyMatchRoundComplete(nextState)) {
        completionActionRef.current?.focus()
      } else {
        boardRef.current?.querySelector<HTMLButtonElement>('[data-card-status="hidden"]')?.focus()
      }
    })
  }

  function playWord(entryId: string) {
    const entry = vocabularySet?.entries.find((item) => item.id === entryId)
    const audio = audioRef.current
    if (!entry || !audio) return
    const requestId = audioRequestRef.current + 1
    audioRequestRef.current = requestId
    setAudioError('')
    audio.pause()
    audio.currentTime = 0
    audio.src = getVocabularyAudioPath(entry, accent)
    audio.load()
    void audio.play().catch(() => {
      if (audioRequestRef.current !== requestId) return
      setAudioError(`${accent === 'american' ? '美音' : '英音'}暂时无法播放，可以继续配对。`)
    })
  }

  function selectCard(cardId: string) {
    if (!game) return
    const selection = selectVocabularyMatchCard(game, cardId)
    if (selection.outcome === 'ignored') return
    setGame(selection.state)
    if (selection.spokenEntryId) playWord(selection.spokenEntryId)

    if (selection.outcome === 'first') {
      setLiveMessage('已翻开第一张卡。请选择对应的另一张。')
    } else if (selection.outcome === 'mismatch') {
      setLiveMessage('这两张不匹配。再翻一张，会先盖回它们。')
    } else {
      const pairedCards = selection.state.cards.filter((card) => (
        card.id === selection.state.firstCardId || card.id === selection.state.secondCardId
      ))
      const pairedWord = pairedCards.find((card) => card.kind === 'word')
      const pairedMeaning = pairedCards.find((card) => card.kind === 'meaning')
      setLiveMessage(pairedWord && pairedMeaning
        ? `${pairedWord.label.trim()} 对应“${pairedMeaning.label.trim()}”。`
        : '配对正确。')
      clearMatchTimer()
      matchTimerRef.current = window.setTimeout(() => {
        setGame((current) => {
          if (!current) return current
          const settled = settleVocabularyMatch(current)
          focusAfterMatch(settled)
          return settled
        })
        matchTimerRef.current = null
      }, MATCH_CONFIRMATION_MS)
    }
  }

  function startRound(nextRoundIndex: number) {
    clearMatchTimer()
    const entries = rounds[nextRoundIndex]
    if (!entries) return
    audioRef.current?.pause()
    setRoundIndex(nextRoundIndex)
    setGame(createVocabularyMatchGame(entries))
    setAudioError('')
    setLiveMessage(`第 ${nextRoundIndex + 1} 轮已重新洗牌。请选择第一张卡。`)
    window.requestAnimationFrame(() => {
      boardRef.current?.querySelector<HTMLButtonElement>('[data-card-status="hidden"]')?.focus()
    })
  }

  return (
    <div className="vocabulary-practice-page">
      <AppTopbar variant="sub" pageTitle="趣味练习" {...shellNav} />
      <main className="vocabulary-practice-shell">
        <button className="vocabulary-practice-back" type="button" onClick={onBackToSet}>
          <ArrowLeft size={16} aria-hidden="true" />
          返回生词组
        </button>

        {loadState === 'loading' && (
          <section className="vocabulary-practice-status" aria-live="polite">
            <BookMarked size={34} strokeWidth={1.5} aria-hidden="true" />
            <h1>正在准备卡片…</h1>
          </section>
        )}

        {loadState === 'error' && (
          <section className="vocabulary-practice-status" role="alert">
            <BookMarked size={34} strokeWidth={1.5} aria-hidden="true" />
            <h1>这组卡片没有加载成功</h1>
            <p>{loadError}</p>
            <button className="ghost-button" type="button" onClick={onBackToSet}>返回生词组</button>
          </section>
        )}

        {loadState === 'ready' && vocabularySet && game && (
          <>
            <header className="vocabulary-practice-heading">
              <div>
                <p className="vocabulary-practice-eyebrow">{vocabularySet.title}</p>
                <h1>翻牌消消乐</h1>
                <p>翻开英文和对应的中文核心义。点到英文卡时会朗读一次。</p>
              </div>
              <div className="vocabulary-practice-round" aria-label={`第 ${roundIndex + 1} 轮，共 ${rounds.length} 轮，已配对 ${game.matchedPairCount} 对，共 ${game.totalPairCount} 对`}>
                <strong>第 {roundIndex + 1} / {rounds.length} 轮</strong>
                <span>已配对 {game.matchedPairCount} / {game.totalPairCount}</span>
                <small><Volume2 size={14} aria-hidden="true" />沿用{accent === 'american' ? '美音' : '英音'}</small>
              </div>
            </header>

            <div className="vocabulary-practice-modes" aria-label="趣味练习方式">
              <span aria-current="page"><Grid2X2 size={17} aria-hidden="true" /><strong>翻牌消消乐</strong><small>当前练习</small></span>
            </div>

            <section className="vocabulary-practice-board-section" aria-labelledby="vocabulary-match-board-title">
              <h2 id="vocabulary-match-board-title" className="sr-only">单词配对卡片</h2>
              <div ref={boardRef} className="vocabulary-match-board">
                {game.cards.map((card, cardIndex) => {
                  const revealed = card.status === 'revealed'
                  const matched = card.status === 'matched'
                  const confirmingMatch = game.resolution === 'match'
                    && (card.id === game.firstCardId || card.id === game.secondCardId)
                  const longLabel = card.label.length > 22
                  return (
                    <button
                      key={card.id}
                      className={`vocabulary-match-card${revealed ? ' is-revealed' : ''}${confirmingMatch ? ' is-confirming-match' : ''}${matched ? ' is-matched' : ''}${longLabel ? ' has-long-label' : ''}`}
                      type="button"
                      data-card-id={card.id}
                      data-card-kind={card.kind}
                      data-card-status={card.status}
                      disabled={matched}
                      tabIndex={matched ? -1 : 0}
                      aria-hidden={matched || undefined}
                      aria-label={revealed
                        ? `${card.kind === 'word' ? '英文' : '中文意思'}：${card.label}`
                        : `未翻开的卡片，第 ${cardIndex + 1} 张`}
                      onClick={() => selectCard(card.id)}
                    >
                      <span className="vocabulary-match-card-inner">
                        <span className="vocabulary-match-card-back" aria-hidden="true">
                          <BookMarked size={26} strokeWidth={1.5} />
                          <span>翻开</span>
                        </span>
                        <span className="vocabulary-match-card-face" aria-hidden="true">
                          {confirmingMatch && (
                            <span className="vocabulary-match-confirmation">
                              <Check size={14} strokeWidth={2.2} />
                            </span>
                          )}
                          <small>{card.kind === 'word' ? '英文' : '中文意思'}</small>
                          <strong>{card.label}</strong>
                          {card.kind === 'word' && <Volume2 size={15} aria-hidden="true" />}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>

              <p className="vocabulary-practice-live" aria-live="polite">{liveMessage}</p>
              {audioError && <p className="vocabulary-practice-audio-error" role="status">{audioError}</p>}

              {roundComplete && (
                <div className="vocabulary-practice-complete">
                  <Check size={28} strokeWidth={1.7} aria-hidden="true" />
                  <div>
                    <h2>{allComplete ? '全部完成' : '本轮完成'}</h2>
                    <p>{allComplete ? `这组 ${vocabularySet.entryCount} 个生词已经全部配对。` : '下一轮会继续使用生词组中的后续单词。'}</p>
                  </div>
                  <div>
                    {!allComplete && (
                      <button ref={completionActionRef} className="primary-button" type="button" onClick={() => startRound(roundIndex + 1)}>
                        下一轮 <ArrowRight size={16} aria-hidden="true" />
                      </button>
                    )}
                    <button ref={allComplete ? completionActionRef : undefined} className="ghost-button" type="button" onClick={() => startRound(roundIndex)}>
                      <RotateCcw size={16} aria-hidden="true" /> 再玩一次
                    </button>
                    <button className="ghost-button" type="button" onClick={onBackToSet}>返回生词组</button>
                  </div>
                </div>
              )}
            </section>
          </>
        )}
      </main>
      <audio ref={audioRef} hidden preload="none" onError={() => setAudioError(`${accent === 'american' ? '美音' : '英音'}暂时无法播放，可以继续配对。`)} />
    </div>
  )

}
