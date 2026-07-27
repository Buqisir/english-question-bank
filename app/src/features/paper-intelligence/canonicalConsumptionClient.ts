export type WholePaperConsumption = {
  disposition: 'ready'
  paperId: string
  selections: ReadonlyArray<{
    mode: 'canonical' | 'legacy'
    familyContractId: string
    groupIds: ReadonlyArray<string>
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
  ) throw new Error('Canonical consumption response is incomplete')
  return consumption
}

export function canonicalConsumptionForGroup(
  consumption: WholePaperConsumption,
  familyContractId: 'cloze' | 'grammar-fill' | 'seven-choices' | 'reading',
  groupId: string,
): WholePaperConsumption {
  selectConsumerGroupMode({ consumption, familyContractId, groupId })
  return consumption
}

export function canonicalModeForGroup(
  consumption: WholePaperConsumption,
  familyContractId: 'cloze' | 'grammar-fill' | 'seven-choices' | 'reading',
  groupId: string,
): 'canonical' | 'legacy' {
  return selectConsumerGroupMode({
    consumption,
    familyContractId,
    groupId,
  }).mode
}
import { selectConsumerGroupMode } from '../../../../shared/paper-canonical/consumerProjection.mjs'
