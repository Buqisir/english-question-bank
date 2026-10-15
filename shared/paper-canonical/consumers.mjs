import screen from '../../standards/paper-canonical/consumers/screen-v39.json' with { type: 'json' }
import printPdf from '../../standards/paper-canonical/consumers/print-pdf-v40.json' with { type: 'json' }
import screenV40 from '../../standards/paper-canonical/consumers/screen-v40.json' with { type: 'json' }
import printPdfV41 from '../../standards/paper-canonical/consumers/print-pdf-v41.json' with { type: 'json' }
import screenV41 from '../../standards/paper-canonical/consumers/screen-v41.json' with { type: 'json' }
import printPdfV42 from '../../standards/paper-canonical/consumers/print-pdf-v42.json' with { type: 'json' }
import screenV42 from '../../standards/paper-canonical/consumers/screen-v42.json' with { type: 'json' }
import printPdfV43 from '../../standards/paper-canonical/consumers/print-pdf-v43.json' with { type: 'json' }
import screenV43 from '../../standards/paper-canonical/consumers/screen-v43.json' with { type: 'json' }
import printPdfV44 from '../../standards/paper-canonical/consumers/print-pdf-v44.json' with { type: 'json' }
import screenV44 from '../../standards/paper-canonical/consumers/screen-v44.json' with { type: 'json' }
import printPdfV45 from '../../standards/paper-canonical/consumers/print-pdf-v45.json' with { type: 'json' }
import screenV45 from '../../standards/paper-canonical/consumers/screen-v45.json' with { type: 'json' }
import printPdfV46 from '../../standards/paper-canonical/consumers/print-pdf-v46.json' with { type: 'json' }
import screenV46 from '../../standards/paper-canonical/consumers/screen-v46.json' with { type: 'json' }
import printPdfV47 from '../../standards/paper-canonical/consumers/print-pdf-v47.json' with { type: 'json' }

import { authorityRefForManifestDigest, resolveCanonicalAuthority, validateJsonSchema } from './authority.mjs'
import { digestJson, withoutKey } from './stable.mjs'

const historicalContracts = [screen, printPdf, screenV40, printPdfV41, screenV41, printPdfV42, screenV42, printPdfV43, screenV43, printPdfV44, screenV44, printPdfV45, screenV45, printPdfV46]
const contracts = [screenV46, printPdfV47]
const allContracts = [...historicalContracts, ...contracts]

function validateContract(contract) {
  const authorityRef = authorityRefForManifestDigest(contract.authorityManifestDigest)
  if (!authorityRef) return [{ code: 'CONSUMER_AUTHORITY_MISMATCH' }]
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

export function resolveConsumerPresentation(ref) {
  if (!ref) return null // Pre-contract historical projections keep their layout.
  const resolved = resolveConsumerContract(ref)
  if (!resolved.ok) throw Object.assign(new Error('Invalid presentation consumer contract'), { code: 'CANONICAL_CONSUMPTION_REJECTED' })
  const authorityRef = authorityRefForManifestDigest(resolved.contract.authorityManifestDigest)
  const { closure } = resolveCanonicalAuthority(authorityRef)
  const policy = closure.artifacts['renderer-paper-presentation']
  if (!policy) return null
  return { policy, ref: { id: 'paper-presentation', version: policy.version, digest: digestJson(policy) } }
}
