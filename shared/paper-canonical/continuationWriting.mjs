import { exactKeys, isRecordValue } from './stable.mjs'

function issue(code, disposition, path, message) {
  return { code, disposition, path, message }
}

function blockIds(content) {
  return new Set((content?.blocks || []).map((block) => block?.nodeId).filter((id) => typeof id === 'string'))
}

function observationById(sourceCapture, observationId) {
  return (sourceCapture?.observations || []).filter((observation) => observation.observationId === observationId)
}

function contentRefResolves(sourceRef, content) {
  const block = (content?.blocks || []).find((candidate) => candidate.nodeId === sourceRef?.blockId)
  if (!block || !Array.isArray(sourceRef?.inlineNodeIds) || sourceRef.inlineNodeIds.length === 0) return false
  const inlineIds = new Set((block.inlines || []).map((inline) => inline.nodeId))
  return sourceRef.inlineNodeIds.every((nodeId) => inlineIds.has(nodeId))
}

function exactObservation(sourceCapture, observationId, kind, expectedValue) {
  const matches = observationById(sourceCapture, observationId)
  if (matches.length !== 1 || matches[0].kind !== kind || !isRecordValue(matches[0].value)) return false
  return Object.entries(expectedValue).every(([key, value]) => matches[0].value[key] === value)
}

function validateOpaqueContinuationWritingContract({
  questionIds,
  blankIds,
  content,
  variant,
}) {
  if (
    questionIds.length !== 0
    || blankIds.length !== 0
    || !isRecordValue(variant)
    || !exactKeys(variant, ['family', 'mode', 'writingTaskId', 'sourceTaskType', 'contentBlockRefs', 'sourceStarterBlockRefs', 'wordCountTarget', 'wordCountTargetCertainty', 'wordCountScope', 'choiceOwnership', 'response'])
    || variant.family !== 'continuation-writing'
    || variant.mode !== 'legacy_opaque'
    || typeof variant.writingTaskId !== 'string'
    || variant.writingTaskId.length === 0
    || variant.sourceTaskType !== 'continuation'
    || !Array.isArray(variant.contentBlockRefs)
    || variant.contentBlockRefs.length === 0
    || !Array.isArray(variant.sourceStarterBlockRefs)
    || new Set(variant.sourceStarterBlockRefs).size !== variant.sourceStarterBlockRefs.length
    || !Number.isInteger(variant.wordCountTarget)
    || variant.wordCountTarget < 1
    || variant.wordCountTargetCertainty !== 'explicit_legacy_field'
    || variant.wordCountScope !== 'unspecified'
    || !isRecordValue(variant.choiceOwnership)
    || !exactKeys(variant.choiceOwnership, ['ownership'])
    || variant.choiceOwnership.ownership !== 'none'
    || !isRecordValue(variant.response)
    || !exactKeys(variant.response, ['kind', 'answerRegionRef', 'ownership'])
    || variant.response.kind !== 'generic_response_box'
    || variant.response.answerRegionRef !== 'writing.continuation-box'
    || variant.response.ownership !== 'product'
  ) {
    return [issue('CONTINUATION_VARIANT_INVALID', 'needs_review', '$.variant', 'Opaque legacy Continuation Writing must preserve source content without inferred response semantics')]
  }
  const contentBlockRefs = (content?.blocks || []).map((block) => block?.nodeId)
  if (
    new Set(contentBlockRefs).size !== contentBlockRefs.length
    || variant.contentBlockRefs.length !== contentBlockRefs.length
    || variant.contentBlockRefs.some((blockId, index) => blockId !== contentBlockRefs[index])
    || variant.sourceStarterBlockRefs.some((blockId) => !contentBlockRefs.includes(blockId))
    || variant.sourceStarterBlockRefs.some(
      (blockId, index) => contentBlockRefs.indexOf(blockId)
        < (index === 0 ? 0 : contentBlockRefs.indexOf(variant.sourceStarterBlockRefs[index - 1])),
    )
  ) {
    return [issue('CONTINUATION_CONTENT_OWNERSHIP_INCOMPLETE', 'needs_review', '$.content.blocks', 'Opaque legacy Continuation Writing must retain one complete ordered source block stream')]
  }
  return []
}

export function validateContinuationWritingContract({
  groupId,
  profileId,
  questionIds,
  blankIds,
  content,
  variant,
  sourceCapture,
}) {
  const issues = []
  if (questionIds.length !== 0 || blankIds.length !== 0) {
    issues.push(issue('CONTINUATION_MEMBER_CARDINALITY_INVALID', 'needs_review', '$.groups', 'Continuation Writing owns zero Questions, Blanks, and Options'))
  }
  if (variant?.mode === 'legacy_opaque') {
    return validateOpaqueContinuationWritingContract({
      questionIds,
      blankIds,
      content,
      variant,
    })
  }
  const hasSourceInstruction = Object.hasOwn(variant || {}, 'sourceInstruction')
  if (
    !isRecordValue(variant)
    || !exactKeys(variant, [
      'family',
      'writingTaskId',
      ...(hasSourceInstruction ? ['sourceInstruction'] : []),
      'materialBlockRefs',
      'wordCountRuling',
      'starterProvision',
      'choiceOwnership',
      'response',
    ])
    || variant.family !== 'continuation-writing'
    || typeof variant.writingTaskId !== 'string'
    || variant.writingTaskId.length === 0
  ) {
    return [issue('CONTINUATION_VARIANT_INVALID', 'needs_review', '$.variant', 'Continuation Writing variant fields and Writing Task identity are closed')]
  }

  if (hasSourceInstruction) {
    const instruction = variant.sourceInstruction
    const instructionObservations = observationById(
      sourceCapture,
      instruction?.authorityObservationRef,
    )
    const evidence = instructionObservations[0]?.value
    if (
      !isRecordValue(instruction)
      || !exactKeys(instruction, [
        'instructionId',
        'placement',
        'text',
        'authorityObservationRef',
      ])
      || instruction.instructionId !== 'writing.continuation.prompt'
      || instruction.placement !== 'group_instruction'
      || typeof instruction.text !== 'string'
      || instruction.text.length === 0
      || instructionObservations.length !== 1
      || instructionObservations[0].kind !== 'profile_instruction_correction'
      || evidence?.instruction?.instructionId !== instruction.instructionId
      || evidence?.instruction?.placement !== instruction.placement
      || evidence?.transformationRecord?.before !== instruction.text
    ) {
      issues.push(issue(
        'CONTINUATION_SOURCE_INSTRUCTION_UNPROVEN',
        'incomplete_source',
        '$.variant.sourceInstruction',
        'Source-exact continuation instruction text must bind one reviewed Profile instruction observation',
      ))
    }
  }

  const blocks = blockIds(content)
  const materialRefs = variant.materialBlockRefs
  if (!Array.isArray(materialRefs) || materialRefs.length === 0 || new Set(materialRefs).size !== materialRefs.length || materialRefs.some((blockId) => !blocks.has(blockId))) {
    issues.push(issue('CONTINUATION_MATERIAL_INCOMPLETE', 'incomplete_source', '$.variant.materialBlockRefs', 'Continuation material needs a complete ordered source-backed block stream'))
  }

  const ruling = variant.wordCountRuling
  if (
    !isRecordValue(ruling)
    || !exactKeys(ruling, ['kind', 'target', 'countScope', 'sourceRef', 'authorityObservationRef'])
    || ruling.kind !== 'approximate_target'
    || ruling.target !== 150
    || ruling.countScope !== 'student_authored_only'
    || !isRecordValue(ruling.sourceRef)
    || !exactKeys(ruling.sourceRef, ['blockId', 'inlineNodeIds'])
    || !contentRefResolves(ruling.sourceRef, content)
  ) {
    issues.push(issue('CONTINUATION_WORD_RULING_UNSUPPORTED', 'unsupported', '$.variant.wordCountRuling', 'V1 requires one source-backed approximate 150-word student-authored-only ruling'))
  } else {
    const wordObservations = observationById(sourceCapture, ruling.authorityObservationRef)
    if (wordObservations.length !== 1 || wordObservations[0].kind !== 'continuation_word_count_ruling') {
      issues.push(issue('CONTINUATION_WORD_RULING_UNPROVEN', 'incomplete_source', '$.variant.wordCountRuling', 'Word-count semantics require one reviewed source observation'))
    } else if (
      wordObservations[0].value?.groupId !== groupId
      || wordObservations[0].value?.target !== 150
      || wordObservations[0].value?.countScope !== 'student_authored_only'
    ) {
      issues.push(issue('CONTINUATION_WORD_RULING_CONFLICT', 'needs_review', '$.variant.wordCountRuling', 'Canonical and reviewed source word-count rulings conflict'))
    }
  }

  if (!isRecordValue(variant.choiceOwnership) || !exactKeys(variant.choiceOwnership, ['ownership']) || variant.choiceOwnership.ownership !== 'none') {
    issues.push(issue('CONTINUATION_CHOICES_FORBIDDEN', 'needs_review', '$.variant.choiceOwnership', 'Continuation Writing owns no choices'))
  }
  const response = variant.response
  if (
    !isRecordValue(response)
    || !exactKeys(response, ['kind', 'answerRegionRef', 'authorityObservationRef'])
    || response.kind !== 'group_level_written_response'
    || response.answerRegionRef !== 'writing.continuation-box'
  ) {
    issues.push(issue('CONTINUATION_RESPONSE_BINDING_INVALID', 'needs_review', '$.variant.response', 'Continuation Writing binds one Profile answer region'))
  } else if (!exactObservation(sourceCapture, response.authorityObservationRef, 'continuation_response_binding', {
    groupId,
    writingTaskId: variant.writingTaskId,
    answerRegionRef: 'writing.continuation-box',
  })) {
    issues.push(issue('CONTINUATION_RESPONSE_BINDING_UNPROVEN', 'incomplete_source', '$.variant.response', 'The response binding requires one reviewed source observation'))
  }

  const provision = variant.starterProvision
  let starterBlockRefs = []
  if (!isRecordValue(provision) || !['ordered_source_starters', 'source_proven_none'].includes(provision.kind)) {
    issues.push(issue('CONTINUATION_STARTER_PROVISION_INVALID', 'incomplete_source', '$.variant.starterProvision', 'Starter provision must select one exact source contract'))
  } else if (provision.kind === 'ordered_source_starters') {
    if (!exactKeys(provision, ['kind', 'starters']) || !Array.isArray(provision.starters)) {
      issues.push(issue('CONTINUATION_STARTERS_INCOMPLETE', 'incomplete_source', '$.variant.starterProvision', 'The two-starter contract requires reviewed starter evidence'))
    } else if (provision.starters.length === 3) {
      issues.push(issue('CONTINUATION_STARTER_BOUNDARY_AMBIGUOUS', 'needs_review', '$.variant.starterProvision.starters', 'Three entries can mix source starters with response-like supplement content and may not be sliced'))
    } else if (provision.starters.length !== 2 || profileId !== 'nck1') {
      issues.push(issue('CONTINUATION_PROFILE_CARDINALITY_UNSUPPORTED', 'unsupported', '$.variant.starterProvision.starters', 'The selected Profile and starter cardinality do not match the two-starter contract'))
    } else {
      const starterIds = new Set()
      const blockRefs = new Set()
      for (const [index, starter] of provision.starters.entries()) {
        const path = `$.variant.starterProvision.starters[${index}]`
        if (
          !isRecordValue(starter)
          || !exactKeys(starter, ['starterId', 'contentRef', 'authorityObservationRef'])
          || typeof starter.starterId !== 'string'
          || typeof starter.contentRef !== 'string'
          || !blocks.has(starter.contentRef)
          || starterIds.has(starter.starterId)
          || blockRefs.has(starter.contentRef)
        ) {
          issues.push(issue('CONTINUATION_STARTER_INVALID', 'needs_review', path, 'Each starter needs one unique source-backed identity and content block'))
          continue
        }
        starterIds.add(starter.starterId)
        blockRefs.add(starter.contentRef)
        if (!exactObservation(sourceCapture, starter.authorityObservationRef, 'continuation_source_starter', {
          groupId,
          starterId: starter.starterId,
          contentRef: starter.contentRef,
        })) {
          issues.push(issue('CONTINUATION_STARTER_UNPROVEN', 'incomplete_source', path, 'Every fixed starter requires one reviewed source observation'))
        }
      }
      starterBlockRefs = [...blockRefs]
    }
  } else if (!exactKeys(provision, ['kind', 'absenceAssertionRef']) || profileId !== 'zhejiang-legacy') {
    issues.push(issue('CONTINUATION_PROFILE_CARDINALITY_UNSUPPORTED', 'unsupported', '$.variant.starterProvision', 'Plot-led zero-starter semantics require the compatible Zhejiang Profile'))
  } else if (!exactObservation(sourceCapture, provision.absenceAssertionRef, 'continuation_starter_absence', {
    groupId,
    answerRegionRef: 'writing.continuation-box',
  })) {
    issues.push(issue('CONTINUATION_STARTER_ABSENCE_UNPROVEN', 'incomplete_source', '$.variant.starterProvision', 'An empty starter shape needs affirmative reviewed source closure'))
  }

  if (starterBlockRefs.some((blockId) => materialRefs?.includes(blockId))) {
    issues.push(issue('CONTINUATION_BOUNDARY_AMBIGUOUS', 'needs_review', '$.variant', 'Material and fixed starter blocks must be structurally disjoint'))
  }
  const ownedBlockIds = [...(materialRefs || []), ...starterBlockRefs]
  if (new Set(ownedBlockIds).size !== ownedBlockIds.length || ownedBlockIds.length !== blocks.size || ownedBlockIds.some((blockId) => !blocks.has(blockId))) {
    issues.push(issue('CONTINUATION_CONTENT_OWNERSHIP_INCOMPLETE', 'needs_review', '$.content.blocks', 'Material and starters must own every content block exactly once'))
  }
  return issues
}
