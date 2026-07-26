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

export function projectCanonicalConsumerGroup(input: {
  consumption: unknown
  familyContractId: string
  groupId: string
}): unknown
