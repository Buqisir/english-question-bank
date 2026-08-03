import { consumerContractRefs, resolveConsumerContract } from '../../shared/paper-canonical/consumers.mjs'
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
    const consumerContract = consumerContractRefs[consumerId]
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
    const paperIds = new Set(
      candidates.map((item) => item.detail?.paperId).filter(Boolean),
    )
    let consumption
    if (paperIds.size === 1 && candidates.every((item) => item.detail?.paperId)) {
      consumption = load({
        paperId: [...paperIds][0],
        consumerId,
      })
    } else {
      let currentPaperIds
      try {
        currentPaperIds = db.prepare(`
          SELECT paper_id
          FROM canonical_paper_publications
          WHERE is_current = 1
          ORDER BY paper_id ASC
        `).all().map((row) => row.paper_id)
      } catch {
        currentPaperIds = []
      }
      const matches = []
      for (const paperId of currentPaperIds) {
        try {
          const candidate = load({ paperId, consumerId })
          const supportsAllGroups = candidates.every((item) => {
            const familyContractId = selectedFamilyContractIdForGroup({
              consumption: candidate,
              groupId: item.detail.id,
            })
            const expectedFamilyContractId = FAMILY_BY_GROUP_TYPE.get(
              item.detail.groupType,
            )
            return Boolean(
              familyContractId
              && (!expectedFamilyContractId || familyContractId === expectedFamilyContractId)
              && (expectedFamilyContractId || [
                'application-writing',
                'continuation-writing',
              ].includes(familyContractId)),
            )
          })
          if (supportsAllGroups) matches.push(candidate)
        } catch {
          // A current Publication that cannot prove every requested group is
          // not an identity candidate for this fail-closed public request.
        }
      }
      if (matches.length !== 1) throw rejected({
        disposition: 'incompatible',
        diagnostics: [{ code: 'CANONICAL_SOURCE_PAPER_ID_UNAVAILABLE' }],
      })
      consumption = matches[0]
    }
    for (const item of candidates) {
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
    return consumption
  }

  return Object.freeze({ load, resolveForItems })
}
