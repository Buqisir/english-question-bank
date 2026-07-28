import { canonicalAuthorityRef } from '../../shared/paper-canonical/compiler.mjs'
import { resolveCanonicalAuthority, slotsForProfile } from '../../shared/paper-canonical/authority.mjs'
import { digestJson, sha256 } from '../../shared/paper-canonical/stable.mjs'

export function makeNck1ProfileInstructionEvidenceDocuments(paperId) {
  const profile =
    resolveCanonicalAuthority(canonicalAuthorityRef).closure.profiles.get(
      'nck1',
    )
  const instructionSourceBytes = new TextEncoder().encode(
    '%PDF-1.4\n% EQB canonical fixture instruction source\n',
  )
  const instructionEvidence = {
    schemaVersion: 'profile-writing-source-evidence-v1',
    paperId,
    profileId: 'nck1',
    sourceDocumentDigest: sha256(instructionSourceBytes),
    review: {
      method: 'manual_source_transcription',
      status: 'accepted',
    },
    sourceLocation: {
      kind: 'pdf_page_region',
      page: 1,
      region: { x: 0, y: 0, width: 1, height: 1 },
      locator: 'Synthetic protocol fixture instruction source',
    },
    instruction: profile.instructions['writing.continuation.prompt'],
    transformationRecord: {
      recordId:
        `transformation:${paperId}:continuation-instruction`,
      ruleId: 'source-exact-transcription',
      ruleVersion: '1',
      certainty: 'exact',
      before: 'Synthetic instruction before correction.',
      after: profile.instructions['writing.continuation.prompt'].text,
      proof: 'Synthetic protocol fixture exact transcription proof.',
    },
  }
  return [
    {
      inputKey: 'profile_instruction_source',
      roles: ['question_source', 'source_provenance'],
      bytes: instructionSourceBytes,
      declared: { mediaType: 'application/pdf' },
    },
    {
      inputKey: 'continuation_writing_instruction_evidence',
      roles: ['structured_source', 'source_provenance'],
      bytes: new TextEncoder().encode(JSON.stringify(instructionEvidence)),
      declared: {
        mediaType:
          'application/vnd.eqb.profile-writing-source-evidence+json',
      },
    },
  ]
}

function option(label) {
  return { optionId: `option:${label}`, label, content: [{ kind: 'text', nodeId: `text:${label}`, text: label }] }
}

function choiceOwnership(family, questionIds, groupId) {
  if (family === 'seven-choices') return { ownership: 'shared_bank', bankId: `bank:${groupId}`, options: 'ABCDEFG'.split('').map(option) }
  if (family === 'reading') {
    return {
      ownership: 'per_question',
      sets: questionIds.map((questionId) => ({
        questionId,
        options: 'ABCD'.split('').map((label) => ({
          optionId: `option:${questionId}:${label}`,
          label,
          content: [{ kind: 'text', nodeId: `text:${questionId}:option:${label}`, text: label }],
        })),
      })),
    }
  }
  if (family === 'cloze') return { ownership: 'per_question', sets: questionIds.map((questionId) => ({ questionId, options: 'ABCD'.split('').map(option) })) }
  return { ownership: 'none' }
}

function variant(family, questionIds, blankIds, groupId) {
  const value = { family, choiceOwnership: choiceOwnership(family, questionIds, groupId) }
  if (family === 'application-writing') {
    const blockId = `paragraph:${groupId}:prompt`
    const inlineNodeIds = [`text:${groupId}:prompt`]
    const contentRef = { blockId, inlineNodeIds }
    const wordObservationId = `observation:${groupId}:word-count`
    const responseObservationId = `observation:${groupId}:response`
    return {
      family,
      writingTaskId: `writing-task:${groupId}`,
      promptBlockRefs: [blockId],
      situation: {
        writerRole: contentRef,
        audienceOrDestination: contentRef,
        deliverable: contentRef,
        communicativePurpose: contentRef,
      },
      contentRequirements: [{ requirementId: `requirement:${groupId}:1`, contentRef }],
      wordCountRuling: {
        kind: 'approximate_target',
        target: 80,
        countScope: 'student_authored_only',
        sourceRef: contentRef,
        authorityObservationRef: wordObservationId,
      },
      givenSkeleton: {
        presence: 'none',
        answerRegionAbsenceAssertionRef: `observation:${groupId}:answer-region-empty`,
      },
      choiceOwnership: value.choiceOwnership,
      response: {
        kind: 'group_level_written_response',
        answerRegionRef: 'writing.application-box',
        authorityObservationRef: responseObservationId,
      },
    }
  }
  if (family === 'continuation-writing') {
    const materialBlockId = `paragraph:${groupId}:material`
    const starterBlockIds = [1, 2].map((index) => `paragraph:${groupId}:starter:${index}`)
    return {
      family,
      writingTaskId: `writing-task:${groupId}`,
      materialBlockRefs: [materialBlockId],
      wordCountRuling: {
        kind: 'approximate_target',
        target: 150,
        countScope: 'student_authored_only',
        sourceRef: { blockId: materialBlockId, inlineNodeIds: [`text:${groupId}:material`] },
        authorityObservationRef: `observation:${groupId}:word-count`,
      },
      starterProvision: {
        kind: 'ordered_source_starters',
        starters: starterBlockIds.map((contentRef, index) => ({
          starterId: `starter:${groupId}:${index + 1}`,
          contentRef,
          authorityObservationRef: `observation:${groupId}:starter:${index + 1}`,
        })),
      },
      choiceOwnership: value.choiceOwnership,
      response: {
        kind: 'group_level_written_response',
        answerRegionRef: 'writing.continuation-box',
        authorityObservationRef: `observation:${groupId}:response`,
      },
    }
  }
  if (family === 'reading') {
    return {
      family,
      passageBlockRoles: [],
      questions: questionIds.map((questionId) => ({
        questionId,
        stem: [{ kind: 'text', nodeId: `text:${questionId}:stem`, text: `Stem ${questionId}` }],
        correctOptionId: `option:${questionId}:A`,
      })),
      choiceOwnership: value.choiceOwnership,
    }
  }
  if (family !== 'seven-choices') return value
  return {
    ...value,
    members: questionIds.map((questionId, index) => ({
      questionId,
      blankId: blankIds[index],
      answer: {
        optionId: 'option:A',
        authorityAssertionRef: `answer:${questionId}`,
      },
    })),
  }
}

function referenceBlankContent(family, blankIds) {
  if (family === 'application-writing') {
    return {
      blocks: [{
        kind: 'paragraph',
        nodeId: 'paragraph:group:writing.application:prompt',
        inlines: [{
          kind: 'text',
          nodeId: 'text:group:writing.application:prompt',
          text: 'Write a source-backed response of about 80 words.',
        }],
      }],
    }
  }
  if (family === 'continuation-writing') {
    return {
      blocks: [
        {
          kind: 'paragraph',
          nodeId: 'paragraph:group:writing.continuation:material',
          inlines: [{ kind: 'text', nodeId: 'text:group:writing.continuation:material', text: 'Source-backed continuation material.' }],
        },
        ...[1, 2].map((index) => ({
          kind: 'paragraph',
          nodeId: `paragraph:group:writing.continuation:starter:${index}`,
          inlines: [{ kind: 'text', nodeId: `text:group:writing.continuation:starter:${index}`, text: `Source starter ${index}.` }],
        })),
      ],
    }
  }
  if (family === 'reading') {
    return {
      blocks: [{
        kind: 'paragraph',
        nodeId: 'paragraph:reading:fixture',
        inlines: [{ kind: 'text', nodeId: 'text:reading:fixture', text: 'Canonical-only Reading passage.' }],
      }],
    }
  }
  if (!['cloze', 'grammar-fill', 'seven-choices'].includes(family)) return { blocks: [] }
  return {
    blocks: [{
      kind: 'paragraph',
      nodeId: `paragraph:${family}:fixture`,
      inlines: blankIds.map((blankId, index) => ({
        kind: 'blank_ref',
        nodeId: `blank-ref:${family}:${index + 1}`,
        blankId,
      })),
    }],
  }
}

export function makeReadyCanonicalFixture() {
  const closure = resolveCanonicalAuthority(canonicalAuthorityRef).closure
  const profile = closure.profiles.get('nck1')
  const observations = []
  const groups = []
  const assertions = []
  const transformations = []
  const inactiveSlots = {}
  const inactiveSourceClosures = []
  for (const slot of slotsForProfile(profile)) {
    const observationId = `observation:${slot.slotId}`
    observations.push({ observationId, kind: 'fixture_section', documentInputKey: 'questions', value: slot.slotId, span: { start: 0, end: 1 } })
    const sourceSpanId = `source-span:${observationId}`
    if (slot.activation === 'inactive_source') {
      const recordId = `record:${slot.slotId}:inactive-closure`
      transformations.push({
        recordId,
        sequence: transformations.length + 1,
        ruleId: 'direct-projection',
        ruleVersion: '2',
        target: {
          identity: slot.slotId,
          path: `inactive_slot:${slot.slotId}`,
        },
        operation: 'direct_projection',
        inputSourceSpanIds: [sourceSpanId],
        before: slot.slotId,
        after: slot.slotId,
        certainty: 'exact',
        preconditions: {
          sourceObservationIds: [observationId],
          sourceValueDigests: [digestJson(slot.slotId)],
        },
        outputDigest: digestJson(slot.slotId),
      })
      inactiveSlots[slot.slotId] = [sourceSpanId]
      const closureBase = {
        scopeId: `inactive-source-closure:paper-canonical-fixture:${slot.slotId}`,
        slotId: slot.slotId,
        contractRef: structuredClone(slot.sourceClosureContractRef),
        status: 'closed',
        sourceSliceRefs: [sourceSpanId],
        questionCount: slot.questionRule.cardinality,
        optionLabels: [...slot.questionRule.optionLabels],
        officialAnswerCount: slot.questionRule.cardinality,
        transcriptSegmentCount: slot.transcriptRule.segmentCardinality,
        transcriptCoverage: 'exactly_once',
        timing: { disposition: 'not_supplied' },
        audio: { disposition: 'not_supplied' },
        sourceMap: {
          entries: [{
            target: {
              kind: 'inactive_slot',
              id: slot.slotId,
            },
            sourceSpanRefs: [sourceSpanId],
            transformationRecordIds: [recordId],
          }],
        },
        transformationRecordIds: [recordId],
      }
      inactiveSourceClosures.push({
        ...closureBase,
        closureDigest: digestJson(closureBase),
      })
      continue
    }
    const questionIds = Array.from({ length: slot.questionCardinality.count }, (_, index) => `question:${slot.slotId}:${index + 1}`)
    const blankIds = ['grammar-fill', 'cloze', 'seven-choices'].includes(slot.familyContractRef.id)
      ? questionIds.map((_, index) => `blank:${slot.slotId}:${index + 1}`)
      : []
    groups.push({
      groupId: `group:${slot.slotId}`,
      slotId: slot.slotId,
      family: slot.familyContractRef.id,
      questionIds,
      blankIds,
      sourceSpanId,
      content: referenceBlankContent(slot.familyContractRef.id, blankIds),
      media: [],
      variant: variant(slot.familyContractRef.id, questionIds, blankIds, `group:${slot.slotId}`),
    })
    if (slot.familyContractRef.id === 'application-writing') {
      const groupId = `group:${slot.slotId}`
      observations.push(
        {
          observationId: `observation:${groupId}:answer-region-empty`,
          kind: 'application_answer_region_absence',
          documentInputKey: 'questions',
          value: {
            groupId,
            answerRegionRef: 'writing.application-box',
          },
          span: { start: 0, end: 1 },
        },
        {
          observationId: `observation:${groupId}:word-count`,
          kind: 'application_word_count_ruling',
          documentInputKey: 'questions',
          value: {
            groupId,
            target: 80,
            countScope: 'student_authored_only',
          },
          span: { start: 0, end: 1 },
        },
        {
          observationId: `observation:${groupId}:response`,
          kind: 'application_response_binding',
          documentInputKey: 'questions',
          value: {
            groupId,
            writingTaskId: `writing-task:${groupId}`,
            answerRegionRef: 'writing.application-box',
          },
          span: { start: 0, end: 1 },
        },
      )
    }
    if (slot.familyContractRef.id === 'continuation-writing') {
      const groupId = `group:${slot.slotId}`
      observations.push(
        {
          observationId: `observation:${groupId}:word-count`,
          kind: 'continuation_word_count_ruling',
          documentInputKey: 'questions',
          value: { groupId, target: 150, countScope: 'student_authored_only' },
          span: { start: 0, end: 1 },
        },
        ...[1, 2].map((index) => ({
          observationId: `observation:${groupId}:starter:${index}`,
          kind: 'continuation_source_starter',
          documentInputKey: 'questions',
          value: {
            groupId,
            starterId: `starter:${groupId}:${index}`,
            contentRef: `paragraph:${groupId}:starter:${index}`,
          },
          span: { start: 0, end: 1 },
        })),
        {
          observationId: `observation:${groupId}:response`,
          kind: 'continuation_response_binding',
          documentInputKey: 'questions',
          value: {
            groupId,
            writingTaskId: `writing-task:${groupId}`,
            answerRegionRef: 'writing.continuation-box',
          },
          span: { start: 0, end: 1 },
        },
      )
    }
    for (const questionId of questionIds) assertions.push({ assertionId: `answer:${questionId}`, questionId, answer: 'A', authority: 'official', sourceSpanId })
  }
  const source = {
    paperId: 'paper-canonical-fixture',
    profileId: 'nck1',
    sourceAssetVersion: 1,
    profileInstructionSourceDigest: sha256(
      new TextEncoder().encode(
        '%PDF-1.4\n% EQB canonical fixture instruction source\n',
      ),
    ),
    observations,
    assertions,
    groups,
    transformations,
    inactiveSlots,
    inactiveSourceClosures,
  }
  for (let pass = 0; pass < 3; pass++) {
    const byteLength = new TextEncoder().encode(JSON.stringify(source)).byteLength
    for (const observation of observations) observation.span.end = byteLength
  }
  const bytes = new TextEncoder().encode(JSON.stringify(source))
  const instructionEvidenceDocuments =
    makeNck1ProfileInstructionEvidenceDocuments(source.paperId)
  return {
    source,
    request: {
      authority: canonicalAuthorityRef,
      evidence: {
        documents: [
          {
            inputKey: 'questions',
            roles: ['question_source', 'official_answer_source'],
            bytes,
            declared: {
              mediaType: 'application/vnd.eqb.canonical-fixture+json',
            },
          },
          ...instructionEvidenceDocuments,
        ],
      },
    },
    sourceAsset: bytes,
  }
}
