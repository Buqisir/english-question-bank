import manifest from '../../standards/paper-canonical/manifest-v1.json' with { type: 'json' }
import core from '../../standards/paper-canonical/core/core-invariants-v1.json' with { type: 'json' }
import sourceAdapters from '../../standards/paper-canonical/adapters/source-adapters-v1.json' with { type: 'json' }
import nck1 from '../../standards/paper-canonical/profiles/nck1-v1.json' with { type: 'json' }
import zhejiangLegacy from '../../standards/paper-canonical/profiles/zhejiang-legacy-v1.json' with { type: 'json' }
import nationalLegacy from '../../standards/paper-canonical/profiles/national-legacy-v1.json' with { type: 'json' }
import reading from '../../standards/paper-canonical/families/reading-v1.json' with { type: 'json' }
import sevenChoices from '../../standards/paper-canonical/families/seven-choices-v1.json' with { type: 'json' }
import cloze from '../../standards/paper-canonical/families/cloze-v1.json' with { type: 'json' }
import grammarFill from '../../standards/paper-canonical/families/grammar-fill-v1.json' with { type: 'json' }
import applicationWriting from '../../standards/paper-canonical/families/application-writing-v1.json' with { type: 'json' }
import continuationWriting from '../../standards/paper-canonical/families/continuation-writing-v1.json' with { type: 'json' }
import normalization from '../../standards/paper-canonical/normalization/normalization-rules-v1.json' with { type: 'json' }
import typography from '../../standards/paper-canonical/rendering/paper-typography-v1.json' with { type: 'json' }
import standardManifestSchema from '../../schemas/paper-canonical/standard-manifest-v1.schema.json' with { type: 'json' }
import coreSchema from '../../schemas/paper-canonical/core-invariants-v1.schema.json' with { type: 'json' }
import profileSchema from '../../schemas/paper-canonical/paper-format-profile-v1.schema.json' with { type: 'json' }
import familySchema from '../../schemas/paper-canonical/canonical-family-contract-v1.schema.json' with { type: 'json' }
import normalizationSchema from '../../schemas/paper-canonical/normalization-rules-v1.schema.json' with { type: 'json' }
import sourceAdaptersSchema from '../../schemas/paper-canonical/source-adapters-v1.schema.json' with { type: 'json' }
import typographySchema from '../../schemas/paper-canonical/renderer-typography-v1.schema.json' with { type: 'json' }
import sourceCaptureSchema from '../../schemas/paper-canonical/source-capture-v1.schema.json' with { type: 'json' }
import planSchema from '../../schemas/paper-canonical/canonical-paper-plan-v1.schema.json' with { type: 'json' }
import groupSchema from '../../schemas/paper-canonical/canonical-question-group-v1.schema.json' with { type: 'json' }
import reportSchema from '../../schemas/paper-canonical/normalization-report-v1.schema.json' with { type: 'json' }
import publicationSchema from '../../schemas/paper-canonical/canonical-paper-publication-v1.schema.json' with { type: 'json' }
import consumerSchema from '../../schemas/paper-canonical/consumer-contract-v1.schema.json' with { type: 'json' }

import { digestJson, exactKeys, isRecordValue } from './stable.mjs'

const requiredOwners = [
  'core',
  'profile',
  'family',
  'normalization',
  'source_adapter',
  'renderer_typography',
]

const requiredFamilies = new Map([
  ['reading', 'per_question'],
  ['seven-choices', 'shared_bank'],
  ['cloze', 'per_question'],
  ['grammar-fill', 'none'],
  ['application-writing', 'none'],
  ['continuation-writing', 'none'],
])

function issue(code, path, message) {
  return { code, path, message }
}

export function validateJsonSchema(value, schema, path = '$') {
  const issues = []
  function walk(candidate, rule, candidatePath) {
    if (!isRecordValue(rule)) return
    if (Object.hasOwn(rule, 'const') && candidate !== rule.const) {
      issues.push(issue('SCHEMA_CONST', candidatePath, `Expected ${JSON.stringify(rule.const)}`))
      return
    }
    if (Array.isArray(rule.enum) && !rule.enum.includes(candidate)) {
      issues.push(issue('SCHEMA_ENUM', candidatePath, 'Value is outside the closed enum'))
      return
    }
    if (rule.type === 'object') {
      if (!isRecordValue(candidate)) {
        issues.push(issue('SCHEMA_TYPE', candidatePath, 'Expected an object'))
        return
      }
      for (const key of rule.required || []) {
        if (!Object.hasOwn(candidate, key)) issues.push(issue('SCHEMA_REQUIRED', candidatePath, `Missing ${key}`))
      }
      const properties = rule.properties || {}
      if (rule.additionalProperties === false) {
        for (const key of Object.keys(candidate)) {
          if (!Object.hasOwn(properties, key)) issues.push(issue('SCHEMA_UNKNOWN_FIELD', `${candidatePath}.${key}`, 'Unknown field'))
        }
      }
      for (const [key, childRule] of Object.entries(properties)) {
        if (Object.hasOwn(candidate, key)) walk(candidate[key], childRule, `${candidatePath}.${key}`)
      }
      return
    }
    if (rule.type === 'array') {
      if (!Array.isArray(candidate)) issues.push(issue('SCHEMA_TYPE', candidatePath, 'Expected an array'))
      else if (rule.items) candidate.forEach((item, index) => walk(item, rule.items, `${candidatePath}[${index}]`))
      return
    }
    if (rule.type === 'string' && typeof candidate !== 'string') issues.push(issue('SCHEMA_TYPE', candidatePath, 'Expected a string'))
    if (rule.type === 'number' && (typeof candidate !== 'number' || !Number.isFinite(candidate))) issues.push(issue('SCHEMA_TYPE', candidatePath, 'Expected a finite number'))
  }
  walk(value, schema, path)
  return issues
}

function flattenSlots(profile) {
  return profile.parts.flatMap((part) => part.sections.flatMap((section) => section.slots))
}

function closedProfileValue(value, keys, path, issues, label) {
  if (!isRecordValue(value) || !exactKeys(value, keys)) {
    issues.push(issue('PROFILE_UNKNOWN_FIELD', path, `${label} fields are closed`))
    return false
  }
  return true
}

function validateProfileSlot(slot, profile, families, path, slotIds, issues) {
  if (!isRecordValue(slot) || typeof slot.slotId !== 'string') {
    issues.push(issue('PROFILE_SLOT_INVALID', path, 'Slot requires a stable identity'))
    return
  }
  if (slotIds.has(slot.slotId)) issues.push(issue('PROFILE_DUPLICATE_SLOT', path, 'Slot ids must be unique'))
  slotIds.add(slot.slotId)
  const common = ['slotId', 'presence', 'activation', 'numberingRule', 'scoringRule', 'instructionRefs', 'answerRegionRef']
  if (slot.activation === 'canonical_group') {
    if (!closedProfileValue(slot, [...common, 'familyContractRef', 'groupCardinality', 'questionCardinality'], path, issues, 'Active slot')) return
    if (!closedProfileValue(slot.familyContractRef, ['id', 'version'], `${path}.familyContractRef`, issues, 'Family reference') || !families.has(slot.familyContractRef.id)) {
      issues.push(issue('PROFILE_UNKNOWN_FAMILY', path, 'Active slot references an unknown family'))
    }
    if (slot.groupCardinality !== 1) issues.push(issue('PROFILE_GROUP_CARDINALITY', path, 'Active slots bind exactly one group'))
    if (!closedProfileValue(slot.questionCardinality, ['kind', 'count'], `${path}.questionCardinality`, issues, 'Question cardinality') || slot.questionCardinality.kind !== 'exact' || !Number.isInteger(slot.questionCardinality.count)) {
      issues.push(issue('PROFILE_QUESTION_CARDINALITY', path, 'Active slots require exact integer question cardinality'))
    }
  } else if (slot.activation === 'inactive_source') {
    if (!closedProfileValue(slot, [...common, 'sourceRole', 'renderPolicy'], path, issues, 'Inactive slot')) return
    if (slot.renderPolicy !== 'suppress') issues.push(issue('PROFILE_INACTIVE_SLOT', path, 'Inactive source slots must suppress rendering'))
  } else {
    issues.push(issue('PROFILE_UNKNOWN_ACTIVATION', path, 'Unknown activation'))
    return
  }
  if (!Array.isArray(slot.instructionRefs) || typeof slot.answerRegionRef !== 'string' || !profile.answerRegions[slot.answerRegionRef]) issues.push(issue('PROFILE_UNKNOWN_ANSWER_REGION', path, 'Slot references an unknown answer region'))
  if (!isRecordValue(slot.numberingRule) || !isRecordValue(slot.scoringRule)) {
    issues.push(issue('PROFILE_SLOT_RULE_INVALID', path, 'Slot numbering and scoring rules must be closed objects'))
    return
  }
  const numberingKeys = slot.numberingRule.kind === 'range' ? ['kind', 'start', 'end'] : ['kind']
  if (!exactKeys(slot.numberingRule, numberingKeys) || !['range', 'none', 'source_observed'].includes(slot.numberingRule.kind)) issues.push(issue('PROFILE_NUMBERING_RULE_INVALID', `${path}.numberingRule`, 'Numbering rule is closed'))
  const scoringKeys = slot.scoringRule.kind === 'per_question' ? ['kind', 'points', 'total'] : ['kind', 'total']
  if (!exactKeys(slot.scoringRule, scoringKeys) || !['per_question', 'group_total'].includes(slot.scoringRule.kind)) issues.push(issue('PROFILE_SCORING_RULE_INVALID', `${path}.scoringRule`, 'Scoring rule is closed'))
}

function validateProfile(profile, families) {
  const issues = []
  if (!isRecordValue(profile.instructions) || !isRecordValue(profile.answerRegions) || !closedProfileValue(profile.completeness, ['requireEveryRequiredSlot', 'allowOptionalOmission', 'requireInactiveSourceClosure', 'rejectUnexpectedSlots'], '$.completeness', issues, 'Completeness')) return issues
  for (const [instructionId, instruction] of Object.entries(profile.instructions)) {
    if (!closedProfileValue(instruction, ['instructionId', 'placement', 'text'], `$.instructions.${instructionId}`, issues, 'Instruction') || instruction.instructionId !== instructionId) issues.push(issue('PROFILE_INSTRUCTION_INVALID', `$.instructions.${instructionId}`, 'Instruction identity must close its key'))
  }
  for (const [regionId, region] of Object.entries(profile.answerRegions)) {
    if (!closedProfileValue(region, ['regionId', 'kind'], `$.answerRegions.${regionId}`, issues, 'Answer region') || region.regionId !== regionId) issues.push(issue('PROFILE_ANSWER_REGION_INVALID', `$.answerRegions.${regionId}`, 'Answer region identity must close its key'))
  }
  if (!Array.isArray(profile.parts) || profile.parts.length === 0) {
    return [issue('PROFILE_PARTS_REQUIRED', '$.parts', 'Profile needs ordered parts')]
  }
  const slotIds = new Set()
  for (const [partIndex, part] of profile.parts.entries()) {
    const partPath = `$.parts[${partIndex}]`
    if (!closedProfileValue(part, ['partId', 'ordinal', 'titleInstructionRef', 'score', 'sections'], partPath, issues, 'Part')) continue
    if (!Array.isArray(part.sections) || part.sections.length === 0) issues.push(issue('PROFILE_SECTIONS_REQUIRED', partPath, 'Part needs sections'))
    for (const [sectionIndex, section] of (part.sections || []).entries()) {
      const sectionPath = `${partPath}.sections[${sectionIndex}]`
      if (!closedProfileValue(section, ['sectionId', 'ordinal', 'titleInstructionRef', 'score', 'slots'], sectionPath, issues, 'Section') || !Array.isArray(section.slots)) {
        issues.push(issue('PROFILE_SLOTS_REQUIRED', sectionPath, 'Section needs ordered slots'))
        continue
      }
      for (const [slotIndex, slot] of section.slots.entries()) validateProfileSlot(slot, profile, families, `${sectionPath}.slots[${slotIndex}]`, slotIds, issues)
    }
  }
  return issues
}

function validateNormalizationRules(artifact) {
  const issues = []
  if (!Array.isArray(artifact?.rules) || artifact.rules.length === 0) return [issue('NORMALIZATION_RULES_REQUIRED', '$.rules', 'Normalization requires ordered exact rules')]
  const ruleIds = new Set()
  for (const [index, rule] of artifact.rules.entries()) {
    const path = `$.rules[${index}]`
    if (!isRecordValue(rule) || !exactKeys(rule, ['ruleId', 'version', 'certainty', 'allowedOperations', 'operationProofs']) || typeof rule.ruleId !== 'string' || typeof rule.version !== 'string' || rule.certainty !== 'exact' || !Array.isArray(rule.allowedOperations) || rule.allowedOperations.length === 0 || new Set(rule.allowedOperations).size !== rule.allowedOperations.length || ruleIds.has(`${rule.ruleId}@${rule.version}`) || !isRecordValue(rule.operationProofs) || Object.keys(rule.operationProofs).sort().join(',') !== [...rule.allowedOperations].sort().join(',')) {
      issues.push(issue('NORMALIZATION_RULE_INVALID', path, 'Rule operations and versioned proof contracts must be closed'))
      continue
    }
    ruleIds.add(`${rule.ruleId}@${rule.version}`)
    for (const operation of rule.allowedOperations) {
      const proof = rule.operationProofs[operation]
      if (!isRecordValue(proof) || !exactKeys(proof, ['kind', 'requiredPreconditions']) || proof.kind !== 'identity' || !isRecordValue(proof.requiredPreconditions) || Object.keys(proof.requiredPreconditions).length === 0 || Object.values(proof.requiredPreconditions).some((value) => value !== true)) issues.push(issue('NORMALIZATION_PROOF_INVALID', `${path}.operationProofs.${operation}`, 'Operation proof must have a machine-checkable exact contract'))
    }
  }
  return issues
}

export function validateAuthorityClosure({ manifest: candidateManifest, artifacts, schemas }) {
  const issues = []
  const schemaById = new Map(Object.entries(schemas || {}))
  const manifestSchema = schemaById.get('standard-manifest-v1')
  if (!manifestSchema) return { ok: false, issues: [issue('SCHEMA_MISSING', '$.schemas', 'Missing manifest schema')] }
  issues.push(...validateJsonSchema(candidateManifest, manifestSchema))
  const owners = candidateManifest?.factOwners || []
  const actualOwners = owners.map((owner) => owner.owner)
  if (new Set(actualOwners).size !== actualOwners.length || requiredOwners.some((owner) => !actualOwners.includes(owner)) || actualOwners.length !== requiredOwners.length) {
    issues.push(issue('AUTHORITY_OWNER_CLOSURE', '$.factOwners', 'Exactly the six mutually exclusive fact owners are required'))
  }
  const schemaEntries = candidateManifest?.schemas || []
  const schemaIds = new Set()
  for (const descriptor of schemaEntries) {
    if (schemaIds.has(descriptor.id)) issues.push(issue('SCHEMA_DUPLICATE', '$.schemas', `Duplicate schema ${descriptor.id}`))
    schemaIds.add(descriptor.id)
    const schema = schemaById.get(descriptor.id)
    if (!schema) issues.push(issue('SCHEMA_MISSING', '$.schemas', `Schema ${descriptor.id} is unavailable`))
    else if (digestJson(schema) !== descriptor.sha256) issues.push(issue('SCHEMA_DIGEST_MISMATCH', '$.schemas', `Schema ${descriptor.id} digest differs`))
  }
  const artifactEntries = candidateManifest?.artifacts || []
  const artifactIds = new Set()
  const familyArtifacts = new Map()
  const profileArtifacts = []
  for (const descriptor of artifactEntries) {
    if (artifactIds.has(descriptor.id)) issues.push(issue('AUTHORITY_DUPLICATE_ARTIFACT', '$.artifacts', `Duplicate artifact ${descriptor.id}`))
    artifactIds.add(descriptor.id)
    const artifact = artifacts?.[descriptor.id]
    const schema = schemaById.get(descriptor.schemaId)
    if (!artifact) {
      issues.push(issue('AUTHORITY_ARTIFACT_MISSING', '$.artifacts', `Missing ${descriptor.id}`))
      continue
    }
    if (!schema) issues.push(issue('AUTHORITY_SCHEMA_MISSING', '$.artifacts', `Missing ${descriptor.schemaId}`))
    else issues.push(...validateJsonSchema(artifact, schema, `$.artifacts.${descriptor.id}`))
    if (artifact.owner !== descriptor.owner) issues.push(issue('AUTHORITY_OWNER_MISMATCH', '$.artifacts', `Owner mismatch for ${descriptor.id}`))
    if (digestJson(artifact) !== descriptor.sha256) issues.push(issue('AUTHORITY_DIGEST_MISMATCH', '$.artifacts', `Digest mismatch for ${descriptor.id}`))
    if (!requiredOwners.includes(descriptor.owner)) issues.push(issue('AUTHORITY_UNKNOWN_OWNER', '$.artifacts', `Unknown owner ${descriptor.owner}`))
    if (descriptor.owner === 'family') familyArtifacts.set(artifact.familyContractId, artifact)
    if (descriptor.owner === 'profile') profileArtifacts.push(artifact)
  }
  for (const [familyId, ownership] of requiredFamilies) {
    const family = familyArtifacts.get(familyId)
    if (!family || family.choiceOwnership !== ownership) issues.push(issue('AUTHORITY_FAMILY_CLOSURE', '$.artifacts', `Missing or invalid ${familyId} family contract`))
  }
  const expectedProfiles = new Set(['nck1', 'zhejiang-legacy', 'national-legacy'])
  if (profileArtifacts.length !== expectedProfiles.size || profileArtifacts.some((profile) => !expectedProfiles.has(profile.profileId))) {
    issues.push(issue('AUTHORITY_PROFILE_CLOSURE', '$.artifacts', 'Exactly the three v1 profiles are required'))
  }
  for (const profile of profileArtifacts) issues.push(...validateProfile(profile, familyArtifacts))
  const normalizationArtifact = Object.values(artifacts || {}).find((artifact) => artifact?.owner === 'normalization')
  issues.push(...validateNormalizationRules(normalizationArtifact))
  const coreArtifact = Object.values(artifacts || {}).find((artifact) => artifact?.owner === 'core')
  if (!coreArtifact || coreArtifact.projectionContract !== 'canonical-projector-v1') issues.push(issue('AUTHORITY_CORE_CLOSURE', '$.artifacts', 'Core invariants must pin the projector'))
  return { ok: issues.length === 0, issues }
}

const defaultArtifacts = {
  core,
  adapter: sourceAdapters,
  'profile-nck1': nck1,
  'profile-zhejiang-legacy': zhejiangLegacy,
  'profile-national-legacy': nationalLegacy,
  'family-reading': reading,
  'family-seven-choices': sevenChoices,
  'family-cloze': cloze,
  'family-grammar-fill': grammarFill,
  'family-application-writing': applicationWriting,
  'family-continuation-writing': continuationWriting,
  normalization,
  'renderer-typography': typography,
}

const defaultSchemas = {
  'standard-manifest-v1': standardManifestSchema,
  'core-invariants-v1': coreSchema,
  'paper-format-profile-v1': profileSchema,
  'canonical-family-contract-v1': familySchema,
  'normalization-rules-v1': normalizationSchema,
  'source-adapters-v1': sourceAdaptersSchema,
  'renderer-typography-v1': typographySchema,
  'source-capture-v1': sourceCaptureSchema,
  'canonical-paper-plan-v1': planSchema,
  'canonical-question-group-v1': groupSchema,
  'normalization-report-v1': reportSchema,
  'canonical-paper-publication-v1': publicationSchema,
  'consumer-contract-v1': consumerSchema,
}

const defaultValidation = validateAuthorityClosure({ manifest, artifacts: defaultArtifacts, schemas: defaultSchemas })
if (!defaultValidation.ok) throw new Error(`Invalid checked-in canonical authority: ${JSON.stringify(defaultValidation.issues)}`)

const profileById = new Map([nck1, zhejiangLegacy, nationalLegacy].map((profile) => [profile.profileId, profile]))
const familyById = new Map([reading, sevenChoices, cloze, grammarFill, applicationWriting, continuationWriting].map((family) => [family.familyContractId, family]))

export const canonicalAuthorityRef = Object.freeze({
  manifestId: manifest.manifestId,
  manifestVersion: manifest.version,
  manifestDigest: digestJson(manifest),
})

export function resolveCanonicalAuthority(authorityRef) {
  if (!authorityRef || authorityRef.manifestId !== canonicalAuthorityRef.manifestId || authorityRef.manifestVersion !== canonicalAuthorityRef.manifestVersion || authorityRef.manifestDigest !== canonicalAuthorityRef.manifestDigest) {
    return { ok: false, issues: [issue('AUTHORITY_UNAVAILABLE', '$.authority', 'Unknown, missing, or digest-mismatched manifest')] }
  }
  return {
    ok: true,
    closure: Object.freeze({
      manifest,
      authorityRef: canonicalAuthorityRef,
      profiles: profileById,
      families: familyById,
      artifacts: defaultArtifacts,
      schemas: defaultSchemas,
    }),
  }
}

export function slotsForProfile(profile) {
  return flattenSlots(profile)
}
