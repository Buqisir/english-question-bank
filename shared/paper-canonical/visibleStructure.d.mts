/**
 * Type declarations for `visibleStructure.mjs`.
 * Keep this file in sync with `visibleStructure.d.ts`.
 */

export function assertCanonicalVisibleStructure(
  value: unknown,
  expectedGroups?: ReadonlyArray<{
    slotId: string
    groupId: string
    familyContractId: string
  }> | null,
): ReadonlyArray<unknown>

export function assertCanonicalConsumptionVisibleStructure(
  consumption: unknown,
): ReadonlyArray<unknown>
