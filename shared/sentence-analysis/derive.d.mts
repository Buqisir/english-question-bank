import type {
  BubbleModel,
  Difficulty,
  ExplanationModel,
  LayoutItem,
  FocusState,
  FocusView,
  MainFocus,
  Restore,
  RestoreDisplaySegment,
  SentenceAnalysisV1,
  StructureSegment,
  Unit,
} from './types.d.mts'

export function coverage(analysis: SentenceAnalysisV1, unitId: string): Set<number>
export function tokenOwners(analysis: SentenceAnalysisV1): Map<number, string[]>
export function hitTest(analysis: SentenceAnalysisV1, tokenIndex: number): string | null
export function textOfTokenIndexes(analysis: SentenceAnalysisV1, indexes: Iterable<number>): string
export function unitText(analysis: SentenceAnalysisV1, unitOrId: Unit | string): string
export function trunkTokenIndexes(analysis: SentenceAnalysisV1, unit: Unit): number[]
export function unitTrunkText(analysis: SentenceAnalysisV1, unitOrId: Unit | string): string
export function primaryUnits(analysis: SentenceAnalysisV1): Unit[]
export function unitDisplayLabel(analysis: SentenceAnalysisV1, unitOrId: Unit | string): string
export function connectorTarget(analysis: SentenceAnalysisV1, connector: Unit): Unit
export function connectorParts(analysis: SentenceAnalysisV1, connector: Unit): number[][]
export function restoreSegments(analysis: SentenceAnalysisV1, restore: Restore): RestoreDisplaySegment[]
export function restoreText(analysis: SentenceAnalysisV1, restore: Restore): string
export function mainFocus(analysis: SentenceAnalysisV1): MainFocus
export function structureSummarySegments(analysis: SentenceAnalysisV1): StructureSegment[]
export function structureSummary(analysis: SentenceAnalysisV1): string
export function layerLabel(analysis: SentenceAnalysisV1, unit: Unit): string
export function focusView(analysis: SentenceAnalysisV1, unitId: string): FocusView
export function siblings(analysis: SentenceAnalysisV1, unitId: string): Unit[]
export function next(analysis: SentenceAnalysisV1, unitId: string): string | null
export function prev(analysis: SentenceAnalysisV1, unitId: string): string | null
export function parentOf(analysis: SentenceAnalysisV1, unitId: string): string
export function firstChild(analysis: SentenceAnalysisV1, unitId: string): string | null
export function moveFocus(analysis: SentenceAnalysisV1, focus: FocusState, key: string): FocusState
export function explanation(analysis: SentenceAnalysisV1, focus: FocusState | string): ExplanationModel
export function difficulties(analysis: SentenceAnalysisV1): Difficulty[]
export function teachingPoints(analysis: SentenceAnalysisV1): Difficulty[]
export function difficultyBubble(analysis: SentenceAnalysisV1, difficulty: Difficulty): BubbleModel
export function voiceLine(analysis: SentenceAnalysisV1, unitOrId: string | Unit): { text: string; targetId: string } | null
export function unitPartnerId(analysis: SentenceAnalysisV1, unitId: string): string | null
export function enclosesUnit(analysis: SentenceAnalysisV1, targetId: string, unitId: string): boolean
export function unitBubble(analysis: SentenceAnalysisV1, unitId: string): BubbleModel | null
export function restoreSummary(analysis: SentenceAnalysisV1, restoreId: string): string | null
export function restoreLayout(analysis: SentenceAnalysisV1, restoreId: string | null): LayoutItem[]
export function copyText(analysis: SentenceAnalysisV1): string
