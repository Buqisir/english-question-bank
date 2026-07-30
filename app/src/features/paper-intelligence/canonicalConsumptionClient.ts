import {
  assertCanonicalConsumptionVisibleStructure,
} from '../../../../shared/paper-canonical/visibleStructure.mjs'

export type WholePaperConsumption = {
  disposition: 'ready'
  paperId: string
  sourceAssetVersion: number | null
  sourceAssetDigest?: string
  publicationDigest?: string
  authorityRef?: {
    manifestId: string
    manifestVersion: string
    manifestDigest: string
  }
  consumerContractRef?: {
    id: string
    version: string
    digest: string
  }
  visibleStructure?: ReadonlyArray<
    | {
        kind: 'part'
        partId: string
        instructionId: string
      }
    | {
        kind: 'section'
        sectionId: string
        instructionId: string
      }
    | {
        kind: 'instruction'
        instructionId: string
        placement: 'part_heading' | 'section_heading' | 'group_instruction'
        text: string
        renderPolicy: 'render'
      }
    | {
        kind: 'group'
        slotId: string
        groupId: string
        familyContractId: string
      }
  >
  selections: ReadonlyArray<{
    mode: 'canonical' | 'legacy'
    familyContractId: string
    groupIds: ReadonlyArray<string>
    projectedOccurrences?: ReadonlyArray<unknown>
    projectedOccurrenceDigests?: ReadonlyArray<{
      groupId: string
      digest: string
    }>
  }>
}

export async function loadScreenConsumption(
  paperId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<WholePaperConsumption> {
  const response = await fetchImpl(
    `/api/paper-canonical/consumption?paperId=${encodeURIComponent(paperId)}`,
  )
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string }
    throw new Error(body.error || `Canonical consumption unavailable (${response.status})`)
  }
  const consumption = await response.json() as WholePaperConsumption
  if (
    consumption?.disposition !== 'ready'
    || consumption.paperId !== paperId
    || !Array.isArray(consumption.selections)
    || (
      Number(consumption.authorityRef?.manifestVersion) >= 30
      && !Array.isArray(consumption.visibleStructure)
    )
  ) throw new Error('Canonical consumption response is incomplete')
  if (
    Array.isArray(consumption.visibleStructure)
    || Number(consumption.authorityRef?.manifestVersion) >= 30
  ) assertCanonicalConsumptionVisibleStructure(consumption)
  return consumption
}

export function canonicalConsumptionForGroup(
  consumption: WholePaperConsumption,
  familyContractId: 'cloze' | 'grammar-fill' | 'seven-choices' | 'reading' | 'application-writing' | 'continuation-writing',
  groupId: string,
): WholePaperConsumption {
  selectConsumerGroupMode({ consumption, familyContractId, groupId })
  return consumption
}

export function canonicalModeForGroup(
  consumption: WholePaperConsumption,
  familyContractId: 'cloze' | 'grammar-fill' | 'seven-choices' | 'reading' | 'application-writing' | 'continuation-writing',
  groupId: string,
): 'canonical' | 'legacy' {
  return selectConsumerGroupMode({
    consumption,
    familyContractId,
    groupId,
  }).mode
}
import { selectConsumerGroupMode } from '../../../../shared/paper-canonical/consumerProjection.mjs'
