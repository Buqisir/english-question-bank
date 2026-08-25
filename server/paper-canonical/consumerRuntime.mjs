import {
  consumerContractRefs,
  readingOptionFigureConsumerContractRefs,
  resolveConsumerContract,
} from '../../shared/paper-canonical/consumers.mjs'
import {
  createFileSystemCanonicalPublicationStore,
  loadPaperForConsumptionSync,
} from './publication.mjs'
import {
  selectedFamilyContractIdForGroup,
  selectConsumerGroupMode,
} from '../../shared/paper-canonical/consumerProjection.mjs'

const FAMILY_BY_GROUP_TYPE = new Map([
  ['cloze', 'cloze'],
  ['grammarFill', 'grammar-fill'],
  ['grammar_cloze', 'grammar-fill'],
  ['sevenChoices', 'seven-choices'],
  ['seven_choices', 'seven-choices'],
  ['reading', 'reading'],
])
const SAFE_PAPER_ID = /^[a-z0-9][a-z0-9._-]{0,127}$/
const sourceConsumptionsByComposite = new WeakMap()
const sourceConsumptionsByGroup = new WeakMap()

function freezeTree(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeTree))
  if (value && typeof value === 'object') {
    return Object.freeze(Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, freezeTree(child)]),
    ))
  }
  return value
}

function rejected(result) {
  const error = new Error(
    `Canonical consumption unavailable: ${result.diagnostics?.map((item) => item.code).join(', ') || result.disposition}`,
  )
  error.code = 'CANONICAL_CONSUMPTION_REJECTED'
  error.diagnostics = result.diagnostics || []
  return error
}

function isActiveCanonicalItem(item) {
  return FAMILY_BY_GROUP_TYPE.has(item?.detail?.groupType)
    || ['writing', 'continuation'].includes(item?.detail?.groupType)
}

function currentPublicationUsesReadingOptionFigureAuthority(store, currentRef) {
  if (!currentRef) return false
  const bytes = store.readVersionArtifact(
    currentRef,
    'canonical/canonical-paper-publication-v46.json',
  )
  if (!bytes) return false
  let manifest
  try {
    manifest = JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    throw rejected({
      disposition: 'incompatible',
      diagnostics: [{ code: 'CANONICAL_PUBLICATION_MANIFEST_INVALID' }],
    })
  }
  if (
    manifest?.paperId !== currentRef.paperId
    || manifest?.sourceAssetVersion !== currentRef.sourceAssetVersion
    || manifest?.publicationDigest !== currentRef.publicationDigest
    || manifest?.authority?.manifestVersion !== '46'
  ) throw rejected({
    disposition: 'incompatible',
    diagnostics: [{ code: 'CANONICAL_PUBLICATION_REF_MISMATCH' }],
  })
  return true
}

export function canonicalSourceConsumptionForGroup(consumption, groupId) {
  return sourceConsumptionsByGroup.get(consumption)?.get(groupId)
    || consumption
}

export function canonicalSourceConsumptionForPaper(consumption, paperId) {
  const sourceConsumptions = sourceConsumptionsByComposite.get(consumption)
  if (sourceConsumptions) return sourceConsumptions.get(paperId) || null
  return consumption?.paperId === paperId ? consumption : null
}

function composeConsumptions({ candidates, consumptionsByPaperId }) {
  const selectionsByFamily = new Map()
  const consumptionsByGroupId = new Map()
  const mediaIds = new Set()

  for (const item of candidates) {
    const groupId = item.detail.id
    if (consumptionsByGroupId.has(groupId)) throw rejected({
      disposition: 'incompatible',
      diagnostics: [{ code: 'CANONICAL_CONSUMER_GROUP_AMBIGUOUS' }],
    })
    const sourceConsumption = consumptionsByPaperId.get(item.detail.paperId)
    const familyContractId = selectedFamilyContractIdForGroup({
      consumption: sourceConsumption,
      groupId,
    })
    const sourceSelection = selectConsumerGroupMode({
      consumption: sourceConsumption,
      familyContractId,
      groupId,
    })
    const targetSelection = selectionsByFamily.get(familyContractId) || {
      mode: 'canonical',
      familyContractId,
      groupIds: [],
      projectedOccurrences: [],
      projectedOccurrenceDigests: [],
    }
    const occurrence = sourceSelection.projectedOccurrences?.find(
      (candidate) => candidate.groupId === groupId,
    )
    const occurrenceDigest = sourceSelection.projectedOccurrenceDigests?.find(
      (candidate) => candidate.groupId === groupId,
    )
    targetSelection.groupIds.push(groupId)
    if (occurrence) {
      targetSelection.projectedOccurrences.push(structuredClone(occurrence))
      for (const media of occurrence.media || []) mediaIds.add(media.mediaId)
    }
    if (occurrenceDigest) {
      targetSelection.projectedOccurrenceDigests.push(
        structuredClone(occurrenceDigest),
      )
    }
    selectionsByFamily.set(familyContractId, targetSelection)
    consumptionsByGroupId.set(groupId, sourceConsumption)
  }

  const mediaById = new Map()
  for (const sourceConsumption of consumptionsByPaperId.values()) {
    for (const artifact of sourceConsumption.mediaArtifacts || []) {
      if (!mediaIds.has(artifact.mediaId)) continue
      const existing = mediaById.get(artifact.mediaId)
      if (existing && JSON.stringify(existing) !== JSON.stringify(artifact)) {
        throw rejected({
          disposition: 'incompatible',
          diagnostics: [{ code: 'CANONICAL_CONSUMER_MEDIA_AMBIGUOUS' }],
        })
      }
      mediaById.set(artifact.mediaId, structuredClone(artifact))
    }
  }
  const selections = [...selectionsByFamily.values()].map((selection) => ({
    ...selection,
    ...(
      selection.projectedOccurrences.length === selection.groupIds.length
        ? {}
        : { projectedOccurrences: undefined }
    ),
    ...(
      selection.projectedOccurrenceDigests.length > 0
        ? {}
        : { projectedOccurrenceDigests: undefined }
    ),
  }))
  const sourceBindings = [...consumptionsByPaperId.entries()]
    .sort(([leftPaperId], [rightPaperId]) =>
      leftPaperId.localeCompare(rightPaperId),
    )
    .map(([paperId, consumption]) => ({
      paperId,
      sourceAssetVersion: consumption.sourceAssetVersion,
      publicationDigest: consumption.publicationDigest,
      consumerContractRef: consumption.consumerContractRef,
      sourceAssetDigest: consumption.sourceAssetDigest,
      authorityRef: consumption.authorityRef,
      groupIds: candidates
        .filter((item) => item.detail.paperId === paperId)
        .map((item) => item.detail.id),
    }))
  const composite = freezeTree({
    disposition: 'ready',
    selections,
    mediaArtifacts: [...mediaById.values()],
    composition: {
      kind: 'draft-paper',
      sources: sourceBindings,
    },
    diagnostics: [],
  })
  sourceConsumptionsByComposite.set(composite, consumptionsByPaperId)
  sourceConsumptionsByGroup.set(composite, consumptionsByGroupId)
  return composite
}

export function createCanonicalConsumerRuntime({ rootDir, db }) {
  const store = {
    ...createFileSystemCanonicalPublicationStore({ rootDir, db }),
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
    const currentRef = store.readPublishedRefs(paperId).current
    const contractSet = currentPublicationUsesReadingOptionFigureAuthority(
      store,
      currentRef,
    )
      ? readingOptionFigureConsumerContractRefs
      : consumerContractRefs
    const consumerContract = contractSet[consumerId]
    if (!consumerContract) throw rejected({
      disposition: 'incompatible',
      diagnostics: [{ code: 'CONSUMER_CONTRACT_UNAVAILABLE' }],
    })
    const result = loadPaperForConsumptionSync({
      paperId,
      consumerContract,
    }, store)
    if (result.disposition !== 'ready') throw rejected(result)
    return result
  }

  function resolveForItems({ consumerId, items }) {
    const candidates = items.filter(isActiveCanonicalItem)
    if (candidates.length === 0) return null
    if (candidates.some(
      (item) =>
        typeof item.detail?.paperId !== 'string'
        || !SAFE_PAPER_ID.test(item.detail.paperId)
        || !item.detail?.id,
    )) throw rejected({
      disposition: 'incompatible',
      diagnostics: [{ code: 'CANONICAL_SOURCE_PAPER_ID_UNAVAILABLE' }],
    })
    const paperIds = [...new Set(
      candidates.map((item) => item.detail.paperId),
    )]
    const consumptionsByPaperId = new Map(paperIds.map((paperId) => [
      paperId,
      load({ paperId, consumerId }),
    ]))
    for (const item of candidates) {
      const consumption = consumptionsByPaperId.get(item.detail.paperId)
      const selectedFamilyContractId = selectedFamilyContractIdForGroup({
        consumption,
        groupId: item.detail.id,
      })
      const expectedFamilyContractId = FAMILY_BY_GROUP_TYPE.get(
        item.detail.groupType,
      )
      if (
        !selectedFamilyContractId
        || (
          expectedFamilyContractId
          && selectedFamilyContractId !== expectedFamilyContractId
        )
        || (
          !expectedFamilyContractId
          && ![
            'application-writing',
            'continuation-writing',
          ].includes(selectedFamilyContractId)
        )
      ) throw rejected({
        disposition: 'incompatible',
        diagnostics: [{ code: 'CANONICAL_CONSUMER_GROUP_UNAVAILABLE' }],
      })
      selectConsumerGroupMode({
        consumption,
        familyContractId: selectedFamilyContractId,
        groupId: item.detail.id,
      })
    }
    if (paperIds.length === 1) return consumptionsByPaperId.get(paperIds[0])
    return composeConsumptions({ candidates, consumptionsByPaperId })
  }

  return Object.freeze({ load, resolveForItems })
}
