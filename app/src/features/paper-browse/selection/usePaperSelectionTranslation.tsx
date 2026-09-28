import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
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
  type PaperDictionaryResponse,
  type PaperDictionaryStatus,
} from '../../../services/paperDictionary.ts'
import {
  fetchPaperTranslationStatus,
  requestPaperTranslation,
  type PaperTranslationResultItem,
  type PaperTranslationStatus,
} from '../../../services/paperTranslation.ts'
import { DictionaryCard, dictionaryCopyText, type DictionarySenseState } from './DictionaryCard'
import { stopDictionaryAudio } from './dictionaryAudio'
import { createPageTranslationCache } from './pageCache'
import { mapDomRangeToSegments, selectionRange, type MappedSegment } from './mapDomSelection'
import { SelectionOverlay, type SelectionOverlayPhase } from './SelectionOverlay'
import { NotebookAddButton } from '../../vocabulary-notebook/NotebookAddButton.tsx'
import './selectionOverlay.css'

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

type SnapshotSegment = { streamId: string; start: number; end: number; selectedText: string }

type Snapshot = {
  generation: number
  action: SelectionAction
  range: Range
  // The selection as dragged, before a complete word is expanded for lookup.
  selectionSegments: SnapshotSegment[]
  sourceRevision: string
  paperId: string
  policyKey: string
  promptVersion: string
  segments: SnapshotSegment[]
  anchor: { x: number; y: number } | null
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
}: {
  word: boolean
  translationEnabled: boolean
  dictionaryAvailable: boolean
}): SelectionAction | 'none' {
  if (word && dictionaryAvailable) return 'lookup'
  if (translationEnabled) return 'toolbar'
  return 'none'
}

export type SelectionAnnotationActions = {
  enabled: boolean
  createMark: (type: 'highlight' | 'underline', segments: MappedSegment[], point: { x: number; y: number }) => void
  startNote: (segments: MappedSegment[]) => void
}

export function usePaperSelectionTranslation({
  paperId,
  consumption,
  hostRef,
  annotationActions,
}: {
  paperId: string
  consumption: WholePaperConsumption | null
  hostRef: { current: HTMLElement | null }
  annotationActions?: SelectionAnnotationActions | null
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
  const [sense, setSense] = useState<DictionarySenseState>({ status: 'loading' })
  const [playErrorId, setPlayErrorId] = useState('')
  const [copied, setCopied] = useState(false)
  const generationRef = useRef(0)
  const snapshotRef = useRef<Snapshot | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const lookupAbortRef = useRef<AbortController | null>(null)
  const senseAbortRef = useRef<AbortController | null>(null)
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

  const gateRef = useRef(createLectureFocusGate({
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

  const close = useCallback(() => {
    generationRef.current += 1
    abortRef.current?.abort()
    abortRef.current = null
    lookupAbortRef.current?.abort()
    lookupAbortRef.current = null
    senseAbortRef.current?.abort()
    senseAbortRef.current = null
    clearSenseTimer()
    stopDictionaryAudio()
    snapshotRef.current = null
    pointerInsideRef.current = false
    gateRef.current.cancelPending()
    setResults([])
    setPhase('idle')
    setSnapshot(null)
    setTranslation('')
    setErrorMessage('')
    setLiveMessage('')
    setDictionaryResult(null)
    setLookupError('')
    setPlayErrorId('')
    setCopied(false)
  }, [clearSenseTimer])

  const dismissSelection = useCallback(() => {
    const liveRange = selectionRange()
    dismissedRangeRef.current = liveRange ? liveRange.cloneRange() : null
    close()
  }, [close])

  useLayoutEffect(() => {
    pageCacheRef.current.clear()
    close()
  }, [close, paperId, source?.sourceRevision, status?.enabled, status?.promptVersion, status?.contextPolicy])

  useEffect(() => {
    const gate = gateRef.current
    return () => {
      generationRef.current += 1
      abortRef.current?.abort()
      abortRef.current = null
      lookupAbortRef.current?.abort()
      lookupAbortRef.current = null
      senseAbortRef.current?.abort()
      senseAbortRef.current = null
      clearSenseTimer()
      stopDictionaryAudio()
      snapshotRef.current = null
      gate.cancelPending()
    }
  }, [clearSenseTimer])

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

  const runSense = useCallback(async (current: Snapshot) => {
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
    })
    const cached = pageCacheRef.current.get<DictionarySenseState>(cacheKey)
    if (cached?.status === 'ok' || cached?.status === 'unavailable') {
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
      if (!isCurrent()) return
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

  const scheduleSense = useCallback((current: Snapshot) => {
    clearSenseTimer()
    if (dictionaryStatus === undefined) {
      setSense({ status: 'loading' })
      return
    }
    if (!dictionaryStatus?.sensePick?.enabled) {
      setSense({ status: 'unavailable', message: '本文义暂不可用' })
      return
    }
    setSense({ status: 'loading' })
    senseTimerRef.current = window.setTimeout(() => {
      senseTimerRef.current = null
      if (generationRef.current !== current.generation) return
      void runSense(current)
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
    const annotationsAvailable = Boolean(annotationActions?.enabled)
    if (!annotationsAvailable) {
      if (status === undefined && dictionaryStatus === undefined) return
      if (!translationEnabled && !dictionaryAvailable) {
        if (status === undefined || dictionaryStatus === undefined) return
        if (phase !== 'idle') close()
        return
      }
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
    let action = chooseAction({
      word,
      translationEnabled,
      dictionaryAvailable,
    })
    if (action === 'lookup' && status === undefined) return
    if (action === 'none') {
      // 高亮/下划线/批注 need no translation or dictionary status.
      if (!annotationsAvailable) {
        if (phase !== 'idle') close()
        return
      }
      action = 'toolbar'
    }
    const previous = snapshotRef.current
    const sameRange = Boolean(previous?.paperId === paperId && previous.sourceRevision === source.sourceRevision
      && previous.range.startContainer === range.startContainer && previous.range.startOffset === range.startOffset
      && previous.range.endContainer === range.endContainer && previous.range.endOffset === range.endOffset)
    const translationInFlight = phase === 'loading' || phase === 'result' || phase === 'error' || phase === 'dictionary'
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
    clearSenseTimer()
    stopDictionaryAudio()
    const next: Snapshot = {
      generation: generationRef.current,
      action,
      range: range.cloneRange(),
      selectionSegments: mapped,
      sourceRevision: source.sourceRevision,
      paperId,
      policyKey: status
        ? JSON.stringify([status.promptVersion, status.contextPolicy, status.sourceProjectionVersion])
        : '',
      promptVersion: status?.promptVersion || '',
      segments,
      anchor: pendingAnchorRef.current,
    }
    pendingAnchorRef.current = null
    snapshotRef.current = next
    setSnapshot(next)
    setResults([])
    setTranslation('')
    setErrorMessage('')
    setDictionaryResult(null)
    setLookupError('')
    setPlayErrorId('')
    setCopied(false)
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
  }, [annotationActions?.enabled, clearSenseTimer, close, dictionaryStatus, hostRef, paperId, phase, runLookup, source, status])

  const updateFromSelectionRef = useRef(updateFromSelection)
  updateFromSelectionRef.current = updateFromSelection
  const annotationsEnabled = Boolean(annotationActions?.enabled)
  useEffect(() => {
    if (status === undefined && dictionaryStatus === undefined && !annotationsEnabled) return
    updateFromSelectionRef.current()
  }, [annotationsEnabled, dictionaryStatus, status])

  useEffect(() => {
    if (phase !== 'dictionary' || !snapshot || snapshot.action !== 'dictionary') return undefined
    scheduleSense(snapshot)
    return () => clearSenseTimer()
  }, [clearSenseTimer, phase, scheduleSense, snapshot])

  useEffect(() => {
    function onSelectionChange() {
      gateRef.current.selectionChanged()
      if (pointerSelectingRef.current) return
      dismissedRangeRef.current = null
      updateFromSelection()
    }
    document.addEventListener('selectionchange', onSelectionChange)
    return () => document.removeEventListener('selectionchange', onSelectionChange)
  }, [updateFromSelection])

  useEffect(() => {
    const host = hostRef.current
    const gate = gateRef.current
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
      if (event.key === 'Escape') dismissSelection()
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
  }, [dismissSelection, hostRef, paperId, source?.sourceRevision, updateFromSelection])

  useEffect(() => {
    const host = hostRef.current
    if (!host || phase === 'idle') return undefined
    const onScroll = () => {
      if (!snapshot?.range) return
      if (!snapshot.range.startContainer.isConnected || !snapshot.range.endContainer.isConnected) {
        dismissSelection()
        return
      }
      const rects = snapshot.range.getClientRects()
      if (rects.length === 0) {
        dismissSelection()
        return
      }
      const box = snapshot.range.getBoundingClientRect()
      if (box.bottom < -200 || box.top > window.innerHeight + 200) dismissSelection()
    }
    const onResize = () => {
      if (!snapshot?.range || snapshot.range.getClientRects().length === 0) dismissSelection()
    }
    const onPointerDown = (event: PointerEvent) => {
      const overlay = document.querySelector('.paper-selection-overlay')
      if (overlay && event.target instanceof Node && overlay.contains(event.target)) return
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
  }, [dismissSelection, hostRef, phase, snapshot])

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

  const finishAnnotation = (run: (current: Snapshot, point: { x: number; y: number }) => void) => {
    const current = snapshotRef.current
    if (!current) return
    const rects = [...current.range.getClientRects()]
    const last = rects.at(-1) ?? current.range.getBoundingClientRect()
    run(current, { x: last.right, y: last.bottom })
    window.getSelection()?.removeAllRanges()
    close()
  }
  const overlay = snapshot && phase !== 'idle' && (
    phase === 'dictionary' || phase === 'lookup' || status?.enabled || annotationActions?.enabled
  )
    ? createPortal(
      <SelectionOverlay
        phase={phase}
        range={snapshot.range}
        anchor={snapshot.anchor}
        taskMode={taskMode}
        translation={translation}
        results={results}
        errorMessage={errorMessage}
        liveMessage={liveMessage}
        focusLookup={lastInputRef.current === 'keyboard'}
        onTranslate={() => {
          void runTranslate(snapshot)
        }}
        onLookup={openLookup}
        translateEnabled={Boolean(status && status.enabled)}
        annotationActions={annotationActions?.enabled ? {
          onHighlight: () => finishAnnotation((current, point) => annotationActions.createMark('highlight', current.selectionSegments, point)),
          onUnderline: () => finishAnnotation((current, point) => annotationActions.createMark('underline', current.selectionSegments, point)),
          onNote: () => finishAnnotation((current) => annotationActions.startNote(current.selectionSegments)),
        } : undefined}
        onRetry={() => {
          void runTranslate(snapshot)
        }}
        onClose={dismissSelection}
        onPointerInsideChange={(inside) => {
          pointerInsideRef.current = inside
        }}
        dictionary={phase === 'dictionary' ? (
          <DictionaryCard
            surface={snapshot.segments[0]?.selectedText || ''}
            lookup={lookupState}
            result={dictionaryResult}
            lookupError={lookupError}
            playErrorId={playErrorId}
            sense={sense}
            onRetrySense={() => {
              void runSense(snapshot)
            }}
            onPlayError={setPlayErrorId}
            copied={copied}
            onCopy={() => {
              const text = dictionaryCopyText(snapshot.segments[0]?.selectedText || '', dictionaryResult, sense)
              if (!text) return
              void navigator.clipboard.writeText(text).then(() => {
                setCopied(true)
                window.setTimeout(() => setCopied(false), 1800)
              })
            }}
            onClose={dismissSelection}
            notebook={snapshot.segments.length === 1 ? (
              <NotebookAddButton
                paperId={snapshot.paperId}
                sourceRevision={snapshot.sourceRevision}
                segment={snapshot.segments[0]}
              />
            ) : null}
          />
        ) : null}
      />,
      document.body,
    )
    : null

  return {
    overlay,
    lectureFocusGate: gateRef.current,
    lastInputSource: () => lastInputRef.current,
    enabled: Boolean(status && status.enabled),
  }
}
