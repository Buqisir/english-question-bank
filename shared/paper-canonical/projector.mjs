import { resolveCanonicalAuthority, slotsForProfile, validateJsonSchema } from './authority.mjs'
import { cloneJson, digestJson } from './stable.mjs'

function projectionError(message, issues) {
  const error = new Error(message)
  error.code = 'CANONICAL_PROJECTION_REJECTED'
  error.issues = issues
  return error
}

function groupSemanticPayload(group) {
  const { sourceMap: _sourceMap, sourceFingerprint: _sourceFingerprint, semanticDigest: _semanticDigest, ...semantic } = group
  return semantic
}

function sourceMapCoverageIssues(group) {
  const issues = []
  const expected = new Set([
    `group:${group.identity.groupId}`,
    ...group.questionRefs.map(({ questionId }) => `question:${questionId}`),
    ...group.blankRefs.map(({ blankId }) => `blank:${blankId}`),
    ...group.media.map(({ mediaId }) => `media:${mediaId}`),
  ])
  const seen = new Set()
  for (const entry of group.sourceMap.entries) {
    const identity = `${entry.target.kind}:${entry.target.id}`
    if (seen.has(identity)) issues.push(`duplicate source-map target ${identity}`)
    seen.add(identity)
    if (!Array.isArray(entry.sourceSpanRefs) || entry.sourceSpanRefs.length === 0) issues.push(`missing source-map span for ${identity}`)
  }
  for (const identity of expected) if (!seen.has(identity)) issues.push(`missing source-map target ${identity}`)
  return issues
}

function choiceOwnershipIssues(group, family) {
  const choice = group.variant.choiceOwnership
  if (!choice || choice.ownership !== family.choiceOwnership) return ['choice ownership does not match family contract']
  if (choice.ownership === 'none') return Object.keys(choice).length === 1 ? [] : ['non-choice family carries option fields']
  if (choice.ownership === 'shared_bank') {
    return Object.keys(choice).sort().join(',') === 'bankId,options,ownership' && Array.isArray(choice.options) && choice.options.length > 0
      ? []
      : ['shared bank is duplicated, incomplete, or mixed with question sets']
  }
  const expectedQuestionIds = group.questionRefs.map(({ questionId }) => questionId)
  const sets = choice.sets
  if (Object.keys(choice).sort().join(',') !== 'ownership,sets' || !Array.isArray(sets)) return ['per-question choices carry a group bank or invalid fields']
  const actualQuestionIds = sets.map((set) => set.questionId)
  return actualQuestionIds.length === expectedQuestionIds.length && new Set(actualQuestionIds).size === actualQuestionIds.length && actualQuestionIds.every((id) => expectedQuestionIds.includes(id))
    ? []
    : ['per-question choices do not cover every Question exactly once']
}

function assertCanonicalPackage(canonicalPackage) {
  const authority = resolveCanonicalAuthority(canonicalPackage?.authorityClosure?.authorityRef || canonicalPackage?.plan?.authorityRef)
  if (!authority.ok) throw projectionError('Canonical authority is unavailable', authority.issues)
  const closure = authority.closure
  const planIssues = validateJsonSchema(canonicalPackage?.plan, closure.schemas['canonical-paper-plan-v1'], '$.plan')
  if (planIssues.length > 0) throw projectionError('Canonical Plan is schema-invalid', planIssues)
  const plan = canonicalPackage.plan
  if (plan.authorityRef.manifestDigest !== closure.authorityRef.manifestDigest) throw projectionError('Plan authority does not close against the resolved manifest', [])
  const profile = closure.profiles.get(plan.profileRef.profileId)
  if (!profile || plan.profileRef.profileVersion !== profile.version || plan.profileRef.profileDigest !== digestJson(profile)) throw projectionError('Plan Profile reference is stale or unknown', [])
  if (plan.completeness.status !== 'complete') throw projectionError('Only complete Plans project', [])
  const groups = canonicalPackage.groups
  if (!Array.isArray(groups)) throw projectionError('Canonical Groups are required', [])
  const groupById = new Map()
  for (const group of groups) {
    const groupIssues = validateJsonSchema(group, closure.schemas['canonical-question-group-v1'], '$.groups')
    if (groupIssues.length > 0) throw projectionError('Canonical Group is schema-invalid', groupIssues)
    if (group.identity.paperId !== plan.paperId || groupById.has(group.identity.groupId)) throw projectionError('Groups must belong to one paper and have unique identities', [])
    if (group.contractRef.manifestDigest !== closure.authorityRef.manifestDigest) throw projectionError('Group authority closure differs from Plan', [])
    const family = closure.families.get(group.contractRef.familyContractId)
    if (!family || group.contractRef.familyContractVersion !== family.version || group.contractRef.familyContractDigest !== digestJson(family) || group.variant.family !== family.familyContractId || group.variant.choiceOwnership?.ownership !== family.choiceOwnership) throw projectionError('Group family contract is stale or incompatible', [])
    const choiceIssues = choiceOwnershipIssues(group, family)
    if (choiceIssues.length > 0) throw projectionError('Group choice ownership is not structurally exclusive', choiceIssues)
    if (group.semanticDigest !== digestJson(groupSemanticPayload(group))) throw projectionError('Group semantic digest does not match canonical semantics', [])
    const sourceMapIssues = sourceMapCoverageIssues(group)
    if (sourceMapIssues.length > 0) throw projectionError('Group source map is incomplete', sourceMapIssues)
    groupById.set(group.identity.groupId, group)
  }
  const activeSlots = slotsForProfile(profile).filter((slot) => slot.activation === 'canonical_group')
  const bound = plan.slotBindings.filter((binding) => binding.state === 'bound')
  if (bound.length !== activeSlots.length || new Set(bound.map((binding) => binding.slotId)).size !== bound.length) throw projectionError('Plan bindings do not close every active Profile slot', [])
  const boundGroupIds = new Set()
  for (const slot of activeSlots) {
    const binding = bound.find((candidate) => candidate.slotId === slot.slotId)
    const group = binding && groupById.get(binding.groupRef.groupId)
    if (!group || group.contractRef.familyContractId !== slot.familyContractRef.id) throw projectionError(`Plan binding for ${slot.slotId} is not a conforming Group`, [])
    boundGroupIds.add(group.identity.groupId)
  }
  if (boundGroupIds.size !== groupById.size) throw projectionError('No extra canonical Group may escape the Plan', [])
  return { closure, profile, groupById }
}

/**
 * The sole renderer-neutral projection seam. Surface adapters receive this
 * semantic stream, never source markers, profile guessing, or sidecar paths.
 */
export function projectCanonicalPaper(canonicalPackage) {
  const { profile, groupById } = assertCanonicalPackage(canonicalPackage)
  const plan = canonicalPackage.plan
  const numberingByGroup = new Map()
  for (const assignment of plan.numberingAssignments) {
    const list = numberingByGroup.get(assignment.groupId) || []
    list.push({ questionId: assignment.questionId, number: assignment.canonicalNumber })
    numberingByGroup.set(assignment.groupId, list)
  }
  const nodes = []
  for (const part of profile.parts) {
    nodes.push({ kind: 'part', partId: part.partId, instructionId: part.titleInstructionRef })
    nodes.push({ kind: 'instruction', instructionId: part.titleInstructionRef, text: profile.instructions[part.titleInstructionRef].text })
    for (const section of part.sections) {
      nodes.push({ kind: 'section', sectionId: section.sectionId, instructionId: section.titleInstructionRef })
      nodes.push({ kind: 'instruction', instructionId: section.titleInstructionRef, text: profile.instructions[section.titleInstructionRef].text })
      for (const slot of section.slots) {
        if (slot.activation === 'inactive_source') continue
        const binding = plan.slotBindings.find((candidate) => candidate.slotId === slot.slotId)
        const group = groupById.get(binding.groupRef.groupId)
        nodes.push({
          kind: 'group',
          slotId: slot.slotId,
          groupId: group.identity.groupId,
          familyContractId: group.contractRef.familyContractId,
          numbering: numberingByGroup.get(group.identity.groupId) || [],
          scoringRuleRef: slot.slotId,
          content: cloneJson(group.content),
          media: cloneJson(group.media),
          choices: cloneJson(group.variant.choiceOwnership),
        })
        nodes.push({ kind: 'answer_region', answerRegionId: slot.answerRegionRef, groupId: group.identity.groupId })
      }
    }
  }
  return Object.freeze({ paperId: plan.paperId, nodes: Object.freeze(nodes) })
}
