import screen from '../../standards/paper-canonical/consumers/screen-v39.json' with { type: 'json' }
import printPdf from '../../standards/paper-canonical/consumers/print-pdf-v40.json' with { type: 'json' }
import screenV40 from '../../standards/paper-canonical/consumers/screen-v40.json' with { type: 'json' }
import printPdfV41 from '../../standards/paper-canonical/consumers/print-pdf-v41.json' with { type: 'json' }

import { nck1MaterializationCandidateAuthorityRef, resolveCanonicalAuthority, validateJsonSchema } from './authority.mjs'
import { digestJson, withoutKey } from './stable.mjs'

const historicalContracts = [screen, printPdf]
const contracts = [screenV40, printPdfV41]
const allContracts = [...historicalContracts, ...contracts]

function validateContract(contract) {
  const authorityRef = contract.authorityManifestDigest === nck1MaterializationCandidateAuthorityRef.manifestDigest
    ? nck1MaterializationCandidateAuthorityRef
    : { manifestId: 'paper-canonical', manifestVersion: '51', manifestDigest: contract.authorityManifestDigest }
  const authority = resolveCanonicalAuthority(authorityRef)
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

export function resolveConsumerContract(ref) {
  const contract = allContracts.find((candidate) => candidate.consumerId === ref?.id && candidate.version === ref?.version)
  if (!contract || ref.version !== contract.version || ref.digest !== contract.contractDigest) return { ok: false, issues: [{ code: 'CONSUMER_CONTRACT_UNAVAILABLE', message: 'Consumer Contract id, version, or digest is unknown' }] }
  return { ok: true, contract }
}
