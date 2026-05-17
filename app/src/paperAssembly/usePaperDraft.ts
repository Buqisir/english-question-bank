/**
 * Paper Set Draft Module — usePaperDraft.
 *
 * Owns:
 *   - basket: Assembly Basket items (BasketItem[]).
 *   - paperBlocks (via internally composed usePaperBlocks).
 *
 * Implementation note (timing):
 *   Earlier drafts captured "next" arrays inside `setBasket((items) => ...)`
 *   updater closures and read them on the NEXT line. Under React 19 the
 *   updater can run later than that, so the outer read got stale data —
 *   in particular `addGroups` would update basket but never call
 *   `blocks.appendForNewItems(...)`, leaving paperBlocks empty.
 *
 *   Fix: an authoritative `basketRef.current` mirrors the basket state.
 *   Every op computes `nextBasket` synchronously from the ref, then does
 *   `commitBasket(nextBasket)` (which sets the ref AND state in one shot),
 *   then runs the side effects (block sync + onDraftEdited).
 *
 * Invariants:
 *   1. The relative order of basket items matches the relative order of
 *      `question_group` blocks in paperBlocks.
 *   2. Each basket item has exactly one `question_group` block in paperBlocks.
 *   3. addGroups deduplicates by group.id against the current basket.
 *   4. removeGroup syncs both basket and paperBlocks.
 *   5. Removing a `question_group` block via paperBlocks.removeBlock removes
 *      the matching basket item (handled inside usePaperBlocks; the basket-only
 *      onRemoveQuestionGroup callback we pass cannot leave a stale block).
 *   6. clear() resets basket, paperBlocks, selection, and insertion state.
 *   7. moveGroup syncs basket order and the corresponding question_group block.
 *   8. updateGroupScore syncs basket score and block score.
 *   9. updateGroupMeta only mutates basket (sectionTitle / note).
 *   10. replaceDraft applies layout.blocks if provided, else rebuilds from basket.
 *   11. replaceDraft does NOT call onDraftEdited.
 *   12. The 6 user-edit ops (add / remove / clear / reorder / score / meta)
 *       fire onDraftEdited with the matching reason exactly once when the op
 *       actually changes something.
 *
 * Side-effect free except onDraftEdited; this module does NOT touch saveStatus,
 * previewStatus, or export status — that orchestration lives in App.tsx.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  BasketItem,
  PaperBlock,
  PaperSetLayout,
  QuestionGroupCard,
  VersionType,
} from '../domain/questionBank.ts'
import { usePaperBlocks } from './usePaperBlocks.ts'
import { createBasketItem, type PaperDraftEditReason } from './paperDraftModel.ts'
import { loadAssemblyBasket, saveAssemblyBasket } from './basketPersistence.ts'

export type PaperExportStyle = 'exam' | 'handout'

export type UsePaperDraftInput = {
  /**
   * Fired when the basket / blocks are mutated by an explicit user-edit op.
   * - add / remove / clear / reorder / score / meta
   * NOT fired by replaceDraft / externalRemoveByGroupId /
   * patchBasketItemFromSavedGroup, which are reserved for load / sync flows.
   */
  onDraftEdited?: (reason: PaperDraftEditReason) => void
  /** Initial paperTitle. Defaults to '高考阅读 B 主题训练' to preserve legacy behavior. */
  initialPaperTitle?: string
  /** Initial questionNumberStart. Defaults to 1. */
  initialQuestionNumberStart?: number
  /** Initial paperExportStyle. Defaults to 'exam'. */
  initialPaperExportStyle?: PaperExportStyle
  /** Initial versionType. Defaults to 'student'. */
  initialVersionType?: VersionType
}

export type ReplaceDraftInput = {
  basket: BasketItem[]
  layout?: PaperSetLayout | null
}

export type UsePaperDraftResult = {
  basket: BasketItem[]
  paperBlocks: PaperBlock[]
  selectedPaperBlockId: string | null
  openInsertionIndex: number | null

  setSelectedPaperBlockId: (id: string | null) => void
  setOpenInsertionIndex: (index: number | null) => void

  // Basket-level edit ops (these fire onDraftEdited when something changes)
  addGroups: (groups: QuestionGroupCard[]) => BasketItem[] // returns the freshly added items (de-duped)
  removeGroup: (questionGroupId: string) => void
  clear: () => void
  moveGroup: (questionGroupId: string, direction: -1 | 1) => void
  updateGroupScore: (questionGroupId: string, score: number) => void
  updateGroupMeta: (
    questionGroupId: string,
    patch: { sectionTitle?: string; note?: string },
  ) => void

  // Bulk replace — used by load saved paper / workflow build / import build.
  // Does NOT fire onDraftEdited. Caller manages title / version / saveStatus.
  replaceDraft: (input: ReplaceDraftInput) => void

  // Block passthrough (UI hooks click these directly).
  removeBlock: (blockId: string) => void
  moveBlock: (blockId: string, direction: -1 | 1) => void
  updateSectionHeaderTitle: (blockId: string, title: string) => void
  insertBlockAt: (index: number, type: 'section_header' | 'page_break') => void
  insertSectionHeaderBefore: (blockId: string) => void
  insertPageBreakAfter: (blockId: string) => void

  // External-driven sync — used by handleDeleteQuestionGroup (which deletes
  // the underlying source group from the question bank). No fire.
  externalRemoveByGroupId: (questionGroupId: string) => void

  // Mutation for an updated source group (e.g. after editing the underlying
  // QuestionGroup in the entry panel). Updates only the matching basket entry
  // while preserving the user's score / sectionTitle / note overrides. No fire.
  patchBasketItemFromSavedGroup: (saved: QuestionGroupCard) => void

  // ── Paper-level config (Step 3) ──
  // The hook owns the state; App composes its own onChange wrappers to keep
  // the legacy side effects (saveStatus, paperExports.resetExportStatuses)
  // exactly as they were — those are NOT moved into this hook.
  paperTitle: string
  setPaperTitle: (next: string) => void
  questionNumberStart: number
  setQuestionNumberStart: (next: number) => void
  paperExportStyle: PaperExportStyle
  setPaperExportStyle: (next: PaperExportStyle) => void
  versionType: VersionType
  setVersionType: (next: VersionType) => void
}

export function usePaperDraft(input: UsePaperDraftInput = {}): UsePaperDraftResult {
  const { onDraftEdited } = input
  // Hydrate from localStorage on mount. The hydrate path is conservative —
  // any parse failure / version mismatch / non-array `items` returns []
  // (see basketPersistence.ts). We do NOT block render or display a banner;
  // a corrupt local payload is silently treated as an empty basket.
  const [basket, setBasket] = useState<BasketItem[]>(() => loadAssemblyBasket())

  // Paper-level config (Step 3). Owned here, but App keeps its own onChange
  // wrappers to preserve the legacy save/preview/exports side effects.
  const [paperTitle, setPaperTitle] = useState<string>(() => input.initialPaperTitle ?? '高考阅读 B 主题训练')
  const [questionNumberStart, setQuestionNumberStart] = useState<number>(
    () => input.initialQuestionNumberStart ?? 1,
  )
  const [paperExportStyle, setPaperExportStyle] = useState<PaperExportStyle>(
    () => input.initialPaperExportStyle ?? 'exam',
  )
  const [versionType, setVersionType] = useState<VersionType>(
    () => input.initialVersionType ?? 'student',
  )

  // Authoritative basket mirror. Always read from this when computing the
  // next basket, never from a stale closure capture. Initialized to match
  // the hydrated state above so the first op-after-mount sees the correct
  // basket without an extra render.
  const basketRef = useRef<BasketItem[]>(basket)

  const commitBasket = useCallback((next: BasketItem[]) => {
    basketRef.current = next
    setBasket(next)
    // Persist immediately on every basket mutation. No debounce — Cut B
    // reviewers explicitly required no debounce so a refresh right after
    // "加入草稿卷" cannot drop the add. saveAssemblyBasket swallows storage
    // errors so a quota issue cannot crash the workbench.
    saveAssemblyBasket(next)
  }, [])

  const blocks = usePaperBlocks({
    onRemoveQuestionGroup: (questionGroupId) => {
      // Basket-only side: usePaperBlocks.removeBlock has already removed the
      // matching block(s) before invoking us. Drive the basket commit through
      // the ref so we don't depend on a deferred updater.
      const before = basketRef.current
      const next = before.filter((item) => item.id !== questionGroupId)
      if (next.length === before.length) return
      commitBasket(next)
      onDraftEdited?.('remove')
    },
  })

  // One-shot seed: when we hydrate a non-empty basket from localStorage on
  // mount, paperBlocks is still []. Rebuild block layout from the basket so
  // invariant 2 (every basket item has exactly one question_group block)
  // holds before any user interaction. We deliberately do NOT call
  // onDraftEdited here — hydration is a load flow, not a user edit.
  const didSeedBlocksRef = useRef(false)
  useEffect(() => {
    if (didSeedBlocksRef.current) return
    didSeedBlocksRef.current = true
    if (basketRef.current.length > 0) {
      blocks.rebuildFromBasket(basketRef.current)
    }
  }, [blocks])

  const fire = useCallback(
    (reason: PaperDraftEditReason) => {
      onDraftEdited?.(reason)
    },
    [onDraftEdited],
  )

  const addGroups = useCallback(
    (groups: QuestionGroupCard[]): BasketItem[] => {
      const current = basketRef.current
      const existingIds = new Set(current.map((item) => item.id))
      const fresh = groups
        .filter((group) => !existingIds.has(group.id))
        .map((group) => createBasketItem(group))
      if (fresh.length === 0) return []
      commitBasket([...current, ...fresh])
      blocks.appendForNewItems(fresh)
      fire('add')
      return fresh
    },
    [blocks, commitBasket, fire],
  )

  const removeGroup = useCallback(
    (questionGroupId: string) => {
      blocks.setOpenInsertionIndex(null)
      const before = basketRef.current
      const next = before.filter((item) => item.id !== questionGroupId)
      const removed = next.length !== before.length
      if (removed) {
        commitBasket(next)
      }
      blocks.removeQuestionGroupBlock(questionGroupId)
      if (removed) fire('remove')
    },
    [blocks, commitBasket, fire],
  )

  const clear = useCallback(() => {
    blocks.setOpenInsertionIndex(null)
    commitBasket([])
    blocks.resetBlocks()
    fire('clear')
  }, [blocks, commitBasket, fire])

  const moveGroup = useCallback(
    (questionGroupId: string, direction: -1 | 1) => {
      const current = basketRef.current
      const index = current.findIndex((item) => item.id === questionGroupId)
      const nextIndex = index + direction
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return
      const next = [...current]
      const [item] = next.splice(index, 1)
      next.splice(nextIndex, 0, item)
      commitBasket(next)
      blocks.syncQuestionGroupOrder(questionGroupId, direction)
      fire('reorder')
    },
    [blocks, commitBasket, fire],
  )

  const updateGroupScore = useCallback(
    (questionGroupId: string, score: number) => {
      const current = basketRef.current
      const target = current.find((item) => item.id === questionGroupId)
      if (!target || target.score === score) return
      const next = current.map((item) =>
        item.id === questionGroupId ? { ...item, score } : item,
      )
      commitBasket(next)
      blocks.syncQuestionGroupScore(questionGroupId, score)
      fire('score')
    },
    [blocks, commitBasket, fire],
  )

  const updateGroupMeta = useCallback(
    (
      questionGroupId: string,
      patch: { sectionTitle?: string; note?: string },
    ) => {
      const current = basketRef.current
      const target = current.find((item) => item.id === questionGroupId)
      if (!target) return
      const nextSectionTitle =
        patch.sectionTitle !== undefined ? patch.sectionTitle : target.sectionTitle
      const nextNote = patch.note !== undefined ? patch.note : target.note
      if (nextSectionTitle === target.sectionTitle && nextNote === target.note) return
      const next = current.map((item) =>
        item.id === questionGroupId
          ? { ...item, sectionTitle: nextSectionTitle, note: nextNote }
          : item,
      )
      commitBasket(next)
      fire('meta')
    },
    [commitBasket, fire],
  )

  const replaceDraft = useCallback(
    ({ basket: nextBasket, layout }: ReplaceDraftInput) => {
      commitBasket(nextBasket)
      blocks.setSelectedPaperBlockId(null)
      blocks.setOpenInsertionIndex(null)
      if (layout) {
        blocks.setBlocks(layout.blocks)
      } else {
        blocks.rebuildFromBasket(nextBasket)
      }
      // No onDraftEdited fire — replaceDraft is for load/sync flows.
    },
    [blocks, commitBasket],
  )

  const externalRemoveByGroupId = useCallback(
    (questionGroupId: string) => {
      // Used when the underlying QuestionGroup is deleted from the question
      // bank. Drop both basket entry and any block referencing it. Not a user
      // "edit" of the draft — no onDraftEdited fire.
      const before = basketRef.current
      const next = before.filter((item) => item.id !== questionGroupId)
      if (next.length !== before.length) {
        commitBasket(next)
      }
      blocks.removeQuestionGroupBlock(questionGroupId)
    },
    [blocks, commitBasket],
  )

  const patchBasketItemFromSavedGroup = useCallback(
    (saved: QuestionGroupCard) => {
      const current = basketRef.current
      const next = current.map((item) =>
        item.id === saved.id
          ? createBasketItem(saved, {
              score: item.score,
              sectionTitle: item.sectionTitle,
              note: item.note,
            })
          : item,
      )
      commitBasket(next)
    },
    [commitBasket],
  )

  return {
    basket,
    paperBlocks: blocks.paperBlocks,
    selectedPaperBlockId: blocks.selectedPaperBlockId,
    openInsertionIndex: blocks.openInsertionIndex,
    setSelectedPaperBlockId: blocks.setSelectedPaperBlockId,
    setOpenInsertionIndex: blocks.setOpenInsertionIndex,
    addGroups,
    removeGroup,
    clear,
    moveGroup,
    updateGroupScore,
    updateGroupMeta,
    replaceDraft,
    removeBlock: blocks.removeBlock,
    moveBlock: blocks.moveBlock,
    updateSectionHeaderTitle: blocks.updateSectionHeaderTitle,
    insertBlockAt: blocks.insertBlockAt,
    insertSectionHeaderBefore: blocks.insertSectionHeaderBefore,
    insertPageBreakAfter: blocks.insertPageBreakAfter,
    externalRemoveByGroupId,
    patchBasketItemFromSavedGroup,
    paperTitle,
    setPaperTitle,
    questionNumberStart,
    setQuestionNumberStart,
    paperExportStyle,
    setPaperExportStyle,
    versionType,
    setVersionType,
  }
}
