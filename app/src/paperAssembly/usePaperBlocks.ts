/**
 * usePaperBlocks — owns paper block state (PaperBlock[]) and selection / insertion UI state.
 *
 * Delegates structural list ops (rebuildBlocks, createLayoutFromItems, createBlockId) to
 * domain/paperLayout.ts. Does not own basket or export state. When a question_group block is
 * removed, calls onRemoveQuestionGroup so the caller can synchronize the basket.
 */

import { useCallback, useState } from 'react'
import type { BasketItem, PaperBlock } from '../domain/questionBank.ts'
import {
  createBlockId,
  createLayoutFromItems,
  rebuildBlocks,
} from '../domain/paperLayout.ts'

export type UsePaperBlocksInput = {
  /**
   * Called when the user removes a question_group block. The caller is expected to remove
   * the basket item, which in turn should call removeQuestionGroupBlock to drop the block.
   * The hook only handles section_header / page_break removal directly.
   */
  onRemoveQuestionGroup: (questionGroupId: string) => void
}

export type UsePaperBlocksResult = {
  paperBlocks: PaperBlock[]
  selectedPaperBlockId: string | null
  openInsertionIndex: number | null

  setSelectedPaperBlockId: (id: string | null) => void
  setOpenInsertionIndex: (index: number | null) => void

  // Block lifecycle
  resetBlocks: () => void
  setBlocks: (next: PaperBlock[]) => void
  rebuildFromBasket: (items: BasketItem[]) => void
  appendForNewItems: (items: BasketItem[]) => void

  // Question group sync (called by App when basket changes externally)
  removeQuestionGroupBlock: (questionGroupId: string) => string[] // returns removed block ids
  syncQuestionGroupOrder: (questionGroupId: string, direction: -1 | 1) => void
  syncQuestionGroupScore: (questionGroupId: string, score: number) => void

  // Block mutations
  removeBlock: (blockId: string) => void
  moveBlock: (blockId: string, direction: -1 | 1) => void
  updateSectionHeaderTitle: (blockId: string, title: string) => void
  insertBlockAt: (index: number, type: 'section_header' | 'page_break') => void
  insertSectionHeaderBefore: (blockId: string) => void
  insertPageBreakAfter: (blockId: string) => void
}

export function usePaperBlocks(input: UsePaperBlocksInput): UsePaperBlocksResult {
  const { onRemoveQuestionGroup } = input
  const [paperBlocks, setPaperBlocks] = useState<PaperBlock[]>([])
  const [selectedPaperBlockId, setSelectedPaperBlockId] = useState<string | null>(null)
  const [openInsertionIndex, setOpenInsertionIndex] = useState<number | null>(null)

  const resetBlocks = useCallback(() => {
    setPaperBlocks([])
    setOpenInsertionIndex(null)
    setSelectedPaperBlockId(null)
  }, [])

  const setBlocks = useCallback((next: PaperBlock[]) => {
    setPaperBlocks(next)
  }, [])

  const rebuildFromBasket = useCallback((items: BasketItem[]) => {
    setOpenInsertionIndex(null)
    setPaperBlocks((blocks) => rebuildBlocks(blocks, items))
  }, [])

  const appendForNewItems = useCallback((items: BasketItem[]) => {
    if (items.length === 0) return
    setPaperBlocks((blocks) => [...blocks, ...createLayoutFromItems(items)])
  }, [])

  const removeQuestionGroupBlock = useCallback((questionGroupId: string): string[] => {
    setOpenInsertionIndex(null)
    let removedIds: string[] = []
    setPaperBlocks((blocks) => {
      removedIds = blocks
        .filter((b) => b.type === 'question_group' && b.questionGroupId === questionGroupId)
        .map((b) => b.id)
      return blocks.filter((b) => !(b.type === 'question_group' && b.questionGroupId === questionGroupId))
    })
    setSelectedPaperBlockId((current) => (current && removedIds.includes(current) ? null : current))
    return removedIds
  }, [])

  const syncQuestionGroupOrder = useCallback((questionGroupId: string, direction: -1 | 1) => {
    setPaperBlocks((blocks) => {
      const blockIndex = blocks.findIndex(
        (b) => b.type === 'question_group' && b.questionGroupId === questionGroupId,
      )
      if (blockIndex < 0) return blocks
      let targetIndex = blockIndex + direction
      while (
        targetIndex >= 0 &&
        targetIndex < blocks.length &&
        blocks[targetIndex].type !== 'question_group'
      ) {
        targetIndex += direction
      }
      if (targetIndex < 0 || targetIndex >= blocks.length) return blocks
      const next = [...blocks]
      const [moved] = next.splice(blockIndex, 1)
      next.splice(targetIndex, 0, moved)
      return next
    })
  }, [])

  const syncQuestionGroupScore = useCallback((questionGroupId: string, score: number) => {
    setPaperBlocks((blocks) =>
      blocks.map((b) =>
        b.type === 'question_group' && b.questionGroupId === questionGroupId ? { ...b, score } : b,
      ),
    )
  }, [])

  const removeBlock = useCallback(
    (blockId: string) => {
      setOpenInsertionIndex(null)
      // Compute everything from the updater's `blocks` argument — never from
      // the closure-captured `paperBlocks` — to avoid the same React updater
      // timing class of bug we already fixed in usePaperDraft. The side
      // effects (selection clear, onRemoveQuestionGroup) run AFTER the
      // updater commits, never inside it (StrictMode can call updaters
      // twice and we don't want the callback to fire twice).
      let removedIds: string[] = []
      let removedGroupId: string | null = null
      setPaperBlocks((blocks) => {
        const block = blocks.find((b) => b.id === blockId)
        if (!block) {
          removedIds = []
          removedGroupId = null
          return blocks
        }
        if (block.type === 'question_group') {
          const targetGroupId = block.questionGroupId
          removedGroupId = targetGroupId
          removedIds = blocks
            .filter((b) => b.type === 'question_group' && b.questionGroupId === targetGroupId)
            .map((b) => b.id)
          return blocks.filter(
            (b) => !(b.type === 'question_group' && b.questionGroupId === targetGroupId),
          )
        }
        removedGroupId = null
        removedIds = [block.id]
        return blocks.filter((b) => b.id !== blockId)
      })
      setSelectedPaperBlockId((current) =>
        current && removedIds.includes(current) ? null : current,
      )
      if (removedGroupId !== null) {
        onRemoveQuestionGroup(removedGroupId)
      }
    },
    [onRemoveQuestionGroup],
  )

  const moveBlock = useCallback((blockId: string, direction: -1 | 1) => {
    setOpenInsertionIndex(null)
    setPaperBlocks((blocks) => {
      const index = blocks.findIndex((b) => b.id === blockId)
      const nextIndex = index + direction
      if (index < 0 || nextIndex < 0 || nextIndex >= blocks.length) return blocks
      const next = [...blocks]
      const [item] = next.splice(index, 1)
      next.splice(nextIndex, 0, item)
      return next
    })
  }, [])

  const updateSectionHeaderTitle = useCallback((blockId: string, title: string) => {
    setPaperBlocks((blocks) =>
      blocks.map((b) =>
        b.id === blockId && b.type === 'section_header' ? { ...b, title } : b,
      ),
    )
  }, [])

  const insertBlockAtIndex = useCallback(
    (index: number, type: 'section_header' | 'page_break') => {
      const newBlock: PaperBlock =
        type === 'section_header'
          ? { id: createBlockId('block-sh'), type: 'section_header', title: '大题标题' }
          : { id: createBlockId('block-pb'), type: 'page_break' }
      setPaperBlocks((blocks) => {
        const next = [...blocks]
        next.splice(Math.min(index, next.length), 0, newBlock)
        return next
      })
      setSelectedPaperBlockId(newBlock.id)
      setOpenInsertionIndex(null)
    },
    [],
  )

  const insertSectionHeaderBefore = useCallback((blockId: string) => {
    setOpenInsertionIndex(null)
    const newBlock: PaperBlock = {
      id: createBlockId('block-sh'),
      type: 'section_header',
      title: '大题标题',
    }
    setPaperBlocks((blocks) => {
      const idx = blocks.findIndex((b) => b.id === blockId)
      if (idx < 0) return [...blocks, newBlock]
      const next = [...blocks]
      next.splice(idx, 0, newBlock)
      return next
    })
  }, [])

  const insertPageBreakAfter = useCallback((blockId: string) => {
    setOpenInsertionIndex(null)
    const newBlock: PaperBlock = { id: createBlockId('block-pb'), type: 'page_break' }
    setPaperBlocks((blocks) => {
      const idx = blocks.findIndex((b) => b.id === blockId)
      if (idx < 0) return [...blocks, newBlock]
      const next = [...blocks]
      next.splice(idx + 1, 0, newBlock)
      return next
    })
  }, [])

  return {
    paperBlocks,
    selectedPaperBlockId,
    openInsertionIndex,
    setSelectedPaperBlockId,
    setOpenInsertionIndex,
    resetBlocks,
    setBlocks,
    rebuildFromBasket,
    appendForNewItems,
    removeQuestionGroupBlock,
    syncQuestionGroupOrder,
    syncQuestionGroupScore,
    removeBlock,
    moveBlock,
    updateSectionHeaderTitle,
    insertBlockAt: insertBlockAtIndex,
    insertSectionHeaderBefore,
    insertPageBreakAfter,
  }
}
