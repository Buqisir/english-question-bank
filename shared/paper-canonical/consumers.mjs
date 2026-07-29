import screen from '../../standards/paper-canonical/consumers/screen-v17.json' with { type: 'json' }
import printPdf from '../../standards/paper-canonical/consumers/print-pdf-v18.json' with { type: 'json' }

import { canonicalAuthorityRef, resolveCanonicalAuthority, validateJsonSchema } from './authority.mjs'
import { digestJson, withoutKey } from './stable.mjs'

const contracts = [screen, printPdf]
const byId = new Map(contracts.map((contract) => [contract.consumerId, contract]))

function validateContract(contract) {
  const authority = resolveCanonicalAuthority(canonicalAuthorityRef)
  const issues = validateJsonSchema(contract, authority.closure.schemas['consumer-contract-v2'], '$.consumerContract')
  if (contract.authorityManifestDigest !== canonicalAuthorityRef.manifestDigest) issues.push({ code: 'CONSUMER_AUTHORITY_MISMATCH' })
  if (contract.contractDigest !== digestJson(withoutKey(contract, 'contractDigest'))) issues.push({ code: 'CONSUMER_DIGEST_MISMATCH' })
  const families = new Set()
  for (const entry of contract.families || []) {
    const family = authority.closure.families.get(entry.familyContractId)
    if (!family || families.has(entry.familyContractId) || entry.version !== family.version || entry.digest !== digestJson(family) || typeof entry.canonical !== 'boolean' || !['available', 'retired'].includes(entry.legacyCapability)) {
      issues.push({ code: 'CONSUMER_FAMILY_CLOSURE_INVALID', family: entry.familyContractId })
    }
    families.add(entry.familyContractId)
  }
  if (families.size !== authority.closure.families.size) issues.push({ code: 'CONSUMER_FAMILY_CLOSURE_INCOMPLETE' })
  return issues
}

for (const contract of contracts) {
  const issues = validateContract(contract)
  if (issues.length > 0) throw new Error(`Invalid checked-in Consumer Contract: ${JSON.stringify(issues)}`)
}

export const consumerContractRefs = Object.freeze(Object.fromEntries(contracts.map((contract) => [contract.consumerId, Object.freeze({ id: contract.consumerId, version: contract.version, digest: contract.contractDigest })])))

export function resolveConsumerContract(ref) {
  const contract = byId.get(ref?.id)
  if (!contract || ref.version !== contract.version || ref.digest !== contract.contractDigest) return { ok: false, issues: [{ code: 'CONSUMER_CONTRACT_UNAVAILABLE', message: 'Consumer Contract id, version, or digest is unknown' }] }
  return { ok: true, contract }
}
