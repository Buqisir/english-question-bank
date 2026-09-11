import { resolveCanonicalAuthority, slotsForProfile, validateJsonSchema } from './authority.mjs'
import { validateApplicationWritingContract } from './applicationWriting.mjs'
import { validateContinuationWritingContract } from './continuationWriting.mjs'
import { validateGrammarFillPromptContract } from './grammarFillPromptContract.mjs'
import {
  collectListeningTargets,
  validateListeningContract,
} from './listening.mjs'
import { validateReadingContract } from './reading.mjs'
import { validateSevenChoicesContract } from './sevenChoices.mjs'
import { cloneJson, digestJson } from './stable.mjs'

function projectionError(message, issues) {
  const error = new Error(message)
  error.code = 'CANONICAL_PROJECTION_REJECTED'
  error.issues = issues
  return error
}

function projectProfileInstruction(profile, instructionId) {
  const instruction = profile.instructions[instructionId]
  return {
    instructionId,
    placement: instruction.placement,
    text: instruction.text,
    renderPolicy: instruction.renderPolicy ?? 'render',
  }
}

function projectSlotInstruction(profile, instructionId, group) {
  const instruction = projectProfileInstruction(profile, instructionId)
  return group?.variant?.sourceInstruction?.instructionId === instructionId
    ? { ...instruction, text: group.variant.sourceInstruction.text }
    : instruction
}

function groupSemanticPayload(group) {
  const { sourceMap: _sourceMap, sourceFingerprint: _sourceFingerprint, semanticDigest: _semanticDigest, ...semantic } = group
  return semantic
}

function sourceMapCoverageIssues(group, sourceCapture, family) {
  const issues = []
  const expected = new Set([
    `group:${group.identity.groupId}`,
    ...group.questionRefs.map(({ questionId }) => `question:${questionId}`),
    ...group.blankRefs.map(({ blankId }) => `blank:${blankId}`),
    ...group.media.map(({ mediaId }) => `media:${mediaId}`),
    ...contentIdentityLists(group.content).sourceMappedIds.map((nodeId) => `content_node:${nodeId}`),
    ...(group.variant.family === 'reading'
      ? [
          ...group.variant.questions.flatMap((question) => question.stem.map((inline) => `content_node:${inline.nodeId}`)),
          ...group.variant.choiceOwnership.sets.flatMap((set) => set.options.flatMap((option) => [
            `option:${option.optionId}`,
            ...(option.content || []).map((inline) => `content_node:${inline.nodeId}`),
          ])),
        ]
      : []),
    ...(group.variant.family === 'listening'
      ? collectListeningTargets(group.variant).map(({ kind, id }) =>
          `${kind}:${id}`)
      : []),
    ...(family.variantSchemaId === 'canonical-application-writing-variant-v1'
      ? [
          `writing_task:${group.variant.writingTaskId}`,
          `word_ruling:${group.variant.wordCountRuling.authorityObservationRef}`,
          `response_binding:${group.variant.response.authorityObservationRef}`,
          ...group.variant.contentRequirements.map((requirement) => `requirement:${requirement.requirementId}`),
          ...(group.variant.givenSkeleton.presence === 'provided'
            ? group.variant.givenSkeleton.parts.map((part) => `given_part:${part.givenPartId}`)
            : [`given_absence:${group.variant.givenSkeleton.answerRegionAbsenceAssertionRef}`]),
        ]
      : family.variantSchemaId === 'canonical-application-writing-variant-v2'
        ? [`writing_task:${group.variant.writingTaskId}`]
      : []),
    ...([
      'canonical-continuation-writing-variant-v1',
      'canonical-continuation-writing-variant-v3',
    ].includes(family.variantSchemaId)
      ? [
          `writing_task:${group.variant.writingTaskId}`,
          ...(family.variantSchemaId
            === 'canonical-continuation-writing-variant-v3'
            ? [`source_instruction:${group.variant.sourceInstruction.instructionId}`]
            : []),
          `word_ruling:${group.variant.wordCountRuling.authorityObservationRef}`,
          `response_binding:${group.variant.response.authorityObservationRef}`,
          ...(group.variant.starterProvision.kind === 'ordered_source_starters'
            ? group.variant.starterProvision.starters.map((starter) => `starter:${starter.starterId}`)
            : [`starter_absence:${group.variant.starterProvision.absenceAssertionRef}`]),
        ]
      : family.variantSchemaId === 'canonical-continuation-writing-variant-v2'
        ? [`writing_task:${group.variant.writingTaskId}`]
      : []),
  ])
  const seen = new Set()
  if (group.sourceMap.captureId !== sourceCapture.captureId) issues.push('source-map capture does not match the supplied Source Capture')
  const spanIds = new Set(sourceCapture.sourceSpans.map((span) => span.sourceSpanId))
  for (const entry of group.sourceMap.entries) {
    const identity = `${entry.target.kind}:${entry.target.id}`
    if (seen.has(identity)) issues.push(`duplicate source-map target ${identity}`)
    seen.add(identity)
    if (!Array.isArray(entry.sourceSpanRefs) || entry.sourceSpanRefs.length === 0) issues.push(`missing source-map span for ${identity}`)
    else if (entry.sourceSpanRefs.some((sourceSpanId) => !spanIds.has(sourceSpanId))) issues.push(`unresolved source-map span for ${identity}`)
  }
  for (const identity of expected) if (!seen.has(identity)) issues.push(`missing source-map target ${identity}`)
  return issues
}

function contentIdentityLists(content) {
  const contentNodeIds = []
  const sourceMappedIds = []
  const addStructuralId = (id) => {
    contentNodeIds.push(id)
    sourceMappedIds.push(id)
  }
  const walk = (blocks) => {
    for (const block of blocks || []) {
      addStructuralId(block.nodeId)
      if (block.kind === 'table') {
        for (const row of block.rows || []) {
          addStructuralId(row.rowId)
          for (const cell of row.cells || []) {
            addStructuralId(cell.cellId)
            for (const inline of cell.inlines || []) {
              contentNodeIds.push(inline.nodeId)
              if (inline.kind === 'text') sourceMappedIds.push(inline.nodeId)
            }
          }
        }
        continue
      }
      if (block.kind === 'framed_columns') {
        for (const column of block.columns || []) {
          if (typeof column?.columnId === 'string') addStructuralId(column.columnId)
          walk(column.blocks)
        }
        continue
      }
      const inlines = block.kind === 'figure' ? block.caption : block.inlines
      for (const inline of inlines || []) {
        contentNodeIds.push(inline.nodeId)
        if (inline.kind === 'text') sourceMappedIds.push(inline.nodeId)
      }
    }
  }
  walk(content?.blocks)
  return { contentNodeIds, sourceMappedIds }
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
  const sourceCapture = canonicalPackage.sourceCapture
  const captureIssues = validateJsonSchema(sourceCapture, closure.schemas['source-capture-v1'], '$.sourceCapture')
  if (captureIssues.length > 0) throw projectionError('Source Capture is schema-invalid', captureIssues)
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
    const groupSchemaId = closure.artifacts.core?.groupSchemaId
      || 'canonical-question-group-v1'
    if (group.schemaVersion !== groupSchemaId) {
      throw projectionError('Canonical Group schema does not match Core authority', [])
    }
    const groupIssues = validateJsonSchema(
      group,
      closure.schemas[groupSchemaId],
      '$.groups',
    )
    if (groupIssues.length > 0) throw projectionError('Canonical Group is schema-invalid', groupIssues)
    if (group.identity.paperId !== plan.paperId || groupById.has(group.identity.groupId)) throw projectionError('Groups must belong to one paper and have unique identities', [])
    if (group.contractRef.manifestDigest !== closure.authorityRef.manifestDigest) throw projectionError('Group authority closure differs from Plan', [])
    const family = closure.families.get(group.contractRef.familyContractId)
    if (!family || group.contractRef.familyContractVersion !== family.version || group.contractRef.familyContractDigest !== digestJson(family) || group.variant.family !== family.familyContractId || group.variant.choiceOwnership?.ownership !== family.choiceOwnership) throw projectionError('Group family contract is stale or incompatible', [])
    const variantIssues = validateJsonSchema(
      group.variant,
      closure.schemas[family.variantSchemaId],
      '$.groups.variant',
    )
    if (variantIssues.length > 0) {
      throw projectionError('Canonical Group variant is schema-invalid', variantIssues)
    }
    const choiceIssues = choiceOwnershipIssues(group, family)
    if (choiceIssues.length > 0) throw projectionError('Group choice ownership is not structurally exclusive', choiceIssues)
    if (family.familyContractId === 'seven-choices') {
      const sevenChoicesIssues = validateSevenChoicesContract({
        groupId: group.identity.groupId,
        questionIds: group.questionRefs.map(({ questionId }) => questionId),
        blankIds: group.blankRefs.map(({ blankId }) => blankId),
        content: group.content,
        variant: group.variant,
        assertions: sourceCapture.assertions,
        allowPassageBlockRoles:
          ['47', '48', '49', '50', '51', '52', '54'].includes(closure.authorityRef.manifestVersion),
      })
      if (sevenChoicesIssues.length > 0) throw projectionError('Seven Choices canonical contract is not closed', sevenChoicesIssues)
    }
    if (family.familyContractId === 'reading') {
      const readingIssues = validateReadingContract({
        questionIds: group.questionRefs.map(({ questionId }) => questionId),
        blankIds: group.blankRefs.map(({ blankId }) => blankId),
        content: group.content,
        media: group.media,
        variant: group.variant,
        assertions: sourceCapture.assertions,
        allowFigureOptions: family.optionModes?.includes('figure') === true,
      })
      if (readingIssues.length > 0) throw projectionError('Reading canonical contract is not closed', readingIssues)
    }
    if (family.familyContractId === 'listening') {
      const listeningIssues = validateListeningContract({
        questionIds: group.questionRefs.map(({ questionId }) => questionId),
        blankIds: group.blankRefs.map(({ blankId }) => blankId),
        content: group.content,
        variant: group.variant,
        assertions: sourceCapture.assertions,
      })
      if (listeningIssues.length > 0) {
        throw projectionError('Listening canonical contract is not closed', listeningIssues)
      }
    }
    if (family.familyContractId === 'grammar-fill' && family.version >= 2) {
      const grammarFillIssues = validateGrammarFillPromptContract({
        blankIds: group.blankRefs.map(({ blankId }) => blankId),
        content: group.content,
        variant: group.variant,
        sourceCapture,
        promptProvisionSchema:
          closure.schemas[family.promptProvisionSchemaId],
        sourceMap: group.sourceMap,
      })
      if (grammarFillIssues.length > 0) {
        throw projectionError(
          'Grammar Fill prompt authority is not closed',
          grammarFillIssues,
        )
      }
    }
    if (
      family.variantSchemaId === 'canonical-application-writing-variant-v1'
      || family.variantSchemaId === 'canonical-application-writing-variant-v2'
    ) {
      const applicationIssues = validateApplicationWritingContract({
        groupId: group.identity.groupId,
        questionIds: group.questionRefs.map(({ questionId }) => questionId),
        blankIds: group.blankRefs.map(({ blankId }) => blankId),
        content: group.content,
        variant: group.variant,
        sourceCapture,
      })
      if (applicationIssues.length > 0) throw projectionError('Application Writing canonical contract is not closed', applicationIssues)
    }
    if (
      family.variantSchemaId === 'canonical-continuation-writing-variant-v1'
      || family.variantSchemaId === 'canonical-continuation-writing-variant-v3'
      || family.variantSchemaId === 'canonical-continuation-writing-variant-v2'
    ) {
      const continuationIssues = validateContinuationWritingContract({
        groupId: group.identity.groupId,
        profileId: profile.profileId,
        questionIds: group.questionRefs.map(({ questionId }) => questionId),
        blankIds: group.blankRefs.map(({ blankId }) => blankId),
        content: group.content,
        variant: group.variant,
        sourceCapture,
      })
      if (continuationIssues.length > 0) throw projectionError('Continuation Writing canonical contract is not closed', continuationIssues)
    }
    if (group.semanticDigest !== digestJson(groupSemanticPayload(group))) throw projectionError('Group semantic digest does not match canonical semantics', [])
    const sourceMapIssues = sourceMapCoverageIssues(group, sourceCapture, family)
    if (sourceMapIssues.length > 0) throw projectionError('Group source map is incomplete', sourceMapIssues)
    groupById.set(group.identity.groupId, group)
  }
  const activeSlots = slotsForProfile(profile).filter((slot) => slot.activation === 'canonical_group')
  const inactiveSlots = slotsForProfile(profile).filter((slot) => slot.activation === 'inactive_source')
  const bound = plan.slotBindings.filter((binding) => binding.state === 'bound')
  const inactive = plan.slotBindings.filter((binding) => binding.state === 'inactive')
  const omitted = plan.slotBindings.filter((binding) => binding.state === 'omitted')
  const optionalOmissions = plan.completeness?.optionalOmissions
  const omittedSlotIds = omitted.map((binding) => binding.slotId)
  if (
    bound.length + omitted.length !== activeSlots.length
    || new Set([...bound, ...omitted].map((binding) => binding.slotId)).size
      !== bound.length + omitted.length
    || !Array.isArray(optionalOmissions)
    || optionalOmissions.join(',') !== omittedSlotIds.join(',')
  ) throw projectionError('Plan bindings do not close every active Profile slot', [])
  for (const binding of omitted) {
    const slot = activeSlots.find((candidate) => candidate.slotId === binding.slotId)
    if (
      slot?.presence !== 'optional'
      || binding.sourceState !== 'not_supplied'
      || Object.keys(binding).sort().join(',') !== 'slotId,sourceState,state'
    ) throw projectionError(`Plan omission for ${binding.slotId} is not source-proven and optional`, [])
  }
  if (inactive.length !== inactiveSlots.length || new Set(inactive.map((binding) => binding.slotId)).size !== inactive.length) throw projectionError('Plan bindings do not close every inactive Profile slot', [])
  const sourceSpanIds = new Set(
    sourceCapture.sourceSpans.map((span) => span.sourceSpanId),
  )
  for (const slot of inactiveSlots) {
    const binding = inactive.find((candidate) => candidate.slotId === slot.slotId)
    if (binding?.sourceState === 'not_supplied') {
      if (Object.hasOwn(binding, 'groupRef') || Object.hasOwn(binding, 'sourceSliceRefs') || Object.hasOwn(binding, 'sourceClosureRef')) {
        throw projectionError(`Plan inactive binding for ${slot.slotId} is not an exact not_supplied closure`, [])
      }
      continue
    }
    if (
      !binding
      || Object.hasOwn(binding, 'groupRef')
      || !Array.isArray(binding.sourceSliceRefs)
      || binding.sourceSliceRefs.length === 0
      || binding.sourceSliceRefs.some((sourceSpanId) => !sourceSpanIds.has(sourceSpanId))
      || (
        slot.sourceClosureContractRef
        && (
          binding.sourceClosureRef?.contractId !== slot.sourceClosureContractRef.id
          || binding.sourceClosureRef?.contractVersion !== slot.sourceClosureContractRef.version
          || typeof binding.sourceClosureRef?.reportScopeId !== 'string'
          || typeof binding.sourceClosureRef?.closureDigest !== 'string'
        )
      )
    ) throw projectionError(`Plan inactive binding for ${slot.slotId} is not source-closed`, [])
  }
  const boundGroupIds = new Set()
  for (const slot of activeSlots) {
    const binding = bound.find((candidate) => candidate.slotId === slot.slotId)
    if (!binding && omitted.some((candidate) => candidate.slotId === slot.slotId)) continue
    const group = binding && groupById.get(binding.groupRef.groupId)
    if (
      !group
      || group.contractRef.familyContractId !== slot.familyContractRef.id
      || group.contractRef.familyContractVersion !== slot.familyContractRef.version
    ) throw projectionError(`Plan binding for ${slot.slotId} is not a conforming Group`, [])
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
  const { closure, profile, groupById } = assertCanonicalPackage(canonicalPackage)
  const plan = canonicalPackage.plan
  const numberingByGroup = new Map()
  for (const assignment of plan.numberingAssignments) {
    const list = numberingByGroup.get(assignment.groupId) || []
    list.push({ questionId: assignment.questionId, number: assignment.canonicalNumber })
    numberingByGroup.set(assignment.groupId, list)
  }
  const nodes = []
  for (const part of profile.parts) {
    const visibleSections = part.sections.filter((section) =>
      section.slots.some((slot) =>
        slot.activation === 'canonical_group'
        && plan.slotBindings.some((binding) =>
          binding.slotId === slot.slotId && binding.state === 'bound')))
    if (visibleSections.length === 0) continue
    nodes.push({ kind: 'part', partId: part.partId, instructionId: part.titleInstructionRef })
    nodes.push({
      kind: 'instruction',
      ...projectProfileInstruction(profile, part.titleInstructionRef),
    })
    for (const section of visibleSections) {
      nodes.push({ kind: 'section', sectionId: section.sectionId, instructionId: section.titleInstructionRef })
      nodes.push({
        kind: 'instruction',
        ...projectProfileInstruction(profile, section.titleInstructionRef),
      })
      for (const slot of section.slots) {
        if (slot.activation === 'inactive_source') continue
        const binding = plan.slotBindings.find((candidate) => candidate.slotId === slot.slotId)
        if (binding?.state === 'omitted') continue
        const group = groupById.get(binding.groupRef.groupId)
        for (const instructionId of slot.instructionRefs) {
          nodes.push({
            kind: 'instruction',
            ...projectSlotInstruction(profile, instructionId, group),
          })
        }
        const sevenChoices = group.variant.family === 'seven-choices'
          ? {
              ...(['47', '48', '49', '50', '51', '52', '54'].includes(closure.authorityRef.manifestVersion)
                ? {
                    passageBlockRoles: cloneJson(
                      group.variant.passageBlockRoles,
                    ),
                  }
                : {}),
              questionBlankPairs: group.variant.members.map(({ questionId, blankId }) => ({ questionId, blankId })),
              anchors: {
                contentNodeIds: contentIdentityLists(group.content).contentNodeIds,
                questionIds: group.questionRefs.map(({ questionId }) => questionId),
                blankIds: group.blankRefs.map(({ blankId }) => blankId),
                optionIds: group.variant.choiceOwnership.options.map(({ optionId }) => optionId),
              },
            }
          : {}
        const reading = group.variant.family === 'reading'
          ? {
              blocks: cloneJson(group.content.blocks),
              passageBlockRoles: cloneJson(group.variant.passageBlockRoles),
              questions: group.variant.questions.map((question, index) => ({
                questionId: question.questionId,
                number: numberingByGroup.get(group.identity.groupId)?.[index]?.number,
                stem: cloneJson(question.stem),
                options: cloneJson(group.variant.choiceOwnership.sets[index].options),
                correctOptionId: question.correctOptionId,
                ...(question.figureLayout ? { figureLayout: cloneJson(question.figureLayout) } : {}),
              })),
              anchors: {
                contentNodeIds: contentIdentityLists(group.content).contentNodeIds,
                questionIds: group.questionRefs.map(({ questionId }) => questionId),
                optionIds: group.variant.choiceOwnership.sets.flatMap((set) => set.options.map(({ optionId }) => optionId)),
              },
            }
          : {}
        const listening = group.variant.family === 'listening'
          ? {
              ...(group.variant.firstSectionPlayback === undefined
                ? {}
                : { firstSectionPlayback: group.variant.firstSectionPlayback }),
              questions: group.variant.questions.map((question, index) => ({
                questionId: question.questionId,
                number: numberingByGroup.get(group.identity.groupId)?.[index]?.number,
                stem: cloneJson(question.stem),
                options: cloneJson(group.variant.choiceOwnership.sets[index].options),
                ...(['51', '52', '54'].includes(plan.authorityRef.manifestVersion)
                  ? {}
                  : { correctOptionId: question.correctOptionId }),
              })),
              // v51 public consumption needs only coverage identities. Full
              // transcript/answers stay in source authority and Owner Review.
              transcriptSegments: group.variant.transcriptSegments.map((segment) =>
                ['51', '52', '54'].includes(plan.authorityRef.manifestVersion)
                  ? { segmentId: segment.segmentId, questionIds: cloneJson(segment.questionIds) }
                  : cloneJson(segment)),
              anchors: {
                questionIds: group.questionRefs.map(({ questionId }) => questionId),
                optionIds: group.variant.choiceOwnership.sets.flatMap((set) =>
                  set.options.map(({ optionId }) => optionId)),
                transcriptSegmentIds: group.variant.transcriptSegments.map(
                  ({ segmentId }) => segmentId,
                ),
              },
            }
          : {}
        const applicationWriting = group.variant.family === 'application-writing'
          ? {
              paperChrome: {
                part: {
                  partId: part.partId,
                  ...projectProfileInstruction(
                    profile,
                    part.titleInstructionRef,
                  ),
                },
                section: {
                  sectionId: section.sectionId,
                  ...projectProfileInstruction(
                    profile,
                    section.titleInstructionRef,
                  ),
                },
                instructions: slot.instructionRefs.map((instructionId) =>
                  projectSlotInstruction(profile, instructionId, group)),
              },
              writingTaskId: group.variant.writingTaskId,
              ...(group.variant.mode === 'legacy_opaque'
                ? {
                    writingMode: 'legacy_opaque',
                    sourceTaskType: group.variant.sourceTaskType,
                    sourceBlocks: group.variant.contentBlockRefs.map((blockId) => cloneJson(group.content.blocks.find((block) => block.nodeId === blockId))),
                    wordCountTarget: group.variant.wordCountTarget,
                    wordCountTargetCertainty: group.variant.wordCountTargetCertainty,
                    wordCountScope: group.variant.wordCountScope,
                    answerRegion: {
                      answerRegionRef: group.variant.response.answerRegionRef,
                      responseSlotId: slot.slotId,
                      ownership: group.variant.response.ownership,
                    },
                    anchors: {
                      contentNodeIds: contentIdentityLists(group.content).contentNodeIds,
                      responseSlotId: slot.slotId,
                    },
                  }
                : {
                    prompt: {
                      blocks: group.variant.promptBlockRefs.map((blockId) => cloneJson(group.content.blocks.find((block) => block.nodeId === blockId))),
                    },
                    situation: cloneJson(group.variant.situation),
                    contentRequirements: cloneJson(group.variant.contentRequirements),
                    wordCountRuling: cloneJson(group.variant.wordCountRuling),
                    answerRegion: {
                      answerRegionRef: group.variant.response.answerRegionRef,
                      responseSlotId: slot.slotId,
                      givenTop: cloneJson(group.variant.givenSkeleton.presence === 'provided'
                        ? group.variant.givenSkeleton.parts.filter((part) => part.placement === 'answer_region_top')
                        : []),
                      givenBottom: cloneJson(group.variant.givenSkeleton.presence === 'provided'
                        ? group.variant.givenSkeleton.parts.filter((part) => part.placement === 'answer_region_bottom')
                        : []),
                    },
                    anchors: {
                      contentNodeIds: contentIdentityLists(group.content).contentNodeIds,
                      requirementIds: group.variant.contentRequirements.map((requirement) => requirement.requirementId),
                      givenPartIds: group.variant.givenSkeleton.presence === 'provided'
                        ? group.variant.givenSkeleton.parts.map((part) => part.givenPartId)
                        : [],
                      responseSlotId: slot.slotId,
                    },
                  }),
            }
          : {}
        const continuationWriting = group.variant.family === 'continuation-writing'
          ? {
              paperChrome: {
                part: {
                  partId: part.partId,
                  ...projectProfileInstruction(
                    profile,
                    part.titleInstructionRef,
                  ),
                },
                section: {
                  sectionId: section.sectionId,
                  ...projectProfileInstruction(
                    profile,
                    section.titleInstructionRef,
                  ),
                },
                instructions: slot.instructionRefs.map((instructionId) =>
                  projectSlotInstruction(profile, instructionId, group)),
              },
              writingTaskId: group.variant.writingTaskId,
              ...(group.variant.mode === 'legacy_opaque'
                ? {
                    writingMode: 'legacy_opaque',
                    sourceTaskType: group.variant.sourceTaskType,
                    sourceBlocks: group.variant.contentBlockRefs.map((blockId) => cloneJson(group.content.blocks.find((block) => block.nodeId === blockId))),
                    sourceStarterBlockRefs: cloneJson(group.variant.sourceStarterBlockRefs),
                    wordCountTarget: group.variant.wordCountTarget,
                    wordCountTargetCertainty: group.variant.wordCountTargetCertainty,
                    wordCountScope: group.variant.wordCountScope,
                    answerRegion: {
                      answerRegionRef: group.variant.response.answerRegionRef,
                      responseSlotId: slot.slotId,
                      ownership: group.variant.response.ownership,
                    },
                    anchors: {
                      contentNodeIds: contentIdentityLists(group.content).contentNodeIds,
                      responseSlotId: slot.slotId,
                    },
                  }
                : {
                    ...(group.variant.sourceInstruction
                      ? {
                          sourceInstruction: cloneJson(
                            group.variant.sourceInstruction,
                          ),
                        }
                      : {}),
                    material: {
                      blocks: group.variant.materialBlockRefs.map((blockId) => cloneJson(group.content.blocks.find((block) => block.nodeId === blockId))),
                    },
                    wordCountRuling: cloneJson(group.variant.wordCountRuling),
                    answerRegion: {
                      answerRegionRef: group.variant.response.answerRegionRef,
                      responseSlotId: slot.slotId,
                      starterLines: cloneJson(group.variant.starterProvision.kind === 'ordered_source_starters'
                        ? group.variant.starterProvision.starters
                        : []),
                    },
                    anchors: {
                      contentNodeIds: contentIdentityLists(group.content).contentNodeIds,
                      starterIds: group.variant.starterProvision.kind === 'ordered_source_starters'
                        ? group.variant.starterProvision.starters.map((starter) => starter.starterId)
                        : [],
                      responseSlotId: slot.slotId,
                    },
                  }),
            }
          : {}
        nodes.push({
          kind: 'group',
          slotId: slot.slotId,
          groupId: group.identity.groupId,
          familyContractId: group.contractRef.familyContractId,
          numbering: numberingByGroup.get(group.identity.groupId) || [],
          blanks: group.blankRefs.map((blank, index) => {
            const promptBinding = group.variant?.promptBindings?.find(
              (binding) => binding?.blankId === blank.blankId,
            )
            return {
              blankId: blank.blankId,
              questionId: group.questionRefs[index]?.questionId,
              ...(
                group.contractRef.familyContractId === 'grammar-fill'
                && Number(group.contractRef.familyContractVersion) >= 2
                  ? {
                      prompt:
                        promptBinding?.provision === 'source_prompt'
                          ? promptBinding.prompt
                          : null,
                    }
                  : {}
              ),
            }
          }),
          scoringRuleRef: slot.slotId,
          content: cloneJson(group.content),
          media: cloneJson(group.media),
          choices: cloneJson(group.variant.choiceOwnership),
          ...cloneJson(sevenChoices),
          ...cloneJson(reading),
          ...cloneJson(listening),
          ...cloneJson(applicationWriting),
          ...cloneJson(continuationWriting),
        })
        nodes.push({ kind: 'answer_region', answerRegionId: slot.answerRegionRef, groupId: group.identity.groupId })
      }
    }
  }
  return Object.freeze({ paperId: plan.paperId, nodes: Object.freeze(nodes) })
}
