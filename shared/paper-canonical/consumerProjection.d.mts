/**
 * Type declarations for `consumerProjection.mjs`.
 * Keep this file in sync with `consumerProjection.d.ts`.
 */

export type CanonicalConsumerSelection = {
  mode: 'canonical' | 'legacy'
  familyContractId: string
  groupIds: ReadonlyArray<string>
  projectedOccurrences?: ReadonlyArray<unknown>
  projectedOccurrenceDigests?: ReadonlyArray<{
    groupId: string
    digest: string
  }>
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

export function projectCanonicalWritingChrome(input: {
  consumption: unknown
  groupId: string
  renderedGroupIds?: ReadonlyArray<string>
}): {
  readonly part: {
    readonly partId: string
    readonly instructionId: string
    readonly text: string
    readonly renderPolicy: 'render'
  } | null
  readonly section: {
    readonly sectionId: string
    readonly instructionId: string
    readonly text: string
    readonly renderPolicy: 'render'
  } | null
  readonly instructions: ReadonlyArray<{
    readonly instructionId: string
    readonly placement: string
    readonly text: string
    readonly renderPolicy: 'render'
  }>
}

export function canonicalWritingChromeOwnsRenderedDocument(input: {
  consumption: unknown
  renderedGroupIds: ReadonlyArray<string>
}): boolean
