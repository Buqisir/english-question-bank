import screenV49 from '../../standards/paper-canonical/consumers/screen-v49.json' with { type: 'json' }
import printPdfV50 from '../../standards/paper-canonical/consumers/print-pdf-v50.json' with { type: 'json' }
import screenV48 from '../../standards/paper-canonical/consumers/screen-v48.json' with { type: 'json' }
import printPdfV49 from '../../standards/paper-canonical/consumers/print-pdf-v49.json' with { type: 'json' }
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
import screenV47 from '../../standards/paper-canonical/consumers/screen-v47.json' with { type: 'json' }
import printPdfV48 from '../../standards/paper-canonical/consumers/print-pdf-v48.json' with { type: 'json' }

import { authorityRefForManifestDigest, closureAdmitsApplicationDrawingArea, closureRendersApplicationDrawingArea, closureAdmitsReadingStemFigures, closureRendersApplicationPromptFigures, resolveCanonicalAuthority, validateJsonSchema } from './authority.mjs'
import { digestJson, withoutKey } from './stable.mjs'

const historicalContracts = [screen, printPdf, screenV40, printPdfV41, screenV41, printPdfV42, screenV42, printPdfV43, screenV43, printPdfV44, screenV44, printPdfV45, screenV45, printPdfV46, screenV46, printPdfV47, screenV47, printPdfV48]
const contracts = [screenV48, printPdfV49]
const stemFigureContracts = [screenV49, printPdfV50]
const allContracts = [...historicalContracts, ...contracts, ...stemFigureContracts]

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

// Select by immutable paper authority; no-figure publications retain their
// existing consumer identities and historical byte output.
export function consumerContractRefsForAuthority(authorityRef) {
  const authority = resolveCanonicalAuthority(authorityRef)
  return authority.ok && closureAdmitsReadingStemFigures(authority.closure)
    ? Object.fromEntries(stemFigureContracts.map(contract => [contract.consumerId,
      { id: contract.consumerId, version: contract.version, digest: contract.contractDigest }]))
    : consumerContractRefs
}

export function consumerRendersReadingStemFigures(ref) {
  const resolved = resolveConsumerContract(ref)
  if (!resolved.ok) return false
  const authority = resolveCanonicalAuthority(authorityRefForManifestDigest(resolved.contract.authorityManifestDigest))
  return authority.ok && closureAdmitsReadingStemFigures(authority.closure)
}

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

// A figure-bearing Application Writing prompt is consumable only by a consumer
// whose own closure registers the renderer-owned prompt-figure capability.
export function consumerRendersApplicationPromptFigures(ref) {
  if (!ref) return false
  const resolved = resolveConsumerContract(ref)
  if (!resolved.ok) return false
  const authority = resolveCanonicalAuthority(authorityRefForManifestDigest(resolved.contract.authorityManifestDigest))
  return authority.ok && closureRendersApplicationPromptFigures(authority.closure)
}

export function consumerRendersApplicationDrawingArea(ref) {
  const result = resolveConsumerContract(ref)
  if (!result.ok) return false
  const authority = resolveCanonicalAuthority(authorityRefForManifestDigest(result.contract.authorityManifestDigest))
  return authority.ok && closureRendersApplicationDrawingArea(authority.closure)
}

const refFor = contract => Object.freeze({
  id: contract.consumerId, version: contract.version, digest: contract.contractDigest,
})
const sameRef = (a, b) => digestJson(a) === digestJson(b)
const drawingAreaEvidence = Object.freeze({
  addedCapabilities: Object.freeze(['application-drawing-area']),
  // #549 only adds conditional drawing-area projection/layout. Old closures
  // cannot admit it. Verify both source revisions, not just two contract refs
  // under one renderer (verify-review-consumer-succession + release acceptance).
  evidence: '20c8e048 vs 4575c609: conditional drawing-area renderer branches; verify-application-drawing-area.mjs; preview-application-drawing-area.mjs',
})
const stemFigureEvidence = Object.freeze({
  addedCapabilities: Object.freeze(['reading-stem-figures']),
  // #551 keeps every no-stem renderer branch unchanged. Acceptance compares
  // v5/v6 Screen models and Print bytes, baseline PaperSurface DOM/geometry/
  // lossless pixels, and the historical v5 three-product 17-page PDF replay.
  evidence: '#551 vs ae982562: conditional stemFigures renderer branches; verify-reading-stem-figures.mjs; stem-figures/render-acceptance historical v5 17-page pixel and rebase2 Screen parity',
})
export const reviewConsumerSuccessions = Object.freeze([
  Object.freeze({ from: refFor(screenV47), to: refFor(screenV48), ...drawingAreaEvidence }),
  Object.freeze({ from: refFor(printPdfV48), to: refFor(printPdfV49), ...drawingAreaEvidence }),
  Object.freeze({ from: refFor(screenV48), to: refFor(screenV49), ...stemFigureEvidence }),
  Object.freeze({ from: refFor(printPdfV49), to: refFor(printPdfV50), ...stemFigureEvidence }),
])
export const reviewConsumerPairs = Object.freeze([
  Object.freeze({ screen: refFor(screenV47), print_pdf: refFor(printPdfV48) }),
  Object.freeze({ screen: refFor(screenV48), print_pdf: refFor(printPdfV49) }),
  Object.freeze({ screen: refFor(screenV49), print_pdf: refFor(printPdfV50), ...stemFigureEvidence }),
])

// Validate declarations at startup. This does not grant callers permission to
// supply alternate edges to the runtime proof below.
export function validateReviewConsumerRelations(edges, pairs) {
  const key = ref => digestJson(ref)
  const graph = new Map()
  for (const edge of edges) {
    if (!resolveConsumerContract(edge.from).ok || !resolveConsumerContract(edge.to).ok
      || edge.from.id !== edge.to.id || sameRef(edge.from, edge.to)
      || !edge.evidence || !edge.addedCapabilities?.length
      || edge.addedCapabilities.some(capability => !['application-drawing-area', 'reading-stem-figures'].includes(capability))) {
      throw new Error('Invalid Review consumer succession')
    }
    const next = graph.get(key(edge.from)) || []
    if (next.includes(key(edge.to))) throw new Error('Duplicate Review consumer succession')
    next.push(key(edge.to))
    graph.set(key(edge.from), next)
  }
  const visiting = new Set()
  const visited = new Set()
  function visit(node) {
    if (visiting.has(node)) throw new Error('Cyclic Review consumer succession')
    if (visited.has(node)) return
    visiting.add(node)
    for (const next of graph.get(node) || []) visit(next)
    visiting.delete(node)
    visited.add(node)
  }
  for (const node of graph.keys()) visit(node)
  const paired = new Set()
  for (const pair of pairs) {
    const screen = resolveConsumerContract(pair.screen)
    const print = resolveConsumerContract(pair.print_pdf)
    if (!screen.ok || !print.ok || pair.screen.id !== 'screen' || pair.print_pdf.id !== 'print_pdf'
      || ['families', 'projectorVersion', 'authorityManifestDigest', 'schemaVersion']
        .some(field => digestJson(screen.contract[field]) !== digestJson(print.contract[field]))
      || paired.has(key(pair.screen)) || paired.has(key(pair.print_pdf))) {
      throw new Error('Invalid Review consumer pair')
    }
    paired.add(key(pair.screen))
    paired.add(key(pair.print_pdf))
  }
}
validateReviewConsumerRelations(reviewConsumerSuccessions, reviewConsumerPairs)

// Prove a representation-only comparison mapping. No numeric ordering, reverse
// inheritance, inferred edge, or caller-defined graph is accepted. Identity
// never traverses an edge and therefore needs no capability exception.
export function proveReviewConsumerComparison({ baselineRef, actualRef, paperAuthorityRef }) {
  const rejected = () => ({ ok: false, reasonCode: 'UNSUPPORTED_CONSUMER_SUCCESSION' })
  const exactRef = ref => ref && Object.keys(ref).sort().join(',') === 'digest,id,version'
  if (!exactRef(baselineRef) || !exactRef(actualRef)) return rejected()
  if (!resolveConsumerContract(baselineRef).ok || !resolveConsumerContract(actualRef).ok) return rejected()
  if (sameRef(baselineRef, actualRef)) return { ok: true, edges: [], paired: false }
  let start = baselineRef
  let paired = false
  if (baselineRef.id !== actualRef.id) {
    const pair = reviewConsumerPairs.find(pair => sameRef(pair[baselineRef.id], baselineRef))
    if (!pair?.[actualRef.id]) return rejected()
    start = pair[actualRef.id]
    paired = true
  }
  function pathFrom(ref, seen = new Set()) {
    if (sameRef(ref, actualRef)) return []
    const key = digestJson(ref)
    if (seen.has(key)) return null
    const nextSeen = new Set([...seen, key])
    for (const edge of reviewConsumerSuccessions.filter(edge => sameRef(edge.from, ref))) {
      const rest = pathFrom(edge.to, nextSeen)
      if (rest) return [edge, ...rest]
    }
    return null
  }
  const edges = pathFrom(start)
  if (!edges) return rejected()
  const authority = resolveCanonicalAuthority(paperAuthorityRef)
  if (!authority.ok) return rejected()
  if (edges.length) {
    for (const edge of edges) for (const capability of edge.addedCapabilities) {
      // Evaluate only this edge's delta. A drawing-capable paper can cross
      // the stem-only edge, but cannot cross the earlier drawing-area edge.
      const admitsCapability = capability === 'application-drawing-area'
        ? closureAdmitsApplicationDrawingArea(authority.closure)
        : capability === 'reading-stem-figures'
          ? closureAdmitsReadingStemFigures(authority.closure)
          : true
      if (admitsCapability) return rejected()
    }
  }
  return { ok: true, edges, paired }
}
