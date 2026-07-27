import { exactKeys, isRecordValue } from './stable.mjs'

function issue(code, disposition, path, message) {
  return { code, disposition, path, message }
}

function contentIndex(content) {
  const blocks = new Map()
  const inlineIdsByBlock = new Map()
  for (const block of content?.blocks || []) {
    blocks.set(block?.nodeId, block)
    inlineIdsByBlock.set(block?.nodeId, (block?.inlines || []).map((inline) => inline?.nodeId))
  }
  return { blocks, inlineIdsByBlock }
}

function contentRefIssues(ref, path, promptBlockIds, index) {
  if (
    !isRecordValue(ref)
    || !exactKeys(ref, ['blockId', 'inlineNodeIds'])
    || typeof ref.blockId !== 'string'
    || !Array.isArray(ref.inlineNodeIds)
    || ref.inlineNodeIds.length === 0
    || new Set(ref.inlineNodeIds).size !== ref.inlineNodeIds.length
  ) {
    return [issue('APPLICATION_CONTENT_REF_INVALID', 'incomplete_source', path, 'Application semantic refs require one prompt block and ordered inline identities')]
  }
  const inlineIds = index.inlineIdsByBlock.get(ref.blockId)
  if (
    !promptBlockIds.has(ref.blockId)
    || !inlineIds
    || ref.inlineNodeIds.some((inlineId) => !inlineIds.includes(inlineId))
    || ref.inlineNodeIds.some((inlineId, position) => position > 0 && inlineIds.indexOf(inlineId) <= inlineIds.indexOf(ref.inlineNodeIds[position - 1]))
  ) {
    return [issue('APPLICATION_CONTENT_REF_UNRESOLVED', 'incomplete_source', path, 'Application semantic refs must resolve in source order inside the complete prompt')]
  }
  return []
}

function observationById(sourceCapture, observationId) {
  return sourceCapture?.observations?.find((observation) => observation.observationId === observationId)
}

function contentRefText(ref, index) {
  const block = index.blocks.get(ref?.blockId)
  const selected = new Set(ref?.inlineNodeIds || [])
  return (block?.inlines || []).filter((inline) => selected.has(inline.nodeId)).map((inline) => inline.text || '').join('')
}

export function validateApplicationWritingContract({
  groupId,
  questionIds,
  blankIds,
  content,
  variant,
  sourceCapture,
}) {
  const issues = []
  if ((questionIds || []).length > 0 || (blankIds || []).length > 0) {
    issues.push(issue('APPLICATION_MEMBER_CARDINALITY_INVALID', 'needs_review', '$.groups', 'Application Writing has zero Questions and zero Blanks'))
  }
  if (
    !isRecordValue(variant)
    || !exactKeys(variant, [
      'family',
      'writingTaskId',
      'promptBlockRefs',
      'situation',
      'contentRequirements',
      'wordCountRuling',
      'givenSkeleton',
      'choiceOwnership',
      'response',
    ])
    || variant.family !== 'application-writing'
    || typeof variant.writingTaskId !== 'string'
    || variant.writingTaskId.length === 0
  ) {
    return [issue('APPLICATION_VARIANT_INVALID', 'needs_review', '$.variant', 'Application Writing variant fields and Writing Task identity are closed')]
  }

  const index = contentIndex(content)
  const promptBlockRefs = variant.promptBlockRefs
  if (
    !Array.isArray(promptBlockRefs)
    || promptBlockRefs.length === 0
    || promptBlockRefs.some((blockId) => typeof blockId !== 'string' || !index.blocks.has(blockId))
  ) {
    issues.push(issue('APPLICATION_PROMPT_INCOMPLETE', 'incomplete_source', '$.variant.promptBlockRefs', 'Application Writing needs one complete source-backed prompt stream'))
  } else if (new Set(promptBlockRefs).size !== promptBlockRefs.length) {
    issues.push(issue('APPLICATION_PROMPT_ORDER_AMBIGUOUS', 'needs_review', '$.variant.promptBlockRefs', 'Prompt blocks must occur exactly once in source order'))
  }
  const promptBlockIds = new Set(promptBlockRefs || [])
  const sourcePromptOrder = (content?.blocks || []).map((block) => block?.nodeId).filter((blockId) => promptBlockIds.has(blockId))
  if (Array.isArray(promptBlockRefs) && promptBlockRefs.join('\u0000') !== sourcePromptOrder.join('\u0000')) {
    issues.push(issue('APPLICATION_PROMPT_ORDER_AMBIGUOUS', 'needs_review', '$.variant.promptBlockRefs', 'Prompt block refs must retain source order'))
  }

  if (!isRecordValue(variant.situation) || !exactKeys(variant.situation, ['writerRole', 'audienceOrDestination', 'deliverable', 'communicativePurpose'])) {
    issues.push(issue('APPLICATION_SITUATION_INCOMPLETE', 'incomplete_source', '$.variant.situation', 'Application Writing requires all communicative-situation roles'))
  } else {
    for (const key of ['writerRole', 'audienceOrDestination', 'deliverable', 'communicativePurpose']) {
      issues.push(...contentRefIssues(variant.situation[key], `$.variant.situation.${key}`, promptBlockIds, index))
    }
  }

  const requirements = variant.contentRequirements
  if (!Array.isArray(requirements) || requirements.length === 0) {
    issues.push(issue('APPLICATION_REQUIREMENTS_INCOMPLETE', 'incomplete_source', '$.variant.contentRequirements', 'Application Writing needs ordered source-backed content requirements'))
  } else {
    const requirementIds = new Set()
    for (const [position, requirement] of requirements.entries()) {
      const path = `$.variant.contentRequirements[${position}]`
      if (
        !isRecordValue(requirement)
        || !exactKeys(requirement, ['requirementId', 'contentRef'])
        || typeof requirement.requirementId !== 'string'
        || requirementIds.has(requirement.requirementId)
      ) {
        issues.push(issue('APPLICATION_REQUIREMENT_IDENTITY_AMBIGUOUS', 'needs_review', path, 'Content requirements need unique stable identities in source order'))
        continue
      }
      requirementIds.add(requirement.requirementId)
      issues.push(...contentRefIssues(requirement.contentRef, `${path}.contentRef`, promptBlockIds, index))
    }
  }

  const ruling = variant.wordCountRuling
  if (!isRecordValue(ruling) || !exactKeys(ruling, ['kind', 'target', 'countScope', 'sourceRef', 'authorityObservationRef'])) {
    issues.push(issue('APPLICATION_WORD_RULING_INCOMPLETE', 'incomplete_source', '$.variant.wordCountRuling', 'Application Writing requires one exact source-backed word-count ruling'))
  } else if (ruling.kind !== 'approximate_target' || ruling.countScope !== 'student_authored_only') {
    issues.push(issue('APPLICATION_WORD_RULING_UNSUPPORTED', 'unsupported', '$.variant.wordCountRuling', 'Only an approximate student-authored-only word target is representable'))
  } else {
    if (!Number.isInteger(ruling.target) || ruling.target < 1) issues.push(issue('APPLICATION_WORD_RULING_AMBIGUOUS', 'needs_review', '$.variant.wordCountRuling.target', 'Word-count target must be one positive source value'))
    issues.push(...contentRefIssues(ruling.sourceRef, '$.variant.wordCountRuling.sourceRef', promptBlockIds, index))
    const observation = observationById(sourceCapture, ruling.authorityObservationRef)
    if (
      typeof ruling.authorityObservationRef !== 'string'
      || !observation
      || observation.kind !== 'application_word_count_ruling'
      || observation.value?.groupId !== groupId
    ) {
      issues.push(issue('APPLICATION_WORD_RULING_UNPROVEN', 'incomplete_source', '$.variant.wordCountRuling', 'Word-count semantics require one reviewed source observation'))
    } else if (observation.value?.target !== ruling.target || observation.value?.countScope !== ruling.countScope) {
      issues.push(issue('APPLICATION_WORD_RULING_CONFLICT', 'needs_review', '$.variant.wordCountRuling', 'Canonical and reviewed source word-count rulings conflict'))
    }
    if (!contentRefText(ruling.sourceRef, index).includes(String(ruling.target))) {
      issues.push(issue('APPLICATION_WORD_RULING_UNPROVEN', 'incomplete_source', '$.variant.wordCountRuling.sourceRef', 'The prompt source range does not contain the word-count target'))
    }
  }

  const skeleton = variant.givenSkeleton
  const givenBlockIds = []
  if (!isRecordValue(skeleton) || !['none', 'provided'].includes(skeleton.presence)) {
    issues.push(issue('APPLICATION_GIVEN_SKELETON_INCOMPLETE', 'incomplete_source', '$.variant.givenSkeleton', 'Given Skeleton needs affirmative absence or source-provided parts'))
  } else if (skeleton.presence === 'none') {
    if (!exactKeys(skeleton, ['presence', 'answerRegionAbsenceAssertionRef']) || typeof skeleton.answerRegionAbsenceAssertionRef !== 'string') {
      issues.push(issue('APPLICATION_GIVEN_ABSENCE_UNPROVEN', 'incomplete_source', '$.variant.givenSkeleton', 'An absent Given Skeleton requires affirmative answer-region evidence'))
    } else {
      const observation = observationById(sourceCapture, skeleton.answerRegionAbsenceAssertionRef)
      if (
        observation?.kind !== 'application_answer_region_absence'
        || observation.value?.groupId !== groupId
        || observation.value?.answerRegionRef !== 'writing.application-box'
      ) {
        issues.push(issue('APPLICATION_GIVEN_ABSENCE_UNPROVEN', 'incomplete_source', '$.variant.givenSkeleton', 'Genre or missing parsed fields do not prove an empty answer region'))
      }
    }
  } else if (!exactKeys(skeleton, ['presence', 'parts']) || !Array.isArray(skeleton.parts) || skeleton.parts.length === 0) {
    issues.push(issue('APPLICATION_GIVEN_PARTS_INCOMPLETE', 'incomplete_source', '$.variant.givenSkeleton.parts', 'A provided Given Skeleton needs ordered source parts'))
  } else {
    const roleOrder = new Map(['title', 'salutation', 'opening', 'closing', 'signature'].map((role, indexValue) => [role, indexValue]))
    const givenPartIds = new Set()
    let previousRole = -1
    for (const [position, part] of skeleton.parts.entries()) {
      const path = `$.variant.givenSkeleton.parts[${position}]`
      if (isRecordValue(part) && typeof part.role === 'string' && !roleOrder.has(part.role)) {
        issues.push(issue('APPLICATION_GIVEN_ROLE_UNSUPPORTED', 'unsupported', path, 'The source Given Skeleton role is not representable in v1'))
        continue
      }
      const expectedPlacement = ['title', 'salutation', 'opening'].includes(part?.role) ? 'answer_region_top' : 'answer_region_bottom'
      const observation = observationById(sourceCapture, part?.authorityAssertionRef)
      if (
        !isRecordValue(part)
        || !exactKeys(part, ['givenPartId', 'role', 'placement', 'blockRef', 'authorityAssertionRef'])
        || typeof part.givenPartId !== 'string'
        || givenPartIds.has(part.givenPartId)
        || !roleOrder.has(part.role)
        || part.placement !== expectedPlacement
        || typeof part.blockRef !== 'string'
        || !index.blocks.has(part.blockRef)
        || index.blocks.get(part.blockRef)?.kind !== 'paragraph'
        || promptBlockIds.has(part.blockRef)
      ) {
        issues.push(issue('APPLICATION_GIVEN_PART_INVALID', 'needs_review', path, 'Given parts require unique source-backed identities, roles, placement, and fixed-text blocks'))
        continue
      }
      if (roleOrder.get(part.role) < previousRole) issues.push(issue('APPLICATION_GIVEN_PART_ORDER_AMBIGUOUS', 'needs_review', path, 'Given parts must retain title-to-signature source order'))
      previousRole = roleOrder.get(part.role)
      if (
        observation?.kind !== 'application_given_part'
        || observation.value?.groupId !== groupId
        || observation.value?.givenPartId !== part.givenPartId
        || observation.value?.role !== part.role
        || observation.value?.placement !== part.placement
        || observation.value?.blockRef !== part.blockRef
      ) {
        issues.push(issue('APPLICATION_GIVEN_PART_UNPROVEN', 'incomplete_source', path, 'Every fixed-text part needs affirmative source authority'))
      }
      givenPartIds.add(part.givenPartId)
      givenBlockIds.push(part.blockRef)
    }
    if (new Set(givenBlockIds).size !== givenBlockIds.length) issues.push(issue('APPLICATION_GIVEN_TEXT_DUPLICATE', 'needs_review', '$.variant.givenSkeleton.parts', 'Fixed-text blocks must be owned exactly once'))
  }

  const ownedBlocks = [...promptBlockIds, ...givenBlockIds]
  if (ownedBlocks.length !== index.blocks.size || new Set(ownedBlocks).size !== index.blocks.size) {
    issues.push(issue('APPLICATION_CONTENT_OWNERSHIP_INCOMPLETE', 'needs_review', '$.content.blocks', 'Prompt and fixed-text blocks must each be owned exactly once'))
  }
  const sourceGivenOrder = (content?.blocks || []).map((block) => block?.nodeId).filter((blockId) => !promptBlockIds.has(blockId))
  if (givenBlockIds.join('\u0000') !== sourceGivenOrder.join('\u0000')) {
    issues.push(issue('APPLICATION_GIVEN_PART_ORDER_AMBIGUOUS', 'needs_review', '$.variant.givenSkeleton.parts', 'Given parts must retain their fixed-text source order'))
  }
  if (!isRecordValue(variant.choiceOwnership) || !exactKeys(variant.choiceOwnership, ['ownership']) || variant.choiceOwnership.ownership !== 'none') {
    issues.push(issue('APPLICATION_CHOICES_FORBIDDEN', 'needs_review', '$.variant.choiceOwnership', 'Application Writing owns no choices'))
  }
  if (
    !isRecordValue(variant.response)
    || !exactKeys(variant.response, ['kind', 'answerRegionRef', 'authorityObservationRef'])
    || variant.response.kind !== 'group_level_written_response'
    || variant.response.answerRegionRef !== 'writing.application-box'
  ) {
    issues.push(issue('APPLICATION_RESPONSE_BINDING_INVALID', 'needs_review', '$.variant.response', 'Application Writing binds one Profile answer region'))
  } else {
    const responseObservation = observationById(sourceCapture, variant.response.authorityObservationRef)
    if (
      responseObservation?.kind !== 'application_response_binding'
      || responseObservation.value?.groupId !== groupId
      || responseObservation.value?.writingTaskId !== variant.writingTaskId
      || responseObservation.value?.answerRegionRef !== variant.response.answerRegionRef
    ) {
      issues.push(issue('APPLICATION_RESPONSE_BINDING_UNPROVEN', 'incomplete_source', '$.variant.response', 'The response binding requires one reviewed source observation'))
    }
  }
  return issues
}
