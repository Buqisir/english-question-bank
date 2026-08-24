import screen from '../../standards/paper-canonical/consumers/screen-v37.json' with { type: 'json' }
import printPdf from '../../standards/paper-canonical/consumers/print-pdf-v38.json' with { type: 'json' }
import screenReadingOptionFigure from '../../standards/paper-canonical/consumers/screen-v38.json' with { type: 'json' }
import printPdfReadingOptionFigure from '../../standards/paper-canonical/consumers/print-pdf-v39.json' with { type: 'json' }

import { canonicalAuthorityRef, readingOptionFigureAuthorityRef, resolveCanonicalAuthority, validateJsonSchema } from './authority.mjs'
import { digestJson, withoutKey } from './stable.mjs'

const contracts = [screen, printPdf]
const readingOptionFigureContracts = [screenReadingOptionFigure, printPdfReadingOptionFigure]
const allContracts = [...contracts, ...readingOptionFigureContracts]
const byRef = new Map(allContracts.map((contract) => [
  `${contract.consumerId}:${contract.version}:${contract.contractDigest}`,
  contract,
]))

function validateContract(contract) {
  const authorityRef = contract.authorityManifestDigest === canonicalAuthorityRef.manifestDigest
    ? canonicalAuthorityRef
    : contract.authorityManifestDigest === readingOptionFigureAuthorityRef.manifestDigest
      ? readingOptionFigureAuthorityRef
      : null
  const authority = resolveCanonicalAuthority(authorityRef)
  if (!authority.ok) return [{ code: 'CONSUMER_AUTHORITY_MISMATCH' }]
  const issues = validateJsonSchema(contract, authority.closure.schemas['consumer-contract-v2'], '$.consumerContract')
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
  return issues
}

for (const contract of allContracts) {
  const issues = validateContract(contract)
  if (issues.length > 0) throw new Error(`Invalid checked-in Consumer Contract: ${JSON.stringify(issues)}`)
}

export const consumerContractRefs = Object.freeze(Object.fromEntries(contracts.map((contract) => [contract.consumerId, Object.freeze({ id: contract.consumerId, version: contract.version, digest: contract.contractDigest })])))
export const readingOptionFigureConsumerContractRefs = Object.freeze(Object.fromEntries(readingOptionFigureContracts.map((contract) => [contract.consumerId, Object.freeze({ id: contract.consumerId, version: contract.version, digest: contract.contractDigest })])))

export function resolveConsumerContract(ref) {
  const contract = byRef.get(`${ref?.id}:${ref?.version}:${ref?.digest}`)
  if (!contract) return { ok: false, issues: [{ code: 'CONSUMER_CONTRACT_UNAVAILABLE', message: 'Consumer Contract id, version, or digest is unknown' }] }
  return { ok: true, contract }
}
