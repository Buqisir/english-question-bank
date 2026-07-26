import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { consumerContractRefs, resolveConsumerContract } from '../../shared/paper-canonical/consumers.mjs'
import {
  createFileSystemCanonicalPublicationStore,
  loadPaperForConsumptionSync,
} from './publication.mjs'
import { selectConsumerGroupMode } from '../../shared/paper-canonical/consumerProjection.mjs'

const FAMILY_BY_GROUP_TYPE = new Map([
  ['cloze', 'cloze'],
  ['grammarFill', 'grammar-fill'],
])
const SAFE_PAPER_ID = /^[a-z0-9][a-z0-9._-]{0,127}$/

function rejected(result) {
  const error = new Error(
    `Canonical consumption unavailable: ${result.diagnostics?.map((item) => item.code).join(', ') || result.disposition}`,
  )
  error.code = 'CANONICAL_CONSUMPTION_REJECTED'
  error.diagnostics = result.diagnostics || []
  return error
}

function readLegacyAsset(rootDir, paperId) {
  for (const candidate of [
    path.join(rootDir, paperId, 'latest', 'paper-asset.json'),
    path.join(rootDir, paperId, 'paper-asset.json'),
  ]) {
    if (!existsSync(candidate)) continue
    return JSON.parse(readFileSync(candidate, 'utf8'))
  }
  return null
}

function explicitLegacyPlan(rootDir, paperId, consumerContract) {
  const asset = readLegacyAsset(rootDir, paperId)
  if (!asset) return null
  const resolved = resolveConsumerContract(consumerContract)
  if (!resolved.ok) return null
  const groupIdsByFamily = new Map()
  for (const [groupId, group] of Object.entries(asset.content?.groups || {})) {
    const familyContractId = FAMILY_BY_GROUP_TYPE.get(group?.groupType)
    if (!familyContractId) continue
    const groupIds = groupIdsByFamily.get(familyContractId) || []
    groupIds.push(groupId)
    groupIdsByFamily.set(familyContractId, groupIds)
  }
  const selections = []
  for (const [familyContractId, groupIds] of groupIdsByFamily) {
    const capability = resolved.contract.families.find(
      (entry) => entry.familyContractId === familyContractId,
    )
    if (!capability || capability.legacyCapability !== 'available') return null
    selections.push({
      mode: 'legacy',
      familyContractId,
      groupIds,
      projectedOccurrences: [],
      diagnostic: { code: 'CANONICAL_PUBLICATION_NOT_ADMITTED' },
    })
  }
  return {
    disposition: 'ready',
    paperId,
    sourceAssetVersion: null,
    selections,
    diagnostics: [{ code: 'CANONICAL_PUBLICATION_NOT_ADMITTED' }],
  }
}

function explicitDatabaseLegacyPlan(candidates, consumerContract) {
  const resolved = resolveConsumerContract(consumerContract)
  if (!resolved.ok) return null
  const sourceIds = new Set(
    candidates
      .map((item) => item.detail?.sourceDetail?.id)
      .filter(Boolean),
  )
  if (
    sourceIds.size !== 1
    || candidates.some(
      (item) =>
        item.detail?.paperId
        || !item.detail?.sourceDetail?.id,
    )
  ) return null
  const groupIdsByFamily = new Map()
  for (const item of candidates) {
    const familyContractId =
      item.detail.groupType === 'cloze' ? 'cloze' : 'grammar-fill'
    const capability = resolved.contract.families.find(
      (entry) => entry.familyContractId === familyContractId,
    )
    if (!capability || capability.legacyCapability !== 'available') return null
    const groupIds = groupIdsByFamily.get(familyContractId) || []
    if (groupIds.includes(item.detail.id)) return null
    groupIds.push(item.detail.id)
    groupIdsByFamily.set(familyContractId, groupIds)
  }
  return {
    disposition: 'ready',
    paperId: `legacy-source-${[...sourceIds][0]}`,
    sourceAssetVersion: null,
    selections: [...groupIdsByFamily].map(
      ([familyContractId, groupIds]) => ({
        mode: 'legacy',
        familyContractId,
        groupIds,
        projectedOccurrences: [],
        diagnostic: { code: 'CANONICAL_SOURCE_PAPER_ID_UNAVAILABLE' },
      }),
    ),
    diagnostics: [{ code: 'CANONICAL_SOURCE_PAPER_ID_UNAVAILABLE' }],
  }
}

export function createCanonicalConsumerRuntime({ rootDir, db }) {
  const store = {
    ...createFileSystemCanonicalPublicationStore({ rootDir, db }),
    projectLegacyFamily: ({ familyContractId }) => [
      { kind: 'legacy_family', familyContractId },
    ],
  }
  function load({ paperId, consumerId }) {
    if (
      typeof paperId !== 'string'
      || !SAFE_PAPER_ID.test(paperId)
      || paperId === '.'
      || paperId === '..'
    ) throw rejected({
      disposition: 'incompatible',
      diagnostics: [{ code: 'CANONICAL_PUBLICATION_PAPER_ID_INVALID' }],
    })
    const consumerContract = consumerContractRefs[consumerId]
    if (!consumerContract) throw rejected({
      disposition: 'incompatible',
      diagnostics: [{ code: 'CONSUMER_CONTRACT_UNAVAILABLE' }],
    })
    const result = loadPaperForConsumptionSync({
      paperId,
      consumerContract,
    }, store)
    if (result.disposition === 'not_found') {
      const legacy = explicitLegacyPlan(rootDir, paperId, consumerContract)
      if (legacy) return legacy
    }
    if (result.disposition !== 'ready') throw rejected(result)
    return result
  }

  function resolveForItems({ consumerId, items }) {
    const candidates = items.filter((item) =>
      ['cloze', 'grammar_cloze'].includes(item.detail?.groupType))
    if (candidates.length === 0) return null
    const databaseLegacy = explicitDatabaseLegacyPlan(
      candidates,
      consumerContractRefs[consumerId],
    )
    if (databaseLegacy) return databaseLegacy
    const paperIds = new Set(
      candidates.map((item) => item.detail?.paperId).filter(Boolean),
    )
    if (
      paperIds.size !== 1
      || candidates.some((item) => !item.detail?.paperId)
    ) throw rejected({
      disposition: 'incompatible',
      diagnostics: [{ code: 'CONSUMER_PAPER_SELECTION_AMBIGUOUS' }],
    })
    const consumption = load({
      paperId: [...paperIds][0],
      consumerId,
    })
    for (const item of candidates) {
      const familyContractId =
        item.detail.groupType === 'cloze' ? 'cloze' : 'grammar-fill'
      selectConsumerGroupMode({
        consumption,
        familyContractId,
        groupId: item.detail.id,
      })
    }
    return consumption
  }

  return Object.freeze({ load, resolveForItems })
}
