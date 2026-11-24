import { useCallback, useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { classifyCompleteEnglishWord } from '../../../../../shared/paper-dictionary/wordToken.mjs'
import { SENSE_DEBOUNCE_MS } from '../../../../../shared/paper-dictionary/constants.mjs'
import { createLectureFocusGate } from '../../../../../shared/paper-selection/lectureFocusGate.mjs'
import { buildSelectionSourceFromConsumption } from '../../../../../shared/paper-selection/sourceProjection.mjs'
import type { WholePaperConsumption } from '../../paper-intelligence/canonicalConsumptionClient.ts'
import {
  fetchPaperDictionaryStatus,
  requestPaperDictionaryLookup,
  requestPaperDictionarySense,
  type OtterEntry,
  type PaperDictionaryResponse,
  type PaperDictionaryStatus,
} from '../../../services/paperDictionary.ts'
import {
  fetchPaperTranslationStatus,
  requestPaperTranslation,
  type PaperTranslationResultItem,
  type PaperTranslationStatus,
} from '../../../services/paperTranslation.ts'
import { DictionaryFallback, dictionaryCopyText, type DictionarySenseState } from './DictionaryCard'
import { DictionaryEntry } from '../../dictionary/DictionaryEntry'
import { Button } from '../../../shared-ui/Button'
import { Menu } from '../../../shared-ui/Menu'
import { Notice } from '../../../shared-ui/Notice'
import { useClipboardCopy } from '../../../hooks/useClipboardCopy'
import { stopDictionaryAudio } from './dictionaryAudio'
import { createPageTranslationCache } from './pageCache'
import { validateSentenceAnalysis } from '../../../../../shared/sentence-analysis/validate.mjs'
import type { SentenceAnalysisV1, SentenceTarget } from '../../../../../shared/sentence-analysis/types.d.mts'
import { mapDomRangeToSegments, selectionRange, streamRangeToDomRange } from './mapDomSelection'
import { SelectionOverlay, type SelectionOverlayPhase } from './SelectionOverlay'
import { NotebookAddButton } from '../../vocabulary-notebook/NotebookAddButton.tsx'
import { SENTENCE_ANALYSIS_ENABLED, SENTENCE_ANALYSIS_MODE } from './sentence-analysis/flag'
import { paperTextSize } from './sentence-analysis/paperTextSize'
import { createSentenceAnalysisProvider, SentenceAnalysisRequestError } from './sentence-analysis/provider'
import { analysisButtonEligible, resolveTarget } from './sentence-analysis/resolveTarget'
import { SentenceAnalysisCard, type SentenceAnalysisCardStatus } from './sentence-analysis/SentenceAnalysisCard'
import './selectionOverlay.css'
import './sentence-analysis/sentenceAnalysis.css'

const sentenceAnalysisProvider = createSentenceAnalysisProvider(SENTENCE_ANALYSIS_MODE)

type SelectionSenseState = DictionarySenseState | { status: 'otter'; senseId: string }

let translationStatusCache: PaperTranslationStatus | 'unavailable' | null = null
let translationStatusInflight: Promise<PaperTranslationStatus | 'unavailable'> | null = null
let dictionaryStatusCache: PaperDictionaryStatus | 'unavailable' | null = null
let dictionaryStatusInflight: Promise<PaperDictionaryStatus | 'unavailable'> | null = null

function loadTranslationStatus() {
  if (translationStatusCache) return Promise.resolve(translationStatusCache)
  if (translationStatusInflight) return translationStatusInflight
  translationStatusInflight = fetchPaperTranslationStatus()
    .then((status) => {
      translationStatusCache = status
      return status
    })
    .catch(() => {
      translationStatusCache = 'unavailable'
      return 'unavailable' as const
    })
    .finally(() => {
      translationStatusInflight = null
    })
  return translationStatusInflight
}

function loadDictionaryStatus() {
  if (dictionaryStatusCache) return Promise.resolve(dictionaryStatusCache)
  if (dictionaryStatusInflight) return dictionaryStatusInflight
  dictionaryStatusInflight = fetchPaperDictionaryStatus()
    .then((status) => {
      dictionaryStatusCache = status
      return status
    })
    .catch(() => {
      dictionaryStatusCache = 'unavailable'
      return 'unavailable' as const
    })
    .finally(() => {
      dictionaryStatusInflight = null
    })
  return dictionaryStatusInflight
}

function teacherFacingError(error: unknown): string {
  if (error instanceof DOMException && error.name === 'AbortError') return ''
  const message = error instanceof Error ? error.message : ''
  if (
    message === 'Failed to fetch'
    || message === 'Load failed'
    || message.startsWith('NetworkError')
  ) {
    return '服务没连上，请重试'
  }
  if (message === 'not_authenticated') return '请先登录后再翻译'
  return message || '这段文字暂时未能正确翻译，请重试或重新选择'
}

type SelectionAction = 'dictionary' | 'lookup' | 'toolbar'

type Snapshot = {
  generation: number
  action: SelectionAction
  range: Range
  sourceRevision: string
  paperId: string
  policyKey: string
  promptVersion: string
  segments: Array<{ streamId: string; start: number; end: number; selectedText: string }>
  anchor: { x: number; y: number } | null
  word: boolean
  analysisEligible: boolean
  input: 'pointer' | 'keyboard'
}

function translationCacheKey(current: Snapshot, segment: Snapshot['segments'][number]) {
  return JSON.stringify({
    paperId: current.paperId,
    sourceRevision: current.sourceRevision,
    policyKey: current.policyKey,
    segment,
  })
}

function chooseAction({
  word,
  translationEnabled,
  dictionaryAvailable,
  analysisEligible,
}: {
  word: boolean
  translationEnabled: boolean
  dictionaryAvailable: boolean
  analysisEligible: boolean
}): SelectionAction | 'none' {
  if (word && dictionaryAvailable) return 'lookup'
  if (translationEnabled) return 'toolbar'
  if (!word && analysisEligible) return 'toolbar'
  return 'none'
}

export function usePaperSelectionTranslation({
  paperId,
  consumption,
  hostRef,
}: {
  paperId: string
  consumption: WholePaperConsumption | null
  hostRef: { current: HTMLElement | null }
}) {
  const [status, setStatus] = useState<PaperTranslationStatus | null | undefined>(undefined)
  const [dictionaryStatus, setDictionaryStatus] = useState<PaperDictionaryStatus | null | undefined>(undefined)
  const [phase, setPhase] = useState<SelectionOverlayPhase | 'idle'>('idle')
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [translation, setTranslation] = useState('')
  const [results, setResults] = useState<PaperTranslationResultItem[]>([])
  const [taskMode, setTaskMode] = useState<'contextual-fragment' | 'selected-text'>('contextual-fragment')
  const [errorMessage, setErrorMessage] = useState('')
  const [liveMessage, setLiveMessage] = useState('')
  const [dictionaryResult, setDictionaryResult] = useState<PaperDictionaryResponse | null>(null)
  const [lookupState, setLookupState] = useState<'loading' | 'ready'>('loading')
  const [lookupError, setLookupError] = useState('')
  const [fullEntryOpen, setFullEntryOpen] = useState(false)
  const [restoreQuickFocus, setRestoreQuickFocus] = useState(false)
  const [sense, setSense] = useState<SelectionSenseState>({ status: 'loading' })
  const [playErrorId, setPlayErrorId] = useState('')
  const { state: copyState, copied, error: copyError, copy, reset: resetCopy } = useClipboardCopy()
  const [analysisState, setAnalysisState] = useState<SentenceAnalysisCardStatus>('loading')
  const [analysisResult, setAnalysisResult] = useState<SentenceAnalysisV1 | null>(null)
  const [analysisTarget, setAnalysisTarget] = useState<SentenceTarget | null>(null)
  const [analysisExpanded, setAnalysisExpanded] = useState(false)
  const [analysisError, setAnalysisError] = useState('')
  const [analysisReject, setAnalysisReject] = useState<'cross-sentence' | 'too-long'>('cross-sentence')
  const generationRef = useRef(0)
  const snapshotRef = useRef<Snapshot | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const lookupAbortRef = useRef<AbortController | null>(null)
  const senseAbortRef = useRef<AbortController | null>(null)
  const analysisAbortRef = useRef<AbortController | null>(null)
  const [analysisRange, setAnalysisRange] = useState<Range | null>(null)
  const analysisEscapeRef = useRef<(() => boolean) | null>(null)
  const phaseRef = useRef<SelectionOverlayPhase | 'idle'>('idle')
  const senseTimerRef = useRef<number | null>(null)
  const pointerInsideRef = useRef(false)
  const pointerSelectingRef = useRef(false)
  const pendingAnchorRef = useRef<{ x: number; y: number } | null>(null)
  const lastInputRef = useRef<'pointer' | 'keyboard'>('pointer')
  const pointerKindRef = useRef('')
  const dismissedRangeRef = useRef<Range | null>(null)
  const pageCacheRef = useRef(createPageTranslationCache())
  const source = useMemo(() => {
    if (!consumption) return null
    try {
      return buildSelectionSourceFromConsumption(consumption)
    } catch {
      return null
    }
  }, [consumption])

  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  const [gate] = useState(() => createLectureFocusGate({
    isNonCollapsedSelection: () => {
      const selection = window.getSelection()
      return Boolean(selection && !selection.isCollapsed)
    },
  }))

  const clearSenseTimer = useCallback(() => {
    if (senseTimerRef.current != null) {
      window.clearTimeout(senseTimerRef.current)
      senseTimerRef.current = null
    }
  }, [])

  const cancelPendingWork = useCallback(() => {
    generationRef.current += 1
    abortRef.current?.abort()
    abortRef.current = null
    lookupAbortRef.current?.abort()
    lookupAbortRef.current = null
    senseAbortRef.current?.abort()
    senseAbortRef.current = null
    analysisAbortRef.current?.abort()
    analysisAbortRef.current = null
    clearSenseTimer()
    stopDictionaryAudio()
    snapshotRef.current = null
    pointerInsideRef.current = false
    gate.cancelPending()
    resetCopy()
  }, [clearSenseTimer, gate, resetCopy])

  // Pure state setters only: also runs during render when the reset key changes.
  const clearOverlayState = useCallback(() => {
    setAnalysisRange(null)
    setResults([])
    setPhase('idle')
    setSnapshot(null)
    setTranslation('')
    setErrorMessage('')
    setLiveMessage('')
    setDictionaryResult(null)
    setFullEntryOpen(false)
    setRestoreQuickFocus(false)
    setLookupError('')
    setPlayErrorId('')
    setAnalysisResult(null)
    setAnalysisTarget(null)
    setAnalysisError('')
    setAnalysisExpanded(false)
  }, [])

  const lastInputSource = useCallback(() => lastInputRef.current, [])

  const close = useCallback(() => {
    cancelPendingWork()
    clearOverlayState()
  }, [cancelPendingWork, clearOverlayState])

  const dismissSelection = useCallback(() => {
    const liveRange = selectionRange()
    dismissedRangeRef.current = liveRange ? liveRange.cloneRange() : null
    close()
  }, [close])

  const resetKey = JSON.stringify([paperId, source?.sourceRevision ?? null, status?.enabled ?? null, status?.promptVersion ?? null, status?.contextPolicy ?? null])
  const [settledResetKey, setSettledResetKey] = useState(resetKey)
  if (settledResetKey !== resetKey) {
    setSettledResetKey(resetKey)
    clearOverlayState()
  }
  useLayoutEffect(() => {
    pageCacheRef.current.clear()
    cancelPendingWork()
  }, [cancelPendingWork, resetKey])

  useEffect(() => {
    return () => {
      generationRef.current += 1
      abortRef.current?.abort()
      abortRef.current = null
      lookupAbortRef.current?.abort()
      lookupAbortRef.current = null
      senseAbortRef.current?.abort()
      senseAbortRef.current = null
      analysisAbortRef.current?.abort()
      analysisAbortRef.current = null
      clearSenseTimer()
      stopDictionaryAudio()
      snapshotRef.current = null
      gate.cancelPending()
    }
  }, [clearSenseTimer, gate])

  const runTranslate = useCallback(async (current: Snapshot) => {
    const generation = current.generation
    if (snapshotRef.current !== current || generationRef.current !== generation) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const isCurrent = () => !controller.signal.aborted
      && generationRef.current === generation && abortRef.current === controller
    const cacheKeys = current.segments.map((segment) => translationCacheKey(current, segment))
    const items: PaperTranslationResultItem[] = current.segments.map((segment, segmentIndex) => {
      const cached = pageCacheRef.current.get<PaperTranslationResultItem>(cacheKeys[segmentIndex])
      return cached?.status === 'ok'
        ? { ...cached, segmentIndex, selectedText: segment.selectedText }
        : { segmentIndex, status: 'error', selectedText: segment.selectedText, retryable: true }
    })
    const pending = items.filter((item) => item.status !== 'ok').map((item) => item.segmentIndex)
    const finish = () => {
      if (!isCurrent()) return
      const ok = items.filter((item) => item.status === 'ok')
      const failed = items.filter((item) => item.status === 'error')
      setResults(items.slice())
      setTranslation(ok.map((item) => item.translation).join('\n'))
      setTaskMode(ok.some((item) => item.taskMode === 'selected-text') ? 'selected-text' : 'contextual-fragment')
      setErrorMessage(failed[0]?.message || '')
      setPhase(ok.length > 0 ? 'result' : 'error')
      setLiveMessage(failed.length === 0 ? '翻译完成' : (ok.length > 0 ? '部分翻译完成' : '翻译失败'))
    }
    if (pending.length === 0) {
      finish()
      abortRef.current = null
      return
    }
    setResults(items.filter((item) => item.status === 'ok'))
    setPhase('loading')
    setLiveMessage('正在翻译')
    try {
      const response = await requestPaperTranslation({
        paperId: current.paperId,
        sourceRevision: current.sourceRevision,
        segments: pending.map((index) => current.segments[index]),
      }, fetch, controller.signal)
      if (!isCurrent()) return
      if (response.sourceRevision !== current.sourceRevision || !Array.isArray(response.results)) {
        throw new Error('试卷来源或翻译响应已变化，请重新选择后再翻译')
      }
      for (const [requestIndex, segmentIndex] of pending.entries()) {
        const matches = response.results.filter((item) => item.segmentIndex === requestIndex)
        const item = matches.length === 1 ? matches[0] : undefined
        const valid = item?.status === 'ok' && typeof item.translation === 'string' && item.translation.trim() !== ''
        items[segmentIndex] = valid ? {
          ...item,
          status: 'ok',
          segmentIndex,
          selectedText: current.segments[segmentIndex].selectedText,
        } : {
          segmentIndex,
          status: 'error',
          selectedText: current.segments[segmentIndex].selectedText,
          code: item?.code || 'TRANSLATION_INCOMPLETE',
          message: item?.message || '这段文字暂时未能正确翻译，请重试或重新选择',
          retryable: item?.retryable ?? true,
        }
        if (valid && response.promptVersion === current.promptVersion) {
          pageCacheRef.current.set(cacheKeys[segmentIndex], items[segmentIndex])
        }
      }
      finish()
    } catch (error) {
      if (!isCurrent()) return
      for (const segmentIndex of pending) {
        items[segmentIndex] = {
          ...items[segmentIndex],
          status: 'error',
          message: teacherFacingError(error),
          retryable: true,
        }
      }
      finish()
    } finally {
      if (abortRef.current === controller) abortRef.current = null
    }
  }, [])

  const runLookup = useCallback(async (current: Snapshot) => {
    const generation = current.generation
    lookupAbortRef.current?.abort()
    const controller = new AbortController()
    lookupAbortRef.current = controller
    const segment = current.segments[0]
    const isCurrent = () => !controller.signal.aborted && generationRef.current === generation
    const cacheKey = JSON.stringify({
      kind: 'dictionary',
      version: dictionaryStatus?.dictionaryVersion || '',
      paperId: current.paperId,
      sourceRevision: current.sourceRevision,
      segment,
    })
    const announce = (message: string) => {
      if (snapshotRef.current?.action === 'dictionary') setLiveMessage(message)
    }
    const cached = pageCacheRef.current.get<PaperDictionaryResponse>(cacheKey)
    if (cached?.selectedText === segment?.selectedText) {
      if (!isCurrent()) return
      setDictionaryResult(cached)
      setLookupError('')
      setLookupState('ready')
      announce(cached.status === 'not-found' ? '词典未收录这个词' : '词典已打开')
      return
    }
    setLookupState('loading')
    setLookupError('')
    setDictionaryResult(null)
    try {
      const response = await requestPaperDictionaryLookup({
        paperId: current.paperId,
        sourceRevision: current.sourceRevision,
        segments: current.segments,
      }, fetch, controller.signal)
      if (!isCurrent()) return
      if (response.selectedText !== segment.selectedText || response.sourceRevision !== current.sourceRevision) {
        throw new Error('试卷来源已更新，请重新选择')
      }
      pageCacheRef.current.set(cacheKey, response)
      setDictionaryResult(response)
      setLookupState('ready')
      announce(response.status === 'not-found' ? '词典未收录这个词' : '词典已打开')
    } catch (error) {
      if (!isCurrent()) return
      const message = teacherFacingError(error)
      if (!message) return
      setLookupState('ready')
      setLookupError(message === '这段文字暂时未能正确翻译，请重试或重新选择' ? '词典暂时无法查询' : message)
    } finally {
      if (lookupAbortRef.current === controller) lookupAbortRef.current = null
    }
  }, [dictionaryStatus?.dictionaryVersion])

  const runSense = useCallback(async (current: Snapshot, entry?: OtterEntry | null) => {
    if (!dictionaryStatus?.sensePick?.enabled) {
      setSense({ status: 'unavailable', message: '本文义暂不可用' })
      return
    }
    const generation = current.generation
    senseAbortRef.current?.abort()
    const controller = new AbortController()
    senseAbortRef.current = controller
    const segment = current.segments[0]
    const isCurrent = () => !controller.signal.aborted && generationRef.current === generation
    if (!segment) return
    const cacheKey = JSON.stringify({
      kind: 'sense',
      version: dictionaryStatus.dictionaryVersion || '',
      paperId: current.paperId,
      sourceRevision: current.sourceRevision,
      segment,
      otter: entry ? [entry.entryId, entry.version] : undefined,
    })
    const cached = pageCacheRef.current.get<SelectionSenseState>(cacheKey)
    if (cached?.status === 'ok' || cached?.status === 'unavailable' || cached?.status === 'otter') {
      if (!isCurrent()) return
      setSense(cached)
      return
    }
    setSense({ status: 'loading' })
    try {
      const response = await requestPaperDictionarySense({
        paperId: current.paperId,
        sourceRevision: current.sourceRevision,
        segments: [segment],
      }, fetch, controller.signal)
      if (!isCurrent()) return
      if (response.selectedText !== segment.selectedText || response.sourceRevision !== current.sourceRevision) {
        throw new Error('试卷来源已更新，请重新选择')
      }
      if (entry) {
        const picked = entry.senses.find(item => item.senseId === response.otterSenseId)
        if (response.status === 'ok' && picked) {
          const next = { status: 'otter', senseId: picked.senseId } as const
          pageCacheRef.current.set(cacheKey, next)
          setSense(next)
        }
        return
      }
      let next: DictionarySenseState
      if (response.status === 'ok' && response.phrase) {
        next = { status: 'ok', text: `${response.phrase.text}：${response.phrase.gloss}`, matchKey: null }
      } else if (response.status === 'ok' && response.match) {
        const { entryId, posGroupIndex, senseId } = response.match
        next = { status: 'ok', text: response.match.gloss, matchKey: `${entryId}\n${posGroupIndex}\n${senseId}` }
      } else {
        next = { status: 'unavailable', message: '这句话里的意思暂未能确定' }
      }
      pageCacheRef.current.set(cacheKey, next)
      setSense(next)
    } catch (error) {
      if (!isCurrent() || entry) return
      const code = (error as { code?: string }).code
      const message = teacherFacingError(error)
      if (!message) return
      if (code === 'SENSE_UNAVAILABLE' || code === 'not_authenticated') {
        setSense({ status: 'unavailable', message: code === 'not_authenticated' ? '请先登录后再查词' : message })
        return
      }
      setSense({ status: 'error', message })
    } finally {
      if (senseAbortRef.current === controller) senseAbortRef.current = null
    }
  }, [dictionaryStatus])

  const scheduleSense = useCallback((current: Snapshot, entry?: OtterEntry | null) => {
    clearSenseTimer()
    if (!dictionaryStatus?.sensePick?.enabled) return
    senseTimerRef.current = window.setTimeout(() => {
      senseTimerRef.current = null
      if (generationRef.current !== current.generation) return
      void runSense(current, entry)
    }, SENSE_DEBOUNCE_MS)
  }, [clearSenseTimer, dictionaryStatus, runSense])

  const updateFromSelection = useCallback(() => {
    const host = hostRef.current
    if (!host || !source) {
      if (phase !== 'idle') close()
      return
    }
    if (status === undefined) {
      void loadTranslationStatus().then((next) => {
        setStatus(next === 'unavailable' ? null : next)
      })
    }
    if (dictionaryStatus === undefined) {
      void loadDictionaryStatus().then((next) => {
        setDictionaryStatus(next === 'unavailable' ? null : next)
      })
    }
    const translationEnabled = Boolean(status && status.enabled)
    const dictionaryAvailable = Boolean(dictionaryStatus?.available)
    if (!SENTENCE_ANALYSIS_ENABLED && status === undefined && dictionaryStatus === undefined) return
    if (!SENTENCE_ANALYSIS_ENABLED && !translationEnabled && !dictionaryAvailable) {
      if (status === undefined || dictionaryStatus === undefined) return
      if (phase !== 'idle') close()
      return
    }
    const range = selectionRange()
    const overlay = document.querySelector('.paper-selection-overlay')
    if (range && overlay?.contains(range.commonAncestorContainer)) return
    if (range && dismissedRangeRef.current
      && dismissedRangeRef.current.startContainer === range.startContainer
      && dismissedRangeRef.current.startOffset === range.startOffset
      && dismissedRangeRef.current.endContainer === range.endContainer
      && dismissedRangeRef.current.endOffset === range.endOffset) {
      return
    }
    dismissedRangeRef.current = null
    if (!range || !host.contains(range.commonAncestorContainer)) {
      const focusInside = Boolean(overlay?.contains(document.activeElement))
      if (!pointerInsideRef.current && !focusInside && (phase === 'toolbar' || phase === 'lookup')) close()
      return
    }
    const mapped = mapDomRangeToSegments(range, source, host)
    if (!mapped) {
      if (phase !== 'idle') close()
      return
    }
    let segments = mapped
    let word = false
    if (mapped.length === 1) {
      const stream = source.streams.find((item) => item.streamId === mapped[0].streamId)
      const classified = stream
        ? classifyCompleteEnglishWord(stream.text, mapped[0].start, mapped[0].end)
        : null
      if (classified) {
        word = true
        segments = [{
          streamId: mapped[0].streamId,
          start: classified.start,
          end: classified.end,
          selectedText: classified.surface,
        }]
      }
    }
    const analysisEligible = SENTENCE_ANALYSIS_ENABLED && analysisButtonEligible(source, consumption, segments)
    const action = chooseAction({
      word,
      translationEnabled,
      dictionaryAvailable,
      analysisEligible,
    })
    if (action === 'lookup' && status === undefined) return
    if (action === 'none') {
      if (phase !== 'idle') close()
      return
    }
    const previous = snapshotRef.current
    const sameRange = Boolean(previous?.paperId === paperId && previous.sourceRevision === source.sourceRevision
      && previous.range.startContainer === range.startContainer && previous.range.startOffset === range.startOffset
      && previous.range.endContainer === range.endContainer && previous.range.endOffset === range.endOffset)
    const translationInFlight = phase === 'loading' || phase === 'result' || phase === 'error' || phase === 'dictionary' || phase === 'sentence-analysis'
    if (sameRange && previous && (previous.action === action || translationInFlight)) {
      pendingAnchorRef.current = null
      return
    }
    generationRef.current += 1
    abortRef.current?.abort()
    abortRef.current = null
    lookupAbortRef.current?.abort()
    lookupAbortRef.current = null
    senseAbortRef.current?.abort()
    senseAbortRef.current = null
    analysisAbortRef.current?.abort()
    analysisAbortRef.current = null
    clearSenseTimer()
    stopDictionaryAudio()
    const next: Snapshot = {
      generation: generationRef.current,
      action,
      range: range.cloneRange(),
      sourceRevision: source.sourceRevision,
      paperId,
      policyKey: status
        ? JSON.stringify([status.promptVersion, status.contextPolicy, status.sourceProjectionVersion])
        : '',
      promptVersion: status?.promptVersion || '',
      segments,
      anchor: pendingAnchorRef.current,
      word,
      analysisEligible,
      input: lastInputRef.current,
    }
    pendingAnchorRef.current = null
    snapshotRef.current = next
    setSnapshot(next)
    setResults([])
    setTranslation('')
    setErrorMessage('')
    setDictionaryResult(null)
    setFullEntryOpen(false)
    setRestoreQuickFocus(false)
    setLookupError('')
    setPlayErrorId('')
    resetCopy()
    if (action === 'toolbar') {
      setPhase('toolbar')
      setLiveMessage('已选中文字，可翻译')
      return
    }
    if (action === 'lookup') {
      setPhase('lookup')
      setLiveMessage('已选中单词，可查词')
      void runLookup(next)
      return
    }
  }, [clearSenseTimer, close, consumption, dictionaryStatus, hostRef, paperId, phase, runLookup, source, status, resetCopy])

  const shownSense = useMemo<DictionarySenseState>(() => {
    if (dictionaryStatus === undefined || sense.status === 'otter') return { status: 'loading' }
    if (!dictionaryStatus?.sensePick?.enabled) return { status: 'unavailable', message: '本文义暂不可用' }
    return sense
  }, [dictionaryStatus, sense])

  // Re-read the live DOM selection once the policies arrive, as if a selectionchange had fired.
  const refreshFromSelection = useEffectEvent(() => updateFromSelection())
  useEffect(() => {
    if (!SENTENCE_ANALYSIS_ENABLED && status === undefined && dictionaryStatus === undefined) return undefined
    let live = true
    queueMicrotask(() => {
      if (live) refreshFromSelection()
    })
    return () => {
      live = false
    }
  }, [dictionaryStatus, status])

  useEffect(() => {
    if (phase !== 'dictionary' || !snapshot || !dictionaryResult || dictionaryResult.otterSenseId
      || dictionaryResult.status === 'not-found') return undefined
    scheduleSense(snapshot, dictionaryResult.otter)
    return () => clearSenseTimer()
  }, [clearSenseTimer, dictionaryResult, phase, scheduleSense, snapshot])

  useEffect(() => {
    function onSelectionChange() {
      gate.selectionChanged()
      if (pointerSelectingRef.current) return
      dismissedRangeRef.current = null
      updateFromSelection()
    }
    document.addEventListener('selectionchange', onSelectionChange)
    return () => document.removeEventListener('selectionchange', onSelectionChange)
  }, [gate, updateFromSelection])

  useEffect(() => {
    const host = hostRef.current
    const onDown = (event: PointerEvent) => {
      lastInputRef.current = 'pointer'
      pointerKindRef.current = event.pointerType || 'mouse'
      gate.pointerDown(event)
      if (event.button === 0) pointerSelectingRef.current = true
    }
    const finishSelecting = (event: PointerEvent) => {
      if (!pointerSelectingRef.current) return
      pointerSelectingRef.current = false
      pendingAnchorRef.current = { x: event.clientX, y: event.clientY }
      dismissedRangeRef.current = null
      updateFromSelection()
    }
    const onMove = (event: PointerEvent) => gate.pointerMove(event)
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (document.querySelector('[role="menu"].otter-menu')) return
        if (fullEntryOpen) {
          event.stopPropagation()
          setFullEntryOpen(false)
          setRestoreQuickFocus(true)
          return
        }
        if (phaseRef.current === 'sentence-analysis' && analysisEscapeRef.current?.()) {
          event.preventDefault()
          event.stopPropagation()
          return
        }
        const current = snapshotRef.current
        if (phaseRef.current === 'dictionary' && current) {
          event.stopPropagation()
          const lookup = { ...current, action: 'lookup' as const, input: 'keyboard' as const }
          snapshotRef.current = lookup
          setSnapshot(lookup)
          setPhase('lookup')
          stopDictionaryAudio()
          return
        }
        dismissSelection()
      }
      if (
        event.key === 'Enter'
        || event.key === ' '
        || event.key === 'Shift'
        || event.key.startsWith('Arrow')
        || event.key === 'Home'
        || event.key === 'End'
      ) {
        lastInputRef.current = 'keyboard'
      }
    }
    host?.addEventListener('pointerdown', onDown, true)
    host?.addEventListener('pointermove', onMove, true)
    window.addEventListener('pointerup', finishSelecting, true)
    window.addEventListener('pointercancel', finishSelecting, true)
    window.addEventListener('keydown', onKey, true)
    return () => {
      host?.removeEventListener('pointerdown', onDown, true)
      host?.removeEventListener('pointermove', onMove, true)
      window.removeEventListener('pointerup', finishSelecting, true)
      window.removeEventListener('pointercancel', finishSelecting, true)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [dismissSelection, fullEntryOpen, gate, hostRef, paperId, source?.sourceRevision, updateFromSelection])

  useEffect(() => {
    const host = hostRef.current
    if (!host || phase === 'idle' || fullEntryOpen) return undefined
    const anchorRange = () => (phase === 'sentence-analysis' && analysisRange) || snapshot?.range || null
    const onScroll = () => {
      const range = anchorRange()
      if (!range) return
      if (!range.startContainer.isConnected || !range.endContainer.isConnected) {
        dismissSelection()
        return
      }
      const rects = range.getClientRects()
      if (rects.length === 0) {
        dismissSelection()
        return
      }
      const box = range.getBoundingClientRect()
      if (box.bottom < -200 || box.top > window.innerHeight + 200) dismissSelection()
    }
    const onResize = () => {
      const range = anchorRange()
      if (!range || range.getClientRects().length === 0) dismissSelection()
    }
    const onPointerDown = (event: PointerEvent) => {
      const overlay = document.querySelector('.paper-selection-overlay')
      if (event.target instanceof Element && (overlay?.contains(event.target) || event.target.closest('.otter-menu'))) return
      dismissSelection()
    }
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    window.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [analysisRange, dismissSelection, fullEntryOpen, hostRef, phase, snapshot])

  const openLookup = useCallback(() => {
    const current = snapshotRef.current
    if (!current) return
    const opened = { ...current, action: 'dictionary' as const }
    snapshotRef.current = opened
    setSnapshot(opened)
    setPhase('dictionary')
    setSense({ status: 'loading' })
    if (lookupAbortRef.current || dictionaryResult || lookupError) {
      setLiveMessage(lookupError ? '查词失败' : (dictionaryResult ? '词典已打开' : '正在查词'))
      return
    }
    setLookupState('loading')
    setLiveMessage('正在查词')
    void runLookup(opened)
  }, [dictionaryResult, lookupError, runLookup])

  const openSentenceAnalysis = useCallback(() => {
    const current = snapshotRef.current
    if (!current || !source) return
    const generation = generationRef.current + 1
    generationRef.current = generation
    analysisAbortRef.current?.abort()
    const resolved = resolveTarget(source, consumption, current.segments)
    setPhase('sentence-analysis')
    setAnalysisError('')
    if (!resolved.ok) {
      setAnalysisRange(null)
      setAnalysisState('rejected')
      setAnalysisReject(resolved.reason === 'too-long' ? 'too-long' : 'cross-sentence')
      setAnalysisResult(null)
      setAnalysisTarget(null)
      setAnalysisExpanded(false)
      setLiveMessage(resolved.reason === 'too-long' ? '句子过长，暂不分析' : '请只选一句')
      return
    }
    const host = hostRef.current
    setAnalysisRange(host
      ? streamRangeToDomRange(source, host, resolved.target.streamId, resolved.target.start, resolved.target.end)
      : null)
    setAnalysisTarget(resolved.target)
    setAnalysisExpanded(resolved.expanded)
    setAnalysisState('loading')
    setAnalysisResult(null)
    setLiveMessage('分析中')
    const controller = new AbortController()
    analysisAbortRef.current = controller
    void sentenceAnalysisProvider.analyze(resolved.target, { signal: controller.signal }).then((result) => {
      if (generationRef.current !== generation || controller.signal.aborted) return
      const validated = validateSentenceAnalysis(result)
      if (!validated.ok) {
        setAnalysisState('invalid')
        setLiveMessage('分析数据无效')
        return
      }
      const value = validated.value
      const same = value.source.paperId === resolved.target.paperId
        && value.source.streamId === resolved.target.streamId
        && value.source.start === resolved.target.start
        && value.source.end === resolved.target.end
        && value.source.sentenceText === resolved.target.sentenceText
      if (!same) {
        setAnalysisState('invalid')
        setLiveMessage('分析数据无效')
        return
      }
      setAnalysisResult(value)
      if (value.status === 'unavailable') {
        setAnalysisState('unavailable')
        setLiveMessage(value.unavailableReason || '该句暂无分析数据')
      } else if (value.status === 'partial') {
        setAnalysisState('partial')
        setLiveMessage('部分结构未能分析')
      } else {
        setAnalysisState('ok')
        setLiveMessage('句子分析已打开')
      }
    }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === 'AbortError') return
      if (generationRef.current !== generation) return
      setAnalysisState('error')
      setAnalysisError(error instanceof SentenceAnalysisRequestError ? error.message : '分析失败：模拟数据加载出错。点重试再试一次')
      setLiveMessage('分析失败')
    })
  }, [consumption, hostRef, source])

  const otter = dictionaryResult?.otter
  const otterSenseId = dictionaryResult?.otterSenseId ?? (sense.status === 'otter' ? sense.senseId : null)
  const surface = snapshot?.segments[0]?.selectedText ?? ''
  const fallback = !otter && dictionaryResult?.entries.length ? dictionaryResult : null
  const openFullEntry = () => {
    if (!otter || !snapshot) return
    if (window.matchMedia('(width > 980px)').matches) {
      setRestoreQuickFocus(false)
      setFullEntryOpen(true)
      return
    }
    const sourceUrl = new URL(window.location.href)
    const segment = snapshot.segments[0]
    const stream = source?.streams.find(item => item.streamId === segment?.streamId)
    const leaf = stream?.leaves.find(item => item.start <= segment.start && item.end >= segment.end)
    if (stream?.groupId) sourceUrl.searchParams.set('focusGroupId', stream.groupId)
    if (leaf?.kind === 'paragraph') sourceUrl.searchParams.set('focusParagraphId', leaf.id)
    window.history.replaceState(window.history.state, '', sourceUrl)
    sourceUrl.searchParams.set('view', 'word')
    sourceUrl.searchParams.set('w', otter.headword)
    if (otterSenseId) sourceUrl.searchParams.set('wordSense', otterSenseId)
    window.history.pushState({ otterFromSelection: true }, '', sourceUrl)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }
  const notebook = snapshot?.segments.length === 1 ? (
    <NotebookAddButton paperId={snapshot.paperId} sourceRevision={snapshot.sourceRevision} segment={snapshot.segments[0]} />
  ) : null
  const overlay = !fullEntryOpen && snapshot && phase !== 'idle' && (
    phase === 'dictionary' || phase === 'lookup' || phase === 'sentence-analysis' || status?.enabled
    || (phase === 'toolbar' && snapshot.analysisEligible)
  )
    ? createPortal(
      <SelectionOverlay
        phase={phase}
        range={(phase === 'sentence-analysis' && analysisRange) || snapshot.range}
        anchor={snapshot.anchor}
        taskMode={taskMode}
        translation={translation}
        results={results}
        errorMessage={errorMessage}
        liveMessage={liveMessage}
        focusLookup={snapshot.input === 'keyboard'}
        onTranslate={() => {
          void runTranslate(snapshot)
        }}
        onLookup={openLookup}
        showTranslate={Boolean(status?.enabled)}
        showAnalyze={SENTENCE_ANALYSIS_ENABLED && snapshot.analysisEligible && (phase === 'toolbar' || phase === 'lookup')}
        analyzeLabel={snapshot.word ? '分析所在句' : '分析此句'}
        onAnalyze={openSentenceAnalysis}
        analysis={phase === 'sentence-analysis' ? (
          <SentenceAnalysisCard
            key={`${analysisTarget?.sentenceText || 'selection'}:${analysisState}`}
            status={analysisState}
            analysis={analysisResult}
            sentenceText={analysisTarget?.sentenceText || ''}
            expanded={analysisExpanded}
            rejectReason={analysisReject}
            errorMessage={analysisError}
            onRetry={openSentenceAnalysis}
            onClose={dismissSelection}
            onAnnounce={setLiveMessage}
            bindEscapeRef={analysisEscapeRef}
            textSize={paperTextSize(analysisRange || snapshot.range)}
          />
        ) : null}
        onRetry={() => {
          void runTranslate(snapshot)
        }}
        onClose={dismissSelection}
        onPointerInsideChange={(inside) => {
          pointerInsideRef.current = inside
        }}
        dictionary={phase === 'dictionary' ? (
          <DictionaryEntry
            density="quick" entry={otter} senseId={otterSenseId} onClose={dismissSelection}
            surface={fallback?.entries.length === 1 ? fallback.entries[0].headword : surface}
            pending={lookupState === 'loading'}
            notice={<>
              {lookupError && <Notice kind="error" action={{ label: '重试', onClick: () => { void runLookup(snapshot) } }}>{lookupError}</Notice>}
              {dictionaryResult?.status === 'not-found' && <Notice kind="info">该词暂未加入</Notice>}
              {copyError && <Notice kind="error">{copyError}</Notice>}
            </>}
            fallback={fallback && (
              <DictionaryFallback surface={surface} result={fallback} playErrorId={playErrorId} sense={shownSense}
                onRetrySense={() => { void runSense(snapshot) }} onPlayError={setPlayErrorId} />
            )}
            actions={otter ? <>
              <Button size="sm" tone="strong" autoFocus={restoreQuickFocus || snapshot.input === 'keyboard'} onClick={openFullEntry}>完整词条</Button>
              {notebook}
            </> : notebook}
            menu={<Menu label="更多查词操作" className="otter-menu" triggerSize="sm" items={[
              ...(SENTENCE_ANALYSIS_ENABLED && snapshot.analysisEligible
                ? [{ key: 'analyze', label: '分析所在句', onSelect: openSentenceAnalysis, restoreFocus: false }] : []),
              { key: 'copy', label: copied ? '已复制词条' : '复制词条', disabled: copyState === 'pending', onSelect: () => {
                if (!otter) {
                  void copy(dictionaryCopyText(surface, dictionaryResult, shownSense))
                  return
                }
                const match = otter.senses.find(item => item.senseId === otterSenseId)
                void copy([otter.headword, match && `本文义 ${match.pos} ${match.glossZh}`].filter(Boolean).join('\n'))
              } },
            ]} />}
          />
        ) : null}
      />,
      document.body,
    )
    : null

  return {
    overlay,
    dictionaryPanel: fullEntryOpen && otter ? (
      <aside className="paper-browse-lecture-panel otter-panel" aria-label="完整词条">
        <DictionaryEntry density="full" entry={otter} senseId={otterSenseId} onClose={() => {
          setRestoreQuickFocus(true)
          setFullEntryOpen(false)
        }} />
      </aside>
    ) : null,
    closeDictionaryPanel: () => dismissSelection(),
    lectureFocusGate: gate,
    lastInputSource,
    enabled: Boolean(status && status.enabled),
  }
}
