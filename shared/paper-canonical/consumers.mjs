import screen from '../../standards/paper-canonical/consumers/screen-v37.json' with { type: 'json' }
import printPdf from '../../standards/paper-canonical/consumers/print-pdf-v38.json' with { type: 'json' }
import screenReadingOptionFigure from '../../standards/paper-canonical/consumers/screen-v39.json' with { type: 'json' }
import printPdfReadingOptionFigure from '../../standards/paper-canonical/consumers/print-pdf-v40.json' with { type: 'json' }
import screenLegacyFormat2Rich from '../../standards/paper-canonical/consumers/screen-v41.json' with { type: 'json' }
import printPdfLegacyFormat2Rich from '../../standards/paper-canonical/consumers/print-pdf-v42.json' with { type: 'json' }
import screenFormat2Rich from '../../standards/paper-canonical/consumers/screen-v43.json' with { type: 'json' }
import printPdfFormat2Rich from '../../standards/paper-canonical/consumers/print-pdf-v44.json' with { type: 'json' }

import {
  canonicalAuthorityRef,
  format2RichCandidateAuthorityRef,
  legacyFormat2RichAuthorityRef,
  readingOptionFigureAuthorityRef,
  readingOptionFigureSourceLayoutSchemaAuthorityRef,
  resolveCanonicalAuthority,
  validateJsonSchema,
} from './authority.mjs'
import { digestJson, withoutKey } from './stable.mjs'

const contracts = [screen, printPdf]
const readingOptionFigureContracts = [screenReadingOptionFigure, printPdfReadingOptionFigure]
const legacyFormat2RichContracts = [screenLegacyFormat2Rich, printPdfLegacyFormat2Rich]
const format2RichContracts = [screenFormat2Rich, printPdfFormat2Rich]
const allContracts = [
  ...contracts,
  ...readingOptionFigureContracts,
  ...legacyFormat2RichContracts,
  ...format2RichContracts,
]
const byRef = new Map(allContracts.map((contract) => [
  `${contract.consumerId}:${contract.version}:${contract.contractDigest}`,
  contract,
]))

function validateContract(contract) {
  const authorityRef = contract.authorityManifestDigest === canonicalAuthorityRef.manifestDigest
    ? canonicalAuthorityRef
    : contract.authorityManifestDigest === readingOptionFigureAuthorityRef.manifestDigest
      ? readingOptionFigureAuthorityRef
      : contract.authorityManifestDigest === legacyFormat2RichAuthorityRef.manifestDigest
        ? legacyFormat2RichAuthorityRef
        : contract.authorityManifestDigest === format2RichCandidateAuthorityRef.manifestDigest
          ? format2RichCandidateAuthorityRef
          : null
  const authority = resolveCanonicalAuthority(authorityRef)
  if (!authority.ok) return [{ code: 'CONSUMER_AUTHORITY_MISMATCH' }]
  const sourceLayoutSchemaAuthority = resolveCanonicalAuthority(
    readingOptionFigureSourceLayoutSchemaAuthorityRef,
  )
  const contractSchema = contract.schemaVersion === 'consumer-contract-v3'
    ? sourceLayoutSchemaAuthority.ok
      ? sourceLayoutSchemaAuthority.closure.schemas['consumer-contract-v3']
      : null
    : authority.closure.schemas['consumer-contract-v2']
  const issues = contractSchema
    ? validateJsonSchema(contract, contractSchema, '$.consumerContract')
    : [{ code: 'CONSUMER_SCHEMA_UNAVAILABLE' }]
  if (contract.authorityManifestDigest !== authorityRef.manifestDigest) issues.push({ code: 'CONSUMER_AUTHORITY_MISMATCH' })
  if (contract.contractDigest !== digestJson(withoutKey(contract, 'contractDigest'))) issues.push({ code: 'CONSUMER_DIGEST_MISMATCH' })
  const families = new Set()
  for (const entry of contract.families || []) {
    const family = authority.closure.families.get(entry.familyContractId)
    if (!family || families.has(entry.familyContractId) || entry.version !== family.version || entry.digest !== digestJson(family) || entry.canonical !== true || Object.hasOwn(entry, 'legacyCapability')) {
      issues.push({ code: 'CONSUMER_FAMILY_CLOSURE_INVALID', family: entry.familyContractId })
    }
    families.add(entry.familyContractId)
  }
  if (families.size !== authority.closure.families.size) issues.push({ code: 'CONSUMER_FAMILY_CLOSURE_INCOMPLETE' })
  if (contract.schemaVersion === 'consumer-contract-v3') {
    const extension = contract.renderingExtensions?.[0]
    const requirementSchema = sourceLayoutSchemaAuthority.ok
      ? sourceLayoutSchemaAuthority.closure.schemas[
          extension?.requirementSchemaRef?.schemaId
        ]
      : null
    const intentSchema = sourceLayoutSchemaAuthority.ok
      ? sourceLayoutSchemaAuthority.closure.schemas[extension?.intentSchemaRef?.schemaId]
      : null
    if (
      contract.renderingExtensions?.length !== 1
      || extension?.extensionId !== 'reading-option-figure-source-layout'
      || extension.version !== '1'
      || extension.binding
        !== 'projected_question_requirement_to_consumption_intent_digest'
      || extension.requirementSchemaRef?.authorityManifestId
        !== readingOptionFigureSourceLayoutSchemaAuthorityRef.manifestId
      || extension.requirementSchemaRef?.authorityManifestVersion
        !== readingOptionFigureSourceLayoutSchemaAuthorityRef.manifestVersion
      || extension.requirementSchemaRef?.authorityManifestDigest
        !== readingOptionFigureSourceLayoutSchemaAuthorityRef.manifestDigest
      || extension.intentSchemaRef?.authorityManifestId
        !== readingOptionFigureSourceLayoutSchemaAuthorityRef.manifestId
      || extension.intentSchemaRef?.authorityManifestVersion
        !== readingOptionFigureSourceLayoutSchemaAuthorityRef.manifestVersion
      || extension.intentSchemaRef?.authorityManifestDigest
        !== readingOptionFigureSourceLayoutSchemaAuthorityRef.manifestDigest
      || !requirementSchema
      || extension.requirementSchemaRef.schemaDigest !== digestJson(requirementSchema)
      || !intentSchema
      || extension.intentSchemaRef.schemaDigest !== digestJson(intentSchema)
    ) {
      issues.push({ code: 'CONSUMER_RENDERING_EXTENSION_INVALID' })
    }
  } else if (Object.hasOwn(contract, 'renderingExtensions')) {
    issues.push({ code: 'CONSUMER_RENDERING_EXTENSION_UNVERSIONED' })
  }
  return issues
}

for (const contract of allContracts) {
  const issues = validateContract(contract)
  if (issues.length > 0) throw new Error(`Invalid checked-in Consumer Contract: ${JSON.stringify(issues)}`)
}

export const consumerContractRefs = Object.freeze(Object.fromEntries(contracts.map((contract) => [contract.consumerId, Object.freeze({ id: contract.consumerId, version: contract.version, digest: contract.contractDigest })])))
export const readingOptionFigureConsumerContractRefs = Object.freeze(Object.fromEntries(readingOptionFigureContracts.map((contract) => [contract.consumerId, Object.freeze({ id: contract.consumerId, version: contract.version, digest: contract.contractDigest })])))
export const legacyFormat2RichConsumerContractRefs = Object.freeze(Object.fromEntries(legacyFormat2RichContracts.map((contract) => [contract.consumerId, Object.freeze({ id: contract.consumerId, version: contract.version, digest: contract.contractDigest })])))
export const format2RichConsumerContractRefs = Object.freeze(Object.fromEntries(format2RichContracts.map((contract) => [contract.consumerId, Object.freeze({ id: contract.consumerId, version: contract.version, digest: contract.contractDigest })])))
const sourceLayoutExtension = screenReadingOptionFigure.renderingExtensions[0]
if (
  digestJson(sourceLayoutExtension)
  !== digestJson(printPdfReadingOptionFigure.renderingExtensions[0])
) {
  throw new Error('Reading Option Figure source-layout extension contracts drifted')
}
export const readingOptionFigureSourceLayoutExtension = Object.freeze(
  structuredClone(sourceLayoutExtension),
)

export function resolveConsumerContract(ref) {
  const contract = byRef.get(`${ref?.id}:${ref?.version}:${ref?.digest}`)
  if (!contract) return { ok: false, issues: [{ code: 'CONSUMER_CONTRACT_UNAVAILABLE', message: 'Consumer Contract id, version, or digest is unknown' }] }
  return { ok: true, contract }
}
