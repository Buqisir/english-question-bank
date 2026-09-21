import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { createLectureFocusGate } from '../../../../../shared/paper-selection/lectureFocusGate.mjs'
import { buildSelectionSourceFromConsumption } from '../../../../../shared/paper-selection/sourceProjection.mjs'
import type { WholePaperConsumption } from '../../paper-intelligence/canonicalConsumptionClient.ts'
import {
  fetchPaperTranslationStatus,
  requestPaperTranslation,
  type PaperTranslationStatus,
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
  const [taskMode, setTaskMode] = useState<'contextual-fragment' | 'selected-text'>('contextual-fragment')
  const [errorMessage, setErrorMessage] = useState('')
  const [liveMessage, setLiveMessage] = useState('')
  const generationRef = useRef(0)
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

  useEffect(() => {
    pageCacheRef.current.clear()
    setPhase('idle')
    setSnapshot(null)
  }, [paperId, consumption?.publicationDigest, status?.enabled])

  const close = useCallback(() => {
    generationRef.current += 1
    abortRef.current?.abort()
    abortRef.current = null
    setPhase('idle')
    setSnapshot(null)
    setTranslation('')
    setErrorMessage('')
    setLiveMessage('')
  }, [])

  const updateFromSelection = useCallback(() => {
    const host = hostRef.current
    if (!host || !source) {
      if (phase !== 'idle' && phase !== 'loading' && phase !== 'result' && phase !== 'error') {
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
      if (phase !== 'idle' && phase !== 'loading' && phase !== 'result' && phase !== 'error') {
        close()
      }
      return
    }
    const range = selectionRange()
    if (!range || !host.contains(range.commonAncestorContainer)) {
      if (!pointerInsideRef.current && (phase === 'toolbar' || phase === 'selecting')) close()
      return
    }
    const segments = mapDomRangeToSegments(range, source, host)
    if (!segments) {
      if (phase === 'toolbar' || phase === 'selecting') close()
      return
    }
    generationRef.current += 1
    abortRef.current?.abort()
    abortRef.current = null
    setSnapshot({
      generation: generationRef.current,
      range: range.cloneRange(),
      sourceRevision: source.sourceRevision,
      paperId,
      segments,
    })
    setPhase('toolbar')
    setTranslation('')
    setErrorMessage('')
    setLiveMessage('已选中文字，可翻译')
  }, [close, hostRef, paperId, phase, source, status])

  useEffect(() => {
    if (status && status.enabled) updateFromSelection()
  }, [status])

  useEffect(() => {
    function onSelectionChange() {
      gateRef.current.selectionChanged()
      if (phase === 'loading' || phase === 'result' || phase === 'error') return
      updateFromSelection()
    }
    document.addEventListener('selectionchange', onSelectionChange)
    return () => document.removeEventListener('selectionchange', onSelectionChange)
  }, [phase, updateFromSelection])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return undefined
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
    host.addEventListener('pointerdown', onDown, true)
    host.addEventListener('pointermove', onMove, true)
    window.addEventListener('keydown', onKey, true)
    return () => {
      host.removeEventListener('pointerdown', onDown, true)
      host.removeEventListener('pointermove', onMove, true)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [close, hostRef, paperId])

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
      if (phase === 'toolbar') close()
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
    const cacheKey = JSON.stringify({
      paperId: current.paperId,
      sourceRevision: current.sourceRevision,
      segments: current.segments,
    })
    const cached = pageCacheRef.current.get<{
      translation: string
      taskMode: 'contextual-fragment' | 'selected-text'
    }>(cacheKey)
    if (cached) {
      if (generationRef.current !== generation) return
      setTranslation(cached.translation)
      setTaskMode(cached.taskMode)
      setPhase('result')
      setLiveMessage('翻译完成')
      return
    }
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setPhase('loading')
    setLiveMessage('正在翻译')
    try {
      const response = await requestPaperTranslation({
        paperId: current.paperId,
        sourceRevision: current.sourceRevision,
        segments: current.segments,
      }, fetch, controller.signal)
      if (generationRef.current !== generation) return
      const ok = response.results.filter((item) => item.status === 'ok')
      const firstError = response.results.find((item) => item.status === 'error')
      if (ok.length === 0) {
        setPhase('error')
        setErrorMessage(firstError?.message || '这段文字暂时未能正确翻译，请重试或重新选择')
        setLiveMessage('翻译失败')
        return
      }
      const text = ok.map((item) => item.translation).join('\n')
      const mode = ok.some((item) => item.taskMode === 'selected-text')
        ? 'selected-text'
        : 'contextual-fragment'
      pageCacheRef.current.set(cacheKey, { translation: text, taskMode: mode })
      setTranslation(text)
      setTaskMode(mode)
      setPhase(response.partial ? 'result' : 'result')
      setErrorMessage(response.partial ? (firstError?.message || '') : '')
      setLiveMessage(response.partial ? '部分翻译完成' : '翻译完成')
    } catch (error) {
      if (controller.signal.aborted || generationRef.current !== generation) return
      setPhase('error')
      setErrorMessage(error instanceof Error ? error.message : '这段文字暂时未能正确翻译，请重试或重新选择')
      setLiveMessage('翻译失败')
    }
  }, [])

  const overlay = status?.enabled && snapshot && phase !== 'idle' && phase !== 'selecting'
    ? createPortal(
      <SelectionOverlay
        phase={phase}
        range={snapshot.range}
        taskMode={taskMode}
        translation={translation}
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
