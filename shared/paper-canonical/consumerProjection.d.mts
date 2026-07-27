/**
 * Type declarations for `consumerProjection.mjs`.
 * Keep this file in sync with `consumerProjection.d.ts`.
 */

export type CanonicalConsumerSelection = {
  mode: 'canonical' | 'legacy'
  familyContractId: string
  groupIds: ReadonlyArray<string>
  projectedOccurrences?: ReadonlyArray<unknown>
}

export function selectConsumerGroupMode(input: {
  consumption: unknown
  familyContractId: string
  groupId: string
}): CanonicalConsumerSelection

export function selectedFamilyContractIdForGroup(input: {
  consumption: unknown
  groupId: string
}): string | null

export function projectCanonicalConsumerGroup(input: {
  consumption: unknown
  familyContractId: string
  groupId: string
}): unknown
