/**
 * Paper Layout Domain Module — pure functions for paper block assembly.
 *
 * Canonical home for layout logic shared between frontend and server (via contract tests).
 * All functions are pure: immutable input → new output, no React state, no side effects.
 */

import type { PaperBlock, PaperExportBlock, PaperSetLayout } from './questionBank.ts'

// --- Types ---

export type BasketItemLike = {
  id: string
  score: number
  questionCount: number
  sectionTitle?: string
  note?: string
  groupType?: string
  title?: string
}

// --- Block ID generation ---

let _idCounter = 0
export function createBlockId(prefix: string): string {
  const randomId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${++_idCounter}-${Math.random().toString(36).slice(2)}`
  return `${prefix}-${randomId}`
}

// --- Create layout from basket items ---

export function createLayoutFromItems(items: BasketItemLike[]): PaperBlock[] {
  return items.map((item) => ({
    id: `block-${item.id}`,
    type: 'question_group' as const,
    questionGroupId: item.id,
    score: item.score,
  }))
}

// --- Rebuild blocks preserving interleaving ---

export function rebuildBlocks(oldBlocks: PaperBlock[], newItems: BasketItemLike[]): PaperBlock[] {
  // Compare ordered question_group id sequence
  const existingGroupIds = oldBlocks
    .filter((b) => b.type === 'question_group')
    .map((b) => (b as Extract<PaperBlock, { type: 'question_group' }>).questionGroupId)
  const newGroupIds = newItems.map((i) => i.id)
  const sequenceMatch =
    existingGroupIds.length === newGroupIds.length &&
    existingGroupIds.every((id, idx) => id === newGroupIds[idx])

  if (sequenceMatch) {
    // Update scores only
    return oldBlocks.map((b) => {
      if (b.type !== 'question_group') return b
      const item = newItems.find((i) => i.id === b.questionGroupId)
      return item ? { ...b, score: item.score } : b
    })
  }

  // Walk old blocks, keep non-group in place, keep valid groups, append new
  const newIdSet = new Set(newGroupIds)
  const result: PaperBlock[] = []
  const placed = new Set<string>()

  for (const b of oldBlocks) {
    if (b.type !== 'question_group') {
      result.push(b)
    } else if (newIdSet.has(b.questionGroupId)) {
      const item = newItems.find((i) => i.id === b.questionGroupId)
      result.push(item ? { ...b, score: item.score } : b)
      placed.add(b.questionGroupId)
    }
  }

  for (const item of newItems) {
    if (!placed.has(item.id)) {
      result.push({ id: `block-${item.id}`, type: 'question_group' as const, questionGroupId: item.id, score: item.score })
    }
  }

  return result
}

// --- Convert PaperBlock[] to PaperExportBlock[] ---

export function toPaperExportBlocks(
  blocks: PaperBlock[],
  basketLookup: (groupId: string) => BasketItemLike | undefined,
): PaperExportBlock[] {
  return blocks.map((block) => {
    if (block.type === 'section_header') return { type: 'section_header' as const, title: block.title }
    if (block.type === 'page_break') return { type: 'page_break' as const }
    const item = basketLookup(block.questionGroupId)
    return {
      type: 'question_group' as const,
      questionGroupId: block.questionGroupId,
      score: block.score,
      sectionTitle: item?.sectionTitle,
      note: item?.note,
    }
  })
}

// --- Build full PaperSetLayout from current state ---

export function buildPaperSetLayout(
  blocks: PaperBlock[],
  questionNumberStart: number,
  printStyle: 'exam' | 'handout',
): PaperSetLayout {
  return { blocks, questionNumberStart, printStyle }
}
