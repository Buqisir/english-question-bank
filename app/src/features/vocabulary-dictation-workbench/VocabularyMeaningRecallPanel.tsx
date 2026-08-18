import {
  Check,
  Eye,
  EyeOff,
  Play,
  QrCode,
  RotateCcw,
  Shuffle,
  Sparkles,
  Volume2,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { VocabularySetEntry } from '../../domain/vocabulary'
import {
  createVocabularyDictationTask,
  createVocabularyMeaningRecallRecord,
  getSuggestedVocabularyMeaningRecall,
  getVocabularyMeaningRecallRecord,
  updateVocabularyMeaningRecallRecord,
  type VocabularyDictationTaskDto,
  type VocabularyMeaningRecallRecordDto,
  type VocabularyMeaningSuggestionDto,
  type VocabularySetLibraryItemDto,
} from '../../services/vocabulary'
import { getVocabularyAudioPath } from '../vocabulary-listen/vocabularyAudioVariants'

const MEANING_SUGGESTION_TARGET_STORAGE_KEY = 'eqb-vocabulary-meaning-suggestion-target-v1'

type MeaningRecallPanelProps = {
  studentId: string
  selectedSets: VocabularySetLibraryItemDto[]
  records: VocabularyMeaningRecallRecordDto[]
  accent: 'american' | 'british'
  onAccentChange: (accent: 'american' | 'british') => void
  requestedRecordId: string | null
  onRequestedRecordHandled: () => void
  onNeedSets: () => void
  onChanged: () => Promise<void>
  onCreatedTask: (task: VocabularyDictationTaskDto) => void
  onSessionActiveChange: (active: boolean) => void
  onSaveBarrierChange: (barrier: (() => Promise<boolean>) | null) => void
}

function dedupeSelectedEntries(sets: VocabularySetLibraryItemDto[]) {
  const seen = new Set<string>()
  return sets.flatMap((set) => set.entries).filter((entry) => {
    if (seen.has(entry.id)) return false
    seen.add(entry.id)
    return true
  })
}

function resultCounts(record: VocabularyMeaningRecallRecordDto) {
  return record.entries.reduce((counts, entry) => {
    counts[entry.result] += 1
    return counts
  }, { correct: 0, wrong: 0, untested: 0 })
}

function formatMeaning(entry: VocabularySetEntry) {
  return entry.sourceMeanings.length ? entry.sourceMeanings.join('；') : entry.teachingSense
}

function displayDate(value: string | null) {
  if (!value) return '—'
  const [year, month, day] = value.slice(0, 10).split('-')
  return `${year}.${month}.${day}`
}

function today() {
  const date = new Date()
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-')
}

export function VocabularyMeaningRecallPanel({
  studentId,
  selectedSets,
  records,
  accent,
  onAccentChange,
  requestedRecordId,
  onRequestedRecordHandled,
  onNeedSets,
  onChanged,
  onCreatedTask,
  onSessionActiveChange,
  onSaveBarrierChange,
}: MeaningRecallPanelProps) {
  const selectedEntries = useMemo(() => dedupeSelectedEntries(selectedSets), [selectedSets])
  const [activeRecord, setActiveRecord] = useState<VocabularyMeaningRecallRecordDto | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [orderMode, setOrderMode] = useState<'random' | 'source'>('random')
  const [target, setTarget] = useState(20)
  const [suggestionTarget, setSuggestionTarget] = useState(() => {
    const stored = Number(window.localStorage.getItem(MEANING_SUGGESTION_TARGET_STORAGE_KEY))
    return Math.max(1, Math.min(60, stored || 20))
  })
  const [suggestion, setSuggestion] = useState<VocabularyMeaningSuggestionDto[]>([])
  const [revealWrong, setRevealWrong] = useState(false)
  const [busy, setBusy] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [error, setError] = useState('')
  const [dictationTitle, setDictationTitle] = useState('')
  const recordRef = useRef<VocabularyMeaningRecallRecordDto | null>(null)
  const saveQueueRef = useRef<Promise<unknown>>(Promise.resolve())
  const saveRevisionRef = useRef(0)
  const lastSaveSucceededRef = useRef(true)
  const savePendingRef = useRef(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const flushPendingSaves = useCallback(async () => {
    await saveQueueRef.current.catch(() => undefined)
    return lastSaveSucceededRef.current
  }, [])

  useEffect(() => {
    recordRef.current = activeRecord
  }, [activeRecord])

  useEffect(() => {
    if (activeRecord?.status !== 'completed') return
    setDictationTitle(`${activeRecord.recallDate} 错词听写`)
  }, [activeRecord?.id, activeRecord?.recallDate, activeRecord?.status])

  useEffect(() => {
    const active = activeRecord?.status === 'draft'
    onSessionActiveChange(active)
    return () => onSessionActiveChange(false)
  }, [activeRecord?.status, onSessionActiveChange])

  useEffect(() => {
    onSaveBarrierChange(flushPendingSaves)
    return () => onSaveBarrierChange(null)
  }, [flushPendingSaves, onSaveBarrierChange])

  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!savePendingRef.current) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnBeforeUnload)
    return () => window.removeEventListener('beforeunload', warnBeforeUnload)
  }, [])

  useEffect(() => {
    setTarget((current) => Math.max(1, Math.min(current, Math.min(60, selectedEntries.length || 20))))
  }, [selectedEntries.length])

  useEffect(() => {
    if (!requestedRecordId) return
    let cancelled = false
    setBusy(true)
    getVocabularyMeaningRecallRecord(requestedRecordId)
      .then((record) => {
        if (cancelled) return
        setActiveRecord(record)
        recordRef.current = record
        setActiveIndex(Math.max(0, record.entries.findIndex((entry) => entry.result === 'untested')))
        setRevealWrong(false)
        onRequestedRecordHandled()
      })
      .catch((nextError: unknown) => {
        if (!cancelled) setError(nextError instanceof Error ? nextError.message : '认词记录加载失败。')
      })
      .finally(() => { if (!cancelled) setBusy(false) })
    return () => { cancelled = true }
  }, [onRequestedRecordHandled, requestedRecordId])

  useEffect(() => {
    audioRef.current?.pause()
    audioRef.current = null
    setActiveRecord(null)
    setSuggestion([])
    setError('')
  }, [studentId])

  const queueSave = useCallback((record: VocabularyMeaningRecallRecordDto, status: 'draft' | 'completed' = 'draft') => {
    const revision = saveRevisionRef.current + 1
    saveRevisionRef.current = revision
    lastSaveSucceededRef.current = false
    savePendingRef.current = true
    setSaveState('saving')
    saveQueueRef.current = saveQueueRef.current
      .catch(() => undefined)
      .then(() => updateVocabularyMeaningRecallRecord(record.id, {
        status,
        recallDate: record.recallDate,
        results: record.entries.map((entry) => ({ entryId: entry.id, result: entry.result })),
      }))
      .then((saved) => {
        if (revision === saveRevisionRef.current) {
          lastSaveSucceededRef.current = true
          savePendingRef.current = false
          setSaveState('saved')
          if (status === 'completed') {
            setActiveRecord(saved)
            recordRef.current = saved
          }
        }
        return saved
      })
      .catch((nextError: unknown) => {
        if (revision === saveRevisionRef.current) {
          lastSaveSucceededRef.current = false
          setSaveState('error')
          setError(nextError instanceof Error ? nextError.message : '认词结果自动保存失败。')
        }
        return null
      })
    return saveQueueRef.current
  }, [])

  const finishRecord = useCallback(async (record: VocabularyMeaningRecallRecordDto) => {
    if (!record.entries.some((entry) => entry.result !== 'untested')) return
    setBusy(true)
    setError('')
    try {
      await saveQueueRef.current.catch(() => undefined)
      const saved = await queueSave(record, 'completed')
      if (!saved) return
      await onChanged()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '本轮认词暂时无法完成。')
    } finally {
      setBusy(false)
    }
  }, [onChanged, queueSave])

  const advanceAfterAnswer = useCallback((record: VocabularyMeaningRecallRecordDto, index: number) => {
    const nextIndex = record.entries.findIndex((entry, entryIndex) => entryIndex > index && entry.result === 'untested')
    if (nextIndex >= 0) {
      setActiveIndex(nextIndex)
      setRevealWrong(false)
      return
    }
    const firstUntested = record.entries.findIndex((entry) => entry.result === 'untested')
    if (firstUntested >= 0) {
      setActiveIndex(firstUntested)
      setRevealWrong(false)
      return
    }
    setRevealWrong(false)
    void finishRecord(record)
  }, [finishRecord])

  const markCurrent = useCallback((result: 'correct' | 'wrong') => {
    const current = recordRef.current
    if (!current || current.status !== 'draft') return
    const entries = current.entries.map((entry, index) => index === activeIndex ? { ...entry, result } : entry)
    const nextRecord = { ...current, entries }
    recordRef.current = nextRecord
    setActiveRecord(nextRecord)
    void queueSave(nextRecord)
    if (result === 'wrong') {
      setRevealWrong(true)
    } else {
      advanceAfterAnswer(nextRecord, activeIndex)
    }
  }, [activeIndex, advanceAfterAnswer, queueSave])

  const continueAfterWrong = useCallback(() => {
    const current = recordRef.current
    if (current) advanceAfterAnswer(current, activeIndex)
  }, [activeIndex, advanceAfterAnswer])

  const undoPrevious = useCallback(() => {
    const current = recordRef.current
    if (!current || current.status !== 'draft') return
    const targetIndex = revealWrong ? activeIndex : Math.max(0, activeIndex - 1)
    const entries = current.entries.map((entry, index) => index === targetIndex ? { ...entry, result: 'untested' as const } : entry)
    const nextRecord = { ...current, entries }
    recordRef.current = nextRecord
    setActiveRecord(nextRecord)
    setActiveIndex(targetIndex)
    setRevealWrong(false)
    void queueSave(nextRecord)
  }, [activeIndex, queueSave, revealWrong])

  useEffect(() => {
    if (!activeRecord || activeRecord.status !== 'draft') return
    const onKeyDown = (event: KeyboardEvent) => {
      const targetElement = event.target as HTMLElement | null
      if (targetElement?.matches('input, textarea, select, button')) return
      if (event.key === 'Enter') {
        event.preventDefault()
        if (revealWrong) continueAfterWrong()
        else markCurrent('correct')
      } else if (event.key === 'Shift' && !event.repeat) {
        event.preventDefault()
        if (!revealWrong) markCurrent('wrong')
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        undoPrevious()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeRecord, continueAfterWrong, markCurrent, revealWrong, undoPrevious])

  async function startRecall(entries: VocabularySetEntry[], sourceSetIds: string[]) {
    if (!entries.length || !sourceSetIds.length) return
    setBusy(true)
    setError('')
    try {
      const record = await createVocabularyMeaningRecallRecord({
        studentId,
        sourceSetIds,
        entryIds: entries.slice(0, 60).map((entry) => entry.id),
        orderMode,
        recallDate: today(),
      })
      setActiveRecord(record)
      recordRef.current = record
      setActiveIndex(0)
      setRevealWrong(false)
      setSuggestion([])
      await onChanged()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '认词暂时无法开始。')
    } finally {
      setBusy(false)
    }
  }

  async function loadSuggestion() {
    setBusy(true)
    setError('')
    try {
      window.localStorage.setItem(MEANING_SUGGESTION_TARGET_STORAGE_KEY, String(suggestionTarget))
      setSuggestion(await getSuggestedVocabularyMeaningRecall(studentId, suggestionTarget))
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '复习建议生成失败。')
    } finally {
      setBusy(false)
    }
  }

  async function generateTask(entries: Array<VocabularySetEntry & { sourceSetIds?: string[] }>) {
    const limitedEntries = entries.slice(0, 60)
    if (!limitedEntries.length) return
    const normalizedTitle = dictationTitle.trim().replace(/\s+/gu, ' ')
    if (!normalizedTitle) {
      setError('请先填写文件名。')
      return
    }
    const sourceSetIds = [...new Set(limitedEntries.flatMap((entry) => entry.sourceSetIds ?? []))]
    if (!sourceSetIds.length) {
      setError('这些词缺少来源词组，暂时无法生成听写。')
      return
    }
    setBusy(true)
    setError('')
    try {
      const task = await createVocabularyDictationTask({
        studentId,
        sourceSetIds,
        entryIds: limitedEntries.map((entry) => entry.id),
        taskDate: activeRecord?.recallDate ?? today(),
        title: normalizedTitle,
        accent,
        share: true,
        ...(activeRecord ? { meaningRecallRecordId: activeRecord.id } : {}),
      })
      onCreatedTask(task)
      await onChanged()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '错词听写生成失败。')
    } finally {
      setBusy(false)
    }
  }

  function playAudio(entry: VocabularySetEntry) {
    audioRef.current?.pause()
    const audio = new Audio(getVocabularyAudioPath(entry, accent))
    audioRef.current = audio
    void audio.play().catch(() => setError('这个词的音频暂时无法播放。'))
  }

  async function editCompletedResult(entryId: string, result: 'correct' | 'wrong' | 'untested') {
    const current = recordRef.current
    if (!current || current.status !== 'completed') return
    const nextRecord = {
      ...current,
      entries: current.entries.map((entry) => entry.id === entryId ? { ...entry, result } : entry),
    }
    setActiveRecord(nextRecord)
    recordRef.current = nextRecord
    const saved = await queueSave(nextRecord, 'completed')
    if (saved) await onChanged()
  }

  async function resumeRecord(recordId: string) {
    setBusy(true)
    setError('')
    try {
      const record = await getVocabularyMeaningRecallRecord(recordId)
      setActiveRecord(record)
      recordRef.current = record
      setActiveIndex(Math.max(0, record.entries.findIndex((entry) => entry.result === 'untested')))
      setRevealWrong(false)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '认词草稿加载失败。')
    } finally {
      setBusy(false)
    }
  }

  const currentEntry = activeRecord?.entries[activeIndex] ?? null
  const counts = activeRecord ? resultCounts(activeRecord) : null
  const stageRecord = activeRecord

  if (stageRecord?.status === 'draft' && currentEntry) {
    return (
      <section className="meaning-recall-stage" aria-labelledby="meaning-recall-word" tabIndex={-1}>
        <header>
          <div>
            <strong>{stageRecord.title}</strong>
            <span>{activeIndex + 1} / {stageRecord.entryCount} · {saveState === 'saving' ? '正在自动保存…' : saveState === 'error' ? '保存失败' : '已自动保存'}</span>
          </div>
          <button type="button" onClick={() => void finishRecord(stageRecord)} disabled={busy}>结束本轮</button>
        </header>
        <div className="meaning-recall-word" aria-live="polite">
          <h2 id="meaning-recall-word" lang="en">{currentEntry.headword}</h2>
          {!revealWrong ? (
            <p>学生说出中文意思后，老师判对错。</p>
          ) : (
            <div className="meaning-recall-reveal">
              <span>{currentEntry.phonetics?.[accent] ?? currentEntry.phonetic}</span>
              <strong>{currentEntry.teachingSense}</strong>
              <button type="button" onClick={() => playAudio(currentEntry)}><Volume2 size={17} />播放{accent === 'american' ? '美音' : '英音'}</button>
            </div>
          )}
        </div>
        <footer>
          <button type="button" onClick={undoPrevious}><RotateCcw size={16} />撤销 <kbd>Delete</kbd></button>
          {!revealWrong ? <>
            <button type="button" className="is-wrong" onClick={() => markCurrent('wrong')}><X size={17} />答错 <kbd>Shift</kbd></button>
            <button type="button" className="is-correct" onClick={() => markCurrent('correct')}><Check size={17} />答对 <kbd>Enter</kbd></button>
          </> : <button type="button" className="is-primary" onClick={continueAfterWrong}>已讲清，继续 <kbd>Enter</kbd></button>}
        </footer>
      </section>
    )
  }

  if (activeRecord?.status === 'completed' && counts) {
    const forgotten = activeRecord.entries.filter((entry) => entry.result === 'wrong')
    return (
      <section className="meaning-recall-result" aria-labelledby="meaning-recall-result-title">
        <header>
          <div><h2 id="meaning-recall-result-title">本轮认词</h2><p>{displayDate(activeRecord.recallDate)} · 已保存</p></div>
          <button type="button" onClick={() => setActiveRecord(null)}>返回认词</button>
        </header>
        <div className="meaning-recall-result-summary">
          <strong>会 {counts.correct}</strong><strong>不会 {counts.wrong}</strong><span>未测 {counts.untested}</span>
        </div>
        {error && <p className="meaning-recall-error" role="alert">{error}</p>}
        <div className="meaning-recall-result-actions">
          <label className="meaning-recall-export-name">
            <span>文件名</span>
            <input
              type="text"
              aria-label="错词听写文件名"
              autoComplete="off"
              spellCheck={false}
              maxLength={60}
              value={dictationTitle}
              onChange={(event) => {
                setDictationTitle(event.target.value)
                setError('')
              }}
            />
          </label>
          <fieldset>
            <legend>听写发音</legend>
            <button type="button" aria-pressed={accent === 'american'} className={accent === 'american' ? 'is-selected' : ''} onClick={() => onAccentChange('american')}>美音</button>
            <button type="button" aria-pressed={accent === 'british'} className={accent === 'british' ? 'is-selected' : ''} onClick={() => onAccentChange('british')}>英音</button>
          </fieldset>
          <button type="button" className="is-primary" onClick={() => void generateTask(forgotten)} disabled={!forgotten.length || !dictationTitle.trim() || busy}><QrCode size={16} />生成错词听写</button>
          <span>下载时会自动补上听写纸、词数和口音。</span>
        </div>
        <div className="meaning-recall-result-list">
          {activeRecord.entries.map((entry) => (
            <article key={entry.id}>
              <div><strong>{entry.headword}</strong><span>{entry.partOfSpeech} {formatMeaning(entry)}</span></div>
              <fieldset aria-label={`${entry.headword} 的认词结果`}>
                <button type="button" className={entry.result === 'correct' ? 'is-selected' : ''} onClick={() => void editCompletedResult(entry.id, 'correct')}>对</button>
                <button type="button" className={entry.result === 'wrong' ? 'is-selected is-wrong' : ''} onClick={() => void editCompletedResult(entry.id, 'wrong')}>错</button>
                <button type="button" className={entry.result === 'untested' ? 'is-selected' : ''} onClick={() => void editCompletedResult(entry.id, 'untested')}>未测</button>
              </fieldset>
            </article>
          ))}
        </div>
      </section>
    )
  }

  const latestDraft = records.find((record) => record.status === 'draft')
  return (
    <section className="meaning-recall-home">
      <header className="meaning-recall-heading">
        <div><h2>看词说义</h2><p>给学生看英文，让他说中文；老师判对错。</p></div>
        {latestDraft && <button type="button" disabled={busy} onClick={() => void resumeRecord(latestDraft.id)}><Play size={16} />继续上次</button>}
      </header>
      {error && <p className="meaning-recall-error" role="alert">{error}</p>}

      <div className="meaning-recall-start-row">
        <div>
          <strong>{selectedSets.length === 1 ? selectedSets[0].title : selectedSets.length > 1 ? `已选 ${selectedSets.length} 组` : '先选择词组'}</strong>
          {!selectedSets.length && <span>不会改动原词组。</span>}
        </div>
        <label>抽 <input type="number" min="1" max="60" value={target} onChange={(event) => setTarget(Math.max(1, Math.min(60, Number(event.target.value) || 1)))} /> 词</label>
        <fieldset><legend>顺序</legend><button type="button" className={orderMode === 'random' ? 'is-selected' : ''} onClick={() => setOrderMode('random')}><Shuffle size={15} />随机</button><button type="button" className={orderMode === 'source' ? 'is-selected' : ''} onClick={() => setOrderMode('source')}>原顺序</button></fieldset>
        {selectedSets.length
          ? <button type="button" className="is-primary" disabled={busy} onClick={() => void startRecall(selectedEntries.slice(0, target), selectedSets.map((set) => set.id))}><Eye size={16} />开始</button>
          : <button type="button" onClick={onNeedSets}><EyeOff size={16} />选择词组</button>}
      </div>

      {!selectedSets.length && <div className="meaning-recall-suggestion">
        <div><strong>直接推荐一轮</strong><span>优先选择重点、常错和较久没检查的词。</span></div>
        <label><input type="number" min="1" max="60" value={suggestionTarget} onChange={(event) => setSuggestionTarget(Math.max(1, Math.min(60, Number(event.target.value) || 1)))} /> 词</label>
        <button type="button" onClick={() => void loadSuggestion()} disabled={busy}><Sparkles size={16} />选出单词</button>
      </div>}
      {!selectedSets.length && suggestion.length > 0 && <div className="meaning-recall-suggestion-result">
        <ol>{suggestion.map((entry) => <li key={entry.id}><strong>{entry.headword}</strong><span>{entry.reason}</span></li>)}</ol>
        <div><button type="button" className="is-primary" onClick={() => void startRecall(suggestion, [...new Set(suggestion.flatMap((entry) => entry.sourceSetIds))])}><Play size={16} />开始这一轮</button><button type="button" onClick={() => setSuggestion([])}>收起</button></div>
      </div>}
    </section>
  )
}
