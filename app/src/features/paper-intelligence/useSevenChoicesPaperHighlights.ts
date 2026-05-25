import { useEffect, useState, type RefObject } from 'react'
import type { PaperTextRange } from '../../../../shared/papersurface/types'
import type { SevenChoicesChainView } from './sevenChoicesSurfaceAdapter.ts'

export type SevenChoicesBlankOverlayLabel = {
  questionId: string
  questionNo: string
  answerLabel: string
  colorIndex: number
  left: number
  top: number
}

export type SevenChoicesClueOverlayMark = {
  id: string
  questionId: string
  kind: 'signal' | 'topic' | 'context'
  colorIndex: number
  left: number
  top: number
  width: number
  height: number
}

export type SevenChoicesOverlayState = {
  labels: SevenChoicesBlankOverlayLabel[]
  marks: SevenChoicesClueOverlayMark[]
}

export function useSevenChoicesPaperHighlights(args: {
  enabled: boolean
  leftScrollerRef: RefObject<HTMLDivElement | null>
  openQuestionIds: string[]
  chains: SevenChoicesChainView[]
}): SevenChoicesOverlayState {
  const { enabled, leftScrollerRef, openQuestionIds, chains } = args
  const [overlay, setOverlay] = useState<SevenChoicesOverlayState>({
    labels: [],
    marks: [],
  })

  useEffect(() => {
    if (!enabled) {
      return
    }

    let frame = 0
    const update = (): void => {
      const scroller = leftScrollerRef.current
      if (!scroller) {
        setOverlay({ labels: [], marks: [] })
        return
      }

      const nextLabels: SevenChoicesBlankOverlayLabel[] = []
      const nextMarks: SevenChoicesClueOverlayMark[] = []
      const openSet = new Set(openQuestionIds)
      const openChains = chains.filter((chain) => openSet.has(chain.questionId))
      const scrollerRect = scroller.getBoundingClientRect()

      for (const chain of openChains) {
        for (const item of chain.leftHighlights) {
          const domRange = createDomRange(scroller, item.range)
          if (!domRange) continue
          const rects = Array.from(domRange.getClientRects())
          rects.forEach((rect, rectIndex) => {
            if (rect.width <= 0 || rect.height <= 0) return
            nextMarks.push({
              id: `${item.id}-${rectIndex}`,
              questionId: chain.questionId,
              kind: item.kind,
              colorIndex: chain.colorIndex,
              left: rect.left - scrollerRect.left + scroller.scrollLeft,
              top: rect.top - scrollerRect.top + scroller.scrollTop,
              width: rect.width,
              height: rect.height,
            })
          })
          domRange.detach()
        }

        if (chain.blankRange) {
          const blankDomRange = createDomRange(scroller, chain.blankRange.range)
          const rect = blankDomRange?.getBoundingClientRect()
          if (rect && rect.width > 0 && rect.height > 0) {
            nextLabels.push({
              questionId: chain.questionId,
              questionNo: chain.questionNo,
              answerLabel: chain.correctOptionLabel,
              colorIndex: chain.colorIndex,
              left: rect.left - scrollerRect.left + scroller.scrollLeft - 4,
              top: rect.top - scrollerRect.top + scroller.scrollTop - 3,
            })
          }
          blankDomRange?.detach()
        }
      }
      setOverlay({ labels: nextLabels, marks: nextMarks })
    }

    const schedule = (): void => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(update)
    }
    schedule()
    const scroller = leftScrollerRef.current
    scroller?.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return (): void => {
      cancelAnimationFrame(frame)
      scroller?.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
    }
  }, [enabled, leftScrollerRef, openQuestionIds, chains])

  return overlay
}

function createDomRange(
  scroller: HTMLElement,
  range: PaperTextRange,
): Range | null {
  const sentenceEl = scroller.querySelector<HTMLElement>(
    `[data-paper-sentence-id="${cssAttr(range.sentenceId)}"]`,
  )
  if (!sentenceEl) return null
  return createRangeFromTextOffsets(sentenceEl, range.start, range.end)
}

function createRangeFromTextOffsets(
  root: HTMLElement,
  start: number,
  end: number,
): Range | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let consumed = 0
  let startNode: Text | null = null
  let endNode: Text | null = null
  let startOffset = 0
  let endOffset = 0

  while (walker.nextNode()) {
    const node = walker.currentNode as Text
    const nodeLength = node.data.length
    const nodeStart = consumed
    const nodeEnd = consumed + nodeLength
    if (!startNode && start >= nodeStart && start <= nodeEnd) {
      startNode = node
      startOffset = Math.max(0, Math.min(nodeLength, start - nodeStart))
    }
    if (endNode === null && end >= nodeStart && end <= nodeEnd) {
      endNode = node
      endOffset = Math.max(0, Math.min(nodeLength, end - nodeStart))
      break
    }
    consumed = nodeEnd
  }

  if (!startNode || !endNode) return null
  const domRange = document.createRange()
  domRange.setStart(startNode, startOffset)
  domRange.setEnd(endNode, endOffset)
  return domRange
}

function cssAttr(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value)
  }
  return value.replace(/[^a-zA-Z0-9_-]/g, '\\$&')
}
