/**
 * Paper Set Draft Module — pure helpers.
 *
 * Defines what an Assembly Basket item looks like before it becomes a saved
 * Paper Set. Importable by both the Concierge desk (which calls addGroups
 * indirectly via App) and any flow that hand-builds a basket (workflow build,
 * import objective build, load saved paper set).
 *
 * No React, no side effects.
 */

import {
  groupTypeLabel,
  type BasketItem,
  type QuestionGroupCard,
} from '../domain/questionBank.ts'

/** Reasons that fire onDraftEdited; replaceDraft / external sync do NOT fire it. */
export type PaperDraftEditReason = 'add' | 'remove' | 'clear' | 'reorder' | 'score' | 'meta'

/**
 * Build a BasketItem from a QuestionGroupCard with sensible defaults.
 *
 * Defaults:
 *   - score        = group.defaultScore
 *   - sectionTitle = groupTypeLabel[group.groupType]
 *   - note         = ''
 *
 * Overrides win when provided.
 */
export function createBasketItem(
  group: QuestionGroupCard,
  overrides: Partial<Pick<BasketItem, 'score' | 'sectionTitle' | 'note'>> = {},
): BasketItem {
  return {
    ...group,
    score: overrides.score ?? group.defaultScore,
    sectionTitle: overrides.sectionTitle ?? groupTypeLabel[group.groupType],
    note: overrides.note ?? '',
  }
}
