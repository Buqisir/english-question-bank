import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { createLectureFocusGate } from '../../../../../shared/paper-selection/lectureFocusGate.mjs'
import { buildSelectionSourceFromConsumption } from '../../../../../shared/paper-selection/sourceProjection.mjs'
import type { WholePaperConsumption } from '../../paper-intelligence/canonicalConsumptionClient.ts'
import {
  fetchPaperTranslationStatus,
  requestPaperTranslation,
  type PaperTranslationStatus,
  type PaperTranslationResultItem,
} from '../../../services/paperTranslation.ts'
import { createPageTranslationCache } from './pageCache'
import { mapDomRangeToSegments, selectionRange } from './mapDomSelection'
import { SelectionOverlay, type SelectionOverlayPhase } from './SelectionOverlay'
import './selectionOverlay.css'

let statusCache: PaperTranslationStatus | 'unavailable' | null = null
let statusInflight: Promise<PaperTranslationStatus | 'unavailable'> | null = null

function loadTranslationStatus() {
  if (statusCache) return Promise.resolve(statusCache)
  if (statusInflight) return statusInflight
  statusInflight = fetchPaperTranslationStatus()
    .then((status) => {
      statusCache = status
      return status
    })
    .catch(() => {
      statusCache = 'unavailable'
      return 'unavailable' as const
    })
    .finally(() => {
      statusInflight = null
    })
  return statusInflight
}

type Snapshot = {
  generation: number
  range: Range
  sourceRevision: string
  paperId: string
  policyKey: string
  promptVersion: string
  segments: Array<{ streamId: string; start: number; end: number; selectedText: string }>
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
  const [phase, setPhase] = useState<SelectionOverlayPhase | 'idle' | 'selecting'>('idle')
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [translation, setTranslation] = useState('')
  const [results, setResults] = useState<PaperTranslationResultItem[]>([])
  const [taskMode, setTaskMode] = useState<'contextual-fragment' | 'selected-text'>('contextual-fragment')
  const [errorMessage, setErrorMessage] = useState('')
  const [liveMessage, setLiveMessage] = useState('')
  const generationRef = useRef(0)
  const snapshotRef = useRef<Snapshot | null>(null)
  const bootstrappedStatusRef = useRef<PaperTranslationStatus | null | undefined>(undefined)
  const abortRef = useRef<AbortController | null>(null)
  const pointerInsideRef = useRef(false)
  const lastInputRef = useRef<'pointer' | 'keyboard'>('pointer')
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

  const close = useCallback(() => {
    generationRef.current += 1
    abortRef.current?.abort()
    abortRef.current = null
    snapshotRef.current = null
    pointerInsideRef.current = false
    gateRef.current.cancelPending()
    setResults([])
    setPhase('idle')
    setSnapshot(null)
    setTranslation('')
    setErrorMessage('')
    setLiveMessage('')
  }, [])

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
      snapshotRef.current = null
      gate.cancelPending()
    }
  }, [])

  const updateFromSelection = useCallback(() => {
    const host = hostRef.current
    if (!host || !source) {
      if (phase !== 'idle') {
        close()
      }
      return
    }
    if (status === undefined) {
      if (!selectionRange()) return
      void loadTranslationStatus().then((next) => {
        setStatus(next === 'unavailable' ? null : next)
      })
      return
    }
    if (status === null || !status.enabled) {
      if (phase !== 'idle') {
        close()
      }
      return
    }
    const range = selectionRange()
    const overlay = document.querySelector('.paper-selection-overlay')
    // Copying the result or moving focus to its button must not replace the snapshot.
    if (range && overlay?.contains(range.commonAncestorContainer)) return
    if (!range || !host.contains(range.commonAncestorContainer)) {
      const focusInside = Boolean(overlay?.contains(document.activeElement))
      if (!pointerInsideRef.current && !focusInside && (phase === 'toolbar' || phase === 'selecting')) close()
      return
    }
    const segments = mapDomRangeToSegments(range, source, host)
    if (!segments) {
      if (phase !== 'idle') close()
      return
    }
    const previous = snapshotRef.current
    if (previous?.paperId === paperId && previous.sourceRevision === source.sourceRevision
      && previous.range.startContainer === range.startContainer && previous.range.startOffset === range.startOffset
      && previous.range.endContainer === range.endContainer && previous.range.endOffset === range.endOffset) return
    generationRef.current += 1
    abortRef.current?.abort()
    abortRef.current = null
    const next: Snapshot = {
      generation: generationRef.current,
      range: range.cloneRange(),
      sourceRevision: source.sourceRevision,
      paperId,
      policyKey: JSON.stringify([status.promptVersion, status.contextPolicy, status.sourceProjectionVersion]),
      promptVersion: status.promptVersion,
      segments,
    }
    snapshotRef.current = next
    setSnapshot(next)
    setResults([])
    setPhase('toolbar')
    setTranslation('')
    setErrorMessage('')
    setLiveMessage('已选中文字，可翻译')
  }, [close, hostRef, paperId, phase, source, status])

  useEffect(() => {
    if (bootstrappedStatusRef.current === status) return
    bootstrappedStatusRef.current = status
    if (status?.enabled) updateFromSelection()
  }, [status, updateFromSelection])

  useEffect(() => {
    function onSelectionChange() {
      gateRef.current.selectionChanged()
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
      gate.pointerDown(event)
    }
    const onMove = (event: PointerEvent) => gate.pointerMove(event)
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
      if (event.key === 'Enter' || event.key === ' ') lastInputRef.current = 'keyboard'
    }
    host?.addEventListener('pointerdown', onDown, true)
    host?.addEventListener('pointermove', onMove, true)
    window.addEventListener('keydown', onKey, true)
    return () => {
      host?.removeEventListener('pointerdown', onDown, true)
      host?.removeEventListener('pointermove', onMove, true)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [close, hostRef, paperId, source?.sourceRevision])

  useEffect(() => {
    const host = hostRef.current
    if (!host || phase === 'idle') return undefined
    const onScroll = (event: Event) => {
      const card = document.querySelector('.paper-selection-card')
      if (card && event.target instanceof Node && card.contains(event.target)) return
      close()
    }
    const onResize = () => {
      if (!snapshot?.range || snapshot.range.getClientRects().length === 0) close()
    }
    const onPointerDown = (event: PointerEvent) => {
      const overlay = document.querySelector('.paper-selection-overlay')
      if (overlay && event.target instanceof Node && overlay.contains(event.target)) return
      close()
    }
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    window.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [close, hostRef, phase, snapshot])

  const runTranslate = useCallback(async (current: Snapshot) => {
    const generation = current.generation
    if (snapshotRef.current !== current || generationRef.current !== generation) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const isCurrent = () => !controller.signal.aborted
      && generationRef.current === generation && abortRef.current === controller
    const cacheKeys = current.segments.map((segment) => JSON.stringify({
      paperId: current.paperId,
      sourceRevision: current.sourceRevision,
      policyKey: current.policyKey,
      segment,
    }))
    // Successful segments, not whole partial responses, are the page-cache unit.
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
          message: error instanceof Error ? error.message : '这段文字暂时未能正确翻译，请重试或重新选择',
          retryable: true,
        }
      }
      finish()
    } finally {
      if (abortRef.current === controller) abortRef.current = null
    }
  }, [])

  const overlay = status?.enabled && snapshot && phase !== 'idle' && phase !== 'selecting'
    ? createPortal(
      <SelectionOverlay
        phase={phase}
        range={snapshot.range}
        taskMode={taskMode}
        translation={translation}
        results={results}
        errorMessage={errorMessage}
        liveMessage={liveMessage}
        onTranslate={() => {
          void runTranslate(snapshot)
        }}
        onRetry={() => {
          void runTranslate(snapshot)
        }}
        onPointerInsideChange={(inside) => {
          pointerInsideRef.current = inside
        }}
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
